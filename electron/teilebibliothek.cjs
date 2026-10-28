// Eigene Teilebibliothek (Stahlbau-Lücken ST12): je Eintrag eine JSON-Datei im Benutzerordner (…\WerkCAD\teilebibliothek)
const fs = require("node:fs");
const path = require("node:path");

const safeId = (id) => String(id || "").replace(/[^\w-]/g, "").slice(0, 64);

function list(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    try { const e = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); if (e && e.format === "pbcad-teil" && e.id) out.push(e); } catch { /* defekte Datei überspringen */ }
  }
  return out;
}
function write(dir, entry) {
  const id = safeId(entry?.id);
  if (!id || entry.format !== "pbcad-teil") throw new Error("Ungültiger Bibliothekseintrag");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, id + ".json"), tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(entry));
  fs.renameSync(tmp, file);
  return true;
}
function remove(dir, id) {
  const file = path.join(dir, safeId(id) + ".json");
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return true;
}
module.exports = { list, write, remove, safeId };
