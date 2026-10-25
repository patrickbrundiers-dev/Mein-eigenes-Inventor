// DXF-Leser für den Import in eine Skizze (MegaCAD-Abgleich M21). Liest ASCII-DXF (R12 bis aktuell):
// LINE, CIRCLE, ARC, LWPOLYLINE und POLYLINE (mit Bögen über »bulge«), ELLIPSE, SPLINE (als Polygonzug) und
// INSERT (Blöcke mit Verschiebung, Drehung, Skalierung). Texte, Maße, Schraffuren werden gezählt und übersprungen.
// Ergebnis sind einfache 2D-Elemente; dxfToSketch legt daraus Punkte und Skizzenelemente an.

const DEG = Math.PI / 180;
const UNIT_MM = { 0: 1, 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000, 8: 0.0254, 9: 0.0254, 10: 914.4, 13: 0.001, 14: 100 };
const UNIT_NAME = { 0: "ohne Einheit (als mm)", 1: "Zoll", 2: "Fuß", 4: "mm", 5: "cm", 6: "m", 8: "Mikrozoll", 9: "mil", 10: "Yard", 13: "µm", 14: "dm" };
const SKIP = new Set(["TEXT", "MTEXT", "DIMENSION", "HATCH", "SOLID", "POINT", "LEADER", "MLEADER", "ATTRIB", "ATTDEF", "IMAGE", "VIEWPORT", "3DFACE", "WIPEOUT", "TOLERANCE", "RAY", "XLINE", "REGION", "3DSOLID", "BODY", "MESH", "OLE2FRAME"]);

/** Gruppen-Code-Paare */
function pairs(text) {
  const lines = text.split(/\r\n|\r|\n/);
  const out = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) { i--; continue; } // Leerzeile am Ende o. Ä.
    out.push([code, lines[i + 1].trim()]);
  }
  return out;
}

/** Rohdaten: { header, blocks: Map<name, {base, ents}>, ents } mit ents = [{ type, codes: [[code, value]] }] */
function readRaw(text) {
  const P = pairs(text);
  const header = {};
  const blocks = new Map();
  const ents = [];
  let section = null, cur = null, block = null, lastVar = null;
  const target = () => (section === "BLOCKS" ? block?.ents : section === "ENTITIES" ? ents : null);
  for (let i = 0; i < P.length; i++) {
    const [c, v] = P[i];
    if (c === 0) {
      if (v === "SECTION") { const n = P[i + 1]; section = n && n[0] === 2 ? n[1] : null; i++; cur = null; continue; }
      if (v === "ENDSEC") { section = null; cur = null; continue; }
      if (section === "BLOCKS" && v === "BLOCK") { block = { name: "", base: [0, 0], ents: [] }; cur = { type: "BLOCK", codes: [], block }; continue; }
      if (section === "BLOCKS" && v === "ENDBLK") { if (block) blocks.set(block.name, block); block = null; cur = null; continue; }
      const list = target();
      if (!list) { cur = null; continue; }
      cur = { type: v, codes: [] };
      list.push(cur);
      continue;
    }
    if (section === "HEADER") {
      if (c === 9) lastVar = v;
      else if (lastVar) header[lastVar] = v;
      continue;
    }
    if (!cur) continue;
    if (cur.type === "BLOCK") {
      if (c === 2) cur.block.name = v;
      else if (c === 10) cur.block.base[0] = +v;
      else if (c === 20) cur.block.base[1] = +v;
      continue;
    }
    cur.codes.push([c, v]);
  }
  return { header, blocks, ents };
}

const first = (codes, c, d = undefined) => { const x = codes.find((p) => p[0] === c); return x ? x[1] : d; };
const num = (codes, c, d = 0) => { const x = first(codes, c); return x === undefined ? d : +x; };

/** Bogen aus zwei Punkten und Wölbung (bulge = tan(θ/4), > 0 gegen den Uhrzeigersinn) */
export function bulgeArc(a, b, bulge) {
  const dx = b[0] - a[0], dy = b[1] - a[1], chord = Math.hypot(dx, dy);
  const theta = 4 * Math.atan(bulge);
  const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const h = chord / (2 * Math.tan(theta / 2)); // Abstand Sehnenmitte → Mitte, links von a→b bei positiver Wölbung
  const c = [mx - (dy / chord) * h, my + (dx / chord) * h];
  // Gegen den Uhrzeigersinn von a nach b; bei negativer Wölbung umgekehrt (b → a)
  const [s, e] = bulge > 0 ? [a, b] : [b, a];
  return { kind: "arc", c, r: Math.abs(r), a0: Math.atan2(s[1] - c[1], s[0] - c[0]), a1: Math.atan2(e[1] - c[1], e[0] - c[0]) };
}

/** Polylinie (Punkte mit Wölbung) in Linien und Bögen */
function polyPrims(vs, closed) {
  const out = [];
  const n = vs.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = vs[i], b = vs[(i + 1) % n];
    if (Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1]) < 1e-9) continue;
    out.push(Math.abs(a.bulge) > 1e-9 ? bulgeArc(a.p, b.p, a.bulge) : { kind: "line", a: a.p, b: b.p });
  }
  return out;
}

/** B-Spline (Grad, Knoten, Kontrollpunkte, Gewichte) abtasten – de Boor */
export function sampleBspline(deg, knots, ctrl, weights, n) {
  const k = deg, t0 = knots[k], t1 = knots[knots.length - k - 1];
  const out = [];
  for (let s = 0; s <= n; s++) {
    const t = Math.min(t0 + ((t1 - t0) * s) / n, t1 - 1e-12 * Math.max(1, Math.abs(t1)));
    let span = k;
    while (span < knots.length - k - 2 && t >= knots[span + 1]) span++;
    const d = [];
    for (let j = 0; j <= k; j++) { const P = ctrl[span - k + j], w = weights?.[span - k + j] ?? 1; d.push([P[0] * w, P[1] * w, w]); }
    for (let r = 1; r <= k; r++)
      for (let j = k; j >= r; j--) {
        const i = span - k + j;
        const den = knots[i + k - r + 1] - knots[i];
        const al = den > 1e-15 ? (t - knots[i]) / den : 0;
        d[j] = [0, 1, 2].map((q) => (1 - al) * d[j - 1][q] + al * d[j][q]);
      }
    out.push([d[k][0] / d[k][2], d[k][1] / d[k][2]]);
  }
  return out;
}

/** Ein Rohelement in 2D-Elemente (Objektkoordinaten); OCS mit Extrusion −Z wird gespiegelt */
function entityPrims(e, warn) {
  const C = e.codes;
  const flip = num(C, 230, 1) < 0;
  const X = (x) => (flip ? -x : x);
  const arcFlip = (p) => (flip ? { ...p, c: [-p.c[0], p.c[1]], a0: Math.PI - p.a1, a1: Math.PI - p.a0 } : p);
  switch (e.type) {
    case "LINE": return [{ kind: "line", a: [num(C, 10), num(C, 20)], b: [num(C, 11), num(C, 21)] }];
    case "CIRCLE": return [{ kind: "circle", c: [X(num(C, 10)), num(C, 20)], r: num(C, 40) }];
    case "ARC": return [arcFlip({ kind: "arc", c: [num(C, 10), num(C, 20)], r: num(C, 40), a0: num(C, 50) * DEG, a1: num(C, 51) * DEG })];
    case "LWPOLYLINE": {
      const vs = [];
      for (const [c, v] of C) {
        if (c === 10) vs.push({ p: [+v, 0], bulge: 0 });
        else if (c === 20 && vs.length) vs.at(-1).p[1] = +v;
        else if (c === 42 && vs.length) vs.at(-1).bulge = +v;
      }
      const closed = (num(C, 70) & 1) === 1;
      return polyPrims(vs.map((x) => ({ p: [X(x.p[0]), x.p[1]], bulge: flip ? -x.bulge : x.bulge })), closed);
    }
    case "POLYLINE": {
      if (num(C, 70) & (16 | 64)) { warn("3D-Netze/Flächen übersprungen"); return []; }
      const vs = (e.vertices || []).map((v) => ({ p: [X(num(v.codes, 10)), num(v.codes, 20)], bulge: (flip ? -1 : 1) * num(v.codes, 42) }));
      return polyPrims(vs, (num(C, 70) & 1) === 1);
    }
    case "ELLIPSE": {
      const c = [num(C, 10), num(C, 20)], maj = [num(C, 11), num(C, 21)], ratio = num(C, 40, 1);
      const p0 = num(C, 41, 0), p1 = num(C, 42, 2 * Math.PI);
      const full = Math.abs(((p1 - p0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)) < 1e-6;
      const fl = (p) => [X(p[0]), p[1]];
      if (full) return [{ kind: "ellipse", c: fl(c), major: flip ? [-maj[0], maj[1]] : maj, ratio }];
      // Ellipsenbogen als Polygonzug
      const A = Math.hypot(maj[0], maj[1]), ux = maj[0] / A, uy = maj[1] / A, B = A * ratio;
      let sweep = p1 - p0; while (sweep <= 0) sweep += 2 * Math.PI;
      const n = Math.max(8, Math.ceil(sweep / (Math.PI / 24)));
      const pts = [];
      for (let i = 0; i <= n; i++) { const t = p0 + (sweep * i) / n, x = A * Math.cos(t), y = B * Math.sin(t); pts.push(fl([c[0] + x * ux - y * uy, c[1] + x * uy + y * ux])); }
      return pts.slice(1).map((b, i) => ({ kind: "line", a: pts[i], b }));
    }
    case "SPLINE": {
      const deg = num(C, 71, 3);
      const knots = C.filter((p) => p[0] === 40).map((p) => +p[1]);
      const ctrl = [], fit = [], w = C.filter((p) => p[0] === 41).map((p) => +p[1]);
      for (const [c, v] of C) {
        if (c === 10) ctrl.push([+v, 0]); else if (c === 20 && ctrl.length) ctrl.at(-1)[1] = +v;
        else if (c === 11) fit.push([+v, 0]); else if (c === 21 && fit.length) fit.at(-1)[1] = +v;
      }
      let pts;
      if (deg === 1 && ctrl.length >= 2) pts = ctrl;
      else if (ctrl.length > deg && knots.length === ctrl.length + deg + 1) pts = sampleBspline(deg, knots, ctrl, w.length === ctrl.length ? w : null, Math.max(16, ctrl.length * 8));
      else if (fit.length >= 2) pts = fit;
      else { warn("Spline ohne lesbare Daten übersprungen"); return []; }
      pts = pts.map((p) => [X(p[0]), p[1]]);
      return pts.slice(1).map((b, i) => ({ kind: "line", a: pts[i], b })).filter((l) => Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]) > 1e-9);
    }
  }
  return null;
}

/** Element transformieren: Skalierung sx, sy, Drehung rot (rad), Verschiebung t */
function transformPrim(p, T) {
  const { sx, sy, rot, t } = T;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const P = (q) => { const x = q[0] * sx, y = q[1] * sy; return [t[0] + x * cs - y * sn, t[1] + x * sn + y * cs]; };
  const uniform = Math.abs(Math.abs(sx) - Math.abs(sy)) < 1e-9;
  const mirror = sx * sy < 0;
  if (p.kind === "line") return [{ kind: "line", a: P(p.a), b: P(p.b) }];
  if (uniform && p.kind === "circle") return [{ kind: "circle", c: P(p.c), r: p.r * Math.abs(sx) }];
  if (uniform && p.kind === "arc") {
    const ang = (a) => { const v = [Math.cos(a) * sx, Math.sin(a) * sy]; return Math.atan2(v[0] * sn + v[1] * cs, v[0] * cs - v[1] * sn); };
    const a0 = ang(p.a0), a1 = ang(p.a1);
    return [{ kind: "arc", c: P(p.c), r: p.r * Math.abs(sx), a0: mirror ? a1 : a0, a1: mirror ? a0 : a1 }];
  }
  if (uniform && p.kind === "ellipse") {
    const m = [p.major[0] * sx, p.major[1] * sy];
    return [{ kind: "ellipse", c: P(p.c), major: [m[0] * cs - m[1] * sn, m[0] * sn + m[1] * cs], ratio: p.ratio }];
  }
  // ungleichmäßig skalierte Kreise/Bögen/Ellipsen: als Polygonzug
  return toPolyline(p).map((l) => ({ kind: "line", a: P(l.a), b: P(l.b) }));
}
function toPolyline(p) {
  let pts = [];
  if (p.kind === "circle" || p.kind === "arc") {
    let a0 = p.kind === "arc" ? p.a0 : 0, sw = p.kind === "arc" ? p.a1 - p.a0 : 2 * Math.PI;
    while (sw <= 0) sw += 2 * Math.PI;
    const n = Math.max(8, Math.ceil(sw / (Math.PI / 24)));
    for (let i = 0; i <= n; i++) pts.push([p.c[0] + p.r * Math.cos(a0 + (sw * i) / n), p.c[1] + p.r * Math.sin(a0 + (sw * i) / n)]);
  } else if (p.kind === "ellipse") {
    const A = Math.hypot(...p.major), ux = p.major[0] / A, uy = p.major[1] / A, B = A * p.ratio;
    for (let i = 0; i <= 64; i++) { const t = (2 * Math.PI * i) / 64, x = A * Math.cos(t), y = B * Math.sin(t); pts.push([p.c[0] + x * ux - y * uy, p.c[1] + x * uy + y * ux]); }
  }
  return pts.slice(1).map((b, i) => ({ kind: "line", a: pts[i], b }));
}

/**
 * DXF lesen. Rückgabe: { prims: [{kind, layer, …}], layers: [{name, count}], unit, scale, skipped: {TYP: n}, warnings }
 * prims in mm (nach $INSUNITS), Bögen mit a0 → a1 gegen den Uhrzeigersinn (rad).
 */
export function parseDxf(text) {
  if (/^AutoCAD Binary DXF/.test(text)) throw new Error("Binär-DXF wird nicht unterstützt – bitte als ASCII-DXF speichern");
  if (!/\bSECTION\b/.test(text) || !/\bEOF\b|\bENTITIES\b/.test(text)) throw new Error("Keine DXF-Datei (Abschnitte fehlen)");
  const raw = readRaw(text);
  // POLYLINE/VERTEX/SEQEND zusammenfassen (in ENTITIES und in Blöcken)
  const fold = (list) => {
    const out = [];
    for (const e of list) {
      if (e.type === "VERTEX") { const pl = out.at(-1); if (pl?.type === "POLYLINE") (pl.vertices ||= []).push(e); continue; }
      if (e.type === "SEQEND") continue;
      out.push(e);
    }
    return out;
  };
  raw.ents = fold(raw.ents);
  for (const b of raw.blocks.values()) b.ents = fold(b.ents);
  const code = parseInt(raw.header.$INSUNITS ?? "0", 10);
  const scale = UNIT_MM[code] ?? 1;
  const warnings = new Set();
  const warn = (m) => warnings.add(m);
  const skipped = {};
  const prims = [];
  const walk = (ents, xf, layerOverride, depth) => {
    for (const e of ents) {
      let layer = first(e.codes, 8, "0");
      if (layer === "0" && layerOverride) layer = layerOverride;
      if (e.type === "INSERT") {
        if (depth > 8) { warn("Blöcke tiefer als 8 Ebenen übersprungen"); continue; }
        const b = raw.blocks.get(first(e.codes, 2, ""));
        if (!b) { warn("Block fehlt: " + first(e.codes, 2, "?")); continue; }
        const T = { sx: num(e.codes, 41, 1), sy: num(e.codes, 42, 1), rot: num(e.codes, 50) * DEG, t: [num(e.codes, 10), num(e.codes, 20)] };
        const cols = Math.max(1, num(e.codes, 70, 1)), rows = Math.max(1, num(e.codes, 71, 1)), dc = num(e.codes, 44), dr = num(e.codes, 45);
        for (let i = 0; i < cols; i++)
          for (let j = 0; j < rows; j++) {
            const off = [i * dc, j * dr];
            // Lage = t + Drehung · (Skalierung · (p − Basispunkt) + Rasterversatz)
            const local = (p) => transformPrim(p, { sx: 1, sy: 1, rot: 0, t: [-b.base[0], -b.base[1]] })
              .flatMap((q) => transformPrim(q, { sx: T.sx, sy: T.sy, rot: 0, t: off }))
              .flatMap((q) => transformPrim(q, { sx: 1, sy: 1, rot: T.rot, t: T.t }));
            walk(b.ents, (p) => local(p).flatMap(xf), layer, depth + 1);
          }
        continue;
      }
      if (SKIP.has(e.type)) { skipped[e.type] = (skipped[e.type] || 0) + 1; continue; }
      const ps = entityPrims(e, warn);
      if (ps === null) { skipped[e.type] = (skipped[e.type] || 0) + 1; continue; }
      for (const p of ps) for (const q of xf(p)) prims.push({ ...q, layer });
    }
  };
  walk(raw.ents, (p) => [p], null, 0);
  // Einheit
  const S = { sx: scale, sy: scale, rot: 0, t: [0, 0] };
  const out = scale === 1 ? prims : prims.flatMap((p) => transformPrim(p, S).map((q) => ({ ...q, layer: p.layer })));
  const layerCount = new Map();
  for (const p of out) layerCount.set(p.layer, (layerCount.get(p.layer) || 0) + 1);
  return { prims: out, layers: [...layerCount].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true })), unit: UNIT_NAME[code] || `Code ${code}`, scale, skipped, warnings: [...warnings] };
}

/** Hüllrechteck [[x0,y0],[x1,y1]] der Elemente */
export function primsBounds(prims) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); };
  for (const p of prims) {
    if (p.kind === "line") { add(p.a); add(p.b); }
    else if (p.kind === "ellipse") { const A = Math.hypot(...p.major); add([p.c[0] - A, p.c[1] - A]); add([p.c[0] + A, p.c[1] + A]); }
    else { add([p.c[0] - p.r, p.c[1] - p.r]); add([p.c[0] + p.r, p.c[1] + p.r]); }
  }
  return Number.isFinite(x0) ? [[x0, y0], [x1, y1]] : null;
}

/**
 * Elemente in die Skizze übernehmen. Gleiche Endpunkte (Toleranz tol) werden ein Punkt, damit Konturen geschlossen sind.
 * opts: { uid, offset: [dx, dy], tol, construction }. Rückgabe: { points, entities } (Anzahl neu)
 */
export function dxfToSketch(sk, prims, { uid, offset = [0, 0], tol = 1e-4, construction = false } = {}) {
  const grid = new Map();
  const key = (x, y) => `${Math.round(x / tol)},${Math.round(y / tol)}`;
  let nPts = 0, nEnt = 0;
  const pt = (q) => {
    const x = q[0] + offset[0], y = q[1] + offset[1];
    const k = key(x, y);
    let id = grid.get(k);
    if (!id) { id = uid("p"); sk.points.push({ id, x, y }); grid.set(k, id); nPts++; }
    return id;
  };
  const free = (q) => { const id = uid("p"); sk.points.push({ id, x: q[0] + offset[0], y: q[1] + offset[1] }); nPts++; return id; };
  const ent = (e) => { sk.entities.push({ id: uid(e.type === "line" ? "l" : e.type === "circle" ? "c" : e.type === "ellipse" ? "e" : "b"), ...e, ...(construction ? { construction: true } : {}) }); nEnt++; };
  for (const p of prims) {
    if (p.kind === "line") {
      if (Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]) < tol) continue;
      ent({ type: "line", p1: pt(p.a), p2: pt(p.b) });
    } else if (p.kind === "circle") {
      if (p.r > tol) ent({ type: "circle", c: free(p.c), r: p.r });
    } else if (p.kind === "arc") {
      if (!(p.r > tol)) continue;
      let sw = p.a1 - p.a0; while (sw <= 1e-12) sw += 2 * Math.PI;
      if (Math.abs(sw - 2 * Math.PI) < 1e-9) { ent({ type: "circle", c: free(p.c), r: p.r }); continue; }
      const P = (a) => [p.c[0] + p.r * Math.cos(a), p.c[1] + p.r * Math.sin(a)];
      ent({ type: "arc", c: free(p.c), p1: pt(P(p.a0)), p2: pt(P(p.a1)) });
    } else if (p.kind === "ellipse") {
      const A = Math.hypot(...p.major);
      if (A > tol) ent({ type: "ellipse", c: free(p.c), a: free([p.c[0] + p.major[0], p.c[1] + p.major[1]]), r: A * p.ratio });
    }
  }
  return { points: nPts, entities: nEnt };
}
