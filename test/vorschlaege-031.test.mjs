// Vorschläge nach 0.31 (P1–P12): reine Rechnung ohne Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { buildRect3, tangentCircles3, pickTangentCircle } from "../src/core/sketchshapes.js";
import { solveSketch } from "../src/core/solver.js";
import { newSketch, extractProfiles } from "../src/core/sketch.js";
import { defaultGenerator, resolveGenParams, GENERATORS } from "../src/core/generator.js";
import { validateDirekt, direktSummary, DIREKT_OPS } from "../src/core/direkt.js";

let n = 0;
const uid = (p) => `${p}${++n}`;
const usePoint = (sk, sn) => { if (sn.pointId) return sn.pointId; const id = uid("p"); sk.points.push({ id, x: sn.x, y: sn.y }); return id; };
const nearly = (a, b, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b}`);
const E = (x) => Number(x);
const plan = (gen, patch = {}) => GENERATORS[gen].plan(resolveGenParams(gen, { ...defaultGenerator(gen).params, ...patch }, E));

test("P9: Rechteck über 3 Punkte liegt schräg, bleibt rechtwinklig, 5 Freiheitsgrade", () => {
  const sk = newSketch("s", "S", { ref: "XY" });
  const r = buildRect3(sk, { x: 0, y: 0 }, { x: 30, y: 40 }, { x: -100, y: 200 }, { uid, usePoint });
  nearly(r.length, 50);
  // Breite = Abstand des dritten Punkts von der Kante: Normale (−0,8; 0,6) · (−100; 200) = 200
  nearly(r.width, 200);
  const s = solveSketch(sk);
  assert.ok(s.ok);
  assert.equal(s.dof, 5);
  const reg = extractProfiles(sk).regions;
  assert.equal(reg.length, 1);
  nearly(Math.abs(reg[0].area), 50 * 200, 1e-6, "Fläche");
  assert.throws(() => buildRect3(newSketch("t", "T", { ref: "XY" }), { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { uid, usePoint }), /Breite/);
});

test("P9: Kreis tangential an 3 Linien – Inkreis des Dreiecks, Ankreis nahe der Klickstelle", () => {
  // Dreieck 3-4-5: Inkreis r = (3 + 4 − 5) / 2 = 1 bei (1, 1)
  const L = [{ a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }, { a: { x: 0, y: 0 }, b: { x: 0, y: 3 } }, { a: { x: 4, y: 0 }, b: { x: 0, y: 3 } }];
  const c = tangentCircles3(L);
  assert.equal(c.length, 4);
  const inc = pickTangentCircle(c, { x: 1.3, y: 1 });
  nearly(inc.x, 1); nearly(inc.y, 1); nearly(inc.r, 1);
  assert.ok(inc.onSegments);
  // zwei Parallelen im Abstand 10 und eine Quer-Linie: r = 5
  const P = tangentCircles3([{ a: { x: 0, y: 0 }, b: { x: 50, y: 0 } }, { a: { x: 0, y: 10 }, b: { x: 50, y: 10 } }, { a: { x: 20, y: -5 }, b: { x: 20, y: 15 } }]);
  assert.ok(P.length >= 2);
  P.forEach((k) => nearly(k.r, 5));
  assert.equal(tangentCircles3([{ a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, { a: { x: 0, y: 1 }, b: { x: 1, y: 1 } }, { a: { x: 0, y: 2 }, b: { x: 1, y: 2 } }]).length, 0);
});

test("P10: Direktbearbeitung »Ersetzen« braucht eine Zielfläche", () => {
  assert.ok(DIREKT_OPS.some(([k]) => k === "ersetzen"));
  assert.throws(() => validateDirekt({ op: "ersetzen", faces: [{ p: [0, 0, 0] }] }), /Zielfläche/);
  assert.equal(validateDirekt({ op: "ersetzen", faces: [{ p: [0, 0, 0] }], target: { p: [0, 0, 5], n: [0, 0, 1] } }), "ersetzen");
  assert.match(direktSummary("ersetzen", 2, 0), /2 Fläche\(n\) durch die Zielfläche ersetzt/);
});

test("P11: Balkon warnt, wenn die Stütze breiter als der Rahmen ist (Standard ohne Warnung)", () => {
  const ok = plan("balkon");
  assert.ok(!ok.issues.some((i) => i.key === "column"), JSON.stringify(ok.issues));
  const wide = plan("balkon", { column: { kind: "vierkant", size: "120x5" } });
  const w = wide.issues.find((i) => i.key === "column");
  assert.ok(w && w.level === "Warnung" && /breiter als der Rahmen/.test(w.message));
});
