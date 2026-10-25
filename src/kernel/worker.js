// Web-Worker: OpenCascade/replicad laden und Modell-Aufträge abarbeiten
import * as R from "replicad";
import ocInit from "replicad-opencascadejs";
import { createKernel, hashString, errorText } from "./build.js";
import { materialOf, setUserMaterials, setProjectMaterials } from "../core/materials.js";
import { setUserBendTables, setProjectBendTables } from "../core/bendtable.js";
import { svgPathSegments } from "../core/svgpath.js";
import { segmentsToDxf } from "../core/dxf.js";

let K = null;
const ready = (async () => {
  const wasmUrl = new URL("replicad_single.wasm", self.location.href).href;
  const OC = await ocInit({ locateFile: () => wasmUrl });
  R.setOC(OC);
  K = createKernel(R);
})();

// Cache gebauter Bauteile: Schlüssel = Hash des Bauteil-JSON
const built = new Map();
const meshCache = new Map();
const projCache = new Map();
let bendKey = "[[],[]]";
function remember(map, key, val, max) {
  map.delete(key);
  map.set(key, val);
  while (map.size > max) map.delete(map.keys().next().value);
}

async function getBuilt(part) {
  const key = hashString(JSON.stringify(part));
  let res = built.get(key);
  if (!res) {
    res = await K.buildPart(part);
    res.key = key;
    remember(built, key, res, 24);
  }
  return res;
}

function partColor(part) {
  return part.color || materialOf(part.material).color;
}

/** Name eines Körpers im STEP: Bauteil (+ Profil-ID und laufende Nummer bei Profilen) */
function bodyName(base, b, index, count) {
  if (b.kind === "member" && b.meta?.profileId) return `${base} ${String(index + 1).padStart(2, "0")} ${b.meta.profileId}`;
  if (count > 1) return `${base} ${b.name || "Körper " + (index + 1)}`;
  return base;
}

async function placedShapes(items) {
  const out = [];
  for (const it of items) {
    const res = await getBuilt(it.part);
    const base = it.name || it.part.number || it.part.name || "Bauteil";
    res.bodies.forEach((b, i) => {
      out.push({ shape: K.placed(b.shape, it.pos || [0, 0, 0], it.rot || [0, 0, 0]), name: bodyName(base, b, i, res.bodies.length), color: it.color || partColor(it.part), body: b });
    });
  }
  return out;
}

const handlers = {
  // eigene Werkstoffe (Farbe im STEP) – die Oberfläche schickt sie bei jeder Änderung
  materials({ user, project }) { setUserMaterials(user); setProjectMaterials(project); return true; },
  // Biegetabellen (eigene und Projektkopien); bei Änderung alles neu rechnen, Abwicklungen hängen daran
  async bendTables({ user, project }) {
    const key = JSON.stringify([user, project]);
    if (key === bendKey) return false;
    bendKey = key;
    setUserBendTables(user); setProjectBendTables(project);
    await ready;
    built.clear(); meshCache.clear(); projCache.clear(); K.prefixCache.clear();
    return true;
  },
  async build({ part, quality = "normal" }) {
    const t0 = performance.now();
    const res = await getBuilt(part);
    const mkey = res.key + quality;
    let bodies = meshCache.get(mkey);
    if (!bodies) {
      bodies = res.bodies.map((b, i) => {
        let mesh = null, props = null, error = null;
        try { mesh = K.meshBody(b.shape, quality); props = K.bodyProps(b.shape); } catch (e) { error = errorText(e, R); }
        return { index: i, name: b.name, kind: b.kind, fid: b.fid, meta: b.meta ? { ...b.meta } : null, mesh, props, error };
      });
      remember(meshCache, mkey, bodies, 24);
    }
    const sketches = {};
    for (const [id, s] of res.sketches) sketches[id] = { dof: s.dof, errors: s.prof.errors, regions: s.prof.regions.length, openPoints: s.prof.openPoints, frame: s.frame };
    return { status: res.status, values: res.values, welds: res.welds, bodies, sketches, ms: performance.now() - t0 };
  },

  /** Messen: items = [{part, pos, rot, body, kind: "face"|"edge", idx}] (Lage aus meshBody) */
  async measure({ items }) {
    const entries = [];
    for (const it of items) {
      const res = await getBuilt(it.part);
      const body = res.bodies[it.body];
      if (!body) throw new Error("Körper nicht gefunden – Modell neu berechnen");
      const list = it.kind === "face" ? body.shape.faces : body.shape.edges;
      const sub = list[it.idx];
      if (!sub) throw new Error("Element nicht gefunden – Modell neu berechnen");
      const shape = K.placed(sub, it.pos || [0, 0, 0], it.rot || [0, 0, 0]);
      // Ecke: Anfang oder Ende der Kante (it.end), als Punkt-Form für den Abstand
      entries.push(it.kind === "vertex" ? { ...K.vertexOf(shape, it.end), kind: "vertex" } : { shape, kind: it.kind });
    }
    return K.measure(entries);
  },

  async exportStep({ items, merge = false }) {
    const shapes = await placedShapes(items);
    if (!shapes.length) throw new Error("Nichts zu exportieren");
    let blob;
    if (merge || shapes.length === 1) {
      const s = shapes.length === 1 ? shapes[0].shape : R.makeCompound(shapes.map((x) => x.shape));
      blob = R.exportSTEP([{ shape: s, name: shapes[0].name, color: shapes[0].color }]);
    } else blob = R.exportSTEP(shapes.map((x) => ({ shape: x.shape, name: x.name, color: x.color })));
    return await blob.text();
  },

  async exportStl({ items, quality = "fein" }) {
    const shapes = await placedShapes(items);
    if (!shapes.length) throw new Error("Nichts zu exportieren");
    const s = shapes.length === 1 ? shapes[0].shape : R.makeCompound(shapes.map((x) => x.shape));
    const tol = quality === "fein" ? 0.02 : 0.1;
    const blob = s.blobSTL({ binary: true, tolerance: tol, angularTolerance: 0.1 });
    return await blob.arrayBuffer();
  },

  /** Jeder Körper/Stab einzeln als STEP (z. B. für Rohrlaser-CAM) */
  async bodySteps({ part, onlyMembers = false }) {
    const res = await getBuilt(part);
    const out = [];
    const base = part.number || part.name || "Bauteil";
    res.bodies.forEach((b, i) => {
      if (onlyMembers && b.kind !== "member") return;
      const name = bodyName(base, b, i, res.bodies.length);
      const blob = R.exportSTEP([{ shape: b.shape.clone(), name, color: partColor(part) }]);
      out.push({ index: i, name, blob });
    });
    const texts = [];
    for (const o of out) texts.push({ index: o.index, name: o.name, text: await o.blob.text() });
    return texts;
  },

  async project({ items, views }) {
    const key0 = hashString(JSON.stringify(items));
    const result = {};
    let shape = null;
    for (const v of views) {
      const key = key0 + hashString(JSON.stringify([v.dir, v.up, v.hidden, v.cut || null]));
      let r = projCache.get(key);
      if (!r) {
        if (!shape) {
          const shapes = await placedShapes(items);
          if (!shapes.length) throw new Error("Keine Geometrie für die Ansicht");
          shape = shapes.length === 1 ? shapes[0].shape : R.makeCompound(shapes.map((x) => x.shape));
        }
        try {
          if (v.cut) {
            const cutShape = K.cutAtPlane(shape, v.cut.n, v.cut.c);
            r = K.projectView(cutShape, v);
            r.sectionLoops = K.sectionLoops(cutShape, v.cut.n, v.cut.c, v);
          } else r = K.projectView(shape, v);
          r.bbox = bbox2(r.visible.concat(r.hidden));
        } catch (e) {
          r = { error: errorText(e, R), visible: [], hidden: [], arcs: [], hiddenArcs: [], bbox: null };
        }
        remember(projCache, key, r, 60);
      }
      result[v.key] = r;
    }
    return result;
  },

  /**
   * Platte/Blechteil als DXF 1:1: Blick senkrecht auf die größte ebene Fläche (oder die gewählte Normale),
   * nur sichtbare Kanten, Linien/Bögen/Kreise exakt.
   */
  async plateDxf({ part, body = null, normal = null }) {
    const res = await getBuilt(part);
    if (!res.bodies.length) throw new Error("Bauteil hat keinen Körper");
    let idx = body;
    if (idx === null || idx === undefined || !res.bodies[idx]) {
      let best = -1;
      res.bodies.forEach((b, i) => { const v = R.measureVolume(b.shape); if (v > best) { best = v; idx = i; } });
    }
    const shape = res.bodies[idx].shape;
    let n = normal;
    let thickness = null;
    if (!n) {
      const f = K.largestPlanarFace(shape);
      if (!f) throw new Error("Keine ebene Fläche gefunden");
      n = f.normal;
    }
    const view = { dir: n.map((x) => -x), up: K.upFor(n) };
    const segs = [];
    for (const d of K.projectRaw(shape, view)) segs.push(...svgPathSegments(d, { flipY: true }));
    // Dicke = Ausdehnung entlang der Normalen
    const m = shape.mesh({ tolerance: 0.05, angularTolerance: 0.3 });
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < m.vertices.length; i += 3) { const t = m.vertices[i] * n[0] + m.vertices[i + 1] * n[1] + m.vertices[i + 2] * n[2]; lo = Math.min(lo, t); hi = Math.max(hi, t); }
    thickness = hi - lo;
    const name = res.bodies[idx].name || part.name;
    const r = segmentsToDxf(segs, { layer: "KONTUR" });
    return { ...r, thickness, body: idx, name };
  },

  /** Kollisionsprüfung einer Baugruppe: items mit key (Komponenten-ID) */
  async collisions({ items, tol = 1 }) {
    const list = [];
    for (const it of items) for (const s of await placedShapes([it])) list.push({ key: it.key, shape: s.shape });
    return K.collisions(list, { tol });
  },
  async ping() { return "ok"; },
};

function bbox2(polys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const pl of polys) for (const p of pl) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

self.onmessage = async (ev) => {
  const { id, cmd, args } = ev.data;
  try {
    await ready;
    const h = handlers[cmd];
    if (!h) throw new Error("Unbekannter Auftrag " + cmd);
    const result = await h(args || {});
    self.postMessage({ id, ok: true, result });
  } catch (e) {
    const fatal = e instanceof WebAssembly.RuntimeError;
    self.postMessage({ id, ok: false, error: errorText(e, R), fatal });
  }
};
