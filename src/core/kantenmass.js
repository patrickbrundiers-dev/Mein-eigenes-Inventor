// Kantenmaße in der Skizze (SolidCraft »line-to-circle, point-to-circle, circle-to-circle«):
// gemessen wird bis zum Kreisrand, nicht bis zur Mitte. Für die Mitte klickt man den Mittelpunkt an.
//
// Bedingung { type: "edgeDistance", e2: Kreis/Bogen, und e1 (Linie oder Kreis/Bogen) oder p (Punkt), m, mode }
//   Linie–Kreis:  m · (|Abstand Mitte–Linie| − r)        m = 1: Spalt, m = −1: so weit ragt der Rand über die Linie
//   Punkt–Kreis:  m · (|Punkt–Mitte| − r)                m = 1: Punkt außen, m = −1: Punkt innen
//   Kreis–Kreis:  mode "aussen": m · (D − r1 − r2)       m = 1: Spalt, m = −1: Überdeckung
//                 mode "innen":  r_groß − r_klein − D    engste Wand, wenn ein Kreis im anderen liegt

const radiusOf = (e, P) => (e.type === "circle" ? e.r : Math.hypot(P(e.p1).x - P(e.c).x, P(e.p1).y - P(e.c).y));
const isRound = (e) => e && (e.type === "circle" || e.type === "arc");

/** Neue Kantenmaß-Bedingung (ohne id/value) aus der Auswahl; null, wenn die Auswahl nicht passt */
export function edgeDistanceFrom(sk, { line, point, circle, circle2 }) {
  const P = (id) => sk.points.find((p) => p.id === id);
  const ent = (id) => sk.entities.find((e) => e.id === id);
  const c2 = ent(circle);
  if (!isRound(c2)) return null;
  const C = P(c2.c), r = radiusOf(c2, P);
  if (line) {
    const l = ent(line);
    if (l?.type !== "line") return null;
    const a = P(l.p1), b = P(l.p2), L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const d = Math.abs((b.x - a.x) * (C.y - a.y) - (b.y - a.y) * (C.x - a.x)) / L;
    return { type: "edgeDistance", e1: line, e2: circle, m: d >= r ? 1 : -1 };
  }
  if (point) {
    if (point === c2.c) return null;
    const p = P(point);
    if (!p) return null;
    return { type: "edgeDistance", p: point, e2: circle, m: Math.hypot(p.x - C.x, p.y - C.y) >= r ? 1 : -1 };
  }
  if (circle2) {
    const c1 = ent(circle2);
    if (!isRound(c1) || circle2 === circle) return null;
    const C1 = P(c1.c), r1 = radiusOf(c1, P), D = Math.hypot(C.x - C1.x, C.y - C1.y);
    if (D + Math.min(r, r1) <= Math.max(r, r1) + 1e-9) return { type: "edgeDistance", e1: circle2, e2: circle, mode: "innen" };
    return { type: "edgeDistance", e1: circle2, e2: circle, mode: "aussen", m: D >= r + r1 ? 1 : -1 };
  }
  return null;
}

/**
 * Gemessene Strecke eines Kantenmaßes: { a, b, value } mit a/b als Skizzenpunkte {x,y}.
 * a liegt auf der Linie bzw. am Punkt bzw. am ersten Kreis, b auf dem Rand von e2.
 */
export function edgeDistanceGeometry(sk, c) {
  const pts = new Map(sk.points.map((p) => [p.id, p]));
  const ents = new Map(sk.entities.map((e) => [e.id, e]));
  const P = (id) => pts.get(id);
  const e2 = ents.get(c.e2);
  if (!isRound(e2)) return null;
  const C = P(e2.c), r = radiusOf(e2, P), m = c.m || 1;
  const unit = (dx, dy) => { const L = Math.hypot(dx, dy); return L > 1e-12 ? [dx / L, dy / L] : [1, 0]; };
  if (c.p) {
    const p = P(c.p);
    if (!p) return null;
    const [ux, uy] = unit(p.x - C.x, p.y - C.y);
    return { a: { x: p.x, y: p.y }, b: { x: C.x + ux * r, y: C.y + uy * r }, value: m * (Math.hypot(p.x - C.x, p.y - C.y) - r) };
  }
  const e1 = ents.get(c.e1);
  if (!e1) return null;
  if (e1.type === "line") {
    const a = P(e1.p1), b = P(e1.p2), dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
    const t = ((C.x - a.x) * dx + (C.y - a.y) * dy) / L2;
    const F = { x: a.x + t * dx, y: a.y + t * dy };
    const d = Math.hypot(C.x - F.x, C.y - F.y);
    const [ux, uy] = d > 1e-12 ? [(C.x - F.x) / d, (C.y - F.y) / d] : unit(-dy, dx);
    return { a: F, b: { x: C.x - ux * r, y: C.y - uy * r }, value: m * (d - r) };
  }
  if (!isRound(e1)) return null;
  const C1 = P(e1.c), r1 = radiusOf(e1, P), D = Math.hypot(C.x - C1.x, C.y - C1.y);
  if (c.mode === "innen") {
    // engste Stelle: auf der Geraden durch beide Mitten, auf der Seite, zu der der innere Kreis verschoben ist
    const [oc, or, ic, ir] = r1 >= r ? [C1, r1, C, r] : [C, r, C1, r1];
    const [ux, uy] = unit(ic.x - oc.x, ic.y - oc.y);
    return { a: { x: ic.x + ux * ir, y: ic.y + uy * ir }, b: { x: oc.x + ux * or, y: oc.y + uy * or }, value: Math.max(r, r1) - Math.min(r, r1) - D };
  }
  const [ux, uy] = unit(C.x - C1.x, C.y - C1.y);
  return { a: { x: C1.x + ux * r1, y: C1.y + uy * r1 }, b: { x: C.x - ux * r, y: C.y - uy * r }, value: m * (D - r1 - r) };
}
