// Achsraster (Stahlbau-Lücken ST9): Abstände, Beschriftung, Schnittpunkte, Achsen in Zeichnungsansichten
import test from "node:test";
import assert from "node:assert/strict";
import { parseSpacing, axisLabels, gridGeometry, gridPoints, gridInView } from "../src/core/achsraster.js";

test("Abstände mit Wiederholung, Beschriftung mit Zahlen und Buchstaben (Z → AA)", () => {
  assert.deepEqual(parseSpacing("3*6000; 4500"), [6000, 6000, 6000, 4500]);
  assert.deepEqual(parseSpacing("2x5000 2500,5"), [5000, 5000, 2500.5]);
  assert.throws(() => parseSpacing("6000; -5"), /kein Abstand/);
  assert.deepEqual(axisLabels("1", 3), ["1", "2", "3"]);
  assert.deepEqual(axisLabels("Y", 4), ["Y", "Z", "AA", "AB"]);
  assert.deepEqual(axisLabels("b", 2), ["B", "C"]);
});

test("Raster 3 × 2: Achsen mit Überstand, Schnittpunkte A/1 … B/3 in der Rasterebene", () => {
  const g = gridGeometry({ x: "6000; 6000", y: "5000", x0: "100", y0: "0", z: "-200", over: "1000" });
  assert.deepEqual(g.axes.map((a) => a.label), ["1", "2", "3", "A", "B"]);
  const a3 = g.axes.find((a) => a.label === "3");
  assert.deepEqual([a3.a, a3.b], [[12100, -1000, -200], [12100, 6000, -200]]);
  assert.equal(g.points.length, 6);
  assert.deepEqual(g.points.find((q) => q.label === "B/2").p, [6100, 5000, -200]);
  assert.deepEqual(gridPoints({ grids: [{ name: "R", x: "6000", y: "5000" }, { hidden: true, x: "1", y: "1" }] }).map((q) => q.label), ["R: A/1", "R: A/2", "R: B/1", "R: B/2"]);
});

test("Zeichnungsansicht: Grundriss zeigt alle Achsen, Vorderansicht nur die Achsen quer zur Blickrichtung, Isometrie keine", () => {
  const g = { x: "6000; 6000", y: "5000", h: "4000" };
  const top = gridInView(g, ([x, y]) => [x, y]);
  assert.equal(top.length, 5);
  const front = gridInView(g, ([x, , z]) => [x, z]); // Blick entlang Y
  assert.deepEqual(front.map((a) => a.label), ["1", "2", "3"]);
  assert.deepEqual(front[0].b, [0, 4000], "Achskreis oben");
  const iso = gridInView(g, ([x, y, z]) => [x - y, (x + y) / 2 + z]);
  assert.equal(iso.length, 0);
});
