// Stahlbau-Lücken ST3–ST8: neue Generatoren im Geometrie-Kern bauen, Teile zählen, Kollisionen prüfen
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createKernel } from "../src/kernel/build.js";
import { defaultGenerator } from "../src/core/generator.js";

const require = createRequire(import.meta.url);
const R = await import("replicad");
const ocInit = (await import("replicad-opencascadejs")).default;
const OC = await ocInit({ locateFile: () => require.resolve("replicad-opencascadejs/wasm") });
R.setOC(OC);
const K = createKernel(R);

export async function buildGen(gen, params = {}) {
  const f = defaultGenerator(gen);
  const res = await K.buildPart({ id: "p" + Math.random(), kind: "part", name: gen, params: [], features: [{ id: "g", ...f, params: { ...f.params, ...params } }] });
  const st = res.status.g;
  assert.ok(st?.ok, JSON.stringify(st));
  return { res, st };
}
/** Überschneidungen zwischen Körpern (Volumen > tol mm³), Namen der Paare */
export function overlaps(res, filter = () => true, tol = 1) {
  const list = res.bodies.map((b, i) => ({ key: `${i}:${b.name}`, shape: b.shape })).filter((x, i) => filter(res.bodies[i]));
  return K.collisions(list, { tol }).map((c) => `${c.a} × ${c.b}`);
}
/** tatsächliche Ausdehnung in z (aus dem Netz; die Hüllbox von OpenCascade ist größer) */
const zRange = (shape) => { const v = shape.mesh({ tolerance: 0.01, angularTolerance: 0.1 }).vertices; let lo = Infinity, hi = -Infinity; for (let i = 2; i < v.length; i += 3) { lo = Math.min(lo, v[i]); hi = Math.max(hi, v[i]); } return [lo, hi]; };
const names = (res) => res.bodies.map((b) => b.name);
const count = (res, re) => res.bodies.filter((b) => re.test(b.name)).length;

test("Stützenfuß: Platte mit 4 Ankerlöchern, Steifen, Anker mit Unterlegplatte und Muttern, keine Überschneidungen", async () => {
  const { res, st } = await buildGen("stuetzenfuss");
  console.log("[info]", st.info, st.warning || "");
  assert.equal(count(res, /^Fußplatte$/), 1);
  assert.equal(count(res, /^Stütze$/), 1);
  assert.equal(count(res, /^Steife/), 2);
  assert.equal(count(res, /^Anker \d$/), 4);
  assert.equal(count(res, /^Unterlegplatte/), 4);
  assert.equal(res.bodies.filter((b) => b.meta?.norm?.kind === "mutter").length, 8, "Mutter oben + Justiermutter");
  const plate = res.bodies.find((b) => b.name === "Fußplatte");
  assert.equal(plate.meta.plate.holes, 4);
  near(R.measureVolume(plate.shape), 360 * 320 * 25 - 4 * Math.PI * 13 * 13 * 25, 5, "Volumen Fußplatte mit Löchern Ø 26");
  const bad = overlaps(res, (b) => !b.meta?.norm || b.meta.norm.kind === "gewindestange");
  assert.deepEqual(bad, [], "Anker gehen durch die Löcher, Steifen sitzen außen an der Stütze");
  // Rechteckrohr: 4 Steifen, 8 Anker, Schubknagge unter der Platte
  const r2 = await buildGen("stuetzenfuss", { column: { kind: "rechteck", size: "200x100x8" }, anchors: "8", key: true, overX: "100", overY: "100" });
  assert.equal(count(r2.res, /^Steife/), 4);
  assert.equal(count(r2.res, /^Anker \d$/), 8);
  assert.equal(count(r2.res, /^Schubknagge$/), 1);
  assert.match(r2.st.warning || "", /Steife/, "mittlere Anker liegen an den Steifen");
});
const near = (a, b, tol, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b} (±${tol})`);

test("Trägerstoß: Flansch- und Steglaschen, Schrauben durch Laschen und Träger ohne Überschneidung", async () => {
  const { res, st } = await buildGen("traegerstoss");
  console.log("[info]", st.info, st.warning || "");
  assert.equal(count(res, /^Träger (links|rechts)$/), 2);
  assert.equal(count(res, /^Flanschlasche/), 2);
  assert.equal(count(res, /^Steglasche/), 2);
  const bolts = res.bodies.filter((b) => b.meta?.norm?.kind?.startsWith("schraube"));
  assert.equal(bolts.length, 2 * 2 * 2 * 2 + 2 * 1 * 2, "16 Flansch + 4 Steg");
  const left = res.bodies.find((b) => b.name === "Träger links");
  assert.equal(left.meta.drills, 8 + 2, "Bohrungen im linken Träger: 8 Flansch + 2 Steg");
  const bad = overlaps(res, (b) => !b.meta?.norm || b.meta.norm.kind.startsWith("schraube"));
  assert.deepEqual(bad, []);
  const r2 = await buildGen("traegerstoss", { beam: { kind: "upn", size: "200" }, inner: true, webRows: "3" });
  assert.deepEqual(overlaps(r2.res, (b) => !b.meta?.norm || b.meta.norm.kind.startsWith("schraube")), [], "UPN mit Innenlasche");
  const r3 = await buildGen("traegerstoss", { inner: true });
  assert.equal(count(r3.res, /^Innenlasche/), 4);
  assert.deepEqual(overlaps(r3.res, (b) => !b.meta?.norm || b.meta.norm.kind.startsWith("schraube")), [], "HEB mit Innenlaschen");
});

test("Trägeranschluss: Fahnenblech, Doppelwinkel und Stirnplatte an Hauptträger und Stütze ohne Überschneidung", async () => {
  const bolts = (res) => res.bodies.filter((b) => b.meta?.norm?.kind?.startsWith("schraube")).length;
  const only = (b) => !b.meta?.norm || b.meta.norm.kind.startsWith("schraube");
  for (const support of ["traeger", "stuetze"]) {
    for (const type of ["fahnenblech", "winkel", "stirnplatte"]) {
      const { res, st } = await buildGen("traegeranschluss", { support, type });
      console.log("[info]", support, type, st.info, st.warning || "");
      const bad = overlaps(res, only);
      assert.deepEqual(bad, [], `${support}/${type}`);
      assert.equal(bolts(res), type === "fahnenblech" ? 2 : type === "winkel" ? 6 : 4, `${support}/${type} Schrauben`);
      if (support === "traeger") assert.ok(res.bodies.find((b) => b.name === "Nebenträger").meta.coped, "ausgeklinkt");
    }
  }
  // tiefer Nebenträger an flacherem Hauptträger: unten auch ausgeklinkt, keine Überschneidung
  const deep = await buildGen("traegeranschluss", { main: { kind: "ipe", size: "240" }, beam: { kind: "ipe", size: "240" }, rows: "2" });
  assert.deepEqual(overlaps(deep.res, only), []);
});

test("Steigleiter: Sprossen gleichmäßig bis zum Austritt, Rückenschutz ab 3 m, Teile ohne Überschneidung", async () => {
  const { res, st } = await buildGen("steigleiter");
  console.log("[info]", st.info, st.warning || "");
  assert.equal(count(res, /^Holm/), 2);
  assert.equal(count(res, /^Sprosse/), 18, "5000 / 280 → 18 Sprossen à 277,8");
  assert.ok(count(res, /^Rückenschutzbügel/) >= 3);
  assert.equal(count(res, /^Längsstab/), 5);
  assert.ok(!st.warning, st.warning);
  assert.equal(res.bodies.find((b) => b.name === "Holm links").meta.drills, 18);
  assert.deepEqual(overlaps(res), []);
  const low = await buildGen("steigleiter", { height: "2500" });
  assert.equal(count(low.res, /^Rückenschutzbügel/), 0, "unter 3 m ohne Rückenschutz");
  const bad = await buildGen("steigleiter", { height: "4000", cage: "nein", width: "700" });
  assert.match(bad.st.warning, /Rückenschutz/); assert.match(bad.st.warning, /Lichte Weite/);
});

test("Fachwerkträger: Parallel, Pult und Sattel mit N/V/W-Füllung, Füllstäbe an den Gurten geschnitten, Spaltknoten ohne Überschneidung", async () => {
  for (const [shape, fill] of [["parallel", "N"], ["pult", "V"], ["sattel", "W"], ["sattel", "N"]]) {
    const { res, st } = await buildGen("fachwerk", { shape, fill });
    console.log("[info]", shape, fill, st.info, st.warning || "");
    const nd = count(res, /^Diagonale/), np = count(res, /^Pfosten/);
    assert.equal(nd, 8, `${shape}/${fill} Diagonalen`);
    assert.equal(np, fill === "W" ? 2 : 9, `${shape}/${fill} Pfosten`);
    assert.deepEqual(overlaps(res), [], `${shape}/${fill}`);
    // Füllstäbe berühren die Gurte (an der Gurtfläche geschnitten): Abstand 0
    const bot = res.bodies.find((b) => b.name === "Untergurt");
    for (const b of res.bodies.filter((x) => /^(Diagonale|Pfosten)/.test(x.name))) {
      near(zRange(b.shape)[0], zRange(bot.shape)[1], 0.05, `${b.name} steht auf dem Untergurt`);
    }
  }
});
