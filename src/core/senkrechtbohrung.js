// Schräge Bohrungen senkrecht zur Wand (Paket A3): Ein Stab oder Bolzen, der unter einem Winkel durch eine Rohrwand
// geht, braucht dort eine schräge Bohrung – die kann die Säge-/Bohranlage (DSTV) nicht. Ersatz: Bohrung senkrecht zur
// Wand, als Langloch in Neigungsrichtung so lang, dass der schräge Stab durch die ganze Wanddicke passt
// (Länge = Ø / cos θ + Wand · tan θ).

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
const axpy = (a, s, b) => a.map((x, k) => x + s * b[k]);

/**
 * Bohrung (Drill-Eintrag) senkrecht zur Wand. C = Punkt der Stabachse in Wandmitte, g = Richtung des Stabs,
 * n = Außennormale der Wand, wall = Wanddicke, hole = { d } (rund, mit Aufmaß) oder { w, h, xDir } (Rechteck).
 */
export function squareDrill(target, C, g, n, wall, hole) {
  n = unit(n); g = unit(g);
  const c = Math.abs(dot(g, n));
  const e0 = axpy(g, -dot(g, n), n), s = Math.hypot(...e0);
  const base = { target, p: axpy(C, wall / 2 + 1, n), dir: n.map((x) => -x), len: wall + 2 };
  if (s < 1e-6 || c < 1e-6) return { ...base, ...hole };
  const e = unit(e0), k = 1 / c, tan = s / c;
  if (hole.d != null) {
    const L = hole.d * k + wall * tan;
    return { ...base, d: hole.d, slotL: L - hole.d, xDir: e };
  }
  const xd = unit(axpy(hole.xDir, -dot(hole.xDir, n), n));
  if (Math.abs(dot(xd, e)) > 0.7) return { ...base, w: hole.w * k + wall * tan, h: hole.h, xDir: e };
  return { ...base, w: hole.w, h: hole.h * k + wall * tan, xDir: xd };
}
