// Eigene Zeichnungsvorlage (FU12)
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTemplate, templateOf, isCustomTemplate, extraFields, LINE_GROUPS, DEFAULT_TEMPLATE } from "../src/core/zeichnungsvorlage.js";
import { SETTINGS, validateValue } from "../src/core/settings.js";
const validate = (k, v) => validateValue(SETTINGS.find((s) => s.key === k), v);

test("Vorlage prüfen: Felder, Logo, Zusatzfelder, Liniengruppe, Maßzahl", () => {
  const ok = validateTemplate({ firma: "PB Metallbau\nMusterstr. 1", ersteller: "PB", logo: "data:image/png;base64,AAAA", extra: [{ label: "Auftrag", value: "" }, { label: "Oberfläche", value: "verzinkt" }], lineGroup: "0.35", dimText: 2.5 });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value.extra[1], { label: "Oberfläche", value: "verzinkt" });
  assert.match(validateTemplate({ logo: "data:image/gif;base64,AA" }).error, /PNG oder JPG/);
  assert.match(validateTemplate({ logo: "data:image/png;base64," + "A".repeat(500000) }).error, /zu groß/);
  assert.match(validateTemplate({ extra: [{ label: "a" }, { label: "b" }, { label: "c" }, { label: "d" }] }).error, /Höchstens 3/);
  assert.match(validateTemplate({ extra: [{ label: "a" }, { label: "a" }] }).error, /verschieden/);
  assert.match(validateTemplate({ lineGroup: "1" }).error, /Liniengruppe/);
  assert.match(validateTemplate({ dimText: 4 }).error, /Maßzahlhöhe/);
  assert.deepEqual(templateOf({ dimText: 99 }), { ...DEFAULT_TEMPLATE, extra: [] });
  assert.equal(LINE_GROUPS["0.5"].vis, 0.5);
});

test("Standard oder eigen; Zusatzfelder mit Werten der Zeichnung", () => {
  assert.equal(isCustomTemplate(templateOf(null)), false);
  assert.equal(isCustomTemplate(templateOf({ firma: "X" })), false, "Firma allein steht ohnehin im Schriftfeld");
  assert.equal(isCustomTemplate(templateOf({ dimText: 5 })), true);
  const t = templateOf({ extra: [{ label: "Auftrag", value: "" }, { label: "Oberfläche", value: "verzinkt" }] });
  assert.deepEqual(extraFields(t, { extra: { Auftrag: "A-17" } }), [{ label: "Auftrag", value: "A-17" }, { label: "Oberfläche", value: "verzinkt" }]);
});

test("Einstellung zeichnung.vorlage nimmt nur gültige Vorlagen", () => {
  assert.equal(validate("zeichnung.vorlage", { dimText: 5 }).ok, true);
  assert.equal(validate("zeichnung.vorlage", { dimText: 7 }).ok, false);
});
