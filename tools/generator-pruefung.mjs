// Generator-Prüfung: baut Testmodelle aller Generatoren im Geometrie-Kern und prüft
//  – Kollisionen (Durchdringung zweier Körper > 1 mm³, z. B. Schraube ohne Bohrung, Stab ohne Loch im Gurt)
//  – lose Teile (Körper ohne Berührung zu einem anderen Körper, Luft > 0,5 mm)
//  – Verschraubungen: Schraube braucht in jedem geklemmten Teil eine Bohrung (zeigt sich als Kollision)
// Aufruf: node --stack-size=8000 tools/generator-pruefung.mjs [Ausgabeordner] [Filter]
// Ergebnis: <Ausgabe>/bericht.json und je Fall <name>.mesh.json (für tools/generator-bilder.mjs).

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createKernel } from "../src/kernel/build.js";
import { defaultGenerator } from "../src/core/generator.js";
import { defaultGestell } from "../src/core/gestell.js";

const require = createRequire(import.meta.url);
const R = await import("replicad");
const ocInit = (await import("replicad-opencascadejs")).default;
const OC = await ocInit({ locateFile: () => require.resolve("replicad-opencascadejs/wasm") });
R.setOC(OC);
const K = createKernel(R);

const out = process.argv[2] || "pruef-out";
const filter = process.argv[3] ? new RegExp(process.argv[3]) : null;
fs.mkdirSync(out, { recursive: true });

const up = [0, 0, 1];
const rect = [[0, 0, 0], [1200, 0, 0], [1200, 800, 0], [0, 800, 0]];
const gestellSegs = [...rect.map((a, i) => ({ id: "s" + i, a, b: rect[(i + 1) % 4], up, label: "Linie " + (i + 1) })), { id: "m", a: [600, 0, 0], b: [600, 800, 0], up, label: "Mitte" },
  ...rect.map((a, i) => ({ id: "v" + i, a, b: [a[0], a[1], 700], up: [1, 0, 0], label: "Bein " + (i + 1) }))];

/** Testfälle: Name, Generator, geänderte Parameter */
export const CASES = [
  ["gelaender-staketen", "gelaender", { runs: "3000; 1500" }],
  ["gelaender-kreuz", "gelaender", { fill: "kreuz" }],
  ["gelaender-kreuz-ohne-ring", "gelaender", { fill: "kreuz", ring: false }],
  ["gelaender-rahmen", "gelaender", { fill: "rahmen" }],
  ["gelaender-blech", "gelaender", { fill: "blech" }],
  ["gelaender-glas", "gelaender", { fill: "glas" }],
  ["gelaender-quer", "gelaender", { fill: "quer" }],
  ["gelaender-industrie", "gelaender", { use: "industrie", height: "1100" }],
  ["gelaender-seitlich-profil", "gelaender", { base: "seitlich", mTarget: "profil" }],
  ["gelaender-fussplatte", "gelaender", { base: "fussplatte", beltMode: "zwischen" }],
  ["treppe-gerade", "treppe", {}],
  ["treppe-gerade-staketen", "treppe", { gelFill: "staketen", gelMount: "oben" }],
  ["treppe-upn", "treppe", { support: "upn" }],
  ["treppe-holm2", "treppe", { support: "holm2", gelMount: "oben" }],
  ["treppe-holm1", "treppe", { support: "holm1", gel: "keine" }],
  ["treppe-L", "treppe", { form: "L" }],
  ["treppe-U", "treppe", { form: "U", gap: "200" }],
  ["spindel", "spindel", {}],
  ["spindel-fussplatte", "spindel", { stabMount: "oben" }],
  ["balkon", "balkon", {}],
  ["balkon-seitlich", "balkon", { railMount: "seitlich" }],
  ["tor-stich", "tor", {}],
  ["tor-gerade", "tor", { form: "gerade", leaves: "1" }],
  ["schiebetor", "schiebetor", {}],
  ["schiebetor-gerade", "schiebetor", { tailForm: "gerade", fill: "quer" }],
  ["zaun", "zaun", { length: "5000" }],
  ["zaun-fussplatte-blech", "zaun", { length: "5000", base: "fussplatte", fill: "blech", terrain: "gefaelle" }],
  ["windverband", "windverband", {}],
  ["pfette", "pfette", { spans: "5000; 5000; 5000" }],
  ["rahmenecke", "rahmenecke", {}],
  ["gestell", "gestell", null],
];

function feature(gen, over) {
  if (gen === "gestell") {
    const g = defaultGestell("sk", gestellSegs);
    return { id: "f", type: "generator", gen: "gestell", params: { input: { ...g, segments: gestellSegs } } };
  }
  const f = defaultGenerator(gen);
  Object.assign(f.params, over);
  return { id: "f", ...f };
}

const bbox = (s) => { const b = s.boundingBox.bounds; return { lo: b[0], hi: b[1] }; };
const boxGap = (a, b) => Math.max(0, ...[0, 1, 2].map((k) => Math.max(a.lo[k] - b.hi[k], b.lo[k] - a.hi[k])));

export async function checkCase([name, gen, over]) {
  const t0 = Date.now();
  const res = await K.buildPart({ id: "p-" + name, kind: "part", name, params: [], features: [feature(gen, over)] }, { useCache: false, validate: false });
  const st = res.status.f;
  if (!st?.ok) return { name, gen, error: st?.error || "Aufbau fehlgeschlagen" };
  const bodies = res.bodies.map((b, i) => ({ i, name: b.name, shape: b.shape, norm: !!b.meta?.norm, box: bbox(b.shape) }));
  // Kollisionen
  const coll = [];
  for (let i = 0; i < bodies.length; i++)
    for (let j = i + 1; j < bodies.length; j++) {
      if (boxGap(bodies[i].box, bodies[j].box) > 1e-3) continue;
      // Teile einer Verschraubung (Schraube, Scheibe, Mutter) untereinander zählen nicht
      if (bodies[i].norm && bodies[j].norm) continue;
      let v = 0;
      try { v = R.measureVolume(bodies[i].shape.clone().intersect(bodies[j].shape.clone())); } catch { v = NaN; }
      if (!(v <= 1)) coll.push({ a: bodies[i].name, b: bodies[j].name, ia: i, ib: j, volume: Math.round(v * 10) / 10 });
    }
  // Berührung: kleinster Abstand zu irgendeinem anderen Körper
  const touch = bodies.map(() => []);
  for (let i = 0; i < bodies.length; i++)
    for (let j = i + 1; j < bodies.length; j++) {
      if (boxGap(bodies[i].box, bodies[j].box) > 0.5) continue;
      let d = 0;
      try { d = R.measureDistanceBetween(bodies[i].shape, bodies[j].shape); } catch { d = 0; }
      if (d <= 0.5) { touch[i].push(j); touch[j].push(i); }
    }
  const loose = bodies.filter((b, i) => !touch[i].length).map((b) => ({ name: b.name, i: b.i }));
  // zusammenhängende Gruppen
  const comp = new Array(bodies.length).fill(-1);
  let nc = 0;
  for (let i = 0; i < bodies.length; i++) {
    if (comp[i] >= 0) continue;
    const stack = [i]; comp[i] = nc;
    while (stack.length) { const k = stack.pop(); for (const j of touch[k]) if (comp[j] < 0) { comp[j] = nc; stack.push(j); } }
    nc++;
  }
  const groups = Array.from({ length: nc }, (_, c) => bodies.filter((b, i) => comp[i] === c).map((b) => b.name));
  // Netz für die Bilder
  const meshes = bodies.map((b) => {
    const m = b.shape.mesh({ tolerance: 0.5, angularTolerance: 0.4 });
    const e = b.shape.meshEdges({ tolerance: 0.5, angularTolerance: 0.4 });
    return { name: b.name, norm: b.norm, v: Array.from(m.vertices, (x) => Math.round(x * 10) / 10), t: Array.from(m.triangles), l: Array.from(e.lines, (x) => Math.round(x * 10) / 10) };
  });
  const bad = new Set([...coll.flatMap((c) => [c.ia, c.ib])]), lose = new Set(loose.map((l) => l.i));
  meshes.forEach((m, i) => { m.flag = bad.has(i) ? "kollision" : lose.has(i) ? "lose" : ""; });
  fs.writeFileSync(path.join(out, name + ".mesh.json"), JSON.stringify(meshes));
  return { name, gen, bodies: bodies.length, info: st.info, warning: st.warning || "", collisions: coll.map(({ ia, ib, ...c }) => c), loose: loose.map((l) => l.name), groups: groups.length > 1 ? groups.map((g) => (g.length > 6 ? [...g.slice(0, 6), `… (${g.length})`] : g)) : [], ms: Date.now() - t0 };
}

const report = [];
for (const c of CASES) {
  if (filter && !filter.test(c[0])) continue;
  let r;
  try { r = await checkCase(c); } catch (e) { r = { name: c[0], gen: c[1], error: e.message }; }
  report.push(r);
  console.log(`${r.name}: ${r.error ? "FEHLER " + r.error : `${r.bodies} Körper, ${r.collisions.length} Kollisionen, ${r.loose.length} lose, ${r.groups.length || 1} Gruppe(n)`}`);
}
fs.writeFileSync(path.join(out, "bericht.json"), JSON.stringify(report, null, 1));
