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
