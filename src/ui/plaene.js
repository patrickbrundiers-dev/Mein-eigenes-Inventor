// Pläne für Baustelle und Montage (Paket H): Ankerplan (P6), Montageplan (P7) und Anschlagpunkte/Hebeösen (P8).
// Die Rechnung liegt in src/core/ankerplan.js, montageplan.js und anschlagpunkte.js; hier Dialoge und Ausgabe.

import { h, toast, modal, fmtNum } from "./dom.js";
import { uid, newPart } from "../core/examples.js";
import { flattenAssembly } from "../core/subasm.js";
import { matApply } from "../core/geom.js";
import { materialOf } from "../core/materials.js";
import { mappeHtml, mappeName } from "../core/mappe.js";
import { collectFootings, anchorPages, anchorCsv, worldBox } from "../core/ankerplan.js";
import { montagePlan, montagePages, montageCsv } from "../core/montageplan.js";
import { eyeSize, proposeEyes, liftCheck, tapHole } from "../core/anschlagpunkte.js";
import { DIN580, familyDesignation, NORM_FAMILIES } from "../core/normlib.js";
import { bomRows } from "./props.js";

/** Bauteil-Vorkommen mit gebauten Körpern in Weltlage */
export function occurrences(app, d) {
  if (d.kind === "part") return [{ part: d, name: d.name, matrix: null, bodies: app.results.get(d.id)?.bodies || [] }];
  return flattenAssembly(d, (id) => app.doc(id)).map((o) => ({ part: o.part, name: o.path.join(" / "), matrix: o.matrix, bodies: app.results.get(o.part.id)?.bodies || [] }));
}

async function savePages(app, pages, title, base) {
  const f = app.files, html = mappeHtml(pages, { title });
  if (f.bridge?.renderPdf) await f.saveBinary(new Uint8Array(await f.bridge.renderPdf(html)), base + ".pdf", [{ name: "PDF", extensions: ["pdf"] }]);
  else await f.saveText(html, base + ".html", "text/html", [{ name: "HTML", extensions: ["html"] }]);
}
const today = () => new Date().toLocaleDateString("de-DE");

/** Ankerplan (P6): Grundriss mit Achsraster und Ankerliste als PDF, dazu CSV */
export async function exportAnkerplan(app) {
  const d = app.activeDoc();
  if (d?.kind !== "assembly" && d?.kind !== "part") return toast("Ankerplan gibt es für Baugruppen und Bauteile");
  await app.builtParts(d);
  const plan = collectFootings(occurrences(app, d), { grids: d.grids || [] });
  if (!plan.feet.length) return toast("Keine Anker gefunden – Stützenfüße (Stahlbau → Stützenfuß) oder Anker aus der Normteil-Bibliothek einbauen");
  const n = plan.feet.reduce((a, f) => a + f.anchors.length, 0);
  const base = mappeName("Ankerplan_" + (d.number || d.name));
  modal({ title: `Ankerplan – ${d.name}`, width: "560px",
    body: h("div", {},
      h("p", {}, `${plan.feet.length} Stützenfüße mit ${n} Ankern${(d.grids || []).length ? ", Achsbezug aus dem Achsraster" : " (ohne Achsraster: nur Koordinaten)"}.`),
      h("table", { class: "grid" }, h("thead", {}, h("tr", {}, ...["Pos", "Achse", "Mitte X / Y", "UK Platte", "Anker", "Lochbild"].map((x) => h("th", {}, x)))),
        h("tbody", {}, ...plan.feet.slice(0, 12).map((f) => h("tr", {}, h("td", { class: "num" }, String(f.pos)), h("td", {}, f.axis || "–"), h("td", { class: "num" }, `${fmtNum(f.center[0], 0)} / ${fmtNum(f.center[1], 0)}`), h("td", { class: "num" }, fmtNum(f.uk, 0)), h("td", {}, f.anchorText), h("td", {}, f.pattern))))),
      plan.feet.length > 12 ? h("p", { class: "hint" }, `… und ${plan.feet.length - 12} weitere`) : null),
    buttons: [{ label: "Abbrechen" },
      { label: "CSV", run: async () => { await app.files.saveText(anchorCsv(plan, d.name), base + ".csv", "text/csv", [{ name: "CSV (Excel)", extensions: ["csv"] }]); } },
      { label: "PDF", primary: true, run: async () => { await savePages(app, anchorPages(plan, { title: d.name, number: d.number, date: today(), grids: d.grids || [] }), "Ankerplan " + d.name, base); } }] });
}

/** Montageplan (P7): Positionen im Grundriss und in der Ansicht, Gewichte, Verbindungsliste je Schraubknoten */
export async function exportMontageplan(app) {
  const d = app.activeDoc();
  if (d?.kind !== "assembly") return toast("Montageplan gibt es für Baugruppen");
  await app.builtParts(d);
  const plan = montagePlan(bomRows(app, d), occurrences(app, d));
  if (!plan.items.length) return toast("Keine Bauteile in der Baugruppe");
  const base = mappeName("Montageplan_" + (d.number || d.name));
  modal({ title: `Montageplan – ${d.name}`, width: "520px",
    body: h("div", {},
      h("p", {}, `${plan.items.length} Teile, zusammen ${fmtNum(plan.total, 1)} kg, ${plan.nodes.length} Schraubknoten.`),
      plan.heaviest ? h("p", {}, `Schwerstes Teil: Pos ${plan.heaviest.pos} ${plan.heaviest.name} – ${fmtNum(plan.heaviest.mass, 1)} kg (Kran/Hebezeug danach wählen).`) : null,
      h("p", { class: "hint" }, "Der Plan zeigt Grundriss und Vorderansicht mit den Positionsnummern im Schwerpunkt, dazu Teile- und Verbindungsliste zum Abhaken.")),
    buttons: [{ label: "Abbrechen" },
      { label: "CSV", run: async () => { await app.files.saveText(montageCsv(plan, d.name), base + ".csv", "text/csv", [{ name: "CSV (Excel)", extensions: ["csv"] }]); } },
      { label: "PDF", primary: true, run: async () => { await savePages(app, montagePages(plan, { title: d.name, number: d.number, date: today() }), "Montageplan " + d.name, base); } }] });
}

/** Gewicht (kg), Schwerpunkt und Hülle eines Dokuments aus den gebauten Körpern */
export function massProps(app, d) {
  let m = 0, c = [0, 0, 0], box = null;
  for (const o of occurrences(app, d)) {
    const dens = materialOf(o.part.material).density;
    for (const b of o.bodies) {
      const p = b.props;
      if (!p?.bbox) continue;
      const w = worldBox(p.bbox, o.matrix);
      box = box ? { min: box.min.map((v, k) => Math.min(v, w.min[k])), max: box.max.map((v, k) => Math.max(v, w.max[k])) } : w;
      if (!(p.volume > 0) || !p.center) continue;
      const mk = (p.volume * (b.meta?.density ?? dens)) / 1e6;
      const cc = o.matrix ? matApply(o.matrix, p.center) : p.center;
      m += mk; c = c.map((x, k) => x + cc[k] * mk);
    }
  }
  return { mass: m, cog: m > 0 ? c.map((x) => x / m) : null, box };
}

/** Anschlagpunkte (P8): Ringschrauben DIN 580 aus Schwerpunkt und Gewicht vorschlagen, prüfen und einfügen */
export async function anschlagDialog(app) {
  const d = app.activeDoc();
  if (d?.kind !== "part" && d?.kind !== "assembly") return toast("Anschlagpunkte gibt es für Bauteile und Baugruppen");
  await app.builtParts(d);
  const mp = massProps(app, d);
  if (!mp.cog || !mp.box) return toast("Kein Körper mit Volumen – erst modellieren");
  const st = { n: 2, angle: "45", size: "", grade: "C15E" };
  const out = h("div", {});
  let eyes = [];
  const sizeSel = h("select", { class: "inp" }, h("option", { value: "" }, "automatisch"), ...Object.keys(DIN580).map((k) => h("option", { value: k }, k)));
  sizeSel.addEventListener("change", () => { st.size = sizeSel.value; draw(); });
  const sel = (key, opts) => { const el = h("select", { class: "inp" }, ...opts.map(([v, l]) => h("option", { value: v }, l))); el.addEventListener("change", () => { st[key] = el.value; draw(); }); return el; };
  const field = (l, el) => h("div", { class: "field" }, h("label", {}, l), el);
  const draw = () => {
    const n = Number(st.n);
    eyes = proposeEyes(mp.box, mp.cog, n);
    const auto = eyeSize(mp.mass, n, st.angle);
    const sz = st.size || auto?.size || "";
    const chk = liftCheck(eyes, mp.cog, mp.mass, { size: sz, angle: st.angle });
    const tap = tapHole(sz);
    out.replaceChildren(
      h("p", {}, `Gewicht ${fmtNum(mp.mass, 1)} kg, Schwerpunkt X ${fmtNum(mp.cog[0], 0)} / Y ${fmtNum(mp.cog[1], 0)} / Z ${fmtNum(mp.cog[2], 0)} mm.`),
      !auto && !st.size ? h("p", { class: "bad" }, "Zu schwer für Ringschrauben DIN 580 – Traverse oder angeschweißte Anschlagpunkte verwenden") : null,
      h("p", {}, sz ? `Ringschraube DIN 580 ${sz} (${st.angle === "0" ? "senkrecht" : "bis 45°"} je Öse ${fmtNum(st.angle === "0" ? DIN580[sz].wll : DIN580[sz].wll45 / 2, 0)} kg)` + (tap ? `, Gewindebohrung ${tap.thread} (Kernloch Ø ${fmtNum(tap.core, 1)}) mindestens ${tap.depth} mm tief` : "") : ""),
      h("table", { class: "grid" }, h("thead", {}, h("tr", {}, ...["Öse", "X", "Y", "Z", "Last kg"].map((x) => h("th", {}, x)))),
        h("tbody", {}, ...eyes.map((e, i) => h("tr", {}, h("td", { class: "num" }, String(i + 1)), ...e.map((v) => h("td", { class: "num" }, fmtNum(v, 0))), h("td", { class: "num" }, fmtNum(chk.loads[i] ?? 0, 0)))))),
      ...chk.issues.map((x) => h("p", { class: x.level === "Fehler" ? "bad" : "hint" }, `${x.level}: ${x.message}`)));
  };
  draw();
  const insert = () => {
    const sz = st.size || eyeSize(mp.mass, Number(st.n), st.angle)?.size;
    if (!sz) { toast("Keine passende Größe – Traverse verwenden"); return false; }
    const fam = NORM_FAMILIES.din580, name = familyDesignation(fam, { size: sz, grade: st.grade });
    const feat = (pos, i) => ({ id: uid("f"), type: "normteil", name: `Ringschraube ${i + 1}`, kind: "din580", size: sz, length: "0", grade: st.grade, galv: false, pos: pos.map((v) => String(Math.round(v * 10) / 10)), axis: "Z" });
    if (d.kind === "part") app.edit("Anschlagpunkte", () => { eyes.forEach((p, i) => d.features.push(feat(p, i))); });
    else app.edit("Anschlagpunkte", () => {
      let p = app.parts().find((x) => x.normDesignation === name);
      if (!p) { p = newPart(name); p.normDesignation = name; p.features.push({ ...feat([0, 0, 0], 0), name }); app.project.docs.push(p); }
      eyes.forEach((e, i) => d.components.push({ id: uid("c"), part: p.id, name: `${name}:${i + 1}`, pos: e.map((v) => Math.round(v * 10) / 10), rot: [0, 0, 0] }));
    });
    toast(`${eyes.length} × ${name} eingefügt – Gewindebohrungen im Bauteil anbringen`, { kind: "ok", timeout: 6000 });
  };
  modal({ title: `Anschlagpunkte – ${d.name}`, width: "600px",
    body: h("div", {},
      h("div", { class: "row" }, field("Anzahl Ösen", sel("n", [["2", "2 Ösen"], ["4", "4 Ösen (3 tragend)"]])), field("Anschlag", sel("angle", [["45", "Kette/Band bis 45°"], ["0", "senkrecht (Traverse)"]])), field("Größe", sizeSel), field("Werkstoff", sel("grade", [["C15E", "C15E (Stahl)"], ["A2", "Edelstahl A2"]]))),
      out,
      h("p", { class: "hint" }, "Ösen oben auf der Hülle, symmetrisch zum Schwerpunkt. Nach dem Einfügen lassen sie sich wie jedes Normteil verschieben; die Prüfung hier gilt für den Vorschlag.")),
    buttons: [{ label: "Schließen" }, { label: "Ösen einfügen", primary: true, run: insert }] });
}
