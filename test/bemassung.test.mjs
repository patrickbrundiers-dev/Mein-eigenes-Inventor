// Zeichnung: Ketten-/Bezugsmaß, Reihen, Positionsnummern, Bogenlänge (FU11)
import { test } from "node:test";
import assert from "node:assert/strict";
import { chainDims, alignRows, clockwiseOrder, alignBalloons, arcLength, ROW_GAP } from "../src/core/bemassung.js";

test("Kettenmaß und Bezugsmaß", () => {
  const pts = [[0, 0], [30, 5], [30, 9], [100, 0]];
  const k = chainDims(pts, { kind: "h", mode: "kette", off: 10 });
  assert.deepEqual(k.map((m) => [m.p1[0], m.p2[0], m.off]), [[0, 30, 10], [30, 100, 10]], "gleiche x-Lage entfällt");
  const b = chainDims([[0, 0], [100, 0], [30, 0], [60, 0]], { kind: "h", mode: "bezug", off: -10 });
  assert.deepEqual(b.map((m) => [m.p2[0], m.off]), [[30, -10], [60, -10 - ROW_GAP], [100, -10 - 2 * ROW_GAP]]);
  const v = chainDims([[0, 0], [0, 40], [5, 80]], { kind: "v" });
  assert.deepEqual(v.map((m) => [m.p1[1], m.p2[1]]), [[0, 40], [40, 80]]);
});

test("Reihen: kurze innen, überlappende in die nächste Reihe, je Seite", () => {
  const r = alignRows([
    { id: "a", side: 1, edge: 50, lo: 0, hi: 100 },
    { id: "b", side: 1, edge: 40, lo: 0, hi: 30 },
    { id: "c", side: 1, edge: 45, lo: 30, hi: 100 },
    { id: "d", side: -1, edge: 0, lo: 0, hi: 20 },
  ]);
  assert.deepEqual([r.get("b"), r.get("c"), r.get("a"), r.get("d")], [60, 60, 67, -10]);
});

test("Positionsnummern: Uhrzeigersinn ab oben, an die Seiten ausrichten", () => {
  const c = [100, 100];
  const items = [{ key: "unten", at: [100, 200] }, { key: "rechts", at: [200, 100] }, { key: "oben", at: [100, 0] }, { key: "links", at: [0, 100] }];
  assert.deepEqual(clockwiseOrder(items, c), ["oben", "rechts", "unten", "links"]);
  const box = { x0: 50, y0: 50, x1: 150, y1: 150 };
  const m = alignBalloons([{ key: 1, at: [20, 90] }, { key: 2, at: [25, 92] }, { key: 3, at: [180, 60] }, { key: 4, at: [100, 10] }], box, { gap: 12, step: 10 });
  assert.deepEqual(m.get(1), [38, 90]);
  assert.deepEqual(m.get(2), [38, 100], "Mindestabstand");
  assert.deepEqual(m.get(3), [162, 60]);
  assert.deepEqual(m.get(4), [100, 38]);
});

test("Bogenlänge", () => {
  assert.equal(arcLength(10, Math.PI / 2), 5 * Math.PI);
});

test("Durchmesser per Klick: Kreis-Stützpunkte sind keine Fangpunkte, Bogenenden schon", async () => {
  const { snapPoints, nearestArc } = await import("../src/core/bemassung.js");
  const { parseSvgPath } = await import("../src/core/svgpath.js");
  // Kreis r = 5 (wenige Stützpunkte mit großem Knick) und ein Langloch-Ende: Linie, Halbbogen, Linie
  const circ = parseSvgPath("M 25 0 A 5 5 0 1 1 15 0 A 5 5 0 1 1 25 0 Z", { flipY: false });
  const slot = parseSvgPath("M 0 20 L 40 20 A 5 5 0 0 1 40 30 L 0 30", { flipY: false });
  const lines = [...circ.polylines, ...slot.polylines], arcs = [...circ.arcs, ...slot.arcs];
  assert.ok(circ.polylines[0].length > 8, "Kreis ist abgetastet");
  const pts = snapPoints(lines, arcs);
  const onCircle = pts.filter((q) => Math.abs(Math.hypot(q[0] - 20, q[1]) - 5) < 1e-6);
  assert.equal(onCircle.length, 0, "kein Fangpunkt auf dem Kreisumfang");
  const key = (q) => q.map((x) => Math.round(x * 1000) / 1000).join(",");
  const set = new Set(pts.map(key));
  for (const q of [[0, 20], [40, 20], [40, 30], [0, 30]]) assert.ok(set.has(key(q)), "Fangpunkt " + q);
  // ohne Bögen (alter Stand) wären Kreis-Stützpunkte Ecken geworden
  assert.ok(snapPoints(circ.polylines, []).length > 4);
  const hit = nearestArc(arcs, [20 + 5.05, 0.1], 0.3);
  assert.ok(hit && hit.arc.full && Math.abs(hit.arc.r - 5) < 1e-9);
  assert.equal(nearestArc(arcs, [20, 0], 0.3), null, "Mitte ist nicht der Umfang");
  assert.equal(nearestArc(arcs, [35, 25], 0.3), null, "Teilbogen nur in seinem Winkelbereich");
  assert.ok(nearestArc(arcs, [45, 25], 0.3), "Langloch-Bogen getroffen");
});

test("Längenmaß über einen Zylinder bekommt Ø", async () => {
  const { acrossAxis } = await import("../src/core/bemassung.js");
  const axes = [[[0, 0], [100, 0]]], radii = [[30.15]];
  assert.equal(acrossAxis({ kind: "v", p1: [50, -30.15], p2: [50, 30.15] }, axes, radii), true, "Rohr Ø60,3 von der Seite");
  assert.equal(acrossAxis({ kind: "v", p1: [50, -30.15], p2: [50, 40] }, axes, radii), false, "nicht symmetrisch");
  assert.equal(acrossAxis({ kind: "v", p1: [50, -40], p2: [50, 40] }, axes, radii), false, "Platte um eine Bohrung: Breite ist kein Ø");
  assert.equal(acrossAxis({ kind: "h", p1: [0, 30.15], p2: [100, 30.15] }, axes, radii), false, "Länge längs der Achse");
  assert.equal(acrossAxis({ kind: "v", p1: [50, -30.15], p2: [50, 30.15] }, axes, undefined), false, "ohne Radien nichts raten");
});
