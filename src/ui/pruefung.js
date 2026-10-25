// Problemliste (FU15) und Freigabe (FU13): Oberfläche zu src/core/pruefung.js
import { h, modal, toast, confirmDialog } from "./dom.js";
import { projectProblems, releaseCheck, releaseState, releaseLabel, releaseText, makeRelease, countLevels, featureProblems, partsOf, RELEASE_STATES, FEHLER, WARNUNG, HINWEIS } from "../core/pruefung.js";
import { checkCutList, dfmLimits } from "../core/dfm.js";
import { cutListRows } from "../core/cutlist.js";

const CLS = { [FEHLER]: "err", [WARNUNG]: "warn", [HINWEIS]: "info" };

/** Fertigungsprüfung eines Bauteils mit Profilen (sonst leer) */
export function dfmFor(app) {
  const limits = dfmLimits((k) => app.prefs.get(k));
  return (part, result) => (result.bodies || []).some((b) => b.kind === "member") ? checkCutList(cutListRows([{ part, result, qty: 1 }]), limits) : [];
}

const docOfApp = (app) => (id) => app.doc(id);
const drawingsOf = (app) => (id) => app.project.docs.filter((x) => x.kind === "drawing" && x.source?.id === id);

/** Eintrag der Liste anspringen: Dokument öffnen, Feature wählen */
export function goToProblem(app, it) {
  if (!it.doc || !app.doc(it.doc)) return;
  if (app.activeId !== it.doc) app.openDoc(it.doc);
  if (it.feature && app.feature?.(it.feature)) app.sel = { type: "feature", id: it.feature };
  app.tree.render();
  app.props.render();
}

/** Liste der Einträge, gruppiert nach Dokument; Klick springt hin */
function problemTable(app, items, onPick) {
  if (!items.length) return h("div", { class: "msg info" }, "Keine Fehler, Warnungen oder Hinweise.");
  const groups = new Map();
  for (const it of items) { const k = it.doc || ""; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
  return h("div", { class: "problem-list" }, ...[...groups.values()].map((list) => h("div", { class: "problem-group" },
    h("h4", {}, list[0].docName),
    ...list.map((it) => h("button", { class: "problem msg " + CLS[it.level], disabled: !it.doc, title: it.doc ? "Anzeigen" : "", onclick: () => onPick(it) },
      h("b", {}, it.level + ": "), it.text)))));
}

/** Zähler »2 Fehler · 1 Warnung« */
export function countText(c) {
  const parts = [];
  if (c[FEHLER]) parts.push(`${c[FEHLER]} Fehler`);
  if (c[WARNUNG]) parts.push(`${c[WARNUNG]} Warnung${c[WARNUNG] === 1 ? "" : "en"}`);
  if (c[HINWEIS]) parts.push(`${c[HINWEIS]} Hinweis${c[HINWEIS] === 1 ? "" : "e"}`);
  return parts.join(" · ");
}

/** Schnelle Zählung für die Statusleiste: nur schon berechnete Bauteile des aktiven Dokuments, ohne Fertigungsprüfung */
export function quickCounts(app, d) {
  const list = partsOf(d, docOfApp(app)).flatMap((p) => featureProblems(p, app.results.get(p.id)));
  return countLevels(list);
}

/** Problemliste des ganzen Projekts (alle Bauteile werden dafür berechnet) */
export async function problemsDialog(app) {
  for (const p of app.project.docs.filter((d) => d.kind === "part")) if (!app.results.has(p.id)) await app.buildPart(p);
  const all = projectProblems(app.project, app.results, { dfmFor: dfmFor(app) });
  const show = new Set([FEHLER, WARNUNG, HINWEIS]);
  const box = h("div");
  let dlg;
  const draw = () => box.replaceChildren(problemTable(app, all.filter((x) => show.has(x.level)), (it) => { dlg.close(); goToProblem(app, it); }));
  const c = countLevels(all);
  const filters = h("div", { class: "btn-row" }, ...[FEHLER, WARNUNG, HINWEIS].map((lv) => {
    const b = h("button", { class: "btn on", onclick: () => { if (show.has(lv)) show.delete(lv); else show.add(lv); b.classList.toggle("on", show.has(lv)); draw(); } }, `${lv} (${c[lv]})`);
    return b;
  }));
  draw();
  dlg = modal({ title: "Problemliste", width: "640px",
    body: h("div", { class: "problems-dialog" }, h("p", { class: "hint" }, "Alle Fehler und Hinweise im Projekt: Features, fehlende Verweise und die Fertigungsprüfung der Profile. Ein Klick zeigt die Stelle."), filters, box),
    buttons: [{ label: "Schließen", primary: true }] });
  return all;
}

/** Freigabeprüfung eines Bauteils oder einer Baugruppe (alle Bauteile werden berechnet) */
export async function runReleaseCheck(app, d) {
  await app.builtParts(d);
  return releaseCheck(d, { docOf: docOfApp(app), results: app.results, dfmFor: dfmFor(app), drawingsOf: drawingsOf(app), numberRequired: !!app.prefs.get("dokument.teilenummerPflicht") });
}

/** Ergebnis der Prüfung anzeigen; buttons wie modal(); gibt den gewählten Wert zurück */
function checkDialog(app, title, intro, items, buttons) {
  return new Promise((res) => {
    let dlg;
    dlg = modal({ title, width: "640px", onClose: (v) => res(v),
      body: h("div", {}, h("p", { class: "hint" }, intro), problemTable(app, items, (it) => { dlg.close(undefined); goToProblem(app, it); })),
      buttons });
  });
}

/**
 * Vor der Fertigungsmappe prüfen. Gibt { go, items } zurück: go = false bei Abbruch.
 * Fehler und Warnungen fragen nach, Hinweise allein nicht.
 */
export async function checkBeforeMappe(app, d) {
  const { items } = await runReleaseCheck(app, d);
  const open = items.filter((x) => x.level !== HINWEIS);
  if (!open.length) return { go: true, items };
  const c = countLevels(open);
  const go = await checkDialog(app, "Fertigungsmappe – offene Punkte",
    `${countText(c)}. Die Mappe kann trotzdem entstehen; die offenen Punkte stehen dann auf einer eigenen Seite und der Stand heißt »nicht freigegeben«.`,
    items, [{ label: "Abbrechen", value: false }, { label: "Trotzdem erstellen", value: true, primary: !c[FEHLER] }]);
  return { go: !!go, items };
}

/** Status setzen: Freigeben nur ohne Fehler, Warnungen mit Rückfrage */
export async function setReleaseState(app, d, status) {
  if (status === "freigegeben") {
    const { items, ok } = await runReleaseCheck(app, d);
    const c = countLevels(items);
    if (!ok) {
      await checkDialog(app, "Freigabe nicht möglich", `${countText(c)}. Erst die Fehler beheben, dann freigeben.`, items, [{ label: "Schließen", primary: true }]);
      return false;
    }
    if (c[WARNUNG] && !(await confirmDialog("Freigeben", `${countText(c)}. Trotzdem freigeben?`, { ok: "Freigeben" }))) return false;
  }
  app.edit("Freigabe", () => {
    const r = makeRelease(d, docOfApp(app), status);
    if (r) d.release = r; else delete d.release;
  }, { rebuild: false });
  toast(`${d.name}: ${releaseLabel(status)}`, { kind: "ok" });
  return true;
}

/** Abschnitt »Freigabe« im Eigenschaftenfeld von Bauteil und Baugruppe */
export function releaseSection(props, d) {
  const app = props.app;
  const st = releaseState(d, docOfApp(app));
  const rel = d.release;
  const sel = h("select", { class: "inp", onchange: async (e) => { if (!(await setReleaseState(app, d, e.target.value))) e.target.value = st === "geaendert" ? "freigegeben" : st; app.props.render(); } },
    ...RELEASE_STATES.map((s) => h("option", { value: s.value, selected: s.value === (st === "geaendert" ? "freigegeben" : st) }, s.label)));
  return props.section("Freigabe",
    props.field("Status", sel),
    st === "geaendert" ? h("div", { class: "msg warn" }, "Nach der Freigabe geändert. Neu prüfen und freigeben oder auf »In Arbeit« setzen.") : null,
    rel && st !== "entwurf" ? h("p", { class: "hint" }, releaseText(d, docOfApp(app))) : null,
    h("div", { class: "btn-row" },
      h("button", { class: "btn", onclick: async () => {
        const { items, ok } = await runReleaseCheck(app, d);
        await checkDialog(app, "Prüfung " + d.name, ok ? (items.length ? "Kein Fehler – freigeben ist möglich. Hinweise und Warnungen:" : "Alles vollständig – freigeben ist möglich.") : `${countText(countLevels(items))}. Freigeben geht erst ohne Fehler.`, items, [{ label: "Schließen", primary: true }]);
      } }, "Prüfen…"),
      h("button", { class: "btn", onclick: () => problemsDialog(app) }, "Problemliste")));
}

/** Seite »Offene Punkte« für die Fertigungsmappe (A4 hoch) */
export function openPointsPage(d, items, esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")) {
  const rows = items.filter((x) => x.level !== HINWEIS).map((x) => `<tr><td>${esc(x.level)}</td><td>${esc(x.docName)}</td><td>${esc(x.text)}</td></tr>`).join("");
  return { html: `<div class="lst"><h1>Offene Punkte – nicht freigegeben</h1><div class="sub">${esc(d.name)}${d.number ? " · " + esc(d.number) : ""}</div><table><thead><tr><th>Art</th><th>Dokument</th><th>Punkt</th></tr></thead><tbody>${rows}</tbody></table></div>`, width: 210, height: 297 };
}
