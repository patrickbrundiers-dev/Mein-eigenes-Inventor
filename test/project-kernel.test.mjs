// Projektdatei mit Geometrie: eine gespeicherte v1-Datei muss mit dem aktuellen Kern
// dieselben Körper ergeben (benötigt replicad + OpenCascade, läuft in CI)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { createKernel } from "../src/kernel/build.js";
import { parseProject, serializeProject } from "../src/core/project.js";

const require = createRequire(import.meta.url);
const R = await import("replicad");
const ocInit = (await import("replicad-opencascadejs")).default;
const OC = await ocInit({ locateFile: () => require.resolve("replicad-opencascadejs/wasm") });
R.setOC(OC);
const K = createKernel(R);

const vol = (res) => res.bodies.reduce((s, b) => s + R.measureVolume(b.shape), 0);

// Werte beim Einfrieren der Datei (24.10.2026, Commit cf39217) gemessen.
// Toleranz 1 mm³: OCCT rechnet Volumen auf ~1e-9 relativ genau; mehr Abweichung heißt,
// dass der Kern die gespeicherten Features anders aufbaut als früher.
const EXPECTED = {
  beispiel_platte: { bodies: 1, volume: 594267.2563597336 },
  beispiel_rahmen: { bodies: 5, volume: 1582294.4861922148 },
  beispiel_rohr: { bodies: 1, volume: 148616.19131732645 },
};

test("v1-Projektdatei baut wie beim Einfrieren und übersteht Speichern → Laden", async () => {
  const text = fs.readFileSync(new URL("./fixtures/beispiel-v1.wcad", import.meta.url), "utf8");
  const prj = parseProject(text);
  const again = parseProject(serializeProject(structuredClone(prj)));
  const parts = prj.docs.filter((d) => d.kind === "part");
  assert.deepEqual(parts.map((d) => d.id), Object.keys(EXPECTED));
  for (const d of parts) {
    const res = await K.buildPart(d);
    const bad = Object.entries(res.status).filter(([, s]) => !s.ok);
    assert.equal(bad.length, 0, d.name + ": " + JSON.stringify(bad));
    assert.equal(res.bodies.length, EXPECTED[d.id].bodies, d.name + " Körperzahl");
    const v = vol(res);
    assert.ok(Math.abs(v - EXPECTED[d.id].volume) <= 1, `${d.name}: Volumen ${v} ≠ ${EXPECTED[d.id].volume}`);
    // frischer Kern, damit nichts aus dem Zwischenspeicher kommt
    const res2 = await createKernel(R).buildPart(again.docs.find((x) => x.id === d.id));
    assert.ok(Math.abs(vol(res2) - v) <= 1e-6, d.name + ": nach Roundtrip anderes Volumen");
  }
});
