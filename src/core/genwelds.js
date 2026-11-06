// Schweißnähte aus dem Bauplan eines Generators (R3): wo ein Stab mit seinem Ende an einem anderen Stab oder an einer
// Platte anliegt (Pfosten auf Fußplatte, Stab an Gurt, Halter am Handlauf), entsteht eine umlaufende Kehlnaht; Stöße
// innerhalb eines Profilzugs (Gehrungsecken) sind Stumpfnähte rundum. Die Nähte gehören zur Generator-Baugruppe
// (Lage im Baugruppen-Koordinatensystem) und erscheinen in Nahtliste, Schweißplan, Kalkulation und Zeichnung.
// Reine Rechnung; Stäbe gelten als Achse mit Querschnitt, Platten als Quader.
import { sectionGeometry } from "./sections.js";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => mul(a, 1 / (len(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export const GEN_WELD_RULES = [
  "Ein Stabende, das an einem anderen Stab oder an einer Platte anliegt, bekommt eine umlaufende Kehlnaht.",
  "Nahtdicke a = 0,7 × kleinere Wand- bzw. Blechdicke, gerundet, 2 … 5 mm.",
  "Nahtlänge = Umfang des angeschweißten Profils.",
  "Ecken innerhalb eines Profilzugs (Gehrung) sind rundum geschweißte Stumpfnähte (I-Naht).",
  "Verschraubte Teile (Normteile) und gebogene Rohre (Wendel) bekommen keine Naht.",
];

/** Querschnitt: Breite, Höhe, Umfang, maßgebende Dicke */
export function sectionInfo(section) {
  const kind = section?.kind, d = section?.dims || {};
  let g = null;
  try { g = section.geom || sectionGeometry(kind, d); } catch { g = null; }
  const w = g?.width || d.D || d.B || 20, h = g?.height || d.D || d.H || d.B || w;
  const round = kind === "rohr" || kind === "rund";
  const perimeter = round ? Math.PI * (d.D || w) : 2 * (w + h);
  const hollow = kind === "rohr" || kind === "vierkant" || kind === "rechteck";
  const t = hollow ? d.t || 2 : Math.min(d.t || d.s || Infinity, w, h);
  return { w, h, size: Math.max(w, h), perimeter, t };
}

const aOf = (t1, t2) => Math.max(2, Math.min(5, Math.round(0.7 * Math.min(t1, t2))));
const dist2seg = (p, a, b) => {
  const ab = sub(b, a), L2 = dot(ab, ab), u = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (L2 || 1)));
  return { d: len(sub(p, add(a, mul(ab, u)))), u };
};

/**
 * Nähte des Bauplans: [{ kind, a, side, around, field, length, p3, name, parts: [Stab, Gegenstück] }]
 * tol: Spiel in mm, in dem ein Ende noch als anliegend gilt.
 */
export function planWelds(plan, { tol = 2 } = {}) {
  const sticks = [];
  (plan.members || []).forEach((m) => { if (len(sub(m.b, m.a)) > 1e-6) sticks.push({ a: m.a, b: m.b, name: m.name, sec: sectionInfo(m.section) }); });
  (plan.chains || []).forEach((ch) => {
    const info = sectionInfo(ch.section), n = ch.points.length - 1;
    for (let i = 0; i < n; i++) {
      const a = ch.points[i], b = ch.points[i + 1];
      if (len(sub(b, a)) < 1e-6) continue;
      sticks.push({ a, b, name: n > 1 ? `${ch.name} ${i + 1}` : ch.name, sec: info, chain: ch, seg: i, last: i === n - 1 });
    }
  });
  const plates = (plan.plates || []).filter((p) => !p.glass).map((p) => {
    const x = norm(p.xDir || [1, 0, 0]), z = norm(p.normal || [0, 0, 1]), y = cross(z, x);
    let W = p.W, H = p.H;
    if (p.poly?.length) { const xs = p.poly.map((q) => q[0]), ys = p.poly.map((q) => q[1]); W = 2 * Math.max(...xs.map(Math.abs)); H = 2 * Math.max(...ys.map(Math.abs)); }
    return { c: p.center, x, y, z, W: W || 0, H: H || 0, t: p.t || 5, name: p.name };
  });
  const out = [];
  // eine Naht je Stoßstelle: treffen sich zwei Enden derselben Teile (Pfosten oben, Halter unten), zählt es einmal
  const ends = [];
  const push = (w, E) => {
    const pair = [...w.parts].sort().join("|");
    if (ends.some((e) => e.pair === pair && len(sub(e.E, E)) < 60)) return;
    ends.push({ pair, E });
    out.push(w);
  };
  for (const s of sticks) {
    const dir = norm(sub(s.b, s.a));
    for (const [E, inward, isStart] of [[s.a, dir, true], [s.b, mul(dir, -1), false]]) {
      // Gehrungsecke im Profilzug: Stoß zum Nachbarstück einmal je Ecke (am Ende des vorderen Stücks)
      if (s.chain && (isStart ? s.seg > 0 : !s.last)) {
        if (!isStart) push({ kind: "i", a: Math.max(2, Math.round(s.sec.t)), side: "pfeil", around: true, field: false, length: s.sec.perimeter, p3: E, name: `Stoß ${s.name}`, parts: [s.name, `${s.chain.name} ${s.seg + 2}`] }, E);
        continue;
      }
      // an einem anderen Stab: Ende liegt auf dessen Mantel (Abstand zur Achse ≈ halbe Breite des anderen + Spiel)
      let hit = null;
      for (const o of sticks) {
        if (o === s || (o.chain && o.chain === s.chain && Math.abs(o.seg - s.seg) <= 1)) continue;
        const { d, u } = dist2seg(E, o.a, o.b);
        // Ende im Querschnitt des anderen (Stab steckt in Bohrung) oder auf seinem Mantel; Stoß Ende an Ende zählt auch
        if (d <= o.sec.size / 2 + tol && u > -1e-6 && u < 1 + 1e-6) { hit = { name: o.name, t: o.sec.t }; break; }
      }
      if (!hit) for (const p of plates) {
        const q = sub(E, p.c), lx = dot(q, p.x), ly = dot(q, p.y), lz = dot(q, p.z);
        // Plattenmitte oder -fläche: Stabende auf/in der Platte, Ränder mit halber Profilbreite Spiel
        if (Math.abs(lx) <= p.W / 2 + tol && Math.abs(ly) <= p.H / 2 + tol && Math.abs(lz) <= p.t + tol) { hit = { name: p.name, t: p.t }; break; }
      }
      if (!hit) continue;
      // Naht etwas zurück vom Ende auf den Stab, damit die Pfeilspitze am Stab sitzt
      push({ kind: "kehl", a: aOf(s.sec.t, hit.t), side: "pfeil", around: true, field: false, length: s.sec.perimeter, p3: add(E, mul(inward, Math.min(10, s.sec.size / 2))), name: `${s.name} an ${hit.name}`, parts: [s.name, hit.name] }, E);
    }
  }
  return out;
}

/** Nähte gleicher Art zusammenfassen (Zeichnung): Art, Maß, Seite, umlaufend, Montage und Stoßart (Name ohne Nummern) */
export const weldKey = (w) => [w.kind, Math.round((w.a || 0) * 10), w.side || "pfeil", !!w.around, !!w.field, jointType(w.name)].join("|");
/** »Stab 1.3 an Untergurt 2« → »Stab an Untergurt«; Name des Gegenstücks zählt, damit Pfosten/Fußplatte und Stab/Gurt getrennt bleiben */
export const jointType = (name) => String(name || "").replace(/\s+#\d+$/, "").replace(/\s+\d+(\.\d+)*(?=\s|$)/g, "").replace(/\b(Ober|Unter)gurt\b/g, "Gurt").trim();
