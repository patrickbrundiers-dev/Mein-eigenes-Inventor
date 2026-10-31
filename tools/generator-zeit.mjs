// Generator-Laufzeit messen: baut einen Generator im Geometrie-Kern und vernetzt ihn wie die Oberfläche.
// Lauf 1 ohne Zwischenspeicher (wie nach dem Öffnen oder einem Kern-Neustart), weitere Läufe mit.
// Aufruf: node --stack-size=8000 tools/generator-zeit.mjs <generator> ['{"param":"wert"}'] [Läufe]
// Ausgabe: Bau- und Netzzeit je Lauf, danach die fünf Körpergruppen mit der längsten Netzzeit.
import { createRequire } from "node:module";
import { createKernel } from "../src/kernel/build.js";
import { defaultGenerator } from "../src/core/generator.js";

const require = createRequire(import.meta.url);
const R = await import("replicad");
const ocInit = (await import("replicad-opencascadejs")).default;
const OC = await ocInit({ locateFile: () => require.resolve("replicad-opencascadejs/wasm") });
R.setOC(OC);
const K = createKernel(R);

const gen = process.argv[2] || "spindel";
const f = { id: "f", ...defaultGenerator(gen) };
Object.assign(f.params, JSON.parse(process.argv[3] || "{}"));
const runs = Number(process.argv[4] || 1);
const part = { id: "p-zeit", kind: "part", name: gen, params: [], features: [f] };
for (let i = 0; i < runs; i++) {
  const t0 = performance.now();
  const res = await K.buildPart(part, { useCache: i > 0, validate: false });
  const t1 = performance.now(), by = {};
  let tris = 0;
  for (const b of res.bodies) {
    const s = performance.now();
    tris += K.meshBody(b.shape, "normal", { swept: !!b.meta?.rolled }).indices.length / 3;
    const k = String(b.name || b.kind).replace(/\s*[\d.]+$/, "");
    by[k] = (by[k] || 0) + performance.now() - s;
  }
  console.log(`${gen} Lauf ${i + 1}: Bau ${(t1 - t0).toFixed(0)} ms, Netz ${(performance.now() - t1).toFixed(0)} ms, ${res.bodies.length} Körper, ${Math.round(tris)} Dreiecke`);
  if (i === 0) console.log("  " + Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, t]) => `${k} ${t.toFixed(0)} ms`).join(" · "));
}
