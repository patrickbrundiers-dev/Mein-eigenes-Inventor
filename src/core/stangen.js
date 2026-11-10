// Stangenoptimierung (Erweiterung E1): Teile der Zuschnittliste auf Lagerstangen verteilen.
// Je Profil und Werkstoff eine Gruppe; nutzbar ist die Stange minus Endbeschnitt und Greiferrest (wie die
// Fertigungsprüfung, src/core/dfm.js). Zwischen zwei Teilen liegt die Schnittfuge.
//
// Verfahren: »Best Fit Decreasing« – Teile absteigend nach Länge, jedes in die Stange mit dem kleinsten Rest,
// in die es noch passt, sonst neue Stange. Schnell und in der Praxis nahe am Optimum; kein Optimum garantiert.

export const BAR_RULES = [
  "Stangenlänge = Lagerlänge (Einstellung, Standard 6000 mm), je Profil in der Zuschnittliste änderbar.",
  "Nutzbar = Stangenlänge − Endbeschnitt − Greiferrest (Einstellungen „Rohrlaser und Fertigung“).",
  "Zwischen zwei Teilen auf einer Stange liegt die Schnittfuge; nach dem letzten Teil nicht.",
  "Verteilung: längste Teile zuerst, jedes in die Stange mit dem kleinsten passenden Rest (Best Fit Decreasing).",
  "Verschnitt = alles, was von den gekauften Stangen nicht in Teilen steckt (Endbeschnitt, Greiferrest, Fugen, Reste).",
  "Teile länger als nutzbar stehen unter „passt nicht“ und zählen nicht mit.",
  "Reststücklager (Z1): passende Reste gleichen Profils und Werkstoffs werden vor neuen Stangen belegt (kürzester passender Rest zuerst); nutzbar ist auch dort Restlänge − Endbeschnitt − Greiferrest. Reste zählen nicht als Einkauf.",
  "Neue Reste: was nach dem letzten Teil übrig bleibt (Stange − Endbeschnitt − Teile − Fugen), ab der Mindestlänge des Restlagers.",
];

const r1 = (x) => Math.round(x * 10) / 10;

/**
 * Stangenplan. rows: Zeilen der Zuschnittliste ({pos, profileId, material, length, qty, kgm}).
 * opts: { stock, trim (Endbeschnitt), rest (Greiferrest), kerf (Schnittfuge), stockBy: {profileId: Länge},
 *   remnants: [{ id, profileId, material, length }] (Reststücklager, werden zuerst belegt) }.
 * Stangen aus dem Restlager tragen remnant: { id, length } und stock = Restlänge.
 * Rückgabe { groups: [{profileId, material, kgm, stock, usable, bars: [{pieces: [{pos, length}], used, rest}],
 *   pieces, partLength, waste, wastePct, wasteKg, buyKg, tooLong: [{pos, length, qty}]}], bars, buyKg, wasteKg }.
 */
export function planBars(rows, { stock = 6000, trim = 0, rest = 0, kerf = 0, stockBy = {}, remnants = [] } = {}) {
  const map = new Map();
  for (const r of rows) {
    const key = r.profileId + "|" + r.material;
    const g = map.get(key) || { profileId: r.profileId, material: r.material, kgm: r.kgm, items: [] };
    for (let k = 0; k < r.qty; k++) g.items.push({ pos: r.pos, length: r.length });
    map.set(key, g);
  }
  const groups = [];
  for (const g of map.values()) {
    const S = Number(stockBy[g.profileId]) > 0 ? Number(stockBy[g.profileId]) : stock;
    const usable = Math.max(0, S - trim - rest);
    const items = g.items.sort((a, b) => b.length - a.length || a.pos - b.pos);
    const bars = [], tooLong = new Map();
    // Reste dieses Profils und Werkstoffs, kürzeste zuerst (lange Reste bleiben für lange Teile)
    const pool = (remnants || []).filter((x) => x && x.profileId === g.profileId && (x.material || "") === (g.material || "") && Number(x.length) > 0)
      .map((x) => ({ id: x.id, length: Number(x.length), usable: Math.max(0, Number(x.length) - trim - rest) })).sort((a, b) => a.length - b.length);
    for (const it of items) {
      // erst offene Stangen/Reste mit dem kleinsten passenden Rest, dann ein noch unbenutzter Rest, dann neue Stange
      let best = null, bestLeft = Infinity;
      for (const b of bars) {
        const left = b.usable - b.used - (it.length + kerf);
        if (left > -1e-6 && left < bestLeft) { best = b; bestLeft = left; }
      }
      if (best) { best.pieces.push(it); best.used += kerf + it.length; continue; }
      const ri = pool.findIndex((x) => x.usable >= it.length - 1e-6);
      if (ri >= 0) {
        const x = pool.splice(ri, 1)[0];
        bars.push({ pieces: [it], used: it.length, usable: x.usable, stock: x.length, remnant: { id: x.id, length: x.length } });
        continue;
      }
      if (it.length > usable + 1e-6) {
        const t = tooLong.get(it.pos) || { pos: it.pos, length: it.length, qty: 0 };
        t.qty++;
        tooLong.set(it.pos, t);
        continue;
      }
      bars.push({ pieces: [it], used: it.length, usable, stock: S });
    }
    for (const b of bars) {
      b.rest = r1(b.usable - b.used);
      // was physisch übrig bleibt: Stange − Endbeschnitt − Teile − Fuge vor dem Rest
      b.leftover = r1(Math.max(0, b.stock - trim - b.used - kerf));
    }
    const partLength = bars.reduce((s, b) => s + b.pieces.reduce((a, p) => a + p.length, 0), 0);
    const newBars = bars.filter((b) => !b.remnant);
    const buy = newBars.length * S;
    const fromStock = bars.filter((b) => b.remnant).reduce((s, b) => s + b.stock, 0);
    const waste = buy + fromStock - partLength;
    groups.push({
      profileId: g.profileId, material: g.material, kgm: g.kgm, stock: S, usable, bars,
      pieces: bars.reduce((s, b) => s + b.pieces.length, 0), partLength, waste,
      buyBars: newBars.length, remnantsUsed: bars.filter((b) => b.remnant).map((b) => b.remnant.id),
      wastePct: buy + fromStock > 0 ? (100 * waste) / (buy + fromStock) : 0, wasteKg: (waste / 1000) * (g.kgm || 0), buyKg: (buy / 1000) * (g.kgm || 0),
      tooLong: [...tooLong.values()],
    });
  }
  groups.sort((a, b) => a.profileId.localeCompare(b.profileId));
  return { groups, bars: groups.reduce((s, g) => s + g.bars.length, 0), buyBars: groups.reduce((s, g) => s + g.buyBars, 0), remnantsUsed: groups.flatMap((g) => g.remnantsUsed), buyKg: groups.reduce((s, g) => s + g.buyKg, 0), wasteKg: groups.reduce((s, g) => s + g.wasteKg, 0) };
}

/** Belegung einer Stange als Text: »2 × 1200 (Pos 3) + 800 (Pos 5)«, gleiche Teile zusammengefasst */
export function barText(bar) {
  const runs = [];
  for (const p of bar.pieces) {
    const last = runs[runs.length - 1];
    if (last && last.pos === p.pos) last.n++;
    else runs.push({ pos: p.pos, length: p.length, n: 1 });
  }
  return runs.map((x) => `${x.n > 1 ? x.n + " × " : ""}${String(r1(x.length)).replace(".", ",")} (Pos ${x.pos})`).join(" + ");
}

/** Einstellungen → Optionen für planBars (Reste aus dem Restlager, wenn »Reste zuerst« an ist) */
export function barOptions(get) {
  const useRest = get("fertigung.resteNutzen") !== false;
  return { stock: get("fertigung.lagerlaenge") || 6000, trim: get("fertigung.endbeschnitt") || 0, rest: get("fertigung.greiferrest") || 0, kerf: get("fertigung.schnittfuge") || 0, stockBy: get("fertigung.stangenJeProfil") || {}, remnants: useRest ? get("fertigung.restlager") || [] : [] };
}

// ---------------------------------------------------------------------------------------------------------------
// Reststücklager (Z1): Reste aus dem Stangenplan merken und beim nächsten Plan zuerst verwenden.
// Ein Rest: { id, profileId, material, length (mm, physisch), from (Auftrag/Projekt), date (JJJJ-MM-TT), place (Lagerplatz) }

let restSeq = 0;
const restId = () => "R" + Date.now().toString(36).slice(-5).toUpperCase() + (restSeq++ % 36).toString(36).toUpperCase();

/** Neue Reste aus einem Stangenplan: Restlänge ab minLength je Stange (auch von belegten Resten) */
export function newRemnants(plan, { minLength = 500, from = "", date = new Date().toISOString().slice(0, 10), id = restId } = {}) {
  const out = [];
  for (const g of plan?.groups || []) for (const b of g.bars) {
    if (b.leftover >= minLength - 1e-6) out.push({ id: id(), profileId: g.profileId, material: g.material || "", length: Math.floor(b.leftover), from, date });
  }
  return out;
}

/**
 * Restlager nach einem Stangenplan buchen: belegte Reste entnehmen, neue Reste ablegen.
 * Rückgabe { stock (neue Liste), taken: [Rest], added: [Rest] }
 */
export function bookRemnants(stock, plan, opts = {}) {
  const used = new Set(plan?.remnantsUsed || []);
  const taken = (stock || []).filter((x) => used.has(x.id));
  const added = newRemnants(plan, opts);
  return { stock: [...(stock || []).filter((x) => !used.has(x.id)), ...added], taken, added };
}

/** Restlager geordnet: Profil, dann Länge absteigend */
export const sortRemnants = (list) => [...(list || [])].sort((a, b) => a.profileId.localeCompare(b.profileId) || (a.material || "").localeCompare(b.material || "") || b.length - a.length);

/** Prüfen und bereinigen (für die Einstellungen): Liste von Resten, höchstens 2000 */
export function validateRemnants(v) {
  if (!Array.isArray(v)) return { ok: false, error: "Liste von Resten erwartet" };
  if (v.length > 2000) return { ok: false, error: "Höchstens 2000 Reste" };
  const out = [], ids = new Set();
  const txt = (t, n) => typeof t === "string" && t.length <= n && !/[\u0000-\u001f]/.test(t);
  for (const x of v) {
    const n = Number(x?.length);
    if (!x || !txt(x.id, 40) || !x.id || ids.has(x.id)) return { ok: false, error: "Rest ohne eindeutige Nummer" };
    if (!txt(x.profileId, 60) || !x.profileId.trim()) return { ok: false, error: `Rest ${x.id}: Profil fehlt` };
    if (!(n >= 1 && n <= 30000)) return { ok: false, error: `Rest ${x.id}: Länge 1 … 30000 mm` };
    if ([x.material, x.from, x.date, x.place].some((t) => t !== undefined && !txt(t, 80))) return { ok: false, error: `Rest ${x.id}: ungültige Angabe` };
    ids.add(x.id);
    out.push({ id: x.id, profileId: x.profileId.trim(), material: x.material || "", length: Math.round(n), from: x.from || "", date: x.date || "", place: x.place || "" });
  }
  return { ok: true, value: out };
}

/** Restliste als HTML-Seite (A4) für mappeHtml */
export function remnantPage(list, { title = "Restlager" } = {}) {
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rows = sortRemnants(list).map((x) => `<tr><td>${esc(x.id)}</td><td>${esc(x.profileId)}</td><td>${esc(x.material)}</td><td class="n">${Math.round(x.length)}</td><td>${esc(x.place)}</td><td>${esc(x.from)}</td><td>${esc(x.date)}</td><td>☐</td></tr>`).join("");
  const sum = (list || []).reduce((s, x) => s + x.length, 0);
  return { html: `<div class="lst"><h1>${esc(title)}</h1><div class="sub">${(list || []).length} Reste · ${String(Math.round(sum / 100) / 10).replace(".", ",")} m · Stand ${new Date().toLocaleDateString("de-DE")}</div>
<table><thead><tr><th>Nr</th><th>Profil</th><th>Werkstoff</th><th>Länge mm</th><th>Lagerplatz</th><th>Herkunft</th><th>Datum</th><th>da</th></tr></thead><tbody>${rows}</tbody></table></div>`, width: 210, height: 297 };
}
