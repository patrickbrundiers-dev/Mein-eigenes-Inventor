// Schweißnähte (MegaCAD-Abgleich M9): Nahtarten, Symbol nach ISO 2553 (System A) für die Zeichnung, Nahtliste.
// Reine Rechnung; die Nähte entstehen im Kern aus gewählten Kanten (Feature „Schweißnaht“) oder aus den
// Anschlussblechen (Platte/Rippe mit Kehlnaht) und kommen als result.welds zurück.
//
// Nahtmaß: Kehlnaht a (Nahtdicke), Stumpfnähte s. Nahtquerschnitt für Masse und Schweißgut (Näherung, ohne
// Überhöhung): Kehlnaht a², V-Naht (60°) s²·tan 30° + s·b mit Spalt b = 1 mm, HV-Naht (45°) s²/2 + s·b, I-Naht s·b.

import { materialOf } from "./materials.js";

export const WELD_KINDS = {
  kehl: { label: "Kehlnaht", dim: "a" },
  hv: { label: "HV-Naht", dim: "s" },
  v: { label: "V-Naht", dim: "s" },
  i: { label: "I-Naht", dim: "s" },
};
export const WELD_SIDES = { pfeil: "Pfeilseite", gegen: "Gegenseite", beide: "beidseitig" };
const GAP = 1; // mm Wurzelspalt für Stumpfnähte

/** Nahtquerschnitt in mm² je Seite */
export function weldArea(kind, a) {
  if (!(a > 0)) return 0;
  if (kind === "kehl") return a * a;
  if (kind === "v") return a * a * Math.tan(Math.PI / 6) + a * GAP;
  if (kind === "hv") return (a * a) / 2 + a * GAP;
  return a * GAP;
}

/** Masse Schweißgut in kg (Dichte g/cm³) */
export function weldMass(w, density = 7.85) {
  const sides = w.side === "beide" ? 2 : 1;
  return (weldArea(w.kind, w.a) * sides * (w.length || 0) * density) / 1e6;
}

/** Kurztext, z. B. „a4 Kehlnaht beidseitig, umlaufend, Montage“ */
export function weldText(w) {
  const k = WELD_KINDS[w.kind] || WELD_KINDS.kehl;
  const parts = [`${k.dim}${fmt(w.a)} ${k.label}`];
  if (w.side && w.side !== "pfeil") parts[0] += " " + WELD_SIDES[w.side];
  if (w.around) parts.push("umlaufend");
  if (w.field) parts.push("Montage");
  return parts.join(", ");
}

/**
 * Nahtliste: gleiche Art, gleiches Maß, gleiche Seite und Kennzeichen = eine Zeile.
 * welds: [{kind, a, side, around, field, length, part?, qty?}]. Rückgabe [{pos, kind, a, side, around, field, count, length, mass, parts}]
 */
export function weldRows(welds, density = 7.85) {
  const map = new Map();
  for (const w of welds) {
    const key = [w.kind, Math.round(w.a * 10), w.side || "pfeil", !!w.around, !!w.field].join("|");
    const q = w.qty || 1;
    if (!map.has(key)) map.set(key, { kind: w.kind, a: w.a, side: w.side || "pfeil", around: !!w.around, field: !!w.field, count: 0, length: 0, mass: 0, parts: new Set() });
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
  const head = ["Pos", "Nahtart", "Maß", "Seite", "Umlaufend", "Montage", "Anzahl", "Länge gesamt mm", "Schweißgut kg", "Bauteil"];
  const lines = rows.map((r) => [r.pos, WELD_KINDS[r.kind].label, WELD_KINDS[r.kind].dim + f(r.a), WELD_SIDES[r.side], r.around ? "ja" : "", r.field ? "ja" : "", r.count, f(r.length), f(r.mass, 3), r.parts]);
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
    else if (w.kind === "hv") out.polys.push({ pts: [[sx, y(h)], [sx, y(0)], [sx + h * 0.8, y(h)]] });
    else { out.lines.push({ x1: sx - 0.7, y1: y(0), x2: sx - 0.7, y2: y(h) }); out.lines.push({ x1: sx + 0.7, y1: y(0), x2: sx + 0.7, y2: y(h) }); }
    // Maß links vom Symbol, Länge rechts davon (Textgrundlinie je nach Seite)
    const ty = sg > 0 ? y(h) - 0.2 : y(0) - 0.6;
    out.texts.push({ x: sx - 1.2, y: ty, text: WELD_KINDS[w.kind].dim + fmt(w.a), anchor: "end" });
    if (w.lengthText) out.texts.push({ x: sx + h + 1.2, y: ty, text: w.lengthText, anchor: "start" });
  };
  if (side === "pfeil" || side === "beide") draw(ky, 1);
  if (side === "gegen") draw(ky - gapD, -1);
  if (side === "beide") draw(ky, -1);
  // umlaufend: Kreis im Knick; Montagenaht: Fahne nach oben am Knick
  if (w.around) out.circles.push({ cx: kx, cy: ky, r: 1.5 });
  if (w.field) {
    out.lines.push({ x1: kx, y1: ky, x2: kx, y2: ky - 5 });
    out.polys.push({ pts: [[kx, ky - 5], [kx + dirX * 3, ky - 4.2], [kx, ky - 3.4]], closed: true, fill: true });
  }
  return out;
}

const fmt = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
