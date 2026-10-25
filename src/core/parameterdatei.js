// Parameter als Tabelle austauschen (Fusion-Abgleich FU3): CSV für Excel (Semikolon, deutsches Komma) schreiben und lesen.
// Spalten: Name; Ausdruck; Wert; Kommentar. Beim Lesen zählen Name und Ausdruck, der Wert ist nur zur Ansicht.
import { isValidName } from "./expr.js";

const HEAD = ["Name", "Ausdruck", "Wert", "Kommentar"];
const q = (s) => { const t = String(s ?? ""); return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const num = (v) => (Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6).replace(".", ",") : "");

/** Parameterliste → CSV-Text (mit BOM, damit Excel Umlaute richtig liest). values: Name → Zahl */
export function paramsCsv(rows, values = {}) {
  const lines = [HEAD, ...(rows || []).map((r) => [r.name, r.expr, num(values[r.name]), r.comment || ""])];
  return "﻿" + lines.map((l) => l.map(q).join(";")).join("\r\n") + "\r\n";
}

/** CSV in Zeilen und Felder zerlegen; Trennzeichen ; , oder Tab (aus der ersten Zeile erkannt), Anführungszeichen wie Excel */
function splitCsv(text) {
  const t = String(text || "").replace(/^﻿/, "");
  const first = t.split(/\r?\n/, 1)[0];
  const sep = first.includes(";") ? ";" : first.includes("\t") ? "\t" : ",";
  const out = [];
  let row = [], cell = "", inQ = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cell); out.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((x) => x.trim() !== ""));
}

/**
 * CSV-Text → { rows: [{ name, expr, comment }], errors: [Text] }. Kopfzeile wird erkannt (Spalten »Name« und
 * »Ausdruck« oder »Wert«); ohne Kopfzeile gilt Name; Ausdruck; …; Kommentar in Spalte 4.
 */
export function parseParamsCsv(text) {
  const lines = splitCsv(text);
  const errors = [], rows = [];
  if (!lines.length) return { rows, errors: ["Datei ist leer"] };
  let col = { name: 0, expr: 1, comment: 3 };
  const head = lines[0].map((x) => x.trim().toLowerCase());
  if (head.includes("name")) {
    const ix = (...n) => head.findIndex((h) => n.includes(h));
    col = { name: ix("name"), expr: ix("ausdruck", "formel", "expression"), comment: ix("kommentar", "bemerkung", "comment") };
    if (col.expr < 0) col.expr = ix("wert", "value");
    lines.shift();
  }
  if (col.expr < 0) return { rows, errors: ["Spalte »Ausdruck« fehlt"] };
  const seen = new Set();
  lines.forEach((l, i) => {
    const name = (l[col.name] || "").trim(), expr = (l[col.expr] || "").trim();
    const where = `Zeile ${i + 2}`;
    if (!name) return errors.push(`${where}: Name fehlt`);
    if (!isValidName(name)) return errors.push(`${where}: ungültiger Name »${name}«`);
    if (!expr) return errors.push(`${where}: Ausdruck für ${name} fehlt`);
    if (seen.has(name)) return errors.push(`${where}: ${name} doppelt – erster Eintrag gilt`);
    seen.add(name);
    rows.push({ name, expr, comment: col.comment >= 0 ? (l[col.comment] || "").trim() : "" });
  });
  return { rows, errors };
}

/**
 * Eingelesene Parameter einarbeiten: gleiche Namen bekommen den neuen Ausdruck (Kommentar nur, wenn einer kommt),
 * neue werden angehängt, vorhandene ohne Gegenstück bleiben. Rückgabe { rows, added, updated } (Namen).
 */
export function mergeParams(existing, incoming) {
  const rows = (existing || []).map((r) => ({ ...r }));
  const added = [], updated = [];
  for (const n of incoming || []) {
    const r = rows.find((x) => x.name === n.name);
    if (!r) { rows.push({ ...n }); added.push(n.name); continue; }
    if (r.expr !== n.expr || (n.comment && n.comment !== r.comment)) {
      r.expr = n.expr;
      if (n.comment) r.comment = n.comment;
      updated.push(n.name);
    }
  }
  return { rows, added, updated };
}
