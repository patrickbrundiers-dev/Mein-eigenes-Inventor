// Freiheitsgrade in der Baugruppe (BG3): je Komponente, wie viele Verschiebungen und Drehungen ihr die
// Abhängigkeiten noch lassen – die übrigen Komponenten gelten dabei als feststehend (wie Inventors Freiheitsgrad-Symbol).
// Rechnung über die linearisierten Bedingungen: jede Abhängigkeit liefert Zeilen [v | ω] auf die kleine Bewegung der
// Komponente (Verschiebung v, Drehung ω um ihren Ursprung); frei bleibt der Nullraum dieser Zeilen.
// Daraus auch die freien Richtungen für das Ziehen mit der Maus (BG2): Verschiebung wird auf sie projiziert.
import { placementMatrix, matApply, matApplyDir, v3 } from "./geom.js";

const TOL = 1e-6;
const o0 = (comp) => comp.pos.map(Number);
/** Bezugslänge für Drehungen (mm): Zeilen bleiben gleich gewichtet */
const L = 100;

/** zwei Einheitsvektoren senkrecht zu n */
function perp2(n) {
  const a = v3.norm(Math.abs(n[0]) < 0.9 ? v3.cross(n, [1, 0, 0]) : v3.cross(n, [0, 1, 0]));
  return [a, v3.norm(v3.cross(n, a))];
}
const planeOf = (M, r) => ({ n: v3.norm(matApplyDir(M, r.n)), p: matApply(M, v3.mul(r.n, r.d)) });
const axisOf = (M, r) => ({ d: v3.norm(matApplyDir(M, r.d)), p: matApply(M, r.p) });

/**
 * Zeilen der Abhängigkeit c für die Bewegung der Komponente comp (Welt, Drehung um o).
 * Vorzeichen spielt für den Rang keine Rolle; geometrisch zählt nur die Seite von comp.
 */
export function constraintRows(c, comp, comps) {
  const mine = c.a.comp === comp.id ? c.a : c.b.comp === comp.id ? c.b : c.s?.comp === comp.id ? c.s : null;
  if (!mine) return [];
  const other = mine === c.a ? c.b : c.a;
  const O = comps.get(other.comp);
  const M = placementMatrix(comp.pos, comp.rot), MO = O ? placementMatrix(O.pos, O.rot) : M;
  const o = comp.pos.map(Number);
  // Zeile für »Punkt p bleibt in Richtung n«: [n, (p − o) × n / L]
  const pt = (p, n) => [...n, ...v3.mul(v3.cross(v3.sub(p, o), n), 1 / L)];
  // Zeile für »Richtung a bleibt senkrecht zu t« (a dreht mit): d(a·t) = ω·(a × t)
  const dir = (a, t) => [0, 0, 0, ...v3.cross(a, t)];
  const rows = [];
  const isPlane = (r) => r && !r.axis && !r.point && !r.frame && Array.isArray(r.n);
  switch (c.type) {
    case "starr": case "koordinaten":
      for (let i = 0; i < 6; i++) rows.push([0, 1, 2, 3, 4, 5].map((k) => (k === i ? 1 : 0)));
      break;
    case "punkt": {
      if (!mine.p) break;
      const p = matApply(M, mine.p);
      for (const e of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) rows.push(pt(p, e));
      break;
    }
    case "konzentrisch": case "einfuegen": {
      if (!mine.axis) break;
      const A = axisOf(M, mine);
      for (const t of perp2(A.d)) { rows.push(dir(A.d, t)); rows.push(pt(A.p, t)); }
      if (c.type === "einfuegen" && mine.plane) rows.push(pt(planeOf(M, mine.plane).p, A.d));
      break;
    }
    case "winkel": {
      if (!isPlane(mine) || !O || !isPlane(other)) break;
      const n = planeOf(M, mine).n, nO = planeOf(MO, other).n;
      let k = c.refVec ? null : v3.cross(n, nO);
      if (c.refVec) { const R = comps.get(c.refVec.comp); k = R ? matApplyDir(placementMatrix(R.pos, R.rot), c.refVec.n) : v3.cross(n, nO); }
      if (v3.len(k) < 1e-9) k = perp2(n)[0];
      rows.push([0, 0, 0, ...v3.norm(k)]);
      break;
    }
    case "tangential": {
      if (mine.axis && other?.axis) {
        // Zylinder an Zylinder: Achsen parallel, Abstand fest
        const A = axisOf(M, mine), B = axisOf(MO, other);
        for (const t of perp2(B.d)) rows.push(dir(A.d, t));
        const w = v3.sub(A.p, B.p), u = v3.sub(w, v3.mul(B.d, v3.dot(w, B.d)));
        rows.push(pt(A.p, v3.len(u) > 1e-9 ? v3.norm(u) : perp2(B.d)[0]));
      } else if (mine.axis && isPlane(other)) {
        const A = axisOf(M, mine), n = planeOf(MO, other).n;
        rows.push(dir(A.d, n));
        rows.push(pt(A.p, n));
      } else if (isPlane(mine) && other?.axis) {
        const P = planeOf(M, mine), d = axisOf(MO, other).d;
        rows.push(dir(P.n, d)); // Normale bleibt senkrecht zur Achse
        rows.push(pt(P.p, P.n));
      }
      break;
    }
    case "punktflaeche": case "kanteflaeche": {
      if (isPlane(mine)) {
        const P = planeOf(M, mine);
        rows.push(pt(P.p, P.n));
        if (c.type === "kanteflaeche" && other?.d) rows.push(dir(P.n, v3.norm(matApplyDir(MO, other.d))));
      } else if (mine.p && isPlane(other)) {
        const n = planeOf(MO, other).n, p = matApply(M, mine.p);
        rows.push(pt(p, n));
        if (c.type === "kanteflaeche" && mine.d) rows.push(dir(v3.norm(matApplyDir(M, mine.d)), n));
      }
      break;
    }
    default: {
      // Fläche an Fläche, bündig, Symmetrie: Normale parallel (2 Drehungen) und Abstand (1 Verschiebung)
      if (!isPlane(mine)) break;
      const P = planeOf(M, mine);
      for (const t of perp2(P.n)) rows.push(dir(P.n, t));
      rows.push(pt(P.p, P.n));
    }
  }
  return rows;
}

/** Orthonormalbasis des Zeilenraums (Gram-Schmidt) */
function orthoBasis(rows, dim) {
  const out = [];
  for (const r0 of rows) {
    let r = r0.slice(0, dim);
    for (const b of out) { const k = r.reduce((s, x, i) => s + x * b[i], 0); r = r.map((x, i) => x - k * b[i]); }
    const n = Math.hypot(...r);
    if (n > TOL) out.push(r.map((x) => x / n));
  }
  return out;
}
/** Ergänzung zur Basis B im R^dim */
function complement(B, dim) {
  const id = Array.from({ length: dim }, (_, i) => Array.from({ length: dim }, (_, k) => (k === i ? 1 : 0)));
  return orthoBasis([...B, ...id], dim).slice(B.length);
}

/**
 * Freiheitsgrade einer Komponente. Rückgabe { dof, trans, rot, tDirs: [Einheitsvektoren], rAxes: [Einheitsvektoren],
 * state: "fixiert" | "gelenk" | "muster" | "frei" | "bestimmt" }.
 */
export function componentDof(asm, compId) {
  const comps = new Map((asm.components || []).map((c) => [c.id, c]));
  const comp = comps.get(compId);
  if (!comp) return null;
  if (comp.fixed) return { dof: 0, trans: 0, rot: 0, tDirs: [], rAxes: [], state: "fixiert" };
  if (comp.pat) return { dof: 0, trans: 0, rot: 0, tDirs: [], rAxes: [], state: "muster" };
  if (comp.joint) {
    const d = v3.norm(comp.joint.d || [0, 0, 1]), k = comp.joint.kind;
    const t = k === "schiebe" || k === "zylinder" ? 1 : 0, r = k === "schiebe" ? 0 : 1;
    return { dof: t + r, trans: t, rot: r, tDirs: t ? [d] : [], rAxes: r ? [d] : [], state: "gelenk" };
  }
  const rows = [];
  for (const c of asm.constraints || []) {
    if (c.suppressed) continue;
    const ids = [c.a?.comp, c.b?.comp, c.s?.comp];
    if (!ids.includes(compId)) continue;
    // Abhängigkeit zur eigenen Komponente (beide Seiten gleich) schränkt nichts ein
    if (c.a?.comp === compId && c.b?.comp === compId) continue;
    rows.push(...constraintRows(c, comp, comps));
  }
  const R = orthoBasis(rows, 6);
  const N = complement(R, 6);
  // reine Verschiebungen: senkrecht zu den Verschiebungsanteilen aller Zeilen
  const V = orthoBasis(rows.map((r) => r.slice(0, 3)), 3);
  const tDirs = complement(V, 3);
  const dof = N.length, trans = tDirs.length;
  const rAxes = orthoBasis(N.map((x) => x.slice(3)), 3).slice(0, dof - trans);
  // Lage der Drehachse (nur wenn keine Verschiebung frei ist): Achspunkt q = o + ω × v / |ω|²
  let rPoint = null;
  if (!trans && dof) {
    const x = N.find((y) => Math.hypot(...y.slice(3)) > TOL);
    if (x) { const w = v3.mul(x.slice(3), 1 / L), v = x.slice(0, 3); rPoint = v3.add(o0(comp), v3.mul(v3.cross(w, v), 1 / v3.dot(w, w))); }
  }
  return { dof, trans, rot: dof - trans, tDirs, rAxes, rPoint, state: dof ? "frei" : "bestimmt" };
}

/** Freiheitsgrade aller Komponenten (Map compId → componentDof) */
export function assemblyDof(asm) {
  const out = new Map();
  for (const c of asm.components || []) out.set(c.id, componentDof(asm, c.id));
  return out;
}

/** Kurztext für Baum/Eigenschaften: »2 V · 1 D frei«, »bestimmt«, »fixiert«, »Gelenk« */
export function dofLabel(d) {
  if (!d) return "";
  if (d.state === "fixiert") return "fixiert";
  if (d.state === "gelenk") return "Gelenk";
  if (d.state === "muster") return "";
  if (!d.dof) return "bestimmt";
  return [d.trans ? `${d.trans} V` : "", d.rot ? `${d.rot} D` : ""].filter(Boolean).join(" · ") + " frei";
}

/** Verschiebung delta auf die freien Richtungen projizieren (Ziehen mit der Maus) */
export function projectFree(delta, tDirs) {
  let out = [0, 0, 0];
  for (const t of tDirs || []) out = v3.add(out, v3.mul(t, v3.dot(delta, t)));
  return out;
}
