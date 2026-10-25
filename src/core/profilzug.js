// 3D-Profilzug: Profile entlang eines räumlichen Polygonzugs über Eckpunkte (MegaCAD-Abgleich M2).
// Reine Rechnung (Punkte auflösen, prüfen, Segmente bilden); die Körper baut src/kernel/build.js wie beim Rahmen.
//
// Punkte: [{x, y, z, rel}] als Ausdrücke; rel = relativ zum vorigen Punkt (Δx, Δy, Δz). Geschlossen = letzter Punkt
// wird mit dem ersten verbunden. „Oben“ (up) legt die Profilhöhe fest: die Höhe v zeigt so weit wie möglich nach oben;
// steht ein Segment senkrecht dazu, gilt Y (bei up = Z) bzw. Z als Ersatz.

import { v3 } from "./geom.js";

export const UP_AXES = { Z: [0, 0, 1], Y: [0, 1, 0], X: [1, 0, 0] };

/** Vorgabe für ein neues Feature: rechteckiger Zug, der in Z ansteigt (zeigt die Gehrung in zwei Ebenen) */
export function defaultProfilzug(dims) {
  return {
    type: "profilzug", section: "vierkant", dims, closed: false, corner: "gehrung", align: "mitte", up: "Z", rotation: "0", cutMode: "2D", swivel: "45",
    points: [
      { x: "0", y: "0", z: "0" },
      { x: "1000", y: "0", z: "0", rel: true },
      { x: "0", y: "600", z: "300", rel: true },
      { x: "-1000", y: "0", z: "0", rel: true },
    ],
  };
}

/**
 * Punkte in Weltkoordinaten auflösen. E(expr, label) rechnet einen Ausdruck aus.
 * Rückgabe: [[x, y, z], …]; wirft bei weniger als 2 Punkten oder doppelten Punkten.
 */
export function resolvePathPoints(points, E) {
  const list = points || [];
  if (list.length < 2) throw new Error("Profilzug braucht mindestens 2 Punkte");
  const out = [];
  list.forEach((p, i) => {
    const c = ["x", "y", "z"].map((k) => E(p[k] ?? "0", `Punkt ${i + 1} ${k.toUpperCase()}`));
    const q = p.rel && i > 0 ? v3.add(out[i - 1], c) : c;
    if (i > 0 && v3.dist(q, out[i - 1]) < 1e-6) throw new Error(`Punkt ${i + 1} liegt auf Punkt ${i}`);
    out.push(q);
  });
  return out;
}

/**
 * Segmente [{id, a, b}] aus den Punkten; geschlossen verbindet zurück zum ersten Punkt.
 * Gerade durchlaufende Punkte (kollinear) bleiben eigene Segmente (Stoß, wie beim Rahmen).
 */
export function pathSegments(pts, closed) {
  const segs = [];
  for (let i = 0; i + 1 < pts.length; i++) segs.push({ id: "s" + (i + 1), a: pts[i], b: pts[i + 1] });
  if (closed) {
    if (pts.length < 3) throw new Error("Geschlossener Profilzug braucht mindestens 3 Punkte");
    if (v3.dist(pts[0], pts[pts.length - 1]) < 1e-6) throw new Error("Letzter Punkt liegt auf dem ersten – »Geschlossen« genügt");
    segs.push({ id: "s" + pts.length, a: pts[pts.length - 1], b: pts[0] });
  }
  // Zug, der am Punkt umkehrt (180°), ergibt keine Gehrung
  const n = segs.length;
  for (let i = 0; i < n; i++) {
    const nx = segs[i + 1] || (closed ? segs[0] : null);
    if (nx && cornerAngle(segs[i].a, segs[i].b, nx.b) > 179) throw new Error(`Profilzug kehrt an Punkt ${((i + 1) % pts.length) + 1} um – Punkt verschieben`);
  }
  return segs;
}

/** Länge der Mittellinie in mm */
export function pathLength(pts, closed) {
  return pathSegments(pts, closed).reduce((a, sg) => a + v3.dist(sg.a, sg.b), 0);
}

/** Richtung „oben“ für ein Segment: up, oder Ersatzachse, wenn das Segment parallel dazu läuft */
export function upFor(z, up = UP_AXES.Z) {
  if (Math.abs(v3.dot(v3.norm(z), up)) < 0.999) return up;
  return up[2] ? UP_AXES.Y : UP_AXES.Z;
}

/** Vorschlag für einen neuen Punkt (relativ): 500 mm entlang der Achse, die am wenigsten zum letzten Segment passt */
export function nextPointDefault(pts) {
  const d = pts.length > 1 ? v3.norm(v3.sub(pts[pts.length - 1], pts[pts.length - 2])) : [1, 0, 0];
  const k = [0, 1, 2].sort((a, b) => Math.abs(d[a]) - Math.abs(d[b]))[0];
  const c = ["0", "0", "0"];
  c[k] = "500";
  return { x: c[0], y: c[1], z: c[2], rel: true };
}

/** Winkel zwischen zwei Segmenten am Knoten (0° = gerade weiter), für Hinweise in der Oberfläche */
export function cornerAngle(a, b, c) {
  const d1 = v3.norm(v3.sub(b, a)), d2 = v3.norm(v3.sub(c, b));
  return (Math.acos(Math.max(-1, Math.min(1, v3.dot(d1, d2)))) * 180) / Math.PI;
}
