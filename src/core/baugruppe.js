// Baugruppenerstellung (BG1–BG14): reine Rechnung für Platzieren mit Vorschau, Schnellfügen und Umbau der Struktur.
// Anzeige und Maus in src/ui/baugruppe.js.
import { placementMatrix, matMul, matInvertRigid, decomposePlacement } from "./geom.js";

/**
 * Schnellfügen (BG6, wie Inventor Alt-Ziehen / SolidWorks SmartMates): Art aus den beiden gegriffenen Elementen.
 * src/tgt = Art der Auswahl ("plane" | "axis"); flip = Leertaste gedrückt (wechselt die Lösung).
 * Rückgabe Zustand für »Abhängigkeit platzieren« ({ type, solution, axisSol }) und Klartext, oder null.
 */
export function quickMate(src, tgt, flip = false, { insert = false } = {}) {
  if (src === "plane" && tgt === "plane") return flip ? { type: "passend", solution: "fluchtend", label: "Bündig" } : { type: "passend", solution: "passend", label: "Fläche an Fläche" };
  if (src === "axis" && tgt === "axis") {
    if (insert) return { type: "einfuegen", solution: flip ? "ausgerichtet" : "entgegengesetzt", label: flip ? "Einfügen (ausgerichtet)" : "Einfügen" };
    return { type: "passend", solution: "passend", axisSol: flip ? "entgegengesetzt" : "ausgerichtet", label: flip ? "Konzentrisch (entgegengesetzt)" : "Konzentrisch" };
  }
  if ((src === "plane" && tgt === "axis") || (src === "axis" && tgt === "plane")) return { type: "tangential", solution: "aussen", label: "Tangential" };
  return null;
}

/** Lage einer neuen Komponente: Mitte ihres Hüllquaders (Bauteil-System) liegt am Punkt p, ungedreht */
export function placeAt(p, center = [0, 0, 0]) {
  return { pos: p.map((x, i) => Math.round((x - center[i]) * 1000) / 1000), rot: [0, 0, 0] };
}

/** Lage nach einer Bewegung D (4×4, Welt) auf die Komponente c – auf µm bzw. 1e-6° gerundet */
export function applyDelta(c, D) {
  const d = decomposePlacement(matMul(D, placementMatrix(c.pos, c.rot)));
  return { pos: d.pos.map((x) => Math.round(x * 1e6) / 1e6), rot: d.rot.map((x) => Math.round(x * 1e6) / 1e6) };
}

/** Bewegung, die Komponente von Lage a nach Lage b bringt (4×4, Welt) */
export function deltaBetween(a, b) {
  return matMul(placementMatrix(b.pos, b.rot), matInvertRigid(placementMatrix(a.pos, a.rot)));
}
