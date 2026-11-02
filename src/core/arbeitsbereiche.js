// Arbeitsbereiche (Q11): benannte Anordnungen von Panels, Raster und »Zeichnung daneben«, mit einem Klick umschalten.
// Drei eingebaute (Konstruktion, Zeichnung prüfen, Präsentation) und eigene, die der Anwender speichert. Reine Rechnung.
import { DEFAULT_LAYOUT, validateLayout } from "./layout.js";

export const BUILTIN_WORKSPACES = [
  { name: "Konstruktion", builtin: true, layout: { ...DEFAULT_LAYOUT, hide: [] }, grid: true, side: false },
  { name: "Zeichnung prüfen", builtin: true, layout: { ...DEFAULT_LAYOUT, hide: ["props"] }, grid: true, side: true },
  { name: "Präsentation", builtin: true, layout: { ...DEFAULT_LAYOUT, hide: ["browser", "props"] }, grid: false, side: false },
];

/** Aktuellen Stand als Arbeitsbereich festhalten */
export function captureWorkspace(name, { layout, grid, side }) {
  const v = validateLayout(layout);
  return { name: String(name || "").trim(), layout: v.ok ? v.value : { ...DEFAULT_LAYOUT }, grid: grid !== false, side: !!side };
}

/** Eigene Arbeitsbereiche: gleichnamige ersetzen, eingebaute Namen sind gesperrt, sortiert */
export function upsertWorkspace(list, ws) {
  if (!ws?.name) return { ok: false, error: "Bitte einen Namen angeben." };
  if (BUILTIN_WORKSPACES.some((b) => b.name.toLowerCase() === ws.name.toLowerCase())) return { ok: false, error: `»${ws.name}« ist ein eingebauter Arbeitsbereich.` };
  const rest = (list || []).filter((x) => x.name.toLowerCase() !== ws.name.toLowerCase());
  return { ok: true, value: [...rest, ws].sort((a, b) => a.name.localeCompare(b.name, "de")) };
}

/** Gespeicherte Liste prüfen (aus localStorage): ungültige Einträge fallen weg */
export function readWorkspaces(raw) {
  let v;
  try { v = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return []; }
  if (!Array.isArray(v)) return [];
  return v.filter((x) => x && typeof x.name === "string" && x.name.trim() && x.layout).map((x) => captureWorkspace(x.name, x));
}

/** Welcher Arbeitsbereich passt zum aktuellen Stand (für das Häkchen im Menü)? */
export function activeWorkspace(all, state) {
  const cur = captureWorkspace("", state);
  // Breiten zählen nicht: wer ein Panel breiter zieht, bleibt im selben Arbeitsbereich
  const key = (w) => JSON.stringify([w.layout.browser, w.layout.props, [...w.layout.hide].sort(), w.grid, w.side]);
  const same = (a, b) => key(a) === key(b);
  return all.find((w) => same(captureWorkspace(w.name, w), cur))?.name || null;
}

/** Anordnung beim Umschalten: eingebaute Bereiche übernehmen die aktuellen Panel-Breiten, eigene ihre gespeicherten */
export function layoutFor(ws, current) {
  const l = captureWorkspace(ws.name, ws).layout;
  return ws.builtin ? { ...l, wLeft: current?.wLeft ?? l.wLeft, wRight: current?.wRight ?? l.wRight } : l;
}
