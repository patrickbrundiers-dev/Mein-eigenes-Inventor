// SolidCraft-Abgleich: Lochblech (F1) und Hüllkörper (F7) im Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createKernel } from "../src/kernel/build.js";
import { rectSketchFeature } from "../src/core/examples.js";
import { lochRaster } from "../src/core/lochblech.js";

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
// Blech 200 × 100 × 2
const blech = [rectSketchFeature("s1", "XY", 0, 0, 0, "200", "100"), { id: "e1", type: "extrude", sketch: "s1", distance: "2", op: "new" }];

test("Lochblech Rv 5-8 mit Rand 10: Lochzahl wie Raster, Volumen um die Löcher kleiner", async () => {
  const res = await K.buildPart(part([...blech, { id: "l", type: "lochblech", faces: [{ p: [100, 50, 2] }], muster: "Rv", d: "5", teilung: "8", rand: "10" }]));
  okAll(res);
  const n = lochRaster({ outer: [[0, 0], [200, 0], [200, 100], [0, 100]], muster: "Rv", d: 5, teilung: 8, rand: 10 }).centers.length;
  assert.ok(n > 100, "Löcher " + n);
  assert.match(res.status.l.info, new RegExp(`Rv 5-8: ${n} Löcher`));
  near(vol(res), 200 * 100 * 2 - n * Math.PI * 6.25 * 2, 2, "Volumen");
  // kein Loch näher als 10 mm am Rand: Außenmaße bleiben, Randstreifen voll
  const b = res.bodies[0].shape.boundingBox.bounds;
  near(b[1][0] - b[0][0], 200, 1e-3);
});

test("Lochblech Quadrat- und Langloch, Fehler bei zu großem Rand", async () => {
  const q = await K.buildPart(part([...blech, { id: "l", type: "lochblech", faces: [{ p: [100, 50, 2] }], muster: "Qg", d: "10", teilung: "15", rand: "5" }]));
  okAll(q);
  const nq = Number(q.status.l.info.match(/(\d+) Löcher/)[1]);
  near(vol(q), 200 * 100 * 2 - nq * 100 * 2, 1e-2, "Quadratlöcher");
  const lv = await K.buildPart(part([...blech, { id: "l", type: "lochblech", faces: [{ p: [100, 50, 2] }], muster: "Lv", d: "5", laenge: "20", teilung: "10", rand: "8" }]));
  okAll(lv);
  const nl = Number(lv.status.l.info.match(/(\d+) Löcher/)[1]);
  near(vol(lv), 200 * 100 * 2 - nl * (15 * 5 + Math.PI * 6.25) * 2, 0.5, "Langlöcher");
  const zu = await K.buildPart(part([...blech, { id: "l", type: "lochblech", faces: [{ p: [100, 50, 2] }], muster: "Rv", d: "5", teilung: "8", rand: "60" }]));
  assert.match(zu.status.l.error, /Kein ganzes Loch/);
});

test("Hüllkörper: Quader um zwei Körper mit Zugabe, zählt nicht zur Masse", async () => {
  const b2 = [rectSketchFeature("s2", "XY", 0, 300, 0, "50", "40"), { id: "e2", type: "extrude", sketch: "s2", distance: "30", op: "new" }];
  const res = await K.buildPart(part([...blech, ...b2, { id: "h", type: "huelle", bodies: [], zugabe: "5" }]));
  okAll(res);
  const hb = res.bodies.find((b) => b.meta?.huelle);
  assert.ok(hb);
  assert.equal(hb.meta.density, 0);
  near(R.measureVolume(hb.shape), 360 * 110 * 40, 1, "Hüllvolumen");
  assert.match(res.status.h.info, /360 × 110 × 40 mm/);
});
