// Biegetabellen (Werkzeuge Stufe 31): je Werkstoff und Blechdicke ein Raster Biegewinkel × Innenradius
// mit Werten der eigenen Abkantpresse. Daraus entsteht je Biegung ein wirksamer K-Faktor, sodass
// Kantteil und Knickrahmen weiter mit Biegezugabe = (ri + K·t)·θ rechnen.
//
// Werte: "k" K-Faktor, "zugabe" Biegezugabe BZ (Länge der neutralen Faser), "verkuerzung" v mit
// Abwicklung = Summe der Außenmaße + v. Außenmaße bis zum Schnittpunkt der Außenflächen
// (wie Maßbezug »außen« am Kantteil), daher BZ = v + 2·(ri + t)·tan(θ/2).
// Winkelbezug: "biege" = Biegewinkel (90 = rechtwinklig gekantet), "oeffnung" = Öffnungswinkel (180 − Biegewinkel).

import { evaluate, resolveParams } from "./expr.js";

const DEG = Math.PI / 180;
export const MODES = Object.freeze([
  { value: "verkuerzung", label: "Verkürzung v (mm)" },
  { value: "zugabe", label: "Biegezugabe (mm)" },
  { value: "k", label: "K-Faktor" },
]);
export const ANGLE_REFS = Object.freeze([
  { value: "biege", label: "Biegewinkel (90° = rechtwinklig)" },
  { value: "oeffnung", label: "Öffnungswinkel (90° = rechtwinklig, 180° = flach)" },
]);
export const RULES = Object.freeze([
  { value: "k", label: "K-Faktor (fest)" },
  { value: "tabelle", label: "Biegetabelle des Werkstoffs" },
  { value: "din", label: "DIN 6935 (aus Radius und Dicke)" },
]);
/** Grenzen, ab denen ein Wert noch als »auf dem Tabellenrand« gilt (wie Inventor T1–T3) */
export const TABLE_TOL = Object.freeze({ t: 0.01, r: 0.01, angle: 0.01 });
const MAX_TABLES = 100, MAX_N = 40;

const num = (x) => (typeof x === "string" ? (x.trim() === "" ? NaN : Number(x.trim().replace(",", ".").replace("−", "-"))) : x);

/** Eine Tabelle prüfen → {ok, value} | {ok:false, error}. Leere Zellen (null/"") sind erlaubt. */
export function validateBendTable(tb) {
  if (!tb || typeof tb !== "object") return { ok: false, error: "Biegetabelle erwartet" };
  const material = String(tb.material ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/.test(material)) return { ok: false, error: "Werkstoff-Kürzel fehlt" };
  const t = num(tb.t);
  if (!(t > 0 && t <= 50)) return { ok: false, error: "Blechdicke zwischen 0 und 50 mm angeben" };
  if (!MODES.some((m) => m.value === tb.mode)) return { ok: false, error: "Art der Werte fehlt" };
  const ref = tb.ref ?? "biege";
  if (!ANGLE_REFS.some((m) => m.value === ref)) return { ok: false, error: "Winkelbezug fehlt" };
  const fallbackK = num(tb.fallbackK ?? 0.33);
  if (!(fallbackK >= 0 && fallbackK <= 1)) return { ok: false, error: "Ersatz-K-Faktor zwischen 0 und 1" };
  const radii = (tb.radii || []).map(num), angles = (tb.angles || []).map(num);
  if (!radii.length || !angles.length) return { ok: false, error: "Mindestens ein Radius und ein Winkel" };
  if (radii.length > MAX_N || angles.length > MAX_N) return { ok: false, error: `Höchstens ${MAX_N} Radien und ${MAX_N} Winkel` };
  if (radii.some((r) => !(r >= 0 && r <= 1000))) return { ok: false, error: "Radien zwischen 0 und 1000 mm" };
  if (angles.some((a) => !(a > 0 && a < 180))) return { ok: false, error: "Winkel zwischen 0° und 180°" };
  const asc = (l) => l.every((v, i) => i === 0 || v > l[i - 1]);
  if (!asc(radii)) return { ok: false, error: "Radien aufsteigend und ohne Doppelte" };
  if (!asc(angles)) return { ok: false, error: "Winkel aufsteigend und ohne Doppelte" };
  const rows = tb.values || [];
  if (rows.length !== angles.length || rows.some((r) => !Array.isArray(r) || r.length !== radii.length)) return { ok: false, error: "Tabelle passt nicht zu Winkeln und Radien" };
  const values = rows.map((r) => r.map((v) => (v === null || v === undefined || v === "" ? null : num(v))));
  for (const v of values.flat()) {
    if (v === null) continue;
    if (!Number.isFinite(v)) return { ok: false, error: "Zellen: Zahl oder leer" };
    if (tb.mode === "k" && !(v >= 0 && v <= 1)) return { ok: false, error: "K-Faktoren zwischen 0 und 1" };
    if (Math.abs(v) > 1000) return { ok: false, error: "Zellwert zu groß" };
  }
  if (!values.flat().some((v) => v !== null)) return { ok: false, error: "Tabelle hat keinen Wert" };
  const out = { material, t, mode: tb.mode, ref, fallbackK, radii, angles, values };
  const note = String(tb.note ?? "").trim();
  if (note) out.note = note.slice(0, 120);
  return { ok: true, value: out };
}

/** Alle Tabellen prüfen; Werkstoff + Dicke eindeutig */
export function validateBendTables(v) {
  if (!Array.isArray(v)) return { ok: false, error: "Liste von Biegetabellen erwartet" };
  if (v.length > MAX_TABLES) return { ok: false, error: `Höchstens ${MAX_TABLES} Biegetabellen` };
  const out = [];
  for (const tb of v) {
    const r = validateBendTable(tb);
    if (!r.ok) return { ok: false, error: `${tb?.material || "Tabelle"} ${tb?.t ?? ""} mm: ${r.error}` };
    if (out.some((x) => sameTable(x, r.value))) return { ok: false, error: `Für ${r.value.material} ${fmt(r.value.t)} mm gibt es schon eine Tabelle` };
    out.push(r.value);
  }
  return { ok: true, value: out };
}

export const tableId = (tb) => `${tb.material}|${Math.round(tb.t * 1000)}`;
/** Gleicher Werkstoff und Dicke innerhalb der Toleranz → dieselbe Tabelle */
export const sameTable = (a, b) => a.material === b.material && Math.abs(a.t - b.t) <= TABLE_TOL.t;
const fmt = (v, d = 2) => String(Math.round(v * 10 ** d) / 10 ** d).replace(".", ",");

// ---------- Ablage: Einstellungen (eigene) und Kopien aus der Projektdatei ----------
let user = [], project = [];
export function setUserBendTables(list) { user = Array.isArray(list) ? list : []; }
export function setProjectBendTables(list) { project = Array.isArray(list) ? list : []; }
/** Tabelle für Werkstoff und Dicke: eigene vor Projektkopie */
export function findBendTable(material, t) {
  const hit = (l) => l.find((tb) => tb.material === material && Math.abs(tb.t - t) <= TABLE_TOL.t);
  return hit(user) || hit(project) || null;
}
/** Kopien der Tabellen, die Teile im Projekt mit Regel »tabelle« brauchen */
export function projectBendTableCopies(prj) {
  const out = new Map();
  for (const [material, t] of bendTableUses(prj)) { const tb = findBendTable(material, t); if (tb) out.set(tableId(tb), tb); }
  return [...out.values()];
}
/** Beim Öffnen: gültige Tabellenkopien aus der Datei übernehmen (eigene Tabellen gehen vor) */
export function adoptProjectBendTables(prj) {
  const r = validateBendTables(Array.isArray(prj?.bendTables) ? prj.bendTables : []);
  setProjectBendTables(r.ok ? r.value : []);
  return r.ok ? r.value : [];
}
/** Werkstoff/Dicke-Paare der Bauteile, die eine Biegetabelle benutzen (Kantteil: t, Knickrahmen: Wand) */
export function bendTableUses(prj) {
  const out = [];
  for (const d of prj?.docs || []) {
    if (d?.kind !== "part") continue;
    // Dicke kann ein Parameter oder eine Formel sein (wie im Kernel ausgewertet)
    let scope = null;
    const val = (x) => {
      try { scope ??= resolveParams(d.params || []).values; return evaluate(String(x ?? ""), scope); } catch { return NaN; }
    };
    for (const f of d.features || []) {
      if (f.suppressed) continue;
      if (f.type === "kantteil" && f.rule === "tabelle") out.push([d.material || "S235", val(f.t ?? "2")]);
      if (f.type === "knickrahmen" && f.bendRule === "tabelle") out.push([d.material || "S235", val(f.dims?.t)]);
    }
  }
  return out.filter(([, t]) => t > 0);
}

// ---------- Rechnung ----------
/** K-Faktor aus einem Tabellenwert; θ in Grad (Biegewinkel) */
export function kFromValue(mode, v, ri, t, theta) {
  if (mode === "k") return v;
  const th = theta * DEG;
  const ba = mode === "zugabe" ? v : v + 2 * (ri + t) * Math.tan(th / 2);
  return (ba / th - ri) / t;
}

/** Korrekturfaktor nach DIN 6935: k = 0,65 + 0,5·lg(r/s) für r/s < 5, sonst 1; bezogen auf s/2 → K = k/2 */
export function dinK(ri, t) {
  if (!(t > 0)) return NaN;
  const q = ri / t;
  const k = q >= 5 ? 1 : q > 0 ? 0.65 + 0.5 * Math.log10(q) : 0;
  return Math.max(0, Math.min(0.5, k / 2));
}

/** Lineare Lage x in einer aufsteigenden Liste → [i0, i1, w] oder null (außerhalb, mit Randtoleranz) */
function bracket(list, x, tol) {
  if (x < list[0] - tol || x > list[list.length - 1] + tol) return null;
  if (list.length === 1) return [0, 0, 0];
  const xc = Math.min(Math.max(x, list[0]), list[list.length - 1]);
  let i = 0;
  while (i < list.length - 2 && xc > list[i + 1]) i++;
  const w = (xc - list[i]) / (list[i + 1] - list[i]);
  return w <= 1e-12 ? [i, i, 0] : w >= 1 - 1e-12 ? [i + 1, i + 1, 0] : [i, i + 1, w];
}

/**
 * Wert aus der Tabelle für Innenradius ri und Biegewinkel theta (°), bilinear interpoliert.
 * → {value} | {error} (außerhalb der Tabelle oder Nachbarzelle leer)
 */
export function tableValue(tb, ri, theta) {
  const a = tb.ref === "oeffnung" ? 180 - theta : theta;
  const ba = bracket(tb.angles, a, TABLE_TOL.angle), br = bracket(tb.radii, ri, TABLE_TOL.r);
  if (!ba) return { error: `Winkel ${fmt(a)}° außerhalb der Tabelle (${fmt(tb.angles[0])}–${fmt(tb.angles[tb.angles.length - 1])}°)` };
  if (!br) return { error: `Innenradius ${fmt(ri)} mm außerhalb der Tabelle (${fmt(tb.radii[0])}–${fmt(tb.radii[tb.radii.length - 1])} mm)` };
  const [a0, a1, wa] = ba, [r0, r1, wr] = br;
  const cell = (i, j) => tb.values[i][j];
  const need = [[a0, r0], [a0, r1], [a1, r0], [a1, r1]];
  if (need.some(([i, j]) => cell(i, j) === null)) return { error: `Leere Zelle bei ${fmt(tb.angles[a0])}°/${fmt(tb.radii[r0])} mm` };
  const lerp = (p, q, w) => p + (q - p) * w;
  return { value: lerp(lerp(cell(a0, r0), cell(a0, r1), wr), lerp(cell(a1, r0), cell(a1, r1), wr), wa) };
}

/**
 * Biegeregel eines Features auflösen. rule ∈ k | tabelle | din; k = fester K-Faktor des Features (auch Ersatz ohne Tabelle).
 * → { kOf(thetaDeg) → K, used: [{angle, k, source}], warnings: [], label }
 */
export function bendRule({ rule = "k", material, t, ri, k }) {
  const used = [], warnings = [];
  const note = (angle, K, source) => { used.push({ angle, k: K, source }); return K; };
  if (rule === "din") {
    const K = dinK(ri, t);
    return { kOf: (a) => note(a, K, "din"), used, warnings, label: `DIN 6935 (K ${fmt(K, 3)})` };
  }
  if (rule !== "tabelle") return { kOf: (a) => note(a, k, "fest"), used, warnings, label: `K-Faktor ${fmt(k, 3)}` };
  const tb = findBendTable(material, t);
  if (!tb) {
    warnings.push(`Keine Biegetabelle für ${material} ${fmt(t)} mm – gerechnet mit K ${fmt(k, 3)}`);
    return { kOf: (a) => note(a, k, "ersatz"), used, warnings, label: `K-Faktor ${fmt(k, 3)} (keine Tabelle)` };
  }
  const kOf = (a) => {
    const r = tableValue(tb, ri, a);
    if (r.error) { warnings.push(`${r.error} – Ersatz-K ${fmt(tb.fallbackK, 3)}`); return note(a, tb.fallbackK, "ersatz"); }
    const K = kFromValue(tb.mode, r.value, ri, t, a);
    if (!(K >= 0 && K <= 1)) { warnings.push(`Tabellenwert bei ${fmt(a)}° ergibt K ${fmt(K, 3)} (nicht zwischen 0 und 1) – Ersatz-K ${fmt(tb.fallbackK, 3)}`); return note(a, tb.fallbackK, "ersatz"); }
    return note(a, K, "tabelle");
  };
  return { kOf, used, warnings, label: `Biegetabelle ${material} ${fmt(t)} mm` };
}

/** Kurztext für Status und Abwicklung: »Biegetabelle S235 2 mm, K 0,37 / 0,36« */
export function ruleSummary(r) {
  if (!r.used.length) return r.label;
  return `${r.label}, K ${r.used.map((u) => fmt(u.k, 3)).join(" / ")}`;
}

// ---------- Austausch als CSV (Excel: Semikolon, Dezimalkomma) ----------
/** Kopfzeile: »Winkel\Radius;1;2;3«, dann je Winkel eine Zeile; leere Zelle = kein Wert */
export function tableToCsv(tb) {
  const c = (v) => (v === null ? "" : String(v).replace(".", ","));
  return [["Winkel\\Radius", ...tb.radii.map(c)].join(";"), ...tb.angles.map((a, i) => [c(a), ...tb.values[i].map(c)].join(";"))].join("\r\n");
}

/** CSV oder aus Excel kopierte Zellen (Tab) → {ok, radii, angles, values} | {ok:false, error} */
export function parseTableText(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
  if (lines.length < 2) return { ok: false, error: "Mindestens Kopfzeile mit Radien und eine Winkelzeile" };
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const cells = lines.map((l) => l.split(sep).map((x) => x.trim()));
  const radii = cells[0].slice(1).map(num);
  if (!radii.length || radii.some((r) => !Number.isFinite(r))) return { ok: false, error: "Kopfzeile: erste Zelle frei lassen oder beschriften, dann die Radien" };
  const angles = [], values = [];
  for (const [i, row] of cells.slice(1).entries()) {
    const a = num(row[0]);
    if (!Number.isFinite(a)) return { ok: false, error: `Zeile ${i + 2}: Winkel fehlt` };
    angles.push(a);
    values.push(radii.map((_, j) => { const v = row[j + 1]; return v === undefined || v === "" ? null : num(v); }));
  }
  if (values.flat().some((v) => v !== null && !Number.isFinite(v))) return { ok: false, error: "Zellen: Zahl oder leer" };
  return { ok: true, radii, angles, values };
}
