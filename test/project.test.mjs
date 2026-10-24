// Projektdatei (.wcad): Lesen, Schreiben, Roundtrip – ohne Geometrie
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseProject, serializeProject } from "../src/core/project.js";
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
  assert.throws(() => parseProject("null"), /Keine WerkCAD-Projektdatei/);
  assert.throws(() => parseProject("[]"), /Keine WerkCAD-Projektdatei/);
  assert.throws(() => parseProject(JSON.stringify({ format: "anders", docs: [] })), /Keine WerkCAD-Projektdatei/);
  assert.throws(() => parseProject(JSON.stringify({ format: "werkcad" })), /Keine WerkCAD-Projektdatei/);
  assert.throws(() => parseProject(JSON.stringify({ format: "werkcad", docs: {} })), /Keine WerkCAD-Projektdatei/);
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
