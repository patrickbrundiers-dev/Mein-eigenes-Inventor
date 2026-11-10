// Vorschläge nach 0.50 (Z1–Z8): Reststücklager, Ladeliste, Laufzettel, Zeichnungsvergleich, Einbauort, Statik, Stücklistenspalten
import test from "node:test";
import assert from "node:assert/strict";
import { planBars, newRemnants, bookRemnants, validateRemnants, remnantPage, barOptions } from "../src/core/stangen.js";
import { validateValue, SETTINGS, settingDef } from "../src/core/settings.js";

const row = (pos, length, qty, profileId = "QR 40x40x3", material = "S235") => ({ pos, profileId, material, length, qty, kgm: 3.4 });

test("Z1: Reste werden vor neuen Stangen belegt, kürzester passender zuerst", () => {
  const remnants = [
    { id: "R1", profileId: "QR 40x40x3", material: "S235", length: 2500 },
    { id: "R2", profileId: "QR 40x40x3", material: "S235", length: 1300 },
    { id: "R3", profileId: "QR 40x40x3", material: "S355", length: 5000 }, // anderer Werkstoff
    { id: "R4", profileId: "RR 30", material: "S235", length: 5000 }, // anderes Profil
  ];
  const p = planBars([row(1, 1200, 1), row(2, 2000, 1)], { stock: 6000, trim: 10, rest: 0, kerf: 0, remnants });
  const g = p.groups[0];
  assert.equal(g.buyBars, 0, "keine neue Stange nötig");
  assert.deepEqual(new Set(p.remnantsUsed), new Set(["R1", "R2"]));
  assert.equal(g.bars.find((b) => b.remnant.id === "R2").pieces[0].pos, 1);
  assert.equal(g.buyKg, 0);
  // ohne Reste: eine Stange
  const q = planBars([row(1, 1200, 1), row(2, 2000, 1)], { stock: 6000, trim: 10 });
  assert.equal(q.groups[0].buyBars, 1);
  assert.equal(q.groups[0].bars[0].leftover, 6000 - 10 - 3200);
});

test("Z1: zu lange Teile gehen auf neue Stangen, Reste bleiben liegen", () => {
  const p = planBars([row(1, 3000, 2)], { stock: 6000, remnants: [{ id: "R1", profileId: "QR 40x40x3", material: "S235", length: 900 }] });
  assert.equal(p.remnantsUsed.length, 0);
  assert.equal(p.groups[0].buyBars, 1);
});

test("Z1: Buchen entnimmt belegte Reste und legt neue ab der Mindestlänge ab", () => {
  const stock = [{ id: "R1", profileId: "QR 40x40x3", material: "S235", length: 2500 }, { id: "R9", profileId: "FL 40x5", material: "S235", length: 800 }];
  const p = planBars([row(1, 1000, 1), row(2, 5000, 1)], { stock: 6000, trim: 10, kerf: 2, remnants: stock });
  let n = 0;
  const r = bookRemnants(stock, p, { minLength: 500, from: "Auftrag 7", date: "2026-11-10", id: () => "N" + ++n });
  assert.deepEqual(r.taken.map((x) => x.id), ["R1"]);
  // Rest von R1: 2500 − 10 − 1000 − 2 = 1488; neue Stange 6000 − 10 − 5000 − 2 = 988
  assert.deepEqual(r.added.map((x) => x.length).sort(), [1488, 988]);
  assert.ok(r.stock.some((x) => x.id === "R9"));
  assert.ok(!r.stock.some((x) => x.id === "R1"));
  assert.equal(r.added[0].from, "Auftrag 7");
  assert.equal(newRemnants(p, { minLength: 1000 }).length, 1);
});

test("Z1: Restlager in den Einstellungen geprüft, Seite druckbar", () => {
  assert.ok(SETTINGS.find((s) => s.key === "fertigung.restlager"));
  assert.equal(validateValue(settingDef("fertigung.restlager"), [{ id: "R1", profileId: "QR 40", length: 1200 }]).ok, true);
  assert.equal(validateRemnants([{ id: "R1", profileId: "QR 40", length: 0 }]).ok, false);
  assert.equal(validateRemnants([{ id: "R1", profileId: "QR 40", length: 10 }, { id: "R1", profileId: "QR 40", length: 10 }]).ok, false);
  const page = remnantPage([{ id: "R1", profileId: "QR 40", material: "S235", length: 1200, place: "Regal 3" }]);
  assert.match(page.html, /Regal 3/);
  const get = (k) => ({ "fertigung.restlager": [{ id: "R1" }], "fertigung.resteNutzen": false })[k];
  assert.deepEqual(barOptions(get).remnants, []);
});

import { ladeAbschnitte, ladePages, ladeCsv, fastenerKind, NO_SECTION } from "../src/core/ladeliste.js";

test("Z3: Ladeliste gruppiert nach Abschnitt, Gewicht und Verbindungsmittel je Abschnitt", () => {
  const pfosten = { name: "Pfosten", number: "P-1", qty: 1, mass: 5 }, gurt = { name: "Gurt", qty: 1, mass: 8 };
  const schraube = { name: "ISO 4017 M12x40 8.8", qty: 4, mass: 0.05, norm: true }, anker = { name: "Bolzenanker FAZ II 12/10", qty: 2, mass: 0.2, norm: true };
  const pos = { Pfosten: 1, Gurt: 2 };
  const s = ladeAbschnitte([
    { abschnitt: "Treppe EG", rows: [pfosten, schraube, anker] },
    { abschnitt: "Treppe EG ", rows: [pfosten, gurt] },
    { abschnitt: "", rows: [gurt] },
    { abschnitt: "Balkon OG", rows: [pfosten, schraube] },
  ], (r) => pos[r.name]);
  assert.deepEqual(s.map((g) => g.name), ["Treppe EG", "Balkon OG", NO_SECTION]);
  const eg = s[0];
  assert.deepEqual(eg.parts.map((p) => [p.pos, p.qty]), [[1, 2], [2, 1]]);
  assert.equal(eg.mass, 2 * 5 + 8 + 4 * 0.05 + 2 * 0.2);
  assert.deepEqual(eg.fasteners.map((f) => f.kind), ["Dübel/Anker", "Schraube"]);
  const pages = ladePages(s, { title: "Treppe", order: "2026-7" });
  assert.equal(pages.length, 4);
  assert.match(pages[0].html, /Lade- und Montageliste/);
  assert.match(pages[1].html, /Bolzenanker/);
  assert.match(pages[3].html, /Keine Normteile/);
  assert.match(ladeCsv(s), /"Treppe EG";"Schraube";;"ISO 4017 M12x40 8\.8";;4;0,2/);
  assert.equal(fastenerKind("ISO 7089 12"), "Scheibe");
  assert.equal(fastenerKind("ISO 4032 M12"), "Mutter");
});

import { partOps, progressOf, progressText, laufzettelPages, laufzettelQr } from "../src/core/laufzettel.js";

test("Z2: Arbeitsgänge aus dem Modell in Fertigungsreihenfolge", () => {
  const bodies = [
    { kind: "member", meta: { section: "QR 40x40x3", length: 1200, miterStart: 45, miterEnd: 45, drills: 2 } },
    { kind: "member", meta: { section: "QR 40x40x3", length: 1200, miterStart: 45, miterEnd: 45 } },
    { kind: "member", meta: { section: "RR 42,4x2", length: 900, contours: [{ kind: "bohrung" }] } },
    { kind: "solid", meta: { plate: { t: 10, holes: 4 } } },
    { kind: "solid", meta: { sheet: { t: 3, bends: [{ angle: 90 }, { angle: 90 }] } } },
    { kind: "solid", meta: { norm: { kind: "iso4017" } } },
  ];
  const ops = partOps(bodies, { finish: "duplex", welds: 6 });
  assert.deepEqual(ops.map((o) => o.op), ["Sägen", "Rohrlaser", "Laser/Brennen", "Bohren", "Kanten", "Schweißen", "Feuerverzinken", "Beschichten", "Kontrolle"]);
  assert.match(ops[0].detail, /2 × QR 40x40x3, L = 1\.200 mm, Gehrung 45° \/ 45°/);
  assert.match(ops.find((o) => o.op === "Laser/Brennen").detail, /2 Platten\/Blech, t = 3–10 mm, 4 Bohrungen/);
  assert.equal(ops.find((o) => o.op === "Bohren").detail, "2 Bohrungen am Profil");
  assert.equal(ops.find((o) => o.op === "Schweißen").detail, "6 Nähte laut Zeichnung");
  assert.deepEqual(partOps([], {}).map((o) => o.op), ["Kontrolle"]);
});

test("Z2: Fortschritt, QR-Text und Seiten", () => {
  const ops = [{ op: "Sägen", detail: "" }, { op: "Schweißen", detail: "" }, { op: "Kontrolle", detail: "" }];
  const p = progressOf(ops, { Sägen: "2026-11-10" });
  assert.deepEqual(p, { done: 1, total: 3, pct: 33, next: "Schweißen" });
  assert.equal(progressText(p), "1/3 · weiter: Schweißen");
  assert.equal(progressText(progressOf(ops, { Sägen: 1, Schweißen: 1, Kontrolle: 1 })), "✓ fertig");
  assert.equal(progressText(progressOf(ops, {})), "");
  assert.match(laufzettelQr({ order: "7", pos: 3, name: "Pfosten", qty: 4 }), /Auftrag 7\nPos 3 · Pfosten\n4 Stk/);
  const pages = laufzettelPages([{ pos: 3, name: "Pfosten", qty: 4, ops, done: { Sägen: "2026-11-10" }, image: "data:image/png;base64,AAAA" }], { order: "7" });
  assert.equal(pages.length, 1);
  assert.equal(pages[0].height, 148);
  assert.match(pages[0].html, /☑<\/td><td><b>Sägen/);
  assert.match(pages[0].html, /<img src="data:image\/png/);
  assert.match(pages[0].html, /<svg/);
});

import { einbauHtml, einbauMatch } from "../src/core/einbauort.js";

test("Z5: Einbauorte – Suche nach Pos, QR-Text und Name, Seite ohne Internet", () => {
  const it = { pos: 3, name: "Pfosten", number: "P-1", qty: 4, abschnitt: "Treppe EG" };
  assert.equal(einbauMatch(it, "3"), true);
  assert.equal(einbauMatch(it, "13"), false);
  assert.equal(einbauMatch(it, "Pos 3"), true);
  assert.equal(einbauMatch(it, "PBCAD Laufzettel\nAuftrag 7\nPos 3 · Pfosten\n4 Stk"), true);
  assert.equal(einbauMatch(it, "Auftrag 7\nPos 31 · Gurt"), false);
  assert.equal(einbauMatch(it, "treppe"), true);
  const html = einbauHtml([{ ...it, image: "data:image/png;base64,AAAA" }, { pos: 4, name: "Gurt", qty: 1, image: null }], { title: "Treppe", order: "7" });
  assert.match(html, /id="pos-3"/);
  assert.match(html, /Kein Bild/);
  assert.doesNotMatch(html, /<script src=|<link /);
});
