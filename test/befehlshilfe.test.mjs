import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { BEFEHLSHILFE, befehlHilfe } from "../src/core/befehlshilfe.js";

test("jeder Menüband-Knopf hat eine Kurzbeschreibung", () => {
  const src = fs.readFileSync(new URL("../src/ui/ribbon.js", import.meta.url), "utf8");
  const ids = [...new Set([...src.matchAll(/\bB\("([A-Za-z0-9_]+)"/g)].map((m) => m[1]))].filter((id) => !id.startsWith("dm_") && id !== "clip_");
  assert.ok(ids.length > 150, "Knöpfe gefunden: " + ids.length);
  const fehlt = ids.filter((id) => !BEFEHLSHILFE[id]);
  assert.deepEqual(fehlt, []);
});

test("Kurzbeschreibungen sind kurze ganze Sätze", () => {
  for (const [id, t] of Object.entries(BEFEHLSHILFE)) {
    assert.ok(typeof t === "string" && t.length >= 10 && t.length <= 170, id + ": Länge " + t.length);
    assert.match(t, /[.!]$/, id + " endet nicht mit Punkt");
    assert.match(t, /^[A-ZÄÖÜ0-9]/, id + " beginnt klein");
  }
});

test("Skizzenwerkzeuge nutzen ihre Bedienhilfe ohne Namensvorspann", () => {
  const tools = { line: "Linie: Startpunkt klicken, weitere Punkte klicken", point: "Punkt / Bohrungsmitte setzen" };
  assert.equal(befehlHilfe("t_line", tools), "Startpunkt klicken, weitere Punkte klicken");
  assert.equal(befehlHilfe("t_point", tools), "Punkt / Bohrungsmitte setzen");
  assert.equal(befehlHilfe("extrude"), BEFEHLSHILFE.extrude);
  assert.equal(befehlHilfe("gibtsnicht"), "");
  assert.match(befehlHilfe("dm_foto"), /Darstellung/);
  assert.match(befehlHilfe("clip_Z"), /senkrecht zu Z/);
});
