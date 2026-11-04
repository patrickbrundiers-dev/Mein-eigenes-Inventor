import test from "node:test";
import assert from "node:assert/strict";
const near = (a, b, t = 1e-6) => assert.ok(Math.abs(a - b) <= t, `${a} ≠ ${b}`);

const setup = async () => {
  const K = await import("../src/core/kinematik.js");
  const J = (p, d, o) => K.defaultJoint(p, d, o);
  const asm = { components: [
    { id: "a", name: "Antrieb", pos: [0, 0, 0], rot: [0, 0, 0], joint: J([0, 0, 0], [0, 0, 1], { min: -720, max: 720 }) },
    { id: "b", name: "Rad", pos: [80, 0, 0], rot: [0, 0, 0], joint: J([80, 0, 0], [0, 0, 1], { min: -720, max: 720 }) },
    { id: "s", name: "Stößel", pos: [0, 50, 0], rot: [0, 0, 0], joint: J([0, 50, 0], [0, 1, 0], { kind: "schiebe", min: -200, max: 200 }) },
    { id: "t", name: "Tisch", pos: [0, -50, 0], rot: [0, 0, 0], joint: J([0, -50, 0], [1, 0, 0], { kind: "schiebe", min: -500, max: 500 }) },
  ], motions: [] };
  return { K, asm };
};

test("Bewegungsarten E3: Zahnrad, Zahnstange, Schraube, Nocken, Verknüpfung", async () => {
  const { K, asm } = await setup();
  const one = (m, comp = "a", v = 90) => { asm.motions = [{ id: "m", ...m }]; return K.coupledJointValues(asm, comp, v).values; };
  // Zahnrad 20:40 außen → halbe Drehzahl, gegensinnig
  near(one({ kind: "zahnrad", a: "a", b: "b", z1: "20", z2: "40", sense: "gegen" }).get("b"), -45);
  // Zahnstange m=2, z=20: je Umdrehung π·40 mm → 90° = 10π
  near(one({ kind: "zahnstange", a: "a", b: "t", modul: "2", z: "20" }).get("t"), 10 * Math.PI);
  // Schraube Steigung 1,5 (Komma erlaubt): 360° → 1,5 mm; rückwärts aus dem Weg
  near(one({ kind: "schraube", a: "a", b: "t", steigung: "1,5" }, "a", 360).get("t"), 1.5);
  near(one({ kind: "schraube", a: "a", b: "t", steigung: "1.5" }, "t", 3).get("a"), 720);
  // Nocken: Hub 10·(1−cos w)/2 → bei 180° 10 mm, bei 90° 5 mm, absolut (nicht relativ)
  near(one({ kind: "nocken", a: "a", b: "s", kurve: "10*(1-cos(w))/2" }, "a", 180).get("s"), 10);
  near(one({ kind: "nocken", a: "a", b: "s", kurve: "10*(1-cos(w))/2", offset: "2" }, "a", 90).get("s"), 7);
  // Nocken lässt sich nicht rückwärts treiben
  assert.equal(one({ kind: "nocken", a: "a", b: "s", kurve: "w/10" }, "s", 5).has("a"), false);
  // Verknüpfung zwischen zwei Schiebegelenken
  near(one({ kind: "linear", a: "s", b: "t", ratio: "-2" }, "s", 10).get("t"), -20);
  // Prüfungen
  assert.match(K.motionProblem(asm, { kind: "nocken", a: "a", b: "b", kurve: "w" }), /Schiebegelenk/);
  assert.match(K.motionProblem(asm, { kind: "nocken", a: "a", b: "s", kurve: "" }), /Nockenkurve/);
  assert.match(K.motionProblem(asm, { kind: "zahnrad", a: "a", b: "b", z1: "20", z2: "0" }), /Zähnezahlen/);
  assert.equal(K.motionProblem(asm, { kind: "linear", a: "a", b: "t", ratio: "3" }), null);
  for (const [k] of K.MOTION_KINDS) assert.ok(K.MOTION_DEFAULTS[k], k);
});

test("Bewegungsuntersuchung E3: Stellungen, Bahn, Punkt anfahren, Diagramm", async () => {
  const { asm } = await setup();
  const S = await import("../src/core/bewegungsstudie.js");
  asm.components[0].joint.min = 0; asm.components[0].joint.max = 360;
  asm.motions = [{ id: "m", kind: "zahnrad", a: "a", b: "b", z1: "20", z2: "40", sense: "gegen" }];
  const fr = S.studyFrames(asm, "a", 36);
  assert.equal(fr.length, 37);
  near(fr.at(-1).values.get("b"), -180);
  // Punkt auf Radius 100 am Antrieb: Bahn ist ein Vollkreis, Länge ≈ 2π·100
  const path = S.tracePath(fr, "a", [100, 0, 0]);
  near(S.pathLength(path), 2 * Math.PI * 100, 2);
  near(path[9][1], 100, 1e-6);
  // Punkt anfahren: [100,0,0] soll zu [0,100,0] → 90°
  const r = S.seekJointValue(asm, "a", "a", [100, 0, 0], [0, 100, 0]);
  near(r.value, 90, 1e-3); near(r.dist, 0, 1e-3);
  // Gekoppelt: Punkt am Rad anfahren über den Antrieb
  const r2 = S.seekJointValue(asm, "a", "b", [120, 0, 0], [80, -40, 0]);
  near(r2.value, 180, 1e-2);
  const ser = S.chartSeries(asm, fr);
  assert.deepEqual(ser.map((s) => s.name), ["Antrieb", "Rad"]);
  const svg = S.motionChartSvg(fr.map((f) => f.a), ser, { xLabel: "Antrieb <°>" });
  assert.match(svg, /^<svg/); assert.equal((svg.match(/<polyline/g) || []).length, 2); assert.match(svg, /&lt;°&gt;/);
});

test("Merkmale in Bauteil verschieben E3: Abhängige und Bezüge gehen mit, gemeinsame Skizze bleibt", async () => {
  const A = await import("../src/core/ableiten.js");
  let n = 0; const newId = () => "n" + ++n;
  const src = [
    { id: "s1", type: "sketch", name: "Skizze1" },
    { id: "e1", type: "extrude", name: "Extrusion1", sketch: "s1" },
    { id: "s2", type: "sketch", name: "Skizze2" },
    { id: "e2", type: "extrude", name: "Extrusion2", sketch: "s2" },
    { id: "f2", type: "fillet", name: "Rundung", feature: "e2" },
    { id: "e3", type: "extrude", name: "Extrusion3", sketch: "s1" },
  ];
  const dst = [{ id: "x", type: "sketch", name: "Skizze2" }];
  const r = A.moveFeaturesToPart(src, "e2", dst, { newId });
  assert.deepEqual(r.src.map((f) => f.id), ["s1", "e1", "e3"]);
  assert.deepEqual(r.moved, ["Skizze2 (2)", "Extrusion2", "Rundung"]);
  const [s, e, f] = r.dst.slice(1);
  assert.equal(e.sketch, s.id); assert.equal(f.feature, e.id);
  // Skizze1 wird noch von e3 gebraucht: bleibt im Quellteil und kommt als Kopie mit
  const r2 = A.moveFeaturesToPart(src, "e1", [], { newId });
  assert.deepEqual(r2.src.map((f) => f.id), ["s1", "s2", "e2", "f2", "e3"]);
  assert.deepEqual(r2.moved, ["Skizze1", "Extrusion1"]);
  assert.equal(src.length, 6);
});
