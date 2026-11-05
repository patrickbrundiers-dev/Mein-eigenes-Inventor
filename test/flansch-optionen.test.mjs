import test from "node:test";
import assert from "node:assert/strict";
import { flangeAdjust, planSheet } from "../src/core/blechplus.js";
import { bendCut } from "../src/core/blech.js";

// Zahlen aus dem SolidCraft-Handbuch: 2 mm Blech, R 2, Höhe 20
test("Flansch: Höhe gemessen ab außen/innen/tangential (SolidCraft-Werte)", () => {
  const leg = (angle, heightFrom) => { const cut = bendCut(angle, 2, 2, "aussen"); const a = flangeAdjust({ angle, r: 2, t: 2, cutUsed: cut, heightFrom, length: 20 }); return 20 + a.flange - cut; };
  const r2 = (x) => Math.round(x * 100) / 100;
  assert.deepEqual([leg(90, "aussen"), leg(90, "innen"), leg(90, "tangential")].map(r2), [16, 18, 16]);
  assert.deepEqual([leg(120, "aussen"), leg(120, "innen"), leg(120, "tangential")].map(r2), [13.07, 16.54, 16]);
  assert.throws(() => flangeAdjust({ angle: 90, r: 2, t: 2, cutUsed: 4, heightFrom: "aussen", length: 3 }), /mindestens 4/);
});

test("Flansch: Biegeposition verlängert bzw. kürzt den Grundschenkel", () => {
  const base = (position) => flangeAdjust({ angle: 90, r: 2, t: 2, cutUsed: 4, position }).base;
  assert.deepEqual(["innen", "aussen", "mitte", "materialAussen", "tangential"].map((x) => Math.round(base(x) * 1e9) / 1e9), [0, 4, 2, 2, 0]);
  const spec = { legs: [100], angles: [], t: 2, ri: 2, k: 0.33, ref: "aussen", L: 50 };
  const flat = (e) => planSheet(spec, [{ type: "lasche", edge: "ende", length: 20, angle: 90, dir: 1, ...e }]).plan.flat;
  const f0 = flat({}), fOut = flat({ position: "aussen" });
  assert.ok(Math.abs(fOut - f0 - 4) < 1e-6, `${f0} ${fOut}`);
});

test("Falten: Schenkel an einer Linie biegen", () => {
  const spec = { legs: [100], angles: [], t: 2, ri: 2, k: 0.33, ref: "aussen", L: 50 };
  const S = planSheet(spec, [{ type: "falten", leg: 1, s: 40, angle: 90, dir: 1, line: "mitte" }]);
  assert.equal(S.plan.bends.length, 1);
  assert.deepEqual(S.legs, [40, 60]);
  assert.throws(() => planSheet(spec, [{ type: "falten", leg: 1, s: 1, angle: 90, dir: 1 }]), /zu nah am Anfang/);
});

import { validateSheetRule, effectiveSheet, noteAngle } from "../src/core/blechregeln.js";
test("Blechregel: Spalt Umschlag, Spalt Ecke, Winkel in DXF", () => {
  const r = validateSheetRule({ id: "x1", name: "X", material: "S235", t: 2, ri: 2, rule: "k", k: 0.33, hemGap: "0,5", gap: 1, angleDisplay: "innen" });
  assert.ok(r.ok, r.error);
  assert.equal(r.value.hemGap, 0.5); assert.equal(r.value.gap, 1); assert.equal(r.value.angleDisplay, "innen");
  const e = effectiveSheet({ sheetRule: r.value }, Number, "S235");
  assert.equal(e.hemGap, 0.5); assert.equal(e.gap, 1);
  assert.equal(noteAngle(90, "innen"), 90); assert.equal(noteAngle(60, "innen"), 120); assert.equal(noteAngle(-60, "biege"), 60);
  assert.ok(!validateSheetRule({ id: "x1", name: "X", material: "S235", t: 2, ri: 2, hemGap: -1 }).ok);
});
