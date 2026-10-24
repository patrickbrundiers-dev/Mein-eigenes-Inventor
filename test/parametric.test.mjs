// Parametrik und Feature-Baum (P1-A): Folgefehler mit Ursache, Änderung vorgelagerter Features, deterministischer Neuaufbau
// (benötigt replicad + OpenCascade, läuft in CI)
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

const vol = (res) => res.bodies.reduce((s, b) => s + R.measureVolume(b.shape), 0);
const bad = (res) => Object.entries(res.status).filter(([, s]) => !s.ok && !s.suppressed);
const pointSketch = (id, offset, pts) => ({
  id, type: "sketch", name: "Punkte", plane: { ref: "XY" }, offset: String(offset),
  points: pts.map((p, i) => ({ id: id + "h" + i, x: p[0], y: p[1] })),
  entities: pts.map((_, i) => ({ id: id + "pe" + i, type: "point", p: id + "h" + i })),
  constraints: [],
});
// Platte Breite × 40 × Dicke, Bohrung Ø5 bei (10|20), 4-fach Muster in X (Abstand 20), Fase 1 mm an allen Z-Kanten
const plate = (breite, dicke = "10") => ({
  id: "pl", kind: "part", name: "Platte",
  params: [{ name: "Breite", expr: String(breite) }, { name: "Dicke", expr: dicke }],
  features: [
    { ...rectSketchFeature("s1", "XY", 0, 0, 0, "Breite", "40"), name: "Skizze Platte" },
    { id: "e1", type: "extrude", name: "Extrusion", sketch: "s1", distance: "Dicke" },
    pointSketch("s2", "Dicke", [[10, 20]]),
    { id: "h1", type: "hole", name: "Bohrung", sketch: "s2", diameter: "5", extent: "through" },
    { id: "pt", type: "pattern", name: "Muster", kind: "linear", feature: "h1", dir: "X", count: "4", spacing: "20" },
    { id: "c1", type: "chamfer", name: "Fase", mode: "dir", dir: "Z", radius: "1" },
  ],
});
const expected = (B, T = 10) => B * 40 * T - 4 * Math.PI * 6.25 * T - 4 * 0.5 * T;

test("Vorgelagertes Maß ändern: Folge-Features bleiben gültig und passen sich an", async () => {
  for (const B of [100, 120, 80]) {
    const res = await K.buildPart(plate(B));
    assert.deepEqual(bad(res), [], `Breite ${B}`);
    assert.ok(Math.abs(vol(res) - expected(B)) < 0.5, `Breite ${B}: ${vol(res)} ≠ ${expected(B)}`);
  }
  const thick = await K.buildPart(plate(100, "15"));
  assert.deepEqual(bad(thick), []);
  assert.ok(Math.abs(vol(thick) - expected(100, 15)) < 0.5, "Dicke 15");
});

test("Neuaufbau ist deterministisch (mit und ohne Zwischenspeicher)", async () => {
  const sig = (res) => res.bodies.map((b) => { const bb = b.shape.boundingBox.bounds.flat(); return [R.measureVolume(b.shape), ...bb].map((x) => x.toFixed(6)).join(","); }).join("|");
  const a = await K.buildPart(plate(100), { useCache: false });
  const b = await K.buildPart(plate(100), { useCache: false });
  const c = await K.buildPart(plate(100));
  assert.equal(sig(a), sig(b));
  assert.equal(sig(a), sig(c));
});

test("Folgefehler nennen die Ursache", async () => {
  const msg = async (prj, id) => (await K.buildPart(prj, { useCache: false })).status[id].error;
  // Skizze fehlerhaft → Extrusion meldet Abhängigkeit
  const broken = plate(100); broken.features[0].offset = "gibtsnicht";
  assert.match(await msg(broken, "e1"), /hängt von »Skizze Platte« ab, das fehlerhaft ist/);
  // Skizze unterdrückt
  const supp = plate(100); supp.features[2].suppressed = true;
  assert.match(await msg(supp, "h1"), /hängt von »Punkte« ab, das unterdrückt ist/);
  // Bezug steht weiter unten
  const order = plate(100); const [h] = order.features.splice(3, 1); order.features.splice(1, 0, h);
  assert.match(await msg(order, "h1"), /»Punkte« steht im Baum weiter unten/);
  // Bezug gelöscht
  const gone = plate(100); gone.features.splice(3, 1);
  assert.match(await msg(gone, "pt"), /Bezugs-Feature fehlt \(gelöscht\?\)/);
});
