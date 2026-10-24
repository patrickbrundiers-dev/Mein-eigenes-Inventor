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
  assert.match(msg({ q: "10", d: "10" }), /ragt über die ebene Fläche \(\|Versatz\| \+ b\/2 höchstens 14 mm\)/);
  assert.match(msg({ kind: "langloch", l: "10", b: "10" }), /Länge muss größer/);
  assert.match(msg({ kind: "rechteck", r: "15" }), /Eckradius 0 bis 10 mm/);
  assert.match(msg({ side: "links" }), /Seite oben, vorne, unten oder hinten/);
  assert.match(msg({ pattern: "3x5" }), /überlappen/);
  assert.match(msg({ kind: "ausklinkung", l: "1000" }), /länger als das Teil/);
  assert.equal(msg({ d: "40" }, { kind: "rohr", W: 42.4, H: 42.4, t: 2.6, L: 1000 }), "");
  assert.match(planTubeCuts([defaultTubeCut()], { ...QR, kind: "winkel" }, ev).issues[0].message, /nur für Rund-, Quadrat- und Rechteckrohr/);
  // Rechteckrohr vorne: Fläche über die Höhe H
  const re = { kind: "rechteck", W: 60, H: 40, t: 3, r: 6, L: 1000 };
  const it = planTubeCuts([{ ...defaultTubeCut(), side: "vorne" }], re, ev).items[0];
  assert.deepEqual([it.halfN, it.faceHalf, it.angle], [30, 14, 90]);
});
