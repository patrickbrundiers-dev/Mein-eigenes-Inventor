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

const app = await electron.launch({ args: [".", "--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader"], env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" }, timeout: 60000 });
const errors = [];
const mainLog = [];
app.process().stdout?.on("data", (d) => mainLog.push(String(d)));
app.process().stderr?.on("data", (d) => mainLog.push(String(d)));
let win = null;
try {
  win = await app.firstWindow({ timeout: 60000 });
  win.on("pageerror", (e) => errors.push(String(e)));
  win.on("console", (m) => { errors.push(`[${m.type()}] ${m.text()}`); });
  try {
    await win.waitForFunction(() => window.__werkcad && window.werkcad, null, { timeout: 30000 });
  } catch (e) {
    const diag = await win.evaluate(() => ({ url: location.href, app: !!window.__werkcad, bridge: !!window.werkcad, body: document.body ? document.body.innerHTML.slice(0, 300) : null, ready: document.readyState })).catch((x) => String(x));
    check("Diagnose", false, JSON.stringify(diag));
    check("Konsole", false, errors.join(" | ").slice(0, 3000));
    await win.screenshot({ path: path.join(outDir, "electron-fehler.png") }).catch(() => {});
    throw e;
  }
  errors.length = 0;
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
  // Fehlerprotokoll im Benutzerordner
  const logFile = path.join(await app.evaluate(({ app: a }) => a.getPath("userData")), "protokoll", "werkcad.log");
  await win.evaluate(() => window.werkcad.log("warn", "rauchtest", "Testeintrag"));
  await win.waitForTimeout(300);
  const logText = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : "";
  check("Fehlerprotokoll geschrieben", /\[info\] start: WerkCAD /.test(logText) && /\[warn\] rauchtest: Testeintrag/.test(logText), logFile);
  // Benutzereinstellungen: getrennte Datei, gültige Werte wirken, Oberflächengröße über die Brücke
  {
    const prefsFile = path.join(await app.evaluate(({ app: a }) => a.getPath("userData")), "benutzereinstellungen.json");
    const r = await win.evaluate(() => { const p = window.__werkcad.prefs; const bad = p.set("skizze.fangradius", 0); p.set("skizze.fangradius", 11); p.set("darstellung.skalierung", 110); return { bad: bad.ok, zoom: window.devicePixelRatio }; });
    await win.waitForTimeout(400);
    const text = fs.existsSync(prefsFile) ? fs.readFileSync(prefsFile, "utf8") : "";
    const stored = text ? JSON.parse(text).values : {};
    await win.evaluate(() => window.__werkcad.prefs.reset());
    check("Benutzereinstellungen gespeichert", r.bad === false && stored["skizze.fangradius"] === 11 && stored["darstellung.skalierung"] === 110 && !/token/i.test(text), JSON.stringify({ r, stored }));
  }
  // Projektdatei: Speichern, beschädigte Datei mit Sicherung, fehlende Datei, Autosave ohne Größengrenze
  const tmp = fs.mkdtempSync(path.join((await import("node:os")).tmpdir(), "werkcad-smoke-"));
  const file = path.join(tmp, "Test.wcad");
  const saved = await win.evaluate((p) => window.werkcad.saveProject({ path: p, text: window.__werkcad.files.serialize() }), file);
  const savedPrj = JSON.parse(fs.readFileSync(file, "utf8"));
  await win.evaluate((p) => window.werkcad.saveProject({ path: p, text: window.__werkcad.files.serialize() }), file);
  check("Speichern atomar mit Sicherung", saved?.path === file && savedPrj.docs.length === 5 && fs.existsSync(file + ".bak") && !fs.readdirSync(tmp).some((f) => f.includes(".tmp")), fs.readdirSync(tmp).join(","));
  fs.writeFileSync(file, "{ kaputt");
  await win.evaluate(() => { window.__werkcad.dirty = false; window.__werkcad.newProject(); });
  await win.evaluate(() => { window.__werkcad.dirty = false; });
  const opening = win.evaluate((p) => window.__werkcad.files.open(p), file);
  await win.getByRole("button", { name: "Sicherung öffnen" }).click({ timeout: 10000 });
  await opening;
  const fromBak = await win.evaluate(() => ({ docs: window.__werkcad.project.docs.length, path: window.__werkcad.filePath, dirty: window.__werkcad.dirty }));
  check("Beschädigte Datei → Sicherung geöffnet", fromBak.docs === 5 && fromBak.path === null && fromBak.dirty === true, JSON.stringify(fromBak));
  await win.evaluate(() => { window.__werkcad.dirty = false; document.getElementById("toasts").innerHTML = ""; });
  await win.evaluate((p) => window.__werkcad.files.open(p), path.join(tmp, "fehlt.wcad"));
  const toastText = await win.$$eval("#toasts .toast", (els) => els.map((e) => e.textContent).join(" | "));
  check("Fehlende Datei → klare Meldung", /Datei nicht gefunden/.test(toastText), toastText);
  const big = await win.evaluate(async () => {
    const a = window.__werkcad;
    a.project.docs[0].description = "x".repeat(5e6);
    a.files.autosave();
    await new Promise((r) => setTimeout(r, 2500));
    const rec = await a.files.recovery();
    a.project.docs[0].description = "";
    a.dirty = false;
    return rec ? rec.project.docs[0].description.length : 0;
  });
  check("Autosave über 4,5 MB als Datei", big === 5e6, String(big));
  fs.rmSync(tmp, { recursive: true, force: true });
  const realErrors = errors.filter((e) => e.startsWith("[error]") || !e.startsWith("["));
  check("Keine Fehler in der Konsole", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));
  // Schließen ohne ungespeicherte Änderungen
  await win.evaluate(() => { window.__werkcad.dirty = false; });
} catch (e) {
  check("Abbruch", false, String(e.stack || e));
}
const closer = app.close().catch(() => {});
await Promise.race([closer, new Promise((r) => setTimeout(r, 8000))]);
try { app.process().kill("SIGKILL"); } catch { /* schon beendet */ }
fs.writeFileSync(path.join(outDir, "bericht.txt"), log.join("\n") + "\n\n--- Hauptprozess ---\n" + mainLog.join("").slice(-6000));
console.log("--- Hauptprozess ---\n" + mainLog.join("").slice(-4000));
process.exit(ok ? 0 : 1);
