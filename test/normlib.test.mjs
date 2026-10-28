// Normteil-Bibliothek (wie Inventor Inhaltscenter): Familien, Maße, Bezeichnung, Suche, Bohrung, Garnitur, eigene Teile
import test from "node:test";
import assert from "node:assert/strict";
import { NORM_FAMILIES, NORM_CATEGORIES, TEMPLATES, METRIC, lengthsFor, normRecipe, recipeVolume, recipeOutline, familyDesignation, searchFamilies, sizeForHole, garniturAt, validateFamily, customFamily, familyOf, familyMass, gradeInfo, matchingGrade } from "../src/core/normlib.js";
import { normDesignation, checkNorm, defaultNormteil, collectNorm, NORM_KINDS } from "../src/core/normteile.js";
import { holeFrame, holeParts, holeToWorld, partPlacement, placeAlong, normInsertInfo } from "../src/core/normeinbau.js";
import { insertRef, solveAssembly } from "../src/core/asmsolve.js";
import { placementMatrix, matApply, matApplyDir } from "../src/core/geom.js";

const near = (a, b, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b}`);
const nearV = (a, b, tol = 1e-6, msg = "") => a.forEach((x, i) => near(x, b[i], tol, msg));

test("Bibliothek: alle Kategorien belegt, jede Familie vollständig und baubar", () => {
  const fams = Object.values(NORM_FAMILIES);
  assert.ok(fams.length >= 35, "mindestens 35 Familien");
  for (const [k] of NORM_CATEGORIES) assert.ok(fams.some((f) => f.cat === k), "Kategorie " + k);
  for (const f of fams) {
    assert.ok(TEMPLATES[f.template], f.id + " Vorlage");
    assert.ok(f.grades.length && f.label && f.norm && f.noun, f.id);
    assert.ok(f.sizeList.length >= 5, f.id + " Größen");
    for (const s of f.sizeList) {
      for (const k of TEMPLATES[f.template].fields) assert.ok(f.sizes[s][k] > 0, `${f.id} ${s} ${k}`);
      const ls = lengthsFor(f, s);
      if (f.length) assert.ok(ls.length > 0 && ls.every((l, i) => !i || l > ls[i - 1]), `${f.id} ${s} Längen`);
      for (const L of f.length ? [ls[0], ls.at(-1)] : [0]) {
        const r = normRecipe(f, s, L);
        assert.ok(recipeVolume(r) > 0, `${f.id} ${s} ${L} Volumen`);
        assert.equal(recipeOutline(r).length, r.length);
      }
    }
    const d = defaultNormteil(f.id);
    assert.ok(normDesignation(d).includes(f.norm), f.id + " Bezeichnung");
    assert.deepEqual(checkNorm(f.id, d.size, f.length ? Number(d.length) : 0).filter((w) => !/Vorzugslänge/.test(w)), [], f.id + " Vorgabe gültig");
  }
  assert.equal(NORM_KINDS, NORM_FAMILIES);
});

test("Maße: Schrauben, Muttern, Scheiben folgen den Normtabellen", () => {
  for (const [k, t] of Object.entries(METRIC)) assert.ok(t.s > t.d && t.m < t.d && t.m2 < t.m && t.core < t.d && t.k < t.d, k);
  const sk = NORM_FAMILIES.iso4762.sizes;
  assert.equal(sk.M8.dk, 13); assert.equal(sk.M8.k, 8); assert.equal(sk.M8.sw, 6);
  assert.equal(NORM_FAMILIES.scheibe7093.sizes.M10.d2, 30, "ISO 7093 große Reihe");
  assert.equal(NORM_FAMILIES.hv14399.sizes.M20.s, 32, "HV-Schraube SW 32");
  assert.equal(NORM_FAMILIES.hvmutter.sizes.M20.m, 16);
  assert.equal(NORM_FAMILIES.hvscheibe.sizes.M20.d2, 37);
  // ISO 4017 M12 x 40: Kopf Sechseck × k + Kerndurchmesser über 40 mm (wie bisher im Kern)
  const t = METRIC.M12;
  near(recipeVolume(normRecipe(NORM_FAMILIES.schraube4017, "M12", 40)), (Math.sqrt(3) / 2) * t.s * t.s * t.k + (Math.PI / 4) * t.core * t.core * 40, 1e-6);
  // Masse: Mutter M12 ≈ 12 g, Alu-Blindniet leichter als Stahl
  near(familyMass(NORM_FAMILIES.mutter, "M12", 0, "8"), 0.0124, 0.002, "Mutter M12");
  assert.ok(familyMass(NORM_FAMILIES.blindniet, "4", 10, "Al/Al") < familyMass(NORM_FAMILIES.blindniet, "4", 10, "St/St") / 2);
  assert.equal(gradeInfo("PA 6").density, 1.14);
  assert.equal(gradeInfo("A4-70").label, "nichtrostend A4-70");
});

test("Bezeichnung: Stifte mit Toleranz, HV-Garnitur, Scheiben mit Nenn-Ø, Dübel mit Ø", () => {
  assert.equal(normDesignation({ kind: "iso2338", size: "6", length: 30, grade: "St" }), "Zylinderstift ISO 2338 - 6 m6 x 30 - St");
  assert.equal(normDesignation({ kind: "hv14399", size: "M20", length: 80, grade: "10.9", galv: true }), "Sechskantschraube EN 14399-4 - M20 x 80 - 10.9 - HV - tZn");
  assert.equal(normDesignation({ kind: "scheibe7093", size: "M10", grade: "200 HV" }), "Scheibe ISO 7093-1 - 10 - 200 HV");
  assert.equal(normDesignation({ kind: "spreizduebel", size: "8", length: 40, grade: "PA 6", galv: true }), "Spreizdübel ETA - Ø8 x 40 - PA 6", "Kunststoff nie verzinkt");
  assert.equal(normDesignation({ kind: "blindniet", size: "4,8", length: 12, grade: "Al/St" }), "Blindniet ISO 15977 - 4,8 x 12 - Al/St");
  assert.equal(familyDesignation(NORM_FAMILIES.iso4762, { size: "M8", length: 25, grade: "A2-70", galv: true }), "Zylinderschraube ISO 4762 - M8 x 25 - A2-70");
  assert.match(checkNorm("iso4762", "M8", 33)[0], /Vorzugslänge/);
  assert.match(checkNorm("iso4762", "M8", 400)[0], /außerhalb/);
  assert.throws(() => checkNorm("iso10642", "M36", 40), /M36 gibt es für ISO 10642 nicht/);
});

test("Suche: Norm, alte DIN-Nummer (auch ohne Leerzeichen), Benennung und Größe", () => {
  const ids = (q) => searchFamilies(q).map((f) => f.id);
  assert.deepEqual(ids("DIN 933"), ["schraube4017"]);
  assert.deepEqual(ids("din912"), ["iso4762"]);
  assert.ok(ids("Senkschraube").includes("iso10642"));
  assert.ok(ids("niet").includes("blindniet") && ids("niet").includes("din124"));
  assert.ok(ids("mutter M36").every((id) => NORM_FAMILIES[id].sizes.M36));
  assert.ok(ids("scheiben").length >= 8, "Kategorie als Suchwort");
  assert.equal(ids("").length, Object.keys(NORM_FAMILIES).length);
});

test("Bohrung: Größe aus Durchgangs-, Gewinde- und Bohrloch-Ø", () => {
  const F = NORM_FAMILIES;
  assert.deepEqual(sizeForHole(F.schraube4017, 13.5), { size: "M12", threaded: false });
  assert.deepEqual(sizeForHole(F.schraube4017, 10.2), { size: "M12", threaded: true }, "Kernloch M12");
  assert.deepEqual(sizeForHole(F.schraube4017, 22), { size: "M20", threaded: false });
  assert.deepEqual(sizeForHole(F.bolzenanker, 12), { size: "M12", threaded: false });
  assert.deepEqual(sizeForHole(F.blindniet, 4.9), { size: "4,8", threaded: false });
  assert.deepEqual(sizeForHole(F.iso2338, 8), { size: "8", threaded: false });
  assert.equal(sizeForHole(F.iso2338, 9), null);
  assert.equal(sizeForHole(F.schraube4017, 3), null);
});

test("Garnitur: Länge aus Klemmlänge, Scheiben und Mutter passend zur Festigkeit", () => {
  const g = garniturAt(NORM_FAMILIES.schraube4017, "M12", 20, "8.8");
  assert.equal(g.length, 40); near(g.need, 20 + 2.5 + 2.5 + 10.8 + 3.5, 1e-9);
  assert.deepEqual(g.parts.map((p) => [p.kind, p.grade, p.at, p.flip]), [["scheibe", "200 HV", 0, true], ["schraube4017", "8.8", -2.5, false], ["scheibe", "200 HV", 20, false], ["mutter", "8", 22.5, false]]);
  const hv = garniturAt(NORM_FAMILIES.hv14399, "M20", 30, "10.9");
  assert.deepEqual(hv.parts.map((p) => p.kind), ["hvscheibe", "hv14399", "hvscheibe", "hvmutter"]);
  assert.equal(hv.length, 60);
  const senk = garniturAt(NORM_FAMILIES.iso10642, "M8", 10, "8.8");
  assert.deepEqual(senk.parts.map((p) => [p.kind, p.at]), [["iso10642", 0], ["scheibe", 10], ["mutter", 11.6]], "Senkschraube ohne Kopfscheibe, Länge über alles");
  assert.equal(matchingGrade("A4-70", "washer"), "A4");
  assert.equal(matchingGrade("10.9", "washer"), "300 HV");
});

// Platte 100 × 100 × 10 (z 0 … 10) mit Bohrung Ø 13,5 bei (30, 40)
const PLATE = [
  { type: "PLANE", normal: [0, 0, 1], point: [0, 0, 10] },
  { type: "PLANE", normal: [0, 0, -1], point: [0, 0, 0] },
  { type: "PLANE", normal: [1, 0, 0], point: [100, 0, 5] },
  { type: "CYLINDER", axisP: [30, 40, 0], axisD: [0, 0, 1], radius: 6.75 },
];
const HOLE = { type: "CYLINDER", axisP: [30, 40, 0], axisD: [0, 0, 1], radius: 6.75 };
const END = { type: "PLANE", normal: [0, 0, 1], point: [5, 5, 10] };

test("An Bohrung: Einbauachse, Tiefe, Lage der Garnitur", () => {
  const hf = holeFrame(HOLE, END, PLATE);
  nearV(hf.P, [30, 40, 10]); nearV(hf.a, [0, 0, -1]); assert.equal(hf.depth, 10); near(hf.dia, 13.5);
  const plan = holeParts({ kind: "schraube4017", size: "M8", length: "20", grade: "8.8", garnitur: true, auto: true }, hf);
  assert.equal(plan.size, "M12"); assert.equal(plan.clamp, 10); assert.equal(plan.length, 30);
  const comp = { pos: [0, 0, 0], rot: [0, 0, 0] };
  const hw = holeToWorld(comp, hf);
  const bolt = plan.parts.find((p) => p.kind === "schraube4017"), nut = plan.parts.find((p) => p.kind === "mutter");
  const Mb = placementMatrix(...Object.values(partPlacement(hw, bolt)));
  nearV(matApply(Mb, [0, 0, 0]), [30, 40, 12.5], 1e-6, "Kopfunterseite auf der Scheibe");
  nearV(matApplyDir(Mb, [0, 0, 1]), [0, 0, -1], 1e-6, "Schaft nach unten");
  const Mn = placementMatrix(...Object.values(partPlacement(hw, nut)));
  nearV(matApply(Mn, [0, 0, 0]), [30, 40, -2.5], 1e-6, "Mutter unter der Scheibe");
  // Gewindebohrung M12 (Ø 10,2): nur Kopfscheibe und Schraube, Länge für 1,5 · d
  const thr = holeParts({ kind: "schraube4017", size: "M12", length: "40", grade: "8.8", garnitur: true, auto: true }, { ...hf, dia: 10.2 });
  assert.ok(thr.threaded); assert.deepEqual(thr.parts.map((p) => p.kind), ["scheibe", "schraube4017"]); assert.equal(thr.length, 25);
  // Dübel ohne Garnitur: ein Teil, Ursprung in der Oberfläche
  const pin = holeParts({ kind: "iso2338", size: "6", length: "30", grade: "St", auto: false }, { ...hf, dia: 6 });
  assert.deepEqual(pin.parts.map((p) => [p.kind, p.at, p.flip]), [["iso2338", 0, false]]);
  assert.throws(() => holeParts({ kind: "iso2338", size: "6", length: "30", grade: "St", auto: true }, { ...hf, dia: 30 }), /keine passende Größe/);
  // placeAlong: beliebige Richtung
  const M = placementMatrix(...Object.values(placeAlong([1, 2, 3], [1, 0, 0])));
  nearV(matApplyDir(M, [0, 0, 1]), [1, 0, 0]); nearV(matApply(M, [0, 0, 0]), [1, 2, 3]);
});

test("An Bohrung: Abhängigkeiten »Einfügen« passen zur berechneten Lage (Löser bewegt nichts)", () => {
  const hf = holeFrame(HOLE, END, PLATE);
  const plan = holeParts({ kind: "schraube4017", size: "M12", length: "30", grade: "8.8", garnitur: true, auto: true }, hf);
  const plate = { id: "pl", part: "plate", pos: [0, 0, 0], rot: [0, 0, 0], fixed: true };
  const asm = { components: [plate], constraints: [] };
  const facesOf = {};
  const hw = holeToWorld(plate, hf);
  const comps = plan.parts.map((p, i) => {
    const fam = NORM_FAMILIES[p.kind], t = fam.sizes[p.size];
    const c = { id: "c" + i, part: "n" + i, ...partPlacement(hw, p) };
    // Flächen des Normteils im Teil-System (wie sie der Kern liefert)
    facesOf[c.part] = fam.template === "scheibe" ? [{ type: "PLANE", normal: [0, 0, -1], point: [0, 0, 0] }, { type: "PLANE", normal: [0, 0, 1], point: [0, 0, t.h] }, { type: "CYLINDER", axisP: [0, 0, 0], axisD: [0, 0, 1], radius: t.d1 / 2 }]
      : fam.template === "mutter" ? [{ type: "PLANE", normal: [0, 0, -1], point: [0, 0, 0] }, { type: "PLANE", normal: [0, 0, 1], point: [0, 0, t.m] }, { type: "CYLINDER", axisP: [0, 0, 0], axisD: [0, 0, 1], radius: t.d / 2 }]
      : [{ type: "PLANE", normal: [0, 0, 1], point: [5, 0, 0] }, { type: "PLANE", normal: [0, 0, -1], point: [0, 0, -t.k] }, { type: "CYLINDER", axisP: [0, 0, 0], axisD: [0, 0, 1], radius: t.core / 2 }];
    asm.components.push(c);
    return { c, p, fam };
  });
  facesOf.plate = PLATE;
  const holeRef = insertRef("pl", HOLE, END), bottom = insertRef("pl", HOLE, { normal: hf.a, point: [0, 0, 0] });
  const ref = (x, o) => { const i = normInsertInfo(x.fam, x.p.size, o); return { ref: insertRef(x.c.id, i.axis, i.plane), sol: i.solution }; };
  const [wh, b, wn, nut] = comps;
  const add = (target, x) => { const r = ref(x); asm.constraints.push({ id: "k" + asm.constraints.length, type: "einfuegen", a: target, b: r.ref, solution: r.sol, gap: "0" }); };
  add(holeRef, wh); add(ref(wh, { top: true }).ref, b); add(bottom, wn); add(ref(wn, { top: true }).ref, nut);
  const before = JSON.stringify(asm.components);
  const res = solveAssembly(asm, (pid) => facesOf[pid]);
  assert.deepEqual(res.errors, {});
  const after = asm.components;
  JSON.parse(before).forEach((c, i) => { nearV(after[i].pos, c.pos, 1e-6, c.id + " Lage"); });
  // verschoben → Löser holt die Mutter zurück an die Unterseite
  nut.c.pos = [0, 0, -50];
  solveAssembly(asm, (pid) => facesOf[pid]);
  nearV(nut.c.pos, JSON.parse(before)[4].pos, 1e-6, "Mutter zurück");
});

test("Eigene Normteile: Prüfung, Familie, Bezeichnung und Feature-Vorgabe", () => {
  const x = { id: "werk-bolzen", label: "Werkbolzen", norm: "WN 4711", noun: "Bolzen", cat: "stifte", template: "bolzen", sizes: { 10: { d: 10, dk: 16, k: 3 }, 12: { d: 12, dk: 18, k: 4 } }, lengths: [40, 30, 50], grades: ["S355"] };
  assert.deepEqual(validateFamily(x), { ok: true, errors: [] });
  assert.match(validateFamily({ ...x, id: "iso4762" }).errors.join(), /gibt es schon/);
  assert.match(validateFamily({ ...x, template: "rakete" }).errors.join(), /template/);
  assert.match(validateFamily({ ...x, sizes: { 10: { d: 10, dk: 16 } } }).errors.join(), /Maß k/);
  assert.match(validateFamily({ ...x, lengths: [] }).errors.join(), /Längen/);
  const f = customFamily(x);
  assert.equal(f.id, "custom:werk-bolzen"); assert.deepEqual(lengthsFor(f, "10"), [30, 40, 50]);
  assert.equal(familyOf("custom:werk-bolzen", x).norm, "WN 4711");
  assert.equal(familyOf("custom:werk-bolzen"), null, "ohne Daten im Feature unbekannt");
  const d = defaultNormteil("custom:werk-bolzen", x);
  assert.equal(normDesignation(d), "Bolzen WN 4711 - 10 x 30 - S355");
  assert.deepEqual(checkNorm(d.kind, d.size, 30, x), []);
  assert.ok(recipeVolume(normRecipe(f, "12", 40)) > 0);
});

test("Stückliste: Normteile mit Norm und Werkstoff", () => {
  const rows = collectNorm([{ bodies: [{ meta: { norm: { kind: "iso4762", designation: "Z", grade: "A2-70", material: "nichtrostend A2-70" }, density: 7.9 }, props: { volume: 1000 } }], qty: 4 }]);
  assert.deepEqual(rows.map((r) => [r.name, r.qty, r.norm, r.material]), [["Z", 4, "ISO 4762", "nichtrostend A2-70"]]);
});
