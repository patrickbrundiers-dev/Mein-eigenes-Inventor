// Skizzen-Datenmodell: Profile (geschlossene Konturen) finden, Punkte für Bohrungen, Hilfen

import { ellipseGeom, ellipseSamples } from "./ellipse.js";
import { splineBeziers } from "./spline.js";

/** Kontrollpunkte eines Splines als [[x,y]…] (fehlende Punkte → null) */
export function splineCtrl(e, pts) {
  const out = [];
  for (const id of e.pts || []) { const p = pts.get(id); if (!p) return null; out.push([p.x, p.y]); }
  return out.length >= 2 ? out : null;
}
/** Bézier-Abschnitte {t:"bez", c1, c2, to} eines Splines, wahlweise rückwärts */
function splineSegs(ctrl, reverse) {
  const B = splineBeziers(reverse ? [...ctrl].reverse() : ctrl);
  return B.segs.map(([c1, c2, to]) => ({ t: "bez", c1, c2, to }));
}

export function newSketch(id, name, plane) {
  return { id, type: "sketch", name, plane, offset: "0", points: [], entities: [], constraints: [] };
}

const TAU = Math.PI * 2;

export function arcGeometry(c, p1, p2) {
  const r = Math.hypot(p1.x - c.x, p1.y - c.y);
  const a1 = Math.atan2(p1.y - c.y, p1.x - c.x);
  let a2 = Math.atan2(p2.y - c.y, p2.x - c.x);
  let sweep = a2 - a1;
  while (sweep <= 1e-12) sweep += TAU;
  const am = a1 + sweep / 2;
  return { r, a1, a2: a1 + sweep, sweep, mid: { x: c.x + r * Math.cos(am), y: c.y + r * Math.sin(am) } };
}

/** Punkte einer Kontur für Flächen-/Inklusionstests */
function sampleLoop(loop) {
  if (loop.kind === "ellipse") return ellipseSamples({ cx: loop.c[0], cy: loop.c[1], A: loop.a, B: loop.b, ux: Math.cos(loop.rot), uy: Math.sin(loop.rot) }, 64);
  if (loop.kind === "circle") {
    const pts = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU;
      pts.push([loop.c[0] + loop.r * Math.cos(a), loop.c[1] + loop.r * Math.sin(a)]);
    }
    return pts;
  }
  const pts = [loop.start];
  let cur = loop.start;
  for (const s of loop.segs) {
    if (s.t === "line") pts.push(s.to);
    else if (s.t === "bez") {
      for (let i = 1; i <= 12; i++) {
        const t = i / 12, u = 1 - t;
        pts.push([u * u * u * cur[0] + 3 * u * u * t * s.c1[0] + 3 * u * t * t * s.c2[0] + t * t * t * s.to[0], u * u * u * cur[1] + 3 * u * u * t * s.c1[1] + 3 * u * t * t * s.c2[1] + t * t * t * s.to[1]]);
      }
    } else {
      // Bogen über 3 Punkte abtasten
      const c = circleFrom3(cur, s.mid, s.to);
      if (!c) { pts.push(s.to); cur = s.to; continue; }
      const a0 = Math.atan2(cur[1] - c.y, cur[0] - c.x);
      const am = Math.atan2(s.mid[1] - c.y, s.mid[0] - c.x);
      const a1 = Math.atan2(s.to[1] - c.y, s.to[0] - c.x);
      const ccw = isBetweenCCW(a0, am, a1);
      let sweep = ccw ? norm2pi(a1 - a0) : -norm2pi(a0 - a1);
      const n = Math.max(4, Math.ceil(Math.abs(sweep) / (Math.PI / 24)));
      for (let i = 1; i <= n; i++) {
        const a = a0 + (sweep * i) / n;
        pts.push([c.x + c.r * Math.cos(a), c.y + c.r * Math.sin(a)]);
      }
    }
    cur = s.to;
  }
  return pts;
}
const norm2pi = (a) => { while (a < 0) a += TAU; while (a >= TAU) a -= TAU; return a; };
function isBetweenCCW(a0, am, a1) {
  return norm2pi(am - a0) < norm2pi(a1 - a0);
}
export function circleFrom3(a, b, c) {
  const ax = a[0], ay = a[1], bx = b[0], by = b[1], cx = c[0], cy = c[1];
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return null;
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  return { x: ux, y: uy, r: Math.hypot(ax - ux, ay - uy) };
}
function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}
function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Findet geschlossene Konturen in einer Skizze.
 * Rückgabe: {regions: [{outer, holes:[]}], loops, errors:[], openPoints:[ids]}
 * Segmente: {t:'line',to} | {t:'arc',to,mid} | {t:'bez',c1,c2,to} (Spline als kubische Bézier-Abschnitte)
 * loop: {kind:'circle', c:[x,y], r} | {kind:'ellipse', c, a, b, rot (Bogenmaß, Richtung der Halbachse a)} | {kind:'path', start:[x,y], segs:[{t:'line',to}|{t:'arc',to,mid}]}
 */
export function extractProfiles(sketch) {
  const pts = new Map(sketch.points.map((p) => [p.id, p]));
  const errors = [];
  // Punkte vereinigen (Koinzidenz-Bedingung oder gleiche Lage)
  const parent = new Map();
  const find = (a) => { while (parent.get(a) !== a && parent.has(a)) a = parent.get(a); return a; };
  for (const p of sketch.points) parent.set(p.id, p.id);
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const c of sketch.constraints) if (c.type === "coincident" && pts.has(c.p) && pts.has(c.q)) union(c.p, c.q);
  const arr = sketch.points;
  for (let i = 0; i < arr.length; i++)
    for (let j = i + 1; j < arr.length; j++)
      if (Math.hypot(arr[i].x - arr[j].x, arr[i].y - arr[j].y) < 1e-6) union(arr[i].id, arr[j].id);

  const loops = [];
  const edges = [];
  for (const e of sketch.entities) {
    if (e.construction) continue;
    if (e.type === "circle") {
      const c = pts.get(e.c);
      if (c && e.r > 1e-9) loops.push({ kind: "circle", c: [c.x, c.y], r: e.r, ents: [e.id] });
    } else if (e.type === "ellipse") {
      const c = pts.get(e.c), a = pts.get(e.a);
      if (!c || !a) continue;
      const g = ellipseGeom(c, a, e.r);
      if (g.A > 1e-9 && g.B > 1e-9) loops.push({ kind: "ellipse", c: [c.x, c.y], a: g.A, b: g.B, rot: g.rot, ents: [e.id] });
    } else if (e.type === "spline") {
      const ctrl = splineCtrl(e, pts);
      if (!ctrl) continue;
      const a = find(e.p1), b = find(e.p2);
      if (a === b) { // geschlossener Spline: eigene Kontur
        loops.push({ kind: "path", start: ctrl[0], segs: splineSegs(ctrl, false), ents: [e.id] });
        loops[loops.length - 1].segs.at(-1).to = ctrl[0];
        continue;
      }
      edges.push({ e, a, b });
    } else if (e.type === "line" || e.type === "arc") {
      const a = find(e.p1), b = find(e.p2);
      if (a === b) continue;
      edges.push({ e, a, b });
    }
  }
  // Adjazenz
  const adj = new Map();
  for (const ed of edges) {
    for (const k of [ed.a, ed.b]) {
      if (!adj.has(k)) adj.set(k, []);
      adj.get(k).push(ed);
    }
  }
  const openPoints = [];
  const branchPoints = [];
  for (const [k, list] of adj) {
    if (list.length === 1) openPoints.push(k);
    if (list.length > 2) branchPoints.push(k);
  }
  const used = new Set();
  const P = (id) => { const p = pts.get(id); return [p.x, p.y]; };
  for (const ed0 of edges) {
    if (used.has(ed0)) continue;
    // Komponente sammeln
    const comp = [];
    const stack = [ed0];
    const seen = new Set([ed0]);
    while (stack.length) {
      const ed = stack.pop();
      comp.push(ed);
      for (const k of [ed.a, ed.b]) for (const n of adj.get(k)) if (!seen.has(n)) { seen.add(n); stack.push(n); }
    }
    comp.forEach((c) => used.add(c));
    const nodes = new Set(comp.flatMap((c) => [c.a, c.b]));
    const bad = [...nodes].filter((n) => adj.get(n).length !== 2);
    if (bad.length) {
      if (bad.some((n) => adj.get(n).length === 1)) errors.push("Kontur nicht geschlossen (offene Enden markiert)");
      else errors.push("Kontur verzweigt sich – bitte Linien an Kreuzungen trennen oder als Konstruktionslinie markieren");
      continue;
    }
    // Ablaufen
    const start = ed0.a;
    let curNode = start;
    let curEdge = ed0;
    const segs = [];
    const ents = [];
    let guard = 0;
    do {
      const next = curEdge.a === curNode ? curEdge.b : curEdge.a;
      const e = curEdge.e;
      ents.push(e.id);
      if (e.type === "line") segs.push({ t: "line", to: P(next) });
      else if (e.type === "spline") {
        const ss = splineSegs(splineCtrl(e, pts), curEdge.a !== curNode);
        ss[ss.length - 1].to = P(next);
        segs.push(...ss);
      } else {
        const c = pts.get(e.c), p1 = pts.get(e.p1), p2 = pts.get(e.p2);
        const g = arcGeometry(c, p1, p2);
        segs.push({ t: "arc", to: P(next), mid: [g.mid.x, g.mid.y] });
      }
      curNode = next;
      const list = adj.get(curNode);
      curEdge = list[0] === curEdge ? list[1] : list[0];
    } while (curNode !== start && ++guard < 10000);
    // Endpunkte exakt schließen
    const s0 = P(start);
    segs[segs.length - 1].to = s0;
    loops.push({ kind: "path", start: s0, segs, ents });
  }

  // Verschachtelung bestimmen
  const samples = loops.map(sampleLoop);
  const areas = samples.map((s) => Math.abs(polyArea(s)));
  const depth = loops.map(() => 0);
  const parentLoop = loops.map(() => -1);
  for (let i = 0; i < loops.length; i++) {
    const testPt = innerTestPoint(samples[i]);
    let bestParent = -1;
    for (let j = 0; j < loops.length; j++) {
      if (i === j || areas[j] <= areas[i]) continue;
      if (pointInPoly(testPt, samples[j])) {
        depth[i]++;
        if (bestParent < 0 || areas[j] < areas[bestParent]) bestParent = j;
      }
    }
    parentLoop[i] = bestParent;
  }
  const regions = [];
  loops.forEach((l, i) => {
    if (depth[i] % 2 === 0) {
      regions.push({ outer: l, holes: loops.filter((_, k) => parentLoop[k] === i && depth[k] === depth[i] + 1), area: areas[i] });
    }
  });
  for (const r of regions) r.area -= r.holes.reduce((s, h) => s + Math.abs(polyArea(sampleLoop(h))), 0);
  return { regions, loops, errors: [...new Set(errors)], openPoints, branchPoints };
}

function innerTestPoint(poly) {
  // Punkt auf der Kontur leicht verschoben ist unzuverlässig; Kontur-Punkt selbst reicht für
  // disjunkte/verschachtelte Konturen (Konturen schneiden sich nicht).
  return poly[0];
}

/** Bohrungsmittelpunkte: Punkt-Elemente, sonst Kreismittelpunkte */
export function holeCenters(sketch) {
  const pts = new Map(sketch.points.map((p) => [p.id, p]));
  const out = [];
  for (const e of sketch.entities) if (e.type === "point" && !e.construction) { const p = pts.get(e.p); if (p) out.push([p.x, p.y]); }
  if (!out.length) for (const e of sketch.entities) if (e.type === "circle" && !e.construction) { const p = pts.get(e.c); if (p) out.push([p.x, p.y]); }
  return out;
}

/** Linien (für Rahmen / Achsen) */
export function sketchLines(sketch, { includeConstruction = false } = {}) {
  const pts = new Map(sketch.points.map((p) => [p.id, p]));
  return sketch.entities
    .filter((e) => e.type === "line" && (includeConstruction || !e.construction))
    .map((e) => ({ id: e.id, a: [pts.get(e.p1).x, pts.get(e.p1).y], b: [pts.get(e.p2).x, pts.get(e.p2).y], p1: e.p1, p2: e.p2, construction: !!e.construction }));
}

/** Entfernt ein Element samt nicht mehr benutzter Punkte und abhängiger Bedingungen */
export function deleteEntities(sketch, ids) {
  const del = new Set(ids);
  sketch.entities = sketch.entities.filter((e) => !del.has(e.id));
  const usedPts = new Set();
  for (const e of sketch.entities) {
    for (const k of ["p1", "p2", "c", "p", "a"]) if (e[k]) usedPts.add(e[k]);
    for (const id of e.pts || []) usedPts.add(id);
  }
  const delPts = new Set(sketch.points.filter((p) => !usedPts.has(p.id)).map((p) => p.id));
  sketch.points = sketch.points.filter((p) => !delPts.has(p.id));
  sketch.constraints = sketch.constraints.filter((c) => {
    for (const k of ["e", "e1", "e2"]) if (c[k] && del.has(c[k])) return false;
    for (const k of ["p", "q"]) if (c[k] && delPts.has(c[k])) return false;
    if (c.type === "pattern" && c.c && delPts.has(c.c)) return false;
    if (del.has(c.id)) return false;
    return true;
  });
}

/** Bounding-Box einer Skizze */
export function sketchBounds(sketch) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const pts = new Map(sketch.points.map((p) => [p.id, p]));
  for (const p of sketch.points) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  // Splines liegen in der konvexen Hülle ihrer Kontrollpunkte – die Punkte oben genügen
  for (const e of sketch.entities) if (e.type === "ellipse") { const c = pts.get(e.c), m = Math.max(Math.hypot(pts.get(e.a).x - c.x, pts.get(e.a).y - c.y), e.r); x0 = Math.min(x0, c.x - m); x1 = Math.max(x1, c.x + m); y0 = Math.min(y0, c.y - m); y1 = Math.max(y1, c.y + m); }
  for (const e of sketch.entities) if (e.type === "circle") { const c = pts.get(e.c); x0 = Math.min(x0, c.x - e.r); x1 = Math.max(x1, c.x + e.r); y0 = Math.min(y0, c.y - e.r); y1 = Math.max(y1, c.y + e.r); }
  if (!Number.isFinite(x0)) return null;
  return { x0, y0, x1, y1 };
}
