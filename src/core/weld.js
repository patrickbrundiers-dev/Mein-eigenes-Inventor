// Schweißnähte (MegaCAD-Abgleich M9): Nahtarten, Symbol nach ISO 2553 (System A) für die Zeichnung, Nahtliste.
// Reine Rechnung; die Nähte entstehen im Kern aus gewählten Kanten (Feature „Schweißnaht“) oder aus den
// Anschlussblechen (Platte/Rippe mit Kehlnaht) und kommen als result.welds zurück.
//
// Nahtmaß: Kehlnaht a (Nahtdicke), Stumpfnähte s. Nahtquerschnitt für Masse und Schweißgut (Näherung, ohne
// Überhöhung): Kehlnaht a², V-Naht (60°) s²·tan 30° + s·b mit Spalt b = 1 mm, HV-Naht (45°) s²/2 + s·b, I-Naht s·b,
// Y-Naht (s−c)²·tan(α/2) + s·b, K-Naht 2·((s−c)/2)²·tan β + s·b. Mit Nahtvorbereitung gelten deren α/β, c und b.

import { materialOf } from "./materials.js";

export const WELD_KINDS = {
  kehl: { label: "Kehlnaht", dim: "a" },
  hv: { label: "HV-Naht", dim: "s" },
  v: { label: "V-Naht", dim: "s" },
  i: { label: "I-Naht", dim: "s" },
  y: { label: "Y-Naht", dim: "s" },
  k: { label: "K-Naht", dim: "s" },
};
/**
 * Nahtvorbereitung nach ISO 9692-1 (Stahl, Lichtbogenschweißen): Vorgabewerte je Fugenform.
 * angle = Öffnungswinkel α (V, Y) bzw. Flankenwinkel β (HV, K) in Grad, root = Steghöhe c, gap = Spalt b in mm.
 */
export const PREP_DEFAULTS = {
  i: { angle: 0, root: 0, gap: 1, range: "s ≤ 4 (einseitig) bzw. s ≤ 8 (beidseitig)" },
  v: { angle: 60, root: 1, gap: 2, range: "3 < s ≤ 10, α 40 … 60°, c ≤ 2, b ≤ 4" },
  hv: { angle: 45, root: 1, gap: 2, range: "3 < s ≤ 10, β 35 … 60°, c ≤ 2, b 2 … 4" },
  y: { angle: 60, root: 2, gap: 2, range: "s > 5, α 40 … 60°, c 1 … 4, b 1 … 4" },
  k: { angle: 45, root: 2, gap: 2, range: "s > 10, β 35 … 60°, c ≤ 2, b 1 … 4" },
};
/** Fugenformen mit angearbeiteter Flanke */
export const isPrepKind = (kind) => kind === "v" || kind === "hv" || kind === "y" || kind === "k";
/** Winkel einer Flanke am einzelnen Blech: V und Y je halber Öffnungswinkel, HV und K der Flankenwinkel */
export const bevelAngle = (kind, angle) => (kind === "v" || kind === "y" ? angle / 2 : angle);

/**
 * Fugenflanken an einem Blech der Dicke t: [{side, depth, width}], side +1 = an der Fläche der gewählten Kante,
 * −1 = an der Gegenfläche (K-Naht); depth = Flankenhöhe in die Blechdicke, width = Rücksprung auf der Fläche.
 */
export function prepBevels(kind, t, { angle, root }) {
  if (!isPrepKind(kind)) return [];
  const b = (bevelAngle(kind, angle) * Math.PI) / 180;
  if (!(b > 0 && b <= (80 * Math.PI) / 180)) throw new Error("Flankenwinkel am Blech 1 … 80°");
  if (!(root >= 0)) throw new Error("Steghöhe c muss ≥ 0 sein");
  const D = kind === "k" ? (t - root) / 2 : t - root;
  if (!(D > 0.1)) throw new Error(`Steghöhe c ${fmt(root)} mm passt nicht in die Blechdicke ${fmt(t)} mm`);
  const one = (side) => ({ side, depth: D, width: D * Math.tan(b) });
  return kind === "k" ? [one(1), one(-1)] : [one(1)];
}

/**
 * Querschnitt des wegfallenden Keils, u = von der Fläche in die Blechdicke, w = von der Stirnfläche ins Blech;
 * reicht um ext über den Körper hinaus, damit der Schnitt sauber durchgeht.
 */
export function bevelPolygon(depth, width, ext = 1) {
  const L = Math.hypot(depth, width), ex = (depth / L) * ext, ew = (width / L) * ext;
  const A = [depth + ex, -ew], B = [-ex, width + ew];
  return [A, [A[0], -ext], [-ext, -ext], [-ext, B[1]], B];
}
export const WELD_SIDES = { pfeil: "Pfeilseite", gegen: "Gegenseite", beide: "beidseitig" };
const GAP = 1; // mm Wurzelspalt für Stumpfnähte

/** Nahtquerschnitt in mm² je Seite */
export function weldArea(kind, a, prep = null) {
  if (!(a > 0)) return 0;
  if (kind === "kehl") return a * a;
  const d = PREP_DEFAULTS[kind] || PREP_DEFAULTS.i;
  const ang = ((prep?.angle ?? (kind === "v" ? 60 : kind === "hv" ? 45 : d.angle)) * Math.PI) / 180;
  const b = prep?.gap ?? GAP, c = Math.min(a, prep?.root ?? (kind === "y" || kind === "k" ? d.root : 0));
  if (kind === "v") return (a - c) ** 2 * Math.tan(ang / 2) + a * b;
  if (kind === "y") return (a - c) ** 2 * Math.tan(ang / 2) + a * b;
  if (kind === "hv") return ((a - c) ** 2 * Math.tan(ang)) / 2 + a * b;
  if (kind === "k") return 2 * (((a - c) / 2) ** 2 * Math.tan(ang)) / 2 + a * b;
  return a * b;
}

/** Masse Schweißgut in kg (Dichte g/cm³) */
export function weldMass(w, density = 7.85) {
  const sides = w.side === "beide" ? 2 : 1;
  return (weldArea(w.kind, w.a, w.prep) * sides * (w.length || 0) * density) / 1e6;
}

/** Kurztext, z. B. „a4 Kehlnaht beidseitig, umlaufend, Montage“ */
export function weldText(w) {
  const k = WELD_KINDS[w.kind] || WELD_KINDS.kehl;
  const parts = [`${k.dim}${fmt(w.a)} ${k.label}`];
  if (w.side && w.side !== "pfeil") parts[0] += " " + WELD_SIDES[w.side];
  if (w.prep) parts.push(prepText(w.kind, w.prep));
  if (w.around) parts.push("umlaufend");
  if (w.field) parts.push("Montage");
  return parts.join(", ");
}

/** Kurztext der Nahtvorbereitung, z. B. „α 60°, c 2, b 2 (ISO 9692-1)“ */
export function prepText(kind, prep) {
  if (!prep) return "";
  const a = kind === "hv" || kind === "k" ? "β" : "α";
  return (kind === "i" ? "" : `${a} ${fmt(prep.angle)}°, c ${fmt(prep.root)}, `) + `b ${fmt(prep.gap)} (ISO 9692-1)`;
}

/**
 * Nahtliste: gleiche Art, gleiches Maß, gleiche Seite und Kennzeichen = eine Zeile.
 * welds: [{kind, a, side, around, field, length, part?, qty?}]. Rückgabe [{pos, kind, a, side, around, field, count, length, mass, parts}]
 */
export function weldRows(welds, density = 7.85) {
  const map = new Map();
  for (const w of welds) {
    const key = [w.kind, Math.round(w.a * 10), w.side || "pfeil", !!w.around, !!w.field, w.prep ? prepText(w.kind, w.prep) : ""].join("|");
    const q = w.qty || 1;
    if (!map.has(key)) map.set(key, { kind: w.kind, a: w.a, side: w.side || "pfeil", around: !!w.around, field: !!w.field, ...(w.prep ? { prep: w.prep } : {}), count: 0, length: 0, mass: 0, parts: new Set() });
    const r = map.get(key);
    r.count += q;
    r.length += (w.length || 0) * q;
    r.mass += weldMass(w, w.density ?? density) * q;
    if (w.part) r.parts.add(w.part);
  }
  const order = Object.keys(WELD_KINDS);
  return [...map.values()]
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.a - b.a)
    .map((r, i) => ({ ...r, pos: i + 1, parts: [...r.parts].join(", ") }));
}

/** Nähte aus Quellen [{part, result, qty}] (wie für die Zuschnittliste) mit Bauteilname, Anzahl und Dichte */
export function collectWelds(sources) {
  const out = [];
  for (const s of sources) for (const w of s.result?.welds || []) out.push({ ...w, part: s.part.name, qty: s.qty || 1, density: materialOf(s.part.material).density });
  return out;
}

/** Nahtliste als CSV (Semikolon, deutsches Zahlenformat) */
export function weldCsv(rows, title = "") {
  const f = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toString().replace(".", ",");
  const head = ["Pos", "Nahtart", "Maß", "Seite", "Umlaufend", "Montage", "Anzahl", "Länge gesamt mm", "Schweißgut kg", "Bauteil", "Nahtvorbereitung"];
  const lines = rows.map((r) => [r.pos, WELD_KINDS[r.kind].label, WELD_KINDS[r.kind].dim + f(r.a), WELD_SIDES[r.side], r.around ? "ja" : "", r.field ? "ja" : "", r.count, f(r.length), f(r.mass, 3), r.parts, r.prep ? prepText(r.kind, r.prep) : ""]);
  const all = [head, ...lines, [], ["Summe", "", "", "", "", "", rows.reduce((a, r) => a + r.count, 0), f(rows.reduce((a, r) => a + r.length, 0)), f(rows.reduce((a, r) => a + r.mass, 0), 3), ""]];
  if (title) all.unshift([title]);
  return "﻿" + all.map((r) => r.join(";")).join("\r\n") + "\r\n";
}

/**
 * Nahtsymbol nach ISO 2553 (System A) als Zeichenanweisungen in Blatt-mm.
 * anchor = Nahtstelle [x, y], at = Knick zwischen Pfeil- und Bezugslinie [x, y]; die Bezugslinie läuft
 * waagrecht vom Knick weg (nach rechts, wenn der Knick rechts vom Anker liegt, sonst nach links).
 * Pfeilseite: Symbol unter der Volllinie; Gegenseite: Symbol über der Strichlinie; beidseitig: beides, ohne Strichlinie.
 * Rückgabe { lines: [{x1,y1,x2,y2,dashed?}], polys: [{pts, closed, fill?}], circles: [{cx,cy,r}], texts: [{x,y,text,anchor}], arrow: {pts} }
 */
export function weldSymbol(w, anchor, at) {
  const L = 22, h = 3, gapD = 1.2;
  const dirX = at[0] >= anchor[0] ? 1 : -1;
  const [kx, ky] = at;
  const out = { lines: [], polys: [], circles: [], texts: [] };
  // Pfeillinie mit Pfeilspitze an der Naht
  out.lines.push({ x1: anchor[0], y1: anchor[1], x2: kx, y2: ky });
  const len = Math.hypot(kx - anchor[0], ky - anchor[1]) || 1;
  const ux = (kx - anchor[0]) / len, uy = (ky - anchor[1]) / len, al = 2.5, aw = 0.8;
  out.arrow = { pts: [anchor, [anchor[0] + ux * al - uy * aw, anchor[1] + uy * al + ux * aw], [anchor[0] + ux * al + uy * aw, anchor[1] + uy * al - ux * aw]] };
  // Bezugslinie (voll) und Identifikationslinie (gestrichelt, über der Volllinie)
  const xe = kx + dirX * L;
  out.lines.push({ x1: kx, y1: ky, x2: xe, y2: ky });
  const side = w.side || "pfeil";
  if (side !== "beide") out.lines.push({ x1: kx + dirX * 2, y1: ky - gapD, x2: xe, y2: ky - gapD, dashed: true });
  // Symbol: ab 8 mm vom Knick, s = Fußpunkt auf der Linie, sg = +1 unten (Pfeilseite), −1 oben (Gegenseite)
  const sx = kx + dirX * 9;
  const draw = (baseY, sg) => {
    const y = (d) => baseY + sg * d;
    if (w.kind === "kehl") out.polys.push({ pts: [[sx, y(0)], [sx, y(h)], [sx + h, y(0)]], closed: true });
    else if (w.kind === "v") out.polys.push({ pts: [[sx - h * 0.6, y(h)], [sx, y(0)], [sx + h * 0.6, y(h)]] });
    else if (w.kind === "hv" || w.kind === "k") out.polys.push({ pts: [[sx, y(h)], [sx, y(0)], [sx + h * 0.8, y(h)]] });
    else if (w.kind === "y") {
      out.lines.push({ x1: sx, y1: y(0), x2: sx, y2: y(h * 0.4) });
      out.polys.push({ pts: [[sx - h * 0.5, y(h)], [sx, y(h * 0.4)], [sx + h * 0.5, y(h)]] });
    }
    else { out.lines.push({ x1: sx - 0.7, y1: y(0), x2: sx - 0.7, y2: y(h) }); out.lines.push({ x1: sx + 0.7, y1: y(0), x2: sx + 0.7, y2: y(h) }); }
    // Maß links vom Symbol, Länge rechts davon (Textgrundlinie je nach Seite)
    const ty = sg > 0 ? y(h) - 0.2 : y(0) - 0.6;
    out.texts.push({ x: sx - 1.2, y: ty, text: WELD_KINDS[w.kind].dim + fmt(w.a), anchor: "end" });
    if (w.lengthText) out.texts.push({ x: sx + h + 1.2, y: ty, text: w.lengthText, anchor: "start" });
    // Nahtvorbereitung: Öffnungs- bzw. Flankenwinkel außen am Symbol, Steghöhe und Spalt (ISO 2553 / ISO 9692-1)
    if (w.prep && sg === first && w.kind !== "i") {
      const yy = sg > 0 ? y(h) + 2.4 : y(h) - 0.8;
      out.texts.push({ x: sx, y: yy, text: `${fmt(w.prep.angle)}°`, anchor: "middle" });
    }
    if (w.prep && sg === first) out.texts.push({ x: xe - dirX * 0.5, y: ty, text: (w.kind === "i" ? "" : `c${fmt(w.prep.root)} `) + `b${fmt(w.prep.gap)}`, anchor: dirX > 0 ? "end" : "start" });
  };
  // K-Naht ist immer beidseitig (Doppel-HV)
  const both = side === "beide" || w.kind === "k";
  const di = out.lines.findIndex((l) => l.dashed);
  if (both && di >= 0) out.lines.splice(di, 1);
  const first = side === "gegen" && !both ? -1 : 1;
  if (side === "pfeil" || both) draw(ky, 1);
  if (side === "gegen" && !both) draw(ky - gapD, -1);
  if (both) draw(ky, -1);
  // umlaufend: Kreis im Knick; Montagenaht: Fahne nach oben am Knick
  if (w.around) out.circles.push({ cx: kx, cy: ky, r: 1.5 });
  if (w.field) {
    out.lines.push({ x1: kx, y1: ky, x2: kx, y2: ky - 5 });
    out.polys.push({ pts: [[kx, ky - 5], [kx + dirX * 3, ky - 4.2], [kx, ky - 3.4]], closed: true, fill: true });
  }
  return out;
}

const fmt = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
