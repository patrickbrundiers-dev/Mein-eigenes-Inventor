// DSTV-NC (Stahlbau-Lücken ST1): Bohrungen und Plattenkonturen aus echten Körpern (replicad + OpenCascade)
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createKernel } from "../src/kernel/build.js";
import { memberHoles, plateNc } from "../src/kernel/dstvocc.js";
import { piecesOf, dstvText, parseDstv, groupPieces, withSignature } from "../src/core/dstv.js";
import { catalogToDims } from "../src/core/sections.js";

const require = createRequire(import.meta.url);
const R = await import("replicad");
const ocInit = (await import("replicad-opencascadejs")).default;
const OC = await ocInit({ locateFile: () => require.resolve("replicad-opencascadejs/wasm") });
R.setOC(OC);
const K = createKernel(R);

const near = (a, b, tol, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b} (±${tol})`);
const part = (features) => ({ id: "p" + Math.random(), kind: "part", name: "Test", params: [], features });
const okAll = (res) => assert.equal(Object.values(res.status).filter((s) => !s.ok).length, 0, JSON.stringify(res.status));

test("DSTV: Rechteckrohr mit Bohrungen oben/unten und Langloch vorne – Fläche, Lage, Durchmesser", async () => {
  const res = await K.buildPart(part([{ id: "pr", type: "profile", section: "rechteck", dims: { B: "60", H: "40", t: "3", r: "6" }, length: "1000", start: ["0", "0", "0"], axis: "X",
    cuts: [{ kind: "bohrung", x: "100", side: "oben", q: "0", pattern: "1", d: "10" }, { kind: "bohrung", x: "200", side: "unten", q: "0", pattern: "3x100", d: "14" }, { kind: "langloch", x: "800", side: "vorne", q: "0", pattern: "1", l: "40", b: "12" }] }]));
  okAll(res);
  const b = res.bodies[0];
  const { holes, skipped } = memberHoles(K, b.shape, b.meta.axis);
  console.log("[info]", JSON.stringify(holes), skipped, b.meta.axis.width, b.meta.axis.height);
  assert.equal(skipped, 0);
  assert.equal(holes.length, 5);
  const d10 = holes.filter((h) => h.d === 10), d14 = holes.filter((h) => h.d === 14), slot = holes.filter((h) => h.slot);
  assert.equal(d10.length, 1); assert.equal(d14.length, 3); assert.equal(slot.length, 1);
  near(d10[0].x, 100, 0.01, "x Bohrung");
  assert.deepEqual(d14.map((h) => Math.round(h.x)).sort((a, c) => a - c), [200, 300, 400]);
  near(slot[0].x, 800, 0.01, "x Langloch"); near(slot[0].d, 12, 0.01); near(slot[0].slot.l, 28, 0.01, "Langloch-Verlängerung");
  // oben und unten liegen auf verschiedenen Flächen, vorne auf v oder h; y jeweils Flächenmitte
  assert.notEqual(d10[0].face, d14[0].face);
  assert.ok(["o", "u"].includes(d10[0].face) && ["o", "u"].includes(d14[0].face));
  assert.ok(["v", "h"].includes(slot[0].face));
  const W = b.meta.axis.width, H = b.meta.axis.height;
  near(d10[0].y, (d10[0].face === "o" || d10[0].face === "u") ? W / 2 : H / 2, 0.01, "y mittig");
});

test("DSTV: IPE 200 mit Stirnplatte – Stab ohne Bohrungen, Platte mit Kontur und 4 Bohrungen, Text lesbar", async () => {
  const dims = catalogToDims("ipe", "200");
  const prof = { id: "p1", type: "profile", section: "ipe", dims, length: "1000", start: ["0", "0", "0"], axis: "X", rotation: "0", miterStart: "0", miterEnd: "0" };
  const pl = { id: "pl", type: "platte", target: "p1", member: 0, end: "B", thickness: "15", overhang: "40", width: "0", height: "0", radius: "0", holes: "4", holeDia: "18", edge: "30" };
  const res = await K.buildPart(part([prof, pl]));
  okAll(res);
  const mem = res.bodies.find((b) => b.kind === "member"), plate = res.bodies.find((b) => b.meta?.plate);
  const mh = memberHoles(K, mem.shape, mem.meta.axis);
  assert.equal(mh.holes.length, 0);
  const pn = plateNc(R, plate.shape);
  console.log("[info]", JSON.stringify({ t: pn.t, L: pn.length, W: pn.width, holes: pn.holes, ak: pn.ak }));
  near(pn.t, 15, 0.01, "Dicke");
  assert.equal(pn.holes.length, 4);
  assert.ok(pn.holes.every((h) => Math.abs(h.d - 18) < 0.01));
  assert.ok(pn.ak.length >= 4);
  // alle Bohrungen innerhalb der Kontur, 30 mm vom Rand
  for (const h of pn.holes) { assert.ok(h.x > 0 && h.x < pn.length && h.y > 0 && h.y < pn.width); }
  const xs = pn.holes.map((h) => Math.min(h.x, pn.length - h.x)), ys = pn.holes.map((h) => Math.min(h.y, pn.width - h.y));
  for (const v of [...xs, ...ys]) near(v, 30, 0.01, "Randabstand");
  // komplette Kette: Kernel-Daten → Stücke → Text → Leser
  const data = res.bodies.map((b, index) => {
    if (b.kind === "member") return { index, name: b.name, kind: "member", sec: b.meta.sec, section: b.meta.section, area: b.meta.area, length: b.meta.length, perimeter: b.meta.axis.perimeter, miterStart: 0, miterEnd: 0, ...memberHoles(K, b.shape, b.meta.axis) };
    return { index, name: b.name, kind: "plate", ...plateNc(R, b.shape) };
  });
  const { pieces } = piecesOf({ part: { name: "Träger", number: "T-1" }, qty: 2, data }, { key: "S235", label: "Stahl S235JR", density: 7.85 }, { order: "A-100" });
  const grouped = groupPieces(pieces).map(withSignature);
  assert.equal(grouped.length, 2);
  const ipe = parseDstv(dstvText(grouped[0])), bl = parseDstv(dstvText(grouped[1]));
  assert.equal(ipe.head[6], "IPE200"); assert.equal(ipe.head[7], "I"); assert.equal(ipe.head[4], "S235JR"); assert.equal(ipe.head[5], "2");
  near(Number(ipe.head[8]), 1000, 0.01); near(Number(ipe.head[14]), 22.4, 0.3, "kg/m IPE 200");
  assert.equal(bl.head[7], "B"); assert.equal(bl.head[6], "BL15");
  assert.equal(bl.blocks.BO[0].length, 4);
  const ak = bl.blocks.AK[0];
  assert.deepEqual(ak[0].slice(1, 3), ak[ak.length - 1].slice(1, 3), "Kontur geschlossen");
});

test("DSTV: Platte mit Eckradien – Bögen mit Radius, Außenkontur gegen den Uhrzeiger", async () => {
  const dims = catalogToDims("ipe", "200");
  const prof = { id: "p1", type: "profile", section: "ipe", dims, length: "1000", start: ["0", "0", "0"], axis: "X" };
  const pl = { id: "pl", type: "platte", target: "p1", member: 0, end: "A", thickness: "10", overhang: "20", width: "0", height: "0", radius: "15", holes: "0" };
  const res = await K.buildPart(part([prof, pl]));
  okAll(res);
  const pn = plateNc(R, res.bodies.find((b) => b.meta?.plate).shape);
  const arcs = pn.ak.filter((p) => p[2]);
  assert.equal(arcs.length, 4, JSON.stringify(pn.ak));
  assert.ok(arcs.every((p) => Math.abs(Math.abs(p[2]) - 15) < 0.01));
  let area = 0;
  for (let i = 0; i < pn.ak.length; i++) { const a = pn.ak[i], b = pn.ak[(i + 1) % pn.ak.length]; area += a[0] * b[1] - b[0] * a[1]; }
  assert.ok(area > 0, "gegen den Uhrzeiger");
  assert.ok(arcs.every((p) => p[2] > 0), "konvexe Ecken: Bogen gegen den Uhrzeiger = positiver Radius");
  near(Math.min(...pn.ak.map((p) => p[0])), 0, 1e-6); near(Math.min(...pn.ak.map((p) => p[1])), 0, 1e-6);
});
