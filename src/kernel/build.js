// Feature-basierter Modellaufbau auf Basis von replicad (OpenCascade).
// Wird im Web-Worker (App) und in Node (Tests) verwendet: createKernel(replicadModul)

import { evaluate, resolveParams } from "../core/expr.js";
import { solveSketch } from "../core/solver.js";
import { extractProfiles, holeCenters, sketchLines } from "../core/sketch.js";
import { planeFrame, toWorld, v3 } from "../core/geom.js";
import { resolveDatums, resolvePlane, mirrorPlane, patternAxis, datumSummary } from "../core/datums.js";
import { pathChain, reverseChain, pathLength as chainLength, pathPatternStations, coilParams, loopCentroid, validateLoft } from "../core/formen.js";
import { sectionGeometry, sectionName, profileId, THREADS, loopLength } from "../core/sections.js";
import { parseSvgPath, flattenPaths } from "../core/svgpath.js";
import { planKnickrahmen, knickInput } from "../core/knickrahmen.js";
import { planTubeCuts, atEnd as openAtEnd } from "../core/tubecuts.js";
import { endCutEdge, endCutSupported, featureCutSettings } from "../core/endcut.js";
import { resolvePathPoints, pathSegments, pathLength, upFor, UP_AXES } from "../core/profilzug.js";
import { planBends, BIEGEROHR_SECTIONS } from "../core/biegerohr.js";
import { checkRegel, REGEL_KINDS } from "../core/regelkoerper.js";
import { planKantteil, kantteilOutline, splitList } from "../core/blech.js";
import { bendRule, ruleSummary } from "../core/bendtable.js";
import { NORM_THREADS, NORM_KINDS, checkNorm, normDesignation, normDensity, threadLength4014, turnbuckleDims, boltSizeForHole, boltSet } from "../core/normteile.js";
import { platePlan, ribPlan, RIB_SIDES } from "../core/anschluss.js";
import { WELD_KINDS } from "../core/weld.js";
import { GENERATORS, resolveGenParams } from "../core/generator.js";
import { planBodies, localPlan } from "../core/genteil.js";
import { FILL_DENSITY } from "../core/mass.js";

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
  function tubeCutTool(it, x, fr, geom) {
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
    // y der Ebene = normal × z: auf der Oberseite nach vorne (−u) – Versatz q wie im Rohr-Editor
    return d.translate(0, it.q).sketchOnPlane(new R.Plane(origin, fr.z, normal)).extrude(depth);
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
    };
  }

  /** Gültigkeit eines Körpers nach OpenCascade (BRepCheck): Topologie und Geometrie konsistent */
  function shapeValid(shape) {
    const an = new (R.getOC().BRepCheck_Analyzer)(shape.wrapped, true, false);
    try { return an.IsValid(); } finally { an.delete(); }
  }
  const INVALID_BODY = "Körper ungültig (Geometrie-Prüfung) – Export und weitere Features können fehlschlagen";

  async function buildPart(part, { useCache = true, validate = true } = {}) {
    const { values, errors: paramErrors } = resolveParams(part.params || []);
    const scope = values;
    const E = (expr, label) => {
      try { return evaluate(expr, scope); } catch (e) { throw new Error(`${label}: ${e.message}`); }
    };
    let state = { bodies: [], tools: new Map(), sketches: new Map(), status: {}, welds: [] };
    const feats = part.features || [];
    // Arbeitselemente: reine Lagen, unabhängig vom Zwischenspeicher
    const datums = resolveDatums(feats, (x) => evaluate(x, scope));
    // 2D/3D und Winkelkorrektur je Profil bzw. Rahmen (gilt für alle Schnitte dieses Features)
    const cutCfg = (f) => {
      const c = featureCutSettings(f);
      const sw = E(c.swivel, "Winkelkorrektur");
      if (!(sw >= 0 && sw <= 89)) throw new Error("Winkelkorrektur 0 bis 89°");
      return { mode: c.mode, swivel: sw };
    };
    const keys = [];
    let acc = JSON.stringify(values) + (part.material || ""); // Werkstoff wählt die Biegetabelle
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
            const prof = extractProfiles(sk);
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
            const tool = extrudeRegions(regions, s.frame, start, len);
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
            let tool = null;
            for (const c of centers) {
              const p = toWorld(s.frame, c[0], c[1]);
              const axisDirs = f.direction === "both" ? [1, -1] : [dirSign];
              for (const sg of axisDirs) {
                const a = v3.mul(s.frame.normal, sg);
                const t = holeTool(p, a, dia / 2, depth, f, E, through);
                tool = tool ? tool.fuse(t) : t;
              }
            }
            state.tools.set(f.id, { op: "cut", shapes: [{ shape: tool, kind: "tool" }] });
            applyOp("cut", tool, f.id, f.name);
            st.info = `${centers.length} Bohrung(en) Ø${round(dia)}${f.thread ? " (" + f.thread + ")" : ""}`;
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
            const tc = planTubeCuts(f.cuts, { kind: f.section, W: geom.width, H: geom.height, t: dims.t, r: dims.r ?? 0, L, swivel }, E);
            if (tc.issues.length) st.warning = [st.warning, ...tc.issues.map((x) => x.message)].filter(Boolean).join("; ");
            for (const it of tc.items) for (const x of it.xs) solid = solid.cut(tubeCutTool(it, x, fr, geom));
            if (tc.items.length) st.info = `${tc.pierces} Kontur(en), Schneidweg Innenkonturen ${round(tc.cutLength)} mm`;
            const name = sectionName(f.section, dims);
            const meta = { section: name, profileId: profileId(f.section, dims), area: geom.area, length: memberLength(solid, fr), miterStart: m1, miterEnd: m2, frameZ: fr.z };
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
            if (!gen) throw new Error("Unbekannter Generator");
            let plan = gen.plan(resolveGenParams(f.gen, f.params, E));
            if (f.type === "genteil") {
              const body = planBodies(plan).find((b) => b.key === f.key);
              if (!body) throw new Error(`Teil »${f.body || f.key}« gibt es im Generator nicht mehr`);
              plan = { ...localPlan(plan, body), info: body.name };
            }
            const list = [];
            const cut = cutCfg(f);
            const add = (solid, meta, name) => { pushMember(state, solid, f, meta, name); list.push({ shape: solid, kind: "member", meta, name }); };
            const metaOf = (sec, solid, fr, extra = {}) => ({ section: sectionName(sec.kind, sec.dims), profileId: profileId(sec.kind, sec.dims), area: sec.geom.area, length: memberLength(solid, fr), miterStart: 0, miterEnd: 0, frameZ: fr.z, axis: memberAxis(solid, fr, sec.geom), generator: f.gen, ...extra });
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
              const size = Math.max(ch.section.geom?.width || 0, ch.section.geom?.height || 0);
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
              const { solid } = memberWithEnds({ kind: m.section.kind, dims: m.section.dims }, L, fr, cuts, cut);
              const ds = drillsOf(m.name, m.a, m.b, Math.max(m.section.geom.width, m.section.geom.height));
              add(drill(solid, ds), metaOf(m.section, solid, fr, { miterStart: cutAngle(cuts.start, fr.z), miterEnd: cutAngle(cuts.end, fr.z), ...(ds.length ? { drills: ds.length, drillD: ds[0].d ?? `${ds[0].w}x${ds[0].h}` } : {}) }), m.name);
            }
            for (const pl of plan.plates) {
              let d;
              if (pl.poly) { d = R.draw(pl.poly[0]); for (const q of pl.poly.slice(1)) d = d.lineTo(q); d = d.close(); }
              else d = R.drawRoundedRectangle(pl.W, pl.H, pl.r || 0);
              for (const [x, y, hd] of pl.holes || []) d = d.cut(R.drawCircle((hd || pl.d) / 2).translate(x, y)); // [x, y, Ø?] – eigener Ø je Loch (Gegenbohrung)
              for (const [x, y, len] of pl.slots || []) d = d.cut(R.drawRoundedRectangle(len, pl.d, pl.d / 2 - 0.01).translate(x, y)); // Langloch entlang xDir
              for (const [x, y, w, hh] of pl.rects || []) d = d.cut(R.drawRectangle(w, hh).translate(x, y)); // Rechteckausschnitt (Steckschlitz)
              const solid = d.sketchOnPlane(new R.Plane(pl.center, pl.xDir, pl.normal)).extrude(pl.t);
              const meta = { plate: { W: pl.W, H: pl.H, t: pl.t, holes: (pl.holes || []).length, ...(pl.slots?.length ? { slots: pl.slots.length } : {}), d: pl.d }, glass: !!pl.glass, tread: pl.tread, generator: f.gen };
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
            }
            if (!p3) throw new Error("Gewählte Kanten nicht mehr gefunden");
            state.welds.push({ fid: f.id, kind: f.kind || "kehl", a, side: f.side || "pfeil", around: !!f.around, field: !!f.field, length, p3, name: f.name });
            st.info = `${WELD_KINDS[f.kind || "kehl"].dim}${round(a)}, ${round(length)} mm an ${refs.length - miss} Kante(n)`;
            if (miss) st.warning = `${miss} Kante(n) nicht mehr gefunden`;
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
            const list = (x, label) => splitList(x).map((v, i) => E(v, `${label} ${i + 1}`));
            const t = E(f.t ?? "2", "Blechdicke"), L = E(f.length ?? "1000", "Länge");
            if (!(L > 0)) throw new Error("Länge muss > 0 sein");
            const ri = E(f.ri ?? "0", "Innenradius"), K0 = E(f.k ?? "0.33", "K-Faktor");
            const br = bendRule({ rule: f.rule || "k", material: part.material || "S235", t, ri, k: K0 });
            const plan = planKantteil({ legs: list(f.legs, "Schenkel"), angles: list(f.angles, "Winkel"), t, ri, k: K0, kOf: br.kOf, ref: f.ref || "aussen" });
            const pos = (f.pos || ["0", "0", "0"]).map((x, k) => E(x, "Lage " + "XYZ"[k]));
            let solid;
            if (f.view === "abgewickelt") solid = R.makeBaseBox(plan.flat, L, t).translate([plan.flat / 2, L / 2, -t / 2]);
            else {
              const o = kantteilOutline(plan, t);
              let d = R.draw(o.start), cur = o.start;
              for (const sg of o.segs) {
                if (Math.hypot(sg.to[0] - cur[0], sg.to[1] - cur[1]) < 1e-9) continue;
                d = sg.t === "arc" ? d.threePointsArcTo(sg.to, sg.mid) : d.lineTo(sg.to);
                cur = sg.to;
              }
              solid = d.close().sketchOnPlane(new R.Plane([0, L, 0], [1, 0, 0], [0, -1, 0])).extrude(L);
            }
            solid = solid.translate(pos);
            const name = f.name || `Kantteil ${round(t)} mm, Abw. ${round(plan.flat)} × ${round(L)}`;
            const meta = { sheet: { t, flat: plan.flat, length: L, bends: plan.bends.map((b, i) => ({ angle: b.angle, r: b.rm - t / 2, k: br.used[i]?.k })), bendLines: plan.bendLines, rule: ruleSummary(br) } };
            state.tools.set(f.id, { op: "new", shapes: [{ shape: solid, kind: "solid", meta, name }], sheet: { plan, L, t } });
            state.bodies.push({ shape: solid, kind: "solid", name, fid: f.id, meta });
            st.info = `Abwicklung ${round(plan.flat)} × ${round(L)} mm, ${plan.bends.length} Biegung(en)` + (plan.bends.length ? `, Biegezugabe ${plan.flatParts.filter((_, i) => i % 2).map(round).join(" / ")} mm` : "") + (plan.bends.length && (f.rule || "k") !== "k" ? ` · ${ruleSummary(br)}` : "") + (f.view === "abgewickelt" ? "" : " · Abwicklung als DXF in den Eigenschaften");
            const warn = [...plan.issues.map((x) => x.message), ...new Set(br.warnings)];
            if (warn.length) st.warning = warn.join("; ");
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
            const p = getSketch(f.path, "Pfad-Skizze");
            const chain = pathChain(p.sketch);
            const spine = chainWire(chain, p.frame);
            const cfg = { frenet: f.orient !== "fest", transitionMode: "right" };
            let tool = null;
            for (const reg of s.prof.regions) {
              let solid = R.genericSweep(loopWire(reg.outer, s.frame), spine.clone(), cfg);
              for (const hl of reg.holes) solid = solid.cut(R.genericSweep(loopWire(hl, s.frame), spine.clone(), cfg));
              tool = tool ? tool.fuse(solid) : solid;
            }
            state.tools.set(f.id, { op: f.op || "join", shapes: [{ shape: tool, kind: "tool" }] });
            applyOp(f.op || "join", tool, f.id, f.name);
            st.info = `Pfad ${String(Math.round(chainLength(chain) * 10) / 10).replace(".", ",")} mm${chain.closed ? ", geschlossen" : ""}`;
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
          case "arbeitsebene": case "arbeitsachse": case "arbeitspunkt": {
            if (datums.errors[f.id]) throw new Error(datums.errors[f.id]);
            st.info = datumSummary(f, datums.map.get(f.id));
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
    return { bodies: state.bodies, status: state.status, sketches: state.sketches, values, welds: state.welds || [], datums: [...datums.map].map(([id, g]) => ({ id, ...g })) };
  }

  /** Normteil als eigener Körper (Stückliste mit Normbezeichnung); n = { kind, size, length, grade, galv, name? } */
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
  /** Körper mit Achse +z an Punkt pos auf Richtung dir drehen */
  function orientZ(shape, dir, pos) {
    const n = v3.norm(dir), z = [0, 0, 1];
    const axis = v3.cross(z, n), s = v3.len(axis), c = v3.dot(z, n);
    if (s > 1e-12) shape = shape.rotate((Math.atan2(s, c) * 180) / Math.PI, [0, 0, 0], axis);
    else if (c < 0) shape = shape.rotate(180, [0, 0, 0], [1, 0, 0]);
    return shape.translate(pos);
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
        return it;
      }
      const it = { kind, type: s.geomType, length: R.measureLength(s), start: tuple(s.startPoint), end: tuple(s.endPoint) };
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
      }
      return it;
    });
    const out = { items };
    if (entries.length === 2) {
      out.distance = R.measureDistanceBetween(entries[0].shape, entries[1].shape);
      const [a, b] = items;
      if (a.point && b.point) out.delta = b.point.map((v, k) => v - a.point[k]);
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

  return { buildPart, buildKnickrahmen, shapeValid, cylinderAxis, collisions, meshBody, bodyProps, measure, vertexOf, placed, compound, projectView, projectRaw, largestPlanarFace, upFor, halfSpace, camera, sectionLoops, cutAtPlane, makeMember, memberFrame, prefixCache };
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
