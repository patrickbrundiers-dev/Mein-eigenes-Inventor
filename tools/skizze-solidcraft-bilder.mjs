// Skizze an SolidCraft angelehnt (08.11.2026): Abläufe im Browser prüfen und Bilder speichern.
// Vorher `npm run build`. Aufruf: node tools/skizze-solidcraft-bilder.mjs [ausgabeordner] [präfix]
// Läuft auch auf einem älteren Stand (dann fehlen Funktionen, die Bilder dienen als »vorher«).
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { serve } from "./serve.mjs";

const outDir = path.resolve(process.argv[2] || "skizze-out");
const prefix = process.argv[3] || "";
fs.mkdirSync(outDir, { recursive: true });
const port = 4196;
const srv = await serve(port);
const launchOpts = { headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] };
let browser;
try { browser = await chromium.launch({ ...launchOpts, channel: "chrome" }); }
catch { browser = await chromium.launch({ ...launchOpts, executablePath: process.env.CHROME_PATH }); }
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [], results = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`http://localhost:${port}/index.html`);
await page.waitForFunction(() => !!window.__werkcad, null, { timeout: 30000 });
await page.evaluate(() => window.__werkcad.kernel.ready);
const app = (fn, arg) => page.evaluate(fn, arg);
const idle = () => page.waitForFunction(() => !window.__werkcad.kernel.busy, null, { timeout: 60000 }).then(() => page.waitForTimeout(400));
const shot = async (name) => { await page.waitForTimeout(250); await page.screenshot({ path: path.join(outDir, `${prefix}${name}.png`) }); };
const check = (name, ok, info = "") => { results.push({ name, ok }); console.log(ok ? "✔" : "✘", name, info); };

const newSketch = async (name, geo) => {
  await app(() => { window.__werkcad.files.confirmDiscard = async () => true; });
  await app((n) => window.__werkcad.newPart(n), name);
  await idle();
  await page.keyboard.press("s");
  await page.waitForTimeout(200);
  await page.locator("#props button", { hasText: "XY-Ebene" }).click();
  await page.waitForTimeout(700);
  if (geo) await app((g) => window.__werkcad.sketcher.commit("Testgeometrie", (sk) => { sk.points.push(...g.points); sk.entities.push(...g.entities); sk.constraints.push(...(g.constraints || [])); }), geo);
  await zoom(geo ? 1.6 : 0);
};
// Ansicht auf die Skizze: Rahmen um alle Punkte, k = Rand (0 = Bereich ±60 mm)
async function zoom(k) {
  await app((k) => {
    const s = window.__werkcad.sketcher, pts = s.sk.points;
    let x0 = -60, y0 = -60, x1 = 60, y1 = 60;
    if (k) { x0 = Math.min(...pts.map((p) => p.x)); x1 = Math.max(...pts.map((p) => p.x)); y0 = Math.min(...pts.map((p) => p.y)); y1 = Math.max(...pts.map((p) => p.y)); const m = Math.max(x1 - x0, y1 - y0) * (k - 1) / 2 + 10; x0 -= m; x1 += m; y0 -= m; y1 += m; }
    window.__werkcad.viewer.fitPoints([[x0, y0, 0], [x1, y1, 0]]);
  }, k);
  await page.waitForTimeout(400);
}
const cv = async () => page.locator("#viewer canvas").boundingBox();
const at = async (x, y) => { const b = await cv(); const [sx, sy] = await app(([x, y]) => window.__werkcad.sketcher.S(x, y), [x, y]); return [b.x + sx, b.y + sy]; };
const clickAt = async (x, y, opts) => { const [cx, cy] = await at(x, y); await page.mouse.click(cx, cy, opts); await page.waitForTimeout(150); };

// 1) Maß Linie → Kreisrand (Spalt) statt bis zur Mitte
await newSketch("Kantenmaß", {
  points: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 80, y: 0 }, { id: "m", x: 40, y: 25 }],
  entities: [{ id: "L", type: "line", p1: "a", p2: "b" }, { id: "K", type: "circle", c: "m", r: 8 }],
});
await app(() => window.__werkcad.sketcher.setTool("dimension"));
await clickAt(20, 0);
await clickAt(40 + 8 * Math.cos(-2), 25 + 8 * Math.sin(-2));
await clickAt(60, 10);
await page.waitForTimeout(200);
await shot("1-mass-kreisrand-eingabe");
const val = await page.locator(".dim-input input").inputValue().catch(() => null);
await page.keyboard.press("Enter");
await page.waitForTimeout(200);
const dims = await app(() => window.__werkcad.sketcher.sk.constraints.filter((c) => c.value !== undefined && c.type !== "fix").map((c) => ({ type: c.type, value: c.value })));
await shot("2-mass-kreisrand");
check("Linie–Kreis misst bis zum Rand (17, nicht 25)", val === "17" && dims.some((d) => d.type === "edgeDistance"), JSON.stringify({ val, dims }));
await page.keyboard.press("Escape");

// 2) Erstes Maß skaliert die Zeichnung
await newSketch("Erstes Maß", {
  points: [{ id: "r1", x: 0, y: 0 }, { id: "r2", x: 30, y: 0 }, { id: "r3", x: 30, y: 20 }, { id: "r4", x: 0, y: 20 }],
  entities: ["r1r2", "r2r3", "r3r4", "r4r1"].map((k, i) => ({ id: "s" + i, type: "line", p1: k.slice(0, 2), p2: k.slice(2) })),
  constraints: [{ id: "c0", type: "coincident", p: "r1", q: "O" }],
});
await shot("3-erstes-mass-vorher");
await app(() => window.__werkcad.sketcher.setTool("dimension"));
await clickAt(15, 0);
await clickAt(15, -8);
await page.waitForTimeout(150);
await page.keyboard.type("60");
await page.keyboard.press("Enter");
await page.waitForTimeout(250);
await zoom(1.6);
const h = await app(() => { const p = window.__werkcad.sketcher.sk.points.find((q) => q.id === "r3"); return { x: p.x, y: p.y }; });
await shot("4-erstes-mass-nachher");
check("Erstes Maß 60 skaliert das Rechteck auf 60 × 40", Math.abs(h.x - 60) < 1e-6 && Math.abs(h.y - 40) < 1e-6, JSON.stringify(h));

// 3) »breite = 25« im Maßfeld legt den Parameter an; Klick auf das Maß (Bemaßung aktiv) öffnet den Wert
const dimBox = await app(() => { const s = window.__werkcad.sketcher, c = s.sk.constraints.find((k) => k.type === "length" || (k.type === "distance" && k.dir === "h")); const b = s.dimBoxes.find((q) => q.id === c?.id); return b ? { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 } : null; });
let opened = false;
if (dimBox) {
  await app(() => window.__werkcad.sketcher.setTool("dimension"));
  const b = await cv();
  dimBox.el = await app(([x, y]) => document.elementFromPoint(x, y)?.tagName + "." + document.elementFromPoint(x, y)?.getAttribute("class"), [b.x + dimBox.x, b.y + dimBox.y]);
  await page.mouse.click(b.x + dimBox.x, b.y + dimBox.y);
  await page.waitForTimeout(200);
  opened = (await page.locator(".dim-input input").count()) > 0;
  if (opened) {
    await page.locator(".dim-input input").fill("breite = 50");
    await shot("5-parameter-im-massfeld");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
  }
}
const par = await app(() => { const a = window.__werkcad, part = a.sketcher.part; return { params: (part.params || []).map((q) => q.name + "=" + q.expr), dims: a.sketcher.sk.constraints.filter((k) => k.value !== undefined && k.type !== "fix").map((k) => k.value) }; });
check("Klick mit Bemaßung öffnet das Maß, »breite = 50« legt Parameter an", opened && par.params.includes("breite=50") && par.dims.includes("breite"), JSON.stringify({ dimBox, opened, ...par }));
await page.keyboard.press("Escape");

// 4) Umschalt+Klick im Verlängern: zwei Linien bis zum Schnitt
await newSketch("Bis Schnitt", {
  points: [{ id: "a1", x: 0, y: 0 }, { id: "a2", x: 30, y: 0 }, { id: "b1", x: 50, y: 10 }, { id: "b2", x: 50, y: 40 }],
  entities: [{ id: "A", type: "line", p1: "a1", p2: "a2" }, { id: "B", type: "line", p1: "b1", p2: "b2" }],
});
await shot("6-verlaengern-vorher");
await app(() => window.__werkcad.sketcher.setTool("extend"));
await page.keyboard.down("Shift");
await clickAt(25, 0);
await clickAt(50, 15);
await page.keyboard.up("Shift");
await page.waitForTimeout(200);
const corner = await app(() => { const s = window.__werkcad.sketcher, P = (id) => s.sk.points.find((p) => p.id === id); const A = s.sk.entities.find((e) => e.id === "A"), B = s.sk.entities.find((e) => e.id === "B"); return A && B ? { a: P(A.p2), b: P(B.p1) } : null; });
await shot("7-verlaengern-bis-schnitt");
check("Umschalt+Klick: beide Linien treffen sich bei (50, 0)", !!corner && [corner.a, corner.b].every((p) => p && Math.abs(p.x - 50) < 1e-6 && Math.abs(p.y) < 1e-6), JSON.stringify(corner));
await page.keyboard.press("Escape");

// 5) Verweilen am letzten Linienpunkt → Tangentialbogen
await app(() => window.__werkcad.prefs.set("skizze.verweilenBogen", true));
await newSketch("Tangentialbogen");
await app(() => window.__werkcad.sketcher.setTool("line"));
await clickAt(0, 0);
await clickAt(40, 0);
let [px, py] = await at(40, 0);
await page.mouse.move(px + 80, py - 60, { steps: 4 });
await page.waitForTimeout(80);
await page.mouse.move(px + 1, py, { steps: 4 });
await page.waitForTimeout(500);
const arcMode = await app(() => !!window.__werkcad.sketcher.state?.arcMode);
await page.mouse.move(px + 60, py - 60, { steps: 4 });
await page.waitForTimeout(150);
await shot("8-verweilen-tangentialbogen");
await clickAt(40, 40);
await page.keyboard.press("Escape");
const arcs = await app(() => { const s = window.__werkcad.sketcher; return { arcs: s.sk.entities.filter((e) => e.type === "arc").length, tan: s.sk.constraints.filter((c) => c.type === "tangentAt").length, ok: s.solve().ok }; });
check("Verweilen schaltet auf Tangentialbogen", arcMode && arcs.arcs === 1 && arcs.tan === 1 && arcs.ok, JSON.stringify({ arcMode, ...arcs }));
await app(() => window.__werkcad.prefs.set("skizze.verweilenBogen", false));
await page.keyboard.press("Escape");
await idle();
await shot("9-browser-skizzenzustand");

console.log(errors.length ? "Fehler im Browser:\n" + errors.join("\n") : `Bilder in ${outDir}`);
await browser.close();
srv.close();
process.exit(errors.length || results.some((r) => !r.ok) ? 1 : 0);
