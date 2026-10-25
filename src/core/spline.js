// Spline in der Skizze: geklemmte, gleichförmige B-Spline (Grad ≤ 3) über Kontrollpunkten.
// Anfang und Ende liegen auf dem ersten bzw. letzten Kontrollpunkt. Für Kernel und Anzeige wird
// die Kurve exakt in kubische Bézier-Abschnitte zerlegt (Knoteneinfügen nach Boehm).

/** Grad für m Kontrollpunkte */
export const splineDegree = (m) => Math.max(1, Math.min(3, m - 1));

function clampedKnots(m, p) {
  const L = m - p, U = [];
  for (let i = 0; i <= p; i++) U.push(0);
  for (let i = 1; i < L; i++) U.push(i);
  for (let i = 0; i <= p; i++) U.push(L);
  return U;
}

/** Knoten u einmal einfügen (Boehm) */
function insertKnot(P, U, p, u) {
  let k = p;
  while (k < U.length - p - 2 && U[k + 1] <= u) k++;
  const Q = [];
  for (let i = 0; i <= k - p; i++) Q.push(P[i]);
  for (let i = k - p + 1; i <= k; i++) {
    const a = (u - U[i]) / (U[i + p] - U[i]);
    Q.push([(1 - a) * P[i - 1][0] + a * P[i][0], (1 - a) * P[i - 1][1] + a * P[i][1]]);
  }
  for (let i = k; i < P.length; i++) Q.push(P[i]);
  const V = [...U.slice(0, k + 1), u, ...U.slice(k + 1)];
  return { P: Q, U: V };
}

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/**
 * Kontrollpunkte [[x,y]…] → {start, segs: [[c1, c2, end]…]} kubische Bézier-Abschnitte.
 * Weniger als 2 Punkte → null.
 */
export function splineBeziers(ctrl) {
  const m = ctrl.length;
  if (m < 2) return null;
  const p = splineDegree(m);
  let P = ctrl.map((q) => [q[0], q[1]]), U = clampedKnots(m, p);
  const L = m - p;
  for (let u = 1; u < L; u++) for (let r = 1; r < p; r++) ({ P, U } = insertKnot(P, U, p, u));
  const segs = [];
  for (let j = 0; j < L; j++) {
    const b = P.slice(j * p, j * p + p + 1);
    if (p === 3) segs.push([b[1], b[2], b[3]]);
    else if (p === 2) segs.push([lerp(b[0], b[1], 2 / 3), lerp(b[2], b[1], 2 / 3), b[2]]);
    else segs.push([lerp(b[0], b[1], 1 / 3), lerp(b[0], b[1], 2 / 3), b[1]]);
  }
  return { start: P[0], segs };
}

const bez = (a, c1, c2, b, t) => {
  const s = 1 - t;
  return [s * s * s * a[0] + 3 * s * s * t * c1[0] + 3 * s * t * t * c2[0] + t * t * t * b[0], s * s * s * a[1] + 3 * s * s * t * c1[1] + 3 * s * t * t * c2[1] + t * t * t * b[1]];
};

/** Punktfolge längs der Kurve (n je Abschnitt), inklusive Anfang und Ende */
export function splineSamples(ctrl, n = 24) {
  const B = splineBeziers(ctrl);
  if (!B) return [];
  const out = [B.start];
  let a = B.start;
  for (const [c1, c2, b] of B.segs) {
    for (let i = 1; i <= n; i++) out.push(bez(a, c1, c2, b, i / n));
    a = b;
  }
  return out;
}

/** nächster Punkt: {x, y, d, sd} (sd = Abstand mit Vorzeichen links/rechts der Laufrichtung) */
export function splineNearest(ctrl, x, y) {
  const S = splineSamples(ctrl, 48);
  let best = null;
  for (let i = 0; i + 1 < S.length; i++) {
    const a = S[i], b = S[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-24;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
    const qx = a[0] + t * dx, qy = a[1] + t * dy, d = Math.hypot(x - qx, y - qy);
    if (!best || d < best.d) best = { x: qx, y: qy, d, sd: Math.sign(dx * (y - a[1]) - dy * (x - a[0])) * d };
  }
  return best;
}

/** Kurvenlänge (aus feiner Abtastung) */
export function splineLength(ctrl) {
  const S = splineSamples(ctrl, 64);
  let L = 0;
  for (let i = 1; i < S.length; i++) L += Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]);
  return L;
}
