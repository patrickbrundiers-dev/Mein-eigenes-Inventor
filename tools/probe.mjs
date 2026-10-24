// Einmaliger Erkundungs-Lauf: prüft die API des CAD-Kerns (replicad / OpenCascade)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const log = (...a) => console.log(...a);

for (const p of ["replicad", "replicad-opencascadejs", "three", "esbuild", "electron", "electron-builder", "electron-updater"]) {
  try {
    const pj = JSON.parse(fs.readFileSync(`node_modules/${p}/package.json`, "utf8"));
    log("VERSION", p, pj.version, "main:", pj.main, "module:", pj.module, "exports:", JSON.stringify(pj.exports)?.slice(0, 300), "deps:", JSON.stringify(pj.dependencies));
  } catch (e) { log("VERSION", p, "missing", e.message); }
}
log("OC files:", fs.readdirSync("node_modules/replicad-opencascadejs/dist").join(", "));
log("OC exports full:", JSON.stringify(JSON.parse(fs.readFileSync("node_modules/replicad-opencascadejs/package.json","utf8")).exports));
log("replicad exports full:", JSON.stringify(JSON.parse(fs.readFileSync("node_modules/replicad/package.json","utf8")).exports));
log("replicad dist:", fs.readdirSync("node_modules/replicad/dist").join(", "));

const r = await import("replicad");
try { const sf = await import("replicad/shape-functions"); log("SHAPE-FUNCTIONS", Object.keys(sf).sort().join(" ")); } catch (e) { log("no shape-functions", e.message); }
log("EXPORTS", Object.keys(r).sort().join(" "));

const ocFile = fs.existsSync("node_modules/replicad-opencascadejs/dist/replicad_with_exceptions.js")
  ? "replicad_with_exceptions" : "replicad_single";
log("using", ocFile);
const ocMod = await import(path.resolve(`node_modules/replicad-opencascadejs/dist/${ocFile}.js`));
const init = ocMod.default;
const wasmPath = path.resolve(`node_modules/replicad-opencascadejs/dist/${ocFile}.wasm`);
const OC = await init({ locateFile: () => wasmPath });
r.setOC(OC);
log("OC loaded");

function tryit(name, fn) {
  try { const v = fn(); log("OK", name, typeof v === "string" ? v.slice(0, 400) : JSON.stringify(v)?.slice(0, 400)); return v; }
  catch (e) { log("FAIL", name, e?.message || String(e), e?.stack?.split("\n").slice(0, 3).join(" | ")); }
}

const box = tryit("makeBox", () => { const b = r.makeBaseBox(10, 20, 30); return b; });
let shape = r.makeBaseBox(40, 20, 10);
log("box proto methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(shape)).join(" "));
log("box proto2 methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(Object.getPrototypeOf(shape))).join(" "));
log("box proto3 methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(Object.getPrototypeOf(Object.getPrototypeOf(shape)))).join(" "));
tryit("boundingBox", () => { const bb = shape.boundingBox; return { bounds: bb.bounds, w: bb.width, h: bb.height, d: bb.depth, center: bb.center }; });
tryit("measureVolume", () => r.measureVolume(shape));
tryit("measureShapeVolumeProperties", () => { const p = r.measureShapeVolumeProperties(shape); return { v: p.volume, c: p.centerOfMass }; });
tryit("mesh", () => { const m = shape.mesh({ tolerance: 0.1, angularTolerance: 0.3 }); return { keys: Object.keys(m), nv: m.vertices.length, nt: m.triangles.length, fg: m.faceGroups.slice(0, 3) }; });
tryit("meshEdges", () => { const m = shape.meshEdges({ tolerance: 0.1, angularTolerance: 0.3 }); return { keys: Object.keys(m), nl: m.lines.length, eg: m.edgeGroups.slice(0, 3) }; });
const edges = tryit("edges", () => shape.edges.length);
const e0 = shape.edges[0];
log("edge proto:", Object.getOwnPropertyNames(Object.getPrototypeOf(e0)).join(" "), "|", Object.getOwnPropertyNames(Object.getPrototypeOf(Object.getPrototypeOf(e0))).join(" "));
tryit("edge pointAt", () => ({ p0: e0.pointAt(0), p5: e0.pointAt(0.5), p1: e0.pointAt(1), sp: e0.startPoint, ep: e0.endPoint, len: e0.length, gt: e0.geomType }));
const f0 = shape.faces[0];
log("face proto:", Object.getOwnPropertyNames(Object.getPrototypeOf(f0)).join(" "));
tryit("face info", () => ({ gt: f0.geomType, n: f0.normalAt(), c: f0.center }));

// Skizze + Extrusion + Bogen
const drw = tryit("draw", () => r.draw([0, 0]).hLine(50).vLine(20).threePointsArcTo([0, 20], [25, 35]).close());
log("drawing proto:", Object.getOwnPropertyNames(Object.getPrototypeOf(drw)).join(" "));
const sk = tryit("sketchOnPlane", () => drw.sketchOnPlane("XZ", 0));
log("sketch proto:", sk && Object.getOwnPropertyNames(Object.getPrototypeOf(sk)).join(" "));
const ext = tryit("extrude", () => sk.extrude(10));
tryit("ext bbox", () => ext.boundingBox.bounds);
const sk2 = r.drawCircle(5).sketchOnPlane("XY");
tryit("circle extrude bbox", () => sk2.extrude(-10).boundingBox.bounds);
tryit("XY plane custom", () => { const pl = new r.Plane([0, 0, 5], [1, 0, 0], [0, 0, 1]); return r.drawRectangle(10, 4).sketchOnPlane(pl).extrude(3).boundingBox.bounds; });
tryit("2d cut", () => r.drawRectangle(20, 20).cut(r.drawCircle(4)).sketchOnPlane("XY").extrude(5).boundingBox.bounds);
tryit("2d fuse", () => r.drawRectangle(20, 20).fuse(r.drawRectangle(5, 40)).sketchOnPlane("XY").extrude(5).boundingBox.bounds);
tryit("revolve", () => r.drawRectangle(10, 20).translate(20, 0).sketchOnPlane("XZ").revolve().boundingBox.bounds);
tryit("revolve axis", () => r.drawRectangle(10, 20).translate(20, 0).sketchOnPlane("XZ").revolve([0, 0, 1], { origin: [0, 0, 0] }).boundingBox.bounds);
tryit("cut 3d", () => r.measureVolume(r.makeBaseBox(20, 20, 20).cut(r.makeCylinder(5, 50, [0, 0, -10], [0, 0, 1]))));
tryit("fuse 3d", () => r.makeBaseBox(20, 20, 20).fuse(r.makeBaseBox(5, 5, 40)).boundingBox.bounds);
tryit("intersect", () => r.makeBaseBox(20, 20, 20).intersect(r.makeBaseBox(5, 5, 40)).boundingBox.bounds);
tryit("fillet all", () => r.measureVolume(r.makeBaseBox(20, 20, 20).fillet(2)));
tryit("fillet fn", () => r.measureVolume(r.makeBaseBox(20, 20, 20).fillet((e) => (Math.abs(e.pointAt(0.5)[2] - 20) < 1e-6 ? 3 : null))));
tryit("chamfer fn", () => r.measureVolume(r.makeBaseBox(20, 20, 20).chamfer((e) => (e.pointAt(0.5)[2] > 19 ? 2 : null))));
tryit("fillet too big", () => r.measureVolume(r.makeBaseBox(20, 20, 20).fillet(30)));
tryit("translate/rotate", () => r.makeBaseBox(10, 10, 10).rotate(90, [0, 0, 0], [0, 0, 1]).translate([100, 0, 0]).boundingBox.bounds);
tryit("clone", () => typeof shape.clone);
tryit("compound", () => r.makeCompound([r.makeBaseBox(1, 1, 1), r.makeBaseBox(2, 2, 2).translate([10, 0, 0])]).boundingBox.bounds);
tryit("shell", () => r.measureVolume(r.makeBaseBox(20, 20, 20).shell(2, (f) => f.inPlane("XY", 20))));

// Export
tryit("blobSTEP", () => { const b = shape.blobSTEP(); return b.constructor.name + " " + b.size; });
tryit("blobSTL", () => { const b = shape.blobSTL({ binary: true }); return b.constructor.name + " " + b.size; });
tryit("exportSTEP", () => { const b = r.exportSTEP([{ shape: r.makeBaseBox(1, 1, 1), name: "Teil A", color: "#ff0000" }, { shape: r.makeBaseBox(2, 2, 2), name: "Teil B" }]); return b.constructor.name + " " + b.size; });
const stepBlob = shape.blobSTEP();
const stepTxt = await stepBlob.text();
log("step head", stepTxt.slice(0, 200).replace(/\n/g, " "));
try { const imp = await r.importSTEP(new Blob([stepTxt])); log("OK importSTEP", JSON.stringify(imp.boundingBox.bounds)); } catch (e) { log("FAIL importSTEP", e.message); }

// Projektion
const L = r.draw([0, 0]).hLine(40).vLine(10).hLine(-30).vLine(20).hLine(-10).close().sketchOnPlane("XZ").extrude(-15); // L in XZ, extrude toward +Y?
tryit("L bbox", () => L.boundingBox.bounds);
tryit("projectionCamera proto", () => Object.getOwnPropertyNames(r.ProjectionCamera.prototype).join(" "));
for (const cam of ["front", "top", "left", "right", "back", "bottom"]) {
  tryit("proj " + cam, () => { const p = r.drawProjection(L, cam); return { vis: p.visible.toSVGPaths(), vb: p.visible.toSVGViewBox(), hid: p.hidden.toSVGPaths() }; });
}
tryit("proj custom", () => {
  const camera = new r.ProjectionCamera([0, 0, 0], [0, -1, 0], [1, 0, 0]);
  const p = r.drawProjection(L, camera); return { vis: p.visible.toSVGPaths(), hid: p.hidden.toSVGPaths(), bb: p.visible.boundingBox?.bounds };
});
const holeBox = r.makeBaseBox(40, 20, 20).cut(r.makeCylinder(4, 10, [0, 10, 5], [0, 1, 0]));
tryit("hole box bbox", () => holeBox.boundingBox.bounds);
tryit("proj hole -Y view dir", () => { const p = r.drawProjection(holeBox, new r.ProjectionCamera([0, 0, 0], [0, -1, 0], [1, 0, 0])); return { vis: p.visible.toSVGPaths(), hid: p.hidden.toSVGPaths() }; });
tryit("proj hole +Y view dir", () => { const p = r.drawProjection(holeBox, new r.ProjectionCamera([0, 0, 0], [0, 1, 0], [1, 0, 0])); return { vis: p.visible.toSVGPaths(), hid: p.hidden.toSVGPaths() }; });
tryit("proj iso", () => { const p = r.drawProjection(holeBox, new r.ProjectionCamera([0, 0, 0], [1, -1, 1], [1, 1, 0])); return { vis: p.visible.toSVGPaths().length }; });
tryit("drawing svg", () => r.drawCircle(5).toSVG());
tryit("drawing blueprint", () => { const d = r.drawRectangle(10, 5); return Object.keys(d).join(",") + " | " + Object.getOwnPropertyNames(Object.getPrototypeOf(d.blueprint || {})).join(" "); });

log("PROBE DONE");
