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

/**
 * Ecken eines Linienzugs mit Bögen (Krümmlinge) statt Gehrung (N2): jede innere Ecke bekommt einen Kreisbogen mit
 * Radius R tangential an beide Stücke. Rückgabe { lines: [[a, b]], arcs: [{ path, corner }], short: [Eckindex] } –
 * short = Ecken, an denen die Nachbarstücke für den Bogen zu kurz sind (dort bleibt ein spitzer Knick, Aufrufer
 * meldet es). Fast gerade Ecken (< 1°) bleiben ohne Bogen.
 */
export function roundCorners(pts, R) {
  const n = pts.length, cut = new Array(n).fill(0), arcs = [], short = [];
  const dir = (a, b) => v3.norm(v3.sub(b, a));
  for (let i = 1; i < n - 1; i++) {
    const d1 = dir(pts[i - 1], pts[i]), d2 = dir(pts[i], pts[i + 1]);
    const th = Math.acos(Math.max(-1, Math.min(1, v3.dot(d1, d2))));
    if (th < DEG) continue;
    cut[i] = R * Math.tan(th / 2);
  }
  for (let i = 1; i < n - 1; i++) {
    if (!cut[i]) continue;
    const Lp = v3.dist(pts[i - 1], pts[i]), Ln = v3.dist(pts[i], pts[i + 1]);
    const avail = (L, j) => L - (j > 0 && j < n - 1 ? cut[j] : 0);
    if (cut[i] > avail(Lp, i - 1) - 1e-6 || cut[i] > avail(Ln, i + 1) - 1e-6 || cut[i] * 2 > Lp + 1e-6 && i - 1 > 0 && cut[i - 1] || cut[i] * 2 > Ln + 1e-6 && i + 1 < n - 1 && cut[i + 1]) { short.push(i); cut[i] = 0; }
  }
  const tp = []; // je Ecke: [Ende des vorigen Stücks, Anfang des nächsten]
  for (let i = 0; i < n; i++) {
    if (i === 0 || i === n - 1 || !cut[i]) { tp.push([pts[i], pts[i]]); continue; }
    const d1 = dir(pts[i - 1], pts[i]), d2 = dir(pts[i], pts[i + 1]);
    const a = v3.sub(pts[i], v3.mul(d1, cut[i])), b = v3.add(pts[i], v3.mul(d2, cut[i]));
    tp.push([a, b]);
    // Mittelpunkt: von a senkrecht zu d1 in der Ebene der Ecke zur Innenseite
    const axis = v3.norm(v3.cross(d1, d2)), inward = v3.norm(v3.cross(axis, d1));
    const c = v3.add(a, v3.mul(inward, R));
    const th = Math.acos(Math.max(-1, Math.min(1, v3.dot(d1, d2))));
    arcs.push({ corner: i, path: { c, r: R, a0: 0, sweep: th / DEG, rise: 0, axis, x0: v3.norm(v3.sub(a, c)) } });
  }
  // Ecke ohne Bogen (zu kurz bzw. fast gerade): Gehrung – Ebene durch die Ecke, Normale d1 + d2
  const miter = (j) => (j > 0 && j < n - 1 && !cut[j] ? v3.norm(v3.add(dir(pts[j - 1], pts[j]), dir(pts[j], pts[j + 1]))) : null);
  const lines = [];
  for (let i = 0; i < n - 1; i++) {
    const a = tp[i][1], b = tp[i + 1][0];
    if (v3.dist(a, b) > 1e-6) lines.push([a, b, miter(i), miter(i + 1)]);
  }
  return { lines, arcs, short };
}

/**
 * Linienzug als gerade Stäbe und Bögen (für Generatoren statt einer gegehrten Kette): { members, tubes, short }.
 * Teile heißen »name 1 … n« bzw. »name Bogen k« und haben target = name, damit Bohrungen mit target name passen.
 */
export function bentChain({ section, points, name, up, rot, radius }) {
  const rc = roundCorners(points, radius);
  // Gehrungsecken: Stück um das Profilmaß verlängern und an der Gehrungsebene schneiden
  const w = Math.max(section.geom?.width || 0, section.geom?.height || 0);
  const members = rc.lines.map(([a, b, mA, mB], i) => {
    const d = v3.norm(v3.sub(b, a));
    const A = mA ? v3.sub(a, v3.mul(d, w)) : a, B = mB ? v3.add(b, v3.mul(d, w)) : b;
    const cuts = mA || mB ? { cuts: { start: mA ? [{ p: a, n: v3.mul(mA, -1) }] : [], end: mB ? [{ p: b, n: mB }] : [] } } : {};
    return { section, a: A, b: B, name: `${name} ${i + 1}`, target: name, up, ...(rot ? { rot } : {}), ...cuts };
  });
  const tubes = rc.arcs.map((x, k) => ({ section, path: x.path, name: `${name} Bogen ${k + 1}`, target: name }));
  return { members, tubes, short: rc.short };
}
