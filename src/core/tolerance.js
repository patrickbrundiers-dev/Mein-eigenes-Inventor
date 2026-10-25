// Maßtoleranzen für Zeichnungen: Allgemeintoleranzen nach ISO 2768-1 und Toleranzangabe am einzelnen Maß.
// Bewusst keine Kernel-Toleranz: die Rechengenauigkeit von OpenCascade bleibt fest (Recherche 25.10.2026).

export const CLASSES = Object.freeze([
  { value: "f", label: "f (fein)" },
  { value: "m", label: "m (mittel)" },
  { value: "c", label: "c (grob)" },
  { value: "v", label: "v (sehr grob)" },
]);

// Längenmaße: Obergrenze des Nennmaßbereichs → Grenzabmaß ± je Klasse (null = in dieser Klasse nicht festgelegt)
const LINEAR = [
  [3, { f: 0.05, m: 0.1, c: 0.2, v: null }],
  [6, { f: 0.05, m: 0.1, c: 0.3, v: 0.5 }],
  [30, { f: 0.1, m: 0.2, c: 0.5, v: 1 }],
  [120, { f: 0.15, m: 0.3, c: 0.8, v: 1.5 }],
  [400, { f: 0.2, m: 0.5, c: 1.2, v: 2.5 }],
  [1000, { f: 0.3, m: 0.8, c: 2, v: 4 }],
  [2000, { f: 0.5, m: 1.2, c: 3, v: 6 }],
  [4000, { f: null, m: 2, c: 4, v: 8 }],
];
// Rundungshalbmesser und Fasenhöhen
const RADIUS = [
  [3, { f: 0.2, m: 0.2, c: 0.4, v: 0.4 }],
  [6, { f: 0.5, m: 0.5, c: 1, v: 1 }],
  [Infinity, { f: 1, m: 1, c: 2, v: 2 }],
];

/** Klasse aus dem Schriftfeldtext (»ISO 2768-mK« → "m"), sonst null */
export function classOf(text) {
  const m = /2768\s*-?\s*([fmcv])/i.exec(String(text || ""));
  return m ? m[1].toLowerCase() : null;
}

/** Schriftfeldtext für eine Klasse */
export const classText = (cls) => "ISO 2768-" + cls;

/** Allgemeintoleranz ± für ein Nennmaß (mm); kind "rad" nimmt die Tabelle für Radien und Fasen. null = keine Angabe nach Norm. */
export function generalTolerance(cls, nominal, kind = "lin") {
  const n = Math.abs(nominal);
  if (!CLASSES.some((c) => c.value === cls) || !(n >= 0.5)) return null;
  const rows = kind === "rad" ? RADIUS : LINEAR;
  const row = rows.find(([max]) => n <= max);
  return row ? row[1][cls] : null;
}

const MIN_TOL = 0.001; // Auflösung der Anzeige (drei Nachkommastellen)
const num = (v, d = 3) => {
  const s = (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace(/\.?0+$/, "");
  return s.replace(".", ",").replace(/^-/, "−");
};
const signed = (v) => (v > 0 ? "+" + num(v) : v < 0 ? num(v) : "0");

export const TOL_KINDS = Object.freeze([
  { value: "", label: "keine (Allgemeintoleranz gilt)" },
  { value: "allg", label: "Allgemeintoleranz anzeigen" },
  { value: "sym", label: "± symmetrisch" },
  { value: "abm", label: "Grenzabmaße oben/unten" },
  { value: "pass", label: "ISO-Passung (z. B. H7)" },
]);

/** Toleranz eines Maßes prüfen → {ok, value} | {ok:false, error}. value = null heißt keine Angabe. */
export function validateTolerance(t) {
  if (t == null || t === "" || t.art === "" || t.art == null) return { ok: true, value: null };
  if (typeof t !== "object") return { ok: false, error: "Toleranz erwartet" };
  const n = (x) => (typeof x === "string" ? Number(x.replace(",", ".").replace("−", "-")) : x);
  switch (t.art) {
    case "allg": return { ok: true, value: { art: "allg" } };
    case "sym": {
      const v = Math.abs(n(t.v));
      if (!(v >= MIN_TOL && v < 1000)) return { ok: false, error: "± mindestens 0,001 mm" };
      return { ok: true, value: { art: "sym", v } };
    }
    case "abm": {
      const o = n(t.o), u = n(t.u);
      if (!Number.isFinite(o) || !Number.isFinite(u)) return { ok: false, error: "Oberes und unteres Abmaß als Zahl angeben" };
      if (!(o > u)) return { ok: false, error: "Oberes Abmaß muss größer als das untere sein" };
      if (Math.abs(o) >= 1000 || Math.abs(u) >= 1000) return { ok: false, error: "Abmaß zu groß" };
      if ([o, u].some((x) => x !== 0 && Math.abs(x) < MIN_TOL)) return { ok: false, error: "Abmaße auf 0,001 mm genau (oder 0)" };
      return { ok: true, value: { art: "abm", o, u } };
    }
    case "pass": {
      const p = String(t.pass || "").trim();
      if (!/^[A-Za-z]{1,2}\d{1,2}$/.test(p)) return { ok: false, error: "Passung wie H7, h6 oder js9 angeben" };
      return { ok: true, value: { art: "pass", pass: p } };
    }
    default: return { ok: false, error: "Unbekannte Toleranzart: " + t.art };
  }
}

/**
 * Text hinter dem Maßwert, z. B. "±0,1", "+0,2/−0,1", "H7".
 * cls = Klasse der Zeichnung (für »Allgemeintoleranz anzeigen«), kind "lin" | "rad".
 */
export function toleranceText(t, nominal, cls, kind = "lin") {
  if (!t?.art) return "";
  if (t.art === "allg") { const g = generalTolerance(cls, nominal, kind); return g == null ? "" : "±" + num(g); }
  if (t.art === "sym") return "±" + num(t.v);
  if (t.art === "abm") return t.o === -t.u ? "±" + num(t.o) : ` ${signed(t.o)}/${signed(t.u)}`;
  if (t.art === "pass") return " " + t.pass;
  return "";
}
