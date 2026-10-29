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

test("N1: viertelgewendelt – gleicher Auftritt auf der Lauflinie, innen ≥ 50 mm, außen ohne Kreuzung", async () => {
  const { windingLayout, windingEdges } = await import("../src/core/verzogen.js");
  const n = 16, a = 280, B = 1000;
  const lay = windingLayout({ form: "Lw", B, Lw: (n - 1) * a, sMid: 7.5 * a, gap: 0 });
  const ed = windingEdges(lay, n, a, 3);
  for (let k = 1; k < n; k++) assert.ok(Math.abs(Math.hypot(ed.W[k][0] - ed.W[k - 1][0], ed.W[k][1] - ed.W[k - 1][1]) - a) < 10, "Sehne ≈ a");
  for (let k = 1; k < n; k++) { assert.ok(ed.ti[k] - ed.ti[k - 1] >= 50); assert.ok(ed.to[k] > ed.to[k - 1]); }
  assert.equal(ed.verzogen, 8);
  // gerade Stufen außerhalb der Wendung: rechtwinklig (gleicher Parameter innen und außen)
  assert.ok(Math.abs(ed.ti[1] - ed.to[1]) < 1e-6);
});

test("N1: Treppe halbgewendelt nach rechts – Stufen, Wangen, Geländer, gespiegelt", () => {
  const p = plan("treppe", { form: "Uw", gap: "200", turn: "rechts" });
  const st = p.plates.filter((x) => /^Stufe/.test(x.name));
  assert.equal(st.length, 15);
  assert.ok(st.every((x) => x.poly.length >= 4));
  assert.ok(p.plates.some((x) => /^Wange innen/.test(x.name)) && p.plates.some((x) => /^Wange außen/.test(x.name)));
  assert.ok(st.every((x) => x.poly.every(([, y]) => y <= 1e-6)), "nach rechts: alles bei y ≤ 0");
  assert.ok(/halbgewendelt nach rechts/.test(p.info));
  assert.throws(() => plan("treppe", { form: "Uw", gap: "20" }), /Treppenauge/);
  const vis = GENERATORS.treppe.schema.filter((s) => !s.when || s.when({ ...defaultGenerator("treppe").params, form: "Lw" })).map((s) => s.key);
  assert.ok(vis.includes("verzug") && vis.includes("wangeH") && !vis.includes("support") && !vis.includes("gelMount"));
});

test("N4: Lamellendach – Lamellen, Achsbolzen, Endkappen, Ablauf, Wand ohne hintere Stützen", () => {
  const p = plan("pergola");
  const lam = p.members.filter((m) => /^Lamelle \d+$/.test(m.name));
  assert.ok(lam.length >= 10);
  assert.equal(p.members.filter((m) => /Achsbolzen/.test(m.name)).length, 2 * lam.length);
  assert.equal(p.plates.filter((x) => /Endkappe/.test(x.name)).length, 2 * lam.length);
  assert.ok(lam.every((m) => m.density === 2.7));
  assert.equal(p.members.filter((m) => /^Stütze/.test(m.name)).length, 4);
  assert.ok(p.drills.some((d) => d.target === "Stütze 1" && d.w), "Auslass unten an der Stütze");
  const w = plan("pergola", { form: "wand" });
  assert.equal(w.members.filter((m) => /^Stütze/.test(m.name)).length, 2);
  assert.ok(w.plates.some((x) => /^Wandplatte/.test(x.name)));
  assert.throws(() => plan("pergola", { angle: "120" }), /Stellung/);
});

test("N7: Winkelmaß an schräger Kante, je Winkel einmal; doppelte Maße; Winkel von Hand", async () => {
  const { angleDims, angleValue, duplicateDims, cleanupDrawing, angleFromSegments } = await import("../src/core/aufraeumen.js");
  // Stütze senkrecht, Kopfband unter 45° (Linienzüge der Ansicht)
  const view = { id: "v1", bbox: { x0: 0, y0: 0, x1: 1000, y1: 2000 }, lines: [[[0, 0], [0, 2000]], [[0, 1400], [400, 1800]], [[0, 0], [1000, 0]], [[1000, 0], [1000, 2000]]] };
  const used = {};
  const a = angleDims(view, used);
  assert.equal(a.length, 1);
  assert.ok(Math.abs(angleValue(a[0]) - 45) < 1e-6);
  assert.equal(angleDims({ ...view, id: "v2" }, used).length, 0, "derselbe Winkel nur einmal");
  // rechtwinklige Ecken bekommen kein Winkelmaß
  assert.equal(angleDims({ id: "v3", bbox: view.bbox, lines: [[[0, 0], [1000, 0], [1000, 2000]]] }, {}).length, 0);
  const views = { f: { axes: ["X", "Z"] }, t: { axes: ["X", "Y"] } };
  const dims = [
    { id: "a", view: "f", kind: "h", p1: [0, 0], p2: [500, 0] },
    { id: "b", view: "t", kind: "h", p1: [0, 300], p2: [500, 300] }, // gleiche X-Strecke in der Draufsicht
    { id: "c", view: "t", kind: "h", p1: [500, 300], p2: [1000, 300] }, // gleiche Länge, andere Lage: bleibt
    { id: "d", view: "f", kind: "dia", circle: { cx: 1, cy: 1, r: 5 } },
    { id: "e", view: "t", kind: "dia", circle: { cx: 9, cy: 9, r: 5 } },
  ];
  assert.deepEqual(duplicateDims(dims, views), ["b", "e"]);
  const r = cleanupDrawing({ dims: [...dims, { id: "x", view: "weg", kind: "h", p1: [0, 0], p2: [1, 0] }], leaders: [], balloons: [{ id: "b1", view: "weg" }] }, views, new Set(["f", "t"]));
  assert.deepEqual(r.dims.map((m) => m.id), ["a", "c", "d"]);
  assert.deepEqual(r.removed, { duplicates: 2, orphans: 2 });
  const g = angleFromSegments({ a: [0, 0], b: [100, 0] }, [80, 0], { a: [0, 10], b: [10, 20] }, [8, 18]);
  assert.ok(Math.abs(angleValue({ kind: "ang", ...g }) - 45) < 1e-6);
  assert.ok(Math.hypot(g.c[0] + 10, g.c[1]) < 1e-6, "Scheitel im Schnittpunkt");
});

// ---------- N6: assoziatives Spiegeln in der Baugruppe ----------
import { applyPatterns as applyPatternsN6, defaultAsmPattern as defPatN6 } from "../src/core/asmmuster.js";

test("N6: Spiegelung folgt der Quelle, wiederverwendet und abgewählt", () => {
  const made = [];
  const mirror = { partFor: (pid, n) => { const k = `${pid}~${n.join(",")}`; if (!made.includes(k)) made.push(k); return k; }, center: () => [0, 0, 0] };
  const asm = { components: [
    { id: "a", part: "konsole", name: "Konsole:1", pos: [100, 20, 0], rot: [0, 0, 0] },
    { id: "b", part: "rohr", name: "Rohr:1", pos: [50, 0, 0], rot: [0, 0, 0] },
  ], patterns: [] };
  const pm = defPatN6("s1", ["a", "b"], "spiegel");
  pm.modes.b = "wieder";
  asm.patterns.push(pm);
  let r = applyPatternsN6(asm, Number, null, mirror);
  assert.deepEqual(r.errors, {});
  const ca = asm.components.find((c) => c.src === "a"), cb = asm.components.find((c) => c.src === "b");
  assert.deepEqual(ca.pos, [-100, 20, 0]);
  assert.equal(ca.part, "konsole~1,0,0");
  assert.equal(cb.part, "rohr", "wiederverwendet: dasselbe Bauteil");
  assert.equal(applyPatternsN6(asm, Number, null, mirror).changed, false, "stabil");
  // Quelle verschoben → Spiegelseite folgt
  asm.components[0].pos = [150, 20, 0];
  r = applyPatternsN6(asm, Number, null, mirror);
  assert.equal(r.changed, true);
  assert.deepEqual(asm.components.find((c) => c.src === "a").pos, [-150, 20, 0]);
  // Abstand der Ebene als Ausdruck
  pm.offset = "10";
  applyPatternsN6(asm, Number, null, mirror);
  assert.deepEqual(asm.components.find((c) => c.src === "a").pos, [-130, 20, 0]);
  // Rohr abwählen → seine Spiegelkopie verschwindet
  pm.comps = ["a"];
  applyPatternsN6(asm, Number, null, mirror);
  assert.equal(asm.components.filter((c) => c.pat === "s1").length, 1);
  assert.equal(made.length, 1, "gespiegeltes Bauteil nur einmal angelegt");
});

// ---------- N8: gevouteter Träger ----------
test("N8: Voutenträger – Steg als Vieleck, Untergurt mit Gehrung, Fehler bei zu langer Voute", () => {
  const p = plan("voute");
  const web = p.plates.find((x) => x.name === "Steg");
  assert.ok(web.poly.length === 5, "Steg: Obergurt-Linie + 3 Punkte Untergurt");
  // Höhe am Anfang: 700 − 2 × 15 Gurt
  const ys = web.poly.filter((q) => Math.abs(q[0]) < 1e-9).map((q) => q[1]).sort((a, b) => a - b);
  assert.ok(Math.abs(ys[1] - ys[0] - 670) < 0.5, JSON.stringify(ys));
  const ug = p.members.filter((m) => m.target === "Untergurt");
  assert.equal(ug.length, 2);
  assert.ok(ug[0].cuts.end[0].n[0] > 0 && ug[1].cuts.start[0].n[0] < 0, "Gehrung am Knick");
  assert.equal(p.plates.filter((x) => /^Steife/.test(x.name)).length, 2);
  assert.equal(p.plates.filter((x) => /^Stirnplatte/.test(x.name)).length, 2);
  assert.match(p.info, /Voute/);
  assert.equal(plan("voute", { form: "voute2" }).members.length, 3);
  assert.equal(plan("voute", { form: "linear" }).members.length, 1);
  assert.throws(() => plan("voute", { lv: "7000" }), /Voute länger/);
  assert.throws(() => plan("voute", { h: "60" }), /Höhe mindestens/);
});

// ---------- N9: Bohrungsangabe am 3D-Modell ----------
import { holeText as holeTextN9 } from "../src/core/autodims.js";
test("N9: Bohrungsangabe-Text für die 3D-Notiz", () => {
  assert.equal(holeTextN9({ d: 6.8, thread: "M8", depth: 12 }, 4), "4× M8, 12 tief");
  assert.equal(holeTextN9({ d: 11 }, 2), "2× Ø11 durch");
});
