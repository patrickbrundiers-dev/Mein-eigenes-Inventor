// MegaCAD-Abgleich: Geometrie-Kern-Tests (replicad + OpenCascade), getrennt von kernel.test.mjs
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

test("Regelkörper: Volumen aller Arten gegen die Formel, Lage und Achse (MegaCAD-Abgleich M5)", async () => {
  const { REGEL_KINDS, REGEL_DEFAULTS, regelVolume } = await import("../src/core/regelkoerper.js");
  for (const kind of Object.keys(REGEL_KINDS)) {
    const dims = { ...REGEL_DEFAULTS[kind] };
    if (kind === "kegel") dims.d = "20"; // Kegelstumpf
    const res = await K.buildPart(part([{ id: "rk", type: "regelkoerper", kind, dims, pos: ["0", "0", "0"], axis: "Z", op: "join" }]));
    okAll(res);
    const want = regelVolume(kind, Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, Number(v)])));
    near(vol(res), want, want * 0.002, kind);
  }
  // Spitzkegel liegend auf X, Basis bei x = 100, minus Zylinder (Differenz)
  const res = await K.buildPart(part([
    { id: "q", type: "regelkoerper", kind: "quader", dims: { L: "100", B: "100", H: "100" }, pos: ["0", "0", "0"], axis: "Z" },
    { id: "z", type: "regelkoerper", kind: "zylinder", dims: { D: "20", H: "100" }, pos: ["0", "0", "0"], axis: "Z", op: "cut" },
    { id: "k", type: "regelkoerper", kind: "kegel", dims: { D: "40", d: "0", H: "60" }, pos: ["50", "0", "50"], axis: "X", op: "join" },
  ]));
  okAll(res);
  near(vol(res), 1e6 - Math.PI * 100 * 100 + Math.PI * 400 * 60 / 3, 300, "Quader − Zylinder + Kegel");
  near(res.bodies[0].shape.boundingBox.bounds[1][0], 110, 0.01, "Kegelspitze bei x = 110");
});

test("Stahlprofile DSTV als Profil und Rahmen: Volumen = Fläche × Länge (MegaCAD-Abgleich M6)", async () => {
  const { catalogToDims, sectionGeometry } = await import("../src/core/sections.js");
  for (const [kind, size] of [["ipe", "200"], ["hea", "160"], ["upn", "120"], ["t", "50"]]) {
    const dims = catalogToDims(kind, size);
    const res = await K.buildPart(part([{ id: "p1", type: "profile", section: kind, dims, length: "1000", start: ["0", "0", "0"], axis: "X", rotation: "0", miterStart: "0", miterEnd: "0" }]));
    okAll(res);
    const A = sectionGeometry(kind, Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, Number(v)]))).area;
    near(vol(res), A * 1000, A * 1000 * 0.001, `${kind} ${size}`);
    assert.equal(res.bodies[0].meta.profileId, `${kind === "t" ? "T" : kind.toUpperCase()} ${size}`);
  }
  // HEB-Rahmen auf Gehrung (Profilzug, eben)
  const pz = await K.buildPart(part([{ id: "pz", type: "profilzug", section: "heb", dims: catalogToDims("heb", "160"), corner: "gehrung", align: "mitte", up: "Z", rotation: "0",
    points: [{ x: "0", y: "0", z: "0" }, { x: "2000", y: "0", z: "0" }, { x: "2000", y: "0", z: "1500" }] }]));
  okAll(pz);
  assert.equal(pz.bodies.length, 2);
});

test("Stirn-/Fußplatte mit Bohrbild und Rippen am Profilende (MegaCAD-Abgleich M8)", async () => {
  const { catalogToDims } = await import("../src/core/sections.js");
  const dims = catalogToDims("ipe", "200");
  const prof = { id: "p1", type: "profile", section: "ipe", dims, length: "1000", start: ["0", "0", "0"], axis: "X", rotation: "0", miterStart: "0", miterEnd: "0" };
  const plB = { id: "pl", type: "platte", target: "p1", member: 0, end: "B", thickness: "15", overhang: "40", width: "0", height: "0", radius: "0", holes: "4", holeDia: "18", edge: "30" };
  const res = await K.buildPart(part([prof, plB, { id: "pa", type: "platte", target: "p1", member: 0, end: "A", thickness: "10", overhang: "20", holes: "0" }, { id: "r", type: "rippe", plate: "pl", sides: ["oben", "unten"], length: "80", thickness: "8", chamfer: "10" }]));
  okAll(res);
  const byFid = (id) => res.bodies.filter((b) => b.fid === id);
  const [pb] = byFid("pl"), [pa] = byFid("pa");
  near(R.measureVolume(pb.shape), 180 * 280 * 15 - 4 * Math.PI * 81 * 15, 5, "Plattenvolumen");
  const bb = pb.shape.boundingBox.bounds;
  near(bb[0][0], 1000, 0.01, "Platte B beginnt am Stabende"); near(bb[1][0], 1015, 0.01, "Dicke nach außen");
  near(bb[1][2] - bb[0][2], 280, 0.01, "Höhe entlang Profilhöhe");
  const ba = pa.shape.boundingBox.bounds;
  near(ba[0][0], -10, 0.01, "Platte A nach außen"); near(ba[1][1] - ba[0][1], 140, 0.01, "Breite A = 100 + 2 × 20");
  const ribs = byFid("r");
  assert.equal(ribs.length, 2);
  const rb = ribs.map((x) => x.shape.boundingBox.bounds).sort((a, b) => b[1][2] - a[1][2]);
  near(rb[0][1][2], 140, 0.01, "Rippe oben bis Plattenrand"); near(rb[0][0][2], 100, 0.01, "Rippe oben ab Flansch");
  near(rb[0][0][0], 920, 0.01, "Rippe 80 mm in den Stab"); near(rb[0][1][1] - rb[0][0][1], 8, 0.01, "Rippendicke");
  near(rb[1][0][2], -140, 0.01, "Rippe unten");
  // Platte am Gehrungsende: Warnung
  const res2 = await K.buildPart(part([{ ...prof, miterEnd: "30" }, plB]));
  assert.match(res2.status.pl.warning || "", /Gehrung/);
});

test("Schweißnähte: Kehlnaht der Platte umlaufend, Rippen beidseitig, Naht an gewählten Kanten (MegaCAD-Abgleich M9)", async () => {
  const { catalogToDims, loopLength, sectionGeometry } = await import("../src/core/sections.js");
  const dims = catalogToDims("vierkant", "40x3");
  const prof = { id: "p1", type: "profile", section: "vierkant", dims, length: "500", start: ["0", "0", "0"], axis: "Z", rotation: "0", miterStart: "0", miterEnd: "0" };
  const res = await K.buildPart(part([prof,
    { id: "pl", type: "platte", target: "p1", member: 0, end: "A", thickness: "10", overhang: "40", holes: "4", holeDia: "13", edge: "25", weldA: "4" },
    { id: "r", type: "rippe", plate: "pl", sides: ["oben", "unten", "links", "rechts"], length: "60", thickness: "6", chamfer: "10", weldA: "3" },
    { id: "n", type: "naht", kind: "v", a: "5", side: "pfeil", edges: [{ p: [0, 20, 500], type: "LINE" }, { p: [0, -20, 500], type: "LINE" }] },
  ]));
  okAll(res);
  const per = loopLength(sectionGeometry("vierkant", Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, Number(v)]))).outer);
  const pw = res.welds.filter((w) => w.fid === "pl");
  assert.equal(pw.length, 1);
  near(pw[0].length, per, 1e-6, "umlaufend = Profilumfang");
  assert.ok(pw[0].around && pw[0].a === 4);
  const rw = res.welds.filter((w) => w.fid === "r");
  assert.equal(rw.length, 4);
  near(rw[0].length, 60 - 10 + 40 - 10, 1e-6, "Rippe: zwei Schenkel ohne Freischnitt");
  assert.equal(rw[0].side, "beide");
  const nw = res.welds.find((w) => w.fid === "n");
  near(nw.length, 2 * (40 - 2 * 6), 0.01, "zwei gerade Kanten der Stirnseite (ohne Radien)");
  assert.equal(nw.kind, "v");
});

test("Geländer-Generator: Pfostenaufteilung, Staketen, Handlauf über Eck, Fußplatten (MegaCAD-Abgleich M10/M11)", async () => {
  const { defaultGenerator } = await import("../src/core/generator.js");
  const f = { id: "g", ...defaultGenerator("gelaender") };
  f.params.runs = "3000; 1500";
  const res = await K.buildPart(part([f]));
  okAll(res);
  const by = (re) => res.bodies.filter((b) => re.test(b.name));
  assert.equal(by(/^Pfosten/).length, 3 + 1 + 2, "3 Felder à 1000 + 2 Felder à 750 → 6 Pfosten");
  assert.equal(by(/^Fußplatte/).length, 6);
  assert.equal(by(/^Handlauf/).length, 2, "zwei Handlaufstäbe, an der Ecke gegehrt");
  assert.ok(Math.abs(by(/^Handlauf/)[0].meta.miterEnd) > 40, "Gehrung 45° an der Ecke");
  assert.equal(by(/^Obergurt/).length, 5);
  const bars = by(/^Stab /);
  assert.ok(bars.length > 20);
  // Öffnung zwischen Pfostenfläche und erstem Stab ≤ 110 mm
  const bb = (b) => b.shape.boundingBox.bounds;
  const firstBar = bars.filter((b) => Math.abs(bb(b)[0][1] + bb(b)[1][1]) < 1 && bb(b)[1][0] < 1000).sort((a, b) => bb(a)[0][0] - bb(b)[0][0])[0];
  assert.ok(bb(firstBar)[0][0] - 20 <= 110 + 1e-6, "Öffnung am ersten Pfosten");
  // Oberkante Handlauf = 1000
  const top = Math.max(...res.bodies.map((b) => bb(b)[1][2]));
  near(top, 1000, 0.01, "OK Handlauf");
  assert.match(res.status.g.info, /6 Pfosten, 5 Feld/);
});
