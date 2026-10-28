// IFC4-Export (Stahlbau-Lücken ST2): Bauteile für BIM-Planer und Viewer. Reine Rechnung, ohne Kernel.
// Geometrie als Dreiecksnetz (IfcTriangulatedFaceSet) – das lesen alle gängigen Viewer und Planungsprogramme.
// Stäbe werden nach der Achsrichtung Stütze (senkrecht), Träger (waagrecht) oder Stab (schräg), Platten IfcPlate,
// Normteile IfcMechanicalFastener, alles andere IfcBuildingElementProxy. Eigenschaften im Satz »PBCAD_Bauteil«.

import { materialOf } from "./materials.js";

const B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

/** 22-stellige IFC-GlobalId aus 16 Bytes (z. B. Zufall oder Hash) */
export function ifcGuid(bytes) {
  const b = Array.from(bytes).slice(0, 16);
  while (b.length < 16) b.push(0);
  // 128 Bit → 22 Zeichen: erstes Zeichen 2 Bit, dann 21 × 6 Bit
  let bits = "";
  for (const x of b) bits += (x & 255).toString(2).padStart(8, "0");
  bits = "0000" + bits; // 132 Bit = 22 × 6
  let out = "";
  for (let i = 0; i < 132; i += 6) out += B64[parseInt(bits.slice(i, i + 6), 2)];
  return out;
}
/** Folge von GlobalIds aus einem Startwert (gleiches Projekt → gleiche Ids, gut für Vergleiche) */
export function guidMaker(seed = "pbcad") {
  let h = 2166136261 >>> 0;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  let n = 0;
  return () => {
    const bytes = [];
    let x = (h ^ Math.imul(++n, 2654435761)) >>> 0;
    for (let i = 0; i < 16; i++) { x = Math.imul(x ^ (x >>> 15), 2246822519) >>> 0; x = (x ^ (x >>> 13)) >>> 0; bytes.push(x & 255); }
    return ifcGuid(bytes);
  };
}

/** IFC-Text: ' verdoppeln, Nicht-ASCII als \X2\…\X0\ */
export function ifcString(s) {
  if (s === null || s === undefined || s === "") return "$";
  let out = "";
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (ch === "'") out += "''";
    else if (ch === "\\") out += "\\\\";
    else if (c >= 32 && c < 127) out += ch;
    else if (c < 0x10000) out += `\\X2\\${c.toString(16).toUpperCase().padStart(4, "0")}\\X0\\`;
    else out += `\\X4\\${c.toString(16).toUpperCase().padStart(8, "0")}\\X0\\`;
  }
  return `'${out}'`;
}
const real = (x) => {
  const v = Math.abs(x) < 1e-9 ? 0 : x;
  const s = String(Math.round(v * 1e4) / 1e4);
  return s.includes(".") || s.includes("e") ? s : s + ".";
};

/** Art des Bauelements aus den Körperdaten: { kind, axisZ? (Stabachse), plate?, norm? } */
export function ifcClass(b) {
  if (b.norm) return "IFCMECHANICALFASTENER";
  if (b.kind === "member" && b.axis) {
    const vz = Math.abs(b.axis[2]) / (Math.hypot(...b.axis) || 1);
    if (vz > 0.95) return "IFCCOLUMN";
    if (vz < 0.1) return "IFCBEAM";
    return "IFCMEMBER";
  }
  if (b.plate) return "IFCPLATE";
  return "IFCBUILDINGELEMENTPROXY";
}
const PREDEFINED = { IFCBEAM: ".BEAM.", IFCCOLUMN: ".COLUMN.", IFCMEMBER: ".MEMBER.", IFCPLATE: ".SHEET.", IFCMECHANICALFASTENER: ".BOLT.", IFCBUILDINGELEMENTPROXY: ".ELEMENT." };

/** "#8b99a6" → [r, g, b] 0…1 */
const rgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  const n = m ? parseInt(m[1], 16) : 0x8d99a6;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => x / 255);
};

/**
 * IFC4-Datei.
 * model = { project, site?, building?, storey?, author?, org?, elements: [{ ifc?, name, tag?, description?, material?, color?,
 *           props?: {Name: Wert}, vertices: [x, y, z …] (mm, Weltlage), triangles: [i, j, k …] (0-basiert) }] }
 * opts = { guid: () => string, time: Date }
 */
export function writeIfc(model, { guid = guidMaker(model.project), time = new Date(), app = "PBCAD", version = "" } = {}) {
  const L = [];
  let n = 0;
  const add = (s) => { L.push(`#${++n}=${s};`); return `#${n}`; };
  const S = ifcString;
  const ts = Math.floor(time.getTime() / 1000);
  // Kopfdaten
  const person = add(`IFCPERSON($,${S(model.author || "")},$,$,$,$,$,$)`);
  const org = add(`IFCORGANIZATION($,${S(model.org || app)},$,$,$)`);
  const po = add(`IFCPERSONANDORGANIZATION(${person},${org},$)`);
  const appl = add(`IFCAPPLICATION(${org},${S(version || "1")},${S(app)},${S(app)})`);
  const oh = add(`IFCOWNERHISTORY(${po},${appl},$,.ADDED.,${ts},$,$,${ts})`);
  const len = add("IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)");
  const area = add("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)");
  const vol = add("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)");
  const mass = add("IFCSIUNIT(*,.MASSUNIT.,.KILO.,.GRAM.)");
  const ang = add("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)");
  const units = add(`IFCUNITASSIGNMENT((${len},${area},${vol},${mass},${ang}))`);
  const origin = add("IFCCARTESIANPOINT((0.,0.,0.))");
  const zAx = add("IFCDIRECTION((0.,0.,1.))"), xAx = add("IFCDIRECTION((1.,0.,0.))");
  const wcs = add(`IFCAXIS2PLACEMENT3D(${origin},${zAx},${xAx})`);
  const ctx = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${wcs},$)`);
  const body = add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`);
  const project = add(`IFCPROJECT('${guid()}',${oh},${S(model.project || "PBCAD")},$,$,$,$,(${ctx}),${units})`);
  const place = (rel) => add(`IFCLOCALPLACEMENT(${rel},${add(`IFCAXIS2PLACEMENT3D(${origin},$,$)`)})`);
  const sitePl = place("$"), bldPl = place(sitePl), stPl = place(bldPl);
  const site = add(`IFCSITE('${guid()}',${oh},${S(model.site || "Gelände")},$,$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
  const bld = add(`IFCBUILDING('${guid()}',${oh},${S(model.building || "Gebäude")},$,$,${bldPl},$,$,.ELEMENT.,$,$,$)`);
  const storey = add(`IFCBUILDINGSTOREY('${guid()}',${oh},${S(model.storey || "Stahlbau")},$,$,${stPl},$,$,.ELEMENT.,0.)`);
  add(`IFCRELAGGREGATES('${guid()}',${oh},$,$,${project},(${site}))`);
  add(`IFCRELAGGREGATES('${guid()}',${oh},$,$,${site},(${bld}))`);
  add(`IFCRELAGGREGATES('${guid()}',${oh},$,$,${bld},(${storey}))`);
  const elems = [];
  const mats = new Map(), styles = new Map();
  for (const e of model.elements || []) {
    const v = e.vertices || [], t = e.triangles || [];
    if (v.length < 9 || t.length < 3) continue;
    const pts = [];
    for (let i = 0; i + 2 < v.length; i += 3) pts.push(`(${real(v[i])},${real(v[i + 1])},${real(v[i + 2])})`);
    const tri = [];
    for (let i = 0; i + 2 < t.length; i += 3) tri.push(`(${t[i] + 1},${t[i + 1] + 1},${t[i + 2] + 1})`);
    const pl = add(`IFCCARTESIANPOINTLIST3D((${pts.join(",")}),$)`);
    const fs = add(`IFCTRIANGULATEDFACESET(${pl},$,.T.,(${tri.join(",")}),$)`);
    const col = e.color || "#8d99a6";
    if (!styles.has(col)) {
      const [r, g, b] = rgb(col);
      const c = add(`IFCCOLOURRGB($,${real(r)},${real(g)},${real(b)})`);
      const sh = add(`IFCSURFACESTYLESHADING(${c},0.)`);
      styles.set(col, add(`IFCSURFACESTYLE($,.BOTH.,(${sh}))`));
    }
    add(`IFCSTYLEDITEM(${fs},(${styles.get(col)}),$)`);
    const rep = add(`IFCSHAPEREPRESENTATION(${body},'Body','Tessellation',(${fs}))`);
    const pds = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${rep}))`);
    const cls = e.ifc || "IFCBUILDINGELEMENTPROXY";
    const ePl = place(stPl);
    const head = `'${guid()}',${oh},${S(e.name)},${S(e.description || "")},$,${ePl},${pds},${S(e.tag || "")}`;
    const el = cls === "IFCMECHANICALFASTENER" ? add(`${cls}(${head},$,$,${PREDEFINED[cls]})`) : add(`${cls}(${head},${PREDEFINED[cls]})`);
    elems.push(el);
    if (e.material) {
      if (!mats.has(e.material)) mats.set(e.material, { ref: add(`IFCMATERIAL(${S(e.material)},$,$)`), els: [] });
      mats.get(e.material).els.push(el);
    }
    const props = Object.entries(e.props || {}).filter(([, x]) => x !== undefined && x !== null && x !== "");
    if (props.length) {
      const ps = props.map(([k, x]) => add(`IFCPROPERTYSINGLEVALUE(${S(k)},$,${typeof x === "number" ? `IFCREAL(${real(x)})` : `IFCLABEL(${S(x)})`},$)`));
      const set = add(`IFCPROPERTYSET('${guid()}',${oh},'PBCAD_Bauteil',$,(${ps.join(",")}))`);
      add(`IFCRELDEFINESBYPROPERTIES('${guid()}',${oh},$,$,(${el}),${set})`);
    }
  }
  if (elems.length) add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid()}',${oh},$,$,(${elems.join(",")}),${storey})`);
  for (const m of mats.values()) add(`IFCRELASSOCIATESMATERIAL('${guid()}',${oh},$,$,(${m.els.join(",")}),${m.ref})`);
  const iso = time.toISOString().slice(0, 19);
  const header = [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
    `FILE_NAME(${S((model.project || "PBCAD") + ".ifc")},'${iso}',(${model.author ? S(model.author) : "''"}),(${model.org ? S(model.org) : "''"}),${S(app)},${S((app + " " + version).trim())},'');`,
    "FILE_SCHEMA(('IFC4'));",
    "ENDSEC;",
    "DATA;",
  ];
  return [...header, ...L, "ENDSEC;", "END-ISO-10303-21;", ""].join("\n");
}

/** Statistik für Meldung und Test: Anzahl je IFC-Klasse */
export function ifcCounts(text) {
  const out = {};
  for (const m of String(text).matchAll(/^#\d+=(IFC(?:BEAM|COLUMN|MEMBER|PLATE|MECHANICALFASTENER|BUILDINGELEMENTPROXY))\(/gm)) out[m[1]] = (out[m[1]] || 0) + 1;
  return out;
}

/**
 * Kernel-Daten (ifcData) → Elemente für writeIfc: Klasse, Name, Werkstoff, Eigenschaften (Profil, Länge, Dicke, Gewicht).
 * Schweißnähte bleiben draußen (stecken im Bauteil). tags: optional Map "Bauteil|Körper-Index" → Positionsnummer.
 */
export function ifcElements(data, { tags = null } = {}) {
  const out = [];
  for (const b of data || []) {
    if (b.weld) continue;
    const mat = materialOf(b.material);
    const ifc = ifcClass(b);
    const weight = b.volume ? (b.volume * (mat.density || 7.85)) / 1e6 : 0;
    const name = b.norm || (b.kind === "member" && b.profile ? `${b.profile}` : b.name);
    const props = {
      Bauteil: b.item, Teilenummer: b.number, Benennung: b.name, Werkstoff: mat.label,
      Profil: b.kind === "member" ? b.profile : "", "Länge mm": b.kind === "member" && b.length ? Math.round(b.length * 10) / 10 : null,
      "Dicke mm": b.thickness || null, "Gewicht kg": weight ? Math.round(weight * 1000) / 1000 : null, Normteil: b.norm || "",
    };
    const tag = tags?.get(`${b.part}|${b.index}`) || b.number || "";
    out.push({ ifc, name, description: `${b.item} – ${b.name}`, tag, material: mat.label, color: b.color, props, vertices: b.vertices, triangles: b.triangles });
  }
  return out;
}
