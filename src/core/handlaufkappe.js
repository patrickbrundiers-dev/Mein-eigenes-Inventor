// Handlauf-Endkappen: offene Enden hohler Handläufe (Rundrohr, Vierkant-, Rechteckrohr) bekommen eine bündig
// eingeschweißte Ronde bzw. ein Abschlussblech (3 mm, Innenmaß des Rohrs) – ein offenes Rohrende ist nicht fertigungsgerecht (scharfe
// Kante, Wasser im Rohr). Frei ist ein Ende, wenn kein anderes Handlaufstück dort anschließt (Stoß, Gehrung, Bogen)
// und das Ende gerade abgeschnitten ist. Reine Rechnung auf dem Bauplan (Format siehe generator.js).

const HOLLOW = new Set(["rohr", "vierkant", "rechteck"]);
export const RAIL_CAP_T = 3;

const sub = (a, b) => a.map((x, i) => x - b[i]);
const len = (a) => Math.hypot(...a);
const norm = (a) => { const l = len(a) || 1; return a.map((x) => x / l); };

/** Schema-Eintrag für Generatoren mit Handlauf (ältere Features ohne Angabe bleiben ohne Kappen) */
export const railCapField = (group, when) => ({ key: "railCaps", label: "Handlauf-Enden mit Endkappe verschließen", type: "check", default: true, missing: false, group, ...(when ? { when } : {}) });

/** ergänzt plan.plates um Endkappen an freien Handlaufenden; gibt plan zurück */
export function capRails(plan) {
  if (!plan) return plan;
  const isRail = (n) => /Handlauf/.test(n || "") && !/Handlaufhalter|Einschiebling/.test(n);
  // Stücke: [Name, Profil, Enden [{ p, q (Nachbarpunkt), cut }]]
  const pieces = [];
  for (const c of plan.chains || []) if (isRail(c.name) && c.points.length > 1) {
    const P = c.points, L = P.length;
    pieces.push({ name: c.name, root: c.name, section: c.section, rot: c.rot, up: c.up, ends: [{ p: P[0], q: P[1], k: "A" }, { p: P[L - 1], q: P[L - 2], k: "B" }] });
  }
  // Stäbe (auch Stücke gebogener Handläufe: nur das erste A- und das letzte B-Ende eines Zugs kann frei sein)
  const byTarget = new Map();
  for (const m of plan.members || []) if (isRail(m.name)) {
    const key = m.target || m.name;
    if (!byTarget.has(key)) byTarget.set(key, []);
    byTarget.get(key).push(m);
  }
  for (const [root, list] of byTarget) list.forEach((m, i) => {
    const ends = [];
    if (i === 0 && !(m.cuts?.start?.length)) ends.push({ p: m.a, q: m.b, k: "A" });
    if (i === list.length - 1 && !(m.cuts?.end?.length)) ends.push({ p: m.b, q: m.a, k: "B" });
    pieces.push({ name: m.name, root, section: m.section, rot: m.rot, up: m.up, ends });
  });
  // alle Stabenden aller Handlaufstücke (auch innere Bogenanschlüsse), um Stöße zu erkennen
  const joins = [...(plan.chains || []).filter((c) => isRail(c.name)).flatMap((c) => [c.points[0], c.points[c.points.length - 1]].map((p) => ({ name: c.name, p }))),
    ...(plan.members || []).filter((m) => isRail(m.name)).flatMap((m) => [m.a, m.b].map((p) => ({ name: m.name, p })))];
  const have = new Set((plan.plates || []).map((x) => x.name));
  let n = 0;
  for (const pc of pieces) {
    const sec = pc.section;
    if (!sec || !HOLLOW.has(sec.kind) || !sec.geom) continue;
    for (const e of pc.ends) {
      if (joins.some((j) => j.name !== pc.name && len(sub(j.p, e.p)) < 20)) continue; // Stoß mit einem anderen Stück
      const name = `${pc.name} Endkappe ${e.k === "A" ? "Anfang" : "Ende"}`;
      if (have.has(name)) continue;
      const dir = norm(sub(e.p, e.q));
      // Lage des Profils: x quer zur Achse (waagrecht, wenn möglich)
      const up = Math.abs(dir[2]) < 0.99 ? [0, 0, 1] : [1, 0, 0];
      let x = norm([up[1] * dir[2] - up[2] * dir[1], up[2] * dir[0] - up[0] * dir[2], up[0] * dir[1] - up[1] * dir[0]]);
      const g = sec.geom, center = e.p.map((v, i) => v - dir[i] * RAIL_CAP_T); // bündig im Rohrende
      const t = Number(sec.dims?.t) || 0;
      if (!(t > 0)) continue;
      let cap;
      if (sec.kind === "rohr") {
        const r = g.width / 2 - t;
        cap = { W: 2 * r, H: 2 * r, poly: Array.from({ length: 32 }, (_, k) => [r * Math.cos((k * Math.PI) / 16), r * Math.sin((k * Math.PI) / 16)]) };
      } else {
        // Rechteckrohr: Innenmaß; Breite quer und waagrecht, Höhe senkrecht dazu (wie der Handlauf liegt)
        const u = pc.up ? norm(pc.up.map((v, i) => v - dir[i] * (pc.up[0] * dir[0] + pc.up[1] * dir[1] + pc.up[2] * dir[2]))) : null;
        if (u && len(u) > 0.5) x = norm([u[1] * dir[2] - u[2] * dir[1], u[2] * dir[0] - u[0] * dir[2], u[0] * dir[1] - u[1] * dir[0]]);
        cap = { W: g.width - 2 * t, H: g.height - 2 * t, r: Math.max(0, (Number(sec.dims?.r) || 0) - t) };
      }
      (plan.plates = plan.plates || []).push({ center, xDir: x, normal: dir, t: RAIL_CAP_T, ...cap, name, meta: { railCap: true } });
      n++;
    }
  }
  if (n && typeof plan.info === "string") plan.info += `, ${n} Handlauf-Endkappe${n > 1 ? "n" : ""} ${RAIL_CAP_T} mm`;
  return plan;
}
