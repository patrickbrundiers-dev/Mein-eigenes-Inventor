// Werkzeuge Stufe 47: Messen wie Inventor – Achsabstand (parallel, windschief, Punkt zu Achse), Zweiteinheiten,
// Summen bei Mehrfachauswahl. Die Messwerte selbst rechnet der Kern exakt (src/kernel/build.js, measure);
// hier steht die reine Rechnung und Formatierung, damit sie ohne Geometriekern prüfbar ist.

export const SECOND_UNITS = [["", "Kein(e)"], ["in", "Zoll (in)"], ["cm", "cm"], ["m", "m"]];
const UNIT_MM = { in: 25.4, cm: 10, m: 1000 };
export const MAX_MEASURE_ITEMS = 20;

const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const add = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
const mul = (p, s) => [p[0] * s, p[1] * s, p[2] * s];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const len = (v) => Math.hypot(v[0], v[1], v[2]);
const norm = (v) => { const l = len(v) || 1; return mul(v, 1 / l); };

/** Achse eines Messelements als Gerade {p, d}: Zylinderfläche, Kreiskante, gerade Kante; sonst null */
export function axisOf(it) {
  if (!it) return null;
  if (it.kind === "face" && it.axisD && it.axisP) return { p: it.axisP, d: norm(it.axisD) };
  if (it.kind === "edge" && it.type === "CIRCLE" && it.center && it.axisD) return { p: it.center, d: norm(it.axisD) };
  if (it.kind === "edge" && it.type === "LINE" && it.start && it.dir) return { p: it.start, d: norm(it.dir) };
  return null;
}

/** Fußpunkt von q auf der Geraden l */
const foot = (l, q) => add(l.p, mul(l.d, dot(sub(q, l.p), l.d)));

/**
 * Achsabstand zweier Messelemente wie Inventor: zwei Achsen (parallel oder windschief) oder Punkt zu Achse.
 * Rückgabe { value, kind: "parallel"|"windschief"|"schneidend"|"punkt", a, b } mit den Endpunkten für die 3D-Anzeige – oder null.
 */
export function axisDistance(ia, ib) {
  const la = axisOf(ia), lb = axisOf(ib);
  const ptOf = (it) => (it?.kind === "vertex" ? it.point : null);
  if (la && lb) {
    const n = cross(la.d, lb.d), nl = len(n);
    // Bezugspunkt auf a: Mitte des Elements (Kreismitte, Kantenmitte, Achspunkt)
    const ref = ia.mid || ia.center || la.p;
    if (nl < 1e-9) {
      const a = foot(la, ref), b = foot(lb, a);
      return { value: len(sub(b, a)), kind: "parallel", a, b };
    }
    // gemeinsames Lot windschiefer Geraden
    const w = sub(la.p, lb.p), A = dot(la.d, la.d), B = dot(la.d, lb.d), C = dot(lb.d, lb.d), D = dot(la.d, w), E = dot(lb.d, w);
    const den = A * C - B * B;
    const s = (B * E - C * D) / den, t = (A * E - B * D) / den;
    const a = add(la.p, mul(la.d, s)), b = add(lb.p, mul(lb.d, t));
    const value = len(sub(b, a));
    return { value, kind: value < 1e-9 ? "schneidend" : "windschief", a, b };
  }
  const la1 = la || lb, pt = la ? ptOf(ib) : ptOf(ia);
  if (la1 && pt) {
    const f = foot(la1, pt);
    return la ? { value: len(sub(pt, f)), kind: "punkt", a: f, b: pt } : { value: len(sub(pt, f)), kind: "punkt", a: pt, b: f };
  }
  return null;
}

/** Summen bei Mehrfachauswahl (Strg/Umschalt): Kantenlängen, Flächeninhalte */
export function measureSums(items) {
  let length = 0, area = 0, edges = 0, faces = 0;
  for (const it of items || []) {
    if (it.kind === "edge" && Number.isFinite(it.length)) { length += it.length; edges++; }
    if (it.kind === "face" && Number.isFinite(it.area)) { area += it.area; faces++; }
  }
  return { length, area, edges, faces };
}

/** Komma-Zahl mit fester Stellenzahl (deutsch) */
export function fmtFixed(v, dec) {
  if (!Number.isFinite(v)) return "–";
  const s = (Math.abs(v) < 0.5 * 10 ** -dec ? 0 : v).toFixed(dec);
  const [i, f] = s.split(".");
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return f ? `${g},${f}` : g;
}

/** Länge, Fläche, Winkel mit Genauigkeit und optionaler Zweiteinheit (»88,000 mm (3,465 in)«) */
export function measureFormat({ dec = 3, angleDec = 2, second = "" } = {}) {
  const u = UNIT_MM[second];
  const extra = (mm, pow) => (u ? ` (${fmtFixed(mm / u ** pow, dec)} ${second}${pow === 2 ? "²" : ""})` : "");
  return {
    len: (v) => `${fmtFixed(v, dec)} mm${extra(v, 1)}`,
    area: (v) => `${fmtFixed(v, dec)} mm²${extra(v, 2)}`,
    angle: (v) => `${fmtFixed(v, angleDec)}°`,
    num: (v) => fmtFixed(v, dec),
  };
}
