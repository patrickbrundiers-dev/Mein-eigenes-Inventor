// Bilder zur Generator-Prüfung: rendert die Netze aus tools/generator-pruefung.mjs mit three.js in Chromium.
// Farben: grau = in Ordnung, rot = Kollision, orange = loses Teil, blau = Normteile (Schrauben).
// Aufruf: node tools/generator-bilder.mjs <Ordner mit *.mesh.json> [Filter] [Ansicht-JSON]
// Ansicht je Fall optional: { "<name>": { dir: [x, y, z], zoom: 1, focus: "<Teilname-Regex>" } }

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright-core";

const dir = process.argv[2] || "pruef-out";
const filter = process.argv[3] ? new RegExp(process.argv[3]) : null;
const views = process.argv[4] ? JSON.parse(fs.readFileSync(process.argv[4], "utf8")) : {};
const root = path.resolve(".");

const html = `<!doctype html><html><body style="margin:0;background:#fff"><canvas id="c" width="1400" height="1000"></canvas>
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from "three";
window.draw = (meshes, view) => {
  const r = new THREE.WebGLRenderer({ canvas: document.getElementById("c"), antialias: true, preserveDrawingBuffer: true });
  r.setClearColor(0xffffff);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(1, -2, 3); scene.add(sun);
  const box = new THREE.Box3();
  const focus = view.focus ? new RegExp(view.focus) : null;
  for (const m of meshes) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(m.v, 3));
    g.setIndex(m.t); g.computeVertexNormals();
    const col = m.flag === "kollision" ? 0xe03030 : m.flag === "lose" ? 0xff9a00 : m.norm ? 0x3070e0 : 0xb8bcc4;
    scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: col, metalness: 0.1, roughness: 0.7, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })));
    const e = new THREE.BufferGeometry(); e.setAttribute("position", new THREE.Float32BufferAttribute(m.l, 3));
    scene.add(new THREE.LineSegments(e, new THREE.LineBasicMaterial({ color: 0x30343a })));
    if (!focus || focus.test(m.name)) { g.computeBoundingBox(); box.union(g.boundingBox); }
  }
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()).length() / 2 / (view.zoom || 1);
  const d = new THREE.Vector3(...(view.dir || [1, -1.4, 0.8])).normalize();
  const cam = new THREE.OrthographicCamera(-s * 1.4, s * 1.4, s, -s, -1e6, 1e6);
  cam.up.set(0, 0, 1); cam.position.copy(c.clone().add(d.multiplyScalar(s * 4))); cam.lookAt(c);
  r.render(scene, cam);
  return true;
};
window.ready = true;
</script></body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === "/") { res.setHeader("content-type", "text/html"); return res.end(html); }
  const f = path.join(root, decodeURIComponent(req.url));
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader("content-type", f.endsWith(".js") ? "text/javascript" : "application/octet-stream");
  fs.createReadStream(f).pipe(res);
});
await new Promise((ok) => server.listen(0, ok));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".mesh.json") && (!filter || filter.test(f)));
for (const f of files) {
  const name = f.replace(/\.mesh\.json$/, "");
  const meshes = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const vs = Object.entries(views).filter(([k]) => k === name || k.startsWith(name + "@"));
  for (const [key, view] of vs.length ? vs : [[name, {}]]) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.ready);
    await page.evaluate(([m, v]) => window.draw(m, v), [meshes, view]);
    await page.locator("#c").screenshot({ path: path.join(dir, key.replace("@", "-") + ".png") });
    await page.close();
    console.log("Bild", key);
  }
}
await browser.close();
server.close();
