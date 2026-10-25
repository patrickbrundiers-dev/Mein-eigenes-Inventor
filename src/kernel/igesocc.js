// IGES-Export (Werkzeuge Stufe 49): Flächen und Randkanten eines Körpers aus OpenCascade als NURBS.
// Analytische Flächen und Kegelschnitte exakt über src/core/iges.js, B-Spline- und Bézier-Geometrie mit ihren
// Polen, alles andere (Dreh-, Schiebe-, Versatzflächen) als Näherung durch ein Punktraster.

import { planeSurface, revolutionSurface, lineCurve, conicCurve, chainLoop, reverseCurve } from "../core/iges.js";

const GRID = 16;

export function igesFaces(R, shape) {
  const oc = R.getOC();
  const pnt = new oc.gp_Pnt();
  const tup = (p) => [p.X(), p.Y(), p.Z()];
  const out = [];
  let approx = 0;
  for (const face of shape.faces) {
    const ad = new oc.BRepAdaptor_Surface(face.wrapped, false);
    try {
      const { uMin, uMax, vMin, vMax } = face.UVBounds;
      const S = (u, v) => { ad.D0(u, v, pnt); return tup(pnt); };
      const box = [uMin, uMax, vMin, vMax];
      const type = face.geomType;
      let surface = null;
      if (type === "PLANE") surface = planeSurface(S, box);
      else if (type === "CYLINDRE" || type === "CONE") surface = revolutionSurface(S, box, "line");
      else if (type === "SPHERE" || type === "TORUS") surface = revolutionSurface(S, box, "arc");
      else if (type === "BSPLINE_SURFACE") surface = bsplineSurface(ad.BSpline(), tup);
      else if (type === "BEZIER_SURFACE") surface = bezierSurface(ad.Bezier(), tup);
      if (!surface) { surface = gridSurface(S, box); approx++; }
      const outer = face.clone().outerWire();
      const rev = oc.TopAbs_Orientation.TopAbs_REVERSED;
      const map = surface.map || ((u, v) => [u, v]);
      const loops = [outer, ...face.clone().innerWires()].map((w) => chainLoop(wireEdges(oc, w.wrapped).map((e) => {
        const c = edgeCurve(oc, e, tup);
        c.pc = edgePCurve(oc, e, face.wrapped, map, !surface.map);
        return e.Orientation() === rev ? reverseCurve(c) : c;
      })));
      out.push({ surface, loops });
    } finally {
      ad.delete();
    }
  }
  pnt.delete();
  return { faces: out, approx };
}

/** Kanten einer Schleife mit Nahtkanten doppelt (replicad zählt jede Kante nur einmal), ohne entartete Kanten */
function wireEdges(oc, wire) {
  const ex = new oc.TopExp_Explorer(wire, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  const out = [];
  try {
    for (; ex.More(); ex.Next()) {
      const e = oc.TopoDS.Edge(ex.Current());
      if (!oc.BRep_Tool.Degenerated(e)) out.push(e);
    }
  } finally {
    ex.delete();
  }
  return out;
}

/**
 * Kurve der Kante im Parameterraum der IGES-Fläche (z = 0). map: Kern-(u, v) → Flächenparameter; ident: map ist die
 * Identität (Ebene, B-Spline, Raster) – dann Geraden und Kreise exakt, sonst Isolinien exakt und der Rest als Polygon.
 */
function edgePCurve(oc, edge, face, map, ident) {
  let ad;
  try { ad = new oc.BRepAdaptor_Curve2d(edge, face); } catch { return null; }
  const pt = new oc.gp_Pnt2d(), T = oc.GeomAbs_CurveType;
  try {
    const t0 = ad.FirstParameter(), t1 = ad.LastParameter();
    const uv = (t) => { ad.D0(t, pt); return [pt.X(), pt.Y()]; };
    const P = (t) => { const [u, v] = uv(t); return [...map(u, v), 0]; };
    const g = ad.GetType();
    if (g === T.GeomAbs_Line) {
      const a = uv(t0), b = uv(t1);
      if (ident || Math.abs(a[0] - b[0]) < 1e-12 || Math.abs(a[1] - b[1]) < 1e-12) return lineCurve(P(t0), P(t1));
    }
    if (ident && (g === T.GeomAbs_Circle || g === T.GeomAbs_Ellipse)) return conicCurve(P, t0, t1);
    const n = 32, poles = Array.from({ length: n + 1 }, (_, i) => P(t0 + ((t1 - t0) * i) / n));
    return { deg: 1, knots: [0, ...poles.map((_, i) => i), n], weights: poles.map(() => 1), poles, t0: 0, t1: n };
  } finally {
    ad.delete(); pt.delete();
  }
}

/** Kante als NURBS-Kurve (Gerade und Kegelschnitt exakt, B-Spline mit Polen, sonst Näherung über Punkte) */
function edgeCurve(oc, edge, tup) {
  const ad = new oc.BRepAdaptor_Curve(edge), pt = new oc.gp_Pnt(), T = oc.GeomAbs_CurveType;
  try {
    const t0 = ad.FirstParameter(), t1 = ad.LastParameter();
    const P = (t) => { ad.D0(t, pt); return tup(pt); };
    const g = ad.GetType();
    const type = g === T.GeomAbs_Line ? "LINE" : g === T.GeomAbs_Circle ? "CIRCLE" : g === T.GeomAbs_Ellipse ? "ELLIPSE" : g === T.GeomAbs_BSplineCurve ? "BSPLINE_CURVE" : g === T.GeomAbs_BezierCurve ? "BEZIER_CURVE" : "OTHER";
    if (type === "LINE") return lineCurve(P(t0), P(t1));
    if (type === "CIRCLE" || type === "ELLIPSE") return conicCurve(P, t0, t1);
    if (type === "BSPLINE_CURVE") {
      const h = ad.BSpline(), b = h.get ? h.get() : h;
      if (!b.IsPeriodic()) return { ...splineCurve(b, tup), t0, t1 };
    }
    if (type === "BEZIER_CURVE") {
      const h = ad.Bezier(), b = h.get ? h.get() : h;
      const n = b.NbPoles(), deg = b.Degree();
      const poles = [], weights = [];
      for (let i = 1; i <= n; i++) { poles.push(tup(b.Pole(i))); weights.push(b.Weight(i)); }
      const curve = { deg, knots: [...Array(deg + 1).fill(0), ...Array(deg + 1).fill(1)], weights, poles, t0: 0, t1: 1 };
      return curve;
    }
    // Näherung: Polygon durch 24 Punkte (Grad 1, gleichmäßig im Parameter)
    const n = 24, poles = Array.from({ length: n + 1 }, (_, i) => P(t0 + ((t1 - t0) * i) / n));
    return { deg: 1, knots: [0, ...poles.map((_, i) => i), n], weights: poles.map(() => 1), poles, t0: 0, t1: n };
  } finally {
    ad.delete(); pt.delete();
  }
}

function flatKnots(count, knot, mult) {
  const out = [];
  for (let i = 1; i <= count; i++) for (let m = 0; m < mult(i); m++) out.push(knot(i));
  return out;
}

function splineCurve(b, tup) {
  const n = b.NbPoles(), poles = [], weights = [];
  for (let i = 1; i <= n; i++) { poles.push(tup(b.Pole(i))); weights.push(b.Weight(i)); }
  const knots = flatKnots(b.NbKnots(), (i) => b.Knot(i), (i) => b.Multiplicity(i));
  return { deg: b.Degree(), knots, weights, poles };
}

function bsplineSurface(h, tup) {
  const b = h.get ? h.get() : h;
  if (b.IsUPeriodic() || b.IsVPeriodic()) return null;
  const nu = b.NbUPoles(), nv = b.NbVPoles();
  const poles = [], weights = [];
  for (let i = 1; i <= nu; i++) {
    const pr = [], wr = [];
    for (let j = 1; j <= nv; j++) { pr.push(tup(b.Pole(i, j))); wr.push(b.Weight(i, j)); }
    poles.push(pr); weights.push(wr);
  }
  return {
    degU: b.UDegree(), degV: b.VDegree(), poles, weights,
    knotsU: flatKnots(b.NbUKnots(), (i) => b.UKnot(i), (i) => b.UMultiplicity(i)),
    knotsV: flatKnots(b.NbVKnots(), (i) => b.VKnot(i), (i) => b.VMultiplicity(i)),
  };
}

function bezierSurface(h, tup) {
  const b = h.get ? h.get() : h;
  const nu = b.NbUPoles(), nv = b.NbVPoles();
  const poles = [], weights = [];
  for (let i = 1; i <= nu; i++) {
    const pr = [], wr = [];
    for (let j = 1; j <= nv; j++) { pr.push(tup(b.Pole(i, j))); wr.push(b.Weight(i, j)); }
    poles.push(pr); weights.push(wr);
  }
  const k = (n) => [...Array(n).fill(0), ...Array(n).fill(1)];
  return { degU: nu - 1, degV: nv - 1, poles, weights, knotsU: k(nu), knotsV: k(nv) };
}

/** Näherung: bilineares Raster GRID × GRID durch Flächenpunkte (geht durch alle Rasterpunkte) */
function gridSurface(S, [u0, u1, v0, v1]) {
  const us = Array.from({ length: GRID + 1 }, (_, i) => u0 + ((u1 - u0) * i) / GRID);
  const vs = Array.from({ length: GRID + 1 }, (_, j) => v0 + ((v1 - v0) * j) / GRID);
  const kn = (a) => [a[0], ...a, a.at(-1)];
  return { degU: 1, degV: 1, knotsU: kn(us), knotsV: kn(vs), poles: us.map((u) => vs.map((v) => S(u, v))), weights: us.map(() => vs.map(() => 1)) };
}
