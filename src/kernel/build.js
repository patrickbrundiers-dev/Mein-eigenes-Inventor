// Feature-basierter Modellaufbau auf Basis von replicad (OpenCascade).
// Wird im Web-Worker (App) und in Node (Tests) verwendet: createKernel(replicadModul)

import { evaluate, resolveParams } from "../core/expr.js";
import { solveSketch } from "../core/solver.js";
import { extractProfiles, holeCenters, sketchLines } from "../core/sketch.js";
import { partTextVars } from "../core/schrift.js";
import { planeFrame, toWorld, v3, decomposePlacement } from "../core/geom.js";
import { beadSection, filletPair } from "../core/schweissbaugruppe.js";
import { parseSections, shaftProfile, gearData, gearOutline, bearingGeometry, bearingDesignation, springData, springDesignation } from "../core/assistent.js";
import { resolveDatums, resolvePlane, mirrorPlane, patternAxis, datumSummary } from "../core/datums.js";
import { planeOf, axisOf, validateCombine, thickenSpan, validateDraft } from "../core/koerper.js";
import { capPlan, trimPlan } from "../core/rahmen.js";
import { pathChain, reverseChain, pathLength as chainLength, pathPatternStations, coilParams, loopCentroid, validateLoft } from "../core/formen.js";
import { sectionGeometry, sectionName, profileId, THREADS, loopLength } from "../core/sections.js";
import { parseSvgPath, flattenPaths } from "../core/svgpath.js";
import { planKnickrahmen, knickInput } from "../core/knickrahmen.js";
import { planTubeCuts, contourPolyline, atEnd as openAtEnd } from "../core/tubecuts.js";
import { endCutEdge, endCutSupported, featureCutSettings } from "../core/endcut.js";
import { resolvePathPoints, pathSegments, pathLength, upFor, UP_AXES } from "../core/profilzug.js";
import { planBends, BIEGEROHR_SECTIONS } from "../core/biegerohr.js";
import { checkRegel, REGEL_KINDS } from "../core/regelkoerper.js";
import { kantteilOutline, planKantteil, splitList } from "../core/blech.js";
import { toAxis, rollSide, gapAngle, rollAngle, rollFlat } from "../core/konturwalzen.js";
import { clampStack, boltStack, boltHoles } from "../core/schraubverbindung.js";
import { planSheet, contourLegs, punchOutline, SHEET_FEATURES } from "../core/blechplus.js";
import { path3d } from "../core/ableiten.js";
import { applyRules } from "../core/regeln.js";
import { bendRule, ruleSummary } from "../core/bendtable.js";
import { pathAxes, pathPoint, pathLength as tubeLength, pathDistance, bendRadius, splitPath } from "../core/biegeteil.js";
import { effectiveSheet } from "../core/blechregeln.js";
import { planBlechkasten, boxFromBody, boxSideFrame } from "../core/blechkasten.js";
import { NORM_THREADS, NORM_KINDS, checkNorm, normDesignation, normDensity, threadLength4014, turnbuckleDims, boltSizeForHole, boltSet, beschlagDims } from "../core/normteile.js";
import { platePlan, ribPlan, RIB_SIDES } from "../core/anschluss.js";
import { WELD_KINDS } from "../core/weld.js";
import { GENERATORS, resolveGenParams } from "../core/generator.js";
import { gestellPlan } from "../core/gestell.js";
import { planBodies, localPlan } from "../core/genteil.js";
import { FILL_DENSITY } from "../core/mass.js";
import { activeCount } from "../core/bauteilende.js";
import { tabLayout, wallFromDepths, slotSize } from "../core/stecksystem.js";

const BIG = 20000;

export function errorText(e, R) {
  if (!e) return "Unbekannter Fehler";
  if (typeof WebAssembly !== "undefined" && WebAssembly.Exception && e instanceof WebAssembly.Exception) {
    try {
      const oc = R && R.getOC && R.getOC();
      if (oc && oc.getExceptionMessage) { const m = oc.getExceptionMessage(e); if (m) return "Geometrie-Fehler: " + (Array.isArray(m) ? m.join(" ") : m); }
    } catch { /* ignore */ }
    return "Geometrie konnte nicht berechnet werden (Maße/Radien prüfen)";
  }
  if (typeof e === "number") return "Geometrie konnte nicht berechnet werden (Code " + e + ")";
  return e.message || String(e);
}

const tuple = (p) => (p && typeof p.toTuple === "function" ? p.toTuple() : Array.isArray(p) ? p : [p.x, p.y, p.z]);
const hashOf = (s) => (typeof s.hashCode === "function" ? s.hashCode() : s.hashCode);

/** FNV-1a 53 bit */
export function hashString(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function createKernel(R) {
  // ---------- 2D -> replicad ----------
  function loopToDrawing(loop) {
    if (loop.kind === "circle") return R.drawCircle(loop.r).translate(loop.c[0], loop.c[1]);
    if (loop.kind === "ellipse") { // OpenCascade verlangt Haupt- ≥ Nebenradius
      const swap = loop.b > loop.a;
      const deg = (loop.rot * 180) / Math.PI + (swap ? 90 : 0);
      return R.drawEllipse(Math.max(loop.a, loop.b), Math.min(loop.a, loop.b)).rotate(deg, [0, 0]).translate(loop.c[0], loop.c[1]);
    }
    let pen = R.draw(loop.start);
    for (const s of loop.segs) pen = s.t === "line" ? pen.lineTo(s.to) : s.t === "bez" ? pen.cubicBezierCurveTo(s.to, s.c1, s.c2) : pen.threePointsArcTo(s.to, s.mid);
    return pen.close();
  }
  function regionToDrawing(region) {
    let d = loopToDrawing(region.outer);
    for (const h of region.holes) d = d.cut(loopToDrawing(h));
    return d;
  }
  const makePlane = (fr) => new R.Plane(fr.origin, fr.xDir, fr.normal);
  /** Querschnitt eines Stabs aus seinen Metadaten (Profilart und Maße beim Erzeugen) */
  const sectionGeometryOf = (meta) => {
    if (!meta?.sec) throw new Error("Querschnitt des Stabs unbekannt");
    return sectionGeometry(meta.sec.kind, meta.sec.dims);
  };
  /** Geschlossene Kontur als Draht in Weltkoordinaten (Profil für Sweeping und Spirale) */
  const loopWire = (loop, frame) => loopToDrawing(loop).sketchOnPlane(makePlane(frame)).wire;
  /** Eckpunkte einer Kontur (für den Schwerpunkt; Bögen über ihren Mittelpunkt angenähert) */
  function loopPoints(loop) {
    if (loop.kind === "circle" || loop.kind === "ellipse") return [loop.c];
    const out = [loop.start];
    for (const sg of loop.segs) { if (sg.mid) out.push(sg.mid); out.push(sg.to); }
    return out;
  }
  const vecOf = (p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]);
  /** Pfad (Kette aus Linien und Bögen) als Draht in Weltkoordinaten */
  const MIRROR_N = { YZ: [1, 0, 0], XZ: [0, 1, 0], XY: [0, 0, 1] };
  /** Draht einer 3D-Skizze */
  function path3dWire(p) {
    return R.assembleWire(p.pieces.map((q) => (q.t === "line" ? R.makeLine(q.a, q.b) : R.makeThreePointArc(q.a, q.m, q.b))));
  }
  /** Punkte zum Anzeigen einer 3D-Skizze (Bögen in Stücken) */
  function samplePath(p) {
    const out = [];
    for (const q of p.pieces) {
      if (q.t === "line") { if (!out.length) out.push(q.a); out.push(q.b); continue; }
      if (!out.length) out.push(q.a);
      for (let k = 1; k <= 8; k++) { const u = k / 8; out.push([0, 1, 2].map((j) => (1 - u) * (1 - u) * q.a[j] + 2 * u * (1 - u) * (2 * q.m[j] - (q.a[j] + q.b[j]) / 2) + u * u * q.b[j])); }
    }
    return out;
  }
  function chainWire(chain, frame) {
    const W = (q) => toWorld(frame, q[0], q[1]);
    return R.assembleWire(chain.pieces.map((p) => (p.t === "line" ? R.makeLine(W(p.a), W(p.b)) : R.makeThreePointArc(W(p.a), W(p.m), W(p.b)))));
  }
  /** Drehachse einer Skizze: x/y der Skizzenebene oder eine (Konstruktions-)Linie */
  function sketchAxis(s, axis) {
    if (axis === "x" || axis === "y" || !axis) return { origin: s.frame.origin, dir: axis === "x" ? s.frame.xDir : s.frame.yDir };
    const ln = sketchLines(s.sketch, { includeConstruction: true }).find((l) => l.id === axis);
    if (!ln) throw new Error("Achse fehlt");
    const origin = toWorld(s.frame, ln.a[0], ln.a[1]);
    return { origin, dir: v3.sub(toWorld(s.frame, ln.b[0], ln.b[1]), origin) };
  }

  function extrudeRegions(regions, frame, startOffset, length) {
    if (!regions.length) throw new Error("Keine geschlossene Kontur in der Skizze");
    const fr = { ...frame, origin: v3.add(frame.origin, v3.mul(frame.normal, startOffset)) };
    let out = null;
    for (const reg of regions) {
      const solid = regionToDrawing(reg).sketchOnPlane(makePlane(fr)).extrude(length);
      out = out ? out.fuse(solid) : solid;
    }
    return out;
  }

  // Halbraum (großer Quader), der alles auf der Seite +n des Punktes p umfasst
  function halfSpace(p, n, size) {
    n = v3.norm(n);
    let box = R.makeBaseBox(size, size, size); // z: 0..size, zentriert in x/y
    const z = [0, 0, 1];
    const axis = v3.cross(z, n);
    const s = v3.len(axis), c = v3.dot(z, n);
    if (s > 1e-12) box = box.rotate((Math.atan2(s, c) * 180) / Math.PI, [0, 0, 0], axis);
    else if (c < 0) box = box.rotate(180, [0, 0, 0], [1, 0, 0]);
    return box.translate(p);
  }

  /**
   * Stab mit Enden in 2D oder 3D (Rohr-Editor), für Profile und Rahmen gleich. 2D und 3D über der Winkelkorrektur
   * werden als eigener Werkzeugkörper geschnitten, 3D innerhalb der Grenze bleibt der ebene Schnitt. Nur Enden mit
   * genau einem Schnitt (Gehrung/Schrägschnitt); Rechtwinklige Enden sind in 2D und 3D gleich.
   * cut = { mode: "2D" | "3D", swivel }. Ergebnis: { solid, geom, ends: {A, B} (Art je geschnittenem Ende), notes }
   */
  function memberWithEnds(section, L, fr, cuts, cut, opts = {}) {
    const dims = section.dims, g0 = sectionGeometry(section.kind, dims);
    const special = [], notes = [], ends = { A: "", B: "" };
    cuts = { start: [...cuts.start], end: [...cuts.end] };
    const supported = endCutSupported(section.kind, { t: dims.t, r: dims.r ?? 0 });
    for (const [key, list, label] of [["A", "start", "Ende A"], ["B", "end", "Ende B"]]) {
      if (cuts[list].length !== 1) continue;
      const c = cuts[list][0];
      const zn = v3.dot(fr.z, v3.norm(c.n));
      if (Math.abs(Math.abs(zn) - 1) < 1e-9) continue; // rechtwinklig
      if (!supported) {
        if (cut.mode === "2D" && ["rohr", "vierkant", "rechteck"].includes(section.kind)) notes.push(`${label}: 2D-Schnitt braucht einen Eckradius ≥ Wand + 0,6 mm – eben geschnitten`);
        continue;
      }
      ends[key] = cut.mode;
      const plane = { z0: v3.dot(v3.sub(c.p, fr.origin), c.n) / v3.dot(fr.z, c.n), cu: -v3.dot(fr.u, c.n) / v3.dot(fr.z, c.n), cv: -v3.dot(fr.v, c.n) / v3.dot(fr.z, c.n) };
      const edge = endCutEdge(section.kind, { W: g0.width, H: g0.height, r: dims.r ?? 0 }, plane, cut.mode, cut.swivel, { t: dims.t });
      if (edge.clamped) notes.push(`${label}: Gehrung braucht ${round(edge.need)}° Kopfschwenk, Winkelkorrektur auf ±${round(cut.swivel)}° – Schnitt nicht maßhaltig`);
      if (cut.mode === "2D" || edge.clamped) { special.push({ key, edge }); cuts[list] = []; }
    }
    const zs = (e) => e.outer.concat(e.inner).map((q) => q[2]);
    const extOf = (key) => { const e = special.find((x) => x.key === key)?.edge; return !e ? 0 : key === "A" ? Math.max(0, -Math.min(...zs(e))) + 2 : Math.max(0, Math.max(...zs(e)) - L) + 2; };
    let { solid, geom } = makeMember(section, L, fr, cuts, { ...opts, extStart: extOf("A"), extEnd: extOf("B") });
    for (const { key, edge } of special) solid = solid.cut(endCutTool(edge, fr, key === "B"));
    return { solid, geom, ends, notes };
  }

  // ---------- Profil-Stab (Rohr, Hohlprofil ...) ----------
  /**
   * frame: {origin (Startpunkt Achse), z (Achsrichtung), u (Breite), v (Höhe)}
   * cuts: {start: [{p, n}], end: [{p, n}]}  n zeigt in den zu entfernenden Bereich
   */
  function makeMember(section, length, frame, cuts = { start: [], end: [] }, { envelope = false, extStart = 0, extEnd = 0 } = {}) {
    const g = sectionGeometry(section.kind, section.dims);
    const halfDiag = Math.hypot(g.width, g.height) / 2;
    // nötige Verlängerung, damit die Schnittebene den ganzen Querschnitt erfasst
    const extFor = (list, isEnd) => {
      let ext = 0;
      for (const c of list) {
        const n = v3.norm(c.n);
        const cz = v3.dot(n, frame.z);
        if (Math.abs(cz) < 0.05) throw new Error("Gehrungs-/Schnittwinkel zu flach");
        const tCenter = v3.dot(v3.sub(c.p, frame.origin), n) / cz;
        const spread = (halfDiag * Math.sqrt(Math.max(0, 1 - cz * cz))) / Math.abs(cz);
        ext = isEnd ? Math.max(ext, tCenter + spread - length + 2) : Math.max(ext, -(tCenter - spread) + 2);
      }
      return Math.max(0, ext);
    };
    const e0 = Math.max(extFor(cuts.start || [], false), extStart), e1 = Math.max(extFor(cuts.end || [], true), extEnd);
    const yDir = frame.v;
    const fr = { origin: v3.sub(frame.origin, v3.mul(frame.z, e0)), xDir: frame.u, normal: frame.z, yDir };
    const outer = envelope ? { outer: g.outer, holes: [] } : { outer: g.outer, holes: g.holes };
    let solid = regionToDrawing(outer).sketchOnPlane(makePlane(fr)).extrude(length + e0 + e1);
    const size = 4 * (length + g.width + g.height + e0 + e1) + 100;
    for (const c of [...(cuts.start || []), ...(cuts.end || [])]) solid = solid.cut(halfSpace(c.p, c.n, size));
    return { solid, geom: g };
  }

  /**
   * Werkzeugkörper eines Endes in 2D/3D (src/core/endcut.js): Band zwischen Außen- und Innenkante der Schnittkante,
   * von dort bis hinter das Rohrende gezogen. Alle Flächen eben (Dreiecke bzw. senkrechte Vierecke).
   */
  function endCutTool(edge, fr, atEnd) {
    const W = (q) => v3.add(v3.add(v3.add(fr.origin, v3.mul(fr.u, q[0])), v3.mul(fr.v, q[1])), v3.mul(fr.z, q[2]));
    const all = edge.outer.concat(edge.inner).map((q) => q[2]);
    const zf = atEnd ? Math.max(...all) + 5 : Math.min(...all) - 5;
    // Kanten: Bögen als B-Spline durch die Punkte, Geraden dazwischen – gleiche Gliederung außen und innen,
    // damit die Regelflächen (Schnittfläche, Wände) glatt und ohne Dreiecke entstehen
    const wire = (pts) => {
      const P = pts.map(W), edges = [];
      edge.arcs.forEach((idx, k) => {
        edges.push(R.makeBSplineApproximation(idx.map((i) => P[i]), { tolerance: 1e-4, degMax: 5 }));
        const nxt = edge.arcs[(k + 1) % edge.arcs.length][0], last = idx[idx.length - 1];
        if (v3.dist(P[last], P[nxt]) > 1e-6) edges.push(R.makeLine(P[last], P[nxt]));
      });
      return R.assembleWire(edges);
    };
    const flat = (pts) => pts.map((q) => [q[0], q[1], zf]);
    const O = wire(edge.outer), I = wire(edge.inner), Of = wire(flat(edge.outer)), If = wire(flat(edge.inner));
    const band = (a, b) => R.loft([a.clone(), b.clone()], { ruled: true }, true);
    const cap = R.makeFace(Of.clone(), [If.clone()]);
    return R.makeSolid([band(O, I), band(O, Of), band(I, If), cap]);
  }

  /**
   * Werkzeugkörper einer Rohr-Kontur (src/core/tubecuts.js) an der Stelle x: Umriss auf einer Ebene außen vor der
   * Fläche (Normale n zur Rohrachse hin), bis zur Achse bzw. durchgehend bis hinter die Gegenwand extrudiert.
   * Seite wie im Rohr-Editor: oben = +v, vorne (90°, von Ende A gesehen rechts) = −u.
   */
  function tubeCutTool(it, x, fr, geom, prof) {
    // über die Rundung (Eckrundung, Rundrohr in 2D bzw. über der Winkelkorrektur): eigene Werkzeuge je Abschnitt,
    // durchgehend als gespiegelte Kontur auf der Gegenseite
    if (it.wrap) return (it.through ? [it, opposite(it)] : [it]).flatMap((c) => wrapCutTools(c, x, fr, geom, prof));
    const a = (it.angle * Math.PI) / 180;
    const n = v3.add(v3.mul(fr.v, Math.cos(a)), v3.mul(fr.u, -Math.sin(a)));
    const normal = v3.mul(n, -1);
    const origin = v3.add(v3.add(fr.origin, v3.mul(fr.z, x)), v3.mul(n, it.halfN + 1));
    const depth = it.through ? 2 * it.halfN + 2 : it.halfN + 1;
    if (it.tilt) {
      // schräge Bohrung: Zylinder entlang der geneigten Achse durch die Mitte auf der Außenfläche
      const w = v3.cross(normal, fr.z);
      const S = v3.add(v3.add(v3.add(fr.origin, v3.mul(fr.z, x)), v3.mul(n, it.halfN)), v3.mul(w, it.q));
      const ax = v3.norm(v3.add(v3.add(normal, v3.mul(fr.z, it.tanL)), v3.mul(w, it.tanQ)));
      const cosG = Math.cos((it.tilt * Math.PI) / 180), out = 2 + it.d;
      // nur durch die eigene Wand (bzw. durchgehend bis hinter die Gegenwand), nicht in die Seitenwände
      const tanG = Math.tan((it.tilt * Math.PI) / 180);
      const len = it.through ? (2 * it.halfN + 2) / cosG : (it.wall + 1) / cosG + (it.d / 2) * tanG;
      return R.makeCylinder(it.d / 2, out + len, v3.sub(S, v3.mul(ax, out)), ax);
    }
    // y der Ebene = normal × z: auf der Oberseite nach vorne (−u) – Versatz q wie im Rohr-Editor
    return contourDrawing(it, geom).sketchOnPlane(new R.Plane(origin, fr.z, normal)).extrude(depth);
  }
  /** Umriss einer Kontur als Zeichnung: x längs um die Lage, y quer inkl. Versatz (+ = im Uhrzeigersinn von Ende A) */
  function contourDrawing(it, geom) {
    let d;
    if (it.kind === "bohrung") d = R.drawCircle(it.d / 2);
    else if (it.kind === "polygon") {
      // Bögen über ihren Scheitelpunkt: Bulge + = gegen den Uhrzeiger, wölbt nach rechts der Sehne
      const n = it.pts.length, mid = (a, b) => [(a[0] + b[0]) / 2 + ((b[1] - a[1]) * a[2]) / 2, (a[1] + b[1]) / 2 - ((b[0] - a[0]) * a[2]) / 2];
      let pen = R.draw([it.pts[0][0], it.pts[0][1]]);
      for (let i = 0; i < n - 1; i++) { const a = it.pts[i], b = it.pts[i + 1]; pen = a[2] ? pen.threePointsArcTo([b[0], b[1]], mid(a, b)) : pen.lineTo([b[0], b[1]]); }
      const last = it.pts[n - 1];
      if (last[2]) pen = pen.threePointsArcTo([it.pts[0][0], it.pts[0][1]], mid(last, it.pts[0]));
      d = pen.close();
    } else if (openAtEnd(it.kind)) {
      const ext = geom.width + geom.height + 10; // über das Ende hinaus, auch bei Gehrung offen
      const w = it.l + ext;
      d = R.drawRoundedRectangle(w, it.b, it.r || 0).translate(it.end === "A" ? (it.l - ext) / 2 : (ext - it.l) / 2, 0);
    } else d = R.drawRoundedRectangle(it.l, it.b, it.r || 0);
    return d.translate(0, it.q);
  }
  /** Gegenseite einer durchgehenden Kontur: Winkel + 180°, quer gespiegelt */
  const opposite = (it) => ({ ...it, angle: (it.angle + 180) % 360, q: -it.q, pts: it.pts && it.pts.map(([x, y, bu]) => [x, -y, -bu]) });

  const WRAP_OUT = 0.3; // Überstand der Werkzeuge über Außen- und Innenwand
  const DEG = Math.PI / 180;
  /**
   * Werkzeuge einer Kontur über die Rundung (Patrick, 25.10.2026): auf der ebenen Fläche bzw. am Rundrohr in 3D
   * innerhalb der Winkelkorrektur als Prisma (parallele Wände), auf der Rundung als Fläche auf dem Zylinder,
   * radial durch die Wand aufgedickt (Schnitt senkrecht zur Mantelfläche). Rechteckrohr und 2D: Maße auf der
   * Abwicklung; Rundrohr in 3D: in der Draufsicht.
   */
  function wrapCutTools(it, x, fr, geom, prof) {
    const a = (it.angle * Math.PI) / 180, round = prof.kind === "rohr", R0 = geom.width / 2;
    const vec = (u, v) => v3.add(v3.mul(fr.u, u), v3.mul(fr.v, v));
    const n0 = [-Math.sin(a), Math.cos(a)], tS = [-Math.cos(a), -Math.sin(a)]; // Flächennormale, Richtung +s
    const N = vec(...n0), T = vec(...tS);
    const lim = Math.min(prof.swivel ?? 45, 89) * DEG;
    const d0 = contourDrawing(it, geom);
    const [[, y0], [, y1]] = d0.boundingBox.bounds;
    const X = 4 * (prof.L + geom.width + geom.height) + 100;
    const band = (lo, hi) => R.drawRectangle(X, hi - lo).translate(0, (lo + hi) / 2);
    const tools = [];
    const flat = round ? (it.mode === "3D" ? R0 * Math.sin(lim) : 0) : it.faceHalf;
    if (flat > 0 && y0 < flat && y1 > -flat) {
      const origin = v3.add(v3.add(fr.origin, v3.mul(fr.z, x)), v3.mul(N, it.halfN + 1));
      tools.push(...sketchesOf(d0.intersect(band(-flat, flat)).sketchOnPlane(new R.Plane(origin, fr.z, v3.mul(N, -1)))).map((sk) => sk.extrude(it.halfN + 1)));
    }
    if (!round) {
      const r = prof.r, arc = (Math.PI * r) / 2 + 1;
      for (const sg of [1, -1]) {
        if (!(sg > 0 ? y1 > flat : y0 < -flat)) continue;
        const part = d0.intersect(sg > 0 ? band(flat, flat + arc) : band(-flat - arc, -flat)).translate(0, -sg * flat);
        tools.push(...radialTools(part, [n0[0] * (it.halfN - r) + tS[0] * sg * flat, n0[1] * (it.halfN - r) + tS[1] * sg * flat], r, N, T, x, fr, geom, prof));
      }
    } else if (it.mode === "2D") tools.push(...radialTools(d0, [0, 0], R0, N, T, x, fr, geom, prof));
    else {
      // über der Winkelkorrektur: Draufsicht → Abwicklung (Linienzug), dort senkrecht zur Mantelfläche
      const pts = contourPolyline(it, 0, { ext: geom.width + geom.height + 10 }).map(([px, py]) => [px, R0 * Math.asin(Math.max(-1, Math.min(1, py / R0)))]);
      let pen = R.draw(pts[0]);
      for (const p of pts.slice(1)) pen = pen.lineTo(p);
      const dw = pen.close(), wl = R0 * lim, arc = (Math.PI * R0) / 2;
      for (const sg of [1, -1]) {
        if (!(sg > 0 ? y1 > flat : y0 < -flat)) continue;
        tools.push(...radialTools(dw.clone().intersect(sg > 0 ? band(wl, arc) : band(-arc, -wl)), [0, 0], R0, N, T, x, fr, geom, prof));
      }
    }
    return tools;
  }
  const sketchesOf = (sk) => (sk.sketches ? sk.sketches : [sk]);
  /**
   * Zeichnung (x längs um die Lage, w = Bogenlänge auf dem Außenmantel ab der Bezugslinie) auf einen Zylinder um die
   * Achse durch C (Profil-Koordinaten u, v) mit Außenradius Rs legen und radial durch die Wand aufdicken.
   * N = Richtung der Bezugslinie (w = 0), T = Richtung wachsender w.
   */
  function radialTools(D, C, Rs, N, T, x, fr, geom, prof) {
    const ext = geom.width + geom.height + 20, Rr = Rs + WRAP_OUT;
    const axisP = v3.add(v3.add(fr.origin, v3.add(v3.mul(fr.u, C[0]), v3.mul(fr.v, C[1]))), v3.mul(fr.z, -ext));
    const Hr = v3.add(v3.add(axisP, v3.mul(fr.z, ext + x)), v3.mul(N, Rr));
    // Zylinder so drehen, dass die Bezugslinie bei u = π liegt (fern der Naht)
    let cyl = R.makeCylinder(Rr, prof.L + 2 * ext, axisP, fr.z);
    const latOf = (c) => c.faces.find((f) => f.geomType === "CYLINDRE");
    const u0 = latOf(cyl).uvCoordinates(Hr)[0];
    cyl = cyl.rotate(((Math.PI - u0) * 180) / Math.PI, axisP, fr.z);
    let lat = latOf(cyl), [uH, vH] = lat.uvCoordinates(Hr);
    if (Math.abs(uH - Math.PI) > 0.1) { cyl = cyl.rotate(((2 * (u0 - Math.PI)) * 180) / Math.PI, axisP, fr.z); lat = latOf(cyl); [uH, vH] = lat.uvCoordinates(Hr); }
    // (x, w) → (Bogen auf Rr, Achse); u wächst in Richtung z × N
    let D2 = D.mirror([1, 1], [0, 0], "plane").stretch(Rr / Rs, [0, 1], [0, 0]);
    if (v3.dot(v3.cross(fr.z, N), T) < 0) D2 = D2.mirror([0, 1], [0, 0], "plane");
    D2 = D2.translate(Rr * uH, vH);
    return sketchesOf(D2.sketchOnFace(lat, "original")).map((sk) => thicken(sk.face(), -(prof.t + 2 * WRAP_OUT)));
  }

  /**
   * Mindestlänge, bei der sich Anfangs- und Endschnitt noch nicht im Stab kreuzen.
   * Geprüft an den beiden äußersten Fasern quer zur Kippachse: z_Ende(s) − z_Anfang(s) ≥ 0.
   */
  function miterMinLength(section, frame, tiltAxis, cuts) {
    const g = sectionGeometry(section.kind, section.dims);
    const w = v3.norm(v3.cross(tiltAxis, frame.z));
    const half = Math.abs(v3.dot(w, frame.v)) > 0.5 ? g.height / 2 : g.width / 2;
    const slope = (c) => (c ? v3.dot(w, c.n) / v3.dot(frame.z, c.n) : 0);
    return half * Math.abs(slope(cuts.end[0]) - slope(cuts.start[0]));
  }

  /** Zuschnittlänge = Ausdehnung entlang der Stabachse */
  function memberLength(shape, frame) {
    const sp = memberSpan(shape, frame);
    return sp.hi - sp.lo;
  }
  /** Ausdehnung eines Stabs entlang seiner Achse: { lo, hi } in mm ab frame.origin */
  function memberSpan(shape, frame) {
    const m = shape.mesh({ tolerance: 0.01, angularTolerance: 0.1 });
    let lo = Infinity, hi = -Infinity;
    const vs = m.vertices;
    for (let i = 0; i < vs.length; i += 3) {
      const t = (vs[i] - frame.origin[0]) * frame.z[0] + (vs[i + 1] - frame.origin[1]) * frame.z[1] + (vs[i + 2] - frame.origin[2]) * frame.z[2];
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
    return { lo, hi };
  }
  /** Stabachse für Anschlussbleche (M8): Rahmen, tatsächliche Enden, Profilgröße quer (Breite u, Höhe v) */
  const memberAxis = (solid, fr, g) => ({ origin: fr.origin, z: fr.z, u: fr.u, v: fr.v, ...memberSpan(solid, fr), width: g.width, height: g.height, perimeter: loopLength(g.outer) });

  const AXES = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1], "-X": [-1, 0, 0], "-Y": [0, -1, 0], "-Z": [0, 0, -1] };
  /** Lokales Stab-Koordinatensystem für Achsrichtung + Drehung um die Achse */
  function memberFrame(origin, zDir, rotDeg = 0, upHint) {
    const z = v3.norm(zDir);
    let up = upHint || [0, 0, 1];
    if (Math.abs(v3.dot(up, z)) > 0.999) up = [0, 1, 0];
    // v ≈ up (Höhe nach oben), u = v × z
    let v = v3.norm(v3.sub(up, v3.mul(z, v3.dot(up, z))));
    let u = v3.cross(v, z);
    if (rotDeg) {
      const t = (rotDeg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
      const u2 = v3.add(v3.mul(u, c), v3.mul(v, s));
      const v2 = v3.add(v3.mul(v, c), v3.mul(u, -s));
      u = u2; v = v2;
    }
    return { origin, z, u, v };
  }

  // ---------- Kanten/Flächen-Auswahl ----------
  function edgeMid(e) { return tuple(e.pointAt(0.5)); }

  /** Kehlnaht-Körper an einer geraden Kante: Flächen anderer Teile an der Kante suchen, Dreieck entlang ziehen */
  function beadSolid(e, a, bodies) {
    if (e.geomType !== "LINE") return null;
    const S = tuple(e.startPoint), T = tuple(e.endPoint), L = v3.dist(S, T);
    if (!(L > 1e-6)) return null;
    const u = v3.norm(v3.sub(T, S)), mid = v3.mul(v3.add(S, T), 0.5), tol = 0.05;
    const faces = [];
    bodies.forEach((b, bi) => {
      if (b.meta?.weld) return;
      const bb = b.shape.boundingBox;
      if (!pointInBox(mid, bb, 1)) return;
      for (const fc of b.shape.faces) {
        if (fc.geomType !== "PLANE") continue;
        const n = v3.norm(tuple(fc.normalAt(mid)));
        if (Math.abs(v3.dot(n, u)) > 1e-3 || Math.abs(v3.dot(n, v3.sub(mid, tuple(fc.center)))) > tol) continue;
        if (!pointInBox(mid, fc.boundingBox, tol)) continue;
        faces.push({ body: bi, n });
      }
    });
    const pair = filletPair(faces);
    if (!pair) return null;
    const sec = beadSection(pair[0].n, pair[1].n, a);
    const y = v3.cross(u, sec.tA);
    const bx = v3.dot(sec.tB, sec.tA), by = v3.dot(sec.tB, y);
    const shape = R.draw([0, 0]).lineTo([sec.z, 0]).lineTo([sec.z * bx, sec.z * by]).close().sketchOnPlane(makePlane({ origin: S, xDir: sec.tA, normal: u })).extrude(L);
    return { shape, volume: sec.area * L };
  }
  function matchEdges(shape, refs, tol) {
    const edges = shape.edges;
    const mids = edges.map((e) => ({ e, mid: edgeMid(e), type: e.geomType }));
    const found = [];
    let missing = 0;
    for (const r of refs) {
      let best = null, bd = Infinity;
      for (const m of mids) {
        if (r.type && m.type !== r.type) continue;
        const d = v3.dist(m.mid, r.p);
        if (d < bd) { bd = d; best = m; }
      }
      if (best && bd <= tol) found.push(best.mid);
      else missing++;
    }
    return { found, missing };
  }

  // Nahtkanten (z. B. an Zylindern) dürfen nicht verrundet werden
  function seamEdges(shape) {
    const seams = new Set();
    for (const fc of shape.faces) {
      const seen = new Set();
      for (const e of fc.edges) {
        const h = hashOf(e);
        if (seen.has(h)) seams.add(h);
        seen.add(h);
      }
    }
    return seams;
  }

  // ---------- Bauteil aufbauen ----------
  const prefixCache = new Map(); // partId -> [{key, state}]

  function cloneState(st) {
    return {
      bodies: st.bodies.map((b) => ({ ...b, shape: b.shape.clone() })),
      tools: new Map([...st.tools].map(([k, t]) => [k, { ...t, shapes: t.shapes.map((s) => ({ ...s, shape: s.shape.clone() })) }])),
      sketches: new Map(st.sketches),
      status: { ...st.status },
      welds: [...(st.welds || [])],
      paths: new Map(st.paths || []),
    };
  }

  /** Gültigkeit eines Körpers nach OpenCascade (BRepCheck): Topologie und Geometrie konsistent */
  function shapeValid(shape) {
    const an = new (R.getOC().BRepCheck_Analyzer)(shape.wrapped, true, false);
    try { return an.IsValid(); } finally { an.delete(); }
  }
  const INVALID_BODY = "Körper ungültig (Geometrie-Prüfung) – Export und weitere Features können fehlschlagen";

  async function buildPart(part0, { useCache = true, validate = true } = {}) {
    // Regeln (Stufe 43): Parameter setzen, Features unterdrücken, Prüfmeldungen – vor dem Aufbau
    const ruled = applyRules(part0);
    const part = ruled.part;
    const { values, errors: paramErrors } = resolveParams(part.params || []);
    const scope = values;
    const E = (expr, label) => {
      try { return evaluate(expr, scope); } catch (e) { throw new Error(`${label}: ${e.message}`); }
    };
    let state = { bodies: [], tools: new Map(), sketches: new Map(), status: {}, welds: [], paths: new Map() };
    // Bauteilende (FU5): nur die Features vor der Markierung werden gerechnet
    const feats = (part.features || []).slice(0, activeCount(part));
    const rolledBack = (part.features || []).slice(feats.length);
    // Arbeitselemente: reine Lagen, unabhängig vom Zwischenspeicher
    const datums = resolveDatums(feats, (x) => evaluate(x, scope));
    // 2D/3D und Winkelkorrektur je Profil bzw. Rahmen (gilt für alle Schnitte dieses Features)
    const cutCfg = (f) => {
      const c = featureCutSettings(f, part);
      const sw = E(c.swivel, "Winkelkorrektur");
      if (!(sw >= 0 && sw <= 89)) throw new Error("Winkelkorrektur 0 bis 89°");
      return { mode: c.mode, swivel: sw };
    };
    // Platzhalter in Skizzentexten ({teilenummer} …); nur dann Teil des Zwischenspeicher-Schlüssels
    const textVars = partTextVars(part);
    const usesVars = feats.some((f) => f.type === "sketch" && (f.entities || []).some((e) => e.type === "text" && /\{\w+\}/.test(e.text || "")));
    const keys = [];
    // Werkstoff wählt die Biegetabelle; Schnitt 2D/3D und Restwand am Bauteil gelten für alle Features; Textplatzhalter nur wenn benutzt
    let acc = JSON.stringify(values) + (part.material || "") + JSON.stringify([part.cutMode, part.swivel, part.restwand]) + (usesVars ? JSON.stringify(textVars) : "");
    const keepWall = part.restwand !== false;
    for (const f of feats) { acc = hashString(acc + JSON.stringify(f)); keys.push(acc); }
    let startAt = 0;
    const cacheList = prefixCache.get(part.id) || [];
    if (useCache) {
      for (let i = keys.length - 1; i >= 0; i--) {
        const hit = cacheList.find((c) => c.key === keys[i]);
        if (hit) { state = cloneState(hit.state); startAt = i + 1; break; }
      }
    }
    const newCache = [];

    // Folgefehler: Ursache (Bezug fehlt, steht dahinter, ist unterdrückt oder fehlerhaft) benennen
    const missingRef = (id, label, self) => {
      const i = feats.findIndex((g) => g.id === id);
      const ref = feats[i];
      if (!id || !ref) return `${label} fehlt (gelöscht?)`;
      const name = `»${ref.name || ref.type}«`;
      if (i > feats.indexOf(self)) return `${label} ${name} steht im Baum weiter unten – Reihenfolge ändern`;
      if (ref.suppressed) return `hängt von ${name} ab, das unterdrückt ist`;
      const st = state.status[id];
      if (st && !st.ok) return `hängt von ${name} ab, das fehlerhaft ist`;
      return `${label} ${name} fehlt oder ist fehlerhaft`;
    };
    const getSketch = (id, label = "Skizze") => {
      const s = state.sketches.get(id);
      if (!s) throw new Error(missingRef(id, label, currentFeature));
      return s;
    };
    let currentFeature = null;
    /** Flächen der Körper an Punkten (Auswahl im 3D-Fenster) → [{body, face, p}] */
    const facesAt = (points) => {
      const out = [];
      for (const p of points) {
        for (const body of state.bodies) {
          const face = new R.FaceFinder().containsPoint(p).find(body.shape, { unique: false })[0];
          if (face) { out.push({ body, face, p }); break; }
        }
      }
      return out;
    };

    // ---------- Blech: Kantteil mit Laschen, Umschlägen, Stirnlaschen und Durchzügen ----------
    /** Zahlen und Lage eines Kantteils (Querschnitt aus Maßen oder Konturlasche aus einer Skizze) */
    const sheetSpec = (f) => {
      const list = (x, label) => splitList(x).map((v, k) => E(v, `${label} ${k + 1}`));
      const L = E(f.length ?? "1000", "Länge");
      if (!(L > 0)) throw new Error("Länge muss > 0 sein");
      // Blechregel (Stufe 44): Radius, Abwicklung und K aus der Regel, Dicke mit »Dicke aus Regel«
      const eff = effectiveSheet(f, E, part.material || "S235");
      const { t, ri, k: K0 } = eff;
      if (!(t > 0)) throw new Error("Blechdicke muss > 0 sein");
      const br = bendRule({ rule: eff.rule, material: eff.material, t, ri, k: K0 });
      const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
      if (f.src === "skizze") {
        const sk = getSketch(f.sketch, "Skizze der Konturlasche");
        const c = contourLegs(pathChain(sk.sketch), f.side || "links");
        const fr = sk.frame, h = t / 2;
        const U = v3.add(v3.mul(fr.xDir, Math.cos(c.dir)), v3.mul(fr.yDir, Math.sin(c.dir)));
        const V = v3.add(v3.mul(fr.xDir, -Math.sin(c.dir)), v3.mul(fr.yDir, Math.cos(c.dir)));
        const N = fr.normal, dirMode = f.extent || "normal";
        let O = v3.add(toWorld(fr, c.start[0], c.start[1]), v3.mul(V, c.offset * h));
        if (dirMode === "normal") O = v3.add(O, v3.mul(N, L));
        else if (dirMode === "symmetrisch") O = v3.add(O, v3.mul(N, L / 2));
        return { legs: c.legs, angles: c.angles, ref: c.ref, t, ri, k: K0, kOf: br.kOf, br, L, rule: eff.rule, relief: eff.relief, ruleName: eff.ruleName, frame: { O, U, V, W: v3.mul(N, -1) }, flatFrame: { origin: v3.sub(fr.origin, v3.mul(fr.normal, h)), xDir: fr.xDir, normal: fr.normal } };
      }
      const pos = (f.pos || ["0", "0", "0"]).map((x, k) => E(x, "Lage " + "XYZ"[k]));
      return { legs: list(f.legs, "Schenkel"), angles: list(f.angles, "Winkel"), ref: f.ref || "aussen", t, ri, k: K0, kOf: br.kOf, br, L, rule: eff.rule, relief: eff.relief, ruleName: eff.ruleName, frame: { O: pos, U: X, V: Z, W: Y }, flatFrame: { origin: v3.add(pos, [0, 0, -t / 2]), xDir: X, normal: Z } };
    };
    /** Zahlen eines Blech-Features */
    const sheetExtra = (f, spec) => {
      const opt = (x, label) => (x === undefined || x === null || String(x).trim() === "" ? null : E(x, label));
      const sg = f.dir === "ab" ? "ab" : "auf";
      if (f.type === "umschlag") return { type: "umschlag", edge: f.edge === "anfang" ? "anfang" : "ende", kind: f.kind || "geschlossen", length: E(f.length ?? "15", "Länge"), gap: opt(f.gap, "Spalt") ?? 0, dir: sg };
      if (f.type === "durchzug") {
        const lst = (x, label) => splitList(String(x ?? "")).map((v, k) => E(v, `${label} ${k + 1}`));
        return { type: "durchzug", leg: E(f.leg ?? "1", "Schenkel"), s: lst(f.s ?? "20", "Lage entlang"), y: lst(f.y ?? "50", "Lage längs"), d: E(f.d ?? "8", "Innendurchmesser"), height: E(f.height ?? "6", "Kragenhöhe"), dir: sg, d0: opt(f.d0, "Vorloch") };
      }
      if (f.type === "eckeschliessen") return { type: "eckeschliessen", bend: E(f.bend ?? "1", "Biegung"), side: f.side === "hinten" ? "hinten" : "vorne", through: f.through === "b" ? "b" : "a", gap: opt(f.gap, "Spalt") ?? 0 };
      if (f.type === "stanzung") {
        const lst = (x, label) => splitList(String(x ?? "")).map((v, k) => E(v, `${label} ${k + 1}`));
        const form = ["rechteck", "langloch"].includes(f.form) ? f.form : "rund";
        return { type: "stanzung", leg: E(f.leg ?? "1", "Schenkel"), s: lst(f.s ?? "30", "Lage entlang"), y: lst(f.y ?? "50", "Lage längs"), form, d: form === "rund" ? E(f.d ?? "10", "Durchmesser") : 0, a: form === "rund" ? 0 : E(f.a ?? "30", "Länge entlang"), b: form === "rund" ? 0 : E(f.b ?? "10", "Breite längs") };
      }
      return { type: "lasche", edge: f.edge || "ende", length: E(f.length ?? "30", "Länge"), angle: E(f.angle ?? "90", "Winkel"), dir: sg, ri: opt(f.ri, "Innenradius"), width: opt(f.width, "Breite"), offset: opt(f.offset, "Versatz") ?? 0, relief: f.relief || spec?.relief?.relief || "rechteck", reliefW: opt(f.reliefW, "Freischnitt-Breite") ?? (spec?.relief?.reliefW || null), reliefD: opt(f.reliefD, "Freischnitt-Tiefe") ?? (spec?.relief?.reliefD || null), leg: opt(f.leg, "Schenkel") ?? 1 };
    };
    /** Körper eines Kantteils mit allen Blech-Features bis hierher */
    const sheetBuild = (f, spec, extras) => {
      const { t, L, br } = spec, h = t / 2;
      const S = planSheet(spec, extras);
      const plan = S.plan;
      const { O, U, V, W } = spec.frame;
      const UV = v3.cross(U, V);
      const P3 = (q, y = 0) => v3.add(v3.add(O, v3.add(v3.mul(U, q[0]), v3.mul(V, q[1]))), v3.mul(W, y));
      const add2 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
      const outlineDrawing = (o) => {
        let d = R.draw(o.start), cur = o.start;
        for (const sg of o.segs) {
          if (Math.hypot(sg.to[0] - cur[0], sg.to[1] - cur[1]) < 1e-9) continue;
          d = sg.t === "arc" ? d.threePointsArcTo(sg.to, sg.mid) : d.lineTo(sg.to);
          cur = sg.to;
        }
        return d.close();
      };
      const poly = (pts) => { let d = R.draw(pts[0]); for (const q of pts.slice(1)) d = d.lineTo(q); return d.close(); };
      // Fläche in der Querschnittsebene über y von ya bis yb
      const prismUV = (d, ya, yb) => d.sketchOnPlane(new R.Plane(P3([0, 0], yb), U, UV)).extrude(yb - ya);
      const quad = (p0, p1, n) => [add2(p0, n, h + 1), add2(p0, n, -h - 1), add2(p1, n, -h - 1), add2(p1, n, h + 1)];
      let solid;
      if (f.view === "abgewickelt") {
        const fm = S.flat, ff = spec.flatFrame;
        const pl = new R.Plane(ff.origin, ff.xDir, ff.normal);
        solid = poly(fm.outer).sketchOnPlane(pl).extrude(t);
        for (const hl of fm.holes) solid = solid.cut(poly(hl).sketchOnPlane(pl).extrude(t));
        for (const c of fm.circles) solid = solid.cut(R.drawCircle(c.d / 2).translate(c.c).sketchOnPlane(pl).extrude(t));
      } else {
        solid = prismUV(outlineDrawing(kantteilOutline(plan, t)), 0, L);
        const C = plan.center, last = C.length - 1;
        for (const p of S.parts) {
          const Cf = p.full.center, Bf = p.full.bends, bi = p.bi;
          const sub = p.end === "ende"
            ? { center: [{ ...Cf[bi], a: add2(Cf[bi].b, Cf[bi].d, -1) }, Cf[bi + 1]], bends: [Bf[bi]] }
            : { center: [Cf[0], { ...Cf[1], b: add2(Cf[1].a, Cf[1].d, 1) }], bends: [Bf[0]] };
          const g = p.end === "ende" ? C[last] : C[0];
          const e = p.end === "ende" ? g.b : g.a, sgn = p.end === "ende" ? 1 : -1;
          // Bereich der neuen Biegung am Schenkelende frei, Lasche ansetzen, Biegefreischnitt neben der Lasche
          const inner = add2(e, g.d, -sgn * p.cut), outer = add2(e, g.d, sgn);
          solid = solid.cut(prismUV(poly(quad(inner, outer, g.n)), p.y0, p.y0 + p.w));
          solid = solid.fuse(prismUV(outlineDrawing(kantteilOutline(sub, t)), p.y0, p.y0 + p.w));
          if (p.relief) {
            const deep = add2(e, g.d, -sgn * (p.cut + p.relief.d));
            for (const [ya, yb] of [[p.y0 - p.relief.w, p.y0], [p.y0 + p.w, p.y0 + p.w + p.relief.w]]) {
              const a = Math.max(-1, ya), b = Math.min(L + 1, yb);
              if (b - a > 1e-6) solid = solid.cut(prismUV(poly(quad(deep, outer, g.n)), a, b));
            }
          }
        }
        for (const e of S.ends) {
          const g = C[e.leg], front = e.side === "vorne";
          const D3 = v3.add(v3.mul(U, g.d[0]), v3.mul(V, g.d[1]));
          // Lage entlang des Schenkels (nach »Ecke schließen« verlängert oder gekürzt), weggeschnitten nur auf dem geraden Stück
          const s0 = e.s0 ?? 0, s1 = e.s1 ?? g.len, c0 = Math.max(0, s0), c1 = Math.min(g.len, s1);
          const plAt = (s) => new R.Plane(P3(add2(g.a, g.d, s), 0), W, D3);
          const S0 = e.cut + 1;
          const map = (q) => [front ? S0 - q[0] : L - S0 + q[0], q[1]];
          const o = kantteilOutline(e.two, t);
          const mo = { start: map(o.start), segs: o.segs.map((sg) => ({ ...sg, to: map(sg.to), mid: sg.mid && map(sg.mid) })) };
          const box = front ? [[-1, -h - 1], [e.cut, -h - 1], [e.cut, h + 1], [-1, h + 1]] : [[L - e.cut, -h - 1], [L + 1, -h - 1], [L + 1, h + 1], [L - e.cut, h + 1]];
          if (c1 - c0 > 1e-6) solid = solid.cut(poly(box).sketchOnPlane(plAt(c0)).extrude(c1 - c0));
          solid = solid.fuse(outlineDrawing(mo).sketchOnPlane(plAt(s0)).extrude(s1 - s0));
          if (e.corner) {
            for (const bi of [e.leg - 1, e.leg]) {
              const bd = plan.bends[bi];
              if (!bd) continue;
              const m = 6, u0 = [(C[bi].b[0] - bd.c[0]) / bd.rm, (C[bi].b[1] - bd.c[1]) / bd.rm];
              const Rr = (bd.rm + h + 1) / Math.cos(bd.theta / (2 * m));
              const pts = [bd.c];
              for (let q = 0; q <= m; q++) {
                const an = (bd.sgn * bd.theta * q) / m;
                pts.push([bd.c[0] + Rr * (u0[0] * Math.cos(an) - u0[1] * Math.sin(an)), bd.c[1] + Rr * (u0[0] * Math.sin(an) + u0[1] * Math.cos(an))]);
              }
              const [ya, yb] = front ? [-1, e.cut + e.corner.extra] : [L - e.cut - e.corner.extra, L + 1];
              solid = solid.cut(prismUV(poly(pts), ya, yb));
            }
          }
        }
        for (const hp of S.pierce) {
          const g = C[hp.leg];
          const c3 = P3(add2(g.a, g.d, hp.s), hp.y);
          const N3 = v3.mul(v3.add(v3.mul(U, g.n[0]), v3.mul(V, g.n[1])), hp.up ? 1 : -1);
          solid = solid.cut(R.makeCylinder(hp.d / 2, t + 2, v3.sub(c3, v3.mul(N3, h + 1)), N3));
          const ring = R.makeCylinder(hp.d / 2 + t, hp.H - t, v3.add(c3, v3.mul(N3, h)), N3).cut(R.makeCylinder(hp.d / 2, hp.H + 2, v3.sub(c3, v3.mul(N3, h + 1)), N3));
          solid = solid.fuse(ring);
        }
        for (const pu of S.punch) {
          const g = C[pu.leg];
          const c3 = P3(add2(g.a, g.d, pu.s), pu.y);
          const N3 = v3.add(v3.mul(U, g.n[0]), v3.mul(V, g.n[1])), D3 = v3.add(v3.mul(U, g.d[0]), v3.mul(V, g.d[1]));
          const from = v3.sub(c3, v3.mul(N3, h + 1));
          solid = solid.cut(pu.form === "rund" ? R.makeCylinder(pu.d / 2, t + 2, from, N3) : poly(punchOutline(pu.form, pu.a, pu.b)).sketchOnPlane(new R.Plane(from, D3, N3)).extrude(t + 2));
        }
      }
      const fm = S.flat;
      const nB = fm.bends.length;
      const name = f.name || `${f.src === "skizze" ? "Konturlasche" : "Kantteil"} ${round(t)} mm, Abw. ${round(fm.width)} × ${round(fm.height)}`;
      const meta = { sheet: { t, flat: fm.width, length: fm.height, bends: fm.bends.map((b) => ({ angle: b.angle, r: b.ri, k: b.k })), bendLines: plan.bendLines, rule: ruleSummary(br), flatModel: fm } };
      const nClosed = S.ends.reduce((n, e) => n + (e.closed?.length || 0), 0);
      const feats2 = [S.parts.length && `${S.parts.length} Teil-Lasche(n)`, S.ends.length && `${S.ends.length} Stirnlasche(n)`, nClosed && `${nClosed} Ecke(n) geschlossen`, S.pierce.length && `${S.pierce.length} Durchzug/Durchzüge`, S.punch.length && `${S.punch.length} Stanzung(en)`].filter(Boolean);
      const info = `Abwicklung ${round(fm.width)} × ${round(fm.height)} mm, ${nB} Biegung(en)` + (plan.bends.length ? `, Biegezugabe ${plan.flatParts.filter((_, k) => k % 2).map(round).join(" / ")} mm` : "") + (feats2.length ? ` · ${feats2.join(", ")}` : "") + (nB && spec.rule !== "k" ? ` · ${ruleSummary(br)}` : "") + (spec.ruleName ? ` · Blechregel ${spec.ruleName}` : "") + (f.view === "abgewickelt" ? "" : " · Abwicklung als DXF in den Eigenschaften");
      const warn = [...plan.issues.map((x) => x.message), ...new Set(br.warnings)];
      return { solid, meta, name, info, warn: warn.join("; ") };
    };

    /**
     * Blechkasten (FU19/E12): Boden, hochgekantete Wände, aufgetrennte Ecken. Mit f.from »In Blech umwandeln«:
     * Außenmaße aus dem quaderförmigen Körper dieses Features, der Körper wird ersetzt.
     */
    const boxBuild = (f) => {
      const eff = effectiveSheet(f, E, part.material || "S235");
      const { t, ri, k } = eff;
      const br = bendRule({ rule: eff.rule, material: eff.material, t, ri, k });
      let L, B, H, pos, src = null;
      if (f.from) {
        src = state.bodies.find((b) => b.fid === f.from && b.kind === "solid" && !b.meta?.sheet);
        if (!src) throw new Error(missingRef(f.from, "Körper zum Umwandeln", f));
        let vol = NaN;
        try { vol = R.measureShapeVolumeProperties(src.shape).volume; } catch { /* unten gemeldet */ }
        ({ pos, L, B, H } = boxFromBody(src.shape.boundingBox.bounds, vol));
      } else {
        L = E(f.L ?? "300", "Länge"); B = E(f.B ?? "200", "Breite"); H = E(f.H ?? "60", "Höhe");
        pos = (f.pos || ["0", "0", "0"]).map((x, i) => E(x, "Lage " + "XYZ"[i]));
      }
      const gap = String(f.gap ?? "").trim() === "" ? 0.5 : E(f.gap, "Spalt");
      const plan = planBlechkasten({ L, B, H, t, ri, k, kOf: br.kOf, walls: f.walls ?? "vorne; rechts; hinten; links", through: f.through === "y" ? "y" : "x", gap });
      const fm = plan.flat;
      const box = (x0, x1, y0, y1, z0, z1) => R.makeBaseBox(x1 - x0, y1 - y0, z1 - z0).translate([(x0 + x1) / 2, (y0 + y1) / 2, z0]);
      let solid;
      if (f.view === "abgewickelt") {
        let d = R.draw(fm.outer[0]);
        for (const q of fm.outer.slice(1)) d = d.lineTo(q);
        solid = d.close().sketchOnPlane(new R.Plane([0, 0, 0], [1, 0, 0], [0, 0, 1])).extrude(t);
      } else {
        const { base: b0, R: Rb } = plan, s45 = Math.SQRT1_2;
        solid = box(b0.x0, b0.x1, b0.y0, b0.y1, 0, t);
        // Biegung als Viertelring um (R, R) in der Seitenebene (a nach innen, b nach oben), Wand darüber
        const ring = ri > 1e-6
          ? R.draw([Rb, 0]).threePointsArcTo([0, Rb], [Rb - Rb * s45, Rb - Rb * s45]).lineTo([t, Rb]).threePointsArcTo([Rb, t], [Rb - ri * s45, Rb - ri * s45]).close()
          : R.draw([Rb, 0]).threePointsArcTo([0, Rb], [Rb - Rb * s45, Rb - Rb * s45]).lineTo([Rb, Rb]).close();
        for (const sd of plan.sides) {
          const fr = boxSideFrame(sd.side, L, B);
          const pl = (s) => new R.Plane([fr.O[0] + fr.d[0] * s, fr.O[1] + fr.d[1] * s, 0], [fr.inw[0], fr.inw[1], 0], [fr.d[0], fr.d[1], 0]);
          solid = solid.fuse(ring.clone().sketchOnPlane(pl(sd.bend[0])).extrude(sd.bend[1] - sd.bend[0]));
          solid = solid.fuse(R.drawRectangle(t, H - Rb).translate(t / 2, (H + Rb) / 2).sketchOnPlane(pl(sd.wall[0])).extrude(sd.wall[1] - sd.wall[0]));
        }
        if (f.open === "unten") solid = solid.mirror([0, 0, 1], [0, 0, H / 2]);
      }
      solid = solid.translate(pos);
      const nW = plan.sides.length;
      const name = f.name || `Blechkasten ${round(t)} mm, Abw. ${round(fm.width)} × ${round(fm.height)}`;
      const meta = { sheet: { t, flat: fm.width, length: fm.height, bends: fm.bends.map((b) => ({ angle: b.angle, r: b.ri, k: b.k })), bendLines: [], rule: ruleSummary(br), flatModel: fm } };
      const info = `${round(L)} × ${round(B)} × ${round(H)} mm, ${nW} Wand/Wände` + (plan.corners ? `, ${plan.corners} Ecke(n) aufgetrennt (Spalt ${round(gap)} mm, Eckfreischnitt ${round(plan.R)} × ${round(plan.R)})` : "") + ` · Abwicklung ${round(fm.width)} × ${round(fm.height)} mm, Biegezugabe ${round(plan.ba)} mm` + (src ? " · aus Körper umgewandelt" : "") + (eff.ruleName ? ` · Blechregel ${eff.ruleName}` : "");
      return { solid, meta, name, info, src, warn: [...new Set(br.warnings)].join("; ") };
    };

    /** Konturwalzen: offene Skizzenlinie als Blech (Biegungen mit Innenradius) um eine Skizzenachse gewalzt; cut = Trennfuge */
    const rollBuild = (f, cut = null) => {
      const eff = effectiveSheet(f, E, part.material || "S235");
      const { t, ri, k } = eff, h = t / 2;
      if (!(t > 0)) throw new Error("Blechdicke muss > 0 sein");
      const br = bendRule({ rule: eff.rule, material: eff.material, t, ri, k });
      const sk = getSketch(f.sketch, "Skizze der Konturwalze");
      const c = contourLegs(pathChain(sk.sketch), f.side || "links");
      const plan = planKantteil({ legs: c.legs, angles: c.angles, t, ri, k, kOf: br.kOf, ref: c.ref });
      const U2 = [Math.cos(c.dir), Math.sin(c.dir)], V2 = [-Math.sin(c.dir), Math.cos(c.dir)];
      const toSk = (q) => [c.start[0] + U2[0] * q[0] + V2[0] * (q[1] + c.offset * h), c.start[1] + U2[1] * q[0] + V2[1] * (q[1] + c.offset * h)];
      const o = kantteilOutline(plan, t);
      const axis = f.axis === "y" ? "y" : "x";
      rollSide([o.start, ...o.segs.flatMap((sg) => [sg.to, sg.mid].filter(Boolean))].map(toSk), axis);
      let d = R.draw(toSk(o.start)), cur = toSk(o.start);
      for (const sg of o.segs) {
        const to = toSk(sg.to);
        if (Math.hypot(to[0] - cur[0], to[1] - cur[1]) < 1e-9) continue;
        d = sg.t === "arc" ? d.threePointsArcTo(to, toSk(sg.mid)) : d.lineTo(to);
        cur = to;
      }
      const fr = sk.frame, dir = axis === "y" ? fr.yDir : fr.xDir;
      const angle = rollAngle(E(f.angle ?? "360", "Winkel"));
      const ends = plan.center.flatMap((g) => [toAxis(axis, toSk(g.a)), toAxis(axis, toSk(g.b))]);
      const rMean = ends.reduce((sum, p) => sum + Math.abs(p[1]), 0) / ends.length;
      let ang = angle, start = 0;
      if (cut) {
        if (angle < 360 - 1e-9) throw new Error("Trennfuge nur an einer ganz (360°) gewalzten Kontur – sonst ist der Mantel schon offen");
        const ga = gapAngle(cut.gap, rMean);
        ang = 360 - ga; start = cut.pos + ga / 2;
      }
      const skt = d.close().sketchOnPlane(new R.Plane(fr.origin, fr.xDir, fr.normal));
      let solid = ang >= 360 - 1e-9 ? skt.revolve(dir, { origin: fr.origin }) : R.revolution(skt.face(), fr.origin, dir, ang);
      if (Math.abs(start) > 1e-9) solid = solid.rotate(start, fr.origin, dir);
      let fm = null, note = "";
      if (plan.bends.length) note = "Abwicklung nur bei einer geraden Linie (Zylinder, Kegel oder Ring)";
      else if (ang >= 360 - 1e-9) note = "Für die Abwicklung eine Trennfuge setzen";
      else fm = rollFlat(ends[0], ends[1], ang);
      const kindName = { zylinder: "Zylindermantel", kegel: "Kegelmantel", ring: "Kreisring" }[fm?.roll.kind] || "Konturwalze";
      const name = f.name || `${kindName} ${round(t)} mm` + (fm ? `, Abw. ${round(fm.width)} × ${round(fm.height)}` : "");
      const meta = { sheet: { t, flat: fm?.width ?? 0, length: fm?.height ?? 0, bends: plan.bends.map((b) => ({ angle: Math.abs(b.angle), r: b.ri, k: br.kOf ? br.kOf(Math.abs(b.angle)) : k })), bendLines: [], rule: ruleSummary(br), flatModel: fm, roll: { angle: ang, rMean, note } } };
      const info = `${kindName}, ${round(ang)}° gewalzt, mittlerer Radius ${round(rMean)} mm` + (cut ? `, Trennfuge ${round(cut.gap)} mm` : "") + (fm ? ` · Abwicklung ${round(fm.width)} × ${round(fm.height)} mm` + (fm.roll.psi ? ` (Kreisringausschnitt R ${round(fm.roll.R[0])} / ${round(fm.roll.R[1])}, ${round(fm.roll.psi)}°)` : "") : note ? ` · ${note}` : "");
      return { solid, meta, name, info, warn: [...new Set(br.warnings)].join("; ") };
    };

    const applyOp = (op, tool, fid, label) => {
      const bodies = state.bodies;
      const fusable = (x) => x.kind === "solid" && !x.meta?.norm;
      if (op === "new" || (op === "join" && !bodies.some(fusable))) {
        bodies.push({ shape: tool.clone(), kind: "solid", name: label, fid });
        return;
      }
      if (op === "join") {
        const b = bodies.find(fusable);
        b.shape = b.shape.fuse(tool.clone());
        return;
      }
      if (!bodies.length) throw new Error("Kein Körper vorhanden, von dem abgezogen werden kann");
      const tb = tool.boundingBox;
      let touched = 0;
      for (const b of bodies) {
        if (!bboxOverlap(b.shape.boundingBox, tb)) { if (op === "intersect") b.empty = true; continue; }
        b.shape = op === "cut" ? b.shape.cut(tool.clone()) : b.shape.intersect(tool.clone());
        touched++;
      }
      state.bodies = bodies.filter((b) => !b.empty && !isEmptyShape(b.shape));
      if (!touched && op === "cut" && state.status[fid]) state.status[fid].warning = "Schnitt trifft keinen Körper";
    };

    for (let i = startAt; i < feats.length; i++) {
      const f = feats[i];
      currentFeature = f;
      const st = { ok: true };
      state.status[f.id] = st;
      if (f.suppressed) { st.suppressed = true; newCache.push({ key: keys[i], state: null }); continue; }
      try {
        switch (f.type) {
          case "sketch": {
            const sk = JSON.parse(JSON.stringify(f));
            const r = solveSketch(sk, scope, { computeDof: true });
            if (!r.ok) throw new Error(r.error || "Skizze nicht lösbar (widersprüchliche Bemaßung)");
            const frame = planeFrame(resolvePlane(sk.plane, datums.map), E(sk.offset || "0", "Ebenen-Abstand"));
            const prof = extractProfiles(sk, { vars: textVars });
            state.sketches.set(f.id, { sketch: sk, frame, prof, dof: r.dof });
            st.dof = r.dof;
            if (prof.errors.length) st.info = prof.errors.join("; ");
            break;
          }
          case "extrude": {
            const s = getSketch(f.sketch);
            if (s.prof.errors.length && !s.prof.regions.length) throw new Error(s.prof.errors[0]);
            const regions = f.regions && f.regions.length ? s.prof.regions.filter((_, k) => f.regions.includes(k)) : s.prof.regions;
            const d = f.mode === "through" ? 0 : E(f.distance, "Abstand");
            if (f.mode !== "through" && !(d > 0)) throw new Error("Abstand muss > 0 sein");
            let start, len;
            switch (f.mode) {
              case "reverse": start = -d; len = d; break;
              case "symmetric": start = -d / 2; len = d; break;
              case "twoSided": {
                const d2 = E(f.distance2 || "0", "Abstand 2");
                if (!(d + d2 > 0)) throw new Error("Abstand + Abstand 2 muss > 0 sein");
                start = -d2; len = d + d2; break;
              }
              case "through": start = -BIG / 2; len = BIG; break;
              default: start = 0; len = d;
            }
            let tool = extrudeRegions(regions, s.frame, start, len);
            if (keepWall && f.op === "cut" && f.mode !== "through") {
              // Mindest-Restwand: Ende(n) fern der Skizze, symmetrisch/zweiseitig beide
              const N = s.frame.normal, P = (z) => v3.add(s.frame.origin, v3.mul(N, z));
              const top = f.mode === "reverse" ? 0 : restwandShorten(state.bodies, P(start + len), N, tool.boundingBox);
              const bot = f.mode === "reverse" || f.mode === "symmetric" || f.mode === "twoSided" ? restwandShorten(state.bodies, P(start), v3.mul(N, -1), tool.boundingBox) : 0;
              if (top || bot) {
                if (!(len - top - bot > 1e-6)) throw new Error("Tiefe zu klein für die Mindest-Restwand 0,1 mm");
                tool = extrudeRegions(regions, s.frame, start + bot, len - top - bot);
                st.info = `Restwand ${round(RESTWAND)} mm stehen gelassen (Tiefe reichte bis auf die Wand)`;
              }
            }
            state.tools.set(f.id, { op: f.op || "join", shapes: [{ shape: tool, kind: "tool" }] });
            applyOp(f.op || "join", tool, f.id, f.name);
            break;
          }
          case "revolve": {
            const s = getSketch(f.sketch);
            if (!s.prof.regions.length) throw new Error(s.prof.errors[0] || "Keine geschlossene Kontur");
            let origin, dir;
            if (f.axis === "x" || f.axis === "y" || !f.axis) {
              origin = s.frame.origin;
              dir = f.axis === "x" ? s.frame.xDir : s.frame.yDir;
            } else {
              const ln = sketchLines(s.sketch, { includeConstruction: true }).find((l) => l.id === f.axis);
              if (!ln) throw new Error("Rotationsachse fehlt");
              origin = toWorld(s.frame, ln.a[0], ln.a[1]);
              dir = v3.sub(toWorld(s.frame, ln.b[0], ln.b[1]), origin);
            }
            const ang = E(f.angle || "360", "Winkel");
            if (!(ang > 0 && ang <= 360)) throw new Error("Winkel muss zwischen 0° und 360° liegen");
            let tool = null;
            for (const reg of s.prof.regions) {
              const sk = regionToDrawing(reg).sketchOnPlane(makePlane(s.frame));
              const solid = Math.abs(ang - 360) < 1e-9 ? sk.revolve(dir, { origin }) : R.revolution(sk.face(), origin, dir, ang);
              tool = tool ? tool.fuse(solid) : solid;
            }
            state.tools.set(f.id, { op: f.op || "join", shapes: [{ shape: tool, kind: "tool" }] });
            applyOp(f.op || "join", tool, f.id, f.name);
            break;
          }
          case "hole": {
            const s = getSketch(f.sketch);
            const centers = holeCenters(s.sketch);
            if (!centers.length) throw new Error("Skizze enthält keine Bohrungspunkte (Werkzeug »Punkt«)");
            let dia = f.thread && THREADS[f.thread] ? THREADS[f.thread] : E(f.diameter, "Durchmesser");
            if (!(dia > 0)) throw new Error("Durchmesser muss > 0 sein");
            const through = f.extent !== "depth";
            const depth = through ? BIG : E(f.depth, "Tiefe");
            if (!(depth > 0)) throw new Error("Tiefe muss > 0 sein");
            const dirSign = f.direction === "normal" ? 1 : -1;
            let tool = null, kept = 0;
            for (const c of centers) {
              const p = toWorld(s.frame, c[0], c[1]);
              const axisDirs = f.direction === "both" ? [1, -1] : [dirSign];
              for (const sg of axisDirs) {
                const a = v3.mul(s.frame.normal, sg);
                let t = holeTool(p, a, dia / 2, depth, f, E, through);
                // Mindest-Restwand: Bohrgrund genau auf (oder knapp vor) der Rückseite der Wand
                const sh = keepWall && !through ? restwandShorten(state.bodies, v3.add(p, v3.mul(a, depth)), a, t.boundingBox) : 0;
                if (sh) { t = holeTool(p, a, dia / 2, depth - sh, f, E, through); kept++; }
                tool = tool ? tool.fuse(t) : t;
              }
            }
            state.tools.set(f.id, { op: "cut", shapes: [{ shape: tool, kind: "tool" }] });
            applyOp("cut", tool, f.id, f.name);
            st.info = `${centers.length} Bohrung(en) Ø${round(dia)}${f.thread ? " (" + f.thread + ")" : ""}` + (kept ? `, ${kept}× Restwand ${round(RESTWAND)} mm stehen gelassen` : "");
            break;
          }
          case "emboss": {
            // Prägen wie in Inventor: Skizze auf die Oberfläche bringen und vertieft (Gravieren) oder erhaben (Prägen)
            const s = getSketch(f.sketch);
            if (!s.prof.regions.length) throw new Error(s.prof.errors[0] || "Keine geschlossene Kontur in der Skizze");
            const raised = f.mode === "praegen";
            const d = E(f.depth || "0.5", raised ? "Höhe" : "Tiefe");
            if (!(d > 0)) throw new Error((raised ? "Höhe" : "Tiefe") + " muss > 0 sein");
            if (!state.bodies.length) throw new Error("Kein Körper vorhanden, auf den geprägt werden kann");
            const dirs = f.direction === "normal" ? [s.frame.normal] : f.direction === "reverse" ? [v3.mul(s.frame.normal, -1)] : [v3.mul(s.frame.normal, -1), s.frame.normal];
            let tool = null, missed = 0, over = 0, wrapped = 0, projected = 0;
            for (const reg of s.prof.regions) {
              let r = null;
              for (const dir of dirs) { r = embossTool(reg, s.frame, v3.norm(dir), state.bodies, d, raised, f.wrap !== false); if (r) break; }
              if (!r) { missed++; continue; }
              if (r.overEdge) over++;
              if (r.face === "CYLINDER") r.wrapped ? wrapped++ : projected++;
              tool = tool ? tool.fuse(r.tool) : r.tool;
              // erhaben: mit dem getroffenen Körper verbinden (auch Profile), vertieft: aus ihm entfernen
              r.body.shape = raised ? r.body.shape.fuse(r.tool) : r.body.shape.cut(r.tool);
            }
            if (!tool) throw new Error("Die Skizze trifft keine Oberfläche (Richtung prüfen)");
            state.tools.set(f.id, { op: raised ? "join" : "cut", shapes: [{ shape: tool, kind: "tool" }] });
            const n = s.prof.regions.length - missed;
            st.info = `${n} Kontur(en) ${raised ? "geprägt" : "graviert"}, ${round(d)} mm` + (wrapped ? `, ${wrapped} auf dem Rohr abgewickelt` : "") + (projected ? `, ${projected} projiziert` : "");
            const warn = [];
            if (missed) warn.push(`${missed} Kontur(en) treffen keine Fläche`);
            if (over) warn.push(`${over} Kontur(en) über die Kante der Fläche (Gravur über Kante)`);
            if (warn.length) st.warning = warn.join("; ");
            break;
          }
          case "profile": {
            const dims = {};
            for (const [k, v] of Object.entries(f.dims || {})) dims[k] = E(v, k);
            const section = { kind: f.section, dims };
            const L = E(f.length, "Länge");
            if (!(L > 0)) throw new Error("Länge muss > 0 sein");
            const origin = (f.start || ["0", "0", "0"]).map((x, k) => E(x, "Startpunkt " + "XYZ"[k]));
            const zDir = f.axis === "custom" ? (f.dir || ["1", "0", "0"]).map((x) => E(x, "Richtung")) : AXES[f.axis || "X"];
            const fr = memberFrame(origin, zDir, E(f.rotation || "0", "Drehung"));
            const cuts = { start: [], end: [] };
            const m1 = E(f.miterStart || "0", "Gehrung Anfang"), m2 = E(f.miterEnd || "0", "Gehrung Ende");
            for (const [m, label] of [[m1, "Anfang"], [m2, "Ende"]]) {
              if (Math.abs(m) >= 90) throw new Error(`Gehrung ${label} muss zwischen −90° und 90° liegen (ist ${round(m)}°)`);
            }
            const tiltAxis = f.miterAxis === "u" ? fr.v : fr.u; // um welche Querachse gekippt wird
            const rotN = (n, ang) => rotateVec(n, tiltAxis, ang);
            if (Math.abs(m1) > 1e-9) cuts.start.push({ p: fr.origin, n: rotN(v3.mul(fr.z, -1), m1) });
            const endP = v3.add(fr.origin, v3.mul(fr.z, L));
            if (Math.abs(m2) > 1e-9) cuts.end.push({ p: endP, n: rotN(fr.z, f.miterSame ? m2 : -m2) });
            const minL = miterMinLength(section, fr, tiltAxis, cuts);
            if (L < minL - 1e-6) throw new Error(`Profil zu kurz für die Gehrungen: Länge mindestens ${round(minL)} mm, sonst kreuzen sich die Schnitte`);
            // Enden in 2D oder 3D: Einstellung des Profils, gilt für beide Enden
            const cut = cutCfg(f);
            const { solid: s0, geom, ends, notes } = memberWithEnds(section, L, fr, cuts, cut);
            let solid = s0;
            const swivel = cut.swivel;
            if (notes.length) st.warning = notes.join("; ");
            // Konturen am Rohr (Rohr-Editor): ungültige werden übersprungen und gemeldet, das Profil bleibt
            const prof = { kind: f.section, W: geom.width, H: geom.height, t: dims.t, r: dims.r ?? 0, L, swivel, mode: cut.mode };
            const tc = planTubeCuts(f.cuts, prof, E);
            if (tc.issues.length) st.warning = [st.warning, ...tc.issues.map((x) => x.message)].filter(Boolean).join("; ");
            for (const it of tc.items) for (const x of it.xs) for (const tool of [].concat(tubeCutTool(it, x, fr, geom, prof))) solid = solid.cut(tool);
            if (tc.items.length) st.info = `${tc.pierces} Kontur(en), Schneidweg Innenkonturen ${round(tc.cutLength)} mm`;
            const name = sectionName(f.section, dims);
            const meta = { section: name, profileId: profileId(f.section, dims), area: geom.area, length: memberLength(solid, fr), miterStart: m1, miterEnd: m2, frameZ: fr.z, sec: { kind: f.section, dims } };
            meta.endCuts = ends;
            meta.axis = memberAxis(solid, fr, geom);
            meta.miterParts = { A: cutParts(cuts.start, fr), B: cutParts(cuts.end, fr) };
            if (tc.items.length) Object.assign(meta, { tube: { kind: f.section, W: geom.width, H: geom.height, t: dims.t, r: dims.r ?? 0, L }, contours: tc.items, cutLength: tc.cutLength, pierces: tc.pierces, cutSig: hashString(JSON.stringify(tc.items)) });
            state.tools.set(f.id, { op: f.op || "member", shapes: [{ shape: solid, kind: "member", meta, name: f.name || name }] });
            pushMember(state, solid, f, meta, f.name || name);
            break;
          }
          case "frame": {
            const s = getSketch(f.sketch);
            const dims = {};
            for (const [k, v] of Object.entries(f.dims || {})) dims[k] = E(v, k);
            const section = { kind: f.section, dims };
            const members = buildFrame(s, section, f, E, cutCfg(f));
            const list = [];
            for (const m of members) {
              pushMember(state, m.solid, f, m.meta, m.name);
              list.push({ shape: m.solid, kind: "member", meta: m.meta, name: m.name });
            }
            state.tools.set(f.id, { op: "member", shapes: list });
            st.info = `${members.length} Profil(e)`;
            if (members.warnings?.length) st.warning = members.warnings.join("; ");
            break;
          }
          case "profilzug": {
            const dims = {};
            for (const [k, v] of Object.entries(f.dims || {})) dims[k] = E(v, k);
            const pts = resolvePathPoints(f.points, E);
            const up = UP_AXES[f.up || "Z"] || UP_AXES.Z;
            const rolls = (f.points || []).map((p, i) => E(p.roll || "0", `Punkt ${i + 1} Drehung`));
            const members = buildMembers(pathSegments(pts, !!f.closed), { kind: f.section, dims }, f, E, cutCfg(f), (z) => upFor(z, up), f.name || "Profilzug", (i) => rolls[i] || 0);
            const list = [];
            for (const m of members) {
              pushMember(state, m.solid, f, m.meta, m.name);
              list.push({ shape: m.solid, kind: "member", meta: m.meta, name: m.name });
            }
            state.tools.set(f.id, { op: "member", shapes: list });
            st.info = `${members.length} Profil(e), Mittellinie ${round(pathLength(pts, !!f.closed))} mm`;
            if (members.warnings?.length) st.warning = members.warnings.join("; ");
            break;
          }
          case "platte": {
            const tool = state.tools.get(f.target);
            if (!tool) throw new Error(missingRef(f.target, "Profil", f));
            const mi = Math.round(E(String(f.member ?? 0), "Stab"));
            const mem = tool.shapes.filter((x) => x.kind === "member")[mi];
            if (!mem?.meta?.axis) throw new Error(`Stab ${mi + 1} nicht gefunden – Profil, Rahmen oder Profilzug wählen`);
            const ax = mem.meta.axis, endB = f.end === "B";
            const num = (k, label) => E(f[k] === "" || f[k] == null ? "0" : String(f[k]), label);
            const plan = platePlan(ax, { thickness: num("thickness", "Dicke"), overhang: num("overhang", "Überstand"), width: num("width", "Breite"), height: num("height", "Höhe"), radius: num("radius", "Eckradius"), holes: num("holes", "Bohrungen"), holeDia: num("holeDia", "Bohrung Ø"), edge: num("edge", "Randabstand") });
            const miter = endB ? mem.meta.miterEnd : mem.meta.miterStart;
            if (Math.abs(miter || 0) > 0.05) plan.issues.push({ level: "Warnung", message: `Stabende ${endB ? "B" : "A"} ist auf Gehrung geschnitten (${round(miter)}°) – Platte steht schräg ab` });
            const P = v3.add(ax.origin, v3.mul(ax.z, endB ? ax.hi : ax.lo));
            const nrm = endB ? ax.z : v3.mul(ax.z, -1);
            let d = R.drawRoundedRectangle(plan.W, plan.H, plan.r || 0);
            for (const [x, y] of plan.holes) d = d.cut(R.drawCircle(plan.d / 2).translate(x, endB ? y : -y));
            const solid = d.sketchOnPlane(new R.Plane(P, ax.u, nrm)).extrude(plan.t);
            const name = f.name || `Platte ${round(plan.W)}x${round(plan.H)}x${round(plan.t)}`;
            const meta = { plate: { W: plan.W, H: plan.H, t: plan.t, holes: plan.holes.length, d: plan.d }, partOf: mem.name };
            const shapes = [{ shape: solid, kind: "solid", meta, name }];
            state.bodies.push({ shape: solid, kind: "solid", name, fid: f.id, meta });
            // Gegenplatte (Stoß zweier Stäbe) und Verschraubung (M15)
            let boltInfo = "";
            if (f.counter) {
              const c2 = solid.clone().translate(v3.mul(nrm, plan.t));
              const m2 = { ...meta, counter: true };
              state.bodies.push({ shape: c2, kind: "solid", name: name + " Gegenplatte", fid: f.id, meta: m2 });
              shapes.push({ shape: c2, kind: "solid", meta: m2, name: name + " Gegenplatte" });
            }
            if (f.bolts && plan.holes.length) {
              const size = f.boltSize || boltSizeForHole(plan.d);
              if (!size) throw new Error(`Bohrung Ø ${round(plan.d)} zu klein für eine Schraube ab M6`);
              if (NORM_THREADS[size].d > plan.d - 0.9) throw new Error(`${size} passt nicht durch Ø ${round(plan.d)}`);
              const clamp = plan.t * (f.counter ? 2 : 1) + num("clampExtra", "zusätzliche Klemmlänge");
              const yDir = v3.cross(nrm, ax.u);
              let L = 0;
              for (const [x, y] of plan.holes) L = pushBoltSet(state, f, shapes, size, clamp, v3.add(P, v3.add(v3.mul(ax.u, x), v3.mul(yDir, endB ? y : -y))), nrm, f.boltGrade || "8.8", !!f.galv);
              boltInfo = `, ${plan.holes.length} × ${size} x ${L} (Klemmlänge ${round(clamp)} mm)`;
            }
            state.tools.set(f.id, { op: "new", shapes, plate: { ax, P, nrm, W: plan.W, H: plan.H, t: plan.t } });
            const wa = num("weldA", "Nahtdicke a");
            if (wa > 0) state.welds.push({ fid: f.id, kind: "kehl", a: wa, side: "pfeil", around: true, field: false, length: ax.perimeter, p3: v3.add(P, v3.mul(ax.v, ax.height / 2)), name });
            st.info = `${round(plan.W)} × ${round(plan.H)} × ${round(plan.t)} mm` + (plan.holes.length ? `, ${plan.holes.length} × Ø ${round(plan.d)}` : "") + ` an ${mem.name}, Ende ${endB ? "B" : "A"}` + boltInfo;
            if (plan.issues.length) st.warning = plan.issues.map((x) => x.message).join("; ");
            break;
          }
          case "rippe": {
            const pt = state.tools.get(f.plate)?.plate;
            if (!pt) throw new Error(missingRef(f.plate, "Platte", f));
            const num = (k, label) => E(f[k] === "" || f[k] == null ? "0" : String(f[k]), label);
            const o = { length: num("length", "Länge"), height: num("height", "Höhe"), thickness: num("thickness", "Dicke"), chamfer: num("chamfer", "Freischnitt") };
            const sides = (f.sides || []).filter((x) => RIB_SIDES[x]);
            if (!sides.length) throw new Error("Rippe: mindestens eine Seite wählen");
            const inward = v3.mul(pt.nrm, -1);
            const list = [];
            for (const side of sides) {
              const rp = ribPlan(side, pt.ax, pt, o);
              const n = { oben: pt.ax.v, unten: v3.mul(pt.ax.v, -1), rechts: pt.ax.u, links: v3.mul(pt.ax.u, -1) }[side];
              const w = v3.cross(n, inward); // Plattennormale der Rippe; Skizze: x = Seite (s), y = in den Stab (a)
              const pts = rp.poly.map(([s, a]) => [s, a]);
              let dr = R.draw(pts[0]);
              for (const q of pts.slice(1)) dr = dr.lineTo(q);
              const solid = dr.close().sketchOnPlane(new R.Plane(v3.sub(pt.P, v3.mul(w, rp.t / 2)), n, w)).extrude(rp.t);
              const name = `${f.name || "Rippe"} ${RIB_SIDES[side].split(" ")[0].toLowerCase()}`;
              const meta = { rib: { L: rp.L, H: rp.Hr, t: rp.t, c: rp.c } };
              list.push({ shape: solid, kind: "solid", meta, name });
              state.bodies.push({ shape: solid, kind: "solid", name, fid: f.id, meta });
              const wa = num("weldA", "Nahtdicke a");
              if (wa > 0) state.welds.push({ fid: f.id, kind: "kehl", a: wa, side: "beide", around: false, field: false, length: rp.L - rp.c + rp.Hr - rp.c, p3: v3.add(v3.add(pt.P, v3.mul(n, rp.s0 + rp.Hr / 3)), v3.mul(inward, rp.L / 3)), name });
            }
            state.tools.set(f.id, { op: "new", shapes: list });
            st.info = `${list.length} Rippe(n) ${round(o.length)} mm lang, ${round(o.thickness)} mm dick`;
            break;
          }
          case "genteil": // Einzelteil eines Generators (Baugruppe mit Einzelteilen): ein Körper des Bauplans in eigener Lage
          case "generator": {
            const gen = GENERATORS[f.gen];
            if (!gen && f.gen !== "gestell") throw new Error("Unbekannter Generator");
            // Gestell (Inventor-Gestellgenerator): Skelettlinien und Einstellungen liegen fertig in params.input
            let plan = f.gen === "gestell" ? gestellPlan(f.params?.input) : gen.plan(resolveGenParams(f.gen, f.params, E));
            if (f.type === "genteil") {
              const body = planBodies(plan).find((b) => b.key === f.key);
              if (!body) throw new Error(`Teil »${f.body || f.key}« gibt es im Generator nicht mehr`);
              plan = { ...localPlan(plan, body), info: body.name };
            }
            const list = [];
            const cut = cutCfg(f);
            const add = (solid, meta, name) => { pushMember(state, solid, f, meta, name); list.push({ shape: solid, kind: "member", meta, name }); };
            const metaOf = (sec, solid, fr, extra = {}) => ({ section: sectionName(sec.kind, sec.dims), profileId: profileId(sec.kind, sec.dims), area: sec.geom.area, length: memberLength(solid, fr), miterStart: 0, miterEnd: 0, frameZ: fr.z, axis: memberAxis(solid, fr, sec.geom), generator: f.gen, sec: { kind: sec.kind, dims: sec.dims }, ...extra });
            // Bohrungen (z. B. Handlaufhalter): Zylinder ab p in Richtung dir, nur am Stab, durch dessen Achse p geht
            const drillsOf = (name, A, B, size) => (plan.drills || []).filter((d) => {
              if (d.target !== name) return false;
              const ab = v3.sub(B, A), L2 = v3.dot(ab, ab), t = Math.max(0, Math.min(1, v3.dot(v3.sub(d.p, A), ab) / (L2 || 1)));
              return v3.dist(d.p, v3.add(A, v3.mul(ab, t))) <= size / 2 + 5;
            });
            // rund (d) oder rechteckig (w quer entlang xDir × h), z. B. Durchbruch für einen Gurt im Pfosten
            const drillTool = (d) => (d.w ? R.drawRectangle(d.w, d.h).sketchOnPlane(new R.Plane(d.p, d.xDir, v3.norm(d.dir))).extrude(d.len) : R.makeCylinder(d.d / 2, d.len, d.p, v3.norm(d.dir)));
            const drill = (solid, list) => list.reduce((sh, d) => sh.cut(drillTool(d)), solid);
            for (const ch of plan.chains) {
              const segs = ch.points.slice(1).map((b, i) => ({ id: "s" + (i + 1), a: ch.points[i], b }));
              const ms = buildMembers(segs, { kind: ch.section.kind, dims: ch.section.dims }, { corner: "gehrung", align: "mitte", rotation: String(ch.rot || 0) }, E, cut, () => ch.up || [0, 0, 1], ch.name);
              const g = ch.section.geom || sectionGeometry(ch.section.kind, ch.section.dims); // Kette oft nur mit kind/dims
              const size = Math.max(g?.width || 0, g?.height || 0);
              ms.forEach((m, i) => {
                if (ch.onlySeg != null && i !== ch.onlySeg) return;
                const ds = segs[i] ? drillsOf(ch.name, segs[i].a, segs[i].b, size) : [];
                add(drill(m.solid, ds), { ...m.meta, generator: f.gen, ...(ds.length ? { drills: ds.length, drillD: ds[0].d ?? `${ds[0].w}x${ds[0].h}` } : {}) }, ch.segName || (ms.length > 1 ? m.name : ch.name));
              });
            }
            for (const m of plan.members) {
              const L = v3.dist(m.a, m.b);
              if (!(L > 1e-6)) continue;
              const fr = memberFrame(m.a, v3.sub(m.b, m.a), m.rot || 0, m.up);
              const cuts = m.cuts || { start: [], end: [] };
              // plain: ebener Sägeschnitt ohne Laser-Endbearbeitung (Fachwerk-Füllstäbe an Gurtflächen)
              let { solid } = m.plain ? makeMember({ kind: m.section.kind, dims: m.section.dims }, L, fr, cuts) : memberWithEnds({ kind: m.section.kind, dims: m.section.dims }, L, fr, cuts, cut);
              // Hüllkörper anderer Stäbe abziehen (Gestell: Nuten, Stutzen an Rundrohr)
              for (const c of m.copes || []) {
                if (c.path) { solid = solid.cut(sweepAlong(c.path, c.section.geom || sectionGeometry(c.section.kind, c.section.dims), true)); continue; }
                const cl = v3.dist(c.a, c.b);
                if (cl > 1e-6) solid = solid.cut(makeMember({ kind: c.section.kind, dims: c.section.dims }, cl, memberFrame(c.a, v3.sub(c.b, c.a), c.rot || 0, c.up), c.cuts || { start: [], end: [] }, { envelope: true }).solid);
              }
              // angesetzte Zapfen (Gestell: Stecknasen), Quader w × h ab p in Richtung dir
              for (const t of m.tabs || []) solid = solid.fuse(R.drawRectangle(t.w, t.h).sketchOnPlane(new R.Plane(t.p, t.xDir, v3.norm(t.dir))).extrude(t.len));
              // einzelner Stab: alle Bohrungen am Umfang (auch Schlitze nahe der Ecken, daher Diagonale)
              const ds = drillsOf(m.name, m.a, m.b, Math.hypot(m.section.geom.width, m.section.geom.height));
              add(drill(solid, ds), metaOf(m.section, solid, fr, { miterStart: cutAngle(cuts.start, fr.z), miterEnd: cutAngle(cuts.end, fr.z), miterParts: { A: cutParts(cuts.start, fr), B: cutParts(cuts.end, fr) }, ...(m.copes?.length ? { coped: true } : {}), ...(ds.length ? { drills: ds.length, drillD: ds[0].d ?? `${ds[0].w}x${ds[0].h}` } : {}) }), m.name);
            }
            // gebogene/gewalzte Profile (Wendel-Handlauf, Ring, Bogen): ein Körper entlang der Mittellinie
            for (const tb of plan.tubes || []) {
              const g = tb.section.geom || sectionGeometry(tb.section.kind, tb.section.dims);
              const ds = (plan.drills || []).filter((d) => d.target === (tb.target || tb.name) && pathDistance(tb.path, d.p) <= Math.max(g.width, g.height) / 2 + 5);
              // Booleans an der langen Freiformfläche sind sehr langsam: mit vielen Bohrungen (Handlaufhalter an der Wendel) in
              // kurzen Abschnitten (≤ 30°) ziehen und bohren, als ein Körper (Verbund) zusammengesetzt
              const n = ds.length > 2 ? Math.max(1, Math.ceil(Math.abs(tb.path.sweep) / 30)) : 1, rad = Math.max(g.width, g.height) / 2 + 5;
              const pieces = (n > 1 ? splitPath(tb.path, tubeLength(tb.path) / n + 1e-6) : [tb.path]).map((pa, k) => {
                let sh = sweepAlong(pa, g);
                for (const c of tb.cuts || []) sh = sh.cut(halfSpace(c.p, c.n, BIG));
                for (const c of tb.copes || []) if (c.path) sh = sh.cut(sweepAlong(c.path, c.section.geom || sectionGeometry(c.section.kind, c.section.dims), true));
                // Bohrung dem Abschnitt zuordnen, in dem ihr Punkt liegt (am Stoß beiden)
                return drill(sh, n > 1 ? ds.filter((d) => pathDistance(pa, d.p) <= rad) : ds);
              });
              const solid = pieces.length > 1 ? R.makeCompound(pieces) : pieces[0];
              const meta = { section: sectionName(tb.section.kind, tb.section.dims), profileId: profileId(tb.section.kind, tb.section.dims), area: g.area, length: tubeLength(tb.path), miterStart: 0, miterEnd: 0, generator: f.gen, sec: { kind: tb.section.kind, dims: tb.section.dims },
                rolled: { radius: bendRadius(tb.path), angle: Math.abs(tb.path.sweep), rise: tb.path.rise || 0 }, ...(ds.length ? { drills: ds.length, drillD: ds[0].d ?? `${ds[0].w}x${ds[0].h}` } : {}) };
              add(solid, meta, tb.name);
            }
            for (const pl of plan.plates) {
              let d;
              if (pl.poly) { d = R.draw(pl.poly[0]); for (const q of pl.poly.slice(1)) d = d.lineTo(q); d = d.close(); }
              else d = R.drawRoundedRectangle(pl.W, pl.H, pl.r || 0);
              for (const [x, y, hd] of pl.holes || []) d = d.cut(R.drawCircle((hd || pl.d) / 2).translate(x, y)); // [x, y, Ø?] – eigener Ø je Loch (Gegenbohrung)
              for (const [x, y, len] of pl.slots || []) d = d.cut(R.drawRoundedRectangle(len, pl.d, pl.d / 2 - 0.01).translate(x, y)); // Langloch entlang xDir
              for (const [x, y, w, hh] of pl.rects || []) d = d.cut(R.drawRectangle(w, hh).translate(x, y)); // Rechteckausschnitt (Steckschlitz)
              // Bohrungen quer zur Plattenebene (z. B. im Schenkel eines Pfettenschuhs): drills mit dem Plattennamen
              const pds = (plan.drills || []).filter((x) => x.target === pl.name);
              const solid = drill(d.sketchOnPlane(new R.Plane(pl.center, pl.xDir, pl.normal)).extrude(pl.t), pds);
              const meta = { plate: { W: pl.W, H: pl.H, t: pl.t, holes: (pl.holes || []).length + pds.length, ...(pl.slots?.length ? { slots: pl.slots.length } : {}), d: pl.d }, glass: !!pl.glass, tread: pl.tread, generator: f.gen };
              const dens = pl.glass ? FILL_DENSITY.glas : FILL_DENSITY[pl.tread];
              if (dens) meta.density = dens;
              state.bodies.push({ shape: solid, kind: "solid", name: pl.name, fid: f.id, meta });
              list.push({ shape: solid, kind: "solid", meta, name: pl.name });
            }
            for (const n of plan.norms || []) {
              if (n.bolt) pushBoltSet(state, f, list, n.size, n.clamp, n.pos, v3.norm(n.dir), n.grade || "8.8", !!n.galv);
              else pushNorm(state, f, list, n, n.pos, v3.norm(n.dir));
            }
            state.tools.set(f.id, { op: "member", shapes: list });
            st.info = plan.info;
            if (plan.issues.length) st.warning = plan.issues.map((x) => x.message).join("; ");
            break;
          }
          case "naht": {
            if (!WELD_KINDS[f.kind || "kehl"]) throw new Error("Unbekannte Nahtart");
            const a = E(f.a || "0", WELD_KINDS[f.kind || "kehl"].dim + "-Maß");
            if (!(a > 0)) throw new Error("Nahtmaß muss > 0 sein");
            const refs = f.edges || [];
            if (!refs.length) throw new Error("Keine Kanten gewählt – Kanten im 3D-Fenster anklicken");
            let length = 0, miss = 0, p3 = null;
            const found = [];
            for (const ref of refs) {
              let best = null, bd = Infinity;
              for (const b of state.bodies) {
                const bb = b.shape.boundingBox;
                if (!pointInBox(ref.p, bb, 1)) continue;
                for (const e of b.shape.edges) {
                  if (ref.type && e.geomType !== ref.type) continue;
                  const d = v3.dist(edgeMid(e), ref.p);
                  if (d < bd) { bd = d; best = e; }
                }
              }
              if (!best || bd > 0.5) { miss++; continue; }
              length += R.measureLength(best);
              p3 = p3 || edgeMid(best);
              found.push(best);
            }
            if (!p3) throw new Error("Gewählte Kanten nicht mehr gefunden");
            state.welds.push({ fid: f.id, kind: f.kind || "kehl", a, side: f.side || "pfeil", around: !!f.around, field: !!f.field, length, p3, name: f.name });
            st.info = `${WELD_KINDS[f.kind || "kehl"].dim}${round(a)}, ${round(length)} mm an ${refs.length - miss} Kante(n)`;
            const warn = miss ? [`${miss} Kante(n) nicht mehr gefunden`] : [];
            // Schweißbaugruppe (Stufe 53): Kehlnaht als Körper (Dreiecksquerschnitt in der Kehle zwischen zwei Teilen)
            if (f.bead) {
              if ((f.kind || "kehl") !== "kehl") throw new Error("Naht als Körper gibt es nur für Kehlnähte");
              let bead = null, vol = 0, skip = 0;
              for (const e of found) {
                const r = beadSolid(e, a, state.bodies);
                if (!r) { skip++; continue; }
                bead = bead ? bead.fuse(r.shape) : r.shape;
                vol += r.volume;
              }
              if (skip) warn.push(`${skip} Kante(n) ohne Kehle zwischen zwei Teilen (nur gerade Kanten) – dort kein Nahtkörper`);
              if (bead) {
                state.bodies.push({ shape: bead, kind: "solid", name: f.name || "Schweißnaht", fid: f.id, meta: { weld: true } });
                st.info += `, Nahtkörper ${String(round(vol / 1000)).replace(".", ",")} cm³`;
              }
            }
            if (warn.length) st.warning = warn.join("; ");
            break;
          }
          case "regelkoerper": {
            const kind = f.kind || "zylinder";
            const d = {};
            for (const k of REGEL_KINDS[kind]?.fields || []) d[k] = E(f.dims?.[k] ?? "0", k);
            checkRegel(kind, d);
            const pos = (f.pos || ["0", "0", "0"]).map((x, k) => E(x, "Basispunkt " + "XYZ"[k]));
            const dir = f.axis === "custom" ? (f.dir || ["0", "0", "1"]).map((x) => E(x, "Richtung")) : AXES[f.axis || "Z"];
            const tool = orientZ(regelSolid(kind, d), dir, pos);
            state.tools.set(f.id, { op: f.op || "join", shapes: [{ shape: tool, kind: "tool" }] });
            applyOp(f.op || "join", tool, f.id, f.name);
            break;
          }
          case "kantteil": {
            const spec = sheetSpec(f);
            const r = sheetBuild(f, spec, []);
            state.tools.set(f.id, { op: "new", shapes: [{ shape: r.solid, kind: "solid", meta: r.meta, name: r.name }], sheet: { spec, extras: [] } });
            state.bodies.push({ shape: r.solid, kind: "solid", name: r.name, fid: f.id, meta: r.meta });
            st.info = r.info;
            if (r.warn) st.warning = r.warn;
            break;
          }
          case "blechkasten": {
            const r = boxBuild(f);
            if (r.src) state.bodies.splice(state.bodies.indexOf(r.src), 1);
            state.bodies.push({ shape: r.solid, kind: "solid", name: r.name, fid: f.id, meta: r.meta });
            st.info = r.info;
            if (r.warn) st.warning = r.warn;
            break;
          }
          case "lasche":
          case "umschlag":
          case "durchzug":
          case "eckeschliessen":
          case "stanzung": {
            const bi = feats.findIndex((g) => g.id === f.base);
            const tool = state.tools.get(f.base);
            if (bi < 0 || bi > i || !tool?.sheet) throw new Error(missingRef(f.base, "Kantteil", f));
            const between = feats.slice(bi + 1, i).find((g) => !g.suppressed && !["sketch", "arbeitsebene", "arbeitsachse", "arbeitspunkt", ...SHEET_FEATURES].includes(g.type));
            if (between) throw new Error(`Blech-Features direkt hinter das Kantteil stellen – »${between.name || between.type}« dazwischen verändert den Körper`);
            const body = state.bodies.find((b) => b.fid === f.base && b.meta?.sheet);
            if (!body) throw new Error("Körper des Kantteils fehlt");
            const extras = [...tool.sheet.extras, sheetExtra(f, tool.sheet.spec)];
            const r = sheetBuild(feats[bi], tool.sheet.spec, extras);
            body.shape = r.solid; body.meta = r.meta; body.name = r.name;
            state.tools.set(f.base, { ...tool, shapes: [{ shape: r.solid, kind: "solid", meta: r.meta, name: r.name }], sheet: { spec: tool.sheet.spec, extras } });
            st.info = r.info;
            if (r.warn) st.warning = r.warn;
            break;
          }
          case "schraubverbindung": {
            const s = getSketch(f.sketch, "Skizze mit Schraubenpunkten");
            const centers = holeCenters(s.sketch);
            if (!centers.length) throw new Error("Skizze enthält keine Punkte für die Schrauben (Werkzeug »Punkt«)");
            const size = f.size || "M12", joint = f.joint === "gewinde" ? "gewinde" : "durchsteck";
            const kind = f.bolt === "schraube4014" ? "schraube4014" : "schraube4017", grade = f.grade || "8.8";
            const nutG = { "8.8": "8", "10.9": "10" }[grade] || grade, washG = /^A[24]/.test(grade) ? grade.slice(0, 2) : "200 HV";
            const a = v3.mul(s.frame.normal, f.direction === "normal" ? 1 : -1);
            const solids = state.bodies.filter((b) => (b.kind === "solid" || b.kind === "member") && !b.meta?.norm);
            const list = [], rows = new Map(), warn = new Set();
            for (const c of centers) {
              const p = toWorld(s.frame, c[0], c[1]);
              const needle = R.makeCylinder(0.02, 2 * BIG, v3.sub(p, v3.mul(a, BIG)), a);
              const hits = [];
              for (const b of solids) {
                if (!bboxOverlap(b.shape.boundingBox, needle.boundingBox)) continue;
                let common;
                try { common = b.shape.intersect(needle); } catch { continue; }
                if (isEmptyShape(common)) continue;
                const [lo, hi] = common.boundingBox.bounds;
                const ts = [];
                for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) ts.push(v3.dot(v3.sub([x, y, z], p), a));
                hits.push({ b, span: [Math.min(...ts), Math.max(...ts)] });
              }
              const stack = clampStack(hits.map((x) => x.span), joint);
              const set = boltStack(size, stack.clamp, { kind, washerHead: f.washerHead !== false, washerNut: f.washerNut !== false, joint, grip: stack.grip });
              for (const w of checkNorm(kind, size, set.length)) warn.add(w);
              const O = v3.add(p, v3.mul(a, stack.start));
              if (f.hole !== false) {
                for (const hd of boltHoles(size, stack, set, joint)) {
                  const tool = R.makeCylinder(hd.d / 2, hd.z1 - hd.z0, v3.add(O, v3.mul(a, hd.z0)), a);
                  for (const x of hits) x.b.shape = x.b.shape.cut(tool);
                }
              }
              for (const part of set.parts) {
                const g = part.kind === "mutter" ? nutG : part.kind === "scheibe" ? washG : grade;
                pushNorm(state, f, list, { kind: part.kind, size, length: part.length, grade: g, galv: !!f.galv }, v3.add(O, v3.mul(a, part.z0)), a);
              }
              const de = (x) => String(round(x)).replace(".", ",");
              const key = `${size} x ${set.length}, Klemmlänge ${de(stack.clamp)} mm` + (joint === "gewinde" ? `, Einschraubtiefe ${de(set.engage)} mm` : "");
              rows.set(key, (rows.get(key) || 0) + 1);
            }
            state.tools.set(f.id, { op: "new", shapes: list });
            st.info = [...rows].map(([k, n]) => `${n} × ${k}`).join("; ") + ` · ${NORM_KINDS[kind].norm}` + (joint === "gewinde" ? ", Gewinde im letzten Teil" : ", mit Mutter ISO 4032") + (f.hole !== false ? ", Bohrungen gesetzt" : "");
            if (warn.size) st.warning = [...warn].join("; ");
            break;
          }
          case "konturwalzen": {
            const r = rollBuild(f);
            state.tools.set(f.id, { op: "new", shapes: [{ shape: r.solid, kind: "solid", meta: r.meta, name: r.name }], roll: true });
            state.bodies.push({ shape: r.solid, kind: "solid", name: r.name, fid: f.id, meta: r.meta });
            st.info = r.info;
            if (r.warn) st.warning = r.warn;
            break;
          }
          case "trennfuge": {
            const bi = feats.findIndex((g) => g.id === f.base);
            const tool = state.tools.get(f.base);
            if (bi < 0 || bi > i || !tool?.roll) throw new Error(missingRef(f.base, "Konturwalze", f));
            const between = feats.slice(bi + 1, i).find((g) => !g.suppressed && !["sketch", "arbeitsebene", "arbeitsachse", "arbeitspunkt"].includes(g.type));
            if (between) throw new Error(`Trennfuge direkt hinter die Konturwalze stellen – »${between.name || between.type}« dazwischen verändert den Körper`);
            const body = state.bodies.find((b) => b.fid === f.base && b.meta?.sheet);
            if (!body) throw new Error("Körper der Konturwalze fehlt");
            const r = rollBuild(feats[bi], { gap: E(f.gap ?? "1", "Breite"), pos: E(f.pos ?? "0", "Lage") });
            body.shape = r.solid; body.meta = r.meta; body.name = r.name;
            state.tools.set(f.base, { ...tool, shapes: [{ shape: r.solid, kind: "solid", meta: r.meta, name: r.name }] });
            st.info = r.info;
            if (r.warn) st.warning = r.warn;
            break;
          }
          case "welle":
          case "zahnrad":
          case "lager":
          case "feder": {
            // Konstruktions-Assistent (Stufe 55): Körper in Achse Z am Ursprung bauen, dann an pos / axis drehen
            const pos = (f.pos || ["0", "0", "0"]).map((x, k) => E(x, "Basispunkt " + "XYZ"[k]));
            const dir = f.axis === "custom" ? (f.dir || ["0", "0", "1"]).map((x) => E(x, "Richtung")) : AXES[f.axis || "Z"];
            const r = assistSolid(f, E);
            const solid = orientZ(r.shape, dir, pos);
            const body = { shape: solid, kind: "solid", name: f.name || r.name, fid: f.id, meta: r.meta };
            state.bodies.push(body);
            state.tools.set(f.id, { op: "new", shapes: [{ shape: solid, kind: r.meta?.norm ? "norm" : "solid", meta: r.meta, name: body.name }] });
            st.info = r.info;
            if (r.warn) st.warning = r.warn;
            break;
          }
          case "normteil": {
            const kind = f.kind || "schraube4017";
            const L = NORM_KINDS[kind]?.length ? E(f.length ?? "40", "Länge") : 0;
            const warn = checkNorm(kind, f.size, L);
            const pos = (f.pos || ["0", "0", "0"]).map((x, k) => E(x, "Basispunkt " + "XYZ"[k]));
            const dir = f.axis === "custom" ? (f.dir || ["0", "0", "1"]).map((x) => E(x, "Richtung")) : AXES[f.axis || "Z"];
            const list = [];
            const b = pushNorm(state, f, list, { kind, size: f.size, length: L, grade: f.grade, galv: f.galv, name: f.name }, pos, dir);
            state.tools.set(f.id, { op: "new", shapes: list });
            st.info = b.meta.norm.designation;
            if (warn.length) st.warning = warn.join("; ");
            break;
          }
          case "biegerohr": {
            const dims = {};
            for (const [k, v] of Object.entries(f.dims || {})) dims[k] = E(v, k);
            if (!BIEGEROHR_SECTIONS.includes(f.section)) throw new Error("Biegerohr: nur Rundrohr oder Rundstahl");
            const geom = sectionGeometry(f.section, dims);
            const plan = planBends(resolvePathPoints(f.points, E), E(f.radius, "Biegeradius"), geom.width);
            const solid = sweepTube(plan.pieces, geom);
            const name = sectionName(f.section, dims);
            const meta = { section: name, profileId: profileId(f.section, dims), area: geom.area, length: plan.length, miterStart: 0, miterEnd: 0, bends: plan.bends.map((b) => ({ ...b })), lastStraight: plan.last, bendRadius: E(f.radius, "Biegeradius") };
            state.tools.set(f.id, { op: f.op || "member", shapes: [{ shape: solid, kind: "member", meta, name: f.name || name }] });
            pushMember(state, solid, f, meta, f.name || name);
            st.info = `Abwicklung ${round(plan.length)} mm, ${plan.bends.length} Biegung(en)`;
            if (plan.issues.length) st.warning = plan.issues.map((x) => x.message).join("; ");
            break;
          }
          case "knickrahmen": {
            const kr = buildKnickrahmen(f, E, part.material || "S235");
            // ein Bauteil (eine Zuschnittzeile in Abwicklungslänge); gefaltet mit sichtbarer Gehrungslinie
            const shown = [{ shape: f.view === "abgewickelt" ? kr.flat : kr.folded, kind: "member", meta: kr.meta, name: kr.name }];
            state.tools.set(f.id, { op: "member", shapes: shown });
            for (const x of shown) pushMember(state, x.shape, f, x.meta, x.name);
            st.info = `Abwicklung ${round(kr.meta.length)} mm, ${kr.meta.knicks} Ausklinkung(en)` + (kr.meta.knicks ? `, Biegezugabe ${kr.meta.bendAllowances.map(round).join(" / ")} mm` : "") + (kr.meta.knicks && (f.bendRule || "k") !== "k" ? ` · ${kr.meta.rule}` : "") + (f.view === "abgewickelt" ? "" : " · für den Rohrlaser Ansicht »Abgewickelt« exportieren");
            if (kr.warnings.length) st.warning = kr.warnings.join("; ");
            break;
          }
          case "fillet":
          case "chamfer": {
            const r = E(f.radius, f.type === "fillet" ? "Radius" : "Abstand");
            if (!(r > 0)) throw new Error("Wert muss > 0 sein");
            let total = 0, miss = 0;
            for (const b of state.bodies) {
              const seams = seamEdges(b.shape);
              let fn;
              if (f.mode === "all") fn = () => r;
              else if (f.mode === "dir") {
                const ax = AXES[f.dir || "Z"];
                fn = (e) => {
                  if (e.geomType !== "LINE") return null;
                  const d = v3.norm(v3.sub(tuple(e.endPoint), tuple(e.startPoint)));
                  return Math.abs(Math.abs(v3.dot(d, ax)) - 1) < 1e-6 ? r : null;
                };
              } else {
                const bb = b.shape.boundingBox;
                const tol = Math.max(0.5, 0.01 * Math.hypot(bb.width, bb.height, bb.depth));
                const refs = (f.edges || []).filter((ref) => pointInBox(ref.p, bb, tol));
                if (!refs.length) continue;
                const { found, missing } = matchEdges(b.shape, refs, tol);
                miss += missing;
                if (!found.length) continue;
                fn = (e) => {
                  const m = edgeMid(e);
                  return found.some((p) => v3.dist(p, m) < 1e-5) ? r : null;
                };
              }
              let any = false;
              const counted = (e) => {
                if (seams.has(hashOf(e))) return null;
                const v = fn(e);
                if (v) any = true;
                return v;
              };
              try {
                b.shape = f.type === "fillet" ? b.shape.fillet(counted) : b.shape.chamfer(counted);
                if (any) total++;
              } catch (e) {
                if (String(e?.message || "").includes("no edge was selected")) continue;
                throw new Error((f.type === "fillet" ? "Rundung" : "Fase") + " nicht möglich – Radius zu groß? (" + errorText(e, R) + ")");
              }
            }
            if (f.mode !== "all" && f.mode !== "dir" && !(f.edges || []).length) throw new Error("Keine Kanten gewählt – Kanten im 3D-Fenster anklicken");
            if (miss) st.warning = `${miss} Kante(n) nicht mehr gefunden`;
            if (!total && f.mode !== "all") st.warning = st.warning || "Keine passende Kante gefunden";
            break;
          }
          case "shell": {
            const t = E(f.thickness, "Wandstärke");
            if (!(Math.abs(t) > 0)) throw new Error("Wandstärke muss ≠ 0 sein");
            const faces = f.faces || [];
            const b = state.bodies.find((x) => x.kind === "solid") || state.bodies[0];
            if (!b) throw new Error("Kein Körper vorhanden");
            if (!faces.length) throw new Error("Keine Fläche zum Öffnen gewählt");
            b.shape = b.shape.shell(Math.abs(t), (ff) =>
              faces.length === 1 ? ff.containsPoint(faces[0].p) : ff.either(faces.map((ref) => (x) => x.containsPoint(ref.p))));
            break;
          }
          case "pattern": {
            const src = state.tools.get(f.feature);
            if (!src) throw new Error(missingRef(f.feature, "Bezugs-Feature", f));
            const transforms = f.kind === "path" ? pathTransforms(f, E, getSketch(f.path, "Pfad-Skizze")) : patternTransforms(f, E, datums.map);
            if (transforms.length > 500) throw new Error("Zu viele Exemplare (max. 500)");
            let n = 0;
            for (const tr of transforms) {
              for (const s of src.shapes) {
                const copy = tr(s.shape.clone());
                if (s.kind === "member") {
                  const meta = { ...s.meta };
                  pushMember(state, copy, f, meta, s.name);
                } else if (s.kind === "norm") state.bodies.push({ shape: copy, kind: "solid", name: s.name, fid: f.id, meta: { ...s.meta } });
                else applyOp(src.op, copy, f.id, f.name);
                n++;
              }
            }
            st.info = `${transforms.length + 1} Exemplare`;
            break;
          }
          case "sweep": {
            const s = getSketch(f.sketch, "Profil-Skizze");
            if (!s.prof.regions.length) throw new Error(s.prof.errors[0] || "Profil-Skizze ohne geschlossene Kontur");
            if (f.path === f.sketch) throw new Error("Profil und Pfad müssen verschiedene Skizzen sein");
            const p3 = state.paths.get(f.path);
            const p = p3 ? null : getSketch(f.path, "Pfad-Skizze");
            const chain = p3 ? null : pathChain(p.sketch);
            const spine = p3 ? path3dWire(p3) : chainWire(chain, p.frame);
            const cfg = { frenet: f.orient !== "fest", transitionMode: "right" };
            let tool = null;
            for (const reg of s.prof.regions) {
              let solid = R.genericSweep(loopWire(reg.outer, s.frame), spine.clone(), cfg);
              for (const hl of reg.holes) solid = solid.cut(R.genericSweep(loopWire(hl, s.frame), spine.clone(), cfg));
              tool = tool ? tool.fuse(solid) : solid;
            }
            state.tools.set(f.id, { op: f.op || "join", shapes: [{ shape: tool, kind: "tool" }] });
            applyOp(f.op || "join", tool, f.id, f.name);
            st.info = `Pfad ${String(Math.round((p3 ? p3.length : chainLength(chain)) * 10) / 10).replace(".", ",")} mm${(p3 || chain).closed ? ", geschlossen" : ""}`;
            break;
          }
          case "loft": {
            const ids = f.sketches || [];
            validateLoft(ids);
            const secs = ids.map((id, k) => {
              const s = getSketch(id, `Skizze ${k + 1}`);
              if (!s.prof.regions.length) throw new Error(`Skizze ${k + 1}: keine geschlossene Kontur`);
              if (s.prof.regions.length > 1 || s.prof.regions[0].holes.length) st.warning = "Je Skizze zählt nur die äußere Kontur der ersten Fläche";
              return loopToDrawing(s.prof.regions[0].outer).sketchOnPlane(makePlane(s.frame));
            });
            const tool = secs[0].loftWith(secs.slice(1), { ruled: !!f.ruled });
            state.tools.set(f.id, { op: f.op || "join", shapes: [{ shape: tool, kind: "tool" }] });
            applyOp(f.op || "join", tool, f.id, f.name);
            st.info = `${ids.length} Querschnitte${f.ruled ? ", gerade Übergänge" : ""}`;
            break;
          }
          case "spirale": {
            const s = getSketch(f.sketch);
            if (!s.prof.regions.length) throw new Error(s.prof.errors[0] || "Keine geschlossene Kontur");
            const { origin, dir } = sketchAxis(s, f.axis);
            const D = v3.norm(dir);
            const cp = coilParams({ mode: f.mode, pitch: E(f.pitch, "Steigung"), turns: f.mode === "hoehe" ? 0 : E(f.turns, "Umdrehungen"), height: f.mode === "hoehe" ? E(f.height, "Höhe") : 0 });
            let tool = null;
            for (const reg of s.prof.regions) {
              const c2 = loopCentroid(loopPoints(reg.outer));
              const C = toWorld(s.frame, c2[0], c2[1]);
              const F = v3.add(origin, v3.mul(D, v3.dot(v3.sub(C, origin), D)));
              const r = v3.dist(C, F);
              if (r < 1e-6) throw new Error("Profil liegt auf der Achse");
              if (cp.pitch < 1e-6) throw new Error("Steigung zu klein");
              let helix = R.makeHelix(cp.pitch, cp.height, r, F, D, !!f.lefthand);
              // Anfang der Schraubenlinie in die Profilmitte drehen
              const S = vecOf(helix.startPoint);
              const a = v3.norm(v3.sub(S, F)), b = v3.norm(v3.sub(C, F));
              const ang = (Math.atan2(v3.dot(v3.cross(a, b), D), v3.dot(a, b)) * 180) / Math.PI;
              if (Math.abs(ang) > 1e-9) helix = helix.rotate(ang, F, D);
              let solid = R.genericSweep(loopWire(reg.outer, s.frame), helix, { frenet: true });
              for (const hl of reg.holes) solid = solid.cut(R.genericSweep(loopWire(hl, s.frame), helix.clone(), { frenet: true }));
              tool = tool ? tool.fuse(solid) : solid;
            }
            state.tools.set(f.id, { op: f.op || "join", shapes: [{ shape: tool, kind: "tool" }] });
            applyOp(f.op || "join", tool, f.id, f.name);
            st.info = `${String(Math.round(cp.turns * 100) / 100).replace(".", ",")} Umdrehungen, Steigung ${String(cp.pitch).replace(".", ",")} mm, Höhe ${String(Math.round(cp.height * 10) / 10).replace(".", ",")} mm${f.lefthand ? ", linksgängig" : ""}`;
            break;
          }
          case "endkappe": {
            const tool = state.tools.get(f.target);
            if (!tool) throw new Error(missingRef(f.target, "Profil", f));
            const mems = tool.shapes.filter((x) => x.kind === "member");
            const idx = f.members?.length ? f.members : mems.map((_, k) => k);
            const shapes = [];
            let n = 0;
            for (const mi of idx) {
              const mem = mems[mi];
              if (!mem?.meta?.axis) throw new Error(`Stab ${mi + 1} nicht gefunden`);
              const ax = mem.meta.axis;
              const g = sectionGeometryOf(mem.meta);
              const cp = capPlan({ thickness: E(f.thickness || "3", "Dicke"), overhang: E(f.overhang || "0", f.mode === "eingesetzt" ? "Spiel" : "Überstand"), end: f.end, mode: f.mode }, g.holes.length > 0);
              for (const e of cp.ends) {
                const endB = e === "B";
                const miter = endB ? mem.meta.miterEnd : mem.meta.miterStart;
                if (Math.abs(miter || 0) > 0.05) { st.warning = `Gehrung an Ende ${e} von ${mem.name}: Kappe sitzt nur am geraden Ende richtig`; continue; }
                const inside = f.mode === "eingesetzt";
                // Grundfläche senkrecht zur Achse; aufgesetzt außen auf dem Ende, eingesetzt bündig im Rohr
                const z0 = endB ? (inside ? ax.hi - cp.t : ax.hi) : (inside ? ax.lo : ax.lo - cp.t);
                let d = loopToDrawing(inside ? g.holes[0] : g.outer);
                const off = inside ? -Math.abs(cp.ov) : cp.ov;
                if (Math.abs(off) > 1e-9) d = d.offset(off);
                const solid = d.sketchOnPlane(new R.Plane(v3.add(ax.origin, v3.mul(ax.z, z0)), ax.u, ax.z)).extrude(cp.t);
                const name = `${f.name || "Endkappe"} ${mem.name} ${e}`;
                const meta = { plate: { W: g.width + 2 * off, H: g.height + 2 * off, t: cp.t, holes: 0, d: 0 }, endcap: true, partOf: mem.name };
                state.bodies.push({ shape: solid, kind: "solid", name, fid: f.id, meta });
                shapes.push({ shape: solid, kind: "solid", meta, name });
                const wa = E(f.weldA || "0", "Nahtdicke a");
                if (wa > 0) state.welds.push({ fid: f.id, kind: "kehl", a: wa, side: "pfeil", around: true, field: false, length: ax.perimeter, p3: v3.add(ax.origin, v3.mul(ax.z, endB ? ax.hi : ax.lo)), name });
                n++;
              }
            }
            if (!n) throw new Error("Keine Kappe gesetzt – Enden auf Gehrung");
            state.tools.set(f.id, { op: "new", shapes });
            st.info = `${n} Endkappe(n) ${f.mode === "eingesetzt" ? "eingesetzt" : "aufgesetzt"}, ${String(E(f.thickness || "3", "Dicke")).replace(".", ",")} mm`;
            break;
          }
          case "kuerzen": {
            const fr0 = planeOf(f.plane || "YZ", E(f.offset || "0", "Abstand"), datums.map);
            const bodies = state.bodies.filter((b) => b.kind === "member" && b.fid === f.target);
            if (!bodies.length) throw new Error(missingRef(f.target, "Profil oder Rahmen", f));
            const idx = f.members?.length ? f.members : bodies.map((_, k) => k);
            const tms = state.tools.get(f.target)?.shapes.filter((x) => x.kind === "member") || [];
            const toolMembers = tms.length === bodies.length ? tms : [];
            let n = 0;
            const notes = [];
            for (const mi of idx) {
              const b = bodies[mi];
              if (!b?.meta?.axis) throw new Error(`Stab ${mi + 1} nicht gefunden`);
              const ax = b.meta.axis;
              const tp = trimPlan(ax, fr0.origin, fr0.normal, f.end || "auto");
              const out = v3.mul(ax.z, tp.sign); // vom Stab weg
              let shape = b.shape;
              if (tp.delta > 1e-6) {
                // verlängern: Querschnitt vom Ende bis über die Ebene hinaus, dann an der Ebene schneiden
                const g = sectionGeometryOf(b.meta);
                const tilt = Math.abs(v3.dot(v3.norm(fr0.normal), v3.norm(ax.z)));
                const extra = (Math.hypot(g.width, g.height) / 2) * Math.sqrt(Math.max(0, 1 - tilt * tilt)) / Math.max(tilt, 0.05) + 2;
                const zEnd = tp.end === "B" ? ax.hi : ax.lo;
                const start = tp.end === "B" ? zEnd - 0.01 : zEnd - tp.delta - extra;
                const ext = regionToDrawing({ outer: g.outer, holes: g.holes }).sketchOnPlane(new R.Plane(v3.add(ax.origin, v3.mul(ax.z, start)), ax.u, ax.z)).extrude(tp.delta + extra + 0.01);
                shape = shape.fuse(ext);
              }
              const nOut = v3.dot(fr0.normal, out) > 0 ? fr0.normal : v3.mul(fr0.normal, -1);
              const hs = halfSpace(fr0.origin, nOut, BIG);
              shape = shape.cut(hs);
              b.shape = shape;
              b.meta = { ...b.meta, length: memberLength(shape, ax), axis: { ...ax, ...memberSpan(shape, ax) } };
              const tm = toolMembers[mi];
              if (tm) { tm.shape = shape; tm.meta = b.meta; }
              if (tp.end === "A") b.meta.miterStart = Math.round(Math.acos(Math.min(1, Math.abs(v3.dot(v3.norm(fr0.normal), ax.z)))) * 1800 / Math.PI) / 10;
              else b.meta.miterEnd = Math.round(Math.acos(Math.min(1, Math.abs(v3.dot(v3.norm(fr0.normal), ax.z)))) * 1800 / Math.PI) / 10;
              notes.push(`${b.name}: ${tp.delta > 0 ? "+" : ""}${String(Math.round(tp.delta * 10) / 10).replace(".", ",")} mm`);
              n++;
            }
            st.info = `${n} Stab/Stäbe an Ende ${f.end && f.end !== "auto" ? f.end : "(näheres)"}: ${notes.join(", ")}`;
            break;
          }
          case "kombinieren": {
            const tools = validateCombine(f);
            const target = state.bodies.filter((b) => b.fid === f.target && b.kind === "solid");
            if (!target.length) throw new Error(missingRef(f.target, "Zielkörper", f));
            const used = state.bodies.filter((b) => tools.includes(b.fid) && b.kind === "solid");
            if (!used.length) throw new Error("Werkzeugkörper fehlen");
            const op = f.op || "join";
            let shape = target.map((b) => b.shape).reduce((a, b) => a.fuse(b));
            for (const b of used) shape = op === "cut" ? shape.cut(b.shape.clone()) : op === "intersect" ? shape.intersect(b.shape.clone()) : shape.fuse(b.shape.clone());
            if (isEmptyShape(shape)) throw new Error("Ergebnis ist leer");
            const keep = new Set(f.keep ? [] : used);
            state.bodies = state.bodies.filter((b) => !keep.has(b) && !target.slice(1).includes(b));
            target[0].shape = shape;
            st.info = `${used.length} Werkzeugkörper ${op === "cut" ? "abgezogen" : op === "intersect" ? "geschnitten" : "vereinigt"}${f.keep ? ", Werkzeuge behalten" : ""}`;
            break;
          }
          case "stecksystem": {
            // Stufe 45: Zapfen am Zapfenteil, Schlitze im Schlitzteil entlang der Berührfläche
            const A = state.bodies.find((b) => b.fid === f.tab && b.kind === "solid"), B = state.bodies.find((b) => b.fid === f.slot && b.kind === "solid");
            if (!A) throw new Error(missingRef(f.tab, "Zapfenteil", f));
            if (!B) throw new Error(missingRef(f.slot, "Schlitzteil", f));
            if (A === B) throw new Error("Zapfenteil und Schlitzteil müssen verschiedene Körper sein");
            const plan = tabSlotPlan(A.shape, B.shape, tabSlotParams(f, E));
            A.shape = applyBoxes(A.shape, plan.tabs, "fuse");
            B.shape = applyBoxes(B.shape, plan.slots, "cut");
            st.info = plan.info;
            break;
          }
          case "steckzapfen": case "steckschlitz": {
            // Stufe 46: Zapfen bzw. Schlitze aus einem Stecksystem der Baugruppe (Quader im Bauteil-System)
            const solidish = (b) => b.kind === "solid" || b.kind === "member";
            const body = state.bodies.find((b) => solidish(b) && f.body && b.fid === f.body) || state.bodies.find(solidish);
            if (!body) throw new Error("Kein Körper im Bauteil");
            if (!Array.isArray(f.boxes) || !f.boxes.length) throw new Error("Keine Zapfen/Schlitze – Stecksystem in der Baugruppe aktualisieren");
            body.shape = applyBoxes(body.shape, f.boxes, f.type === "steckzapfen" ? "fuse" : "cut");
            st.info = `${f.boxes.length} ${f.type === "steckzapfen" ? "Zapfen" : "Schlitze"} aus »${f.source || "Baugruppe"}«`;
            break;
          }
          case "trennen": {
            const fr = planeOf(f.plane, E(f.offset || "0", "Abstand"), datums.map);
            const pl = makePlane(fr);
            const keepSide = f.keep || "beide";
            const out = [];
            let n = 0;
            for (const b of state.bodies) {
              if (b.kind !== "solid" || (f.bodies?.length && !f.bodies.includes(b.fid))) { out.push(b); continue; }
              const r = b.shape.split(pl);
              if (!r.positive || !r.negative) { out.push(b); continue; }
              n++;
              if (keepSide !== "minus") out.push({ ...b, shape: r.positive, name: keepSide === "beide" ? `${b.name} (1)` : b.name });
              if (keepSide !== "plus") out.push({ ...b, shape: r.negative, name: keepSide === "beide" ? `${b.name} (2)` : b.name, fid: keepSide === "beide" ? f.id : b.fid });
            }
            if (!n) throw new Error("Die Ebene schneidet keinen Körper");
            state.bodies = out;
            st.info = `${n} Körper geteilt`;
            break;
          }
          case "verschieben": {
            const sel = state.bodies.filter((b) => !f.bodies?.length || f.bodies.includes(b.fid));
            if (!sel.length) throw new Error("Keine Körper gewählt");
            const mv = (f.move || ["0", "0", "0"]).map((x) => E(x, "Verschiebung"));
            const ang = E(f.angle || "0", "Winkel");
            const ax = Math.abs(ang) > 1e-12 ? axisOf(f.axis, datums.map) : null;
            const tf = (sh) => { let x = sh; if (ax) x = x.rotate(ang, ax.p, ax.d); return v3.len(mv) > 0 ? x.translate(mv) : x; };
            for (const b of sel) {
              if (f.copy) state.bodies.push({ ...b, shape: tf(b.shape.clone()), name: b.name + " (Kopie)", fid: f.id, meta: b.meta ? { ...b.meta } : b.meta });
              else b.shape = tf(b.shape);
            }
            st.info = `${sel.length} Körper ${f.copy ? "kopiert" : "verschoben"}`;
            break;
          }
          case "aufdicken": case "flaeche": {
            const refs = f.faces || [];
            if (!refs.length) throw new Error("Fläche wählen");
            const hits = facesAt(refs.map((r) => r.p));
            if (!hits.length) throw new Error("Gewählte Fläche nicht mehr vorhanden");
            const t = E(f.type === "flaeche" ? f.distance : f.thickness, f.type === "flaeche" ? "Abstand" : "Dicke");
            for (const { body, face } of hits) {
              if (face.geomType !== "PLANE") throw new Error("Nur ebene Flächen");
              const n = v3.norm(tuple(face.normalAt()));
              if (f.type === "flaeche") {
                if (!(Math.abs(t) > 0)) throw new Error("Abstand ≠ 0");
                const solid = R.basicFaceExtrusion(face, new R.Vector(v3.mul(n, t)));
                body.shape = t > 0 ? body.shape.fuse(solid) : body.shape.cut(solid);
              } else {
                const { start, length } = thickenSpan(t, f.side);
                let solid = R.basicFaceExtrusion(face, new R.Vector(v3.mul(n, length)));
                if (Math.abs(start) > 0) solid = solid.translate(v3.mul(n, start));
                if ((f.op || "new") === "join") body.shape = body.shape.fuse(solid);
                else state.bodies.push({ shape: solid, kind: "solid", name: f.name || "Aufdickung", fid: f.id });
              }
            }
            st.info = `${hits.length} Fläche(n) ${f.type === "flaeche" ? (t > 0 ? "herausgezogen" : "zurückgesetzt") : "aufgedickt"} um ${String(Math.abs(t)).replace(".", ",")} mm`;
            break;
          }
          case "entformung": {
            const refs = f.faces || [];
            if (!refs.length) throw new Error("Flächen wählen");
            const ang = validateDraft(E(f.angle || "1", "Winkel"));
            const pl = makePlane(planeOf(f.plane || "XY", E(f.offset || "0", "Abstand"), datums.map));
            const hits = facesAt(refs.map((r) => r.p));
            if (!hits.length) throw new Error("Gewählte Fläche nicht mehr vorhanden");
            const bodies = [...new Set(hits.map((x) => x.body))];
            for (const b of bodies) {
              const pts = refs.map((r) => r.p).filter((p) => hits.some((x) => x.body === b && x.p === p));
              b.shape = b.shape.draft(ang, (ff) => (pts.length === 1 ? ff.containsPoint(pts[0]) : ff.either(pts.map((p) => (x) => x.containsPoint(p)))), pl);
            }
            st.info = `${hits.length} Fläche(n) um ${String(ang).replace(".", ",")}° geneigt`;
            break;
          }
          case "arbeitsebene": case "arbeitsachse": case "arbeitspunkt": {
            if (datums.errors[f.id]) throw new Error(datums.errors[f.id]);
            st.info = datumSummary(f, datums.map.get(f.id));
            break;
          }
          case "skizze3d": {
            const pts = resolvePathPoints(f.points, E);
            const r = E(f.radius ?? "0", "Eckradius");
            if (!(r >= 0)) throw new Error("Eckradius muss ≥ 0 sein");
            const p = path3d(pts, { radius: r, closed: !!f.closed });
            state.paths.set(f.id, p);
            st.info = `${pts.length} Punkte, Länge ${String(Math.round(p.length * 10) / 10).replace(".", ",")} mm${f.closed ? ", geschlossen" : ""}${r > 0 ? `, Eckradius ${r}` : ""}`;
            break;
          }
          case "schweissbaugruppe": {
            if (f._srcError) throw new Error(f._srcError);
            if (!f._src) throw new Error("Baugruppe fehlt");
            if (feats.findIndex((g) => g.id === f.id) !== feats.findIndex((g) => !g.suppressed)) throw new Error("Die Schweißbaugruppe muss das erste Feature sein");
            if (!f._src.items.length) throw new Error(`»${f._src.name}« hat keine Bauteile`);
            const built = new Map();
            let bad = 0;
            for (const it of f._src.items) {
              let sub = built.get(it.part);
              if (!sub) { sub = await buildPart(f._src.parts[it.part]); built.set(it.part, sub); bad += Object.values(sub.status).filter((x) => !x.ok).length; }
              const { pos, rot } = decomposePlacement(it.matrix);
              for (const b of sub.bodies) state.bodies.push({ shape: placed(b.shape, pos, rot), kind: b.kind === "member" ? "member" : "solid", name: it.name, fid: f.id, meta: { ...(b.meta || {}), weldComp: it.name } });
            }
            state.tools.set(f.id, { op: "new", shapes: [] });
            st.info = `${f._src.items.length} Teile aus »${f._src.name}« (${state.bodies.length} Körper)`;
            if (bad) st.warning = `Bauteile der Baugruppe haben ${bad} fehlerhafte(s) Feature(s)`;
            break;
          }
          case "abgeleitet": {
            if (f._srcError) throw new Error(f._srcError);
            if (!f._src) throw new Error("Quellbauteil fehlt");
            const sub = await buildPart(f._src);
            const bad = Object.values(sub.status).filter((x) => !x.ok).length;
            if (!sub.bodies.length) throw new Error(`»${f._src.name}« hat keinen Körper`);
            const sc = E(f.scale ?? "1", "Maßstab");
            if (!(sc > 0)) throw new Error("Maßstab muss > 0 sein");
            const mn = f.mirror === "frei" ? (f.mirrorN || [1, 0, 0]).map((x) => E(String(x), "Spiegelnormale")) : MIRROR_N[f.mirror] || null;
            if (mn && v3.len(mn) < 1e-9) throw new Error("Spiegelnormale ist null");
            // BG12 »Komponenten aus Körpern«: nur ein Körper der Quelle (Index ab 0)
            const pickB = f.body !== undefined && f.body !== null && f.body !== "" ? Number(f.body) : null;
            if (pickB !== null && !sub.bodies[pickB]) throw new Error(`»${f._src.name}« hat keinen Körper ${pickB + 1} (nur ${sub.bodies.length})`);
            for (const b of pickB !== null ? [sub.bodies[pickB]] : sub.bodies) {
              let sh = b.shape.clone();
              if (mn) sh = sh.mirror(v3.norm(mn), [0, 0, 0]);
              if (Math.abs(sc - 1) > 1e-12) sh = sh.scale(sc, [0, 0, 0]);
              const body = { shape: sh, kind: b.kind === "member" ? "member" : "solid", name: b.name, fid: f.id, meta: b.meta ? { ...b.meta, derived: f._src.name } : { derived: f._src.name } };
              if (f.join && body.kind === "solid") applyOp("join", sh, f.id, f.name);
              else state.bodies.push(body);
            }
            state.tools.set(f.id, { op: "new", shapes: [] });
            st.info = `${pickB !== null ? `Körper ${pickB + 1} von ${sub.bodies.length}` : `${sub.bodies.length} Körper`} aus »${f._src.name}«${mn ? ", gespiegelt" : ""}${Math.abs(sc - 1) > 1e-12 ? `, Maßstab ${String(sc).replace(".", ",")}` : ""}`;
            if (bad) st.warning = `Quellbauteil hat ${bad} fehlerhafte(s) Feature(s)`;
            break;
          }
          case "mirror": {
            const { n: pl, origin } = mirrorPlane(f, (x) => E(x, "Abstand"), datums.map);
            const added = [];
            for (const b of state.bodies) {
              const m = b.shape.clone().mirror(pl, origin);
              if (b.kind === "member" || f.separate) added.push({ ...b, shape: m, fid: f.id });
              else b.shape = b.shape.fuse(m);
            }
            state.bodies.push(...added);
            break;
          }
          case "import": {
            if (!f.data) throw new Error("Keine Datei geladen");
            let shape;
            if (f.format === "stl") shape = await R.importSTL(new Blob([base64ToBytes(f.data)]));
            else shape = await R.importSTEP(new Blob([f.data]));
            state.tools.set(f.id, { op: f.op || "join", shapes: [{ shape, kind: "tool" }] });
            applyOp(f.op || "new", shape, f.id, f.name || "Import");
            break;
          }
          default:
            throw new Error("Unbekanntes Feature: " + f.type);
        }
      } catch (e) {
        st.ok = false;
        st.error = errorText(e, R);
      }
      if (useCache) newCache.push({ key: keys[i], state: null });
      if (useCache && i >= feats.length - 3) newCache[newCache.length - 1].state = cloneState(state);
    }
    if (useCache) {
      const kept = cacheList.filter((c) => keys.includes(c.key) && c.state).slice(-6);
      const merged = [...kept, ...newCache.filter((c) => c.state)];
      prefixCache.set(part.id, merged.slice(-8));
    }
    for (const f of rolledBack) state.status[f.id] = { ok: true, rolledBack: true };
    for (const [k, msg] of Object.entries(paramErrors)) state.status["param:" + k] = { ok: false, error: msg };
    // Körperprüfung des Endergebnisses: nur Hinweis am erzeugenden Feature, blockiert nichts.
    // Statusobjekt ersetzen statt ändern – es kann mit dem Zwischenspeicher geteilt sein.
    if (validate) {
      for (const b of state.bodies) {
        let ok;
        try { ok = shapeValid(b.shape); } catch { ok = false; }
        if (ok) continue;
        b.invalid = true;
        const key = b.fid && state.status[b.fid] ? b.fid : "koerper";
        const prev = state.status[key] || { ok: true };
        if (!prev.warning?.includes(INVALID_BODY)) state.status[key] = { ...prev, warning: prev.warning ? prev.warning + "; " + INVALID_BODY : INVALID_BODY };
      }
    }
    return { bodies: state.bodies, status: state.status, sketches: state.sketches, values, welds: state.welds || [], datums: [...datums.map].map(([id, g]) => ({ id, ...g })), rules: ruled.messages, ruleOff: ruled.suppressed || [], paths3d: [...state.paths].filter(([id]) => !feats.find((g) => g.id === id)?.suppressed).map(([id, p]) => ({ id, pts: samplePath(p) })) };
  }

  /** Normteil als eigener Körper (Stückliste mit Normbezeichnung); n = { kind, size, length, grade, galv, name? } */
  /** Körper des Konstruktions-Assistenten (Achse Z, Ursprung): Welle, Stirnrad, Rillenkugellager, Druckfeder */
  function assistSolid(f, E) {
    const poly = (pts, plane = "XY") => { let d = R.draw(pts[0]); for (const p of pts.slice(1)) d = d.lineTo(p); return d.close().sketchOnPlane(plane); };
    if (f.type === "welle") {
      const secs = parseSections(f.sections);
      const pr = shaftProfile(secs, E(f.chamfer || "0", "Fase"));
      const shape = poly(pr.pts, "XZ").revolve([0, 0, 1], { origin: [0, 0, 0] });
      return { shape, name: "Welle", info: `Welle ${secs.length} Abschnitt(e), Länge ${round(pr.length)} mm, größter Ø ${round(Math.max(...secs.map((x) => x.d)))} mm`, meta: { assist: "welle" } };
    }
    if (f.type === "zahnrad") {
      const g = gearData(E(f.m, "Modul"), Math.round(E(f.z, "Zähnezahl")), E(f.alpha || "20", "Eingriffswinkel"));
      const b = E(f.b, "Breite"), bore = E(f.bore || "0", "Bohrung");
      if (!(b > 0)) throw new Error("Zahnrad: Breite > 0 angeben");
      if (bore >= g.df - 2 * g.m) throw new Error(`Zahnrad: Bohrung Ø ${round(bore)} zu groß für Fußkreis Ø ${round(g.df)}`);
      let shape = poly(gearOutline(g)).extrude(b);
      if (bore > 0) shape = shape.cut(R.makeCylinder(bore / 2, b + 2, [0, 0, -1], [0, 0, 1]));
      const num = (x) => String(round(x)).replace(".", ",");
      return { shape, name: `Stirnrad m${num(g.m)} z${g.z}`, info: `d ${num(g.d)}, da ${num(g.da)}, df ${num(g.df)} mm`, warn: g.undercut ? `z = ${g.z} unter der Grenzzähnezahl – Unterschnitt ohne Profilverschiebung` : "", meta: { assist: "zahnrad", gear: g } };
    }
    if (f.type === "lager") {
      const L = bearingGeometry(f.series);
      const ring = (ro, ri) => R.makeCylinder(ro, L.B, [0, 0, 0], [0, 0, 1]).cut(R.makeCylinder(ri, L.B + 2, [0, 0, -1], [0, 0, 1]));
      let shape = ring(L.D / 2, L.outerIn / 2).fuse(ring(L.innerOut / 2, L.d / 2));
      for (let i = 0; i < L.n; i++) { const t = (2 * Math.PI * i) / L.n; shape = shape.fuse(R.makeSphere(L.dw / 2).translate([(L.dm / 2) * Math.cos(t), (L.dm / 2) * Math.sin(t), L.B / 2])); }
      const designation = bearingDesignation(f.series, f.seal);
      return { shape, name: designation, info: `${designation}: d ${L.d}, D ${L.D}, B ${L.B} mm`, meta: { norm: { kind: "lager", size: f.series, length: 0, grade: "100Cr6", designation }, density: 7.81 } };
    }
    const sp = springData(E(f.d, "Draht-Ø"), E(f.D, "Mittlerer Ø"), E(f.n, "Federnde Windungen"), E(f.L0, "Länge"));
    const helix = R.makeHelix(sp.pitch, sp.L0 - sp.d, sp.D / 2, [0, 0, sp.d / 2], [0, 0, 1], false);
    const S = vecOf(helix.startPoint), T = vecOf(helix.tangentAt ? helix.tangentAt(0) : [0, 1, 0]);
    const prof = R.drawCircle(sp.d / 2).sketchOnPlane(new R.Plane(S, v3.norm(v3.cross(T, [0, 0, 1])), v3.norm(T)));
    const shape = R.genericSweep(prof.wire, helix, { frenet: true });
    const num = (x, d = 1) => String(Math.round(x * 10 ** d) / 10 ** d).replace(".", ",");
    const designation = springDesignation(sp);
    return { shape, name: designation, info: `R = ${num(sp.rate, 2)} N/mm, Blocklänge ${num(sp.Lc)} mm, Fc ${num(sp.Fc, 0)} N, τkc ${num(sp.tauKc, 0)} N/mm²`, meta: { norm: { kind: "feder", size: designation, length: sp.L0, grade: "Federdraht EN 10270-1", designation }, spring: sp, density: 7.85 } };
  }
  function pushNorm(state, f, list, n, pos, dir) {
    const solid = orientZ(normSolid(n.kind, n.size, n.length || 0), dir, pos);
    const designation = normDesignation(n);
    const meta = { norm: { kind: n.kind, size: n.size, length: n.length || 0, grade: n.grade || "", designation }, density: normDensity(n.grade) };
    const body = { shape: solid, kind: "solid", name: n.name || designation, fid: f.id, meta };
    state.bodies.push(body);
    list?.push({ shape: solid, kind: "norm", meta, name: body.name });
    return body;
  }
  /** Verschraubung (Schraube, 2 Scheiben, Mutter) an Punkt p, Achse dir, Klemmlänge clamp; gibt die Schraubenlänge zurück */
  function pushBoltSet(state, f, list, size, clamp, p, dir, grade = "8.8", galv = false) {
    const set = boltSet(size, clamp);
    const nut = { "8.8": "8", "10.9": "10" }[grade] || grade, washer = /^A[24]/.test(grade) ? grade.slice(0, 2) : "200 HV";
    for (const part of set.parts) {
      const g = part.kind === "mutter" ? nut : part.kind === "scheibe" ? washer : grade;
      pushNorm(state, f, list, { kind: part.kind, size, length: part.length, grade: g, galv }, v3.add(p, v3.mul(dir, part.z0)), dir);
    }
    return set.length;
  }
  function pushMember(state, solid, f, meta, name) {
    state.bodies.push({ shape: solid, kind: "member", name, fid: f.id, meta });
  }

  // ---------- Prägen / Gravieren (Skizze auf die Oberfläche) ----------
  const EMB_EPS = 0.02; // Überstand des Werkzeugs aus der Oberfläche
  /** 2D-Schwerpunkt (Mitte des Hüllrechtecks) einer Region */
  const regionCenter = (reg) => { const b = regionToDrawing(reg).boundingBox; return [(b.bounds[0][0] + b.bounds[1][0]) / 2, (b.bounds[0][1] + b.bounds[1][1]) / 2]; };
  /** Region mit einer längentreuen 2D-Abbildung (Drehung/Spiegelung + Verschiebung) umrechnen; Bögen bleiben Bögen */
  function mapRegion(reg, T) {
    const loop = (l) => (l.kind === "circle" ? { ...l, c: T(l.c) } : { ...l, start: T(l.start), segs: l.segs.map((sg) => ({ ...sg, to: T(sg.to), mid: sg.mid && T(sg.mid) })) });
    return { ...reg, outer: loop(reg.outer), holes: reg.holes.map(loop) };
  }
  /** Erster Treffer eines Strahls auf einem Körper: { body, face, H, t } oder null */
  function rayHit(bodies, P0, dir) {
    let best = null;
    for (const b of bodies) {
      const needle = R.makeCylinder(0.02, BIG, P0, dir);
      if (!bboxOverlap(b.shape.boundingBox, needle.boundingBox)) continue;
      let common;
      try { common = b.shape.intersect(needle); } catch { continue; }
      if (isEmptyShape(common)) continue;
      const [lo, hi] = common.boundingBox.bounds;
      let t = Infinity;
      for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) t = Math.min(t, v3.dot(v3.sub([x, y, z], P0), dir));
      if (best && t >= best.t) continue;
      best = { body: b, t: Math.max(t, 0) };
    }
    if (!best) return null;
    const H = v3.add(P0, v3.mul(dir, best.t));
    const vx = R.makeVertex(H);
    let face = null, dmin = Infinity;
    for (const fc of best.body.shape.faces) {
      const d = R.measureDistanceBetween(vx, fc);
      if (d < dmin) { dmin = d; face = fc; }
    }
    return { ...best, H, face };
  }
  /** Fläche aus Fläche aufdicken (d < 0 = nach innen); Volumen immer positiv */
  function thicken(face, d) {
    const oc = R.getOC();
    const m = new oc.BRepOffsetAPI_MakeThickSolid();
    m.MakeThickSolidBySimple(face.wrapped, d);
    m.Build(new oc.Message_ProgressRange());
    let solid = R.cast(m.Shape());
    m.delete();
    if (R.measureVolume(solid) < 0) solid = R.cast(solid.wrapped.Reversed());
    return solid;
  }
  /**
   * Werkzeug einer Region: Skizze in Richtung dir auf die erste getroffene Fläche, d tief (Gravieren) bzw. hoch (Prägen).
   * Ebene Fläche: Prisma der Region begrenzt auf eine Schicht parallel zur Fläche. Zylinder (Rohr): auf der Fläche
   * abgewickelt (Längen bleiben auf dem Umfang erhalten) und radial aufgedickt; ohne Abwickeln projiziert.
   * Ergebnis: { tool, face: "PLANE"|"CYLINDER", wrapped, overEdge } oder null (kein Treffer)
   */
  const outlinePoints = (reg) => (reg.outer.kind === "circle"
    ? [0, 1, 2, 3].map((k) => [reg.outer.c[0] + reg.outer.r * Math.cos((k * Math.PI) / 2), reg.outer.c[1] + reg.outer.r * Math.sin((k * Math.PI) / 2)])
    : [reg.outer.start, ...reg.outer.segs.flatMap((sg) => (sg.mid ? [sg.mid, sg.to] : [sg.to]))]);
  // Rohrmantel (mind. halber Umfang), keine Eckrundung eines Rechteckrohrs
  const tubeFace = (fc) => fc.geomType === "CYLINDRE" && fc.UVBounds.uMax - fc.UVBounds.uMin > Math.PI - 0.01;
  function embossTool(reg, frame, dir, bodies, d, raised, wrap) {
    const ray = (q) => rayHit(bodies, v3.sub(toWorld(frame, q[0], q[1]), v3.mul(dir, BIG / 4)), dir);
    let hit = ray(regionCenter(reg));
    if (!hit) return null;
    // Mitte auf einer Eckrundung (Rechteckrohr über die Kante): die ebene Fläche nehmen, die der Umriss trifft
    if (hit.face.geomType === "CYLINDRE" && !tubeFace(hit.face)) {
      for (const q of outlinePoints(reg)) { const h2 = ray(q); if (h2 && h2.face.geomType === "PLANE") { hit = h2; break; } }
    }
    const { face, H } = hit;
    const lo = raised ? -EMB_EPS : -d, hi = raised ? d : EMB_EPS; // Schicht entlang der Außennormale
    const prism = () => extrudeRegions([reg], frame, -BIG / 2, BIG);
    if (face.geomType === "CYLINDRE") {
      const { axisP, axisD, radius: Rc } = cylinderAxis(face);
      const a = v3.norm(axisD);
      const foot = v3.add(axisP, v3.mul(a, v3.dot(v3.sub(H, axisP), a)));
      const rh = v3.norm(v3.sub(H, foot));
      const convex = v3.dot(rh, dir) < 0; // Außenfläche zum Betrachter
      if (!convex) return null;
      const start = v3.sub(axisP, v3.mul(a, BIG / 2));
      if (wrap && tubeFace(face) && Math.abs(v3.dot(a, frame.normal)) < 0.02) {
        const Rr = raised ? Rc - EMB_EPS : Rc + EMB_EPS;
        // Zylinder so drehen, dass der Treffpunkt bei u = π liegt (fern der Naht)
        let cyl = R.makeCylinder(Rr, BIG, start, a);
        let lat = cyl.faces.find((x) => x.geomType === "CYLINDRE");
        const Hr = v3.add(foot, v3.mul(rh, Rr));
        const u0 = lat.uvCoordinates(Hr)[0];
        cyl = cyl.rotate(((Math.PI - u0) * 180) / Math.PI, axisP, a);
        lat = cyl.faces.find((x) => x.geomType === "CYLINDRE");
        let [uH, vH] = lat.uvCoordinates(Hr);
        if (Math.abs(uH - Math.PI) > 0.1) { cyl = cyl.rotate(((2 * (u0 - Math.PI)) * 180) / Math.PI, axisP, a); lat = cyl.faces.find((x) => x.geomType === "CYLINDRE"); [uH, vH] = lat.uvCoordinates(Hr); }
        // Umfangsrichtung (u wachsend) in der Skizzenebene; Skizze (x, y) → abgewickelt (Bogen, Achse)
        let t = v3.cross(a, rh);
        t = v3.norm(v3.sub(t, v3.mul(frame.normal, v3.dot(t, frame.normal))));
        const hx = v3.dot(v3.sub(H, frame.origin), frame.xDir), hy = v3.dot(v3.sub(H, frame.origin), frame.yDir);
        const m = [v3.dot(frame.xDir, t), v3.dot(frame.yDir, t), v3.dot(frame.xDir, a), v3.dot(frame.yDir, a)];
        const T = ([x, y]) => [Rr * uH + (x - hx) * m[0] + (y - hy) * m[1], vH + (x - hx) * m[2] + (y - hy) * m[3]];
        const fc = regionToDrawing(mapRegion(reg, T)).sketchOnFace(lat, "original").face();
        const tool = thicken(fc, raised ? d + EMB_EPS : -(d + EMB_EPS));
        return { tool, face: "CYLINDER", wrapped: true, body: hit.body };
      }
      // projiziert: nur die zugewandte Hälfte des Mantels
      const ring = R.makeCylinder(Rc + hi, BIG, start, a).cut(R.makeCylinder(Rc + lo, BIG, start, a)).intersect(halfSpace(foot, rh, BIG));
      return { tool: prism().intersect(ring), face: "CYLINDER", wrapped: false, body: hit.body };
    }
    if (face.geomType !== "PLANE") throw new Error("Prägen geht auf ebene Flächen und Zylinder (Rohre)");
    let n = v3.norm(tuple(face.normalAt(H)));
    if (v3.dot(n, dir) > 0) n = v3.mul(n, -1);
    const slab = halfSpace(v3.add(H, v3.mul(n, lo)), n, BIG).intersect(halfSpace(v3.add(H, v3.mul(n, hi)), v3.mul(n, -1), BIG));
    const tool = prism().intersect(slab);
    // Gravur über Kante (dfm.py): Punkte des Umrisses, längs dir auf die Flächenebene gebracht, liegen neben der Fläche
    const pts = outlinePoints(reg);
    const dn = v3.dot(dir, n);
    const overEdge = Math.abs(dn) > 1e-6 && pts.some((q) => {
      const Q = toWorld(frame, q[0], q[1]);
      const onPlane = v3.add(Q, v3.mul(dir, v3.dot(v3.sub(H, Q), n) / dn));
      return R.measureDistanceBetween(R.makeVertex(onPlane), face) > 0.01;
    });
    return { tool, face: "PLANE", wrapped: false, overEdge, body: hit.body };
  }

  const RESTWAND = 0.1;
  /**
   * Mindest-Restwand (Patrick, 25.10.2026): Endet eine Vertiefung genau auf der Rückseite einer Wand oder weniger als
   * 0,1 mm davor, bleiben 0,1 mm stehen. P = Punkt der Endfläche, b = Richtung über das Ende hinaus, box = Hülle des
   * Werkzeugs. Rückseite = ebene Fläche mit Außennormale in Richtung b, die das Werkzeug überdeckt.
   * Ergebnis: um wie viel mm die Tiefe zu kürzen ist (0 = nichts).
   */
  function restwandShorten(bodies, P, b, box) {
    let sh = 0;
    const [lo, hi] = box.bounds;
    const grown = { bounds: [lo.map((x) => x - 0.2), hi.map((x) => x + 0.2)] };
    for (const body of bodies) {
      if (!bboxOverlap(body.shape.boundingBox, grown)) continue;
      for (const fc of body.shape.faces) {
        if (fc.geomType !== "PLANE" || !bboxOverlap(fc.boundingBox, grown)) continue;
        const c = tuple(fc.center), n = v3.norm(tuple(fc.normalAt(fc.center)));
        if (v3.dot(n, b) < 0.9999) continue;
        const d = v3.dot(v3.sub(c, P), b);
        if (d > -1e-4 && d < RESTWAND - 1e-9) sh = Math.max(sh, RESTWAND - d);
      }
    }
    return sh;
  }

  function holeTool(p, a, r, depth, f, E, through) {
    const eps = 0.01;
    const kind = f.sink || "none";
    if (kind === "none" && through) return R.makeCylinder(r, depth + eps, v3.sub(p, v3.mul(a, eps)), a);
    // Profil im Halbschnitt (x = Radius, y = Tiefe entlang a) -> Rotation
    const w = v3.norm(Math.abs(a[0]) < 0.9 ? v3.cross(a, [1, 0, 0]) : v3.cross(a, [0, 1, 0]));
    const normal = v3.cross(w, a);
    const tip = through || f.tip === false ? 0 : r / Math.tan((59 * Math.PI) / 180);
    const pts = [[0, -eps]];
    if (kind === "senkung") {
      const D = E(f.sinkDiameter, "Senkdurchmesser") / 2;
      const ang = E(f.sinkAngle || "90", "Senkwinkel");
      if (D <= r) throw new Error("Senkdurchmesser muss größer als Bohrung sein");
      const h = (D - r) / Math.tan(((ang / 2) * Math.PI) / 180);
      pts.push([D, -eps], [D, 0], [r, h]);
    } else if (kind === "flach") {
      const D = E(f.sinkDiameter, "Senkdurchmesser") / 2;
      const h = E(f.sinkDepth, "Senktiefe");
      if (D <= r) throw new Error("Senkdurchmesser muss größer als Bohrung sein");
      pts.push([D, -eps], [D, h], [r, h]);
    } else pts.push([r, -eps]);
    pts.push([r, depth]);
    if (tip > 0) pts.push([0, depth + tip]);
    else pts.push([0, depth]);
    let pen = R.draw(pts[0]);
    for (const q of pts.slice(1)) pen = pen.lineTo(q);
    const d = pen.close();
    const sk = d.sketchOnPlane(new R.Plane(p, w, normal));
    return sk.revolve(a, { origin: p });
  }

  /** Muster entlang Pfad: verschieben auf den Pfadpunkt, auf Wunsch mit der Tangente drehen (Skizzenebene des Pfads) */
  function pathTransforms(f, E, p) {
    const chain = f.reverse ? reverseChain(pathChain(p.sketch)) : pathChain(p.sketch);
    const fr = p.frame;
    const { stations } = pathPatternStations(chain, { count: E(f.count, "Anzahl"), spacing: f.spacingMode === "abstand" ? E(f.spacing, "Abstand") : null, align: f.align !== false });
    const vec = (m) => v3.add(v3.mul(fr.xDir, m[0]), v3.mul(fr.yDir, m[1]));
    return stations.map((stn) => (sh) => {
      let x = sh.translate(vec(stn.move));
      if (Math.abs(stn.angle) > 1e-9) x = x.rotate(stn.angle, toWorld(fr, stn.p[0], stn.p[1]), fr.normal);
      return x;
    });
  }

  function patternTransforms(f, E, datums) {
    const out = [];
    if (f.kind === "circular") {
      const da = patternAxis(f.axis, datums);
      const ax = da ? da.d : f.axis === "custom" ? (f.axisDir || ["0", "0", "1"]).map((x) => E(x, "Achse")) : AXES[f.axis || "Z"];
      const c = da ? da.p : (f.center || ["0", "0", "0"]).map((x) => E(x, "Mittelpunkt"));
      const n = Math.round(E(f.count, "Anzahl"));
      const total = E(f.angle || "360", "Winkel");
      const step = Math.abs(total - 360) < 1e-9 ? 360 / n : total / Math.max(1, n - 1);
      for (let k = 1; k < n; k++) out.push((s) => s.rotate(step * k, c, ax));
      return out;
    }
    const d1 = patternAxis(f.dir, datums)?.d || (f.dir === "custom" ? v3.norm((f.dirVec || ["1", "0", "0"]).map((x) => E(x, "Richtung"))) : AXES[f.dir || "X"]);
    const n1 = Math.max(1, Math.round(E(f.count, "Anzahl")));
    const s1 = E(f.spacing, "Abstand");
    const n2 = f.dir2 ? Math.max(1, Math.round(E(f.count2 || "1", "Anzahl 2"))) : 1;
    const s2 = f.dir2 ? E(f.spacing2 || "0", "Abstand 2") : 0;
    const d2 = f.dir2 ? AXES[f.dir2] : [0, 0, 0];
    for (let a = 0; a < n1; a++)
      for (let b = 0; b < n2; b++) {
        if (!a && !b) continue;
        const t = v3.add(v3.mul(d1, a * s1), v3.mul(d2, b * s2));
        out.push((s) => s.translate(t));
      }
    return out;
  }

  // ---------- Regelkörper in lokaler Lage: Grundfläche auf z = 0, Achse +z ----------
  function regelSolid(kind, d) {
    const revolveXZ = (pts) => {
      let dr = R.draw(pts[0]);
      for (const p of pts.slice(1)) dr = dr.lineTo(p);
      return dr.close().sketchOnPlane("XZ").revolve([0, 0, 1], { origin: [0, 0, 0] });
    };
    switch (kind) {
      case "quader": return R.makeBaseBox(d.L, d.B, d.H);
      case "zylinder": return R.makeCylinder(d.D / 2, d.H, [0, 0, 0], [0, 0, 1]);
      case "kugel": return R.makeSphere(d.D / 2);
      case "kegel": return revolveXZ(d.d > 1e-9 ? [[0, 0], [d.D / 2, 0], [d.d / 2, d.H], [0, d.H]] : [[0, 0], [d.D / 2, 0], [0, d.H]]);
      case "torus": return R.drawCircle(d.d / 2).translate([d.D / 2, 0]).sketchOnPlane("XZ").revolve([0, 0, 1], { origin: [0, 0, 0] });
      case "pyramide": {
        const c = [[-d.L / 2, -d.B / 2, 0], [d.L / 2, -d.B / 2, 0], [d.L / 2, d.B / 2, 0], [-d.L / 2, d.B / 2, 0]];
        return R.loft([R.assembleWire(c.map((p, i) => R.makeLine(p, c[(i + 1) % 4])))], { ruled: true, endPoint: [0, 0, d.H] });
      }
    }
    throw new Error("Unbekannter Regelkörper: " + kind);
  }
  // ---------- Normteile in lokaler Lage: Achse +z, Basispunkt = Auflagefläche (Schraube: Kopfunterseite) ----------
  function normSolid(kind, size, L) {
    if (NORM_KINDS[kind]?.beschlag) return beschlagSolid(kind, beschlagDims(kind, size));
    const t = NORM_THREADS[size];
    const hex = (s, h, z0 = 0) => R.drawPolysides(s / Math.sqrt(3), 6).sketchOnPlane("XY", z0).extrude(h);
    const cyl = (r, h, z0 = 0) => R.makeCylinder(r, h, [0, 0, z0], [0, 0, 1]);
    const core = t.d - 1.0825 * t.P; // Kerndurchmesser Bolzen (Flankendurchmesser-Näherung) für den Gewindebereich
    switch (kind) {
      case "schraube4017":
      case "schraube4014": {
        const b = kind === "schraube4014" ? Math.min(L, threadLength4014(t.d, L)) : L;
        let s = hex(t.s, t.k, -t.k);
        if (L - b > 0.01) s = s.fuse(cyl(t.d / 2, L - b));
        return s.fuse(cyl(core / 2, b, L - b));
      }
      case "mutter": return hex(t.s, t.m).cut(cyl(t.d / 2, t.m + 2, -1));
      case "scheibe": return cyl(t.d2 / 2, t.h).cut(cyl(t.d1 / 2, t.h + 2, -1));
      case "gewindestange": return cyl(core / 2, L);
      case "spannschloss": {
        // offener Bügel: zwei Naben mit Gewinde, verbunden durch zwei Seitenstege; Mitte bei z = 0
        const { l, b, e } = turnbuckleDims(size);
        const w = Math.max(3, (b - t.d) / 2), bar = (y) => R.makeBaseBox(w, w, l).translate([0, y, -l / 2]);
        let s = cyl(b / 2 * 0.8, e, l / 2).fuse(cyl(b / 2 * 0.8, e, -l / 2 - e)).fuse(bar(b / 2 - w / 2)).fuse(bar(-(b / 2 - w / 2)));
        return s.cut(cyl(t.d / 2, l + 2 * e + 2, -l / 2 - e - 1));
      }
    }
    throw new Error("Unbekanntes Normteil: " + kind);
  }
  /**
   * Beschläge (E11), Achse +z: Anschweißband ab Unterkante (zwei Hälften mit 2 mm Fuge, Stift durchgehend),
   * Kappen ab Rohrende (Stopfen zeigt in −z ins Rohr), Bodenanschlag ab Boden (Winkel mit Steg in +y).
   */
  function beschlagSolid(kind, m) {
    const cyl = (r, h, z0 = 0) => R.makeCylinder(r, h, [0, 0, z0], [0, 0, 1]);
    const box = (x, y, z, at) => R.makeBaseBox(x, y, z).translate(at);
    switch (kind) {
      case "anschweissband": {
        const half = (m.L - 2) / 2;
        return cyl(m.D / 2, half).fuse(cyl(m.D / 2, half, half + 2)).fuse(cyl(m.D * 0.22, m.L - 2 * 3, 3));
      }
      case "kugelkappe": {
        const r = m.D / 2, wall = Math.max(2, m.D * 0.06);
        const ball = R.makeSphere(r * 1.05).translate([0, 0, 3 + r * 0.8]);
        return cyl(r - wall, 12, -12).fuse(cyl(r, 3)).fuse(cyl(r * 0.55, r * 0.5, 2.5)).fuse(ball);
      }
      case "rohrkappe": {
        const r = m.D / 2, wall = Math.max(2, m.D * 0.06);
        return cyl(r - wall, 12, -12).fuse(cyl(r + 1, 3));
      }
      case "vierkantkappe": {
        const a = m.a, wall = Math.max(2, a * 0.06);
        return box(a - 2 * wall, a - 2 * wall, 12, [0, 0, -12]).fuse(box(a + 2, a + 2, 3, [0, 0, 0]));
      }
      case "bodenanschlag": {
        // Grundplatte w × d, Anschlagsteg h hoch an der Hinterkante, zwei Dübellöcher Ø 9
        let s = box(m.w, m.d, m.t, [0, 0, 0]).fuse(box(m.w, m.t, m.h, [0, m.d / 2 - m.t / 2, 0]));
        for (const x of [-m.w / 4, m.w / 4]) s = s.cut(cyl(4.5, m.t + 2, -1).translate([x, -m.t, 0]));
        return s;
      }
    }
    throw new Error("Unbekannter Beschlag: " + kind);
  }
  /** Körper mit Achse +z an Punkt pos auf Richtung dir drehen */
  function orientZ(shape, dir, pos) {
    const n = v3.norm(dir), z = [0, 0, 1];
    const axis = v3.cross(z, n), s = v3.len(axis), c = v3.dot(z, n);
    if (s > 1e-12) shape = shape.rotate((Math.atan2(s, c) * 180) / Math.PI, [0, 0, 0], axis);
    else if (c < 0) shape = shape.rotate(180, [0, 0, 0], [1, 0, 0]);
    return shape.translate(pos);
  }

  // ---------- Biegeteil im Generator: Querschnitt entlang einer Wendel bzw. eines Kreisbogens (src/core/biegeteil.js) ----------
  function pathWire(path0) {
    // steigend aufbauen (fallende Wendel vom anderen Ende her)
    let path = path0;
    if ((path.rise || 0) < 0) path = { ...path, a0: path.a0 + path.sweep, sweep: -path.sweep, rise: -path.rise, c: v3.add(path.c, v3.mul(pathAxes(path).n, path.rise)) };
    const P = (t) => pathPoint(path, t);
    if (Math.abs(path.rise || 0) < 1e-6) {
      if (Math.abs(path.sweep) >= 360 - 1e-6) return R.assembleWire([R.makeThreePointArc(P(0), P(0.25), P(0.5)), R.makeThreePointArc(P(0.5), P(0.75), P(1))]);
      return R.assembleWire([R.makeThreePointArc(P(0), P(0.5), P(1))]);
    }
    const ax = pathAxes(path);
    if (Math.abs(ax.n[2] - 1) > 1e-9 || Math.abs(ax.x[0] - 1) > 1e-9) throw new Error("Wendel nur um die senkrechte Achse");
    const h = R.makeHelix((path.rise * 360) / Math.abs(path.sweep), path.rise, path.r, [0, 0, 0], [0, 0, 1], path.sweep < 0);
    return h.rotate(path.a0, [0, 0, 0], [0, 0, 1]).translate(path.c);
  }
  /** Querschnitt g entlang der Bahn gezogen; envelope = nur Außenkontur (Ausklinken anderer Teile) */
  function sweepAlong(path, g, envelope = false) {
    const spine = pathWire(path);
    const o = spine.startPoint.toTuple(), z = v3.norm(spine.tangentAt(0).toTuple());
    let x = v3.sub(o, v3.add(path.c, v3.mul(pathAxes(path).n, v3.dot(v3.sub(o, path.c), pathAxes(path).n))));
    x = v3.norm(v3.sub(x, v3.mul(z, v3.dot(x, z))));
    const pl = new R.Plane(o, x, z);
    const sweep = (loop) => R.genericSweep(loopToDrawing(loop).sketchOnPlane(pl).wire, spine, { frenet: true });
    let solid = sweep(g.outer);
    if (!envelope) for (const hole of g.holes) solid = solid.cut(sweep(hole));
    return solid;
  }

  // ---------- Biegerohr: Kreis(ring) entlang der Mittellinie aus Geraden und Bögen ----------
  function sweepTube(pieces, geom) {
    const edges = pieces.map((p) => (p.t === "line" ? R.makeLine(p.a, p.b) : R.makeThreePointArc(p.a, p.m, p.b)));
    const spine = R.assembleWire(edges);
    const p0 = pieces[0], dir = v3.norm(v3.sub(p0.t === "line" ? p0.b : p0.m, p0.a));
    const rod = (r) => R.genericSweep(R.assembleWire([R.makeCircle(r, p0.a, dir)]), spine, { transitionMode: "right" });
    let solid = rod(geom.outer.r);
    if (geom.holes.length) solid = solid.cut(rod(geom.holes[0].r));
    return solid;
  }

  // ---------- Rahmen aus Skizzenlinien ----------
  function buildFrame(s, section, f, E, cut) {
    const N = s.frame.normal;
    const lines = sketchLines(s.sketch).filter((l) => !f.lines || f.lines === "all" || !f.lines.length || f.lines.includes(l.id));
    if (!lines.length) throw new Error("Skizze enthält keine Linien");
    const W = (p) => toWorld(s.frame, p[0], p[1]);
    // u = N × z (in der Ebene), v = N (Profilhöhe senkrecht zur Skizzenebene)
    return buildMembers(lines.map((l) => ({ id: l.id, a: W(l.a), b: W(l.b) })), section, f, E, cut, () => N, f.name || "Rahmen");
  }

  /**
   * Profile auf Segmenten [{id, a, b}] in Weltkoordinaten mit Gehrung/Stumpf an gemeinsamen Ecken und T-Stoß, für
   * Rahmen (eben) und 3D-Profilzug gleich. upOf(z, idx) gibt die Richtung der Profilhöhe, rollOf(idx) eine zusätzliche
   * Drehung des Segments um seine Achse.
   */
  function buildMembers(segs, section, f, E, cut, upOf, baseName, rollOf = () => 0) {
    const g = sectionGeometry(section.kind, section.dims);
    const rot0 = E(f.rotation || "0", "Drehung");
    const L = segs.map((sg, idx) => {
      const a = sg.a, b = sg.b;
      const z = v3.norm(v3.sub(b, a));
      const rot = rot0 + rollOf(idx);
      const fr = memberFrame(a, z, rot, upOf(z, idx));
      const c = Math.abs(Math.cos((rot * Math.PI) / 180)), sn = Math.abs(Math.sin((rot * Math.PI) / 180));
      const width = c * g.width + sn * g.height, height = c * g.height + sn * g.width;
      // Ausrichtung: Profil-Außenkante auf Linie (Versatz in u)
      let shift = 0;
      if (f.align === "links") shift = width / 2;
      if (f.align === "rechts") shift = -width / 2;
      if (shift) fr.origin = v3.add(fr.origin, v3.mul(fr.u, shift));
      return { l: sg, idx, a, b, z, fr, len: v3.dist(a, b), width, height, shift, cuts: { start: [], end: [] }, envCuts: [] };
    });
    // Seite des Profils o, auf die die Richtung d trifft: Breite (u) oder Höhe (v), im ebenen Rahmen immer u
    const sideOf = (o, d) => {
      const isU = Math.abs(v3.dot(o.fr.u, d)) >= Math.abs(v3.dot(o.fr.v, d)) - 1e-9;
      return isU ? { n: o.fr.u, half: o.width / 2, shift: o.shift } : { n: o.fr.v, half: o.height / 2, shift: 0 };
    };
    // Knoten über Punkt-IDs (und Lage)
    const keyOf = (p) => p.map((x) => Math.round(x * 1e5)).join(",");
    const nodes = new Map();
    for (const m of L) {
      for (const [end, p] of [["start", m.a], ["end", m.b]]) {
        const k = keyOf(p);
        if (!nodes.has(k)) nodes.set(k, []);
        nodes.get(k).push({ m, end, p });
      }
    }
    const warnings = [];
    const corner = f.corner || "gehrung";
    // Profil m stößt mit Ende "end" gegen Profil o.
    // Rundes Gegenprofil: an der Achse kappen + Hüllkörper abziehen (Sattelschnitt / Ausklinkung).
    // Eckiges Gegenprofil: gerader Schnitt an der zugewandten Außenfläche.
    const roundSection = ["rohr", "rund"].includes(section.kind);
    const buttAgainst = (m, end, dInto, o) => {
      const sd = sideOf(o, dInto);
      let n = sd.n;
      if (v3.dot(n, dInto) > 0) n = v3.mul(n, -1); // zeigt von m weg
      if (roundSection) {
        m.cuts[end].push({ p: o.fr.origin, n });
        m.envCuts.push(o);
      } else {
        m.cuts[end].push({ p: v3.sub(o.fr.origin, v3.mul(n, sd.half)), n });
        m.butt = true;
      }
    };
    for (const [, list] of nodes) {
      if (list.length === 1) {
        // freies Ende – T-Stoß prüfen (Ende liegt auf einer anderen Linie)
        const { m, end, p } = list[0];
        for (const o of L) {
          if (o === m) continue;
          const t = v3.dot(v3.sub(p, o.a), o.z);
          const perp = v3.dist(p, v3.add(o.a, v3.mul(o.z, t)));
          if (perp < 1e-4 && t > 1e-4 && t < o.len - 1e-4) {
            buttAgainst(m, end, end === "start" ? m.z : v3.mul(m.z, -1), o);
            break;
          }
        }
        continue;
      }
      if (list.length > 2) { warnings.push("Knoten mit mehr als 2 Profilen: stumpf ohne Gehrung"); continue; }
      const [A, B] = list;
      const dA = A.end === "start" ? A.m.z : v3.mul(A.m.z, -1); // vom Knoten weg in Profil A hinein
      const dB = B.end === "start" ? B.m.z : v3.mul(B.m.z, -1);
      if (Math.abs(v3.dot(dA, dB)) > 0.9999) { // kollinear
        if (v3.dot(dA, dB) < 0) continue; // fortlaufend: gerader Stoß
        warnings.push("Überlappende Linien");
        continue;
      }
      const P = A.p;
      if (corner === "gehrung") {
        const mvec = v3.norm(v3.sub(dA, dB));
        A.m.cuts[A.end].push({ p: P, n: v3.mul(mvec, -1) });
        B.m.cuts[B.end].push({ p: P, n: mvec });
      } else {
        // Stumpf: das Profil mit kleinerem Index läuft durch
        const [run, butt, dRun] = A.m.idx < B.m.idx ? [A, B, dA] : [B, A, dB];
        const sd = sideOf(butt.m, dRun);
        const sgn = v3.dot(sd.n, dRun) > 0 ? -1 : 1;
        const o = v3.mul(sd.n, sgn);
        // durchlaufendes Profil endet bündig mit der Außenseite des anderen
        run.m.cuts[run.end].push({ p: v3.add(P, v3.mul(o, sd.half + sgn * sd.shift)), n: o });
        buttAgainst(butt.m, butt.end, butt === A ? dA : dB, run.m);
      }
    }
    const members = [];
    const built = new Map();
    const order = [...L].sort((a, b) => a.envCuts.length - b.envCuts.length);
    for (const m of order) {
      // Gehrungen in 2D/3D wie beim Profil (Einstellung des Rahmens, für alle Stäbe)
      let { solid, ends, notes } = memberWithEnds(section, m.len, m.fr, m.cuts, cut);
      warnings.push(...notes.map((x) => `Profil ${m.idx + 1}, ${x}`));
      for (const o of m.envCuts) {
        const env = makeMember(section, o.len, o.fr, o.cuts, { envelope: true }).solid;
        solid = solid.cut(env);
      }
      const meta = {
        section: sectionName(section.kind, section.dims),
        profileId: profileId(section.kind, section.dims),
        area: g.area,
        length: memberLength(solid, m.fr),
        miterStart: cutAngle(m.cuts.start, m.fr.z),
        miterEnd: cutAngle(m.cuts.end, m.fr.z),
        miterParts: { A: cutParts(m.cuts.start, m.fr), B: cutParts(m.cuts.end, m.fr) },
        coped: m.envCuts.length > 0,
        butt: !!m.butt,
        frameZ: m.fr.z,
        line: m.l.id,
        endCuts: ends,
        axis: memberAxis(solid, m.fr, g),
        sec: { kind: section.kind, dims: section.dims },
      };
      built.set(m, { solid, meta, name: `${baseName} ${m.idx + 1}` });
    }
    for (const m of L) members.push(built.get(m));
    members.warnings = [...new Set(warnings)];
    return members;
  }

  // ---------- Knickrahmen: ein Rohr, V-ausgeklinkt und gefaltet ----------
  /**
   * Baut beide Zustände: gefaltet (gerade Abschnitte + Außenwand mit Biegeradius) und abgewickelt
   * (gerades Rohr mit Ausklinkungen). Erst wenn beide gültig sind, wird etwas übernommen.
   */
  function buildKnickrahmen(f, E, material = "S235") {
    const input = knickInput(f, E);
    const br = bendRule({ rule: f.bendRule || "k", material, t: input.dims.t, ri: input.bendRadius, k: input.kFactor });
    input.kOf = br.kOf;
    const plan = planKnickrahmen(input);
    if (plan.issues.length) throw new Error(plan.issues.map((x) => x.message).join("; "));
    const section = { kind: input.section, dims: input.dims };
    const g = plan.geom;
    const N = plan.frame.normal;
    const rot = input.orientation === "flach" ? 90 : 0;
    const name = f.name || "Knickrahmen";
    const Hext = plan.H + 10;
    const BIG = plan.W + 100;
    // Umrisse in Abwicklungs-Koordinaten (x = Rohrachse, y = σ·u, u zur Außenwand), extrudiert entlang N.
    // Gefaltet gelten dieselben Umrisse im Rahmen von Segment A bzw. B (Ursprung so, dass x1 bzw. x2 im
    // Tangentenpunkt liegt) – so passen gefaltete und abgewickelte Form exakt zusammen.
    const extr = (drawing, origin, xDir) => drawing.sketchOnPlane(new R.Plane(v3.sub(origin, v3.mul(N, Hext / 2)), xDir, N)).extrude(Hext);
    const poly = (pts) => {
      const q = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-9);
      let pen = R.draw(q[0]);
      for (const p of q.slice(1)) pen = pen.lineTo(p);
      return pen.close();
    };
    // uA hier = Schnittgrenze: Außenwand-Innenseite minus Reststeg (der Steg biegt sich mit der Außenwand)
    const uF = -(plan.W / 2 + 1), dd = plan.d, uA = plan.uB, ri = plan.ri;
    const kit = (k) => {
      const tn = k.tanHalf, y = (u) => k.sigma * u, xm = (k.x1 + k.x2) / 2;
      const flankA = (u) => k.x1 + (u - dd) * tn, flankB = (u) => k.x2 - (u - dd) * tn;
      const cross = flankA(uA) > flankB(uA) + 1e-9;
      const uc = dd + k.zone / (2 * tn);
      const clipBelow = (dr) => dr.intersect(R.drawRectangle(4 * BIG, BIG).translate(xm, y(uA - BIG / 2)));
      const rl = k.relief;
      // ohne Freistellung: V-Flanken enden am Bogen rᵢ − s um den Biegemittelpunkt (Ecke geschlossen);
      // weggeschnitten wird je Seite, was gefaltet in die gebogene Wand ragen würde
      const rB = ri - plan.restWall;
      const noRelief = (side, clip) => {
        const xa = side === "A" ? k.x1 : k.x2, sgn = side === "A" ? 1 : -1;
        const far = clip ? Math.abs(xm - xa) : BIG;
        let dr = R.drawRectangle(far, uA - dd).translate(xa + (sgn * far) / 2, y((uA + dd) / 2));
        if (rB > 1e-6) dr = dr.cut(R.drawCircle(rB).translate(xa, y(dd)));
        return dr;
      };
      const reliefFor = (side, clip) => {
        if (rl.kind !== "keine") return relief.clone();
        if (!(rB > 1e-6) || (clip && !(k.zone > 1e-6))) return null;
        return noRelief(side, clip);
      };
      const relief = rl.kind === "keine" ? null : clipBelow(rl.kind === "rund"
        // Langloch auf der Außenwand-Innenseite, Kreismitten bei xm ± half
        ? R.draw([xm - rl.half, y(uA - rl.r)]).lineTo([xm + rl.half, y(uA - rl.r)]).threePointsArcTo([xm + rl.half, y(uA + rl.r)], [xm + rl.half + rl.r, y(uA)])
          .lineTo([xm - rl.half, y(uA + rl.r)]).threePointsArcTo([xm - rl.half, y(uA - rl.r)], [xm - rl.half - rl.r, y(uA)]).close()
        : R.drawRectangle(rl.w, 2 * rl.h).translate(xm, y(uA)));
      // Schweißspalt: Streifen der Breite g/2 hinter jeder Flanke (bis zur Außenwand-Innenseite)
      const gh = plan.weldGap / 2 / Math.cos(Math.atan(tn)), eps = 1e-3;
      const strip = (side) => {
        if (!(plan.weldGap > 0)) return null;
        const f = side === "A" ? flankA : flankB, s = side === "A" ? -1 : 1;
        return poly([[f(uF) + s * gh, y(uF)], [f(uF) - s * eps, y(uF)], [f(uA) - s * eps, y(uA)], [f(uA) + s * gh, y(uA)]]);
      };
      const notch = dd <= uF ? null : poly(cross
        ? [[flankA(uF), y(uF)], [xm, y(uc)], [flankB(uF), y(uF)]]
        : [[flankA(uF), y(uF)], [flankA(uA), y(uA)], [flankB(uA), y(uA)], [flankB(uF), y(uF)]]);
      // gefaltet: Außenwand (u ≥ uA) jenseits des Tangentenpunkts gehört zur Biegung
      const outer = { A: R.drawRectangle(BIG, BIG).translate(k.x1 + BIG / 2, y(uA + BIG / 2)), B: R.drawRectangle(BIG, BIG).translate(k.x2 - BIG / 2, y(uA + BIG / 2)) };
      const tab = plan.tab && {
        nose: (r) => R.drawCircle(r).translate(flankA(plan.tab.u), y(plan.tab.u)),
        holeB: () => R.drawCircle(plan.tab.r + plan.tab.c).translate(flankB(plan.tab.u), y(plan.tab.u)),
      };
      return { reliefFor, strip, notch, outer, tab };
    };

    const cutsOf = plan.dirs.map(() => []), addsOf = plan.dirs.map(() => []), halves = plan.dirs.map(() => []);
    plan.knicks.forEach((k, j) => {
      const dA = plan.dirs[j], dB = plan.dirs[j + 1], P = plan.nodes[j + 1];
      const eA = v3.cross(N, dA);
      const nA = v3.mul(eA, k.sigma); // zur Außenwand
      const s = plan.d * k.tanHalf;
      const C = v3.add(v3.add(P, v3.mul(dA, s)), v3.mul(nA, plan.d));
      // Außenwand-Streifen (Querschnitt jenseits der Wand-Innenseite) im Tangentenpunkt von Segment A
      const fr = memberFrame(v3.add(P, v3.mul(dA, s)), dA, rot, N);
      const ax = Math.abs(v3.dot(fr.u, eA)) > 0.5 ? 0 : 1; // Querschnittsachse in der Knickebene
      const sgn = (ax === 0 ? v3.dot(fr.u, eA) : v3.dot(fr.v, eA)) > 0 ? 1 : -1;
      const big = g.width + g.height + 10;
      const lo = plan.uB, hi = plan.W / 2 + 1; // mitgebogen: Außenwand samt Reststeg
      const c = (sgn * k.sigma * (lo + hi)) / 2;
      const clip = ax === 0 ? R.drawRectangle(hi - lo, big).translate(c, 0) : R.drawRectangle(big, hi - lo).translate(0, c);
      const stripFace = regionToDrawing({ outer: g.outer, holes: g.holes }).intersect(clip).sketchOnPlane(new R.Plane(fr.origin, fr.u, fr.z));
      // je Segment die halbe Biegung: Gehrungsebene am Knoten enthält C und liegt bei |θ|/2
      const half = Math.abs(k.angle) / 2, axis = k.angle > 0 ? N : v3.mul(N, -1);
      const hA = R.revolution(stripFace.face(), C, axis, half);
      halves[j].push(hA);
      halves[j + 1].push(hA.clone().rotate(half, C, axis));
      // Segment-Rahmen in Abwicklungs-Koordinaten
      const oA = v3.sub(v3.add(P, v3.mul(dA, s)), v3.mul(dA, k.x1));
      const oB = v3.sub(v3.sub(P, v3.mul(dB, s)), v3.mul(dB, k.x2));
      const K = kit(k);
      cutsOf[j].push(extr(K.outer.A, oA, dA));
      cutsOf[j + 1].push(extr(K.outer.B, oB, dB));
      const relA = K.reliefFor("A", false), relB = K.reliefFor("B", false);
      if (relA) { cutsOf[j].push(extr(relA, oA, dA)); cutsOf[j + 1].push(extr(relB, oB, dB)); }
      if (K.strip("A")) { cutsOf[j].push(extr(K.strip("A"), oA, dA)); cutsOf[j + 1].push(extr(K.strip("B"), oB, dB)); }
      if (K.tab) {
        // Zapfen gehört zu Segment A (nur die Seitenwände), Segment B bekommt das Loch (mit Spiel)
        const wallsA = makeMember(section, input.segments[j] + plan.W + 50, memberFrame(plan.nodes[j], dA, rot, N)).solid;
        addsOf[j].push(extr(K.tab.nose(plan.tab.r), oA, dA).intersect(wallsA));
        cutsOf[j + 1].push(extr(K.tab.holeB(), oB, dB));
      }
    });
    // gefaltet: Segmente auf Gehrung, je mit der halben Biegung, ohne Flächen-Vereinigung verschmolzen
    // (die Gehrung bleibt als Linie sichtbar)
    const segments = plan.dirs.map((z, i) => {
      const cuts = { start: [], end: [] };
      const m0 = i > 0 ? Math.abs(plan.knicks[i - 1].angle) / 2 : 0, m1 = i < plan.knicks.length ? Math.abs(plan.knicks[i].angle) / 2 : 0;
      if (i > 0) cuts.start.push({ p: plan.nodes[i], n: v3.mul(v3.norm(v3.add(z, plan.dirs[i - 1])), -1) });
      if (i < plan.dirs.length - 1) cuts.end.push({ p: plan.nodes[i + 1], n: v3.norm(v3.add(z, plan.dirs[i + 1])) });
      const fr = memberFrame(plan.nodes[i], z, rot, N);
      let seg = makeMember(section, input.segments[i], fr, cuts).solid;
      for (const c of cutsOf[i]) seg = seg.cut(c);
      for (const a of addsOf[i]) seg = seg.fuse(a);
      for (const hb of halves[i]) seg = seg.fuse(hb);
      checkSolid(seg, `Segment ${i + 1}`);
      return { solid: seg, length: memberLength(seg, fr), miterStart: m0, miterEnd: m1 };
    });
    let folded = segments[0].solid;
    for (const sg of segments.slice(1)) folded = folded.fuse(sg.solid, { simplify: false });
    checkSolid(folded, "gefaltet");

    // abgewickelt: gerades Rohr entlang Segment 1; je Knick V-Ausklinkung, Freistellung, Spalt, Zapfen
    const z0 = plan.dirs[0], o0 = plan.nodes[0];
    const tube = makeMember(section, plan.flatLength, memberFrame(o0, z0, rot, N)).solid;
    let flat = tube.clone();
    const noses = [];
    for (const k of plan.knicks) {
      const K = kit(k), y = (u) => k.sigma * u;
      flat = flat.cut(K.notch ? extr(K.notch, o0, z0) : extr(poly([[k.x1, y(uA)], [k.x2, y(uA)], [k.x2, y(uF)], [k.x1, y(uF)]]), o0, z0));
      for (const side of k.relief.kind === "keine" ? ["A", "B"] : ["A"]) { const dr = K.reliefFor(side, true); if (dr) flat = flat.cut(extr(dr, o0, z0)); }
      if (K.strip("A")) flat = flat.cut(extr(K.strip("A"), o0, z0)).cut(extr(K.strip("B"), o0, z0));
      if (K.tab) { flat = flat.cut(extr(K.tab.holeB(), o0, z0)); noses.push(extr(K.tab.nose(plan.tab.r), o0, z0).intersect(tube.clone())); }
    }
    for (const n of noses) flat = flat.fuse(n);
    checkSolid(flat, "abgewickelt");

    const meta = {
      section: sectionName(section.kind, section.dims),
      profileId: profileId(section.kind, section.dims),
      area: plan.area,
      length: plan.flatLength,
      miterStart: 0,
      miterEnd: 0,
      coped: plan.knicks.length > 0, // V-Ausklinkung(en) – Spalte »Ausgeklinkt« der Zuschnittliste
      knicks: plan.knicks.length,
      notchAngles: plan.knicks.map((k) => round(k.angle)),
      bendAllowances: plan.knicks.map((k) => k.zone),
      relief: plan.reliefKind,
      reliefMin: plan.knicks.map((k) => k.relief.min), // Mindestmaße der Freistellung je Knick
      weldGap: plan.weldGap,
      restWall: plan.restWall,
      tabs: !!plan.tab,
      legs: input.segments.slice(), // Schenkellängen wie eingegeben (Fertigungsprüfung)
      inPlane: plan.W, // Rohrmaß in der Knickebene
      wall: plan.t,
      frameZ: z0,
      rule: ruleSummary(br),
    };
    return { folded, segments, flat, meta, name, plan, warnings: [...new Set(br.warnings)] };
  }

  /** Körperprüfung: genau ein gültiger Volumenkörper mit Volumen > 0 */
  function checkSolid(shape, label) {
    const n = shape.solids.length;
    if (n !== 1) throw new Error(`Knickrahmen (${label}): ${n} statt 1 Körper – Ausklinkung trennt das Rohr`);
    const oc = R.getOC();
    const an = new oc.BRepCheck_Analyzer(shape.wrapped, true, false);
    const ok = an.IsValid();
    an.delete();
    if (!ok) throw new Error(`Knickrahmen (${label}): Körper ungültig (Geometrie-Prüfung)`);
    if (!(R.measureVolume(shape) > 0)) throw new Error(`Knickrahmen (${label}): Volumen ist 0`);
  }

  /**
   * Schnittwinkel eines Endes in zwei Ebenen: b = gekippt über die Breite (Ebene u–z), h = über die Höhe (Ebene v–z),
   * je Winkel der Schnittspur zur Senkrechten auf die Achse in °, mit Vorzeichen. Gehrung in einer Ebene: ein Wert 0.
   */
  function cutParts(list, fr) {
    if (!list.length) return { b: 0, h: 0 };
    const n = v3.norm(list[0].n), cz = Math.abs(v3.dot(n, fr.z)) || 1e-12, s = Math.sign(v3.dot(n, fr.z)) || 1;
    const deg = (x) => Math.round((Math.atan(x) * 180) / Math.PI * 10) / 10 || 0;
    return { b: deg((s * v3.dot(n, fr.u)) / cz), h: deg((s * v3.dot(n, fr.v)) / cz) };
  }
  function cutAngle(list, z) {
    if (!list.length) return 0;
    const c = Math.abs(v3.dot(v3.norm(list[0].n), z));
    return round((Math.acos(Math.min(1, c)) * 180) / Math.PI);
  }

  // ---------- Ausgabe für die Anzeige ----------
  /** Achse und Radius einer Zylinderfläche: {axisP, axisD, radius} */
  function cylinderAxis(face) {
    const ad = new (R.getOC().BRepAdaptor_Surface)(face.wrapped, true);
    try {
      const c = ad.Cylinder(), ax = c.Axis(), l = ax.Location(), d = ax.Direction();
      return { axisP: [l.X(), l.Y(), l.Z()], axisD: [d.X(), d.Y(), d.Z()], radius: c.Radius() };
    } finally { ad.delete(); }
  }
  function meshBody(shape, quality = "normal") {
    const tol = quality === "fein" ? 0.02 : quality === "grob" ? 0.3 : 0.08;
    const ang = quality === "fein" ? 0.1 : quality === "grob" ? 0.5 : 0.25;
    const m = shape.mesh({ tolerance: tol, angularTolerance: ang });
    const faceInfo = new Map();
    shape.faces.forEach((fc, idx) => {
      try {
        // replicad meldet Zylinder als "CYLINDRE"; einheitlich "CYLINDER" mit Achse und Radius (für Konzentrisch)
        // idx = Lage in shape.faces, damit das Messen die exakte Fläche im Kern findet
        const info = { type: fc.geomType === "CYLINDRE" ? "CYLINDER" : fc.geomType, idx };
        if (info.type === "PLANE") { info.normal = tuple(fc.normalAt()); info.point = tuple(fc.center); }
        else if (info.type === "CYLINDER") { info.point = tuple(fc.center); Object.assign(info, cylinderAxis(fc)); }
        faceInfo.set(hashOf(fc), info);
      } catch { /* ignore */ }
    });
    const faces = m.faceGroups.map((g) => ({ start: g.start, count: g.count, ...(faceInfo.get(g.faceId) || {}) }));
    const em = shape.meshEdges({ tolerance: tol, angularTolerance: ang });
    const edgeInfo = new Map();
    shape.edges.forEach((e, idx) => {
      try { edgeInfo.set(hashOf(e), { mid: edgeMid(e), type: e.geomType, idx }); } catch { /* ignore */ }
    });
    const edges = em.edgeGroups.map((g) => ({
      positions: Float32Array.from(em.lines.slice(g.start * 3, (g.start + g.count) * 3)),
      ...(edgeInfo.get(g.edgeId) || {}),
    }));
    return {
      positions: Float32Array.from(m.vertices),
      normals: Float32Array.from(m.normals),
      indices: Uint32Array.from(m.triangles),
      faces,
      edges,
    };
  }

  function bodyProps(shape) {
    let volume = NaN, center = null, area = NaN;
    try { const vp = R.measureShapeVolumeProperties(shape); volume = vp.volume; center = vp.centerOfMass; } catch { /* ignore */ }
    try { area = R.measureArea(shape); } catch { /* ignore */ }
    const bb = shape.boundingBox;
    let holes = [];
    try { holes = holeAxes(shape); } catch { /* ignore */ }
    return { volume, area, center, bbox: bb.bounds, holes };
  }
  /** Bohrungen eines Körpers: Zylinderflächen, deren Normale zur Achse zeigt (innen) → [{p, d, r}] */
  function holeAxes(shape) {
    const out = [];
    for (const fc of shape.faces) {
      if (fc.geomType !== "CYLINDRE" && fc.geomType !== "CYLINDER") continue;
      try {
        const ax = cylinderAxis(fc);
        const q = tuple(fc.pointOnSurface(0.5, 0.5)), n = tuple(fc.normalAt(q));
        const foot = v3.add(ax.axisP, v3.mul(ax.axisD, v3.dot(v3.sub(q, ax.axisP), ax.axisD)));
        if (v3.dot(v3.sub(q, foot), n) < 0) out.push({ p: foot, d: ax.axisD, r: ax.radius });
      } catch { /* ignore */ }
    }
    return out;
  }

  /**
   * Exakte Messwerte (OpenCascade GProp/BRepExtrema) für Flächen und Kanten.
   * entries: [{shape: Fläche oder Kante, bereits platziert, kind: "face"|"edge"}]
   * → {items: [{kind, type, area|length, radius?, center?, normal?, dir?, start?, end?}], distance?, angle?}
   * Kein Messwert wird aus dem Anzeigenetz geschätzt.
   */
  /** Anfangs- (end=0) oder Endpunkt (end=1) einer Kante als Vertex */
  function vertexOf(edge, end) {
    const point = tuple(end ? edge.endPoint : edge.startPoint);
    return { shape: R.makeVertex(point), point };
  }
  function measure(entries) {
    const items = entries.map(({ shape: s, kind, point }) => {
      if (kind === "vertex") return { kind, type: "POINT", point };
      if (kind === "face") {
        const type = s.geomType === "CYLINDRE" ? "CYLINDER" : s.geomType;
        const sp = R.measureShapeSurfaceProperties(s);
        const it = { kind, type, area: sp.area, center: sp.centerOfMass };
        if (type === "PLANE") it.normal = tuple(s.normalAt());
        if (type === "CYLINDER") { const ax = cylinderAxis(s); it.radius = ax.radius; it.axisD = ax.axisD; it.axisP = ax.axisP; }
        // Stufe 47: Umfang (Außenkontur) und Gesamtkonturlänge (alle Konturen, ohne Nahtkanten von Zylindern)
        try {
          it.perimeter = R.measureLength(s.clone().outerWire()); // outerWire/innerWires geben die Fläche frei
          it.loops = 1 + s.clone().innerWires().length;
        } catch { /* Fläche ohne Kontur (z. B. Kugel) */ }
        it.contour = s.edges.filter((e) => !R.getOC().BRep_Tool.IsClosed(e.wrapped, s.wrapped)).reduce((t, e) => t + R.measureLength(e), 0);
        return it;
      }
      const it = { kind, type: s.geomType, length: R.measureLength(s), start: tuple(s.startPoint), end: tuple(s.endPoint), mid: tuple(s.pointAt(0.5)) };
      if (it.type === "LINE") {
        const d = it.end.map((v, k) => v - it.start[k]);
        const L = Math.hypot(...d) || 1;
        it.dir = d.map((v) => v / L);
      }
      if (it.type === "CIRCLE") {
        const c = s.curve.wrapped.Circle();
        const l = c.Location(), ax = c.Axis().Direction();
        it.radius = c.Radius();
        it.center = [l.X(), l.Y(), l.Z()];
        it.axisD = [ax.X(), ax.Y(), ax.Z()];
        // Bogen: Öffnungswinkel aus Länge und Radius
        if (Math.abs(it.length - 2 * Math.PI * it.radius) > 1e-6) it.arc = (it.length / it.radius) * 180 / Math.PI;
      }
      return it;
    });
    const out = { items };
    if (entries.length === 2) {
      // Mindestabstand mit den beiden nächsten Punkten (für Δ X/Y/Z und das Maß im 3D-Fenster)
      const ds = new (R.getOC().BRepExtrema_DistShapeShape)();
      ds.LoadS1(entries[0].shape.wrapped); ds.LoadS2(entries[1].shape.wrapped); ds.Perform();
      out.distance = ds.Value();
      if (ds.NbSolution() > 0) {
        const pt = (p) => [p.X(), p.Y(), p.Z()];
        out.pa = pt(ds.PointOnShape1(1)); out.pb = pt(ds.PointOnShape2(1));
        out.delta = out.pb.map((v, k) => v - out.pa[k]);
      }
      ds.delete?.();
      const [a, b] = items;
      const va = a.normal || a.dir || null, vb = b.normal || b.dir || null;
      if (va && vb) {
        const dot = Math.abs(va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]);
        let ang = (Math.acos(Math.min(1, dot)) * 180) / Math.PI;
        // Ebene zu Gerade: Winkel zwischen Gerade und Ebene = 90° − Winkel zur Normalen
        if (!!a.normal !== !!b.normal) ang = 90 - ang;
        out.angle = ang;
        out.parallel = Math.abs(ang) < 1e-6 || Math.abs(ang - 180) < 1e-6;
      }
      if (a.axisD && b.axisD && a.center && b.center) {
        const dot = Math.abs(a.axisD[0] * b.axisD[0] + a.axisD[1] * b.axisD[1] + a.axisD[2] * b.axisD[2]);
        out.axisAngle = (Math.acos(Math.min(1, dot)) * 180) / Math.PI;
      }
    }
    return out;
  }

  // ---------- Export ----------
  // ---------- Stecksystem (Stufe 45/46): Berührfläche finden, Zapfen und Schlitze als Quader ----------
  /** Zahlen eines Stecksystems aus den Ausdrücken */
  function tabSlotParams(f, E) {
    const len = String(f.length ?? "").trim();
    return {
      mode: f.mode || "anzahl", count: E(f.count ?? "3", "Anzahl"), spacing: E(f.spacing ?? "150", "Höchstabstand"),
      width: E(f.width ?? "20", "Zapfenbreite"), edge: E(f.edge ?? "15", "Randabstand"), clearance: E(f.clearance ?? "0.2", "Spiel"),
      length: len ? E(len, "Zapfenlänge") : null, over: E(f.over ?? "0", "Überstand"),
    };
  }
  /**
   * Zapfen und Schlitze für Körper A (steht auf) und B (Platte, Blech, Rohr), beide im selben System.
   * Rückgabe { tabs, slots: [{ c, u, n, w, t, depth }], info } – Quader: Mitte c auf der Fläche, Breite w entlang u,
   * Dicke t quer dazu, von c um depth entgegen n (n = Normale der Berührfläche, zeigt aus B heraus).
   */
  function tabSlotPlan(Ashape, Bshape, p) {
    const eps = 0.05, big = 1e5;
    const slabOn = (o, n, h) => R.drawRectangle(big, big).sketchOnPlane(new R.Plane(o, Math.abs(n[2]) < 0.9 ? v3.norm(v3.cross([0, 0, 1], n)) : [1, 0, 0], n)).extrude(h);
    let best = null;
    for (const fc of Bshape.faces) {
      if (fc.geomType !== "PLANE") continue;
      const n = v3.norm(tuple(fc.normalAt())), o = tuple(fc.center);
      let reg;
      try { reg = Ashape.clone().intersect(slabOn(o, n, eps)); } catch { continue; }
      if (isEmptyShape(reg)) continue;
      const pts = reg.edges.flatMap((e) => [tuple(e.startPoint), tuple(e.endPoint)]);
      const lines = reg.edges.filter((e) => e.geomType === "LINE").map((e) => v3.sub(tuple(e.endPoint), tuple(e.startPoint))).filter((d) => Math.abs(v3.dot(v3.norm(d), n)) < 1e-6);
      if (!lines.length) continue;
      const u = v3.norm(lines.sort((x, y) => v3.len(y) - v3.len(x))[0]), w = v3.cross(n, u);
      const us = pts.map((q) => v3.dot(v3.sub(q, o), u)), ws = pts.map((q) => v3.dot(v3.sub(q, o), w));
      const L = Math.max(...us) - Math.min(...us), T = Math.max(...ws) - Math.min(...ws);
      if (!best || L * T > best.L * best.T) best = { n, o, u, w, L, T, u0: Math.min(...us), w0: Math.min(...ws) };
    }
    if (!best) throw new Error("Zapfenteil berührt keine ebene Fläche des Schlitzteils – Teile aufeinanderstellen");
    const { n, o, u, w, L, T } = best;
    const centers = tabLayout(L, p);
    // Wanddicke unter der Mitte der Berührlinie: Sonde ins Schlitzteil
    const mid = v3.add(o, v3.add(v3.mul(u, best.u0 + L / 2), v3.mul(w, best.w0 + T / 2)));
    const probe = R.drawRectangle(1, 1).sketchOnPlane(new R.Plane(mid, u, v3.mul(n, -1))).extrude(1e4);
    const hit = Bshape.clone().intersect(probe);
    const wall = wallFromDepths(hit.edges.flatMap((e) => [tuple(e.startPoint), tuple(e.endPoint)]).map((q) => -v3.dot(v3.sub(q, mid), n)));
    const len = p.length != null ? p.length : wall + (p.over || 0);
    if (!(len > 0)) throw new Error("Zapfenlänge muss > 0 sein");
    const sl = slotSize(p.width, T, p.clearance);
    const tabs = [], slots = [];
    for (const x of centers) {
      const c = v3.add(o, v3.add(v3.mul(u, best.u0 + x), v3.mul(w, best.w0 + T / 2)));
      const ce = v3.add(c, v3.mul(n, eps));
      tabs.push({ c: ce, u, n, w: p.width, t: T, depth: len + eps });
      slots.push({ c: ce, u, n, w: sl.w, t: sl.t, depth: wall + 2 * eps });
    }
    return { tabs, slots, wall, len, info: `${centers.length} Zapfen ${round(p.width)} × ${round(T)} mm, Länge ${round(len)} mm · Schlitze ${round(sl.w)} × ${round(sl.t)} mm · Wand ${round(wall)} mm` };
  }
  /** Quader aus tabSlotPlan an einen Körper anfügen (fuse) oder ausschneiden (cut) */
  function applyBoxes(shape, boxes, op) {
    let out = shape;
    for (const b of boxes) {
      const solid = R.drawRectangle(b.w, b.t).sketchOnPlane(new R.Plane(b.c, b.u, v3.mul(b.n, -1))).extrude(b.depth);
      out = op === "fuse" ? out.fuse(solid) : out.cut(solid);
    }
    return out;
  }

  function placed(shape, pos, rot) {
    let s = shape.clone();
    if (rot[0]) s = s.rotate(rot[0], [0, 0, 0], [1, 0, 0]);
    if (rot[1]) s = s.rotate(rot[1], [0, 0, 0], [0, 1, 0]);
    if (rot[2]) s = s.rotate(rot[2], [0, 0, 0], [0, 0, 1]);
    if (pos[0] || pos[1] || pos[2]) s = s.translate(pos);
    return s;
  }
  function compound(shapes) {
    if (shapes.length === 1) return shapes[0];
    return R.makeCompound(shapes);
  }

  /**
   * Hidden-Line-Projektion für Zeichnungsansichten.
   * view: {dir: Blickrichtung (vom Betrachter in die Szene), up}
   */
  function projectView(shape, view) {
    const { visible, hidden } = R.drawProjection(shape, camera(view));
    const parse = (drw) => {
      const polylines = [];
      const arcs = [];
      for (const p of flattenPaths(drw.toSVGPaths())) {
        const r = parseSvgPath(p, { flipY: true });
        polylines.push(...r.polylines);
        arcs.push(...r.arcs);
      }
      return { polylines, arcs };
    };
    const vis = parse(visible);
    let hid = { polylines: [], arcs: [] };
    if (view.hidden !== false) {
      try { hid = parse(hidden); } catch { /* keine verdeckten Kanten */ }
      hid.polylines = removeCovered(hid.polylines, vis.polylines);
    }
    return { visible: vis.polylines, hidden: hid.polylines, arcs: vis.arcs, hiddenArcs: hid.arcs };
  }

  /**
   * Achsen von Zylinderflächen, die in der Ansicht von der Seite zu sehen sind (Bohrungen, Rohre, Bolzen), als Strecken in
   * Ansichtskoordinaten – für automatische Mittellinien wie in Inventor. Gleichachsige Teilflächen werden zusammengefasst;
   * nur, was zusammen mindestens einen Halbkreis bildet (keine Rundungen an Kanten).
   */
  function cylinderAxes(shape, view) {
    const d = v3.norm(view.dir), up = v3.norm(view.up);
    const right = v3.norm(v3.cross(d, up));
    const Y = v3.cross(v3.mul(d, -1), right);
    const groups = [];
    for (const fc of shape.faces) {
      if (fc.geomType !== "CYLINDRE" && fc.geomType !== "CYLINDER") continue;
      try {
        const ax = cylinderAxis(fc);
        const D = v3.norm(ax.axisD);
        if (Math.abs(v3.dot(D, d)) > 1e-3) continue; // nicht von der Seite gesehen
        const b = fc.UVBounds;
        const sweep = Math.min(2 * Math.PI, Math.abs(b.uMax - b.uMin));
        const P0 = v3.add(ax.axisP, v3.mul(ax.axisD, b.vMin)), P1 = v3.add(ax.axisP, v3.mul(ax.axisD, b.vMax));
        const t0 = Math.min(v3.dot(P0, D), v3.dot(P1, D)), t1 = Math.max(v3.dot(P0, D), v3.dot(P1, D));
        // Fußpunkt der Achse senkrecht zu D (eindeutig für gleichachsige Flächen)
        const foot = v3.sub(ax.axisP, v3.mul(D, v3.dot(ax.axisP, D)));
        // in Richtung der Gruppe gemessen; nur überlappende Teilflächen zählen zusammen (keine gestapelten Rundungen)
        const along = (x) => (v3.dot(x.D, D) < 0 ? [-t1, -t0] : [t0, t1]);
        let g = groups.find((x) => {
          if (Math.abs(Math.abs(v3.dot(x.D, D)) - 1) > 1e-6 || v3.len(v3.sub(x.foot, foot)) > 1e-3 || Math.abs(x.r - ax.radius) > 1e-3) return false;
          const [a, b] = along(x);
          return a < x.t1 - 1e-3 && b > x.t0 + 1e-3;
        });
        const [a0, a1] = g ? along(g) : [t0, t1];
        if (!g) groups.push(g = { D, foot, r: ax.radius, t0: a0, t1: a1, sweep: 0 });
        g.t0 = Math.min(g.t0, a0); g.t1 = Math.max(g.t1, a1); g.sweep += sweep;
      } catch { /* ignore */ }
    }
    const P2 = (p) => [v3.dot(p, right), v3.dot(p, Y)];
    const out = [];
    for (const g of groups) {
      if (g.sweep < Math.PI * 0.95 || g.t1 - g.t0 < 1e-6) continue;
      const a = P2(v3.add(g.foot, v3.mul(g.D, g.t0))), b = P2(v3.add(g.foot, v3.mul(g.D, g.t1)));
      // gleiche Linie in der Ansicht (z. B. Bohrungen hintereinander) nur einmal, überlappende verbinden
      const dup = out.find((o) => {
        const ux = o[1][0] - o[0][0], uy = o[1][1] - o[0][1], L = Math.hypot(ux, uy);
        if (L < 1e-9) return false;
        const off = (q) => Math.abs((q[0] - o[0][0]) * uy - (q[1] - o[0][1]) * ux) / L;
        if (off(a) > 0.01 || off(b) > 0.01) return false;
        const t = (q) => ((q[0] - o[0][0]) * ux + (q[1] - o[0][1]) * uy) / L;
        const ta = t(a), tb = t(b), lo = Math.min(ta, tb), hi = Math.max(ta, tb);
        if (hi < -0.5 || lo > L + 0.5) return false;
        const n0 = Math.min(0, lo), n1 = Math.max(L, hi), O = o[0];
        o[0] = [O[0] + (ux / L) * n0, O[1] + (uy / L) * n0];
        o[1] = [O[0] + (ux / L) * n1, O[1] + (uy / L) * n1];
        return true;
      });
      if (!dup) out.push([a, b]);
    }
    return out;
  }
  /** Kamera aus Blickrichtung + Oben-Richtung */
  function camera(view) {
    const d = v3.norm(view.dir);
    const up = v3.norm(view.up);
    const right = v3.norm(v3.cross(d, up));
    return new R.ProjectionCamera([0, 0, 0], v3.mul(d, -1), right);
  }
  /** Sichtbare Kanten als rohe SVG-Pfade (für exakte DXF-Ausgabe) */
  function projectRaw(shape, view) {
    const { visible } = R.drawProjection(shape, camera(view));
    return flattenPaths(visible.toSVGPaths());
  }
  /** Größte ebene Fläche eines Körpers: {normal, point, area} */
  function largestPlanarFace(shape) {
    let best = null;
    for (const f of shape.faces) {
      if (f.geomType !== "PLANE") continue;
      let a = 0;
      try { a = R.measureArea(f); } catch { continue; }
      if (!best || a > best.area + 1e-9) best = { area: a, normal: tuple(f.normalAt()), point: tuple(f.center) };
    }
    return best;
  }
  /**
   * Schnittflächen (eben, Normale +n, auf Ebene n·p = c) als geschlossene Konturen in Ansichtskoordinaten.
   * Aus der Triangulierung: Randkanten (nur einmal benutzt) werden zu Schleifen verkettet.
   */
  function sectionLoops(shape, n, c, view) {
    const d = v3.norm(view.dir), up = v3.norm(view.up);
    const right = v3.norm(v3.cross(d, up));
    const Y = v3.cross(v3.mul(d, -1), right);
    const sel = new Set();
    for (const fc of shape.faces) {
      if (fc.geomType !== "PLANE") continue;
      try {
        const nn = tuple(fc.normalAt()), ce = tuple(fc.center);
        if (v3.dot(nn, n) > 0.9999 && Math.abs(v3.dot(ce, n) - c) < 1e-3) sel.add(hashOf(fc));
      } catch { /* ignore */ }
    }
    if (!sel.size) return [];
    const m = shape.mesh({ tolerance: 0.05, angularTolerance: 0.2 });
    const V = m.vertices, loops = [];
    for (const g of m.faceGroups) {
      if (!sel.has(g.faceId)) continue;
      const tri = m.triangles.slice(g.start, g.start + g.count);
      const cnt = new Map();
      for (let i = 0; i + 2 < tri.length; i += 3) {
        for (const [a, b] of [[tri[i], tri[i + 1]], [tri[i + 1], tri[i + 2]], [tri[i + 2], tri[i]]]) {
          const k = a < b ? a + "," + b : b + "," + a;
          cnt.set(k, (cnt.get(k) || 0) + 1);
        }
      }
      const adj = new Map();
      const link = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); };
      for (const [k, v] of cnt) if (v === 1) { const [a, b] = k.split(",").map(Number); link(a, b); link(b, a); }
      const used = new Set();
      for (const start of adj.keys()) {
        if (used.has(start)) continue;
        const loop = [];
        let prev = -1, cur = start;
        while (cur !== undefined && !used.has(cur)) {
          used.add(cur);
          loop.push(cur);
          const nb = adj.get(cur).find((x) => x !== prev && !used.has(x));
          prev = cur;
          cur = nb;
        }
        if (loop.length > 2) loops.push(loop.map((i) => { const p = [V[3 * i], V[3 * i + 1], V[3 * i + 2]]; return [v3.dot(p, right), v3.dot(p, Y)]; }));
      }
    }
    return loops;
  }
  /** Körper an der Ebene n·p = c kappen (alles auf der +n-Seite entfernen) */
  function cutAtPlane(shape, n, c) {
    const bb = shape.boundingBox;
    const size = 4 * Math.hypot(bb.width, bb.height, bb.depth) + 100;
    n = v3.norm(n);
    // Quader um die Projektion der Bauteilmitte auf die Schnittebene (nicht um den Weltursprung)
    const center = tuple(bb.center);
    const q = v3.sub(center, v3.mul(n, v3.dot(n, center) - c));
    return shape.clone().cut(halfSpace(q, n, size));
  }
  /** Oben-Richtung senkrecht zur Blickrichtung: Weltachse mit kleinstem Anteil an n */
  function upFor(n) {
    const axes = [[0, 0, 1], [0, 1, 0], [1, 0, 0]];
    let best = axes[0], bd = 2;
    for (const a of axes) { const d = Math.abs(v3.dot(a, n)); if (d < bd - 1e-9) { bd = d; best = a; } }
    return v3.norm(v3.sub(best, v3.mul(n, v3.dot(best, n))));
  }

  /**
   * Kollisionen zwischen Komponenten: Schnittvolumen je Paar. Berührung (Fläche an Fläche) ist keine Kollision.
   * list: [{key, shape}] bereits platziert; Körper mit gleichem key (eine Komponente) werden nicht gegeneinander geprüft.
   * tol: Mindestvolumen in mm³ – fachlich: Rundungs- und Tessellierungsfehler der Booleschen Operation liegen weit
   * darunter, eine echte Überschneidung von 0,1 mm auf 10 × 10 mm ergibt bereits 10 mm³.
   */
  function collisions(list, { tol = 1 } = {}) {
    const out = [];
    const boxes = list.map((x) => x.shape.boundingBox);
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        if (list[i].key === list[j].key) continue;
        if (!bboxOverlap(boxes[i], boxes[j], 1e-3)) continue;
        let vol = 0;
        try { vol = R.measureVolume(list[i].shape.clone().intersect(list[j].shape.clone())); } catch { vol = NaN; }
        if (!(vol <= tol)) out.push({ a: list[i].key, b: list[j].key, volume: vol });
      }
    // je Komponentenpaar zusammenfassen
    const pairs = new Map();
    for (const c of out) {
      const k = [c.a, c.b].sort().join("|");
      const p = pairs.get(k) || { a: c.a, b: c.b, volume: 0 };
      p.volume += Number.isFinite(c.volume) ? c.volume : 0;
      if (!Number.isFinite(c.volume)) p.unsure = true;
      pairs.set(k, p);
    }
    return [...pairs.values()];
  }

  return { buildPart, tabSlotPlan, tabSlotParams, buildKnickrahmen, shapeValid, cylinderAxis, collisions, meshBody, bodyProps, measure, vertexOf, placed, compound, projectView, cylinderAxes, projectRaw, largestPlanarFace, upFor, halfSpace, camera, sectionLoops, cutAtPlane, makeMember, memberFrame, prefixCache };
}

// verdeckte Segmente entfernen, die auf sichtbaren liegen
function removeCovered(hidden, visible) {
  const segs = [];
  for (const pl of visible) for (let i = 0; i + 1 < pl.length; i++) segs.push([pl[i], pl[i + 1]]);
  const onVisible = (p, q) => {
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    for (const [a, b] of segs) {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const L2 = dx * dx + dy * dy;
      if (L2 < 1e-18) continue;
      const t = ((mx - a[0]) * dx + (my - a[1]) * dy) / L2;
      if (t < -1e-6 || t > 1 + 1e-6) continue;
      const px = a[0] + t * dx - mx, py = a[1] + t * dy - my;
      if (px * px + py * py < 1e-6) {
        // auch Richtung prüfen
        const ex = q[0] - p[0], ey = q[1] - p[1];
        const cr = Math.abs(ex * dy - ey * dx) / (Math.sqrt(L2) * (Math.hypot(ex, ey) || 1));
        if (cr < 1e-3) return true;
      }
    }
    return false;
  };
  const out = [];
  for (const pl of hidden) {
    let cur = [];
    for (let i = 0; i + 1 < pl.length; i++) {
      if (onVisible(pl[i], pl[i + 1])) {
        if (cur.length > 1) out.push(cur);
        cur = [];
      } else {
        if (!cur.length) cur.push(pl[i]);
        cur.push(pl[i + 1]);
      }
    }
    if (cur.length > 1) out.push(cur);
  }
  return out;
}

function bboxOverlap(a, b, tol = 1e-6) {
  const A = a.bounds, B = b.bounds;
  for (let k = 0; k < 3; k++) if (A[1][k] < B[0][k] - tol || B[1][k] < A[0][k] - tol) return false;
  return true;
}
function pointInBox(p, bb, tol) {
  const B = bb.bounds;
  for (let k = 0; k < 3; k++) if (p[k] < B[0][k] - tol || p[k] > B[1][k] + tol) return false;
  return true;
}
function isEmptyShape(s) {
  try {
    const n = typeof s.isNull === "function" ? s.isNull() : s.isNull;
    return !!n || s.faces.length === 0;
  } catch { return false; }
}
function rotateVec(n, axis, deg) {
  const k = v3.norm(axis);
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  // Rodrigues
  return v3.add(v3.add(v3.mul(n, c), v3.mul(v3.cross(k, n), s)), v3.mul(k, v3.dot(k, n) * (1 - c)));
}
function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const round = (x) => Math.round(x * 100) / 100;
