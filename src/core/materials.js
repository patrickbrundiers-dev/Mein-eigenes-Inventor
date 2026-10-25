// Werkstoffe: eingebaute Liste (sections.js) plus eigene Bibliothek aus den Einstellungen
// und Kopien aus der offenen Projektdatei. Alle Zugriffe laufen über materialOf().

import { MATERIALS } from "./sections.js";

export const FALLBACK_MATERIAL = "S235";
const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

let user = new Map();    // eigene Bibliothek (Einstellung material.eigene)
let project = new Map(); // im Projekt mitgespeicherte, die in der Bibliothek fehlen

export const isBuiltin = (key) => Object.prototype.hasOwnProperty.call(MATERIALS, key);

/** Werkstoff zu einem Schlüssel; unbekannte fallen auf S235 zurück (source "fallback") */
export function materialOf(key) {
  if (isBuiltin(key)) return { key, ...MATERIALS[key], source: "builtin" };
  if (user.has(key)) return { ...user.get(key), source: "user" };
  if (project.has(key)) return { ...project.get(key), source: "project" };
  return { key: FALLBACK_MATERIAL, ...MATERIALS[FALLBACK_MATERIAL], source: "fallback", missing: key ?? null };
}

/** Alle wählbaren: eingebaute, eigene, nur im Projekt vorhandene */
export function materialList() {
  return [
    ...Object.entries(MATERIALS).map(([key, m]) => ({ key, ...m, source: "builtin" })),
    ...[...user.values()].map((m) => ({ ...m, source: "user" })),
    ...[...project.values()].filter((m) => !user.has(m.key)).map((m) => ({ ...m, source: "project" })),
  ];
}

export function setUserMaterials(list) { user = new Map((list || []).map((m) => [m.key, { ...m }])); }
export function setProjectMaterials(list) { project = new Map((list || []).filter((m) => !isBuiltin(m.key)).map((m) => [m.key, { ...m }])); }

/** Einen Werkstoff prüfen → {ok, value} | {ok:false, error}. Dichte darf als Text mit Komma kommen. */
export function validateMaterial(m) {
  if (!m || typeof m !== "object") return { ok: false, error: "Werkstoff erwartet" };
  const key = String(m.key ?? "").trim();
  if (!KEY_RE.test(key)) return { ok: false, error: "Kürzel: 1–20 Zeichen, Buchstaben, Ziffern, . _ -" };
  if (isBuiltin(key)) return { ok: false, error: `Kürzel »${key}« ist ein eingebauter Werkstoff` };
  const label = String(m.label ?? "").trim();
  if (!label || label.length > 60) return { ok: false, error: "Name fehlt oder ist zu lang" };
  const density = typeof m.density === "string" ? Number(m.density.trim().replace(",", ".")) : m.density;
  if (typeof density !== "number" || !Number.isFinite(density) || density <= 0 || density > 30) return { ok: false, error: "Dichte muss zwischen 0 und 30 g/cm³ liegen" };
  const color = m.color ?? "#8d99a6";
  if (!COLOR_RE.test(color)) return { ok: false, error: "Farbe als #rrggbb erwartet" };
  const out = { key, label, density, color: color.toLowerCase() };
  const number = String(m.number ?? "").trim();
  if (number) out.number = number.slice(0, 30);
  return { ok: true, value: out };
}

/** Ganze Bibliothek prüfen (Kürzel eindeutig) */
export function validateMaterialLib(v) {
  if (!Array.isArray(v)) return { ok: false, error: "Liste von Werkstoffen erwartet" };
  if (v.length > 200) return { ok: false, error: "Höchstens 200 eigene Werkstoffe" };
  const out = [], seen = new Set();
  for (const m of v) {
    const r = validateMaterial(m);
    if (!r.ok) return { ok: false, error: `${m?.label || m?.key || "Werkstoff"}: ${r.error}` };
    if (seen.has(r.value.key)) return { ok: false, error: `Kürzel »${r.value.key}« doppelt` };
    seen.add(r.value.key);
    out.push(r.value);
  }
  return { ok: true, value: out };
}

/** Bibliothek als JSON-Text zum Austausch */
export function exportMaterialLib(list) {
  return JSON.stringify({ format: "pbcad-werkstoffe", version: 1, materials: list }, null, 1);
}

/** JSON-Text einlesen und in die Bibliothek mischen (gleiches Kürzel wird ersetzt) → {ok, value, added, replaced} */
export function importMaterialLib(text, current = []) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, error: "Keine gültige JSON-Datei" }; }
  const list = Array.isArray(data) ? data : data?.format === "pbcad-werkstoffe" ? data.materials : null;
  if (!Array.isArray(list)) return { ok: false, error: "Keine PBCAD-Werkstoffliste" };
  const incoming = validateMaterialLib(list);
  if (!incoming.ok) return incoming;
  const byKey = new Map(current.map((m) => [m.key, m]));
  let added = 0, replaced = 0;
  for (const m of incoming.value) { if (byKey.has(m.key)) replaced++; else added++; byKey.set(m.key, m); }
  const merged = validateMaterialLib([...byKey.values()]);
  return merged.ok ? { ok: true, value: merged.value, added, replaced } : merged;
}

/** Schlüssel der Werkstoffe, die Bauteile im Projekt benutzen */
export function usedMaterialKeys(prj) {
  return new Set((prj?.docs || []).filter((d) => d?.kind === "part" && d.material).map((d) => d.material));
}

/** Eigene Werkstoffe, die das Projekt benutzt – als Kopie für die Projektdatei */
export function projectMaterialCopies(prj) {
  return [...usedMaterialKeys(prj)].filter((k) => !isBuiltin(k)).map((k) => materialOf(k)).filter((m) => m.source !== "fallback")
    .map(({ source, ...m }) => m);
}

/**
 * Beim Öffnen: Kopien aus der Datei übernehmen, soweit sie in der Bibliothek fehlen.
 * → Hinweise im Format der Projektprüfung
 */
export function adoptProjectMaterials(prj) {
  const list = Array.isArray(prj?.materials) ? prj.materials.map((m) => validateMaterial(m)).filter((r) => r.ok).map((r) => r.value) : [];
  setProjectMaterials(list);
  const issues = [];
  const fromFile = list.filter((m) => !user.has(m.key));
  if (fromFile.length) issues.push({ code: "werkstoff-aus-datei", severity: "warning", ref: null,
    message: `Werkstoff ${fromFile.map((m) => "»" + m.label + "«").join(", ")} steht nicht in deiner Bibliothek und wurde aus der Projektdatei übernommen.` });
  const unknown = [...usedMaterialKeys(prj)].filter((k) => materialOf(k).source === "fallback");
  if (unknown.length) issues.push({ code: "werkstoff-unbekannt", severity: "warning", ref: null,
    message: `Unbekannter Werkstoff ${unknown.map((k) => "»" + k + "«").join(", ")} – gerechnet wird mit ${MATERIALS[FALLBACK_MATERIAL].label}.` });
  return issues;
}
