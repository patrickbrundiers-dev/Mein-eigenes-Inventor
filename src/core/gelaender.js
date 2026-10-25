// Geländer-Generator (MegaCAD-Abgleich M11): Pfosten mit automatischer Aufteilung, Handlauf auf den Pfosten
// (über Eck gegehrt), Ober-/Untergurt zwischen den Pfosten, Füllung (Staketen, Querstäbe, Blech, Glas), Fußplatten.
// Reine Rechnung; Bauplan-Format siehe generator.js.
//
// Lage: Lauflinie auf dem Boden (z = 0) ab Ursprung entlang +X, Pfosten mittig auf der Linie. Über Eck: weitere
// Längen in »Läufe«, jede Ecke dreht um »Eckwinkel« (positiv = nach links). Höhe = Oberkante Handlauf.
// Hinweise nach üblicher Bauordnung: Höhe ≥ 900 mm (≥ 1100 mm bei Absturzhöhe > 12 m), Öffnungen ≤ 120 mm.

import { platePlan } from "./anschluss.js";

const SEC = { rohr: "Rundrohr", vierkant: "Quadratrohr", rechteck: "Rechteckrohr", flach: "Flachstahl", rund: "Rundstahl", vierkantvoll: "Vierkantstahl" };

export const GELAENDER = {
  label: "Geländer",
  schema: [
    { key: "runs", label: "Läufe (Längen)", type: "list", default: "3000", group: "Lauflinie" },
    { key: "angle", label: "Eckwinkel", type: "num", unit: "°", default: "90", group: "Lauflinie", when: (p) => String(p.runs).split(/[;\s]+/).filter(Boolean).length > 1 },
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
    { key: "fill", label: "Füllung", type: "select", options: [["staketen", "Staketen"], ["quer", "Querstäbe"], ["blech", "Blech"], ["glas", "Glas"], ["keine", "keine"]], default: "staketen", group: "Füllung" },
    { key: "bar", label: "Stab", type: "section", kinds: ["vierkantvoll", "rund", "vierkant", "rohr", "flach"], default: { kind: "vierkantvoll", size: "12" }, group: "Füllung", when: (p) => p.fill === "staketen" || p.fill === "quer" },
    { key: "gapMax", label: "Öffnung max.", type: "num", default: "110", group: "Füllung", when: (p) => p.fill === "staketen" || p.fill === "quer" },
    { key: "panelT", label: "Dicke", type: "num", default: "3", group: "Füllung", when: (p) => p.fill === "blech" || p.fill === "glas" },
    { key: "panelGap", label: "Abstand zu Pfosten/Gurt", type: "num", default: "15", group: "Füllung", when: (p) => p.fill === "blech" || p.fill === "glas" },
  ],

  /** Bauplan aus aufgelösten Parametern (Zahlen, Profile mit geom) */
  plan(p) {
    const issues = [];
    const runs = p.runs;
    if (!runs.length || runs.some((x) => !(x > 0))) throw new Error("Läufe: Längen > 0 angeben");
    const H = p.height, post = p.post, rail = p.rail;
    if (!(H > 200)) throw new Error("Höhe zu klein");
    if (H < 900) issues.push({ level: "Warnung", message: `Höhe ${H} mm unter 900 mm – Absturzsicherung nach Landesbauordnung prüfen` });
    if (!(p.postMax > post.geom.width)) throw new Error("Pfostenabstand zu klein");
    // Lauflinie in der Ebene
    const pts = [[0, 0]];
    let ang = 0;
    runs.forEach((L, i) => {
      if (i > 0) ang += (p.angle * Math.PI) / 180;
      const [x, y] = pts[pts.length - 1];
      pts.push([x + L * Math.cos(ang), y + L * Math.sin(ang)]);
    });
    if (runs.length > 1 && !(Math.abs(p.angle) > 0 && Math.abs(p.angle) < 180)) throw new Error("Eckwinkel zwischen 0° und 180° angeben");
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
    if (p.top && p.bottom && zTop - zBot < 2 * beltH + 50) throw new Error("Ober- und Untergurt liegen zu dicht – Höhen prüfen");
    if (p.fill !== "keine" && !(fillHi - fillLo > 20)) throw new Error("Kein Platz für die Füllung");
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
      } else if (p.fill === "blech" || p.fill === "glas") {
        const W = clear - 2 * p.panelGap, Hp = fillHi - fillLo - 2 * p.panelGap;
        if (!(W > 0 && Hp > 0)) throw new Error("Füllung: Abstand zu groß für das Feld");
        const n = [-fd.d[1], fd.d[0], 0];
        const c = at((s0 + s1) / 2);
        plates.push({ center: [c[0] - (n[0] * p.panelT) / 2, c[1] - (n[1] * p.panelT) / 2, (fillLo + fillHi) / 2], xDir: [fd.d[0], fd.d[1], 0], normal: n, W, H: Hp, t: p.panelT, name: `${p.fill === "glas" ? "Glas" : "Blech"} ${i + 1}`, glass: p.fill === "glas", vertical: true });
        gapMaxSeen = Math.max(gapMaxSeen, p.panelGap);
      }
    });
    if (gapMaxSeen > 120 + 1e-6) issues.push({ level: "Warnung", message: `Öffnung ${Math.round(gapMaxSeen)} mm größer als 120 mm` });
    if (p.fill === "keine" && (fillHi - fillLo) > 120) issues.push({ level: "Hinweis", message: "Ohne Füllung: Öffnungen größer als 120 mm" });
    const total = runs.reduce((a, b) => a + b, 0);
    const info = `${posts.length} Pfosten, ${fields.length} Feld(er) à ${fields.map((f) => Math.round(f.len)).filter((x, i, a) => a.indexOf(x) === i).join(" / ")} mm` + (nBars ? `, ${nBars} Stäbe` : "") + `, Lauflänge ${Math.round(total)} mm`;
    return { chains, members, plates, info, issues, sections: SEC };
  },
};

const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
const norm2 = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
