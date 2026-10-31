// Direktbearbeitung im Geometrie-Kern (Inventor »Direkt«): Fläche verschieben, drehen, löschen, Größe ändern.
// OpenCascade in replicad hat kein »Defeaturing« und keinen Versatz je Fläche, deshalb mit Booleschen Operationen:
//  - Verschieben/Drehen: Prisma über der Fläche (Ecken wandern längs der Nachbarflächen) mit der neuen Ebene
//    geschnitten, dazu- bzw. abgezogen. Nachbarflächen bleiben auf ihren Ebenen und wachsen bzw. schrumpfen mit.
//  - Löschen: Lücke mit ebenen Deckeln schließen (Bohrung, Tasche, Zapfen) oder die Nachbarebenen verlängern
//    (Rundung, Fase).
//  - Größe: Zylinder (Bohrung, Bolzen) auf neuen Radius, ebene Fläche um einen Versatz.
import { v3 } from "../core/geom.js";
import { cornerDir, cornerAt, faceAxes, rotateVec, rotatePoint } from "../core/direkt.js";

const T = (p) => (p && typeof p.toTuple === "function" ? p.toTuple() : Array.isArray(p) ? p : [p.x, p.y, p.z]);
const TOL = 1e-6;

export function direktKernel(R) {
  const vol = (s) => { try { return R.measureVolume(s); } catch { return 0; } };
  const isPlane = (f) => f.geomType === "PLANE";
  const normalOf = (f) => v3.norm(T(f.normalAt()));
  const neighborAt = (shape, face, edge) => shape.faces.find((g) => !g.isSame(face) && g.edges.some((e) => e.isSame(edge)));
  const neighbors = (shape, face) => { const fe = face.edges; return shape.faces.filter((g) => !g.isSame(face) && g.edges.some((e) => fe.some((x) => x.isSame(e)))); };
  const sizeOf = (shape) => { const [a, b] = shape.boundingBox.bounds; return v3.dist(a, b) * 2 + 100; };
  const tidy = (s) => { try { return s.simplify(); } catch { return s; } };

  /** Geschlossener Polygonzug der Außenkontur (nur gerade Kanten, ohne innere Konturen) oder null */
  function loopOf(face) {
    if (face.clone().innerWires().length) return null;
    const segs = face.clone().outerWire().edges.map((e) => ({ e, a: T(e.startPoint), b: T(e.endPoint), line: e.geomType === "LINE" }));
    if (segs.some((s) => !s.line)) return null;
    const out = [segs.shift()];
    while (segs.length) {
      const last = out[out.length - 1].b;
      const i = segs.findIndex((s) => v3.dist(s.a, last) < 1e-6 || v3.dist(s.b, last) < 1e-6);
      if (i < 0) return null;
      const s = segs.splice(i, 1)[0];
      if (v3.dist(s.a, last) >= 1e-6) [s.a, s.b] = [s.b, s.a];
      out.push(s);
    }
    return out;
  }

  /** Körper aus 8 Ecken (lo/hi je 4 Punkte, gleiche Reihenfolge) */
  function hexa(lo, hi) {
    const k = lo.length, faces = [R.makePolygon(lo), R.makePolygon(hi)];
    for (let i = 0; i < k; i++) {
      const j = (i + 1) % k;
      const q = [lo[i], lo[j], hi[j], hi[i]].filter((p, m, a) => a.findIndex((x) => v3.dist(x, p) < 1e-9) === m);
      if (q.length >= 3) faces.push(R.makePolygon(q));
    }
    return R.makeSolid(faces);
  }

  /** Halbraum {x : (x − o)·m ≤ 0} als großer Quader */
  function halfSpace(o, m, S) {
    const { u, v, n } = faceAxes(m);
    const at = (a, b, h) => v3.add(o, v3.add(v3.add(v3.mul(u, a * S), v3.mul(v, b * S)), v3.mul(n, h)));
    return hexa([at(-1, -1, 0), at(1, -1, 0), at(1, 1, 0), at(-1, 1, 0)], [at(-1, -1, -2 * S), at(1, -1, -2 * S), at(1, 1, -2 * S), at(-1, 1, -2 * S)]);
  }

  /**
   * Prisma über der Fläche bis zur Höhe H längs n (H < 0 = in den Körper). Stehen alle ebenen Nachbarn senkrecht,
   * reicht das Ausziehen der Fläche (auch mit Bögen und Bohrungen); sonst wandern die Ecken längs der Nachbarebenen.
   */
  function prism(shape, face, n, H) {
    const nb = neighbors(shape, face);
    const slanted = nb.some((g) => isPlane(g) && Math.abs(v3.dot(normalOf(g), n)) > 1e-6);
    if (!slanted) return R.basicFaceExtrusion(face, new R.Vector(v3.mul(n, H)));
    const loop = loopOf(face);
    if (!loop) throw new Error("Bei schrägen Nachbarflächen nur Flächen mit geraden Kanten ohne Bohrungen");
    const ms = loop.map((s) => {
      const g = neighborAt(shape, face, s.e);
      return g && isPlane(g) ? normalOf(g) : v3.norm(v3.cross(v3.sub(s.b, s.a), n)); // gebogene Nachbarn: als senkrecht
    });
    const k = loop.length, base = loop.map((s) => s.a);
    const top = base.map((p, i) => cornerAt(p, cornerDir(n, ms[(i - 1 + k) % k], ms[i]), n, H));
    return hexa(base, top);
  }

  /** Fläche in die Ebene P1 = {o, n} bringen: was zwischen alter und neuer Ebene liegt, dazu bzw. weg */
  function toPlane(shape, face, P1, H) {
    const n = normalOf(face), S = sizeOf(shape);
    let out = shape;
    const add = prism(shape, face, n, H).intersect(halfSpace(P1.o, P1.n, S));
    const cut = prism(shape, face, n, -H).intersect(halfSpace(P1.o, v3.mul(P1.n, -1), S));
    if (vol(add) > TOL) out = out.fuse(add);
    if (vol(cut) > TOL) out = out.cut(cut);
    return tidy(out);
  }

  /** Fläche längs ihrer Normalen um t verschieben (t > 0 heraus) */
  function moveFace(shape, face, t) {
    if (Math.abs(t) < 1e-9) return shape;
    const n = normalOf(face);
    if (!isPlane(face)) throw new Error("Verschieben: nur ebene Flächen – Zylinder mit »Größe« ändern");
    const pr = prism(shape, face, n, t);
    return tidy(t > 0 ? shape.fuse(pr) : shape.cut(pr));
  }

  /** Fläche um die Gerade (o, d) um a (rad) drehen */
  function rotateFace(shape, face, o, d, a) {
    if (!isPlane(face)) throw new Error("Drehen: nur ebene Flächen");
    const n = normalOf(face), c = T(face.center);
    const P1 = { o: rotatePoint(c, o, d, a), n: rotateVec(n, d, a) };
    const [lo, hi] = face.boundingBox.bounds;
    let r = 0;
    for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) {
      const w = v3.sub([x, y, z], o);
      r = Math.max(r, v3.len(v3.sub(w, v3.mul(d, v3.dot(w, d)))));
    }
    return toPlane(shape, face, P1, r * Math.abs(Math.tan(a)) * 1.5 + 1);
  }

  /** Fläche ersetzen (P10, Inventor »Fläche ersetzen«): ebene Fläche in die Ebene der Zielfläche {p, n} bringen */
  function replaceFace(shape, face, target) {
    if (!isPlane(face)) throw new Error("Ersetzen: nur ebene Flächen");
    const P1 = { o: target.p, n: v3.norm(target.n) };
    const [lo, hi] = face.boundingBox.bounds;
    let H = 0;
    for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) H = Math.max(H, Math.abs(v3.dot(v3.sub([x, y, z], P1.o), P1.n)));
    if (H < 1e-6) return shape;
    // Zielnormale gegen die Flächennormale ausrichten: Halbraum »innen« liegt hinter der neuen Fläche
    if (v3.dot(P1.n, normalOf(face)) < 0) P1.n = v3.mul(P1.n, -1);
    if (Math.abs(v3.dot(P1.n, normalOf(face))) < 0.05) throw new Error("Zielfläche steht fast senkrecht zur Fläche – das ergibt keinen Körper");
    // Bezugspunkt der Ebene nahe an den Körper holen (der Halbraum ist ein endlicher Quader um diesen Punkt)
    const c = T(face.center);
    P1.o = v3.sub(c, v3.mul(P1.n, v3.dot(v3.sub(c, P1.o), P1.n)));
    return toPlane(shape, face, P1, H * 1.5 + 1);
  }

  /** Ebene Achsen U/V durch die Flächenmitte */
  function faceAxis(face, which) {
    const ax = faceAxes(normalOf(face));
    return { o: T(face.center), d: which === "V" ? ax.v : ax.u };
  }

  /** Lücke der gelöschten Flächen mit ebenen Deckeln zu einem Körper schließen, sonst null */
  function capSolid(shape, del) {
    const isDel = (g) => del.some((f) => f.isSame(g));
    const others = shape.faces.filter((g) => !isDel(g));
    const free = [];
    for (const f of del) for (const e of f.edges) if (!free.some((x) => x.isSame(e)) && others.some((g) => g.edges.some((x) => x.isSame(e)))) free.push(e);
    if (!free.length) return null;
    // Kanten zu geschlossenen Zügen ordnen
    const items = free.map((e) => ({ e, a: T(e.startPoint), b: T(e.endPoint) }));
    const loops = [];
    while (items.length) {
      const loop = [items.shift()];
      let end = loop[0].b;
      while (v3.dist(end, loop[0].a) > 1e-5) {
        const i = items.findIndex((s) => v3.dist(s.a, end) < 1e-5 || v3.dist(s.b, end) < 1e-5);
        if (i < 0) return null;
        const s = items.splice(i, 1)[0];
        end = v3.dist(s.a, end) < 1e-5 ? s.b : s.a;
        loop.push(s);
      }
      loops.push(loop);
    }
    const caps = [];
    for (const loop of loops) {
      let cap;
      try { cap = R.makeFace(R.assembleWire(loop.map((s) => s.e))); } catch { return null; }
      if (cap.geomType !== "PLANE") return null;
      caps.push(cap);
    }
    let solid;
    try { solid = R.makeSolid([...del, ...caps]); } catch { return null; }
    return vol(solid) > TOL ? solid : null;
  }

  /** Flächen löschen und die Lücke heilen */
  function deleteFaces(shape, del) {
    const v0 = vol(shape);
    const cap = capSolid(shape, del);
    if (cap) {
      const inside = vol(cap.intersect(shape));
      return tidy(inside > 0.5 * vol(cap) ? shape.cut(cap) : shape.fuse(cap));
    }
    // Nachbarebenen verlängern (Rundung, Fase): Ecke zwischen den Ebenen, begrenzt auf den Bereich der Flächen
    const isDel = (g) => del.some((f) => f.isSame(g));
    const nb = [];
    for (const f of del) for (const g of neighbors(shape, f)) if (!isDel(g) && isPlane(g) && !nb.some((x) => x.isSame(g))) nb.push(g);
    if (!nb.length) throw new Error("Lücke lässt sich nicht schließen (keine ebenen Nachbarflächen)");
    if (del.every(isPlane) && !nb.some((g) => del.some((f) => Math.abs(v3.dot(normalOf(g), normalOf(f))) > 1e-3)))
      throw new Error("Diese Fläche trägt den Körper – löschen ginge nur mit Lücke");
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const f of del) { const [a, b] = f.boundingBox.bounds; lo = lo.map((x, i) => Math.min(x, a[i])); hi = hi.map((x, i) => Math.max(x, b[i])); }
    const e = v3.dist(lo, hi) * 1e-3 + 0.01;
    lo = lo.map((x) => x - e); hi = hi.map((x) => x + e);
    const c = v3.mul(v3.add(lo, hi), 0.5);
    let W = R.makeBox(lo, hi);
    let concave = false;
    for (const g of nb) {
      const o = T(g.center), m = normalOf(g);
      const out = v3.dot(v3.sub(c, o), m) > 1e-6;
      if (out) concave = true;
      W = W.intersect(halfSpace(o, out ? v3.mul(m, -1) : m, sizeOf(shape)));
    }
    if (vol(W) < TOL) throw new Error("Lücke lässt sich nicht schließen");
    const res = tidy(concave ? shape.cut(W) : shape.fuse(W));
    if (Math.abs(vol(res) - v0) < TOL) throw new Error("Fläche ließ sich nicht löschen");
    return res;
  }

  /** Achse, Radius und Lage einer ganzen Zylinderfläche (Bohrung oder Bolzen) */
  function cylinderOf(face) {
    const ad = new (R.getOC().BRepAdaptor_Surface)(face.wrapped, true);
    let c;
    try {
      const cy = ad.Cylinder(), ax = cy.Axis(), l = ax.Location(), d = ax.Direction();
      c = { p: [l.X(), l.Y(), l.Z()], d: v3.norm([d.X(), d.Y(), d.Z()]), r: cy.Radius() };
    } finally { ad.delete(); }
    const ub = face.UVBounds;
    if (Math.abs(ub.uMax - ub.uMin) < 2 * Math.PI - 1e-3) throw new Error("Größe: nur ganze Zylinder (Bohrung, Bolzen)");
    let z0 = Infinity, z1 = -Infinity;
    for (const e of face.edges) for (const p of [T(e.startPoint), T(e.endPoint)]) { const z = v3.dot(v3.sub(p, c.p), c.d); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const m = T(face.center), w = v3.sub(m, c.p), radial = v3.sub(w, v3.mul(c.d, v3.dot(w, c.d)));
    // Flächenmitte liegt bei ganzen Zylindern auf der Achse: Normale an einem Punkt der Fläche prüfen
    const q = T(face.pointOnSurface((ub.uMin + ub.uMax) / 2, (ub.vMin + ub.vMax) / 2));
    const wq = v3.sub(q, c.p), rq = v3.sub(wq, v3.mul(c.d, v3.dot(wq, c.d)));
    const pin = v3.dot(T(face.normalAt(q)), v3.len(rq) > 1e-9 ? rq : radial) > 0;
    return { ...c, z0, z1, pin };
  }

  /** Zylinder auf neuen Radius r1 */
  function resizeCylinder(shape, face, r1) {
    const c = cylinderOf(face);
    if (!(r1 > 0)) throw new Error("Radius muss > 0 sein");
    if (Math.abs(r1 - c.r) < 1e-9) return { shape, c };
    const h = c.z1 - c.z0, base = v3.add(c.p, v3.mul(c.d, c.z0));
    const cyl = (r) => R.makeCylinder(r, h, base, c.d);
    const ring = (a, b) => cyl(Math.max(a, b)).cut(cyl(Math.min(a, b)));
    let out;
    if (c.pin) out = r1 > c.r ? shape.fuse(cyl(r1)) : shape.cut(ring(c.r, r1));
    else out = r1 > c.r ? shape.cut(cyl(r1)) : shape.fuse(ring(c.r, r1));
    return { shape: tidy(out), c };
  }

  return { moveFace, rotateFace, replaceFace, faceAxis, deleteFaces, resizeCylinder, cylinderOf, normalOf, isPlane };
}
