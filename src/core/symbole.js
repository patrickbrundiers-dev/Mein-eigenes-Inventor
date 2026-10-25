// Zeichnungssymbole als einfache Geometrie (Linien, Kreise, Linienzüge), damit SVG und DXF gleich aussehen:
// Oberflächenangabe (DIN EN ISO 21920-1, früher ISO 1302), Form- und Lagetoleranz (DIN EN ISO 1101), Bezug (ISO 5459).

export const SURFACE_KINDS = Object.freeze([
  { value: "beliebig", label: "beliebiges Verfahren" },
  { value: "spanend", label: "Materialabtrag gefordert (spanend)" },
  { value: "ohne", label: "Materialabtrag unzulässig" },
]);

/** Oberflächenzeichen mit Wurzel im Punkt (x, y) (Blattkoordinaten, y nach unten), Text über der Bezugslinie */
export function surfaceSymbol(kind, x, y, text = "", textWidth = (s) => s.length * 2) {
  const H1 = 5, H2 = 10.5, t60 = Math.tan(Math.PI / 3);
  const a = [x - H1 / t60, y - H1], b = [x + H2 / t60, y - H2];
  const lines = [[a[0], a[1], x, y], [x, y, b[0], b[1]]], circles = [];
  const tw = text ? Math.max(8, textWidth(text) + 2) : 0;
  if (tw) lines.push([b[0], b[1], b[0] + tw, b[1]]);
  if (kind === "spanend") lines.push([a[0], a[1], x + H1 / t60, a[1]]);
  if (kind === "ohne") { const r = (H1 / t60) * Math.sin(Math.PI / 3) * 0.62; circles.push([x, y - H1 + r * 1.05, r]); }
  return { lines, circles, polys: [], texts: text ? [{ x: b[0] + 1, y: b[1] + 3.6, text, anchor: "start" }] : [] };
}

export function validateSurface(s) {
  if (!SURFACE_KINDS.some((k) => k.value === s?.kind)) return { ok: false, error: "Art der Oberfläche wählen" };
  const text = String(s.text ?? "").trim();
  if (text.length > 30) return { ok: false, error: "Angabe höchstens 30 Zeichen (z. B. Ra 3,2)" };
  return { ok: true, value: { kind: s.kind, text } };
}

// Toleranzarten nach ISO 1101: datum = "nein" (Formtoleranz), "kann", "muss"
export const GDT_KINDS = Object.freeze([
  { value: "geradheit", label: "Geradheit", group: "Form", datum: "nein" },
  { value: "ebenheit", label: "Ebenheit", group: "Form", datum: "nein" },
  { value: "rundheit", label: "Rundheit", group: "Form", datum: "nein" },
  { value: "zylinderform", label: "Zylinderform", group: "Form", datum: "nein" },
  { value: "linienform", label: "Linienform", group: "Profil", datum: "kann" },
  { value: "flaechenform", label: "Flächenform", group: "Profil", datum: "kann" },
  { value: "parallelitaet", label: "Parallelität", group: "Richtung", datum: "muss" },
  { value: "rechtwinkligkeit", label: "Rechtwinkligkeit", group: "Richtung", datum: "muss" },
  { value: "neigung", label: "Neigung", group: "Richtung", datum: "muss" },
  { value: "position", label: "Position", group: "Ort", datum: "kann" },
  { value: "koaxialitaet", label: "Koaxialität", group: "Ort", datum: "muss" },
  { value: "symmetrie", label: "Symmetrie", group: "Ort", datum: "muss" },
  { value: "lauf", label: "Lauf (Rund-/Planlauf)", group: "Lauf", datum: "muss" },
  { value: "gesamtlauf", label: "Gesamtlauf", group: "Lauf", datum: "muss" },
]);

const DATUM_RE = /^[A-Z](-[A-Z])?$/;

/** Toleranzrahmen prüfen → {ok, value: {sym, tol, dia, datums: []}} */
export function validateGdt(g) {
  const kind = GDT_KINDS.find((k) => k.value === g?.sym);
  if (!kind) return { ok: false, error: "Toleranzart wählen" };
  const tol = typeof g.tol === "string" ? Number(g.tol.replace(",", ".")) : g.tol;
  if (!(tol > 0 && tol < 100)) return { ok: false, error: "Toleranzwert in mm angeben (z. B. 0,05)" };
  const datums = (Array.isArray(g.datums) ? g.datums : String(g.datums ?? "").split(/[\s|;,]+/)).map((x) => String(x).trim().toUpperCase()).filter(Boolean);
  if (datums.length > 3) return { ok: false, error: "Höchstens drei Bezüge" };
  if (datums.some((x) => !DATUM_RE.test(x))) return { ok: false, error: "Bezug als Buchstabe (A) oder gemeinsamer Bezug (A-B)" };
  if (kind.datum === "nein" && datums.length) return { ok: false, error: kind.label + " ist eine Formtoleranz und hat keinen Bezug" };
  if (kind.datum === "muss" && !datums.length) return { ok: false, error: kind.label + " braucht einen Bezug (z. B. A)" };
  return { ok: true, value: { sym: kind.value, tol, dia: !!g.dia, datums } };
}

export function validateDatumLetter(s) {
  const l = String(s ?? "").trim().toUpperCase();
  return /^[A-Z]{1,2}$/.test(l) && !["I", "O", "Q"].includes(l) ? { ok: true, value: l } : { ok: false, error: "Bezugsbuchstabe A–Z (ohne I, O, Q)" };
}

const arc = (cx, cy, r, a0, a1, n = 12) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; });

/** Zeichen einer Toleranzart in einem Feld mit Mitte (cx, cy), Größe s (≈ Schrifthöhe) */
export function gdtGlyph(sym, cx, cy, s = 3.5) {
  const h = s / 2, L = [], C = [], P = [];
  const sl = (dx) => [cx - h * 0.6 + dx, cy + h, cx + h * 0.6 + dx, cy - h]; // um 60° geneigte Linie
  switch (sym) {
    case "geradheit": L.push([cx - h * 1.2, cy, cx + h * 1.2, cy]); break;
    case "ebenheit": P.push({ pts: [[cx - h * 1.2, cy + h * 0.6], [cx + h * 0.6, cy + h * 0.6], [cx + h * 1.2, cy - h * 0.6], [cx - h * 0.6, cy - h * 0.6]], closed: true }); break;
    case "rundheit": C.push([cx, cy, h * 0.9]); break;
    case "zylinderform": C.push([cx, cy, h * 0.7]); L.push(sl(-h * 0.7), sl(h * 0.7)); break;
    case "linienform": P.push({ pts: arc(cx, cy + h * 0.5, h, 0, Math.PI) }); break;
    case "flaechenform": P.push({ pts: arc(cx, cy + h * 0.5, h, 0, Math.PI), closed: true }); break;
    case "parallelitaet": L.push(sl(-h * 0.45), sl(h * 0.45)); break;
    case "rechtwinkligkeit": L.push([cx - h * 1.1, cy + h, cx + h * 1.1, cy + h], [cx, cy + h, cx, cy - h]); break;
    case "neigung": L.push([cx - h * 1.1, cy + h, cx + h * 1.1, cy + h], [cx - h * 1.1, cy + h, cx + h * 1.0, cy - h * 0.7]); break;
    case "position": C.push([cx, cy, h * 0.65]); L.push([cx - h * 1.1, cy, cx + h * 1.1, cy], [cx, cy - h * 1.1, cx, cy + h * 1.1]); break;
    case "koaxialitaet": C.push([cx, cy, h * 0.45], [cx, cy, h * 0.95]); break;
    case "symmetrie": L.push([cx - h * 1.2, cy, cx + h * 1.2, cy], [cx - h * 0.7, cy - h * 0.6, cx + h * 0.7, cy - h * 0.6], [cx - h * 0.7, cy + h * 0.6, cx + h * 0.7, cy + h * 0.6]); break;
    case "lauf": case "gesamtlauf": {
      const tips = sym === "lauf" ? [[cx - h * 0.4, cy + h, cx + h * 0.5, cy - h]] : [[cx - h * 1.0, cy + h, cx - h * 0.1, cy - h], [cx + h * 0.1, cy + h, cx + h * 1.0, cy - h]];
      for (const [x1, y1, x2, y2] of tips) {
        L.push([x1, y1, x2, y2]);
        const ux = x2 - x1, uy = y2 - y1, l = Math.hypot(ux, uy), e = [ux / l, uy / l], w = [-e[1] * 0.45, e[0] * 0.45];
        P.push({ pts: [[x2, y2], [x2 - e[0] * 1.3 + w[0], y2 - e[1] * 1.3 + w[1]], [x2 - e[0] * 1.3 - w[0], y2 - e[1] * 1.3 - w[1]]], closed: true, fill: true });
      }
      if (sym === "gesamtlauf") L.push([cx - h * 1.0, cy + h, cx + h * 0.1, cy + h]);
      break;
    }
    default: break;
  }
  return { lines: L, circles: C, polys: P };
}

/**
 * Toleranzrahmen mit linker oberer Ecke (x, y): Feld Zeichen | Wert | Bezüge, Hinweislinie mit Pfeil zum Punkt p.
 * Rückgabe { lines, circles, polys, texts, width, height }
 */
export function gdtFrame(g, x, y, p, textWidth = (s) => s.length * 2) {
  const H = 7, lines = [], circles = [], polys = [], texts = [];
  const val = (g.dia ? "Ø" : "") + String(Math.round(g.tol * 1000) / 1000).replace(".", ",");
  const cells = [H, Math.max(H, textWidth(val) + 3), ...g.datums.map((d) => Math.max(H, textWidth(d) + 3))];
  const W = cells.reduce((a, b) => a + b, 0);
  lines.push([x, y, x + W, y], [x + W, y, x + W, y + H], [x + W, y + H, x, y + H], [x, y + H, x, y]);
  let cx = x;
  cells.forEach((w, i) => { if (i) lines.push([cx, y, cx, y + H]); cx += w; });
  const gl = gdtGlyph(g.sym, x + H / 2, y + H / 2);
  lines.push(...gl.lines); circles.push(...gl.circles); polys.push(...gl.polys);
  texts.push({ x: x + H + cells[1] / 2, y: y + H / 2 + 1.25, text: val, anchor: "middle" });
  cx = x + H + cells[1];
  g.datums.forEach((d, i) => { texts.push({ x: cx + cells[2 + i] / 2, y: y + H / 2 + 1.25, text: d, anchor: "middle" }); cx += cells[2 + i]; });
  if (p) {
    // Hinweislinie vom näheren Rand des Rahmens, Pfeil am Element
    const sx = p[0] < x + W / 2 ? x : x + W, sy = y + H / 2;
    lines.push([sx, sy, p[0], p[1]]);
    polys.push(arrowHead(sx, sy, p[0], p[1]));
  }
  return { lines, circles, polys, texts, width: W, height: H };
}

/** Bezugsdreieck (gefüllt) an p, Linie zum Kästchen mit Buchstabe, Kästchenmitte in at */
export function datumSymbol(letter, p, at) {
  const S = 7, lines = [], polys = [];
  const [ax, ay] = at;
  lines.push([ax - S / 2, ay - S / 2, ax + S / 2, ay - S / 2], [ax + S / 2, ay - S / 2, ax + S / 2, ay + S / 2], [ax + S / 2, ay + S / 2, ax - S / 2, ay + S / 2], [ax - S / 2, ay + S / 2, ax - S / 2, ay - S / 2]);
  const dx = p[0] - ax, dy = p[1] - ay, l = Math.hypot(dx, dy) || 1, e = [dx / l, dy / l];
  // Kästchenrand in Richtung p
  const tEdge = Math.min(Math.abs(e[0]) > 1e-9 ? S / 2 / Math.abs(e[0]) : Infinity, Math.abs(e[1]) > 1e-9 ? S / 2 / Math.abs(e[1]) : Infinity);
  const tri = 3, base = [p[0] - e[0] * tri * 0.866, p[1] - e[1] * tri * 0.866], w = [-e[1] * tri / 2, e[0] * tri / 2];
  if (l > tEdge + tri) lines.push([ax + e[0] * tEdge, ay + e[1] * tEdge, base[0], base[1]]);
  polys.push({ pts: [[base[0] + w[0], base[1] + w[1]], [base[0] - w[0], base[1] - w[1]], [p[0], p[1]]], closed: true, fill: true });
  return { lines, circles: [], polys, texts: [{ x: ax, y: ay + 1.75, text: letter, anchor: "middle" }] };
}

function arrowHead(x1, y1, x2, y2, L = 3, w = 0.9) {
  const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, e = [dx / l, dy / l];
  return { pts: [[x2, y2], [x2 - e[0] * L - e[1] * w, y2 - e[1] * L + e[0] * w], [x2 - e[0] * L + e[1] * w, y2 - e[1] * L - e[0] * w]], closed: true, fill: true };
}
