// Fangen in der Skizze (wie Inventor): Schnittpunkte, Mitten, Mittelpunkte, Quadranten, Bogenmitte und
// Ausrichtung waagrecht/senkrecht zu vorhandenen Punkten. Reine Rechnung in Skizzenkoordinaten; vorhandene
// Punkte und »auf Element« fängt der Skizzierer selbst (Trefferprüfung), dieses Modul liefert die übrigen Arten.
import { geo, intersections } from "./sketchedit.js";
import { arcGeometry } from "./sketch.js";

const dist = (a, x, y) => Math.hypot(a.x - x, a.y - y);

/** Abstand eines Punktes zu einem Element (Linie, Kreis, Bogen) – für die Vorauswahl der Schnittpartner */
function distTo(g, x, y) {
  if (g.kind === "line") {
    const dx = g.bx - g.ax, dy = g.by - g.ay, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - g.ax) * dx + (y - g.ay) * dy) / L2));
    return Math.hypot(g.ax + t * dx - x, g.ay + t * dy - y);
  }
  return Math.abs(Math.hypot(x - g.cx, y - g.cy) - g.r);
}

/**
 * Besonderer Fangpunkt nahe (x, y) innerhalb tol (Skizzeneinheiten), sonst null.
 * Reihenfolge: Schnittpunkt, dann der nächste von Linienmitte, Mittelpunkt, Quadrant, Bogenmitte.
 * Ergebnis wie Skizzierer-Fang: { x, y, label, pointId? | mid? | on?, onType?, on2?, onType2? }.
 */
export function specialSnap(sk, x, y, tol, { exclude = new Set() } = {}) {
  const P = new Map(sk.points.map((p) => [p.id, p]));
  const ents = sk.entities.filter((e) => !exclude.has(e.id));
  // Schnittpunkte der Elemente in Cursornähe
  const near = [];
  for (const e of ents) {
    if (!["line", "circle", "arc"].includes(e.type)) continue;
    const g = geo(sk, e, P);
    if (g && distTo(g, x, y) < tol * 2) near.push({ e, g });
  }
  let best = null, bd = tol;
  for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
    for (const q of intersections(near[i].g, near[j].g)) {
      const d = dist(q, x, y);
      // Schnittpunkte auf einem gemeinsamen Endpunkt sind schon Punkte
      if (d < bd && ![...P.values()].some((p) => dist(p, q.x, q.y) < 1e-9)) {
        bd = d;
        const A = near[i].e, B = near[j].e;
        best = { x: q.x, y: q.y, label: "Schnittpunkt", on: A.id, onType: A.type === "line" ? "line" : "circle", on2: B.id, onType2: B.type === "line" ? "line" : "circle" };
      }
    }
  }
  if (best) return best;
  // Mitten, Mittelpunkte, Quadranten, Bogenmitte: der nächste gewinnt
  const cand = [];
  for (const e of ents) {
    if (e.type === "line") {
      const a = P.get(e.p1), b = P.get(e.p2);
      if (a && b) cand.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, mid: e.id, label: "Mitte" });
    } else if (e.type === "circle" || e.type === "arc" || e.type === "ellipse") {
      const c = P.get(e.c);
      if (!c) continue;
      cand.push({ x: c.x, y: c.y, pointId: c.id, label: "Mittelpunkt" });
      if (e.type === "circle") {
        for (const [k, l] of [[0, "rechts"], [1, "oben"], [2, "links"], [3, "unten"]]) {
          const a = (k * Math.PI) / 2;
          cand.push({ x: c.x + e.r * Math.cos(a), y: c.y + e.r * Math.sin(a), on: e.id, onType: "circle", label: "Quadrant " + l });
        }
      } else if (e.type === "arc") {
        const ag = arcGeometry(c, P.get(e.p1), P.get(e.p2));
        cand.push({ x: ag.mid.x, y: ag.mid.y, on: e.id, onType: "circle", label: "Bogenmitte" });
      }
    }
  }
  for (const c of cand) { const d = dist(c, x, y); if (d < bd) { bd = d; best = c; } }
  return best;
}

/**
 * Ausrichtung: x bzw. y auf einen vorhandenen Punkt ziehen, wenn der Cursor innerhalb tol waagrecht oder
 * senkrecht zu ihm liegt (gestrichelte Hilfslinie wie Inventor). Gibt { x, y, label, guides } oder null.
 * refs: zusätzliche Bezugspunkte (z. B. Startpunkt der Linie, auch wenn noch nicht in der Skizze).
 */
export function alignSnap(sk, x, y, tol, { refs = [], excludePoints = new Set() } = {}) {
  const pts = [...refs, ...sk.points.filter((p) => !excludePoints.has(p.id))];
  let vx = null, vy = null, dvx = tol, dvy = tol;
  for (const p of pts) {
    const ex = Math.abs(p.x - x), ey = Math.abs(p.y - y);
    if (ex < dvx && ey > 1e-9) { dvx = ex; vx = p; }
    if (ey < dvy && ex > 1e-9) { dvy = ey; vy = p; }
  }
  if (!vx && !vy) return null;
  const nx = vx ? vx.x : x, ny = vy ? vy.y : y;
  const guides = [];
  if (vx) guides.push({ x1: vx.x, y1: vx.y, x2: nx, y2: ny });
  if (vy) guides.push({ x1: vy.x, y1: vy.y, x2: nx, y2: ny });
  return { x: nx, y: ny, label: vx && vy ? "Ausgerichtet" : vx ? "Senkrecht zu Punkt" : "Waagrecht zu Punkt", guides };
}
