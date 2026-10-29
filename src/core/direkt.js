// Direktbearbeitung am fertigen Körper (Inventor »Direkt«): Flächen verschieben, drehen oder löschen.
// Reine Rechnung (Richtungen, Ebenen, Messen ab, Prüfungen); die Geometrie macht der Kernel (src/kernel/direkt.js).
import { v3 } from "./geom.js";

export const DIREKT_OPS = Object.freeze([["verschieben", "Verschieben"], ["groesse", "Größe"], ["drehen", "Drehen"], ["loeschen", "Löschen"]]);
export const DIREKT_GROESSE = Object.freeze([["durchmesser", "Durchmesser"], ["radius", "Radius"], ["offset", "Versatz"]]);
export const DIREKT_RICHTUNGEN = Object.freeze([["normal", "Normale"], ["X", "X"], ["Y", "Y"], ["Z", "Z"]]);
export const DIREKT_ACHSEN = Object.freeze([["U", "Achse U"], ["V", "Achse V"], ["kante", "Kante"]]);
const WORLD = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };

/** Neues Feature aus gewählten Flächen ({p, n}) */
export function newDirekt(op = "verschieben", faces = []) {
  return { type: "direkt", op, faces, richtung: "normal", distance: "10", angle: "10", achse: "U" };
}

/** Feature prüfen, bevor der Kernel rechnet */
export function validateDirekt(f) {
  if (!DIREKT_OPS.some(([k]) => k === (f.op || "verschieben"))) throw new Error("Unbekannte Direktbearbeitung");
  if (!(f.faces || []).length) throw new Error("Fläche wählen");
  if (f.op === "drehen" && (f.achse || "U") === "kante" && !f.edge) throw new Error("Drehkante wählen");
  return f.op || "verschieben";
}

/** Achsen U, V in der Flächenebene, nur aus der Normalen (Kernel und Triade gleich): U = Projektion von X (oder Y) */
export function faceAxes(n) {
  const N = v3.norm(n);
  const w = Math.abs(N[0]) < 0.9 ? WORLD.X : WORLD.Y;
  const u = v3.norm(v3.sub(w, v3.mul(N, v3.dot(w, N))));
  return { u, v: v3.cross(N, u), n: N };
}

/** Schieberichtung (Einheitsvektor) aus »normal« oder X/Y/Z */
export function moveDir(richtung, n) {
  return richtung && WORLD[richtung] ? WORLD[richtung] : v3.norm(n);
}

/**
 * Wie weit sich die Flächenebene längs ihrer Normalen n bewegt, wenn sie um s längs dir geschoben wird.
 * Schieben in der Ebene selbst ändert den Körper nicht (die Nachbarflächen bleiben auf ihren Flächen).
 */
export function normalOffset(n, dir, s) {
  const k = v3.dot(v3.norm(n), v3.norm(dir));
  if (Math.abs(k) < 1e-6) throw new Error("Die Richtung liegt in der Fläche – so verschoben ändert sich nichts");
  return s * k;
}

/**
 * Messen ab (Inventor »Measure From«): Schiebeweg s längs dir, damit die Fläche (Punkt p) den Abstand »wert« zum Bezug hat.
 * Bezug = Ebene {p, n} (Abstand längs ihrer Normalen) oder Punkt {p} (Abstand längs dir). Vorzeichen bleibt wie jetzt.
 */
export function measureFromShift(p, dir, ref, wert) {
  const D = v3.norm(dir);
  const m = ref.n ? v3.norm(ref.n) : D;
  const cur = v3.dot(v3.sub(p, ref.p), m);
  const k = v3.dot(D, m);
  if (Math.abs(k) < 1e-6) throw new Error("Die Schieberichtung ändert den Abstand zum Bezug nicht");
  const target = (cur < 0 ? -1 : 1) * Math.abs(wert);
  return (target - cur) / k;
}

/** Abstand vom Bezug zur Fläche (Anzeige im Eigenschaftenfeld) */
export function measureFromValue(p, dir, ref) {
  const m = ref.n ? v3.norm(ref.n) : v3.norm(dir);
  return Math.abs(v3.dot(v3.sub(p, ref.p), m));
}

/** Vektor v um Achse k (Einheitsvektor) um Winkel a (rad) drehen (Rodrigues) */
export function rotateVec(v, k, a) {
  const K = v3.norm(k), c = Math.cos(a), s = Math.sin(a);
  return v3.add(v3.add(v3.mul(v, c), v3.mul(v3.cross(K, v), s)), v3.mul(K, v3.dot(K, v) * (1 - c)));
}

/** Punkt p um die Gerade (o, k) um a drehen */
export function rotatePoint(p, o, k, a) {
  return v3.add(o, rotateVec(v3.sub(p, o), k, a));
}

/** Drehwinkel in Grad prüfen: 0 < |α| < 80° */
export function validateAngle(deg) {
  if (!(Math.abs(deg) > 1e-9 && Math.abs(deg) < 80)) throw new Error("Drehwinkel zwischen 0 und 80°");
  return deg;
}

/**
 * Richtung, in der eine Ecke der Fläche wandert, wenn die Fläche in ihrer Normalen n wandert: auf der Schnittgeraden
 * der beiden Nachbarebenen an der Ecke (mA, mB = deren Normalen; null = senkrechte Nachbarfläche). Zeigt in +n.
 */
export function cornerDir(n, mA, mB) {
  const N = v3.norm(n);
  let d = mA && mB ? v3.cross(mA, mB) : null;
  if (!d || v3.len(d) < 1e-9) {
    const m = mA || mB;
    d = m ? v3.sub(N, v3.mul(v3.norm(m), v3.dot(N, v3.norm(m)))) : N;
  }
  if (v3.len(d) < 1e-9) throw new Error("Nachbarfläche liegt in der Flächenebene");
  d = v3.norm(d);
  const k = v3.dot(d, N);
  if (Math.abs(k) < 1e-6) throw new Error("Nachbarflächen lassen sich nicht verlängern");
  return k < 0 ? v3.mul(d, -1) : d;
}

/** Ecke p längs der Eckrichtung d auf Höhe h (gemessen längs n) */
export function cornerAt(p, d, n, h) {
  return v3.add(p, v3.mul(d, h / v3.dot(d, v3.norm(n))));
}

/** Kurzinfo für den Verlauf */
export function direktSummary(op, n, wert) {
  const z = (x) => String(Math.round(x * 100) / 100).replace(".", ",");
  if (op === "loeschen") return `${n} Fläche(n) gelöscht, Lücke geschlossen`;
  if (op === "drehen") return `${n} Fläche(n) um ${z(wert)}° gedreht`;
  return `${n} Fläche(n) um ${z(wert)} mm verschoben`;
}
