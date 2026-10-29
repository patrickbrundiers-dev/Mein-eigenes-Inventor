// Verzinkungsbohrungen (W1): Entlüftungs- und Ablauflöcher in geschlossenen Hohlprofilen für das Feuerverzinken
// nach DIN EN ISO 14713-2. Reine Rechnung (Durchmesser, Lage), die Bohrungen setzt der Kern (Feature `zinkloch`).
//
// Je Ende eine Durchgangsbohrung quer durch beide Wände (= 2 Öffnungen je Ende), so nah wie möglich am Ende.
// Der Durchmesser kommt aus der Richtwerttabelle (Spalte »2 Öffnungen je Ende«) nach der Profilgröße:
// Rundrohr D, Quadratrohr B, Rechteckrohr (B + H) / 2. Die Werte sind Richtwerte – mit dem Verzinker abstimmen.

/** [Profilgröße bis mm, Mindest-Ø mm] */
export const VENT_TABLE = [
  [15, 8], [20, 10], [30, 10], [40, 12], [50, 12], [60, 12], [80, 16], [100, 20], [120, 25], [160, 25], [200, 30],
];

/** Oberflächen, für die Verzinkungsbohrungen nötig sind */
export const needsVent = (finishKind) => finishKind === "verzinkt" || finishKind === "duplex";

/** Maßgebliche Profilgröße: Rundrohr D, Quadrat B, Rechteck (B + H) / 2 */
export const ventSize = (W, H) => (W + H) / 2;

/** Richtwert Mindest-Ø für eine Profilgröße; über 200 mm 15 % der Größe, auf 5 mm gerundet */
export function ventDiameter(W, H = W) {
  const s = ventSize(W, H);
  for (const [upTo, d] of VENT_TABLE) if (s <= upTo + 1e-9) return d;
  return Math.ceil((0.15 * s) / 5) * 5;
}

/**
 * Bohrungen eines Stabs.
 * ax: Stabachse aus den Metadaten { origin, z, u, v, lo, hi, width, height }
 * opts: { d (0 = Richtwert), edge (Abstand Lochrand–Stabende), ends ("beide" | "A" | "B"), dir ("v" | "u"),
 *         miterA, miterB (Schnittwinkel der Enden in Grad), wall (Wanddicke) }
 * Ergebnis: { d, holes: [{ end, z, p, dir, len, d }], issues: [Text] }
 */
export function ventPlan(ax, { d = 0, edge = 10, ends = "beide", dir = "v", miterA = 0, miterB = 0 } = {}) {
  const W = ax.width, H = ax.height;
  const dd = d > 0 ? d : ventDiameter(W, H);
  const issues = [];
  // Seite, durch die gebohrt wird: quer zu ihr liegt die Lochfläche, ihre Breite begrenzt den Ø
  const across = dir === "u" ? H : W;
  if (dd > 0.7 * across) issues.push(`Ø ${dd} mm ist größer als 70 % der Profilseite (${round(across)} mm)`);
  const D = dir === "u" ? ax.u : ax.v, size = dir === "u" ? W : H;
  const L = ax.hi - ax.lo;
  // Gehrung: die volle Wand beginnt erst hinter der Spitze, um Profilgröße · tan(Winkel) weiter innen
  const extra = (m) => Math.max(W, H) * Math.tan((Math.min(Math.abs(m || 0), 80) * Math.PI) / 180);
  const holes = [];
  for (const end of ends === "A" ? ["A"] : ends === "B" ? ["B"] : ["A", "B"]) {
    const off = edge + dd / 2 + extra(end === "A" ? miterA : miterB);
    const z = end === "A" ? ax.lo + off : ax.hi - off;
    holes.push({ end, z, d: dd, len: size + 10, dir: D, p: add(add(ax.origin, mul(ax.z, z)), mul(D, -(size / 2 + 5))) });
  }
  if (holes.length === 2 && holes[0].z >= holes[1].z - dd) {
    issues.push(`Stab zu kurz für zwei Bohrungen (${round(L)} mm) – nur eine Bohrung in der Mitte`);
    const z = (ax.lo + ax.hi) / 2;
    holes.splice(0, 2, { ...holes[0], end: "Mitte", z, p: add(add(ax.origin, mul(ax.z, z)), mul(D, -(size / 2 + 5))) });
  }
  return { d: dd, holes, issues };
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const round = (x) => Math.round(x * 10) / 10;
