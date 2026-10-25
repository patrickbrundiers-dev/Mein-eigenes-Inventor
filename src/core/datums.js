// Bezugsgeometrie (Arbeitsebene, Arbeitsachse, Arbeitspunkt wie Inventor »Arbeitselemente«): reine Rechnung ohne Kernel,
// damit Kernel, Skizzierer und 3D-Anzeige dieselben Lagen benutzen. Bezüge: Basisebenen/-achsen oder frühere Arbeitselemente.
import { planeFrame, planeFromFace, v3 } from "./geom.js";

export const DATUM_TYPES = Object.freeze(["arbeitsebene", "arbeitsachse", "arbeitspunkt"]);
export const isDatum = (f) => DATUM_TYPES.includes(f?.type);

export const PLANE_MODES = Object.freeze([
  { value: "versatz", label: "Versatz zu einer Ebene" },
  { value: "winkel", label: "Gedreht um eine Achse" },
  { value: "punkte", label: "Durch drei Punkte" },
  { value: "normal", label: "Senkrecht zu einer Achse durch einen Punkt" },
  { value: "flaeche", label: "Versatz zu einer Modellfläche" },
]);
export const AXIS_MODES = Object.freeze([
  { value: "punkte", label: "Durch zwei Punkte" },
  { value: "schnitt", label: "Schnitt zweier Ebenen" },
  { value: "parallel", label: "Parallel zu X/Y/Z durch einen Punkt" },
]);
export const POINT_MODES = Object.freeze([
  { value: "koordinaten", label: "Koordinaten" },
  { value: "schnitt", label: "Schnitt Achse mit Ebene" },
]);

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

/**
 * Lagen aller Arbeitselemente der Feature-Liste in Reihenfolge (unterdrückte entfallen).
 * ev(ausdruck) wertet Ausdrücke aus. Rückgabe { map: Map(id → {kind: "plane"|"axis"|"point", frame | p, d | p}), errors: {id: Text} }
 */
export function resolveDatums(features, ev) {
  const map = new Map(), errors = {};
  const plane = (ref) => {
    if (["XY", "XZ", "YZ"].includes(ref)) return planeFrame({ ref }, 0);
    const d = map.get(ref);
    if (d?.kind !== "plane") throw new Error("Bezugsebene fehlt");
    return d.frame;
  };
  const axis = (ref) => {
    if (BASE_AXES[ref]) return { p: [0, 0, 0], d: BASE_AXES[ref] };
    const d = map.get(ref);
    if (d?.kind !== "axis") throw new Error("Bezugsachse fehlt");
    return d;
  };
  const point = (spec) => {
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
  for (const f of features || []) {
    if (!isDatum(f) || f.suppressed) continue;
    try {
      if (f.type === "arbeitsebene") map.set(f.id, { kind: "plane", frame: workplane(f, { plane, axis, point, ev }) });
      else if (f.type === "arbeitsachse") map.set(f.id, { kind: "axis", ...workaxis(f, { plane, point }) });
      else map.set(f.id, { kind: "point", p: workpoint(f, { plane, axis, point }) });
    } catch (e) { errors[f.id] = e.message; }
  }
  return { map, errors };
}

function workplane(f, { plane, axis, point, ev }) {
  const mode = f.mode || "versatz";
  if (mode === "versatz") {
    const b = plane(f.base || "XY"), d = ev(String(f.distance ?? "0"));
    return { ...b, origin: v3.add(b.origin, v3.mul(b.normal, d)) };
  }
  if (mode === "flaeche") {
    if (!f.origin || !f.normal) throw new Error("Fläche wählen");
    const d = ev(String(f.distance ?? "0"));
    const n = v3.norm(f.normal);
    return frameOf(v3.add(f.origin, v3.mul(n, d)), n, f.xDir);
  }
  if (mode === "winkel") {
    const b = plane(f.base || "XY");
    const phi = (ev(String(f.angle ?? "0")) * Math.PI) / 180;
    let k, p;
    if (f.axis === "u" || f.axis === "v" || !f.axis) { k = f.axis === "v" ? b.yDir : b.xDir; p = b.origin; }
    else { const a = axis(f.axis); k = v3.norm(a.d); p = a.p; if (Math.abs(v3.dot(k, b.normal)) > 1e-6) throw new Error("Drehachse muss in der Bezugsebene liegen"); }
    const n = rotate(b.normal, k, phi);
    return frameOf(p, n, rotate(b.xDir, k, phi));
  }
  if (mode === "punkte") {
    const [a, b, c] = [point(f.p1), point(f.p2), point(f.p3)];
    const n = v3.cross(v3.sub(b, a), v3.sub(c, a));
    if (v3.len(n) < 1e-6) throw new Error("Die drei Punkte liegen auf einer Geraden");
    return frameOf(a, n, v3.sub(b, a));
  }
  if (mode === "normal") {
    const a = axis(f.axis || "Z");
    return frameOf(point(f.point || "O"), a.d);
  }
  throw new Error("Unbekannte Art: " + mode);
}

function workaxis(f, { plane, point }) {
  const mode = f.mode || "punkte";
  if (mode === "punkte") {
    const a = point(f.p1), b = point(f.p2), d = v3.sub(b, a);
    if (v3.len(d) < 1e-6) throw new Error("Die Punkte fallen zusammen");
    return { p: a, d: v3.norm(d) };
  }
  if (mode === "parallel") {
    const d = BASE_AXES[f.dir || "Z"];
    if (!d) throw new Error("Richtung X, Y oder Z");
    return { p: point(f.point || "O"), d };
  }
  if (mode === "schnitt") {
    const A = plane(f.plane1 || "XY"), B = plane(f.plane2 || "XZ");
    const d = v3.cross(A.normal, B.normal);
    if (v3.len(d) < 1e-6) throw new Error("Die Ebenen sind parallel");
    // Punkt auf beiden Ebenen: p = (c1 (n2×d) + c2 (d×n1)) / |d|²
    const c1 = v3.dot(A.normal, A.origin), c2 = v3.dot(B.normal, B.origin), dd = v3.dot(d, d);
    const p = v3.mul(v3.add(v3.mul(v3.cross(B.normal, d), c1), v3.mul(v3.cross(d, A.normal), c2)), 1 / dd);
    return { p, d: v3.norm(d) };
  }
  throw new Error("Unbekannte Art: " + mode);
}

function workpoint(f, { plane, axis, point }) {
  const mode = f.mode || "koordinaten";
  if (mode === "koordinaten") return point([f.x ?? "0", f.y ?? "0", f.z ?? "0"]);
  if (mode === "schnitt") {
    const a = axis(f.axis || "Z"), P = plane(f.plane || "XY");
    const den = v3.dot(P.normal, a.d);
    if (Math.abs(den) < EPS) throw new Error("Achse liegt parallel zur Ebene");
    const t = v3.dot(P.normal, v3.sub(P.origin, a.p)) / den;
    return v3.add(a.p, v3.mul(a.d, t));
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
