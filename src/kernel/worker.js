// Web-Worker: OpenCascade/replicad laden und Modell-Aufträge abarbeiten
import * as R from "replicad";
import ocInit from "replicad-opencascadejs";
import { createKernel, hashString, errorText } from "./build.js";
import { MATERIALS } from "../core/sections.js";

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
  return part.color || MATERIALS[part.material]?.color || "#8d99a6";
}

async function placedShapes(items) {
  const out = [];
  for (const it of items) {
    const res = await getBuilt(it.part);
    for (const b of res.bodies) out.push({ shape: K.placed(b.shape, it.pos || [0, 0, 0], it.rot || [0, 0, 0]), name: it.name || b.name, color: it.color || partColor(it.part), body: b });
  }
  return out;
}

const handlers = {
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
    return { status: res.status, values: res.values, bodies, sketches, ms: performance.now() - t0 };
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
    res.bodies.forEach((b, i) => {
      if (onlyMembers && b.kind !== "member") return;
      const blob = R.exportSTEP([{ shape: b.shape.clone(), name: b.name, color: partColor(part) }]);
      out.push({ index: i, name: b.name, blob });
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
      const key = key0 + hashString(JSON.stringify([v.dir, v.up, v.hidden]));
      let r = projCache.get(key);
      if (!r) {
        if (!shape) {
          const shapes = await placedShapes(items);
          if (!shapes.length) throw new Error("Keine Geometrie für die Ansicht");
          shape = shapes.length === 1 ? shapes[0].shape : R.makeCompound(shapes.map((x) => x.shape));
        }
        try {
          r = K.projectView(shape, v);
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
