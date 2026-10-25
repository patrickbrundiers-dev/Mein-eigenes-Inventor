// Entformungsanalyse (Werkzeuge Stufe 54): Neigung jeder Fläche zur Entformungsrichtung wie in Inventor.
// Winkel = 90° − Winkel zwischen Normale und Zugrichtung, also 0° an senkrechten Wänden, +90° an Flächen, die
// in Zugrichtung zeigen. Einteilung: genug Schräge (≥ Mindestwinkel, Werkzeughälfte in Zugrichtung), genug auf der
// Gegenseite (≤ −Mindestwinkel) und zu wenig Schräge (dazwischen). Reine Rechnung auf dem Anzeigenetz.

export const PULL_DIRS = { "Z+": [0, 0, 1], "Z-": [0, 0, -1], "Y+": [0, 1, 0], "Y-": [0, -1, 0], "X+": [1, 0, 0], "X-": [-1, 0, 0] };
export const DRAFT_CLASSES = {
  positiv: { label: "ausreichend (Zugseite)", color: [0.2, 0.7, 0.3] },
  gering: { label: "zu wenig Schräge", color: [0.9, 0.75, 0.1] },
  negativ: { label: "ausreichend (Gegenseite)", color: [0.25, 0.45, 0.9] },
};

/** Entformungswinkel (°) einer Normalen zur Zugrichtung d */
export function draftAngle(n, d) {
  const ln = Math.hypot(...n) || 1, ld = Math.hypot(...d) || 1;
  const c = (n[0] * d[0] + n[1] * d[1] + n[2] * d[2]) / (ln * ld);
  return (Math.asin(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

export function draftClass(angle, min) {
  if (!(min >= 0 && min < 90)) throw new Error("Mindestwinkel zwischen 0 und 90° angeben");
  const eps = 1e-6;
  return angle >= min - eps && angle > eps ? "positiv" : angle <= -min + eps && angle < -eps ? "negativ" : "gering";
}

/**
 * Flächenanteile je Klasse über die Dreiecke eines Netzes (positions xyz…, indices); Dreiecksnormale aus der
 * Lage (Netze sind außen orientiert). Rückgabe { area: {positiv, gering, negativ}, total, minAngle, maxAngle }.
 */
export function draftStats(meshes, d, min) {
  const area = { positiv: 0, gering: 0, negativ: 0 };
  let total = 0;
  for (const m of meshes) {
    const P = m.positions, I = m.indices;
    for (let t = 0; t + 2 < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const A = Math.hypot(...n) / 2;
      if (!(A > 0)) continue;
      area[draftClass(draftAngle(n, d), min)] += A;
      total += A;
    }
  }
  return { area, total };
}
