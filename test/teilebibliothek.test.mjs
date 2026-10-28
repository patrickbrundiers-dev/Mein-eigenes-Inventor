// Eigene Teilebibliothek (ST12): Eintrag bauen, einfügen (Kopie mit neuer id, Werkstoffe), suchen; Ablage im Ordner
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { libraryEntry, insertEntry, filterEntries, entryCategories, validEntry } from "../src/core/teilebibliothek.js";

const prj = () => ({ format: "werkcad", docs: [{ id: "p1", kind: "part", name: "Knotenblech", number: "KB-10", material: "eigen1", features: [{ id: "f1", type: "extrude" }], link: { path: "x.wcad" } }], materials: [{ key: "eigen1", label: "S355 eigen" }] });

test("Eintrag: in sich geschlossen (Bauteil ohne Verknüpfung, eigener Werkstoff), Einfügen als Kopie mit neuer id", () => {
  const src = prj();
  const e = libraryEntry(src, src.docs[0], { id: "lib1", name: "Knotenblech 10", category: "Anschlüsse", thumb: "data:image/png;base64,AA" });
  assert.ok(validEntry(e));
  assert.equal(e.project.docs[0].link, undefined);
  assert.deepEqual(e.project.materials.map((m) => m.key), ["eigen1"]);
  const dst = { docs: [{ id: "a", kind: "assembly", name: "BG", components: [] }, { id: "x", kind: "part", name: "Knotenblech 10" }] };
  const r = insertEntry(dst, e, "p9");
  assert.equal(r.doc.id, "p9");
  assert.equal(r.doc.name, "Knotenblech 10 (2)", "Name im Projekt eindeutig");
  assert.deepEqual(r.doc.library, { id: "lib1", time: e.time, name: "Knotenblech 10" });
  assert.deepEqual(dst.materials.map((m) => m.key), ["eigen1"]);
  assert.equal(insertEntry(dst, e, "p10").reused, true, "gleicher Stand → vorhandenes Bauteil");
  assert.equal(dst.docs.length, 3);
  assert.throws(() => libraryEntry(src, { kind: "assembly" }, { id: "z" }), /Nur Bauteile/);
});

test("Suche über Name, Kategorie, Nummer; Kategorien sortiert", () => {
  const src = prj();
  const mk = (id, name, category) => libraryEntry(src, src.docs[0], { id, name, category });
  const list = [mk("1", "Stirnplatte IPE 200", "Anschlüsse"), mk("2", "Handlaufhalter", "Geländer"), mk("3", "Fußplatte 200", "Anschlüsse"), { format: "kaputt" }];
  assert.deepEqual(filterEntries(list).map((e) => e.id), ["3", "1", "2"]);
  assert.deepEqual(filterEntries(list, "200").map((e) => e.id), ["3", "1"]);
  assert.deepEqual(filterEntries(list, "kb-10 halter").map((e) => e.id), ["2"]);
  assert.deepEqual(filterEntries(list, "", "Geländer").map((e) => e.id), ["2"]);
  assert.deepEqual(entryCategories(list), ["Anschlüsse", "Geländer"]);
});

test("Ablage im Benutzerordner: schreiben, lesen, ersetzen, löschen; ungültige ids und Dateien abgewiesen", () => {
  const lib = createRequire(import.meta.url)("../electron/teilebibliothek.cjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pbcad-lib-"));
  const src = prj();
  const e = libraryEntry(src, src.docs[0], { id: "lib_a1", name: "A" });
  lib.write(dir, e);
  lib.write(dir, { ...e, name: "A2" });
  fs.writeFileSync(path.join(dir, "kaputt.json"), "{");
  assert.deepEqual(lib.list(dir).map((x) => x.name), ["A2"]);
  assert.throws(() => lib.write(dir, { id: "../x", format: "anders" }), /Ungültig/);
  assert.equal(lib.safeId("../../etc"), "etc");
  lib.remove(dir, "lib_a1");
  assert.deepEqual(lib.list(dir), []);
  assert.deepEqual(lib.list(path.join(dir, "fehlt")), []);
  fs.rmSync(dir, { recursive: true, force: true });
});
