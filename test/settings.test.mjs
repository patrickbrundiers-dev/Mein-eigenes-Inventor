// Einstellungen: Standardwerte, Prüfung, Migration, beschädigte Dateien, Suche, Ebenen
import test from "node:test";
import assert from "node:assert/strict";
import { SETTINGS, CATEGORIES, SETTINGS_VERSION, SETTINGS_FORMAT, defaultSettings, validateValue, loadSettings, serializeSettings, effectiveValue, searchSettings, settingDef } from "../src/core/settings.js";

test("Standardwerte sind gültig und jede Option hat eine Kategorie", () => {
  const cats = new Set(CATEGORIES.map((c) => c.id));
  for (const s of SETTINGS) {
    assert.ok(cats.has(s.cat), s.key);
    assert.ok(s.label, s.key);
    assert.deepEqual(validateValue(s, s.default), { ok: true, value: s.default }, s.key);
  }
  assert.equal(new Set(SETTINGS.map((s) => s.key)).size, SETTINGS.length, "Schlüssel eindeutig");
});

test("Geplante Kategorien haben keine Optionen", () => {
  for (const c of CATEGORIES.filter((x) => x.status === "geplant")) assert.equal(SETTINGS.filter((s) => s.cat === c.id).length, 0, c.id);
});

test("Prüfung: Grenzen, Typen, keine stille Ersetzung", () => {
  const d = settingDef("skizze.fangradius");
  assert.equal(validateValue(d, 10).value, 10);
  assert.equal(validateValue(d, "12").value, 12);
  assert.equal(validateValue(d, 2).ok, false);
  assert.match(validateValue(d, 2).error, /Mindestens 3 px/);
  assert.equal(validateValue(d, 7.5).ok, false);
  assert.equal(validateValue(d, "").ok, false);
  assert.equal(validateValue(d, "abc").ok, false);
  assert.equal(validateValue(settingDef("allgemein.autosaveSekunden"), "2,5").value, 2.5);
  assert.equal(validateValue(settingDef("ansicht.kantenfarbe"), "#ABCDEF").value, "#abcdef");
  assert.equal(validateValue(settingDef("ansicht.kantenfarbe"), "rot").ok, false);
  assert.equal(validateValue(settingDef("ansicht.qualitaet"), "ultra").ok, false);
  assert.equal(validateValue(settingDef("darstellung.skalierung"), "125").value, 125);
  assert.equal(validateValue(settingDef("ansicht.raster"), "ja").ok, false);
});

test("Laden: leer → Standard, Rundreise erhält Werte", () => {
  assert.deepEqual(loadSettings(null).values, defaultSettings());
  const v = { ...defaultSettings(), "ansicht.qualitaet": "fein", "skizze.rasterfang": true, "ansicht.kantenfarbe": "#000000" };
  const text = serializeSettings(v);
  const raw = JSON.parse(text);
  assert.equal(raw.format, SETTINGS_FORMAT);
  assert.equal(raw.version, SETTINGS_VERSION);
  assert.deepEqual(Object.keys(raw.values).sort(), ["ansicht.kantenfarbe", "ansicht.qualitaet", "skizze.rasterfang"], "nur Abweichungen");
  const r = loadSettings(text);
  assert.deepEqual(r.values, v);
  assert.deepEqual(r.warnings, []);
});

test("Beschädigte oder fremde Datei → Standardwerte mit Warnung", () => {
  for (const bad of ["{kaputt", "[1,2]", JSON.stringify({ format: "anderes" }), JSON.stringify({ format: SETTINGS_FORMAT, version: -1 })]) {
    const r = loadSettings(bad);
    assert.equal(r.corrupt, true, bad);
    assert.deepEqual(r.values, defaultSettings());
    assert.equal(r.warnings.length, 1);
  }
});

test("Ungültige und unbekannte Werte werden gemeldet, Rest übernommen", () => {
  const r = loadSettings({ format: SETTINGS_FORMAT, version: 1, values: { "skizze.fangradius": 99, "ansicht.raster": false, "gibt.esnicht": 1 } });
  assert.equal(r.values["ansicht.raster"], false);
  assert.equal(r.values["skizze.fangradius"], 7);
  assert.equal(r.warnings.length, 2);
  assert.match(r.warnings.join("\n"), /Fangradius.*Höchstens 30.*Standardwert 7 px/);
  assert.match(r.warnings.join("\n"), /gibt\.esnicht/);
});

test("Migration: Werte ohne Hülle (Version 0) werden übernommen", () => {
  const r = loadSettings(JSON.stringify({ "ansicht.qualitaet": "grob" }));
  assert.equal(r.migratedFrom, 0);
  assert.equal(r.values["ansicht.qualitaet"], "grob");
  assert.equal(r.corrupt, false);
});

test("Neuere Version: bekannte Werte übernehmen, unbekannte still lassen", () => {
  const r = loadSettings({ format: SETTINGS_FORMAT, version: SETTINGS_VERSION + 1, values: { "ansicht.raster": false, "zukunft.option": 3 } });
  assert.equal(r.values["ansicht.raster"], false);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /neueren/);
});

test("Effektiver Wert: explizit > Dokument > Benutzer > Standard", () => {
  const k = "skizze.fangradius";
  assert.equal(effectiveValue(k), 7);
  assert.equal(effectiveValue(k, { user: { [k]: 9 } }), 9);
  assert.equal(effectiveValue(k, { user: { [k]: 9 }, doc: { [k]: 11 } }), 11);
  assert.equal(effectiveValue(k, { user: { [k]: 9 }, doc: { [k]: 11 }, explicit: { [k]: 13 } }), 13);
  assert.equal(effectiveValue(k, { user: { [k]: 9 }, doc: { [k]: 500 } }), 9, "ungültige Ebene wird übersprungen");
});

test("Suche findet Optionen und Kategorien, auch ohne Umlaute", () => {
  assert.ok(searchSettings("fang").settings.some((s) => s.key === "skizze.fangradius"));
  assert.ok(searchSettings("zoom").settings.length >= 2);
  assert.ok(searchSettings("grosse").settings.some((s) => s.key === "darstellung.skalierung"), "ß/ö-unabhängig");
  assert.ok(searchSettings("maschinenprofil").categories.some((c) => c.id === "fertigung"), "geplante Punkte durchsuchbar");
  assert.equal(searchSettings("xyzxyz").settings.length, 0);
  assert.equal(searchSettings("").settings.length, SETTINGS.length);
});

test("Schnellzugriff und Werkzeug-Standardwerte", () => {
  const def = SETTINGS.find((s) => s.key === "werkzeuge.schnellzugriff");
  assert.deepEqual(validateValue(def, ["view.fit", "sketch.trim"]), { ok: true, value: ["view.fit", "sketch.trim"] });
  assert.equal(validateValue(def, ["gibtsnicht"]).ok, false);
  assert.equal(validateValue(def, ["view.fit", "view.fit"]).ok, false);
  assert.equal(validateValue(def, "view.fit").ok, false);
  const d = defaultSettings();
  assert.deepEqual(d["werkzeuge.schnellzugriff"], []);
  assert.equal(d["werkzeuge.std.rundung"], 5);
  assert.equal(d["werkzeuge.std.polygon"], 6);
  assert.equal(validateValue(SETTINGS.find((s) => s.key === "werkzeuge.std.polygon"), 2).ok, false);
  // gespeichert und wieder geladen; unbekannter Befehl wird mit Warnung verworfen
  const ok = loadSettings(JSON.stringify({ format: "werkcad-einstellungen", version: 1, values: { "werkzeuge.schnellzugriff": ["file.save"], "werkzeuge.std.extrusion": 25 } }));
  assert.deepEqual(ok.values["werkzeuge.schnellzugriff"], ["file.save"]);
  assert.equal(ok.values["werkzeuge.std.extrusion"], 25);
  const bad = loadSettings(JSON.stringify({ format: "werkcad-einstellungen", version: 1, values: { "werkzeuge.schnellzugriff": ["weg.damit"] } }));
  assert.deepEqual(bad.values["werkzeuge.schnellzugriff"], []);
  assert.ok(bad.warnings.length > 0);
});
