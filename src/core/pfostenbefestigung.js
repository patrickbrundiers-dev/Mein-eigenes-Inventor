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
  const L = len(sub(m.b, m.a));
  const face = makeFace({ name: m.name, label: `${label} (${SIDE_LABEL[f.side]?.(m.section.kind) || "Seite"})`, target: m.name, targetKind: "member",
    o: add(m.a, mul(best.n, f.half)), n: best.n, s, sRange: [0, L], cLo: lo, cHi: hi, wall: f.wall,
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
    o: top ? add(pl.center, mul(n0, pl.t)) : pl.center, n, s, sRange: [box[0], box[2]], cLo: { at: cy0, edge: "kante" }, cHi: { at: cy1, edge: "kante" }, wall: pl.t,
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
 * Nächstgelegenes Anschlussbauteil: unter den Stäben (cands) den, dessen Achse dem Punkt P am nächsten liegt (innerhalb
 * seiner Länge, Abstand ≤ maxDist), und dort die Fläche Richtung want. null, wenn keiner in Reichweite.
 */
export function findMemberFace(cands, P, want, maxDist = Infinity) {
  let best = null, bd = Infinity;
  for (const m of cands) {
    const ab = sub(m.b, m.a), L2 = dot(ab, ab);
    if (!(L2 > 0)) continue;
    const t = dot(sub(P, m.a), ab) / L2;
    if (t < -1e-6 || t > 1 + 1e-6) continue;
    const dd = len(sub(P, add(m.a, mul(ab, t))));
    if (dd < bd) { bd = dd; best = m; }
  }
  if (!best || bd > maxDist) return null;
  return memberFace(best, want);
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
 * Regel rule: "lotrecht" (Pfosten bleibt in Richtung axis) oder "normal" (Pfosten senkrecht zur Fläche).
 * along: Richtung, an der sich die Platte ausrichtet (Lauflinie); rot: Drehung der Platte um die Normale (°).
 * Rückgabe { F (Fußpunkt auf der Fläche), n, x, y (Plattenachsen, y = n × x), axis (Pfostenachse), tilt (° zwischen
 * Pfostenachse und Normale) }.
 */
export function mountFrame(face, P, axis, { rule = "lotrecht", along = face.s, rot = 0 } = {}) {
  const n = face.n;
  const ax = rule === "normal" ? n : norm(axis);
  const F = linePlane(P, norm(axis), face.o, n);
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

/** Hüllquader { c, ax: [3 Achsen], h: [3 Halbmaße] } eines Bauplan-Stabs (ohne Schnitte) */
export function memberBox(m) {
  const ax = memberAxes(m.a, m.b, m.up || [0, 0, 1], m.rot || 0);
  const g = m.section.geom, L = len(sub(m.b, m.a));
  return { c: add(m.a, mul(ax.z, L / 2)), ax: [ax.u, ax.v, ax.z], h: [g.width / 2, g.height / 2, L / 2], name: m.name };
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

export { fmt };
