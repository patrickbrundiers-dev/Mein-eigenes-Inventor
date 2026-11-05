// Einstellungsseiten wie SolidCraft: 3D-Maus-Berichte, neue Einstellungen, Bemaßen nur neuer Formen
import test from "node:test";
import assert from "node:assert/strict";
import { parseReport, motion, isMoving, NULL_STATE } from "../src/core/maus3d.js";
import { SETTINGS, validateValue, defaultSettings, CATEGORIES } from "../src/core/settings.js";
import { autoDimension } from "../src/core/autodim.js";

const le = (...v) => { const b = new Uint8Array(v.length * 2); v.forEach((x, i) => { const u = x < 0 ? x + 0x10000 : x; b[2 * i] = u & 255; b[2 * i + 1] = u >> 8; }); return b; };

test("3D-Maus: Berichte 1/2/3 und kombinierter Bericht", () => {
  let s = parseReport(1, le(100, -200, 30));
  assert.deepEqual(s.t, [100, -200, 30]);
  assert.deepEqual(s.r, [0, 0, 0]);
  s = parseReport(2, le(-5, 6, -350), s);
  assert.deepEqual(s.t, [100, -200, 30]);
  assert.deepEqual(s.r, [-5, 6, -350]);
  s = parseReport(1, le(1, 2, 3, 4, 5, 6));
  assert.deepEqual(s.r, [4, 5, 6]);
  s = parseReport(3, new Uint8Array([3, 0]), s);
  assert.equal(s.buttons, 3);
});

test("3D-Maus: Totzone, Modus, stärkste Achse, Umkehren, Skizze nur schwenken", () => {
  assert.equal(isMoving(motion({ t: [10, -10, 5], r: [8, 0, 0], buttons: 0 })), false, "kleine Auslenkung in der Totzone");
  const full = { t: [350, 0, 0], r: [0, 0, 350], buttons: 0 };
  const m = motion(full);
  assert.ok(m.pan[0] > 0 && m.turn[0] > 0);
  assert.equal(motion(full, { mode: "drehen" }).pan[0], 0);
  assert.equal(motion(full, { mode: "schwenken" }).turn[0], 0);
  assert.equal(motion(full, { sketch: true }).turn[0], 0);
  assert.ok(motion(full, { invert: { pan: true } }).pan[0] < 0);
  const dom = motion({ t: [200, 0, 0], r: [0, 0, 350], buttons: 0 }, { dominant: true });
  assert.equal(dom.pan[0], 0); assert.ok(dom.turn[0] > 0);
  // Kalibrierung verschiebt den Nullpunkt
  assert.equal(isMoving(motion({ t: [60, 0, 0], r: [0, 0, 0] }, { cal: { t: [60, 0, 0], r: [0, 0, 0] } })), false);
  assert.ok(motion(full, { sens: 2 }).pan[0] > m.pan[0]);
});

test("Neue Einstellungen: Standardwerte gültig, Kategorie 3D-Maus, Texttyp und Kalibrierung geprüft", () => {
  const d = defaultSettings();
  for (const k of ["ansicht.schwenkenUmkehrenH", "ansicht.sanftZoomen", "ansicht.trackpadSchwenken", "ansicht.zoomStopp", "ansicht.animTempo", "ansicht.einpassenGroesse", "ansicht.einpassenWuerfel",
    "grafik.voreinstellung", "grafik.supersampling", "grafik.bodenschatten", "grafik.rasterSeite", "skizze.ziehenLinie", "skizze.vollBemassen", "skizze.flaecheProjizieren", "skizze.symboleZoom",
    "skizze.konfliktfarbe", "skizze.bemassungEingabe", "skizze.schrittLaenge", "skizze.schrittWinkel", "auswahl.klick", "auswahl.umschalt", "kernel.koerperpruefung", "dateien.maxImportMB",
    "dateien.importAusrichtung", "messen.achsabstaende", "baugruppe.drehSchrittNah", "baugruppe.schiebeSchritt", "darstellung.schrift", "oberflaeche.panels", "maus3d.empfindlichkeit", "maus3d.tasteLinks"]) {
    const def = SETTINGS.find((s) => s.key === k);
    assert.ok(def, k);
    assert.ok(validateValue(def, d[k]).ok, k);
  }
  assert.ok(CATEGORIES.some((c) => c.id === "maus3d"));
  const text = SETTINGS.find((s) => s.key === "darstellung.schriftEigen");
  assert.equal(validateValue(text, " Calibri ").value, "Calibri");
  assert.equal(validateValue(text, 'x"; }').ok, false);
  const cal = SETTINGS.find((s) => s.key === "maus3d.kalibrierung");
  assert.ok(validateValue(cal, { t: [1, 2, 3], r: [0, 0, 0] }).ok);
  assert.equal(validateValue(cal, { t: [1, 2], r: [0, 0, 0] }).ok, false);
});

test("Vollständig bemaßen nur für neue Formen (opts.only)", () => {
  const sk = { id: "s", points: [{ id: "O", x: 0, y: 0, origin: true }, { id: "a", x: 0, y: 0 }, { id: "b", x: 50, y: 0 }, { id: "c", x: 10, y: 10 }, { id: "d", x: 30, y: 25 }],
    entities: [{ id: "alt", type: "line", p1: "a", p2: "b" }, { id: "neu", type: "line", p1: "c", p2: "d" }], constraints: [{ id: "f", type: "fix", p: "a", x: 0, y: 0 }] };
  const r = autoDimension(sk, {}, { only: ["neu"], kinds: { radius: true, length: true, angle: false, position: false } });
  assert.ok(r.constraints.length >= 1);
  assert.ok(r.constraints.every((c) => c.e !== "alt"));
});
