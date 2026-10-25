// Profil-Querschnitte (Rohre, Hohlprofile, Flach-/Rundstahl, Winkel, U) und Normgrößen-Katalog

import { allSizes, bySize, radiusFor } from "./profillib.js";

export const SECTION_KINDS = {
  rohr: { label: "Rundrohr", fields: ["D", "t"] },
  vierkant: { label: "Quadratrohr", fields: ["B", "t", "r"] },
  rechteck: { label: "Rechteckrohr", fields: ["B", "H", "t", "r"] },
  flach: { label: "Flachstahl", fields: ["B", "t"] },
  rund: { label: "Rundstahl", fields: ["D"] },
  vierkantvoll: { label: "Vierkantstahl", fields: ["B"] },
  winkel: { label: "Winkel (L)", fields: ["B", "H", "t"] },
  u: { label: "U-Profil", fields: ["B", "H", "t"] },
  ipe: { label: "IPE (I-Träger)", fields: ["H", "B", "s", "t", "r"], steel: true },
  hea: { label: "HEA (Breitflansch)", fields: ["H", "B", "s", "t", "r"], steel: true },
  heb: { label: "HEB (Breitflansch)", fields: ["H", "B", "s", "t", "r"], steel: true },
  upn: { label: "UPN (U-Stahl)", fields: ["H", "B", "s", "t", "r"], steel: true },
  t: { label: "T-Stahl (gleichschenklig)", fields: ["B", "H", "t", "r"], steel: true },
};

export const FIELD_LABELS = { D: "Außen-Ø D", t: "Wandstärke t", B: "Breite B", H: "Höhe H", r: "Außenradius r", s: "Stegdicke s" };
const STEEL_LABELS = { t: "Flanschdicke t", r: "Ausrundung r" };
/** Feldbezeichnung je Profilart (Stahlprofile: Flanschdicke, Ausrundung) */
export const fieldLabel = (kind, k) => (SECTION_KINDS[kind]?.steel && STEEL_LABELS[k]) || FIELD_LABELS[k] || k;

// Warmgewalzte Stahlprofile (Maße nach DIN 1025 / EN 10365, EN 10055): Größe → [H, B, s, t, r] bzw. T: [B, H, t, r]
// Vereinfacht: UPN mit parallelen Flanschen (mittlere Dicke t statt 8 % Neigung), T ohne Kantenrundungen –
// Fläche und Metergewicht weichen dort um 1–3 % von der Tabelle ab.
export const STEEL_TABLES = {
  ipe: { 80: [80, 46, 3.8, 5.2, 5], 100: [100, 55, 4.1, 5.7, 7], 120: [120, 64, 4.4, 6.3, 7], 140: [140, 73, 4.7, 6.9, 7], 160: [160, 82, 5, 7.4, 9], 180: [180, 91, 5.3, 8, 9], 200: [200, 100, 5.6, 8.5, 12], 220: [220, 110, 5.9, 9.2, 12], 240: [240, 120, 6.2, 9.8, 15], 270: [270, 135, 6.6, 10.2, 15], 300: [300, 150, 7.1, 10.7, 15], 330: [330, 160, 7.5, 11.5, 18], 360: [360, 170, 8, 12.7, 18], 400: [400, 180, 8.6, 13.5, 21], 450: [450, 190, 9.4, 14.6, 21], 500: [500, 200, 10.2, 16, 21], 550: [550, 210, 11.1, 17.2, 24], 600: [600, 220, 12, 19, 24] },
  hea: { 100: [96, 100, 5, 8, 12], 120: [114, 120, 5, 8, 12], 140: [133, 140, 5.5, 8.5, 12], 160: [152, 160, 6, 9, 15], 180: [171, 180, 6, 9.5, 15], 200: [190, 200, 6.5, 10, 18], 220: [210, 220, 7, 11, 18], 240: [230, 240, 7.5, 12, 21], 260: [250, 260, 7.5, 12.5, 24], 280: [270, 280, 8, 13, 24], 300: [290, 300, 8.5, 14, 27], 320: [310, 300, 9, 15.5, 27], 340: [330, 300, 9.5, 16.5, 27], 360: [350, 300, 10, 17.5, 27], 400: [390, 300, 11, 19, 27], 450: [440, 300, 11.5, 21, 27], 500: [490, 300, 12, 23, 27] },
  heb: { 100: [100, 100, 6, 10, 12], 120: [120, 120, 6.5, 11, 12], 140: [140, 140, 7, 12, 12], 160: [160, 160, 8, 13, 15], 180: [180, 180, 8.5, 14, 15], 200: [200, 200, 9, 15, 18], 220: [220, 220, 9.5, 16, 18], 240: [240, 240, 10, 17, 21], 260: [260, 260, 10, 17.5, 24], 280: [280, 280, 10.5, 18, 24], 300: [300, 300, 11, 19, 27], 320: [320, 300, 11.5, 20.5, 27], 340: [340, 300, 12, 21.5, 27], 360: [360, 300, 12.5, 22.5, 27], 400: [400, 300, 13.5, 24, 27], 450: [450, 300, 14, 26, 27], 500: [500, 300, 14.5, 28, 27] },
  upn: { 50: [50, 38, 5, 7, 7], 65: [65, 42, 5.5, 7.5, 7.5], 80: [80, 45, 6, 8, 8], 100: [100, 50, 6, 8.5, 8.5], 120: [120, 55, 7, 9, 9], 140: [140, 60, 7, 10, 10], 160: [160, 65, 7.5, 10.5, 10.5], 180: [180, 70, 8, 11, 11], 200: [200, 75, 8.5, 11.5, 11.5], 220: [220, 80, 9, 12.5, 12.5], 240: [240, 85, 9.5, 13, 13], 260: [260, 90, 10, 14, 14], 280: [280, 95, 10, 15, 15], 300: [300, 100, 10, 16, 16], 320: [320, 100, 14, 17.5, 17.5], 350: [350, 100, 14, 16, 16], 400: [400, 110, 14, 18, 18] },
  t: { 30: [30, 30, 4, 4], 35: [35, 35, 4.5, 4.5], 40: [40, 40, 5, 5], 50: [50, 50, 6, 6], 60: [60, 60, 7, 7], 70: [70, 70, 8, 8], 80: [80, 80, 9, 9], 100: [100, 100, 11, 11] },
};
const STEEL_PREFIX = { ipe: "IPE", hea: "HEA", heb: "HEB", upn: "UPN", t: "T" };
const steelDims = (kind, row) => (kind === "t" ? { B: row[0], H: row[1], t: row[2], r: row[3] } : { H: row[0], B: row[1], s: row[2], t: row[3], r: row[4] });
/** Normgröße eines Stahlprofils zu den Maßen (oder null bei eigenen Maßen) */
export function steelSize(kind, d) {
  for (const [size, row] of Object.entries(STEEL_TABLES[kind] || {})) {
    const n = steelDims(kind, row);
    if (Object.keys(n).every((k) => Math.abs(Number(d[k]) - n[k]) < 1e-6)) return size;
  }
  return null;
}

// Normgrößen (Auswahl, gängige Lagerware) – ergänzt um die Profilbibliothek aller Werkstoffgruppen (profillib.js)
const BASE_CATALOG = {
  rohr: ["20x2", "21.3x2", "25x2", "26.9x2.3", "30x2", "33.7x2.6", "40x2", "42.4x2.6", "48.3x2.6", "48.3x3.2", "50x3", "60.3x2.9", "60.3x3.6", "76.1x2.9", "76.1x3.2", "88.9x3.2", "101.6x3.6", "114.3x3.6"],
  vierkant: ["15x1.5", "20x2", "25x2", "30x2", "30x3", "35x3", "40x2", "40x3", "40x4", "50x3", "50x4", "60x3", "60x4", "70x4", "80x4", "80x5", "100x4", "100x5", "120x5"],
  rechteck: ["30x20x2", "40x20x2", "40x30x3", "50x25x2.5", "50x30x3", "60x30x3", "60x40x3", "60x40x4", "80x40x3", "80x40x4", "100x40x4", "100x50x4", "100x60x4", "120x60x5", "120x80x5", "140x80x5", "160x80x5"],
  flach: ["20x3", "20x5", "25x5", "30x5", "30x8", "40x5", "40x8", "40x10", "50x5", "50x8", "50x10", "60x10", "80x10", "100x10"],
  rund: ["6", "8", "10", "12", "14", "16", "20", "25", "30", "40", "50"],
  vierkantvoll: ["10", "12", "16", "20", "25", "30"],
  winkel: ["20x20x3", "25x25x3", "30x30x3", "35x35x4", "40x40x4", "45x45x5", "50x50x5", "60x60x6", "70x70x7", "80x80x8", "60x40x5", "80x40x6", "100x50x6"],
  u: ["30x15x2", "40x20x2", "40x20x3", "50x25x3", "60x30x3", "80x40x4", "100x50x5"],
};
// Erst beim ersten Zugriff zusammenstellen: profillib.js liest seinerseits STEEL_TABLES und catalogToDims
export const CATALOG = {};
for (const kind of Object.keys(SECTION_KINDS)) {
  let list = null;
  Object.defineProperty(CATALOG, kind, { enumerable: true, get: () => (list ||= [...new Set([...(BASE_CATALOG[kind] || []), ...allSizes(kind)])].sort(bySize)) });
}

/** "40x20x2" -> Feldwerte für die Profilart; group (profillib: stahl, edelstahl, aluminium) wählt den Kantenradius */
export function catalogToDims(kind, s, group = null) {
  const n = String(s).split("x").map((x) => x.trim());
  const rr = (t) => String(group ? radiusFor(group, Number(t)) : roundR(Number(t)));
  switch (kind) {
    case "rohr": return { D: n[0], t: n[1] };
    case "vierkant": return { B: n[0], t: n[1], r: rr(n[1]) };
    case "rechteck": return { B: n[0], H: n[1], t: n[2], r: rr(n[2]) };
    case "flach": return { B: n[0], t: n[1] };
    case "rund": return { D: n[0] };
    case "vierkantvoll": return { B: n[0] };
    case "winkel": return { B: n[0], H: n[1], t: n[2] };
    case "u": return { B: n[0], H: n[1], t: n[2] };
  }
  const row = STEEL_TABLES[kind]?.[n[0]];
  if (row) return Object.fromEntries(Object.entries(steelDims(kind, row)).map(([k, v]) => [k, String(v)]));
  return {};
}
// EN 10219-2: r_außen ≈ 2·t bis t = 6, 2,5·t bis t = 10, darüber 3·t
const roundR = (t) => Math.round((t <= 6 ? 2 : t <= 10 ? 2.5 : 3) * t * 10) / 10;

export function sectionName(kind, d) {
  const f = (x) => String(Math.round(x * 100) / 100).replace(".", ",");
  switch (kind) {
    case "rohr": return `Rohr ${f(d.D)}x${f(d.t)}`;
    case "vierkant": return `Quadratrohr ${f(d.B)}x${f(d.B)}x${f(d.t)}`;
    case "rechteck": return `Rechteckrohr ${f(d.B)}x${f(d.H)}x${f(d.t)}`;
    case "flach": return `Flach ${f(d.B)}x${f(d.t)}`;
    case "rund": return `Rund Ø${f(d.D)}`;
    case "vierkantvoll": return `Vierkant ${f(d.B)}`;
    case "winkel": return `L ${f(d.B)}x${f(d.H)}x${f(d.t)}`;
    case "u": return `U ${f(d.B)}x${f(d.H)}x${f(d.t)}`;
  }
  if (STEEL_PREFIX[kind]) return steelId(kind, d);
  return kind;
}

/**
 * Profil-ID im Format der Rohrlaser-Kalkulation (step_geometrie.profil_id_vorschlag):
 * "RR 42,4x2", "QR 40x40x3", "RE 60x40x3", "FL 40x8", "RD 20", "VK 20", "L 40x40x4", "U 50x25x3"
 */
export function profileId(kind, d) {
  const f = (x) => (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, "").replace(".", ",");
  switch (kind) {
    case "rohr": return `RR ${f(d.D)}x${f(d.t)}`;
    case "vierkant": return `QR ${f(d.B)}x${f(d.B)}x${f(d.t)}`;
    case "rechteck": return `RE ${f(Math.max(d.B, d.H))}x${f(Math.min(d.B, d.H))}x${f(d.t)}`;
    case "flach": return `FL ${f(Math.max(d.B, d.t))}x${f(Math.min(d.B, d.t))}`;
    case "rund": return `RD ${f(d.D)}`;
    case "vierkantvoll": return `VK ${f(d.B)}`;
    case "winkel": return `L ${f(d.B)}x${f(d.H)}x${f(d.t)}`;
    case "u": return `U ${f(d.B)}x${f(d.H)}x${f(d.t)}`;
  }
  if (STEEL_PREFIX[kind]) return steelId(kind, d);
  return "";
}

/** "IPE 200", eigene Maße: "IPE 210x100x5,6x8,5" (H×B×s×t) bzw. "T 45x45x5" */
function steelId(kind, d) {
  const size = steelSize(kind, d);
  if (size) return `${STEEL_PREFIX[kind]} ${size}`;
  const f = (x) => String(Math.round(Number(x) * 10) / 10).replace(".", ",");
  return kind === "t" ? `T ${f(d.B)}x${f(d.H)}x${f(d.t)}` : `${STEEL_PREFIX[kind]} ${f(d.H)}x${f(d.B)}x${f(d.s)}x${f(d.t)}`;
}

// ---------- Konturen ----------
// Pfad aus Punkten und konkaven Ausrundungen: Eintrag [x, y] = Linie dorthin, {to, c} = Viertelbogen um c nach to
function pathLoop(items) {
  const segs = [];
  const start = items[0];
  for (const it of items.slice(1).concat([start])) {
    if (Array.isArray(it)) segs.push({ t: "line", to: it });
    else {
      const prev = segs.length ? segs[segs.length - 1].to : start;
      const a0 = Math.atan2(prev[1] - it.c[1], prev[0] - it.c[0]), a1 = Math.atan2(it.to[1] - it.c[1], it.to[0] - it.c[0]);
      let da = a1 - a0;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      const r = Math.hypot(prev[0] - it.c[0], prev[1] - it.c[1]), am = a0 + da / 2;
      segs.push({ t: "arc", to: it.to, mid: [it.c[0] + r * Math.cos(am), it.c[1] + r * Math.sin(am)] });
    }
  }
  return { kind: "path", start, segs };
}
function roundedRectLoop(w, h, r, cx = 0, cy = 0) {
  r = Math.max(0, Math.min(r, w / 2 - 1e-6, h / 2 - 1e-6));
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  if (r < 1e-6) {
    return { kind: "path", start: [x0, y0], segs: [{ t: "line", to: [x1, y0] }, { t: "line", to: [x1, y1] }, { t: "line", to: [x0, y1] }, { t: "line", to: [x0, y0] }] };
  }
  const k = r * (1 - Math.SQRT1_2);
  return {
    kind: "path",
    start: [x0 + r, y0],
    segs: [
      { t: "line", to: [x1 - r, y0] },
      { t: "arc", to: [x1, y0 + r], mid: [x1 - k, y0 + k] },
      { t: "line", to: [x1, y1 - r] },
      { t: "arc", to: [x1 - r, y1], mid: [x1 - k, y1 - k] },
      { t: "line", to: [x0 + r, y1] },
      { t: "arc", to: [x0, y1 - r], mid: [x0 + k, y1 - k] },
      { t: "line", to: [x0, y0 + r] },
      { t: "arc", to: [x0 + r, y0], mid: [x0 + k, y0 + k] },
    ],
  };
}
function polyLoop(pts) {
  return { kind: "path", start: pts[0], segs: pts.slice(1).concat([pts[0]]).map((p) => ({ t: "line", to: p })) };
}

/** Umfang einer Kontur (Kreis oder Pfad aus Linien und Bögen über 3 Punkte) in mm */
export function loopLength(loop) {
  if (loop.kind === "circle") return 2 * Math.PI * loop.r;
  let cur = loop.start, L = 0;
  for (const sg of loop.segs) {
    if (sg.t === "arc" && sg.mid) {
      const [ax, ay] = cur, [bx, by] = sg.mid, [cx, cy] = sg.to;
      const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
      if (Math.abs(d) < 1e-12) L += Math.hypot(cx - ax, cy - ay);
      else {
        const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
        const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
        const r = Math.hypot(ax - ux, ay - uy);
        const ang = (p) => Math.atan2(p[1] - uy, p[0] - ux);
        const norm = (x) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const a1 = norm(ang(sg.mid) - ang(cur)), a2 = norm(ang(sg.to) - ang(cur));
        const sweep = a1 <= a2 ? a2 : 2 * Math.PI - a2; // Richtung über den Mittelpunkt
        L += r * sweep;
      }
    } else L += Math.hypot(sg.to[0] - cur[0], sg.to[1] - cur[1]);
    cur = sg.to;
  }
  return L;
}

/**
 * Querschnitt in lokalen Koordinaten (u = Breite, v = Höhe), zentriert auf die Hüllbox.
 * Rückgabe {outer, holes, area, width, height}
 */
export function sectionGeometry(kind, d) {
  const need = (k) => {
    const v = d[k];
    if (!Number.isFinite(v) || v <= 0) throw new Error(`${fieldLabel(kind, k)} muss > 0 sein`);
    return v;
  };
  const fmtMm = (x) => String(Math.round(x * 100) / 100).replace(".", ",");
  const tooThick = (max) => new Error(`Wandstärke zu groß: muss kleiner als ${fmtMm(max)} mm sein`);
  switch (kind) {
    case "rohr": {
      const D = need("D"), t = need("t");
      if (2 * t >= D) throw tooThick(D / 2);
      return { outer: { kind: "circle", c: [0, 0], r: D / 2 }, holes: [{ kind: "circle", c: [0, 0], r: D / 2 - t }], area: (Math.PI / 4) * (D * D - (D - 2 * t) ** 2), width: D, height: D };
    }
    case "rund": {
      const D = need("D");
      return { outer: { kind: "circle", c: [0, 0], r: D / 2 }, holes: [], area: (Math.PI / 4) * D * D, width: D, height: D };
    }
    case "vierkant":
    case "rechteck": {
      const B = need("B"), H = kind === "vierkant" ? B : need("H"), t = need("t");
      const r = Number.isFinite(d.r) ? Math.max(0, d.r) : 2 * t;
      if (2 * t >= Math.min(B, H)) throw tooThick(Math.min(B, H) / 2);
      const ri = Math.max(0, r - t);
      const area = B * H - (4 - Math.PI) * r * r - ((B - 2 * t) * (H - 2 * t) - (4 - Math.PI) * ri * ri);
      return { outer: roundedRectLoop(B, H, r), holes: [roundedRectLoop(B - 2 * t, H - 2 * t, ri)], area, width: B, height: H };
    }
    case "flach": {
      const B = need("B"), t = need("t");
      return { outer: roundedRectLoop(B, t, 0), holes: [], area: B * t, width: B, height: t };
    }
    case "vierkantvoll": {
      const B = need("B");
      return { outer: roundedRectLoop(B, B, 0), holes: [], area: B * B, width: B, height: B };
    }
    case "winkel": {
      const B = need("B"), H = need("H"), t = need("t");
      if (t >= Math.min(B, H)) throw tooThick(Math.min(B, H));
      const x0 = -B / 2, y0 = -H / 2;
      const pts = [[x0, y0], [x0 + B, y0], [x0 + B, y0 + t], [x0 + t, y0 + t], [x0 + t, y0 + H], [x0, y0 + H]];
      return { outer: polyLoop(pts), holes: [], area: B * t + (H - t) * t, width: B, height: H };
    }
    case "u": {
      const B = need("B"), H = need("H"), t = need("t");
      if (2 * t >= B || t >= H) throw tooThick(Math.min(B / 2, H));
      const x0 = -B / 2, y0 = -H / 2;
      const pts = [[x0, y0], [x0 + B, y0], [x0 + B, y0 + H], [x0 + B - t, y0 + H], [x0 + B - t, y0 + t], [x0 + t, y0 + t], [x0 + t, y0 + H], [x0, y0 + H]];
      return { outer: polyLoop(pts), holes: [], area: B * t + 2 * (H - t) * t, width: B, height: H };
    }
    case "ipe":
    case "hea":
    case "heb": {
      const H = need("H"), B = need("B"), s = need("s"), t = need("t"), r = Math.max(0, d.r || 0);
      if (2 * t + 2 * r >= H || s + 2 * r >= B) throw new Error("Flansch, Steg und Ausrundung passen nicht in H × B");
      const x = B / 2, y = H / 2, w = s / 2;
      const outer = pathLoop([
        [-x, -y], [x, -y], [x, -y + t], [w + r, -y + t], { to: [w, -y + t + r], c: [w + r, -y + t + r] },
        [w, y - t - r], { to: [w + r, y - t], c: [w + r, y - t - r] }, [x, y - t], [x, y], [-x, y], [-x, y - t],
        [-w - r, y - t], { to: [-w, y - t - r], c: [-w - r, y - t - r] }, [-w, -y + t + r], { to: [-w - r, -y + t], c: [-w - r, -y + t + r] }, [-x, -y + t],
      ]);
      return { outer, holes: [], area: 2 * B * t + (H - 2 * t) * s + (4 - Math.PI) * r * r, width: B, height: H };
    }
    case "upn": {
      const H = need("H"), B = need("B"), s = need("s"), t = need("t"), r = Math.max(0, d.r || 0);
      if (2 * t + 2 * r >= H || s + r >= B) throw new Error("Flansch, Steg und Ausrundung passen nicht in H × B");
      const x = B / 2, y = H / 2, w = -x + s;
      const outer = pathLoop([
        [-x, -y], [x, -y], [x, -y + t], [w + r, -y + t], { to: [w, -y + t + r], c: [w + r, -y + t + r] },
        [w, y - t - r], { to: [w + r, y - t], c: [w + r, y - t - r] }, [x, y - t], [x, y], [-x, y],
      ]);
      return { outer, holes: [], area: 2 * B * t + (H - 2 * t) * s + (2 - Math.PI / 2) * r * r, width: B, height: H };
    }
    case "t": {
      const B = need("B"), H = need("H"), t = need("t"), r = Math.max(0, d.r || 0);
      if (t + r >= H || t + 2 * r >= B) throw new Error("Dicke und Ausrundung passen nicht in B × H");
      const x = B / 2, y = H / 2, w = t / 2;
      const outer = pathLoop([
        [-w, -y], [w, -y], [w, y - t - r], { to: [w + r, y - t], c: [w + r, y - t - r] }, [x, y - t], [x, y], [-x, y], [-x, y - t],
        [-w - r, y - t], { to: [-w, y - t - r], c: [-w - r, y - t - r] },
      ]);
      return { outer, holes: [], area: B * t + (H - t) * t + (2 - Math.PI / 2) * r * r, width: B, height: H };
    }
  }
  throw new Error("Unbekannte Profilart: " + kind);
}

// ---------- Werkstoffe ----------
export const MATERIALS = {
  S235: { label: "Stahl S235JR", density: 7.85, color: "#8d99a6" },
  S355: { label: "Stahl S355J2", density: 7.85, color: "#7f8c99" },
  "1.4301": { label: "Edelstahl 1.4301", density: 7.9, color: "#c3ccd4" },
  "1.4571": { label: "Edelstahl 1.4571", density: 7.98, color: "#bcc6cf" },
  AlMg3: { label: "Aluminium AlMg3", density: 2.66, color: "#d5dde3" },
  AlMgSi: { label: "Aluminium EN AW-6060", density: 2.7, color: "#dfe5ea" },
  CuZn: { label: "Messing CuZn39Pb3", density: 8.47, color: "#c9a85a" },
  PE: { label: "Kunststoff PE", density: 0.95, color: "#e8e3d0" },
  POM: { label: "Kunststoff POM", density: 1.41, color: "#f2f0ea" },
};

/** Metergewicht in kg/m aus Querschnittsfläche (mm²) und Dichte (g/cm³) */
export function kgPerMeter(area, density) {
  return (area * density) / 1000;
}

// Metrische Regelgewinde: Kernlochbohrung
export const THREADS = {
  M3: 2.5, M4: 3.3, M5: 4.2, M6: 5.0, M8: 6.8, M10: 8.5, M12: 10.2, M14: 12.0, M16: 14.0, M20: 17.5, M24: 21.0, M27: 24.0, M30: 26.5,
};
// Durchgangsbohrungen mittel (ISO 273)
export const CLEARANCE = { M3: 3.4, M4: 4.5, M5: 5.5, M6: 6.6, M8: 9, M10: 11, M12: 13.5, M14: 15.5, M16: 17.5, M20: 22, M24: 26, M27: 30, M30: 33 };
