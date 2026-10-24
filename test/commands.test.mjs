// Befehlsliste und Tastaturkürzel: Normalisierung, Konflikte, Bereiche, Suche
import test from "node:test";
import assert from "node:assert/strict";
import { COMMANDS, comboFromEvent, parseCombo, effectiveKeymap, keymapConflicts, validateKeymap, commandForCombo, searchCommands } from "../src/core/commands.js";
import { loadSettings, serializeSettings, defaultSettings } from "../src/core/settings.js";

const ev = (key, o = {}) => ({ key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...o });

test("Standardbelegung hat keine Konflikte und gültige Kürzel", () => {
  assert.deepEqual(keymapConflicts(effectiveKeymap()), []);
  for (const c of COMMANDS) if (c.key) {
    const r = parseCombo(c.key);
    assert.ok(r.ok, c.id + ": " + r.error);
    assert.equal(r.combo, c.key, c.id);
  }
  assert.equal(new Set(COMMANDS.map((c) => c.id)).size, COMMANDS.length);
});

test("Tastendruck → Kürzeltext", () => {
  assert.equal(comboFromEvent(ev("s")), "S");
  assert.equal(comboFromEvent(ev("S", { shiftKey: true, ctrlKey: true })), "Strg+Umschalt+S");
  assert.equal(comboFromEvent(ev("F6", { shiftKey: true })), "Umschalt+F6");
  assert.equal(comboFromEvent(ev(",", { ctrlKey: true })), "Strg+,");
  assert.equal(comboFromEvent(ev(";", { shiftKey: true })), ";", "Umschalt bestimmt nur das Zeichen");
  assert.equal(comboFromEvent(ev("!", { shiftKey: true, ctrlKey: true, code: "Digit1" })), "Strg+Umschalt+1");
  assert.equal(comboFromEvent(ev("Shift", { shiftKey: true })), null);
  assert.equal(comboFromEvent(ev("Escape")), "Esc");
});

test("Kürzeltext prüfen: Reihenfolge, feste Tasten, Fehler", () => {
  assert.equal(parseCombo("umschalt+strg+g").combo, "Strg+Umschalt+G");
  assert.equal(parseCombo("Ctrl+Alt+F2").combo, "Strg+Alt+F2");
  assert.equal(parseCombo("Esc").ok, false);
  assert.equal(parseCombo("5").ok, false, "Ziffern gehören der Maßeingabe");
  assert.equal(parseCombo("Strg+5").ok, true);
  assert.equal(parseCombo("Umschalt+G").ok, false, "Großbuchstaben in Eingaben");
  assert.equal(parseCombo("Hyper+G").ok, false);
  assert.equal(parseCombo("").ok, false);
});

test("Konflikte nur in überlappenden Bereichen", () => {
  // S ist im Bauteil »Skizze erstellen« und in der Skizze »Auswählen« – kein Konflikt
  assert.equal(effectiveKeymap()["part.sketch"], "S");
  assert.equal(effectiveKeymap()["sketch.select"], "S");
  // E doppelt im Bauteil → Konflikt
  const r = validateKeymap({ "part.fillet": "E" });
  assert.equal(r.ok, false);
  assert.match(r.error, /»E« doppelt belegt: Extrusion und Rundung/);
  // globale Kürzel überlappen mit allen Bereichen
  assert.equal(validateKeymap({ "sketch.line": "Strg+S" }).ok, false);
  // Umbelegen mit Freigabe geht
  const ok = validateKeymap({ "part.extrude": "", "part.fillet": "E" });
  assert.ok(ok.ok, ok.error);
  assert.deepEqual(ok.value, { "part.extrude": "", "part.fillet": "E" });
  assert.deepEqual(validateKeymap({ "part.extrude": "E" }).value, {}, "Standardwert wird nicht gespeichert");
  assert.equal(validateKeymap({ "gibt.es.nicht": "G" }).ok, false);
});

test("Befehl je Modus finden", () => {
  const m = effectiveKeymap({ "part.fillet": "G" });
  assert.equal(commandForCombo(m, "S", "part").id, "part.sketch");
  assert.equal(commandForCombo(m, "S", "sketch").id, "sketch.select");
  assert.equal(commandForCombo(m, "G", "part").id, "part.fillet");
  assert.equal(commandForCombo(m, "G", "assembly"), null);
  assert.equal(commandForCombo(m, "F6", "assembly").id, "view.fit");
  assert.equal(commandForCombo(m, "Strg+S", "drawing").id, "file.save");
  assert.equal(commandForCombo(m, "F6", "drawing"), null);
});

test("Befehlssuche: Bereich, Schlüsselwörter, Umlaute, Reihenfolge", () => {
  assert.equal(searchCommands("extru", "part")[0].id, "part.extrude");
  assert.ok(searchCommands("tasche", "part").some((c) => c.id === "part.cutExtrude"), "Schlüsselwort");
  assert.ok(searchCommands("bundig", "assembly").some((c) => c.id === "asm.alignFlush"), "ohne Umlaut");
  assert.equal(searchCommands("extru", "assembly").length, 0, "nicht im Baugruppen-Bereich");
  assert.equal(searchCommands("linie", "sketch")[0].id, "sketch.line");
});

test("Kürzel als Einstellung: Rundreise und Ablehnung von Konflikten", () => {
  const v = { ...defaultSettings(), "werkzeuge.kuerzel": { "part.fillet": "G" } };
  const r = loadSettings(serializeSettings(v));
  assert.deepEqual(r.values["werkzeuge.kuerzel"], { "part.fillet": "G" });
  assert.deepEqual(r.warnings, []);
  const bad = loadSettings({ format: "werkcad-einstellungen", version: 1, values: { "werkzeuge.kuerzel": { "part.fillet": "E" } } });
  assert.deepEqual(bad.values["werkzeuge.kuerzel"], {});
  assert.equal(bad.warnings.length, 1);
  assert.equal(JSON.parse(serializeSettings(defaultSettings())).values["werkzeuge.kuerzel"], undefined, "leer wird nicht gespeichert");
});
