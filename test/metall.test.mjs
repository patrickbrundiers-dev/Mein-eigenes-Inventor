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
  const plan = (patch) => GENERATORS.gelaender.plan(resolveGenParams("gelaender", { ...f.params, ...patch }, E));
  const p1 = plan({ runs: "2500" });
  assert.equal(p1.members.filter((m) => /^Pfosten/.test(m.name)).length, 4, "2500 / 1200 → 3 Felder, 4 Pfosten");
  const bars = p1.members.filter((m) => /^Stab 1\./.test(m.name)).map((m) => m.a[0]).sort((a, b) => a - b);
  const gaps = [bars[0] - 6 - 20, ...bars.slice(1).map((x, i) => x - bars[i] - 12), 2500 / 3 - 20 - bars[bars.length - 1] - 6];
  assert.ok(gaps.every((g) => g <= 110 + 1e-9 && g > 0), "alle Öffnungen ≤ 110 mm: " + gaps.map((g) => g.toFixed(1)));
  assert.ok(Math.max(...gaps) - Math.min(...gaps) < 1e-6, "gleichmäßig verteilt");
  assert.equal(p1.plates.length, 4, "Fußplatten");
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
