// Web-Worker: OpenCascade/replicad laden und Modell-Aufträge abarbeiten
import * as R from "replicad";
import ocInit from "replicad-opencascadejs";
import { createKernel, hashString, errorText } from "./build.js";
import { materialOf, setUserMaterials, setProjectMaterials } from "../core/materials.js";
import { setUserBendTables, setProjectBendTables } from "../core/bendtable.js";
import { svgPathSegments } from "../core/svgpath.js";
import { segmentsToDxf } from "../core/dxf.js";
import { writeIges } from "../core/iges.js";
import { igesFaces } from "./igesocc.js";
import { simplifyAction } from "../core/vereinfachen.js";
import { memberHoles, plateNc, plateInfo } from "./dstvocc.js";
import { v3, placementMatrix, matInvertRigid, matApply, matApplyDir } from "../core/geom.js";

let K = null, OCM = null;
const ready = (async () => {
  const wasmUrl = new URL("replicad_single.wasm", self.location.href).href;
  const OC = await ocInit({ locateFile: () => wasmUrl });
  R.setOC(OC);
  OCM = OC;
  K = createKernel(R);
})();

// Cache gebauter Bauteile: Schlüssel = Hash des Bauteil-JSON
const built = new Map();
const meshCache = new Map();
const projCache = new Map();
let bendKey = "[[],[]]";
/**
 * Eintrag merken (zuletzt benutzt hinten). Je Bauteil höchstens `perPart` Stände (aktueller + Rückgängig-Stände),
 * insgesamt höchstens `max` – so verdrängt eine große Baugruppe nicht ihre eigenen Teile, und viele Änderungen an
 * einem Bauteil füllen den Speicher nicht mit alten Ständen.
 */
function remember(map, key, val, max, partId = null, perPart = 3) {
  map.delete(key);
  if (partId !== null) val.partId = partId;
  map.set(key, val);
  if (partId !== null) {
    const same = [...map.keys()].filter((k) => map.get(k).partId === partId);
    for (const k of same.slice(0, Math.max(0, same.length - perPart))) map.delete(k);
  }
  while (map.size > max) map.delete(map.keys().next().value);
}

async function getBuilt(part) {
  const key = hashString(JSON.stringify(part));
  let res = built.get(key);
  if (!res) {
    res = await K.buildPart(part);
    res.key = key;
  }
  remember(built, key, res, 64, part.id);
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

/** Vereinfachen (W10): Körper behalten, weglassen oder als Hüllquader; zählt in count */
function simplified(b, opt, count) {
  if (!opt) return b.shape;
  let bb = null;
  try { bb = b.shape.boundingBox.bounds; } catch { bb = null; }
  const act = simplifyAction(b, bb, opt);
  if (act === "drop") { count.drop++; return null; }
  if (act === "box" && bb) { count.box++; return R.makeBox(bb[0], bb[1]); }
  return b.shape;
}

async function placedShapes(items, simplify = null, count = { drop: 0, box: 0 }) {
  const out = [];
  for (const it of items) {
    const res = await getBuilt(it.part);
    const base = it.name || it.part.number || it.part.name || "Bauteil";
    res.bodies.forEach((b, i) => {
      const shape = simplified(b, simplify, count);
      if (!shape) return;
      out.push({ shape: K.placed(shape, it.pos || [0, 0, 0], it.rot || [0, 0, 0]), name: bodyName(base, b, i, res.bodies.length), color: it.color || partColor(it.part), body: b });
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
    let bodies = meshCache.get(mkey)?.bodies;
    if (!bodies) {
      bodies = res.bodies.map((b, i) => {
        let mesh = null, props = null, error = null;
        try { mesh = K.meshBody(b.shape, quality); props = K.bodyProps(b.shape); } catch (e) { error = errorText(e, R); }
        return { index: i, name: b.name, kind: b.kind, fid: b.fid, meta: b.meta ? { ...b.meta } : null, mesh, props, error };
      });
      remember(meshCache, mkey, { bodies }, 64, part.id);
    }
    const sketches = {};
    for (const [id, s] of res.sketches) sketches[id] = { dof: s.dof, errors: s.prof.errors, regions: s.prof.regions.length, openPoints: s.prof.openPoints, frame: s.frame };
    return { status: res.status, values: res.values, welds: res.welds, datums: res.datums, paths3d: res.paths3d, rules: res.rules, ruleOff: res.ruleOff, bodies, sketches, ms: performance.now() - t0 };
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

  async exportStep({ items, merge = false, simplify = null }) {
    const shapes = await placedShapes(items, simplify);
    if (!shapes.length) throw new Error("Nichts zu exportieren");
    let blob;
    if (merge || shapes.length === 1) {
      const s = shapes.length === 1 ? shapes[0].shape : R.makeCompound(shapes.map((x) => x.shape));
      blob = R.exportSTEP([{ shape: s, name: shapes[0].name, color: shapes[0].color }]);
    } else blob = R.exportSTEP(shapes.map((x) => ({ shape: x.shape, name: x.name, color: x.color })));
    return await blob.text();
  },

  async exportIges({ items, fileName = "export.igs", simplify = null }) {
    const shapes = await placedShapes(items, simplify);
    if (!shapes.length) throw new Error("Nichts zu exportieren");
    const faces = [];
    let approx = 0;
    for (const s of shapes) { const r = igesFaces(R, s.shape); faces.push(...r.faces); approx += r.approx; }
    return { text: writeIges(faces, { fileName }), faces: faces.length, approx };
  },

  async exportStl({ items, quality = "fein", simplify = null }) {
    const shapes = await placedShapes(items, simplify);
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

  /**
   * DSTV-NC (ST1): je Körper Stabdaten (Bohrungen je Fläche) bzw. Plattenkontur; Text schreibt src/core/dstv.js.
   * Rückgabe [{ index, name, kind: "member"|"plate"|"skip", reason?, … }]
   */
  async dstvData({ part }) {
    const res = await getBuilt(part);
    return res.bodies.map((b, index) => {
      const name = b.name || part.name;
      const m = b.meta || {};
      try {
        if (b.kind === "member") {
          if (m.bends?.length || m.knicks) return { index, name, kind: "skip", reason: "gebogen – Abwicklung über die Biegeliste" };
          if (!m.axis || !m.sec) return { index, name, kind: "skip", reason: "ohne Stabachse" };
          const flat = m.sec.kind === "flach";
          const { holes, skipped } = memberHoles(K, b.shape, m.axis, { flat });
          return { index, name, kind: "member", sec: m.sec, section: m.section, area: m.area, length: m.length, perimeter: m.axis.perimeter, miterStart: m.miterStart, miterEnd: m.miterEnd, miterParts: m.miterParts, coped: !!m.coped || !!m.contours?.length, holes, skipped, width: m.axis.width, height: m.axis.height };
        }
        if (m.norm || m.weld || m.assist) return { index, name, kind: "skip", reason: "Normteil/Naht" };
        if (m.sheet?.bends?.length) return { index, name, kind: "skip", reason: "Kantteil – Abwicklung als DXF" };
        const pl = plateNc(R, b.shape);
        if (!pl) return { index, name, kind: "skip", reason: "keine ebene Platte" };
        return { index, name, kind: "plate", ...pl };
      } catch (e) {
        return { index, name, kind: "skip", reason: errorText(e, R) };
      }
    });
  },

  /**
   * IFC (ST2): je Körper Dreiecksnetz in Weltlage und die Angaben für Klasse und Eigenschaften; den Text schreibt src/core/ifc.js.
   */
  async ifcData({ items, tolerance = 0.2, simplify = null }) {
    const out = [], count = { drop: 0, box: 0 };
    for (const it of items) {
      const res = await getBuilt(it.part);
      const M = placementMatrix(it.pos || [0, 0, 0], it.rot || [0, 0, 0]);
      res.bodies.forEach((b, index) => {
        const m = b.meta || {};
        const own = simplified(b, simplify, count);
        if (!own) return;
        const shape = K.placed(own, it.pos || [0, 0, 0], it.rot || [0, 0, 0]);
        const mesh = shape.mesh({ tolerance, angularTolerance: 0.3 });
        let plate = !!(m.plate || m.rib || m.endcap || (m.sheet && !m.sheet.bends?.length));
        if (!plate && b.kind !== "member" && !m.norm && !m.weld) { try { plate = !!plateInfo(R, b.shape); } catch { plate = false; } }
        let volume = 0;
        try { volume = R.measureVolume(b.shape); } catch { /* ohne Volumen */ }
        out.push({
          item: it.name || it.part.name, part: it.part.name, number: it.part.number || "", index, name: b.name || it.part.name, kind: b.kind,
          axis: b.kind === "member" && m.axis ? matApplyDir(M, m.axis.z) : null, plate, norm: m.norm?.designation || null, weld: !!m.weld,
          profile: m.section || "", length: m.length || 0, thickness: m.plate?.t || m.sheet?.t || 0, volume,
          material: it.part.material || "", color: it.color || partColor(it.part),
          vertices: Array.from(mesh.vertices), triangles: Array.from(mesh.triangles),
        });
      });
    }
    return out;
  },

  async project({ items, views }) {
    const key0 = hashString(JSON.stringify(items));
    const result = {};
    let shape = null, shapes = null;
    for (const v of views) {
      const key = key0 + hashString(JSON.stringify([v.dir, v.up, v.hidden, v.cut || null, 2]));
      let r = projCache.get(key);
      if (!r) {
        if (!shape) {
          shapes = await placedShapes(items);
          if (!shapes.length) throw new Error("Keine Geometrie für die Ansicht");
          // makeCompound gibt die Einzelkörper frei: Kopien, die Schnitte brauchen die Teile einzeln
          shape = shapes.length === 1 ? shapes[0].shape : R.makeCompound(shapes.map((x) => x.shape.clone()));
        }
        try {
          if (v.cut) {
            // Schnitt nach DIN ISO 128-50: jedes Teil eigene Schnittfläche (eigene Schraffur), Normteile (Schrauben,
            // Muttern, Scheiben, Stifte) werden nicht geschnitten; liegen sie ganz vor der Schnittebene, entfallen sie
            const n = v3.norm(v.cut.n), parts = [], groups = [];
            for (const s of shapes) {
              if (s.body?.meta?.norm) {
                const bb = s.shape.boundingBox.bounds;
                const lo = Math.min(...[0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((k) => n[0] * bb[i][0] + n[1] * bb[j][1] + n[2] * bb[k][2]))));
                if (lo < v.cut.c - 1e-6) parts.push(s.shape.clone());
                continue;
              }
              let cs;
              try { cs = K.cutAtPlane(s.shape, n, v.cut.c); } catch { continue; }
              parts.push(cs);
              const loops = K.sectionLoops(cs, n, v.cut.c, v);
              if (loops.length) groups.push(loops);
            }
            if (!parts.length) throw new Error("Schnittebene liegt außerhalb");
            const cutShape = parts.length === 1 ? parts[0] : R.makeCompound(parts); // gibt die Kopien/Schnittteile frei
            r = K.projectView(cutShape, v);
            r.sectionLoops = groups.flat();
            r.sectionGroups = groups;
            r.axes = K.cylinderAxes(cutShape, v);
          } else {
            r = K.projectView(shape, v);
            r.axes = K.cylinderAxes(shape, v);
          }
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
  /**
   * Stecksystem zwischen zwei Komponenten (Stufe 46): beide Bauteile bauen, in die Baugruppe legen, Zapfen und
   * Schlitze planen und die Quader ins jeweilige Bauteil-System zurückrechnen.
   * tab/slot = { part, pos, rot, body? (fid) }; Rückgabe { tabs, slots, info, tabBody, slotBody }
   */
  async tabSlot({ tab, slot, params }) {
    await ready;
    const pick = async (it, label) => {
      const res = await getBuilt(it.part);
      const solids = res.bodies.filter((b) => b.kind === "solid" || b.kind === "member");
      const b = (it.body && solids.find((x) => x.fid === it.body)) || solids.map((x) => [x, R.measureVolume(x.shape)]).sort((x, y) => y[1] - x[1])[0]?.[0];
      if (!b) throw new Error(`${label}: kein Körper`);
      const M = placementMatrix(it.pos || [0, 0, 0], it.rot || [0, 0, 0]);
      return { b, M, inv: matInvertRigid(M), shape: K.placed(b.shape, it.pos || [0, 0, 0], it.rot || [0, 0, 0]) };
    };
    const A = await pick(tab, "Zapfenteil"), B = await pick(slot, "Schlitzteil");
    const plan = K.tabSlotPlan(A.shape, B.shape, params);
    const local = (inv) => (bx) => ({ ...bx, c: matApply(inv, bx.c), u: matApplyDir(inv, bx.u), n: matApplyDir(inv, bx.n) });
    return { tabs: plan.tabs.map(local(A.inv)), slots: plan.slots.map(local(B.inv)), info: plan.info, tabBody: A.b.fid, slotBody: B.b.fid };
  },
  async ping() { return "ok"; },
  /** Messgerüst (tools/messen.mjs): WASM-Speicher und Füllstand der Zwischenspeicher */
  async stats() {
    return { heapMB: heapMB(), built: built.size, meshes: meshCache.size, projections: projCache.size, prefixParts: K.prefixCache.size, prefixStates: [...K.prefixCache.values()].reduce((n, l) => n + l.length, 0) };
  },
};

/** Belegter WASM-Speicher in MB (wächst nur, OpenCascade gibt Speicher aus Booleschen Operationen nicht vollständig zurück) */
function heapMB() {
  return Math.round((OCM?.wasmMemory?.buffer?.byteLength ?? OCM?.HEAPU8?.length ?? 0) / 1048576);
}

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
    self.postMessage({ id, ok: true, result, heapMB: heapMB() });
  } catch (e) {
    const fatal = e instanceof WebAssembly.RuntimeError;
    self.postMessage({ id, ok: false, error: errorText(e, R), fatal, heapMB: heapMB() });
  }
};
