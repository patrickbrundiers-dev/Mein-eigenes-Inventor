// Blech, zweite Ausbaustufe (ADR-0008): Lasche, Umschlag, Stirnlasche mit Eckfreischnitt, Durchzug und Konturlasche
// auf dem Kantteil; Stufe 48: Ecke schließen und Stanzwerkzeug. Reine Rechnung: Plan aller Biegungen, Abwicklung als Umriss mit Löchern und Biegelinien.
//
// Koordinaten wie beim Kantteil: Querschnitt in (u, v) = Plan-Ebene, Kantlänge y von 0 bis L.
// Abwicklung: x längs der Abwicklung (0 = freies Ende von Schenkel 1), y längs der Kantlänge.

import { planKantteil, bendCut, kantteilOutline } from "./blech.js";

const fmt = (x) => String(Math.round(x * 100) / 100).replace(".", ",");
export const SHEET_FEATURES = ["lasche", "umschlag", "durchzug", "eckeschliessen", "stanzung"];
export const LASCHE_EDGES = [["ende", "Ende (letzter Schenkel)"], ["anfang", "Anfang (erster Schenkel)"], ["vorne", "Stirnseite vorne (y = 0)"], ["hinten", "Stirnseite hinten (y = Länge)"]];
export const HEM_KINDS = [["geschlossen", "geschlossen (zugedrückt)"], ["offen", "offen mit Spalt"]];
export const PUNCH_FORMS = [["rund", "rund"], ["rechteck", "Rechteck"], ["langloch", "Langloch"]];
export const CORNER_THROUGH = [["a", "Lasche am kleineren Schenkel läuft durch"], ["b", "Lasche am größeren Schenkel läuft durch"]];

export const defaultLasche = (base) => ({ type: "lasche", base, edge: "ende", length: "30", angle: "90", dir: "auf", ri: "", width: "", offset: "0", relief: "rechteck", reliefW: "", reliefD: "", leg: "1" });
export const defaultUmschlag = (base) => ({ type: "umschlag", base, edge: "ende", kind: "geschlossen", length: "15", gap: "1", dir: "auf" });
export const defaultDurchzug = (base) => ({ type: "durchzug", base, leg: "1", s: "20", y: "50", d: "8", height: "4", dir: "auf", d0: "" });
export const defaultEckeSchliessen = (base) => ({ type: "eckeschliessen", base, bend: "1", side: "vorne", through: "a", gap: "0.5" });
export const defaultStanzung = (base) => ({ type: "stanzung", base, leg: "2", s: "40", y: "50", form: "langloch", d: "10", a: "30", b: "10" });

/**
 * Umriss eines Stanzwerkzeugs um c: Rechteck a × b (a entlang des Schenkels, b längs) oder Langloch a × b
 * (Halbkreise an der kürzeren Seite); gegen den Uhrzeigersinn. Rund kommt als Kreis, nicht als Umriss.
 */
export function punchOutline(form, a, b, c = [0, 0], n = 12) {
  if (!(a > 0 && b > 0)) throw new Error("Stanzung: Maße > 0 angeben");
  const [cx, cy] = c, hx = a / 2, hy = b / 2;
  if (form === "rechteck") return [[cx - hx, cy - hy], [cx + hx, cy - hy], [cx + hx, cy + hy], [cx - hx, cy + hy]];
  const pts = [], r = Math.min(hx, hy), alongX = hx >= hy;
  const ends = alongX ? [[cx + hx - r, cy, -Math.PI / 2], [cx - hx + r, cy, Math.PI / 2]] : [[cx, cy + hy - r, 0], [cx, cy - hy + r, Math.PI]];
  for (const [ex, ey, a0] of ends) for (let q = 0; q <= n; q++) { const an = a0 + (Math.PI * q) / n; pts.push([ex + r * Math.cos(an), ey + r * Math.sin(an)]); }
  return pts;
}

/** Geschlossener Umschlag: Spalt fast null (sonst berühren sich die Innenflächen, der Körper wäre ungültig) */
export const hemRadius = (kind, gap, t) => (kind === "offen" ? Math.max(gap / 2, 0.01 * t) : 0.01 * t);

/**
 * Vorloch für einen Durchzug (Näherung über die Volumenkonstanz): Kragen Ø di innen, Höhe H über alles, Wand beim
 * Ziehen auf etwa 0,7 · t verdünnt. Ringfläche zwischen d0 und dm = di + t gibt die Kragenwand (Höhe H − t):
 * dm² − d0² = 4 · dm · (H − t) · 0,7.
 */
export function durchzugVorloch(di, H, t) {
  if (!(di > 0)) throw new Error("Durchzug: Innendurchmesser > 0 angeben");
  if (!(H > t)) throw new Error(`Durchzug: Kragenhöhe über alles muss größer als die Blechdicke (${fmt(t)} mm) sein`);
  const dm = di + t, q = dm * dm - 4 * dm * (H - t) * 0.7;
  const dmin = 0.3 * di;
  if (q < dmin * dmin) throw new Error(`Durchzug: Kragen zu hoch für Ø ${fmt(di)} bei ${fmt(t)} mm Blech – höchstens ${fmt(t + (dm * dm - dmin * dmin) / (4 * dm * 0.7))} mm über alles`);
  return Math.sqrt(q);
}

/**
 * Kantteil mit Blech-Features planen. base: Zahlen des Kantteils {legs, angles, t, ri, k, kOf, ref, L};
 * extras: Zahlen der Features in Baumreihenfolge ({type, edge, …}). Laschen über die ganze Länge und Umschläge
 * werden Schenkel am Anfang oder Ende; Teil-Laschen, Stirnlaschen und Durchzüge kommen auf den fertigen Querschnitt.
 */
export function planSheet(base, extras = []) {
  const { t, ri, k, kOf = null, ref = "aussen", L } = base;
  const legs = [...base.legs], angles = [...base.angles];
  const ris = angles.map(() => ri), refs = angles.map(() => ref);
  let anchorLeg = 0;
  const partial = [], stirn = [], holes = [], closes = [], stanz = [];
  const sideTaken = { anfang: false, ende: false };
  for (const e of extras) {
    const sg = e.dir === "ab" ? -1 : 1;
    if (e.type === "durchzug") { holes.push(e); continue; }
    if (e.type === "eckeschliessen") { closes.push(e); continue; }
    if (e.type === "stanzung") { stanz.push(e); continue; }
    if (e.type === "lasche" && (e.edge === "vorne" || e.edge === "hinten")) { stirn.push({ ...e, ang: sg * e.angle }); continue; }
    const full = e.type === "umschlag" || !(e.width > 0) || (e.width >= L - 1e-6 && !(e.offset > 1e-6));
    if (!full) { partial.push({ ...e, ang: sg * e.angle }); sideTaken[e.edge] = true; continue; }
    if (sideTaken[e.edge]) throw new Error("Lasche über die ganze Länge hinter einer Teil-Lasche am selben Ende – erst die ganze Lasche anlegen");
    let len, ang, r, rf;
    if (e.type === "umschlag") {
      if (!(e.length > 0)) throw new Error("Umschlag: Länge > 0 angeben");
      len = e.length; ang = sg * 180; r = hemRadius(e.kind, e.gap, t); rf = "aussen";
    } else {
      if (!(e.length > 0)) throw new Error("Lasche: Länge > 0 angeben");
      len = e.length; ang = sg * e.angle; r = e.ri ?? ri; rf = ref === "links" || ref === "rechts" ? "aussen" : ref;
    }
    if (e.edge === "anfang") { legs.unshift(len); angles.unshift(ang); ris.unshift(r); refs.unshift(rf); anchorLeg++; }
    else { legs.push(len); angles.push(ang); ris.push(r); refs.push(rf); }
  }
  const anchor = anchorLeg ? { leg: anchorLeg, at: [0, 0], dir: 0 } : null;
  const P = (o) => planKantteil({ legs, angles, t, ri, k, kOf, ref, ris, refs, anchor, ...o });
  const plan = P({});
  const n = plan.center.length;

  // Teil-Laschen an Anfang oder Ende: eigener Plan mit der zusätzlichen Biegung, gleiche Lage wie der Grundplan
  const parts = partial.map((e, idx) => {
    const r = e.ri ?? ri, rf = ref === "links" || ref === "rechts" ? "aussen" : ref;
    if (!(e.length > 0)) throw new Error("Lasche: Länge > 0 angeben");
    const y0 = e.offset || 0, w = e.width;
    if (y0 < -1e-6 || y0 + w > L + 1e-6) throw new Error(`Lasche ${idx + 1}: Versatz + Breite (${fmt(y0 + w)} mm) liegt außerhalb der Länge ${fmt(L)} mm`);
    const end = e.edge === "anfang" ? "anfang" : "ende";
    const full = end === "ende"
      ? P({ legs: [...legs, e.length], angles: [...angles, e.ang], ris: [...ris, r], refs: [...refs, rf] })
      : P({ legs: [e.length, ...legs], angles: [e.ang, ...angles], ris: [r, ...ris], refs: [rf, ...refs], anchor: { leg: anchorLeg + 1, at: [0, 0], dir: 0 } });
    const bi = end === "ende" ? full.bends.length - 1 : 0;
    const cut = bendCut(e.ang, r, t, rf);
    const ba = full.flatParts[2 * bi + 1], sF = end === "ende" ? full.flatParts.at(-1) : full.flatParts[0];
    const rw = e.reliefW > 0 ? e.reliefW : t, rd = e.reliefD > 0 ? e.reliefD : t / 2;
    return { end, y0, w, cut, ba, sF, full, bi, relief: e.relief === "keiner" ? null : { w: rw, d: rd }, angle: e.ang, ri: r };
  });

  // Stirnlaschen: Biegung um eine Achse längs des Schenkels an y = 0 bzw. y = L
  const ends = stirn.map((e, idx) => {
    const j = Math.round(e.leg) - 1;
    if (!(j >= 0 && j < n)) throw new Error(`Stirnlasche: Schenkel ${e.leg} gibt es nicht (1 bis ${n})`);
    if (!(e.length > 0)) throw new Error("Stirnlasche: Länge > 0 angeben");
    const g = plan.center[j];
    if (g.len < 1) throw new Error(`Stirnlasche: Schenkel ${j + 1} hat kein gerades Stück`);
    const r = e.ri ?? ri, rf = ref === "links" || ref === "rechts" ? "aussen" : ref;
    const cut = bendCut(e.ang, r, t, rf);
    const two = planKantteil({ legs: [cut + 1, e.length], angles: [e.ang], t, ri: r, k, kOf, ref: rf });
    if (cut + two.flatParts[1] + 1 > L / 2) throw new Error(`Stirnlasche ${idx + 1}: Kantlänge ${fmt(L)} mm zu kurz für die Biegung`);
    const reliefExtra = e.reliefD > 0 ? e.reliefD : t / 2;
    // Seite der Lasche (+1 = Richtung Schenkelnormale) und ihre Höhe ab Mitte Schenkel in der Stirnebene
    const o = kantteilOutline(two, t), sg = Math.sign(two.center.at(-1).b[1]) || 1;
    const H = Math.max(...[o.start, ...o.segs.flatMap((x) => [x.to, x.mid].filter(Boolean))].map((q) => sg * q[1]));
    return { leg: j, side: e.edge, cut, ba: two.flatParts[1], sF: two.flatParts[2], two, angle: e.ang, ri: r, corner: e.relief === "keiner" ? null : { extra: reliefExtra }, flSide: sg, H, s0: 0, s1: g.len, closed: [] };
  });

  // Ecke schließen: Stirnlaschen an einer 90°-Biegung bis an den Nachbarschenkel ziehen (Stoß mit Spalt).
  // Lage entlang des Schenkels: s0/s1 = Anfang/Ende der Lasche ab Anfang des geraden Stücks (vorher 0 und Länge).
  for (const c of closes) {
    const i = Math.round(c.bend) - 1;
    if (!(i >= 0 && i < plan.bends.length)) throw new Error(`Ecke schließen: Biegung ${c.bend} gibt es nicht (1 bis ${plan.bends.length})`);
    const bd = plan.bends[i], side = c.side === "hinten" ? "hinten" : "vorne";
    if (Math.abs(Math.abs(bd.angle) - 90) > 0.5) throw new Error(`Ecke schließen: nur an 90°-Biegungen (Biegung ${i + 1} hat ${fmt(Math.abs(bd.angle))}°)`);
    const A = ends.find((e) => e.leg === i && e.side === side), B = ends.find((e) => e.leg === i + 1 && e.side === side);
    if (!A && !B) throw new Error(`Ecke schließen: an Schenkel ${i + 1} und ${i + 2} steht ${side} keine Stirnlasche`);
    if (!A?.corner && !B?.corner) throw new Error("Ecke schließen: Eckfreischnitt an der Stirnlasche einschalten – sonst sitzt die Biegezone im Weg");
    for (const [E, nr] of [[A, i + 1], [B, i + 2]]) {
      if (E && E.flSide !== bd.sgn) throw new Error(`Ecke schließen: Stirnlasche an Schenkel ${nr} zeigt vom Nachbarschenkel weg – nur nach innen gebogene Laschen lassen sich schließen`);
    }
    const gap = c.gap ?? 0;
    if (!(gap >= 0)) throw new Error("Ecke schließen: Spalt ≥ 0 angeben");
    const thru = !B || (A && c.through !== "b") ? A : B, other = thru === A ? B : A;
    const into = (E, d) => {
      const key = E === A ? "ende" : "anfang";
      if (E.closed.includes(key)) throw new Error(`Ecke schließen: Ecke an Biegung ${i + 1} ist schon geschlossen`);
      E.closed.push(key);
      if (E === A) E.s1 += d; else E.s0 -= d;
    };
    into(thru, bd.ri - gap);
    if (other) into(other, bd.rm - thru.H - gap);
  }
  for (const [q, e] of ends.entries()) {
    if (e.s1 - e.s0 < 1) throw new Error(`Stirnlasche ${q + 1}: nach dem Schließen der Ecke bleibt nichts übrig – Spalt oder Laschenlängen prüfen`);
  }

  // Durchzüge: Lage auf dem geraden Stück eines Schenkels (Abstand ab Anfang des geraden Stücks, y längs)
  const pierce = [];
  for (const e of holes) {
    const j = Math.round(e.leg) - 1;
    if (!(j >= 0 && j < n)) throw new Error(`Durchzug: Schenkel ${e.leg} gibt es nicht (1 bis ${n})`);
    const ss = [].concat(e.s), yy = [].concat(e.y);
    if (ss.length !== yy.length) throw new Error("Durchzug: gleich viele Lagen entlang und längs angeben");
    const d0 = e.d0 > 0 ? e.d0 : durchzugVorloch(e.d, e.height, t);
    const ro = e.d / 2 + t;
    ss.forEach((s0, q) => {
      const y = yy[q];
      if (s0 < ro - 1e-6 || s0 > plan.center[j].len - ro + 1e-6) throw new Error(`Durchzug: Lage ${fmt(s0)} mm liegt nicht auf dem geraden Stück von Schenkel ${j + 1} (${fmt(ro)} bis ${fmt(plan.center[j].len - ro)} mm)`);
      if (y < ro - 1e-6 || y > L - ro + 1e-6) throw new Error(`Durchzug: Lage längs ${fmt(y)} mm außerhalb ${fmt(ro)} bis ${fmt(L - ro)} mm`);
      pierce.push({ leg: j, s: s0, y, d: e.d, H: e.height, up: e.dir !== "ab", d0 });
    });
  }

  // Stanzwerkzeug: Durchbruch rund, als Rechteck oder Langloch auf dem geraden Stück eines Schenkels
  const punch = [];
  for (const e of stanz) {
    const j = Math.round(e.leg) - 1;
    if (!(j >= 0 && j < n)) throw new Error(`Stanzung: Schenkel ${e.leg} gibt es nicht (1 bis ${n})`);
    const form = ["rechteck", "langloch"].includes(e.form) ? e.form : "rund";
    if (form === "rund" ? !(e.d > 0) : !(e.a > 0 && e.b > 0)) throw new Error("Stanzung: Maße > 0 angeben");
    const ss = [].concat(e.s), yy = [].concat(e.y);
    if (ss.length !== yy.length) throw new Error("Stanzung: gleich viele Lagen entlang und längs angeben");
    const hx = form === "rund" ? e.d / 2 : e.a / 2, hy = form === "rund" ? e.d / 2 : e.b / 2, len = plan.center[j].len;
    ss.forEach((s0, q) => {
      const y = yy[q];
      if (s0 < hx - 1e-6 || s0 > len - hx + 1e-6) throw new Error(`Stanzung: Lage ${fmt(s0)} mm liegt nicht auf dem geraden Stück von Schenkel ${j + 1} (${fmt(hx)} bis ${fmt(len - hx)} mm)`);
      if (y < hy - 1e-6 || y > L - hy + 1e-6) throw new Error(`Stanzung: Lage längs ${fmt(y)} mm außerhalb ${fmt(hy)} bis ${fmt(L - hy)} mm`);
      punch.push({ leg: j, s: s0, y, form, d: e.d, a: e.a, b: e.b });
    });
  }

  return { plan, legs, angles, parts, ends, pierce, punch, flat: flatModel(plan, L, t, { k, kOf }, parts, ends, pierce, punch) };
}

/**
 * Abwicklung aus Rechtecken: Grundfläche, abgezogene Bereiche (Biegezonen der Laschen), angesetzte Laschen,
 * Freischnitte. Umriss als geschlossene Polygone, Durchzüge als Kreise (Vorloch), Biegelinien mit Lage.
 */
function flatModel(plan, L, t, { k, kOf }, parts, ends, pierce, punch = []) {
  const F = plan.flat;
  const Kof = (a) => (kOf ? kOf(Math.abs(a)) : k);
  const subs = [], adds = [], notches = [], tops = [];
  const bends = plan.bends.map((b, i) => ({ x0: plan.bendLines[i], y0: 0, x1: plan.bendLines[i], y1: L, angle: Math.abs(b.angle), up: b.sgn > 0, ri: b.ri, k: Kof(b.angle) }));
  for (const p of parts) {
    const span = [p.y0, p.y0 + p.w];
    if (p.end === "ende") {
      const xc = F - p.cut;
      subs.push([xc, F + 1, ...span]);
      adds.push([xc, xc + p.ba + p.sF, ...span]);
      if (p.relief) { notches.push([xc - p.relief.d, F + 1, p.y0 - p.relief.w, p.y0], [xc - p.relief.d, F + 1, p.y0 + p.w, p.y0 + p.w + p.relief.w]); }
      bends.push({ x0: xc + p.ba / 2, y0: span[0], x1: xc + p.ba / 2, y1: span[1], angle: Math.abs(p.angle), up: p.angle > 0, ri: p.ri, k: Kof(p.angle) });
    } else {
      const xc = p.cut;
      subs.push([-1, xc, ...span]);
      adds.push([xc - p.ba - p.sF, xc, ...span]);
      if (p.relief) { notches.push([-1, xc + p.relief.d, p.y0 - p.relief.w, p.y0], [-1, xc + p.relief.d, p.y0 + p.w, p.y0 + p.w + p.relief.w]); }
      bends.push({ x0: xc - p.ba / 2, y0: span[0], x1: xc - p.ba / 2, y1: span[1], angle: Math.abs(p.angle), up: p.angle > 0, ri: p.ri, k: Kof(p.angle) });
    }
  }
  for (const e of ends) {
    const [xa, xb] = plan.legX[e.leg];
    const front = e.side === "vorne";
    const yc = front ? e.cut : L - e.cut;
    // Lage entlang des Schenkels nach »Ecke schließen«: in die Biegezone verlängert (über dem Freischnitt) oder gekürzt
    const s0 = e.s0 ?? 0, s1 = e.s1 ?? xb - xa;
    const c0 = xa + Math.max(0, s0), c1 = xa + Math.min(xb - xa, s1);
    const fy = front ? [yc - e.ba - e.sF, yc] : [yc, yc + e.ba + e.sF];
    subs.push(front ? [c0, c1, -1, yc] : [c0, c1, yc, L + 1]);
    adds.push([c0, c1, ...fy]);
    if (s0 < 0) tops.push([xa + s0, xa, ...fy]);
    if (xa + s1 > xb) tops.push([xb, xa + s1, ...fy]);
    const yl = front ? yc - e.ba / 2 : yc + e.ba / 2;
    bends.push({ x0: xa + s0, y0: yl, x1: xa + s1, y1: yl, angle: Math.abs(e.angle), up: e.angle > 0, ri: e.ri, k: Kof(e.angle) });
    if (e.corner) {
      // Eckfreischnitt: Biegezonen der Längsbiegungen neben dem Schenkel bis hinter die Stirnbiegung frei
      for (const bi of [e.leg - 1, e.leg]) {
        if (bi < 0 || bi >= plan.bends.length) continue;
        const x0 = plan.legX[bi][1], x1 = plan.legX[bi + 1][0];
        notches.push(front ? [x0, x1, -1, yc + e.corner.extra] : [x0, x1, yc - e.corner.extra, L + 1]);
      }
    }
  }
  const circles = [...pierce.map((h) => ({ c: [plan.legX[h.leg][0] + h.s, h.y], d: h.d0 })), ...punch.filter((p) => p.form === "rund").map((p) => ({ c: [plan.legX[p.leg][0] + p.s, p.y], d: p.d }))];
  const punchHoles = punch.filter((p) => p.form !== "rund").map((p) => punchOutline(p.form, p.a, p.b, [plan.legX[p.leg][0] + p.s, p.y]).reverse());
  const loops = rectOutline([0, F, 0, L], subs, adds, notches, tops);
  const outer = loops.filter((l) => l.area > 0);
  if (outer.length !== 1) throw new Error("Abwicklung zerfällt in mehrere Teile – Freischnitte oder Laschen prüfen");
  const bb = outer[0].pts.reduce((b, [x, y]) => ({ x0: Math.min(b.x0, x), y0: Math.min(b.y0, y), x1: Math.max(b.x1, x), y1: Math.max(b.y1, y) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  bends.forEach((b, i) => { b.nr = i + 1; });
  return { outer: outer[0].pts, holes: [...loops.filter((l) => l.area < 0).map((l) => l.pts), ...punchHoles], circles, bends, bbox: bb, width: bb.x1 - bb.x0, height: bb.y1 - bb.y0, flat: F, length: L };
}

/**
 * Umriss einer Fläche aus Rechtecken [x0, x1, y0, y1]: ((Grundfläche ohne subs) ∪ adds ohne notches) ∪ tops.
 * Rasterung an allen Kanten, Randkanten zu Schleifen verkettet; area > 0 = außen (gegen den Uhrzeigersinn), < 0 = Loch.
 */
export function rectOutline(base, subs = [], adds = [], notches = [], tops = []) {
  const all = [base, ...subs, ...adds, ...notches, ...tops];
  const uniq = (a) => [...new Set(a.map((x) => Math.round(x * 1e6) / 1e6))].sort((p, q) => p - q);
  const xs = uniq(all.flatMap((r) => [r[0], r[1]])), ys = uniq(all.flatMap((r) => [r[2], r[3]]));
  const inR = (r, x, y) => x > r[0] && x < r[1] && y > r[2] && y < r[3];
  const nx = xs.length - 1, ny = ys.length - 1;
  const fill = (i, j) => {
    if (i < 0 || j < 0 || i >= nx || j >= ny) return false;
    const x = (xs[i] + xs[i + 1]) / 2, y = (ys[j] + ys[j + 1]) / 2;
    const on = (inR(base, x, y) && !subs.some((r) => inR(r, x, y))) || adds.some((r) => inR(r, x, y));
    return (on && !notches.some((r) => inR(r, x, y))) || tops.some((r) => inR(r, x, y));
  };
  const cell = [];
  for (let i = 0; i < nx; i++) { cell.push([]); for (let j = 0; j < ny; j++) cell[i].push(fill(i, j)); }
  const F = (i, j) => (i >= 0 && j >= 0 && i < nx && j < ny ? cell[i][j] : false);
  // Randkanten gegen den Uhrzeigersinn um gefüllte Zellen; Knoten als Gitterindizes
  const out = new Map();
  const add = (a, b) => { const key = a.join(","); (out.get(key) || out.set(key, []).get(key)).push(b); };
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    if (!cell[i][j]) continue;
    if (!F(i, j - 1)) add([i, j], [i + 1, j]);
    if (!F(i + 1, j)) add([i + 1, j], [i + 1, j + 1]);
    if (!F(i, j + 1)) add([i + 1, j + 1], [i, j + 1]);
    if (!F(i - 1, j)) add([i, j + 1], [i, j]);
  }
  const loops = [];
  for (;;) {
    const startKey = [...out.keys()].find((k) => out.get(k).length);
    if (!startKey) break;
    const start = startKey.split(",").map(Number);
    const pts = [start];
    let cur = start;
    for (let guard = 0; guard < 100000; guard++) {
      const key = cur.join(","), list = out.get(key);
      const nxt = list.shift();
      if (!list.length) out.delete(key);
      if (nxt[0] === start[0] && nxt[1] === start[1]) break;
      pts.push(nxt);
      cur = nxt;
    }
    // gerade Durchläufe zusammenfassen
    const P = pts.map(([i, j]) => [xs[i], ys[j]]);
    const keep = P.filter((p, q) => {
      const a = P[(q - 1 + P.length) % P.length], b = P[(q + 1) % P.length];
      return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-12;
    });
    let area = 0;
    for (let q = 0; q < keep.length; q++) { const [x0, y0] = keep[q], [x1, y1] = keep[(q + 1) % keep.length]; area += x0 * y1 - x1 * y0; }
    loops.push({ pts: keep, area: area / 2 });
  }
  return loops;
}

/**
 * Konturlasche: offene Skizzenkette aus Linien → Schenkel (Ecke zu Ecke) und Biegewinkel (Richtungswechsel, + = links).
 * side: Material links/rechts der Linie oder mittig; Rückgabe {legs, angles, ref, start, dir, offset}.
 */
export function contourLegs(chain, side = "links") {
  if (chain.closed) throw new Error("Konturlasche braucht eine offene Linie (Anfang und Ende frei)");
  if (chain.pieces.some((p) => p.t !== "line")) throw new Error("Konturlasche: nur Linien zeichnen – die Ecken bekommen den Innenradius beim Biegen");
  const P = chain.pieces;
  const legs = P.map((p) => Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]));
  const dirs = P.map((p) => Math.atan2(p.b[1] - p.a[1], p.b[0] - p.a[0]));
  const angles = [];
  for (let i = 1; i < P.length; i++) {
    let a = ((dirs[i] - dirs[i - 1]) * 180) / Math.PI;
    a = ((a + 540) % 360) - 180;
    if (Math.abs(a) < 0.5) throw new Error(`Konturlasche: Linie ${i} und ${i + 1} liegen in einer Flucht – zu einer Linie zusammenfassen`);
    angles.push(Math.round(a * 1e6) / 1e6);
  }
  // Material links der Linie → Linie ist die rechte Blechfläche (Maße rechts), Mittellinie um t/2 nach links versetzt
  const ref = side === "mitte" ? "mitte" : side === "links" ? "rechts" : "links";
  return { legs, angles, ref, start: P[0].a, dir: dirs[0], offset: side === "mitte" ? 0 : side === "links" ? 1 : -1 };
}

/** Abwicklung als DXF: Umriss und Löcher (KONTUR), Vorlöcher der Durchzüge, Biegelinien gestrichelt mit Winkel */
export function sheetFlatDxf(DxfWriter, fm, { name = "" } = {}) {
  const w = new DxfWriter().layer("KONTUR", 7).layer("BIEGUNG", 1, "DASHED").layer("TEXT", 3);
  w.polyline(fm.outer, "KONTUR", true);
  for (const hl of fm.holes) w.polyline(hl, "KONTUR", true);
  for (const c of fm.circles) w.circle(c.c[0], c.c[1], c.d / 2, "KONTUR");
  for (const b of fm.bends) {
    w.line(b.x0, b.y0, b.x1, b.y1, "BIEGUNG");
    const vert = Math.abs(b.x1 - b.x0) < 1e-9;
    const note = `${fmt(b.angle)}° ${b.up ? "auf" : "ab"} R${fmt(b.ri)}`;
    if (vert) w.text(b.x0 + 2, b.y0 + Math.min(20, (b.y1 - b.y0) / 4), 5, note, "TEXT", { rot: 90 });
    else w.text(b.x0 + Math.min(20, (b.x1 - b.x0) / 4), b.y0 + 2, 5, note, "TEXT");
  }
  if (name) w.text(fm.bbox.x0 + 5, fm.bbox.y1 - 10, 5, name, "TEXT");
  return w.toString();
}

/** Abwicklungsansicht für die Zeichnung aus dem Abwicklungs-Modell des Kerns (Kreise als Bögen für Mittellinien) */
export function sheetFlatView(fm) {
  const close = (l) => [...l, l[0]];
  const ring = (c) => { const r = c.d / 2, n = 48; return Array.from({ length: n + 1 }, (_, i) => [c.c[0] + r * Math.cos((2 * Math.PI * i) / n), c.c[1] + r * Math.sin((2 * Math.PI * i) / n)]); };
  return {
    visible: [close(fm.outer), ...fm.holes.map(close), ...fm.circles.map(ring)], hidden: [],
    arcs: fm.circles.map((c) => ({ cx: c.c[0], cy: c.c[1], r: c.d / 2, sweep: 2 * Math.PI, full: true })),
    bbox: { ...fm.bbox },
    bends: fm.bends.map((b) => ({ ...b, x: b.x0 })), flat: fm.width, length: fm.height,
  };
}
