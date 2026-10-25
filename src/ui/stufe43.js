// Werkzeuge Stufe 43 in der Oberfläche: Variantentabelle, Regeln, Makros
import { h, toast, modal } from "./dom.js";
import { uid } from "../core/examples.js";
import { checkVariants, syncVariants, emptyVariants } from "../core/varianten.js";
import { RULE_KINDS, defaultRule } from "../core/regeln.js";
import { COMMANDS, commandDef } from "../core/commands.js";
import { recordable } from "../core/makros.js";

const activePart = (app) => {
  const d = app.activeDoc();
  if (d?.kind !== "part") { toast("Gilt für ein Bauteil – erst ein Bauteil öffnen"); return null; }
  return d;
};

// ---------- Varianten ----------
/** Abschnitt in den Bauteil-Eigenschaften: Werksbauteil mit Tabelle oder Variante eines Werksbauteils */
export function variantSection(P, part) {
  const app = P.app;
  if (part.variant) {
    const f = app.doc(part.variant.of);
    const row = f?.variants?.rows?.find((r) => r.id === part.variant.row);
    return P.section("Variante",
      h("div", { class: "msg info" }, f ? `Variante »${row?.name || "?"}« von »${f.name}« – schreibgeschützt, geändert wird im Werksbauteil.` : "Werksbauteil fehlt – Variante bleibt mit ihrem letzten Stand."),
      row ? null : h("p", { class: "hint" }, "Die Zeile gibt es in der Tabelle nicht mehr."),
      h("div", { class: "btn-row" },
        f ? h("button", { class: "btn", onclick: () => app.openDoc(f.id) }, "Werksbauteil öffnen") : null,
        h("button", { class: "btn", onclick: () => app.edit("Variante lösen", () => { delete app.doc(part.id).variant; }, { link: true, rebuild: false }) }, "Als eigenes Bauteil lösen")));
  }
  if (!part.variants?.rows?.length) return null;
  const members = app.project.docs.filter((d) => d.variant?.of === part.id);
  const errs = checkVariants(part);
  return P.section("Variantentabelle",
    h("p", { class: "hint" }, `${part.variants.rows.length} Variante(n) über ${part.variants.columns.join(", ") || "–"}; ${members.length} als Bauteil erzeugt.`),
    errs.length ? h("div", { class: "msg err" }, errs.slice(0, 3).join("; ")) : null,
    h("div", { class: "btn-row" },
      h("button", { class: "btn", onclick: () => variantDialog(app) }, "Tabelle bearbeiten"),
      h("button", { class: "btn primary", onclick: () => generateVariants(app, part) }, members.length ? "Varianten aktualisieren" : "Varianten erzeugen")));
}

export function generateVariants(app, part) {
  const errs = checkVariants(part);
  if (errs.length) return toast("Variantentabelle: " + errs[0], { kind: "err", timeout: 6000 });
  let r;
  app.edit("Varianten erzeugen", () => { part = app.doc(part.id); r = syncVariants(app.project.docs, part, () => uid("p")); app.project.docs = r.docs; }, { link: true, rebuild: false });
  if (r) toast(`${r.created} Variante(n) neu, ${r.updated} aktualisiert${r.orphans.length ? ` – ohne Zeile: ${r.orphans.join(", ")}` : ""}`, { kind: "ok", timeout: 5000 });
  app.tree.render();
}

/** Tabelle bearbeiten: Spalten = Parameter, Zeilen = Varianten */
export function variantDialog(app) {
  const part = activePart(app);
  if (!part) return;
  if (part.variant) return toast("Das ist eine Variante – die Tabelle gehört zum Werksbauteil", { kind: "err" });
  if (!part.params?.length) return toast("Erst Parameter anlegen (Verwalten → Parameter) – sie werden die Spalten der Tabelle");
  const v = JSON.parse(JSON.stringify(part.variants || emptyVariants()));
  if (!v.columns.length) v.columns = part.params.slice(0, 3).map((p) => p.name);
  if (!v.rows.length) v.rows.push({ id: uid("r"), name: part.name + "-1", number: "", values: Object.fromEntries(v.columns.map((c) => [c, part.params.find((p) => p.name === c)?.expr ?? ""])) });
  const box = h("div", { class: "var-table" });
  const msg = h("div");
  const draw = () => {
    const head = h("tr", {}, h("th", {}, "Name"), h("th", {}, "Sachnummer"), ...v.columns.map((c, ci) => h("th", {},
      h("select", { class: "inp", onchange: (e) => { const nc = e.target.value; for (const r of v.rows) { r.values[nc] = r.values[c]; delete r.values[c]; } v.columns[ci] = nc; draw(); } },
        ...part.params.map((p) => h("option", { value: p.name, selected: p.name === c }, p.name))),
      h("button", { class: "icon-btn", title: "Spalte entfernen", onclick: () => { v.columns.splice(ci, 1); draw(); } }, "×"))), h("th"));
    const rows = v.rows.map((r, ri) => h("tr", {},
      h("td", {}, h("input", { class: "inp", value: r.name, onchange: (e) => { r.name = e.target.value.trim(); check(); } })),
      h("td", {}, h("input", { class: "inp", value: r.number || "", onchange: (e) => { r.number = e.target.value.trim(); } })),
      ...v.columns.map((c) => h("td", {}, h("input", { class: "inp", value: r.values?.[c] ?? "", placeholder: part.params.find((p) => p.name === c)?.expr, onchange: (e) => { r.values = { ...r.values, [c]: e.target.value.trim() }; check(); } }))),
      h("td", {}, h("button", { class: "icon-btn", title: "Zeile entfernen", onclick: () => { v.rows.splice(ri, 1); draw(); } }, "×"))));
    box.replaceChildren(h("table", { class: "grid" }, h("thead", {}, head), h("tbody", {}, ...rows)),
      h("div", { class: "btn-row" },
        h("button", { class: "btn", onclick: () => { const last = v.rows.at(-1); v.rows.push({ id: uid("r"), name: `${part.name}-${v.rows.length + 1}`, number: "", values: { ...(last?.values || {}) } }); draw(); } }, "Zeile hinzufügen"),
        h("button", { class: "btn", disabled: v.columns.length >= part.params.length, onclick: () => { const free = part.params.find((p) => !v.columns.includes(p.name)); if (free) { v.columns.push(free.name); draw(); } } }, "Spalte hinzufügen")));
    check();
  };
  const check = () => { const e = checkVariants({ ...part, variants: v }); msg.replaceChildren(e.length ? h("div", { class: "msg err" }, e.slice(0, 4).join("; ")) : h("p", { class: "hint" }, `${v.rows.length} Variante(n) – leere Zellen übernehmen den Wert des Werksbauteils.`)); return e; };
  draw();
  modal({
    title: `Variantentabelle – ${part.name}`, width: "860px",
    body: h("div", {}, h("p", { class: "hint" }, "Jede Zeile wird ein eigenes Bauteil (Variante) mit den Parameterwerten der Zeile. Varianten folgen jeder Änderung am Werksbauteil."), box, msg),
    buttons: [
      { label: "Abbrechen" },
      { label: "Übernehmen und Varianten erzeugen", primary: true, run: () => {
        if (check().length) return false;
        if (!app.edit("Variantentabelle", () => { app.doc(part.id).variants = v; }, { rebuild: false })) return false;
        generateVariants(app, app.doc(part.id));
      } },
    ],
  });
}

// ---------- Regeln ----------
export function rulesSection(P, part) {
  if (!part.rules?.length) return null;
  const r = P.app.results.get(part.id);
  const msgs = r?.rules || [];
  return P.section("Regeln",
    h("p", { class: "hint" }, `${part.rules.filter((x) => !x.off).length} von ${part.rules.length} Regel(n) aktiv`),
    ...msgs.map((m) => h("div", { class: "msg " + (m.level === "Fehler" ? "err" : "info") }, m.text)),
    h("div", { class: "btn-row" }, h("button", { class: "btn", onclick: () => rulesDialog(P.app) }, "Regeln bearbeiten")));
}

export function rulesDialog(app) {
  const part = activePart(app);
  if (!part) return;
  const rules = JSON.parse(JSON.stringify(part.rules || []));
  const box = h("div", { class: "rule-list" });
  const params = (part.params || []).map((p) => [p.name, p.name]);
  const feats = (part.features || []).map((f) => [f.id, f.name]);
  const sel = (opts, value, on) => h("select", { class: "inp", onchange: (e) => on(e.target.value) }, h("option", { value: "" }, "– wählen –"), ...opts.map(([v, l]) => h("option", { value: v, selected: v === value }, l)));
  const inp = (value, on, placeholder = "") => h("input", { class: "inp", value: value ?? "", placeholder, spellcheck: "false", onchange: (e) => on(e.target.value.trim()) });
  const draw = () => {
    box.replaceChildren(...rules.map((r, i) => h("div", { class: "rule" + (r.off ? " off" : "") },
      h("div", { class: "rule-head" },
        h("strong", {}, `${i + 1}. ${RULE_KINDS.find(([k]) => k === r.kind)?.[1]}`),
        inp(r.name, (v) => { r.name = v; }, "Name (optional)"),
        h("label", {}, h("input", { type: "checkbox", checked: !r.off, onchange: (e) => { r.off = !e.target.checked; draw(); } }), " aktiv"),
        h("button", { class: "icon-btn", title: "Nach oben", disabled: i === 0, onclick: () => { [rules[i - 1], rules[i]] = [rules[i], rules[i - 1]]; draw(); } }, "↑"),
        h("button", { class: "icon-btn", title: "Entfernen", onclick: () => { rules.splice(i, 1); draw(); } }, "×")),
      h("div", { class: "rule-body" },
        h("span", {}, "wenn"), inp(r.when, (v) => { r.when = v; }, r.kind === "setzen" ? "immer (leer) oder z. B. L > 2000" : "z. B. L > 6000"),
        ...(r.kind === "setzen" ? [h("span", {}, "dann"), sel(params, r.param, (v) => { r.param = v; }), h("span", {}, "="), inp(r.value, (v) => { r.value = v; }, "z. B. ceil(L / 1000) + 1")]
          : r.kind === "unterdruecken" ? [h("span", {}, "dann unterdrücken:"), sel(feats, r.feature, (v) => { r.feature = v; })]
          : [h("span", {}, "dann melden:"), inp(r.message, (v) => { r.message = v; }, "Text der Meldung"), sel([["Hinweis", "Hinweis"], ["Fehler", "Fehler"]], r.level || "Hinweis", (v) => { r.level = v || "Hinweis"; })])))),
    rules.length ? "" : h("p", { class: "hint" }, "Noch keine Regel."),
    h("div", { class: "btn-row" }, ...RULE_KINDS.map(([k, l]) => h("button", { class: "btn", onclick: () => { rules.push(defaultRule(k, uid("rg"))); draw(); } }, "+ " + l))));
  };
  draw();
  modal({
    title: `Regeln – ${part.name}`, width: "820px",
    body: h("div", {}, h("p", { class: "hint" }, "Regeln laufen vor jedem Neuberechnen in dieser Reihenfolge. Bedingungen und Werte sind Ausdrücke mit den Parametern (Vergleiche < > <= >= == !=, wenn(), min(), max(), round(), ceil()). Ergebnis und Meldungen stehen in den Bauteil-Eigenschaften."), box),
    buttons: [{ label: "Abbrechen" }, { label: "Übernehmen", primary: true, run: () => { if (!app.edit("Regeln", () => { app.doc(part.id).rules = rules; })) return false; } }],
  });
}

// ---------- Makros ----------
export function macroDialog(app) {
  const list = JSON.parse(JSON.stringify(app.prefs.get("werkzeuge.makros") || []));
  const box = h("div", { class: "macro-list" });
  const cmds = COMMANDS.filter((c) => recordable(c.id)).sort((a, b) => a.label.localeCompare(b.label, "de"));
  const draw = () => {
    box.replaceChildren(...list.map((m, i) => h("div", { class: "macro" },
      h("div", { class: "rule-head" },
        h("input", { class: "inp", value: m.name, onchange: (e) => { m.name = e.target.value.trim(); } }),
        h("button", { class: "btn", onclick: () => { save(); app.commands.exec("macro." + m.id); } }, "Ausführen"),
        h("button", { class: "icon-btn", title: "Makro löschen", onclick: () => { list.splice(i, 1); draw(); } }, "×")),
      h("ol", {}, ...m.steps.map((s, k) => h("li", {}, commandDef(s)?.label || s, " ",
        h("button", { class: "icon-btn", title: "Nach oben", disabled: k === 0, onclick: () => { [m.steps[k - 1], m.steps[k]] = [m.steps[k], m.steps[k - 1]]; draw(); } }, "↑"),
        h("button", { class: "icon-btn", title: "Schritt entfernen", onclick: () => { m.steps.splice(k, 1); draw(); } }, "×")))),
      h("select", { class: "inp", onchange: (e) => { if (e.target.value) { m.steps.push(e.target.value); draw(); } } }, h("option", { value: "" }, "+ Schritt hinzufügen …"), ...cmds.map((c) => h("option", { value: c.id }, `${c.label} (${c.group})`))))),
    list.length ? "" : h("p", { class: "hint" }, "Noch kein Makro. »Makro aufzeichnen« in der Befehlssuche nimmt Befehle auf, oder hier ein leeres Makro anlegen."),
    h("div", { class: "btn-row" },
      h("button", { class: "btn", onclick: () => { list.push({ id: Math.random().toString(36).slice(2, 10), name: `Makro ${list.length + 1}`, steps: [] }); draw(); } }, "Neues Makro"),
      h("button", { class: "btn", onclick: () => { save(); app.commands.toggleRecording(); } }, app.commands.recording ? "Aufzeichnung beenden" : "Aufzeichnen")));
  };
  const save = () => {
    const keep = list.filter((m) => m.steps.length);
    const r = app.prefs.set("werkzeuge.makros", keep);
    if (!r.ok) { toast(r.error, { kind: "err" }); return false; }
    return true;
  };
  draw();
  modal({
    title: "Makros", width: "640px",
    body: h("div", {}, h("p", { class: "hint" }, "Ein Makro führt Befehle nacheinander aus (z. B. Neu berechnen, STEP und Zuschnittliste exportieren). Aufrufen über die Befehlssuche (Strg+K, »Makro: …«). Makros ohne Schritte werden nicht gespeichert."), box),
    buttons: [{ label: "Schließen" }, { label: "Speichern", primary: true, run: () => (save() ? undefined : false) }],
  });
}
