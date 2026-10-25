// Profilbibliothek nach Normen: Werkstoffgruppe → Profilart → Abmessung → Wandstärke (src/core/profillib.js)
import test from "node:test";
import assert from "node:assert/strict";
import { LIB_GROUPS, libraryEntries, groupOfMaterial, groupKinds, mainSizes, wallsFor, findEntry, pickEntry, defaultEntry, mainOfDims, mainLabel } from "../src/core/profillib.js";
import { CATALOG, SECTION_KINDS, MATERIALS, sectionGeometry, catalogToDims } from "../src/core/sections.js";

const num = (d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Number(v)]));

test("Bibliothek: jeder Eintrag ergibt einen gültigen Querschnitt, keine doppelten", () => {
  let n = 0;
  for (const g of Object.keys(LIB_GROUPS)) for (const kind of Object.keys(LIB_GROUPS[g].kinds)) {
    assert.ok(SECTION_KINDS[kind], `${g}: unbekannte Profilart ${kind}`);
    const list = libraryEntries(g, kind), seen = new Set();
    for (const e of list) {
      assert.ok(!seen.has(e.size), `${g} ${kind} ${e.size} doppelt`);
      seen.add(e.size);
      assert.ok(e.norm, `${g} ${kind} ${e.size}: Norm fehlt`);
      assert.doesNotThrow(() => sectionGeometry(kind, num(e.dims)), `${g} ${kind} ${e.size}`);
      n++;
    }
  }
  assert.ok(n > 1200, `deutlich größer als vorher (${n} Profile)`);
});

test("Werkstoffgruppen: eingebaute Werkstoffe und eigene nach Dichte", () => {
  assert.equal(groupOfMaterial({ key: "S235", ...MATERIALS.S235 }), "stahl");
  assert.equal(groupOfMaterial({ key: "1.4571" }), "edelstahl");
  assert.equal(groupOfMaterial({ key: "AlMgSi" }), "aluminium");
  assert.equal(groupOfMaterial({ key: "S275eigen", density: 7.85 }), "stahl");
  assert.equal(groupOfMaterial({ key: "AlZn", density: 2.8 }), "aluminium");
  assert.equal(groupOfMaterial({ key: "POM", density: 1.41 }), null);
  assert.deepEqual(groupKinds("aluminium", ["rohr", "ipe", "winkel"]), ["rohr", "winkel"], "kein IPE aus Aluminium");
  assert.deepEqual(groupKinds(null, ["rohr", "ipe"]), ["rohr", "ipe"]);
});

test("Auswahl in Schritten: Abmessung, dann nur deren Wandstärken", () => {
  const mains = mainSizes("stahl", "rohr").map(([m]) => m);
  assert.ok(mains.includes("42.4") && mains.includes("323.9"));
  assert.deepEqual(mains, [...mains].sort((a, b) => a - b), "aufsteigend sortiert");
  assert.deepEqual(wallsFor("stahl", "rohr", "42.4").map(([w]) => w), ["2", "2.6", "3.2", "4"]);
  assert.deepEqual(wallsFor("edelstahl", "rohr", "42.4").map(([w]) => w), ["1.5", "2", "2.6"]);
  assert.equal(mainLabel("rohr", "42.4"), "Ø 42,4 mm");
  assert.equal(mainLabel("rechteck", "60x40"), "60 × 40 mm");
  assert.equal(mainLabel("ipe", "200"), "IPE 200");
  // Abmessung wechseln: Wandstärke bleibt, sonst die nächstliegende
  assert.equal(pickEntry("stahl", "vierkant", "60", 3).size, "60x3");
  assert.equal(pickEntry("stahl", "vierkant", "200", 3).wall, "6.3");
  assert.equal(pickEntry("stahl", "ipe", "200").dims.H, "200");
  assert.ok(defaultEntry("aluminium", "winkel"));
  assert.equal(defaultEntry("aluminium", "ipe"), null);
});

test("Radien je Werkstoffgruppe; Treffer und Abmessung aus Maßen", () => {
  assert.equal(pickEntry("stahl", "vierkant", "100", 4).dims.r, "8", "EN 10219: 2·t");
  assert.equal(pickEntry("stahl", "vierkant", "200", 10).dims.r, "25", "EN 10219: 2,5·t über 6 mm");
  assert.equal(pickEntry("aluminium", "vierkant", "40", 3).dims.r, "1", "Strangpressprofil fast scharfkantig");
  const e = findEntry("stahl", "rechteck", { B: 100, H: 50, t: 4, r: 7 });
  assert.equal(e?.norm, "EN 10219-2", "Radius zählt beim Erkennen nicht mit");
  assert.equal(findEntry("stahl", "rechteck", { B: 101, H: 50, t: 4 }), null);
  assert.equal(mainOfDims("rechteck", { B: 60, H: 40, t: 3 }), "60x40");
  assert.equal(mainOfDims("rohr", { D: 48.3, t: 2.6 }), "48.3");
});

test("Katalog (Generatoren, Schnelleingabe) enthält die Bibliothek und alle bisherigen Größen", () => {
  for (const s of ["20x2", "26.9x2.3", "114.3x3.6", "323.9x10"]) assert.ok(CATALOG.rohr.includes(s), s);
  for (const s of ["15x1.5", "120x5", "300x12.5"]) assert.ok(CATALOG.vierkant.includes(s), s);
  assert.ok(CATALOG.ipe.includes("600") && CATALOG.heb.includes("500") && CATALOG.upn.includes("50"));
  for (const kind of Object.keys(CATALOG)) for (const size of CATALOG[kind]) assert.doesNotThrow(() => sectionGeometry(kind, num(catalogToDims(kind, size))), `${kind} ${size}`);
});
