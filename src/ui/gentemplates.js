// Vorlagen für Generatoren (Parametersätze, z. B. „Balkongeländer Standard“): je Rechner gespeichert, nicht im Projekt.
const KEY = "pbcad.generatorvorlagen";

function readAll() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
export function listTemplates(gen) { return Object.keys(readAll()[gen] || {}).sort((a, b) => a.localeCompare(b, "de")); }
export function getTemplate(gen, name) { return readAll()[gen]?.[name] || null; }
export function saveTemplate(gen, name, params) {
  const all = readAll();
  all[gen] = { ...(all[gen] || {}), [name]: JSON.parse(JSON.stringify(params)) };
  try { localStorage.setItem(KEY, JSON.stringify(all)); return true; } catch { return false; }
}
export function deleteTemplate(gen, name) {
  const all = readAll();
  if (!all[gen]?.[name]) return;
  delete all[gen][name];
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* gesperrt */ }
}
