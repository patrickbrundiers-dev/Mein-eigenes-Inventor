// Baut die Oberfläche (dist/) mit esbuild
import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dev = process.argv.includes("--dev");
const out = "dist";
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const common = {
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  sourcemap: dev ? "inline" : "linked",
  minify: !dev,
  legalComments: "linked",
  logLevel: "info",
  define: { "process.env.NODE_ENV": dev ? '"development"' : '"production"' },
  // Node-Zweige im OpenCascade-Lader werden im Browser nie ausgeführt
  external: ["fs", "path", "module", "url", "crypto", "worker_threads", "perf_hooks", "os", "child_process", "node:*"],
  logOverride: { "empty-import-meta": "silent" },
};

await esbuild.build({ ...common, entryPoints: ["src/ui/main.js"], outfile: path.join(out, "app.js") });
await esbuild.build({ ...common, entryPoints: ["src/kernel/worker.js"], outfile: path.join(out, "worker.js") });

for (const f of ["index.html", "styles.css"]) fs.copyFileSync(path.join("src", f), path.join(out, f));
fs.copyFileSync(require.resolve("replicad-opencascadejs/wasm"), path.join(out, "replicad_single.wasm"));

// Lizenztexte der mitgelieferten Bibliotheken (landen über dist/** im Installer).
// OpenCascade steht unter LGPL-2.1: Lizenztext + Quellenangabe beilegen; die WASM-Datei bleibt austauschbar.
const BUNDLED = [
  { pkg: "replicad-opencascadejs", source: "https://github.com/sgenoud/replicad (packages/replicad-opencascadejs), OpenCascade: https://github.com/Open-Cascade-SAS/OCCT", note: "als separate Datei replicad_single.wasm, kann durch eine kompatible eigene Übersetzung ersetzt werden" },
  { pkg: "replicad", source: "https://github.com/sgenoud/replicad" },
  { pkg: "three", source: "https://github.com/mrdoob/three.js" },
];
const licDir = path.join(out, "lizenzen");
fs.mkdirSync(licDir, { recursive: true });
const notice = ["PBCAD verwendet folgende Bibliotheken von Drittanbietern:", ""];
for (const b of BUNDLED) {
  const dir = path.resolve("node_modules", b.pkg);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  const lic = fs.readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f));
  if (!lic) throw new Error(`Lizenztext für ${b.pkg} fehlt`);
  fs.copyFileSync(path.join(dir, lic), path.join(licDir, `${b.pkg}-LICENSE.txt`));
  notice.push(`${b.pkg} ${meta.version} – Lizenz ${meta.license} (lizenzen/${b.pkg}-LICENSE.txt)`, `  Quelle: ${b.source}`);
  if (b.note) notice.push(`  Einbindung: ${b.note}`);
  notice.push("");
}
// Schrift für Text in der Skizze (Umrisse in src/core/schrift-daten.js)
fs.copyFileSync(path.join("docs", "lizenzen", "dejavu.txt"), path.join(licDir, "DejaVu-LICENSE.txt"));
notice.push("DejaVu Sans 2.37 (Schriftumrisse) – Bitstream-Vera-Lizenz, DejaVu-Änderungen gemeinfrei (lizenzen/DejaVu-LICENSE.txt)", "  Quelle: https://dejavu-fonts.github.io", "");
const legal = fs.readdirSync(out).filter((f) => f.endsWith(".LEGAL.txt"));
if (legal.length) notice.push("Weitere Hinweise zu gebündelten Bibliotheken: " + legal.join(", "));
fs.writeFileSync(path.join(licDir, "DRITTANBIETER.txt"), notice.join("\r\n") + "\r\n");

const size = (f) => (fs.statSync(path.join(out, f)).size / 1024 / 1024).toFixed(1) + " MB";
console.log(`dist/ fertig: app.js ${size("app.js")}, worker.js ${size("worker.js")}, wasm ${size("replicad_single.wasm")}`);
