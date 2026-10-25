// Gestell-Generator in der Oberfläche (Inventor Konstruktion → Gestell): Einfügen auf ein Skelett-Bauteil, Ändern,
// Gehrung, Eckverbindung, Auf Gestell stutzen, Nuten, Verlängern/Kürzen, Wiederverwenden und Gestell-Info.
// Die Baugruppe hält die Einstellungen (asm.gestell, siehe src/core/gestell.js); jeder Stab ist ein Bauteil mit
// Feature »genteil« (gen »gestell«), gleiche Stäbe teilen sich ein Bauteil (app.syncGenAssembly).
import { h, toast, modal, fmtNum, downloadBlob } from "./dom.js";
import { skeletonSegments, defaultGestell, addMember, removeMember, setJoint, gestellPlan, gestellCsv, JOINT_KINDS, GAP_KINDS, PLACES, CORNER_AUTO, TEE_AUTO, STECK_FIELDS, steckOf } from "../core/gestell.js";
import { planeFrame } from "../core/geom.js";
import { resolvePlane } from "../core/datums.js";
import { resolveParams, evaluate } from "../core/expr.js";
import { newAssembly, uid } from "../core/examples.js";

const clone = (x) => JSON.parse(JSON.stringify(x));

/** Skelett-Linien eines Bauteils in Weltlage (Skizzenebene aus dem Ergebnis, sonst aus der Ebenen-Angabe) */
export function skeletonSegs(app, part) {
  if (!part || part.kind !== "part") return [];
  const scope = resolveParams(part.params || []).values;
  const res = app.results.get(part.id);
  const frameOf = (f) => {
    const fr = res?.sketches?.[f.id]?.frame;
    if (fr) return fr;
    try { return planeFrame(resolvePlane(f.plane, app.datumMap(part)), evaluate(String(f.offset || "0"), scope)); } catch { return null; }
  };
  return skeletonSegments(part, { frameOf, E: (x) => evaluate(String(x), scope), scope });
}

/** Eingabe des Bauplans: Einstellungen der Baugruppe plus aktuelle Skelett-Linien */
export function gestellInput(app, asm) {
  return { ...clone(asm.gestell), segments: skeletonSegs(app, app.doc(asm.gestell.skeleton)) };
}

/** Spalt aus einer Eingabe (mm, nicht negativ) */
function gapOf(v, scope = {}) {
  const x = Number(evaluate(String(v ?? "0").trim() || "0", scope));
  if (!Number.isFinite(x) || x < 0) throw new Error("Spalt ungültig");
  return x;
}

/** Bauplan der Gestell-Baugruppe (wie gespeichert) */
export const planOf = (asm) => gestellPlan(asm.generator?.params?.input || { segments: [], members: [] });

/** Einzelteile nachziehen, wenn sich Skelett oder Einstellungen geändert haben. true = geändert */
export function refreshGestell(app, asm, { force = false } = {}) {
  if (!asm?.gestell) return false;
  const input = gestellInput(app, asm);
  if (!force && JSON.stringify(asm.generator?.params?.input) === JSON.stringify(input)) return false;
  asm.generator = { gen: "gestell", params: { input } };
  app.syncGenAssembly(asm);
  return true;
}
/** Alle Gestelle des Projekts (z. B. nach Änderungen am Skelett, beim Öffnen einer Baugruppe) */
export function refreshAllGestelle(app) {
  let n = 0;
  for (const d of app.project.docs) if (d.kind === "assembly" && d.gestell && refreshGestell(app, d)) n++;
  return n;
}
/** Änderung an asm.gestell mit Rückgängig, Einzelteile folgen */
export function editGestell(app, asm, label, fn) {
  app.edit(label, () => { fn(asm.gestell); refreshGestell(app, asm, { force: true }); });
}

/** Neue Gestell-Baugruppe auf dem Skelett-Bauteil; into = Baugruppe, in die sie als Unterbaugruppe kommt */
export function insertGestell(app, skeleton, { section, place = "mm", rot = 0, corner = "gehrung", tee = "stutzen", lines = null, into = null } = {}) {
  const segs = skeletonSegs(app, skeleton);
  if (!segs.length) { toast("Das Skelett hat keine Linien – Skizze mit Linien oder einen Profilzug anlegen", { kind: "err" }); return null; }
  const n = app.project.docs.filter((d) => d.kind === "assembly" && d.gestell).length + 1;
  const asm = newAssembly(`Gestell ${n}`);
  asm.gestell = defaultGestell(skeleton.id, lines ? segs.filter((s) => lines.includes(s.id)) : segs, section);
  Object.assign(asm.gestell, { place, rot, corner, tee });
  asm.genMaterial = { material: skeleton.material, color: skeleton.color ?? null, finish: skeleton.finish ? clone(skeleton.finish) : undefined };
  app.edit("Gestell einfügen", () => {
    app.project.docs.push(asm);
    refreshGestell(app, asm, { force: true });
    if (into) into.components.push({ id: uid("c"), part: asm.id, name: asm.name + ":1", pos: [0, 0, 0], rot: [0, 0, 0], fixed: !into.components.length });
  }, { rebuild: false });
  app.openDoc(asm.id);
  toast(`»${asm.name}« mit ${asm.gestell.members.length} Stäben und ${new Set(asm.components.map((c) => c.part)).size} Einzelteilen angelegt`, { kind: "ok" });
  return asm;
}

/** Dialog »Gestell einfügen«: Skelett, Linien, Profil, Lage und Ecken */
export function insertGestellDialog(app) {
  const act = app.activeDoc();
  const cands = app.parts().filter((p) => !p.genAsm && skeletonSegs(app, p).length);
  if (!cands.length) return toast("Zuerst ein Skelett-Bauteil mit Skizzenlinien oder einem Profilzug anlegen");
  const st = { skel: (act?.kind === "part" && cands.includes(act) ? act : cands[0]).id, section: { kind: "vierkant", size: "40x3" }, place: "mm", rot: "0", corner: "gehrung", tee: "stutzen", off: new Set() };
  const body = h("div", {});
  const P = app.props;
  const draw = () => {
    const sk = app.doc(st.skel), segs = skeletonSegs(app, sk);
    body.replaceChildren(
      P.select("Skelett (Referenzmodell)", cands.map((p) => [p.id, p.name]), st.skel, (v) => { st.skel = v; st.off.clear(); draw(); }),
      ...P.genSectionPicker({ label: "Profil" }, st.section, sk, (x) => { st.section = x; draw(); }),
      P.select("Lage zur Linie", PLACES, st.place, (v) => { st.place = v; }),
      P.expr("Drehung", st.rot, (v) => { st.rot = v; }, { unit: "°" }),
      P.seg("Ecken", CORNER_AUTO, st.corner, (v) => { st.corner = v; draw(); }),
      P.seg("T-Stöße", TEE_AUTO, st.tee, (v) => { st.tee = v; draw(); }),
      h("h4", {}, `Linien (${segs.length - st.off.size} von ${segs.length})`),
      h("div", { class: "gestell-lines" }, ...segs.map((s) => h("label", { class: "chk" }, h("input", { type: "checkbox", checked: !st.off.has(s.id), onchange: (e) => { if (e.target.checked) st.off.delete(s.id); else st.off.add(s.id); } }), `${s.label} (${fmtNum(Math.hypot(...s.b.map((x, k) => x - s.a[k])), 1)} mm)`))),
      h("p", { class: "hint" }, "Wie in Inventor: jede gewählte Linie wird ein Stab und jeder Stab ein eigenes Bauteil (gleiche Stäbe einmal). An Ecken setzt das Gestell die gewählte Verbindung, Enden auf einer anderen Linie werden gestutzt oder genutet. Ändert sich das Skelett, folgen die Stäbe beim nächsten Öffnen der Baugruppe."));
  };
  draw();
  modal({ title: "Gestell einfügen", width: "560px", body, buttons: [{ label: "Abbrechen" }, { label: "Einfügen", primary: true, run: () => {
    const sk = app.doc(st.skel);
    let rot = 0;
    try { rot = evaluate(String(st.rot || "0"), resolveParams(sk.params || []).values); } catch { return toast("Drehung ungültig", { kind: "err" }) && false; }
    const lines = skeletonSegs(app, sk).map((s) => s.id).filter((id) => !st.off.has(id));
    if (!lines.length) return toast("Keine Linie gewählt", { kind: "err" }) && false;
    insertGestell(app, sk, { section: st.section, place: st.place, rot, corner: st.corner, tee: st.tee, lines, into: act?.kind === "assembly" && !act.gestell ? act : null });
  } }] });
}

/** Stab zu einer Komponente der Gestell-Baugruppe */
export function memberOfComponent(asm, comp) {
  if (!asm?.gestell || !comp?.genKey) return null;
  const pm = planOf(asm).members.find((m) => comp.genKey === "m:" + m.name);
  return pm ? asm.gestell.members.find((m) => m.id === pm.gid) || null : null;
}
const memberLabel = (m) => `Stab ${m.no}`;

/** Eigenschaften der Gestell-Baugruppe */
export function gestellSections(P, asm) {
  const app = P.app, g = asm.gestell, out = [];
  const sk = app.doc(g.skeleton);
  const plan = planOf(asm);
  const upd = (label, fn) => editGestell(app, asm, label, fn);
  const segs = asm.generator?.params?.input?.segments || [];
  const used = new Set(g.members.map((m) => m.seg));
  const free = segs.filter((s) => !used.has(s.id));
  out.push(P.section("Gestell",
    h("dl", { class: "kv" }, h("dt", {}, "Skelett"), h("dd", {}, sk ? sk.name : "fehlt"), h("dt", {}, "Stäbe"), h("dd", {}, String(g.members.length)), h("dt", {}, "Einzelteile"), h("dd", {}, String(new Set(asm.components.filter((c) => c.genKey).map((c) => c.part)).size))),
    ...P.genSectionPicker({ label: "Profil (Vorgabe)" }, g.section, sk, (x) => upd("Gestell-Profil", (G) => { G.section = x; })),
    P.select("Lage zur Linie", PLACES, g.place || "mm", (v) => upd("Lage zur Linie", (G) => { G.place = v; })),
    P.expr("Drehung", String(g.rot ?? 0), (v) => upd("Drehung", (G) => { G.rot = Number(evaluate(v, {})) || 0; }), { unit: "°" }),
    P.seg("Ecken", CORNER_AUTO, g.corner || "gehrung", (v) => upd("Ecken", (G) => { G.corner = v; })),
    P.seg("T-Stöße", TEE_AUTO, g.tee || "stutzen", (v) => upd("T-Stöße", (G) => { G.tee = v; })),
    P.expr("Spalt", String(g.gap ?? 0), (v) => { try { const x = gapOf(v, P.scope()); upd("Spalt", (G) => { if (x) G.gap = x; else delete G.gap; }); } catch (e) { toast(e.message, { kind: "err" }); } }, { allowNeg: false }),
    h("p", { class: "hint" }, "Spalt zwischen den Stäben bei Gehrung, Eckverbindung und Stutzen – gilt für die Automatik und die Werkzeuge im Menüband."),
    g.tee === "stecken" || g.joints.some((j) => j.kind === "stecken") ? h("div", {},
      h("h4", {}, "Stecknasen"),
      ...STECK_FIELDS.map(([k, label]) => P.expr(label, String(steckOf(g.steck)[k]), (v) => upd("Stecknasen", (G) => { G.steck = { ...steckOf(G.steck), [k]: Number(evaluate(v, {})) || 0 }; }), { unit: k === "count" ? "" : "mm", allowNeg: false })),
      h("p", { class: "hint" }, "Zapfen sitzen an den Wänden des stoßenden Stabs, deren Kante längs zum durchlaufenden Stab liegt; Schlitze = Zapfen + 2 × Spiel, nur im ebenen Teil der Wand (nicht im Eckradius). Zapfenlänge = Wand des durchlaufenden Stabs + Überstand.")) : null,
    ...plan.issues.map((x) => h("div", { class: "msg warn" }, x.message)),
    free.length ? h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => upd("Stäbe einfügen", (G) => { for (const s of free) addMember(G, s.id); }) }, `${free.length} Linie(n) ohne Stab einfügen`)) : null,
    h("div", { class: "btn-row" },
      sk ? h("button", { class: "btn", onclick: () => app.openDoc(sk.id) }, "Skelett bearbeiten") : null,
      h("button", { class: "btn", onclick: () => { app.checkpoint("Gestell aktualisieren"); refreshGestell(app, asm, { force: true }); app.changed(); } }, "Aktualisieren"),
      h("button", { class: "btn", onclick: () => gestellInfoDialog(app, asm) }, "Gestell-Info"))));
  // Verbindungen von Hand
  const name = (id) => { const m = g.members.find((x) => x.id === id); return m ? memberLabel(m) : "?"; };
  const opts = g.members.map((m) => [m.id, memberLabel(m)]);
  const nj = { kind: "gehrung", a: opts[0]?.[0], b: opts[1]?.[0], gap: String(g.gap ?? 0) };
  const gapCell = (j) => GAP_KINDS.includes(j.kind)
    ? h("input", { class: "inp num", value: String(j.gap ?? 0), title: "Spalt in mm", style: "width:4.5em", onchange: (e) => { try { const v = gapOf(e.target.value); upd("Spalt", (G) => { const x = G.joints.find((y) => y.id === j.id); if (x) { if (v) x.gap = v; else delete x.gap; } }); } catch (err) { toast(err.message, { kind: "err" }); } } })
    : "";
  out.push(P.section("Verbindungen von Hand",
    g.joints.length ? h("table", { class: "grid" }, h("tbody", {}, ...g.joints.map((j) => h("tr", {},
      h("td", {}, j.kind === "keine" ? "keine (ohne Automatik)" : JOINT_KINDS[j.kind]?.label || j.kind),
      h("td", {}, `${name(j.a)} – ${name(j.b)}`),
      h("td", { class: "num" }, gapCell(j)),
      h("td", {}, h("button", { class: "btn", title: "Verbindung entfernen", onclick: () => upd("Verbindung entfernen", (G) => { G.joints = G.joints.filter((x) => x.id !== j.id); }) }, "✕")))))) : h("p", { class: "hint" }, "Keine – es gelten die Ecken und T-Stöße oben."),
    opts.length > 1 ? h("div", {},
      P.select("Art", [...Object.entries(JOINT_KINDS).map(([k, d]) => [k, d.label]), ["keine", "keine (Automatik aus)"]], nj.kind, (v) => { nj.kind = v; }),
      P.select("Erster Stab", opts, nj.a, (v) => { nj.a = v; }),
      P.select("Zweiter Stab", opts, nj.b, (v) => { nj.b = v; }),
      P.expr("Spalt", nj.gap, (v) => { nj.gap = v; }, { allowNeg: false }),
      h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => { try { const gap = gapOf(nj.gap, P.scope()); upd("Verbindung", (G) => setJoint(G, nj.kind, nj.a, nj.b, gap)); } catch (e) { toast(e.message, { kind: "err" }); } } }, "Verbindung setzen"))) : null,
    h("p", { class: "hint" }, Object.values(JOINT_KINDS).map((d) => `${d.label}: ${d.hint}.`).join(" ") + " Schneller: Knopf im Menüband, dann die zwei Stäbe im 3D-Fenster anklicken.")));
  return out;
}

/** Eigenschaften eines Stabs (Komponente der Gestell-Baugruppe) */
export function memberSection(P, asm, comp) {
  const app = P.app, m = memberOfComponent(asm, comp);
  if (!m) return [];
  const g = asm.gestell, sk = app.doc(g.skeleton);
  const upd = (label, fn) => editGestell(app, asm, label, (G) => fn(G.members.find((x) => x.id === m.id), G));
  const row = planOf(asm).rows.find((r) => r.id === m.id);
  const num = (label, key, unit = "mm") => P.expr(label, String(m[key] ?? "0"), (v) => upd(label, (x) => { const n = Number(evaluate(v, {})) || 0; if (n) x[key] = n; else delete x[key]; }), { unit });
  const tools = Object.entries(JOINT_KINDS).map(([k, d]) => h("button", { class: "btn", title: d.hint, onclick: () => startGestellTool(app, k, m.id) }, d.label));
  return [P.section(`Gestell: ${memberLabel(m)}`,
    row ? h("dl", { class: "kv" }, h("dt", {}, "Linie"), h("dd", {}, row.seg), h("dt", {}, "Länge Achse"), h("dd", {}, fmtNum(row.len, 1) + " mm"), h("dt", {}, "Verbindungen"), h("dd", {}, row.joints.join("; ") || "–")) : null,
    m.reuse ? h("p", { class: "hint" }, `Übernimmt Profil, Länge und Enden von ${memberLabel(g.members.find((x) => x.id === m.reuse) || { no: "?" })}.`) : [
      ...P.genSectionPicker({ label: m.section ? "Profil (eigenes)" : "Profil (wie Gestell)" }, m.section || g.section, sk, (x) => upd("Profil ändern", (s) => { s.section = x; })),
      m.section ? h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => upd("Profil wie Gestell", (s) => { delete s.section; }) }, "Profil wie Gestell")) : null,
      P.select("Lage zur Linie", [["", "wie Gestell"], ...PLACES], m.place || "", (v) => upd("Lage zur Linie", (s) => { if (v) s.place = v; else delete s.place; })),
      P.text("Drehung ° (leer = wie Gestell)", m.rot == null ? "" : String(m.rot), (v) => upd("Drehung", (s) => { const t = v.trim().replace(",", "."); if (t === "") delete s.rot; else s.rot = Number(evaluate(t, {})) || 0; }), { placeholder: String(g.rot ?? 0) }),
      num("Versatz quer (u)", "offU"), num("Versatz hoch (v)", "offV"),
      num("Verlängern Ende A (− = kürzen)", "extA"), num("Verlängern Ende B (− = kürzen)", "extB"),
    ],
    P.select("Wiederverwenden von", [["", "–"], ...g.members.filter((x) => x.id !== m.id && !x.reuse).map((x) => [x.id, memberLabel(x)])], m.reuse || "", (v) => upd("Wiederverwenden", (s) => { if (v) s.reuse = v; else delete s.reuse; })),
    h("div", { class: "btn-row" }, ...tools),
    h("div", { class: "btn-row" }, h("button", { class: "btn danger", onclick: () => editGestell(app, asm, "Stab entfernen", (G) => removeMember(G, m.id)) }, "Stab entfernen")),
    h("p", { class: "hint" }, "Profil und Enden werden hier am Gestell geändert und gelten für das Bauteil des Stabs. Bohrungen und Ausschnitte im Bauteil selbst anhängen – sie bleiben beim Aktualisieren erhalten."))];
}

// ---------- Menüband-Werkzeuge ----------
const TOOL_TEXT = { ...Object.fromEntries(Object.entries(JOINT_KINDS).map(([k, d]) => [k, d.label])), reuse: "Wiederverwenden" };

function activeGestell(app) {
  const asm = app.activeDoc();
  if (asm?.kind === "assembly" && asm.gestell) return asm;
  toast("Zuerst eine Gestell-Baugruppe öffnen (oder »Gestell einfügen«)");
  return null;
}
function selectedMember(app, asm) {
  const c = app.sel?.type === "component" ? asm.components.find((x) => x.id === app.sel.id) : null;
  return memberOfComponent(asm, c);
}

/** Zwei-Stab-Werkzeug starten (Gehrung, Eckverbindung, Stutzen, Nuten, Wiederverwenden); first = schon gewählter Stab */
export function startGestellTool(app, tool, first) {
  const asm = activeGestell(app);
  if (!asm) return;
  const f = first || selectedMember(app, asm)?.id || null;
  app.pick = { kind: "gestell", tool, first: f };
  const what = tool === "reuse" ? (f ? "Stab wählen, der das Vorbild übernimmt" : "Vorbild-Stab wählen") : f ? "zweiten Stab wählen" : "ersten Stab wählen";
  toast(`${TOOL_TEXT[tool]}: ${what} (Esc bricht ab)`);
  app.ribbon.render();
}

/** Klick im 3D-Fenster während eines Gestell-Werkzeugs */
export function gestellPick(app, hit) {
  const asm = app.activeDoc(), p = app.pick;
  const cid = hit?.key?.startsWith("comp:") ? hit.key.slice(5) : null;
  const m = memberOfComponent(asm, asm?.components.find((c) => c.id === cid));
  if (!m) return toast("Einen Stab des Gestells anklicken");
  if (!p.first) {
    p.first = m.id;
    app.sel = { type: "component", id: cid };
    app.refreshSelectionHits();
    return toast(`${TOOL_TEXT[p.tool]}: ${memberLabel(m)} gewählt – ${p.tool === "reuse" ? "Stab wählen, der es übernimmt" : "zweiten Stab wählen"}`);
  }
  if (p.first === m.id) return toast("Einen anderen Stab wählen");
  const a = p.first;
  app.pick = null;
  try {
    if (p.tool === "reuse") editGestell(app, asm, "Wiederverwenden", (G) => { G.members.find((x) => x.id === m.id).reuse = a; });
    else editGestell(app, asm, TOOL_TEXT[p.tool], (G) => setJoint(G, p.tool, a, m.id, gapOf(G.gap ?? 0)));
  } catch (e) { toast(e.message, { kind: "err" }); }
  app.ribbon.render();
}

/** Ändern: Profil, Lage und Drehung des gewählten Stabs, wahlweise für alle Stäbe mit gleichem Profil */
export function changeMemberDialog(app) {
  const asm = activeGestell(app);
  if (!asm) return;
  const m = selectedMember(app, asm);
  if (!m) return toast("Ändern: zuerst einen Stab wählen");
  const g = asm.gestell, sk = app.doc(g.skeleton), P = app.props;
  const same = (x) => JSON.stringify(x.section || g.section) === JSON.stringify(m.section || g.section) && !x.reuse;
  const st = { section: clone(m.section || g.section), place: m.place || "", rot: m.rot == null ? "" : String(m.rot), all: false };
  const body = h("div", {});
  const draw = () => body.replaceChildren(
    ...P.genSectionPicker({ label: "Profil" }, st.section, sk, (x) => { st.section = x; draw(); }),
    P.select("Lage zur Linie", [["", "wie Gestell"], ...PLACES], st.place, (v) => { st.place = v; }),
    P.text("Drehung ° (leer = wie Gestell)", st.rot, (v) => { st.rot = v; }),
    P.check(`für alle ${g.members.filter(same).length} Stäbe mit diesem Profil`, st.all, (v) => { st.all = v; draw(); }));
  draw();
  modal({ title: `Ändern – ${memberLabel(m)}`, width: "480px", body, buttons: [{ label: "Abbrechen" }, { label: "Ändern", primary: true, run: () => {
    const ids = new Set(st.all ? g.members.filter(same).map((x) => x.id) : [m.id]);
    editGestell(app, asm, "Gestell ändern", (G) => {
      for (const x of G.members) {
        if (!ids.has(x.id)) continue;
        if (JSON.stringify(st.section) === JSON.stringify(G.section)) delete x.section; else x.section = clone(st.section);
        if (st.place) x.place = st.place; else delete x.place;
        if (st.rot === "") delete x.rot; else x.rot = Number(st.rot.replace(",", ".")) || 0;
      }
    });
  } }] });
}

/** Verlängern/Kürzen des gewählten Stabs an einem oder beiden Enden */
export function lengthenDialog(app) {
  const asm = activeGestell(app);
  if (!asm) return;
  const m = selectedMember(app, asm);
  if (!m) return toast("Verlängern/Kürzen: zuerst einen Stab wählen");
  const P = app.props, st = { end: "beide", d: "10" };
  const body = h("div", {});
  const draw = () => body.replaceChildren(
    P.seg("Ende", [["A", "Ende A"], ["B", "Ende B"], ["beide", "beide"]], st.end, (v) => { st.end = v; draw(); }),
    P.expr("Verlängern um (− = kürzen)", st.d, (v) => { st.d = v; }),
    h("p", { class: "hint" }, `Bisher: Ende A ${fmtNum(m.extA || 0, 1)} mm, Ende B ${fmtNum(m.extB || 0, 1)} mm. Der Wert verschiebt das Ende samt Gehrung bzw. Stutzschnitt entlang der Achse; 0 setzt zurück.`));
  draw();
  modal({ title: `Verlängern/Kürzen – ${memberLabel(m)}`, width: "440px", body, buttons: [{ label: "Abbrechen" }, { label: "Übernehmen", primary: true, run: () => {
    let d;
    try { d = evaluate(String(st.d), {}); } catch { return toast("Wert ungültig", { kind: "err" }) && false; }
    editGestell(app, asm, "Verlängern/Kürzen", (G) => {
      const x = G.members.find((y) => y.id === m.id);
      for (const k of st.end === "beide" ? ["extA", "extB"] : [st.end === "A" ? "extA" : "extB"]) { if (d) x[k] = d; else delete x[k]; }
    });
  } }] });
}

/** Gestell-Info: alle Stäbe mit Profil, Länge, Schnittwinkeln, Verbindungen und Bauteil */
export async function gestellInfoDialog(app, asm = activeGestell(app)) {
  if (!asm) return;
  const plan = planOf(asm);
  await app.builtParts(asm);
  const byKey = new Map(asm.components.filter((c) => c.genKey).map((c) => [c.genKey, c]));
  const rows = plan.rows.map((r) => {
    const c = byKey.get("m:" + r.name), part = c && app.doc(c.part);
    const b = part && app.results.get(part.id)?.bodies?.find((x) => x.kind === "member");
    return { ...r, part: part?.name || "", cut: b?.meta?.length };
  });
  const csv = () => downloadBlob(new Blob(["﻿" + gestellCsv(rows)], { type: "text/csv" }), `${asm.name} Gestell-Info.csv`);
  const total = rows.reduce((s, r) => s + (r.cut || r.len), 0);
  modal({ title: `Gestell-Info – ${asm.name}`, width: "900px", body: h("div", {},
    h("table", { class: "grid" },
      h("thead", {}, h("tr", {}, ...["Stab", "Profil", "Linie", "Achse mm", "Zuschnitt mm", "Schnitt A °", "Schnitt B °", "Verbindungen", "Bauteil"].map((t) => h("th", {}, t)))),
      h("tbody", {}, ...rows.map((r) => h("tr", {}, h("td", {}, r.name), h("td", {}, r.profile), h("td", {}, r.seg), h("td", { class: "num" }, fmtNum(r.len, 1)), h("td", { class: "num" }, r.cut ? fmtNum(r.cut, 1) : "–"), h("td", { class: "num" }, fmtNum(r.angA, 1)), h("td", { class: "num" }, fmtNum(r.angB, 1)), h("td", {}, r.joints.join("; ")), h("td", {}, r.part))))),
    h("p", { class: "hint" }, `${rows.length} Stäbe, ${new Set(rows.map((r) => r.part)).size} Einzelteile, Zuschnitt gesamt ${fmtNum(total / 1000, 2)} m.`),
    ...plan.issues.map((x) => h("div", { class: "msg warn" }, x.message))),
  buttons: [{ label: "Schließen" }, { label: "Als CSV", primary: true, run: () => { csv(); return false; } }] });
}
