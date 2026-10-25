// Versionen mit Notiz (Fusion-Abgleich FU6): benannte Stände eines Projekts neben der Datei.
// Reine Logik: Liste ordnen, Änderungen zwischen zwei Ständen beschreiben, Speicher für den Browser.
// Desktop: Ordner »<Datei>.versionen« neben der .wcad mit V001.wcad, V002.wcad … und versionen.json (electron/versionen.cjs).

const KIND = { part: "Bauteil", assembly: "Baugruppe", drawing: "Zeichnung" };
/** Felder, die nur Verwaltung sind und keine Änderung am Modell bedeuten */
const IGNORE = new Set(["saved", "release", "namedViews", "pendingAutoViews"]);
const stable = (v) => JSON.stringify(v, (k, x) => (IGNORE.has(k) ? undefined : x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));

/** Nächste Versionsnummer (1, 2, 3 …) */
export const nextVersion = (list) => Math.max(0, ...(list || []).map((v) => Number(v.n) || 0)) + 1;
/** Dateiname einer Version im Versionsordner */
export const versionFile = (n) => `V${String(n).padStart(3, "0")}.wcad`;
/** Anzeige »V3« */
export const versionLabel = (n) => `V${n}`;

/**
 * Änderungen zwischen zwei Projektständen, kurz für die Versionsliste.
 * Rückgabe { added, removed, changed, text } – Namen der Dokumente; text z. B. »Neu: Tor · Geändert: Rahmen«.
 */
export function versionChanges(prev, cur) {
  const before = new Map((prev?.docs || []).map((d) => [d.id, d]));
  const after = new Map((cur?.docs || []).map((d) => [d.id, d]));
  const label = (d) => d.name || KIND[d.kind] || d.id;
  const added = [], removed = [], changed = [];
  for (const [id, d] of after) {
    const o = before.get(id);
    if (!o) added.push(label(d));
    else if (stable(o) !== stable(d)) changed.push(o.name !== d.name ? `${label(o)} → ${label(d)}` : label(d));
  }
  for (const [id, d] of before) if (!after.has(id)) removed.push(label(d));
  const other = !added.length && !removed.length && !changed.length && prev && stable({ ...prev, docs: [] }) !== stable({ ...cur, docs: [] });
  const parts = [];
  if (added.length) parts.push("Neu: " + added.join(", "));
  if (changed.length) parts.push("Geändert: " + changed.join(", "));
  if (removed.length) parts.push("Entfernt: " + removed.join(", "));
  if (other) parts.push("Projekteinstellungen geändert");
  const text = !prev ? "Erste Version" : parts.length ? parts.join(" · ") : "Keine Änderung am Modell";
  return { added, removed, changed, text };
}

/** Liste neueste zuerst; kaputte Einträge fallen weg */
export function sortVersions(list) {
  return (Array.isArray(list) ? list : []).filter((v) => Number.isInteger(v?.n) && v.n > 0).sort((a, b) => b.n - a.n);
}

/**
 * Versionsspeicher auf einem Schlüssel-Wert-Speicher (Browser: localStorage). Gleiche Schnittstelle wie die Desktop-Brücke:
 * list() → Einträge, save({ text, note, changes }) → Eintrag, read(n) → Text.
 */
export function storageVersions(storage, key, now = () => new Date()) {
  const idx = () => { try { return sortVersions(JSON.parse(storage.getItem(key) || "[]")); } catch { return []; } };
  return {
    async list() { return idx(); },
    async save({ text, note = "", changes = "" }) {
      const list = idx();
      const e = { n: nextVersion(list), time: now().toISOString(), note: String(note || ""), changes: String(changes || ""), file: versionFile(nextVersion(list)) };
      storage.setItem(key + ":" + e.n, text);
      storage.setItem(key, JSON.stringify([e, ...list]));
      return e;
    },
    async read(n) {
      const t = storage.getItem(key + ":" + n);
      if (t == null) throw new Error(`Version ${versionLabel(n)} nicht gefunden`);
      return t;
    },
  };
}
