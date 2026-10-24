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
  assert.ok(L2 < 300 && L2 > 300 - 21.3, "Abzweig " + L2);
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
