// Blechkasten und »In Blech umwandeln« (Fusion-Abgleich FU19 mit E12)
import { test } from "node:test";
import assert from "node:assert/strict";
import { planBlechkasten, boxFromBody, wallSet } from "../src/core/blechkasten.js";
import { bendAllowance } from "../src/core/blech.js";

const base = { L: 300, B: 200, H: 60, t: 2, ri: 2, k: 0.33, walls: "vorne; rechts; hinten; links", gap: 0.5 };

test("Vier Wände: Ecken aufgetrennt, eine Richtung läuft durch, Abwicklung als Kreuz", () => {
  const p = planBlechkasten(base);
  const ba = bendAllowance(2, 0.33, 2, Math.PI / 2);
  assert.equal(p.R, 4);
  assert.equal(p.h, 56);
  assert.deepEqual(p.base, { x0: 4, x1: 296, y0: 4, y1: 196 });
  const of = (s) => p.sides.find((x) => x.side === s);
  assert.deepEqual(of("vorne").wall, [0, 300]);
  assert.deepEqual(of("links").wall, [2.5, 197.5]);
  assert.equal(p.corners, 4);
  // Fläche: Boden + Biegezonen + Wände
  const area = 292 * 192 + 2 * (292 + 192) * ba + 2 * 300 * 56 + 2 * 195 * 56;
  assert.ok(Math.abs(p.flat.area - area) < 1e-2);
  assert.equal(p.flat.outer.length, 28, "Kreuz mit abgesetzten Ecken");
  assert.ok(Math.abs(p.flat.width - (300 + 2 * (56 + ba - 4))) < 1e-4);
  assert.equal(p.flat.bends.length, 4);
  // andere Richtung durchlaufend
  const q = planBlechkasten({ ...base, through: "y" });
  assert.deepEqual(q.sides.find((x) => x.side === "vorne").wall, [2.5, 297.5]);
  assert.deepEqual(q.sides.find((x) => x.side === "links").wall, [0, 200]);
});

test("Ohne Wand bleibt der Boden bis zur Außenkante, U-Form ohne Ecken", () => {
  const p = planBlechkasten({ ...base, walls: "vorne; hinten" });
  assert.deepEqual(p.base, { x0: 0, x1: 300, y0: 4, y1: 196 });
  assert.equal(p.corners, 0);
  assert.equal(p.flat.outer.length, 4);
  assert.deepEqual([...wallSet("Vorne, hinten; quatsch")], ["vorne", "hinten"]);
  assert.throws(() => planBlechkasten({ ...base, H: 3 }), /Höhe muss größer/);
  assert.throws(() => planBlechkasten({ ...base, gap: 5 }), /Spalt/);
});

test("Umwandeln nur für Quader", () => {
  assert.deepEqual(boxFromBody([[10, 0, 0], [110, 50, 20]], 100000), { pos: [10, 0, 0], L: 100, B: 50, H: 20 });
  assert.throws(() => boxFromBody([[0, 0, 0], [100, 50, 20]], 90000), /nur quaderförmige/);
});
