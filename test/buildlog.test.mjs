// Berechnungsprotokoll: Einträge aus dem Kernel-Ergebnis, Ringpuffer, Text zum Kopieren; Befehle F5/Protokoll
import test from "node:test";
import assert from "node:assert/strict";
import { BuildLog, buildEntry, entryLine } from "../src/core/buildlog.js";
import { commandDef } from "../src/core/commands.js";
import { settingDef, validateValue } from "../src/core/settings.js";

const part = { name: "Tor", features: [{ id: "a", type: "profile", name: "Pfosten" }, { id: "b", type: "fillet" }, { id: "c", type: "hole", suppressed: true }] };

test("Eintrag: Dauer, aktive Features, Fehler und Warnungen je Feature", () => {
  const e = buildEntry(part, { bodies: [{}, {}], status: { a: { ok: true, warning: "Gehrung nicht maßhaltig" }, b: { ok: false, error: "Radius zu groß" }, c: { ok: true } } }, 123.6, Date.UTC(2026, 9, 25, 8, 5, 9));
  assert.equal(e.ms, 124);
  assert.equal(e.features, 2);
  assert.equal(e.bodies, 2);
  assert.deepEqual(e.msgs, [{ kind: "Warnung", feature: "Pfosten", text: "Gehrung nicht maßhaltig" }, { kind: "Fehler", feature: "fillet", text: "Radius zu groß" }]);
  assert.equal(entryLine(e), "08:05:09  Tor: 124 ms, 2 Feature(s), 2 Körper\n    Warnung Pfosten: Gehrung nicht maßhaltig\n    Fehler fillet: Radius zu groß");
});

test("Ringpuffer: neueste zuerst, höchstens max Einträge", () => {
  const log = new BuildLog(3);
  for (let i = 1; i <= 5; i++) log.add({ time: i, part: "P" + i, ms: i, features: 0, bodies: 0, msgs: [] });
  assert.deepEqual(log.entries().map((e) => e.part), ["P5", "P4", "P3"]);
  assert.equal(log.text().split("\n").length, 3);
  log.clear();
  assert.equal(log.entries().length, 0);
});

test("Befehle und Einstellungen", () => {
  assert.equal(commandDef("model.rebuild").key, "F5");
  assert.ok(commandDef("model.buildLog"));
  assert.equal(settingDef("kernel.automatisch").default, true);
  assert.equal(validateValue(settingDef("kernel.protokoll"), true).ok, true);
});
