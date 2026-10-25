// Ellipse in der Skizze: Mittelpunkt c, Hauptachsenpunkt a (Ende der Halbachse a), Nebenhalbachse r.
// Die Hauptachse ist die Richtung c→a; r darf größer als |a−c| sein (dann ist es geometrisch die Hauptachse).

const TAU = Math.PI * 2;

/** {cx, cy, A, B, rot, ux, uy} aus Mittelpunkt, Achsenpunkt und Nebenhalbachse */
export function ellipseGeom(c, a, r) {
  const dx = a.x - c.x, dy = a.y - c.y, A = Math.hypot(dx, dy) || 1e-12;
  return { cx: c.x, cy: c.y, A, B: Math.abs(r), rot: Math.atan2(dy, dx), ux: dx / A, uy: dy / A };
}

/** Punkt zum Parameter t (0…2π) */
export function ellipsePoint(g, t) {
  const u = g.A * Math.cos(t), v = g.B * Math.sin(t);
  return { x: g.cx + u * g.ux - v * g.uy, y: g.cy + u * g.uy + v * g.ux };
}

/** Punkt (x, y) in Ellipsenkoordinaten (u längs Hauptachse, v quer) */
export function ellipseLocal(g, x, y) {
  const px = x - g.cx, py = y - g.cy;
  return { u: px * g.ux + py * g.uy, v: -px * g.uy + py * g.ux };
}

/** nächster Punkt auf der Ellipse: {t, x, y, d} (Newton auf dem Parameter, Startwerte rundum) */
export function ellipseNearest(g, x, y) {
  const { u, v } = ellipseLocal(g, x, y);
  let best = null;
  for (let k = 0; k < 8; k++) {
    let t = (k / 8) * TAU;
    for (let it = 0; it < 20; it++) {
      const ct = Math.cos(t), st = Math.sin(t);
      const ex = g.A * ct - u, ey = g.B * st - v;
      const f = -ex * g.A * st + ey * g.B * ct; // ½ d/dt |E(t) − P|²
      const df = (g.B * g.B - g.A * g.A) * Math.cos(2 * t) + u * g.A * ct + v * g.B * st;
      if (Math.abs(df) < 1e-14) break;
      const step = f / df;
      t -= Math.max(-0.5, Math.min(0.5, step));
      if (Math.abs(step) < 1e-12) break;
    }
    const d = Math.hypot(g.A * Math.cos(t) - u, g.B * Math.sin(t) - v);
    if (!best || d < best.d) best = { t, d };
  }
  const p = ellipsePoint(g, best.t);
  return { t: ((best.t % TAU) + TAU) % TAU, x: p.x, y: p.y, d: best.d };
}

/** Punktfolge rundum (n Abschnitte) */
export function ellipseSamples(g, n = 64) {
  const out = [];
  for (let i = 0; i < n; i++) { const p = ellipsePoint(g, (i / n) * TAU); out.push([p.x, p.y]); }
  return out;
}

/** Umfang (Ramanujan) */
export const ellipsePerimeter = (A, B) => Math.PI * (3 * (A + B) - Math.sqrt((3 * A + B) * (A + 3 * B)));
