// Parameterstudie (SolidCraft »Parameter sweep«): Dialog. Rechnung je Wert über den Kern, Bewertung in src/core/parameterstudie.js
import { h, toast, modal, fmtNum } from "./dom.js";
import { sweepValues, sweepPart, sweepRow } from "../core/parameterstudie.js";

export function parameterStudyDialog(app) {
  const part = app.activeDoc();
  if (part?.kind !== "part") return toast("Parameterstudie gilt für ein Bauteil");
  const params = part.params || [];
  if (!params.length) return toast("Erst Parameter anlegen (3D-Modell → Parameter)");
  const last = app.studyOpts || { name: params[0].name, from: "", to: "", steps: "10", list: "" };
  const p0 = params.find((p) => p.name === last.name) || params[0];
  const sel = h("select", { class: "inp" }, ...params.map((p) => h("option", { value: p.name, selected: p === p0 ? true : undefined }, `${p.name} = ${p.expr}`)));
  const inp = (v, ph) => h("input", { class: "inp", value: v, placeholder: ph || "" });
  const cur = Number(app.results.get(part.id)?.values?.[p0.name]);
  const from = inp(last.from || (Number.isFinite(cur) ? String(cur / 2) : "")), to = inp(last.to || (Number.isFinite(cur) ? String(cur * 2) : "")), steps = inp(last.steps || "10"), list = inp(last.list, "oder Liste: 10; 20; 35");
  const out = h("div", { class: "study-out" });
  let stop = false;
  const run = async () => {
    let values;
    try { values = sweepValues({ list: list.value, from: from.value, to: to.value, steps: steps.value }); } catch (e) { out.replaceChildren(h("p", { class: "msg err" }, e.message)); return false; }
    app.studyOpts = { name: sel.value, from: from.value, to: to.value, steps: steps.value, list: list.value };
    const base = app.results.get(part.id) || await app.kernel.build(part, app.quality);
    const tbody = h("tbody");
    const prog = h("p", { class: "hint" }, "wird gerechnet …");
    out.replaceChildren(prog, h("table", { class: "grid" }, h("thead", {}, h("tr", {}, ...["Wert", "Ergebnis", "Körper", "Volumen", "Meldung"].map((x) => h("th", {}, x)))), tbody));
    stop = false;
    let bad = 0;
    for (const [k, v] of values.entries()) {
      if (stop) break;
      prog.textContent = `Wert ${k + 1} von ${values.length} …`;
      let row;
      try { row = sweepRow(await app.kernel.build(sweepPart(part, sel.value, v, k), "grob"), base, part.features); }
      catch (e) { row = { verdict: "fehler", fails: [e.message], warnings: [], bodies: 0, volume: 0 }; }
      if (row.verdict !== "ok") bad++;
      const label = { ok: "in Ordnung", warnung: "Warnung", koerper: "Körper fehlt", fehler: "Fehler" }[row.verdict];
      tbody.append(h("tr", { class: "study-" + row.verdict }, h("td", { class: "num" }, fmtNum(v, 3)), h("td", {}, label), h("td", { class: "num" }, String(row.bodies)),
        h("td", { class: "num" }, fmtNum(row.volume / 1000, 2) + " cm³"), h("td", {}, [...row.fails, ...row.warnings].slice(0, 2).join("; "))));
    }
    prog.textContent = stop ? "Angehalten." : bad ? `${bad} von ${values.length} Werten mit Problemen.` : `Alle ${values.length} Werte rechnen ohne Fehler.`;
    return false;
  };
  modal({ title: `Parameterstudie – ${part.name}`, width: "720px", onClose: () => { stop = true; },
    body: h("div", {},
      h("p", { class: "hint" }, "Rechnet das Bauteil für jeden Wert des Parameters in einer Kopie und zeigt, wo Features fehlschlagen, Körper verloren gehen oder Warnungen entstehen. Das Bauteil selbst bleibt unverändert."),
      h("div", { class: "field" }, h("label", {}, "Parameter"), sel),
      h("div", { class: "field" }, h("label", {}, "Von … bis"), h("div", { style: { display: "flex", gap: "6px" } }, from, to)),
      h("div", { class: "field" }, h("label", {}, "Schritte"), steps),
      h("div", { class: "field" }, h("label", {}, "Werteliste"), list), out),
    buttons: [{ label: "Anhalten", run: () => { stop = true; return false; } }, { label: "Rechnen", primary: true, run }, { label: "Schließen" }] });
}
