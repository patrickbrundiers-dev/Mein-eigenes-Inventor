// Baugruppen-Abhängigkeiten: Fläche an Fläche (gegeneinander) und bündig, dauerhaft gespeichert.
// Flächen werden im Bauteil-Koordinatensystem als Ebene (Normale n, Abstand d = n·p) gemerkt und nach
// Änderungen des Bauteils über die nächstgelegene ebene Fläche gleicher Normale wiedergefunden.
// Konzentrisch: Achse einer Zylinderfläche (Punkt p, Richtung d, Radius r) an Achse eines anderen Bauteils.
import { placementMatrix, matApply, matApplyDir, alignFaces, alignAxes, pointLineDistance, decomposePlacement, matInvertRigid, matMul, rotationAbout, translation, v3 } from "./geom.js";

// Weitere Arten (Werkzeuge Stufe 39): Winkel zwischen zwei ebenen Flächen, Tangential (Ebene an Zylinder),
// Einfügen (Achse fluchtend und Stirnfläche an Stirnfläche, z. B. Schraube in Bohrung).
export const CONSTRAINT_TYPES = Object.freeze({
  gegen: "Fläche an Fläche", buendig: "Bündig", konzentrisch: "Konzentrisch", winkel: "Winkel", tangential: "Tangential", einfuegen: "Einfügen",
});

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
const refresh = (ref, faces) => (ref.plane ? refreshInsert(ref, faces) : ref.axis ? refreshAxis(ref, faces) : refreshRef(ref, faces));

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

/**
 * Löst alle Abhängigkeiten einer Baugruppe der Reihe nach (mehrere Durchläufe).
 * facesOf(partId) -> Liste ebener Flächen des Bauteils {type, normal, point}
 * Ändert comp.pos/rot in-place. Rückgabe {changed, errors: {constraintId: text}}
 */
export function solveAssembly(asm, facesOf, evalGap = (g) => Number(g) || 0) {
  const comps = new Map(asm.components.map((c) => [c.id, c]));
  const errors = {};
  let changed = false;
  const list = (asm.constraints || []).filter((c) => !c.suppressed);
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (const c of list) {
      const A = comps.get(c.a.comp), B = comps.get(c.b.comp);
      if (!A || !B) { errors[c.id] = "Komponente fehlt"; continue; }
      const ra = refresh(c.a, facesOf(A.part)), rb = refresh(c.b, facesOf(B.part));
      if (!ra || !rb) { errors[c.id] = c.type === "konzentrisch" ? "Achse nicht mehr gefunden" : "Fläche nicht mehr gefunden"; continue; }
      for (const [ref, r] of [[c.a, ra], [c.b, rb]]) {
        if (ref.axis) Object.assign(ref, { p: r.p, d: r.d, r: r.r });
        else ref.d = r.d;
        if (ref.plane) ref.plane = r.plane;
      }
      // bewegt wird B; ist B fixiert, dann A (falls frei)
      // Komponenten mit Drehgelenk bewegen sich nur über den Gelenkwinkel (M23) – wie fixiert
      const held = (c) => c.fixed || !!c.joint;
      let [fix, mov, rf, rm] = [A, B, ra, rb];
      if (held(B) && !held(A)) [fix, mov, rf, rm] = [B, A, rb, ra];
      if (held(mov)) {
        if (!satisfied(fix, rf, mov, rm, c.type, evalGap(c.gap), evalGap(c.angle ?? "90"))) errors[c.id] = "Beide Bauteile fixiert (oder mit Drehgelenk) – Abhängigkeit nicht erfüllt";
        continue;
      }
      const MF = placementMatrix(fix.pos, fix.rot), MM = placementMatrix(mov.pos, mov.rot);
      let m;
      if (c.type === "konzentrisch") {
        m = alignAxes(MM, matApply(MM, rm.p), matApplyDir(MM, rm.d), matApply(MF, rf.p), matApplyDir(MF, rf.d));
      } else if (c.type === "einfuegen") {
        const pl = (M, r) => ({ n: v3.norm(matApplyDir(M, r.plane.n)), p: matApply(M, v3.mul(r.plane.n, r.plane.d)) });
        const F = pl(MF, rf), Mv = pl(MM, rm);
        m = alignFaces(MM, Mv.p, Mv.n, F.p, F.n, "gegen", evalGap(c.gap));
        m = alignAxes(m, matApply(m, rm.p), matApplyDir(m, rm.d), matApply(MF, rf.p), matApplyDir(MF, rf.d));
      } else if (c.type === "winkel") {
        const nF = v3.norm(matApplyDir(MF, rf.n)), nM = v3.norm(matApplyDir(MM, rm.n)), pM = matApply(MM, v3.mul(rm.n, rm.d));
        const want = evalGap(c.angle ?? "90");
        if (!(want >= 0 && want <= 180)) { errors[c.id] = "Winkel 0 bis 180°"; continue; }
        let k = v3.cross(nM, nF);
        if (v3.len(k) < 1e-9) k = Math.abs(nM[0]) < 0.9 ? v3.cross(nM, [1, 0, 0]) : v3.cross(nM, [0, 1, 0]);
        m = matMul(rotationAbout(pM, k, angleOf(nM, nF) - want), MM);
      } else if (c.type === "tangential") {
        const plane = rf.axis ? rm : rf, axis = rf.axis ? rf : rm;
        const MP = rf.axis ? MM : MF, MA = rf.axis ? MF : MM;
        const n = v3.norm(matApplyDir(MP, plane.n)), p0 = matApply(MP, v3.mul(plane.n, plane.d));
        const ad = v3.norm(matApplyDir(MA, axis.d)), ap = matApply(MA, axis.p);
        if (Math.abs(v3.dot(n, ad)) > 1e-6) { errors[c.id] = "Zylinderachse liegt nicht parallel zur Fläche"; continue; }
        const dist = v3.dot(n, v3.sub(ap, p0));
        const target = (dist < 0 ? -1 : 1) * (axis.r + evalGap(c.gap));
        // bewegt wird mov: hat er die Achse, rückt sie; hat er die Ebene, rückt die Ebene entgegen
        const move = rf.axis ? v3.mul(n, -(target - dist)) : v3.mul(n, target - dist);
        m = matMul(translation(move), MM);
      } else {
        const nF = v3.norm(matApplyDir(MF, rf.n)), pF = matApply(MF, v3.mul(rf.n, rf.d));
        const nM = v3.norm(matApplyDir(MM, rm.n)), pM = matApply(MM, v3.mul(rm.n, rm.d));
        m = alignFaces(MM, pM, nM, pF, nF, c.type === "buendig" ? "buendig" : "gegen", evalGap(c.gap));
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
    if (!satisfied(A, c.a, B, c.b, c.type, evalGap(c.gap), evalGap(c.angle ?? "90"))) errors[c.id] = "Nicht erfüllbar – widerspricht einer anderen Abhängigkeit";
  }
  return { changed, errors };
}

function angDiff(a, b) {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
function satisfied(A, ra, B, rb, type, gap, angle = 90) {
  const MA0 = placementMatrix(A.pos, A.rot), MB0 = placementMatrix(B.pos, B.rot);
  if (type === "winkel") return Math.abs(angleOf(matApplyDir(MA0, ra.n), matApplyDir(MB0, rb.n)) - angle) < 1e-4;
  if (type === "tangential") {
    const [P, MP, X, MX] = ra.axis ? [rb, MB0, ra, MA0] : [ra, MA0, rb, MB0];
    const n = v3.norm(matApplyDir(MP, P.n)), p0 = matApply(MP, v3.mul(P.n, P.d));
    const ad = v3.norm(matApplyDir(MX, X.d));
    return Math.abs(v3.dot(n, ad)) < 1e-6 && Math.abs(Math.abs(v3.dot(n, v3.sub(matApply(MX, X.p), p0))) - (X.r + gap)) < 1e-4;
  }
  if (type === "einfuegen") {
    return satisfied(A, ra, B, rb, "konzentrisch", 0) && satisfied(A, { comp: ra.comp, ...ra.plane }, B, { comp: rb.comp, ...rb.plane }, "gegen", gap);
  }
  if (type === "konzentrisch") {
    const MA = placementMatrix(A.pos, A.rot), MB = placementMatrix(B.pos, B.rot);
    const dA = v3.norm(matApplyDir(MA, ra.d)), dB = v3.norm(matApplyDir(MB, rb.d));
    return Math.abs(Math.abs(v3.dot(dA, dB)) - 1) < 1e-6 && pointLineDistance(matApply(MB, rb.p), matApply(MA, ra.p), dA) < 1e-4;
  }
  const MA = placementMatrix(A.pos, A.rot), MB = placementMatrix(B.pos, B.rot);
  const nA = v3.norm(matApplyDir(MA, ra.n)), pA = matApply(MA, v3.mul(ra.n, ra.d));
  const nB = v3.norm(matApplyDir(MB, rb.n)), pB = matApply(MB, v3.mul(rb.n, rb.d));
  const want = type === "buendig" ? 1 : -1;
  return Math.abs(v3.dot(nA, nB) - want) < 1e-6 && Math.abs(v3.dot(v3.sub(pB, pA), nA) - gap) < 1e-4;
}
