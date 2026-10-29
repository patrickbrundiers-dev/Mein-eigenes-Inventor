// Messen: Fangpunkte im 3D-Fenster (Endpunkt, Mitte, Kreismitte, Quadrant, Flächenmitte), Auswahlfilter, Hinweise
import test from "node:test";
import assert from "node:assert/strict";
import { edgeSnaps, faceSnaps, nearestSnap, quadrantPoint, axisSegment, glyphPath, sketchSnapKind } from "../src/core/fangpunkte.js";
import { measurePickOptions, measureHitLabel, sameMeasureHit, axisDistance } from "../src/core/messen.js";

const near = (a, b, tol = 1e-9) => a.forEach((v, k) => assert.ok(Math.abs(v - b[k]) <= tol, `${a} ≠ ${b}`));
const circlePts = (r, a0, a1, n = 32) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [r * Math.cos(a), r * Math.sin(a), 0]; });
const CIRC = { type: "CIRCLE", center: [0, 0, 0], radius: 10, axisD: [0, 0, 1], xDir: [1, 0, 0] };

test("Gerade Kante: zwei Endpunkte und Mittelpunkt mit Bezug für den Kern", () => {
  const s = edgeSnaps({ type: "LINE", mid: [5, 0, 0] }, [[0, 0, 0], [10, 0, 0]]);
  assert.deepEqual(s.map((x) => [x.kind, x.ref]), [["end", "start"], ["end", "end"], ["mid", "mid"]]);
});

test("Vollkreis: Kreismitte und vier Quadranten, keine Endpunkte", () => {
  const s = edgeSnaps({ ...CIRC, mid: [-10, 0, 0] }, circlePts(10, 0, 2 * Math.PI));
  assert.deepEqual(s.map((x) => x.ref), ["center", "q0", "q1", "q2", "q3"]);
  near(s.find((x) => x.ref === "q1").p, [0, 10, 0], 1e-9);
});

test("Viertelbogen: Enden, Bogenmitte, Kreismitte; Quadranten auf den Enden fallen weg", () => {
  const s = edgeSnaps({ ...CIRC, mid: [7.07, 7.07, 0] }, circlePts(10, 0, Math.PI / 2));
  assert.deepEqual(s.map((x) => x.kind), ["end", "end", "arcMid", "center"]);
  const h = edgeSnaps({ ...CIRC, mid: [0, 10, 0] }, circlePts(10, 0, Math.PI));
  assert.deepEqual(h.filter((x) => x.kind === "quadrant").map((x) => x.ref), ["q1"]);
});

test("Quadrant folgt der Kreislage (Achse × x-Richtung)", () => {
  near(quadrantPoint([1, 2, 3], [0, 0, 1], [0, 1, 0], 5, 1), [-4, 2, 3], 1e-12);
  near(quadrantPoint([0, 0, 0], [1, 0, 0], [0, 1, 0], 2, 3), [0, 0, -2], 1e-12);
});

test("Flächenmitte nur für ebene Flächen", () => {
  assert.equal(faceSnaps({ type: "PLANE", point: [1, 1, 0] })[0].kind, "faceCenter");
  assert.equal(faceSnaps({ type: "CYLINDER", point: [1, 1, 0] }).length, 0);
});

test("Nächster Fangpunkt: Abstand, bei gleichem Abstand der Vorrang (Endpunkt vor Quadrant)", () => {
  const c = [{ kind: "quadrant", sx: 10, sy: 10 }, { kind: "end", sx: 11, sy: 10 }, { kind: "mid", sx: 30, sy: 10 }];
  assert.equal(nearestSnap(c, 10, 10, 8).kind, "end");
  assert.equal(nearestSnap(c, 29, 10, 8).kind, "mid");
  assert.equal(nearestSnap(c, 50, 50, 8), null);
});

test("Achsstück über die Länge der Fläche mit Überstand", () => {
  const ax = axisSegment([0, 0, 0], [0, 0, 2], [[5, 0, 10], [0, 5, 30], [-5, 0, 20]]);
  near(ax.a, [0, 0, 8]);
  near(ax.b, [0, 0, 32]);
});

test("Fangsymbole: eigener schlanker Umriss je Fangart; Skizzen-Fang wird zugeordnet", () => {
  const kinds = ["end", "mid", "center", "quadrant", "faceCenter", "intersection", "on"];
  const paths = kinds.map((k) => glyphPath(k, 5));
  assert.equal(new Set(paths).size, kinds.length);
  for (const p of paths) assert.match(p, /^M/);
  assert.equal(sketchSnapKind({ label: "Mittelpunkt", pointId: "c" }), "center");
  assert.equal(sketchSnapKind({ label: "Quadrant 90°", on: "K" }), "quadrant");
  assert.equal(sketchSnapKind({ label: "Schnittpunkt", on: "a", on2: "b" }), "intersection");
  assert.equal(sketchSnapKind({ label: "Punkt", pointId: "p" }), "end");
  assert.equal(sketchSnapKind({ label: "Auf Linie", on: "L" }), "on");
  assert.equal(sketchSnapKind({ x: 1, y: 2 }), null);
});

test("Auswahlfilter im Messwerkzeug", () => {
  assert.deepEqual(measurePickOptions("alle", 9), { edges: true, faces: true, snaps: true, snapRadius: 9, snapKinds: ["end", "mid", "arcMid", "center"], axes: true });
  assert.equal(measurePickOptions("punkte").snapKinds, null);
  assert.equal(measurePickOptions("punkte", 10).snapRadius, 16);
  assert.equal(measurePickOptions("punkte").faces, false);
  assert.deepEqual(measurePickOptions("kanten"), { edges: true, faces: false, snaps: false, axes: false });
  assert.equal(measurePickOptions("flaechen").faces, true);
  assert.equal(measurePickOptions(undefined, undefined).snapRadius, 9);
});

test("Hinweis am Mauszeiger und Gleichheit von Treffern", () => {
  assert.equal(measureHitLabel({ kind: "point", label: "Kreismitte" }), "Kreismitte");
  assert.equal(measureHitLabel({ kind: "edge", info: { type: "CIRCLE", radius: 5 } }), "Kante · Kreis R 5,00");
  assert.equal(measureHitLabel({ kind: "face", info: { type: "PLANE" } }), "Fläche · eben");
  assert.equal(measureHitLabel({ kind: "axis" }), "Achse");
  const a = { kind: "point", key: "part", body: 0, src: "edge", edge: 3, ref: "center" };
  assert.ok(sameMeasureHit(a, { ...a }));
  assert.ok(!sameMeasureHit(a, { ...a, ref: "q0" }));
  assert.ok(sameMeasureHit({ kind: "face", key: "part", body: 0, face: 2 }, { kind: "face", key: "part", body: 0, face: 2 }));
});

test("Achse als Messelement: Achsabstand zu Punkt und zu paralleler Achse", () => {
  const ax = { kind: "axis", type: "LINE", start: [0, 0, 0], dir: [0, 0, 1] };
  assert.equal(axisDistance(ax, { kind: "vertex", point: [3, 4, 7] }).value, 5);
  const r = axisDistance(ax, { kind: "axis", type: "LINE", start: [10, 0, 5], dir: [0, 0, -1] });
  assert.equal(r.kind, "parallel");
  assert.equal(r.value, 10);
});
