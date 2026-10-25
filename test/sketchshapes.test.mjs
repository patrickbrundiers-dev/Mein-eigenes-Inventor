// Langloch, Polygon, Spiegeln: Form, Freiheitsgrade, Kontur, Folgen von Maßänderungen
import test from "node:test";
import assert from "node:assert/strict";
import { buildSlot, buildPolygon, mirrorEntities, offsetEntities, entitiesInBox, constraintLabel, patternEntities, patternOf } from "../src/core/sketchshapes.js";
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

test("Fensterauswahl: ganz innen bzw. berührend", () => {
  const sk = sketch();
  sk.points.push({ id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 0 }, { id: "c", x: 30, y: 0 }, { id: "m", x: 50, y: 50 });
  sk.entities.push({ id: "l1", type: "line", p1: "a", p2: "b" }, { id: "l2", type: "line", p1: "b", p2: "c" }, { id: "k", type: "circle", c: "m", r: 5 });
  const id = (x, y) => [x, y];
  assert.deepEqual(entitiesInBox(sk, id, { x0: -1, y0: -1, x1: 15, y1: 1 }, false), ["l1"]);
  assert.deepEqual(entitiesInBox(sk, id, { x0: -1, y0: -1, x1: 15, y1: 1 }, true), ["l1", "l2"]);
  assert.deepEqual(entitiesInBox(sk, id, { x0: 20, y0: -5, x1: 25, y1: 5 }, true), ["l2"], "Rechteck schneidet die Linie, ohne Endpunkt innen");
  assert.deepEqual(entitiesInBox(sk, id, { x0: 44, y0: 44, x1: 56, y1: 56 }, false), ["k"]);
  assert.deepEqual(entitiesInBox(sk, id, { x0: 50, y0: 50, x1: 60, y1: 60 }, false), [], "Kreis nicht ganz innen");
  assert.deepEqual(entitiesInBox(sk, id, { x0: 50, y0: 50, x1: 60, y1: 60 }, true), ["k"]);
});

test("Klartext für Bedingungen", () => {
  assert.equal(constraintLabel({ type: "distance", value: "120" }), "Abstand 120");
  assert.equal(constraintLabel({ type: "angle", value: "45" }), "Winkel 45°");
  assert.equal(constraintLabel({ type: "parallel" }), "Parallel");
});

test("Muster: rechteckig und kreisförmig, Werte änderbar", () => {
  const sk = sketch();
  sk.points.push({ id: "m", x: 10, y: 10 });
  sk.entities.push({ id: "k", type: "circle", c: "m", r: 3 });
  sk.constraints.push({ id: "f", type: "fix", p: "m", x: 10, y: 10 }, { id: "r", type: "radius", e: "k", value: "3" });
  const dof0 = solveSketch(sk).dof;
  const r = patternEntities(sk, ["k"], { mode: "lin", nx: 3, ny: 2, a: "20", b: "15" }, { uid });
  assert.equal(r.entities.length, 5);
  let res = solveSketch(sk);
  assert.ok(res.ok, JSON.stringify(res));
  assert.equal(res.dof, dof0, "Kopien vollständig bestimmt");
  const P = () => new Map(sk.points.map((p) => [p.id, p]));
  const centers = () => sk.entities.filter((e) => e.type === "circle").map((e) => P().get(e.c)).map((p) => [Math.round(p.x * 1e6) / 1e6, Math.round(p.y * 1e6) / 1e6]);
  assert.deepEqual(centers().sort((a, b) => a[0] - b[0] || a[1] - b[1]), [[10, 10], [10, 25], [30, 10], [30, 25], [50, 10], [50, 25]]);
  for (const c of sk.constraints) if (c.pat === r.pat && c.type === "pattern") c.value = "30";
  sk.constraints.find((c) => c.id === "r").value = "4";
  assert.ok(solveSketch(sk).ok);
  assert.ok(centers().some(([x, y]) => Math.abs(x - 70) < 1e-6 && Math.abs(y - 25) < 1e-6));
  assert.ok(sk.entities.filter((e) => e.type === "circle").every((e) => Math.abs(e.r - 4) < 1e-6), "Radius folgt dem Original");
  const info = patternOf(sk, r.pat);
  assert.equal(info.nx, 3); assert.equal(info.ny, 2); assert.equal(info.value, "30");

  // kreisförmig: Linie (20,0)–(30,0) 6× um den Ursprung (60°)
  const s2 = sketch();
  s2.points.push({ id: "c", x: 0, y: 0 }, { id: "a", x: 20, y: 0 }, { id: "b", x: 30, y: 0 });
  s2.entities.push({ id: "pc", type: "point", p: "c" }, { id: "l", type: "line", p1: "a", p2: "b" });
  const r2 = patternEntities(s2, ["l"], { mode: "rot", center: "c", n: 6, step: "60" }, { uid });
  assert.equal(r2.entities.length, 5);
  assert.ok(solveSketch(s2).ok);
  const Q = new Map(s2.points.map((p) => [p.id, p]));
  const l3 = s2.entities.find((e) => e.id === r2.entities[2]); // 180°
  near(Q.get(l3.p1).x, -20, 1e-6); near(Q.get(l3.p1).y, 0, 1e-6);
  // Original drehen/verschieben: Kopien folgen
  s2.constraints.push({ id: "L", type: "length", e: "l", value: "15" });
  assert.ok(solveSketch(s2).ok);
  const Q2 = new Map(s2.points.map((p) => [p.id, p]));
  const l1 = s2.entities.find((e) => e.id === r2.entities[0]);
  near(Math.hypot(Q2.get(l1.p2).x - Q2.get(l1.p1).x, Q2.get(l1.p2).y - Q2.get(l1.p1).y), 15, 1e-6);
  assert.throws(() => patternEntities(s2, ["l"], { mode: "lin", nx: 1, ny: 1, a: "5", b: "5" }, { uid }));
});

import { inferLine, inferCircle } from "../src/core/autoconstraints.js";

test("Automatische Bedingungen: parallel, senkrecht, tangential, gleich", () => {
  const sk = sketch();
  // schräge Linie 30° von (0,0) nach (cos30·20, sin30·20)
  const c30 = Math.cos(Math.PI / 6), s30 = Math.sin(Math.PI / 6);
  sk.points.push({ id: "a", x: 0, y: 0 }, { id: "b", x: 20 * c30, y: 20 * s30 });
  sk.entities.push({ id: "l1", type: "line", p1: "a", p2: "b" });
  // parallel: frei gezeichnet bei 31°
  let r = inferLine(sk, { x: 50, y: 0 }, { x: 50 + 30 * Math.cos(31 * Math.PI / 180), y: 30 * Math.sin(31 * Math.PI / 180) });
  assert.equal(r.cons[0].type, "parallel");
  near(Math.atan2(r.b.y, r.b.x - 50), Math.PI / 6, 1e-9);
  // senkrecht am Endpunkt b (Vorgänger), gleich lang innerhalb der Toleranz
  const B = sk.points[1];
  r = inferLine(sk, { x: B.x, y: B.y, pointId: "b" }, { x: B.x - 20.3 * s30, y: B.y + 20.3 * c30 + 0.2 }, { tolLen: 1 });
  assert.deepEqual(r.cons.map((c) => c.type), ["perpendicular", "equal"]);
  near(Math.hypot(r.b.x - B.x, r.b.y - B.y), 20, 1e-9);
  // ohne Toleranz kein "gleich"; mit kinds.parallel=false nichts
  assert.deepEqual(inferLine(sk, { x: B.x, y: B.y, pointId: "b" }, { x: B.x - 20.3 * s30, y: B.y + 20.3 * c30 }).cons.map((c) => c.type), ["perpendicular"]);
  assert.equal(inferLine(sk, { x: 50, y: 0 }, { x: 80, y: 18 }, { kinds: { parallel: false } }), null);
  // Zielpunkt auf bestehendem Punkt: nichts verbiegen
  assert.equal(inferLine(sk, { x: 50, y: 0 }, { x: 70, y: 11, pointId: "a" }), null);
  // tangential am Bogenende: Bogen um (0,50) r=10 von 270° (0,40) bis 0° (10,50); Ende (10,50) Tangente senkrecht
  sk.points.push({ id: "m", x: 0, y: 50 }, { id: "s", x: 0, y: 40 }, { id: "t", x: 10, y: 50 });
  sk.entities.push({ id: "bg", type: "arc", c: "m", p1: "s", p2: "t" });
  r = inferLine(sk, { x: 10, y: 50, pointId: "t" }, { x: 10.5, y: 70 });
  assert.equal(r.cons[0].type, "tangentAt");
  assert.equal(r.cons[0].e1, "bg");
  near(r.b.x, 10, 1e-9);
  // Kreis: gleicher Radius
  sk.points.push({ id: "k0", x: 100, y: 0 });
  sk.entities.push({ id: "kr", type: "circle", c: "k0", r: 8 });
  const ci = inferCircle(sk, { x: 140, y: 0 }, 8.3, { tolR: 0.5 });
  assert.equal(ci.r, 8); assert.equal(ci.cons[0].e2, "kr");
  assert.equal(inferCircle(sk, { x: 140, y: 0 }, 9.3, { tolR: 0.5 }), null);
  // gesetzte Bedingungen ergeben eine lösbare Skizze
  const id = "l2";
  sk.points.push({ id: "q1", x: 50, y: 0 }, { id: "q2", x: 50 + 30 * c30, y: 30 * s30 });
  sk.entities.push({ id, type: "line", p1: "q1", p2: "q2" });
  sk.constraints.push({ id: "kp", type: "parallel", e1: id, e2: "l1" });
  assert.ok(solveSketch(sk).ok);
});
