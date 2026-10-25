// Versionen mit Notiz (FU6): Ordner »<Datei>.versionen« neben der Projektdatei, darin V001.wcad … und versionen.json.
// Die Versionsdateien sind normale Projektdateien und lassen sich auch ohne PBCAD-Liste öffnen.
const fs = require("node:fs");
const path = require("node:path");

const INDEX = "versionen.json";
const dirFor = (file) => file.replace(/\.wcad$/i, "") + ".versionen";
const fileFor = (n) => `V${String(n).padStart(3, "0")}.wcad`;

/** Liste neueste zuerst; nur Einträge, deren Datei noch da ist */
function listVersions(file) {
  const dir = dirFor(file);
  let list = [];
  try { list = JSON.parse(fs.readFileSync(path.join(dir, INDEX), "utf8")); } catch { return []; }
  if (!Array.isArray(list)) return [];
  return list.filter((v) => Number.isInteger(v?.n) && v.n > 0 && fs.existsSync(path.join(dir, fileFor(v.n)))).sort((a, b) => b.n - a.n);
}

/** Neue Version schreiben: Datei zuerst, dann die Liste (beides über Temp-Datei und Umbenennen) */
function saveVersion(file, { text, note = "", changes = "" }, now = new Date()) {
  const dir = dirFor(file);
  fs.mkdirSync(dir, { recursive: true });
  let all = [];
  try { all = JSON.parse(fs.readFileSync(path.join(dir, INDEX), "utf8")); } catch { /* neu */ }
  if (!Array.isArray(all)) all = [];
  let n = Math.max(0, ...all.map((v) => Number(v?.n) || 0)) + 1;
  while (fs.existsSync(path.join(dir, fileFor(n)))) n++;
  const write = (name, data) => { const tmp = path.join(dir, name + ".tmp"); fs.writeFileSync(tmp, data); fs.renameSync(tmp, path.join(dir, name)); };
  write(fileFor(n), String(text));
  const e = { n, time: now.toISOString(), note: String(note || ""), changes: String(changes || ""), file: fileFor(n) };
  write(INDEX, JSON.stringify([e, ...all], null, 1));
  return e;
}

function readVersion(file, n) {
  if (!Number.isInteger(n) || n < 1) throw new Error("ungültige Versionsnummer");
  return fs.readFileSync(path.join(dirFor(file), fileFor(n)), "utf8");
}

module.exports = { listVersions, saveVersion, readVersion, dirFor, fileFor };
