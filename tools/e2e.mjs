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
// Menüband-Knopf nach Namen klicken (Text oder aria-label bei Symbolknöpfen); steht er nicht im aktiven Reiter, die Reiter durchgehen
const rbClick = async (name) => {
  const btn = () => page.locator("#ribbon .rb-panel").getByRole("button", { name, exact: true });
  if (!(await btn().first().isVisible().catch(() => false))) {
    const tabs = page.locator("#ribbon .rb-tab");
    for (let i = 0, n = await tabs.count(); i < n; i++) {
      await tabs.nth(i).click();
      if (await btn().first().isVisible().catch(() => false)) break;
    }
  }
  await btn().first().click();
};
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
  // Mini-Werkzeugleiste stört Klickfolgen im 3D-Fenster; eigener Schritt am Ende prüft sie
  await evalApp(() => window.__werkcad.prefs.set("ansicht.miniLeiste", false));

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
  const skFit = await evalApp(() => { const p = document.querySelector("#ribbon .rb-panel"); return { over: p.scrollWidth - p.clientWidth, groups: p.querySelectorAll(".rb-group").length, finish: !!p.querySelector(".rb-finish") }; });
  step("Skizzen-Menüband passt (Inventor-Aufbau)", skFit.over <= 0 && skFit.groups >= 7 && skFit.finish, JSON.stringify(skFit));
  // Fangen wie Inventor: Schnittpunkt zweier Linien, Ausrichtung senkrecht zu einem Punkt (Hilfslinien nur kurz eingesetzt, danach entfernt)
  const snaps = await evalApp(() => {
    const s = window.__werkcad.sketcher, sk = s.sk, np = sk.points.length, ne = sk.entities.length;
    sk.points.push({ id: "t1", x: -10, y: 10 }, { id: "t2", x: 30, y: 10 }, { id: "t3", x: 10, y: -10 }, { id: "t4", x: 10, y: 30 });
    sk.entities.push({ id: "tl1", type: "line", p1: "t1", p2: "t2" }, { id: "tl2", type: "line", p1: "t3", p2: "t4" });
    try {
      const at = (x, y) => { const [sx, sy] = s.S(x, y); const r = s.snap(sx + 2, sy + 1); return { label: r.label, x: Math.round(r.x * 1e6) / 1e6, y: Math.round(r.y * 1e6) / 1e6 }; };
      return { cross: at(10, 10), align: at(30, 22) };
    } finally { sk.points.length = np; sk.entities.length = ne; }
  });
  step("Fangen: Schnittpunkt und Ausrichtung", snaps.cross.label === "Schnittpunkt" && snaps.cross.x === 10 && snaps.cross.y === 10 && /Senkrecht zu Punkt|Ausgerichtet/.test(snaps.align.label) && snaps.align.x === 30, JSON.stringify(snaps));
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
  await page.locator("#ribbon .rb-tab", { hasText: "Metallbau" }).click();
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

  // Zeichnung: Kettenmaß, Bezugsmaß, Mittelpunkt, Maße ausrichten (FU11), eigene Vorlage (FU12)
  {
    const zb = await evalApp(() => {
      const a = window.__werkcad, dr = a.drawing, d = dr.doc;
      const v = d.views.find((x) => x.type !== "iso" && dr.proj.get(x.id)?.visible?.length);
      const p = dr.viewGeom(v), xf = dr.viewXf(v);
      // drei Ecken mit verschiedenem x: links außen, eine dazwischen (nahe gleicher Höhe), rechts außen
      const ends = [...new Map(p.visible.flatMap((pl) => [pl[0], pl[pl.length - 1]]).map((q) => [Math.round(q[0] * 100) + ":" + Math.round(q[1] * 100), q])).values()];
      const sx0 = [...ends].sort((m, n) => m[0] - n[0]);
      const A = sx0[0], B = sx0[sx0.length - 1];
      const mid = ends.filter((q) => q[0] > A[0] + 1 && q[0] < B[0] - 1 && Math.abs(q[0] - A[0]) >= Math.abs(q[1] - A[1])).sort((m, n) => Math.abs(m[1] - A[1]) - Math.abs(n[1] - A[1]))[0];
      const row = mid ? [A, mid, B] : [A, B];
      const n0 = d.dims.length;
      dr.setTool("chain");
      for (const [i, q] of row.entries()) {
        const [sx, sy] = xf.to(q[0], q[1]);
        dr.chainClick(sx, sy);
        if (i === 1) { const bb = xf.bb; const [, top] = xf.to(bb.x0, bb.y1); dr.chainClick(sx, top - 15); }
      }
      const chain = d.dims.slice(n0).map((m) => ({ kind: m.kind, off: m.off }));
      dr.setTool(null);
      dr.setTool("base");
      const n1 = d.dims.length;
      for (const [i, q] of row.entries()) {
        const [sx, sy] = xf.to(q[0], q[1]);
        dr.chainClick(sx, sy);
        if (i === 1) { const bb = xf.bb; const [, , , bot] = [0, 0, 0, xf.to(bb.x0, bb.y0)[1]]; dr.chainClick(sx, bot + 15); }
      }
      const base = d.dims.slice(n1).map((m) => ({ kind: m.kind, off: m.off, x1: m.p1[0] }));
      dr.setTool(null);
      dr.alignDims();
      const aligned = d.dims.slice(n0).map((m) => m.off);
      // Mittelpunkt an einem Kreis
      const arc = (p.arcs || [])[0];
      let cm = null;
      if (arc) { dr.setTool("center"); const [cx, cy] = xf.to(arc.cx + arc.r, arc.cy); dr.centerClick(cx, cy); cm = (d.centerMarks || []).length; dr.setTool(null); }
      return { rowN: row.length, chain, base, aligned, cm, hasArc: !!arc, sameRowChain: chain.length === 2 && chain[0].off === chain[1].off };
    });
    await evalApp(() => window.__werkcad.drawing.templateDialog());
    await page.locator(".template-dialog .btn-row input").first().fill("Auftrag");
    await page.locator(".template-dialog .btn-row input").nth(1).fill("A-17");
    await page.locator(".template-dialog select").nth(1).selectOption("5");
    await page.locator(".dialog footer .btn.primary", { hasText: "Speichern" }).click();
    await page.waitForTimeout(300);
    const tp = await evalApp(() => {
      const a = window.__werkcad, svg = a.drawing.exportSvgString();
      const t = a.project.drawingTemplate;
      const out = { dimText: t?.dimText, extra: t?.extra, auftrag: svg.includes(">Auftrag<") && svg.includes(">A-17<"), font5: /font-size="5"[^>]*class="dw-dimtext"|class="dw-dimtext"[^>]*font-size="5"|font-size="5"/.test(svg) };
      a.edit("zurück", () => { delete a.project.drawingTemplate; }, { rebuild: false });
      a.prefs.set("zeichnung.vorlage", { firma: "", ersteller: "", logo: null, extra: [], lineGroup: "0.5", dimText: 3.5 });
      return out;
    });
    await shot("15b-zeichnung-kette-vorlage");
    step("Zeichnung: Ketten-/Bezugsmaß, Mittelpunkt, ausrichten, Vorlage",
      zb.rowN >= 3 && zb.sameRowChain && zb.chain[0].kind === "h" && zb.base.length === 2 && zb.base[0].x1 === zb.base[1].x1 && Math.abs(Math.abs(zb.base[1].off - zb.base[0].off) - 7) < 1e-6
      && zb.aligned.length === 4 && (!zb.hasArc || zb.cm === 1) && tp.dimText === 5 && tp.extra?.[0]?.label === "Auftrag" && tp.auftrag && tp.font5,
      JSON.stringify({ zb, tp }));
  }

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

  // Zeichnung I (Werkzeuge Stufe 33): Bohrungstabelle, Hinweis mit Bohrungsvorschlag, Änderungstabelle
  const ht = await evalApp(async () => {
    const a = window.__werkcad, dr = a.drawing, d = a.activeDoc();
    const top = d.views.find((v) => v.type === "top");
    dr.sel = { type: "view", id: top.id };
    dr.addHoleTable();
    const t = d.holeTables?.[0];
    const rows = t ? dr.holeTableOf(d, t).rows : [];
    const svg = dr.svg.outerHTML;
    // Hinweis an der ersten Bohrung: Text wird aus dem Bohrungs-Feature vorgeschlagen
    const c = (dr.proj.get(top.id).arcs || []).find((x) => x.full);
    const [sx, sy] = dr.viewXf(top).to(c.cx + c.r, c.cy);
    dr.setTool("leader");
    dr.leaderClick(sx, sy);
    return { rows: rows.length, tags: rows.map((r) => r.tag).join(), svg: svg.includes("data-holetable") && svg.includes(">Bohrung<") && svg.includes(">A1<") };
  });
  await page.waitForTimeout(200);
  const sug = await page.locator("#modal-root .dialog input").first().inputValue();
  await page.locator("#modal-root .dialog footer .btn", { hasText: "OK" }).click();
  await evalApp(() => { const dr = window.__werkcad.drawing; dr.setTool(null); dr.addRevisionDialog(); });
  await page.locator("#modal-root .dialog .field", { has: page.locator('label:text-is("Änderung")') }).locator("input").fill("Bohrungen auf Ø11");
  await page.locator("#modal-root .dialog footer .btn", { hasText: "Eintragen" }).click();
  Object.assign(ht, await evalApp(async () => {
    const a = window.__werkcad, dr = a.drawing, d = a.activeDoc();
    const orig = a.files.saveText;
    let text = "";
    a.files.saveText = async (t) => { text = t; };
    try { await dr.exportDxf(); } finally { a.files.saveText = orig; }
    const svg = dr.exportSvgString();
    return { leader: d.leaders?.[0]?.text, rev: d.revisions?.map((r) => r.rev).join(), revSvg: svg.includes("Bohrungen auf Ø11") && svg.includes("data-revisions"), dxf: text.includes("A1") && text.includes("Bohrungen auf") && text.includes("11 durch") };
  }));
  ht.sug = sug;
  step("Bohrungstabelle, Hinweis und Änderung", ht.rows === 4 && ht.tags === "A1,A2,A3,A4" && ht.svg && /^4× Ø11/.test(ht.sug) && ht.leader === ht.sug && ht.rev === "B" && ht.revSvg && ht.dxf, JSON.stringify(ht));
  await shot("15d-bohrungstabelle");

  // Hilfsansicht auf die Gehrung des Rohrs
  await evalApp(() => window.__werkcad.newDrawing({ kind: "part", id: "beispiel_rohr" }));
  await idle(120000);
  await page.waitForTimeout(1000);
  await idle(120000);
  await evalApp(() => {
    const dr = window.__werkcad.drawing, d = dr.doc;
    // In der Vorderansicht erscheint die Gehrung (30°) als schräge Kante aus kurzen Stücken
    const front = d.views.find((v) => v.type === "front");
    let seg = null;
    for (const pl of dr.proj.get(front.id).visible) for (let i = 1; i < pl.length && !seg; i++) {
      const dx = pl[i][0] - pl[i - 1][0], dy = pl[i][1] - pl[i - 1][1], L = Math.hypot(dx, dy);
      if (L > 2 && Math.abs(dx) / L < 0.99 && Math.abs(dy) / L < 0.99) seg = [pl[i - 1], pl[i]];
    }
    dr.sel = { type: "view", id: front.id };
    dr.startAux();
    const [sx, sy] = dr.viewXf(front).to((seg[0][0] + seg[1][0]) / 2, (seg[0][1] + seg[1][1]) / 2);
    dr.auxClick(sx, sy);
  });
  await idle(120000);
  await page.waitForTimeout(800);
  const aux = await evalApp(() => {
    const dr = window.__werkcad.drawing, d = dr.doc;
    const v = d.views.find((x) => x.type === "aux");
    const p = v && dr.proj.get(v.id);
    const svg = dr.exportSvgString();
    const par = d.views.find((x) => x.id === v?.parent), pc = par && dr.viewCam(d, par);
    return v ? { letter: v.letter, vis: p?.visible.length || 0, err: p?.error, dirY: Math.round((v.dir[0] * pc.dir[0] + v.dir[1] * pc.dir[1] + v.dir[2] * pc.dir[2]) * 1000), tool: dr.tool, mark: (svg.match(new RegExp(`>${v.letter}<`, "g")) || []).length } : null;
  });
  step("Hilfsansicht", aux && aux.vis > 0 && !aux.err && aux.dirY === 0 && !aux.tool && aux.mark >= 2, JSON.stringify(aux));
  await evalApp(() => window.__werkcad.drawing.fitSheet());
  await shot("15e-hilfsansicht");
  await evalApp(() => { const a = window.__werkcad, id = a.activeId; a.openDoc("beispiel_zeichnung"); a.project.docs = a.project.docs.filter((x) => x.id !== id); a.changed({ rebuild: false }); });
  await idle(120000);

  // Bruchansicht und Ausbruch (Werkzeuge Stufe 35) in der Vorderansicht der Grundplatte
  const brk = await evalApp(() => {
    const dr = window.__werkcad.drawing, d = dr.doc, front = d.views.find((v) => v.type === "front");
    const w0 = dr.sheetRects(d)[front.id].rect;
    const bb = dr.proj.get(front.id).bbox;
    dr.sel = { type: "view", id: front.id };
    dr.breakDialog();
    return { w0: w0[2] - w0[0], bb, id: front.id };
  });
  await page.locator("#modal-root .dialog footer .btn", { hasText: /^Brechen$/ }).click();
  Object.assign(brk, await evalApp((id) => {
    const dr = window.__werkcad.drawing, d = dr.doc, v = d.views.find((x) => x.id === id);
    const w1 = dr.sheetRects(d)[id].rect;
    const svg = dr.exportSvgString();
    // Ausbruch in der Mitte der Ansicht, Tiefe halbe Plattendicke
    const bb = dr.proj.get(id).bbox, xf = dr.viewXf(v), c = xf.to(bb.x0 + (bb.x1 - bb.x0) * 0.12, (bb.y0 + bb.y1) / 2); // links vom Bruch
    dr.sel = { type: "view", id };
    dr.startBreakout();
    dr.breakoutClick(c[0], c[1]);
    dr.breakoutClick(c[0] + 4, c[1]);
    return { breaks: v.breaks?.length, w1: w1[2] - w1[0], zig: (svg.match(/<polyline/g) || []).length };
  }, brk.id).catch((e) => ({ err: String(e) })));
  await page.waitForTimeout(200);
  await page.locator("#modal-root .dialog footer .btn", { hasText: "OK" }).click();
  await idle(120000);
  await page.waitForTimeout(800);
  Object.assign(brk, await evalApp(async (id) => {
    const a = window.__werkcad, dr = a.drawing, d = dr.doc, v = d.views.find((x) => x.id === id), p = dr.proj.get(id);
    const orig = a.files.saveText;
    let text = "";
    a.files.saveText = async (t) => { text = t; };
    try { await dr.exportDxf(); } finally { a.files.saveText = orig; }
    return { bo: v.breakouts?.length, loops: p?.sectionLoops?.length || 0, hatch: (text.match(/\nSCHRAFFUR\r?\n/g) || []).length };
  }, brk.id));
  step("Bruchansicht und Ausbruch", brk.breaks === 1 && brk.w1 < brk.w0 * 0.75 && brk.zig >= 2 && brk.bo === 1 && brk.loops > 0 && brk.hatch > 2, JSON.stringify(brk));
  await evalApp(() => window.__werkcad.drawing.fitSheet());
  await shot("15f-bruch-ausbruch");

  // Zeichnungsprüfung (Inventor-Abgleich): Achsen an Bohrungen, Feldeinteilung, projizierte Ansicht mit eigenem Maßstab
  {
    const pz = await evalApp(async () => {
      const a = window.__werkcad, dr = a.drawing, d = dr.doc;
      const axes = d.views.reduce((n, v) => n + (dr.axesOn(d, v) ? dr.proj.get(v.id)?.axes?.length || 0 : 0), 0);
      const base = d.views.find((v) => !v.parent && v.type !== "iso" && !v.breaks?.length) || d.views.find((v) => !v.parent && v.type !== "iso");
      dr.sel = { type: "view", id: base.id };
      dr.startProjected();
      const n0 = d.views.length;
      dr.projClick(base.x - 1, base.y + 400);
      dr.setTool(null);
      const nv = d.views.at(-1);
      return { axes, added: d.views.length - n0, align: nv.align, parent: nv.parent === base.id, id: nv.id, zones: dr.exportSvgString().includes('data-zones="1"') };
    });
    await idle(120000);
    await page.waitForTimeout(800);
    Object.assign(pz, await evalApp((id) => {
      const a = window.__werkcad, dr = a.drawing, d = dr.doc, v = d.views.find((x) => x.id === id);
      a.edit("Maßstab", () => { v.scale = 1 / 3; }, { rebuild: false });
      const svg = dr.exportSvgString();
      const ok = !!dr.proj.get(id)?.visible?.length;
      a.edit("weg", () => { d.views = d.views.filter((x) => x.id !== id); }, { rebuild: false });
      return { proj: ok, label: svg.includes("(1:3)") };
    }, pz.id));
    step("Zeichnung: Achsen, Feldeinteilung, Projiziert, eigener Maßstab", pz.axes > 0 && pz.added === 1 && pz.align === "x" && pz.parent && pz.zones && pz.proj && pz.label, JSON.stringify(pz));
  }

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
  // Kinematik (MegaCAD-Abgleich M23): Drehgelenk anlegen, Winkel per Regler, Bewegen, Explosion, Bereich prüfen
  const jc = await evalApp(() => {
    const a = window.__werkcad, c = a.activeDoc().components.find((x) => !x.fixed);
    a.sel = { type: "component", id: c.id };
    a.props.render();
    a.props.jointDialog(c);
    return { id: c.id, pos: JSON.stringify(c.pos), rot: JSON.stringify(c.rot) };
  });
  await page.locator("#modal-root .dialog footer .btn", { hasText: "Anlegen" }).click();
  await idle(60000);
  await evalApp(() => { const s = document.querySelector("#props input.joint-angle"); s.value = "45"; s.dispatchEvent(new Event("input")); s.dispatchEvent(new Event("change")); });
  await idle(60000);
  await shot("17b2-drehgelenk");
  const kin = await evalApp(async (id) => {
    const a = window.__werkcad, v = a.viewer, asm = a.activeDoc(), c = asm.components.find((x) => x.id === id);
    const r = { joint: !!c.joint, angle: c.joint?.angle, rot: c.rot.map((x) => Math.round(x)), section: /Drehgelenk/.test(document.querySelector("#props")?.textContent || "") };
    r.anim = await a.props.animateJoints(null, { duration: 300 });
    r.cleared = v.compDeltas.size === 0;
    const g = v.root.children.find((x) => x.userData.comp === id);
    v.setExplode(1);
    r.exploded = v.root.children.filter((x) => x.userData.comp).some((x) => !x.matrix.equals(x.userData.baseMatrix));
    v.setExplode(0);
    r.back = g.matrix.equals(g.userData.baseMatrix);
    const rows = await a.props.jointSweepCheck(c, { steps: 2, silent: true });
    r.sweep = rows?.map((x) => x.angle);
    return r;
  }, jc.id);
  const undoKin = await evalApp((jc) => {
    const a = window.__werkcad;
    a.undo(); a.undo();
    const c = a.activeDoc().components.find((x) => x.id === jc.id);
    return { joint: !!c.joint, same: JSON.stringify(c.pos) === jc.pos && JSON.stringify(c.rot) === jc.rot };
  }, jc);
  await idle(60000);
  step("Drehgelenk und Explosion", kin.joint && kin.angle === 45 && kin.section && kin.anim === true && kin.cleared && kin.exploded && kin.back && kin.sweep?.join() === "0,45,90" && !undoKin.joint && undoKin.same, JSON.stringify({ kin, undoKin }));
  // Bauteil als eigene Datei (MegaCAD-Abgleich M24): speichern, Schreibschutz, Quelle ändern → aktualisieren, in Baugruppe verknüpfen
  const lk = await evalApp(async () => {
    const a = window.__werkcad, f = a.files, asmId = a.activeId, fs = new Map();
    const orig = { w: f.writeProjectFile, r: f.readLinkedFile, p: f.pickProjectFile };
    f.writeProjectFile = async (name, text) => { const p = "/teile/" + name; fs.set(p, text); return p; };
    f.readLinkedFile = async (p) => { if (!fs.has(p)) throw new Error("Datei nicht gefunden"); return fs.get(p); };
    const r = {};
    try {
      const part = a.doc("beispiel_platte");
      await f.savePartAsFile(part);
      r.link = part.link?.path;
      r.file = JSON.parse(fs.get(r.link)).docs.length;
      r.blocked = a.edit("Name", () => { a.doc("beispiel_platte").name = "Geändert"; }) === false && a.doc("beispiel_platte").name === "Grundplatte";
      a.openDoc("beispiel_platte");
      const nf = part.features.length;
      r.blocked = r.blocked && a.createSketch({ ref: "XY" }) === null && a.addFeature({ type: "extrude" }) === undefined && a.mode !== "sketch" && part.features.length === nf;
      const src = JSON.parse(fs.get(r.link)), len0 = part.params.find((x) => x.name === "Länge").expr, len1 = `(${len0}) + 55`;
      src.docs[0].params.find((x) => x.name === "Länge").expr = len1;
      fs.set(r.link, JSON.stringify(src));
      const res = await f.refreshLinks();
      r.updated = res.updated.join();
      r.len = a.doc("beispiel_platte").params.find((x) => x.name === "Länge").expr === len1;
      f.pickProjectFile = async () => ({ path: r.link, text: fs.get(r.link) });
      a.openDoc(asmId);
      const n0 = a.activeDoc().components.length;
      await f.linkPartFromFile();
      r.comps = a.activeDoc().components.length - n0;
      r.reused = a.project.docs.filter((d) => d.link).length === 1;
      r.tree = [...document.querySelectorAll("#browser .node .label")].some((n) => n.textContent === "Grundplatte ↗");
      a.undo(); a.undo(); a.undo();
      r.undone = !a.doc("beispiel_platte").link && a.doc("beispiel_platte").params.find((x) => x.name === "Länge").expr === len0 && a.activeDoc().components.length === n0;
    } finally { Object.assign(f, { writeProjectFile: orig.w, readLinkedFile: orig.r, pickProjectFile: orig.p }); }
    return r;
  });
  await idle(60000);
  step("Bauteil als eigene Datei verknüpft", lk.link === "/teile/BG-100-01.wcad" && lk.file === 1 && lk.blocked && lk.updated === "Grundplatte" && lk.len && lk.comps === 1 && lk.reused && lk.tree && lk.undone, JSON.stringify(lk));
  await shot("17b-abhaengigkeit");

  // Unterbaugruppen (MegaCAD-Abgleich M19): Beispiel-Baugruppe zweimal in eine neue Baugruppe, Mengen verdoppeln sich
  const inner = await evalApp(() => window.__werkcad.activeId);
  await evalApp((id) => {
    const a = window.__werkcad, top = a.newAssembly();
    a.edit("Bauteil einfügen", () => { top.components.push({ id: "u1", part: id, name: "Feld:1", pos: [0, 0, 0], rot: [0, 0, 0], fixed: true }, { id: "u2", part: id, name: "Feld:2", pos: [0, 1500, 0], rot: [0, 0, 0] }); });
  }, inner);
  await idle(120000);
  await shot("17c-unterbaugruppe");
  const sub = await evalApp(async (id) => {
    const a = window.__werkcad, top = a.activeDoc(), innerDoc = a.doc(id);
    const groups = []; a.viewer.root.traverse((o) => { if (o.userData?.leaf) groups.push(o.userData.comp); });
    const orig = a.files.saveBinary; let text = "";
    a.files.saveBinary = async (buf) => { text = new TextDecoder().decode(buf); };
    try { await a.files.exportListsXlsx(); } finally { a.files.saveBinary = orig; }
    const tree = [...document.querySelectorAll("#browser .node .label")].map((n) => n.textContent);
    return { leaves: groups.length, expected: 2 * innerDoc.components.filter((c) => !c.hidden).length, sheets: [...text.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]), nested: tree.filter((t) => t === innerDoc.components[0].name).length, top: top.kind };
  }, inner);
  step("Unterbaugruppe", sub.leaves === sub.expected && sub.sheets.includes("Strukturstückliste") && sub.sheets.includes("Baukastenstückliste") && sub.nested >= 2, JSON.stringify(sub));
  // Normteil (MegaCAD-Abgleich M20): Dialog in der Baugruppe, 4 × M12 x 40 → eigene Zeile in der Stückliste
  await page.locator("#ribbon button", { hasText: /^Normteil$/ }).first().click();
  await page.locator("#modal-root .dialog input.normlib-qty").fill("4");
  await page.locator("#modal-root .dialog footer .btn", { hasText: "Einfügen" }).click();
  await idle(60000);
  const nt = await evalApp(async () => {
    const a = window.__werkcad, top = a.activeDoc();
    const orig = a.files.saveBinary; let text = "";
    a.files.saveBinary = async (buf) => { text = new TextDecoder().decode(buf); };
    try { await a.files.exportListsXlsx(); } finally { a.files.saveBinary = orig; }
    const p = a.parts().find((x) => x.normDesignation);
    const r = p && a.results.get(p.id);
    return { comps: top.components.filter((c) => c.part === p?.id).length, body: r?.bodies?.[0]?.name, ok: r && Object.values(r.status).every((x) => x.ok), inXlsx: text.includes("Sechskantschraube ISO 4017 - M12 x 40 - 8.8"), partRow: text.includes(">" + p?.name + "<") };
  });
  step("Normteil in der Baugruppe", nt.comps === 4 && nt.ok && nt.body === "Sechskantschraube ISO 4017 - M12 x 40 - 8.8" && nt.inXlsx, JSON.stringify(nt));
  // Normteil-Bibliothek (Inhaltscenter): Suche nach alter DIN-Nummer, Vorschau, dann Garnitur an einer Bohrung
  await page.locator("#ribbon button", { hasText: /^Normteil$/ }).first().click();
  await page.locator("#modal-root .normlib-cats input").fill("DIN 912");
  await page.locator("#modal-root .normlib-fam").first().click();
  await shot("normteil-bibliothek");
  const lib = await evalApp(() => ({ fams: document.querySelectorAll("#modal-root .normlib-fam").length, title: document.querySelector("#modal-root .normlib-detail h4")?.textContent, svg: document.querySelectorAll("#modal-root .normlib-prev polygon").length, desig: document.querySelector("#modal-root .normlib-detail .kv b")?.textContent }));
  await page.locator("#modal-root .normlib-cats input").fill("");
  await page.locator("#modal-root .normlib-cat", { hasText: "Schrauben" }).click();
  await page.locator("#modal-root .normlib-fam", { hasText: "Gewinde bis Kopf" }).click();
  await page.locator("#modal-root .dialog footer .btn", { hasText: "An Bohrung" }).click();
  const holePlate = await evalApp(() => {
    const a = window.__werkcad, asm = a.activeDoc();
    const p = { id: "pLoch", kind: "part", name: "Lochplatte", material: "S235", color: null, params: [], description: "", number: "", features: [
      { id: "q", type: "regelkoerper", name: "Platte", kind: "quader", dims: { L: "100", B: "100", H: "10" }, pos: ["0", "0", "0"], axis: "Z", op: "join" },
      { id: "z", type: "regelkoerper", name: "Loch", kind: "zylinder", dims: { D: "13.5", H: "12" }, pos: ["0", "0", "-1"], axis: "Z", op: "cut" }] };
    a.edit("Lochplatte", () => { a.project.docs.push(p); asm.components.push({ id: "cLoch", part: p.id, name: "Lochplatte:1", pos: [0, 0, 300], rot: [0, 0, 0], fixed: true }); });
    return a.pick?.kind;
  });
  await idle(60000);
  const hole = await evalApp(() => {
    const a = window.__werkcad, asm = a.activeDoc();
    const faces = a.assemblyFaces("pLoch");
    const cylF = faces.find((f) => f.type === "CYLINDER" && Math.abs(f.radius - 6.75) < 0.01);
    if (!cylF) return { err: "keine Bohrung", faces: faces.length };
    const top = Math.max(...faces.filter((f) => f.type === "PLANE" && f.normal[2] > 0.99).map((f) => f.point[2]));
    const hit = { kind: "face", key: "comp:cLoch", info: { ...cylF }, point: [cylF.axisP[0] + 6.75, cylF.axisP[1], top - 0.5 + 300], group: { userData: {} } };
    const orig = a.viewer.pick; a.viewer.pick = () => hit;
    try { a.viewerClick({ clientX: 0, clientY: 0 }); } finally { a.viewer.pick = orig; }
    a.cancelPick();
    const added = asm.components.filter((c) => c.id !== "cLoch" && asm.constraints?.some((k) => k.b.comp === c.id && k.type === "einfuegen"));
    return { names: added.map((c) => a.doc(c.part).normDesignation), z: added.map((c) => Math.round(c.pos[2] * 100) / 100), top };
  });
  await idle(60000);
  const solved = await evalApp(() => { const a = window.__werkcad, asm = a.activeDoc(); a.solveAssemblyConstraints(asm); return Object.keys(a.asmErrors || {}).filter((id) => asm.constraints.find((k) => k.id === id)?.type === "einfuegen").length; });
  await evalApp(() => { const a = window.__werkcad; a.sel = { type: "component", id: "cLoch" }; a.viewer.fit?.(); });
  await shot("normteil-an-bohrung");
  step("Normteil-Bibliothek: Suche, Vorschau, Garnitur an Bohrung", lib.title === "Zylinderschraube mit Innensechskant" && lib.svg > 2 && holePlate === "normHole"
    && hole.names?.join("|") === "Scheibe ISO 7089 - 12 - 200 HV|Sechskantschraube ISO 4017 - M12 x 30 - 8.8|Scheibe ISO 7089 - 12 - 200 HV|Sechskantmutter ISO 4032 - M12 - 8" && solved === 0,
    JSON.stringify({ lib, hole, solved }));
  await evalApp((id) => window.__werkcad.openDoc(id), inner);
  await idle();

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
  await page.locator("#ribbon .rb-tab", { hasText: "Metallbau" }).click();
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

  // 3D-Profilzug (MegaCAD-Abgleich M2): über das Menüband, Punkt hinzufügen, Metergewicht sichtbar
  await evalApp(() => window.__werkcad.newPart("Profilzug"));
  await idle();
  await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
  await page.locator("#ribbon .rb-tab", { hasText: "Metallbau" }).click();
  await page.locator("#ribbon button", { hasText: "Profilzug 3D" }).click();
  await idle();
  const pz0 = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { bodies: r.bodies.length, errors: Object.values(r.status).filter((s) => !s.ok).length }; });
  await page.locator("#props button", { hasText: "+ Punkt" }).click();
  await idle();
  await evalApp(() => { const v = window.__werkcad.viewer; v.setView("iso", { animate: false }); v.fit(); });
  await shot("20b-profilzug");
  const pz1 = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { bodies: r.bodies.length, errors: Object.values(r.status).filter((s) => !s.ok).length }; });
  const pzKgm = await page.locator("#props dd", { hasText: "kg/m" }).first().textContent().catch(() => "");
  step("3D-Profilzug", pz0.bodies === 3 && pz0.errors === 0 && pz1.bodies === 4 && pz1.errors === 0 && /kg\/m/.test(pzKgm), JSON.stringify({ pz0, pz1, pzKgm }));

  // Rohr über Polygonzug (MegaCAD-Abgleich M4): Biegeliste, Radius ändern
  await evalApp(() => window.__werkcad.newPart("Biegerohr"));
  await idle();
  await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
  await page.locator("#ribbon .rb-tab", { hasText: "Metallbau" }).click();
  await page.locator("#ribbon button", { hasText: "Rohr gebogen" }).click();
  await idle();
  await evalApp(() => { const v = window.__werkcad.viewer; v.setView("iso", { animate: false }); v.fit(); });
  await shot("20c-biegerohr");
  const br0 = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { bodies: r.bodies.length, len: r.bodies[0]?.meta?.length, errors: Object.values(r.status).filter((s) => !s.ok).length }; });
  const brRows = await page.locator("#props table.grid tbody tr").count();
  const radIn = page.locator("#props .field", { hasText: "Biegeradius" }).locator("input").first();
  await radIn.fill("150");
  await radIn.press("Enter");
  await idle();
  const br1 = await evalApp(() => { const a = window.__werkcad; return a.results.get(a.activeId).bodies[0]?.meta?.length; });
  // R 100 → 900 + π·100; R 150: Geraden −4·150 + 2·(π/2)·150 statt −4·100 + π·100
  step("Rohr gebogen (Biegeliste)", br0.bodies === 1 && br0.errors === 0 && Math.abs(br0.len - (900 + Math.PI * 100)) < 1e-6 && brRows === 3 && Math.abs(br1 - (700 + Math.PI * 150)) < 1e-6, JSON.stringify({ br0, brRows, br1 }));

  // Regelkörper (MegaCAD-Abgleich M5): Zylinder anlegen, Form auf Kugel wechseln
  await evalApp(() => window.__werkcad.newPart("Regelkörper"));
  await idle();
  await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
  await page.locator("#ribbon button", { hasText: "Regelkörper" }).click();
  await idle();
  const rk0 = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { bodies: r.bodies.length, vol: r.bodies[0]?.props?.volume }; });
  await page.locator("#props .field", { hasText: "Form" }).locator("select").selectOption("kugel");
  await idle();
  const rk1 = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { bodies: r.bodies.length, vol: r.bodies[0]?.props?.volume, kind: a.activeDoc().features[0].kind }; });
  step("Regelkörper", rk0.bodies === 1 && Math.abs(rk0.vol - Math.PI / 4 * 2500 * 100) < 200 && rk1.kind === "kugel" && Math.abs(rk1.vol - Math.PI / 6 * 216000) < 200, JSON.stringify({ rk0, rk1 }));

  // Stirnplatte und Rippe (MegaCAD-Abgleich M8): Profil, Platte am Ende, 2 Rippen, Bohrungen auf 2
  await evalApp(() => window.__werkcad.newPart("Stirnplatte"));
  await idle();
  await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
  await page.locator("#ribbon .rb-tab", { hasText: "Metallbau" }).click();
  await page.locator("#ribbon button", { hasText: "Rohr / Profil" }).click();
  await idle();
  await page.locator("#ribbon .rb-tab", { hasText: "Metallbau" }).click();
  await page.locator("#ribbon button", { hasText: "Stirn-/Fußplatte" }).click();
  await idle();
  await page.locator("#ribbon .rb-tab", { hasText: "Metallbau" }).click();
  await rbClick("Rippe");
  await idle();
  const sp0 = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { n: r.bodies.length, kinds: r.bodies.map((b) => b.kind).join(), bad: Object.values(r.status).filter((s) => !s.ok).length }; });
  await evalApp(() => { const a = window.__werkcad; a.selectFeature(a.activeDoc().features.find((x) => x.type === "platte").id); });
  await idle();
  await page.locator("#props .seg button", { hasText: /^2$/ }).click();
  await idle();
  const sp1 = await evalApp(() => { const a = window.__werkcad; const f = a.activeDoc().features.find((x) => x.type === "platte"); return { holes: f.holes, info: a.results.get(a.activeId).status[f.id].info }; });
  await evalApp(() => { const v = window.__werkcad.viewer; v.setView("iso", { animate: false }); v.fit(); });
  await shot("20d-stirnplatte");
  step("Stirnplatte und Rippe", sp0.n === 4 && sp0.kinds === "member,solid,solid,solid" && sp0.bad === 0 && sp1.holes === "2" && /2 × Ø/.test(sp1.info), JSON.stringify({ sp0, sp1 }));

  // Schweißnähte (MegaCAD-Abgleich M9): a-Maß an Platte und Rippe, Nahtliste, Symbole in der Zeichnung
  const fillField = async (label, value) => { const inp = page.locator("#props .field", { hasText: label }).locator("input"); await inp.fill(value); await inp.press("Enter"); await idle(); };
  await fillField("Kehlnaht a, umlaufend", "5");
  await evalApp(() => { const a = window.__werkcad; a.selectFeature(a.activeDoc().features.find((x) => x.type === "rippe").id); });
  await idle();
  await fillField("Kehlnaht a, beidseitig", "4");
  const wl = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { n: r.welds?.length, rows: [...document.querySelectorAll("#props table.grid tbody tr")].map((tr) => tr.textContent) }; });
  const partId = await evalApp(() => window.__werkcad.activeId);
  await evalApp((id) => window.__werkcad.newDrawing({ kind: "part", id }), partId);
  await idle(120000);
  await page.waitForTimeout(1000);
  await idle(120000);
  await evalApp(() => window.__werkcad.drawing.autoWelds());
  await page.waitForTimeout(300);
  const ws = await evalApp(() => { const dr = window.__werkcad.drawing; return { marks: dr.doc.welds?.length, texts: [...dr.svg.querySelectorAll("[data-weld] text")].map((t) => t.textContent) }; });
  await shot("20e-schweissnaehte");
  step("Schweißnähte: Nahtliste und Symbole", wl.n === 3 && wl.rows.length === 2 && ws.marks === 3 && ws.texts.includes("a5") && ws.texts.filter((t) => t === "a4").length === 4, JSON.stringify({ wl, ws }));

  // Standardtoleranz (Stufe 30): Klasse und Nachkommastellen aus den Einstellungen, Grenzabmaße und Allgemeintoleranz am Maß
  {
    await evalApp((id) => { const a = window.__werkcad; a.prefs.set("dokument.toleranzklasse", "f"); a.prefs.set("dokument.nachkomma", 2); a.newDrawing({ kind: "part", id }); }, partId);
    await idle(120000);
    await page.waitForTimeout(1000);
    await idle(120000);
    await evalApp(() => window.__werkcad.drawing.autoDims({ silent: true }));
    await page.waitForTimeout(300);
    const t0 = await evalApp(() => { const d = window.__werkcad.drawing.doc, m = d.dims.find((x) => x.kind === "h" || x.kind === "v"); return { tol: d.title.toleranz, nk: d.nachkomma, id: m?.id, text: document.querySelector(`[data-dim="${m?.id}"] text`)?.textContent }; });
    const editTol = async (art, fill) => {
      await evalApp((id) => window.__werkcad.drawing.editDimText(id), t0.id);
      await page.locator("#dm-tol").selectOption(art);
      for (const [sel, v] of Object.entries(fill)) await page.locator(sel).fill(v);
      await page.locator(".dialog button", { hasText: /^OK$/ }).click();
      await page.waitForTimeout(200);
      return evalApp((id) => document.querySelector(`[data-dim="${id}"] text`)?.textContent, t0.id);
    };
    const tAbm = await editTol("abm", { "#dm-o": "0,2", "#dm-u": "-0,1" });
    await shot("20e2-masstoleranz");
    const tAllg = await editTol("allg", {});
    await evalApp(() => { const a = window.__werkcad; a.prefs.set("dokument.toleranzklasse", "m"); a.prefs.set("dokument.nachkomma", 1); });
    step("Standardtoleranz und Toleranz am Maß", t0.tol === "ISO 2768-f" && t0.nk === 2 && /^[\d.]+(,\d{1,2})?$/.test(t0.text || "") && /\+0,2\/−0,1$/.test(tAbm || "") && /±0,\d+$/.test(tAllg || ""), JSON.stringify({ t0, tAbm, tAllg }));
  }

  // Geländer-Generator (MegaCAD-Abgleich M10/M11): anlegen, über Eck, Füllung Glas, Zuschnittliste
  await evalApp(() => window.__werkcad.newPart("Geländer"));
  await idle();
  await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
  await evalApp(() => window.__werkcad.addGeneratorFeature("gelaender")); // Generator im Bauteil (Baugruppe: eigener Schritt)
  await idle(120000);
  const gl0 = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { n: r.bodies.length, info: Object.values(r.status)[0]?.info, ok: Object.values(r.status).every((s) => s.ok) }; });
  const runs = page.locator("#props .field", { hasText: "Läufe" }).locator("input");
  await runs.fill("3000; 1500");
  await runs.press("Enter");
  await idle(120000);
  await page.locator("#props .field", { hasText: "Füllung" }).locator(".tile", { hasText: "Glas" }).click();
  await idle(120000);
  const gl1 = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { n: r.bodies.length, glass: r.bodies.filter((b) => b.meta?.glass).length, members: r.bodies.filter((b) => b.kind === "member").length, info: Object.values(r.status)[0]?.info }; });
  await evalApp(() => { const v = window.__werkcad.viewer; v.setView("iso", { animate: false }); v.fit(); });
  await shot("20f-gelaender");
  step("Geländer-Generator", gl0.ok && gl0.n > 30 && /Pfosten/.test(gl0.info) && gl1.glass === 5 && gl1.members === 6 + 2 + 4 + 6 + 4 * 5 /* je Glas 4 Halter */ && /6 Pfosten/.test(gl1.info) && /6 Handlaufhalter \(Bohrung Ø 12,1\)/.test(gl1.info), JSON.stringify({ gl0, gl1 }));

  // Tor-Generator (MegaCAD-Abgleich M12): Doppeltor mit Stichbogen, dann Rundbogen
  await evalApp(() => window.__werkcad.newPart("Tor"));
  await idle();
  await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
  await evalApp(() => window.__werkcad.addGeneratorFeature("tor")); // Generator im Bauteil (Baugruppe: eigener Schritt)
  await idle(120000);
  const tor0 = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { n: r.bodies.length, info: Object.values(r.status)[0]?.info, ok: Object.values(r.status).every((s) => s.ok) }; });
  await evalApp(() => { const v = window.__werkcad.viewer; v.setView("front", { animate: false }); v.fit(); });
  await shot("20g-tor");
  await page.locator("#props .field", { hasText: "Oberkante" }).locator("select").selectOption("rund");
  await idle(120000);
  const tor1 = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { info: Object.values(r.status)[0]?.info, ok: Object.values(r.status).every((s) => s.ok) }; });
  step("Tor-Generator", tor0.ok && tor0.n > 30 && /Doppeltor/.test(tor0.info) && tor1.ok && /Scheitel 2750 mm/.test(tor1.info), JSON.stringify({ tor0, tor1 }));
  // Schiebetor (E8): Generator, dann als Baugruppe mit Schiebegelenk, Flügel per Regler öffnen, Bereich prüfen
  await evalApp(() => window.__werkcad.newPart("Schiebetor"));
  await idle();
  await evalApp(() => window.__werkcad.addGeneratorFeature("schiebetor")); // Generator-Feature im Bauteil (ältere Arbeitsweise)
  await idle(120000);
  const st0 = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { n: r.bodies.length, info: Object.values(r.status)[0]?.info, ok: Object.values(r.status).every((s) => s.ok), tiles: document.querySelectorAll("#props .tile").length, dims: document.querySelectorAll("#props svg.gsk .dim").length }; });
  await evalApp(() => { const a = window.__werkcad; a.activeDoc().finish = { kind: "pulver", ral: "6005" }; });
  await page.locator("#props button", { hasText: "Als Baugruppe mit Schiebegelenk" }).click();
  await idle(120000);
  await evalApp(() => { const s = document.querySelector("#props input.joint-angle"); s.value = "2000"; s.dispatchEvent(new Event("input")); s.dispatchEvent(new Event("change")); });
  await idle(120000);
  await evalApp(() => { const v = window.__werkcad.viewer; v.setView("front", { animate: false }); v.fit(); });
  await shot("20g2-schiebetor-offen");
  const st1 = await evalApp(async () => {
    const a = window.__werkcad, asm = a.activeDoc(), c = asm.components.find((x) => x.joint);
    const text = document.querySelector("#props")?.textContent || "";
    const rows = await a.props.jointSweepCheck(c, { steps: 2, silent: true });
    const fin = asm.components.map((x) => a.doc(x.part).finish?.ral).join();
    return { fin, kind: asm.kind, comps: asm.components.length, slide: c.joint.kind, max: c.joint.max, pos: c.pos.map((x) => Math.round(x)), section: /Schiebegelenk/.test(text) && /mm/.test(text), sweep: rows?.map((r) => [r.angle, r.hits.length]) };
  });
  step("Schiebetor mit Schiebegelenk", st0.ok && st0.n > 30 && /Gegengewicht 1600/.test(st0.info) && st0.tiles >= 5 && st0.dims >= 4 && st1.fin === "6005,6005" && st1.kind === "assembly" && st1.comps === 2 && st1.slide === "schiebe" && st1.max === 4000 && st1.pos.join() === "-2000,0,0" && st1.section && st1.sweep?.every(([, n]) => n === 0), JSON.stringify({ st0, st1 }));
  // Zaun (E9): Generator, Gelände per Bildkachel auf »gestuft«
  await evalApp(() => window.__werkcad.newPart("Zaun"));
  await idle();
  await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
  await evalApp(() => window.__werkcad.addGeneratorFeature("zaun")); // Generator im Bauteil (Baugruppe: eigener Schritt)
  await idle(120000);
  const zn0 = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { n: r.bodies.length, info: Object.values(r.status)[0]?.info, ok: Object.values(r.status).every((s) => s.ok), dims: document.querySelectorAll("#props svg.gsk .dim").length }; });
  await page.locator("#props .tile", { hasText: "gestuft" }).click();
  await idle(120000);
  await evalApp(() => { const v = window.__werkcad.viewer; v.setView("front", { animate: false }); v.fit(); });
  await shot("20g3-zaun-gestuft");
  const zn1 = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { info: Object.values(r.status)[0]?.info, ok: Object.values(r.status).every((s) => s.ok), rise: !!document.querySelector('#props [data-key="rise"]') }; });
  // V5: Fokus auf »Pfostenabstand« hebt die 5 Pfosten im 3D hervor; zu kurze Zaunlänge → Meldung direkt am Feld
  await page.locator("#props .field", { hasText: "Pfostenabstand max." }).locator("input").focus();
  const znHi = await evalApp(() => window.__werkcad.viewer.fieldGroup?.children.length || 0);
  await page.locator("#props .field", { hasText: "Zaunlänge" }).locator("input").fill("100");
  await page.locator("#props .field", { hasText: "Zaunlänge" }).locator("input").press("Enter");
  await idle(120000);
  const znErr = await evalApp(() => ({ msg: document.querySelector("#props .field-msg.err")?.textContent || "", bad: !!document.querySelector("#props .field-bad") }));
  await evalApp(() => window.__werkcad.undo());
  await idle(120000);
  step("Zaun-Generator", zn0.ok && zn0.n > 40 && /4 Felder/.test(zn0.info) && zn0.dims >= 3 && zn1.ok && /gestuft 600 mm/.test(zn1.info) && zn1.rise && znHi === 5 && /mindestens 500/.test(znErr.msg) && znErr.bad, JSON.stringify({ zn0, zn1, znHi, znErr }));

  // Treppen-Generator (MegaCAD-Abgleich M13): Wangentreppe, dann zwei Holme
  await evalApp(() => window.__werkcad.newPart("Treppe"));
  await idle();
  await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
  await evalApp(() => window.__werkcad.addGeneratorFeature("treppe")); // Generator im Bauteil (Baugruppe: eigener Schritt)
  await idle(120000);
  const tr0 = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { n: r.bodies.filter((b) => !/^Geländer/.test(b.name)).length, gel: r.bodies.filter((b) => /^Geländer/.test(b.name)).length, info: Object.values(r.status)[0]?.info, ok: Object.values(r.status).every((s) => s.ok) }; });
  await evalApp(() => { const v = window.__werkcad.viewer; v.setView("iso", { animate: false }); v.fit(); });
  await shot("20h-treppe");
  await page.locator("#props .field", { hasText: "Tragwerk" }).locator(".tile", { hasText: "Zwei Holme" }).click();
  await idle(120000);
  const tr1 = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { holme: r.bodies.filter((b) => /^Holm \S+$/.test(b.name)).length, ok: Object.values(r.status).every((s) => s.ok) }; });
  step("Treppen-Generator", tr0.ok && tr0.n === 17 + 30 + 6 /* Fußwinkel, Kopfplatten */ && tr0.gel > 20 && /16 Steigungen/.test(tr0.info) && /DIN 24531/.test(tr0.info) && /Knieleisten durch die Pfosten/.test(tr0.info) && tr1.ok && tr1.holme === 2, JSON.stringify({ tr0, tr1 }));

  // Listen als Excel (MegaCAD-Abgleich M18): Arbeitsmappe der Treppe abfangen und prüfen
  const xl = await evalApp(async () => {
    const a = window.__werkcad, orig = a.files.saveBinary;
    let got = null;
    a.files.saveBinary = async (buf, name) => { got = { n: buf.length, name, head: Array.from(buf.slice(0, 2)), text: new TextDecoder().decode(buf) }; };
    try { await a.files.exportListsXlsx(); } finally { a.files.saveBinary = orig; }
    return got && { n: got.n, name: got.name, pk: got.head.join(), sheets: [...got.text.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]) };
  });
  step("Listen als Excel", !!xl && xl.pk === "80,75" && /_Listen\.xlsx$/.test(xl.name) && /^(Stückliste,)?Zuschnitt,Summen je Profil$/.test(xl.sheets.join()), JSON.stringify(xl));

  // Treppe L-Form mit Podest und Spindeltreppe (MegaCAD-Abgleich M14)
  await page.locator("#props .field", { hasText: "Form" }).first().locator(".tile", { hasText: "L-Form" }).click();
  await idle(120000);
  // Skizze mit Maßen: Fokus auf »Laufbreite« hebt das Breitenmaß hervor; Geländer läuft außen ums Podest
  await page.locator("#props .field", { hasText: "Laufbreite" }).locator("input").focus();
  const gsk = await evalApp(() => {
    const svg = document.querySelector("#props .gsk-wrap svg"), a = window.__werkcad, r = a.results.get(a.activeId);
    return { dims: svg?.querySelectorAll(".dim").length || 0, hi: [...(svg?.querySelectorAll(".dim.hi text") || [])].map((t) => t.textContent), rails: svg?.querySelectorAll(".l.rail").length || 0,
      tiles: document.querySelectorAll("#props .tile svg").length, podestRail: r.bodies.filter((b) => /^Geländer rechts Pfosten/.test(b.name)).length >= 7 };
  });
  await shot("20i-treppe-skizze");
  step("Treppe: Skizze mit Maßen und Bildkacheln", gsk.dims >= 4 && gsk.hi.join() === "1000" && gsk.rails > 10 && gsk.tiles >= 8 && gsk.podestRail, JSON.stringify(gsk));
  const trL = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { podest: r.bodies.filter((b) => /^Podest/.test(b.name)).length, holme: r.bodies.filter((b) => /^Holm \S+ Lauf \d$/.test(b.name)).length, info: Object.values(r.status)[0]?.info, ok: Object.values(r.status).every((s) => s.ok) }; });
  await evalApp(() => { const v = window.__werkcad.viewer; v.setView("iso", { animate: false }); v.fit(); });
  await shot("20i-treppe-l");
  await evalApp(() => window.__werkcad.newPart("Spindeltreppe"));
  await idle();
  await evalApp(() => window.__werkcad.addGeneratorFeature("spindel")); // Generator im Bauteil (Baugruppe: eigener Schritt)
  await idle(120000);
  const sp = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { n: r.bodies.length, info: Object.values(r.status)[0]?.info, ok: Object.values(r.status).every((s) => s.ok) }; });
  await evalApp(() => { const v = window.__werkcad.viewer; v.setView("iso", { animate: false }); v.fit(); });
  await shot("20j-spindeltreppe");
  step("Treppe L-Form und Spindeltreppe", trL.ok && trL.holme === 4 && trL.podest >= 6 && /Podest auf/.test(trL.info) && sp.ok && sp.n > 40 && /Durchgangshöhe/.test(sp.info), JSON.stringify({ trL, sp }));
  // Balkon-Generator (MegaCAD-Abgleich M16)
  await evalApp(() => window.__werkcad.newPart("Balkon"));
  await idle();
  await evalApp(() => window.__werkcad.addGeneratorFeature("balkon")); // Generator im Bauteil (Baugruppe: eigener Schritt)
  await idle(120000);
  const bk = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { n: r.bodies.length, info: Object.values(r.status)[0]?.info, ok: Object.values(r.status).every((s) => s.ok), warn: Object.values(r.status)[0]?.warning || "" }; });
  await evalApp(() => { const v = window.__werkcad.viewer; v.setView("iso", { animate: false }); v.fit(); });
  await shot("20k-balkon");
  step("Balkon-Generator", bk.ok && bk.n > 40 && /Balkon 3000 × 1500 mm/.test(bk.info) && !bk.warn, JSON.stringify(bk));
  // Generator als Baugruppe mit Einzelteilen: Treppe über das Menüband → Baugruppe, jedes Teil ein Bauteil in eigener Lage
  // Generatoren stehen im Menüband der Baugruppe und bauen sich dort als Unterbaugruppe ein
  const host = await evalApp(() => { const a = window.__werkcad; a.newAssembly(); return { id: a.activeId }; });
  await page.locator("#ribbon .rb-tab", { hasText: "Zusammenfügen" }).click();
  await page.locator("#ribbon .rb-tab", { hasText: "Metallbau" }).click();
  await rbClick("Treppe");
  await idle(180000);
  const hosted = await evalApp((id) => { const a = window.__werkcad, h = a.doc(id), c = h.components[0]; return { n: h.components.length, sub: a.doc(c?.part)?.generator?.gen, open: a.activeDoc()?.id === c?.part }; }, host.id);
  const ga = async () => evalApp(() => {
    const a = window.__werkcad, asm = a.activeDoc();
    const parts = [...new Set(asm.components.map((c) => c.part))].map((id) => a.doc(id));
    const st = parts.map((p) => a.results.get(p.id)?.status || {}).flatMap((s) => Object.values(s));
    const wange = parts.find((p) => /Wange rechts$/.test(p.name)), wb = a.results.get(wange?.id)?.bodies?.[0]?.props?.bbox;
    return { kind: asm.kind, gen: asm.generator?.gen, comps: asm.components.length, parts: parts.length, genteil: parts.every((p) => p.features[0]?.type === "genteil"),
      ok: st.length > 0 && st.every((x) => x.ok), posts: asm.components.filter((c) => /Pfosten \d+$/.test(c.name)).length, postParts: new Set(asm.components.filter((c) => /Pfosten \d+$/.test(c.name)).map((c) => c.part)).size,
      wangeAlongX: wb ? wb[1][0] - wb[0][0] > 3000 && Math.abs(wb[0][1] + wb[1][1]) < 20 : false, wangeId: wange?.id, fields: document.querySelectorAll("#props .field").length };
  });
  const ga0 = await ga();
  await evalApp(() => { const v = window.__werkcad.viewer; v.setView("iso", { animate: false }); v.fit(); });
  await shot("20k2-treppe-baugruppe");
  const bw = page.locator("#props .field", { hasText: "Laufbreite" }).locator("input");
  await bw.fill("1200");
  await bw.press("Enter");
  await idle(180000);
  const ga1 = await ga();
  step("Generator als Baugruppe mit Einzelteilen", ga0.kind === "assembly" && ga0.gen === "treppe" && ga0.comps > 80 && ga0.parts >= 10 && ga0.parts < ga0.comps && ga0.genteil && ga0.ok && ga0.posts > 6 && ga0.postParts * 2 <= ga0.posts && ga0.wangeAlongX && ga0.fields > 20
    && ga1.ok && ga1.wangeId === ga0.wangeId && ga1.comps >= ga0.comps && hosted.n === 1 && hosted.sub === "treppe" && hosted.open, JSON.stringify({ ga0, ga1, hosted }));
  // Schiebetor aus der Baugruppe: Unterbaugruppe aus Flügel und festen Teilen mit Schiebegelenk
  const sgate = await evalApp((id) => {
    const a = window.__werkcad; a.openDoc(id); a.ribbon.addGenerator("schiebetor");
    const h = a.doc(id), sub = a.doc(h.components[1]?.part);
    return { n: h.components.length, kind: sub?.kind, slide: sub?.components?.find((c) => c.joint)?.joint?.kind };
  }, host.id);
  step("Schiebetor aus der Baugruppe", sgate.n === 2 && sgate.kind === "assembly" && sgate.slide === "schiebe", JSON.stringify(sgate));
  // Umwandeln eines Generator-Features, dessen Maß einen Teileparameter nutzt: Parameter gehen mit in die Baugruppe
  const gconv = await evalApp(() => {
    const a = window.__werkcad, p = a.newPart("Zaun mit Parameter");
    p.params = [{ name: "L", expr: "4000", comment: "" }];
    const f = a.addGeneratorFeature("zaun");
    f.params.length = "L";
    const asm = a.generatorAssembly("zaun", { params: f.params, name: "Zaun aus Teil", from: p });
    return { kind: asm.kind, params: asm.params?.length, comps: asm.components.length, len: asm.generator.params.length };
  });
  step("Generator mit Parameter als Baugruppe", gconv.kind === "assembly" && gconv.params === 1 && gconv.comps > 5 && gconv.len === "L", JSON.stringify(gconv));
  // Stahlbau-Generatoren (MegaCAD-Abgleich M15): Rahmenecke, Pfette, Windverband – je ein Bauteil, Normteile in der Liste
  const stb = {};
  for (const [label, file] of [["Rahmenecke", "20l-rahmenecke"], ["Pfette", "20m-pfette"], ["Windverband", "20n-windverband"]]) {
    await evalApp((n) => window.__werkcad.newPart(n), label);
    await idle();
    await evalApp((g) => window.__werkcad.addGeneratorFeature(g), { Rahmenecke: "rahmenecke", Pfette: "pfette", Windverband: "windverband" }[label]);
    await idle(120000);
    stb[label] = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { n: r.bodies.length, norm: r.bodies.filter((b) => b.meta?.norm).length, ok: Object.values(r.status).every((s) => s.ok), info: Object.values(r.status)[0]?.info }; });
    await evalApp(() => { const v = window.__werkcad.viewer; v.setView("iso", { animate: false }); v.fit(); });
    await shot(file);
  }
  step("Stahlbau-Generatoren", Object.values(stb).every((x) => x.ok && x.norm > 0) && stb.Rahmenecke.norm === 24 && stb.Windverband.norm === 2 + 4 * 4 /* Spannschlösser + Laschenschrauben mit 2 Scheiben und Mutter */, JSON.stringify(stb));
  // Gestell wie in Inventor: Skelett-Bauteil → Gestell einfügen (Menüband) → je Stab ein Bauteil, Gehrung per Klick, Gestell-Info
  await evalApp(() => {
    const a = window.__werkcad, src = a.doc("beispiel_rahmen"), p = a.newPart("Gestell-Skelett");
    p.params = JSON.parse(JSON.stringify(src.params));
    p.features = [JSON.parse(JSON.stringify(src.features.find((f) => f.type === "sketch")))];
    a.changed();
  });
  await idle();
  await page.locator("#ribbon .rb-tab", { hasText: "Metallbau" }).click();
  await rbClick("Gestell einfügen");
  await page.locator(".dialog .btn.primary", { hasText: "Einfügen" }).click();
  await idle(180000);
  const gs = async () => evalApp(() => {
    const a = window.__werkcad, asm = a.activeDoc(), parts = [...new Set(asm.components.map((c) => c.part))].map((id) => a.doc(id));
    const st = parts.flatMap((p) => Object.values(a.results.get(p.id)?.status || {}));
    const lens = parts.map((p) => Math.round(a.results.get(p.id)?.bodies?.[0]?.meta?.length || 0)).sort((x, y) => x - y);
    return { gestell: !!asm.gestell, members: asm.gestell?.members.length, comps: asm.components.length, parts: parts.length, ok: st.length > 0 && st.every((x) => x.ok), lens, joints: asm.gestell?.joints.length, sketches: a.viewer.sketchGroup?.children?.length ?? null };
  });
  const gs0 = await gs();
  await evalApp(() => { const v = window.__werkcad.viewer; v.setView("iso", { animate: false }); v.fit(); });
  await shot("20o-gestell");
  // Eckverbindung statt Gehrung zwischen Stab 1 und 2: Werkzeug starten, beide Stäbe »anklicken«
  await evalApp(() => {
    const a = window.__werkcad, asm = a.activeDoc();
    const comp = (no) => asm.components.find((c) => c.genKey && c.name.endsWith(" " + no));
    a.ribbon.run("gestellCorner");
    a.gestellPick({ key: "comp:" + comp(1).id });
    a.gestellPick({ key: "comp:" + comp(2).id });
  });
  await idle(180000);
  const gs1 = await gs();
  await page.locator("#ribbon .rb-tab", { hasText: "Metallbau" }).click();
  await rbClick("Gestell-Info");
  await page.waitForSelector(".dialog table.grid tbody tr", { timeout: 20000 });
  const infoRows = await page.locator(".dialog table.grid tbody tr").count();
  const infoMass = await page.locator(".dialog .hint").filter({ hasText: "Masse gesamt" }).textContent().catch(() => "");
  await shot("20p-gestell-info");
  await page.locator(".dialog .btn", { hasText: "Schließen" }).click();
  // Fußplatte an Stab 5 (Ende A) über die Eigenschaften: eigenes Einzelteil mit Bohrungen
  await evalApp(() => {
    const a = window.__werkcad, asm = a.activeDoc();
    a.sel = { type: "component", id: asm.components.find((c) => c.genKey && c.name.endsWith(" 5")).id };
    a.props.render();
  });
  await page.locator("#props label.chk", { hasText: "Platte an Ende A" }).locator("input").check();
  await idle(180000);
  const gsP = await evalApp(() => {
    const a = window.__werkcad, asm = a.activeDoc(), c = asm.components.find((x) => x.genKey?.startsWith("p:"));
    const b = c && a.results.get(c.part)?.bodies?.[0];
    return { comps: asm.components.length, plate: b?.meta?.plate || null, ok: !!c && Object.values(a.results.get(c.part)?.status || {}).every((x) => x.ok) };
  });
  step("Gestell wie Inventor", gs0.gestell && gs0.sketches > 0 && gs0.members === 5 && gs0.comps === 5 && gs0.parts === 3 && gs0.ok && gs0.lens[0] === 560 && gs0.lens.at(-1) === 1040
    && gs1.ok && gs1.joints === 1 && gs1.parts >= 4 && infoRows === 5 && /Masse gesamt [1-9][\d,.]* kg, Schwerpunkt/.test(infoMass)
    && gsP.ok && gsP.comps === 6 && gsP.plate?.holes === 4, JSON.stringify({ gs0, gs1, infoRows, infoMass, gsP }));
  // Kantteil (MegaCAD-Abgleich M17): U-Profil aus Blech, Abwicklung als DXF
  await evalApp(() => window.__werkcad.newPart("Kantteil"));
  await idle();
  await page.locator("#ribbon .rb-tab", { hasText: "Metallbau" }).click();
  await rbClick("Kantteil");
  await idle(60000);
  const kt = await evalApp(async () => {
    const a = window.__werkcad, r = a.results.get(a.activeId), f = a.activeDoc().features[0];
    const orig = a.files.saveText; let got = null;
    a.files.saveText = async (text, name) => { got = { name, n: text.length, bend: (text.match(/\nBIEGUNG\r?\n/g) || []).length }; };
    try { await a.files.exportKantteilDxf(f); } finally { a.files.saveText = orig; }
    return { ok: Object.values(r.status).every((s) => s.ok), info: r.status[f.id]?.info, dxf: got };
  });
  await evalApp(() => { const v = window.__werkcad.viewer; v.setView("iso", { animate: false }); v.fit(); });
  await shot("20o-kantteil");
  step("Kantteil mit Abwicklung", kt.ok && /Abwicklung 172[.,]36 × 1000 mm/.test(kt.info) && /_2mm\.dxf$/.test(kt.dxf?.name || "") && kt.dxf.bend >= 3, JSON.stringify(kt));

  // Zeichnung II (Werkzeuge Stufe 33/34): Abwicklungsansicht mit Biegenotiz und Biegetabelle, Oberfläche, Form- und Lagetoleranz, Bezug
  {
    const ktId = await evalApp(() => window.__werkcad.activeId);
    await evalApp((id) => window.__werkcad.newDrawing({ kind: "part", id }), ktId);
    await idle(120000);
    await page.waitForTimeout(800);
    await idle(120000);
    const fl = await evalApp(() => {
      const dr = window.__werkcad.drawing, d = dr.doc;
      dr.addFlatView();
      const v = d.views.find((x) => x.type === "flat"), p = v && dr.proj.get(v.id);
      return v ? { bends: p?.bends?.length, flat: Math.round(p?.flat * 100) / 100, len: p?.length } : null;
    });
    // Symbole an der Oberkante der Abwicklung: Werkzeug wählen, klicken, Dialog bestätigen
    for (const [tool, dx] of [["surface", 0.3], ["gdt", 0.5], ["datum", 0.8]]) {
      await evalApp(([tool, dx]) => {
        const dr = window.__werkcad.drawing, d = dr.doc, v = d.views.find((x) => x.type === "flat"), p = dr.proj.get(v.id);
        const [sx, sy] = dr.viewXf(v).to(p.flat * dx, p.length);
        dr.setTool(tool);
        dr.symbolClick(sx, sy);
      }, [tool, dx]);
      await page.locator("#modal-root .dialog footer .btn", { hasText: "Setzen" }).click();
    }
    Object.assign(fl, await evalApp(async () => {
      const a = window.__werkcad, dr = a.drawing, d = dr.doc;
      dr.setTool(null);
      const svg = dr.exportSvgString();
      const orig = a.files.saveText;
      let text = "";
      a.files.saveText = async (t) => { text = t; };
      try { await dr.exportDxf(); } finally { a.files.saveText = orig; }
      return { syms: (d.symbols || []).map((y) => y.kind).join(), note: svg.includes("1: 90° auf R"), table: svg.includes(">Richtung<"), surf: svg.includes("Ra 3,2"), dxf: text.includes("Ra 3,2") && text.includes("1: 90") && text.includes("Richtung") };
    }));
    await evalApp(() => window.__werkcad.drawing.fitSheet());
    await shot("20o1-abwicklung-symbole");
    step("Abwicklung und Zeichnungssymbole", fl.bends === 2 && Math.abs(fl.flat - 172.36) < 0.01 && fl.len === 1000 && fl.syms === "surface,gdt,datum" && fl.note && fl.table && fl.surf && fl.dxf, JSON.stringify(fl));
    await evalApp((id) => { const a = window.__werkcad, dId = a.activeId; a.openDoc(id); a.project.docs = a.project.docs.filter((x) => x.id !== dId); a.changed({ rebuild: false }); a.selectFeature(a.activeDoc().features[0].id); }, ktId);
    await idle(60000);
  }

  // Biegetabelle (Stufe 31): im Einstellungscenter aus Excel-Zellen anlegen, Kantteil auf »Biegetabelle« → Abwicklung mit Tabellen-K
  {
    await evalApp(() => window.__werkcad.props.settingsDialog({ category: "blech" }));
    await page.locator(".bend-editor button", { hasText: "Biegetabelle anlegen" }).click();
    const dlg = page.locator(".dialog").last();
    await dlg.locator('input[aria-label="Blechdicke"]').fill("2");
    await dlg.locator("select").nth(1).selectOption("k");
    await dlg.locator("textarea.bend-grid").fill("\t1\t3\n45\t0,5\t0,5\n135\t0,5\t0,5");
    await dlg.locator("textarea.bend-grid").dispatchEvent("input");
    const cells = await dlg.locator(".bend-preview td").count();
    await shot("20o2-biegetabelle");
    await dlg.locator("button", { hasText: /^Übernehmen$/ }).click();
    await page.waitForTimeout(200);
    const listed = await page.locator(".bend-editor tbody tr").count();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await page.locator("#props .field", { hasText: "Biegeregel" }).locator("select").selectOption("tabelle");
    await idle(60000);
    const bt = await evalApp(() => { const a = window.__werkcad, r = a.results.get(a.activeId), f = a.activeDoc().features[0]; return { info: r.status[f.id]?.info, flat: r.bodies[0]?.meta?.sheet?.flat, stored: a.prefs.get("blech.biegetabellen").length, hint: [...document.querySelectorAll("#props .hint")].some((x) => /Gerechnet: Biegetabelle/.test(x.textContent)) }; });
    await evalApp(() => window.__werkcad.prefs.set("blech.biegetabellen", []));
    step("Biegetabelle anlegen und am Kantteil nutzen", cells === 4 && listed === 1 && bt.stored === 1 && Math.abs(bt.flat - (164 + 3 * Math.PI)) < 0.01 && /Biegetabelle S235 2 mm/.test(bt.info) && bt.hint, JSON.stringify({ cells, listed, bt }));
  }

  // Fotorealistische Darstellung (MegaCAD-Abgleich M22): PBR, Umgebungslicht, Bodenschatten, Bild hoch aufgelöst
  await evalApp(() => window.__werkcad.prefs.set("ansicht.darstellung", "foto"));
  await idle();
  await shot("20p-foto");
  const ft = await evalApp(async () => {
    const a = window.__werkcad, v = a.viewer;
    const pk = v.pickables[0];
    const st = { env: !!v.scene.environment, tone: v.renderer.toneMapping !== 0, shadow: v.renderer.shadowMap.enabled, stage: v.stage.children.length, ground: v.stage.children.some((o) => o.userData.ground), grid: v.grid.visible, lines: pk?.lines.visible, metal: pk?.mesh.material.metalness, cast: pk?.mesh.castShadow };
    a.prefs.set("ansicht.darstellung", "kanten");
    const orig = a.files.saveBinary; let got = null;
    a.files.saveBinary = async (buf, name) => { got = { name, head: Array.from(buf.slice(0, 4)), n: buf.length }; };
    try { await a.files.exportPng({ photo: true }); } finally { a.files.saveBinary = orig; }
    return { ...st, png: got, after: { mode: v.displayMode, env: !!v.scene.environment, stage: v.stage.children.length, lines: pk?.lines.visible, metal: pk?.mesh.material.metalness } };
  });
  step("Fotorealistische Darstellung", ft.env && ft.tone && ft.shadow && ft.ground && !ft.grid && ft.lines === false && ft.metal > 0.5 && ft.cast && /_Render\.png$/.test(ft.png?.name || "") && ft.png.head.join() === "137,80,78,71" && ft.after.mode === "kanten" && !ft.after.env && ft.after.stage === 0 && ft.after.lines && ft.after.metal < 0.2, JSON.stringify(ft));
  // Oberfläche und RAL-Farbe je Bauteil (E7): Auswahl im Eigenschaftenfeld, Farbe im Viewer, Text in der Stückliste
  {
    await evalApp(() => { const a = window.__werkcad; a.sel = null; a.props.render(); });
    const field = (label) => page.locator("#props .field", { has: page.locator(`label:text-is("${label}")`) }).locator("select");
    await field("Oberfläche").selectOption("pulver");
    await idle();
    await field("RAL-Farbe").selectOption("3000");
    await idle();
    const fin = await evalApp(() => {
      const a = window.__werkcad, part = a.activeDoc(), pk = a.viewer.pickables[0];
      const col = "#" + pk.mesh.material.color.getHexString();
      a.prefs.set("ansicht.darstellung", "foto");
      const photo = { metal: pk.mesh.material.metalness, col: "#" + pk.mesh.material.color.getHexString() };
      a.prefs.set("ansicht.darstellung", "kanten");
      return { finish: part.finish, col, photo, field: !!document.querySelector("#props .field select") };
    });
    step("Oberfläche und RAL-Farbe", fin.finish?.kind === "pulver" && fin.finish.ral === "3000" && fin.col === "#a72920" && fin.photo.col === "#a72920" && fin.photo.metal < 0.3, JSON.stringify(fin));
    await evalApp(() => window.__werkcad.edit("Oberfläche", () => { window.__werkcad.activeDoc().finish = null; }));
    await idle();
  }

  // Einzelteilzeichnungen (E5) und Fertigungsmappe (E3) aus der Beispiel-Baugruppe
  {
    const ez = await evalApp(async () => {
      const a = window.__werkcad;
      const parts = ["beispiel_rahmen", "beispiel_platte", "beispiel_rohr"];
      const drawn = () => parts.filter((id) => a.project.docs.some((x) => x.kind === "drawing" && x.source?.id === id));
      const before = drawn().length;
      const made = await a.partDrawings("beispiel_bg");
      const again = await a.partDrawings("beispiel_bg");
      const info = made.map((d) => ({ views: d.views.length, dims: d.dims.length, pend: !!(d.pendingAutoViews || d.pendingAutoDims), title: d.title.benennung }));
      const orig = a.files.saveBinary; let zip = null, name = "";
      a.files.saveBinary = async (buf, n) => { zip = new TextDecoder().decode(buf); name = n; };
      // Prüfung vor der Mappe (FU13): bei offenen Punkten erscheint ein Dialog → »Trotzdem erstellen«
      let asked = "";
      try {
        let done = false;
        const run = a.files.exportMappe(a.doc("beispiel_bg")).finally(() => { done = true; });
        while (!done) {
          const b = [...document.querySelectorAll(".dialog footer .btn")].find((x) => x.textContent === "Trotzdem erstellen");
          if (b) { asked = b.closest(".dialog").querySelector(".body").textContent; b.click(); }
          await new Promise((r) => setTimeout(r, 50));
        }
        await run;
      } finally { a.files.saveBinary = orig; }
      const openPage = zip ? zip.includes("Offene Punkte") : false;
      if (!!asked !== openPage) return { asked, openPage };
      return { before, made: made.length, again: again.length, after: drawn().length, info, name, pages: zip ? (zip.match(/class="pg"/g) || []).length : 0, lists: zip ? zip.includes("<h1>Stückliste") && zip.includes("<h1>Zuschnittliste") : false,
        dxf: zip ? (zip.match(/Zeichnungen\/[^\x00]*?\.dxf/g) || []).length : 0, pos: zip ? /Positionen\/01_/.test(zip) : false, laser: zip ? /Laser\/[^\x00]*?\.step/.test(zip) : false, step: zip ? zip.includes("ISO-10303-21") : false, xlsx: zip ? /_Listen\.xlsx/.test(zip) : false };
    });
    step("Einzelteilzeichnungen und Fertigungsmappe", ez.after === 3 && ez.made === 3 - ez.before && ez.made > 0 && ez.again === 0 && ez.info.every((x) => x.views >= 2 && x.dims > 0 && !x.pend) && /_Fertigungsmappe\.zip$/.test(ez.name) && ez.pages >= 4 && ez.lists && ez.dxf >= 3 && ez.pos && ez.laser && ez.step && ez.xlsx,
      JSON.stringify(ez));
  }

  // Problemliste (FU15) und Freigabe (FU13): Fehler einbauen, Liste zeigt ihn, Klick springt zum Feature;
  // Freigabe ohne Teilenummer nur mit Rückfrage, nach einer Maßänderung »Nach Freigabe geändert«
  {
    await evalApp(() => window.__werkcad.openDoc("beispiel_platte"));
    await idle();
    const pl = await evalApp(async () => {
      const a = window.__werkcad, d = a.activeDoc();
      const wait = async (pred, ms = 8000) => { const t = Date.now(); while (!pred() && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 50)); return pred(); };
      const out = {};
      // Fehler: Rundung mit riesigem Radius
      const f = d.features.find((x) => x.type === "extrude");
      a.edit("Test", () => { d.features.push({ id: "e2e_fillet", type: "fillet", name: "Zu große Rundung", mode: "dir", dir: "Z", radius: "5000" }); });
      await wait(() => a.results.get(d.id)?.status?.e2e_fillet && !a.busy);
      await new Promise((r) => setTimeout(r, 300));
      out.statusBtn = document.querySelector("#status .status-btn.err")?.textContent || "";
      document.querySelector("#status .status-btn.err")?.click();
      await wait(() => document.querySelector(".problems-dialog"));
      const row = [...document.querySelectorAll(".problem-list .problem")].find((x) => x.textContent.includes("Zu große Rundung"));
      out.row = row?.textContent || "";
      row?.click();
      await new Promise((r) => setTimeout(r, 200));
      out.selected = a.sel?.id;
      out.closed = !document.querySelector(".problems-dialog");
      a.edit("Test", () => { d.features = d.features.filter((x) => x.id !== "e2e_fillet"); });
      await wait(() => !a.results.get(d.id)?.status?.e2e_fillet);
      // Freigabe: ohne Fehler, Teilenummer vorhanden → direkt freigegeben
      a.sel = null; a.props.render();
      const sel = () => [...document.querySelectorAll("#props .section")].find((s) => s.querySelector("h3")?.textContent === "Freigabe")?.querySelector("select");
      await wait(() => sel());
      const s1 = sel(); s1.value = "freigegeben"; s1.dispatchEvent(new Event("change"));
      await wait(() => d.release?.status === "freigegeben" || document.querySelector(".dialog"));
      const ok = [...document.querySelectorAll(".dialog footer .btn")].find((x) => x.textContent === "Freigeben");
      if (ok) ok.click();
      await wait(() => d.release?.status === "freigegeben");
      out.released = d.release?.status;
      // Maß ändern → geändert nach Freigabe
      const before = f.depth;
      a.edit("Test", () => { f.depth = String(Number(f.depth) + 1); });
      await new Promise((r) => setTimeout(r, 300));
      a.props.render();
      out.changed = [...document.querySelectorAll("#props .msg.warn")].some((x) => x.textContent.includes("Nach der Freigabe geändert"));
      a.edit("Test", () => { f.depth = before; delete d.release; });
      return out;
    });
    step("Problemliste und Freigabe", /Fehler/.test(pl.statusBtn) && pl.row.includes("Zu große Rundung") && pl.selected === "e2e_fillet" && pl.closed && pl.released === "freigegeben" && pl.changed, JSON.stringify(pl));
    await idle();
  }

  // Angebotsblatt (E4): Dialog ausfüllen, Preis von Hand, Seite mit Bild und Summen
  {
    await evalApp(() => window.__werkcad.openDoc("beispiel_bg"));
    await idle();
    await evalApp(() => {
      const a = window.__werkcad;
      window.__angebot = null;
      a.files.saveText = ((orig) => async (text, name) => { window.__angebot = { text, name }; a.files.saveText = orig; return { path: name }; })(a.files.saveText);
      a.files.exportAngebot();
    });
    const af = (label) => page.locator("#modal-root .dialog .field", { has: page.locator(`label:text-is("${label}")`) }).locator("input, textarea");
    await af("Kunde").fill("Familie Muster\nGartenweg 2");
    await af("Menge").fill("2");
    await af("Einzelpreis netto €").fill("1.000");
    await page.locator("#modal-root .dialog footer .btn", { hasText: "Erstellen" }).click();
    await page.waitForFunction(() => !!window.__angebot, null, { timeout: 60000 });
    const ang = await evalApp(() => {
      const t = window.__angebot.text;
      return { name: window.__angebot.name, img: /<img src="data:image\/png;base64,[A-Za-z0-9+/]{100,}/.test(t), kunde: t.includes("Familie Muster<br>Gartenweg 2"), sum: (t.match(/Gesamtbetrag<\/td><td class="n">([^<]*)/) || [])[1], dims: /Hauptmaße \(L × B × H\)<\/td><td>[\d.]+ × [\d.]+ × [\d.]+ mm/.test(t), mass: /Gewicht ca\./.test(t), kept: window.__werkcad.activeDoc().angebot?.price };
    });
    step("Angebotsblatt", /^Angebot_BG-100\.html$/.test(ang.name) && ang.img && ang.kunde && ang.sum === "2.380,00 €" && ang.dims && ang.mass && ang.kept === "1.000", JSON.stringify(ang));
  }

  // Profil-Schnelleingabe (aus der Rohrlaser-Kalkulation): Profil-ID tippen, Treffer anklicken, Rückgängig
  await evalApp(() => window.__werkcad.newPart("Profil-ID"));
  await idle();
  await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
  await page.locator("#ribbon .rb-tab", { hasText: "Metallbau" }).click();
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

  // Konturen am Rohr (Rohr-Editor): Bohrung hinzufügen, Muster 3x100, Seite vorne, durchgehend
  await page.locator("#props button", { hasText: "+ Bohrung" }).click();
  await idle();
  const muster = page.locator("#props .tube-cut .field", { hasText: "Muster" }).locator("input");
  await muster.fill("3x100");
  await muster.press("Enter");
  await idle();
  await page.locator("#props .tube-cut .seg button", { hasText: "vorne" }).click();
  await idle();
  await page.locator("#props .tube-cut label.chk", { hasText: "Durchgehend" }).click();
  await idle();
  const tc = await evalApp(() => { const a = window.__werkcad; const r = a.results.get(a.activeId); const b = r.bodies[0]; return { cuts: a.activeDoc().features[0].cuts, pierces: b?.meta?.pierces, st: r.status[a.activeDoc().features[0].id], massbild: [...document.querySelectorAll("#props .tube-cut svg.massbild")].map((x) => x.getAttribute("aria-label")) }; });
  await shot("21-rohr-konturen");
  step("Konturen am Rohr", tc.cuts.length === 1 && tc.cuts[0].pattern === "3x100" && tc.cuts[0].side === "vorne" && tc.cuts[0].through === true && tc.pierces === 6 && tc.st.ok && !tc.st.warning && tc.massbild.length === 1 && /Bohrung: d$/.test(tc.massbild[0]),
    JSON.stringify({ cut: tc.cuts[0], pierces: tc.pierces, st: tc.st, massbild: tc.massbild }));

  // 2D/3D-Schnitt (Rohr-Editor): Gehrung 60° am Ende B, erst 3D (Winkelkorrektur ±45° meldet), dann 2D; Bohrung 3D +30° längs
  const endeB = page.locator("#props .section", { hasText: "Gehrung / Schrägschnitt" }).locator(".field", { hasText: /^Ende/ }).locator("input");
  await endeB.fill("60");
  await endeB.press("Enter");
  await idle();
  await page.locator("#props .field", { hasText: /^Schnitt\s*2D/ }).locator("button", { hasText: "3D" }).click(); // neue Profile starten mit 2D
  await idle();
  const fid = await evalApp(() => window.__werkcad.activeDoc().features[0].id);
  const w3 = await evalApp((id) => { const a = window.__werkcad; return a.results.get(a.activeId).status[id]; }, fid);
  await page.locator("#props .field", { hasText: /^Schnitt\s*2D/ }).locator("button", { hasText: "2D" }).click();
  await idle();
  await page.locator("#props .tube-cut label.chk", { hasText: "3D (schräg" }).click();
  await idle();
  await page.locator("#props .tube-cut .seg button", { hasText: "+30°" }).first().click();
  await idle();
  const w2 = await evalApp((id) => { const a = window.__werkcad; const r = a.results.get(a.activeId); return { st: r.status[id], ends: r.bodies[0]?.meta?.endCuts, cut: a.activeDoc().features[0].cuts[0] }; }, fid);
  await shot("22-rohr-2d-3d");
  step("2D/3D-Schnitt und Bohrung 3D", /Winkelkorrektur auf ±45°/.test(w3.warning || "") && w2.st.ok && !w2.st.warning && w2.ends.B === "2D" && w2.cut.d3 === true && w2.cut.tiltL === "30",
    JSON.stringify({ w3, w2 }));

  // Fertigungsprüfung (aus der Rohrlaser-Kalkulation): kurze Stange einstellen → Fehler unter der Zuschnittliste
  await evalApp(() => { const a = window.__werkcad; a.sel = null; a.prefs.set("fertigung.stange", 1000); });
  await page.waitForTimeout(300);
  const dfm1 = await page.locator("#props .dfm .msg").allTextContents();
  await shot("23-fertigungspruefung");
  await evalApp(() => window.__werkcad.prefs.reset(["fertigung.stange"]));
  await page.waitForTimeout(300);
  const dfm2 = await page.locator("#props .dfm .msg").allTextContents();
  // Steg zwischen den Bohrungen: Muster 3x40, Faktor 20 × Wand → zu schmal
  await evalApp(() => { const a = window.__werkcad; a.selectFeature(a.activeDoc().features[0].id); });
  await page.waitForTimeout(300);
  await muster.fill("3x40");
  await muster.press("Enter");
  await idle();
  await evalApp(() => { const a = window.__werkcad; a.sel = null; a.prefs.set("fertigung.steg", 20); });
  await page.waitForTimeout(300);
  const dfm3 = await page.locator("#props .dfm .msg").allTextContents();
  await evalApp(() => window.__werkcad.prefs.reset(["fertigung.steg"]));
  await page.waitForTimeout(300);
  step("Fertigungsprüfung", dfm1.length === 1 && /Teil zu lang/.test(dfm1[0]) && /keine Befunde/.test(dfm2.join()) && dfm3.length === 1 && /Steg zu schmal.*im Muster von Kontur 1/.test(dfm3[0]), JSON.stringify({ dfm1, dfm2, dfm3 }));

  // Einstellungscenter: über das Datei-Menü öffnen, suchen, ungültig ablehnen, gültig speichern, Modell unverändert
  {
    const prj0 = await evalApp(() => JSON.stringify(window.__werkcad.project));
    await page.locator("#ribbon .rb-file").click();
    await page.locator(".file-menu button", { hasText: "Einstellungen" }).click();
    await page.locator(".set-search input").fill("fang");
    const fang = page.locator('.set-row[data-key="skizze.fangradius"] input');
    await fang.waitFor({ state: "visible" });
    const rows = await page.locator(".set-row").count(); // Rasterfang, Fangradius, Ausrichtungslinien (»fängt«)
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
    step("Einstellungscenter", rows === 3 && /Höchstens 30/.test(err) && kept === 7 && st.fang === 12 && st.snapR === 12 && st.stored.values?.["skizze.fangradius"] === 12 && st.edge === "ff0000" && after.fang === 7 && prj0 === prj1,
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
      // Kamerafahrt abwarten (unter Last dauert sie länger als die nominellen 400 ms)
      for (let t = 0; t < 30 && (t < 4 || vw.anim); t++) await new Promise((r) => setTimeout(r, 100));
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
    await evalApp(() => window.__werkcad.commands.exec("app.search"));
    await page.locator(".cmd-palette input").fill("fase");
    await shot("23-befehlssuche");
    const first = await page.locator(".cmd-item.on .cmd-label").textContent();
    await page.keyboard.press("Enter");
    await idle();
    const f1 = await evalApp(() => { const d = window.__werkcad.activeDoc(); return { n: d.features.length, type: d.features.at(-1).type }; });
    // Kürzel G für Rundung im Einstellungscenter, E (belegt) wird abgelehnt
    await page.keyboard.press("Control+,");
    // Suche wird neu gerendert; auf den Kürzel-Bereich warten, sonst Suche einmal wiederholen (CI-Abbruch #113)
    for (let k = 0; k < 2; k++) {
      await page.locator(".set-search input").fill(k ? "" : "tastatur");
      if (k) await page.locator(".set-search input").fill("tastatur");
      try { await page.locator(".km input[type=search]").waitFor({ state: "visible", timeout: 10000 }); break; } catch (e) {
        if (k) throw new Error(`Kürzel-Bereich fehlt: ${await page.locator(".set-center").innerText().catch(() => "kein Dialog")}`.slice(0, 600));
      }
    }
    const row = page.locator('.km-row[data-cmd="part.fillet"] .km-key');
    // Liste wird bei jeder Eingabe neu gebaut; auf die Zeile warten, einmal neu filtern, falls sie fehlt (CI-Abbruch #94)
    for (let k = 0; k < 2; k++) {
      try {
        // Einstellungscenter kann nach der Suche noch einmal neu aufbauen: Feld dann neu suchen (CI-Abbruch #123)
        if (!(await page.locator(".km input[type=search]").isVisible())) { await page.locator(".set-search input").fill("tastatur"); await page.locator(".km input[type=search]").waitFor({ state: "visible", timeout: 10000 }); }
        await page.locator(".km input[type=search]").fill("rundung", { timeout: 10000 });
        await row.waitFor({ state: "visible", timeout: 8000 }); break;
      } catch (e) {
        if (k) throw new Error(`Kürzelzeile fehlt: ${await page.locator(".km").innerText().catch(() => "kein .km")}`.slice(0, 600));
        await idle();
      }
    }
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
    const tip = await evalApp(() => { window.__werkcad.ribbon.tab = "modell"; window.__werkcad.ribbon.render(); const b = [...document.querySelectorAll("#ribbon .rb-btn")].find((b) => b.textContent === "Rundung"); return b && `${b.dataset.tip} (${b.dataset.kbd})`; });
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
    const two = await evalApp(() => ({ r: window.__werkcad.measure.result, text: document.querySelector("#props").textContent, label: document.querySelector("#viewer .measure-label")?.textContent || "" }));
    // Ecken: beide Enden einer geraden oberen Kante anklicken → Abstand = Kantenlänge
    const ends = await evalApp(() => {
      const v = window.__werkcad.viewer;
      const r = v.container.getBoundingClientRect();
      let best = null;
      for (const pk of v.pickables) for (const e of pk.lines.userData.edges) {
        if (e.type !== "LINE") continue;
        const P = e.positions, a = [P[0], P[1], P[2]], b = [P[P.length - 3], P[P.length - 2], P[P.length - 1]];
        const L = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        if (a[2] > 11 && b[2] > 11 && (!best || L > best.L)) best = { a, b, L };
      }
      const s = (p) => { const [x, y] = v.worldToScreen(p); return [r.left + x, r.top + y]; };
      return { a: s(best.a), b: s(best.b), L: best.L };
    });
    await page.mouse.click(ends.a[0], ends.a[1]);
    await page.waitForTimeout(150);
    await page.mouse.click(ends.a[0], ends.a[1]);
    await page.waitForFunction(() => window.__werkcad.measure?.result?.items.length === 1 && !window.__werkcad.measure.busy, null, { timeout: 20000 });
    await page.mouse.click(ends.b[0], ends.b[1]);
    await page.waitForFunction(() => window.__werkcad.measure?.result?.items.length === 2 && !window.__werkcad.measure.busy, null, { timeout: 20000 });
    const vx = await evalApp(() => { const r = window.__werkcad.measure.result; return { types: r.items.map((i) => i.type), d: r.distance, delta: r.delta, text: document.querySelector("#props").textContent }; });
    // Stufe 47: Zweiteinheit Zoll im Maß, Strg-Klick nimmt ein drittes Element dazu (Summen)
    await page.locator("#props details.measure-more > summary", { hasText: "Erweiterte Einstellungen" }).click();
    await page.locator("#props .field", { hasText: "Zweiteinheiten" }).locator("select").selectOption("in");
    const inch = await evalApp(() => document.querySelector("#viewer .measure-label")?.textContent || "");
    await page.keyboard.down("Control");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.up("Control");
    await page.waitForFunction(() => window.__werkcad.measure?.result?.items.length === 3 && !window.__werkcad.measure.busy, null, { timeout: 20000 });
    const sum = await evalApp(() => ({ text: document.querySelector("#props").textContent, label: !!document.querySelector("#viewer .measure-label") }));
    await evalApp(() => window.__werkcad.prefs.set("messen.zweiteinheit", ""));
    await page.keyboard.press("Escape");
    const off = await evalApp(() => !window.__werkcad.pick && !window.__werkcad.measure && !document.querySelector("#viewer .measure-label"));
    const it = two.r.items[1];
    step("Messen", one.type === "PLANE" && one.area > 1000 && it.type === "CIRCLE" && Math.abs(it.radius * 2 - 11) < 0.6 && Math.abs(two.r.distance) < 1e-6 && /Durchmesser/.test(two.text) && off
      && /Mindestabstand/.test(two.text) && /Umfang/.test(two.text) && /Erweiterte Einstellungen/.test(two.text) && /mm/.test(two.label)
      && vx.types.join() === "POINT,POINT" && Math.abs(vx.d - ends.L) < 0.05 && /X-Abstand/.test(vx.text) && / in\)/.test(inch)
      && /Gesamtlänge \(2 Kanten\)|Gesamtfläche/.test(sum.text) && !sum.label,
      JSON.stringify({ one: { type: one.type, area: one.area }, two: { type: it.type, r: it.radius, d: two.r.distance, label: two.label }, off, vx: { types: vx.types, d: vx.d, L: ends.L }, inch, sum }));
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
    await page.keyboard.type("6"); // Eckenzahl in der Maßeingabe, dann Ecke klicken
    await page.mouse.move(mx + 230, my, { steps: 3 });
    await page.mouse.click(mx + 230, my);
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

  // Text in der Skizze (FU1): Werkzeug Text, Dialog, Platzhalter, Kontur mit Löchern, Gravur ins Blech
  {
    await evalApp(() => { const a = window.__werkcad; a.newPart("Schild"); a.activeDoc().number = "PB-42"; });
    await idle();
    await page.keyboard.press("s");
    await page.waitForTimeout(200);
    await page.locator("#props button", { hasText: "XY-Ebene" }).click();
    await page.waitForTimeout(800);
    const vb = await page.locator("#viewer canvas").boundingBox();
    const mx = vb.x + vb.width / 2, my = vb.y + vb.height / 2;
    await evalApp(() => window.__werkcad.sketcher.setTool("text"));
    await page.mouse.click(mx - 150, my);
    await page.waitForTimeout(150); // Dialog setzt den Fokus verzögert ins Textfeld
    await page.locator(".text-dialog textarea").fill("A {teilenummer}");
    await page.locator(".text-dialog input[type=number]").first().fill("20");
    await page.locator(".dialog footer .btn.primary").click();
    await page.waitForTimeout(300);
    await shot("25b-text");
    const tx = await evalApp(async () => {
      const a = window.__werkcad, s = a.sketcher, e = s.sk.entities.find((x) => x.type === "text");
      const prof = s.profiles;
      const out = { text: e?.text, h: e?.h, regions: prof.regions.length, holes: prof.regions.reduce((n, r) => n + r.holes.length, 0), path: !!document.querySelector("#overlay path.sk-line") };
      // Doppelklick öffnet den Dialog zum Ändern
      const p = s.sk.points.find((q) => q.id === e.p);
      const [sx, sy] = s.S(p.x + 40, p.y + 10);
      const r = s.canvas.getBoundingClientRect();
      s.setTool("select");
      s.dblClick({ clientX: r.left + sx, clientY: r.top + sy, preventDefault() {} });
      await new Promise((res) => setTimeout(res, 100));
      out.dialog = !!document.querySelector(".text-dialog");
      document.querySelector(".dialog footer .btn:not(.primary)")?.click();
      a.finishSketch();
      await new Promise((res) => setTimeout(res, 300));
      // Blech darunter und Text 1 mm graviert
      const d = a.activeDoc(), sk = d.features.find((f) => f.type === "sketch");
      a.edit("Test", () => {
        d.features.unshift({ id: "pl", type: "sketch", name: "Blech", plane: "XY", offset: "-5", points: [{ id: "q1", x: -400, y: -200 }, { id: "q2", x: 400, y: -200 }, { id: "q3", x: 400, y: 200 }, { id: "q4", x: -400, y: 200 }],
          entities: [["q1", "q2"], ["q2", "q3"], ["q3", "q4"], ["q4", "q1"]].map(([p1, p2], i) => ({ id: "ql" + i, type: "line", p1, p2 })), constraints: [] },
          { id: "plx", type: "extrude", sketch: "pl", distance: "5", mode: "normal" });
        d.features.push({ id: "grav", type: "extrude", sketch: sk.id, distance: "1", mode: "reverse", op: "cut" });
      });
      const t0 = Date.now();
      while (!(a.results.get(d.id)?.status?.grav) && Date.now() - t0 < 20000) await new Promise((res) => setTimeout(res, 100));
      const res = a.results.get(d.id);
      out.grav = res?.status?.grav;
      out.vol = res?.bodies?.reduce((v, b) => v + (b.props?.volume || 0), 0);
      return out;
    });
    step("Text in der Skizze", tx.text === "A {teilenummer}" && tx.h === 20 && tx.regions >= 6 && tx.holes >= 2 && tx.path && tx.dialog && tx.grav?.ok && tx.vol < 800 * 400 * 5 - 100,
      JSON.stringify(tx));
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

  // Skizze: Fensterauswahl (nach rechts ganz innen, nach links berührend) und Strg+A
  {
    await evalApp(() => window.__werkcad.newPart("Fenster"));
    await idle();
    await page.keyboard.press("s");
    await page.waitForTimeout(200);
    await page.locator("#props button", { hasText: "XY-Ebene" }).click();
    await page.waitForTimeout(800);
    const vb = await page.locator("#viewer canvas").boundingBox();
    const mx = vb.x + vb.width / 2, my = vb.y + vb.height / 2;
    await evalApp(() => window.__werkcad.sketcher.setTool("rect"));
    await page.mouse.click(mx - 200, my - 50);
    await page.mouse.click(mx - 100, my + 50);
    await evalApp(() => window.__werkcad.sketcher.setTool("circle"));
    await page.mouse.click(mx + 150, my);
    await page.mouse.click(mx + 190, my);
    await evalApp(() => window.__werkcad.sketcher.setTool("select"));
    const drag = async (x0, y0, x1, y1) => { await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(100); return evalApp(() => [...window.__werkcad.sketcher.sel].filter((k) => k.startsWith("e:")).length); };
    const win = await drag(mx - 230, my - 80, mx - 70, my + 80);
    const winPart = await drag(mx - 150, my - 80, mx + 250, my + 80);
    const cross = await drag(mx - 150, my + 80, mx - 300, my - 80);
    await page.mouse.click(mx, my + 200);
    await page.keyboard.press("Control+a");
    const all = await evalApp(() => [...window.__werkcad.sketcher.sel].filter((k) => k.startsWith("e:")).length);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    step("Skizze: Fensterauswahl und Strg+A", win === 4 && winPart === 2 && cross === 3 && all === 5, JSON.stringify({ win, winPart, cross, all }));
  }

  // Skizze: Verlängern bis zur nächsten Linie, dann Teilen über die Werkzeugleiste
  {
    await evalApp(() => window.__werkcad.newPart("Verlaengern"));
    await idle();
    await page.keyboard.press("s");
    await page.waitForTimeout(200);
    await page.locator("#props button", { hasText: "XY-Ebene" }).click();
    await page.waitForTimeout(800);
    await evalApp(() => window.__werkcad.sketcher.commit("Testgeometrie", (sk) => {
      sk.points.push({ id: "eg", x: 0, y: 10 }, { id: "ei", x: 20, y: 10 }, { id: "ec", x: 50, y: -30 }, { id: "ed", x: 50, y: 30 });
      sk.entities.push({ id: "ew", type: "line", p1: "eg", p2: "ei" }, { id: "ev", type: "line", p1: "ec", p2: "ed" });
    }));
    await evalApp(() => window.__werkcad.viewer.fit?.());
    await page.waitForTimeout(300);
    const cv = await page.locator("#viewer canvas").boundingBox();
    const at = async (x, y) => { const [sx, sy] = await evalApp(([x, y]) => window.__werkcad.sketcher.S(x, y), [x, y]); return [cv.x + sx, cv.y + sy]; };
    await rbClick("Verlängern");
    let [cx, cy] = await at(18, 10);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(200);
    const ext = await evalApp(() => { const p = window.__werkcad.sketcher.sk.points.find((q) => q.id === "ei"); return { x: p.x, y: p.y }; });
    await rbClick("Teilen");
    [cx, cy] = await at(35, 10);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(200);
    const spl = await evalApp(() => { const s = window.__werkcad.sketcher; return { lines: s.sk.entities.filter((e) => e.type === "line").length, ok: s.solve().ok }; });
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    step("Skizze: Verlängern und Teilen", Math.abs(ext.x - 50) < 1e-6 && Math.abs(ext.y - 10) < 1e-6 && spl.lines === 3 && spl.ok, JSON.stringify({ ext, spl }));
  }

  // Skizze: Rechteck- und Kreismuster über die Werkzeugleiste, Abstand nachträglich ändern
  {
    await evalApp(() => window.__werkcad.newPart("Muster"));
    await idle();
    await page.keyboard.press("s");
    await page.waitForTimeout(200);
    await page.locator("#props button", { hasText: "XY-Ebene" }).click();
    await page.waitForTimeout(800);
    await evalApp(() => window.__werkcad.sketcher.commit("Testgeometrie", (sk) => {
      sk.points.push({ id: "mm", x: 40, y: 0 });
      sk.entities.push({ id: "mk", type: "circle", c: "mm", r: 4 });
      sk.constraints.push({ id: "mf", type: "fix", p: "mm", x: 40, y: 0 });
    }));
    const cv = await page.locator("#viewer canvas").boundingBox();
    const at = async (x, y) => { const [sx, sy] = await evalApp(([x, y]) => window.__werkcad.sketcher.S(x, y), [x, y]); return [cv.x + sx, cv.y + sy]; };
    const selectOrig = () => evalApp(() => { const s = window.__werkcad.sketcher; s.sel.clear(); s.sel.add("e:mk"); window.__werkcad.selectSketchItems(["e:mk"]); });
    await selectOrig();
    await rbClick("Rechteckmuster");
    let [cx, cy] = await at(0, 60);
    await page.mouse.click(cx, cy);
    // der Dialog setzt den Fokus 20 ms nach dem Öffnen auf das erste Feld – erst danach tippen
    await page.waitForFunction(() => document.activeElement?.dataset?.k === "nx");
    await page.locator(".dialog input[data-k=nx]").fill("3");
    await page.locator(".dialog input[data-k=a]").fill("20");
    await page.locator(".dialog input[data-k=ny]").fill("2");
    await page.locator(".dialog input[data-k=b]").fill("15");
    await page.locator(".dialog footer .btn", { hasText: "Muster erzeugen" }).click();
    await page.waitForTimeout(300);
    const rect = await evalApp(() => window.__werkcad.sketcher.sk.entities.filter((e) => e.type === "circle").length);
    await selectOrig();
    await rbClick("Kreismuster");
    [cx, cy] = await at(0, 0);
    await page.mouse.click(cx, cy);
    // der Dialog setzt den Fokus 20 ms nach dem Öffnen auf das erste Feld – erst danach tippen
    await page.waitForFunction(() => document.activeElement?.dataset?.k === "n");
    await page.locator(".dialog input[data-k=n]").fill("4");
    await page.locator(".dialog footer .btn", { hasText: "Muster erzeugen" }).click();
    await page.waitForTimeout(300);
    const circ = await evalApp(() => {
      const s = window.__werkcad.sketcher, P = new Map(s.sk.points.map((p) => [p.id, p]));
      const cs = s.sk.entities.filter((e) => e.type === "circle").map((e) => P.get(e.c));
      return { n: cs.length, onTop: cs.some((p) => Math.abs(p.x) < 0.5 && Math.abs(p.y - 40) < 0.5), ok: s.solve().ok };
    });
    // Abstand X über die Eigenschaften einer Kopie ändern
    const copy = await evalApp(() => { const s = window.__werkcad.sketcher; const k = s.sk.constraints.find((c) => c.type === "pattern" && c.mode === "lin" && c.i === 2 && c.j === 0); const e = s.sk.entities.find((x) => x.c === k.q); s.sel.clear(); s.sel.add("e:" + e.id); window.__werkcad.selectSketchItems(["e:" + e.id]); return e.id; });
    await page.waitForTimeout(200);
    const fld = page.locator("#props .field", { hasText: "Abstand X" }).locator("input");
    await fld.fill("30");
    await fld.dispatchEvent("change");
    await page.waitForTimeout(300);
    const moved = await evalApp((id) => { const s = window.__werkcad.sketcher; const e = s.sk.entities.find((x) => x.id === id); const p = s.sk.points.find((q) => q.id === e.c); return { x: p.x, y: p.y }; }, copy);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    step("Skizze: Rechteck- und Kreismuster", rect === 6 && circ.n === 9 && circ.onTop && circ.ok && Math.abs(moved.x - 100) < 1e-6 && Math.abs(moved.y) < 1e-6, JSON.stringify({ rect, circ, moved }));
  }

  // Drehen mit der Maus um den Modellpunkt unter dem Mauszeiger (Einstellung abschaltbar)
  {
    await evalApp(() => window.__werkcad.openDoc("beispiel_rahmen"));
    await idle();
    await evalApp(() => { const v = window.__werkcad.viewer; v.setView("iso", { animate: false }); v.fit(); });
    await page.waitForTimeout(300);
    const vb = await page.locator("#viewer canvas").boundingBox();
    // Modellpunkt abseits der Bildmitte suchen
    const probe = await evalApp(([x0, y0, w, h]) => {
      const v = window.__werkcad.viewer;
      for (const fx of [0.3, 0.7, 0.35, 0.65, 0.4, 0.6]) for (const fy of [0.35, 0.65, 0.45, 0.55]) {
        const cx = x0 + w * fx, cy = y0 + h * fy;
        const hit = v.pick(cx, cy, { edges: false, faces: true });
        if (hit) return { cx, cy, p: hit.point };
      }
      return null;
    }, [vb.x, vb.y, vb.width, vb.height]);
    const rdrag = async () => {
      await page.mouse.move(probe.cx, probe.cy);
      await page.mouse.down({ button: "right" });
      await page.mouse.move(probe.cx + 60, probe.cy + 25, { steps: 6 });
      await page.mouse.up({ button: "right" });
      await page.waitForTimeout(150);
      return evalApp(([p, x0, y0]) => { const v = window.__werkcad.viewer; const s = v.worldToScreen(p); return { sx: s[0] + x0, sy: s[1] + y0, dir: v.viewState().dir }; }, [probe.p, vb.x, vb.y]);
    };
    const before = await evalApp(() => window.__werkcad.viewer.viewState().dir);
    const piv = await rdrag();
    await page.keyboard.press("Escape");
    await evalApp(() => { const a = window.__werkcad; a.prefs.set("ansicht.drehpunktCursor", false); a.viewer.setView("iso", { animate: false }); a.viewer.fit(); });
    await page.waitForTimeout(200);
    const ctr = await rdrag();
    await page.keyboard.press("Escape");
    await evalApp(() => { const a = window.__werkcad; a.prefs.set("ansicht.drehpunktCursor", true); });
    const dPiv = probe && Math.hypot(piv.sx - probe.cx, piv.sy - probe.cy), dCtr = probe && Math.hypot(ctr.sx - probe.cx, ctr.sy - probe.cy);
    const turned = Math.hypot(...piv.dir.map((x, i) => x - before[i])) > 0.05;
    step("Drehen um den Punkt unter dem Mauszeiger", !!probe && dPiv < 2 && turned && dCtr > 10, JSON.stringify({ probe, dPiv, dCtr, turned }));
  }

  // 3D-Fensterauswahl (Auswahlfilter), Alles auswählen, Auswahl umkehren
  {
    await evalApp(() => window.__werkcad.openDoc("beispiel_rahmen"));
    await idle();
    await evalApp(() => { const a = window.__werkcad; a.setSelFilter("flaechen"); a.viewer.setView("front", { animate: false }); a.viewer.fit(); });
    await page.waitForTimeout(300);
    const vb = await page.locator("#viewer canvas").boundingBox();
    const total = await evalApp(() => window.__werkcad.viewer.boxHits({ edges: false, faces: true }).length);
    const drag = async (x0, y0, x1, y1) => { await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(150); return evalApp(() => window.__werkcad.selHits.length); };
    const win = await drag(vb.x + 2, vb.y + 2, vb.x + vb.width - 2, vb.y + vb.height - 2);
    const cross = await drag(vb.x + vb.width / 2 + 20, vb.y + vb.height / 2 + 20, vb.x + vb.width / 2 - 20, vb.y + vb.height / 2 - 20);
    const small = await drag(vb.x + vb.width / 2 - 20, vb.y + vb.height / 2 - 20, vb.x + vb.width / 2 + 20, vb.y + vb.height / 2 + 20);
    await page.mouse.click(vb.x + 10, vb.y + vb.height - 10);
    await page.keyboard.press("Control+a");
    const all = await evalApp(() => window.__werkcad.selHits.length);
    await page.keyboard.press("Control+i");
    const inv = await evalApp(() => window.__werkcad.selHits.length);
    await evalApp(() => window.__werkcad.setSelFilter("kanten"));
    await page.keyboard.press("Control+a");
    const edges = await evalApp(() => ({ n: window.__werkcad.selHits.length, onlyEdges: window.__werkcad.selHits.every((x) => x.kind === "edge") }));
    await evalApp(() => { const a = window.__werkcad; a.setSelFilter("alles"); a.setSelection([]); });
    step("3D-Fensterauswahl, Alles auswählen, Umkehren", total > 6 && win === total && cross > 0 && cross < total && small <= cross && all === total && inv === 0 && edges.n > 0 && edges.onlyEdges,
      JSON.stringify({ total, win, cross, small, all, inv, edges }));
  }

  // Skizze: automatische Bedingungen beim Zeichnen (senkrecht zum Vorgänger, Strg unterdrückt)
  {
    await evalApp(() => window.__werkcad.newPart("Auto"));
    await idle();
    await page.keyboard.press("s");
    await page.waitForTimeout(200);
    await page.locator("#props button", { hasText: "XY-Ebene" }).click();
    await page.waitForTimeout(800);
    const cv = await page.locator("#viewer canvas").boundingBox();
    const at = async (x, y) => { const [sx, sy] = await evalApp(([x, y]) => window.__werkcad.sketcher.S(x, y), [x, y]); return [cv.x + sx, cv.y + sy]; };
    await evalApp(() => window.__werkcad.sketcher.setTool("line"));
    const c30 = Math.cos(Math.PI / 6), s30 = Math.sin(Math.PI / 6);
    // Maßstab: 40 mm Linie unter 30°, dann fast senkrecht weiter (Abweichung ~1°)
    for (const [x, y] of [[0, 0], [40 * c30, 40 * s30], [40 * c30 - 25 * Math.sin(31 * Math.PI / 180), 40 * s30 + 25 * Math.cos(31 * Math.PI / 180)]]) {
      const [px, py] = await at(x, y);
      await page.mouse.move(px, py, { steps: 3 });
      await page.mouse.click(px, py);
      await page.waitForTimeout(80);
    }
    await page.keyboard.press("Escape");
    const auto1 = await evalApp(() => { const s = window.__werkcad.sketcher; return { types: s.sk.constraints.map((c) => c.type), ok: s.solve().ok }; });
    // gleiche Bewegung mit Strg: keine automatische Bedingung
    await evalApp(() => window.__werkcad.sketcher.commit("leeren", (sk) => { sk.entities = sk.entities.filter((e) => e.origin); sk.points = sk.points.filter((p) => sk.entities.some((e) => [e.p, e.p1, e.p2, e.c].includes(p.id))); sk.constraints = sk.constraints.filter((c) => c.id === "Of"); }));
    await evalApp(() => window.__werkcad.sketcher.setTool("line"));
    await page.keyboard.down("Control");
    for (const [x, y] of [[0, 0], [40 * c30, 40 * s30 + 0.4]]) {
      const [px, py] = await at(x, y);
      await page.mouse.move(px, py, { steps: 3 });
      await page.mouse.click(px, py);
      await page.waitForTimeout(80);
    }
    await page.keyboard.up("Control");
    await page.keyboard.press("Escape");
    const auto2 = await evalApp(() => window.__werkcad.sketcher.sk.constraints.filter((c) => ["horizontal", "vertical", "parallel", "perpendicular", "equal"].includes(c.type)).length);
    await page.keyboard.press("Escape");
    step("Skizze: automatische Bedingungen", auto1.types.includes("perpendicular") && auto1.ok && auto2 === 0, JSON.stringify({ auto1, auto2 }));
  }

  // Schnellzugriff: Befehl in der Befehlssuche anheften, Knopf erscheint und läuft; Standardwert Polygon-Ecken
  {
    await evalApp(() => window.__werkcad.openDoc("beispiel_rahmen"));
    await idle();
    await evalApp(() => window.__werkcad.commands.exec("app.search"));
    await page.locator(".cmd-palette input").fill("Ansicht Oben");
    await page.locator(".cmd-item").first().locator(".cmd-pin").click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    const qaBtn = page.locator("#ribbon .rb-qa-btn[data-cmd='view.top']");
    const shown = await qaBtn.count();
    await evalApp(() => window.__werkcad.viewer.setView("iso", { animate: false }));
    await qaBtn.click();
    await page.waitForTimeout(700);
    const dir = await evalApp(() => window.__werkcad.viewer.viewState().dir);
    const stored = await evalApp(() => { try { return JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.includes("einstellungen")) || "") || "{}").values?.["werkzeuge.schnellzugriff"]; } catch { return null; } });
    // Standardwert Polygon-Ecken aus den Einstellungen
    await evalApp(() => { const a = window.__werkcad; a.prefs.set("werkzeuge.std.polygon", 8); a.prefs.reset(["werkzeuge.letzte"]); }); // zuletzt eingegebener Wert hätte Vorrang
    await evalApp(() => window.__werkcad.newPart("Std"));
    await idle();
    await page.keyboard.press("s");
    await page.waitForTimeout(200);
    await page.locator("#props button", { hasText: "XY-Ebene" }).click();
    await page.waitForTimeout(800);
    await evalApp(() => window.__werkcad.sketcher.setTool("polygon"));
    const cv = await page.locator("#viewer canvas").boundingBox();
    await page.mouse.click(cv.x + cv.width / 2, cv.y + cv.height / 2);
    const polyDefault = await evalApp(() => String(window.__werkcad.sketcher.polygonN())); // Vorgabe der Eckenzahl in der Maßeingabe
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await evalApp(() => { const p = window.__werkcad.prefs; p.set("werkzeuge.std.polygon", 6); p.set("werkzeuge.schnellzugriff", []); });
    step("Schnellzugriff und Werkzeug-Standardwerte", shown === 1 && Math.abs(Math.abs(dir[2]) - 1) < 1e-6 && Array.isArray(stored) && stored.includes("view.top") && polyDefault === "8",
      JSON.stringify({ shown, dir, stored, polyDefault }));
  }

  // Skizze: Bestimmtheit farbig (freie Elemente hellblau, bestimmte dunkel)
  {
    await evalApp(() => window.__werkcad.newPart("Bestimmt"));
    await idle();
    await page.keyboard.press("s");
    await page.waitForTimeout(200);
    await page.locator("#props button", { hasText: "XY-Ebene" }).click();
    await page.waitForTimeout(800);
    await evalApp(() => window.__werkcad.sketcher.commit("Testgeometrie", (sk) => {
      sk.points.push({ id: "ba", x: 0, y: 0 }, { id: "bb", x: 40, y: 0 }, { id: "bz", x: 0, y: 40 }, { id: "by", x: 30, y: 50 });
      sk.entities.push({ id: "bl", type: "line", p1: "ba", p2: "bb" }, { id: "bf", type: "line", p1: "bz", p2: "by" });
      sk.constraints.push({ id: "bfx", type: "fix", p: "ba", x: 0, y: 0 }, { id: "bh", type: "horizontal", e: "bl" }, { id: "bw", type: "length", e: "bl", value: "40" });
    }));
    await page.waitForTimeout(200);
    const cls = await evalApp(() => ({ free: document.querySelectorAll("#overlay .sk-line.free").length, full: document.querySelectorAll("#overlay .sk-line.full").length, hud: document.querySelector(".hud-free")?.textContent || "" }));
    await page.keyboard.press("Escape");
    step("Skizze: Bestimmtheit farbig", cls.free === 1 && cls.full >= 1 && /1 Element/.test(cls.hud), JSON.stringify(cls));
  }

  // Schnitt mit gefüllten Schnittflächen: Rohre des Rahmens in Y-Mitte längs geschnitten, Ecke nah, Wandschnitte geschlossen
  {
    await evalApp(() => window.__werkcad.openDoc("beispiel_rahmen"));
    await idle();
    const sc = await evalApp(() => {
      const a = window.__werkcad, vw = a.viewer;
      a.toggleClip("Y");
      vw.setViewDir([0.5, -1, -0.6], [0, 0, 1], { animate: false });
      const b = vw.contentBox(); b.max.x = b.min.x + 120; b.min.z = b.max.z - 120; vw.fit(b);
      const gl = vw.renderer.getContext();
      const grab = () => {
        vw.renderer.clear(); // autoClear ist aus
        vw.renderer.render(vw.scene, vw.camera);
        const w = gl.drawingBufferWidth, hh = gl.drawingBufferHeight, px = new Uint8Array(w * hh * 4);
        gl.readPixels(0, 0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return px;
      };
      const caps = vw.capGroup.children.length, bodies = vw.pickables.filter((p) => p.mesh.visible).length;
      const filled = grab();
      a.prefs.set("ansicht.schnittFuellen", false);
      const capsOff = vw.capGroup.children.length;
      const hollow = grab();
      a.prefs.reset(["ansicht.schnittFuellen"]);
      let diff = 0, covered = 0, coveredHollow = 0;
      for (let i = 0; i < filled.length; i += 4) {
        if (Math.abs(filled[i] - hollow[i]) + Math.abs(filled[i + 1] - hollow[i + 1]) + Math.abs(filled[i + 2] - hollow[i + 2]) > 30) diff++;
        if (filled[i + 3] > 0) covered++;
        if (hollow[i + 3] > 0) coveredHollow++;
      }
      const capsAgain = vw.capGroup.children.length;
      return { caps, bodies, capsOff, capsAgain, diff, covered, coveredHollow };
    });
    await shot("22b-schnitt-gefuellt");
    sc.capsAfter = await evalApp(() => { const a = window.__werkcad; a.toggleClip("Y"); return a.viewer.capGroup.children.length; });
    step("Schnitt: Schnittflächen gefüllt", sc.caps > 0 && sc.caps === sc.bodies && sc.capsOff === 0 && sc.capsAgain === sc.caps && sc.diff > 50 && sc.covered >= sc.coveredHollow && sc.capsAfter === 0, JSON.stringify(sc));
  }

  // Skizze: Ellipse mit drei Klicks zeichnen, Halbachsen bemaßen, extrudieren
  {
    await evalApp(() => window.__werkcad.newPart("Ellipse"));
    await idle();
    await page.keyboard.press("s");
    await page.waitForTimeout(200);
    await page.locator("#props button", { hasText: "XY-Ebene" }).click();
    await page.waitForTimeout(800);
    const cv = await page.locator("#viewer canvas").boundingBox();
    const at = async (x, y) => { const [sx, sy] = await evalApp(([x, y]) => window.__werkcad.sketcher.S(x, y), [x, y]); return [cv.x + sx, cv.y + sy]; };
    await evalApp(() => { window.__werkcad.sketcher.gridSnap = false; });
    await rbClick("Ellipse");
    for (const [x, y] of [[40, 30], [70, 30], [50, 50]]) { const [px, py] = await at(x, y); await page.mouse.click(px, py); await page.waitForTimeout(120); }
    const el = await evalApp(() => {
      const s = window.__werkcad.sketcher, e = s.sk.entities.find((q) => q.type === "ellipse");
      return e ? { id: e.id, r: e.r, regions: s.profiles?.regions.length } : null;
    });
    await page.keyboard.press("Escape");
    // Auswahl → Eigenschaften: Halbachsen bemaßen
    await evalApp((id) => { const s = window.__werkcad.sketcher; s.sel = new Set(["e:" + id]); window.__werkcad.selectSketchItems([...s.sel]); }, el?.id);
    await page.waitForTimeout(200);
    for (const t of ["a bemaßen", "b bemaßen", "Winkel bemaßen"]) { await page.locator("#props button", { hasText: t }).click(); await page.waitForTimeout(120); }
    const dims = await evalApp(() => window.__werkcad.sketcher.sk.constraints.filter((c) => c.type === "semiAxis" || c.type === "axisAngle").map((c) => c.type + (c.axis || "") + "=" + c.value));
    await shot("26b-ellipse");
    await page.locator("#ribbon button", { hasText: "Skizze fertig" }).click();
    await page.waitForTimeout(300);
    await page.locator("#ribbon button", { hasText: "Extrusion" }).first().click();
    await idle();
    const ex = await evalApp(() => { const a = window.__werkcad; const b = a.results.get(a.activeId)?.bodies[0]; return b ? { vol: b.props.volume, h: b.props.bbox[1][2] - b.props.bbox[0][2] } : null; });
    const want = ex ? Math.PI * 30 * (el?.r || 0) * ex.h : 0;
    step("Skizze: Ellipse zeichnen und extrudieren", !!el && Math.abs(el.r - 20) < 0.5 && el.regions === 1 && dims.length === 3 && ex && Math.abs(ex.vol / want - 1) < 2e-3,
      JSON.stringify({ el, dims, ex }));
  }

  // Skizze: geschlossenen Spline klicken, Punkt einfügen, extrudieren
  {
    await evalApp(() => window.__werkcad.newPart("Spline"));
    await idle();
    await page.keyboard.press("s");
    await page.waitForTimeout(200);
    await page.locator("#props button", { hasText: "XY-Ebene" }).click();
    await page.waitForTimeout(800);
    const cv = await page.locator("#viewer canvas").boundingBox();
    const at = async (x, y) => { const [sx, sy] = await evalApp(([x, y]) => window.__werkcad.sketcher.S(x, y), [x, y]); return [cv.x + sx, cv.y + sy]; };
    await rbClick("Spline");
    for (const [x, y] of [[20, 10], [70, 0], [80, 50], [30, 60], [20, 10]]) { const [px, py] = await at(x, y); await page.mouse.click(px, py); await page.waitForTimeout(120); }
    const sp = await evalApp(() => {
      const s = window.__werkcad.sketcher, e = s.sk.entities.find((q) => q.type === "spline");
      return e ? { id: e.id, n: e.pts.length, closed: e.p1 === e.p2, regions: s.profiles?.regions.length, area: s.profiles?.regions[0]?.area } : null;
    });
    await page.keyboard.press("Escape");
    await evalApp((id) => { const s = window.__werkcad.sketcher; s.sel = new Set(["e:" + id]); window.__werkcad.selectSketchItems([...s.sel]); }, sp?.id);
    await page.waitForTimeout(200);
    await page.locator("#props button", { hasText: "Punkt einfügen" }).click();
    await page.waitForTimeout(200);
    const n2 = await evalApp(() => window.__werkcad.sketcher.sk.entities.find((q) => q.type === "spline").pts.length);
    await shot("26d-spline");
    await page.locator("#ribbon button", { hasText: "Skizze fertig" }).click();
    await page.waitForTimeout(300);
    await page.locator("#ribbon button", { hasText: "Extrusion" }).first().click();
    await idle();
    const ex = await evalApp(() => { const a = window.__werkcad; const b = a.results.get(a.activeId)?.bodies[0]; return b ? { vol: b.props.volume, h: b.props.bbox[1][2] - b.props.bbox[0][2] } : null; });
    step("Skizze: Spline zeichnen und extrudieren", !!sp && sp.n === 5 && sp.closed && sp.regions === 1 && n2 === 6 && ex && ex.vol > 0.5 * sp.area * ex.h && ex.vol < 1.5 * sp.area * ex.h,
      JSON.stringify({ sp, n2, ex }));
  }

  // Skizze vollständig bemaßen: Rechteck mit Bohrung, ein Klick, voll bestimmt, Rückgängig nimmt alles zurück
  {
    await evalApp(() => window.__werkcad.newPart("Autobemassung"));
    await idle();
    await page.keyboard.press("s");
    await page.waitForTimeout(200);
    await page.locator("#props button", { hasText: "XY-Ebene" }).click();
    await page.waitForTimeout(800);
    await evalApp(() => window.__werkcad.sketcher.commit("Testgeometrie", (sk) => {
      sk.points.push({ id: "ra", x: 10, y: 5 }, { id: "rb", x: 90, y: 5 }, { id: "rc", x: 90, y: 45 }, { id: "rd", x: 10, y: 45 }, { id: "rm", x: 30, y: 25 });
      sk.entities.push({ id: "r1", type: "line", p1: "ra", p2: "rb" }, { id: "r2", type: "line", p1: "rb", p2: "rc" }, { id: "r3", type: "line", p1: "rc", p2: "rd" }, { id: "r4", type: "line", p1: "rd", p2: "ra" }, { id: "rk", type: "circle", c: "rm", r: 6 });
      sk.constraints.push({ id: "rh1", type: "horizontal", e: "r1" }, { id: "rh3", type: "horizontal", e: "r3" }, { id: "rv2", type: "vertical", e: "r2" }, { id: "rv4", type: "vertical", e: "r4" });
    }));
    await page.waitForTimeout(200);
    const n0 = await evalApp(() => window.__werkcad.sketcher.sk.constraints.length);
    await rbClick("Voll bemaßen");
    await page.waitForTimeout(300);
    const hint = await page.locator(".dialog .hint").last().textContent();
    await page.locator(".dialog button", { hasText: /^Bemaßen$/ }).click();
    await page.waitForTimeout(300);
    const after = await evalApp(() => { const s = window.__werkcad.sketcher; const r = s.solve(); return { n: s.sk.constraints.length, dof: r.dof, ok: r.ok }; });
    await shot("26e-voll-bemasst");
    await evalApp(() => window.__werkcad.undo());
    await page.waitForTimeout(300);
    const undone = await evalApp(() => window.__werkcad.sketcher.sk.constraints.length);
    await page.keyboard.press("Escape");
    step("Skizze vollständig bemaßen", after.ok && after.dof === 0 && after.n - n0 === 7 && undone === n0 && /7 Maß/.test(hint), JSON.stringify({ n0, hint, after, undone }));
  }

  // Eigene Werkstoffe: Cortenstahl 7,87 anlegen, dem Rahmen zuweisen, Masse und Zuschnittliste rechnen damit
  {
    await evalApp(() => window.__werkcad.openDoc("beispiel_rahmen"));
    await idle();
    const before = await evalApp(() => { const a = window.__werkcad, d = a.activeDoc(); return { mat: d.material, mass: document.querySelector("#status")?.textContent.match(/Masse ([\d.,]+)/)?.[1] }; });
    await page.locator("#ribbon .rb-file").click();
    await page.locator(".file-menu button", { hasText: "Einstellungen" }).click();
    await page.locator(".set-cat", { hasText: "Materialien" }).click();
    await page.locator(".mat-editor button", { hasText: "Werkstoff anlegen" }).click();
    const form = page.locator(".dialog .mat-form");
    await form.locator('input[aria-label="Name"]').fill("Cortenstahl");
    await form.locator('input[aria-label="Kürzel"]').fill("CORTEN");
    await form.locator('input[aria-label="Dichte"]').fill("0");
    await page.locator(".dialog footer .btn", { hasText: "Übernehmen" }).click();
    const err = await form.locator(".set-err").textContent();
    await form.locator('input[aria-label="Dichte"]').fill("7,87");
    await page.locator(".dialog footer .btn", { hasText: "Übernehmen" }).click();
    await page.locator('.mat-editor tr[data-key="CORTEN"]').waitFor();
    await shot("26g-werkstoffe");
    await page.locator(".dialog footer .btn", { hasText: "Schließen" }).click();
    const sel = page.locator("#props .field", { hasText: "Werkstoff" }).locator("select");
    await sel.selectOption("CORTEN");
    await idle();
    await page.waitForTimeout(300);
    const after = await evalApp(() => {
      const a = window.__werkcad, d = a.activeDoc();
      const cut = [...document.querySelectorAll("#props table.grid tbody tr")].map((r) => r.textContent);
      a.embedMaterials();
      return { mat: d.material, dens: [...document.querySelectorAll("#props dl.kv dd")].map((x) => x.textContent).find((t) => /g\/cm³/.test(t)), mass: document.querySelector("#status")?.textContent.match(/Masse ([\d.,]+)/)?.[1], embedded: a.project.materials, groups: [...document.querySelectorAll("#props select optgroup")].map((g) => g.label), cut: cut.length };
    });
    // Löschen gesperrt, solange benutzt
    await page.locator("#ribbon .rb-file").click();
    await page.locator(".file-menu button", { hasText: "Einstellungen" }).click();
    await page.locator(".set-cat", { hasText: "Materialien" }).click();
    const delDisabled = await page.locator('.mat-editor tr[data-key="CORTEN"] button', { hasText: "Löschen" }).isDisabled();
    await page.locator(".dialog footer .btn", { hasText: "Schließen" }).click();
    await evalApp(() => { const a = window.__werkcad; a.undo(); delete a.project.materials; a.prefs.reset(["material.eigene"]); });
    await idle();
    const num = (t) => Number(String(t).replace(/\./g, "").replace(",", "."));
    step("Eigene Werkstoffe", /Dichte/.test(err) && after.mat === "CORTEN" && /7,87/.test(after.dens) && Math.abs(num(after.mass) / num(before.mass) - 7.87 / 7.85) < 0.002 &&
      after.embedded?.[0]?.key === "CORTEN" && after.groups.join() === "Eingebaut,Eigene" && delDisabled,
      JSON.stringify({ err, before, after, delDisabled }));
  }

  // Panels: Eigenschaften nach links andocken, Breite am Rand ziehen, gespeichert, zurücksetzen
  {
    await evalApp(() => window.__werkcad.openDoc("beispiel_platte"));
    await idle();
    await page.locator("#ribbon .rb-tab", { hasText: "Ansicht" }).click();
    await rbClick("Eigenschaften links");
    await page.waitForTimeout(200);
    const docked = await evalApp(() => ({ parent: document.getElementById("props").parentElement.className, right: document.querySelector(".dock-right").getBoundingClientRect().width, cols: document.getElementById("workspace").style.gridTemplateColumns }));
    const grip = await page.locator(".dock-left .dock-grip").boundingBox();
    await page.mouse.move(grip.x + 2, grip.y + 200);
    await page.mouse.down();
    await page.mouse.move(grip.x + 50, grip.y + 200, { steps: 4 });
    await page.mouse.move(grip.x + 82, grip.y + 200, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const widened = await evalApp(() => ({ w: document.querySelector(".dock-left").getBoundingClientRect().width, saved: JSON.parse(window.__werkcad.prefs.exportText()).values["oberflaeche.layout"], canvas: document.querySelector("#viewer canvas").getBoundingClientRect().width }));
    await shot("26f-panels-links");
    await rbClick("Anordnung zurücksetzen");
    await page.waitForTimeout(200);
    const reset = await evalApp(() => ({ parent: document.getElementById("props").parentElement.className, cols: document.getElementById("workspace").style.gridTemplateColumns }));
    await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
    step("Panels andocken und Breite ziehen", /dock-left/.test(docked.parent) && docked.right <= 1 && Math.abs(widened.w - 340) < 3 && Math.abs((widened.saved?.wLeft || 0) - 340) < 3 && widened.saved?.props === "left" &&
      /dock-right/.test(reset.parent) && reset.cols === "260px minmax(0px, 1fr) 300px", JSON.stringify({ docked, widened, reset }));
  }

  // Menüband anordnen (Werkzeuge Stufe 25): Gruppe per Rechtsklick ausblenden und verschieben, im Center wieder einblenden
  {
    await page.locator("#ribbon .rb-tab", { hasText: "Metallbau" }).click();
    const groupsNow = () => evalApp(() => [...document.querySelectorAll("#ribbon .rb-group")].map((g) => g.dataset.group));
    const g0 = await groupsNow();
    await page.locator('#ribbon .rb-group[data-group="Anschluss"]').click({ button: "right" });
    await page.locator(".menu button", { hasText: "»Anschluss« ausblenden" }).click();
    await page.waitForTimeout(150);
    const g1 = await groupsNow();
    const plus = await page.locator("#ribbon .rb-hidden").textContent();
    await page.locator('#ribbon .rb-group[data-group="Blech"]').click({ button: "right" });
    await page.locator(".menu button", { hasText: "Nach links" }).click();
    await page.waitForTimeout(150);
    const g2 = await groupsNow();
    const saved = await evalApp(() => window.__werkcad.prefs.get("werkzeuge.menueband"));
    await shot("26e-menueband-angeordnet");
    await evalApp(() => window.__werkcad.props.settingsDialog({ category: "werkzeuge" }));
    await page.waitForTimeout(300);
    const box = page.locator(".dialog .rb-editor");
    await box.locator('select[aria-label="Registerkarte"]').selectOption("metallbau");
    const unchecked = !(await box.locator('li[data-group="Anschluss"] input[type=checkbox]').isChecked());
    await box.locator('li[data-group="Anschluss"] input[type=checkbox]').check();
    await page.waitForTimeout(100);
    const shown = await evalApp(() => window.__werkcad.prefs.get("werkzeuge.menueband").metallbau?.hide || []);
    await box.locator("button", { hasText: "Alles zurücksetzen" }).click();
    await page.waitForTimeout(100);
    const cleared = await evalApp(() => window.__werkcad.prefs.get("werkzeuge.menueband"));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    const g3 = await groupsNow();
    const iP = (g) => g.indexOf("Blech");
    step("Menüband anordnen", g0.includes("Anschluss") && !g1.includes("Anschluss") && g1.length === g0.length - 1 && plus === "+1" &&
      iP(g2) === iP(g0) - 1 && saved?.metallbau?.hide?.includes("Anschluss") && unchecked && shown.length === 0 && Object.keys(cleared || {}).length === 0 && g3.join() === g0.join(),
      JSON.stringify({ g1: g1.length, plus, g2, saved, unchecked, shown, cleared, same: g3.join() === g0.join() }));
  }

  // Menüband aufgeräumt (Inventor-Vorbild): Bauteil und Baugruppe passen ohne Scrollen in 1600 px, Hauptbefehle groß, Rest klein
  {
    const fit = async () => evalApp(() => { const p = document.querySelector("#ribbon .rb-panel"); return { over: p.scrollWidth - p.clientWidth, big: p.querySelectorAll(".rb-btn").length, small: p.querySelectorAll(".rb-small").length }; });
    const tab = async (t) => { await page.locator("#ribbon .rb-tab", { hasText: t }).click(); return fit(); };
    const fPart = await tab("3D-Modell"), fPartM = await tab("Metallbau");
    await shot("26e2-menueband-metallbau");
    await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
    await shot("26e1-menueband-bauteil");
    await evalApp(() => window.__werkcad.newAssembly());
    await idle();
    const fAsm = await tab("Zusammenfügen");
    await shot("26e3-menueband-baugruppe");
    const fAsmM = await tab("Metallbau");
    await shot("26e4-menueband-baugruppe-metallbau");
    const all = [fPart, fPartM, fAsm, fAsmM];
    step("Menüband aufgeräumt", all.every((f) => f.over <= 0) && fPart.small >= 8 && fAsm.small >= 8, JSON.stringify({ fPart, fPartM, fAsm, fAsmM }));
  }

  // Dokument-Vorgaben (Werkzeuge Stufe 26): Namensregel, Sachnummer, Standardwerkstoff, Inhalt neuer Projekte
  {
    await evalApp(() => window.__werkcad.props.settingsDialog({ category: "dokument" }));
    await page.waitForTimeout(300);
    const row = page.locator('.dialog .set-row[data-key="dokument.name.bauteil"]');
    await row.locator("input").fill("Teil {x}");
    await row.locator("input").press("Tab");
    const err = (await row.locator(".set-err").textContent()) || "";
    await row.locator("input").fill("{projekt}-{n:2}");
    await row.locator("input").press("Tab");
    await page.locator('.dialog .set-row[data-key="dokument.werkstoff"] select').selectOption("S355");
    const nr = page.locator('.dialog .set-row[data-key="dokument.nummer"] input');
    await nr.fill("BT-{n:3}");
    await nr.press("Tab");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    const made = await evalApp(() => {
      const app = window.__werkcad;
      window.__savedPrj = { prj: JSON.parse(JSON.stringify(app.project)), path: app.filePath };
      app.setProject({ ...JSON.parse(JSON.stringify(app.project)), docs: [] });
      const prj = app.project.name;
      const a = app.newPart(), b = app.newPart();
      const d = app.newDrawing({ kind: "part", id: b.id });
      return { prj, a: [a.name, a.number, a.material], b: [b.name, b.number], d: d.name };
    });
    const content = await evalApp(() => {
      const app = window.__werkcad;
      app.prefs.set("dokument.neuesProjekt", "baugruppe");
      app.setProject({ ...app.project, docs: [] });
      app.startContent(app.prefs.get("dokument.neuesProjekt"));
      const kinds = app.project.docs.map((x) => x.kind).join();
      const asm = app.project.docs.find((x) => x.kind === "assembly");
      return { kinds, comp: asm?.components.length, linked: asm?.components[0]?.part === app.project.docs.find((x) => x.kind === "part")?.id };
    });
    await evalApp(() => { const app = window.__werkcad; app.prefs.reset(["dokument.name.bauteil", "dokument.werkstoff", "dokument.nummer", "dokument.neuesProjekt"]); app.setProject(window.__savedPrj.prj, window.__savedPrj.path); });
    await idle();
    const p = made.prj;
    step("Dokument-Vorgaben", /Unbekannter Platzhalter/.test(err) && made.a[0] === `${p}-01` && made.a[1] === "BT-001" && made.a[2] === "S355" && made.b[0] === `${p}-02` && made.b[1] === "BT-002" &&
      made.d === `Zeichnung ${p}-02` && content.kinds === "assembly,part" && content.comp === 1 && content.linked, JSON.stringify({ err, made, content }));
  }

  // Dateien (Werkzeuge Stufe 27): schreibgeschützt im Titel, Speichern erzwingt »unter«, Projekt paketieren löst Verknüpfungen
  {
    const ro = await evalApp(() => {
      const app = window.__werkcad;
      app.readOnly = true;
      app.updateTitle();
      const title = document.title;
      app.readOnly = false;
      app.updateTitle();
      return { title, after: document.title };
    });
    const dlWait = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    const pk = await evalApp(async () => {
      const app = window.__werkcad;
      const p = app.parts()[0];
      p.link = { path: "C:/Teile/X.wcad", rel: "X.wcad", docId: "x", time: 1 };
      const r = await app.files.packageProject();
      const still = !!p.link;
      delete p.link;
      return { name: r?.path, packed: r?.packed, still };
    });
    const dl = await dlWait;
    const packedText = dl ? fs.readFileSync(await dl.path(), "utf8") : "";
    const menu = await (async () => { await page.locator("#ribbon .rb-file").click(); const t = await page.locator(".file-menu").textContent(); await page.locator(".file-menu button", { hasText: "Projekt paketieren" }).count() && await evalApp(() => document.querySelector(".file-menu")?.remove()); return t; })();
    step("Schreibgeschützt und paketieren", /\[schreibgeschützt\]/.test(ro.title) && !/schreibgeschützt/.test(ro.after) && pk.packed?.length === 1 && pk.still && !!dl && !packedText.includes("C:/Teile/X.wcad") && /Projekt paketieren/.test(menu),
      JSON.stringify({ ro, pk, dl: dl?.suggestedFilename(), menu: /paketieren/.test(menu) }));
  }

  // Versionen mit Notiz (FU6) und Komponente ersetzen (FU7)
  {
    await evalApp(() => { const a = window.__werkcad; a.dirty = false; for (const k of Object.keys(localStorage)) if (k.startsWith("pbcad.versionen.")) localStorage.removeItem(k); return a.openExample(); });
    await idle(120000);
    const saveVer = async (note) => {
      await evalApp(() => { window.__werkcad.commands.exec("file.versionSave"); });
      await page.locator(".version-note textarea").fill(note);
      await page.locator(".dialog footer .btn.primary").click();
      await page.waitForTimeout(300);
    };
    await saveVer("Angebot");
    const mat0 = await evalApp(() => { const a = window.__werkcad, p = a.doc("beispiel_platte"); const m = p.material; a.edit("Werkstoff", () => { p.material = "S355JR"; }, { rebuild: false }); return m; });
    await saveVer("Platte S355");
    await evalApp(() => { window.__werkcad.commands.exec("file.versions"); });
    await page.waitForSelector(".versions tbody tr");
    const list = await evalApp(() => [...document.querySelectorAll(".versions tbody tr")].map((r) => r.textContent));
    await page.locator(".versions tbody tr").last().locator("button", { hasText: "Wiederherstellen" }).click();
    await page.locator(".dialog footer .btn.primary", { hasText: "Wiederherstellen" }).click();
    await page.waitForTimeout(800);
    await idle();
    const ver = await evalApp(async () => {
      const a = window.__werkcad;
      const key = Object.keys(localStorage).find((k) => k.startsWith("pbcad.versionen.") && !/:\d+$/.test(k));
      const idx = JSON.parse(localStorage.getItem(key) || "[]");
      return { mat: a.doc("beispiel_platte").material, dirty: a.dirty, n: idx.length, auto: idx[0]?.note, changes: idx[1]?.changes, title: document.title, dlg: !!document.querySelector(".versions") };
    });
    // Ersetzen: beide Grundplatten durch eine Kopie, Lage bleibt
    const rep = await evalApp(() => {
      const a = window.__werkcad;
      const src = a.doc("beispiel_platte");
      const copy = { ...JSON.parse(JSON.stringify(src)), id: "e2e_platte2", name: "Grundplatte 20" };
      a.edit("Kopie", () => a.project.docs.push(copy), { rebuild: false });
      a.openDoc("beispiel_bg");
      a.sel = { type: "component", id: "c2" };
      a.props.render();
      a.commands.exec("asm.replace");
      return true;
    });
    await page.locator(".dialog select").first().selectOption("e2e_platte2");
    await page.locator(".dialog select").nth(1).selectOption("all");
    await page.locator(".dialog footer .btn.primary", { hasText: "Ersetzen" }).click();
    await idle();
    const after = await evalApp(() => { const asm = window.__werkcad.doc("beispiel_bg"); return asm.components.map((c) => [c.id, c.part, c.name, c.pos.join(";")]); });
    const undo = await evalApp(() => { const a = window.__werkcad; a.undo(); return a.doc("beispiel_bg").components.find((c) => c.id === "c2").part; });
    step("Versionen mit Notiz, Komponente ersetzen", list.length === 2 && /Platte S355/.test(list[0]) && /Geändert: Grundplatte/.test(list[0]) && /Erste Version/.test(list[1])
      && ver.mat === mat0 && ver.dirty && ver.n === 3 && /Automatisch vor Wiederherstellen von V1/.test(ver.auto) && !ver.dlg
      && rep && after[1][1] === "e2e_platte2" && after[2][1] === "e2e_platte2" && after[0][1] === "beispiel_rahmen" && after[1][3] === "-150;-100;0" && after[1][2] === "Grundplatte links" && undo === "beispiel_platte",
      JSON.stringify({ list, ver, after, undo }));
  }

  // Fusion-Abgleich G3: Parameter als CSV (FU3), Bauteilende (FU5), Bauteilfarben (FU16), benannter Schnitt (FU18)
  {
    await evalApp(() => { const a = window.__werkcad; a.dirty = false; return a.openExample(); });
    await idle(120000);
    await evalApp(() => { const a = window.__werkcad; a.openDoc("beispiel_platte"); a.edit("Parameter", () => { a.activeDoc().params.push({ name: "L", expr: "200", comment: "Länge" }); }); });
    await idle();
    // Parameter: exportieren (Download) und eine CSV einlesen
    await evalApp(() => window.__werkcad.props.paramsDialog());
    const dlWait = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    await page.locator(".dialog button", { hasText: "Exportieren" }).click();
    const dl = await dlWait;
    const csvOut = dl ? fs.readFileSync(await dl.path(), "utf8") : "";
    // Datei direkt ins (versteckte) Dateifeld legen – unabhängig vom Auswahldialog des Browsers
    await page.locator(".dialog button", { hasText: "Importieren" }).click();
    await page.locator('body > input[type=file][accept*=".csv"]').last().setInputFiles({ name: "werte.csv", mimeType: "text/csv", buffer: Buffer.from("Name;Ausdruck;Kommentar\nL;250;\nB;L / 2;Breite\n", "utf8") });
    await page.waitForTimeout(400);
    await page.locator(".dialog footer .btn.primary", { hasText: "Übernehmen" }).click();
    await idle();
    const prm = await evalApp(() => window.__werkcad.activeDoc().params.filter((p) => p.name === "L" || p.name === "B").map((p) => [p.name, p.expr, p.comment || ""]));
    // Bauteilende: hinter das erste Feature ziehen (über das Kontextmenü), neues Feature landet dort
    const end = await evalApp(async () => {
      const a = window.__werkcad, d = a.activeDoc();
      const n = d.features.length, first = d.features[0].id;
      const v0 = a.results.get(d.id).bodies.length;
      a.setPartEnd(first);
      await new Promise((r) => setTimeout(r, 300));
      while (a.busy) await new Promise((r) => setTimeout(r, 100));
      const r1 = a.results.get(d.id);
      const rolled = Object.values(r1.status).filter((s) => s.rolledBack).length;
      d.features.forEach((f) => a.tree.expanded.add("kids:" + f.id)); // eingerückte Skizzen mitzählen
      a.tree.render();
      const greyed = document.querySelectorAll("#browser .node.suppressed").length;
      const marker = !!document.querySelector("#browser .node.part-end.rolled");
      const sk = a.createSketch({ ref: "XY" });
      a.finishSketch();
      const at = d.features.findIndex((f) => f.id === sk.id);
      const endAfter = d.endAfter;
      for (let k = 0; k < 5 && a.activeDoc().endAfter !== undefined; k++) a.undo();
      const dd = a.activeDoc();
      return { n, v0, rolled, greyed, marker, at, endAfter, skId: sk.id, restored: dd.endAfter === undefined && dd.features.length === n };
    });
    await idle();
    // Bauteilfarben in der Baugruppe
    const col = await evalApp(async () => {
      const a = window.__werkcad;
      a.openDoc("beispiel_bg");
      const colors = () => { const m = new Map(); a.viewer.root.traverse((o) => { if (o.isMesh && o.parent?.userData?.comp && o.material?.color) m.set(o.parent.userData.comp, o.material.color.getHexString()); }); return Object.fromEntries(m); };
      const t0 = Date.now();
      do await new Promise((r) => setTimeout(r, 200)); while ((a.busy || Object.keys(colors()).length < 4) && Date.now() - t0 < 30000);
      const before = colors();
      a.commands.exec("view.compColors");
      const on = colors();
      a.toggleCompColors();
      return { before, on, off: colors(), flag: !!a.compColors };
    });
    // Benannter Schnitt: Schnitt Z, Ansicht speichern, Schnitt aus, Ansicht wieder → Schnitt ist zurück
    await evalApp(() => window.__werkcad.toggleClip("Z"));
    const tab0 = await page.locator("#ribbon .rb-tab.active").textContent();
    await page.locator("#ribbon .rb-tab", { hasText: "Ansicht" }).click();
    await page.locator("#ribbon .rb-btn", { hasText: "Ansicht speichern" }).click();
    await page.locator(".dialog input").fill("Schnitt Mitte");
    await page.locator(".dialog footer .btn", { hasText: "Speichern" }).click();
    await page.waitForTimeout(200);
    await page.locator("#ribbon .rb-tab", { hasText: tab0 }).first().click();
    const cut = await evalApp(() => {
      const a = window.__werkcad;
      const saved = a.activeDoc().namedViews?.find((v) => v.name === "Schnitt Mitte")?.clip;
      a.toggleClip("Z");
      const off = !a.viewer.clip;
      a.showNamedView("Schnitt Mitte");
      const back = a.viewer.clip && { axis: a.viewer.clip.axis, offset: a.viewer.clip.offset };
      a.viewer.setClip(null); a.renderClipBar();
      return { saved, off, back };
    });
    // Bild in der Skizze (FU2): Werkzeug Bild, Datei, Breite; nur Anzeige, keine Kontur
    await evalApp(() => window.__werkcad.newPart("Vorlage"));
    await idle();
    await page.keyboard.press("s");
    await page.waitForTimeout(200);
    await page.locator("#props button", { hasText: "XY-Ebene" }).click();
    await page.waitForTimeout(800);
    const vb2 = await page.locator("#viewer canvas").boundingBox();
    await evalApp(() => window.__werkcad.sketcher.setTool("image"));
    await page.mouse.click(vb2.x + vb2.width / 2, vb2.y + vb2.height / 2);
    await page.locator('body > input[type=file][accept*=".png"]').last().setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGM4YWT038joxH8AEbsEV2vUBVIAAAAASUVORK5CYII=", "base64") });
    await page.locator(".image-dialog input[type=number]").first().fill("100");
    await page.locator(".dialog footer .btn.primary").click();
    await page.waitForTimeout(300);
    const img = await evalApp(() => {
      const a = window.__werkcad, s = a.sketcher, e = s.sk.entities.find((x) => x.type === "image");
      const out = { w: e?.w, h: e?.h, op: e?.opacity, stored: Object.keys(a.project.images || {}).length, svg: !!document.querySelector("#overlay image.sk-image"), regions: s.profiles.regions.length };
      a.finishSketch();
      const json = a.files.serialize();
      out.saved = (JSON.parse(json).images && Object.keys(JSON.parse(json).images).length) || 0;
      return out;
    });
    step("Parameter-CSV, Bauteilende, Bauteilfarben, benannter Schnitt, Bild in Skizze",
      img.w === 100 && img.h === 50 && img.op === 0.5 && img.stored === 1 && img.svg && img.regions === 0 && img.saved === 1 &&
      /^\ufeff?Name;Ausdruck;Wert;Kommentar\r\n/.test(csvOut) && /\r\nL;200;200;Länge\r\n/.test(csvOut) && JSON.stringify(prm) === JSON.stringify([["L", "250", "Länge"], ["B", "L / 2", "Breite"]])
      && end.n > 1 && end.rolled === end.n - 1 && end.greyed >= end.n - 1 && end.marker && end.at === 1 && end.endAfter === end.skId && end.restored
      && col.on.c2 === col.on.c3 && col.on.c1 !== col.on.c2 && col.on.c1 !== col.before.c1 && col.off.c1 === col.before.c1 && !col.flag
      && cut.saved?.axis === "Z" && cut.off && cut.back?.axis === "Z" && Math.abs(cut.back.offset - cut.saved.offset) < 1e-9,
      JSON.stringify({ csv: csvOut.slice(0, 80), prm, end, col, cut, img }));
  }

  // Fusion-Abgleich G4: Positionsdarstellungen (FU8), Explosion in Schritten (FU9), Baugruppenparameter (FU4)
  {
    await evalApp(() => { const a = window.__werkcad; a.dirty = false; return a.openExample(); });
    await idle(120000);
    // Drehgelenk an einer Komponente, zwei Stellungen speichern, umschalten
    const pos = await evalApp(async () => {
      const a = window.__werkcad, asm = a.activeDoc(), c = asm.components.find((x) => !x.fixed && !x.joint && !x.pat);
      a.edit("Gelenk", () => { c.joint = { p: [...c.pos], d: [0, 0, 1], angle: 0, min: 0, max: 90 }; });
      return { id: c.id };
    });
    await rbClick("Positionen");
    await page.locator(".dialog input").fill("Zu");
    await page.locator(".dialog footer .btn.primary").click();
    await idle();
    await evalApp((id) => { const a = window.__werkcad; a.sel = { type: "component", id }; a.props.render(); }, pos.id);
    await evalApp(() => { const s = document.querySelector("#props input.joint-angle"); s.value = "60"; s.dispatchEvent(new Event("input")); s.dispatchEvent(new Event("change")); });
    await idle();
    await rbClick("Positionen");
    await page.locator(".dialog input").fill("Offen 60");
    await page.locator(".dialog footer .btn.primary").click();
    await idle();
    await evalApp(() => { const a = window.__werkcad; a.sel = null; a.props.render(); });
    await page.locator("#props .pos-row .btn", { hasText: "Zu" }).click();
    await idle();
    const p1 = await evalApp((id) => { const a = window.__werkcad, asm = a.activeDoc(), c = asm.components.find((x) => x.id === id); return { n: asm.positions?.length, angle: c.joint.angle, pos: c.pos.map((x) => Math.round(x)).join(";"), on: document.querySelector("#props .pos-row.on .btn")?.textContent }; }, pos.id);
    await page.locator("#props .pos-row .btn", { hasText: "Offen 60" }).click();
    await idle();
    const p2 = await evalApp((id) => { const a = window.__werkcad, c = a.activeDoc().components.find((x) => x.id === id); return { angle: c.joint.angle, on: document.querySelector("#props .pos-row.on .btn")?.textContent }; }, pos.id);
    // Explosion: automatisch, übernehmen, Anzeige verschoben, Abspielen
    await rbClick("Explosion");
    await page.locator(".dialog button", { hasText: "Automatisch" }).click();
    await page.waitForTimeout(200);
    const nSteps = await page.locator(".dialog .explode-step").count();
    await page.locator(".dialog footer .btn.primary", { hasText: "Übernehmen" }).click();
    await page.waitForTimeout(200);
    await shot("g4-explosion");
    const ex = await evalApp(async () => {
      const a = window.__werkcad, v = a.viewer, asm = a.activeDoc();
      const moved = v.root.children.filter((x) => x.userData.comp).some((x) => !x.matrix.equals(x.userData.baseMatrix));
      const fixedStay = v.root.children.filter((x) => asm.components.find((c) => c.id === x.userData.comp)?.fixed).every((x) => x.matrix.equals(x.userData.baseMatrix));
      return { steps: asm.explosion?.steps?.length, moved, fixedStay, flag: a.explodeSteps > 0, section: !!document.querySelector("#props")?.textContent.includes("Explodiert zeigen") || !!document.querySelector("#props")?.textContent.includes("Zusammenbauen") };
    });
    // Zeichnung der Baugruppe: eine Ansicht in »Offen 60« und explodiert, mit Positionsnummern
    await evalApp(() => window.__werkcad.newDrawing({ kind: "assembly", id: "beispiel_bg" }));
    await idle(120000);
    await page.waitForTimeout(1000);
    await idle(120000);
    const dr = await evalApp(async () => {
      const a = window.__werkcad, dr = a.drawing, d = dr.doc, src = a.doc("beispiel_bg");
      const iso = d.views.find((v) => v.type === "iso");
      const box0 = JSON.stringify(dr.proj.get(iso.id)?.bbox);
      a.edit("Darstellung", () => { iso.state = { position: src.positions.find((p) => p.name === "Offen 60").id, explode: true }; });
      await dr.update();
      const box1 = JSON.stringify(dr.proj.get(iso.id)?.bbox);
      dr.sel = { type: "view", id: iso.id };
      dr.autoBalloons();
      a.props.render();
      const ui = [...document.querySelectorAll("#props label")].some((l) => l.textContent === "Explodiert");
      return { changed: box0 !== box1 && !!box1, balloons: d.balloons?.length || 0, ui, front: !!dr.proj.get(d.views.find((v) => v.type === "front").id) };
    });
    await shot("g4-zeichnung-explosion");
    // Parameter der Baugruppe an die Platte weitergeben: Dicke 10 → 14
    await evalApp(() => { const a = window.__werkcad; a.openDoc("beispiel_bg"); a.edit("Parameter", () => { a.activeDoc().params = [{ name: "Dicke", expr: "14", comment: "" }]; }); });
    await idle();
    await evalApp(() => window.__werkcad.props.paramsDialog());
    await page.locator(".dialog button", { hasText: "An Bauteile weitergeben" }).click();
    await page.locator(".dialog footer .btn.primary", { hasText: "Verknüpfen" }).click();
    await page.waitForTimeout(300);
    await page.locator(".dialog footer .btn", { hasText: "Abbrechen" }).click();
    await idle(60000);
    const prm = await evalApp(async () => {
      const a = window.__werkcad, pl = a.doc("beispiel_platte");
      await a.builtParts(a.doc("beispiel_bg"));
      const bb = (r) => { const b = r?.bodies?.[0]?.props?.bbox; return b ? Math.round((b[1]?.[2] ?? b.max?.[2]) - (b[0]?.[2] ?? b.min?.[2])) : null; };
      const link = pl.params.find((p) => p.name === "Dicke")?.link;
      const z1 = bb(a.results.get(pl.id));
      a.edit("Parameter", () => { a.doc("beispiel_bg").params[0].expr = "16"; });
      a.results.delete(pl.id);
      await a.builtParts(a.doc("beispiel_bg"));
      return { link: link && link.asm + "." + link.name, z1, z2: bb(a.results.get(pl.id)) };
    });
    step("Positionsdarstellungen, Explosion in Schritten, Zeichnung explodiert, Baugruppenparameter",
      p1.n === 2 && p1.angle === 0 && p1.on === "Zu" && p2.angle === 60 && p2.on === "Offen 60"
      && nSteps > 0 && ex.steps === nSteps && ex.moved && ex.fixedStay && ex.flag
      && dr.changed && dr.balloons > 0 && dr.ui && dr.front
      && prm.link === "beispiel_bg.Dicke" && prm.z1 === 14 && prm.z2 === 16,
      JSON.stringify({ p1, p2, nSteps, ex, dr, prm }));
  }

  // Fusion-Abgleich G4 (FU21): Bauteil im Kontext der Baugruppe bearbeiten, Nachbarkanten projizieren
  {
    const ctx0 = await evalApp(() => {
      const a = window.__werkcad, asm = a.doc("beispiel_bg");
      a.openDoc(asm.id);
      const c = asm.components.find((x) => !x.hidden && !x.pat && a.doc(x.part)?.kind === "part");
      return { asm: asm.id, comp: c.id, part: c.part, n: asm.components.filter((x) => !x.hidden).length };
    });
    await idle();
    await evalApp((id) => { const a = window.__werkcad; a.sel = { type: "component", id }; a.props.render(); }, ctx0.comp);
    await page.locator('#props button[data-act="in-context"]').click();
    await idle();
    await page.waitForTimeout(300);
    const ctx1 = await evalApp(() => {
      const a = window.__werkcad;
      return { active: a.activeId, ghosts: a.viewer.ghosts.length, groups: a.viewer.ghostRoot.children.length, transparent: a.viewer.ghosts.every((g) => g.mesh.material.opacity < 0.5), section: !!document.querySelector('#props button[data-act="leave-context"]') };
    });
    await shot("27a-im-kontext");
    // Skizze im Bauteil, Kante eines Nachbarteils projizieren
    await page.keyboard.press("s");
    await page.waitForTimeout(200);
    await page.locator("#props button", { hasText: "XY-Ebene" }).click();
    await page.waitForTimeout(800);
    const prj = await evalApp(() => {
      const a = window.__werkcad, v = a.viewer, rect = v.renderer.domElement.getBoundingClientRect();
      v.edgeCache = null;
      const before = a.sketcher.sk.entities.filter((e) => e.projected).length;
      let hit = null, plain = null;
      for (const { pk, scr, ranges, ghost } of v.ensureEdgeCache()) {
        if (!ghost) continue;
        for (const [s, c] of ranges) {
          if (c < 2) continue;
          const x = (scr[s * 2] + scr[s * 2 + 2]) / 2, y = (scr[s * 2 + 1] + scr[s * 2 + 3]) / 2;
          if (x < 5 || y < 5 || x > rect.width - 5 || y > rect.height - 5) continue;
          const h = v.pick(rect.left + x, rect.top + y, { edges: true, faces: false, ghosts: true });
          if (h?.kind === "edge" && h.key.startsWith("ghost:")) { hit = h; plain = v.pick(rect.left + x, rect.top + y, { edges: true, faces: false }); break; }
        }
        if (hit) break;
      }
      if (!hit) return { found: false };
      a.sketcher.projectEdge(hit);
      return { found: true, key: hit.key, plainGhost: !!plain?.key?.startsWith("ghost:"), added: a.sketcher.sk.entities.filter((e) => e.projected).length - before };
    });
    await evalApp(() => window.__werkcad.finishSketch());
    await idle();
    const stay = await evalApp(() => { const a = window.__werkcad; a.sel = null; a.props.render(); return a.viewer.ghosts.length; });
    await page.locator('#props button[data-act="leave-context"]').click();
    await idle();
    const ctx2 = await evalApp(() => { const a = window.__werkcad; return { active: a.activeId, ghosts: a.viewer.ghosts.length, ctx: !!a.context }; });
    step("Bauteil im Kontext bearbeiten, Nachbarkanten projizieren",
      ctx1.active === ctx0.part && ctx1.ghosts > 0 && ctx1.groups >= 1 && ctx1.transparent && ctx1.section
      && prj.found && !prj.plainGhost && prj.added >= 1 && stay === ctx1.ghosts
      && ctx2.active === ctx0.asm && ctx2.ghosts === 0 && !ctx2.ctx,
      JSON.stringify({ ctx0, ctx1, prj, stay, ctx2 }));
  }

  // Fusion-Abgleich G4 (FU19): Blechkasten, In Blech umwandeln mit aufgetrennten Ecken
  {
    await evalApp(() => {
      const a = window.__werkcad;
      a.newPart("Kasten");
      const P = [[0, 0], [250, 0], [250, 150], [0, 150]];
      const sk = { id: "bq", type: "sketch", name: "Quader", plane: "XY", offset: "0", points: P.map(([x, y], i) => ({ id: "q" + i, x, y })), entities: P.map((_, i) => ({ id: "ql" + i, type: "line", p1: "q" + i, p2: "q" + ((i + 1) % 4) })), constraints: [] };
      a.edit("Quader", () => { a.activeDoc().features.push(sk, { id: "bqe", type: "extrude", name: "Quader", sketch: "bq", distance: "80", mode: "normal" }); });
    });
    await idle();
    await rbClick("In Blech umwandeln");
    await idle();
    const conv = await evalApp(() => {
      const a = window.__werkcad, d = a.activeDoc(), f = d.features.at(-1), r = a.results.get(d.id);
      const b = r.bodies.find((x) => x.fid === f.id);
      return { type: f.type, from: f.from, bodies: r.bodies.length, flat: b?.meta?.sheet?.flatModel?.bends?.length, err: r.status[f.id]?.error || null, info: r.status[f.id]?.info || "", bb: b?.props?.bbox };
    });
    await evalApp(() => { const a = window.__werkcad; a.selectFeature(a.activeDoc().features.at(-1).id); });
    await page.waitForTimeout(200);
    const ui = await evalApp(() => ({ secs: [...document.querySelectorAll("#props .section h3, #props .section .sec-title, #props summary")].map((x) => x.textContent.trim()).filter(Boolean) }));
    await shot("27b-blechkasten");
    await evalApp(() => { const a = window.__werkcad, f = a.activeDoc().features.at(-1); a.edit("Ansicht", () => { f.view = "abgewickelt"; }); });
    await idle();
    const flat = await evalApp(() => { const a = window.__werkcad, d = a.activeDoc(), r = a.results.get(d.id); const bb = r.bodies[0]?.props?.bbox; return bb ? [bb[1][0] - bb[0][0], bb[1][2] - bb[0][2]] : null; });
    step("Blechkasten aus Quader (In Blech umwandeln), Ecken aufgetrennt, abgewickelt",
      conv.type === "blechkasten" && conv.from === "bqe" && conv.bodies === 1 && conv.flat === 4 && !conv.err && /aus Körper umgewandelt/.test(conv.info) && /aufgetrennt/.test(conv.info)
      && ui.secs.some((x) => /Ecken auftrennen/.test(x)) && flat && flat[0] > 250 && Math.abs(flat[1] - 2) < 1e-6,
      JSON.stringify({ conv, ui, flat }));
  }

  // Kernel (Werkzeuge Stufe 28): automatisches Neuberechnen aus → F5, Berechnungsprotokoll
  {
    await evalApp(() => { const app = window.__werkcad; app.newPart("Kernprobe"); app.ribbon.run("profile"); });
    await idle();
    const hash = () => evalApp(() => { const app = window.__werkcad; return app.results.get(app.activeId)?.hash; });
    const h0 = await hash();
    await evalApp(() => { const app = window.__werkcad; app.prefs.set("kernel.automatisch", false); app.prefs.set("kernel.protokoll", true); app.buildLog.clear();
      const f = app.activeDoc().features.find((x) => x.type === "profile"); app.edit("Länge", () => { f.length = "500"; }); });
    await page.waitForTimeout(600);
    const h1 = await hash();
    const status = await page.locator("#status .status-btn.stale").textContent().catch(() => "");
    await page.locator("#stage canvas").first().click({ position: { x: 20, y: 20 } }).catch(() => {});
    await page.keyboard.press("F5");
    await idle();
    const h2 = await hash();
    const stale = await page.locator("#status .status-btn.stale").count();
    await evalApp(() => window.__werkcad.commands.exec("model.buildLog"));
    await page.waitForTimeout(200);
    const rows = await page.locator(".dialog .buildlog tbody tr").count();
    const cell = await page.locator(".dialog .buildlog tbody tr td").nth(1).textContent().catch(() => "");
    await page.keyboard.press("Escape");
    await evalApp(() => { const app = window.__werkcad; app.prefs.reset(["kernel.automatisch", "kernel.protokoll"]); app.buildLog.clear(); });
    step("Neu berechnen mit F5, Berechnungsprotokoll", h0 && h1 === h0 && /Nicht aktuell/.test(status) && h2 !== h0 && stale === 0 && rows >= 1 && cell === "Kernprobe", JSON.stringify({ h0, h1, h2, status, stale, rows, cell }));
  }

  // Restpunkte (Werkzeuge Stufe 29): Standardebene für die erste Skizze, Beleuchtung, Standardordner im Center
  {
    await evalApp(() => { const app = window.__werkcad; app.prefs.set("skizze.standardebene", "XZ"); app.prefs.set("ansicht.beleuchtung", "kontrast"); app.newPart("Ebenenprobe"); });
    await idle();
    await page.keyboard.press("s");
    await page.waitForTimeout(400);
    const sk = await evalApp(() => { const app = window.__werkcad; const f = app.activeDoc().features.find((x) => x.type === "sketch"); return { mode: app.mode, plane: f?.plane?.ref, amb: app.viewer.lights.ambient.intensity }; });
    await evalApp(() => window.__werkcad.finishSketch(true));
    await page.waitForTimeout(200);
    await evalApp(() => window.__werkcad.props.settingsDialog({ category: "allgemein" }));
    await page.waitForTimeout(200);
    const folderRow = await page.locator('.dialog .set-row[data-key="allgemein.ordner"] input').count();
    await page.keyboard.press("Escape");
    await evalApp(() => window.__werkcad.prefs.reset(["skizze.standardebene", "ansicht.beleuchtung"]));
    const amb0 = await evalApp(() => window.__werkcad.viewer.lights.ambient.intensity);
    step("Standardebene, Beleuchtung, Standardordner", sk.mode === "sketch" && sk.plane === "XZ" && sk.amb === 0.45 && amb0 === 0.95 && folderRow === 1, JSON.stringify({ sk, amb0, folderRow }));
  }

  // Skizze säubern (MegaCAD-Abgleich M7): lose Ecken, doppelte Linie, leicht schief → eine geschlossene Kontur
  {
    await evalApp(() => window.__werkcad.newPart("Saeubern"));
    await idle();
    await page.keyboard.press("s");
    await page.waitForTimeout(200);
    await page.locator("#props button", { hasText: "XY-Ebene" }).click();
    await page.waitForTimeout(800);
    await evalApp(() => window.__werkcad.sketcher.commit("Fremddaten", (sk) => {
      sk.points.push({ id: "qa", x: 10, y: 5 }, { id: "qb", x: 90, y: 5.2 }, { id: "qb2", x: 90.004, y: 5.2 }, { id: "qc", x: 90, y: 45 }, { id: "qc2", x: 90, y: 45.003 }, { id: "qd", x: 10, y: 45 }, { id: "qd2", x: 10.002, y: 45 }, { id: "qa2", x: 10, y: 5.001 });
      sk.entities.push({ id: "q1", type: "line", p1: "qa", p2: "qb" }, { id: "q2", type: "line", p1: "qb2", p2: "qc" }, { id: "q3", type: "line", p1: "qc2", p2: "qd" }, { id: "q4", type: "line", p1: "qd2", p2: "qa2" }, { id: "q1x", type: "line", p1: "qb", p2: "qa" });
    }));
    await page.waitForTimeout(200);
    const before = await evalApp(() => { const s = window.__werkcad.sketcher.sk; return { lines: s.entities.filter((e) => e.type === "line").length, pts: s.points.length }; });
    await rbClick("Säubern");
    await page.waitForTimeout(300);
    const hint = await page.locator(".dialog .hint").last().textContent();
    await page.locator(".dialog button", { hasText: /^Säubern$/ }).click();
    await page.waitForTimeout(300);
    const after = await evalApp(() => { const s = window.__werkcad.sketcher.sk; return { lines: s.entities.filter((e) => e.type === "line").length, pts: s.points.length, hor: s.constraints.filter((c) => c.type === "horizontal").length }; });
    await shot("26f-skizze-gesaeubert");
    await evalApp(() => window.__werkcad.undo());
    await page.waitForTimeout(300);
    const undone = await evalApp(() => window.__werkcad.sketcher.sk.entities.filter((e) => e.type === "line").length);
    await page.keyboard.press("Escape");
    step("Skizze säubern", before.lines === 5 && after.lines === 4 && after.pts === before.pts - 4 && after.hor === 1 && undone === 5 && /4 Punkt/.test(hint), JSON.stringify({ before, hint, after, undone }));
  }

  // DXF-Import in die Skizze (MegaCAD-Abgleich M21): Platte mit Rundung und Bohrung aus einer Fremd-DXF
  {
    await evalApp(() => window.__werkcad.newPart("DXF"));
    await idle();
    await page.keyboard.press("s");
    await page.waitForTimeout(200);
    await page.locator("#props button", { hasText: "XY-Ebene" }).click();
    await page.waitForTimeout(800);
    const text = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES",
      "0", "LWPOLYLINE", "8", "KONTUR", "90", "4", "70", "1", "10", "100", "20", "100", "10", "200", "20", "100", "42", "0.4142135623730951", "10", "250", "20", "150", "10", "100", "20", "150",
      "0", "CIRCLE", "8", "BOHRUNG", "10", "150", "20", "125", "40", "8",
      "0", "TEXT", "8", "BESCHRIFTUNG", "10", "0", "20", "0", "1", "Teil 1",
      "0", "ENDSEC", "0", "EOF"].join("\n");
    await evalApp((t) => { window.__werkcad.sketcher.importDxfDialog({ name: "platte.dxf", text: t }); }, text);
    await page.waitForTimeout(300);
    const dlg = await page.locator(".dialog").last().textContent();
    await page.locator(".dialog label.chk", { hasText: "linke untere Ecke" }).click();
    await page.locator(".dialog footer .btn", { hasText: "Importieren" }).click();
    await page.waitForTimeout(400);
    const imp = await evalApp(() => {
      const s = window.__werkcad.sketcher.sk;
      const used = new Set(s.entities.filter((e) => e.type === "line").flatMap((e) => [e.p1, e.p2]));
      const xs = s.points.filter((p) => used.has(p.id)).map((p) => p.x), ys = s.points.filter((p) => used.has(p.id)).map((p) => p.y);
      return { ents: s.entities.filter((e) => e.type !== "point").map((e) => e.type).sort().join(), minX: Math.min(...xs), minY: Math.min(...ys) };
    });
    await shot("26g-dxf-import");
    await page.locator("#ribbon button", { hasText: /^Skizze fertig$/ }).first().click();
    await idle();
    step("DXF-Import in Skizze", /KONTUR \(4\)/.test(dlg) && /BOHRUNG \(1\)/.test(dlg) && /1 × TEXT/.test(dlg) && imp.ents === "arc,circle,line,line,line" && Math.abs(imp.minX) < 1e-6 && Math.abs(imp.minY) < 1e-6, JSON.stringify({ dlg: dlg.slice(0, 160), imp }));
  }

  // Bild der Ansicht als PNG (M21)
  {
    const png = await evalApp(async () => {
      const a = window.__werkcad, orig = a.files.saveBinary;
      let got = null;
      a.files.saveBinary = async (buf, name) => { got = { name, head: Array.from(buf.slice(0, 4)), n: buf.length }; };
      try { await a.files.exportPng(); } finally { a.files.saveBinary = orig; }
      const c = a.viewer.renderer.domElement;
      return { ...got, cw: c.width, ch: c.height };
    });
    step("Bild als PNG", png.head.join() === "137,80,78,71" && /\.png$/.test(png.name) && png.n > 2000, JSON.stringify(png));
  }

  // Farbschema dunkel und gemerkte Werkzeugwerte
  {
    await evalApp(() => window.__werkcad.openDoc("beispiel_platte"));
    await idle();
    const rgb = (c) => (c.match(/\d+/g) || []).slice(0, 3).map(Number);
    const lum = (c) => { const [r, g, b] = rgb(c); return (r + g + b) / 3; };
    const look = () => evalApp(() => {
      const cs = (sel) => getComputedStyle(document.querySelector(sel));
      return { theme: document.documentElement.dataset.theme, body: cs("body").backgroundColor, props: cs("#props").backgroundColor, ribbon: cs("#ribbon").backgroundColor, stage: cs("#stage").backgroundImage, ink: cs("body").color };
    });
    const light = await look();
    await evalApp(() => window.__werkcad.prefs.set("darstellung.schema", "dunkel"));
    await page.waitForTimeout(300);
    const dark = await look();
    await shot("26c-dunkel");
    await evalApp(() => window.__werkcad.prefs.set("darstellung.schema", "hell"));
    const back = await look();
    // letzte Werkzeugwerte: Rundung 7 merken, „vergessen“ setzt zurück, ausgeschaltet gilt der Standard
    const memo = await evalApp(() => {
      const a = window.__werkcad, s = a.sketcher;
      s.rememberValue("rundung", "7");
      const kept = s.lastValue("rundung"), stored = JSON.parse(a.prefs.exportText()).values["werkzeuge.letzte"];
      a.prefs.set("werkzeuge.merken", false);
      const off = s.lastValue("rundung");
      a.prefs.reset(["werkzeuge.merken", "werkzeuge.letzte"]);
      return { kept, stored, off, after: s.lastValue("rundung") ?? null };
    });
    step("Farbschema dunkel, Werkzeugwerte gemerkt", light.theme === "light" && dark.theme === "dark" && lum(dark.body) < 70 && lum(dark.props) < 80 && lum(dark.ink) > 180 && lum(light.body) > 200 && dark.stage !== light.stage && back.theme === "light" && back.body === light.body &&
      memo.kept === "7" && memo.stored?.rundung === "7" && memo.off === undefined && memo.after === null, JSON.stringify({ light, dark, memo }));
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
  // Prägen / Gravieren: Skizze auf ein Rundrohr abgewickelt, dann erhaben
  await evalApp(() => {
    const a = window.__werkcad;
    a.newPart("Gravur");
    a.addFeature({ type: "profile", section: "rohr", dims: { D: "40", t: "3" }, length: "500", start: ["0", "0", "0"], axis: "X", rotation: "0", miterStart: "0", miterEnd: "0", endCuts: { A: "2D", B: "2D" }, swivel: "45" });
    const P = (id, x, y) => ({ id, x, y });
    a.addFeature({ type: "sketch", plane: { ref: "XY" }, offset: "50", points: [P("g1", 200, -10), P("g2", 240, -10), P("g3", 240, 10), P("g4", 200, 10)],
      entities: [["l1", "g1", "g2"], ["l2", "g2", "g3"], ["l3", "g3", "g4"], ["l4", "g4", "g1"]].map(([id, p1, p2]) => ({ id, type: "line", p1, p2 })), constraints: [] });
  });
  await idle();
  await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
  await page.locator("#ribbon button", { hasText: "Prägen" }).click();
  await idle();
  const gst = () => evalApp(() => { const a = window.__werkcad; const f = a.activeDoc().features.at(-1); const r = a.results.get(a.activeId); return { type: f.type, st: r.status[f.id], bodies: r.bodies.length }; });
  const g1 = await gst();
  await shot("27-gravur-rohr");
  await page.locator("#props .seg button", { hasText: /^Prägen$/ }).click();
  await idle();
  const g2 = await gst();
  step("Prägen auf Rundrohr", g1.type === "emboss" && g1.st.ok && /graviert, 0.5 mm, 1 auf dem Rohr abgewickelt/.test(g1.st.info) && g2.st.ok && /geprägt/.test(g2.st.info) && g2.bodies === 1, JSON.stringify({ g1, g2 }));

  // Polygon und Schlitz am Rohr: Kontur hinzufügen, Eckpunkte ändern
  await evalApp(() => { const a = window.__werkcad; a.selectFeature(a.activeDoc().features[0].id); });
  await idle();
  await page.locator("#props button", { hasText: "+ Polygon" }).click();
  await idle();
  const pk = page.locator("#props .tube-cut .field", { hasText: "Eckpunkte" }).locator("input");
  await pk.fill("0,0; 40,0; 40,10; 20,16; 0,10");
  await pk.press("Enter");
  await idle();
  await page.locator("#props button", { hasText: "+ Schlitz" }).click();
  await idle();
  const pg = await evalApp(() => { const a = window.__werkcad; const f = a.activeDoc().features[0]; const r = a.results.get(a.activeId); return { cuts: f.cuts.map((c) => c.kind + ":" + (c.punkte || c.l)), st: r.status[f.id], pierces: r.bodies[0]?.meta?.pierces, bilder: [...document.querySelectorAll("#props .tube-cut svg.massbild")].map((x) => x.getAttribute("aria-label").split(":")[0]) }; });
  step("Polygon und Schlitz am Rohr", pg.cuts.join() === "polygon:0,0; 40,0; 40,10; 20,16; 0,10,schlitz:40" && pg.st.ok && !pg.st.warning && pg.pierces === 2 && pg.bilder.join() === "Polygon,Maße Schlitz am Ende", JSON.stringify(pg));

  // Bezugsgeometrie: Arbeitsebene über das Menüband, Skizze darauf, Anzeige im 3D-Fenster
  await evalApp(() => window.__werkcad.newPart("Bezug"));
  await idle();
  await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
  await rbClick("Arbeitsebene");
  await page.waitForTimeout(200);
  // Der Knopf startet die Auswahl (Art aus angeklickter Geometrie); im leeren Bauteil die Art selbst wählen
  const wpPick = await evalApp(() => window.__werkcad.pick?.kind);
  await page.locator("#props .field", { hasText: "Oder Art selbst wählen" }).locator("select").selectOption("versatz");
  await idle();
  const wp = await evalApp(() => { const a = window.__werkcad; const f = a.activeDoc().features.at(-1); const r = a.results.get(a.activeId); return { type: f.type, st: r.status[f.id], datums: r.datums?.length, shown: a.viewer.datumGroup?.children.length, props: !!document.querySelector("#props h3") && [...document.querySelectorAll("#props h3")].some((x) => x.textContent === "Arbeitsebene") }; });
  await page.locator("#props button", { hasText: "Skizze auf dieser Ebene" }).click();
  await idle();
  const wsk = await evalApp(() => { const a = window.__werkcad; return { mode: a.mode, z: a.sketcher.frame?.origin?.[2], plane: a.activeDoc().features.at(-1).plane }; });
  await shot("28-arbeitsebene");
  await evalApp(() => window.__werkcad.finishSketch());
  await idle();
  step("Arbeitsebene mit Skizze", wpPick === "datumCreate" && wp.type === "arbeitsebene" && wp.st.ok && /Ursprung \(0; 0; 50\)/.test(wp.st.info) && wp.datums === 1 && wp.shown >= 2 && wp.props && wsk.mode === "sketch" && Math.abs(wsk.z - 50) < 1e-9 && wsk.plane.ref === "datum", JSON.stringify({ wp, wsk }));

  // Arbeitselemente durch Anklicken (Inventor): Art erkannt, Vorschau, Griff ziehen, Wählen im 3D-Fenster, alle ausblenden
  {
    await evalApp(() => {
      const a = window.__werkcad;
      const P = (id, x, y) => ({ id, x, y });
      a.newPart("Arbeitselemente");
      a.addFeature({ type: "sketch", id: "ae1", name: "ae1", plane: { ref: "XY" }, offset: "0", points: [P("q1", 0, 0), P("q2", 100, 0), P("q3", 100, 60), P("q4", 0, 60)], entities: [[1, 2], [2, 3], [3, 4], [4, 1]].map(([p, q]) => ({ id: "ql" + p, type: "line", p1: "q" + p, p2: "q" + q })), constraints: [] }, { select: false });
      a.addFeature({ type: "extrude", id: "aex1", sketch: "ae1", distance: "20", op: "new" }, { select: false });
      a.addFeature({ type: "sketch", id: "ae2", name: "ae2", plane: { ref: "XY" }, offset: "20", points: [P("kc", 50, 30)], entities: [{ id: "kk", type: "circle", c: "kc", r: 15 }], constraints: [] }, { select: false });
      a.addFeature({ type: "extrude", id: "aex2", sketch: "ae2", distance: "30", op: "join" }, { select: false });
    });
    await idle();
    await evalApp(() => window.__werkcad.viewer.setView("iso"));
    await idle();
    const scr = (p) => evalApp((p) => { const v = window.__werkcad.viewer; const [x, y] = v.worldToScreen(p); const r = v.renderer.domElement.getBoundingClientRect(); return [x + r.left, y + r.top]; }, p);
    const clickAt = async (p) => { const [x, y] = await scr(p); await page.mouse.move(x, y); await page.waitForTimeout(120); await page.mouse.click(x, y); await page.waitForTimeout(250); };
    const last = () => evalApp(() => { const a = window.__werkcad; const d = a.activeDoc(), f = d.features.at(-1), g = a.datumMap(d).get(f.id); return { n: d.features.length, type: f.type, mode: f.mode, g, ok: a.results.get(a.activeId)?.status?.[f.id]?.ok, pick: a.pick?.kind || null }; });
    // Ebene: Oberseite anklicken → Versatz (Eingabe übernimmt), Vorschau sichtbar
    await rbClick("Arbeitsebene");
    await clickAt([10, 10, 20]);
    const pv = await evalApp(() => ({ erkannt: document.querySelector("#props dl.kv dd")?.textContent, preview: window.__werkcad.viewer.datumGroup.children.some((o) => o.material?.isLineDashedMaterial && o.material.color.getHex() === 0x2e9d4a) }));
    await shot("80-arbeitsebene-auswahl");
    await page.keyboard.press("Enter");
    await idle();
    const e1 = await last();
    // Griff ziehen: Abstand längs der Normalen, ein Rückgängig-Schritt
    const tip = await evalApp(() => { const a = window.__werkcad, v = a.viewer; const o = v.datumGroup.children.find((x) => x.userData.handle); return o ? o.position.toArray() : null; });
    let drag = null;
    if (tip) {
      const [hx, hy] = await scr(tip);
      await page.mouse.move(hx, hy); await page.waitForTimeout(150);
      await page.mouse.down(); await page.mouse.move(hx, hy - 40, { steps: 6 }); await page.mouse.up();
      await idle();
      drag = await evalApp(() => { const a = window.__werkcad; return { distance: a.activeDoc().features.at(-1).distance, undo: a.undoStack.at(-1)?.label }; });
    }
    await shot("81-arbeitsebene-griff");
    // Achse: Zylinderfläche anklicken → sofort fertig
    await rbClick("Arbeitsachse");
    await clickAt([50 + 15 * Math.SQRT1_2, 30 - 15 * Math.SQRT1_2, 35]);
    await idle();
    const a1 = await last();
    // Punkt: gerade Kante anklicken → Kantenmitte (auch abseits der Mitte wählbar)
    await rbClick("Arbeitspunkt");
    await clickAt([70, 0, 20]);
    await idle();
    const p1 = await last();
    // Ebene aus Oberseite und Vorderseite → Mittelebene (Winkelhalbierende)
    await rbClick("Arbeitsebene");
    await clickAt([20, 20, 20]);
    await clickAt([80, 0, 10]);
    await idle();
    const m1 = await last();
    // Esc bricht ab, nichts angelegt
    await rbClick("Arbeitsebene");
    await clickAt([20, 20, 20]);
    await page.keyboard.press("Escape");
    const esc = await last();
    // Alle Arbeitselemente aus- und wieder einblenden
    const shownBefore = await evalApp(() => window.__werkcad.viewer.datumGroup.children.filter((o) => o.userData.datumKey?.startsWith("datum:")).length);
    await evalApp(() => { const a = window.__werkcad; a.selectFeature(null); a.edit("Arbeitselemente ausblenden", () => { a.activeDoc().hideDatums = true; }); });
    await idle();
    const shownHidden = await evalApp(() => window.__werkcad.viewer.datumGroup.children.filter((o) => o.userData.datumKey?.startsWith("datum:")).length);
    await evalApp(() => window.__werkcad.undo());
    await idle();
    const near = (a, b, t = 1e-3) => a && b && a.every((x, i) => Math.abs(x - b[i]) < t);
    const ok = pv.erkannt === "Versatz zu Ebene" && pv.preview && e1.type === "arbeitsebene" && e1.mode === "versatz" && e1.ok && drag && Number(drag.distance) > 1 && drag.undo === "Abstand ziehen"
      && a1.mode === "zylinder" && near(a1.g.p.slice(0, 2), [50, 30]) && Math.abs(Math.abs(a1.g.d[2]) - 1) < 1e-6
      && p1.mode === "modell" && near(p1.g.p, [50, 0, 20]) && m1.mode === "mitte" && m1.ok && near(m1.g.frame.normal.map(Math.abs), [0, Math.SQRT1_2, Math.SQRT1_2])
      && esc.n === m1.n && esc.pick === null && shownBefore >= 4 && shownHidden === 0;
    step("Arbeitselemente durch Anklicken", ok, JSON.stringify({ pv, e1: e1.mode, drag, a1: a1.mode, p1: [p1.mode, p1.g?.p], m1: [m1.mode, m1.g?.frame?.normal], esc: [esc.n, m1.n, esc.pick], shownBefore, shownHidden }));
  }

  // Sweeping, Erhebung, Spirale, Muster entlang Pfad über das Menüband
  await evalApp(() => {
    const a = window.__werkcad;
    a.newPart("Formen");
    const P = (id, x, y) => ({ id, x, y });
    const circ = (id, plane, x, y, r, offset = "0") => ({ type: "sketch", id, name: id, plane: { ref: plane }, offset, points: [P(id + "c", x, y)], entities: [{ id: id + "k", type: "circle", c: id + "c", r }], constraints: [] });
    a.addFeature(circ("prof", "YZ", 0, 0, 5), { select: false });
    a.addFeature({ type: "sketch", id: "pfad", name: "Pfad", plane: { ref: "XY" }, offset: "0", points: [P("a", 0, 0), P("b", 100, 0), P("m", 100, 30), P("c", 130, 30)], entities: [{ id: "l1", type: "line", p1: "a", p2: "b" }, { id: "ar", type: "arc", c: "m", p1: "b", p2: "c" }], constraints: [] }, { select: false });
  });
  await idle();
  await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
  await rbClick("Sweeping");
  await idle();
  await evalApp(() => {
    const a = window.__werkcad;
    const P = (id, x, y) => ({ id, x, y });
    const sq = (id, off, s) => ({ type: "sketch", id, name: id, plane: { ref: "XY" }, offset: off, points: [P(id + 1, 200 - s, -s), P(id + 2, 200 + s, -s), P(id + 3, 200 + s, s), P(id + 4, 200 - s, s)], entities: [[1, 2], [2, 3], [3, 4], [4, 1]].map(([p, q]) => ({ id: id + "l" + p, type: "line", p1: id + p, p2: id + q })), constraints: [] });
    a.addFeature(sq("u", "0", 20), { select: false });
    a.addFeature(sq("o", "40", 8), { select: false });
  });
  await idle();
  await rbClick("Erhebung");
  await idle();
  await evalApp(() => {
    const a = window.__werkcad;
    a.addFeature({ type: "sketch", id: "fed", name: "Feder", plane: { ref: "XZ" }, offset: "0", points: [{ id: "fc", x: -100, y: 0 }, { id: "f0", x: -80, y: 0 }, { id: "f1", x: -80, y: 10 }], entities: [{ id: "fk", type: "circle", c: "fc", r: 2 }, { id: "fa", type: "line", p1: "f0", p2: "f1", construction: true }], constraints: [] }, { select: false });
  });
  await idle();
  await rbClick("Spirale");
  await idle();
  await page.locator("#props .field", { hasText: "Achse" }).locator("select").selectOption("fa");
  await idle(60000);
  const fm = await evalApp(() => { const a = window.__werkcad, part = a.activeDoc(), r = a.results.get(part.id); return part.features.filter((f) => ["sweep", "loft", "spirale"].includes(f.type)).map((f) => ({ t: f.type, ok: r.status[f.id]?.ok, info: r.status[f.id]?.info, err: r.status[f.id]?.error })).concat([{ bodies: r.bodies.length }]); });
  await evalApp(() => window.__werkcad.viewer.fit?.());
  await shot("29-sweep-loft-spirale");
  step("Sweeping, Erhebung, Spirale", fm.length === 4 && fm.slice(0, 3).every((x) => x.ok) && /Pfad 147,1 mm/.test(fm[0].info) && /2 Querschnitte/.test(fm[1].info) && /5 Umdrehungen/.test(fm[2].info) && fm[3].bodies >= 1, JSON.stringify(fm));

  // Körper-Werkzeuge: zwei Quader, Kombinieren über das Menüband (Differenz), Fläche verschieben, Trennen
  await evalApp(() => {
    const a = window.__werkcad;
    a.newPart("Koerper");
    const P = (id, x, y) => ({ id, x, y });
    const box = (id, x) => ({ type: "sketch", id, name: id, plane: { ref: "XY" }, offset: "0", points: [P(id + 1, x, 0), P(id + 2, x + 100, 0), P(id + 3, x + 100, 40), P(id + 4, x, 40)], entities: [[1, 2], [2, 3], [3, 4], [4, 1]].map(([p, q]) => ({ id: id + "l" + p, type: "line", p1: id + p, p2: id + q })), constraints: [] });
    a.addFeature(box("k1", 0), { select: false });
    a.addFeature({ type: "extrude", id: "ke1", sketch: "k1", distance: "10", op: "new" }, { select: false });
    a.addFeature(box("k2", 50), { select: false });
    a.addFeature({ type: "extrude", id: "ke2", sketch: "k2", distance: "10", op: "new" }, { select: false });
  });
  await idle();
  await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
  await rbClick("Kombinieren");
  await idle();
  const kb = await evalApp(() => { const a = window.__werkcad, r = a.results.get(a.activeId), f = a.activeDoc().features.at(-1); return { type: f.type, st: r.status[f.id], bodies: r.bodies.length, vol: Math.round(r.bodies.reduce((s, b) => s + (b.props?.volume || 0), 0)), checks: document.querySelectorAll("#props .checks input").length }; });
  await rbClick("Fläche verschieben");
  await idle();
  await evalApp(() => { const a = window.__werkcad, f = a.activeDoc().features.at(-1); a.edit("Fläche", () => { f.faces = [{ p: [25, 20, 10] }]; f.distance = "5"; }); });
  await idle();
  await rbClick("Trennen");
  await idle();
  await page.locator("#props .field", { hasText: "Abstand" }).first().locator("input").fill("25");
  await page.locator("#props .field", { hasText: "Abstand" }).first().locator("input").press("Enter");
  await idle();
  const kb2 = await evalApp(() => { const a = window.__werkcad, r = a.results.get(a.activeId), fs = a.activeDoc().features; return { st: fs.slice(-2).map((f) => r.status[f.id]), bodies: r.bodies.length, vol: Math.round(r.bodies.reduce((s, b) => s + (b.props?.volume || 0), 0)) }; });
  await shot("30-koerper");
  step("Körper kombinieren, Fläche verschieben, trennen", kb.type === "kombinieren" && kb.st.ok && kb.bodies === 1 && kb.vol === 20000 && kb.checks === 1 && kb2.st.every((x) => x.ok) && kb2.vol === 30000 && kb2.bodies === 2, JSON.stringify({ kb, kb2 }));

  // Baugruppe: Komponentenmuster über das Menüband, Kopien in der Stückliste, Winkel-Abhängigkeit, Zylindergelenk
  await evalApp(() => {
    const a = window.__werkcad;
    const asm = a.newAssembly();
    a.edit("Komponenten", () => {
      asm.components.push({ id: "mp1", part: "beispiel_platte", name: "Platte:1", pos: [0, 0, 0], rot: [0, 0, 0], fixed: true });
      asm.components.push({ id: "mp2", part: "beispiel_rohr", name: "Rohr:1", pos: [0, 0, 300], rot: [0, 0, 0] });
    });
    a.sel = { type: "component", id: "mp2" };
  });
  await idle(120000);
  await page.locator("#ribbon .rb-tab", { hasText: "Zusammenfügen" }).click();
  await rbClick("Muster");
  await idle(60000);
  const am = await evalApp(() => { const a = window.__werkcad, asm = a.activeDoc(); return { copies: asm.components.filter((c) => c.pat).length, sel: a.sel?.type, tree: [...document.querySelectorAll("#browser .node .label")].some((x) => /^Muster 1$/.test(x.textContent)), bomRohr: asm.components.filter((c) => c.part === "beispiel_rohr").length }; });
  await page.locator("#props .field", { hasText: "Anzahl 1" }).locator("input").fill("5");
  await page.locator("#props .field", { hasText: "Anzahl 1" }).locator("input").press("Enter");
  await idle(60000);
  const am2 = await evalApp(() => { const a = window.__werkcad, asm = a.activeDoc(); const cp = asm.components.filter((c) => c.pat); return { copies: cp.length, xs: cp.map((c) => Math.round(c.pos[0])) }; });
  await evalApp(() => { const a = window.__werkcad; a.viewer.fit?.(); });
  await shot("31-komponentenmuster");
  step("Komponentenmuster", am.copies === 2 && am.sel === "asmpattern" && am.tree && am.bomRohr === 3 && am2.copies === 4 && new Set(am2.xs).size === 4, JSON.stringify({ am, am2 }));

  // Rahmen: Endkappe und Kürzen über das Menüband, Gleichteile in den Bauteil-Eigenschaften
  await evalApp(() => {
    const a = window.__werkcad;
    a.newPart("Gestell");
    for (const y of ["0", "300"]) a.addFeature({ type: "profile", section: "vierkant", dims: { B: "40", t: "3", r: "4" }, length: "800", start: ["0", y, "0"], axis: "X", rotation: "0", miterStart: "0", miterEnd: "0" }, { select: false });
  });
  await idle();
  await page.locator("#ribbon .rb-tab", { hasText: "Metallbau" }).click();
  await rbClick("Endkappe");
  await idle();
  await page.locator("#ribbon button", { hasText: /^Kürzen\/Verlängern$/ }).click();
  await idle();
  await page.locator("#props .field", { hasText: "Abstand der Ebene" }).locator("input").fill("700");
  await page.locator("#props .field", { hasText: "Abstand der Ebene" }).locator("input").press("Enter");
  await idle();
  const rk = await evalApp(() => { const a = window.__werkcad, r = a.results.get(a.activeId), fs = a.activeDoc().features; return { st: fs.slice(-2).map((f) => ({ t: f.type, ok: r.status[f.id]?.ok, info: r.status[f.id]?.info })), caps: r.bodies.filter((b) => b.meta?.endcap).length, lens: r.bodies.filter((b) => b.kind === "member").map((b) => Math.round(b.meta.length)) }; });
  await evalApp(() => { const a = window.__werkcad; a.sel = null; a.props.render(); });
  const eqp = await evalApp(() => [...document.querySelectorAll("#props .section h3")].some((x) => x.textContent === "Gleichteile"));
  await shot("32-rahmen-endkappe");
  step("Endkappe, Kürzen, Gleichteile", rk.st.every((x) => x.ok) && rk.caps === 2 && rk.lens.sort().join() === "700,800" && !eqp, JSON.stringify({ rk, eqp }));

  // Blech-Features (Werkzeuge Stufe 41): Lasche, Stirnlasche mit Eckfreischnitt, Durchzug, Umschlag am Kantteil; Konturlasche aus Skizze
  {
    await evalApp(() => window.__werkcad.newPart("Blech"));
    await idle();
    await page.locator("#ribbon .rb-tab", { hasText: "Metallbau" }).click();
    await rbClick("Kantteil");
    await idle(60000);
    for (const label of ["Lasche", "Umschlag", "Durchzug"]) {
      await rbClick(label);
      await idle(60000);
    }
    // Stirnlasche: Lasche auf »vorne« am Steg stellen
    const bl0 = await evalApp(async () => {
      const a = window.__werkcad, d = a.activeDoc();
      const la = d.features.find((f) => f.type === "lasche");
      a.edit("Stirnlasche", () => { la.edge = "vorne"; la.leg = "2"; });
      await a.rebuildNow?.();
      return d.features.map((f) => f.type).join(",");
    });
    await idle(60000);
    const bl = await evalApp(async () => {
      const a = window.__werkcad, d = a.activeDoc(), r = a.results.get(a.activeId);
      const sh = r.bodies.find((b) => b.meta?.sheet)?.meta.sheet;
      const orig = a.files.saveText; let got = null;
      a.files.saveText = async (text, name) => { got = { name, circles: (text.match(/\nCIRCLE\r?\n/g) || []).length, bend: (text.match(/\nBIEGUNG\r?\n/g) || []).length }; };
      try { await a.files.exportKantteilDxf(d.features[0]); } finally { a.files.saveText = orig; }
      return { ok: Object.values(r.status).every((s) => s.ok), err: Object.values(r.status).filter((s) => !s.ok).map((s) => s.error), bends: sh?.flatModel?.bends.length, circles: sh?.flatModel?.circles.length, y0: sh?.flatModel?.bbox.y0, dxf: got, tree: document.querySelectorAll("#tree .node").length };
    });
    await evalApp(() => { const v = window.__werkcad.viewer; v.setView("iso", { animate: false }); v.fit(); });
    await shot("41-blech-features");
    // Konturlasche aus offener Linie
    const kl = await evalApp(async () => {
      const a = window.__werkcad, d = a.activeDoc();
      a.edit("Skizze", () => d.features.push({ id: "skKL", type: "sketch", name: "Kontur", plane: { ref: "XY" }, offset: "0", points: [{ id: "q1", x: 0, y: 300 }, { id: "q2", x: 60, y: 300 }, { id: "q3", x: 60, y: 380 }], entities: [{ id: "m1", type: "line", p1: "q1", p2: "q2" }, { id: "m2", type: "line", p1: "q2", p2: "q3" }], constraints: [] }));
      return true;
    });
    await idle(60000);
    await page.locator("#ribbon .rb-tab", { hasText: "Metallbau" }).click();
    await rbClick("Konturlasche");
    await idle(60000);
    const kl2 = await evalApp(() => { const a = window.__werkcad, d = a.activeDoc(), r = a.results.get(a.activeId); const f = d.features.at(-1); return { type: f.type, src: f.src, ok: r.status[f.id]?.ok, info: r.status[f.id]?.info, bodies: r.bodies.length }; });
    step("Blech: Lasche, Umschlag, Durchzug, Stirnlasche, Konturlasche", bl.ok && bl.bends === 4 && bl.circles === 1 && bl.y0 < 0 && bl.dxf?.circles === 1 && kl && kl2.ok && kl2.src === "skizze" && kl2.bodies === 2 && /1 Biegung/.test(kl2.info || ""), JSON.stringify({ bl0, bl, kl2 }));
  }

  // Werkzeuge Stufe 48: Ecke schließen an der Stirnlasche, Stanzwerkzeug, Konturwalzen mit Trennfuge (Abwicklung als DXF)
  {
    await evalApp(() => window.__werkcad.newPart("Blech 48"));
    await idle();
    await rbClick("Kantteil");
    await idle(60000);
    await rbClick("Lasche");
    await idle(60000);
    await evalApp(async () => {
      const a = window.__werkcad, la = a.activeDoc().features.find((f) => f.type === "lasche");
      a.edit("Stirnlasche", () => { la.edge = "vorne"; la.leg = "2"; });
      await a.rebuildNow?.();
    });
    await idle(60000);
    for (const label of ["Ecke schließen", "Stanzwerkzeug"]) {
      await rbClick(label);
      await idle(60000);
    }
    const ec = await evalApp(() => {
      const a = window.__werkcad, d = a.activeDoc(), r = a.results.get(a.activeId);
      const sh = r.bodies.find((b) => b.meta?.sheet)?.meta.sheet;
      return { types: d.features.map((f) => f.type).join(","), ok: Object.values(r.status).every((s) => s.ok), err: Object.values(r.status).filter((s) => !s.ok).map((s) => s.error), holes: sh?.flatModel?.holes.length, info: r.status[d.features.at(-1).id]?.info, panel: [...document.querySelectorAll("#props .section h3")].map((x) => x.textContent) };
    });
    await evalApp(() => { const v = window.__werkcad.viewer; v.setView("iso", { animate: false }); v.fit(); });
    await shot("48-blech-ecke-stanzung");
    await evalApp(() => {
      const a = window.__werkcad, d = a.activeDoc();
      a.edit("Skizze", () => d.features.push({ id: "skKW", type: "sketch", name: "Mantel", plane: { ref: "XY" }, offset: "0", points: [{ id: "w1", x: 0, y: 50 }, { id: "w2", x: 100, y: 50 }], entities: [{ id: "wl", type: "line", p1: "w1", p2: "w2" }], constraints: [] }));
    });
    await idle(60000);
    await rbClick("Konturwalzen");
    await idle(60000);
    const kw0 = await evalApp(() => { const a = window.__werkcad, r = a.results.get(a.activeId), f = a.activeDoc().features.at(-1); return { type: f.type, ok: r.status[f.id]?.ok, info: r.status[f.id]?.info }; });
    await rbClick("Trennfuge");
    await idle(60000);
    const kw = await evalApp(async () => {
      const a = window.__werkcad, d = a.activeDoc(), r = a.results.get(a.activeId);
      const w = d.features.find((f) => f.type === "konturwalzen"), tf = d.features.find((f) => f.type === "trennfuge");
      const orig = a.files.saveText; let got = null;
      a.files.saveText = async (text, name) => { got = { name, poly: (text.match(/\nPOLYLINE\r?\n/g) || []).length }; };
      try { await a.files.exportKantteilDxf(w); } finally { a.files.saveText = orig; }
      const sh = r.bodies.find((b) => b.fid === w.id)?.meta.sheet;
      return { next: d.features[d.features.indexOf(w) + 1]?.type, ok: r.status[tf.id]?.ok, info: r.status[tf.id]?.info, width: sh?.flatModel?.width, dxf: got };
    });
    await shot("48-konturwalzen");
    step("Blech: Ecke schließen, Stanzwerkzeug, Konturwalzen, Trennfuge", ec.ok && /eckeschliessen,stanzung$/.test(ec.types) && ec.holes === 1 && /1 Ecke\(n\) geschlossen/.test(ec.info || "") && kw0.type === "konturwalzen" && kw0.ok && /Trennfuge setzen/.test(kw0.info || "") && kw.next === "trennfuge" && kw.ok && Math.abs(kw.width - (2 * Math.PI * 51 - 1)) < 1e-6 && !!kw.dxf && kw.dxf.poly >= 1, JSON.stringify({ ec, kw0, kw }));
  }

  // Werkzeuge Stufe 49: IGES-Export über den Reiter Export (Blechteil mit Konturwalze von oben)
  {
    await evalApp(() => { const a = window.__werkcad; a.__iges = null; a.__igesSave = a.files.saveText; a.files.saveText = async (text, name) => { a.__iges = { name, lines: text.split("\r\n").filter(Boolean), t144: (text.match(/^\s*144\s/gm) || []).length }; }; });
    await page.locator("#ribbon .rb-tab", { hasText: /^Export$/ }).click();
    await rbClick("IGES");
    await idle(60000);
    await page.waitForFunction(() => window.__werkcad.__iges, null, { timeout: 60000 });
    const ig = await evalApp(() => { const a = window.__werkcad, g = a.__iges; a.files.saveText = a.__igesSave; return { name: g.name, n: g.lines.length, all80: g.lines.every((l) => l.length === 80), last: g.lines.at(-1).slice(72), t144: g.t144 }; });
    await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
    step("IGES-Export", /\.igs$/.test(ig.name) && ig.all80 && ig.last === "T      1" && ig.t144 > 10, JSON.stringify(ig));
  }

  // Werkzeuge Stufe 50: Schraubenverbindung durch zwei Platten über das Menüband, Stückliste mit Normbezeichnung
  {
    await evalApp(() => {
      const a = window.__werkcad;
      a.newPart("Verschraubt");
      const P = (id, x, y) => ({ id, x, y });
      const rect = (id, z) => ({ type: "sketch", id, name: id, plane: { ref: "XY" }, offset: String(z), points: [P(id + 1, 0, 0), P(id + 2, 100, 0), P(id + 3, 100, 60), P(id + 4, 0, 60)], entities: [[1, 2], [2, 3], [3, 4], [4, 1]].map(([p, q]) => ({ id: id + "l" + p, type: "line", p1: id + p, p2: id + q })), constraints: [] });
      a.addFeature(rect("sv1", 0), { select: false });
      a.addFeature({ type: "extrude", id: "sve1", sketch: "sv1", distance: "10", op: "new" }, { select: false });
      a.addFeature(rect("sv2", 10), { select: false });
      a.addFeature({ type: "extrude", id: "sve2", sketch: "sv2", distance: "15", op: "new" }, { select: false });
      a.addFeature({ type: "sketch", id: "svp", name: "Schraubenpunkte", plane: { ref: "XY" }, offset: "25", points: [P("q1", 20, 30), P("q2", 80, 30)], entities: [{ id: "qe1", type: "point", p: "q1" }, { id: "qe2", type: "point", p: "q2" }], constraints: [] }, { select: false });
    });
    await idle(60000);
    await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
    await rbClick("Schraubenverbindung");
    await idle(60000);
    const sv = await evalApp(() => {
      const a = window.__werkcad, r = a.results.get(a.activeId), f = a.activeDoc().features.at(-1);
      return { type: f.type, sketch: f.sketch, st: r.status[f.id], norm: r.bodies.filter((b) => b.meta?.norm).map((b) => b.meta.norm.designation), panel: [...document.querySelectorAll("#props .section h3")].map((x) => x.textContent) };
    });
    await evalApp(() => { const v = window.__werkcad.viewer; v.setView("iso", { animate: false }); v.fit(); });
    await shot("50-schraubenverbindung");
    step("Schraubenverbindung", sv.type === "schraubverbindung" && sv.sketch === "svp" && sv.st.ok && /2 × M12 x 45, Klemmlänge 25 mm/.test(sv.st.info) && sv.norm.length === 8 && sv.norm.includes("Sechskantschraube ISO 4017 - M12 x 45 - 8.8") && sv.panel.includes("Schraubenverbindung"), JSON.stringify(sv));
  }

  // Werkzeuge Stufe 51: Kontaktsatz mit Kontaktlöser – Klotz am Drehgelenk hält am festen Klotz an; Bewegung als Video
  {
    await evalApp(() => {
      const a = window.__werkcad;
      a.newPart("Klotz");
      const P = (id, x, y) => ({ id, x, y });
      a.addFeature({ type: "sketch", id: "kk", name: "kk", plane: { ref: "XY" }, points: [P("k1", 0, 0), P("k2", 20, 0), P("k3", 20, 20), P("k4", 0, 20)], entities: [[1, 2], [2, 3], [3, 4], [4, 1]].map(([p, q]) => ({ id: "kl" + p, type: "line", p1: "k" + p, p2: "k" + q })), constraints: [] }, { select: false });
      a.addFeature({ type: "extrude", id: "kke", sketch: "kk", distance: "20", op: "new" }, { select: false });
      const part = a.activeId, asm = a.newAssembly();
      a.edit("Komponenten", () => {
        asm.components.push({ id: "kf", part, name: "Klotz:1", pos: [10, 40, 0], rot: [0, 0, 0], fixed: true });
        asm.components.push({ id: "kb", part, name: "Klotz:2", pos: [30, 0, 0], rot: [0, 0, 0], joint: { p: [0, 0, 0], d: [0, 0, 1], angle: 0, min: 0, max: 90 } });
      });
      a.sel = { type: "component", id: "kf", ids: ["kb"] };
    });
    await idle(120000);
    await page.locator("#ribbon .rb-tab", { hasText: "Zusammenfügen" }).click();
    await rbClick("Kontaktsatz");
    await rbClick("Kontaktlöser");
    const ks = await evalApp(async () => {
      const a = window.__werkcad, asm = a.activeDoc(), c = asm.components.find((x) => x.id === "kb");
      const r = { set: asm.components.filter((x) => x.contact).map((x) => x.id).join(), solver: !!asm.contactSolver };
      const lim = await a.props.contactLimits(asm, c);
      r.max = lim && Math.round(lim.max * 10) / 10; r.hit = lim?.hitMax; r.min = lim?.min;
      r.anim = await a.props.animateJoints(null, { duration: 300 });
      const orig = a.files.saveBinary; let saved = null;
      a.files.saveBinary = async (buf, name) => { saved = { name, size: buf.length }; };
      try { r.video = await a.props.recordMotion({ duration: 800 }); } finally { a.files.saveBinary = orig; }
      r.saved = saved;
      return r;
    });
    await shot("51-kontaktsatz");
    step("Kontaktsatz und Bewegung als Video", ks.set === "kf,kb" && ks.solver && ks.hit === true && ks.max > 5 && ks.max < 85 && ks.min === 0 && ks.anim === true && !!ks.video && /_Bewegung\.(mp4|webm)$/.test(ks.saved?.name || "") && ks.saved.size > 1000, JSON.stringify(ks));
  }
  // Werkzeuge Stufe 52: iFeature aus einem Bauteil erstellen und über das Menüband in ein anderes einsetzen
  {
    const mk = (h) => evalApp((h) => {
      const a = window.__werkcad;
      a.newPart("iFeature " + h);
      const P = (id, x, y) => ({ id, x, y });
      const rect = (id, name, x, y, w, hh, off) => ({ type: "sketch", id, name, plane: { ref: "XY" }, offset: String(off), points: [P(id + 1, x, y), P(id + 2, x + w, y), P(id + 3, x + w, y + hh), P(id + 4, x, y + hh)], entities: [[1, 2], [2, 3], [3, 4], [4, 1]].map(([p, q]) => ({ id: id + "l" + p, type: "line", p1: id + p, p2: id + q })), constraints: [] });
      a.addFeature(rect("ib", "Basis", 0, 0, 100, 50, 0), { select: false });
      a.addFeature({ type: "extrude", id: "ibe", name: "Block", sketch: "ib", distance: String(h), op: "new" }, { select: false });
      return a.activeId;
    }, h);
    await mk(20);
    await evalApp(() => {
      const a = window.__werkcad;
      a.edit("Parameter", () => { a.activeDoc().params = [{ name: "tt", expr: "5" }]; });
      const P = (id, x, y) => ({ id, x, y });
      a.addFeature({ type: "sketch", id: "it", name: "Taschenskizze", plane: { ref: "XY" }, offset: "20", points: [P("t1", 10, 10), P("t2", 30, 10), P("t3", 30, 20), P("t4", 10, 20)], entities: [[1, 2], [2, 3], [3, 4], [4, 1]].map(([p, q]) => ({ id: "tl" + p, type: "line", p1: "t" + p, p2: "t" + q })), constraints: [] }, { select: false });
      a.addFeature({ type: "extrude", id: "ite", name: "Tasche", sketch: "it", distance: "tt", mode: "reverse", op: "cut" });
      try { localStorage.removeItem("pbcad.ifeatures"); } catch {}
    });
    await idle(60000);
    await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
    await rbClick("iFeature erstellen");
    await page.locator("#modal-root .dialog .field", { hasText: "Name" }).locator("input").fill("Tasche 20x10");
    const exInfo = await evalApp(() => document.querySelector("#modal-root .dialog p.muted")?.textContent || "");
    await page.locator("#modal-root .dialog footer .btn", { hasText: "In Bibliothek speichern" }).click();
    await mk(30);
    await idle(60000);
    await rbClick("iFeature einfügen");
    await page.locator("#modal-root .dialog .field", { hasText: "Abstand" }).locator("input").fill("30");
    await page.locator("#modal-root .dialog .field", { hasText: /^tt/ }).locator("input").fill("8");
    await page.locator("#modal-root .dialog .field", { hasText: /^tt/ }).locator("input").dispatchEvent("change");
    await page.locator("#modal-root .dialog footer .btn", { hasText: "Einfügen" }).click();
    await idle(60000);
    const ifx = await evalApp(() => {
      const a = window.__werkcad, d = a.activeDoc(), r = a.results.get(a.activeId);
      return { lib: JSON.parse(localStorage.getItem("pbcad.ifeatures") || "[]").map((v) => v.name), names: d.features.map((f) => f.name), params: d.params, ok: Object.values(r.status).every((s) => s.ok), vol: Math.round(r.bodies.reduce((s, b) => s + (b.props?.volume || 0), 0)), open: !!document.querySelector("#modal-root .dialog") };
    });
    await shot("52-ifeature");
    step("iFeature erstellen und einfügen", /2 Features \(1 Skizze\), Parameter: tt/.test(exInfo) && ifx.lib.join() === "Tasche 20x10" && ifx.names.join() === "Basis,Block,Taschenskizze,Tasche" && ifx.params?.[0]?.expr === "8" && ifx.ok && ifx.vol === 100 * 50 * 30 - 20 * 10 * 8 && !ifx.open, JSON.stringify({ exInfo, ifx }));
  }
  // Werkzeuge Stufe 53: Schweißbaugruppe aus einer Baugruppe (T-Stoß), Kehlnähte als Körper, Bohrung als Nachbearbeitung
  {
    await evalApp(() => {
      const a = window.__werkcad;
      const P = (id, x, y) => ({ id, x, y });
      const rect = (id, w, hh) => ({ type: "sketch", id, name: id, plane: { ref: "XY" }, offset: "0", points: [P(id + 1, 0, 0), P(id + 2, w, 0), P(id + 3, w, hh), P(id + 4, 0, hh)], entities: [[1, 2], [2, 3], [3, 4], [4, 1]].map(([p, q]) => ({ id: id + "l" + p, type: "line", p1: id + p, p2: id + q })), constraints: [] });
      const mkPart = (name, w, hh, t) => { a.newPart(name); a.addFeature(rect("w" + name, w, hh), { select: false }); a.addFeature({ type: "extrude", id: "we" + name, sketch: "w" + name, distance: String(t), op: "new" }, { select: false }); return a.activeId; };
      const pl = mkPart("Grundplatte", 100, 60, 10), st = mkPart("Steg", 10, 60, 50);
      const asm = a.newAssembly();
      a.edit("Komponenten", () => {
        asm.name = "Konsole";
        asm.components.push({ id: "wc1", part: pl, name: "Grundplatte:1", pos: [0, 0, 0], rot: [0, 0, 0], fixed: true });
        asm.components.push({ id: "wc2", part: st, name: "Steg:1", pos: [45, 0, 10], rot: [0, 0, 0] });
      });
    });
    await idle(120000);
    await page.locator("#ribbon .rb-tab", { hasText: "Zusammenfügen" }).click();
    await rbClick("Schweißbaugruppe");
    await idle(120000);
    const wb0 = await evalApp(() => { const a = window.__werkcad, d = a.activeDoc(), r = a.results.get(a.activeId); return { kind: d.kind, name: d.name, first: d.features[0]?.type, st: r?.status[d.features[0].id], bodies: r?.bodies.length }; });
    await evalApp(() => {
      const a = window.__werkcad;
      a.addFeature({ type: "naht", name: "Kehlnähte", kind: "kehl", a: "4", side: "beide", bead: true, edges: [{ p: [45, 30, 10], type: "LINE" }, { p: [55, 30, 10], type: "LINE" }] }, { select: false });
      a.addFeature({ type: "sketch", id: "wbs", name: "Bohrbild", plane: { ref: "XY" }, offset: "0", points: [{ id: "wq", x: 20, y: 30 }], entities: [{ id: "wqe", type: "point", p: "wq" }], constraints: [] }, { select: false });
      a.addFeature({ type: "hole", name: "Bohrung", sketch: "wbs", diameter: "10", extent: "through", direction: "both" });
    });
    await idle(120000);
    const wb = await evalApp(() => {
      const a = window.__werkcad, d = a.activeDoc(), r = a.results.get(a.activeId);
      a.selectFeature(d.features[0].id); a.props.render();
      return { ok: Object.values(r.status).every((s) => s.ok), bodies: r.bodies.length, weld: r.bodies.filter((b) => b.meta?.weld).length, vol: Math.round(r.bodies.reduce((s, b) => s + (b.props?.volume || 0), 0)), info: r.status[d.features[1].id]?.info, panel: document.querySelector("#props")?.textContent || "" };
    });
    await evalApp(() => { const v = window.__werkcad.viewer; v.setView("iso", { animate: false }); v.fit(); });
    await shot("53-schweissbaugruppe");
    const z = 4 * Math.SQRT2, expect = Math.round(100 * 60 * 10 + 10 * 60 * 50 + 60 * z * z - Math.PI * 25 * 10);
    step("Schweißbaugruppe", wb0.kind === "part" && wb0.name === "Konsole geschweißt" && wb0.first === "schweissbaugruppe" && wb0.st?.ok && wb0.bodies === 2 && wb.ok && wb.bodies === 3 && wb.weld === 1 && Math.abs(wb.vol - expect) <= 2 && /Nahtkörper 1,92 cm³/.test(wb.info || "") && /Schweißnähte1 Feature/.test(wb.panel) && /Nachbearbeitung2 Features/.test(wb.panel), JSON.stringify({ wb0, wb: { ...wb, panel: wb.panel.slice(0, 300) }, expect }));
  }
  // Werkzeuge Stufe 54: Bereichseigenschaften der Skizze, Entformungsanalyse am Bauteil (Schweißbaugruppe von oben)
  {
    await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
    await rbClick("Entformungsanalyse");
    await page.locator("#modal-root .dialog footer .btn", { hasText: "Anzeigen" }).click();
    await idle(30000);
    const da = await evalApp(() => {
      const a = window.__werkcad, v = a.viewer, m = v.pickables.map((p) => p.mesh);
      return { on: v.draftOn, colored: m.length > 0 && m.every((x) => x.material.vertexColors && x.geometry.getAttribute("color")), toast: [...document.querySelectorAll("#toasts .toast")].map((t) => t.textContent).find((t) => /Entformung Z\+/.test(t)) || "" };
    });
    await shot("54-entformung");
    await rbClick("Entformungsanalyse");
    const daOff = await evalApp(() => { const v = window.__werkcad.viewer; return { on: v.draftOn, plain: v.pickables.every((p) => !p.mesh.material.vertexColors) }; });
    await evalApp(() => {
      const a = window.__werkcad;
      a.newPart("Bereich");
      const P = (id, x, y) => ({ id, x, y });
      a.addFeature({ type: "sketch", id: "rq", name: "Querschnitt", plane: { ref: "XY" }, offset: "0", points: [P("r1", 0, 0), P("r2", 100, 0), P("r3", 100, 40), P("r4", 0, 40)], entities: [[1, 2], [2, 3], [3, 4], [4, 1]].map(([p, q]) => ({ id: "rl" + p, type: "line", p1: "r" + p, p2: "r" + q })), constraints: [] });
    });
    await idle(30000);
    await evalApp(() => { const a = window.__werkcad; a.editSketch?.("rq"); });
    await idle(30000);
    const mode = await evalApp(() => window.__werkcad.mode);
    if (mode === "sketch") {
      await rbClick("Bereichseigenschaften");
    } else {
      await evalApp(() => { const a = window.__werkcad; a.sel = { type: "feature", id: "rq" }; });
      await rbClick("Bereichseigenschaften");
    }
    const rpd = await evalApp(() => { const t = document.querySelector("#modal-root .dialog")?.textContent || ""; document.querySelectorAll("#modal-root .dialog footer .btn").forEach((b) => { if (b.textContent === "Schließen") b.click(); }); return t; });
    if (mode === "sketch") await evalApp(() => window.__werkcad.finishSketch?.());
    await idle(30000);
    step("Bereichseigenschaften und Entformungsanalyse", da.on && da.colored && /Zugseite/.test(da.toast) && !daOff.on && daOff.plain && /Fläche4\.000 mm²/.test(rpd) && /Ix \(um Schwerpunkt, ∥ X\)533\.333,3 mm⁴/.test(rpd), JSON.stringify({ da, daOff, mode, rpd: rpd.slice(0, 400) }));
  }
  // Werkzeuge Stufe 55: Konstruktions-Assistent – Welle, Stirnrad, Lager, Druckfeder über das Menüband
  {
    await evalApp(() => window.__werkcad.newPart("Antrieb"));
    await idle(30000);
    await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
    for (const label of ["Welle", "Stirnrad", "Lager", "Druckfeder"]) {
      await rbClick(label);
      await idle(60000);
    }
    const ka = await evalApp(() => {
      const a = window.__werkcad, d = a.activeDoc(), r = a.results.get(a.activeId);
      return { types: d.features.map((f) => f.type).join(), st: d.features.map((f) => r.status[f.id]), bodies: r.bodies.length, norm: r.bodies.filter((b) => b.meta?.norm).map((b) => b.meta.norm.designation), panel: [...document.querySelectorAll("#props .section h3")].map((x) => x.textContent) };
    });
    await evalApp(() => { const v = window.__werkcad.viewer; v.setView("iso", { animate: false }); v.fit(); });
    await shot("55-konstruktion");
    step("Konstruktions-Assistent", ka.types === "welle,zahnrad,lager,feder" && ka.st.every((x) => x?.ok) && ka.bodies === 4 && ka.norm.includes("Rillenkugellager DIN 625 - 6204") && ka.norm.includes("Druckfeder 2 x 18 x 40") && ka.panel.some((t) => /Druckfeder/.test(t)) && /d 48, da 52, df 43 mm/.test(ka.st[1]?.info || ""), JSON.stringify(ka));
  }






  // Werkzeuge Stufe 42: abgeleitetes Bauteil gespiegelt, 3D-Skizze, Feature duplizieren/ziehen, Komponente spiegeln
  {
    const q = await evalApp(async () => {
      const a = window.__werkcad;
      const A = a.newPart("Winkel links");
      a.edit("Quader", () => A.features.push(
        { id: "qs", type: "sketch", name: "Skizze 1", plane: { ref: "XY" }, offset: "0", points: [{ id: "q1", x: 0, y: 0 }, { id: "q2", x: 40, y: 0 }, { id: "q3", x: 40, y: 20 }, { id: "q4", x: 0, y: 20 }], entities: [{ id: "l1", type: "line", p1: "q1", p2: "q2" }, { id: "l2", type: "line", p1: "q2", p2: "q3" }, { id: "l3", type: "line", p1: "q3", p2: "q4" }, { id: "l4", type: "line", p1: "q4", p2: "q1" }], constraints: [] },
        { id: "qe", type: "extrude", name: "Extrusion 1", sketch: "qs", distance: "10" }));
      return A.id;
    });
    await idle(60000);
    await evalApp(() => window.__werkcad.newPart("Winkel rechts"));
    await idle();
    await page.locator("#ribbon .rb-tab", { hasText: "Verwalten" }).click();
    await rbClick("Abgeleitetes Bauteil");
    await idle(60000);
    const der = await evalApp(async (srcId) => {
      const a = window.__werkcad, d = a.activeDoc(), f = d.features[0];
      a.edit("Quelle", () => { f.source = srcId; f.mirror = "YZ"; });
      return f.id;
    }, q);
    await idle(60000);
    await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
    await rbClick("3D-Skizze");
    await idle(60000);
    const s42 = await evalApp(() => {
      const a = window.__werkcad, d = a.activeDoc(), r = a.results.get(d.id);
      const before = d.features.map((f) => f.id).join();
      a.moveFeatureTo(d.features[1].id, 0); // 3D-Skizze vor das abgeleitete Teil: erlaubt
      const moved = d.features[0].type;
      a.duplicateFeature(d.features[1].id);
      return { ok: Object.values(r.status).every((x) => x.ok), info: r.status[d.features.find((f) => f.type === "abgeleitet").id]?.info, paths: (r.paths3d || []).length, moved, n: d.features.length, before };
    });
    await idle(60000);
    const s42b = await evalApp(() => { const a = window.__werkcad, d = a.activeDoc(), r = a.results.get(d.id); return { bodies: r.bodies.length, ok: Object.values(r.status).every((x) => x.ok) }; });
    await shot("42-abgeleitet");
    // Komponente spiegeln in einer Baugruppe
    await evalApp((srcId) => { const a = window.__werkcad; const asm = a.newAssembly(); a.edit("Bauteil", () => asm.components.push({ id: "cm1", part: srcId, name: "Winkel links:1", pos: [100, 0, 0], rot: [0, 0, 0] })); a.sel = { type: "component", id: "cm1" }; }, q);
    await idle(60000);
    await evalApp(() => window.__werkcad.props.mirrorComponent("cm1"));
    await page.locator(".dialog button", { hasText: /^an YZ$/ }).click();
    await idle(60000);
    const mc = await evalApp(() => { const a = window.__werkcad, asm = a.activeDoc(); const c = asm.components.at(-1), p = a.doc(c.part); return { n: asm.components.length, pos: c.pos, part: p?.name, type: p?.features?.[0]?.type, normal: p?.features?.[0]?.mirrorN }; });
    await shot("42-komponente-gespiegelt");
    step("Abgeleitet, 3D-Skizze, Feature duplizieren/ziehen, Komponente spiegeln", !!der && s42.ok && /gespiegelt/.test(s42.info || "") && s42.paths === 1 && s42.moved === "skizze3d" && s42.n === 3 && s42b.ok && mc.n === 2 && mc.pos[0] === -100 && mc.type === "abgeleitet" && /gespiegelt/.test(mc.part), JSON.stringify({ s42, s42b, mc }));
  }

  // ---- Stufe 43: Variantentabelle, Regeln, Makros, Sprache ----
  {
    const fid = await evalApp(() => {
      const a = window.__werkcad;
      const F = a.newPart("Lasche T");
      a.edit("Quader", () => {
        F.params = [{ name: "L", expr: "40" }, { name: "H", expr: "10" }];
        F.features.push(
          { id: "ts", type: "sketch", name: "Skizze 1", plane: { ref: "XY" }, offset: "0", points: [{ id: "t1", x: 0, y: 0 }, { id: "t2", x: 40, y: 0 }, { id: "t3", x: 40, y: 20 }, { id: "t4", x: 0, y: 20 }], entities: [{ id: "u1", type: "line", p1: "t1", p2: "t2" }, { id: "u2", type: "line", p1: "t2", p2: "t3" }, { id: "u3", type: "line", p1: "t3", p2: "t4" }, { id: "u4", type: "line", p1: "t4", p2: "t1" }], constraints: [] },
          { id: "te", type: "extrude", name: "Extrusion 1", sketch: "ts", distance: "H" });
      });
      return F.id;
    });
    await idle(60000);
    await page.locator("#ribbon .rb-tab", { hasText: "Verwalten" }).click();
    await rbClick("Variantentabelle");
    await page.locator(".dialog button", { hasText: /^Zeile hinzufügen$/ }).click();
    await page.locator(".dialog .var-table tbody tr").nth(1).locator("td").nth(3).locator("input").fill("25");
    await page.locator(".dialog .var-table tbody tr").nth(1).locator("td").nth(3).locator("input").press("Tab");
    await shot("43-variantentabelle");
    await page.locator(".dialog button", { hasText: /^Übernehmen und Varianten erzeugen$/ }).click();
    await idle(60000);
    const v43 = await evalApp((fid) => {
      const a = window.__werkcad;
      const vs = a.project.docs.filter((d) => d.variant?.of === fid);
      const blocked = !a.edit("Variante ändern", () => { vs[0].params[1].expr = "99"; });
      a.edit("Name ändern", () => { a.doc(fid).features[1].name = "Grundkörper"; });
      const after = a.project.docs.filter((d) => d.variant?.of === fid);
      return { n: vs.length, names: vs.map((d) => d.name), h2: vs[1]?.params[1].expr, blocked, follow: after[0].features[1].name };
    }, fid);
    // Regeln: Dialog öffnet, Regel per Modell, Meldung in den Eigenschaften
    await evalApp((fid) => window.__werkcad.openDoc(fid), fid);
    await idle(60000);
    await page.locator("#ribbon .rb-tab", { hasText: "Verwalten" }).click();
    await rbClick("Regeln");
    await page.locator(".dialog button", { hasText: /Prüfen und melden/ }).click();
    const ruleRows = await page.locator(".dialog .rule").count();
    await page.locator(".dialog button", { hasText: /^Abbrechen$/ }).click();
    await evalApp((fid) => { const a = window.__werkcad; a.edit("Regel", () => { a.doc(fid).rules = [{ id: "rg1", kind: "pruefen", when: "L > 30", message: "Lasche zu lang", level: "Hinweis" }, { id: "rg2", kind: "unterdruecken", when: "H > 9", feature: "te" }]; }); a.sel = null; a.props.render(); }, fid);
    await idle(60000);
    const r43 = await evalApp((fid) => { const a = window.__werkcad, r = a.results.get(fid); return { msg: r?.rules?.map((m) => m.text), off: r?.ruleOff, props: document.querySelector("#props")?.textContent.includes("Lasche zu lang") }; }, fid);
    await shot("43-regeln");
    // Makro: anlegen, über die Befehlssuche finden und ausführen
    const m43 = await evalApp(() => {
      const a = window.__werkcad;
      const ok = a.prefs.set("werkzeuge.makros", [{ id: "mtest", name: "Ansicht Test", steps: ["view.iso", "view.fit"] }]).ok;
      return ok;
    });
    await evalApp(() => window.__werkcad.commands.exec("app.search"));
    await page.locator(".cmd-palette input").fill("Makro: Ansicht Test");
    const palHit = await page.locator(".cmd-palette").textContent();
    await page.keyboard.press("Escape");
    await page.locator("#ribbon .rb-tab", { hasText: "Verwalten" }).click();
    await rbClick("Makros");
    const macroDlg = await page.locator(".dialog .macro").count();
    await page.locator(".dialog button", { hasText: /^Schließen$/ }).click();
    // Sprache Englisch: Menüband übersetzt, zurück auf Deutsch
    await evalApp(() => window.__werkcad.prefs.set("allgemein.sprache", "en"));
    const en = await page.locator("#ribbon").textContent();
    await evalApp(() => window.__werkcad.prefs.set("allgemein.sprache", "de"));
    const de = await page.locator("#ribbon").textContent();
    step("Variantentabelle, Regeln, Makros, Sprache", v43.n === 2 && v43.h2 === "25" && v43.blocked && v43.follow === "Grundkörper" && ruleRows === 1 && r43.msg?.[0] === "Lasche zu lang" && r43.off?.[0] === "te" && r43.props && m43 && /Ansicht Test/.test(palHit) && macroDlg === 1 && /3D model/.test(en) && /3D-Modell/.test(de) && !/3D model/.test(de), JSON.stringify({ v43, ruleRows, r43, m43, macroDlg, en: en.slice(0, 80) }));
  }

  // ---- Stufe 44: Abhängigkeit platzieren, Bewegung, Blechregel ----
  {
    await evalApp(() => {
      const a = window.__werkcad;
      const asm = a.newAssembly();
      a.edit("Komponenten", () => {
        asm.components.push({ id: "q1", part: "beispiel_platte", name: "Platte:1", pos: [0, 0, 0], rot: [0, 0, 0], fixed: true });
        asm.components.push({ id: "q2", part: "beispiel_platte", name: "Platte:2", pos: [0, 0, 500], rot: [0, 0, 0] });
        asm.components.push({ id: "q3", part: "beispiel_rohr", name: "Rad:1", pos: [800, 0, 0], rot: [0, 0, 0], joint: { p: [800, 0, 0], d: [0, 0, 1], angle: 0, min: -360, max: 360 } });
        asm.components.push({ id: "q4", part: "beispiel_rohr", name: "Rad:2", pos: [1200, 0, 0], rot: [0, 0, 0], joint: { p: [1200, 0, 0], d: [0, 0, 1], angle: 0, min: -360, max: 360 } });
      });
    });
    await idle(120000);
    await page.locator("#ribbon .rb-tab", { hasText: "Zusammenfügen" }).click();
    await rbClick("Abhängigkeit");
    const panel = await page.locator("#props").textContent();
    const p44 = await evalApp(() => {
      const a = window.__werkcad, asm = a.activeDoc();
      const top = a.planarFaces("beispiel_platte").find((f) => f.normal[2] > 0.99);
      a.align.solution = "fluchtend"; a.align.gap = "20";
      a.alignPick({ kind: "face", key: "comp:q2", info: top });
      a.alignPick({ kind: "face", key: "comp:q1", info: top });
      const c = asm.constraints.at(-1);
      return { type: c?.type, z: asm.components.find((x) => x.id === "q2").pos[2], sel: a.sel?.type, err: a.asmErrors?.[c?.id] || null };
    });
    await idle(60000);
    const editor = await page.locator("#props").textContent();
    await shot("44-abhaengigkeit");
    // Bewegung: Rad 1 treibt Rad 2 mit Übersetzung 2
    const m44 = await evalApp(() => {
      const a = window.__werkcad, asm = a.activeDoc();
      const f = a.planarFaces("beispiel_rohr")[0];
      a.beginPlace({ tab: "bewegung", motion: "drehung", ratio: "2", sense: "gleich" });
      a.alignPick({ kind: "face", key: "comp:q3", info: f });
      a.alignPick({ kind: "face", key: "comp:q4", info: f });
      a.sel = { type: "component", id: "q3" };
      a.tree.render(); a.props.render();
      return { motions: (asm.motions || []).length, tree: [...document.querySelectorAll("#browser .node .label")].some((x) => /^Bewegungen \(1\)$/.test(x.textContent)) };
    });
    await page.locator("#props input.joint-angle").evaluate((el) => { el.value = "45"; el.dispatchEvent(new Event("change")); });
    await idle(60000);
    const j44 = await evalApp(() => { const asm = window.__werkcad.activeDoc(); return asm.components.filter((c) => c.joint).map((c) => c.joint.angle); });
    // Blechregel am Kantteil
    await evalApp(() => { const a = window.__werkcad; a.newPart("Blech T"); a.addFeature({ type: "kantteil", legs: "40; 100; 40", angles: "90; 90", ref: "aussen", t: "2", ri: "2", k: "0.33", length: "300", pos: ["0", "0", "0"], view: "gefaltet" }); });
    await idle(60000);
    const ruleSel = page.locator("#props .field", { hasText: "Blechregel" }).locator("select");
    const alu = await ruleSel.locator("option", { hasText: "Alu 2 mm" }).getAttribute("value");
    await ruleSel.selectOption(alu);
    await idle(60000);
    const b44 = await evalApp(() => { const a = window.__werkcad, d = a.activeDoc(), f = d.features.find((x) => x.type === "kantteil"); return { rule: f.sheetRule?.name, mat: d.material, info: a.results.get(d.id)?.status?.[f.id]?.info || "" }; });
    step("Abhängigkeit platzieren, Bewegung, Blechregel", /Abhängigkeit platzieren/.test(panel) && /Passend/.test(panel) && p44.type === "buendig" && Math.abs(p44.z - 20) < 1e-6 && p44.sel === "constraint" && p44.err === null && /Auswahl neu/.test(editor) && /Grenzen verwenden/.test(editor)
      && m44.motions === 1 && m44.tree && j44[0] === 45 && j44[1] === 90 && b44.rule === "Alu 2 mm" && b44.mat === "AlMg3" && /Blechregel Alu 2 mm/.test(b44.info), JSON.stringify({ p44, m44, j44, b44 }));
  }

  // ---- Stufe 45: Stecksystem (Rippe auf Platte) über das Menüband ----
  {
    await evalApp(() => {
      const a = window.__werkcad;
      a.newPart("Steckteil");
      const R = (id, off, x, y, w, hh) => ({ id, type: "sketch", name: id, plane: { ref: "XY" }, offset: String(off), points: [{ id: id + 1, x, y }, { id: id + 2, x: x + w, y }, { id: id + 3, x: x + w, y: y + hh }, { id: id + 4, x, y: y + hh }], entities: [[1, 2], [2, 3], [3, 4], [4, 1]].map(([p, q]) => ({ id: id + "l" + p, type: "line", p1: id + p, p2: id + q })), constraints: [] });
      a.addFeature(R("sp", 0, 0, 0, 200, 100), { select: false });
      a.addFeature({ type: "extrude", sketch: "sp", distance: "5", op: "new" }, { select: false });
      a.addFeature(R("sr", 5, 20, 48, 160, 4), { select: false });
      a.addFeature({ type: "extrude", sketch: "sr", distance: "50", op: "new" }, { select: false });
    });
    await idle(60000);
    await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
    await rbClick("Stecksystem");
    await idle(60000);
    const s45 = await evalApp(() => { const a = window.__werkcad, d = a.activeDoc(), f = d.features.at(-1), r = a.results.get(d.id); return { type: f.type, info: r?.status?.[f.id]?.info || r?.status?.[f.id]?.error || "", props: document.querySelector("#props")?.textContent.includes("Zapfenteil") }; });
    await shot("45-stecksystem");
    step("Stecksystem", s45.type === "stecksystem" && /3 Zapfen 20 × 4 mm/.test(s45.info) && s45.props, JSON.stringify(s45));
  }

  // ---- Stufe 46: Stecksystem zwischen zwei Bauteilen einer Baugruppe ----
  {
    const ids = await evalApp(() => {
      const a = window.__werkcad;
      const R = (id, x, y, w, hh) => ({ id, type: "sketch", name: id, plane: { ref: "XY" }, offset: "0", points: [{ id: id + 1, x, y }, { id: id + 2, x: x + w, y }, { id: id + 3, x: x + w, y: y + hh }, { id: id + 4, x, y: y + hh }], entities: [[1, 2], [2, 3], [3, 4], [4, 1]].map(([p, q]) => ({ id: id + "l" + p, type: "line", p1: id + p, p2: id + q })), constraints: [] });
      const pl = a.newPart("Platte S");
      a.addFeature(R("sp", 0, 0, 200, 200), { select: false });
      a.addFeature({ type: "extrude", sketch: "sp", distance: "5", op: "new" }, { select: false });
      const ri = a.newPart("Rippe S");
      a.addFeature(R("sr", 0, 0, 160, 4), { select: false });
      a.addFeature({ type: "extrude", sketch: "sr", distance: "50", op: "new" }, { select: false });
      const asm = a.newAssembly();
      a.edit("Bauteile", () => {
        asm.components.push({ id: "s1", part: ri.id, name: "Rippe S:1", pos: [100, 20, 5], rot: [0, 0, 90] });
        asm.components.push({ id: "s2", part: pl.id, name: "Platte S:1", pos: [0, 0, 0], rot: [0, 0, 0] });
      });
      a.sel = { type: "component", id: "s1" };
      a.tree.render(); a.props.render(); a.ribbon.render();
      return { pl: pl.id, ri: ri.id };
    });
    await idle(60000);
    await page.locator("#ribbon .rb-tab", { hasText: "Zusammenfügen" }).click();
    await rbClick("Stecksystem");
    await page.locator("#props button", { hasText: "Zapfen und Schlitze erzeugen" }).click();
    await idle(60000);
    const s46 = await evalApp(async ({ pl, ri }) => {
      const a = window.__werkcad, asm = a.activeDoc(), st = asm.steckverbindungen?.[0];
      const P = a.doc(pl), Q = a.doc(ri);
      const rp = await a.kernel.build(P, "normal"), rq = await a.kernel.build(Q, "normal");
      const fz = Q.features.at(-1), fs = P.features.at(-1);
      return { info: st?.info || st?.error || "", z: fz?.type, s: fs?.type, zs: rq.status?.[fz?.id]?.ok, ss: rp.status?.[fs?.id]?.info || rp.status?.[fs?.id]?.error,
        tree: [...document.querySelectorAll("#browser .node .label")].some((x) => x.textContent === "Stecksystem 1") };
    }, ids);
    await shot("46-stecksystem-baugruppe");
    // Löschen entfernt die Features in beiden Bauteilen
    await page.locator("#props button", { hasText: /^Löschen$/ }).click();
    await idle(60000);
    const d46 = await evalApp(({ pl, ri }) => { const a = window.__werkcad; return [a.doc(pl), a.doc(ri)].map((d) => d.features.filter((f) => f.steck).length); }, ids);
    step("Stecksystem in der Baugruppe", /3 Zapfen 20 × 4 mm/.test(s46.info) && s46.z === "steckzapfen" && s46.s === "steckschlitz" && s46.zs === true && /3 Schlitze aus/.test(s46.ss || "") && s46.tree && d46[0] === 0 && d46[1] === 0, JSON.stringify({ s46, d46 }));
  }

  // Bedienung: Tooltip-Karte im Menüband, Markierungsmenü (Rechtsklick), Mini-Werkzeugleiste an der Auswahl
  {
    await evalApp(() => { const a = window.__werkcad; a.openDoc("beispiel_platte"); });
    await idle();
    await evalApp(() => { const v = window.__werkcad.viewer; v.setView("iso", { animate: false }); v.fit(); });
    await page.locator("#ribbon .rb-tab", { hasText: "3D-Modell" }).click();
    await page.locator("#ribbon .rb-panel").getByRole("button", { name: "Extrusion", exact: true }).hover();
    await page.waitForTimeout(800);
    const tip = await page.locator(".tip-card").textContent().catch(() => "");
    await page.mouse.move(800, 600);
    const vb = await page.locator("#viewer canvas").first().boundingBox();
    const at = await evalApp(([x0, y0, w, hh]) => {
      const v = window.__werkcad.viewer;
      for (const fy of [0.5, 0.45, 0.55, 0.4, 0.6]) for (const fx of [0.5, 0.45, 0.55, 0.4, 0.6]) {
        const hit = v.pick(x0 + w * fx, y0 + hh * fy, { edges: false, faces: true });
        if (hit?.info?.type === "PLANE") return { x: x0 + w * fx, y: y0 + hh * fy };
      }
      return null;
    }, [vb.x, vb.y, vb.width, vb.height]);
    await page.mouse.click(at.x, at.y, { button: "right" });
    await page.waitForTimeout(300);
    const ring = await page.locator(".marking .mk-item").allTextContents();
    const list = await page.locator(".marking .mk-list button").count();
    await shot("47-markierungsmenue");
    await page.keyboard.press("Escape");
    const closed = await page.locator(".marking").count() === 0;
    await evalApp(() => window.__werkcad.prefs.set("ansicht.miniLeiste", true));
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(300);
    const mini = await page.locator(".mini-bar button").evaluateAll((b) => b.map((x) => x.getAttribute("aria-label")));
    await shot("48-mini-leiste");
    await page.locator(".mini-bar button[aria-label='Normal zur Fläche']").click();
    const miniGone = await page.locator(".mini-bar").count() === 0;
    await evalApp(() => window.__werkcad.prefs.set("ansicht.miniLeiste", false));
    step("Tooltip, Markierungsmenü, Mini-Leiste", /Skizzenkontur/.test(tip) && /\(?E\)?/.test(tip) && ring.length >= 6 && ring.includes("Skizze auf dieser Fläche") && list > 0 && closed
      && mini.includes("Skizze auf Fläche") && mini.includes("Wandung") && miniGone, JSON.stringify({ tip, ring, list, closed, mini, miniGone }));
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
