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

test("Körper kombinieren, trennen, verschieben, aufdicken, Fläche verschieben, Entformung (Stufe 38)", async () => {
  // zwei Quader 100×40×10, der zweite um 50 versetzt (überlappen 50×40×10)
  const b1 = [rectSketchFeature("s1", "XY", 0, 0, 0, "100", "40"), { id: "e1", type: "extrude", sketch: "s1", distance: "10", op: "new" }];
  const b2 = [rectSketchFeature("s2", "XY", 0, 50, 0, "100", "40"), { id: "e2", type: "extrude", sketch: "s2", distance: "10", op: "new" }];
  const two = await K.buildPart(part([...b1, ...b2]));
  assert.equal(two.bodies.length, 2);
  const cut = await K.buildPart(part([...b1, ...b2, { id: "k", type: "kombinieren", target: "e1", tools: ["e2"], op: "cut" }]));
  okAll(cut);
  assert.equal(cut.bodies.length, 1);
  near(vol(cut), 50 * 40 * 10, 1e-3, "Differenz");
  const keep = await K.buildPart(part([...b1, ...b2, { id: "k", type: "kombinieren", target: "e1", tools: ["e2"], op: "join", keep: true }]));
  assert.equal(keep.bodies.length, 2);
  near(vol(keep), 150 * 40 * 10 + 100 * 40 * 10, 1e-3, "Vereinigen, Werkzeug behalten");
  const bad = await K.buildPart(part([...b1, { id: "k", type: "kombinieren", target: "e1", tools: [] }]));
  assert.match(bad.status.k.error, /Werkzeugkörper/);

  // Trennen an YZ bei x = 30: zwei Körper 30 und 70 lang; nur Gegenseite: 30
  const sp = await K.buildPart(part([...b1, { id: "t", type: "trennen", plane: "YZ", offset: "30" }]));
  okAll(sp);
  assert.equal(sp.bodies.length, 2);
  assert.deepEqual(sp.bodies.map((b) => Math.round(R.measureVolume(b.shape))).sort((a, b) => a - b), [12000, 28000]);
  const sp2 = await K.buildPart(part([...b1, { id: "t", type: "trennen", plane: "YZ", offset: "30", keep: "minus" }]));
  near(vol(sp2), 12000, 1e-3, "Gegenseite");
  const miss = await K.buildPart(part([...b1, { id: "t", type: "trennen", plane: "YZ", offset: "300" }]));
  assert.match(miss.status.t.error, /schneidet keinen/);

  // Verschieben um (0, 0, 20) und 90° um Z als Kopie
  const mv = await K.buildPart(part([...b1, { id: "v", type: "verschieben", bodies: ["e1"], move: ["0", "0", "20"], angle: "90", axis: "Z", copy: true }]));
  okAll(mv);
  assert.equal(mv.bodies.length, 2);
  const cb = mv.bodies[1].shape.boundingBox.bounds;
  near(cb[0][2], 20, 1e-6); near(cb[1][0] - cb[0][0], 40, 1e-6, "gedreht");

  // Aufdicken der Oberseite um 5 (neuer Körper), Fläche verschieben: Oberseite +3 und −4
  const top = { p: [50, 20, 10] };
  const th = await K.buildPart(part([...b1, { id: "a", type: "aufdicken", faces: [top], thickness: "5", side: "aussen" }]));
  okAll(th);
  assert.equal(th.bodies.length, 2);
  near(R.measureVolume(th.bodies[1].shape), 100 * 40 * 5, 1e-3, "Aufdicken");
  near(th.bodies[1].shape.boundingBox.bounds[1][2], 15, 1e-6);
  const up = await K.buildPart(part([...b1, { id: "f", type: "flaeche", faces: [top], distance: "3" }]));
  near(vol(up), 100 * 40 * 13, 1e-3, "Fläche heraus");
  const dn = await K.buildPart(part([...b1, { id: "f", type: "flaeche", faces: [top], distance: "-4" }]));
  near(vol(dn), 100 * 40 * 6, 1e-3, "Fläche zurück");

  // Entformung: Seitenfläche y = 0 um 5° zur Ebene XY (neutral unten) geneigt → Keil 100 · 10 · tan5° · 10 / 2 weg oder dazu
  const df = await K.buildPart(part([...b1, { id: "d", type: "entformung", faces: [{ p: [50, 0, 5] }], angle: "5", plane: "XY" }]));
  okAll(df);
  const wedge = (100 * 10 * 10 * Math.tan((5 * Math.PI) / 180)) / 2;
  near(Math.abs(vol(df) - 40000), wedge, 1, "Entformung");
});

test("Rahmen: Endkappe, Kürzen/Verlängern an Ebene (Stufe 40)", async () => {
  // Rechteckrohr 40×40×3, 500 lang entlang X ab 0
  const prof = { id: "pr", type: "profile", section: "vierkant", dims: { B: "40", t: "3", r: "4" }, length: "500", start: ["0", "0", "0"], axis: "X", rotation: "0", miterStart: "0", miterEnd: "0" };
  const base = await K.buildPart(part([prof]));
  okAll(base);
  const v0 = vol(base);
  // aufgesetzte Kappe 5 mm an beiden Enden: 2 Platten 40×40 (Eckradius des Rohrs) dazu
  const cap = await K.buildPart(part([prof, { id: "ek", type: "endkappe", target: "pr", end: "beide", mode: "aufgesetzt", thickness: "5" }]));
  okAll(cap);
  assert.equal(cap.bodies.length, 3);
  const caps = cap.bodies.filter((b) => b.meta?.endcap);
  assert.equal(caps.length, 2);
  const bbA = caps[0].shape.boundingBox.bounds;
  near(bbA[0][0], -5, 1e-6); near(bbA[1][0], 0, 1e-6);
  near(R.measureVolume(caps[0].shape), 40 * 40 * 5, 100, "Kappe (Eckradius)");
  // eingesetzt: Stopfen im Rohr bündig am Ende B
  const plug = await K.buildPart(part([prof, { id: "ek", type: "endkappe", target: "pr", end: "B", mode: "eingesetzt", thickness: "10" }]));
  okAll(plug);
  const pb = plug.bodies.find((b) => b.meta?.endcap).shape.boundingBox.bounds;
  near(pb[1][0], 500, 1e-6); near(pb[1][1] - pb[0][1], 34, 0.01, "Innenmaß");
  const bad = await K.buildPart(part([{ ...prof, section: "flach", dims: { B: "40", t: "10" } }, { id: "ek", type: "endkappe", target: "pr", mode: "eingesetzt", thickness: "5" }]));
  assert.match(bad.status.ek.error, /Hohlprofil/);

  // Kürzen an YZ bei x = 400 (Ende B): 100 mm kürzer
  const tr = await K.buildPart(part([prof, { id: "k", type: "kuerzen", target: "pr", plane: "YZ", offset: "400", end: "auto" }]));
  okAll(tr);
  near(vol(tr), v0 * 0.8, 1, "gekürzt");
  near(tr.bodies[0].meta.length, 400, 1e-3);
  // Verlängern bis x = 600: 100 mm länger
  const ex = await K.buildPart(part([prof, { id: "k", type: "kuerzen", target: "pr", plane: "YZ", offset: "600" }]));
  okAll(ex);
  near(vol(ex), v0 * 1.2, 2, "verlängert");
  near(ex.bodies[0].meta.length, 600, 1e-3);
  // schräge Arbeitsebene: Ende auf Gehrung 30°
  const sk = await K.buildPart(part([
    { id: "w", type: "arbeitsebene", mode: "winkel", base: "YZ", axis: "u", angle: "30" },
    prof, { id: "k", type: "kuerzen", target: "pr", plane: "datum:w", offset: "0", end: "A" },
  ]));
  okAll(sk);
  near(sk.bodies[0].meta.miterStart, 30, 0.1, "Gehrung aus Ebene");
  // parallele Ebene: Fehler
  const par = await K.buildPart(part([prof, { id: "k", type: "kuerzen", target: "pr", plane: "XY", offset: "0" }]));
  assert.match(par.status.k.error, /parallel/);
});

test("Blech: Lasche, Teil-Lasche mit Freischnitt, Umschlag, Stirnlasche, Durchzug, Konturlasche (Stufe 41)", async () => {
  const kt = { id: "k1", type: "kantteil", legs: "40; 100; 40", angles: "90; 90", ref: "aussen", t: "2", ri: "2", k: "0.33", length: "500" };
  const build = async (feats) => { const res = await K.buildPart(part(feats)); okAll(res); const b = res.bodies.find((x) => x.meta?.sheet); assert.ok(K.shapeValid(b.shape), "Körper gültig"); return { res, b, sh: b.meta.sheet }; };
  const plain = await build([kt]);
  // ganze Lasche am Ende: Abwicklung länger um Lasche − Rücksprung + Biegezugabe, Volumen = Abwicklung × t (K-Faktor-Fehler klein)
  const la = await build([kt, { id: "l1", type: "lasche", base: "k1", edge: "ende", length: "20", angle: "90", dir: "auf" }]);
  assert.equal(la.sh.bends.length, 3);
  assert.ok(la.sh.flat > plain.sh.flat + 14 && la.sh.flat < plain.sh.flat + 18, "Abwicklung mit Lasche");
  // Lasche am Anfang: Schenkel 1 bleibt, wo er war (Grundfläche ab x = 0)
  const ls = await build([kt, { id: "l1", type: "lasche", base: "k1", edge: "anfang", length: "20", angle: "90", dir: "auf" }]);
  near(ls.b.shape.boundingBox.bounds[0][0], 0, 1e-6, "Anfang bleibt");
  // Teil-Lasche 200 breit: Umriss mit Stufe und Freischnitten, Biegelinie nur über die Breite
  const tp = await build([kt, { id: "l1", type: "lasche", base: "k1", edge: "ende", length: "20", angle: "90", dir: "ab", width: "200", offset: "100" }]);
  assert.ok(tp.sh.flatModel.outer.length >= 12, "Umriss mit Lasche und Freischnitten");
  const pb = tp.sh.flatModel.bends.at(-1);
  near(pb.y0, 100, 1e-9); near(pb.y1, 300, 1e-9);
  // Umschlag geschlossen: 180°-Biegung
  const hem = await build([kt, { id: "u1", type: "umschlag", base: "k1", edge: "ende", kind: "geschlossen", length: "12", dir: "ab" }]);
  near(hem.sh.bends.at(-1).angle, 180, 1e-9);
  // Stirnlaschen vorne/hinten an Schenkel 2: Abwicklung wird länger, Eckfreischnitt nur vorne
  const sl = await build([kt, { id: "s1", type: "lasche", base: "k1", edge: "vorne", leg: "2", length: "30", angle: "90", dir: "auf" }, { id: "s2", type: "lasche", base: "k1", edge: "hinten", leg: "2", length: "30", angle: "90", dir: "auf", relief: "keiner" }]);
  assert.ok(sl.sh.length > 540 && sl.sh.length < 560, "Länge mit Stirnlaschen " + sl.sh.length);
  // Durchzug: Kragen außen am Steg, Vorloch in der Abwicklung kleiner als innen
  const dz = await build([kt, { id: "d1", type: "durchzug", base: "k1", leg: "2", s: "30; 60", y: "100; 100", d: "8", height: "4", dir: "ab" }]);
  near(dz.b.shape.boundingBox.bounds[1][0], 42, 1e-6, "Kragen 2 mm über die Außenfläche");
  assert.equal(dz.sh.flatModel.circles.length, 2);
  assert.ok(dz.sh.flatModel.circles[0].d < 8 && dz.sh.flatModel.circles[0].d > 4);
  // Blech-Features müssen direkt hinter dem Kantteil stehen
  const bad = await K.buildPart(part([kt, { id: "c1", type: "chamfer", edges: [], distance: "1" }, { id: "l1", type: "lasche", base: "k1", edge: "ende", length: "20", angle: "90" }]));
  assert.match(bad.status.l1.error || "", /direkt hinter/);
  // Konturlasche aus offener Skizzenlinie, Material links: Außenmaß 100 × 82
  const sk = { id: "s1", type: "sketch", plane: { ref: "XY" }, offset: "0", points: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 50, y: 0 }, { id: "c", x: 50, y: 80 }, { id: "d", x: 100, y: 80 }],
    entities: [{ id: "l1", type: "line", p1: "a", p2: "b" }, { id: "l2", type: "line", p1: "b", p2: "c" }, { id: "l3", type: "line", p1: "c", p2: "d" }], constraints: [] };
  const kl = await build([sk, { id: "k2", type: "kantteil", src: "skizze", sketch: "s1", side: "links", extent: "normal", t: "2", ri: "2", k: "0.33", length: "300" }]);
  const bb = kl.b.shape.boundingBox.bounds;
  near(bb[1][1], 82, 1e-6); near(bb[1][2], 300, 1e-6); near(bb[0][1], 0, 1e-6);
  // abgewickelt mit Stirnlasche und Durchzug: flach, Dicke t
  const fl = await build([{ ...kt, view: "abgewickelt" }, { id: "s1", type: "lasche", base: "k1", edge: "vorne", leg: "2", length: "30", angle: "90" }, { id: "d1", type: "durchzug", base: "k1", leg: "2", s: "30", y: "100", d: "8", height: "4" }]);
  const fb = fl.b.shape.boundingBox.bounds;
  near(fb[1][2] - fb[0][2], 2, 1e-6, "flach");
  assert.ok(fb[0][1] < -20, "Stirnlasche liegt vor y = 0");
});

test("3D-Skizze als Sweep-Pfad, abgeleitetes Bauteil gespiegelt und skaliert (Stufe 42)", async () => {
  const { inlineDerived } = await import("../src/core/ableiten.js");
  // Kreis Ø 20 auf YZ am Anfang des Pfads, Pfad 3D mit Radius
  const prof = { id: "s1", type: "sketch", plane: { ref: "YZ" }, offset: "0", points: [{ id: "c", x: 0, y: 0 }, { id: "r", x: 10, y: 0 }], entities: [{ id: "k", type: "circle", c: "c", r: 10 }], constraints: [] };
  const res = await K.buildPart(part([prof,
    { id: "p3", type: "skizze3d", points: [{ x: "0", y: "0", z: "0" }, { x: "200", y: "0", z: "0" }, { x: "200", y: "0", z: "150" }], radius: "40" },
    { id: "sw", type: "sweep", sketch: "s1", path: "p3", op: "new" }]));
  okAll(res);
  assert.equal(res.paths3d.length, 1);
  const L = 160 + 110 + (Math.PI * 40) / 2;
  near(vol(res), Math.PI * 100 * L, Math.PI * 100 * L * 0.01, "Volumen Rohr entlang Pfad");
  // abgeleitet: Quader 10 × 20 × 30 bei x 0..10, gespiegelt an YZ und Maßstab 2
  const src = part([rectSketchFeature("q", "XY", 0, 0, 0, "10", "20"), { id: "e", type: "extrude", sketch: "q", distance: "30" }]);
  const der = inlineDerived(part([{ id: "a1", type: "abgeleitet", source: src.id, mirror: "YZ", scale: "2" }]), (id) => (id === src.id ? src : null));
  const r2 = await K.buildPart(der);
  okAll(r2);
  const b = r2.bodies[0].shape.boundingBox.bounds;
  near(b[0][0], -20, 1e-6); near(b[1][0], 0, 1e-6); near(b[1][2], 60, 1e-6);
  near(vol(r2), 8 * 6000, 1e-3);
});

test("Regeln vor dem Aufbau: Parameter setzen, Feature unterdrücken, Meldung (Stufe 43)", async () => {
  const p = part([rectSketchFeature("q", "XY", 0, 0, 0, "10", "10"), { id: "e", type: "extrude", sketch: "q", distance: "H" },
    rectSketchFeature("q2", "XY", 0, 20, 0, "10", "10"), { id: "e2", type: "extrude", sketch: "q2", distance: "10" }]);
  p.params = [{ name: "L", expr: "8000" }, { name: "H", expr: "10" }];
  p.rules = [{ id: "a", kind: "setzen", when: "L > 6000", param: "H", value: "30" }, { id: "b", kind: "unterdruecken", when: "L > 6000", feature: "e2" }, { id: "c", kind: "pruefen", when: "L > 6000", message: "zu lang", level: "Hinweis" }];
  const res = await K.buildPart(p);
  near(vol(res), 3000, 1e-3, "nur der erste Quader, Höhe 30");
  assert.deepEqual(res.ruleOff, ["e2"]);
  assert.equal(res.rules[0].text, "zu lang");
  p.params[0].expr = "1000";
  const r2 = await K.buildPart(p);
  near(vol(r2), 2000, 1e-3, "beide Quader, Höhe 10");
});
