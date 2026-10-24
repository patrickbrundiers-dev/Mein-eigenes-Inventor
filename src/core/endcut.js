// Schnittfläche der Enden in 2D und 3D wie im Rohr-Editor der Rohrlaser-Kalkulation (schnittflaeche.py, dreid.py).
//
// 2D: Der Strahl steht überall senkrecht zur Mantelfläche. Die Innenkante liegt genau unter der Außenkante
//     (gleiche Lage auf der Rohrachse); eine Gehrung ist innen nicht eben, sondern „verdreht“.
// 3D: Der Kopf schwenkt in der Ebene aus Mantelnormale und Rohrachse so weit, dass die Schnittfläche eben durch die
//     Wand geht. Der nötige Winkel β ändert sich am Umfang. Über der Grenze der Maschine (Winkelkorrektur, Vorgabe
//     ±45°) steht der Kopf auf der Grenze: dort ist die Kontur nicht maßhaltig und wird gemeldet.
// Die Schnittlänge bleibt die der Außenkante.
//
// Rein rechnerisch: liefert Außen- und Innenpunkte der Schnittkante je Punkt des Umfangs (Profil-Koordinaten u, v
// und z längs der Achse); den Körper baut src/kernel/build.js daraus.

export const END_CUT_SECTIONS = ["rohr", "vierkant", "rechteck"];
export const SWIVEL_DEFAULT = 45;
const DEG = Math.PI / 180;

/**
 * Umfangspunkte des Querschnitts mit Außennormale und Krümmungsradius (Infinity auf ebenen Wänden).
 * Rundrohr: n Punkte am Kreis; Rechteckrohr: je Ecke ein Bogen mit seg+1 Punkten, die Wände dazwischen gerade.
 */
export function outline(kind, { W, H, r = 0 }, { n = 96, seg = 8 } = {}) {
  const pts = [];
  if (kind === "rohr") {
    const R = W / 2;
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      pts.push({ u: R * Math.cos(a), v: R * Math.sin(a), nu: Math.cos(a), nv: Math.sin(a), rad: R });
    }
    return pts;
  }
  const corners = [[W / 2 - r, H / 2 - r, 0], [-W / 2 + r, H / 2 - r, 90], [-W / 2 + r, -H / 2 + r, 180], [W / 2 - r, -H / 2 + r, 270]];
  for (const [cu, cv, a0] of corners) {
    for (let k = 0; k <= seg; k++) {
      const a = (a0 + (90 * k) / seg) * DEG;
      pts.push({ u: cu + r * Math.cos(a), v: cv + r * Math.sin(a), nu: Math.cos(a), nv: Math.sin(a), rad: r });
    }
  }
  return pts;
}

/**
 * Schnittkante eines Endes.
 * plane: Schnittebene im Profil-Rahmen als z = z0 + cu·u + cv·v.
 * mode "2D" | "3D"; swivel = größter Kopfschwenk [°] für 3D.
 * opts: t (Wand), eps (Überstand des Werkzeugs nach außen/innen).
 * Ergebnis: { outer: [[u, v, z]], inner: [[u, v, z]], arcs: [[Index…]] (gekrümmte Abschnitte in Reihenfolge, dazwischen
 * Geraden), need (größter nötiger Schwenk [°]), clamped (bool) }
 */
export function endCutEdge(kind, dims, plane, mode, swivel = SWIVEL_DEFAULT, { t, eps = 0.5, n = 96, seg = 16 } = {}) {
  const T = Math.tan(Math.min(Math.abs(swivel), 89) * DEG);
  let need = 0;
  const outer = [], inner = [];
  for (const p of outline(kind, dims, { n, seg })) {
    const zs = plane.z0 + plane.cu * p.u + plane.cv * p.v; // z der Außenkante
    const g = plane.cu * p.nu + plane.cv * p.nv; // Änderung von z je mm nach außen = tan des nötigen Schwenks
    need = Math.max(need, Math.atan(Math.abs(g)) / DEG);
    const gc = mode === "3D" ? Math.max(-T, Math.min(T, g)) : 0; // 2D: Strahl senkrecht, Innenkante unter der Außenkante
    const dIn = Math.min(t + eps, p.rad - 0.05); // nach innen nicht über den Krümmungsmittelpunkt
    outer.push([p.u + p.nu * eps, p.v + p.nv * eps, zs + gc * eps]);
    inner.push([p.u - p.nu * dIn, p.v - p.nv * dIn, zs - gc * dIn]);
  }
  // Rundrohr in vier Bögen, Rechteckrohr je Ecke ein Bogen (für glatte Flächen im Werkzeugkörper)
  const q = n / 4;
  const arcs = kind === "rohr" ? [0, 1, 2, 3].map((k) => Array.from({ length: q + 1 }, (_, i) => (k * q + i) % n))
    : [0, 1, 2, 3].map((k) => Array.from({ length: seg + 1 }, (_, i) => k * (seg + 1) + i));
  return { outer, inner, arcs, need, clamped: mode === "3D" && need > Math.min(Math.abs(swivel), 89) + 1e-9 };
}

/**
 * 2D oder 3D je Profil bzw. Rahmen, gilt für alle Schnitte dieses Profils (beide Enden), dazu die Winkelkorrektur
 * (Patrick, 24.10.2026). Ältere Profile mit Angabe je Ende (#48): 2D, wenn ein Ende 2D war; ohne Angabe 3D.
 * Ergebnis: { mode: "2D" | "3D", swivel: Ausdruck (Text) }
 */
export function featureCutSettings(f) {
  const mode = f?.cutMode === "2D" || f?.cutMode === "3D" ? f.cutMode : f?.endCuts?.A === "2D" || f?.endCuts?.B === "2D" ? "2D" : "3D";
  const swivel = f?.swivel !== undefined && f.swivel !== "" ? f.swivel : String(SWIVEL_DEFAULT);
  return { mode, swivel: String(swivel) };
}

/** Kann das Profil 2D/3D unterscheiden? Rechteckrohr braucht innen einen Eckradius (r ≥ t + 0,6). */
export function endCutSupported(kind, { t, r = 0 }) {
  if (!END_CUT_SECTIONS.includes(kind)) return false;
  return kind === "rohr" || r >= t + 0.6;
}
