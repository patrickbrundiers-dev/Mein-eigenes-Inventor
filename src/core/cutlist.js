// Zuschnittliste: Profil-Zuschnitte gruppieren, Enden beschreiben, CSV für die Rohrlaser-Kalkulation.
// Rein fachlich (ohne Oberfläche), damit die Regeln getestet und offengelegt werden können.
import { MATERIALS } from "./sections.js";
import { fmt as fmtNum } from "./expr.js";

/** Verwendete Regeln – stehen im Zuschnittlisten-Dialog und in docs/ */
export const CUT_RULES = [
  "Zuschnittlänge = größte Ausdehnung des Profils entlang seiner Achse (Außenmaß, Spitze zu Spitze bei Gehrung), auf 0,1 mm gerundet.",
  "Gehrung = Winkel der Schnittebene zur Senkrechten auf die Achse (0° = gerader Schnitt).",
  "Knickrahmen: eine Zeile in Abwicklungslänge (gerades Rohr vor dem Biegen, inkl. Biegezugabe).",
  "Gleiches Profil, gleiche Länge, gleiche Enden und gleicher Werkstoff = eine Zeile mit Anzahl. Keine Verschnitt-Optimierung.",
  "Masse aus dem Volumen des Körpers (mit Ausklinkungen und Bohrungen) und der Werkstoffdichte.",
];

/** Zuschnitte gruppieren: gleiches Profil + Länge + Gehrungen = eine Zeile */
export function cutListRows(sources) {
  const map = new Map();
  for (const { part, result, qty } of sources) {
    for (const b of result.bodies) {
      if (b.kind !== "member" || !b.meta) continue;
      const m = b.meta;
      const L = Math.round(m.length * 10) / 10;
      const ends = [m.miterStart || 0, m.miterEnd || 0].map((x) => Math.round(x * 10) / 10).sort((a, c) => a - c);
      const pid = m.profileId || m.section;
      const key = [pid, L, ends.join("/"), m.coped ? "A" : "", m.butt ? "S" : "", part.material].join("|");
      const dens = MATERIALS[part.material]?.density || 7.85;
      const row = map.get(key) || { section: m.section, profileId: pid, length: L, miters: ends, coped: !!m.coped, butt: !!m.butt, material: MATERIALS[part.material]?.label || part.material, qty: 0, kgm: (m.area * dens) / 1000, mass: b.props?.volume ? (b.props.volume * dens) / 1e6 : (m.area * L * dens) / 1e6, parts: new Set() };
      row.qty += qty;
      row.parts.add(part.name);
      map.set(key, row);
    }
  }
  return [...map.values()].sort((a, b) => a.profileId.localeCompare(b.profileId) || b.length - a.length).map((r, i) => ({ ...r, pos: i + 1, parts: [...r.parts].join(", ") }));
}
/** Enden einer Zuschnitt-Zeile als Text: "45°/45°", "gerade", "ausgeklinkt" */
export function endsText(r) {
  const m = r.miters.some((x) => x) ? r.miters.map((x) => fmtNum(x, 1) + "°").join("/") : "gerade";
  return m + (r.coped ? ", ausgeklinkt" : "");
}
export function cutListCsv(rows) {
  const head = ["Pos", "Profil-ID", "Profil", "Zuschnittlänge mm", "Menge", "Gehrung Anfang °", "Gehrung Ende °", "Ausgeklinkt", "kg/m", "kg/Stk", "kg gesamt", "Werkstoff", "Bauteil"];
  const lines = rows.map((r) => [r.pos, r.profileId, r.section, num(r.length, 1), r.qty, num(r.miters[0], 1), num(r.miters[1], 1), r.coped ? "ja" : "nein", num(r.kgm, 3), num(r.mass, 3), num(r.mass * r.qty, 3), r.material, r.parts]);
  return csv([head, ...lines]);
}

const num = (v, d) => (Number.isFinite(v) ? fmtNum(v, d).replace(/\./g, "") : "");
function csv(rows) {
  const esc = (v) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return "\ufeff" + rows.map((r) => r.map(esc).join(";")).join("\r\n") + "\r\n";
}
