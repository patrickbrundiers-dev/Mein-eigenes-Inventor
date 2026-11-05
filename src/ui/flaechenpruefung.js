// Flächen prüfen (SolidCraft-Abgleich E4): Zebra, Umgebungskarte, Krümmungskarte mit Mindestradius, Krümmungskamm,
// Isokurven, Silhouette, Kantenstetigkeit, Zugänglichkeit und Körper vergleichen. Rechnung: src/core/flaechenpruefung.js
// (Netz) und Kern (surfaceAnalysis, compareBodies).
import { meaning } from "../core/farbsehen.js";
import { h, toast, modal, fmtNum } from "./dom.js";
import { vertexCurvature, minRadiusOf, curvatureColor, accessibility, continuityClass, curvatureComb, SURFACE_CHECKS } from "../core/flaechenpruefung.js";
export { SURFACE_CHECKS };

const DIRS = { "Z+": [0, 0, 1], "Z-": [0, 0, -1], "X+": [1, 0, 0], "X-": [-1, 0, 0], "Y+": [0, 1, 0], "Y-": [0, -1, 0] };

const partOf = (app) => { const d = app.activeDoc(); return d?.kind === "part" && app.results.get(d.id)?.bodies?.length ? d : null; };
const geoArrays = (mesh) => ({ positions: mesh.geometry.getAttribute("position").array, normals: mesh.geometry.getAttribute("normal")?.array, indices: mesh.geometry.getIndex()?.array });

/** Prüfdarstellung einschalten (mode aus SURFACE_CHECKS) oder mit null ausschalten; Rückgabe: Ergebnistext */
export async function applySurfaceCheck(app, mode, { rMin = 2, dir = "Z+", stripes = 14, combFactor = 1, combDensity = 0, isoCount = 5, tol = 1 } = {}) {
  const v = app.viewer;
  if (!mode) { v.setAnalysis(); app.surfaceCheck = null; app.ribbon?.render?.(); return ""; }
  const part = partOf(app);
  if (!part) throw new Error("Flächen prüfen: erst ein Bauteil mit Körper öffnen");
  app.surfaceCheck = { mode, rMin, dir, stripes, combFactor, combDensity, isoCount, tol };
  let info = "";
  if (mode === "zebra" || mode === "umgebung" || mode === "silhouette") v.setAnalysis({ kind: mode, stripes: Math.max(2, Math.min(80, Number(stripes) || 14)) });
  else if (mode === "kruemmung") {
    let rFound = Infinity;
    v.setAnalysis({ colors: (mesh) => {
      const g = geoArrays(mesh);
      if (!g.normals || !g.indices) return null;
      const k = vertexCurvature(g.positions, g.normals, g.indices);
      rFound = Math.min(rFound, minRadiusOf(k));
      const out = new Float32Array(k.length * 3);
      for (let i = 0; i < k.length; i++) out.set(curvatureColor(k[i], { rMin, rMax: Math.max(500, rMin * 50) }), i * 3);
      return out;
    } });
    const radii = (await app.kernel.call("surfaceAnalysis", { part, what: "radius" })).flatMap((b) => b.radii || []);
    const rA = radii.reduce((m, x) => Math.min(m, x.r), Infinity);
    const r = Math.min(rA, rFound);
    info = Number.isFinite(r) ? `Kleinster Radius ${fmtNum(Number.isFinite(rA) ? rA : r, 2)} mm${Number.isFinite(rA) ? "" : " (aus dem Netz)"}${r < rMin ? ` – unter dem Mindestradius ${fmtNum(rMin, 1)} mm` : ""}` : "Keine gekrümmten Flächen";
    app.surfaceCheck.minRadius = Number.isFinite(rA) ? rA : r;
  } else if (mode === "kamm") {
    const lines = [];
    let kMax = 0;
    for (const b of app.results.get(part.id).bodies) for (const e of b.mesh?.edges || []) {
      if (e.type === "LINE" || !(e.positions?.length >= 9)) continue;
      const pts = [];
      for (let i = 0; i < e.positions.length; i += 3) pts.push([e.positions[i], e.positions[i + 1], e.positions[i + 2]]);
      const c0 = curvatureComb(combDensity >= 2 ? resample(pts, combDensity) : pts);
      const c = combFactor !== 1 ? curvatureComb(combDensity >= 2 ? resample(pts, combDensity) : pts, { scale: c0.kMax > 0 ? ((c0.teeth.length ? 1 : 0) * combFactor * 0.15 * polyLen(pts)) / c0.kMax : 0 }) : c0;
      if (!c.teeth.length) continue;
      kMax = Math.max(kMax, c.kMax);
      for (const t of c.teeth) lines.push({ pts: t, color: [0.85, 0.35, 0.1], onTop: true });
      lines.push({ pts: c.envelope, color: [0.6, 0.15, 0.6], onTop: true });
    }
    v.setAnalysis({ lines });
    info = kMax > 0 ? `Größte Kantenkrümmung 1/${fmtNum(1 / kMax, 1)} mm` : "Keine gekrümmten Kanten";
  } else if (mode === "isokurven") {
    const res = await app.kernel.call("surfaceAnalysis", { part, what: "iso", n: isoCount });
    const lines = res.flatMap((b) => b.lines || []).map((pts) => ({ pts, color: [0.1, 0.35, 0.85] }));
    v.setAnalysis({ lines });
    info = lines.length ? `${lines.length} Isokurven` : "Keine gekrümmten Flächen";
  } else if (mode === "stetigkeit") {
    const res = await app.kernel.call("surfaceAnalysis", { part, what: "stetigkeit" });
    const body = app.results.get(part.id).bodies;
    const count = { g1: 0, knick: 0, rand: 0 };
    const lines = [];
    for (const r of res) {
      const edges = body[r.body]?.mesh?.edges || [];
      for (const e of r.edges || []) {
        const c = continuityClass(e.seam ? 0 : e.angle, { tol: Number(tol) > 0 ? Number(tol) : 1 });
        if (e.seam) continue;
        count[c.cls]++;
        const m = edges.find((x) => x.idx === e.idx);
        if (!m?.positions) continue;
        const pts = [];
        for (let i = 0; i < m.positions.length; i += 3) pts.push([m.positions[i], m.positions[i + 1], m.positions[i + 2]]);
        lines.push({ pts, color: c.cls === "g1" ? meaning("gut") : c.cls === "knick" ? meaning("schlecht") : c.color, onTop: true });
      }
    }
    v.setAnalysis({ lines });
    info = `${count.g1} tangentiale Kanten (G1), ${count.knick} Knickkanten, ${count.rand} Randkanten`;
  } else if (mode === "zugang") {
    const d = DIRS[dir] || DIRS["Z+"];
    const meshes = v.pickables.map((pk) => { pk.mesh.updateMatrixWorld(); const g = geoArrays(pk.mesh); const M = pk.mesh.matrixWorld.elements; return { mesh: pk.mesh, ...g, positions: worldPos(g.positions, M), normals: worldDir(g.normals, M) }; }).filter((m) => m.indices && m.normals);
    const r = accessibility(meshes, d);
    const col = { 0: meaning("schlecht"), 1: meaning("gut"), 2: [0.6, 0.62, 0.66] };
    const byMesh = new Map(meshes.map((m, i) => [m.mesh, r.vis[i]]));
    v.setAnalysis({ colors: (mesh) => { const vis = byMesh.get(mesh); if (!vis) return null; const out = new Float32Array(vis.length * 3); vis.forEach((x, i) => out.set(col[x], i * 3)); return out; } });
    const tot = r.area.frei + r.area.verdeckt + r.area.abgewandt || 1;
    info = `Aus ${dir}: ${fmtNum((100 * r.area.frei) / tot, 1)} % erreichbar, ${fmtNum((100 * r.area.verdeckt) / tot, 1)} % verdeckt, ${fmtNum((100 * r.area.abgewandt) / tot, 1)} % abgewandt`;
  } else throw new Error("Unbekannte Prüfung");
  app.surfaceCheck.info = info;
  app.ribbon?.render?.();
  return info;
}
const polyLen = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1], p[2] - pts[i][2]), 0);
/** Punktfolge gleichmäßig auf n Punkte verteilen (Zahndichte des Krümmungskamms) */
function resample(pts, n) {
  const L = polyLen(pts), out = [];
  if (!(L > 0)) return pts;
  let k = 0, acc = 0;
  for (let i = 0; i < n; i++) {
    const s = (L * i) / (n - 1);
    while (k < pts.length - 2 && acc + Math.hypot(...pts[k + 1].map((x, j) => x - pts[k][j])) < s) { acc += Math.hypot(...pts[k + 1].map((x, j) => x - pts[k][j])); k++; }
    const seg = Math.hypot(...pts[k + 1].map((x, j) => x - pts[k][j])) || 1, t = Math.min(1, Math.max(0, (s - acc) / seg));
    out.push(pts[k].map((x, j) => x + (pts[k + 1][j] - x) * t));
  }
  return out;
}
const worldPos = (a, M) => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i += 3) { const [x, y, z] = [a[i], a[i + 1], a[i + 2]]; o[i] = M[0] * x + M[4] * y + M[8] * z + M[12]; o[i + 1] = M[1] * x + M[5] * y + M[9] * z + M[13]; o[i + 2] = M[2] * x + M[6] * y + M[10] * z + M[14]; } return o; };
const worldDir = (a, M) => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i += 3) { const [x, y, z] = [a[i], a[i + 1], a[i + 2]]; const X = M[0] * x + M[4] * y + M[8] * z, Y = M[1] * x + M[5] * y + M[9] * z, Z = M[2] * x + M[6] * y + M[10] * z, l = Math.hypot(X, Y, Z) || 1; o[i] = X / l; o[i + 1] = Y / l; o[i + 2] = Z / l; } return o; };

/** Nach dem Neuaufbau des Bauteils die laufende Prüfung wieder anwenden */
export function reapplySurfaceCheck(app) {
  const s = app.surfaceCheck;
  if (!s) return;
  if (!partOf(app)) { app.surfaceCheck = null; app.viewer.setAnalysis(); return; }
  applySurfaceCheck(app, s.mode, s).catch(() => { /* still */ });
}

/** Dialog »Flächen prüfen« */
export function surfaceCheckDialog(app, preset = null) {
  if (!partOf(app)) return toast("Flächen prüfen: erst ein Bauteil mit Körper öffnen");
  const last = { mode: "zebra", rMin: 2, dir: "Z+", ...(app.surfaceCheck || {}), ...(preset ? { mode: preset } : {}) };
  const sel = h("select", { class: "inp" }, ...SURFACE_CHECKS.map(([k, l]) => h("option", { value: k, selected: k === last.mode ? true : undefined }, l)));
  const help = h("p", { class: "hint" });
  const rMin = h("input", { class: "inp", value: fmtNum(last.rMin, 1) });
  const dir = h("select", { class: "inp" }, ...Object.keys(DIRS).map((k) => h("option", { value: k, selected: k === last.dir ? true : undefined }, k)));
  const rRow = h("div", { class: "field" }, h("label", {}, "Mindestradius (mm)"), rMin), dRow = h("div", { class: "field" }, h("label", {}, "Richtung"), dir);
  const numIn = (v) => h("input", { class: "inp", value: fmtNum(v, 2) });
  const stripes = numIn(last.stripes ?? 14), combF = numIn(last.combFactor ?? 1), combD = numIn(last.combDensity ?? 0), isoN = numIn(last.isoCount ?? 5), tolIn = numIn(last.tol ?? 1);
  const row = (label, el) => h("div", { class: "field" }, h("label", {}, label), el);
  const zRow = row("Streifen", stripes), kRow = h("div", {}, row("Zahnlänge (× automatisch)", combF), row("Zähne je Kante (0 = wie Netz)", combD)), iRow = row("Isokurven je Richtung", isoN), tRow = row("Winkeltoleranz G1 (°)", tolIn);
  const val = (el, d) => { const x = Number(String(el.value).replace(",", ".")); return Number.isFinite(x) ? x : d; };
  const out = h("p", { class: "msg info surface-check-info" }, app.surfaceCheck?.info || "–");
  const sync = () => { help.textContent = SURFACE_CHECKS.find(([k]) => k === sel.value)?.[2] || ""; rRow.style.display = sel.value === "kruemmung" ? "" : "none"; dRow.style.display = sel.value === "zugang" ? "" : "none";
    zRow.style.display = sel.value === "zebra" ? "" : "none"; kRow.style.display = sel.value === "kamm" ? "" : "none"; iRow.style.display = sel.value === "isokurven" ? "" : "none"; tRow.style.display = sel.value === "stetigkeit" ? "" : "none"; };
  sel.addEventListener("change", sync);
  sync();
  const run = async () => {
    out.textContent = "wird berechnet …";
    try { out.textContent = await applySurfaceCheck(app, sel.value, { rMin: Number(String(rMin.value).replace(",", ".")) || 2, dir: dir.value, stripes: val(stripes, 14), combFactor: val(combF, 1) || 1, combDensity: Math.round(val(combD, 0)), isoCount: Math.round(val(isoN, 5)), tol: val(tolIn, 1) }) || "Darstellung an"; }
    catch (e) { out.textContent = e.message; }
    return false;
  };
  modal({ title: "Flächen prüfen", width: "440px", body: h("div", {}, h("div", { class: "field" }, h("label", {}, "Prüfung"), sel), help, rRow, dRow, zRow, kRow, iRow, tRow, out),
    buttons: [{ label: "Aus", run: () => { applySurfaceCheck(app, null); out.textContent = "–"; return false; } }, { label: "Anzeigen", primary: true, run }, { label: "Schließen" }] });
  if (preset) run();
}

/** Körper vergleichen: zwei Körper (auch aus verschiedenen Bauteilen) gegeneinander, Unterschiede farbig */
export function compareBodiesDialog(app) {
  const opts = [];
  for (const d of app.parts()) (app.results.get(d.id)?.bodies || []).forEach((b, i) => { if (b.mesh && b.kind !== "flaeche") opts.push({ v: `${d.id}|${i}`, l: `${d.name} – ${b.name || "Körper " + (i + 1)}`, d, i }); });
  if (opts.length < 2) return toast("Zum Vergleichen braucht es zwei Körper (geöffnete oder schon gebaute Bauteile)");
  const cur = app.activeDoc()?.id;
  const mk = (pre) => h("select", { class: "inp" }, ...opts.map((o, k) => h("option", { value: o.v, selected: k === pre ? true : undefined }, o.l)));
  const first = Math.max(0, opts.findIndex((o) => o.d.id === cur)), a = mk(first), b = mk(first === 0 ? 1 : 0);
  const out = h("div", {});
  const tolIn = h("input", { class: "inp", value: fmtNum(app.compareTol ?? 1, 2) });
  modal({ title: "Körper vergleichen", width: "480px", body: h("div", {},
    h("div", { class: "field" }, h("label", {}, "Gleich bis zu (mm³ Unterschied)"), tolIn),
    h("p", {}, "Rot: nur in A, Grün: nur in B (in Bauteilkoordinaten übereinander gelegt)."),
    h("div", { class: "field" }, h("label", {}, "Körper A"), a), h("div", { class: "field" }, h("label", {}, "Körper B"), b), out),
  buttons: [{ label: "Schließen", run: () => { app.viewer.setAnalysis(); } }, { label: "Vergleichen", primary: true, run: async () => {
    const pa = opts.find((o) => o.v === a.value), pb = opts.find((o) => o.v === b.value);
    if (pa.v === pb.v) { toast("Zwei verschiedene Körper wählen", { kind: "err" }); return false; }
    out.replaceChildren(h("p", { class: "hint" }, "wird berechnet …"));
    try {
      const r = await app.kernel.call("compareBodies", { a: { part: pa.d, body: pa.i }, b: { part: pb.d, body: pb.i } });
      const cm3 = (x) => fmtNum(x / 1000, 2) + " cm³";
      const tol = Math.max(0, Number(String(tolIn.value).replace(",", ".")) || 0);
      app.compareTol = tol;
      const same = r.onlyA <= Math.max(tol, 1e-6 * Math.max(1, r.volA)) && r.onlyB <= Math.max(tol, 1e-6 * Math.max(1, r.volB));
      out.replaceChildren(h("p", { class: "msg " + (same ? "info" : "warn") }, same ? "Die Körper sind gleich." : "Die Körper unterscheiden sich."),
        h("table", { class: "grid compare-bodies" }, h("tbody", {},
          h("tr", {}, h("td", {}, "Volumen A / B"), h("td", { class: "num" }, `${cm3(r.volA)} / ${cm3(r.volB)}`)),
          h("tr", {}, h("td", {}, "nur in A (rot)"), h("td", { class: "num" }, cm3(r.onlyA))),
          h("tr", {}, h("td", {}, "nur in B (grün)"), h("td", { class: "num" }, cm3(r.onlyB))),
          h("tr", {}, h("td", {}, "gemeinsam"), h("td", { class: "num" }, cm3(r.common))))));
      app.viewer.setAnalysis({ meshes: [r.meshA && { mesh: r.meshA, color: meaning("schlecht") }, r.meshB && { mesh: r.meshB, color: meaning("gut") }].filter(Boolean) });
      app.lastCompare = r;
    } catch (e) { out.replaceChildren(h("p", { class: "msg err" }, "Vergleich fehlgeschlagen: " + e.message)); }
    return false;
  } }] });
}
