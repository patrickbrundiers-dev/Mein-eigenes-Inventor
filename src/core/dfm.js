// Fertigungsprüfung Rohrlaser: Zuschnittliste gegen die Grenzen der Maschine prüfen.
// Regeln, Stufen und Startwerte übernommen aus der Rohrlaser-Kalkulation (dfm.py, Stammdaten Maschinen,
// Beispielmaschinen T03/T11). Rein fachlich, ändert nichts am Modell.
import { parseProfileId } from "./profilesearch.js";
import { fmt } from "./expr.js";

export const HINWEIS = "Hinweis", WARNUNG = "Warnung", FEHLER = "Fehler";
const RANK = { [HINWEIS]: 0, [WARNUNG]: 1, [FEHLER]: 2 };

/** Startwerte (0 = Regel aus). Schlüssel = Einstellung "fertigung.<key>" */
export const DFM_DEFAULTS = { stange: 6500, endbeschnitt: 10, greiferrest: 142, kuerzestesTeil: 0, huellkreis: 255, metergewicht: 36, knickSchenkel: 2, knickWand: 4 };

export const DFM_RULES = [
  "Teil zu lang (Fehler): Zuschnittlänge > Stangenlänge − Endbeschnitt − Greiferrest.",
  "Teil zu kurz (Fehler): Zuschnittlänge < kürzestes Teil der Maschine.",
  "Profil zu groß (Fehler): Hüllkreis-Ø des Querschnitts > Grenze der Maschine.",
  "Profil zu schwer (Fehler): Metergewicht > Grenze der Maschine.",
  "Knickrahmen, Schenkel zu kurz (Warnung): Schenkel < Faktor × Rohrmaß in der Rahmenebene.",
  "Knickrahmen, Wand zu dick (Hinweis): Wandstärke > Grenze – Knicken an der Abkantbank prüfen.",
];

/** Hüllkreis-Durchmesser eines Querschnitts aus seiner Profil-ID (null = unbekannt) */
export function envelopeDiameter(id) {
  const p = parseProfileId(id);
  if (!p) return null;
  const d = Object.fromEntries(Object.entries(p.dims).map(([k, v]) => [k, Number(v)]));
  switch (p.kind) {
    case "rohr": case "rund": return d.D;
    case "vierkant": case "vierkantvoll": return d.B * Math.SQRT2;
    case "flach": return Math.hypot(d.B, d.t);
    default: return Math.hypot(d.B, d.H); // Rechteckrohr, Winkel, U
  }
}

const n = (x, d = 1) => fmt(x, d);

/**
 * Zuschnitt-Zeilen (cutlist.cutListRows) prüfen. limits wie DFM_DEFAULTS; fehlende oder 0 = Regel aus.
 * Ergebnis: [{ level, rule, text, pos, profileId }], schwerste zuerst, je Zeile in Positionsreihenfolge.
 */
export function checkCutList(rows, limits = DFM_DEFAULTS) {
  const L = { ...DFM_DEFAULTS, ...limits };
  const out = [];
  const add = (r, level, rule, text) => out.push({ level, rule, text, pos: r.pos, profileId: r.profileId });
  const usable = L.stange > 0 ? L.stange - (L.endbeschnitt || 0) - (L.greiferrest || 0) : 0;
  for (const r of rows) {
    if (usable > 0 && r.length > usable + 1e-6)
      add(r, FEHLER, "Teil zu lang", `${n(r.length)} mm passt nicht auf die Stange (nutzbar ${n(usable, 0)} mm = ${n(L.stange, 0)} − ${n(L.endbeschnitt || 0, 0)} − ${n(L.greiferrest || 0, 0)})`);
    if (L.kuerzestesTeil > 0 && r.length < L.kuerzestesTeil - 1e-6)
      add(r, FEHLER, "Teil zu kurz", `${n(r.length)} mm kürzer als das kürzeste Teil der Maschine (${n(L.kuerzestesTeil, 0)} mm)`);
    const env = envelopeDiameter(r.profileId);
    if (L.huellkreis > 0 && env && env > L.huellkreis + 1e-6)
      add(r, FEHLER, "Profil zu groß", `Hüllkreis-Ø ${n(env)} mm über ${n(L.huellkreis)} mm`);
    if (L.metergewicht > 0 && r.kgm > L.metergewicht + 1e-9)
      add(r, FEHLER, "Profil zu schwer", `${n(r.kgm, 2)} kg/m über ${n(L.metergewicht)} kg/m`);
    const k = r.knick;
    if (k) {
      if (L.knickSchenkel > 0 && k.inPlane > 0) {
        const min = L.knickSchenkel * k.inPlane;
        const short = k.legs.map((a, i) => [i + 1, a]).filter(([, a]) => a < min - 1e-6);
        if (short.length) {
          const [i, a] = short.reduce((x, y) => (y[1] < x[1] ? y : x));
          add(r, WARNUNG, "Schenkel zu kurz", `${short.length} Schenkel unter ${n(L.knickSchenkel)} × ${n(k.inPlane)} mm (${n(min)} mm), kürzester Schenkel ${i} mit ${n(a)} mm`);
        }
      }
      if (L.knickWand > 0 && k.wall > L.knickWand + 1e-9)
        add(r, HINWEIS, "Wand zu dick zum Knicken", `Wand ${n(k.wall)} mm über ${n(L.knickWand)} mm: Knicken an der Abkantbank prüfen`);
    }
  }
  return out.sort((a, b) => RANK[b.level] - RANK[a.level] || a.pos - b.pos);
}

/** Grenzen aus den Benutzereinstellungen lesen (get = prefs.get) */
export function dfmLimits(get) {
  return Object.fromEntries(Object.keys(DFM_DEFAULTS).map((k) => [k, get("fertigung." + k) ?? DFM_DEFAULTS[k]]));
}
