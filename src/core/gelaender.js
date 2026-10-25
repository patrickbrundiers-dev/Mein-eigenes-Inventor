// Geländer-Generator (MegaCAD-Abgleich M11): Pfosten mit automatischer Aufteilung, Handlauf auf den Pfosten
// (über Eck gegehrt), Ober-/Untergurt zwischen den Pfosten, Füllung (Staketen, Querstäbe, Blech, Glas, Kreuz mit
// oder ohne Ring, Rahmen mit Staketen), Fußplatten.
// Reine Rechnung; Bauplan-Format siehe generator.js.
//
// Lage: Lauflinie auf dem Boden (z = 0) ab Ursprung entlang +X, Pfosten mittig auf der Linie. Über Eck: weitere
// Längen in »Läufe«, jede Ecke dreht um »Eckwinkel« (positiv = nach links). Höhe = Oberkante Handlauf.
// Hinweise nach üblicher Bauordnung: Höhe ≥ 900 mm (≥ 1100 mm bei Absturzhöhe > 12 m), Öffnungen ≤ 120 mm.

import { fieldError } from "./generror.js";
import { platePlan } from "./anschluss.js";
import { splitList } from "./expr.js";

const SEC = { rohr: "Rundrohr", vierkant: "Quadratrohr", rechteck: "Rechteckrohr", flach: "Flachstahl", rund: "Rundstahl", vierkantvoll: "Vierkantstahl" };

export const GELAENDER = {
  label: "Geländer",
  schema: [
    { key: "runs", label: "Läufe (Längen)", type: "list", default: "3000", group: "Lauflinie" },
    { key: "angle", label: "Eckwinkel", type: "num", unit: "°", default: "90", group: "Lauflinie", when: (p) => splitList(p.runs).length > 1 },
    { key: "height", label: "Höhe (OK Handlauf)", type: "num", default: "1000", group: "Lauflinie" },
    { key: "post", label: "Pfosten", type: "section", kinds: ["vierkant", "rechteck", "rohr", "flach"], default: { kind: "vierkant", size: "40x3" }, group: "Pfosten" },
    { key: "postMax", label: "Pfostenabstand max.", type: "num", default: "1200", group: "Pfosten" },
    { key: "base", label: "Befestigung", type: "select", options: [["fussplatte", "Fußplatte"], ["keine", "ohne (eingespannt)"]], default: "fussplatte", group: "Pfosten" },
    { key: "baseSize", label: "Fußplatte Größe", type: "num", default: "120", group: "Pfosten", when: (p) => p.base === "fussplatte" },
    { key: "baseT", label: "Fußplatte Dicke", type: "num", default: "10", group: "Pfosten", when: (p) => p.base === "fussplatte" },
    { key: "rail", label: "Handlauf", type: "section", kinds: ["rohr", "vierkant", "rechteck", "flach", "rund"], default: { kind: "rohr", size: "42.4x2.6" }, group: "Handlauf und Gurte" },
    { key: "overhang", label: "Handlauf-Überstand an den Enden", type: "num", default: "0", group: "Handlauf und Gurte" },
    { key: "top", label: "Obergurt", type: "check", default: true, group: "Handlauf und Gurte" },
    { key: "topGap", label: "Obergurt unter Handlauf", type: "num", default: "100", group: "Handlauf und Gurte", when: (p) => p.top },
    { key: "bottom", label: "Untergurt", type: "check", default: true, group: "Handlauf und Gurte" },
    { key: "bottomZ", label: "Untergurt über Boden", type: "num", default: "100", group: "Handlauf und Gurte", when: (p) => p.bottom },
    { key: "belt", label: "Gurtprofil", type: "section", kinds: ["flach", "vierkant", "rechteck"], default: { kind: "flach", size: "40x8" }, group: "Handlauf und Gurte", when: (p) => p.top || p.bottom },
    { key: "fill", label: "Füllung", type: "select", options: [["staketen", "Staketen"], ["quer", "Querstäbe"], ["blech", "Blech"], ["glas", "Glas"], ["kreuz", "Kreuz"], ["rahmen", "Rahmen mit Staketen"], ["keine", "keine"]], default: "staketen", tiles: "front", group: "Füllung" },
    { key: "bar", label: "Stab", type: "section", kinds: ["vierkantvoll", "rund", "vierkant", "rohr", "flach"], default: { kind: "vierkantvoll", size: "12" }, group: "Füllung", when: (p) => ["staketen", "quer", "kreuz", "rahmen"].includes(p.fill) },
    { key: "gapMax", label: "Öffnung max.", type: "num", default: "110", group: "Füllung", when: (p) => ["staketen", "quer", "rahmen"].includes(p.fill) },
    { key: "ring", label: "Ring in der Kreuzmitte", type: "check", default: true, group: "Füllung", when: (p) => p.fill === "kreuz" },
    { key: "ringD", label: "Ring-Durchmesser (Mitte Stab)", type: "num", default: "300", group: "Füllung", when: (p) => p.fill === "kreuz" && p.ring },
    { key: "frame", label: "Füllungsrahmen", type: "section", kinds: ["vierkant", "rechteck", "flach", "vierkantvoll"], default: { kind: "vierkant", size: "20x2" }, group: "Füllung", when: (p) => p.fill === "rahmen" },
    { key: "panelT", label: "Dicke", type: "num", default: "3", group: "Füllung", when: (p) => p.fill === "blech" || p.fill === "glas" },
    { key: "panelGap", label: "Abstand zu Pfosten/Gurt", type: "num", default: "15", group: "Füllung", when: (p) => ["blech", "glas", "rahmen"].includes(p.fill) },
  ],

  /** Bauplan aus aufgelösten Parametern (Zahlen, Profile mit geom) */
  plan(p) {
    const issues = [];
    const runs = p.runs;
    if (!runs.length || runs.some((x) => !(x > 0))) throw fieldError("Läufe: Längen > 0 angeben", "runs");
    const H = p.height, post = p.post, rail = p.rail;
    if (!(H > 200)) throw fieldError("Höhe zu klein", "height");
    if (H < 900) issues.push({ key: "height", level: "Warnung", message: `Höhe ${H} mm unter 900 mm – Absturzsicherung nach Landesbauordnung prüfen` });
    if (!(p.postMax > post.geom.width)) throw fieldError("Pfostenabstand zu klein", "postMax");
    // Lauflinie in der Ebene
    const pts = [[0, 0]];
    let ang = 0;
    runs.forEach((L, i) => {
      if (i > 0) ang += (p.angle * Math.PI) / 180;
      const [x, y] = pts[pts.length - 1];
      pts.push([x + L * Math.cos(ang), y + L * Math.sin(ang)]);
    });
    if (runs.length > 1 && !(Math.abs(p.angle) > 0 && Math.abs(p.angle) < 180)) throw fieldError("Eckwinkel zwischen 0° und 180° angeben", "angle");
    // Pfostenstellen je Lauf (Ecken einmal)
    const posts = [];
    const fields = [];
    runs.forEach((L, i) => {
      const a = pts[i], b = pts[i + 1];
      const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const n = Math.max(1, Math.ceil(L / p.postMax - 1e-9));
      for (let k = i === 0 ? 0 : 1; k <= n; k++) posts.push({ at: [a[0] + d[0] * (L * k) / n, a[1] + d[1] * (L * k) / n], d });
      for (let k = 0; k < n; k++) fields.push({ a: [a[0] + d[0] * (L * k) / n, a[1] + d[1] * (L * k) / n], d, len: L / n, run: i });
    });
    const railH = rail.geom.height, railW = rail.geom.width;
    const zBase = p.base === "fussplatte" ? p.baseT : 0;
    const zPostTop = H - railH;
    const members = [], plates = [], chains = [];
    const P3 = (xy, z) => [xy[0], xy[1], z];
    const up = [0, 0, 1];
    // Pfosten (Breite quer zur Lauflinie): Profil-u zeigt quer → Drehung so, dass Breite u ⟂ Lauf
    posts.forEach((q, i) => {
      members.push({ section: post, a: P3(q.at, zBase), b: P3(q.at, zPostTop), name: `Pfosten ${i + 1}`, up: [q.d[0], q.d[1], 0] });
      if (p.base === "fussplatte") {
        const pl = platePlan({ width: post.geom.width, height: post.geom.height }, { thickness: p.baseT, width: p.baseSize, height: p.baseSize, holes: 4, holeDia: 11, edge: Math.min(20, p.baseSize / 4) });
        plates.push({ center: P3(q.at, 0), xDir: [q.d[0], q.d[1], 0], normal: up, W: pl.W, H: pl.H, t: pl.t, holes: pl.holes, d: pl.d, name: `Fußplatte ${i + 1}` });
      }
    });
    // Handlauf über die ganze Lauflinie, an den Ecken gegehrt; Überstand an beiden Enden
    const zr = H - railH / 2;
    const rp = pts.map((q) => P3(q, zr));
    if (p.overhang > 0) {
      const ext = (i0, i1) => { const d = norm2(sub2(pts[i0], pts[i1])); return P3([pts[i0][0] + d[0] * p.overhang, pts[i0][1] + d[1] * p.overhang], zr); };
      rp[0] = ext(0, 1);
      rp[rp.length - 1] = ext(pts.length - 1, pts.length - 2);
    }
    chains.push({ section: rail, points: rp, name: "Handlauf" });
    // Gurte und Füllung je Feld zwischen den Pfostenflächen
    const half = post.geom.height / 2; // Pfostentiefe entlang der Lauflinie (v zeigt entlang d)
    const belt = p.belt, beltH = belt?.geom.height || 0;
    const zTop = H - railH - p.topGap, zBot = p.bottomZ;
    const fillLo = p.bottom ? zBot + beltH / 2 : zBase;
    const fillHi = p.top ? zTop - beltH / 2 : zPostTop;
    if (p.top && p.bottom && zTop - zBot < 2 * beltH + 50) throw fieldError("Ober- und Untergurt liegen zu dicht – Höhen prüfen", "topGap");
    if (p.fill !== "keine" && !(fillHi - fillLo > 20)) throw fieldError("Kein Platz für die Füllung", "fill");
    let nBars = 0, gapMaxSeen = 0;
    fields.forEach((fd, i) => {
      const s0 = half, s1 = fd.len - half, clear = s1 - s0;
      const at = (s) => [fd.a[0] + fd.d[0] * s, fd.a[1] + fd.d[1] * s];
      if (p.top) members.push({ section: belt, a: P3(at(s0), zTop), b: P3(at(s1), zTop), name: `Obergurt ${i + 1}` });
      if (p.bottom) members.push({ section: belt, a: P3(at(s0), zBot), b: P3(at(s1), zBot), name: `Untergurt ${i + 1}` });
      if (p.fill === "staketen") {
        const b = p.bar.geom.height; // Stabdicke entlang der Lauflinie (v zeigt entlang d)
        const n = Math.max(0, Math.ceil((clear - p.gapMax) / (b + p.gapMax) - 1e-9));
        const gap = (clear - n * b) / (n + 1);
        gapMaxSeen = Math.max(gapMaxSeen, gap);
        for (let k = 0; k < n; k++) {
          const s = s0 + gap * (k + 1) + b * k + b / 2;
          members.push({ section: p.bar, a: P3(at(s), fillLo), b: P3(at(s), fillHi), name: `Stab ${i + 1}.${k + 1}`, up: [fd.d[0], fd.d[1], 0] });
        }
        nBars += n;
      } else if (p.fill === "quer") {
        const b = p.bar.geom.height, span = fillHi - fillLo;
        const n = Math.max(0, Math.ceil((span - p.gapMax) / (b + p.gapMax) - 1e-9));
        const gap = (span - n * b) / (n + 1);
        gapMaxSeen = Math.max(gapMaxSeen, gap);
        for (let k = 0; k < n; k++) {
          const z = fillLo + gap * (k + 1) + b * k + b / 2;
          members.push({ section: p.bar, a: P3(at(s0), z), b: P3(at(s1), z), name: `Querstab ${i + 1}.${k + 1}` });
        }
        nBars += n;
      } else if (p.fill === "kreuz") {
        // Diagonalen von Ecke zu Ecke des Feldes, an den Pfosten senkrecht abgeschnitten; Ring in der Mitte (gegehrter Zug)
        const along = [fd.d[0], fd.d[1], 0], n = [-fd.d[1], fd.d[0], 0];
        const A = P3(at(s0), fillLo), B = P3(at(s1), fillHi), C = P3(at(s0), fillHi), D = P3(at(s1), fillLo);
        const cut = (q, sg) => ({ p: q, n: along.map((x) => x * sg) });
        members.push({ section: p.bar, a: A, b: B, name: `Diagonale ${i + 1}.1`, up: along, cuts: { start: [cut(A, -1)], end: [cut(B, 1)] } });
        members.push({ section: p.bar, a: C, b: D, name: `Diagonale ${i + 1}.2`, up: along, cuts: { start: [cut(C, -1)], end: [cut(D, 1)] } });
        nBars += 2;
        if (p.ring) {
          const r = p.ringD / 2, bw = Math.max(p.bar.geom.width, p.bar.geom.height);
          if (!(r > bw && 2 * r + bw < Math.min(clear, fillHi - fillLo))) throw fieldError(`Ring ⌀ ${p.ringD} passt nicht ins Feld ${Math.round(clear)} × ${Math.round(fillHi - fillLo)} mm`, "ringD");
          const c = at((s0 + s1) / 2), zc = (fillLo + fillHi) / 2, N = 24;
          const ring = Array.from({ length: N + 1 }, (_, k) => { const t = (2 * Math.PI * k) / N; return [c[0] + fd.d[0] * r * Math.cos(t), c[1] + fd.d[1] * r * Math.cos(t), zc + r * Math.sin(t)]; });
          chains.push({ section: p.bar, points: ring, name: `Ring ${i + 1}`, up: n });
        }
        // Öffnung = größter Inkreis der vier Dreiecke zwischen Diagonalen und Rand (Ring nicht angerechnet)
        const w = clear / 2, h = (fillHi - fillLo) / 2, L = Math.hypot(w, h);
        gapMaxSeen = Math.max(gapMaxSeen, w + h - L); // Inkreis-⌀ des rechtwinkligen Dreiecks
      } else if (p.fill === "rahmen") {
        // Füllungsrahmen (gegehrt) mit Abstand zu Pfosten und Gurten, Staketen innen zwischen den Rahmenstäben
        const fr = p.frame, fw = fr.geom.width, g = p.panelGap; // Kette mit up = Feldnormale: Breite liegt in der Feldebene
        const fs0 = s0 + g + fw / 2, fs1 = s1 - g - fw / 2, fz0 = fillLo + g + fw / 2, fz1 = fillHi - g - fw / 2;
        if (!(fs1 - fs0 > 3 * fw && fz1 - fz0 > 3 * fw)) throw fieldError("Füllungsrahmen passt nicht ins Feld – Abstand oder Rahmenprofil prüfen", "frame");
        const n = [-fd.d[1], fd.d[0], 0];
        chains.push({ section: fr, points: [P3(at(fs0), fz0), P3(at(fs1), fz0), P3(at(fs1), fz1), P3(at(fs0), fz1), P3(at(fs0), fz0)], name: `Füllungsrahmen ${i + 1}`, up: n });
        const i0 = fs0 + fw / 2, i1 = fs1 - fw / 2, inner = i1 - i0, zl = fz0 + fw / 2, zh = fz1 - fw / 2;
        const b = p.bar.geom.height;
        const m = Math.max(0, Math.ceil((inner - p.gapMax) / (b + p.gapMax) - 1e-9));
        const gap = (inner - m * b) / (m + 1);
        gapMaxSeen = Math.max(gapMaxSeen, gap, g);
        for (let k = 0; k < m; k++) {
          const s = i0 + gap * (k + 1) + b * k + b / 2;
          members.push({ section: p.bar, a: P3(at(s), zl), b: P3(at(s), zh), name: `Stab ${i + 1}.${k + 1}`, up: [fd.d[0], fd.d[1], 0] });
        }
        nBars += m;
      } else if (p.fill === "blech" || p.fill === "glas") {
        const W = clear - 2 * p.panelGap, Hp = fillHi - fillLo - 2 * p.panelGap;
        if (!(W > 0 && Hp > 0)) throw fieldError("Füllung: Abstand zu groß für das Feld", "panelGap");
        const n = [-fd.d[1], fd.d[0], 0];
        const c = at((s0 + s1) / 2);
        plates.push({ center: [c[0] - (n[0] * p.panelT) / 2, c[1] - (n[1] * p.panelT) / 2, (fillLo + fillHi) / 2], xDir: [fd.d[0], fd.d[1], 0], normal: n, W, H: Hp, t: p.panelT, name: `${p.fill === "glas" ? "Glas" : "Blech"} ${i + 1}`, glass: p.fill === "glas", vertical: true });
        gapMaxSeen = Math.max(gapMaxSeen, p.panelGap);
      }
    });
    if (gapMaxSeen > 120 + 1e-6) issues.push({ key: "gapMax", level: "Warnung", message: `Öffnung ${Math.round(gapMaxSeen)} mm größer als 120 mm` });
    if (p.fill === "keine" && (fillHi - fillLo) > 120) issues.push({ key: "fill", level: "Hinweis", message: "Ohne Füllung: Öffnungen größer als 120 mm" });
    const total = runs.reduce((a, b) => a + b, 0);
    const info = `${posts.length} Pfosten, ${fields.length} Feld(er) à ${fields.map((f) => Math.round(f.len)).filter((x, i, a) => a.indexOf(x) === i).join(" / ")} mm` + (nBars ? `, ${nBars} Stäbe` : "") + `, Lauflänge ${Math.round(total)} mm`;
    return { chains, members, plates, info, issues, sections: SEC };
  },

  views: ["front", "top"],
  /** Maßlinien: Ansicht des ersten Laufs (Höhe, Feld), Grundriss der Läufe */
  dims(p, plan, view) {
    const gap = Math.max(150, p.height * 0.12), r = Math.round;
    const posts = plan.members.filter((m) => /^Pfosten \d+$/.test(m.name)).map((m) => m.a);
    if (view === "front") {
      const out = [{ key: "height", a: [0, 0], b: [0, p.height], off: gap, text: r(p.height) }, { key: "runs", a: [0, 0], b: [p.runs[0], 0], off: -gap, text: r(p.runs[0]) }];
      if (posts.length > 1 && Math.abs(posts[1][1]) < 1e-6) out.push({ key: "postMax", a: [posts[0][0], p.height], b: [posts[1][0], p.height], off: gap / 2, text: r(posts[1][0] - posts[0][0]) });
      if (p.bottom) out.push({ key: "bottomZ", a: [p.runs[0], 0], b: [p.runs[0], p.bottomZ], off: -gap / 2, text: r(p.bottomZ) });
      return out;
    }
    let x = 0, y = 0, ang = 0;
    return p.runs.map((L, i) => {
      if (i > 0) ang += (p.angle * Math.PI) / 180;
      const a = [x, y];
      x += L * Math.cos(ang); y += L * Math.sin(ang);
      return { key: "runs", a, b: [x, y], off: -gap, text: r(L) };
    });
  },
};

const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
const norm2 = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
