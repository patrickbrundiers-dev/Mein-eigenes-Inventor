// Baugruppen-Abhängigkeiten: Fläche an Fläche (gegeneinander) und bündig, dauerhaft gespeichert.
// Flächen werden im Bauteil-Koordinatensystem als Ebene (Normale n, Abstand d = n·p) gemerkt und nach
// Änderungen des Bauteils über die nächstgelegene ebene Fläche gleicher Normale wiedergefunden.
// Konzentrisch: Achse einer Zylinderfläche (Punkt p, Richtung d, Radius r) an Achse eines anderen Bauteils.
import { placementMatrix, matApply, matApplyDir, alignFaces, alignAxes, pointLineDistance, decomposePlacement, matInvertRigid, matMul, rotationAbout, translation, v3 } from "./geom.js";

// Weitere Arten (Werkzeuge Stufe 39): Winkel zwischen zwei ebenen Flächen, Tangential (Ebene an Zylinder),
// Einfügen (Achse fluchtend und Stirnfläche an Stirnfläche, z. B. Schraube in Bohrung).
export const CONSTRAINT_TYPES = Object.freeze({
  gegen: "Fläche an Fläche", buendig: "Bündig", konzentrisch: "Konzentrisch", winkel: "Winkel", tangential: "Tangential", einfuegen: "Einfügen", symmetrie: "Symmetrie",
  punkt: "Punkt an Punkt", punktflaeche: "Punkt auf Fläche", kanteflaeche: "Kante auf Fläche", starr: "Starr", koordinaten: "Koordinatensystem",
});

// Werkzeuge Stufe 44 (wie Inventor »Abhängigkeit platzieren«):
//  - Lösung bei Achsen (konzentrisch, einfügen): c.solution "ausgerichtet" | "entgegengesetzt" | "unbestimmt" (Vorgabe)
//  - Winkel mit Referenzvektor c.refVec {comp, n}: gerichteter Winkel 0 … 360° um diese Richtung (Drehsinn eindeutig)
//  - Grenzen c.limits {min, max, rest}: Versatz bzw. Winkel bleibt im Bereich; rest = Wert als Ruhelage
//    (ohne Ruhelage bleibt die heutige Lage stehen, solange sie im Bereich liegt)
//  - Symmetrie: Fläche b liegt spiegelbildlich zu Fläche a bezüglich der Ebene c.s {comp, n, d}
export const AXIS_SOLUTIONS = Object.freeze([["unbestimmt", "Unbestimmt"], ["ausgerichtet", "Ausgerichtet"], ["entgegengesetzt", "Entgegengesetzt"]]);
/** Welcher Wert der Abhängigkeit ist der Versatz (mm) bzw. der Winkel (°)? */
export const valueKey = (type) => (type === "winkel" ? "angle" : ["gegen", "buendig", "tangential", "einfuegen", "punktflaeche", "kanteflaeche"].includes(type) ? "gap" : null);

/** Punktbezug (Eckpunkt oder Kreismitte, Bauteil-System). Punkte und Kanten werden nicht nachgeführt. */
export function pointRef(compId, p) { return { comp: compId, point: true, p: p.map(r9) }; }
/** Bezug auf eine gerade Kante: wie eine Achse ohne Radius (Kante an Kante = konzentrisch) */
export function edgeRef(compId, p, d) { return { comp: compId, axis: true, edge: true, p: p.map(r9), d: v3.norm(d).map(r9), r: 0 }; }
/** Koordinatensystem einer Komponente (Abhängigkeitssatz, starr) */
export const frameRef = (compId) => ({ comp: compId, frame: true });
/** Starr: Lage von B relativ zu A beim Anlegen merken */
export function rigidRelation(A, B) { return matMul(matInvertRigid(placementMatrix(A.pos, A.rot)), placementMatrix(B.pos, B.rot)).map(r9); }
/** Zielwert mit Grenzen: Ruhelage = Wert in den Grenzen, sonst aktueller Wert in den Grenzen */
export function limitTarget(c, want, current) {
  const L = c.limits;
  if (!L || !(Number.isFinite(L.min) || Number.isFinite(L.max))) return want;
  const lo = Number.isFinite(L.min) ? L.min : -Infinity, hi = Number.isFinite(L.max) ? L.max : Infinity;
  const clamp = (x) => Math.min(Math.max(x, Math.min(lo, hi)), Math.max(lo, hi));
  return L.rest === false && Number.isFinite(current) ? clamp(current) : clamp(want);
}
/** Gerichteter Winkel von a nach b um die Achse k (0 … 360°) */
export function signedAngle(a, b, k) {
  const kn = v3.norm(k);
  const pa = v3.norm(v3.sub(a, v3.mul(kn, v3.dot(a, kn)))), pb = v3.norm(v3.sub(b, v3.mul(kn, v3.dot(b, kn))));
  const x = (Math.atan2(v3.dot(v3.cross(pa, pb), kn), v3.dot(pa, pb)) * 180) / Math.PI;
  return x < 0 ? x + 360 : x;
}
const reflect = (n, sN) => v3.sub(n, v3.mul(sN, 2 * v3.dot(n, sN)));

/** Flächenbezug aus einer gepickten ebenen Fläche (Info im Bauteil-System) */
export function faceRef(compId, info) {
  const n = v3.norm(info.normal);
  return { comp: compId, n: n.map(r9), d: r9(v3.dot(n, info.point)) };
}
const r9 = (x) => Math.round(x * 1e9) / 1e9;

/** Achsbezug aus einer gepickten Zylinderfläche (Info im Bauteil-System: axisP, axisD, radius) */
export function axisRef(compId, info) {
  const d = v3.norm(info.axisD);
  const p = v3.sub(info.axisP, v3.mul(d, v3.dot(info.axisP, d))); // Fußpunkt vom Ursprung: unabhängig von der Flächenlage
  return { comp: compId, axis: true, p: p.map(r9), d: d.map(r9), r: r9(info.radius) };
}
/** Achse nach Bauteiländerung wiederfinden: parallele Zylinderachse mit kleinstem Abstand, bei Gleichstand gleicher Radius */
export function refreshAxis(ref, faces) {
  let best = null, bd = Infinity;
  for (const f of faces || []) {
    if (f.type !== "CYLINDER" || !f.axisD || !f.axisP) continue;
    const d = v3.norm(f.axisD);
    if (Math.abs(v3.dot(d, ref.d)) < 0.9999) continue;
    const score = pointLineDistance(ref.p, f.axisP, d) + 1e-3 * Math.abs((f.radius || 0) - ref.r);
    if (score < bd) { bd = score; best = axisRef(ref.comp, f); }
  }
  if (!best) return null;
  if (v3.dot(best.d, ref.d) < 0) best.d = best.d.map((x) => -x);
  return best;
}
/** Einfügen: Achse mit zugehöriger Stirnfläche (Ebene senkrecht zur Achse) */
export function insertRef(compId, axisInfo, planeInfo) {
  const a = axisRef(compId, axisInfo), f = faceRef(compId, planeInfo);
  return { ...a, plane: { n: f.n, d: f.d } };
}
/** Stirnfläche zur gepickten Zylinderfläche: ebene Fläche mit Normale parallel zur Achse, am nächsten zum Klickpunkt */
export function endFaceFor(axisInfo, point, faces) {
  const d = v3.norm(axisInfo.axisD);
  let best = null, bd = Infinity;
  for (const f of faces || []) {
    if (f.type !== "PLANE" || !f.normal || !f.point) continue;
    if (Math.abs(Math.abs(v3.dot(v3.norm(f.normal), d)) - 1) > 1e-6) continue;
    const dist = Math.abs(v3.dot(v3.norm(f.normal), v3.sub(point, f.point)));
    if (dist < bd) { bd = dist; best = f; }
  }
  return best;
}
function refreshInsert(ref, faces) {
  const a = refreshAxis(ref, faces), f = refreshRef({ ...ref.plane, comp: ref.comp }, faces);
  return a && f ? { ...a, plane: { n: f.n, d: f.d } } : null;
}
const refresh = (ref, faces) => (ref.point || ref.edge || ref.frame ? { ...ref } : ref.plane ? refreshInsert(ref, faces) : ref.axis ? refreshAxis(ref, faces) : refreshRef(ref, faces));

/** Winkel zwischen zwei Normalen in Grad (0 … 180) */
const angleOf = (a, b) => (Math.acos(Math.max(-1, Math.min(1, v3.dot(v3.norm(a), v3.norm(b))))) * 180) / Math.PI;

/** Weltpunkt/-normale -> Bauteil-Koordinaten einer Komponente */
export function worldToLocal(comp, p, n) {
  const inv = matInvertRigid(placementMatrix(comp.pos, comp.rot));
  return { p: matApply(inv, p), n: v3.norm(matApplyDir(inv, n)) };
}

/** Bezug nach Bauteiländerung wiederfinden: ebene Fläche gleicher Normale mit nächstem Abstand */
export function refreshRef(ref, faces) {
  let best = null, bd = Infinity;
  for (const f of faces || []) {
    if (f.type !== "PLANE" || !f.normal || !f.point) continue;
    if (v3.dot(v3.norm(f.normal), ref.n) < 0.9999) continue;
    const d = v3.dot(ref.n, f.point);
    if (Math.abs(d - ref.d) < bd) { bd = Math.abs(d - ref.d); best = d; }
  }
  if (best === null) return null;
  return { ...ref, d: r9(best) };
}

/** Achse ausrichten mit Lösung: ausgerichtet (gleiche Richtung), entgegengesetzt oder unbestimmt (nächstliegend) */
function alignAxesSol(mB, pB, dB, pA, dA, sol = "unbestimmt") {
  const a = v3.norm(dA), n = v3.norm(dB);
  const target = sol === "ausgerichtet" ? a : sol === "entgegengesetzt" ? v3.mul(a, -1) : v3.dot(n, a) < 0 ? v3.mul(a, -1) : a;
  const c = v3.dot(n, target);
  let axis = v3.cross(n, target);
  if (v3.len(axis) < 1e-9 && c < 0) axis = Math.abs(n[0]) < 0.9 ? v3.cross(n, [1, 0, 0]) : v3.cross(n, [0, 1, 0]);
  const R = v3.len(axis) > 1e-9 ? rotationAbout(pB, axis, (Math.atan2(v3.len(v3.cross(n, target)), c) * 180) / Math.PI) : translation([0, 0, 0]);
  const off = v3.sub(pA, pB);
  const T = translation(v3.sub(off, v3.mul(a, v3.dot(off, a))));
  return matMul(T, matMul(R, mB));
}
const planeW = (M, r) => ({ n: v3.norm(matApplyDir(M, r.n)), p: matApply(M, v3.mul(r.n, r.d)) });
const mirrorPlane = (P, S) => ({ n: reflect(P.n, S.n), p: v3.sub(P.p, v3.mul(S.n, 2 * v3.dot(v3.sub(P.p, S.p), S.n))) });

/** Aktueller Wert (Versatz in mm bzw. Winkel in °) einer Abhängigkeit zwischen fix und mov */
function currentValue(c, MF, rf, MM, rm, k) {
  if (c.type === "winkel") {
    const nF = v3.norm(matApplyDir(MF, rf.n)), nM = v3.norm(matApplyDir(MM, rm.n));
    return k ? signedAngle(nF, nM, k) : angleOf(nM, nF);
  }
  if (c.type === "tangential" && rf.axis && rm.axis) {
    const dF = v3.norm(matApplyDir(MF, rf.d)), w = v3.sub(matApply(MM, rm.p), matApply(MF, rf.p));
    return v3.len(v3.sub(w, v3.mul(dF, v3.dot(w, dF)))) - (c.solution === "innen" ? Math.abs(rf.r - rm.r) : rf.r + rm.r);
  }
  if (c.type === "punktflaeche" || c.type === "kanteflaeche") {
    const fixHasPlane = !(rf.point || rf.axis);
    const P = planeW(fixHasPlane ? MF : MM, fixHasPlane ? rf : rm), q = fixHasPlane ? matApply(MM, rm.p) : matApply(MF, rf.p);
    return v3.dot(v3.sub(q, P.p), P.n);
  }
  if (c.type === "tangential") {
    const plane = rf.axis ? rm : rf, axis = rf.axis ? rf : rm, MP = rf.axis ? MM : MF, MA = rf.axis ? MF : MM;
    const P = planeW(MP, plane);
    return Math.abs(v3.dot(P.n, v3.sub(matApply(MA, axis.p), P.p))) - axis.r;
  }
  const F = planeW(MF, rf.plane || rf), Mv = planeW(MM, rm.plane || rm);
  return v3.dot(v3.sub(Mv.p, F.p), F.n);
}

/**
 * Löst alle Abhängigkeiten einer Baugruppe der Reihe nach (mehrere Durchläufe).
 * facesOf(partId) -> Liste ebener Flächen des Bauteils {type, normal, point}
 * Ändert comp.pos/rot in-place. Rückgabe {changed, errors: {constraintId: text}, values: {constraintId: wirksamer Wert}}
 */
export function solveAssembly(asm, facesOf, evalGap = (g) => Number(g) || 0) {
  const comps = new Map(asm.components.map((c) => [c.id, c]));
  const errors = {}, values = {};
  let changed = false;
  const list = (asm.constraints || []).filter((c) => !c.suppressed);
  const refDir = (c) => { if (!c.refVec) return null; const C = comps.get(c.refVec.comp); return C ? v3.norm(matApplyDir(placementMatrix(C.pos, C.rot), c.refVec.n)) : null; };
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (const c of list) {
      const A = comps.get(c.a.comp), B = comps.get(c.b.comp), S = c.s ? comps.get(c.s.comp) : null;
      if (!A || !B || (c.type === "symmetrie" && !S)) { errors[c.id] = "Komponente fehlt"; continue; }
      const ra = refresh(c.a, facesOf(A.part)), rb = refresh(c.b, facesOf(B.part)), rs = c.s ? refresh(c.s, facesOf(S.part)) : null;
      if (!ra || !rb || (c.s && !rs)) { errors[c.id] = c.type === "konzentrisch" ? "Achse nicht mehr gefunden" : "Fläche nicht mehr gefunden"; continue; }
      for (const [ref, r] of [[c.a, ra], [c.b, rb], [c.s, rs]]) {
        if (!ref || ref.point || ref.edge || ref.frame) continue;
        if (ref.axis) Object.assign(ref, { p: r.p, d: r.d, r: r.r });
        else ref.d = r.d;
        if (ref.plane) ref.plane = r.plane;
      }
      // bewegt wird B; ist B fixiert, dann A (falls frei)
      // Komponenten mit Drehgelenk bewegen sich nur über den Gelenkwinkel (M23) – wie fixiert
      const held = (c) => c.fixed || !!c.joint;
      let [fix, mov, rf, rm] = [A, B, ra, rb];
      if (held(B) && !held(A)) [fix, mov, rf, rm] = [B, A, rb, ra];
      const MF = placementMatrix(fix.pos, fix.rot), MM = placementMatrix(mov.pos, mov.rot);
      const k = c.type === "winkel" ? refDir(c) : null;
      if (c.refVec && !k) { errors[c.id] = "Komponente des Referenzvektors fehlt"; continue; }
      const vk = valueKey(c.type);
      const want = vk === "angle" ? evalGap(c.angle ?? "90") : vk ? evalGap(c.gap) : 0;
      const target = vk ? limitTarget(c, want, currentValue(c, MF, rf, MM, rm, k)) : 0;
      values[c.id] = target;
      if (held(mov)) {
        if (!satisfied(A, ra, B, rb, c, target, k, comps)) errors[c.id] = "Beide Bauteile fixiert (oder mit Drehgelenk) – Abhängigkeit nicht erfüllt";
        continue;
      }
      let m;
      if (c.type === "konzentrisch") {
        m = alignAxesSol(MM, matApply(MM, rm.p), matApplyDir(MM, rm.d), matApply(MF, rf.p), matApplyDir(MF, rf.d), c.solution);
      } else if (c.type === "einfuegen") {
        const F = planeW(MF, rf.plane), Mv = planeW(MM, rm.plane);
        // Lösung: entgegengesetzt (Vorgabe) = Stirnflächen gegeneinander, ausgerichtet = bündig
        m = alignFaces(MM, Mv.p, Mv.n, F.p, F.n, c.solution === "ausgerichtet" ? "buendig" : "gegen", target);
        m = alignAxes(m, matApply(m, rm.p), matApplyDir(m, rm.d), matApply(MF, rf.p), matApplyDir(MF, rf.d));
      } else if (c.type === "winkel") {
        const nF = v3.norm(matApplyDir(MF, rf.n)), nM = v3.norm(matApplyDir(MM, rm.n)), pM = matApply(MM, v3.mul(rm.n, rm.d));
        if (k) {
          if (!(target >= 0 && target <= 360)) { errors[c.id] = "Winkel 0 bis 360°"; continue; }
          if (Math.abs(v3.dot(nF, k)) > 0.999 || Math.abs(v3.dot(nM, k)) > 0.999) { errors[c.id] = "Referenzvektor liegt parallel zu einer Flächennormale"; continue; }
          m = matMul(rotationAbout(pM, k, target - signedAngle(nF, nM, k)), MM);
        } else {
          if (!(target >= 0 && target <= 180)) { errors[c.id] = "Winkel 0 bis 180°"; continue; }
          let ax = v3.cross(nM, nF);
          if (v3.len(ax) < 1e-9) ax = Math.abs(nM[0]) < 0.9 ? v3.cross(nM, [1, 0, 0]) : v3.cross(nM, [0, 1, 0]);
          m = matMul(rotationAbout(pM, ax, angleOf(nM, nF) - target), MM);
        }
      } else if (c.type === "tangential" && rf.axis && rm.axis) {
        // Zylinder an Zylinder: Achsen parallel, Abstand r1 + r2 (außen) bzw. |r1 − r2| (innen) plus Versatz
        const dF = v3.norm(matApplyDir(MF, rf.d)), pF = matApply(MF, rf.p);
        let m1 = alignAxesSol(MM, matApply(MM, rm.p), matApplyDir(MM, rm.d), matApply(MM, rm.p), dF);
        const pM = matApply(m1, rm.p);
        const w = v3.sub(pM, pF), perp = v3.sub(w, v3.mul(dF, v3.dot(w, dF)));
        const dist = v3.len(perp);
        const u = dist > 1e-9 ? v3.mul(perp, 1 / dist) : v3.norm(Math.abs(dF[0]) < 0.9 ? v3.cross(dF, [1, 0, 0]) : v3.cross(dF, [0, 1, 0]));
        const want2 = (c.solution === "innen" ? Math.abs(rf.r - rm.r) : rf.r + rm.r) + target;
        m = matMul(translation(v3.mul(u, want2 - dist)), m1);
      } else if (c.type === "punkt") {
        m = matMul(translation(v3.sub(matApply(MF, rf.p), matApply(MM, rm.p))), MM);
      } else if (c.type === "punktflaeche" || c.type === "kanteflaeche") {
        const movHasPlane = !(rm.point || rm.axis);
        const plane = movHasPlane ? rm : rf, other = movHasPlane ? rf : rm, MP = movHasPlane ? MM : MF, MO = movHasPlane ? MF : MM;
        let P = planeW(MP, plane);
        const q = matApply(MO, other.p);
        let mm = MM;
        if (c.type === "kanteflaeche") {
          const d = v3.norm(matApplyDir(MO, other.d));
          if (movHasPlane) {
            // Ebene drehen, bis die Kante in ihr liegen kann
            const n2 = v3.sub(P.n, v3.mul(d, v3.dot(P.n, d)));
            if (v3.len(n2) < 1e-9) { errors[c.id] = "Kante steht senkrecht zur Fläche"; continue; }
            const ax = v3.cross(P.n, n2);
            if (v3.len(ax) > 1e-12) mm = matMul(rotationAbout(P.p, ax, angleOf(P.n, n2)), mm);
            P = planeW(mm, plane);
          } else {
            const d2 = v3.sub(d, v3.mul(P.n, v3.dot(d, P.n)));
            if (v3.len(d2) < 1e-9) { errors[c.id] = "Kante steht senkrecht zur Fläche"; continue; }
            const ax = v3.cross(d, d2);
            if (v3.len(ax) > 1e-12) mm = matMul(rotationAbout(q, ax, angleOf(d, d2)), mm);
          }
        }
        const q2 = movHasPlane ? q : matApply(mm, other.p);
        const dist = v3.dot(v3.sub(q2, P.p), P.n);
        m = matMul(translation(v3.mul(P.n, movHasPlane ? dist - target : target - dist)), mm);
      } else if (c.type === "starr") {
        if (!Array.isArray(c.rel) || c.rel.length !== 16) { errors[c.id] = "Starr: Bezugslage fehlt"; continue; }
        m = mov === B ? matMul(MF, c.rel) : matMul(MF, matInvertRigid(c.rel));
      } else if (c.type === "koordinaten") {
        m = MF;
      } else if (c.type === "tangential") {
        const plane = rf.axis ? rm : rf, axis = rf.axis ? rf : rm;
        const MP = rf.axis ? MM : MF, MA = rf.axis ? MF : MM;
        const n = v3.norm(matApplyDir(MP, plane.n)), p0 = matApply(MP, v3.mul(plane.n, plane.d));
        const ad = v3.norm(matApplyDir(MA, axis.d)), ap = matApply(MA, axis.p);
        if (Math.abs(v3.dot(n, ad)) > 1e-6) { errors[c.id] = "Zylinderachse liegt nicht parallel zur Fläche"; continue; }
        const dist = v3.dot(n, v3.sub(ap, p0));
        const tgt = (dist < 0 ? -1 : 1) * (axis.r + target);
        // bewegt wird mov: hat er die Achse, rückt sie; hat er die Ebene, rückt die Ebene entgegen
        const move = rf.axis ? v3.mul(n, -(tgt - dist)) : v3.mul(n, tgt - dist);
        m = matMul(translation(move), MM);
      } else if (c.type === "symmetrie") {
        if (S === mov) { errors[c.id] = "Symmetrieebene gehört zum bewegten Bauteil"; continue; }
        const Sp = planeW(placementMatrix(S.pos, S.rot), rs);
        const T = mirrorPlane(planeW(MF, rf), Sp), Mv = planeW(MM, rm);
        m = alignFaces(MM, Mv.p, Mv.n, T.p, T.n, "buendig", 0);
      } else {
        const nF = v3.norm(matApplyDir(MF, rf.n)), pF = matApply(MF, v3.mul(rf.n, rf.d));
        const nM = v3.norm(matApplyDir(MM, rm.n)), pM = matApply(MM, v3.mul(rm.n, rm.d));
        m = alignFaces(MM, pM, nM, pF, nF, c.type === "buendig" ? "buendig" : "gegen", target);
      }
      const dcp = decomposePlacement(m);
      if (dcp.pos.some((x, k) => Math.abs(x - mov.pos[k]) > 1e-7) || dcp.rot.some((x, k) => Math.abs(angDiff(x, mov.rot[k])) > 1e-7)) {
        mov.pos = dcp.pos;
        mov.rot = dcp.rot;
        moved = true;
        changed = true;
      }
    }
    if (!moved) break;
  }
  // Abschlussprüfung: alle Abhängigkeiten erfüllt? Sonst widersprechen sie sich
  for (const c of list) {
    if (errors[c.id]) continue;
    const A = comps.get(c.a.comp), B = comps.get(c.b.comp);
    const vk = valueKey(c.type);
    const v = values[c.id] ?? (vk === "angle" ? evalGap(c.angle ?? "90") : vk ? evalGap(c.gap) : 0);
    if (!satisfied(A, c.a, B, c.b, c, v, refDir(c), comps)) errors[c.id] = "Nicht erfüllbar – widerspricht einer anderen Abhängigkeit";
  }
  return { changed, errors, values };
}

function angDiff(a, b) {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
/** Ist die Abhängigkeit c zwischen A (Bezug ra) und B (rb) mit dem Wert v erfüllt? */
function satisfied(A, ra, B, rb, c, v, k = null, comps = null) {
  const type = c.type;
  const MA = placementMatrix(A.pos, A.rot), MB = placementMatrix(B.pos, B.rot);
  if (type === "winkel") {
    const nA = matApplyDir(MA, ra.n), nB = matApplyDir(MB, rb.n);
    if (!k) return Math.abs(angleOf(nA, nB) - v) < 1e-4;
    const d = Math.abs(signedAngle(nA, nB, k) - v);
    return Math.min(d, 360 - d) < 1e-4;
  }
  if (type === "tangential" && ra.axis && rb.axis) {
    const dA = v3.norm(matApplyDir(MA, ra.d)), dB = v3.norm(matApplyDir(MB, rb.d));
    const want = (c.solution === "innen" ? Math.abs(ra.r - rb.r) : ra.r + rb.r) + v;
    return Math.abs(Math.abs(v3.dot(dA, dB)) - 1) < 1e-6 && Math.abs(pointLineDistance(matApply(MB, rb.p), matApply(MA, ra.p), dA) - want) < 1e-4;
  }
  if (type === "punkt") return v3.len(v3.sub(matApply(MA, ra.p), matApply(MB, rb.p))) < 1e-4;
  if (type === "punktflaeche" || type === "kanteflaeche") {
    const aPlane = !(ra.point || ra.axis);
    const [P, MP, Q, MQ] = aPlane ? [ra, MA, rb, MB] : [rb, MB, ra, MA];
    const Pw = planeW(MP, P);
    const okDir = type === "punktflaeche" || Math.abs(v3.dot(v3.norm(matApplyDir(MQ, Q.d)), Pw.n)) < 1e-6;
    // Versatz zählt von der Fläche zum Punkt bzw. zur Kante, gleich welche zuerst gewählt wurde
    return okDir && Math.abs(v3.dot(v3.sub(matApply(MQ, Q.p), Pw.p), Pw.n) - v) < 1e-4;
  }
  if (type === "starr" || type === "koordinaten") {
    const want = type === "starr" ? matMul(MA, c.rel) : MA;
    return want.every((x, i) => Math.abs(x - MB[i]) < 1e-6);
  }
  if (type === "tangential") {
    const [P, MP, X, MX] = ra.axis ? [rb, MB, ra, MA] : [ra, MA, rb, MB];
    const n = v3.norm(matApplyDir(MP, P.n)), p0 = matApply(MP, v3.mul(P.n, P.d));
    const ad = v3.norm(matApplyDir(MX, X.d));
    return Math.abs(v3.dot(n, ad)) < 1e-6 && Math.abs(Math.abs(v3.dot(n, v3.sub(matApply(MX, X.p), p0))) - (X.r + v)) < 1e-4;
  }
  if (type === "einfuegen") {
    const mode = c.solution === "ausgerichtet" ? "buendig" : "gegen";
    return satisfied(A, ra, B, rb, { type: "konzentrisch" }, 0) && satisfied(A, { comp: ra.comp, ...ra.plane }, B, { comp: rb.comp, ...rb.plane }, { type: mode }, v);
  }
  if (type === "konzentrisch") {
    const dA = v3.norm(matApplyDir(MA, ra.d)), dB = v3.norm(matApplyDir(MB, rb.d));
    const dot = v3.dot(dA, dB);
    const dirOk = c.solution === "ausgerichtet" ? dot > 1 - 1e-6 : c.solution === "entgegengesetzt" ? dot < -1 + 1e-6 : Math.abs(Math.abs(dot) - 1) < 1e-6;
    return dirOk && pointLineDistance(matApply(MB, rb.p), matApply(MA, ra.p), dA) < 1e-4;
  }
  if (type === "symmetrie") {
    const S = comps?.get(c.s.comp);
    if (!S) return false;
    const T = mirrorPlane(planeW(MA, ra), planeW(placementMatrix(S.pos, S.rot), c.s)), Pb = planeW(MB, rb);
    return v3.dot(T.n, Pb.n) > 1 - 1e-6 && Math.abs(v3.dot(v3.sub(Pb.p, T.p), T.n)) < 1e-4;
  }
  const nA = v3.norm(matApplyDir(MA, ra.n)), pA = matApply(MA, v3.mul(ra.n, ra.d));
  const nB = v3.norm(matApplyDir(MB, rb.n)), pB = matApply(MB, v3.mul(rb.n, rb.d));
  const want = type === "buendig" ? 1 : -1;
  return Math.abs(v3.dot(nA, nB) - want) < 1e-6 && Math.abs(v3.dot(v3.sub(pB, pA), nA) - v) < 1e-4;
}
