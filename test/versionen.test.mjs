// Versionen mit Notiz (FU6): Änderungsliste, Browser-Speicher, Desktop-Ordner neben der Datei
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { versionChanges, nextVersion, versionFile, sortVersions, storageVersions } from "../src/core/versionen.js";

const require = createRequire(import.meta.url);
const desk = require("../electron/versionen.cjs");

const prj = (docs, extra = {}) => ({ format: "werkcad", name: "P", docs, ...extra });

test("Änderungen zwischen zwei Ständen: neu, geändert, umbenannt, entfernt", () => {
  const a = { id: "a", kind: "part", name: "Rahmen", features: [{ id: "f", depth: 10 }] };
  const b = { id: "b", kind: "part", name: "Platte", features: [] };
  const prev = prj([a, b]);
  assert.equal(versionChanges(null, prev).text, "Erste Version");
  assert.equal(versionChanges(prev, structuredClone(prev)).text, "Keine Änderung am Modell");
  const cur = structuredClone(prev);
  cur.docs[0].features[0].depth = 12;
  cur.docs.splice(1, 1);
  cur.docs.push({ id: "c", kind: "assembly", name: "Tor", components: [] });
  assert.equal(versionChanges(prev, cur).text, "Neu: Tor · Geändert: Rahmen · Entfernt: Platte");
  const ren = structuredClone(prev);
  ren.docs[1].name = "Fußplatte";
  assert.deepEqual(versionChanges(prev, ren).changed, ["Platte → Fußplatte"]);
  // Speicherzeit und Freigabe sind keine Modelländerung
  const t = structuredClone(prev);
  t.saved = "2026-10-25"; t.docs[0].release = { status: "freigegeben" };
  assert.equal(versionChanges(prev, t).text, "Keine Änderung am Modell");
  const m = structuredClone(prev); m.materials = [{ key: "X" }];
  assert.equal(versionChanges(prev, m).text, "Projekteinstellungen geändert");
});

test("Nummern und Reihenfolge", () => {
  assert.equal(nextVersion([]), 1);
  assert.equal(nextVersion([{ n: 2 }, { n: 7 }]), 8);
  assert.equal(versionFile(3), "V003.wcad");
  assert.deepEqual(sortVersions([{ n: 1 }, { n: 3 }, { n: "x" }, null, { n: 2 }]).map((v) => v.n), [3, 2, 1]);
});

test("Browser-Speicher: speichern, Liste neueste zuerst, lesen", async () => {
  const mem = new Map();
  const st = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  const s = storageVersions(st, "k", () => new Date(2026, 9, 25, 12));
  assert.deepEqual(await s.list(), []);
  await s.save({ text: "eins", note: "Angebot" });
  const e = await s.save({ text: "zwei", note: "Pfosten 60", changes: "Geändert: Tor" });
  assert.equal(e.n, 2);
  assert.deepEqual((await s.list()).map((v) => [v.n, v.note]), [[2, "Pfosten 60"], [1, "Angebot"]]);
  assert.equal(await s.read(1), "eins");
  await assert.rejects(s.read(5), /V5 nicht gefunden/);
});

test("Desktop: Ordner neben der Datei, Versionsdateien sind normale Projektdateien", () => {
  const dir = mkdtempSync(join(tmpdir(), "pbcad-ver-"));
  const file = join(dir, "Tor.wcad");
  writeFileSync(file, "{}");
  assert.deepEqual(desk.listVersions(file), []);
  const e1 = desk.saveVersion(file, { text: '{"v":1}', note: "erste" }, new Date(2026, 9, 25));
  const e2 = desk.saveVersion(file, { text: '{"v":2}', note: "zweite", changes: "Neu: Tor" });
  assert.equal(desk.dirFor(file), join(dir, "Tor.versionen"));
  assert.ok(existsSync(join(dir, "Tor.versionen", "V001.wcad")));
  assert.equal(readFileSync(join(dir, "Tor.versionen", "V002.wcad"), "utf8"), '{"v":2}');
  assert.deepEqual([e1.n, e2.n], [1, 2]);
  assert.deepEqual(desk.listVersions(file).map((v) => [v.n, v.note, v.changes]), [[2, "zweite", "Neu: Tor"], [1, "erste", ""]]);
  assert.equal(desk.readVersion(file, 1), '{"v":1}');
  assert.throws(() => desk.readVersion(file, 0), /ungültig/);
  // gelöschte Versionsdatei fällt aus der Liste, Nummer wird nicht wiederverwendet
  unlinkSync(join(dir, "Tor.versionen", "V002.wcad"));
  assert.deepEqual(desk.listVersions(file).map((v) => v.n), [1]);
  assert.equal(desk.saveVersion(file, { text: "{}" }).n, 3);
});
