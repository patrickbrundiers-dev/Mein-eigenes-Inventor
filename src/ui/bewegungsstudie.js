// Bewegungsuntersuchung (SolidCraft-Abgleich E3): Diagramm, Bewegungsbahn (anzeigen, behalten, bearbeiten),
// Kollisionen über alle Stellungen und »Punkt anfahren«. Rechnung in src/core/bewegungsstudie.js.
import { h, toast, modal } from "./dom.js";
import { uid } from "../core/examples.js";
import { studyFrames, tracePath, pathLength, seekJointValue, motionChartSvg, chartSeries, motionDeltas } from "../core/bewegungsstudie.js";
import { jointUnit, jointFollowers, setJointAngle, isSlide } from "../core/kinematik.js";
import { flattenAssembly } from "../core/subasm.js";
import { decomposePlacement, matMul } from "../core/geom.js";
import { classifyHit } from "./abhaengigkeit.js";

const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d).replace(".", ",") : "–");
const parseP = (s) => { const v = String(s).split(/[;\s]+/).filter(Boolean).map((x) => Number(x.replace(",", "."))); return v.length === 3 && v.every(Number.isFinite) ? v : null; };

/** Gelenkwert des Antriebs übernehmen (gekoppelte Gelenke und angehängte Teile gehen mit) */
export function applyDriveValue(app, asm, compId, value, label = "Gelenkwert") {
  const compOf = (id) => asm.components.find((x) => x.id === id);
  const { values } = motionDeltas(asm, compId, value);
  app.edit(label, () => { for (const [id, v] of values) setJointAngle(compOf(id), v, jointFollowers(asm, id).map(compOf).filter(Boolean)); });
}

/** Kollisionen in jeder Stellung: Paare aus bewegtem und nicht bewegtem Teil (Berührung zählt nicht) */
export async function studyCollisions(app, asm, frames) {
  const comps = asm.components.filter((x) => !x.hidden && app.doc(x.part));
  const rows = [];
  for (const f of frames) {
    const items = comps.flatMap((x) => flattenAssembly({ id: asm.id, components: [x] }, (id) => app.doc(id)).map((o) => ({ key: x.id, part: o.part, ...decomposePlacement(f.deltas.has(x.id) ? matMul(f.deltas.get(x.id), o.matrix) : o.matrix), name: x.name })));
    const hits = (await app.kernel.call("collisions", { items })).filter((r) => r.a !== r.b && f.deltas.has(r.a) !== f.deltas.has(r.b));
    rows.push({ a: f.a, hits });
  }
  return rows;
}

/** Dialog »Bewegungsuntersuchung« für die Komponente c (Antrieb) */
export function motionStudyDialog(app, c, st = {}) {
  const asm = app.activeDoc();
  if (!c?.joint) return toast("Erst ein Gelenk an der Komponente anlegen");
  Object.assign(st, { steps: st.steps ?? 36, ...st });
  let frames;
  try { frames = studyFrames(asm, c.id, st.steps); } catch (e) { return toast(e.message, { kind: "err" }); }
  const u = jointUnit(c.joint), name = (id) => asm.components.find((x) => x.id === id)?.name || id;
  const series = chartSeries(asm, frames);
  const chart = h("div", { class: "motion-chart-wrap" });
  chart.innerHTML = motionChartSvg(frames.map((f) => f.a), series, { xLabel: `${c.name} (${u})` });
  const clampedAt = frames.filter((f) => f.clamped.length);
  // Bahn
  const owner = st.owner && frames[0].deltas.has(st.owner) ? st.owner : c.id;
  const box = app.viewer.componentBox(owner);
  const point = st.point || (box ? box[0].map((v, i) => (v + box[1][i]) / 2) : [0, 0, 0]);
  const path = tracePath(frames, owner, point);
  const showPaths = () => app.viewer.showMotionPaths([...(asm.motionPaths || []).filter((p) => !p.hidden).map((p) => ({ ...p, kept: true })), { pts: path }]);
  showPaths();
  const ownerSel = h("select", { class: "inp" }, ...[...frames[0].deltas.keys()].map((id) => h("option", { value: id, selected: id === owner ? true : undefined }, name(id))));
  ownerSel.addEventListener("change", () => { close(); motionStudyDialog(app, c, { ...st, owner: ownerSel.value, point: null }); });
  const target = h("input", { class: "inp", placeholder: "x; y; z", value: st.target || "" });
  const collBox = h("div", {});
  let close = () => {};
  const pickPoint = () => {
    close();
    app.pick = { kind: "custom", onPick: (hit) => {
      const sel = hit && classifyHit(app, hit);
      if (!sel || !hit.point) return toast("Bitte einen Punkt auf einer Komponente anklicken");
      app.cancelPick();
      const own = frames[0].deltas.has(sel.cid) ? sel.cid : c.id;
      if (own !== sel.cid) toast(`»${name(sel.cid)}« bewegt sich nicht mit – Bahn am Antrieb`);
      motionStudyDialog(app, c, { ...st, owner: own, point: [...hit.point] });
    } };
    app.setHint("Bewegungsbahn: Punkt auf einer bewegten Komponente anklicken – Esc bricht ab");
  };
  const keep = () => {
    const n = (asm.motionPaths || []).length + 1;
    app.edit("Bewegungsbahn behalten", () => { asm.motionPaths = [...(asm.motionPaths || []), { id: uid("bb"), name: `Bahn ${n}: ${name(owner)}`, drive: c.id, owner, point, steps: st.steps, pts: path }]; });
    toast("Bahn behalten – sie bleibt in der Baugruppe sichtbar", { kind: "ok" });
    close(); motionStudyDialog(app, c, st);
  };
  const kept = (asm.motionPaths || []).map((p) => h("tr", {},
    h("td", {}, h("input", { type: "checkbox", checked: !p.hidden ? true : undefined, onchange: (e) => { app.edit("Bewegungsbahn", () => { p.hidden = !e.target.checked; }); showPaths(); } })),
    h("td", {}, p.name), h("td", { class: "num" }, fmt(pathLength(p.pts), 1) + " mm"),
    h("td", {}, h("button", { class: "btn", title: "Bahn mit den heutigen Gelenken und Bewegungen neu berechnen", onclick: () => {
      try { const fr = studyFrames(asm, p.drive, p.steps || 36); app.edit("Bewegungsbahn aktualisieren", () => { p.pts = tracePath(fr, p.owner, p.point); }); showPaths(); toast("Bahn neu berechnet", { kind: "ok" }); } catch (e) { toast(e.message, { kind: "err" }); }
    } }, "Neu"), h("button", { class: "btn danger", onclick: () => { app.edit("Bewegungsbahn löschen", () => { asm.motionPaths = asm.motionPaths.filter((x) => x !== p); }); close(); motionStudyDialog(app, c, st); } }, "Löschen"))));
  const seek = () => {
    const t = parseP(target.value);
    if (!t) return toast("Zielpunkt als x; y; z eingeben", { kind: "err" });
    st.target = target.value;
    const r = seekJointValue(asm, c.id, owner, point, t);
    applyDriveValue(app, asm, c.id, r.value, "Punkt anfahren");
    toast(`${c.name} auf ${fmt(r.value, 2)} ${u} – Abstand zum Ziel ${fmt(r.dist, 2)} mm`, { kind: r.dist < 0.01 ? "ok" : "info", timeout: 6000 });
    close();
  };
  const checkColl = async () => {
    collBox.replaceChildren(h("p", { class: "hint" }, "Stellungen werden geprüft …"));
    try {
      const fr = studyFrames(asm, c.id, Math.min(st.steps, 24));
      const rows = await studyCollisions(app, asm, fr);
      const bad = rows.filter((r) => r.hits.length);
      collBox.replaceChildren(bad.length
        ? h("table", { class: "grid" }, h("thead", {}, h("tr", {}, h("th", {}, `${c.name} (${u})`), h("th", {}, "Kollision"))),
          h("tbody", {}, ...bad.map((r) => h("tr", {}, h("td", { class: "num" }, fmt(r.a, 1)), h("td", {}, [...new Set(r.hits.map((x) => `${name(x.a)} ↔ ${name(x.b)}`))].join(", "))))))
        : h("p", { class: "msg info" }, `Keine Kollision in ${rows.length} Stellungen.`));
    } catch (e) { collBox.replaceChildren(h("p", { class: "msg err" }, "Prüfung fehlgeschlagen: " + e.message)); }
  };
  const play = async () => {
    for (const f of [...frames, ...frames.slice().reverse()]) { app.viewer.setComponentDeltas(f.deltas); await new Promise((r) => setTimeout(r, 40)); }
    app.viewer.setComponentDeltas(new Map());
  };
  const stepsInp = h("input", { class: "inp", type: "number", min: "4", max: "360", step: "4", value: st.steps });
  stepsInp.addEventListener("change", () => { const n = Math.round(Number(stepsInp.value)); if (n >= 4 && n <= 360) { close(); motionStudyDialog(app, c, { ...st, steps: n }); } });
  const body = h("div", { class: "motion-study" },
    h("p", {}, `Antrieb »${c.name}« (${isSlide(c.joint) ? "Weg" : "Winkel"} ${fmt(c.joint.min)} … ${fmt(c.joint.max)} ${u}), ${series.length - 1} gekoppelte Gelenke über die Bewegungen.`),
    app.props.field("Stellungen", stepsInp),
    h("h4", {}, "Diagramm"), chart,
    clampedAt.length ? h("p", { class: "msg warn" }, `An ${clampedAt.length} Stellungen stößt ein gekoppeltes Gelenk an seine Grenze (${[...new Set(clampedAt.flatMap((f) => f.clamped))].join(", ")}).`) : null,
    h("h4", {}, "Bewegungsbahn"),
    app.props.field("Komponente", ownerSel),
    h("p", { class: "hint" }, `Punkt ${point.map((x) => fmt(x, 1)).join(" / ")} – Bahnlänge ${fmt(pathLength(path), 1)} mm (gestrichelt im Fenster).`),
    h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: pickPoint }, "Punkt wählen…"), h("button", { class: "btn", onclick: keep }, "Bahn behalten")),
    kept.length ? h("table", { class: "grid" }, h("tbody", {}, ...kept)) : null,
    h("h4", {}, "Punkt anfahren"),
    app.props.field("Ziel", target),
    h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: seek }, "Anfahren")),
    h("h4", {}, "Kollisionen"),
    h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: checkColl }, "Alle Stellungen prüfen")), collBox);
  const m = modal({ title: `Bewegungsuntersuchung – ${c.name}`, width: "600px", body,
    buttons: [{ label: "Abspielen", run: async () => { await play(); return false; } }, { label: "Schließen", primary: true }],
    onClose: () => showKept(app, asm) });
  close = () => m.close();
  return m;
}

const showKept = (app, asm) => app.viewer.showMotionPaths((asm.motionPaths || []).filter((p) => !p.hidden).map((p) => ({ ...p, kept: true })));

/**
 * Grenzen finden (L2, wie SolidCraft »Find Limits«): Gelenk von der heutigen Stellung aus nach beiden Seiten drehen bzw.
 * schieben, bis ein bewegtes Teil ein anderes durchdringt; die Grenze wird auf `refine` genau eingegabelt und Richtung
 * heutiger Stellung gerundet. Eigene Grenzen des Gelenks zählen nicht. Rückgabe { min, max, minBy, maxBy, start }.
 */
export async function findJointLimits(app, asm, c, { coarse = null, refine = null, contact = asm.components.filter((x) => x.contact).map((x) => x.id) } = {}) {
  const j = c.joint, slide = isSlide(j);
  const a0 = Number(j.angle) || 0;
  const range = slide ? 2000 : 360;
  coarse = coarse ?? (slide ? 5 : 5);
  refine = refine ?? (slide ? 0.01 : 0.1);
  const clone = JSON.parse(JSON.stringify(asm));
  const cj = clone.components.find((x) => x.id === c.id).joint;
  cj.min = a0 - range; cj.max = a0 + range;
  if (slide) { cj.smin = a0 - range; cj.smax = a0 + range; }
  const name = (id) => asm.components.find((x) => x.id === id)?.name || id;
  // Kontaktsatz (SolidCraft »contact set«, Komponenten mit c.contact): nur Berührungen zwischen ihnen zählen; die bewegte
  // Komponente und ihre mitgehenden Teile gehören immer dazu
  const set = contact?.length ? new Set([...contact, c.id, ...jointFollowers(asm, c.id)]) : null;
  const hitsAt = async (a) => (await studyCollisions(app, clone, [{ a, deltas: motionDeltas(clone, c.id, a).deltas }]))[0].hits.filter((x) => !set || (set.has(x.a) && set.has(x.b)));
  const start = await hitsAt(a0);
  if (start.length) return { start: start.map((x) => `${name(x.a)} / ${name(x.b)}`) };
  const side = async (s) => {
    let ok = a0, by = null;
    for (let k = 1; k * coarse <= range; k++) {
      const a = a0 + s * k * coarse, hits = await hitsAt(a);
      if (hits.length) {
        let lo = ok, hi = a;
        by = hits[0];
        while (Math.abs(hi - lo) > refine) { const m = (lo + hi) / 2, hm = await hitsAt(m); if (hm.length) { hi = m; by = hm[0]; } else lo = m; }
        const r = s > 0 ? Math.floor(lo / refine) * refine : Math.ceil(lo / refine) * refine;
        return { v: Math.round(r * 1000) / 1000, by: `${name(by.a)} / ${name(by.b)}` };
      }
      ok = a;
    }
    return { v: null, by: null };
  };
  const lo = await side(-1), hi = await side(1);
  // Drehung ohne Anschlag auf einer Seite: eine Umdrehung von der anderen Seite (wie SolidCraft)
  let min = lo.v, max = hi.v;
  if (!slide) { if (min == null && max != null) min = max - 360; if (max == null && min != null) max = min + 360; if (min == null && max == null) { min = a0 - 180; max = a0 + 180; } }
  return { min, max, minBy: lo.by, maxBy: hi.by };
}
