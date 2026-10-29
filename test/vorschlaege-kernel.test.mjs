// Vorschläge nach 0.28 im Geometrie-Kern: Teile-Zwischenspeicher der Generatoren (N5)
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createKernel } from "../src/kernel/build.js";
import { defaultGenerator } from "../src/core/generator.js";

const require = createRequire(import.meta.url);
const R = await import("replicad");
const ocInit = (await import("replicad-opencascadejs")).default;
R.setOC(await ocInit({ locateFile: () => require.resolve("replicad-opencascadejs/wasm") }));
const K = createKernel(R);

test("N5: Generator neu berechnen – unveränderte Teile aus dem Zwischenspeicher, gleiches Ergebnis", async () => {
  const f = { id: "g", ...defaultGenerator("gelaender") };
  const part = (params) => ({ id: "p-cache", kind: "part", name: "Geländer", params: [], features: [{ ...f, params }] });
  const vol = (res) => res.bodies.map((b) => [b.name, Math.round(R.measureVolume(b.shape))]).sort();
  let t = Date.now();
  const a = await K.buildPart(part(f.params), { useCache: false, validate: false });
  const t1 = Date.now() - t;
  t = Date.now();
  const b = await K.buildPart(part({ ...f.params }), { useCache: false, validate: false });
  const t2 = Date.now() - t;
  assert.deepEqual(vol(b), vol(a), "gleiche Körper");
  assert.ok(t2 < t1 / 3, `zweiter Lauf schneller (${t1} → ${t2} ms)`);
  // Füllung ändern: Pfosten/Handlauf bleiben, Ergebnis wie ohne Speicher
  const c = await K.buildPart(part({ ...f.params, fill: "quer" }), { useCache: false, validate: false });
  const d = await K.buildPart({ ...part({ ...f.params, fill: "quer" }), id: "p-frisch" }, { useCache: false, validate: false });
  assert.deepEqual(vol(c), vol(d));
});
