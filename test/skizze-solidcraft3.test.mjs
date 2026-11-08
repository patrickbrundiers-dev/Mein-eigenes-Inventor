// Skizze weiter an SolidCraft angelehnt (08.11.2026): Kantenmaße, erstes Maß skaliert, Parameter aus dem Maßfeld,
// Ausrichtung als Bedingung
import test from "node:test";
import assert from "node:assert/strict";
import { edgeDistanceFrom, edgeDistanceGeometry } from "../src/core/kantenmass.js";
import { scaleForFirstDimension, connectedPoints, hasSizing } from "../src/core/erstesmass.js";
import { solveSketch, measureConstraint, checkNewConstraint, DIMENSION_TYPES } from "../src/core/solver.js";
import { newSketch } from "../src/core/sketch.js";
import { paramDefinition, applyParamDefinitions, dynValues, createDynInput, dynKey } from "../src/core/dyninput.js";
import { alignSnap } from "../src/core/sketchsnap.js";
import { constraintLabel } from "../src/core/sketchshapes.js";

let n = 0;
const uid = (p) => `${p}${++n}`;
const near = (a, b, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b}`);
const sketch = () => newSketch("s", "S", { ref: "XY" });
const P = (sk, id) => sk.points.find((p) => p.id === id);
const line = (sk, a, b) => { const p1 = uid("p"), p2 = uid("p"), id = uid("l"); sk.points.push({ id: p1, x: a[0], y: a[1] }, { id: p2, x: b[0], y: b[1] }); sk.entities.push({ id, type: "line", p1, p2 }); return id; };
const circle = (sk, c, r) => { const pc = uid("p"), id = uid("c"); sk.points.push({ id: pc, x: c[0], y: c[1] }); sk.entities.push({ id, type: "circle", c: pc, r }); return id; };
const point = (sk, x, y) => { const id = uid("p"); sk.points.push({ id, x, y }); return id; };
const fixLine = (sk, l) => { const e = sk.entities.find((q) => q.id === l); for (const p of [e.p1, e.p2]) { const q = P(sk, p); sk.constraints.push({ id: uid("k"), type: "fix", p, x: q.x, y: q.y }); } };

test("Kantenmaß Linie–Kreis: Spalt bis zum Kreisrand, Löser hält ihn", () => {
  const sk = sketch();
  const l = line(sk, [0, 0], [100, 0]), c = circle(sk, [50, 30], 10);
  fixLine(sk, l);
  const cc = sk.entities.find((e) => e.id === c);
  sk.constraints.push({ id: uid("m"), type: "diameter", e: c, value: "20" });
  sk.constraints.push({ id: uid("k"), type: "vertical", p: cc.c, q: sk.entities.find((e) => e.id === l).p1 });
  const k = edgeDistanceFrom(sk, { line: l, circle: c });
  assert.equal(k.type, "edgeDistance");
  assert.equal(k.m, 1);
  k.id = "ed";
  near(measureConstraint(sk, k), 20, 1e-9, "gemessen");
  assert.equal(checkNewConstraint(sk, { ...k, value: "20" }), "ok");
  sk.constraints.push({ ...k, value: "5" });
  const r = solveSketch(sk);
  assert.ok(r.ok);
  near(P(sk, cc.c).y, 15, 1e-6, "Mitte = Spalt + Radius");
  const g = edgeDistanceGeometry(sk, sk.constraints.at(-1));
  near(g.b.y, 5, 1e-6, "Pfeil endet am Rand");
  near(g.a.y, 0, 1e-6, "Fußpunkt auf der Linie");
  assert.match(constraintLabel(sk.constraints.at(-1)), /Kreisrand/);
  assert.ok(DIMENSION_TYPES.has("edgeDistance"));
});

test("Kantenmaß Linie–Kreis: Kreis schneidet die Linie → so weit ragt der Rand darüber", () => {
  const sk = sketch();
  const l = line(sk, [0, 0], [100, 0]), c = circle(sk, [50, 4], 10);
  const k = edgeDistanceFrom(sk, { line: l, circle: c });
  assert.equal(k.m, -1);
  near(measureConstraint(sk, k), 6, 1e-9);
});

test("Kantenmaß Punkt–Kreis und Kreis–Kreis (außen, innen)", () => {
  const sk = sketch();
  const p = point(sk, 30, 0), c1 = circle(sk, [0, 0], 10), c2 = circle(sk, [40, 0], 5), c3 = circle(sk, [3, 0], 4);
  const kp = edgeDistanceFrom(sk, { point: p, circle: c1 });
  near(measureConstraint(sk, kp), 20, 1e-9, "Punkt außen");
  const ka = edgeDistanceFrom(sk, { circle2: c1, circle: c2 });
  assert.equal(ka.mode, "aussen");
  near(measureConstraint(sk, ka), 25, 1e-9, "Spalt zwischen Kreisen");
  const ki = edgeDistanceFrom(sk, { circle2: c1, circle: c3 });
  assert.equal(ki.mode, "innen");
  near(measureConstraint(sk, ki), 3, 1e-9, "engste Wand");
  // Mittelpunkt des eigenen Kreises ist kein Kantenmaß
  assert.equal(edgeDistanceFrom(sk, { point: sk.entities.find((e) => e.id === c1).c, circle: c1 }), null);
  // Löser: Spalt außen auf 10 stellen, c1 fest
  const e1 = sk.entities.find((e) => e.id === c1), e2 = sk.entities.find((e) => e.id === c2);
  sk.constraints.push({ id: uid("k"), type: "fix", p: e1.c, x: 0, y: 0 }, { id: uid("m"), type: "radius", e: c1, value: "10" }, { id: uid("m"), type: "radius", e: c2, value: "5" });
  sk.constraints.push({ id: uid("k"), type: "horizontal", p: e1.c, q: e2.c }, { ...ka, id: "ka", value: "10" });
  assert.ok(solveSketch(sk).ok);
  near(P(sk, e2.c).x, 25, 1e-6, "Mitte = 10 + 5 + 10");
});

test("Erstes Maß skaliert die verbundene Zeichnung, getrennte Formen bleiben", () => {
  const sk = sketch();
  // Rechteck 30 × 20 aus vier Linien mit gemeinsamen Punkten
  const pts = [[0, 0], [30, 0], [30, 20], [0, 20]].map(([x, y]) => point(sk, x, y));
  for (let i = 0; i < 4; i++) sk.entities.push({ id: "r" + i, type: "line", p1: pts[i], p2: pts[(i + 1) % 4] });
  sk.constraints.push({ id: "co", type: "coincident", p: pts[0], q: "O" });
  const far = circle(sk, [100, 100], 5);
  const c = { id: "m1", type: "length", e: "r0" };
  assert.equal(hasSizing(sk), false);
  const cp = connectedPoints(sk, c);
  assert.equal(cp.points.size, 4);
  assert.equal(cp.touchesOrigin, true);
  const f = scaleForFirstDimension(sk, c, 30, 60);
  near(f, 2);
  near(P(sk, pts[2]).x, 60); near(P(sk, pts[2]).y, 40, 1e-9, "Höhe mitskaliert");
  near(sk.entities.find((e) => e.id === far).r, 5, 1e-12, "getrennter Kreis bleibt");
  near(P(sk, sk.entities.find((e) => e.id === far).c).x, 100);
  // zweites Maß skaliert nicht mehr
  sk.constraints.push({ ...c, value: "60" });
  assert.equal(scaleForFirstDimension(sk, { id: "m2", type: "length", e: "r1" }, 40, 10), null);
});

test("Erstes Maß: Kreis ohne Ursprung skaliert um den eigenen Mittelpunkt, Winkel skaliert nicht", () => {
  const sk = sketch();
  const c = circle(sk, [10, 10], 4);
  const e = sk.entities.find((q) => q.id === c);
  const f = scaleForFirstDimension(sk, { id: "d", type: "diameter", e: c }, 8, 20);
  near(f, 2.5);
  near(e.r, 10);
  near(P(sk, e.c).x, 10, 1e-12, "Mitte bleibt");
  const a = line(sk, [0, 0], [10, 0]), b = line(sk, [0, 0], [0, 10]);
  assert.equal(scaleForFirstDimension(sk, { id: "w", type: "angle", e1: a, e2: b }, 90, 45), null);
});

test("Maßfeld »breite = 20« legt Parameter an", () => {
  assert.deepEqual(paramDefinition("breite = 20"), { name: "breite", expr: "20" });
  assert.deepEqual(paramDefinition("#h=2*breite"), { name: "h", expr: "2*breite" });
  assert.equal(paramDefinition("20"), null);
  assert.equal(paramDefinition("2*b"), null);
  const part = { params: [{ name: "h", expr: "5", comment: "" }] };
  applyParamDefinitions(part, [{ name: "breite", expr: "20" }, { name: "h", expr: "7" }]);
  assert.equal(part.params.find((p) => p.name === "breite").expr, "20");
  assert.equal(part.params.find((p) => p.name === "h").expr, "7");
  // in der Maßeingabe beim Zeichnen
  const st = createDynInput(["w", "h"]);
  for (const ch of "b=40") dynKey(st, ch);
  const r = dynValues(st, { w: 1, h: 1 });
  assert.ok(r.ok);
  assert.equal(r.values.w, 40);
  assert.equal(r.exprs.w, "b");
  assert.deepEqual(r.params, [{ name: "b", expr: "40" }]);
});

test("Ausrichtung nennt die Quellpunkte (für »Ausrichtung als Bedingung behalten«)", () => {
  const sk = sketch();
  const a = point(sk, 0, 0), b = point(sk, 50, 30);
  const r = alignSnap(sk, 50.2, 0.1, 1);
  assert.equal(r.alignH, a, "waagrecht zu a");
  assert.equal(r.alignV, b, "senkrecht zu b");
  near(r.x, 50); near(r.y, 0);
  // Linienmitten haben keinen Punkt → keine Bedingung
  const sk2 = sketch();
  line(sk2, [0, 0], [10, 0]);
  const m = alignSnap(sk2, 5.1, 40, 0.5, { excludePoints: new Set(["O"]) });
  assert.equal(m.alignV, null);
});
