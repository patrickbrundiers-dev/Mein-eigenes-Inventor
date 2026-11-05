// Lizenzprüfung (ADR-0009): Signatur, Rechnerbindung, Ablauf, Sperrliste, Testzeitraum
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const lz = require("../electron/lizenz.cjs");

// eigenes Schlüsselpaar nur für den Test (der echte private Schlüssel ist nicht im Repository)
const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const pub = publicKey.export({ format: "jwk" }).x;
const sign = (daten, key = privateKey) => {
  const head = "PBCAD1." + Buffer.from(JSON.stringify(daten)).toString("base64url");
  return head + "." + crypto.sign(null, Buffer.from(head), key).toString("base64url");
};
const T = Date.parse("2026-11-05T12:00:00Z");
const DAY = 86400000;
const base = { nr: "0001", name: "Max Muster", ausgestellt: "2026-11-05" };

test("gültiger Schlüssel, auch umbrochen und mit Kommentarzeilen", () => {
  const key = sign(base);
  assert.equal(lz.verify(key, { publicKey: pub, now: T }).ok, true);
  const wrapped = "# PBCAD-Lizenz für Max\n" + key.match(/.{1,40}/g).join("\r\n") + "\n";
  const r = lz.verify(wrapped, { publicKey: pub, now: T });
  assert.equal(r.ok, true);
  assert.equal(r.daten.name, "Max Muster");
});

test("falscher Schlüssel, Fälschung und Unsinn werden abgelehnt", () => {
  const other = crypto.generateKeyPairSync("ed25519").privateKey;
  assert.equal(lz.verify(sign(base, other), { publicKey: pub, now: T }).ok, false);
  const key = sign(base);
  const [p, d, s] = key.split(".");
  const forged = Buffer.from(JSON.stringify({ ...base, name: "Fremd" })).toString("base64url");
  assert.equal(lz.verify(`${p}.${forged}.${s}`, { publicKey: pub, now: T }).ok, false);
  assert.match(lz.verify("hallo", { publicKey: pub }).fehler, /kein PBCAD-Lizenzschlüssel/);
  assert.equal(lz.verify("", { publicKey: pub }).ok, false);
  assert.equal(lz.verify(key.slice(0, -4), { publicKey: pub, now: T }).ok, false);
  assert.equal(d.length > 0, true);
});

test("Rechnerbindung", () => {
  const id = lz.rechnerIdFrom("abc");
  assert.match(id, /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
  assert.equal(lz.rechnerIdFrom("abc"), id, "stabil");
  const key = sign({ ...base, rechner: id });
  assert.equal(lz.verify(key, { publicKey: pub, rechnerId: id, now: T }).ok, true);
  assert.equal(lz.verify(key, { publicKey: pub, rechnerId: id.toLowerCase().replace(/-/g, ""), now: T }).ok, true, "Schreibweise egal");
  assert.match(lz.verify(key, { publicKey: pub, rechnerId: lz.rechnerIdFrom("xyz"), now: T }).fehler, /anderen Rechner/);
});

test("Ablaufdatum gilt einschließlich des letzten Tags", () => {
  const key = sign({ ...base, bis: "2026-11-30" });
  assert.equal(lz.verify(key, { publicKey: pub, now: Date.parse("2026-11-30T23:00:00Z") }).ok, true);
  const r = lz.verify(key, { publicKey: pub, now: Date.parse("2026-12-01T00:00:01Z") });
  assert.equal(r.ok, false);
  assert.match(r.fehler, /30\.11\.2026 abgelaufen/);
  const st = lz.status({ key, now: Date.parse("2026-11-25T08:00:00Z"), publicKey: pub });
  assert.equal(st.state, "lizenziert");
  assert.equal(st.restTage, 6);
});

test("Sperrliste", () => {
  assert.match(lz.verify(sign(base), { publicKey: pub, now: T, sperrliste: ["0001"] }).fehler, /gesperrt/);
});

test("Testzeitraum: 30 Tage, danach gesperrt; zurückgestellte Uhr hilft nicht", () => {
  assert.equal(lz.status({ testBeginn: T, now: T }).state, "test");
  assert.equal(lz.status({ testBeginn: T, now: T }).restTage, 30);
  assert.equal(lz.status({ testBeginn: T, now: T + 29.5 * DAY }).restTage, 1);
  assert.equal(lz.status({ testBeginn: T, now: T + 30 * DAY }).state, "abgelaufen");
  assert.equal(lz.status({ testBeginn: T, now: T + 2 * DAY, zuletzt: T + 31 * DAY }).state, "abgelaufen");
  // ungültiger gespeicherter Schlüssel: Testzeitraum läuft weiter, Fehler wird gemeldet
  const st = lz.status({ key: "PBCAD1.x.y", testBeginn: T, now: T + DAY, publicKey: pub });
  assert.equal(st.state, "test");
  assert.ok(st.fehler);
  // gültige Lizenz schlägt den abgelaufenen Test
  assert.equal(lz.status({ key: sign(base), testBeginn: T - 90 * DAY, now: T, publicKey: pub }).state, "lizenziert");
});

test("eingebauter öffentlicher Schlüssel ist gültig, kein privater Schlüssel im Repository", () => {
  const k = crypto.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: lz.PUBLIC_KEY }, format: "jwk" });
  assert.equal(k.asymmetricKeyType, "ed25519");
  for (const f of ["electron/lizenz.cjs", "electron/main.cjs", "src/lizenz.js", "src/lizenz.html"]) {
    const text = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(text, /PRIVATE KEY|"d"\s*:/, f);
  }
});
