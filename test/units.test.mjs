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

test("Einheit gilt für den ganzen Term davor (Entscheidung 24.10.2026)", () => {
  near(evaluate('3/4"'), 19.05);
  near(evaluate('(3/4)"'), 19.05);
  near(evaluate("1/2 cm"), 5);
  near(evaluate("100/2 cm"), 500);
  near(evaluate("2 m * 3"), 6000);
  near(evaluate("2(1+1) cm"), 40);
  near(evaluate("-2 in"), -50.8);
  // Summen: jede Einheit gilt nur für ihren Summanden
  near(evaluate("1 in + 5 mm"), 30.4);
  near(evaluate("L/2 + 5 mm", { L: 100 }), 55);
  near(evaluate("sin(30°)"), 0.5);
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
