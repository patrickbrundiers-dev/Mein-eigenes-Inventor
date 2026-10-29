// Modellbrowser (Baum links): Aufbau der Feature-Liste und Zusatzangaben, ohne DOM.
// Vorbild Inventor/SolidWorks/Solid Edge: eine Skizze, die ein Feature nutzt, steht eingerückt unter diesem Feature.
import { sketchRefs } from "./featurerefs.js";
import { resolveParams, evaluate } from "./expr.js";

/**
 * Oberste Ebene der Feature-Liste: [{ f, i, children: [{ f, i }] }] in Feature-Reihenfolge.
 * nest = genutzte Skizzen unter das erste nutzende Feature hängen. Eine Skizze vor dem Bauteilende, deren Feature
 * dahinter liegt, bleibt oben (sonst stünde gerechnete Geometrie unter einem grauen Feature).
 */
export function treeEntries(part, { nest = true, endAt = (part?.features || []).length } = {}) {
  const fs = part?.features || [];
  const owner = new Map(); // Skizzen-ID → Index des ersten nutzenden Features
  if (nest) {
    fs.forEach((g, gi) => {
      for (const sid of sketchRefs(g)) {
        if (owner.has(sid)) continue;
        const si = fs.findIndex((x) => x.id === sid);
        if (si < 0 || si >= gi || fs[si].type !== "sketch") continue;
        if (si < endAt && gi >= endAt) continue;
        owner.set(sid, gi);
      }
    });
  }
  const top = [];
  const byIndex = new Map();
  fs.forEach((f, i) => {
    if (owner.has(f.id)) return;
    const e = { f, i, children: [] };
    top.push(e);
    byIndex.set(i, e);
  });
  fs.forEach((f, i) => { if (owner.has(f.id)) byIndex.get(owner.get(f.id))?.children.push({ f, i }); });
  return top;
}

/** Stelle der Bauteilende-Zeile in treeEntries: vor dem ersten Eintrag, der nicht mehr gerechnet wird */
export function endPosition(entries, endAt) {
  const k = entries.findIndex((e) => e.i >= endAt);
  return k < 0 ? entries.length : k;
}

const num = (expr, scope) => {
  if (expr === undefined || expr === null || expr === "") return null;
  try { const v = evaluate(String(expr), scope); return Number.isFinite(v) ? v : null; } catch { return null; }
};
const fmt = (v) => (Math.round(v * 100) / 100).toLocaleString("de-DE", { maximumFractionDigits: 2 });

/** Erweiterter Name (Inventor »Erweiterte Namen anzeigen«): wichtigstes Maß des Features, z. B. »10 mm«, »Ø 11«, »× 6« */
export function featureDetail(f, part) {
  let scope = {};
  try { scope = resolveParams(part?.params || []).values; } catch { /* Parameterfehler zeigt das Feature selbst */ }
  const mm = (k) => { const v = num(f[k], scope); return v === null ? "" : `${fmt(v)} mm`; };
  const deg = (k) => { const v = num(f[k], scope); return v === null ? "" : `${fmt(v)}°`; };
  switch (f.type) {
    case "extrude": return f.mode === "through" ? "durch alles" : mm("distance");
    case "revolve": return deg("angle");
    case "hole": { const d = num(f.diameter, scope); if (f.form === "langloch") { const L = num(f.slotLength, scope); return d === null || L === null ? "" : `Langloch ${fmt(L)} × ${fmt(d)}` + (f.extent === "through" ? " durch" : ""); } return d === null ? "" : `Ø ${fmt(d)}` + (f.extent === "through" ? " durch" : f.depth ? ` × ${mm("depth")}` : ""); }
    case "fillet": { const r = num(f.radius, scope); return r === null ? "" : `R ${fmt(r)}`; }
    case "chamfer": return mm("radius");
    case "shell": case "aufdicken": return mm("thickness");
    case "pattern": { const n = num(f.count, scope); return n === null ? "" : `× ${fmt(n)}`; }
    case "profile": case "biegerohr": return mm("length");
    case "sketch": return "";
    default: return "";
  }
}

/** Suchtext passt? Groß-/Kleinschreibung egal, mehrere Wörter müssen alle vorkommen */
export function matchesQuery(texts, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const hay = texts.filter(Boolean).join(" ").toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

/**
 * Einträge nach Suche filtern: Eintrag bleibt, wenn er selbst passt (dann mit allen Unterpunkten)
 * oder ein Unterpunkt passt (dann nur die passenden, aufgeklappt: open = true).
 */
export function filterEntries(entries, test) {
  const out = [];
  for (const e of entries) {
    if (test(e.f)) { out.push(e); continue; }
    const kids = e.children.filter((c) => test(c.f));
    if (kids.length) out.push({ ...e, children: kids, open: true });
  }
  return out;
}

/**
 * Ordner (B3, wie Inventor/SolidWorks): aufeinanderfolgende Einträge mit gleichem f.folder kommen in einen Ordner.
 * Rückgabe: Einträge und { folder, first, entries } in Baum-Reihenfolge (first = Index des ersten Features).
 */
export function groupFolders(entries) {
  const out = [];
  for (const e of entries) {
    const name = typeof e.f.folder === "string" && e.f.folder.trim() ? e.f.folder.trim() : null;
    const last = out[out.length - 1];
    if (name && last?.folder === name) last.entries.push(e);
    else if (name) out.push({ folder: name, first: e.i, entries: [e] });
    else out.push(e);
  }
  return out;
}

/** Ordnername eines Nachbarn in der obersten Ebene (zum »Zum Ordner hinzufügen«) */
export function neighbourFolders(entries, id) {
  const k = entries.findIndex((e) => e.f.id === id || e.children.some((c) => c.f.id === id));
  if (k < 0) return [];
  const names = [entries[k - 1]?.f.folder, entries[k + 1]?.f.folder].filter((x) => typeof x === "string" && x.trim() && x !== entries[k].f.folder);
  return [...new Set(names)];
}
