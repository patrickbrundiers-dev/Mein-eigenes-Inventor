// Etappe E1 des SolidCraft-Abgleichs: weitere Skizzenwerkzeuge
import test from "node:test";
import assert from "node:assert/strict";
import { buildBlendCurve, buildTangentAt, buildCircleTangent2, arcSlotFrom3, polygonFromEdge, circumscribedVertex, reverseSpline, insertSplinePoint, removeSplinePoint, breakOffset, buildDrawingBounds, simplifyPolyline, addPolylines, chamferSecondDistance, autoConstraints, meshPlaneSection, spunProfile } from "../src/core/sketchtools2.js";
import { buildArcSlot } from "../src/core/sketchtools.js";
import { solveSketch } from "../src/core/solver.js";
import { newSketch, extractProfiles } from "../src/core/sketch.js";
import { splineBeziers } from "../src/core/spline.js";

let n = 0;
const uid = (p) => `${p}${++n}`;
const near = (a, b, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b}`);
const sketch = () => newSketch("s", "S", { ref: "XY" });
const P = (sk, id) => sk.points.find((p) => p.id === id);
const line = (sk, a, b) => { const p1 = uid("p"), p2 = uid("p"), id = uid("l"); sk.points.push({ id: p1, x: a[0], y: a[1] }, { id: p2, x: b[0], y: b[1] }); sk.entities.push({ id, type: "line", p1, p2 }); return id; };

test("Übergangskurve: Spline zwischen zwei Linienenden, tangential an beide", () => {
  const sk = sketch();
  const a = line(sk, [0, 0], [10, 0]), b = line(sk, [20, 10], [20, 20]);
  const sp = buildBlendCurve(sk, { e: a, end: "p2" }, { e: b, end: "p1" }, { uid });
  const s = solveSketch(sk);
  assert.ok(s.ok, JSON.stringify(s));
  const e = sk.entities.find((x) => x.id === sp);
  const [p0, c1, c2, p3] = e.pts.map((id) => P(sk, id));
  near(c1.y - p0.y, 0, 1e-6, "Anfang waagrecht wie Linie a");
  near(c2.x - p3.x, 0, 1e-6, "Ende senkrecht wie Linie b");
  assert.equal(sk.constraints.filter((c) => c.type === "tangent").length, 2);
  assert.throws(() => buildBlendCurve(sk, { e: a, end: "p2" }, { e: a, end: "p2" }, { uid }), /verschiedene/);
});

test("Tangente an Kurvenpunkt und Kreis an zwei Linien", () => {
  const sk = sketch();
  const c = uid("p"); sk.points.push({ id: c, x: 0, y: 0 });
  sk.entities.push({ id: "k", type: "circle", c, r: 10 });
  buildTangentAt(sk, sk.entities[0], 0, 30, { uid });
  assert.ok(solveSketch(sk).ok);
  const t = sk.entities.at(-1);
  near(P(sk, t.p1).y, 10, 1e-6); near(P(sk, t.p2).y, 10, 1e-6);
  const sk2 = sketch();
  const l1 = line(sk2, [0, 0], [100, 0]), l2 = line(sk2, [0, 0], [0, 100]);
  const r = buildCircleTangent2(sk2, l1, l2, 5, { x: 20, y: 20 }, { uid });
  assert.ok(solveSketch(sk2).ok);
  near(P(sk2, r.center).x, 5); near(P(sk2, r.center).y, 5);
});

test("Bogenlangloch über 3 Punkte, Polygon über Kante und umschrieben", () => {
  const g = arcSlotFrom3({ x: 50, y: 0 }, { x: 0, y: 50 }, { x: -50, y: 0 });
  near(g.c.x, 0); near(g.c.y, 0); assert.equal(g.s.x, 50);
  const g2 = arcSlotFrom3({ x: -50, y: 0 }, { x: 0, y: 50 }, { x: 50, y: 0 });
  assert.equal(g2.s.x, 50, "Reihenfolge gegen den Uhrzeigersinn");
  const sk = sketch();
  buildArcSlot(sk, g.c, g.s, g.e, 10, { uid, usePoint: (s, q) => { const id = uid("p"); s.points.push({ id, x: q.x, y: q.y }); return id; } });
  assert.ok(solveSketch(sk).ok);
  assert.equal(extractProfiles(sk).regions.length, 1);
  assert.throws(() => arcSlotFrom3({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }), /Geraden/);
  const p = polygonFromEdge({ x: 0, y: 0 }, { x: 10, y: 0 }, 6, { x: 5, y: 3 });
  near(Math.hypot(p.c.x - 0, p.c.y - 0), 10, 1e-9, "Sechseck: Umkreis = Kante");
  assert.ok(p.c.y > 0);
  const v = circumscribedVertex({ x: 0, y: 0 }, { x: 0, y: 12 }, 6);
  near(Math.hypot(v.x, v.y), 12 / Math.cos(Math.PI / 6), 1e-9, "Ecke auf Umkreis, SW 24");
});

test("Spline: umkehren, Punkt einfügen/entfernen, Grad 5 als Bézier", () => {
  const sk = sketch();
  const ids = [[0, 0], [10, 10], [20, 0], [30, 10]].map(([x, y]) => { const id = uid("p"); sk.points.push({ id, x, y }); return id; });
  const sp = { id: "sp", type: "spline", pts: [...ids], p1: ids[0], p2: ids[3] };
  sk.entities.push(sp);
  reverseSpline(sp);
  assert.equal(sp.p1, ids[3]); assert.equal(sp.pts[0], ids[3]);
  const q = insertSplinePoint(sk, sp, 15, 5, { uid });
  assert.equal(sp.pts.length, 5); assert.ok(sp.pts.includes(q));
  removeSplinePoint(sk, sp, q);
  assert.equal(sp.pts.length, 4);
  assert.throws(() => removeSplinePoint(sk, sp, sp.p1), /innere/);
  const ctrl = [[0, 0], [10, 10], [20, 0], [30, 10], [40, 0], [50, 10]];
  ctrl.deg = 5;
  const bz = splineBeziers(ctrl);
  assert.equal(bz.segs.length % 4, 0, "Grad 5 → je Abschnitt 4 kubische Stücke");
  near(bz.start[0], 0); near(bz.segs.at(-1).at(-1)[0], 50);
});

test("Versatz lösen, Zeichnungsrahmen, Polylinie vereinfachen", () => {
  const sk = sketch();
  sk.constraints.push({ id: "o", type: "offset", e1: "a", e2: "b", k: 1, value: "5" }, { id: "x", type: "horizontal", e: "a" });
  assert.equal(breakOffset(sk, ["b"]), 1);
  assert.equal(sk.constraints.length, 1);
  sk.constraints = [];
  const lines = buildDrawingBounds(sk, 297, 210, { uid });
  assert.equal(lines.length, 4);
  assert.ok(sk.entities.every((e) => e.construction && e.bounds));
  assert.ok(solveSketch(sk).ok);
  buildDrawingBounds(sk, 420, 297, { uid });
  assert.equal(sk.entities.length, 4, "alter Rahmen ersetzt");
  assert.throws(() => buildDrawingBounds(sk, 0, 10, { uid }));
  const pts = Array.from({ length: 101 }, (_, i) => [i, i % 2 ? 0.001 : 0]);
  assert.equal(simplifyPolyline(pts, 0.01).length, 2);
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  const sk2 = sketch();
  addPolylines(sk2, [sq], { uid });
  assert.equal(sk2.entities.length, 4);
  near(Math.abs(extractProfiles(sk2).regions[0].area), 100, 1e-6);
});

test("Fase Abstand/Winkel, Auto-Bedingungen, Netzquerschnitt", () => {
  near(chamferSecondDistance(5, 45, Math.PI / 2), 5, 1e-9, "90°-Ecke, 45° → gleiche Abstände");
  near(chamferSecondDistance(5, 30, Math.PI / 2), 5 * Math.tan(Math.PI / 6), 1e-9);
  assert.throws(() => chamferSecondDistance(5, 100, Math.PI / 2), /Winkel/);
  const sk = sketch();
  line(sk, [0, 0], [100, 0.5]); line(sk, [0, 0], [0.4, 80]); line(sk, [0, 0], [50, 50]);
  assert.equal(autoConstraints(sk, { uid }), 2);
  assert.equal(autoConstraints(sk, { uid }), 0, "kein zweites Mal");
  assert.ok(solveSketch(sk).ok);
  // Würfel 10 mm als Dreiecksnetz, Schnitt bei z = 5 → ein geschlossenes Quadrat
  const V = [[0,0,0],[10,0,0],[10,10,0],[0,10,0],[0,0,10],[10,0,10],[10,10,10],[0,10,10]];
  const F = [[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,5,1],[0,4,5],[1,6,2],[1,5,6],[2,7,3],[2,6,7],[3,4,0],[3,7,4]];
  const pos = V.flat(), idx = F.flat();
  const frame = { origin: [0, 0, 5], xDir: [1, 0, 0], yDir: [0, 1, 0], normal: [0, 0, 1] };
  const loops = meshPlaneSection(pos, idx, frame);
  assert.equal(loops.length, 1);
  const L = simplifyPolyline(loops[0], 1e-6);
  assert.ok(L.length <= 6, JSON.stringify(L));
  near(Math.hypot(L[0][0] - L.at(-1)[0], L[0][1] - L.at(-1)[1]), 0, 1e-6, "geschlossen");
  const sk2 = sketch();
  addPolylines(sk2, [L], { uid });
  near(Math.abs(extractProfiles(sk2).regions[0].area), 100, 1e-6);
  assert.equal(meshPlaneSection(pos, idx, { ...frame, origin: [0, 0, 20] }).length, 0);
});

test("Gedrehtes Profil: Würfel um die X-Achse gedreht → Halbprofil mit Radius = halbe Diagonale", () => {
  const V = [[0,-5,-5],[10,-5,-5],[10,5,-5],[0,5,-5],[0,-5,5],[10,-5,5],[10,5,5],[0,5,5]];
  const frame = { origin: [0, 0, 0], xDir: [1, 0, 0], yDir: [0, 1, 0], normal: [0, 0, 1] };
  const L = spunProfile(V.flat(), frame, { a: [0, 0], b: [1, 0] }, { bins: 10 });
  const ys = L.map((q) => q[1]), xs = L.map((q) => q[0]);
  near(Math.max(...ys), Math.hypot(5, 5), 1e-9);
  near(Math.min(...xs), 0); near(Math.max(...xs), 10);
  near(L[0][0], L.at(-1)[0]); near(L[0][1], 0);
});
