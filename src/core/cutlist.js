// Zuschnittliste: Profil-Zuschnitte gruppieren, Enden beschreiben, CSV für die Rohrlaser-Kalkulation.
// Rein fachlich (ohne Oberfläche), damit die Regeln getestet und offengelegt werden können.
import { MATERIALS, kgPerMeter } from "./sections.js";
import { fmt as fmtNum } from "./expr.js";

/** Verwendete Regeln – stehen im Zuschnittlisten-Dialog und in docs/ */
export const CUT_RULES = [
  "Zuschnittlänge = größte Ausdehnung des Profils entlang seiner Achse (Außenmaß, Spitze zu Spitze bei Gehrung), auf 0,1 mm gerundet.",
  "Gehrung = Winkel der Schnittebene zur Senkrechten auf die Achse (0° = gerader Schnitt); „(3D)“ = Kopf geschwenkt, sonst 2D (Strahl senkrecht zur Oberfläche).",
  "Gehrung in zwei Ebenen (räumliche Ecke): Gesamtwinkel wie oben, dazu Anteil über die Breite und über die Höhe des Profils (Kennzeichen »2 Ebenen« in der Liste; CSV-Spalten bleiben für den Rohrlaser-Import gleich, die Schnittfläche liefert der STEP).",
  "Biegerohr: eine Zeile in Abwicklungslänge (Geraden + Bögen auf der Mittellinie), Biegeliste im Bauteil.",
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
      const parts2 = twoPlaneParts(m.miterParts);
      const key = [pid, L, ends.join("/"), parts2 ? JSON.stringify(parts2) : "", m.coped ? "A" : "", m.butt ? "S" : "", m.cutSig || "", m.endCuts ? m.endCuts.A + m.endCuts.B : "", m.bends ? JSON.stringify(m.bends.map((b) => [b.straight, b.rotation, b.angle].map((x) => Math.round(x * 10) / 10))) : "", part.material].join("|");
      const dens = MATERIALS[part.material]?.density || 7.85;
      const row = map.get(key) || { section: m.section, profileId: pid, length: L, miters: ends, miterParts: parts2, coped: !!m.coped, butt: !!m.butt, material: MATERIALS[part.material]?.label || part.material, d3: !!m.endCuts && (m.endCuts.A === "3D" || m.endCuts.B === "3D"), contours: m.contours && m.tube ? { items: m.contours, prof: m.tube } : null, bent: m.bends ? { count: m.bends.length, radius: m.bendRadius } : null, knick: m.knicks ? { legs: m.legs || [], inPlane: m.inPlane, wall: m.wall } : null, qty: 0, kgm: kgPerMeter(m.area, dens), mass: b.props?.volume ? (b.props.volume * dens) / 1e6 : (m.area * L * dens) / 1e6, parts: new Set() };
      row.qty += qty;
      row.parts.add(part.name);
      map.set(key, row);
    }
  }
  return [...map.values()].sort((a, b) => a.profileId.localeCompare(b.profileId) || b.length - a.length).map((r, i) => ({ ...r, pos: i + 1, parts: [...r.parts].join(", ") }));
}
/**
 * Summen je Profil und Werkstoff (Stück, Gesamtlänge, Gewicht) für Bestellung und Lager.
 * Rückgabe {groups: [{profileId, material, kgm, qty, length, mass}], qty, length, mass}; Länge in mm, Masse in kg.
 */
export function cutListTotals(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.profileId + "|" + r.material;
    const g = map.get(key) || { profileId: r.profileId, material: r.material, kgm: r.kgm, qty: 0, length: 0, mass: 0 };
    g.qty += r.qty;
    g.length += r.length * r.qty;
    g.mass += r.mass * r.qty;
    map.set(key, g);
  }
  const groups = [...map.values()];
  return { groups, qty: groups.reduce((a, g) => a + g.qty, 0), length: groups.reduce((a, g) => a + g.length, 0), mass: groups.reduce((a, g) => a + g.mass, 0) };
}
/**
 * Anteile Breite/Höhe je Ende, nur wenn mindestens ein Ende in zwei Ebenen geschnitten ist (sonst null).
 * Reihenfolge wie die Gehrungen der Zeile (kleinerer Gesamtwinkel zuerst), damit gleiche Teile gleich aussehen.
 */
export function twoPlaneParts(mp) {
  if (!mp) return null;
  const ends = [mp.A || { b: 0, h: 0 }, mp.B || { b: 0, h: 0 }].map((p) => ({ b: Math.abs(p.b), h: Math.abs(p.h) }));
  if (!ends.some((p) => p.b > 0.05 && p.h > 0.05)) return null;
  const tot = (p) => Math.atan(Math.hypot(Math.tan((p.b * Math.PI) / 180), Math.tan((p.h * Math.PI) / 180)));
  return ends.sort((a, c) => tot(a) - tot(c) || a.b - c.b);
}
/** Anteile als Text: "Ende B: 41,8° Breite / 24,1° Höhe" (leer bei Gehrung in einer Ebene) */
export function partsText(r) {
  if (!r.miterParts) return "";
  return r.miterParts.map((p, i) => (p.b || p.h ? `Ende ${"AB"[i]}: ${fmtNum(p.b, 1)}° Breite / ${fmtNum(p.h, 1)}° Höhe` : "")).filter(Boolean).join(", ");
}
/** Enden einer Zuschnitt-Zeile als Text: "45°/45°", "gerade", "ausgeklinkt" */
export function endsText(r) {
  const m = r.miters.some((x) => x) ? r.miters.map((x) => fmtNum(x, 1) + "°").join("/") : "gerade";
  return m + (r.miterParts ? " · 2 Ebenen" : "") + (r.bent && r.bent.count ? `, gebogen ${r.bent.count}× R ${fmtNum(r.bent.radius, 1)}` : "") + (r.d3 ? " (3D)" : "") + (r.coped ? ", ausgeklinkt" : "");
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
