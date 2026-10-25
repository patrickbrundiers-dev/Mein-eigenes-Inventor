// Gestell-Generator (Inventor Konstruktion → Gestell): Einzelteile im Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createKernel } from "../src/kernel/build.js";
import { defaultGestell, setJoint, gestellPlan } from "../src/core/gestell.js";
import { groupParts } from "../src/core/genteil.js";

const require = createRequire(import.meta.url);
const R = await import("replicad");
const ocInit = (await import("replicad-opencascadejs")).default;
const OC = await ocInit({ locateFile: () => require.resolve("replicad-opencascadejs/wasm") });
R.setOC(OC);
const K = createKernel(R);

const near = (a, b, tol, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b} (±${tol})`);
const vol = (res) => res.bodies.reduce((s, b) => s + R.measureVolume(b.shape), 0);

const up = [0, 0, 1];
const P = [[0, 0, 0], [1000, 0, 0], [1000, 600, 0], [0, 600, 0]];
const segments = [...P.map((a, i) => ({ id: "s" + i, a, b: P[(i + 1) % 4], up, label: "Linie " + (i + 1) })), { id: "m", a: [500, 0, 0], b: [500, 600, 0], up, label: "Mitte" }];

/** Ein Einzelteil des Gestells bauen, wie es die Baugruppe anlegt */
async function buildBody(g, key) {
  const input = { ...g, segments };
  const res = await K.buildPart({ id: "p" + Math.random(), kind: "part", name: "Teil", params: [], features: [{ id: "f", type: "genteil", gen: "gestell", params: { input }, key, body: key }] });
  assert.ok(res.status.f.ok, JSON.stringify(res.status.f));
  return res;
}

test("Gestell: Gehrung, Auf Gestell stutzen und Nuten als Einzelteile (Länge und Volumen)", async () => {
  const g = defaultGestell("sk", segments);
  const groups = groupParts(gestellPlan({ ...g, segments }));
  assert.equal(groups.length, 3, "Längsstäbe, Querstäbe, Mittelstab");
  const A = 40 * 40 - 34 * 34; // ohne Radien, nur Größenordnung
  // Längsstab mit Gehrung an beiden Enden: Zuschnitt außen 1040, Achse 1000
  const r1 = await buildBody(g, groups[0].key);
  near(r1.bodies[0].meta.length, 1040, 0.5, "Zuschnittlänge Gehrung");
  near(r1.bodies[0].meta.miterStart, 45, 0.1);
  // Mittelstab: zwischen den Innenflächen gestutzt = 560
  const mid = groups.find((x) => x.bodies.some((b) => b.name.endsWith(" 5")));
  const r5 = await buildBody(g, mid.key);
  near(r5.bodies[0].meta.length, 560, 0.5, "Auf Gestell stutzen");
  // Nuten statt Stutzen: Stab läuft bis zur Achse, die Form des Gegenprofils wird ausgeklinkt
  setJoint(g, "nuten", "gm1", "gm5");
  setJoint(g, "nuten", "gm3", "gm5");
  const mid2 = groupParts(gestellPlan({ ...g, segments })).find((x) => x.bodies.some((b) => b.name.endsWith(" 5")));
  const r5n = await buildBody(g, mid2.key);
  // gleich große Rechteckrohre: die Ausklinkung nimmt den ganzen Querschnitt bis zur Fläche, nur in den Eckradien bleibt mehr stehen
  const L5 = r5n.bodies[0].meta.length;
  assert.ok(r5n.bodies[0].meta.coped && L5 > 560 && L5 < 600, "Nuten: Länge " + L5);
  // Volumen: Stab um die Wandteile des Gegenprofils größer als gestutzt, aber kleiner als ungeschnitten
  const v5 = vol(r5), v5n = vol(r5n);
  assert.ok(v5n > v5 && v5n < v5 + 2 * 20 * A, `Volumen ${v5n} gegen ${v5}`);
});

test("Gestell: Eckverbindung, Verlängern und Wiederverwenden teilen sich ein Bauteil", async () => {
  const g = defaultGestell("sk", segments);
  setJoint(g, "ecke", "gm1", "gm2"); // Stab 1 läuft bis zur Außenseite von Stab 2
  g.members[0].extA = "15";
  const plan = gestellPlan({ ...g, segments });
  const row1 = plan.rows.find((r) => r.no === 1), row2 = plan.rows.find((r) => r.no === 2);
  near(row1.len, 1000 + 20 + 15 - 0, 0.01, "Achse Stab 1"); // Ende B bis Außenseite (+20), Ende A Gehrung + 15
  near(row2.len, 600 - 20 - 0, 20.01, "Stab 2 stößt stumpf an");
  const r = await buildBody(g, groupParts(plan).find((x) => x.bodies.some((b) => b.name.endsWith(" 1"))).key);
  assert.ok(r.bodies[0].meta.length > 1050 && r.bodies[0].meta.length < 1060, "Zuschnitt " + r.bodies[0].meta.length);
  // Wiederverwenden: Stab 3 wie Stab 1 → gleiches Bauteil
  g.members[2].reuse = "gm1";
  const groups = groupParts(gestellPlan({ ...g, segments }));
  const same = groups.find((x) => x.bodies.some((b) => b.name.endsWith(" 1")));
  assert.ok(same.bodies.some((b) => b.name.endsWith(" 3")), "Stab 3 nutzt das Bauteil von Stab 1");
});

test("Gestell: Rundrohr am Rundrohr gestutzt bekommt den Sattelschnitt", async () => {
  const g = defaultGestell("sk", segments, { kind: "rohr", size: "48.3x2.6" });
  g.members[4].section = { kind: "rohr", size: "33.7x2.6" };
  const plan = gestellPlan({ ...g, segments });
  const mid = groupParts(plan).find((x) => x.bodies.some((b) => b.name.endsWith(" 5")));
  const r = await buildBody(g, mid.key);
  const m = r.bodies[0].meta;
  assert.ok(m.coped, "ausgeklinkt");
  // Sattel: oben und unten reicht das Rohr bis √(24,15² − 16,85²) ≈ 17,3 mm an die Achse des Gegenrohrs
  near(m.length, 600 - 2 * Math.sqrt(24.15 ** 2 - 16.85 ** 2), 0.6, "Länge über die Sattelspitzen");
});
