// Körperprüfung (V-1): ungültige Körper werden als Hinweis gemeldet, gültige nicht
// (benötigt replicad + OpenCascade, läuft in CI)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { createKernel } from "../src/kernel/build.js";
import { parseProject } from "../src/core/project.js";
import { exampleProject } from "../src/core/examples.js";

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
