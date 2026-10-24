// SVG-Pfad-Parser: wandelt "d"-Attribute in Polylinien (+ erkannte Kreise/Bögen) um.
// flipY: replicad liefert SVG mit y nach unten -> für Zeichnungen in y nach oben umrechnen.

const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

function tokenize(d) {
  const out = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  let m;
  while ((m = re.exec(d))) out.push(m[1] ? m[1] : Number(m[2]));
  return out;
}

/**
 * @returns {polylines: number[][][], arcs: {cx,cy,r,a0,a1}[]}
 * Bögen werden zusätzlich als Polylinie abgetastet (für Darstellung/DXF-Fallback).
 */
export function parseSvgPath(d, { flipY = true, tol = 0.05 } = {}) {
  const toks = tokenize(d);
  const polylines = [];
  const arcs = [];
  let cur = null;
  let x = 0, y = 0, sx = 0, sy = 0;
  let lastCtrl = null, lastCmd = "";
  let i = 0;
  const fy = flipY ? -1 : 1;
  const push = (px, py) => cur.push([px, py * fy]);
  const startPoly = (px, py) => {
    if (cur && cur.length > 1) polylines.push(cur);
    cur = [];
    push(px, py);
  };
  const num = () => {
    const v = toks[i++];
    if (typeof v !== "number") throw new Error("SVG-Pfad: Zahl erwartet");
    return v;
  };
  let cmd = "";
  while (i < toks.length) {
    if (typeof toks[i] === "string") cmd = toks[i++];
    else if (!cmd) throw new Error("SVG-Pfad: Befehl erwartet");
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    switch (C) {
      case "M": {
        let nx = num(), ny = num();
        if (rel) { nx += x; ny += y; }
        x = nx; y = ny; sx = x; sy = y;
        startPoly(x, y);
        cmd = rel ? "l" : "L";
        lastCtrl = null;
        break;
      }
      case "L": case "H": case "V": {
        let nx = x, ny = y;
        if (C === "L") { nx = num(); ny = num(); if (rel) { nx += x; ny += y; } }
        else if (C === "H") { nx = num(); if (rel) nx += x; }
        else { ny = num(); if (rel) ny += y; }
        if (!cur) startPoly(x, y);
        x = nx; y = ny;
        push(x, y);
        lastCtrl = null;
        break;
      }
      case "C": case "S": case "Q": case "T": {
        let c1x, c1y, c2x, c2y, ex, ey;
        if (C === "C") { c1x = num(); c1y = num(); c2x = num(); c2y = num(); ex = num(); ey = num(); if (rel) { c1x += x; c1y += y; c2x += x; c2y += y; ex += x; ey += y; } }
        else if (C === "S") {
          c2x = num(); c2y = num(); ex = num(); ey = num();
          if (rel) { c2x += x; c2y += y; ex += x; ey += y; }
          if (lastCtrl && "CS".includes(lastCmd)) { c1x = 2 * x - lastCtrl[0]; c1y = 2 * y - lastCtrl[1]; } else { c1x = x; c1y = y; }
        } else if (C === "Q") { c1x = num(); c1y = num(); ex = num(); ey = num(); if (rel) { c1x += x; c1y += y; ex += x; ey += y; } c2x = null; }
        else {
          ex = num(); ey = num(); if (rel) { ex += x; ey += y; }
          if (lastCtrl && "QT".includes(lastCmd)) { c1x = 2 * x - lastCtrl[0]; c1y = 2 * y - lastCtrl[1]; } else { c1x = x; c1y = y; }
          c2x = null;
        }
        if (!cur) startPoly(x, y);
        const n = 16;
        for (let k = 1; k <= n; k++) {
          const t = k / n, u = 1 - t;
          let px, py;
          if (c2x === null) { px = u * u * x + 2 * u * t * c1x + t * t * ex; py = u * u * y + 2 * u * t * c1y + t * t * ey; }
          else { px = u * u * u * x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex; py = u * u * u * y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey; }
          push(px, py);
        }
        lastCtrl = c2x === null ? [c1x, c1y] : [c2x, c2y];
        x = ex; y = ey;
        lastCmd = C;
        continue;
      }
      case "A": {
        let rx = num(), ry = num();
        const phi = num(), large = num(), sweep = num();
        let ex = num(), ey = num();
        if (rel) { ex += x; ey += y; }
        if (!cur) startPoly(x, y);
        const pts = arcToPoints(x, y, rx, ry, phi, large, sweep, ex, ey, tol);
        if (pts.circle) {
          const c = pts.circle;
          arcs.push({ cx: c.cx, cy: c.cy * fy, r: c.r, a0: flipY ? -c.a1 : c.a0, a1: flipY ? -c.a0 : c.a1 });
        }
        for (const p of pts.points) push(p[0], p[1]);
        x = ex; y = ey;
        lastCtrl = null;
        break;
      }
      case "Z": {
        if (cur) { push(sx, sy); polylines.push(cur); cur = null; }
        x = sx; y = sy;
        lastCtrl = null;
        break;
      }
      default:
        throw new Error("SVG-Pfad: unbekannter Befehl " + cmd);
    }
    lastCmd = C;
  }
  if (cur && cur.length > 1) polylines.push(cur);
  return { polylines, arcs: mergeArcs(arcs) };
}

// SVG-Endpunkt-Parametrisierung -> Mittelpunkt (W3C Implementation Notes F.6.5)
function arcToPoints(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2, tol) {
  if (rx === 0 || ry === 0) return { points: [[x2, y2]] };
  const phi = (phiDeg * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let co = Math.sqrt(Math.max(0, num / den));
  if (fa === fs) co = -co;
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI;
  if (fs && dt < 0) dt += 2 * Math.PI;
  const rmax = Math.max(rx, ry);
  const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tol / Math.max(rmax, tol))));
  const n = Math.max(2, Math.ceil(Math.abs(dt) / Math.max(step, 0.02)));
  const points = [];
  for (let k = 1; k <= n; k++) {
    const t = t1 + (dt * k) / n;
    const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
    points.push([cp * ex - sp * ey + cx, sp * ex + cp * ey + cy]);
  }
  points[points.length - 1] = [x2, y2];
  const circle = Math.abs(rx - ry) < 1e-6 * Math.max(1, rx) ? { cx, cy, r: rx, a0: dt >= 0 ? t1 : t1 + dt, a1: dt >= 0 ? t1 + dt : t1 } : null;
  return { points, circle };
}

/** Bögen mit gleichem Mittelpunkt/Radius zusammenfassen -> Vollkreise erkennen */
function mergeArcs(arcs) {
  const out = [];
  for (const a of arcs) {
    const same = out.find((b) => Math.hypot(a.cx - b.cx, a.cy - b.cy) < 1e-4 && Math.abs(a.r - b.r) < 1e-4);
    if (same) {
      same.sweep += Math.abs(a.a1 - a.a0);
      same.parts.push([a.a0, a.a1]);
      if (same.sweep > 2 * Math.PI - 1e-3) same.full = true;
    } else out.push({ ...a, sweep: Math.abs(a.a1 - a.a0), parts: [[a.a0, a.a1]], full: Math.abs(a.a1 - a.a0) > 2 * Math.PI - 1e-3 });
  }
  return out;
}

/** Hilfsfunktion: Liste von Pfaden (evtl. verschachtelt) zu einer flachen Liste */
export function flattenPaths(p) {
  if (!p) return [];
  if (typeof p === "string") return [p];
  return p.flatMap(flattenPaths);
}

export { NUM };
