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
