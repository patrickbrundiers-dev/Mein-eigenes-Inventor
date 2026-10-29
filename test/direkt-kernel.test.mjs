// Direktbearbeitung (Fläche verschieben, drehen, löschen, Größe): Geometrie-Kern-Tests
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
// Quader 100 × 40 × 10 (x 0…100, y 0…40, z 0…10)
const block = [rectSketchFeature("s1", "XY", 0, 0, 0, "100", "40"), { id: "e1", type: "extrude", sketch: "s1", distance: "10" }];
const top = { p: [50, 20, 10] }, right = { p: [100, 20, 5] };
const D = (x) => ({ id: "d", type: "direkt", ...x });

test("Fläche verschieben: Normale, Weltachse, Messen ab", async () => {
  const up = await K.buildPart(part([...block, D({ op: "verschieben", faces: [top], distance: "5" })]));
  okAll(up);
  near(vol(up), 100 * 40 * 15, 1e-3, "heraus");
  const dn = await K.buildPart(part([...block, D({ op: "verschieben", faces: [right], richtung: "X", distance: "-30" })]));
  okAll(dn);
  near(vol(dn), 70 * 40 * 10, 1e-3, "längs X zurück");
  // Messen ab: Oberseite soll 25 von der Unterseite (z = 0, Normale −Z) liegen
  const mf = await K.buildPart(part([...block, D({ op: "verschieben", faces: [top], distance: "25", from: { p: [50, 20, 0], n: [0, 0, -1] } })]));
  okAll(mf);
  near(mf.bodies[0].shape.boundingBox.bounds[1][2], 25, 1e-6, "Messen ab");
  assert.match(mf.status.d.info, /gemessen ab/);
  // in der Fläche verschieben ändert nichts → Fehler
  const bad = await K.buildPart(part([...block, D({ op: "verschieben", faces: [top], richtung: "X", distance: "5" })]));
  assert.equal(bad.status.d.ok, false);
});

test("Fläche verschieben mit schräger Nachbarfläche (Fase) verlängert die Fase", async () => {
  const ch = { id: "c", type: "chamfer", mode: "edges", edges: [{ p: [50, 40, 10], type: "LINE" }], radius: "4" };
  const base = await K.buildPart(part([...block, ch]));
  okAll(base);
  const v0 = vol(base);
  const up = await K.buildPart(part([...block, ch, D({ op: "verschieben", faces: [{ p: [50, 10, 10] }], distance: "5" })]));
  okAll(up);
  // Oberseite (Breite 36) wandert um 5 hoch, die 45°-Fase wächst mit: dazu kommt 100 · 5 · (36 − 5/2)
  near(vol(up) - v0, 100 * 5 * (36 - 2.5), 1e-2, "Fase verlängert");
});

test("Fläche drehen um Kante und um Achse U", async () => {
  // Oberseite um die Kante y = 0, z = 10 (Achse X) um 5° nach oben (Keil dazu)
  const r = await K.buildPart(part([...block, D({ op: "drehen", faces: [top], achse: "kante", edge: { p: [0, 0, 10], d: [1, 0, 0] }, angle: "5" })]));
  okAll(r);
  const wedge = 100 * 40 * 40 * Math.tan((5 * Math.PI) / 180) / 2;
  near(Math.abs(vol(r) - 40000), wedge, 1, "Keil");
  // um die Mitte gedreht: Volumen bleibt
  const m = await K.buildPart(part([...block, D({ op: "drehen", faces: [top], achse: "V", angle: "5" })]));
  okAll(m);
  near(vol(m), 40000, 1, "um Mitte");
});

test("Fläche löschen: Bohrung, Rundung, Fase", async () => {
  const sk = rectSketchFeature("s1", "XY", 0, 0, 0, "100", "40");
  // Durchgangsbohrung Ø10 und Sackloch Ø8 × 4 tief
  const hole = { id: "z", type: "regelkoerper", kind: "zylinder", dims: { D: "10", H: "10" }, pos: ["30", "20", "0"], axis: "Z", op: "cut" };
  const blind = { id: "z2", type: "regelkoerper", kind: "zylinder", dims: { D: "8", H: "4" }, pos: ["70", "20", "6"], axis: "Z", op: "cut" };
  const dh = await K.buildPart(part([...block, hole, blind, D({ op: "loeschen", faces: [{ p: [35, 20, 5] }, { p: [74, 20, 8] }, { p: [70, 20, 6] }] })]));
  okAll(dh);
  near(vol(dh), 40000, 1e-2, "Bohrungen gefüllt");
  // Zapfen löschen
  const pin = { id: "z", type: "regelkoerper", kind: "zylinder", dims: { D: "10", H: "20" }, pos: ["30", "20", "10"], axis: "Z", op: "join" };
  const dp = await K.buildPart(part([...block, pin, D({ op: "loeschen", faces: [{ p: [35, 20, 20] }, { p: [30, 20, 30] }] })]));
  okAll(dp);
  near(vol(dp), 40000, 1e-2, "Zapfen weg");
  const fil = { id: "f", type: "fillet", mode: "edges", edges: [{ p: [50, 40, 10], type: "LINE" }], radius: "4" };
  const b = await K.buildPart(part([sk, block[1], fil]));
  okAll(b);
  const del = await K.buildPart(part([sk, block[1], fil, D({ op: "loeschen", faces: [{ p: [50, 40 - 4 + 4 * Math.SQRT1_2, 10 - 4 + 4 * Math.SQRT1_2] }] })]));
  okAll(del);
  near(vol(del), 40000, 1e-2, "Rundung weg");
  const ch = { id: "c", type: "chamfer", mode: "edges", edges: [{ p: [50, 40, 10], type: "LINE" }], radius: "4" };
  const dc = await K.buildPart(part([sk, block[1], ch, D({ op: "loeschen", faces: [{ p: [50, 38, 8] }] })]));
  okAll(dc);
  near(vol(dc), 40000, 1e-2, "Fase weg");
  // tragende Fläche löschen geht nicht
  const bad = await K.buildPart(part([...block, D({ op: "loeschen", faces: [top] })]));
  assert.equal(bad.status.d.ok, false);
});

test("Größe: Bohrung und Bolzen auf neuen Durchmesser, ebene Fläche mit Versatz", async () => {
  const hole = { id: "z", type: "regelkoerper", kind: "zylinder", dims: { D: "10", H: "10" }, pos: ["30", "20", "0"], axis: "Z", op: "cut" };
  const h0 = 40000 - Math.PI * 25 * 10;
  const big = await K.buildPart(part([...block, hole, D({ op: "groesse", faces: [{ p: [35, 20, 5] }], sizeMode: "durchmesser", size: "16" })]));
  okAll(big);
  near(vol(big), 40000 - Math.PI * 64 * 10, 1e-2, "Bohrung Ø16");
  const small = await K.buildPart(part([...block, hole, D({ op: "groesse", faces: [{ p: [35, 20, 5] }], sizeMode: "radius", size: "3" })]));
  okAll(small);
  near(vol(small), 40000 - Math.PI * 9 * 10, 1e-2, "Bohrung R3");
  const off = await K.buildPart(part([...block, hole, D({ op: "groesse", faces: [{ p: [35, 20, 5] }], sizeMode: "offset", size: "1" })]));
  okAll(off);
  near(vol(off), 40000 - Math.PI * 16 * 10, 1e-2, "Bohrung Versatz 1 nach innen");
  void h0;
  const pin = { id: "z", type: "regelkoerper", kind: "zylinder", dims: { D: "10", H: "20" }, pos: ["30", "20", "10"], axis: "Z", op: "join" };
  const pb = await K.buildPart(part([...block, pin, D({ op: "groesse", faces: [{ p: [35, 20, 20] }], sizeMode: "durchmesser", size: "6" })]));
  okAll(pb);
  near(vol(pb), 40000 + Math.PI * 9 * 20, 1e-2, "Bolzen Ø6");
  const pl = await K.buildPart(part([...block, D({ op: "groesse", faces: [top], size: "2" })]));
  okAll(pl);
  near(vol(pl), 100 * 40 * 12, 1e-3, "ebene Fläche Versatz");
});
