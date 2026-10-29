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

test("W2 Rohr strecken: Bohrungen am gebogenen Rohr landen am geraden Rohr bei s und φ", async () => {
  // Bügel: 400 gerade (X), Bogen R 100 nach +Y, 400 gerade (Y)
  const br = { id: "b", type: "biegerohr", section: "rohr", dims: { D: "40", t: "2" }, radius: "100",
    points: [{ x: "0", y: "0", z: "0" }, { x: "500", y: "0", z: "0" }, { x: "500", y: "500", z: "0" }] };
  // Bohrung Ø 10 von oben (−Z) in die obere Wand bei x = 200, und Ø 8 quer (Y) durch beide Wände im zweiten Schenkel bei y = 300
  const circ = (id, plane, offset, x, y, r) => ({ id, type: "sketch", name: id, plane: { ref: plane }, offset, points: [{ id: id + "c", x, y }], entities: [{ id: id + "k", type: "circle", c: id + "c", r }], constraints: [] });
  const sk1 = circ("s1", "XY", "30", 200, 0, 5);
  const cut1 = { id: "c1f", type: "extrude", sketch: "s1", op: "cut", distance: "20", mode: "reverse" };
  const sk2 = circ("s2", "YZ", "0", 300, 0, 4);
  const cut2 = { id: "c2f", type: "extrude", sketch: "s2", op: "cut", distance: "600" };
  const st = { id: "st", type: "strecken", target: "b" };
  const res = await K.buildPart(part([br, sk1, cut1, sk2, cut2, st]));
  okAll(res);
  const tube = res.bodies.find((b) => b.fid === "b");
  const L = 400 + 400 + (Math.PI / 2) * 100;
  near(tube.meta.stretched.length, L, 0.01, "gestreckte Länge");
  const bb = tube.shape.boundingBox.bounds;
  near(bb[1][0] - bb[0][0], L, 0.5, "gerade in X");
  const hs = tube.meta.stretched.holes;
  assert.equal(hs.length, 3, JSON.stringify(hs)); // Querbohrung durch beide Wände = zwei Öffnungen
  near(hs[0].s, 200, 0.3, "s Bohrung 1"); near(hs[0].d, 10, 0.01); assert.equal(hs[0].through, false);
  // φ = 0 ist Innenseite der Biegung (+Y am Anfang), b = t × r = X × Y = +Z → obere Wand bei 90°
  near(hs[0].phi, 90, 0.5, "φ Bohrung 1");
  near(hs[1].s, 400 + 157.08 + 200, 0.5, "s Bohrung 2"); near(hs[1].d, 8, 0.01);
  // im zweiten Schenkel zeigt die Innenseite nach −X: Bohrung entlang X trifft 0° und 180°
  assert.deepEqual([hs[1].phi, hs[2].phi], [0, 180]);
  // Volumen: gerades Rohr minus Löcher ≈ gebogenes Rohr mit Löchern
  const bent = await K.buildPart(part([br, sk1, cut1, sk2, cut2]));
  near(R.measureVolume(tube.shape), vol(bent), 0.01 * vol(bent), "Volumen");
});

test("W3 Muster: Abstände einzeln, Exemplare auslassen, Winkel einzeln", async () => {
  const { rectSketchFeature } = await import("../src/core/examples.js");
  const base = [rectSketchFeature("s1", "XY", 0, 0, 0, "10", "10"), { id: "e1", type: "extrude", sketch: "s1", distance: "10", op: "new" }];
  const lin = await K.buildPart(part([...base, { id: "m", type: "pattern", kind: "linear", feature: "e1", dir: "X", count: "9", spacing: "1", spacings: "20; 50; 20" }]));
  okAll(lin);
  assert.match(lin.status.m.info, /^4 Exemplare/);
  near(lin.bodies.reduce((m, b) => Math.max(m, b.shape.boundingBox.bounds[1][0]), 0), 100, 1e-6, "letztes bei 90");
  const sk = await K.buildPart(part([...base, { id: "m", type: "pattern", kind: "linear", feature: "e1", dir: "X", count: "5", spacing: "20", skip: "2, 4" }]));
  okAll(sk);
  assert.match(sk.status.m.info, /3 Exemplare, 2 ausgelassen/);
  near(vol(sk), 3 * 1000, 1e-6);
  const two = await K.buildPart(part([...base, { id: "m", type: "pattern", kind: "linear", feature: "e1", dir: "X", count: "3", spacing: "20", dir2: "Y", count2: "2", spacing2: "20", skip: "2/2" }]));
  okAll(two);
  near(vol(two), 5 * 1000, 1e-6);
  const circ = await K.buildPart(part([...base, { id: "m", type: "pattern", kind: "circular", feature: "e1", axis: "Z", center: ["-50", "0", "0"], count: "8", angles: "90; 90" }]));
  okAll(circ);
  assert.match(circ.status.m.info, /^3 Exemplare/);
  await assert.rejects(K.buildPart(part([...base, { id: "m", type: "pattern", kind: "linear", feature: "e1", dir: "X", count: "3", spacing: "20", skip: "1" }])).then((r) => { if (!r.status.m.ok) throw new Error(r.status.m.error); }), /Original/);
});

test("W6 Vordach/Carport: Stützen, Pfetten, Sparren mit Gefälle, Kopfbänder, Dachhaut und Rinne ohne Überschneidung", async () => {
  const { defaultGenerator } = await import("../src/core/generator.js");
  const build = async (params) => {
    const f = defaultGenerator("vordach");
    const res = await K.buildPart(part([{ id: "g", ...f, params: { ...f.params, ...params } }]));
    assert.ok(res.status.g.ok, JSON.stringify(res.status.g));
    return res;
  };
  const count = (res, re) => res.bodies.filter((b) => re.test(b.name)).length;
  const overl = (res) => K.collisions(res.bodies.map((b, i) => ({ key: `${i}:${b.name}`, shape: b.shape })), { tol: 1 }).map((c) => `${c.a} × ${c.b}`);
  const car = await build({});
  console.log("[info]", car.status.g.info);
  assert.equal(count(car, /^Stütze \d+$/), 6); // 3 je Reihe bei 4500 Abstand
  assert.equal(count(car, /^Sparren \d+$/), 8);
  assert.equal(count(car, /^Kopfband/), 8);
  assert.equal(count(car, /^Dachhaut$/), 1);
  assert.equal(count(car, /^Kastenrinne$/), 1);
  assert.deepEqual(overl(car), []);
  // Gefälle: Dachhaut hinten höher als vorne um ≈ 3 % der Tiefe
  const roof = car.bodies.find((b) => b.name === "Dachhaut").shape.boundingBox.bounds;
  near(roof[1][2] - roof[0][2], 5400 * 0.03, 3, "Höhenunterschied");
  // Stegplatten: eigene Dichte (≈ 2,7 kg/m²)
  const st = await build({ roof: "steg", slope: "6" });
  const sp = st.bodies.find((b) => b.name === "Dachhaut");
  assert.equal(sp.meta.density, 0.17);
  const vd = await build({ form: "vordach", depth: "2500", width: "4000" });
  console.log("[info]", vd.status.g.info);
  assert.equal(count(vd, /^Stütze \d+$/), 2);
  assert.equal(count(vd, /^Ankerplatte \d$/), 2);
  assert.equal(count(vd, /^Wandpfette$/), 1);
  assert.deepEqual(overl(vd), []);
  assert.match(vd.status.g.warning || "", /Anker bzw. Dübel/);
});

test("W7 Biegefolge: Kantteil liefert Querschnitt mit scharfen Ecken (außen bemaßt)", async () => {
  const kt = { id: "k", type: "kantteil", legs: "40; 100; 40", angles: "90; 90", ref: "aussen", t: "2", ri: "2", k: "0.33", length: "500", pos: ["0", "0", "0"], view: "gefaltet" };
  const res = await K.buildPart(part([kt]));
  okAll(res);
  const pr = res.bodies.find((b) => b.fid === "k").meta.sheet.profile;
  assert.deepEqual(pr.angles, [90, 90]);
  // außen 40/100/40 → Mittellinie 39/98/39
  near(pr.legs[0], 39, 1e-6, "Schenkel 1"); near(pr.legs[1], 98, 1e-6, "Steg"); near(pr.legs[2], 39, 1e-6, "Schenkel 3");
});
