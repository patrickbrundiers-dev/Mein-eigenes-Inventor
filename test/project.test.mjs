// Projektdatei (.wcad): Lesen, Schreiben, Roundtrip – ohne Geometrie
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseProject, serializeProject, migrateProject, validateProject, loadProject, FORMAT_VERSION } from "../src/core/project.js";
import { exampleProject, newProject } from "../src/core/examples.js";

const fixture = (name) => fs.readFileSync(new URL("./fixtures/" + name, import.meta.url), "utf8");

test("Projektdatei: gültige Datei wird gelesen", () => {
  const prj = parseProject(fixture("beispiel-v1.wcad"));
  assert.equal(prj.format, "werkcad");
  assert.equal(prj.version, 1);
  assert.deepEqual(prj.docs.map((d) => d.kind), ["part", "part", "part", "assembly", "drawing"]);
});

test("Projektdatei: unlesbare Inhalte werden abgelehnt", () => {
  assert.throws(() => parseProject(""), SyntaxError);
  assert.throws(() => parseProject("{ kaputt"), SyntaxError);
  assert.throws(() => parseProject("null"), /Keine PBCAD-Projektdatei/);
  assert.throws(() => parseProject("[]"), /Keine PBCAD-Projektdatei/);
  assert.throws(() => parseProject(JSON.stringify({ format: "anders", docs: [] })), /Keine PBCAD-Projektdatei/);
  assert.throws(() => parseProject(JSON.stringify({ format: "werkcad" })), /Keine PBCAD-Projektdatei/);
  assert.throws(() => parseProject(JSON.stringify({ format: "werkcad", docs: {} })), /Keine PBCAD-Projektdatei/);
});

test("Projektdatei: Speichern setzt den Zeitpunkt und behält alles andere", () => {
  const prj = newProject("Test");
  const text = serializeProject(prj, new Date("2026-01-02T03:04:05.000Z"));
  assert.equal(prj.saved, "2026-01-02T03:04:05.000Z");
  assert.deepEqual(parseProject(text), prj);
});

test("Projektdatei: Roundtrip der eingefrorenen v1-Datei ist byte-gleich", () => {
  // beispiel-v1.wcad wurde einmalig mit serializeProject geschrieben und bleibt unverändert:
  // gelesen und mit demselben Zeitpunkt wieder geschrieben muss exakt derselbe Text entstehen.
  const text = fixture("beispiel-v1.wcad");
  const prj = parseProject(text);
  assert.equal(serializeProject(prj, new Date(prj.saved)), text);
});

test("Projektdatei: Roundtrip des aktuellen Beispielprojekts", () => {
  const prj = exampleProject();
  const back = parseProject(serializeProject(prj));
  assert.deepEqual(back, prj);
  // unbekannte Felder (z. B. aus einer neueren Version) gehen nicht verloren
  back.zukunft = { a: 1 };
  back.docs[0].neuesFeld = "x";
  assert.deepEqual(parseProject(serializeProject(back)), back);
});

// ---------- Formatversion und Migration (B-3) ----------

const minimal = (extra = {}) => ({ format: "werkcad", version: 1, name: "T", docs: [], ...extra });

test("Version: aktuelle Datei bleibt unverändert", () => {
  const prj = parseProject(fixture("beispiel-v1.wcad"));
  const { project, issues } = migrateProject(prj);
  assert.equal(project, prj);
  assert.deepEqual(issues, []);
  assert.equal(FORMAT_VERSION, 1);
});

test("Version: fehlende Version wird als 1 gelesen", () => {
  const prj = minimal(); delete prj.version;
  const { project, issues } = migrateProject(prj);
  assert.equal(project.version, 1);
  assert.equal(prj.version, undefined, "Original unverändert");
  assert.deepEqual(issues.map((i) => i.code), ["version-fehlt"]);
});

test("Version: neuere Datei öffnet mit Warnung, Inhalt bleibt erhalten", () => {
  const prj = minimal({ version: 7, zukunft: [1, 2] });
  const { project, issues } = migrateProject(prj);
  assert.equal(project.version, 7);
  assert.deepEqual(project.zukunft, [1, 2]);
  assert.deepEqual(issues.map((i) => [i.code, i.severity]), [["version-neuer", "warning"]]);
  assert.match(issues[0].message, /neueren PBCAD-Version \(Format 7/);
});

test("Version: ungültige Angaben werden abgelehnt", () => {
  for (const v of [0, -1, 1.5, "1", null]) assert.throws(() => migrateProject(minimal({ version: v })), /Ungültige Formatversion/, String(v));
});

test("Migration: Kette läuft schrittweise und verändert das Original nicht", () => {
  const migrations = {
    1: (p) => { p.docs.forEach((d) => { d.umbenannt = d.alt; delete d.alt; }); },
    2: (p) => ({ ...p, extra: true }),
  };
  const prj = minimal({ docs: [{ id: "a", kind: "part", alt: 5, features: [] }] });
  const { project, issues } = migrateProject(prj, { migrations, current: 3 });
  assert.equal(project.version, 3);
  assert.equal(project.extra, true);
  assert.deepEqual(project.docs[0], { id: "a", kind: "part", umbenannt: 5, features: [] });
  assert.equal(prj.docs[0].alt, 5, "Original unverändert");
  assert.deepEqual(issues.map((i) => i.code), ["migriert", "migriert"]);
});

test("Migration: fehlender Schritt bricht mit klarer Meldung ab", () => {
  assert.throws(() => migrateProject(minimal(), { migrations: {}, current: 2 }), /Keine Migration von Format 1 auf 2/);
});

// ---------- Strukturprüfung (B-4) ----------

const part = (id, extra = {}) => ({ id, kind: "part", name: id, params: [], features: [], ...extra });
const codes = (prj) => validateProject(prj).map((i) => `${i.severity}:${i.code}`);

test("Prüfung: Beispielprojekt und Referenzdatei sind fehlerfrei", () => {
  assert.deepEqual(validateProject(exampleProject()), []);
  assert.deepEqual(validateProject(parseProject(fixture("beispiel-v1.wcad"))), []);
});

test("Prüfung: Fehler, die das Öffnen verhindern", () => {
  assert.deepEqual(codes(minimal({ docs: [null] })), ["error:doc-ungueltig"]);
  assert.deepEqual(codes(minimal({ docs: [{ kind: "part", features: [] }] })), ["error:doc-id-fehlt"]);
  assert.deepEqual(codes(minimal({ docs: [part("a"), part("a")] })), ["error:doc-id-doppelt"]);
  assert.deepEqual(codes(minimal({ docs: [part("a", { features: undefined })] })), ["error:features-fehlen"]);
  assert.deepEqual(codes(minimal({ docs: [part("a", { params: {} })] })), ["error:params-ungueltig"]);
  assert.deepEqual(codes(minimal({ docs: [part("a", { features: [{ id: "f" }] })] })), ["error:feature-ungueltig"]);
  assert.deepEqual(codes(minimal({ docs: [{ id: "b", kind: "assembly" }] })), ["error:komponenten-fehlen"]);
  assert.deepEqual(codes(minimal({ docs: [{ id: "z", kind: "drawing", views: [] }] })), ["error:zeichnung-ungueltig"]);
});

test("Prüfung: Hinweise, mit denen sich das Projekt öffnen lässt", () => {
  const f = { id: "f1", type: "extrude" };
  assert.deepEqual(codes(minimal({ docs: [part("a", { features: [f, f] })] })), ["warning:feature-id-doppelt"]);
  assert.deepEqual(codes(minimal({ docs: [{ id: "x", kind: "blech" }] })), ["warning:doc-art-unbekannt"]);
  assert.deepEqual(codes(minimal({ docs: [{ id: "b", kind: "assembly", components: [{ id: "c", part: "weg" }] }] })), ["warning:komponente-verweis"]);
  assert.deepEqual(codes(minimal({ docs: [{ id: "z", kind: "drawing", views: [], dims: [], source: { kind: "part", id: "weg" } }] })), ["warning:zeichnung-quelle"]);
  // Verweis auf etwas, das kein Bauteil ist, zählt auch als fehlend
  assert.deepEqual(codes(minimal({ docs: [{ id: "b", kind: "assembly", components: [{ id: "c", part: "b" }] }] })), ["warning:komponente-verweis"]);
  // Unterbaugruppe (M19): Verweis auf eine andere Baugruppe ist gültig
  assert.deepEqual(codes(minimal({ docs: [{ id: "b", kind: "assembly", components: [{ id: "c", part: "u" }] }, { id: "u", kind: "assembly", components: [] }] })), []);
});

test("Öffnen: Strukturfehler → verständliche Meldung, Warnungen → öffnen", () => {
  const broken = JSON.stringify(minimal({ docs: [part("a"), part("a"), { id: "b", kind: "assembly" }] }));
  assert.throws(() => loadProject(broken), (e) => {
    assert.match(e.message, /^Projektdatei beschädigt: ID »a« kommt mehrfach vor\. \(und 1 weitere Fehler\)$/);
    assert.equal(e.issues.length, 2);
    return true;
  });
  const warn = JSON.stringify(minimal({ version: 2, docs: [part("a")] }));
  const { project, issues } = loadProject(warn);
  assert.equal(project.docs.length, 1);
  assert.deepEqual(issues.map((i) => i.code), ["version-neuer"]);
});

test("Öffnen: Prüfung verändert die Datei nicht", () => {
  const text = fixture("beispiel-v1.wcad");
  const { project } = loadProject(text);
  assert.equal(serializeProject(project, new Date(project.saved)), text);
});
