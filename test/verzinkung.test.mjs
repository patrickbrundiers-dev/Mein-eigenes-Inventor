// Verzinkungsbohrungen (W1): Richtwerte und Lage, ohne Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { ventDiameter, ventPlan, needsVent } from "../src/core/verzinkung.js";

const ax = (L, W, H = W) => ({ origin: [0, 0, 0], z: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], lo: 0, hi: L, width: W, height: H });

test("Richtwert-Ø nach Profilgröße (DIN EN ISO 14713-2)", () => {
  assert.equal(ventDiameter(15), 8);
  assert.equal(ventDiameter(40), 12);
  assert.equal(ventDiameter(80, 40), 12); // Rechteck (80 + 40) / 2 = 60
  assert.equal(ventDiameter(80), 16);
  assert.equal(ventDiameter(100), 20);
  assert.equal(ventDiameter(300), 45);
  assert.ok(needsVent("verzinkt") && needsVent("duplex") && !needsVent("pulver") && !needsVent(undefined));
});

test("Lage: an beiden Enden mit Randabstand, Gehrung schiebt nach innen", () => {
  const p = ventPlan(ax(1000, 40), { edge: 10 });
  assert.equal(p.d, 12);
  assert.deepEqual(p.holes.map((h) => h.z), [16, 984]);
  assert.deepEqual(p.holes[0].dir, [0, 0, 1]);
  assert.deepEqual(p.holes[0].p, [16, 0, -25]); // unter dem Profil, 5 mm Luft
  assert.equal(p.holes[0].len, 50);
  const m = ventPlan(ax(1000, 40), { miterA: 45 });
  assert.ok(Math.abs(m.holes[0].z - 56) < 1e-9, String(m.holes[0].z));
  assert.equal(ventPlan(ax(1000, 40), { ends: "B" }).holes.length, 1);
  assert.deepEqual(ventPlan(ax(1000, 60, 40), { dir: "u" }).holes[0].dir, [0, 1, 0]);
});

test("Kurzer Stab: eine Bohrung in der Mitte, zu großer Ø wird gemeldet", () => {
  const p = ventPlan(ax(30, 40));
  assert.equal(p.holes.length, 1);
  assert.equal(p.holes[0].z, 15);
  assert.match(p.issues[0], /zu kurz/);
  assert.match(ventPlan(ax(500, 20), { d: 18 }).issues[0], /70 %/);
});
