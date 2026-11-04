// Kurven auf Flächen (SolidCraft-Abgleich E1): isoparametrische Kurve und Skizze auf Fläche projizieren.
// Reine Rechnung (Strahl gegen Dreiecksnetz, Kette abtasten), der Kern liefert Fläche und Netz.

/** Kette aus pathChain (Linien/Bögen in Skizzenkoordinaten) gleichmäßig abtasten, ca. step mm Abstand */
export function sampleChain(chain, step = 2) {
  const out = [];
  for (const s of chain.pieces) {
    const len = s.t === "line" ? Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) : s.r * Math.abs(s.a1 - s.a0);
    const n = Math.max(2, Math.min(400, Math.ceil(len / step)));
    for (let k = out.length ? 1 : 0; k <= n; k++) {
      const u = k / n;
      if (s.t === "line") out.push([s.a[0] + u * (s.b[0] - s.a[0]), s.a[1] + u * (s.b[1] - s.a[1])]);
      else {
        // Bogen in Laufrichtung: vom Anfang a zum Ende b über m
        const ang = (p) => Math.atan2(p[1] - s.c[1], p[0] - s.c[0]);
        let a0 = ang(s.a), a1 = ang(s.b), am = ang(s.m);
        const ccw = (x, y) => { let d = y - x; while (d < 0) d += 2 * Math.PI; return d; };
        const sweep = ccw(a0, am) < ccw(a0, a1) ? ccw(a0, a1) : -ccw(a1, a0);
        const t = a0 + u * sweep;
        out.push([s.c[0] + s.r * Math.cos(t), s.c[1] + s.r * Math.sin(t)]);
      }
    }
  }
  if (chain.closed && out.length > 2) out.pop();
  return out;
}

/**
 * Strahl o + t·d gegen Dreiecke (vertices flach, tris Indizes): nächster Treffer in beide Richtungen
 * (die Skizze darf vor oder hinter der Fläche liegen) → Punkt oder null.
 */
export function rayHit(o, d, V, T) {
  let best = null, bt = Infinity;
  for (let i = 0; i + 2 < T.length; i += 3) {
    const a = [V[3 * T[i]], V[3 * T[i] + 1], V[3 * T[i] + 2]], b = [V[3 * T[i + 1]], V[3 * T[i + 1] + 1], V[3 * T[i + 1] + 2]], c = [V[3 * T[i + 2]], V[3 * T[i + 2] + 1], V[3 * T[i + 2] + 2]];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
    if (Math.abs(det) < 1e-12) continue;
    const s = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
    const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det;
    if (u < -1e-9 || u > 1 + 1e-9) continue;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
    if (v < -1e-9 || u + v > 1 + 1e-9) continue;
    const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
    if (Math.abs(t) < bt) { bt = Math.abs(t); best = [o[0] + t * d[0], o[1] + t * d[1], o[2] + t * d[2]]; }
  }
  return best;
}

/** Projizierte Punkte: Lücken (kein Treffer) trennen die Kurve nicht, sie werden ausgelassen; mindestens 3 Treffer */
export function projectPoints(pts3, dir, V, T) {
  const out = [];
  for (const p of pts3) { const q = rayHit(p, dir, V, T); if (q && (!out.length || Math.hypot(q[0] - out.at(-1)[0], q[1] - out.at(-1)[1], q[2] - out.at(-1)[2]) > 1e-6)) out.push(q); }
  if (out.length < 3) throw new Error("Die Skizze trifft die Fläche nicht (in Richtung der Skizzennormale)");
  return out;
}
