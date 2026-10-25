// Namensregeln für neue Dokumente: Prüfung der Vorlage, Platzhalter, freie Nummer
import test from "node:test";
import assert from "node:assert/strict";
import { validateNameTemplate, formatName, nextName } from "../src/core/naming.js";
import { settingDef, validateValue, CATEGORIES } from "../src/core/settings.js";

test("Vorlage prüfen", () => {
  assert.deepEqual(validateNameTemplate(" Bauteil {n} "), { ok: true, value: "Bauteil {n}" });
  assert.equal(validateNameTemplate("BT-{n:3}").ok, true);
  assert.equal(validateNameTemplate("").ok, false);
  assert.deepEqual(validateNameTemplate("", undefined, { allowEmpty: true }), { ok: true, value: "" });
  assert.match(validateNameTemplate("Teil {x}").error, /Unbekannter Platzhalter \{x\}/);
  assert.equal(validateNameTemplate("Zeichnung {quelle}").ok, false, "quelle nur bei Zeichnungen");
  assert.equal(validateNameTemplate("Zeichnung {quelle}", ["n", "quelle"]).ok, true);
  assert.equal(validateNameTemplate("{projekt:2}").ok, false);
  assert.equal(validateNameTemplate("Teil {n").ok, false);
  assert.equal(validateNameTemplate("Teil/1").ok, false);
  assert.equal(validateNameTemplate("x".repeat(61)).ok, false);
});

test("Platzhalter füllen", () => {
  const datum = new Date(2026, 9, 5);
  assert.equal(formatName("{projekt}-{n:2}", { n: 7, projekt: "Carport" }), "Carport-07");
  assert.equal(formatName("BT-{n:3} {datum}", { n: 12, datum }), "BT-012 2026-10-05");
  assert.equal(formatName("Zeichnung {quelle}", { quelle: "" }), "Zeichnung");
});

test("Nächster freier Name", () => {
  assert.equal(nextName("Bauteil {n}", ["Bauteil 1", "Bauteil 2"], {}, 2), "Bauteil 3");
  assert.equal(nextName("Bauteil {n}", ["Bauteil 1"], {}, 1), "Bauteil 2");
  assert.equal(nextName("Rahmen", ["Rahmen"], {}, 1), "Rahmen (2)");
  assert.equal(nextName("Rahmen", ["Rahmen", "Rahmen (2)"], {}, 1), "Rahmen (3)");
  assert.equal(nextName("Zeichnung {quelle}", [], { quelle: "Tor" }), "Zeichnung Tor");
});

test("Einstellungen Dokument und Modell", () => {
  assert.equal(CATEGORIES.find((c) => c.id === "dokument").status, "teilweise");
  assert.equal(validateValue(settingDef("dokument.name.bauteil"), "{projekt}-{n:2}").ok, true);
  assert.equal(validateValue(settingDef("dokument.name.bauteil"), "{quelle}").ok, false);
  assert.equal(validateValue(settingDef("dokument.name.zeichnung"), "Z-{quelle}").ok, true);
  assert.equal(validateValue(settingDef("dokument.nummer"), "").ok, true);
  assert.equal(validateValue(settingDef("dokument.name.baugruppe"), "").ok, false);
  assert.equal(validateValue(settingDef("dokument.werkstoff"), "1.4301").ok, true);
  assert.equal(validateValue(settingDef("dokument.werkstoff"), "a b").ok, false);
  assert.equal(validateValue(settingDef("dokument.neuesProjekt"), "baugruppe").ok, true);
});
