// Projektdatei (.wcad): Lesen, Prüfen, Migrieren und Schreiben ohne Oberfläche – damit es ohne Electron testbar ist

/** Formatversion, die diese Programmversion schreibt */
export const FORMAT_VERSION = 1;

/**
 * Migrationen: MIGRATIONS[n] hebt ein Projekt von Version n auf n + 1.
 * Bekommt eine Kopie und darf sie verändern. Heute leer, weil es nur Version 1 gibt.
 */
export const MIGRATIONS = {};

const KINDS = ["part", "assembly", "drawing"];

/** Projekt als Text für die .wcad-Datei; setzt den Speicherzeitpunkt */
export function serializeProject(prj, now = new Date()) {
  prj.saved = now.toISOString();
  return JSON.stringify(prj, null, 1);
}

/** Text einer .wcad-Datei → Projekt; wirft bei unlesbarem Inhalt */
export function parseProject(text) {
  const prj = JSON.parse(text);
  if (prj?.format !== "werkcad" || !Array.isArray(prj.docs)) throw new Error("Keine PBCAD-Projektdatei");
  return prj;
}

const issue = (code, severity, ref, message) => ({ code, severity, ref, message });

/**
 * Formatversion prüfen und ältere Projekte schrittweise migrieren.
 * Liefert { project, issues }; wirft, wenn die Version unbrauchbar ist oder eine Migration fehlt.
 */
export function migrateProject(prj, { migrations = MIGRATIONS, current = FORMAT_VERSION } = {}) {
  const issues = [];
  let v = prj.version;
  if (v === undefined) {
    v = 1;
    issues.push(issue("version-fehlt", "info", null, "Keine Formatversion in der Datei, als Version 1 gelesen."));
  }
  if (!Number.isInteger(v) || v < 1) throw new Error(`Ungültige Formatversion »${v}«`);
  if (v > current) {
    issues.push(issue("version-neuer", "warning", null,
      `Die Datei stammt aus einer neueren PBCAD-Version (Format ${v}, dieses Programm kennt bis ${current}). Unbekannte Inhalte bleiben erhalten, werden aber eventuell als Fehler angezeigt.`));
    return { project: prj, issues };
  }
  if (v === current && prj.version === current) return { project: prj, issues };
  let out = structuredClone(prj);
  for (; v < current; v++) {
    const step = migrations[v];
    if (!step) throw new Error(`Keine Migration von Format ${v} auf ${v + 1}`);
    out = step(out) || out;
    out.version = v + 1;
    issues.push(issue("migriert", "info", null, `Format ${v} → ${v + 1} umgewandelt.`));
  }
  out.version = current;
  return { project: out, issues };
}

/**
 * Struktur prüfen, ohne etwas zu verändern.
 * Schwere "error": Programm kann das Projekt nicht sicher anzeigen; "warning": öffnen, aber hinweisen.
 */
export function validateProject(prj) {
  const issues = [];
  const ids = new Set();
  const byId = new Map();
  prj.docs.forEach((d, i) => {
    const ref = d?.id ?? `docs[${i}]`;
    if (!d || typeof d !== "object" || Array.isArray(d)) { issues.push(issue("doc-ungueltig", "error", ref, `Eintrag ${i + 1} ist kein Dokument.`)); return; }
    if (typeof d.id !== "string" || !d.id) issues.push(issue("doc-id-fehlt", "error", ref, `Dokument ${i + 1} hat keine ID.`));
    else if (ids.has(d.id)) issues.push(issue("doc-id-doppelt", "error", ref, `ID »${d.id}« kommt mehrfach vor.`));
    else { ids.add(d.id); byId.set(d.id, d); }
    const name = d.name || d.id || `Dokument ${i + 1}`;
    if (!KINDS.includes(d.kind)) { issues.push(issue("doc-art-unbekannt", "warning", ref, `»${name}« hat die unbekannte Art »${d.kind}« und wird nicht angezeigt.`)); return; }
    if (d.kind === "part") {
      if (!Array.isArray(d.features)) { issues.push(issue("features-fehlen", "error", ref, `Bauteil »${name}« hat keine Featureliste.`)); return; }
      if (d.params !== undefined && !Array.isArray(d.params)) issues.push(issue("params-ungueltig", "error", ref, `Bauteil »${name}«: Parameter sind keine Liste.`));
      const fids = new Set();
      d.features.forEach((f, j) => {
        if (!f || typeof f !== "object" || typeof f.id !== "string" || typeof f.type !== "string") {
          issues.push(issue("feature-ungueltig", "error", ref, `Bauteil »${name}«: Feature ${j + 1} hat keine ID oder keinen Typ.`));
          return;
        }
        if (fids.has(f.id)) issues.push(issue("feature-id-doppelt", "warning", ref, `Bauteil »${name}«: Feature-ID »${f.id}« kommt mehrfach vor.`));
        fids.add(f.id);
      });
    }
    if (d.kind === "assembly" && !Array.isArray(d.components)) issues.push(issue("komponenten-fehlen", "error", ref, `Baugruppe »${name}« hat keine Komponentenliste.`));
    if (d.kind === "drawing" && (!Array.isArray(d.views) || !Array.isArray(d.dims))) issues.push(issue("zeichnung-ungueltig", "error", ref, `Zeichnung »${name}« ist unvollständig.`));
  });
  // Verweise erst prüfen, wenn alle IDs bekannt sind
  for (const d of prj.docs) {
    if (d?.kind === "assembly" && Array.isArray(d.components)) {
      for (const c of d.components) {
        if (byId.get(c?.part)?.kind !== "part") issues.push(issue("komponente-verweis", "warning", d.id, `Baugruppe »${d.name || d.id}«: Komponente »${c?.name || c?.id}« verweist auf ein fehlendes Bauteil.`));
      }
    }
    if (d?.kind === "drawing" && d.source && !byId.has(d.source.id)) {
      issues.push(issue("zeichnung-quelle", "warning", d.id, `Zeichnung »${d.name || d.id}«: das gezeichnete Dokument fehlt.`));
    }
  }
  return issues;
}

/**
 * Datei öffnen: lesen, Version prüfen/migrieren, Struktur prüfen.
 * Liefert { project, issues }; wirft bei unlesbarer Datei oder Strukturfehlern (Schwere "error").
 */
export function loadProject(text, opts) {
  const { project, issues } = migrateProject(parseProject(text), opts);
  const found = validateProject(project);
  const errors = found.filter((i) => i.severity === "error");
  if (errors.length) {
    const more = errors.length > 1 ? ` (und ${errors.length - 1} weitere Fehler)` : "";
    const e = new Error("Projektdatei beschädigt: " + errors[0].message + more);
    e.issues = [...issues, ...found];
    throw e;
  }
  return { project, issues: [...issues, ...found] };
}
