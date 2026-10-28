// Generator als Baugruppe mit Einzelteilen: jeder Stab, jedes Stück eines Profilzugs und jede Platte des Bauplans
// wird ein eigenes Bauteil (Feature »genteil«) in eigener Lage, die Baugruppe setzt es an seine Stelle. Gleiche Teile
// (gleiche Geometrie in eigener Lage) teilen sich ein Bauteil, z. B. alle Pfosten. Reine Rechnung; Bauplan siehe
// generator.js, Platzierung siehe placementMatrix in geom.js (M = T · Rz · Ry · Rx).

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const norm = (a) => { const l = Math.hypot(...a) || 1; return mul(a, 1 / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Hilfsrichtung wie memberFrame im Kernel: up, bei paralleler Achse +Y */
const upFor = (z, up = [0, 0, 1]) => (Math.abs(dot(norm(up), z)) > 0.999 ? [0, 1, 0] : up);
/** Rahmen eines Stabs A → B: x entlang der Achse, z ≈ up (Profilhöhe), y = z × x – im Bauteil liegt der Stab auf X */
function memberAxes(a, b, up) {
  const x = norm(sub(b, a)), u = upFor(x, up);
  const z = norm(sub(u, mul(x, dot(u, x))));
  return { o: a, x, y: cross(z, x), z, up: u };
}

/**
 * Alle Körper des Bauplans mit eindeutigem Schlüssel und eigener Lage { o, x, y, z }:
 * { key, kind: "member" | "chain" | "plate", index, seg?, name }
 */
export function planBodies(plan) {
  const out = [], seen = new Map();
  const uniq = (k) => { const n = (seen.get(k) || 0) + 1; seen.set(k, n); return n > 1 ? `${k} #${n}` : k; };
  (plan.chains || []).forEach((ch, index) => {
    const n = ch.points.length - 1;
    for (let seg = 0; seg < n; seg++) {
      const a = ch.points[seg], b = ch.points[seg + 1];
      if (Math.hypot(...sub(b, a)) < 1e-6) continue;
      const name = n > 1 ? `${ch.name} ${seg + 1}` : ch.name;
      out.push({ key: uniq("c:" + name), kind: "chain", index, seg, name, frame: memberAxes(a, b, ch.up) });
    }
  });
  (plan.members || []).forEach((m, index) => {
    if (Math.hypot(...sub(m.b, m.a)) < 1e-6) return;
    out.push({ key: uniq("m:" + m.name), kind: "member", index, name: m.name, frame: memberAxes(m.a, m.b, m.up) });
  });
  (plan.plates || []).forEach((pl, index) => {
    const x = norm(pl.xDir), z = norm(pl.normal);
    out.push({ key: uniq("p:" + pl.name), kind: "plate", index, name: pl.name, frame: { o: pl.center, x, y: cross(z, x), z } });
  });
  // Normteile (z. B. Schrauben) gemeinsam als ein Teil in Weltlage
  if ((plan.norms || []).length) out.push({ key: "n:Verbindungsmittel", kind: "norms", index: 0, name: "Verbindungsmittel", frame: { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] } });
  return out;
}

/** Bauplan nur mit diesem Körper, in seiner eigenen Lage (Ursprung, Achsen wie frame) */
export function localPlan(plan, body) {
  const { o, x, y, z } = body.frame;
  const D = (v) => [dot(v, x), dot(v, y), dot(v, z)], P = (v) => D(sub(v, o));
  const cutsL = (c) => c && { start: (c.start || []).map((q) => ({ p: P(q.p), n: D(q.n) })), end: (c.end || []).map((q) => ({ p: P(q.p), n: D(q.n) })) };
  const drillsFor = (target) => (plan.drills || []).filter((d) => d.target === target).map((d) => ({ ...d, p: P(d.p), dir: D(d.dir), ...(d.xDir ? { xDir: D(d.xDir) } : {}) }));
  const out = { members: [], chains: [], plates: [], drills: [], issues: [], info: "" };
  if (body.kind === "member") {
    const m = plan.members[body.index];
    // copes: Hüllkörper anderer Stäbe, die abgezogen werden (Gestell: Nuten, Stutzen an Rundrohr)
    const copes = m.copes && { copes: m.copes.map((c) => ({ ...c, a: P(c.a), b: P(c.b), up: D(c.up || [0, 0, 1]), cuts: cutsL(c.cuts || { start: [], end: [] }) })) };
    // tabs: angesetzte Quader (Gestell: Stecknasen)
    const tabs = m.tabs && { tabs: m.tabs.map((t) => ({ ...t, p: P(t.p), xDir: D(t.xDir), dir: D(t.dir) })) };
    out.members.push({ ...m, a: P(m.a), b: P(m.b), up: D(body.frame.up), ...(m.cuts ? { cuts: cutsL(m.cuts) } : {}), ...copes, ...tabs });
    out.drills = drillsFor(m.name);
  } else if (body.kind === "chain") {
    const ch = plan.chains[body.index];
    // nur das Stück und seine Nachbarn (Gehrungen hängen nur von ihnen ab)
    const i0 = Math.max(0, body.seg - 1), i1 = Math.min(ch.points.length - 1, body.seg + 2);
    out.chains.push({ ...ch, points: ch.points.slice(i0, i1 + 1).map(P), up: D(ch.up || [0, 0, 1]), onlySeg: body.seg - i0, segName: body.name });
    out.drills = drillsFor(ch.name);
  } else if (body.kind === "norms") {
    out.norms = plan.norms;
  } else {
    const pl = plan.plates[body.index];
    out.plates.push({ ...pl, center: [0, 0, 0], xDir: [1, 0, 0], normal: [0, 0, 1] });
    out.drills = drillsFor(pl.name);
  }
  return out;
}

/** Drehung (Grad um X, Y, Z wie placementMatrix) zu den Achsen eines Rahmens */
export function eulerOf({ x, y, z }) {
  // R = [x y z] (Spalten); R = Rz · Ry · Rx
  const r20 = x[2], r21 = y[2], r22 = z[2], r10 = x[1], r00 = x[0];
  const ry = Math.asin(Math.max(-1, Math.min(1, -r20)));
  let rx, rz;
  if (Math.abs(Math.cos(ry)) > 1e-9) { rx = Math.atan2(r21, r22); rz = Math.atan2(r10, r00); } else { rx = Math.atan2(-z[1], y[1]); rz = 0; } // Kardansperre
  const deg = (t) => { const d = (t * 180) / Math.PI; return Math.abs(d) < 1e-9 ? 0 : Math.round(d * 1e9) / 1e9; };
  return [deg(rx), deg(ry), deg(rz)];
}

/** Kennung gleicher Teile: Geometrie in eigener Lage, Namen zählen nicht */
export function bodySignature(lp) {
  const r = (v) => (typeof v === "number" ? Math.round(v * 100) / 100 + 0 : Array.isArray(v) ? v.map(r) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().filter((k) => !["name", "target", "segName", "geom", "gid"].includes(k)).map((k) => [k, r(v[k])])) : v);
  return JSON.stringify(r({ m: lp.members, c: lp.chains, p: lp.plates, d: lp.drills, n: lp.norms || [] }));
}

/** Teilename ohne laufende Nummer: »Geländer rechts Pfosten 3 Handlaufhalter« → »Geländer rechts Pfosten Handlaufhalter« */
export const baseName = (name) => String(name || "Teil").replace(/\s+#\d+$/, "").replace(/\s+\d+(\.\d+)*(?=\s|$)/g, "").trim() || "Teil";

/**
 * Einzelteile: gleiche Körper zusammengefasst. Ergebnis [{ sig, name, bodies: [{ key, name, pos, rot }] }],
 * Reihenfolge wie im Bauplan.
 */
export function groupParts(plan) {
  const groups = new Map();
  for (const b of planBodies(plan)) {
    const sig = bodySignature(localPlan(plan, b));
    if (!groups.has(sig)) groups.set(sig, { sig, base: baseName(b.name), key: b.key, bodies: [] });
    groups.get(sig).bodies.push({ key: b.key, name: b.name, pos: b.frame.o.map((v) => Math.round(v * 1e6) / 1e6 + 0), rot: eulerOf(b.frame) });
  }
  // gleicher Grundname, andere Geometrie: (2), (3) …
  const count = new Map(), list = [...groups.values()];
  for (const g of list) {
    const n = (count.get(g.base) || 0) + 1;
    count.set(g.base, n);
    g.name = n > 1 ? `${g.base} (${n})` : g.base;
  }
  return list;
}
