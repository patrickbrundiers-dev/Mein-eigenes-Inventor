// Profilbibliothek nach Normen, getrennt nach Werkstoffgruppe (Baustahl, Edelstahl, Aluminium).
// Auswahl in Schritten: Werkstoff → Profilart → Abmessung → Wandstärke (nur, was es für die Abmessung gibt).
// Maßreihen nach den genannten Normen (gängige Lagerware des Stahl- und Metallhandels, keine vollständigen Normtabellen).

import { STEEL_TABLES, catalogToDims } from "./sections.js";

// Kurzschreibweise: { Abmessung: [Wandstärken] }, Abmessung "42.4" bzw. "60x40"
const series = (norm, map) => ({ norm, map });
// Flach-/Breitenreihe: jede Breite mit allen Dicken, die kleiner als die Breite sind (bis max)
const widths = (norm, ws, ts, max = Infinity) => series(norm, Object.fromEntries(ws.map((w) => [String(w), ts.filter((t) => t < w && t <= max)])));
const bars = (norm, ds) => ({ norm, get list() { return (typeof ds === "function" ? ds() : ds).map(String); } });

export const LIB_GROUPS = {
  stahl: {
    label: "Baustahl (S235, S355)",
    // EN 10219-2: Außenradius 2·t bis t = 6, 2,5·t bis t = 10, darüber 3·t (wie catalogToDims)
    radius: (t) => (t <= 6 ? 2 * t : t <= 10 ? 2.5 * t : 3 * t),
    kinds: {
      rohr: [
        series("EN 10305-3 (Präzisionsstahlrohr)", {
          10: [1, 1.5], 12: [1, 1.5], 15: [1, 1.5], 16: [1, 1.5, 2], 18: [1.5], 20: [1.5, 2], 22: [1.5, 2], 25: [1.5, 2], 28: [1.5, 2], 30: [1.5, 2, 3],
          35: [1.5, 2], 40: [1.5, 2, 3], 45: [2], 50: [2, 3], 60: [2, 3], 70: [2, 3], 80: [2, 3],
        }),
        series("EN 10219-2 / EN 10210-2", {
          21.3: [2, 2.3, 2.6, 3.2], 26.9: [2, 2.3, 2.6, 3.2], 33.7: [2, 2.6, 3.2, 4], 42.4: [2, 2.6, 3.2, 4], 48.3: [2, 2.6, 3.2, 4, 5],
          60.3: [2, 2.6, 2.9, 3.2, 3.6, 4, 5], 76.1: [2, 2.6, 2.9, 3.2, 4, 5], 88.9: [2.6, 3.2, 4, 5, 6.3], 101.6: [3.2, 3.6, 4, 5, 6.3],
          114.3: [3.2, 3.6, 4, 5, 6.3], 139.7: [3.2, 4, 5, 6.3, 8], 168.3: [4, 5, 6.3, 8, 10], 193.7: [5, 6.3, 8, 10],
          219.1: [5, 6.3, 8, 10, 12.5], 244.5: [6.3, 8, 10, 12.5], 273: [6.3, 8, 10, 12.5], 323.9: [6.3, 8, 10, 12.5],
        }),
      ],
      vierkant: [
        series("EN 10305-5 (Präzisionsstahlrohr)", { 15: [1, 1.5], 20: [1.5], 25: [1.5], 30: [1.5] }),
        series("EN 10219-2", {
          20: [2], 25: [2, 2.5], 30: [2, 2.5, 3], 35: [2, 3], 40: [2, 2.5, 3, 4], 50: [2, 2.5, 3, 4, 5], 60: [2.5, 3, 4, 5], 70: [3, 4, 5],
          80: [3, 4, 5, 6.3], 90: [4, 5, 6.3], 100: [3, 4, 5, 6.3, 8], 120: [4, 5, 6.3, 8, 10], 140: [5, 6.3, 8, 10], 150: [5, 6.3, 8, 10],
          160: [5, 6.3, 8, 10], 180: [6.3, 8, 10], 200: [6.3, 8, 10, 12.5], 250: [8, 10, 12.5], 300: [10, 12.5],
        }),
      ],
      rechteck: [
        series("EN 10219-2", {
          "30x20": [2], "40x20": [2, 2.5, 3], "40x30": [2, 3], "50x20": [2, 3], "50x25": [2, 2.5, 3], "50x30": [2, 3, 4], "60x20": [2, 3],
          "60x30": [2, 3, 4], "60x40": [2, 3, 4, 5], "70x40": [3, 4], "70x50": [3, 4], "80x40": [3, 4, 5], "80x50": [3, 4], "80x60": [3, 4, 5],
          "90x50": [3, 4, 5], "100x40": [3, 4, 5], "100x50": [3, 4, 5, 6.3], "100x60": [3, 4, 5, 6.3], "100x80": [4, 5, 6.3],
          "120x40": [4, 5], "120x60": [4, 5, 6.3], "120x80": [4, 5, 6.3, 8], "140x80": [4, 5, 6.3, 8], "150x50": [4, 5, 6.3],
          "150x100": [5, 6.3, 8, 10], "160x80": [4, 5, 6.3, 8], "180x100": [5, 6.3, 8, 10], "200x100": [5, 6.3, 8, 10],
          "200x120": [6.3, 8, 10], "250x150": [6.3, 8, 10], "300x200": [8, 10, 12.5],
        }),
      ],
      flach: [widths("EN 10058", [10, 12, 15, 16, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 140, 150, 160, 180, 200], [3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30])],
      rund: [bars("EN 10060", [5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 30, 32, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100, 110, 120, 130, 140, 150])],
      vierkantvoll: [bars("EN 10059", [8, 10, 12, 14, 16, 18, 20, 22, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100])],
      winkel: [
        series("EN 10056-1 (gleichschenklig)", {
          "20x20": [3, 4], "25x25": [3, 4, 5], "30x30": [3, 4, 5], "35x35": [4, 5], "40x40": [4, 5, 6], "45x45": [4.5, 5], "50x50": [5, 6, 8],
          "60x60": [5, 6, 8], "65x65": [7], "70x70": [6, 7], "75x75": [6, 8], "80x80": [8, 10], "90x90": [7, 8, 9, 10], "100x100": [8, 10, 12],
          "120x120": [10, 12], "130x130": [12], "150x150": [10, 12, 15], "160x160": [15], "180x180": [16, 18], "200x200": [16, 20],
        }),
        series("EN 10056-1 (ungleichschenklig)", {
          "30x20": [3, 4], "40x20": [4], "40x25": [4], "50x30": [5], "60x30": [5], "60x40": [5, 6], "65x50": [5], "70x50": [6], "75x50": [6, 8],
          "80x40": [6, 8], "80x60": [7], "100x50": [6, 8], "100x65": [7, 8], "100x75": [8], "120x80": [8, 10], "150x75": [9], "150x90": [10],
          "150x100": [10], "200x100": [10],
        }),
      ],
      u: [
        series("EN 10162 (kaltgeformt)", {
          "30x15": [2], "40x20": [2, 3], "50x25": [2, 3], "50x30": [3], "60x30": [3, 4], "80x40": [3, 4], "100x40": [3], "100x50": [4, 5],
          "120x50": [4], "120x60": [5], "140x60": [5], "160x80": [5], "200x80": [6],
        }),
      ],
      ipe: [bars("DIN 1025-5 / EN 10365", () => Object.keys(STEEL_TABLES.ipe))],
      hea: [bars("DIN 1025-3 / EN 10365", () => Object.keys(STEEL_TABLES.hea))],
      heb: [bars("DIN 1025-2 / EN 10365", () => Object.keys(STEEL_TABLES.heb))],
      upn: [bars("DIN 1026-1 / EN 10365", () => Object.keys(STEEL_TABLES.upn))],
      t: [bars("EN 10055", () => Object.keys(STEEL_TABLES.t))],
    },
  },
  edelstahl: {
    label: "Edelstahl (1.4301, 1.4571)",
    radius: (t) => 2 * t,
    kinds: {
      rohr: [
        series("EN 10217-7 / DIN 11850 (geschweißt)", {
          8: [1], 10: [1, 1.5], 12: [1, 1.5, 2], 15: [1, 1.5], 16: [1, 1.5, 2], 18: [1, 1.5], 20: [1, 1.5, 2], 21.3: [1.6, 2], 22: [1, 1.5, 2],
          25: [1, 1.5, 2], 26.9: [1.6, 2], 28: [1.5], 30: [1.5, 2], 32: [1.5, 2], 33.7: [2], 35: [1.5, 2], 38: [1.5, 2], 40: [1.5, 2],
          42.4: [1.5, 2, 2.6], 45: [2], 48.3: [1.5, 2, 2.6], 50: [1.5, 2], 51: [1.5], 53: [1.5], 60.3: [2, 2.6, 3], 63.5: [1.5], 70: [2],
          76.1: [2, 3], 88.9: [2, 3], 101.6: [2, 3], 114.3: [2, 3], 139.7: [2, 3], 168.3: [3],
        }),
      ],
      vierkant: [
        series("EN 10296-2 (geschweißt)", {
          10: [1], 12: [1], 15: [1, 1.5], 20: [1, 1.5, 2], 25: [1.5, 2], 30: [1.5, 2, 3], 35: [1.5, 2], 40: [1.5, 2, 3, 4], 50: [1.5, 2, 3, 4],
          60: [2, 3, 4], 70: [2, 3], 80: [2, 3, 4], 100: [2, 3, 4], 120: [3, 4], 150: [4],
        }),
      ],
      rechteck: [
        series("EN 10296-2 (geschweißt)", {
          "20x10": [1, 1.5], "30x10": [1.5], "30x15": [1.5], "30x20": [1.5, 2], "40x10": [1.5], "40x20": [1.5, 2], "40x30": [2], "50x20": [1.5, 2],
          "50x25": [1.5, 2], "50x30": [2, 3], "60x20": [2], "60x30": [2, 3], "60x40": [2, 3], "80x20": [2], "80x40": [2, 3, 4], "100x20": [2],
          "100x40": [2, 3], "100x50": [2, 3, 4], "120x60": [3, 4], "150x50": [3], "160x80": [4], "200x100": [4],
        }),
      ],
      flach: [widths("EN 10058 / EN 10088-3", [10, 12, 15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 100, 120, 150], [2, 3, 4, 5, 6, 8, 10, 12, 15, 20])],
      rund: [bars("EN 10060 / EN 10088-3", [3, 4, 5, 6, 8, 10, 12, 14, 15, 16, 18, 20, 22, 25, 28, 30, 32, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100])],
      vierkantvoll: [bars("EN 10059 / EN 10088-3", [5, 6, 8, 10, 12, 14, 15, 16, 20, 25, 30, 35, 40, 50, 60])],
      winkel: [
        series("EN 10056-1 (gleichschenklig)", {
          "20x20": [3], "25x25": [3], "30x30": [3, 4], "35x35": [4], "40x40": [4, 5], "50x50": [5, 6], "60x60": [6], "70x70": [7], "80x80": [8], "100x100": [10],
        }),
        series("EN 10056-1 (ungleichschenklig)", { "30x20": [3], "40x20": [3], "50x30": [5], "60x30": [5], "60x40": [5], "80x40": [6], "100x50": [8] }),
      ],
      u: [series("EN 10162 (gekantet)", { "30x15": [2], "40x20": [2, 3], "50x25": [3], "60x30": [3], "80x40": [4], "100x50": [5] })],
      t: [bars("EN 10055", ["30", "35", "40", "50", "60"])],
    },
  },
  aluminium: {
    label: "Aluminium (EN AW-6060, AlMg3)",
    // Strangpressprofile sind fast scharfkantig: Außenradius ≈ 0,5 · t, höchstens 1 mm
    radius: (t) => Math.min(1, t / 2),
    kinds: {
      rohr: [
        series("EN 755-8 / EN 754-7", {
          10: [1], 12: [1], 15: [1], 16: [1, 2], 18: [1], 20: [1, 1.5, 2], 22: [1, 2], 25: [1.5, 2], 30: [1.5, 2, 3], 32: [2], 35: [2],
          40: [2, 3, 4], 45: [2], 50: [2, 3, 5], 60: [2, 3, 5], 70: [3], 80: [2, 3, 5], 100: [3, 5], 120: [5],
        }),
      ],
      vierkant: [
        series("EN 755-8", {
          10: [1], 15: [1, 1.5], 20: [1.5, 2], 25: [1.5, 2], 30: [2, 3], 35: [2], 40: [2, 3, 4], 50: [2, 3, 4, 5], 60: [2, 3, 4], 70: [3],
          80: [3, 4], 100: [3, 4, 5],
        }),
      ],
      rechteck: [
        series("EN 755-8", {
          "20x10": [1.5], "30x15": [1.5], "30x20": [2], "40x10": [2], "40x20": [2], "40x30": [2], "50x20": [2], "50x25": [2], "50x30": [2, 3],
          "60x20": [2], "60x30": [2, 3], "60x40": [2, 3], "80x20": [2], "80x40": [2, 3, 4], "100x20": [2], "100x40": [3], "100x50": [3, 4],
          "120x40": [3], "120x60": [4], "150x50": [4],
        }),
      ],
      flach: [widths("EN 755-5", [10, 12, 15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 100, 120, 150, 200], [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30])],
      rund: [bars("EN 755-3", [5, 6, 8, 10, 12, 14, 15, 16, 18, 20, 22, 25, 28, 30, 32, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100, 110, 120, 130, 140, 150])],
      vierkantvoll: [bars("EN 755-4", [6, 8, 10, 12, 15, 16, 20, 25, 30, 35, 40, 50, 60, 70, 80, 100])],
      winkel: [
        series("EN 755-9 (gleichschenklig)", {
          "15x15": [2], "20x20": [2, 3], "25x25": [2, 3], "30x30": [2, 3], "35x35": [3], "40x40": [2, 3, 4], "50x50": [3, 4, 5], "60x60": [4, 5, 6],
          "80x80": [5], "100x100": [5, 10],
        }),
        series("EN 755-9 (ungleichschenklig)", {
          "20x10": [2], "30x20": [2, 3], "40x20": [2, 3], "40x30": [3], "50x20": [3], "50x30": [3, 4], "60x30": [3], "60x40": [4], "80x40": [4], "100x50": [5],
        }),
      ],
      u: [
        series("EN 755-9", {
          "20x20": [2], "25x25": [2], "30x15": [2], "30x20": [2], "30x30": [2, 3], "40x20": [2, 3], "40x40": [3], "50x30": [3], "60x30": [3],
          "60x40": [4], "80x40": [4], "100x40": [4], "100x50": [5],
        }),
      ],
    },
  },
};

// Profilarten mit Wandstärke (zweiter Auswahlschritt); die Übrigen haben nur eine Abmessung
const WALL_KINDS = ["rohr", "vierkant", "rechteck", "flach", "winkel", "u"];
export const hasWall = (kind) => WALL_KINDS.includes(kind);

// Werkstoffgruppe der eingebauten Werkstoffe; eigene Werkstoffe nach der Dichte
const GROUP_OF = { S235: "stahl", S355: "stahl", "1.4301": "edelstahl", "1.4571": "edelstahl", AlMg3: "aluminium", AlMgSi: "aluminium" };
/** Werkstoffgruppe zu einem Werkstoff { key, density } oder null (keine Normliste: alle Gruppen) */
export function groupOfMaterial(mat) {
  if (!mat) return null;
  if (GROUP_OF[mat.key]) return GROUP_OF[mat.key];
  const d = Number(mat.density);
  if (d >= 7.7 && d < 7.88) return "stahl";
  if (d >= 7.88 && d <= 8.1) return "edelstahl";
  if (d >= 2.5 && d <= 2.9) return "aluminium";
  return null;
}

const fmt = (x) => String(x).replace(".", ",");
const num = (x) => Number(x);
export const bySize = (a, b) => {
  const na = String(a).split("x").map(Number), nb = String(b).split("x").map(Number);
  for (let i = 0; i < Math.max(na.length, nb.length); i++) if ((na[i] ?? 0) !== (nb[i] ?? 0)) return (na[i] ?? 0) - (nb[i] ?? 0);
  return 0;
};

/** Maße (Text wie in den Feldern) für Abmessung + Wandstärke einer Gruppe */
/** Außenradius eines Hohlprofils mit Wandstärke t in der Werkstoffgruppe (unbekannte Gruppe: wie Baustahl) */
export const radiusFor = (group, t) => Math.round((LIB_GROUPS[group] || LIB_GROUPS.stahl).radius(t) * 10) / 10;

function dimsFor(group, kind, main, wall) {
  const t = num(wall), r = (v) => String(radiusFor(group, v));
  const [a, b] = String(main).split("x");
  switch (kind) {
    case "rohr": return { D: a, t: String(wall) };
    case "vierkant": return { B: a, t: String(wall), r: r(t) };
    case "rechteck": return { B: a, H: b, t: String(wall), r: r(t) };
    case "flach": return { B: a, t: String(wall) };
    case "winkel": case "u": return { B: a, H: b, t: String(wall) };
  }
  return catalogToDims(kind, main);
}

// Einträge ohne Maße – sections.js baut daraus beim Laden den Katalog, bevor catalogToDims bereitsteht.
// Ohne Gruppe (Werkstoff ohne Normliste): alle Gruppen, jede Größe einmal.
function rawEntries(group, kind) {
  if (!group) {
    const seen = new Set();
    return Object.keys(LIB_GROUPS).flatMap((g) => rawEntries(g, kind)).filter((e) => !seen.has(e.size) && seen.add(e.size))
      .sort((x, y) => bySize(x.main, y.main) || num(x.wall) - num(y.wall));
  }
  const out = [];
  for (const s of LIB_GROUPS[group]?.kinds[kind] || []) {
    if (s.list) for (const m of s.list) out.push({ group, kind, main: m, wall: null, size: m, norm: s.norm });
    else for (const [m, walls] of Object.entries(s.map)) for (const w of walls) out.push({ group, kind, main: m, wall: String(w), size: `${m}x${w}`, norm: s.norm });
  }
  return out.sort((x, y) => bySize(x.main, y.main) || num(x.wall) - num(y.wall));
}

/**
 * Alle Einträge einer Gruppe und Profilart, sortiert nach Abmessung und Wandstärke:
 * { group, kind, main, wall, size, dims, norm }. size ist die Katalog-Schreibweise ("60x40x3", "42.4x2.6", "200").
 */
export function libraryEntries(group, kind) {
  return rawEntries(group, kind).map((e) => ({ ...e, dims: dimsFor(e.group, kind, e.main, e.wall) }));
}

/** Profilarten, die die Gruppe führt (Reihenfolge der erlaubten kinds); ohne Gruppe alle erlaubten */
export function groupKinds(group, kinds) {
  if (!group) return kinds;
  return kinds.filter((k) => LIB_GROUPS[group].kinds[k]);
}

/** Abmessungen (Schritt 2) als [main, Beschriftung] */
export function mainSizes(group, kind) {
  const seen = new Set(), out = [];
  for (const e of libraryEntries(group, kind)) if (!seen.has(e.main)) { seen.add(e.main); out.push([e.main, mainLabel(kind, e.main)]); }
  return out;
}
/** Wandstärken (Schritt 3) zu einer Abmessung als [wall, Beschriftung] */
export function wallsFor(group, kind, main) {
  return libraryEntries(group, kind).filter((e) => e.main === main).map((e) => [e.wall, fmt(e.wall) + " mm"]);
}

export function mainLabel(kind, main) {
  const m = String(main).split("x").map(fmt);
  switch (kind) {
    case "rohr": case "rund": return `Ø ${m[0]} mm`;
    case "vierkant": case "vierkantvoll": return `${m[0]} × ${m[0]} mm`;
    case "flach": return `${m[0]} mm breit`;
    case "rechteck": case "winkel": case "u": return `${m[0]} × ${m[1]} mm`;
  }
  return `${{ ipe: "IPE", hea: "HEA", heb: "HEB", upn: "UPN", t: "T" }[kind] || ""} ${m[0]}`.trim();
}
export const wallLabel = (kind) => (kind === "flach" ? "Dicke" : kind === "winkel" || kind === "u" ? "Schenkeldicke" : "Wandstärke");

/** Abmessung (main) aus den Zahlenmaßen eines Querschnitts, oder null */
export function mainOfDims(kind, d) {
  const n = (k) => (Number.isFinite(d?.[k]) ? String(Math.round(d[k] * 1000) / 1000) : null);
  switch (kind) {
    case "rohr": case "rund": return n("D");
    case "vierkant": case "vierkantvoll": return n("B");
    case "flach": return n("B");
    case "rechteck": case "winkel": case "u": return n("B") && n("H") ? `${n("B")}x${n("H")}` : null;
  }
  return null;
}

/** Bibliothekseintrag mit diesen Maßen (Zahlen) in der Gruppe; Radius zählt nicht mit */
export function findEntry(group, kind, d) {
  return libraryEntries(group, kind).find((e) => Object.entries(e.dims).every(([k, v]) => k === "r" || Math.abs(Number(v) - Number(d?.[k])) < 1e-6)) || null;
}

/**
 * Eintrag für eine neu gewählte Abmessung: gleiche Wandstärke wie bisher, sonst die nächstliegende.
 */
export function pickEntry(group, kind, main, wantWall) {
  const list = libraryEntries(group, kind).filter((e) => e.main === main);
  if (!list.length) return null;
  if (!hasWall(kind) || !Number.isFinite(Number(wantWall))) return list[Math.floor((list.length - 1) / 2)];
  return list.reduce((best, e) => (Math.abs(num(e.wall) - wantWall) < Math.abs(num(best.wall) - wantWall) ? e : best));
}

/** Vorschlag beim Wechsel der Profilart: mittlere Abmessung der Gruppe */
export function defaultEntry(group, kind) {
  const mains = mainSizes(group, kind);
  if (!mains.length) return null;
  return pickEntry(group, kind, mains[Math.floor(mains.length / 2)][0]);
}

/** Katalog-Größe ("60x40x3", "42.4x2.6", "200") → { main, wall } */
export function splitSize(kind, size) {
  const s = String(size ?? "");
  if (!hasWall(kind)) return { main: s, wall: null };
  const i = s.lastIndexOf("x");
  return i < 0 ? { main: s, wall: null } : { main: s.slice(0, i), wall: s.slice(i + 1) };
}

/** Alle Größen über alle Gruppen in Katalog-Schreibweise, sortiert (für Generatoren und Schnelleingabe) */
export function allSizes(kind) {
  const s = new Set();
  for (const g of Object.keys(LIB_GROUPS)) for (const e of rawEntries(g, kind)) s.add(e.size);
  return [...s].sort(bySize);
}
