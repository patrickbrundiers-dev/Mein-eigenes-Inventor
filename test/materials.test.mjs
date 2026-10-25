// Eigene Werkstoffe: Prüfung, Austausch als JSON, Kopie in der Projektdatei, Rückfall bei Unbekanntem
import test from "node:test";
import assert from "node:assert/strict";
import { materialOf, materialList, setUserMaterials, setProjectMaterials, validateMaterial, validateMaterialLib, exportMaterialLib, importMaterialLib, projectMaterialCopies, adoptProjectMaterials } from "../src/core/materials.js";
import { cutListRows } from "../src/core/cutlist.js";
import { settingDef, validateValue } from "../src/core/settings.js";

const CORTEN = { key: "CORTEN", label: "Cortenstahl", density: 7.87, color: "#8b4a2b", number: "1.8963" };

test("Werkstoff prüfen: Dichte > 0, Kürzel eindeutig und nicht eingebaut", () => {
  assert.deepEqual(validateMaterial({ ...CORTEN, density: "7,87", color: "#8B4A2B" }), { ok: true, value: CORTEN });
  assert.equal(validateMaterial({ ...CORTEN, density: 0 }).ok, false);
  assert.equal(validateMaterial({ ...CORTEN, density: "abc" }).ok, false);
  assert.equal(validateMaterial({ ...CORTEN, key: "S235" }).ok, false);
  assert.equal(validateMaterial({ ...CORTEN, key: "mit Leerzeichen" }).ok, false);
  assert.equal(validateMaterial({ ...CORTEN, label: " " }).ok, false);
  assert.equal(validateMaterial({ ...CORTEN, color: "rot" }).ok, false);
  assert.match(validateMaterialLib([CORTEN, { ...CORTEN, label: "Zweiter" }]).error, /doppelt/);
  assert.deepEqual(validateValue(settingDef("material.eigene"), [CORTEN]), { ok: true, value: [CORTEN] });
});

test("Werkstoffbibliothek: Export und Import im Rundlauf, gleiches Kürzel wird ersetzt", () => {
  const text = exportMaterialLib([CORTEN]);
  const r = importMaterialLib(text, []);
  assert.deepEqual(r, { ok: true, value: [CORTEN], added: 1, replaced: 0 });
  const PA = { key: "PA6", label: "Polyamid PA6", density: 1.14, color: "#eeeeee" };
  const r2 = importMaterialLib(exportMaterialLib([{ ...CORTEN, density: 7.9 }, PA]), [CORTEN]);
  assert.equal(r2.added, 1); assert.equal(r2.replaced, 1);
  assert.equal(r2.value.find((m) => m.key === "CORTEN").density, 7.9);
  assert.equal(importMaterialLib("{kaputt", []).ok, false);
  assert.equal(importMaterialLib(JSON.stringify({ format: "anders" }), []).ok, false);
});

test("Eigener Werkstoff wirkt in Masse und Zuschnittliste, Unbekanntes fällt sichtbar auf S235 zurück", () => {
  setUserMaterials([CORTEN]); setProjectMaterials([]);
  assert.equal(materialOf("CORTEN").density, 7.87);
  assert.equal(materialOf("CORTEN").source, "user");
  assert.ok(materialList().some((m) => m.key === "CORTEN" && m.source === "user"));
  const fb = materialOf("GIBTSNICHT");
  assert.equal(fb.source, "fallback"); assert.equal(fb.key, "S235"); assert.equal(fb.missing, "GIBTSNICHT");
  const body = { kind: "member", meta: { section: "rect", profileId: "40x40x2", length: 1000, area: 300 }, props: { volume: 300000 } };
  const [row] = cutListRows([{ part: { name: "Rahmen", material: "CORTEN" }, result: { bodies: [body] }, qty: 1 }]);
  assert.equal(row.material, "Cortenstahl");
  assert.ok(Math.abs(row.mass - 300000 * 7.87 / 1e6) < 1e-9);
  setUserMaterials([]);
});

test("Projekt mit eigenem Werkstoff öffnet sich auch ohne Bibliothekseintrag", () => {
  setUserMaterials([CORTEN]);
  const prj = { format: "werkcad", docs: [{ id: "p1", kind: "part", name: "Teil", material: "CORTEN", features: [] }, { id: "p2", kind: "part", material: "S235", features: [] }] };
  prj.materials = projectMaterialCopies(prj);
  assert.deepEqual(prj.materials, [CORTEN]); // nur eigene, keine eingebauten
  // anderer Rechner: Bibliothek leer
  setUserMaterials([]);
  const issues = adoptProjectMaterials(JSON.parse(JSON.stringify(prj)));
  assert.equal(materialOf("CORTEN").source, "project");
  assert.equal(materialOf("CORTEN").density, 7.87);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /Cortenstahl.*aus der Projektdatei übernommen/);
  // ohne Kopie in der Datei: Rückfall mit Hinweis
  const issues2 = adoptProjectMaterials({ docs: prj.docs });
  assert.equal(materialOf("CORTEN").source, "fallback");
  assert.match(issues2[0].message, /Unbekannter Werkstoff »CORTEN«/);
  setProjectMaterials([]);
});
