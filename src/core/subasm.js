// Unterbaugruppen (MegaCAD-Abgleich M19): Komponenten einer Baugruppe dürfen auf andere Baugruppen verweisen.
// Rein rechnerisch: Auflösen bis zu den Bauteilen (mit Gesamt-Platzierung), Zyklus-Schutz, Stücklisten in drei
// Formen – Mengenstückliste (alle Bauteile summiert), Strukturstückliste (Baum mit Ebenen 1, 1.1, 1.1.1 …) und
// Baukastenstückliste (je Baugruppe nur die direkten Bestandteile).

import { placementMatrix, matMul } from "./geom.js";

export const MAX_DEPTH = 8;

/**
 * Alle Bauteil-Vorkommen einer Baugruppe. docOf(id) → Dokument. Ausgeblendete Komponenten entfallen.
 * Rückgabe [{ part, matrix (Welt), inner (Bauteil im System der obersten Komponente), top (Komponente der
 * obersten Ebene), path: [Komponentennamen] }]
 */
export function flattenAssembly(asm, docOf, { includeHidden = false, bom = false, units = false } = {}) {
  const out = [];
  const walk = (a, M, top, inner, path, stack) => {
    if (stack.length > MAX_DEPTH) return;
    for (const c of a.components || []) {
      if (c.hidden && !includeHidden) continue;
      if (bom && isReference(c)) continue;
      const d = docOf(c.part);
      if (!d) continue;
      const P = placementMatrix(c.pos, c.rot);
      const Mw = matMul(M, P);
      const t = top || c;
      const inn = top ? matMul(inner, P) : null; // auf oberster Ebene: Einheitsmatrix (null)
      if (d.kind === "part") out.push({ part: d, matrix: Mw, inner: inn, top: t, comp: c, path: [...path, c.name || d.name] });
      // units: untrennbare und Kauf-Baugruppen als ein Vorkommen (Mengenstückliste, L11)
      else if (units && isBomUnit(d)) out.push({ part: d, unit: true, matrix: Mw, inner: inn, top: t, comp: c, path: [...path, c.name || d.name] });
      else if (d.kind === "assembly" && !stack.includes(d.id)) walk(d, Mw, t, top ? inn : IDENT, [...path, c.name || d.name], [...stack, d.id]);
    }
  };
  walk(asm, IDENT, null, IDENT, [], [asm.id]);
  return out;
}
const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

// Stücklistenstruktur (Arbeitsabläufe AW5, wie Inventor »Stücklistenstruktur« / SolidWorks »von Stückliste ausschließen«):
// Komponente c.bom = "referenz" → sichtbar, rechnet mit, aber nicht in Stückliste, Zuschnitt- und Bestellliste.
// Baugruppe asm.bomStructure = "phantom" → in Struktur- und Baukastenstückliste aufgelöst: ihre Teile stehen eine Ebene höher.
export const COMPONENT_BOM = [
  { value: "normal", label: "Normal" },
  { value: "referenz", label: "Referenz (nicht in der Stückliste)" },
];
export const ASSEMBLY_BOM = [
  { value: "normal", label: "Normal" },
  { value: "phantom", label: "Phantom (Teile eine Ebene höher)" },
  { value: "untrennbar", label: "Untrennbar (in der Mengenstückliste eine Zeile)" },
  { value: "kaufteil", label: "Kaufteil (eine Zeile, Inhalt nicht aufgelöst)" },
];
export const isReference = (c) => c?.bom === "referenz";
export const isPhantom = (d) => d?.kind === "assembly" && d.bomStructure === "phantom";
// SolidCraft-Abgleich L11: untrennbar (geschweißt, genietet) = in der Strukturstückliste mit Inhalt, in der
// Mengenstückliste als eine Zeile; Kaufteil = überall eine Zeile, Inhalt wird nicht aufgelöst.
export const isBomUnit = (d) => d?.kind === "assembly" && (d.bomStructure === "untrennbar" || d.bomStructure === "kaufteil");
export const isBoughtAsm = (d) => d?.kind === "assembly" && d.bomStructure === "kaufteil";

/** Enthält Baugruppe a (direkt oder tiefer) das Dokument id? – verhindert Zyklen beim Einfügen */
export function containsDoc(a, id, docOf, depth = 0) {
  if (!a || a.kind !== "assembly" || depth > MAX_DEPTH) return false;
  return (a.components || []).some((c) => c.part === id || containsDoc(docOf(c.part), id, docOf, depth + 1));
}

/** Darf doc in Baugruppe asm eingefügt werden? */
export function canInsert(asm, doc, docOf) {
  if (!doc || doc.id === asm.id) return false;
  if (doc.kind === "part") return true;
  return doc.kind === "assembly" && !containsDoc(doc, asm.id, docOf);
}

/** Mengen der Bauteile (für Zuschnittliste, Mengenstückliste): Map partId → Anzahl */
export function partCounts(asm, docOf) {
  const m = new Map();
  for (const o of flattenAssembly(asm, docOf, { bom: true })) m.set(o.part.id, (m.get(o.part.id) || 0) + 1);
  return m;
}

/**
 * Direkte Bestandteile einer Baugruppe, gleiche Dokumente zusammengefasst (Reihenfolge des ersten Auftretens).
 * Referenz-Komponenten entfallen, Phantom-Baugruppen werden durch ihre Bestandteile ersetzt (mal ihrer Anzahl).
 */
function directChildren(a, docOf, stack = [a.id]) {
  const m = new Map();
  const add = (d, n) => { if (!m.has(d.id)) m.set(d.id, { doc: d, qty: 0 }); m.get(d.id).qty += n; };
  for (const c of a.components || []) {
    if (c.hidden || isReference(c)) continue;
    const d = docOf(c.part);
    if (!d) continue;
    if (isPhantom(d) && stack.length <= MAX_DEPTH && !stack.includes(d.id)) {
      for (const ch of directChildren(d, docOf, [...stack, d.id])) add(ch.doc, ch.qty);
    } else add(d, 1);
  }
  return [...m.values()];
}

/**
 * Strukturstückliste: [{ level: "1.2", depth, doc, qty (je übergeordneter Einheit), total (gesamt), kind }]
 */
export function structureBom(asm, docOf) {
  const rows = [];
  const walk = (a, prefix, depth, mult, stack) => {
    directChildren(a, docOf).forEach((ch, i) => {
      const level = prefix ? `${prefix}.${i + 1}` : String(i + 1);
      rows.push({ level, depth, doc: ch.doc, qty: ch.qty, total: ch.qty * mult, kind: ch.doc.kind, ...(ch.doc.bomStructure && ch.doc.kind === "assembly" ? { bom: ch.doc.bomStructure } : {}) });
      if (ch.doc.kind === "assembly" && !isBoughtAsm(ch.doc) && depth < MAX_DEPTH && !stack.includes(ch.doc.id)) walk(ch.doc, level, depth + 1, ch.qty * mult, [...stack, ch.doc.id]);
    });
  };
  walk(asm, "", 0, 1, [asm.id]);
  return rows;
}

/** Baukastenstückliste: [{ asm, rows: [{ pos, doc, qty, kind }] }] – die Baugruppe selbst und jede Unterbaugruppe einmal */
export function modularBom(asm, docOf) {
  const out = [], seen = new Set();
  const visit = (a, depth) => {
    if (seen.has(a.id) || depth > MAX_DEPTH) return;
    seen.add(a.id);
    const rows = directChildren(a, docOf).map((ch, i) => ({ pos: i + 1, doc: ch.doc, qty: ch.qty, kind: ch.doc.kind }));
    out.push({ asm: a, rows });
    for (const r of rows) if (r.kind === "assembly" && !isBoughtAsm(r.doc)) visit(r.doc, depth + 1);
  };
  visit(asm, 0);
  return out;
}

/**
 * Komponente ersetzen (Fusion-Abgleich FU7): ids der Komponenten bekommen das Dokument newDoc. Lage, Fixierung,
 * Sichtbarkeit, Gelenk und Abhängigkeiten bleiben; die Flächen der Abhängigkeiten sucht der Löser im neuen Bauteil
 * neu (gleiche Normale, nächster Abstand). Namen nach dem Muster »Alt:3« werden zu »Neu:3«.
 * Rückgabe { replaced, constraints (betroffene Abhängigkeiten), error }
 */
export function replaceComponents(asm, ids, newDoc, docOf) {
  if (!canInsert(asm, newDoc, docOf)) return { replaced: 0, constraints: 0, error: newDoc?.id === asm.id ? "Baugruppe kann sich nicht selbst enthalten" : "Würde einen Kreisbezug ergeben" };
  const set = new Set(ids);
  let replaced = 0;
  for (const c of asm.components || []) {
    if (!set.has(c.id) || c.part === newDoc.id) continue;
    const old = docOf(c.part);
    const m = old && typeof c.name === "string" ? c.name.match(/^(.*):(\d+)$/) : null;
    if (!c.name || (m && m[1] === old.name)) c.name = `${newDoc.name}:${m ? m[2] : 1}`;
    else if (old && c.name === old.name) c.name = newDoc.name;
    c.part = newDoc.id;
    replaced++;
  }
  const constraints = (asm.constraints || []).filter((k) => set.has(k.a?.comp) || set.has(k.b?.comp)).length;
  return { replaced, constraints, error: null };
}

/** Alle Komponenten der Baugruppe, die auf dasselbe Dokument zeigen wie die Komponente id */
export function sameOccurrences(asm, id) {
  const c = (asm.components || []).find((x) => x.id === id);
  return c ? asm.components.filter((x) => x.part === c.part).map((x) => x.id) : [];
}

/**
 * Garnituren (L11, SolidCraft »Unterteile unter Schraube«): Komponenten mit gleichem c.garnitur bilden eine Garnitur,
 * c.garniturLead ist die Schraube. occ = Vorkommen aus flattenAssembly, desig(part) → Normbezeichnung oder null.
 * Rückgabe Map leadDesignation → Map memberDesignation → Anzahl (nur Mitglieder, ohne die Schraube selbst).
 */
export function garniturGroups(occ, desig) {
  const sets = new Map();
  for (const o of occ) {
    const g = o.comp?.garnitur;
    if (!g || o.unit) continue;
    const key = o.path.slice(0, -1).join("/") + "|" + g;
    if (!sets.has(key)) sets.set(key, { lead: null, members: [] });
    const d = desig(o.part);
    if (!d) continue;
    if (o.comp.garniturLead) sets.get(key).lead = d; else sets.get(key).members.push(d);
  }
  const out = new Map();
  for (const { lead, members } of sets.values()) {
    if (!lead || !members.length) continue;
    const m = out.get(lead) || new Map();
    for (const d of members) m.set(d, (m.get(d) || 0) + 1);
    out.set(lead, m);
  }
  return out;
}
