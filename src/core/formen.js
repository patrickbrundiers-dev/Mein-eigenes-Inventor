// Sweeping (Profil entlang Pfad), Erhebung (Loft), Spirale und Muster entlang Pfad: reine Rechnung ohne Kernel.
// Pfade sind offene oder geschlossene Ketten aus Linien und Bögen einer Skizze (2D, Skizzenkoordinaten).

const EPS = 1e-6;
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Linien und Bögen einer (gelösten) Skizze zu einer Kette ordnen. Konstruktionslinien zählen nicht.
 * Rückgabe { pieces: [{t: "line", a, b} | {t: "arc", a, m, b, c, r, a0, a1}], closed } oder Fehler.
 */
export function pathChain(sketch) {
  const pts = new Map((sketch.points || []).map((p) => [p.id, [p.x, p.y]]));
  const segs = [];
  for (const e of sketch.entities || []) {
    if (e.construction) continue;
    if (e.type === "line") segs.push({ t: "line", a: pts.get(e.p1), b: pts.get(e.p2) });
    else if (e.type === "arc") {
      const c = pts.get(e.c), p1 = pts.get(e.p1), p2 = pts.get(e.p2);
      const r = d2(p1, c);
      const a0 = Math.atan2(p1[1] - c[1], p1[0] - c[0]);
      let a1 = Math.atan2(p2[1] - c[1], p2[0] - c[0]);
      while (a1 <= a0) a1 += 2 * Math.PI;
      const am = (a0 + a1) / 2;
      segs.push({ t: "arc", a: p1, b: p2, m: [c[0] + r * Math.cos(am), c[1] + r * Math.sin(am)], c, r, a0, a1 });
    }
  }
  if (!segs.length) throw new Error("Pfad-Skizze enthält keine Linien oder Bögen");
  // Endpunkte zählen: genau zwei mit Grad 1 (offen) oder keiner (geschlossen); kein Grad > 2
  const key = (p) => `${Math.round(p[0] / EPS)}|${Math.round(p[1] / EPS)}`;
  const deg = new Map();
  for (const s of segs) for (const p of [s.a, s.b]) deg.set(key(p), (deg.get(key(p)) || 0) + 1);
  if ([...deg.values()].some((n) => n > 2)) throw new Error("Pfad verzweigt sich – nur eine durchgehende Kette");
  const ends = [...deg.entries()].filter(([, n]) => n === 1).map(([k]) => k);
  const closed = ends.length === 0;
  if (!closed && ends.length !== 2) throw new Error("Pfad ist nicht zusammenhängend");
  const rest = [...segs];
  // Anfang: freies Ende des zuerst gezeichneten Elements (so, wie man den Pfad zeichnet)
  const start = closed ? rest[0].a : (() => {
    const first = rest.find((x) => ends.includes(key(x.a)) || ends.includes(key(x.b)));
    return ends.includes(key(first.a)) ? first.a : first.b;
  })();
  const out = [];
  let cur = start;
  while (rest.length) {
    const i = rest.findIndex((s) => d2(s.a, cur) < EPS * 10 || d2(s.b, cur) < EPS * 10);
    if (i < 0) throw new Error("Pfad ist nicht zusammenhängend");
    const s = rest.splice(i, 1)[0];
    const fwd = d2(s.a, cur) < EPS * 10;
    out.push(fwd ? { ...s } : reverse(s));
    cur = fwd ? s.b : s.a;
  }
  return { pieces: out, closed };
}

/** Kette umgekehrt durchlaufen (Richtung des Pfads tauschen) */
export function reverseChain(chain) {
  return { ...chain, pieces: chain.pieces.map(reverse).reverse() };
}

function reverse(s) {
  return s.t === "line" ? { t: "line", a: s.b, b: s.a } : { ...s, a: s.b, b: s.a, rev: !s.rev };
}

const pieceLen = (s) => (s.t === "line" ? d2(s.a, s.b) : s.r * (s.a1 - s.a0));
export const pathLength = (chain) => chain.pieces.reduce((n, s) => n + pieceLen(s), 0);

/** Punkt und Einheitstangente bei Bogenlänge t (0 … Länge) */
export function pathAt(chain, t) {
  let rest = Math.max(0, t);
  const P = chain.pieces;
  for (let k = 0; k < P.length; k++) {
    const s = P[k], L = pieceLen(s);
    if (rest <= L + 1e-9 || k === P.length - 1) {
      const u = L > 0 ? Math.min(1, rest / L) : 0;
      if (s.t === "line") {
        const d = [(s.b[0] - s.a[0]) / (L || 1), (s.b[1] - s.a[1]) / (L || 1)];
        return { p: [s.a[0] + (s.b[0] - s.a[0]) * u, s.a[1] + (s.b[1] - s.a[1]) * u], d };
      }
      // Bogen läuft gegen den Uhrzeigersinn a0 → a1; umgekehrt durchlaufen (rev) von a1 nach a0
      const ang = s.rev ? s.a1 - (s.a1 - s.a0) * u : s.a0 + (s.a1 - s.a0) * u;
      const p = [s.c[0] + s.r * Math.cos(ang), s.c[1] + s.r * Math.sin(ang)];
      const d = s.rev ? [Math.sin(ang), -Math.cos(ang)] : [-Math.sin(ang), Math.cos(ang)];
      return { p, d };
    }
    rest -= L;
  }
  return { p: P[0].a, d: [1, 0] };
}

/**
 * Lagen für »Muster entlang Pfad«: count Exemplare gleichmäßig über die ganze Länge oder mit Abstand.
 * Rückgabe [{ p, d, angle }] ab dem 2. Exemplar; angle = Drehung der Tangente gegenüber dem Start (Grad, gegen Uhrzeigersinn).
 */
export function pathPatternStations(chain, { count, spacing = null, align = true }) {
  const n = Math.round(count);
  if (!(n >= 2)) throw new Error("Anzahl mindestens 2");
  const L = pathLength(chain);
  const step = spacing != null ? spacing : chain.closed ? L / n : L / (n - 1);
  if (!(step > 0)) throw new Error("Abstand muss > 0 sein");
  if ((n - 1) * step > L + 1e-6) throw new Error(`Pfad zu kurz: ${n} Exemplare × ${Math.round(step * 10) / 10} mm brauchen ${Math.round((n - 1) * step)} mm, Pfad ist ${Math.round(L)} mm lang`);
  const s0 = pathAt(chain, 0);
  const a0 = Math.atan2(s0.d[1], s0.d[0]);
  const out = [];
  for (let k = 1; k < n; k++) {
    const s = pathAt(chain, k * step);
    let ang = align ? ((Math.atan2(s.d[1], s.d[0]) - a0) * 180) / Math.PI : 0;
    ang = ((ang + 540) % 360) - 180;
    out.push({ p: s.p, d: s.d, angle: ang, move: [s.p[0] - s0.p[0], s.p[1] - s0.p[1]] });
  }
  return { start: s0.p, stations: out, length: L, step };
}

/**
 * Spirale (Inventor »Spirale«/Coil): Profil um eine Achse in der Skizzenebene mit Steigung.
 * Eingaben (Zahlen): pitch, turns oder height; Rückgabe { pitch, height, turns } geprüft.
 */
export function coilParams({ mode = "umdrehungen", pitch, turns, height }) {
  if (!(pitch > 0)) throw new Error("Steigung muss > 0 sein");
  if (mode === "hoehe") {
    if (!(height > 0)) throw new Error("Höhe muss > 0 sein");
    return { pitch, height, turns: height / pitch };
  }
  if (!(turns > 0)) throw new Error("Umdrehungen müssen > 0 sein");
  if (turns > 500) throw new Error("Höchstens 500 Umdrehungen");
  return { pitch, turns, height: pitch * turns };
}

/** Flächenschwerpunkt eines geschlossenen Polygons (Profilmitte für Spirale) */
export function loopCentroid(loop) {
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < loop.length; i++) {
    const [x0, y0] = loop[i], [x1, y1] = loop[(i + 1) % loop.length];
    const c = x0 * y1 - x1 * y0;
    A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
  }
  if (Math.abs(A) < 1e-12) return loop[0];
  return [cx / (3 * A), cy / (3 * A)];
}

/** Abstand eines Punktes zur Geraden (a, Richtung d) und Fußpunkt (2D) */
export function footOnLine(p, a, d) {
  const L = Math.hypot(d[0], d[1]) || 1, u = [d[0] / L, d[1] / L];
  const t = (p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1];
  const f = [a[0] + u[0] * t, a[1] + u[1] * t];
  return { foot: f, dist: d2(p, f) };
}

/** Erhebung: mindestens zwei Skizzen, keine doppelt */
export function validateLoft(ids = []) {
  if (ids.length < 2) throw new Error("Mindestens zwei Skizzen mit geschlossener Kontur wählen");
  if (new Set(ids).size !== ids.length) throw new Error("Skizze doppelt gewählt");
}
