// Restpunkte Einstellungscenter: Beleuchtung, Standardordner, Standardebene, keine geplanten Punkte mehr bei »aktiv«
import test from "node:test";
import assert from "node:assert/strict";
import { lighting, LIGHTING, PHOTO_LIGHT } from "../src/core/viewlight.js";
import { settingDef, validateValue, CATEGORIES } from "../src/core/settings.js";

test("Beleuchtung: Voreinstellungen, Foto hat Vorrang, Unbekanntes = Standard", () => {
  assert.deepEqual(lighting("standard"), { head: 1.9, ambient: 0.95, hemi: 0.55 });
  assert.ok(lighting("kontrast").head > LIGHTING.standard.head && lighting("kontrast").ambient < LIGHTING.standard.ambient);
  assert.ok(lighting("weich").ambient > LIGHTING.standard.ambient);
  assert.equal(lighting("kontrast", true), PHOTO_LIGHT);
  assert.equal(lighting("gibtsnicht"), LIGHTING.standard);
  for (const o of settingDef("ansicht.beleuchtung").options) assert.ok(LIGHTING[o.value], o.value);
});

test("Standardordner und Standardebene", () => {
  const f = settingDef("allgemein.ordner");
  assert.deepEqual(validateValue(f, " C:\\Konstruktion "), { ok: true, value: "C:\\Konstruktion" });
  assert.equal(validateValue(f, "").ok, true);
  assert.equal(validateValue(f, "a\u0000b").ok, false);
  assert.equal(validateValue(f, 5).ok, false);
  assert.deepEqual(settingDef("skizze.standardebene").options.map((o) => o.value), ["waehlen", "XY", "XZ", "YZ"]);
});

test("Kategorien: »aktiv« ohne geplante Punkte, erledigte Punkte nicht mehr geplant", () => {
  for (const c of CATEGORIES) if (c.status === "aktiv") assert.ok(!c.planned?.length, c.id);
  const planned = CATEGORIES.flatMap((c) => c.planned || []).join(" | ");
  for (const done of ["Standardordner", "Beleuchtung", "Standardebene", "Tooltip", "Menüband", "Namensregeln", "Anzahl Sicherungen", "automatische Neuberechnung"]) assert.ok(!planned.includes(done), done);
});
