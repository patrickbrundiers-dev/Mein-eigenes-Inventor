// Fusion-Abgleich G2–G4: Geometrie-Kern-Tests (replicad + OpenCascade)
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createKernel } from "../src/kernel/build.js";
import { rectSketchFeature } from "../src/core/examples.js";
import { extractProfiles } from "../src/core/sketch.js";

const require = createRequire(import.meta.url);
const R = await import("replicad");
const ocInit = (await import("replicad-opencascadejs")).default;
const OC = await ocInit({ locateFile: () => require.resolve("replicad-opencascadejs/wasm") });
R.setOC(OC);
const K = createKernel(R);
const vol = (res) => res.bodies.reduce((s, b) => s + R.measureVolume(b.shape), 0);
const okAll = (res) => assert.deepEqual(Object.entries(res.status).filter(([, s]) => !s.ok), [], "Fehler");

/** Platte 200 × 60 × 5 und eine Skizze mit Text auf der Oberseite */
function textPart(text, extra = {}, partExtra = {}) {
  const plate = rectSketchFeature("s1", "XY", "0", 0, 0, 200, 60, "Platte");
  const sk = { id: "s2", type: "sketch", name: "Text", plane: "XY", offset: "5", points: [{ id: "tp", x: 10, y: 20 }], entities: [{ id: "tx", type: "text", p: "tp", text, h: 20, angle: 0, style: "normal", align: "links", ...extra }], constraints: [] };
  return { id: "pt" + Math.random(), kind: "part", name: "Schild", number: "PB-7", material: "S235", params: [], ...partExtra, features: [plate, { id: "e1", type: "extrude", sketch: "s1", distance: "5", mode: "normal" }, sk, { id: "e2", type: "extrude", sketch: "s2", distance: "1", mode: "reverse", op: "cut" }] };
}

test("Text in der Skizze: Gravur 1 mm tief nimmt Volumen weg, Löcher in »A« und »8« bleiben stehen", async () => {
  const res = await K.buildPart(textPart("A8"));
  okAll(res);
  const full = 200 * 60 * 5;
  const cut = full - vol(res);
  // Fläche der Konturen (Löcher abgezogen) × 1 mm Tiefe; »A« und »8« haben Innenkonturen
  const prof = extractProfiles(textPart("A8").features[2]);
  assert.equal(prof.regions.length, 2);
  assert.deepEqual(prof.regions.map((r) => r.holes.length), [1, 2]);
  const area = prof.regions.reduce((a, r) => a + r.area, 0);
  assert.ok(Math.abs(cut - area) < area * 0.02, `Gravurvolumen ${cut} ≈ Fläche ${area}`);
  // Gleicher Text fett: mehr Material weg
  const bold = await K.buildPart(textPart("A8", { style: "fett" }));
  okAll(bold);
  assert.ok(full - vol(bold) > cut * 1.15, "fett graviert mehr");
});

test("Text in der Skizze: Platzhalter {teilenummer} folgt der Teilenummer (Zwischenspeicher)", async () => {
  const p = textPart("{teilenummer}");
  const a = await K.buildPart(p);
  okAll(a);
  const va = vol(a);
  p.number = "PB-7777";
  const b = await K.buildPart(p);
  okAll(b);
  assert.ok(vol(b) < va - 50, "längere Nummer graviert mehr: " + (va - vol(b)));
});

test("Bauteilende (FU5): Features hinter der Markierung werden nicht gerechnet", async () => {
  const sk = { id: "s", type: "sketch", name: "S", plane: "XY", offset: "0", points: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }, { id: "c", x: 100, y: 50 }, { id: "d", x: 0, y: 50 }],
    entities: [["a", "b"], ["b", "c"], ["c", "d"], ["d", "a"]].map(([p1, p2], i) => ({ id: "l" + i, type: "line", p1, p2 })), constraints: [] };
  const part = { id: "ende", kind: "part", name: "Ende", params: [], features: [sk, { id: "e", type: "extrude", sketch: "s", distance: "10" }, { id: "e2", type: "extrude", sketch: "s", distance: "20", op: "join" }] };
  const full = await K.buildPart(part);
  part.endAfter = "e";
  const cut = await K.buildPart(part);
  const vol = (r) => r.bodies.reduce((v, b) => v + R.measureVolume(b.shape), 0);
  assert.ok(Math.abs(vol(cut) - 100 * 50 * 10) < 1e-3, "nur die erste Extrusion");
  assert.ok(vol(full) > vol(cut));
  assert.deepEqual(cut.status.e2, { ok: true, rolledBack: true });
});

test("Blechkasten (FU19): Volumen = Abwicklungsfläche × Dicke, Ecken aufgetrennt, abgewickelt gleiches Volumen", async () => {
  const kasten = { id: "bk", type: "blechkasten", L: "300", B: "200", H: "60", t: "2", ri: "2", k: "0.5", walls: "vorne; rechts; hinten; links", through: "x", gap: "0.5", pos: ["10", "20", "0"] };
  const mk = (f) => ({ id: "pk" + Math.random(), kind: "part", name: "Kasten", material: "S235", params: [], features: [f] });
  const res = await K.buildPart(mk(kasten));
  okAll(res);
  const b = res.bodies[0];
  assert.ok(K.shapeValid(b.shape), "Körper gültig");
  const [lo, hi] = b.shape.boundingBox.bounds;
  assert.ok(Math.abs(lo[0] - 10) < 1e-3 && Math.abs(hi[0] - 310) < 1e-3 && Math.abs(lo[1] - 20) < 1e-3 && Math.abs(hi[2] - 60) < 1e-3, JSON.stringify([lo, hi]));
  // K = 0,5: neutrale Faser in der Mitte → Volumen gefaltet = Abwicklungsfläche × t (bis auf Rundung der Bögen)
  const fm = b.meta.sheet.flatModel;
  const v = vol(res);
  assert.ok(Math.abs(v - fm.area * 2) < fm.area * 2 * 0.003, `Volumen ${v} ≈ ${fm.area * 2}`);
  assert.equal(fm.bends.length, 4);
  assert.match(res.status.bk.info, /4 Ecke\(n\) aufgetrennt/);
  const flat = await K.buildPart(mk({ ...kasten, view: "abgewickelt" }));
  okAll(flat);
  assert.ok(Math.abs(vol(flat) - fm.area * 2) < 1e-3 * fm.area);
  // offen unten: gleiche Hülle, Boden oben
  const down = await K.buildPart(mk({ ...kasten, open: "unten", walls: "vorne; hinten" }));
  okAll(down);
  assert.ok(Math.abs(down.bodies[0].shape.boundingBox.bounds[1][2] - 60) < 1e-3);
});

test("In Blech umwandeln: Quader wird Blechkasten mit seinen Außenmaßen, anderer Körper wird abgelehnt", async () => {
  const quader = rectSketchFeature("s1", "XY", "0", 0, 0, 250, 150, "Quader");
  const mk = (extra) => ({ id: "pq" + Math.random(), kind: "part", name: "Umwandeln", material: "S235", params: [], features: [quader, { id: "e1", type: "extrude", sketch: "s1", distance: "80", mode: "normal" }, ...extra] });
  const res = await K.buildPart(mk([{ id: "bk", type: "blechkasten", from: "e1", t: "1.5", ri: "1.5", k: "0.33", walls: "vorne; rechts; hinten; links", through: "y", gap: "0.5" }]));
  okAll(res);
  assert.equal(res.bodies.length, 1, "Quader ersetzt");
  const [lo, hi] = res.bodies[0].shape.boundingBox.bounds;
  assert.ok(Math.abs(hi[0] - lo[0] - 250) < 1e-3 && Math.abs(hi[1] - lo[1] - 150) < 1e-3 && Math.abs(hi[2] - 80) < 1e-3, JSON.stringify([lo, hi]));
  assert.match(res.status.bk.info, /aus Körper umgewandelt/);
  // Quader mit Bohrung ist kein Quader mehr
  const hole = { id: "h1", type: "extrude", sketch: "s9", distance: "80", mode: "reverse", op: "cut" };
  const sk = { id: "s9", type: "sketch", plane: "XY", offset: "80", points: [{ id: "c", x: 125, y: 75 }], entities: [{ id: "k", type: "circle", c: "c", r: 20 }], constraints: [] };
  const bad = await K.buildPart(mk([sk, hole, { id: "bk", type: "blechkasten", from: "e1", t: "1.5", ri: "1.5", walls: "vorne" }]));
  assert.match(bad.status.bk.error, /nur quaderförmige Körper/);
});
