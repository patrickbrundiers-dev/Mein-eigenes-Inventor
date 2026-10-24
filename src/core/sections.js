// Profil-Querschnitte (Rohre, Hohlprofile, Flach-/Rundstahl, Winkel, U) und Normgrößen-Katalog

export const SECTION_KINDS = {
  rohr: { label: "Rundrohr", fields: ["D", "t"] },
  vierkant: { label: "Quadratrohr", fields: ["B", "t", "r"] },
  rechteck: { label: "Rechteckrohr", fields: ["B", "H", "t", "r"] },
  flach: { label: "Flachstahl", fields: ["B", "t"] },
  rund: { label: "Rundstahl", fields: ["D"] },
  vierkantvoll: { label: "Vierkantstahl", fields: ["B"] },
  winkel: { label: "Winkel (L)", fields: ["B", "H", "t"] },
  u: { label: "U-Profil", fields: ["B", "H", "t"] },
};

export const FIELD_LABELS = { D: "Außen-Ø D", t: "Wandstärke t", B: "Breite B", H: "Höhe H", r: "Außenradius r" };

// Normgrößen (Auswahl, gängige Lagerware)
export const CATALOG = {
  rohr: ["20x2", "21.3x2", "25x2", "26.9x2.3", "30x2", "33.7x2.6", "40x2", "42.4x2.6", "48.3x2.6", "48.3x3.2", "50x3", "60.3x2.9", "60.3x3.6", "76.1x2.9", "76.1x3.2", "88.9x3.2", "101.6x3.6", "114.3x3.6"],
  vierkant: ["15x1.5", "20x2", "25x2", "30x2", "30x3", "35x3", "40x2", "40x3", "40x4", "50x3", "50x4", "60x3", "60x4", "70x4", "80x4", "80x5", "100x4", "100x5", "120x5"],
  rechteck: ["30x20x2", "40x20x2", "40x30x3", "50x25x2.5", "50x30x3", "60x30x3", "60x40x3", "60x40x4", "80x40x3", "80x40x4", "100x40x4", "100x50x4", "100x60x4", "120x60x5", "120x80x5", "140x80x5", "160x80x5"],
  flach: ["20x3", "20x5", "25x5", "30x5", "30x8", "40x5", "40x8", "40x10", "50x5", "50x8", "50x10", "60x10", "80x10", "100x10"],
  rund: ["6", "8", "10", "12", "14", "16", "20", "25", "30", "40", "50"],
  vierkantvoll: ["10", "12", "16", "20", "25", "30"],
  winkel: ["20x20x3", "25x25x3", "30x30x3", "35x35x4", "40x40x4", "45x45x5", "50x50x5", "60x60x6", "70x70x7", "80x80x8", "60x40x5", "80x40x6", "100x50x6"],
  u: ["30x15x2", "40x20x2", "40x20x3", "50x25x3", "60x30x3", "80x40x4", "100x50x5"],
};

/** "40x20x2" -> Feldwerte für die Profilart */
export function catalogToDims(kind, s) {
  const n = String(s).split("x").map((x) => x.trim());
  switch (kind) {
    case "rohr": return { D: n[0], t: n[1] };
    case "vierkant": return { B: n[0], t: n[1], r: String(roundR(Number(n[1]))) };
    case "rechteck": return { B: n[0], H: n[1], t: n[2], r: String(roundR(Number(n[2]))) };
    case "flach": return { B: n[0], t: n[1] };
    case "rund": return { D: n[0] };
    case "vierkantvoll": return { B: n[0] };
    case "winkel": return { B: n[0], H: n[1], t: n[2] };
    case "u": return { B: n[0], H: n[1], t: n[2] };
  }
  return {};
}
const roundR = (t) => Math.round(2 * t * 10) / 10; // EN 10219: r_außen ≈ 2·t

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
  return kind;
}

// ---------- Konturen ----------
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

/**
 * Querschnitt in lokalen Koordinaten (u = Breite, v = Höhe), zentriert auf die Hüllbox.
 * Rückgabe {outer, holes, area, width, height}
 */
export function sectionGeometry(kind, d) {
  const need = (k) => {
    const v = d[k];
    if (!Number.isFinite(v) || v <= 0) throw new Error(`${FIELD_LABELS[k] || k} muss > 0 sein`);
    return v;
  };
  switch (kind) {
    case "rohr": {
      const D = need("D"), t = need("t");
      if (2 * t >= D) throw new Error("Wandstärke zu groß");
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
      if (2 * t >= Math.min(B, H)) throw new Error("Wandstärke zu groß");
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
      if (t >= Math.min(B, H)) throw new Error("Wandstärke zu groß");
      const x0 = -B / 2, y0 = -H / 2;
      const pts = [[x0, y0], [x0 + B, y0], [x0 + B, y0 + t], [x0 + t, y0 + t], [x0 + t, y0 + H], [x0, y0 + H]];
      return { outer: polyLoop(pts), holes: [], area: B * t + (H - t) * t, width: B, height: H };
    }
    case "u": {
      const B = need("B"), H = need("H"), t = need("t");
      if (2 * t >= B || t >= H) throw new Error("Wandstärke zu groß");
      const x0 = -B / 2, y0 = -H / 2;
      const pts = [[x0, y0], [x0 + B, y0], [x0 + B, y0 + H], [x0 + B - t, y0 + H], [x0 + B - t, y0 + t], [x0 + t, y0 + t], [x0 + t, y0 + H], [x0, y0 + H]];
      return { outer: polyLoop(pts), holes: [], area: B * t + 2 * (H - t) * t, width: B, height: H };
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

// Metrische Regelgewinde: Kernlochbohrung
export const THREADS = {
  M3: 2.5, M4: 3.3, M5: 4.2, M6: 5.0, M8: 6.8, M10: 8.5, M12: 10.2, M14: 12.0, M16: 14.0, M20: 17.5, M24: 21.0,
};
// Durchgangsbohrungen mittel (ISO 273)
export const CLEARANCE = { M3: 3.4, M4: 4.5, M5: 5.5, M6: 6.6, M8: 9, M10: 11, M12: 13.5, M14: 15.5, M16: 17.5, M20: 22, M24: 26 };
