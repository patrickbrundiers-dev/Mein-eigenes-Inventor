// Leistungsmessung aller Generator-Prüfmodelle: Bauzeit (ohne Zwischenspeicher), Netzzeit, Körper, Dreiecke.
// Aufruf: node --stack-size=8000 tools/leistung-generatoren.mjs [Filter] [--json datei] [--cache] [--aendern '{"k":"v"}']
// Netz = Anzeigenetz und Körperwerte wie im Kern-Worker (meshBodyCached/bodyPropsCached, sonst meshBody/bodyProps).
// --cache misst zusätzlich einen zweiten Bau mit Zwischenspeicher samt Netz, mit --aendern geänderten Parametern
// (wie nach einer Maßänderung).
import fs from "node:fs";
import { createRequire } from "node:module";
import { createKernel } from "../src/kernel/build.js";
import { CASES, feature } from "./generator-faelle.mjs";

const require = createRequire(import.meta.url);
const R = await import("replicad");
const ocInit = (await import("replicad-opencascadejs")).default;
const OC = await ocInit({ locateFile: () => require.resolve("replicad-opencascadejs/wasm") });
R.setOC(OC);
const K = createKernel(R);

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const filterArg = args.find((a, i) => !a.startsWith("--") && !["--json", "--aendern"].includes(args[i - 1]));
const filter = filterArg ? new RegExp(filterArg) : null;
const rows = [];
for (const [name, gen, over] of CASES) {
  if (filter && !filter.test(name)) continue;
  const part = { id: "p-" + name, kind: "part", name, params: [], features: [feature(gen, over)] };
  const t0 = performance.now();
  const res = await K.buildPart(part, { useCache: false, validate: false });
  const t1 = performance.now();
  let tris = 0;
  const meshAll = (r) => { let n = 0; for (const b of r.bodies) { n += (K.meshBodyCached || K.meshBody)(b.shape, "normal", { swept: !!b.meta?.rolled }).indices.length / 3; (K.bodyPropsCached || K.bodyProps)(b.shape); } return n; };
  tris = meshAll(res);
  const t2 = performance.now();
  const row = { name, bauMs: Math.round(t1 - t0), netzMs: Math.round(t2 - t1), koerper: res.bodies.length, dreiecke: Math.round(tris) };
  if (flag("--cache")) {
    const c0 = performance.now();
    const p2 = val("--aendern") ? { ...part, features: [{ ...part.features[0], params: { ...part.features[0].params, ...JSON.parse(val("--aendern")) } }] } : part;
    meshAll(await K.buildPart(p2, { useCache: true, validate: false }));
    row.cacheMs = Math.round(performance.now() - c0);
  }
  rows.push(row);
  console.log(`${name.padEnd(36)} Bau ${String(row.bauMs).padStart(6)} ms  Netz ${String(row.netzMs).padStart(6)} ms  ${String(row.koerper).padStart(4)} Körper ${String(row.dreiecke).padStart(8)} Dreiecke${row.cacheMs != null ? `  erneut ${row.cacheMs} ms` : ""}`);
}
const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
console.log(`Summe: Bau ${(sum("bauMs") / 1000).toFixed(1)} s, Netz ${(sum("netzMs") / 1000).toFixed(1)} s, ${rows.length} Modelle`);
if (val("--json")) fs.writeFileSync(val("--json"), JSON.stringify(rows, null, 1));
