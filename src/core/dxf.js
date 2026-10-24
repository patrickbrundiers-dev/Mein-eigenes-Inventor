// DXF-Schreiber (AutoCAD R12 / AC1009 – wird von praktisch jedem CAD/CAM gelesen, auch Laser-Software)

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
    else if (e.type === "arc") {
      const c = pts.get(e.c), a = pts.get(e.p1), b = pts.get(e.p2);
      const r = Math.hypot(a.x - c.x, a.y - c.y);
      const a0 = (Math.atan2(a.y - c.y, a.x - c.x) * 180) / Math.PI, a1 = (Math.atan2(b.y - c.y, b.x - c.x) * 180) / Math.PI;
      w.arc(c.x, c.y, r, a0, a1, L);
    }
  }
  return w.toString();
}
