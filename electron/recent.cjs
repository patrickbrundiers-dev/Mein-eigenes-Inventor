// Zuletzt geöffnete Projekte für den Startbildschirm: Liste mit Dateidaten und Vorschaubild.
// Vorschaubilder liegen im Benutzerordner (vorschau/<Prüfsumme des Pfads>.png), nicht in der Projektdatei.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MAX_RECENT = 12;
const MAX_PREVIEW = 1.5e6; // Zeichen der data:-URL (≈ 1 MB Bild)
const PNG_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;

/** Pfad vorne einreihen, Doppelte entfernen, auf MAX_RECENT kürzen */
function addRecent(list, p) { return [p, ...(list || []).filter((x) => x !== p)].slice(0, MAX_RECENT); }
function removeRecent(list, p) { return (list || []).filter((x) => x !== p); }

const previewFile = (dir, p) => path.join(dir, crypto.createHash("sha1").update(String(p)).digest("hex").slice(0, 24) + ".png");

/** Vorschaubild (PNG als data:-URL) zu einer Projektdatei ablegen; false bei ungültigen Daten */
function writePreview(dir, p, url) {
  if (typeof p !== "string" || !/\.wcad$/i.test(p) || typeof url !== "string" || url.length > MAX_PREVIEW || !PNG_URL.test(url)) return false;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(previewFile(dir, p), Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));
  return true;
}

/**
 * Einträge für den Startbildschirm: nur vorhandene Dateien, in Öffnungsreihenfolge (rank 0 = zuletzt).
 * mtime/size aus dem Dateisystem, preview als data:-URL oder null.
 */
function recentEntries(list, dir) {
  const out = [];
  for (const p of list || []) {
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    if (!st.isFile()) continue;
    let preview = null;
    try { preview = "data:image/png;base64," + fs.readFileSync(previewFile(dir, p)).toString("base64"); } catch { /* noch keins */ }
    out.push({ path: p, name: path.basename(p).replace(/\.wcad$/i, ""), folder: path.dirname(p), mtime: st.mtimeMs, size: st.size, rank: out.length, preview });
  }
  return out;
}

module.exports = { MAX_RECENT, addRecent, removeRecent, previewFile, writePreview, recentEntries };
