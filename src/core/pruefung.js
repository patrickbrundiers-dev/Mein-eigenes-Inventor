// Prüfung und Freigabe (Fusion-Abgleich FU13/FU15): alle Fehler und Hinweise eines Projekts in einer Liste,
// Vollständigkeit vor Fertigungsmappe und Freigabe, Freigabestatus mit Fingerabdruck des Modells.
// Reine Logik ohne Oberfläche; Rechenergebnisse (results) und Fertigungsprüfung (dfmFor) kommen von außen.
import { FEHLER, WARNUNG, HINWEIS } from "./dfm.js";
import { validateProject } from "./project.js";
import { flattenAssembly } from "./subasm.js";

export { FEHLER, WARNUNG, HINWEIS };
const RANK = { [HINWEIS]: 0, [WARNUNG]: 1, [FEHLER]: 2 };

export const RELEASE_STATES = [
  { value: "entwurf", label: "In Arbeit" },
  { value: "geprueft", label: "Geprüft" },
  { value: "freigegeben", label: "Freigegeben" },
];
const STATE_LABEL = { ...Object.fromEntries(RELEASE_STATES.map((s) => [s.value, s.label])), geaendert: "Nach Freigabe geändert" };
export const releaseLabel = (state) => STATE_LABEL[state] || STATE_LABEL.entwurf;

const KIND = { part: "Bauteil", assembly: "Baugruppe", drawing: "Zeichnung" };
const item = (level, doc, text, extra = {}) => ({ level, doc: doc?.id ?? null, docName: doc?.name || doc?.id || "Projekt", docKind: doc?.kind || null, text, ...extra });

/** Name eines Eintrags aus result.status: Feature, Parameter oder Körper */
function statusName(part, key) {
  if (key.startsWith("param:")) return "Parameter " + key.slice(6);
  if (key === "koerper") return "Körper";
  const f = (part.features || []).find((x) => x.id === key);
  return f ? f.name || f.type : key;
}

/** Fehler und Warnungen der Features eines Bauteils (result = Rechenergebnis aus dem Kernel) */
export function featureProblems(part, result) {
  if (!result) return [];
  const out = [];
  for (const [key, s] of Object.entries(result.status || {})) {
    const feature = key.startsWith("param:") || key === "koerper" ? null : key;
    if (!s.ok) out.push(item(FEHLER, part, `${statusName(part, key)}: ${s.error || "nicht berechenbar"}`, { feature }));
    else if (s.warning) out.push(item(WARNUNG, part, `${statusName(part, key)}: ${s.warning}`, { feature }));
  }
  const fs = part.features || [];
  if (fs.length && !fs.every((f) => f.type === "sketch" || f.suppressed) && !(result.bodies || []).length)
    out.push(item(WARNUNG, part, "Bauteil hat keinen Körper"));
  return out;
}

/** Fertigungsprüfung (dfm.checkCutList) eines Bauteils als Einträge */
const dfmItems = (part, list) => (list || []).map((x) => item(x.level, part, `Pos. ${x.pos} ${x.profileId || ""}: ${x.rule} – ${x.text}`.replace(/\s+:/, ":")));

const byRank = (a, b) => RANK[b.level] - RANK[a.level] || String(a.docName).localeCompare(String(b.docName), "de");

/**
 * Problemliste des ganzen Projekts (FU15): Struktur (fehlende Verweise), Features aller berechneten Bauteile,
 * Fertigungsprüfung je Bauteil. results: Map partId → Rechenergebnis; dfmFor(part, result) → checkCutList-Liste.
 */
export function projectProblems(project, results, { dfmFor } = {}) {
  const out = [];
  const docOf = (id) => project.docs.find((d) => d.id === id);
  for (const i of validateProject(project)) out.push(item(i.severity === "error" ? FEHLER : WARNUNG, docOf(i.ref) || null, i.message));
  for (const d of project.docs) {
    if (d.kind !== "part") continue;
    const r = results.get(d.id);
    out.push(...featureProblems(d, r));
    if (r && dfmFor) out.push(...dfmItems(d, dfmFor(d, r)));
  }
  return out.sort(byRank);
}

/** Zählung je Stufe */
export function countLevels(list) {
  const c = { [FEHLER]: 0, [WARNUNG]: 0, [HINWEIS]: 0 };
  for (const x of list) c[x.level]++;
  return c;
}

/** Bauteile eines Dokuments: das Bauteil selbst oder alle (auch ausgeblendeten) Bauteile einer Baugruppe, jedes einmal */
export function partsOf(doc, docOf) {
  if (doc?.kind === "part") return [doc];
  if (doc?.kind !== "assembly") return [];
  return [...new Map(flattenAssembly(doc, docOf, { includeHidden: true }).map((o) => [o.part.id, o.part])).values()];
}

/** Bauteil nur aus Normteilen (Schrauben usw.): braucht keine eigene Teilenummer und Zeichnung */
const onlyNorm = (r) => !!r?.bodies?.length && r.bodies.every((b) => b.meta?.norm);

/**
 * Vollständigkeit vor Freigabe und Fertigungsmappe (FU13). Prüft das Dokument und alle seine Bauteile:
 * Werkstoff, Teilenummer, Rechenfehler, ungültige Körper, Fertigungsprüfung, fehlende Komponenten, Zeichnungen.
 * opts: { docOf, results, dfmFor, drawingsOf(id) → Zeichnungen, numberRequired }.
 * Ergebnis: { items, ok } – ok heißt: kein Fehler (Warnungen erlaubt).
 */
export function releaseCheck(doc, { docOf, results, dfmFor, drawingsOf = () => [], numberRequired = false } = {}) {
  const out = [];
  const numLevel = numberRequired ? FEHLER : WARNUNG;
  if (doc.kind === "assembly") {
    if (!doc.number) out.push(item(numLevel, doc, "Nummer fehlt", { field: "number" }));
    for (const c of doc.components || []) if (!docOf(c.part)) out.push(item(FEHLER, doc, `Komponente »${c.name || c.id}«: Bauteil fehlt`));
    if (!(doc.components || []).length) out.push(item(FEHLER, doc, "Baugruppe ist leer"));
  }
  for (const p of partsOf(doc, docOf)) {
    const r = results.get(p.id);
    if (!r) { out.push(item(FEHLER, p, "Bauteil ist nicht berechnet")); continue; }
    const norm = onlyNorm(r);
    if (!p.material && !norm) out.push(item(FEHLER, p, "Werkstoff fehlt", { field: "material" }));
    if (!p.number && !norm) out.push(item(numLevel, p, "Teilenummer fehlt", { field: "number" }));
    for (const x of featureProblems(p, r)) {
      // ungültiger Körper ist für die Werkstatt ein Fehler, nicht nur ein Hinweis
      out.push(/ungültig/i.test(x.text) ? { ...x, level: FEHLER } : x);
    }
    if ((r.bodies || []).some((b) => b.invalid) && !out.some((x) => x.doc === p.id && /ungültig/i.test(x.text))) out.push(item(FEHLER, p, "Körper ist ungültig"));
    if (dfmFor) out.push(...dfmItems(p, dfmFor(p, r)));
    if (!norm && !drawingsOf(p.id).length && p.id !== doc.id) out.push(item(HINWEIS, p, "keine Zeichnung – entsteht in der Fertigungsmappe automatisch"));
  }
  if (!drawingsOf(doc.id).length) out.push(item(HINWEIS, doc, `${KIND[doc.kind] || "Dokument"} hat keine Zeichnung`));
  const items = out.sort(byRank);
  return { items, ok: !items.some((x) => x.level === FEHLER) };
}

// ---------- Freigabestatus ----------

/** Felder, die nur Darstellung oder Verwaltung sind und den Fingerabdruck nicht ändern */
const IGNORE = new Set(["release", "namedViews", "description", "pendingAutoViews"]);

/** FNV-1a über einen Text, als Hex */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
const stable = (v) => JSON.stringify(v, (k, x) => (IGNORE.has(k) ? undefined : x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));

/**
 * Fingerabdruck eines Dokuments für die Freigabe: Inhalt des Dokuments und (bei Baugruppen) aller Bauteile und
 * Unterbaugruppen. Name und Beschreibung ändern ihn nicht, Maße, Features, Werkstoff und Teilenummer schon.
 */
export function docSignature(doc, docOf) {
  const docs = [doc];
  if (doc.kind === "assembly") {
    const seen = new Set([doc.id]);
    const walk = (a, depth) => {
      if (depth > 20) return;
      for (const c of a.components || []) {
        const d = docOf(c.part);
        if (!d || seen.has(d.id)) continue;
        seen.add(d.id);
        docs.push(d);
        if (d.kind === "assembly") walk(d, depth + 1);
      }
    };
    walk(doc, 0);
  }
  return hash(docs.map((d) => stable({ ...d, name: undefined })).join("|"));
}

/** Aktueller Freigabestatus: entwurf, geprueft, freigegeben oder geaendert (freigegeben, danach geändert) */
export function releaseState(doc, docOf) {
  const r = doc?.release;
  if (!r || !STATE_LABEL[r.status]) return "entwurf";
  if (r.status === "freigegeben" && r.sig && r.sig !== docSignature(doc, docOf)) return "geaendert";
  return r.status;
}

/** Neuer Freigabe-Eintrag (zum Speichern in doc.release) */
export function makeRelease(doc, docOf, status, { date = new Date(), by = "", note = "" } = {}) {
  if (status === "entwurf") return undefined;
  return { status, date: date.toISOString(), ...(by ? { by } : {}), ...(note ? { note } : {}), sig: docSignature(doc, docOf) };
}

/** Kurztext für Schriftfeld, Listen und Mappe, z. B. »Freigegeben 25.10.2026« */
export function releaseText(doc, docOf) {
  const st = releaseState(doc, docOf);
  const d = doc?.release?.date ? new Date(doc.release.date) : null;
  const when = d && !isNaN(d) ? ` ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}` : "";
  return releaseLabel(st) + (st === "entwurf" ? "" : when);
}
