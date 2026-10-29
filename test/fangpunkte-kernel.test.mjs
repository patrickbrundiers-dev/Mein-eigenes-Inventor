// Messen mit Fangpunkten im Kern (replicad + OpenCascade): Kreisangaben im Anzeigenetz, exakte Fangpunkte, Achse
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createKernel } from "../src/kernel/build.js";
import { edgeSnaps } from "../src/core/fangpunkte.js";

const require = createRequire(import.meta.url);
const R = await import("replicad");
const ocInit = (await import("replicad-opencascadejs")).default;
const OC = await ocInit({ locateFile: () => require.resolve("replicad-opencascadejs/wasm") });
R.setOC(OC);
const K = createKernel(R);
const near = (a, b, tol = 1e-9) => a.forEach((v, k) => assert.ok(Math.abs(v - b[k]) <= tol, `${a} ≠ ${b}`));

test("Anzeigenetz: Kreiskanten tragen Mitte, Radius, Achse und x-Richtung", () => {
  const cyl = R.makeCylinder(10, 20, [5, 0, 0], [0, 0, 1]);
  const m = K.meshBody(cyl);
  const circles = m.edges.filter((e) => e.type === "CIRCLE");
  assert.equal(circles.length, 2);
  for (const c of circles) {
    near([c.center[0], c.center[1]], [5, 0], 1e-9);
    assert.equal(c.radius, 10);
    near(c.axisD.map(Math.abs), [0, 0, 1]);
    // Fangpunkte aus Netz + Angaben: Kreismitte und vier Quadranten (geschlossen)
    const pts = []; for (let i = 0; i < c.positions.length; i += 3) pts.push([c.positions[i], c.positions[i + 1], c.positions[i + 2]]);
    assert.deepEqual(edgeSnaps(c, pts).map((s) => s.kind), ["center", "quadrant", "quadrant", "quadrant", "quadrant"]);
  }
});

test("Fangpunkt exakt: Kreismitte, Quadrant, Kantenmitte, Flächenmitte; Abstand Punkt–Punkt", () => {
  const cyl = R.makeCylinder(10, 20, [5, 0, 0], [0, 0, 1]);
  const top = cyl.edges.find((e) => e.geomType === "CIRCLE" && Math.abs(e.startPoint.z - 20) < 1e-9);
  near(K.snapPoint(top, "edge", "center"), [5, 0, 20], 1e-9);
  const c = K.snapPoint(top, "edge", "center"), q = K.snapPoint(top, "edge", "q0");
  assert.ok(Math.abs(Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]) - 10) < 1e-9);
  const box = R.makeBaseBox(40, 20, 10);
  const e = box.edges.find((x) => x.geomType === "LINE" && Math.abs(x.startPoint.z - x.endPoint.z) < 1e-9 && Math.abs(x.startPoint.y - x.endPoint.y) < 1e-9);
  const mid = K.snapPoint(e, "edge", "mid");
  near([mid[0]], [0], 1e-9);
  const f = box.faces.find((x) => x.geomType === "PLANE" && Math.abs(x.normalAt().z - 1) < 1e-9);
  near(K.snapPoint(f, "face", "center"), [0, 0, 10], 1e-9);
  const r = K.measure([{ shape: R.makeVertex(c), point: c, kind: "vertex", label: "Kreismitte" }, { shape: R.makeVertex([5, 0, 0]), point: [5, 0, 0], kind: "vertex" }]);
  assert.equal(r.items[0].label, "Kreismitte");
  assert.ok(Math.abs(r.distance - 20) < 1e-9);
});

test("Achse als Messelement: gerades Achsstück, Winkel und Abstand zur Fläche", () => {
  const box = R.makeBaseBox(40, 20, 10);
  const f = box.faces.find((x) => x.geomType === "PLANE" && Math.abs(x.normalAt().z - 1) < 1e-9);
  const r = K.measure([{ shape: R.makeLine([30, 0, 0], [30, 0, 50]), kind: "axis" }, { shape: f, kind: "face" }]);
  assert.equal(r.items[0].kind, "axis");
  assert.equal(r.items[0].type, "LINE");
  assert.ok(Math.abs(r.angle - 90) < 1e-9);
});
