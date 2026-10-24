// Oberflächentest im Browser: klickt Kernabläufe durch und speichert Bildschirmfotos
// Aufruf: node tools/e2e.mjs [ausgabeordner]
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { serve } from "./serve.mjs";

const outDir = path.resolve(process.argv[2] || "e2e-out");
fs.mkdirSync(outDir, { recursive: true });
const port = 4199;
const srv = await serve(port);
const report = { steps: [], console: [], errors: [] };
const t0 = Date.now();
const step = (name, ok, info = "") => { report.steps.push({ name, ok, info, t: ((Date.now() - t0) / 1000).toFixed(1) }); console.log(ok ? "✔" : "✘", name, info); };

const launchOpts = { headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--window-size=1600,1000"] };
let browser;
try { browser = await chromium.launch({ ...launchOpts, channel: "chrome" }); }
catch { browser = await chromium.launch({ ...launchOpts, executablePath: process.env.CHROME_PATH }); }
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
page.on("console", (m) => report.console.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => report.errors.push(String(e.stack || e)));

const shot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: path.join(outDir, name + ".png") }); };
const idle = async (ms = 60000) => {
  await page.waitForFunction(() => window.__werkcad && !window.__werkcad.busy, null, { timeout: ms, polling: 200 });
  await page.waitForTimeout(500);
  await page.waitForFunction(() => !window.__werkcad.busy, null, { timeout: ms, polling: 200 });
};
const evalApp = (fn, arg) => page.evaluate(fn, arg);

try {
  await page.goto(`http://localhost:${port}/index.html`);
  await page.waitForFunction(() => !!window.__werkcad, null, { timeout: 20000 });
  await shot("01-start");
  step("Startbildschirm", true);

  // Kern bereit?
  const ping = await evalApp(async () => { const t = performance.now(); await window.__werkcad.kernel.ready; return performance.now() - t; });
  step("Geometrie-Kern geladen", true, `${Math.round(ping)} ms`);

  // Beispielprojekt
  await evalApp(() => { window.__werkcad.dirty = false; return window.__werkcad.openExample(); });
  await idle(120000);
  await shot("02-beispiel-baugruppe");
  const asmInfo = await evalApp(() => { const a = window.__werkcad; return { mode: a.mode, doc: a.activeDoc()?.name, results: [...a.results.keys()], errors: [...a.results.values()].flatMap((r) => Object.values(r.status).filter((s) => !s.ok).map((s) => s.error)) }; });
  step("Beispiel-Baugruppe", asmInfo.mode === "assembly" && asmInfo.errors.length === 0, JSON.stringify(asmInfo));

  for (const [id, name] of [["beispiel_platte", "03-grundplatte"], ["beispiel_rahmen", "04-rahmen"], ["beispiel_rohr", "05-rohr"]]) {
    await evalApp((i) => window.__werkcad.openDoc(i), id);
    await idle();
    await shot(name);
    const info = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { bodies: r?.bodies.length, errors: Object.entries(r?.status || {}).filter(([, s]) => !s.ok) }; });
    step("Bauteil " + id, info.bodies > 0 && info.errors.length === 0, JSON.stringify(info));
  }

  // Zuschnittliste im Eigenschaftsfenster sichtbar (Rahmen)
  await evalApp(() => window.__werkcad.openDoc("beispiel_rahmen"));
  await idle();
  const cut = await page.locator("#props table.grid").count();
  step("Zuschnittliste angezeigt", cut > 0);

  // Feature auswählen -> Eigenschaften
  await evalApp(() => { const a = window.__werkcad; a.openDoc("beispiel_platte"); });
  await idle();
  await page.locator("#browser .node", { hasText: "Bohrungen M10" }).click();
  await page.waitForTimeout(300);
  await shot("06-feature-eigenschaften");
  step("Feature-Eigenschaften", (await page.locator("#props .section").count()) > 0);

  // Parameter ändern -> Neuaufbau
  await evalApp(() => { const a = window.__werkcad; const p = a.activeDoc(); a.edit("Test", () => { p.params.find((x) => x.name === "Länge").expr = "400"; }); });
  await idle();
  const bb = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return r.bodies[0].props.bbox; });
  step("Parameteränderung", Math.abs(bb[1][0] - bb[0][0] - 400) < 1e-3, JSON.stringify(bb));
  await shot("07-parameter-400");

  // Neues Bauteil per Oberfläche: Skizze auf XY, Rechteck zeichnen, bemaßen, extrudieren
  await evalApp(() => window.__werkcad.newPart("Testteil"));
  await idle();
  await page.keyboard.press("s");
  await page.waitForTimeout(200);
  await page.locator("#props button", { hasText: "XY-Ebene" }).click();
  await page.waitForTimeout(800);
  await shot("08-skizze-leer");
  await page.locator("#ribbon button", { hasText: "Rechteck" }).first().click();
  const box = await page.locator("#viewer canvas").boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx - 150, cy + 80);
  await page.mouse.click(cx - 150, cy + 80);
  await page.mouse.move(cx + 120, cy - 60, { steps: 5 });
  await shot("09-skizze-rechteck-vorschau");
  await page.mouse.click(cx + 120, cy - 60);
  await page.waitForTimeout(300);
  const skInfo = await evalApp(() => { const s = window.__werkcad.sketcher; return { ents: s.sk.entities.length, cons: s.sk.constraints.length, dof: s.lastSolve?.dof, regions: s.profiles?.regions.length }; });
  step("Rechteck gezeichnet", skInfo.regions === 1, JSON.stringify(skInfo));
  // Kreis
  await page.locator("#ribbon button", { hasText: "Kreis" }).first().click();
  await page.mouse.click(cx - 10, cy + 10);
  await page.mouse.click(cx + 20, cy + 10);
  // Bemaßung: untere Linie anklicken, Lage klicken, Wert eingeben
  await page.keyboard.press("d");
  await page.mouse.click(cx - 20, cy + 80);
  await page.mouse.click(cx - 20, cy + 130);
  await page.waitForTimeout(200);
  const hasInput = await page.locator(".dim-input input").count();
  if (hasInput) { await page.locator(".dim-input input").fill("120"); await page.keyboard.press("Enter"); }
  await page.waitForTimeout(300);
  await shot("10-skizze-bemasst");
  const dims = await evalApp(() => window.__werkcad.sketcher.sk.constraints.filter((c) => c.type === "length" || c.type === "distance").map((c) => c.value));
  step("Bemaßung per Klick", dims.includes("120"), JSON.stringify(dims));
  await page.locator("#ribbon button", { hasText: "Skizze fertig" }).click();
  await page.waitForTimeout(300);
  await page.locator("#ribbon button", { hasText: "Extrusion" }).first().click();
  await idle();
  await shot("11-extrusion");
  const ext = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { bodies: r?.bodies.length, vol: r?.bodies[0]?.props?.volume, status: r?.status }; });
  step("Extrusion aus gezeichneter Skizze", ext.bodies === 1 && ext.vol > 0, JSON.stringify({ bodies: ext.bodies, vol: ext.vol }));

  // Kante wählen und Rundung
  await page.mouse.click(box.x + 5, box.y + 5);
  await evalApp(() => window.__werkcad.viewer.setView("iso", { animate: false }));
  await page.waitForTimeout(400);
  const edgePick = await evalApp(() => {
    const a = window.__werkcad;
    const v = a.viewer;
    const rect = v.renderer.domElement.getBoundingClientRect();
    // senkrechte Kante finden und anklicken
    const pk = v.pickables[0];
    const edges = pk.lines.userData.edges;
    const i = edges.findIndex((e) => e.type === "LINE" && e.mid && Math.abs(e.positions[2] - e.positions[5]) > 1);
    const s = v.worldToScreen(edges[i].mid);
    return { x: rect.left + s[0], y: rect.top + s[1] };
  });
  await page.mouse.click(edgePick.x, edgePick.y);
  await page.waitForTimeout(200);
  await page.locator("#ribbon button", { hasText: "Rundung" }).first().click();
  await idle();
  await shot("12-rundung");
  const fil = await evalApp(() => { const a = window.__werkcad; const p = a.activeDoc(); const f = p.features[p.features.length - 1]; const r = a.results.get(p.id); return { type: f.type, edges: f.edges?.length, status: r.status[f.id] }; });
  step("Rundung an gewählter Kante", fil.type === "fillet" && fil.edges === 1 && fil.status?.ok, JSON.stringify(fil));

  // Rohr-Profil
  await evalApp(() => window.__werkcad.selectFeature(null));
  await page.locator("#ribbon button", { hasText: "Rohr / Profil" }).click();
  await idle();
  await shot("13-profil");

  // Zeichnung
  await evalApp(() => window.__werkcad.openDoc("beispiel_zeichnung"));
  await idle(120000);
  await page.waitForTimeout(1500);
  await idle(120000);
  await shot("14-zeichnung");
  const dw = await evalApp(() => { const d = window.__werkcad.drawing; return { views: d.doc.views.length, proj: [...d.proj.values()].map((p) => ({ vis: p.visible.length, hid: p.hidden.length, err: p.error })) }; });
  step("Zeichnungsansichten", dw.proj.length === dw.views && dw.proj.every((p) => p.vis > 0 && !p.err), JSON.stringify(dw));
  await evalApp(() => window.__werkcad.drawing.autoDims());
  await page.waitForTimeout(300);
  await shot("15-zeichnung-masse");
  const svgLen = await evalApp(() => window.__werkcad.drawing.exportSvgString().length);
  step("SVG-Export", svgLen > 2000, String(svgLen));

  // Neue Zeichnung der Baugruppe mit Grundansichten
  await evalApp(() => window.__werkcad.newDrawing({ kind: "assembly", id: "beispiel_bg" }));
  await idle(120000);
  await page.waitForTimeout(1000);
  await idle(120000);
  await shot("16-zeichnung-baugruppe");
  const dw2 = await evalApp(() => window.__werkcad.drawing.doc.views.length);
  step("Grundansichten automatisch", dw2 === 4, String(dw2));

  // Exporte über den Kern
  const step3d = await evalApp(async () => { const a = window.__werkcad; const t = await a.kernel.call("exportStep", { items: [{ part: a.doc("beispiel_rahmen") }] }); return t.length; });
  step("STEP-Export", step3d > 1000, String(step3d));
  const members = await evalApp(async () => { const a = window.__werkcad; const t = await a.kernel.call("bodySteps", { part: a.doc("beispiel_rahmen"), onlyMembers: true }); return t.length; });
  step("Profile einzeln als STEP", members === 5, String(members));

  // Baugruppe: Ausrichten-Ablauf (Programmatisch über Flächen-Pick)
  await evalApp(() => window.__werkcad.openDoc("beispiel_bg"));
  await idle();
  await page.locator("#browser .node", { hasText: "Rohr" }).first().click();
  await page.waitForTimeout(300);
  await shot("17-komponente");
  step("Komponente gewählt", (await page.locator("#props .section").count()) > 0);

  // Rückgängig
  const before = await evalApp(() => window.__werkcad.undoStack.length);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  const after = await evalApp(() => window.__werkcad.undoStack.length);
  step("Rückgängig", after === before - 1, `${before} -> ${after}`);
} catch (e) {
  step("Abbruch", false, String(e.stack || e));
  try { await shot("99-fehler"); } catch { /* */ }
}

report.errors.length ? step("Keine Skriptfehler", false, report.errors.slice(0, 5).join(" | ")) : step("Keine Skriptfehler", true);
fs.writeFileSync(path.join(outDir, "bericht.json"), JSON.stringify(report, null, 2));
await browser.close();
srv.close();
const failed = report.steps.filter((s) => !s.ok).length;
console.log(`\n${report.steps.length - failed}/${report.steps.length} Schritte ok`);
process.exit(failed ? 1 : 0);
