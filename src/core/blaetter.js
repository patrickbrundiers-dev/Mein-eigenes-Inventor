// Mehrere Blätter je Zeichnung (Paket B2): Übersicht auf Blatt 1, Details auf weiteren Blättern.
// Das aktuelle Blatt liegt wie bisher direkt am Dokument (sheet, views, dims, …), damit alle Werkzeuge unverändert
// arbeiten; die übrigen Blätter liegen in d.sheetStore[k] (am Platz des aktuellen Blatts steht null). Gemeinsam für alle
// Blätter bleiben Quelle, Schriftfeld (außer »Blatt«) und Änderungen.

/** Felder, die zu einem Blatt gehören */
export const SHEET_KEYS = ["sheet", "views", "dims", "leaders", "balloons", "symbols", "notes", "holeTables", "centerMarks", "welds", "bomTable"];
/** Felder mit Bezug auf eine Ansicht (Eintrag.view) – wandern mit der Ansicht auf ein anderes Blatt */
const VIEW_KEYS = ["dims", "leaders", "balloons", "symbols", "notes", "holeTables", "centerMarks", "welds"];

export const sheetCount = (d) => (d.sheetStore?.length || 1);
export const currentSheet = (d) => (d.sheetStore?.length ? d.sheetNo || 0 : 0);

const take = (d) => {
  const o = {};
  for (const k of SHEET_KEYS) if (d[k] !== undefined) o[k] = d[k];
  return o;
};
const put = (d, o) => {
  for (const k of SHEET_KEYS) { if (o[k] !== undefined) d[k] = o[k]; else delete d[k]; }
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

/** neues leeres Blatt am Ende (Format wie das aktuelle) und dorthin wechseln; gibt seine Nummer zurück */
export function addSheet(d, sheet = null) {
  if (!d.sheetStore?.length) { d.sheetStore = [null]; d.sheetNo = 0; }
  const k = d.sheetStore.length;
  d.sheetStore.push({ sheet: { ...(sheet || d.sheet || { format: "A3", orientation: "quer" }) }, views: [], dims: [], notes: [] });
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
