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
