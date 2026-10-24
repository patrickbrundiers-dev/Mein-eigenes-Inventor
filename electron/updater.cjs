// Online-Updates aus den GitHub-Releases – Download und Installation nur nach Freigabe.
// Öffentliches Repository: ohne Token. Privates Repository: Lese-Token aus den Einstellungen.
const { app } = require("electron");
const pkg = require("../package.json");

let autoUpdater = null;
let win = null;
let configured = false;
let manual = false;

function publishTarget() {
  const p = (pkg.build && pkg.build.publish && pkg.build.publish[0]) || {};
  return { owner: p.owner, repo: p.repo };
}
function send(ev) { if (win && !win.isDestroyed()) win.webContents.send("update:event", ev); }

function load() {
  if (autoUpdater) return autoUpdater;
  ({ autoUpdater } = require("electron-updater"));
  autoUpdater.autoDownload = false;          // erst nach Freigabe laden
  autoUpdater.autoInstallOnAppQuit = true;   // geladenes Update beim Beenden installieren
  autoUpdater.allowPrerelease = false;
  autoUpdater.on("update-available", (info) => send({ type: "available", version: info.version, notes: info.releaseNotes || "" }));
  autoUpdater.on("update-not-available", () => { if (manual) send({ type: "none" }); });
  autoUpdater.on("download-progress", (p) => send({ type: "progress", percent: p.percent }));
  autoUpdater.on("update-downloaded", (info) => send({ type: "downloaded", version: info.version }));
  autoUpdater.on("error", (err) => send({ type: "error", message: String(err && err.message || err).split("\n")[0], manual }));
  return autoUpdater;
}

function configure(token) {
  if (!app.isPackaged) return false;
  const u = load();
  const { owner, repo } = publishTarget();
  const opts = { provider: "github", owner, repo };
  if (token) Object.assign(opts, { private: true, token });
  u.setFeedURL(opts);
  configured = true;
  return true;
}

async function check(isManual = false) {
  manual = isManual;
  if (!app.isPackaged) return { message: "Updates gibt es nur in der installierten Version." };
  if (!configured) return { message: "Update-Quelle nicht eingerichtet." };
  try {
    const r = await load().checkForUpdates();
    const latest = r && r.updateInfo && r.updateInfo.version;
    if (latest && latest !== app.getVersion()) return { message: `Version ${latest} verfügbar – Hinweis oben im Fenster.` };
    return { message: `Aktuell (Version ${app.getVersion()}).` };
  } catch (e) {
    const msg = String(e && e.message || e);
    if (/401|403|Bad credentials/i.test(msg)) return { message: "Zugriff verweigert – Token prüfen (Berechtigung »Contents: Read-only« für das Repository)." };
    if (/404/.test(msg)) return { message: "Noch kein Release gefunden (oder Repository ist privat und es fehlt ein Token)." };
    return { message: "Prüfung fehlgeschlagen: " + msg.split("\n")[0] };
  }
}

function init(window, getToken, readSettings) {
  win = window;
  if (!app.isPackaged) return;
  configure(getToken());
  const s = readSettings();
  if (s.autoCheck !== false && configured) setTimeout(() => check(false), 8000);
}

async function download() {
  try { await load().downloadUpdate(); } catch (e) { send({ type: "error", message: String(e.message || e), manual: true }); }
}
function install() { load().quitAndInstall(false, true); }

module.exports = { init, configure, check, download, install };
