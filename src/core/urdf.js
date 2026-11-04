// URDF-Export (SolidCraft-Abgleich E5): Baugruppe mit Gelenken als Roboterbeschreibung für ROS, Gazebo, MoveIt.
// Glieder = Komponenten mit Gelenk (samt ihren mitgehenden Teilen) und ein Grundglied »basis« für alles Feste.
// Netze als binäres STL in Weltkoordinaten der heutigen Lage (mm, im URDF mit scale 0,001 auf Meter).
import { jointFollowers, isSlide, isCylinder } from "./kinematik.js";
import { zipFiles } from "./xlsx.js";

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n6 = (v) => { const r = Math.round(v * 1e6) / 1e6; return Object.is(r, -0) ? "0" : String(r); };
const UML = { ä: "ae", ö: "oe", ü: "ue", Ä: "Ae", Ö: "Oe", Ü: "Ue", ß: "ss" };
export const linkName = (s) => String(s || "glied").replace(/[äöüÄÖÜß]/g, (c) => UML[c]).normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "glied";

/**
 * Glieder und Gelenke aus der Baugruppe. Rückgabe { links: [{ name, comps: [id] }], joints: [{ name, type, parent, child,
 * xyz (m), axis, lower, upper }] }. Zylindergelenke werden als Drehgelenk ausgegeben (URDF kennt keine Kombination).
 */
export function urdfModel(asm) {
  const comps = asm.components.filter((c) => !c.hidden);
  const jointed = comps.filter((c) => c.joint);
  const owner = new Map();
  const taken = new Set();
  const names = new Set(["basis"]);
  const uniq = (s) => { let n = linkName(s), k = 2; while (names.has(n)) n = `${linkName(s)}_${k++}`; names.add(n); return n; };
  const links = [{ name: "basis", comps: [] }];
  for (const c of jointed) {
    // ein Teil, das an zwei Gelenkteilen hängt, gehört zum ersten (bewegt sich mit ihm)
    const l = { name: uniq(c.name), comps: [c.id, ...jointFollowers(asm, c.id).filter((id) => !taken.has(id))] };
    for (const id of l.comps) { owner.set(id, l.name); taken.add(id); }
    links.push(l);
  }
  for (const c of comps) if (!taken.has(c.id)) { links[0].comps.push(c.id); owner.set(c.id, "basis"); }
  // Elternglied: das Glied, an dessen Teil das Gelenkteil über eine Abhängigkeit hängt (sonst basis)
  const parentOf = (c) => {
    const mine = owner.get(c.id);
    for (const k of asm.constraints || []) {
      if (k.suppressed) continue;
      const other = k.a?.comp === c.id ? k.b?.comp : k.b?.comp === c.id ? k.a?.comp : null;
      const o = other && owner.get(other);
      if (o && o !== mine && o !== "basis") return o;
    }
    return "basis";
  };
  const joints = jointed.map((c) => {
    const j = c.joint, slide = isSlide(j);
    const lim = (x) => (slide ? x / 1000 : (x * Math.PI) / 180);
    return { name: `${owner.get(c.id)}_gelenk`, type: slide ? "prismatic" : Math.abs(j.max - j.min) >= 360 && !isCylinder(j) ? "continuous" : "revolute",
      parent: parentOf(c), child: owner.get(c.id), xyz: (slide ? [0, 0, 0] : j.p).map((v) => v / 1000), axis: j.d, lower: lim(Math.min(j.min, j.max)), upper: lim(Math.max(j.min, j.max)) };
  });
  // Ein Glied, dessen Eltern ihrerseits Kind sind, liegt im Weltbezug: Gelenkursprung relativ zum Elterngelenk
  const at = new Map(joints.map((j) => [j.child, j.xyz]));
  for (const j of joints) { const p = at.get(j.parent); if (p) j.xyzRel = j.xyz.map((v, i) => v - p[i]); }
  return { links, joints };
}

/** URDF-Text; meshFile(link) → Dateiname des Netzes oder null */
export function writeUrdf(name, model, meshFile) {
  const at = new Map(model.joints.map((j) => [j.child, j.xyz]));
  const L = model.links.map((l) => {
    const f = meshFile(l);
    const o = at.get(l.name) || [0, 0, 0];
    // Netz liegt in Weltkoordinaten: Glied-Ursprung = Gelenkpunkt, Netz um −Gelenkpunkt verschoben
    const vis = f ? `\n    <visual>\n      <origin xyz="${o.map((v) => n6(-v)).join(" ")}" rpy="0 0 0"/>\n      <geometry><mesh filename="${xml(f)}" scale="0.001 0.001 0.001"/></geometry>\n    </visual>\n    <collision>\n      <origin xyz="${o.map((v) => n6(-v)).join(" ")}" rpy="0 0 0"/>\n      <geometry><mesh filename="${xml(f)}" scale="0.001 0.001 0.001"/></geometry>\n    </collision>` : "";
    return `  <link name="${xml(l.name)}">${vis}\n  </link>`;
  });
  const J = model.joints.map((j) => `  <joint name="${xml(j.name)}" type="${j.type}">\n    <parent link="${xml(j.parent)}"/>\n    <child link="${xml(j.child)}"/>\n    <origin xyz="${(j.xyzRel || j.xyz).map(n6).join(" ")}" rpy="0 0 0"/>\n    <axis xyz="${j.axis.map(n6).join(" ")}"/>`
    + (j.type === "continuous" ? "" : `\n    <limit lower="${n6(j.lower)}" upper="${n6(j.upper)}" effort="100" velocity="1"/>`) + "\n  </joint>");
  return `<?xml version="1.0"?>\n<!-- PBCAD: Baugruppe ${xml(name)} -->\n<robot name="${xml(linkName(name))}">\n${[...L, ...J].join("\n")}\n</robot>\n`;
}

/** Binäres STL aus Dreiecken (pos in mm, idx oder null) */
export function stlBinary(meshes) {
  const tris = [];
  for (const m of meshes) {
    const idx = m.idx || Array.from({ length: m.pos.length / 3 }, (_, i) => i);
    for (let t = 0; t < idx.length; t += 3) tris.push([idx[t], idx[t + 1], idx[t + 2]].map((i) => [m.pos[3 * i], m.pos[3 * i + 1], m.pos[3 * i + 2]]));
  }
  const buf = new ArrayBuffer(84 + tris.length * 50), dv = new DataView(buf);
  dv.setUint32(80, tris.length, true);
  tris.forEach((t, k) => {
    const o = 84 + k * 50;
    const u = t[1].map((v, i) => v - t[0][i]), w = t[2].map((v, i) => v - t[0][i]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...n) || 1;
    n.forEach((v, i) => dv.setFloat32(o + i * 4, v / l, true));
    t.forEach((p, a) => p.forEach((v, i) => dv.setFloat32(o + 12 + a * 12 + i * 4, v, true)));
  });
  return new Uint8Array(buf);
}

/** Paket als ZIP: <name>/urdf/<name>.urdf und <name>/meshes/<glied>.stl; meshesOf(compId) → [{pos, idx}] */
export function urdfPackage(name, asm, meshesOf) {
  const model = urdfModel(asm);
  const pkg = linkName(name), files = [];
  const meshFile = (l) => {
    const ms = l.comps.flatMap((id) => meshesOf(id) || []);
    if (!ms.length) return null;
    files.push([`${pkg}/meshes/${l.name}.stl`, stlBinary(ms)]);
    return `package://${pkg}/meshes/${l.name}.stl`;
  };
  const text = writeUrdf(name, model, meshFile);
  files.unshift([`${pkg}/urdf/${pkg}.urdf`, text]);
  return { zip: zipFiles(files), text, model, files: files.map((f) => f[0]) };
}
