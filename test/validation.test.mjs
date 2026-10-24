// Körperprüfung (V-1) und Vorab-Prüfregeln (V-2)
// (benötigt replicad + OpenCascade, läuft in CI)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { createKernel } from "../src/kernel/build.js";
import { parseProject } from "../src/core/project.js";
import { exampleProject, rectSketchFeature } from "../src/core/examples.js";

const require = createRequire(import.meta.url);
const R = await import("replicad");
const ocInit = (await import("replicad-opencascadejs")).default;
const OC = await ocInit({ locateFile: () => require.resolve("replicad-opencascadejs/wasm") });
R.setOC(OC);
const K = createKernel(R);

const invalidWarnings = (res) => Object.entries(res.status).filter(([, s]) => /Körper ungültig/.test(s.warning || ""));

test("Körperprüfung: Quader gültig, selbstschneidende Extrusion ungültig", () => {
  assert.equal(K.shapeValid(R.makeBaseBox(10, 20, 30)), true);
  // »Schleife«: Kontur kreuzt sich selbst – ein typischer Fehler aus einer Skizze
  const bow = R.draw([0, 0]).lineTo([10, 10]).lineTo([10, 0]).lineTo([0, 10]).close().sketchOnPlane("XY").extrude(5);
  assert.equal(K.shapeValid(bow), false);
});

test("Körperprüfung: Beispielprojekt und v1-Referenzdatei ohne Hinweis", async () => {
  const fixture = parseProject(fs.readFileSync(new URL("./fixtures/beispiel-v1.wcad", import.meta.url), "utf8"));
  for (const prj of [exampleProject(), fixture]) {
    for (const d of prj.docs.filter((x) => x.kind === "part")) {
      const res = await K.buildPart(d, { useCache: false });
      assert.deepEqual(invalidWarnings(res), [], d.name);
      assert.ok(res.bodies.every((b) => !b.invalid), d.name);
    }
  }
});

test("Körperprüfung: Laufzeit bleibt im Rahmen", async () => {
  const parts = exampleProject().docs.filter((x) => x.kind === "part");
  const run = async (validate) => {
    const t = performance.now();
    for (const d of parts) await createKernel(R).buildPart(d, { useCache: false, validate });
    return performance.now() - t;
  };
  await run(false); // Aufwärmen
  const without = await run(false);
  const withCheck = await run(true);
  console.log(`[info] Beispielprojekt ohne Prüfung ${without.toFixed(0)} ms, mit Prüfung ${withCheck.toFixed(0)} ms`);
  // großzügig, damit langsame CI-Rechner nicht scheitern: Prüfung darf den Aufbau höchstens verdoppeln
  assert.ok(withCheck < without * 2 + 200, `${withCheck} ms gegenüber ${without} ms`);
});

// ---------- V-2: Vorab-Prüfregeln, klare Meldung statt OCCT-Ausnahme ----------
const part = (features) => ({ id: "p", kind: "part", name: "Test", params: [], features });
const profile = (o) => ({ id: "pr", type: "profile", section: "vierkant", dims: { B: "40", t: "3", r: "6" }, length: "500", start: ["0", "0", "0"], axis: "X", ...o });
const errorOf = async (features, id) => {
  const res = await K.buildPart(part(features), { useCache: false });
  return res.status[id].ok ? null : res.status[id].error;
};

test("Vorabprüfung Profil: Gehrung außerhalb ±90° und kreuzende Schnitte", async () => {
  assert.match(await errorOf([profile({ miterStart: "120" })], "pr"), /Gehrung Anfang muss zwischen −90° und 90°/);
  assert.match(await errorOf([profile({ miterEnd: "-90" })], "pr"), /Gehrung Ende/);
  // 40er Rohr mit 45°/45° gegensinnig braucht mindestens 40 mm
  assert.match(await errorOf([profile({ length: "30", miterStart: "45", miterEnd: "45" })], "pr"), /zu kurz.*mindestens 40 mm/);
  assert.equal(await errorOf([profile({ length: "40", miterStart: "45", miterEnd: "45" })], "pr"), null);
  // gleichsinnig (Parallelogramm) kreuzen sich die Schnitte nie
  assert.equal(await errorOf([profile({ length: "20", miterStart: "45", miterEnd: "45", miterSame: true })], "pr"), null);
  // Kippung um die andere Querachse nutzt die andere Profilhöhe
  const rect = { section: "rechteck", dims: { B: "80", H: "40", t: "3", r: "6" }, miterStart: "45", miterEnd: "45" };
  const short = [await errorOf([profile({ ...rect, length: "60" })], "pr"), await errorOf([profile({ ...rect, length: "60", miterAxis: "u" })], "pr")];
  assert.equal(short.filter(Boolean).length, 1, JSON.stringify(short));
});

test("Vorabprüfung Profil: Wandstärke nennt die Grenze", async () => {
  assert.match(await errorOf([profile({ dims: { B: "40", t: "20", r: "0" } })], "pr"), /Wandstärke zu groß: muss kleiner als 20 mm sein/);
  assert.match(await errorOf([profile({ section: "rohr", dims: { D: "33,7", t: "17" } })], "pr"), /kleiner als 16,85 mm/);
});

test("Vorabprüfung Extrusion, Rotation, Bohrung, Wandung", async () => {
  const sk = rectSketchFeature("s1", "XZ", 0, 10, 0, "10", "30");
  assert.match(await errorOf([sk, { id: "e", type: "extrude", sketch: "s1", mode: "twoSided", distance: "5", distance2: "-5" }], "e"), /Abstand \+ Abstand 2 muss > 0/);
  assert.match(await errorOf([sk, { id: "r", type: "revolve", sketch: "s1", axis: "y", angle: "0" }], "r"), /Winkel muss zwischen 0° und 360°/);
  assert.match(await errorOf([sk, { id: "r", type: "revolve", sketch: "s1", axis: "y", angle: "400" }], "r"), /Winkel/);
  const box = [rectSketchFeature("s1", "XY", 0, 0, 0, "100", "40"), { id: "e1", type: "extrude", sketch: "s1", distance: "10" }];
  assert.match(await errorOf([...box, { id: "sh", type: "shell", thickness: "0", faces: [{ p: [50, 20, 10] }] }], "sh"), /Wandstärke muss ≠ 0/);
  const pts = { id: "s2", type: "sketch", name: "s2", plane: { ref: "XY" }, offset: "10", points: [{ id: "h0", x: 50, y: 20 }], entities: [{ id: "pe0", type: "point", p: "h0" }], constraints: [] };
  assert.match(await errorOf([...box, pts, { id: "h", type: "hole", sketch: "s2", diameter: "5", extent: "depth", depth: "0" }], "h"), /Tiefe muss > 0/);
});
