// Vorschläge nach 0.28 (N1–N9): Rechnung ohne Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { roundCorners, bentChain, pathPoint, pathTangent } from "../src/core/biegeteil.js";
import { defaultGenerator, resolveGenParams, GENERATORS } from "../src/core/generator.js";

const near = (a, b, t = 1e-6) => a.every((v, i) => Math.abs(v - b[i]) < t);
const E = (x) => Number(x);
const plan = (gen, patch = {}) => GENERATORS[gen].plan(resolveGenParams(gen, { ...defaultGenerator(gen).params, ...patch }, E));

test("N2: Bogen an der Ecke tangential an beide Stücke", () => {
  const rc = roundCorners([[0, 0, 0], [1000, 0, 0], [1000, 800, 300]], 80);
  assert.equal(rc.arcs.length, 1);
  assert.equal(rc.lines.length, 2);
  const p = rc.arcs[0].path;
  assert.ok(near(pathPoint(p, 0), rc.lines[0][1]), "Bogenanfang = Ende Stück 1");
  assert.ok(near(pathPoint(p, 1), rc.lines[1][0]), "Bogenende = Anfang Stück 2");
  assert.ok(near(pathTangent(p, 0), [1, 0, 0]), "Tangente am Anfang");
  const d2 = [0, 800, 300].map((v) => v / Math.hypot(800, 300));
  assert.ok(near(pathTangent(p, 1), d2), "Tangente am Ende");
});

test("N2: zu kurze Ecke bleibt Gehrung, Stücke werden an der Gehrungsebene geschnitten", () => {
  const sec = { kind: "rohr", geom: { width: 42.4, height: 42.4 } };
  const r = bentChain({ section: sec, points: [[0, 0, 0], [1000, 0, 0], [1000, 50, 0], [2000, 50, 0]], name: "Handlauf", radius: 80 });
  assert.ok(r.short.length >= 1, "kurze Ecke gemeldet");
  assert.ok(r.members.some((m) => m.cuts), "Gehrungsschnitt an der kurzen Ecke");
  assert.ok(r.members.every((m) => m.target === "Handlauf") && r.tubes.every((t) => t.target === "Handlauf"));
});

test("N2: Geländer mit Bögen und Endbogen", () => {
  const p = plan("gelaender", { runs: "3000; 1500", railBend: "bogen", railEnd: "bogen" });
  const arcs = p.tubes.filter((t) => /Handlauf Bogen/.test(t.name));
  assert.equal(arcs.length, 3, "1 Eckbogen + 2 Endbögen");
  assert.ok(!p.chains.some((c) => c.name === "Handlauf"), "keine Gehrungskette mehr");
  const ohne = plan("gelaender", { runs: "3000; 1500" });
  assert.ok(ohne.chains.some((c) => c.name === "Handlauf"), "Vorgabe bleibt Gehrung");
  assert.ok(!(ohne.tubes || []).some((t) => /Handlauf/.test(t.name)));
});

test("N2: Treppe mit Handlaufbögen am Knick", () => {
  const p = plan("treppe", { form: "U", gap: "200", gelRailBend: "bogen" });
  assert.ok(p.tubes.some((t) => /Handlauf Bogen/.test(t.name)));
});

test("N3: Glasklemmhalter am Pfosten, Glas ohne Bohrung", () => {
  const p = plan("gelaender", { fill: "glas", glassMount: "klemme", glassT: "10.76" });
  const glas = p.plates.filter((x) => x.glass);
  assert.ok(glas.length > 0 && glas.every((g) => g.t === 10.76 && !g.holes));
  const kl = p.norms.filter((n) => n.kind === "glasklemme");
  assert.equal(kl.length, glas.length * 4, "2 Halter je Seite");
  assert.ok(kl.every((n) => n.size === "VSG 10,76" && n.xDir));
  assert.equal(p.drills.filter((d) => /^Pfosten/.test(d.target) && d.d === 6.8).length, kl.length, "Gewindebohrung im Pfosten");
});

test("N3: Ganzglas im Bodenprofil ohne Pfosten, Felder für Pfosten ausgeblendet", () => {
  const p = plan("gelaender", { runs: "3000; 1500", fill: "glas", glassMount: "boden", glassT: "16.76" });
  assert.ok(!p.members.some((m) => /^Pfosten/.test(m.name)));
  assert.ok(p.chains.some((c) => c.name === "Bodenprofil" && c.density === 2.7));
  assert.equal(p.plates.filter((x) => x.glass).length, 3);
  assert.ok(p.drills.every((d) => d.target === "Bodenprofil"));
  const vis = GENERATORS.gelaender.schema.filter((s) => !s.when || s.when({ fill: "glas", glassMount: "boden", rail: { kind: "rohr" }, runs: "3000" })).map((s) => s.key);
  assert.ok(!vis.includes("post") && !vis.includes("postMax") && vis.includes("glassT"));
  const duenn = plan("gelaender", { fill: "glas", glassMount: "boden", glassT: "10.76" });
  assert.ok(duenn.issues.some((i) => i.key === "glassT"), "Warnung bei dünnem Ganzglas");
});

test("N3: Ganzglas mit Punkthaltern, Glasbohrungen an den Haltern", () => {
  const p = plan("gelaender", { fill: "glas", glassMount: "punkt", glassT: "16.76" });
  const glas = p.plates.filter((x) => x.glass), ph = p.norms.filter((n) => n.kind === "glaspunkthalter");
  assert.equal(ph.length, glas.reduce((a, g) => a + g.holes.length, 0));
  assert.ok(glas.every((g) => g.d === 22));
  assert.throws(() => plan("gelaender", { fill: "glas", glassMount: "punkt", mSlab: "120" }), /Deckenstirn/);
});

test("N3: alte Dateien ohne glassMount bleiben bei der Lasche", () => {
  const f = defaultGenerator("gelaender");
  delete f.params.glassMount;
  const p = GENERATORS.gelaender.plan(resolveGenParams("gelaender", { ...f.params, fill: "glas" }, E));
  assert.ok(p.members.some((m) => / Halter /.test(m.name)));
});
