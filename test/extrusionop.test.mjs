import test from "node:test";
import assert from "node:assert/strict";
import { autoOp, profileInnerPoint, insidePoly } from "../src/core/extrusionop.js";

test("Extrusion: Vorgang automatisch (SolidCraft W5)", () => {
  assert.equal(autoOp({ hasBody: false, front: false, back: false }), "join");
  assert.equal(autoOp({ hasBody: true, front: true, back: true }), "cut");
  assert.equal(autoOp({ hasBody: true, front: true, back: false }), "cut");
  assert.equal(autoOp({ hasBody: true, front: false, back: true }), "join");
  assert.equal(autoOp({ hasBody: true, front: false, back: false }), "new");
});

test("Innenpunkt eines Profils: L-Form, Kreis, Ring", () => {
  const pts = [[0, 0], [100, 0], [100, 10], [10, 10], [10, 100], [0, 100]].map(([x, y], i) => ({ id: "p" + i, x, y }));
  const L = { points: pts, entities: pts.map((p, i) => ({ id: "l" + i, type: "line", p1: p.id, p2: pts[(i + 1) % pts.length].id })), constraints: [] };
  const q = profileInnerPoint(L);
  assert.ok(q && insidePoly([[0, 0], [100, 0], [100, 10], [10, 10], [10, 100], [0, 100]], q), JSON.stringify(q));
  const ring = { points: [{ id: "c", x: 5, y: 5 }], entities: [{ id: "k1", type: "circle", c: "c", r: 20 }, { id: "k2", type: "circle", c: "c", r: 10 }], constraints: [] };
  const r = profileInnerPoint(ring);
  const d = Math.hypot(r[0] - 5, r[1] - 5);
  assert.ok(d > 10 && d < 20, String(d));
});
