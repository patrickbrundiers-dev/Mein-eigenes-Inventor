// Pfostenbefestigung (docs/roadmap/pfostenbefestigung.md): Anschlussflächen, Montagerahmen, Kollision
import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../src/core/pfostenbefestigung.js";
import { sectionOf, defaultGenerator, resolveGenParams, GENERATORS } from "../src/core/generator.js";

const near = (a, b, tol = 1e-6, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} ${a} ≠ ${b}`);
const nearV = (a, b, tol = 1e-6, msg) => a.forEach((x, i) => near(x, b[i], tol, msg));
const E = (x) => Number(String(x).replace(",", "."));
const treppe = (patch = {}) => GENERATORS.treppe.plan(resolveGenParams("treppe", { ...defaultGenerator("treppe").params, ...patch }, E));

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
  const plan = treppe({ support: "upn", upn: { kind: "upn", size: "200" } });
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
  const plan = treppe({ support: "upn", upn: { kind: "upn", size: "200" } });
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
  const ok = gelaender({ runs: "3000", mTarget: "profil", oW: "70", oL: "160", mHoles: "2l", mD: "13.5", mE: "25" });
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
  const rr = gelaender({ runs: "3000", mTarget: "profil", mProfile: { kind: "rechteck", size: "120x80x5" }, oW: "70", oL: "160", mHoles: "2l", mD: "13.5", mE: "25" });
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
    assert.ok(s > face.sRange[0] && s < face.sRange[1]);
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
  const p = treppe({ support: "upn", upn: { kind: "upn", size: "200" } });
  assert.equal(p.plates.filter((x) => /Fußplatte/.test(x.name)).length, 0);
  const post = p.members.find((m) => m.name === "Geländer rechts Pfosten 1");
  near(post.a[1], -75 - 20, 1e-9, "neben der Wange wie bisher");
  const old = gelaender({ base: "fussplatte" });
  assert.ok(!/Befestigung:/.test(old.info));
});
