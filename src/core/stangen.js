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
];

const r1 = (x) => Math.round(x * 10) / 10;

/**
 * Stangenplan. rows: Zeilen der Zuschnittliste ({pos, profileId, material, length, qty, kgm}).
 * opts: { stock, trim (Endbeschnitt), rest (Greiferrest), kerf (Schnittfuge), stockBy: {profileId: Länge} }.
 * Rückgabe { groups: [{profileId, material, kgm, stock, usable, bars: [{pieces: [{pos, length}], used, rest}],
 *   pieces, partLength, waste, wastePct, wasteKg, buyKg, tooLong: [{pos, length, qty}]}], bars, buyKg, wasteKg }.
 */
export function planBars(rows, { stock = 6000, trim = 0, rest = 0, kerf = 0, stockBy = {} } = {}) {
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
    for (const it of items) {
      if (it.length > usable + 1e-6) {
        const t = tooLong.get(it.pos) || { pos: it.pos, length: it.length, qty: 0 };
        t.qty++;
        tooLong.set(it.pos, t);
        continue;
      }
      let best = null, bestLeft = Infinity;
      for (const b of bars) {
        const need = it.length + kerf;
        const left = usable - b.used - need;
        if (left > -1e-6 && left < bestLeft) { best = b; bestLeft = left; }
      }
      if (best) { best.pieces.push(it); best.used += kerf + it.length; } else bars.push({ pieces: [it], used: it.length });
    }
    for (const b of bars) b.rest = r1(usable - b.used);
    const partLength = bars.reduce((s, b) => s + b.pieces.reduce((a, p) => a + p.length, 0), 0);
    const buy = bars.length * S;
    const waste = buy - partLength;
    groups.push({
      profileId: g.profileId, material: g.material, kgm: g.kgm, stock: S, usable, bars,
      pieces: bars.reduce((s, b) => s + b.pieces.length, 0), partLength, waste,
      wastePct: buy > 0 ? (100 * waste) / buy : 0, wasteKg: (waste / 1000) * (g.kgm || 0), buyKg: (buy / 1000) * (g.kgm || 0),
      tooLong: [...tooLong.values()],
    });
  }
  groups.sort((a, b) => a.profileId.localeCompare(b.profileId));
  return { groups, bars: groups.reduce((s, g) => s + g.bars.length, 0), buyKg: groups.reduce((s, g) => s + g.buyKg, 0), wasteKg: groups.reduce((s, g) => s + g.wasteKg, 0) };
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

/** Einstellungen → Optionen für planBars */
export function barOptions(get) {
  return { stock: get("fertigung.lagerlaenge") || 6000, trim: get("fertigung.endbeschnitt") || 0, rest: get("fertigung.greiferrest") || 0, kerf: get("fertigung.schnittfuge") || 0, stockBy: get("fertigung.stangenJeProfil") || {} };
}
