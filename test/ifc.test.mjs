// IFC4-Export (Stahlbau-Lücken ST2): GlobalId, Texte, Klassen, Aufbau der Datei – ohne Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { ifcGuid, guidMaker, ifcString, ifcClass, writeIfc, ifcCounts, ifcElements } from "../src/core/ifc.js";

test("IFC: GlobalId 22 Zeichen aus dem IFC-Alphabet, erstes Zeichen 0–3, Folge ohne Doppelte", () => {
  assert.equal(ifcGuid(new Array(16).fill(0)), "0000000000000000000000");
  assert.equal(ifcGuid(new Array(16).fill(255)), "3$$$$$$$$$$$$$$$$$$$$$");
  const g = guidMaker("Projekt"), ids = new Set();
  for (let i = 0; i < 2000; i++) { const id = g(); assert.match(id, /^[0-3][0-9A-Za-z_$]{21}$/); ids.add(id); }
  assert.equal(ids.size, 2000);
  assert.equal(guidMaker("x")(), guidMaker("x")(), "gleicher Startwert → gleiche Ids");
});

test("IFC: Texte mit Apostroph und Umlauten nach ISO 10303-21", () => {
  assert.equal(ifcString("Träger"), "'Tr\\X2\\00E4\\X0\\ger'");
  assert.equal(ifcString("O'Neil"), "'O''Neil'");
  assert.equal(ifcString(""), "$");
});

test("IFC: Klasse aus Achse, Platte und Normteil", () => {
  assert.equal(ifcClass({ kind: "member", axis: [0, 0, 1] }), "IFCCOLUMN");
  assert.equal(ifcClass({ kind: "member", axis: [1, 0, 0] }), "IFCBEAM");
  assert.equal(ifcClass({ kind: "member", axis: [1, 0, 1] }), "IFCMEMBER");
  assert.equal(ifcClass({ kind: "solid", plate: true }), "IFCPLATE");
  assert.equal(ifcClass({ kind: "solid", norm: "ISO 4017 M16x50" }), "IFCMECHANICALFASTENER");
  assert.equal(ifcClass({ kind: "solid" }), "IFCBUILDINGELEMENTPROXY");
});

test("IFC: Datei mit Projekt, Geschoss, Elementen, Werkstoff und Eigenschaften", () => {
  const cube = { vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], triangles: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3] };
  const data = [
    { item: "Stütze", part: "S", number: "S-1", index: 0, name: "Stütze", kind: "member", axis: [0, 0, 1], profile: "HEB 200", length: 3000, volume: 1e6, material: "S355", color: "#808080", ...cube },
    { item: "Kopf", part: "K", index: 0, name: "Kopfplatte", kind: "solid", plate: true, thickness: 20, volume: 1e5, material: "S235", ...cube },
    { item: "Kopf", part: "K", index: 1, name: "Naht", kind: "solid", weld: true, ...cube },
  ];
  const els = ifcElements(data);
  assert.equal(els.length, 2, "Naht nicht als eigenes Element");
  assert.equal(els[0].props["Gewicht kg"], 7.85);
  const text = writeIfc({ project: "Halle Müller", elements: els }, { time: new Date("2026-10-28T12:00:00Z") });
  assert.match(text, /^ISO-10303-21;\nHEADER;/);
  assert.match(text, /FILE_SCHEMA\(\('IFC4'\)\);/);
  assert.ok(text.trim().endsWith("END-ISO-10303-21;"));
  assert.deepEqual(ifcCounts(text), { IFCCOLUMN: 1, IFCPLATE: 1 });
  assert.match(text, /IFCPROJECT\('[^']{22}',#\d+,'Halle M\\X2\\00FC\\X0\\ller'/);
  assert.match(text, /IFCTRIANGULATEDFACESET\(#\d+,\$,\.T\.,\(\(1,3,2\),/);
  assert.match(text, /IFCRELCONTAINEDINSPATIALSTRUCTURE\('[^']+',#\d+,\$,\$,\(#\d+,#\d+\),#\d+\)/);
  assert.match(text, /IFCPROPERTYSINGLEVALUE\('Profil',\$,IFCLABEL\('HEB 200'\),\$\)/);
  // Verweise zeigen nur auf vorhandene Einträge
  const ids = new Set([...text.matchAll(/^#(\d+)=/gm)].map((m) => m[1]));
  for (const m of text.matchAll(/#(\d+)(?!=)/g)) assert.ok(ids.has(m[1]), "Verweis #" + m[1]);
});
