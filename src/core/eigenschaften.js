// Dokument-Eigenschaften (Arbeitsabläufe AW4, wie Inventor »iProperties« / SolidWorks »Benutzerdefinierte Eigenschaften«):
// feste Felder (Name, Nummer, Beschreibung, Werkstoff, Konstrukteur, Projekt, Status) plus eigene Felder je Bauteil oder
// Baugruppe (doc.props = [{ name, value }]). Das Schriftfeld der Zeichnung liest sie über Platzhalter wie {Projekt};
// Umbenennen eines Bauteils zieht das Schriftfeld seiner Zeichnungen nach, solange dort noch der alte Name steht.
// Reine Rechnung ohne Oberfläche.

/** Feste Eigenschaften, die jedes Bauteil und jede Baugruppe hat (Platzhalter-Name → Feld im Dokument) */
export const STANDARD_PROPS = [
  { key: "Name", field: "name" },
  { key: "Nummer", field: "number" },
  { key: "Beschreibung", field: "description" },
  { key: "Konstrukteur", field: "designer" },
  { key: "Projekt", field: null }, // eigenes Feld, sonst Projektname
  { key: "Werkstoff", field: null }, // Bezeichnung kommt von außen (materialLabel)
  { key: "Status", field: null }, // Freigabestatus kommt von außen (releaseLabel)
];

const norm = (s) => String(s ?? "").trim().toLowerCase();

/** Eigene Eigenschaften eines Dokuments, bereinigt (ohne leere Namen, ohne doppelte) */
export function customProps(doc) {
  const out = [], seen = new Set();
  for (const p of Array.isArray(doc?.props) ? doc.props : []) {
    const name = String(p?.name ?? "").trim();
    if (!name || seen.has(norm(name))) continue;
    seen.add(norm(name));
    out.push({ name, value: String(p.value ?? "") });
  }
  return out;
}

/**
 * Alle Eigenschaften eines Dokuments als Liste [{ name, value, custom }] in fester Reihenfolge.
 * extra: { materialLabel, status, projectName } – Werte, die nicht im Dokument selbst stehen.
 */
export function docProperties(doc, extra = {}) {
  if (!doc) return [];
  const std = STANDARD_PROPS.map(({ key, field }) => {
    let value = field ? doc[field] : "";
    if (key === "Projekt") value = doc.projekt || extra.projectName || "";
    if (key === "Werkstoff") value = extra.materialLabel || "";
    if (key === "Status") value = extra.status || "";
    return { name: key, value: String(value ?? ""), custom: false };
  });
  const own = customProps(doc).filter((p) => !std.some((s) => norm(s.name) === norm(p.name))).map((p) => ({ ...p, custom: true }));
  return [...std, ...own];
}

/**
 * Platzhalter {Eigenschaft} in einem Text durch Werte ersetzen (Groß-/Kleinschreibung egal).
 * Unbekannte Platzhalter bleiben stehen, damit ein Tippfehler auffällt.
 */
export function fillPlaceholders(text, props) {
  const s = String(text ?? "");
  if (!s.includes("{")) return s;
  const map = new Map((props || []).map((p) => [norm(p.name), p.value]));
  return s.replace(/\{([^{}]+)\}/g, (all, k) => (map.has(norm(k)) ? map.get(norm(k)) : all));
}

/** Namen der Platzhalter, die in einem Text vorkommen und nicht bekannt sind */
export function unknownPlaceholders(text, props) {
  const map = new Set((props || []).map((p) => norm(p.name)));
  return [...String(text ?? "").matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]).filter((k) => !map.has(norm(k)));
}

/** Eigene Eigenschaft setzen (leerer Wert bleibt als Feld stehen); neuer Name hängt hinten an */
export function setCustomProp(doc, name, value) {
  const n = String(name ?? "").trim();
  if (!n) return false;
  doc.props = Array.isArray(doc.props) ? doc.props : [];
  const p = doc.props.find((x) => norm(x?.name) === norm(n));
  if (p) p.value = String(value ?? "");
  else doc.props.push({ name: n, value: String(value ?? "") });
  return true;
}

/** Eigene Eigenschaft entfernen */
export function removeCustomProp(doc, name) {
  if (!Array.isArray(doc?.props)) return false;
  const before = doc.props.length;
  doc.props = doc.props.filter((x) => norm(x?.name) !== norm(name));
  if (!doc.props.length) delete doc.props;
  return before !== (doc.props?.length || 0);
}

/**
 * Schriftfelder der Zeichnungen eines Dokuments nach Umbenennen nachziehen (assoziativ wie in Inventor):
 * Benennung und Zeichnungsnummer, die noch den alten Wert tragen, bekommen den neuen. Rückgabe: Anzahl geänderter Zeichnungen.
 */
export function syncDrawingTitles(project, doc, old) {
  let n = 0;
  for (const d of project?.docs || []) {
    if (d.kind !== "drawing") continue;
    // aktuelles Blatt und weitere Blätter mit eigener Quelle (Zeichnungssatz)
    const sheets = [{ source: d.source, title: d.title }, ...(d.sheetStore || []).filter(Boolean).map((s) => ({ source: s.source || d.source, title: s.title }))];
    let changed = false;
    for (const sh of sheets) {
      if (sh.source?.id !== doc.id || !sh.title) continue;
      if (old.name !== undefined && old.name !== doc.name && sh.title.benennung === old.name) { sh.title.benennung = doc.name; changed = true; }
      if (old.number !== undefined && old.number !== doc.number && (sh.title.nummer || "") === (old.number || "") && (old.number || doc.number)) { sh.title.nummer = doc.number || ""; changed = true; }
    }
    if (changed) n++;
  }
  return n;
}
