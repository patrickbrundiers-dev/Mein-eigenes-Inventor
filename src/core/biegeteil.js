// Gebogene und gewalzte Profile in Generatoren (Handlauf einer Wendeltreppe, Ring im Geländer, Torbogen):
// ein Körper entlang einer Wendel bzw. eines Kreisbogens statt vieler gegehrter Einzelstücke.
// Reine Rechnung; den Körper baut src/kernel/build.js (Querschnitt entlang der Mittellinie gezogen).
//
// Bahn (path): { c: Mittelpunkt [x, y, z], r: Radius der Mittellinie, a0: Startwinkel in Grad, sweep: Drehwinkel in
// Grad (Vorzeichen = Drehsinn um axis), rise: Steigung über den ganzen Drehwinkel (0 = Kreisbogen bzw. Ring),
// axis: Drehachse (Vorgabe Z), x0: Richtung des Winkels 0 (senkrecht zu axis, Vorgabe X) }.
// Biegeradius einer Wendel = r · (1 + (h / r)²) mit h = Steigung je Bogenmaß (Krümmungsradius der Schraubenlinie).

import { v3 } from "./geom.js";

export const STANGE_MAX = 6000; // Handelslänge gerader Stangen (Rohr, Rundstahl, Flachstahl)

const DEG = Math.PI / 180;

/** Achsen der Bahn: n (Drehachse), x, y (Winkel 0 und 90°) */
export function pathAxes(path) {
  const n = v3.norm(path.axis || [0, 0, 1]);
  let x = path.x0 || [1, 0, 0];
  x = v3.norm(v3.sub(x, v3.mul(n, v3.dot(x, n))));
  return { n, x, y: v3.cross(n, x) };
}

/** Punkt auf der Mittellinie bei t ∈ [0, 1] */
export function pathPoint(path, t) {
  const { n, x, y } = pathAxes(path), a = (path.a0 + path.sweep * t) * DEG;
  return v3.add(v3.add(v3.add(path.c, v3.mul(x, path.r * Math.cos(a))), v3.mul(y, path.r * Math.sin(a))), v3.mul(n, (path.rise || 0) * t));
}

/** Tangente (Einheitsvektor) bei t */
export function pathTangent(path, t) {
  const { n, x, y } = pathAxes(path), a = (path.a0 + path.sweep * t) * DEG, w = path.sweep * DEG;
  return v3.norm(v3.add(v3.add(v3.mul(x, -path.r * Math.sin(a) * w), v3.mul(y, path.r * Math.cos(a) * w)), v3.mul(n, path.rise || 0)));
}

/** Richtung von der Achse nach außen bei t (für die Lage eines nicht runden Querschnitts) */
export function pathRadial(path, t) {
  const { x, y } = pathAxes(path), a = (path.a0 + path.sweep * t) * DEG;
  return v3.norm(v3.add(v3.mul(x, Math.cos(a)), v3.mul(y, Math.sin(a))));
}

/** gestreckte Länge der Mittellinie */
export function pathLength(path) {
  return Math.hypot(path.r * Math.abs(path.sweep) * DEG, path.rise || 0);
}

/** Biegeradius (Krümmungsradius der Mittellinie) */
export function bendRadius(path) {
  const w = Math.abs(path.sweep) * DEG, h = w > 0 ? (path.rise || 0) / w : 0;
  return path.r * (1 + (h / path.r) ** 2);
}

/** Bahn in n gleiche Stücke ≤ maxLen teilen (Stoß, wenn die gerade Stange nicht reicht); geschlossener Ring bleibt ganz */
export function splitPath(path, maxLen = STANGE_MAX) {
  const L = pathLength(path), n = Math.max(1, Math.ceil(L / maxLen - 1e-9));
  return Array.from({ length: n }, (_, k) => ({ ...path, a0: path.a0 + (path.sweep * k) / n, sweep: path.sweep / n, rise: (path.rise || 0) / n, c: v3.add(path.c, v3.mul(pathAxes(path).n, ((path.rise || 0) * k) / n)) }));
}

/** kürzester Abstand eines Punkts zur Mittellinie (Bohrungen dem richtigen Stück zuordnen) */
export function pathDistance(path, p, steps = 180) {
  let best = Infinity, bt = 0;
  for (let k = 0; k <= steps; k++) { const d = v3.dist(pathPoint(path, k / steps), p); if (d < best) { best = d; bt = k / steps; } }
  // fein nachsuchen
  let lo = Math.max(0, bt - 1 / steps), hi = Math.min(1, bt + 1 / steps);
  for (let i = 0; i < 40; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (v3.dist(pathPoint(path, m1), p) < v3.dist(pathPoint(path, m2), p)) hi = m2; else lo = m1;
  }
  return Math.min(best, v3.dist(pathPoint(path, (lo + hi) / 2), p));
}

/**
 * Hinweise zum Biegen/Walzen: Biegeradius gegen Profilmaß (Rohr unter 1,5 × Ø knickt ohne Dorn ein, Vollprofil unter
 * 1 × Höhe reißt außen). Stöße (gestreckte Länge über eine Stange) nennt der Generator in der Beschreibung.
 */
export function bendIssues(path, section, name, key) {
  const out = [], Rb = bendRadius(path), D = Math.max(section.geom?.width || 0, section.geom?.height || 0);
  const hollow = section.kind === "rohr" || section.kind === "vierkant" || section.kind === "rechteck";
  const min = hollow ? 1.5 * D : D;
  if (D > 0 && Rb < min) out.push({ key, level: "Warnung", message: `${name}: Biegeradius ${fmt(Rb)} mm unter ${fmt(min)} mm (${hollow ? "1,5 × Profilmaß, Rohr knickt ein" : "1 × Profilmaß"}) – kleineres Profil oder größerer Radius` });
  return out;
}

function fmt(x) { return String(Math.round(x * 10) / 10).replace(".", ","); }
