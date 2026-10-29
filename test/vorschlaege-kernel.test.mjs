// Vorschläge nach 0.28 im Geometrie-Kern: Teile-Zwischenspeicher der Generatoren (N5)
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createKernel } from "../src/kernel/build.js";
import { defaultGenerator } from "../src/core/generator.js";

const require = createRequire(import.meta.url);
const R = await import("replicad");
const ocInit = (await import("replicad-opencascadejs")).default;
R.setOC(await ocInit({ locateFile: () => require.resolve("replicad-opencascadejs/wasm") }));
const K = createKernel(R);

test("N5: Generator neu berechnen – unveränderte Teile aus dem Zwischenspeicher, gleiches Ergebnis", async () => {
  const f = { id: "g", ...defaultGenerator("gelaender") };
  const part = (params) => ({ id: "p-cache", kind: "part", name: "Geländer", params: [], features: [{ ...f, params }] });
  const vol = (res) => res.bodies.map((b) => [b.name, Math.round(R.measureVolume(b.shape))]).sort();
  let t = Date.now();
  const a = await K.buildPart(part(f.params), { useCache: false, validate: false });
  const t1 = Date.now() - t;
  t = Date.now();
  const b = await K.buildPart(part({ ...f.params }), { useCache: false, validate: false });
  const t2 = Date.now() - t;
  assert.deepEqual(vol(b), vol(a), "gleiche Körper");
  assert.ok(t2 < t1 / 3, `zweiter Lauf schneller (${t1} → ${t2} ms)`);
  // Füllung ändern: Pfosten/Handlauf bleiben, Ergebnis wie ohne Speicher
  const c = await K.buildPart(part({ ...f.params, fill: "quer" }), { useCache: false, validate: false });
  const d = await K.buildPart({ ...part({ ...f.params, fill: "quer" }), id: "p-frisch" }, { useCache: false, validate: false });
  assert.deepEqual(vol(c), vol(d));
});

test("N9: Bohrungsangabe und Gewinde fürs 3D-Fenster", async () => {
  const { rectSketchFeature } = await import("../src/core/examples.js");
  const pts = { id: "s2", type: "sketch", name: "Punkte", plane: { ref: "XY" }, offset: "10", points: [{ id: "a", x: 20, y: 20 }, { id: "b", x: 60, y: 20 }], entities: [{ id: "pa", type: "point", p: "a" }, { id: "pb", type: "point", p: "b" }], constraints: [] };
  const part = { id: "p-n9", kind: "part", name: "Platte", params: [], features: [
    rectSketchFeature("s1", "XY", 0, 0, 0, "80", "40"), { id: "e1", type: "extrude", sketch: "s1", distance: "10" }, pts,
    { id: "h1", type: "hole", sketch: "s2", thread: "M8", extent: "depth", depth: "8" },
  ] };
  const res = await K.buildPart(part, { useCache: false, validate: false });
  assert.equal(res.holeNotes.length, 1);
  const n = res.holeNotes[0];
  assert.equal(n.text, "2× M8, 8 tief");
  assert.equal(n.points.length, 2);
  assert.equal(n.threadR, 4);
  assert.deepEqual(n.dir.map((x) => x + 0), [0, 0, -1], "in den Körper hinein");
  // unterdrückt → keine Angabe
  part.features[3].suppressed = true;
  assert.equal((await K.buildPart({ ...part, id: "p-n9b" }, { useCache: false, validate: false })).holeNotes.length, 0);
});
