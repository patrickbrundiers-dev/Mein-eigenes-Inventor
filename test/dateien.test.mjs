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
