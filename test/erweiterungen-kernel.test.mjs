// Erweiterungen aus der Recherche 29.10.2026 (W1 …): Geometrie-Kern-Tests (replicad + OpenCascade)
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createKernel } from "../src/kernel/build.js";

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
const part = (features, extra = {}) => ({ id: "p" + Math.random(), kind: "part", name: "Test", params: [], features, ...extra });

test("W1 Verzinkungsbohrungen: Quadratrohr 40×3, Ø 12 an beiden Enden, nur wenn verzinkt", async () => {
  const prof = { id: "pr", type: "profile", section: "vierkant", dims: { B: "40", t: "3", r: "6" }, length: "1000", start: ["0", "0", "0"], axis: "X" };
  const flat = { id: "pl", type: "profile", section: "flach", dims: { B: "40", t: "8" }, length: "300", start: ["0", "200", "0"], axis: "X" };
  const zl = { id: "z", type: "zinkloch", target: "", ends: "beide", dir: "v", d: "", edge: "10" };
  const base = await K.buildPart(part([prof]));
  const roh = await K.buildPart(part([prof, zl]));
  okAll(roh);
  assert.match(roh.status.z.info, /nicht verzinkt/);
  near(vol(roh), vol(base), 1e-6, "ohne Verzinkung unverändert");

  const res = await K.buildPart(part([prof, flat, zl], { finish: { kind: "verzinkt" } }));
  okAll(res);
  assert.match(res.status.z.info, /2 Verzinkungsbohrung\(en\) in 1 Stab/);
  assert.match(res.status.z.info, /Ø 12 mm/);
  const tube = res.bodies.find((b) => b.fid === "pr");
  assert.deepEqual(tube.meta.vent, { n: 2, d: 12 });
  // 2 Bohrungen × 2 Wände à 3 mm (ebene Wandmitte)
  near(vol(base) - R.measureVolume(tube.shape), 4 * Math.PI * 36 * 3, 5, "Lochvolumen");

  const off = await K.buildPart(part([prof, { ...zl, onlyGalv: false }]));
  assert.match(off.status.z.info, /2 Verzinkungsbohrung/);
});
