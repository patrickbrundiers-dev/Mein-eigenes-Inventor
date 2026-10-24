// Fehlerprotokoll: eine Textdatei im Benutzerordner, damit Abstürze und Fehler nachvollziehbar bleiben.
// Enthält nur Meldungen und Stacktraces, keine Projektinhalte.
const fs = require("node:fs");
const path = require("node:path");

const MAX_BYTES = 1024 * 1024; // danach wird werkcad.log zu werkcad.1.log (eine Vorgängerdatei)
const MAX_ENTRY = 4000;
let dir = null;

function init(logDir) {
  dir = logDir;
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* */ }
}
const file = () => dir && path.join(dir, "werkcad.log");

function write(level, source, message) {
  const f = file();
  if (!f) return;
  try {
    if (fs.existsSync(f) && fs.statSync(f).size > MAX_BYTES) fs.renameSync(f, path.join(dir, "werkcad.1.log"));
    const text = String(message ?? "").slice(0, MAX_ENTRY).replace(/\r?\n/g, "\n    ");
    fs.appendFileSync(f, `${new Date().toISOString()} [${level}] ${source}: ${text}\n`);
  } catch { /* Protokoll darf nie selbst einen Fehler auslösen */ }
}

module.exports = { init, write, dir: () => dir, file };
