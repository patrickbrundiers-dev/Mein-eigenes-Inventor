// Biegetabellen: Prüfung, Interpolation, Umrechnung in K, DIN 6935, Biegeregel, CSV, Projektkopien
import test from "node:test";
import assert from "node:assert/strict";
import {
  validateBendTable, validateBendTables, tableValue, kFromValue, dinK, bendRule, ruleSummary, tableToCsv, parseTableText,
  setUserBendTables, setProjectBendTables, findBendTable, projectBendTableCopies, adoptProjectBendTables, bendTableUses,
} from "../src/core/bendtable.js";
import { planKantteil, bendAllowance } from "../src/core/blech.js";
import { settingDef, validateValue, CATEGORIES } from "../src/core/settings.js";
import { applyLinked, partProject } from "../src/core/links.js";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const T2 = { material: "S235", t: 2, mode: "k", ref: "biege", fallbackK: 0.33, radii: [2, 4], angles: [45, 90], values: [[0.3, 0.4], [0.32, null]] };

test("Tabelle prüfen", () => {
  const r = validateBendTable({ ...T2, t: "2,0", radii: ["2", "4"], values: [["0,3", "0.4"], ["0,32", ""]] });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.value.values, [[0.3, 0.4], [0.32, null]]);
  assert.equal(validateBendTable({ ...T2, radii: [4, 2] }).ok, false, "Radien aufsteigend");
  assert.equal(validateBendTable({ ...T2, angles: [0, 90] }).ok, false);
  assert.equal(validateBendTable({ ...T2, values: [[0.3, 0.4]] }).ok, false, "Zeilenzahl");
  assert.equal(validateBendTable({ ...T2, values: [[1.3, 0.4], [0.3, 0.3]] }).ok, false, "K > 1");
  assert.equal(validateBendTable({ ...T2, values: [[null, null], [null, null]] }).ok, false, "ganz leer");
  assert.equal(validateBendTable({ ...T2, mode: "quatsch" }).ok, false);
  assert.equal(validateBendTable({ ...T2, material: "" }).ok, false);
  assert.equal(validateBendTables([T2, { ...T2, t: 2.005 }]).ok, false, "Werkstoff und Dicke doppelt");
  assert.equal(validateBendTables([T2, { ...T2, t: 3 }]).ok, true);
  assert.equal(settingDef("blech.biegetabellen").type, "bendtables");
  assert.equal(validateValue(settingDef("blech.biegetabellen"), [T2]).ok, true);
  assert.equal(CATEGORIES.find((c) => c.id === "blech").status, "aktiv");
});

test("Interpolation, Rand, leere Zellen, Öffnungswinkel", () => {
  near(tableValue(T2, 2, 45).value, 0.3);
  near(tableValue(T2, 3, 45).value, 0.35);
  near(tableValue(T2, 2, 67.5).value, 0.31);
  near(tableValue(T2, 1.995, 90).value, 0.32, 1e-9); // knapp unter dem kleinsten Radius: Randtoleranz
  assert.match(tableValue(T2, 4, 90).error, /Leere Zelle/);
  assert.match(tableValue(T2, 5, 45).error, /Innenradius/);
  assert.match(tableValue(T2, 2, 120).error, /Winkel/);
  const open = { ...T2, ref: "oeffnung", angles: [90, 135] };
  near(tableValue(open, 2, 45).value, 0.32, 1e-9); // Biegung 45° = Öffnung 135°
});

test("Umrechnung Verkürzung/Zugabe → K, DIN 6935", () => {
  const ri = 2, t = 2, th = 90, K = 0.33;
  const ba = bendAllowance(ri, K, t, th * Math.PI / 180);
  near(kFromValue("zugabe", ba, ri, t, th), K);
  near(kFromValue("verkuerzung", ba - 2 * (ri + t), ri, t, th), K);
  near(kFromValue("k", 0.4, ri, t, th), 0.4);
  near(dinK(3, 2), (0.65 + 0.5 * Math.log10(1.5)) / 2);
  near(dinK(12, 2), 0.5);
  assert.equal(dinK(0, 2), 0);
});

test("Biegeregel: fest, DIN, Tabelle mit Ersatz", () => {
  setUserBendTables([T2]);
  const fest = bendRule({ rule: "k", material: "S235", t: 2, ri: 2, k: 0.33 });
  assert.equal(fest.kOf(90), 0.33);
  const din = bendRule({ rule: "din", material: "S235", t: 2, ri: 3, k: 0.33 });
  near(din.kOf(90), dinK(3, 2));
  const tab = bendRule({ rule: "tabelle", material: "S235", t: 2, ri: 3, k: 0.5 });
  near(tab.kOf(45), 0.35);
  assert.equal(tab.kOf(90), 0.33, "leere Nachbarzelle → Ersatz-K der Tabelle");
  assert.equal(tab.warnings.length, 1);
  assert.match(ruleSummary(tab), /Biegetabelle S235 2 mm, K 0,35 \/ 0,33/);
  const none = bendRule({ rule: "tabelle", material: "S355", t: 2, ri: 3, k: 0.5 });
  assert.equal(none.kOf(90), 0.5);
  assert.match(none.warnings[0], /Keine Biegetabelle für S355/);
  // Kantteil rechnet je Biegung mit dem Tabellen-K
  const plan = planKantteil({ legs: [40, 100, 40], angles: [45, 45], t: 2, ri: 3, k: 0.5, kOf: tab.kOf });
  near(plan.flatParts[1], bendAllowance(3, 0.35, 2, Math.PI / 4));
  setUserBendTables([]);
});

test("CSV aus Excel und zurück", () => {
  const csv = tableToCsv(T2);
  assert.equal(csv, "Winkel\\Radius;2;4\r\n45;0,3;0,4\r\n90;0,32;");
  const g = parseTableText(csv);
  assert.deepEqual([g.radii, g.angles, g.values], [T2.radii, T2.angles, T2.values]);
  const tab = parseTableText("\t1\t2\n90\t-3,8\t-4,1\n");
  assert.deepEqual(tab.values, [[-3.8, -4.1]]);
  assert.equal(parseTableText("nur eine Zeile").ok, false);
  assert.equal(parseTableText(";a;b\n90;1;2").ok, false);
});

test("Projektkopien und verknüpfte Bauteile", () => {
  const prj = { docs: [
    { kind: "part", material: "S235", features: [{ type: "kantteil", rule: "tabelle", t: "2" }, { type: "kantteil", t: "3" }] },
    { kind: "part", material: "S235", features: [{ type: "knickrahmen", bendRule: "tabelle", dims: { t: "2" } }] },
  ] };
  assert.deepEqual(bendTableUses(prj), [["S235", 2], ["S235", 2]]);
  const withParam = { docs: [{ kind: "part", material: "S235", params: [{ name: "blech", expr: "1+1" }], features: [{ type: "kantteil", rule: "tabelle", t: "blech" }] }] };
  assert.deepEqual(bendTableUses(withParam), [["S235", 2]], "Dicke als Parameter");
  setUserBendTables([T2, { ...T2, t: 3 }]);
  assert.deepEqual(projectBendTableCopies(prj).map((x) => x.t), [2], "nur benutzte, ohne Doppelte");
  setUserBendTables([]);
  assert.equal(findBendTable("S235", 2), null);
  adoptProjectBendTables({ bendTables: [T2] });
  assert.equal(findBendTable("S235", 2)?.t, 2, "Kopie aus der Datei");
  adoptProjectBendTables({ bendTables: [{ kaputt: true }] });
  assert.equal(findBendTable("S235", 2), null, "ungültige Kopien werden verworfen");
  setProjectBendTables([]);
  const part = { id: "p1", kind: "part", material: "S235", features: [] };
  assert.deepEqual(partProject({ bendTables: [T2, { ...T2, material: "X" }] }, part).bendTables, [T2]);
  const local = { id: "l1", link: { path: "a.wcad" } }, target = { bendTables: [] };
  applyLinked(target, local, { bendTables: [T2] }, part);
  assert.deepEqual(target.bendTables, [T2]);
});
