// Pfostenbefestigung an Geländern (Plan „Montageplatten und Befestigung an Geländerpfosten“, docs/roadmap/
// pfostenbefestigung.md): Anschlussflächen von Profilen, Platten und Untergrund, lokale Koordinatensysteme für
// Montagefläche und Pfosten, Prüfung auf Kollision. Reine Rechnung; die Generatoren rufen das Modul dort auf, wo der
// Pfostenfuß entsteht, und übernehmen Platten, Bohrungen (Bauplan-Format siehe generator.js) und Meldungen.
//
// Querschnitt-Koordinaten wie sections.js: x entlang u (Profilbreite), y entlang v (Profilhöhe). Stabrahmen wie
// memberFrame im Kernel: z = Achse a → b, v ≈ up, u = v × z, Drehung rot um die Achse.

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return mul(a, 1 / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const fmt = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
const DEG = Math.PI / 180;
import { fieldError } from "./generror.js";

export const vec = { dot, add, sub, mul, len, norm, cross };

// ---------- Flächen eines Querschnitts ----------

/**
 * Die vier Hüllseiten eines Profils in Querschnitt-Koordinaten. Je Seite:
 * { side: "+x" | "-x" | "+y" | "-y", n: [nx, ny] (außen), half (Abstand Mitte → Fläche), wall (Materialdicke hinter
 *   der Fläche), lo, hi: { at, edge } nutzbarer Bereich quer zur Stabachse (entlang x bei ±y, entlang y bei ±x) mit
 *   Randart "kante" (freie Kante: Randabstand) oder "innen" (Rundung, Steg, Flansch: Bohrung muss frei bleiben),
 *   exclude: [[a, b]] gesperrte Bereiche quer (z. B. Steg unter dem Flansch), open: Grund, wenn die Seite offen ist }.
 * Rundprofile haben keine ebene Fläche: { round: true }.
 */
export function profileFaces(sec) {
  const k = sec.kind, d = sec.dims || {}, g = sec.geom || {};
  const W = g.width ?? d.B ?? d.D, H = g.height ?? d.H ?? d.B ?? d.D;
  const face = (side, wall, lo, hi, extra = {}) => {
    const n = { "+x": [1, 0], "-x": [-1, 0], "+y": [0, 1], "-y": [0, -1] }[side];
    return { side, n, half: side.endsWith("x") ? W / 2 : H / 2, wall, lo, hi, exclude: [], ...extra };
  };
  const K = (at) => ({ at, edge: "kante" }), I = (at) => ({ at, edge: "innen" });
  const open = (side, why) => face(side, 0, K(0), K(0), { open: why });
  switch (k) {
    case "rohr":
    case "rund":
      return ["+x", "-x", "+y", "-y"].map((s) => ({ ...open(s, "Rundprofil hat keine ebene Anschlussfläche"), round: true }));
    case "vierkant":
    case "rechteck": {
      const t = d.t, r = Number.isFinite(d.r) ? Math.max(0, d.r) : 2 * t;
      return [face("+x", t, I(-H / 2 + r), I(H / 2 - r)), face("-x", t, I(-H / 2 + r), I(H / 2 - r)), face("+y", t, I(-W / 2 + r), I(W / 2 - r)), face("-y", t, I(-W / 2 + r), I(W / 2 - r))];
    }
    case "flach":
      return [face("+x", W, K(-H / 2), K(H / 2)), face("-x", W, K(-H / 2), K(H / 2)), face("+y", H, K(-W / 2), K(W / 2)), face("-y", H, K(-W / 2), K(W / 2))];
    case "vierkantvoll":
      return ["+x", "-x", "+y", "-y"].map((s) => face(s, W, K(-W / 2), K(W / 2)));
    case "u": {
      // Steg unten (−y), Flansche links/rechts, offen nach +y
      const t = d.t;
      return [face("+x", t, I(-H / 2 + t), K(H / 2)), face("-x", t, I(-H / 2 + t), K(H / 2)), open("+y", "offene Seite des U-Profils"), face("-y", t, I(-W / 2 + t), I(W / 2 - t))];
    }
    case "upn": {
      // Steg links (−x), Flansche oben/unten, offen nach +x
      const s = d.s, t = d.t, r = d.r || 0;
      return [open("+x", "offene Seite des U-Profils"), face("-x", s, I(-H / 2 + t + r), I(H / 2 - t - r)), face("+y", t, I(-W / 2 + s + r), K(W / 2)), face("-y", t, I(-W / 2 + s + r), K(W / 2))];
    }
    case "winkel": {
      // Schenkel unten (−y) und links (−x)
      const t = d.t;
      return [open("+x", "Schenkelende des Winkels"), face("-x", t, I(-H / 2 + t), K(H / 2)), open("+y", "Schenkelende des Winkels"), face("-y", t, I(-W / 2 + t), K(W / 2))];
    }
    case "ipe":
    case "hea":
    case "heb": {
      const s = d.s, t = d.t, r = d.r || 0, ex = [[-s / 2 - r, s / 2 + r]];
      return [open("+x", "offene Seite des I-Profils"), open("-x", "offene Seite des I-Profils"), face("+y", t, K(-W / 2), K(W / 2), { exclude: ex }), face("-y", t, K(-W / 2), K(W / 2), { exclude: ex })];
    }
    case "t": {
      // Flansch oben (+y), Steg nach unten
      const t = d.t, r = d.r || 0;
      return [open("+x", "Flanschkante des T-Profils"), open("-x", "Flanschkante des T-Profils"), face("+y", t, K(-W / 2), K(W / 2), { exclude: [[-t / 2 - r, t / 2 + r]] }), open("-y", "Stegende des T-Profils")];
    }
  }
  throw new Error("Unbekannte Profilart: " + k);
}

// ---------- Anschlussflächen in Weltlage ----------

/** Stabrahmen wie memberFrame im Kernel: { o, z, u, v } */
export function memberAxes(a, b, up = [0, 0, 1], rot = 0) {
  const z = norm(sub(b, a));
  if (Math.abs(dot(norm(up), z)) > 0.999) up = [0, 1, 0];
  let v = norm(sub(up, mul(z, dot(up, z)))), u = cross(v, z);
  if (rot) {
    const t = rot * DEG, c = Math.cos(t), s = Math.sin(t);
    [u, v] = [add(mul(u, c), mul(v, s)), add(mul(v, c), mul(u, -s))];
  }
  return { o: a, z, u, v };
}

/**
 * Anschlussfläche (eben, begrenzt): { name, label, target, targetKind: "member" | "plate" | null, o (Punkt auf der
 * Fläche), n (Normale nach außen), s (längs), c (quer, c = n × s), sRange, cLo, cHi ({ at, edge } bzw. null =
 * unbegrenzt), exclude, wall, plate? }. Punkte rechnen sich mit faceCoords in (s, c, h) um.
 */
function makeFace(f) {
  return { exclude: [], wall: 0, sRange: [-Infinity, Infinity], cLo: null, cHi: null, ...f, c: cross(f.n, f.s) };
}

/**
 * Fläche eines Stabs (Bauplan-Eintrag { name, a, b, section, up?, rot? }), deren Normale am besten zu want passt.
 * Wirft mit verständlichem Text, wenn die Fläche offen, rund oder nicht eindeutig ist.
 */
export function memberFace(m, want, label = m.name) {
  const ax = memberAxes(m.a, m.b, m.up || [0, 0, 1], m.rot || 0);
  const faces = profileFaces(m.section);
  if (faces[0].round) throw new Error(`${label}: ${faces[0].open}`);
  const W = norm(want);
  const scored = faces.map((f) => ({ f, n: norm(add(mul(ax.u, f.n[0]), mul(ax.v, f.n[1]))) })).map((x) => ({ ...x, score: dot(x.n, W) })).sort((p, q) => q.score - p.score);
  const best = scored[0];
  if (best.score < 0.5) throw new Error(`${label}: keine Profilseite zeigt in die gewünschte Richtung`);
  if (scored[1].score > best.score - 0.05) throw new Error(`${label}: Anschlussfläche nicht eindeutig – Profil steht über Eck`);
  const f = best.f;
  if (f.open) throw new Error(`${label}: ${f.open} – andere Anschlussseite wählen`);
  // quer zur Achse in der Fläche: x-Seiten quer entlang v, y-Seiten entlang u; c = n × s muss dazu passen
  const qAxis = f.side.endsWith("x") ? ax.v : ax.u;
  const s = ax.z, c = cross(best.n, s), sign = dot(c, qAxis) >= 0 ? 1 : -1;
  const flip = (r) => r && { at: sign * r.at, edge: r.edge };
  const [lo, hi] = sign > 0 ? [f.lo, f.hi] : [flip(f.hi), flip(f.lo)];
  const across = (f.side.endsWith("x") ? m.section.geom.height : m.section.geom.width) / 2;
  const face = makeFace({ name: m.name, label: `${label} (${SIDE_LABEL[f.side]?.(m.section.kind) || "Seite"})`, target: m.name, targetKind: "member",
    o: add(m.a, mul(best.n, f.half)), n: best.n, s, sRange: axisRange(m), cLo: lo, cHi: hi, cPhys: [-across, across], wall: f.wall,
    exclude: f.exclude.map(([a, b]) => (sign > 0 ? [a, b] : [-b, -a])) });
  return face;
}

const SIDE_LABEL = {
  "+y": (k) => (k === "upn" || k === "ipe" || k === "hea" || k === "heb" ? "Flansch" : k === "t" ? "Flansch" : "Seite"),
  "-y": (k) => (k === "upn" || k === "ipe" || k === "hea" || k === "heb" ? "Flansch" : k === "u" ? "Steg" : k === "winkel" ? "Schenkel" : "Seite"),
  "+x": (k) => (k === "u" ? "Flansch" : "Seite"),
  "-x": (k) => (k === "upn" ? "Steg" : k === "u" ? "Flansch" : k === "winkel" ? "Schenkel" : "Seite"),
};

/** Oberseite (bzw. Unterseite mit side = "unten") einer Bauplan-Platte { name, center, xDir, normal, W, H, t, poly? } */
export function plateFace(pl, side = "oben") {
  const n0 = norm(pl.normal), top = side !== "unten";
  const n = top ? n0 : mul(n0, -1), s = norm(pl.xDir);
  const c = cross(n, s), y0 = cross(n0, s); // Plattenebene: y = normal × xDir
  const sign = dot(c, y0) >= 0 ? 1 : -1;
  const box = pl.poly ? bbox2(pl.poly) : [-pl.W / 2, -pl.H / 2, pl.W / 2, pl.H / 2];
  const [cy0, cy1] = sign > 0 ? [box[1], box[3]] : [-box[3], -box[1]];
  return makeFace({ name: pl.name, label: `${pl.name} (${top ? "Oberseite" : "Unterseite"})`, target: pl.name, targetKind: "plate", plate: pl,
    o: top ? add(pl.center, mul(n0, pl.t)) : pl.center, n, s, sRange: [box[0], box[2]], cLo: { at: cy0, edge: "kante" }, cHi: { at: cy1, edge: "kante" }, cPhys: [cy0, cy1], wall: pl.t,
    poly: pl.poly ? pl.poly.map(([x, y]) => [x, sign * y]) : null });
}

/** Ebene ohne Bauteil im Modell (Boden, Decke, Wand): unbegrenzt, keine Gegenbohrung */
export function planeFace(o, n, s, label = "Untergrund") {
  return makeFace({ name: label, label, target: null, targetKind: null, o, n: norm(n), s: norm(sub(s, mul(norm(n), dot(s, norm(n))))) });
}

/** Punkt in Flächenkoordinaten: s längs, c quer, h über der Fläche */
export function faceCoords(face, P) {
  const d = sub(P, face.o);
  return [dot(d, face.s), dot(d, face.c), dot(d, face.n)];
}

/**
 * Nächstgelegenes Anschlussbauteil: unter den Stäben (cands) den, dessen Achse (als Strecke) dem Punkt P am nächsten
 * liegt (Abstand ≤ maxDist, längs höchstens alongTol über die Endschnitte hinaus), und dort die Fläche Richtung want.
 * null, wenn keiner in Reichweite.
 */
export function findMemberFace(cands, P, want, maxDist = Infinity, alongTol = 100) {
  let best = null, bd = Infinity;
  for (const m of cands) {
    const ab = sub(m.b, m.a), L = len(ab);
    if (!(L > 0)) continue;
    const [t0, t1] = axisRange(m), z = mul(ab, 1 / L);
    const t = dot(sub(P, m.a), z);
    if (t < t0 - alongTol || t > t1 + alongTol) continue;
    const dd = len(sub(P, add(m.a, mul(z, Math.max(t0, Math.min(t1, t))))));
    if (dd < bd - 1e-9) { bd = dd; best = m; }
  }
  if (!best || bd > maxDist) return null;
  return memberFace(best, want);
}

/** Achsbereich [t0, t1] eines Stabs zwischen seinen Endschnitten (ohne Schnitte 0 … Länge) */
export function axisRange(m) {
  const ab = sub(m.b, m.a), L = len(ab), z = mul(ab, 1 / (L || 1));
  const at = (c) => { const n = norm(c.n), dn = dot(z, n); return Math.abs(dn) > 0.05 ? dot(sub(c.p, m.a), n) / dn : null; };
  let t0 = 0, t1 = L;
  for (const c of m.cuts?.start || []) { const t = at(c); if (t != null) t0 = Math.max(t0, t); }
  for (const c of m.cuts?.end || []) { const t = at(c); if (t != null) t1 = Math.min(t1, t); }
  return t1 > t0 ? [t0, t1] : [0, L];
}

/**
 * Platte unter dem Punkt P (z. B. Stufe unter einem Pfosten): Oberseite liegt unter P, Lot trifft den Umriss; die
 * nächste von oben. null, wenn keine.
 */
export function findPlateFace(plates, P) {
  let best = null, bz = Infinity;
  for (const pl of plates) {
    const f = plateFace(pl);
    if (dot(f.n, [0, 0, 1]) < 0.5) continue;
    const Q = linePlane(P, [0, 0, 1], f.o, f.n);
    if (!Q) continue;
    const h = P[2] - Q[2];
    if (h < -1e-6 || h > bz) continue;
    const [s, c] = faceCoords(f, Q);
    const inside = f.poly ? distToPoly([s, c], f.poly) === 0 : s >= f.sRange[0] && s <= f.sRange[1] && c >= f.cLo.at && c <= f.cHi.at;
    if (inside) { best = f; bz = h; }
  }
  return best;
}

// ---------- Montagerahmen und Pfostenachse ----------

/** Schnitt der Geraden P + t·d mit der Ebene durch o mit Normale n; null bei paralleler Geraden */
export function linePlane(P, d, o, n) {
  const dn = dot(d, n);
  if (Math.abs(dn) < 1e-9) return null;
  return add(P, mul(d, dot(sub(o, P), n) / dn));
}

/**
 * Lokales Koordinatensystem der Montage: Pfostenachse durch P (Richtung axis, i. d. R. lotrecht), Montagefläche face,
 * Regel rule: "lotrecht" (Pfosten bleibt in Richtung axis) oder "normal" (Pfosten senkrecht zur Fläche, ebenfalls durch P,
 * damit der Handlauf oben an seiner Stelle bleibt).
 * along: Richtung, an der sich die Platte ausrichtet (Lauflinie); rot: Drehung der Platte um die Normale (°).
 * Rückgabe { F (Fußpunkt auf der Fläche), n, x, y (Plattenachsen, y = n × x), axis (Pfostenachse), tilt (° zwischen
 * Pfostenachse und Normale) }.
 */
export function mountFrame(face, P, axis, { rule = "lotrecht", along = face.s, rot = 0 } = {}) {
  const n = face.n;
  const ax = rule === "normal" ? n : norm(axis);
  const F = linePlane(P, rule === "normal" ? n : norm(axis), face.o, n); // »normal«: Pfosten durch P senkrecht zur Fläche
  if (!F) throw new Error("Pfostenachse liegt parallel zur Montagefläche");
  let x = sub(along, mul(n, dot(along, n)));
  if (len(x) < 1e-6) x = face.s;
  x = norm(x);
  if (rot) {
    const t = rot * DEG, y0 = cross(n, x);
    x = norm(add(mul(x, Math.cos(t)), mul(y0, Math.sin(t))));
  }
  const tilt = Math.acos(Math.max(-1, Math.min(1, dot(ax, n)))) / DEG;
  return { F, n, x, y: cross(n, x), axis: ax, tilt };
}

/** Punkt aus Montage-Koordinaten [x, y, z] (z entlang der Normalen) in Weltkoordinaten */
export function fromMount(fr, q, origin = fr.F) {
  return add(add(add(origin, mul(fr.x, q[0])), mul(fr.y, q[1])), mul(fr.n, q[2] || 0));
}
/** Weltpunkt in Montage-Koordinaten */
export function toMount(fr, P, origin = fr.F) {
  const d = sub(P, origin);
  return [dot(d, fr.x), dot(d, fr.y), dot(d, fr.n)];
}

// ---------- Kollision (Hüllquader) ----------

/** Hüllquader { c, ax: [3 Achsen], h: [3 Halbmaße] } eines Bauplan-Stabs */
export function memberBox(m) {
  const ax = memberAxes(m.a, m.b, m.up || [0, 0, 1], m.rot || 0);
  const g = m.section.geom, L = len(sub(m.b, m.a));
  const [t0, t1] = axisRange(m); // Schnitte an den Enden kürzen den Quader
  return { c: add(m.a, mul(ax.z, (t0 + t1) / 2)), ax: [ax.u, ax.v, ax.z], h: [g.width / 2, g.height / 2, (t1 - t0) / 2], name: m.name };
}
/** Hüllquader einer Bauplan-Platte */
export function plateBox(pl) {
  const x = norm(pl.xDir), z = norm(pl.normal), y = cross(z, x);
  const b = pl.poly ? bbox2(pl.poly) : [-pl.W / 2, -pl.H / 2, pl.W / 2, pl.H / 2];
  const c = add(add(add(pl.center, mul(x, (b[0] + b[2]) / 2)), mul(y, (b[1] + b[3]) / 2)), mul(z, pl.t / 2));
  return { c, ax: [x, y, z], h: [(b[2] - b[0]) / 2, (b[3] - b[1]) / 2, pl.t / 2], name: pl.name };
}

/** Überschneiden sich zwei Hüllquader um mehr als tol (mm)? Trennachsen-Test */
export function boxesOverlap(A, B, tol = 0.05) {
  const axes = [...A.ax, ...B.ax];
  for (const a of A.ax) for (const b of B.ax) { const c = cross(a, b); if (len(c) > 1e-6) axes.push(norm(c)); }
  const d = sub(B.c, A.c);
  for (const L of axes) {
    const ra = A.h.reduce((s, h, i) => s + h * Math.abs(dot(A.ax[i], L)), 0);
    const rb = B.h.reduce((s, h, i) => s + h * Math.abs(dot(B.ax[i], L)), 0);
    if (Math.abs(dot(d, L)) >= ra + rb - tol) return false;
  }
  return true;
}

/** Namen der Bauplan-Teile (plan: { members, plates }), mit denen box kollidiert; skip(name) schließt Teile aus */
export function collisions(box, plan, skip = () => false) {
  const out = [];
  for (const m of plan.members || []) if (!skip(m.name) && len(sub(m.b, m.a)) > 1e-6 && boxesOverlap(box, memberBox(m))) out.push(m.name);
  for (const pl of plan.plates || []) if (!skip(pl.name) && boxesOverlap(box, plateBox(pl))) out.push(pl.name);
  return out;
}

function bbox2(pts) {
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}


// ---------- Parameter (Gruppe »Pfostenbefestigung« im Generator-Schema) ----------

export const HOLE_PATTERNS = [["4", "4 (Ecken)"], ["2l", "2 in Längsrichtung"], ["2q", "2 quer"], ["frei", "frei (x; y je Bohrung)"]];
export const POST_RULES = [["lotrecht", "lotrecht (Pfostenfuß schräg geschnitten)"], ["normal", "senkrecht zur Montagefläche"]];

/**
 * Schema-Einträge der Befestigung. key: Vorsilbe (z. B. »gel«), kind(p): "oben" | "seitlich" | null je nach gewählter
 * Befestigungsart, def: Standardwerte je Generator (Zahlen als Text). Ältere Features haben die Art »aus« und sehen
 * diese Felder nicht; die Werte selbst brauchen daher kein missing.
 */
export function mountSchema(key = (k) => k, group = "Pfostenbefestigung", kind = () => null, def = {}) {
  const D = { oW: "120", oL: "120", oT: "10", holes: "4", d: "11", e: "20", ...def };
  const top = (p) => kind(p) === "oben", any = (p) => !!kind(p);
  const free = (p) => any(p) && p[key("mHoles")] === "frei";
  return [
    { key: key("mRule"), label: "Pfostenstellung", type: "select", options: POST_RULES, default: "lotrecht", group, when: top },
    { key: key("oW"), label: "Fußplatte Breite (quer)", type: "num", default: D.oW, group, when: top },
    { key: key("oL"), label: "Fußplatte Länge (entlang Lauf)", type: "num", default: D.oL, group, when: top },
    { key: key("oT"), label: "Fußplatte Dicke", type: "num", default: D.oT, group, when: top },
    { key: key("oDx"), label: "Pfosten auf der Platte längs versetzt", type: "num", default: "0", group, when: top },
    { key: key("oDy"), label: "Pfosten auf der Platte quer versetzt", type: "num", default: "0", group, when: top },
    { key: key("mRot"), label: "Platte um die Flächennormale gedreht", type: "num", unit: "°", default: "0", group, when: any },
    { key: key("mHoles"), label: "Bohrbild", type: "select", options: HOLE_PATTERNS, default: D.holes, group, when: any },
    { key: key("mFree"), label: "Bohrungen frei (x; y; x; y … ab Pfostenachse)", type: "list", default: "-40; 0; 40; 0", group, when: free },
    { key: key("mD"), label: "Bohrung Ø", type: "num", default: D.d, group, when: any },
    { key: key("mE"), label: "Randabstand in der Platte (Mitte Bohrung)", type: "num", default: D.e, group, when: (p) => any(p) && !free(p) },
    { key: key("mSlot"), label: "Langloch-Länge (0 = rund)", type: "num", default: "0", group, when: any },
    { key: key("mTD"), label: "Gegenbohrung im Bauteil Ø (0 = wie Platte)", type: "num", default: "0", group, when: any },
    { key: key("mEdge"), label: "Mindest-Randabstand im Bauteil (0 = 1,2 · d)", type: "num", default: "0", group, when: any },
  ];
}

/** Aufgelöste Parameter (Zahlen) mit Vorsilbe in ein Befestigungsobjekt */
export function mountConfig(p, key = (k) => k) {
  const v = (k) => p[key(k)];
  return { rule: v("mRule") || "lotrecht", W: v("oW"), L: v("oL"), t: v("oT"), dx: v("oDx") || 0, dy: v("oDy") || 0, rot: v("mRot") || 0,
    holes: v("mHoles") || "4", free: v("mFree") || [], d: v("mD"), e: v("mE"), slot: v("mSlot") || 0, td: v("mTD") || 0, edge: v("mEdge") || 0, keys: (k) => key(k) };
}

/** Bohrbild in Plattenkoordinaten (x längs, y quer, Ursprung Plattenmitte) */
export function holePattern(cfg, L, W) {
  const k = cfg.keys || ((x) => x);
  const { d, e } = cfg;
  if (!(d > 0)) throw fieldError("Bohrung Ø muss > 0 sein", k("mD"));
  if (cfg.holes === "frei") {
    const f = cfg.free;
    if (f.length % 2) throw fieldError("Bohrungen frei: je Bohrung x und y angeben", k("mFree"));
    return Array.from({ length: f.length / 2 }, (_, i) => [f[2 * i] + cfg.dx, f[2 * i + 1] + cfg.dy]);
  }
  if (!(e >= d / 2 + 1e-6)) throw fieldError(`Randabstand ${fmt(e)} mm zu klein für Ø ${fmt(d)} – mindestens ${fmt(d / 2)} mm`, k("mE"));
  const x = L / 2 - e, y = W / 2 - e;
  const pts = cfg.holes === "2l" ? [[-x, 0], [x, 0]] : cfg.holes === "2q" ? [[0, -y], [0, y]] : [[-x, -y], [x, -y], [x, y], [-x, y]];
  if (cfg.holes !== "2q" && x < d / 2 + 1e-6) throw fieldError("Bohrungen überschneiden sich – Platte länger oder Randabstand kleiner", k("mE"));
  if (cfg.holes !== "2l" && y < d / 2 + 1e-6) throw fieldError("Bohrungen überschneiden sich – Platte breiter oder Randabstand kleiner", k("mE"));
  return pts;
}

// ---------- Prüfungen ----------

/** Umriss eines Pfostens (Hülle bzw. Kreis) um den Fußpunkt, entlang der Pfostenachse auf die Montageebene projiziert */
function postFootprint(fr, post, along) {
  const g = post.geom, round = post.kind === "rohr" || post.kind === "rund";
  const pa = memberAxes([0, 0, 0], fr.axis, [along[0], along[1], along[2] || 0]);
  const ring = round ? Array.from({ length: 16 }, (_, i) => [Math.cos((i * Math.PI) / 8) * g.width / 2, Math.sin((i * Math.PI) / 8) * g.width / 2])
    : [[-g.width / 2, -g.height / 2], [g.width / 2, -g.height / 2], [g.width / 2, g.height / 2], [-g.width / 2, g.height / 2]];
  return ring.map(([a, b]) => {
    const P = add(add(fr.F, mul(pa.u, a)), mul(pa.v, b));
    const Q = linePlane(P, fr.axis, fr.F, fr.n) || P;
    const q = toMount(fr, Q);
    return [q[0], q[1]];
  });
}

/** Abstand Punkt → Polygon (0 innen) */
export function distToPoly([x, y], poly) {
  let inside = false, dmin = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    const dx = xj - xi, dy = yj - yi, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((x - xi) * dx + (y - yi) * dy) / L2)) : 0;
    dmin = Math.min(dmin, Math.hypot(x - xi - t * dx, y - yi - t * dy));
  }
  return inside ? 0 : dmin;
}

/**
 * Bohrung im Anschlussbauteil prüfen (Flächenkoordinaten s, c): innerhalb der Länge, quer im nutzbaren Bereich mit
 * Randabstand edge zu freien Kanten bzw. frei von Rundung/Steg, nicht in gesperrten Bereichen. Rückgabe: Grund oder null.
 */
export function holeProblem(face, s, c, d, edge) {
  const r = d / 2;
  if (face.poly) {
    if (distToPoly([s, c], face.poly) > 0) return `liegt außerhalb von ${face.label}`;
    const toEdge = edgeDistance([s, c], face.poly);
    if (toEdge < edge - 1e-6) return `Randabstand ${fmt(toEdge)} mm in ${face.label} (mindestens ${fmt(edge)} mm)`;
    return null;
  }
  const [s0, s1] = face.sRange;
  if (s < s0 + r - 1e-6 || s > s1 - r + 1e-6) return `liegt außerhalb der Länge von ${face.label} (Pfosten auf der Platte versetzen oder Bohrbild ändern)`;
  const lim = (b, sg) => {
    if (!b) return null;
    const gap = sg * (c - b.at); // Abstand der Mitte von der Grenze nach innen
    if (b.edge === "kante") {
      if (gap < r - 1e-6) return `liegt ${fmt(r - gap)} mm über der Kante von ${face.label}`;
      if (gap < edge - 1e-6) return `Randabstand ${fmt(gap)} mm zur Kante von ${face.label} (mindestens ${fmt(edge)} mm)`;
    } else if (gap < r + 1 - 1e-6) return `trifft Rundung, Steg oder Flansch von ${face.label} (${fmt(r + 1 - gap)} mm zu weit außen)`;
    return null;
  };
  const why = lim(face.cLo, 1) || lim(face.cHi, -1);
  if (why) return why;
  for (const [a, b] of face.exclude || []) if (c + r > a - 1 && c - r < b + 1) return `trifft den Steg unter ${face.label}`;
  return null;
}

function edgeDistance(p, poly) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j], dx = xj - xi, dy = yj - yi, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((p[0] - xi) * dx + (p[1] - yi) * dy) / L2)) : 0;
    d = Math.min(d, Math.hypot(p[0] - xi - t * dx, p[1] - yi - t * dy));
  }
  return d;
}

// ---------- Befestigung von oben mit Fußplatte ----------

/**
 * Fußplatte unter einem Pfosten. ctx: { name (Pfosten), post (Profil), top (oberer Pfostenpunkt auf der Achse),
 * axis (Pfostenrichtung, i. d. R. [0, 0, 1]), along (Lauf-/Ausrichtungsrichtung), face (Anschlussfläche), plateName }.
 * Kollisionen prüft danach mountCollisions mit dem fertigen Bauplan.
 * Rückgabe { frame, a (neuer Pfostenfuß auf der Plattenoberseite), cuts, plate, drills, targetHoles, holes (Welt),
 * issues, ok } – Pfosten wird von a bis top gebaut. Ungültige Bohrungen werden gemeldet und nicht übertragen.
 */
export function topMount(cfg, ctx) {
  const k = cfg.keys || ((x) => x), issues = [], name = ctx.name;
  const { W, L, t } = cfg;
  if (!(t > 0)) throw fieldError("Fußplatte: Dicke muss > 0 sein", k("oT"));
  if (!(W > 0 && L > 0)) throw fieldError("Fußplatte: Breite und Länge müssen > 0 sein", k("oW"));
  const face = ctx.face;
  if (dot(face.n, [0, 0, 1]) < 0.2) throw fieldError(`${name}: ${face.label} zeigt nicht nach oben – für »oben mit Fußplatte« eine obere Fläche wählen`, k("mount"));
  const fr = mountFrame(face, ctx.top, ctx.axis || [0, 0, 1], { rule: cfg.rule, along: ctx.along, rot: cfg.rot });
  if (cfg.rule !== "normal" && fr.tilt > 45 + 1e-9) throw fieldError(`${name}: Pfosten steht ${fmt(fr.tilt)}° schräg zur Montagefläche (höchstens 45°) – Pfostenstellung »senkrecht zur Montagefläche« wählen`, k("mRule"));
  // Pfostenachse trifft die Fläche in F; Plattenmitte so, dass der Pfosten bei (dx, dy) auf der Platte steht
  const C = fromMount(fr, [-cfg.dx, -cfg.dy, 0]);
  const holes = holePattern(cfg, L, W).map(([x, y]) => [x - cfg.dx, y - cfg.dy]); // Plattenkoordinaten
  // Bohrungen in der Platte: innerhalb, Randabstand, nicht unter dem Pfosten
  const foot = postFootprint({ ...fr, F: add(fr.F, mul(fr.n, t)) }, ctx.post, ctx.along).map(([x, y]) => [x + cfg.dx, y + cfg.dy]);
  const d = cfg.d, slot = cfg.slot > d ? cfg.slot : 0;
  holes.forEach(([x, y], i) => {
    const ex = L / 2 - Math.abs(x) - (slot ? (slot - d) / 2 : 0), ey = W / 2 - Math.abs(y);
    if (Math.min(ex, ey) < d / 2 + 1e-6) issues.push({ key: k("mHoles"), level: "Fehler", message: `${name}: Bohrung ${i + 1} liegt nicht ganz in der Fußplatte` });
    else if (Math.min(ex, ey) < 1.2 * d - 1e-6) issues.push({ key: k("mE"), level: "Hinweis", message: `${name}: Bohrung ${i + 1} Randabstand ${fmt(Math.min(ex, ey))} mm unter 1,2 · d in der Platte (EN 1993-1-8)` });
    if (distToPoly([x, y], foot) < d - 1e-6) issues.push({ key: k("oW"), level: "Fehler", message: `${name}: Bohrung ${i + 1} liegt unter dem Pfosten – nicht verschraubbar (Platte größer oder Bohrbild ändern)` });
  });
  if (foot.some(([x, y]) => Math.abs(x) > L / 2 + 1e-6 || Math.abs(y) > W / 2 + 1e-6)) issues.push({ key: k("oW"), level: "Warnung", message: `${name}: Pfosten steht über die Fußplatte über` });
  // Bohrbild ins Anschlussbauteil übertragen (Plattenunterseite = Montagefläche)
  const td = cfg.td > 0 ? cfg.td : d, edge = cfg.edge > 0 ? cfg.edge : 1.2 * td;
  const world = holes.map(([x, y]) => fromMount(fr, [x, y, 0], C));
  const drills = [], targetHoles = [];
  const corners = [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]].map(([x, y]) => faceCoords(face, fromMount(fr, [x, y, 0], C)));
  const beside = face.cPhys && (corners.every(([, c]) => c < face.cPhys[0] - 1e-6) || corners.every(([, c]) => c > face.cPhys[1] + 1e-6));
  if (beside) {
    const [, cF] = faceCoords(face, fr.F);
    issues.push({ key: k("mount"), level: "Fehler", message: `${name}: Fußplatte liegt neben ${face.label} – Pfostenachse ${fmt(Math.abs(cF))} mm neben der Flächenmitte, keine Bohrung übertragen` });
  } else if (face.target) {
    world.forEach((P, i) => {
      const [s, c] = faceCoords(face, P);
      const why = holeProblem(face, s, c, td, edge);
      if (why) { issues.push({ key: k("mEdge"), level: "Fehler", message: `${name}: Bohrung ${i + 1} ${why} – nicht übertragen` }); return; }
      if (face.targetKind === "member") drills.push({ target: face.target, p: add(P, face.n), dir: mul(face.n, -1), d: td, len: face.wall + 2 });
      else {
        const pl = face.plate, x0 = norm(pl.xDir), y0 = cross(norm(pl.normal), x0), q = sub(P, pl.center);
        targetHoles.push([dot(q, x0), dot(q, y0), td]);
      }
    });
  }
  // Platte über die Fläche hinaus?
  if (face.cPhys && !beside) {
    const over = Math.max(0, ...corners.map(([, c]) => Math.max(face.cPhys[0] - c, c - face.cPhys[1])));
    if (over > 0.5) issues.push({ key: k("oW"), level: "Hinweis", message: `${name}: Fußplatte steht ${fmt(over)} mm über ${face.label} über` });
  }
  const plate = { center: C, xDir: fr.x, normal: fr.n, W: L, H: W, t, holes, d, ...(slot ? { slots: holes.map(([x, y]) => [x, y, slot]), holes: [] } : {}), name: ctx.plateName || `${name} Fußplatte`, mount: "oben" };
  // Pfostenfuß: Achse durch top trifft die Plattenoberseite; schräg → Schnitt parallel zur Platte
  const a = linePlane(ctx.top, fr.axis, add(fr.F, mul(fr.n, t)), fr.n);
  const cuts = fr.tilt > 0.01 ? { start: [{ p: a, n: mul(fr.n, -1) }], end: [] } : null;
  return { post: name, target: face.target, frame: fr, a, axis: fr.axis, cuts, plate, drills, targetHoles, holes: world, issues, ok: !issues.some((x) => x.level === "Fehler"), transferred: drills.length + targetHoles.length };
}

/** Kollision der erzeugten Befestigungsteile mit dem fertigen Bauplan (eigener Pfosten und Zielbauteil ausgenommen) */
export function mountCollisions(results, plan, key = "mount") {
  const own = new Set(results.flatMap((r) => [r.plate?.name, ...(r.parts || []).map((x) => x.name)]));
  const out = [];
  for (const r of results) {
    for (const part of [r.plate, ...(r.parts || [])].filter(Boolean)) {
      const hit = collisions(plateBox(part), plan, (n) => n === r.post || n === r.target || own.has(n) || n.startsWith(r.post + " "));
      if (hit.length) out.push({ key, level: "Warnung", message: `${r.post}: ${part.name} kollidiert mit ${hit.slice(0, 3).join(", ")}${hit.length > 3 ? " …" : ""}` });
    }
  }
  return out;
}

/** Bohrungen in Zielplatten des Bauplans eintragen (eigener Ø je Loch) */
export function applyTargetHoles(plates, face, holes) {
  if (!holes.length || face.targetKind !== "plate") return;
  const pl = plates.find((x) => x === face.plate || x.name === face.target);
  if (pl) pl.holes = [...(pl.holes || []), ...holes];
}

/** Info-Zeile mit Prüfstufe (Plan §12) */
export function mountInfo(results, what) {
  const n = results.length;
  if (!n) return "";
  const tr = results.reduce((s, r) => s + (r.transferred || 0), 0), bad = results.filter((r) => !r.ok).length;
  return `${n} ${what}` + (tr ? `, ${tr} Gegenbohrungen übertragen` : "") + (bad ? `, ${bad} mit Fehlern` : ", geometrisch geprüft") + ", Randabstände plausibilisiert, statisch nicht nachgewiesen";
}
