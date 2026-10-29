// Treppengeländer: Geländer entlang einer Lauflinie mit schrägen (Treppenlauf) und waagrechten Abschnitten (Podest,
// Auslauf oben). Pfosten senkrecht, seitlich an Wange bzw. Stufe befestigt; Handlauf in festem Abstand über der
// Lauflinie, an den Knicken gegehrt; Füllung aus Knieleisten (parallel zum Handlauf) oder senkrechten Staketen mit
// Untergurt. Reine Rechnung; Bauplan-Format siehe generator.js. Genutzt vom Treppen-Generator.
//
// path: Punkte [x, y, z] der Lauflinie auf Höhe Stufenvorderkante bzw. Podest-Oberkante; jeder Abschnitt ist gerade.
// o: { H, post, postMax, postDown, rail, fill ("quer" | "staketen" | "keine"), bar, bars, gap, belt, bottomZ,
//      holder, holderGap, holderD, through, allow, beltMax, stab, keys } – mit holder endet der Pfosten unter dem Handlauf,
//      Stift + Bohrung (handlaufhalter.js); mit through gehen Knieleisten bzw. Untergurt durch die Pfosten (Durchbruch
//      mit Aufmaß allow), die Staketen (Profil stab) durch Bohrungen in der oberen Wand des Untergurts; Stück bis beltMax, Stoß im Pfosten.
//      keys: Feldschlüssel für Fehlermeldungen { bar, belt, stab, beltMax }.
//      stations(seg { A, L, d, slope }): Zwischenstellen der Pfosten entlang des Abschnitts (ohne die Enden) oder null.
//      mount({ name, top, base (Punkt der Lauflinie), along }): Pfostenbefestigung (pfostenbefestigung.js) – liefert Pfostenfuß a, Schnitt, Platte,
//      Bohrungen, Meldungen; ohne mount steht der Pfosten wie bisher postDown unter der Lauflinie.

import { holderDrop, holderParts, innerReach, entryDepth } from "./handlaufhalter.js";
import { fieldError } from "./generror.js";
import { bentChain } from "./biegeteil.js";

const ROUND = new Set(["rohr", "rund"]);
/** Bohrung für ein Profil (rund: Ø, sonst Rechteck quer zur Richtung, w entlang xDir) mit Aufmaß */
const holeFor = (sec, allow, xDir) => (ROUND.has(sec.kind) ? { d: sec.geom.width + allow } : { w: sec.geom.width + allow, h: sec.geom.height + allow, xDir });

/** Hüllkörper eines geraden Rohrstücks um den Punkt q entlang dir (± len) zum Ausklinken (Stab an Handlauf/Gurt angepasst) */
const copeAt = (section, q, dir, len = 40) => ({ section, a: q.map((x, k) => x - dir[k] * len), b: q.map((x, k) => x + dir[k] * len), up: [0, 0, 1] });

/**
 * Lauflinie eines Abschnitts samt geraden Nachbarn: ein Knickpfosten (Lauf → Auslauf bzw. Podest), den die Befestigung
 * in den Nachbarabschnitt gerückt hat, steht bei s < 0 bzw. s > L auf dessen Linie; der Knick der Füllung liegt dann wie
 * beim Handlauf zwischen den Pfosten. parts zerlegt ein Stück s0 … s1 dort in gerade Teile mit Gehrung. Liegt der Knick
 * noch im Pfosten (bis tol, halbe Pfostenbreite), bleibt es beim Knick im Pfosten.
 */
function lineOf(segs, si, tol) {
  const sg = segs[si], prev = segs[si - 1], next = segs[si + 1];
  const pick = (s) => (s < -tol && prev ? [prev, prev.L + s] : s > sg.L + tol && next ? [next, s - sg.L] : [sg, s]);
  const at = (s, h) => { const [g, t] = pick(s); return [g.A[0] + g.d[0] * t, g.A[1] + g.d[1] * t, g.A[2] + g.slope * t + h]; };
  const slopeAt = (s) => pick(s)[0].slope;
  const dirAt = (s) => { const g = pick(s)[0], k = Math.hypot(1, g.slope); return [g.d[0] / k, g.d[1] / k, g.slope / k]; };
  const parts = (s0, s1, h) => {
    const ks = [0, sg.L].filter((t) => s0 < t - tol && t + tol < s1), bs = [s0, ...ks, s1];
    return bs.slice(1).map((b, i) => {
      const a = bs[i], miter = (t) => { const u = dirAt(t - 1), v = dirAt(t + 1), w = u.map((x, k) => x + v[k]), l = Math.hypot(...w); return w.map((x) => x / l); };
      return { s0: a, s1: b, start: i > 0 ? { p: at(a, h), n: miter(a).map((x) => -x) } : null, end: i + 1 < bs.length - 1 ? { p: at(b, h), n: miter(b) } : null };
    });
  };
  return { at, slopeAt, dirAt, parts };
}

/** Bauplan-Teile eines Geländerzugs; label steht vor allen Namen (z. B. »Geländer links«) */
export function railAlong(path, o, label) {
  const members = [], chains = [], plates = [], drills = [], tubes = [];
  const pts = path.filter((q, i) => i === 0 || Math.hypot(q[0] - path[i - 1][0], q[1] - path[i - 1][1], q[2] - path[i - 1][2]) > 1e-6);
  if (pts.length < 2) return { members, chains, plates, drills, tubes, posts: 0, fields: 0, bars: 0, gapMax: 0, mounted: [] };
  const railH = o.rail.geom.height, postW = o.post.geom.width, half = o.post.geom.height / 2;
  const segs = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const A = pts[i], B = pts[i + 1], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (L < 1e-6) throw new Error(`${label}: senkrechter Abschnitt in der Lauflinie`);
    segs.push({ A, L, d: [(B[0] - A[0]) / L, (B[1] - A[1]) / L], slope: (B[2] - A[2]) / L });
  }
  // Pfostenstellen je Abschnitt (Abstand entlang des Handlaufs ≤ postMax, auf schrägen Läufen also die wahre Länge),
  // Knicke nur einmal; zu dicht stehende entfallen
  const posts = [];
  for (const [i, sg] of segs.entries()) {
    const n = Math.max(1, Math.ceil((sg.L * Math.hypot(1, sg.slope)) / o.postMax - 1e-9));
    // o.stations: feste Zwischenstellen (z. B. im Stufenrhythmus), sonst gleichmäßig geteilt
    const st = o.stations?.(sg), tk = st ? [0, ...st, sg.L] : Array.from({ length: n + 1 }, (_, k) => (sg.L * k) / n), last = tk.length - 1;
    sg.ts = []; sg.ps = []; // Stelle entlang des Abschnitts und Index des Pfostens dort
    for (let k = 0; k <= last; k++) {
      const t = tk[k];
      const q = [sg.A[0] + sg.d[0] * t, sg.A[1] + sg.d[1] * t, sg.A[2] + sg.slope * t];
      const prev = posts[posts.length - 1];
      if (k === 0 && i > 0) { sg.ts.push(t); sg.ps.push(posts.length - 1); continue; } // Knick: Pfosten steht schon (Ende des vorigen Abschnitts)
      if (prev && Math.hypot(q[0] - prev.q[0], q[1] - prev.q[1]) < postW + 1) { if (k === last) prev.q = q; continue; }
      posts.push({ q, d: sg.d, slope: sg.slope });
      sg.ts.push(t); sg.ps.push(posts.length - 1);
    }
    if (sg.ts[sg.ts.length - 1] < sg.L - 1e-6) { sg.ts.push(sg.L); sg.ps.push(posts.length - 1); }
  }
  const drop = holderDrop(!!o.holder, o.post, o.holderGap);
  // Pfosten an Enden und Knicken der Lauflinie mit Befestigung: so weit zurück in ihren Abschnitt, dass die Platte mittig
  // zum Pfosten ganz auf dem Bauteil liegt (o.mountFit liefert den Weg entlang der Laufrichtung); Stationen der
  // angrenzenden Abschnitte gehen mit (waagrechter Abstand ab Abschnittsanfang)
  const movedEnds = new Set();
  if (o.mountFit && posts.length > 1) {
    posts.forEach((p, i) => {
      const where = segs.flatMap((sg) => sg.ps.map((pi, k) => (pi === i ? { sg, k } : null)).filter(Boolean));
      const own = where.find(({ sg, k }) => (k === 0 || k === sg.ps.length - 1) && sg.d[0] === p.d[0] && sg.d[1] === p.d[1]);
      // Pfosten mitten im Abschnitt (z. B. auf einer Stufe der Holmtreppe): in beide Richtungen, höchstens ⅓ der Nachbarfelder
      const mid = where.length === 1 && where[0].k > 0 && where[0].k < where[0].sg.ps.length - 1 ? where[0] : null;
      if (!mid && (!own || (where.length < 2 && i !== 0 && i !== posts.length - 1))) return;
      if (where.some(({ sg }) => Math.abs(sg.d[0] * p.d[0] + sg.d[1] * p.d[1]) < 0.999)) return; // Ecke: bleibt stehen
      const top = [p.q[0], p.q[1], p.q[2] + o.H - railH - drop];
      const dt = o.mountFit({ name: `${label} Pfosten ${i + 1}`, top, base: p.q, along: [p.d[0], p.d[1], 0], inward: mid ? 0 : own.k === 0 ? 1 : -1, slope: p.slope });
      if (!dt) return;
      if (mid) {
        if (!(Math.abs(dt) < Math.min(mid.sg.ts[mid.k] - mid.sg.ts[mid.k - 1], mid.sg.ts[mid.k + 1] - mid.sg.ts[mid.k]) / 3)) return;
      } else {
        const back = own.k === 0 ? dt > 0 : dt < 0, field = own.k === 0 ? own.sg.ts[1] - own.sg.ts[0] : own.sg.ts[own.k] - own.sg.ts[own.k - 1];
        if (!back || !(Math.abs(dt) < field / 3)) return;
      }
      p.q = [p.q[0] + p.d[0] * dt, p.q[1] + p.d[1] * dt, p.q[2] + p.slope * dt];
      for (const { sg, k } of where) sg.ts[k] = (p.q[0] - sg.A[0]) * sg.d[0] + (p.q[1] - sg.A[1]) * sg.d[1];
      movedEnds.add(i);
    });
  }
  // Krümmlinge (N2): Bogen mit Radius o.railBend an jedem Knick; wo er weiter als 5 mm an der Ecke vorbeiläuft
  // (Podestecke im Grundriss), bekommt der Pfosten dort keinen Halter
  const bend = o.railBend > 0 && ROUND.has(o.rail.kind) ? o.railBend : 0;
  const offCorner = (q) => {
    if (!bend) return false;
    const j = pts.findIndex((c, k) => k > 0 && k < pts.length - 1 && Math.hypot(c[0] - q[0], c[1] - q[1]) < 1);
    if (j < 0) return false;
    const u = (a, b) => { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d); return d.map((x) => x / l); };
    const d1 = u(pts[j - 1], pts[j]), d2 = u(pts[j], pts[j + 1]), th = Math.acos(Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2])));
    return bend * (1 / Math.cos(th / 2) - 1) > 5;
  };
  let freeCorners = 0;
  const mounted = [];
  posts.forEach((p, i) => {
    const top = [p.q[0], p.q[1], p.q[2] + o.H - railH - drop], name = `${label} Pfosten ${i + 1}`;
    const r = o.mount ? o.mount({ name, top, base: p.q, along: [p.d[0], p.d[1], 0] }) : null; // null: ohne Befestigung
    if (r) {
      if (movedEnds.has(i)) r.moved = true;
      members.push({ section: o.post, a: r.a, b: top, name, up: [p.d[0], p.d[1], 0], ...(r.cuts ? { cuts: r.cuts } : {}) });
      plates.push(r.plate, ...(r.parts || [])); drills.push(...r.drills); mounted.push(r);
    } else members.push({ section: o.post, a: [p.q[0], p.q[1], p.q[2] - o.postDown], b: top, name, up: [p.d[0], p.d[1], 0] });
    if (!o.holder) return;
    if (offCorner(p.q)) { freeCorners++; return; }
    const hp = holderParts({ q: top, along: p.d, axisZ: p.q[2] + o.H - railH / 2, post: o.post, railH, d: o.holderD, slope: p.slope, name: `${label} Pfosten ${i + 1}`, target: `${label} Handlauf` });
    members.push(...hp.members); plates.push(...hp.plates); drills.push(...hp.drills);
  });
  // Handlauf; mit Haltern an beiden Enden 50 mm über den Endpfosten hinaus, damit die Bohrung ganz im Rohr liegt
  const rp = pts.map((q) => [q[0], q[1], q[2] + o.H - railH / 2]);
  if (o.holder) {
    const ext = (i, j) => { const d = [rp[i][0] - rp[j][0], rp[i][1] - rp[j][1], rp[i][2] - rp[j][2]], l = Math.hypot(...d) || 1; rp[i] = rp[i].map((x, k) => x + (d[k] / l) * 50); };
    ext(0, 1); ext(rp.length - 1, rp.length - 2);
  }
  if (bend) {
    const bc = bentChain({ section: o.rail, points: rp, name: `${label} Handlauf`, radius: bend });
    members.push(...bc.members); tubes.push(...bc.tubes);
  } else chains.push({ section: o.rail, points: rp, name: `${label} Handlauf` });
  // Felder zwischen den Pfosten eines Abschnitts
  let fields = 0, bars = 0, gapMax = 0;
  const top = o.H - railH;
  if (o.through && (o.fill === "quer" || o.fill === "staketen")) {
    const r = through(segs, o, label, { top, half, railAxis: o.H - railH / 2, postName: (i) => `${label} Pfosten ${i + 1}` });
    members.push(...r.members); drills.push(...r.drills);
    return { members, chains, plates, drills, tubes, freeCorners, posts: posts.length, fields: r.fields, bars: r.bars, gapMax: r.gapMax, pieces: r.pieces, mounted };
  }
  for (const [si, sg] of segs.entries()) {
    const { at, slopeAt, dirAt, parts } = lineOf(segs, si, half);
    const out = [sg.d[0], sg.d[1], 0], back = [-sg.d[0], -sg.d[1], 0];
    // Stück von Pfosten zu Pfosten, an den Pfosten senkrecht geschnitten; über einen Knick zwischen den Pfosten in Teilen
    const piece = (section, s0, s1, h, name, extra = () => ({})) => {
      const ps = parts(s0, s1, h);
      ps.forEach((q, i) => {
        const a = at(q.s0, h), b = at(q.s1, h);
        members.push({ section, a, b, name: ps.length > 1 ? `${name}-${i + 1}` : name, ...(ps.length > 1 ? { target: name } : {}),
          cuts: { start: [q.start || { p: a, n: back }], end: [q.end || { p: b, n: out }] }, ...extra(slopeAt((q.s0 + q.s1) / 2)) });
      });
    };
    for (let k = 0; k + 1 < sg.ts.length; k++) {
      const s0 = sg.ts[k] + half, s1 = sg.ts[k + 1] - half;
      if (s1 - s0 < 20) continue;
      fields++;
      const n = fields;
      if (o.fill === "quer") {
        // Knieleisten gleichmäßig zwischen Lauflinie und Handlauf; schräg an den Pfosten senkrecht geschnitten
        const m = Math.max(1, Math.round(o.bars));
        for (let j = 1; j <= m; j++) {
          // steiler als der Kopfschwenk des Lasers (gewendelte Treppe innen): gesägt, ebener Schnitt
          piece(o.bar, s0, s1, (top * j) / (m + 1), `${label} Knieleiste ${n}.${j}`, (sl) => (Math.abs(sl) > Math.tan(40 * Math.PI / 180) ? { plain: true } : {}));
        }
        bars += m;
        gapMax = Math.max(gapMax, top / (m + 1));
      } else if (o.fill === "staketen") {
        const beltH = o.belt.geom.height, lo = o.bottomZ + beltH / 2;
        if (!(top - lo > 100)) throw new Error(`${label}: kein Platz für Staketen – Höhe oder Untergurt prüfen`);
        piece(o.belt, s0, s1, o.bottomZ, `${label} Untergurt ${n}`);
        const bw = o.bar.geom.height, clear = s1 - s0;
        const m = Math.max(0, Math.ceil((clear - o.gap) / (bw + o.gap) - 1e-9));
        const gap = (clear - m * bw) / (m + 1);
        gapMax = Math.max(gapMax, gap, o.bottomZ - beltH / 2);
        for (let j = 0; j < m; j++) {
          const s = s0 + gap * (j + 1) + bw * j + bw / 2;
          // Stab von der Gurtachse bis zur Handlaufachse, an Gurt und Handlauf ausgeklinkt (Sattel, voll anliegend)
          members.push({ section: o.bar, a: at(s, o.bottomZ), b: at(s, o.H - railH / 2), name: `${label} Stab ${n}.${j + 1}`, up: out,
            copes: [copeAt(o.belt, at(s, o.bottomZ), dirAt(s)), copeAt(o.rail, at(s, o.H - railH / 2), dirAt(s))] });
        }
        bars += m;
      }
    }
  }
  return { members, chains, plates, drills, tubes, freeCorners, posts: posts.length, fields, bars, gapMax, mounted };
}

/**
 * Knieleisten bzw. Untergurt durch die Pfosten gesteckt: je Abschnitt Stücke von Pfosten zu Pfosten bis o.beltMax
 * (Stoß in der Pfostenmitte), Durchbrüche in den Pfosten (durchgehend dazwischen, einseitig an den Stückenden);
 * Staketen durch senkrechte Bohrungen im Untergurt. Bohrungen mit Aufmaß o.allow.
 */
function through(segs, o, label, { top, half, railAxis, postName }) {
  const members = [], drills = [], keys = o.keys || {}, allow = o.allow || 0;
  const rail = o.fill === "quer" ? o.bar : o.belt; // was durch die Pfosten geht
  const pw = Math.min(o.post.geom.width, o.post.geom.height);
  if (!(Math.max(rail.geom.width, rail.geom.height) + allow < pw - 2)) throw fieldError(`${o.fill === "quer" ? "Knieleiste" : "Untergurt"} ${Math.round(Math.max(rail.geom.width, rail.geom.height))} mm passt nicht durch den Pfosten (${Math.round(pw)} mm) – kleineres Profil oder größeren Pfosten wählen`, o.fill === "quer" ? keys.bar : keys.belt);
  const stab = o.stab || o.bar;
  if (o.fill === "staketen" && !(Math.max(stab.geom.width, stab.geom.height) + allow < Math.min(rail.geom.width, rail.geom.height) - 2)) throw fieldError("Stab passt nicht durch den Untergurt – kleineren Stab oder größeren Gurt wählen", keys.stab);
  let fields = 0, bars = 0, gapMax = 0, pieces = 0, fno = 0;
  const dirOf = (sg) => { const k = Math.hypot(1, sg.slope); return [sg.d[0] / k, sg.d[1] / k, sg.slope / k]; };
  const unit = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
  for (const [si, sg] of segs.entries()) {
    const { at, slopeAt, dirAt, parts } = lineOf(segs, si, half);
    const k3 = Math.hypot(1, sg.slope), dir = [sg.d[0] / k3, sg.d[1] / k3, sg.slope / k3], xDir = [-sg.d[1], sg.d[0], 0];
    // Gehrung am Knick der Lauflinie (Lauf → Podest/Auslauf): Stücke enden auf der Winkelhalbierenden
    const prev = si > 0 ? dirOf(segs[si - 1]) : null, next = si + 1 < segs.length ? dirOf(segs[si + 1]) : null;
    const ts = sg.ts;
    // nur wenn der Knickpfosten auf dem Knick steht (sonst knickt das Stück zwischen den Pfosten, siehe lineOf)
    const miterStart = prev && Math.abs(ts[0]) <= half && Math.hypot(...prev.map((x, k) => x - dir[k])) > 1e-6 ? unit(prev.map((x, k) => -(x + dir[k]))) : null;
    const miterEnd = next && Math.abs(ts[ts.length - 1] - sg.L) <= half && Math.hypot(...next.map((x, k) => x - dir[k])) > 1e-6 ? unit(next.map((x, k) => x + dir[k])) : null;
    fields += ts.length - 1;
    const hs = o.fill === "quer" ? Array.from({ length: Math.max(1, Math.round(o.bars)) }, (_, j) => (top * (j + 1)) / (Math.max(1, Math.round(o.bars)) + 1)) : [o.bottomZ];
    if (o.fill === "quer") gapMax = Math.max(gapMax, top / (hs.length + 1));
    // Stücke bis beltMax (wahre Länge)
    for (let from = 0; from < ts.length - 1;) {
      let to = from + 1;
      while (to + 1 < ts.length && (ts[to + 1] - ts[from]) * k3 <= o.beltMax + 1e-6) to++;
      if ((ts[to] - ts[from]) * k3 > o.beltMax + 1e-6) throw fieldError(`Pfostenabstand größer als Gurt am Stück (${Math.round(o.beltMax)} mm)`, keys.beltMax);
      pieces++;
      hs.forEach((h, j) => {
        const name = o.fill === "quer" ? `${label} Knieleiste ${pieces}.${j + 1}` : `${label} Untergurt ${pieces}`;
        const ps = parts(ts[from], ts[to], h);
        ps.forEach((q, i) => {
          const a = at(q.s0, h), b = at(q.s1, h);
          const cuts = { start: q.start ? [q.start] : i === 0 && from === 0 && miterStart ? [{ p: a, n: miterStart }] : [], end: q.end ? [q.end] : i === ps.length - 1 && to === ts.length - 1 && miterEnd ? [{ p: b, n: miterEnd }] : [] };
          members.push({ section: rail, a, b, name: ps.length > 1 ? `${name}-${i + 1}` : name, ...(ps.length > 1 ? { target: name } : {}), ...(ROUND.has(rail.kind) ? {} : { up: [0, 0, 1] }), ...(cuts.start.length || cuts.end.length ? { cuts } : {}) });
        });
        const hole = holeFor(rail, allow, xDir);
        for (let k = from; k <= to; k++) {
          const target = postName(sg.ps[k]), dk = dirAt(ts[k]), kk = Math.hypot(1, slopeAt(ts[k]));
          // schräger Durchbruch: um den Versatz der Bohrungskante (r · Neigung) länger, damit er die Pfostenwand ganz trennt
          const ex = ((hole.d ?? Math.max(hole.w, hole.h)) / 2) * Math.abs(slopeAt(ts[k])) + 1;
          if (k > from && k < to) drills.push({ target, p: at(ts[k] - half - 1 - ex, h), dir: dk, len: (2 * half + 2 + 2 * ex) * kk, ...hole });
          else drills.push({ target, p: at(ts[k], h), dir: k === from ? dk : dk.map((x) => -x), len: (half + 1 + ex) * kk, ...hole });
        }
        if (o.fill !== "staketen") return;
        // Staketen je Feld dieses Stücks, durch den Gurt bis an seine Unterseite
        // Stab nur durch die obere Gurtwand, Ende innen auf der unteren Wand (Vollprofil: Sackloch bis zur Mitte)
        const sw = stab.geom.height, sh = holeFor(stab, allow, [sg.d[0], sg.d[1], 0]);
        // je Stab nach der Neigung der Lauflinie dort (Feld über einen Knick zwischen den Pfosten)
        const local = (sb) => {
          const sl = slopeAt(sb), kk = Math.hypot(1, sl), dd = dirAt(sb);
          // Stabende innen an der Gegenwand (Rohr: Krümmung berücksichtigt), Schnitt parallel zur Gurtachse
          return { sl, dd, rv: (rail.geom.height / 2) * kk, reach: innerReach(rail, rail.geom.height, stab.geom.width) * kk, nUp: [-dd[0] * sl, -dd[1] * sl, 1 / kk],
            ext: ((sh.d ?? sh.h) / 2) * Math.abs(sl) + 1, wd: entryDepth(rail, rail.geom.height, sh.d ?? sh.w) * kk };
        };
        for (let k = from; k < to; k++) {
          const s0 = ts[k] + half, s1 = ts[k + 1] - half, clear = s1 - s0;
          fno++;
          if (clear < 20) continue;
          const m = Math.max(0, Math.ceil((clear - o.gap) / (sw + o.gap) - 1e-9));
          const gap = (clear - m * sw) / (m + 1);
          gapMax = Math.max(gapMax, gap, o.bottomZ - local(s0).rv, o.bottomZ - local(s1).rv);
          for (let q = 0; q < m; q++) {
            const sb = s0 + gap * (q + 1) + sw * q + sw / 2, { sl, dd, rv, reach, nUp, ext, wd } = local(sb);
            const foot = at(sb, h - reach), cutFoot = sl ? { cuts: { start: [{ p: foot, n: nUp.map((x) => -x) }], end: [] } } : {};
            const low = sl ? at(sb, h - reach - (stab.geom.height / 2) * Math.abs(sl) - 1) : foot;
            members.push({ section: stab, a: low, b: at(sb, railAxis), name: `${label} Stab ${fno}.${q + 1}`, up: [sg.d[0], sg.d[1], 0], ...cutFoot,
              copes: [copeAt(o.rail, at(sb, railAxis), dd),
                // nah am Knick: auch das anschließende Handlaufstück (gegehrt) aussparen
                ...(next && Math.abs(sg.L - sb) < 100 ? [copeAt(o.rail, at(sg.L, railAxis), next, 100)] : []), ...(prev && Math.abs(sb) < 100 ? [copeAt(o.rail, at(0, railAxis), prev, 100)] : [])] });
            drills.push({ target: name, p: at(sb, h + rv + ext), dir: [0, 0, -1], len: wd + 2 * ext + 1, ...sh });
          }
          bars += m;
        }
      });
      if (o.fill === "quer") bars += hs.length;
      from = to;
    }
  }
  return { members, drills, fields, bars, gapMax, pieces };
}
