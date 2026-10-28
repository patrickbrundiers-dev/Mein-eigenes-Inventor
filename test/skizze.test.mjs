// Skizzenumgebung überarbeiten (plan/skizze-ueberarbeiten.md): Löser, Maße, Werkzeuge
import test from "node:test";
import assert from "node:assert/strict";
import { solveSketch, rankAndFree, matrixRank, freeVariables, buildResiduals } from "../src/core/solver.js";
import { buildRect } from "../src/core/dyninput.js";

let n = 0;
const uid = (p) => p + ++n;
const base = () => ({ points: [{ id: "O", x: 0, y: 0 }], entities: [{ id: "Oe", type: "point", p: "O", construction: true, origin: true }], constraints: [{ id: "Of", type: "fix", p: "O", x: 0, y: 0 }] });
const usePoint = (s, sn) => { const id = uid("p"); s.points.push({ id, x: sn.x, y: sn.y }); return id; };
/** Jacobi-Matrix numerisch (wie im Löser) für den Vergleich alter/neuer Analyse */
function jac(sk) {
  const { vars, res } = buildResiduals(sk, {});
  const x = Float64Array.from(vars.x);
  return res.map((r) => Float64Array.from(x, (_, j) => { const o = x[j], h = 1e-7 * Math.max(1, Math.abs(o)); x[j] = o + h; const a = r.f(x); x[j] = o - h; const b = r.f(x); x[j] = o; return (a - b) / (2 * h); }));
}

test("S1: Rang und freie Variablen in einem Durchgang wie bisher (Gram-Schmidt)", () => {
  // Mischung: bemaßte, teilbemaßte und freie Rechtecke, Kreise, schräge Linie mit Winkel
  const sk = base();
  for (let i = 0; i < 6; i++) {
    const r = buildRect(sk, { x: i * 30 + 3, y: 2 }, { x: i * 30 + 23, y: 17 }, { uid, usePoint, dims: i % 3 === 0 ? { w: "20", h: "15" } : i % 3 === 1 ? { w: "20" } : {} });
    if (i % 2 === 0) sk.constraints.push({ id: uid("m"), type: "distance", p: "O", q: r.points[0], dir: "h", value: String(i * 30 + 3) });
  }
  const c = usePoint(sk, { x: 10, y: 50 });
  sk.entities.push({ id: "kk", type: "circle", c, r: 4 });
  sk.constraints.push({ id: "kr", type: "diameter", e: "kk", value: "8" });
  assert.ok(solveSketch(sk, {}).ok);
  const J = jac(sk), N = J[0].length;
  const an = rankAndFree(J, N);
  assert.equal(an.rank, matrixRank(J));
  assert.deepEqual([...an.free], [...freeVariables(J, N)]);
});

test("S1: Löser mit vielen bemaßten Rechtecken bleibt schnell", () => {
  const sk = base();
  for (let i = 0; i < 60; i++) {
    const r = buildRect(sk, { x: i * 30 + 3, y: 2 }, { x: i * 30 + 23, y: 17 }, { uid, usePoint, dims: { w: "20", h: "15" } });
    sk.constraints.push({ id: uid("m"), type: "distance", p: "O", q: r.points[0], dir: "h", value: String(i * 30 + 5) }, { id: uid("m"), type: "distance", p: "O", q: r.points[0], dir: "v", value: "1" });
  }
  const t = performance.now();
  const r = solveSketch(sk, {}, { free: true });
  const ms = performance.now() - t;
  assert.ok(r.ok);
  assert.equal(r.dof, 0);
  assert.equal(r.free.points.size, 0);
  assert.ok(ms < 1500, `Lösen dauerte ${Math.round(ms)} ms`); // vorher über 600 ms, jetzt um 100 ms (großzügige Grenze für langsame CI)
});

test("S1: waagrechtes/senkrechtes Maß zwischen Punkten auf gleicher Höhe ist lösbar", () => {
  const sk = base();
  sk.points.push({ id: "a", x: 0, y: 0 + 1e-12 }, { id: "b", x: 0, y: 30 });
  sk.entities.push({ id: "l", type: "line", p1: "a", p2: "b" });
  sk.constraints.push({ id: "dx", type: "distance", p: "O", q: "a", dir: "h", value: "12" }, { id: "dy", type: "distance", p: "O", q: "a", dir: "v", value: "5" });
  const r = solveSketch(sk, {});
  assert.ok(r.ok, JSON.stringify(r));
  const a = sk.points.find((p) => p.id === "a");
  assert.ok(Math.abs(Math.abs(a.x) - 12) < 1e-6 && Math.abs(Math.abs(a.y) - 5) < 1e-6);
  // Seite bleibt erhalten: Punkt links vom Ursprung bleibt links
  const s2 = base();
  s2.points.push({ id: "q", x: -8, y: 3 });
  s2.entities.push({ id: "pq", type: "point", p: "q" });
  s2.constraints.push({ id: "d", type: "distance", p: "O", q: "q", dir: "h", value: "20" });
  assert.ok(solveSketch(s2, {}).ok);
  assert.ok(Math.abs(s2.points.find((p) => p.id === "q").x + 20) < 1e-6);
});

import { measureConstraint, checkNewConstraint } from "../src/core/solver.js";
import { autoDimension } from "../src/core/autodim.js";
import { constraintLabel, transformEntities } from "../src/core/sketchshapes.js";
test("S2: Winkel zur x-Achse hält die Linie, lässt sich ändern und messen", () => {
  const sk = base();
  sk.points.push({ id: "a", x: 0, y: 0 }, { id: "b", x: 25, y: 43.3 });
  sk.entities.push({ id: "l", type: "line", p1: "a", p2: "b" });
  sk.constraints.push({ id: "c", type: "coincident", p: "O", q: "a" }, { id: "len", type: "length", e: "l", value: "50" }, { id: "w", type: "lineAngle", e: "l", value: "60" });
  let r = solveSketch(sk, {}, { free: true });
  assert.ok(r.ok);
  assert.equal(r.dof, 0, "Länge + Winkel + Anfang legen die Linie fest");
  assert.ok(Math.abs(measureConstraint(sk, { type: "lineAngle", e: "l" }) - 60) < 1e-6);
  sk.constraints.find((c) => c.id === "w").value = "135";
  r = solveSketch(sk, {});
  assert.ok(r.ok);
  const b = sk.points.find((p) => p.id === "b");
  assert.ok(Math.abs(b.x + 50 * Math.SQRT1_2) < 1e-6 && Math.abs(b.y - 50 * Math.SQRT1_2) < 1e-6);
  assert.ok(Math.abs(measureConstraint(sk, { type: "lineAngle", e: "l" }) - 135) < 1e-6);
  // 300° (nach rechts unten) misst als 300, nicht −60
  sk.constraints.find((c) => c.id === "w").value = "300";
  assert.ok(solveSketch(sk, {}).ok);
  assert.ok(Math.abs(measureConstraint(sk, { type: "lineAngle", e: "l" }) - 300) < 1e-6);
  // zweiter Winkel wäre überzählig
  assert.notEqual(checkNewConstraint(sk, { id: "w2", type: "lineAngle", e: "l", value: "300" }), "ok");
  assert.equal(constraintLabel({ type: "lineAngle", value: "60" }), "Winkel zur x-Achse 60°");
});

test("S2: Drehen entfernt den Winkel zur x-Achse, Voll bemaßen setzt ihn bei einzelnen schrägen Linien", () => {
  const sk = base();
  sk.points.push({ id: "a", x: 10, y: 10 }, { id: "b", x: 40, y: 30 });
  sk.entities.push({ id: "l", type: "line", p1: "a", p2: "b" });
  const ad = autoDimension(sk, {}, { uid });
  assert.ok(ad.constraints.some((c) => c.type === "lineAngle"), JSON.stringify(ad.constraints.map((c) => c.type)));
  assert.equal(ad.dofAfter, 0);
  sk.constraints.push(...ad.constraints);
  transformEntities(sk, ["l"], { kind: "rotate", cx: 0, cy: 0, angle: 30 }, { uid });
  assert.ok(!sk.constraints.some((c) => c.type === "lineAngle"));
});

import { chamferCorner, filletCorner } from "../src/core/sketchedit.js";
import { extractProfiles } from "../src/core/sketch.js";
import { buildTangentArc, tangentArcCenter } from "../src/core/sketchshapes.js";
/** Rechteck 0..40 × 0..20 mit Ecke fix und Breite/Höhe bemaßt */
function rect40() {
  const sk = base();
  const r = buildRect(sk, { x: 0, y: 0 }, { x: 40, y: 20 }, { uid, usePoint, dims: { w: "40", h: "20" } });
  sk.constraints.push({ id: uid("k"), type: "coincident", p: "O", q: r.points[0] });
  return { sk, r };
}
test("S5: Skizzenfase mit gleichen und mit zwei Abständen, Maß änderbar, Kontur geschlossen", () => {
  let { sk, r } = rect40();
  const corner = r.points[2]; // (40, 20)
  const res = chamferCorner(sk, corner, 5, uid, { expr1: "5" });
  assert.ok(res.ok, res.message);
  let s = solveSketch(sk, {}, { free: true });
  assert.ok(s.ok);
  assert.equal(s.dof, 0, "Fase mit Maß bleibt voll bestimmt");
  assert.equal(extractProfiles(sk).regions.length, 1);
  const L = sk.entities.find((e) => e.id === res.lineId), P = new Map(sk.points.map((p) => [p.id, p]));
  assert.ok(Math.abs(Math.hypot(P.get(L.p1).x - P.get(L.p2).x, P.get(L.p1).y - P.get(L.p2).y) - 5 * Math.SQRT2) < 1e-6);
  // Maß ändern: beide Seiten folgen (zweiter Abstand hängt am ersten)
  sk.constraints.find((c) => c.id === res.dims[0]).value = "8";
  assert.ok(solveSketch(sk, {}).ok);
  const P2 = new Map(sk.points.map((p) => [p.id, p]));
  assert.ok(Math.abs(Math.hypot(P2.get(L.p1).x - P2.get(L.p2).x, P2.get(L.p1).y - P2.get(L.p2).y) - 8 * Math.SQRT2) < 1e-6);
  // zwei Abstände
  ({ sk, r } = rect40());
  const r2 = chamferCorner(sk, r.points[2], 4, uid, { d2: 10, expr1: "4", expr2: "10" });
  assert.ok(r2.ok);
  assert.ok(solveSketch(sk, {}).ok);
  assert.ok(r2.dims.every((id) => !sk.constraints.find((c) => c.id === id).hidden));
  // zu groß / parallel
  ({ sk, r } = rect40());
  assert.equal(chamferCorner(sk, r.points[2], 25, uid).ok, false);
  // Rundung arbeitet nach dem Umbau wie bisher
  ({ sk, r } = rect40());
  assert.ok(filletCorner(sk, r.points[2], 5, uid, "5").ok);
  const sf = solveSketch(sk, {});
  assert.ok(sf.ok && sf.dof === 0);
});

test("S5: Tangentialer Bogen schließt an die Linie an", () => {
  const c = tangentArcCenter({ x: 10, y: 0 }, { x: 1, y: 0 }, { x: 20, y: 10 });
  assert.ok(Math.abs(c.c.x - 10) < 1e-9 && Math.abs(c.c.y - 10) < 1e-9 && Math.abs(c.r - 10) < 1e-9 && c.ccw);
  assert.equal(tangentArcCenter({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 30, y: 0 }), null);
  const sk = base();
  sk.points.push({ id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 0 });
  sk.entities.push({ id: "l", type: "line", p1: "a", p2: "b" });
  const res = buildTangentArc(sk, "b", "l", { x: 20, y: -10 }, { uid, usePoint });
  const arc = sk.entities.find((e) => e.id === res.arc);
  assert.equal(arc.p2, "b", "nach rechts unten: Bogen im Uhrzeigersinn → p2 ist der Anschlusspunkt");
  assert.ok(solveSketch(sk, {}).ok);
  // Linienende hochziehen: Bogen bleibt tangential (Radius ⟂ Linie im Anschlusspunkt)
  sk.constraints.push({ id: "fa", type: "fix", p: "a", x: 0, y: 0 }, { id: "fb", type: "fix", p: "b", x: 10, y: 3 });
  assert.ok(solveSketch(sk, {}).ok);
  const P = new Map(sk.points.map((p) => [p.id, p])), C = P.get(arc.c), B = P.get("b"), A = P.get("a");
  const dot = (B.x - C.x) * (B.x - A.x) + (B.y - C.y) * (B.y - A.y);
  assert.ok(Math.abs(dot) < 1e-6);
  assert.throws(() => buildTangentArc(sk, "b", "l", { x: 30, y: 9 }, { uid, usePoint }));
});

import { explainDependency } from "../src/core/solver.js";
test("S6: Widerspruch nennt die beteiligten Bedingungen, Freiheitsgrade als Richtungen", () => {
  const { sk, r } = rect40();
  // Länge der Unterkante ist schon über das Breitenmaß festgelegt (Oberkante 40, Rechteck)
  const bottom = sk.entities.find((e) => e.id === r.lines[0]);
  const ids = explainDependency(sk, { id: "neu", type: "length", e: bottom.id, value: "50" });
  const types = ids.map((id) => sk.constraints.find((c) => c.id === id).type);
  assert.ok(types.includes("distance"), JSON.stringify(types));
  assert.ok(!types.includes("coincident") || types.length > 1);
  // freie Linie: Anfang fix → Ende kann zwei Richtungen; mit Länge nur noch eine (tangential zum Kreis um den Anfang)
  const s2 = base();
  s2.points.push({ id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 0 });
  s2.entities.push({ id: "l", type: "line", p1: "a", p2: "b" });
  s2.constraints.push({ id: "c", type: "coincident", p: "O", q: "a" });
  let res = solveSketch(s2, {}, { free: true, directions: true });
  assert.equal(res.free.dirs.get("b").length, 2);
  assert.ok(!res.free.dirs.has("a"));
  s2.constraints.push({ id: "len", type: "length", e: "l", value: "10" });
  res = solveSketch(s2, {}, { free: true, directions: true });
  const d = res.free.dirs.get("b");
  assert.equal(d.length, 1);
  assert.ok(Math.abs(d[0][0]) < 1e-6 && Math.abs(Math.abs(d[0][1]) - 1) < 1e-6, JSON.stringify(d));
});
