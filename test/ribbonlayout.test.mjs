// Menüband anordnen: Prüfung, Reihenfolge, Ausblenden mit Schutz, Zurücksetzen
import test from "node:test";
import assert from "node:assert/strict";
import { validateRibbonLayout, orderedLabels, applyRibbonLayout, setGroupHidden, moveGroup, resetRibbonLayout } from "../src/core/ribbonlayout.js";
import { settingDef, validateValue } from "../src/core/settings.js";

const G = ["Skizze", "Erstellen", "Profile", "Ändern"];
const groups = G.map((label) => ({ label, buttons: [] }));

test("Anordnung prüfen: Form, Namen, geschützte Gruppen fallen aus hide", () => {
  assert.deepEqual(validateRibbonLayout({}), { ok: true, value: {} });
  assert.deepEqual(validateRibbonLayout({ modell: { hide: ["Profile", "Profile"] } }), { ok: true, value: { modell: { order: [], hide: ["Profile"] } } });
  assert.deepEqual(validateRibbonLayout({ skizze: { hide: ["Beenden"] } }).value, {});
  assert.equal(validateRibbonLayout([]).ok, false);
  assert.equal(validateRibbonLayout({ "Böse Karte": {} }).ok, false);
  assert.equal(validateRibbonLayout({ modell: { hide: [""] } }).ok, false);
  assert.equal(validateRibbonLayout({ modell: { order: "Profile" } }).ok, false);
  assert.equal(settingDef("werkzeuge.menueband").type, "ribbon");
  assert.equal(validateValue(settingDef("werkzeuge.menueband"), { modell: { hide: ["Profile"] } }).ok, true);
});

test("Reihenfolge: gespeicherte zuerst, neue Gruppen hinter ihrem Vorgänger, Unbekanntes ignoriert", () => {
  assert.deepEqual(orderedLabels("modell", G, {}), G);
  const cfg = { modell: { order: ["Profile", "Skizze", "Weg"], hide: [] } };
  // "Erstellen" stand hinter "Skizze", "Ändern" hinter "Profile"
  assert.deepEqual(orderedLabels("modell", G, cfg), ["Profile", "Ändern", "Skizze", "Erstellen"]);
});

test("Ausblenden und Verschieben", () => {
  let c = {};
  c = setGroupHidden(c, "modell", "Profile", true, G).value;
  const L = applyRibbonLayout("modell", groups, c);
  assert.deepEqual(L.groups.map((g) => g.label), ["Skizze", "Erstellen", "Ändern"]);
  assert.deepEqual(L.hidden, ["Profile"]);
  c = moveGroup(c, "modell", "Ändern", -1, G).value;
  assert.deepEqual(applyRibbonLayout("modell", groups, c).groups.map((g) => g.label), ["Skizze", "Erstellen", "Ändern"], "über eine ausgeblendete Gruppe hinweg");
  c = moveGroup(c, "modell", "Ändern", -1, G).value;
  assert.deepEqual(applyRibbonLayout("modell", groups, c).groups.map((g) => g.label), ["Skizze", "Ändern", "Erstellen"]);
  assert.equal(moveGroup(c, "modell", "Skizze", -1, G).ok, false);
  // im Menüband: über Ausgeblendetes hinweg, damit sich sichtbar etwas tut
  const h1 = setGroupHidden({}, "modell", "Profile", true, G).value;
  assert.deepEqual(orderedLabels("modell", G, moveGroup(h1, "modell", "Ändern", -1, G, { overHidden: true }).value), ["Skizze", "Ändern", "Erstellen", "Profile"]);
  assert.equal(moveGroup(h1, "modell", "Erstellen", +1, G, { overHidden: true }).value.modell.order.join(), "Skizze,Profile,Ändern,Erstellen");
  assert.equal(moveGroup(setGroupHidden({}, "modell", "Ändern", true, G).value, "modell", "Profile", +1, G, { overHidden: true }).ok, false, "nur Ausgeblendetes rechts");
  c = setGroupHidden(c, "modell", "Profile", false, G).value;
  assert.deepEqual(c.modell.hide, []);
  c = moveGroup(c, "modell", "Profile", -1, G).value;
  assert.equal(orderedLabels("modell", G, c).join(), "Skizze,Ändern,Profile,Erstellen");
  // zurück auf die Standardreihenfolge → Eintrag verschwindet
  const back = moveGroup(moveGroup({}, "modell", "Profile", -1, G).value, "modell", "Profile", +1, G).value;
  assert.deepEqual(back, {});
  assert.deepEqual(resetRibbonLayout(c, "modell"), {});
  assert.deepEqual(resetRibbonLayout({ modell: c.modell, skizze: { order: [], hide: ["Muster"] } }), {});
});

test("Schutz: letzte sichtbare Gruppe und »Beenden« in der Skizze bleiben", () => {
  let c = {};
  for (const l of ["Skizze", "Erstellen", "Profile"]) c = setGroupHidden(c, "modell", l, true, G).value;
  const r = setGroupHidden(c, "modell", "Ändern", true, G);
  assert.equal(r.ok, false);
  assert.match(r.error, /Mindestens eine Gruppe/);
  assert.equal(setGroupHidden({}, "skizze", "Beenden", true, ["Erstellen", "Beenden"]).ok, false);
  assert.deepEqual(applyRibbonLayout("skizze", [{ label: "Erstellen" }, { label: "Beenden" }], { skizze: { hide: ["Beenden"] } }).groups.map((g) => g.label), ["Erstellen", "Beenden"]);
});
