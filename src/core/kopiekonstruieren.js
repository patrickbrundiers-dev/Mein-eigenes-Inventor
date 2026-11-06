// Kopie konstruieren (Arbeitsabläufe AW2/AW3, wie Inventor »Kopie konstruieren« / SolidWorks »Pack and Go« und
// »Unabhängig machen«): eine Baugruppe samt gewählter Bauteile, Unterbaugruppen und Zeichnungen als neue Dokumente im
// Projekt anlegen. Verweise (Komponenten, abgeleitete Features, Generator-Einzelteile, Zeichnungsquellen, Stücklisten-
// Reihenfolge) zeigen danach auf die Kopien; nicht kopierte Teile werden weiterverwendet. Reine Rechnung ohne Oberfläche.
import { drawingSources, mapSheetSources } from "./blaetter.js";

import { uid } from "./examples.js";

export const COPY = "kopieren";
export const REUSE = "wiederverwenden";

const clone = (x) => JSON.parse(JSON.stringify(x));
/** Bauteil ist reines Normteil (nur Normteil-Features) */
const isNormOnly = (d) => d.kind === "part" && (d.features || []).length > 0 && d.features.every((f) => f.type === "normteil");

/**
 * Alle Dokumente, die zur Konstruktion gehören: das Wurzeldokument, eingebaute Bauteile und Unterbaugruppen (rekursiv)
 * und Zeichnungen dieser Dokumente. Rückgabe [{ doc, depth, action (Vorschlag), locked (Grund, warum fest) }]
 * Vorschlag: kopieren; Kaufteile, Normteile und aus Dateien verknüpfte Bauteile werden weiterverwendet.
 * Einzelteile eines Generators folgen immer ihrer Generator-Baugruppe.
 */
export function designItems(project, rootId) {
  const docs = project?.docs || [];
  const byId = new Map(docs.map((d) => [d.id, d]));
  const root = byId.get(rootId);
  if (!root || root.kind === "drawing") return [];
  const out = [], seen = new Set();
  const visit = (d, depth) => {
    if (!d || seen.has(d.id) || depth > 10) return;
    seen.add(d.id);
    let action = COPY, locked = null;
    if (d.kind === "part" && d.genAsm && byId.has(d.genAsm)) locked = "Einzelteil des Generators – folgt der Generator-Baugruppe";
    else if (d.kind === "part" && d.variant?.of) { action = REUSE; locked = "Variante – folgt ihrem Werksbauteil"; }
    else if (d.kind === "part" && (d.kaufteil || isNormOnly(d))) action = REUSE;
    else if (d.link) action = REUSE;
    out.push({ doc: d, depth, action, locked });
    if (d.kind === "assembly") for (const c of d.components || []) visit(byId.get(c.part), depth + 1);
  };
  visit(root, 0);
  // Generator-Einzelteile: Aktion der Generator-Baugruppe
  for (const it of out) if (it.locked && it.doc.genAsm) it.action = out.find((x) => x.doc.id === it.doc.genAsm)?.action || REUSE;
  for (const d of docs) if (d.kind === "drawing" && drawingSources(d).some((s) => seen.has(s.id))) out.push({ doc: d, depth: 0, action: COPY, locked: null, drawing: true });
  return out;
}

/** Neuer Name/Nummer: Präfix + Text + Suffix, optional »suchen → ersetzen« im Text */
export function renamed(s, { prefix = "", suffix = "", find = "", replace = "" } = {}) {
  let t = String(s ?? "");
  if (find) t = t.split(find).join(replace);
  return prefix + t + suffix;
}

/**
 * Kopie erzeugen. actions: { docId: "kopieren" | "wiederverwenden" } überschreibt die Vorschläge aus designItems;
 * naming: { prefix, suffix, find, replace } für Name und (falls gesetzt) Nummer; numbers: false lässt Nummern leer.
 * Das Wurzeldokument wird immer kopiert. Zeichnungen werden nur kopiert, wenn ihre Quelle kopiert wird.
 * Rückgabe { docs: [neue Dokumente in Projekt-Reihenfolge], map: Map(alteId → neueId), root: neue Wurzel-ID }
 * Das Projekt selbst bleibt unverändert – die Aufrufer hängen docs an.
 */
export function copyDesign(project, rootId, { actions = {}, naming = {}, numbers = true } = {}) {
  const items = designItems(project, rootId);
  if (!items.length) return { docs: [], map: new Map(), root: null };
  const act = (it) => {
    if (it.doc.id === rootId) return COPY;
    if (it.locked && it.doc.genAsm) return null; // unten nach der Generator-Baugruppe
    if (it.locked) return it.action;
    return actions[it.doc.id] || it.action;
  };
  const chosen = new Map();
  for (const it of items) if (!it.drawing) chosen.set(it.doc.id, act(it));
  for (const it of items) if (!it.drawing && it.locked && it.doc.genAsm) chosen.set(it.doc.id, chosen.get(it.doc.genAsm) || REUSE);
  for (const it of items) if (it.drawing) chosen.set(it.doc.id, drawingSources(it.doc).some((s) => chosen.get(s.id) === COPY) ? (actions[it.doc.id] || it.action) : REUSE);

  const map = new Map();
  for (const it of items) if (chosen.get(it.doc.id) === COPY) map.set(it.doc.id, uid(it.doc.kind[0]));
  const to = (id) => map.get(id) || id;
  const docs = [];
  for (const it of items) {
    if (!map.has(it.doc.id)) continue;
    const d = clone(it.doc);
    const old = it.doc;
    d.id = map.get(old.id);
    d.name = renamed(old.name, naming);
    if (d.kind !== "drawing") d.number = numbers && old.number ? renamed(old.number, naming) : (numbers ? old.number || "" : "");
    delete d.release; // Kopie startet »In Arbeit«
    delete d.link; // Kopie ist eigenständig im Projekt
    if (d.kind === "assembly") {
      for (const c of d.components || []) c.part = to(c.part);
      if (Array.isArray(d.bomOrder)) d.bomOrder = d.bomOrder.map(to);
    }
    if (d.kind === "part") {
      if (d.genAsm) d.genAsm = to(d.genAsm);
      for (const f of d.features || []) if (f.type === "abgeleitet" && f.source) f.source = to(f.source);
    }
    if (d.kind === "drawing") {
      mapSheetSources(d, (s) => ({ ...s, id: to(s.id) }));
      if (Array.isArray(d.posOrder)) d.posOrder = d.posOrder.map(to);
      for (const b of d.balloons || []) if (b.part) b.part = to(b.part);
      // Schriftfeld je Blatt (Zeichnungssatz): Benennung/Nummer der Quelle mit umbenennen
      const sheets = [{ source: old.source, title: d.title }, ...(d.sheetStore || []).map((s, k) => s && { source: old.sheetStore[k]?.source || old.source, title: s.title })];
      for (const sh of sheets) {
        if (!sh?.title || !sh.source) continue;
        const src = project.docs.find((x) => x.id === sh.source.id);
        if (src && sh.title.benennung === src.name) sh.title.benennung = renamed(src.name, naming);
        if (src && numbers && src.number && sh.title.nummer === src.number) sh.title.nummer = renamed(src.number, naming);
      }
      for (const b of (d.sheetStore || []).flatMap((s) => s?.balloons || [])) if (b.part) b.part = to(b.part);
    }
    docs.push(d);
  }
  return { docs, map, root: map.get(rootId) };
}

/**
 * Unabhängig machen (SolidWorks »Unabhängig machen«, Inventor »Ersetzen durch Kopie«): das Dokument einer Komponente
 * wird kopiert, nur diese Komponente (oder die genannten) zeigt danach auf die Kopie. Unterbaugruppen werden flach
 * kopiert (ihre Bauteile bleiben gemeinsam). Rückgabe { doc (Kopie), error }
 */
export function independentCopy(project, asm, compIds, { name } = {}) {
  const ids = new Set(Array.isArray(compIds) ? compIds : [compIds]);
  const comps = (asm?.components || []).filter((c) => ids.has(c.id));
  if (!comps.length) return { doc: null, error: "Keine Komponente gewählt" };
  const src = project.docs.find((d) => d.id === comps[0].part);
  if (!src) return { doc: null, error: "Bauteil fehlt" };
  if (comps.some((c) => c.part !== src.id)) return { doc: null, error: "Die Komponenten zeigen auf verschiedene Bauteile" };
  if (src.genAsm) return { doc: null, error: "Einzelteile eines Generators entstehen neu, sobald sich der Generator ändert – erst die Generator-Baugruppe kopieren" };
  const d = clone(src);
  d.id = uid(src.kind[0]);
  d.name = name || nextCopyName(project, src.name);
  if (d.number) d.number = nextCopyName(project, src.number, "number");
  delete d.release;
  delete d.link;
  for (const c of comps) {
    const m = typeof c.name === "string" ? c.name.match(/^(.*):(\d+)$/) : null;
    if (m && m[1] === src.name) c.name = `${d.name}:${m[2]}`;
    else if (c.name === src.name) c.name = d.name;
    c.part = d.id;
  }
  return { doc: d, error: null };
}

/** »Name-2«, »Name-3« … – der erste freie Name im Projekt */
export function nextCopyName(project, base, field = "name") {
  const taken = new Set((project?.docs || []).map((d) => d[field]).filter(Boolean));
  const stem = String(base ?? "");
  for (let i = 2; i < 1000; i++) { const n = `${stem}-${i}`; if (!taken.has(n)) return n; }
  return `${stem}-${Date.now()}`;
}
