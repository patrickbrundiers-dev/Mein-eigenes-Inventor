// Bezugsgeometrie (Arbeitsebene, Arbeitsachse, Arbeitspunkt wie Inventor »Arbeitselemente«): reine Rechnung ohne Kernel,
// damit Kernel, Skizzierer und 3D-Anzeige dieselben Lagen benutzen. Bezüge: Basisebenen/-achsen oder frühere Arbeitselemente.
import { planeFrame, planeFromFace, v3 } from "./geom.js";

export const DATUM_TYPES = Object.freeze(["arbeitsebene", "arbeitsachse", "arbeitspunkt"]);
export const isDatum = (f) => DATUM_TYPES.includes(f?.type);

// Arten wie Inventor »Arbeitselemente« und Fusion »Construct«. refs: welche Bezüge die Art braucht (für Eigenschaften und Auswahl).
// legacy: alte Art, nur noch für bestehende Dateien (wird angezeigt, wenn sie gewählt ist)
export const PLANE_MODES = Object.freeze([
  { value: "versatz", label: "Versatz zu Ebene/Fläche", refs: ["base:plane"] },
  { value: "parallelPunkt", label: "Parallel durch Punkt", refs: ["base:plane", "point:point"] },
  { value: "mitte", label: "Mittelebene", refs: ["plane1:plane", "plane2:plane"] },
  { value: "winkel", label: "Winkel um Achse/Kante", refs: ["base:plane", "axis:axis"] },
  { value: "punkte", label: "Durch drei Punkte", refs: ["p1:point", "p2:point", "p3:point"] },
  { value: "achsePunkt", label: "Durch Achse und Punkt", refs: ["axis:axis", "point:point"] },
  { value: "zweiAchsen", label: "Durch zwei Achsen/Kanten", refs: ["axis:axis", "axis2:axis"] },
  { value: "normal", label: "Senkrecht zu Achse", refs: ["axis:axis", "point:point"] },
  { value: "kurve", label: "Senkrecht zu Kante/Pfad", refs: ["curve:curve"] },
  { value: "tangential", label: "Tangential an Zylinder", refs: ["cyl:cyl"] },
  { value: "flaeche", label: "Versatz zu Fläche (alt)", legacy: true },
]);
export const AXIS_MODES = Object.freeze([
  { value: "kante", label: "Auf gerader Kante", refs: ["ref:axis"] },
  { value: "zylinder", label: "Zylinder-/Bohrungsachse", refs: ["ref:cyl"] },
  { value: "kreis", label: "Durch Kreismitte", refs: ["ref:axis"] },
  { value: "punkte", label: "Durch zwei Punkte", refs: ["p1:point", "p2:point"] },
  { value: "schnitt", label: "Schnitt zweier Ebenen", refs: ["plane1:plane", "plane2:plane"] },
  { value: "normalEbene", label: "Senkrecht zu Ebene", refs: ["plane:plane", "point:point"] },
  { value: "parallel", label: "Parallel durch Punkt", refs: ["dir:axis", "point:point"] },
]);
export const POINT_MODES = Object.freeze([
  { value: "koordinaten", label: "Koordinaten" },
  { value: "modell", label: "Ecke/Kreis-/Kantenmitte", refs: ["point:point"] },
  { value: "mitte", label: "Mitte zweier Punkte", refs: ["p1:point", "p2:point"] },
  { value: "versatz", label: "Versatz von Punkt", refs: ["point:point"] },
  { value: "schnitt", label: "Schnitt Achse mit Ebene", refs: ["axis:axis", "plane:plane"] },
  { value: "dreiEbenen", label: "Schnitt dreier Ebenen", refs: ["plane1:plane", "plane2:plane", "plane3:plane"] },
]);
export const MODES_OF = Object.freeze({ arbeitsebene: PLANE_MODES, arbeitsachse: AXIS_MODES, arbeitspunkt: POINT_MODES });
export const DEFAULT_MODE = Object.freeze({ arbeitsebene: "versatz", arbeitsachse: "punkte", arbeitspunkt: "koordinaten" });

const BASE_AXES = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
const EPS = 1e-9;

/** Ebene aus Ursprung und Normale; x-Richtung wie bei Skizzen auf Flächen (Weltachse) */
function frameOf(origin, normal, xHint = null) {
  const n = v3.norm(normal);
  if (xHint) {
    const x = v3.sub(xHint, v3.mul(n, v3.dot(xHint, n)));
    if (v3.len(x) > 1e-6) { const xd = v3.norm(x); return { origin, xDir: xd, yDir: v3.cross(n, xd), normal: n }; }
  }
  const p = planeFromFace(origin, n);
  return planeFrame({ ref: "custom", origin, xDir: p.xDir, normal: n }, 0);
}

/** Drehung des Vektors a um die Einheitsachse k um phi (Rodrigues) */
function rotate(a, k, phi) {
  const c = Math.cos(phi), s = Math.sin(phi);
  return v3.add(v3.add(v3.mul(a, c), v3.mul(v3.cross(k, a), s)), v3.mul(k, v3.dot(k, a) * (1 - c)));
}

/** Gewählte Modellgeometrie (Schnappschuss, nicht assoziativ wie die Fläche bei »flaeche«) erkennen */
export const isPlaneSnap = (r) => !!r && typeof r === "object" && Array.isArray(r.o) && Array.isArray(r.n);
export const isAxisSnap = (r) => !!r && typeof r === "object" && Array.isArray(r.p) && Array.isArray(r.d);
export const isPointSnap = (r) => !!r && typeof r === "object" && !Array.isArray(r) && Array.isArray(r.p) && !r.d;
export const isCurveSnap = (r) => !!r && typeof r === "object" && Array.isArray(r.pts);

/** Punkt längs einer Polylinie bei Anteil t (0…1 der Länge) → { p, d } (d = Tangente) */
export function alongPolyline(pts, t) {
  if (!Array.isArray(pts) || pts.length < 2) throw new Error("Kante oder Pfad wählen");
  const seg = [];
  let L = 0;
  for (let i = 1; i < pts.length; i++) { const l = v3.dist(pts[i - 1], pts[i]); seg.push(l); L += l; }
  if (L < 1e-9) throw new Error("Kante ist zu kurz");
  let s = Math.min(1, Math.max(0, t)) * L;
  for (let i = 0; i < seg.length; i++) {
    if (seg[i] < 1e-12) continue;
    if (s <= seg[i] + 1e-12 || i === seg.length - 1) {
      const u = Math.min(1, s / seg[i]), a = pts[i], b = pts[i + 1];
      return { p: v3.add(a, v3.mul(v3.sub(b, a), u)), d: v3.norm(v3.sub(b, a)) };
    }
    s -= seg[i];
  }
  return { p: pts.at(-1), d: v3.norm(v3.sub(pts.at(-1), pts.at(-2))) };
}

/** Anteil (0…1) des Polylinienpunkts, der q am nächsten liegt */
export function polylineParam(pts, q) {
  let L = 0, best = Infinity, at = 0;
  const segs = [];
  for (let i = 1; i < pts.length; i++) segs.push(v3.dist(pts[i - 1], pts[i]));
  const total = segs.reduce((a, b) => a + b, 0) || 1;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], ab = v3.sub(pts[i], a), l2 = v3.dot(ab, ab);
    const u = l2 > 0 ? Math.min(1, Math.max(0, v3.dot(v3.sub(q, a), ab) / l2)) : 0;
    const d = v3.dist(q, v3.add(a, v3.mul(ab, u)));
    if (d < best) { best = d; at = (L + u * segs[i - 1]) / total; }
    L += segs[i - 1];
  }
  return at;
}

/** Abstand zweier Achsen (windschief) und ob sie parallel sind */
function axesRelation(A, B) {
  const c = v3.cross(A.d, B.d), w = v3.sub(B.p, A.p);
  if (v3.len(c) < 1e-9) return { parallel: true, dist: v3.len(v3.cross(w, A.d)) };
  return { parallel: false, dist: Math.abs(v3.dot(w, v3.norm(c))) };
}

/**
 * Lagen aller Arbeitselemente der Feature-Liste in Reihenfolge (unterdrückte entfallen).
 * ev(ausdruck) wertet Ausdrücke aus. Rückgabe { map: Map(id → {kind: "plane"|"axis"|"point", frame | p, d | p}), errors: {id: Text} }
 * Bezüge sind Basiselemente (XY, X, O …), frühere Arbeitselemente (ID) oder gewählte Modellgeometrie (Schnappschuss-Objekt).
 */
export function resolveDatums(features, ev) {
  const map = new Map(), errors = {};
  const R = refResolver(map, ev);
  for (const f of features || []) {
    if (!isDatum(f) || f.suppressed) continue;
    try {
      if (f.type === "arbeitsebene") map.set(f.id, { kind: "plane", frame: f.flip ? flipFrame(workplane(f, R)) : workplane(f, R) });
      else if (f.type === "arbeitsachse") map.set(f.id, { kind: "axis", ...workaxis(f, R) });
      else map.set(f.id, { kind: "point", p: workpoint(f, R) });
    } catch (e) { errors[f.id] = e.message; }
  }
  return { map, errors };
}

/** Ebene umkehren (Normale zeigt zur Gegenseite, x bleibt) */
const flipFrame = (fr) => ({ ...fr, normal: v3.mul(fr.normal, -1), yDir: v3.mul(fr.yDir, -1) });

/** Bezüge auflösen (auch für die Vorschau beim Anklicken) */
export function refResolver(map, ev) {
  const plane = (ref) => {
    if (["XY", "XZ", "YZ"].includes(ref)) return planeFrame({ ref }, 0);
    if (isPlaneSnap(ref)) return frameOf(ref.o, ref.n, ref.x);
    const d = map.get(ref);
    if (d?.kind !== "plane") throw new Error("Bezugsebene fehlt");
    return d.frame;
  };
  const axis = (ref) => {
    if (BASE_AXES[ref]) return { p: [0, 0, 0], d: BASE_AXES[ref] };
    if (isAxisSnap(ref)) return { p: ref.p, d: v3.norm(ref.d), ...(ref.r ? { r: ref.r } : {}) };
    const d = map.get(ref);
    if (d?.kind !== "axis") throw new Error("Bezugsachse fehlt");
    return d;
  };
  const point = (spec) => {
    if (isPointSnap(spec)) return spec.p;
    if (typeof spec === "string" || spec?.ref) {
      const id = typeof spec === "string" ? spec : spec.ref;
      if (id === "O") return [0, 0, 0];
      const d = map.get(id);
      if (d?.kind !== "point") throw new Error("Bezugspunkt fehlt");
      return d.p;
    }
    const c = Array.isArray(spec) ? spec : [spec?.x ?? "0", spec?.y ?? "0", spec?.z ?? "0"];
    return c.map((x) => ev(String(x)));
  };
  return { plane, axis, point, ev };
}

function workplane(f, { plane, axis, point, ev }) {
  const mode = f.mode || "versatz";
  const dist = () => ev(String(f.distance ?? "0"));
  if (mode === "versatz") {
    const b = plane(f.base || "XY"), d = dist();
    return { ...b, origin: v3.add(b.origin, v3.mul(b.normal, d)) };
  }
  if (mode === "flaeche") {
    if (!f.origin || !f.normal) throw new Error("Fläche wählen");
    const n = v3.norm(f.normal);
    return frameOf(v3.add(f.origin, v3.mul(n, dist())), n, f.xDir);
  }
  if (mode === "parallelPunkt") {
    const b = plane(f.base || "XY"), q = point(f.point || "O");
    return { ...b, origin: v3.add(b.origin, v3.mul(b.normal, v3.dot(v3.sub(q, b.origin), b.normal))) };
  }
  if (mode === "mitte") {
    const A = plane(f.plane1 || "XY"), B0 = plane(f.plane2 || "XY");
    // Gegenläufige Normalen (z. B. zwei Außenflächen eines Blechs) gleichrichten
    const B = v3.dot(A.normal, B0.normal) < 0 ? { ...B0, normal: v3.mul(B0.normal, -1) } : B0;
    if (v3.len(v3.cross(A.normal, B.normal)) < 1e-9) {
      const d = v3.dot(v3.sub(B.origin, A.origin), A.normal);
      return { ...A, origin: v3.add(A.origin, v3.mul(A.normal, d / 2)) };
    }
    // Winkelhalbierende durch die Schnittgerade
    const line = planesIntersection(A, B);
    const n = v3.norm(v3.sub(A.normal, B.normal));
    return frameOf(line.p, n, line.d);
  }
  if (mode === "winkel") {
    const b = plane(f.base || "XY");
    const phi = (ev(String(f.angle ?? "0")) * Math.PI) / 180;
    let k, p;
    if (f.axis === "u" || f.axis === "v" || !f.axis) { k = f.axis === "v" ? b.yDir : b.xDir; p = b.origin; }
    else { const a = axis(f.axis); k = v3.norm(a.d); p = a.p; if (Math.abs(v3.dot(k, b.normal)) > 1e-6) throw new Error("Drehachse muss parallel zur Bezugsebene liegen"); }
    const n = rotate(b.normal, k, phi);
    return frameOf(p, n, rotate(b.xDir, k, phi));
  }
  if (mode === "punkte") {
    const [a, b, c] = [point(f.p1), point(f.p2), point(f.p3)];
    const n = v3.cross(v3.sub(b, a), v3.sub(c, a));
    if (v3.len(n) < 1e-6) throw new Error("Die drei Punkte liegen auf einer Geraden");
    return frameOf(a, n, v3.sub(b, a));
  }
  if (mode === "achsePunkt") {
    const a = axis(f.axis || "Z"), q = point(f.point || "O");
    const n = v3.cross(a.d, v3.sub(q, a.p));
    if (v3.len(n) < 1e-6) throw new Error("Der Punkt liegt auf der Achse");
    return frameOf(a.p, n, a.d);
  }
  if (mode === "zweiAchsen") {
    const A = axis(f.axis || "X"), B = axis(f.axis2 || "Y");
    const rel = axesRelation(A, B);
    let n;
    if (rel.parallel) {
      n = v3.cross(A.d, v3.sub(B.p, A.p));
      if (v3.len(n) < 1e-6) throw new Error("Die Achsen fallen zusammen");
    } else {
      if (rel.dist > 1e-6) throw new Error("Die Achsen liegen nicht in einer Ebene (windschief)");
      n = v3.cross(A.d, B.d);
    }
    return frameOf(A.p, n, A.d);
  }
  if (mode === "normal") {
    const a = axis(f.axis || "Z");
    return frameOf(point(f.point || "O"), a.d);
  }
  if (mode === "kurve") {
    if (!isCurveSnap(f.curve)) throw new Error("Kante oder Pfad wählen");
    const t = ev(String(f.pos ?? "50")) / 100;
    if (!(t >= 0 && t <= 1)) throw new Error("Stelle zwischen 0 und 100 %");
    const { p, d } = alongPolyline(f.curve.pts, t);
    return frameOf(p, d);
  }
  if (mode === "tangential") {
    const c = f.cyl;
    if (!isAxisSnap(c) || !(c.r > 0)) throw new Error("Zylinderfläche wählen");
    const k = v3.norm(c.d);
    let rad;
    if (f.base) {
      // Parallel zu einer Ebene: Normale der Ebene muss senkrecht zur Zylinderachse stehen
      const b = plane(f.base);
      if (Math.abs(v3.dot(b.normal, k)) > 1e-6) throw new Error("Ebene muss parallel zur Zylinderachse liegen");
      rad = v3.mul(b.normal, f.side === "-" ? -1 : 1);
    } else {
      const s0 = Array.isArray(f.start) ? f.start : planeFromFace([0, 0, 0], k).xDir;
      const s = v3.sub(s0, v3.mul(k, v3.dot(s0, k)));
      if (v3.len(s) < 1e-9) throw new Error("Startrichtung liegt in der Zylinderachse");
      rad = rotate(v3.norm(s), k, (ev(String(f.angle ?? "0")) * Math.PI) / 180);
    }
    return frameOf(v3.add(c.p, v3.mul(rad, c.r)), rad, k);
  }
  throw new Error("Unbekannte Art: " + mode);
}

/** Schnittgerade zweier Ebenen → { p, d } */
function planesIntersection(A, B) {
  const d = v3.cross(A.normal, B.normal);
  if (v3.len(d) < 1e-6) throw new Error("Die Ebenen sind parallel");
  // Punkt auf beiden Ebenen: p = (c1 (n2×d) + c2 (d×n1)) / |d|²
  const c1 = v3.dot(A.normal, A.origin), c2 = v3.dot(B.normal, B.origin), dd = v3.dot(d, d);
  const p = v3.mul(v3.add(v3.mul(v3.cross(B.normal, d), c1), v3.mul(v3.cross(d, A.normal), c2)), 1 / dd);
  return { p, d: v3.norm(d) };
}

function workaxis(f, { plane, axis, point }) {
  const mode = f.mode || "punkte";
  if (mode === "punkte") {
    const a = point(f.p1), b = point(f.p2), d = v3.sub(b, a);
    if (v3.len(d) < 1e-6) throw new Error("Die Punkte fallen zusammen");
    return { p: a, d: v3.norm(d) };
  }
  if (mode === "parallel") {
    const ref = f.dir || "Z";
    const d = BASE_AXES[ref] || axis(ref).d;
    return { p: point(f.point || "O"), d };
  }
  if (mode === "schnitt") return planesIntersection(plane(f.plane1 || "XY"), plane(f.plane2 || "XZ"));
  if (mode === "normalEbene") {
    const P = plane(f.plane || "XY");
    return { p: point(f.point || "O"), d: P.normal };
  }
  if (mode === "kante" || mode === "zylinder" || mode === "kreis") {
    if (!f.ref) throw new Error(mode === "zylinder" ? "Zylinderfläche wählen" : mode === "kreis" ? "Kreiskante wählen" : "Gerade Kante wählen");
    const a = axis(f.ref);
    return { p: a.p, d: a.d };
  }
  throw new Error("Unbekannte Art: " + mode);
}

function workpoint(f, { plane, axis, point, ev }) {
  const mode = f.mode || "koordinaten";
  if (mode === "koordinaten") return point([f.x ?? "0", f.y ?? "0", f.z ?? "0"]);
  if (mode === "modell") { if (!f.point) throw new Error("Ecke, Kreis oder Kante wählen"); return point(f.point); }
  if (mode === "mitte") return v3.mul(v3.add(point(f.p1 || "O"), point(f.p2 || "O")), 0.5);
  if (mode === "versatz") return v3.add(point(f.point || "O"), [f.dx, f.dy, f.dz].map((x) => ev(String(x ?? "0"))));
  if (mode === "schnitt") {
    const a = axis(f.axis || "Z"), P = plane(f.plane || "XY");
    const den = v3.dot(P.normal, a.d);
    if (Math.abs(den) < EPS) throw new Error("Achse liegt parallel zur Ebene");
    const t = v3.dot(P.normal, v3.sub(P.origin, a.p)) / den;
    return v3.add(a.p, v3.mul(a.d, t));
  }
  if (mode === "dreiEbenen") {
    const [A, B, C] = [plane(f.plane1 || "XY"), plane(f.plane2 || "XZ"), plane(f.plane3 || "YZ")];
    const n1 = A.normal, n2 = B.normal, n3 = C.normal;
    const det = v3.dot(n1, v3.cross(n2, n3));
    if (Math.abs(det) < 1e-9) throw new Error("Die drei Ebenen schneiden sich nicht in einem Punkt");
    const d1 = v3.dot(n1, A.origin), d2 = v3.dot(n2, B.origin), d3 = v3.dot(n3, C.origin);
    return v3.mul(v3.add(v3.add(v3.mul(v3.cross(n2, n3), d1), v3.mul(v3.cross(n3, n1), d2)), v3.mul(v3.cross(n1, n2), d3)), 1 / det);
  }
  throw new Error("Unbekannte Art: " + mode);
}

/** Skizzenebene auflösen: {ref: "datum", id} → eigene Ebene aus der Arbeitsebene (sonst unverändert) */
export function resolvePlane(plane, datums) {
  if (plane?.ref !== "datum") return plane;
  const d = datums?.get(plane.id);
  if (d?.kind !== "plane") throw new Error("Arbeitsebene der Skizze fehlt oder ist unterdrückt");
  return { ref: "custom", origin: d.frame.origin, xDir: d.frame.xDir, normal: d.frame.normal };
}

/** Spiegelebene: Basisebene mit Abstand oder Arbeitsebene → { n, origin } */
export function mirrorPlane(f, ev, datums) {
  if (String(f.plane || "").startsWith("datum:")) {
    const d = datums?.get(f.plane.slice(6));
    if (d?.kind !== "plane") throw new Error("Arbeitsebene zum Spiegeln fehlt");
    return { n: d.frame.normal, origin: d.frame.origin };
  }
  const n = { XY: [0, 0, 1], XZ: [0, 1, 0], YZ: [1, 0, 0] }[f.plane || "YZ"];
  return { n, origin: v3.mul(n, ev(String(f.offset || "0"))) };
}

/** Achse für Muster: X/Y/Z, eigene Richtung oder Arbeitsachse → { d, p } */
export function patternAxis(ref, datums) {
  if (String(ref || "").startsWith("datum:")) {
    const d = datums?.get(ref.slice(6));
    if (d?.kind !== "axis") throw new Error("Arbeitsachse für das Muster fehlt");
    return { d: d.d, p: d.p };
  }
  return null;
}

/** Kurztext für Baum und Eigenschaften */
export function datumSummary(f, g) {
  if (!g) return "";
  const r = (x) => String(Math.round(x * 100) / 100).replace(".", ",");
  const P = (p) => `(${p.map(r).join("; ")})`;
  if (g.kind === "plane") return `Ursprung ${P(g.frame.origin)}, Normale ${P(g.frame.normal)}`;
  if (g.kind === "axis") return `durch ${P(g.p)}, Richtung ${P(g.d)}`;
  return `Punkt ${P(g.p)}`;
}
