// Werkzeuge ab Stufe 36: Geometrie-Kern-Tests (replicad + OpenCascade), getrennt von kernel.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createKernel } from "../src/kernel/build.js";
import { rectSketchFeature } from "../src/core/examples.js";

const require = createRequire(import.meta.url);
const R = await import("replicad");
const ocInit = (await import("replicad-opencascadejs")).default;
const OC = await ocInit({ locateFile: () => require.resolve("replicad-opencascadejs/wasm") });
R.setOC(OC);
const K = createKernel(R);

const near = (a, b, tol, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b} (±${tol})`);
const vol = (res) => res.bodies.reduce((s, b) => s + R.measureVolume(b.shape), 0);
const okAll = (res) => {
  const bad = Object.entries(res.status).filter(([, s]) => !s.ok);
  assert.equal(bad.length, 0, "Fehler: " + JSON.stringify(bad));
};
const bbox = (res) => {
  const b = res.bodies[0].shape.boundingBox.bounds;
  return b;
};
function part(features, params = []) {
  return { id: "p" + Math.random(), kind: "part", name: "Test", params, features };
}

test("Arbeitsebene: Skizze darauf, Spiegeln an ihr, Muster um Arbeitsachse (Stufe 36)", async () => {
  // Arbeitsebene 30 über XY mit Parameter, Quader darauf
  const sk = rectSketchFeature("s1", "XY", 0, 0, 0, "20", "10");
  sk.plane = { ref: "datum", id: "w1" };
  const res = await K.buildPart(part([
    { id: "w1", type: "arbeitsebene", mode: "versatz", base: "XY", distance: "h" },
    sk,
    { id: "e1", type: "extrude", sketch: "s1", distance: "5" },
  ], [{ name: "h", expr: "30" }]));
  okAll(res);
  const b = bbox(res);
  near(b[0][2], 30, 1e-6, "Unterkante"); near(b[1][2], 35, 1e-6, "Oberkante");
  assert.equal(res.datums.length, 1);
  assert.match(res.status.w1.info, /Ursprung \(0; 0; 30\)/);

  // Spiegeln an einer Arbeitsebene x = 50: zweiter Körper bei 80…100
  const base = [rectSketchFeature("s1", "XY", 0, 0, 0, "20", "10"), { id: "e1", type: "extrude", sketch: "s1", distance: "5" }];
  const res2 = await K.buildPart(part([
    { id: "w1", type: "arbeitsebene", mode: "versatz", base: "YZ", distance: "50" }, ...base,
    { id: "m", type: "mirror", plane: "datum:w1", separate: true },
  ]));
  okAll(res2);
  near(vol(res2), 2 * 1000, 1e-3, "Spiegeln");
  const xs = res2.bodies.map((x) => x.shape.boundingBox.bounds[0][0]).sort((p, q) => p - q);
  near(xs[1], 80, 1e-6, "gespiegelt");

  // Kreismuster um Arbeitsachse parallel Z durch (10, 5): Volumen ×4
  const res3 = await K.buildPart(part([
    { id: "a1", type: "arbeitsachse", mode: "parallel", dir: "Z", point: { x: "100", y: "0", z: "0" } }, ...base,
    { id: "pt", type: "pattern", kind: "circular", feature: "e1", axis: "datum:a1", count: "4", angle: "360" },
  ]));
  okAll(res3);
  near(vol(res3), 4 * 1000, 1e-3, "Kreismuster");
  const all = res3.bodies.map((x) => x.shape.boundingBox.bounds);
  near(Math.max(...all.map((q) => q[1][0])), 200, 1e-6, "um Arbeitsachse gedreht");

  // Fehlende Arbeitsebene: Skizze meldet einen klaren Fehler
  const sk2 = rectSketchFeature("s9", "XY", 0, 0, 0, "20", "10");
  sk2.plane = { ref: "datum", id: "fehlt" };
  const res4 = await K.buildPart(part([sk2]));
  assert.match(res4.status.s9.error, /Arbeitsebene/);
});

const P = (id, x, y) => ({ id, x, y });
const L = (id, p1, p2, construction) => ({ id, type: "line", p1, p2, ...(construction ? { construction: true } : {}) });
const circleSketch = (id, plane, cx, cy, r, offset = "0") => ({ id, type: "sketch", name: id, plane: { ref: plane }, offset, points: [P(id + "c", cx, cy)], entities: [{ id: id + "k", type: "circle", c: id + "c", r }], constraints: [] });

test("Sweeping, Erhebung, Spirale und Muster entlang Pfad (Stufe 37)", async () => {
  // Sweeping: Kreis Ø10 auf YZ entlang einer L-förmigen Linie (100 + 50, Ecke rechtwinklig »right«)
  const path = { id: "pf", type: "sketch", name: "Pfad", plane: { ref: "XY" }, offset: "0", points: [P("a", 0, 0), P("b", 100, 0), P("c", 100, 50)], entities: [L("l1", "a", "b"), L("l2", "b", "c")], constraints: [] };
  const res = await K.buildPart(part([circleSketch("pr", "YZ", 0, 0, 5), path, { id: "sw", type: "sweep", sketch: "pr", path: "pf" }]));
  okAll(res);
  const A = Math.PI * 25;
  near(vol(res), A * 150, A * 150 * 0.03, "Sweeping");
  assert.match(res.status.sw.info, /Pfad 150 mm/);
  // Bogenpfad: Viertelkreis R50 → Torusviertel π r² · (π/2 · 50)
  const arcPath = { id: "pa", type: "sketch", name: "Bogen", plane: { ref: "XY" }, offset: "0", points: [P("m", 0, 50), P("s", 0, 0), P("e", 50, 50)], entities: [{ id: "ar", type: "arc", c: "m", p1: "s", p2: "e" }], constraints: [] };
  const resA = await K.buildPart(part([circleSketch("pr", "YZ", 0, 0, 5), arcPath, { id: "sw", type: "sweep", sketch: "pr", path: "pa" }]));
  okAll(resA);
  near(vol(resA), A * Math.PI * 25, A * Math.PI * 25 * 0.01, "Sweeping Bogen");

  // Erhebung: Quadrat 40 unten, Quadrat 20 in 30 mm Höhe → Pyramidenstumpf h/3·(A1 + A2 + √(A1·A2))
  const lo = rectSketchFeature("q1", "XY", 0, -20, -20, "40", "40");
  const hi = rectSketchFeature("q2", "XY", 30, -10, -10, "20", "20");
  const res2 = await K.buildPart(part([lo, hi, { id: "lf", type: "loft", sketches: ["q1", "q2"], ruled: true }]));
  okAll(res2);
  near(vol(res2), (30 / 3) * (1600 + 400 + 800), 0.5, "Erhebung");
  const bad = await K.buildPart(part([lo, { id: "lf", type: "loft", sketches: ["q1"] }]));
  assert.match(bad.status.lf.error, /zwei Skizzen/);

  // Spirale: Kreis r=2 im Abstand 20 von der y-Achse der XZ-Skizze, Steigung 10, 3 Umdrehungen
  const coil = circleSketch("ck", "XZ", 20, 0, 2);
  const res3 = await K.buildPart(part([coil, { id: "sp", type: "spirale", sketch: "ck", axis: "y", pitch: "10", turns: "3" }]));
  okAll(res3);
  // Volumen ≈ Profilfläche × Weg des Schwerpunkts (Pappus, Steigung klein gegen Umfang)
  const wire = 3 * Math.hypot(2 * Math.PI * 20, 10);
  near(vol(res3), Math.PI * 4 * wire, Math.PI * 4 * wire * 0.03, "Spirale");
  assert.match(res3.status.sp.info, /3 Umdrehungen, Steigung 10 mm, Höhe 30 mm/);
  const bb = res3.bodies[0].shape.boundingBox.bounds;
  // y-Achse der XZ-Skizze ist die Welt-Z-Achse: Höhe ≈ 30 + 2·2
  near(bb[1][2] - bb[0][2], 34, 1, "Spiralhöhe");

  // Muster entlang Pfad: Bohrung Ø6 in Platte, 5 Stück gleichmäßig auf einer Linie 0…80
  const plate = rectSketchFeature("s1", "XY", 0, -10, -10, "100", "20");
  const hole = { id: "s2", type: "sketch", name: "Punkt", plane: { ref: "XY" }, offset: "10", points: [P("h", 0, 0)], entities: [{ id: "pt", type: "point", p: "h" }], constraints: [] };
  const line = { id: "pl", type: "sketch", name: "Linie", plane: { ref: "XY" }, offset: "0", points: [P("a", 0, 0), P("b", 80, 0)], entities: [L("l", "a", "b")], constraints: [] };
  const res4 = await K.buildPart(part([plate, { id: "e1", type: "extrude", sketch: "s1", distance: "10" }, hole, { id: "h1", type: "hole", sketch: "s2", diameter: "6", extent: "through" }, line,
    { id: "pp", type: "pattern", kind: "path", feature: "h1", path: "pl", count: "5" }]));
  okAll(res4);
  near(vol(res4), 20000 - 5 * Math.PI * 9 * 10, 1, "Muster entlang Pfad");
  assert.match(res4.status.pp.info, /5 Exemplare/);
});
