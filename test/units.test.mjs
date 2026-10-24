// Einheiten in Ausdrücken (B-7: Zoll)
import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, resolveParams, isValidName } from "../src/core/expr.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("Zoll: in, zoll und \" ergeben exakt 25,4 mm", () => {
  near(evaluate("1 in"), 25.4);
  near(evaluate("1in"), 25.4);
  near(evaluate("2 zoll"), 50.8);
  near(evaluate('1"'), 25.4);
  near(evaluate("1,5 in"), 38.1);
  near(evaluate("1 in + 5 mm"), 30.4);
  near(evaluate("(1+1) in"), 50.8);
  near(evaluate("D in", { D: 2 }), 50.8);
});

test("Zoll: Brüche brauchen Klammern, weil die Einheit nur am letzten Wert hängt (wie bei cm/m)", () => {
  near(evaluate('(3/4)"'), 19.05);
  near(evaluate("3/4 * 1 in"), 19.05);
  // unverändertes, bestehendes Verhalten: Einheit bindet stärker als die Division
  near(evaluate('3/4"'), 3 / (4 * 25.4));
  near(evaluate("1/2 cm"), 1 / 20);
});

test("Zoll: Umrechnung hin und zurück ohne Rundungsfehler", () => {
  for (const mm of [0, 1, 25.4, 48.3, 1000]) near(evaluate(`${mm / 25.4} in`), mm, 1e-9);
});

test("Zoll: bestehende Einheiten und Parameter unverändert", () => {
  near(evaluate("12 mm"), 12);
  near(evaluate("2cm"), 20);
  near(evaluate("1,5 m"), 1500);
  near(evaluate("45°"), 45);
  // ein vorhandener Parameter namens »in« bleibt als Wert nutzbar
  assert.deepEqual(resolveParams([{ name: "in", expr: "3" }, { name: "b", expr: "in*2" }]).values, { in: 3, b: 6 });
  // neue Parameter dürfen nicht wie eine Einheit heißen
  for (const n of ["in", "zoll", "mm"]) assert.equal(isValidName(n), false, n);
});
