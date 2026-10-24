// Projektdatei (.wcad): Lesen und Schreiben ohne Oberfläche – damit es ohne Electron testbar ist

/** Projekt als Text für die .wcad-Datei; setzt den Speicherzeitpunkt */
export function serializeProject(prj, now = new Date()) {
  prj.saved = now.toISOString();
  return JSON.stringify(prj, null, 1);
}

/** Text einer .wcad-Datei → Projekt; wirft bei unlesbarem Inhalt */
export function parseProject(text) {
  const prj = JSON.parse(text);
  if (prj?.format !== "werkcad" || !Array.isArray(prj.docs)) throw new Error("Keine WerkCAD-Projektdatei");
  return prj;
}
