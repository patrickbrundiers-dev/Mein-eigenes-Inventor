// Blech erweitert (Fusion-Abgleich FU19 mit E12): Blechkasten – Boden mit bis zu vier hochgekanteten Wänden,
// Ecken aufgetrennt (Spalt, eine Wandrichtung läuft durch) und Eckfreischnitt. Entsteht frei mit Maßen oder durch
// »In Blech umwandeln« aus einem quaderförmigen Körper (Außenmaße = Hüllquader, offene Seite oben oder unten).
// Reine Rechnung: Lage aller Teile für den Kern und die Abwicklung als Umriss mit Biegelinien.
//
// Koordinaten: Außenmaße L (x) × B (y) × H (z), Boden außen bei z = 0, Wände nach +z. Abwicklung in der xy-Ebene,
// Boden bleibt liegen, Wände klappen nach außen.

import { bendAllowance } from "./blech.js";
import { rectOutline } from "./blechplus.js";

export const BOX_SIDES = [["vorne", "vorne (y = 0)"], ["rechts", "rechts (x = L)"], ["hinten", "hinten (y = B)"], ["links", "links (x = 0)"]];
export const BOX_THROUGH = [["x", "Wände vorne/hinten laufen durch"], ["y", "Wände links/rechts laufen durch"]];

export const defaultBlechkasten = () => ({ type: "blechkasten", L: "300", B: "200", H: "60", t: "2", ri: "2", k: "0.33", walls: "vorne; rechts; hinten; links", through: "x", gap: "0.5", open: "oben", pos: ["0", "0", "0"], view: "gefaltet" });

/** Wandliste aus Text (»vorne; links«) oder Feld */
export function wallSet(w) {
  const list = Array.isArray(w) ? w : String(w ?? "").split(/[;,\s]+/);
  return new Set(list.map((x) => x.trim().toLowerCase()).filter((x) => BOX_SIDES.some(([k]) => k === x)));
}

// Je Seite: Ursprung, Laufrichtung (entlang), Richtung nach innen; Nachbarn am Anfang und am Ende der Seite.
// Die Seiten laufen gegen den Uhrzeigersinn um den Boden (von oben gesehen).
const SIDES = {
  vorne: { O: (L, B) => [0, 0], d: [1, 0], inw: [0, 1], len: (L) => L, from: "links", to: "rechts", axis: "x" },
  rechts: { O: (L) => [L, 0], d: [0, 1], inw: [-1, 0], len: (L, B) => B, from: "vorne", to: "hinten", axis: "y" },
  hinten: { O: (L, B) => [L, B], d: [-1, 0], inw: [0, -1], len: (L) => L, from: "rechts", to: "links", axis: "x" },
  links: { O: (L, B) => [0, B], d: [0, -1], inw: [1, 0], len: (L, B) => B, from: "hinten", to: "vorne", axis: "y" },
};
export const boxSideFrame = (side, L, B) => { const s = SIDES[side]; return { O: s.O(L, B), d: s.d, inw: s.inw, len: s.len(L, B) }; };

/**
 * Plan des Kastens. Gibt Boden, Biegezonen und Wände (je Seite: Bereich entlang der Seite) und die Abwicklung.
 * k: K-Faktor; kOf(angle) optional (Biegetabelle). gap: Spalt an aufgetrennten Ecken.
 */
export function planBlechkasten({ L, B, H, t, ri, k, kOf = null, walls, through = "x", gap = 0.5 }) {
  const W = wallSet(walls);
  if (!(L > 0 && B > 0 && H > 0)) throw new Error("Blechkasten: Länge, Breite und Höhe > 0 angeben");
  if (!(t > 0)) throw new Error("Blechdicke muss > 0 sein");
  if (!(ri >= 0)) throw new Error("Innenradius ≥ 0 angeben");
  if (!(gap >= 0)) throw new Error("Spalt an den Ecken ≥ 0 angeben");
  const R = ri + t, h = H - R;
  if (W.size && !(h > 1e-6)) throw new Error(`Blechkasten: Höhe muss größer als Innenradius + Blechdicke (${round(R)} mm) sein`);
  const K = kOf ? kOf(90) : k;
  const ba = bendAllowance(ri, K, t, Math.PI / 2);
  // Boden: an jeder Seite mit Wand um R zurück (dort beginnt die Biegung)
  const e = (s) => (W.has(s) ? R : 0);
  const base = { x0: e("links"), x1: L - e("rechts"), y0: e("vorne"), y1: B - e("hinten") };
  if (!(base.x1 - base.x0 > 1e-6 && base.y1 - base.y0 > 1e-6)) throw new Error("Blechkasten: Grundfläche zu klein für Radius und Blechdicke");
  if (W.size > 1 && gap > ri) throw new Error(`Spalt an den Ecken höchstens so groß wie der Innenradius (${round(ri)} mm)`);
  const sides = [];
  for (const side of ["vorne", "rechts", "hinten", "links"]) {
    if (!W.has(side)) continue;
    const S = SIDES[side], len = S.len(L, B);
    const runs = S.axis === through;
    // Biegung von Bodenecke zu Bodenecke, Wand bis zur Außenkante – an einer aufgetrennten Ecke mit Wand nebenan
    // läuft nur eine Richtung durch, die andere hört um Blechdicke + Spalt vorher auf
    const c0 = e(S.from), c1 = e(S.to);
    const w0 = W.has(S.from) && !runs ? t + gap : 0, w1 = W.has(S.to) && !runs ? t + gap : 0;
    sides.push({ side, len, bend: [c0, len - c1], wall: [w0, len - w1], through: runs || !(W.has(S.from) || W.has(S.to)) });
  }
  // Eckfreischnitt: an Ecken zwischen zwei Wänden bleibt ein Quadrat R × R im Boden frei (die Biegezonen enden dort)
  const corners = [["vorne", "rechts"], ["rechts", "hinten"], ["hinten", "links"], ["links", "vorne"]].filter(([a, b]) => W.has(a) && W.has(b)).length;
  const flat = flatBlechkasten({ L, B, R, ba, h, base, sides, t, ri, K });
  return { L, B, H, t, ri, k: K, R, ba, h, base, sides, corners, flat, gap };
}

/** Abwicklung: Boden, Biegezonen (Breite = Biegezugabe) und Wände als Rechtecke vereint, Biegelinien in der Mitte der Zone */
function flatBlechkasten({ L, B, ba, h, base, sides, ri, K }) {
  const rects = [[base.x0, base.x1, base.y0, base.y1]];
  const bends = [];
  // Rechteck in Seitenkoordinaten: s (entlang) von s0 bis s1, o (nach außen ab der Bodenkante) von o0 bis o1
  const rectOf = (fr, edge, s0, s1, o0, o1) => {
    const P = (s, o) => [fr.O[0] + fr.d[0] * s + fr.inw[0] * (edge - o), fr.O[1] + fr.d[1] * s + fr.inw[1] * (edge - o)];
    const a = P(s0, o0), b = P(s1, o1);
    return [Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  };
  for (const sd of sides) {
    const fr = boxSideFrame(sd.side, L, B);
    const edge = sd.side === "vorne" ? base.y0 : sd.side === "hinten" ? B - base.y1 : sd.side === "links" ? base.x0 : L - base.x1;
    rects.push(rectOf(fr, edge, sd.bend[0], sd.bend[1], 0, ba), rectOf(fr, edge, sd.wall[0], sd.wall[1], ba, ba + h));
    const m = rectOf(fr, edge, sd.bend[0], sd.bend[1], ba / 2, ba / 2);
    bends.push({ side: sd.side, x0: m[0], y0: m[2], x1: m[1], y1: m[3], angle: 90, up: true, ri, k: K });
  }
  const loops = rectOutline(rects[0], [], rects.slice(1));
  const outer = loops.filter((l) => l.area > 0);
  if (outer.length !== 1) throw new Error("Abwicklung zerfällt in mehrere Teile – Wände und Spalt prüfen");
  const pts = outer[0].pts;
  const bb = pts.reduce((b, [x, y]) => ({ x0: Math.min(b.x0, x), y0: Math.min(b.y0, y), x1: Math.max(b.x1, x), y1: Math.max(b.y1, y) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  bends.forEach((b, i) => { b.nr = i + 1; });
  const area = loops.reduce((s, l) => s + l.area, 0);
  return { outer: pts, holes: loops.filter((l) => l.area < 0).map((l) => l.pts), circles: [], bends, bbox: bb, width: bb.x1 - bb.x0, height: bb.y1 - bb.y0, area };
}

/**
 * »In Blech umwandeln«: passt der Körper in seinen Hüllquader (Volumen gleich), werden dessen Maße die Außenmaße
 * des Kastens. bounds = [[x0, y0, z0], [x1, y1, z1]]. Sonst Fehler mit Hinweis.
 */
export function boxFromBody(bounds, volume, tol = 0.005) {
  const [lo, hi] = bounds;
  const size = [0, 1, 2].map((i) => hi[i] - lo[i]);
  if (size.some((s) => !(s > 1e-6))) throw new Error("In Blech umwandeln: Körper ist flach oder leer");
  const box = size[0] * size[1] * size[2];
  if (!(Math.abs(volume - box) <= tol * box)) throw new Error(`In Blech umwandeln: nur quaderförmige Körper (Volumen ${round(volume)} statt ${round(box)} mm³ des Hüllquaders)`);
  return { pos: lo, L: size[0], B: size[1], H: size[2] };
}

const round = (x) => Math.round(x * 100) / 100;
