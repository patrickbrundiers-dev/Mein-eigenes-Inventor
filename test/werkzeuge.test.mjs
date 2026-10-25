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
