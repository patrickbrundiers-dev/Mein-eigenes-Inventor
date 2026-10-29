// Vereinfachen für den Export (W10), ohne Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { simplifyOf, simplifyAction, boxSize, simplifyText } from "../src/core/vereinfachen.js";

const bb = (x, y, z) => [[0, 0, 0], [x, y, z]];

test("Einstellung: aus, Standardwerte, Zahlen", () => {
  assert.equal(simplifyOf({}), null);
  assert.equal(simplifyOf({ simplify: { on: false } }), null);
  assert.deepEqual(simplifyOf({ simplify: { on: true } }), { minSize: 0, norm: true, welds: true, envelope: "nein", envSize: 100 });
  assert.deepEqual(simplifyOf({ simplify: { on: true, minSize: "20", norm: false, envelope: "klein", envSize: "" } }), { minSize: 20, norm: false, welds: true, envelope: "klein", envSize: 100 });
});

test("Je Körper: Normteil, Naht, klein, Hüllquader", () => {
  const opt = simplifyOf({ simplify: { on: true, minSize: "15", envelope: "klein", envSize: "200" } });
  assert.equal(boxSize(bb(10, 300, 5)), 300);
  assert.equal(simplifyAction({ meta: { norm: { designation: "M12" } } }, bb(50, 50, 50), opt), "drop");
  assert.equal(simplifyAction({ kind: "solid", meta: { weld: true } }, bb(500, 5, 5), opt), "drop");
  assert.equal(simplifyAction({ kind: "solid" }, bb(10, 10, 10), opt), "drop");
  assert.equal(simplifyAction({ kind: "solid" }, bb(100, 80, 10), opt), "box");
  assert.equal(simplifyAction({ kind: "member" }, bb(2000, 40, 40), opt), "keep");
  assert.equal(simplifyAction({ meta: { norm: {} } }, bb(5, 5, 5), null), "keep");
  assert.equal(simplifyAction({ kind: "member" }, bb(2000, 40, 40), { ...opt, envelope: "alle" }), "box");
  assert.equal(simplifyText({ drop: 3, box: 0 }), "Vereinfacht: 3 Körper weggelassen");
});
