// Skizzen-Bearbeitung: Stutzen (Trim) und Skizzenrundung (Fillet zwischen zwei Linien)
import { arcGeometry } from "./sketch.js";
import { deleteEntities } from "./sketch.js";

const TAU = Math.PI * 2;
const EPS = 1e-7;
const norm2pi = (a) => { a %= TAU; return a < 0 ? a + TAU : a; };

function pts(sk) { return new Map(sk.points.map((p) => [p.id, p])); }

/** Geometrie eines Elements in einfacher Form */
export function geo(sk, e, P = pts(sk)) {
  if (e.type === "line") { const a = P.get(e.p1), b = P.get(e.p2); return { kind: "line", ax: a.x, ay: a.y, bx: b.x, by: b.y }; }
  if (e.type === "circle") { const c = P.get(e.c); return { kind: "circle", cx: c.x, cy: c.y, r: e.r, a1: 0, sweep: TAU }; }
  if (e.type === "arc") { const g = arcGeometry(P.get(e.c), P.get(e.p1), P.get(e.p2)); const c = P.get(e.c); return { kind: "arc", cx: c.x, cy: c.y, r: g.r, a1: g.a1, sweep: g.sweep }; }
  return null;
}

/** Parameter eines Punktes auf dem Element: Linie t∈[0,1], Kreis/Bogen Winkel ab Bogenanfang */
function param(g, x, y) {
  if (g.kind === "line") {
    const dx = g.bx - g.ax, dy = g.by - g.ay, L2 = dx * dx + dy * dy || 1;
    return ((x - g.ax) * dx + (y - g.ay) * dy) / L2;
  }
  return norm2pi(Math.atan2(y - g.cy, x - g.cx) - g.a1);
}
function onElement(g, x, y, tol = 1e-6) {
  if (g.kind === "line") {
    const t = param(g, x, y);
    return t >= -tol && t <= 1 + tol;
  }
  if (g.kind === "circle") return true;
  const p = param(g, x, y);
  return p <= g.sweep + tol || p >= TAU - tol;
}
function pointAt(g, p) {
  if (g.kind === "line") return { x: g.ax + (g.bx - g.ax) * p, y: g.ay + (g.by - g.ay) * p };
  const a = g.a1 + p;
  return { x: g.cx + g.r * Math.cos(a), y: g.cy + g.r * Math.sin(a) };
}

/** Schnittpunkte zweier Elemente (nur Punkte, die auf beiden liegen) */
export function intersections(g1, g2) {
  const out = [];
  const L = (g) => g.kind === "line";
  if (L(g1) && L(g2)) {
    const rx = g1.bx - g1.ax, ry = g1.by - g1.ay, sx = g2.bx - g2.ax, sy = g2.by - g2.ay;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) return out;
    const t = ((g2.ax - g1.ax) * sy - (g2.ay - g1.ay) * sx) / den;
    const u = ((g2.ax - g1.ax) * ry - (g2.ay - g1.ay) * rx) / den;
    if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) out.push({ x: g1.ax + t * rx, y: g1.ay + t * ry });
    return out;
  }
  if (L(g1) || L(g2)) {
    const ln = L(g1) ? g1 : g2, c = L(g1) ? g2 : g1;
    const dx = ln.bx - ln.ax, dy = ln.by - ln.ay;
    const fx = ln.ax - c.cx, fy = ln.ay - c.cy;
    const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), cc = fx * fx + fy * fy - c.r * c.r;
    const disc = b * b - 4 * a * cc;
    if (disc < -1e-9 || a < 1e-18) return out;
    const sq = Math.sqrt(Math.max(0, disc));
    for (const t of disc < 1e-12 ? [-b / (2 * a)] : [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
      if (t < -EPS || t > 1 + EPS) continue;
      const p = { x: ln.ax + t * dx, y: ln.ay + t * dy };
      if (onElement(c, p.x, p.y)) out.push(p);
    }
    return out;
  }
  const d = Math.hypot(g2.cx - g1.cx, g2.cy - g1.cy);
  if (d < 1e-12 || d > g1.r + g2.r + 1e-9 || d < Math.abs(g1.r - g2.r) - 1e-9) return out;
  const a = (g1.r * g1.r - g2.r * g2.r + d * d) / (2 * d);
  const hh = Math.sqrt(Math.max(0, g1.r * g1.r - a * a));
  const mx = g1.cx + (a * (g2.cx - g1.cx)) / d, my = g1.cy + (a * (g2.cy - g1.cy)) / d;
  const cand = hh < 1e-12 ? [{ x: mx, y: my }] : [
    { x: mx + (hh * (g2.cy - g1.cy)) / d, y: my - (hh * (g2.cx - g1.cx)) / d },
    { x: mx - (hh * (g2.cy - g1.cy)) / d, y: my + (hh * (g2.cx - g1.cx)) / d },
  ];
  for (const p of cand) if (onElement(g1, p.x, p.y) && onElement(g2, p.x, p.y)) out.push(p);
  return out;
}

/**
 * Stutzt das Element `entityId` am Klickpunkt (lokale Koordinaten) bis zu den nächsten Schnittpunkten.
 * Gibt {ok, deleted?, message?} zurück. Ändert die Skizze in-place.
 */
export function trimEntity(sk, entityId, click, uid) {
  const P = pts(sk);
  const e = sk.entities.find((x) => x.id === entityId);
  if (!e || !["line", "circle", "arc"].includes(e.type)) return { ok: false, message: "Nur Linien, Kreise und Bögen lassen sich stutzen" };
  const g = geo(sk, e, P);
  const span = g.kind === "line" ? 1 : g.sweep;
  // Schnittparameter sammeln
  const cuts = [];
  for (const o of sk.entities) {
    if (o.id === e.id || o.type === "point") continue;
    const og = geo(sk, o, P);
    if (!og) continue;
    for (const ip of intersections(g, og)) {
      let p = param(g, ip.x, ip.y);
      if (g.kind !== "line" && p > g.sweep + 1e-9) p = p > TAU - 1e-6 ? 0 : p;
      cuts.push({ p, x: ip.x, y: ip.y, other: o });
    }
  }
  const tolP = 1e-6;
  // Kreis: Winkel knapp unter 2π gehören zu 0
  if (g.kind === "circle") for (const c of cuts) if (c.p > TAU - 1e-6) c.p = 0;
  let inner = cuts.filter((c) => (g.kind === "circle" ? true : c.p > tolP && c.p < span - tolP));
  inner.sort((a, b) => a.p - b.p);
  inner = inner.filter((c, i) => i === 0 || Math.abs(c.p - inner[i - 1].p) > 1e-6);
  if (g.kind === "circle" && inner.length > 1 && TAU - inner[inner.length - 1].p + inner[0].p < 1e-6) inner.pop();
  const pc = param(g, click.x, click.y);

  // Neuer Punkt am Schnitt, gehalten durch "Punkt auf Element" des schneidenden Elements
  const makePoint = (c) => {
    const id = uid("p");
    sk.points.push({ id, x: c.x, y: c.y });
    const o = c.other;
    sk.constraints.push({ id: uid("k"), type: o.type === "line" ? "pointOnLine" : "pointOnCircle", p: id, e: o.id });
    return id;
  };
  const dropDims = () => {
    // Bedingungen, die sich auf die Länge/Lage der Strecke beziehen, entfallen (die unendliche Gerade bleibt):
    // Länge, Mittelpunkt, "gleich" (bei Linien). Abstände zur Geraden, parallel usw. bleiben gültig.
    const dropped = [];
    sk.constraints = sk.constraints.filter((k) => {
      const refs = [k.e, k.e1, k.e2].includes(e.id);
      const drop = refs && (k.type === "length" || k.type === "midpoint" || (k.type === "equal" && g.kind === "line"));
      if (drop) dropped.push(k.type);
      return !drop;
    });
    return dropped;
  };

  if (g.kind === "circle") {
    if (inner.length < 2) return { ok: false, message: "Kreis braucht mindestens zwei Schnittpunkte zum Stutzen" };
    // vorheriger und nächster Schnitt (zyklisch) um den Klickwinkel
    let next = inner.find((c) => c.p > pc) || inner[0];
    let prev = [...inner].reverse().find((c) => c.p < pc) || inner[inner.length - 1];
    const pn = makePoint(next), pp = makePoint(prev);
    // verbleibender Bogen: von "next" gegen den Uhrzeigersinn bis "prev"
    e.type = "arc";
    e.p1 = pn;
    e.p2 = pp;
    delete e.r;
    deleteEntities(sk, []);
    return { ok: true };
  }

  const prev = [...inner].reverse().find((c) => c.p < pc);
  const next = inner.find((c) => c.p > pc);
  if (!prev && !next) {
    deleteEntities(sk, [e.id]);
    return { ok: true, deleted: true };
  }
  const dropped = dropDims();
  if (!prev) {
    // Anfang bis zum nächsten Schnitt entfernen
    e.p1 = makePoint(next);
  } else if (!next) {
    e.p2 = makePoint(prev);
  } else {
    // Mitte entfernen: in zwei Teile trennen
    const a = makePoint(prev), b = makePoint(next);
    const oldEnd = e.p2;
    e.p2 = a;
    const nid = uid(g.kind === "line" ? "l" : "b");
    const piece = g.kind === "line" ? { id: nid, type: "line", p1: b, p2: oldEnd, construction: !!e.construction } : { id: nid, type: "arc", c: e.c, p1: b, p2: oldEnd, construction: !!e.construction };
    sk.entities.push(piece);
    if (g.kind === "line") {
      // Richtung/Lage der Teile bleibt gekoppelt
      sk.constraints.push({ id: uid("k"), type: "collinear", e1: e.id, e2: nid });
      for (const k of sk.constraints.filter((k) => k.e === e.id && ["horizontal", "vertical"].includes(k.type))) sk.constraints.push({ ...k, id: uid("k"), e: nid });
    } else {
      // beide Bogenstücke behalten denselben Radius
      sk.constraints.push({ id: uid("k"), type: "equal", e1: e.id, e2: nid });
    }
  }
  deleteEntities(sk, []);
  return { ok: true, dropped };
}

/**
 * Rundet die Ecke zwischen zwei Linien, die sich im Punkt `pointId` treffen, mit Radius r.
 * Erzeugt Bogen + Tangential-Bedingungen + Radiusmaß. Rückgabe {ok, message?, arcId?}
 */
export function filletCorner(sk, pointId, r, uid, radiusExpr) {
  const P = pts(sk);
  const lines = sk.entities.filter((e) => e.type === "line" && !e.construction && (e.p1 === pointId || e.p2 === pointId));
  if (lines.length !== 2) return { ok: false, message: "An der Ecke müssen genau zwei Linien enden" };
  if (!(r > 0)) return { ok: false, message: "Radius muss > 0 sein" };
  const C0 = P.get(pointId);
  const far = lines.map((l) => P.get(l.p1 === pointId ? l.p2 : l.p1));
  const u = far.map((f) => { const dx = f.x - C0.x, dy = f.y - C0.y, L = Math.hypot(dx, dy) || 1; return { x: dx / L, y: dy / L, L }; });
  const cosT = u[0].x * u[1].x + u[0].y * u[1].y;
  const theta = Math.acos(Math.max(-1, Math.min(1, cosT)));
  if (theta < 1e-3 || Math.PI - theta < 1e-3) return { ok: false, message: "Linien sind parallel – keine Ecke zum Runden" };
  const d = r / Math.tan(theta / 2);
  if (d >= u[0].L - 1e-9 || d >= u[1].L - 1e-9) return { ok: false, message: "Radius zu groß für diese Ecke" };
  const T = u.map((v) => ({ x: C0.x + v.x * d, y: C0.y + v.y * d }));
  const bis = { x: u[0].x + u[1].x, y: u[0].y + u[1].y };
  const bl = Math.hypot(bis.x, bis.y) || 1;
  const h = r / Math.sin(theta / 2);
  const C = { x: C0.x + (bis.x / bl) * h, y: C0.y + (bis.y / bl) * h };
  const tid = T.map((t) => { const id = uid("p"); sk.points.push({ id, x: t.x, y: t.y }); return id; });
  const farIds = lines.map((l) => (l.p1 === pointId ? l.p2 : l.p1));
  lines.forEach((l, i) => { if (l.p1 === pointId) l.p1 = tid[i]; else l.p2 = tid[i]; });
  // Virtuelle Ecke bleibt als Konstruktionspunkt auf beiden Linien; Längenmaße zeigen weiter auf sie
  if (!sk.entities.some((e) => e.type === "point" && e.p === pointId)) sk.entities.push({ id: uid("pt"), type: "point", p: pointId, construction: true, virtual: true });
  sk.constraints.push({ id: uid("k"), type: "pointOnLine", p: pointId, e: lines[0].id }, { id: uid("k"), type: "pointOnLine", p: pointId, e: lines[1].id });
  const startsAtCorner = lines.map((l) => l.p1 === tid[lines.indexOf(l)]);
  for (const k of sk.constraints) {
    const i = lines.findIndex((l) => l.id === k.e);
    if (k.type === "length" && i >= 0) {
      // Richtung wie die ursprüngliche Linie, damit die Maßzahl auf derselben Seite bleibt
      k.type = "distance";
      if (startsAtCorner[i]) { k.p = pointId; k.q = farIds[i]; } else { k.p = farIds[i]; k.q = pointId; }
      delete k.e;
    }
  }
  // "gleich" und "Mittelpunkt" beziehen sich auf die alte Streckenlänge – entfallen
  const lineIds = new Set(lines.map((l) => l.id));
  const dropped = sk.constraints.filter((k) => (k.type === "equal" || k.type === "midpoint") && [k.e, k.e1, k.e2].some((x) => lineIds.has(x))).map((k) => k.type);
  sk.constraints = sk.constraints.filter((k) => !((k.type === "equal" || k.type === "midpoint") && [k.e, k.e1, k.e2].some((x) => lineIds.has(x))));
  const cid = uid("p");
  sk.points.push({ id: cid, x: C.x, y: C.y });
  // Bogen gegen den Uhrzeigersinn: Startpunkt so wählen, dass der kurze Weg CCW läuft
  const cross = (T[0].x - C.x) * (T[1].y - C.y) - (T[0].y - C.y) * (T[1].x - C.x);
  const [s, en] = cross > 0 ? [tid[0], tid[1]] : [tid[1], tid[0]];
  const aid = uid("b");
  sk.entities.push({ id: aid, type: "arc", c: cid, p1: s, p2: en, construction: false });
  // Tangential am Berührpunkt: (T − C) ⟂ Linie (nicht singulär, anders als Abstand Mitte–Gerade = r)
  sk.constraints.push(
    { id: uid("k"), type: "tangentAt", e1: aid, e2: lines[0].id, p: tid[0] },
    { id: uid("k"), type: "tangentAt", e1: aid, e2: lines[1].id, p: tid[1] },
    { id: uid("m"), type: "radius", e: aid, value: radiusExpr || String(Math.round(r * 1e4) / 1e4), labelAngle: Math.atan2(-(bis.y / bl), -(bis.x / bl)) },
  );
  return { ok: true, arcId: aid, dropped };
}

/** Ecke unter dem Punkt finden: Punkt, an dem genau zwei Linien enden */
export function cornerAt(sk, pointId) {
  return sk.entities.filter((e) => e.type === "line" && !e.construction && (e.p1 === pointId || e.p2 === pointId)).length === 2;
}

const usesPoint = (sk, pid, exceptId) => sk.entities.some((o) => o.id !== exceptId && (["p1", "p2", "c", "p", "a"].some((k) => o[k] === pid) || (o.pts || []).includes(pid)));

/**
 * Verlängert das Ende einer Linie oder eines Bogens (das dem Klick nähere) bis zum nächsten Element.
 * Das Ende wird per "Punkt auf Element" am getroffenen Element gehalten. Rückgabe {ok, message?, dropped?}
 */
export function extendEntity(sk, entityId, click, uid) {
  const P = pts(sk);
  const e = sk.entities.find((x) => x.id === entityId);
  if (!e || !["line", "arc"].includes(e.type)) return { ok: false, message: "Nur Linien und Bögen lassen sich verlängern" };
  const g = geo(sk, e, P);
  let atEnd;
  if (g.kind === "line") atEnd = param(g, click.x, click.y) >= 0.5;
  else { const p = param(g, click.x, click.y); atEnd = p <= g.sweep ? p > g.sweep / 2 : p - g.sweep < TAU - p; }
  const pid = atEnd ? e.p2 : e.p1;
  if (usesPoint(sk, pid, e.id)) return { ok: false, message: "Dieses Ende ist mit einem anderen Element verbunden" };
  if (sk.constraints.some((k) => k.p === pid || k.q === pid)) return { ok: false, message: "Dieses Ende ist bemaßt oder gebunden – erst die Bedingung löschen" };
  const end = P.get(pid);
  let probe, rank;
  if (g.kind === "line") {
    const [fx, fy] = atEnd ? [g.ax, g.ay] : [g.bx, g.by];
    const L = Math.hypot(end.x - fx, end.y - fy) || 1, ux = (end.x - fx) / L, uy = (end.y - fy) / L;
    probe = { kind: "line", ax: end.x, ay: end.y, bx: end.x + ux * 1e7, by: end.y + uy * 1e7 };
    rank = (ip) => Math.hypot(ip.x - end.x, ip.y - end.y);
  } else {
    probe = { kind: "circle", cx: g.cx, cy: g.cy, r: g.r, a1: 0, sweep: TAU };
    // Winkelweg vom Ende nach außen: am Ende gegen den Uhrzeigersinn, am Anfang im Uhrzeigersinn
    rank = (ip) => { const p = param(g, ip.x, ip.y); return atEnd ? p - g.sweep : TAU - p; };
  }
  let best = null;
  for (const o of sk.entities) {
    if (o.id === e.id || o.type === "point") continue;
    const og = geo(sk, o, P);
    if (!og) continue;
    for (const ip of intersections(probe, og)) {
      const d = rank(ip);
      if (g.kind === "arc" && (d <= 1e-6 || d >= TAU - g.sweep - 1e-6)) continue;
      if (g.kind === "line" && d <= 1e-6) continue;
      if (!best || d < best.d) best = { d, ip, o };
    }
  }
  if (!best) return { ok: false, message: "In Verlängerung liegt kein Element" };
  end.x = best.ip.x;
  end.y = best.ip.y;
  sk.constraints.push({ id: uid("k"), type: best.o.type === "line" ? "pointOnLine" : "pointOnCircle", p: pid, e: best.o.id });
  const dropped = [];
  sk.constraints = sk.constraints.filter((k) => {
    const drop = [k.e, k.e1, k.e2].includes(e.id) && (k.type === "length" || k.type === "midpoint" || (k.type === "equal" && g.kind === "line"));
    if (drop) dropped.push(k.type);
    return !drop;
  });
  return { ok: true, dropped };
}

/**
 * Teilt eine Linie oder einen Bogen am Klickpunkt in zwei Elemente (gemeinsamer Punkt).
 * Liegt ein Schnittpunkt mit einem anderen Element näher als `tol`, wird dort geteilt.
 * Rückgabe {ok, message?, dropped?, pieceId?}
 */
export function splitEntity(sk, entityId, click, uid, tol = 0) {
  const P = pts(sk);
  const e = sk.entities.find((x) => x.id === entityId);
  if (!e) return { ok: false, message: "Element fehlt" };
  if (e.type === "circle") return { ok: false, message: "Kreise erst stutzen – teilen geht bei Linien und Bögen" };
  if (!["line", "arc"].includes(e.type)) return { ok: false, message: "Nur Linien und Bögen lassen sich teilen" };
  const g = geo(sk, e, P);
  const span = g.kind === "line" ? 1 : g.sweep;
  let at = null, other = null;
  for (const o of sk.entities) {
    if (o.id === e.id || o.type === "point") continue;
    const og = geo(sk, o, P);
    if (!og) continue;
    for (const ip of intersections(g, og)) {
      const d = Math.hypot(ip.x - click.x, ip.y - click.y);
      if (d <= tol && (!at || d < at.d)) { at = { d, x: ip.x, y: ip.y }; other = o; }
    }
  }
  let p = at ? param(g, at.x, at.y) : param(g, click.x, click.y);
  const minP = span * 1e-4;
  if (!(p > minP && p < span - minP)) return { ok: false, message: "Nicht am Ende teilen – weiter innen anklicken" };
  const q = at || pointAt(g, p);
  const np = uid("p");
  sk.points.push({ id: np, x: q.x, y: q.y });
  if (other) sk.constraints.push({ id: uid("k"), type: other.type === "line" ? "pointOnLine" : "pointOnCircle", p: np, e: other.id });
  const oldEnd = e.p2;
  e.p2 = np;
  const nid = uid(g.kind === "line" ? "l" : "b");
  sk.entities.push(g.kind === "line" ? { id: nid, type: "line", p1: np, p2: oldEnd, construction: !!e.construction } : { id: nid, type: "arc", c: e.c, p1: np, p2: oldEnd, construction: !!e.construction });
  // Bedingungen am alten Ende wandern zum neuen Stück
  for (const k of sk.constraints) {
    if (k.type !== "tangentAt" || k.p !== oldEnd) continue;
    if (k.e1 === e.id) k.e1 = nid;
    if (k.e2 === e.id) k.e2 = nid;
  }
  if (g.kind === "line") {
    sk.constraints.push({ id: uid("k"), type: "collinear", e1: e.id, e2: nid });
    for (const k of sk.constraints.filter((k) => k.e === e.id && ["horizontal", "vertical"].includes(k.type))) sk.constraints.push({ ...k, id: uid("k"), e: nid });
  }
  const dropped = [];
  sk.constraints = sk.constraints.filter((k) => {
    const drop = [k.e, k.e1, k.e2].includes(e.id) && (k.type === "length" || k.type === "midpoint" || (k.type === "equal" && g.kind === "line"));
    if (drop) dropped.push(k.type);
    return !drop;
  });
  return { ok: true, dropped, pieceId: nid };
}
