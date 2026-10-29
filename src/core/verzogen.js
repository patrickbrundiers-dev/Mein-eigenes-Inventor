// Gewendelte Treppe mit verzogenen Stufen (N1): viertelgewendelt (L ohne Podest) und halbgewendelt (U ohne Podest,
// mit Treppenauge). Wangen aus Flachstahl, Stufen als Platten zwischen den Wangen. Reine Rechnung; Bauplan siehe
// generator.js, aufgerufen vom Treppen-Generator (treppe.js).
//
// Lage wie die gerade Treppe: Antritt bei x = 0, erster Lauf steigt in +X, Laufbreite B in +Y, Wendung nach links
// (nach rechts: gespiegelt an y = 0). Die Lauflinie liegt in der Laufmitte (DIN 18065 bis 1 m Laufbreite), an der
// Wendung ein Viertelkreis um die innere Ecke. Auf der Lauflinie sind alle Auftritte gleich (a).
//
// Verziehen nach der Abwicklungsmethode: jede Stufenvorderkante geht durch ihren Punkt auf der Lauflinie und einen
// Punkt auf der inneren Wange. Außerhalb der Wendung ist das der Lotfußpunkt (Kante rechtwinklig zum Lauf), in der
// Wendung (»verzug« Stufen vor und nach der Ecke) sind die Punkte auf der abgewickelten inneren Wange gleichmäßig
// verteilt. Die Kante wird bis zur äußeren Wange verlängert.

import { fieldError } from "./generror.js";
import { railAlong } from "./treppengelaender.js";
import { railingIssues } from "./gelaendernorm.js";

const DEG = Math.PI / 180;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], add = (a, b) => [a[0] + b[0], a[1] + b[1]], mul = (a, k) => [a[0] * k, a[1] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1], len = (a) => Math.hypot(a[0], a[1]), nrm = (a) => mul(a, 1 / (len(a) || 1));
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const fmt = (x) => String(Math.round(x * 10) / 10).replace(".", ",");

/** Polylinie mit Bogenlänge: { pts, cum, total, at(t), seg(t) } */
function polyline(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1])));
  const seg = (t) => { let i = 0; while (i < pts.length - 2 && t > cum[i + 1]) i++; return i; };
  const at = (t) => { const i = seg(t), L = cum[i + 1] - cum[i] || 1; return add(pts[i], mul(sub(pts[i + 1], pts[i]), (t - cum[i]) / L)); };
  /** nächster Punkt (Parameter t) zu q */
  const closest = (q) => {
    let best = { d: Infinity, t: 0 };
    for (let i = 0; i + 1 < pts.length; i++) {
      const ab = sub(pts[i + 1], pts[i]), L = len(ab);
      if (L < 1e-9) continue;
      const u = Math.max(0, Math.min(L, dot(sub(q, pts[i]), ab) / L)), P = add(pts[i], mul(ab, u / L)), d = len(sub(q, P));
      if (d < best.d - 1e-9) best = { d, t: cum[i] + u };
    }
    return best.t;
  };
  /** Schnitt des Strahls q + λ·v (λ > 0) mit der Polylinie → Parameter t */
  const hit = (q, v) => {
    let best = null;
    for (let i = 0; i + 1 < pts.length; i++) {
      const A = pts[i], e = sub(pts[i + 1], A), den = cross(v, e);
      if (Math.abs(den) < 1e-12) continue;
      const w = sub(A, q), lam = cross(w, e) / den, mu = cross(w, v) / den;
      if (lam > 1e-9 && mu >= -1e-9 && mu <= 1 + 1e-9 && (!best || lam < best.lam)) best = { lam, t: cum[i] + mu * len(e) };
    }
    return best ? best.t : null;
  };
  return { pts, cum, total: cum[cum.length - 1], at, seg, closest, hit };
}

/** stückweise lineare Funktion durch [[t, z], …] (außerhalb verlängert) */
function pl1(knots) {
  return (t) => {
    let i = 0;
    while (i < knots.length - 2 && t > knots[i + 1][0]) i++;
    const [t0, z0] = knots[i], [t1, z1] = knots[i + 1];
    return z0 + ((z1 - z0) * (t - t0)) / (t1 - t0 || 1);
  };
}

/**
 * Grundriss der gewendelten Treppe (Wendung links): Lauflinie (Segmente Gerade/Bogen), innere und äußere Wangenlinie.
 * Rückgabe { walk: { total, at(s) }, inner, outer, arcs: [[s0, s1]] }
 */
export function windingLayout({ form, B, Lw, sMid, gap }) {
  const r = B / 2, q = (Math.PI / 2) * r;
  const U = form === "Uw", g = U ? gap : 0;
  const X1 = sMid - (U ? q + g / 2 : q / 2);
  const L2 = Lw - X1 - (U ? 2 * q + g : q);
  if (!(X1 >= 0)) throw fieldError("Zu wenige Steigungen vor der Wendelung", "n1");
  if (!(L2 >= 0)) throw fieldError("Zu wenige Steigungen nach der Wendelung", "n1");
  // Lauflinie
  const segs = [];
  const line = (A, Bp) => segs.push({ kind: "line", A, B: Bp, L: len(sub(Bp, A)) });
  const arc = (c, a0, a1) => segs.push({ kind: "arc", c, a0, a1, L: Math.abs(a1 - a0) * r });
  line([0, r], [X1, r]);
  arc([X1, B], -90 * DEG, 0);
  let inner, outer;
  if (!U) {
    line([X1 + r, B], [X1 + r, B + L2]);
    inner = [[0, B], [X1, B], [X1, B + L2]];
    outer = [[0, 0], [X1 + B, 0], [X1 + B, B + L2]];
  } else {
    if (g > 0) line([X1 + r, B], [X1 + r, B + g]);
    arc([X1, B + g], 0, 90 * DEG);
    line([X1, B + g + r], [X1 - L2, B + g + r]);
    inner = [[0, B], [X1, B], [X1, B + g], [X1 - L2, B + g]];
    outer = [[0, 0], [X1 + B, 0], [X1 + B, 2 * B + g], [X1 - L2, 2 * B + g]];
  }
  const arcs = [];
  let acc = 0;
  for (const sg of segs) { if (sg.kind === "arc") arcs.push([acc, acc + sg.L]); acc += sg.L; }
  const at = (s) => {
    let a0 = 0;
    for (const sg of segs) {
      if (s <= a0 + sg.L + 1e-9 || sg === segs[segs.length - 1]) {
        const u = Math.max(0, s - a0);
        if (sg.kind === "line") return add(sg.A, mul(nrm(sub(sg.B, sg.A)), u));
        const ang = sg.a0 + (sg.a1 > sg.a0 ? 1 : -1) * (u / r);
        return [sg.c[0] + r * Math.cos(ang), sg.c[1] + r * Math.sin(ang)];
      }
      a0 += sg.L;
    }
  };
  return { walk: { total: acc, at }, inner: polyline(inner), outer: polyline(outer), arcs, X1, L2 };
}

/**
 * Stufenkanten: je Steigung k (0 … n − 1) Lauflinienpunkt W, Parameter ti (innere Wange) und to (äußere Wange).
 * verzug: Stufen vor und nach der Wendung, die mit verzogen werden.
 */
export function windingEdges(layout, n, a, verzug) {
  const { walk, inner, outer, arcs } = layout;
  const W = Array.from({ length: n }, (_, k) => walk.at(k * a));
  const ti = W.map((w) => inner.closest(w));
  // Verziehungszonen: Wendung ± verzug Auftritte, überlappende zusammengefasst
  const zones = [];
  for (const [s0, s1] of arcs) {
    const z = [s0 - verzug * a, s1 + verzug * a];
    if (zones.length && z[0] <= zones[zones.length - 1][1]) zones[zones.length - 1][1] = z[1]; else zones.push(z);
  }
  let verzogen = 0;
  for (const [z0, z1] of zones) {
    let k0 = 0, k1 = n - 1;
    for (let k = 0; k < n; k++) { if (k * a <= z0 + 1e-6) k0 = k; if (k * a >= z1 - 1e-6) { k1 = k; break; } }
    for (let k = k0 + 1; k < k1; k++) { ti[k] = ti[k0] + ((ti[k1] - ti[k0]) * (k - k0)) / (k1 - k0); verzogen++; }
  }
  const to = W.map((w, k) => {
    const I = inner.at(ti[k]), v = sub(w, I);
    const t = len(v) > 1e-6 ? outer.hit(w, nrm(v)) : null;
    // Kante genau durch die innere Ecke: Richtung von der Ecke zum Lauflinienpunkt; Notfall: nächster Punkt außen
    return t ?? outer.closest(w);
  });
  return { W, ti, to, verzogen };
}

/** Bauplan der gewendelten Treppe; p wie im Treppen-Generator (aufgelöst), n Steigungen, s Steigung, a Auftritt */
export function windingPlan(p, { n, s, a, issues }) {
  const B = p.width, tt = p.treadT, T = p.wangeT, u = p.nosing || 0, H = p.height;
  if (!(T > 0 && p.wangeH > 0)) throw fieldError("Wangenhöhe und -dicke angeben", "wangeH");
  const U = p.form === "Uw";
  const n1 = p.n1 > 0 ? Math.round(p.n1) : Math.round(n / 2);
  if (!(n1 >= 1 && n1 < n)) throw fieldError(`Steigungen bis zur Wendelung zwischen 1 und ${n - 1}`, "n1");
  if (U && !(p.gap >= 2 * T + 10)) throw fieldError(`Treppenauge mindestens ${Math.ceil(2 * T + 10)} mm (zwei Wangen)`, "gap");
  if (B > 1000 + 1e-6) issues.push({ key: "width", level: "Hinweis", message: "Laufbreite über 1 m: Lauflinie nach DIN 18065 nicht mehr in der Mitte – hier trotzdem mittig gerechnet" });
  const Lw = (n - 1) * a, sMid = (n1 - 0.5) * a;
  const lay = windingLayout({ form: p.form, B, Lw, sMid, gap: p.gap });
  const verzug = Math.max(0, Math.round(p.verzug ?? 3));
  const ed = windingEdges(lay, n, a, verzug);
  const { inner, outer } = lay;
  // DIN 18065: Auftritt an der schmalsten Stelle (innere Wange) ≥ 50 mm; Kanten dürfen sich außen nicht kreuzen
  let minIn = Infinity;
  for (let k = 0; k + 1 < n; k++) minIn = Math.min(minIn, ed.ti[k + 1] - ed.ti[k]);
  if (minIn < 50 - 1e-6) issues.push({ key: "verzug", level: "Warnung", message: `Auftritt an der inneren Wange nur ${fmt(minIn)} mm (DIN 18065: ≥ 50 mm) – mehr Stufen verziehen` });
  else if (minIn < 100 - 1e-6) issues.push({ key: "verzug", level: "Hinweis", message: `Schmalster Auftritt an der inneren Wange ${fmt(minIn)} mm – bequemer ab 100 mm (mehr Stufen verziehen)` });
  for (let k = 0; k + 1 < n; k++) if (!(ed.to[k + 1] > ed.to[k] + 1)) throw fieldError("Stufenkanten kreuzen sich außen – weniger Stufen verziehen oder Laufbreite prüfen", "verzug");
  const members = [], plates = [], chains = [], drills = [], norms = [], tubes = [];
  // Stufen: Vieleck zwischen Kante k und k + 1 (Ecken der Wangen dazwischen), Vorderkante um u nach vorn
  const cornersBetween = (pl, t0, t1) => pl.cum.map((c, i) => [c, pl.pts[i]]).filter(([c]) => c > t0 + 1e-6 && c < t1 - 1e-6).map(([, q]) => q);
  for (let k = 0; k + 1 < n; k++) {
    const i0 = Math.max(0, ed.ti[k] - u), o0 = Math.max(0, ed.to[k] - u), i1 = ed.ti[k + 1], o1 = ed.to[k + 1];
    const poly = [inner.at(i0), outer.at(o0), ...cornersBetween(outer, o0, o1), outer.at(o1), inner.at(i1), ...cornersBetween(inner, i0, i1).reverse()];
    const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]);
    plates.push({ center: [0, 0, (k + 1) * s - tt], xDir: [1, 0, 0], normal: [0, 0, 1], poly, W: Math.max(...xs) - Math.min(...xs), H: Math.max(...ys) - Math.min(...ys), t: tt, name: `Stufe ${k + 1}`, tread: p.tread, ...(k > 0 && Math.abs((ed.ti[k + 1] - ed.ti[k]) - a) > 5 ? { verzogen: true } : {}) });
  }
  // Wangen: Ober- und Unterkante stückweise linear über den Stufenkanten der jeweiligen Wange (abgewickelt), Höhe aus
  // der Wangenhöhe senkrecht zur mittleren Neigung; unten waagrecht am Boden, oben senkrecht an der Deckenstirn
  const cosA = Math.cos(Math.atan(s / a)), extra = Math.max(40, (p.wangeH / cosA - s - tt) / 2);
  const wange = (pl, ts, side, label) => {
    const top = pl1(ts.map((t, k) => [t, (k + 1) * s + extra]));
    const bot = pl1(ts.slice(1).map((t, k) => [t, (k + 1) * s - tt - extra]));
    const tEnd = ts[ts.length - 1];
    // Wangenstücke je gerader Strecke; innen endet das vorige Stück um T vor der Ecke, außen läuft es um T darüber
    const segs = [];
    for (let i = 0; i + 1 < pl.pts.length; i++) {
      let ta = pl.cum[i], tb = Math.min(pl.cum[i + 1], tEnd);
      if (tb <= ta + 1e-6) continue;
      const last = i + 2 >= pl.pts.length || pl.cum[i + 1] >= tEnd - 1e-6;
      if (!last) tb += side === "innen" ? -T : T;
      segs.push({ i, ta, tb, ext: !last && side === "aussen" ? T : 0 });
    }
    segs.forEach((sg, j) => {
      const A = pl.pts[sg.i], d = nrm(sub(pl.pts[sg.i + 1], A));
      // Kanten-Stützstellen im Stück
      const brk = [sg.ta, ...ts.filter((t) => t > sg.ta + 1e-6 && t < sg.tb - 1e-6), sg.tb];
      const zb = (t) => Math.max(0, bot(t));
      // Boden: Knick der Unterkante bei z = 0
      const bpts = [];
      for (let m = 0; m < brk.length; m++) {
        if (m > 0) {
          const t0 = brk[m - 1], t1 = brk[m], z0 = bot(t0), z1 = bot(t1);
          if ((z0 < 0) !== (z1 < 0)) bpts.push(t0 + ((t1 - t0) * (0 - z0)) / (z1 - z0));
        }
        bpts.push(brk[m]);
      }
      const lower = bpts.map((t) => [t, zb(t)]), upper = brk.map((t) => [t, top(t)]).reverse();
      const outline = [...lower, ...upper];
      // Plattenlage: x entlang der Wange, y = z nach oben, Normale nach außen (von den Stufen weg)
      const left = [-d[1], d[0]];
      const outN = side === "innen" ? left : [d[1], -d[0]]; // Wendung links: Stufen rechts der inneren, links der äußeren Wange
      // y = normal × x muss +z sein: bei Normale links der Richtung die Richtung umkehren
      const flip = cross(d, outN) > 0; // outN links von d
      const xDir = flip ? mul(d, -1) : d;
      const origin = flip ? add(A, mul(d, sg.tb - pl.cum[sg.i])) : add(A, mul(d, sg.ta - pl.cum[sg.i]));
      const poly = outline.map(([t, z]) => [flip ? sg.tb - t : t - sg.ta, z]);
      const xs = poly.map((q) => q[0]), zs = poly.map((q) => q[1]);
      plates.push({ center: [origin[0], origin[1], 0], xDir: [xDir[0], xDir[1], 0], normal: [outN[0], outN[1], 0], poly, W: Math.max(...xs) - Math.min(...xs), H: Math.max(...zs) - Math.min(...zs), t: T, name: `Wange ${label}${segs.length > 1 ? " " + (j + 1) : ""}`, vertical: true });
    });
  };
  wange(inner, ed.ti, "innen", "innen");
  wange(outer, ed.to, "aussen", "außen");
  // Geländer: entlang der Wangen, Pfosten außen neben der Wange (anliegend), Lauflinie auf Höhe der Stufenvorderkanten
  const right = p.turn === "rechts";
  const want = { links: [right ? "aussen" : "innen"], rechts: [right ? "innen" : "aussen"], beide: ["aussen", "innen"], keine: [] }[p.gel] || [];
  let rail = null;
  if (want.length) {
    const post = p.gelPost, off = T + post.geom.width / 2;
    if (!(p.gelH > 300)) throw fieldError("Geländerhöhe zu klein", "gelH");
    if (!(p.gelPostMax > post.geom.width)) throw fieldError("Pfostenabstand zu klein", "gelPostMax");
    const o = { H: p.gelH, post, postMax: p.gelPostMax, postDown: p.gelDown, rail: p.gelRail, fill: p.gelFill, bar: p.gelBar, bars: p.gelBars, gap: p.gelGap, belt: p.gelBelt, bottomZ: 100, holder: p.gelHolder !== "keine", holderGap: p.gelHolderGap, holderD: p.gelHolderD,
      railBend: p.gelRailBend === "bogen" ? p.gelRailR : 0, through: false, allow: 0, beltMax: p.gelBeltMax, stab: p.gelStab, keys: { bar: "gelBar", belt: "gelBelt", stab: "gelStab", beltMax: "gelBeltMax" } };
    rail = { chains: [], members: [], plates: [], drills: [], tubes: [], posts: 0, bars: 0, gapMax: 0, sides: [] };
    for (const side of want) {
      const pl = side === "innen" ? inner : outer, ts = side === "innen" ? ed.ti : ed.to;
      if (side === "innen" && U && !(p.gap >= 2 * off + 2 * p.gelRail.geom.width)) { issues.push({ key: "gap", level: "Hinweis", message: `Treppenauge zu schmal für ein Geländer innen (mindestens ${Math.ceil(2 * off + 2 * p.gelRail.geom.width)} mm) – nur außen erzeugt` }); continue; }
      const nose = pl1(ts.map((t, k) => [t, (k + 1) * s])); // Stufenvorderkante; letzte Kante = Deckenoberkante H
      // versetzte Linie (nach außen um off), Ecken auf der Winkelhalbierenden
      const sideSign = side === "innen" ? 1 : -1; // innen: links der Wangenrichtung; außen: rechts
      const offAt = (t) => { const i = pl.seg(t), d = nrm(sub(pl.pts[i + 1], pl.pts[i])); return add(pl.at(t), mul([-d[1] * sideSign, d[0] * sideSign], off)); };
      const cornerOff = (i) => {
        const d1 = nrm(sub(pl.pts[i], pl.pts[i - 1])), d2 = nrm(sub(pl.pts[i + 1], pl.pts[i]));
        const n1v = [-d1[1] * sideSign, d1[0] * sideSign], n2v = [-d2[1] * sideSign, d2[0] * sideSign], m = nrm(add(n1v, n2v));
        return add(pl.pts[i], mul(m, off / Math.max(0.2, dot(m, n1v))));
      };
      // Stützstellen: Anfang, Ende, Wangenecken; dazwischen so viele Stufenkanten, dass die Höhe ≤ 25 mm abweicht
      const t0 = ts[0] + post.geom.height / 2 + 30, tE = ts[ts.length - 1] - post.geom.height / 2 - 10;
      const keys = [t0, ...pl.cum.slice(1, -1).filter((c) => c > t0 && c < tE), tE];
      const cand = ts.filter((t) => t > t0 && t < tE);
      const knots = [...keys];
      for (let it = 0; it < 40; it++) {
        knots.sort((x, y) => x - y);
        let worst = null;
        for (const t of cand) {
          const j = knots.findIndex((k) => k >= t); if (j <= 0) continue;
          const ka = knots[j - 1], kb = knots[j], z = nose(ka) + ((nose(kb) - nose(ka)) * (t - ka)) / (kb - ka || 1), dev = Math.abs(z - nose(t));
          if (dev > 25 && (!worst || dev > worst.dev)) worst = { t, dev };
        }
        if (!worst) break;
        knots.push(worst.t);
      }
      knots.sort((x, y) => x - y);
      const path = [];
      for (const t of knots) {
        const ci = pl.cum.findIndex((c, i) => i > 0 && i < pl.pts.length - 1 && Math.abs(c - t) < 1e-6);
        const q = ci > 0 ? cornerOff(ci) : offAt(t);
        path.push([q[0], q[1], nose(t)]);
      }
      const name = side === "innen" ? "Geländer innen" : "Geländer außen";
      const r = railAlong(path, o, name);
      rail.chains.push(...r.chains); rail.members.push(...r.members); rail.plates.push(...r.plates); rail.drills.push(...r.drills); rail.tubes.push(...(r.tubes || []));
      rail.posts += r.posts; rail.bars += r.bars; rail.gapMax = Math.max(rail.gapMax, r.gapMax); rail.sides.push(side === "innen" ? "innen" : "außen");
    }
    chains.push(...rail.chains); members.push(...rail.members); plates.push(...rail.plates); drills.push(...rail.drills); tubes.push(...rail.tubes);
    issues.push(...railingIssues({ use: p.gelUse, fall: H, height: p.gelH, fill: p.gelFill, gap: rail.gapMax, bottom: 0, open: p.gelH - p.gelRail.geom.height, rail: p.gelRail },
      { height: "gelH", fill: "gelFill", gap: p.gelFill === "quer" ? "gelBars" : "gelGap", rail: "gelRail", use: "gelUse" }));
  }
  const plan = { chains, members, plates, drills, norms, tubes, issues };
  if (right) mirrorY(plan);
  const step = 2 * s + a;
  plan.info = `${n} Steigungen à ${fmt(s)} mm, Auftritt ${fmt(a)} mm auf der Lauflinie (Mitte), 2s + a = ${Math.round(step)} mm, ${U ? "halbgewendelt" : "viertelgewendelt"} nach ${right ? "rechts" : "links"}, ${ed.verzogen} verzogene Stufen, schmalster Auftritt innen ${fmt(minIn)} mm` +
    (U ? `, Treppenauge ${fmt(p.gap)} mm` : "") + `, Wangen Flachstahl ${fmt(p.wangeH)} × ${fmt(T)} (abgewickelt, Ober-/Unterkante folgen den Stufen)` + (rail ? `, Geländer ${rail.sides.join(" und ")}: ${rail.posts} Pfosten` : "");
  plan.winding = { edges: ed, layout: { X1: lay.X1, L2: lay.L2 } };
  return plan;
}

/** an y = 0 spiegeln (Wendung nach rechts) */
function mirrorY(plan) {
  const m = (v) => [v[0], -v[1], v[2]];
  for (const c of plan.chains) { c.points = c.points.map(m); if (c.up) c.up = m(c.up); }
  for (const x of plan.members) {
    x.a = m(x.a); x.b = m(x.b); if (x.up) x.up = m(x.up);
    if (x.cuts) x.cuts = { start: x.cuts.start.map((c) => ({ p: m(c.p), n: m(c.n) })), end: x.cuts.end.map((c) => ({ p: m(c.p), n: m(c.n) })) };
    if (x.copes) x.copes = x.copes.map((c) => (c.path ? c : { ...c, a: m(c.a), b: m(c.b), up: c.up ? m(c.up) : c.up }));
  }
  for (const t of plan.tubes) t.path = { ...t.path, c: m(t.path.c), axis: m(t.path.axis || [0, 0, 1]).map((v) => -v), x0: m(t.path.x0 || [1, 0, 0]), rise: -(t.path.rise || 0) };
  for (const d of plan.drills) { d.p = m(d.p); d.dir = m(d.dir); if (d.xDir) d.xDir = m(d.xDir); }
  // Platte: Mittelpunkt, Richtung und Normale spiegeln; dabei kehrt die lokale y-Achse (Normale × x) um → y negieren
  const flipY = (list) => list && list.map(([a, b, ...r]) => [a, -b, ...r]);
  for (const pl of plan.plates) {
    pl.center = m(pl.center); pl.xDir = m(pl.xDir); pl.normal = m(pl.normal);
    if (pl.poly) pl.poly = flipY(pl.poly).reverse();
    for (const k of ["holes", "slots", "rects"]) if (pl[k]) pl[k] = flipY(pl[k]);
  }
}
