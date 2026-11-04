// SolidCraft-Abgleich: Ausdrücke (F8), OBJ/3MF (F6), Schnellmessung (F3), Hüllkörper und Lochraster (F7/F1) ohne Kern
import test from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../src/core/expr.js";
import { writeObj, write3mf, weldMesh } from "../src/core/meshexport.js";
import { quickMeasure, measureFormat } from "../src/core/messen.js";
import { huellQuader, huellText } from "../src/core/huelle.js";
import { lochRaster, lochName, lochMasse } from "../src/core/lochblech.js";

const near = (a, b, tol = 1e-9, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b}`);

test("Ausdrücke: sinh/cosh/tanh, exp/ln/log, fest, mod; alte Parameternamen gehen weiter", () => {
  near(evaluate("cosh(0) + sinh(0) + tanh(0)"), 1);
  near(evaluate("a*cosh(x/a)", { a: 100, x: 0 }), 100, 1e-9, "Kettenlinie Scheitel");
  near(evaluate("ln(exp(2)) + log(1000)"), 5);
  near(evaluate("fest(3,14159; 2)"), 3.14);
  near(evaluate("mod(-1; 3)"), 2);
  near(evaluate("mod * 2", { mod: 4 }), 8, 1e-9, "Parameter »mod« ohne Klammer");
});

// Würfel 10 mm aus 12 Dreiecken mit doppelten Punkten (wie three.js je Fläche)
const cube = () => {
  const P = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0], [0, 0, 10], [10, 0, 10], [10, 10, 10], [0, 10, 10]];
  const F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return { name: "Würfel 1", pos: F.flat().flatMap((i) => P[i]), idx: null, color: [1, 0, 0] };
};

test("OBJ: Punkte zusammengefasst, Flächen 1-basiert, Farbe je Punkt", () => {
  const w = weldMesh(cube());
  assert.equal(w.pos.length / 3, 8);
  assert.equal(w.idx.length / 3, 12);
  const obj = writeObj([cube(), { ...cube(), name: "B", pos: cube().pos.map((v, i) => (i % 3 === 0 ? v + 20 : v)), color: [0, 0, 1] }]);
  assert.equal((obj.match(/^v /gm) || []).length, 16);
  assert.equal((obj.match(/^f /gm) || []).length, 24);
  assert.match(obj, /^o Würfel_1$/m);
  assert.match(obj, /^v 0 0 0 1 0 0$/m);
  assert.match(obj, /^f 9 /m, "zweiter Körper zählt ab 9");
  assert.throws(() => writeObj([]), /Nichts/);
});

test("3MF: ZIP mit Modell in mm, Basismaterial-Farben, je Körper ein Objekt", () => {
  const z = write3mf([cube(), { ...cube(), name: "B & C" }], { title: "Test" });
  assert.equal(z[0], 0x50); assert.equal(z[1], 0x4b);
  const text = new TextDecoder().decode(z);
  assert.match(text, /\[Content_Types\]\.xml/);
  assert.match(text, /3D\/3dmodel\.model/);
  assert.match(text, /unit="millimeter"/);
  assert.equal((text.match(/<object /g) || []).length, 2);
  assert.equal((text.match(/<triangle /g) || []).length, 24);
  assert.match(text, /displaycolor="#FF0000"/);
  assert.match(text, /name="B &amp; C"/);
});

test("Schnellmessung: Kante, Kreis, Fläche, Abstand mit Winkel, Summe", () => {
  const F = measureFormat({ dec: 2 });
  assert.deepEqual(quickMeasure({ items: [{ kind: "edge", type: "LINE", length: 120 }] }, F), [{ label: "Länge", value: "120,00 mm" }]);
  assert.deepEqual(quickMeasure({ items: [{ kind: "edge", type: "CIRCLE", length: 2 * Math.PI * 5, radius: 5 }] }, F).map((x) => x.label), ["Ø", "R"]);
  assert.equal(quickMeasure({ items: [{ kind: "edge", type: "CIRCLE", length: 7.85, radius: 5, arc: 90 }] }, F)[0].label, "Bogen");
  assert.equal(quickMeasure({ items: [{ kind: "face", type: "PLANE", area: 1500 }] }, F)[0].value, "1.500,00 mm²");
  const two = quickMeasure({ items: [{ kind: "face" }, { kind: "face" }], distance: 20, angle: 0 }, F);
  assert.deepEqual(two.map((x) => x.label), ["Abstand", "Winkel"]);
  assert.equal(quickMeasure({ items: [{ kind: "edge", length: 10 }, { kind: "edge", length: 20 }, { kind: "edge", length: 5 }] }, F)[0].value, "35,00 mm");
  assert.equal(quickMeasure({ items: [{ kind: "face", area: 1 }, { kind: "face", area: 2 }, { kind: "face", area: 3 }] }, F)[0].label, "Σ 3 Flächen");
  assert.deepEqual(quickMeasure({ items: [] }, F), []);
});

test("Hüllquader und Lochraster ohne Kern", () => {
  const q = huellQuader([[[0, 0, 0], [10, 20, 5]], [[-5, 0, 0], [0, 4, 30]]], 1);
  assert.deepEqual(q.size, [17, 22, 32]);
  assert.equal(huellText([17, 22.04, 3.25]), "22 × 17 × 3,3 mm");
  assert.throws(() => huellQuader([]), /Keine Körper/);
  // Rg 10-20 auf 100 × 100 ohne Rand: 5 × 5 Löcher, freier Querschnitt π·25/400 = 19,6 %
  const r = lochRaster({ outer: [[0, 0], [100, 0], [100, 100], [0, 100]], muster: "Rg", d: 10, teilung: 20, rand: 0 });
  assert.equal(r.centers.length, 25);
  near(r.frei, (100 * 25 * Math.PI * 25) / 10000, 1e-9);
  // Ausschnitt in der Mitte: dort keine Löcher
  const mit = lochRaster({ outer: [[0, 0], [100, 0], [100, 100], [0, 100]], inner: [[[40, 40], [60, 40], [60, 60], [40, 60]]], muster: "Rg", d: 10, teilung: 20, rand: 0 });
  assert.equal(mit.centers.length, 24);
  assert.equal(lochName({ muster: "Lv", d: 5, laenge: 20, teilung: 8 }), "Lv 5x20-8");
  assert.throws(() => lochMasse({ muster: "Rv", d: 8, teilung: 8 }), /Teilung/);
  assert.throws(() => lochMasse({ muster: "Lv", d: 8, teilung: 12, laenge: 6 }), /Länge/);
});
