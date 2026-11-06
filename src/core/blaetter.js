// Mehrere Blätter je Zeichnung (Paket B2): Übersicht auf Blatt 1, Details auf weiteren Blättern.
// Das aktuelle Blatt liegt wie bisher direkt am Dokument (sheet, views, dims, …), damit alle Werkzeuge unverändert
// arbeiten; die übrigen Blätter liegen in d.sheetStore[k] (am Platz des aktuellen Blatts steht null). Jedes Blatt kann eine
// eigene Quelle und eigene Schriftfeld-Felder (Benennung, Nummer, Maßstab, Werkstoff) haben (Zeichnungssatz: Baugruppe
// auf Blatt 1, je Position ein Einzelteilblatt). Fehlen sie an einem Blatt (ältere Dateien), gelten die des aktuellen
// Blatts weiter. Gemeinsam bleiben die übrigen Schriftfeld-Felder und die Änderungen.

/** Felder, die zu einem Blatt gehören */
export const SHEET_KEYS = ["sheet", "views", "dims", "leaders", "balloons", "symbols", "notes", "holeTables", "centerMarks", "welds", "bomTable", "pendingAutoViews", "pendingAutoDims"];
/** Schriftfeld-Felder je Blatt */
export const SHEET_TITLE_KEYS = ["benennung", "nummer", "massstab", "werkstoff"];
/** Felder mit Bezug auf eine Ansicht (Eintrag.view) – wandern mit der Ansicht auf ein anderes Blatt */
const VIEW_KEYS = ["dims", "leaders", "balloons", "symbols", "notes", "holeTables", "centerMarks", "welds"];

export const sheetCount = (d) => (d.sheetStore?.length || 1);
export const currentSheet = (d) => (d.sheetStore?.length ? d.sheetNo || 0 : 0);

const take = (d) => {
  const o = {};
  for (const k of SHEET_KEYS) if (d[k] !== undefined) o[k] = d[k];
  if (d.source !== undefined) o.source = d.source;
  if (d.title) o.title = Object.fromEntries(SHEET_TITLE_KEYS.map((k) => [k, d.title[k] ?? ""]));
  return o;
};
const put = (d, o) => {
  for (const k of SHEET_KEYS) { if (o[k] !== undefined) d[k] = o[k]; else delete d[k]; }
  // Quelle und Schriftfeld-Felder: ohne eigene Angabe gelten die bisherigen weiter
  if (o.source !== undefined) d.source = o.source;
  if (o.title) d.title = { ...(d.title || {}), ...o.title };
  if (!d.views) d.views = [];
  if (!d.dims) d.dims = [];
  if (!d.notes) d.notes = [];
};

/** zum Blatt k wechseln (0-basiert); gibt true zurück, wenn gewechselt wurde */
export function switchSheet(d, k) {
  const n = sheetCount(d), cur = currentSheet(d);
  if (n < 2 || k === cur || k < 0 || k >= n) return false;
  d.sheetStore[cur] = take(d);
  put(d, d.sheetStore[k]);
  d.sheetStore[k] = null;
  d.sheetNo = k;
  return true;
}

/**
 * neues leeres Blatt am Ende (Format wie das aktuelle) und dorthin wechseln; gibt seine Nummer zurück.
 * source/title: eigene Quelle und Schriftfeld-Felder des Blatts (sonst wie das aktuelle Blatt)
 */
export function addSheet(d, sheet = null, { source, title } = {}) {
  if (!d.sheetStore?.length) { d.sheetStore = [null]; d.sheetNo = 0; }
  const k = d.sheetStore.length;
  const o = { sheet: { ...(sheet || d.sheet || { format: "A3", orientation: "quer" }) }, views: [], dims: [], notes: [] };
  if (source !== undefined) o.source = source;
  if (title) o.title = { ...Object.fromEntries(SHEET_TITLE_KEYS.map((x) => [x, d.title?.[x] ?? ""])), ...title };
  d.sheetStore.push(o);
  switchSheet(d, k);
  return k;
}

/** Blatt k löschen (nicht das letzte verbliebene); danach steht man auf dem Blatt davor */
export function removeSheet(d, k = currentSheet(d)) {
  const n = sheetCount(d);
  if (n < 2) return false;
  if (k === currentSheet(d)) switchSheet(d, k === 0 ? 1 : k - 1);
  const cur = currentSheet(d);
  d.sheetStore.splice(k, 1);
  d.sheetNo = cur > k ? cur - 1 : cur;
  if (d.sheetStore.length < 2) { delete d.sheetStore; delete d.sheetNo; }
  return true;
}

/** Ansicht (mit ihren Maßen, Hinweisen, Positionsnummern …) auf Blatt k verschieben; Tochteransichten gehen mit */
export function moveViewToSheet(d, viewId, k) {
  const cur = currentSheet(d);
  if (k === cur || k < 0 || k >= sheetCount(d)) return false;
  const ids = new Set([viewId]);
  for (let grown = true; grown;) { grown = false; for (const v of d.views) if (v.parent && ids.has(v.parent) && !ids.has(v.id)) { ids.add(v.id); grown = true; } }
  const dst = d.sheetStore[k];
  dst.views = [...(dst.views || []), ...d.views.filter((v) => ids.has(v.id)).map((v) => { const c = { ...v }; if (c.parent && !ids.has(c.parent)) delete c.parent; return c; })];
  d.views = d.views.filter((v) => !ids.has(v.id));
  for (const key of VIEW_KEYS) {
    const list = d[key];
    if (!Array.isArray(list)) continue;
    const mv = list.filter((x) => ids.has(x.view));
    if (!mv.length) continue;
    dst[key] = [...(dst[key] || []), ...mv];
    d[key] = list.filter((x) => !ids.has(x.view));
  }
  return true;
}

/** fn(k) für jedes Blatt nacheinander (als aktuelles Blatt), danach zurück auf das Ausgangsblatt */
export async function eachSheet(d, fn) {
  const start = currentSheet(d), out = [];
  try {
    for (let k = 0; k < sheetCount(d); k++) { switchSheet(d, k); out.push(await fn(k)); }
  } finally { switchSheet(d, start); }
  return out;
}

/** Text im Feld »Blatt« des Schriftfelds */
export const sheetLabel = (d) => `${currentSheet(d) + 1}/${sheetCount(d)}`;

/** Alle Quellen einer Zeichnung über alle Blätter (ohne doppelte) */
export function drawingSources(d) {
  const out = [], seen = new Set();
  for (const s of [d?.source, ...(d?.sheetStore || []).map((x) => x?.source)]) if (s?.id && !seen.has(s.id)) { seen.add(s.id); out.push(s); }
  return out;
}
/** Zeigt die Zeichnung (auf irgendeinem Blatt) das Dokument id? kind: nur Quellen dieser Art */
export const drawsDoc = (d, id, kind = null) => d?.kind === "drawing" && drawingSources(d).some((s) => s.id === id && (!kind || s.kind === kind));
/** Quellen aller Blätter umschreiben (Kopie konstruieren): fn(source) → neue Quelle */
export function mapSheetSources(d, fn) {
  if (d.source) d.source = fn(d.source);
  for (const s of d.sheetStore || []) if (s?.source) s.source = fn(s.source);
}
