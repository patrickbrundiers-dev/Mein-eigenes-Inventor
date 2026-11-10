// Lade- und Montageliste (Z3): Teile einer Baugruppe nach Bauabschnitt bzw. Montagestelle gruppiert, je Abschnitt
// Gewicht des Pakets und die Verbindungsmittel (Schrauben, Muttern, Scheiben, Dübel/Anker), die dort gebraucht werden.
// Reine Rechnung und Texterzeugung (HTML-Seiten für mappeHtml); den Abschnitt trägt die Komponente (c.abschnitt).

import { fmt as fmtNum } from "./expr.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const A4 = [210, 297];
export const NO_SECTION = "ohne Abschnitt";

/** Art eines Verbindungsmittels aus der Normbezeichnung (für die Sortierung und die Spalte »Art«) */
export function fastenerKind(name) {
  const s = String(name || "").toLowerCase();
  if (/dübel|anker|injektion|ankerstange|bolzenanker|hilti|fischer|fhb|fis/.test(s)) return "Dübel/Anker";
  if (/mutter|iso 4032|iso 4035|iso 7040|din 934|din 985|din 1587/.test(s)) return "Mutter";
  if (/scheibe|iso 7089|iso 7090|iso 7093|din 125|din 9021|din 7349/.test(s)) return "Scheibe";
  if (/schraube|iso 4017|iso 4014|iso 4762|iso 7380|iso 10642|din 933|din 931|din 912|din 7991|din 603|gewindestange|din 976/.test(s)) return "Schraube";
  return "Sonstiges";
}
const KIND_ORDER = ["Dübel/Anker", "Schraube", "Mutter", "Scheibe", "Sonstiges"];

/**
 * Abschnitte bilden. comps: [{ abschnitt, rows: Stücklistenzeilen dieser Komponente (bomRows) }],
 * posOf(row) → Positionsnummer in der ganzen Baugruppe (oder null).
 * Rückgabe [{ name, parts: [{ pos, name, number, qty, mass }], fasteners: [{ name, kind, qty }], mass, count }],
 * Abschnitte in der Reihenfolge des ersten Auftretens, »ohne Abschnitt« zuletzt.
 */
export function ladeAbschnitte(comps, posOf = (r) => r.pos ?? null) {
  const map = new Map();
  for (const c of comps || []) {
    const key = String(c.abschnitt || "").trim() || NO_SECTION;
    const g = map.get(key) || { name: key, parts: new Map(), fasteners: new Map() };
    for (const r of c.rows || []) {
      if (r.norm) {
        const f = g.fasteners.get(r.name) || { name: r.name, kind: fastenerKind(r.name), qty: 0, mass: r.mass };
        f.qty += r.qty;
        g.fasteners.set(r.name, f);
        continue;
      }
      const pos = posOf(r);
      const k = pos ?? r.name;
      const p = g.parts.get(k) || { pos, name: r.name, number: r.number || "", qty: 0, mass: r.mass };
      p.qty += r.qty;
      g.parts.set(k, p);
    }
    map.set(key, g);
  }
  const out = [...map.values()].map((g) => {
    const parts = [...g.parts.values()].sort((a, b) => (a.pos ?? 1e9) - (b.pos ?? 1e9) || a.name.localeCompare(b.name));
    const fasteners = [...g.fasteners.values()].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name, "de", { numeric: true }));
    const mass = [...parts, ...fasteners].reduce((s, x) => s + (Number.isFinite(x.mass) ? x.mass * x.qty : 0), 0);
    return { name: g.name, parts, fasteners, mass, count: parts.reduce((s, x) => s + x.qty, 0) };
  });
  return out.sort((a, b) => (a.name === NO_SECTION) - (b.name === NO_SECTION));
}

/** Seiten (A4 hoch): Übersicht aller Abschnitte, danach je Abschnitt Teile und Verbindungsmittel zum Abhaken */
export function ladePages(sections, { title = "", number = "", order = "", customer = "", date = new Date().toLocaleDateString("de-DE") } = {}) {
  const sub = esc([title, number, order && "Auftrag " + order, customer && "Kunde: " + customer, date].filter(Boolean).join(" · "));
  const total = sections.reduce((s, g) => s + g.mass, 0);
  const pages = [];
  const overview = `<div class="lst"><h1>Lade- und Montageliste</h1><div class="sub">${sub}</div>
<table><thead><tr><th>Abschnitt / Montagestelle</th><th>Teile</th><th>Verbindungsmittel</th><th>kg</th><th>geladen</th></tr></thead><tbody>${sections
    .map((g) => `<tr><td>${esc(g.name)}</td><td class="n">${g.count}</td><td class="n">${g.fasteners.reduce((s, f) => s + f.qty, 0)}</td><td class="n">${fmtNum(g.mass, 1)}</td><td>☐</td></tr>`).join("")}</tbody>
<tfoot><tr><td>Summe</td><td class="n">${sections.reduce((s, g) => s + g.count, 0)}</td><td class="n">${sections.reduce((s, g) => s + g.fasteners.reduce((a, f) => a + f.qty, 0), 0)}</td><td class="n">${fmtNum(total, 1)}</td><td></td></tr></tfoot></table>
<p style="margin-top:8mm">Je Abschnitt folgt eine Seite mit den Teilen und den Schrauben, Dübeln und Scheiben für diese Stelle.</p></div>`;
  pages.push({ html: overview, width: A4[0], height: A4[1] });
  for (const g of sections) {
    const parts = g.parts.map((p) => `<tr><td class="n">${esc(p.pos ?? "")}</td><td>${esc(p.name)}</td><td>${esc(p.number)}</td><td class="n">${p.qty}</td><td class="n">${fmtNum(p.mass, 1)}</td><td class="n">${fmtNum(p.mass * p.qty, 1)}</td><td>☐</td><td>☐</td></tr>`).join("");
    const fast = g.fasteners.length
      ? `<h2>Verbindungsmittel</h2><table><thead><tr><th>Art</th><th>Bezeichnung</th><th>Menge</th><th>eingepackt</th></tr></thead><tbody>${g.fasteners.map((f) => `<tr><td>${esc(f.kind)}</td><td>${esc(f.name)}</td><td class="n">${f.qty}</td><td>☐</td></tr>`).join("")}</tbody></table>`
      : `<h2>Verbindungsmittel</h2><p>Keine Normteile in diesem Abschnitt modelliert – Schrauben und Dübel bitte von Hand ergänzen.</p>`;
    pages.push({ html: `<div class="lst"><h1>${esc(g.name)}</h1><div class="sub">${sub} · Paket ${fmtNum(g.mass, 1)} kg</div>
<table><thead><tr><th>Pos</th><th>Benennung</th><th>Teilenummer</th><th>Menge</th><th>kg/Stk</th><th>kg</th><th>geladen</th><th>montiert</th></tr></thead><tbody>${parts}</tbody>
<tfoot><tr><td></td><td>Summe</td><td></td><td class="n">${g.count}</td><td></td><td class="n">${fmtNum(g.mass, 1)}</td><td></td><td></td></tr></tfoot></table>${fast}
<p style="margin-top:10mm">Montiert: ______________________ &nbsp; Datum: __________</p></div>`, width: A4[0], height: A4[1] });
  }
  return pages;
}

/** CSV (Semikolon) für Tabellenkalkulation: Abschnitt; Art; Pos; Benennung; Menge; kg */
export function ladeCsv(sections) {
  const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = ["Abschnitt;Art;Pos;Benennung;Teilenummer;Menge;kg"];
  for (const g of sections) {
    for (const p of g.parts) lines.push([q(g.name), "Teil", p.pos ?? "", q(p.name), q(p.number), p.qty, fmtNum(p.mass * p.qty, 2)].join(";"));
    for (const f of g.fasteners) lines.push([q(g.name), q(f.kind), "", q(f.name), "", f.qty, Number.isFinite(f.mass) ? fmtNum(f.mass * f.qty, 2) : ""].join(";"));
  }
  return lines.join("\r\n") + "\r\n";
}
