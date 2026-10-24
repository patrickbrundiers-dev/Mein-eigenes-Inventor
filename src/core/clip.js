// Detailansicht: Projektionslinien auf einen Kreis zuschneiden (Ansichtskoordinaten, mm)

/** Teilt eine Polylinie in die Stücke innerhalb des Kreises (c, r). Rückgabe: Liste von Polylinien */
export function clipPolylineToCircle(pl, c, r) {
  const out = [];
  let cur = null;
  const inside = (p) => Math.hypot(p[0] - c[0], p[1] - c[1]) <= r + 1e-9;
  for (let i = 0; i + 1 < pl.length; i++) {
    const a = pl[i], b = pl[i + 1];
    // Parameter t ∈ [0,1] der Schnittpunkte mit dem Kreis
    const dx = b[0] - a[0], dy = b[1] - a[1], fx = a[0] - c[0], fy = a[1] - c[1];
    const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - r * r;
    let t0 = 0, t1 = 1;
    if (A < 1e-18) { if (!inside(a)) { cur = null; } continue; }
    const disc = B * B - 4 * A * C;
    if (disc <= 0) { cur = null; continue; } // Gerade verfehlt den Kreis (oder tangiert)
    const s = Math.sqrt(disc);
    t0 = Math.max(0, (-B - s) / (2 * A));
    t1 = Math.min(1, (-B + s) / (2 * A));
    if (t1 - t0 <= 1e-12) { cur = null; continue; }
    const P = (t) => [a[0] + dx * t, a[1] + dy * t];
    const p0 = P(t0), p1 = P(t1);
    if (!cur || t0 > 1e-12) { cur = [p0]; out.push(cur); }
    cur.push(p1);
    if (t1 < 1 - 1e-12) cur = null;
  }
  return out.filter((x) => x.length > 1);
}

/** Projektion einer Elternansicht auf den Detailkreis zuschneiden (gleiche Struktur wie die Kernel-Projektion) */
export function clipProjection(p, c, r) {
  const clip = (list) => (list || []).flatMap((pl) => clipPolylineToCircle(pl, c, r));
  const inArcs = (list) => (list || []).filter((a) => Math.hypot(a.cx - c[0], a.cy - c[1]) + a.r <= r + 1e-9);
  return {
    visible: clip(p.visible), hidden: clip(p.hidden), arcs: inArcs(p.arcs), hiddenArcs: inArcs(p.hiddenArcs),
    sectionLoops: [], bbox: { x0: c[0] - r, y0: c[1] - r, x1: c[0] + r, y1: c[1] + r },
  };
}
