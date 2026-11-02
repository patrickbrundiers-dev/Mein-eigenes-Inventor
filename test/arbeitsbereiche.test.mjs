import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_WORKSPACES, captureWorkspace, upsertWorkspace, readWorkspaces, activeWorkspace, layoutFor } from "../src/core/arbeitsbereiche.js";

const L = { browser: "left", props: "right", wLeft: 260, wRight: 300, hide: [] };

test("Arbeitsbereiche: speichern ersetzt gleichnamige, eingebaute Namen gesperrt", () => {
  const a = captureWorkspace("Mein Platz", { layout: { ...L, props: "left" }, grid: false, side: true });
  let r = upsertWorkspace([], a);
  assert.equal(r.ok, true);
  r = upsertWorkspace(r.value, { ...a, grid: true });
  assert.equal(r.value.length, 1);
  assert.equal(r.value[0].grid, true);
  assert.equal(upsertWorkspace([], { ...a, name: "konstruktion" }).ok, false);
  assert.equal(upsertWorkspace([], { ...a, name: "" }).ok, false);
});

test("Arbeitsbereiche: Lesen verwirft Kaputtes", () => {
  assert.deepEqual(readWorkspaces("kein json"), []);
  assert.deepEqual(readWorkspaces("{}"), []);
  const ok = readWorkspaces(JSON.stringify([{ name: "A", layout: L }, { name: "", layout: L }, { foo: 1 }]));
  assert.equal(ok.length, 1);
  assert.equal(ok[0].layout.browser, "left");
});

test("Arbeitsbereiche: aktiver Bereich ohne Breiten, eingebaute behalten die Breite", () => {
  assert.equal(activeWorkspace(BUILTIN_WORKSPACES, { layout: { ...L, wLeft: 400 }, grid: true, side: false }), "Konstruktion");
  assert.equal(activeWorkspace(BUILTIN_WORKSPACES, { layout: { ...L, hide: ["props", "browser"] }, grid: false, side: false }), "Präsentation");
  assert.equal(activeWorkspace(BUILTIN_WORKSPACES, { layout: L, grid: false, side: true }), null);
  const lay = layoutFor(BUILTIN_WORKSPACES[2], { ...L, wLeft: 333 });
  assert.equal(lay.wLeft, 333);
  assert.deepEqual(lay.hide, ["browser", "props"]);
});
