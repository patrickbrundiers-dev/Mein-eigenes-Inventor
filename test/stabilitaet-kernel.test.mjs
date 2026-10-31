// Stabilität/Leistung im Geometrie-Kern: gezogene Wendel-Rohre gröber vernetzen, schwere Fehler nicht verschlucken
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

test("Wendel-Rohr: Netz eine Stufe gröber, gerade Körper unverändert", () => {
  const r = 870, sweep = 20, rise = 120;
  const spine = R.assembleWire([R.makeHelix((rise * 360) / sweep, rise, r, [0, 0, 0], [0, 0, 1], false)]);
  const o = spine.startPoint.toTuple(), z = spine.tangentAt(0).normalized().toTuple();
  const pl = new R.Plane(o, [o[0], o[1], -(o[0] * z[0] + o[1] * z[1]) / (z[2] || 1)], z);
  const tube = R.genericSweep(R.drawCircle(21.2).sketchOnPlane(pl).wire, spine, { frenet: true });
  const fine = K.meshBody(tube, "normal"), coarse = K.meshBody(tube, "normal", { swept: true });
  assert.ok(coarse.indices.length < fine.indices.length / 2, `${coarse.indices.length / 3} statt ${fine.indices.length / 3} Dreiecke`);
  assert.ok(coarse.indices.length / 3 > 1000, "noch rund");
  const box = R.makeBox([0, 0, 0], [10, 20, 30]);
  assert.equal(K.meshBody(box, "normal", { swept: true }).indices.length, K.meshBody(box, "normal").indices.length);
});
