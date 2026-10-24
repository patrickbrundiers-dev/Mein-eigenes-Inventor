// Kleiner statischer Server für dist/ (Test im Browser): node tools/serve.mjs [port]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("dist");
const port = Number(process.argv[2] || process.env.PORT || 4173);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".wasm": "application/wasm", ".map": "application/json", ".svg": "image/svg+xml" };

export function serve(p = port) {
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end("nicht gefunden"); }
      res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      res.end(data);
    });
  });
  return new Promise((r) => srv.listen(p, () => r(srv)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await serve();
  console.log(`PBCAD läuft auf http://localhost:${port}`);
}
