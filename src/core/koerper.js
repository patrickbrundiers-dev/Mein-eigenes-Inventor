// Körper bearbeiten (Inventor »Kombinieren«, »Teilen«, »Körper verschieben«, »Aufdicken«, »Fläche verschieben«, »Flächenverjüngung«):
// reine Rechnung für Ebenen, Bewegungen und Prüfungen; die Geometrie macht der Kernel.
import { planeFrame, v3 } from "./geom.js";

export const COMBINE_OPS = Object.freeze([["join", "Vereinigen"], ["cut", "Differenz"], ["intersect", "Schnitt"]]);
export const SPLIT_KEEP = Object.freeze([["beide", "Beide Seiten als Körper"], ["plus", "Nur Seite in Normalenrichtung"], ["minus", "Nur Gegenseite"]]);
export const THICKEN_SIDES = Object.freeze([["aussen", "Nach außen"], ["innen", "Nach innen"], ["beide", "Beidseitig"]]);

/** Ebene aus Basisebene mit Abstand oder Arbeitsebene (»datum:id«, Abstand längs ihrer Normalen) → Rahmen */
export function planeOf(ref, offset, datums) {
  if (String(ref || "").startsWith("datum:")) {
    const d = datums?.get(ref.slice(6));
    if (d?.kind !== "plane") throw new Error("Arbeitsebene fehlt");
    return { ...d.frame, origin: v3.add(d.frame.origin, v3.mul(d.frame.normal, offset || 0)) };
  }
  return planeFrame({ ref: ref || "XY" }, offset || 0);
}

/** Richtung aus X/Y/Z oder Arbeitsachse → { d, p } */
export function axisOf(ref, datums) {
  if (String(ref || "").startsWith("datum:")) {
    const d = datums?.get(ref.slice(6));
    if (d?.kind !== "axis") throw new Error("Arbeitsachse fehlt");
    return { d: v3.norm(d.d), p: d.p };
  }
  const d = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[ref || "Z"];
  if (!d) throw new Error("Achse X, Y, Z oder Arbeitsachse");
  return { d, p: [0, 0, 0] };
}

/** Kombinieren prüfen: Zielkörper und mindestens ein anderer Werkzeugkörper */
export function validateCombine(f) {
  if (!f.target) throw new Error("Zielkörper wählen");
  const tools = (f.tools || []).filter((x) => x && x !== f.target);
  if (!tools.length) throw new Error("Mindestens einen Werkzeugkörper wählen (nicht den Zielkörper)");
  return tools;
}

/** Aufdicken: Abstand längs der Flächennormalen und Länge je Seite → { start, length } (start relativ zur Fläche) */
export function thickenSpan(t, side = "aussen") {
  if (!(t > 0)) throw new Error("Dicke muss > 0 sein");
  if (side === "innen") return { start: -t, length: t };
  if (side === "beide") return { start: -t / 2, length: t };
  return { start: 0, length: t };
}

/** Entformung: Winkel 0 < |α| < 45° */
export function validateDraft(angle) {
  if (!(Math.abs(angle) > 0 && Math.abs(angle) < 45)) throw new Error("Entformungswinkel zwischen 0 und 45°");
  return angle;
}
