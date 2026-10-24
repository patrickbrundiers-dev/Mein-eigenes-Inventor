// Feature-basierter Modellaufbau auf Basis von replicad (OpenCascade).
// Wird im Web-Worker (App) und in Node (Tests) verwendet: createKernel(replicadModul)

import { evaluate, resolveParams } from "../core/expr.js";
import { solveSketch } from "../core/solver.js";
import { extractProfiles, holeCenters, sketchLines } from "../core/sketch.js";
import { planeFrame, toWorld, v3 } from "../core/geom.js";
import { sectionGeometry, sectionName, profileId, THREADS } from "../core/sections.js";
import { parseSvgPath, flattenPaths } from "../core/svgpath.js";
import { planKnickrahmen, knickInput } from "../core/knickrahmen.js";

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
    let pen = R.draw(loop.start);
    for (const s of loop.segs) pen = s.t === "line" ? pen.lineTo(s.to) : pen.threePointsArcTo(s.to, s.mid);
    return pen.close();
  }
  function regionToDrawing(region) {
    let d = loopToDrawing(region.outer);
    for (const h of region.holes) d = d.cut(loopToDrawing(h));
    return d;
  }
  const makePlane = (fr) => new R.Plane(fr.origin, fr.xDir, fr.normal);

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

  // ---------- Profil-Stab (Rohr, Hohlprofil ...) ----------
  /**
   * frame: {origin (Startpunkt Achse), z (Achsrichtung), u (Breite), v (Höhe)}
   * cuts: {start: [{p, n}], end: [{p, n}]}  n zeigt in den zu entfernenden Bereich
   */
  function makeMember(section, length, frame, cuts = { start: [], end: [] }, { envelope = false } = {}) {
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
    const e0 = extFor(cuts.start || [], false), e1 = extFor(cuts.end || [], true);
    const yDir = frame.v;
    const fr = { origin: v3.sub(frame.origin, v3.mul(frame.z, e0)), xDir: frame.u, normal: frame.z, yDir };
    const outer = envelope ? { outer: g.outer, holes: [] } : { outer: g.outer, holes: g.holes };
    let solid = regionToDrawing(outer).sketchOnPlane(makePlane(fr)).extrude(length + e0 + e1);
    const size = 4 * (length + g.width + g.height + e0 + e1) + 100;
    for (const c of [...(cuts.start || []), ...(cuts.end || [])]) solid = solid.cut(halfSpace(c.p, c.n, size));
    return { solid, geom: g };
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
    const m = shape.mesh({ tolerance: 0.01, angularTolerance: 0.1 });
    let lo = Infinity, hi = -Infinity;
    const vs = m.vertices;
    for (let i = 0; i < vs.length; i += 3) {
      const t = (vs[i] - frame.origin[0]) * frame.z[0] + (vs[i + 1] - frame.origin[1]) * frame.z[1] + (vs[i + 2] - frame.origin[2]) * frame.z[2];
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
    return hi - lo;
  }

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
    let state = { bodies: [], tools: new Map(), sketches: new Map(), status: {} };
    const feats = part.features || [];
    const keys = [];
    let acc = JSON.stringify(values);
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
      if (op === "new" || (op === "join" && !bodies.some((b) => b.kind === "solid"))) {
        bodies.push({ shape: tool.clone(), kind: "solid", name: label, fid });
        return;
      }
      if (op === "join") {
        const b = bodies.find((x) => x.kind === "solid");
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
            const frame = planeFrame(sk.plane, E(sk.offset || "0", "Ebenen-Abstand"));
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
            const { solid, geom } = makeMember(section, L, fr, cuts);
            const name = sectionName(f.section, dims);
            const meta = { section: name, profileId: profileId(f.section, dims), area: geom.area, length: memberLength(solid, fr), miterStart: m1, miterEnd: m2, frameZ: fr.z };
            state.tools.set(f.id, { op: f.op || "member", shapes: [{ shape: solid, kind: "member", meta, name: f.name || name }] });
            pushMember(state, solid, f, meta, f.name || name);
            break;
          }
          case "frame": {
            const s = getSketch(f.sketch);
            const dims = {};
            for (const [k, v] of Object.entries(f.dims || {})) dims[k] = E(v, k);
            const section = { kind: f.section, dims };
            const members = buildFrame(s, section, f, E);
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
          case "knickrahmen": {
            const kr = buildKnickrahmen(f, E);
            // ein Bauteil (eine Zuschnittzeile in Abwicklungslänge); gefaltet mit sichtbarer Gehrungslinie
            const shown = [{ shape: f.view === "abgewickelt" ? kr.flat : kr.folded, kind: "member", meta: kr.meta, name: kr.name }];
            state.tools.set(f.id, { op: "member", shapes: shown });
            for (const x of shown) pushMember(state, x.shape, f, x.meta, x.name);
            st.info = `Abwicklung ${round(kr.meta.length)} mm, ${kr.meta.knicks} Ausklinkung(en)` + (kr.meta.knicks ? `, Biegezugabe ${kr.meta.bendAllowances.map(round).join(" / ")} mm` : "") + (f.view === "abgewickelt" ? "" : " · für den Rohrlaser Ansicht »Abgewickelt« exportieren");
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
            const transforms = patternTransforms(f, E);
            if (transforms.length > 500) throw new Error("Zu viele Exemplare (max. 500)");
            let n = 0;
            for (const tr of transforms) {
              for (const s of src.shapes) {
                const copy = tr(s.shape.clone());
                if (s.kind === "member") {
                  const meta = { ...s.meta };
                  pushMember(state, copy, f, meta, s.name);
                } else applyOp(src.op, copy, f.id, f.name);
                n++;
              }
            }
            st.info = `${transforms.length + 1} Exemplare`;
            break;
          }
          case "mirror": {
            const pl = { XY: [0, 0, 1], XZ: [0, 1, 0], YZ: [1, 0, 0] }[f.plane || "YZ"];
            const off = E(f.offset || "0", "Abstand");
            const origin = v3.mul(pl, off);
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
    return { bodies: state.bodies, status: state.status, sketches: state.sketches, values };
  }

  function pushMember(state, solid, f, meta, name) {
    state.bodies.push({ shape: solid, kind: "member", name, fid: f.id, meta });
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

  function patternTransforms(f, E) {
    const out = [];
    if (f.kind === "circular") {
      const ax = f.axis === "custom" ? (f.axisDir || ["0", "0", "1"]).map((x) => E(x, "Achse")) : AXES[f.axis || "Z"];
      const c = (f.center || ["0", "0", "0"]).map((x) => E(x, "Mittelpunkt"));
      const n = Math.round(E(f.count, "Anzahl"));
      const total = E(f.angle || "360", "Winkel");
      const step = Math.abs(total - 360) < 1e-9 ? 360 / n : total / Math.max(1, n - 1);
      for (let k = 1; k < n; k++) out.push((s) => s.rotate(step * k, c, ax));
      return out;
    }
    const d1 = f.dir === "custom" ? v3.norm((f.dirVec || ["1", "0", "0"]).map((x) => E(x, "Richtung"))) : AXES[f.dir || "X"];
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

  // ---------- Rahmen aus Skizzenlinien ----------
  function buildFrame(s, section, f, E) {
    const g = sectionGeometry(section.kind, section.dims);
    const rot = E(f.rotation || "0", "Drehung");
    const N = s.frame.normal;
    const lines = sketchLines(s.sketch).filter((l) => !f.lines || f.lines === "all" || !f.lines.length || f.lines.includes(l.id));
    if (!lines.length) throw new Error("Skizze enthält keine Linien");
    const W = (p) => toWorld(s.frame, p[0], p[1]);
    const L = lines.map((l, idx) => {
      const a = W(l.a), b = W(l.b);
      const z = v3.norm(v3.sub(b, a));
      // u = N × z (in der Ebene), v = N (Profilhöhe senkrecht zur Skizzenebene)
      const fr = memberFrame(a, z, rot, N);
      let width = Math.abs(Math.cos((rot * Math.PI) / 180)) * g.width + Math.abs(Math.sin((rot * Math.PI) / 180)) * g.height;
      // Ausrichtung: Profil-Außenkante auf Linie (Versatz in u)
      let shift = 0;
      if (f.align === "links") shift = width / 2;
      if (f.align === "rechts") shift = -width / 2;
      if (shift) fr.origin = v3.add(fr.origin, v3.mul(fr.u, shift));
      return { l, idx, a, b, z, fr, len: v3.dist(a, b), width, shift, cuts: { start: [], end: [] }, envCuts: [] };
    });
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
      let n = o.fr.u;
      if (v3.dot(n, dInto) > 0) n = v3.mul(n, -1); // zeigt von m weg
      if (roundSection) {
        m.cuts[end].push({ p: o.fr.origin, n });
        m.envCuts.push(o);
      } else {
        m.cuts[end].push({ p: v3.sub(o.fr.origin, v3.mul(n, o.width / 2)), n });
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
        let o = butt.m.fr.u;
        const sgn = v3.dot(o, dRun) > 0 ? -1 : 1;
        o = v3.mul(o, sgn);
        const half = butt.m.width / 2;
        // durchlaufendes Profil endet bündig mit der Außenseite des anderen
        run.m.cuts[run.end].push({ p: v3.add(P, v3.mul(o, half + sgn * butt.m.shift)), n: o });
        buttAgainst(butt.m, butt.end, butt === A ? dA : dB, run.m);
      }
    }
    const members = [];
    const built = new Map();
    const order = [...L].sort((a, b) => a.envCuts.length - b.envCuts.length);
    for (const m of order) {
      let { solid } = makeMember(section, m.len, m.fr, m.cuts);
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
        coped: m.envCuts.length > 0,
        butt: !!m.butt,
        frameZ: m.fr.z,
        line: m.l.id,
      };
      built.set(m, { solid, meta, name: `${f.name || "Rahmen"} ${m.idx + 1}` });
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
  function buildKnickrahmen(f, E) {
    const input = knickInput(f, E);
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
      frameZ: z0,
    };
    return { folded, segments, flat, meta, name, plan };
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

  function cutAngle(list, z) {
    if (!list.length) return 0;
    const c = Math.abs(v3.dot(v3.norm(list[0].n), z));
    return round((Math.acos(Math.min(1, c)) * 180) / Math.PI);
  }

  // ---------- Ausgabe für die Anzeige ----------
  function meshBody(shape, quality = "normal") {
    const tol = quality === "fein" ? 0.02 : quality === "grob" ? 0.3 : 0.08;
    const ang = quality === "fein" ? 0.1 : quality === "grob" ? 0.5 : 0.25;
    const m = shape.mesh({ tolerance: tol, angularTolerance: ang });
    const faceInfo = new Map();
    for (const fc of shape.faces) {
      try {
        const info = { type: fc.geomType };
        if (info.type === "PLANE") { info.normal = tuple(fc.normalAt()); info.point = tuple(fc.center); }
        else if (info.type === "CYLINDER") { info.point = tuple(fc.center); }
        faceInfo.set(hashOf(fc), info);
      } catch { /* ignore */ }
    }
    const faces = m.faceGroups.map((g) => ({ start: g.start, count: g.count, ...(faceInfo.get(g.faceId) || {}) }));
    const em = shape.meshEdges({ tolerance: tol, angularTolerance: ang });
    const edgeInfo = new Map();
    for (const e of shape.edges) {
      try { edgeInfo.set(hashOf(e), { mid: edgeMid(e), type: e.geomType }); } catch { /* ignore */ }
    }
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
    let volume = NaN;
    try { volume = R.measureVolume(shape); } catch { /* ignore */ }
    const bb = shape.boundingBox;
    return { volume, bbox: bb.bounds };
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

  return { buildPart, buildKnickrahmen, shapeValid, collisions, meshBody, bodyProps, placed, compound, projectView, projectRaw, largestPlanarFace, upFor, halfSpace, camera, sectionLoops, cutAtPlane, makeMember, memberFrame, prefixCache };
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
