// Feature-basierter Modellaufbau auf Basis von replicad (OpenCascade).
// Wird im Web-Worker (App) und in Node (Tests) verwendet: createKernel(replicadModul)

import { evaluate, resolveParams } from "../core/expr.js";
import { solveSketch } from "../core/solver.js";
import { extractProfiles, holeCenters, sketchLines } from "../core/sketch.js";
import { planeFrame, toWorld, v3 } from "../core/geom.js";
import { sectionGeometry, sectionName, THREADS } from "../core/sections.js";
import { parseSvgPath, flattenPaths } from "../core/svgpath.js";

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

  async function buildPart(part, { useCache = true } = {}) {
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

    const getSketch = (id, label = "Skizze") => {
      const s = state.sketches.get(id);
      if (!s) throw new Error(`${label} fehlt oder ist fehlerhaft`);
      return s;
    };

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
              case "twoSided": { const d2 = E(f.distance2 || "0", "Abstand 2"); start = -d2; len = d + d2; break; }
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
            const tiltAxis = f.miterAxis === "u" ? fr.v : fr.u; // um welche Querachse gekippt wird
            const rotN = (n, ang) => rotateVec(n, tiltAxis, ang);
            if (Math.abs(m1) > 1e-9) cuts.start.push({ p: fr.origin, n: rotN(v3.mul(fr.z, -1), m1) });
            const endP = v3.add(fr.origin, v3.mul(fr.z, L));
            if (Math.abs(m2) > 1e-9) cuts.end.push({ p: endP, n: rotN(fr.z, f.miterSame ? m2 : -m2) });
            const { solid, geom } = makeMember(section, L, fr, cuts);
            const name = sectionName(f.section, dims);
            const meta = { section: name, area: geom.area, length: memberLength(solid, fr), miterStart: m1, miterEnd: m2, frameZ: fr.z };
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
            if (!src) throw new Error("Bezugs-Feature fehlt");
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
    // Profil m stößt mit Ende "end" gegen Profil o: an Achse von o kappen + Hüllkörper von o abziehen (Ausklinkung)
    const buttAgainst = (m, end, dInto, o) => {
      let n = o.fr.u;
      if (v3.dot(n, dInto) > 0) n = v3.mul(n, -1);
      m.cuts[end].push({ p: o.fr.origin, n });
      m.envCuts.push(o);
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
        area: g.area,
        length: memberLength(solid, m.fr),
        miterStart: cutAngle(m.cuts.start, m.fr.z),
        miterEnd: cutAngle(m.cuts.end, m.fr.z),
        coped: m.envCuts.length > 0,
        frameZ: m.fr.z,
        line: m.l.id,
      };
      built.set(m, { solid, meta, name: `${f.name || "Rahmen"} ${m.idx + 1}` });
    }
    for (const m of L) members.push(built.get(m));
    members.warnings = [...new Set(warnings)];
    return members;
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
    const d = v3.norm(view.dir);
    const up = v3.norm(view.up);
    const right = v3.norm(v3.cross(d, up));
    const cam = new R.ProjectionCamera([0, 0, 0], v3.mul(d, -1), right);
    const { visible, hidden } = R.drawProjection(shape, cam);
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

  return { buildPart, meshBody, bodyProps, placed, compound, projectView, makeMember, memberFrame, prefixCache };
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
