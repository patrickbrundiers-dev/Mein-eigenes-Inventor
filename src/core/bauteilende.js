// Bauteilende (Fusion-Abgleich FU5): Markierung im Modellbrowser. Features dahinter werden nicht gerechnet,
// neue Features kommen an die Markierung (und die Markierung rückt hinter sie). part.endAfter = ID des letzten
// gerechneten Features, "" = vor dem ersten Feature, fehlt = alles wird gerechnet.

/** Anzahl der gerechneten Features (vorn); unbekannte ID gilt wie »alles« */
export function activeCount(part) {
  const fs = part?.features || [];
  if (part?.endAfter === undefined || part.endAfter === null) return fs.length;
  if (part.endAfter === "") return 0;
  const i = fs.findIndex((f) => f.id === part.endAfter);
  return i < 0 ? fs.length : i + 1;
}

/** Ist die Markierung zurückgezogen (nicht am Ende)? */
export const isRolledBack = (part) => activeCount(part) < (part?.features || []).length;

/** Markierung setzen: hinter Feature id; null = ans Ende (Eintrag entfällt), "" = vor alle Features */
export function setEnd(part, id) {
  const fs = part.features || [];
  if (id === null || id === undefined || (id !== "" && fs[fs.length - 1]?.id === id)) delete part.endAfter;
  else part.endAfter = id;
}

/** Neues Feature einfügen: an der Markierung; die Markierung rückt dahinter. Rückgabe: Index */
export function insertFeature(part, f) {
  part.features = part.features || [];
  if (!isRolledBack(part)) { part.features.push(f); return part.features.length - 1; }
  const at = activeCount(part);
  part.features.splice(at, 0, f);
  part.endAfter = f.id;
  return at;
}

/** Vor dem Löschen eines Features: steht die Markierung dahinter, rückt sie auf den Vorgänger */
export function beforeDelete(part, ids) {
  if (!part?.endAfter) return;
  const gone = new Set(ids);
  if (!gone.has(part.endAfter)) return;
  const fs = part.features || [];
  let i = fs.findIndex((f) => f.id === part.endAfter);
  while (i >= 0 && gone.has(fs[i].id)) i--;
  part.endAfter = i >= 0 ? fs[i].id : "";
}
