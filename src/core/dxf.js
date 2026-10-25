// DXF-Schreiber (AutoCAD R12 / AC1009 – wird von praktisch jedem CAD/CAM gelesen, auch Laser-Software)

import { ellipseGeom, ellipseSamples } from "./ellipse.js";

const f = (v) => {
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? "0" : String(r);
};

export class DxfWriter {
  constructor() {
    this.layers = new Map([["0", { color: 7, ltype: "CONTINUOUS" }]]);
    this.ents = [];
    this.ltypes = new Set(["CONTINUOUS"]);
  }
  layer(name, color = 7, ltype = "CONTINUOUS") {
    if (!this.layers.has(name)) this.layers.set(name, { color, ltype });
    if (ltype !== "CONTINUOUS") this.ltypes.add(ltype);
    return this;
  }
  line(x1, y1, x2, y2, layer = "0") {
    if (Math.hypot(x2 - x1, y2 - y1) < 1e-9) return this;
    this.ents.push(["0", "LINE", "8", layer, "10", f(x1), "20", f(y1), "30", "0", "11", f(x2), "21", f(y2), "31", "0"]);
    return this;
  }
  circle(cx, cy, r, layer = "0") {
    this.ents.push(["0", "CIRCLE", "8", layer, "10", f(cx), "20", f(cy), "30", "0", "40", f(r)]);
    return this;
  }
  /** Winkel in Grad, gegen den Uhrzeigersinn von a0 nach a1 */
  arc(cx, cy, r, a0, a1, layer = "0") {
    this.ents.push(["0", "ARC", "8", layer, "10", f(cx), "20", f(cy), "30", "0", "40", f(r), "50", f(a0), "51", f(a1)]);
    return this;
  }
  polyline(pts, layer = "0", closed = false) {
    if (pts.length < 2) return this;
    const e = ["0", "POLYLINE", "8", layer, "66", "1", "10", "0", "20", "0", "30", "0", "70", closed ? "1" : "0"];
    for (const p of pts) e.push("0", "VERTEX", "8", layer, "10", f(p[0]), "20", f(p[1]), "30", "0");
    e.push("0", "SEQEND", "8", layer);
    this.ents.push(e);
    return this;
  }
  text(x, y, h, str, layer = "0", { align = "left", rot = 0 } = {}) {
    const ah = { left: 0, center: 1, right: 2 }[align] || 0;
    const e = ["0", "TEXT", "8", layer, "10", f(x), "20", f(y), "30", "0", "40", f(h), "1", sanitize(str), "50", f(rot)];
    if (ah) e.push("72", String(ah), "11", f(x), "21", f(y), "31", "0");
    this.ents.push(e);
    return this;
  }
  toString() {
    const out = [];
    const push = (...a) => out.push(...a);
    push("0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "9", "$INSUNITS", "70", "4", "0", "ENDSEC");
    push("0", "SECTION", "2", "TABLES");
    // Linientypen
    push("0", "TABLE", "2", "LTYPE", "70", String(this.ltypes.size));
    for (const lt of this.ltypes) {
      if (lt === "CONTINUOUS") push("0", "LTYPE", "2", "CONTINUOUS", "70", "0", "3", "Solid line", "72", "65", "73", "0", "40", "0.0");
      else if (lt === "DASHED") push("0", "LTYPE", "2", "DASHED", "70", "0", "3", "__ __ __", "72", "65", "73", "2", "40", "4.5", "49", "3.0", "49", "-1.5");
      else if (lt === "CENTER") push("0", "LTYPE", "2", "CENTER", "70", "0", "3", "____ _ ____", "72", "65", "73", "4", "40", "15.0", "49", "9.0", "49", "-2.0", "49", "2.0", "49", "-2.0");
    }
    push("0", "ENDTAB");
    push("0", "TABLE", "2", "LAYER", "70", String(this.layers.size));
    for (const [name, l] of this.layers) push("0", "LAYER", "2", name, "70", "0", "62", String(l.color), "6", l.ltype);
    push("0", "ENDTAB", "0", "ENDSEC");
    push("0", "SECTION", "2", "ENTITIES");
    for (const e of this.ents) out.push(...e);
    push("0", "ENDSEC", "0", "EOF");
    return out.join("\r\n") + "\r\n";
  }
}

function sanitize(s) {
  // R12 kennt kein UTF-8: Umlaute als %%-Codes/ersetzen
  return String(s)
    .replace(/Ø|ø/g, "%%c")
    .replace(/°/g, "%%d")
    .replace(/±/g, "%%p")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
    .replace(/[^\x20-\x7E%]/g, "?");
}

/** Skizze (2D) als DXF – exakte Linien, Bögen, Kreise. Konstruktionslinien auf eigenem Layer. */
export function sketchToDxf(sketch) {
  const w = new DxfWriter().layer("KONTUR", 7).layer("KONSTRUKTION", 8, "DASHED");
  const pts = new Map(sketch.points.map((p) => [p.id, p]));
  for (const e of sketch.entities) {
    const L = e.construction ? "KONSTRUKTION" : "KONTUR";
    if (e.type === "line") { const a = pts.get(e.p1), b = pts.get(e.p2); w.line(a.x, a.y, b.x, b.y, L); }
    else if (e.type === "circle") { const c = pts.get(e.c); w.circle(c.x, c.y, e.r, L); }
    else if (e.type === "ellipse") { // R12 kennt kein ELLIPSE: geschlossene Polylinie, Sehnenfehler ≤ 0,01 mm
      const g = ellipseGeom(pts.get(e.c), pts.get(e.a), e.r), R = Math.max(g.A, g.B);
      const n = Math.min(2048, Math.max(64, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - 0.01 / R)))));
      w.polyline(ellipseSamples(g, n), L, true);
    }
    else if (e.type === "arc") {
      const c = pts.get(e.c), a = pts.get(e.p1), b = pts.get(e.p2);
      const r = Math.hypot(a.x - c.x, a.y - c.y);
      const a0 = (Math.atan2(a.y - c.y, a.x - c.x) * 180) / Math.PI, a1 = (Math.atan2(b.y - c.y, b.x - c.x) * 180) / Math.PI;
      w.arc(c.x, c.y, r, a0, a1, L);
    }
  }
  return w.toString();
}

/**
 * Segmente (aus svgPathSegments) als DXF schreiben: doppelte Kanten entfernen, Teilbögen eines Kreises
 * zu einem echten CIRCLE zusammenfassen, Ursprung auf die linke untere Ecke legen.
 */
export function segmentsToDxf(segments, { layer = "KONTUR", origin = "min", text = null } = {}) {
  const segs = dedupeSegments(segments);
  // Kreise: Bögen mit gleichem Mittelpunkt/Radius sammeln
  const groups = [];
  const rest = [];
  for (const s of segs) {
    if (s.t !== "arc") { rest.push(s); continue; }
    let g = groups.find((x) => Math.hypot(x.cx - s.cx, x.cy - s.cy) < 1e-4 && Math.abs(x.r - s.r) < 1e-4);
    if (!g) { g = { cx: s.cx, cy: s.cy, r: s.r, arcs: [] }; groups.push(g); }
    g.arcs.push(s);
  }
  const box = bounds(segs);
  const ox = origin === "min" && box ? box.x0 : 0, oy = origin === "min" && box ? box.y0 : 0;
  const w = new DxfWriter().layer(layer, 7).layer("TEXT", 3);
  let circles = 0, arcs = 0, lines = 0;
  for (const g of groups) {
    const covered = coveredSweep(g.arcs);
    if (covered >= 360) { w.circle(g.cx - ox, g.cy - oy, g.r, layer); circles++; }
    else for (const a of g.arcs) { w.arc(a.cx - ox, a.cy - oy, a.r, a.a0, a.a1, layer); arcs++; }
  }
  for (const s of rest) {
    if (s.t === "line") { w.line(s.a[0] - ox, s.a[1] - oy, s.b[0] - ox, s.b[1] - oy, layer); lines++; }
    else if (s.t === "poly") { w.polyline(s.pts.map((p) => [p[0] - ox, p[1] - oy]), layer); lines++; }
  }
  if (text && box) w.text(0, -8, 3.5, text, "TEXT");
  return { dxf: w.toString(), circles, arcs, lines, width: box ? box.x1 - box.x0 : 0, height: box ? box.y1 - box.y0 : 0 };
}

function coveredSweep(arcs) {
  // exakte Vereinigung der Winkelintervalle (Grad), damit schmale Schlitze nicht verloren gehen
  const iv = [];
  for (const a of arcs) {
    if (a.full) return 360;
    const s = ((a.a0 % 360) + 360) % 360;
    let e = ((a.a1 % 360) + 360) % 360;
    if (e <= s + 1e-9) e += 360;
    if (e > 360) { iv.push([s, 360], [0, e - 360]); } else iv.push([s, e]);
  }
  iv.sort((p, q) => p[0] - q[0]);
  let total = 0, cs = null, ce = null;
  for (const [s, e] of iv) {
    if (cs === null) { cs = s; ce = e; continue; }
    if (s <= ce + 1e-6) ce = Math.max(ce, e);
    else { total += ce - cs; cs = s; ce = e; }
  }
  if (cs !== null) total += ce - cs;
  return total >= 360 - 1e-6 ? 360 : total;
}
function dedupeSegments(segs) {
  const out = [];
  const key = (s) => {
    const r = (v) => Math.round(v * 1000);
    if (s.t === "line") { const a = [r(s.a[0]), r(s.a[1])], b = [r(s.b[0]), r(s.b[1])]; return "L" + (a < b ? a.concat(b) : b.concat(a)).join(","); }
    if (s.t === "arc") return "A" + [r(s.cx), r(s.cy), r(s.r), r(s.a0), r(s.a1)].join(",");
    return "P" + s.pts.map((p) => r(p[0]) + "," + r(p[1])).join(";");
  };
  const seen = new Set();
  for (const s of segs) { const k = key(s); if (!seen.has(k)) { seen.add(k); out.push(s); } }
  return out;
}
function bounds(segs) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const s of segs) {
    if (s.t === "line") { add(...s.a); add(...s.b); }
    else if (s.t === "poly") s.pts.forEach((p) => add(...p));
    else {
      const covered = s.full ? 360 : null;
      if (covered) { add(s.cx - s.r, s.cy - s.r); add(s.cx + s.r, s.cy + s.r); }
      else {
        const pa = (d) => [s.cx + s.r * Math.cos((d * Math.PI) / 180), s.cy + s.r * Math.sin((d * Math.PI) / 180)];
        add(...pa(s.a0)); add(...pa(s.a1));
        let a = s.a0, b = s.a1;
        if (b <= a) b += 360;
        for (let q = Math.ceil(a / 90) * 90; q < b; q += 90) add(...pa(q));
      }
    }
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}
