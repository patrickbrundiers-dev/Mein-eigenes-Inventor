// MegaCAD-Abgleich (docs/roadmap/megacad-metall-abgleich.md): reine Rechnung ohne Geometrie-Kern
import test from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../src/core/expr.js";
import { resolvePathPoints, pathSegments, pathLength, upFor, cornerAngle, defaultProfilzug, nextPointDefault, UP_AXES } from "../src/core/profilzug.js";

const E = (x) => evaluate(String(x), {});

test("Profilzug: absolute und relative Punkte, offen und geschlossen", () => {
  const pts = resolvePathPoints([{ x: "0", y: "0", z: "0" }, { x: "1000", y: "0", z: "0", rel: true }, { x: "0", y: "600", z: "300", rel: true }, { x: "0", y: "600", z: "300" }], E);
  assert.deepEqual(pts, [[0, 0, 0], [1000, 0, 0], [1000, 600, 300], [0, 600, 300]]);
  assert.equal(pathSegments(pts, false).length, 3);
  const closed = pathSegments(pts, true);
  assert.equal(closed.length, 4);
  assert.deepEqual(closed[3].b, [0, 0, 0]);
  const diag = Math.hypot(600, 300);
  assert.ok(Math.abs(pathLength(pts, false) - (2000 + diag)) < 1e-9);
  assert.ok(Math.abs(pathLength(pts, true) - (2000 + 2 * diag)) < 1e-9);
});

test("Profilzug: Fehler bei zu wenigen oder doppelten Punkten", () => {
  assert.throws(() => resolvePathPoints([{ x: "0", y: "0", z: "0" }], E), /mindestens 2/);
  assert.throws(() => resolvePathPoints([{ x: "0", y: "0", z: "0" }, { x: "0", y: "0", z: "0", rel: true }], E), /liegt auf Punkt 1/);
  assert.throws(() => pathSegments([[0, 0, 0], [1, 0, 0]], true), /mindestens 3/);
  assert.throws(() => pathSegments([[0, 0, 0], [1, 0, 0], [0, 0, 0]], true), /»Geschlossen« genügt/);
});

test("Profilzug: Richtung oben mit Ersatzachse, Eckwinkel, Vorgabe", () => {
  assert.deepEqual(upFor([1, 0, 0]), UP_AXES.Z);
  assert.deepEqual(upFor([0, 0, 5]), UP_AXES.Y);
  assert.deepEqual(upFor([0, 1, 0], UP_AXES.Y), UP_AXES.Z);
  assert.ok(Math.abs(cornerAngle([0, 0, 0], [1, 0, 0], [1, 1, 0]) - 90) < 1e-9);
  const d = defaultProfilzug({ B: "40", t: "3" });
  assert.equal(d.type, "profilzug");
  assert.equal(resolvePathPoints(d.points, E).length, 4);
});

test("Profilzug: Umkehr am Punkt wird gemeldet, neuer Punkt quer zum letzten Segment", () => {
  assert.throws(() => pathSegments([[0, 0, 0], [1000, 0, 0], [500, 0, 0]], false), /kehrt an Punkt 2 um/);
  assert.deepEqual(nextPointDefault([[0, 0, 0], [1000, 0, 0]]), { x: "0", y: "500", z: "0", rel: true });
  assert.deepEqual(nextPointDefault([[0, 0, 0], [0, 800, 0]]), { x: "500", y: "0", z: "0", rel: true });
  assert.equal(nextPointDefault([]).y, "500");
});

test("Biegerohr: Geraden, Bögen, Biegeliste L-R-A und Abwicklungslänge (MegaCAD-Abgleich M4)", async () => {
  const { planBends, bendListCsv } = await import("../src/core/biegerohr.js");
  // Bügel: 600 in X, 400 in Y, 300 in Z, R = 100 → zwei 90°-Biegungen in verschiedenen Ebenen
  const pts = [[0, 0, 0], [600, 0, 0], [600, 400, 0], [600, 400, 300]];
  const p = planBends(pts, 100, 48.3);
  assert.equal(p.bends.length, 2);
  assert.deepEqual(p.bends.map((b) => Math.round(b.angle)), [90, 90]);
  assert.ok(Math.abs(p.bends[0].straight - 500) < 1e-9);
  assert.ok(Math.abs(p.bends[1].straight - 200) < 1e-9);
  assert.ok(Math.abs(p.last - 200) < 1e-9);
  assert.equal(Math.abs(p.bends[1].rotation), 90, "Biegeebene um 90° gedreht");
  assert.ok(Math.abs(p.length - (900 + 2 * 100 * Math.PI / 2)) < 1e-9);
  assert.equal(p.pieces.filter((x) => x.t === "arc").length, 2);
  assert.equal(p.issues.length, 0);
  // in einer Ebene: Drehung 0 oder 180
  const flat = planBends([[0, 0, 0], [500, 0, 0], [500, 500, 0], [1000, 500, 0]], 50, 20);
  assert.equal(Math.abs(flat.bends[1].rotation), 180);
  assert.match(bendListCsv(p, "Bügel"), /Abwicklungslänge mm;1214,2/);
});

test("Biegerohr: zu kurzes Segment, Umkehr, kleiner Radius, kurze Spannlänge", async () => {
  const { planBends } = await import("../src/core/biegerohr.js");
  assert.throws(() => planBends([[0, 0, 0], [80, 0, 0], [80, 500, 0]], 100, 30), /Segment 1 .* zu kurz/);
  assert.throws(() => planBends([[0, 0, 0], [500, 0, 0], [200, 0, 0]], 50, 30), /kehrt an Punkt 2 um/);
  assert.match(planBends([[0, 0, 0], [500, 0, 0], [500, 500, 0]], 20, 30).issues[0].message, /kleiner als Rohr-Ø/);
  const short = planBends([[0, 0, 0], [500, 0, 0], [500, 210, 0], [0, 210, 0]], 100, 30);
  assert.match(short.issues.map((x) => x.message).join(), /Spannlänge/);
  assert.equal(planBends([[0, 0, 0], [500, 0, 0], [900, 0, 0]], 50, 30).bends.length, 0, "gerade weiter = keine Biegung");
});

test("Regelkörper: Prüfung und exakte Volumen (MegaCAD-Abgleich M5)", async () => {
  const { checkRegel, regelVolume, defaultRegelkoerper, REGEL_KINDS } = await import("../src/core/regelkoerper.js");
  assert.equal(Object.keys(REGEL_KINDS).length, 6);
  assert.throws(() => checkRegel("torus", { D: 20, d: 20 }), /kleiner als der Mittendurchmesser/);
  assert.throws(() => checkRegel("zylinder", { D: 0, H: 10 }), /Durchmesser D muss > 0/);
  assert.doesNotThrow(() => checkRegel("kegel", { D: 60, d: 0, H: 80 }));
  assert.throws(() => checkRegel("kegel", { D: 60, d: 60, H: 80 }), /Zylinder wählen/);
  assert.ok(Math.abs(regelVolume("kegel", { D: 60, d: 0, H: 80 }) - Math.PI * 900 * 80 / 3) < 1e-6);
  assert.ok(Math.abs(regelVolume("pyramide", { L: 60, B: 60, H: 60 }) - 72000) < 1e-9);
  assert.equal(defaultRegelkoerper("kugel").dims.D, "60");
});

test("Stahlprofile DSTV: Metergewicht gegen Tabellenwerte, Profil-ID, Schnelleingabe (MegaCAD-Abgleich M6)", async () => {
  const { sectionGeometry, catalogToDims, profileId, kgPerMeter, CATALOG, STEEL_TABLES, steelSize } = await import("../src/core/sections.js");
  const { resolveProfile } = await import("../src/core/profilesearch.js");
  const num = (d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Number(v)]));
  // Tabellen-Metergewichte (kg/m); UPN (Flanschneigung) und T (Kantenrundungen) vereinfacht ±3 %
  const soll = [["ipe", "200", 22.4, 0.01], ["ipe", "100", 8.1, 0.015], ["hea", "200", 42.3, 0.01], ["heb", "200", 61.3, 0.01], ["heb", "300", 117, 0.01], ["upn", "100", 10.6, 0.03], ["upn", "200", 25.3, 0.03], ["t", "40", 2.96, 0.03]];
  for (const [kind, size, kgm, tol] of soll) {
    const d = num(catalogToDims(kind, size));
    const g = sectionGeometry(kind, d);
    const ist = kgPerMeter(g.area, 7.85);
    assert.ok(Math.abs(ist - kgm) / kgm < tol, `${kind} ${size}: ${ist.toFixed(2)} kg/m statt ${kgm}`);
    assert.equal(profileId(kind, d), `${kind === "t" ? "T" : kind.toUpperCase()} ${size}`);
  }
  for (const kind of Object.keys(STEEL_TABLES)) for (const size of CATALOG[kind]) assert.doesNotThrow(() => sectionGeometry(kind, num(catalogToDims(kind, size))), `${kind} ${size}`);
  assert.equal(steelSize("ipe", { H: 210, B: 100, s: 5.6, t: 8.5, r: 12 }), null);
  assert.equal(profileId("ipe", { H: 210, B: 100, s: 5.6, t: 8.5, r: 12 }), "IPE 210x100x5,6x8,5");
  const hit = resolveProfile("ipe 200");
  assert.equal(hit.kind, "ipe");
  assert.equal(hit.id, "IPE 200");
  assert.equal(resolveProfile("HEB 160").dims.H, "160");
  assert.throws(() => sectionGeometry("ipe", { H: 50, B: 100, s: 5, t: 20, r: 10 }), /passen nicht/);
});

test("Anschlussplatte und Rippe: Maße, Bohrbild, Prüfungen (MegaCAD-Abgleich M8)", async () => {
  const { platePlan, ribPlan } = await import("../src/core/anschluss.js");
  const prof = { width: 100, height: 200 }; // IPE 200
  const p = platePlan(prof, { thickness: 15, overhang: 40, holes: 4, holeDia: 18, edge: 30 });
  assert.equal(p.W, 180); assert.equal(p.H, 280);
  assert.deepEqual(p.holes, [[-60, -110], [60, -110], [60, 110], [-60, 110]]);
  assert.equal(p.issues.length, 0);
  const p2 = platePlan(prof, { thickness: 10, overhang: 0, width: 300, height: 220, holes: 2, holeDia: 14, edge: 30 });
  assert.deepEqual(p2.holes, [[-120, 0], [120, 0]]);
  assert.throws(() => platePlan(prof, { thickness: 10, overhang: 20, holes: 4, holeDia: 18, edge: 5 }), /Randabstand 5 mm zu klein/);
  assert.match(platePlan(prof, { thickness: 10, overhang: 10, holes: 4, holeDia: 13, edge: 20 }).issues.map((x) => x.message).join(), /Bohrung liegt im Profil/);
  const r = ribPlan("oben", prof, p, { length: 80, thickness: 8, chamfer: 10 });
  assert.equal(r.s0, 100); assert.equal(r.Hr, 40);
  assert.deepEqual(r.poly, [[110, 0], [140, 0], [100, 80], [100, 10]]);
  assert.throws(() => ribPlan("links", prof, { W: 100, H: 280 }, { length: 80, thickness: 8 }), /steht nicht über das Profil hinaus/);
});

test("Skizze säubern: Punkte, Nulllängen, Doppelte, Überlappungen, Geradestellen (MegaCAD-Abgleich M7)", async () => {
  const { cleanSketch, cleanReportText } = await import("../src/core/sketchclean.js");
  const { solveSketch } = await import("../src/core/solver.js");
  const { extractProfiles } = await import("../src/core/sketch.js");
  // Rechteck 100 × 50 wie aus einem DXF: lose Endpunkte, eine doppelte Linie, eine Überlappung, leicht schief
  const p = (id, x, y) => ({ id, x, y });
  const sk = {
    points: [p("O", 0, 0), p("a", 0, 0.004), p("b", 100, 0.3), p("b2", 100.003, 0.3), p("c", 100, 50), p("c2", 100, 50.002), p("d", 0, 50), p("d2", 0.001, 50), p("a2", 0.002, 0), p("m", 40, 50), p("n", 70, 50), p("z", 20, 20), p("z2", 20, 20.005)],
    entities: [
      { id: "Oe", type: "point", p: "O", construction: true, origin: true },
      { id: "l1", type: "line", p1: "a", p2: "b" },
      { id: "l2", type: "line", p1: "b2", p2: "c" },
      { id: "l3", type: "line", p1: "c2", p2: "d" },
      { id: "l4", type: "line", p1: "d2", p2: "a2" },
      { id: "l1x", type: "line", p1: "b", p2: "a" }, // doppelt
      { id: "l3o", type: "line", p1: "m", p2: "n" }, // liegt auf l3
      { id: "z0", type: "line", p1: "z", p2: "z2" }, // fast Nulllänge
    ],
    constraints: [{ id: "Of", type: "fix", p: "O", x: 0, y: 0 }, { id: "k1", type: "length", e: "l1x", value: "100" }],
  };
  const rep = cleanSketch(sk, { tol: 0.01, angle: 0.5 });
  assert.equal(rep.merged, 6, JSON.stringify(rep));
  assert.equal(rep.zero, 1);
  assert.equal(rep.dupes, 1);
  assert.equal(rep.overlap, 1);
  assert.equal(rep.straightened, 1, "l1 mit 0,17° wird waagrecht");
  assert.equal(sk.entities.filter((e) => e.type === "line").length, 4);
  assert.ok(sk.constraints.some((c) => c.type === "length" && c.e === "l1"), "Maß der doppelten Linie geht auf die verbliebene über");
  assert.ok(sk.entities.find((e) => e.id === "l1").p1 === "O", "Ursprung bleibt Ankerpunkt");
  const r = solveSketch(sk, {});
  assert.ok(r.ok);
  assert.equal(extractProfiles(sk).regions.length, 1, "geschlossene Kontur");
  assert.match(cleanReportText(rep), /6 Punkt\(e\) zusammengeführt/);
  assert.equal(cleanReportText(cleanSketch(sk)), "Nichts zu säubern", "zweiter Lauf ändert nichts");
});

test("Schweißnähte: Querschnitt, Text, Nahtliste, Symbol ISO 2553 (MegaCAD-Abgleich M9)", async () => {
  const { weldArea, weldMass, weldText, weldRows, weldCsv, weldSymbol } = await import("../src/core/weld.js");
  assert.equal(weldArea("kehl", 4), 16);
  assert.ok(Math.abs(weldMass({ kind: "kehl", a: 4, length: 1000, side: "beide" }) - 0.2512) < 1e-9, "2 · 16 mm² · 1 m · 7,85");
  assert.equal(weldText({ kind: "kehl", a: 4, side: "beide", around: true, field: true }), "a4 Kehlnaht beidseitig, umlaufend, Montage");
  const rows = weldRows([
    { kind: "kehl", a: 4, length: 480, around: true, part: "Stütze" },
    { kind: "kehl", a: 4, length: 480, around: true, part: "Stütze", qty: 2 },
    { kind: "kehl", a: 3, length: 140, side: "beide", part: "Rippe" },
    { kind: "v", a: 5, length: 200 },
  ]);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => [r.kind, r.a, r.count, r.length]), [["kehl", 3, 1, 140], ["kehl", 4, 3, 1440], ["v", 5, 1, 200]]);
  const csv = weldCsv(rows).replace(/^﻿/, "").split("\r\n");
  assert.equal(csv[0].split(";").length, 10);
  assert.match(csv[2], /^2;Kehlnaht;a4;Pfeilseite;ja;;3;1440;/);
  // Symbol: Knick rechts vom Anker → Bezugslinie nach rechts, Kehlnaht unter der Linie, Strichlinie darüber
  const s = weldSymbol({ kind: "kehl", a: 4, around: true }, [0, 0], [10, -10]);
  assert.deepEqual(s.lines[1], { x1: 10, y1: -10, x2: 32, y2: -10 });
  assert.ok(s.lines.some((l) => l.dashed && l.y1 < -10), "Identifikationslinie über der Volllinie");
  assert.ok(s.polys[0].pts.every(([, y]) => y >= -10), "Pfeilseite: Symbol unter der Linie");
  assert.equal(s.texts[0].text, "a4");
  assert.equal(s.circles.length, 1);
  const g = weldSymbol({ kind: "hv", a: 6, side: "gegen", field: true }, [50, 0], [40, -10]);
  assert.ok(g.lines[1].x2 < 40, "Knick links vom Anker → Linie nach links");
  assert.ok(g.polys[0].pts.every(([, y]) => y <= -11.2 + 1e-9), "Gegenseite: Symbol über der Strichlinie");
  assert.ok(g.polys.some((p) => p.fill), "Montagefahne");
});

test("Generator-Gerüst und Geländer-Plan: Parameter, Aufteilung, Öffnungen, Vorlagen (MegaCAD-Abgleich M10/M11)", async () => {
  const { defaultGenerator, resolveGenParams, applyTemplate, GENERATORS } = await import("../src/core/generator.js");
  const f = defaultGenerator("gelaender");
  assert.equal(f.type, "generator");
  const E = (x) => Number(String(x).replace(",", "."));
  // frühere Standardprofile (Maße unten darauf gerechnet)
  const OLD_GEL = { post: { kind: "vierkant", size: "40x3" }, bar: { kind: "vierkantvoll", size: "12" }, belt: { kind: "flach", size: "40x8" }, beltMode: "zwischen" };
  const plan = (patch) => GENERATORS.gelaender.plan(resolveGenParams("gelaender", { ...f.params, ...OLD_GEL, ...patch }, E));
  const p1 = plan({ runs: "2500" });
  assert.equal(p1.members.filter((m) => /^Pfosten \d+$/.test(m.name)).length, 4, "2500 / 1200 → 3 Felder, 4 Pfosten");
  const bars = p1.members.filter((m) => /^Stab 1\./.test(m.name)).map((m) => m.a[0]).sort((a, b) => a - b);
  const gaps = [bars[0] - 6 - 20, ...bars.slice(1).map((x, i) => x - bars[i] - 12), 2500 / 3 - 20 - bars[bars.length - 1] - 6];
  assert.ok(gaps.every((g) => g <= 110 + 1e-9 && g > 0), "alle Öffnungen ≤ 110 mm: " + gaps.map((g) => g.toFixed(1)));
  assert.ok(Math.max(...gaps) - Math.min(...gaps) < 1e-6, "gleichmäßig verteilt");
  assert.equal(p1.plates.filter((x) => /^Fußplatte/.test(x.name)).length, 4, "Fußplatten");
  assert.deepEqual(p1.chains[0].points.map((q) => q[2]), [1000 - 42.4 / 2, 1000 - 42.4 / 2]);
  const p2 = plan({ runs: "2000", fill: "glas", panelT: "10", height: "850" });
  assert.equal(p2.plates.filter((x) => x.glass).length, 2);
  assert.match(p2.issues.map((x) => x.message).join(), /unter 900 mm/);
  assert.throws(() => plan({ runs: "0" }), /Längen > 0/);
  // Vorlage: nur bekannte Schlüssel
  const merged = applyTemplate("gelaender", f.params, { height: "1100", fremd: 1 });
  assert.equal(merged.height, "1100");
  assert.equal(merged.fremd, undefined);
});

test("Tor-Plan: Flügelbreite, Bogen, Stäbe, Prüfungen (MegaCAD-Abgleich M12)", async () => {
  const { defaultGenerator, resolveGenParams, GENERATORS } = await import("../src/core/generator.js");
  const f = defaultGenerator("tor");
  const E = (x) => Number(String(x).replace(",", "."));
  const plan = (patch) => GENERATORS.tor.plan(resolveGenParams("tor", { ...f.params, ...patch }, E));
  const g = plan({ form: "gerade", leaves: "1", width: "1000", mid: false });
  assert.equal(g.chains.length, 1);
  assert.equal(g.chains[0].points.length, 5, "Rechteck geschlossen");
  const bars = g.members.filter((m) => /Stab/.test(m.name));
  assert.ok(bars.every((m) => Math.abs(m.b[2] - (50 + 1200 - 40)) < 1e-9), "Stäbe bis Unterkante Oberriegel");
  const r = plan({ form: "rund", width: "2000" });
  assert.match(r.info, /Scheitel 2250 mm/, "Halbkreis: Stich = halbe Breite");
  assert.throws(() => plan({ form: "stich", rise: "2000" }), /höchstens halbe Torbreite/);
  assert.throws(() => plan({ width: "100" }), /Torbreite zu klein/);
  const u = plan({ form: "unten", rise: "200" });
  assert.match(u.info, /Scheitel 1050 mm/);
});

test("Masse mit eigener Dichte je Körper (Glas, Gitterrost, Holz)", async () => {
  const { bodiesMass, hasOwnDensity } = await import("../src/core/mass.js");
  const bodies = [{ props: { volume: 1e6 } }, { props: { volume: 1e6 }, meta: { density: 2.5 } }];
  assert.ok(Math.abs(bodiesMass(bodies, 7.85) - 10.35) < 1e-9);
  assert.equal(hasOwnDensity(bodies), true);
  assert.equal(hasOwnDensity(bodies.slice(0, 1)), false);
});

test("Normteile: Bezeichnung, Prüfung, Tabellen (MegaCAD-Abgleich M20)", async () => {
  const { normDesignation, checkNorm, NORM_THREADS, NORM_KINDS, threadLength4014, normDensity, collectNorm } = await import("../src/core/normteile.js");
  assert.equal(normDesignation({ kind: "schraube4017", size: "M12", length: 40, grade: "8.8" }), "Sechskantschraube ISO 4017 - M12 x 40 - 8.8");
  assert.equal(normDesignation({ kind: "schraube4014", size: "M16", length: 120, grade: "10.9", galv: true }), "Sechskantschraube ISO 4014 - M16 x 120 - 10.9 - tZn");
  assert.equal(normDesignation({ kind: "mutter", size: "M12", grade: "A2-70", galv: true }), "Sechskantmutter ISO 4032 - M12 - A2-70", "nichtrostend nie verzinkt");
  assert.equal(normDesignation({ kind: "scheibe", size: "M12", grade: "200 HV" }), "Scheibe ISO 7089 - 12 - 200 HV");
  assert.equal(normDesignation({ kind: "gewindestange", size: "M10", length: 1000, grade: "4.8" }), "Gewindestange DIN 976-1 - M10 x 1000 - 4.8");
  assert.deepEqual(checkNorm("schraube4017", "M12", 40), []);
  assert.match(checkNorm("schraube4017", "M12", 42)[0], /Vorzugslänge/);
  assert.match(checkNorm("schraube4014", "M12", 30).join(), /ISO 4017/);
  assert.throws(() => checkNorm("schraube4017", "M13", 40), /Gewindegröße/);
  assert.throws(() => checkNorm("gewindestange", "M12", 0), /Länge/);
  assert.equal(threadLength4014(12, 100), 30); assert.equal(threadLength4014(12, 150), 36); assert.equal(threadLength4014(12, 220), 49);
  for (const [k, t] of Object.entries(NORM_THREADS)) assert.ok(t.s > t.d && t.d2 > t.d1 && t.d1 > t.d && t.m < t.d, k);
  assert.equal(normDensity("A4-70"), 7.9); assert.equal(normDensity("8.8"), 7.85);
  assert.ok(Object.values(NORM_KINDS).every((d) => d.grades.length));
  const rows = collectNorm([{ bodies: [{ meta: { norm: { designation: "B", grade: "8.8" }, density: 7.85 }, props: { volume: 1000 } }, { meta: {} }], qty: 3 }, { bodies: [{ meta: { norm: { designation: "A", grade: "A2" } }, props: { volume: 0 } }] }]);
  assert.deepEqual(rows.map((r) => [r.name, r.qty]), [["A", 1], ["B", 3]]);
  assert.equal(rows[1].mass, 0.00785);
});

test("DXF-Import: Rundreise, Polylinie mit Bögen, Blöcke, Einheiten, Ellipse, Spline, OCS (MegaCAD-Abgleich M21)", async () => {
  const { parseDxf, dxfToSketch, bulgeArc, sampleBspline, primsBounds } = await import("../src/core/dxfread.js");
  const { sketchToDxf } = await import("../src/core/dxf.js");
  const { newSketch, extractProfiles } = await import("../src/core/sketch.js");
  const { buildSlot } = await import("../src/core/sketchshapes.js");
  let n = 0; const uid = (p) => p + ++n;
  const near = (a, b, t = 1e-6, m = "") => assert.ok(Math.abs(a - b) <= t, `${m} ${a} ≠ ${b}`);
  // Bulge: Halbkreis von (0,0) nach (10,0) gegen den Uhrzeigersinn → Mitte (5,0), unten herum
  const hb = bulgeArc([0, 0], [10, 0], 1);
  near(hb.c[0], 5); near(hb.c[1], 0); near(hb.r, 5); near(hb.a0, -Math.PI, 1e-9, "Start bei 180°"); near(Math.abs(hb.a1), 0, 1e-9);
  const qb = bulgeArc([10, 0], [0, 10], Math.tan(Math.PI / 8)); // Viertelkreis um den Ursprung
  near(qb.c[0], 0); near(qb.c[1], 0); near(qb.r, 10);
  // B-Spline Grad 1 = Polygonzug
  assert.deepEqual(sampleBspline(1, [0, 0, 1, 1], [[0, 0], [10, 0]], null, 2).map((p) => p.map((v) => Math.round(v))), [[0, 0], [5, 0], [10, 0]]);

  // Rundreise: Skizze mit Langloch und Kreis → DXF (R12) → Skizze, gleiche Profile
  const sk = newSketch("s", "S", "XY");
  const usePoint = (s, p) => { const id = uid("p"); s.points.push({ id, x: p.x, y: p.y }); return id; };
  buildSlot(sk, { x: 0, y: 0 }, { x: 100, y: 0 }, 20, { uid, usePoint });
  sk.points.push({ id: "pc", x: 50, y: 0 }); sk.entities.push({ id: "kc", type: "circle", c: "pc", r: 8 });
  const back = parseDxf(sketchToDxf(sk));
  assert.deepEqual(back.layers.map((l) => l.name), ["KONSTRUKTION", "KONTUR"]);
  const sk2 = newSketch("t", "T", "XY");
  dxfToSketch(sk2, back.prims.filter((p) => p.layer === "KONTUR"), { uid });
  const prof = extractProfiles(sk2);
  assert.equal(prof.regions.length, 1, "Langloch mit Loch = ein Profil"); assert.equal(prof.regions[0].holes.length, 1);
  assert.deepEqual(prof.errors, []); assert.equal(prof.openPoints.length, 0);
  near(prof.regions[0].area, 100 * 40 + Math.PI * 400 - Math.PI * 64, 10, "Fläche (abgetastet)");

  // Handgeschriebene DXF: cm, LWPOLYLINE mit Bogen, Block 2× eingefügt (gedreht, skaliert), Ellipse, Spline, Text, OCS-Bogen
  const L = (...a) => a.join("\n");
  const dxf = L("0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "5", "0", "ENDSEC",
    "0", "SECTION", "2", "BLOCKS", "0", "BLOCK", "8", "0", "2", "B1", "10", "1", "20", "1",
    "0", "LINE", "8", "0", "10", "1", "20", "1", "11", "3", "21", "1", "0", "ENDBLK",
    "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
    "0", "LWPOLYLINE", "8", "Laser", "90", "4", "70", "1", "10", "0", "20", "0", "10", "10", "20", "0", "42", "1", "10", "10", "20", "4", "10", "0", "20", "4",
    "0", "INSERT", "8", "Teile", "2", "B1", "10", "20", "20", "0", "50", "90", "41", "2", "42", "2",
    "0", "ELLIPSE", "8", "Laser", "10", "0", "20", "20", "11", "4", "21", "0", "40", "0.5", "41", "0", "42", "6.283185307179586",
    "0", "SPLINE", "8", "Laser", "71", "1", "72", "4", "73", "2", "40", "0", "40", "0", "40", "1", "40", "1", "10", "0", "20", "30", "10", "5", "20", "30",
    "0", "TEXT", "8", "Laser", "10", "0", "20", "0", "1", "Hallo",
    "0", "ARC", "8", "Laser", "10", "5", "20", "0", "40", "1", "50", "0", "51", "90", "210", "0", "220", "0", "230", "-1",
    "0", "ENDSEC", "0", "EOF");
  const r = parseDxf(dxf);
  assert.equal(r.scale, 10); assert.equal(r.unit, "cm");
  assert.deepEqual(r.skipped, { TEXT: 1 });
  assert.deepEqual(r.layers, [{ name: "Laser", count: 7 }, { name: "Teile", count: 1 }]);
  const arc = r.prims.find((p) => p.kind === "arc" && p.r === 20);
  assert.ok(arc, "Bogen aus Wölbung, in mm"); near(arc.c[0], 100); near(arc.c[1], 20);
  const ins = r.prims.find((p) => p.layer === "Teile");
  // Block: (1,1)→(3,1) relativ Basis (1,1) → (0,0)→(2,0), ×2 → (0,0)→(4,0), 90° → (0,0)→(0,4), +(20,0) → (20,0)→(20,4), cm → mm
  near(ins.a[0], 200); near(ins.a[1], 0); near(ins.b[0], 200); near(ins.b[1], 40);
  const el = r.prims.find((p) => p.kind === "ellipse");
  near(el.major[0], 40); near(el.ratio, 0.5); near(el.c[1], 200);
  const ocs = r.prims.find((p) => p.kind === "arc" && Math.abs(p.r - 10) < 1e-9);
  near(ocs.c[0], -50, 1e-9, "OCS gespiegelt"); near(ocs.a0, Math.PI / 2, 1e-9); near(ocs.a1, Math.PI, 1e-9);
  const bb = primsBounds(r.prims);
  near(bb[0][0], -60); near(bb[1][1], 300);
  // Übernahme: Polylinie geschlossen (gemeinsame Punkte), Ellipse als Ellipse
  const sk3 = newSketch("u", "U", "XY");
  const cnt = dxfToSketch(sk3, r.prims.filter((p) => p.layer === "Laser"), { uid });
  assert.equal(cnt.entities, 7);
  const pr3 = extractProfiles(sk3);
  assert.equal(pr3.regions.length, 2, "Polylinien-Kontur und Ellipse");
  near(pr3.regions.find((x) => x.outer.kind !== "ellipse").area, 100 * 40 + Math.PI * 400 / 2, 10, "Kontur mit Halbkreis");
  assert.throws(() => parseDxf("hallo"), /Keine DXF/);
});

test("Generatoren: Standardprofile stehen im Katalog (Auswahlliste nicht leer)", async () => {
  const { CATALOG } = await import("../src/core/sections.js");
  const { GENERATORS } = await import("../src/core/generator.js");
  for (const [g, G] of Object.entries(GENERATORS))
    for (const s of G.schema.filter((x) => x.type === "section")) {
      const c = CATALOG[s.default.kind];
      assert.ok(Array.isArray(c) ? c.includes(s.default.size) : c && String(s.default.size) in c, `${g}.${s.key}: ${s.default.kind} ${s.default.size}`);
      assert.ok(!s.kinds || s.kinds.includes(s.default.kind), `${g}.${s.key}: Art ${s.default.kind} nicht erlaubt`);
    }
});

test("Kantteil: Mittellinie aus Außenmaßen, Abwicklung über Biegezugabe, Umriss, DXF (MegaCAD-Abgleich M17)", async () => {
  const { planKantteil, kantteilOutline, kantteilFlatDxf, bendAllowance, splitList } = await import("../src/core/blech.js");
  assert.deepEqual(splitList("L + 5; 100 ;40"), ["L + 5", "100", "40"], "mit ; getrennt: Leerzeichen gehören zum Ausdruck");
  assert.deepEqual(splitList("40 100  40"), ["40", "100", "40"]);
  const { DxfWriter } = await import("../src/core/dxf.js");
  const near = (a, b, t = 1e-6, m = "") => assert.ok(Math.abs(a - b) <= t, `${m} ${a} ≠ ${b}`);
  // U 40/100/40 außen, t 2, ri 2, K 0,33: Ausgleichswert v = 2(ri + t) − π/2 (ri + K t) je 90°-Biegung
  const u = planKantteil({ legs: [40, 100, 40], angles: [90, 90], t: 2, ri: 2, k: 0.33 });
  const v = 2 * 4 - (Math.PI / 2) * (2 + 0.66);
  near(u.flat, 180 - 2 * v, 1e-9, "Abwicklung");
  assert.deepEqual(u.flatParts.map((x) => Math.round(x * 1000) / 1000), [36, 4.178, 92, 4.178, 36]);
  near(u.bendLines[0], 36 + 4.1783 / 2, 1e-3);
  near(bendAllowance(2, 0.33, 2, Math.PI / 2), 4.17832, 1e-4);
  // innen gemessen: Schenkel um t größer → Mittellinie +1 je Biegung
  const ui = planKantteil({ legs: [40, 100, 40], angles: [90, 90], t: 2, ri: 2, k: 0.33, ref: "innen" });
  near(ui.flat - u.flat, 8, 1e-9, "innen 2·2 mm je Biegung mehr");
  // Z-Profil: Biegungen in entgegengesetzte Richtung, Mitte des letzten Schenkels liegt oben
  const z = planKantteil({ legs: [30, 60, 30], angles: [90, -90], t: 3, ri: 3, k: 0.4, ref: "mitte" });
  near(z.center[2].a[1], 60, 1e-9, "letzter Schenkel auf Höhe 60 (Mittellinie)");
  assert.equal(z.bends[1].sgn, -1);
  // Umriss geschlossen, Bögen mit Mittelpunkt im richtigen Abstand
  const o = kantteilOutline(u, 2);
  const lastTo = o.segs.at(-1).to;
  near(lastTo[0], o.start[0]); near(lastTo[1], o.start[1]);
  assert.equal(o.segs.filter((s) => s.t === "arc").length, 4, "je Biegung innen und außen ein Bogen");
  const arc0 = o.segs.find((s) => s.t === "arc");
  near(Math.hypot(arc0.mid[0] - u.bends[0].c[0], arc0.mid[1] - u.bends[0].c[1]), 2, 1e-9, "Innenbogen R = ri");
  // Fehler
  assert.throws(() => planKantteil({ legs: [5, 100, 40], angles: [90, 90], t: 2, ri: 10, k: 0.33 }), /Schenkel 1 zu kurz/);
  assert.throws(() => planKantteil({ legs: [40, 100], angles: [90, 90], t: 2, ri: 2, k: 0.33 }), /2 Schenkel brauchen 1 Biegewinkel/);
  // DXF: Kontur + 2 Biegelinien auf BIEGUNG
  const dxf = kantteilFlatDxf(DxfWriter, u, 1000, { name: "Abdeckung", t: 2 });
  assert.ok((dxf.match(/\nBIEGUNG\r?\n/g) || []).length >= 3, "Layer-Tabelle + 2 Biegelinien");
  assert.match(dxf, /90%%d auf R2/);
});

test("Fotodarstellung: Oberflächen je Werkstoff und Körperart, Bühne aus der Inhaltsbox (MegaCAD-Abgleich M22)", async () => {
  const { photoSurface, photoStage } = await import("../src/core/rendering.js");
  const { MATERIALS } = await import("../src/core/sections.js");
  for (const k of Object.keys(MATERIALS)) {
    const s = photoSurface(k, null);
    assert.ok(s.metalness >= 0 && s.metalness <= 1 && s.roughness > 0 && s.roughness <= 1, k);
  }
  assert.ok(photoSurface("1.4301").roughness < photoSurface("S235").roughness, "Edelstahl glänzender als Baustahl");
  assert.equal(photoSurface("PE").metalness, 0);
  assert.deepEqual(photoSurface("unbekannt"), { ...photoSurface("S235"), label: "unbekannt" });
  const g = photoSurface("S235", { glass: true });
  assert.ok(g.opacity < 1 && g.metalness === 0 && g.color);
  assert.equal(photoSurface("S235", { tread: "holz" }).metalness, 0);
  assert.ok(photoSurface("S235", { norm: { kind: "mutter" } }).color);
  const st = photoStage([0, 0, 100], [1000, 500, 300]);
  assert.ok(st.groundZ < 100 && st.groundZ > 95, "Boden knapp unter dem Modell");
  assert.deepEqual(st.center, [500, 250, 200]);
  assert.ok(st.sun[2] > 300 && st.shadowHalf > st.radius && st.shadowFar > 2 * st.radius);
});

test("Geländer Stufe 2: Füllung Kreuz mit Ring und Rahmen mit Staketen (MegaCAD-Abgleich M11)", async () => {
  const { defaultGenerator, resolveGenParams, GENERATORS } = await import("../src/core/generator.js");
  const f = defaultGenerator("gelaender");
  const E = (x) => Number(String(x).replace(",", "."));
  // frühere Standardprofile (Maße unten darauf gerechnet)
  const OLD_GEL = { post: { kind: "vierkant", size: "40x3" }, bar: { kind: "vierkantvoll", size: "12" }, belt: { kind: "flach", size: "40x8" }, beltMode: "zwischen" };
  const plan = (patch) => GENERATORS.gelaender.plan(resolveGenParams("gelaender", { ...f.params, ...OLD_GEL, ...patch }, E));
  const k = plan({ runs: "2400", fill: "kreuz" });
  const diag = k.members.filter((m) => /^Diagonale/.test(m.name));
  assert.equal(diag.length, 8, "2 Felder × 4 Stücke (Diagonalen enden am Ring)");
  assert.ok(diag.every((m) => m.cuts.start.length === 1 && m.copes.some((c) => c.section.kind === "vierkantvoll")), "an den Pfosten abgeschnitten, am Ring ausgeklinkt");
  assert.deepEqual(diag.filter((m) => /^Diagonale 1\./.test(m.name)).map((m) => m.a[0]).sort((a, b) => a - b), [20, 20, 1180, 1180], "von den Pfostenflächen zum Ring");
  // ohne Ring: Diagonale 1 durchgehend, Diagonale 2 in zwei Stücken an ihr ausgeklinkt (keine Durchdringung)
  const nr = plan({ runs: "1200", fill: "kreuz", ring: false }).members.filter((m) => /^Diagonale/.test(m.name));
  assert.deepEqual(nr.map((m) => m.name), ["Diagonale 1.1", "Diagonale 1.2 oben", "Diagonale 1.2 unten"]);
  assert.ok(Math.abs(nr[0].a[0] - 20) < 1e-9 && Math.abs(nr[0].b[0] - 1180) < 1e-9 && nr.slice(1).every((m) => m.copes.length >= 1));
  const rings = k.chains.filter((c) => /^Ring/.test(c.name));
  assert.equal(rings.length, 2);
  const r0 = rings[0].points, c0 = [600, 0, (r0[0][2] + r0[12][2]) / 2];
  assert.ok(r0.every((q) => Math.abs(Math.hypot(q[0] - c0[0], q[2] - c0[2]) - 150) < 1e-6 && Math.abs(q[1]) < 1e-9), "Kreis ⌀ 300 in der Feldebene");
  assert.match(k.issues.map((x) => x.message).join(), /Öffnung \d+ mm über 120/, "Kreuz hält 120 mm nicht ein → Warnung");
  const open = Number(/Öffnung (\d+) mm/.exec(k.issues.map((x) => x.message).join())[1]);
  assert.ok(open < 580, `Inkreis kleiner als das halbe Feld (${open})`);
  assert.throws(() => plan({ runs: "2400", fill: "kreuz", ringD: "900" }), /Ring ⌀ 900 passt nicht/);
  assert.equal(plan({ runs: "2400", fill: "kreuz", ring: false }).chains.filter((c) => /^Ring/.test(c.name)).length, 0);
  // über Eck: Diagonalen liegen in der gedrehten Feldebene
  const e = plan({ runs: "1200; 1200", angle: "90", fill: "kreuz", ring: false });
  const d2 = e.members.filter((m) => /^Diagonale 2\./.test(m.name));
  assert.ok(d2.every((m) => Math.abs(m.a[0] - 1200) < 1e-9 && Math.abs(m.b[0] - 1200) < 1e-9));
  const r = plan({ runs: "1200", fill: "rahmen" });
  const fr = r.chains.find((c) => /^Füllungsrahmen 1/.test(c.name));
  assert.equal(fr.points.length, 5, "geschlossener Rahmen");
  const xs = fr.points.map((q) => q[0]);
  assert.ok(Math.abs(Math.min(...xs) - (20 + 15 + 10)) < 1e-9, "Abstand zum Pfosten 15 mm, Rahmenmitte");
  const bars = r.members.filter((m) => /^Stab 1\./.test(m.name)).map((m) => m.a[0]).sort((a, b) => a - b);
  const i0 = 20 + 15 + 20, i1 = 1200 - 20 - 15 - 20;
  const gaps = [bars[0] - 6 - i0, ...bars.slice(1).map((x, j) => x - bars[j] - 12), i1 - bars[bars.length - 1] - 6];
  assert.ok(gaps.every((g) => g > 0 && g <= 110 + 1e-9), gaps.join());
  assert.ok(r.members.filter((m) => /^Stab/.test(m.name)).every((m) => m.a[2] > fr.points[0][2] && m.b[2] < fr.points[2][2]), "Staketen innerhalb des Rahmens");
});

test("Generator-Listen: Ausdrücke mit Leerzeichen bleiben ganz (V1)", async () => {
  const { defaultGenerator, resolveGenParams } = await import("../src/core/generator.js");
  const { evaluate } = await import("../src/core/expr.js");
  const f = defaultGenerator("gelaender");
  const P = resolveGenParams("gelaender", { ...f.params, runs: "L + 500; 1200" }, (x) => evaluate(x, { L: 1000 }));
  assert.deepEqual(P.runs, [1500, 1200]);
  assert.deepEqual(resolveGenParams("gelaender", { ...f.params, runs: "1000 1200" }, Number).runs, [1000, 1200], "ohne ; weiter durch Leerzeichen");
});

test("Oberfläche und RAL-Farbe je Bauteil (E7)", async () => {
  const { finishOf, finishLabel, finishColor, finishSurface, RAL } = await import("../src/core/oberflaeche.js");
  const { photoSurface } = await import("../src/core/rendering.js");
  const { listSheets } = await import("../src/core/lists.js");
  assert.equal(finishOf({}).kind, "roh");
  assert.equal(finishLabel({}), "");
  assert.equal(finishColor({}), null, "roh: Werkstofffarbe");
  const p = { finish: { kind: "duplex", ral: "RAL 7016" } };
  assert.equal(finishOf(p).ral, "7016", "»RAL« vorne wird entfernt");
  assert.equal(finishLabel(p), "verzinkt + pulverbeschichtet RAL 7016 Anthrazitgrau");
  assert.equal(finishLabel(p, { short: true }), "tZn + pulver RAL 7016");
  assert.equal(finishColor(p), RAL["7016"].hex);
  assert.equal(finishColor({ finish: { kind: "verzinkt", ral: "7016" } }), "#a9b1b6", "verzinkt hat keine RAL-Farbe");
  assert.equal(finishLabel({ finish: { kind: "pulver", ral: "6029" } }), "pulverbeschichtet RAL 6029", "unbekannte RAL-Nummer bleibt als Text");
  assert.equal(finishSurface(undefined), null);
  const s = photoSurface("S235", {}, p.finish);
  assert.equal(s.color, RAL["7016"].hex);
  assert.ok(s.metalness < 0.3, "Pulver ist nicht metallisch");
  assert.equal(photoSurface("S235", { glass: true }, p.finish).label, "Glas", "Glas bleibt Glas");
  assert.equal(photoSurface("S235", { norm: true }, p.finish).label, "Normteil verzinkt");
  const sh = listSheets({ bom: [{ pos: 1, name: "Pfosten", qty: 2, material: "S235", finish: "feuerverzinkt", mass: 3 }] });
  assert.deepEqual(sh[0].rows[0].slice(4, 6), ["Werkstoff", "Oberfläche"]);
  assert.equal(sh[0].rows[1][5], "feuerverzinkt");
  assert.equal(sh[0].rows.at(-1)[7], 6, "Summe in der letzten Spalte");
});

test("Generator-Skizze: Ansicht und Maße je Generator, Maße gehören zu Parametern", async () => {
  const g = await import("../src/core/generator.js");
  const { evaluate } = await import("../src/core/expr.js");
  const sk = await import("../src/core/genskizze.js");
  for (const gen of Object.keys(g.GENERATORS)) {
    const G = g.GENERATORS[gen], f = g.defaultGenerator(gen);
    const p = g.resolveGenParams(gen, f.params, (x) => evaluate(String(x), {}));
    const plan = G.plan(p);
    for (const v of sk.sketchViews(G)) {
      const view = sk.sketchView(plan, v);
      assert.ok(view.lines.length + view.fills.length > 0, `${gen} ${v}`);
      const dims = sk.sketchDims(G, p, plan, v, view);
      assert.ok(dims.length > 0, `${gen} ${v}: Maße`);
      const keys = new Set(G.schema.map((s) => s.key));
      assert.ok(dims.every((d) => d.key === null || keys.has(d.key)), `${gen}: Maß gehört zu einem Parameter`);
    }
  }
  // Treppe: Laufbreite und Auftritt im Grundriss, Geländerhöhe in der Ansicht
  const f = g.defaultGenerator("treppe");
  const p = g.resolveGenParams("treppe", f.params, (x) => evaluate(String(x), {}));
  const plan = g.GENERATORS.treppe.plan(p);
  const top = sk.sketchDims(g.GENERATORS.treppe, p, plan, "top");
  assert.deepEqual(top.filter((d) => d.key).map((d) => [d.key, d.text]).slice(0, 2), [["width", 1000], ["going", 280]]);
  assert.ok(sk.sketchDims(g.GENERATORS.treppe, p, plan, "front").some((d) => d.key === "gelH" && d.text === 1000));
  // ältere Treppe ohne Geländer-Angabe: genValues liefert »keine«
  assert.equal(g.genValues("treppe", { form: "L" }).gel, "keine");
  assert.equal(g.genValues("treppe", g.defaultGenerator("treppe").params).gel, "beide");
});

test("Treppengeländer: Pfostenabstand entlang des schrägen Handlaufs ≤ Höchstmaß", async () => {
  const g = await import("../src/core/generator.js");
  const { evaluate } = await import("../src/core/expr.js");
  const f = g.defaultGenerator("treppe");
  const p = g.resolveGenParams("treppe", f.params, (x) => evaluate(String(x), {}));
  const plan = g.GENERATORS.treppe.plan(p);
  const posts = plan.members.filter((m) => /^Geländer rechts Pfosten/.test(m.name)).map((m) => m.b);
  for (let i = 1; i < posts.length; i++) {
    const [a, b] = [posts[i - 1], posts[i]];
    assert.ok(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) <= 1200 + 1e-6, `Feld ${i}`);
  }
});

test("Schiebetor-Plan: Gegengewicht, Rollenböcke unter dem Schwanz, Teile getrennt (E8)", async () => {
  const g = await import("../src/core/generator.js");
  const E = (x) => Number(String(x).replace(",", "."));
  const f = g.defaultGenerator("schiebetor");
  const plan = (patch) => g.GENERATORS.schiebetor.plan(g.resolveGenParams("schiebetor", { ...f.params, ...patch }, E));
  const all = plan({});
  assert.equal(all.geo.T, 1600, "Gegengewicht 40 % von 4000");
  const beam = all.members.find((m) => m.name === "Flügel Laufprofil");
  assert.deepEqual([beam.a[0], beam.b[0]], [-1600, 4000]);
  const rb = all.plates.filter((p) => /^Rollenbock/.test(p.name));
  assert.equal(rb.length, 2);
  // offen (um die Durchfahrt nach −X verschoben) liegt der Flügel weiter auf beiden Rollenböcken
  for (const x of [0, -4000]) assert.ok(rb.every((p) => p.center[0] - p.W / 2 >= beam.a[0] + x - 1e-6 && p.center[0] + p.W / 2 <= beam.b[0] + x + 1e-6), `Verschiebung ${x}`);
  assert.ok(rb.every((p) => Math.abs(p.center[2] + p.t - 60) < 1e-9), "Oberkante Rollenbock = Unterkante Laufprofil");
  const bars = all.members.filter((m) => /Flügel Stab/.test(m.name));
  assert.ok(bars.length > 20 && bars.every((m) => m.a[0] > 0 && m.a[0] < 4000), "Staketen nur in der Durchfahrt");
  const leaf = plan({ teil: "fluegel" }), fixed = plan({ teil: "fest" });
  assert.ok(leaf.members.every((m) => m.name.startsWith("Flügel")) && leaf.plates.length === 0);
  assert.deepEqual(fixed.members.map((m) => m.name).sort(), ["Fangpfosten", "Führungspfosten", "Führungsrolle hinten", "Führungsrolle vorne"]);
  assert.ok(["Fangtasche vorne", "Fangtasche hinten", "Führungsrollenbock"].every((n) => fixed.plates.some((x) => x.name === n)), "Fangtasche und Führungsrollen am festen Teil");
  const fang = fixed.members.find((m) => m.name === "Fangpfosten");
  assert.ok(fang.a[0] - fixed.members.find((m) => m.name === "Fangpfosten").section.geom.width / 2 - 4000 >= 20 - 1e-9, "Spalt zwischen Flügel und Fangpfosten");
  assert.equal(leaf.members.length + fixed.members.length, all.members.length);
  assert.throws(() => plan({ tail: "300" }), /Gegengewicht zu kurz/);
  assert.ok(plan({ tail: "1000" }).issues.some((i) => /35 %/.test(i.message)));
  const q = plan({ fill: "quer" });
  assert.ok(q.members.some((m) => /Querstab/.test(m.name)));
});

test("Zaun-Plan: Felder, Pfosten, Gefälle und Stufung am Hang (E9)", async () => {
  const g = await import("../src/core/generator.js");
  const E = (x) => Number(String(x).replace(",", "."));
  const f = g.defaultGenerator("zaun");
  const plan = (patch) => g.GENERATORS.zaun.plan(g.resolveGenParams("zaun", { ...f.params, ...patch }, E));
  const e = plan({});
  assert.equal(e.members.filter((m) => /^Pfosten/.test(m.name)).length, 5, "10 m bei max. 2,5 m: 4 Felder, 5 Pfosten");
  assert.match(e.info, /4 Felder à 2440 mm/);
  assert.ok(e.members.filter((m) => /Unterriegel/.test(m.name)).every((m) => m.a[2] === 80 + 20 && m.b[2] === 100), "eben: Unterriegel waagrecht");
  // Gefälle: Riegel steigen mit dem Gelände (600 auf 10 m), schräg geschnitten
  const s = plan({ terrain: "gefaelle" });
  const u1 = s.members.find((m) => m.name === "Feld 1 Unterriegel");
  assert.ok(Math.abs((u1.b[2] - u1.a[2]) / (u1.b[0] - u1.a[0]) - 0.06) < 1e-9 && u1.cuts);
  const p5 = s.members.find((m) => m.name === "Pfosten 5");
  assert.ok(Math.abs(p5.a[2] - (600 - 600)) < 1e-9 && Math.abs(p5.b[2] - (600 + 80 + 1200 + 50)) < 1e-9);
  // gestuft: Felder waagrecht über dem höheren Ende; Pfosten bis über das höhere Feld
  const st = plan({ terrain: "stufen" });
  const r2 = st.members.filter((m) => /^Feld 2 /.test(m.name) && /riegel/.test(m.name));
  assert.ok(r2.every((m) => Math.abs(m.a[2] - m.b[2]) < 1e-9 && !m.cuts));
  assert.ok(Math.abs(st.members.find((m) => m.name === "Feld 2 Unterriegel").a[2] - (300 + 80 + 20)) < 1e-9);
  assert.ok(Math.abs(st.members.find((m) => m.name === "Pfosten 2").b[2] - (300 + 80 + 1200 + 50)) < 1e-9);
  assert.ok(!st.issues.length);
  assert.ok(plan({ terrain: "stufen", rise: "1500" }).issues.some((i) => /Bodenluft/.test(i.message)));
  // Füllungen
  assert.ok(plan({ fill: "quer" }).members.some((m) => /Querstab/.test(m.name)));
  const b = plan({ fill: "blech", terrain: "gefaelle", base: "fussplatte" });
  assert.equal(b.plates.filter((x) => /Blech/.test(x.name)).length, 4);
  assert.equal(b.plates.filter((x) => /Fußplatte/.test(x.name)).length, 5);
  assert.throws(() => plan({ length: "100" }), /mindestens 500/);
});

test("Generator-Meldungen am Feld und Körper je Feld (V5)", async () => {
  const g = await import("../src/core/generator.js");
  const { fieldParts } = await import("../src/core/genskizze.js");
  const E = (x) => Number(String(x).replace(",", "."));
  const plan = (gen, patch) => g.GENERATORS[gen].plan(g.resolveGenParams(gen, { ...g.defaultGenerator(gen).params, ...patch }, E));
  const err = (gen, patch) => { try { plan(gen, patch); } catch (e) { return e.key; } return null; };
  assert.equal(err("zaun", { length: "100" }), "length");
  assert.equal(err("tor", { form: "stich", rise: "5000" }), "rise");
  assert.equal(err("treppe", { height: "100" }), "height");
  assert.equal(err("balkon", { railH: "100" }), "railH", "Geländer-Fehler auf das Balkon-Feld umgeschlüsselt");
  assert.ok(plan("treppe", { going: "200" }).issues.some((x) => x.key === "going"));
  assert.ok(plan("balkon", { railH: "800" }).issues.some((x) => x.key === "railH"));
  // jeder Schlüssel einer Meldung gehört zu einem Parameter des Generators
  for (const gen of Object.keys(g.GENERATORS)) {
    const keys = new Set(g.GENERATORS[gen].schema.map((s) => s.key));
    for (const x of plan(gen, {}).issues) assert.ok(!x.key || keys.has(x.key), `${gen}: ${x.key}`);
  }
  assert.ok(fieldParts(g.GENERATORS.zaun, "fieldMax").test("Pfosten 1") && fieldParts(g.GENERATORS.zaun, "groundGap") === null);
  assert.ok(fieldParts(g.GENERATORS.zaun, "post").test("Pfosten 3"));
  assert.ok(fieldParts(g.GENERATORS.treppe, "gelRail").test("Geländer links Handlauf"));
  assert.ok(fieldParts(g.GENERATORS.schiebetor, "beam").test("Flügel Laufprofil"));
});

test("Generatoren: jede Profilart in jedem Profilfeld rechnet (oder meldet am Feld), keine NaN-Koordinaten", async () => {
  const { CATALOG, SECTION_KINDS } = await import("../src/core/sections.js");
  const g = await import("../src/core/generator.js");
  const E = (x) => Number(String(x).replace(",", "."));
  for (const [gen, G] of Object.entries(g.GENERATORS)) {
    const base = g.defaultGenerator(gen).params;
    for (const s of G.schema.filter((x) => x.type === "section")) {
      for (const kind of s.kinds || Object.keys(SECTION_KINDS)) {
        const size = CATALOG[kind][Math.floor(CATALOG[kind].length / 2)];
        let plan;
        try { plan = G.plan(g.resolveGenParams(gen, { ...base, [s.key]: { kind, size } }, E)); } catch (e) { assert.ok(e.key || /zu |passt|prüfen|Platz/.test(e.message), `${gen}.${s.key} ${kind}: ${e.stack}`); continue; }
        const pts = [...plan.members.flatMap((m) => [m.a, m.b]), ...plan.chains.flatMap((c) => c.points)];
        assert.ok(pts.every((q) => q.every(Number.isFinite)), `${gen}.${s.key} ${kind}: NaN`);
        assert.ok([...plan.members, ...plan.chains].every((m) => m.rot === undefined || [0, 90, 180, 270].includes(Number(m.rot))), `${gen}.${s.key} ${kind}: Drehung`);
      }
    }
  }
});

test("Profillage: Treppenwangen U/UPN offen nach außen, Rahmen offen nach außen, Riegel offen zu den Stäben", async () => {
  const g = await import("../src/core/generator.js");
  const { orientRot } = await import("../src/core/orient.js");
  const { sectionOf } = g;
  const E = (x) => Number(String(x).replace(",", "."));
  const plan = (gen, patch) => g.GENERATORS[gen].plan(g.resolveGenParams(gen, { ...g.defaultGenerator(gen).params, ...patch }, E));
  // offene Seite eines UPN (Steg bei −u) in Weltrichtung nach der Drehung
  const openDir = (z, up, rot) => {
    const n = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };
    const v0 = n(up.map((x, i) => x - z[i] * (up[0] * z[0] + up[1] * z[1] + up[2] * z[2]))), u0 = [v0[1] * z[2] - v0[2] * z[1], v0[2] * z[0] - v0[0] * z[2], v0[0] * z[1] - v0[1] * z[0]];
    const t = (rot * Math.PI) / 180;
    return u0.map((x, i) => Math.round(x * Math.cos(t) + v0[i] * Math.sin(t)));
  };
  const st = plan("treppe", { support: "upn" });
  for (const m of st.members.filter((x) => /^Wange/.test(x.name))) {
    const z = m.b.map((x, i) => x - m.a[i]).map((x, _, a) => x / Math.hypot(...a));
    const out = openDir(z, m.up, m.rot);
    assert.equal(Math.sign(out[1]), m.a[1] < 0 ? -1 : 1, `${m.name}: offene Seite nach außen`);
  }
  assert.deepEqual(st.members.filter((x) => /^Wange/.test(x.name)).map((x) => [x.name, Math.sign(x.a[1])]), [["Wange rechts", -1], ["Wange links", 1]], "rechts/links beim Hinaufgehen (+X)");
  // Podest- und Balkonrahmen: UPN offen nach außen (erstes Stück entlang +X, außen = −Y)
  const upn = { kind: "upn", size: "120" };
  assert.equal(orientRot(sectionOf(upn), [1, 0, 0], [0, 0, 1], { tall: [0, 0, 1], open: [0, -1, 0] }), 180);
  assert.equal(plan("treppe", { form: "L", podestRahmen: upn }).chains.find((c) => c.name === "Podestrahmen").rot, 180);
  assert.equal(plan("balkon", { frame: upn }).chains.find((c) => c.name === "Rahmen").rot, 180);
  // Zaun: Unterriegel offen nach oben, Oberriegel nach unten
  const z = plan("zaun", { frame: upn });
  const ur = z.members.find((m) => m.name === "Feld 1 Unterriegel"), or = z.members.find((m) => m.name === "Feld 1 Oberriegel");
  assert.deepEqual([openDir([1, 0, 0], ur.up, ur.rot)[2], openDir([1, 0, 0], or.up, or.rot)[2]], [1, -1]);
  // Schiebetor: Laufprofil offen nach unten
  const bm = plan("schiebetor", { beam: upn }).members.find((m) => m.name === "Flügel Laufprofil");
  assert.equal(openDir([1, 0, 0], bm.up, bm.rot)[2], -1);
});

test("Handlaufhalter: Pfosten endet unter dem Handlauf, Endkappe, Stift, Bohrung 12,1 im Handlauf", async () => {
  const g = await import("../src/core/generator.js");
  const E = (x) => Number(String(x).replace(",", "."));
  const plan = (gen, patch) => g.GENERATORS[gen].plan(g.resolveGenParams(gen, { ...g.defaultGenerator(gen).params, ...patch }, E));
  const p = plan("gelaender", { runs: "2500" });
  const post = p.members.find((m) => m.name === "Pfosten 1"), pin = p.members.find((m) => m.name === "Pfosten 1 Handlaufhalter");
  assert.ok(Math.abs(post.b[2] - (1000 - 42.4 - 60 - 4)) < 1e-9, "60 mm frei + 4 mm Endkappe");
  assert.ok(p.plates.some((x) => x.name === "Pfosten 1 Endkappe" && x.t === 4));
  assert.deepEqual([pin.section.kind, pin.section.dims.D, pin.a[2], pin.b[2]], ["rund", 12, 1000 - 42.4 - 60, 1000 - 42.4 / 2]);
  const hd = p.drills.filter((d) => d.target === "Handlauf");
  assert.equal(hd.length, 4);
  assert.deepEqual([hd[0].d, hd[0].dir], [12.1, [0, 0, -1]]);
  assert.match(p.info, /4 Handlaufhalter \(Bohrung Ø 12,1\)/);
  // ohne Halter (auch ältere Features): Pfosten bis unter den Handlauf
  const o = plan("gelaender", { runs: "2500", holder: "keine" });
  assert.ok(Math.abs(o.members.find((m) => m.name === "Pfosten 1").b[2] - (1000 - 42.4)) < 1e-9 && !o.drills.some((d) => d.target === "Handlauf"));
  assert.equal(g.genValues("gelaender", { runs: "2000" }).holder, "keine");
  // massiver Pfosten (Flachstahl): ohne Endkappe
  const fl = plan("gelaender", { runs: "2500", post: { kind: "flach", size: "40x10" }, beltMode: "zwischen" });
  assert.ok(!fl.plates.some((x) => /Endkappe/.test(x.name)) && Math.abs(fl.members.find((m) => m.name === "Pfosten 1").b[2] - (1000 - 42.4 - 60)) < 1e-9);
  // Treppe: Halter an jedem Pfosten, Bohrung im Handlauf desselben Zugs; Balkon reicht durch
  const t = plan("treppe", {});
  const tp = t.members.filter((m) => /Pfosten \d+$/.test(m.name)).length;
  assert.equal(t.members.filter((m) => /Handlaufhalter$/.test(m.name)).length, tp);
  const thd = t.drills.filter((d) => /^Geländer (links|rechts) Handlauf$/.test(d.target));
  assert.ok(thd.length === tp && thd.every((d) => d.d === 12.1));
  const b = plan("balkon", {});
  assert.ok(b.drills.some((d) => d.target === "Geländer Handlauf"));
  assert.equal(plan("balkon", { railHolder: false, beltMode: "zwischen" }).drills.filter((d) => /^Geländer/.test(d.target)).length, 0);
  // Spindeltreppe: jeder Stab mit Halter, Bohrung im Handlauf
  const sp = plan("spindel", {});
  const bars = sp.members.filter((m) => /^Geländerstab [\d.]+$/.test(m.name)).length;
  assert.ok(bars > 0 && sp.members.filter((m) => /Handlaufhalter$/.test(m.name)).length === bars && sp.drills.filter((d) => d.target === "Handlauf" && d.d === 12.1).length === bars);
});

test("Gurte durch die Pfosten: ein Stück bis 5800 mm, Stoß im Pfosten, Durchbrüche und Stabbohrungen mit Aufmaß", async () => {
  const g = await import("../src/core/generator.js");
  const E = (x) => Number(String(x).replace(",", "."));
  const plan = (patch) => g.GENERATORS.gelaender.plan(g.resolveGenParams("gelaender", { ...g.defaultGenerator("gelaender").params, ...patch }, E));
  const a = plan({ runs: "4800" });
  const og = a.members.filter((m) => /^Obergurt/.test(m.name)), ug = a.members.filter((m) => /^Untergurt/.test(m.name));
  assert.deepEqual([og.length, ug.length], [1, 1], "4800 mm: je ein Stück");
  assert.deepEqual([og[0].a[0], og[0].b[0]], [0, 4800], "von Pfostenmitte zu Pfostenmitte");
  // Durchbrüche im Pfosten: Ø Gurt 26,9 + 1 = 27,9; Endpfosten einseitig, dazwischen durchgehend
  const pd = a.drills.filter((d) => /^Pfosten \d+$/.test(d.target));
  assert.ok(pd.every((d) => Math.abs(d.d - 27.9) < 1e-9));
  assert.equal(pd.filter((d) => d.target === "Pfosten 1").length, 2, "Ober- und Untergurt");
  assert.ok(pd.filter((d) => d.target === "Pfosten 2").every((d) => Math.abs(d.len - (42.4 + 2)) < 1e-9), "durchgehend");
  assert.ok(pd.filter((d) => d.target === "Pfosten 1").every((d) => Math.abs(d.len - (21.2 + 1)) < 1e-9 && d.dir[0] === 1), "einseitig nach innen");
  // Stäbe: nur durch die innere Gurtwand, Ende innen an der gegenüberliegenden Wand (Rohr 26,9 × 2,3) – so weit, dass der
  // runde Stab Ø 12 die gekrümmte Innenwand nicht berührt; je Stab eine Bohrung Ø 13 in jedem Gurt, tief genug für den Bohrungsrand
  const { innerReach, entryDepth } = await import("../src/core/handlaufhalter.js");
  const bars = a.members.filter((m) => /^Stab /.test(m.name));
  const zTop = 1000 - 42.4 - 100, zBot = 100, belt = { kind: "rohr", dims: { t: 2.3 } }, reach = innerReach(belt, 26.9, 12);
  assert.ok(reach > 9 && reach < 26.9 / 2 - 2.3);
  assert.ok(bars.every((m) => Math.abs(m.a[2] - (zBot - reach)) < 1e-9 && Math.abs(m.b[2] - (zTop + reach)) < 1e-9));
  const sd = a.drills.filter((d) => /gurt/.test(d.target));
  assert.equal(sd.length, 2 * bars.length);
  assert.ok(sd.every((d) => d.d === 13 && Math.abs(d.len - (entryDepth(belt, 26.9, 13) + 2)) < 1e-9 && d.len < 26.9 / 2), "nur eine Wand");
  assert.ok(sd.filter((d) => /^Obergurt/.test(d.target)).every((d) => d.dir[2] === 1 && d.p[2] < zTop) && sd.filter((d) => /^Untergurt/.test(d.target)).every((d) => d.dir[2] === -1 && d.p[2] > zBot), "von der Füllungsseite");
  // 9000 mm: Stoß in einem Pfosten (Stücke ≤ 5800), dort durchgehender Durchbruch für beide Stücke
  const b = plan({ runs: "9000" });
  const pieces = b.members.filter((m) => /^Obergurt/.test(m.name));
  assert.equal(pieces.length, 2);
  assert.ok(pieces.every((m) => Math.abs(m.b[0] - m.a[0]) <= 5800 + 1e-6));
  assert.equal(pieces[0].b[0], pieces[1].a[0], "Stoß in Pfostenmitte");
  // Gurt zu dick für den Pfosten → Meldung am Feld
  assert.throws(() => plan({ belt: { kind: "rohr", size: "48.3x2.6" } }), (e) => e.key === "belt");
  // Vierkant-Gurt: rechteckiger Durchbruch mit Aufmaß
  const v = plan({ runs: "2000", belt: { kind: "vierkant", size: "20x2" }, post: { kind: "vierkant", size: "40x3" } });
  const vd = v.drills.find((d) => d.target === "Pfosten 1");
  assert.deepEqual([vd.w, vd.h], [21, 21]);
  // zwischen den Pfosten (ältere Features): Gurte je Feld wie bisher
  const z = plan({ runs: "2400", beltMode: "zwischen" });
  assert.equal(z.members.filter((m) => /^Obergurt/.test(m.name)).length, 2);
  assert.equal(g.genValues("gelaender", { runs: "2000" }).beltMode, "zwischen");
});

test("Geländernorm Deutschland: Höhe, Öffnungen, Leitereffekt, Boden nach Nutzung", async () => {
  const { defaultGenerator, resolveGenParams, GENERATORS } = await import("../src/core/generator.js");
  const { normRules, railingIssues } = await import("../src/core/gelaendernorm.js");
  assert.deepEqual([normRules("wohn", 3000).minH, normRules("wohn", 13000).minH, normRules("arbeit", 3000).minH, normRules("arbeit", 13000).minH, normRules("industrie", 0).minH], [900, 1100, 1000, 1100, 1100]);
  const E = (x) => Number(String(x).replace(",", "."));
  const run = (g, patch) => { const f = defaultGenerator(g); return GENERATORS[g].plan(resolveGenParams(g, { ...f.params, ...patch }, E)).issues; };
  const msg = (is) => is.map((x) => `${x.key}:${x.message}`).join(" | ");
  for (const g of ["gelaender", "treppe", "balkon", "spindel"]) assert.equal(run(g, {}).length, 0, `${g}: Standardwerte normgerecht – ${msg(run(g, {}))}`);
  assert.match(msg(run("gelaender", { height: "950", fall: "13000" })), /height:Höhe 950 mm unter 1100 mm/, "Absturzhöhe über 12 m");
  assert.match(msg(run("gelaender", { height: "950", use: "arbeit" })), /height:Höhe 950 mm unter 1000 mm \(ASR A2\.1\)/);
  assert.match(msg(run("gelaender", { fill: "quer" })), /fill:Waagrechte Füllstäbe/, "Leitereffekt im Wohnbereich");
  assert.doesNotMatch(msg(run("gelaender", { fill: "quer", use: "arbeit" })), /Waagrechte/);
  assert.match(msg(run("gelaender", { gapMax: "150" })), /gapMax:Öffnung \d+ mm über 120 mm/);
  assert.doesNotMatch(msg(run("gelaender", { gapMax: "150", use: "arbeit" })), /Öffnung/, "Arbeitsstätte: Stäbe bis 180 mm");
  assert.match(msg(run("gelaender", { bottomZ: "250" })), /bottomZ:Abstand Boden bis Unterkante Geländer \d+ mm über 120 mm/);
  assert.match(msg(run("gelaender", { use: "industrie" })), /use:Fußleiste ≥ 100 mm/);
  assert.match(msg(run("treppe", { gelUse: "wohn" })), /gelFill:Waagrechte/, "Treppe mit Knieleisten im Wohnhaus");
  assert.match(msg(run("balkon", { railH: "850" })), /railH:Höhe 850 mm unter 900 mm/);
  assert.equal(run("spindel", { height: "2222.5", steps: "14", D: "3065", angle: "22.5" }).filter((x) => /Öffnung/.test(x.message)).length, 0, "automatisch genug Stäbe je Stufe (Abstand je Teilung gerechnet)");
  assert.match(msg(run("spindel", { bars: "1" })), /post:Öffnung \d+ mm über 120 mm/, "ein Stab je Stufe reicht im Wohnhaus nicht");
  assert.match(msg(railingIssues({ use: "wohn", height: 1000, fill: "staketen", gap: 100, rail: { kind: "rohr", geom: { width: 60.3 } } }, { rail: "rail" })), /rail:Handlauf Ø 60,3 mm/);
});

test("Treppe: Knieleisten/Untergurt durch die Pfosten, Staketen durch den Gurt, Stufen nach DIN 24531 verschraubt", async () => {
  const { defaultGenerator, resolveGenParams, GENERATORS } = await import("../src/core/generator.js");
  const E = (x) => Number(String(x).replace(",", "."));
  const plan = (patch) => GENERATORS.treppe.plan(resolveGenParams("treppe", { ...defaultGenerator("treppe").params, ...patch }, E));
  const t = plan({});
  // Knieleisten je Lauf am Stück durch alle Pfosten, Durchbrüche in den Pfosten
  const kl = t.members.filter((m) => /Knieleiste/.test(m.name));
  const posts = t.members.filter((m) => /Pfosten \d+$/.test(m.name));
  assert.equal(kl.length, 2 * 2 * 2, "je Seite und Abschnitt (Lauf, Auslauf) ein Stück je Knieleiste, Stoß im Knickpfosten");
  const ph = t.drills.filter((d) => /Pfosten \d+$/.test(d.target));
  assert.ok(posts.every((m) => ph.filter((d) => d.target === m.name).length >= 2), "jeder Pfosten für beide Knieleisten durchbrochen (Knickpfosten von beiden Seiten)");
  assert.ok(ph.every((d) => Math.abs(d.d - 27.9) < 1e-9), "Knieleiste 26,9 + 1 mm Aufmaß");
  assert.match(t.info, /Knieleisten durch die Pfosten/);
  // Staketen: Untergurt durch die Pfosten, Stäbe (Rundstahl 12) durch Bohrungen im Gurt
  const st = plan({ gelFill: "staketen" });
  const belts = st.members.filter((m) => /Untergurt/.test(m.name)), stabs = st.members.filter((m) => / Stab \d+\.\d+$/.test(m.name));
  assert.ok(belts.length === 4 && stabs.length > 10, `${belts.length} ${stabs.length}`);
  assert.equal(st.drills.filter((d) => /Untergurt/.test(d.target)).length, stabs.length);
  assert.ok(st.drills.filter((d) => /Untergurt/.test(d.target)).every((d) => d.d === 13 && d.dir[2] === -1 && d.len < 26.9 / 2 / Math.cos(Math.atan(t.geo?.tanA ?? 0.7)) + 2), "nur durch die obere Gurtwand");
  assert.ok(new Set(stabs.map((m) => m.name)).size === stabs.length, "Stabnamen eindeutig");
  assert.throws(() => plan({ gelFill: "staketen", gelStab: { kind: "rohr", size: "26.9x2.3" } }), (e) => e.key === "gelStab");
  assert.throws(() => plan({ gelBar: { kind: "rohr", size: "42.4x2.6" } }), (e) => e.key === "gelBar");
  assert.equal(plan({ gelBeltMode: "zwischen" }).drills.filter((d) => /Pfosten/.test(d.target)).length, 0, "zwischen: wie bisher");
  // Stufen: Seitenbleche mit Bohrung und Langloch, Wangen je Stufe zweimal Ø 14
  const steps = t.plates.filter((p) => /^Stufe \d+$/.test(p.name)), sp = t.plates.filter((p) => /Seitenblech/.test(p.name));
  assert.equal(sp.length, 2 * steps.length);
  assert.ok(sp.every((p) => p.holes.length === 1 && p.slots.length === 1 && p.d === 14 && p.t === 5));
  assert.equal(steps[0].W, 1000 - 10, "Stufe zwischen den Seitenblechen");
  const wh = t.drills.filter((d) => /^Wange/.test(d.target) && d.d === 14); // ohne Gegenbohrungen der Pfostenbefestigung
  assert.equal(wh.length, 4 * steps.length);
  const A = t.plates.find((p) => p.name === "Stufe 1").H;
  assert.match(t.info, new RegExp(`Lochabstand ${A <= 250 ? 120 : A <= 285 ? 150 : A <= 320 ? 180 : "\\d+"} mm`));
  assert.equal(plan({ stepFix: "keine" }).plates.filter((p) => /Seitenblech/.test(p.name)).length, 0);
  assert.equal(plan({ support: "holm2" }).plates.filter((p) => /Seitenblech/.test(p.name)).length, 0, "nur bei Wangen");
});

test("Generator als Baugruppe: Einzelteile in eigener Lage, Platzierung führt zurück, gleiche Teile einmal", async () => {
  const { defaultGenerator, resolveGenParams, GENERATORS } = await import("../src/core/generator.js");
  const { planBodies, localPlan, groupParts, eulerOf } = await import("../src/core/genteil.js");
  const { placementMatrix, matApply } = await import("../src/core/geom.js");
  const E = (x) => Number(String(x).replace(",", "."));
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-4); // 0,1 µm
  for (const g of Object.keys(GENERATORS)) {
    const plan = GENERATORS[g].plan(resolveGenParams(g, defaultGenerator(g).params, E));
    const bodies = planBodies(plan);
    assert.equal(new Set(bodies.map((b) => b.key)).size, bodies.length, `${g}: Schlüssel eindeutig`);
    for (const b of bodies) {
      const lp = localPlan(plan, b), M = placementMatrix(b.frame.o, eulerOf(b.frame));
      if (b.kind === "member") {
        const m = plan.members[b.index], l = lp.members[0];
        assert.ok(near(matApply(M, l.a), m.a) && near(matApply(M, l.b), m.b), `${g} ${b.name}: Platzierung`);
        assert.ok(Math.abs(l.b[1]) < 1e-9 && Math.abs(l.b[2]) < 1e-9 && l.b[0] > 0, `${g} ${b.name}: liegt auf X`);
        // jede Bohrung liegt nach der Platzierung wieder auf einer Bohrung des Stabs (symmetrische Bohrbilder: irgendeine)
        for (const d of lp.drills) assert.ok(plan.drills.some((x) => x.target === m.name && near(matApply(M, d.p), x.p)), `${g} ${b.name}: Bohrung`);
      } else if (b.kind === "chain") {
        const c = lp.chains[0], s = c.onlySeg, w = plan.chains[b.index].points;
        assert.ok(near(matApply(M, c.points[s]), w[b.seg]) && near(matApply(M, c.points[s + 1]), w[b.seg + 1]), `${g} ${b.name}: Stück am Platz`);
      } else if (b.kind === "plate") {
        assert.ok(near(matApply(M, [0, 0, 0]), plan.plates[b.index].center), `${g} ${b.name}: Platte`);
      }
    }
    const parts = groupParts(plan);
    assert.equal(parts.reduce((n, p) => n + p.bodies.length, 0), bodies.length, `${g}: jeder Körper genau einmal eingesetzt`);
    assert.equal(new Set(parts.map((p) => p.name)).size, parts.length, `${g}: Teilenamen eindeutig`);
  }
  const zaun = groupParts(GENERATORS.zaun.plan(resolveGenParams("zaun", defaultGenerator("zaun").params, E)));
  assert.ok(zaun.find((p) => p.name === "Pfosten").bodies.length === 5, "5 gleiche Pfosten = ein Bauteil");
});
