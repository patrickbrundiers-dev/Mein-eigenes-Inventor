// Kunststoffteile (SolidCraft-Abgleich E5): Regeln je Kunststoff (Wanddicke, Formschräge, Radius) und Vorgaben für
// Ansatz (Schraubdom), Rastnase, Lippe/Nut und Auflage. Werte nach üblichen Konstruktionsregeln für Spritzguss.

export const DEFAULT_PLASTIC_RULES = Object.freeze([
  { name: "ABS", wall: 2.5, draft: 1, radius: 1.2 },
  { name: "PA6 GF30", wall: 2.5, draft: 0.5, radius: 1.2 },
  { name: "PP", wall: 2, draft: 1, radius: 1 },
  { name: "PC", wall: 3, draft: 1, radius: 1.5 },
  { name: "PETG (3D-Druck)", wall: 2, draft: 0, radius: 1 },
]);

export const PLASTIC_ARTS = [
  ["ansatz", "Ansatz (Schraubdom)"], ["rastnase", "Rastnase"], ["lippe", "Lippe"], ["nut", "Nut (Gegenstück zur Lippe)"], ["auflage", "Auflage (Stützfuß)"],
];

export function validatePlasticRules(v) {
  if (!Array.isArray(v) || v.length > 30) return { ok: false, error: "Liste mit höchstens 30 Regeln erwartet" };
  const out = [], seen = new Set();
  for (const r of v) {
    const name = String(r?.name ?? "").trim();
    if (!name || name.length > 40) return { ok: false, error: "Regel braucht einen Namen" };
    if (seen.has(name)) return { ok: false, error: `Regel »${name}« doppelt` };
    seen.add(name);
    const n = (k, lo, hi) => { const x = Number(String(r[k]).replace(",", ".")); return Number.isFinite(x) && x >= lo && x <= hi ? x : null; };
    const wall = n("wall", 0.3, 20), draft = n("draft", 0, 15), radius = n("radius", 0, 20);
    if (wall == null || draft == null || radius == null) return { ok: false, error: `${name}: Wand 0,3–20 mm, Schräge 0–15°, Radius 0–20 mm` };
    out.push({ name, wall, draft, radius });
  }
  return { ok: true, value: out };
}

/** Vorgaben eines neuen Kunststoff-Features aus der Regel (Faustregeln: Dom außen ≈ 2 × Bohrung, Domwand 0,6 × Wand, Rippe 0,6 × Wand) */
export function plasticDefaults(art, rule = DEFAULT_PLASTIC_RULES[0]) {
  const w = rule.wall, r = (x) => String(Math.round(x * 10) / 10);
  switch (art) {
    case "ansatz": return { di: "3", d: r(Math.max(2 * 3, 3 + 2 * 0.6 * w)), h: r(4 * w), tiefe: r(4 * w), rippen: "4", rippeT: r(0.6 * w), rippeL: r(2 * w) };
    case "rastnase": return { l: r(8 * w), t: r(Math.max(1, 0.8 * w)), b: "6", hub: r(Math.max(0.6, 0.5 * w)), fang: r(1.5 * w), winkel: "0" };
    case "lippe": case "nut": return { breite: r(w / 2), hoehe: r(Math.max(1, w * 0.8)), spiel: art === "nut" ? "0.1" : "0" };
    case "auflage": return { d: r(3 * w), h: r(2 * w) };
    default: return {};
  }
}

/** Rastnase: Dehnung beim Einrasten (Biegebalken, Rechteck): ε = 1,5 · t · y / L² → Prozent */
export function snapStrain(t, y, L) { return (150 * t * y) / (L * L); }

/** Regelprüfung eines Features gegen die Wanddicke: Hinweise als Text */
export function plasticWarnings(art, v, rule) {
  const out = [];
  if (!rule) return out;
  if (art === "ansatz" && v.rippen > 0 && v.rippeT > 0.7 * rule.wall) out.push(`Rippe ${v.rippeT} mm dicker als 0,7 × Wand (${rule.wall} mm): Einfallstellen`);
  if (art === "ansatz" && (v.d - v.di) / 2 > 0.8 * rule.wall) out.push(`Domwand ${(v.d - v.di) / 2} mm dicker als 0,8 × Wand: Einfallstellen`);
  if (art === "rastnase") { const e = snapStrain(v.t, v.hub, v.l); if (e > 4) out.push(`Dehnung ${e.toFixed(1).replace(".", ",")} % beim Einrasten – über 4 % bricht die Nase leicht (länger oder dünner)`); }
  return out;
}
