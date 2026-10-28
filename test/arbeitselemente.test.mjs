// Arbeitsebenen, -achsen, -punkte: neue Arten (Inventor/Fusion) und Erzeugen durch Anklicken
import test from "node:test";
import assert from "node:assert/strict";
import { resolveDatums, alongPolyline, polylineParam, PLANE_MODES, AXIS_MODES, POINT_MODES } from "../src/core/datums.js";
import { inferDatum, circleFrom3, datumRefsOf, tangentSide } from "../src/core/datumpick.js";
import { featureRefs } from "../src/core/featurerefs.js";

const near = (a, b, tol = 1e-9, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b}`);
const nearV = (a, b, tol = 1e-9, msg = "") => a.forEach((x, i) => near(x, b[i], tol, msg + "[" + i + "]"));
const ev = (x) => Number(String(x).replace(",", "."));
const solve = (fs) => resolveDatums(fs.map((f, i) => ({ id: f.id || "d" + i, ...f })), ev);

test("Arbeitsebene: Mittelebene parallel und als Winkelhalbierende", () => {
  const { map, errors } = solve([
    { id: "e1", type: "arbeitsebene", mode: "versatz", base: "XY", distance: "40" },
    { id: "m", type: "arbeitsebene", mode: "mitte", plane1: "XY", plane2: "e1" },
    // Gegenläufige Flächen eines Blechs (oben/unten) → Mitte
    { id: "m2", type: "arbeitsebene", mode: "mitte", plane1: { o: [0, 0, 10], n: [0, 0, 1] }, plane2: { o: [0, 0, 4], n: [0, 0, -1] } },
    { id: "b", type: "arbeitsebene", mode: "mitte", plane1: "XZ", plane2: "YZ" },
  ]);
  assert.deepEqual(errors, {});
  nearV(map.get("m").frame.origin, [0, 0, 20]);
  nearV(map.get("m2").frame.origin, [0, 0, 7]);
  // Winkelhalbierende zwischen XZ (Normale −Y) und YZ (Normale X): Normale ∝ (−1, −1, 0)
  const n = map.get("b").frame.normal;
  near(Math.abs(n[0]), Math.SQRT1_2, 1e-9); near(Math.abs(n[1]), Math.SQRT1_2, 1e-9); near(n[2], 0, 1e-12);
  near(n[0] * n[1], 0.5, 1e-9);
});

test("Arbeitsebene: parallel durch Punkt, durch Achse und Punkt, zwei Achsen", () => {
  const { map, errors } = solve([
    { id: "pp", type: "arbeitsebene", mode: "parallelPunkt", base: "XY", point: { x: "5", y: "7", z: "33" } },
    { id: "ap", type: "arbeitsebene", mode: "achsePunkt", axis: "X", point: { x: "0", y: "0", z: "10" } },
    { id: "za", type: "arbeitsebene", mode: "zweiAchsen", axis: "X", axis2: { p: [0, 50, 0], d: [1, 0, 0] } },
    { id: "zb", type: "arbeitsebene", mode: "zweiAchsen", axis: "X", axis2: "Y" },
    { id: "ws", type: "arbeitsebene", mode: "zweiAchsen", axis: "X", axis2: { p: [0, 0, 5], d: [0, 1, 0] } },
    { id: "auf", type: "arbeitsebene", mode: "achsePunkt", axis: "X", point: { x: "9", y: "0", z: "0" } },
  ]);
  nearV(map.get("pp").frame.origin, [0, 0, 33]);
  nearV(map.get("pp").frame.normal, [0, 0, 1]);
  // Ebene enthält X-Achse und (0,0,10): XZ-Ebene → Normale ±Y
  near(Math.abs(map.get("ap").frame.normal[1]), 1, 1e-12);
  near(Math.abs(map.get("za").frame.normal[2]), 1, 1e-12);
  near(Math.abs(map.get("zb").frame.normal[2]), 1, 1e-12);
  assert.match(errors.ws, /windschief/);
  assert.match(errors.auf, /auf der Achse/);
});

test("Arbeitsebene: senkrecht zu Kante an Stelle, tangential an Zylinder, Winkel um Modellkante", () => {
  const curve = { pts: [[0, 0, 0], [100, 0, 0], [100, 100, 0]] };
  const cyl = { p: [0, 0, 0], d: [0, 0, 1], r: 10 };
  const { map, errors } = solve([
    { id: "k", type: "arbeitsebene", mode: "kurve", curve, pos: "25" },
    { id: "k2", type: "arbeitsebene", mode: "kurve", curve, pos: "75" },
    { id: "t", type: "arbeitsebene", mode: "tangential", cyl, start: [1, 0, 0], angle: "90" },
    { id: "tp", type: "arbeitsebene", mode: "tangential", cyl, base: "XZ", side: "-" },
    { id: "tbad", type: "arbeitsebene", mode: "tangential", cyl, base: "XY" },
    { id: "w", type: "arbeitsebene", mode: "winkel", base: "XY", axis: { p: [0, 20, 0], d: [1, 0, 0] }, angle: "90" },
    { id: "kbad", type: "arbeitsebene", mode: "kurve", curve, pos: "150" },
  ]);
  nearV(map.get("k").frame.origin, [50, 0, 0]);
  nearV(map.get("k").frame.normal, [1, 0, 0]);
  nearV(map.get("k2").frame.origin, [100, 50, 0]);
  nearV(map.get("k2").frame.normal, [0, 1, 0]);
  nearV(map.get("t").frame.origin, [0, 10, 0], 1e-9);
  nearV(map.get("t").frame.normal, [0, 1, 0], 1e-9);
  // XZ-Normale ist −Y, Gegenseite → +Y
  nearV(map.get("tp").frame.origin, [0, 10, 0], 1e-9);
  assert.match(errors.tbad, /parallel zur Zylinderachse/);
  assert.match(errors.kbad, /0 und 100/);
  nearV(map.get("w").frame.origin, [0, 20, 0]);
  near(Math.abs(map.get("w").frame.normal[1]), 1, 1e-9);
});

test("Arbeitsachse: Kante, Zylinder, Kreis, senkrecht zu Ebene, parallel zu Arbeitsachse", () => {
  const { map, errors } = solve([
    { id: "k", type: "arbeitsachse", mode: "kante", ref: { p: [1, 2, 3], d: [0, 0, 5] } },
    { id: "z", type: "arbeitsachse", mode: "zylinder", ref: { p: [10, 0, 0], d: [0, 1, 0] } },
    { id: "leer", type: "arbeitsachse", mode: "kreis" },
    { id: "ne", type: "arbeitsachse", mode: "normalEbene", plane: { o: [0, 0, 0], n: [1, 1, 0] }, point: { x: "3", y: "4", z: "5" } },
    { id: "pa", type: "arbeitsachse", mode: "parallel", dir: "k", point: { x: "7", y: "0", z: "0" } },
  ]);
  nearV(map.get("k").d, [0, 0, 1]);
  nearV(map.get("z").p, [10, 0, 0]);
  assert.match(errors.leer, /Kreiskante wählen/);
  nearV(map.get("ne").d, [Math.SQRT1_2, Math.SQRT1_2, 0]);
  nearV(map.get("ne").p, [3, 4, 5]);
  nearV(map.get("pa").d, [0, 0, 1]);
  nearV(map.get("pa").p, [7, 0, 0]);
});

test("Arbeitspunkt: Modellecke, Mitte, Versatz, drei Ebenen", () => {
  const { map, errors } = solve([
    { id: "m", type: "arbeitspunkt", mode: "modell", point: { p: [1, 2, 3] } },
    { id: "mi", type: "arbeitspunkt", mode: "mitte", p1: "m", p2: { x: "3", y: "4", z: "5" } },
    { id: "v", type: "arbeitspunkt", mode: "versatz", point: "mi", dx: "10", dy: "0", dz: "-1" },
    { id: "e", type: "arbeitsebene", mode: "versatz", base: "XY", distance: "12" },
    { id: "d3", type: "arbeitspunkt", mode: "dreiEbenen", plane1: "e", plane2: { o: [0, 7, 0], n: [0, 1, 0] }, plane3: { o: [4, 0, 0], n: [1, 0, 0] } },
    { id: "par", type: "arbeitspunkt", mode: "dreiEbenen", plane1: "XY", plane2: "e", plane3: "YZ" },
  ]);
  nearV(map.get("m").p, [1, 2, 3]);
  nearV(map.get("mi").p, [2, 3, 4]);
  nearV(map.get("v").p, [12, 3, 3]);
  nearV(map.get("d3").p, [4, 7, 12]);
  assert.match(errors.par, /nicht in einem Punkt/);
});

test("Polylinie: Stelle und Rückrechnung", () => {
  const pts = [[0, 0, 0], [10, 0, 0], [10, 30, 0]];
  nearV(alongPolyline(pts, 0.5).p, [10, 10, 0]);
  near(polylineParam(pts, [10, 10, 1]), 0.5, 1e-9);
  near(polylineParam(pts, [-5, 0, 0]), 0, 1e-12);
});

test("Erzeugen durch Anklicken: Art aus der Auswahl", () => {
  const face = { o: [0, 0, 5], n: [0, 0, 1] }, face2 = { o: [0, 0, 1], n: [0, 0, -1] };
  const edge = { p: [0, 0, 0], d: [1, 0, 0], a: [0, 0, 0], b: [20, 0, 0] };
  const P = (p) => ({ kind: "point", ref: { p } });
  const E = (refs) => inferDatum("arbeitsebene", refs);
  let r = E([{ kind: "plane", ref: face }]);
  assert.equal(r.feature.mode, "versatz"); assert.equal(r.feature.distance, "0"); assert.equal(r.complete, false);
  assert.equal(E([{ kind: "plane", ref: "XY" }]).feature.distance, "20");
  assert.equal(E([{ kind: "plane", ref: face }, { kind: "plane", ref: face2 }]).feature.mode, "mitte");
  assert.equal(E([{ kind: "plane", ref: "XY" }, { kind: "axis", ref: "X" }]).feature.mode, "winkel");
  assert.equal(E([{ kind: "axis", ref: edge }, P([0, 5, 5])]).feature.mode, "achsePunkt");
  assert.equal(E([P([0, 5, 5]), { kind: "axis", ref: edge }]).feature.mode, "normal");
  assert.equal(E([P([0, 0, 0]), P([1, 0, 0])]).feature, null);
  r = E([P([0, 0, 0]), P([1, 0, 0]), P([0, 1, 0])]);
  assert.equal(r.feature.mode, "punkte"); assert.equal(r.complete, true);
  r = E([{ kind: "curve", ref: { pts: [[0, 0, 0], [10, 0, 0]] }, at: [2.5, 1, 0] }]);
  assert.equal(r.feature.mode, "kurve"); assert.equal(r.feature.pos, "25");
  r = E([{ kind: "cyl", ref: { p: [0, 0, 0], d: [0, 0, 1], r: 5 }, at: [0, 5, 3] }]);
  assert.equal(r.feature.mode, "tangential"); nearV(r.feature.start, [0, 1, 0]);
  // Das abgeleitete Feature lässt sich auflösen
  const { map, errors } = solve([{ id: "t", type: "arbeitsebene", ...r.feature }]);
  assert.deepEqual(errors, {});
  nearV(map.get("t").frame.origin, [0, 5, 0]);
  assert.equal(tangentSide({ p: [0, 0, 0] }, [0, -1, 0], [0, 5, 0]), "-");

  const A = (refs) => inferDatum("arbeitsachse", refs);
  assert.equal(A([{ kind: "axis", ref: edge }]).feature.mode, "kante");
  assert.equal(A([{ kind: "axis", ref: { p: [0, 0, 0], d: [0, 0, 1], circle: true } }]).feature.mode, "kreis");
  assert.equal(A([{ kind: "cyl", ref: { p: [0, 0, 0], d: [0, 0, 1], r: 3 } }]).feature.mode, "zylinder");
  assert.equal(A([{ kind: "plane", ref: "XY" }, { kind: "plane", ref: "XZ" }]).feature.mode, "schnitt");
  assert.equal(A([{ kind: "plane", ref: face }, P([1, 1, 5])]).feature.mode, "normalEbene");
  assert.equal(A([{ kind: "axis", ref: "Z" }]).feature, null);
  assert.equal(A([{ kind: "axis", ref: "Z" }, P([4, 0, 0])]).feature.mode, "parallel");

  const Q = (refs) => inferDatum("arbeitspunkt", refs);
  assert.deepEqual(Q([{ kind: "axis", ref: edge }]).feature.point, { p: [10, 0, 0] });
  assert.equal(Q([P([0, 0, 0]), P([2, 2, 2])]).feature.mode, "mitte");
  assert.equal(Q([{ kind: "plane", ref: "XY" }, { kind: "plane", ref: "XZ" }, { kind: "plane", ref: "YZ" }]).feature.mode, "dreiEbenen");
  assert.equal(Q([{ kind: "axis", ref: "Z" }, { kind: "plane", ref: face }]).feature.mode, "schnitt");
  assert.match(Q([{ kind: "cyl", ref: { p: [0, 0, 0], d: [0, 0, 1], r: 1 } }, { kind: "cyl", ref: { p: [0, 0, 0], d: [0, 0, 1], r: 1 } }]).need, /geht nicht/);
});

test("Kreis aus drei Punkten, Bezüge für Vorschau und Abhängigkeiten", () => {
  const c = circleFrom3([10, 0, 0], [0, 10, 0], [-10, 0, 0]);
  nearV(c.p, [0, 0, 0]); near(c.r, 10); near(Math.abs(c.d[2]), 1);
  assert.deepEqual(datumRefsOf({ type: "arbeitsebene", mode: "mitte", plane1: "XY", plane2: "e1" }).map((r) => r.ref), ["XY", "e1"]);
  assert.deepEqual(datumRefsOf({ type: "arbeitsebene", mode: "winkel", base: "XY", axis: "u" }).map((r) => r.kind), ["plane"]);
  // Neue Bezugsfelder zählen als Abhängigkeit, Schnappschüsse nicht
  assert.deepEqual(featureRefs({ type: "arbeitsebene", mode: "zweiAchsen", axis: "a1", axis2: "a2" }).sort(), ["a1", "a2"]);
  assert.deepEqual(featureRefs({ type: "arbeitspunkt", mode: "dreiEbenen", plane1: "e1", plane2: { o: [0, 0, 0], n: [0, 0, 1] }, plane3: "e3" }).sort(), ["e1", "e3"]);
  assert.deepEqual(featureRefs({ type: "arbeitsachse", mode: "parallel", dir: "a7", point: "p1" }).sort(), ["a7", "p1"]);
  // Jede Art hat eine Bezeichnung und ist eindeutig
  for (const list of [PLANE_MODES, AXIS_MODES, POINT_MODES]) assert.equal(new Set(list.map((m) => m.value)).size, list.length);
});

test("Arbeitsebene umkehren: Normale zur Gegenseite, Rahmen bleibt rechtshändig", () => {
  const { map } = solve([{ id: "u", type: "arbeitsebene", mode: "versatz", base: "XY", distance: "5", flip: true }]);
  const { origin, xDir, yDir, normal } = map.get("u").frame;
  nearV(origin, [0, 0, 5]); nearV(normal, [0, 0, -1]);
  const cross = [xDir[1] * yDir[2] - xDir[2] * yDir[1], xDir[2] * yDir[0] - xDir[0] * yDir[2], xDir[0] * yDir[1] - xDir[1] * yDir[0]];
  nearV(cross, normal);
});
