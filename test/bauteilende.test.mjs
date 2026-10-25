// Bauteilende (FU5)
import { test } from "node:test";
import assert from "node:assert/strict";
import { activeCount, isRolledBack, setEnd, insertFeature, beforeDelete } from "../src/core/bauteilende.js";

const part = () => ({ features: [{ id: "a" }, { id: "b" }, { id: "c" }] });

test("Markierung: zählt vorn, unbekannt = alles, vor allen = 0", () => {
  const p = part();
  assert.equal(activeCount(p), 3);
  setEnd(p, "a");
  assert.deepEqual([activeCount(p), isRolledBack(p)], [1, true]);
  setEnd(p, "");
  assert.equal(activeCount(p), 0);
  setEnd(p, "c");
  assert.equal("endAfter" in p, false, "hinter dem letzten = kein Eintrag");
  p.endAfter = "weg";
  assert.equal(activeCount(p), 3);
});

test("Einfügen an der Markierung, Markierung rückt nach", () => {
  const p = part();
  setEnd(p, "a");
  assert.equal(insertFeature(p, { id: "n" }), 1);
  assert.deepEqual(p.features.map((f) => f.id), ["a", "n", "b", "c"]);
  assert.equal(p.endAfter, "n");
  const q = part();
  insertFeature(q, { id: "z" });
  assert.deepEqual([q.features.map((f) => f.id).join(""), "endAfter" in q], ["abcz", false]);
  const r = part(); setEnd(r, "");
  insertFeature(r, { id: "x" });
  assert.deepEqual([r.features[0].id, r.endAfter], ["x", "x"]);
});

test("Löschen: Markierung rückt auf den Vorgänger", () => {
  const p = part();
  setEnd(p, "b");
  beforeDelete(p, ["b"]);
  assert.equal(p.endAfter, "a");
  beforeDelete(p, ["a"]);
  assert.equal(p.endAfter, "");
  const q = part(); setEnd(q, "b");
  beforeDelete(q, ["c"]);
  assert.equal(q.endAfter, "b");
});
