// Abhängigkeiten einfacher: Skizze »erst wählen, dann Bedingung«, Baugruppe Vorhersage/Umkehren/Tauschen
import test from "node:test";
import assert from "node:assert/strict";
import { constraintOptions, classifySelection } from "../src/core/bedingungsauswahl.js";
import { checkNewConstraint, solveSketch } from "../src/core/solver.js";
import { buildConstraint, predictPlaneSolution, flipOf, placeState } from "../src/ui/abhaengigkeit.js";

const sketch = () => ({
  points: [
    { id: "O", x: 0, y: 0 }, { id: "a", x: 10, y: 1 }, { id: "b", x: 50, y: 3 }, { id: "c", x: 10, y: 20 }, { id: "d", x: 52, y: 26 },
    { id: "m", x: 100, y: 0 }, { id: "n", x: 140, y: 5 }, { id: "q", x: 30, y: 60 },
  ],
  entities: [
    { id: "Oe", type: "point", p: "O", construction: true, origin: true },
    { id: "L1", type: "line", p1: "a", p2: "b" }, { id: "L2", type: "line", p1: "c", p2: "d" },
    { id: "K1", type: "circle", c: "m", r: 10 }, { id: "K2", type: "circle", c: "n", r: 12 },
    { id: "P", type: "point", p: "q" },
  ],
  constraints: [{ id: "Of", type: "fix", p: "O", x: 0, y: 0 }],
});
const types = (o) => o.map((x) => x.type);
const checker = (sk) => (c) => checkNewConstraint(sk, { ...c, id: "__t" }, {});

test("Auswahl einordnen: Punkt-Elemente zählen als Punkt", () => {
  const s = classifySelection(sketch(), ["e:L1", "e:P", "p:a", "e:K1"]);
  assert.deepEqual(s.lines, ["L1"]);
  assert.deepEqual(s.pts, ["q", "a"]);
  assert.deepEqual(s.circs, ["K1"]);
});

test("Eine Linie: horizontal, vertikal, fixieren", () => {
  assert.deepEqual(types(constraintOptions(sketch(), ["e:L1"])), ["horizontal", "vertical", "fix"]);
});

test("Zwei Linien: parallel, senkrecht, kollinear, gleich – und horizontal für beide", () => {
  const o = constraintOptions(sketch(), ["e:L1", "e:L2"]);
  assert.deepEqual(types(o), ["horizontal", "vertical", "parallel", "perpendicular", "collinear", "equal"]);
  assert.equal(o.find((x) => x.type === "horizontal").list.length, 2);
});

test("Drei Linien: Parallel als Kette an die erste, kein Senkrecht", () => {
  const sk = sketch();
  sk.points.push({ id: "e", x: 0, y: 80 }, { id: "f", x: 30, y: 90 });
  sk.entities.push({ id: "L3", type: "line", p1: "e", p2: "f" });
  const o = constraintOptions(sk, ["e:L1", "e:L2", "e:L3"]);
  assert.ok(!types(o).includes("perpendicular"));
  assert.deepEqual(o.find((x) => x.type === "parallel").list.map((c) => [c.e1, c.e2]), [["L1", "L2"], ["L1", "L3"]]);
});

test("Kreise, Linie+Kreis, Punkt+Linie, Punkt+Kreis, zwei Punkte+Linie", () => {
  const sk = sketch();
  assert.deepEqual(types(constraintOptions(sk, ["e:K1", "e:K2"])), ["concentric", "equal", "tangent"]);
  assert.deepEqual(types(constraintOptions(sk, ["e:L1", "e:K1"])), ["tangent"]);
  const pl = constraintOptions(sk, ["e:P", "e:L1"]);
  assert.deepEqual(types(pl), ["coincident", "midpoint"]);
  assert.equal(pl[0].list[0].type, "pointOnLine");
  const pc = constraintOptions(sk, ["e:P", "e:K1"]);
  assert.deepEqual(pc.map((o) => o.list[0].type), ["pointOnCircle", "coincident"]);
  assert.deepEqual(types(constraintOptions(sk, ["p:c", "p:d", "e:L1"])), ["symmetric"]);
  assert.deepEqual(types(constraintOptions(sk, ["p:a", "p:c"])), ["coincident", "horizontal", "vertical", "fix"]);
  assert.deepEqual(constraintOptions(sk, ["c:Of"]), []);
});

test("Mit Prüfung: Erfülltes und Widersprüchliches fällt weg", () => {
  const sk = sketch();
  sk.constraints.push({ id: "h1", type: "horizontal", e: "L1" });
  assert.ok(solveSketch(sk, {}).ok);
  const o = constraintOptions(sk, ["e:L1"], checker(sk));
  assert.deepEqual(types(o), ["fix"]);
  // L2 ist frei: Horizontal für beide setzt nur noch die eine fehlende
  const both = constraintOptions(sk, ["e:L1", "e:L2"], checker(sk));
  assert.deepEqual(both.find((x) => x.type === "horizontal").list, [{ type: "horizontal", e: "L2" }]);
  assert.deepEqual(both.find((x) => x.type === "vertical").list, [{ type: "vertical", e: "L2" }]);
});

test("Gesetzte Bedingung aus der Auswahl löst die Skizze", () => {
  const sk = sketch();
  const o = constraintOptions(sk, ["e:L1", "e:L2"], checker(sk)).find((x) => x.type === "parallel");
  sk.constraints.push(...o.list.map((c, i) => ({ ...c, id: "k" + i })));
  const r = solveSketch(sk, {});
  assert.ok(r.ok);
  const P = new Map(sk.points.map((p) => [p.id, p]));
  const dir = (a, b) => Math.atan2(P.get(b).y - P.get(a).y, P.get(b).x - P.get(a).x);
  assert.ok(Math.abs(Math.sin(dir("a", "b") - dir("c", "d"))) < 1e-6);
});

// ---- Baugruppe ----
const asm = () => ({
  components: [
    { id: "g", name: "Grund:1", pos: [0, 0, 0], rot: [0, 0, 0], fixed: true },
    { id: "t", name: "Teil:1", pos: [0, 0, 100], rot: [0, 0, 0] },
    { id: "u", name: "Teil:2", pos: [0, 0, 100], rot: [180, 0, 0] },
  ],
});
const face = (cid, n, z = 0) => ({ cid, kind: "plane", info: { type: "PLANE", normal: n, point: [0, 0, z] } });

test("Vorhersage Passend/Fluchtend aus der Lage", () => {
  const A = asm();
  // Oberseite Grund (+Z) gegen Unterseite Teil (−Z) → passend
  assert.equal(predictPlaneSolution(A, face("g", [0, 0, 1]), face("t", [0, 0, -1])), "passend");
  // beide Oberseiten zeigen nach oben → fluchtend
  assert.equal(predictPlaneSolution(A, face("g", [0, 0, 1]), face("t", [0, 0, 1])), "fluchtend");
  // Teil:2 ist umgedreht: seine lokale +Z zeigt nach unten → passend
  assert.equal(predictPlaneSolution(A, face("g", [0, 0, 1]), face("u", [0, 0, 1])), "passend");
  const st = placeState();
  assert.equal(st.solution, "auto");
  assert.equal(buildConstraint(A, st, [face("t", [0, 0, 1], 10), face("g", [0, 0, 1], 5)]).con.type, "buendig");
  assert.equal(buildConstraint(A, st, [face("t", [0, 0, -1]), face("g", [0, 0, 1], 5)]).con.type, "gegen");
  // fest gewählte Lösung gilt weiter
  assert.equal(buildConstraint(A, { ...st, solution: "passend" }, [face("t", [0, 0, 1], 10), face("g", [0, 0, 1], 5)]).con.type, "gegen");
  // alte Aufrufe mit mode bleiben eindeutig
  assert.equal(placeState({ mode: "gegen" }).solution, "passend");
  assert.equal(placeState({ mode: "buendig" }).solution, "fluchtend");
});

test("Umkehren mit einem Klick", () => {
  const A = asm();
  assert.deepEqual(flipOf(A, { type: "gegen", name: "Passend: a → b" }), { type: "buendig", name: "Bündig: a → b" });
  assert.equal(flipOf(A, { type: "buendig" }).type, "gegen");
  assert.equal(flipOf(A, { type: "einfuegen", solution: "entgegengesetzt" }).solution, "ausgerichtet");
  assert.equal(flipOf(A, { type: "tangential", a: { axis: true }, b: { axis: true } }).solution, "innen");
  assert.equal(flipOf(A, { type: "tangential", a: { n: [0, 0, 1] }, b: { axis: true } }), null);
  // unbestimmt: aus der heutigen Lage die Gegenrichtung (Teil:2 steht kopf → Achsen entgegengesetzt → ausgerichtet)
  const k = { type: "konzentrisch", solution: "unbestimmt", a: { comp: "g", axis: true, d: [0, 0, 1] }, b: { comp: "u", axis: true, d: [0, 0, 1] } };
  assert.equal(flipOf(A, k).solution, "ausgerichtet");
  assert.equal(flipOf(A, { ...k, b: { ...k.b, comp: "t" } }).solution, "entgegengesetzt");
  assert.equal(flipOf(A, { type: "winkel" }), null);
});

// ---- Ziehgriffe ----
import { featureHandles, dragResult, sketchCenter, isPlainNumber } from "../src/core/griffe.js";

const frame = { origin: [0, 0, 0], normal: [0, 0, 1] };
test("Griff an der Extrusion: Lage je Richtung", () => {
  const c = [10, 20, 0];
  assert.deepEqual(featureHandles({ type: "extrude", distance: "30" }, { frame, center: c })[0].p, [10, 20, 30]);
  const rev = featureHandles({ type: "extrude", mode: "reverse", distance: "30" }, { frame, center: c })[0];
  assert.deepEqual([rev.p, rev.d], [[10, 20, -30], [-0, -0, -1]]);
  assert.deepEqual(featureHandles({ type: "extrude", mode: "symmetric", distance: "30" }, { frame, center: c })[0].p, [10, 20, 15]);
  assert.equal(featureHandles({ type: "extrude", mode: "twoSided", distance: "30", distance2: "5" }, { frame, center: c }).length, 2);
  assert.deepEqual(featureHandles({ type: "extrude", mode: "through", distance: "30" }, { frame, center: c }), []);
  assert.deepEqual(featureHandles({ type: "extrude", distance: "Dicke*2" }, { frame, center: c }), []);
  assert.ok(isPlainNumber("12,5") && !isPlainNumber("a+1"));
});

test("Ziehen: länger, kürzer und über null hinaus auf die andere Seite", () => {
  const f = { type: "extrude", mode: "normal", distance: "30" };
  assert.deepEqual(dragResult(f, "a", 30, 12.4), { mode: "normal", distance: "42" });
  assert.deepEqual(dragResult(f, "a", 30, -12.46, 0.1), { mode: "normal", distance: "17.5" });
  assert.deepEqual(dragResult(f, "a", 30, -45), { mode: "reverse", distance: "15" });
  assert.deepEqual(dragResult({ ...f, mode: "reverse" }, "a", 30, -40), { mode: "normal", distance: "10" });
  assert.deepEqual(dragResult(f, "a", 30, -30), { mode: "normal", distance: "1" });
  assert.deepEqual(dragResult({ ...f, mode: "symmetric" }, "a", 30, 5), { distance: "40" });
  assert.deepEqual(dragResult({ type: "extrude", mode: "twoSided", distance: "30", distance2: "5" }, "b", 5, -50), { distance2: "-29" });
  assert.deepEqual(dragResult({ type: "hole", depth: "20" }, "a", 20, 5), { depth: "25" });
  assert.deepEqual(dragResult({ type: "profile", length: "1000" }, "a", 1000, -250), { length: "750" });
});

test("Bohrungstiefe und Profillänge haben Griffe, Skizzenmitte", () => {
  const h = featureHandles({ type: "hole", extent: "depth", depth: "12", direction: "reverse" }, { frame, center: [0, 0, 0] })[0];
  assert.deepEqual(h.p, [0, 0, -12]);
  assert.deepEqual(featureHandles({ type: "hole", extent: "through", depth: "12" }, { frame, center: [0, 0, 0] }), []);
  const p = featureHandles({ type: "profile", axis: "-Y", start: ["0", "100", "0"], length: "500" }, { ev: Number })[0];
  assert.deepEqual(p.p, [0, -400, 0]);
  const sk = { points: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }, { id: "c", x: 100, y: 40 }, { id: "z", x: 500, y: 500 }],
    entities: [{ id: "l1", type: "line", p1: "a", p2: "b" }, { id: "l2", type: "line", p1: "b", p2: "c" }, { id: "k", type: "line", p1: "c", p2: "z", construction: true }] };
  assert.deepEqual(sketchCenter(sk), [50, 20]);
  assert.equal(sketchCenter(sk, true), null);
});
