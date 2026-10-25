// Fangen in der Skizze: Schnittpunkt, Mitte, Mittelpunkt, Quadrant, Bogenmitte, Ausrichtung
import test from "node:test";
import assert from "node:assert/strict";
import { specialSnap, alignSnap } from "../src/core/sketchsnap.js";

const sk = () => ({
  points: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }, { id: "c", x: 50, y: -50 }, { id: "d", x: 50, y: 50 }, { id: "k", x: 200, y: 0 }, { id: "bc", x: 300, y: 0 }, { id: "b1", x: 320, y: 0 }, { id: "b2", x: 280, y: 0 }],
  entities: [{ id: "L1", type: "line", p1: "a", p2: "b" }, { id: "L2", type: "line", p1: "c", p2: "d" }, { id: "K", type: "circle", c: "k", r: 30 }, { id: "B", type: "arc", c: "bc", p1: "b1", p2: "b2" }],
  constraints: [],
});

test("Schnittpunkt zweier Linien wird gefangen und an beide gebunden", () => {
  const s = specialSnap(sk(), 51, 1, 3);
  assert.equal(s.label, "Schnittpunkt");
  assert.ok(Math.abs(s.x - 50) < 1e-9 && Math.abs(s.y) < 1e-9);
  assert.deepEqual([s.on, s.onType, s.on2, s.onType2], ["L1", "line", "L2", "line"]);
});

test("Linienmitte, Kreismittelpunkt, Quadrant, Bogenmitte", () => {
  const one = sk();
  one.entities = one.entities.filter((e) => e.id !== "L2");
  const m = specialSnap(one, 50, 2, 3);
  assert.deepEqual([m.label, m.mid, m.x, m.y], ["Mitte", "L1", 50, 0]);
  const c = specialSnap(sk(), 201, 1, 3);
  assert.deepEqual([c.label, c.pointId], ["Mittelpunkt", "k"]);
  const q = specialSnap(sk(), 200.5, 29, 3);
  assert.equal(q.label, "Quadrant oben");
  assert.equal(q.on, "K");
  assert.ok(Math.abs(q.x - 200) < 1e-9 && Math.abs(q.y - 30) < 1e-9);
  const b = specialSnap(sk(), 301, 19, 3);
  assert.equal(b.label, "Bogenmitte");
  assert.ok(Math.abs(b.x - 300) < 1e-9 && Math.abs(b.y - 20) < 1e-9);
  assert.equal(specialSnap(sk(), 150, 80, 3), null);
  // ausgeschlossene Elemente zählen nicht
  assert.equal(specialSnap(sk(), 201, 1, 3, { exclude: new Set(["K"]) }), null);
});

test("Ausrichtung waagrecht/senkrecht zu Punkten, auch beides zugleich", () => {
  const s = { points: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 50 }], entities: [], constraints: [] };
  const v = alignSnap(s, 1, 30, 3);
  assert.deepEqual([v.x, v.y, v.label, v.guides.length], [0, 30, "Senkrecht zu Punkt", 1]);
  const both = alignSnap(s, 1.5, 49, 3);
  assert.deepEqual([both.x, both.y, both.label, both.guides.length], [0, 50, "Ausgerichtet", 2]);
  assert.equal(alignSnap(s, 40, 20, 3), null);
  const r = alignSnap({ points: [], entities: [], constraints: [] }, 10, 1, 3, { refs: [{ x: 50, y: 0 }] });
  assert.deepEqual([r.x, r.y, r.label], [10, 0, "Waagrecht zu Punkt"]);
});
