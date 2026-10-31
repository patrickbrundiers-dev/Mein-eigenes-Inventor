// Rampe / Laufsteg (P1): Läufe mit Gefälle und Zwischenpodesten, Wangen als Profilzug mit Gehrung, Querträger,
// Belag (Gitterrost oder Riffelblech) je Abschnitt, Stützen mit Fußplatten, Radabweiser und Handlauf beidseitig.
// Barrierefrei nach DIN 18040-1 (Steigung höchstens 6 %, Podest nach höchstens 6 m Lauf, Podest 1,5 m lang,
// Radabweiser 10 cm, Handlauf 85–90 cm mit 30 cm waagerecht über Anfang und Ende). Reine Rechnung, keine Statik.
//
// Lage: Lauf in +x ab x = 0 (Rampenanfang auf dem Gelände z = 0), Breite y = 0 … Breite, Oberkante Belag steigt bis »Höhe«.

import { orientRot, rotExtent } from "./orient.js";
import { fieldError } from "./generror.js";
import { platePlan } from "./anschluss.js";
import { catalogToDims, sectionGeometry } from "./sections.js";

const r1 = (x) => Math.round(x * 10) / 10;
const sec = (kind, size) => {
  const dims = Object.fromEntries(Object.entries(catalogToDims(kind, size)).map(([k, x]) => [k, Number(x)]));
  return { kind, dims, geom: sectionGeometry(kind, dims), size };
};

/** Lauflinie der Oberkante Belag: [[x, z], …] mit Läufen (Steigung s) und Podesten dazwischen (und oben) */
export function rampPath({ height: H, slope, runMax, landing, topLanding = 0 }) {
  const s = slope / 100, total = H / s;
  const n = Math.max(1, Math.ceil(total / runMax - 1e-9));
  const L = total / n, dz = H / n;
  const pts = [[0, 0]];
  for (let k = 0; k < n; k++) {
    const [x, z] = pts.at(-1);
    pts.push([x + L, z + dz]);
    if (k < n - 1 && landing > 0) pts.push([x + L + landing, z + dz]);
  }
  if (topLanding > 0) { const [x, z] = pts.at(-1); pts.push([x + topLanding, z]); }
  return { pts, runs: n, runLength: L };
}

/** Linie der Lauflinie um d nach unten versetzt (senkrecht zu jedem Abschnitt), Ecken als Schnittpunkte */
export function offsetPath(pts, d) {
  const segs = pts.slice(1).map((b, i) => {
    const a = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), t = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-t[1], t[0]];
    return { a: [a[0] - d * n[0], a[1] - d * n[1]], t };
  });
  const out = [segs[0].a];
  for (let i = 1; i < segs.length; i++) {
    const s0 = segs[i - 1], s1 = segs[i];
    const den = s0.t[0] * s1.t[1] - s0.t[1] * s1.t[0];
    if (Math.abs(den) < 1e-12) { out.push(s1.a); continue; }
    const w = [s1.a[0] - s0.a[0], s1.a[1] - s0.a[1]], u = (w[0] * s1.t[1] - w[1] * s1.t[0]) / den;
    out.push([s0.a[0] + u * s0.t[0], s0.a[1] + u * s0.t[1]]);
  }
  const last = segs.at(-1), lb = pts.at(-1);
  out.push([lb[0] + last.a[0] - pts.at(-2)[0], lb[1] + last.a[1] - pts.at(-2)[1]]);
  return out;
}

/** Höhe z eines Polygonzugs [[x, z], …] an der Stelle x (außerhalb: Endabschnitt verlängert) */
export function zAt(pts, x) {
  let i = pts.findIndex((q, k) => k > 0 && x <= q[0] + 1e-9);
  if (i < 0) i = pts.length - 1;
  if (i === 0) i = 1;
  const [a, b] = [pts[i - 1], pts[i]];
  return Math.abs(b[0] - a[0]) < 1e-12 ? a[1] : a[1] + ((x - a[0]) * (b[1] - a[1])) / (b[0] - a[0]);
}

export const RAMPE = {
  label: "Rampe / Laufsteg",
  schema: [
    { key: "height", label: "Höhenunterschied", type: "num", default: "600", group: "Rampe" },
    { key: "width", label: "Breite (außen)", type: "num", default: "1400", group: "Rampe" },
    { key: "slope", label: "Steigung", type: "num", unit: "%", default: "6", group: "Rampe" },
    { key: "runMax", label: "Lauf am Stück höchstens (dann Podest)", type: "num", default: "6000", group: "Rampe" },
    { key: "landing", label: "Zwischenpodest Länge", type: "num", default: "1500", group: "Rampe" },
    { key: "topLanding", label: "Podest oben Länge (0 = keins)", type: "num", default: "1500", group: "Rampe" },
    { key: "stringer", label: "Wangen", type: "section", kinds: ["rechteck", "upn", "u", "vierkant"], default: { kind: "rechteck", size: "160x80x5" }, group: "Tragwerk" },
    { key: "joist", label: "Querträger", type: "section", kinds: ["rechteck", "vierkant", "flach", "winkel"], default: { kind: "rechteck", size: "80x40x4" }, group: "Tragwerk" },
    { key: "joistMax", label: "Querträgerabstand höchstens", type: "num", default: "1000", group: "Tragwerk" },
    { key: "column", label: "Stützen", type: "section", kinds: ["vierkant", "rechteck", "rohr"], default: { kind: "vierkant", size: "80x5" }, group: "Tragwerk" },
    { key: "colMax", label: "Stützenabstand höchstens", type: "num", default: "2500", group: "Tragwerk" },
    { key: "deck", label: "Belag", type: "select", options: [["gitterrost", "Gitterrost"], ["blech", "Riffelblech"]], default: "gitterrost", group: "Belag" },
    { key: "deckT", label: "Belagdicke", type: "num", default: "30", group: "Belag" },
    { key: "curb", label: "Radabweiser beidseitig", type: "check", default: true, group: "Belag" },
    { key: "curbH", label: "Radabweiser über Belag", type: "num", default: "100", group: "Belag", when: (p) => p.curb },
    { key: "rail", label: "Handlauf beidseitig", type: "check", default: true, group: "Handlauf" },
    { key: "railH", label: "Höhe OK Handlauf über Belag", type: "num", default: "900", group: "Handlauf", when: (p) => p.rail },
    { key: "railTube", label: "Handlauf / Pfosten", type: "section", kinds: ["rohr"], default: { kind: "rohr", size: "42.4x2.6" }, group: "Handlauf", when: (p) => p.rail },
    { key: "postMax", label: "Pfostenabstand höchstens", type: "num", default: "1500", group: "Handlauf", when: (p) => p.rail },
    { key: "railExt", label: "Handlauf waagerecht über Anfang/Ende", type: "num", default: "300", group: "Handlauf", when: (p) => p.rail },
    { key: "knee", label: "Knieleiste (halbe Höhe)", type: "check", default: true, group: "Handlauf", when: (p) => p.rail },
  ],

  plan(p) {
    const issues = [];
    const H = p.height, B = p.width, tt = p.deckT;
    if (!(H > 0 && H <= 6000)) throw fieldError("Höhenunterschied 1 … 6000 mm", "height");
    if (!(B >= 600 && B <= 4000)) throw fieldError("Breite 600 … 4000 mm", "width");
    if (!(p.slope > 0 && p.slope <= 30)) throw fieldError("Steigung 0 … 30 %", "slope");
    if (!(p.runMax >= 1000)) throw fieldError("Lauf am Stück mindestens 1000 mm", "runMax");
    if (!(tt > 0)) throw fieldError("Belagdicke muss > 0 sein", "deckT");
    if (!(p.landing >= 0 && p.topLanding >= 0)) throw fieldError("Podestlänge nicht negativ", "landing");
    const { pts, runs, runLength } = rampPath(p);
    if (runs > 1 && p.landing <= 0) throw fieldError("Mehrere Läufe brauchen ein Zwischenpodest", "landing");
    const Xend = pts.at(-1)[0];
    // DIN 18040-1
    if (p.slope > 6 + 1e-9) issues.push({ key: "slope", level: "Warnung", message: `Steigung ${String(p.slope).replace(".", ",")} % – barrierefrei nach DIN 18040 höchstens 6 %` });
    if (runLength > 6000 + 1e-6) issues.push({ key: "runMax", level: "Warnung", message: `Lauf ${Math.round(runLength)} mm am Stück – nach DIN 18040 Zwischenpodest nach höchstens 6 m` });
    if (runs > 1 && p.landing < 1500) issues.push({ key: "landing", level: "Warnung", message: `Zwischenpodest ${Math.round(p.landing)} mm – nach DIN 18040 mindestens 1500 mm` });
    if (p.rail && (p.railH < 850 || p.railH > 900)) issues.push({ key: "railH", level: "Hinweis", message: "Handlauf nach DIN 18040 in 85 … 90 cm Höhe" });
    if (p.curb && p.curbH < 100) issues.push({ key: "curbH", level: "Hinweis", message: "Radabweiser nach DIN 18040 mindestens 10 cm hoch" });

    const out = { chains: [], members: [], plates: [], norms: [], drills: [], tubes: [] };
    const { chains, members, plates } = out;
    // Wangen hochkant unter dem Belag, außen bündig
    const st = p.stringer, sRot = orientRot(st, [1, 0, 0], [0, 0, 1], { tall: [0, 0, 1] });
    const { high: sh, wide: sw } = rotExtent(st, sRot);
    const lane = B - 2 * sw;
    if (lane < 900) issues.push({ key: "width", level: "Warnung", message: `Lichte Breite zwischen den Wangen ${Math.round(lane)} mm – barrierefrei mindestens 1200 mm (1000 bei kurzen Rampen nicht zulässig)` });
    const axis = offsetPath(pts, tt + sh / 2);
    for (const [y, side] of [[sw / 2, "links"], [B - sw / 2, "rechts"]]) chains.push({ section: st, points: axis.map(([x, z]) => [x, y, z]), name: `Wange ${side}`, up: [0, 0, 1], rot: sRot });
    const deckBot = offsetPath(pts, tt), wBot = offsetPath(pts, tt + sh);

    // Belag je Abschnitt (an Knicken um die Keilspitze gekürzt, damit sich die Platten nicht überdecken)
    const seg = pts.slice(1).map((b, i) => {
      const a = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return { a, b, L, t: [(b[0] - a[0]) / L, (b[1] - a[1]) / L], ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    });
    const trim = (i, end, d) => {
      const j = end ? i + 1 : i - 1;
      if (j < 0 || j >= seg.length) return 0;
      return d * Math.abs(Math.tan((seg[i].ang - seg[j].ang) / 2)) + 0.5;
    };
    const along = (s, u, h) => [s.a[0] + u * s.t[0] - h * s.t[1], s.a[1] + u * s.t[1] + h * s.t[0]]; // h senkrecht nach oben
    seg.forEach((s, i) => {
      const t0 = trim(i, false, tt), t1 = trim(i, true, tt), W = s.L - t0 - t1, c = along(s, t0 + W / 2, -tt);
      const xDir = [s.t[0], 0, s.t[1]], normal = [-s.t[1], 0, s.t[0]];
      const flat = Math.abs(s.t[1]) < 1e-9;
      plates.push({ center: [c[0], B / 2, c[1]], xDir, normal, W, H: B, t: tt, name: `${p.deck === "blech" ? "Riffelblech" : "Gitterrost"} ${flat ? "Podest" : "Lauf"} ${i + 1}`, tread: p.deck });
      if (p.curb) {
        const hc = p.curbH, ct = 8, c0 = trim(i, false, hc), c1 = trim(i, true, hc), Wc = s.L - c0 - c1, m = along(s, c0 + Wc / 2, 0);
        for (const [y, ny, side] of [[ct, -1, "links"], [B - ct, 1, "rechts"]]) {
          plates.push({ center: [m[0], y, m[1] + 0], xDir, normal: [0, ny, 0], W: Wc, H: 0, t: ct, name: `Radabweiser ${side} ${i + 1}`, _hc: hc });
        }
      }
    });
    // Radabweiser: Höhe senkrecht zum Belag (lokales y = normal × xDir), Mitte um die halbe Höhe angehoben
    for (const pl of plates.filter((x) => x._hc)) {
      const up = [pl.normal[1] * pl.xDir[2] - pl.normal[2] * pl.xDir[1], pl.normal[2] * pl.xDir[0] - pl.normal[0] * pl.xDir[2], pl.normal[0] * pl.xDir[1] - pl.normal[1] * pl.xDir[0]];
      const s = up[2] < 0 ? -1 : 1; // Höhe nach oben
      pl.center = [pl.center[0] + s * up[0] * pl._hc / 2, pl.center[1] + s * up[1] * pl._hc / 2, pl.center[2] + s * up[2] * pl._hc / 2];
      pl.H = pl._hc;
      delete pl._hc;
    }

    // Querträger zwischen den Wangen an den Knicken und dazwischen nach Abstand; Oberkante unter dem Belag
    const jo = p.joist, jRot = orientRot(jo, [0, 1, 0], [0, 0, 1], { tall: [0, 0, 1], open: [1, 0, 0], legs: [-Math.SQRT1_2, 0, -Math.SQRT1_2] });
    const { high: jh, wide: jw } = rotExtent(jo, jRot);
    if (jh > sh + 1e-6) throw fieldError("Querträger höher als die Wangen", "joist");
    const jxs = [];
    seg.forEach((s, i) => {
      const x0 = s.a[0], x1 = s.b[0], n = Math.max(1, Math.ceil((x1 - x0) / p.joistMax - 1e-9));
      for (let k = i === 0 ? 0 : 1; k <= n; k++) jxs.push(x0 + ((x1 - x0) * k) / n);
    });
    let nJ = 0;
    for (const x0 of jxs) {
      const x = Math.min(Math.max(x0, jw / 2 + 1), Xend - jw / 2 - 1);
      const zTop = Math.min(zAt(deckBot, x - jw / 2), zAt(deckBot, x + jw / 2), zAt(deckBot, x));
      if (zTop - jh < 1) continue;
      members.push({ section: jo, a: [x, sw, zTop - jh / 2], b: [x, B - sw, zTop - jh / 2], name: `Querträger ${++nJ}`, up: [0, 0, 1], rot: jRot });
    }

    // Stützen unter den Wangen an den Knicken und dazwischen, wo die Wange hoch genug liegt
    const col = p.column, cw = Math.max(col.geom.width, col.geom.height), baseT = 15;
    const cxs = [];
    seg.forEach((s) => {
      const x0 = s.a[0], x1 = s.b[0], n = Math.max(1, Math.ceil((x1 - x0) / p.colMax - 1e-9));
      for (let k = 0; k <= n; k++) { const x = x0 + ((x1 - x0) * k) / n; if (!cxs.some((q) => Math.abs(q - x) < 1)) cxs.push(x); }
    });
    let nC = 0, skipped = 0;
    for (const x0 of cxs) {
      const x = Math.min(Math.max(x0, cw / 2), Xend - cw / 2);
      const zTop = Math.min(zAt(wBot, x - cw / 2), zAt(wBot, x + cw / 2), zAt(wBot, x));
      if (zTop < baseT + 250) { skipped++; continue; }
      for (const [y, side] of [[sw / 2, "links"], [B - sw / 2, "rechts"]]) {
        nC++;
        members.push({ section: col, a: [x, y, baseT], b: [x, y, zTop], name: `Stütze ${side} ${nC}`, up: [1, 0, 0] });
        const bp = platePlan({ width: col.geom.width, height: col.geom.height }, { thickness: baseT, width: cw + 100, height: cw + 100, holes: 4, holeDia: 14, edge: 25 });
        plates.push({ center: [x, y, 0], xDir: [1, 0, 0], normal: [0, 0, 1], W: bp.W, H: bp.H, t: baseT, holes: bp.holes, d: bp.d, name: `Fußplatte ${side} ${nC}` });
      }
    }
    if (skipped) issues.push({ key: "column", level: "Hinweis", message: `Wo die Wangen weniger als ${baseT + 250} mm über dem Gelände liegen, stehen keine Stützen: dort auf Streifenfundament oder Auflagerwinkel setzen (wird nicht erzeugt)` });

    // Handlauf beidseitig: Pfosten auf dem Belag (Abstand vom Knick), Handlauf als Zug mit 300 mm waagerecht an den Enden
    if (p.rail) {
      const tube = p.railTube, D = tube.geom.width, rp = D / 2, iy = (p.curb ? 8 : 0) + rp + 15;
      const railPts = [[-p.railExt, 0 + p.railH], ...pts.map(([x, z]) => [x, z + p.railH]), [Xend + p.railExt, pts.at(-1)[1] + p.railH]];
      const kneeOn = p.knee && p.railH > 500;
      // Ausklinkung 0,5 mm größer als das Rohr: gleich große, senkrecht stehende Zylinder berühren sich sonst nur tangential
      const copeSec = { kind: "rohr", dims: { ...tube.dims, D: D + 0.5 }, geom: sectionGeometry("rohr", { ...tube.dims, D: D + 0.5 }) };
      for (const [y, side] of [[iy, "links"], [B - iy, "rechts"]]) {
        chains.push({ section: tube, points: railPts.map(([x, z]) => [x, y, z]), name: `Handlauf ${side}`, up: [0, 0, 1] });
        const posts = [];
        seg.forEach((s, i) => {
          const u0 = rp + 20, u1 = s.L - rp - 20;
          if (u1 <= u0) return;
          const n = Math.max(1, Math.ceil((u1 - u0) / p.postMax - 1e-9));
          for (let k = 0; k <= n; k++) {
            if (i > 0 && k === 0 && seg[i - 1] && Math.abs(seg[i - 1].ang - s.ang) < 1e-9) continue;
            const u = u0 + ((u1 - u0) * k) / n, q = along(s, u, 0);
            posts.push({ i, x: q[0], z: q[1], s });
          }
        });
        const railSeg = (x) => { const k = Math.max(1, railPts.findIndex((q, j) => j > 0 && x <= q[0] + 1e-9)); return [railPts[k - 1], railPts[k]]; };
        const P = posts.map((q, k) => {
          const [ra0, rb0] = railSeg(q.x), zr = zAt(railPts, q.x);
          // Ausklinkung am Handlauf: Abschnitt über beide Enden verlängert (Pfosten nahe am Knick)
          const Lr = Math.hypot(rb0[0] - ra0[0], rb0[1] - ra0[1]), e = [(rb0[0] - ra0[0]) / Lr, (rb0[1] - ra0[1]) / Lr];
          const ra = [ra0[0] - 200 * e[0], ra0[1] - 200 * e[1]], rb = [rb0[0] + 200 * e[0], rb0[1] + 200 * e[1]];
          const m = { section: tube, a: [q.x, y, q.z - 5], b: [q.x, y, zr], name: `Pfosten ${side} ${k + 1}`, up: [1, 0, 0],
            cuts: { start: [{ p: [q.x, y, q.z], n: [q.s.t[1], 0, -q.s.t[0]] }], end: [] },
            copes: [{ section: copeSec, a: [ra[0], y, ra[1]], b: [rb[0], y, rb[1]], up: [0, 0, 1] }] };
          members.push(m);
          return m;
        });
        if (kneeOn) {
          const hk = p.railH / 2, kt = sec("rohr", "26.9x2.3");
          for (let k = 0; k + 1 < posts.length; k++) {
            const a = posts[k], b = posts[k + 1];
            members.push({ section: kt, a: [a.x, y, a.z + hk], b: [b.x, y, b.z + hk], name: `Knieleiste ${side} ${k + 1}`, up: [0, 0, 1], copes: [P[k], P[k + 1]].map((m) => ({ section: m.section, a: m.a, b: m.b, up: m.up })) });
          }
        }
      }
    }
    const info = `Rampe ${Math.round(Xend)} mm lang, ${Math.round(H)} mm hoch, ${String(p.slope).replace(".", ",")} %, ${runs} Lauf/Läufe à ${r1(runLength / 1000).toString().replace(".", ",")} m` + (runs > 1 ? `, ${runs - 1} Zwischenpodest(e)` : "") + `, ${nC} Stützen – statisch nicht nachgewiesen`;
    return { ...out, info, issues };
  },

  parts: { stringer: /^Wange/, joist: /^Querträger/, column: /^(Stütze|Fußplatte)/, deck: /^(Gitterrost|Riffelblech)/, curb: /^Radabweiser/, rail: /^(Handlauf|Pfosten|Knieleiste)/, knee: /^Knieleiste/ },
  views: ["front", "top"],
  dims(p, plan, view) {
    const { pts } = rampPath(p), L = pts.at(-1)[0], gap = Math.max(200, L * 0.04), r = Math.round;
    if (view === "top") return [{ key: "width", a: [L, 0], b: [L, p.width], off: -gap, text: r(p.width) }];
    return [{ key: "height", a: [L, 0], b: [L, p.height], off: -gap, text: r(p.height) }, { key: "slope", a: [0, 0], b: [L, 0], off: gap, text: r(L) }];
  },
};
