// Lizenzprüfung (ADR-0009): signierte Lizenzschlüssel (Ed25519). In PBCAD steht nur der öffentliche Schlüssel,
// Lizenzen erstellen kann nur, wer den privaten Schlüssel hat (Lizenz-Werkzeug bei Patrick, nicht im Repository).
// Schlüssel: »PBCAD1.<Daten base64url>.<Signatur base64url>«, signiert wird der Text vor dem zweiten Punkt.
// Ohne gültige Lizenz läuft PBCAD TESTTAGE Tage als Testversion, danach nur noch der Lizenz-Bildschirm.
const crypto = require("node:crypto");

const PREFIX = "PBCAD1";
const TESTTAGE = 30;
const TAG = 86400000;
// Öffentlicher Schlüssel (Ed25519, roh, base64url). Der passende private Schlüssel liegt nur im Lizenz-Werkzeug.
const PUBLIC_KEY = "FNxd_pdkIC0pfFaAM3CBd0NzhdE-lLXxNwKe3M7mX-I";
// Gesperrte Lizenznummern (z. B. weitergegebene Schlüssel). Wirkt ab dem nächsten Update.
const SPERRLISTE = [];

const keyObject = (x) => crypto.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x }, format: "jwk" });
const b64 = (s) => Buffer.from(s, "base64url");

/** Lizenztext bereinigen: Kommentarzeilen (#) und Leerraum weg, damit umbrochene oder kopierte Schlüssel gehen */
function normalize(text) {
  return String(text || "").split(/\r?\n/).filter((l) => !l.trim().startsWith("#")).join("").replace(/\s+/g, "");
}

const normId = (id) => String(id || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
const day = (d) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? Date.parse(d + "T00:00:00Z") : NaN);

/**
 * Schlüssel prüfen. Ergebnis { ok, daten } oder { ok:false, fehler }.
 * daten: { nr, name, firma?, email?, ausgestellt, bis? (JJJJ-MM-TT, einschließlich), rechner? }
 */
function verify(text, { publicKey = PUBLIC_KEY, rechnerId = "", now = Date.now(), sperrliste = SPERRLISTE } = {}) {
  const key = normalize(text);
  if (!key) return { ok: false, fehler: "Kein Lizenzschlüssel eingegeben." };
  const parts = key.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) return { ok: false, fehler: "Das ist kein PBCAD-Lizenzschlüssel (er beginnt mit »PBCAD1.«)." };
  let echt = false;
  try { echt = crypto.verify(null, Buffer.from(parts[0] + "." + parts[1]), keyObject(publicKey), b64(parts[2])); } catch { echt = false; }
  if (!echt) return { ok: false, fehler: "Der Lizenzschlüssel ist ungültig oder unvollständig kopiert." };
  let daten;
  try { daten = JSON.parse(b64(parts[1]).toString("utf8")); } catch { return { ok: false, fehler: "Der Lizenzschlüssel ist beschädigt." }; }
  if (!daten || typeof daten !== "object" || !daten.nr || !daten.name) return { ok: false, fehler: "Der Lizenzschlüssel ist beschädigt." };
  if (sperrliste.includes(String(daten.nr))) return { ok: false, fehler: `Lizenz ${daten.nr} wurde gesperrt.`, daten };
  if (daten.rechner && normId(daten.rechner) !== normId(rechnerId)) {
    return { ok: false, fehler: `Diese Lizenz gilt für einen anderen Rechner (${daten.rechner}). Rechner-ID hier: ${rechnerId || "unbekannt"}.`, daten };
  }
  if (daten.bis) {
    const end = day(daten.bis);
    if (!Number.isFinite(end)) return { ok: false, fehler: "Der Lizenzschlüssel ist beschädigt." };
    if (now >= end + TAG) return { ok: false, fehler: `Die Lizenz ist am ${deDate(daten.bis)} abgelaufen.`, daten, abgelaufen: true };
  }
  return { ok: true, daten };
}

const deDate = (iso) => (typeof iso === "string" ? iso.slice(0, 10).split("-").reverse().join(".") : "");

/**
 * Gesamtzustand aus gespeichertem Schlüssel und Testbeginn.
 * state: "lizenziert" | "test" | "abgelaufen". testBeginn/zuletzt als Zeitstempel (ms).
 * Zurückgestellte Uhr: es zählt die spätere Zeit von jetzt und »zuletzt gesehen«.
 */
function status({ key, testBeginn, zuletzt = 0, now = Date.now(), rechnerId = "", publicKey, sperrliste } = {}) {
  const t = Math.max(now, zuletzt || 0);
  let pruefung = null;
  if (key) {
    pruefung = verify(key, { publicKey, rechnerId, now: t, sperrliste });
    if (pruefung.ok) {
      const d = pruefung.daten;
      const restTage = d.bis ? Math.max(0, Math.ceil((day(d.bis) + TAG - t) / TAG)) : null;
      return { state: "lizenziert", daten: d, restTage, rechnerId };
    }
  }
  const beginn = Number.isFinite(testBeginn) ? testBeginn : t;
  const restTage = Math.max(0, TESTTAGE - Math.floor((t - beginn) / TAG));
  return { state: restTage > 0 ? "test" : "abgelaufen", restTage, testTage: TESTTAGE, rechnerId, fehler: pruefung?.fehler || null };
}

/** Rechner-ID aus einer Kennung des Rechners (Windows: MachineGuid), 16 Zeichen in Vierergruppen */
function rechnerIdFrom(kennung) {
  const h = crypto.createHash("sha256").update("pbcad-rechner|" + String(kennung)).digest("hex").slice(0, 16).toUpperCase();
  return h.match(/.{4}/g).join("-");
}

function machineKennung() {
  const os = require("node:os");
  if (process.platform === "win32") {
    try {
      const out = require("node:child_process").execFileSync("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"], { encoding: "utf8", windowsHide: true, timeout: 5000 });
      const m = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/);
      if (m) return m[1].toLowerCase();
    } catch { /* Ersatzkennung unten */ }
  }
  try { const id = require("node:fs").readFileSync("/etc/machine-id", "utf8").trim(); if (id) return id; } catch { /* */ }
  return [os.hostname(), os.platform(), os.arch(), os.cpus()[0]?.model || ""].join("|");
}

let cachedId = null;
const rechnerId = () => (cachedId ??= rechnerIdFrom(machineKennung()));

module.exports = { PREFIX, TESTTAGE, PUBLIC_KEY, SPERRLISTE, normalize, verify, status, rechnerIdFrom, rechnerId, deDate };
