// Gestell-Generator wie in Inventor (Konstruktion → Gestell): Profile auf den Linien eines Skelett-Bauteils, jedes
// Profil ein eigenes Bauteil in einer Baugruppe (über genteil.js, Feature »genteil« mit gen »gestell«).
// Werkzeuge: Gestell einfügen (Profil, Lage zur Linie, Drehung, Versatz), Ändern, Gehrung, Eckverbindung,
// Auf Gestell stutzen, Nuten (Ausklinken an der Form des Gegenprofils), Verlängern/Kürzen je Ende, Wiederverwenden,
// Gestell-Info. Endkappe, Stutzen an einer Fläche und Gleichteile liegen in rahmen.js (Werkzeuge Stufe 40).
//
// Reine Rechnung: aus Skelett-Linien und den Einstellungen der Baugruppe (asm.gestell) entsteht ein Bauplan im Format
// der Generatoren (generator.js): members: [{ section, a, b, up, rot, cuts, copes, name, gid }]. Den Körper baut
// src/kernel/build.js wie bei den Generator-Einzelteilen.
//
// asm.gestell = {
//   skeleton: Bauteil-ID (Skelett: Skizzenlinien und Profilzüge), section: { kind, size, group? } (Vorgabe),
//   place: "mm" (Lage zur Linie, siehe PLACES), rot: Drehung in °, corner: Ecken automatisch, tee: T-Stöße automatisch, gap?: Spalt der Automatik und der Werkzeuge,
//   members: [{ id, no, seg, section?, place?, rot?, offU?, offV?, extA?, extB?, reuse?, plateA?, plateB? }] (Platte wie defaultPlatte),
//   joints: [{ id, kind (JOINT_KINDS), a, b (Stab-IDs), gap? }], next: nächste Stabnummer }
// Verbindungen von Hand gehen vor; was an einem Ende von Hand gesetzt ist, setzt die Automatik nicht mehr.

import { v3 } from "./geom.js";
import { sectionOf } from "./generator.js";
import { profileId } from "./sections.js";
import { sketchLines } from "./sketch.js";
import { solveSketch } from "./solver.js";
import { resolvePathPoints, pathSegments, upFor, UP_AXES } from "./profilzug.js";
import { tabLayout, slotSize, defaultStecksystem } from "./stecksystem.js";
import { platePlan } from "./anschluss.js";

/** Lage des Profils zur Skelettlinie: Ankerpunkt des Querschnitts auf der Linie (o/m/u = oben/Mitte/unten, l/m/r) */
export const PLACES = Object.freeze([
  ["ol", "oben links"], ["om", "oben Mitte"], ["or", "oben rechts"],
  ["ml", "Mitte links"], ["mm", "Mitte"], ["mr", "Mitte rechts"],
  ["ul", "unten links"], ["um", "unten Mitte"], ["ur", "unten rechts"],
]);

export const JOINT_KINDS = Object.freeze({
  gehrung: { label: "Gehrung", hint: "beide Enden auf der Winkelhalbierenden, Spalt je zur Hälfte" },
  ecke: { label: "Eckverbindung", hint: "erster Stab läuft bis zur Außenseite des zweiten, der zweite stößt stumpf an" },
  stutzen: { label: "Auf Gestell stutzen", hint: "zweiter Stab wird an der zugewandten Fläche des ersten gekürzt oder verlängert" },
  nuten: { label: "Nuten", hint: "zweiter Stab wird mit der Form des ersten ausgeklinkt (Endbearbeitung bleibt)" },
  stecken: { label: "Stecknasen", hint: "zweiter Stab wird gestutzt, Zapfen aus seinen Wänden stecken in Schlitzen (mit Spiel) im ersten" },
});
/** Verbindungen, bei denen ein Spalt (mm) zwischen den Stäben möglich ist */
export const GAP_KINDS = Object.freeze(["gehrung", "ecke", "stutzen"]);
export const CORNER_AUTO = Object.freeze([["gehrung", "Gehrung"], ["ecke", "Eckverbindung"], ["keine", "keine"]]);
export const TEE_AUTO = Object.freeze([["stutzen", "Auf Gestell stutzen"], ["nuten", "Nuten"], ["stecken", "Stecknasen"], ["keine", "keine"]]);
/** Stecknasen: Einstellungen wie im Stecksystem (stecksystem.js); Zapfenlänge leer = Wand des Schlitzstabs + Überstand */
export const STECK_FIELDS = Object.freeze([["count", "Anzahl je Wand"], ["width", "Zapfenbreite"], ["edge", "Randabstand"], ["clearance", "Spiel je Seite"], ["over", "Überstand"]]);
export const steckOf = (x) => ({ ...defaultStecksystem(), ...(x || {}) });
const HOLLOW_RECT = ["vierkant", "rechteck"];

const ROUND = ["rohr", "rund"];
const keyOf = (p) => p.map((x) => Math.round(x * 1e3)).join(",");
const num = (x, d = 0) => (Number.isFinite(Number(x)) && x !== "" && x != null ? Number(x) : d);

/**
 * Skelett-Linien eines Bauteils in Weltlage: [{ id, a, b, up, label }].
 * frameOf(sketchFeature) → Ebene der Skizze { origin, xDir, yDir, normal } oder null; E(ausdruck) für Profilzug-Punkte.
 * Skizzenlinien (ohne Konstruktionslinien) stehen mit der Profilhöhe senkrecht zur Skizzenebene, Profilzüge mit ihrer
 * Einstellung »Profilhöhe zeigt nach«. scope = Parameter des Bauteils: Skizzen werden damit gelöst (gespeicherte
 * Punkte stehen sonst auf dem Stand vor der letzten Bemaßung).
 */
export function skeletonSegments(part, { frameOf, E, scope = null }) {
  const out = [];
  for (const f of part?.features || []) {
    if (f.suppressed) continue;
    if (f.type === "sketch") {
      const fr = frameOf(f);
      if (!fr) continue;
      let sk = f;
      if (scope) { sk = JSON.parse(JSON.stringify(f)); if (!solveSketch(sk, scope).ok) sk = f; }
      const W = (p) => v3.add(fr.origin, v3.add(v3.mul(fr.xDir, p[0]), v3.mul(fr.yDir, p[1])));
      sketchLines(sk).forEach((l, i) => {
        const a = W(l.a), b = W(l.b);
        if (v3.dist(a, b) < 1e-6) return;
        out.push({ id: `${f.id}:${l.id}`, a, b, up: fr.normal, label: `${f.name || "Skizze"} Linie ${i + 1}` });
      });
    } else if (f.type === "profilzug") {
      let pts;
      try { pts = resolvePathPoints(f.points, E); } catch { continue; }
      const up = UP_AXES[f.up || "Z"] || UP_AXES.Z;
      let segs;
      try { segs = pathSegments(pts, !!f.closed); } catch { continue; }
      segs.forEach((s, i) => out.push({ id: `${f.id}:${s.id}`, a: s.a, b: s.b, up: upFor(v3.norm(v3.sub(s.b, s.a)), up), label: `${f.name || "Profilzug"} Stück ${i + 1}` }));
    }
  }
  return out.map((s) => ({ ...s, a: s.a.map(r6), b: s.b.map(r6), up: s.up.map(r6) }));
}
const r6 = (x) => Math.round(x * 1e6) / 1e6 + 0;

/** Neues Gestell auf allen Linien des Skeletts */
export function defaultGestell(skeleton, segments, section = { kind: "vierkant", size: "40x3" }) {
  const g = { skeleton, section, place: "mm", rot: 0, corner: "gehrung", tee: "stutzen", members: [], joints: [], next: 1 };
  for (const s of segments) addMember(g, s.id);
  return g;
}

/** Stab auf Linie seg einfügen; Rückgabe der Stab */
export function addMember(g, seg, extra = {}) {
  const m = { id: "gm" + (g.next || 1), no: g.next || 1, seg, ...extra };
  g.next = (g.next || 1) + 1;
  g.members.push(m);
  return m;
}

/** Stab entfernen samt seiner Verbindungen und Wiederverwendungen */
export function removeMember(g, id) {
  g.members = g.members.filter((m) => m.id !== id);
  g.joints = g.joints.filter((j) => j.a !== id && j.b !== id);
  for (const m of g.members) if (m.reuse === id) delete m.reuse;
}

/**
 * Verbindung von Hand setzen (ersetzt eine vorhandene zwischen denselben Stäben). kind = JOINT_KINDS-Schlüssel oder
 * »keine« (hebt auch die Automatik für dieses Paar auf).
 */
export function setJoint(g, kind, a, b, gap = 0) {
  if (a === b) throw new Error("Zwei verschiedene Stäbe wählen");
  if (kind !== "keine" && !JOINT_KINDS[kind]) throw new Error("Unbekannte Verbindung " + kind);
  g.joints = g.joints.filter((j) => !((j.a === a && j.b === b) || (j.a === b && j.b === a)));
  gap = Math.max(0, Number(gap) || 0);
  const j = { id: "gj" + Math.random().toString(36).slice(2, 9), kind, a, b, ...(gap && GAP_KINDS.includes(kind) ? { gap } : {}) };
  g.joints.push(j);
  return j;
}

/** Stabrahmen wie memberFrame im Kernel: v ≈ up (Höhe), u = v × z, gedreht um rot° */
export function memberFrame(origin, zDir, rotDeg = 0, upHint) {
  const z = v3.norm(zDir);
  let up = upHint || [0, 0, 1];
  if (Math.abs(v3.dot(up, z)) > 0.999) up = [0, 1, 0];
  let v = v3.norm(v3.sub(up, v3.mul(z, v3.dot(up, z))));
  let u = v3.cross(v, z);
  if (rotDeg) {
    const t = (rotDeg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    const u2 = v3.add(v3.mul(u, c), v3.mul(v, s));
    const v2 = v3.add(v3.mul(v, c), v3.mul(u, -s));
    u = u2; v = v2;
  }
  return { origin, z, u, v };
}

/** Verschiebung des Profils gegenüber der Linie für Ankerpunkt place (Querschnitt w × h im Rahmen u, v) */
export function placeShift(place, w, h) {
  const p = PLACES.some(([k]) => k === place) ? place : "mm";
  const su = p[1] === "l" ? 1 : p[1] === "r" ? -1 : 0; // links auf der Linie → Profil liegt rechts davon (+u)
  const sv = p[0] === "o" ? -1 : p[0] === "u" ? 1 : 0; // oben auf der Linie → Profil hängt darunter (−v)
  return [(su * w) / 2, (sv * h) / 2];
}

/** Nächstliegende Punkte zweier Geraden (p1 + s·d1, p2 + t·d2); null bei parallelen Geraden */
function closest(p1, d1, p2, d2) {
  const r = v3.sub(p1, p2), a = v3.dot(d1, d1), b = v3.dot(d1, d2), c = v3.dot(d2, d2), d = v3.dot(d1, r), e = v3.dot(d2, r);
  const den = a * c - b * b;
  if (Math.abs(den) < 1e-9) return null;
  const s = (b * e - c * d) / den, t = (a * e - b * d) / den;
  return { q1: v3.add(p1, v3.mul(d1, s)), q2: v3.add(p2, v3.mul(d2, t)) };
}

/**
 * Bauplan des Gestells. input = asm.gestell plus segments (skeletonSegments).
 * Rückgabe { members, chains: [], plates: [], drills: [], issues, info, rows }
 * rows (für Gestell-Info): [{ id, no, name, profile, seg, len (Achse zwischen den Endschnitten), joints: [Text], reuse }]
 */
export function gestellPlan(input) {
  const segs = new Map((input?.segments || []).map((s) => [s.id, s]));
  const issues = [];
  const warn = (message) => issues.push({ level: "Warnung", message });
  const M = [], byId = new Map();
  for (const m of input?.members || []) {
    const s = segs.get(m.seg);
    const label = `Stab ${m.no}`;
    if (!s) { warn(`${label}: Skelettlinie fehlt (gelöscht?) – Stab entfällt`); continue; }
    let sec;
    try { sec = sectionOf(m.section || input.section, `${label}: Profil`); } catch (e) { warn(e.message); continue; }
    const rot = num(m.rot, num(input.rot));
    const z = v3.norm(v3.sub(s.b, s.a));
    const fr0 = memberFrame(s.a, z, rot, s.up);
    const [du, dv] = placeShift(m.place || input.place || "mm", sec.geom.width, sec.geom.height);
    const off = v3.add(v3.mul(fr0.u, du + num(m.offU)), v3.mul(fr0.v, dv + num(m.offV)));
    const a = v3.add(s.a, off), b = v3.add(s.b, off);
    const o = { m, s, sec, rot, z, a, b, fr: { ...fr0, origin: a }, len: v3.dist(a, b), cuts: { start: [], end: [] }, copes: [], tabs: [], slots: [], taken: { start: false, end: false }, joints: [], label };
    M.push(o);
    byId.set(m.id, o);
  }

  // Seite des Profils o, auf die die Richtung d trifft: Normale (zu d hin), halbe Breite bzw. Höhe
  const sideOf = (o, d) => {
    const du = Math.abs(v3.dot(o.fr.u, d)), dv = Math.abs(v3.dot(o.fr.v, d));
    return du >= dv - 1e-9 ? { n: o.fr.u, half: o.sec.geom.width / 2 } : { n: o.fr.v, half: o.sec.geom.height / 2 };
  };
  const endNear = (o, P) => (v3.dist(P, o.a) <= v3.dist(P, o.b) ? "start" : "end");
  const into = (o, end) => (end === "start" ? o.z : v3.mul(o.z, -1)); // vom Knoten in den Stab hinein
  const nodeOf = (A, B) => {
    const c = closest(A.a, A.z, B.a, B.z);
    if (!c) return null;
    return { P: v3.mul(v3.add(c.q1, c.q2), 0.5), qA: c.q1, qB: c.q2, skew: v3.dist(c.q1, c.q2) };
  };
  // B an der Fläche von A stutzen, die B zugewandt ist (rund: an der Achse + Hüllkörper von A abziehen)
  const trimTo = (B, endB, A, nd, gap = 0) => {
    const dB = into(B, endB);
    if (ROUND.includes(A.sec.kind)) {
      let n = v3.norm(v3.sub(dB, v3.mul(A.z, v3.dot(dB, A.z))));
      if (v3.len(n) < 1e-6) n = sideOf(A, dB).n;
      B.cuts[endB] = [{ p: nd.qA, n: v3.mul(n, -1) }];
      B.copes.push(A);
      return;
    }
    const sd = sideOf(A, dB);
    const n = v3.dot(sd.n, dB) > 0 ? v3.mul(sd.n, -1) : sd.n; // zeigt von B weg zu A hin
    B.cuts[endB] = [{ p: v3.add(v3.sub(nd.qA, v3.mul(n, sd.half)), v3.mul(n, -gap)), n }];
  };
  const steck = []; // Stecknasen, gerechnet nach dem Verlängern/Kürzen
  let steckOpts = null;
  const apply = (kind, A, B, gap, how) => {
    const nd = nodeOf(A, B);
    if (!nd) { warn(`${A.label} und ${B.label} laufen parallel – keine ${JOINT_KINDS[kind].label}`); return false; }
    if (nd.skew > Math.max(A.sec.geom.width, A.sec.geom.height, B.sec.geom.width, B.sec.geom.height)) warn(`${A.label} und ${B.label} treffen sich nicht (Abstand ${Math.round(nd.skew)} mm) – ${JOINT_KINDS[kind].label} trotzdem gesetzt`);
    const eA = endNear(A, nd.P), eB = endNear(B, nd.P);
    const text = `${JOINT_KINDS[kind].label} ${how}`;
    if (kind === "gehrung") {
      const dA = into(A, eA), dB = into(B, eB);
      if (Math.abs(v3.dot(dA, dB)) > 0.9999) { warn(`${A.label} und ${B.label} liegen auf einer Linie – keine Gehrung`); return false; }
      const mv = v3.norm(v3.sub(dA, dB));
      A.cuts[eA] = [{ p: v3.add(nd.P, v3.mul(mv, gap / 2)), n: v3.mul(mv, -1) }];
      B.cuts[eB] = [{ p: v3.sub(nd.P, v3.mul(mv, gap / 2)), n: mv }];
      A.taken[eA] = B.taken[eB] = true;
    } else if (kind === "ecke") {
      // A läuft bis zur Außenseite von B
      const dA = into(A, eA), sd = sideOf(B, dA);
      const o = v3.dot(sd.n, dA) > 0 ? v3.mul(sd.n, -1) : sd.n;
      A.cuts[eA] = [{ p: v3.add(nd.qB, v3.mul(o, sd.half)), n: o }];
      trimTo(B, eB, A, nd, gap);
      A.taken[eA] = B.taken[eB] = true;
    } else if (kind === "stutzen") {
      trimTo(B, eB, A, nd, gap);
      B.taken[eB] = true;
    } else if (kind === "nuten") {
      B.copes.push(A);
      B.taken[eB] = true;
    } else if (kind === "stecken") {
      trimTo(B, eB, A, nd, 0);
      B.taken[eB] = true;
      if (ROUND.includes(A.sec.kind) || !(HOLLOW_RECT.includes(B.sec.kind) || B.sec.kind === "flach")) warn(`${B.label}: Stecknasen nur von Rechteck-/Quadratrohr oder Flachstahl in ein eckiges Profil – nur gestutzt`);
      else steck.push({ A, B, eB, opts: steckOf(steckOpts) });
    }
    A.joints.push(`${text} mit ${B.label}`);
    B.joints.push(`${text} mit ${A.label}`);
    return true;
  };

  // 1) von Hand gesetzte Verbindungen
  const manual = new Set();
  for (const j of input?.joints || []) {
    const A = byId.get(j.a), B = byId.get(j.b);
    if (!A || !B) continue;
    manual.add([j.a, j.b].sort().join("|"));
    if (j.kind === "keine") continue;
    if (!JOINT_KINDS[j.kind]) { warn(`Unbekannte Verbindung ${j.kind}`); continue; }
    steckOpts = j.steck || input.steck;
    apply(j.kind, A, B, Math.max(0, num(j.gap)), "(von Hand)");
  }
  const isManual = (A, B) => manual.has([A.m.id, B.m.id].sort().join("|"));

  // 2) Automatik an Knoten der Skelettlinien (Wiederverwendete Stäbe bekommen ihre Enden vom Vorbild)
  const auto = M.filter((o) => !o.m.reuse);
  const nodes = new Map();
  for (const o of auto) for (const [end, p] of [["start", o.s.a], ["end", o.s.b]]) {
    const k = keyOf(p);
    if (!nodes.has(k)) nodes.set(k, []);
    nodes.get(k).push({ o, end, p });
  }
  const corner = input?.corner || "gehrung", tee = input?.tee || "stutzen", autoGap = Math.max(0, num(input?.gap));
  steckOpts = input?.steck;
  for (const [, list] of nodes) {
    const free = list.filter((x) => !x.o.taken[x.end]);
    if (list.length === 1 && free.length === 1) {
      if (tee === "keine") continue;
      // freies Ende auf einer anderen Linie: T-Stoß
      const { o, p } = free[0];
      for (const q of auto) {
        if (q === o || isManual(q, o)) continue;
        const t = v3.dot(v3.sub(p, q.s.a), q.z), L = v3.dist(q.s.a, q.s.b);
        const perp = v3.dist(p, v3.add(q.s.a, v3.mul(q.z, t)));
        if (perp < 1e-3 && t > 1e-3 && t < L - 1e-3) { apply(tee, q, o, autoGap, "(automatisch)"); break; }
      }
      continue;
    }
    if (list.length === 2 && free.length === 2) {
      const [x, y] = list;
      if (isManual(x.o, y.o) || corner === "keine") continue;
      const dX = into(x.o, x.end), dY = into(y.o, y.end);
      if (Math.abs(v3.dot(dX, dY)) > 0.9999) continue; // gerade weiter: Stoß ohne Bearbeitung
      const [A, B] = x.o.m.no < y.o.m.no ? [x.o, y.o] : [y.o, x.o];
      apply(corner, A, B, autoGap, "(automatisch)");
      continue;
    }
    if (list.length > 2 && free.length > 1) warn(`Knoten mit ${list.length} Stäben (${list.map((x) => x.o.label).join(", ")}): Verbindung von Hand setzen`);
  }

  // 3) Verlängern/Kürzen je Ende: Endpunkt und Endschnitt entlang der Achse verschieben (+ = länger)
  for (const o of auto) {
    for (const [end, key] of [["start", "extA"], ["end", "extB"]]) {
      const d = num(o.m[key]);
      if (!d) continue;
      const out = end === "start" ? v3.mul(o.z, -d) : v3.mul(o.z, d);
      if (end === "start") o.a = v3.add(o.a, out); else o.b = v3.add(o.b, out);
      o.cuts[end] = o.cuts[end].map((c) => ({ ...c, p: v3.add(c.p, out) }));
    }
    o.fr = { ...o.fr, origin: o.a };
    o.len = v3.dist(o.a, o.b);
    if (o.len < 1) warn(`${o.label} ist nach dem Kürzen zu kurz`);
  }

  // 3b) Stecknasen: Zapfen aus den Wänden von B, deren Berührlinie mit der Fläche von A längs zur Achse von A liegt,
  // Schlitze (Zapfen + 2 × Spiel) durch die Wand von A
  for (const { A, B, eB, opts } of steck) {
    const c0 = B.cuts[eB][0];
    if (!c0) continue;
    const nOut = v3.mul(c0.n, -1), F = c0.p; // Fläche von A, Normale zu B hin
    const den = v3.dot(B.z, nOut);
    if (Math.abs(den) < 0.05) { warn(`${B.label}: Stecknasen – Stab steht zu flach auf ${A.label}`); continue; }
    const C = v3.add(B.a, v3.mul(B.z, v3.dot(v3.sub(F, B.a), nOut) / den)); // Stabachse auf der Fläche
    const tA = A.sec.dims.t, flat = B.sec.kind === "flach";
    if (!(tA > 0)) { warn(`${A.label}: Wanddicke unbekannt – keine Stecknasen`); continue; }
    const W = B.sec.geom.width, H = B.sec.geom.height, tB = flat ? H : B.sec.dims.t, r = flat ? 0 : Number.isFinite(B.sec.dims.r) ? B.sec.dims.r : 2 * tB;
    // Wandpaare: Normale ±u (Berührlinie entlang v, Länge H) oder ±v (entlang u, Länge W); Flachstahl: eine Wand in der Mitte
    const pairs = flat ? [{ n: B.fr.v, along: B.fr.u, L: W, off: [0] }] : [
      { n: B.fr.u, along: B.fr.v, L: H, off: [W / 2 - tB / 2, -(W / 2 - tB / 2)] },
      { n: B.fr.v, along: B.fr.u, L: W, off: [H / 2 - tB / 2, -(H / 2 - tB / 2)] },
    ];
    const proj = (d) => v3.norm(v3.sub(d, v3.mul(nOut, v3.dot(d, nOut))));
    // ebener Bereich der Fläche von A quer zu seiner Achse (ohne Eckradien): dort müssen die Schlitze liegen
    const crossA = Math.abs(v3.dot(A.fr.u, nOut)) >= Math.abs(v3.dot(A.fr.v, nOut)) ? A.fr.v : A.fr.u;
    const rA = Number.isFinite(A.sec.dims.r) ? A.sec.dims.r : 2 * tA;
    const limit = (crossA === A.fr.u ? A.sec.geom.width : A.sec.geom.height) / 2 - rA;
    const len = num(opts.length) > 0 ? num(opts.length) : tA + num(opts.over);
    const w = num(opts.width), sl = slotSize(w, tB, num(opts.clearance));
    let best = null, why = "";
    for (const q of pairs.map((x) => ({ ...x, along: proj(x.along), score: Math.abs(v3.dot(proj(x.along), A.z)) })).sort((x, y) => y.score - x.score)) {
      const L = q.L - 2 * r;
      let xs;
      try { xs = tabLayout(L, opts); } catch (e) { why = why || e.message; continue; }
      const pos = q.off.flatMap((off) => xs.map((x) => v3.add(v3.add(C, v3.mul(q.n, off)), v3.mul(q.along, x - L / 2))));
      const ext = (Math.abs(v3.dot(q.along, crossA)) * sl.w + Math.abs(v3.dot(q.n, crossA)) * sl.t) / 2;
      if (pos.some((P) => Math.abs(v3.dot(v3.sub(P, A.a), crossA)) + ext > limit + 1e-6)) { why = why || `Schlitze lägen im Eckradius von ${A.label}`; continue; }
      best = { ...q, pos, n: xs.length * q.off.length };
      break;
    }
    if (!best) { warn(`${B.label}: Stecknasen – ${why || "kein Platz"}`); continue; }
    for (const P of best.pos) {
      B.tabs.push({ p: v3.add(P, v3.mul(nOut, 0.05)), xDir: best.along, dir: v3.mul(nOut, -1), w, h: tB, len: len + 0.05 });
      A.slots.push({ p: v3.add(P, v3.mul(nOut, 1)), xDir: best.along, dir: v3.mul(nOut, -1), w: sl.w, h: sl.t, len: tA + 2 });
    }
    B.joints.push(`${best.n} Zapfen ${fmt1(w)} × ${fmt1(tB)}, Länge ${fmt1(len)}`);
    A.joints.push(`${best.n} Schlitze ${fmt1(sl.w)} × ${fmt1(sl.t)} für ${B.label}`);
  }

  // Ausgabe in Generator-Form
  const pid = (o) => secLabel(o.sec);
  const copeOf = (c) => ({ section: c.sec, a: c.a, b: c.b, up: c.s.up, rot: c.rot, cuts: c.cuts });
  const member = (o) => ({ gid: o.m.id, name: `${pid(o)} ${o.m.no}`, section: o.sec, a: o.a, b: o.b, up: o.s.up, rot: o.rot, cuts: o.cuts, ...(o.copes.length ? { copes: o.copes.map(copeOf) } : {}), ...(o.tabs.length ? { tabs: o.tabs } : {}) });
  const out = new Map(auto.map((o) => [o.m.id, member(o)]));
  const slots = new Map(auto.filter((o) => o.slots.length).map((o) => [o.m.id, o.slots])); // je Stab: Schlitze (Bohrungen des Bauplans)

  // 4) Wiederverwenden: Stab übernimmt Profil, Länge und Endbearbeitung seines Vorbilds, gelegt auf die eigene Linie
  for (const o of M.filter((x) => x.m.reuse)) {
    const src = out.get(o.m.reuse), so = byId.get(o.m.reuse);
    if (!src || so?.m.reuse) { warn(`${o.label}: Vorbild zum Wiederverwenden fehlt`); continue; }
    const L = v3.dist(src.a, src.b);
    if (Math.abs(L - v3.dist(o.s.a, o.s.b)) > 0.5) warn(`${o.label}: Länge der Linie (${round1(v3.dist(o.s.a, o.s.b))} mm) weicht vom Vorbild ${so.label} ab – Vorbild (${round1(L)} mm) wird übernommen`);
    // Lage zur Linie wie beim Vorbild: dessen Versatz (quer und längs) im eigenen Rahmen
    const Fs = axesOf(src.a, src.b, src.up), Fn0 = axesOf(o.s.a, o.s.b, o.s.up);
    const offS = v3.sub(src.a, so.s.a), offL = [v3.dot(offS, Fs.x), v3.dot(offS, Fs.y), v3.dot(offS, Fs.z)];
    const a = v3.add(o.s.a, v3.add(v3.add(v3.mul(Fn0.x, offL[0]), v3.mul(Fn0.y, offL[1])), v3.mul(Fn0.z, offL[2])));
    const T = mapper(Fs, { ...Fn0, o: a });
    const mapCuts = (c) => ({ start: c.start.map((q) => ({ p: T.p(q.p), n: T.d(q.n) })), end: c.end.map((q) => ({ p: T.p(q.p), n: T.d(q.n) })) });
    out.set(o.m.id, {
      ...src, gid: o.m.id, name: `${pid(so)} ${o.m.no}`, a: T.p(src.a), b: T.p(src.b), up: T.d(src.up), cuts: mapCuts(src.cuts),
      ...(src.copes ? { copes: src.copes.map((c) => ({ ...c, a: T.p(c.a), b: T.p(c.b), up: T.d(c.up), cuts: mapCuts(c.cuts) })) } : {}),
      ...(src.tabs ? { tabs: src.tabs.map((t) => ({ ...t, p: T.p(t.p), xDir: T.d(t.xDir), dir: T.d(t.dir) })) } : {}),
    });
    if (slots.has(so.m.id)) slots.set(o.m.id, slots.get(so.m.id).map((t) => ({ ...t, p: T.p(t.p), xDir: T.d(t.xDir), dir: T.d(t.dir) })));
    o.joints.push(`wiederverwendet von ${so.label}`);
    o.sec = so.sec;
  }

  // 5) Kopf- und Fußplatten am Stabende (wie Anschlussbleche: außen am geraden Ende, Mitte auf der Achse, Stab bleibt lang)
  const plates = [];
  for (const o of M) {
    const pm = out.get(o.m.id);
    if (!pm) continue;
    const z = v3.norm(v3.sub(pm.b, pm.a)), fr = memberFrame(pm.a, z, pm.rot, pm.up);
    for (const [end, key, tag] of [["start", "plateA", "A"], ["end", "plateB", "B"]]) {
      const st = o.m[key] ?? (o.m.reuse ? byId.get(o.m.reuse)?.m[key] : null); // wiederverwendet: Platte vom Vorbild
      if (!st) continue;
      const P0 = end === "start" ? pm.a : pm.b, out1 = end === "start" ? v3.mul(z, -1) : z;
      const cs = pm.cuts[end] || [];
      if (cs.length > 1 || (cs.length && Math.abs(v3.dot(v3.norm(cs[0].n), z)) < 0.9999)) { warn(`${o.label}: Platte an Ende ${tag} nur an geradem Ende – Gehrung oder Ausklinkung dort zuerst aufheben`); continue; }
      const C = cs.length ? v3.add(P0, v3.mul(z, v3.dot(v3.sub(cs[0].p, P0), z))) : P0;
      let pl;
      try { pl = platePlan(o.sec.geom, { thickness: num(st.thickness, 10), overhang: num(st.overhang), width: num(st.width), height: num(st.height), radius: num(st.radius), holes: num(st.holes), holeDia: num(st.holeDia), edge: num(st.edge) }); }
      catch (e) { warn(`${o.label}, Platte ${tag}: ${e.message}`); continue; }
      for (const x of pl.issues) warn(`${o.label}, Platte ${tag}: ${x.message}`);
      plates.push({ center: C, xDir: fr.u, normal: out1, W: pl.W, H: pl.H, t: pl.t, r: pl.r, holes: pl.holes, d: pl.d, name: `Platte ${round1(pl.W)}x${round1(pl.H)}x${round1(pl.t)}` });
      o.joints.push(`Platte ${fmt1(pl.W)} × ${fmt1(pl.H)} × ${fmt1(pl.t)} an Ende ${tag}`);
    }
  }

  const members = M.map((o) => out.get(o.m.id)).filter(Boolean);
  const rows = M.filter((o) => out.has(o.m.id)).map((o) => {
    const pm = out.get(o.m.id);
    return { id: o.m.id, no: o.m.no, name: pm.name, profile: secLabel(o.sec), seg: o.s.label, len: axisLength(pm), angA: cutDeg(pm.cuts.start, pm), angB: cutDeg(pm.cuts.end, pm), joints: o.joints, reuse: o.m.reuse ? byId.get(o.m.reuse)?.label : "" };
  });
  const drills = [...slots].flatMap(([id, list]) => { const pm = out.get(id); return pm ? list.map((d) => ({ ...d, target: pm.name })) : []; });
  return { members, chains: [], plates, drills, issues, rows, info: `${members.length} Stäbe` + (plates.length ? `, ${plates.length} Platten` : "") };
}

const round1 = (x) => Math.round(x * 10) / 10;
const fmt1 = (x) => String(round1(x)).replace(".", ",");
/** Profilbezeichnung kurz wie in der Zuschnittliste, z. B. »QR 40x40x3« */
export const secLabel = (sec) => profileId(sec.kind, sec.dims) || sec.kind;

/** Rahmen wie memberAxes in genteil.js (x = Achse, z ≈ up) */
function axesOf(a, b, up) {
  const x = v3.norm(v3.sub(b, a));
  const u = Math.abs(v3.dot(v3.norm(up), x)) > 0.999 ? [0, 1, 0] : up;
  const z = v3.norm(v3.sub(u, v3.mul(x, v3.dot(u, x))));
  return { o: a, x, y: v3.cross(z, x), z };
}
/** Abbildung von Rahmen F nach G (Punkte und Richtungen) */
function mapper(F, G) {
  const loc = (d) => [v3.dot(d, F.x), v3.dot(d, F.y), v3.dot(d, F.z)];
  const wor = (l) => v3.add(v3.add(v3.mul(G.x, l[0]), v3.mul(G.y, l[1])), v3.mul(G.z, l[2]));
  return { p: (p) => v3.add(G.o, wor(loc(v3.sub(p, F.o)))), d: (d) => wor(loc(d)) };
}

/** Länge auf der Stabachse zwischen den Endschnitten (ohne Schnitt: Endpunkt) */
export function axisLength(pm) {
  const z = v3.norm(v3.sub(pm.b, pm.a)), L = v3.dist(pm.a, pm.b);
  const at = (list, dflt) => {
    if (!list?.length) return dflt;
    const c = list[0], cz = v3.dot(c.n, z);
    if (Math.abs(cz) < 1e-6) return dflt;
    return v3.dot(v3.sub(c.p, pm.a), c.n) / cz;
  };
  return round1(at(pm.cuts.end, L) - at(pm.cuts.start, 0));
}
/** Schnittwinkel eines Endes zur Senkrechten auf die Achse in ° (0 = rechtwinklig) */
function cutDeg(list, pm) {
  if (!list?.length) return 0;
  const z = v3.norm(v3.sub(pm.b, pm.a));
  return round1((Math.acos(Math.min(1, Math.abs(v3.dot(v3.norm(list[0].n), z)))) * 180) / Math.PI);
}

/** Gestell-Info als CSV (Semikolon, deutsch) */
export function gestellCsv(rows) {
  const esc = (s) => (/[;"\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
  const f = (x) => String(x).replace(".", ",");
  return ["Stab;Profil;Skelettlinie;Länge Achse (mm);Schnitt A (°);Schnitt B (°);Masse (kg);Verbindungen",
    ...rows.map((r) => [r.name, r.profile, r.seg, f(r.len), f(r.angA), f(r.angB), r.mass ? f(Math.round(r.mass * 1000) / 1000) : "", r.joints.join(", ")].map(esc).join(";"))].join("\n");
}
