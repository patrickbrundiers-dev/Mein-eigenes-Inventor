// Skizzenwerkzeuge aus dem SolidCraft-Abgleich: Form, Löser, Kontur, Kopieren/Einfügen, SVG
import test from "node:test";
import assert from "node:assert/strict";
import { buildRoundedRect, buildMidLine, buildCircle2, buildArcSlot, buildHelperLine, tangentPoints, commonTangents, bisectors, joinCorner, equationPoints, fitSplineCtrl, addSplineFromCtrl, conicPoints, copyEntities, pasteEntities, svgToPrims } from "../src/core/sketchtools.js";
import { solveSketch } from "../src/core/solver.js";
import { newSketch, extractProfiles } from "../src/core/sketch.js";
import { splineNearest } from "../src/core/spline.js";

let n = 0;
const uid = (p) => `${p}${++n}`;
const usePoint = (sk, sn) => { if (sn.pointId) return sn.pointId; const id = uid("p"); sk.points.push({ id, x: sn.x, y: sn.y }); return id; };
const near = (a, b, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b}`);
const sketch = () => newSketch("s", "S", { ref: "XY" });
const P = (sk, id) => sk.points.find((p) => p.id === id);
const area = (sk) => extractProfiles(sk).regions.reduce((s, r) => s + Math.abs(r.area ?? 0), 0);

test("Abgerundetes Rechteck: geschlossen, Fläche w·h − (4 − π)·r², Radiusmaß treibt alle Ecken", () => {
  const sk = sketch();
  buildRoundedRect(sk, { x: 0, y: 0 }, { x: 100, y: 60 }, 10, { uid });
  let s = solveSketch(sk);
  assert.ok(s.ok, JSON.stringify(s));
  near(area(sk), 100 * 60 - (4 - Math.PI) * 100, 2, "Fläche (Bögen als Vieleck)");
  const dim = sk.constraints.find((c) => c.type === "radius");
  dim.value = "15";
  s = solveSketch(sk);
  assert.ok(s.ok, JSON.stringify(s));
  for (const a of sk.entities.filter((e) => e.type === "arc")) near(Math.hypot(P(sk, a.p1).x - P(sk, a.c).x, P(sk, a.p1).y - P(sk, a.c).y), 15, 1e-5, "Radius");
  assert.throws(() => buildRoundedRect(sketch(), { x: 0, y: 0 }, { x: 10, y: 10 }, 6, { uid }), /höchstens/);
});

test("Linie aus Mitte: Mitte bleibt Mitte, Kreis über 2 Punkte: Durchmesser", () => {
  const sk = sketch();
  const r = buildMidLine(sk, { x: 10, y: 5 }, { x: 30, y: 5 }, { uid, usePoint });
  const ln = sk.entities.find((e) => e.id === r.line);
  near(P(sk, ln.p1).x, -10); near(P(sk, ln.p2).x, 30);
  P(sk, ln.p2).x = 50;
  assert.ok(solveSketch(sk).ok);
  near((P(sk, ln.p1).x + P(sk, ln.p2).x) / 2, P(sk, r.mid).x, 1e-6, "Mitte");
  const sk2 = sketch();
  const c = buildCircle2(sk2, { x: 0, y: 0 }, { x: 40, y: 0 }, { uid, usePoint });
  assert.ok(solveSketch(sk2).ok);
  const circ = sk2.entities.find((e) => e.id === c.circle);
  near(circ.r, 20); near(P(sk2, c.center).x, 20);
});

test("Bogenlangloch: geschlossen, Fläche = Bahnlänge × Breite + Kreis", () => {
  const sk = sketch();
  buildArcSlot(sk, { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 0, y: 50 }, 10, { uid, usePoint });
  const s = solveSketch(sk);
  assert.ok(s.ok, JSON.stringify(s));
  const prof = extractProfiles(sk);
  assert.equal(prof.regions.length, 1, JSON.stringify(prof.errors));
  near(area(sk), (Math.PI / 2) * 50 * 10 + Math.PI * 25, 4, "Fläche (Bögen als Vieleck)");
  assert.throws(() => buildArcSlot(sketch(), { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 4 }, 10, { uid, usePoint }), /Breite/);
});

test("Hilfslinien: waagrecht/parallel bleiben so, Durchgangspunkt in der Mitte, keine Kontur", () => {
  const sk = sketch();
  const h = buildHelperLine(sk, { x: 5, y: 7 }, [1, 0], { uid, usePoint, kind: "h" });
  const ln = sk.entities.find((e) => e.id === h.line);
  assert.equal(ln.construction, true);
  assert.ok(Math.abs(P(sk, ln.p2).x - P(sk, ln.p1).x) >= 2000);
  const ref = { id: "r", type: "line", p1: uid("p"), p2: uid("p") };
  sk.points.push({ id: ref.p1, x: 0, y: 0 }, { id: ref.p2, x: 10, y: 10 });
  sk.entities.push(ref);
  const p = buildHelperLine(sk, { x: 0, y: 20 }, [1, 1], { uid, usePoint, kind: "parallel", ref: "r" });
  P(sk, ref.p2).y = 20; // Bezug dreht
  assert.ok(solveSketch(sk).ok);
  const pl = sk.entities.find((e) => e.id === p.line);
  const ang = (e) => Math.atan2(P(sk, e.p2).y - P(sk, e.p1).y, P(sk, e.p2).x - P(sk, e.p1).x);
  near(Math.sin(ang(pl) - ang(ref)), 0, 1e-6, "parallel");
  near(P(sk, ln.p1).y, P(sk, ln.p2).y, 1e-9, "waagrecht");
  assert.equal(extractProfiles(sk).regions.length, 0);
});

test("Tangenten, gemeinsame Tangenten, Winkelhalbierende, Ecke", () => {
  const T = tangentPoints({ x: 10, y: 0 }, { x: 0, y: 0 }, 5);
  assert.equal(T.length, 2);
  for (const t of T) near(t.x * (t.x - 10) + t.y * t.y, 0, 1e-9, "Radius ⟂ Tangente");
  assert.equal(tangentPoints({ x: 1, y: 0 }, { x: 0, y: 0 }, 5).length, 0);
  const ct = commonTangents({ x: 0, y: 0 }, 5, { x: 30, y: 0 }, 5);
  assert.equal(ct.length, 4);
  assert.ok(ct.some((q) => Math.abs(q.a.y - 5) < 1e-9 && Math.abs(q.b.y - 5) < 1e-9), "äußere Tangente oben");
  const b = bisectors({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 });
  near(Math.abs(b.dirs[0][0]), Math.SQRT1_2); near(Math.abs(b.dirs[0][1]), Math.SQRT1_2);
  const sk = sketch();
  sk.points.push({ id: "a", x: 0, y: 0 }, { id: "b", x: 8, y: 0 }, { id: "c", x: 10, y: 2 }, { id: "d", x: 10, y: 20 });
  sk.entities.push({ id: "l1", type: "line", p1: "a", p2: "b" }, { id: "l2", type: "line", p1: "c", p2: "d" });
  joinCorner(sk, "l1", "l2", { uid });
  const l2 = sk.entities.find((e) => e.id === "l2");
  assert.equal(l2.p1, "b");
  near(P(sk, "b").x, 10); near(P(sk, "b").y, 0);
  assert.throws(() => joinCorner(sk, "l1", "l1", { uid }));
});

test("Gleichungskurve und Kegelschnitt: Spline läuft durch die Punkte", () => {
  const pts = equationPoints({ mode: "param", x: "50*cos(t)", y: "50*sin(t)", from: "0", to: "180", n: 25 });
  assert.equal(pts.length, 25);
  near(pts[24][0], -50, 1e-9);
  const ctrl = fitSplineCtrl(pts);
  for (const q of pts) assert.ok(splineNearest(ctrl, q[0], q[1]).d < 0.01, "Abstand Punkt–Kurve");
  const fx = equationPoints({ mode: "fx", f: "a*x^2", from: "-10", to: "10", n: 5 }, { a: 2 });
  near(fx[0][1], 200);
  assert.throws(() => equationPoints({ mode: "fx", f: "sqrt(x)", from: "-4", to: "4" }), /nicht berechenbar/);
  assert.throws(() => equationPoints({ from: "1", to: "0" }), /bis/);
  const c = conicPoints({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 10 }, 0.5, 2);
  near(c[1][1], 5, 1e-9, "Parabel: Mitte auf halber Höhe zum Scheitel");
  const sk = sketch();
  addSplineFromCtrl(sk, ctrl, { uid });
  assert.equal(sk.entities.at(-1).type, "spline");
});

test("Kopieren und Einfügen: neue IDs, Bedingungen mitgenommen, verschoben", () => {
  const sk = sketch();
  buildRoundedRect(sk, { x: 0, y: 0 }, { x: 40, y: 20 }, 4, { uid });
  const ids = sk.entities.map((e) => e.id);
  const clip = copyEntities(sk, ids);
  assert.equal(clip.entities.length, 8);
  assert.ok(clip.constraints.length >= 12);
  const other = sketch();
  const neu = pasteEntities(other, JSON.parse(JSON.stringify(clip)), { uid, dx: 100, dy: 0 });
  assert.equal(neu.length, 8);
  assert.ok(neu.every((id) => !ids.includes(id)));
  assert.ok(solveSketch(other).ok);
  near(area(other), 40 * 20 - (4 - Math.PI) * 16, 0.2);
  assert.ok(other.points.every((p) => p.x >= 100 - 1e-9));
});

test("SVG: Pfad, Rechteck, Kreis in mm; Einheit aus width/viewBox", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 200 100">
    <rect x="0" y="0" width="20" height="10"/><circle cx="50" cy="50" r="10"/><path d="M 100 0 L 120 0 L 120 20 Z"/></svg>`;
  const r = svgToPrims(svg);
  near(r.scale, 0.5);
  assert.equal(r.prims.filter((p) => p.kind === "line").length, 7);
  const c = r.prims.find((p) => p.kind === "circle");
  near(c.r, 5); near(c.c[0], 25); near(c.c[1], -25);
  assert.throws(() => svgToPrims("<html></html>"), /Keine SVG/);
});
