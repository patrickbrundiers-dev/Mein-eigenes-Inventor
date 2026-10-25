// Geometrie-Referenzfälle (Fusion-Abgleich FU14): repräsentative Bauteile mit gespeicherten Sollwerten.
// Jeder Fall wird neu gebaut und mit test/fixtures/referenz.json verglichen: Körperzahl, Namen, Volumen,
// Hüllquader, Zuschnittlänge, Gehrungen, Profil-ID, Bohrungen, Meldungen. Toleranzen stehen unten fest.
// Sollwerte neu schreiben (nur nach geprüfter, gewollter Änderung): REFERENZ_NEU=1 node --test test/referenz-kernel.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createKernel } from "../src/kernel/build.js";
import { exampleProject } from "../src/core/examples.js";
import { defaultGenerator } from "../src/core/generator.js";
import { defaultKnickrahmen } from "../src/core/knickrahmen.js";
import { defaultKantteil } from "../src/core/blech.js";
import { defaultBiegerohr } from "../src/core/biegerohr.js";
import { defaultGestell, gestellPlan } from "../src/core/gestell.js";
import { groupParts } from "../src/core/genteil.js";
import { catalogToDims } from "../src/core/sections.js";

const require = createRequire(import.meta.url);
const R = await import("replicad");
const ocInit = (await import("replicad-opencascadejs")).default;
const OC = await ocInit({ locateFile: () => require.resolve("replicad-opencascadejs/wasm") });
R.setOC(OC);
const K = createKernel(R);

const FILE = new URL("./fixtures/referenz.json", import.meta.url);
const NEU = !!process.env.REFERENZ_NEU;
const stored = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
const fresh = {};

/** Toleranzen: Längen und Lagen ±0,01 mm, Winkel ±0,01°, Volumen ±0,5 mm³ oder 1 ppm */
const TOL = { len: 0.01, deg: 0.01, volAbs: 0.5, volRel: 1e-6 };
const r3 = (v) => Math.round(v * 1000) / 1000;

const part = (features, name = "Referenz") => ({ id: "ref-" + name, kind: "part", name, params: [], features });

/** Sollwerte eines Rechenergebnisses */
function snapshot(res) {
  const bad = Object.entries(res.status).filter(([, s]) => !s.ok).map(([k, s]) => `${k}: ${s.error}`);
  const bodies = res.bodies.map((b) => {
    const bb = b.shape.boundingBox.bounds;
    const m = b.meta || {};
    const o = { name: b.name || "", kind: b.kind || "", volume: r3(R.measureVolume(b.shape)), box: [...bb[0], ...bb[1]].map(r3) };
    if (m.profileId) o.profileId = m.profileId;
    if (Number.isFinite(m.length)) o.length = r3(m.length);
    if (Number.isFinite(m.miterStart)) o.miters = [r3(m.miterStart), r3(m.miterEnd || 0)];
    if (m.drills) o.drills = m.drills;
    if (m.sheet?.flat) o.flat = r3(m.sheet.flat);
    return o;
  }).sort((a, b) => a.name.localeCompare(b.name, "de") || a.volume - b.volume);
  const notes = Object.values(res.status).flatMap((s) => [s.info, s.warning].filter(Boolean)).sort();
  return { errors: bad, count: bodies.length, bodies, notes };
}

/** Vergleich mit Toleranz; meldet die erste Abweichung mit Pfad */
function compare(got, want, path = "") {
  if (typeof want === "number") {
    const key = path.split(".").pop();
    const tol = key === "volume" ? Math.max(TOL.volAbs, Math.abs(want) * TOL.volRel) : /miters/.test(path) ? TOL.deg : TOL.len;
    assert.ok(typeof got === "number" && Math.abs(got - want) <= tol, `${path}: ${got} statt ${want} (±${tol})`);
  } else if (Array.isArray(want)) {
    assert.ok(Array.isArray(got), `${path}: keine Liste`);
    assert.equal(got.length, want.length, `${path}: Anzahl ${got.length} statt ${want.length}`);
    want.forEach((w, i) => compare(got[i], w, `${path}[${i}]`));
  } else if (want && typeof want === "object") {
    assert.deepEqual(Object.keys(got || {}).sort(), Object.keys(want).sort(), `${path}: andere Felder`);
    for (const k of Object.keys(want)) compare(got[k], want[k], path ? `${path}.${k}` : k);
  } else assert.equal(got, want, path);
}

async function check(name, res) {
  const snap = snapshot(res);
  assert.deepEqual(snap.errors, [], `${name}: Rechenfehler`);
  fresh[name] = snap;
  if (NEU) return;
  assert.ok(stored[name], `${name}: keine Sollwerte – mit REFERENZ_NEU=1 anlegen und das Ergebnis prüfen`);
  compare(snap, stored[name], name);
}

test("Referenz: Beispielprojekt Schweißrahmen (alle Bauteile)", async () => {
  const prj = exampleProject();
  for (const p of prj.docs.filter((d) => d.kind === "part")) await check("Beispiel " + p.name, await K.buildPart(p));
});

test("Referenz: Knickrahmen (Vorgabe)", async () => {
  await check("Knickrahmen", await K.buildPart(part([{ id: "kr", ...defaultKnickrahmen(catalogToDims("rechteck", "60x40x3")) }], "Knickrahmen")));
});

test("Referenz: Kantteil (Vorgabe) und Rohr gebogen", async () => {
  await check("Kantteil", await K.buildPart(part([{ id: "kt", ...defaultKantteil() }], "Kantteil")));
  await check("Rohr gebogen", await K.buildPart(part([{ id: "br", ...defaultBiegerohr(catalogToDims("rohr", "48.3x2.6")) }], "Biegerohr")));
});

test("Referenz: Geländer über Eck, Tor, Treppe mit Geländer, Zaun", async () => {
  const gel = { id: "g", ...defaultGenerator("gelaender") };
  gel.params.runs = "3000; 1500";
  await check("Geländer über Eck", await K.buildPart(part([gel], "Gelaender")));
  await check("Tor", await K.buildPart(part([{ id: "t", ...defaultGenerator("tor") }], "Tor")));
  const tr = { id: "tr", ...defaultGenerator("treppe") };
  await check("Treppe", await K.buildPart(part([tr], "Treppe")));
  await check("Zaun", await K.buildPart(part([{ id: "z", ...defaultGenerator("zaun") }], "Zaun")));
});

test("Referenz: Gestell mit Gehrung und Mittelstab (Einzelteile)", async () => {
  const up = [0, 0, 1];
  const P = [[0, 0, 0], [1000, 0, 0], [1000, 600, 0], [0, 600, 0]];
  const segments = [...P.map((a, i) => ({ id: "s" + i, a, b: P[(i + 1) % 4], up, label: "Linie " + (i + 1) })), { id: "m", a: [500, 0, 0], b: [500, 600, 0], up, label: "Mitte" }];
  const g = defaultGestell("sk", segments);
  const groups = groupParts(gestellPlan({ ...g, segments }));
  for (const [i, gr] of groups.entries()) {
    const input = { ...g, segments };
    await check(`Gestell Teil ${i + 1}`, await K.buildPart({ id: "gs" + i, kind: "part", name: "Teil", params: [], features: [{ id: "f", type: "genteil", gen: "gestell", params: { input }, key: gr.key, body: gr.key }] }));
  }
});

test.after(() => {
  if (!NEU) return;
  writeFileSync(FILE, JSON.stringify({ ...stored, ...fresh }, null, 1) + "\n");
  console.log("[info] Sollwerte geschrieben:", Object.keys(fresh).join(", "));
});
