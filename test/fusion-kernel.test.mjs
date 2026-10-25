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
