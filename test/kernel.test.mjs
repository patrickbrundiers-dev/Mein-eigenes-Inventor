// Geometrie-Kern-Tests (benötigen replicad + OpenCascade, laufen in CI)
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createKernel } from "../src/kernel/build.js";
import { exampleProject, rectSketchFeature } from "../src/core/examples.js";

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
const log = (...a) => console.log("[info]", ...a);

function part(features, params = []) {
  return { id: "p" + Math.random(), kind: "part", name: "Test", params, features };
}
const pointSketch = (id, plane, offset, pts) => ({
  id, type: "sketch", name: id, plane: { ref: plane }, offset: String(offset),
  points: pts.map((p, i) => ({ id: "h" + i, x: p[0], y: p[1] })),
  entities: pts.map((_, i) => ({ id: "pe" + i, type: "point", p: "h" + i })),
  constraints: [],
});

test("Platte mit Bohrungen und Rundung", async () => {
  const p = part([
    rectSketchFeature("s1", "XY", 0, 0, 0, "Länge", "Breite"),
    { id: "e1", type: "extrude", sketch: "s1", distance: "Dicke", op: "join" },
    pointSketch("s2", "XY", "Dicke", [[20, 25], [80, 25]]),
    { id: "h1", type: "hole", sketch: "s2", diameter: "10", extent: "through", direction: "reverse" },
    { id: "f1", type: "fillet", mode: "dir", dir: "Z", radius: "5" },
  ], [{ name: "Länge", expr: "100" }, { name: "Breite", expr: "50" }, { name: "Dicke", expr: "10" }]);
  const res = await K.buildPart(p);
  okAll(res);
  const expected = 100 * 50 * 10 - 2 * Math.PI * 25 * 10 - 4 * (25 - (Math.PI * 25) / 4) * 10;
  near(vol(res), expected, 1, "Volumen");
  const bb = res.bodies[0].shape.boundingBox.bounds;
  log("Platte bbox", JSON.stringify(bb));
  near(bb[1][0] - bb[0][0], 100, 1e-6);
  near(bb[1][2], 10, 1e-6);
  const mesh = K.meshBody(res.bodies[0].shape);
  const top = mesh.faces.find((f) => f.type === "PLANE" && f.normal && f.normal[2] > 0.99);
  assert.ok(top, "Deckfläche mit Normale +Z gefunden");
  log("faces", mesh.faces.length, "edges", mesh.edges.length, "top", JSON.stringify(top));
  assert.ok(mesh.edges.every((e) => e.mid && e.type), "Kanten haben Mittelpunkt/Typ");
});

test("Senkung, Flachsenkung, Sackloch, Gewinde", async () => {
  const p = part([
    rectSketchFeature("s1", "XY", 0, 0, 0, "100", "40"),
    { id: "e1", type: "extrude", sketch: "s1", distance: "20" },
    pointSketch("s2", "XY", 20, [[15, 20]]),
    { id: "h1", type: "hole", sketch: "s2", diameter: "6.6", extent: "through", sink: "senkung", sinkDiameter: "13", sinkAngle: "90" },
    pointSketch("s3", "XY", 20, [[40, 20]]),
    { id: "h2", type: "hole", sketch: "s3", diameter: "6.6", extent: "through", sink: "flach", sinkDiameter: "11", sinkDepth: "6.4" },
    pointSketch("s4", "XY", 20, [[65, 20]]),
    { id: "h3", type: "hole", sketch: "s4", diameter: "8", extent: "depth", depth: "12" },
    pointSketch("s5", "XY", 20, [[85, 20]]),
    { id: "h4", type: "hole", sketch: "s5", thread: "M8", extent: "depth", depth: "15" },
  ]);
  const res = await K.buildPart(p);
  okAll(res);
  const v = vol(res);
  log("Volumen Bohrungen", v, res.status.h4.info);
  assert.ok(v < 80000 && v > 76000);
});

test("Rotation voll und teilweise", async () => {
  const sk = rectSketchFeature("s1", "XZ", 0, 10, 0, "10", "30");
  const res = await K.buildPart(part([sk, { id: "r1", type: "revolve", sketch: "s1", axis: "y", angle: "360" }]));
  okAll(res);
  near(vol(res), Math.PI * (400 - 100) * 30, 1, "Vollrotation");
  const res2 = await K.buildPart(part([sk, { id: "r1", type: "revolve", sketch: "s1", axis: "y", angle: "90" }]));
  okAll(res2);
  near(vol(res2), (Math.PI * (400 - 100) * 30) / 4, 1, "Viertel");
});

test("Profil Quadratrohr mit Gehrungen", async () => {
  const p = part([{
    id: "pr", type: "profile", section: "vierkant", dims: { B: "40", t: "3", r: "6" }, length: "500",
    start: ["0", "0", "0"], axis: "X", miterStart: "45", miterEnd: "45",
  }]);
  const res = await K.buildPart(p);
  okAll(res);
  const b = res.bodies[0];
  log("Profil meta", JSON.stringify({ ...b.meta, frameZ: undefined }));
  near(b.meta.length, 540, 0.05, "Zuschnittlänge");
  assert.equal(b.kind, "member");
});

test("Rahmen aus Skizze: Gehrung und Stumpf", async () => {
  const sk = rectSketchFeature("s1", "XZ", 0, 0, 0, "1000", "600");
  const res = await K.buildPart(part([sk, { id: "fr", type: "frame", sketch: "s1", section: "vierkant", dims: { B: "40", t: "3", r: "6" }, corner: "gehrung" }]));
  okAll(res);
  const lens = res.bodies.map((b) => Math.round(b.meta.length * 100) / 100);
  log("Gehrung Längen", lens.join(", "));
  assert.equal(res.bodies.length, 4);
  for (const L of lens) assert.ok(Math.abs(L - 1040) < 0.05 || Math.abs(L - 640) < 0.05, "Länge " + L);
  const res2 = await K.buildPart(part([sk, { id: "fr", type: "frame", sketch: "s1", section: "vierkant", dims: { B: "40", t: "3", r: "6" }, corner: "stumpf" }]));
  okAll(res2);
  const lens2 = res2.bodies.map((b) => Math.round(b.meta.length * 100) / 100);
  log("Stumpf Längen", lens2.join(", "), "coped", res2.bodies.map((b) => b.meta.coped).join(","));
  assert.deepEqual([...lens2].sort((a, b) => a - b), [560, 600, 1000, 1040]);
  // Rundrohr mit T-Stoß (Ausklinkung)
  const sk3 = {
    id: "s3", type: "sketch", name: "T", plane: { ref: "XZ" }, offset: "0",
    points: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 500, y: 0 }, { id: "c", x: 250, y: 0 }, { id: "d", x: 250, y: 300 }],
    entities: [{ id: "l1", type: "line", p1: "a", p2: "b" }, { id: "l2", type: "line", p1: "c", p2: "d" }],
    constraints: [],
  };
  const res3 = await K.buildPart(part([sk3, { id: "fr", type: "frame", sketch: "s3", section: "rohr", dims: { D: "42.4", t: "2.6" } }]));
  okAll(res3);
  log("T-Stoß Längen", res3.bodies.map((b) => b.meta.length.toFixed(2)).join(", "), "coped", res3.bodies.map((b) => b.meta.coped).join(","));
  assert.ok(res3.bodies[1].meta.coped);
  const L2 = res3.bodies[1].meta.length;
  assert.ok(L2 <= 300 + 1e-3 && L2 > 300 - 21.3, "Abzweig " + L2); // gleiche Rohre: Sattelspitzen reichen bis zur Achse
});

test("Muster, Spiegeln, Fase an Kante, Wandung", async () => {
  const base = [
    rectSketchFeature("s1", "XY", 0, 0, 0, "100", "40"),
    { id: "e1", type: "extrude", sketch: "s1", distance: "10" },
    pointSketch("s2", "XY", 10, [[10, 20]]),
    { id: "h1", type: "hole", sketch: "s2", diameter: "5", extent: "through" },
    { id: "pt", type: "pattern", kind: "linear", feature: "h1", dir: "X", count: "4", spacing: "25" },
  ];
  const res = await K.buildPart(part(base));
  okAll(res);
  near(vol(res), 40000 - 4 * Math.PI * 6.25 * 10, 1, "Muster");
  const res2 = await K.buildPart(part([...base, { id: "m", type: "mirror", plane: "YZ", offset: "0" }]));
  okAll(res2);
  near(vol(res2), 2 * (40000 - 4 * Math.PI * 6.25 * 10), 2, "Spiegeln");
  const res3 = await K.buildPart(part([...base.slice(0, 2), { id: "c", type: "chamfer", mode: "edges", radius: "2", edges: [{ p: [50, 0, 10], type: "LINE" }] }]));
  okAll(res3);
  near(vol(res3), 40000 - 2 * 100, 0.5, "Fase");
  const res4 = await K.buildPart(part([...base.slice(0, 2), { id: "sh", type: "shell", thickness: "2", faces: [{ p: [50, 20, 10] }] }]));
  log("Wandung", JSON.stringify(res4.status.sh));
  if (res4.status.sh.ok) near(vol(res4), 40000 - 96 * 36 * 8, 1, "Wandung");
  // Kreismuster
  const res5 = await K.buildPart(part([
    { id: "s1", type: "sketch", name: "k", plane: { ref: "XY" }, offset: "0", points: [{ id: "c", x: 0, y: 0 }], entities: [{ id: "k", type: "circle", c: "c", r: 50 }], constraints: [] },
    { id: "e1", type: "extrude", sketch: "s1", distance: "5" },
    pointSketch("s2", "XY", 5, [[40, 0]]),
    { id: "h1", type: "hole", sketch: "s2", diameter: "6", extent: "through" },
    { id: "pt", type: "pattern", kind: "circular", feature: "h1", axis: "Z", center: ["0", "0", "0"], count: "6", angle: "360" },
  ]));
  okAll(res5);
  near(vol(res5), Math.PI * 2500 * 5 - 6 * Math.PI * 9 * 5, 1, "Kreismuster");
});

test("Fehler werden gemeldet statt abzustürzen", async () => {
  const res = await K.buildPart(part([
    rectSketchFeature("s1", "XY", 0, 0, 0, "20", "20"),
    { id: "e1", type: "extrude", sketch: "s1", distance: "20" },
    { id: "f1", type: "fillet", mode: "all", radius: "30" },
    { id: "e2", type: "extrude", sketch: "fehlt", distance: "5" },
  ]));
  log("Fehlermeldungen", JSON.stringify(res.status));
  assert.equal(res.status.f1.ok, false);
  assert.equal(res.status.e2.ok, false);
  near(vol(res), 8000, 1e-3);
});

test("Zwischenspeicher liefert gleiche Ergebnisse", async () => {
  const feats = [rectSketchFeature("s1", "XY", 0, 0, 0, "50", "50"), { id: "e1", type: "extrude", sketch: "s1", distance: "10" }];
  const p = { id: "cachetest", kind: "part", params: [], features: feats };
  let t0 = performance.now();
  const a = await K.buildPart(p);
  const t1 = performance.now() - t0;
  p.features = [...feats, pointSketch("s2", "XY", 10, [[25, 25]]), { id: "h", type: "hole", sketch: "s2", diameter: "10", extent: "through" }];
  t0 = performance.now();
  const b = await K.buildPart(p);
  const t2 = performance.now() - t0;
  log("Zeiten ms", t1.toFixed(1), t2.toFixed(1));
  near(vol(a), 25000, 1e-3);
  near(vol(b), 25000 - Math.PI * 25 * 10, 0.5);
  p.features = feats;
  const c = await K.buildPart(p);
  near(vol(c), 25000, 1e-3);
});

test("Zeichnungsprojektion: sichtbar/verdeckt, Kreise", async () => {
  // Quader mit Sackloch von vorne (Fläche y = -20)
  const p = part([
    rectSketchFeature("s1", "XY", 0, 0, 0, "60", "40"),
    { id: "e1", type: "extrude", sketch: "s1", distance: "30" },
    pointSketch("s2", "XZ", 0, [[30, 15]]), // XZ-Ebene: Normale -Y, Ursprung y=0
    { id: "h", type: "hole", sketch: "s2", diameter: "10", extent: "depth", depth: "15", direction: "reverse" },
  ]);
  const res = await K.buildPart(p);
  okAll(res);
  const shape = res.bodies[0].shape;
  const front = K.projectView(shape, { dir: [0, 1, 0], up: [0, 0, 1] });
  const back = K.projectView(shape, { dir: [0, -1, 0], up: [0, 0, 1] });
  const xs = front.visible.flat().map((q) => q[0]), ys = front.visible.flat().map((q) => q[1]);
  log("Vorne x", Math.min(...xs), Math.max(...xs), "y", Math.min(...ys), Math.max(...ys), "Bögen sichtbar", front.arcs.length, "verdeckt", front.hiddenArcs.length);
  log("Hinten Bögen sichtbar", back.arcs.length, "verdeckt", back.hiddenArcs.length);
  near(Math.min(...xs), 0, 1e-3); near(Math.max(...xs), 60, 1e-3);
  near(Math.min(...ys), 0, 1e-3); near(Math.max(...ys), 30, 1e-3);
  assert.ok(front.arcs.some((a) => Math.abs(a.r - 5) < 1e-3), "Loch vorne sichtbar");
  assert.ok(back.hiddenArcs.some((a) => Math.abs(a.r - 5) < 1e-3), "Loch hinten verdeckt");
  const top = K.projectView(shape, { dir: [0, 0, -1], up: [0, 1, 0] });
  const ty = top.visible.flat().map((q) => q[1]);
  log("Draufsicht y", Math.min(...ty), Math.max(...ty), "verdeckte Linien", top.hidden.length);
  near(Math.max(...ty), 40, 1e-3);
  const iso = K.projectView(shape, { dir: [-1, 1, -1], up: [0, 0, 1] });
  assert.ok(iso.visible.length > 3);
});

test("Export STEP/STL und Baugruppen-Platzierung", async () => {
  const res = await K.buildPart(part([rectSketchFeature("s1", "XY", 0, 0, 0, "10", "20"), { id: "e1", type: "extrude", sketch: "s1", distance: "5" }]));
  const s = res.bodies[0].shape;
  const placed = K.placed(s, [100, 0, 0], [0, 0, 90]);
  const bb = placed.boundingBox.bounds;
  log("platziert", JSON.stringify(bb));
  near(bb[0][0], 80, 1e-6); near(bb[1][0], 100, 1e-6); near(bb[1][1], 10, 1e-6);
  near(R.measureVolume(s), 1000, 1e-6); // Original unverändert nutzbar
  const step = R.exportSTEP([{ shape: placed, name: "Teil Ä", color: "#ff8800" }, { shape: s.clone(), name: "B" }]);
  const txt = await step.text();
  assert.ok(txt.includes("ISO-10303-21"));
  const stl = s.blobSTL({ binary: true });
  assert.ok(stl.size > 84);
  const imp = await R.importSTEP(new Blob([await s.blobSTEP().text()]));
  near(R.measureVolume(imp), 1000, 1e-3);
});

test("Beispielprojekt baut fehlerfrei", async () => {
  const prj = exampleProject();
  for (const d of prj.docs.filter((x) => x.kind === "part")) {
    const res = await K.buildPart(d);
    const bad = Object.entries(res.status).filter(([, s]) => !s.ok);
    log("Beispiel", d.name, "Körper", res.bodies.length, "Fehler", JSON.stringify(bad));
    assert.equal(bad.length, 0);
    for (const b of res.bodies) K.meshBody(b.shape);
  }
});

test("API-Annahmen", () => {
  const a = R.makeBaseBox(10, 10, 10);
  const b = R.makeBaseBox(2, 2, 20);
  const c = a.clone().cut(b.clone());
  near(R.measureVolume(c), 960, 1e-6);
  near(R.measureVolume(a), 1000, 1e-6, "a nach clone-cut");
  let consumed = "nein";
  try { const x = R.makeBaseBox(1, 1, 1); x.translate([1, 0, 0]); R.measureVolume(x); } catch (e) { consumed = "ja: " + e.message; }
  log("translate verbraucht Original:", consumed);
  const f = R.makeBaseBox(10, 10, 10).faces[0];
  log("FaceFinder", Object.getOwnPropertyNames(R.FaceFinder.prototype).join(" "), "|", Object.getOwnPropertyNames(Object.getPrototypeOf(R.FaceFinder.prototype)).join(" "));
  log("hashCode typ", typeof f.hashCode, "isNull typ", typeof f.isNull);
  log("revolution.length", R.revolution.length, "mirror", R.makeBaseBox(1, 1, 1).mirror.length);
});

import { svgPathSegments } from "../src/core/svgpath.js";
import { segmentsToDxf } from "../src/core/dxf.js";

test("Platte als DXF: Kontur, Eckenradien, Bohrungen als Kreise", async () => {
  const prj = exampleProject();
  const plate = prj.docs.find((d) => d.id === "beispiel_platte");
  const res = await K.buildPart(plate);
  const shape = res.bodies[0].shape;
  const f = K.largestPlanarFace(shape);
  log("größte Fläche", JSON.stringify(f));
  assert.ok(Math.abs(Math.abs(f.normal[2]) - 1) < 1e-9);
  const segs = [];
  for (const d of K.projectRaw(shape, { dir: f.normal.map((x) => -x), up: K.upFor(f.normal) })) segs.push(...svgPathSegments(d));
  const r = segmentsToDxf(segs);
  log("Platten-DXF", r.circles, "Kreise", r.arcs, "Bögen", r.lines, "Linien", r.width, "x", r.height);
  assert.equal(r.circles, 4);
  assert.equal(r.arcs, 4);
  assert.equal(r.lines, 4);
  near(r.width, 300, 1e-3); near(r.height, 200, 1e-3);
});

test("Schnitt: Körper kappen und Schnittfläche finden", async () => {
  const p = part([
    rectSketchFeature("s1", "XY", 0, 0, 0, "60", "40"),
    { id: "e1", type: "extrude", sketch: "s1", distance: "30" },
    pointSketch("s2", "XZ", 0, [[30, 15]]),
    { id: "h", type: "hole", sketch: "s2", diameter: "10", extent: "through", direction: "both" },
  ]);
  const res = await K.buildPart(p);
  const shape = res.bodies[0].shape;
  // waagerechter Schnitt in der Vorderansicht bei z = 15 (durch die Bohrung), Blick von oben
  const view = { dir: [0, 0, -1], up: [0, 1, 0] };
  const cut = K.cutAtPlane(shape, [0, 0, 1], 15);
  near(R.measureVolume(cut), 60 * 40 * 15 - Math.PI * 25 * 40 / 2, 1);
  const loops = K.sectionLoops(cut, [0, 0, 1], 15, view);
  log("Schnittkonturen", loops.length, loops.map((l) => l.length).join(","));
  assert.ok(loops.length >= 1);
  const area = (l) => Math.abs(l.reduce((s, p, i) => { const q = l[(i + 1) % l.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
  const total = loops.reduce((s, l) => s + area(l), 0);
  log("Schnittfläche (Summe Konturen)", total);
  // Schnittfläche 60x40 abzüglich Bohrungsstreifen 10x40 -> zwei Rechtecke 25x40
  near(total, 2 * 25 * 40, 1);
});

test("Profil-ID in Zuschnitt-Daten", async () => {
  const prj = exampleProject();
  const res = await K.buildPart(prj.docs.find((d) => d.id === "beispiel_rahmen"));
  assert.ok(res.bodies.every((b) => b.meta.profileId === "QR 40x40x3"), res.bodies.map((b) => b.meta.profileId).join(","));
  const tube = await K.buildPart(prj.docs.find((d) => d.id === "beispiel_rohr"));
  assert.equal(tube.bodies[0].meta.profileId, "RR 48,3x2,6");
});

// ---------- Knickrahmen ----------
const { defaultKnickrahmen } = await import("../src/core/knickrahmen.js");
const { catalogToDims } = await import("../src/core/sections.js");
function knick(over = {}, lens = ["800", "600"], angles = ["30"], bend = { bendRadius: "3", kFactor: "0.33" }) {
  return {
    id: "kr", name: "KR", ...defaultKnickrahmen(catalogToDims("rechteck", "60x40x3")), ...bend,
    segments: lens.map((length) => ({ length })),
    bends: angles.map((angle) => ({ angle, min: "", max: "" })),
    ...over,
  };
}
const solidOk = (shape) => {
  assert.equal(shape.solids.length, 1, "genau ein Körper");
  const a = new OC.BRepCheck_Analyzer(shape.wrapped, true, false);
  assert.ok(a.IsValid(), "Körper gültig");
  a.delete();
};
const L_TOL = 0.01; // Vernetzungstoleranz der Längenmessung; Kanten an ebenen Schnitten liegen exakt
const relNear = (a, b, rel, msg) => near(a, b, Math.abs(b) * rel, msg);
const rad = (deg) => (deg * Math.PI) / 180;

test("Knickrahmen: gerades Rohr, 30/45/90°, gebogene Außenwand, beide Ansichten gültig", async () => {
  // gerades Rohr
  let res = await K.buildPart(part([knick({}, ["1000"], [])]));
  okAll(res);
  const A = res.bodies[0].meta.area;
  solidOk(res.bodies[0].shape);
  relNear(R.measureVolume(res.bodies[0].shape), A * 1000, 1e-6, "Volumen gerade");
  near(res.bodies[0].meta.length, 1000, 1e-9);
  // zwei Segmente, Innenradius 3, K 0,33 (d = 27 − 3 = 24)
  for (const ang of [30, 45, 90]) {
    const flatL = 1400 + 2 * 24 * Math.tan(rad(ang / 2)) + (3 + 0.33 * 3) * rad(ang);
    res = await K.buildPart(part([knick({}, ["800", "600"], [String(ang)])]));
    okAll(res);
    assert.equal(res.bodies.length, 1, "ein Körper (ein Rohr)");
    const fb = res.bodies[0];
    solidOk(fb.shape);
    near(fb.meta.length, flatL, 1e-9, "Abwicklungslänge");
    assert.ok(fb.meta.coped && fb.meta.knicks === 1);
    near(fb.meta.bendAllowances[0], (3 + 0.99) * rad(ang), 1e-12);
    const bb = fb.shape.boundingBox.bounds;
    const ey = 600 * Math.sin(rad(ang));
    assert.ok(bb[1][1] >= ey - 1e-6 && bb[1][1] <= ey + 30 + 1e-6, "y-Ausdehnung");
    near(bb[0][2], -20, 1e-6); near(bb[1][2], 20, 1e-6);
    const fl = await K.buildPart(part([knick({ view: "abgewickelt" }, ["800", "600"], [String(ang)])]));
    okAll(fl);
    solidOk(fl.bodies[0].shape);
    const fbb = fl.bodies[0].shape.boundingBox.bounds;
    near(fbb[1][0] - fbb[0][0], flatL, L_TOL, "gerades Rohr so lang wie die Abwicklung");
    near(fbb[1][1] - fbb[0][1], 60, 1e-6);
    log("Knick", ang, "Abwicklung", flatL.toFixed(3), "Volumen", R.measureVolume(fb.shape).toFixed(0), R.measureVolume(fl.bodies[0].shape).toFixed(0));
  }
});

test("Knickrahmen: Faltung passt zur Abwicklung (K = 0,5, Wand ohne Eckradius → gleiches Volumen)", async () => {
  // Bei K = 0,5 liegt die neutrale Faser in Wandmitte; für einen rechteckigen Wandstreifen ist das
  // Volumen der Biegezone dann exakt gleich dem abgewickelten Streifen (Guldin). Stimmen gefaltete
  // und abgewickelte Form überein, sind beide Volumen gleich.
  const dims = { B: "60", H: "40", t: "3", r: "0" };
  for (const [lens, angs, ri] of [[["800", "600"], ["90"], "3"], [["500", "400", "300"], ["45", "-60"], "6"], [["500", "500"], ["60"], "40"]]) {
    const vols = [];
    for (const view of ["gefaltet", "abgewickelt"]) {
      const res = await K.buildPart(part([knick({ view, dims }, lens, angs, { bendRadius: ri, kFactor: "0.5" })]));
      okAll(res);
      solidOk(res.bodies[0].shape);
      vols.push(R.measureVolume(res.bodies[0].shape));
    }
    relNear(vols[0], vols[1], 1e-6, `Volumen gefaltet/abgewickelt ${angs} ri ${ri}`);
  }
});

test("Knickrahmen: drei Segmente, gegensinnig, Ebene XZ, Profillage", async () => {
  const f = knick({ plane: "XZ", orientation: "flach" }, ["500", "400", "300"], ["45", "-60"], { bendRadius: "2", kFactor: "0.4" });
  let res = await K.buildPart(part([f]));
  okAll(res);
  const b = res.bodies[0];
  solidOk(b.shape);
  const bb = b.shape.boundingBox.bounds;
  near(bb[0][1], -30, 1e-6); near(bb[1][1], 30, 1e-6); // flach: B = 60 senkrecht zur XZ-Ebene
  const t45 = Math.tan(rad(22.5)), t60 = Math.tan(rad(30));
  near(b.meta.length, 1200 + 2 * 15 * (t45 + t60) + 3.2 * (rad(45) + rad(60)), 1e-9);
  res = await K.buildPart(part([{ ...f, view: "abgewickelt" }]));
  okAll(res);
  solidOk(res.bodies[0].shape);
  const fbb = res.bodies[0].shape.boundingBox.bounds;
  near(fbb[1][0] - fbb[0][0], b.meta.length, L_TOL);
  assert.equal(res.bodies.filter((x) => x.kind === "member").length, 1, "Zuschnittliste: ein Rohr");
});

test("Knickrahmen: ungültige Eingaben ohne Teilergebnis, Parameter und Neuaufbau", async () => {
  const other = { id: "e0", type: "profile", section: "vierkant", dims: { B: "40", t: "3", r: "6" }, length: "100", start: ["0", "500", "0"], axis: "X" };
  for (const [over, lens, angs, re] of [
    [{}, ["800", "-1"], ["30"], /Segment 2/],
    [{}, ["800", "600"], ["175"], /außerhalb/],
    [{ bends: [{ angle: "50", min: "", max: "45" }] }, ["800", "600"], ["50"], /Maximum/],
    [{}, ["20", "600"], ["90"], /zu kurz/],
    [{ dims: { B: "60", H: "40", t: "20", r: "6" } }, ["800", "600"], ["30"], /Wandstärke/],
    [{ kFactor: "2" }, ["800", "600"], ["30"], /K-Faktor/],
    [{}, ["100", "100", "100", "100"], ["10", "10", "10"], /Segmente/],
  ]) {
    const res = await K.buildPart(part([other, knick(over, lens, angs)]));
    assert.equal(res.status.kr.ok, false);
    assert.match(res.status.kr.error, re);
    assert.equal(res.bodies.filter((b) => b.fid === "kr").length, 0, "kein Teilergebnis");
    assert.equal(res.status.e0.ok, true, "anderes Feature unberührt");
  }
  // Ausdrücke aus der Parametertabelle; Neuaufbau mit Cache = ohne Cache
  const p = part([knick({ bendRadius: "Ri", kFactor: "K" }, ["Gesamt - 600", "600"], ["Knick"])], [{ name: "Gesamt", expr: "1400" }, { name: "Knick", expr: "45" }, { name: "Ri", expr: "4" }, { name: "K", expr: "0.4" }]);
  const a = await K.buildPart(p);
  okAll(a);
  p.params[1].expr = "60";
  const b1 = await K.buildPart(p);
  const b2 = await K.buildPart(p, { useCache: false });
  near(b1.bodies[0].meta.length, b2.bodies[0].meta.length, 1e-9);
  near(R.measureVolume(b1.bodies[0].shape), R.measureVolume(b2.bodies[0].shape), 1e-6);
  assert.notEqual(a.bodies[0].meta.length, b1.bodies[0].meta.length);
});

test("Knickrahmen: Speichern/Laden und STEP-Rückimport", async () => {
  const prj = { format: "werkcad", version: 1, name: "KR", docs: [part([knick({}, ["500", "400", "300"], ["30", "30"])])] };
  const back = JSON.parse(JSON.stringify(prj));
  const r1 = await K.buildPart(prj.docs[0], { useCache: false });
  const r2 = await K.buildPart(back.docs[0], { useCache: false });
  okAll(r2);
  assert.deepEqual(back.docs[0].features[0], prj.docs[0].features[0]);
  assert.deepEqual(r2.bodies[0].meta, r1.bodies[0].meta);
  near(R.measureVolume(r2.bodies[0].shape), R.measureVolume(r1.bodies[0].shape), 1e-6);
  for (const view of ["gefaltet", "abgewickelt"]) {
    const res = await K.buildPart(part([knick({ view }, ["500", "400", "300"], ["30", "-30"])]));
    const s = res.bodies[0].shape;
    const imp = await R.importSTEP(new Blob([await R.exportSTEP([{ shape: s.clone(), name: "KR" }]).text()]));
    relNear(R.measureVolume(imp), R.measureVolume(s), 1e-3, "STEP-Rückimport " + view);
  }
});
