// Vorschläge nach 0.28 (N1–N9): Rechnung ohne Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { roundCorners, bentChain, pathPoint, pathTangent } from "../src/core/biegeteil.js";
import { defaultGenerator, resolveGenParams, GENERATORS } from "../src/core/generator.js";
import { holeText, holeSpecs } from "../src/core/autodims.js";
import { noteSuggestion } from "../src/core/zeichnung.js";
import { patternMatrices, applyPatterns } from "../src/core/asmmuster.js";
import { orderRows, orderCsv, orderPages } from "../src/core/bestellliste.js";

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

// ---------- O3: Pfostenaufteilung von Hand ----------
import { postStations } from "../src/core/gelaender.js";
test("O3: Pfostenaufteilung max/anzahl/abstand/liste", () => {
  const base = { postMax: 1200, post: { geom: { width: 40 } } };
  assert.deepEqual(postStations({ ...base }, 3000), [0, 1000, 2000, 3000]);
  assert.deepEqual(postStations({ ...base, postMode: "anzahl", postCount: 2 }, 3000), [0, 1500, 3000]);
  assert.deepEqual(postStations({ ...base, postMode: "abstand", postStep: 1000 }, 3500), [0, 1000, 2000, 3000, 3500]);
  assert.deepEqual(postStations({ ...base, postMode: "abstand", postStep: 1000 }, 3100), [0, 1000, 2000, 3100], "kleiner Rest ins letzte Feld");
  const list = [800, 1000];
  assert.deepEqual(postStations({ ...base, postMode: "liste" }, 3000, 0, list), [0, 800, 1800, 3000]);
  assert.throws(() => postStations({ ...base, postMode: "liste" }, 1000, 0, [800, 800]), /passt nicht/);
  const pl = plan("gelaender", { postMode: "liste", postList: "500; 1000", runs: "3000" });
  const posts = pl.members.filter((m) => /^Pfosten \d+$/.test(m.name)).map((m) => Math.round(m.a[0]));
  assert.deepEqual(posts.slice(0, 3), [0, 500, 1500]);
});

// ---------- O2: Handlaufstoß ----------
import { jointStations, splitPolyline } from "../src/core/handlaufstoss.js";
test("O2: Handlauf über Stangenlänge geteilt, Stoß hinter Pfosten, Einschiebling", () => {
  assert.deepEqual(jointStations(10000, { max: 6000, posts: [0, 1250, 2500, 3750, 5000, 6250, 7500, 8750, 10000], off: 150 }), [5150]);
  assert.equal(splitPolyline([[0, 0, 0], [10, 0, 0]], [4]).length, 2);
  const pl = plan("gelaender", { runs: "7000; 3000", railMax: "6000" });
  const rails = pl.chains.filter((c) => c.target === "Handlauf");
  assert.equal(rails.length, 2);
  assert.ok(pl.members.some((m) => /Einschiebling/.test(m.name)));
  assert.match(pl.info, /2 Stücke \(1 Stoß mit Einschiebling\)/);
  assert.equal(plan("gelaender", { runs: "3000" }).chains.filter((c) => c.name === "Handlauf").length, 1, "kurz: am Stück");
});

// ---------- O1: Wandhandlauf ----------
test("O1: Wandhandlauf mit Konsolen an der Wandseite", () => {
  const pl = plan("treppe", { gel: "rechts", wand: "links" });
  const wr = pl.chains.find((c) => c.name === "Wandhandlauf");
  assert.ok(wr, "Handlauf da");
  const B = Number(defaultGenerator("treppe").params.width);
  assert.ok(wr.points.every((q) => q[1] > B - 200 && q[1] < B), "links (großes y) innerhalb der Laufbreite");
  const k = pl.plates.filter((x) => /^Wandkonsole/.test(x.name)).length;
  assert.ok(k >= 3);
  assert.equal(pl.drills.filter((d) => d.target === "Wandhandlauf").length, k);
  assert.match(pl.info, /Wandkonsolen/);
  assert.throws(() => plan("treppe", { gel: "beide", wand: "links" }), /schon das Geländer/);
  const pr = plan("treppe", { gel: "keine", wand: "links", turn: "rechts", form: "L" });
  assert.equal(pr.chains.filter((c) => /^Wandhandlauf Lauf/.test(c.name)).length, 2);
});

// ---------- O4: Treppe oben aufgelegt, Wange an der Wand ----------
test("O4: Auflagerwinkel oben, Wange an der Wand verdübelt", () => {
  const pl = plan("treppe", { anschluss: "auflager", wangeWand: "links", gel: "rechts" });
  assert.equal(pl.plates.filter((x) => /Auflagerwinkel oben$/.test(x.name)).length, 2);
  assert.ok(!pl.plates.some((x) => /Kopfplatte$/.test(x.name)));
  assert.ok(pl.members.some((m) => /Distanzhülse Wange links/.test(m.name)));
  assert.ok(pl.drills.filter((d) => d.target === "Wange links" && d.d === 14).length >= 2);
  assert.match(pl.info, /Auflagerwinkel auf der Decke.*Wange links an der Wand/);
  assert.ok(plan("treppe", { wangeWand: "rechts", gel: "rechts" }).issues.some((x) => x.key === "wangeWand"));
});

// ---------- O5: Tor-Zubehör ----------
test("O5: Kastenschloss, Bodenriegel, Torfeststeller am Tor", () => {
  const pl = plan("tor", { hold: "innen" });
  const kinds = pl.norms.map((x) => x.kind).sort();
  assert.deepEqual(kinds, ["bodenriegel", "kastenschloss", "torfeststeller", "torfeststeller"]);
  assert.match(pl.info, /Kastenschloss Dorn 60, Bodenriegel/);
  const e = plan("tor", { leaves: "1", width: "1200" });
  assert.deepEqual(e.norms.map((x) => x.kind), ["kastenschloss"]);
  assert.equal(plan("tor", { lock: false, bolt: false }).norms.length, 0);
});

// ---------- O6–O9: Podestwange, Voute, Knotenblech, Futterbleche ----------
test("O6: äußere Wange läuft ums Podest weiter (Gehrung an den Stößen)", () => {
  const L = plan("treppe", { form: "L", podestWange: true });
  const pw = L.members.filter((m) => /^Wange rechts Podest \d$/.test(m.name));
  assert.equal(pw.length, 2);
  const w1 = L.members.find((m) => m.name === "Wange rechts Lauf 1"), w2 = L.members.find((m) => m.name === "Wange rechts Lauf 2");
  assert.ok(near(w1.cuts.end[0].p, pw[0].cuts.start[0].p), "Stoß Lauf 1 – Podest");
  assert.ok(near(w2.cuts.start[0].p, pw[1].cuts.end[0].p), "Stoß Podest – Lauf 2");
  assert.ok(near(w1.cuts.end[0].n, pw[0].cuts.start[0].n.map((x) => -x)), "gleiche Gehrungsebene");
  const U = plan("treppe", { form: "U", podestWange: true, turn: "rechts", gap: "200" });
  assert.equal(U.members.filter((m) => /^Wange links Podest \d$/.test(m.name)).length, 3);
  assert.equal(plan("treppe", { form: "L" }).members.filter((m) => / Podest \d$/.test(m.name)).length, 0);
});

test("O7: Rahmenecke mit Voute: Gurt, Steg, Stirnplatte bis unter die Voute, vierte Schraubenreihe", () => {
  const a = plan("rahmenecke"), b = plan("rahmenecke", { haunch: true });
  assert.ok(b.members.some((m) => m.name === "Voute Gurt") && b.plates.some((p) => p.name === "Voute Steg"));
  const H = (pl) => pl.plates.find((p) => p.name === "Stirnplatte").H;
  assert.ok(H(b) > H(a) + 200, "Stirnplatte länger");
  assert.equal(b.norms.length, a.norms.length + 2);
  assert.equal(plan("rahmenecke", { stiffAt: "oben" }).plates.filter((p) => /^Steife/.test(p.name)).length, 2);
});

test("O8: Windverband mit Winkel auf dem Knotenblech, n Schrauben je Anschluss", () => {
  const pl = plan("windverband", { bar: "profil", nBolts: "3", gusset: "250" });
  assert.equal(pl.members.length, 2);
  assert.equal(pl.norms.length, 2 * 2 * 3);
  assert.equal(pl.drills.length, 12);
  assert.equal(pl.plates.find((p) => p.name === "Knotenblech 1").holes.length, 3);
  assert.ok(plan("windverband", { bar: "profil", nBolts: "4" }).issues.some((x) => x.key === "gusset"), "Knotenblech zu klein");
});

test("O9: geschlitzte Futterbleche um jeden Anker statt Justiermuttern", () => {
  const pl = plan("stuetzenfuss", { shims: true, grout: "18" });
  const sh = pl.plates.filter((p) => /^Futterblech 1\./.test(p.name));
  assert.deepEqual(sh.map((p) => p.t), [10, 5, 3]);
  assert.ok(!pl.norms.some((n) => n.kind === "scheibe"), "keine Justiermuttern");
  assert.match(pl.info, /Futterbleche 60 × 60/);
});

// ---------- O10–O12: Langloch, Muster an Skizzenpunkten, Bestellliste ----------
test("O10: Langloch-Angabe aus dem Bohrungs-Feature, Hinweis am Halbkreis in der Zeichnung", () => {
  const specs = holeSpecs([{ type: "hole", form: "langloch", diameter: "11", slotLength: "30", extent: "through" }], Number);
  assert.deepEqual(specs, [{ r: 5.5, hole: { d: 11, slot: 30 } }]);
  assert.equal(holeText(specs[0].hole, 2), "2× Langloch 30 × 11 durch");
  assert.equal(holeText({ d: 9, slot: 20, depth: 4 }), "Langloch 20 × 9, 4 tief");
  const arcs = [{ cx: 0, cy: 0, r: 5.5, full: false }, { cx: 19, cy: 0, r: 5.5, full: false }];
  assert.deepEqual(noteSuggestion([-5.5, 0], { arcs, specs }), { kind: "bohrung", text: "Langloch 30 × 11 durch" });
  assert.equal(noteSuggestion([-5.5, 0], { arcs, specs: [] }).kind, "frei");
});

test("O11: Komponentenmuster an den Punkten einer Skizze", () => {
  const comps = new Map([["a", { id: "a", part: "anker", pos: [100, 0, 0], rot: [0, 0, 0] }], ["p", { id: "p", part: "platte", pos: [0, 0, 50], rot: [0, 0, 0] }]]);
  const pts = [[0, 0, 0], [100, 0, 0], [100, 200, 0], [0, 200, 0]];
  const mats = patternMatrices({ kind: "skizze", comps: ["a"], target: "p", sketch: "s1" }, Number, { comps, sketchPoints: (pid, sid) => (pid === "platte" && sid === "s1" ? pts : []) });
  assert.equal(mats.length, 3);
  // Bezug = Punkt (100, 0, 50) am nächsten an der Quelle; Kopien um die Abstände zu (100,200), (0,200), (0,0)
  const asm = { components: [...comps.values()].map((c) => ({ ...c, name: c.id })), patterns: [{ id: "pm", kind: "skizze", comps: ["a"], target: "p", sketch: "s1" }] };
  const r = applyPatterns(asm, Number, null, null, (pid) => (pid === "platte" ? pts : []));
  assert.deepEqual(r.errors, {});
  const copies = asm.components.filter((c) => c.pat === "pm").map((c) => c.pos.map((x) => Math.round(x)));
  assert.deepEqual(copies.sort(), [[0, 0, 0], [0, 200, 0], [100, 200, 0]].sort(), "um die Abstände der Punkte verschoben");
  assert.match(Object.values(applyPatterns({ ...asm, components: asm.components.filter((c) => !c.pat) }, Number, null, null, () => [[0, 0, 0]]).errors)[0], /keine weiteren Punkte/);
});

test("O12: Bestellliste je Lieferant (Normteile, Beschläge, Glas, Kaufteile)", () => {
  const bolt = { meta: { norm: { kind: "schraube4017", designation: "ISO 4017 - M12 x 40 - 8.8", norm: "ISO 4017" } } };
  const lock = { meta: { norm: { kind: "kastenschloss", designation: "Kastenschloss Dorn 60" } } };
  const glas = { meta: { glass: true, plate: { W: 1000, H: 800, t: 10.76 } } };
  const src = [
    { part: { id: "g", name: "Geländer" }, bodies: [bolt, bolt, lock, glas, { meta: {} }], qty: 2 },
    { part: { id: "k", name: "Torantrieb", kaufteil: true, lieferant: "Antriebe GmbH" }, bodies: [bolt], qty: 1 },
  ];
  const rows = orderRows(src, { suppliers: { normteile: "Schrauben AG", glas: "Glas & Co" } });
  const by = (n) => rows.find((r) => r.name.startsWith(n));
  assert.equal(by("ISO 4017").qty, 4);
  assert.equal(by("ISO 4017").supplier, "Schrauben AG");
  assert.equal(by("Kastenschloss").supplier, "ohne Lieferant");
  assert.equal(by("Glasscheibe 1000 × 800").qty, 2);
  assert.ok(Math.abs(by("Glasscheibe").area - 1.6) < 1e-9);
  assert.equal(by("Torantrieb").supplier, "Antriebe GmbH");
  assert.equal(rows[rows.length - 1].supplier, "ohne Lieferant", "ohne Lieferant am Ende");
  const csv = orderCsv(rows, "Projekt");
  assert.match(csv, /^\ufeffLieferant;Gruppe;Benennung/);
  assert.equal(csv.trim().split("\r\n").length, rows.length + 1);
  assert.equal(orderPages(rows).length, 4, "eine Seite je Lieferant");
});
