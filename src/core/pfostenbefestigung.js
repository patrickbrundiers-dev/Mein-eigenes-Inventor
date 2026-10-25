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
    o: add(m.a, mul(best.n, f.half)), n: best.n, s, sRange: axisRange(m), ends: memberEnds(m), cLo: lo, cHi: hi, cPhys: [-across, across], wall: f.wall,
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

/**
 * Senkrechte Stirnseite ohne Bauteil im Modell (Deckenstirn): Oberkante durch o, Höhe h nach unten, Normale n (zum
 * Pfosten), längs s; Bohrungen werden geprüft (Randabstand zur Deckenkante), aber nicht übertragen.
 */
export function slabFace(o, n, s, h, label = "Deckenstirn") {
  const f = planeFace(o, n, s, label), up = dot(f.c, [0, 0, 1]) >= 0 ? 1 : -1;
  const [lo, hi] = up > 0 ? [-h, 0] : [0, h];
  return { ...f, cLo: { at: lo, edge: "kante" }, cHi: { at: hi, edge: "kante" }, cPhys: [lo, hi] };
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

/**
 * Anschlussfläche neben einem Pfosten: nächster Stab wie findMemberFace, Fläche zur Seite des Pfostens (waagrecht, quer
 * zur Laufrichtung along).
 */
export function findSideFace(cands, P, along, maxDist = Infinity, alongTol = 100) {
  let best = null, bd = Infinity, foot = null;
  for (const m of cands) {
    const ab = sub(m.b, m.a), L = len(ab);
    if (!(L > 0)) continue;
    const [t0, t1] = axisRange(m), z = mul(ab, 1 / L), t = dot(sub(P, m.a), z);
    if (t < t0 - alongTol || t > t1 + alongTol) continue;
    const Q = add(m.a, mul(z, Math.max(t0, Math.min(t1, t)))), dd = len(sub(P, Q));
    if (dd < bd - 1e-9) { bd = dd; best = m; foot = Q; }
  }
  if (!best || bd > maxDist) return null;
  const al = norm([along[0], along[1], 0]);
  let w = sub(P, foot);
  w = [w[0], w[1], 0];
  w = sub(w, mul(al, dot(w, al)));
  if (len(w) < 1e-6) throw new Error(`${best.name}: Pfosten steht über dem Bauteil – für »seitlich« liegt die Lauflinie neben dem Bauteil`);
  return memberFace(best, w);
}

/** Endebenen eines Stabs [{ p, n }] (n nach außen): Endschnitte bzw. rechtwinklig an a und b */
export function memberEnds(m) {
  const z = norm(sub(m.b, m.a));
  const start = (m.cuts?.start || []).map((c) => ({ p: c.p, n: norm(c.n) })), end = (m.cuts?.end || []).map((c) => ({ p: c.p, n: norm(c.n) }));
  return [...(start.length ? start : [{ p: m.a, n: mul(z, -1) }]), ...(end.length ? end : [{ p: m.b, n: z }])];
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

export const HOLE_PATTERNS = [["4", "4 (Ecken)"], ["2l", "2 längs (entlang Lauf bzw. waagrecht)"], ["2q", "2 quer (bzw. senkrecht)"], ["frei", "frei (x; y je Bohrung)"]];
export const POST_RULES = [["lotrecht", "lotrecht (Pfostenfuß schräg geschnitten)"], ["normal", "senkrecht zur Montagefläche"]];

/**
 * Schema-Einträge der Befestigung. key: Vorsilbe (z. B. »gel«), kind(p): "oben" | "seitlich" | null je nach gewählter
 * Befestigungsart, def: Standardwerte je Generator (Zahlen als Text). Ältere Features haben die Art »aus« und sehen
 * diese Felder nicht; die Werte selbst brauchen daher kein missing.
 */
export function mountSchema(key = (k) => k, group = "Pfostenbefestigung", kind = () => null, def = {}) {
  const D = { oW: "120", oL: "120", oT: "10", sW: "160", sH: "160", sT: "10", holes: "4", d: "11", e: "20", ...def };
  const top = (p) => kind(p) === "oben", side = (p) => kind(p) === "seitlich", any = (p) => !!kind(p);
  const spacer = (p) => side(p) && !!p[key("mSpacer")];
  const free = (p) => (top(p) && p[key("oHoles")] === "frei") || (side(p) && p[key("sHoles")] === "frei");
  return [
    { key: key("mRule"), label: "Pfostenstellung", type: "select", options: POST_RULES, default: "lotrecht", group, when: top },
    { key: key("oW"), label: "Fußplatte Breite (quer)", type: "num", default: D.oW, group, when: top },
    { key: key("oL"), label: "Fußplatte Länge (entlang Lauf)", type: "num", default: D.oL, group, when: top },
    { key: key("oT"), label: "Fußplatte Dicke", type: "num", default: D.oT, group, when: top },
    { key: key("oDx"), label: "Pfosten auf der Platte längs versetzt", type: "num", default: "0", group, when: top },
    { key: key("oDy"), label: "Pfosten auf der Platte quer versetzt", type: "num", default: "0", group, when: top },
    { key: key("sW"), label: "Befestigungsblech Breite (waagrecht)", type: "num", default: D.sW, group, when: side },
    { key: key("sH"), label: "Befestigungsblech Höhe (entlang Pfosten)", type: "num", default: D.sH, group, when: side },
    { key: key("sT"), label: "Befestigungsblech Dicke", type: "num", default: D.sT, group, when: side },
    { key: key("sZ"), label: "Blechmitte versetzt (zur Flächenmitte bzw. OK Boden)", type: "num", default: D.sZ || "0", group, when: side },
    { key: key("sDown"), label: "Pfosten unter dem Blech", type: "num", default: "0", group, when: side },
    { key: key("mSpacer"), label: "Abstand mit Flacheisen ausgleichen (Schlitz im Pfosten, Stecknasen ins Blech)", type: "check", default: false, group, when: side },
    { key: key("mGap"), label: "Abstand Blech – Pfosten", type: "num", default: D.gap || "40", group, when: spacer },
    { key: key("mGapMax"), label: "Abstand höchstens", type: "num", default: "150", group, when: spacer },
    { key: key("mFlat"), label: "Flacheisen", type: "section", kinds: ["flach"], default: { kind: "flach", size: "60x10" }, group, when: spacer },
    { key: key("mIns"), label: "Einstecktiefe im Pfosten (0 = bis an die Gegenwand)", type: "num", default: "0", group, when: spacer },
    { key: key("mTabs"), label: "Stecknasen Anzahl", type: "num", unit: "Stk", default: "2", group, when: spacer },
    { key: key("mTabW"), label: "Stecknasen Breite", type: "num", default: "15", group, when: spacer },
    { key: key("mPlay"), label: "Passungsspiel je Seite", type: "num", default: "0.2", group, when: spacer },
    { key: key("mSlotW"), label: "Schlitzbreite im Pfosten (0 = Flacheisen + 2 × Spiel)", type: "num", default: "0", group, when: spacer },
    { key: key("mSteg"), label: "Mindeststeg um Schlitze", type: "num", default: "5", group, when: spacer },
    { key: key("mShift"), label: "Flacheisen entlang Pfosten verschieben", type: "num", default: "0", group, when: spacer },
    { key: key("mRot"), label: "Platte um die Flächennormale gedreht", type: "num", unit: "°", default: "0", group, when: any },
    { key: key("oHoles"), label: "Bohrbild Fußplatte", type: "select", options: HOLE_PATTERNS, default: D.holes, group, when: top },
    { key: key("sHoles"), label: "Bohrbild Befestigungsblech", type: "select", options: HOLE_PATTERNS, default: D.sHoles || "4", group, when: side },
    { key: key("mFree"), label: "Bohrungen frei (x; y; x; y … ab Pfostenachse)", type: "list", default: "-40; 0; 40; 0", group, when: free },
    { key: key("mD"), label: "Bohrung Ø", type: "num", default: D.d, group, when: any },
    { key: key("mE"), label: "Randabstand in der Platte (Mitte Bohrung)", type: "num", default: D.e, group, when: (p) => any(p) && !free(p) },
    { key: key("mSlot"), label: "Langloch-Länge (0 = rund)", type: "num", default: "0", group, when: any },
    { key: key("mTD"), label: "Gegenbohrung im Bauteil Ø (0 = wie Platte)", type: "num", default: "0", group, when: any },
    { key: key("mEdge"), label: "Mindest-Randabstand im Bauteil (0 = 1,2 · d)", type: "num", default: "0", group, when: any },
  ];
}

/** Aufgelöste Parameter (Zahlen) mit Vorsilbe in ein Befestigungsobjekt */
export function mountConfig(p, key = (k) => k, kind = "oben") {
  const v = (k) => p[key(k)];
  return { rule: v("mRule") || "lotrecht", W: v("oW"), L: v("oL"), t: v("oT"), dx: v("oDx") || 0, dy: v("oDy") || 0, rot: v("mRot") || 0,
    sW: v("sW"), sH: v("sH"), sT: v("sT"), sZ: v("sZ") || 0, sDown: v("sDown") || 0,
    spacer: kind === "seitlich" && !!v("mSpacer"), gap: kind === "seitlich" && v("mSpacer") ? v("mGap") || 0 : 0, gapMax: v("mGapMax") ?? 150, flat: v("mFlat"), ins: v("mIns") || 0,
    tabs: v("mTabs") ?? 2, tabW: v("mTabW") ?? 15, play: v("mPlay") ?? 0.2, slotW: v("mSlotW") || 0, steg: v("mSteg") ?? 5, shift: v("mShift") || 0,
    kind, holes: v(kind === "seitlich" ? "sHoles" : "oHoles") || "4", holesKey: key(kind === "seitlich" ? "sHoles" : "oHoles"), free: v("mFree") || [], d: v("mD"), e: v("mE"), slot: v("mSlot") || 0, td: v("mTD") || 0, edge: v("mEdge") || 0, keys: (k) => key(k) };
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
export function holeProblem(face, s, c, d, edge, P = null) {
  const r = d / 2;
  if (face.poly) {
    if (distToPoly([s, c], face.poly) > 0) return `liegt außerhalb von ${face.label}`;
    const toEdge = edgeDistance([s, c], face.poly);
    if (toEdge < edge - 1e-6) return `Randabstand ${fmt(toEdge)} mm in ${face.label} (mindestens ${fmt(edge)} mm)`;
    return null;
  }
  const [s0, s1] = face.sRange;
  const outside = P && face.ends ? face.ends.some((e) => dot(sub(P, e.p), e.n) > -r + 1e-6) : s < s0 + r - 1e-6 || s > s1 - r + 1e-6;
  if (outside) return `liegt außerhalb der Länge von ${face.label} (Pfosten auf der Platte versetzen oder Bohrbild ändern)`;
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
  let C = fromMount(fr, [-cfg.dx, -cfg.dy, 0]);
  // am Bauteilende so weit zurück, dass die Platte ganz auf der Fläche liegt (Pfosten bleibt auf der Platte)
  const sx = cfg.fit === false ? 0 : fitShift(face, fr, C, L, W, cfg.dx);
  C = add(C, mul(fr.x, sx));
  const holes = holePattern(cfg, L, W); // Plattenkoordinaten
  // Bohrungen in der Platte: innerhalb, Randabstand, nicht unter dem Pfosten
  const foot = postFootprint({ ...fr, F: add(fr.F, mul(fr.n, t)) }, ctx.post, ctx.along).map(([x, y]) => [x + cfg.dx - sx, y + cfg.dy]);
  const d = cfg.d, slot = cfg.slot > d ? cfg.slot : 0;
  holes.forEach(([x, y], i) => {
    const ex = L / 2 - Math.abs(x) - (slot ? (slot - d) / 2 : 0), ey = W / 2 - Math.abs(y);
    if (Math.min(ex, ey) < d / 2 + 1e-6) issues.push({ key: cfg.holesKey, level: "Fehler", message: `${name}: Bohrung ${i + 1} liegt nicht ganz in der Fußplatte` });
    else if (Math.min(ex, ey) < 1.2 * d - 1e-6) issues.push({ key: k("mE"), level: "Hinweis", message: `${name}: Bohrung ${i + 1} Randabstand ${fmt(Math.min(ex, ey))} mm unter 1,2 · d in der Platte (EN 1993-1-8)` });
    if (distToPoly([x, y], foot) < d - 1e-6) issues.push({ key: k("oW"), level: "Fehler", message: `${name}: Bohrung ${i + 1} liegt unter dem Pfosten – nicht verschraubbar (Platte größer oder Bohrbild ändern)` });
  });
  if (foot.some(([x, y]) => Math.abs(x) > L / 2 + 1e-6 || Math.abs(y) > W / 2 + 1e-6)) issues.push({ key: k("oW"), level: "Warnung", message: `${name}: Pfosten steht über die Fußplatte über` });
  // Bohrbild ins Anschlussbauteil übertragen (Plattenunterseite = Montagefläche)
  const { world, drills, targetHoles } = transferHoles(cfg, face, fr, C, holes, L, W, name, issues, "Fußplatte");
  const plate = { center: C, xDir: fr.x, normal: fr.n, W: L, H: W, t, holes, d, ...(slot ? { slots: holes.map(([x, y]) => [x, y, slot]), holes: [] } : {}), name: ctx.plateName || `${name} Fußplatte`, mount: "oben" };
  // Pfostenfuß: Achse durch top trifft die Plattenoberseite; schräg → Schnitt parallel zur Platte
  const a = linePlane(ctx.top, fr.axis, add(fr.F, mul(fr.n, t)), fr.n);
  const cuts = fr.tilt > 0.01 ? { start: [{ p: a, n: mul(fr.n, -1) }], end: [] } : null;
  return { post: name, target: face.target, frame: fr, a, axis: fr.axis, cuts, plate, shifted: Math.abs(sx) > 1e-6 ? sx : 0, drills, targetHoles, holes: world, issues, ok: !issues.some((x) => x.level === "Fehler"), transferred: drills.length + targetHoles.length };
}

// ---------- Seitliche Befestigung mit Befestigungsblech ----------

/** Halbe Pfostentiefe in Richtung n (Pfosten mit up entlang along, wie in den Generatoren) */
export function postHalf(post, axis, along, n) {
  if (post.kind === "rohr" || post.kind === "rund") return post.geom.width / 2;
  const pa = memberAxes([0, 0, 0], axis, along);
  return (Math.abs(dot(n, pa.u)) * post.geom.width + Math.abs(dot(n, pa.v)) * post.geom.height) / 2;
}

/** Abstand der Pfostenachse von der Anschlussfläche bei seitlicher Befestigung (Pfosten quer zum Lauf gemessen) */
export function sideOffset(cfg, post) {
  return cfg.sT + (cfg.gap || 0) + post.geom.width / 2;
}

/**
 * Befestigungsblech seitlich: liegt plan auf der Anschlussfläche face (Normale zeigt zum Pfosten), der Pfosten liegt
 * mit einer Seite am Blech an (bzw. im Abstand gap, siehe Abstandsausgleich). ctx wie topMount, dazu base (Punkt der
 * Lauflinie, Bezug für die Höhenlage an unbegrenzten Flächen). Blechachsen: x waagrecht, y entlang des Pfostens.
 * Rückgabe wie topMount; a = Pfostenfuß an der Blechunterkante (minus sDown).
 */
export function sideMount(cfg, ctx) {
  const k = cfg.keys || ((x) => x), issues = [], name = ctx.name, face = ctx.face;
  const { sW: W, sH: H, sT: t } = cfg;
  if (!(t > 0)) throw fieldError("Befestigungsblech: Dicke muss > 0 sein", k("sT"));
  if (!(W > 0 && H > 0)) throw fieldError("Befestigungsblech: Breite und Höhe müssen > 0 sein", k("sW"));
  const axis = norm(ctx.axis || [0, 0, 1]), n = face.n;
  if (Math.abs(dot(axis, n)) > 0.1) throw fieldError(`${name}: Pfosten steht nicht parallel zu ${face.label} – für »seitlich« eine senkrechte Fläche wählen`, k("mount"));
  // Abstand Pfostenachse – Fläche: Blech + Spalt + halbe Pfostentiefe
  const h = faceCoords(face, ctx.top)[2], half = postHalf(ctx.post, axis, ctx.along, n);
  const gap = h - t - half;
  if (gap < -0.5) issues.push({ key: k("mount"), level: "Fehler", message: `${name}: Pfosten durchdringt das Blech bzw. ${face.label} um ${fmt(-gap)} mm` });
  else if (gap > 0.5 && !cfg.spacer) issues.push({ key: k("mount"), level: "Fehler", message: `${name}: ${fmt(gap)} mm Luft zwischen Pfosten und Blech – Abstandsausgleich mit Flacheisen aktivieren oder Lage prüfen` });
  // Blechebene: y entlang des Pfostens, x waagrecht (n × x = y)
  let yv = norm(sub(axis, mul(n, dot(axis, n))));
  let x = norm(cross(yv, n));
  if (cfg.rot) { const tt = cfg.rot * DEG; [x, yv] = [norm(add(mul(x, Math.cos(tt)), mul(yv, Math.sin(tt)))), norm(add(mul(yv, Math.cos(tt)), mul(x, -Math.sin(tt))))]; }
  const fr = { F: null, n, x, y: cross(n, x), axis, tilt: 0 };
  const F0 = sub(ctx.top, mul(n, h)); // Pfostenachse auf die Fläche gelotet
  // Höhenlage: Blechmitte auf der Flächenmitte (begrenzte Fläche) bzw. am Bezugspunkt, jeweils + sZ
  const ycF = dot(fr.y, face.c);
  let C;
  if (face.cPhys && Math.abs(ycF) > 0.2) {
    const cMid = (face.cPhys[0] + face.cPhys[1]) / 2, [, c0] = faceCoords(face, F0);
    C = add(F0, mul(fr.y, (cMid + cfg.sZ - c0) / ycF));
  } else {
    const B0 = sub(ctx.base || ctx.top, mul(n, faceCoords(face, ctx.base || ctx.top)[2]));
    C = add(add(F0, mul(fr.y, dot(sub(B0, F0), fr.y))), mul(fr.y, cfg.sZ));
  }
  const sx = cfg.fit === false ? 0 : fitShift(face, fr, C, W, H, 0);
  C = add(C, mul(fr.x, sx));
  fr.F = C;
  const holes = holePattern(cfg, W, H);
  // Pfosten bzw. Flacheisen verdecken Bohrungen; Pfosten beginnt an der Blechunterkante
  const yBot = -H / 2, across = postHalf(ctx.post, axis, ctx.along, x);
  const d = cfg.d, slot = cfg.slot > d ? cfg.slot : 0;
  // Abstandsausgleich: Flacheisen zwischen Blech und Pfosten (eigene Prüfungen, verdeckt die Bohrungen statt des Pfostens)
  const sp = cfg.spacer && gap > 0.5 ? spacer(cfg, { name, post: ctx.post, fr, C, sx, gap, W, H, yBot, across, axis, along: ctx.along, issues }) : null;
  const cover = gap <= 0.5 ? [[-across - sx, yBot - cfg.sDown], [across - sx, yBot - cfg.sDown], [across - sx, H / 2 + 1e6], [-across - sx, H / 2 + 1e6]] : sp?.cover || null;
  holes.forEach(([hx, hy], i) => {
    const ex = W / 2 - Math.abs(hx) - (slot ? (slot - d) / 2 : 0), ey = H / 2 - Math.abs(hy);
    if (Math.min(ex, ey) < d / 2 + 1e-6) issues.push({ key: cfg.holesKey, level: "Fehler", message: `${name}: Bohrung ${i + 1} liegt nicht ganz im Befestigungsblech` });
    else if (Math.min(ex, ey) < 1.2 * d - 1e-6) issues.push({ key: k("mE"), level: "Hinweis", message: `${name}: Bohrung ${i + 1} Randabstand ${fmt(Math.min(ex, ey))} mm unter 1,2 · d im Blech (EN 1993-1-8)` });
    if (cover && distToPoly([hx, hy], cover) < d - 1e-6) issues.push({ key: k("sW"), level: "Fehler", message: `${name}: Bohrung ${i + 1} vom ${sp ? "Flacheisen" : "Pfosten"} verdeckt – Blech breiter oder Bohrbild ändern` });
    for (const [rx, ry, rw, rh] of sp?.rects || []) {
      const gapR = Math.max(Math.abs(hx - rx) - rw / 2, Math.abs(hy - ry) - rh / 2);
      if (gapR < d / 2 + cfg.steg - 1e-6) issues.push({ key: k("mSteg"), level: "Fehler", message: `${name}: Bohrung ${i + 1} zu nah am Steckschlitz (Steg ${fmt(Math.max(0, gapR - d / 2))} mm, mindestens ${fmt(cfg.steg)} mm)` });
    }
  });
  if (across > W / 2 + 1e-6) issues.push({ key: k("sW"), level: "Warnung", message: `${name}: Pfosten breiter als das Befestigungsblech` });
  const res = transferHoles(cfg, face, fr, C, holes, W, H, name, issues, "Befestigungsblech");
  const plate = { center: C, xDir: x, normal: n, W, H, t, holes, d, ...(slot ? { slots: holes.map(([hx, hy]) => [hx, hy, slot]), holes: [] } : {}), ...(sp ? { rects: sp.rects } : {}), name: ctx.plateName || `${name} Befestigungsblech`, mount: "seitlich" };
  // Pfostenfuß: Höhe der Blechunterkante (minus sDown) auf der Pfostenachse
  const bottom = fromMount(fr, [-sx, yBot, 0], C);
  const a = add(ctx.top, mul(axis, dot(sub(bottom, ctx.top), axis) - cfg.sDown));
  return { post: name, target: face.target, frame: fr, a, axis, cuts: null, plate, parts: sp ? [sp.flat] : [], spacer: sp, shifted: Math.abs(sx) > 1e-6 ? sx : 0, drills: [...res.drills, ...(sp ? [sp.slot] : [])], targetHoles: res.targetHoles, holes: res.world, gap, issues, ok: !issues.some((q) => q.level === "Fehler"), transferred: res.drills.length + res.targetHoles.length };
}

/**
 * Verschiebung der Platte entlang ihrer x-Achse, damit sie am Ende des Anschlussbauteils (Endschnitt) ganz auf der
 * Fläche liegt; 0, wenn sie schon passt, die Fläche zu kurz ist oder der Pfosten (bei px auf der Platte) herunterfiele.
 */
export function fitShift(face, fr, C, L, W, px = 0) {
  if (!face.ends) return 0;
  const corners = [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]].map(([x, y]) => fromMount(fr, [x, y, 0], C));
  let sx = 0, n = 0;
  for (const e of face.ends) {
    const xn = dot(fr.x, e.n);
    if (Math.abs(xn) < 0.2) continue;
    const over = Math.max(...corners.map((P) => dot(sub(P, e.p), e.n)));
    if (over > 1e-6) { sx = -over / xn; n++; }
  }
  if (n !== 1) return 0; // passt schon oder an beiden Enden zu lang
  return Math.abs(px - sx) < L / 2 ? sx : 0;
}

// ---------- Abstandsausgleich: Flacheisen, Schlitz im Pfosten, Stecknasen ----------

/** Schlitz für Zapfen/Stecknase: Nase + 2 × Spiel je Richtung (gleiche Regel wie slotSize im Stecksystem) */
export function steckPassung(width, thick, play) {
  if (!(play >= 0)) throw new Error("Passungsspiel darf nicht negativ sein");
  return { w: width + 2 * play, t: thick + 2 * play };
}

/** Mitten von n Stecknasen der Breite b, gleichmäßig auf der Länge L verteilt; prüft Mindeststeg zu Rand und Nachbar */
export function tabCenters(L, n, b, steg) {
  n = Math.round(n);
  if (!(n >= 1)) return { error: "mindestens eine Stecknase" };
  const gap = (L - n * b) / (n + 1);
  if (gap < steg - 1e-6) return { error: `${n} Stecknasen à ${fmt(b)} mm passen nicht in ${fmt(L)} mm (Steg ${fmt(Math.max(0, gap))} mm, mindestens ${fmt(steg)} mm)` };
  return { centers: Array.from({ length: n }, (_, k) => -L / 2 + gap * (k + 1) + b * k + b / 2), gap };
}

/**
 * Flacheisen vom Befestigungsblech zum Pfosten: steht senkrecht auf dem Blech (Breite entlang des Pfostens, Dicke
 * waagrecht), greift mit Stecknasen durch Steckschlitze im Blech (Nasenlänge = Blechdicke, bündig) und steckt durch
 * einen Schlitz in der Pfostenwand bis zur Einstecktiefe. Alle Maße aus einem Parametersatz: Schlitze = Nase bzw.
 * Flacheisen + 2 × Spiel (oder Schlitzbreite von Hand, dann Passungsprüfung). Meldungen in o.issues.
 */
function spacer(cfg, o) {
  const k = cfg.keys || ((x) => x), { name, post, fr, C, sx, gap, H, yBot, issues } = o, t = cfg.sT;
  const err = (key, message) => issues.push({ key: k(key), level: "Fehler", message: `${name}: ${message}` });
  const flat = cfg.flat?.geom ? cfg.flat : null;
  if (!flat) throw fieldError("Flacheisen: Profil fehlt", k("mFlat"));
  const bF = flat.geom.width, tF = flat.geom.height, play = cfg.play;
  if (!(play >= 0)) throw fieldError("Passungsspiel darf nicht negativ sein", k("mPlay"));
  if (gap > cfg.gapMax + 1e-6) err("mGapMax", `Abstand ${fmt(gap)} mm über dem Höchstmaß ${fmt(cfg.gapMax)} mm`);
  if (bF > H - 2 * cfg.steg + 1e-6) err("mFlat", `Flacheisen ${fmt(bF)} mm breiter als das Blech erlaubt (${fmt(H)} mm − 2 × Steg)`);
  // Pfostenwand und Einstecktiefe
  const hollow = post.kind === "rohr" || post.kind === "vierkant" || post.kind === "rechteck";
  const wall = hollow ? post.dims.t : 0, depth = 2 * postHalf(post, o.axis, o.along, fr.n);
  if (!hollow) err("mFlat", `Pfosten aus Vollmaterial – kein Schlitz für das Flacheisen möglich`);
  const ins = cfg.ins > 0 ? cfg.ins : Math.max(wall, depth - wall - play);
  if (hollow && ins > depth - wall + 1e-6) err("mIns", `Einstecktiefe ${fmt(ins)} mm größer als der Pfosten innen (${fmt(depth - wall)} mm)`);
  if (hollow && ins < wall - 1e-6) err("mIns", `Einstecktiefe ${fmt(ins)} mm kleiner als die Pfostenwand`);
  // Schlitz im Pfosten: Flacheisen + 2 × Spiel bzw. von Hand mit Passungsprüfung
  const fit = steckPassung(bF, tF, play);
  const slotW = cfg.slotW > 0 ? cfg.slotW : fit.t, slotH = fit.w;
  const real = (slotW - tF) / 2;
  if (real < -1e-6) err("mSlotW", `Flacheisen ${fmt(tF)} mm passt nicht in den Schlitz ${fmt(slotW)} mm`);
  else if (real > Math.max(1, 3 * play) + 1e-6) issues.push({ key: k("mSlotW"), level: "Warnung", message: `${name}: Schlitz ${fmt(slotW)} mm für Flacheisen ${fmt(tF)} mm – ${fmt(real)} mm Spiel je Seite` });
  const face = 2 * o.across, r = post.kind === "rohr" ? 0 : Number.isFinite(post.dims?.r) ? post.dims.r : 2 * wall;
  const flatFace = post.kind === "rohr" ? face : face - 2 * r;
  if (hollow && (flatFace - slotW) / 2 < cfg.steg - 1e-6) err("mSteg", `zu wenig Material neben dem Schlitz im Pfosten (${fmt(Math.max(0, (flatFace - slotW) / 2))} mm, mindestens ${fmt(cfg.steg)} mm)`);
  const yc = cfg.shift; // Mitte des Flacheisens entlang des Pfostens (Blechkoordinaten)
  if (yc - slotH / 2 - (yBot - cfg.sDown) < cfg.steg - 1e-6) err("mShift", `Schlitz im Pfosten zu nah am Pfostenende`);
  // Stecknasen und Steckschlitze im Blech
  const tl = tabCenters(bF, cfg.tabs, cfg.tabW, cfg.steg);
  if (tl.error) err("mTabs", `Stecknasen: ${tl.error}`);
  const tabs = tl.centers || [];
  const sq = steckPassung(cfg.tabW, tF, play), xc = -sx; // Flacheisen mittig zum Pfosten
  const rects = tabs.map((c) => [xc, yc + c, sq.t, sq.w]);
  for (const [rx, ry, rw, rh] of rects) {
    if (Math.abs(rx) + rw / 2 > o.W / 2 - cfg.steg + 1e-6 || Math.abs(ry) + rh / 2 > H / 2 - cfg.steg + 1e-6) { err("mTabs", "Stecknasen liegen außerhalb des Blechs bzw. zu nah am Rand"); break; }
  }
  // Flacheisen als Platte: x vom Blech zum Pfosten (Normale der Fläche), Dicke waagrecht (Blech-x), Breite entlang Pfosten
  const xDir = fr.n, normal = fr.x, yF = cross(normal, xDir); // Flacheisen-y in Weltrichtung
  const along = dot(yF, fr.y); // ±1: Flacheisen-y zu Blech-y
  const O = add(fromMount(fr, [xc, yc, t], C), mul(normal, -tF / 2)); // Mitte Unterseite an der Blechaußenfläche
  const L = gap + ins;
  const poly = [[0, -bF / 2]];
  for (const c of tabs.map((c) => along * c).sort((p, q) => p - q)) poly.push([0, c - cfg.tabW / 2], [-t, c - cfg.tabW / 2], [-t, c + cfg.tabW / 2], [0, c + cfg.tabW / 2]);
  poly.push([0, bF / 2], [L, bF / 2], [L, -bF / 2]);
  const flatPlate = { center: O, xDir, normal, W: L + t, H: bF, t: tF, poly, name: `${name} Flacheisen`, mount: "flacheisen" };
  // Schlitz durch die nahe Pfostenwand
  const P0 = fromMount(fr, [xc, yc, t + gap - 1], C);
  const slot = { target: name, p: P0, dir: fr.n, w: slotW, h: slotH, xDir: fr.x, len: wall + 2 };
  const cover = [[xc - tF / 2, yc - bF / 2], [xc + tF / 2, yc - bF / 2], [xc + tF / 2, yc + bF / 2], [xc - tF / 2, yc + bF / 2]];
  return { flat: flatPlate, slot, rects, cover, ins, length: L + t, slotW, slotH, tabs: rects.length, fit: real };
}

/** Bohrungen der Platte (Plattenkoordinaten, Mitte C) prüfen und ins Anschlussbauteil übertragen */
function transferHoles(cfg, face, fr, C, holes, L, W, name, issues, what) {
  const k = cfg.keys || ((x) => x);
  const td = cfg.td > 0 ? cfg.td : cfg.d, edge = cfg.edge > 0 ? cfg.edge : 1.2 * td;
  const world = holes.map(([x, y]) => fromMount(fr, [x, y, 0], C));
  const drills = [], targetHoles = [];
  const corners = [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]].map(([x, y]) => faceCoords(face, fromMount(fr, [x, y, 0], C)));
  const beside = face.cPhys && (corners.every(([, c]) => c < face.cPhys[0] - 1e-6) || corners.every(([, c]) => c > face.cPhys[1] + 1e-6));
  if (beside) {
    const [, cF] = faceCoords(face, C);
    issues.push({ key: k("mount"), level: "Fehler", message: `${name}: ${what} liegt neben ${face.label} – ${fmt(Math.abs(cF))} mm neben der Flächenmitte, keine Bohrung übertragen` });
  } else if (face.target || face.cLo) {
    world.forEach((P, i) => {
      const [s, c] = faceCoords(face, P);
      const why = holeProblem(face, s, c, td, edge, P);
      if (why) { issues.push({ key: k("mEdge"), level: "Fehler", message: `${name}: Bohrung ${i + 1} ${why}` + (face.target ? " – nicht übertragen" : "") }); return; }
      if (!face.target) return;
      if (face.targetKind === "member") drills.push({ target: face.target, p: add(P, face.n), dir: mul(face.n, -1), d: td, len: face.wall + 2 });
      else {
        const pl = face.plate, x0 = norm(pl.xDir), y0 = cross(norm(pl.normal), x0), q = sub(P, pl.center);
        targetHoles.push([dot(q, x0), dot(q, y0), td]);
      }
    });
  }
  if (face.cPhys && !beside) {
    const over = Math.max(0, ...corners.map(([, c]) => Math.max(face.cPhys[0] - c, c - face.cPhys[1])));
    if (over > 0.5) issues.push({ key: k(what === "Fußplatte" ? "oW" : "sH"), level: "Hinweis", message: `${name}: ${what} steht ${fmt(over)} mm über ${face.label} über` });
  }
  return { world, drills, targetHoles };
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
  const sh = results.filter((r) => r.shifted && !r.moved).length, mv = results.filter((r) => r.moved).length, top = results.filter((r) => r.fallback).length;
  const spc = results.filter((r) => r.spacer).length;
  return `${n} ${what}` + (spc ? `, ${spc} mit Flacheisen (Stecknasen sichern nur die Lage – mit Pfosten und Blech verschweißen)` : "") + (top ? ` (${top} davon oben mit Fußplatte, kein Bauteil daneben)` : "") + (mv ? `, ${mv} Pfosten an Enden/Knicken zurückgerückt, damit die Platte auf dem Bauteil liegt` : "") + (sh ? `, ${sh} Platten am Bauteilende zurückgesetzt` : "") + (tr ? `, ${tr} Gegenbohrungen übertragen` : "") + (bad ? `, ${bad} mit Fehlern` : ", geometrisch geprüft") + ", Randabstände plausibilisiert, statisch nicht nachgewiesen";
}
