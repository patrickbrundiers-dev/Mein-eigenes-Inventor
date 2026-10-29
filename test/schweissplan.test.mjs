// Schweißplan nach EN 1090 (W11), ohne Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { testScope, weldPlanOf, weldPlanRows, weldPlanPage, weldPlanCsv } from "../src/core/schweissplan.js";

test("Prüfumfang nach Ausführungsklasse und Nahtart", () => {
  assert.equal(testScope("EXC1", "kehl", 4), "VT 100 %");
  assert.equal(testScope("EXC2", "kehl", 4), "VT 100 %");
  assert.equal(testScope("EXC2", "kehl", 14), "VT 100 %, MT/PT 5 %");
  assert.equal(testScope("EXC2", "v", 8), "VT 100 %, UT/RT 10 %");
  assert.equal(testScope("EXC3", "kehl", 4), "VT 100 %, MT/PT 5 %");
  assert.equal(testScope("EXC4", "hv", 10), "VT 100 %, UT/RT 100 %");
});

test("Plan: Standardwerte, Zeilen je WPS, Seite und CSV", () => {
  assert.deepEqual(weldPlanOf({}), { exc: "EXC2", supervisor: "", wps: [], defaultWps: "" });
  const plan = weldPlanOf({ weldPlan: { exc: "EXC3", wps: [{ id: "WPS-01", process: "135" }, { id: "WPS-02", process: "141" }], defaultWps: "WPS-01" } });
  const welds = [
    { kind: "kehl", a: 4, length: 100, part: "Rahmen", qty: 2 },
    { kind: "kehl", a: 4, length: 50, part: "Rahmen", wps: "WPS-02" },
    { kind: "v", a: 8, length: 200, part: "Träger", wps: "unbekannt" },
  ];
  const rows = weldPlanRows(welds, plan);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => [r.wps, r.kind, r.count, r.length]), [["WPS-01", "kehl", 2, 200], ["WPS-01", "v", 1, 200], ["WPS-02", "kehl", 1, 50]]);
  assert.equal(rows[0].process, "135 MAG (Massivdraht)");
  assert.equal(rows[1].test, "VT 100 %, UT/RT 20 %");
  const page = weldPlanPage({ title: "Tor", plan, rows });
  assert.equal(page.width, 297);
  assert.match(page.html, /Ausführungsklasse EXC3/);
  assert.match(page.html, /a4 Kehlnaht/);
  assert.match(weldPlanCsv(rows, plan, "Tor"), /1;a4 Kehlnaht;WPS-01;135 MAG \(Massivdraht\);2;200/);
});
