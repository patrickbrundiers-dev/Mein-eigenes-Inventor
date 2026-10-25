// Dateien: Sicherungen beim Speichern (Anzahl, Reihenfolge), Projekt paketieren
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { packProject } from "../src/core/links.js";
import { settingDef, validateValue } from "../src/core/settings.js";

const { rotateBackups, backupCount } = createRequire(import.meta.url)("../electron/backups.cjs");

test("Sicherungen: jüngste ist .bak, ältere rücken weiter, Überzählige gehen", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pbcad-bak-"));
  const f = path.join(dir, "A.wcad");
  const save = (text, keep) => { rotateBackups(f, keep); fs.writeFileSync(f, text); };
  save("v1", 3); save("v2", 3); save("v3", 3); save("v4", 3); save("v5", 3);
  const read = (n) => fs.readFileSync(path.join(dir, n), "utf8");
  assert.equal(read("A.wcad"), "v5");
  assert.equal(read("A.wcad.bak"), "v4");
  assert.equal(read("A.wcad.bak2"), "v3");
  assert.equal(read("A.wcad.bak3"), "v2");
  assert.equal(fs.existsSync(path.join(dir, "A.wcad.bak4")), false);
  save("v6", 1);
  assert.deepEqual(fs.readdirSync(dir).sort(), ["A.wcad", "A.wcad.bak"]);
  assert.equal(read("A.wcad.bak"), "v5");
  save("v7", 0);
  assert.equal(read("A.wcad.bak"), "v5", "0 = keine neue Sicherung, vorhandene bleibt");
  assert.equal(backupCount(undefined), 1);
  assert.equal(backupCount(12), 1);
  assert.equal(backupCount(0), 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Projekt paketieren: Verknüpfungen gelöst, Original unverändert", () => {
  const prj = { name: "P", docs: [
    { id: "p1", kind: "part", name: "Tor", features: [{ id: "f", type: "profile" }], link: { path: "C:/Teile/Tor.wcad", rel: "Teile/Tor.wcad", docId: "x", time: 1 } },
    { id: "p2", kind: "part", name: "Platte", features: [] },
  ] };
  const { project, packed } = packProject(prj);
  assert.deepEqual(packed, ["Tor"]);
  assert.equal(project.docs[0].link, undefined);
  assert.equal(project.docs[0].features.length, 1);
  assert.ok(prj.docs[0].link, "offenes Projekt behält die Verknüpfung");
  assert.equal(validateValue(settingDef("dateien.sicherungen"), 3).ok, true);
  assert.equal(validateValue(settingDef("dateien.sicherungen"), 10).ok, false);
});

// ---------- Startbildschirm: zuletzt verwendete Projekte ----------
import { sortRecent, filterRecent, recentDate, recentSize } from "../src/core/recent.js";
const recent = createRequire(import.meta.url)("../electron/recent.cjs");

test("Zuletzt verwendet: vorne einreihen, ohne Doppelte, höchstens 12, entfernen", () => {
  let l = [];
  for (let i = 0; i < 14; i++) l = recent.addRecent(l, `C:\\p\\${i}.wcad`);
  assert.equal(l.length, recent.MAX_RECENT);
  assert.equal(l[0], "C:\\p\\13.wcad");
  l = recent.addRecent(l, "C:\\p\\5.wcad");
  assert.equal(l[0], "C:\\p\\5.wcad");
  assert.equal(l.filter((x) => x === "C:\\p\\5.wcad").length, 1);
  assert.ok(!recent.removeRecent(l, "C:\\p\\5.wcad").includes("C:\\p\\5.wcad"));
});

test("Zuletzt verwendet: Einträge mit Datum, Größe und Vorschaubild; fehlende Dateien fallen weg", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pbcad-recent-"));
  const prev = path.join(dir, "vorschau");
  const a = path.join(dir, "Tor links.wcad"), b = path.join(dir, "Rahmen.wcad");
  fs.writeFileSync(a, "{}"); fs.writeFileSync(b, "{\"x\":1}");
  const png = "data:image/png;base64,iVBORw0KGgo=";
  assert.equal(recent.writePreview(prev, a, png), true);
  assert.equal(recent.writePreview(prev, a, "data:image/svg+xml;base64,PHN2Zz4="), false, "nur PNG");
  assert.equal(recent.writePreview(prev, path.join(dir, "x.txt"), png), false, "nur .wcad");
  const e = recent.recentEntries([a, path.join(dir, "weg.wcad"), b], prev);
  assert.deepEqual(e.map((x) => x.name), ["Tor links", "Rahmen"]);
  assert.deepEqual(e.map((x) => x.rank), [0, 1]);
  assert.equal(e[0].preview, png);
  assert.equal(e[1].preview, null);
  assert.equal(e[1].size, 7);
  assert.equal(e[0].folder, dir);
});

test("Zuletzt verwendet: sortieren, suchen, Datum und Größe", () => {
  const l = [
    { name: "Treppe", folder: "D:\\Kunde B", mtime: 100, rank: 0 },
    { name: "geländer 10", folder: "D:\\Kunde A", mtime: 300, rank: 1 },
    { name: "Geländer 2", folder: "D:\\Kunde A", mtime: 200, rank: 2 },
  ];
  assert.deepEqual(sortRecent(l, "geaendert").map((x) => x.rank), [1, 2, 0]);
  assert.deepEqual(sortRecent(l, "geoeffnet").map((x) => x.rank), [0, 1, 2]);
  assert.deepEqual(sortRecent(l, "name").map((x) => x.name), ["Geländer 2", "geländer 10", "Treppe"]);
  assert.equal(l[0].name, "Treppe", "Original bleibt unverändert");
  assert.deepEqual(filterRecent(l, "kunde a").map((x) => x.rank), [1, 2]);
  assert.equal(filterRecent(l, "  ").length, 3);
  const now = new Date(2026, 9, 25, 18, 0).getTime();
  assert.equal(recentDate(new Date(2026, 9, 25, 9, 5).getTime(), now), "heute, 09:05");
  assert.equal(recentDate(new Date(2026, 9, 24, 23, 59).getTime(), now), "gestern, 23:59");
  assert.equal(recentDate(new Date(2026, 0, 3, 7, 0).getTime(), now), "03.01.2026, 07:00");
  assert.equal(recentSize(300), "1 KB");
  assert.equal(recentSize(2.5 * 1024 * 1024), "2,5 MB");
});

test("Startseite: Ansicht und Sortierung sind Einstellungen mit Prüfung", () => {
  assert.equal(settingDef("allgemein.startAnsicht").default, "kacheln");
  assert.equal(validateValue(settingDef("allgemein.startAnsicht"), "liste").ok, true);
  assert.equal(validateValue(settingDef("allgemein.startSortierung"), "egal").ok, false);
});
