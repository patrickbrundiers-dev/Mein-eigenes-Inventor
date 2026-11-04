import test from "node:test";
import assert from "node:assert/strict";
import { vertexCurvature, minRadiusOf, curvatureColor, accessibility, continuityClass } from "../src/core/flaechenpruefung.js";
const near = (a, b, t) => assert.ok(Math.abs(a - b) <= t, `${a} ≠ ${b}`);

// Zylindermantel r = 10 als Netz
function cylinder(r = 10, n = 64, hgt = 20) {
  const pos = [], nrm = [], idx = [];
  for (let i = 0; i <= n; i++) for (const z of [0, hgt]) { const t = (2 * Math.PI * i) / n; pos.push(r * Math.cos(t), r * Math.sin(t), z); nrm.push(Math.cos(t), Math.sin(t), 0); }
  for (let i = 0; i < n; i++) { const a = 2 * i; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  return { positions: Float32Array.from(pos), normals: Float32Array.from(nrm), indices: Uint32Array.from(idx) };
}
const quad = (z, s = 10, nz = 1) => ({ positions: Float32Array.from([-s, -s, z, s, -s, z, s, s, z, -s, s, z]), normals: Float32Array.from([0, 0, nz, 0, 0, nz, 0, 0, nz, 0, 0, nz]), indices: Uint32Array.from([0, 1, 2, 0, 2, 3]) });

test("Krümmung am Netz (E4): Zylinder r 10, Ebene flach, Farbskala", () => {
  const c = cylinder();
  const k = vertexCurvature(c.positions, c.normals, c.indices);
  near(minRadiusOf(k), 10, 0.1);
  const q = quad(0);
  assert.equal(minRadiusOf(vertexCurvature(q.positions, q.normals, q.indices)), Infinity);
  assert.deepEqual(curvatureColor(0), [0.2, 0.35, 0.85]);
  assert.deepEqual(curvatureColor(1).map((x) => Math.round(x * 100)), [85, 15, 12]);
});

test("Zugänglichkeit (E4): verdeckte untere Platte, abgewandte Seite", () => {
  const top = quad(10, 10), bottom = quad(0, 20), under = quad(-5, 5, -1);
  const r = accessibility([top, bottom, under], [0, 0, 1], { cells: 16 });
  assert.deepEqual([...r.vis[0]], [1, 1, 1, 1]);
  assert.deepEqual([...r.vis[1]], [1, 1, 1, 1], "Ecken der großen Platte liegen außerhalb der oberen");
  assert.deepEqual([...r.vis[2]], [2, 2, 2, 2]);
  // Punkt mitten unter der oberen Platte ist verdeckt
  const mid = { positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]), normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]), indices: Uint32Array.from([0, 1, 2]) };
  assert.deepEqual([...accessibility([top, mid], [0, 0, 1]).vis[1]], [0, 0, 0]);
  assert.ok(r.area.abgewandt > 0 && r.area.frei > 0);
  assert.equal(continuityClass(0.2).cls, "g1"); assert.equal(continuityClass(90).cls, "knick"); assert.equal(continuityClass(NaN).cls, "rand");
});

test("Krümmungskamm (E4): Kreisbogen gleich lange Zähne, Gerade ohne Zähne", async () => {
  const { curvatureComb } = await import("../src/core/flaechenpruefung.js");
  const arc = Array.from({ length: 31 }, (_, i) => { const t = (Math.PI * i) / 30; return [20 * Math.cos(t), 20 * Math.sin(t), 0]; });
  const c = curvatureComb(arc, { scale: 100 });
  near(c.kMax, 1 / 20, 1e-3);
  assert.equal(c.teeth.length, 29);
  for (const [p, q] of c.teeth) { near(Math.hypot(q[0] - p[0], q[1] - p[1]), 5, 0.02); near(Math.hypot(...q), 25, 0.05); }
  const line = curvatureComb([[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]]);
  assert.equal(line.kMax, 0);
});
