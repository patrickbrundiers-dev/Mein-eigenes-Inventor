// Zusammengesetzte Skizzenelemente (Langloch, Polygon), Spiegeln und Klartext für Bedingungen.
// Rein und testbar; die Bedingungen halten die Form auch nach Maßänderungen (kein Einmal-Geometrie).

const sub = (a, b) => [a.x - b.x, a.y - b.y];

/**
 * Langloch aus zwei Mittelpunkten a, b und Radius r.
 * Zwei Bögen + zwei Geraden, tangential, gleicher Radius; Mittellinie als Konstruktion.
 * Freiheitsgrade: 5 (zwei Mitten, Radius).
 */
export function buildSlot(sk, a, b, r, { uid, usePoint, construction = false }) {
  const [dx, dy] = sub(b, a);
  const L = Math.hypot(dx, dy);
  if (!(L > 1e-9)) throw new Error("Langloch braucht zwei verschiedene Mittelpunkte");
  if (!(r > 1e-9)) throw new Error("Langloch braucht einen Radius größer 0");
  const n = [-dy / L, dx / L];
  const cons = [];
  const c1 = usePoint(sk, a, cons), c2 = usePoint(sk, b, cons);
  const pt = (c, s) => { const id = uid("p"); sk.points.push({ id, x: c.x + s * r * n[0], y: c.y + s * r * n[1] }); return id; };
  const p1 = pt(a, 1), p2 = pt(b, 1), p3 = pt(b, -1), p4 = pt(a, -1);
  const axis = uid("l"), top = uid("l"), bot = uid("l"), arc1 = uid("b"), arc2 = uid("b");
  // Bögen laufen gegen den Uhrzeigersinn: an a von +n nach −n (außen herum), an b von −n nach +n
  sk.entities.push(
    { id: axis, type: "line", p1: c1, p2: c2, construction: true },
    { id: arc1, type: "arc", c: c1, p1: p1, p2: p4, construction },
    { id: top, type: "line", p1: p1, p2: p2, construction },
    { id: arc2, type: "arc", c: c2, p1: p3, p2: p2, construction },
    { id: bot, type: "line", p1: p3, p2: p4, construction },
  );
  // tangentAt (Radius senkrecht zur Geraden im gemeinsamen Punkt); »tangent« wäre hier im Jacobi-Rang entartet
  for (const [e1, e2, p] of [[arc1, top, p1], [arc1, bot, p4], [arc2, top, p2], [arc2, bot, p3]]) cons.push({ id: uid("k"), type: "tangentAt", e1, e2, p });
  cons.push({ id: uid("k"), type: "equal", e1: arc1, e2: arc2 });
  sk.constraints.push(...cons);
  return { centers: [c1, c2], arcs: [arc1, arc2], lines: [top, bot], axis };
}

/**
 * Regelmäßiges Vieleck: Mittelpunkt c, erste Ecke v, n Seiten.
 * Ecken auf einem Konstruktionskreis, alle Seiten gleich lang. Freiheitsgrade: 4 (Mitte, Radius, Drehung).
 */
export function buildPolygon(sk, c, v, n, { uid, usePoint, construction = false }) {
  if (!Number.isInteger(n) || n < 3 || n > 64) throw new Error("Polygon: 3 bis 64 Ecken");
  const r = Math.hypot(v.x - c.x, v.y - c.y);
  if (!(r > 1e-9)) throw new Error("Polygon braucht eine Ecke außerhalb der Mitte");
  const a0 = Math.atan2(v.y - c.y, v.x - c.x);
  const cons = [];
  const cid = usePoint(sk, c, cons);
  const circ = uid("k");
  sk.entities.push({ id: circ, type: "circle", c: cid, r, construction: true });
  const ids = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) { ids.push(usePoint(sk, v, cons)); continue; }
    const id = uid("p");
    const a = a0 + (2 * Math.PI * i) / n;
    sk.points.push({ id, x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
    ids.push(id);
  }
  const lines = ids.map((p, i) => { const id = uid("l"); sk.entities.push({ id, type: "line", p1: p, p2: ids[(i + 1) % n], construction }); return id; });
  for (const p of ids) cons.push({ id: uid("k"), type: "pointOnCircle", p, e: circ });
  for (let i = 1; i < n; i++) cons.push({ id: uid("k"), type: "equal", e1: lines[0], e2: lines[i] });
  sk.constraints.push(...cons);
  return { center: cid, circle: circ, points: ids, lines };
}

/**
 * Elemente an einer Linie spiegeln. Kopien sind über »symmetrisch« (Punkte) und »gleich« (Kreisradius)
 * an die Originale gebunden, folgen also deren Änderungen. Punkte auf der Spiegellinie werden mitbenutzt.
 */
export function mirrorEntities(sk, entityIds, lineId, { uid }) {
  const P = new Map(sk.points.map((p) => [p.id, p]));
  const axis = sk.entities.find((e) => e.id === lineId && e.type === "line");
  if (!axis) throw new Error("Spiegellinie muss eine Linie sein");
  const A = P.get(axis.p1), B = P.get(axis.p2);
  const [ux0, uy0] = sub(B, A);
  const L = Math.hypot(ux0, uy0);
  if (!(L > 1e-9)) throw new Error("Spiegellinie hat keine Länge");
  const ux = ux0 / L, uy = uy0 / L;
  const reflect = (p) => {
    const t = (p.x - A.x) * ux + (p.y - A.y) * uy;
    const fx = A.x + t * ux, fy = A.y + t * uy;
    return { x: 2 * fx - p.x, y: 2 * fy - p.y, onAxis: Math.hypot(p.x - fx, p.y - fy) < 1e-9 };
  };
  const ents = entityIds.map((id) => sk.entities.find((e) => e.id === id)).filter((e) => e && e.id !== lineId && !e.origin);
  if (!ents.length) throw new Error("Nichts zum Spiegeln gewählt");
  const map = new Map();
  const cons = [];
  const copy = (pid) => {
    if (map.has(pid)) return map.get(pid);
    const p = P.get(pid);
    const m = reflect(p);
    if (m.onAxis) { map.set(pid, pid); return pid; }
    const id = uid("p");
    sk.points.push({ id, x: m.x, y: m.y });
    cons.push({ id: uid("k"), type: "symmetric", p: pid, q: id, e: lineId });
    map.set(pid, id);
    return id;
  };
  const created = [];
  for (const e of ents) {
    const id = uid(e.type === "line" ? "l" : e.type === "arc" ? "b" : e.type === "circle" ? "k" : "pt");
    if (e.type === "line") sk.entities.push({ id, type: "line", p1: copy(e.p1), p2: copy(e.p2), construction: !!e.construction });
    // Spiegeln dreht den Umlaufsinn: Anfang und Ende tauschen
    else if (e.type === "arc") sk.entities.push({ id, type: "arc", c: copy(e.c), p1: copy(e.p2), p2: copy(e.p1), construction: !!e.construction });
    else if (e.type === "circle") { sk.entities.push({ id, type: "circle", c: copy(e.c), r: e.r, construction: !!e.construction }); cons.push({ id: uid("k"), type: "equal", e1: e.id, e2: id }); }
    else if (e.type === "point") sk.entities.push({ id, type: "point", p: copy(e.p), construction: !!e.construction });
    else continue;
    created.push(id);
  }
  sk.constraints.push(...cons);
  return { entities: created, points: [...map.values()].filter((v, i, a) => a.indexOf(v) === i) };
}

/**
 * Versatz (Offset) von Linien, Bögen und Kreisen um den Abstand d zur Seite des Punktes pick.
 * Zusammenhängende Elemente werden als Kette versetzt; an Ecken treffen sich die Kopien im Schnittpunkt,
 * an tangentialen Übergängen im gemeinsamen Punkt. Bindung: Bedingung »offset« je Kopie (Abstand bzw.
 * Radiusdifferenz); nur die erste ist ein sichtbares Maß, die übrigen folgen ihm (tie).
 */
export function offsetEntities(sk, entityIds, d, pick, { uid, value }) {
  if (!(d > 1e-9)) throw new Error("Versatz braucht einen Abstand größer 0");
  const P = new Map(sk.points.map((p) => [p.id, p]));
  const ents = entityIds.map((id) => sk.entities.find((e) => e.id === id)).filter((e) => e && !e.origin && ["line", "arc", "circle"].includes(e.type));
  if (!ents.length) throw new Error("Linien, Bögen oder Kreise zum Versetzen wählen");
  const val = value ?? String(d);
  const cons = [];
  let master = null;
  const offCon = (e1, e2, k) => {
    const c = { id: uid("k"), type: "offset", e1, e2, k, value: val };
    if (master) { c.tie = master.id; c.hidden = true; } else master = c;
    cons.push(c);
  };
  const newPt = (x, y) => { const id = uid("p"); sk.points.push({ id, x, y }); P.set(id, sk.points.at(-1)); return id; };
  const created = [];

  // Kreise einzeln: Seite = innen/außen
  for (const e of ents.filter((x) => x.type === "circle")) {
    const c = P.get(e.c);
    const k = Math.hypot(pick.x - c.x, pick.y - c.y) >= e.r ? 1 : -1;
    const r = e.r + k * d;
    if (!(r > 1e-9)) throw new Error("Versatz nach innen ist größer als der Kreisradius");
    const id = uid("k");
    sk.entities.push({ id, type: "circle", c: e.c, r, construction: !!e.construction });
    offCon(e.id, id, k);
    created.push(id);
  }

  // Ketten aus Linien und Bögen bilden
  const open = ents.filter((x) => x.type !== "circle");
  const ends = new Map(); // Punkt → Elemente
  for (const e of open) for (const p of [e.p1, e.p2]) { if (!ends.has(p)) ends.set(p, []); ends.get(p).push(e); }
  const used = new Set();
  const chains = [];
  const deg = (p) => (ends.get(p) || []).length;
  const other = (x, p) => (x.p1 === p ? x.p2 : x.p1);
  const walk = (e, from) => {
    const chain = [];
    while (e && !used.has(e.id)) {
      used.add(e.id);
      const fwd = e.p1 === from;
      chain.push({ e, fwd });
      const to = other(e, from);
      if (deg(to) !== 2) break;
      e = ends.get(to).find((x) => x !== chain.at(-1).e);
      from = to;
    }
    return chain;
  };
  for (const e of open) {
    if (used.has(e.id)) continue;
    // rückwärts bis zum Kettenanfang (oder einmal herum bei geschlossener Kette)
    let s = e, sp = e.p1;
    const seen = new Set([e.id]);
    while (deg(sp) === 2) {
      const nb = ends.get(sp).find((x) => x !== s);
      if (seen.has(nb.id) || used.has(nb.id)) break;
      seen.add(nb.id);
      sp = other(nb, sp);
      s = nb;
    }
    const chain = walk(s, sp);
    const last = chain.at(-1);
    chain.closed = chain.length > 1 && (last.fwd ? last.e.p2 : last.e.p1) === sp;
    chains.push(chain);
  }

  const xy = (id) => P.get(id);
  for (const chain of chains) {
    // Seite: Element, das dem Klickpunkt am nächsten liegt, bestimmt das Vorzeichen (links/rechts der Laufrichtung)
    let best = null, bd = Infinity;
    for (const it of chain) {
      const g = geom(it);
      const dist = Math.hypot(pick.x - g.mid.x, pick.y - g.mid.y);
      if (dist < bd) { bd = dist; best = { it, g }; }
    }
    const side = (pick.x - best.g.mid.x) * best.g.nl[0] + (pick.y - best.g.mid.y) * best.g.nl[1] >= 0 ? 1 : -1;
    const o = side * d;
    // versetzte Kurven (unendlich): Linie (Punkt, Richtung) oder Kreis (Mitte, Radius)
    const off = chain.map((it) => {
      const a = xy(it.fwd ? it.e.p1 : it.e.p2), b = xy(it.fwd ? it.e.p2 : it.e.p1);
      if (it.e.type === "line") {
        const L = Math.hypot(b.x - a.x, b.y - a.y), n = [-(b.y - a.y) / L, (b.x - a.x) / L];
        return { kind: "line", a: { x: a.x + o * n[0], y: a.y + o * n[1] }, b: { x: b.x + o * n[0], y: b.y + o * n[1] } };
      }
      const c = xy(it.e.c), r = Math.hypot(a.x - c.x, a.y - c.y);
      const r2 = r + (it.fwd ? -o : o); // links der Laufrichtung gegen den Uhrzeigersinn = zur Mitte
      if (!(r2 > 1e-9)) throw new Error("Versatz ist größer als ein Bogenradius");
      const sc = (p) => ({ x: c.x + ((p.x - c.x) * r2) / r, y: c.y + ((p.y - c.y) * r2) / r });
      return { kind: "circle", c, r: r2, a: sc(a), b: sc(b) };
    });
    // Eckpunkte: Ende von i und Anfang von i+1 zusammenführen
    const n = chain.length;
    const startIds = new Array(n), endIds = new Array(n);
    const joins = chain.closed ? n : n - 1;
    for (let i = 0; i < joins; i++) {
      const j = (i + 1) % n;
      const q = joinPoint(off[i], off[j]);
      const id = newPt(q.x, q.y);
      endIds[i] = id; startIds[j] = id;
    }
    if (!chain.closed) { startIds[0] = newPt(off[0].a.x, off[0].a.y); endIds[n - 1] = newPt(off[n - 1].b.x, off[n - 1].b.y); }
    chain.forEach((it, i) => {
      const id = uid(it.e.type === "line" ? "l" : "b");
      const s0 = startIds[i], e0 = endIds[i];
      const p1 = it.fwd ? s0 : e0, p2 = it.fwd ? e0 : s0; // Orientierung des Originals beibehalten
      if (it.e.type === "line") sk.entities.push({ id, type: "line", p1, p2, construction: !!it.e.construction });
      else sk.entities.push({ id, type: "arc", c: it.e.c, p1, p2, construction: !!it.e.construction });
      const k = it.e.type === "line" ? (it.fwd ? side : -side) : (it.fwd ? -side : side);
      offCon(it.e.id, id, k);
      created.push(id);
    });
  }
  sk.constraints.push(...cons);
  return { entities: created, master: master?.id };

  function geom(it) {
    const a = xy(it.fwd ? it.e.p1 : it.e.p2), b = xy(it.fwd ? it.e.p2 : it.e.p1);
    if (it.e.type === "line") {
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, nl: [-(b.y - a.y) / L, (b.x - a.x) / L] };
    }
    const c = xy(it.e.c), p1 = xy(it.e.p1), p2 = xy(it.e.p2);
    const r = Math.hypot(p1.x - c.x, p1.y - c.y);
    const a1 = Math.atan2(p1.y - c.y, p1.x - c.x);
    let sw = Math.atan2(p2.y - c.y, p2.x - c.x) - a1;
    while (sw <= 1e-12) sw += 2 * Math.PI;
    const m = { x: c.x + r * Math.cos(a1 + sw / 2), y: c.y + r * Math.sin(a1 + sw / 2) };
    const inward = [(c.x - m.x) / r, (c.y - m.y) / r];
    return { mid: m, nl: it.fwd ? inward : [-inward[0], -inward[1]] };
  }
}

/** Treffpunkt zweier versetzter Kurven nahe dem Übergang (Ende von u, Anfang von v) */
function joinPoint(u, v) {
  const E = u.b, S = v.a;
  const mid = { x: (E.x + S.x) / 2, y: (E.y + S.y) / 2 };
  if (Math.hypot(E.x - S.x, E.y - S.y) < 1e-7) return mid;
  let cands = [];
  if (u.kind === "line" && v.kind === "line") {
    const r = lineLine(u.a, u.b, v.a, v.b);
    if (r) cands = [r];
  } else if (u.kind === "line" || v.kind === "line") {
    const ln = u.kind === "line" ? u : v, ci = u.kind === "line" ? v : u;
    cands = lineCircle(ln.a, ln.b, ci.c, ci.r);
  } else cands = circleCircle(u.c, u.r, v.c, v.r);
  if (!cands.length) return mid;
  return cands.reduce((best, q) => (Math.hypot(q.x - mid.x, q.y - mid.y) < Math.hypot(best.x - mid.x, best.y - mid.y) ? q : best));
}
function lineLine(a, b, c, d) {
  const r = [b.x - a.x, b.y - a.y], s = [d.x - c.x, d.y - c.y];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - a.x) * s[1] - (c.y - a.y) * s[0]) / den;
  return { x: a.x + t * r[0], y: a.y + t * r[1] };
}
function lineCircle(a, b, c, r) {
  const dx = b.x - a.x, dy = b.y - a.y, fx = a.x - c.x, fy = a.y - c.y;
  const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - r * r;
  const D = B * B - 4 * A * C;
  if (D < 0 || A < 1e-18) return [];
  const sq = Math.sqrt(D);
  return [(-B - sq) / (2 * A), (-B + sq) / (2 * A)].map((t) => ({ x: a.x + t * dx, y: a.y + t * dy }));
}
function circleCircle(c1, r1, c2, r2) {
  const dx = c2.x - c1.x, dy = c2.y - c1.y, D = Math.hypot(dx, dy);
  if (D < 1e-12 || D > r1 + r2 || D < Math.abs(r1 - r2)) return [];
  const a = (r1 * r1 - r2 * r2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const mx = c1.x + (a * dx) / D, my = c1.y + (a * dy) / D;
  return [{ x: mx + (h * dy) / D, y: my - (h * dx) / D }, { x: mx - (h * dy) / D, y: my + (h * dx) / D }];
}

const NAMES = {
  horizontal: "Horizontal", vertical: "Vertikal", coincident: "Koinzident", fix: "Fixiert", pointOnLine: "Punkt auf Linie", pointOnCircle: "Punkt auf Kreis",
  midpoint: "Mittelpunkt", parallel: "Parallel", perpendicular: "Senkrecht", collinear: "Kollinear", equal: "Gleich", concentric: "Konzentrisch",
  tangent: "Tangential", tangentAt: "Tangential", symmetric: "Symmetrisch", distance: "Abstand", offset: "Versatz", length: "Länge", radius: "Radius", diameter: "Durchmesser", angle: "Winkel",
};
/** Klartext einer Bedingung, z. B. »Abstand 120« oder »Parallel« */
export function constraintLabel(c) {
  const n = NAMES[c.type] || c.type;
  if (c.value !== undefined && c.value !== null && c.value !== "") return `${n} ${c.value}${c.type === "angle" ? "°" : ""}`;
  return n;
}
