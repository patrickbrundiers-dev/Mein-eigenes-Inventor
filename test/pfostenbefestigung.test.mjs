// Pfostenbefestigung (docs/roadmap/pfostenbefestigung.md): Anschlussflächen, Montagerahmen, Kollision
import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../src/core/pfostenbefestigung.js";
import { sectionOf, defaultGenerator, resolveGenParams, GENERATORS } from "../src/core/generator.js";

const near = (a, b, tol = 1e-6, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} ${a} ≠ ${b}`);
const nearV = (a, b, tol = 1e-6, msg) => a.forEach((x, i) => near(x, b[i], tol, msg));
const E = (x) => Number(String(x).replace(",", "."));
const treppe = (patch = {}) => GENERATORS.treppe.plan(resolveGenParams("treppe", { ...defaultGenerator("treppe").params, ...patch }, E));

test("Profilflächen: U200 (UPN), Rechteckrohr, I-Profil, Winkel, Rundrohr", () => {
  const upn = M.profileFaces(sectionOf({ kind: "upn", size: "200" }));
  const fl = upn.find((f) => f.side === "+y");
  near(fl.wall, 11.5, 1e-9, "Flanschdicke");
  assert.deepEqual([fl.lo, fl.hi], [{ at: -17.5, edge: "innen" }, { at: 37.5, edge: "kante" }], "Flansch nutzbar vom Steg + Ausrundung bis zur Kante");
  assert.match(upn.find((f) => f.side === "+x").open, /offene Seite/);
  const steg = upn.find((f) => f.side === "-x");
  near(steg.wall, 8.5); near(steg.hi.at, 100 - 11.5 - 11.5);
  const rr = M.profileFaces(sectionOf({ kind: "rechteck", size: "80x40x3" }));
  assert.ok(rr.every((f) => !f.open && f.wall === 3), "Rechteckrohr: vier Wände");
  const ipe = M.profileFaces(sectionOf({ kind: "ipe", size: "200" }));
  assert.equal(ipe.filter((f) => f.open).length, 2);
  assert.equal(ipe.find((f) => f.side === "+y").exclude.length, 1, "Steg unter dem Flansch gesperrt");
  assert.equal(M.profileFaces(sectionOf({ kind: "winkel", size: "50x50x5" })).filter((f) => f.open).length, 2);
  assert.ok(M.profileFaces(sectionOf({ kind: "rohr", size: "42.4x2.6" }))[0].round);
});

test("Anschlussfläche an der U200-Wange: Oberseite = Flansch, außen offen, innen Steg", () => {
  const plan = treppe({ support: "upn", upn: { kind: "upn", size: "200" } });
  const w = plan.members.find((m) => m.name === "Wange rechts");
  const ax = M.memberAxes(w.a, w.b, w.up, w.rot);
  const upL = w.up;
  const top = M.memberFace(w, [0, 0, 1]);
  nearV(top.n, upL, 1e-9, "Normale senkrecht zur Wangenachse");
  assert.match(top.label, /Wange rechts \(Flansch\)/);
  near(top.wall, 11.5);
  near(top.cHi.at - top.cLo.at, 55, 1e-9, "nutzbare Flanschbreite 75 − 8,5 − 11,5");
  // Steg innen (Wange rechts liegt bei kleinem y, Stufen bei +y), offene Seite außen
  assert.throws(() => M.memberFace(w, [0, -1, 0]), /offene Seite des U-Profils/);
  const inner = M.memberFace(w, [0, 1, 0]);
  assert.match(inner.label, /Steg/);
  near(inner.wall, 8.5);
  // Ursprung der Fläche liegt eine halbe Profilhöhe über der Achse
  nearV(M.faceCoords(top, M.vec.add(w.a, M.vec.mul(upL, 100))), [0, 0, 0], 1e-9);
  nearV(top.s, ax.z, 1e-12);
});

test("Montagerahmen: Balkonpfosten auf ebener Fläche, Treppenpfosten auf geneigter Wange", () => {
  // eben: Boden z = 0, Pfosten bei (500, 0), Lauf entlang +X
  const floor = M.planeFace([0, 0, 0], [0, 0, 1], [1, 0, 0], "Boden");
  const f0 = M.mountFrame(floor, [500, 0, 800], [0, 0, 1], { along: [1, 0, 0] });
  nearV(f0.F, [500, 0, 0]); nearV(f0.x, [1, 0, 0]); nearV(f0.y, [0, 1, 0]); near(f0.tilt, 0);
  // geneigt: Oberseite der U200-Wange
  const plan = treppe({ support: "upn", upn: { kind: "upn", size: "200" } });
  const w = plan.members.find((m) => m.name === "Wange rechts");
  const face = M.memberFace(w, [0, 0, 1]);
  const alpha = Math.atan2(w.b[2] - w.a[2], w.b[0] - w.a[0]) / (Math.PI / 180);
  const P = [1000, face.o[1], 3000];
  const lot = M.mountFrame(face, P, [0, 0, 1], { along: [1, 0, 0] });
  near(M.faceCoords(face, lot.F)[2], 0, 1e-9, "Fußpunkt liegt auf der Fläche");
  near(lot.F[0], 1000, 1e-9, "lotrecht: Fußpunkt senkrecht unter dem Pfosten");
  near(lot.tilt, alpha, 1e-9, "Pfosten um die Treppenneigung gegen die Flächennormale gekippt");
  near(M.vec.dot(lot.x, lot.n), 0, 1e-12); nearV(lot.x, face.s, 1e-9, "Plattenlänge entlang der Wange");
  const nor = M.mountFrame(face, P, [0, 0, 1], { rule: "normal", along: [1, 0, 0] });
  nearV(nor.axis, face.n, 1e-12); near(nor.tilt, 0);
  // Drehung um die Normale und Rückrechnung
  const r = M.mountFrame(face, P, [0, 0, 1], { along: [1, 0, 0], rot: 90 });
  nearV(r.x, lot.y, 1e-9);
  const q = [12, -7, 3];
  nearV(M.toMount(lot, M.fromMount(lot, q)), q, 1e-9);
});

test("Anschlussfläche: mehrdeutig, rund, nächstes Bauteil, Platte", () => {
  const sq = sectionOf({ kind: "vierkant", size: "60x3" });
  const diag = { name: "Riegel", a: [0, 0, 0], b: [1000, 0, 0], section: sq, up: [0, 1, 1] };
  assert.throws(() => M.memberFace(diag, [0, 0, 1]), /nicht eindeutig/);
  const tube = { name: "Rohr", a: [0, 0, 0], b: [1000, 0, 0], section: sectionOf({ kind: "rohr", size: "60.3x3" }) };
  assert.throws(() => M.memberFace(tube, [0, 0, 1]), /keine ebene Anschlussfläche/);
  const a = { name: "A", a: [0, 0, 0], b: [1000, 0, 0], section: sq }, b = { name: "B", a: [0, 500, 0], b: [1000, 500, 0], section: sq };
  assert.equal(M.findMemberFace([a, b], [300, 450, 100], [0, 0, 1]).target, "B");
  assert.equal(M.findMemberFace([a, b], [300, 250, 100], [0, 0, 1], 100), null, "zu weit weg");
  const step = { name: "Stufe 3", center: [100, 200, 300], xDir: [0, 1, 0], normal: [0, 0, 1], W: 1000, H: 280, t: 30 };
  const pf = M.plateFace(step);
  nearV(pf.o, [100, 200, 330]); near(pf.cHi.at, 140); assert.equal(pf.targetKind, "plate");
});

test("Kollision der Hüllquader", () => {
  const sq = sectionOf({ kind: "vierkant", size: "40x3" });
  const post = M.memberBox({ name: "Pfosten", a: [0, 0, 0], b: [0, 0, 1000], section: sq, up: [1, 0, 0] });
  const plate = M.plateBox({ name: "Platte", center: [0, 0, -10], xDir: [1, 0, 0], normal: [0, 0, 1], W: 120, H: 120, t: 10 });
  assert.equal(M.boxesOverlap(post, plate), false, "Pfosten steht auf der Platte: Berührung ist keine Kollision");
  const sunk = M.plateBox({ name: "Platte", center: [0, 0, -5], xDir: [1, 0, 0], normal: [0, 0, 1], W: 120, H: 120, t: 10 });
  assert.equal(M.boxesOverlap(post, sunk), true);
  const tilted = M.plateBox({ name: "Schräg", center: [100, 0, 0], xDir: [Math.SQRT1_2, 0, Math.SQRT1_2], normal: [-Math.SQRT1_2, 0, Math.SQRT1_2], W: 100, H: 50, t: 5 });
  assert.equal(M.boxesOverlap(post, tilted), false);
  const plan = { members: [{ name: "Pfosten", a: [0, 0, 0], b: [0, 0, 1000], section: sq }], plates: [{ name: "Stufe", center: [0, 0, 400], xDir: [1, 0, 0], normal: [0, 0, 1], W: 300, H: 300, t: 30 }] };
  assert.deepEqual(M.collisions(sunk, plan), ["Pfosten"]);
  assert.deepEqual(M.collisions(sunk, plan, (n) => n === "Pfosten"), []);
});
