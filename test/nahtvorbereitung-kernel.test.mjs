// Nahtvorbereitung nach ISO 9692-1 (P5): Fugenflanken als Keilschnitt an der gewählten Blechkante
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createKernel } from "../src/kernel/build.js";
import { rectSketchFeature } from "../src/core/examples.js";

const require = createRequire(import.meta.url);
const R = await import("replicad");
const ocInit = (await import("replicad-opencascadejs")).default;
const OC = await ocInit({ locateFile: () => require.resolve("replicad-opencascadejs/wasm") });
R.setOC(OC);
const K = createKernel(R);

const near = (a, b, tol, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b} (±${tol})`);
const vol = (res) => res.bodies.reduce((s, b) => s + R.measureVolume(b.shape), 0);
const part = (features) => ({ id: "p" + Math.random(), kind: "part", name: "Test", params: [], features });
// Blech 100 × 40 × 10, Stirn bei x = 100, obere Stirnkante läuft in y
const block = [rectSketchFeature("s1", "XY", 0, 0, 0, "100", "40"), { id: "e1", type: "extrude", sketch: "s1", distance: "10" }];
const edge = [{ p: [100, 20, 10], type: "LINE" }];
const naht = (x) => ({ id: "n", type: "naht", a: "10", side: "pfeil", edges: edge, prep: true, ...x });
const V0 = 100 * 40 * 10;

test("Nahtvorbereitung: V, HV, Y und K schneiden die Fugenflanke nach ISO 9692-1", async () => {
  const t30 = Math.tan(Math.PI / 6);
  const cases = [
    [{ kind: "v" }, 0.5 * 9 * 9 * t30], // α 60 → Flanke 30°, c 1
    [{ kind: "hv" }, 0.5 * 9 * 9], // β 45, c 1
    [{ kind: "y" }, 0.5 * 8 * 8 * t30], // α 60, c 2
    [{ kind: "k" }, 2 * 0.5 * 4 * 4], // β 45, c 2, beidseitig
    [{ kind: "hv", angle: "30", root: "0" }, 0.5 * 10 * 10 * t30],
  ];
  for (const [x, area] of cases) {
    const res = await K.buildPart(part([...block, naht(x)]));
    assert.ok(res.status.n.ok, JSON.stringify(res.status.n));
    near(vol(res), V0 - area * 40, 0.5, JSON.stringify(x));
    assert.match(res.status.n.info, /Fugenflanke an 1 Kante/);
    assert.ok(res.welds[0].prep, "Vorbereitung in der Nahtliste");
  }
  // ohne Häkchen und bei I-Naht bleibt der Körper unverändert
  for (const x of [{ kind: "v", prep: false }, { kind: "i" }]) {
    const res = await K.buildPart(part([...block, naht(x)]));
    near(vol(res), V0, 1e-3, JSON.stringify(x));
  }
  // Steghöhe größer als Blechdicke → Fehler
  const bad = await K.buildPart(part([...block, naht({ kind: "v", root: "12" })]));
  assert.match(bad.status.n.error || "", /Steghöhe/);
});
