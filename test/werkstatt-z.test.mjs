// Vorschläge nach 0.50 (Z1–Z8): Reststücklager, Ladeliste, Laufzettel, Zeichnungsvergleich, Einbauort, Statik, Stücklistenspalten
import test from "node:test";
import assert from "node:assert/strict";
import { planBars, newRemnants, bookRemnants, validateRemnants, remnantPage, barOptions } from "../src/core/stangen.js";
import { validateValue, SETTINGS, settingDef } from "../src/core/settings.js";

const row = (pos, length, qty, profileId = "QR 40x40x3", material = "S235") => ({ pos, profileId, material, length, qty, kgm: 3.4 });

test("Z1: Reste werden vor neuen Stangen belegt, kürzester passender zuerst", () => {
  const remnants = [
    { id: "R1", profileId: "QR 40x40x3", material: "S235", length: 2500 },
    { id: "R2", profileId: "QR 40x40x3", material: "S235", length: 1300 },
    { id: "R3", profileId: "QR 40x40x3", material: "S355", length: 5000 }, // anderer Werkstoff
    { id: "R4", profileId: "RR 30", material: "S235", length: 5000 }, // anderes Profil
  ];
  const p = planBars([row(1, 1200, 1), row(2, 2000, 1)], { stock: 6000, trim: 10, rest: 0, kerf: 0, remnants });
  const g = p.groups[0];
  assert.equal(g.buyBars, 0, "keine neue Stange nötig");
  assert.deepEqual(new Set(p.remnantsUsed), new Set(["R1", "R2"]));
  assert.equal(g.bars.find((b) => b.remnant.id === "R2").pieces[0].pos, 1);
  assert.equal(g.buyKg, 0);
  // ohne Reste: eine Stange
  const q = planBars([row(1, 1200, 1), row(2, 2000, 1)], { stock: 6000, trim: 10 });
  assert.equal(q.groups[0].buyBars, 1);
  assert.equal(q.groups[0].bars[0].leftover, 6000 - 10 - 3200);
});

test("Z1: zu lange Teile gehen auf neue Stangen, Reste bleiben liegen", () => {
  const p = planBars([row(1, 3000, 2)], { stock: 6000, remnants: [{ id: "R1", profileId: "QR 40x40x3", material: "S235", length: 900 }] });
  assert.equal(p.remnantsUsed.length, 0);
  assert.equal(p.groups[0].buyBars, 1);
});

test("Z1: Buchen entnimmt belegte Reste und legt neue ab der Mindestlänge ab", () => {
  const stock = [{ id: "R1", profileId: "QR 40x40x3", material: "S235", length: 2500 }, { id: "R9", profileId: "FL 40x5", material: "S235", length: 800 }];
  const p = planBars([row(1, 1000, 1), row(2, 5000, 1)], { stock: 6000, trim: 10, kerf: 2, remnants: stock });
  let n = 0;
  const r = bookRemnants(stock, p, { minLength: 500, from: "Auftrag 7", date: "2026-11-10", id: () => "N" + ++n });
  assert.deepEqual(r.taken.map((x) => x.id), ["R1"]);
  // Rest von R1: 2500 − 10 − 1000 − 2 = 1488; neue Stange 6000 − 10 − 5000 − 2 = 988
  assert.deepEqual(r.added.map((x) => x.length).sort(), [1488, 988]);
  assert.ok(r.stock.some((x) => x.id === "R9"));
  assert.ok(!r.stock.some((x) => x.id === "R1"));
  assert.equal(r.added[0].from, "Auftrag 7");
  assert.equal(newRemnants(p, { minLength: 1000 }).length, 1);
});

test("Z1: Restlager in den Einstellungen geprüft, Seite druckbar", () => {
  assert.ok(SETTINGS.find((s) => s.key === "fertigung.restlager"));
  assert.equal(validateValue(settingDef("fertigung.restlager"), [{ id: "R1", profileId: "QR 40", length: 1200 }]).ok, true);
  assert.equal(validateRemnants([{ id: "R1", profileId: "QR 40", length: 0 }]).ok, false);
  assert.equal(validateRemnants([{ id: "R1", profileId: "QR 40", length: 10 }, { id: "R1", profileId: "QR 40", length: 10 }]).ok, false);
  const page = remnantPage([{ id: "R1", profileId: "QR 40", material: "S235", length: 1200, place: "Regal 3" }]);
  assert.match(page.html, /Regal 3/);
  const get = (k) => ({ "fertigung.restlager": [{ id: "R1" }], "fertigung.resteNutzen": false })[k];
  assert.deepEqual(barOptions(get).remnants, []);
});
