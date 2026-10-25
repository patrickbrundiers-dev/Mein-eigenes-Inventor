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
  treppe: '<path d="M3 21h4v-4h4v-4h4V9h4V5h2"/><path d="M3 17L19 3" stroke-width="1.2"/>',
  rahmenecke: '<path d="M5 21V5h4v16"/><path d="M9 7l12-3v4L9 11"/><path d="M9 4v9"/>',
  pfette: '<path d="M2 9h20v4H2z"/><path d="M6 13v6M18 13v6"/><path d="M4 19h4M16 19h4"/>',
  windverband: '<path d="M3 3h18v18H3z"/><path d="M3 3l18 18M21 3L3 21"/><path d="M6 16l2 2" stroke-width="3"/>',
  balkon: '<path d="M3 3v18"/><path d="M3 13h18v2H3"/><path d="M20 15v6M7 13V7h14v6"/><path d="M11 7v6M15 7v6"/>',
  spindel: '<circle cx="12" cy="12" r="1.6"/><path d="M12 12L20 9M12 12l5 7M12 12l-4 8M12 12L4 14M12 12l-3-8"/><circle cx="12" cy="12" r="9" stroke-width="1"/>',
  clean: '<path d="M14 4l6 6"/><path d="M12 6l6 6-7 7H6l-3-3z"/><path d="M8 20h13"/>',
  platte: '<path d="M4 4h6v16H4z"/><path d="M10 9h11v6H10"/><circle cx="7" cy="7" r="1"/><circle cx="7" cy="17" r="1"/>',
  rippe: '<path d="M4 3v18"/><path d="M4 21h17"/><path d="M4 7l13 14"/><path d="M4 10v-3"/>',
  kantteil: '<path d="M4 7v10h16V7"/><path d="M7 7v7h10V7" stroke-width="1"/>',
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
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  origin: '<path d="M12 12h9M12 12V3M12 12l-7 7"/><circle cx="12" cy="12" r="1.5"/>',
  plane: '<path d="M3 16l6-9h12l-6 9z"/>',
  axis: '<path d="M4 20L20 4" stroke-dasharray="4 2"/>',
  update: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  steel: '<path d="M3 17h18M5 17V9l7-4 7 4v8"/><path d="M9 17v-5h6v5"/>',
  grid: '<path d="M4 4h16v16H4zM4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16"/>',
  trim: '<path d="M4 20L20 4"/><path d="M4 4l16 16" stroke-dasharray="2 2"/>',
  extend: '<path d="M3 12h10"/><path d="M13 12h6" stroke-dasharray="2 2"/><path d="M20 5v14"/>',
  split: '<path d="M3 18L10 11"/><path d="M14 7l7-4"/><circle cx="12" cy="9" r="1.6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M4 16V4h12"/>',
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
export function toast(text, { kind = "", timeout = 4000, action = null } = {}) {
  const root = document.getElementById("toasts");
  const el = h("div", { class: "toast " + kind }, h("span", {}, text));
  if (action) el.append(h("button", { onclick: () => { action.run(); el.remove(); } }, action.label));
  root.append(el);
  if (timeout) setTimeout(() => el.remove(), timeout);
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
function onDocDown(e) { if (openMenu && !openMenu.contains(e.target)) closeMenu(); }
export function closeMenu() {
  if (openMenu) { openMenu.remove(); openMenu = null; document.removeEventListener("mousedown", onDocDown, true); }
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
