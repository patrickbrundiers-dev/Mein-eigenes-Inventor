// PBCAD – Electron-Hauptprozess
const { app, BrowserWindow, protocol, ipcMain, dialog, shell, Menu, safeStorage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const updater = require("./updater.cjs");
const log = require("./log.cjs");
const { rotateBackups, backupCount } = require("./backups.cjs");
const recent = require("./recent.cjs");
const versionen = require("./versionen.cjs");
const teilebibliothek = require("./teilebibliothek.cjs");

// Benutzerdaten bleiben nach der Umbenennung WerkCAD → PBCAD im bisherigen Ordner %APPDATA%\WerkCAD
// (Einstellungen, Token, automatische Sicherung, Fehlerprotokoll). Muss vor allem anderen gesetzt werden.
app.setPath("userData", path.join(app.getPath("appData"), "WerkCAD"));

// Falls die Grafikkarte nicht nutzbar ist (Remotedesktop, alte Treiber): Software-WebGL erlauben
app.commandLine.appendSwitch("enable-unsafe-swiftshader");

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
]);

const DIST = path.join(__dirname, "..", "dist");
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm", ".map": "application/json", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
};

let win = null;
let allowClose = false;
let pendingFile = findProjectArg(process.argv);

// ---------- Einstellungen ----------
const settingsFile = () => path.join(app.getPath("userData"), "einstellungen.json");
function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), "utf8")); } catch { return {}; }
}
function writeSettings(s) {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  // wie Projektdateien: Absturz beim Schreiben darf Token und »Zuletzt geöffnet« nicht löschen
  atomicWrite(settingsFile(), JSON.stringify(s, null, 2), { backup: false });
}
function getToken() {
  const s = readSettings();
  if (!s.token) return "";
  try { return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(s.token, "base64")) : ""; } catch { return ""; }
}
function addRecent(p) {
  const s = readSettings();
  s.recent = recent.addRecent(s.recent, p);
  writeSettings(s);
  app.addRecentDocument?.(p);
}
function findProjectArg(argv) {
  return argv.slice(1).find((a) => /\.wcad$/i.test(a) && fs.existsSync(a)) || null;
}

// ---------- Fenster ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1480, height: 920, minWidth: 1000, minHeight: 640, show: false,
    backgroundColor: "#e8edf1", title: "PBCAD",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  Menu.setApplicationMenu(null);
  win.once("ready-to-show", () => { win.maximize(); win.show(); });
  win.loadURL("app://werkcad/index.html");
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type === "keyDown" && (input.key === "F12" || (input.control && input.shift && input.key.toLowerCase() === "i"))) win.webContents.toggleDevTools();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.on("close", (e) => {
    if (allowClose) return;
    e.preventDefault();
    win.webContents.send("app:close-request");
  });
  win.webContents.on("render-process-gone", (_e, d) => {
    log.write("error", "oberflaeche", `Prozess beendet: ${d.reason} (Code ${d.exitCode})`);
    if (d.reason !== "clean-exit") recoverWindow(d.reason);
  });
  win.on("unresponsive", () => { log.write("warn", "oberflaeche", "Fenster reagiert nicht"); askUnresponsive(); });
  win.on("responsive", () => { if (hangAsk) { hangAsk.abort(); hangAsk = null; log.write("info", "oberflaeche", "Fenster reagiert wieder"); } });
  updater.init(win, getToken, readSettings);
}
// Oberfläche abgestürzt (z. B. zu wenig Speicher): ohne Neuladen bliebe ein leeres Fenster, das sich nicht schließen lässt
// (Schließen fragt die Oberfläche nach ungespeicherten Änderungen). Neu laden; der Start bietet die automatische Sicherung an.
let crashTimes = [], expectGone = false;
function recoverWindow(reason) {
  if (!win || win.isDestroyed()) return;
  if (expectGone) { expectGone = false; return; }
  const now = Date.now();
  crashTimes = [...crashTimes.filter((t) => now - t < 60000), now];
  if (crashTimes.length > 2) {
    // Absturzschleife: nicht endlos neu laden
    allowClose = true;
    dialog.showMessageBox(win, { type: "error", title: "PBCAD", message: "Die Oberfläche ist wiederholt abgestürzt.", detail: `Grund: ${reason}. PBCAD wird beendet. Beim nächsten Start wird die automatische Sicherung angeboten. Das Fehlerprotokoll liegt in ${log.dir()}.`, buttons: ["Beenden"] })
      .finally(() => app.quit());
    return;
  }
  dialog.showMessageBox(win, { type: "warning", title: "PBCAD", message: "Die Oberfläche ist abgestürzt und wird neu geladen.", detail: `Grund: ${reason}. Die letzte automatische Sicherung wird beim Neustart angeboten.`, buttons: ["Neu laden"] })
    .finally(() => { if (win && !win.isDestroyed()) win.webContents.reload(); });
}
// Fenster hängt (lange Rechnung im Oberflächen-Thread): Warten, neu laden oder beenden anbieten – sonst ließe es sich nicht schließen
let hangAsk = null;
function askUnresponsive() {
  if (!win || win.isDestroyed() || hangAsk) return;
  hangAsk = new AbortController();
  dialog.showMessageBox(win, { type: "warning", title: "PBCAD", message: "PBCAD reagiert gerade nicht.", detail: "Eine Berechnung dauert lange. Warten, oder neu laden (die letzte automatische Sicherung wird angeboten).", buttons: ["Warten", "Neu laden", "Beenden"], defaultId: 0, cancelId: 0, signal: hangAsk.signal })
    .then(({ response }) => {
      hangAsk = null;
      if (!win || win.isDestroyed()) return;
      log.write("info", "oberflaeche", `Hänger: ${["gewartet", "neu geladen", "beendet"][response]}`);
      if (response === 1) {
        // hängender Prozess lädt nicht von selbst neu: erst beenden (ohne Absturz-Rückfrage), dann neu laden
        expectGone = true;
        win.webContents.forcefullyCrashRenderer();
        win.webContents.reload();
      }
      if (response === 2) { allowClose = true; app.quit(); }
    })
    .catch(() => { hangAsk = null; });
}
app.on("child-process-gone", (_e, d) => { if (d.reason !== "clean-exit") log.write("warn", "prozess", `${d.type}${d.name ? " (" + d.name + ")" : ""} beendet: ${d.reason} (Code ${d.exitCode})`); });
// nur mitschreiben, das Standardverhalten bei Ausnahmen bleibt unverändert
process.on("uncaughtExceptionMonitor", (e) => log.write("error", "hauptprozess", e?.stack || e));

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on("second-instance", (_e, argv) => {
    const f = findProjectArg(argv);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      if (f) win.webContents.send("app:open-file", f);
    }
  });
  app.whenReady().then(() => {
    log.init(path.join(app.getPath("userData"), "protokoll"));
    log.write("info", "start", `PBCAD ${app.getVersion()} · Electron ${process.versions.electron} · ${os.platform()} ${os.release()} ${os.arch()}`);
    protocol.handle("app", async (req) => {
      const url = new URL(req.url);
      let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
      const file = path.normalize(path.join(DIST, rel));
      if (!file.startsWith(DIST)) return new Response("Verboten", { status: 403 });
      try {
        const data = await fs.promises.readFile(file);
        return new Response(data, { headers: { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" } });
      } catch {
        return new Response("Nicht gefunden", { status: 404 });
      }
    });
    createWindow();
  });
  app.on("window-all-closed", () => app.quit());
}

// ---------- IPC ----------
const lastDir = (key, p) => {
  const s = readSettings();
  if (p) { s.dirs = { ...(s.dirs || {}), [key]: path.dirname(p) }; writeSettings(s); return; }
  return s.dirs?.[key] || app.getPath("documents");
};
function atomicWrite(file, data, { backup = true, keep = 1 } = {}) {
  const tmp = file + ".tmp" + process.pid;
  // erst vollständig auf die Platte, dann umbenennen – ein Absturz hinterlässt nie eine halbe Datei
  const fd = fs.openSync(tmp, "w");
  try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  if (backup) rotateBackups(file, keep);
  try { fs.renameSync(tmp, file); } catch (e) { try { fs.unlinkSync(tmp); } catch { /* */ } throw e; }
}
// Projektdatei lesen; Fehler als Text zurück, damit die Oberfläche eine verständliche Meldung zeigen kann
function readProjectFile(p) {
  const bak = p + ".bak";
  const backup = fs.existsSync(bak) ? { time: fs.statSync(bak).mtimeMs } : null;
  try {
    const text = fs.readFileSync(p, "utf8");
    // Speichern schreibt eine Temp-Datei im Ordner und benennt um: Ordner muss beschreibbar sein und die
    // Datei darf nicht von einem anderen Programm gesperrt sein (r+ öffnet ohne zu ändern)
    let readOnly = false;
    try {
      fs.accessSync(path.dirname(p), fs.constants.W_OK);
      fs.closeSync(fs.openSync(p, "r+"));
    } catch { readOnly = true; }
    return { path: p, text, backup, readOnly };
  } catch (e) {
    const why = e.code === "ENOENT" ? "Datei nicht gefunden" : e.code === "EACCES" || e.code === "EPERM" ? "Kein Zugriff (gesperrt oder schreibgeschützt)" : e.message;
    return { path: p, error: why, backup };
  }
}
const isProjectPath = (p) => typeof p === "string" && /\.wcad$/i.test(p);
// Automatische Sicherung als Datei im Benutzerordner (keine Größengrenze wie localStorage)
const autosaveFile = () => path.join(app.getPath("userData"), "wiederherstellung", "autosave.json");

// Benutzereinstellungen (Ansicht, Skizze …) getrennt von Token/Update-Daten. Inhalt prüft die Oberfläche (src/core/settings.js).
const prefsFile = () => path.join(app.getPath("userData"), "benutzereinstellungen.json");
ipcMain.on("prefs:read-sync", (e) => {
  let text = null;
  try { text = fs.readFileSync(prefsFile(), "utf8"); } catch { /* noch keine */ }
  if (text !== null) {
    try { JSON.parse(text); } catch {
      // beschädigt: aufbewahren, damit nichts verloren geht; Oberfläche nimmt Standardwerte
      try { fs.copyFileSync(prefsFile(), prefsFile().replace(/\.json$/, `.defekt-${Date.now()}.json`)); } catch { /* */ }
      log.write("warn", "einstellungen", "Einstellungsdatei beschädigt, Standardwerte verwendet");
    }
  }
  e.returnValue = text;
});
ipcMain.handle("prefs:write", (_e, text) => {
  if (typeof text !== "string" || text.length > 1e6) throw new Error("Ungültige Einstellungen");
  JSON.parse(text);
  fs.mkdirSync(path.dirname(prefsFile()), { recursive: true });
  atomicWrite(prefsFile(), text);
  return true;
});

ipcMain.handle("app:version", () => app.getVersion());
ipcMain.on("log:write", (_e, { level, source, message } = {}) => {
  log.write(["error", "warn", "info"].includes(level) ? level : "info", String(source || "oberflaeche").slice(0, 40), message);
});
ipcMain.handle("log:openFolder", () => (log.dir() ? shell.openPath(log.dir()) : "kein Protokollordner"));
ipcMain.on("app:version-sync", (e) => { e.returnValue = app.getVersion(); });
ipcMain.handle("app:initialFile", () => { const f = pendingFile; pendingFile = null; return f; });
ipcMain.on("app:close-confirmed", (_e, ok) => { if (ok) { allowClose = true; win.close(); } });
ipcMain.on("app:title", (_e, t) => win && win.setTitle(String(t)));
// Startbildschirm: zuletzt geöffnete Projekte mit Änderungsdatum, Größe und Vorschaubild
const previewDir = () => path.join(app.getPath("userData"), "vorschau");
const inRecent = (p) => typeof p === "string" && (readSettings().recent || []).includes(p);
ipcMain.handle("recent:list", () => recent.recentEntries(readSettings().recent, previewDir()));
ipcMain.handle("recent:remove", (_e, p) => {
  const s = readSettings();
  s.recent = recent.removeRecent(s.recent, p);
  writeSettings(s);
  return true;
});
ipcMain.handle("recent:reveal", (_e, p) => { if (inRecent(p)) shell.showItemInFolder(p); return inRecent(p); });
// Eigene Teilebibliothek: Einträge als JSON im Benutzerordner
const libraryDir = () => path.join(app.getPath("userData"), "teilebibliothek");
ipcMain.handle("library:list", () => { try { return teilebibliothek.list(libraryDir()); } catch (e) { log.write("warn", "bibliothek", e.message); return []; } });
ipcMain.handle("library:write", (_e, entry) => teilebibliothek.write(libraryDir(), entry));
ipcMain.handle("library:delete", (_e, id) => teilebibliothek.remove(libraryDir(), id));
ipcMain.handle("library:openFolder", () => { fs.mkdirSync(libraryDir(), { recursive: true }); return shell.openPath(libraryDir()); });
ipcMain.handle("preview:write", (_e, { path: p, url } = {}) => {
  try { return recent.writePreview(previewDir(), p, url); } catch (e) { log.write("warn", "vorschau", e.message); return false; }
});

// Standardordner aus den Benutzereinstellungen (allgemein.ordner), sonst zuletzt benutzter Ordner
const startDir = (dir) => (typeof dir === "string" && dir && fs.existsSync(dir) && fs.statSync(dir).isDirectory() ? dir : lastDir("project"));
ipcMain.handle("dialog:folder", async (_e, { dir } = {}) => {
  const r = await dialog.showOpenDialog(win, { title: "Ordner wählen", defaultPath: startDir(dir), properties: ["openDirectory", "createDirectory"] });
  return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
});
ipcMain.handle("project:open", async (_e, { dir } = {}) => {
  const r = await dialog.showOpenDialog(win, { title: "Projekt öffnen", defaultPath: startDir(dir), filters: [{ name: "PBCAD-Projekt", extensions: ["wcad"] }], properties: ["openFile"] });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  lastDir("project", p);
  addRecent(p);
  return readProjectFile(p);
});
ipcMain.handle("project:read", async (_e, p) => {
  const r = readProjectFile(p);
  if (!r.error) addRecent(p);
  return r;
});
// Verknüpfte Bauteil-Datei lesen (M24): nur .wcad, nicht in »Zuletzt geöffnet«
ipcMain.handle("link:read", async (_e, p) => {
  if (!isProjectPath(p)) return { path: p, error: "Keine PBCAD-Projektdatei" };
  try { return { path: p, text: fs.readFileSync(p, "utf8"), time: fs.statSync(p).mtimeMs }; }
  catch (e) { return { path: p, error: e.code === "ENOENT" ? "Datei nicht gefunden" : e.message }; }
});
ipcMain.handle("project:readBackup", async (_e, p) => {
  if (!isProjectPath(p)) return null;
  try { return { path: p, text: fs.readFileSync(p + ".bak", "utf8") }; } catch (e) { return { path: p, error: e.message }; }
});
ipcMain.handle("autosave:write", async (_e, { time, path: p, json }) => {
  const file = autosaveFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  atomicWrite(file, JSON.stringify({ time, path: p || null, json }), { backup: false });
  return true;
});
ipcMain.handle("autosave:read", async () => {
  try { return JSON.parse(fs.readFileSync(autosaveFile(), "utf8")); } catch { return null; }
});
ipcMain.handle("project:save", async (_e, { path: p, text, defaultName, backups, dir }) => {
  let file = p;
  if (!file) {
    const r = await dialog.showSaveDialog(win, { title: "Projekt speichern", defaultPath: path.join(startDir(dir), defaultName || "Projekt.wcad"), filters: [{ name: "PBCAD-Projekt", extensions: ["wcad"] }] });
    if (r.canceled || !r.filePath) return null;
    file = r.filePath;
  }
  atomicWrite(file, text, { keep: backupCount(backups) });
  lastDir("project", file);
  addRecent(file);
  return { path: file };
});
// Versionen mit Notiz (FU6) neben der Projektdatei
ipcMain.handle("versions:list", async (_e, p) => (isProjectPath(p) ? versionen.listVersions(p) : []));
ipcMain.handle("versions:save", async (_e, { path: p, text, note, changes }) => {
  if (!isProjectPath(p)) return { error: "Keine PBCAD-Projektdatei" };
  try { return versionen.saveVersion(p, { text, note, changes }); } catch (e) { return { error: e.message }; }
});
ipcMain.handle("versions:read", async (_e, { path: p, n }) => {
  if (!isProjectPath(p)) return { error: "Keine PBCAD-Projektdatei" };
  try { return { text: versionen.readVersion(p, n) }; } catch (e) { return { error: e.code === "ENOENT" ? "Versionsdatei nicht gefunden" : e.message }; }
});
ipcMain.handle("file:save", async (_e, { defaultName, filters, data, binary, siblings }) => {
  const r = await dialog.showSaveDialog(win, { title: "Exportieren", defaultPath: path.join(lastDir("export"), defaultName || "Export"), filters: filters || [] });
  if (r.canceled || !r.filePath) return null;
  const buf = binary ? Buffer.from(new Uint8Array(data)) : Buffer.from(String(data), "utf8");
  fs.writeFileSync(r.filePath, buf);
  // Begleitdateien mit gleichem Namen daneben (z. B. Zuschnittliste zur STEP-Datei)
  const base = r.filePath.replace(/\.[^.\\/]+$/, "");
  const siblingErrors = [];
  for (const s of siblings || []) {
    if (typeof s.suffix !== "string" || /[\\/]|\.\./.test(s.suffix)) { siblingErrors.push("ungültiger Dateiname"); continue; }
    try {
      fs.writeFileSync(base + s.suffix, typeof s.data === "string" ? Buffer.from(s.data, "utf8") : Buffer.from(new Uint8Array(s.data)));
    } catch (e) {
      siblingErrors.push(path.basename(base + s.suffix) + ": " + (e.code || e.message));
    }
  }
  lastDir("export", r.filePath);
  return { path: r.filePath, siblingErrors };
});
ipcMain.handle("file:saveMany", async (_e, { files }) => {
  const r = await dialog.showOpenDialog(win, { title: "Zielordner wählen", defaultPath: lastDir("export"), properties: ["openDirectory", "createDirectory"] });
  if (r.canceled || !r.filePaths[0]) return null;
  const dir = r.filePaths[0];
  for (const f of files) fs.writeFileSync(path.join(dir, f.name), typeof f.data === "string" ? f.data : Buffer.from(new Uint8Array(f.data)));
  lastDir("export", path.join(dir, "x"));
  return { dir };
});
ipcMain.handle("file:open", async (_e, { filters }) => {
  const r = await dialog.showOpenDialog(win, { title: "Datei öffnen", defaultPath: lastDir("import"), filters, properties: ["openFile"] });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  lastDir("import", p);
  const binary = /\.stl$/i.test(p);
  const buf = fs.readFileSync(p);
  return { path: p, name: path.basename(p), binary, data: binary ? buf.toString("base64") : buf.toString("utf8") };
});
ipcMain.handle("pdf:print", async (_e, { svg, width, height, name }) => {
  const r = await dialog.showSaveDialog(win, { title: "PDF speichern", defaultPath: path.join(lastDir("export"), name || "Zeichnung.pdf"), filters: [{ name: "PDF", extensions: ["pdf"] }] });
  if (r.canceled || !r.filePath) return { saved: false };
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${width}mm ${height}mm;margin:0}html,body{margin:0;padding:0}svg{display:block;width:${width}mm;height:${height}mm}</style></head><body>${svg.replace(/^<\?xml[^>]*>/, "")}</body></html>`;
  const tmp = path.join(os.tmpdir(), `werkcad-druck-${Date.now()}.html`);
  fs.writeFileSync(tmp, html, "utf8");
  const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await pw.loadFile(tmp);
    const pdf = await pw.webContents.printToPDF({ pageSize: { width: width / 25.4, height: height / 25.4 }, printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 }, preferCSSPageSize: true });
    fs.writeFileSync(r.filePath, pdf);
    lastDir("export", r.filePath);
    return { saved: true, path: r.filePath };
  } finally {
    pw.destroy();
    fs.rm(tmp, () => {});
  }
});

// Mehrseitiges PDF aus fertigem HTML (Fertigungsmappe); Seitenformate aus den @page-Regeln, Ergebnis als Bytes
ipcMain.handle("pdf:render", async (_e, html) => {
  if (typeof html !== "string") throw new Error("HTML fehlt");
  const tmp = path.join(os.tmpdir(), `werkcad-mappe-${Date.now()}.html`);
  fs.writeFileSync(tmp, html, "utf8");
  const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await pw.loadFile(tmp);
    return await pw.webContents.printToPDF({ printBackground: true, margins: { marginType: "none" }, preferCSSPageSize: true });
  } finally {
    pw.destroy();
    fs.rm(tmp, () => {});
  }
});

// Einstellungen + Updates
ipcMain.handle("settings:get", () => {
  const s = readSettings();
  return { version: app.getVersion(), hasToken: !!s.token, autoCheck: s.autoCheck !== false, packaged: app.isPackaged };
});
ipcMain.handle("settings:save", (_e, { token, autoCheck }) => {
  const s = readSettings();
  if (token === "") delete s.token;
  else if (token) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("Verschlüsselung nicht verfügbar");
    s.token = safeStorage.encryptString(token).toString("base64");
  }
  if (typeof autoCheck === "boolean") s.autoCheck = autoCheck;
  writeSettings(s);
  updater.configure(getToken());
  return true;
});
ipcMain.handle("update:check", () => updater.check(true));
ipcMain.handle("update:download", () => updater.download());
ipcMain.handle("update:install", () => { allowClose = true; updater.install(); });
