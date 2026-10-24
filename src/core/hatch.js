// Schraffur: parallele Linien innerhalb von Konturen (gerade/ungerade-Regel), z. B. für Schnittflächen im DXF
/**
 * loops: [[[x,y], ...], ...] geschlossene Konturen (Löcher als eigene Kontur)
 * spacing: Linienabstand, angle: Winkel in Grad
 * Rückgabe: [[x1,y1,x2,y2], ...]
 */
export function hatchLines(loops, spacing = 2.5, angle = 45) {
  const a = (angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  // in ein System drehen, in dem die Schraffurlinien waagrecht sind
  const rot = (p) => [p[0] * c + p[1] * s, -p[0] * s + p[1] * c];
  const back = (x, y) => [x * c - y * s, x * s + y * c];
  const edges = [];
  let y0 = Infinity, y1 = -Infinity;
  for (const loop of loops) {
    const r = loop.map(rot);
    for (let i = 0; i < r.length; i++) {
      const p = r[i], q = r[(i + 1) % r.length];
      if (Math.abs(p[1] - q[1]) < 1e-12) continue;
      edges.push([p, q]);
      y0 = Math.min(y0, p[1], q[1]);
      y1 = Math.max(y1, p[1], q[1]);
    }
  }
  const out = [];
  if (!edges.length) return out;
  const start = Math.ceil(y0 / spacing) * spacing;
  for (let y = start; y <= y1; y += spacing) {
    const xs = [];
    for (const [p, q] of edges) {
      const lo = Math.min(p[1], q[1]), hi = Math.max(p[1], q[1]);
      if (y < lo || y >= hi) continue; // halboffen gegen doppelte Treffer an Ecken
      xs.push(p[0] + ((y - p[1]) * (q[0] - p[0])) / (q[1] - p[1]));
    }
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i + 1] - xs[i] < 1e-9) continue;
      const A = back(xs[i], y), B = back(xs[i + 1], y);
      out.push([A[0], A[1], B[0], B[1]]);
    }
  }
  return out;
}
