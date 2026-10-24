// Baugruppen-Abhängigkeiten: Fläche an Fläche (gegeneinander) und bündig, dauerhaft gespeichert.
// Flächen werden im Bauteil-Koordinatensystem als Ebene (Normale n, Abstand d = n·p) gemerkt und nach
// Änderungen des Bauteils über die nächstgelegene ebene Fläche gleicher Normale wiedergefunden.
import { placementMatrix, matApply, matApplyDir, alignFaces, decomposePlacement, matInvertRigid, v3 } from "./geom.js";

/** Flächenbezug aus einer gepickten ebenen Fläche (Info im Bauteil-System) */
export function faceRef(compId, info) {
  const n = v3.norm(info.normal);
  return { comp: compId, n: n.map(r9), d: r9(v3.dot(n, info.point)) };
}
const r9 = (x) => Math.round(x * 1e9) / 1e9;

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
      const ra = refreshRef(c.a, facesOf(A.part)), rb = refreshRef(c.b, facesOf(B.part));
      if (!ra || !rb) { errors[c.id] = "Fläche nicht mehr gefunden"; continue; }
      c.a.d = ra.d; c.b.d = rb.d;
      // bewegt wird B; ist B fixiert, dann A (falls frei)
      let [fix, mov, rf, rm] = [A, B, ra, rb];
      if (B.fixed && !A.fixed) [fix, mov, rf, rm] = [B, A, rb, ra];
      if (mov.fixed) {
        if (!planesSatisfied(fix, rf, mov, rm, c.type, evalGap(c.gap))) errors[c.id] = "Beide Bauteile fixiert – Abhängigkeit nicht erfüllt";
        continue;
      }
      const MF = placementMatrix(fix.pos, fix.rot), MM = placementMatrix(mov.pos, mov.rot);
      const nF = v3.norm(matApplyDir(MF, rf.n)), pF = matApply(MF, v3.mul(rf.n, rf.d));
      const nM = v3.norm(matApplyDir(MM, rm.n)), pM = matApply(MM, v3.mul(rm.n, rm.d));
      const m = alignFaces(MM, pM, nM, pF, nF, c.type === "buendig" ? "buendig" : "gegen", evalGap(c.gap));
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
  return { changed, errors };
}

function angDiff(a, b) {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
function planesSatisfied(A, ra, B, rb, type, gap) {
  const MA = placementMatrix(A.pos, A.rot), MB = placementMatrix(B.pos, B.rot);
  const nA = v3.norm(matApplyDir(MA, ra.n)), pA = matApply(MA, v3.mul(ra.n, ra.d));
  const nB = v3.norm(matApplyDir(MB, rb.n)), pB = matApply(MB, v3.mul(rb.n, rb.d));
  const want = type === "buendig" ? 1 : -1;
  return Math.abs(v3.dot(nA, nB) - want) < 1e-6 && Math.abs(v3.dot(v3.sub(pB, pA), nA) - gap) < 1e-4;
}
