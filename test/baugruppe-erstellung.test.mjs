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

import { moveIntoSub, dissolveSub, transformRef } from "../src/core/baugruppe.js";
import { solveAssembly } from "../src/core/asmsolve.js";
import { placementMatrix, matApply, matMul } from "../src/core/geom.js";

const plateF = [{ type: "PLANE", normal: [0, 0, 1], point: [0, 0, 10] }, { type: "PLANE", normal: [0, 0, -1], point: [0, 0, 0] }];
const world = (asm, id, p) => { const c = asm.components.find((x) => x.id === id); return matApply(placementMatrix(c.pos, c.rot), p); };

test("Unterbaugruppe bilden: Lage bleibt, innere Abhängigkeit wandert mit, äußere hängt an der Unterbaugruppe", () => {
  const top = faceRef("p1", plateF[0]), bot2 = faceRef("p2", plateF[1]), bot3 = faceRef("p3", plateF[1]), top2 = faceRef("p2", plateF[0]);
  const asm = { id: "A", kind: "assembly", components: [
    { id: "p1", part: "pl", pos: [0, 0, 0], rot: [0, 0, 0], fixed: true },
    { id: "p2", part: "pl", pos: [50, 0, 10], rot: [0, 0, 30] },
    { id: "p3", part: "pl", pos: [80, 20, 20], rot: [0, 0, 0] },
  ], constraints: [{ id: "k1", type: "gegen", gap: "0", a: top, b: bot2 }, { id: "k2", type: "gegen", gap: "0", a: top2, b: bot3 }] };
  const sub = { id: "S", kind: "assembly", components: [] };
  const sc = { id: "s", part: "S", pos: [10, 0, 0], rot: [0, 0, 90] };
  asm.components.push(sc);
  const before = [world(asm, "p2", [1, 2, 3]), world(asm, "p3", [4, 5, 6])];
  const r = moveIntoSub(asm, ["p2", "p3"], sub, sc);
  assert.equal(r.error, null);
  assert.equal(r.moved, 2); assert.equal(r.constraints, 1); assert.equal(r.relinked, 1);
  assert.deepEqual(asm.components.map((c) => c.id), ["p1", "s"]);
  // Weltlage der Teile unverändert
  const Ms = placementMatrix(sc.pos, sc.rot);
  const w2 = matApply(matMul(Ms, placementMatrix(sub.components[0].pos, sub.components[0].rot)), [1, 2, 3]);
  for (let i = 0; i < 3; i++) near(w2[i], before[0][i], 1e-6);
  // äußere Abhängigkeit: Bezug jetzt an der Unterbaugruppe, Ebene z = 10 im System der Unterbaugruppe (Weltlage gleich)
  const k1 = asm.constraints[0];
  assert.equal(k1.b.comp, "s");
  // Lösen ändert nichts (alles war erfüllt)
  const facesOf = (pid) => (pid === "pl" ? plateF : sub.components.flatMap((c) => plateF.map((f) => ({ ...f, normal: matApply(placementMatrix([0, 0, 0], c.rot), f.normal), point: matApply(placementMatrix(c.pos, c.rot), f.point) }))));
  const res = solveAssembly(asm, facesOf);
  assert.deepEqual(res.errors, {});
  near(sc.pos[2], 0, 1e-6);
});

test("Unterbaugruppe bilden: Grenzen und Auflösen", () => {
  const asm = { components: [{ id: "a", pos: [0, 0, 0], rot: [0, 0, 0] }, { id: "b", pos: [0, 0, 0], rot: [0, 0, 0] }, { id: "s", part: "S", pos: [0, 0, 0], rot: [0, 0, 0] }], motions: [{ id: "m", a: "a", b: "b" }], constraints: [] };
  assert.match(moveIntoSub(asm, ["a"], { components: [] }, asm.components[2]).error, /Bewegung/);
  // Auflösen: Teile kommen an die Weltlage, IDs neu, innere Abhängigkeit mit neuen IDs
  const sub = { kind: "assembly", components: [{ id: "x", part: "pl", pos: [10, 0, 0], rot: [0, 0, 0] }, { id: "y", part: "pl", pos: [0, 0, 10], rot: [0, 0, 0] }],
    constraints: [{ id: "k", type: "gegen", a: { comp: "x", n: [0, 0, 1], d: 10 }, b: { comp: "y", n: [0, 0, -1], d: 0 } }] };
  const top = { components: [{ id: "s", part: "S", pos: [100, 0, 0], rot: [0, 0, 90] }, { id: "o", part: "pl", pos: [0, 0, 0], rot: [0, 0, 0] }],
    constraints: [{ id: "ext", type: "gegen", a: { comp: "o", n: [0, 0, 1], d: 10 }, b: { comp: "s", n: [0, 0, -1], d: 0 } }] };
  let n = 0;
  const r = dissolveSub(top, "s", sub, () => "n" + ++n);
  assert.equal(r.error, null); assert.equal(r.added, 2); assert.equal(r.dropped, 1);
  assert.deepEqual(top.components.map((c) => c.id), ["n1", "n2", "o"]);
  near(top.components[0].pos[0], 100, 1e-9); near(top.components[0].pos[1], 10, 1e-9);
  assert.deepEqual([top.constraints[0].a.comp, top.constraints[0].b.comp], ["n1", "n2"]);
  // Koordinatensystem-Bezug lässt sich nicht übertragen
  assert.equal(transformRef({ comp: "a", frame: true }, placementMatrix(), "s"), null);
});

import { holeAxes, holeFromConstraints, applyPatterns } from "../src/core/asmmuster.js";

test("Muster am Lochbild: Kopien in alle gleich großen Bohrungen, folgt der Platte", () => {
  // Platte mit vier Bohrungen Ø10 (eine als zwei Halbzylinder) und einer Ø20
  const faces = [
    { type: "CYLINDER", axisP: [20, 20, 3], axisD: [0, 0, 1], radius: 5 }, { type: "CYLINDER", axisP: [20, 20, 7], axisD: [0, 0, -1], radius: 5 },
    { type: "CYLINDER", axisP: [180, 20, 0], axisD: [0, 0, 1], radius: 5 }, { type: "CYLINDER", axisP: [20, 120, 0], axisD: [0, 0, 1], radius: 5 },
    { type: "CYLINDER", axisP: [180, 120, 0], axisD: [0, 0, 1], radius: 5 }, { type: "CYLINDER", axisP: [100, 70, 0], axisD: [0, 0, 1], radius: 10 },
  ];
  const hole = axisRef("pl", faces[2]);
  const ax = holeAxes(hole, faces);
  assert.equal(ax.length, 4);
  assert.deepEqual(ax[0], [180, 20, 0]); // Bezugsbohrung zuerst
  const asm = { components: [{ id: "pl", part: "platte", pos: [1000, 0, 0], rot: [0, 0, 90], fixed: true }, { id: "s", part: "schraube", pos: [980, 180, 10], rot: [0, 0, 0] }],
    constraints: [{ id: "k", type: "einfuegen", a: { ...hole, plane: { n: [0, 0, 1], d: 10 } }, b: { comp: "s", axis: true, p: [0, 0, 0], d: [0, 0, 1], r: 5, plane: { n: [0, 0, -1], d: 0 } } }] };
  const h0 = holeFromConstraints(asm, "s");
  assert.equal(h0.comp, "pl");
  asm.patterns = [{ id: "pm", kind: "lochbild", comps: ["s"], hole: h0 }];
  const r = applyPatterns(asm, Number, (pid) => (pid === "platte" ? faces : []));
  assert.deepEqual(r.errors, {});
  const copies = asm.components.filter((c) => c.pat === "pm");
  assert.equal(copies.length, 3);
  // Platte um 90° gedreht: Bohrung (20|20) liegt in der Welt bei (980|20); Kopie um denselben Versatz wie die Bohrungen
  const want = new Set(["980,20", "880,180", "880,20"]);
  for (const c of copies) assert.ok(want.has(c.pos.slice(0, 2).map((x) => Math.round(x)).join(",")), c.pos.join());
  for (const c of copies) near(c.pos[2], 10, 1e-9);
  // ohne weitere Bohrungen: Fehlermeldung
  assert.match(applyPatterns(asm, Number, () => [faces[2]]).errors.pm, /keine weiteren/);
});

import { mirrorReusePlacement, planeFromFace } from "../src/core/baugruppe.js";

test("Spiegeln: Wiederverwenden legt das symmetrische Teil an die Spiegelstelle", () => {
  // Quader 0…100 in X (Mitte 50), steht bei x = 200; Spiegelebene x = 0 → belegt danach −300 … −200
  const r = mirrorReusePlacement([200, 0, 0], [0, 0, 0], [1, 0, 0], 0, [50, 0, 0]);
  assert.deepEqual(r.pos, [-300, 0, 0]);
  // gedreht um Z 90°: lokale X zeigt nach Welt-Y, Ebene y = 10
  const q = mirrorReusePlacement([0, 50, 0], [0, 0, 90], [0, 1, 0], 10, [50, 0, 0]);
  near(q.pos[1], -130, 1e-9); // Teil belegte y 50…150, gespiegelt an 10 → −130 … −30
  assert.deepEqual(planeFromFace([0, 0, 25], [0, 0, 2]), { n: [0, 0, 1], c: 25 });
});

import { inferFuegepunkte, addFuegepunkte, autoMate } from "../src/core/baugruppe.js";

test("Fügepunkte: aus Abhängigkeit ableiten, beim Platzieren automatisch fügen (nächste Bohrung)", () => {
  const docs = { pl: { id: "pl", kind: "part", name: "Platte" }, sr: { id: "sr", kind: "part", name: "Schraube" } };
  const docOf = (id) => docs[id];
  const hole = { comp: "p", axis: true, p: [20, 20, 0], d: [0, 0, 1], r: 5, plane: { n: [0, 0, 1], d: 10 } };
  const pin = { comp: "s", axis: true, p: [0, 0, 0], d: [0, 0, 1], r: 5, plane: { n: [0, 0, -1], d: 0 } };
  const asm = { components: [{ id: "p", part: "pl", pos: [0, 0, 0], rot: [0, 0, 0], fixed: true }, { id: "s", part: "sr", pos: [20, 20, 10], rot: [0, 0, 0] }],
    constraints: [{ id: "k", type: "einfuegen", name: "Einfügen: Schraube:1 → Platte:1", a: hole, b: pin, solution: "entgegengesetzt", gap: "0" }] };
  let n = 0;
  const fps = inferFuegepunkte(asm, "s", docOf, () => "f" + ++n);
  assert.equal(fps.length, 2);
  assert.equal(fps[0].fp.name, fps[1].fp.name);
  for (const { partId, fp } of fps) assert.equal(addFuegepunkte(docs[partId], [fp]), 1);
  assert.equal(addFuegepunkte(docs.pl, [fps[0].fp]), 0); // nicht doppelt
  // zweite Platte weit weg, neue Schraube nahe bei Platte 2 platziert → fügt an Platte 2
  asm.components.push({ id: "p2", part: "pl", pos: [500, 0, 0], rot: [0, 0, 0] }, { id: "s2", part: "sr", pos: [480, 0, 50], rot: [0, 0, 0] });
  const cons = autoMate(asm, "s2", docOf, [510, 10, 0], () => "k2");
  assert.equal(cons.length, 1);
  assert.equal(cons[0].type, "einfuegen");
  assert.equal(cons[0].a.comp, "p2"); assert.equal(cons[0].b.comp, "s2");
  assert.equal(cons[0].solution, "entgegengesetzt");
  // belegt: dieselbe Hälfte an p2 nicht zweimal
  asm.constraints.push(cons[0]);
  asm.components.push({ id: "s3", part: "sr", pos: [0, 0, 0], rot: [0, 0, 0] });
  const again = autoMate(asm, "s3", docOf, [510, 10, 0]);
  assert.equal(again[0]?.a.comp, "p"); // p hat seine Hälfte noch frei (k ohne fp-Kennung)
});
