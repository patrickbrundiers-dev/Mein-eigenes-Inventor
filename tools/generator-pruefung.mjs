// Generator-Prüfung: baut Testmodelle aller Generatoren im Geometrie-Kern und prüft
//  – Kollisionen (Durchdringung zweier Körper > 1 mm³, z. B. Schraube ohne Bohrung, Stab ohne Loch im Gurt)
//  – lose Teile (Körper ohne Berührung zu einem anderen Körper, Luft > 0,5 mm)
//  – Verschraubungen: Schraube braucht in jedem geklemmten Teil eine Bohrung (zeigt sich als Kollision)
//  – verdeckte Bohrungen: Achse jeder Schraubenbohrung (Ø 8 … 30) samt 30 mm Platz für Kopf/Mutter je Seite darf kein
//    anderes Teil treffen (außer Teilen mit passender Bohrung und dem Stab, der in der Bohrung steckt)
//  – Spalte an Stabenden: Achsende eines Stabs liegt 0,5 … 12 mm vor einem anderen Teil (Rohr endet kurz vor
//    Platte/Gurt, Lücke statt Anlage; bewusste Fugen wie Gehrungsspalt vorher klären)
// Aufruf: node --stack-size=8000 tools/generator-pruefung.mjs [Ausgabeordner] [Filter]
// Ergebnis: <Ausgabe>/bericht.json und je Fall <name>.mesh.json (für tools/generator-bilder.mjs).

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createKernel } from "../src/kernel/build.js";
import { defaultGenerator, GENERATORS, resolveGenParams } from "../src/core/generator.js";
import { defaultGestell } from "../src/core/gestell.js";

const require = createRequire(import.meta.url);
const R = await import("replicad");
const ocInit = (await import("replicad-opencascadejs")).default;
const OC = await ocInit({ locateFile: () => require.resolve("replicad-opencascadejs/wasm") });
R.setOC(OC);
const K = createKernel(R);

const out = process.argv[2] || "pruef-out";
const filter = process.argv[3] ? new RegExp(process.argv[3]) : null;
fs.mkdirSync(out, { recursive: true });

const up = [0, 0, 1];
const rect = [[0, 0, 0], [1200, 0, 0], [1200, 800, 0], [0, 800, 0]];
const gestellSegs = [...rect.map((a, i) => ({ id: "s" + i, a, b: rect[(i + 1) % 4], up, label: "Linie " + (i + 1) })), { id: "m", a: [600, 0, 0], b: [600, 800, 0], up, label: "Mitte" },
  ...rect.map((a, i) => ({ id: "v" + i, a, b: [a[0], a[1], 700], up: [1, 0, 0], label: "Bein " + (i + 1) }))];

/** Testfälle: Name, Generator, geänderte Parameter */
export const CASES = [
  ["gelaender-staketen", "gelaender", { runs: "3000; 1500" }],
  ["gelaender-boegen", "gelaender", { runs: "3000; 1500", railBend: "bogen", railEnd: "bogen" }],
  ["gelaender-endbogen", "gelaender", { runs: "3000; 1500", railEnd: "bogen" }],
  ["glas-klemme", "gelaender", { runs: "3000; 1500", fill: "glas", glassMount: "klemme" }],
  ["glas-boden", "gelaender", { runs: "3000; 1500", fill: "glas", glassMount: "boden", glassT: "16.76" }],
  ["glas-punkt", "gelaender", { runs: "3000; 1500", fill: "glas", glassMount: "punkt", glassT: "16.76" }],
  ["gelaender-kreuz", "gelaender", { fill: "kreuz" }],
  ["gelaender-kreuz-ohne-ring", "gelaender", { fill: "kreuz", ring: false }],
  ["gelaender-rahmen", "gelaender", { fill: "rahmen" }],
  ["gelaender-blech", "gelaender", { fill: "blech" }],
  ["gelaender-glas", "gelaender", { fill: "glas" }],
  ["gelaender-quer", "gelaender", { fill: "quer" }],
  ["gelaender-industrie", "gelaender", { use: "industrie", height: "1100" }],
  ["gelaender-seitlich-profil", "gelaender", { base: "seitlich", mTarget: "profil" }],
  ["gelaender-fussplatte", "gelaender", { base: "fussplatte", beltMode: "zwischen" }],
  ["treppe-gerade", "treppe", {}],
  ["treppe-gerade-staketen", "treppe", { gelFill: "staketen" }],
  ["treppe-upn", "treppe", { support: "upn" }],
  ["treppe-holm2", "treppe", { support: "holm2", gelMount: "oben" }],
  ["treppe-holm1", "treppe", { support: "holm1", gel: "keine" }],
  ["treppe-L", "treppe", { form: "L" }],
  ["treppe-U", "treppe", { form: "U", gap: "200" }],
  ["treppe-viertelgewendelt", "treppe", { form: "Lw" }],
  ["treppe-halbgewendelt-rechts", "treppe", { form: "Uw", gap: "200", turn: "rechts" }],
  ["treppe-U-boegen", "treppe", { form: "U", gap: "200", gelRailBend: "bogen" }],
  ["treppe-gerade-boegen-staketen", "treppe", { gelFill: "staketen", gelRailBend: "bogen" }],
  ["spindel", "spindel", {}],
  ["spindel-fussplatte", "spindel", { stabMount: "oben" }],
  ["balkon", "balkon", {}],
  ["balkon-seitlich", "balkon", { railMount: "seitlich" }],
  ["tor-stich", "tor", {}],
  ["tor-gerade", "tor", { form: "gerade", leaves: "1" }],
  ["schiebetor", "schiebetor", {}],
  ["schiebetor-gerade", "schiebetor", { tailForm: "gerade", fill: "quer" }],
  ["zaun", "zaun", { length: "5000" }],
  ["zaun-fussplatte-blech", "zaun", { length: "5000", base: "fussplatte", fill: "blech", terrain: "gefaelle" }],
  ["windverband", "windverband", {}],
  ["pfette", "pfette", { spans: "5000; 5000; 5000" }],
  ["rahmenecke", "rahmenecke", {}],
  ["carport", "vordach", {}],
  ["fenstergitter", "fenstergitter", {}],
  ["fenstergitter-durchsteck", "fenstergitter", { fill: "durchsteck", mount: "vorgesetzt", bar: { kind: "vierkantvoll", size: "16" } }],
  ["pergola", "pergola", {}],
  ["pergola-wand-zu", "pergola", { form: "wand", angle: "0" }],
  ["rampe", "rampe", {}],
  ["klemmgelaender", "klemmgelaender", {}],
  ["klemmgelaender-rechts-3", "klemmgelaender", { runs: "2000; 1500; 2000", turn: "rechts", tube: "33.7", wall: "2.6", knee: false }],
  ["zarge", "zarge", {}],
  ["zarge-umfassung-rechts", "zarge", { form: "umfassung", hinge: "rechts", bands: "3", t: "2" }],
  ["rampe-steil-blech", "rampe", { height: "900", slope: "8", deck: "blech", knee: false, topLanding: "0" }],
  ["voute", "voute", {}],
  ["treppe-wandhandlauf", "treppe", { gel: "rechts", wand: "links" }],
  ["treppe-L-wandhandlauf", "treppe", { form: "L", gel: "links", wand: "rechts", turn: "rechts" }],
  ["treppe-U-wand-holm", "treppe", { form: "U", support: "holm2", gel: "keine", wand: "rechts" }],
  ["treppe-auflager-wand", "treppe", { anschluss: "auflager", wangeWand: "links", gel: "rechts" }],
  ["treppe-U-auflager", "treppe", { form: "U", gap: "200", anschluss: "auflager", wangeWand: "rechts", gel: "links" }],
  ["treppe-L-podestwange", "treppe", { form: "L", podestWange: true }],
  ["treppe-U-podestwange", "treppe", { form: "U", gap: "200", podestWange: true, turn: "rechts" }],
  ["tor-beschlaege", "tor", { hold: "innen" }],
  ["tor-einzel-beschlaege", "tor", { leaves: "1", width: "1200", hold: "aussen" }],
  ["gelaender-stoss", "gelaender", { runs: "7000; 3000", railMax: "6000" }],
  ["gelaender-stoss-vierkant", "gelaender", { runs: "8000", rail: { kind: "rechteck", size: "40x20x2" }, railMax: "3000", postMode: "abstand", postStep: "1000" }],
  ["voute-beidseitig", "voute", { form: "voute2", h0: "800", h: "450", lv: "2000" }],
  ["voute-linear", "voute", { form: "linear", h0: "300", h: "600", endPlates: false }],
  ["rahmenecke-voute", "rahmenecke", { haunch: true }],
  ["rahmenecke-voute-flach", "rahmenecke", { haunch: true, pitch: "0", haunchH: "300", haunchL: "1500", stiffAt: "unten", column: { kind: "heb", size: "240" } }],
  ["stuetzenfuss-futter", "stuetzenfuss", { shims: true, grout: "35" }],
  ["windverband-winkel", "windverband", { bar: "profil" }],
  ["windverband-flach", "windverband", { bar: "profil", barProfile: { kind: "flach", size: "60x8" }, nBolts: "3", type: "einfach", gusset: "250" }],
  ["vordach", "vordach", { form: "vordach", depth: "2500", width: "4000", roof: "glas", slope: "8" }],
  ["stuetzenfuss", "stuetzenfuss", {}],
  ["stuetzenfuss-schubdorn", "stuetzenfuss", { key: true, stiff: false }],
  ["traegerstoss", "traegerstoss", {}],
  ["traegerstoss-innen", "traegerstoss", { inner: true, webCols: "2" }],
  ["traegeranschluss", "traegeranschluss", {}],
  ["traegeranschluss-winkel", "traegeranschluss", { type: "winkel" }],
  ["traegeranschluss-stirnplatte", "traegeranschluss", { type: "stirnplatte" }],
  ["traegeranschluss-stuetze", "traegeranschluss", { support: "stuetze", type: "stirnplatte" }],
  ["traegeranschluss-stuetze-fahne", "traegeranschluss", { support: "stuetze" }],
  ["steigleiter", "steigleiter", {}],
  ["steigleiter-ohne-korb", "steigleiter", { cage: "nein", height: "3000" }],
  ["fachwerk", "fachwerk", {}],
  ["fachwerk-sattel-w", "fachwerk", { shape: "sattel", fill: "W" }],
  ["fachwerk-pult-v", "fachwerk", { shape: "pult", fill: "V", plates: false }],
  ["arbeitsbuehne", "arbeitsbuehne", {}],
  ["arbeitsbuehne-leiter", "arbeitsbuehne", { access: "leiter", railFill: "staketen" }],
  ["arbeitsbuehne-blech-fussplatte", "arbeitsbuehne", { deck: "blech", railMount: "fussplatte", access: "offen" }],
  ["gestell", "gestell", null],
];

function feature(gen, over) {
  if (gen === "gestell") {
    const g = defaultGestell("sk", gestellSegs);
    return { id: "f", type: "generator", gen: "gestell", params: { input: { ...g, segments: gestellSegs } } };
  }
  const f = defaultGenerator(gen);
  Object.assign(f.params, over);
  return { id: "f", ...f };
}

const sub = (a, b) => a.map((x, i) => x - b[i]), add = (a, b) => a.map((x, i) => x + b[i]), mul = (a, k) => a.map((x) => x * k);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0), len = (a) => Math.sqrt(dot(a, a)), norm = (a) => mul(a, 1 / (len(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const SPACE = 30; // Platz für Schraubenkopf bzw. Mutter mit Scheibe je Seite

/** Schraubenbohrungen des Bauplans als Achsen a → b (mit Platz je Seite) */
function holeAxes(plan) {
  const out = [];
  for (const d of plan.drills || []) {
    if (!(d.d >= 8 && d.d <= 30)) continue;
    const u = norm(d.dir);
    out.push({ target: d.target, a: sub(d.p, mul(u, SPACE)), b: add(d.p, mul(u, d.len + SPACE)), d: d.d, u });
  }
  for (const pl of plan.plates || []) {
    const n = norm(pl.normal), x = norm(pl.xDir), y = cross(n, x);
    for (const [hx, hy, hd] of pl.holes || []) {
      const dd = hd || pl.d;
      if (!(dd >= 8 && dd <= 30)) continue;
      const q = add(add(pl.center, mul(x, hx)), mul(y, hy));
      out.push({ target: pl.name, a: sub(q, mul(n, SPACE)), b: add(q, mul(n, pl.t + SPACE)), d: dd, u: n });
    }
  }
  return out;
}

/** Stäbe, die in der Bohrung stecken (Achse parallel und nah): dürfen die Achse treffen */
function insertedNames(plan, h) {
  const names = new Set();
  const segs = [...(plan.members || []).map((m) => [m.name, m.a, m.b]), ...(plan.chains || []).flatMap((c) => c.points.slice(1).map((b, i) => [c.points.length > 2 ? `${c.name} ${i + 1}` : c.name, c.points[i], b]))];
  for (const [nm, a, b] of segs) {
    const u = norm(sub(b, a));
    if (Math.abs(dot(u, h.u)) < 0.8) continue; // auch schräg durchgesteckt (Knieleiste am Knick)
    // kleinster Abstand der Stabachse zur Bohrungsachse (Stichproben entlang des Stabs)
    let dm = Infinity;
    for (let k = 0; k <= 40; k++) {
      const w = sub(add(a, mul(sub(b, a), k / 40)), h.a), t = dot(w, h.u);
      if (t < -h.d || t > len(sub(h.b, h.a)) + h.d) continue;
      dm = Math.min(dm, len(sub(w, mul(h.u, t))));
    }
    if (dm < h.d) names.add(nm);
  }
  return names;
}

const bbox = (s) => { const b = s.boundingBox.bounds; return { lo: b[0], hi: b[1] }; };
const boxGap = (a, b) => Math.max(0, ...[0, 1, 2].map((k) => Math.max(a.lo[k] - b.hi[k], b.lo[k] - a.hi[k])));

export async function checkCase([name, gen, over]) {
  const t0 = Date.now();
  const res = await K.buildPart({ id: "p-" + name, kind: "part", name, params: [], features: [feature(gen, over)] }, { useCache: false, validate: false });
  const st = res.status.f;
  if (!st?.ok) return { name, gen, error: st?.error || "Aufbau fehlgeschlagen" };
  const bodies = res.bodies.map((b, i) => ({ i, name: b.name, shape: b.shape, norm: !!b.meta?.norm, grid: !!b.meta?.density, box: bbox(b.shape) }));
  // Kollisionen
  const coll = [];
  for (let i = 0; i < bodies.length; i++)
    for (let j = i + 1; j < bodies.length; j++) {
      if (boxGap(bodies[i].box, bodies[j].box) > 1e-3) continue;
      // Teile einer Verschraubung (Schraube, Scheibe, Mutter) untereinander zählen nicht
      if (bodies[i].norm && bodies[j].norm) continue;
      let v = 0;
      try { v = R.measureVolume(bodies[i].shape.clone().intersect(bodies[j].shape.clone())); } catch { v = NaN; }
      if (!(v <= 1)) coll.push({ a: bodies[i].name, b: bodies[j].name, ia: i, ib: j, volume: Math.round(v * 10) / 10 });
    }
  // Berührung: kleinster Abstand zu irgendeinem anderen Körper
  const touch = bodies.map(() => []);
  for (let i = 0; i < bodies.length; i++)
    for (let j = i + 1; j < bodies.length; j++) {
      if (boxGap(bodies[i].box, bodies[j].box) > 0.5) continue;
      let d = 0;
      try { d = R.measureDistanceBetween(bodies[i].shape, bodies[j].shape); } catch { d = 0; }
      if (d <= 0.5) { touch[i].push(j); touch[j].push(i); }
    }
  const loose = bodies.filter((b, i) => !touch[i].length).map((b) => ({ name: b.name, i: b.i }));
  // verdeckte Bohrungen
  const covered = [];
  const plan = gen === "gestell" ? null : GENERATORS[gen].plan(resolveGenParams(gen, feature(gen, over).params, (x) => Number(String(x).replace(",", "."))));
  for (const h of plan ? holeAxes(plan) : []) {
    const L = len(sub(h.b, h.a));
    const skip = insertedNames(plan, h);
    if (skip.size) continue; // Durchgang für einen Stab (Knieleiste, Gurt), keine Schraube
    const cyl = R.makeCylinder((h.d / 2) * 0.85, L, h.a, h.u), cb = bbox(cyl);
    // Platten mit eigener Bohrung auf derselben Achse (Unterlegplatte über einem Langloch/Übermaßloch) verdecken nicht
    const coaxial = new Set((plan.plates || []).filter((pl) => {
      const n = norm(pl.normal), x = norm(pl.xDir), y = cross(n, x);
      return (pl.holes || []).some(([hx, hy]) => { const q = add(add(pl.center, mul(x, hx)), mul(y, hy)), w = sub(q, h.a); return len(sub(w, mul(h.u, dot(w, h.u)))) < h.d / 2; });
    }).map((pl) => pl.name));
    for (const b of bodies) {
      // Gitterrost/Glas sind vereinfacht als Vollkörper gebaut (Schrauben sitzen real zwischen den Tragstäben); Teilstücke des Zielkörpers zählen mit ihm
      if (b.norm || b.grid || b.name === h.target || coaxial.has(b.name) || b.name.startsWith(h.target + " ") || skip.has(b.name) || boxGap(cb, b.box) > 1e-3) continue;
      let v = 0;
      try { v = R.measureVolume(cyl.clone().intersect(b.shape.clone())); } catch { v = 0; }
      if (v > 1) covered.push({ hole: h.target, by: b.name, at: h.a.map((x) => Math.round(x)), volume: Math.round(v) });
    }
  }
  // Spalte an Stabenden: Endbereich (15 mm vor der Schnittebene bzw. dem Stabende) muss an etwas anliegen,
  // sonst Luft 0,5 … 12 mm = Spalt (freie Enden wie Pfostenköpfe haben mehr Abstand und zählen nicht)
  const gaps = [];
  if (plan) {
    const ends = [...(plan.members || []).map((m) => [m.name, m.a, m.b, null, null, false, m.cuts]), ...(plan.chains || []).map((c) => [c.name, c.points[0], c.points[c.points.length - 1], c.points[1], c.points[c.points.length - 2], c.points.length > 2, null])];
    for (const [nm, a, b, a2, b2, multi, cuts] of ends) {
      for (const [p, q, segName, cl] of [[a, a2 || b, multi ? `${nm} 1` : nm, cuts?.start], [b, b2 || a, multi ? `${nm} ${(plan.chains.find((c) => c.name === nm)?.points.length || 2) - 1}` : nm, cuts?.end]]) {
        const body = bodies.find((bd) => bd.name === segName) || bodies.find((bd) => bd.name === nm);
        if (!body) continue;
        const u = norm(sub(p, q));
        if (!(len(sub(p, q)) > 40)) continue;
        // Endebene: Schnittebenen des Stabs (Gehrung, Ausklinkung), sonst senkrecht zur Achse am äußersten Punkt
        let planes = (cl || []).map((c) => ({ p: c.p, n: norm(c.n) }));
        if (!planes.length) {
          let ext = -Infinity;
          try { const mm = body.shape.mesh({ tolerance: 2, angularTolerance: 0.5 }); for (let k = 0; k < mm.vertices.length; k += 3) ext = Math.max(ext, dot([mm.vertices[k], mm.vertices[k + 1], mm.vertices[k + 2]], u)); } catch { continue; }
          planes = [{ p: add(p, mul(u, ext - dot(p, u))), n: u }];
        }
        // Endbereich = Körper innerhalb 15 mm vor der Endebene
        const regions = [];
        for (const pl of planes) { try { const r = body.shape.clone().intersect(R.makeCylinder(20000, 40, sub(pl.p, mul(pl.n, 15)), pl.n)); if (R.measureVolume(r) > 1) regions.push(r); } catch { /* */ } }
        if (!regions.length) continue;
        let best = Infinity, by = "", byBody = null;
        for (const region of regions) {
          const rb = bbox(region);
          for (const bd of bodies) {
            if (bd === body || boxGap(rb, bd.box) > 12) continue;
            let d = Infinity;
            try { d = R.measureDistanceBetween(region, bd.shape); } catch { continue; }
            if (d < best) { best = d; by = bd.name; byBody = bd; }
          }
        }
        // greift der Stab an anderer Stelle in den Nachbarn (Stift in der Bohrung, Lasche auf Blech), ist das Ende frei, kein Spalt
        let engaged = false;
        // (auch an einem anderen Stück desselben Zugs, z. B. Halterstift am Gehrungsstoß des Handlaufs)
        if (best > 0.5 && best <= 12) {
          const root = by.replace(/ \d+$/, "");
          for (const nb of bodies.filter((x) => x === byBody || (root !== by && x.name.startsWith(root + " ")))) {
            if (engaged || boxGap(body.box, nb.box) > 0.5) continue;
            try { engaged = R.measureDistanceBetween(body.shape, nb.shape) <= 0.5; } catch { /* */ }
          }
        }
        // Ende steckt im Hohlraum des Nachbarn (Achsbolzen in der Lamelle, Stift im Rohr): Steckverbindung, kein Spalt
        const inside = (rb, ob) => [0, 1, 2].every((k) => rb.lo[k] >= ob.lo[k] - 0.5 && rb.hi[k] <= ob.hi[k] + 0.5);
        if (best > 0.5 && best <= 12 && !engaged && regions.some((rg) => inside(bbox(rg), byBody.box))) engaged = true;
        if (best > 0.5 && best <= 12 && !engaged) gaps.push({ part: segName, to: by, at: p.map((x) => Math.round(x)), gap: Math.round(best * 10) / 10 });
      }
    }
  }
  // zusammenhängende Gruppen
  const comp = new Array(bodies.length).fill(-1);
  let nc = 0;
  for (let i = 0; i < bodies.length; i++) {
    if (comp[i] >= 0) continue;
    const stack = [i]; comp[i] = nc;
    while (stack.length) { const k = stack.pop(); for (const j of touch[k]) if (comp[j] < 0) { comp[j] = nc; stack.push(j); } }
    nc++;
  }
  const groups = Array.from({ length: nc }, (_, c) => bodies.filter((b, i) => comp[i] === c).map((b) => b.name));
  // Netz für die Bilder
  const meshes = bodies.map((b) => {
    const m = b.shape.mesh({ tolerance: 0.5, angularTolerance: 0.4 });
    const e = b.shape.meshEdges({ tolerance: 0.5, angularTolerance: 0.4 });
    return { name: b.name, norm: b.norm, v: Array.from(m.vertices, (x) => Math.round(x * 10) / 10), t: Array.from(m.triangles), l: Array.from(e.lines, (x) => Math.round(x * 10) / 10) };
  });
  const bad = new Set([...coll.flatMap((c) => [c.ia, c.ib])]), lose = new Set(loose.map((l) => l.i)), cov = new Set(covered.map((c) => c.by));
  meshes.forEach((m, i) => { m.flag = bad.has(i) ? "kollision" : lose.has(i) ? "lose" : cov.has(m.name) ? "verdeckt" : ""; });
  fs.writeFileSync(path.join(out, name + ".mesh.json"), JSON.stringify(meshes));
  return { name, gen, bodies: bodies.length, info: st.info, warning: st.warning || "", collisions: coll.map(({ ia, ib, ...c }) => c), covered, gaps, loose: loose.map((l) => l.name), groups: groups.length > 1 ? groups.map((g) => (g.length > 6 ? [...g.slice(0, 6), `… (${g.length})`] : g)) : [], ms: Date.now() - t0 };
}

const report = [];
for (const c of CASES) {
  if (filter && !filter.test(c[0])) continue;
  let r;
  try { r = await checkCase(c); } catch (e) { r = { name: c[0], gen: c[1], error: e.message }; }
  report.push(r);
  console.log(`${r.name}: ${r.error ? "FEHLER " + r.error : `${r.bodies} Körper, ${r.collisions.length} Kollisionen, ${r.covered.length} verdeckte Bohrungen, ${r.gaps.length} Spalte, ${r.loose.length} lose, ${r.groups.length || 1} Gruppe(n)`}`);
  fs.writeFileSync(path.join(out, "bericht.json"), JSON.stringify(report, null, 1)); // nach jedem Fall (Zwischenstand lesbar)
}
