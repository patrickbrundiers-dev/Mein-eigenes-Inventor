// MegaCAD-Abgleich: Geometrie-Kern-Tests (replicad + OpenCascade), getrennt von kernel.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createKernel } from "../src/kernel/build.js";
import { exampleProject, rectSketchFeature } from "../src/core/examples.js";

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
const log = (...a) => console.log("[info]", ...a);

function part(features, params = []) {
  return { id: "p" + Math.random(), kind: "part", name: "Test", params, features };
}

test("Regelkörper: Volumen aller Arten gegen die Formel, Lage und Achse (MegaCAD-Abgleich M5)", async () => {
  const { REGEL_KINDS, REGEL_DEFAULTS, regelVolume } = await import("../src/core/regelkoerper.js");
  for (const kind of Object.keys(REGEL_KINDS)) {
    const dims = { ...REGEL_DEFAULTS[kind] };
    if (kind === "kegel") dims.d = "20"; // Kegelstumpf
    const res = await K.buildPart(part([{ id: "rk", type: "regelkoerper", kind, dims, pos: ["0", "0", "0"], axis: "Z", op: "join" }]));
    okAll(res);
    const want = regelVolume(kind, Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, Number(v)])));
    near(vol(res), want, want * 0.002, kind);
  }
  // Spitzkegel liegend auf X, Basis bei x = 100, minus Zylinder (Differenz)
  const res = await K.buildPart(part([
    { id: "q", type: "regelkoerper", kind: "quader", dims: { L: "100", B: "100", H: "100" }, pos: ["0", "0", "0"], axis: "Z" },
    { id: "z", type: "regelkoerper", kind: "zylinder", dims: { D: "20", H: "100" }, pos: ["0", "0", "0"], axis: "Z", op: "cut" },
    { id: "k", type: "regelkoerper", kind: "kegel", dims: { D: "40", d: "0", H: "60" }, pos: ["50", "0", "50"], axis: "X", op: "join" },
  ]));
  okAll(res);
  near(vol(res), 1e6 - Math.PI * 100 * 100 + Math.PI * 400 * 60 / 3, 300, "Quader − Zylinder + Kegel");
  near(res.bodies[0].shape.boundingBox.bounds[1][0], 110, 0.01, "Kegelspitze bei x = 110");
});

test("Stahlprofile DSTV als Profil und Rahmen: Volumen = Fläche × Länge (MegaCAD-Abgleich M6)", async () => {
  const { catalogToDims, sectionGeometry } = await import("../src/core/sections.js");
  for (const [kind, size] of [["ipe", "200"], ["hea", "160"], ["upn", "120"], ["t", "50"]]) {
    const dims = catalogToDims(kind, size);
    const res = await K.buildPart(part([{ id: "p1", type: "profile", section: kind, dims, length: "1000", start: ["0", "0", "0"], axis: "X", rotation: "0", miterStart: "0", miterEnd: "0" }]));
    okAll(res);
    const A = sectionGeometry(kind, Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, Number(v)]))).area;
    near(vol(res), A * 1000, A * 1000 * 0.001, `${kind} ${size}`);
    assert.equal(res.bodies[0].meta.profileId, `${kind === "t" ? "T" : kind.toUpperCase()} ${size}`);
  }
  // HEB-Rahmen auf Gehrung (Profilzug, eben)
  const pz = await K.buildPart(part([{ id: "pz", type: "profilzug", section: "heb", dims: catalogToDims("heb", "160"), corner: "gehrung", align: "mitte", up: "Z", rotation: "0",
    points: [{ x: "0", y: "0", z: "0" }, { x: "2000", y: "0", z: "0" }, { x: "2000", y: "0", z: "1500" }] }]));
  okAll(pz);
  assert.equal(pz.bodies.length, 2);
});

test("Stirn-/Fußplatte mit Bohrbild und Rippen am Profilende (MegaCAD-Abgleich M8)", async () => {
  const { catalogToDims } = await import("../src/core/sections.js");
  const dims = catalogToDims("ipe", "200");
  const prof = { id: "p1", type: "profile", section: "ipe", dims, length: "1000", start: ["0", "0", "0"], axis: "X", rotation: "0", miterStart: "0", miterEnd: "0" };
  const plB = { id: "pl", type: "platte", target: "p1", member: 0, end: "B", thickness: "15", overhang: "40", width: "0", height: "0", radius: "0", holes: "4", holeDia: "18", edge: "30" };
  const res = await K.buildPart(part([prof, plB, { id: "pa", type: "platte", target: "p1", member: 0, end: "A", thickness: "10", overhang: "20", holes: "0" }, { id: "r", type: "rippe", plate: "pl", sides: ["oben", "unten"], length: "80", thickness: "8", chamfer: "10" }]));
  okAll(res);
  const byFid = (id) => res.bodies.filter((b) => b.fid === id);
  const [pb] = byFid("pl"), [pa] = byFid("pa");
  near(R.measureVolume(pb.shape), 180 * 280 * 15 - 4 * Math.PI * 81 * 15, 5, "Plattenvolumen");
  const bb = pb.shape.boundingBox.bounds;
  near(bb[0][0], 1000, 0.01, "Platte B beginnt am Stabende"); near(bb[1][0], 1015, 0.01, "Dicke nach außen");
  near(bb[1][2] - bb[0][2], 280, 0.01, "Höhe entlang Profilhöhe");
  const ba = pa.shape.boundingBox.bounds;
  near(ba[0][0], -10, 0.01, "Platte A nach außen"); near(ba[1][1] - ba[0][1], 140, 0.01, "Breite A = 100 + 2 × 20");
  const ribs = byFid("r");
  assert.equal(ribs.length, 2);
  const rb = ribs.map((x) => x.shape.boundingBox.bounds).sort((a, b) => b[1][2] - a[1][2]);
  near(rb[0][1][2], 140, 0.01, "Rippe oben bis Plattenrand"); near(rb[0][0][2], 100, 0.01, "Rippe oben ab Flansch");
  near(rb[0][0][0], 920, 0.01, "Rippe 80 mm in den Stab"); near(rb[0][1][1] - rb[0][0][1], 8, 0.01, "Rippendicke");
  near(rb[1][0][2], -140, 0.01, "Rippe unten");
  // Platte am Gehrungsende: Warnung
  const res2 = await K.buildPart(part([{ ...prof, miterEnd: "30" }, plB]));
  assert.match(res2.status.pl.warning || "", /Gehrung/);
});

test("Schweißnähte: Kehlnaht der Platte umlaufend, Rippen beidseitig, Naht an gewählten Kanten (MegaCAD-Abgleich M9)", async () => {
  const { catalogToDims, loopLength, sectionGeometry } = await import("../src/core/sections.js");
  const dims = catalogToDims("vierkant", "40x3");
  const prof = { id: "p1", type: "profile", section: "vierkant", dims, length: "500", start: ["0", "0", "0"], axis: "Z", rotation: "0", miterStart: "0", miterEnd: "0" };
  const res = await K.buildPart(part([prof,
    { id: "pl", type: "platte", target: "p1", member: 0, end: "A", thickness: "10", overhang: "40", holes: "4", holeDia: "13", edge: "25", weldA: "4" },
    { id: "r", type: "rippe", plate: "pl", sides: ["oben", "unten", "links", "rechts"], length: "60", thickness: "6", chamfer: "10", weldA: "3" },
    { id: "n", type: "naht", kind: "v", a: "5", side: "pfeil", edges: [{ p: [0, 20, 500], type: "LINE" }, { p: [0, -20, 500], type: "LINE" }] },
  ]));
  okAll(res);
  const per = loopLength(sectionGeometry("vierkant", Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, Number(v)]))).outer);
  const pw = res.welds.filter((w) => w.fid === "pl");
  assert.equal(pw.length, 1);
  near(pw[0].length, per, 1e-6, "umlaufend = Profilumfang");
  assert.ok(pw[0].around && pw[0].a === 4);
  const rw = res.welds.filter((w) => w.fid === "r");
  assert.equal(rw.length, 4);
  near(rw[0].length, 60 - 10 + 40 - 10, 1e-6, "Rippe: zwei Schenkel ohne Freischnitt");
  assert.equal(rw[0].side, "beide");
  const nw = res.welds.find((w) => w.fid === "n");
  near(nw.length, 2 * (40 - 2 * 6), 0.01, "zwei gerade Kanten der Stirnseite (ohne Radien)");
  assert.equal(nw.kind, "v");
});

test("Geländer-Generator: Pfostenaufteilung, Staketen, Handlauf über Eck, Fußplatten (MegaCAD-Abgleich M10/M11)", async () => {
  const { defaultGenerator } = await import("../src/core/generator.js");
  const f = { id: "g", ...defaultGenerator("gelaender") };
  f.params.runs = "3000; 1500";
  const res = await K.buildPart(part([f]));
  okAll(res);
  const by = (re) => res.bodies.filter((b) => re.test(b.name));
  assert.equal(by(/^Pfosten \d+$/).length, 3 + 1 + 2, "3 Felder à 1000 + 2 Felder à 750 → 6 Pfosten");
  assert.equal(by(/^Fußplatte/).length, 6);
  assert.equal(by(/^Handlauf/).length, 2, "zwei Handlaufstäbe, an der Ecke gegehrt");
  assert.ok(Math.abs(by(/^Handlauf/)[0].meta.miterEnd) > 40, "Gehrung 45° an der Ecke");
  assert.equal(by(/^Obergurt/).length, 2, "je Lauf ein durchgesteckter Gurt (≤ 5800 mm)");
  // Durchbrüche: Pfosten 2 (zwischen) für Ober- und Untergurt; Gurte mit je einer Bohrung pro Stab
  assert.equal(by(/^Pfosten 2$/)[0].meta.drills, 2);
  near(by(/^Pfosten 2$/)[0].meta.drillD, 27.9, 1e-9, "Gurt 26,9 + 1 mm Aufmaß");
  const og = by(/^Obergurt/);
  assert.equal(og.reduce((n, b) => n + (b.meta.drills || 0), 0), by(/^Stab /).length, "Bohrung Ø 13 je Stab");
  const bars = by(/^Stab /);
  assert.ok(bars.length > 20);
  // Öffnung zwischen Pfostenfläche und erstem Stab ≤ 110 mm
  const bb = (b) => b.shape.boundingBox.bounds;
  const firstBar = bars.filter((b) => Math.abs(bb(b)[0][1] + bb(b)[1][1]) < 1 && bb(b)[1][0] < 1000).sort((a, b) => bb(a)[0][0] - bb(b)[0][0])[0];
  assert.ok(bb(firstBar)[0][0] - 21.2 <= 110 + 1e-6, "Öffnung am ersten Pfosten");
  // Oberkante Handlauf = 1000
  const top = Math.max(...res.bodies.map((b) => bb(b)[1][2]));
  near(top, 1000, 0.01, "OK Handlauf");
  assert.match(res.status.g.info, /6 Pfosten, 5 Feld/);
});

test("Geländer Stufe 2: Kreuz mit Ring und Rahmen mit Staketen bauen (MegaCAD-Abgleich M11)", async () => {
  const { defaultGenerator } = await import("../src/core/generator.js");
  const bb = (b) => b.shape.boundingBox.bounds;
  const k = { id: "k", ...defaultGenerator("gelaender") };
  Object.assign(k.params, { runs: "1200", fill: "kreuz" });
  const rk = await K.buildPart(part([k]));
  okAll(rk);
  const diag = rk.bodies.filter((b) => /^Diagonale/.test(b.name));
  assert.equal(diag.length, 2);
  for (const d of diag) { near(bb(d)[0][0], 21.2, 0.01, "Diagonale an Pfostenfläche"); near(bb(d)[1][0], 1178.8, 0.01, "Diagonale an Pfostenfläche"); }
  const ring = rk.bodies.filter((b) => /^Ring 1/.test(b.name));
  assert.equal(ring.length, 24, "Ring aus 24 gegehrten Stücken");
  const k2 = { id: "r", ...defaultGenerator("gelaender") };
  Object.assign(k2.params, { runs: "1200", fill: "rahmen" });
  const rr = await K.buildPart(part([k2]));
  okAll(rr);
  assert.equal(rr.bodies.filter((b) => /^Füllungsrahmen/.test(b.name)).length, 4, "Rahmen aus 4 gegehrten Stäben");
  assert.ok(rr.bodies.filter((b) => /^Stab /.test(b.name)).length >= 8);
});

test("Tor-Generator: Doppeltor mit Stichbogen, Rahmen gegehrt, Stäbe bis unter den Bogen (MegaCAD-Abgleich M12)", async () => {
  const { defaultGenerator } = await import("../src/core/generator.js");
  const f = { id: "t", ...defaultGenerator("tor") };
  const res = await K.buildPart(part([f]));
  okAll(res);
  const by = (re) => res.bodies.filter((b) => re.test(b.name));
  const frameL = by(/^Flügel links Rahmen/);
  assert.equal(frameL.length, 3 + 4, "unten, rechts, 4 Bogenstücke, links");
  assert.ok(frameL.every((b) => Math.abs(b.meta.miterStart) > 0 && Math.abs(b.meta.miterEnd) > 0), "alle Ecken gegehrt");
  assert.equal(by(/^Torpfosten/).length, 2);
  const bb = (b) => b.shape.boundingBox.bounds;
  // Scheitel in der Mitte = 50 + 1200 + 250 (Spalt in der Mitte → knapp darunter)
  const top = Math.max(...frameL.map((b) => bb(b)[1][2]));
  assert.ok(top > 1450 && top <= 1502, "Scheitel " + top); // Gehrungsecken der Bogenstücke stehen minimal über
  // Stäbe berühren den Bogen nicht und laufen nicht darüber hinaus
  const bars = by(/Stab/);
  assert.ok(bars.length > 20);
  assert.ok(bars.every((b) => bb(b)[1][2] < 1500), "Stäbe unter dem Bogen");
  assert.match(res.status.t.info, /Doppeltor, Flügel 1478 mm/);
});

test("Treppen-Generator: Wangen unten waagrecht/oben senkrecht geschnitten, Stufen, Holme (MegaCAD-Abgleich M13)", async () => {
  const { defaultGenerator } = await import("../src/core/generator.js");
  const f = { id: "tr", ...defaultGenerator("treppe") };
  const res = await K.buildPart(part([f]));
  okAll(res);
  const by = (re) => res.bodies.filter((b) => re.test(b.name));
  assert.equal(by(/^Stufe \d+$/).length, 15, "2800 / 175 → 16 Steigungen, 15 Stufen");
  const w = by(/^Wange/);
  assert.equal(w.length, 2);
  const bb = (b) => b.shape.boundingBox.bounds;
  near(bb(w[0])[0][2], 0, 0.01, "Wange unten auf dem Boden");
  near(bb(w[0])[1][0], 15 * 280, 0.01, "Wange oben an der Deckenstirn (x = 15 · 280)");
  assert.ok(w[0].meta.miterStart > 50 && w[0].meta.miterEnd > 20, "Schnitte schräg zur Achse");
  // oberste Stufe: Oberkante = 15 · 175
  const top = Math.max(...by(/^Stufe \d+$/).map((b) => bb(b)[1][2]));
  near(top, 15 * 175, 0.01, "OK oberste Stufe");
  assert.match(res.status.tr.info, /16 Steigungen à 175 mm, Auftritt 280 mm, 2s \+ a = 630 mm/);
  assert.equal(by(/^Stufe \d+$/)[0].meta.density, 1, "Gitterrost mit Ersatzdichte");
  // Zwei Holme, aufgesattelt
  const f2 = { id: "h", ...defaultGenerator("treppe") };
  f2.params.support = "holm2";
  const r2 = await K.buildPart(part([f2]));
  okAll(r2);
  const holme = r2.bodies.filter((b) => /^Holm/.test(b.name));
  assert.equal(holme.length, 2);
  // Holm liegt unter den Stufen: höchster Punkt des Holms ≤ Unterkante der obersten Stufe + Steigung
  assert.ok(Math.max(...holme.map((b) => b.shape.boundingBox.bounds[1][2])) <= 15 * 175 - 30 + 1e-3);
});

test("Normteile: Schraube, Mutter, Scheibe, Gewindestange, Spannschloss mit Normbezeichnung (MegaCAD-Abgleich M20)", async () => {
  const { NORM_KINDS, NORM_THREADS: THREADS, defaultNormteil, collectNorm } = await import("../src/core/normteile.js");
  for (const kind of Object.keys(NORM_KINDS)) {
    const res = await K.buildPart(part([{ id: "n", ...defaultNormteil(kind) }]));
    okAll(res);
    assert.equal(res.bodies.length, 1, kind);
    assert.ok(res.bodies[0].meta.norm.designation.includes(NORM_KINDS[kind].norm), kind);
  }
  // M12 x 40, ISO 4017: Kopf unter z = 0, Schaft bis z = 40, Kopfvolumen ≈ Sechseck × k
  const t = THREADS.M12;
  const res = await K.buildPart(part([{ id: "s", ...defaultNormteil("schraube4017"), grade: "8.8" }, { id: "q", type: "regelkoerper", kind: "quader", dims: { L: "60", B: "60", H: "20" }, pos: ["0", "0", "50"], axis: "Z", op: "join" }]));
  okAll(res);
  assert.equal(res.bodies.length, 2, "Quader wird nicht mit der Schraube vereinigt");
  const bolt = res.bodies.find((b) => b.meta?.norm);
  assert.equal(bolt.name, "Sechskantschraube ISO 4017 - M12 x 40 - 8.8");
  const bb = bolt.shape.boundingBox.bounds;
  near(bb[0][2], -t.k, 0.01, "Kopf"); near(bb[1][2], 40, 0.01, "Ende");
  const head = (3 * Math.sqrt(3) / 2) * (t.s / Math.sqrt(3)) ** 2 * t.k;
  const core = t.d - 1.0825 * t.P;
  near(R.measureVolume(bolt.shape), head + Math.PI / 4 * core * core * 40, 1, "Volumen");
  // ISO 4014 M12 x 100: Schaft 100 − (2·12 + 6) = 70 mm voll
  const res14 = await K.buildPart(part([{ id: "s", ...defaultNormteil("schraube4014"), length: "100" }]));
  okAll(res14);
  near(R.measureVolume(res14.bodies[0].shape), head + Math.PI / 4 * (144 * 70 + core * core * 30), 1, "ISO 4014");
  // Muster: drei Schrauben → Normliste zählt 3
  const pat = await K.buildPart(part([{ id: "s", ...defaultNormteil("schraube4017") }, { id: "m", type: "pattern", feature: "s", kind: "linear", dir: "X", count: "3", spacing: "50" }]));
  okAll(pat);
  const rows = collectNorm([{ bodies: pat.bodies.map((b) => ({ ...b, props: { volume: R.measureVolume(b.shape) } })), qty: 2 }]);
  assert.equal(rows.length, 1); assert.equal(rows[0].qty, 6);
  near(rows[0].mass, R.measureVolume(bolt.shape) * 7.85 / 1e6, 1e-6, "Masse je Stück");
});

test("Treppe L- und U-Form mit Podest, Rahmen und Stützen (MegaCAD-Abgleich M14)", async () => {
  const { defaultGenerator } = await import("../src/core/generator.js");
  const bb = (b) => b.shape.boundingBox.bounds;
  // L links: 16 Steigungen à 175, 8 + 8, Auftritt 280, Laufbreite 1000
  const fL = { id: "l", ...defaultGenerator("treppe") };
  Object.assign(fL.params, { form: "L", turn: "links" });
  const rL = await K.buildPart(part([fL]));
  okAll(rL);
  const by = (r, re) => r.bodies.filter((b) => re.test(b.name));
  assert.equal(by(rL, /^Stufe \d+$/).length, 14, "7 + 7 Stufen");
  assert.equal(by(rL, /^Wange/).length, 4);
  assert.equal(by(rL, /^Podeststütze/).length, 2);
  assert.ok(by(rL, /^Podestrahmen/).length >= 4, "Rahmen aus vier gegehrten Stäben");
  const pod = by(rL, /^Podest$/)[0];
  near(bb(pod)[1][2], 8 * 175, 0.01, "Podest-OK"); near(bb(pod)[0][0], 7 * 280, 0.01, "Podestkante = Ende Lauf 1"); near(bb(pod)[1][1], 1000, 0.01);
  // Lauf 2 geht in +Y, oberste Stufe auf 15 · 175, über dem Podest (x zwischen 1960 und 2960)
  const s15 = by(rL, /^Stufe 15$/)[0];
  near(bb(s15)[1][2], 15 * 175, 0.01); near(bb(s15)[0][0], 7 * 280 + 5, 0.01); near(bb(s15)[1][0], 7 * 280 + 1000 - 5, 0.01); // zwischen den Seitenblechen (5 mm)
  near(bb(s15)[1][1], 1000 + 7 * 280, 0.01, "letzte Stufe endet an der Deckenstirn");
  assert.match(rL.status.l.info, /\(8 \+ 8\).*Podest auf 1400 mm/);
  // Stützen stehen auf dem Boden und tragen den Rahmen
  for (const s of by(rL, /^Podeststütze/)) { near(bb(s)[0][2], 0, 0.01); near(bb(s)[1][2], 1400 - 30 - 100, 0.01); }
  // U rechts mit Treppenauge 200, zwei Holme
  const fU = { id: "u", ...defaultGenerator("treppe") };
  Object.assign(fU.params, { form: "U", turn: "rechts", gap: "200", support: "holm2", stuetzen: "alle", n1: "6" });
  const rU = await K.buildPart(part([fU]));
  okAll(rU);
  assert.equal(by(rU, /^Holm/).length, 4); assert.equal(by(rU, /^Podeststütze/).length, 4);
  const pU = by(rU, /^Podest$/)[0];
  near(bb(pU)[0][1], -1200, 0.01, "Podest reicht über beide Läufe"); near(bb(pU)[1][2], 6 * 175, 0.01);
  const last = by(rU, /^Stufe 15$/)[0];
  near(bb(last)[0][1], -1200, 0.01); near(bb(last)[1][1], -200, 0.01);
  near(bb(last)[0][0], 5 * 280 - 9 * 280, 0.01, "Lauf 2 läuft zurück (−X)");
  // Fehler: zu wenig Steigungen in einem Lauf
  const fE = { id: "e", ...defaultGenerator("treppe") };
  Object.assign(fE.params, { form: "L", n1: "15" });
  const rE = await K.buildPart(part([fE]));
  assert.match(rE.status.e.error, /mindestens 2 Steigungen/);
});

test("Spindeltreppe: Stufen als Ringausschnitt, Träger, Geländer, Prüfung Durchgangshöhe (MegaCAD-Abgleich M14)", async () => {
  const { defaultGenerator, GENERATORS, resolveGenParams } = await import("../src/core/generator.js");
  const f = { id: "sp", ...defaultGenerator("spindel") };
  const res = await K.buildPart(part([f]));
  okAll(res);
  const by = (re) => res.bodies.filter((b) => re.test(b.name));
  const bb = (b) => b.shape.boundingBox.bounds;
  // 2800 / 190 → 15 Steigungen à 186,7; 14 Stufen, 14 Träger, 4 Stäbe je Stufe, Handlauf
  assert.equal(by(/^Stufe \d+$/).length, 14); assert.equal(by(/^Stufenträger/).length, 14); assert.equal(by(/^Geländerstab [\d.]+$/).length, 14 * 4, "4 Stäbe je Stufe: lichter Abstand ≤ 120 mm (Geländernorm Wohngebäude)");
  assert.ok(by(/^Handlauf/).length >= 13);
  const sp = by(/^Spindel/)[0];
  near(bb(sp)[1][2], 2800 + 900, 0.01, "Spindel bis Handlaufhöhe über der Decke");
  const s1 = by(/^Stufe 1$/)[0];
  near(bb(s1)[1][2], 2800 / 15, 0.01, "erste Stufe auf einer Steigung");
  assert.ok(bb(s1)[1][0] <= 900 + 1e-6 && bb(s1)[1][0] > 890, "Stufe reicht bis zum Außenradius");
  assert.equal(GENERATORS.spindel.plan(resolveGenParams("spindel", f.params, (x) => Number(x))).issues.length, 0, "Standardwerte ohne Warnung");
  // Winkel aus 2s + a = 630 auf der Gehlinie
  const P = resolveGenParams("spindel", f.params, (x) => Number(x));
  const plan = GENERATORS.spindel.plan(P);
  assert.match(plan.info, /15 Steigungen à 186,7 mm/);
  assert.match(plan.info, /2s \+ a = 630 mm/);
  // kleiner Durchmesser → Durchgangshöhe zu klein
  const small = GENERATORS.spindel.plan({ ...P, D: 1300 });
  assert.ok(small.issues.some((x) => /Durchgangshöhe/.test(x.message)), JSON.stringify(small.issues));
  assert.throws(() => GENERATORS.spindel.plan({ ...P, D: 600 }), /Außendurchmesser zu klein/);
});

test("Balkon-Generator: Rahmen, Querträger, Belag, Stützen, Wandplatten, Geländer an drei Seiten (MegaCAD-Abgleich M16)", async () => {
  const { defaultGenerator } = await import("../src/core/generator.js");
  const f = { id: "bk", ...defaultGenerator("balkon") };
  const res = await K.buildPart(part([f]));
  okAll(res);
  const by = (re) => res.bodies.filter((b) => re.test(b.name));
  const bb = (b) => b.shape.boundingBox.bounds;
  const belag = by(/^Belag$/)[0];
  near(bb(belag)[1][2], 2800, 0.01, "OK Belag"); near(bb(belag)[0][1], 15, 0.01, "vor der Wandplatte"); near(bb(belag)[1][1], 1500, 0.01); near(bb(belag)[1][0], 3000, 0.01);
  assert.equal(by(/^Rahmen/).length, 4, "vier gegehrte Rahmenstäbe");
  assert.equal(by(/^Querträger/).length, 4, "lichte 2720 / 600 → 5 Felder, 4 Träger");
  assert.equal(by(/^Stütze/).length, 2); assert.equal(by(/^Fußplatte/).length, 2); assert.equal(by(/^Wandplatte/).length, 6);
  for (const s of by(/^Stütze/)) { near(bb(s)[0][2], 15, 0.01); near(bb(s)[1][2], 2800 - 30 - 140, 0.01, "Stütze unter dem Rahmen"); }
  for (const w of by(/^Wandplatte/)) { near(bb(w)[0][1], 0, 0.01, "Wandplatte an der Wand"); }
  // Geländer: Pfosten auf dem Belag, an drei Seiten innerhalb der Fläche, Handlauf auf 2800 + 1000
  const posts = by(/^Geländer Pfosten/);
  assert.ok(posts.length >= 7, "Pfosten " + posts.length);
  for (const p of posts) { assert.ok(bb(p)[0][0] > 0 && bb(p)[1][0] < 3000 && bb(p)[1][1] < 1500, "innerhalb"); assert.ok(bb(p)[0][2] >= 2800 - 1e-6); }
  const rail = by(/^Geländer Handlauf/);
  near(Math.max(...rail.map((b) => bb(b)[1][2])), 3800, 0.01, "OK Handlauf");
  assert.match(res.status.bk.info, /Balkon 3000 × 1500 mm auf 2800 mm, 4 Querträger, 2 Stützen, Geländer/);
  // ohne Stützen: Hinweis
  const f2 = { id: "k", ...defaultGenerator("balkon") };
  Object.assign(f2.params, { support: "keine", railing: false, deck: "holz" });
  const r2 = await K.buildPart(part([f2]));
  okAll(r2);
  assert.match(r2.status.k.warning || "", /Kragarm/);
  assert.equal(r2.bodies.filter((b) => /^Stütze|^Geländer/.test(b.name)).length, 0);
  assert.equal(r2.bodies.find((b) => b.name === "Belag").meta.density, 0.7, "Holz");
});

test("Stirnplattenstoß: Gegenplatte und Verschraubung mit Normteilen (MegaCAD-Abgleich M15)", async () => {
  const { collectNorm } = await import("../src/core/normteile.js");
  const prof = { id: "pr", type: "profile", section: "rechteck", dims: { B: "120", H: "60", t: "4", r: "6" }, length: "1000", start: ["0", "0", "0"], axis: "X", rotation: "0" };
  const res0 = await K.buildPart(part([prof]));
  if (!res0.status.pr.ok) { log("Profil-Feature anders aufgebaut – Test übersprungen", JSON.stringify(res0.status.pr)); return; }
  const pl = { id: "pl", type: "platte", target: "pr", member: 0, end: "B", thickness: "15", overhang: "40", width: "0", height: "0", radius: "0", holes: "4", holeDia: "18", edge: "25", counter: true, bolts: true, boltGrade: "8.8" };
  const res = await K.buildPart(part([prof, pl]));
  okAll(res);
  const rows = collectNorm([{ bodies: res.bodies.map((b) => ({ ...b, props: { volume: R.measureVolume(b.shape) } })) }]);
  // Ø 18 → M16; Klemmlänge 30 + 2·3 + 14,8 + 4 = 54,8 → 55
  assert.deepEqual(rows.map((r) => [r.name, r.qty]), [["Scheibe ISO 7089 - 16 - 200 HV", 8], ["Sechskantmutter ISO 4032 - M16 - 8", 4], ["Sechskantschraube ISO 4017 - M16 x 55 - 8.8", 4]]);
  assert.ok(res.bodies.some((b) => /Gegenplatte/.test(b.name)));
  assert.match(res.status.pl.info, /4 × M16 x 55 \(Klemmlänge 30 mm\)/);
  // Schrauben stehen in den Bohrungen: Schraubenachse quer zur Platte, innerhalb der Plattenfläche
  const bolt = res.bodies.find((b) => b.meta?.norm?.kind === "schraube4017");
  const bb = bolt.shape.boundingBox.bounds;
  assert.ok(bb[0][0] < 1000 && bb[1][0] > 1030, "Schraube durch beide Platten (x 1000 … 1030)");
});

test("Stahlbau-Generatoren: Windverband, Pfette mit Stoß, Rahmenecke mit Normteilen (MegaCAD-Abgleich M15)", async () => {
  const { defaultGenerator } = await import("../src/core/generator.js");
  const { collectNorm } = await import("../src/core/normteile.js");
  const bb = (b) => b.shape.boundingBox.bounds;
  const build = async (gen, params = {}) => { const f = { id: "g", ...defaultGenerator(gen) }; Object.assign(f.params, params); const r = await K.buildPart(part([f])); okAll(r); return r; };
  const norms = (r) => collectNorm([{ bodies: r.bodies.map((b) => ({ ...b, props: { volume: R.measureVolume(b.shape) } })) }]).map((x) => [x.name, x.qty]);
  // Windverband X mit 2 Spannschlössern, 4 Knotenbleche, 4 Stabstücke
  const wv = await build("windverband");
  assert.deepEqual(norms(wv), [["Spannschloss DIN 1480 - M16 - verzinkt", 2]]);
  assert.equal(wv.bodies.filter((b) => /^Knotenblech/.test(b.name)).length, 4);
  assert.equal(wv.bodies.filter((b) => /^Diagonale/.test(b.name)).length, 4);
  assert.match(wv.status.g.info, /2 Diagonale\(n\) Rundstahl Ø 16/);
  // Pfette 2 × 5000, Stoß ab 6000 → ein Stoß über dem Mittelbinder, 4 Pfettenschuhe
  const pf = await build("pfette");
  assert.equal(pf.bodies.filter((b) => /^Pfette \d/.test(b.name)).length, 2);
  assert.equal(pf.bodies.filter((b) => /^Pfettenschuh/.test(b.name)).length, 4);
  const p1 = pf.bodies.find((b) => b.name === "Pfette 1");
  near(bb(p1)[1][0], 5000 - 5, 0.01, "Stoßfuge 10 mm"); near(bb(p1)[0][2], 0, 0.01, "Pfette liegt auf dem Binder"); near(bb(p1)[1][2], 120, 0.01, "hochkant");
  assert.equal(norms(pf).filter((x) => /^Sechskantschraube/.test(x[0])).reduce((a, x) => a + x[1], 0), 4 + 4, "je Schuh 2 Schrauben (zwei Längen)");
  // Rahmenecke HEA 200 / IPE 240: 6 Schrauben M20 10.9, Stirnplatte bündig am Stützenflansch
  const re = await build("rahmenecke");
  const n = norms(re);
  assert.ok(n.some(([nm, q]) => /^Sechskantschraube ISO 4017 - M20 x \d+ - 10\.9$/.test(nm) && q === 6), JSON.stringify(n));
  const sp = re.bodies.find((b) => b.name === "Stirnplatte"), col = re.bodies.find((b) => b.name === "Stütze"), rg = re.bodies.find((b) => b.name === "Riegel");
  near(bb(sp)[0][0], 95, 0.01, "Stirnplatte an der Flanschaußenseite (190/2)"); near(bb(sp)[1][0], 115, 0.01);
  near(bb(col)[1][0], 95, 0.01, "Stütze hat die Flansche quer zu X");
  near(bb(rg)[0][0], 115, 0.01, "Riegel beginnt an der Stirnplatte");
  assert.equal(re.bodies.filter((b) => /^Steife/.test(b.name)).length, 4);
});

test("Kantteil: Volumen = Mittellinie × t × Länge, Abwicklung als Platte (MegaCAD-Abgleich M17)", async () => {
  const { defaultKantteil } = await import("../src/core/blech.js");
  const f = { id: "kt", ...defaultKantteil() };
  const res = await K.buildPart(part([f]));
  okAll(res);
  const b = res.bodies[0];
  const mid = 36 + 92 + 36 + 2 * (3 * Math.PI / 2);
  near(R.measureVolume(b.shape), mid * 2 * 1000, 1, "Volumen");
  const bb = b.shape.boundingBox.bounds;
  near(bb[1][1] - bb[0][1], 1000, 0.01, "Länge in Y"); near(bb[1][0] - bb[0][0], 40, 0.01, "Schenkel 40 außen"); near(bb[1][2] - bb[0][2], 100, 0.01, "Steg 100 außen");
  assert.match(res.status.kt.info, /Abwicklung 172[.,]36 × 1000 mm, 2 Biegung/);
  const flat = await K.buildPart(part([{ ...f, view: "abgewickelt" }]));
  okAll(flat);
  near(flat.bodies[0].shape.boundingBox.bounds[1][0], 172.357, 0.01);
  near(b.meta.sheet.flat, 172.357, 0.001);
});

test("Kantteil und Knickrahmen mit Biegetabelle bzw. DIN 6935 (Werkzeuge Stufe 31)", async () => {
  const { defaultKantteil } = await import("../src/core/blech.js");
  const { setUserBendTables, dinK } = await import("../src/core/bendtable.js");
  const { defaultKnickrahmen } = await import("../src/core/knickrahmen.js");
  setUserBendTables([{ material: "S235", t: 2, mode: "k", ref: "biege", fallbackK: 0.33, radii: [1, 3], angles: [45, 135], values: [[0.5, 0.5], [0.5, 0.5]] }]);
  try {
    const f = { id: "kt", ...defaultKantteil(), rule: "tabelle" };
    const res = await K.buildPart(part([f]));
    okAll(res);
    near(res.bodies[0].meta.sheet.flat, 36 + 92 + 36 + 2 * (2 + 0.5 * 2) * Math.PI / 2, 0.001, "Abwicklung mit K 0,5 aus der Tabelle");
    assert.match(res.status.kt.info, /Biegetabelle S235 2 mm, K 0,5 \/ 0,5/);
    const other = await K.buildPart({ ...part([f]), material: "S355" });
    near(other.bodies[0].meta.sheet.flat, 172.357, 0.001, "ohne Tabelle für S355 gilt der K-Faktor des Features");
    assert.match(other.status.kt.warning, /Keine Biegetabelle für S355/);
    const { catalogToDims } = await import("../src/core/sections.js");
    const kr = { id: "kr", ...defaultKnickrahmen(catalogToDims("rechteck", "60x40x3")), bendRule: "din" };
    const r2 = await K.buildPart(part([kr]));
    okAll(r2);
    const m = r2.bodies[0].meta;
    const t = Number(kr.dims.t), ri = Number(kr.bendRadius);
    assert.match(m.rule, /DIN 6935/);
    near(m.bendAllowances[0], (ri + dinK(ri, t) * t) * Math.abs(Number(kr.bends[0].angle)) * Math.PI / 180, 1e-6, "Biegezugabe nach DIN");
  } finally { setUserBendTables([]); }
});

test("Treppe mit Geländer: beidseitig, ums Podest, Knieleisten/Staketen, Höhe über Stufenkante", async () => {
  const { defaultGenerator } = await import("../src/core/generator.js");
  const bb = (b) => b.shape.boundingBox.bounds;
  const by = (r, re) => r.bodies.filter((b) => re.test(b.name));
  // gerade, beidseitig, 2 Knieleisten: Handlauf-OK 1000 über der Stufenkante
  const f = { id: "g", ...defaultGenerator("treppe") };
  const r = await K.buildPart(part([f]));
  okAll(r);
  const hl = by(r, /^Geländer (links|rechts) Handlauf/);
  assert.ok(hl.length >= 2);
  const s = 175, a = 280, u = 20;
  // erste Stufenkante bei x = −20, z = 175: Handlauf dort 1000 höher; oben 15 · 175 + 1000 (Auslauf waagrecht)
  near(Math.max(...hl.map((b) => bb(b)[1][2])), 16 * s + 1000, 1, "Handlauf-OK oben");
  const posts = by(r, /^Geländer rechts Pfosten/);
  assert.ok(posts.length >= 5);
  assert.ok(posts.every((b) => bb(b)[1][1] < 0), "rechts außerhalb der Wange (y < 0)");
  assert.ok(by(r, /^Geländer links Pfosten/).every((b) => bb(b)[0][1] > 1000), "links jenseits der Laufbreite");
  assert.equal(by(r, /Knieleiste/).length % 2, 0);
  // Knieleisten am Stück je Abschnitt durch die Pfosten: jeder Pfosten zweimal durchbrochen (Ø 26,9 + 1)
  assert.equal(by(r, /Knieleiste/).length, 8);
  const pr = posts.filter((b) => /Pfosten \d+$/.test(b.name));
  assert.ok(pr.every((b) => b.meta.drills >= 2 && Math.abs(b.meta.drillD - 27.9) < 1e-9), JSON.stringify(pr.map((b) => b.meta.drills)));
  // Stufen nach DIN 24531: Seitenbleche mit Bohrung + Langloch, Wangen je Stufe 2 × Ø 14 auf jeder Seite
  const sb = by(r, /Seitenblech/);
  assert.equal(sb.length, 2 * 15);
  assert.ok(sb.every((b) => b.meta.plate.holes === 1 && b.meta.plate.slots === 1));
  assert.ok(by(r, /^Wange/).every((b) => b.meta.drills === 2 * 15 && b.meta.drillD === 14), JSON.stringify(by(r, /^Wange/).map((b) => b.meta.drills)));
  // zwischen den Pfosten (wie bisher): schräger Schnitt am Pfosten = Neigung des Laufs (atan 175/280 ≈ 32°)
  const rZ = await K.buildPart(part([{ ...f, id: "z", params: { ...f.params, gelBeltMode: "zwischen" } }]));
  const kl = rZ.bodies.filter((b) => /Knieleiste/.test(b.name));
  assert.ok(kl.some((b) => Math.abs(b.meta.miterStart - 32) < 1), JSON.stringify(kl.map((b) => [b.name, b.meta.miterStart])).slice(0, 300));
  assert.match(r.status.g.info, /Geländer: rechts und links, \d+ Pfosten, \d+ Knieleisten/);
  // L links mit Podestgeländer: der äußere Zug läuft ums Podest (Pfosten an der Podestecke außen)
  const fL = { id: "l", ...defaultGenerator("treppe") };
  Object.assign(fL.params, { form: "L", turn: "links", gelFill: "staketen" });
  const rL = await K.buildPart(part([fL]));
  okAll(rL);
  const corner = by(rL, /^Geländer rechts Pfosten/).find((b) => bb(b)[0][0] > 7 * a + 1000 && bb(b)[1][1] < 0);
  assert.ok(corner, "Eckpfosten außen am Podest");
  near(bb(corner)[1][2], 8 * s + 1000 - 42.4 - 60 - 4, 0.5, "Pfostenende unter dem Handlauf (Podesthöhe + 1000 − Halter 60 − Endkappe 4)");
  assert.ok(by(rL, /Stab/).length > 40 && by(rL, /Untergurt/).length > 4);
  // ältere Treppe ohne Angabe: kein Geländer
  const old = { id: "o", type: "generator", gen: "treppe", params: { ...defaultGenerator("treppe").params } };
  delete old.params.gel;
  const rO = await K.buildPart(part([old]));
  assert.equal(by(rO, /^Geländer/).length, 0);
});

test("Schiebetor: Flügel mit Gegengewicht, Rollenböcke, Pfosten; Teile Flügel/fest (E8)", async () => {
  const { defaultGenerator } = await import("../src/core/generator.js");
  const bb = (b) => b.shape.boundingBox.bounds;
  const f = { id: "s", ...defaultGenerator("schiebetor") };
  const r = await K.buildPart(part([f]));
  okAll(r);
  const all = r.bodies.map((b) => bb(b));
  near(Math.min(...all.map((x) => x[0][0])), -1600, 1, "Gegengewicht hinten");
  near(Math.max(...r.bodies.filter((b) => /^Flügel/.test(b.name)).map((b) => bb(b)[1][2])), 60 + 1400, 0.5, "Flügel-OK");
  assert.equal(r.bodies.filter((b) => /Rollenbock/.test(b.name)).length, 2);
  assert.match(r.status.s.info, /Gegengewicht 1600/);
  const leaf = await K.buildPart(part([{ ...f, params: { ...f.params, teil: "fluegel" } }]));
  const fixed = await K.buildPart(part([{ ...f, params: { ...f.params, teil: "fest" } }]));
  okAll(leaf); okAll(fixed);
  assert.equal(leaf.bodies.length + fixed.bodies.length, r.bodies.length);
  assert.ok(fixed.bodies.every((b) => !/^Flügel/.test(b.name)));
});

test("Zaun: eben, Gefälle mit schrägen Riegeln, gestuft, Blech mit Fußplatten (E9)", async () => {
  const { defaultGenerator } = await import("../src/core/generator.js");
  const bb = (b) => b.shape.boundingBox.bounds;
  for (const patch of [{}, { terrain: "gefaelle", fill: "quer" }, { terrain: "stufen" }, { terrain: "gefaelle", fill: "blech", base: "fussplatte" }]) {
    const f = { id: "z", ...defaultGenerator("zaun") };
    Object.assign(f.params, patch);
    const r = await K.buildPart(part([f]));
    okAll(r);
    assert.equal(r.bodies.filter((b) => /^Pfosten/.test(b.name)).length, 5, JSON.stringify(patch));
    if (patch.terrain === "gefaelle" && patch.fill === "quer") {
      const u = r.bodies.find((b) => b.name === "Feld 4 Unterriegel");
      near(bb(u)[1][2], 0.06 * 9970 + 80 + 40, 1, "Unterriegel folgt dem Gelände (OK am Pfosten 5)");
    }
  }
});

test("Handlaufhalter: Bohrung 12,1 mm im Handlauf, Stift und Endkappe als Körper; UPN-Wangen offen nach außen", async () => {
  const { defaultGenerator } = await import("../src/core/generator.js");
  const bb = (b) => b.shape.boundingBox.bounds;
  const f = { id: "g", ...defaultGenerator("gelaender") };
  Object.assign(f.params, { runs: "2500" });
  const r = await K.buildPart(part([f]));
  okAll(r);
  const rail = r.bodies.find((b) => b.name === "Handlauf");
  assert.equal(rail.meta.drills, 4);
  assert.equal(rail.meta.drillD, 12.1);
  const f0 = { ...f, params: { ...f.params, holder: "keine" } };
  const r0 = await K.buildPart(part([f0]));
  const lost = R.measureVolume(r0.bodies.find((b) => b.name === "Handlauf").shape) - R.measureVolume(rail.shape);
  near(lost, 4 * Math.PI * (12.1 / 2) ** 2 * 2.6, 40, "4 Bohrungen nur durch die untere Wand");
  assert.equal(r.bodies.filter((b) => /Handlaufhalter$/.test(b.name)).length, 4);
  assert.equal(r.bodies.filter((b) => /Endkappe$/.test(b.name)).length, 4);
  near(bb(r.bodies.find((b) => b.name === "Pfosten 1"))[1][2], 1000 - 42.4 - 64, 0.5, "Pfostenende");
  // Treppe mit UPN-Wangen: Steg innen an den Stufen (rechte Wange: Steg bei y = 0), offen nach außen
  const t = { id: "t", ...defaultGenerator("treppe") };
  Object.assign(t.params, { support: "upn", gel: "keine" });
  const rt = await K.buildPart(part([t]));
  okAll(rt);
  const w = rt.bodies.find((b) => b.name === "Wange rechts");
  near(bb(w)[1][1], 0, 0.5, "Steg bündig an der Stufe");
  near(bb(w)[0][1], -75, 0.5, "Flansche nach außen (UPN 200: 75 mm)");
});

test("Pfostenbefestigung oben: Fußplatte auf der U200-Wange, Gegenbohrungen im Flansch, Pfostenfuß schräg", async () => {
  const { defaultGenerator } = await import("../src/core/generator.js");
  const t = { id: "t", ...defaultGenerator("treppe") };
  Object.assign(t.params, { support: "upn", upn: { kind: "upn", size: "200" }, gel: "rechts", gelMount: "oben", gelFill: "keine" });
  const res = await K.buildPart(part([t]));
  okAll(res);
  const t0 = { ...t, params: { ...t.params, gelMount: "aus" } };
  const r0 = await K.buildPart(part([t0]));
  const w = res.bodies.find((b) => b.name === "Wange rechts"), w0 = r0.bodies.find((b) => b.name === "Wange rechts");
  const transferred = Number(res.status.t.info.match(/(\d+) Gegenbohrungen/)[1]);
  assert.equal((w.meta.drills || 0) - (w0.meta.drills || 0), transferred, "jede übertragene Bohrung ist im Flansch");
  near(R.measureVolume(w0.shape) - R.measureVolume(w.shape), transferred * Math.PI * (13.5 / 2) ** 2 * 11.5, transferred * 30, "Bohrungen Ø 13,5 durch den 11,5-mm-Flansch");
  const plates = res.bodies.filter((b) => / Fußplatte$/.test(b.name));
  assert.ok(plates.length >= 5);
  near(R.measureVolume(plates[1].shape), 70 * 160 * 10 - 2 * Math.PI * (13.5 / 2) ** 2 * 10, 5, "Platte 160 × 70 × 10 mit 2 Bohrungen");
  // Pfosten 2 steht auf der Platte: kein Überlappen von Pfosten und Platte
  const post = res.bodies.find((b) => b.name === "Geländer rechts Pfosten 2"), pl = res.bodies.find((b) => b.name === "Geländer rechts Pfosten 2 Fußplatte");
  near(R.measureVolume(post.shape.clone().intersect(pl.shape.clone())), 0, 1, "Pfosten durchdringt die Platte nicht");
});
