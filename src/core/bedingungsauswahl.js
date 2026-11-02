// Skizze: welche Bedingungen passen zur aktuellen Auswahl? (ohne DOM, damit im Test prüfbar)
// Grundlage für die Bedingungsleiste an der Auswahl und »erst wählen, dann Bedingung«: Elemente anklicken,
// dann genügt ein Klick auf die passende Bedingung – kein Werkzeug, keine zweite Auswahl.

const LABEL = {
  horizontal: "Horizontal", vertical: "Vertikal", fix: "Fixieren", coincident: "Koinzident", parallel: "Parallel",
  perpendicular: "Senkrecht", collinear: "Kollinear", equal: "Gleich", tangent: "Tangential", concentric: "Konzentrisch",
  midpoint: "Mittelpunkt", symmetric: "Symmetrisch",
};
/** Bedingungsarten, die sich aus einer Auswahl ableiten lassen (gleiche Namen wie die Skizzenwerkzeuge) */
export const SELECTION_CONSTRAINT_TOOLS = Object.freeze(Object.keys(LABEL));

/** Auswahl ("e:<id>", "p:<id>", "c:<id>") nach Art sortieren */
export function classifySelection(sk, keys) {
  const ent = new Map(sk.entities.map((e) => [e.id, e]));
  const out = { pts: [], lines: [], circs: [], ells: [], other: 0 };
  for (const k of keys || []) {
    const id = k.slice(2);
    if (k.startsWith("p:")) { out.pts.push(id); continue; }
    if (!k.startsWith("e:")) { out.other++; continue; }
    const e = ent.get(id);
    if (!e) out.other++;
    else if (e.type === "point" && e.p) out.pts.push(e.p);
    else if (e.type === "line") out.lines.push(id);
    else if (e.type === "circle" || e.type === "arc") out.circs.push(id);
    else if (e.type === "ellipse") out.ells.push(id);
    else out.other++;
  }
  return out;
}

const radiusOf = (e, P) => (e.type === "circle" ? e.r : Math.hypot(P.get(e.p1).x - P.get(e.c).x, P.get(e.p1).y - P.get(e.c).y));

/**
 * Passende Bedingungen zur Auswahl. Rückgabe [{ type, label, list }] – list sind die anzulegenden Bedingungen
 * (bei mehreren gleichen Elementen eine je Element bzw. Kette an das erste).
 * check(c) → "ok" | "redundant" | "conflict" (optional): Bedingungen, die nichts mehr ändern oder widersprechen, fallen weg.
 */
export function constraintOptions(sk, keys, check) {
  const s = classifySelection(sk, keys);
  if (s.other) return [];
  const P = new Map(sk.points.map((p) => [p.id, p]));
  const ent = new Map(sk.entities.map((e) => [e.id, e]));
  const { pts, lines, circs, ells } = s;
  const nP = pts.length, nL = lines.length, nC = circs.length, nE = ells.length, n = nP + nL + nC + nE;
  const opts = [];
  const add = (type, list) => { if (list.length) opts.push({ type, label: LABEL[type], list }); };
  const chain = (ids, mk) => ids.slice(1).map((id) => mk(ids[0], id));
  if (!n) return [];
  // nur Linien
  if (nL && n === nL) {
    // eine schon waagrechte/senkrechte Linie bekommt keine zweite Richtung (die Rangprüfung sieht das nicht: Länge 0)
    const hv = new Set(sk.constraints.filter((c) => !c.disabled && (c.type === "horizontal" || c.type === "vertical") && c.e).map((c) => c.e));
    const free = lines.filter((e) => !hv.has(e));
    add("horizontal", free.map((e) => ({ type: "horizontal", e })));
    add("vertical", free.map((e) => ({ type: "vertical", e })));
    if (nL >= 2) {
      add("parallel", chain(lines, (e1, e2) => ({ type: "parallel", e1, e2 })));
      if (nL === 2) add("perpendicular", [{ type: "perpendicular", e1: lines[0], e2: lines[1] }]);
      add("collinear", chain(lines, (e1, e2) => ({ type: "collinear", e1, e2 })));
      add("equal", chain(lines, (e1, e2) => ({ type: "equal", e1, e2 })));
    }
    if (nL === 1) {
      const e = ent.get(lines[0]);
      add("fix", [e.p1, e.p2].map((p) => ({ type: "fix", p, x: P.get(p).x, y: P.get(p).y })));
    }
  }
  // nur Punkte
  if (nP && n === nP) {
    if (nP === 2) {
      add("coincident", [{ type: "coincident", p: pts[0], q: pts[1] }]);
      add("horizontal", [{ type: "horizontal", p: pts[0], q: pts[1] }]);
      add("vertical", [{ type: "vertical", p: pts[0], q: pts[1] }]);
    } else if (nP > 2) {
      add("horizontal", chain(pts, (p, q) => ({ type: "horizontal", p, q })));
      add("vertical", chain(pts, (p, q) => ({ type: "vertical", p, q })));
    }
    add("fix", pts.filter((p) => P.get(p)).map((p) => ({ type: "fix", p, x: P.get(p).x, y: P.get(p).y })));
  }
  // nur Kreise/Bögen (und Ellipsen für konzentrisch)
  if (nC + nE >= 2 && n === nC + nE) {
    add("concentric", chain([...circs, ...ells], (e1, e2) => ({ type: "concentric", e1, e2 })));
    if (!nE) {
      add("equal", chain(circs, (e1, e2) => ({ type: "equal", e1, e2 })));
      if (nC === 2) {
        const a = ent.get(circs[0]), b = ent.get(circs[1]);
        const d = Math.hypot(P.get(a.c).x - P.get(b.c).x, P.get(a.c).y - P.get(b.c).y);
        add("tangent", [{ type: "tangent", e1: circs[0], e2: circs[1], internal: d < Math.max(radiusOf(a, P), radiusOf(b, P)) }]);
      }
    }
  }
  // Linie + Kreis/Bogen/Ellipse
  if (nL === 1 && nC + nE === 1 && n === 2) add("tangent", [{ type: "tangent", e1: lines[0], e2: circs[0] || ells[0] }]);
  // Punkt + Linie
  if (nP === 1 && nL === 1 && n === 2) {
    add("coincident", [{ type: "pointOnLine", p: pts[0], e: lines[0] }]);
    add("midpoint", [{ type: "midpoint", p: pts[0], e: lines[0] }]);
  }
  // Punkt + Kreis/Bogen: auf den Umfang oder in die Mitte
  if (nP === 1 && nC === 1 && n === 2) {
    const c = ent.get(circs[0]);
    add("coincident", [{ type: "pointOnCircle", p: pts[0], e: circs[0] }]);
    if (c.c && c.c !== pts[0]) add("concentric", [{ type: "coincident", p: pts[0], q: c.c }]);
  }
  // zwei Punkte + Linie: symmetrisch
  if (nP === 2 && nL === 1 && n === 3) add("symmetric", [{ type: "symmetric", p: pts[0], q: pts[1], e: lines[0] }]);
  if (!check) return opts;
  return opts.map((o) => ({ ...o, list: o.list.filter((c) => { try { return check(c) === "ok"; } catch { return true; } }) })).filter((o) => o.list.length);
}
