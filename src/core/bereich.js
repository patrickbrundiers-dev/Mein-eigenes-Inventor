// Bereichseigenschaften einer Skizze (Werkzeuge Stufe 54) wie in Inventor: Fläche, Umfang, Schwerpunkt,
// Flächenträgheitsmomente (Schwerpunktachsen parallel zur Skizze, Hauptachsen), Trägheitsradien und
// Widerstandsmomente je geschlossenem Bereich. Kreise und Ellipsen exakt, Bögen und Splines fein abgetastet.

import { extractProfiles, circleFrom3 } from "./sketch.js";

const TAU = 2 * Math.PI;

/** Polygon-Integrale über Green: [A, ∫x, ∫y, ∫x², ∫y², ∫xy, Umfang] (Vorzeichen nach Umlaufsinn) */
function polyMoments(P) {
  let A = 0, Sx = 0, Sy = 0, Ixx = 0, Iyy = 0, Ixy = 0, L = 0;
  for (let i = 0; i < P.length; i++) {
    const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length];
    const c = x0 * y1 - x1 * y0;
    A += c / 2;
    Sx += ((x0 + x1) * c) / 6;
    Sy += ((y0 + y1) * c) / 6;
    Iyy += ((x0 * x0 + x0 * x1 + x1 * x1) * c) / 12; // ∫x²
    Ixx += ((y0 * y0 + y0 * y1 + y1 * y1) * c) / 12; // ∫y²
    Ixy += ((x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c) / 24;
    L += Math.hypot(x1 - x0, y1 - y0);
  }
  return { A, Sx, Sy, Ixx, Iyy, Ixy, L };
}

/** Kontur fein abtasten (Bögen höchstens 0,25°, Bézier 64 Stück) */
function samplePath(loop) {
  const pts = [loop.start];
  let cur = loop.start;
  for (const s of loop.segs) {
    if (s.t === "line") pts.push(s.to);
    else if (s.t === "bez") {
      for (let i = 1; i <= 64; i++) {
        const t = i / 64, u = 1 - t;
        pts.push([0, 1].map((k) => u * u * u * cur[k] + 3 * u * u * t * s.c1[k] + 3 * u * t * t * s.c2[k] + t * t * t * s.to[k]));
      }
    } else {
      const c = circleFrom3(cur, s.mid, s.to);
      if (!c) pts.push(s.to);
      else {
        const ang = (p) => Math.atan2(p[1] - c.y, p[0] - c.x);
        const a0 = ang(cur), am = ang(s.mid), a1 = ang(s.to);
        const norm = (a) => ((a % TAU) + TAU) % TAU;
        const ccw = norm(am - a0) < norm(a1 - a0);
        const sweep = ccw ? norm(a1 - a0) || TAU : -(norm(a0 - a1) || TAU);
        const n = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 720)));
        for (let i = 1; i < n; i++) { const a = a0 + (sweep * i) / n; pts.push([c.x + c.r * Math.cos(a), c.y + c.r * Math.sin(a)]); }
        pts.push(s.to);
      }
    }
    cur = s.to;
  }
  pts.pop(); // letzter Punkt = Startpunkt
  return pts;
}

/** Integrale einer Kontur, immer positiv orientiert; dazu Abtastpunkte für die Randabstände */
export function loopMoments(loop) {
  if (loop.kind === "circle" || loop.kind === "ellipse") {
    const [cx, cy] = loop.c;
    const a = loop.kind === "circle" ? loop.r : loop.a, b = loop.kind === "circle" ? loop.r : loop.b, th = loop.kind === "circle" ? 0 : loop.rot || 0;
    const A = Math.PI * a * b, Iu = (Math.PI * a * b * b * b) / 4, Iv = (Math.PI * a * a * a * b) / 4; // ∫v², ∫u² um die eigenen Achsen
    const c = Math.cos(th), s = Math.sin(th);
    // um den Mittelpunkt, Skizzenachsen: x = u c − v s, y = u s + v c
    const xx = Iv * c * c + Iu * s * s, yy = Iv * s * s + Iu * c * c, xy = (Iv - Iu) * c * s;
    const h = ((a - b) / (a + b)) ** 2, L = Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h))); // Ramanujan
    const pts = Array.from({ length: 360 }, (_, i) => { const t = (i / 360) * TAU, u = a * Math.cos(t), v = b * Math.sin(t); return [cx + u * c - v * s, cy + u * s + v * c]; });
    return { A, Sx: A * cx, Sy: A * cy, Iyy: xx + A * cx * cx, Ixx: yy + A * cy * cy, Ixy: xy + A * cx * cy, L, pts };
  }
  const pts = samplePath(loop);
  const m = polyMoments(pts);
  const k = m.A < 0 ? -1 : 1;
  return { A: k * m.A, Sx: k * m.Sx, Sy: k * m.Sy, Ixx: k * m.Ixx, Iyy: k * m.Iyy, Ixy: k * m.Ixy, L: m.L, pts };
}

/** Kennwerte aus den Integralen (Fläche abzüglich Löcher) */
export function sectionValues(m, pts) {
  const { A } = m;
  if (!(A > 1e-12)) throw new Error("Bereich hat keine Fläche");
  const cx = m.Sx / A, cy = m.Sy / A;
  const Ix = m.Ixx - A * cy * cy, Iy = m.Iyy - A * cx * cx, Ixy = m.Ixy - A * cx * cy;
  const mid = (Ix + Iy) / 2, R = Math.hypot((Ix - Iy) / 2, Ixy);
  const I1 = mid + R, I2 = mid - R;
  const phi = Math.abs(Ixy) < 1e-12 * Math.max(1, Math.abs(Ix) + Math.abs(Iy)) && Ix >= Iy ? 0 : (0.5 * Math.atan2(-2 * Ixy, Ix - Iy) * 180) / Math.PI;
  const ys = pts.map((p) => p[1] - cy), xs = pts.map((p) => p[0] - cx);
  const ey = Math.max(...ys.map(Math.abs)), ex = Math.max(...xs.map(Math.abs));
  return {
    area: A, perimeter: m.L, centroid: [cx, cy],
    Ix, Iy, Ixy, I1, I2, angle: phi,
    ix: Math.sqrt(Ix / A), iy: Math.sqrt(Iy / A),
    Wx: Ix / ey, Wy: Iy / ex, ey, ex,
  };
}

/** Bereichseigenschaften aller geschlossenen Bereiche einer Skizze und ihrer Summe */
export function regionProperties(sketch) {
  const prof = extractProfiles(sketch);
  if (!prof.regions.length) throw new Error("Keine geschlossene Kontur in der Skizze");
  const keys = ["A", "Sx", "Sy", "Ixx", "Iyy", "Ixy"];
  const total = Object.fromEntries([...keys, "L"].map((k) => [k, 0])), allPts = [];
  const regions = prof.regions.map((r) => {
    const o = loopMoments(r.outer), m = { ...o };
    for (const hl of r.holes) { const q = loopMoments(hl); for (const k of keys) m[k] -= q[k]; m.L += q.L; }
    for (const k of [...keys, "L"]) total[k] += m[k];
    allPts.push(...o.pts);
    return { ...sectionValues(m, o.pts), holes: r.holes.length };
  });
  return { regions, total: regions.length > 1 ? sectionValues(total, allPts) : regions[0] };
}
