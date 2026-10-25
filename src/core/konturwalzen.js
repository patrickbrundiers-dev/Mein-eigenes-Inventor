// Konturwalzen und Trennfuge (Werkzeuge Stufe 48): offene Skizzenlinie als Blech um eine Achse gewalzt.
// Reine Rechnung: Fugenwinkel, Prüfung gegen die Achse, Abwicklung eines Zylinder-, Kegel- oder Ringmantels.
//
// Achskoordinaten: z längs der Drehachse, r Abstand von ihr (beides in der Skizzenebene).

const fmt = (x) => String(Math.round(x * 100) / 100).replace(".", ",");

export const ROLL_AXES = [["x", "Skizzen-X-Achse"], ["y", "Skizzen-Y-Achse"]];

export function defaultKonturwalzen(sketch = "") {
  return { type: "konturwalzen", sketch, side: "links", axis: "x", angle: "360", t: "2", ri: "2", k: "0.33" };
}
export const defaultTrennfuge = (base) => ({ type: "trennfuge", base, gap: "1", pos: "0" });

/** Skizzenpunkt → [z, r] zur Achse »x« (r = y) oder »y« (r = −x, damit die Drehrichtung gleich bleibt) */
export const toAxis = (axis, p) => (axis === "y" ? [p[1], -p[0]] : [p[0], p[1]]);

/** Alle Punkte auf einer Seite der Achse und nicht auf ihr; Rückgabe Seite (±1) */
export function rollSide(points, axis) {
  const rs = points.map((p) => toAxis(axis, p)[1]);
  const lo = Math.min(...rs), hi = Math.max(...rs);
  if (lo > 1e-6) return 1;
  if (hi < -1e-6) return -1;
  throw new Error("Konturwalzen: Die Kontur berührt oder schneidet die Drehachse – Linie mit Abstand zur Achse zeichnen");
}

/** Fugenwinkel in Grad für eine Trennfuge der Breite gap (gemessen auf der Blechmitte bei Radius r) */
export function gapAngle(gap, r) {
  if (!(gap > 0)) throw new Error("Trennfuge: Breite > 0 angeben");
  if (!(r > 0)) throw new Error("Trennfuge: Radius fehlt");
  const a = (gap / r) * (180 / Math.PI);
  if (a >= 90) throw new Error(`Trennfuge: ${fmt(gap)} mm ist für Radius ${fmt(r)} mm zu breit`);
  return a;
}

/** Walzwinkel prüfen: 0 < Winkel ≤ 360 */
export function rollAngle(angle) {
  if (!(angle > 0 && angle <= 360 + 1e-9)) throw new Error("Konturwalzen: Winkel zwischen 0 und 360° angeben");
  return Math.min(angle, 360);
}

/**
 * Abwicklung eines gewalzten geraden Stücks (Blechmitte von [z0, r0] nach [z1, r1]) über den Winkel phi (Grad):
 * Zylinder → Rechteck, Kegel und Ring → Kreisringausschnitt. Rückgabe wie das Abwicklungs-Modell des Kantteils.
 */
export function rollFlat([z0, r0], [z1, r1], phi) {
  if (!(phi > 0 && phi < 360 - 1e-9)) throw new Error("Abwicklung nur mit offenem Mantel – Winkel unter 360° oder Trennfuge setzen");
  const f = (phi * Math.PI) / 180, dr = Math.abs(r1 - r0), dz = Math.abs(z1 - z0), s = Math.hypot(dr, dz);
  let outer, kind, R = null, psi = null;
  if (dr < 1e-9) {
    const w = r0 * f;
    outer = [[0, 0], [w, 0], [w, dz], [0, dz]];
    kind = "zylinder";
  } else {
    const Ra = (Math.min(r0, r1) * s) / dr, Rb = (Math.max(r0, r1) * s) / dr;
    psi = (f * dr) / s;
    const n = Math.max(8, Math.ceil(psi / (Math.PI / 48)));
    const arc = (Rr) => Array.from({ length: n + 1 }, (_, i) => { const a = -psi / 2 + (psi * i) / n; return [Rr * Math.sin(a), Rr * Math.cos(a)]; });
    outer = [...arc(Rb), ...(Ra > 1e-9 ? arc(Ra).reverse() : [[0, 0]])];
    kind = dz < 1e-9 ? "ring" : "kegel";
    R = [Ra, Rb];
    psi = (psi * 180) / Math.PI;
  }
  let area = 0;
  for (let i = 0; i < outer.length; i++) { const [a0, b0] = outer[i], [a1, b1] = outer[(i + 1) % outer.length]; area += a0 * b1 - a1 * b0; }
  if (area < 0) outer.reverse();
  const x0 = Math.min(...outer.map((p) => p[0])), y0 = Math.min(...outer.map((p) => p[1]));
  outer = outer.map(([x, y]) => [x - x0, y - y0]);
  const x1 = Math.max(...outer.map((p) => p[0])), y1 = Math.max(...outer.map((p) => p[1]));
  return { outer, holes: [], circles: [], bends: [], bbox: { x0: 0, y0: 0, x1, y1 }, width: x1, height: y1, flat: x1, length: y1, roll: { kind, R, psi, phi } };
}
