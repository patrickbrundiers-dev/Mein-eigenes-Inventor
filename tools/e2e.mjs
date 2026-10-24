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

  // Positionsnummern + Stückliste auf dem Blatt
  await evalApp(() => window.__werkcad.drawing.autoBalloons());
  await page.waitForTimeout(300);
  const pos = await evalApp(() => {
    const a = window.__werkcad, dr = a.drawing, d = dr.doc;
    const svg = dr.exportSvgString();
    const nums = [...dr.svg.querySelectorAll("[data-balloon] text")].map((t) => t.textContent).sort();
    return { balloons: d.balloons?.length, rows: dr.bomRowsOf(d).length, nums, table: svg.includes("Sachnummer") && svg.includes("data-bom"), bomOn: !!d.bomTable?.show };
  });
  pos.dxf = await evalApp(async () => {
    const a = window.__werkcad, orig = a.files.saveText;
    let text = "";
    a.files.saveText = async (t) => { text = t; };
    try { await a.drawing.exportDxf(); } finally { a.files.saveText = orig; }
    return text.includes("Sachnummer") && (text.match(/\nCIRCLE\r?\n/g) || []).length;
  });
  step("Positionsnummern und Stückliste", pos.balloons > 0 && pos.balloons === pos.rows && pos.nums.join() === Array.from({ length: pos.rows }, (_, i) => String(i + 1)).sort().join() && pos.table && pos.bomOn && pos.dxf >= pos.rows, JSON.stringify(pos));
  await shot("16b-positionsnummern");

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

  // Detailansicht: Ausschnitt aus der Vorderansicht über das Werkzeug (zwei Klicks)
  const det = await evalApp(async () => {
    const a = window.__werkcad, dr = a.drawing, d = a.activeDoc();
    const front = d.views.find((v) => v.type === "front");
    dr.sel = { type: "view", id: front.id };
    dr.startDetail();
    const xf = dr.viewXf(front), bb = xf.bb;
    const c = xf.to(bb.x0 + (bb.x1 - bb.x0) * 0.2, bb.y0 + (bb.y1 - bb.y0) * 0.2);
    dr.detailClick(c[0], c[1]);
    dr.detailClick(c[0] + 10, c[1]);
    const v = d.views.find((x) => x.type === "detail");
    const p = v && dr.proj.get(v.id);
    const orig = a.files.saveText;
    let text = "";
    a.files.saveText = async (t) => { text = t; };
    try { await dr.exportDxf(); } finally { a.files.saveText = orig; }
    const svg = dr.svg.outerHTML;
    return v ? { letter: v.letter, scale: v.scale, parentScale: front.scale, lines: p ? p.visible.length + p.hidden.length : -1, svg: svg.includes(`${v.letter} (`), dxf: text.includes(`${v.letter} (`), tool: dr.tool } : null;
  });
  step("Detailansicht", det && det.letter === "Z" && det.scale >= det.parentScale * 2 - 1e-9 && det.lines > 0 && det.svg && det.dxf && !det.tool, JSON.stringify(det));
  await shot("15c-detail");

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

  // Konzentrisch: Rohr-Achse auf eine Bohrungsachse der linken Platte, danach Rückgängig
  const conc = await evalApp(() => {
    const a = window.__werkcad, asm = a.activeDoc();
    const hole = a.assemblyFaces("beispiel_platte").find((f) => f.type === "CYLINDER");
    const tube = a.assemblyFaces("beispiel_rohr").find((f) => f.type === "CYLINDER");
    if (!hole || !tube) return { hole: !!hole, tube: !!tube };
    const before = JSON.stringify(asm.components.find((c) => c.id === "c4").pos);
    a.align = { mode: "konzentrisch" };
    a.alignPick({ kind: "face", key: "comp:c4", info: tube });
    a.alignPick({ kind: "face", key: "comp:c2", info: hole });
    const con = (asm.constraints || []).find((c) => c.type === "konzentrisch");
    a.solveAssemblyConstraints(asm);
    const res = { hole: true, tube: true, con: !!con, err: con ? a.asmErrors?.[con.id] || null : "fehlt", moved: JSON.stringify(asm.components.find((c) => c.id === "c4").pos) !== before };
    a.undo();
    res.undone = !(a.activeDoc().constraints || []).some((c) => c.type === "konzentrisch");
    return res;
  });
  step("Abhängigkeit Konzentrisch", conc.con && conc.err === null && conc.moved && conc.undone, JSON.stringify(conc));
  // Kollisionsprüfung: Rahmen steht auf den Platten (Berührung) → keine Kollision; 5 mm tiefer → zwei Kollisionen
  const col = await evalApp(async () => {
    const a = window.__werkcad, asm = a.activeDoc();
    const ok = await a.props.collisionDialog();
    const dlg = document.querySelector("#modal-root .dialog")?.textContent || "";
    document.querySelectorAll("#modal-root .dialog footer .btn").forEach((b) => { if (b.textContent === "Schließen") b.click(); });
    const items = asm.components.map((c) => ({ key: c.id, part: a.doc(c.part), pos: c.id === "c1" ? [c.pos[0], c.pos[1], c.pos[2] - 5] : c.pos, rot: c.rot }));
    const bad = await a.kernel.call("collisions", { items });
    return { ok: ok?.length, dlg: dlg.includes("Keine Kollision"), open: !!document.querySelector("#modal-root .dialog"), bad: bad.map((r) => [r.a, r.b].sort().join("-")).sort(), vol: bad.map((r) => Math.round(r.volume)) };
  });
  step("Kollisionsprüfung", col.ok === 0 && col.dlg && !col.open && col.bad.join() === "c1-c2,c1-c3", JSON.stringify(col));
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

  // Atomare Änderung: wirft die Änderung, bleibt das Modell unverändert und kein Rückgängig-Punkt entsteht
  const atomic = await evalApp(() => {
    const a = window.__werkcad;
    const p = a.doc("beispiel_platte");
    const json = JSON.stringify(a.project), undo = a.undoStack.length, redo = a.redoStack.length;
    const ok = a.edit("Fehlertest", () => { p.params.find((x) => x.name === "Dicke").expr = "99"; p.features.length = 0; throw new Error("absichtlich"); });
    return { ok, same: JSON.stringify(a.project) === json, undo: a.undoStack.length - undo, redo: a.redoStack.length - redo, toast: document.querySelector("#toasts")?.textContent.includes("Fehlertest nicht möglich") };
  });
  step("Fehlerhafte Änderung ohne halben Stand", atomic.ok === false && atomic.same && atomic.undo === 0 && atomic.redo === 0 && atomic.toast, JSON.stringify(atomic));

  // Rückgängig/Wiederholen/Speichern: gespeicherte Daten = angezeigtes Modell
  const dicke = () => window.__werkcad.doc("beispiel_platte").params.find((x) => x.name === "Dicke").expr;
  const saved = () => JSON.parse(window.__werkcad.files.serialize()).docs.find((d) => d.id === "beispiel_platte").params.find((x) => x.name === "Dicke").expr;
  const d0 = await evalApp(dicke);
  await evalApp(() => { const a = window.__werkcad; a.edit("Dicke", () => { a.doc("beispiel_platte").params.find((x) => x.name === "Dicke").expr = "12"; }); });
  const ur = [[await evalApp(dicke), await evalApp(saved)]];
  await evalApp(() => window.__werkcad.undo());
  ur.push([await evalApp(dicke), await evalApp(saved)]);
  await evalApp(() => window.__werkcad.redo());
  ur.push([await evalApp(dicke), await evalApp(saved)]);
  await idle();
  step("Rückgängig/Wiederholen/Speichern konsistent", JSON.stringify(ur) === JSON.stringify([["12", "12"], [d0, d0], ["12", "12"]]), JSON.stringify({ d0, ur }));

  // Knickrahmen: über das Menüband anlegen, Winkel im Eigenschaftsfenster ändern, Ansicht abgewickelt, Rückgängig
  await evalApp(() => window.__werkcad.newPart("Knickrahmen"));
  await idle();
  await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
  await page.locator("#ribbon button", { hasText: "Knickrahmen" }).click();
  await idle();
  const kr0 = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { bodies: r.bodies.length, len: r.bodies[0]?.meta?.length, errors: Object.values(r.status).filter((s) => !s.ok).length }; });
  const knickInput = page.locator("#props .field", { hasText: "Knick 1" }).locator("input").first();
  await knickInput.fill("90");
  await knickInput.press("Enter");
  await idle();
  const kr1 = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { len: r.bodies[0]?.meta?.length, angle: a.activeDoc().features[0].bends[0].angle }; });
  await page.locator("#props button", { hasText: "Abgewickelt" }).click();
  await idle();
  await shot("20-knickrahmen-abgewickelt");
  const kr2 = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return r.bodies[0]?.props?.bbox; });
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await idle();
  const kr3 = await evalApp(() => window.__werkcad.activeDoc().features[0].bends[0].angle);
  // Vorgabe: Innenradius 3, K-Faktor 0,33, RE 60x40x3 → 1400 + 2·24 + (3 + 0,99)·π/2
  const krL = 1448 + 3.99 * Math.PI / 2;
  step("Knickrahmen", kr0.bodies === 1 && kr0.errors === 0 && Math.abs(kr1.len - krL) < 1e-6 && Math.abs(kr2[1][0] - kr2[0][0] - krL) < 0.05 && kr3 === "30",
    JSON.stringify({ kr0, kr1, flatX: kr2 && kr2[1][0] - kr2[0][0], undo: kr3 }));

  // Profil-Schnelleingabe (aus der Rohrlaser-Kalkulation): Profil-ID tippen, Treffer anklicken, Rückgängig
  await evalApp(() => window.__werkcad.newPart("Profil-ID"));
  await idle();
  await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
  await page.locator("#ribbon button", { hasText: "Rohr / Profil" }).click();
  await idle();
  const pq = () => page.locator("#props input.profile-quick");
  const pq0 = await pq().inputValue();
  await pq().fill("RE 70x50x4");
  await pq().press("Enter");
  await idle();
  const pq1 = await evalApp(() => { const f = window.__werkcad.activeDoc().features[0]; return [f.section, f.dims.B, f.dims.H, f.dims.t]; });
  await pq().fill("40x3");
  const hits = await page.locator("#props .profile-hit").allTextContents();
  await page.locator("#props .profile-hit", { hasText: "QR 40x40x3" }).click();
  await idle();
  const pq2 = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return [a.activeDoc().features[0].section, r.bodies[0]?.meta?.profileId]; });
  await page.keyboard.press("Control+z");
  await idle();
  const pq3 = await pq().inputValue();
  step("Profil-Schnelleingabe", pq0 === "QR 40x40x3" && pq1.join() === "rechteck,70,50,4" && hits[0] === "QR 40x40x3" && pq2.join() === "vierkant,QR 40x40x3" && pq3 === "RE 70x50x4",
    JSON.stringify({ pq0, pq1, hits, pq2, pq3 }));

  // Fertigungsprüfung (aus der Rohrlaser-Kalkulation): kurze Stange einstellen → Fehler unter der Zuschnittliste
  await evalApp(() => { const a = window.__werkcad; a.sel = null; a.prefs.set("fertigung.stange", 1000); });
  await page.waitForTimeout(300);
  const dfm1 = await page.locator("#props .dfm .msg").allTextContents();
  await shot("21-fertigungspruefung");
  await evalApp(() => window.__werkcad.prefs.reset(["fertigung.stange"]));
  await page.waitForTimeout(300);
  const dfm2 = await page.locator("#props .dfm .msg").allTextContents();
  step("Fertigungsprüfung", dfm1.length === 1 && /Teil zu lang/.test(dfm1[0]) && /keine Befunde/.test(dfm2.join()), JSON.stringify({ dfm1, dfm2 }));

  // Einstellungscenter: über das Datei-Menü öffnen, suchen, ungültig ablehnen, gültig speichern, Modell unverändert
  {
    const prj0 = await evalApp(() => JSON.stringify(window.__werkcad.project));
    await page.locator("#ribbon .rb-file").click();
    await page.locator(".file-menu button", { hasText: "Einstellungen" }).click();
    await page.locator(".set-search input").fill("fang");
    const fang = page.locator('.set-row[data-key="skizze.fangradius"] input');
    await fang.waitFor({ state: "visible" });
    const rows = await page.locator(".set-row").count();
    // Wert setzen und »change« direkt auslösen: robust gegen Neuaufbau der Zeile zwischen Eingabe und Tab
    const setField = (v) => fang.evaluate((el, val) => { el.value = val; el.dispatchEvent(new Event("change", { bubbles: true })); }, v);
    await setField("99");
    const err = await page.locator('.set-row[data-key="skizze.fangradius"] .set-err').textContent();
    const kept = await evalApp(() => window.__werkcad.prefs.get("skizze.fangradius"));
    await setField("12");
    await page.locator(".set-search input").fill("");
    await page.locator(".set-cat", { hasText: "3D-Ansicht" }).click();
    await page.locator('.set-row[data-key="ansicht.kantenfarbe"] input').evaluate((el) => { el.value = "#ff0000"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    await shot("21-einstellungen");
    const st = await evalApp(() => {
      const a = window.__werkcad;
      let edge = null;
      a.viewer.root.traverse((o) => { if (o.isLineSegments && o.userData.edgeRanges) edge = o.material.color.getHexString(); });
      return { fang: a.prefs.get("skizze.fangradius"), snapR: a.sketcher.snapR, stored: JSON.parse(localStorage.getItem("werkcad.einstellungen") || "{}"), edge };
    });
    await page.locator(".dialog footer .btn", { hasText: "Alles auf Standard" }).click();
    await page.locator(".dialog footer .btn", { hasText: "Schließen" }).click();
    const after = await evalApp(() => ({ fang: window.__werkcad.prefs.get("skizze.fangradius") }));
    const prj1 = await evalApp(() => JSON.stringify(window.__werkcad.project));
    step("Einstellungscenter", rows === 2 && /Höchstens 30/.test(err) && kept === 7 && st.fang === 12 && st.snapR === 12 && st.stored.values?.["skizze.fangradius"] === 12 && st.edge === "ff0000" && after.fang === 7 && prj0 === prj1,
      JSON.stringify({ rows, err, kept, st, after, modelUnchanged: prj0 === prj1 }));
  }

  // Ansicht: Perspektive, Darstellungsmodi, Schnitt, Zoom auf Auswahl, Normal zur Fläche
  {
    await evalApp(() => window.__werkcad.openDoc("beispiel_platte"));
    await idle();
    await page.locator("#ribbon .rb-tab", { hasText: "Ansicht" }).click();
    const v = await evalApp(async () => {
      const a = window.__werkcad, vw = a.viewer;
      const cv = vw.renderer.domElement.getBoundingClientRect();
      const cx = cv.left + cv.width / 2, cy = cv.top + cv.height / 2;
      vw.setView("top", { animate: false }); vw.fit();
      const ppu0 = vw.pixelsPerUnit();
      const hit0 = vw.pick(cx, cy, { edges: false, faces: true });
      a.prefs.set("ansicht.projektion", "perspektive");
      const persp = vw.camera.isPerspectiveCamera, ppu1 = vw.pixelsPerUnit();
      const hit1 = vw.pick(cx, cy, { edges: false, faces: true });
      a.prefs.set("ansicht.darstellung", "draht");
      const wire = vw.pickables.every((p) => !p.mesh.visible && p.lines.visible);
      const hitWire = vw.pick(cx, cy, { edges: false, faces: true });
      a.prefs.set("ansicht.darstellung", "transparent");
      const transp = vw.pickables.every((p) => p.mesh.visible && p.mesh.material.opacity < 0.5);
      a.prefs.reset(["ansicht.darstellung", "ansicht.projektion"]);
      const orthoAgain = !vw.camera.isPerspectiveCamera;
      a.toggleClip("Z");
      const clipOn = vw.pickables.every((p) => p.mesh.material.clippingPlanes.length === 1) && !a.clipBar.hidden;
      vw.setClip({ ...vw.clip, offset: -1000 });
      const hitClipped = vw.pick(cx, cy, { edges: false, faces: true });
      a.toggleClip("Z");
      const clipOff = !vw.clip && vw.pickables.every((p) => p.mesh.material.clippingPlanes.length === 0);
      // Fläche wählen → Normal zur Fläche, Zoom auf Auswahl
      vw.setView("iso", { animate: false }); vw.fit();
      const fh = vw.pick(cx, cy, { edges: false, faces: true });
      a.selHits = [fh]; a.sel = { type: "geometry" }; vw.setSelectionHits(a.selHits);
      const half0 = vw.visibleHalf();
      a.zoomToSelection();
      const half1 = vw.visibleHalf();
      a.viewNormalToFace();
      await new Promise((r) => setTimeout(r, 400));
      const dir = vw.camera.getWorldDirection(new (vw.camera.position.constructor)()).toArray();
      return { persp, ppuRatio: ppu1 / ppu0, hit0: !!hit0, hit1: !!hit1, wire, hitWire: !!hitWire, transp, orthoAgain, clipOn, hitClipped: !!hitClipped, clipOff, half0, half1, n: fh?.info?.normal, dir };
    });
    await shot("22-ansicht");
    const dot = v.n ? -(v.n[0] * v.dir[0] + v.n[1] * v.dir[1] + v.n[2] * v.dir[2]) : 0;
    step("Ansicht: Perspektive, Modi, Schnitt, Auswahl", v.persp && Math.abs(v.ppuRatio - 1) < 0.02 && v.hit0 && v.hit1 && v.wire && !v.hitWire && v.transp && v.orthoAgain && v.clipOn && !v.hitClipped && v.clipOff && v.half1 <= v.half0 && dot > 0.999,
      JSON.stringify({ ...v, dot }));
  }

  // Befehlssuche (Strg+K) und eigenes Tastaturkürzel mit Konfliktprüfung
  {
    await evalApp(() => window.__werkcad.openDoc("beispiel_platte"));
    await idle();
    const n0 = await evalApp(() => window.__werkcad.activeDoc().features.length);
    await page.locator("#viewer canvas").click({ position: { x: 5, y: 300 } });
    await page.keyboard.press("Control+k");
    await page.locator(".cmd-palette input").fill("fase");
    await shot("23-befehlssuche");
    const first = await page.locator(".cmd-item.on .cmd-label").textContent();
    await page.keyboard.press("Enter");
    await idle();
    const f1 = await evalApp(() => { const d = window.__werkcad.activeDoc(); return { n: d.features.length, type: d.features.at(-1).type }; });
    // Kürzel G für Rundung im Einstellungscenter, E (belegt) wird abgelehnt
    await page.keyboard.press("Control+,");
    await page.locator(".set-search input").fill("tastatur");
    await page.locator(".km input[type=search]").fill("rundung");
    const row = page.locator('.km-row[data-cmd="part.fillet"] .km-key');
    await row.click();
    await page.keyboard.press("e");
    const conflict = await page.locator(".km .set-err").textContent();
    await row.click();
    await page.keyboard.press("g");
    const stored = await evalApp(() => window.__werkcad.prefs.get("werkzeuge.kuerzel"));
    await page.locator(".dialog footer .btn", { hasText: "Schließen" }).click();
    await page.locator("#viewer canvas").click({ position: { x: 5, y: 300 } });
    await page.keyboard.press("g");
    await idle();
    const f2 = await evalApp(() => { const d = window.__werkcad.activeDoc(); return { n: d.features.length, type: d.features.at(-1).type }; });
    const tip = await evalApp(() => { window.__werkcad.ribbon.tab = "modell"; window.__werkcad.ribbon.render(); return [...document.querySelectorAll("#ribbon .rb-btn")].find((b) => b.textContent === "Rundung")?.title; });
    await evalApp(() => { const a = window.__werkcad; a.prefs.reset(["werkzeuge.kuerzel"]); a.undo(); a.undo(); });
    await idle();
    step("Befehlssuche und Tastaturkürzel", first === "Fase" && f1.n === n0 + 1 && f1.type === "chamfer" && /schon »Extrusion«/.test(conflict) && stored["part.fillet"] === "G" && f2.n === n0 + 2 && f2.type === "fillet" && tip === "Rundung (G)",
      JSON.stringify({ first, n0, f1, conflict, stored, f2, tip }));
  }

  // Messen: Taste M, Deckfläche anklicken, dann Bohrungskante → exakte Werte aus dem Kern
  {
    await evalApp(() => window.__werkcad.openDoc("beispiel_platte"));
    await idle();
    await evalApp(() => { const v = window.__werkcad.viewer; v.setView("iso", { animate: false }); v.fit(); });
    await page.locator("#viewer canvas").click({ position: { x: 5, y: 300 } });
    await page.keyboard.press("m");
    const box = await page.locator("#viewer canvas").boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() => window.__werkcad.measure?.result, null, { timeout: 20000 });
    const one = await evalApp(() => window.__werkcad.measure.result.items[0]);
    // Kreiskante einer Bohrung über ihren Mittelpunkt auf dem Bildschirm treffen
    const pt = await evalApp(() => {
      const v = window.__werkcad.viewer;
      const r = v.container.getBoundingClientRect();
      for (const pk of v.pickables) for (const e of pk.lines.userData.edges) if (e.type === "CIRCLE" && e.mid[2] > 11 && Math.hypot(...[0, 1, 2].map((k) => e.positions[k] - e.positions[e.positions.length - 3 + k])) < 1e-6) { const [x, y] = v.worldToScreen(e.mid); return [r.left + x, r.top + y]; }
      return null;
    });
    await page.mouse.click(pt[0], pt[1]);
    await page.waitForFunction(() => window.__werkcad.measure?.result?.items.length === 2 && !window.__werkcad.measure.busy, null, { timeout: 20000 });
    await shot("24-messen");
    const two = await evalApp(() => ({ r: window.__werkcad.measure.result, text: document.querySelector("#props").textContent }));
    await page.keyboard.press("Escape");
    const off = await evalApp(() => !window.__werkcad.pick && !window.__werkcad.measure);
    const it = two.r.items[1];
    step("Messen", one.type === "PLANE" && one.area > 1000 && it.type === "CIRCLE" && Math.abs(it.radius * 2 - 11) < 0.6 && Math.abs(two.r.distance) < 1e-6 && /Durchmesser/.test(two.text) && off,
      JSON.stringify({ one: { type: one.type, area: one.area }, two: { type: it.type, r: it.radius, d: two.r.distance }, off }));
  }

  // Auswahlfilter und Körper ausblenden/isolieren (Rahmen hat mehrere Körper)
  {
    await evalApp(() => window.__werkcad.openDoc("beispiel_rahmen"));
    await idle();
    const r = await evalApp(() => {
      const a = window.__werkcad, v = a.viewer;
      v.setView("iso", { animate: false }); v.fit();
      const n = v.pickables.length;
      const cv = v.renderer.domElement.getBoundingClientRect();
      // Fläche eines Körpers über seinen Bildschirm-Mittelpunkt finden
      let hit = null;
      for (let y = 0.3; y < 0.8 && !hit; y += 0.05) for (let x = 0.2; x < 0.8 && !hit; x += 0.05) hit = v.pick(cv.left + cv.width * x, cv.top + cv.height * y, { edges: false, faces: true });
      a.setSelFilter("kanten");
      const opt = a.pickOptions();
      a.setSelFilter("alles");
      a.hideHit(hit);
      const hidden1 = v.pickables.filter((p) => !p.mesh.visible).length;
      a.isolateHit(v.pickables.find((p) => p.mesh.visible));
      const visibleIso = v.pickables.filter((p) => p.mesh.visible).length;
      const status = document.querySelector("#status .status-btn")?.textContent;
      const json0 = JSON.stringify(a.project);
      a.showAllBodies();
      return { n, hit: !!hit, opt, hidden1, visibleIso, status, allBack: v.pickables.every((p) => p.mesh.visible), same: json0 === JSON.stringify(a.project) };
    });
    step("Auswahlfilter, Ausblenden, Isolieren", r.n > 2 && r.hit && r.opt.faces === false && r.opt.edges === true && r.hidden1 === 1 && r.visibleIso === 1 && r.status === `${r.n - 1} ausgeblendet` && r.allBack && r.same, JSON.stringify(r));
  }

  // Skizze: Langloch und Polygon zeichnen, Kontur geschlossen; Widerspruch wird benannt und rot markiert
  {
    await evalApp(() => window.__werkcad.newPart("Langloch"));
    await idle();
    await page.keyboard.press("s");
    await page.waitForTimeout(200);
    await page.locator("#props button", { hasText: "XY-Ebene" }).click();
    await page.waitForTimeout(800);
    const vb = await page.locator("#viewer canvas").boundingBox();
    const mx = vb.x + vb.width / 2, my = vb.y + vb.height / 2;
    await evalApp(() => window.__werkcad.sketcher.setTool("slot"));
    await page.mouse.click(mx - 200, my);
    await page.mouse.click(mx - 60, my);
    await page.mouse.move(mx - 60, my - 30, { steps: 3 });
    await page.mouse.click(mx - 60, my - 30);
    await evalApp(() => window.__werkcad.sketcher.setTool("polygon"));
    await page.mouse.click(mx + 150, my);
    await page.mouse.move(mx + 230, my, { steps: 3 });
    await page.mouse.click(mx + 230, my);
    await page.locator(".dim-input input").fill("6");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await shot("25-langloch-polygon");
    const sk1 = await evalApp(() => { const s = window.__werkcad.sketcher; const r = s.solve(); return { arcs: s.sk.entities.filter((e) => e.type === "arc").length, lines: s.sk.entities.filter((e) => e.type === "line" && !e.construction).length, regions: s.profiles.regions.length, ok: r.ok, dof: r.dof }; });
    // Widerspruch: Polygon-Seite 30 und zugleich Umkreis Ø 20 → nicht erfüllbar
    const conflict = await evalApp(() => {
      const a = window.__werkcad, s = a.sketcher;
      const circ = s.sk.entities.find((e) => e.type === "circle" && e.construction);
      const side = s.sk.entities.find((e) => e.type === "line" && !e.construction && s.sk.constraints.some((c) => c.type === "equal" && c.e1 === e.id));
      s.commit("Test", (sk) => { sk.constraints.push({ id: "t1", type: "length", e: side.id, value: "30" }, { id: "t2", type: "diameter", e: circ.id, value: "20" }); });
      const hud = document.querySelector("#hud").textContent;
      const red = document.querySelectorAll("#overlay .sk-dim-text.err").length;
      a.undo();
      return { hud, red, after: s.solve().ok };
    });
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    step("Skizze: Langloch, Polygon, Widerspruch", sk1.arcs === 2 && sk1.lines === 8 && sk1.regions === 2 && sk1.ok && /nicht erfüllbar: .*(Länge 30|Durchmesser 20)/.test(conflict.hud) && conflict.red >= 1 && conflict.after,
      JSON.stringify({ sk1, conflict }));
  }

  // Skizze: Rechteck versetzen (Kontur anklicken, Seite, Abstand), Maß ändern, Bedingung unterdrücken
  {
    await evalApp(() => window.__werkcad.newPart("Versatz"));
    await idle();
    await page.keyboard.press("s");
    await page.waitForTimeout(200);
    await page.locator("#props button", { hasText: "XY-Ebene" }).click();
    await page.waitForTimeout(800);
    const vb = await page.locator("#viewer canvas").boundingBox();
    const mx = vb.x + vb.width / 2, my = vb.y + vb.height / 2;
    await evalApp(() => window.__werkcad.sketcher.setTool("rect"));
    await page.mouse.click(mx - 120, my - 60);
    await page.mouse.click(mx + 120, my + 60);
    await page.waitForTimeout(200);
    await evalApp(() => window.__werkcad.sketcher.setTool("offset"));
    const edge = await evalApp(() => {
      const s = window.__werkcad.sketcher, P = new Map(s.sk.points.map((p) => [p.id, p]));
      const l = s.sk.entities.find((e) => e.type === "line" && !e.construction);
      const a = P.get(l.p1), b = P.get(l.p2), r = s.canvas.getBoundingClientRect();
      const [x, y] = s.S((a.x + b.x) / 2, (a.y + b.y) / 2);
      return { x: r.left + x, y: r.top + y };
    });
    await page.mouse.click(edge.x, edge.y);
    const selN = await evalApp(() => window.__werkcad.sketcher.sel.size);
    await page.mouse.click(mx - 220, my - 140);
    await page.locator(".dim-input input").fill("10");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await shot("26-versatz");
    const off = await evalApp(() => {
      const a = window.__werkcad, s = a.sketcher, r = s.solve();
      const offs = s.sk.constraints.filter((c) => c.type === "offset");
      const lines = s.sk.entities.filter((e) => e.type === "line" && !e.construction);
            const master = offs.find((c) => !c.hidden);
      s.commit("Maß ändern", (sk) => { sk.constraints.find((c) => c.id === master.id).value = "4"; });
      const P = new Map(s.sk.points.map((p) => [p.id, p])), E = (id) => s.sk.entities.find((e) => e.id === id);
      const dist = (c) => { const l = E(c.e1), q = P.get(E(c.e2).p1), A = P.get(l.p1), B = P.get(l.p2); return Math.abs((B.x - A.x) * (q.y - A.y) - (B.y - A.y) * (q.x - A.x)) / Math.hypot(B.x - A.x, B.y - A.y); };
      const d1 = offs.map(dist);
      const visible = document.querySelectorAll("#overlay .sk-dim-text").length;
      return { ok: r.ok, lines: lines.length, offs: offs.length, shown: offs.filter((c) => !c.hidden).length, d1, visible, master: master.id };
    });
    // Bedingung unterdrücken über die Eigenschaften
    const dof0 = await evalApp(() => window.__werkcad.sketcher.solve().dof);
    await evalApp((id) => { const a = window.__werkcad; a.sketcher.sel.clear(); a.sketcher.sel.add("c:" + id); a.selectSketchItems(["c:" + id]); }, off.master);
    await page.locator("#props label", { hasText: "Unterdrückt" }).click();
    await page.waitForTimeout(200);
    const sup = await evalApp((id) => { const s = window.__werkcad.sketcher; return { disabled: !!s.sk.constraints.find((c) => c.id === id).disabled, dof: s.solve().dof, dimmed: document.querySelectorAll("#overlay .sk-dim-text.off").length }; }, off.master);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    step("Skizze: Versatz und Bedingung unterdrücken", selN === 4 && off.ok && off.lines === 8 && off.offs === 4 && off.shown === 1 && off.d1.every((d) => Math.abs(d - 4) < 1e-6) && sup.disabled && sup.dof > dof0 && sup.dimmed === 1,
      JSON.stringify({ selN, off, dof0, sup }));
  }

  // Benannte Ansicht: speichern, andere Ansicht, wiederherstellen, im Projekt gespeichert, Rückgängig
  {
    await evalApp(() => window.__werkcad.openDoc("beispiel_rahmen"));
    await idle();
    await evalApp(() => { const v = window.__werkcad.viewer; v.setView("front", { animate: false }); v.fit(); });
    const before = await evalApp(() => window.__werkcad.viewer.viewState());
    await page.locator("#ribbon .rb-tab", { hasText: "Ansicht" }).click();
    await page.locator("#ribbon .rb-btn", { hasText: "Ansicht speichern" }).click();
    await page.locator(".dialog input").fill("Vorne nah");
    await page.locator(".dialog footer .btn", { hasText: "Speichern" }).click();
    await page.waitForTimeout(200);
    await evalApp(() => window.__werkcad.viewer.setView("iso", { animate: false }));
    await page.locator("#ribbon .rb-btn", { hasText: /^Ansichten$/ }).click();
    await page.locator(".menu button", { hasText: "Vorne nah" }).first().click();
    await page.waitForTimeout(500);
    const nv = await evalApp(() => {
      const a = window.__werkcad, st = a.viewer.viewState();
      const saved = a.activeDoc().namedViews;
      a.undo();
      return { st, saved, afterUndo: a.activeDoc().namedViews };
    });
    const close = (a, b, t = 1e-3) => a.every((v, i) => Math.abs(v - b[i]) < t);
    step("Benannte Ansicht speichern und wiederherstellen", nv.saved?.length === 1 && nv.saved[0].name === "Vorne nah" && close(nv.st.dir, before.dir) && close(nv.st.target, before.target, 1e-2) && Math.abs(nv.st.half - before.half) < 1e-3 * before.half && !nv.afterUndo,
      JSON.stringify({ before, nv }));
  }

  // Plan 5.5: große Baugruppe (150 Komponenten) öffnen und bedienen
  {
    const t0 = Date.now();
    await evalApp(() => {
      const a = window.__werkcad;
      const parts = a.parts().filter((p) => p.id !== "beispiel_knickrahmen").slice(0, 3);
      const asm = a.newAssembly();
      window.__bigAsm = asm.id;
      a.edit("Große Baugruppe", () => { for (let i = 0; i < 150; i++) asm.components.push({ id: "g" + i, part: parts[i % parts.length].id, pos: [(i % 15) * 4000, Math.floor(i / 15) * 4000, 0], rot: [0, 0, 0] }); });
    });
    await idle(180000);
    const tOpen = Date.now() - t0;
    const t1 = Date.now();
    await page.locator("#browser .node .label", { hasText: /^Rahmen/ }).last().click(); // Komponente (unterhalb der Bauteilliste)
    await page.locator("#props .section").first().waitFor({ timeout: 5000 });
    const tSel = Date.now() - t1;
    const big = await evalApp(() => { const a = window.__werkcad; return { comps: a.doc(window.__bigAsm).components.length, active: a.activeDoc().id === window.__bigAsm }; });
    await evalApp(() => window.__werkcad.viewer.fit?.());
    await shot("25-grosse-baugruppe");
    console.log(`[info] große Baugruppe: öffnen ${tOpen} ms, Auswahl ${tSel} ms`);
    step("Große Baugruppe (150 Komponenten)", big.comps === 150 && big.active && tOpen < 120000 && tSel < 3000, JSON.stringify({ ...big, tOpen, tSel }));
  }
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
