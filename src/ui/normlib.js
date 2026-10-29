// Normteil-Bibliothek in der Oberfläche (wie Inventor Inhaltscenter): Dialog mit Kategorien, Suche (auch alte
// DIN-Nummern), Vorschau, Masse und Bezeichnung; Einfügen in die Baugruppe (als eigenes Bauteil je Bezeichnung),
// an einer Bohrung mit Abhängigkeit »Einfügen« (auch als Garnitur mit Scheiben und Mutter) und als Feature im
// Bauteil. Eigene Normteile liegen je Rechner in der Ablage und werden als JSON-Datei ausgetauscht.

import { h, toast, modal, fmtNum, downloadBlob, confirmDialog } from "./dom.js";
import { uid, newPart } from "../core/examples.js";
import { NORM_FAMILIES, NORM_CATEGORIES, TEMPLATES, customFamily, validateFamily, searchFamilies, lengthsFor, familyMass, normRecipe, recipeOutline, gradeInfo, familyOf } from "../core/normlib.js";
import { normDesignation, checkNorm, defaultNormteil } from "../core/normteile.js";
import { holeFrame, holeToWorld, holeParts, partPlacement, normInsertInfo, insertable } from "../core/normeinbau.js";
import { insertRef, endFaceFor, worldToLocal, solveAssembly } from "../core/asmsolve.js";
import { classifyHit } from "./abhaengigkeit.js";
import { v3 } from "../core/geom.js";

const KEY_CUSTOM = "pbcad.normteile.eigene", KEY_RECENT = "pbcad.normteile.zuletzt";
const read = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

/** Eigene Normteile (geprüft) */
export const listCustom = () => read(KEY_CUSTOM).filter((x) => validateFamily(x).ok);
function customById(id) { return listCustom().find((x) => "custom:" + x.id === id) || null; }
function allFamilies() {
  const own = [];
  for (const x of listCustom()) { try { own.push(customFamily(x)); } catch { /* ungültig: übergehen */ } }
  return [...Object.values(NORM_FAMILIES), ...own];
}
function remember(sel) {
  const key = `${sel.kind}|${sel.size}|${sel.length}|${sel.grade}`;
  write(KEY_RECENT, [{ ...sel, key }, ...read(KEY_RECENT).filter((x) => x.key !== key)].slice(0, 8));
}

/** Auswahl → vollständig (Größe, Länge, Werkstoff gültig für die Familie) */
function normalize(sel) {
  const fam = familyOf(sel.kind, sel.custom);
  if (!fam) return { ...defaultNormteil("schraube4017"), qty: 1 };
  const size = fam.sizes[sel.size] ? sel.size : defaultNormteil(fam.id, sel.custom).size;
  const list = lengthsFor(fam, size);
  const length = fam.length ? (Number(sel.length) > 0 ? String(sel.length) : String(list[Math.floor(list.length / 2)] ?? 40)) : "40";
  const grade = fam.grades.includes(sel.grade) ? sel.grade : fam.grades[0];
  return { ...sel, size, length, grade };
}

/** Seitenansicht des Rezepts als SVG */
function previewSvg(fam, size, L) {
  let polys;
  try { polys = recipeOutline(normRecipe(fam, size, Number(L) || 0)); } catch { return h("div", { class: "hint" }, "keine Vorschau"); }
  const xs = polys.flatMap((p) => p.pts.map((q) => q[0])), zs = polys.flatMap((p) => p.pts.map((q) => q[1]));
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const w = x1 - x0 || 1, hh = z1 - z0 || 1, pad = Math.max(w, hh) * 0.06;
  const svg = h("svg", { svg: true, class: "normlib-prev", viewBox: `${x0 - pad} ${z0 - pad} ${w + 2 * pad} ${hh + 2 * pad}`, preserveAspectRatio: "xMidYMid meet" });
  const sw = Math.max(w, hh) / 220;
  for (const p of polys) svg.append(h("polygon", { svg: true, points: p.pts.map((q) => q.join(",")).join(" "), class: p.cut ? "cut" : "add", "stroke-width": sw }));
  svg.append(h("line", { svg: true, x1: x0 - pad, x2: x1 + pad, y1: 0, y2: 0, class: "seat", "stroke-width": sw }));
  return svg;
}

/**
 * Bibliotheksdialog. mode: "assembly" (Einfügen/An Bohrung), "part" (neues Feature), "feature" (Feature ändern).
 * onApply(sel) für part/feature; in der Baugruppe fügt der Dialog selbst ein.
 */
export function normLibraryDialog(app, { mode = "assembly", initial = null, onApply = null } = {}) {
  const st = { cat: null, q: "", sel: normalize({ ...defaultNormteil(initial?.kind && familyOf(initial.kind, initial.custom) ? initial.kind : "schraube4017", initial?.custom), ...(initial || {}), qty: 1, garnitur: true, auto: true, clamp: "" }) };
  const left = h("div", { class: "normlib-cats" }), mid = h("div", { class: "normlib-list" }), right = h("div", { class: "normlib-detail" });
  const search = h("input", { class: "inp", placeholder: "Suchen: DIN 933, Senkschraube, M8 …", value: "", oninput: (e) => { st.q = e.target.value; st.cat = null; drawList(); drawCats(); } });
  const fams = allFamilies();
  const famOf = (id) => fams.find((f) => f.id === id) || familyOf(id, st.sel.custom);
  const drawCats = () => {
    const recent = read(KEY_RECENT).filter((x) => famOf(x.kind));
    const item = (key, label, n) => h("button", { class: "normlib-cat" + (st.cat === key ? " on" : ""), onclick: () => { st.cat = key; st.q = ""; search.value = ""; drawCats(); drawList(); } }, h("span", { class: "grow" }, label), n != null ? h("span", { class: "muted" }, String(n)) : null);
    left.replaceChildren(search,
      ...NORM_CATEGORIES.map(([k, l]) => item(k, l, fams.filter((f) => f.cat === k).length)),
      item("eigene", "Eigene Normteile", fams.filter((f) => f.custom).length),
      recent.length ? h("div", { class: "normlib-sub" }, "Zuletzt verwendet") : null,
      ...recent.map((r) => h("button", { class: "normlib-recent", title: normDesignation(r), onclick: () => { st.sel = normalize({ ...st.sel, ...r }); st.cat = famOf(r.kind).custom ? "eigene" : famOf(r.kind).cat; drawCats(); drawList(); drawDetail(); } }, normDesignation(r))));
  };
  const drawList = () => {
    const list = st.q ? searchFamilies(st.q, fams) : st.cat === "eigene" ? fams.filter((f) => f.custom) : st.cat ? fams.filter((f) => f.cat === st.cat && !f.custom) : searchFamilies("", fams).filter((f) => f.cat === famOf(st.sel.kind)?.cat);
    mid.replaceChildren(...(list.length ? list : [null]).map((f) => (f ? h("button", { class: "normlib-fam" + (f.id === st.sel.kind ? " on" : ""), onclick: () => { st.sel = normalize({ ...st.sel, kind: f.id, custom: f.custom ? customById(f.id) : undefined, size: st.sel.size, length: "" }); drawList(); drawDetail(); } },
      h("b", {}, f.label), h("span", { class: "muted" }, [f.norm, ...(f.alias || [])].join(" · ") + ` · ${f.sizeList[0]}–${f.sizeList.at(-1)}`)) : h("p", { class: "hint" }, st.cat === "eigene" ? "Noch keine eigenen Normteile – über »Eigene Normteile …« eine JSON-Datei übernehmen." : "Nichts gefunden."))));
    if (!st.cat && !st.q) st.cat = famOf(st.sel.kind)?.custom ? "eigene" : famOf(st.sel.kind)?.cat;
  };
  const sel = (opts, val, on) => { const s = h("select", { class: "inp" }, ...opts.map(([v, l]) => h("option", { value: v, selected: v === val ? true : undefined }, l))); s.value = val; s.addEventListener("change", () => on(s.value)); return s; };
  const field = (label, input) => h("div", { class: "field" }, h("label", {}, label), input);
  const drawDetail = () => {
    const s = st.sel, fam = famOf(s.kind);
    if (!fam) return right.replaceChildren(h("p", { class: "hint" }, "Normteil wählen"));
    const list = lengthsFor(fam, s.size);
    const L = Number(s.length);
    let warn = [];
    try { warn = checkNorm(s.kind, s.size, fam.length ? L : 0, s.custom); } catch (e) { warn = [e.message]; }
    let mass = NaN;
    try { mass = familyMass(fam, s.size, fam.length ? L : 0, s.grade); } catch { /* Vorschau ohne Masse */ }
    const lenInp = h("input", { class: "inp", type: "number", min: 1, step: "any", value: s.length, onchange: (e) => { s.length = e.target.value; drawDetail(); } });
    right.replaceChildren(
      h("h4", {}, fam.label),
      h("div", { class: "muted" }, [fam.norm, ...(fam.alias || []).map((a) => `früher ${a}`)].join(" · ")),
      previewSvg(fam, s.size, fam.length ? L : 0),
      field("Größe", sel(fam.sizeList.map((k) => [k, (fam.sizePrefix || "") + k]), s.size, (v) => { s.size = v; if (fam.length && !lengthsFor(fam, v).includes(Number(s.length))) s.length = ""; st.sel = normalize(s); drawDetail(); })),
      fam.length ? field(fam.freeLength ? "Länge mm" : "Nennlänge mm", h("div", { class: "normlib-len" }, list.length && !fam.freeLength ? sel([["", "…"], ...list.map((l) => [String(l), String(l)])], list.includes(L) ? String(L) : "", (v) => { if (v) { s.length = v; drawDetail(); } }) : null, lenInp)) : null,
      field("Festigkeit / Werkstoff", sel(fam.grades.map((g) => [g, g]), s.grade, (v) => { s.grade = v; drawDetail(); })),
      fam.noGalv ? null : h("label", { class: "chk" }, h("input", { type: "checkbox", checked: !!s.galv, onchange: (e) => { s.galv = e.target.checked; drawDetail(); } }), "feuerverzinkt (tZn)"),
      h("dl", { class: "kv" },
        h("dt", {}, "Bezeichnung"), h("dd", {}, h("b", {}, normDesignation(s))),
        h("dt", {}, "Werkstoff"), h("dd", {}, gradeInfo(s.grade).label),
        h("dt", {}, "Masse"), h("dd", {}, Number.isFinite(mass) ? `${fmtNum(mass * 1000, 1)} g/Stk` : "–")),
      warn.length ? h("p", { class: "hint warn" }, warn.join("; ")) : null,
      mode === "assembly" ? h("div", { class: "normlib-asm" },
        field("Anzahl", h("input", { class: "inp normlib-qty", type: "number", min: 1, max: 100, value: s.qty || 1, onchange: (e) => { s.qty = e.target.value; } })),
        h("div", { class: "normlib-sub" }, "An Bohrung"),
        h("label", { class: "chk" }, h("input", { type: "checkbox", checked: s.auto !== false, onchange: (e) => { s.auto = e.target.checked; } }), "Größe und Länge aus der Bohrung"),
        fam.garnitur ? h("label", { class: "chk" }, h("input", { type: "checkbox", checked: s.garnitur !== false, onchange: (e) => { s.garnitur = e.target.checked; } }), fam.garnitur.washerHead ? "mit Scheiben und Mutter (Garnitur)" : "mit Scheibe und Mutter") : null,
        field("Klemmlänge mm", h("input", { class: "inp", type: "number", min: 0, step: "any", placeholder: "aus Bohrungstiefe", value: s.clamp || "", onchange: (e) => { s.clamp = e.target.value; } }))) : null,
      mode !== "assembly" ? h("p", { class: "hint" }, "Normteile bleiben eigene Körper und stehen mit Normbezeichnung in der Stückliste.") : null);
  };
  drawCats(); drawList(); drawDetail(); drawCats();
  const done = () => { remember({ kind: st.sel.kind, size: st.sel.size, length: st.sel.length, grade: st.sel.grade, galv: st.sel.galv, custom: st.sel.custom }); };
  const buttons = [{ label: "Eigene Normteile …", run: () => { customDialog(app); return false; } }, { label: "Abbrechen" }];
  if (mode === "assembly") {
    buttons.push({ label: "An Bohrung …", run: () => { done(); beginNormHole(app, { ...st.sel }); } });
    buttons.push({ label: "Einfügen", primary: true, run: () => { done(); return insertIntoAssembly(app, st.sel) === false ? false : undefined; } });
  } else {
    if (mode === "part" || mode === "feature") buttons.push({ label: "An Bohrung …", run: () => { done(); beginNormHole(app, { ...st.sel, mode: "part", onApply }); } });
    buttons.push({ label: mode === "feature" ? "Übernehmen" : "Einfügen", primary: true, run: () => { done(); onApply?.(cleanSel(st.sel)); } });
  }
  modal({ title: "Normteil-Bibliothek", width: "900px", body: h("div", { class: "normlib" }, left, mid, right), buttons });
}
const cleanSel = (s) => ({ kind: s.kind, size: s.size, length: String(s.length), grade: s.grade, galv: !!s.galv, ...(s.custom ? { custom: s.custom } : {}) });

/** Bauteil für eine Normbezeichnung (gleiche Bezeichnung → vorhandenes Bauteil) */
function normPart(app, s) {
  const designation = normDesignation(s);
  let p = app.parts().find((x) => x.normDesignation === designation);
  if (!p) {
    p = newPart(designation);
    p.normDesignation = designation;
    p.features.push({ id: uid("f"), type: "normteil", name: designation, ...cleanSel(s), pos: ["0", "0", "0"], axis: "Z" });
    app.project.docs.push(p);
  }
  return p;
}
function nextName(asm, p) { return `${p.normDesignation || p.name}:${asm.components.filter((c) => c.part === p.id).length + 1}`; }

/** Baugruppe: n Stück nebeneinander einfügen */
function insertIntoAssembly(app, s) {
  const asm = app.activeDoc();
  if (asm?.kind !== "assembly") return false;
  const n = Math.max(1, Math.min(100, Math.round(Number(s.qty) || 1)));
  let designation = "", part = null;
  // ein Stück in eine nicht leere Baugruppe: am Mauszeiger absetzen (BG10/BG1), mehrere in einer Reihe
  const atCursor = n === 1 && asm.components.length > 0;
  app.edit("Normteil einfügen", () => {
    const p = (part = normPart(app, s));
    designation = p.normDesignation;
    if (atCursor) return;
    for (let i = 0; i < n; i++) asm.components.push({ id: uid("c"), part: p.id, name: nextName(asm, p), pos: [i * 40, 0, 0], rot: [0, 0, 0] });
  });
  if (atCursor && part) return app.beginPlacing(part.id);
  toast(`${n} × ${designation} eingefügt`, { kind: "ok" });
}

// ---------- An Bohrung ----------
/** Auswahl einer Bohrung starten (mehrere nacheinander, Esc beendet) */
export function beginNormHole(app, sel) {
  app.pick = { kind: "normHole", sel, count: 0 };
  app.setHint(`${normDesignation(sel)}: Bohrung (Zylinderfläche) nahe der Einbauseite anklicken – ${sel.mode === "part" ? "Esc bricht ab" : "weitere Bohrungen nacheinander, Esc beendet"}`);
  app.props.render();
}

/** Klick während »An Bohrung« */
export function normHolePick(app, hit) {
  const pk = app.pick;
  if (!hit) return;
  if (pk.sel.mode === "part") return holeInPart(app, hit, pk);
  const sel = classifyHit(app, hit);
  if (sel?.kind !== "axis") return toast("Bitte eine Bohrung (Zylinderfläche) einer Komponente anklicken");
  const asm = app.activeDoc();
  const comp = asm.components.find((c) => c.id === sel.cid);
  const faces = app.assemblyFaces(comp.part);
  const end = endFaceFor(sel.info, worldToLocal(comp, hit.point, [0, 0, 1]).p, faces);
  if (!end) return toast("Zur Bohrung fehlt eine ebene Stirnfläche");
  const hf = holeFrame(sel.info, end, faces);
  let plan;
  try { plan = holeParts(pk.sel, hf); } catch (e) { return toast(e.message, { kind: "err" }); }
  const hw = holeToWorld(comp, hf);
  const holeRef = insertRef(comp.id, sel.info, end);
  const bottomRef = hf.depth != null && Math.abs((plan.clamp ?? -1) - hf.depth) < 1e-6 ? insertRef(comp.id, sel.info, { normal: hf.a, point: v3.add(hf.P, v3.mul(hf.a, hf.depth)) }) : null;
  let names = [];
  app.edit("Normteil an Bohrung", () => {
    const placed = [];
    for (const part of plan.parts) {
      const fam = familyOf(part.kind, part.custom);
      const p = normPart(app, part);
      const c = { id: uid("c"), part: p.id, name: nextName(asm, p), ...partPlacement(hw, part) };
      asm.components.push(c);
      placed.push({ part, fam, comp: c });
      names.push(p.normDesignation);
    }
    asm.constraints = asm.constraints || [];
    const ref = (pl, opts) => { const i = normInsertInfo(pl.fam, pl.part.size, opts); return { ref: insertRef(pl.comp.id, i.axis, i.plane), solution: i.solution }; };
    // Kette: Kopfscheibe → Bohrung, Schraube → Kopfscheibe, Mutterscheibe → Gegenseite, Mutter → Mutterscheibe
    let above = null, below = null;
    for (const pl of placed) {
      if (!insertable(pl.fam)) continue;
      const me = ref(pl);
      const target = pl.part.flip ? holeRef : pl.part.at <= 0 ? above || holeRef : below || bottomRef;
      if (target) asm.constraints.push({ id: uid("ab"), type: "einfuegen", a: target, b: me.ref, solution: me.solution, gap: "0", name: `Einfügen: ${pl.comp.name} → ${comp.name}` });
      if (pl.fam.template === "scheibe" && !["din434", "din435"].includes(pl.fam.id)) {
        const top = ref(pl, { top: true }).ref;
        if (pl.part.flip) above = top; else if (pl.part.at > 0) below = top;
      }
    }
    solveAssembly(asm, (pid) => app.assemblyFaces(pid), (g) => Number(g) || 0);
  });
  pk.count++;
  toast(`${names.join(" + ")}${plan.threaded ? " (Gewindebohrung)" : ""}${plan.warn.length ? " – " + plan.warn.join("; ") : ""}`, { kind: plan.warn.length ? "" : "ok", timeout: 5000 });
}

/** Bauteil: Normteil-Feature an eine Bohrung des Bauteils setzen (Basispunkt und Richtung) */
function holeInPart(app, hit, pk) {
  const part = app.activeDoc();
  const info = hit.info;
  if (info?.type !== "CYLINDER" || !info.axisD) return toast("Bitte eine Bohrung (Zylinderfläche) anklicken");
  const faces = app.assemblyFaces(part.id);
  const end = endFaceFor(info, hit.point, faces);
  if (!end) return toast("Zur Bohrung fehlt eine ebene Stirnfläche");
  const hf = holeFrame(info, end, faces);
  let plan;
  try { plan = holeParts({ ...pk.sel, garnitur: false, auto: true }, hf); } catch (e) { return toast(e.message, { kind: "err" }); }
  const p0 = plan.parts.at(-1);
  const dir = p0.flip ? hf.n : hf.a;
  const r = (x) => String(Math.round(x * 1000) / 1000);
  const sel = { ...cleanSel({ ...pk.sel, size: plan.size, length: plan.length ?? pk.sel.length }), pos: v3.add(hf.P, v3.mul(hf.a, p0.at)).map(r), axis: "custom", dir: dir.map(r) };
  app.cancelPick();
  pk.sel.onApply?.(sel);
}

// ---------- Eigene Normteile ----------
const EXAMPLE = {
  id: "zylinderschraube-flach", label: "Zylinderschraube, niedriger Kopf", norm: "DIN 7984", noun: "Zylinderschraube", cat: "schrauben", template: "zylinderschraube",
  sizes: { M6: { d: 6, dk: 10, k: 3.5, sw: 4 }, M8: { d: 8, dk: 13, k: 5, sw: 5 }, M10: { d: 10, dk: 16, k: 6, sw: 7 } },
  lengths: [10, 12, 16, 20, 25, 30, 35, 40], grades: ["8.8", "A2-70"],
};
async function readFile(app) {
  if (app.files?.bridge) { const f = await app.files.bridge.openFile({ filters: [{ name: "Normteile", extensions: ["json"] }] }); return f?.data ?? null; }
  return new Promise((res) => {
    const inp = h("input", { type: "file", accept: ".json", style: { display: "none" } });
    inp.addEventListener("change", async () => { res(inp.files[0] ? await inp.files[0].text() : null); inp.remove(); });
    document.body.append(inp);
    inp.click();
  });
}
/** JSON (eine Familie oder Liste) übernehmen; Rückgabe { added, errors } */
export function importCustom(text) {
  let v;
  try { v = JSON.parse(text); } catch { return { added: 0, errors: ["Datei ist kein JSON"] }; }
  const items = Array.isArray(v) ? v : Array.isArray(v?.normteile) ? v.normteile : [v];
  const list = read(KEY_CUSTOM), errors = [];
  let added = 0;
  for (const x of items) {
    const ok = validateFamily(x);
    if (!ok.ok) { errors.push(`${x?.id || "?"}: ${ok.errors.join("; ")}`); continue; }
    const i = list.findIndex((y) => y.id === x.id);
    if (i >= 0) list[i] = x; else list.push(x);
    added++;
  }
  write(KEY_CUSTOM, list);
  return { added, errors };
}
export function customDialog(app) {
  const body = h("div");
  const draw = () => {
    const list = listCustom();
    body.replaceChildren(
      h("p", { class: "hint" }, `Eigene Normteile (Werknormen, Sonderteile) als JSON: id, label, norm, template (${Object.keys(TEMPLATES).join(", ")}), sizes mit den Maßen je Größe, lengths und grades. Die Teile erscheinen unter »Eigene Normteile«; Projekte speichern die Maße mit, damit sie auch auf anderen Rechnern laufen.`),
      list.length ? h("table", { class: "grid" }, h("tbody", {}, ...list.map((x) => h("tr", {}, h("td", {}, h("b", {}, x.label), h("div", { class: "muted" }, `${x.norm} · ${Object.keys(x.sizes).join(", ")}`)),
        h("td", {}, h("button", { class: "btn", onclick: async () => { if (await confirmDialog("Normteil löschen", `»${x.label}« aus den eigenen Normteilen löschen? Bauteile im Projekt behalten ihre Maße.`, { ok: "Löschen", danger: true })) { write(KEY_CUSTOM, read(KEY_CUSTOM).filter((y) => y.id !== x.id)); draw(); } } }, "Löschen")))))) : h("p", { class: "muted" }, "Noch keine eigenen Normteile."),
      h("div", { class: "btn-row" },
        h("button", { class: "btn", onclick: async () => { const t = await readFile(app); if (t == null) return; const r = importCustom(t); if (r.added) toast(`${r.added} Normteil(e) übernommen`, { kind: "ok" }); if (r.errors.length) toast(r.errors.join(" · "), { kind: "err", timeout: 9000 }); draw(); } }, "JSON übernehmen …"),
        h("button", { class: "btn", disabled: !list.length || undefined, onclick: () => downloadBlob(new Blob([JSON.stringify({ normteile: list }, null, 2)], { type: "application/json" }), "eigene-normteile.json") }, "Alle exportieren"),
        h("button", { class: "btn", onclick: () => downloadBlob(new Blob([JSON.stringify({ normteile: [EXAMPLE] }, null, 2)], { type: "application/json" }), "normteil-vorlage.json") }, "Vorlage herunterladen")));
  };
  draw();
  modal({ title: "Eigene Normteile", width: "620px", body, buttons: [{ label: "Schließen", primary: true }] });
}

