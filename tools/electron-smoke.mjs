// Rauchtest der Desktop-App (Electron): startet das Programm, prüft Brücke und Kern, macht ein Bildschirmfoto
import fs from "node:fs";
import path from "node:path";
import { _electron as electron } from "playwright-core";

const outDir = path.resolve(process.argv[2] || "electron-out");
fs.mkdirSync(outDir, { recursive: true });
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const log = [];
let ok = true;
const check = (name, cond, info = "") => { log.push(`${cond ? "✔" : "✘"} ${name} ${info}`); if (!cond) ok = false; console.log(log[log.length - 1]); };

const app = await electron.launch({ args: [".", "--no-sandbox"], env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" }, timeout: 60000 });
const errors = [];
try {
  const win = await app.firstWindow({ timeout: 60000 });
  win.on("pageerror", (e) => errors.push(String(e)));
  win.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await win.waitForFunction(() => window.__werkcad && window.werkcad, null, { timeout: 60000 });
  const version = await win.evaluate(() => window.werkcad.version);
  check("Brücke zum Hauptprozess", version === pkg.version, version);
  const settings = await win.evaluate(() => window.werkcad.getSettings());
  check("Einstellungen lesbar", settings && settings.version === pkg.version, JSON.stringify(settings));
  await win.evaluate(() => window.__werkcad.kernel.ready);
  check("Geometrie-Kern über app:// geladen", true);
  await win.evaluate(() => { window.__werkcad.dirty = false; return window.__werkcad.openExample(); });
  await win.waitForFunction(() => !window.__werkcad.busy && window.__werkcad.results.size >= 3, null, { timeout: 120000, polling: 250 });
  await win.waitForTimeout(800);
  const info = await win.evaluate(() => ({ mode: window.__werkcad.mode, bodies: [...window.__werkcad.results.values()].map((r) => r.bodies.length) }));
  check("Beispiel in der Desktop-App", info.mode === "assembly" && info.bodies.every((b) => b > 0), JSON.stringify(info));
  await win.screenshot({ path: path.join(outDir, "electron.png") });
  const title = await win.title();
  check("Fenstertitel", /WerkCAD/.test(title), title);
  check("Keine Fehler in der Konsole", errors.length === 0, errors.slice(0, 3).join(" | "));
  // Schließen ohne ungespeicherte Änderungen
  await win.evaluate(() => { window.__werkcad.dirty = false; });
} catch (e) {
  check("Abbruch", false, String(e.stack || e));
}
const closer = app.close().catch(() => {});
await Promise.race([closer, new Promise((r) => setTimeout(r, 8000))]);
try { app.process().kill("SIGKILL"); } catch { /* schon beendet */ }
fs.writeFileSync(path.join(outDir, "bericht.txt"), log.join("\n") + "\n");
process.exit(ok ? 0 : 1);
