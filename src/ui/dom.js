// DOM-Helfer, Symbole, Dialoge, Hinweise, Kontextmenüs

export function h(tag, attrs = {}, ...children) {
  const el = tag === "svg" || attrs.svg ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false || k === "svg") continue;
    if (k === "class") el.setAttribute("class", v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") el.innerHTML = v;
    else if (k === "value" && "value" in el) el.value = v;
    else if (k === "checked") el.checked = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function svgEl(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, v);
  return el;
}

// Symbole: schlichte Strichzeichnungen im 24er-Raster
const P = {
  part: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  assembly: '<path d="M3 9l6-3 6 3v6l-6 3-6-3z"/><path d="M13 7l4-2 4 2v5l-4 2"/><path d="M3 9l6 3 6-3M9 12v6"/>',
  drawing: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M13 14h8M13 17h8M13 14v6M6 7h5v4H6z"/>',
  sketch: '<path d="M3 20l5-1 11-11-4-4L4 15z"/><path d="M13 6l4 4"/>',
  extrude: '<path d="M5 16l7 3 7-3M5 16V8l7-3 7 3v8"/><path d="M12 19v-8M5 8l7 3 7-3"/><path d="M12 2v3" stroke-dasharray="2 2"/>',
  revolve: '<ellipse cx="12" cy="12" rx="8" ry="3.5"/><path d="M12 3v18" stroke-dasharray="2 2"/><path d="M18 7.5a8 3.5 0 0 1 2 4.5"/><path d="M20 9l0 3-3 -1"/>',
  hole: '<ellipse cx="12" cy="7" rx="7" ry="2.5"/><path d="M5 7v10c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V7"/><ellipse cx="12" cy="7" rx="3" ry="1"/><path d="M9 7v9M15 7v9"/>',
  profile: '<rect x="3" y="9" width="18" height="6" rx="1"/><path d="M3 9l3-3h18l-3 3M21 15l3-3V6"/>',
  emboss: '<path d="M3 17c3-2 6-2 9 0s6 2 9 0"/><path d="M7 6h10M12 6v8"/><path d="M9 14h6"/>',
  naht: '<path d="M3 20h18"/><path d="M3 20l9-9"/><path d="M6 17l3 3M9 14l3 3M12 11l3 3" stroke-width="1.4"/>',
  gelaender: '<path d="M3 21V7M12 21V7M21 21V7"/><path d="M2 6h20"/><path d="M6 9v10M9 9v10M15 9v10M18 9v10" stroke-width="1.2"/><path d="M3 19h18"/>',
  tor: '<path d="M3 21V5M21 21V5"/><path d="M5 20V9q3.5-3 7-3t7 3v11z"/><path d="M12 6v14M8.5 8v12M15.5 8v12" stroke-width="1.2"/>',
  rampe: '<path d="M2 19h20M2 19 14 11h8"/><path d="M5 17v2M10 13.7V19M16 11v8M21 11v8"/><path d="M2 13l12-8h8" stroke-width="1.2"/>',
  zarge: '<path d="M5 21V4h14v17"/><path d="M8 21V7h8v14" stroke-width="1.2"/><path d="M3 21h4M17 21h4"/>',
  fenstergitter: '<path d="M4 3h16v18H4z"/><path d="M8 3v18M12 3v18M16 3v18"/><path d="M4 9h16M4 15h16" stroke-width="1.2"/>',
  pergola: '<path d="M3 7h18v3H3z"/><path d="M6 7l1.5 3M10 7l1.5 3M14 7l1.5 3M18 7l1.5 3" stroke-width="1.2"/><path d="M4 10v11M20 10v11M2 21h20"/>',
  vordach: '<path d="M2 7l20-3v2L2 9z"/><path d="M5 9v12M19 6v15M2 21h20"/><path d="M5 12l3-3M19 10l-3-3" stroke-width="1.2"/>',
  zaun: '<path d="M2 20l20-4"/><path d="M4 21V6M12 19.5V5M20 18V4"/><path d="M4 9l8-1.2M4 16l8-1.5M12 7.8l8-1.3M12 14.5l8-1.5" stroke-width="1.2"/>',
  schiebetor: '<path d="M2 18h20"/><path d="M4 17V8h16v9"/><path d="M4 17l6-6M10 8v9M13 8v9M16 8v9" stroke-width="1.2"/><path d="M3 5h5M3 5l2-2M3 5l2 2"/>',
  treppe: '<path d="M3 21h4v-4h4v-4h4V9h4V5h2"/><path d="M3 17L19 3" stroke-width="1.2"/>',
  voute: '<path d="M2 6h20"/><path d="M2 6v12l7-8h13v-4"/><path d="M9 10v-4" stroke-width="1.2"/>',
  rahmenecke: '<path d="M5 21V5h4v16"/><path d="M9 7l12-3v4L9 11"/><path d="M9 4v9"/>',
  pfette: '<path d="M2 9h20v4H2z"/><path d="M6 13v6M18 13v6"/><path d="M4 19h4M16 19h4"/>',
  stuetzenfuss: '<path d="M9 3v12M15 3v12"/><path d="M4 15h16v3H4z"/><path d="M7 18v4M17 18v4"/>',
  traegerstoss: '<path d="M2 7h9v10H2M22 7h-9v10h9"/><path d="M8 5h8v2H8zM8 17h8v2H8z"/><circle cx="9.5" cy="12" r="1"/><circle cx="14.5" cy="12" r="1"/>',
  traegeranschluss: '<path d="M3 3v18M7 3v18M3 4h4M3 20h4"/><path d="M10 8h11M10 16h11M14 8v8"/><path d="M7 9h5v6H7"/>',
  steigleiter: '<path d="M7 2v20M13 2v20M7 6h6M7 10h6M7 14h6M7 18h6"/><path d="M13 9c5 0 7 2 7 5s-2 5-7 5"/>',
  fachwerk: '<path d="M2 18h20M2 8h20M2 8v10M22 8v10M7 8v10M12 8v10M17 8v10"/><path d="M2 8l5 10M7 8l5 10M17 18l5-10M12 18l5-10"/>',
  achsraster: '<path d="M7 5v17M17 5v17M2 12h20M2 19h20" stroke-dasharray="4 1.5 1 1.5"/><circle cx="7" cy="3.5" r="2"/><circle cx="17" cy="3.5" r="2"/>',
  arbeitsbuehne: '<path d="M2 9h20M2 12h20M4 12v10M20 12v10M2 9V3M22 9V3M2 3h20M12 9V3"/><path d="M6 22l4-10"/>',
  windverband: '<path d="M3 3h18v18H3z"/><path d="M3 3l18 18M21 3L3 21"/><path d="M6 16l2 2" stroke-width="3"/>',
  balkon: '<path d="M3 3v18"/><path d="M3 13h18v2H3"/><path d="M20 15v6M7 13V7h14v6"/><path d="M11 7v6M15 7v6"/>',
  spindel: '<circle cx="12" cy="12" r="1.6"/><path d="M12 12L20 9M12 12l5 7M12 12l-4 8M12 12L4 14M12 12l-3-8"/><circle cx="12" cy="12" r="9" stroke-width="1"/>',
  clean: '<path d="M14 4l6 6"/><path d="M12 6l6 6-7 7H6l-3-3z"/><path d="M8 20h13"/>',
  platte: '<path d="M4 4h6v16H4z"/><path d="M10 9h11v6H10"/><circle cx="7" cy="7" r="1"/><circle cx="7" cy="17" r="1"/>',
  rippe: '<path d="M4 3v18"/><path d="M4 21h17"/><path d="M4 7l13 14"/><path d="M4 10v-3"/>',
  kantteil: '<path d="M4 7v10h16V7"/><path d="M7 7v7h10V7" stroke-width="1"/>',
  contourflange: '<path d="M3 18h6l4-8h8"/><path d="M3 15h5l4-8h9" stroke-width="1"/><circle cx="9" cy="18" r="1.2"/><circle cx="13" cy="10" r="1.2"/>',
  flange: '<path d="M3 17h12v-9"/><path d="M15 17q3 0 3-3V5" stroke-width="1"/><path d="M17 5l1.5-2 1.5 2" stroke-width="1"/>',
  path3d: '<path d="M3 19l6-4 4 2 7-11"/><circle cx="3" cy="19" r="1.3"/><circle cx="9" cy="15" r="1.3"/><circle cx="13" cy="17" r="1.3"/><circle cx="20" cy="6" r="1.3"/>',
  tabslot: '<path d="M3 15h18v5H3z"/><path d="M9 15V4h6v11"/><path d="M10 15v3h4v-3"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14h18M9 4v16"/>',
  rules: '<path d="M4 6h4M4 12h4M4 18h4"/><path d="M11 6l2 2 4-4M11 12h9M11 18h9"/>',
  macro: '<path d="M5 4l7 8-7 8"/><path d="M13 20h7"/>',
  derive: '<rect x="3" y="4" width="8" height="8" rx="1"/><rect x="13" y="12" width="8" height="8" rx="1" stroke-dasharray="2 1.5"/><path d="M11 8h4v4"/>',
  hem: '<path d="M3 16h14a3 3 0 0 0 0-6H8"/><path d="M3 13h14" stroke-width="1"/>',
  collar: '<path d="M3 16h6v-6M15 10v6h6"/><path d="M9 10h6" stroke-dasharray="2 1.5" stroke-width="1"/>',
  bolt: '<path d="M8 3h8v4H8z"/><path d="M10 7v14h4V7"/><path d="M10 10l4 1.5M10 13l4 1.5M10 16l4 1.5"/><path d="M5 17h14v3H5z" stroke-width="1"/>',
  cornerseam: '<path d="M4 20V8h12"/><path d="M8 20V12h12"/><path d="M16 8l3 3" stroke-dasharray="2 1.5" stroke-width="1"/>',
  punch: '<rect x="3" y="5" width="18" height="14" rx="1"/><rect x="7" y="10" width="10" height="4" rx="2"/><circle cx="6.5" cy="8" r="1"/>',
  contourroll: '<ellipse cx="7" cy="12" rx="3" ry="7"/><path d="M7 5h10M7 19h10"/><path d="M17 5a3 7 0 0 1 0 14" />',
  rip: '<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12a7 2.5 0 0 0 14 0V6"/><path d="M11 8.4v12M13 8.4v12" stroke-width="1"/>',
  normteil: '<path d="M8 3h8l2 3-2 3H8L6 6z"/><path d="M10 9v12h4V9"/><path d="M10 12l4 1.5M10 15l4 1.5M10 18l4 1.5"/>',
  regelkoerper: '<circle cx="7" cy="8" r="4"/><path d="M14 20l4-12 4 12z"/><path d="M2 20h9v-6H2z"/>',
  biegerohr: '<path d="M3 20V12a5 5 0 0 1 5-5h6a4 4 0 0 0 4-4"/><path d="M7 20v-8a1 1 0 0 1 1-1h6a8 8 0 0 0 8-8"/>',
  profilzug: '<path d="M3 19l6-4 4 3 8-12"/><circle cx="3" cy="19" r="1.5"/><circle cx="9" cy="15" r="1.5"/><circle cx="13" cy="18" r="1.5"/><circle cx="21" cy="6" r="1.5"/>',
  knick: '<path d="M3 20l7-7h11"/><path d="M3 14l5-5h13"/><path d="M9 10l2 7"/>',
  frame: '<path d="M4 4h16v16H4z"/><path d="M7 7h10v10H7z"/><path d="M4 4l3 3M20 4l-3 3M4 20l3-3M20 20l-3-3"/>',
  fillet: '<path d="M4 20V10a6 6 0 0 1 6-6h10"/><path d="M4 4h4M4 4v4" opacity=".4"/>',
  chamfer: '<path d="M4 20V10l6-6h10"/><path d="M4 4h6M4 4v6" opacity=".4"/>',
  shell: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M7 9.5l5-2.5 5 2.5v5l-5 2.5-5-2.5z"/>',
  pattern: '<rect x="3" y="3" width="5" height="5"/><rect x="10" y="3" width="5" height="5"/><rect x="17" y="3" width="4" height="5"/><rect x="3" y="10" width="5" height="5"/><rect x="10" y="10" width="5" height="5"/><rect x="3" y="17" width="5" height="4"/>',
  sweep: '<path d="M4 18c4 0 6-12 16-12" stroke-dasharray="3 2"/><ellipse cx="4" cy="15" rx="1.8" ry="3.5"/><ellipse cx="20" cy="6" rx="1.8" ry="3.5"/>',
  loft: '<rect x="3" y="15" width="12" height="5" rx="1"/><rect x="8" y="4" width="8" height="3" rx="1"/><path d="M3 15l5-8M15 15l1-8"/>',
  coil: '<path d="M6 4c8 0 8 3 0 3s-8 3 0 3 8 3 0 3-8 3 0 3 8 3 0 3"/><path d="M18 3v18" stroke-dasharray="2 2"/>',
  pathpattern: '<path d="M3 19c5-1 8-14 18-14" stroke-dasharray="2 2"/><circle cx="5" cy="18" r="2"/><circle cx="12" cy="11" r="2"/><circle cx="19" cy="6" r="2"/>',
  combine: '<rect x="3" y="7" width="11" height="11" rx="1"/><circle cx="15" cy="10" r="6"/>',
  thicken: '<path d="M3 15l9-5 9 5"/><path d="M3 19l9-5 9 5"/><path d="M12 4v5" stroke-dasharray="2 2"/>',
  facepick: '<path d="M3 14l7-3.5 7 3.5-7 3.5z" fill="currentColor" fill-opacity=".25"/><path d="M14 4l2 9 2-3 3 3 1-1-3-3 3-2z"/>',
  direct: '<path d="M3 15l6-3 6 3-6 3z"/><path d="M15 12V4M12.5 6.5L15 4l2.5 2.5"/><path d="M15 12l5 2.5M18 12l2 2.5-3 .5"/>',
  facesize: '<ellipse cx="10" cy="7" rx="6" ry="2.5"/><path d="M4 7v10a6 2.5 0 0 0 12 0V7"/><path d="M17 12h5M20 10l2 2-2 2"/>',
  facerot: '<path d="M4 18l8-4 8 4"/><path d="M6 10l8-5"/><path d="M17 4a8 8 0 0 1 2 7M19 11l-2.5-1M19 11l1.5-2.4"/>',
  facedel: '<path d="M3 14l7-3.5 7 3.5-7 3.5z"/><path d="M15 3l6 6M21 3l-6 6"/>',
  facerep: '<path d="M3 15l6-3 6 3-6 3z"/><path d="M9 4l6-3 6 3-6 3z" stroke-dasharray="2 2"/><path d="M15 10v4l-2-1.5M15 14l2-1.5"/>',
  pushpull: '<rect x="4" y="12" width="16" height="8" rx="1"/><path d="M12 11V3M9 6l3-3 3 3"/>',
  draft: '<path d="M6 20l3-16h6l3 16z"/><path d="M4 20h16" stroke-dasharray="2 2"/>',
  insert: '<path d="M8 3h8v3H8z"/><path d="M10 6v10M14 6v10"/><path d="M3 13h6M15 13h6" /><path d="M3 18h18" stroke-dasharray="2 2"/>',
  angle: '<path d="M4 20h16M4 20L16 6"/><path d="M10 20a6 6 0 0 0-2-4.5"/>',
  endcap: '<path d="M3 9h12v6H3z"/><path d="M15 7h4v10h-4z"/>',
  stretch: '<path d="M3 18c0-6 3-9 9-9"/><path d="M14 9h7"/><path d="M3 21h18"/><circle cx="8" cy="21" r=".8"/><circle cx="15" cy="21" r=".8"/>',
  qr: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3z"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 20h2M20 14v2"/>',
  ventholes: '<path d="M2 8h20v8H2z"/><circle cx="6" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>',
  simplify: '<path d="M3 7h8v10H3z"/><path d="M14 9l3 3-3 3"/><path d="M17 12h4"/><circle cx="7" cy="12" r="1.5"/>',
  circpattern: '<circle cx="12" cy="12" r="8" stroke-dasharray="2 2"/><circle cx="12" cy="4" r="2"/><circle cx="19" cy="15" r="2"/><circle cx="5" cy="15" r="2"/>',
  mirror: '<path d="M12 3v18" stroke-dasharray="3 2"/><path d="M9 6L3 18h6zM15 6l6 12h-6z"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  import: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/>',
  export: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 17v3h16v-3"/>',
  params: '<path d="M5 19c3 0 3-14 6-14M4 10h7"/><path d="M14 11l6 8M20 11l-6 8"/>',
  line: '<path d="M4 20L20 4"/><circle cx="4" cy="20" r="1.5"/><circle cx="20" cy="4" r="1.5"/>',
  rect: '<rect x="4" y="6" width="16" height="12"/>',
  rectc: '<rect x="4" y="6" width="16" height="12"/><path d="M12 10v4M10 12h4"/>',
  circle: '<circle cx="12" cy="12" r="8"/><path d="M12 12h8" stroke-dasharray="2 1.5"/>',
  spline: '<path d="M3 18c3-9 6-12 9-6s6 3 9-6"/><path d="M3 18l5-11M8 7l8 10M16 17l5-11" stroke-dasharray="1.5 1.5" stroke-width="1"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="5.5" transform="rotate(-20 12 12)"/><path d="M12 12l8.4-3" stroke-dasharray="2 1.5"/>',
  arc: '<path d="M4 18a9 9 0 0 1 16 0"/><circle cx="4" cy="18" r="1.4"/><circle cx="20" cy="18" r="1.4"/><circle cx="12" cy="7" r="1.4"/>',
  arcc: '<path d="M18 12a6 6 0 0 0-6-6"/><circle cx="12" cy="12" r="1.4"/><path d="M12 12L18 12M12 12V6" stroke-dasharray="2 1.5"/>',
  dof: '<circle cx="12" cy="12" r="2"/><path d="M12 9V3M12 15v6M9 12H3M15 12h6M12 3l-2 2M12 3l2 2M12 21l-2-2M12 21l2-2M3 12l2-2M3 12l2 2M21 12l-2-2M21 12l-2 2"/>',
  rect3: '<path d="M4 15 13 5 20 11 11 21Z"/><circle cx="4" cy="15" r="1.6"/><circle cx="13" cy="5" r="1.6"/><circle cx="20" cy="11" r="1.6"/>',
  circlet3: '<path d="M2 20h20M4 22 13 2M20 22 11 2"/><circle cx="12" cy="14.5" r="4.5"/>',
  circle3: '<circle cx="12" cy="12" r="8"/><circle cx="4" cy="12" r="1.6"/><circle cx="17.7" cy="6.3" r="1.6"/><circle cx="17.7" cy="17.7" r="1.6"/>',
  arct: '<path d="M3 18h9a6 6 0 0 0 6-6V5"/><circle cx="12" cy="18" r="1.4"/>',
  point: '<circle cx="12" cy="12" r="3"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>',
  construct: '<path d="M4 20L20 4" stroke-dasharray="3 2"/>',
  dimension: '<path d="M4 8v10M20 8v10M4 14h16"/><path d="M7 12l-3 2 3 2M17 12l3 2-3 2"/>',
  horizontal: '<path d="M3 12h18"/><path d="M8 9h8" opacity=".4"/>',
  vertical: '<path d="M12 3v18"/>',
  coincident: '<circle cx="9" cy="12" r="4"/><circle cx="15" cy="12" r="4"/>',
  parallel: '<path d="M6 20L14 4M11 20L19 4"/>',
  perpendicular: '<path d="M4 20h16M12 20V4"/>',
  equal: '<path d="M5 9h14M5 15h14"/>',
  tangent: '<circle cx="10" cy="13" r="6"/><path d="M3 7h18"/>',
  fix: '<path d="M8 4h8l-1 6 3 3H6l3-3zM12 13v8"/>',
  midpoint: '<path d="M3 16h18"/><path d="M12 10v6M9 13l3 3 3-3"/>',
  concentric: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
  hinge: '<path d="M6 3v18"/><rect x="4" y="5" width="4" height="4" rx="1"/><rect x="4" y="15" width="4" height="4" rx="1"/><path d="M8 7l11 3v9L8 17"/><path d="M15 4a8 8 0 0 1 5 5"/>',
  ifeature: '<path d="M4 4h7v7H4z"/><path d="M14 4l6 3.5-6 3.5z"/><circle cx="7.5" cy="17" r="3.5"/><path d="M14 14h6v6h-6z" stroke-dasharray="2 1.5"/>',
  weldasm: '<rect x="3" y="15" width="18" height="5" rx="1"/><rect x="10" y="4" width="4" height="11"/><path d="M8 15l2-2.5M16 15l-2-2.5"/>',
  area: '<path d="M4 18l4-12 6 4 6-6v14z"/><path d="M8 14h2M12 16h2" stroke-dasharray="1 1.5"/>',
  draftan: '<path d="M6 20l3-14h6l3 14z"/><path d="M12 2v5M10 4l2-2 2 2"/>',
  shaft: '<path d="M3 10h4v4H3zM7 8h10v8H7zM17 10h4v4h-4z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="6.5"/>',
  bearing: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="5.5" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/><circle cx="12" cy="18.5" r="1.3"/><circle cx="5.5" cy="12" r="1.3"/>',
  spring: '<path d="M12 2v2M12 20v2M7 4h10l-10 4h10l-10 4h10l-10 4h10l-10 4h10"/>',
  contact: '<rect x="3" y="11" width="8" height="8" rx="1"/><rect x="13" y="5" width="8" height="8" rx="1"/><path d="M11 13l2-2"/><path d="M12 3v2M18 15v2"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/><circle cx="9.5" cy="12" r="2"/>',
  motion: '<path d="M4 18a10 10 0 0 1 16 0"/><path d="M17 14l3 4-4.5 1"/><circle cx="12" cy="18" r="1.5"/>',
  explode: '<rect x="9" y="9" width="6" height="6"/><path d="M4 4l3 3M20 4l-3 3M4 20l3-3M20 20l-3-3"/><path d="M4 4h3M4 4v3M20 4h-3M20 4v3M4 20h3M4 20v-3M20 20h-3M20 20v-3"/>',
  collinear: '<path d="M2 12h8M14 12h8"/>',
  symmetric: '<path d="M12 3v18" stroke-dasharray="3 2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="12" r="2"/>',
  project: '<path d="M4 18l8-4 8 4"/><path d="M12 4v10" stroke-dasharray="2 2"/><path d="M9 11l3 3 3-3"/>',
  finish: '<path d="M5 12l5 5 9-10"/>',
  cancel: '<path d="M6 6l12 12M18 6L6 18"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  save: '<path d="M5 3h11l4 4v14H5z"/><path d="M8 3v6h8V3M8 21v-7h9v7"/>',
  open: '<path d="M3 7h6l2 2h10v10H3z"/>',
  new: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M12 11v7M8.5 14.5h7"/>',
  place: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M12 9v6M9 12h6"/>',
  align: '<rect x="4" y="13" width="16" height="6"/><rect x="7" y="4" width="10" height="6"/><path d="M12 10v3"/>',
  move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
  bom: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  detail: '<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5L21 21"/>',
  cut: '<path d="M4 20l7-7M20 20l-7-7"/><circle cx="7" cy="6" r="3"/><circle cx="17" cy="6" r="3"/><path d="M9 8l3 5 3-5"/>',
  view: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M7 15l4-4 3 3 3-3"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  pdf: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/><path d="M9 13h2a1.5 1.5 0 0 1 0 3H9v-4zM9 16v2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M2 12s4-7 10-7c2 0 3.8.8 5.2 1.8M22 12s-4 7-10 7c-2 0-3.8-.8-5.2-1.8M3 3l18 18"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  slot: '<path d="M8 7h8a5 5 0 010 10H8A5 5 0 018 7z"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/>',
  polygon: '<path d="M12 3l8 4.6v8.8L12 21l-8-4.6V7.6z"/>',
  offset: '<path d="M5 19V9a4 4 0 014-4h10"/><path d="M9 19v-8a2 2 0 012-2h8" stroke-dasharray="2 2"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 014.5 5H9l2 2.5h8.5A1.5 1.5 0 0121 9v8.5a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 17.5z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  origin: '<path d="M12 12h9M12 12V3M12 12l-7 7"/><circle cx="12" cy="12" r="1.5"/>',
  plane: '<path d="M3 16l6-9h12l-6 9z"/>',
  axis: '<path d="M4 20L20 4" stroke-dasharray="4 2"/>',
  update: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
  warn: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  steel: '<path d="M3 17h18M5 17V9l7-4 7 4v8"/><path d="M9 17v-5h6v5"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01" stroke-width="2.4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.6M12 17h.01"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
  tiles: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  grid: '<path d="M4 4h16v16H4zM4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16"/>',
  trim: '<path d="M4 20L20 4"/><path d="M4 4l16 16" stroke-dasharray="2 2"/>',
  extend: '<path d="M3 12h10"/><path d="M13 12h6" stroke-dasharray="2 2"/><path d="M20 5v14"/>',
  split: '<path d="M3 18L10 11"/><path d="M14 7l7-4"/><circle cx="12" cy="9" r="1.6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M4 16V4h12"/>',
  rotate: '<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v5h5"/><circle cx="12" cy="12" r="1.5"/>',
  // OP3: eigene Symbole statt eines Symbols für viele Befehle
  viewIso: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/><path d="M12 12L4 7.5 12 3l8 4.5z" fill="currentColor" fill-opacity=".2" stroke="none"/>',
  viewFront: '<path d="M4 8h12v12H4zM8 4h12v12M4 8l4-4M16 8l4-4M16 20l4-4"/><path d="M8 4v12h12M8 16l-4 4" stroke-dasharray="1.5 2"/><path d="M4 8h12v12H4z" fill="currentColor" fill-opacity=".35" stroke="none"/>',
  viewBack: '<path d="M4 8h12v12H4zM8 4h12v12M4 8l4-4M16 8l4-4M16 20l4-4"/><path d="M8 4v12h12M8 16l-4 4" stroke-dasharray="1.5 2"/><path d="M8 4h12v12H8z" fill="currentColor" fill-opacity=".35" stroke="none"/>',
  viewTop: '<path d="M4 8h12v12H4zM8 4h12v12M4 8l4-4M16 8l4-4M16 20l4-4"/><path d="M8 4v12h12M8 16l-4 4" stroke-dasharray="1.5 2"/><path d="M4 8l4-4h12l-4 4z" fill="currentColor" fill-opacity=".35" stroke="none"/>',
  viewBottom: '<path d="M4 8h12v12H4zM8 4h12v12M4 8l4-4M16 8l4-4M16 20l4-4"/><path d="M8 4v12h12M8 16l-4 4" stroke-dasharray="1.5 2"/><path d="M4 20l4-4h12l-4 4z" fill="currentColor" fill-opacity=".35" stroke="none"/>',
  viewRight: '<path d="M4 8h12v12H4zM8 4h12v12M4 8l4-4M16 8l4-4M16 20l4-4"/><path d="M8 4v12h12M8 16l-4 4" stroke-dasharray="1.5 2"/><path d="M16 8l4-4v12l-4 4z" fill="currentColor" fill-opacity=".35" stroke="none"/>',
  viewLeft: '<path d="M4 8h12v12H4zM8 4h12v12M4 8l4-4M16 8l4-4M16 20l4-4"/><path d="M8 4v12h12M8 16l-4 4" stroke-dasharray="1.5 2"/><path d="M4 8l4-4v12l-4 4z" fill="currentColor" fill-opacity=".35" stroke="none"/>',
  ortho: '<rect x="3" y="6" width="18" height="12"/><path d="M9 6v12M15 6v12"/>',
  persp: '<path d="M3 4l18 4v8L3 20z"/><path d="M9 5.3v13.4M15 6.7v10.6"/>',
  viewSave: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v8l3-2 3 2V3"/><path d="M7 17l3-3 2 2 3-3"/>',
  measure: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  cutlist: '<path d="M3 6h5M3 12h5M3 18h5" stroke-width="3"/><path d="M11 6h10M11 12h10M11 18h7"/>',
  baseViews: '<rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/>',
  projView: '<rect x="3" y="3" width="9" height="9"/><rect x="14" y="14" width="7" height="7" stroke-dasharray="2 2"/><path d="M12 12l3 3M15 12v3h-3"/>',
  auxView: '<rect x="3" y="11" width="9" height="9"/><path d="M14 9l4-4 3 3-4 4z"/><path d="M12 11l2-2"/>',
  selAll: '<rect x="2.5" y="2.5" width="19" height="19" rx="2" stroke-dasharray="3 2.5"/><path d="M8 7l9 5-4 1-1.5 4z"/>',
  selInvert: '<rect x="3" y="3" width="8" height="8" fill="currentColor" fill-opacity=".35"/><rect x="13" y="13" width="8" height="8"/><path d="M15 4a5 5 0 0 1 5 5M20 9l1-2.5M20 9l-2.5-.8M9 20a5 5 0 0 1-5-5M4 15l-1 2.5M4 15l2.5.8"/>',
  layout: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M8 4v16M16 4v16"/>',
  flush: '<rect x="4" y="4" width="7" height="14"/><rect x="13" y="9" width="7" height="9"/><path d="M2 18h20"/>',
  cylJoint: '<ellipse cx="12" cy="6" rx="6" ry="2.5"/><path d="M6 6v12M18 6v12M6 18a6 2.5 0 0 0 12 0"/><path d="M12 2v20" stroke-dasharray="2 2"/>',
  scale: '<rect x="3" y="11" width="10" height="10"/><path d="M13 11V3h8v8h-8"/><path d="M9 15l10-10M15 5h4v4"/>',
};

export function icon(name, cls = "") {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("fill", "none");
  s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "1.6");
  s.setAttribute("stroke-linecap", "round");
  s.setAttribute("stroke-linejoin", "round");
  if (cls) s.setAttribute("class", cls);
  s.innerHTML = P[name] || P.part;
  return s;
}

// ---------- Hinweise ----------
const TOAST_ICON = { ok: "finish", err: "warn", warn: "warn" };
export function toast(text, { kind = "", timeout = 4000, action = null } = {}) {
  const root = document.getElementById("toasts");
  // Ausblenden mit kurzer Animation; das Element ist danach sofort aus dem DOM
  const hide = () => { if (!el.isConnected || el.classList.contains("out")) return; el.classList.add("out"); setTimeout(() => el.remove(), 160); };
  const el = h("div", { class: "toast " + kind, role: kind === "err" ? "alert" : null },
    icon(TOAST_ICON[kind] || "info", "toast-ic"), h("span", { class: "toast-text" }, text));
  if (action) el.append(h("button", { onclick: () => { action.run(); el.remove(); } }, action.label));
  el.append(h("button", { class: "toast-x", title: "Schließen", "aria-label": "Meldung schließen", onclick: () => el.remove() }, icon("cancel")));
  root.append(el);
  if (timeout) setTimeout(hide, timeout);
  return el;
}

// ---------- Dialoge ----------
export function modal({ title, body, buttons = [], width, onClose }) {
  const root = document.getElementById("modal-root");
  let closed = false;
  const close = (v) => {
    if (closed) return;
    closed = true;
    bd.remove();
    document.removeEventListener("keydown", onKey, true);
    onClose && onClose(v);
  };
  const footer = h("footer");
  const dlg = h("div", { class: "dialog", role: "dialog", "aria-modal": "true", style: width ? { width } : undefined },
    h("header", {}, h("span", { class: "grow" }, title), h("button", { class: "icon-btn", title: "Schließen", onclick: () => close(undefined) }, icon("cancel"))),
    h("div", { class: "body" }, body),
    footer);
  for (const b of buttons) {
    footer.append(h("button", { class: "btn " + (b.primary ? "primary" : "") + (b.danger ? " danger" : ""), onclick: async () => {
      if (b.run) { const r = await b.run(); if (r === false) return; close(r === undefined ? b.value : r); } else close(b.value);
    } }, b.label));
  }
  const bd = h("div", { class: "backdrop", onmousedown: (e) => { if (e.target === bd) close(undefined); } }, dlg);
  const onKey = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(undefined); }
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
      const prim = buttons.find((b) => b.primary);
      if (prim) { e.preventDefault(); e.stopPropagation(); footer.querySelector(".btn.primary")?.click(); }
    }
  };
  document.addEventListener("keydown", onKey, true);
  root.append(bd);
  // erstes Feld fokussieren – aber nicht, wenn schon in den Dialog geklickt oder getippt wurde (sonst landet Eingabe im falschen Feld)
  setTimeout(() => { if (!dlg.contains(document.activeElement)) (dlg.querySelector("input,select,textarea") || footer.querySelector(".btn.primary"))?.focus(); }, 20);
  return { close, el: dlg };
}

export function confirmDialog(title, text, { ok = "OK", danger = false } = {}) {
  return new Promise((res) => {
    modal({ title, body: h("p", { style: { margin: 0, maxWidth: "52ch" } }, text), onClose: (v) => res(!!v),
      buttons: [{ label: "Abbrechen", value: false }, { label: ok, value: true, primary: !danger, danger }] });
  });
}

export function promptDialog(title, label, value = "", { ok = "OK", validate } = {}) {
  return new Promise((res) => {
    const inp = h("input", { class: "inp", value });
    const err = h("div", { class: "hint" });
    modal({
      title,
      body: h("div", {}, h("div", { class: "field wide" }, h("label", {}, label), inp), err),
      onClose: (v) => res(v),
      buttons: [{ label: "Abbrechen", value: null }, { label: ok, primary: true, run: () => {
        const v = inp.value.trim();
        const m = validate ? validate(v) : null;
        if (m) { err.textContent = m; inp.classList.add("bad"); return false; }
        return v;
      } }],
    });
    setTimeout(() => inp.select(), 30);
  });
}

export function choiceDialog(title, text, choices) {
  return new Promise((res) => {
    modal({ title, body: h("p", { style: { margin: 0, maxWidth: "56ch" } }, text), onClose: (v) => res(v ?? null),
      buttons: choices.map((c, i) => ({ label: c.label, value: c.value, primary: !!c.primary })) });
  });
}

// ---------- Kontextmenü ----------
let openMenu = null;
export function contextMenu(x, y, items) {
  closeMenu();
  const m = h("div", { class: "menu", role: "menu" });
  for (const it of items) {
    if (it === "-") { m.append(h("hr")); continue; }
    if (!it) continue;
    m.append(h("button", { role: "menuitem", disabled: it.disabled, onclick: () => { closeMenu(); it.run(); } },
      it.icon ? icon(it.icon) : null, h("span", {}, it.label), it.kbd ? h("span", { class: "kbd" }, it.kbd) : null));
  }
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 4) + "px";
  m.style.top = Math.min(y, innerHeight - r.height - 4) + "px";
  openMenu = m;
  setTimeout(() => document.addEventListener("mousedown", onDocDown, true), 0);
  return m;
}

// Markierungsmenü (wie Inventor): bis zu 8 Befehle im Kreis um den Mauszeiger, Reihenfolge N, NO, O, SO, S, SW, W, NW
// (null lässt eine Richtung frei); seltene Befehle als Liste darunter. Die Richtung, in die die Maus vom Mittelpunkt
// wegzeigt, ist vorgewählt – ein Klick irgendwo in diesem Sektor führt den Befehl aus.
const RING_DIRS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
export function markingMenu(x, y, ring, list = []) {
  closeMenu();
  const R = 96;
  const m = h("div", { class: "marking", role: "menu", "aria-label": "Markierungsmenü" });
  const run = (it) => { closeMenu(); it.run(); };
  const slots = ring.slice(0, 8).map((it, i) => {
    if (!it) return null;
    const a = (i * Math.PI) / 4;
    const b = h("button", { class: "mk-item mk-" + RING_DIRS[i], role: "menuitem", disabled: it.disabled, title: it.kbd ? `${it.label} (${it.kbd})` : null,
      style: { left: Math.sin(a) * R + "px", top: -Math.cos(a) * R + "px" }, onclick: (e) => { e.stopPropagation(); run(it); } },
      it.icon ? icon(it.icon) : null, h("span", {}, it.label));
    m.append(b);
    return { it, b };
  });
  m.prepend(h("div", { class: "mk-center", "aria-hidden": "true" }), h("div", { class: "mk-ring", "aria-hidden": "true" }));
  const rest = list.filter(Boolean);
  let sub = null;
  if (rest.some((x) => x !== "-")) {
    sub = h("div", { class: "menu mk-list", role: "menu" });
    for (const it of rest) {
      if (it === "-") { if (sub.lastChild && sub.lastChild.tagName !== "HR") sub.append(h("hr")); continue; }
      sub.append(h("button", { role: "menuitem", disabled: it.disabled, onclick: () => run(it) },
        it.icon ? icon(it.icon) : null, h("span", {}, it.label), it.kbd ? h("span", { class: "kbd" }, it.kbd) : null));
    }
    if (sub.lastChild?.tagName === "HR") sub.lastChild.remove();
    m.append(sub);
  }
  document.body.append(m);
  // Mittelpunkt so legen, dass Kreis und Liste ins Fenster passen
  const listH = sub ? sub.getBoundingClientRect().height : 0;
  const cx = Math.max(R + 90, Math.min(x, innerWidth - R - 90));
  const cy = Math.max(R + 24, Math.min(y, innerHeight - R - 30 - listH));
  m.style.left = cx + "px";
  m.style.top = cy + "px";
  if (sub) Object.assign(sub.style, { left: "-100px", top: R + 26 + "px" });
  let hot = null;
  const setHot = (s) => { if (hot === s) return; hot?.b.classList.remove("hot"); hot = s; hot?.b.classList.add("hot"); };
  const sector = (e) => {
    const dx = e.clientX - cx, dy = e.clientY - cy;
    if (Math.hypot(dx, dy) < 26) return null;
    const i = Math.round(((Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8;
    return slots[i] && !slots[i].it.disabled ? slots[i] : null;
  };
  const onMove = (e) => setHot(sub?.contains(e.target) ? null : sector(e));
  const onDown = (e) => {
    if (sub?.contains(e.target) || e.target.closest?.(".mk-item")) return;
    e.preventDefault(); e.stopPropagation();
    const s = e.button === 0 ? sector(e) : null;
    closeMenu();
    if (s) s.it.run();
  };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); closeMenu(); } };
  document.addEventListener("pointermove", onMove, true);
  m.cleanup = () => { document.removeEventListener("pointermove", onMove, true); document.removeEventListener("pointerdown", onDown, true); document.removeEventListener("keydown", onKey, true); };
  openMenu = m;
  // pointerdown im Erfassen: der Klick, der das Menü schließt, wählt nichts im 3D-Fenster
  setTimeout(() => { if (openMenu === m) { document.addEventListener("pointerdown", onDown, true); document.addEventListener("keydown", onKey, true); } }, 0);
  return m;
}
function onDocDown(e) { if (openMenu && !openMenu.contains(e.target)) closeMenu(); }
export function closeMenu() {
  if (openMenu) { openMenu.cleanup?.(); openMenu.remove(); openMenu = null; document.removeEventListener("mousedown", onDocDown, true); }
}

export function fmtNum(v, d = 2) {
  if (!Number.isFinite(v)) return "–";
  return (Math.round(v * 10 ** d) / 10 ** d).toLocaleString("de-DE", { maximumFractionDigits: d });
}

export function downloadBlob(blob, name) {
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
