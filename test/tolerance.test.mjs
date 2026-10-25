// Maßtoleranzen: Allgemeintoleranzen ISO 2768-1, Toleranz am Maß, Einstellungen
import test from "node:test";
import assert from "node:assert/strict";
import { generalTolerance, classOf, classText, validateTolerance, toleranceText, CLASSES } from "../src/core/tolerance.js";
import { settingDef, validateValue, CATEGORIES } from "../src/core/settings.js";

test("ISO 2768-1: Längenmaße je Klasse und Bereichsgrenzen", () => {
  assert.equal(generalTolerance("m", 50), 0.3);
  assert.equal(generalTolerance("m", 30), 0.2, "30 gehört noch zu 6–30");
  assert.equal(generalTolerance("m", 30.01), 0.3);
  assert.equal(generalTolerance("f", 5), 0.05);
  assert.equal(generalTolerance("c", 1500), 3);
  assert.equal(generalTolerance("v", 250), 2.5);
  assert.equal(generalTolerance("m", 3500), 2);
  assert.equal(generalTolerance("f", 3500), null, "fein über 2000 nicht festgelegt");
  assert.equal(generalTolerance("v", 2), null, "sehr grob unter 3 nicht festgelegt");
  assert.equal(generalTolerance("m", 0.3), null, "unter 0,5 mm am Maß angeben");
  assert.equal(generalTolerance("m", 5000), null);
  assert.equal(generalTolerance("x", 50), null);
  assert.equal(generalTolerance("m", -50), 0.3);
});

test("ISO 2768-1: Radien und Fasen", () => {
  assert.equal(generalTolerance("m", 2, "rad"), 0.2);
  assert.equal(generalTolerance("m", 5, "rad"), 0.5);
  assert.equal(generalTolerance("m", 80, "rad"), 1);
  assert.equal(generalTolerance("c", 80, "rad"), 2);
});

test("Klasse aus dem Schriftfeld", () => {
  assert.equal(classOf("ISO 2768-m"), "m");
  assert.equal(classOf("ISO 2768-cK"), "c");
  assert.equal(classOf("DIN ISO 2768 f"), "f");
  assert.equal(classOf("nach Absprache"), null);
  assert.equal(classOf(undefined), null);
  assert.equal(classText("f"), "ISO 2768-f");
});

test("Toleranz am Maß: prüfen und Text", () => {
  assert.deepEqual(validateTolerance(null), { ok: true, value: null });
  assert.deepEqual(validateTolerance({ art: "" }), { ok: true, value: null });
  assert.deepEqual(validateTolerance({ art: "sym", v: "0,1" }), { ok: true, value: { art: "sym", v: 0.1 } });
  assert.equal(validateTolerance({ art: "sym", v: "0" }).ok, false);
  assert.deepEqual(validateTolerance({ art: "abm", o: "0,2", u: "−0,1" }).value, { art: "abm", o: 0.2, u: -0.1 });
  assert.equal(validateTolerance({ art: "abm", o: "-0,1", u: "0,2" }).ok, false);
  assert.equal(validateTolerance({ art: "abm", o: "x", u: "0" }).ok, false);
  assert.deepEqual(validateTolerance({ art: "pass", pass: " H7 " }).value, { art: "pass", pass: "H7" });
  assert.equal(validateTolerance({ art: "pass", pass: "7H" }).ok, false);
  assert.equal(validateTolerance({ art: "quatsch" }).ok, false);

  assert.equal(toleranceText({ art: "allg" }, 50, "m"), "±0,3");
  assert.equal(toleranceText({ art: "allg" }, 5, "m", "rad"), "±0,5");
  assert.equal(toleranceText({ art: "allg" }, 50, null), "", "ohne Klasse nichts");
  assert.equal(toleranceText({ art: "sym", v: 0.05 }, 50, "m"), "±0,05");
  assert.equal(toleranceText({ art: "abm", o: 0.2, u: -0.1 }, 50, "m"), " +0,2/−0,1");
  assert.equal(toleranceText({ art: "abm", o: 0.1, u: 0 }, 50, "m"), " +0,1/0");
  assert.equal(toleranceText({ art: "abm", o: 0.1, u: -0.1 }, 50, "m"), "±0,1");
  assert.equal(toleranceText({ art: "pass", pass: "H7" }, 20, "m"), " H7");
  assert.equal(toleranceText(undefined, 20, "m"), "");
});

test("Einstellungen: Klasse und Nachkommastellen, Dokument und Kernel ohne geplante Punkte", () => {
  const k = settingDef("dokument.toleranzklasse");
  assert.equal(k.default, "m");
  assert.deepEqual(k.options.map((o) => o.value), CLASSES.map((c) => c.value));
  assert.equal(validateValue(k, "c").ok, true);
  assert.equal(validateValue(k, "z").ok, false);
  const n = settingDef("dokument.nachkomma");
  assert.equal(n.default, 1);
  assert.equal(validateValue(n, 4).ok, false);
  for (const id of ["dokument", "kernel"]) {
    const c = CATEGORIES.find((x) => x.id === id);
    assert.equal(c.status, "aktiv", id);
    assert.ok(!c.planned?.length, id);
  }
});
