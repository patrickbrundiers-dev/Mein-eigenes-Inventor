// Text in der Skizze (Fusion-Abgleich FU1): Schriftzug als geschlossene Konturen für Gravieren, Prägen,
// Ausschnitt und DXF. Umrisse aus DejaVu Sans (src/core/schrift-daten.js), Quadratkurven als kubische Bézier.
// Entität: { type: "text", p: Punkt-ID (Grundlinie, Ausrichtung je nach align), text, h (Schrifthöhe = Versalhöhe in mm),
//            angle (Grad), style: "normal" | "fett", align: "links" | "mitte" | "rechts", spacing (Zeichenabstand in mm) }
import { SCHRIFTEN } from "./schrift-daten.js";

/** Versalhöhe der Schrift in Schrifteinheiten (Höhe von »H«) – Schrifthöhe im Sinne der technischen Zeichnung */
const CAP = 1493;
/** Zeilenabstand als Vielfaches der Schrifthöhe */
export const LINE_FACTOR = 1.6;
export const TEXT_STYLES = [{ value: "normal", label: "Normal" }, { value: "fett", label: "Fett" }];
export const TEXT_ALIGN = [{ value: "links", label: "Links" }, { value: "mitte", label: "Mitte" }, { value: "rechts", label: "Rechts" }];
export const TEXT_PLACEHOLDERS = ["teilenummer", "name", "werkstoff", "datum"];

/** Platzhalterwerte eines Bauteils: Teilenummer, Name, Werkstoff (Kürzel), Datum (TT.MM.JJJJ) */
export function partTextVars(part, d = new Date()) {
  return { teilenummer: part?.number || "", name: part?.name || "", werkstoff: part?.material || "", datum: `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}` };
}

/** Standardwerte für ein neues Textelement */
export function defaultText() {
  return { text: "Text", h: 10, angle: 0, style: "normal", align: "links", spacing: 0 };
}

/**
 * Platzhalter ersetzen: {teilenummer}, {name}, {werkstoff}, {datum}. Unbekannte bleiben stehen.
 * vars: { teilenummer, name, werkstoff, datum }
 */
export function resolveText(text, vars = {}) {
  return String(text ?? "").replace(/\{(\w+)\}/g, (m, k) => (vars[k.toLowerCase()] !== undefined && vars[k.toLowerCase()] !== "" ? String(vars[k.toLowerCase()]) : m));
}

const glyphCache = new Map();
/** Pfad eines Zeichens als Konturen [[{t:"M"|"L"|"Q", …}]] in Schrifteinheiten */
function glyph(style, ch) {
  const key = style + ch;
  if (glyphCache.has(key)) return glyphCache.get(key);
  const font = SCHRIFTEN[style] || SCHRIFTEN.normal;
  const g = font.g[ch] || font.g["?"];
  const nums = (s) => s.trim().split(/[\s,]+/).map(Number);
  const contours = [];
  let cur = null;
  for (const m of g[1].matchAll(/([MLQZ])([^MLQZ]*)/g)) {
    const [op, arg] = [m[1], nums(m[2] || "")];
    if (op === "M") { cur = { start: [arg[0], arg[1]], segs: [] }; contours.push(cur); }
    else if (op === "L") cur.segs.push({ t: "L", to: [arg[0], arg[1]] });
    else if (op === "Q") cur.segs.push({ t: "Q", c: [arg[0], arg[1]], to: [arg[2], arg[3]] });
  }
  const out = { adv: g[0], contours };
  glyphCache.set(key, out);
  return out;
}

/** Breite einer Zeile in mm */
function lineWidth(line, style, s, spacing) {
  let w = 0;
  const chars = [...line];
  chars.forEach((ch, i) => { w += glyph(style, ch).adv * s + (i < chars.length - 1 ? spacing : 0); });
  return w;
}

/**
 * Konturen des Schriftzugs in Skizzenkoordinaten. anchor = {x, y} (Grundlinie der ersten Zeile).
 * Rückgabe: Liste von Konturen {kind: "path", start, segs: [{t:"line",to} | {t:"bez",c1,c2,to}], ents}
 * wie extractProfiles; vars ersetzt Platzhalter.
 */
export function textLoops(e, anchor, vars) {
  const h = Number(e.h);
  if (!anchor || !(h > 0)) return [];
  const style = e.style === "fett" ? "fett" : "normal";
  const s = h / CAP, spacing = Number(e.spacing) || 0;
  const a = ((Number(e.angle) || 0) * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
  const T = (x, y) => [anchor.x + x * cs - y * sn, anchor.y + x * sn + y * cs];
  const loops = [];
  resolveText(e.text, vars).split(/\r?\n/).forEach((line, li) => {
    const w = lineWidth(line, style, s, spacing);
    let x = e.align === "mitte" ? -w / 2 : e.align === "rechts" ? -w : 0;
    const y = -li * LINE_FACTOR * h;
    for (const ch of line) {
      const g = glyph(style, ch);
      for (const c of g.contours) {
        if (!c.segs.length) continue;
        const P = (q) => T(x + q[0] * s, y + q[1] * s);
        let prev = c.start;
        const segs = [];
        for (const sg of c.segs) {
          if (sg.to[0] === prev[0] && sg.to[1] === prev[1]) continue; // Nullsegmente machen dem Kernel Ärger
          if (sg.t === "L") segs.push({ t: "line", to: P(sg.to) });
          else {
            // quadratisch → kubisch: c1 = p0 + 2/3 (c − p0), c2 = p1 + 2/3 (c − p1)
            const c1 = [prev[0] + (2 / 3) * (sg.c[0] - prev[0]), prev[1] + (2 / 3) * (sg.c[1] - prev[1])];
            const c2 = [sg.to[0] + (2 / 3) * (sg.c[0] - sg.to[0]), sg.to[1] + (2 / 3) * (sg.c[1] - sg.to[1])];
            segs.push({ t: "bez", c1: P(c1), c2: P(c2), to: P(sg.to) });
          }
          prev = sg.to;
        }
        // Kontur exakt schließen (letzter Punkt = Start, sonst Linie zurück)
        const st = P(c.start), last = segs[segs.length - 1].to;
        if (Math.hypot(last[0] - st[0], last[1] - st[1]) > 1e-9) segs.push({ t: "line", to: st });
        else segs[segs.length - 1].to = st;
        loops.push({ kind: "path", start: st, segs, ents: [e.id] });
      }
      x += g.adv * s + spacing;
    }
  });
  return loops;
}

/**
 * Umriss-Rechteck (vier Ecken, gedreht) für Anzeige und Auswahl, in Skizzenkoordinaten.
 * Oben bis Versalhöhe, unten bis zur Unterlänge der letzten Zeile.
 */
export function textBox(e, anchor, vars) {
  const h = Number(e.h);
  if (!anchor || !(h > 0)) return null;
  const style = e.style === "fett" ? "fett" : "normal";
  const s = h / CAP, spacing = Number(e.spacing) || 0;
  const lines = resolveText(e.text, vars).split(/\r?\n/);
  const w = Math.max(0, ...lines.map((l) => lineWidth(l, style, s, spacing)));
  const x0 = e.align === "mitte" ? -w / 2 : e.align === "rechts" ? -w : 0;
  const top = h, bottom = -(lines.length - 1) * LINE_FACTOR * h - 0.3 * h;
  const a = ((Number(e.angle) || 0) * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
  const T = (x, y) => [anchor.x + x * cs - y * sn, anchor.y + x * sn + y * cs];
  return [T(x0, bottom), T(x0 + w, bottom), T(x0 + w, top), T(x0, top)];
}

/** Abtasten der Konturen als Polylinien (Anzeige, DXF), Sehnenfehler klein gegenüber der Schrifthöhe */
export function textPolylines(e, anchor, vars, steps = 8) {
  return textLoops(e, anchor, vars).map((l) => {
    const pts = [l.start];
    let cur = l.start;
    for (const sg of l.segs) {
      if (sg.t === "line") pts.push(sg.to);
      else for (let i = 1; i <= steps; i++) {
        const t = i / steps, u = 1 - t;
        pts.push([0, 1].map((k) => u * u * u * cur[k] + 3 * u * u * t * sg.c1[k] + 3 * u * t * t * sg.c2[k] + t * t * t * sg.to[k]));
      }
      cur = sg.to;
    }
    return pts;
  });
}
