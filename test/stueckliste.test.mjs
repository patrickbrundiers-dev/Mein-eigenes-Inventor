// Stückliste (W5): feste Reihenfolge und Masse von Hand, ohne Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { massOverride, partMass, orderBomRows } from "../src/core/mass.js";

test("Masse von Hand hat Vorrang, leer oder ungültig = berechnet", () => {
  const bodies = [{ props: { volume: 1e6 } }];
  assert.equal(partMass({}, bodies, 7.85), 7.85);
  assert.equal(partMass({ massOverride: "1.2" }, bodies, 7.85), 1.2);
  assert.equal(massOverride({ massOverride: "2,5" }), 2.5);
  assert.equal(massOverride({ massOverride: "" }), null);
  assert.equal(massOverride({ massOverride: "abc" }), null);
  assert.equal(massOverride({ massOverride: "0" }), 0);
});

test("Reihenfolge: genannte zuerst, Rest wie vorher, Normteile am Ende", () => {
  const P = (id) => ({ part: { id }, name: id });
  const rows = [P("a"), P("b"), { name: "M12", norm: true }, P("c"), P("d")];
  assert.deepEqual(orderBomRows(rows, ["c", "a"]).map((r) => r.name), ["c", "a", "b", "d", "M12"]);
  assert.deepEqual(orderBomRows(rows).map((r) => r.name), ["a", "b", "c", "d", "M12"]);
});
