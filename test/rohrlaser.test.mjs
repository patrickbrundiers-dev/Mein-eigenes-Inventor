// Übernahmen aus der Rohrlaser-Kalkulation (docs/roadmap/rohrlaser-editor-abgleich.md) – ohne Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { profileMatches, parseProfileId, resolveProfile } from "../src/core/profilesearch.js";

const ids = (t, kinds) => profileMatches(t, kinds).map((e) => e.id);

test("Profil-Treffer: doppelte Maße dürfen fehlen, gleiche Maße zuerst", () => {
  assert.equal(ids("40x3")[0], "QR 40x40x3");
  assert.equal(ids("40x40x3")[0], "QR 40x40x3");
  assert.equal(ids("60*40*3")[0], "RE 60x40x3");
  assert.equal(ids("42,4x2,6")[0], "RR 42,4x2,6");
  assert.ok(ids("40").includes("RE 40x20x2"), "Maße am Anfang");
});
test("Profil-Treffer: Kürzel vorne muss passen, Arten begrenzbar", () => {
  assert.ok(ids("qr 40").every((x) => x.startsWith("QR 40x40")));
  assert.ok(ids("rr").every((x) => x.startsWith("RR ")));
  assert.deepEqual(ids("RR 40", ["vierkant", "rechteck"]), []);
  assert.deepEqual(ids(""), []);
});
test("Profil-ID lesen, auch ohne Normgröße", () => {
  assert.deepEqual(parseProfileId("RE 70x50x4"), { kind: "rechteck", dims: { B: "70", H: "50", t: "4", r: "8" } });
  assert.deepEqual(parseProfileId("RR 42,4x2"), { kind: "rohr", dims: { D: "42.4", t: "2" } });
  assert.deepEqual(parseProfileId("QR 50x50x4"), { kind: "vierkant", dims: { B: "50", t: "4", r: "8" } });
  assert.equal(parseProfileId("QR 40x30x3").kind, "rechteck");
  assert.deepEqual(parseProfileId("FL 8x40").dims, { B: "40", t: "8" });
  assert.equal(parseProfileId("RE 70x50"), null);
  assert.equal(parseProfileId("XY 20"), null);
  assert.equal(parseProfileId("RR 0x2"), null);
});
test("Eingabe auflösen: genau, Profil-ID, eindeutiger Treffer, sonst Fehler", () => {
  assert.equal(resolveProfile("qr 40x40x3").id, "QR 40x40x3");
  assert.equal(resolveProfile("40x3").id, "QR 40x40x3");
  assert.equal(resolveProfile("RE 70x50x4").id, "RE 70x50x4");
  assert.match(resolveProfile("qr 40").error, /Mehrdeutig/);
  assert.match(resolveProfile("xyz").error, /Kein Profil/);
  assert.match(resolveProfile("RR 40x2", ["vierkant", "rechteck"]).error, /nicht möglich/);
  assert.match(resolveProfile("  ").error, /Keine Eingabe/);
});

// ---------- Fertigungsprüfung (dfm.py) ----------
import { checkCutList, envelopeDiameter, dfmLimits, DFM_DEFAULTS, FEHLER, WARNUNG, HINWEIS } from "../src/core/dfm.js";
import { SETTINGS, defaultSettings } from "../src/core/settings.js";

const row = (pos, profileId, length, extra = {}) => ({ pos, profileId, length, kgm: 3.3, ...extra });
const rules = (found) => found.map((f) => `${f.pos}:${f.rule}`);

test("Fertigung: Teil zu lang gegen nutzbare Stange, genau an der Grenze in Ordnung", () => {
  const usable = 6500 - 10 - 142;
  assert.deepEqual(checkCutList([row(1, "QR 40x40x3", usable), row(2, "QR 40x40x3", usable + 0.1)]).map((f) => [f.pos, f.rule, f.level]), [[2, "Teil zu lang", FEHLER]]);
  assert.match(checkCutList([row(1, "QR 40x40x3", 7000)])[0].text, /nutzbar 6\.348 mm/);
  assert.deepEqual(checkCutList([row(1, "QR 40x40x3", 7000)], { stange: 0 }), [], "0 = aus");
});
test("Fertigung: kürzestes Teil nur mit Grenze", () => {
  assert.deepEqual(checkCutList([row(1, "QR 40x40x3", 20)]), [], "Vorgabe 0 = keine Grenze");
  assert.deepEqual(rules(checkCutList([row(1, "QR 40x40x3", 20), row(2, "QR 40x40x3", 30)], { kuerzestesTeil: 30 })), ["1:Teil zu kurz"]);
});
test("Fertigung: Hüllkreis und Metergewicht", () => {
  assert.equal(envelopeDiameter("RR 42,4x2,6"), 42.4);
  assert.ok(Math.abs(envelopeDiameter("RE 60x40x3") - Math.hypot(60, 40)) < 1e-9);
  assert.ok(Math.abs(envelopeDiameter("QR 40x40x3") - 40 * Math.SQRT2) < 1e-9);
  assert.equal(envelopeDiameter("Sonderprofil"), null);
  const found = checkCutList([row(1, "QR 200x200x10", 1000, { kgm: 58 }), row(2, "RE 160x80x5", 1000, { kgm: 17.8 })]);
  assert.deepEqual(rules(found), ["1:Profil zu groß", "1:Profil zu schwer"]);
});
test("Fertigung: Knickrahmen-Schenkel und Wand, schwerste Stufe zuerst", () => {
  const knick = { legs: [800, 110, 600], inPlane: 60, wall: 5 };
  const found = checkCutList([row(1, "RE 60x40x5", 1500, { knick }), row(2, "QR 40x40x3", 9000)]);
  assert.deepEqual(found.map((f) => [f.pos, f.level]), [[2, FEHLER], [1, WARNUNG], [1, HINWEIS]]);
  assert.match(found[1].text, /1 Schenkel unter 2 × 60 mm \(120 mm\), kürzester Schenkel 2 mit 110 mm/);
  assert.deepEqual(checkCutList([row(1, "RE 60x40x3", 1500, { knick: { ...knick, wall: 3 } })], { knickSchenkel: 0 }), []);
});
test("Fertigung: Grenzen kommen aus den Einstellungen, Startwerte gleich", () => {
  const d = defaultSettings();
  assert.deepEqual(dfmLimits((k) => d[k]), DFM_DEFAULTS);
  assert.ok(SETTINGS.filter((s) => s.cat === "fertigung").length === Object.keys(DFM_DEFAULTS).length);
  assert.equal(dfmLimits((k) => (k === "fertigung.stange" ? 3000 : undefined)).stange, 3000);
});

// ---------- Konturen am Rohr (Rohr-Editor, schneidweg.py) ----------
import { parsePattern, cutLength, planTubeCuts, defaultTubeCut, tubeCutLabel } from "../src/core/tubecuts.js";

const ev = (s) => Number(String(s).replace(",", "."));
const QR = { kind: "vierkant", W: 40, H: 40, t: 3, r: 6, L: 1000 };

test("Rohr-Konturen: Muster „3x25“ wie im Rohr-Editor", () => {
  assert.deepEqual(parsePattern("3x25"), { count: 3, spacing: 25 });
  assert.deepEqual(parsePattern(" 4 × 12,5", ev), { count: 4, spacing: 12.5 });
  assert.deepEqual(parsePattern("1"), { count: 1, spacing: 0 });
  assert.deepEqual(parsePattern(""), { count: 1, spacing: 0 });
  assert.throws(() => parsePattern("3"), /Abstand/);
  assert.throws(() => parsePattern("3x0"), /Abstand/);
  assert.throws(() => parsePattern("abc"), /Anzahl × Abstand/);
});
test("Rohr-Konturen: Schnittlängen nach schneidweg.py", () => {
  assert.equal(cutLength({ kind: "bohrung", d: 10 }), Math.PI * 10);
  assert.equal(cutLength({ kind: "langloch", l: 30, b: 10 }), 40 + Math.PI * 10);
  assert.equal(cutLength({ kind: "rechteck", l: 40, b: 20, r: 2 }), 120 - 16 + 4 * Math.PI);
  assert.equal(cutLength({ kind: "ausklinkung", l: 30, b: 20, r: 3 }), 54 + 14 + 3 * Math.PI);
});
test("Rohr-Konturen: Planung mit Muster, durchgehend, Schneidweg und Einstiche", () => {
  const p = planTubeCuts([{ ...defaultTubeCut("bohrung"), x: "100", pattern: "3x50", through: true }, defaultTubeCut("ausklinkung")], QR, ev);
  assert.deepEqual(p.issues, []);
  assert.deepEqual(p.items[0].xs, [100, 150, 200]);
  assert.equal(p.pierces, 7);
  assert.ok(Math.abs(p.cutLength - (6 * Math.PI * 10 + cutLength({ kind: "ausklinkung", l: 30, b: 20, r: 3 }))) < 1e-9);
  assert.equal(tubeCutLabel(p.items[0]), "Bohrung Ø10 oben durchgehend, 3× ab 100");
  assert.equal(p.items[1].halfN, 20);
});
test("Rohr-Konturen: Prüfungen nennen die Kontur", () => {
  const msg = (c, prof = QR) => planTubeCuts([{ ...defaultTubeCut(c.kind || "bohrung"), ...c }], prof, ev).issues.map((x) => x.message).join();
  assert.match(msg({ x: "3" }), /Kontur 1: liegt nicht ganz auf dem Teil/);
  // über die Eckrundung (r 6) bis 80° um die Rundung: 14 + 6 · 80° = 22,38 mm
  assert.equal(msg({ q: "10", d: "10" }), "");
  assert.match(msg({ q: "18", d: "10" }), /ragt zu weit über die Eckrundung \(\|Versatz\| \+ b\/2 auf der Abwicklung höchstens 22,38 mm\)/);
  assert.match(msg({ q: "14", d: "10" }, { ...QR, r: 3 }), /nur ab Eckradius Wand \+ 0,6 mm/);
  assert.match(msg({ kind: "langloch", l: "10", b: "10" }), /Länge muss größer/);
  assert.match(msg({ kind: "rechteck", r: "15" }), /Eckradius 0 bis 10 mm/);
  assert.match(msg({ side: "links" }), /Seite oben, vorne, unten oder hinten/);
  assert.match(msg({ pattern: "3x5" }), /überlappen/);
  assert.match(msg({ kind: "ausklinkung", l: "1000" }), /länger als das Teil/);
  // Rundrohr 3D: Ø40 an Ø42,4 braucht 70,63° Kopfschwenk → auf ±45° begrenzt; 2D auf der Abwicklung bis 80° um das Rohr
  assert.match(msg({ d: "40" }, { kind: "rohr", W: 42.4, H: 42.4, t: 2.6, L: 1000 }), /braucht in 3D 70,63° Kopfschwenk, Winkelkorrektur auf ±45°/);
  assert.equal(msg({ d: "20" }, { kind: "rohr", W: 42.4, H: 42.4, t: 2.6, L: 1000 }), "");
  assert.equal(msg({ d: "40" }, { kind: "rohr", W: 42.4, H: 42.4, t: 2.6, L: 1000, mode: "2D" }), "");
  assert.match(msg({ d: "40" }, { kind: "rohr", W: 42.4, H: 42.4, t: 2.6, L: 1000, swivel: 75 }), /^$/);
  assert.match(planTubeCuts([defaultTubeCut()], { ...QR, kind: "winkel" }, ev).issues[0].message, /nur für Rund-, Quadrat- und Rechteckrohr/);
  // Rechteckrohr vorne: Fläche über die Höhe H
  const re = { kind: "rechteck", W: 60, H: 40, t: 3, r: 6, L: 1000 };
  const it = planTubeCuts([{ ...defaultTubeCut(), side: "vorne" }], re, ev).items[0];
  assert.deepEqual([it.halfN, it.faceHalf, it.angle], [30, 14, 90]);
});

// ---------- Schnitt der Enden in 2D/3D (schnittflaeche.py, dreid.py) ----------
import { endCutEdge, outline, endCutSupported } from "../src/core/endcut.js";

test("2D/3D: 2D Innenkante unter der Außenkante, 3D eben, Winkelkorrektur begrenzt", () => {
  const dims = { W: 40, H: 40, r: 6 };
  const plane = { z0: 500, cu: 0, cv: 1 }; // 45° über die Höhe
  const e2 = endCutEdge("vierkant", dims, plane, "2D", 45, { t: 3 });
  assert.ok(e2.outer.every((o, i) => Math.abs(o[2] - e2.inner[i][2]) < 1e-9), "2D: gleiche Lage längs");
  assert.ok(Math.abs(e2.need - 45) < 1e-9 && !e2.clamped);
  const e3 = endCutEdge("vierkant", dims, plane, "3D", 45, { t: 3 });
  for (const q of [...e3.outer, ...e3.inner]) assert.ok(Math.abs(q[2] - (500 + q[1])) < 1e-9, "3D: alle Punkte in der Ebene");
  const steep = endCutEdge("vierkant", dims, { z0: 500, cu: 0, cv: Math.tan(Math.PI / 3) }, "3D", 45, { t: 3 });
  assert.ok(steep.clamped && Math.abs(steep.need - 60) < 1e-9);
  const top = steep.outer.findIndex((q) => q[1] > 20.49); // Punkt auf der Oberseite (Normale = +v)
  assert.ok(Math.abs((steep.outer[top][2] - steep.inner[top][2]) / (steep.outer[top][1] - steep.inner[top][1]) - 1) < 1e-9, "Schwenk auf tan 45° = 1 begrenzt");
  assert.equal(outline("rohr", { W: 42.4 }).length, 96);
  assert.equal(outline("rechteck", { W: 60, H: 40, r: 6 }).length, 36);
  assert.equal(endCutSupported("rechteck", { t: 3, r: 6 }), true);
  assert.equal(endCutSupported("rechteck", { t: 3, r: 3 }), false);
  assert.equal(endCutSupported("flach", { t: 8 }), false);
});
test("Bohrung 3D: Neigung, Ellipse, Begrenzung", () => {
  const p = planTubeCuts([{ ...defaultTubeCut(), d3: true, tiltL: "30", tiltQ: "40" }], { ...QR, swivel: 45 }, ev);
  const it = p.items[0];
  assert.ok(it.clampedFrom > 45 && Math.abs(it.tilt - 45) < 1e-9);
  assert.match(p.issues[0].message, /Winkelkorrektur auf ±45°/);
  assert.ok(Math.abs(it.tanL / it.tanQ - Math.tan(Math.PI / 6) / Math.tan((40 * Math.PI) / 180)) < 1e-9, "Richtung bleibt");
  const e = cutLength({ kind: "bohrung", d: 10, tilt: 0 });
  assert.equal(e, Math.PI * 10);
  assert.ok(cutLength({ kind: "bohrung", d: 10, tilt: 45 }) > e);
});

// ---------- Maßbild je Konturart, Prüfregeln Bohrung/Steg/Rand ----------
import { contourSketch, sketchLetters } from "../src/core/massbild.js";
import { checkContours, unrollFrame, polyDistance } from "../src/core/tubecuts.js";
import { TUBE_CUT_KINDS } from "../src/core/tubecuts.js";

test("Maßbild: je Konturart genau die Maßbuchstaben der Eingabefelder", () => {
  for (const [k, d] of Object.entries(TUBE_CUT_KINDS)) {
    const svg = contourSketch(k);
    assert.match(svg, /^<svg class="massbild"/);
    assert.deepEqual(sketchLetters(svg), d.fields.filter((f) => f.length === 1).sort(), k); // Polygon: nur Punktnummern
  }
  assert.equal(contourSketch("gibtsnicht"), "");
});

test("Prüfregeln: Abwicklung des Umfangs", () => {
  const r = unrollFrame({ kind: "rohr", W: 40 });
  assert.ok(Math.abs(r.P - 40 * Math.PI) < 1e-9 && Math.abs(r.s(90) - 10 * Math.PI) < 1e-9);
  const q = unrollFrame({ kind: "rechteck", W: 60, H: 40, r: 5 });
  assert.ok(Math.abs(q.P - (2 * 50 + 2 * 30 + 10 * Math.PI)) < 1e-9);
  assert.ok(Math.abs(q.s(180) - q.P / 2) < 1e-9, "unten gegenüber oben");
  assert.ok(Math.abs(q.s(90) + q.s(270) - q.P) < 1e-9, "vorne und hinten symmetrisch");
  const sq = (x, s, a) => [[x - a, s - a], [x + a, s - a], [x + a, s + a], [x - a, s + a]];
  assert.equal(polyDistance(sq(0, 0, 5), sq(13, 0, 5)), 3);
  assert.equal(polyDistance(sq(0, 0, 5), sq(1, 0, 1)), 0, "innen");
});

test("Prüfregeln: Bohrung zu klein, Steg zu schmal, Kontur zu nah am Ende (dfm.py)", () => {
  const prof = { kind: "vierkant", W: 40, H: 40, t: 3, r: 6, L: 500 };
  const plan = (cuts) => planTubeCuts(cuts, prof, ev).items;
  const rules = (cuts, lim = DFM_DEFAULTS) => checkContours(plan(cuts), prof, lim);
  const ok = { kind: "bohrung", side: "oben", x: "100", d: "10", q: "0", pattern: "3x20" };
  assert.deepEqual(rules([ok]), [], "Steg 10 mm über 4,5 mm");
  // Bohrung 2 mm bei Wand 3: zu klein
  const small = rules([{ ...ok, d: "2", pattern: "1" }]);
  assert.equal(small.length, 1); assert.equal(small[0].rule, "Bohrung zu klein"); assert.match(small[0].text, /1 Bohrung\(en\) ab Ø 2 mm unter 1 × Wand \(3 mm\)/);
  // Muster 3x14 bei Ø10: Steg 4 < 4,5
  const steg = rules([{ ...ok, pattern: "3x14" }]);
  assert.deepEqual(steg.map((x) => x.rule), ["Steg zu schmal"]);
  assert.match(steg[0].text, /2 Steg\(e\) unter 1,5 × Wand \(4,5 mm\), schmalster 4 mm im Muster von Kontur 1/);
  // zwei Konturen nebeneinander quer: Versatz ±7, b 10 → Steg 4
  const quer = rules([{ ...ok, pattern: "1", q: "7" }, { ...ok, pattern: "1", q: "-7" }]);
  assert.match(quer[0].text, /zwischen Kontur 1 und 2/);
  // Rand: Lage 7, Ø10 → 2 mm zum Ende A
  const rand = rules([{ ...ok, x: "7", pattern: "1" }]);
  assert.deepEqual(rand.map((x) => x.rule), ["Kontur zu nah am Ende"]);
  assert.match(rand[0].text, /kleinster Abstand 2 mm/);
  // Ausklinkung zählt nicht am Rand, aber beim Steg
  const ak = { kind: "ausklinkung", side: "oben", end: "A", l: "30", b: "20", r: "2", q: "0" };
  assert.deepEqual(rules([ak]), []);
  assert.deepEqual(rules([ak, { ...ok, x: "37", pattern: "1" }]).map((x) => x.rule), ["Steg zu schmal"]);
  // Rundrohr Ø40: Bohrungen bei 345° und 15° liegen über 0° hinweg 10,47 mm auseinander → Steg 2,47 mm
  const rr = { kind: "rohr", W: 40, H: 40, t: 3, L: 500 };
  const rund = (a1, a2) => checkContours(planTubeCuts([{ ...ok, pattern: "1", d: "8", angle: a1 }, { ...ok, pattern: "1", d: "8", angle: a2 }], rr, ev).items, rr, DFM_DEFAULTS);
  assert.match(rund("345", "15")[0].text, /schmalster 2,47 mm/, "am Umfang periodisch");
  assert.deepEqual(rund("0", "90"), []);
  // durchgehend: die Gegenseite zählt mit (unten durchgehend trifft die Bohrung oben)
  assert.deepEqual(rules([{ ...ok, pattern: "1", q: "0" }, { ...ok, side: "unten", pattern: "1", x: "112", through: true }]).map((x) => x.rule), ["Steg zu schmal"]);
  // durchgehend: auch die Gegenseite zählt; Regel aus mit 0
  assert.deepEqual(rules([{ ...ok, pattern: "3x14" }], { ...DFM_DEFAULTS, steg: 0 }), []);
});

test("Prüfregeln laufen über die Zuschnittliste mit", () => {
  const prof = { kind: "vierkant", W: 40, H: 40, t: 3, r: 6, L: 500 };
  const items = planTubeCuts([{ kind: "bohrung", side: "oben", x: "100", d: "2", q: "0", pattern: "1" }], prof, ev).items;
  const out = checkCutList([{ pos: 1, profileId: "vierkant 40x40x3", length: 500, kgm: 3.4, contours: { items, prof } }]);
  assert.deepEqual(out.map((x) => [x.level, x.rule]), [[WARNUNG, "Bohrung zu klein"]]);
});

// ---------- Schlitz und Polygon (schneidweg.py) ----------
import { parsePolygon, polygonPoints } from "../src/core/tubecuts.js";
const near = (a, b, tol, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b} (±${tol})`);

test("Polygon: Eckpunkte wie im Rohr-Editor, Bögen als Bulge, Schnittlänge = Umfang", () => {
  const p = parsePolygon("0,0; 30,0; 30,10; 15,20; 0,10");
  assert.equal(p.l, 30); assert.equal(p.b, 20);
  assert.deepEqual(p.pts[0], [-15, -10, 0], "um die Mitte des Hüllrechtecks");
  near(cutLength({ kind: "polygon", pts: p.pts }), 30 + 10 + 2 * Math.hypot(15, 10) + 10, 1e-9);
  // Halbkreis (Bulge 1) auf der rechten Seite: Hülle 30 × 20, Länge 3 Geraden + π·10
  const q = parsePolygon("0 0; 20 0 1; 20 20; 0 20");
  assert.equal(q.l, 30);
  near(cutLength({ kind: "polygon", pts: q.pts }), 20 + 20 + 20 + Math.PI * 10, 1e-9);
  const arc = polygonPoints(q.pts);
  assert.ok(Math.max(...arc.map((x) => x[0])) > 14.9, "Bogen wölbt nach +x");
  assert.throws(() => parsePolygon("0,0; 10,0"), /mindestens 3/);
  assert.throws(() => parsePolygon("0,0; 10,0; 20,0"), /keine Fläche/);
  assert.throws(() => parsePolygon("0,0; a,1; 2,2"), /keine Zahl/);
});

test("Schlitz und Polygon: Lage, Schneidweg, Prüfregeln", () => {
  const prof = { kind: "vierkant", W: 40, H: 40, t: 3, r: 6, L: 500 };
  const r = planTubeCuts([
    { kind: "schlitz", side: "oben", end: "B", l: "40", b: "6", q: "0" },
    { kind: "polygon", side: "vorne", x: "200", q: "0", pattern: "2x50", punkte: "0,0; 30,0; 30,10; 15,20; 0,10" },
  ], prof, ev);
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.items[0].xs, [500]);
  assert.equal(r.items[1].l, 30);
  near(r.cutLength, 2 * 40 + 6 + 2 * (50 + 2 * Math.hypot(15, 10)), 1e-9);
  assert.equal(r.pierces, 3);
  assert.match(tubeCutLabel(r.items[1]), /Polygon 5 Ecken vorne, 2× ab 200/);
  // Schlitz zählt nicht beim Rand, Polygon nah am Ende schon
  const rand = checkContours(planTubeCuts([{ kind: "polygon", side: "oben", x: "16", q: "0", pattern: "1", punkte: "0,0; 30,0; 15,10" }], prof, ev).items, prof, DFM_DEFAULTS);
  assert.match(rand[0].text, /kleinster Abstand 1 mm/);
  assert.deepEqual(checkContours(r.items.slice(0, 1), prof, DFM_DEFAULTS), []);
  // breiter als die ebene Fläche: über die Eckrundung; zu breit auch dafür
  const wide = planTubeCuts([{ kind: "polygon", side: "oben", x: "100", q: "0", pattern: "1", punkte: "0,0; 10,0; 10,30" }], prof, ev);
  assert.deepEqual(wide.issues, []);
  assert.equal(wide.items[0].wrap, undefined); // 3D: eben, 15 ≤ 16,9
  assert.equal(planTubeCuts([{ kind: "polygon", side: "oben", x: "100", q: "0", pattern: "1", punkte: "0,0; 10,0; 10,30" }], { ...prof, mode: "2D" }, ev).items[0].wrap, true);
  const bad = planTubeCuts([{ kind: "polygon", side: "oben", x: "100", q: "0", pattern: "1", punkte: "0,0; 10,0; 10,50" }], prof, ev);
  assert.match(bad.issues[0].message, /ragt zu weit über die Eckrundung/);
});

// ---------- 3D-Schnitt je Bauteil, Rundrohr 3D, Konturen über die Rundung (Patrick, 25.10.2026) ----------
import { featureCutSettings, roundTube3D } from "../src/core/endcut.js";
import { contourPolyline } from "../src/core/tubecuts.js";

test("Schnitt 2D/3D: Bauteil gibt allen Profilen Art und Winkelkorrektur vor", () => {
  const f = { type: "profile", section: "vierkant", cutMode: "2D", swivel: "30" };
  assert.deepEqual(featureCutSettings(f), { mode: "2D", swivel: "30", fromPart: false });
  assert.deepEqual(featureCutSettings(f, {}), { mode: "2D", swivel: "30", fromPart: false });
  assert.deepEqual(featureCutSettings(f, { cutMode: "3D" }), { mode: "3D", swivel: "45", fromPart: true });
  assert.deepEqual(featureCutSettings(f, { cutMode: "3D", swivel: "40" }), { mode: "3D", swivel: "40", fromPart: true });
  // Rundrohr beginnt in 3D, andere Profile bleiben
  assert.equal(roundTube3D({ type: "profile", section: "rohr", cutMode: "2D" }).cutMode, "3D");
  assert.equal(roundTube3D({ type: "frame", section: "rohr" }).cutMode, "3D");
  assert.equal(roundTube3D({ type: "profile", section: "vierkant", cutMode: "2D" }).cutMode, "2D");
  assert.equal(roundTube3D({ type: "biegerohr", section: "rohr" }).cutMode, undefined);
});

test("Langloch 30 breit an QR 40x40x3 (Patricks Test): über die Eckrundung statt übersprungen", () => {
  const ll = (b) => [{ kind: "langloch", x: "500", side: "oben", q: "0", pattern: "1", l: "60", b }];
  const p = planTubeCuts(ll("30"), { ...QR, mode: "2D" }, ev);
  assert.deepEqual(p.issues, []);
  assert.equal(p.items[0].wrap, true);
  assert.equal(p.items[0].faceHalf, 14);
  // 3D: eben bis 0,1 mm vor die Seitenwand (20 − 3 − 0,1 = 16,9), Kopfschwenk auf der Rundung asin(1/6)
  const p3 = planTubeCuts(ll("30"), QR, ev);
  assert.deepEqual(p3.issues, []);
  assert.equal(p3.items[0].wrap, undefined);
  near(p3.items[0].need, Math.asin(1 / 6) / (Math.PI / 180), 1e-9);
  const p4 = planTubeCuts(ll("34"), QR, ev);
  assert.equal(p4.items[0].wrap, true);
  assert.match(p4.issues[0].message, /in 3D eben nur bis 0,1 mm vor die Seitenwand \(\|Versatz\| \+ b\/2 höchstens 16,9 mm\)/);
  // auf der ebenen Fläche bleibt alles wie bisher
  const n = planTubeCuts([{ kind: "langloch", x: "500", side: "oben", q: "0", pattern: "1", l: "60", b: "28" }], QR, ev);
  assert.equal(n.items[0].wrap, undefined);
  // Umriss als Linienzug: geschlossen, quer höchstens b/2 + Versatz, dicht genug
  const pl = contourPolyline({ ...p.items[0], q: 2 }, 500);
  const ys = pl.map((q) => q[1]), xs = pl.map((q) => q[0]);
  near(Math.max(...ys), 17, 1e-9); near(Math.min(...ys), -13, 1e-9);
  near(Math.max(...xs), 530, 1e-9); near(Math.min(...xs), 470, 1e-9);
  assert.ok(pl.every((a, i) => Math.abs(pl[(i + 1) % pl.length][1] - a[1]) <= 0.5 + 1e-9));
});
