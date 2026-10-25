// Gestell-Generator (Inventor Konstruktion → Gestell): Rechnung ohne Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { skeletonSegments, defaultGestell, addMember, removeMember, setJoint, gestellPlan, placeShift, gestellCsv } from "../src/core/gestell.js";
import { groupParts } from "../src/core/genteil.js";
import { planeFrame } from "../src/core/geom.js";

const near = (a, b, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b}`);
const up = [0, 0, 1];
const P = [[0, 0, 0], [1000, 0, 0], [1000, 600, 0], [0, 600, 0]];
const rect = () => [...P.map((a, i) => ({ id: "s" + i, a, b: P[(i + 1) % 4], up, label: "Linie " + (i + 1) })), { id: "m", a: [500, 0, 0], b: [500, 600, 0], up, label: "Mitte" }];

test("Skelett: Skizzenlinien in Weltlage, Profilzug als Stücke, Konstruktionslinien zählen nicht", () => {
  const sketch = { id: "sk", type: "sketch", name: "Skelett", plane: { ref: "XZ" }, points: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }, { id: "c", x: 100, y: 50 }], entities: [{ id: "l1", type: "line", p1: "a", p2: "b" }, { id: "l2", type: "line", p1: "b", p2: "c", construction: true }], constraints: [] };
  const pz = { id: "pz", type: "profilzug", up: "Z", points: [{ x: "0", y: "0", z: "0" }, { x: "0", y: "0", z: "500" }, { x: "300", y: "0", z: "0", rel: true }] };
  const segs = skeletonSegments({ features: [sketch, pz] }, { frameOf: (f) => planeFrame(f.plane), E: (x) => Number(x) });
  assert.equal(segs.length, 3);
  assert.deepEqual(segs[0].b, [100, 0, 0]);
  assert.deepEqual(segs[0].up, [0, -1, 0], "Profilhöhe senkrecht zur Skizzenebene");
  assert.deepEqual(segs[2].b, [300, 0, 500]);
  assert.deepEqual(segs[1].up, [0, 1, 0], "senkrechtes Stück: Höhe nach Y");
});

test("Gestell: Automatik mit Gehrung an den Ecken und Stutzen am T-Stoß, gleiche Stäbe ein Bauteil", () => {
  const segments = rect(), g = defaultGestell("sk", segments);
  const plan = gestellPlan({ ...g, segments });
  assert.equal(plan.issues.length, 0);
  assert.deepEqual(plan.rows.map((r) => [r.len, r.angA, r.angB]), [[1000, 45, 45], [600, 45, 45], [1000, 45, 45], [600, 45, 45], [560, 0, 0]]);
  assert.deepEqual(groupParts(plan).map((x) => x.bodies.length), [2, 2, 1]);
  // Ecken ohne Automatik: Stäbe bleiben auf Skelettlänge, Mittelstab wird trotzdem gestutzt
  g.corner = "keine";
  assert.deepEqual(gestellPlan({ ...g, segments }).rows.map((r) => r.len), [1000, 600, 1000, 600, 560]);
});

test("Gestell: Eckverbindung, Spalt der Gehrung, Verlängern und Lage zur Linie", () => {
  const segments = rect(), g = defaultGestell("sk", segments);
  setJoint(g, "ecke", "gm1", "gm2");
  setJoint(g, "gehrung", "gm2", "gm3", 4);
  g.members[3].extB = -10;
  const rows = gestellPlan({ ...g, segments }).rows;
  near(rows[0].len, 1020, 1e-6, "Stab 1 bis Außenseite von Stab 2");
  near(rows[1].len, 580 - 2 * Math.SQRT2, 0.05, "Stab 2 stößt an Stab 1, halber Spalt (senkrecht zur Schnittfläche) an der Gehrung");
  near(rows[3].len, 590, 1e-6, "Stab 4 an Ende B um 10 gekürzt");
  // Lage oben links: Profil hängt unter der Linie und liegt rechts davon
  assert.deepEqual(placeShift("ol", 40, 60), [20, -30]);
  assert.deepEqual(placeShift("mm", 40, 60), [0, 0]);
  g.place = "ol";
  const pm = gestellPlan({ ...g, segments }).members[0];
  near(pm.a[2], -20, 1e-9, "Höhe (Skizzennormale Z) um die halbe Profilhöhe nach unten");
});

test("Gestell: Nuten statt Stutzen, Verbindung »keine«, Wiederverwenden, Entfernen und CSV", () => {
  const segments = rect(), g = defaultGestell("sk", segments);
  setJoint(g, "nuten", "gm1", "gm5");
  let plan = gestellPlan({ ...g, segments });
  const mid = plan.members.find((m) => m.gid === "gm5");
  assert.equal(mid.copes.length, 1, "Hülle von Stab 1");
  assert.equal(mid.cuts.start.length, 0, "Ende bleibt an der Achse");
  setJoint(g, "keine", "gm3", "gm5");
  plan = gestellPlan({ ...g, segments });
  assert.equal(plan.rows.find((r) => r.id === "gm5").len, 600, "ohne Automatik am anderen Ende");
  // Wiederverwenden: Stab 3 übernimmt Stab 1 → ein Bauteil
  g.members[2].reuse = "gm1";
  plan = gestellPlan({ ...g, segments });
  const grp = groupParts(plan).find((x) => x.bodies.some((b) => b.name.endsWith(" 1")));
  assert.ok(grp.bodies.some((b) => b.name.endsWith(" 3")));
  assert.throws(() => setJoint(g, "gehrung", "gm1", "gm1"), /verschiedene/);
  removeMember(g, "gm1");
  assert.equal(g.members.find((m) => m.id === "gm3").reuse, undefined, "Vorbild weg → Wiederverwenden aufgehoben");
  assert.ok(g.joints.every((j) => j.a !== "gm1" && j.b !== "gm1"));
  const m = addMember(g, "s0");
  assert.equal(m.no, 6, "Nummern werden nicht doppelt vergeben");
  const csv = gestellCsv(gestellPlan({ ...g, segments }).rows);
  assert.match(csv.split("\n")[0], /^Stab;Profil;Skelettlinie/);
  assert.match(csv, /QR 40x40x3 6;QR 40x40x3;Linie 1;/);
  // Linie gelöscht → Stab entfällt mit Warnung
  const issues = gestellPlan({ ...g, segments: segments.filter((s) => s.id !== "s1") }).issues;
  assert.ok(issues.some((x) => /Skelettlinie fehlt/.test(x.message)));
});
