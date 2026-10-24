// Langloch, Polygon, Spiegeln: Form, Freiheitsgrade, Kontur, Folgen von Maßänderungen
import test from "node:test";
import assert from "node:assert/strict";
import { buildSlot, buildPolygon, mirrorEntities, offsetEntities, constraintLabel } from "../src/core/sketchshapes.js";
import { solveSketch } from "../src/core/solver.js";
import { newSketch, extractProfiles } from "../src/core/sketch.js";

let n = 0;
const uid = (p) => `${p}${++n}`;
const usePoint = (sk, sn) => { if (sn.pointId) return sn.pointId; const id = uid("p"); sk.points.push({ id, x: sn.x, y: sn.y }); return id; };
const near = (a, b, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b}`);
const sketch = () => newSketch("s", "S", { ref: "XY" });
const P = (sk, id) => sk.points.find((p) => p.id === id);
const area = (sk) => extractProfiles(sk).regions.reduce((s, r) => s + Math.abs(r.area ?? 0), 0);

test("Langloch: 5 Freiheitsgrade, geschlossene Kontur, Fläche, Radius über Maß", () => {
  const sk = sketch();
  const r = buildSlot(sk, { x: 0, y: 0 }, { x: 40, y: 0 }, 5, { uid, usePoint });
  let s = solveSketch(sk);
  assert.ok(s.ok);
  assert.equal(s.dof, 5);
  const prof = extractProfiles(sk);
  assert.equal(prof.regions.length, 1, JSON.stringify(prof.errors));
  // Maße setzen: Mittenabstand 60, Radius 8 → Form bleibt tangential
  sk.constraints.push({ id: "f", type: "fix", p: r.centers[0], x: 0, y: 0 }, { id: "h", type: "horizontal", e: r.axis }, { id: "d", type: "length", e: r.axis, value: "60" }, { id: "rr", type: "radius", e: r.arcs[0], value: "8" });
  s = solveSketch(sk);
  assert.ok(s.ok, JSON.stringify(s));
  assert.equal(s.dof, 0);
  const top = sk.entities.find((e) => e.id === r.lines[0]);
  near(Math.abs(P(sk, top.p1).y), 8, 1e-6, "Abstand Gerade zur Achse");
  near(P(sk, top.p2).x - P(sk, top.p1).x, 60, 1e-6, "Gerade = Mittenabstand");
});

test("Langloch: ungültige Eingaben werden abgelehnt", () => {
  assert.throws(() => buildSlot(sketch(), { x: 0, y: 0 }, { x: 0, y: 0 }, 5, { uid, usePoint }), /zwei verschiedene/);
  assert.throws(() => buildSlot(sketch(), { x: 0, y: 0 }, { x: 10, y: 0 }, 0, { uid, usePoint }), /Radius/);
});

test("Polygon: regelmäßig, 4 Freiheitsgrade, folgt Seitenlänge", () => {
  const sk = sketch();
  const r = buildPolygon(sk, { x: 0, y: 0 }, { x: 10, y: 0 }, 6, { uid, usePoint });
  let s = solveSketch(sk);
  assert.ok(s.ok);
  assert.equal(s.dof, 4);
  assert.equal(extractProfiles(sk).regions.length, 1);
  sk.constraints.push({ id: "f", type: "fix", p: r.center, x: 0, y: 0 }, { id: "h", type: "horizontal", e: r.lines[0] }, { id: "L", type: "length", e: r.lines[0], value: "20" });
  s = solveSketch(sk);
  assert.ok(s.ok);
  assert.equal(s.dof, 0);
  for (const id of r.lines) {
    const e = sk.entities.find((x) => x.id === id);
    near(Math.hypot(P(sk, e.p2).x - P(sk, e.p1).x, P(sk, e.p2).y - P(sk, e.p1).y), 20, 1e-6, "Seite");
  }
  near(Math.hypot(P(sk, r.points[0]).x, P(sk, r.points[0]).y), 20, 1e-6, "Sechseck: Umkreisradius = Seite");
  assert.throws(() => buildPolygon(sketch(), { x: 0, y: 0 }, { x: 1, y: 0 }, 2, { uid, usePoint }), /3 bis 64/);
});

test("Spiegeln: Kopie symmetrisch, Punkte auf der Achse geteilt, folgt Original", () => {
  const sk = sketch();
  sk.points.push({ id: "a", x: 0, y: 0 }, { id: "b", x: 0, y: 50 }, { id: "c", x: 20, y: 10 }, { id: "m", x: 30, y: 30 });
  sk.entities.push({ id: "ax", type: "line", p1: "a", p2: "b", construction: true }, { id: "l1", type: "line", p1: "a", p2: "c" }, { id: "k1", type: "circle", c: "m", r: 4 });
  sk.constraints.push({ id: "fa", type: "fix", p: "a", x: 0, y: 0 }, { id: "v", type: "vertical", e: "ax" });
  const r = mirrorEntities(sk, ["l1", "k1", "ax"], "ax", { uid });
  assert.equal(r.entities.length, 2, "Spiegellinie selbst nicht kopiert");
  const l2 = sk.entities.find((e) => e.id === r.entities[0]);
  assert.equal(l2.p1, "a", "Punkt auf der Achse wird mitbenutzt");
  near(P(sk, l2.p2).x, -20); near(P(sk, l2.p2).y, 10);
  assert.ok(solveSketch(sk).ok);
  // Original verschieben → Kopie folgt
  sk.constraints.push({ id: "fc", type: "fix", p: "c", x: 25, y: 5 }, { id: "rk", type: "radius", e: "k1", value: "6" });
  assert.ok(solveSketch(sk).ok);
  near(P(sk, l2.p2).x, -25, 1e-6); near(P(sk, l2.p2).y, 5, 1e-6);
  const k2 = sk.entities.find((e) => e.id === r.entities[1]);
  near(k2.r, 6, 1e-6, "Radius der Kopie");
  near(P(sk, k2.c).x, -30, 1e-6);
  assert.throws(() => mirrorEntities(sk, ["l1"], "k1", { uid }), /Linie/);
});

test("Bogen spiegeln behält gültige Kontur (Umlaufsinn getauscht)", () => {
  const sk = sketch();
  const s1 = buildSlot(sk, { x: 10, y: 0 }, { x: 30, y: 0 }, 4, { uid, usePoint });
  sk.points.push({ id: "a", x: 0, y: -10 }, { id: "b", x: 0, y: 10 });
  sk.entities.push({ id: "ax", type: "line", p1: "a", p2: "b", construction: true });
  mirrorEntities(sk, [...s1.arcs, ...s1.lines], "ax", { uid });
  assert.ok(solveSketch(sk).ok);
  assert.equal(extractProfiles(sk).regions.length, 2, JSON.stringify(extractProfiles(sk).errors));
});

const rect = (sk, x0, y0, x1, y1) => {
  const ids = ["r1", "r2", "r3", "r4"].map((k) => k + ++n);
  sk.points.push({ id: ids[0], x: x0, y: y0 }, { id: ids[1], x: x1, y: y0 }, { id: ids[2], x: x1, y: y1 }, { id: ids[3], x: x0, y: y1 });
  const ls = ids.map((p, i) => { const id = uid("l"); sk.entities.push({ id, type: "line", p1: p, p2: ids[(i + 1) % 4] }); return id; });
  return { pts: ids, lines: ls };
};
const box = (sk, ids) => { const ps = sk.entities.filter((e) => ids.includes(e.id)).flatMap((e) => [P(sk, e.p1), P(sk, e.p2)]); return [Math.min(...ps.map((p) => p.x)), Math.min(...ps.map((p) => p.y)), Math.max(...ps.map((p) => p.x)), Math.max(...ps.map((p) => p.y))]; };

test("Versatz: Rechteck außen und innen, Ecken im Schnittpunkt, ein Maß steuert alle", () => {
  const sk = sketch();
  const r = rect(sk, 0, 0, 40, 20);
  for (const p of r.pts) sk.constraints.push({ id: uid("f"), type: "fix", p, x: P(sk, p).x, y: P(sk, p).y });
  const o = offsetEntities(sk, r.lines, 5, { x: -10, y: 10 }, { uid });
  assert.equal(o.entities.length, 4);
  assert.equal(sk.points.length, 4 + 4, "vier gemeinsame Ecken");
  let s = solveSketch(sk);
  assert.ok(s.ok, JSON.stringify(s));
  assert.deepEqual(box(sk, o.entities).map((v) => Math.round(v * 1e6) / 1e6), [-5, -5, 45, 25]);
  assert.equal(s.dof, 0, "Ecken über Schnittpunkte bestimmt");
  sk.constraints.find((c) => c.id === o.master).value = "2";
  assert.equal(sk.constraints.filter((c) => c.type === "offset" && !c.hidden).length, 1, "nur ein sichtbares Maß");
  assert.ok(solveSketch(sk).ok);
  assert.deepEqual(box(sk, o.entities).map((v) => Math.round(v * 1e6) / 1e6), [-2, -2, 42, 22]);
  const sk2 = sketch();
  const r2 = rect(sk2, 0, 0, 40, 20);
  const o2 = offsetEntities(sk2, r2.lines, 5, { x: 20, y: 10 }, { uid });
  assert.ok(solveSketch(sk2).ok);
  assert.deepEqual(box(sk2, o2.entities).map((v) => Math.round(v * 1e6) / 1e6), [5, 5, 35, 15]);
});

test("Versatz: Langloch bleibt tangential, Kreis innen/außen, offene Kette", () => {
  const sk = sketch();
  const sl = buildSlot(sk, { x: 0, y: 0 }, { x: 30, y: 0 }, 5, { uid, usePoint });
  const o = offsetEntities(sk, [...sl.arcs, ...sl.lines], 2, { x: 15, y: 20 }, { uid });
  assert.ok(solveSketch(sk).ok);
  const arcs = sk.entities.filter((e) => o.entities.includes(e.id) && e.type === "arc");
  for (const a of arcs) near(Math.hypot(P(sk, a.p1).x - P(sk, a.c).x, P(sk, a.p1).y - P(sk, a.c).y), 7, 1e-6, "Bogenradius");
  assert.equal(extractProfiles(sk).regions.length >= 1, true);
  // Kreis
  sk.points.push({ id: "kc", x: 100, y: 0 });
  sk.entities.push({ id: "kk", type: "circle", c: "kc", r: 10 });
  const ok = offsetEntities(sk, ["kk"], 3, { x: 100, y: 1 }, { uid });
  near(sk.entities.find((e) => e.id === ok.entities[0]).r, 7);
  assert.throws(() => offsetEntities(sk, ["kk"], 12, { x: 100, y: 1 }, { uid }), /Kreisradius/);
  // offene Kette (L-Form): Ecke im Schnittpunkt, zwei freie Enden
  const sk3 = sketch();
  sk3.points.push({ id: "a", x: 0, y: 0 }, { id: "b", x: 20, y: 0 }, { id: "c", x: 20, y: 10 });
  sk3.entities.push({ id: "u", type: "line", p1: "a", p2: "b" }, { id: "v", type: "line", p1: "c", p2: "b" });
  const o3 = offsetEntities(sk3, ["u", "v"], 1, { x: 10, y: 5 }, { uid });
  assert.equal(sk3.points.length, 3 + 3);
  assert.ok(solveSketch(sk3).ok);
  const [l1, l2] = o3.entities.map((id) => sk3.entities.find((e) => e.id === id));
  assert.equal(l1.p2, l2.p2, "gemeinsame Ecke");
  near(P(sk3, l1.p2).x, 19); near(P(sk3, l1.p2).y, 1);
  assert.throws(() => offsetEntities(sk3, ["u"], 0, { x: 0, y: 1 }, { uid }), /größer 0/);
});

test("Klartext für Bedingungen", () => {
  assert.equal(constraintLabel({ type: "distance", value: "120" }), "Abstand 120");
  assert.equal(constraintLabel({ type: "angle", value: "45" }), "Winkel 45°");
  assert.equal(constraintLabel({ type: "parallel" }), "Parallel");
});
