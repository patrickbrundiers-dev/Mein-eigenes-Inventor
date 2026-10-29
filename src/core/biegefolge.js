// Biegefolge für die Abkantpresse (W7): Reihenfolge der Kantungen eines Kantteils so wählen, dass das Teil in keiner
// Stellung an Oberwerkzeug, Oberwange, Unterwerkzeug oder Unterwange anstößt. Reine Rechnung im Querschnitt (2D).
//
// Modell: Mittellinie des Kantteils als Polylinie (Schenkel, Biegungen als Knick, Blechdicke als Sicherheitsabstand).
// Beim Biegen liegt der Knick im V der Matrize, die Innenseite der Biegung zeigt zum Stempel (Teil wird dafür
// gewendet). Geprüft wird bei 25, 50, 75 und 100 % des Biegewinkels, jeweils in beiden Einlegerichtungen.
// Werkzeuge (Querschnitt, Knick im Ursprung, y nach oben): Matrize unten, Stempel oben bis zur Werkzeughöhe, darüber
// die Oberwange. Werte sind Richtwerte üblicher Werkzeuge – eigene Maße in den Feldern eintragen.

const DEG = Math.PI / 180;

/** Stempelformen: Umriss als Polygon [x, y] (Spitze im Ursprung), h = Werkzeughöhe */
export const PUNCHES = {
  gerade: { label: "Gerader Stempel", shape: (h) => [[0, 0], [-4, 6], [-13, 20], [-13, h], [13, h], [13, 20], [4, 6]] },
  schwanenhals: { label: "Schwanenhals (Gänsehals)", shape: (h) => [[0, 0], [-4, 6], [-10, 20], [-10, 0.35 * h], [-50, 0.55 * h], [-50, h], [13, h], [13, 0.9 * h], [6, 0.6 * h], [6, 20], [4, 6]] },
  spitz: { label: "Spitzer Stempel (30°)", shape: (h) => [[0, 0], [-4, 12], [-8, 30], [-8, h], [8, h], [8, 30], [4, 12]] },
};

/** V-Öffnung der Matrize nach Faustregel: 6 × t bis 3 mm, 8 × t bis 10 mm, darüber 10 × t, auf übliche Weiten gerundet */
export function dieWidth(t) {
  const f = t <= 3 ? 6 : t <= 10 ? 8 : 10;
  const v = f * t;
  const STD = [6, 8, 10, 12, 16, 20, 24, 30, 35, 40, 50, 60, 80, 100];
  return STD.find((x) => x >= v - 1e-9) || Math.ceil(v / 10) * 10;
}

/** Kürzester Schenkel, der beim 90°-Biegen noch auf der Matrize aufliegt (≈ 0,7 × V) */
export const minFlange = (V) => Math.ceil(0.7 * V);

/** Umriss der Werkzeuge in Knick-Koordinaten (Ursprung = Knick, y nach oben), je als Polygon */
export function toolPolygons({ punch = "gerade", punchH = 100, V = 16, dieW = 60, dieH = 60, ramW = 60, gap = 0 }) {
  const P = (PUNCHES[punch] || PUNCHES.gerade).shape(punchH);
  const g = gap; // Stempel liegt um die Blechdicke über der Mittellinie
  const punchPoly = P.map(([x, y]) => [x, y + g]);
  const ram = [[-ramW / 2, punchH + g], [-ramW / 2, punchH + 2000], [ramW / 2, punchH + 2000], [ramW / 2, punchH + g]];
  const die = [[-dieW / 2, -g], [-V / 2, -g], [0, -V / 2 - g], [V / 2, -g], [dieW / 2, -g], [dieW / 2, -dieH], [-dieW / 2, -dieH]];
  const bed = [[-2000, -dieH], [2000, -dieH], [2000, -dieH - 2000], [-2000, -dieH - 2000]];
  return { punch: punchPoly, ram, die, bed };
}

function inside(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Punkte der Mittellinie für Schenkel und Winkel (Grad, Vorzeichen = Richtung) ab dem Ursprung in +x */
export function polyline(legs, angles) {
  const pts = [[0, 0]];
  let dir = 0;
  legs.forEach((L, i) => {
    const p = pts[pts.length - 1];
    pts.push([p[0] + L * Math.cos(dir), p[1] + L * Math.sin(dir)]);
    if (i < angles.length) dir += angles[i] * DEG;
  });
  return pts;
}

/** Lage des Teils beim Biegen von Biegung j: Knick im Ursprung, Innenwinkel öffnet nach oben; mirror = Teil umgedreht eingelegt */
export function placeForBend(pts, j, mirror = false) {
  const V = pts[j + 1], A = pts[j], B = pts[j + 2];
  const u1 = norm(sub(A, V)), u2 = norm(sub(B, V));
  let bis = norm(add(u1, u2));
  if (Math.hypot(...add(u1, u2)) < 1e-9) bis = [-u1[1], u1[0]]; // flach: Innenseite nach der Biegerichtung
  const rot = Math.PI / 2 - Math.atan2(bis[1], bis[0]);
  const c = Math.cos(rot), s = Math.sin(rot);
  return pts.map((p) => { const q = sub(p, V); const r = [q[0] * c - q[1] * s, q[0] * s + q[1] * c]; return mirror ? [-r[0], r[1]] : r; });
}

/** Kollisionen eines gelegten Teils mit den Werkzeugen (Abtastung alle 2 mm, Nähe des Knicks ausgenommen) */
export function collisions(placed, tools, skip = 0) {
  const hits = new Set();
  for (let i = 0; i < placed.length - 1; i++) {
    const a = placed[i], b = placed[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 2));
    for (let k = 0; k <= n; k++) {
      const p = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
      if (Math.hypot(p[0], p[1]) < skip) continue;
      for (const [name, poly] of Object.entries(tools)) if (inside(p, poly)) hits.add(name);
    }
  }
  return [...hits];
}

const TOOL_NAMES = { punch: "Stempel", ram: "Oberwange", die: "Matrize", bed: "Unterwange" };

/**
 * Biegefolge suchen. legs [mm], angles [°], t, tool { punch, punchH, V (0 = Faustregel), dieW, dieH, ramW }.
 * Rückgabe { ok, V, steps: [{ bend (Nr. ab 1), angle, mirror, turn (Teil wenden gegenüber dem Schritt davor), hits }],
 *   issues: [Text] }. Umschläge (180°) kommen ans Ende (vorbiegen und zudrücken, nicht geprüft).
 */
export function bendSequence(legs, angles, t, tool = {}) {
  const V = tool.V > 0 ? tool.V : dieWidth(t);
  const tools = toolPolygons({ ...tool, V, gap: t / 2 });
  const issues = [];
  const minF = minFlange(V);
  legs.forEach((L, i) => { if (L < minF && (i === 0 || i === legs.length - 1)) issues.push(`Schenkel ${i + 1} (${fmt(L)} mm) kürzer als ${minF} mm – liegt auf V ${V} nicht sicher auf`); });
  const n = angles.length;
  const hems = angles.map((a, i) => (Math.abs(a) > 179 ? i : -1)).filter((i) => i >= 0);
  const normal = angles.map((_, i) => i).filter((i) => !hems.includes(i));
  const skip = Math.max(V / 2, 2 * t) + 2;
  const state = (done, j, f) => angles.map((a, i) => (i === j ? a * f : done.has(i) ? a : 0));
  const tryBend = (done, j) => {
    for (const mirror of [false, true]) {
      let hits = [];
      for (const f of [0.25, 0.5, 0.75, 1]) {
        const pl = placeForBend(polyline(legs, state(done, j, f)), j, mirror);
        hits = collisions(pl, tools, skip);
        if (hits.length) break;
      }
      if (!hits.length) return { mirror, hits: [] };
    }
    const pl = placeForBend(polyline(legs, state(done, j, 1)), j, false);
    return { mirror: false, hits: collisions(pl, tools, skip) };
  };
  // Tiefensuche, außen nach innen bevorzugt; erste kollisionsfreie Folge gewinnt, sonst die mit den wenigsten Treffern
  const prefer = [...normal].sort((a, b) => Math.min(a, n - 1 - a) - Math.min(b, n - 1 - b) || a - b);
  let best = null, tries = 0;
  const dfs = (done, seq, bad) => {
    if (best && best.bad === 0) return;
    if (++tries > 20000) return;
    if (seq.length === normal.length) { if (!best || bad < best.bad) best = { seq: [...seq], bad }; return; }
    if (best && bad >= best.bad) return;
    for (const j of prefer) {
      if (done.has(j)) continue;
      const r = tryBend(done, j);
      done.add(j); seq.push({ j, ...r });
      dfs(done, seq, bad + (r.hits.length ? 1 : 0));
      seq.pop(); done.delete(j);
      if (best && best.bad === 0) return;
    }
  };
  dfs(new Set(), [], 0);
  const seq = (best?.seq || []).concat(hems.map((j) => ({ j, mirror: false, hits: [], hem: true })));
  let prevSign = null;
  const steps = seq.map((s) => {
    const sign = Math.sign(angles[s.j]);
    const turn = prevSign !== null && sign !== prevSign;
    prevSign = sign;
    return { bend: s.j + 1, angle: angles[s.j], mirror: s.mirror, turn, hem: !!s.hem, hits: s.hits.map((h) => TOOL_NAMES[h] || h) };
  });
  if (hems.length) issues.push("Umschlag: zuerst auf ca. 30° vorbiegen, dann mit Flachwerkzeug zudrücken (nicht geprüft)");
  const ok = steps.every((s) => !s.hits.length);
  if (!ok) issues.push("Keine Folge ohne Anstoßen gefunden – anderes Oberwerkzeug (Schwanenhals), höheres Werkzeug oder Teil teilen");
  return { ok, V, steps, issues };
}

/** Skizze eines Schritts als SVG (Teil und Werkzeuge), Breite w mm */
export function stepSvg(legs, angles, steps, k, t, tool = {}, w = 60) {
  const V = tool.V > 0 ? tool.V : dieWidth(t);
  const tools = toolPolygons({ ...tool, V, gap: t / 2 });
  const done = new Set(steps.slice(0, k).map((s) => s.bend - 1));
  const s = steps[k], j = s.bend - 1;
  const pl = placeForBend(polyline(legs, angles.map((a, i) => (i === j || done.has(i) ? a : 0))), j, s.mirror);
  const xs = pl.map((p) => p[0]), ys = pl.map((p) => p[1]);
  const ph = tool.punchH || 100;
  const x0 = Math.min(-80, ...xs) - 10, x1 = Math.max(80, ...xs) + 10, y0 = Math.min(-(tool.dieH || 60) - 10, ...ys) - 10, y1 = Math.max(ph + 40, ...ys) + 10;
  const vb = `${x0} ${-y1} ${x1 - x0} ${y1 - y0}`;
  const poly = (pts, fill) => `<polygon points="${pts.map(([x, y]) => `${x},${-Math.min(y, y1 + 50)}`).join(" ")}" fill="${fill}" stroke="#555" stroke-width="${(x1 - x0) / 300}"/>`;
  const col = s.hits.length ? "#c62828" : "#0d47a1";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${(w * (y1 - y0)) / (x1 - x0)}mm" viewBox="${vb}">${poly(tools.bed, "#ddd")}${poly(tools.die, "#bbb")}${poly(tools.ram, "#ddd")}${poly(tools.punch, "#bbb")}<polyline points="${pl.map(([x, y]) => `${x},${-y}`).join(" ")}" fill="none" stroke="${col}" stroke-width="${Math.max(t, (x1 - x0) / 150)}" stroke-linejoin="round"/></svg>`;
}

/** Biegeblatt (A4 hoch) mit Tabelle und Skizze je Schritt, für mappeHtml */
export function bendSheetPage({ title = "", legs, angles, t, tool = {}, result }) {
  const esc = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const P = PUNCHES[tool.punch] || PUNCHES.gerade;
  const cells = result.steps.map((s, k) => `<div style="display:inline-block;width:58mm;margin:0 2mm 3mm 0;vertical-align:top;border:0.2mm solid #999;padding:1mm"><b>Schritt ${k + 1}:</b> Biegung ${s.bend}, ${fmt(Math.abs(s.angle))}°${s.turn ? ", Teil wenden" : ""}${s.mirror ? ", umgedreht einlegen" : ""}${s.hem ? " (Umschlag)" : ""}${s.hits.length ? `<br><span style="color:#c62828">stößt an: ${esc(s.hits.join(", "))}</span>` : ""}<br>${s.hem ? "" : stepSvg(legs, angles, result.steps, k, t, tool, 56)}</div>`).join("");
  const html = `<div class="lst"><h1>Biegefolge</h1><div class="sub">${esc([title, `t = ${fmt(t)} mm`, `Matrize V ${result.V}`, `${P.label}, Höhe ${tool.punchH || 100} mm`].filter(Boolean).join(" · "))}</div>
<p>Schenkel ${legs.map((x) => fmt(x)).join(" / ")} mm, Winkel ${angles.map((x) => fmt(x) + "°").join(" / ")}</p>${result.issues.length ? `<p style="color:#8a5a00">${result.issues.map(esc).join("<br>")}</p>` : ""}<div>${cells}</div></div>`;
  return { html, width: 210, height: 297 };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const norm = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
const fmt = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
