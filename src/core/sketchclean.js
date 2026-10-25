// Skizze säubern (MegaCAD-Abgleich M7): Endpunkte zusammenführen, Nulllängen, doppelte und überlappende
// Elemente entfernen, fast waagrechte/senkrechte Linien gerade stellen. Vor allem für Fremddaten (DXF-Import),
// aber auch für eigene Skizzen. Ändert die Skizze direkt; die Oberfläche rechnet danach neu und nimmt bei
// Widerspruch das Geradestellen zurück.

import { deleteEntities } from "./sketch.js";

export const CLEAN_KINDS = {
  merge: "Endpunkte zusammenführen",
  zero: "Elemente ohne Länge entfernen",
  dupes: "Doppelte Elemente entfernen",
  overlap: "Überlappende Linien vereinigen",
  straighten: "Fast waagrecht/senkrecht gerade stellen",
};
export const CLEAN_DEFAULTS = { tol: 0.01, angle: 0.5 };

const ENT_PT_KEYS = ["p1", "p2", "c", "p", "a"];
const CON_PT_KEYS = ["p", "q", "c"];
const CON_ENT_KEYS = ["e", "e1", "e2"];
const ANGLE_CONS = ["horizontal", "vertical", "angle", "parallel", "perpendicular", "collinear"];

/**
 * Säubert sk. opts: { tol (mm), angle (°), kinds: {merge, zero, dupes, overlap, straighten}, uid }.
 * Rückgabe { merged, zero, dupes, overlap, straightened, total } (Anzahl je Art).
 */
export function cleanSketch(sk, opts = {}) {
  const tol = opts.tol ?? CLEAN_DEFAULTS.tol, angTol = opts.angle ?? CLEAN_DEFAULTS.angle;
  const kinds = { merge: true, zero: true, dupes: true, overlap: true, straighten: true, ...(opts.kinds || {}) };
  const uid = opts.uid || ((p) => p + Math.random().toString(36).slice(2, 9));
  const rep = { merged: 0, zero: 0, dupes: 0, overlap: 0, straightened: 0 };

  const remapPoint = (from, to) => {
    for (const e of sk.entities) {
      for (const k of ENT_PT_KEYS) if (e[k] === from) e[k] = to;
      if (e.pts) e.pts = e.pts.map((x) => (x === from ? to : x));
    }
    for (const c of sk.constraints) for (const k of CON_PT_KEYS) if (c[k] === from) c[k] = to;
  };
  const remapEntity = (from, to) => { for (const c of sk.constraints) for (const k of CON_ENT_KEYS) if (c[k] === from) c[k] = to; };
  const dropSelfRefs = () => {
    sk.constraints = sk.constraints.filter((c) => !((c.type === "coincident" && c.p === c.q) || (c.e1 && c.e1 === c.e2)));
  };

  // 1) Punkte im Abstand ≤ tol zusammenführen (Ursprung/fixierte Punkte bleiben stehen)
  if (kinds.merge) {
    const fixed = new Set(sk.constraints.filter((c) => c.type === "fix").map((c) => c.p));
    const keepRank = (p) => (p.id === "O" ? 2 : fixed.has(p.id) ? 1 : 0);
    const alive = [...sk.points];
    const gone = new Set();
    for (let i = 0; i < alive.length; i++) {
      const a = alive[i];
      if (gone.has(a.id)) continue;
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j];
        if (gone.has(b.id) || Math.hypot(a.x - b.x, a.y - b.y) > tol) continue;
        if (keepRank(a) && keepRank(b)) continue; // zwei feste Punkte nicht verschmelzen
        const [keep, drop] = keepRank(b) > keepRank(a) ? [b, a] : [a, b];
        remapPoint(drop.id, keep.id);
        gone.add(drop.id);
        rep.merged++;
        if (drop === a) break;
      }
    }
    sk.points = sk.points.filter((p) => !gone.has(p.id));
    dropSelfRefs();
  }
  const P = () => new Map(sk.points.map((p) => [p.id, p]));

  // 2) Linien und Bögen ohne Länge
  if (kinds.zero) {
    const pm = P();
    const dead = sk.entities.filter((e) => {
      if (e.type === "line") { const a = pm.get(e.p1), b = pm.get(e.p2); return e.p1 === e.p2 || (a && b && Math.hypot(a.x - b.x, a.y - b.y) <= tol); }
      if (e.type === "circle") return !(e.r > tol);
      if (e.type === "arc") return e.p1 === e.p2 || e.c === e.p1;
      return false;
    }).map((e) => e.id);
    rep.zero = dead.length;
    if (dead.length) deleteEntities(sk, dead);
  }

  // 3) Doppelte Elemente (gleiche Punkte bzw. gleicher Kreis); Konstruktion weicht der Kontur
  if (kinds.dupes) {
    const pm = P();
    const sig = (e) => {
      if (e.type === "line") return "l:" + [e.p1, e.p2].sort().join(",");
      if (e.type === "arc") return `a:${e.c},${e.p1},${e.p2}`;
      if (e.type === "circle") { const c = pm.get(e.c); return c ? `c:${Math.round(c.x / tol)},${Math.round(c.y / tol)},${Math.round(e.r / tol)}` : null; }
      if (e.type === "point") return "p:" + e.p;
      return null;
    };
    const seen = new Map(), dead = [];
    const order = [...sk.entities].sort((a, b) => Number(!!a.construction) - Number(!!b.construction));
    for (const e of order) {
      if (e.origin) continue;
      const s = sig(e);
      if (!s) continue;
      if (seen.has(s)) { remapEntity(e.id, seen.get(s)); dead.push(e.id); } else seen.set(s, e.id);
    }
    rep.dupes = dead.length;
    if (dead.length) { deleteEntities(sk, dead); dropSelfRefs(); }
  }

  // 4) Überlappende Linien auf einer Geraden: enthaltene löschen, teilweise überlappende vereinigen
  if (kinds.overlap) {
    let changed = true;
    while (changed) {
      changed = false;
      const pm = P();
      const lines = sk.entities.filter((e) => e.type === "line" && !e.origin);
      outer: for (let i = 0; i < lines.length; i++) {
        for (let j = 0; j < lines.length; j++) {
          if (i === j) continue;
          const A = lines[i], B = lines[j];
          if (!!A.construction !== !!B.construction) continue;
          const a1 = pm.get(A.p1), a2 = pm.get(A.p2), b1 = pm.get(B.p1), b2 = pm.get(B.p2);
          const dx = a2.x - a1.x, dy = a2.y - a1.y, L = Math.hypot(dx, dy);
          if (L <= tol) continue;
          const off = (q) => Math.abs((q.x - a1.x) * dy - (q.y - a1.y) * dx) / L;
          if (off(b1) > tol || off(b2) > tol) continue;
          const t = (q) => ((q.x - a1.x) * dx + (q.y - a1.y) * dy) / (L * L);
          const t1 = t(b1), t2 = t(b2), lo = Math.min(t1, t2), hi = Math.max(t1, t2), e = tol / L;
          if (hi <= e || lo >= 1 - e) continue; // berühren sich höchstens an den Enden
          // B liegt auf A: A auf die Vereinigung verlängern
          const ends = [[0, A.p1], [1, A.p2], [t1, B.p1], [t2, B.p2]].sort((x, y) => x[0] - y[0]);
          A.p1 = ends[0][1];
          A.p2 = ends[3][1];
          sk.constraints = sk.constraints.filter((c) => !(CON_ENT_KEYS.some((k) => c[k] === A.id) && ["length", "midpoint"].includes(c.type)));
          remapEntity(B.id, A.id);
          deleteEntities(sk, [B.id]);
          dropSelfRefs();
          rep.overlap++;
          changed = true;
          break outer;
        }
      }
    }
  }

  // 5) Fast waagrecht/senkrecht: Bedingung setzen und Punkte gerade rücken
  if (kinds.straighten && angTol > 0) {
    const pm = P();
    const fixed = new Set(sk.constraints.filter((c) => c.type === "fix").map((c) => c.p));
    for (const e of sk.entities) {
      if (e.type !== "line" || e.origin) continue;
      if (sk.constraints.some((c) => ANGLE_CONS.includes(c.type) && CON_ENT_KEYS.some((k) => c[k] === e.id))) continue;
      const a = pm.get(e.p1), b = pm.get(e.p2);
      const ang = (Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)) * 180) / Math.PI;
      let type = null;
      if (ang > 1e-9 && ang <= angTol) type = "horizontal";
      else if (ang < 90 - 1e-9 && ang >= 90 - angTol) type = "vertical";
      if (!type) continue;
      const k = type === "horizontal" ? "y" : "x";
      const fa = fixed.has(a.id) || a.id === "O", fb = fixed.has(b.id) || b.id === "O";
      if (fa && fb) continue;
      const v = fa ? a[k] : fb ? b[k] : (a[k] + b[k]) / 2;
      a[k] = v; b[k] = v;
      sk.constraints.push({ id: uid("k"), type, e: e.id });
      rep.straightened++;
    }
  }
  rep.total = rep.merged + rep.zero + rep.dupes + rep.overlap + rep.straightened;
  return rep;
}

/** Bericht als kurzer Text für die Meldung */
export function cleanReportText(rep) {
  const parts = [];
  if (rep.merged) parts.push(`${rep.merged} Punkt(e) zusammengeführt`);
  if (rep.zero) parts.push(`${rep.zero} Element(e) ohne Länge entfernt`);
  if (rep.dupes) parts.push(`${rep.dupes} doppelte(s) Element(e) entfernt`);
  if (rep.overlap) parts.push(`${rep.overlap} Überlappung(en) vereinigt`);
  if (rep.straightened) parts.push(`${rep.straightened} Linie(n) gerade gestellt`);
  return parts.length ? parts.join(", ") : "Nichts zu säubern";
}
