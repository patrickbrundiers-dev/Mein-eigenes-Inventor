// Bauteile als eigene Dateien (MegaCAD-Abgleich M24): ein Bauteil kann in einer eigenen .wcad-Datei liegen und in
// Baugruppen anderer Projekte verknüpft werden. Reine Logik; Lesen/Schreiben der Dateien in src/ui/files.js.
//
// Verknüpftes Bauteil im Projekt: normales Bauteil-Dokument (Kopie, damit das Projekt auch ohne die Datei
// aufgeht) mit part.link = { path, rel, docId, time }. path = absoluter Pfad, rel = relativ zum Projektordner
// (wird zuerst versucht, damit ein Ordner mit Projekt und Teilen umziehen kann), docId = Bauteil in der Datei.
// Im Projekt ist ein verknüpftes Bauteil schreibgeschützt; geändert wird in der Quelldatei, dann »Aktualisieren«.

/** Ordner eines Pfads (Windows oder POSIX) */
export function dirOf(p) {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i < 0 ? "" : p.slice(0, i);
}
export const baseName = (p) => p.slice(Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")) + 1);
const sepOf = (p) => (p.includes("\\") && !p.includes("/") ? "\\" : "/");
const parts = (p) => p.split(/[\\/]+/).filter((x, i) => x !== "" || i === 0);
const winLike = (p) => /^[a-zA-Z]:/.test(p) || p.startsWith("\\\\");

/** Pfad von Ordner dir zu Datei file, relativ; null, wenn nicht ausdrückbar (anderes Laufwerk) */
export function relPath(dir, file) {
  if (!dir || !file) return null;
  const a = parts(dir), b = parts(file);
  const eq = winLike(file) ? (x, y) => x.toLowerCase() === y.toLowerCase() : (x, y) => x === y;
  if (!eq(a[0], b[0])) return null;
  let k = 0;
  while (k < a.length && k < b.length - 1 && eq(a[k], b[k])) k++;
  return [...Array(a.length - k).fill(".."), ...b.slice(k)].join("/");
}

/** Relativen Pfad gegen einen Ordner auflösen (Trennzeichen wie im Ordner) */
export function resolvePath(dir, rel) {
  const sep = sepOf(dir);
  const out = parts(dir);
  for (const x of rel.split(/[\\/]+/)) {
    if (x === "..") out.pop();
    else if (x && x !== ".") out.push(x);
  }
  return out.join(sep);
}

/** Kandidaten für das Lesen einer Verknüpfung: erst relativ zum Projekt, dann absolut */
export function linkCandidates(link, projectPath) {
  const out = [];
  if (link.rel && projectPath) out.push(resolvePath(dirOf(projectPath), link.rel));
  if (link.path && !out.includes(link.path)) out.push(link.path);
  return out;
}

/** Bauteil in einem fremden Projekt finden: id, sonst Teilenummer, sonst Name (nur Bauteile) */
export function findLinkedDoc(prj, link) {
  const ps = (prj?.docs || []).filter((d) => d.kind === "part");
  return ps.find((d) => d.id === link.docId) || (link.number && ps.find((d) => d.number === link.number)) || (link.name && ps.find((d) => d.name === link.name)) || (ps.length === 1 ? ps[0] : null);
}

/** Inhalt eines Bauteils ohne die Verknüpfungsangaben (für Vergleich und Schreibschutz) */
export function partContent(d) {
  const { link, ...rest } = d;
  return JSON.stringify(rest);
}

/**
 * Bauteil aus der Quelldatei übernehmen: Inhalt der Quelle, eigene id und Verknüpfung bleiben.
 * Rückgabe { doc, changed }. Eigene Werkstoffe und Biegetabellen der Quelle, die im Projekt fehlen, kommen in prj.materials bzw. prj.bendTables.
 */
export function applyLinked(prj, local, remotePrj, remote, now = new Date()) {
  const doc = JSON.parse(JSON.stringify({ ...remote, id: local.id, link: { ...local.link, docId: remote.id, number: remote.number || "", name: remote.name, time: now.toISOString() } }));
  const changed = partContent(doc) !== partContent(local);
  const mats = (remotePrj.materials || []).filter((m) => m?.key === remote.material && !(prj.materials || []).some((x) => x.key === m.key));
  if (mats.length) prj.materials = [...(prj.materials || []), ...mats];
  const key = (tb) => `${tb?.material}|${tb?.t}`;
  const tabs = (remotePrj.bendTables || []).filter((tb) => tb?.material === remote.material && !(prj.bendTables || []).some((x) => key(x) === key(tb)));
  if (tabs.length) prj.bendTables = [...(prj.bendTables || []), ...tabs];
  return { doc, changed };
}

/** Eigene Projektdatei für ein einzelnes Bauteil (zum Speichern als eigene Datei) */
export function partProject(prj, part, now = new Date()) {
  const { link, ...clean } = JSON.parse(JSON.stringify(part));
  const out = { format: "werkcad", version: prj.version || 1, name: part.name, docs: [clean], created: now.toISOString() };
  const mats = (prj.materials || []).filter((m) => m.key === part.material);
  if (mats.length) out.materials = mats;
  const tabs = (prj.bendTables || []).filter((tb) => tb.material === part.material);
  if (tabs.length) out.bendTables = tabs;
  return out;
}

/** Neue Verknüpfung auf Datei filePath (Bauteil remote) aus Sicht des Projekts projectPath */
export function makeLink(filePath, remote, projectPath, now = new Date()) {
  return { path: filePath, rel: projectPath ? relPath(dirOf(projectPath), filePath) : null, docId: remote.id, number: remote.number || "", name: remote.name, time: now.toISOString() };
}

/**
 * Projekt paketieren: Kopie, in der verknüpfte Bauteile ganz im Projekt stehen (Verknüpfung gelöst),
 * damit die Datei allein weitergegeben werden kann. Das offene Projekt bleibt unverändert.
 */
export function packProject(prj) {
  const copy = JSON.parse(JSON.stringify(prj));
  const packed = [];
  for (const d of copy.docs) if (d.kind === "part" && d.link) { packed.push(d.name); delete d.link; }
  return { project: copy, packed };
}
