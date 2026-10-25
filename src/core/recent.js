// Startbildschirm: zuletzt geöffnete Projekte sortieren und Datum/Größe lesbar machen (ohne DOM)

export const RECENT_SORTS = [
  { value: "geaendert", label: "Änderungsdatum" },
  { value: "geoeffnet", label: "Zuletzt geöffnet" },
  { value: "name", label: "Name" },
];

/** Neue Liste, sortiert nach Änderungsdatum (neueste zuerst), Name (A–Z) oder Öffnungsreihenfolge (rank) */
export function sortRecent(list, by = "geaendert") {
  const out = [...(list || [])];
  if (by === "name") out.sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true, sensitivity: "base" }) || a.rank - b.rank);
  else if (by === "geoeffnet") out.sort((a, b) => a.rank - b.rank);
  else out.sort((a, b) => b.mtime - a.mtime || a.rank - b.rank);
  return out;
}

/** Suche in Name und Ordner, Groß-/Kleinschreibung egal */
export function filterRecent(list, text) {
  const q = String(text || "").trim().toLocaleLowerCase("de");
  if (!q) return list;
  return list.filter((e) => (e.name + " " + e.folder).toLocaleLowerCase("de").includes(q));
}

const two = (n) => String(n).padStart(2, "0");
/** »heute, 14:05«, »gestern, 09:30«, sonst »12.10.2026, 14:05« */
export function recentDate(ms, now = Date.now()) {
  const d = new Date(ms), n = new Date(now);
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(n) - day(d)) / 864e5);
  const time = `${two(d.getHours())}:${two(d.getMinutes())}`;
  if (diff === 0) return "heute, " + time;
  if (diff === 1) return "gestern, " + time;
  return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()}, ${time}`;
}

/** Dateigröße in KB/MB mit deutschem Komma */
export function recentSize(bytes) {
  if (!(bytes >= 0)) return "";
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
  return (bytes / 1024 / 1024).toFixed(1).replace(".", ",") + " MB";
}
