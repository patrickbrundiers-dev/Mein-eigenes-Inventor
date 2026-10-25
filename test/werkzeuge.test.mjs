// Werkzeuge ab Stufe 36 (Bezugsgeometrie, Formen, Blech, Baugruppe …): reine Rechnung ohne Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { resolveDatums, resolvePlane, mirrorPlane, patternAxis, datumSummary } from "../src/core/datums.js";

const near = (a, b, tol = 1e-9, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b}`);
const nearV = (a, b, tol = 1e-9, msg = "") => a.forEach((x, i) => near(x, b[i], tol, msg + "[" + i + "]"));
const ev = (x) => Number(String(x).replace(",", "."));

test("Arbeitsebene: Versatz, gedreht, drei Punkte, senkrecht zu Achse, auf Fläche", () => {
  const { map, errors } = resolveDatums([
    { id: "e1", type: "arbeitsebene", mode: "versatz", base: "XY", distance: "50" },
    { id: "e2", type: "arbeitsebene", mode: "versatz", base: "e1", distance: "-20" },
    { id: "e3", type: "arbeitsebene", mode: "winkel", base: "XY", axis: "u", angle: "90" },
    { id: "e4", type: "arbeitsebene", mode: "punkte", p1: { x: "0", y: "0", z: "10" }, p2: { x: "1", y: "0", z: "10" }, p3: { x: "0", y: "1", z: "10" } },
    { id: "a1", type: "arbeitsachse", mode: "parallel", dir: "X", point: { x: "0", y: "5", z: "0" } },
    { id: "e5", type: "arbeitsebene", mode: "normal", axis: "a1", point: { x: "30", y: "0", z: "0" } },
    { id: "e6", type: "arbeitsebene", mode: "flaeche", origin: [0, 0, 7], normal: [0, 0, 2], distance: "3" },
  ], ev);
  assert.deepEqual(errors, {});
  nearV(map.get("e1").frame.origin, [0, 0, 50]);
  nearV(map.get("e2").frame.origin, [0, 0, 30]);
  nearV(map.get("e2").frame.normal, [0, 0, 1]);
  // XY um die eigene x-Richtung 90° gedreht: Normale zeigt nach −Y
  nearV(map.get("e3").frame.normal, [0, -1, 0], 1e-12);
  nearV(map.get("e4").frame.normal, [0, 0, 1]);
  nearV(map.get("e4").frame.origin, [0, 0, 10]);
  nearV(map.get("e5").frame.normal, [1, 0, 0]);
  nearV(map.get("e5").frame.origin, [30, 0, 0]);
  nearV(map.get("e6").frame.origin, [0, 0, 10]);
  nearV(map.get("e6").frame.normal, [0, 0, 1]);
  // Rahmen bleibt rechtshändig und orthonormal
  for (const id of ["e1", "e3", "e4", "e5", "e6"]) {
    const { xDir, yDir, normal } = map.get(id).frame;
    const cross = [xDir[1] * yDir[2] - xDir[2] * yDir[1], xDir[2] * yDir[0] - xDir[0] * yDir[2], xDir[0] * yDir[1] - xDir[1] * yDir[0]];
    nearV(cross, normal, 1e-9, id);
  }
});

test("Arbeitsachse und Arbeitspunkt: Schnitt zweier Ebenen, zwei Punkte, Achse mit Ebene", () => {
  const { map, errors } = resolveDatums([
    { id: "e1", type: "arbeitsebene", mode: "versatz", base: "XZ", distance: "40" },
    { id: "e2", type: "arbeitsebene", mode: "versatz", base: "YZ", distance: "25" },
    { id: "a1", type: "arbeitsachse", mode: "schnitt", plane1: "e1", plane2: "e2" },
    { id: "p1", type: "arbeitspunkt", mode: "schnitt", axis: "a1", plane: "XY" },
    { id: "p2", type: "arbeitspunkt", mode: "koordinaten", x: "10", y: "20", z: "30" },
    { id: "a2", type: "arbeitsachse", mode: "punkte", p1: "p1", p2: "p2" },
    { id: "bad", type: "arbeitsachse", mode: "schnitt", plane1: "XY", plane2: "e3fehlt" },
    { id: "par", type: "arbeitsachse", mode: "schnitt", plane1: "XY", plane2: "XY" },
    { id: "aus", type: "arbeitsebene", suppressed: true, mode: "versatz", base: "XY", distance: "1" },
  ], ev);
  const a1 = map.get("a1");
  near(Math.abs(a1.d[2]), 1, 1e-12);
  // XZ-Normale zeigt nach −Y (wie Skizzen auf XZ mit Abstand)
  near(a1.p[0], 25, 1e-9); near(a1.p[1], -40, 1e-9);
  nearV(map.get("p1").p, [25, -40, 0], 1e-9);
  nearV(map.get("a2").p, [25, -40, 0]);
  near(Math.hypot(...map.get("a2").d), 1);
  assert.match(errors.bad, /Bezugsebene fehlt/);
  assert.match(errors.par, /parallel/);
  assert.equal(map.has("aus"), false);
  assert.match(datumSummary({}, map.get("p2")), /Punkt \(10; 20; 30\)/);
});

test("Skizzenebene, Spiegelebene und Musterachse aus Arbeitselementen", () => {
  const { map } = resolveDatums([
    { id: "e1", type: "arbeitsebene", mode: "versatz", base: "YZ", distance: "100" },
    { id: "a1", type: "arbeitsachse", mode: "parallel", dir: "Y", point: { x: "5", y: "0", z: "5" } },
  ], ev);
  const pl = resolvePlane({ ref: "datum", id: "e1" }, map);
  assert.equal(pl.ref, "custom");
  nearV(pl.origin, [100, 0, 0]);
  assert.deepEqual(resolvePlane({ ref: "XY" }, map), { ref: "XY" });
  assert.throws(() => resolvePlane({ ref: "datum", id: "x" }, map), /Arbeitsebene/);
  const m = mirrorPlane({ plane: "datum:e1" }, ev, map);
  nearV(m.n, [1, 0, 0]); nearV(m.origin, [100, 0, 0]);
  const m2 = mirrorPlane({ plane: "XZ", offset: "12" }, ev, map);
  nearV(m2.origin, [0, 12, 0]);
  const ax = patternAxis("datum:a1", map);
  nearV(ax.d, [0, 1, 0]); nearV(ax.p, [5, 0, 5]);
  assert.equal(patternAxis("Z", map), null);
  assert.throws(() => patternAxis("datum:e1", map), /Arbeitsachse/);
});

import { pathChain, reverseChain, pathLength, pathAt, pathPatternStations, coilParams, loopCentroid, validateLoft } from "../src/core/formen.js";
import { featureRefs, dependents, sketchRefs } from "../src/core/featurerefs.js";

const pathSketch = (pts, ents) => ({ points: pts.map(([id, x, y]) => ({ id, x, y })), entities: ents });

test("Pfad: Kette aus Linien und Bögen ordnen, Länge, Punkt und Tangente", () => {
  // Linie (rückwärts gezeichnet) + Viertelbogen R10 + Linie
  const sk = pathSketch([["a", 0, 0], ["b", 50, 0], ["m", 50, 10], ["c", 60, 10], ["d", 60, 40], ["k", 0, 99]], [
    { id: "l1", type: "line", p1: "b", p2: "a" },
    { id: "l2", type: "line", p1: "c", p2: "d" },
    { id: "ar", type: "arc", c: "m", p1: "b", p2: "c" },
    { id: "kk", type: "line", p1: "a", p2: "k", construction: true },
  ]);
  const ch = pathChain(sk);
  assert.equal(ch.closed, false);
  assert.deepEqual(ch.pieces.map((p) => p.t), ["line", "arc", "line"]);
  near(pathLength(ch), 50 + (Math.PI / 2) * 10 + 30, 1e-9);
  const mid = pathAt(ch, 50 + (Math.PI / 4) * 10);
  nearV(mid.p, [50 + 10 * Math.SQRT1_2, 10 - 10 * Math.SQRT1_2], 1e-9);
  nearV(mid.d, [Math.SQRT1_2, Math.SQRT1_2], 1e-9);
  // Anfang am freien Ende des zuerst gezeichneten Elements; umgekehrt beginnt der Pfad bei d mit Richtung −y
  nearV(ch.pieces[0].a, [0, 0]);
  nearV(pathAt(ch, pathLength(ch)).d, [0, 1], 1e-9);
  const rv = reverseChain(ch);
  nearV(pathAt(rv, 0).p, [60, 40]); nearV(pathAt(rv, 0).d, [0, -1], 1e-9);
  nearV(pathAt(rv, 30 + (Math.PI / 4) * 10).d, [-Math.SQRT1_2, -Math.SQRT1_2], 1e-9);
  // geschlossenes Quadrat
  const sq = pathSketch([["1", 0, 0], ["2", 10, 0], ["3", 10, 10], ["4", 0, 10]], [["1", "2"], ["2", "3"], ["3", "4"], ["4", "1"]].map(([p1, p2], i) => ({ id: "q" + i, type: "line", p1, p2 })));
  assert.equal(pathChain(sq).closed, true);
  assert.throws(() => pathChain(pathSketch([["1", 0, 0], ["2", 10, 0], ["3", 20, 0], ["4", 30, 0]], [{ id: "x", type: "line", p1: "1", p2: "2" }, { id: "y", type: "line", p1: "3", p2: "4" }])), /zusammenhängend/);
  assert.throws(() => pathChain(pathSketch([["1", 0, 0], ["2", 10, 0], ["3", 20, 0], ["4", 10, 10]], [["1", "2"], ["2", "3"], ["2", "4"]].map(([p1, p2], i) => ({ id: "v" + i, type: "line", p1, p2 })))), /verzweigt/);
  assert.throws(() => pathChain(pathSketch([], [])), /keine Linien/);
});

test("Muster entlang Pfad: Stationen gleichmäßig oder mit Abstand, Drehung mit der Tangente", () => {
  // Halbkreis R50 gegen den Uhrzeigersinn von (50,0) nach (−50,0)
  const sk = pathSketch([["c", 0, 0], ["s", 50, 0], ["e", -50, 0]], [{ id: "a", type: "arc", c: "c", p1: "s", p2: "e" }]);
  const ch = pathChain(sk);
  const r = pathPatternStations(ch, { count: 3 });
  assert.equal(r.stations.length, 2);
  nearV(r.stations[0].p, [0, 50], 1e-9);
  near(r.stations[0].angle, 90, 1e-9);
  near(Math.abs(r.stations[1].angle), 180, 1e-9);
  nearV(r.stations[1].move, [-100, 0], 1e-9);
  const fixed = pathPatternStations(ch, { count: 3, align: false });
  near(fixed.stations[0].angle, 0);
  const sp = pathPatternStations(ch, { count: 2, spacing: 10 });
  near(sp.step, 10);
  assert.throws(() => pathPatternStations(ch, { count: 10, spacing: 50 }), /Pfad zu kurz/);
  assert.throws(() => pathPatternStations(ch, { count: 1 }), /mindestens 2/);
  // geschlossener Pfad: n Exemplare teilen den Umfang in n gleiche Teile (letztes nicht auf dem ersten)
  const sq = pathSketch([["1", 0, 0], ["2", 10, 0], ["3", 10, 10], ["4", 0, 10]], [["1", "2"], ["2", "3"], ["3", "4"], ["4", "1"]].map(([p1, p2], i) => ({ id: "q" + i, type: "line", p1, p2 })));
  near(pathPatternStations(pathChain(sq), { count: 4 }).step, 10);
});

test("Spirale, Schwerpunkt, Erhebung: Prüfungen", () => {
  assert.deepEqual(coilParams({ pitch: 10, turns: 3 }), { pitch: 10, turns: 3, height: 30 });
  assert.deepEqual(coilParams({ mode: "hoehe", pitch: 10, height: 25 }), { pitch: 10, height: 25, turns: 2.5 });
  // Obergrenzen greifen vor dem Rechnen (auch im Höhen-Modus und bei gleichmäßig verteiltem Muster)
  assert.throws(() => coilParams({ mode: "hoehe", pitch: 0.01, height: 1000 }), /500 Umdrehungen/);
  assert.throws(() => pathPatternStations({ segs: [], closed: false }, { count: 1e9 }), /500 Exemplare/);
  assert.throws(() => coilParams({ pitch: 0, turns: 3 }), /Steigung/);
  assert.throws(() => coilParams({ pitch: 1, turns: 501 }), /500/);
  nearV(loopCentroid([[0, 0], [10, 0], [10, 4], [0, 4]]), [5, 2]);
  assert.throws(() => validateLoft(["a"]), /zwei/);
  assert.throws(() => validateLoft(["a", "a"]), /doppelt/);
  validateLoft(["a", "b"]);
});

test("Bezüge: Skizzen von Sweeping/Erhebung, Arbeitselemente, Löschen mit Abhängigen", () => {
  assert.deepEqual(sketchRefs({ type: "sweep", sketch: "s1", path: "s2" }), ["s1", "s2"]);
  assert.deepEqual(sketchRefs({ type: "loft", sketches: ["a", "b", "c"] }), ["a", "b", "c"]);
  const feats = [
    { id: "w1", type: "arbeitsebene", base: "XY" },
    { id: "w2", type: "arbeitsebene", base: "w1" },
    { id: "a1", type: "arbeitsachse", mode: "schnitt", plane1: "w2", plane2: "XZ" },
    { id: "s1", type: "sketch", plane: { ref: "datum", id: "w2" } },
    { id: "e1", type: "extrude", sketch: "s1" },
    { id: "m", type: "mirror", plane: "datum:w1" },
    { id: "pt", type: "pattern", feature: "e1", axis: "datum:a1" },
    { id: "x", type: "extrude", sketch: "s9" },
  ];
  assert.deepEqual(featureRefs(feats[2]).sort(), ["w2"]);
  assert.deepEqual([...dependents(feats, "w1")].sort(), ["a1", "e1", "m", "pt", "s1", "w1", "w2"]);
  assert.deepEqual([...dependents(feats, "a1")].sort(), ["a1", "pt"]);
});

import { planeOf, axisOf, validateCombine, thickenSpan, validateDraft } from "../src/core/koerper.js";

test("Körper-Werkzeuge: Ebene, Achse, Prüfungen", () => {
  const { map } = resolveDatums([{ id: "w", type: "arbeitsebene", mode: "versatz", base: "XY", distance: "10" }, { id: "a", type: "arbeitsachse", mode: "parallel", dir: "X", point: { x: "0", y: "3", z: "0" } }], ev);
  nearV(planeOf("datum:w", 5, map).origin, [0, 0, 15]);
  nearV(planeOf("YZ", 30).origin, [30, 0, 0]);
  assert.throws(() => planeOf("datum:x", 0, map), /Arbeitsebene/);
  assert.deepEqual(axisOf("Y"), { d: [0, 1, 0], p: [0, 0, 0] });
  nearV(axisOf("datum:a", map).p, [0, 3, 0]);
  assert.throws(() => axisOf("Q"), /Achse/);
  assert.deepEqual(validateCombine({ target: "a", tools: ["a", "b"] }), ["b"]);
  assert.throws(() => validateCombine({ target: "a", tools: ["a"] }), /Werkzeugkörper/);
  assert.throws(() => validateCombine({ tools: ["b"] }), /Zielkörper/);
  assert.deepEqual(thickenSpan(4, "beide"), { start: -2, length: 4 });
  assert.deepEqual(thickenSpan(4, "innen"), { start: -4, length: 4 });
  assert.throws(() => thickenSpan(0), /Dicke/);
  assert.equal(validateDraft(-3), -3);
  assert.throws(() => validateDraft(50), /45/);
  assert.deepEqual(featureRefs({ type: "kombinieren", target: "e1", tools: ["e2", "e3"] }).sort(), ["e1", "e2", "e3"]);
});

import { solveAssembly, faceRef, axisRef, insertRef, endFaceFor, CONSTRAINT_TYPES } from "../src/core/asmsolve.js";
import { placementMatrix, matApplyDir, matApply } from "../src/core/geom.js";

test("Baugruppe: Winkel, Tangential, Einfügen (Stufe 39)", () => {
  assert.equal(CONSTRAINT_TYPES.einfuegen, "Einfügen");
  // Platte P (fest): Oberseite z = 10, Bohrung Achse Z durch (50, 20), r = 5; Bolzen B: Achse Z durch (0,0), r = 4, Kopfunterseite z = 0 (Normale −Z)
  const P = { id: "P", part: "plate", pos: [0, 0, 0], rot: [0, 0, 0], fixed: true };
  const B = { id: "B", part: "bolt", pos: [200, 100, 50], rot: [30, 0, 0] };
  const faces = {
    plate: [{ type: "PLANE", normal: [0, 0, 1], point: [0, 0, 10] }, { type: "PLANE", normal: [0, 0, -1], point: [0, 0, 0] }, { type: "PLANE", normal: [1, 0, 0], point: [100, 0, 0] }, { type: "CYLINDER", axisP: [50, 20, 0], axisD: [0, 0, 1], radius: 5 }],
    bolt: [{ type: "PLANE", normal: [0, 0, -1], point: [0, 0, 0] }, { type: "PLANE", normal: [1, 0, 0], point: [4, 0, 0] }, { type: "CYLINDER", axisP: [0, 0, -30], axisD: [0, 0, 1], radius: 4 }],
  };
  const facesOf = (pid) => faces[pid];
  const top = faces.plate[0], hole = faces.plate[3];
  assert.equal(endFaceFor(hole, [55, 20, 9.5], faces.plate), top);
  const asm = { components: [P, B], constraints: [{ id: "i", type: "einfuegen", gap: "0", a: insertRef("P", { axisP: hole.axisP, axisD: hole.axisD, radius: 5 }, top), b: insertRef("B", { axisP: [0, 0, -30], axisD: [0, 0, 1], radius: 4 }, faces.bolt[0]) }] };
  const r = solveAssembly(asm, facesOf);
  assert.deepEqual(r.errors, {});
  const M = placementMatrix(B.pos, B.rot);
  nearV(matApply(M, [0, 0, 0]), [50, 20, 10], 1e-6);
  nearV(matApplyDir(M, [0, 0, -1]), [0, 0, -1], 1e-9);

  // Winkel: Seitenfläche des Bolzens (+X) 30° zur Seitenfläche der Platte (+X)
  const asm2 = { components: [P, { id: "B", part: "bolt", pos: [0, 0, 0], rot: [0, 0, 0] }], constraints: [{ id: "w", type: "winkel", angle: "30", a: faceRef("P", faces.plate[2]), b: faceRef("B", faces.bolt[1]) }] };
  assert.deepEqual(solveAssembly(asm2, facesOf).errors, {});
  const n = matApplyDir(placementMatrix(asm2.components[1].pos, asm2.components[1].rot), [1, 0, 0]);
  near((Math.acos(n[0]) * 180) / Math.PI, 30, 1e-6);

  // Tangential: Bolzenmantel (r 4) an Plattenseite x = 100, Achse liegt parallel
  const asm3 = { components: [P, { id: "B", part: "bolt", pos: [130, 0, 0], rot: [0, 0, 0] }], constraints: [{ id: "t", type: "tangential", gap: "0", a: faceRef("P", faces.plate[2]), b: axisRef("B", faces.bolt[2]) }] };
  assert.deepEqual(solveAssembly(asm3, facesOf).errors, {});
  near(asm3.components[1].pos[0], 104, 1e-9);
  // Achse quer zur Fläche: Fehler
  const asm4 = { components: [P, { id: "B", part: "bolt", pos: [0, 0, 50], rot: [0, 0, 0] }], constraints: [{ id: "t", type: "tangential", gap: "0", a: faceRef("P", top), b: axisRef("B", faces.bolt[2]) }] };
  assert.match(solveAssembly(asm4, facesOf).errors.t, /parallel/);
});

import { applyPatterns, patternMatrices, defaultAsmPattern } from "../src/core/asmmuster.js";

test("Komponentenmuster: rechteckig und kreisförmig, folgt der Quelle, räumt auf", () => {
  const asm = { components: [{ id: "a", part: "p1", name: "Pfosten:1", pos: [10, 0, 0], rot: [0, 0, 0] }], patterns: [defaultAsmPattern("m1", ["a"])] };
  let r = applyPatterns(asm);
  assert.equal(r.changed, true);
  assert.deepEqual(asm.components.map((c) => c.pos[0]), [10, 110, 210]);
  assert.equal(asm.components[2].name, "Pfosten:1·3");
  // Quelle bewegt → Kopien folgen; zweite Richtung
  asm.components[0].pos = [0, 0, 0];
  Object.assign(asm.patterns[0], { dir2: "Y", count2: "2", spacing2: "50" });
  r = applyPatterns(asm);
  assert.equal(asm.components.length, 6);
  assert.deepEqual(asm.components.filter((c) => c.pat).map((c) => [c.pos[0], c.pos[1]]).sort((p, q) => p[1] - q[1] || p[0] - q[0]), [[100, 0], [200, 0], [0, 50], [100, 50], [200, 50]]);
  assert.equal(applyPatterns(asm).changed, false, "stabil");
  // kreisförmig: 4 um Z durch Ursprung, Quelle bei x = 100
  const asm2 = { components: [{ id: "b", part: "p", name: "B", pos: [100, 0, 0], rot: [0, 0, 0] }], patterns: [defaultAsmPattern("m2", ["b"], "circular")] };
  applyPatterns(asm2);
  nearV(asm2.components[1].pos, [0, 100, 0], 1e-9);
  near(asm2.components[1].rot[2], 90, 1e-9);
  // Muster gelöscht → Kopien weg
  asm2.patterns = [];
  assert.equal(applyPatterns(asm2).changed, true);
  assert.equal(asm2.components.length, 1);
  assert.throws(() => patternMatrices({ kind: "linear", count: "1" }), /mindestens 2/);
  const bad = applyPatterns({ components: [], patterns: [{ id: "x", kind: "linear", comps: ["fehlt"], count: "2", spacing: "1" }] });
  assert.match(bad.errors.x, /Quellkomponente/);
});

import { capPlan, trimPlan, equalParts } from "../src/core/rahmen.js";

test("Rahmen: Endkappe, Kürzen an Ebene, Gleichteile (Stufe 40)", () => {
  assert.deepEqual(capPlan({ thickness: 5 }, true).ends, ["A", "B"]);
  assert.deepEqual(capPlan({ thickness: 5, end: "B" }, false).ends, ["B"]);
  assert.throws(() => capPlan({ thickness: 5, mode: "eingesetzt" }, false), /Hohlprofil/);
  assert.throws(() => capPlan({ thickness: 0 }, true), /Dicke/);
  const ax = { origin: [0, 0, 0], z: [1, 0, 0], lo: 0, hi: 500 };
  assert.deepEqual(trimPlan(ax, [400, 0, 0], [1, 0, 0]), { end: "B", at: 400, delta: -100, sign: 1 });
  const ex = trimPlan(ax, [-50, 0, 0], [-1, 0, 0]);
  assert.equal(ex.end, "A"); near(ex.delta, 50);
  assert.throws(() => trimPlan(ax, [0, 0, 0], [0, 1, 0]), /parallel/);
  assert.throws(() => trimPlan(ax, [-10, 0, 0], [1, 0, 0], "B"), /hinter/);
  const mk = (name, L, m1 = 0, m2 = 0) => ({ kind: "member", name, meta: { profileId: "QR 40x3", length: L, miterStart: m1, miterEnd: m2 } });
  const eq = equalParts([mk("S1", 1000, 45, 45), mk("S2", 600), mk("S3", 1000.04, 45, 45), mk("S4", 600), mk("S5", 1000, 0, 45), { kind: "solid", name: "Platte" }]);
  assert.deepEqual(eq.map((g) => [g.count, g.names.join()]), [[2, "S1,S3"], [2, "S2,S4"], [1, "S5"]]);
  // gleicher Gesamtwinkel, aber andere Anteile Breite/Höhe (Gehrung in zwei Ebenen): keine Gleichteile
  const sp = (name, b, hh) => ({ ...mk(name, 800, 50, 0), meta: { ...mk(name, 800, 50, 0).meta, miterParts: { A: { b, h: hh }, B: { b: 0, h: 0 } } } });
  assert.deepEqual(equalParts([sp("T1", 30, 40), sp("T2", 40, 30), sp("T3", 30, 40)]).map((g) => g.names.join()), ["T1,T3", "T2"]);
});

test("Stecksystem: Lage der Zapfen, Wanddicke, Schlitzmaß (Stufe 45)", async () => {
  const S = await import("../src/core/stecksystem.js");
  assert.deepEqual(S.tabLayout(160, { count: 3, width: 20, edge: 15 }), [25, 80, 135]);
  assert.deepEqual(S.tabLayout(100, { count: 1, width: 20, edge: 15 }), [50]);
  // Höchstabstand 50 auf 200 mm: Zapfenmitten höchstens 50 auseinander
  const c = S.tabLayout(200, { mode: "abstand", spacing: 50, width: 20, edge: 10 });
  assert.equal(c.length, 5);
  assert.ok(c.every((x, i) => !i || x - c[i - 1] <= 50 + 1e-9));
  assert.throws(() => S.tabLayout(40, { count: 1, width: 20, edge: 15 }), /zu kurz/);
  assert.throws(() => S.tabLayout(100, { count: 6, width: 20, edge: 0 }), /passen nicht/);
  // Rohr: Sonde trifft zwei Wände (0 … 3 und 47 … 50) – Wand 3
  assert.equal(S.wallFromDepths([0, 3, 0, 3, 47, 50, 47, 50]), 3);
  assert.throws(() => S.wallFromDepths([0, 0]), /kein Material/);
  assert.deepEqual(S.slotSize(20, 4, 0.2), { w: 20.4, t: 4.4 });
});

test("Stecksystem zwischen Baugruppen-Teilen: prüfen, schreiben, löschen (Stufe 46)", async () => {
  const S = await import("../src/core/stecksystem.js");
  const s = S.defaultSteckverbindung("st1", "c1", "c2");
  assert.equal(s.type, undefined);
  assert.equal(s.count, "3");
  const docs = [
    { id: "pa", kind: "part", features: [{ id: "x", type: "extrude" }] },
    { id: "pb", kind: "part", features: [] },
    { id: "pl", kind: "part", link: { file: "a.wcad" }, features: [] },
    { id: "sub", kind: "assembly", components: [] },
  ];
  const docOf = (id) => docs.find((d) => d.id === id);
  const asm = { id: "a", kind: "assembly", name: "Rahmen", components: [{ id: "c1", part: "pa" }, { id: "c2", part: "pb" }, { id: "c3", part: "pa" }, { id: "c4", part: "pl" }, { id: "c5", part: "sub" }] };
  assert.equal(S.steckProblem(asm, s, docOf), null);
  assert.match(S.steckProblem(asm, { ...s, slot: "c1" }, docOf), /verschiedene/);
  assert.match(S.steckProblem(asm, { ...s, slot: "c3" }, docOf), /dasselbe Bauteil/);
  assert.match(S.steckProblem(asm, { ...s, slot: "c4" }, docOf), /Verknüpfte/);
  assert.match(S.steckProblem(asm, { ...s, slot: "c5" }, docOf), /Unterbaugruppen/);
  assert.match(S.steckProblem(asm, { ...s, slot: "zz" }, docOf), /fehlt/);
  const box = { c: [1.00000001, 2, 3], u: [1, 0, 0], n: [0, 0, 1], w: 20, t: 4, depth: 5 };
  let n = 0;
  const newId = () => "f" + ++n;
  S.applySteck(docs, asm, s, { tabs: [box, box], slots: [box], tabBody: "x", slotBody: "y" }, newId);
  assert.equal(docs[0].features.length, 2);
  const z = docs[0].features[1];
  assert.equal(z.type, "steckzapfen");
  assert.equal(z.steck, "st1");
  assert.equal(z.body, "x");
  assert.equal(z.boxes.length, 2);
  assert.equal(z.boxes[0].c[0], 1);
  assert.equal(docs[1].features[0].type, "steckschlitz");
  // erneut anwenden ersetzt, statt zu verdoppeln
  S.applySteck(docs, asm, s, { tabs: [box], slots: [box], tabBody: "x", slotBody: "y" }, newId);
  assert.equal(docs[0].features.length, 2);
  assert.equal(docs[0].features[1].boxes.length, 1);
  // Planung sieht das Bauteil ohne die eigenen Zapfen
  assert.equal(S.withoutSteck(docs[0], "st1").features.length, 1);
  assert.equal(docs[0].features.length, 2, "Original unverändert");
  S.removeSteck(docs, "st1");
  assert.equal(docs[0].features.length, 1);
  assert.equal(docs[1].features.length, 0);
});

test("Blech: Rücksprung, Abwicklungsumriss, Konturlasche, Durchzug-Vorloch (Stufe 41)", async () => {
  const { planKantteil, bendCut } = await import("../src/core/blech.js");
  const { planSheet, rectOutline, contourLegs, durchzugVorloch, sheetFlatView } = await import("../src/core/blechplus.js");
  // Rücksprung bei 90°: außen ri + t, innen ri; 180° (Umschlag) bis zur Falzkante
  assert.equal(Math.round(bendCut(90, 2, 2, "aussen") * 1e9) / 1e9, 4);
  assert.equal(Math.round(bendCut(90, 2, 2, "innen") * 1e9) / 1e9, 2);
  assert.equal(bendCut(180, 1, 2, "aussen"), 3);
  assert.equal(Math.round(bendCut(90, 2, 2, "links") * 1e9), 2e9, "links bei Biegung nach links = innen");
  // Plan unverändert gegenüber dem bisherigen Kantteil (U 40/100/40, außen): Abwicklung 172,36
  const u = planKantteil({ legs: [40, 100, 40], angles: [90, 90], t: 2, ri: 2, k: 0.33 });
  assert.equal(Math.round(u.flat * 100) / 100, 172.36);
  // Umriss aus Rechtecken: Grundfläche mit angesetzter Lasche und zwei Freischnitten
  const loops = rectOutline([0, 100, 0, 50], [[90, 101, 10, 30]], [[90, 120, 10, 30]], [[88, 101, 8, 10], [88, 101, 30, 32]]);
  assert.equal(loops.length, 1);
  assert.ok(loops[0].area > 0);
  assert.equal(loops[0].pts.length, 12);
  // ganze Lasche + Teil-Lasche am Anfang, Stirnlasche, Durchzug
  const base = { legs: [40, 100, 40], angles: [90, 90], t: 2, ri: 2, k: 0.33, ref: "aussen", L: 500 };
  const S = planSheet(base, [
    { type: "lasche", edge: "ende", length: 20, angle: 90, dir: "auf", width: null, offset: 0 },
    { type: "lasche", edge: "anfang", length: 15, angle: 90, dir: "ab", width: 100, offset: 50, relief: "rechteck" },
    { type: "lasche", edge: "vorne", leg: 2, length: 30, angle: 90, dir: "auf", relief: "rechteck" },
    { type: "durchzug", leg: 2, s: [30], y: [200], d: 8, height: 4, dir: "auf" },
  ]);
  assert.equal(S.plan.bends.length, 3);
  assert.equal(S.flat.bends.length, 5);
  assert.ok(S.flat.bbox.x0 < 0, "Teil-Lasche am Anfang liegt vor x = 0");
  assert.ok(S.flat.bbox.y0 < 0, "Stirnlasche liegt vor y = 0");
  assert.equal(S.flat.circles.length, 1);
  const fv = sheetFlatView(S.flat);
  assert.equal(fv.arcs.length, 1);
  assert.equal(fv.bends[0].x, S.flat.bends[0].x0);
  // Teil-Lasche hinter einer ganzen am selben Ende ist erlaubt, umgekehrt nicht
  assert.throws(() => planSheet(base, [{ type: "lasche", edge: "ende", length: 20, angle: 90, width: 100, offset: 0 }, { type: "lasche", edge: "ende", length: 20, angle: 90 }]), /Teil-Lasche/);
  // Konturlasche: Ecke zu Ecke, Winkel mit Vorzeichen, Material links → Maße an der rechten Fläche
  const c = contourLegs({ closed: false, pieces: [{ t: "line", a: [0, 0], b: [50, 0] }, { t: "line", a: [50, 0], b: [50, 80] }, { t: "line", a: [50, 80], b: [0, 80] }] }, "links");
  assert.deepEqual(c.legs, [50, 80, 50]);
  assert.deepEqual(c.angles, [90, 90]);
  assert.equal(c.ref, "rechts");
  assert.throws(() => contourLegs({ closed: false, pieces: [{ t: "arc" }] }), /nur Linien/);
  // Vorloch: kleiner als innen, zu hoher Kragen wird abgelehnt
  const d0 = durchzugVorloch(8, 4, 2);
  assert.ok(d0 > 6 && d0 < 7, String(d0));
  assert.throws(() => durchzugVorloch(8, 8, 2), /zu hoch/);
});

test("3D-Skizze, abgeleitetes Bauteil, Komponente spiegeln, Feature kopieren/verschieben (Stufe 42)", async () => {
  const { path3d, inlineDerived, derivableSources, eulerMatrix, mirrorPlacement, copyFeatures, moveProblem } = await import("../src/core/ableiten.js");
  // L-Zug 100 + 100 mit Radius 10: zwei Geraden à 90 und ein Viertelkreis
  const p = path3d([[0, 0, 0], [100, 0, 0], [100, 100, 0]], { radius: 10 });
  assert.deepEqual(p.pieces.map((q) => q.t), ["line", "arc", "line"]);
  assert.ok(Math.abs(p.length - (180 + (Math.PI * 10) / 2)) < 1e-9, String(p.length));
  assert.ok(Math.abs(Math.hypot(p.pieces[1].m[0] - 90, p.pieces[1].m[1] - 10) - 10) < 1e-9, "Bogenmitte auf dem Radius");
  assert.throws(() => path3d([[0, 0, 0], [10, 0, 0], [10, 10, 0]], { radius: 20 }), /zu groß/);
  const pc = path3d([[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0]], { radius: 5, closed: true });
  assert.equal(pc.pieces.filter((q) => q.t === "arc").length, 4);
  // Ableiten: Quelle eingebettet, Ringbezug erkannt
  const A = { id: "A", kind: "part", name: "A", features: [{ id: "x", type: "extrude" }] };
  const B = { id: "B", kind: "part", name: "B", features: [{ id: "d", type: "abgeleitet", source: "A" }] };
  const docs = { A, B };
  const inl = inlineDerived(B, (id) => docs[id]);
  assert.equal(inl.features[0]._src.id, "A");
  const C = { id: "C", kind: "part", name: "C", features: [{ id: "d2", type: "abgeleitet", source: "C" }] };
  assert.match(inlineDerived(C, (id) => ({ C })[id]).features[0]._srcError, /Ringbezug/);
  assert.deepEqual(derivableSources({ docs: [A, B] }, A).map((d) => d.id), [], "A kann nicht von B ableiten (B kommt von A)");
  // Spiegeln: Lage gespiegelt, Drehung bleibt, lokale Normale = Rᵀ n
  const R = eulerMatrix([0, 0, 90]);
  assert.ok(Math.abs(R[1][0] - 1) < 1e-12, "X → Y bei 90° um Z");
  const m = mirrorPlacement([100, 20, 0], [0, 0, 90], [1, 0, 0], 0);
  assert.deepEqual(m.pos, [-100, 20, 0]);
  assert.deepEqual(m.normal, [0, -1, 0]);
  // Kopieren: Skizze kommt beim Kopieren in ein anderes Bauteil mit, Bezug auf die Kopie
  let n = 0;
  const feats = [{ id: "s1", type: "sketch", name: "Skizze 1" }, { id: "e1", type: "extrude", name: "Extrusion 1", sketch: "s1" }];
  const cp = copyFeatures(feats, ["e1"], { newId: () => "n" + ++n, sameDoc: false });
  assert.equal(cp.length, 2);
  assert.equal(cp[1].sketch, cp[0].id);
  const same = copyFeatures(feats, ["e1"], { newId: () => "m1", sameDoc: true, names: ["Extrusion 1"] });
  assert.equal(same.length, 1);
  assert.equal(same[0].sketch, "s1");
  assert.equal(same[0].name, "Extrusion 1 (Kopie)");
  // Verschieben: nicht vor die eigene Skizze, Skizze nicht hinter ihren Verbraucher
  assert.match(moveProblem(feats, 1, 0), /braucht/);
  assert.match(moveProblem(feats, 0, 1), /braucht/);
  assert.equal(moveProblem([...feats, { id: "f", type: "fillet", name: "R" }], 2, 1), null);
});

test("Varianten aus Tabelle, Regeln, Makros, Sprache (Stufe 43)", async () => {
  const { checkVariants, syncVariants, variantPart } = await import("../src/core/varianten.js");
  const { applyRules, defaultRule } = await import("../src/core/regeln.js");
  const { validateMacros, recordable, macroCommands } = await import("../src/core/makros.js");
  const { setLanguage, t, hasTranslation } = await import("../src/core/i18n.js");
  // Varianten: Werksbauteil mit zwei Zeilen, leere Zelle übernimmt den Wert des Werksbauteils
  const F = { id: "F", kind: "part", name: "Lasche", number: "100", params: [{ name: "L", expr: "100" }, { name: "B", expr: "L / 2" }], features: [],
    variants: { columns: ["L", "B"], rows: [{ id: "r1", name: "L-200", number: "", values: { L: "200", B: "" } }, { id: "r2", name: "L-300", number: "X-3", values: { L: "300", B: "40" } }] } };
  assert.deepEqual(checkVariants(F), []);
  const v1 = variantPart(F, F.variants.rows[0], "p1");
  assert.equal(v1.number, "100-L-200");
  assert.equal(v1.params.find((p) => p.name === "B").expr, "L / 2");
  assert.equal(v1.variants, undefined);
  let n = 0;
  const s1 = syncVariants([F], F, () => "v" + ++n);
  assert.equal(s1.created, 2);
  assert.equal(s1.docs[2].number, "X-3");
  // zweiter Lauf ändert nichts; geänderte Zeile aktualisiert dieselbe ID; gelöschte Zeile bleibt als Waise stehen
  assert.equal(syncVariants(s1.docs, F, () => "neu").created, 0);
  const F2 = { ...F, variants: { ...F.variants, rows: [{ ...F.variants.rows[0], values: { L: "250" } }] } };
  const s2 = syncVariants(s1.docs, F2, () => "neu");
  assert.equal(s2.updated, 1);
  assert.equal(s2.docs[1].id, "v1");
  assert.deepEqual(s2.orphans, ["L-300"]);
  assert.match(checkVariants({ ...F, variants: { columns: ["X"], rows: [{ id: "a", name: "" }] } }).join(" "), /kein Parameter.*Name fehlt/);
  // Regeln: setzen mit Bedingung, unterdrücken, prüfen, Fehler in Regel
  const P = { params: [{ name: "L", expr: "7000" }, { name: "n", expr: "2" }], features: [{ id: "f1", type: "extrude" }, { id: "f2", type: "hole" }],
    rules: [{ ...defaultRule("setzen", "a"), when: "L > 6000", param: "n", value: "ceil(L / 2000)" },
      { ...defaultRule("unterdruecken", "b"), when: "L > 6000", feature: "f2" },
      { ...defaultRule("pruefen", "c"), when: "L > 6000", message: "Länge über Stangenlänge", level: "Fehler" },
      { ...defaultRule("setzen", "d"), param: "fehlt", value: "1" }] };
  const r = applyRules(P);
  assert.equal(r.part.params.find((p) => p.name === "n").expr, "wenn(L > 6000; ceil(L / 2000); 2)");
  assert.deepEqual(r.suppressed, ["f2"]);
  assert.equal(r.part.features[1].ruleOff, true);
  assert.deepEqual(r.messages.map((m) => m.level), ["Fehler", "Fehler"]);
  assert.match(r.messages[1].text, /Länge über Stangenlänge/);
  const r0 = applyRules({ ...P, params: [{ name: "L", expr: "3000" }, { name: "n", expr: "2" }] });
  assert.deepEqual(r0.suppressed, []);
  assert.equal(applyRules({ params: [], features: [] }).messages.length, 0);
  // Makros: prüfen, keine Makros in Makros, Aufzeichnung ohne Suche/Rückgängig
  assert.equal(validateMacros([{ id: "m1", name: "Export", steps: ["file.save"] }]).ok, true);
  assert.equal(validateMacros([{ id: "m1", name: "X", steps: ["gibt.esnicht"] }]).ok, false);
  assert.equal(validateMacros([{ id: "m1", name: "X", steps: [] }]).ok, false);
  assert.equal(validateMacros([{ id: "m1", name: "X", steps: ["file.save"] }, { id: "m2", name: "X", steps: ["file.save"] }]).ok, false);
  assert.equal(recordable("edit.undo"), false);
  assert.equal(recordable("file.save"), true);
  assert.equal(macroCommands([{ id: "m1", name: "Export", steps: ["file.save"] }])[0].id, "macro.m1");
  // Sprache: Deutsch bleibt, Englisch übersetzt, Unbekanntes bleibt stehen
  setLanguage("en");
  assert.equal(t("Skizze"), "Sketch");
  assert.equal(t("Gibt es nicht 123"), "Gibt es nicht 123");
  assert.ok(hasTranslation("Extrusion"));
  setLanguage("de");
  assert.equal(t("Skizze"), "Skizze");
});

test("Abhängigkeiten Stufe 44: Lösung, Grenzen, gerichteter Winkel, Symmetrie, Punkt/Kante, Zylinder an Zylinder, starr, Koordinatensystem", async () => {
  const S = await import("../src/core/asmsolve.js");
  const { placementMatrix: PM, matApply: MA, matApplyDir: MD } = await import("../src/core/geom.js");
  const box = [{ type: "PLANE", normal: [0, 0, 1], point: [0, 0, 10] }, { type: "PLANE", normal: [0, 0, -1], point: [0, 0, 0] }, { type: "PLANE", normal: [1, 0, 0], point: [20, 0, 5] }, { type: "PLANE", normal: [-1, 0, 0], point: [0, 0, 5] }, { type: "CYLINDER", axisP: [5, 5, 0], axisD: [0, 0, 1], radius: 3 }];
  const facesOf = () => box;
  const F = () => ({ id: "F", part: "x", name: "F", pos: [0, 0, 0], rot: [0, 0, 0], fixed: true });
  const M = (pos = [100, 50, 30], rot = [10, 20, 30]) => ({ id: "M", part: "x", name: "M", pos, rot });
  const W = (c, p) => MA(PM(c.pos, c.rot), p), D = (c, d) => MD(PM(c.pos, c.rot), d);
  // Achsen: ausgerichtet bzw. entgegengesetzt
  for (const [sol, sign] of [["ausgerichtet", 1], ["entgegengesetzt", -1]]) {
    const asm = { components: [F(), M()], constraints: [{ id: "k", type: "konzentrisch", solution: sol, a: S.axisRef("F", box[4]), b: S.axisRef("M", box[4]) }] };
    assert.deepEqual(S.solveAssembly(asm, facesOf).errors, {});
    near(D(asm.components[1], [0, 0, 1])[2], sign, 1e-9, sol);
  }
  // Grenzen: Versatz 50 auf 0…20 begrenzt; ohne Ruhelage bleibt eine Lage in den Grenzen stehen
  const g = { components: [F(), M()], constraints: [{ id: "g", type: "gegen", gap: "50", limits: { min: 0, max: 20, rest: true }, a: S.faceRef("F", box[0]), b: S.faceRef("M", box[1]) }] };
  const rg = S.solveAssembly(g, facesOf);
  assert.deepEqual(rg.errors, {});
  near(rg.values.g, 20, 1e-9);
  near(W(g.components[1], [0, 0, 0])[2], 30, 1e-6);
  g.constraints[0].limits.rest = false;
  g.components[1].pos[2] = 25;
  S.solveAssembly(g, facesOf);
  near(g.components[1].pos[2], 25, 1e-6, "bleibt in den Grenzen stehen");
  // Gerichteter Winkel 270° um Z (Referenzvektor = Oberseite der festen Komponente)
  const w = { components: [F(), M([0, 0, 0], [0, 0, 0])], constraints: [{ id: "w", type: "winkel", angle: "270", refVec: { comp: "F", n: [0, 0, 1] }, a: S.faceRef("F", box[2]), b: S.faceRef("M", box[2]) }] };
  assert.deepEqual(S.solveAssembly(w, facesOf).errors, {});
  const nx = D(w.components[1], [1, 0, 0]);
  near(S.signedAngle([1, 0, 0], nx, [0, 0, 1]), 270, 1e-6);
  nearV(nx, [0, -1, 0], 1e-9);
  // Symmetrie: rechte Seite von M liegt spiegelbildlich zur linken von F bezüglich x = 100 (Ebene einer dritten, festen Komponente)
  const sym = { components: [F(), M([300, 0, 0], [0, 0, 0]), { id: "E", part: "e", pos: [0, 0, 0], rot: [0, 0, 0], fixed: true }], constraints: [{ id: "s", type: "symmetrie", a: S.faceRef("F", box[3]), b: S.faceRef("M", box[2]), s: S.faceRef("E", { normal: [1, 0, 0], point: [100, 0, 0] }) }] };
  const fe = (pid) => (pid === "e" ? [{ type: "PLANE", normal: [1, 0, 0], point: [100, 0, 0] }] : box);
  assert.deepEqual(S.solveAssembly(sym, fe).errors, {});
  near(W(sym.components[1], [20, 0, 5])[0], 200, 1e-6);
  // Punkt an Punkt, Punkt auf Fläche, Kante auf Fläche
  const pp = { components: [F(), M()], constraints: [{ id: "p", type: "punkt", a: S.pointRef("F", [20, 0, 10]), b: S.pointRef("M", [0, 0, 0]) }] };
  assert.deepEqual(S.solveAssembly(pp, facesOf).errors, {});
  nearV(W(pp.components[1], [0, 0, 0]), [20, 0, 10], 1e-6);
  const pf = { components: [F(), M()], constraints: [{ id: "q", type: "punktflaeche", gap: "5", a: S.faceRef("F", box[0]), b: S.pointRef("M", [1, 2, 3]) }] };
  assert.deepEqual(S.solveAssembly(pf, facesOf).errors, {});
  near(W(pf.components[1], [1, 2, 3])[2], 15, 1e-6);
  const kf = { components: [F(), M()], constraints: [{ id: "e", type: "kanteflaeche", gap: "0", a: S.faceRef("F", box[0]), b: S.edgeRef("M", [0, 0, 0], [1, 1, 0]) }] };
  assert.deepEqual(S.solveAssembly(kf, facesOf).errors, {});
  near(D(kf.components[1], [1, 1, 0])[2], 0, 1e-9);
  near(W(kf.components[1], [0, 0, 0])[2], 10, 1e-6);
  // Zylinder an Zylinder außen (3 + 3) und innen mit anderem Radius
  const big = [{ type: "CYLINDER", axisP: [0, 0, 0], axisD: [0, 0, 1], radius: 10 }];
  const tz = { components: [F(), M([50, 0, 0], [0, 0, 0])], constraints: [{ id: "t", type: "tangential", gap: "0", a: S.axisRef("F", big[0]), b: S.axisRef("M", box[4]) }] };
  const fb = (pid) => (pid === "big" ? big : box);
  tz.components[0].part = "big";
  assert.deepEqual(S.solveAssembly(tz, fb).errors, {});
  near(Math.hypot(...W(tz.components[1], [5, 5, 0]).slice(0, 2)), 13, 1e-6);
  tz.constraints[0].solution = "innen";
  assert.deepEqual(S.solveAssembly(tz, fb).errors, {});
  near(Math.hypot(...W(tz.components[1], [5, 5, 0]).slice(0, 2)), 7, 1e-6);
  // Starr und Koordinatensystem
  const A = F(), B0 = M();
  const st = { components: [A, B0], constraints: [{ id: "r", type: "starr", rel: S.rigidRelation(A, B0), a: S.frameRef("F"), b: S.frameRef("M") }] };
  A.fixed = false; A.pos = [0, 0, 0];
  B0.pos = [0, 0, 0]; B0.fixed = false;
  const st2 = { ...st, components: [{ ...F(), pos: [10, 0, 0] }, { ...M(), pos: [0, 0, 0] }] };
  assert.deepEqual(S.solveAssembly(st2, facesOf).errors, {});
  nearV(st2.components[1].pos, [110, 50, 30], 1e-6);
  const ko = { components: [{ ...F(), pos: [1, 2, 3], rot: [0, 0, 45] }, M()], constraints: [{ id: "c", type: "koordinaten", a: S.frameRef("F"), b: S.frameRef("M") }] };
  assert.deepEqual(S.solveAssembly(ko, facesOf).errors, {});
  nearV(ko.components[1].pos, [1, 2, 3], 1e-6);
  near(ko.components[1].rot[2], 45, 1e-6);
});

test("Bewegung: Drehung und Drehung–Verschiebung koppeln Gelenke (Stufe 44)", async () => {
  const K = await import("../src/core/kinematik.js");
  const asm = { components: [
    { id: "a", name: "Ritzel", pos: [0, 0, 0], rot: [0, 0, 0], joint: K.defaultJoint([0, 0, 0], [0, 0, 1], { min: -720, max: 720 }) },
    { id: "b", name: "Rad", pos: [50, 0, 0], rot: [0, 0, 0], joint: K.defaultJoint([50, 0, 0], [0, 0, 1], { min: -720, max: 720 }) },
    { id: "c", name: "Zahnstange", pos: [0, 50, 0], rot: [0, 0, 0], joint: K.defaultJoint([0, 50, 0], [1, 0, 0], { kind: "schiebe", min: -100, max: 30 }) },
    { id: "d", name: "ohne Gelenk", pos: [0, 0, 0], rot: [0, 0, 0] },
  ], motions: [{ id: "m1", kind: "drehung", a: "a", b: "b", ratio: "0.5", sense: "gegen" }, { id: "m2", kind: "drehschiebung", a: "b", b: "c", ratio: "60" }] };
  const r = K.coupledJointValues(asm, "a", 90);
  assert.equal(r.values.get("b"), -45);
  assert.equal(r.values.get("c"), -7.5);
  // rückwärts: Zahnstange schieben dreht das Rad
  assert.equal(K.coupledJointValues(asm, "c", 30).values.get("b"), 180);
  // Grenze erreicht
  assert.deepEqual(K.coupledJointValues(asm, "a", -90).clamped, []);
  assert.deepEqual(K.coupledJointValues(asm, "b", 300).clamped, ["Zahnstange"]);
  assert.match(K.motionProblem(asm, { kind: "drehung", a: "a", b: "d", ratio: "1" }), /Dreh- oder Zylindergelenk/);
  assert.match(K.motionProblem(asm, { kind: "drehschiebung", a: "a", b: "b", ratio: "1" }), /Schiebegelenk/);
});

test("Blechregeln: Prüfen, wirksame Werte, Regel lösen, veraltete Kopien (Stufe 44)", async () => {
  const B = await import("../src/core/blechregeln.js");
  assert.equal(B.validateSheetRules(B.DEFAULT_SHEET_RULES).ok, true);
  assert.equal(B.validateSheetRules([...B.DEFAULT_SHEET_RULES, { ...B.DEFAULT_SHEET_RULES[0] }]).ok, false);
  assert.match(B.validateSheetRule({ id: "x", name: "X", material: "S235", t: 0, ri: 1 }).error, /Dicke/);
  const E = (x) => Number(x);
  const rule = B.DEFAULT_SHEET_RULES[3];
  const f = { type: "kantteil", t: "5", ri: "1", k: "0.5", rule: "k", sheetRule: { ...rule } };
  const e1 = B.effectiveSheet(f, E, "S235");
  assert.deepEqual([e1.t, e1.ri, e1.k, e1.material], [2, 3, 0.4, "AlMg3"]);
  const e2 = B.effectiveSheet({ ...f, tFromRule: false, matFromRule: false }, E, "S235");
  assert.deepEqual([e2.t, e2.material], [5, "S235"]);
  assert.equal(B.effectiveSheet({ t: "4", ri: "2" }, E, "S355").t, 4);
  const g = B.applySheetRule({ ...f }, null);
  assert.equal(g.sheetRule, undefined);
  assert.equal(g.t, "2");
  const docs = [{ id: "p", features: [{ id: "k", type: "kantteil", sheetRule: { ...rule, k: 0.3 } }] }];
  assert.equal(B.outdatedSheetRules(docs, B.DEFAULT_SHEET_RULES).length, 1);
});

test("Messen wie Inventor: Achsabstand, Summen, Zweiteinheit (Stufe 47)", async () => {
  const M = await import("../src/core/messen.js");
  const nearV = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
  // Kante (Gerade entlang Z bei x = 70) und Zylinderfläche (Achse Z durch den Ursprung): parallel, 70
  const line = { kind: "edge", type: "LINE", start: [70, 0, 0], end: [70, 0, 30], dir: [0, 0, 1], mid: [70, 0, 15] };
  const cyl = { kind: "face", type: "CYLINDER", axisP: [0, 0, -5], axisD: [0, 0, 1], radius: 15 };
  const a1 = M.axisDistance(line, cyl);
  assert.equal(a1.kind, "parallel"); nearV(a1.value, 70);
  nearV(a1.a[2], 15); nearV(a1.b[0], 0); nearV(a1.b[2], 15);
  // windschief: Achse X auf z = 0 und Achse Y auf z = 40
  const cx = { kind: "edge", type: "CIRCLE", center: [5, 0, 0], axisD: [1, 0, 0] };
  const cy = { kind: "face", type: "CYLINDER", axisP: [0, 3, 40], axisD: [0, 2, 0] };
  const a2 = M.axisDistance(cx, cy);
  assert.equal(a2.kind, "windschief"); nearV(a2.value, 40); nearV(a2.a[0], 0); nearV(a2.b[2], 40);
  // Punkt zu Achse, beide Reihenfolgen
  const pt = { kind: "vertex", type: "POINT", point: [3, 4, 9] };
  nearV(M.axisDistance(pt, cyl).value, 5);
  assert.equal(M.axisDistance(cyl, pt).kind, "punkt");
  assert.equal(M.axisDistance({ kind: "face", type: "PLANE", normal: [0, 0, 1] }, pt), null);
  // Summen
  const S = M.measureSums([{ kind: "edge", length: 10 }, { kind: "edge", length: 5.5 }, { kind: "face", area: 100 }, pt]);
  assert.deepEqual(S, { length: 15.5, area: 100, edges: 2, faces: 1 });
  // Format: Tausenderpunkt, Komma, Zweiteinheit
  const F = M.measureFormat({ dec: 3, angleDec: 2, second: "in" });
  assert.equal(F.len(88), "88,000 mm (3,465 in)");
  assert.equal(F.area(6597.345), "6.597,345 mm² (10,226 in²)");
  assert.equal(F.angle(90), "90,00°");
  assert.equal(M.measureFormat({ dec: 0 }).len(-0.2), "0 mm");
  assert.equal(M.fmtFixed(1234567.891, 1), "1.234.567,9");
});

test("Blech: Ecke schließen, Stanzwerkzeug, Konturwalzen und Trennfuge (Stufe 48)", async () => {
  const { planSheet, punchOutline, rectOutline } = await import("../src/core/blechplus.js");
  const W = await import("../src/core/konturwalzen.js");
  const base = { legs: [40, 100, 40], angles: [90, 90], t: 2, ri: 2, k: 0.33, ref: "aussen", L: 500 };
  const st = (leg, extra = {}) => ({ type: "lasche", edge: "vorne", leg, length: 30, angle: 90, dir: "auf", relief: "rechteck", ...extra });
  const close = (bend, extra = {}) => ({ type: "eckeschliessen", bend, side: "vorne", through: "a", gap: 0.5, ...extra });
  // nur am Steg eine Stirnlasche: sie läuft an beiden Ecken bis 0,5 mm vor die Innenfläche der Seitenschenkel (ri − Spalt)
  const one = planSheet(base, [st(2), close(1), close(2)]);
  const e = one.ends[0];
  near(e.s0, -1.5); near(e.s1, 92 + 1.5);
  assert.deepEqual(e.closed.sort(), ["anfang", "ende"]);
  near(one.flat.bends.at(-1).x1 - one.flat.bends.at(-1).x0, 95, 1e-9, "Biegelinie der Stirnlasche über die Ecken");
  const open = planSheet(base, [st(2)]);
  const area = (pts) => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
  near(area(one.flat.outer) - area(open.flat.outer), 2 * 1.5 * (open.ends[0].ba + open.ends[0].sF), 1e-6, "Abwicklung um die Verlängerung größer");
  // an allen drei Schenkeln: durchlaufende Lasche bis an den Nachbarn, die andere endet mit Spalt an ihr (Höhe 29 ab Mitte)
  const all = planSheet(base, [st(1), st(2), st(3), close(1), close(2, { through: "b" })]);
  near(all.ends[0].H, 29, 1e-9);
  near(all.ends[0].s1, 36 + 1.5); near(all.ends[1].s0, 29 - 3 + 0.5);
  near(all.ends[2].s0, -1.5); near(all.ends[1].s1, 92 - 26.5);
  // Fehler: nicht 90°, Lasche nach außen, ohne Eckfreischnitt, keine Stirnlasche, doppelt
  assert.throws(() => planSheet({ ...base, angles: [60, 90] }, [st(2), close(1)]), /90°-Biegungen/);
  assert.throws(() => planSheet(base, [st(2, { dir: "ab" }), close(1)]), /zeigt vom Nachbarschenkel weg/);
  assert.throws(() => planSheet(base, [st(2, { relief: "keiner" }), close(1)]), /Eckfreischnitt/);
  assert.throws(() => planSheet(base, [st(2), close(1, { side: "hinten" })]), /keine Stirnlasche/);
  assert.throws(() => planSheet(base, [st(2), close(1), close(1)]), /schon geschlossen/);
  assert.throws(() => planSheet(base, [st(2), close(5)]), /Biegung 5 gibt es nicht/);
  // tops liegen über den Freischnitten
  assert.equal(rectOutline([0, 10, 0, 10], [], [], [[4, 6, -1, 11]]).length, 2, "Freischnitt teilt");
  assert.equal(rectOutline([0, 10, 0, 10], [], [], [[4, 6, -1, 11]], [[3, 7, 0, 2]]).length, 1, "Brücke darüber");

  // Stanzwerkzeug: Langloch 30 × 10 mit Halbkreisen, Rechteck, rund als Kreis
  const lo = punchOutline("langloch", 30, 10);
  assert.equal(lo.length, 26);
  near(Math.max(...lo.map((p) => p[0])), 15); near(Math.max(...lo.map((p) => p[1])), 5);
  const hi = punchOutline("langloch", 10, 30, [5, 5]);
  near(Math.max(...hi.map((p) => p[1])), 20); near(Math.min(...hi.map((p) => p[0])), 0);
  assert.equal(punchOutline("rechteck", 10, 20).length, 4);
  const pu = planSheet(base, [{ type: "stanzung", leg: 2, s: [30, 70], y: [100, 100], form: "langloch", a: 30, b: 10 }, { type: "stanzung", leg: 1, s: [20], y: [200], form: "rund", d: 10 }]);
  assert.equal(pu.punch.length, 3);
  assert.equal(pu.flat.holes.length, 2); assert.equal(pu.flat.circles.length, 1);
  near(pu.flat.circles[0].c[0], 20); near(pu.flat.circles[0].d, 10);
  near(Math.min(...pu.flat.holes[0].map((p) => p[0])), pu.plan.legX[1][0] + 15, 1e-9, "Langloch auf Schenkel 2");
  assert.throws(() => planSheet(base, [{ type: "stanzung", leg: 2, s: [5], y: [100], form: "langloch", a: 30, b: 10 }]), /nicht auf dem geraden Stück/);
  assert.throws(() => planSheet(base, [{ type: "stanzung", leg: 2, s: [30], y: [2], form: "rund", d: 10 }]), /außerhalb/);

  // Konturwalzen: Seite der Achse, Fugenwinkel, Abwicklung Zylinder / Kegel / Ring
  assert.equal(W.rollSide([[0, 50], [100, 50]], "x"), 1);
  assert.equal(W.rollSide([[-20, 0], [-30, 100]], "y"), 1);
  assert.throws(() => W.rollSide([[0, -10], [100, 50]], "x"), /Drehachse/);
  near(W.gapAngle(2, 51), (2 / 51) * (180 / Math.PI));
  assert.throws(() => W.gapAngle(0, 51), /Breite/);
  assert.throws(() => W.rollAngle(400), /360/);
  const cyl = W.rollFlat([0, 51], [100, 51], 360 - W.gapAngle(2, 51));
  near(cyl.width, 2 * Math.PI * 51 - 2, 1e-9); near(cyl.height, 100, 1e-9);
  assert.equal(cyl.roll.kind, "zylinder");
  const cone = W.rollFlat([0, 30], [100, 60], 180);
  const s = Math.hypot(30, 100);
  near(cone.roll.R[0], s, 1e-9); near(cone.roll.R[1], 2 * s, 1e-9);
  near(cone.roll.psi, (180 * 30) / s, 1e-9);
  assert.equal(cone.roll.kind, "kegel");
  const ring = W.rollFlat([0, 20], [0, 50], 90);
  assert.equal(ring.roll.kind, "ring"); near(ring.roll.psi, 90, 1e-9); near(ring.roll.R[0], 20, 1e-9);
  assert.ok(area(ring.outer) > 0, "gegen den Uhrzeigersinn");
  near(area(ring.outer), (Math.PI / 4) * (50 * 50 - 20 * 20), 30, "Fläche Ringausschnitt (Sehnen)");
  assert.throws(() => W.rollFlat([0, 51], [100, 51], 360), /Trennfuge/);
});

test("IGES: Bögen, Drehflächen, Randketten, Dateiformat (Stufe 49)", async () => {
  const I = await import("../src/core/iges.js");
  // Kreisbogen 0 … 270° in drei rationalen Abschnitten, Punkte genau auf dem Kreis
  const P = (t) => [5 + 10 * Math.cos(t), 10 * Math.sin(t), 2];
  const arc = I.conicCurve(P, 0, 1.5 * Math.PI);
  assert.equal(arc.poles.length, 7); assert.equal(arc.knots.length, 10);
  for (const t of [0.2, 1.1, 2.7]) { const p = I.evalCurve(arc, t); near(Math.hypot(p[0] - 5, p[1]), 10, 1e-12); near(p[2], 2, 1e-12); }
  nearV(I.evalCurve(arc, 3), P(1.5 * Math.PI), 1e-12);
  // Parameter des Bogens zum Winkel: genau
  const d = 1.2, w = Math.cos(d / 2), q = I.conicCurve((t) => [Math.cos(t), Math.sin(t), 0], 0, d);
  for (const phi of [0.1, 0.5, 1.0]) { const p = I.evalCurve(q, I.arcParam(phi, d)); near(Math.atan2(p[1], p[0]), phi, 1e-12); }
  assert.ok(w > 0);
  // Zylinder, Kugel, Torus als Drehflächen: Punkte auf der Fläche, Abbildung (Winkel, v) → Flächenparameter genau
  const cyl = (u, v) => [10 * Math.cos(u), 10 * Math.sin(u), v];
  const C = I.revolutionSurface(cyl, [0, 2 * Math.PI, 0, 30], "line");
  assert.equal(C.poles.length, 9); assert.equal(C.poles[0].length, 2);
  for (const [u, v] of [[0.3, 4], [2.5, 17], [5.9, 29]]) nearV(I.evalSurface(C, ...C.map(u, v)), cyl(u, v), 1e-9, "Zylinder");
  const sph = (u, v) => [15 * Math.cos(v) * Math.cos(u), 15 * Math.cos(v) * Math.sin(u), 15 * Math.sin(v)];
  const S = I.revolutionSurface(sph, [0, 2 * Math.PI, -Math.PI / 2, Math.PI / 2], "arc");
  for (const [u, v] of [[0.3, -1.2], [3, 0.4], [6, 1.5]]) nearV(I.evalSurface(S, ...S.map(u, v)), sph(u, v), 1e-9, "Kugel");
  const tor = (u, v) => [(20 + 5 * Math.cos(v)) * Math.cos(u), (20 + 5 * Math.cos(v)) * Math.sin(u), 5 * Math.sin(v)];
  const T = I.revolutionSurface(tor, [0, Math.PI / 2, 0, 2 * Math.PI], "arc");
  for (const [u, v] of [[0.3, 1], [1.2, 4], [1.5, 6]]) nearV(I.evalSurface(T, ...T.map(u, v)), tor(u, v), 1e-9, "Torus");
  // Randkette mit Nahtkante (zweimal, gegenläufig): geschlossen ohne gleich zurückzulaufen
  const top = I.conicCurve((t) => [10 * Math.cos(t), 10 * Math.sin(t), 30], 0, 2 * Math.PI), bot = I.conicCurve((t) => [10 * Math.cos(t), 10 * Math.sin(t), 0], 0, 2 * Math.PI);
  const seam = I.lineCurve([10, 0, 30], [10, 0, 0]);
  const ch = I.chainLoop([top, seam, I.reverseCurve(seam), bot]);
  for (let i = 0; i < 4; i++) { const a = I.evalCurve(ch[i], ch[i].t1), b = I.evalCurve(ch[(i + 1) % 4], ch[(i + 1) % 4].t0); near(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), 0, 1e-9, "Kette " + i); }
  assert.equal(ch[2], bot, "nach der Naht erst der untere Kreis");
  // Zahlen und Datei: 80 Zeichen je Zeile, Abschnitte, Zeiger auf Fläche und Randkurven
  assert.equal(I.igesReal(1), "1."); assert.equal(I.igesReal(-0.5), "-0.5"); assert.equal(I.igesReal(1e-7), "1.E-7"); assert.equal(I.igesReal(0), "0.");
  const plane = I.planeSurface((u, v) => [u, v, 0], [0, 100, 0, 50]);
  const sq = [[0, 0, 0], [100, 0, 0], [100, 50, 0], [0, 50, 0]];
  const loop = sq.map((p, i) => ({ ...I.lineCurve(p, sq[(i + 1) % 4]), pc: I.lineCurve(p, sq[(i + 1) % 4]) }));
  const txt = I.writeIges([{ surface: plane, loops: [loop] }], { fileName: "t.igs", date: new Date(2026, 9, 25, 12, 0, 0) });
  const rd = I.readIgesEntities(txt);
  assert.deepEqual(rd.sections, { S: 1, G: rd.sections.G, D: 2 * rd.entities.length, P: rd.sections.P, T: 1 });
  const types = rd.entities.map((e) => e.type);
  assert.deepEqual([...new Set(types)].sort(), [102, 126, 128, 142, 144]);
  assert.equal(types.filter((t) => t === 126).length, 8, "4 Raumkurven + 4 Parameterkurven");
  const ts = rd.entities.find((e) => e.type === 144), cos = rd.entities.find((e) => e.type === 142);
  assert.equal(Number(ts.params[0]), rd.entities.find((e) => e.type === 128).de);
  assert.equal(Number(ts.params[3]), cos.de);
  assert.equal(cos.params[4], "1", "Parameterkurve bevorzugt");
  assert.equal(rd.entities.find((e) => e.type === 128).status, "00010000");
  assert.ok(/20261025\.120000/.test(txt));
  assert.ok(txt.split("\r\n")[1].includes("1H,,1H;,5HPBCAD,5Ht.igs"));
});

test("Schraubenverbindung: Klemmpaket, Länge, Teile, Bohrungen (Stufe 50)", async () => {
  const S = await import("../src/core/schraubverbindung.js");
  // zwei Teile mit Luft, durchgesteckt: Klemmlänge vom ersten bis zum letzten Teil
  const st = S.clampStack([[13, 25], [0, 10]]);
  assert.deepEqual([st.start, st.clamp, st.parts], [0, 25, 2]);
  const g = S.clampStack([[0, 20], [23, 35]], "gewinde");
  assert.deepEqual([g.clamp, g.grip], [23, 12], "das letzte Teil entlang der Achse hat das Gewinde");
  assert.throws(() => S.clampStack([]), /kein Körper/);
  assert.throws(() => S.clampStack([[0, 10]], "gewinde"), /mindestens zwei/);
  // M12 mit Mutter: 25 + 2 · 2,5 + 10,8 + 2 · 1,75 = 44,3 → 45; ohne Scheiben 39,3 → 40
  const b = S.boltStack("M12", 25);
  assert.equal(b.length, 45);
  assert.deepEqual(b.parts.map((p) => p.kind), ["schraube4017", "scheibe", "scheibe", "mutter"]);
  near(b.parts.at(-1).z0, 27.5);
  const n = S.boltStack("M12", 25, { washerHead: false, washerNut: false, kind: "schraube4014" });
  assert.equal(n.length, 40); assert.equal(n.parts[0].kind, "schraube4014"); near(n.parts[0].z0, 0);
  // Gewinde: Einschraubtiefe ≥ d, höchstens Dicke − 1 Gang
  const t = S.boltStack("M12", 15, { joint: "gewinde", grip: 20 });
  assert.equal(t.length, 30); near(t.engage, 12.5);
  assert.throws(() => S.boltStack("M12", 15, { joint: "gewinde", grip: 5 }), /zu dünn/);
  // Bohrungen
  assert.deepEqual(S.boltHoles("M12", st, b).map((x) => x.d), [13.5]);
  const hh = S.boltHoles("M12", { clamp: 15 }, t, "gewinde");
  assert.deepEqual(hh.map((x) => x.d), [13.5, 10.2]);
  near(hh[1].z1, 15 + 12.5 + 3.5);
});

test("Kontaktsatz: freier Bereich bis zum Anstoßen, Video-Format", async () => {
  const K = await import("../src/core/kinematik.js");
  const j = { type: "dreh", min: -90, max: 90, angle: 10 };
  const r = await K.contactRange(j, async (a) => a > 37.3 || a < -60);
  assert.ok(r.hitMin && r.hitMax);
  assert.ok(r.max <= 37.3 && r.max > 37.3 - 0.5, "oben knapp vor dem Kontakt " + r.max);
  assert.ok(r.min >= -60 && r.min < -59.5, "unten knapp vor dem Kontakt " + r.min);
  // ohne Kontakt bleibt der ganze Bereich
  assert.deepEqual(await K.contactRange(j, async () => false), { min: -90, max: 90, hitMin: false, hitMax: false });
  // Stellung am Rand: nur in die andere Richtung prüfen
  const seen = [];
  const e = await K.contactRange({ ...j, angle: 90 }, async (a) => { seen.push(a); return false; });
  assert.ok(seen.every((a) => a < 90)); assert.equal(e.max, 90);
  assert.deepEqual(K.videoFormat((t) => t === "video/webm"), { type: "video/webm", ext: "webm" });
  assert.deepEqual(K.videoFormat((t) => t.startsWith("video/mp4")), { type: "video/mp4;codecs=avc1", ext: "mp4" });
  assert.equal(K.videoFormat(() => false), null);
});

test("iFeature: Auswahl mit Skizzen und Parametern, Bezüge nach außen, Datei prüfen", async () => {
  const I = await import("../src/core/ifeature.js");
  const sk = (id, name, plane = { ref: "XY" }) => ({ id, type: "sketch", name, plane, points: [], entities: [] });
  const part = { params: [{ name: "d", expr: "10" }, { name: "t", expr: "d*2" }, { name: "x", expr: "5" }], features: [
    sk("s0", "Basis"), { id: "e0", type: "extrude", name: "Platte", sketch: "s0", distance: "20" },
    { ...sk("s1", "Loch"), offset: "20" }, { id: "h1", type: "hole", name: "Bohrung", sketch: "s1", diameter: "d", depth: "t", extent: "depth" },
    { id: "f1", type: "fillet", name: "Rundung", mode: "edges", radius: "1", edges: [{ p: [10, 5, 20], type: "CIRCLE" }] },
    { id: "w1", type: "arbeitsebene", name: "Ebene 1", mode: "versatz", base: "XY", distance: "5" }, sk("s2", "Auf Ebene", { ref: "datum", id: "w1" }),
    { id: "sh", type: "shell", name: "Wandung", feature: "e0", thickness: "2" }] };
  const v = I.extractIFeature(part, ["h1", "f1"], { name: "Senkloch" });
  assert.deepEqual(v.features.map((f) => f.id), ["s1", "h1", "f1"]);
  assert.deepEqual(v.params.map((p) => p.name), ["d", "t"], "t braucht d");
  assert.deepEqual(v.anchor.origin, [0, 0, 20], "Lage = erste Skizze samt Abstand");
  assert.ok(I.validateIFeature(JSON.parse(JSON.stringify(v))).ok);
  assert.match(I.validateIFeature({ ...v, version: 2 }).error, /neueren/);
  assert.match(I.validateIFeature({ format: "x" }).error, /Keine/);
  assert.throws(() => I.extractIFeature(part, ["sh"]), /braucht »Platte«/);
  assert.throws(() => I.extractIFeature(part, ["s2"]), /Arbeitsebene/);
  assert.throws(() => I.extractIFeature(part, ["f1"]), /mindestens eine Skizze/);
  assert.throws(() => I.extractIFeature(part, []), /auswählen/);
  // Einsetzen auf XZ: Skizze und Kantenbezug wandern mit, d schon vorhanden → d_2
  let k = 0;
  const r = I.placeIFeature(v, I.targetFrame({ ref: "XZ" }), { values: { d: "12" }, params: [{ name: "d", expr: "3" }], names: ["Loch"], newId: () => "n" + k++ });
  assert.deepEqual(r.features[0].plane, { ref: "face", origin: [0, 20, 0], xDir: [1, 0, 0], normal: [0, -1, 0] });
  assert.equal(r.features[0].offset, "20"); assert.equal(r.features[0].name, "Loch 2");
  assert.equal(r.features[1].sketch, "n0"); assert.equal(r.features[1].diameter, "d_2");
  assert.deepEqual(r.features[2].edges[0].p, [10, 0, 5]);
  assert.deepEqual(r.params, [{ name: "d_2", expr: "12" }, { name: "t", expr: "d_2*2" }]);
  assert.match(I.ifeatureSummary(v), /3 Features \(1 Skizze\), Parameter: d, t/);
});

test("Schweißbaugruppe: Phasen, Kehlnaht-Querschnitt, Flächenpaar", async () => {
  const W = await import("../src/core/schweissbaugruppe.js");
  const fs = [{ id: "s", type: "schweissbaugruppe" }, { id: "c", type: "chamfer" }, { id: "x", type: "extrude", suppressed: true }, { id: "n", type: "naht" }, { id: "h", type: "hole" }, { id: "n2", type: "naht" }];
  assert.deepEqual([...W.weldPhases(fs)], [["c", "vorbereitung"], ["n", "naht"], ["h", "nachbearbeitung"], ["n2", "naht"]]);
  assert.deepEqual(W.phaseCounts(fs), { vorbereitung: 1, naht: 2, nachbearbeitung: 1 });
  assert.equal(W.weldPhases([{ id: "e", type: "extrude" }]).size, 0);
  // rechtwinklige Kehle: Schenkel a·√2, Fläche a²
  const q = W.beadSection([-1, 0, 0], [0, 0, 1], 4);
  near(q.z, 4 * Math.SQRT2, 1e-12); near(q.area, 16, 1e-9); near(q.theta, 90, 1e-9);
  nearV(q.tA, [0, 0, 1]); nearV(q.tB, [-1, 0, 0]);
  // 120°-Kehle: Schenkel a / cos 60° = 2a
  const s = Math.sin(Math.PI / 3), c = Math.cos(Math.PI / 3);
  near(W.beadSection([0, 0, 1], [s, 0, c], 3).z, 3 / Math.cos(Math.PI / 3), 1e-9);
  assert.throws(() => W.beadSection([0, 0, 1], [0, 0, -1], 3), /keine Kehle/);
  assert.throws(() => W.beadSection([0, 0, 1], [1, 0, 0], 0), /> 0/);
  const pair = W.filletPair([{ body: 0, n: [0, 0, -1] }, { body: 0, n: [1, 0, 0] }, { body: 1, n: [0, 0, 1] }]);
  assert.deepEqual(pair.map((x) => x.n), [[1, 0, 0], [0, 0, 1]]);
  assert.equal(W.filletPair([{ body: 0, n: [0, 0, -1] }, { body: 1, n: [0, 0, 1] }]), null);
});
