// Baugruppen-Abhängigkeiten (Konzentrisch P1-B G-2, große Baugruppe) – reine Rechnung ohne Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { axisRef, faceRef, refreshAxis, solveAssembly } from "../src/core/asmsolve.js";
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

// Plan 5.5: große Baugruppe – 150 Platten gestapelt, jede gegen die darunter
test("Große Baugruppe: 150 gestapelte Platten lösen schnell und exakt", () => {
  const N = 150;
  const faces = [{ type: "PLANE", normal: [0, 0, 1], point: [0, 0, 10] }, { type: "PLANE", normal: [0, 0, -1], point: [0, 0, 0] }];
  const asm = { components: [], constraints: [] };
  for (let i = 0; i < N; i++) asm.components.push({ id: "p" + i, part: "platte", pos: [i * 3, -i, 500 - i * 7], rot: [0, 0, 0], fixed: i === 0 });
  asm.components[0].pos = [0, 0, 0];
  for (let i = 1; i < N; i++) asm.constraints.push({ id: "g" + i, type: "gegen", gap: "0", a: faceRef("p" + (i - 1), faces[0]), b: faceRef("p" + i, faces[1]) });
  const t = performance.now();
  const r = solveAssembly(asm, () => faces);
  const ms = performance.now() - t;
  assert.deepEqual(r.errors, {});
  for (let i = 0; i < N; i++) near(asm.components[i].pos[2], i * 10, 1e-6);
  assert.ok(ms < 1000, `${ms} ms`);
});

test("Unterbaugruppen: Auflösen mit Gesamt-Platzierung, Zyklus-Schutz, Struktur- und Baukastenstückliste (MegaCAD-Abgleich M19)", async () => {
  const { flattenAssembly, canInsert, partCounts, structureBom, modularBom } = await import("../src/core/subasm.js");
  const { matApply } = await import("../src/core/geom.js");
  const docs = {
    rahmen: { id: "rahmen", kind: "part", name: "Rahmen" },
    rad: { id: "rad", kind: "part", name: "Rad" },
    achse: { id: "achse", kind: "assembly", name: "Achse", components: [
      { id: "a1", part: "rad", name: "Rad:1", pos: [0, -500, 0], rot: [0, 0, 0] },
      { id: "a2", part: "rad", name: "Rad:2", pos: [0, 500, 0], rot: [0, 0, 0] },
    ] },
    wagen: { id: "wagen", kind: "assembly", name: "Wagen", components: [
      { id: "w1", part: "rahmen", name: "Rahmen:1", pos: [0, 0, 0], rot: [0, 0, 0] },
      { id: "w2", part: "achse", name: "Achse vorne", pos: [1000, 0, 0], rot: [0, 0, 90] },
      { id: "w3", part: "achse", name: "Achse hinten", pos: [0, 0, 0], rot: [0, 0, 0] },
    ] },
  };
  const docOf = (id) => docs[id];
  const occ = flattenAssembly(docs.wagen, docOf);
  assert.equal(occ.length, 5);
  const front = occ.filter((o) => o.top.id === "w2");
  assert.equal(front.length, 2);
  // Rad:1 der vorderen Achse: (0, −500, 0) um Z 90° gedreht → (500, 0, 0), dann + (1000, 0, 0)
  const p = matApply(front[0].matrix, [0, 0, 0]);
  assert.ok(Math.abs(p[0] - 1500) < 1e-9 && Math.abs(p[1]) < 1e-9, "Gesamt-Platzierung " + p);
  assert.deepEqual(matApply(front[0].inner, [0, 0, 0]).map((x) => Math.round(x)), [0, -500, 0], "im System der Komponente");
  assert.deepEqual(front[0].path, ["Achse vorne", "Rad:1"]);
  assert.equal(partCounts(docs.wagen, docOf).get("rad"), 4);
  assert.equal(canInsert(docs.achse, docs.wagen, docOf), false, "Zyklus");
  assert.equal(canInsert(docs.wagen, docs.wagen, docOf), false, "sich selbst");
  assert.equal(canInsert(docs.wagen, docs.achse, docOf), true);
  const sb = structureBom(docs.wagen, docOf);
  assert.deepEqual(sb.map((r) => [r.level, r.doc.name, r.qty, r.total]), [["1", "Rahmen", 1, 1], ["2", "Achse", 2, 2], ["2.1", "Rad", 2, 4]]);
  const mb = modularBom(docs.wagen, docOf);
  assert.deepEqual(mb.map((x) => x.asm.name), ["Wagen", "Achse"]);
  assert.deepEqual(mb[1].rows.map((r) => [r.doc.name, r.qty]), [["Rad", 2]]);
});
