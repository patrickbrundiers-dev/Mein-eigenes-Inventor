// Extrusion: Vorgang automatisch wählen (SolidCraft-Abgleich W5). Ein Punkt im Profil wird knapp vor und hinter der
// Skizzenebene geprüft: liegt vor der Ebene Material, schneidet die Extrusion (Differenz); liegt es nur dahinter, setzt
// sie auf (Vereinigen); berührt sie keinen Körper, wird sie ein neuer Körper.
import { extractProfiles } from "./sketch.js";

/** Vieleck einer Kontur (Bögen und Bézier nur über ihre Endpunkte; reicht für einen Innenpunkt) */
function loopPoly(l) {
  if (l.kind === "circle" || l.kind === "ellipse") return null;
  const pts = [l.start];
  for (const s of l.segs || []) { if (s.mid) pts.push(s.mid); pts.push(s.to); }
  return pts;
}
export function insidePoly(poly, [x, y]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** Ein Punkt sicher im Material des ersten Profils (lokale Skizzenkoordinaten) oder null */
export function profileInnerPoint(sketch) {
  let prof;
  try { prof = extractProfiles(sketch); } catch { return null; }
  const reg = prof?.regions?.[0];
  if (!reg) return null;
  const outer = reg.outer;
  const holes = (reg.holes || []).map((h) => ({ h, poly: loopPoly(h) }));
  const inHole = (p) => holes.some(({ h, poly }) => (poly ? insidePoly(poly, p) : h.kind === "circle" ? Math.hypot(p[0] - h.c[0], p[1] - h.c[1]) < h.r : Math.hypot(p[0] - h.c[0], p[1] - h.c[1]) < Math.min(h.a, h.b)));
  if (outer.kind === "circle" || outer.kind === "ellipse") {
    const r = outer.kind === "circle" ? outer.r : Math.min(outer.a, outer.b);
    for (const f of [0, 0.75, 0.9, 0.6, 0.3]) for (let k = 0; k < 8; k++) {
      const p = [outer.c[0] + f * r * Math.cos((k * Math.PI) / 4), outer.c[1] + f * r * Math.sin((k * Math.PI) / 4)];
      if (!inHole(p)) return p;
    }
    return null;
  }
  const poly = loopPoly(outer);
  if (!poly || poly.length < 3) return null;
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const c = [xs.reduce((a, b) => a + b) / xs.length, ys.reduce((a, b) => a + b) / ys.length];
  if (insidePoly(poly, c) && !inHole(c)) return c;
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (let n = 4; n <= 32; n *= 2) for (let i = 1; i < n; i++) for (let j = 1; j < n; j++) {
    const p = [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * j) / n];
    if (insidePoly(poly, p) && !inHole(p)) return p;
  }
  return null;
}
/** Vorgang aus der Lage: front = Material vor der Ebene (in Extrusionsrichtung), back = dahinter */
export function autoOp({ hasBody, front, back }) {
  if (!hasBody) return "join";
  if (front) return "cut";
  if (back) return "join";
  return "new";
}
export const OP_NAMES = { join: "Vereinigen", cut: "Differenz", new: "Neuer Körper", intersect: "Schnitt" };
