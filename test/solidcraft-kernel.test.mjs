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

test("3D-Spline als Sweep-Pfad und Schnittkurve der Skizzenebene (E1)", async () => {
  const prof = { id: "s1", type: "sketch", plane: { ref: "YZ" }, offset: "0", points: [{ id: "c", x: 0, y: 0 }], entities: [{ id: "k", type: "circle", c: "c", r: 5 }], constraints: [] };
  const res = await K.buildPart(part([prof,
    { id: "p3", type: "skizze3d", points: [{ x: "0", y: "0", z: "0" }, { x: "100", y: "0", z: "0" }, { x: "200", y: "40", z: "30" }, { x: "300", y: "40", z: "30" }], spline: true },
    { id: "sw", type: "sweep", sketch: "s1", path: "p3", op: "new" }]));
  okAll(res);
  assert.match(res.status.p3.info, /Spline/);
  const len = res.paths3d[0].pts.reduce((s, p, i, a) => (i ? s + Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1], p[2] - a[i - 1][2]) : 0), 0);
  near(vol(res), Math.PI * 25 * len, Math.PI * 25 * len * 0.02, "Volumen ≈ Querschnitt × Länge");
  // Schnittkurve: Blech 200 × 100 × 2, Ebene x = 50 (YZ verschoben) → Rechteck 100 × 2
  const r2 = await K.buildPart(part(blech));
  const n = [1, 0, 0], c = 50;
  const loops = K.sectionLoops(K.cutAtPlane(r2.bodies[0].shape, n, c), n, c, { dir: [-1, 0, 0], up: [0, 0, 1] });
  assert.equal(loops.length, 1);
  const xs = loops[0].map((q) => q[0]), ys = loops[0].map((q) => q[1]);
  near(Math.max(...xs) - Math.min(...xs), 100, 1e-3, "Breite");
  near(Math.max(...ys) - Math.min(...ys), 2, 1e-3, "Dicke");
});

test("Kurve auf Fläche: Isokurve auf Zylinder, Linie auf Zylinder projiziert (E1)", async () => {
  // Zylinder Ø 40, Höhe 100 (Kreis auf XY, extrudiert)
  const cyl = [{ id: "c1", type: "sketch", plane: { ref: "XY" }, offset: "0", points: [{ id: "m", x: 0, y: 0 }], entities: [{ id: "k", type: "circle", c: "m", r: 20 }], constraints: [] }, { id: "e1", type: "extrude", sketch: "c1", distance: "100", op: "new" }];
  const iso = await K.buildPart(part([...cyl, { id: "f", type: "flaechenkurve", faces: [{ p: [20, 0, 50] }], art: "iso", richtung: "u", wert: "0.5" }]));
  okAll(iso);
  const pts = iso.paths3d[0].pts;
  for (const q of pts) near(Math.hypot(q[0], q[1]), 20, 0.01, "auf dem Mantel");
  // Linie auf YZ-Ebene bei x = 50, waagrecht in Y von -10 bis 10 auf Höhe z = 30 → auf den Mantel projiziert (Richtung x)
  const ln = { id: "s2", type: "sketch", plane: { ref: "YZ" }, offset: "50", points: [{ id: "a", x: -10, y: 30 }, { id: "b", x: 10, y: 30 }], entities: [{ id: "l", type: "line", p1: "a", p2: "b" }], constraints: [] };
  const pr = await K.buildPart(part([...cyl, ln, { id: "f", type: "flaechenkurve", faces: [{ p: [20, 0, 50] }], art: "projektion", sketch: "s2" }]));
  okAll(pr);
  const P = pr.paths3d[0].pts;
  for (const q of P) { near(Math.hypot(q[0], q[1]), 20, 0.05, "auf dem Mantel"); near(q[2], 30, 1e-6, "Höhe bleibt"); }
  assert.match(pr.status.f.info, /Projiziert/);
});
