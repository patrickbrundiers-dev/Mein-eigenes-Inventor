// Treppengeländer: Geländer entlang einer Lauflinie mit schrägen (Treppenlauf) und waagrechten Abschnitten (Podest,
// Auslauf oben). Pfosten senkrecht, seitlich an Wange bzw. Stufe befestigt; Handlauf in festem Abstand über der
// Lauflinie, an den Knicken gegehrt; Füllung aus Knieleisten (parallel zum Handlauf) oder senkrechten Staketen mit
// Untergurt. Reine Rechnung; Bauplan-Format siehe generator.js. Genutzt vom Treppen-Generator.
//
// path: Punkte [x, y, z] der Lauflinie auf Höhe Stufenvorderkante bzw. Podest-Oberkante; jeder Abschnitt ist gerade.
// o: { H, post, postMax, postDown, rail, fill ("quer" | "staketen" | "keine"), bar, bars, gap, belt, bottomZ,
//      holder, holderGap, holderD } – mit holder endet der Pfosten unter dem Handlauf, Stift + Bohrung (handlaufhalter.js)

import { holderDrop, holderParts } from "./handlaufhalter.js";

/** Bauplan-Teile eines Geländerzugs; label steht vor allen Namen (z. B. »Geländer links«) */
export function railAlong(path, o, label) {
  const members = [], chains = [], plates = [], drills = [];
  const pts = path.filter((q, i) => i === 0 || Math.hypot(q[0] - path[i - 1][0], q[1] - path[i - 1][1], q[2] - path[i - 1][2]) > 1e-6);
  if (pts.length < 2) return { members, chains, plates, drills, posts: 0, fields: 0, bars: 0, gapMax: 0 };
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
    sg.ts = [];
    for (let k = 0; k <= n; k++) {
      const t = (sg.L * k) / n;
      const q = [sg.A[0] + sg.d[0] * t, sg.A[1] + sg.d[1] * t, sg.A[2] + sg.slope * t];
      const prev = posts[posts.length - 1];
      if (k === 0 && i > 0) { sg.ts.push(t); continue; } // Knick: Pfosten steht schon (Ende des vorigen Abschnitts)
      if (prev && Math.hypot(q[0] - prev.q[0], q[1] - prev.q[1]) < postW + 1) { if (k === n) prev.q = q; continue; }
      posts.push({ q, d: sg.d, slope: sg.slope });
      sg.ts.push(t);
    }
    if (sg.ts[sg.ts.length - 1] < sg.L - 1e-6) sg.ts.push(sg.L);
  }
  const drop = holderDrop(!!o.holder, o.post, o.holderGap);
  posts.forEach((p, i) => {
    const top = [p.q[0], p.q[1], p.q[2] + o.H - railH - drop];
    members.push({ section: o.post, a: [p.q[0], p.q[1], p.q[2] - o.postDown], b: top, name: `${label} Pfosten ${i + 1}`, up: [p.d[0], p.d[1], 0] });
    if (!o.holder) return;
    const hp = holderParts({ q: top, along: p.d, axisZ: p.q[2] + o.H - railH / 2, post: o.post, railH, d: o.holderD, slope: p.slope, name: `${label} Pfosten ${i + 1}`, target: `${label} Handlauf` });
    members.push(...hp.members); plates.push(...hp.plates); drills.push(...hp.drills);
  });
  // Handlauf; mit Haltern an beiden Enden 50 mm über den Endpfosten hinaus, damit die Bohrung ganz im Rohr liegt
  const rp = pts.map((q) => [q[0], q[1], q[2] + o.H - railH / 2]);
  if (o.holder) {
    const ext = (i, j) => { const d = [rp[i][0] - rp[j][0], rp[i][1] - rp[j][1], rp[i][2] - rp[j][2]], l = Math.hypot(...d) || 1; rp[i] = rp[i].map((x, k) => x + (d[k] / l) * 50); };
    ext(0, 1); ext(rp.length - 1, rp.length - 2);
  }
  chains.push({ section: o.rail, points: rp, name: `${label} Handlauf` });
  // Felder zwischen den Pfosten eines Abschnitts
  let fields = 0, bars = 0, gapMax = 0;
  const top = o.H - railH;
  for (const sg of segs) {
    const at = (s, h) => [sg.A[0] + sg.d[0] * s, sg.A[1] + sg.d[1] * s, sg.A[2] + sg.slope * s + h];
    const out = [sg.d[0], sg.d[1], 0], back = [-sg.d[0], -sg.d[1], 0];
    for (let k = 0; k + 1 < sg.ts.length; k++) {
      const s0 = sg.ts[k] + half, s1 = sg.ts[k + 1] - half;
      if (s1 - s0 < 20) continue;
      fields++;
      const n = fields;
      if (o.fill === "quer") {
        // Knieleisten gleichmäßig zwischen Lauflinie und Handlauf; schräg an den Pfosten senkrecht geschnitten
        const m = Math.max(1, Math.round(o.bars));
        for (let j = 1; j <= m; j++) {
          const h = (top * j) / (m + 1), a = at(s0, h), b = at(s1, h);
          members.push({ section: o.bar, a, b, name: `${label} Knieleiste ${n}.${j}`, cuts: { start: [{ p: a, n: back }], end: [{ p: b, n: out }] } });
        }
        bars += m;
        gapMax = Math.max(gapMax, top / (m + 1));
      } else if (o.fill === "staketen") {
        const beltH = o.belt.geom.height, lo = o.bottomZ + beltH / 2;
        if (!(top - lo > 100)) throw new Error(`${label}: kein Platz für Staketen – Höhe oder Untergurt prüfen`);
        const a0 = at(s0, o.bottomZ), b0 = at(s1, o.bottomZ);
        members.push({ section: o.belt, a: a0, b: b0, name: `${label} Untergurt ${n}`, cuts: { start: [{ p: a0, n: back }], end: [{ p: b0, n: out }] } });
        const bw = o.bar.geom.height, clear = s1 - s0;
        const m = Math.max(0, Math.ceil((clear - o.gap) / (bw + o.gap) - 1e-9));
        const gap = (clear - m * bw) / (m + 1);
        gapMax = Math.max(gapMax, gap, o.bottomZ - beltH / 2);
        for (let j = 0; j < m; j++) {
          const s = s0 + gap * (j + 1) + bw * j + bw / 2;
          members.push({ section: o.bar, a: at(s, lo), b: at(s, top), name: `${label} Stab ${n}.${j + 1}`, up: out });
        }
        bars += m;
      }
    }
  }
  return { members, chains, plates, drills, posts: posts.length, fields, bars, gapMax };
}
