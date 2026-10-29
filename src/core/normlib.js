// Normteil-Bibliothek wie das Inventor Inhaltscenter: Schrauben, Muttern, Scheiben, Gewindestangen, Dübel und Anker,
// Nieten, Stifte und Bolzen nach DIN/ISO/EN in den gängigen Größen. Jede Familie hat eine Maßtabelle je Größe, ihre
// Längen, Festigkeiten/Werkstoffe und eine Bauvorschrift (Rezept) aus einfachen Grundkörpern entlang der z-Achse.
// Das Rezept ist reine Rechnung: daraus kommen Volumen, Masse und die Vorschau ohne Geometrie-Kern; den Körper baut
// src/kernel/build.js (recipeSolid). Gewinde wird wie bisher als Kerndurchmesser dargestellt.
//
// Lage (für Einfügen an einer Bohrung): z = 0 ist die Auflagefläche, das Teil geht in +z in die Bohrung
// (seat »in«: Schrauben, Stifte, Anker, Nieten), liegt mit seiner Unterseite auf (»out«: Muttern, Scheiben) oder
// schließt mit z = 0 bündig ab (»flush«: Senkköpfe). Eigene Familien (Erweiterbarkeit) beschreiben sich mit einer
// der Vorlagen (TEMPLATES) und einer Maßtabelle; siehe validateFamily und docs/anwender/normteile.md.

const r2 = (x) => Math.round(x * 100) / 100;
export const fmtDe = (x) => String(r2(x)).replace(".", ",");

// ---------- Grundkörper eines Rezepts ----------
// cyl: Zylinder Ø d, Höhe h ab z0 (axis "x": quer liegend, Mitte bei z0, Länge h); hex: Sechskant Schlüsselweite s;
// sq: Vierkant Kante a; box: Quader w × dy × h (Mitte x, y); rev: geschlossener Umriss [[r, z], …] um die z-Achse;
// wedge: Keil a × b, Dicke h1 bei x = −a/2 bis h2 bei x = +a/2. cut: true zieht ab (in der Reihenfolge).
export const cyl = (d, h, z0 = 0, o = {}) => ({ op: "cyl", d, h, z0, ...o });
export const hex = (s, h, z0 = 0, o = {}) => ({ op: "hex", s, h, z0, ...o });
export const sq = (a, h, z0 = 0, o = {}) => ({ op: "sq", a, h, z0, ...o });
export const box = (w, dy, h, z0 = 0, o = {}) => ({ op: "box", w, dy, h, z0, x: 0, y: 0, ...o });
export const rev = (pts, o = {}) => ({ op: "rev", pts, ...o });
export const wedge = (a, b, h1, h2, o = {}) => ({ op: "wedge", a, b, h1, h2, ...o });
const cut = (p) => ({ ...p, cut: true });

/** Kugelkappe Ø dk, Höhe k von z0 nach z0 − k (Kopf über der Auflage) als Umriss-Punkte für rev */
function dome(dk, k, z0 = 0, dir = -1, n = 10) {
  const a = dk / 2, R = (a * a + k * k) / (2 * k), zc = z0 + dir * (k - R);
  const pts = [[0, z0], [a, z0]];
  const t0 = Math.asin(Math.min(1, a / R));
  for (let i = 1; i < n; i++) { const t = t0 * (1 - i / n); pts.push([R * Math.sin(t), zc + dir * R * Math.cos(t)]); }
  pts.push([0, z0 + dir * k]);
  return pts;
}

/** Volumen eines Rezepts (mm³); Anbauten überlappen in den eigenen Rezepten nicht, Abzüge liegen ganz im Teil */
export function recipeVolume(ops) {
  let v = 0;
  for (const o of ops) {
    let x = 0;
    if (o.vol != null) x = o.vol;
    else if (o.op === "cyl") x = (Math.PI / 4) * o.d * o.d * o.h;
    else if (o.op === "hex") x = (Math.sqrt(3) / 2) * o.s * o.s * o.h;
    else if (o.op === "sq") x = o.a * o.a * o.h;
    else if (o.op === "box") x = o.w * o.dy * o.h;
    else if (o.op === "wedge") x = (o.a * o.b * (o.h1 + o.h2)) / 2;
    else if (o.op === "rev") {
      const p = o.pts;
      for (let i = 0; i < p.length; i++) { const [ra, za] = p[i], [rb, zb] = p[(i + 1) % p.length]; x += (Math.PI / 3) * (zb - za) * (ra * ra + ra * rb + rb * rb); }
      x = Math.abs(x);
    }
    v += o.cut ? -x : x;
  }
  return v;
}

/** Seitenansicht (x nach rechts, z nach unten) als Polygone für die Vorschau: [{ pts: [[x, z], …], cut }] */
export function recipeOutline(ops) {
  const rect = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  return ops.map((o) => {
    let pts;
    if (o.op === "cyl") pts = o.axis === "x" ? rect(-o.h / 2, o.h / 2, o.z0 - o.d / 2, o.z0 + o.d / 2) : rect((o.x || 0) - o.d / 2, (o.x || 0) + o.d / 2, o.z0, o.z0 + o.h);
    else if (o.op === "hex") pts = rect(-o.s / Math.sqrt(3), o.s / Math.sqrt(3), o.z0, o.z0 + o.h);
    else if (o.op === "sq") pts = rect(-o.a / 2, o.a / 2, o.z0, o.z0 + o.h);
    else if (o.op === "box") pts = rect(o.x - o.w / 2, o.x + o.w / 2, o.z0, o.z0 + o.h);
    else if (o.op === "wedge") pts = [[-o.a / 2, 0], [o.a / 2, 0], [o.a / 2, o.h2], [-o.a / 2, o.h1]];
    else pts = [...o.pts.map(([r, z]) => [r, z]), ...o.pts.slice().reverse().map(([r, z]) => [-r, z])];
    return { pts, cut: !!o.cut };
  });
}

// ---------- Maßtabellen ----------
/** Metrisches Regelgewinde: d, P, s (ISO 4017/4032), k (ISO 4017), m (ISO 4032), m2 (ISO 4035 flach) */
const MT = {
  M3: [3, 0.5, 5.5, 2, 2.4, 1.8], M4: [4, 0.7, 7, 2.8, 3.2, 2.2], M5: [5, 0.8, 8, 3.5, 4.7, 2.7], M6: [6, 1, 10, 4, 5.2, 3.2],
  M8: [8, 1.25, 13, 5.3, 6.8, 4], M10: [10, 1.5, 16, 6.4, 8.4, 5], M12: [12, 1.75, 18, 7.5, 10.8, 6], M14: [14, 2, 21, 8.8, 12.8, 7],
  M16: [16, 2, 24, 10, 14.8, 8], M20: [20, 2.5, 30, 12.5, 18, 10], M22: [22, 2.5, 34, 14, 19.4, 11], M24: [24, 3, 36, 15, 21.5, 12],
  M27: [27, 3, 41, 17, 23.8, 13.5], M30: [30, 3.5, 46, 18.7, 25.6, 15], M36: [36, 4, 55, 22.5, 31, 18],
};
export const METRIC = Object.fromEntries(Object.entries(MT).map(([k, [d, P, s, kk, m, m2]]) => [k, { d, P, s, k: kk, m, m2, core: d - 1.0825 * P }]));
const pick = (keys) => keys.filter((k) => METRIC[k]);
const ALL_M = Object.keys(MT);
/** Tabelle {Größe: [Werte]} mit Feldnamen zu {Größe: {Feld: Wert}} (mit den Gewindemaßen) */
const tab = (fields, rows) => Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, { ...(METRIC[k] || {}), ...Object.fromEntries(fields.map((f, i) => [f, v[i]])) }]));

// Scheiben ISO 7089/7090 (d1, d2, h)
const W7089 = { M3: [3.2, 7, 0.5], M4: [4.3, 9, 0.8], M5: [5.3, 10, 1], M6: [6.4, 12, 1.6], M8: [8.4, 16, 1.6], M10: [10.5, 20, 2], M12: [13, 24, 2.5], M14: [15, 28, 2.5], M16: [17, 30, 3], M20: [21, 37, 3], M22: [23, 39, 3], M24: [25, 44, 4], M27: [28, 50, 4], M30: [31, 56, 4], M36: [37, 66, 5] };

/** Vorzugslängen Schrauben (ISO 4014/4017/4762 …) */
export const SCREW_LENGTHS = [5, 6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200, 220, 240, 260, 280, 300];
const PIN_LENGTHS = [4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 120, 140, 160, 180, 200];
const between = (list, lo, hi) => list.filter((l) => l >= lo - 1e-9 && l <= hi + 1e-9);

// ---------- Werkstoffe ----------
const STAINLESS = /^A[1-5]/;
/** Werkstoff zur Festigkeitsklasse bzw. Werkstoffangabe: { label, density g/cm³ } */
export function gradeInfo(grade = "") {
  const g = String(grade);
  if (STAINLESS.test(g)) return { label: `nichtrostend ${g}`, density: 7.9 };
  if (g === "Kunststoff") return { label: "Kunststoff (PE)", density: 0.95 };
  if (/^Al\/St/.test(g)) return { label: "Aluminium / Stahl-Dorn", density: 2.9 };
  if (/^Al/.test(g)) return { label: "Aluminium", density: 2.7 };
  if (/^St\/St/.test(g)) return { label: "Stahl verzinkt", density: 7.85 };
  if (/^PA/.test(g)) return { label: "Polyamid " + g, density: 1.14 };
  if (/^(Ms|CuZn)/.test(g)) return { label: "Messing", density: 8.5 };
  return { label: `Stahl ${g}`.trim(), density: 7.85 };
}
export const isStainless = (grade) => STAINLESS.test(grade || "");

// ---------- Vorlagen (auch für eigene Familien) ----------
// Jede Vorlage: fields (Pflichtmaße je Größe), length (hat Länge), seat, hole (Bohrungsbezug), build(dims, L) → Rezept.
const shank = (t, L, b) => {
  // Schaft Ø d bis L − b, darunter Gewinde (Kern-Ø); b ≥ L: Gewinde bis Kopf
  const core = t.core ?? t.d - 1.0825 * (t.P || t.d * 0.15);
  const free = Math.max(0, L - (b ?? L));
  return free > 0.01 ? [cyl(t.d, free), cyl(core, L - free, free)] : [cyl(core, L)];
};
// Durchgangsloch mit Überstand fürs Abziehen; vol = tatsächlich entferntes Volumen
const bore = (d, h, z0 = 0) => cut(cyl(d, h + 2, z0 - 1, { vol: (Math.PI / 4) * d * d * h }));
const ring = (d, h) => (Math.PI / 4) * d * d * h;
export const TEMPLATES = {
  sechskantschraube: { label: "Sechskantschraube", fields: ["d", "s", "k"], length: true, seat: "in", hole: "clearance",
    build: (t, L) => [hex(t.s, t.k, -t.k), ...shank(t, L, t.b ? t.b(L) : L)] },
  zylinderschraube: { label: "Zylinderschraube mit Innensechskant", fields: ["d", "dk", "k"], length: true, seat: "in", hole: "clearance",
    build: (t, L) => [cyl(t.dk, t.k, -t.k), ...shank(t, L, t.b ? t.b(L) : L), ...(t.sw ? [cut(hex(t.sw, t.t || t.k * 0.5, -t.k))] : [])] },
  senkschraube: { label: "Senkschraube (90°)", fields: ["d", "dk", "k"], length: true, seat: "flush", hole: "clearance",
    // Länge über alles mit Kopf; Kopfoberseite bei z = 0
    build: (t, L) => [rev([[0, 0], [t.dk / 2, 0], [t.d / 2, t.k], [0, t.k]]), ...shank(t, L - t.k, t.b ? t.b(L) : L).map((o) => ({ ...o, z0: o.z0 + t.k })), ...(t.sw ? [cut(hex(t.sw, t.t || t.k * 0.6, 0))] : [])] },
  linsenschraube: { label: "Linsen-/Flachrundkopf", fields: ["d", "dk", "k"], length: true, seat: "in", hole: "clearance",
    build: (t, L) => {
      const neck = t.v ? [sq(t.v, t.f, 0)] : [];
      const f = t.v ? t.f : 0;
      return [rev(dome(t.dk, t.k)), ...neck, ...shank(t, L - f, L - f).map((o) => ({ ...o, z0: o.z0 + f })), ...(t.sw ? [cut(hex(t.sw, t.t || t.k * 0.55, -t.k))] : [])];
    } },
  mutter: { label: "Sechskantmutter", fields: ["d", "s", "m"], length: false, seat: "out", hole: "clearance",
    build: (t) => [hex(t.s, t.m), bore(t.d, t.m)] },
  scheibe: { label: "Scheibe (rund)", fields: ["d1", "d2", "h"], length: false, seat: "out", hole: "clearance",
    build: (t) => [cyl(t.d2, t.h), bore(t.d1, t.h)] },
  gewindestange: { label: "Gewindestange", fields: ["d"], length: true, seat: "in", hole: "clearance",
    build: (t, L) => [cyl(t.core ?? t.d, L)] },
  stift: { label: "Stift (zylindrisch)", fields: ["d"], length: true, seat: "in", hole: "drill",
    build: (t, L) => { const c = Math.min(t.d * 0.12, L / 4); return [rev([[0, 0], [t.d / 2 - c, 0], [t.d / 2, c], [t.d / 2, L - c], [t.d / 2 - c, L], [0, L]])]; } },
  bolzen: { label: "Bolzen mit Kopf", fields: ["d", "dk", "k"], length: true, seat: "in", hole: "drill",
    build: (t, L) => [cyl(t.dk, t.k, -t.k), cyl(t.d, L), ...(t.d1 ? [cut(cyl(t.d1, t.d + 2, L - (t.le ?? 2 * t.d1), { axis: "x", vol: ring(t.d1, t.d) }))] : [])] },
  niet: { label: "Niet (Halbrundkopf)", fields: ["d", "dk", "k"], length: true, seat: "in", hole: "drill",
    build: (t, L) => [rev(dome(t.dk, t.k)), cyl(t.d, L), ...(t.hollow ? [cut(cyl(t.d * t.hollow, L + t.k + 2, -t.k - 1))] : [])] },
  duebel: { label: "Dübel (Hülse)", fields: ["d", "di"], length: true, seat: "in", hole: "drill",
    build: (t, L) => [cyl(t.d, L), bore(t.di, L)] },
  beschlag: { label: "Beschlag (eigene Form)", fields: [], length: false, seat: "center", hole: "drill", build: () => { throw new Error("Beschlag braucht eine eigene Form"); } },
};

// ---------- Familien ----------
// id: { cat, label, norm, alias?, noun, template, sizes, lengths(size) | null, grades, def: {size, length}, … }
const thread4014 = (d, L) => 2 * d + (L <= 125 ? 6 : L <= 200 ? 12 : 25);
const thread4762 = (d, L) => 2 * d + (L <= 125 ? 12 : L <= 200 ? 18 : 31);
const sizesWith = (keys, extra = () => ({})) => Object.fromEntries(pick(keys).map((k) => [k, { ...METRIC[k], ...extra(METRIC[k], k) }]));
const STEEL_BOLT = ["8.8", "10.9", "5.6", "A2-70", "A4-70"];
const STEEL_NUT = ["8", "10", "5", "A2-70", "A4-70"];
const WASHER = ["200 HV", "300 HV", "A2", "A4"];
const garnitur = (washer, nut) => ({ washerHead: washer, washerNut: washer, nut });
/** Mutter/Scheibe zur Schraubenfestigkeit */
export function matchingGrade(boltGrade, kind) {
  const g = String(boltGrade || "");
  if (STAINLESS.test(g)) return kind === "washer" ? g.slice(0, 2) : g;
  if (kind === "nut") return { "8.8": "8", "10.9": "10", "5.6": "5", "4.6": "5", "4.8": "5", "12.9": "12", "10.9 HV": "10 HV" }[g] || "8";
  return /^10|^12/.test(g) ? "300 HV" : "200 HV";
}

const F = {};
// --- Schrauben ---
F.schraube4017 = { cat: "schrauben", label: "Sechskantschraube, Gewinde bis Kopf", norm: "ISO 4017", alias: ["DIN 933"], noun: "Sechskantschraube", template: "sechskantschraube",
  sizes: sizesWith(ALL_M), lengths: (t) => between(SCREW_LENGTHS, Math.max(6, 1.5 * t.d), Math.min(300, 15 * t.d)), grades: STEEL_BOLT, def: { size: "M12", length: 40 }, garnitur: garnitur("scheibe", "mutter") };
F.schraube4014 = { cat: "schrauben", label: "Sechskantschraube mit Schaft", norm: "ISO 4014", alias: ["DIN 931"], noun: "Sechskantschraube", template: "sechskantschraube",
  sizes: sizesWith(ALL_M, (t) => ({ b: (L) => thread4014(t.d, L) })), lengths: (t) => between(SCREW_LENGTHS, thread4014(t.d, 30) + 2 * t.P + 5, Math.min(300, 20 * t.d)), grades: STEEL_BOLT, def: { size: "M12", length: 80 }, garnitur: garnitur("scheibe", "mutter") };
const ISO4762 = { M3: [5.5, 3, 2.5, 1.3], M4: [7, 4, 3, 2], M5: [8.5, 5, 4, 2.5], M6: [10, 6, 5, 3], M8: [13, 8, 6, 4], M10: [16, 10, 8, 5], M12: [18, 12, 10, 6], M14: [21, 14, 12, 7], M16: [24, 16, 14, 8], M20: [30, 20, 17, 10], M22: [33, 22, 17, 11], M24: [36, 24, 19, 12], M27: [40, 27, 19, 13.5], M30: [45, 30, 22, 15.5], M36: [54, 36, 27, 19] };
F.iso4762 = { cat: "schrauben", label: "Zylinderschraube mit Innensechskant", norm: "ISO 4762", alias: ["DIN 912"], noun: "Zylinderschraube", template: "zylinderschraube",
  sizes: Object.fromEntries(Object.entries(tab(["dk", "k", "sw", "t"], ISO4762)).map(([k, v]) => [k, { ...v, b: (L) => (L > thread4762(v.d, L) + 2 * v.d ? thread4762(v.d, L) : L) }])),
  lengths: (t) => between(SCREW_LENGTHS, Math.max(5, t.d), Math.min(300, 12 * t.d)), grades: ["8.8", "10.9", "12.9", "A2-70", "A4-70"], def: { size: "M8", length: 30 }, garnitur: garnitur("scheibe", "mutter") };
const ISO10642 = { M3: [6.72, 1.86, 2], M4: [8.96, 2.48, 2.5], M5: [11.2, 3.1, 3], M6: [13.44, 3.72, 4], M8: [17.92, 4.96, 5], M10: [22.4, 6.2, 6], M12: [26.88, 7.44, 8], M16: [33.6, 8.8, 10], M20: [40.32, 10.16, 12] };
F.iso10642 = { cat: "schrauben", label: "Senkschraube mit Innensechskant", norm: "ISO 10642", alias: ["DIN 7991"], noun: "Senkschraube", template: "senkschraube",
  sizes: tab(["dk", "k", "sw"], ISO10642), lengths: (t) => between(SCREW_LENGTHS, Math.max(8, 1.5 * t.d), Math.min(200, 10 * t.d)), grades: ["8.8", "10.9", "A2-70", "A4-70"], def: { size: "M8", length: 25 }, garnitur: { washerNut: "scheibe", nut: "mutter" } };
const ISO7380 = { M3: [5.7, 1.65, 2], M4: [7.6, 2.2, 2.5], M5: [9.5, 2.75, 3], M6: [10.5, 3.3, 4], M8: [14, 4.4, 5], M10: [17.5, 5.5, 6], M12: [21, 6.6, 8], M16: [28, 8.8, 10] };
F.iso7380 = { cat: "schrauben", label: "Linsenkopfschraube mit Innensechskant", norm: "ISO 7380-1", noun: "Linsenkopfschraube", template: "linsenschraube",
  sizes: tab(["dk", "k", "sw"], ISO7380), lengths: (t) => between(SCREW_LENGTHS, Math.max(5, t.d), Math.min(90, 8 * t.d)), grades: ["10.9", "A2-70", "A4-70"], def: { size: "M6", length: 16 }, garnitur: { washerNut: "scheibe", nut: "mutter" } };
const DIN603 = { M5: [13.55, 3.3, 5.48, 4.1], M6: [16.55, 3.88, 6.48, 4.6], M8: [20.65, 4.88, 8.58, 5.6], M10: [24.65, 5.38, 10.58, 6.6], M12: [30.65, 6.95, 12.7, 8.75], M16: [38.8, 8.95, 16.7, 12.9], M20: [46.8, 11.05, 20.84, 15.9] };
F.din603 = { cat: "schrauben", label: "Flachrundschraube mit Vierkantansatz (Schlossschraube)", norm: "DIN 603", alias: ["ISO 8677"], noun: "Flachrundschraube", template: "linsenschraube",
  sizes: tab(["dk", "k", "v", "f"], DIN603), lengths: (t) => between(SCREW_LENGTHS, Math.max(16, 2 * t.d), Math.min(300, 15 * t.d)), grades: ["4.6", "8.8", "A2-70", "A4-70"], def: { size: "M8", length: 60 }, galv: true, garnitur: { washerNut: "scheibe", nut: "mutter" } };
// HV-Garnituren EN 14399-4 (Stahlbau, vorgespannt): s, k, b (Gewindelänge), Mutter m, Scheibe EN 14399-6 d1/d2/h
const HV = { M12: [22, 8, 21, 10, 13, 24, 3], M16: [27, 10, 26, 13, 17, 30, 4], M20: [32, 13, 31, 16, 21, 37, 4], M22: [36, 14, 32, 18, 23, 39, 4], M24: [41, 15, 34, 20, 25, 44, 4], M27: [46, 17, 37, 22, 28, 50, 5], M30: [50, 19, 40, 24, 31, 56, 5], M36: [60, 23, 48, 29, 37, 66, 6] };
const hvRow = (k) => { const [s, kk, b, m, d1, d2, h] = HV[k]; return { ...METRIC[k], s, k: kk, bt: b, m, d1, d2, h }; };
const HVS = Object.fromEntries(Object.keys(HV).map((k) => [k, hvRow(k)]));
F.hv14399 = { cat: "schrauben", label: "HV-Sechskantschraube (Stahlbau)", norm: "EN 14399-4", alias: ["DIN 6914"], noun: "Sechskantschraube", template: "sechskantschraube",
  sizes: Object.fromEntries(Object.entries(HVS).map(([k, v]) => [k, { ...v, b: () => v.bt }])), lengths: (t) => between([30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 220, 240, 260], 2.5 * t.d, Math.min(260, 10 * t.d)),
  grades: ["10.9"], suffix: "HV", def: { size: "M20", length: 70 }, galv: true, garnitur: garnitur("hvscheibe", "hvmutter") };
// --- Muttern ---
F.mutter = { cat: "muttern", label: "Sechskantmutter", norm: "ISO 4032", alias: ["DIN 934"], noun: "Sechskantmutter", template: "mutter", sizes: sizesWith(ALL_M), lengths: null, grades: STEEL_NUT, def: { size: "M12" } };
F.mutter4035 = { cat: "muttern", label: "Sechskantmutter, flach (Kontermutter)", norm: "ISO 4035", alias: ["DIN 439"], noun: "Sechskantmutter", template: "mutter", sizes: sizesWith(ALL_M, (t) => ({ m: t.m2 })), lengths: null, grades: ["04", "05", "A2-035", "A4-035"], def: { size: "M12" } };
const DIN985 = { M3: 4, M4: 5, M5: 5, M6: 6, M8: 8, M10: 10, M12: 12, M14: 14, M16: 16, M20: 20, M22: 22, M24: 24, M27: 27, M30: 30, M36: 36 };
F.din985 = { cat: "muttern", label: "Sicherungsmutter mit Klemmteil (niedrig)", norm: "DIN 985", alias: ["ISO 10511"], noun: "Sechskantmutter", template: "mutter", sizes: sizesWith(ALL_M, (t, k) => ({ m: DIN985[k] })), lengths: null, grades: ["8", "10", "A2-70", "A4-70"], def: { size: "M12" },
  build: (t) => { const mh = r2(t.m * 0.72); return [hex(t.s, mh), cyl(t.s * 0.9, t.m - mh, mh), bore(t.d, t.m)]; } };
const DIN1587 = { M4: [7, 8, 3.2], M5: [8, 10, 4], M6: [10, 12, 5], M8: [13, 15, 6.5], M10: [16, 18, 8], M12: [18, 22, 10], M16: [24, 28, 13], M20: [30, 34, 16], M24: [36, 42, 19] };
F.din1587 = { cat: "muttern", label: "Hutmutter, hohe Form", norm: "DIN 1587", noun: "Hutmutter", template: "mutter", sizes: tab(["s", "hh", "m"], DIN1587), lengths: null, grades: ["6", "A2", "A4"], def: { size: "M10" },
  build: (t) => { const D = t.s * 0.9; return [hex(t.s, t.m), rev([[0, t.m], [D / 2, t.m], ...dome(D, D / 2, t.hh - D / 2, 1).slice(1).map(([r, z]) => [r, z])].filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1])), cut(cyl(t.d, t.hh * 0.72 + 1, -1, { vol: ring(t.d, t.hh * 0.72) }))]; } };
const DIN6923 = { M5: [8, 5, 11.8, 1], M6: [10, 6, 14.2, 1.1], M8: [13, 8, 17.9, 1.2], M10: [15, 10, 21.8, 1.5], M12: [18, 12, 26, 1.8], M16: [24, 16, 34.5, 2.4], M20: [30, 20, 42.8, 3] };
F.din6923 = { cat: "muttern", label: "Sechskantmutter mit Flansch", norm: "DIN 6923", alias: ["ISO 4161"], noun: "Sechskantmutter", template: "mutter", sizes: tab(["s", "m", "dc", "c"], DIN6923), lengths: null, grades: ["8", "10", "A2-70"], def: { size: "M8" },
  build: (t) => [cyl(t.dc, t.c), hex(t.s, t.m - t.c, t.c), bore(t.d, t.m)] };
const DIN557 = { M5: [8, 4], M6: [10, 5], M8: [13, 6.5], M10: [17, 8], M12: [19, 10], M16: [24, 13] };
F.din557 = { cat: "muttern", label: "Vierkantmutter", norm: "DIN 557", noun: "Vierkantmutter", template: "mutter", sizes: tab(["s", "m"], DIN557), lengths: null, grades: ["5", "A2"], def: { size: "M8" },
  build: (t) => [sq(t.s, t.m), bore(t.d, t.m)] };
const DIN929 = { M4: [7, 3.5], M5: [9, 4], M6: [10, 5], M8: [14, 6.5], M10: [17, 8], M12: [19, 10], M16: [24, 13] };
F.din929 = { cat: "muttern", label: "Sechskant-Schweißmutter", norm: "DIN 929", noun: "Sechskant-Schweißmutter", template: "mutter", sizes: tab(["s", "m"], DIN929), lengths: null, grades: ["St", "A2"], def: { size: "M8" },
  build: (t) => {
    const w = Math.max(1.2, t.s * 0.12), r = t.s * 0.36;
    // drei Schweißbuckel unter der Auflage
    const warts = [0, 1, 2].map((i) => cyl(w, 0.6, -0.6, { x: r * Math.cos((2 * Math.PI * i) / 3 + Math.PI / 6), y: r * Math.sin((2 * Math.PI * i) / 3 + Math.PI / 6) }));
    return [hex(t.s, t.m), ...warts, bore(t.d, t.m)];
  } };
F.hvmutter = { cat: "muttern", label: "HV-Sechskantmutter (Stahlbau)", norm: "EN 14399-4", alias: ["DIN 6915"], noun: "Sechskantmutter", template: "mutter", sizes: HVS, lengths: null, grades: ["10"], suffix: "HV", def: { size: "M20" }, galv: true };
// --- Scheiben ---
F.scheibe = { cat: "scheiben", label: "Scheibe, normale Reihe", norm: "ISO 7089", alias: ["DIN 125-A"], noun: "Scheibe", template: "scheibe", sizes: tab(["d1", "d2", "h"], W7089), lengths: null, grades: WASHER, def: { size: "M12" }, dSize: true };
F.scheibe7090 = { cat: "scheiben", label: "Scheibe mit Fase", norm: "ISO 7090", alias: ["DIN 125-B"], noun: "Scheibe", template: "scheibe", sizes: tab(["d1", "d2", "h"], W7089), lengths: null, grades: WASHER, def: { size: "M12" }, dSize: true };
const W7093 = { M3: [3.2, 9, 0.8], M4: [4.3, 12, 1], M5: [5.3, 15, 1.2], M6: [6.4, 18, 1.6], M8: [8.4, 24, 2], M10: [10.5, 30, 2.5], M12: [13, 37, 3], M14: [15, 44, 3], M16: [17, 50, 3], M20: [22, 60, 4], M24: [26, 72, 5], M30: [33, 92, 6], M36: [39, 110, 8] };
F.scheibe7093 = { cat: "scheiben", label: "Scheibe, große Reihe", norm: "ISO 7093-1", alias: ["DIN 9021"], noun: "Scheibe", template: "scheibe", sizes: tab(["d1", "d2", "h"], W7093), lengths: null, grades: ["200 HV", "A2", "A4"], def: { size: "M8" }, dSize: true };
const W7094 = { M5: [5.5, 18, 2], M6: [6.6, 22, 2], M8: [9, 28, 3], M10: [11, 34, 3], M12: [13.5, 44, 4], M16: [17.5, 56, 5], M20: [22, 72, 6], M24: [26, 85, 6], M30: [33, 105, 8] };
F.scheibe7094 = { cat: "scheiben", label: "Scheibe, extra große Reihe", norm: "ISO 7094", alias: ["DIN 440"], noun: "Scheibe", template: "scheibe", sizes: tab(["d1", "d2", "h"], W7094), lengths: null, grades: ["100 HV", "A2"], def: { size: "M12" }, dSize: true };
const DIN127 = { M3: [3.1, 6.2, 0.8], M4: [4.1, 7.6, 0.9], M5: [5.1, 9.2, 1.2], M6: [6.1, 11.8, 1.6], M8: [8.1, 14.8, 2], M10: [10.2, 18.1, 2.2], M12: [12.2, 21.1, 2.5], M14: [14.2, 24.1, 3], M16: [16.2, 27.4, 3.5], M20: [20.2, 33.6, 4], M24: [24.5, 40, 5], M30: [30.5, 48.2, 6] };
F.din127 = { cat: "scheiben", label: "Federring, Form B", norm: "DIN 127-B", noun: "Federring", template: "scheibe", sizes: tab(["d1", "d2", "h"], DIN127), lengths: null, grades: ["Federstahl", "A2"], def: { size: "M8" }, dSize: true,
  build: (t) => [cyl(t.d2, t.h), bore(t.d1, t.h), cut(box((t.d2 - t.d1) / 2 + 2, Math.max(0.5, t.h * 0.5), t.h + 2, -1, { x: (t.d1 + t.d2) / 4, vol: ((t.d2 - t.d1) / 2) * Math.max(0.5, t.h * 0.5) * t.h }))] };
const DIN434 = { M8: [9, 22, 22, 3.8], M10: [11, 22, 22, 3.8], M12: [13.5, 26, 30, 4.9], M16: [17.5, 32, 36, 5.9], M20: [22, 40, 44, 7], M24: [26, 56, 56, 8.5] };
const DIN435 = { M10: [11, 22, 22, 4.6], M12: [13.5, 26, 30, 6.2], M16: [17.5, 32, 36, 7.5], M20: [22, 40, 44, 9.2], M24: [26, 56, 56, 10.85] };
// d2 = Kantenlänge (für die Vorlage »scheibe«)
const wedgeSizes = (rows) => Object.fromEntries(Object.entries(tab(["d1", "a", "bb", "h"], rows)).map(([k, v]) => [k, { ...v, d2: v.a }]));
const keil = (slope) => (t) => { const h1 = t.h - (slope * t.a) / 2, h2 = t.h + (slope * t.a) / 2; return [wedge(t.a, t.bb, h1, h2), { ...bore(t.d1, h2), vol: ring(t.d1, t.h) }]; };
F.din434 = { cat: "scheiben", label: "Vierkantscheibe für U-Träger (8 %)", norm: "DIN 434", noun: "Vierkantscheibe", template: "scheibe", sizes: wedgeSizes(DIN434), lengths: null, grades: ["St", "A2"], def: { size: "M12" }, dSize: true, galv: true, build: keil(0.08) };
F.din435 = { cat: "scheiben", label: "Vierkantscheibe für I-Träger (14 %)", norm: "DIN 435", noun: "Vierkantscheibe", template: "scheibe", sizes: wedgeSizes(DIN435), lengths: null, grades: ["St", "A2"], def: { size: "M12" }, dSize: true, galv: true, build: keil(0.14) };
F.hvscheibe = { cat: "scheiben", label: "HV-Scheibe (Stahlbau)", norm: "EN 14399-6", alias: ["DIN 6916"], noun: "Scheibe", template: "scheibe", sizes: HVS, lengths: null, grades: ["300 HV"], def: { size: "M20" }, dSize: true, galv: true };
// --- Gewindestangen, Spannschlösser ---
F.gewindestange = { cat: "gewinde", label: "Gewindestange", norm: "DIN 976-1", alias: ["DIN 975"], noun: "Gewindestange", template: "gewindestange", sizes: sizesWith(ALL_M), lengths: () => [500, 1000, 2000, 3000], freeLength: true, grades: ["4.8", "8.8", "A2-70", "A4-70"], def: { size: "M12", length: 1000 } };
/** Spannschloss DIN 1480 (offen, geschmiedet): l Körperlänge (innen zwischen den Gewindenaben), b Breite, e Nabenlänge */
const TURNBUCKLE = { M6: [70, 14, 9], M8: [80, 17, 11], M10: [100, 20, 13], M12: [125, 24, 15], M14: [140, 28, 17], M16: [170, 32, 19], M20: [200, 40, 23], M24: [255, 48, 28], M27: [255, 54, 31], M30: [300, 60, 34] };
F.spannschloss = { cat: "gewinde", label: "Spannschloss (offen)", norm: "DIN 1480", noun: "Spannschloss", template: "mutter", sizes: tab(["l", "bw", "e"], TURNBUCKLE), lengths: null, grades: ["verzinkt", "blank"], def: { size: "M12" }, seat: "center", noGalv: true,
  build: (t) => {
    // offener Bügel: zwei Naben mit Gewinde, verbunden durch zwei Seitenstege; Mitte bei z = 0
    const { l, bw: b, e } = t, w = Math.max(3, (b - t.d) / 2), y = b / 2 - w / 2;
    return [cyl(b * 0.8, e, l / 2), cyl(b * 0.8, e, -l / 2 - e), box(w, w, l, -l / 2, { y }), box(w, w, l, -l / 2, { y: -y }), cut(cyl(t.d, l + 2 * e + 2, -l / 2 - e - 1, { vol: ring(t.d, 2 * e) }))];
  } };
// --- Dübel und Anker (Typmaße nach Zulassung, Herstellerangaben prüfen) ---
const anchorHead = (t) => { const w = W7089[`M${t.d}`] || [t.d + 0.5, 2 * t.d, 0.15 * t.d]; const nut = METRIC[`M${t.d}`]; return { wd: w[1], wh: w[2], s: nut?.s ?? 1.6 * t.d, m: nut?.m ?? 0.8 * t.d }; };
const ANCHOR_L = { M8: [75, 95, 115, 135, 165], M10: [90, 110, 130, 150, 180], M12: [100, 120, 145, 160, 180, 200, 250], M16: [130, 150, 175, 220, 250], M20: [165, 200, 250], M24: [180, 230, 260] };
F.bolzenanker = { cat: "anker", label: "Bolzenanker (Stahl, Beton)", norm: "ETA", noun: "Bolzenanker", template: "gewindestange", sizes: sizesWith(Object.keys(ANCHOR_L), (t) => ({ hd: t.d })), lengths: (t, k) => ANCHOR_L[k], grades: ["5.8", "A4"], def: { size: "M12", length: 120 }, galv: true, hole: "drill", seat: "out",
  // Scheibe liegt bei z = 0 auf dem Anbauteil, Anker geht in −z durch Anbauteil in den Beton (Lage »out« wie eine Mutter)
  build: (t, L) => {
    const a = anchorHead(t), top = a.wh + a.m + 2 * t.P;
    return [cyl(a.wd, a.wh), hex(a.s, a.m, a.wh), cut(cyl(t.core, a.wh + a.m)), cyl(t.core, L, top - L), rev([[t.core / 2, top - L], [t.d / 2, top - L], [t.d / 2, top - L + 1.2 * t.d], [t.core / 2, top - L + 1.2 * t.d]])];
  } };
const ROD_L = { M8: [110, 150], M10: [130, 170, 200], M12: [160, 200, 260], M16: [190, 250, 300], M20: [260, 300, 350], M24: [300, 350, 400], M30: [380, 450] };
F.ankerstange = { cat: "anker", label: "Ankerstange für Injektionsmörtel", norm: "ETA", noun: "Ankerstange", template: "gewindestange", sizes: sizesWith(Object.keys(ROD_L), (t) => ({ hd: t.d + (t.d <= 12 ? 2 : 4) })), lengths: (t, k) => ROD_L[k], grades: ["5.8", "8.8", "A4-70"], def: { size: "M12", length: 160 }, galv: true, hole: "drill", seat: "out",
  build: (t, L) => {
    const a = anchorHead(t), top = a.wh + a.m + 2 * t.P, c = t.core / 2;
    return [cyl(a.wd, a.wh), hex(a.s, a.m, a.wh), cut(cyl(t.core, a.wh + a.m)), rev([[0, top - L], [c * 0.4, top - L], [c, top - L + c * 0.6], [c, top], [0, top]])];
  } };
const BETON = { 6: [10, 4, 13], 8: [13, 5, 17], 10: [15, 6, 21], 12: [17, 7, 24], 14: [21, 8, 28] };
F.betonschraube = { cat: "anker", label: "Betonschraube mit Sechskantkopf", norm: "ETA", noun: "Betonschraube", template: "sechskantschraube",
  sizes: Object.fromEntries(Object.entries(BETON).map(([k, [s, kk, dc]]) => [k, { d: Number(k), hd: Number(k), s, k: kk, dc, core: Number(k) * 0.85 }])), lengths: (t) => between([40, 50, 60, 70, 80, 100, 120, 140, 160, 200], 5 * t.d, 25 * t.d), grades: ["St verzinkt", "A4"], def: { size: "10", length: 80 }, hole: "drill", sizePrefix: "Ø",
  build: (t, L) => [cyl(t.dc, 2, -2), hex(t.s, t.k, -2 - t.k), cyl(t.d, L)] };
const PA = { 5: [25], 6: [30, 40], 8: [40, 50], 10: [50, 60], 12: [60, 70], 14: [70, 75] };
F.spreizduebel = { cat: "anker", label: "Spreizdübel (Kunststoff)", norm: "ETA", noun: "Spreizdübel", template: "duebel", sizes: Object.fromEntries(Object.keys(PA).map((k) => [k, { d: Number(k), di: Number(k) * 0.55, hd: Number(k) }])), lengths: (t, k) => PA[k], grades: ["PA 6"], def: { size: "8", length: 40 }, sizePrefix: "Ø", noGalv: true };
// --- Nieten ---
const BLIND = { 3: [6, 1.2], "3,2": [6.4, 1.3], 4: [8, 1.7], "4,8": [9.6, 2], 5: [10, 2.1], 6: [12, 2.5], "6,4": [12.8, 2.7] };
const num = (k) => Number(String(k).replace(",", "."));
const blindSizes = Object.fromEntries(Object.entries(BLIND).map(([k, [dk, kk]]) => [k, { d: num(k), dk, k: kk, hd: num(k) + 0.1, hollow: 0.5 }]));
F.blindniet = { cat: "nieten", label: "Blindniet, Flachrundkopf", norm: "ISO 15977", alias: ["DIN 7337-A"], noun: "Blindniet", template: "niet", sizes: blindSizes, lengths: (t) => between([6, 8, 10, 12, 14, 16, 18, 20, 25, 30], 1.5 * t.d, 30), grades: ["Al/St", "Al/Al", "St/St", "A2/A2"], def: { size: "4", length: 10 }, noGalv: true,
  build: (t, L) => [cyl(t.dk, t.k, -t.k), cyl(t.d, L), cut(cyl(t.d * 0.5, L + t.k + 2, -t.k - 1, { vol: ring(t.d * 0.5, L + t.k) }))] };
F.blindnietsenk = { cat: "nieten", label: "Blindniet, Senkkopf 120°", norm: "ISO 15978", alias: ["DIN 7337-B"], noun: "Blindniet", template: "niet", sizes: blindSizes, lengths: (t) => between([6, 8, 10, 12, 14, 16, 18, 20, 25, 30], 1.5 * t.d, 30), grades: ["Al/St", "St/St", "A2/A2"], def: { size: "4", length: 10 }, seat: "flush", noGalv: true,
  build: (t, L) => { const k = ((t.dk - t.d) / 2) * Math.tan(Math.PI / 6); return [rev([[t.d * 0.25, 0], [t.dk / 2, 0], [t.d / 2, k], [t.d / 2, L], [t.d * 0.25, L]])]; } };
const DIN124 = { 10: [16, 6.5], 12: [19, 7.5], 14: [22, 9], 16: [25, 10], 20: [32, 13], 22: [36, 14], 24: [40, 16] };
F.din124 = { cat: "nieten", label: "Halbrundniet (Stahlbau)", norm: "DIN 124", noun: "Halbrundniet", template: "niet", sizes: Object.fromEntries(Object.entries(DIN124).map(([k, [dk, kk]]) => [k, { d: num(k), dk, k: kk, hd: num(k) + 1 }])), lengths: (t) => between([20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100, 120], 2 * t.d, 8 * t.d), grades: ["S235"], def: { size: "16", length: 50 } };
const DIN660 = [2, 2.5, 3, 4, 5, 6, 8];
F.din660 = { cat: "nieten", label: "Halbrundniet (klein)", norm: "DIN 660", alias: ["ISO 1051"], noun: "Halbrundniet", template: "niet", sizes: Object.fromEntries(DIN660.map((d) => [String(d).replace(".", ","), { d, dk: 1.75 * d, k: 0.6 * d, hd: d + 0.1 }])), lengths: (t) => between(PIN_LENGTHS, 2 * t.d, 10 * t.d), grades: ["St", "Al", "Ms", "A2"], def: { size: "4", length: 12 } };
const NUTRIV = { M4: [6, 9, 0.8, 10], M5: [7, 10, 1, 12], M6: [9, 12, 1.5, 15], M8: [11, 15, 1.5, 18], M10: [12, 16, 2, 20], M12: [16, 22, 2, 24] };
F.blindnietmutter = { cat: "nieten", label: "Blindnietmutter, Flachbund", norm: "Werknorm", noun: "Blindnietmutter", template: "niet", sizes: Object.fromEntries(Object.entries(NUTRIV).map(([k, [D, dk, kk, L]]) => [k, { ...METRIC[k], D, dk, k: kk, LL: L, hd: D + 0.1 }])), lengths: null, grades: ["St verzinkt", "A2", "Al"], def: { size: "M6" }, noGalv: true, seat: "in",
  build: (t) => [cyl(t.dk, t.k, -t.k), cyl(t.D, t.LL - t.k), cut(cyl(t.d, t.LL + 2, -t.k - 1, { vol: ring(t.d, t.LL) }))] };
// --- Stifte und Bolzen ---
const PIN_D = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20];
const dKey = (d) => String(d).replace(".", ",");
const pinSizes = (list, extra = () => ({})) => Object.fromEntries(list.map((d) => [dKey(d), { d, hd: d, ...extra(d) }]));
F.iso2338 = { cat: "stifte", label: "Zylinderstift, ungehärtet", norm: "ISO 2338", alias: ["DIN 7"], noun: "Zylinderstift", template: "stift", sizes: pinSizes(PIN_D), lengths: (t) => between(PIN_LENGTHS, 2 * t.d, Math.min(200, 10 * t.d)), grades: ["St", "A1"], tol: "m6", def: { size: "6", length: 30 }, noGalv: true };
F.iso8734 = { cat: "stifte", label: "Zylinderstift, gehärtet", norm: "ISO 8734", alias: ["DIN 6325"], noun: "Zylinderstift", template: "stift", sizes: pinSizes(PIN_D.filter((d) => d >= 1.5)), lengths: (t) => between(PIN_LENGTHS, 2 * t.d, Math.min(200, 10 * t.d)), grades: ["St gehärtet", "C1"], tol: "m6", def: { size: "6", length: 30 }, noGalv: true };
const SPANN = { 2: 0.4, 2.5: 0.5, 3: 0.6, 4: 0.8, 5: 1, 6: 1.2, 8: 1.5, 10: 2, 12: 2.5, 13: 2.5, 16: 3, 20: 4 };
F.iso8752 = { cat: "stifte", label: "Spannstift, schwere Ausführung", norm: "ISO 8752", alias: ["DIN 1481"], noun: "Spannstift", template: "stift", sizes: pinSizes(Object.keys(SPANN).map(Number), (d) => ({ wall: SPANN[d] })), lengths: (t) => between(PIN_LENGTHS, 2 * t.d, Math.min(200, 10 * t.d)), grades: ["St", "A2"], def: { size: "6", length: 30 }, noGalv: true,
  build: (t, L) => [cyl(t.d, L), bore(t.d - 2 * t.wall, L), cut(box(t.wall * 2 + 1, Math.max(0.3, t.d * 0.12), L + 2, -1, { x: t.d / 2, vol: t.wall * Math.max(0.3, t.d * 0.12) * L }))] };
F.iso2339 = { cat: "stifte", label: "Kegelstift 1:50", norm: "ISO 2339", alias: ["DIN 1"], noun: "Kegelstift", template: "stift", sizes: pinSizes(PIN_D.filter((d) => d >= 2)), lengths: (t) => between(PIN_LENGTHS, 3 * t.d, Math.min(200, 12 * t.d)), grades: ["St", "A1"], def: { size: "6", length: 40 }, noGalv: true,
  build: (t, L) => [rev([[0, 0], [t.d / 2, 0], [t.d / 2 + L / 100, L], [0, L]])] };
const SPLINT = [1, 1.2, 1.6, 2, 2.5, 3.2, 4, 5, 6.3, 8, 10, 13];
F.iso1234 = { cat: "stifte", label: "Splint", norm: "ISO 1234", alias: ["DIN 94"], noun: "Splint", template: "stift", sizes: pinSizes(SPLINT), lengths: (t) => between(PIN_LENGTHS, 4 * t.d, Math.min(200, 25 * t.d)), grades: ["St", "A2"], def: { size: "4", length: 32 }, noGalv: true,
  build: (t, L) => { const ds = 0.9 * t.d, eye = 2 * t.d; return [cyl(ds, L), cyl(eye, ds, -eye / 2, { axis: "x" }), cut(cyl(eye - 2 * ds, ds + 2, -eye / 2, { axis: "x", vol: ring(eye - 2 * ds, ds) }))]; } };
const ISO2341 = { 3: [5, 1, 0.8], 4: [6, 1, 1], 5: [8, 1.6, 1.2], 6: [10, 2, 1.6], 8: [14, 3, 2], 10: [18, 4, 3.2], 12: [20, 4, 3.2], 14: [22, 4, 4], 16: [25, 4.5, 4], 20: [30, 5, 5], 24: [36, 6, 6.3], 30: [44, 8, 8] };
F.iso2341 = { cat: "stifte", label: "Bolzen mit Kopf und Splintloch", norm: "ISO 2341-B", alias: ["DIN 1444"], noun: "Bolzen", template: "bolzen", sizes: Object.fromEntries(Object.entries(ISO2341).map(([k, [dk, kk, d1]]) => [k, { d: num(k), hd: num(k) + 0.5, dk, k: kk, d1, le: Math.max(2 * d1, 1.6 * d1 + 1) }])), lengths: (t) => between(PIN_LENGTHS, 2 * t.d, Math.min(200, 10 * t.d)), grades: ["St", "A2"], tol: "h11", def: { size: "10", length: 40 }, galv: true };

// --- Beschläge (E11): Größe nach Rohr bzw. Banddurchmesser, Maße typischer Handelsware (keine Norm) ---
// Anschweißband ab Unterkante (zwei Hälften mit 2 mm Fuge), Kappen ab Rohrende (Stopfen in −z ins Rohr),
// Bodenanschlag ab Boden (Winkel mit Steg in +y, zwei Dübellöcher Ø 9)
const RD = { "Ø33,7": { D: 33.7 }, "Ø42,4": { D: 42.4 }, "Ø48,3": { D: 48.3 }, "Ø60,3": { D: 60.3 }, "Ø76,1": { D: 76.1 } };
const beschlag = (f) => ({ cat: "beschlaege", norm: "", template: "beschlag", lengths: null, beschlag: true, ...f });
const plug = (D) => { const r = D / 2, wall = Math.max(2, D * 0.06); return cyl(2 * (r - wall), 12, -12); };
F.anschweissband = beschlag({ label: "Anschweißband (Torband)", noun: "Anschweißband", grades: ["S235", "A2"], def: { size: "Ø20 x 100" },
  sizes: { "Ø16 x 80": { D: 16, L: 80 }, "Ø20 x 100": { D: 20, L: 100 }, "Ø25 x 120": { D: 25, L: 120 }, "Ø30 x 140": { D: 30, L: 140 } },
  build: (m) => { const half = (m.L - 2) / 2; return [cyl(m.D, half), cyl(m.D * 0.44, 2, half), cyl(m.D, half, half + 2)]; } });
F.kugelkappe = beschlag({ label: "Kugelkappe für Rundrohr", noun: "Kugelkappe für Rohr", grades: ["S235", "A2"], def: { size: "Ø42,4" }, sizes: RD,
  build: (m) => {
    const r = m.D / 2, R = r * 1.05, c = 3 + r * 0.8, t0 = Math.asin((3 - c) / R), n = 14;
    const pts = [[0, 3]];
    for (let i = 0; i <= n; i++) { const t = t0 + ((Math.PI / 2 - t0) * i) / n; pts.push([i === n ? 0 : R * Math.cos(t), c + R * Math.sin(t)]); }
    return [plug(m.D), cyl(m.D, 3), rev(pts.filter((p, i) => i < 2 || p[0] > 1e-9 || i === pts.length - 1))];
  } });
F.rohrkappe = beschlag({ label: "Flache Kappe für Rundrohr", noun: "Rohrkappe flach", grades: ["S235", "A2", "Kunststoff"], def: { size: "Ø42,4" }, sizes: RD,
  build: (m) => [plug(m.D), cyl(m.D + 2, 3)] });
F.vierkantkappe = beschlag({ label: "Kappe für Vierkantrohr", noun: "Vierkantkappe", grades: ["S235", "A2", "Kunststoff"], def: { size: "40 x 40" },
  sizes: Object.fromEntries([30, 40, 50, 60, 80, 100].map((a) => [`${a} x ${a}`, { a }])),
  build: (m) => { const w = Math.max(2, m.a * 0.06); return [box(m.a - 2 * w, m.a - 2 * w, 12, -12), box(m.a + 2, m.a + 2, 3)]; } });
F.bodenanschlag = beschlag({ label: "Bodenanschlag für Tore", noun: "Bodenanschlag", grades: ["S235", "A2"], def: { size: "klein (40 hoch)" },
  sizes: { "klein (40 hoch)": { w: 60, d: 50, h: 40, t: 5 }, "groß (60 hoch)": { w: 80, d: 60, h: 60, t: 6 } },
  build: (m) => [box(m.w, m.d, m.t), box(m.w, m.t, m.h - m.t, m.t, { y: m.d / 2 - m.t / 2 }), ...[-m.w / 4, m.w / 4].map((x) => cut(cyl(9, m.t + 2, -1, { x, y: -m.t, vol: (Math.PI / 4) * 81 * m.t })))] });

/** Kategorien in der Reihenfolge des Dialogs */
export const NORM_CATEGORIES = [["schrauben", "Schrauben"], ["muttern", "Muttern"], ["scheiben", "Scheiben & Federringe"], ["gewinde", "Gewindestangen & Spannschlösser"], ["anker", "Dübel & Anker"], ["nieten", "Nieten"], ["stifte", "Stifte & Bolzen"], ["beschlaege", "Beschläge"]];

/** Familie fertig machen: Abgeleitetes (length, seat, hole, sizes-Liste) aus der Vorlage */
function finish(id, f) {
  const T = TEMPLATES[f.template];
  return Object.freeze({
    id, ...f, length: !!f.lengths || !!f.freeLength || (T.length && f.lengths !== null),
    seat: f.seat || T.seat, hole: f.hole || T.hole,
    sizeList: Object.keys(f.sizes), build: f.build || T.build,
  });
}
export const NORM_FAMILIES = Object.fromEntries(Object.entries(F).map(([id, f]) => [id, finish(id, f)]));

// ---------- eigene Familien ----------
/** Eigene Familie prüfen: { ok, errors[] }. Erwartet id, label, norm, template, sizes { Größe: { Maße } }, grades[] */
export function validateFamily(x) {
  const errors = [];
  if (!x || typeof x !== "object") return { ok: false, errors: ["kein Objekt"] };
  if (!/^[a-z0-9_-]{2,40}$/i.test(x.id || "")) errors.push("id: 2–40 Zeichen (Buchstaben, Ziffern, - _)");
  if (NORM_FAMILIES[x.id]) errors.push(`id »${x.id}« gibt es schon in der Bibliothek`);
  if (!x.label) errors.push("label fehlt");
  if (!x.norm) errors.push("norm fehlt (z. B. »DIN 912« oder »Werknorm 123«)");
  const T = TEMPLATES[x.template];
  if (!T) errors.push(`template: eine von ${Object.keys(TEMPLATES).join(", ")}`);
  if (!x.sizes || typeof x.sizes !== "object" || !Object.keys(x.sizes).length) errors.push("sizes: mindestens eine Größe");
  else if (T) {
    for (const [k, v] of Object.entries(x.sizes)) {
      for (const f of T.fields) if (!(Number(v?.[f]) > 0)) errors.push(`${k}: Maß ${f} fehlt oder ≤ 0`);
      for (const [f, n] of Object.entries(v || {})) if (typeof n !== "number" || !Number.isFinite(n)) errors.push(`${k}: ${f} ist keine Zahl`);
    }
  }
  if (x.lengths != null && (!Array.isArray(x.lengths) || !x.lengths.every((l) => l > 0))) errors.push("lengths: Liste positiver Zahlen");
  if (T?.length && !x.lengths?.length) errors.push("lengths: Vorlage braucht Längen");
  if (!Array.isArray(x.grades) || !x.grades.length || !x.grades.every((g) => typeof g === "string")) errors.push("grades: Liste mit mindestens einem Werkstoff");
  if (x.cat && !NORM_CATEGORIES.some(([k]) => k === x.cat)) errors.push(`cat: eine von ${NORM_CATEGORIES.map(([k]) => k).join(", ")}`);
  return { ok: !errors.length, errors };
}
/** Eigene Familie (geprüftes JSON) in eine Familie wandeln; Gewindemaße M… werden ergänzt */
export function customFamily(x) {
  const v = validateFamily({ ...x, id: x.id });
  if (!v.ok && !(v.errors.length === 1 && v.errors[0].includes("gibt es schon"))) throw new Error("Eigenes Normteil: " + v.errors.join("; "));
  const sizes = Object.fromEntries(Object.entries(x.sizes).map(([k, d]) => [k, { ...(METRIC[k] || {}), ...d, hd: d.hd ?? d.d ?? d.d1 }]));
  const lengths = x.lengths?.length ? [...x.lengths].sort((a, b) => a - b) : null;
  return finish("custom:" + x.id, { cat: x.cat || "schrauben", label: x.label, norm: x.norm, alias: x.alias || [], noun: x.noun || x.label, template: x.template, sizes, lengths: lengths ? () => lengths : null, grades: x.grades, def: { size: Object.keys(sizes)[0], length: lengths?.[0] }, custom: true });
}

/** Familie zu kind; eigene Familien kommen aus dem Feature (f.custom), damit Projektdateien in sich vollständig sind */
export function familyOf(kind, custom) {
  if (NORM_FAMILIES[kind]) return NORM_FAMILIES[kind];
  if (custom && String(kind).startsWith("custom:")) return customFamily(custom);
  return null;
}
export const sizeDims = (fam, size) => fam?.sizes[size] || null;
/** Längen zur Größe (leer = keine Länge) */
export const lengthsFor = (fam, size) => { const t = sizeDims(fam, size); return fam?.lengths && t ? fam.lengths(t, size) || [] : []; };

/** Rezept eines Normteils (wirft bei unbekannter Größe) */
export function normRecipe(fam, size, L = 0) {
  const t = sizeDims(fam, size);
  if (!t) throw new Error(`Unbekannte Gewindegröße: ${size} gibt es für ${fam.norm} nicht`);
  return fam.build(t, L, size);
}

/** Bezeichnung wie auf der Stückliste */
export function familyDesignation(fam, { size, length, grade, galv }) {
  const t = sizeDims(fam, size);
  if (fam.beschlag) return [`${fam.noun} ${size}`, grade].filter(Boolean).join(" - ") + (galv && !isStainless(grade) && grade !== "Kunststoff" ? " - tZn" : "");
  const sz = fam.dSize && t?.d ? String(t.d).replace(".", ",") : `${fam.sizePrefix || ""}${size}`;
  const main = fam.length ? `${sz}${fam.tol ? " " + fam.tol : ""} x ${fmtDe(Number(length) || 0)}` : sz;
  const parts = [`${fam.noun} ${fam.norm}`, main];
  if (grade) parts.push(grade);
  if (fam.suffix) parts.push(fam.suffix);
  return parts.join(" - ") + (galv && !isStainless(grade) && !fam.noGalv ? " - tZn" : "");
}

/** Suche in der Bibliothek: Norm (auch alte DIN), Benennung, Größe – Rückgabe Liste der Familien */
export function searchFamilies(q, families = Object.values(NORM_FAMILIES)) {
  const words = String(q || "").toLowerCase().replace(/\b(din|iso|en)(?=\d)/g, "$1 ").split(/\s+/).filter(Boolean);
  if (!words.length) return families;
  const hay = (f) => [f.label, f.norm, f.noun, ...(f.alias || []), NORM_CATEGORIES.find(([k]) => k === f.cat)?.[1] || "", ...f.sizeList].join(" ").toLowerCase().replace(/\s+/g, " ");
  const compact = (s) => s.replace(/\s+/g, "");
  return families.filter((f) => { const H = hay(f), C = compact(H); return words.every((w) => H.includes(w) || C.includes(w)); });
}

/** Masse kg/Stück aus dem Rezept */
export function familyMass(fam, size, L, grade) {
  return (recipeVolume(normRecipe(fam, size, L)) * gradeInfo(grade).density) / 1e6;
}

/**
 * Größe zu einer Bohrung (Ø in mm): Schrauben in Durchgangsbohrung (größtes d ≤ Ø − 0,3) oder Gewindebohrung
 * (Kernloch ≈ d − P), Dübel/Anker/Stifte/Nieten an ihren Bohr-Ø (nächster innerhalb 0,8 mm). Rückgabe { size, threaded } oder null
 */
export function sizeForHole(fam, dia) {
  let best = null;
  if (fam.hole === "clearance") {
    for (const k of fam.sizeList) {
      const t = fam.sizes[k];
      if (t.P && Math.abs(dia - (t.d - t.P)) <= 0.25) return { size: k, threaded: true };
    }
    for (const k of fam.sizeList) { const d = fam.sizes[k].d ?? fam.sizes[k].d1; if (d <= dia - 0.3 + 1e-9 && (!best || d > fam.sizes[best].d)) best = k; }
    return best ? { size: best, threaded: false } : null;
  }
  let bd = 0.8;
  for (const k of fam.sizeList) { const hd = fam.sizes[k].hd ?? fam.sizes[k].d; const e = Math.abs(hd - dia); if (e <= bd + 1e-9) { bd = e; best = k; } }
  return best ? { size: best, threaded: false } : null;
}

/**
 * Garnitur an einer Bohrung (Schraube, Scheiben, Mutter) entlang der Einbauachse a (a = 0 Oberseite der Bohrung,
 * a > 0 ins Material; Klemmlänge clamp). Rückgabe { length, parts: [{ kind, size, length?, grade, at, flip }] }:
 * at = Lage des Teil-Ursprungs auf der Achse, flip = Teil zeigt mit +z aus dem Material heraus (Scheibe/Mutter oben).
 */
export function garniturAt(fam, size, clamp, grade, { washerHead = true, washerNut = true, nut = true } = {}) {
  const g = fam.garnitur || {};
  const t = sizeDims(fam, size);
  if (!t) throw new Error(`Unbekannte Größe ${size}`);
  if (!(clamp > 0)) throw new Error("Klemmlänge muss > 0 sein");
  const wHead = washerHead && g.washerHead ? NORM_FAMILIES[g.washerHead] : null;
  const wNut = washerNut && g.washerNut ? NORM_FAMILIES[g.washerNut] : null;
  const nutF = nut && g.nut ? NORM_FAMILIES[g.nut] : null;
  const hw = (f) => (f && sizeDims(f, size) ? sizeDims(f, size).h : 0);
  const hHead = hw(wHead), hNut = hw(wNut), mNut = nutF && sizeDims(nutF, size) ? sizeDims(nutF, size).m : 0;
  const parts = [];
  const flush = fam.seat === "flush";
  // Senkkopf: Länge über alles ab Oberseite; sonst ab Kopfunterseite (über der Kopfscheibe)
  const start = flush ? 0 : -hHead;
  const need = clamp - start + hNut + mNut + (nutF ? 2 * (t.P || 1) : 0);
  const list = lengthsFor(fam, size);
  const length = list.find((l) => l >= need - 1e-9) ?? Math.ceil(need / 5) * 5;
  if (wHead && !flush) parts.push({ kind: wHead.id, size, grade: matchingGrade(grade, "washer"), at: 0, flip: true });
  parts.push({ kind: fam.id, size, length, grade, at: start, flip: false });
  if (wNut) parts.push({ kind: wNut.id, size, grade: matchingGrade(grade, "washer"), at: clamp, flip: false });
  if (nutF) parts.push({ kind: nutF.id, size, grade: fam.id === "hv14399" ? "10" : matchingGrade(grade, "nut"), at: clamp + hNut, flip: false });
  return { length, need, parts };
}
