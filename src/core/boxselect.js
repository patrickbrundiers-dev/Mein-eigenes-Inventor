// Fensterauswahl im 3D-Fenster: Prüfung in Bildschirmkoordinaten. Ohne DOM/three.js.
// rect = {x0, y0, x1, y1} (beliebige Ecken). crossing = true: berühren genügt, sonst ganz innen.

export function normRect(r) {
  return { x0: Math.min(r.x0, r.x1), y0: Math.min(r.y0, r.y1), x1: Math.max(r.x0, r.x1), y1: Math.max(r.y0, r.y1) };
}

const inside = (R, x, y) => x >= R.x0 && x <= R.x1 && y >= R.y0 && y <= R.y1;

function segSeg(ax, ay, bx, by, cx, cy, dx, dy) {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function segHitsRect(R, ax, ay, bx, by) {
  if (inside(R, ax, ay) || inside(R, bx, by)) return true;
  return segSeg(ax, ay, bx, by, R.x0, R.y0, R.x1, R.y0) || segSeg(ax, ay, bx, by, R.x1, R.y0, R.x1, R.y1)
    || segSeg(ax, ay, bx, by, R.x1, R.y1, R.x0, R.y1) || segSeg(ax, ay, bx, by, R.x0, R.y1, R.x0, R.y0);
}

/** Linienzug (Paare [x,y,...] als Segmentliste: Punkte 0-1, 2-3, …) im Fenster? */
export function segmentsInBox(seg, rect, crossing) {
  const R = normRect(rect);
  if (seg.length < 4) return false;
  if (!crossing) {
    for (let i = 0; i < seg.length; i += 2) if (!inside(R, seg[i], seg[i + 1])) return false;
    return true;
  }
  for (let i = 0; i + 3 < seg.length; i += 4) if (segHitsRect(R, seg[i], seg[i + 1], seg[i + 2], seg[i + 3])) return true;
  return false;
}

function pointInTri(x, y, a, b, c) {
  const s = (p, q) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
  const d1 = s(a, b), d2 = s(b, c), d3 = s(c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/** Dreiecksfläche (tris = [[ax,ay],[bx,by],[cx,cy]] je Dreieck) im Fenster? */
export function trianglesInBox(tris, rect, crossing) {
  const R = normRect(rect);
  if (!tris.length) return false;
  if (!crossing) return tris.every((t) => t.every(([x, y]) => inside(R, x, y)));
  const cx = (R.x0 + R.x1) / 2, cy = (R.y0 + R.y1) / 2;
  for (const [a, b, c] of tris) {
    if (segHitsRect(R, a[0], a[1], b[0], b[1]) || segHitsRect(R, b[0], b[1], c[0], c[1]) || segHitsRect(R, c[0], c[1], a[0], a[1])) return true;
    if (pointInTri(cx, cy, a, b, c)) return true; // Fenster liegt ganz in einer großen Fläche
  }
  return false;
}

/** Auswahl umkehren: alle Kandidaten ohne die bisher gewählten (Vergleich über key) */
export function invertSelection(all, selected, keyOf) {
  const sel = new Set(selected.map(keyOf));
  return all.filter((x) => !sel.has(keyOf(x)));
}
