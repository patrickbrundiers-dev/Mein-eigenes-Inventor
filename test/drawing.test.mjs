// Zeichnung (P1-C): Positionsnummern und Detailansicht (ohne Geometrie-Kern)
import test from "node:test";
import assert from "node:assert/strict";
import { projectPoint, partCenter, balloonAnchors, placeBalloons } from "../src/core/balloons.js";
import { clipPolylineToCircle, clipProjection } from "../src/core/clip.js";

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

test("Projektion wie Kernel-Kamera (Werte aus replicad-Messung)", () => {
  const p = [100, 20, 30];
  // gemessen mit K.projectView an einem kleinen Würfel bei p
  const cases = [[[0, -1, 0], [0, 0, 1], [-100, 30]], [[0, 0, 1], [0, 1, 0], [-100, 20]], [[1, -1, 1], [0, 0, 1], [-84.85, -8.16]]];
  for (const [dir, up, exp] of cases) {
    const [x, y] = projectPoint(p, dir, up);
    near(x, exp[0], 0.01); near(y, exp[1], 0.01);
  }
});

test("Anker: erste sichtbare Komponente je Bauteil, Platzierung angewendet", () => {
  const res = { a: { bodies: [{ props: { bbox: [[0, 0, 0], [100, 20, 10]] } }, { props: { bbox: [[0, 0, 10], [100, 20, 30]] } }] }, b: { bodies: [{ props: { bbox: [[-5, -5, 0], [5, 5, 50]] } }] } };
  assert.deepEqual(partCenter(res.a), [50, 10, 15]);
  assert.equal(partCenter({ bodies: [] }), null);
  const asm = { components: [
    { part: "a", pos: [0, 0, 0], rot: [0, 0, 0], hidden: true },
    { part: "a", pos: [1000, 0, 0], rot: [0, 0, 90] },
    { part: "a", pos: [0, 0, 0], rot: [0, 0, 0] },
    { part: "b", pos: [0, 0, 100], rot: [0, 0, 0] },
    { part: "fehlt", pos: [0, 0, 0], rot: [0, 0, 0] },
  ] };
  const an = balloonAnchors(asm, (id) => res[id]);
  assert.equal(an.length, 2);
  assert.equal(an[0].part, "a");
  // (50,10,15) um Z 90° → (-10,50,15), dann +1000 in X
  [990, 50, 15].forEach((v, k) => near(an[0].p3[k], v, 1e-9));
  assert.deepEqual(an[1].p3, [0, 0, 125]);
});

test("Kreise außerhalb der Ansicht und ohne Überlappung", () => {
  const box = { x0: 100, y0: 100, x1: 200, y1: 160 };
  // fünf Anker fast an derselben Stelle → müssen auseinander
  const anchors = [0, 1, 2, 3, 4].map((i) => ({ key: "p" + i, at: [190 + i * 0.1, 150] }));
  const pos = placeBalloons(anchors, box, { r: 4 });
  const pts = [...pos.values()];
  for (const [x, y] of pts) assert.ok(x < box.x0 - 4 || x > box.x1 + 4 || y < box.y0 - 4 || y > box.y1 + 4, `Kreis in der Ansicht: ${x},${y}`);
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) assert.ok(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) >= 8.5, "Kreise überlappen");
  // Anker rechts unten → Kreis rechts unten von der Mitte
  const one = placeBalloons([{ key: "x", at: [200, 160] }], box).get("x");
  assert.ok(one[0] > 150 && one[1] > 130);
});

// ---------- Detailansicht ----------

test("Detail: Linien am Kreis abschneiden", () => {
  const c = [0, 0], r = 10;
  // durchgehende Gerade → ein Stück von -10 bis 10
  const [a] = clipPolylineToCircle([[-20, 0], [20, 0]], c, r);
  assert.deepEqual(a.map((p) => p.map((x) => Math.round(x * 1e9) / 1e9)), [[-10, 0], [10, 0]]);
  // ganz innen bleibt unverändert
  assert.deepEqual(clipPolylineToCircle([[-1, -1], [1, 1], [2, 0]], c, r), [[[-1, -1], [1, 1], [2, 0]]]);
  // außen → nichts; Tangente → nichts
  assert.deepEqual(clipPolylineToCircle([[20, 20], [30, 20]], c, r), []);
  assert.deepEqual(clipPolylineToCircle([[-20, 10], [20, 10]], c, r), []);
  // raus und wieder rein → zwei Stücke
  const parts = clipPolylineToCircle([[0, 0], [0, 20], [5, 20], [5, 0]], c, r);
  assert.equal(parts.length, 2);
});

test("Detail: Projektion zuschneiden, nur ganz innen liegende Kreise bleiben", () => {
  const p = { visible: [[[-50, 0], [50, 0]]], hidden: [[[0, -50], [0, 50]]], arcs: [{ cx: 2, cy: 2, r: 3, full: true }, { cx: 9, cy: 0, r: 3, full: true }], hiddenArcs: [] };
  const d = clipProjection(p, [0, 0], 10);
  assert.equal(d.visible.length, 1);
  assert.equal(d.hidden.length, 1);
  assert.equal(d.arcs.length, 1);
  assert.deepEqual(d.bbox, { x0: -10, y0: -10, x1: 10, y1: 10 });
});
