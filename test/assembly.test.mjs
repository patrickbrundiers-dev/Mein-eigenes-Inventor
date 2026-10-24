// Baugruppen-Abhängigkeit »Konzentrisch« (P1-B G-2) – reine Rechnung ohne Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { axisRef, refreshAxis, solveAssembly } from "../src/core/asmsolve.js";
import { placementMatrix, matApply, matApplyDir, pointLineDistance, alignAxes, decomposePlacement, v3 } from "../src/core/geom.js";

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
// Platte mit Bohrung Ø10, Achse Z bei (30|20); Bolzen Ø10, Achse X durch (0|0|0) (liegt quer)
const plateFaces = [{ type: "PLANE", normal: [0, 0, 1], point: [0, 0, 10] }, { type: "CYLINDER", axisP: [30, 20, 5], axisD: [0, 0, 1], radius: 5 }];
const pinFaces = [{ type: "CYLINDER", axisP: [0, 0, 0], axisD: [1, 0, 0], radius: 5 }, { type: "PLANE", normal: [1, 0, 0], point: [40, 0, 0] }, { type: "PLANE", normal: [-1, 0, 0], point: [0, 0, 0] }];
const facesOf = (pid) => (pid === "platte" ? plateFaces : pinFaces);

test("alignAxes: Achse von B liegt danach auf Achse A, kleinste Drehung", () => {
  const m = alignAxes(placementMatrix([5, 5, 5], [0, 0, 0]), [5, 5, 5], [1, 0, 0], [30, 20, 0], [0, 0, 1]);
  const p = matApply(m, [0, 0, 0]), d = matApplyDir(m, [1, 0, 0]);
  near(Math.abs(v3.dot(d, [0, 0, 1])), 1);
  near(pointLineDistance(p, [30, 20, 0], [0, 0, 1]), 0);
  near(p[2], 5); // entlang der Achse nicht verschoben
  // gegensinnige Achse: keine 180°-Drehung nötig
  const m2 = alignAxes(placementMatrix(), [0, 0, 0], [0, 0, -1], [3, 4, 0], [0, 0, 1]);
  assert.deepEqual(decomposePlacement(m2).rot, [0, 0, 0]);
});

test("Konzentrisch: Bolzen in Bohrung, fixierte Platte, Abschluss erfüllt", () => {
  const asm = { components: [{ id: "p", part: "platte", pos: [100, 0, 0], rot: [0, 0, 0], fixed: true }, { id: "b", part: "bolzen", pos: [0, 50, 0], rot: [0, 0, 0] }], constraints: [] };
  asm.constraints.push({ id: "k", type: "konzentrisch", gap: "0", a: axisRef("p", plateFaces[1]), b: axisRef("b", pinFaces[0]) });
  const r = solveAssembly(asm, facesOf);
  assert.deepEqual(r.errors, {});
  assert.equal(r.changed, true);
  const B = asm.components[1], MB = placementMatrix(B.pos, B.rot);
  near(pointLineDistance(matApply(MB, [17, 0, 0]), [130, 20, 0], [0, 0, 1]), 0, 1e-6); // beliebiger Achspunkt des Bolzens liegt auf der Bohrungsachse
  near(Math.abs(matApplyDir(MB, [1, 0, 0])[2]), 1);
  assert.deepEqual(asm.components[0].pos, [100, 0, 0]); // fixiert bleibt
});

test("Konzentrisch: Achse folgt Bauteiländerung, fehlende Achse wird gemeldet", () => {
  const ref = axisRef("p", plateFaces[1]);
  assert.deepEqual(ref.p, [30, 20, 0]); // Fußpunkt, unabhängig von der Flächenhöhe
  // Bohrung wandert nach (35|20), zusätzlich gibt es eine zweite, weiter entfernte Bohrung
  const moved = [{ type: "CYLINDER", axisP: [80, 20, 0], axisD: [0, 0, -1], radius: 5 }, { type: "CYLINDER", axisP: [35, 20, 3], axisD: [0, 0, 1], radius: 5 }];
  const r = refreshAxis(ref, moved);
  assert.deepEqual(r.p, [35, 20, 0]);
  assert.deepEqual(r.d, [0, 0, 1]);
  const asm = { components: [{ id: "p", part: "platte", pos: [0, 0, 0], rot: [0, 0, 0] }, { id: "b", part: "bolzen", pos: [0, 0, 0], rot: [0, 0, 0] }], constraints: [{ id: "k", type: "konzentrisch", a: ref, b: axisRef("b", pinFaces[0]) }] };
  const res = solveAssembly(asm, (pid) => (pid === "platte" ? [plateFaces[0]] : pinFaces));
  assert.equal(res.errors.k, "Achse nicht mehr gefunden");
});

test("Konzentrisch und Fläche an Fläche zusammen: Bolzen steckt in der Bohrung und liegt auf", () => {
  const asm = { components: [{ id: "p", part: "platte", pos: [0, 0, 0], rot: [0, 0, 0], fixed: true }, { id: "b", part: "bolzen", pos: [0, 50, 70], rot: [0, 0, 0] }], constraints: [] };
  asm.constraints.push({ id: "k", type: "konzentrisch", a: axisRef("p", plateFaces[1]), b: axisRef("b", pinFaces[0]) });
  const r1 = solveAssembly(asm, facesOf);
  assert.deepEqual(r1.errors, {});
  // Bolzen-Achse zeigt nach der kleinsten Drehung nach +Z → Stirnfläche x = 0 (Normale −X) zeigt nach unten
  const B = asm.components[1];
  near(matApplyDir(placementMatrix(B.pos, B.rot), [-1, 0, 0])[2], -1);
  asm.constraints.push({ id: "f", type: "gegen", gap: "0", a: { comp: "p", n: [0, 0, 1], d: 10 }, b: { comp: "b", n: [-1, 0, 0], d: 0 } });
  const r2 = solveAssembly(asm, facesOf);
  assert.deepEqual(r2.errors, {});
  const M = placementMatrix(B.pos, B.rot);
  near(matApply(M, [0, 0, 0])[2], 10); // Stirnfläche liegt auf der Platte
  near(pointLineDistance(matApply(M, [25, 0, 0]), [30, 20, 0], [0, 0, 1]), 0); // und steckt weiter in der Achse
});
