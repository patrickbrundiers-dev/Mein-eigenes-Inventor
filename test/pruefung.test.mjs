// Problemliste und Freigabe (FU13/FU15)
import { test } from "node:test";
import assert from "node:assert/strict";
import { projectProblems, featureProblems, releaseCheck, docSignature, releaseState, makeRelease, releaseText, countLevels, partsOf, FEHLER, WARNUNG, HINWEIS } from "../src/core/pruefung.js";
import { listPages } from "../src/core/mappe.js";

const part = (id, extra = {}) => ({ id, kind: "part", name: "Teil " + id, material: "S235", number: "T-" + id, features: [{ id: id + "f1", type: "extrude", name: "Platte" }], ...extra });
const okResult = () => ({ bodies: [{ kind: "solid" }], status: {} });
const docOf = (docs) => (id) => docs.find((d) => d.id === id);

test("Featurefehler und -warnungen mit Feature-Namen", () => {
  const p = part("a");
  const list = featureProblems(p, { bodies: [{}], status: { af1: { ok: false, error: "Radius zu groß" }, "param:L": { ok: false, error: "unbekannt" }, koerper: { ok: true, warning: "Körper ungültig" } } });
  assert.deepEqual(list.map((x) => [x.level, x.text, x.feature]), [
    [FEHLER, "Platte: Radius zu groß", "af1"],
    [FEHLER, "Parameter L: unbekannt", null],
    [WARNUNG, "Körper: Körper ungültig", null],
  ]);
  assert.equal(featureProblems(p, { bodies: [], status: {} })[0].text, "Bauteil hat keinen Körper");
  assert.deepEqual(featureProblems(p, undefined), []);
});

test("Problemliste des Projekts: fehlende Verweise, Features, Fertigungsprüfung; Fehler zuerst", () => {
  const a = part("a"), b = part("b");
  const asm = { id: "g", kind: "assembly", name: "Gruppe", components: [{ id: "c1", part: "a" }, { id: "c2", part: "weg", name: "Alt" }] };
  const dr = { id: "z", kind: "drawing", name: "Zeichnung", views: [], dims: [], source: { id: "fehlt" } };
  const results = new Map([["a", okResult()], ["b", { bodies: [{}], status: { bf1: { ok: false, error: "kaputt" } } }]]);
  const list = projectProblems({ docs: [a, b, asm, dr] }, results, { dfmFor: (p) => (p.id === "a" ? [{ level: WARNUNG, rule: "Steg zu schmal", text: "1 mm", pos: 1, profileId: "RR40x2" }] : []) });
  assert.equal(list[0].level, FEHLER);
  assert.ok(list.some((x) => x.doc === "b" && x.text === "Platte: kaputt" && x.feature === "bf1"));
  assert.ok(list.some((x) => x.doc === "g" && /fehlendes Bauteil/.test(x.text)));
  assert.ok(list.some((x) => x.doc === "z" && /fehlt/.test(x.text)));
  assert.ok(list.some((x) => x.doc === "a" && x.text === "Pos. 1 RR40x2: Steg zu schmal – 1 mm"));
  const c = countLevels(list);
  assert.equal(c[FEHLER], 1);
  assert.equal(c[WARNUNG], 3);
});

test("Freigabeprüfung: Werkstoff Pflicht, Teilenummer je Einstellung, Normteile ausgenommen", () => {
  const a = part("a", { material: "", number: "" });
  const n = part("n", { material: "", number: "" });
  const asm = { id: "g", kind: "assembly", name: "Gruppe", number: "BG-1", components: [{ id: "c1", part: "a" }, { id: "c2", part: "n" }] };
  const docs = [a, n, asm];
  const results = new Map([["a", okResult()], ["n", { bodies: [{ meta: { norm: true } }], status: {} }]]);
  const opts = { docOf: docOf(docs), results, drawingsOf: (id) => (id === "g" ? [{}] : []) };
  let r = releaseCheck(asm, opts);
  assert.equal(r.ok, false);
  assert.deepEqual(r.items.filter((x) => x.level !== HINWEIS).map((x) => [x.level, x.doc, x.text]), [
    [FEHLER, "a", "Werkstoff fehlt"],
    [WARNUNG, "a", "Teilenummer fehlt"],
  ]);
  assert.ok(r.items.some((x) => x.level === HINWEIS && x.doc === "a" && /Zeichnung/.test(x.text)));
  assert.ok(!r.items.some((x) => x.doc === "n"), "Normteil braucht nichts");
  a.material = "S235";
  r = releaseCheck(asm, { ...opts, numberRequired: true });
  assert.equal(r.ok, false);
  assert.equal(r.items[0].text, "Teilenummer fehlt");
  a.number = "T-1";
  r = releaseCheck(asm, { ...opts, numberRequired: true });
  assert.equal(r.ok, true);
});

test("Freigabeprüfung: ungültiger Körper und nicht berechnetes Bauteil sind Fehler, leere Baugruppe auch", () => {
  const a = part("a"), b = part("b");
  const asm = { id: "g", kind: "assembly", name: "G", number: "1", components: [{ id: "c1", part: "a" }, { id: "c2", part: "b" }] };
  const results = new Map([["a", { bodies: [{ invalid: true }], status: { af1: { ok: true, warning: "Körper ungültig (Geometrie-Prüfung)" } } }]]);
  const r = releaseCheck(asm, { docOf: docOf([a, b, asm]), results });
  assert.deepEqual(r.items.filter((x) => x.level === FEHLER).map((x) => [x.doc, x.text]), [
    ["a", "Platte: Körper ungültig (Geometrie-Prüfung)"],
    ["b", "Bauteil ist nicht berechnet"],
  ]);
  const leer = { id: "e", kind: "assembly", name: "E", number: "2", components: [] };
  assert.ok(releaseCheck(leer, { docOf: docOf([leer]), results }).items.some((x) => x.text === "Baugruppe ist leer"));
});

test("Fingerabdruck: Name/Beschreibung egal, Maße und Bauteile der Baugruppe zählen", () => {
  const a = part("a", { features: [{ id: "f", type: "extrude", depth: 10 }] });
  const asm = { id: "g", kind: "assembly", name: "G", components: [{ id: "c", part: "a", pos: [0, 0, 0] }] };
  const of = docOf([a, asm]);
  const s0 = docSignature(asm, of);
  a.name = "neu"; a.description = "x";
  assert.equal(docSignature(asm, of), s0);
  a.features[0].depth = 12;
  assert.notEqual(docSignature(asm, of), s0);
  // Schlüsselreihenfolge spielt keine Rolle
  assert.equal(docSignature({ id: "x", kind: "part", a: 1, b: 2 }, of), docSignature({ b: 2, kind: "part", id: "x", a: 1 }, of));
});

test("Freigabestatus: freigegeben, nach Änderung »geändert«, zurück auf In Arbeit", () => {
  const a = part("a", { features: [{ id: "f", type: "extrude", depth: 10 }] });
  const of = docOf([a]);
  assert.equal(releaseState(a, of), "entwurf");
  a.release = makeRelease(a, of, "freigegeben", { date: new Date(2026, 9, 25, 12) });
  assert.equal(releaseState(a, of), "freigegeben");
  assert.equal(releaseText(a, of), "Freigegeben 25.10.2026");
  a.features[0].depth = 11;
  assert.equal(releaseState(a, of), "geaendert");
  assert.equal(releaseText(a, of), "Nach Freigabe geändert 25.10.2026");
  assert.equal(makeRelease(a, of, "entwurf"), undefined);
  a.release = makeRelease(a, of, "geprueft");
  assert.equal(releaseState(a, of), "geprueft");
  a.release = { status: "quatsch" };
  assert.equal(releaseState(a, of), "entwurf");
});

test("partsOf: Bauteil selbst, Baugruppe mit ausgeblendeten Komponenten, jedes Bauteil einmal", () => {
  const a = part("a"), b = part("b");
  const asm = { id: "g", kind: "assembly", components: [{ id: "1", part: "a" }, { id: "2", part: "a" }, { id: "3", part: "b", hidden: true }] };
  assert.deepEqual(partsOf(a, docOf([a])).map((p) => p.id), ["a"]);
  assert.deepEqual(partsOf(asm, docOf([a, b, asm])).map((p) => p.id), ["a", "b"]);
  assert.deepEqual(partsOf({ kind: "drawing" }, docOf([])), []);
});

test("Fertigungsmappe: Stand in der Kopfzeile der Listen", () => {
  const pages = listPages({ title: "Tor", number: "T1", status: "nicht freigegeben", bom: [{ pos: 1, name: "Pfosten", qty: 2, mass: 3 }] });
  assert.match(pages[0].html, /Tor · T1 · Stand: nicht freigegeben/);
});
