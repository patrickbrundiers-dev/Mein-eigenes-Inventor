// Eigene Teilebibliothek (Stahlbau-Lücken ST12, war E14): Bauteile projektübergreifend ablegen und wieder einfügen.
// Ein Eintrag ist ein kleines, in sich geschlossenes Projekt mit einem Bauteil (wie »Als eigene Datei speichern«) plus
// Name, Kategorie, Beschreibung und Vorschaubild. Ablage: Electron im Benutzerordner (teilebibliothek/<id>.json),
// im Browser im localStorage. Die Seitenleiste der Baugruppe (BG10) liest dieselben Einträge.

import { partProject } from "./links.js";

export const LIB_FORMAT = "pbcad-teil";

/** Eintrag aus einem Bauteil des Projekts */
export function libraryEntry(prj, part, { id, name, category = "", description = "", thumb = null, now = new Date() } = {}) {
  if (part?.kind !== "part") throw new Error("Nur Bauteile können in die Bibliothek");
  const project = partProject(prj, part, now);
  return { format: LIB_FORMAT, version: 1, id, name: String(name || part.name).trim() || part.name, category: String(category || "").trim(), description: String(description || "").trim(),
    number: part.number || "", material: part.material || "", time: now.toISOString(), thumb: thumb || null, project };
}

export const validEntry = (e) => !!(e && e.format === LIB_FORMAT && e.id && e.project?.docs?.some((d) => d.kind === "part"));

/**
 * Eintrag ins Projekt holen: Kopie des Bauteils mit neuer id (nicht verknüpft), Herkunft in doc.library.
 * Fehlende Werkstoffe und Biegetabellen des Eintrags kommen ins Projekt. Ein früher eingefügter, unveränderter Stand
 * desselben Eintrags wird wiederverwendet. Rückgabe { doc, reused }.
 */
export function insertEntry(prj, entry, newId) {
  if (!validEntry(entry)) throw new Error("Bibliothekseintrag ist beschädigt");
  const same = prj.docs.find((d) => d.kind === "part" && d.library?.id === entry.id && d.library.time === entry.time);
  if (same) return { doc: same, reused: true };
  const src = entry.project.docs.find((d) => d.kind === "part");
  const { link, ...clean } = JSON.parse(JSON.stringify(src));
  const doc = { ...clean, id: newId, name: uniqueName(prj, entry.name || src.name), library: { id: entry.id, time: entry.time, name: entry.name } };
  const mats = (entry.project.materials || []).filter((m) => m?.key && !(prj.materials || []).some((x) => x.key === m.key));
  if (mats.length) prj.materials = [...(prj.materials || []), ...mats];
  const key = (tb) => `${tb?.material}|${tb?.t}`;
  const tabs = (entry.project.bendTables || []).filter((tb) => !(prj.bendTables || []).some((x) => key(x) === key(tb)));
  if (tabs.length) prj.bendTables = [...(prj.bendTables || []), ...tabs];
  prj.docs.push(doc);
  return { doc, reused: false };
}
function uniqueName(prj, name) {
  const taken = new Set(prj.docs.map((d) => d.name));
  if (!taken.has(name)) return name;
  for (let i = 2; ; i++) if (!taken.has(`${name} (${i})`)) return `${name} (${i})`;
}

/** Suche über Name, Kategorie, Nummer, Werkstoff und Beschreibung; sortiert nach Kategorie, dann Name */
export function filterEntries(list, q = "", category = "") {
  const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter(validEntry)
    .filter((e) => !category || e.category === category)
    .filter((e) => { const t = [e.name, e.category, e.number, e.material, e.description].join(" ").toLowerCase(); return words.every((w) => t.includes(w)); })
    .sort((a, b) => (a.category || "~").localeCompare(b.category || "~", "de") || a.name.localeCompare(b.name, "de"));
}
export const entryCategories = (list) => [...new Set(list.filter(validEntry).map((e) => e.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
