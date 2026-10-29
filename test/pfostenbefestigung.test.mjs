// Pfostenbefestigung (docs/roadmap/pfostenbefestigung.md): Anschlussflächen, Montagerahmen, Kollision
import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../src/core/pfostenbefestigung.js";
import { sectionOf, defaultGenerator, resolveGenParams, GENERATORS } from "../src/core/generator.js";

const near = (a, b, tol = 1e-6, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} ${a} ≠ ${b}`);
const nearV = (a, b, tol = 1e-6, msg) => a.forEach((x, i) => near(x, b[i], tol, msg));
const E = (x) => Number(String(x).replace(",", "."));
// Befestigungsblech wie vor der Ausrichtung an den Stufen (160 × 160, 4 Bohrungen, Pfosten gleichmäßig verteilt)
const KLASSISCH = { gelSW: "160", gelSH: "160", gelSHoles: "4", gelSDown: "0", gelRhythm: false };
const treppe = (patch = {}, drop = []) => {
  const params = { ...defaultGenerator("treppe").params, ...patch };
  for (const k of drop) delete params[k];
  return GENERATORS.treppe.plan(resolveGenParams("treppe", params, E));
};

test("Profilflächen: U200 (UPN), Rechteckrohr, I-Profil, Winkel, Rundrohr", () => {
  const upn = M.profileFaces(sectionOf({ kind: "upn", size: "200" }));
  const fl = upn.find((f) => f.side === "+y");
  near(fl.wall, 11.5, 1e-9, "Flanschdicke");
  assert.deepEqual([fl.lo, fl.hi], [{ at: -17.5, edge: "innen" }, { at: 37.5, edge: "kante" }], "Flansch nutzbar vom Steg + Ausrundung bis zur Kante");
  assert.match(upn.find((f) => f.side === "+x").open, /offene Seite/);
  const steg = upn.find((f) => f.side === "-x");
  near(steg.wall, 8.5); near(steg.hi.at, 100 - 11.5 - 11.5);
  const rr = M.profileFaces(sectionOf({ kind: "rechteck", size: "80x40x3" }));
  assert.ok(rr.every((f) => !f.open && f.wall === 3), "Rechteckrohr: vier Wände");
  const ipe = M.profileFaces(sectionOf({ kind: "ipe", size: "200" }));
  assert.equal(ipe.filter((f) => f.open).length, 2);
  assert.equal(ipe.find((f) => f.side === "+y").exclude.length, 1, "Steg unter dem Flansch gesperrt");
  assert.equal(M.profileFaces(sectionOf({ kind: "winkel", size: "50x50x5" })).filter((f) => f.open).length, 2);
  assert.ok(M.profileFaces(sectionOf({ kind: "rohr", size: "42.4x2.6" }))[0].round);
});

test("Anschlussfläche an der U200-Wange: Oberseite = Flansch, außen offen, innen Steg", () => {
  const plan = treppe({ support: "upn", upn: { kind: "upn", size: "200" }, gelMount: "aus" });
  const w = plan.members.find((m) => m.name === "Wange rechts");
  const ax = M.memberAxes(w.a, w.b, w.up, w.rot);
  const upL = w.up;
  const top = M.memberFace(w, [0, 0, 1]);
  nearV(top.n, upL, 1e-9, "Normale senkrecht zur Wangenachse");
  assert.match(top.label, /Wange rechts \(Flansch\)/);
  near(top.wall, 11.5);
  near(top.cHi.at - top.cLo.at, 55, 1e-9, "nutzbare Flanschbreite 75 − 8,5 − 11,5");
  // Steg innen (Wange rechts liegt bei kleinem y, Stufen bei +y), offene Seite außen
  assert.throws(() => M.memberFace(w, [0, -1, 0]), /offene Seite des U-Profils/);
  const inner = M.memberFace(w, [0, 1, 0]);
  assert.match(inner.label, /Steg/);
  near(inner.wall, 8.5);
  // Ursprung der Fläche liegt eine halbe Profilhöhe über der Achse
  nearV(M.faceCoords(top, M.vec.add(w.a, M.vec.mul(upL, 100))), [0, 0, 0], 1e-9);
  nearV(top.s, ax.z, 1e-12);
});

test("Montagerahmen: Balkonpfosten auf ebener Fläche, Treppenpfosten auf geneigter Wange", () => {
  // eben: Boden z = 0, Pfosten bei (500, 0), Lauf entlang +X
  const floor = M.planeFace([0, 0, 0], [0, 0, 1], [1, 0, 0], "Boden");
  const f0 = M.mountFrame(floor, [500, 0, 800], [0, 0, 1], { along: [1, 0, 0] });
  nearV(f0.F, [500, 0, 0]); nearV(f0.x, [1, 0, 0]); nearV(f0.y, [0, 1, 0]); near(f0.tilt, 0);
  // geneigt: Oberseite der U200-Wange
  const plan = treppe({ support: "upn", upn: { kind: "upn", size: "200" }, gelMount: "aus" });
  const w = plan.members.find((m) => m.name === "Wange rechts");
  const face = M.memberFace(w, [0, 0, 1]);
  const alpha = Math.atan2(w.b[2] - w.a[2], w.b[0] - w.a[0]) / (Math.PI / 180);
  const P = [1000, face.o[1], 3000];
  const lot = M.mountFrame(face, P, [0, 0, 1], { along: [1, 0, 0] });
  near(M.faceCoords(face, lot.F)[2], 0, 1e-9, "Fußpunkt liegt auf der Fläche");
  near(lot.F[0], 1000, 1e-9, "lotrecht: Fußpunkt senkrecht unter dem Pfosten");
  near(lot.tilt, alpha, 1e-9, "Pfosten um die Treppenneigung gegen die Flächennormale gekippt");
  near(M.vec.dot(lot.x, lot.n), 0, 1e-12); nearV(lot.x, face.s, 1e-9, "Plattenlänge entlang der Wange");
  const nor = M.mountFrame(face, P, [0, 0, 1], { rule: "normal", along: [1, 0, 0] });
  nearV(nor.axis, face.n, 1e-12); near(nor.tilt, 0);
  // Drehung um die Normale und Rückrechnung
  const r = M.mountFrame(face, P, [0, 0, 1], { along: [1, 0, 0], rot: 90 });
  nearV(r.x, lot.y, 1e-9);
  const q = [12, -7, 3];
  nearV(M.toMount(lot, M.fromMount(lot, q)), q, 1e-9);
});

test("Anschlussfläche: mehrdeutig, rund, nächstes Bauteil, Platte", () => {
  const sq = sectionOf({ kind: "vierkant", size: "60x3" });
  const diag = { name: "Riegel", a: [0, 0, 0], b: [1000, 0, 0], section: sq, up: [0, 1, 1] };
  assert.throws(() => M.memberFace(diag, [0, 0, 1]), /nicht eindeutig/);
  const tube = { name: "Rohr", a: [0, 0, 0], b: [1000, 0, 0], section: sectionOf({ kind: "rohr", size: "60.3x3" }) };
  assert.throws(() => M.memberFace(tube, [0, 0, 1]), /keine ebene Anschlussfläche/);
  const a = { name: "A", a: [0, 0, 0], b: [1000, 0, 0], section: sq }, b = { name: "B", a: [0, 500, 0], b: [1000, 500, 0], section: sq };
  assert.equal(M.findMemberFace([a, b], [300, 450, 100], [0, 0, 1]).target, "B");
  assert.equal(M.findMemberFace([a, b], [300, 250, 100], [0, 0, 1], 100), null, "zu weit weg");
  const step = { name: "Stufe 3", center: [100, 200, 300], xDir: [0, 1, 0], normal: [0, 0, 1], W: 1000, H: 280, t: 30 };
  const pf = M.plateFace(step);
  nearV(pf.o, [100, 200, 330]); near(pf.cHi.at, 140); assert.equal(pf.targetKind, "plate");
});

test("Kollision der Hüllquader", () => {
  const sq = sectionOf({ kind: "vierkant", size: "40x3" });
  const post = M.memberBox({ name: "Pfosten", a: [0, 0, 0], b: [0, 0, 1000], section: sq, up: [1, 0, 0] });
  const plate = M.plateBox({ name: "Platte", center: [0, 0, -10], xDir: [1, 0, 0], normal: [0, 0, 1], W: 120, H: 120, t: 10 });
  assert.equal(M.boxesOverlap(post, plate), false, "Pfosten steht auf der Platte: Berührung ist keine Kollision");
  const sunk = M.plateBox({ name: "Platte", center: [0, 0, -5], xDir: [1, 0, 0], normal: [0, 0, 1], W: 120, H: 120, t: 10 });
  assert.equal(M.boxesOverlap(post, sunk), true);
  const tilted = M.plateBox({ name: "Schräg", center: [100, 0, 0], xDir: [Math.SQRT1_2, 0, Math.SQRT1_2], normal: [-Math.SQRT1_2, 0, Math.SQRT1_2], W: 100, H: 50, t: 5 });
  assert.equal(M.boxesOverlap(post, tilted), false);
  const plan = { members: [{ name: "Pfosten", a: [0, 0, 0], b: [0, 0, 1000], section: sq }], plates: [{ name: "Stufe", center: [0, 0, 400], xDir: [1, 0, 0], normal: [0, 0, 1], W: 300, H: 300, t: 30 }] };
  assert.deepEqual(M.collisions(sunk, plan), ["Pfosten"]);
  assert.deepEqual(M.collisions(sunk, plan, (n) => n === "Pfosten"), []);
});

const gelaender = (patch = {}) => GENERATORS.gelaender.plan(resolveGenParams("gelaender", { ...defaultGenerator("gelaender").params, ...patch }, E));
const U200 = { support: "upn", upn: { kind: "upn", size: "200" }, gelMount: "oben" };

test("Fußplatte: Bohrbild, Prüfungen in der Platte", () => {
  const cfg = { W: 70, L: 160, t: 10, dx: 0, dy: 0, holes: "2l", d: 13.5, e: 25, free: [] };
  assert.deepEqual(M.holePattern(cfg, 160, 70), [[-55, 0], [55, 0]]);
  assert.deepEqual(M.holePattern({ ...cfg, holes: "4" }, 160, 70), [[-55, -10], [55, -10], [55, 10], [-55, 10]]);
  assert.deepEqual(M.holePattern({ ...cfg, holes: "frei", free: [-40, 0, 40, 5] }, 160, 70), [[-40, 0], [40, 5]]);
  assert.throws(() => M.holePattern({ ...cfg, e: 5 }, 160, 70), /Randabstand 5 mm zu klein/);
  assert.throws(() => M.holePattern({ ...cfg, holes: "4", e: 30 }, 160, 70), /überschneiden sich/);
  // Bohrung unter dem Pfosten wird erkannt
  const floor = M.planeFace([0, 0, 0], [0, 0, 1], [1, 0, 0], "Boden");
  const post = sectionOf({ kind: "vierkant", size: "40x3" });
  const r = M.topMount({ ...cfg, holes: "frei", free: [10, 0, 60, 0] }, { name: "Pfosten 1", post, top: [0, 0, 900], along: [1, 0, 0], face: floor });
  assert.match(r.issues.map((x) => x.message).join(), /Bohrung 1 liegt unter dem Pfosten/);
  assert.ok(!/Bohrung 2/.test(r.issues.map((x) => x.message).join()));
});

test("Balkonpfosten auf ebener Fläche: Fußplatte am Boden, Pfosten steht auf der Platte", () => {
  const p = gelaender({ runs: "2500" });
  const post = p.members.find((m) => m.name === "Pfosten 1"), plate = p.plates.find((x) => x.name === "Fußplatte 1");
  nearV(post.a, [0, 0, 10]); assert.equal(post.cuts, undefined, "lotrecht auf ebener Fläche: kein Schrägschnitt");
  nearV(plate.center, [0, 0, 0]); nearV(plate.normal, [0, 0, 1]);
  assert.equal(plate.holes.length, 4);
  assert.equal(p.drills.filter((d) => /^Boden/.test(d.target || "")).length, 0, "Untergrund: keine Gegenbohrung");
  assert.match(p.info, /4 Fußplatten, geometrisch geprüft/);
  assert.match(p.info, /statisch nicht nachgewiesen/);
  // bisherige einfache Fußplatte bleibt wählbar und unverändert
  const old = gelaender({ runs: "2500", base: "fussplatte" });
  nearV(old.members.find((m) => m.name === "Pfosten 1").a, [0, 0, 10]);
  assert.equal(old.plates.filter((x) => /^Fußplatte/.test(x.name)).length, 4);
});

test("Randprofil U200 unter dem Geländer: Bohrbild auf den Flansch übertragen, zu breites Bohrbild abgelehnt", () => {
  const ok = gelaender({ runs: "3000", mTarget: "profil", oW: "70", oL: "160", oHoles: "2l", mD: "13.5", mE: "25" });
  const rand = ok.chains.find((c) => c.name === "Randprofil");
  near(rand.points[0][2], -100, 1e-9, "Oberseite des stehenden U200 auf z = 0");
  const dr = ok.drills.filter((d) => d.target === "Randprofil");
  assert.equal(dr.length, 8, "4 Pfosten × 2 Bohrungen");
  assert.ok(dr.every((d) => Math.abs(d.p[2] - 1) < 1e-9 && d.dir[2] === -1 && Math.abs(d.len - 13.5) < 1e-9), "von oben durch den 11,5 mm Flansch");
  // Mitte der Gegenbohrung = Mitte der Plattenbohrung (Plattenunterseite liegt auf der Fläche)
  const pl = ok.plates.find((x) => x.name === "Fußplatte 2");
  const holeW = pl.holes.map(([x, y]) => M.vec.add(M.vec.add(pl.center, M.vec.mul(pl.xDir, x)), M.vec.mul(M.vec.cross(pl.normal, pl.xDir), y)));
  for (const h of holeW) assert.ok(dr.some((d) => Math.hypot(d.p[0] - h[0], d.p[1] - h[1]) < 1e-9), "Bohrung übertragen");
  assert.equal(ok.issues.filter((x) => x.level === "Fehler").length, 0);
  // Standard-Platte 120 × 120 mit 4 Bohrungen passt nicht auf den 75er Flansch
  const bad = gelaender({ runs: "3000", mTarget: "profil" });
  assert.equal(bad.drills.filter((d) => d.target === "Randprofil").length, 0, "nichts verschoben, nichts übertragen");
  assert.match(bad.issues.map((x) => x.message).join("\n"), /Bohrung 1 liegt 8 mm über der Kante von Randprofil \(Flansch\)/);
  assert.match(bad.issues.map((x) => x.message).join("\n"), /trifft Rundung, Steg oder Flansch/);
  // gleiche Funktion mit Rechteckrohr statt U200 (keine Sonderlogik)
  const rr = gelaender({ runs: "3000", mTarget: "profil", mProfile: { kind: "rechteck", size: "120x80x5" }, oW: "70", oL: "160", oHoles: "2l", mD: "13.5", mE: "25" });
  assert.equal(rr.drills.filter((d) => d.target === "Randprofil").length, 8);
  near(rr.drills.find((d) => d.target === "Randprofil").len, 5 + 2, 1e-9, "durch die Rohrwand");
});

test("U200-Treppe: Fußplatte auf der geneigten Wange, Bohrbild auf die kurze Seite übertragen", () => {
  const p = treppe(U200);
  const w = p.members.find((m) => m.name === "Wange rechts"), face = M.memberFace(w, [0, 0, 1]);
  const posts = p.members.filter((m) => /^Geländer rechts Pfosten \d+$/.test(m.name));
  const onWange = posts.filter((m) => p.plates.find((x) => x.name === m.name + " Fußplatte" && M.vec.dot(x.normal, face.n) > 0.9999));
  assert.ok(onWange.length >= 4, "Pfosten auf der Wange");
  for (const m of onWange) {
    const pl = p.plates.find((x) => x.name === m.name + " Fußplatte");
    near(M.faceCoords(face, pl.center)[2], 0, 1e-9, "Platte liegt plan auf dem Flansch");
    near(M.faceCoords(face, pl.center)[1], 0, 1e-9, "mittig auf der Flanschbreite");
    near(m.a[0], m.b[0], 1e-9); near(m.a[1], m.b[1], 1e-9, "Pfosten lotrecht");
    near(M.faceCoords(face, m.a)[2], 10, 1e-9, "Pfostenfuß auf der Plattenoberseite");
    nearV(m.cuts.start[0].n, M.vec.mul(face.n, -1), 1e-12, "Fuß parallel zur Platte geschnitten");
  }
  const dr = p.drills.filter((d) => d.target === "Wange rechts" && Math.abs(M.vec.dot(d.dir, face.n) + 1) < 1e-9);
  assert.ok(dr.length >= 2 * onWange.length - 2, "Gegenbohrungen im Flansch");
  for (const d of dr) {
    const [s, c, h] = M.faceCoords(face, d.p);
    near(h, 1, 1e-9); near(c, 0, 1e-9, "Bohrung auf der Mittellinie der Platte");
    assert.ok(face.ends.every((e) => M.vec.dot(M.vec.sub(d.p, e.p), e.n) < -13.5 / 2), "innerhalb der Endschnitte der Wange");
    near(d.len, 11.5 + 2, 1e-9);
  }
  // Pfostenstellung senkrecht zur Montagefläche
  const n = treppe({ ...U200, gelMRule: "normal" });
  const m2 = n.members.find((m) => m.name === onWange[1].name);
  nearV(M.vec.norm(M.vec.sub(m2.b, m2.a)), face.n, 1e-9);
  assert.equal(m2.cuts, undefined);
});

test("Treppenwinkel und Pfostenlage ändern: Platte und Bohrbild gehen mit", () => {
  const a = treppe({ ...U200, height: "2800" }), b = treppe({ ...U200, height: "3000", steps: "16" });
  const nA = M.memberFace(a.members.find((m) => m.name === "Wange rechts"), [0, 0, 1]).n, nB = M.memberFace(b.members.find((m) => m.name === "Wange rechts"), [0, 0, 1]).n;
  assert.ok(Math.abs(nA[0] - nB[0]) > 1e-3, "andere Neigung");
  const plB = b.plates.find((x) => x.name === "Geländer rechts Pfosten 2 Fußplatte");
  nearV(plB.normal, nB, 1e-12, "Platte folgt der neuen Neigung");
  const shifted = treppe({ ...U200, gelODx: "30" });
  const p0 = a.plates.find((x) => x.name === "Geländer rechts Pfosten 2 Fußplatte"), p1 = shifted.plates.find((x) => x.name === "Geländer rechts Pfosten 2 Fußplatte");
  near(M.vec.len(M.vec.sub(p0.center, p1.center)), 30, 1e-9, "Pfosten auf der Platte versetzt → Platte 30 mm verschoben");
  const d0 = a.drills.filter((d) => d.target === "Wange rechts" && d.d === 13.5), d1 = shifted.drills.filter((d) => d.target === "Wange rechts" && d.d === 13.5);
  assert.notDeepEqual(d0.map((d) => d.p), d1.map((d) => d.p), "Gegenbohrungen gehen mit");
});

test("Bohrung nahe der Profilkante abgelehnt, Wange aus Flachstahl: kein Platz oben", () => {
  const p = treppe({ ...U200, gelODy: "25" });
  assert.match(p.issues.map((x) => x.message).join("\n"), /über der Kante von Wange rechts \(Flansch\)|Randabstand .* zur Kante von Wange rechts/);
  const f = treppe({ support: "flach", gelMount: "oben" });
  assert.match(f.issues.map((x) => x.message).join("\n"), /Wange rechts \(Seite\) – nicht übertragen/);
});

test("Bestehende Treppe und bestehendes Geländer ohne Befestigungsparameter rechnen wie bisher", async () => {
  const { genValues } = await import("../src/core/generator.js");
  assert.equal(genValues("treppe", { gel: "beide" }).gelMount, "aus");
  const p = treppe({ support: "upn", upn: { kind: "upn", size: "200" } }, ["gelMount"]);
  assert.equal(p.plates.filter((x) => /Fußplatte/.test(x.name)).length, 0);
  const post = p.members.find((m) => m.name === "Geländer rechts Pfosten 1");
  near(post.a[1], -75 - 20, 1e-9, "neben der Wange wie bisher");
  const old = gelaender({ base: "fussplatte" });
  assert.ok(!/Befestigung:/.test(old.info));
});

test("Seitliche Befestigung ohne Abstandsausgleich: Blech plan an der Wange, Pfosten liegt an, Bohrungen frei", () => {
  const p = treppe(KLASSISCH); // Standard: Flachstahl-Wange, seitlich mit Befestigungsblech
  assert.equal(p.issues.length, 0, p.issues.map((x) => x.message).join("\n"));
  const w = p.members.find((m) => m.name === "Wange rechts");
  const face = M.memberFace(w, [0, -1, 0]);
  near(face.wall, 12, 1e-9, "durch die 12-mm-Wange");
  const posts = p.members.filter((m) => /^Geländer rechts Pfosten \d+$/.test(m.name));
  const side = posts.filter((m) => p.plates.find((x) => x.name === m.name + " Befestigungsblech"));
  assert.ok(side.length >= 5);
  for (const m of side) {
    const pl = p.plates.find((x) => x.name === m.name + " Befestigungsblech");
    near(M.faceCoords(face, pl.center)[2], 0, 1e-9, "Blech liegt plan an der Wange");
    nearV(pl.normal, face.n, 1e-12);
    near(M.faceCoords(face, m.b)[2], 10 + 20, 1e-9, "Pfosten liegt mit seiner Seite am Blech an (10 + 40/2)");
    near(Math.abs(M.vec.dot(pl.xDir, [0, 0, 1])), 0, 1e-12, "Blechkanten waagrecht/senkrecht");
    near(m.a[2], pl.center[2] - 80, 1e-9, "Pfosten beginnt an der Blechunterkante");
  }
  const dr = p.drills.filter((d) => d.target === "Wange rechts" && d.d === 13.5);
  assert.equal(dr.length, 4 * side.length, "4 Gegenbohrungen je Blech");
  assert.ok(dr.every((d) => Math.abs(M.faceCoords(face, d.p)[2] - 1) < 1e-9 && Math.abs(d.len - 14) < 1e-9));
  assert.match(p.info, /Befestigungsbleche \(2 davon oben mit Fußplatte, wo kein Bauteil daneben liegt\), 2 Pfosten gerückt/);
  // zu schmales Blech: Pfosten verdeckt die Bohrungen
  const narrow = treppe({ ...KLASSISCH, gelSW: "80", gelE: "15" });
  assert.match(narrow.issues.map((x) => x.message).join(), /vom Pfosten verdeckt/);
  // UPN offen nach außen: Pfosten automatisch oben auf der Wange mit Fußplatte, Hinweis statt Pfosten ohne Befestigung
  const upn = treppe({ ...KLASSISCH, support: "upn", upn: { kind: "upn", size: "200" } });
  assert.match(upn.issues.map((x) => x.message).join(), /Wange aus U-Profil ist außen offen – Pfosten oben auf der Wange mit Fußplatte/);
  assert.equal(upn.issues.filter((x) => x.level === "Fehler").length, 0, upn.issues.map((x) => x.message).join("\n"));
  assert.ok(upn.plates.some((x) => x.name === "Geländer rechts Pfosten 1 Fußplatte"));
});

test("Treppe: Pfosten im Stufenrhythmus, Lasche zwischen den Stufenbohrungen, Muttern innen frei; alte Projekte wie bisher", () => {
  const p = treppe({});
  assert.equal(p.issues.filter((i) => i.level !== "Hinweis").length, 0, p.issues.map((x) => x.message).join("\n"));
  const holes = p.drills.filter((d) => d.target === "Wange rechts" && d.d === 14).map((d) => d.p);
  const posts = p.members.filter((m) => /^Geländer rechts Pfosten \d+$/.test(m.name));
  const inner = posts.slice(1).filter((m) => p.plates.find((x) => x.name === m.name + " Befestigungsblech") && m.a[0] < 4000);
  assert.ok(inner.length >= 3);
  // Zwischenpfosten genau mittig zwischen zwei Stufen (Stufenmitte + a/2), alle im gleichen Abstand
  const gaps = inner.slice(1).map((m, i) => m.b[0] - inner[i].b[0]);
  assert.ok(gaps.every((g) => Math.abs(g - gaps[0]) < 1e-6), JSON.stringify(gaps));
  for (const m of inner) {
    const bl = p.plates.find((x) => x.name === m.name + " Befestigungsblech");
    near(bl.W, 60, 1e-9);
    // keine Stufenbohrung unter dem Blech (mit Platz für die Scheibe)
    for (const h of holes) {
      const dx = Math.max(0, Math.abs(h[0] - bl.center[0]) - bl.W / 2), dz = Math.max(0, Math.abs(h[2] - bl.center[2]) - bl.H / 2);
      assert.ok(Math.hypot(dx, dz) >= 15 - 1e-6, `${m.name}: Stufenbohrung bei x ${h[0]} verdeckt`);
    }
    // Pfostenfuß über den Schrauben der Lasche
    assert.ok(bl.holes.every(([, y]) => m.a[2] > bl.center[2] + y + 13.5 - 1e-6));
  }
  // alte Projekte (ohne das Feld): Pfosten gleichmäßig verteilt wie bisher
  const old = treppe({}, ["gelRhythm"]);
  assert.equal(GENERATORS.treppe.schema.find((x) => x.key === "gelRhythm").missing, false);
  assert.notDeepEqual(old.members.filter((m) => /Pfosten \d+$/.test(m.name)).map((m) => m.b[0]), posts.map((m) => m.b[0]));
});

test("Geländer seitlich: an der Deckenstirn bzw. am Randprofil, Randabstand zur Deckenkante", () => {
  const s = gelaender({ runs: "2500", base: "seitlich" });
  const post = s.members.find((m) => m.name === "Pfosten 1"), bl = s.plates.find((x) => x.name === "Befestigungsblech 1");
  nearV(bl.center, [0, 31.2, -100], 1e-9, "Blech mittig auf 200 mm Deckenstirn, links der Lauflinie");
  near(post.a[2], -180, 1e-9);
  assert.equal(s.drills.length > 0 && s.drills.some((d) => d.target === "Deckenstirn"), false, "Untergrund: keine Gegenbohrung");
  // niedrige Stirn: 4 Bohrungen passen nicht, eine Reihe mittig schon; senkrechtes Paar bleibt ein Fehler
  const thin = gelaender({ runs: "2500", base: "seitlich", mSlab: "120" });
  assert.match(thin.issues.map((x) => x.message).join(), /Deckenstirn zu niedrig für 4 Bohrungen – 2 Bohrungen in einer Reihe mittig/);
  assert.equal(thin.issues.filter((x) => x.level === "Fehler").length, 0);
  assert.ok(thin.plates.find((x) => x.name === "Befestigungsblech 1").holes.every(([, y]) => y === 0));
  const q = gelaender({ runs: "2500", base: "seitlich", mSlab: "120", sHoles: "2q" });
  assert.match(q.issues.map((x) => x.message).join(), /Randabstand .* Deckenstirn|über der Kante von Deckenstirn/);
  const rp = gelaender({ runs: "2500", base: "seitlich", mTarget: "profil" });
  const rand = rp.chains.find((c) => c.name === "Randprofil");
  near(rand.points[0][1], 31.2 + 37.5, 1e-9, "U200 links, Steg zum Pfosten");
  assert.equal(rp.drills.filter((d) => d.target === "Randprofil").length, 4 * 4, "4 Pfosten × 4 Bohrungen");
  assert.ok(rp.drills.filter((d) => d.target === "Randprofil").every((d) => Math.abs(d.len - 10.5) < 1e-9), "durch den 8,5-mm-Steg");
});

test("Abstandsausgleich: Flacheisen durch Schlitz im Pfosten, Stecknasen in Steckschlitzen des Blechs, eine Passungsregel", () => {
  assert.deepEqual(M.steckPassung(15, 10, 0.5), { w: 16, t: 11 });
  const tl = M.tabCenters(60, 2, 15, 5);
  assert.deepEqual(tl.centers, [-12.5, 12.5]);
  assert.match(M.tabCenters(60, 4, 20, 5).error, /passen nicht in 60 mm/);
  const base = treppe(KLASSISCH);
  const p = treppe({ ...KLASSISCH, gelMSpacer: true, gelMGap: "60" });
  const post = (q) => q.members.find((m) => m.name === "Geländer rechts Pfosten 1");
  const w = p.members.find((m) => m.name === "Wange rechts"), face = M.memberFace(w, [0, -1, 0]);
  // Pfosten rückt um den Abstand von der Wange weg, Achse unverändert parallel
  near(M.faceCoords(face, post(p).b)[2] - M.faceCoords(face, post(base).b)[2], 60, 1e-6, "Pfosten 60 mm weiter außen");
  const fl = p.plates.find((x) => x.name === "Geländer rechts Pfosten 1 Flacheisen");
  const bl = p.plates.find((x) => x.name === "Geländer rechts Pfosten 1 Befestigungsblech");
  assert.ok(fl && bl);
  near(fl.H, 60, 1e-9, "Flacheisen 60 breit");
  near(fl.t, 10, 1e-9);
  nearV(fl.xDir, face.n, 1e-9, "Flacheisen läuft vom Blech zum Pfosten");
  // Länge = Blechdicke (Nase) + Abstand + Einstecktiefe (Pfostentiefe − Wand − Spiel)
  const pd = post(p).section.geom.width, wall = post(p).section.dims.t;
  near(fl.W, 10 + 60 + (pd - wall - 0.2), 1e-6, "Länge mit Nase und Einstecktiefe");
  // Stecknasen: 2 × 15 mm, Steckschlitze im Blech je 10,4 × 15,4 (Spiel 0,2), Kontur geschlossen ohne Überkreuzung
  assert.equal(bl.rects.length, 2);
  assert.ok(bl.rects.every(([, , rw, rh]) => Math.abs(rw - 10.4) < 1e-9 && Math.abs(rh - 15.4) < 1e-9));
  const ys = fl.poly.filter(([x]) => x === -10).map(([, y]) => y);
  assert.deepEqual(ys, [...ys].sort((a, b) => a - b), "Nasen in Konturreihenfolge");
  // Schlitz im Pfosten: Flacheisen + 2 × Spiel, nur durch die nahe Wand
  const sl = p.drills.find((d) => d.target === "Geländer rechts Pfosten 1" && d.w);
  near(sl.w, 10.4, 1e-9);
  near(sl.h, 60.4, 1e-9);
  near(sl.len, wall + 2, 1e-9);
  assert.equal(p.issues.filter((i) => i.level === "Fehler").length, 0, p.issues.map((i) => i.message).join("\n"));
  assert.match(p.info, /mit Flacheisen \(Stecknasen sichern nur die Lage/);
  // Abstand über dem Höchstmaß, zu viele Nasen, zu enger Schlitz, Abstand ohne Ausgleich
  const msg = (q) => q.issues.map((i) => i.message).join("\n");
  assert.match(msg(treppe({ ...KLASSISCH, gelMSpacer: true, gelMGap: "200" })), /über dem Höchstmaß 150 mm/);
  assert.match(msg(treppe({ ...KLASSISCH, gelMSpacer: true, gelMTabs: "4", gelMTabW: "20" })), /Stecknasen: 4 Stecknasen/);
  assert.match(msg(treppe({ ...KLASSISCH, gelMSpacer: true, gelMSlotW: "9" })), /passt nicht in den Schlitz 9 mm/);
  assert.match(msg(treppe({ ...KLASSISCH, gelMSpacer: true, gelMSlotW: "14" })), /Schlitz 14 mm für Flacheisen 10 mm/);
  // Geländer an der Deckenstirn mit Flacheisen
  const g = gelaender({ runs: "2500", base: "seitlich", mSpacer: true });
  assert.equal(g.plates.filter((x) => /Flacheisen/.test(x.name)).length, 4);
  assert.equal(g.issues.filter((i) => i.level === "Fehler").length, 0, msg(g));
});

test("Podestecken L/U: Futterblech gegen die Luft hinter der Wangenflucht, Blech am Rahmenende verlängert, eine Bohrreihe am niedrigen Rahmen", () => {
  for (const turn of ["links", "rechts"]) {
    const p = treppe({ ...KLASSISCH, form: "L", turn });
    assert.equal(p.issues.filter((i) => i.level !== "Hinweis").length, 0, `L ${turn}: ` + p.issues.map((i) => i.message).join("\n"));
  }
  const p = treppe({ ...KLASSISCH, form: "L" });
  const get = (n) => p.plates.find((x) => x.name === `Geländer rechts Pfosten ${n}`);
  // Eckpfosten: Blech zum Rahmen hin verlängert, beide Bohrungen auf dem Rahmen (Ende bei x = 2960), Pfosten ganz auf dem Blech
  const bl = get("4 Befestigungsblech"), post = p.members.find((m) => m.name === "Geländer rechts Pfosten 4");
  assert.ok(bl.W > 160);
  const x = (h) => bl.center[0] + h[0] * bl.xDir[0];
  assert.ok(bl.holes.every((h) => x(h) < 2960 - 20), JSON.stringify(bl.holes.map(x)));
  assert.ok(Math.abs(post.b[0] - bl.center[0]) + 20 <= bl.W / 2 + 1e-6, "Pfosten liegt ganz auf dem Blech");
  assert.equal(bl.holes.length, 2, "Rahmen 100 hoch: eine Reihe mittig");
  // Futterblech füllt die 12 mm zwischen Rahmen und Blech, gleiche Bohrungen
  const fu = get("4 Futterblech");
  near(fu.t, 12, 1e-6);
  near(fu.center[1], 0, 1e-9, "Futterblech an der Rahmenaußenseite");
  near(bl.center[1], -12, 1e-6, "Blech davor am Pfosten");
  assert.deepEqual(fu.holes, bl.holes);
  assert.match(p.info, /2 mit Futterblech, 1 zum Bauteil hin verlängert/);
  // Futterblech abschaltbar: dann wieder Fehler wegen Luft
  assert.match(treppe({ ...KLASSISCH, form: "L", gelMShim: "0" }).issues.map((i) => i.message).join(), /12 mm Luft zwischen Pfosten und Blech/);
});

test("Ausweichen: oben → seitlich, wo die Fußplatte nicht aufliegt (Podest neben der U200-Flucht); seitlich → oben mitten auf dem Podest", () => {
  const u = treppe({ ...KLASSISCH, form: "L", support: "upn", upn: { kind: "upn", size: "200" }, gelMount: "oben" });
  assert.equal(u.issues.filter((i) => i.level === "Fehler").length, 0, u.issues.map((i) => i.message).join("\n"));
  assert.ok(u.plates.some((x) => x.name === "Geländer rechts Pfosten 5 Befestigungsblech"));
  assert.match(u.info, /2 davon seitlich mit Befestigungsblech, wo die Fußplatte nicht aufliegt/);
  // U: inneres Geländer läuft übers Podest – der Pfosten dort bekommt eine Fußplatte auf dem Podestbelag
  const U = treppe({ ...KLASSISCH, form: "U" });
  const fp = U.plates.find((x) => x.name === "Geländer links Pfosten 4 Fußplatte");
  assert.ok(fp, "Fußplatte mitten auf dem Podest");
  assert.ok(U.plates.find((x) => x.name === "Podest").holes?.length > 0, "Gegenbohrungen im Podestbelag");
  // Pfosten vor der Stirnseite des Podestrahmens: an das Blech herangerückt
  const st = U.members.find((m) => m.name === "Geländer links Pfosten 3"), sb = U.plates.find((x) => x.name === "Geländer links Pfosten 3 Befestigungsblech");
  near(sb.center[0] - 10 - st.b[0], 20, 1e-6, "Pfosten liegt am Blech an der Rahmenstirn");
});

test("Holmtreppe oben: Pfosten rücken auf die Stufen, Fußplatte ganz auf der Stufe, Bohrungen in die Stufe", () => {
  const h = treppe({ support: "holm2", gelMount: "oben" });
  assert.equal(h.issues.filter((i) => i.level === "Fehler").length, 0, h.issues.map((i) => i.message).join("\n"));
  const steps = h.plates.filter((x) => /^Stufe \d+$/.test(x.name));
  for (const fp of h.plates.filter((x) => /rechts Pfosten \d+ Fußplatte$/.test(x.name))) {
    const on = steps.find((s) => Math.abs(fp.center[0] - s.center[0]) + fp.W / 2 <= s.H / 2 + 1e-6 && Math.abs(fp.center[2] - s.center[2] - s.t) < 1);
    assert.ok(on || Math.abs(fp.center[2] - 2800) < 1, `${fp.name} liegt ganz auf einer Stufe bzw. Boden/Decke`);
  }
  assert.ok(steps.some((s) => s.holes?.length), "Gegenbohrungen in den Stufen");
  assert.match(h.info, /Pfosten gerückt, damit die Platte ganz auf dem Bauteil liegt/);
});

test("Balkon: oben auf dem Belag mit Bohrungen auch im Rahmen, seitlich an der Rahmenaußenseite, alte Projekte mit einfacher Fußplatte", () => {
  const balkon = (patch = {}, drop = []) => {
    const params = { ...defaultGenerator("balkon").params, ...patch };
    for (const k of drop) delete params[k];
    return GENERATORS.balkon.plan(resolveGenParams("balkon", params, E));
  };
  const b = balkon();
  assert.equal(b.issues.length, 0, b.issues.map((i) => i.message).join("\n"));
  const belag = b.plates.find((x) => x.name === "Belag");
  assert.equal(belag.holes.length, 16);
  const rd = b.drills.filter((d) => d.target === "Rahmen");
  assert.equal(rd.length, 16, "jede Belagbohrung auch im Rahmen darunter");
  assert.ok(rd.every((d) => Math.abs(d.p[2] - (2800 - 30 + 1)) < 1e-6 && d.dir[2] === -1), "von der Rahmenoberseite (unter dem 30-mm-Belag) nach unten");
  assert.match(b.info, /4 zum Bauteil hin verlängert/);
  // seitlich: Pfosten außen vor dem Rahmen, Blech an der Außenseite, Gegenbohrungen im Rahmen
  const s = balkon({ railMount: "seitlich" });
  assert.equal(s.issues.filter((i) => i.level !== "Hinweis").length, 0, s.issues.map((i) => i.message).join("\n"));
  const p1 = s.members.find((m) => m.name === "Geländer Pfosten 2"), bl = s.plates.find((x) => x.name === "Geländer Befestigungsblech 2");
  near(bl.center[0], 0, 1e-6, "Blech an der Rahmenaußenseite x = 0");
  near(p1.b[0], -10 - 20, 1e-6, "Pfosten liegt am Blech an");
  assert.equal(s.drills.filter((d) => d.target === "Rahmen").length, 16);
  // UPN-Rahmen offen nach außen: verständlicher Fehler am Feld »Pfostenbefestigung«
  assert.throws(() => balkon({ railMount: "seitlich", frame: { kind: "upn", size: "160" } }), (e) => e.key === "railMount" && /offene Seite/.test(e.message));
  // alte Projekte: ohne railMount einfache Fußplatte auf dem Belag wie bisher, keine Bohrungen im Tragwerk
  const old = balkon({ inset: "60" }, ["railMount"]);
  assert.equal(old.drills.filter((d) => !/^Geländer/.test(d.target)).length, 0);
  assert.ok(old.plates.filter((x) => /^Geländer Fußplatte/.test(x.name)).every((x) => x.W === x.H));
});

test("Spindeltreppe: Fußplatte je Geländerstab auf der Stufe, entlang der Tangente, Bohrungen in die Stufe; alte Projekte geschweißt", () => {
  const sp = (patch = {}) => GENERATORS.spindel.plan(resolveGenParams("spindel", { ...defaultGenerator("spindel").params, ...patch }, E));
  const base = sp();
  assert.ok(!base.plates.some((x) => / Fußplatte$/.test(x.name)), "Vorgabe: Stäbe auf die Stufe geschweißt wie bisher");
  const s = sp({ stabMount: "oben" });
  assert.equal(s.issues.length, 0, s.issues.map((i) => i.message).join("\n"));
  const bars = s.members.filter((m) => /^Geländerstab [\d.]+$/.test(m.name));
  const fps = s.plates.filter((x) => / Fußplatte$/.test(x.name));
  assert.equal(fps.length, bars.length);
  const m = bars[0], fp = s.plates.find((x) => x.name === `${m.name} Fußplatte`), st = s.plates.find((x) => x.name === "Stufe 1");
  near(m.a[2], st.center[2] + st.t + 6, 1e-6, "Stab steht auf der 6-mm-Fußplatte auf der Stufe");
  const radial = [m.a[0], m.a[1]].map((x) => x / Math.hypot(m.a[0], m.a[1]));
  near(Math.abs(fp.xDir[0] * radial[0] + fp.xDir[1] * radial[1]), 0, 1e-9, "Platte entlang der Tangente");
  assert.equal(st.holes.length, 2 * bars.filter((b) => /^Geländerstab 1(\.\d)?$/.test(b.name)).length, "2 Bohrungen je Stab in Stufe 1");
  assert.match(s.info, /Befestigung: \d+ Fußplatten, \d+ Gegenbohrungen übertragen, geometrisch geprüft/);
});

test("Einzelne Pfosten abweichend: aus, andere Art, Seite, verständlicher Fehler", () => {
  assert.deepEqual(M.parseOverrides("4 aus; rechts 5 7 oben"), [{ words: [], nums: ["4"], kind: "aus" }, { words: ["rechts"], nums: ["5", "7"], kind: "oben" }]);
  assert.equal(M.overrideFor(M.parseOverrides("rechts 5 oben"), "Geländer rechts Pfosten 5"), "oben");
  assert.equal(M.overrideFor(M.parseOverrides("rechts 5 oben"), "Geländer links Pfosten 5"), null);
  assert.equal(M.overrideFor(M.parseOverrides("3 aus"), "Geländerstab 3.2"), "aus");
  assert.equal(M.overrideFor(M.parseOverrides("1 aus"), "Pfosten 11"), null);
  assert.throws(() => treppe({ gelMPer: "4 weg" }), (e) => e.key === "gelMPer" && /oben, seitlich oder aus/.test(e.message));
  // Treppe: Pfosten 2 rechts ohne Befestigung, alle anderen unverändert
  const base = treppe(), t = treppe({ gelMPer: "rechts 2 aus" });
  assert.ok(!t.plates.some((x) => x.name === "Geländer rechts Pfosten 2 Befestigungsblech"));
  assert.ok(t.plates.some((x) => x.name === "Geländer links Pfosten 2 Befestigungsblech"));
  assert.equal(t.plates.filter((x) => / Befestigungsblech$/.test(x.name)).length, base.plates.filter((x) => / Befestigungsblech$/.test(x.name)).length - 1);
  // Geländer: Pfosten 1 ohne Fußplatte (steht auf z = 0), der Rest oben auf dem Boden
  const g = gelaender({ runs: "2500", mPer: "1 aus" });
  assert.ok(!g.plates.some((x) => x.name === "Fußplatte 1") && g.plates.some((x) => x.name === "Fußplatte 2"));
  near(g.members.find((m) => m.name === "Pfosten 1").a[2], 0, 1e-9);
});

test("Spindeltreppe: Stab mit Fußplatte liegt wie geprüft (entlang der Tangente), »seitlich« abgelehnt", () => {
  const sp = (patch = {}) => GENERATORS.spindel.plan(resolveGenParams("spindel", { ...defaultGenerator("spindel").params, ...patch }, E));
  const s = sp({ stabMount: "oben", post: { kind: "rechteck", size: "80x40x3" }, stabOL: "100" });
  const m = s.members.find((x) => /^Geländerstab 1(\.1)?$/.test(x.name)), fp = s.plates.find((x) => x.name === `${m.name} Fußplatte`);
  nearV(m.up, fp.xDir, 1e-9, "Stab und Fußplatte gleich ausgerichtet");
  assert.doesNotMatch(s.issues.map((i) => i.message).join(), /unter dem Pfosten/, "40 entlang der Tangente: Bohrungen bei ± 38 frei, so wie der Stab gebaut wird");
  assert.throws(() => sp({ stabMount: "oben", stabMPer: "2 seitlich" }), (e) => e.key === "stabMPer");
});

test("Treppe: letzter Laufpfosten vor dem Auslauf zurückgerückt – Knieleisten bzw. Untergurt knicken im Pfosten ohne Höhensprung", () => {
  for (const patch of [{}, { gelBeltMode: "zwischen" }, { gelFill: "staketen" }, { gelFill: "staketen", gelBeltMode: "zwischen" }, { gelMount: "oben" }]) {
    const p = treppe({ gelPost: { kind: "rohr", size: "48.3x2.6" }, ...patch });
    const bars = p.members.filter((m) => /^Geländer links (Knieleiste|Untergurt) /.test(m.name));
    const flat = bars.filter((m) => Math.abs(m.a[2] - m.b[2]) < 1e-6 && Math.abs(m.a[0] - m.b[0]) > 1);
    assert.ok(flat.length, JSON.stringify(patch));
    for (const f of flat) {
      // das schräge Stück endet am gleichen Punkt, an dem das waagrechte beginnt
      const slope = bars.find((m) => m.b[2] > m.a[2] + 1 && Math.abs(m.b[0] - f.a[0]) < 60 && Math.abs(m.b[2] - f.a[2]) < 60);
      assert.ok(slope, `${JSON.stringify(patch)}: ${f.name} ohne schrägen Anschluss`);
      if (!/zwischen/.test(JSON.stringify(patch))) nearV(slope.b, f.a, 1e-6, `${JSON.stringify(patch)} ${f.name}`);
      else { // zwischen den Pfosten: beide Achsen treffen sich in der Pfostenmitte
        const c = (slope.b[0] + f.a[0]) / 2;
        near(slope.b[2] + (c - slope.b[0]) * (slope.b[2] - slope.a[2]) / (slope.b[0] - slope.a[0]), f.a[2], 1e-6, `${JSON.stringify(patch)} ${f.name}`);
      }
    }
  }
});
