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

  // Dynamische Maßeingabe: Rechteck anfangen, 50 tippen, Tab, 25, Enter → bemaßtes Rechteck 50×25
  {
    await evalApp(() => window.__werkcad.newPart("Maßeingabe"));
    await idle();
    await page.keyboard.press("s");
    await page.waitForTimeout(200);
    await page.locator("#props button", { hasText: "XY-Ebene" }).click();
    await page.waitForTimeout(800);
    await page.keyboard.press("r");
    const vb = await page.locator("#viewer canvas").boundingBox();
    const mx = vb.x + vb.width / 2, my = vb.y + vb.height / 2;
    await page.mouse.click(mx - 100, my + 60);
    await page.mouse.move(mx + 40, my - 20, { steps: 5 });
    await page.keyboard.type("50");
    await page.keyboard.press("Tab");
    await page.keyboard.type("25");
    await shot("07b-skizze-masseingabe");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    const di = await evalApp(() => {
      const s = window.__werkcad.sketcher;
      const pts = s.sk.points.filter((p) => p.id !== "O");
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), dims: s.sk.constraints.filter((c) => c.type === "distance").map((c) => c.dir + c.value), ok: s.lastSolve?.ok, regions: s.profiles?.regions.length };
    });
    await shot("07c-skizze-masseingabe-fertig");
    step("Rechteck per Maßeingabe", Math.abs(di.w - 50) < 1e-6 && Math.abs(di.h - 25) < 1e-6 && di.dims.join() === "h50,v25" && di.ok && di.regions === 1, JSON.stringify(di));
    // Linie: Länge 40, Tab, Winkel 30°, Enter; Kreis: Durchmesser 20, Enter
    await page.keyboard.press("l");
    await page.mouse.click(mx + 120, my + 120);
    await page.mouse.move(mx + 200, my + 60, { steps: 5 });
    await page.keyboard.type("40");
    await page.keyboard.press("Tab");
    await page.keyboard.type("30");
    await shot("07d-skizze-linie-masseingabe");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await page.keyboard.press("c");
    await page.mouse.click(mx + 150, my - 150);
    await page.mouse.move(mx + 170, my - 150, { steps: 3 });
    await page.keyboard.type("20");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    const lc = await evalApp(() => {
      const s = window.__werkcad.sketcher, sk = s.sk;
      const P = new Map(sk.points.map((p) => [p.id, p]));
      const lc = sk.constraints.find((c) => c.type === "length"), dc = sk.constraints.find((c) => c.type === "diameter");
      const l = lc && sk.entities.find((e) => e.id === lc.e), a = l && P.get(l.p1), b = l && P.get(l.p2);
      const circ = dc && sk.entities.find((e) => e.id === dc.e);
      return { len: l && Math.hypot(b.x - a.x, b.y - a.y), ang: l && (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI, lval: lc?.value, d: circ && 2 * circ.r, dval: dc?.value, ok: s.lastSolve?.ok };
    });
    await shot("07e-skizze-linie-kreis-fertig");
    step("Linie und Kreis per Maßeingabe", Math.abs(lc.len - 40) < 1e-6 && Math.abs(lc.ang - 30) < 1e-6 && lc.lval === "40" && Math.abs(lc.d - 20) < 1e-6 && lc.dval === "20" && lc.ok, JSON.stringify(lc));
    await page.keyboard.press("Escape");
    await page.locator("#ribbon button", { hasText: "Skizze fertig" }).click();
    await page.waitForTimeout(300);
  }

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
  // Skizzenrundung an der Ecke oben rechts
  await page.keyboard.press("f");
  // Ecke oben rechts aus den Skizzenpunkten bestimmen (nach der Bemaßung hat sich das Rechteck verändert)
  const corner = await evalApp(() => {
    const s = window.__werkcad.sketcher;
    s.mapping();
    const pts = s.sk.points.filter((p) => p.id !== "O");
    const c = pts.reduce((b, p) => (p.x + p.y > b.x + b.y ? p : b), pts[0]);
    const [x, y] = s.S(c.x, c.y);
    const r = s.canvas.getBoundingClientRect();
    return { x: r.left + x, y: r.top + y };
  });
  await page.mouse.click(corner.x, corner.y);
  await page.waitForTimeout(200);
  if (await page.locator(".dim-input input").count()) { await page.locator(".dim-input input").fill("10"); await page.keyboard.press("Enter"); }
  await page.waitForTimeout(300);
  const fil2 = await evalApp(() => { const s = window.__werkcad.sketcher; return { arcs: s.sk.entities.filter((e) => e.type === "arc").length, ok: s.lastSolve?.ok, regions: s.profiles?.regions.length }; });
  step("Skizzenrundung", fil2.arcs === 1 && fil2.ok && fil2.regions === 1, JSON.stringify(fil2));
  await shot("10b-skizze-rundung");
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

  // Schnittansicht A-A in der Beispielzeichnung
  await evalApp(() => window.__werkcad.openDoc("beispiel_zeichnung"));
  await idle(120000);
  await evalApp(() => {
    const a = window.__werkcad, d = a.activeDoc();
    const front = d.views.find((v) => v.type === "front");
    a.edit("Schnitt", () => d.views.push({ id: "schnitt_a", type: "section", parent: front.id, axis: "v", pos: 25, letter: "A", scale: front.scale, hidden: false, x: front.x, y: front.y + 120 }));
  });
  await idle(120000);
  await page.waitForTimeout(800);
  const sec = await evalApp(() => { const p = window.__werkcad.drawing.proj.get("schnitt_a"); return p ? { loops: p.sectionLoops?.length, vis: p.visible.length, err: p.error } : null; });
  step("Schnittansicht mit Schraffur", sec && sec.loops > 0 && !sec.err, JSON.stringify(sec));
  await evalApp(() => window.__werkcad.drawing.fitSheet());
  await shot("15b-schnitt");

  // Exporte über den Kern
  const step3d = await evalApp(async () => { const a = window.__werkcad; const t = await a.kernel.call("exportStep", { items: [{ part: a.doc("beispiel_rahmen") }] }); return t.length; });
  step("STEP-Export", step3d > 1000, String(step3d));
  const members = await evalApp(async () => { const a = window.__werkcad; const t = await a.kernel.call("bodySteps", { part: a.doc("beispiel_rahmen"), onlyMembers: true }); return t.length; });
  step("Profile einzeln als STEP", members === 5, String(members));

  // Baugruppe: Ausrichten-Ablauf (Programmatisch über Flächen-Pick)
  await evalApp(() => window.__werkcad.openDoc("beispiel_bg"));
  await idle();
  await page.locator("#browser .node .label", { hasText: /^Rohr$/ }).first().click();
  await page.waitForTimeout(300);
  await shot("17-komponente");
  step("Komponente gewählt", (await page.locator("#props .section").count()) > 0);

  // Dauerhafte Abhängigkeit: Rahmen-Unterseite gegen Plattenoberseite, folgt Plattendicke
  await evalApp(() => window.__werkcad.openDoc("beispiel_bg"));
  await idle();
  const con = await evalApp(async () => {
    const a = window.__werkcad;
    const asm = a.activeDoc();
    const faces = (pid) => a.planarFaces(pid);
    const top = faces("beispiel_platte").find((f) => f.normal[2] > 0.99);
    const bottoms = faces("beispiel_rahmen").filter((f) => f.normal[2] < -0.99);
    const bottom = bottoms.sort((x, y) => x.point[2] - y.point[2])[0];
    const { faceRef } = window.__werkcadCore || {};
    void faceRef;
    a.edit("Test", () => {
      asm.constraints = [{ id: "t1", type: "gegen", gap: "0", name: "Test", a: { comp: "c2", n: [0, 0, 1], d: top.point[2] }, b: { comp: "c1", n: [0, 0, -1], d: -bottom.point[2] } }];
    });
    return { top: top.point[2], bottom: bottom.point[2] };
  });
  await idle();
  const z1 = await evalApp(() => window.__werkcad.activeDoc().components.find((c) => c.id === "c1").pos[2]);
  await evalApp(() => { const a = window.__werkcad; const p = a.doc("beispiel_platte"); a.edit("Dicke", () => { p.params.find((x) => x.name === "Dicke").expr = "15"; }); });
  await idle();
  await page.waitForTimeout(500);
  await idle();
  const z2 = await evalApp(() => window.__werkcad.activeDoc().components.find((c) => c.id === "c1").pos[2]);
  step("Abhängigkeit folgt Bauteiländerung", Math.abs(z2 - z1 - 5) < 1e-6, JSON.stringify({ con, z1, z2, errors: await evalApp(() => window.__werkcad.asmErrors) }));
  await shot("17b-abhaengigkeit");

  // Exporte als Download: STEP + Zuschnittliste, Platten-DXF
  const downloads = [];
  page.on("download", (dl) => downloads.push(dl));
  await evalApp(() => window.__werkcad.files.exportStepWithList());
  await page.waitForTimeout(1500);
  await evalApp(() => window.__werkcad.openDoc("beispiel_platte"));
  await idle();
  await evalApp(() => window.__werkcad.files.exportPlateDxf());
  await page.waitForTimeout(2000);
  const names = downloads.map((d) => d.suggestedFilename());
  let dxfOk = false;
  for (const dl of downloads) if (dl.suggestedFilename().endsWith(".dxf")) { const p = await dl.path(); dxfOk = fs.readFileSync(p, "utf8").includes("CIRCLE"); }
  step("Exporte STEP+Zuschnitt und Platten-DXF", names.some((n) => n.endsWith(".step")) && names.some((n) => n.endsWith("_Zuschnitt.csv")) && dxfOk, JSON.stringify(names));

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
