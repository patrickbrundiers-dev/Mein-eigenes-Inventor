// Online-Updates aus den GitHub-Releases – Download und Installation nur nach Freigabe.
// Öffentliches Repository: ohne Token. Privates Repository: Lese-Token aus den Einstellungen.
const { app } = require("electron");
const pkg = require("../package.json");
const log = require("./log.cjs");
const { updateSource } = require("./update-source.cjs");

let autoUpdater = null;
let win = null;
let configured = false;
let manual = false;
let downloading = false;

function send(ev) { if (win && !win.isDestroyed()) win.webContents.send("update:event", ev); }
// alles, was electron-updater meldet, landet im Fehlerprotokoll – sonst ist ein fehlgeschlagenes Update nicht nachvollziehbar
const text = (a) => a.map((x) => (x && x.stack) || String(x)).join(" ");
const logger = {
  info: (...a) => log.write("info", "update", text(a)),
  warn: (...a) => log.write("warn", "update", text(a)),
  error: (...a) => log.write("error", "update", text(a)),
  debug: () => {},
};

function load() {
  if (autoUpdater) return autoUpdater;
  ({ autoUpdater } = require("electron-updater"));
  autoUpdater.logger = logger;
  autoUpdater.autoDownload = false;          // erst nach Freigabe laden
  autoUpdater.autoInstallOnAppQuit = true;   // geladenes Update beim Beenden installieren
  autoUpdater.allowPrerelease = false;
  autoUpdater.on("update-available", (info) => send({ type: "available", version: info.version, notes: info.releaseNotes || "" }));
  autoUpdater.on("update-not-available", () => { if (manual) send({ type: "none" }); });
  autoUpdater.on("download-progress", (p) => send({ type: "progress", percent: p.percent }));
  autoUpdater.on("update-downloaded", (info) => { downloading = false; send({ type: "downloaded", version: info.version }); });
  // Fehler beim Herunterladen immer anzeigen, Fehler der Suche beim Start nur protokollieren (z. B. offline)
  autoUpdater.on("error", (err) => send({ type: "error", message: String(err && err.message || err).split("\n")[0], manual: manual || downloading, stage: downloading ? "download" : "check" }));
  return autoUpdater;
}

function configure(token) {
  if (!app.isPackaged) return false;
  const u = load();
  const src = updateSource(pkg);
  if (!src) { log.write("error", "update", "Update-Quelle fehlt in package.json (repository)"); return false; }
  const { owner, repo } = src;
  // Öffentlich: direkt latest.yml über GitHubs Weiterleitung auf das neueste Release laden (ohne releases.atom).
  const opts = token
    ? { provider: "github", owner, repo, private: true, token }
    : { provider: "generic", url: `https://github.com/${owner}/${repo}/releases/latest/download` };
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
    if (/\b401\b|Bad credentials/i.test(msg)) return { message: "Zugriff verweigert – Token prüfen (Berechtigung »Contents: Read-only« für das Repository)." };
    // 404 auf latest.yml: Repository privat oder neuestes Release ohne latest.yml
    if (/\b404\b/.test(msg)) return { message: "Update-Datei nicht gefunden (404). Ist das Repository auf GitHub privat oder fehlt latest.yml im neuesten Release? " + msg.split("\n")[0] };
    // sonst die Originalmeldung anzeigen, damit die Ursache erkennbar bleibt
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
  if (downloading) return;
  downloading = true;
  try { await load().downloadUpdate(); } catch { /* Meldung kommt über das error-Ereignis */ } finally { downloading = false; }
}
// still installieren (gleicher Ordner wie bisher, ohne erneuten Installationsassistenten) und danach PBCAD neu starten
function install() {
  log.write("info", "update", "Installation gestartet");
  load().quitAndInstall(true, true);
}

module.exports = { init, configure, check, download, install };
