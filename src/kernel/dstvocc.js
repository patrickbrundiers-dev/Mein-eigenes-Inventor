// DSTV-NC: Bohrungen und Plattenkonturen aus dem fertigen Körper lesen (Stahlbau-Lücken ST1).
// Stäbe: Zylinderflächen quer zur Stabachse = Bohrungen (zwei Halbzylinder = Langloch), Fläche über die Normale.
// Platten: größte ebene Fläche, Dicke entlang der Normalen, Außenkontur mit Bögen, runde Innenkonturen = Bohrungen.
// Den Text schreibt src/core/dstv.js; hier nur Geometrie.
import { faceOf, faceY, holeDia } from "../core/dstv.js";

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
const tup = (p) => (p && typeof p.toTuple === "function" ? p.toTuple() : Array.isArray(p) ? p : [p.x, p.y, p.z]);
const TWO_PI = 2 * Math.PI;

/**
 * Stab: { holes: [{ face, x, y, d, slot? }], skipped: n } aus Körper und Stabachse (meta.axis aus dem Kernel).
 * flat = Flachstahl (alle Bohrungen auf v, y quer über die Breite).
 */
export function memberHoles(K, shape, ax, { flat = false } = {}) {
  const { origin, z, u, v, lo, width: B, height: H } = ax;
  const full = [], half = [];
  let skipped = 0;
  for (const fc of shape.faces) {
    if (fc.geomType !== "CYLINDRE") continue;
    const cyl = K.cylinderAxis(fc);
    const d = norm(cyl.axisD);
    const az = dot(d, z), au = dot(d, u), av = dot(d, v);
    if (Math.abs(az) > 0.999) continue; // Profil selbst (Rohr, Rundungen längs)
    const span = fc.UVBounds.uMax - fc.UVBounds.uMin;
    if (span < Math.PI - 0.02) continue; // Eckradien von Ausschnitten
    if (Math.abs(az) > 0.01 || Math.max(Math.abs(au), Math.abs(av)) < 0.999) { skipped++; continue; } // schräg
    const c = sub(tup(fc.center), origin);
    const cu = dot(c, u), cv = dot(c, v), x = dot(c, z) - lo;
    // Mitte einer Halbschale liegt neben der Achse: auf die Achse ziehen (Lage quer zur Achse aus axisP)
    const p = sub(cyl.axisP, origin);
    const along = [dot(p, u), dot(p, v), dot(p, z) - lo];
    const isU = Math.abs(au) >= Math.abs(av);
    const pt = { x: along[2], cu: isU ? cu : along[0], cv: isU ? along[1] : cv, r: cyl.radius, isU, span, xRaw: x };
    (span > TWO_PI - 0.05 ? full : half).push(pt);
  }
  const holes = [];
  const push = (q, slot) => {
    const face = faceOf(q.isU ? 1 : 0, q.isU ? 0 : 1, q.cu, q.cv, flat);
    holes.push({ face, x: q.x, y: faceY(face, q.cu, q.cv, B, H, flat), d: holeDia(2 * q.r), ...(slot ? { slot } : {}) });
  };
  for (const q of full) push(q);
  // Halbschalen paaren: gleicher Radius, gleiche Richtung, gleiche Wand → Langloch (oder geteilte Bohrung)
  const used = new Set();
  for (let i = 0; i < half.length; i++) {
    if (used.has(i)) continue;
    const a = half[i];
    let best = -1, bd = Infinity;
    for (let j = i + 1; j < half.length; j++) {
      const b = half[j];
      if (used.has(j) || b.isU !== a.isU || Math.abs(b.r - a.r) > 0.01) continue;
      const wall = a.isU ? Math.abs(a.cu - b.cu) : Math.abs(a.cv - b.cv);
      if (wall > 0.5) continue;
      const dd = Math.hypot(b.x - a.x, a.isU ? b.cv - a.cv : b.cu - a.cu);
      if (dd < bd) { bd = dd; best = j; }
    }
    if (best < 0) { skipped++; continue; }
    used.add(i); used.add(best);
    const b = half[best];
    const mid = { ...a, x: (a.x + b.x) / 2, cu: (a.cu + b.cu) / 2, cv: (a.cv + b.cv) / 2 };
    if (bd < 0.01) push(mid);
    else {
      const dq = a.isU ? b.cv - a.cv : b.cu - a.cu;
      let ang = (Math.atan2(dq, b.x - a.x) * 180) / Math.PI;
      if (ang < 0) ang += 180;
      if (ang >= 180 - 1e-6) ang = 0;
      push(mid, { l: bd, angle: Math.round(ang * 100) / 100 });
    }
  }
  return { holes, skipped };
}

/** Ebene Platte? Größte ebene Fläche, Dicke und Prüfung Volumen = Fläche × Dicke (gerade Kanten, durchgehende Löcher) */
export function plateInfo(R, shape) {
  let best = null;
  for (const f of shape.faces) {
    if (f.geomType !== "PLANE") continue;
    let a = 0;
    try { a = R.measureArea(f); } catch { continue; }
    if (!best || a > best.area + 1e-9) best = { area: a, face: f };
  }
  if (!best) return null;
  const n = norm(tup(best.face.normalAt()));
  const m = shape.mesh({ tolerance: 0.05, angularTolerance: 0.3 });
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < m.vertices.length; i += 3) { const t = m.vertices[i] * n[0] + m.vertices[i + 1] * n[1] + m.vertices[i + 2] * n[2]; lo = Math.min(lo, t); hi = Math.max(hi, t); }
  const t = hi - lo, vol = R.measureVolume(shape);
  if (!(t > 0) || Math.abs(vol - best.area * t) > 0.015 * vol) return null;
  return { face: best.face, n, t, area: best.area };
}

/** Kanten einer Drahtschleife als Abschnitte {P, Q, M, arc} (Punkte 3D), in Laufrichtung verkettet */
function loopSegments(wire) {
  const raw = wire.edges.map((e) => {
    const type = e.geomType;
    const P = tup(e.startPoint), Q = tup(e.endPoint);
    if (type === "LINE") return [{ P, Q, arc: false }];
    const closed = Math.hypot(...sub(P, Q)) < 1e-6;
    if (type === "CIRCLE") {
      // ganze Kreise in zwei Hälften, sonst ein Bogen über die Mitte
      if (closed) return [{ P, Q: tup(e.pointAt(0.5)), M: tup(e.pointAt(0.25)), arc: true }, { P: tup(e.pointAt(0.5)), Q, M: tup(e.pointAt(0.75)), arc: true }];
      return [{ P, Q, M: tup(e.pointAt(0.5)), arc: true }];
    }
    // Ellipse, Spline: als Polygon
    const n = 16, pts = Array.from({ length: n + 1 }, (_, i) => tup(e.pointAt(i / n)));
    return pts.slice(0, -1).map((p, i) => ({ P: p, Q: pts[i + 1], arc: false }));
  });
  const segs = [];
  const pool = raw.map((r) => r);
  const same = (a, b) => Math.hypot(...sub(a, b)) < 1e-3;
  let cur = pool.shift();
  segs.push(...cur);
  while (pool.length) {
    const end = segs[segs.length - 1].Q;
    const i = pool.findIndex((g) => same(g[0].P, end) || same(g[g.length - 1].Q, end));
    if (i < 0) break;
    let g = pool.splice(i, 1)[0];
    if (!same(g[0].P, end)) g = g.slice().reverse().map((s) => ({ ...s, P: s.Q, Q: s.P }));
    segs.push(...g);
  }
  return segs;
}

/** Abschnitte in 2D (x, y in der Ebene) und als DSTV-Punktliste [[x, y, r]] (r an dem Punkt, an dem der Bogen beginnt) */
function toPoints(segs2, ccw) {
  // Umlaufsinn über die Fläche (Bögen über ihre Mitte)
  let area = 0;
  for (const s of segs2) {
    const pts = s.arc ? [s.P, s.M] : [s.P];
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = i + 1 < pts.length ? pts[i + 1] : s.Q; area += a[0] * b[1] - b[0] * a[1]; }
  }
  let list = segs2;
  if ((area > 0) !== ccw) list = [...segs2].reverse().map((s) => ({ ...s, P: s.Q, Q: s.P }));
  const out = [];
  for (const s of list) {
    if (!s.arc) { out.push([s.P[0], s.P[1], 0]); continue; }
    const arcs = splitArc(s);
    for (const a of arcs) out.push([a.P[0], a.P[1], a.r]);
  }
  return out;
}
/** Bogen P→M→Q: vorzeichenbehafteter Radius (+ = gegen den Uhrzeiger), Bögen über 180° geteilt */
function splitArc(s) {
  const c = circle(s.P, s.M, s.Q);
  if (!c) return [{ P: s.P, r: 0 }];
  const turn = (s.M[0] - s.P[0]) * (s.Q[1] - s.M[1]) - (s.M[1] - s.P[1]) * (s.Q[0] - s.M[0]);
  const sign = turn > 0 ? 1 : -1;
  // großer Bogen: Mittelpunkt und Bogenmitte auf derselben Seite der Sehne
  const side = (p) => (s.Q[0] - s.P[0]) * (p[1] - s.P[1]) - (s.Q[1] - s.P[1]) * (p[0] - s.P[0]);
  if (side(c.c) * side(s.M) > 0) return [{ P: s.P, r: sign * c.r }, { P: s.M, r: sign * c.r }];
  return [{ P: s.P, r: sign * c.r }];
}
function circle(a, b, c) {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) return null;
  const s = (p) => p[0] * p[0] + p[1] * p[1];
  const ux = (s(a) * (b[1] - c[1]) + s(b) * (c[1] - a[1]) + s(c) * (a[1] - b[1])) / d;
  const uy = (s(a) * (c[0] - b[0]) + s(b) * (a[0] - c[0]) + s(c) * (b[0] - a[0])) / d;
  return { c: [ux, uy], r: Math.hypot(a[0] - ux, a[1] - uy) };
}

/**
 * Platte: { t, length, width, ak, ik, holes } – Ebene über die größte Fläche, x entlang der längsten geraden Außenkante,
 * Ursprung links unten an der Außenkontur.
 */
export function plateNc(R, shape) {
  const info = plateInfo(R, shape);
  if (!info) return null;
  const { face, n, t } = info;
  const outer = face.clone().outerWire();
  const inner = face.clone().innerWires();
  const oSegs = loopSegments(outer);
  let xd = null, best = 0;
  for (const s of oSegs) { if (s.arc) continue; const l = Math.hypot(...sub(s.Q, s.P)); if (l > best + 1e-9) { best = l; xd = norm(sub(s.Q, s.P)); } }
  if (!xd) { const up = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]; xd = norm(cross(up, n)); }
  const yd = cross(n, xd);
  const O = oSegs[0].P;
  const to2 = (p) => { const q = sub(p, O); return [dot(q, xd), dot(q, yd)]; };
  const flat = (segs) => segs.map((s) => ({ P: to2(s.P), Q: to2(s.Q), M: s.M ? to2(s.M) : null, arc: s.arc }));
  const o2 = flat(oSegs);
  const all = o2.flatMap((s) => (s.arc ? [s.P, s.M, s.Q, ...arcExtremes(s)] : [s.P, s.Q]));
  const mx = Math.min(...all.map((p) => p[0])), my = Math.min(...all.map((p) => p[1]));
  const shift = (segs) => segs.map((s) => ({ ...s, P: [s.P[0] - mx, s.P[1] - my], Q: [s.Q[0] - mx, s.Q[1] - my], M: s.M ? [s.M[0] - mx, s.M[1] - my] : null }));
  const ak = toPoints(shift(o2), true);
  const ik = [], holes = [];
  for (const w of inner) {
    const segs = shift(flat(loopSegments(w)));
    // runde Öffnung (ein Kreis, in Hälften) → Bohrung
    if (segs.length === 2 && segs.every((s) => s.arc)) {
      const c = circle(segs[0].P, segs[0].M, segs[0].Q);
      if (c) { holes.push({ face: "v", x: c.c[0], y: c.c[1], d: holeDia(2 * c.r) }); continue; }
    }
    ik.push(toPoints(segs, false));
  }
  const xs = all.map((p) => p[0] - mx), ys = all.map((p) => p[1] - my);
  return { t, length: Math.max(...xs), width: Math.max(...ys), ak, ik, holes, area: info.area };
}
/** Achsparallele Extrempunkte eines Bogens (für die Hüllbox der Kontur) */
function arcExtremes(s) {
  const c = circle(s.P, s.M, s.Q);
  if (!c) return [];
  const ang = (p) => Math.atan2(p[1] - c.c[1], p[0] - c.c[0]);
  const a0 = ang(s.P), am = ang(s.M), a1 = ang(s.Q);
  const norm2 = (x) => ((x % TWO_PI) + TWO_PI) % TWO_PI;
  const ccw = norm2(am - a0) < norm2(a1 - a0);
  const sweep = ccw ? norm2(a1 - a0) : norm2(a0 - a1);
  const out = [];
  for (const k of [0, 0.5, 1, 1.5].map((x) => x * Math.PI)) {
    const d = ccw ? norm2(k - a0) : norm2(a0 - k);
    if (d <= sweep) out.push([c.c[0] + c.r * Math.cos(k), c.c[1] + c.r * Math.sin(k)]);
  }
  return out;
}
