// Sicherungen beim Speichern: Datei.wcad.bak ist die jüngste, dann .bak2, .bak3 … bis zur eingestellten Anzahl.
const fs = require("node:fs");

const MAX_BACKUPS = 9;
const backupName = (file, i) => (i === 1 ? file + ".bak" : file + ".bak" + i);

/** Anzahl prüfen: ganze Zahl 0–9, sonst 1 (wie bisher genau eine Sicherung) */
function backupCount(n) { return Number.isInteger(n) && n >= 0 && n <= MAX_BACKUPS ? n : 1; }

/**
 * Vor dem Überschreiben: ältere Sicherungen eine Stelle weiter schieben, die aktuelle Datei wird .bak.
 * keep = 0 legt keine Sicherung an und lässt vorhandene in Ruhe. Überzählige (.bak{keep+1} …) werden entfernt.
 */
function rotateBackups(file, keep = 1) {
  keep = backupCount(keep);
  if (!keep || !fs.existsSync(file)) return;
  for (let i = keep + 1; i <= MAX_BACKUPS; i++) { try { fs.unlinkSync(backupName(file, i)); } catch { /* nicht da */ } }
  for (let i = keep - 1; i >= 1; i--) {
    const from = backupName(file, i);
    if (fs.existsSync(from)) { try { fs.renameSync(from, backupName(file, i + 1)); } catch { /* */ } }
  }
  try { fs.copyFileSync(file, backupName(file, 1)); } catch { /* */ }
}

module.exports = { rotateBackups, backupCount, backupName, MAX_BACKUPS };
