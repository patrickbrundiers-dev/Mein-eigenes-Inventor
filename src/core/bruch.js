// Bruchansicht (lange Teile verkürzt, ISO 128-30) und Ausbruch (örtlicher Teilschnitt) für Zeichnungsansichten.
// Alle Koordinaten sind Ansichtskoordinaten (mm am Modell); die Bruchansicht verschiebt nur die Darstellung,
// Maße zeigen weiter die wahre Länge.

/** Brüche prüfen und ordnen: [{a, b}] mit a < b, nicht überlappend, Mindestbreite 1 mm */
export function normalizeBreaks(list = []) {
  const out = list.map((x) => ({ a: Math.min(+x.a, +x.b), b: Math.max(+x.a, +x.b) })).filter((x) => Number.isFinite(x.a) && Number.isFinite(x.b) && x.b - x.a >= 1).sort((p, q) => p.a - q.a);
  for (let i = 1; i < out.length; i++) if (out[i].a < out[i - 1].b) throw new Error("Bruchbereiche überlappen");
  return out;
}

/**
 * Abbildung Modell → verkürzte Darstellung längs einer Achse (axis "u" waagerecht, "v" senkrecht).
 * Jeder Bruchbereich (a, b) schrumpft auf die Lücke gap. Rückgabe { map(u,v), unmap(u,v), removed(x), cuts: [x der Bruchlinien] }.
 */
export function breakMap(breaks, axis = "u", gap = 8) {
  const B = normalizeBreaks(breaks);
  const i = axis === "v" ? 1 : 0;
  const m1 = (x) => {
    let s = 0;
    for (const { a, b } of B) {
      if (x >= b) s += b - a - gap;
      else if (x > a) return a - s + Math.min(gap, ((x - a) / (b - a)) * gap);
    }
    return x - s;
  };
  const u1 = (y) => {
    let s = 0;
    for (const { a, b } of B) {
      const ya = a - s;
      if (y <= ya) return y + s;
      if (y < ya + gap) return a + ((y - ya) / gap) * (b - a);
      s += b - a - gap;
    }
    return y + s;
  };
  const wrap = (f) => (u, v) => { const p = [u, v]; p[i] = f(p[i]); return p; };
  return {
    breaks: B, axis, gap,
    map: wrap(m1), unmap: wrap(u1),
    removed: (x) => B.some(({ a, b }) => x > a + 1e-9 && x < b - 1e-9),
    cuts: B.map(({ a }) => [m1(a), m1(a) + gap]),
  };
}

/** Linienzüge an den Bruchbereichen teilen; Stücke im entfernten Bereich entfallen (Koordinaten bleiben Modellkoordinaten) */
export function clipBreaks(polylines, bm) {
  if (!bm?.breaks.length) return polylines || [];
  const i = bm.axis === "v" ? 1 : 0;
  const out = [];
  for (const pl of polylines || []) {
    let cur = null;
    const push = (p) => { if (!cur) { cur = [p]; out.push(cur); } else cur.push(p); };
    for (let k = 0; k + 1 < pl.length; k++) {
      const A = pl[k], Bp = pl[k + 1];
      // Teilungsparameter an allen Bruchgrenzen
      const ts = [0, 1];
      for (const { a, b } of bm.breaks) for (const x of [a, b]) {
        const d = Bp[i] - A[i];
        if (Math.abs(d) > 1e-12) { const t = (x - A[i]) / d; if (t > 1e-9 && t < 1 - 1e-9) ts.push(t); }
      }
      ts.sort((x, y) => x - y);
      for (let j = 0; j + 1 < ts.length; j++) {
        const t0 = ts[j], t1 = ts[j + 1], tm = (t0 + t1) / 2;
        const P = (t) => [A[0] + (Bp[0] - A[0]) * t, A[1] + (Bp[1] - A[1]) * t];
        if (bm.removed(P(tm)[i])) { cur = null; continue; }
        if (!cur) push(P(t0));
        push(P(t1));
      }
    }
  }
  return out.filter((x) => x.length > 1);
}

/** Polygon an einer Halbebene beschneiden (Sutherland–Hodgman): behalten, wo side(p) ≥ 0 */
function clipHalf(poly, side) {
  const out = [];
  for (let k = 0; k < poly.length; k++) {
    const P = poly[k], Q = poly[(k + 1) % poly.length], sp = side(P), sq = side(Q);
    if (sp >= 0) out.push(P);
    if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
  }
  return out;
}

/** Schnittflächen (geschlossene Schleifen) an den Bruchbereichen teilen */
export function clipLoopsBreaks(loops, bm) {
  if (!bm?.breaks.length) return loops || [];
  const i = bm.axis === "v" ? 1 : 0;
  const edges = [-Infinity, ...bm.breaks.flatMap(({ a, b }) => [a, b]), Infinity];
  const out = [];
  for (const L of loops || []) {
    for (let k = 0; k + 1 < edges.length; k += 2) {
      const lo = edges[k], hi = edges[k + 1];
      let p = L;
      if (lo > -Infinity) p = clipHalf(p, (q) => q[i] - lo);
      if (hi < Infinity) p = clipHalf(p, (q) => hi - q[i]);
      if (p.length >= 3) out.push(p);
    }
  }
  return out;
}

/** Bruchlinie als Zickzack (ISO 128-20, schmale Zickzacklinie) quer zur Achse an Stelle x zwischen lo und hi */
export function zigzag(x, lo, hi, axis = "u", { amp = 1.5, n = 3, over = 2 } = {}) {
  const L = hi - lo + 2 * over, mid = (lo + hi) / 2, s = L / (n * 2 + 2);
  const pts = [[x, lo - over]];
  const c0 = mid - (n * s);
  pts.push([x, c0]);
  for (let k = 0; k < n * 2; k++) pts.push([x + (k % 2 ? -amp : amp), c0 + s * (k + 0.5)]);
  pts.push([x, c0 + s * n * 2], [x, hi + over]);
  return axis === "v" ? pts.map(([a, b]) => [b, a]) : pts;
}

// ---------- Ausbruch ----------

/** Linienzug außerhalb eines Kreises (Gegenstück zu clipPolylineToCircle) */
export function clipOutsideCircle(pl, c, r) {
  const out = [];
  let cur = null;
  for (let k = 0; k + 1 < pl.length; k++) {
    const A = pl[k], B = pl[k + 1];
    const dx = B[0] - A[0], dy = B[1] - A[1], fx = A[0] - c[0], fy = A[1] - c[1];
    const a2 = dx * dx + dy * dy, b2 = 2 * (fx * dx + fy * dy), c2 = fx * fx + fy * fy - r * r;
    const ts = [0, 1];
    const disc = b2 * b2 - 4 * a2 * c2;
    if (a2 > 1e-18 && disc > 0) { const s = Math.sqrt(disc); for (const t of [(-b2 - s) / (2 * a2), (-b2 + s) / (2 * a2)]) if (t > 1e-12 && t < 1 - 1e-12) ts.push(t); }
    ts.sort((x, y) => x - y);
    for (let j = 0; j + 1 < ts.length; j++) {
      const P = (t) => [A[0] + dx * t, A[1] + dy * t];
      const m = P((ts[j] + ts[j + 1]) / 2);
      if (Math.hypot(m[0] - c[0], m[1] - c[1]) < r - 1e-9) { cur = null; continue; }
      if (!cur) { cur = [P(ts[j])]; out.push(cur); }
      cur.push(P(ts[j + 1]));
    }
  }
  return out.filter((x) => x.length > 1);
}

/** Kreis als Polygon (für das Beschneiden der Schnittflächen) */
const circlePoly = (c, r, n = 48) => Array.from({ length: n }, (_, k) => [c[0] + r * Math.cos((2 * Math.PI * k) / n), c[1] + r * Math.sin((2 * Math.PI * k) / n)]);

/**
 * Ausbruch zusammensetzen: außerhalb des Kreises die normale Projektion, innerhalb die geschnittene mit Schraffur.
 * raw: Kernel-Projektion der Ansicht; bos: [{ c: [u, v], r, proj }] mit proj = Projektion mit Schnittebene (gleiche Kamera).
 */
export function composeBreakout(raw, bos) {
  let vis = raw.visible || [], hid = raw.hidden || [], arcs = raw.arcs || [], harcs = raw.hiddenArcs || [];
  const loops = [...(raw.sectionLoops || [])];
  const addVis = [], addHid = [], addArcs = [];
  for (const { c, r, proj } of bos) {
    const out = (list) => list.flatMap((pl) => clipOutsideCircle(pl, c, r));
    vis = out(vis); hid = out(hid);
    const outsideArc = (a) => Math.hypot(a.cx - c[0], a.cy - c[1]) + a.r > r + 1e-9; // ganz im Ausbruch liegende Kreise zeigt der Schnitt
    arcs = arcs.filter(outsideArc); harcs = harcs.filter(outsideArc);
    const src = proj;
    if (!src) continue;
    const inside = (list) => list.flatMap((pl) => clipInsideCircle(pl, c, r));
    addVis.push(...inside(src.visible || []));
    addHid.push(...inside(src.hidden || []));
    addArcs.push(...(src.arcs || []).filter((a) => Math.hypot(a.cx - c[0], a.cy - c[1]) + a.r <= r + 1e-9));
    const poly = circlePoly(c, r);
    for (const L of src.sectionLoops || []) {
      let p = L;
      for (let k = 0; k < poly.length; k++) { const P = poly[k], Q = poly[(k + 1) % poly.length]; p = clipHalf(p, (q) => (Q[0] - P[0]) * (q[1] - P[1]) - (Q[1] - P[1]) * (q[0] - P[0])); if (p.length < 3) break; }
      if (p.length >= 3) loops.push(p);
    }
  }
  return { ...raw, visible: [...vis, ...addVis], hidden: [...hid, ...addHid], arcs: [...arcs, ...addArcs], hiddenArcs: harcs, sectionLoops: loops };
}

/** Linienzug innerhalb eines Kreises */
export function clipInsideCircle(pl, c, r) {
  const out = [];
  let cur = null;
  for (let k = 0; k + 1 < pl.length; k++) {
    const A = pl[k], B = pl[k + 1];
    const dx = B[0] - A[0], dy = B[1] - A[1], fx = A[0] - c[0], fy = A[1] - c[1];
    const a2 = dx * dx + dy * dy, b2 = 2 * (fx * dx + fy * dy), c2 = fx * fx + fy * fy - r * r;
    const ts = [0, 1];
    const disc = b2 * b2 - 4 * a2 * c2;
    if (a2 > 1e-18 && disc > 0) { const s = Math.sqrt(disc); for (const t of [(-b2 - s) / (2 * a2), (-b2 + s) / (2 * a2)]) if (t > 1e-12 && t < 1 - 1e-12) ts.push(t); }
    ts.sort((x, y) => x - y);
    for (let j = 0; j + 1 < ts.length; j++) {
      const P = (t) => [A[0] + dx * t, A[1] + dy * t];
      const m = P((ts[j] + ts[j + 1]) / 2);
      if (Math.hypot(m[0] - c[0], m[1] - c[1]) > r + 1e-9) { cur = null; continue; }
      if (!cur) { cur = [P(ts[j])]; out.push(cur); }
      cur.push(P(ts[j + 1]));
    }
  }
  return out.filter((x) => x.length > 1);
}

/** Tiefe der Schnittebene längs der Blickrichtung aus den Körper-Hüllquadern: { min, max } von n·p (n = −Blickrichtung) */
export function depthRange(bboxes, n) {
  let min = Infinity, max = -Infinity;
  for (const [lo, hi] of bboxes) for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) {
    const d = n[0] * x + n[1] * y + n[2] * z;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return Number.isFinite(min) ? { min, max } : null;
}
