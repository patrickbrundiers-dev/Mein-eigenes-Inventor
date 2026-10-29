// Fangpunkte im 3D-Fenster (Messen, wie Inventor/Fusion): Endpunkt, Mittelpunkt, Kreismitte, Quadrant, Bogenmitte,
// Flächenmitte. Reine Rechnung in Körperkoordinaten aus den Kanten-/Flächenangaben des Kerns (meshBody) und die
// kleinen Fangsymbole je Fangart, die das 3D-Fenster und der Skizzierer gleich zeichnen.

/** Fangarten mit Anzeigename und Vorrang (kleiner = wichtiger bei gleichem Abstand) */
export const SNAP_KINDS = {
  end: { label: "Endpunkt", prio: 0 },
  center: { label: "Kreismitte", prio: 1 },
  intersection: { label: "Schnittpunkt", prio: 1 },
  mid: { label: "Mittelpunkt", prio: 2 },
  arcMid: { label: "Bogenmitte", prio: 3 },
  quadrant: { label: "Quadrant", prio: 4 },
  faceCenter: { label: "Flächenmitte", prio: 5 },
  on: { label: "Auf Element", prio: 6 },
};

const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const add = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
const mul = (p, s) => [p[0] * s, p[1] * s, p[2] * s];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const len = (v) => Math.hypot(v[0], v[1], v[2]);
const norm = (v) => { const l = len(v) || 1; return mul(v, 1 / l); };

/** Abstand eines Punktes zum Streckenzug (3D) */
function polyDist(pts, q) {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], d = sub(pts[i + 1], a), L2 = dot(d, d);
    const t = L2 > 0 ? Math.max(0, Math.min(1, dot(sub(q, a), d) / L2)) : 0;
    best = Math.min(best, len(sub(q, add(a, mul(d, t)))));
  }
  return best;
}

/** Quadrantenpunkte eines Kreises: Mitte ± r·x, ± r·y (y = Achse × x), Nummer 0–3 gegen den Uhrzeigersinn */
export function quadrantPoint(center, axisD, xDir, r, q) {
  const x = norm(xDir), y = norm(cross(norm(axisD), x));
  const a = (q * Math.PI) / 2;
  return add(center, add(mul(x, r * Math.cos(a)), mul(y, r * Math.sin(a))));
}

/**
 * Fangpunkte einer Kante. info = Kantenangabe aus meshBody ({type, mid, center?, radius?, axisD?, xDir?}),
 * pts = Anzeige-Streckenzug der Kante (Körperkoordinaten). → [{ kind, p, ref }] mit ref für den Kern
 * (»start«, »end«, »mid«, »center«, »q0«–»q3«), damit der Messwert exakt aus der Kante kommt.
 */
export function edgeSnaps(info, pts) {
  if (!pts?.length) return [];
  const out = [];
  const first = pts[0], last = pts[pts.length - 1];
  const closed = pts.length > 2 && len(sub(first, last)) < 1e-6;
  const circle = info?.type === "CIRCLE" && info.center && info.radius > 0;
  if (!closed) {
    out.push({ kind: "end", p: first, ref: "start" }, { kind: "end", p: last, ref: "end" });
    if (info?.mid) out.push({ kind: info.type === "LINE" ? "mid" : "arcMid", p: info.mid, ref: "mid" });
  }
  if (circle) {
    out.push({ kind: "center", p: info.center, ref: "center" });
    if (info.axisD && info.xDir) {
      // Quadranten nur, wenn sie auf dem Bogen liegen (Toleranz: Durchbiegung des Anzeigenetzes)
      const tol = Math.max(1e-3, info.radius * 0.02);
      for (let q = 0; q < 4; q++) {
        const p = quadrantPoint(info.center, info.axisD, info.xDir, info.radius, q);
        if (closed || polyDist(pts, p) < tol) {
          // Bogen-Enden sind schon Endpunkte
          if (!closed && (len(sub(p, first)) < tol || len(sub(p, last)) < tol)) continue;
          out.push({ kind: "quadrant", p, ref: "q" + q });
        }
      }
    }
  }
  return out;
}

/** Fangpunkt einer Fläche: Mitte (Schwerpunkt) ebener Flächen */
export function faceSnaps(info) {
  if (info?.type === "PLANE" && info.point) return [{ kind: "faceCenter", p: info.point, ref: "center" }];
  return [];
}

/**
 * Nächster Fangpunkt zur Mausposition (Bildschirm-px). cands: [{ sx, sy, kind, ... }].
 * Innerhalb von radius gewinnt der nächste; fast gleich weit (±1,5 px) entscheidet der Vorrang der Fangart.
 */
export function nearestSnap(cands, x, y, radius) {
  let best = null, bd = Infinity;
  for (const c of cands) {
    const d = Math.hypot(c.sx - x, c.sy - y);
    if (d > radius) continue;
    const better = !best || d < bd - 1.5 || (Math.abs(d - bd) <= 1.5 && (SNAP_KINDS[c.kind]?.prio ?? 9) < (SNAP_KINDS[best.kind]?.prio ?? 9));
    if (better) { best = c; bd = d; }
  }
  return best;
}

/** Abstand (px) eines Punktes zur Strecke a–b auf dem Bildschirm */
export function screenSegDist(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
  return Math.hypot(ax + t * dx - x, ay + t * dy - y);
}

/** Achsstück einer Zylinderfläche über ihre Länge: Fläche-Punkte auf die Achse projiziert (+ 10 % Überstand) */
export function axisSegment(axisP, axisD, points) {
  const d = norm(axisD);
  let lo = Infinity, hi = -Infinity;
  for (const q of points) { const t = dot(sub(q, axisP), d); if (t < lo) lo = t; if (t > hi) hi = t; }
  if (!Number.isFinite(lo)) return null;
  const ext = Math.max(2, (hi - lo) * 0.1);
  return { a: add(axisP, mul(d, lo - ext)), b: add(axisP, mul(d, hi + ext)), d };
}

/**
 * Fangsymbol als SVG-Pfad um (0, 0) mit halber Größe s – schlanke Umrisse statt großer Punkte:
 * Endpunkt = Quadrat, Mittelpunkt/Bogenmitte = Dreieck, Kreismitte = Kreis mit Kreuz, Quadrant = Raute,
 * Flächenmitte = Kreuz im Kreis klein, Schnittpunkt = X, auf Element = kleiner Kreis.
 */
export function glyphPath(kind, s = 5) {
  const f = (v) => +v.toFixed(2);
  const circle = (r) => `M${f(-r)} 0A${f(r)} ${f(r)} 0 1 0 ${f(r)} 0A${f(r)} ${f(r)} 0 1 0 ${f(-r)} 0Z`;
  switch (kind) {
    case "end": return `M${f(-s)} ${f(-s)}H${f(s)}V${f(s)}H${f(-s)}Z`;
    case "mid": case "arcMid": return `M0 ${f(-s)}L${f(s)} ${f(s * 0.8)}H${f(-s)}Z`;
    case "center": return `${circle(s)}M${f(-s * 1.5)} 0H${f(s * 1.5)}M0 ${f(-s * 1.5)}V${f(s * 1.5)}`;
    case "quadrant": return `M0 ${f(-s)}L${f(s)} 0L0 ${f(s)}L${f(-s)} 0Z`;
    case "faceCenter": return `${circle(s * 0.6)}M${f(-s)} ${f(-s)}L${f(-s * 0.4)} ${f(-s * 0.4)}M${f(s)} ${f(-s)}L${f(s * 0.4)} ${f(-s * 0.4)}M${f(s)} ${f(s)}L${f(s * 0.4)} ${f(s * 0.4)}M${f(-s)} ${f(s)}L${f(-s * 0.4)} ${f(s * 0.4)}`;
    case "intersection": return `M${f(-s)} ${f(-s)}L${f(s)} ${f(s)}M${f(-s)} ${f(s)}L${f(s)} ${f(-s)}`;
    default: return circle(s * 0.7);
  }
}

/** Fangart zu einem Fang-Ergebnis des Skizzierers (Bezeichnung aus sketchsnap.js) */
export function sketchSnapKind(sn) {
  const l = sn?.label || "";
  if (sn?.on2 || l === "Schnittpunkt") return "intersection";
  if (l === "Mittelpunkt") return "center";
  if (l === "Mitte") return "mid";
  if (l === "Bogenmitte") return "arcMid";
  if (l.startsWith("Quadrant")) return "quadrant";
  if (sn?.pointId) return "end";
  if (sn?.on || sn?.mid) return "on";
  return null;
}
