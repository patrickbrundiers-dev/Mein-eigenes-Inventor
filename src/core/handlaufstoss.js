// Handlaufstoß bei Überlänge (O2, wie HiCAD »Handlauf segmentweise teilen«): der Handlauf-Zug wird in Stücke bis zur
// Stangenlänge geteilt. Der Stoß liegt kurz hinter einem Pfosten (neben dem Handlaufhalter) und nicht an einer Ecke.
// Hohlprofile bekommen einen Einschiebling (Rohr bzw. Rechteckrohr, innen 0,5 mm Luft), Vollprofile einen
// stumpfen Stoß (verschweißt).
import { sectionGeometry } from "./sections.js";

const sub = (a, b) => a.map((x, i) => x - b[i]);
const len = (a) => Math.hypot(...a);

/** Bogenlängen der Punkte eines Linienzugs */
export function arcLengths(pts) {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + len(sub(pts[i], pts[i - 1])));
  return s;
}

/** Punkt bei Bogenlänge t: { p, d (Richtung), seg } */
export function pointAt(pts, t) {
  const s = arcLengths(pts);
  let i = 1;
  while (i < pts.length - 1 && s[i] < t) i++;
  const a = pts[i - 1], b = pts[i], L = s[i] - s[i - 1] || 1, u = Math.max(0, Math.min(1, (t - s[i - 1]) / L));
  return { p: a.map((x, k) => x + (b[k] - x) * u), d: sub(b, a).map((x) => x / L), seg: i - 1 };
}

/** Bogenlänge des Fußpunkts von q (nur x/y) auf dem Linienzug */
export function paramOf(pts, q) {
  const s = arcLengths(pts);
  let best = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = [b[0] - a[0], b[1] - a[1]], L2 = d[0] * d[0] + d[1] * d[1] || 1;
    const u = Math.max(0, Math.min(1, ((q[0] - a[0]) * d[0] + (q[1] - a[1]) * d[1]) / L2));
    const e = Math.hypot(a[0] + d[0] * u - q[0], a[1] + d[1] * u - q[1]);
    if (!best || e < best.e) best = { e, t: s[i - 1] + u * (s[i] - s[i - 1]) };
  }
  return best?.t ?? 0;
}

/**
 * Stoßstellen (Bogenlängen) für einen Zug der Länge total: Stücke ≤ max; bevorzugt off hinter einer Pfostenstelle
 * (posts: Bogenlängen), mindestens minPiece vom vorigen Stoß und clear von jeder Ecke (corners: Bogenlängen).
 */
export function jointStations(total, { max, posts = [], corners = [], off = 150, minPiece = 500, clear = 100 }) {
  if (!(max > minPiece)) throw new Error("Stangenlänge zu klein");
  const out = [];
  let start = 0;
  const ok = (t) => t - start >= minPiece && total - t >= minPiece / 2 && corners.every((c) => Math.abs(c - t) > clear);
  while (total - start > max + 1e-6) {
    const cand = posts.map((q) => q + off).filter((t) => t <= start + max + 1e-6 && ok(t));
    let t = cand.length ? Math.max(...cand) : start + max;
    if (!cand.length) for (const c of corners) if (Math.abs(c - t) <= clear) t = c - clear - 1;
    if (!(t > start + 1)) throw new Error("Handlauf lässt sich nicht teilen");
    out.push(t);
    start = t;
  }
  return out;
}

/** Linienzug an den Bogenlängen ts teilen → Liste von Linienzügen */
export function splitPolyline(pts, ts) {
  const s = arcLengths(pts), out = [];
  let cur = [pts[0]], k = 0;
  const cuts = [...ts].sort((a, b) => a - b);
  for (let i = 1; i < pts.length; i++) {
    while (k < cuts.length && cuts[k] < s[i] - 1e-9) {
      const q = pointAt(pts, cuts[k]).p;
      cur.push(q); out.push(cur); cur = [q]; k++;
    }
    cur.push(pts[i]);
  }
  out.push(cur);
  return out;
}

/** Einschiebling für ein Hohlprofil am Stoß p in Richtung d (Länge L), sonst null (Vollprofil: stumpf) */
export function sleeveFor(section, p, d, L = 160, name = "Einschiebling") {
  const dims = section.dims || {}, gap = 0.5;
  let sec = null;
  if (section.kind === "rohr") {
    const D = dims.D - 2 * dims.t - 2 * gap, t = Math.min(dims.t + 0.4, D / 4);
    if (D > 2 * t + 2) sec = { kind: "rohr", dims: { D, t } };
  } else if (section.kind === "vierkant" || section.kind === "rechteck") {
    const B = dims.B - 2 * dims.t - 2 * gap, H = (section.kind === "vierkant" ? dims.B : dims.H) - 2 * dims.t - 2 * gap, t = dims.t;
    if (Math.min(B, H) > 2 * t + 2) sec = { kind: "rechteck", dims: { B, H, t, r: Math.max(0, (dims.r || 0) - dims.t) } };
  }
  if (!sec) return null;
  sec.geom = sectionGeometry(sec.kind, sec.dims);
  sec.size = Object.values(sec.dims).map((x) => Math.round(x * 10) / 10).join("x");
  const a = p.map((x, i) => x - (d[i] * L) / 2), b = p.map((x, i) => x + (d[i] * L) / 2);
  return { section: sec, a, b, name };
}
