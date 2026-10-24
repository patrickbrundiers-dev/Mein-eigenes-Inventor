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

test("Knickrahmen: gerades Rohr, 30/45/90°, gebogene Außenwand, Gehrungslinie, beide Ansichten gültig", async () => {
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
    assert.deepEqual([fb.meta.legs, fb.meta.inPlane, fb.meta.wall], [[800, 600], 60, 3], "Daten für die Fertigungsprüfung");
    near(fb.meta.bendAllowances[0], (3 + 0.99) * rad(ang), 1e-12);
    // Gehrungslinie sichtbar: Kanten in der Gehrungsebene am Knoten (800, 0), Normale (d1 + d2)
    const nM = [1 + Math.cos(rad(ang)), Math.sin(rad(ang)), 0];
    const inMiter = (p) => Math.abs((p[0] - 800) * nM[0] + p[1] * nM[1]) / Math.hypot(nM[0], nM[1]) < 1e-6;
    const pt = (v) => (typeof v.toTuple === "function" ? v.toTuple() : v);
    const onTop = (e) => [pt(e.startPoint), pt(e.endPoint)].every((p) => inMiter(p) && Math.abs(Math.abs(p[2]) - 20) < 1e-6);
    // je eine Linie quer über Ober- und Unterseite (ohne Flächen-Vereinigung beim Verschmelzen)
    assert.ok(fb.shape.edges.filter(onTop).length >= 2, "Trennlinie auf Gehrung sichtbar");
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
      const res = await K.buildPart(part([knick({ view, dims, restWall: "0" }, lens, angs, { bendRadius: ri, kFactor: "0.5" })]));
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

test("Knickrahmen: Freistellung über die Biegezone, Schweißspalt, Zapfen", async () => {
  // K = 0,5, Wand ohne Eckradius: gefaltet und abgewickelt sind volumengleich (Guldin), auch mit
  // Freistellung, Spalt und Zapfen – und nur dann, wenn sich gefaltet nichts überlappt
  const dims = { B: "60", H: "40", t: "3", r: "0" };
  const build = async (view, extra, lens = ["800", "600"], angs = ["90"], ri = "3") => {
    const res = await K.buildPart(part([knick({ view, dims, restWall: "0", ...extra }, lens, angs, { bendRadius: ri, kFactor: "0.5" })]));
    okAll(res);
    solidOk(res.bodies[0].shape);
    return res.bodies[0];
  };
  for (const [extra, lens, angs, ri] of [
    [{}],
    [{}, undefined, undefined, "10"],
    [{}, undefined, undefined, "0"],
    [{ relief: "rechteck" }, undefined, ["30"]],
    [{ tabs: "an", tabDia: "8", weldGap: "1" }],
    [{ relief: "rechteck", weldGap: "0.5", tabs: "an", tabDia: "6" }, ["500", "400", "300"], ["45", "-60"], "4"],
    [{ weldGap: "0.8" }, undefined, ["150"], "5"],
    [{ relief: "keine" }],
    [{ relief: "keine", weldGap: "0.5", tabs: "an", tabDia: "6" }, ["500", "400", "300"], ["45", "-60"], "10"],
    [{ relief: "keine" }, undefined, ["30"], "0"],
  ]) {
    const fo = await build("gefaltet", extra, lens, angs, ri), fl = await build("abgewickelt", extra, lens, angs, ri);
    relNear(R.measureVolume(fo.shape), R.measureVolume(fl.shape), 1e-6, `gefaltet = abgewickelt ${JSON.stringify(extra)} ${angs || 90}° ri ${ri || 3}`);
  }
  // Mindestmaß automatisch: 90°, rᵢ 3, t 3 → Tiefe max(rᵢ(1 − cos45°) + 0,5; t/2) = 1,5 → Ø 3
  const auto = await build("abgewickelt", {});
  assert.deepEqual(auto.meta.reliefMin, [{ dia: 3 }]);
  assert.equal(auto.meta.relief, "rund");
  // Biegezone frei: kein Seitenwand-Material knapp unter der Außenwand-Innenseite (abgewickelt,
  // Linksknick → Außenwand bei y = −27; Biegezone x 824 … 831,07)
  const box = (x, y, z) => R.makeBaseBox(0.2, 0.2, 0.2).translate(x, y, z - 0.1);
  near(R.measureVolume(auto.shape.clone().intersect(box(827.5, -26.8, 18.5))), 0, 1e-9, "Biegezone frei");
  near(R.measureVolume(auto.shape.clone().intersect(box(827.5, -28.5, 0))), 0.008, 1e-9, "Außenwand bleibt");
  // Reststeg 0,1 mm: Schnitt endet vor der Außenwand-Innenseite, der Steg biegt sich mit.
  // Gefaltet = abgewickelt bis auf den Guldin-Unterschied des Stegs (Schwerpunkt bei rᵢ − 0,05 statt rᵢ + t/2)
  const rw = { restWall: "0.1" };
  const fl1 = await build("abgewickelt", rw), fo1 = await build("gefaltet", rw);
  assert.equal(fl1.meta.restWall, 0.1);
  const steg = (z) => R.measureVolume(fl1.shape.clone().intersect(R.makeBaseBox(0.2, 0.04, 0.2).translate(827.5, -26.95, z - 0.1)));
  near(steg(18.5), 0.008 * 0.2, 1e-9, "Steg oben"); near(steg(-18.5), 0.008 * 0.2, 1e-9, "Steg unten");
  near(R.measureVolume(fl1.shape.clone().intersect(box(827.5, -26.7, 18.5))), 0, 1e-9, "darunter frei");
  const dV = 2 * 0.1 * 3 * ((3 + 1.5) - (3 - 0.05)) * (Math.PI / 2); // Steg: 2 Wände × 0,1 × t, Faser-Differenz × θ
  near(R.measureVolume(fl1.shape) - R.measureVolume(fo1.shape), dV, 1e-3, "Guldin-Differenz Reststeg");
  // ohne Freistellung: Ecke geschlossen – Seitenwand auf der Gehrung bis an die gebogene Wand
  // (Linksknick, C = (824, −24), Ecke in Richtung (1, −1)/√2, Radius 2,5 < rᵢ)
  const none = await build("gefaltet", { relief: "keine" });
  assert.equal(none.meta.relief, "keine");
  near(R.measureVolume(none.shape.clone().intersect(box(824 + 2.5 / Math.SQRT2, -24 - 2.5 / Math.SQRT2, 18.5))), 0.008, 1e-9, "Ecke geschlossen");
  near(R.measureVolume(auto.shape.clone().intersect(box(827.5, -26.8, 18.5))), 0, 1e-9, "mit Freistellung frei");
  // Schweißspalt nimmt Material weg
  const gap = await build("abgewickelt", { weldGap: "1" });
  assert.ok(R.measureVolume(gap.shape) < R.measureVolume(auto.shape) - 10, "Spalt");
  // Zapfen ohne Spiel volumenneutral, Nase = halbe Kreisscheibe in beiden Seitenwänden; Spiel vergrößert das Loch
  const tab0 = await build("abgewickelt", { tabs: "an", tabDia: "8", tabClearance: "0" });
  relNear(R.measureVolume(tab0.shape), R.measureVolume(auto.shape), 1e-9, "Zapfen volumenneutral");
  near(R.measureVolume(tab0.shape.clone().cut(auto.shape.clone())), (Math.PI * 16) / 2 * 2 * 3, 1e-3, "Nase");
  const tab2 = await build("abgewickelt", { tabs: "an", tabDia: "8", tabClearance: "0.2" });
  near(R.measureVolume(tab0.shape) - R.measureVolume(tab2.shape), (Math.PI * (4.2 ** 2 - 16)) / 2 * 2 * 3, 1e-3, "Spiel");
  // Prüfregeln
  for (const [extra, re] of [
    [{ reliefDia: "2" }, /Freistellung zu klein, Durchmesser mindestens 3 mm/],
    [{ relief: "rechteck", reliefWidth: "1" }, /zu schmal/],
    [{ tabs: "an", tabDia: "52" }, /Zapfen zu groß/],
    [{ weldGap: "3" }, /Schweißspalt/],
    [{ bendRadius: "60" }, /Innenradius zu groß/],
    [{ bendRadius: "0", restWall: "0.1" }, /mindestens so groß wie der Reststeg/],
  ]) {
    const res = await K.buildPart(part([knick({ dims, ...extra }, ["800", "600"], ["90"])]));
    assert.match(String(res.status.kr.error), re, JSON.stringify(extra));
    assert.equal(res.bodies.length, 0);
  }
  const small = await K.buildPart(part([knick({ dims, tabs: "an", tabDia: "8" }, ["800", "600"], ["5"])]));
  assert.match(small.status.kr.error, /Gegenflanke/);
});

test("Messen: exakte Werte für Flächen, Kanten, Abstand, Winkel, Schwerpunkt", async () => {
  // Quader 100 × 40 × 20 ab Ursprung, Bohrung Ø 10 durch bei (50|20)
  const res = await K.buildPart(part([
    rectSketchFeature("s1", "XY", 0, 0, 0, "100", "40"),
    { id: "e1", type: "extrude", sketch: "s1", distance: "20" },
    pointSketch("s2", "XY", 20, [[50, 20]]),
    { id: "h1", type: "hole", sketch: "s2", diameter: "10", extent: "through", direction: "reverse", sink: "none" },
  ]));
  okAll(res);
  const shape = res.bodies[0].shape;
  const props = K.bodyProps(shape);
  near(props.volume, 100 * 40 * 20 - Math.PI * 25 * 20, 1e-6, "Volumen");
  near(props.center[0], 50, 1e-6, "Schwerpunkt x"); near(props.center[1], 20, 1e-6, "y"); near(props.center[2], 10, 1e-6, "z");
  near(props.area, 2 * (100 * 40 + 100 * 20 + 40 * 20) - 2 * Math.PI * 25 + Math.PI * 10 * 20, 1e-6, "Oberfläche");
  const mesh = K.meshBody(shape);
  assert.ok(mesh.faces.every((f) => Number.isInteger(f.idx)) && mesh.edges.every((e) => Number.isInteger(e.idx)), "Lage je Fläche/Kante");
  const faces = shape.faces, edges = shape.edges;
  const fi = (pred) => faces.findIndex((f) => pred(f));
  const top = fi((f) => f.geomType === "PLANE" && Math.abs(f.center.z - 20) < 1e-6);
  const bottom = fi((f) => f.geomType === "PLANE" && Math.abs(f.center.z) < 1e-6);
  const side = fi((f) => f.geomType === "PLANE" && Math.abs(f.center.x) < 1e-6);
  const cyl = fi((f) => f.geomType === "CYLINDRE");
  const r1 = K.measure([{ shape: faces[top], kind: "face" }]);
  near(r1.items[0].area, 4000 - Math.PI * 25, 1e-6, "Deckfläche");
  const r2 = K.measure([{ shape: faces[top], kind: "face" }, { shape: faces[bottom], kind: "face" }]);
  near(r2.distance, 20, 1e-6, "Abstand Deck–Boden"); near(r2.angle, 0, 1e-9, "parallel");
  const r3 = K.measure([{ shape: faces[top], kind: "face" }, { shape: faces[side], kind: "face" }]);
  near(r3.angle, 90, 1e-9, "senkrecht"); near(r3.distance, 0, 1e-9, "berühren sich");
  const r4 = K.measure([{ shape: faces[cyl], kind: "face" }]);
  near(r4.items[0].radius, 5, 1e-9, "Bohrungsradius");
  const circ = edges.findIndex((e) => e.geomType === "CIRCLE");
  const r5 = K.measure([{ shape: edges[circ], kind: "edge" }]);
  near(r5.items[0].radius, 5, 1e-9, "Kreiskante"); near(r5.items[0].length, Math.PI * 10, 1e-6, "Umfang");
  near(r5.items[0].center[0], 50, 1e-9); near(r5.items[0].center[1], 20, 1e-9);
  const long = edges.findIndex((e) => e.geomType === "LINE" && Math.abs(R.measureLength(e) - 100) < 1e-6);
  const r6 = K.measure([{ shape: edges[long], kind: "edge" }, { shape: faces[side], kind: "face" }]);
  near(r6.items[0].length, 100, 1e-9, "Kantenlänge"); near(r6.angle, 90, 1e-9, "Kante senkrecht zur Seitenfläche");
  // platziert (Baugruppe): Abstand verschiebt sich mit
  const moved = K.placed(faces[top], [0, 0, 5], [0, 0, 0]);
  near(K.measure([{ shape: moved, kind: "face" }, { shape: faces[bottom], kind: "face" }]).distance, 25, 1e-6, "platziert");
});

test("Konturen am Rohr (Rohr-Editor): Bohrung, Langloch, Ausklinkung, Seite und Muster", async () => {
  const tube = (cuts, extra = {}) => part([{ id: "pr", type: "profile", section: "vierkant", dims: { B: "40", t: "3", r: "6" }, length: "1000", start: ["0", "0", "0"], axis: "X", cuts, ...extra }]);
  const base = await K.buildPart(tube([]));
  const V0 = vol(base);
  const box = (c, s) => R.makeBaseBox(s[0], s[1], s[2]).translate([c[0], c[1], c[2] - s[2] / 2]);
  const probe = (res, c, s = [14, 4, 14]) => R.measureVolume(res.bodies[0].shape.intersect(box(c, s)));
  // Bohrung Ø10 oben bei 500: ebene Wand 3 mm → π·5²·3 weniger, Loch liegt oben (+Z)
  let res = await K.buildPart(tube([{ kind: "bohrung", x: "500", side: "oben", q: "0", pattern: "1", d: "10" }]));
  okAll(res);
  near(V0 - vol(res), Math.PI * 25 * 3, 0.5, "Bohrung oben");
  near(probe(res, [500, 0, 20], [14, 14, 4]), probe(base, [500, 0, 20], [14, 14, 4]) - Math.PI * 25 * 2, 0.5, "Loch oben (+Z)");
  assert.equal(res.bodies[0].meta.pierces, 1);
  near(res.bodies[0].meta.cutLength, Math.PI * 10, 1e-9, "Schneidweg");
  // vorne = −Y (von Ende A gesehen rechts), durchgehend → auch hinten, Muster 3x100 → 6 Löcher
  res = await K.buildPart(tube([{ kind: "bohrung", x: "300", side: "vorne", q: "0", pattern: "3x100", d: "10", through: true }]));
  okAll(res);
  near(V0 - vol(res), 6 * Math.PI * 25 * 3, 2, "6 Löcher");
  assert.ok(probe(res, [400, -20, 0]) < probe(base, [400, -20, 0]) - 100, "vorne = −Y");
  assert.ok(probe(res, [400, 20, 0]) < probe(base, [400, 20, 0]) - 100, "durchgehend hinten");
  assert.equal(res.bodies[0].meta.pierces, 6);
  // Langloch 30×10 oben, Versatz 5 nach vorne: Fläche 20·10 + π·5²
  res = await K.buildPart(tube([{ kind: "langloch", x: "200", side: "oben", q: "5", pattern: "1", l: "30", b: "10" }]));
  okAll(res);
  near(V0 - vol(res), (20 * 10 + Math.PI * 25) * 3, 0.5, "Langloch");
  assert.ok(probe(res, [200, -5, 20], [20, 4, 4]) < probe(base, [200, -5, 20], [20, 4, 4]) - 50, "Versatz + = vorne (−Y)");
  // Ausklinkung am Ende B, 30 × 20, ohne Radius: 30·20·3 weg, Zuschnittlänge bleibt
  res = await K.buildPart(tube([{ kind: "ausklinkung", end: "B", side: "unten", q: "0", l: "30", b: "20", r: "0" }]));
  okAll(res);
  near(V0 - vol(res), 30 * 20 * 3, 0.5, "Ausklinkung");
  assert.ok(probe(res, [985, 0, -20], [20, 14, 4]) < 1, "unten am Ende B frei");
  near(res.bodies[0].meta.length, 1000, 0.05);
  // ungültige Kontur: Profil bleibt, Warnung nennt die Kontur
  res = await K.buildPart(tube([{ kind: "bohrung", x: "998", side: "oben", pattern: "1", d: "10" }]));
  assert.equal(res.bodies.length, 1);
  assert.match(res.status.pr.warning, /Kontur 1: liegt nicht ganz auf dem Teil/);
  near(vol(res), V0, 1e-6);
  // Rundrohr: Winkel 90° = vorne
  res = await K.buildPart(part([{ id: "pr", type: "profile", section: "rohr", dims: { D: "42.4", t: "2.6" }, length: "500", start: ["0", "0", "0"], axis: "X", cuts: [{ kind: "bohrung", x: "250", angle: "90", pattern: "1", d: "8" }] }]));
  okAll(res);
  const rb = await K.buildPart(part([{ id: "pr", type: "profile", section: "rohr", dims: { D: "42.4", t: "2.6" }, length: "500", start: ["0", "0", "0"], axis: "X" }]));
  assert.ok(probe(res, [250, -20, 0], [10, 6, 10]) < probe(rb, [250, -20, 0], [10, 6, 10]) - 20, "Rundrohr 90° = vorne");
});

test("Enden in 2D und 3D (Rohr-Editor) mit Winkelkorrektur", async () => {
  const tube = (extra, section = "vierkant", dims = { B: "40", t: "3", r: "6" }) => part([{ id: "pr", type: "profile", section, dims, length: "500", start: ["0", "0", "0"], axis: "X", miterEnd: "45", ...extra }]);
  const legacy = await K.buildPart(tube({})); // ältere Datei ohne Angaben: 3D, ±45°
  const d3 = await K.buildPart(tube({ endCuts: { B: "3D" }, swivel: "45" }));
  const d2 = await K.buildPart(tube({ endCuts: { B: "2D" }, swivel: "45" }));
  for (const r of [legacy, d3, d2]) { okAll(r); assert.equal(r.status.pr.warning, undefined); solidOk(r.bodies[0].shape); }
  near(vol(d3), vol(legacy), 1e-6, "3D innerhalb der Grenze = ebener Schnitt");
  near(d2.bodies[0].meta.length, d3.bodies[0].meta.length, 0.05, "Außenkante gleich, Zuschnittlänge gleich");
  const diff = R.measureVolume(d3.bodies[0].shape.cut(d2.bodies[0].shape)) + R.measureVolume(d2.bodies[0].shape.cut(d3.bodies[0].shape));
  // 2D: Innenkante unter der Außenkante → oben und unten je ein Keil ½·t²·tan45·(Wandbreite) anders
  assert.ok(diff > 2 * 0.5 * 9 * 28 * 0.8 && diff < 2 * 0.5 * 9 * 40 * 1.2, `Keile 2D/3D: ${diff}`);
  assert.deepEqual(d2.bodies[0].meta.endCuts, { A: "", B: "2D" });
  // Winkelkorrektur: 60° Gehrung, Kopf höchstens 45° → gemeldet, Körper gültig, Außenkante wie eben
  const c = await K.buildPart(tube({ miterEnd: "60", endCuts: { B: "3D" }, swivel: "45" }));
  okAll(c);
  solidOk(c.bodies[0].shape);
  assert.match(c.status.pr.warning, /Ende B: Gehrung braucht 60° Kopfschwenk, Winkelkorrektur auf ±45° – Schnitt nicht maßhaltig/);
  const flat = await K.buildPart(tube({ miterEnd: "60", swivel: "89" }));
  near(c.bodies[0].meta.length, flat.bodies[0].meta.length, 0.05);
  const dc = R.measureVolume(c.bodies[0].shape.cut(flat.bodies[0].shape)) + R.measureVolume(flat.bodies[0].shape.cut(c.bodies[0].shape));
  assert.ok(dc > 10, `begrenzter Schwenk ändert die Schnittfläche: ${dc}`);
  // Rundrohr 2D gültig
  const rr = await K.buildPart(tube({ endCuts: { B: "2D" }, swivel: "45" }, "rohr", { D: "42.4", t: "2.6" }));
  okAll(rr);
  solidOk(rr.bodies[0].shape);
  // Flachstahl: 2D nicht möglich → eben mit Hinweis
  const fl = await K.buildPart(tube({ endCuts: { B: "2D" } }, "flach", { B: "40", t: "8" }));
  okAll(fl);
  assert.match(fl.status.pr.warning, /2D-Schnitt nur für/);
});

test("Bohrung in 3D (Rohr-Editor): Neigung längs/quer, Winkelkorrektur", async () => {
  const tube = (cut, extra = {}) => part([{ id: "pr", type: "profile", section: "vierkant", dims: { B: "40", t: "3", r: "6" }, length: "1000", start: ["0", "0", "0"], axis: "X", cuts: [{ kind: "bohrung", x: "500", side: "oben", pattern: "1", d: "10", ...cut }], ...extra }]);
  const straight = await K.buildPart(part([{ id: "pr", type: "profile", section: "vierkant", dims: { B: "40", t: "3", r: "6" }, length: "1000", start: ["0", "0", "0"], axis: "X" }])); // ohne Bohrung
  const t30 = await K.buildPart(tube({ d3: true, tiltL: "30", tiltQ: "0" }));
  okAll(t30);
  solidOk(t30.bodies[0].shape);
  // schräg durch 3 mm Wand: Querschnitt senkrecht zur Achse π·25, Volumen = π·25·3/cos30
  near(vol(straight) - vol(t30), (Math.PI * 25 * 3) / Math.cos(Math.PI / 6), 1, "schräge Bohrung");
  assert.ok(t30.bodies[0].meta.cutLength > Math.PI * 10, "Ellipse länger als Kreis");
  // 60° quer bei ±45°: begrenzt und gemeldet
  const t60 = await K.buildPart(tube({ d3: true, tiltL: "0", tiltQ: "60" }));
  assert.match(t60.status.pr.warning, /Kontur 1: Bohrung 3D braucht 60° Kopfschwenk, Winkelkorrektur auf ±45° – nicht maßhaltig/);
  near(vol(straight) - vol(t60), (Math.PI * 25 * 3) / Math.cos(Math.PI / 4), 1.5, "auf 45° begrenzt");
});

test("Prägen / Gravieren: Skizze auf Rundrohr abgewickelt, auf Vierkant eben, über Kante gemeldet", async () => {
  const tubeR = { id: "pr", type: "profile", section: "rohr", dims: { D: "40", t: "3" }, length: "500", start: ["0", "0", "0"], axis: "X" };
  const tubeQ = { id: "pr", type: "profile", section: "vierkant", dims: { B: "40", t: "3", r: "6" }, length: "500", start: ["0", "0", "0"], axis: "X" };
  const sk = (y = -10) => rectSketchFeature("s1", "XY", 50, 200, y, 40, 20); // 40 längs × 20 quer, 50 über der Achse
  const emb = (extra = {}) => ({ id: "e1", type: "emboss", sketch: "s1", depth: "0.5", mode: "gravieren", direction: "auto", ...extra });
  const dV = async (tube, s, e) => { const b = await K.buildPart(part([tube])); const r = await K.buildPart(part([tube, s, e])); return { r, d: vol(r) - vol(b) }; };
  // Rundrohr abgewickelt: 40 × 20 auf dem Umfang, 0,5 tief → 400 · (R − d/2)/R
  let { r, d } = await dV(tubeR, sk(), emb());
  okAll(r);
  near(d, -400 * (19.75 / 20), 1, "abgewickelt");
  assert.match(r.status.e1.info, /1 auf dem Rohr abgewickelt/);
  // liegt oben bei x 200…240 und reicht um den Umfang 20 mm (= 57,3° → |y| bis 20·sin 28,6° = 9,6)
  const bb = r.bodies[0].shape.intersect(R.makeBaseBox(60, 30, 10).translate([220, 0, 15])).boundingBox;
  assert.ok(bb.bounds[1][2] > 19.9, "Rohr oben unversehrt außerhalb");
  const cut = R.makeBaseBox(40, 40, 0.4).translate([220, 0, 19.65]); // Schicht direkt unter der Oberfläche
  const left = R.measureVolume(r.bodies[0].shape.intersect(cut));
  const base0 = await K.buildPart(part([tubeR]));
  const base = R.measureVolume(base0.bodies[0].shape.intersect(cut));
  assert.ok(base - left > 50, "Gravur oben (+Z)");
  // nicht gespiegelt: Kontur nur auf +Y (y 2…14) landet auf der +Y-Seite des Rohrs
  ({ r } = await dV(tubeR, rectSketchFeature("s1", "XY", 50, 200, 2, 40, 12), emb({ depth: "1" })));
  const side = (y) => R.measureVolume(base0.bodies[0].shape.intersect(R.makeBaseBox(40, 8, 30).translate([220, y, 0]))) - R.measureVolume(r.bodies[0].shape.intersect(R.makeBaseBox(40, 8, 30).translate([220, y, 0])));
  assert.ok(side(8) > 100 && side(-8) < 1, `Seite ${side(8)} / ${side(-8)}`);
  // ohne Abwickeln: senkrecht projiziert, Querschnitt = Ringstück 19,5…20 mit |y| ≤ 10
  ({ r, d } = await dV(tubeR, sk(), emb({ wrap: false })));
  okAll(r);
  const A = (q) => 10 * Math.sqrt(q * q - 100) + q * q * Math.asin(10 / q);
  near(d, -40 * (A(20) - A(19.5)), 0.5, "projiziert");
  // Prägen erhaben: kommt dazu, verbunden mit dem Rohr (ein Körper)
  ({ r, d } = await dV(tubeR, sk(), emb({ mode: "praegen" })));
  okAll(r);
  near(d, 400 * (20.25 / 20), 1.5, "geprägt");
  assert.equal(r.bodies.length, 1);
  // Vierkant: ebene Fläche oben, genau 40 · 20 · 0,5
  ({ r, d } = await dV(tubeQ, sk(), emb()));
  okAll(r);
  near(d, -400, 0.5, "eben");
  assert.ok(!r.status.e1.warning);
  // über die Kante der ebenen Fläche (y −25…−5, eben nur bis −14): Warnung
  ({ r } = await dV(tubeQ, sk(-25), emb()));
  assert.match(r.status.e1.warning || "", /Gravur über Kante/);
  // Blickrichtung „Normale“ (von hinten): Gravur unten (−Z)
  ({ r, d } = await dV(tubeR, sk(), emb({ direction: "normal" })));
  okAll(r);
  near(d, -400 * (19.75 / 20), 1, "von hinten");
  const low = R.makeBaseBox(40, 40, 0.4).translate([220, 0, -20]);
  assert.ok(R.measureVolume(base0.bodies[0].shape.intersect(low)) - R.measureVolume(r.bodies[0].shape.intersect(low)) > 50, "unten");
  // Skizze neben dem Rohr → Fehler
  ({ r } = await dV(tubeR, rectSketchFeature("s1", "XY", 50, 200, 60, 40, 20), emb()));
  assert.equal(r.status.e1.ok, false);
  assert.match(r.status.e1.error, /trifft keine Oberfläche/);
});
