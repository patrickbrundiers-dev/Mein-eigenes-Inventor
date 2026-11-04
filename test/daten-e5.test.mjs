import test from "node:test";
import assert from "node:assert/strict";
const near = (a, b, t = 1e-9) => assert.ok(Math.abs(a - b) <= t, `${a} ≠ ${b}`);

test("URDF (E5): Glieder, Gelenke, Grenzen in rad/m, Netze im Paket", async () => {
  const K = await import("../src/core/kinematik.js");
  const U = await import("../src/core/urdf.js");
  const asm = { name: "Tor", components: [
    { id: "s", name: "Säule", pos: [0, 0, 0], rot: [0, 0, 0], fixed: true },
    { id: "f", name: "Flügel", pos: [0, 0, 0], rot: [0, 0, 0], joint: K.defaultJoint([100, 0, 0], [0, 0, 1], { min: 0, max: 90 }) },
    { id: "g", name: "Griff", pos: [0, 0, 0], rot: [0, 0, 0] },
    { id: "r", name: "Riegel", pos: [0, 0, 0], rot: [0, 0, 0], joint: K.defaultJoint([0, 0, 0], [1, 0, 0], { kind: "schiebe", min: 0, max: 40 }) },
  ], constraints: [{ id: "k1", type: "passend", a: { comp: "f" }, b: { comp: "g" } }, { id: "k2", type: "passend", a: { comp: "g" }, b: { comp: "r" } }] };
  const m = U.urdfModel(asm);
  assert.deepEqual(m.links.map((l) => [l.name, l.comps]), [["basis", ["s"]], ["Fluegel", ["f", "g"]], ["Riegel", ["r"]]]);
  const [jf, jr] = m.joints;
  assert.equal(jf.type, "revolute"); assert.equal(jf.parent, "basis"); assert.deepEqual(jf.xyz, [0.1, 0, 0]);
  assert.ok(Math.abs(jf.upper - Math.PI / 2) < 1e-12);
  assert.equal(jr.type, "prismatic"); assert.equal(jr.parent, "Fluegel"); assert.equal(jr.upper, 0.04); assert.deepEqual(jr.xyzRel, [-0.1, 0, 0]);
  const tri = { pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], idx: null };
  const p = U.urdfPackage("Tor 1", asm, (id) => (id === "r" ? null : [tri]));
  assert.deepEqual(p.files, ["Tor_1/urdf/Tor_1.urdf", "Tor_1/meshes/basis.stl", "Tor_1/meshes/Fluegel.stl"]);
  assert.match(p.text, /<robot name="Tor_1">/);
  assert.match(p.text, /<joint name="Riegel_gelenk" type="prismatic">[\s\S]*<parent link="Fluegel"\/>/);
  assert.match(p.text, /<origin xyz="-0.1 0 0" rpy="0 0 0"\/>\s*<geometry><mesh filename="package:\/\/Tor_1\/meshes\/Fluegel.stl"/);
  assert.ok(!/Riegel\.stl/.test(p.text));
  assert.equal(p.zip[0], 0x50); // PK
  const stl = U.stlBinary([tri]);
  assert.equal(stl.length, 84 + 50);
  assert.equal(new DataView(stl.buffer).getFloat32(84 + 8, true), 1); // Normale +Z
});

test("Bild nachzeichnen (E5): Quadrat mit Loch → zwei geschlossene Umrisse, Lage in der Skizze", async () => {
  const B = await import("../src/core/skizzenbild.js");
  const W = 20, H = 20, g = new Uint8Array(W * H).fill(255);
  for (let y = 4; y < 16; y++) for (let x = 4; x < 16; x++) g[y * W + x] = 0;
  for (let y = 8; y < 12; y++) for (let x = 8; x < 12; x++) g[y * W + x] = 255;
  const loops = B.traceContours(g, W, H, { minPts: 4 });
  assert.equal(loops.length, 2);
  const area = (l) => Math.abs(l.slice(1).reduce((s, p, i) => s + (l[i][0] * p[1] - p[0] * l[i][1]), 0) / 2);
  const a = loops.map(area).sort((x, y) => y - x);
  assert.ok(Math.abs(a[0] - 12 * 12) < 3, "außen " + a[0]); assert.ok(Math.abs(a[1] - 4 * 4) < 3, "innen " + a[1]);
  for (const l of loops) assert.deepEqual(l[0], l.at(-1));
  // Bild 20 px breit auf 100 mm, Ecke bei (10, 20)
  const c = B.imageCorners({ w: 100, h: 100, angle: 0 }, { x: 10, y: 20 });
  assert.deepEqual(B.imageToSketch(c, [20, 20], [-0.5, -0.5]), [10, 120]);
  assert.deepEqual(B.imageToSketch(c, [20, 20], [19.5, 19.5]), [110, 20]);
});

test("Einheit der Konstruktion (E5): Messanzeige in cm, m, Zoll", async () => {
  const { measureFormat } = await import("../src/core/messen.js");
  assert.equal(measureFormat({ dec: 2 }).len(254), "254,00 mm");
  assert.equal(measureFormat({ dec: 2, unit: "in" }).len(254), "10,00 in");
  assert.equal(measureFormat({ dec: 1, unit: "cm" }).area(1000), "10,0 cm²");
  assert.equal(measureFormat({ dec: 3, unit: "m", second: "mm" }).len(1500), "1,500 m (1.500,000 mm)");
});

test("Einstellungsprofile (E6): Schnappschuss ohne Profile, Prüfung, Slicerliste", async () => {
  const S = await import("../src/core/settings.js");
  const v = { ...S.defaultSettings(), "allgemein.dezimalstellen": 1, "allgemein.profile": { A: "x" } };
  const snap = JSON.parse(S.profileSnapshot(v));
  assert.equal(snap.values["allgemein.dezimalstellen"], 1);
  assert.equal(snap.values["allgemein.profile"], undefined);
  assert.equal(S.loadSettings(S.profileSnapshot(v)).values["allgemein.dezimalstellen"], 1);
  assert.equal(S.validateValue(S.settingDef("allgemein.profile"), { "": "x" }).ok, false);
  assert.equal(S.validateValue(S.settingDef("dateien.slicer"), [{ name: "Prusa", exe: "C:\\\\P\\\\prusa.exe" }]).ok, true);
  assert.equal(S.validateValue(S.settingDef("dateien.slicer"), [{ name: "", exe: "x" }]).ok, false);
});

test("Parametergraph und Verwendungen (E6)", async () => {
  const G = await import("../src/core/paramgraph.js");
  const params = [{ name: "B", expr: "2*A" }, { name: "A", expr: "100" }, { name: "C", expr: "A + B - 5" }];
  assert.deepEqual([...G.paramDeps(params)].map(([k, v]) => [k, v.sort()]), [["B", ["A"]], ["A", []], ["C", ["A", "B"]]]);
  const L = G.paramLevels(params);
  assert.deepEqual([L.get("A"), L.get("B"), L.get("C")], [0, 1, 2]);
  const svg = G.paramGraphSvg(params, { A: 100, B: 200, C: 295 });
  assert.equal((svg.match(/marker-end=/g) || []).length, 3);
  assert.match(svg, /295/);
  const feats = [{ id: "e", type: "extrude", name: "Extrusion1", distance: "B/2" }, { id: "s", type: "sketch", name: "Skizze", constraints: [{ value: "Breite" }, { value: "A+1" }] }];
  assert.deepEqual(G.paramUsages(feats, "A"), [{ id: "s", feature: "Skizze", field: "constraints[2].value" }]);
  assert.deepEqual(G.paramUsages(feats, "B").map((u) => u.field), ["distance"]);
  assert.deepEqual(G.moveParam(params, 0, 1).map((p) => p.name), ["A", "B", "C"]);
  assert.equal(G.moveParam(params, 0, -1), params);
  // Kreis bricht nicht
  assert.ok(G.paramLevels([{ name: "X", expr: "Y" }, { name: "Y", expr: "X" }]));
});

test("Punktwolke (E5): XYZ, CSV, PLY lesen, kodieren, ausdünnen, verschieben", async () => {
  const C = await import("../src/core/punktwolke.js");
  const a = C.parsePointCloud("# Scan\n1 2 3\n4,5,6\n\n7;8;9 255 0 0\nkaputt\n");
  assert.deepEqual([...a], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const ply = C.parsePointCloud("ply\nformat ascii 1.0\nelement vertex 2\nproperty float x\nend_header\n0 0 0\n1 1 1\n3 3 3\n");
  assert.equal(ply.length, 6);
  assert.throws(() => C.parsePointCloud("ply\nformat binary_little_endian 1.0\nend_header\n"), /ASCII/);
  assert.throws(() => C.parsePointCloud("abc"), /Keine Punkte/);
  const b = C.decodeCloud(C.encodeCloud(a));
  assert.deepEqual([...b], [...a]);
  assert.deepEqual([...C.decimateCloud(a, 2)], [1, 2, 3, 7, 8, 9]);
  const p = C.cloudPoints({ data: C.encodeCloud(a), offset: ["10", 0, 0], scale: "2" });
  assert.deepEqual([...p.slice(0, 3)], [12, 4, 6]);
  assert.deepEqual(C.cloudBounds(a), [[1, 2, 3], [7, 8, 9]]);
});

test("Kunststoffregeln (E5): Prüfung, Vorgaben, Rastnasen-Dehnung", async () => {
  const P = await import("../src/core/kunststoff.js");
  assert.equal(P.validatePlasticRules(P.DEFAULT_PLASTIC_RULES).ok, true);
  assert.equal(P.validatePlasticRules([{ name: "X", wall: 0.1, draft: 1, radius: 1 }]).ok, false);
  assert.equal(P.validatePlasticRules([{ name: "X", wall: "2,5", draft: 1, radius: 1 }]).value[0].wall, 2.5);
  const d = P.plasticDefaults("ansatz", { wall: 2.5 });
  assert.equal(d.rippeT, "1.5"); assert.equal(d.h, "10");
  near(P.snapStrain(2, 1, 20), 0.75);
  assert.match(P.plasticWarnings("rastnase", { t: 3, hub: 2, l: 10 }, { wall: 2.5 })[0], /Dehnung 9,0 %/);
  assert.match(P.plasticWarnings("ansatz", { rippen: 4, rippeT: 2, d: 8, di: 3 }, { wall: 2.5 }).join(), /Rippe 2 mm/);
});
