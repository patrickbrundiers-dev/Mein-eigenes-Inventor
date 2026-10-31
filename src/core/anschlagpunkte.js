// Hebeösen / Anschlagpunkte (P8): Lage der Ringschrauben aus Schwerpunkt und Hülle, Größe nach DIN 580 aus Gewicht
// und Anschlagart, Prüfung (Schwerpunkt zwischen bzw. innerhalb der Ösen, Last je Öse). Reine Rechnung ohne DOM.
//
// Annahmen: Ösen oben auf der Hülle, Anschlag mit Kette/Band unter höchstens 45° zur Senkrechten. Bei 4 Ösen tragen
// nach DGUV/EN 818-6 nur 3 Stränge sicher (statisch unbestimmt), bei 2 Ösen beide.

import { DIN580 } from "./normlib.js";

const r1 = (x) => Math.round(x * 10) / 10;
const kg = (x) => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Tragende Stränge bei n Ösen */
export const carrying = (n) => (n >= 3 ? Math.min(n, 3) : n);

/**
 * Größe der Ringschraube: kleinste DIN-580-Größe, deren Tragfähigkeit für das Gewicht reicht.
 * angle "0" = senkrechter Zug je Strang (Traverse), "45" = Schrägzug bis 45°. Rückgabe { size, perEye, cap } oder null.
 */
export function eyeSize(mass, n, angle = "45") {
  const k = carrying(n);
  for (const [size, t] of Object.entries(DIN580)) {
    const per = angle === "0" ? t.wll : t.wll45 / 2; // DIN 580: 2-Strang-Wert gilt für beide Ösen zusammen
    if (per * k >= mass) return { size, perEye: mass / k, cap: per };
  }
  return null;
}

/**
 * Vorschlag: Ösen symmetrisch zum Schwerpunkt auf der Oberseite der Hülle, in der langen Richtung bei ±a (a = 30 % der
 * Länge, höchstens bis 10 % vor den Rand), bei 4 Ösen zusätzlich quer ±b. box {min, max}, cog [x, y, z].
 * Rückgabe [[x, y, z], …]
 */
export function proposeEyes(box, cog, n = 2) {
  const L = [box.max[0] - box.min[0], box.max[1] - box.min[1]];
  const long = L[0] >= L[1] ? 0 : 1, cross = 1 - long, z = box.max[2];
  const clampIn = (k, v) => Math.min(box.max[k] - 0.1 * L[k], Math.max(box.min[k] + 0.1 * L[k], v));
  const a = 0.3 * L[long], b = 0.3 * L[cross];
  const at = (da, db) => { const p = [0, 0, z]; p[long] = r1(clampIn(long, cog[long] + da)); p[cross] = r1(clampIn(cross, cog[cross] + db)); return p; };
  if (n >= 4) return [at(-a, -b), at(a, -b), at(a, b), at(-a, b)];
  return [at(-a, 0), at(a, 0)];
}

/** Punkt in konvexem Vieleck (xy, beliebige Umlaufrichtung) mit Toleranz */
function inHull(p, poly, tol = 1e-6) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    if (Math.abs(c / L) <= tol) continue;
    const s = Math.sign(c);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}
/** konvexe Hülle (xy) – Monotone Chain */
function hull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cr(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}

/**
 * Prüfung einer Anordnung: eyes [[x,y,z]], cog, mass (kg), size, angle. Rückgabe { loads: [kg je Öse], issues:
 * [{level, message}], tilt (Schiefstellung in Grad bei 2 Ösen, Näherung) }
 */
export function liftCheck(eyes, cog, mass, { size, angle = "45" } = {}) {
  const issues = [];
  const t = DIN580[size];
  const n = eyes.length;
  let loads = eyes.map(() => mass / carrying(n || 1));
  let tilt = 0;
  if (n < 2) issues.push({ level: "Fehler", message: "Mindestens zwei Anschlagpunkte – eine Öse allein hält das Teil nicht gegen Drehen" });
  else if (n === 2) {
    const [a, b] = eyes, d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(...d);
    if (L < 1) issues.push({ level: "Fehler", message: "Die beiden Ösen liegen aufeinander" });
    else {
      const u = [d[0] / L, d[1] / L], s = ((cog[0] - a[0]) * u[0] + (cog[1] - a[1]) * u[1]) / L; // 0 … 1 zwischen den Ösen
      const off = Math.abs((cog[0] - a[0]) * u[1] - (cog[1] - a[1]) * u[0]); // Abstand quer zur Ösenlinie
      if (s < 0 || s > 1) issues.push({ level: "Fehler", message: "Schwerpunkt liegt außerhalb der Ösen – das Teil kippt beim Anheben" });
      loads = [mass * (1 - Math.min(1, Math.max(0, s))), mass * Math.min(1, Math.max(0, s))];
      // Schiefstellung quer zur Ösenlinie: Schwerpunkt pendelt unter die Ösenlinie (Hebel off über Höhe Ösen–Schwerpunkt)
      const hgt = Math.max(1, (a[2] + b[2]) / 2 - cog[2]);
      tilt = (Math.atan2(off, hgt) * 180) / Math.PI;
      if (off > 1 && tilt > 5) issues.push({ level: "Warnung", message: `Schwerpunkt ${Math.round(off)} mm neben der Ösenlinie – das Teil hängt um etwa ${Math.round(tilt)}° schief` });
      const asym = Math.abs(s - 0.5);
      if (s >= 0 && s <= 1 && asym > 0.2) issues.push({ level: "Hinweis", message: `Ungleiche Last: ${kg(loads[0])} kg / ${kg(loads[1])} kg – Ösen näher an den Schwerpunkt rücken` });
    }
  } else {
    const H = hull(eyes.map((e) => [e[0], e[1]]));
    if (H.length < 3) issues.push({ level: "Fehler", message: "Ösen liegen auf einer Linie – das Teil kann um diese Linie kippen" });
    else if (!inHull(cog, H, 1)) issues.push({ level: "Fehler", message: "Schwerpunkt liegt außerhalb der Ösen (Grundriss) – das Teil kippt beim Anheben" });
    if (n >= 4) issues.push({ level: "Hinweis", message: "Bei 4 Ösen tragen sicher nur 3 Stränge (DGUV Regel 109-017) – die Größe ist dafür bemessen" });
  }
  if (t) {
    const cap = angle === "0" ? t.wll : t.wll45 / 2;
    const max = Math.max(...loads);
    if (max > cap + 1e-6) issues.push({ level: "Fehler", message: `Last je Öse ${kg(max)} kg > Tragfähigkeit ${size} ${angle === "0" ? "senkrecht" : "bei 45°"} ${kg(cap)} kg` });
  }
  if (angle !== "0") issues.push({ level: "Hinweis", message: "Ringschrauben quer zur Ringebene nicht belasten; Ring in Zugrichtung ausrichten, Bund muss satt aufliegen" });
  return { loads: loads.map((x) => r1(x)), issues, tilt: r1(tilt) };
}

/** Einschraubtiefe und Gewindebohrung für die Größe (Stahl: Gewindelänge l, Kernloch nach ISO 2306) */
export function tapHole(size) {
  const t = DIN580[size];
  if (!t) return null;
  const core = { 8: 6.8, 10: 8.5, 12: 10.2, 16: 14, 20: 17.5, 24: 21, 30: 26.5, 36: 32 }[t.d];
  return { thread: size, core, depth: Math.ceil(t.l + 0.5 * t.d), engage: t.l };
}
