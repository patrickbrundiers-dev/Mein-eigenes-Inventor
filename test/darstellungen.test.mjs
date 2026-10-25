// Positionsdarstellungen (FU8) und Explosion in Schritten (FU9)
import { test } from "node:test";
import assert from "node:assert/strict";
import { capturePosition, applyPosition, positionDiff, positionedAssembly, nextPositionName, explosionOffsets, explodedAssembly, autoExplosion, validStep, dirLabel, viewStateKey, assemblyForView } from "../src/core/darstellungen.js";
import { defaultJoint } from "../src/core/kinematik.js";

const near = (a, b, tol = 1e-6) => a.every((x, i) => Math.abs(x - b[i]) < tol);

function tor() {
  // Pfosten fest, Flügel mit Drehgelenk um die Z-Achse durch (0,0,0), Griff hängt per Abhängigkeit am Flügel
  return {
    id: "a", kind: "assembly", components: [
      { id: "p", part: "x", pos: [0, 0, 0], rot: [0, 0, 0], fixed: true },
      { id: "f", part: "y", pos: [100, 0, 0], rot: [0, 0, 0], joint: defaultJoint([0, 0, 0], [0, 0, 1], { min: 0, max: 90 }) },
      { id: "g", part: "z", pos: [900, 0, 0], rot: [0, 0, 0] },
    ],
    constraints: [{ id: "k", type: "gegen", a: { comp: "f" }, b: { comp: "g" } }],
  };
}

test("Position speichern, Gelenk verstellen, Position wieder einstellen – Folgeteile gehen mit", () => {
  const asm = tor();
  const zu = { id: "zu", name: "Tor zu", values: capturePosition(asm) };
  assert.deepEqual(zu.values, { f: { angle: 0 } });
  const auf = { id: "auf", name: "Tor offen 90°", values: { f: { angle: 90 } } };
  asm.positions = [zu, auf];
  assert.deepEqual(positionDiff(asm, zu), []);
  assert.deepEqual(positionDiff(asm, auf), ["f"]);
  assert.equal(applyPosition(asm, auf), 1);
  const f = asm.components[1], g = asm.components[2];
  assert.equal(f.joint.angle, 90);
  assert.ok(near(f.pos, [0, 100, 0]), JSON.stringify(f.pos));
  assert.ok(near(g.pos, [0, 900, 0]), "Griff dreht mit: " + JSON.stringify(g.pos));
  assert.equal(applyPosition(asm, auf), 0, "schon eingestellt");
  applyPosition(asm, zu);
  assert.ok(near(f.pos, [100, 0, 0]) && near(g.pos, [900, 0, 0]));
});

test("Werte außerhalb des Bereichs werden begrenzt; Kopie lässt das Original", () => {
  const asm = tor();
  asm.positions = [{ id: "x", name: "zu weit", values: { f: { angle: 200 } } }];
  const c = positionedAssembly(asm, "x");
  assert.notEqual(c, asm);
  assert.equal(c.components[1].joint.angle, 90);
  assert.equal(asm.components[1].joint.angle, 0);
  assert.equal(positionedAssembly(asm, "fehlt"), asm);
  assert.equal(nextPositionName(asm), "Position 2");
});

test("Explosion: Schritte addieren sich, Teilschritt für die Wiedergabe", () => {
  const asm = tor();
  asm.explosion = { steps: [
    { id: "1", comps: ["g"], dir: [0, 0, 2], dist: 100 },
    { id: "2", comps: ["g", "f"], dir: [1, 0, 0], dist: 50 },
    { id: "kaputt", comps: [], dir: [0, 0, 1], dist: 10 },
  ] };
  let o = explosionOffsets(asm);
  assert.ok(near(o.get("g"), [50, 0, 100]) && near(o.get("f"), [50, 0, 0]));
  assert.equal(o.has("p"), false);
  o = explosionOffsets(asm, 1);
  assert.ok(near(o.get("g"), [0, 0, 100]) && !o.has("f"));
  o = explosionOffsets(asm, 2, 0.5);
  assert.ok(near(o.get("g"), [25, 0, 100]));
  const ex = explodedAssembly(asm);
  assert.ok(near(ex.components[2].pos, [950, 0, 100]));
  assert.ok(near(asm.components[2].pos, [900, 0, 0]), "Original bleibt");
  assert.equal(validStep({ comps: ["a"], dir: [0, 0, 0], dist: 1 }), false);
});

test("Explosion automatisch: Richtung von der Mitte weg, Fixiertes bleibt, äußere Teile weiter", () => {
  const asm = { components: [{ id: "base", fixed: true }, { id: "top" }, { id: "top2" }, { id: "side" }] };
  const items = [
    { id: "base", center: [0, 0, 0], size: 100 },
    { id: "top", center: [0, 0, 100], size: 50 },
    { id: "top2", center: [0, 0, 200], size: 50 },
    { id: "side", center: [-300, 0, 100], size: 50 },
  ];
  const steps = autoExplosion(asm, items, { gap: 50 });
  assert.ok(!steps.some((s) => s.comps.includes("base")));
  const of = (id) => steps.find((s) => s.comps.includes(id));
  assert.deepEqual(of("top2").dir, [0, 0, 1]);
  assert.deepEqual(of("side").dir, [-1, 0, 0]);
  assert.ok(steps.indexOf(of("top2")) < steps.indexOf(of("top")), "weiter außen zuerst");
  assert.ok(of("top").dist > of("top2").dist - 1e-9);
  assert.equal(dirLabel([0, 0, -3]), "−Z");
  assert.equal(dirLabel([1, 1, 0]), "0.71 / 0.71 / 0");
});

test("Darstellung der Zeichnungsansicht: Position, dann Explosion", () => {
  const asm = tor();
  asm.positions = [{ id: "auf", name: "auf", values: { f: { angle: 90 } } }];
  asm.explosion = { steps: [{ id: "1", comps: ["g"], dir: [0, 0, 1], dist: 100 }] };
  assert.equal(viewStateKey({}), "|0");
  assert.equal(viewStateKey({ state: { position: "auf", explode: true } }), "auf|1");
  const v = assemblyForView(asm, { state: { position: "auf", explode: true } });
  assert.ok(near(v.components[2].pos, [0, 900, 100]), JSON.stringify(v.components[2].pos));
  assert.equal(assemblyForView(asm, {}), asm);
});
