// Direktbearbeitung: Rechnung ohne Geometrie-Kern (src/core/direkt.js)
import test from "node:test";
import assert from "node:assert/strict";
import { faceAxes, moveDir, normalOffset, measureFromShift, measureFromValue, rotateVec, cornerDir, cornerAt, validateDirekt, validateAngle, newDirekt } from "../src/core/direkt.js";

const near = (a, b, t = 1e-9) => assert.ok(Math.abs(a - b) <= t, `${a} ≠ ${b}`);
const nearV = (a, b) => a.forEach((x, i) => near(x, b[i]));

test("Achsen U/V liegen in der Fläche und stehen senkrecht", () => {
  for (const n of [[0, 0, 1], [1, 0, 0], [0.6, 0, 0.8]]) {
    const { u, v } = faceAxes(n);
    near(u[0] * n[0] + u[1] * n[1] + u[2] * n[2], 0);
    near(v[0] * n[0] + v[1] * n[1] + v[2] * n[2], 0);
    near(u[0] * v[0] + u[1] * v[1] + u[2] * v[2], 0);
  }
});

test("Verschieben: Weltrichtung wird auf die Normale umgerechnet, in der Fläche geht nicht", () => {
  near(normalOffset([0, 0, 1], moveDir("normal", [0, 0, 1]), 5), 5);
  near(normalOffset([1, 0, 0], moveDir("X", [1, 0, 0]), -3), -3);
  near(normalOffset(Math.SQRT1_2 > 0 ? [Math.SQRT1_2, 0, Math.SQRT1_2] : [0, 0, 1], [0, 0, 1], 10), 10 * Math.SQRT1_2);
  assert.throws(() => normalOffset([0, 0, 1], [1, 0, 0], 5), /liegt in der Fläche/);
});

test("Messen ab: Weg bis zum Zielabstand, Vorzeichen bleibt", () => {
  // Fläche bei z = 10, Bezug Ebene z = 0 (Normale −Z): auf 25 bringen → +15
  near(measureFromShift([0, 0, 10], [0, 0, 1], { p: [0, 0, 0], n: [0, 0, -1] }, 25), 15);
  near(measureFromValue([0, 0, 10], [0, 0, 1], { p: [0, 0, 0], n: [0, 0, -1] }), 10);
  // Bezug Punkt: Abstand längs der Richtung
  near(measureFromShift([100, 5, 5], [1, 0, 0], { p: [40, 0, 0] }, 50), -10);
  assert.throws(() => measureFromShift([0, 0, 10], [1, 0, 0], { p: [0, 0, 0], n: [0, 0, 1] }, 5), /ändert den Abstand/);
});

test("Drehen und Eckrichtungen", () => {
  nearV(rotateVec([1, 0, 0], [0, 0, 1], Math.PI / 2), [0, 1, 0]);
  // senkrechte Nachbarn: Ecke wandert längs n
  nearV(cornerDir([0, 0, 1], [1, 0, 0], [0, 1, 0]), [0, 0, 1]);
  // 45°-Fase als Nachbar: Ecke wandert schräg zurück, auf Höhe 5 um 5 nach innen
  const d = cornerDir([0, 0, 1], [0, Math.SQRT1_2, Math.SQRT1_2], [1, 0, 0]);
  nearV(cornerAt([0, 0, 0], d, [0, 0, 1], 5), [0, -5, 5]);
  assert.throws(() => validateAngle(0), /Drehwinkel/);
  assert.throws(() => validateAngle(85), /Drehwinkel/);
});

test("Feature prüfen", () => {
  assert.throws(() => validateDirekt(newDirekt("verschieben", [])), /Fläche wählen/);
  assert.throws(() => validateDirekt({ ...newDirekt("drehen", [{ p: [0, 0, 0] }]), achse: "kante" }), /Drehkante/);
  assert.equal(validateDirekt(newDirekt("loeschen", [{ p: [0, 0, 0] }])), "loeschen");
  assert.throws(() => validateDirekt({ ...newDirekt("x", [{ p: [0, 0, 0] }]) }), /Unbekannte/);
});
