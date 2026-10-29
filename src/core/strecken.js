// Gebogenes Rohr strecken (W2): Bohrungen eines gebogenen oder gewalzten Rundrohrs auf das gerade Rohr vor dem
// Biegen übertragen, damit der Rohrlaser das Bohrbild schneidet und danach gebogen wird. Reine Rechnung; das gerade
// Rohr mit den Bohrungen baut der Kern (Feature `strecken`).
//
// Mittellinie: Biegerohr (pieces: Geraden und Dreipunktbögen) oder gewalzter Bogen/Wendel (path aus biegeteil.js).
// Lage einer Bohrung: s = Abstand vom Rohranfang auf der Mittellinie (neutrale Faser), φ = Winkel um die Rohrachse.
// φ = 0° zeigt zur Innenseite der ersten Biegung, gezählt rechtsdrehend um die Laufrichtung. Der Bezug wandert
// verdrehungsfrei mit (Rotationsminimierender Rahmen), so wie ein Rohr beim Biegen nicht verdreht wird.

import { v3 } from "./geom.js";
import { pathPoint, pathLength } from "./biegeteil.js";

export const STRECKEN_SECTIONS = ["rohr", "rund"];

/** Kreis durch drei Punkte: { c, r } */
function circle3(a, m, b) {
  const ab = v3.sub(b, a), am = v3.sub(m, a), n = v3.cross(am, ab), nn = v3.dot(n, n);
  if (nn < 1e-12) return null;
  const c = v3.add(a, v3.mul(v3.add(v3.mul(v3.cross(n, am), v3.dot(ab, ab)), v3.mul(v3.cross(ab, n), v3.dot(am, am))), 1 / (2 * nn)));
  return { c, r: v3.dist(c, a) };
}

/** Punkte der Mittellinie mit Bogenlänge s, dicht genug für Bohrungen (Schritt ≤ step) */
export function centerline(src, step = 2) {
  const pts = [];
  const push = (p) => {
    const last = pts[pts.length - 1];
    if (last && v3.dist(last.p, p) < 1e-9) return;
    pts.push({ p, s: last ? last.s + v3.dist(last.p, p) : 0 });
  };
  let inward = null; // Innenseite der ersten Biegung am Bogenanfang
  if (src.pieces) {
    for (const pc of src.pieces) {
      if (pc.t === "line") { const n = Math.max(1, Math.ceil(v3.dist(pc.a, pc.b) / step)); for (let k = 0; k <= n; k++) push(v3.add(pc.a, v3.mul(v3.sub(pc.b, pc.a), k / n))); continue; }
      const ci = circle3(pc.a, pc.m, pc.b);
      if (!ci) { push(pc.a); push(pc.b); continue; }
      if (!inward) inward = v3.norm(v3.sub(ci.c, pc.a));
      const ua = v3.norm(v3.sub(pc.a, ci.c)), w = v3.norm(v3.cross(v3.sub(pc.a, ci.c), v3.sub(pc.m, ci.c)));
      const vb = v3.norm(v3.cross(w, ua)), ub = v3.sub(pc.b, ci.c);
      let th = Math.atan2(v3.dot(ub, vb), v3.dot(ub, ua));
      if (th <= 0) th += 2 * Math.PI;
      const n = Math.max(2, Math.ceil((ci.r * th) / step));
      for (let k = 0; k <= n; k++) { const a = (th * k) / n; push(v3.add(ci.c, v3.add(v3.mul(ua, ci.r * Math.cos(a)), v3.mul(vb, ci.r * Math.sin(a))))); }
    }
  } else if (src.path) {
    const n = Math.max(8, Math.ceil(pathLength(src.path) / step));
    for (let k = 0; k <= n; k++) push(pathPoint(src.path, k / n));
    const p0 = pathPoint(src.path, 0);
    const axis = src.path.axis || [0, 0, 1];
    const toC = v3.sub(src.path.c, p0);
    inward = v3.norm(v3.sub(toC, v3.mul(v3.norm(axis), v3.dot(toC, v3.norm(axis)))));
  }
  if (pts.length < 2) throw new Error("Mittellinie zu kurz");
  // Tangenten und verdrehungsfreier Rahmen (Doppelspiegelung nach Wang et al.)
  for (let i = 0; i < pts.length; i++) pts[i].t = v3.norm(v3.sub(pts[Math.min(i + 1, pts.length - 1)].p, pts[Math.max(i - 1, 0)].p));
  const t0 = pts[0].t;
  let r0 = inward && Math.abs(v3.dot(inward, t0)) < 0.99 ? inward : Math.abs(t0[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  r0 = v3.norm(v3.sub(r0, v3.mul(t0, v3.dot(r0, t0))));
  pts[0].r = r0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const v1 = v3.sub(b.p, a.p), c1 = v3.dot(v1, v1);
    if (c1 < 1e-18) { b.r = a.r; continue; }
    const rL = v3.sub(a.r, v3.mul(v1, (2 / c1) * v3.dot(v1, a.r))), tL = v3.sub(a.t, v3.mul(v1, (2 / c1) * v3.dot(v1, a.t)));
    const v2 = v3.sub(b.t, tL), c2 = v3.dot(v2, v2);
    const r = c2 < 1e-18 ? rL : v3.sub(rL, v3.mul(v2, (2 / c2) * v3.dot(v2, rL)));
    b.r = v3.norm(v3.sub(r, v3.mul(b.t, v3.dot(r, b.t))));
  }
  return pts;
}

/** Länge der Mittellinie */
export const centerlineLength = (pts) => pts[pts.length - 1].s;

/**
 * Lage einer Bohrung auf dem gestreckten Rohr.
 * hole: { p (Punkt auf der Bohrungsachse nahe der Wand), d (Achsrichtung), r (Radius) }, R = Außenradius des Rohrs.
 * Ergebnis: { s, phi (Grad 0…360), d (Ø), through (ganz durch den Rundstahl) } oder null (nicht am Rohr).
 */
export function locateHole(pts, hole, R) {
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i].p, b = pts[i + 1].p, ab = v3.sub(b, a), L2 = v3.dot(ab, ab) || 1;
    const u = Math.max(0, Math.min(1, v3.dot(v3.sub(hole.p, a), ab) / L2));
    const q = v3.add(a, v3.mul(ab, u)), dist = v3.dist(q, hole.p);
    if (!best || dist < best.dist) best = { i, u, q, dist };
  }
  if (!best || best.dist > R + Math.max(5, 0.5 * R)) return null;
  const A = pts[best.i], B = pts[best.i + 1];
  const s = A.s + (B.s - A.s) * best.u;
  const t = v3.norm(v3.add(v3.mul(A.t, 1 - best.u), v3.mul(B.t, best.u)));
  let r = v3.add(v3.mul(A.r, 1 - best.u), v3.mul(B.r, best.u));
  if (Math.abs(v3.dot(v3.norm(hole.d), t)) > 0.5) return null; // Bohrung des Rohrs selbst (Innenwand), keine Querbohrung
  r = v3.norm(v3.sub(r, v3.mul(t, v3.dot(r, t))));
  const b = v3.cross(t, r);
  // Seite: vom Mittelpunkt zur Wand; liegt der Achsenpunkt fast in der Mitte, geht die Bohrung ganz durch
  const off = v3.sub(hole.p, best.q);
  const through = v3.len(off) < 0.4 * R;
  let dir = through ? v3.sub(hole.d, v3.mul(t, v3.dot(hole.d, t))) : off;
  if (v3.len(dir) < 1e-9) return null;
  dir = v3.norm(dir);
  let phi = (Math.atan2(v3.dot(dir, b), v3.dot(dir, r)) * 180) / Math.PI;
  if (phi < 0) phi += 360;
  if (through && phi >= 180) phi -= 180;
  return { s, phi: Math.round(phi * 10) / 10 % 360, d: Math.round(2 * hole.r * 100) / 100, through };
}

/** Bohrbild gestreckt als CSV (Semikolon, deutsches Zahlenformat) */
export function stretchCsv(name, L, holes) {
  const f = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
  const rows = [[name], ["Gestreckte Länge mm", f(L)], [], ["Nr", "Abstand vom Anfang mm", "Winkel °", "Ø mm", "Art"],
    ...holes.map((h, i) => [i + 1, f(h.s), f(h.phi), f(h.d), h.through ? "durch" : "eine Wand"])];
  return "﻿" + rows.map((r) => r.join(";")).join("\r\n") + "\r\n";
}
