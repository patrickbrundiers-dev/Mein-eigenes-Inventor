// SolidCraft-Optionsabgleich: Extrusion (Verjüngung, Versatz, Bis, Dünnwand, Fläche, Zielkörper)
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
const part = (features) => ({ id: "p" + Math.random(), kind: "part", name: "Test", params: [], features });
const sk = rectSketchFeature("s1", "XY", 0, 0, 0, "100", "60");
const bb = (res) => res.bodies[0].shape.boundingBox.bounds;

test("Extrusion: Versatz Start und Verjüngung", async () => {
  const a = await K.buildPart(part([sk, { id: "e", type: "extrude", sketch: "s1", distance: "20", startOffset: "5", op: "new" }]));
  okAll(a);
  near(bb(a)[0][2], 5, 1e-6); near(bb(a)[1][2], 25, 1e-6);
  const t = await K.buildPart(part([sk, { id: "e", type: "extrude", sketch: "s1", distance: "20", taper: "5", op: "new" }]));
  okAll(t);
  const tan = Math.tan((5 * Math.PI) / 180), g = 20 * tan;
  // positiv: oben größer – Pyramidenstumpf von 100×60 auf (100+2g)×(60+2g)
  const A1 = 100 * 60, A2 = (100 + 2 * g) * (60 + 2 * g);
  near(vol(t), (20 / 3) * (A1 + A2 + Math.sqrt(A1 * A2)), 5, "Verjüngung +5°");
  const t2 = await K.buildPart(part([sk, { id: "e", type: "extrude", sketch: "s1", distance: "20", taper: "-5", op: "new" }]));
  okAll(t2);
  assert.ok(vol(t2) < 100 * 60 * 20 - 100, "Verjüngung −5° kleiner");
});

test("Extrusion: Bis Fläche (parallel und schräg) mit Abstand darüber hinaus", async () => {
  const p = await K.buildPart(part([sk, { id: "e", type: "extrude", sketch: "s1", mode: "bis", to: { p: [0, 0, 30], n: [0, 0, 1] }, toOffset: "2", op: "new" }]));
  okAll(p);
  near(bb(p)[1][2], 32, 1e-6);
  // schräge Ebene durch (0,0,30) mit Normale (1,0,1): Höhe fällt in x
  const q = await K.buildPart(part([sk, { id: "e", type: "extrude", sketch: "s1", mode: "bis", to: { p: [0, 0, 30], n: [1, 0, 1] }, op: "new" }]));
  okAll(q);
  // z = 30 − x über x 0…100 → Höhe 30…−70: Teil oberhalb 0 nur bis x = 30; Volumen = 60 · 30²/2
  near(vol(q), 60 * 30 * 30 / 2, 1, "schräg");
});

test("Extrusion: Dünnwand innen, mittig, beidseitig", async () => {
  const i = await K.buildPart(part([sk, { id: "e", type: "extrude", sketch: "s1", distance: "10", thin: true, thickness: "2", side: "innen", op: "new" }]));
  okAll(i);
  near(vol(i), (100 * 60 - 96 * 56) * 10, 1);
  const m = await K.buildPart(part([sk, { id: "e", type: "extrude", sketch: "s1", distance: "10", thin: true, thickness: "2", side: "mitte", op: "new" }]));
  okAll(m);
  near(bb(m)[1][0] - bb(m)[0][0], 102, 1e-3);
  const b = await K.buildPart(part([sk, { id: "e", type: "extrude", sketch: "s1", distance: "10", thin: true, thickness: "2", side: "beidseitig", thickness2: "3", op: "new" }]));
  okAll(b);
  near(bb(b)[1][0] - bb(b)[0][0], 106, 1e-3);
});

test("Extrusion: ebene Körperfläche und Zielkörper", async () => {
  const base = [sk, { id: "e", type: "extrude", sketch: "s1", distance: "10", op: "new" }];
  const f = await K.buildPart(part([...base, { id: "x", type: "extrude", source: "flaeche", faces: [{ p: [50, 30, 10] }], distance: "5", op: "join" }]));
  okAll(f);
  near(bb(f)[1][2], 15, 1e-6);
  near(vol(f), 100 * 60 * 15, 1);
  // zwei Körper, Differenz nur am zweiten
  const sk2 = rectSketchFeature("s2", "XY", 0, 200, 0, "100", "60");
  const sk3 = rectSketchFeature("s3", "XY", 0, -50, 10, "400", "40");
  const two = [...base, sk2, { id: "e2", type: "extrude", sketch: "s2", distance: "10", op: "new" }, sk3];
  const all = await K.buildPart(part([...two, { id: "c", type: "extrude", sketch: "s3", distance: "20", mode: "symmetric", op: "cut" }]));
  const only = await K.buildPart(part([...two, { id: "c", type: "extrude", sketch: "s3", distance: "20", mode: "symmetric", op: "cut", targets: ["e2"] }]));
  okAll(all); okAll(only);
  assert.ok(vol(only) - vol(all) > 30000, "nur ein Körper geschnitten " + (vol(only) - vol(all)));
});

test("Rohr entlang Pfad, Skalieren gleich und je Achse", async () => {
  const path = { id: "pp", type: "sketch", name: "Pfad", plane: { ref: "XZ" }, offset: "0", points: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 0, y: 100 }], entities: [{ id: "l", type: "line", p1: "a", p2: "b" }], constraints: [] };
  const r = await K.buildPart(part([path, { id: "w", type: "sweep", profil: "rohr", path: "pp", diameter: "20", wall: "2", op: "new" }]));
  okAll(r);
  near(vol(r), Math.PI * (100 - 64) * 100, 1, "Rohr");
  const base = [sk, { id: "e", type: "extrude", sketch: "s1", distance: "10", op: "new" }];
  const g = await K.buildPart(part([...base, { id: "v", type: "verschieben", scale: "2" }]));
  okAll(g);
  near(vol(g), 100 * 60 * 10 * 8, 1);
  const a = await K.buildPart(part([...base, { id: "v", type: "verschieben", scaleMode: "achsen", scaleXYZ: ["2", "1", "0.5"], scaleOrigin: ["0", "0", "10"] }]));
  okAll(a);
  near(vol(a), 100 * 60 * 10, 1);
  near(bb(a)[1][0], 200, 1e-6); near(bb(a)[0][2], 5, 1e-6); near(bb(a)[1][2], 10, 1e-6);
});

test("Rundung: Sehnenbreite, weich, Zwischenradien; Fase zwei Abstände und Winkel", async () => {
  const base = [sk, { id: "e", type: "extrude", sketch: "s1", distance: "40", op: "new" }];
  const v0 = 100 * 60 * 40;
  const edge = [{ p: [50, 60, 40] }]; // obere hintere Kante entlang X
  const removed = async (feat) => { const r = await K.buildPart(part([...base, { id: "r", ...feat }])); okAll(r); return v0 - vol(r); };
  const loss = (r) => 100 * r * r * (1 - Math.PI / 4);
  near(await removed({ type: "fillet", radius: "5", edges: edge }), loss(5), 0.5, "Kreis");
  near(await removed({ type: "fillet", kind: "sehne", radius: String(5 * Math.SQRT2), edges: edge }), loss(5), 0.5, "Sehne 90°");
  const weich = await removed({ type: "fillet", kind: "kurve", radius: "5", edges: edge });
  assert.ok(weich > 0 && Math.abs(weich - loss(5)) < loss(5), "weich " + weich);
  const mid = await removed({ type: "fillet", variable: true, radius: "5", radius2: "5", mid: [["0.5", "15"]], edges: edge });
  assert.ok(mid > loss(5) * 1.5 && mid < loss(15), "Zwischenradius " + mid);
  near(await removed({ type: "chamfer", chamferMode: "zwei", radius: "4", distance2: "10", edges: edge }), 100 * 4 * 10 / 2, 0.5, "zwei Abstände");
  near(await removed({ type: "chamfer", chamferMode: "winkel", radius: "6", chamferAngle: "45", edges: edge }), 100 * 6 * 6 / 2, 0.5, "Winkel");
});

test("Kollision: Mindestabstand und nur gegen", () => {
  const a = R.makeBaseBox(10, 10, 10), b = R.makeBaseBox(10, 10, 10).translate([12, 0, 0]), c = R.makeBaseBox(10, 10, 10).translate([5, 0, 0]);
  const list = [{ key: "a", shape: a }, { key: "b", shape: b }, { key: "c", shape: c }];
  const plain = K.collisions(list);
  assert.deepEqual(plain.map((x) => [x.a, x.b].sort().join()).sort(), ["a,c", "b,c"]);
  const near = K.collisions(list, { clearance: 3 });
  const ab = near.find((x) => [x.a, x.b].sort().join() === "a,b");
  assert.ok(ab && Math.abs(ab.gap - 2) < 1e-6, JSON.stringify(near));
  const only = K.collisions(list, { against: ["a"] });
  assert.deepEqual(only.map((x) => [x.a, x.b].sort().join()), ["a,c"]);
});
