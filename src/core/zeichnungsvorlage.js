// Eigene Zeichnungsvorlage (Fusion-Abgleich FU12): Firmenangaben, Logo, Zusatzfelder im Schriftfeld,
// Liniengruppe und Maßzahlhöhe. Liegt als Vorgabe in den Einstellungen und wird beim Anlegen einer Zeichnung
// ins Projekt übernommen (project.drawingTemplate), damit die Datei auf jedem Rechner gleich aussieht.

/** Liniengruppen nach DIN EN ISO 128-20 (breit / schmal); Rahmen eine Stufe breiter */
export const LINE_GROUPS = {
  "0.35": { vis: 0.35, hid: 0.18, thin: 0.18, frame: 0.5 },
  "0.5": { vis: 0.5, hid: 0.25, thin: 0.18, frame: 0.7 },
  "0.7": { vis: 0.7, hid: 0.35, thin: 0.25, frame: 1.0 },
};
export const DIM_TEXT_SIZES = [2.5, 3.5, 5];
export const MAX_EXTRA = 3;
const MAX_LOGO = 400 * 1024;

export const DEFAULT_TEMPLATE = Object.freeze({ firma: "", ersteller: "", logo: null, extra: [], lineGroup: "0.5", dimText: 3.5 });

const str = (v, n) => typeof v === "string" && v.length <= n;

/** Vorlage prüfen → { ok, value } oder { ok: false, error } */
export function validateTemplate(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, error: "Vorlage erwartet" };
  const out = { ...DEFAULT_TEMPLATE, extra: [] };
  for (const k of ["firma", "ersteller"]) {
    if (v[k] === undefined) continue;
    if (!str(v[k], 300)) return { ok: false, error: `${k === "firma" ? "Firma" : "Gezeichnet"}: höchstens 300 Zeichen` };
    out[k] = v[k];
  }
  if (v.logo !== undefined && v.logo !== null) {
    if (typeof v.logo !== "string" || !/^data:image\/(png|jpeg);base64,/.test(v.logo)) return { ok: false, error: "Logo: PNG oder JPG erwartet" };
    if (v.logo.length > MAX_LOGO) return { ok: false, error: "Logo zu groß (höchstens 400 KB)" };
    out.logo = v.logo;
  }
  if (v.extra !== undefined) {
    if (!Array.isArray(v.extra) || v.extra.length > MAX_EXTRA) return { ok: false, error: `Höchstens ${MAX_EXTRA} Zusatzfelder` };
    for (const f of v.extra) {
      if (!f || !str(f.label, 24) || !f.label.trim() || (f.value !== undefined && !str(f.value, 80))) return { ok: false, error: "Zusatzfeld: Bezeichnung (bis 24 Zeichen) und Vorgabewert (bis 80) erwartet" };
      out.extra.push({ label: f.label.trim(), value: f.value || "" });
    }
    if (new Set(out.extra.map((f) => f.label)).size !== out.extra.length) return { ok: false, error: "Zusatzfelder müssen verschieden heißen" };
  }
  if (v.lineGroup !== undefined) {
    if (!LINE_GROUPS[String(v.lineGroup)]) return { ok: false, error: "Liniengruppe 0,35, 0,5 oder 0,7" };
    out.lineGroup = String(v.lineGroup);
  }
  if (v.dimText !== undefined) {
    if (!DIM_TEXT_SIZES.includes(Number(v.dimText))) return { ok: false, error: "Maßzahlhöhe 2,5, 3,5 oder 5 mm" };
    out.dimText = Number(v.dimText);
  }
  return { ok: true, value: out };
}

/** Gültige Vorlage oder die Standardvorlage */
export function templateOf(v) {
  const r = v ? validateTemplate(v) : null;
  return r?.ok ? r.value : { ...DEFAULT_TEMPLATE, extra: [] };
}

/** Weicht die Vorlage vom Standard ab (dann gehört sie ins Projekt)? */
export const isCustomTemplate = (t) => !!(t && (t.logo || t.extra?.length || t.lineGroup !== DEFAULT_TEMPLATE.lineGroup || t.dimText !== DEFAULT_TEMPLATE.dimText));

/** Zusatzfelder einer Zeichnung: Bezeichnung aus der Vorlage, Wert aus dem Schriftfeld der Zeichnung oder Vorgabe */
export function extraFields(t, title = {}) {
  return (t?.extra || []).map((f) => ({ label: f.label, value: title.extra?.[f.label] ?? f.value ?? "" }));
}
