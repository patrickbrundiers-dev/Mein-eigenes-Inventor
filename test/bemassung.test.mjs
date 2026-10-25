// Zeichnung: Ketten-/Bezugsmaß, Reihen, Positionsnummern, Bogenlänge (FU11)
import { test } from "node:test";
import assert from "node:assert/strict";
import { chainDims, alignRows, clockwiseOrder, alignBalloons, arcLength, ROW_GAP } from "../src/core/bemassung.js";

test("Kettenmaß und Bezugsmaß", () => {
  const pts = [[0, 0], [30, 5], [30, 9], [100, 0]];
  const k = chainDims(pts, { kind: "h", mode: "kette", off: 10 });
  assert.deepEqual(k.map((m) => [m.p1[0], m.p2[0], m.off]), [[0, 30, 10], [30, 100, 10]], "gleiche x-Lage entfällt");
  const b = chainDims([[0, 0], [100, 0], [30, 0], [60, 0]], { kind: "h", mode: "bezug", off: -10 });
  assert.deepEqual(b.map((m) => [m.p2[0], m.off]), [[30, -10], [60, -10 - ROW_GAP], [100, -10 - 2 * ROW_GAP]]);
  const v = chainDims([[0, 0], [0, 40], [5, 80]], { kind: "v" });
  assert.deepEqual(v.map((m) => [m.p1[1], m.p2[1]]), [[0, 40], [40, 80]]);
});

test("Reihen: kurze innen, überlappende in die nächste Reihe, je Seite", () => {
  const r = alignRows([
    { id: "a", side: 1, edge: 50, lo: 0, hi: 100 },
    { id: "b", side: 1, edge: 40, lo: 0, hi: 30 },
    { id: "c", side: 1, edge: 45, lo: 30, hi: 100 },
    { id: "d", side: -1, edge: 0, lo: 0, hi: 20 },
  ]);
  assert.deepEqual([r.get("b"), r.get("c"), r.get("a"), r.get("d")], [60, 60, 67, -10]);
});

test("Positionsnummern: Uhrzeigersinn ab oben, an die Seiten ausrichten", () => {
  const c = [100, 100];
  const items = [{ key: "unten", at: [100, 200] }, { key: "rechts", at: [200, 100] }, { key: "oben", at: [100, 0] }, { key: "links", at: [0, 100] }];
  assert.deepEqual(clockwiseOrder(items, c), ["oben", "rechts", "unten", "links"]);
  const box = { x0: 50, y0: 50, x1: 150, y1: 150 };
  const m = alignBalloons([{ key: 1, at: [20, 90] }, { key: 2, at: [25, 92] }, { key: 3, at: [180, 60] }, { key: 4, at: [100, 10] }], box, { gap: 12, step: 10 });
  assert.deepEqual(m.get(1), [38, 90]);
  assert.deepEqual(m.get(2), [38, 100], "Mindestabstand");
  assert.deepEqual(m.get(3), [162, 60]);
  assert.deepEqual(m.get(4), [100, 38]);
});

test("Bogenlänge", () => {
  assert.equal(arcLength(10, Math.PI / 2), 5 * Math.PI);
});
