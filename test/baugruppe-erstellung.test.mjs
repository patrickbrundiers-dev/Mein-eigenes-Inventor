// Baugruppenerstellung (BG1–BG14): Freiheitsgrade, Ziehen, Platzieren – reine Rechnung
import test from "node:test";
import assert from "node:assert/strict";
import { componentDof, dofLabel, projectFree } from "../src/core/asmdof.js";
import { axisRef, faceRef, insertRef } from "../src/core/asmsolve.js";

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const comps = () => [{ id: "p", part: "platte", pos: [0, 0, 0], rot: [0, 0, 0], fixed: true }, { id: "b", part: "bolzen", pos: [10, 20, 30], rot: [0, 0, 0] }];
const top = faceRef("p", { normal: [0, 0, 1], point: [0, 0, 10] });
const bot = (id = "b") => faceRef(id, { normal: [0, 0, -1], point: [0, 0, 0] });

test("Freiheitsgrade: ohne Abhängigkeit 6, fixiert 0", () => {
  const asm = { components: comps(), constraints: [] };
  const d = componentDof(asm, "b");
  assert.equal(d.dof, 6); assert.equal(d.trans, 3); assert.equal(d.rot, 3);
  assert.equal(dofLabel(d), "3 V · 3 D frei");
  assert.equal(componentDof(asm, "p").state, "fixiert");
});

test("Freiheitsgrade: Fläche an Fläche lässt 2 Verschiebungen in der Ebene und 1 Drehung um die Normale", () => {
  const asm = { components: comps(), constraints: [{ id: "f", type: "gegen", a: top, b: bot() }] };
  const d = componentDof(asm, "b");
  assert.equal(d.dof, 3); assert.equal(d.trans, 2); assert.equal(d.rot, 1);
  for (const t of d.tDirs) near(t[2], 0);
  near(Math.abs(d.rAxes[0][2]), 1);
  // Ziehen: Anteil senkrecht zur Fläche fällt weg
  const m = projectFree([5, -3, 7], d.tDirs);
  near(m[0], 5); near(m[1], -3); near(m[2], 0);
});

test("Freiheitsgrade: Konzentrisch 2 (Schieben und Drehen um die Achse), Einfügen 1", () => {
  const hole = { axisP: [30, 20, 5], axisD: [0, 0, 1], radius: 5 }, pin = { axisP: [0, 0, 0], axisD: [0, 0, 1], radius: 5 };
  const asm = { components: comps(), constraints: [{ id: "k", type: "konzentrisch", a: axisRef("p", hole), b: axisRef("b", pin) }] };
  let d = componentDof(asm, "b");
  assert.equal(d.dof, 2); assert.equal(d.trans, 1); assert.equal(d.rot, 1);
  near(Math.abs(d.tDirs[0][2]), 1);
  asm.constraints = [{ id: "e", type: "einfuegen", a: insertRef("p", hole, { normal: [0, 0, 1], point: [0, 0, 10] }), b: insertRef("b", pin, { normal: [0, 0, -1], point: [0, 0, 0] }) }];
  d = componentDof(asm, "b");
  assert.equal(d.dof, 1); assert.equal(d.trans, 0); assert.equal(d.rot, 1);
  assert.equal(dofLabel(d), "1 D frei");
});

test("Freiheitsgrade: drei Flächen (Ecke) bestimmt, starr bestimmt, unterdrückt zählt nicht", () => {
  const asm = { components: comps(), constraints: [
    { id: "1", type: "gegen", a: top, b: bot() },
    { id: "2", type: "buendig", a: faceRef("p", { normal: [1, 0, 0], point: [50, 0, 0] }), b: faceRef("b", { normal: [1, 0, 0], point: [5, 0, 0] }) },
    { id: "3", type: "buendig", a: faceRef("p", { normal: [0, 1, 0], point: [0, 40, 0] }), b: faceRef("b", { normal: [0, 1, 0], point: [0, 5, 0] }) },
  ] };
  assert.equal(componentDof(asm, "b").state, "bestimmt");
  asm.constraints[2].suppressed = true;
  assert.equal(componentDof(asm, "b").dof, 1);
  asm.constraints = [{ id: "s", type: "starr", a: { comp: "p", frame: true }, b: { comp: "b", frame: true }, rel: [] }];
  assert.equal(componentDof(asm, "b").dof, 0);
});

test("Freiheitsgrade: Gelenke und Musterkopien", () => {
  const asm = { components: [{ id: "t", pos: [0, 0, 0], rot: [0, 0, 0], joint: { p: [0, 0, 0], d: [0, 0, 2], angle: 0 } }, { id: "s", pos: [0, 0, 0], rot: [0, 0, 0], joint: { kind: "schiebe", p: [0, 0, 0], d: [1, 0, 0] } }, { id: "m", pat: "pm", pos: [0, 0, 0], rot: [0, 0, 0] }], constraints: [] };
  const t = componentDof(asm, "t"), s = componentDof(asm, "s");
  assert.equal(t.state, "gelenk"); assert.equal(t.rot, 1); assert.deepEqual(t.rAxes[0], [0, 0, 1]);
  assert.equal(s.trans, 1); assert.deepEqual(s.tDirs[0], [1, 0, 0]);
  assert.equal(dofLabel(componentDof(asm, "m")), "");
});

test("Freiheitsgrade: Drehachse liegt bei Einfügen auf der Bohrungsachse", () => {
  const hole = { axisP: [30, 20, 5], axisD: [0, 0, 1], radius: 5 }, pin = { axisP: [0, 0, 0], axisD: [0, 0, 1], radius: 5 };
  const asm = { components: [{ id: "p", pos: [0, 0, 0], rot: [0, 0, 0], fixed: true }, { id: "b", pos: [30, 20, 10], rot: [0, 0, 0] }],
    constraints: [{ id: "e", type: "einfuegen", a: insertRef("p", hole, { normal: [0, 0, 1], point: [0, 0, 10] }), b: insertRef("b", pin, { normal: [0, 0, -1], point: [0, 0, 0] }) }] };
  const d = componentDof(asm, "b");
  near(d.rPoint[0], 30, 1e-6); near(d.rPoint[1], 20, 1e-6);
});

import { quickMate, placeAt, applyDelta, deltaBetween } from "../src/core/baugruppe.js";
import { rotationAbout } from "../src/core/geom.js";

test("Schnellfügen: Art aus Fläche/Achse, Leertaste wechselt die Lösung", () => {
  assert.equal(quickMate("plane", "plane").solution, "passend");
  assert.equal(quickMate("plane", "plane", true).solution, "fluchtend");
  assert.equal(quickMate("axis", "axis", false, { insert: true }).type, "einfuegen");
  assert.equal(quickMate("axis", "axis", true, { insert: true }).solution, "ausgerichtet");
  assert.equal(quickMate("axis", "axis").axisSol, "ausgerichtet");
  assert.equal(quickMate("axis", "plane").type, "tangential");
  assert.equal(quickMate("point", "plane"), null);
});

test("Platzieren und Ziehen: Lage aus Punkt und Bewegung", () => {
  assert.deepEqual(placeAt([100, 50, 0], [10, 5, 2]), { pos: [90, 45, -2], rot: [0, 0, 0] });
  const c = { pos: [10, 0, 0], rot: [0, 0, 0] };
  const r = applyDelta(c, rotationAbout([0, 0, 0], [0, 0, 1], 90));
  near(r.pos[0], 0, 1e-6); near(r.pos[1], 10, 1e-6); near(r.rot[2], 90, 1e-6);
  const D = deltaBetween(c, r), back = applyDelta(c, D);
  near(back.pos[1], 10, 1e-6);
});
