// Übernahmen aus der Rohrlaser-Kalkulation (docs/roadmap/rohrlaser-editor-abgleich.md) – ohne Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { profileMatches, parseProfileId, resolveProfile } from "../src/core/profilesearch.js";

const ids = (t, kinds) => profileMatches(t, kinds).map((e) => e.id);

test("Profil-Treffer: doppelte Maße dürfen fehlen, gleiche Maße zuerst", () => {
  assert.equal(ids("40x3")[0], "QR 40x40x3");
  assert.equal(ids("40x40x3")[0], "QR 40x40x3");
  assert.equal(ids("60*40*3")[0], "RE 60x40x3");
  assert.equal(ids("42,4x2,6")[0], "RR 42,4x2,6");
  assert.ok(ids("40").includes("RE 40x20x2"), "Maße am Anfang");
});
test("Profil-Treffer: Kürzel vorne muss passen, Arten begrenzbar", () => {
  assert.ok(ids("qr 40").every((x) => x.startsWith("QR 40x40")));
  assert.ok(ids("rr").every((x) => x.startsWith("RR ")));
  assert.deepEqual(ids("RR 40", ["vierkant", "rechteck"]), []);
  assert.deepEqual(ids(""), []);
});
test("Profil-ID lesen, auch ohne Normgröße", () => {
  assert.deepEqual(parseProfileId("RE 70x50x4"), { kind: "rechteck", dims: { B: "70", H: "50", t: "4", r: "8" } });
  assert.deepEqual(parseProfileId("RR 42,4x2"), { kind: "rohr", dims: { D: "42.4", t: "2" } });
  assert.deepEqual(parseProfileId("QR 50x50x4"), { kind: "vierkant", dims: { B: "50", t: "4", r: "8" } });
  assert.equal(parseProfileId("QR 40x30x3").kind, "rechteck");
  assert.deepEqual(parseProfileId("FL 8x40").dims, { B: "40", t: "8" });
  assert.equal(parseProfileId("RE 70x50"), null);
  assert.equal(parseProfileId("XY 20"), null);
  assert.equal(parseProfileId("RR 0x2"), null);
});
test("Eingabe auflösen: genau, Profil-ID, eindeutiger Treffer, sonst Fehler", () => {
  assert.equal(resolveProfile("qr 40x40x3").id, "QR 40x40x3");
  assert.equal(resolveProfile("40x3").id, "QR 40x40x3");
  assert.equal(resolveProfile("RE 70x50x4").id, "RE 70x50x4");
  assert.match(resolveProfile("qr 40").error, /Mehrdeutig/);
  assert.match(resolveProfile("xyz").error, /Kein Profil/);
  assert.match(resolveProfile("RR 40x2", ["vierkant", "rechteck"]).error, /nicht möglich/);
  assert.match(resolveProfile("  ").error, /Keine Eingabe/);
});
