// Unregelmäßige Muster (W3), ohne Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { parseSkip, spacingPositions } from "../src/core/muster.js";
import { evaluate } from "../src/core/expr.js";

test("Auslassen: Nummern, Bereiche, Reihe/Spalte", () => {
  assert.deepEqual([...parseSkip("3, 5-7")], [3, 5, 6, 7]);
  assert.deepEqual([...parseSkip("2/3", { n1: 4, n2: 3 })], [6]);
  assert.equal(parseSkip("").size, 0);
  assert.throws(() => parseSkip("1"), /Original/);
  assert.throws(() => parseSkip("x"), /keine Nummer/);
  assert.throws(() => parseSkip("5/1", { n1: 4, n2: 3 }), /außerhalb/);
});

test("Abstände als Liste mit Ausdrücken", () => {
  const E = (x) => evaluate(x, { a: 50 });
  assert.deepEqual(spacingPositions("100; 150; 2*a", E), [0, 100, 250, 350]);
  assert.deepEqual(spacingPositions("", E), [0]);
});
