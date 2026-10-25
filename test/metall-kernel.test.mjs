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
