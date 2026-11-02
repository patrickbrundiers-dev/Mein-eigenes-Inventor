import { test } from "node:test";
import assert from "node:assert/strict";
import { pushRecent, orderWithRecent, undoHistory } from "../src/core/zuletzt.js";

test("zuletzt benutzt: vorn einreihen, keine Doppelten, gekürzt", () => {
  let l = [];
  for (const id of ["a", "b", "c", "a"]) l = pushRecent(l, id, 3);
  assert.deepEqual(l, ["a", "c", "b"]);
  assert.deepEqual(pushRecent(["x", "y", "z"], "w", 3), ["w", "x", "y"]);
  assert.deepEqual(pushRecent(null, ""), []);
});

test("Befehlssuche leer: zuletzt benutzte zuerst, unbekannte ids fallen weg", () => {
  const cmds = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const o = orderWithRecent(cmds, ["c", "fehlt", "a"]);
  assert.deepEqual(o.recent.map((c) => c.id), ["c", "a"]);
  assert.deepEqual(o.rest.map((c) => c.id), ["b"]);
});

test("Rückgängig-Verlauf: neueste zuerst mit Schrittzahl", () => {
  const h = undoHistory([{ label: "Skizze" }, { label: "Extrusion" }, {}], 2);
  assert.deepEqual(h, [{ label: "Änderung", steps: 1 }, { label: "Extrusion", steps: 2 }]);
});
