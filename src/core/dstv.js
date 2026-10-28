// DSTV-NC (NC1) für Säge-, Bohr- und Brennanlagen im Stahlbau (Stahlbau-Lücken ST1).
// Reine Rechnung: Profilkopf aus dem Querschnitt, Stück-Daten → Text, Gleichteile zusammenfassen.
// Die Geometrie (Bohrungen je Fläche, Plattenkontur) liest src/kernel/dstvocc.js aus dem fertigen Körper.
//
// Flächen wie in der DSTV-Richtlinie: v = vorne (Steg), h = hinten, o = oben (Flansch), u = unten.
// Lage im Stab (Rahmen u, v, z aus dem Kernel, z = Stabachse): v-Fläche hat die Normale −u, h +u, o +v, u −v.
// x = ab Stabanfang (kleinste Ausdehnung entlang z), y: auf v/h ab Unterkante, auf o ab der Vorderkante (v-Seite),
// auf u ab der Hinterkante (Abwicklung wie im DSTV-Bild: o über v, u unter v). Platten: alles auf v, x/y in der Plattenebene.

import { NORM_THREADS } from "./normteile.js";

/** DSTV-Profilcode und Kopfmaße je Querschnittsart (Maße in mm) */
export function dstvProfile(kind, d) {
  const n = (x) => Number(x) || 0;
  const g = (x) => String(Math.round(n(x) * 100) / 100);
  switch (kind) {
    case "ipe": case "hea": case "heb":
      return { code: "I", H: n(d.H), B: n(d.B), tf: n(d.t), tw: n(d.s), r: n(d.r) };
    case "upn": return { code: "U", H: n(d.H), B: n(d.B), tf: n(d.t), tw: n(d.s), r: n(d.r) };
    case "u": return { code: "U", H: n(d.H), B: n(d.B), tf: n(d.t), tw: n(d.t), r: 0, name: `U${g(d.B)}x${g(d.H)}x${g(d.t)}` };
    case "winkel": return { code: "L", H: n(d.H), B: n(d.B), tf: n(d.t), tw: n(d.t), r: 0, name: `L${g(d.B)}x${g(d.H)}x${g(d.t)}` };
    case "t": return { code: "T", H: n(d.H), B: n(d.B), tf: n(d.t), tw: n(d.t), r: n(d.r) };
    case "rechteck": return { code: "M", H: n(d.H), B: n(d.B), tf: n(d.t), tw: n(d.t), r: Number.isFinite(d.r) ? n(d.r) : 2 * n(d.t), name: `RRO${g(d.B)}x${g(d.H)}x${g(d.t)}` };
    case "vierkant": return { code: "M", H: n(d.B), B: n(d.B), tf: n(d.t), tw: n(d.t), r: Number.isFinite(d.r) ? n(d.r) : 2 * n(d.t), name: `QRO${g(d.B)}x${g(d.t)}` };
    case "rohr": return { code: "RO", H: n(d.D), B: n(d.D), tf: n(d.t), tw: n(d.t), r: 0, name: `RO${g(d.D)}x${g(d.t)}` };
    case "rund": return { code: "RU", H: n(d.D), B: n(d.D), tf: 0, tw: 0, r: 0, name: `RD${g(d.D)}` };
    case "flach": return { code: "B", H: n(d.B), B: n(d.t), tf: n(d.t), tw: n(d.t), r: 0, name: `FL${g(d.B)}x${g(d.t)}`, flat: true };
    case "vierkantvoll": return { code: "SO", H: n(d.B), B: n(d.B), tf: 0, tw: 0, r: 0, name: `VK${g(d.B)}` };
  }
  return { code: "SO", H: 0, B: 0, tf: 0, tw: 0, r: 0 };
}

/** Profilbezeichnung ohne Leerzeichen: "IPE 200" → "IPE200", sonst aus dstvProfile */
export function dstvProfileName(kind, d, sectionName = "") {
  const p = dstvProfile(kind, d);
  if (p.name) return p.name;
  return String(sectionName || kind).replace(/\s+/g, "").replace(/,/g, ".");
}

/** Blech/Platte: Profilname "BL10" (Dicke) */
export const plateProfileName = (t) => "BL" + String(Math.round(t * 100) / 100);

/** Seite des Stabs aus der Bohrachse (Richtung im Stabrahmen) und der Lage der Bohrungsmitte */
export function faceOf(axisU, axisV, cu, cv, flat = false) {
  if (flat) return "v";
  if (Math.abs(axisU) >= Math.abs(axisV)) return cu > 1e-6 ? "h" : "v";
  return cv >= 0 ? "o" : "u";
}
/** y auf der Fläche: v/h ab Unterkante, o ab Vorderkante, u ab Hinterkante (Bauteil-Maße B × H) */
export function faceY(face, cu, cv, B, H, flat = false) {
  if (flat) return cu + B / 2;
  if (face === "v" || face === "h") return cv + H / 2;
  if (face === "o") return cu + B / 2;
  return B / 2 - cu;
}

const num = (x, d = 2) => {
  const v = Math.abs(x) < 0.5 * 10 ** -d ? 0 : x;
  return v.toFixed(d);
};
const pad = (s, w) => String(s).padStart(w);
const txt = (s, max = 40) => {
  const t = String(s ?? "").replace(/[\r\n]+/g, " ").trim();
  return (t || "-").slice(0, max);
};

/**
 * NC1-Text eines Stücks.
 * piece = { order, drawing, phase, pos, material, qty, profile, code, length, H, B, tf, tw, r, kgm, paint,
 *           cuts: { webA, webB, flA, flB }, holes: [{ face, x, y, d, slot?: { l, angle } }],
 *           ak: [[x, y, r] …] (Außenkontur, Fläche v), ik: [[[x, y, r] …] …], si?: { face, x, y, h, text }, texts?: [4 Zeilen] }
 */
export function dstvText(piece, { by = "PBCAD" } = {}) {
  const p = piece, L = [];
  L.push("ST");
  L.push("** " + txt(by, 60));
  for (const s of [p.order, p.drawing, p.phase || "1", p.pos, p.material, String(Math.max(1, Math.round(p.qty || 1))), p.profile, p.code]) L.push("  " + txt(s));
  for (const v of [p.length, p.H, p.B, p.tf, p.tw, p.r]) L.push(pad(num(v || 0), 12));
  L.push(pad(num(p.kgm || 0, 3), 12));
  L.push(pad(num(p.paint || 0, 3), 12));
  const c = p.cuts || {};
  for (const v of [c.webA, c.webB, c.flA, c.flB]) L.push(pad(num(v || 0, 3), 12));
  const texts = p.texts || [];
  for (let i = 0; i < 4; i++) L.push("  " + txt(texts[i]));
  const point = (face, x, y) => `  ${face}${pad(num(x), 12)}u${pad(num(y), 12)}`;
  if (p.ak?.length) {
    L.push("AK");
    for (const [x, y, r] of closeLoop(p.ak)) L.push(point("v", x, y) + pad(num(r || 0), 12));
  }
  for (const loop of p.ik || []) {
    if (!loop.length) continue;
    L.push("IK");
    for (const [x, y, r] of closeLoop(loop)) L.push(point("v", x, y) + pad(num(r || 0), 12));
  }
  if (p.holes?.length) {
    L.push("BO");
    for (const h of sortHoles(p.holes)) {
      let line = point(h.face, h.x, h.y) + pad(num(h.d), 9);
      if (h.slot) line += pad(num(0), 9) + "l" + pad(num(h.slot.l), 9) + pad(num(0), 9) + pad(num(h.slot.angle || 0), 9);
      L.push(line);
    }
  }
  if (p.si?.text) {
    const s = p.si;
    L.push("SI");
    L.push(point(s.face || "v", s.x, s.y) + pad(num(0), 9) + pad(String(Math.round(s.h || 10)), 4) + "r" + " " + String(s.text).replace(/\s+/g, "_").slice(0, 40));
  }
  L.push("EN");
  return L.join("\r\n") + "\r\n";
}
/** Kontur schließen: erster Punkt am Ende wiederholt (DSTV-Regel) */
function closeLoop(pts) {
  const a = pts[0], b = pts[pts.length - 1];
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6 ? pts : [...pts, [a[0], a[1], 0]];
}
const FACE_ORDER = { v: 0, o: 1, u: 2, h: 3 };
function sortHoles(holes) {
  return [...holes].sort((a, b) => FACE_ORDER[a.face] - FACE_ORDER[b.face] || a.x - b.x || a.y - b.y);
}

/** Inhalt ohne Kennungen (Position, Anzahl) – gleiche Stücke haben die gleiche Signatur */
export function pieceSignature(p) {
  const r = (x) => Math.round((x || 0) * 10) / 10;
  return JSON.stringify([p.code, p.profile, p.material, r(p.length), p.cuts && [p.cuts.webA, p.cuts.webB, p.cuts.flA, p.cuts.flB].map(r),
    (p.holes || []).map((h) => [h.face, r(h.x), r(h.y), r(h.d), h.slot ? [r(h.slot.l), r(h.slot.angle)] : 0]).sort(),
    (p.ak || []).map((q) => q.map(r)), (p.ik || []).map((l) => l.map((q) => q.map(r)))]);
}

/**
 * Gleiche Stücke zusammenfassen und Positionen vergeben: Stäbe zuerst (nach Profil, dann Länge absteigend), dann Platten.
 * pieces: [{ …piece, qty }] → [{ …piece, qty (Summe), pos, sources: [Namen] }]
 */
export function groupPieces(pieces, { start = 1 } = {}) {
  const map = new Map();
  for (const p of pieces) {
    const k = pieceSignature(p);
    const g = map.get(k);
    if (g) { g.qty += p.qty || 1; if (p.name && !g.sources.includes(p.name)) g.sources.push(p.name); }
    else map.set(k, { ...p, qty: p.qty || 1, sources: p.name ? [p.name] : [] });
  }
  const plate = (p) => (p.code === "B" && p.ak?.length ? 1 : 0);
  const list = [...map.values()].sort((a, b) => plate(a) - plate(b) || a.profile.localeCompare(b.profile) || b.length - a.length);
  return list.map((p, i) => ({ ...p, pos: p.pos || String(start + i) }));
}

/** Dateiname: "P001_IPE200.nc1" */
export function dstvFileName(p) {
  const pos = /^\d+$/.test(String(p.pos)) ? String(p.pos).padStart(3, "0") : String(p.pos);
  return `P${pos}_${String(p.profile).replace(/[^\w.+-]+/g, "_")}.nc1`;
}

/** Gehrungswinkel für den Kopf: Anteil über die Höhe (Steg, v) und über die Breite (Flansch, o) je Ende */
export function dstvCuts(meta) {
  const A = meta?.miterParts?.A, Bp = meta?.miterParts?.B;
  if (A || Bp) return { webA: A?.h || 0, webB: Bp?.h || 0, flA: A?.b || 0, flB: Bp?.b || 0 };
  return { webA: meta?.miterStart || 0, webB: meta?.miterEnd || 0, flA: 0, flB: 0 };
}

/** Bohrdurchmesser auf eine sinnvolle Stelle runden (Toleranz der Tessellierung/Bool-Operation) */
export const holeDia = (d) => Math.round(d * 100) / 100;

/** Klartext für die Bohrung: "Ø 18 (M16)" – für Protokoll und Liste */
export function holeLabel(d) {
  const m = Object.entries(NORM_THREADS).find(([, t]) => Math.abs(t.d + (t.d <= 12 ? 1 : 2) - d) < 0.05);
  return `Ø ${String(holeDia(d)).replace(".", ",")}` + (m ? ` (${m[0]})` : "");
}

/**
 * Einfacher Leser für NC1 (Kopf, BO, AK, IK, SI) – für Tests und die Vorschau.
 * Rückgabe { head: [24 Zeilen], blocks: { BO: [[…]], AK: [[[…]]], … } }
 */
export function parseDstv(text) {
  const lines = String(text).split(/\r?\n/);
  if (lines[0].trim() !== "ST") throw new Error("NC1 beginnt nicht mit ST");
  const head = [];
  let i = 1;
  while (i < lines.length && head.length < 24) {
    const s = lines[i++];
    if (s.startsWith("**")) continue;
    head.push(s.trim());
  }
  const blocks = {};
  let cur = null;
  for (; i < lines.length; i++) {
    const s = lines[i];
    if (!s.trim()) continue;
    if (/^[A-Z]{2}$/.test(s.trim())) {
      cur = s.trim();
      if (cur === "EN") break;
      (blocks[cur] = blocks[cur] || []).push([]);
      continue;
    }
    if (!cur) throw new Error("Zeile ohne Block: " + s);
    const parts = s.trim().split(/\s+/);
    const face = parts.shift();
    if (!/^[vohu]$/.test(face)) throw new Error("Unbekannte Fläche in: " + s);
    const vals = parts.map((x) => (/^-?[\d.]+[a-z]?$/.test(x) ? Number(x.replace(/[a-z]$/, "")) : x));
    blocks[cur][blocks[cur].length - 1].push([face, ...vals]);
  }
  if (cur !== "EN") throw new Error("NC1 endet nicht mit EN");
  return { head, blocks };
}

/**
 * Stücke eines Bauteils aus den Kernel-Daten (dstvData): Kopf, Bohrungen, Kontur, Gewicht.
 * src = { part: { name, number, material }, qty, data: [dstvData-Einträge] }, mat = { label, density, grade? }
 * Rückgabe { pieces: [piece], skipped: [{ name, reason }] }
 */
export function piecesOf(src, mat, { order = "", drawing = "" } = {}) {
  const pieces = [], skipped = [];
  const grade = steelGrade(mat);
  for (const b of src.data || []) {
    const name = `${src.part.name} – ${b.name}`;
    if (b.kind === "skip") { skipped.push({ name, reason: b.reason }); continue; }
    if (b.skipped) skipped.push({ name, reason: `${b.skipped} Bohrung(en) schräg oder nicht rund – nur im STEP` });
    const base = { name, order, drawing: drawing || src.part.number || src.part.name, material: grade, qty: src.qty || 1, texts: [src.part.name, b.name, src.part.number || "", ""] };
    if (b.kind === "member") {
      const pr = dstvProfile(b.sec.kind, b.sec.dims);
      if (b.coped) skipped.push({ name, reason: "Ausklinkung/Kontur am Stab – Kontur aus dem STEP" });
      const piece = { ...base, profile: dstvProfileName(b.sec.kind, b.sec.dims, b.section), code: pr.code, length: b.length, H: pr.H, B: pr.B, tf: pr.tf, tw: pr.tw, r: pr.r,
        kgm: (b.area * mat.density) / 1000, paint: (b.perimeter || 0) / 1000, cuts: dstvCuts(b), holes: b.holes || [] };
      piece.si = { face: "v", x: Math.min(50, b.length / 4), y: (pr.code === "B" ? b.width : pr.H) / 2, h: 10 };
      pieces.push(piece);
    } else if (b.kind === "plate") {
      pieces.push({ ...base, profile: plateProfileName(b.t), code: "B", length: b.length, H: b.width, B: b.t, tf: b.t, tw: b.t, r: 0, kgm: b.t * mat.density, paint: 2, cuts: {}, holes: b.holes || [], ak: b.ak, ik: b.ik || [],
        si: { face: "v", x: Math.min(50, b.length / 4), y: Math.min(20, b.width / 2), h: 10 } });
    }
  }
  return { pieces, skipped };
}
/** Werkstoffbezeichnung für den Kopf: "S235JR" aus "Stahl S235JR", sonst Bezeichnung */
export function steelGrade(mat) {
  const s = [mat?.label, mat?.key, mat?.grade].filter(Boolean).join(" ");
  const m = s.match(/\b(S\d{3}[A-Z0-9+]*|1\.\d{4}|EN AW-\d{4}[A-Z]?)\b/);
  return m ? m[1] : mat?.key || mat?.label || "-";
}
/** Signatur (SI) mit der vergebenen Position füllen */
export function withSignature(p) {
  return p.si ? { ...p, si: { ...p.si, text: String(p.pos) } } : p;
}
