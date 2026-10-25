// Parameter als CSV (FU3)
import { test } from "node:test";
import assert from "node:assert/strict";
import { paramsCsv, parseParamsCsv, mergeParams } from "../src/core/parameterdatei.js";

test("CSV schreiben: Semikolon, Dezimalkomma, Anführungszeichen, BOM", () => {
  const csv = paramsCsv([{ name: "L", expr: "1200", comment: "Länge; außen" }, { name: "R", expr: "L / 4", comment: "" }], { L: 1200, R: 300.5 });
  assert.equal(csv, '﻿Name;Ausdruck;Wert;Kommentar\r\nL;1200;1200;"Länge; außen"\r\nR;L / 4;300,5;\r\n');
});

test("CSV lesen: rundum, Kopfzeile in anderer Reihenfolge, Komma-Datei, Fehler", () => {
  const back = parseParamsCsv(paramsCsv([{ name: "L", expr: "wenn(B > 2; 3; 4)", comment: 'Zoll "x"' }], {}));
  assert.deepEqual(back, { rows: [{ name: "L", expr: "wenn(B > 2; 3; 4)", comment: 'Zoll "x"' }], errors: [] });
  const r = parseParamsCsv("Kommentar;Name;Wert\nx;B;5\n;H;7,5\n");
  assert.deepEqual(r.rows, [{ name: "B", expr: "5", comment: "x" }, { name: "H", expr: "7,5", comment: "" }]);
  const c = parseParamsCsv("B,12\nH,7\n");
  assert.deepEqual(c.rows.map((x) => [x.name, x.expr]), [["B", "12"], ["H", "7"]]);
  const bad = parseParamsCsv("Name;Ausdruck\n2x;5\nB;\nC;1\nC;2\n");
  assert.deepEqual(bad.rows.map((x) => x.name), ["C"]);
  assert.equal(bad.errors.length, 3);
  assert.match(bad.errors[0], /Zeile 2: ungültiger Name/);
  assert.deepEqual(parseParamsCsv("").errors, ["Datei ist leer"]);
});

test("Einarbeiten: gleiche Namen ändern, neue anhängen, übrige bleiben", () => {
  const r = mergeParams([{ name: "L", expr: "1000", comment: "Länge" }, { name: "B", expr: "500" }], [{ name: "L", expr: "1200", comment: "" }, { name: "B", expr: "500", comment: "" }, { name: "T", expr: "3", comment: "Dicke" }]);
  assert.deepEqual(r.rows, [{ name: "L", expr: "1200", comment: "Länge" }, { name: "B", expr: "500" }, { name: "T", expr: "3", comment: "Dicke" }]);
  assert.deepEqual([r.added, r.updated], [["T"], ["L"]]);
});
