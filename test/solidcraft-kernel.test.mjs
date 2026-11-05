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

test("Flächen (E2): Extrusion, Rotation, Loft, Füllung, Offset, Verbund aufheben und nähen", async () => {
  const area = (res, kind = "flaeche") => res.bodies.filter((b) => b.kind === kind).reduce((s, b) => s + R.measureArea(b.shape), 0);
  // offene Linie 100 mm auf XY, 30 mm hoch extrudiert → 3000 mm²
  const ln = { id: "s1", type: "sketch", plane: { ref: "XY" }, offset: "0", points: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }], entities: [{ id: "l", type: "line", p1: "a", p2: "b" }], constraints: [] };
  const ex = await K.buildPart(part([ln, { id: "f", type: "freiflaeche", art: "extrusion", sketch: "s1", distance: "30" }]));
  okAll(ex);
  near(area(ex), 3000, 1e-6, "Extrusion");
  assert.equal(ex.bodies[0].meta.density, 0);
  // Linie parallel zur Y-Achse im Abstand 20 (XZ-Ebene), um Z gedreht → Zylindermantel 2π·20·50
  const lz = { id: "s2", type: "sketch", plane: { ref: "XZ" }, offset: "0", points: [{ id: "a", x: 20, y: 0 }, { id: "b", x: 20, y: 50 }], entities: [{ id: "l", type: "line", p1: "a", p2: "b" }], constraints: [] };
  const rot = await K.buildPart(part([lz, { id: "f", type: "freiflaeche", art: "rotation", sketch: "s2", axis: "y", angle: "360" }]));
  okAll(rot);
  near(area(rot), 2 * Math.PI * 20 * 50, 0.5, "Rotation");
  // Regelfläche zwischen zwei parallelen Linien im Abstand 40 → 100 × 40
  const ln2 = { ...ln, id: "s3", offset: "40" };
  const lo = await K.buildPart(part([ln, ln2, { id: "f", type: "freiflaeche", art: "regel", sections: ["s1", "s3"] }]));
  okAll(lo);
  near(area(lo), 4000, 1e-3, "Regelfläche");
  // Füllung eines Quadrats 50 × 50 → 2500
  const sq = rectSketchFeature("q", "XY", 0, 0, 0, "50", "50");
  const fu = await K.buildPart(part([sq, { id: "f", type: "freiflaeche", art: "fuellung", sketch: "q" }]));
  okAll(fu);
  near(area(fu), 2500, 0.5, "Füllung");
  // Quader zerlegen, Flächen wieder nähen → Volumen wie vorher
  const box = [rectSketchFeature("b", "XY", 0, 0, 0, "10", "20"), { id: "e", type: "extrude", sketch: "b", distance: "30", op: "new" }];
  const zer = await K.buildPart(part([...box, { id: "a", type: "freiflaeche", art: "aufheben" }]));
  okAll(zer);
  assert.equal(zer.bodies.filter((b) => b.kind === "flaeche").length, 6);
  const ne = await K.buildPart(part([...box, { id: "a", type: "freiflaeche", art: "aufheben" }, { id: "n", type: "freiflaeche", art: "naehen" }]));
  okAll(ne);
  assert.equal(ne.bodies.length, 1);
  assert.equal(ne.bodies[0].kind, "solid");
  near(Math.abs(R.measureVolume(ne.bodies[0].shape)), 6000, 1e-3, "genäht = Quader");
  // Offset der Deckfläche um 5 → gleiche Fläche 10 × 20 in z = 35
  const of = await K.buildPart(part([...box, { id: "o", type: "freiflaeche", art: "offset", faces: [{ p: [5, 10, 30] }], distance: "5" }]));
  okAll(of);
  near(area(of), 200, 1e-3, "Offset");
  const um = await K.buildPart(part([ln, { id: "f", type: "freiflaeche", art: "extrusion", sketch: "s1", distance: "30" }, { id: "u", type: "freiflaeche", art: "umkehren" }]));
  okAll(um);
});

test("Flächen (E2): Begrenzung, Verbindung, Trimmen aufheben, Teilen, Dicke, Verrundung", async () => {
  const area = (res, kind = "flaeche") => res.bodies.filter((b) => b.kind === kind).reduce((s, b) => s + R.measureArea(b.shape), 0);
  const L = (id, plane, off, a, b) => ({ id, type: "sketch", plane: { ref: plane }, offset: off, points: [{ id: "a", x: a[0], y: a[1] }, { id: "b", x: b[0], y: b[1] }], entities: [{ id: "l", type: "line", p1: "a", p2: "b" }], constraints: [] });
  // Rand aus 4 Linien eines 30 × 20-Rechtecks auf XY → Begrenzungsfläche 600
  const r4 = [L("k1", "XY", "0", [0, 0], [30, 0]), L("k2", "XY", "0", [30, 0], [30, 20]), L("k3", "XY", "0", [30, 20], [0, 20]), L("k4", "XY", "0", [0, 20], [0, 0])];
  const be = await K.buildPart(part([...r4, { id: "f", type: "freiflaeche", art: "begrenzung", sections: ["k1", "k2", "k3", "k4"] }]));
  okAll(be);
  near(area(be), 600, 0.5, "Begrenzung");
  const ve = await K.buildPart(part([L("a1", "XY", "0", [0, 0], [100, 0]), L("a2", "XY", "40", [0, 0], [100, 0]), { id: "f", type: "freiflaeche", art: "verbindung", sections: ["a1", "a2"] }]));
  okAll(ve);
  near(area(ve), 4000, 1e-3, "Verbindung");
  // Platte 100 × 50 mit Bohrung: Deckfläche ohne Trimmung = volles Rechteck 5000
  const pl = [rectSketchFeature("p", "XY", 0, 0, 0, "100", "50"), { id: "e", type: "extrude", sketch: "p", distance: "5", op: "new" },
    { id: "c", type: "sketch", plane: { ref: "XY" }, offset: "5", points: [{ id: "m", x: 50, y: 25 }], entities: [{ id: "k", type: "circle", c: "m", r: 10 }], constraints: [] }, { id: "x", type: "extrude", sketch: "c", distance: "10", op: "cut", direction: "reverse" }];
  const un = await K.buildPart(part([...pl, { id: "u", type: "freiflaeche", art: "untrim", faces: [{ p: [10, 10, 5] }] }]));
  okAll(un);
  near(area(un), 5000, 1e-3, "untrim");
  // Fläche 100 × 30 mit Linie quer bei x = 40 teilen → zwei Teilflächen
  const ex = [L("s1", "XY", "0", [0, 0], [100, 0]), { id: "f", type: "freiflaeche", art: "extrusion", sketch: "s1", distance: "30" }];
  const te = await K.buildPart(part([...ex, L("t", "XY", "0", [40, -10], [40, 10]), { id: "g", type: "freiflaeche", art: "teilen", sketch: "t" }]));
  okAll(te);
  assert.equal(te.bodies[0].shape.faces.length, 2);
  near(area(te), 3000, 1e-3);
  const di = await K.buildPart(part([...ex, { id: "d", type: "freiflaeche", art: "dicke", distance: "2" }]));
  okAll(di);
  assert.equal(di.bodies[0].kind, "solid");
  near(R.measureVolume(di.bodies[0].shape), 6000, 1, "Dicke");
  // zwei Flächen in L-Form (Boden + Wand) verrunden
  const vr = await K.buildPart(part([...ex, { id: "w", type: "sketch", plane: { ref: "XZ" }, offset: "0", points: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }], entities: [{ id: "l", type: "line", p1: "a", p2: "b" }], constraints: [] },
    { id: "f2", type: "freiflaeche", art: "extrusion", sketch: "w", distance: "-30" }, { id: "r", type: "freiflaeche", art: "verrundung", radius: "5" }]));
  okAll(vr);
  assert.ok(vr.bodies[0].shape.faces.length >= 3, "Rundungsfläche dazu");
});

test("Flächen prüfen (E4): Isokurven, Kantenstetigkeit, Radien, Körper vergleichen", async () => {
  // Quader 200 × 100 × 20 mit R 5 an den senkrechten Kanten
  const box = [rectSketchFeature("s1", "XY", 0, 0, 0, "200", "100"), { id: "e1", type: "extrude", sketch: "s1", distance: "20", op: "new" }];
  const res = await K.buildPart(part([...box, { id: "r", type: "fillet", mode: "dir", dir: "Z", radius: "5" }]));
  okAll(res);
  const sh = res.bodies[0].shape;
  const iso = K.isoCurves(sh, 5);
  assert.equal(iso.length, 4 * 2 * 4, "4 Rundungen × 2 Richtungen × 4 Linien");
  const ed = K.edgeContinuity(sh);
  const tang = ed.filter((e) => e.angle < 1), knick = ed.filter((e) => e.angle > 80);
  assert.equal(tang.length, 8, "Übergänge Rundung ↔ Seitenfläche");
  assert.equal(knick.length, ed.length - 8, "alle anderen Kanten 90°");
  const rad = K.analyticRadii(sh);
  assert.equal(rad.length, 4);
  for (const x of rad) near(x.r, 5, 1e-6);
  // Vergleich: Quader ohne Rundung gegen gerundeten → nur in A die vier Ecken (je (1 − π/4)·25·20)
  const plain = (await K.buildPart(part(box))).bodies[0].shape;
  const c = K.compareShapes(plain, sh);
  near(c.onlyA, 4 * (1 - Math.PI / 4) * 25 * 20, 0.5);
  near(c.onlyB, 0, 1e-3);
  near(c.common, c.volB, 0.5);
  assert.ok(c.meshA?.positions.length > 0); assert.equal(c.meshB, null);
});

test("OBJ-Import: Würfel aus Vierecken → Volumenkörper, offenes Netz bleibt Fläche", async () => {
  // Quader 20 × 10 × 5 mit Vierecken, Indizes v/vt/vn und negativ
  const obj = ["# Test", "o Quader", "v 0 0 0", "v 20 0 0", "v 20 10 0", "v 0 10 0", "v 0 0 5", "v 20 0 5", "v 20 10 5", "v 0 10 5", "vn 0 0 1",
    "f 1//1 4//1 3//1 2//1", "f 5/1/1 6/1/1 7/1/1 8/1/1", "f 1 2 6 5", "f 2 3 7 6", "f 3 4 8 7", "f -4 -8 -5 -1"].join("\n");
  const res = await K.buildPart(part([{ id: "i", type: "import", format: "obj", data: obj, op: "new", convert: true }]));
  okAll(res);
  assert.match(res.status.i.info, /Volumenkörper, 6 Flächen \(aus 12 Dreiecken\)/);
  near(vol(res), 1000, 1e-3);
  const open = obj.split("\n").slice(0, -1).join("\n"); // eine Seite fehlt
  const r2 = await K.buildPart(part([{ id: "i", type: "import", format: "obj", data: open, op: "new", convert: true }]));
  assert.match(r2.status.i.info, /Fläche \(nicht geschlossen\)/);
});

test("Netz konvertieren (E5): STL-Würfel → Volumenkörper mit 6 Flächen", async () => {
  const V = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0], [0, 0, 10], [10, 0, 10], [10, 10, 10], [0, 10, 10]];
  const T = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const stl = "solid w\n" + T.map((t) => `facet normal 0 0 0\nouter loop\n${t.map((i) => `vertex ${V[i].join(" ")}`).join("\n")}\nendloop\nendfacet`).join("\n") + "\nendsolid w\n";
  const data = Buffer.from(stl).toString("base64");
  const res = await K.buildPart(part([{ id: "i", type: "import", format: "stl", data, op: "new", convert: true }]));
  okAll(res);
  assert.match(res.status.i.info, /Volumenkörper, 6 Flächen \(aus 12 Dreiecken\)/);
  near(vol(res), 1000, 1e-3);
  // Kanten und Flächen auflisten
  const t = K.listTopology(res.bodies[0].shape);
  assert.equal(t.faces.length, 6); assert.equal(t.edges.length, 12);
  for (const f of t.faces) { assert.equal(f.type, "PLANE"); near(f.area, 100, 1e-6); }
  for (const e of t.edges) { assert.equal(e.type, "LINE"); near(e.length, 10, 1e-6); }
});

test("Auflagefläche (E5): Seitenfläche nach unten, Teil liegt auf z = 0", async () => {
  const box = [rectSketchFeature("s1", "XY", 0, 0, 0, "200", "100"), { id: "e1", type: "extrude", sketch: "s1", distance: "20", op: "new" }];
  const res = await K.buildPart(part([...box, { id: "a", type: "auflage", faces: [{ p: [200, 50, 10] }] }]));
  okAll(res);
  const b = res.bodies[0].shape.boundingBox.bounds;
  near(b[0][2], 0, 1e-6); near(b[1][2] - b[0][2], 200, 1e-6);
  near(vol(res), 200 * 100 * 20, 1e-3);
  // Deckfläche (Normale +Z) → um 180° gedreht
  const r2 = await K.buildPart(part([...box, { id: "a", type: "auflage", faces: [{ p: [100, 50, 20] }] }]));
  okAll(r2);
  const b2 = r2.bodies[0].shape.boundingBox.bounds;
  near(b2[0][2], 0, 1e-6); near(b2[1][2], 20, 1e-6);
  assert.match(r2.status.a.info, /180°/);
});

test("Kunststoffteile (E5): Ansatz mit Rippen, Rastnase, Lippe und Nut", async () => {
  const base = [rectSketchFeature("s1", "XY", 0, 0, 0, "100", "60"), { id: "e1", type: "extrude", sketch: "s1", distance: "5", op: "new" }];
  const pts = { id: "sp", type: "sketch", name: "Punkte", plane: { ref: "XY" }, offset: "5", points: [{ id: "q1", x: 20, y: 20 }, { id: "q2", x: 80, y: 40 }], entities: [{ id: "pe1", type: "point", p: "q1" }, { id: "pe2", type: "point", p: "q2" }], constraints: [] };
  const v0 = 100 * 60 * 5;
  const a = await K.buildPart(part([...base, pts, { id: "k", type: "kunststoff", art: "ansatz", sketch: "sp", d: "8", di: "3", h: "10", tiefe: "8", rippen: "0" }]));
  okAll(a);
  near(vol(a), v0 + 2 * (Math.PI * 16 * 10 - Math.PI * 2.25 * 8), 1);
  const ar = await K.buildPart(part([...base, pts, { id: "k", type: "kunststoff", art: "ansatz", sketch: "sp", d: "8", di: "3", h: "10", tiefe: "8", rippen: "4", rippeT: "1.5", rippeL: "5" }]));
  okAll(ar);
  assert.ok(vol(ar) > vol(a) + 50, "Rippen");
  assert.match(ar.status.k.info, /4 Rippen/);
  const r = await K.buildPart(part([...base, pts, { id: "k", type: "kunststoff", art: "rastnase", sketch: "sp", l: "20", t: "2", b: "6", hub: "1", fang: "3" }]));
  okAll(r);
  near(vol(r), v0 + 2 * 6 * (2 * 20 + 1 * 3 / 2), 0.5);
  assert.match(r.status.k.info, /Dehnung 0,8 %/);
  // Lippe auf dem Rand: Band Breite 1 in Wandmitte einer 2-mm-Wand, Höhe 2
  const top = rectSketchFeature("s2", "XY", 5, 0, 0, "100", "60");
  const l = await K.buildPart(part([...base, top, { id: "k", type: "kunststoff", art: "lippe", sketch: "s2", breite: "1", hoehe: "2", wand: "2" }]));
  okAll(l);
  const ring = (o1, o2) => (100 - 2 * o1) * (60 - 2 * o1) - (100 - 2 * o2) * (60 - 2 * o2);
  near(vol(l) - v0, ring(0.5, 1.5) * 2, 1);
  const nn = await K.buildPart(part([...base, top, { id: "k", type: "kunststoff", art: "nut", sketch: "s2", breite: "1", hoehe: "2", wand: "2", spiel: "0.1" }]));
  okAll(nn);
  near(v0 - vol(nn), ring(0.4, 1.6) * 2.1, 1);
});
