// WerkCAD – Electron-Hauptprozess
const { app, BrowserWindow, protocol, ipcMain, dialog, shell, Menu, safeStorage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const updater = require("./updater.cjs");

// Falls die Grafikkarte nicht nutzbar ist (Remotedesktop, alte Treiber): Software-WebGL erlauben
app.commandLine.appendSwitch("enable-unsafe-swiftshader");

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
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
  fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2));
}
function getToken() {
  const s = readSettings();
  if (!s.token) return "";
  try { return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(s.token, "base64")) : ""; } catch { return ""; }
}
function addRecent(p) {
  const s = readSettings();
  s.recent = [p, ...(s.recent || []).filter((x) => x !== p)].slice(0, 12);
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
    backgroundColor: "#e8edf1", title: "WerkCAD",
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
  updater.init(win, getToken, readSettings);
}

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
function atomicWrite(file, data) {
  const tmp = file + ".tmp" + process.pid;
  fs.writeFileSync(tmp, data);
  if (fs.existsSync(file)) { try { fs.copyFileSync(file, file + ".bak"); } catch { /* */ } }
  fs.renameSync(tmp, file);
}

ipcMain.handle("app:version", () => app.getVersion());
ipcMain.on("app:version-sync", (e) => { e.returnValue = app.getVersion(); });
ipcMain.handle("app:initialFile", () => { const f = pendingFile; pendingFile = null; return f; });
ipcMain.on("app:close-confirmed", (_e, ok) => { if (ok) { allowClose = true; win.close(); } });
ipcMain.on("app:title", (_e, t) => win && win.setTitle(String(t)));
ipcMain.handle("recent:list", () => (readSettings().recent || []).filter((p) => fs.existsSync(p)));

ipcMain.handle("project:open", async () => {
  const r = await dialog.showOpenDialog(win, { title: "Projekt öffnen", defaultPath: lastDir("project"), filters: [{ name: "WerkCAD-Projekt", extensions: ["wcad"] }], properties: ["openFile"] });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  lastDir("project", p);
  addRecent(p);
  return { path: p, text: fs.readFileSync(p, "utf8") };
});
ipcMain.handle("project:read", async (_e, p) => {
  addRecent(p);
  return { path: p, text: fs.readFileSync(p, "utf8") };
});
ipcMain.handle("project:save", async (_e, { path: p, text, defaultName }) => {
  let file = p;
  if (!file) {
    const r = await dialog.showSaveDialog(win, { title: "Projekt speichern", defaultPath: path.join(lastDir("project"), defaultName || "Projekt.wcad"), filters: [{ name: "WerkCAD-Projekt", extensions: ["wcad"] }] });
    if (r.canceled || !r.filePath) return null;
    file = r.filePath;
  }
  atomicWrite(file, text);
  lastDir("project", file);
  addRecent(file);
  return { path: file };
});
ipcMain.handle("file:save", async (_e, { defaultName, filters, data, binary }) => {
  const r = await dialog.showSaveDialog(win, { title: "Exportieren", defaultPath: path.join(lastDir("export"), defaultName || "Export"), filters: filters || [] });
  if (r.canceled || !r.filePath) return null;
  const buf = binary ? Buffer.from(new Uint8Array(data)) : Buffer.from(String(data), "utf8");
  fs.writeFileSync(r.filePath, buf);
  lastDir("export", r.filePath);
  return { path: r.filePath };
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
