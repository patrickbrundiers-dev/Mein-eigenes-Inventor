// Klemmgeländer (P4): Rohrgeländer ohne Schweißnähte aus Rundrohr und Rohrklemmverbindern (wie Kee Klamp).
// Pfosten in Fußflanschen, Handlauf durch T-Stücke (Ende: Endstück 90°, Ecke: Eckstück), Knieleiste je Feld in
// Kreuzstücken am Pfosten. Läufe mit 90°-Ecken. Reine Rechnung; Dübel werden nicht erzeugt.
//
// Lage: erster Lauf ab (0, 0) in +x, Boden z = 0; »Ecke links/rechts« dreht den nächsten Lauf um ±90°.

import { fieldError } from "./generror.js";
import { splitList } from "./expr.js";
import { catalogToDims, sectionGeometry } from "./sections.js";

const fmt = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
/** Maße eines Klemmverbinders wie in normlib (Bohrung, Würfel, Muffe, Anschlag) */
export function klemmGeom(D) {
  const w = Math.max(4, Math.round(D * 0.15)), B = D + 0.6, c = B + 2 * w;
  return { w, B, c, a: D, web: 3, stop: B / 2 + 3 };
}
const SIZES = [26.9, 33.7, 42.4, 48.3];

export const KLEMMGELAENDER = {
  label: "Klemmgeländer",
  schema: [
    { key: "runs", label: "Läufe (Längen)", type: "list", default: "3000; 2000", group: "Lauflinie" },
    { key: "turn", label: "Ecken", type: "select", options: [["links", "90° nach links"], ["rechts", "90° nach rechts"]], default: "links", group: "Lauflinie" },
    { key: "height", label: "Höhe OK Handlauf", type: "num", default: "1100", group: "Lauflinie" },
    { key: "tube", label: "Rohr Ø (Pfosten, Handlauf, Knieleiste)", type: "select", options: SIZES.map((d) => [String(d), `Ø ${fmt(d)} mm`]), default: "42.4", group: "Rohr" },
    { key: "wall", label: "Wandstärke", type: "num", default: "3.2", group: "Rohr" },
    { key: "postMax", label: "Pfostenabstand höchstens", type: "num", default: "1500", group: "Rohr" },
    { key: "knee", label: "Knieleiste", type: "check", default: true, group: "Rohr" },
    { key: "grade", label: "Verbinder", type: "select", options: [["verzinkt", "Temperguss verzinkt"], ["A4", "Edelstahl A4"]], default: "verzinkt", group: "Rohr" },
  ],

  plan(p) {
    const issues = [];
    const runs = (Array.isArray(p.runs) ? p.runs : splitList(p.runs).map(Number)).filter((x) => x > 0);
    if (!runs.length) throw fieldError("Mindestens ein Lauf", "runs");
    const D = Number(p.tube), t = p.wall, H = p.height;
    if (!SIZES.includes(D)) throw fieldError("Rohr-Ø aus der Liste wählen", "tube");
    if (!(t > 0 && t < D / 4)) throw fieldError("Wandstärke prüfen", "wall");
    if (!(H >= 600 && H <= 1500)) throw fieldError("Höhe 600 … 1500 mm", "height");
    if (!(p.postMax >= 300)) throw fieldError("Pfostenabstand mindestens 300 mm", "postMax");
    const g = klemmGeom(D), size = `Ø${fmt(D)}`;
    if (runs.some((L) => L < 2 * g.c + 100)) throw fieldError(`Lauf mindestens ${Math.ceil(2 * g.c + 100)} mm`, "runs");
    const dims = Object.fromEntries(Object.entries(catalogToDims("rohr", `${D}x${t}`)).map(([k, x]) => [k, Number(x)]));
    const tube = { kind: "rohr", dims, geom: sectionGeometry("rohr", dims) };
    const out = { chains: [], members: [], plates: [], norms: [], drills: [], tubes: [] };
    const { members, norms } = out;
    const sgn = p.turn === "rechts" ? -1 : 1;
    // Eckpunkte der Lauflinie und Laufrichtungen
    const corners = [[0, 0]], dirs = [];
    let d = [1, 0];
    for (const L of runs) {
      dirs.push(d);
      const q = corners.at(-1);
      corners.push([q[0] + d[0] * L, q[1] + d[1] * L]);
      d = [-sgn * d[1], sgn * d[0]];
    }
    const zKnee = Math.round(H / 2), floorTop = 11; // Pfosten steht 3 mm über der Flanschplatte
    const fitDir = (u, v) => { // Eckstück: x zum einen Lauf, z × x zum anderen
      const zx = [-u[1], u[0]];
      return Math.abs(zx[0] - v[0]) + Math.abs(zx[1] - v[1]) < 1e-6 ? u : v;
    };
    // Pfostenstellen je Lauf (Ecken gehören zu beiden Läufen)
    const posts = []; // { p:[x,y], kind: "ende"|"mitte"|"ecke", dirs }
    runs.forEach((L, k) => {
      const n = Math.max(1, Math.ceil(L / p.postMax - 1e-9)), a = corners[k], dk = dirs[k];
      for (let i = k === 0 ? 0 : 1; i <= n; i++) {
        const q = [a[0] + (dk[0] * L * i) / n, a[1] + (dk[1] * L * i) / n];
        const first = k === 0 && i === 0, last = k === runs.length - 1 && i === n, corner = i === n && !last;
        posts.push({ p: q, kind: first || last ? "ende" : corner ? "ecke" : "mitte", run: k, out: first ? dk : last ? [-dk[0], -dk[1]] : corner ? fitDir([-dk[0], -dk[1]], dirs[k + 1]) : dk });
      }
    });
    const zTop = H - D / 2; // Handlaufachse
    posts.forEach((q, i) => {
      const [x, y] = q.p, xd = [q.out[0], q.out[1], 0];
      members.push({ section: tube, a: [x, y, floorTop], b: [x, y, zTop - g.stop], name: `Pfosten ${i + 1}`, up: [1, 0, 0] });
      norms.push({ kind: "klemm_fuss", size, grade: p.grade, pos: [x, y, 0], dir: [0, 0, 1], xDir: xd, name: `Fußflansch ${i + 1}` });
      const top = q.kind === "mitte" ? "klemm_t" : q.kind === "ecke" ? "klemm_ecke" : "klemm_bogen";
      norms.push({ kind: top, size, grade: p.grade, pos: [x, y, zTop], dir: [0, 0, 1], xDir: xd, name: `Handlaufverbinder ${i + 1}` });
      if (p.knee) {
        const kk = q.kind === "mitte" ? "klemm_kreuz" : q.kind === "ecke" ? "klemm_kreuz_ecke" : "klemm_kreuz_ende";
        norms.push({ kind: kk, size, grade: p.grade, pos: [x, y, zKnee], dir: [0, 0, 1], xDir: xd, name: `Knieleistenverbinder ${i + 1}` });
      }
    });
    // Handlauf je Lauf: von Muffe zu Muffe an den Lauf-Enden (durch die T-Stücke)
    runs.forEach((L, k) => {
      const a = corners[k], b = corners[k + 1], dk = dirs[k];
      members.push({ section: tube, a: [a[0] + dk[0] * g.stop, a[1] + dk[1] * g.stop, zTop], b: [b[0] - dk[0] * g.stop, b[1] - dk[1] * g.stop, zTop], name: `Handlauf ${k + 1}`, up: [0, 0, 1] });
    });
    // Knieleiste je Feld zwischen zwei Pfosten
    let nk = 0;
    if (p.knee) for (let i = 0; i + 1 < posts.length; i++) {
      const a = posts[i].p, b = posts[i + 1].p, L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      members.push({ section: tube, a: [a[0] + u[0] * g.stop, a[1] + u[1] * g.stop, zKnee], b: [b[0] - u[0] * g.stop, b[1] - u[1] * g.stop, zKnee], name: `Knieleiste ${++nk}`, up: [0, 0, 1] });
    }
    issues.push({ key: "height", level: "Hinweis", message: "Ohne Fußleiste und Füllung: als Absturzsicherung nur, wo die Geländernorm Knieleisten zulässt (z. B. Industrie); Dübel nicht erzeugt" });
    const nT = posts.filter((q) => q.kind === "mitte").length, nE = posts.filter((q) => q.kind === "ecke").length, nB = posts.length - nT - nE;
    const info = `Klemmgeländer Rohr Ø ${fmt(D)} × ${fmt(t)}, ${posts.length} Pfosten, Verbinder: ${posts.length} Fußflansch, ${nT} T-Stück, ${nE} Eckstück, ${nB} Endstück 90°` + (p.knee ? `, ${posts.length} Knieleistenverbinder, ${nk} Knieleisten` : "") + " – ohne Schweißnähte";
    return { ...out, info, issues };
  },

  parts: { runs: /^(Handlauf|Knieleiste)/, height: /^Pfosten/, tube: /^(Pfosten|Handlauf|Knieleiste)/, postMax: /^Pfosten/, knee: /^Knieleiste/ },
  views: ["top", "front"],
  dims(p, plan, view) {
    const runs = (Array.isArray(p.runs) ? p.runs : splitList(p.runs).map(Number));
    if (view === "top") return [{ key: "runs", a: [0, 0], b: [runs[0], 0], off: -150, text: Math.round(runs[0]) }];
    return [{ key: "height", a: [0, 0], b: [0, p.height], off: 150, text: Math.round(p.height) }];
  },
};
