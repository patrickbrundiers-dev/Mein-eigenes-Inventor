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

const NAMES = {
  horizontal: "Horizontal", vertical: "Vertikal", coincident: "Koinzident", fix: "Fixiert", pointOnLine: "Punkt auf Linie", pointOnCircle: "Punkt auf Kreis",
  midpoint: "Mittelpunkt", parallel: "Parallel", perpendicular: "Senkrecht", collinear: "Kollinear", equal: "Gleich", concentric: "Konzentrisch",
  tangent: "Tangential", tangentAt: "Tangential", symmetric: "Symmetrisch", distance: "Abstand", length: "Länge", radius: "Radius", diameter: "Durchmesser", angle: "Winkel",
};
/** Klartext einer Bedingung, z. B. »Abstand 120« oder »Parallel« */
export function constraintLabel(c) {
  const n = NAMES[c.type] || c.type;
  if (c.value !== undefined && c.value !== null && c.value !== "") return `${n} ${c.value}${c.type === "angle" ? "°" : ""}`;
  return n;
}
