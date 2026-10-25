// Lage offener Profile in den Generatoren: Drehung um die Stabachse so, dass die offene Seite (U, UPN), das Innere
// eines Winkels oder der Steg eines T dorthin zeigt, wo er hingehört, und die hohe Seite eines Profils steht.
// Gleiche Rahmen-Rechnung wie memberFrame im Kernel: v ≈ up (Profilhöhe), u = v × z, Drehung rot um die Achse
// (u' = u·cos + v·sin, v' = v·cos − u·sin). Querschnitt-Koordinaten: x entlang u, y entlang v (siehe sections.js).

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return mul(a, 1 / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Richtung der offenen Seite im Querschnitt [x, y]: U-Profil (Steg unten) nach +y, UPN (Steg links) nach +x */
const OPEN = { u: [0, 1], upn: [1, 0] };
/** Inneres des Winkels (Schenkel nach +x und +y) */
const LEGS = { winkel: [Math.SQRT1_2, Math.SQRT1_2] };
/** Steg des T-Stahls (Flansch oben) nach −y */
const STEM = { t: [0, -1] };

/**
 * Drehung (0, 90, 180, 270 °) eines Stabs mit Achse z und Hilfsrichtung up.
 * want: { open, legs, stem, tall } – Weltrichtungen: offene Seite (U/UPN), Inneres des Winkels, Steg des T,
 * Richtung der größeren Profilabmessung. Fehlende Wünsche zählen nicht; ohne Wunsch bleibt rot = 0.
 */
export function orientRot(sec, z, up = [0, 0, 1], want = {}) {
  z = norm(z);
  if (Math.abs(dot(up, z)) > 0.999) up = [0, 1, 0];
  const v0 = norm(sub(up, mul(z, dot(up, z)))), u0 = cross(v0, z);
  const g = sec.geom || {};
  const wish = [
    [OPEN[sec.kind], want.open, 3],
    [LEGS[sec.kind], want.legs, 3],
    [STEM[sec.kind], want.stem, 3],
  ].filter(([a, w]) => a && w);
  let best = 0, bestScore = -Infinity;
  for (const rot of [0, 90, 180, 270]) {
    const t = (rot * Math.PI) / 180, c = Math.round(Math.cos(t)), s = Math.round(Math.sin(t));
    const u = add(mul(u0, c), mul(v0, s)), v = add(mul(v0, c), mul(u0, -s));
    const W = ([x, y]) => add(mul(u, x), mul(v, y));
    let score = 0;
    for (const [a, w, k] of wish) score += k * dot(W(a), norm(w));
    if (want.tall && Math.abs((g.width || 0) - (g.height || 0)) > 1e-9) score += 2 * Math.abs(dot((g.height || 0) >= (g.width || 0) ? v : u, norm(want.tall)));
    if (score > bestScore + 1e-9) { best = rot; bestScore = score; }
  }
  return best;
}

/** Abmessung des gedrehten Profils entlang up (hoch) und quer dazu (breit) */
export function rotExtent(sec, rot) {
  const g = sec.geom, turned = rot === 90 || rot === 270;
  return { high: turned ? g.width : g.height, wide: turned ? g.height : g.width };
}
