// Namensregeln für neue Dokumente: Vorlagen mit Platzhaltern, z. B. "BT-{n:3}" → "BT-001".
// Platzhalter: {n} laufende Nummer (mit :Stellen aufgefüllt), {projekt}, {datum} (JJJJ-MM-TT), {quelle} (nur Zeichnung).

export const PLACEHOLDERS = Object.freeze({
  n: "laufende Nummer, {n:3} = dreistellig",
  projekt: "Projektname",
  datum: "Datum JJJJ-MM-TT",
  quelle: "gezeichnetes Bauteil bzw. Baugruppe",
});
const TOKEN = /\{([a-z]+)(?::(\d))?\}/g;
const BAD_CHARS = /[\\/:*?"<>|]/; // nicht in Dateinamen (Export, Bauteile als eigene Datei)

/** Vorlage prüfen → {ok, value} | {ok:false, error}; allowed = erlaubte Platzhalter */
export function validateNameTemplate(v, allowed = ["n", "projekt", "datum"], { allowEmpty = false } = {}) {
  if (typeof v !== "string") return { ok: false, error: "Text erwartet" };
  const t = v.trim();
  if (!t) return allowEmpty ? { ok: true, value: "" } : { ok: false, error: "Vorlage darf nicht leer sein" };
  if (t.length > 60) return { ok: false, error: "Höchstens 60 Zeichen" };
  if (BAD_CHARS.test(t.replace(TOKEN, ""))) return { ok: false, error: 'Diese Zeichen gehen nicht: \\ / : * ? " < > |' };
  for (const m of t.matchAll(TOKEN)) {
    if (!allowed.includes(m[1])) return { ok: false, error: `Unbekannter Platzhalter {${m[1]}}. Erlaubt: ${allowed.map((a) => "{" + a + "}").join(", ")}` };
    if (m[2] && m[1] !== "n") return { ok: false, error: "Stellenzahl nur bei {n}" };
  }
  const rest = t.replace(TOKEN, "");
  if (/[{}]/.test(rest)) return { ok: false, error: "Geschweifte Klammer ohne gültigen Platzhalter" };
  return { ok: true, value: t };
}

const pad = (n, w) => String(n).padStart(w || 0, "0");
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;

/** Vorlage füllen; ctx = {n, projekt, datum: Date, quelle} */
export function formatName(template, ctx = {}) {
  return template.replace(TOKEN, (_, k, w) => {
    if (k === "n") return pad(ctx.n ?? 1, w ? Number(w) : 0);
    if (k === "datum") return isoDate(ctx.datum || new Date());
    return String(ctx[k] ?? "");
  }).replace(/\s+/g, " ").trim();
}

/**
 * Nächster freier Name: {n} zählt hoch, bis der Name frei ist; ohne {n} wird " (2)", " (3)" … angehängt.
 * start = erste Nummer (meist Anzahl gleichartiger Dokumente + 1).
 */
export function nextName(template, existing, ctx = {}, start = 1) {
  const taken = new Set(existing);
  const hasN = /\{n(?::\d)?\}/.test(template);
  for (let n = start; n < start + 10000; n++) {
    const name = formatName(template, { ...ctx, n });
    if (!taken.has(name)) return name;
    if (!hasN) break;
  }
  const base = formatName(template, { ...ctx, n: start });
  for (let k = 2; ; k++) if (!taken.has(`${base} (${k})`)) return `${base} (${k})`;
}
