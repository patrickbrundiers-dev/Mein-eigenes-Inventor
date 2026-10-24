// Konturen am Rohr wie im Rohr-Editor der Rohrlaser-Kalkulation (schneidweg.py, Schneidweg-Rechner):
// Bohrung, Langloch, Rechteck und Ausklinkung über Lage ab Ende A, Seite (bzw. Winkel am Rundrohr), Versatz quer
// und Muster, ohne Skizze. Reine Rechnung (Lage, Prüfung, Schneidweg); die Körper baut src/kernel/build.js.
//
// Bezug wie im Rohr-Editor: x längs ab Ende A, Blick von Ende A: oben 0°, vorne 90° (rechts), unten 180°,
// hinten 270°; Versatz q quer zur Flächenmitte, + = im Uhrzeigersinn (von oben gesehen nach vorne).

export const TUBE_CUT_KINDS = {
  bohrung: { label: "Bohrung", fields: ["d"] },
  langloch: { label: "Langloch", fields: ["l", "b"] },
  rechteck: { label: "Rechteck", fields: ["l", "b", "r"] },
  ausklinkung: { label: "Ausklinkung am Ende", fields: ["l", "b", "r"] },
};
export const TUBE_CUT_FIELDS = { d: "Durchmesser d", l: "Länge l (längs)", b: "Breite b (quer)", r: "Eckradius r" };
export const TUBE_CUT_SECTIONS = ["rohr", "vierkant", "rechteck"];
export const SIDES = [["oben", 0], ["vorne", 90], ["unten", 180], ["hinten", 270]];

const fmt = (x) => String(Math.round(x * 100) / 100).replace(".", ",");

/** Vorgabe für eine neue Kontur */
export function defaultTubeCut(kind = "bohrung", L = 1000) {
  const base = { kind, x: String(Math.round(L / 2)), side: "oben", angle: "0", q: "0", pattern: "1", through: false };
  if (kind === "bohrung") return { ...base, d: "10" };
  if (kind === "langloch") return { ...base, l: "30", b: "10" };
  if (kind === "ausklinkung") return { ...base, x: "0", end: "A", l: "30", b: "20", r: "3" };
  return { ...base, l: "40", b: "20", r: "2" };
}

/**
 * Muster wie im Rohr-Editor: "3x25" (auch "3 × 25") = 3 Stück im Abstand 25, "1" = einzeln.
 * Der Abstand darf eine Rechnung sein (ev = Auswerter für Ausdrücke).
 */
export function parsePattern(text, ev = Number) {
  const s = String(text ?? "1").trim() || "1";
  const m = s.match(/^(\d+)\s*[x×]\s*(.+)$/i);
  if (m) {
    const count = Number(m[1]), spacing = ev(m[2]);
    if (!(count >= 1)) throw new Error("Anzahl im Muster muss ≥ 1 sein");
    if (count > 1 && !(spacing > 0)) throw new Error("Abstand im Muster muss > 0 sein");
    if (count > 200) throw new Error("Höchstens 200 Stück je Muster");
    return { count, spacing: count > 1 ? spacing : 0 };
  }
  if (!/^\d+$/.test(s)) throw new Error("Muster als Anzahl × Abstand, z. B. „3x25“");
  if (Number(s) !== 1) throw new Error("Mehrere Stück brauchen einen Abstand, z. B. „3x25“");
  return { count: 1, spacing: 0 };
}

/** Schnittlänge einer Kontur (Formeln aus schneidweg.py) */
export function cutLength(c) {
  switch (c.kind) {
    case "bohrung": return Math.PI * c.d;
    case "langloch": return 2 * (c.l - c.b) + Math.PI * c.b;
    case "rechteck": return 2 * (c.l + c.b) - 8 * c.r + 2 * Math.PI * c.r;
    case "ausklinkung": return 2 * (c.l - c.r) + (c.b - 2 * c.r) + Math.PI * c.r; // offen zum Ende, Endschnitt nicht gekürzt
  }
  return 0;
}
/** Hüllmaß für die Konturklasse (Bohrung d, sonst größeres Maß) */
export const cutEnvelope = (c) => (c.kind === "bohrung" ? c.d : Math.max(c.l, c.b));

/**
 * Konturen eines Profils planen.
 * cuts: Feature-Einträge (Texte), ev(text, label) wertet Ausdrücke aus.
 * prof: { kind, W (Maß längs u), H (Maß längs v), t (Wand), r (Außenradius), L (Länge) }
 * Ergebnis: { items: [{ index, kind, xs[], angle, q, d, l, b, r, through, end, halfN, faceHalf }], issues: [{ index, message }],
 *            cutLength, pierces }
 */
export function planTubeCuts(cuts, prof, ev) {
  const items = [], issues = [];
  const round = prof.kind === "rohr";
  if (!TUBE_CUT_SECTIONS.includes(prof.kind)) {
    if ((cuts || []).length) issues.push({ index: -1, message: "Konturen am Rohr nur für Rund-, Quadrat- und Rechteckrohr" });
    return { items, issues, cutLength: 0, pierces: 0 };
  }
  (cuts || []).forEach((c, index) => {
    const kind = TUBE_CUT_KINDS[c.kind] ? c.kind : null;
    const name = `Kontur ${index + 1}`;
    const err = (m) => issues.push({ index, message: `${name}: ${m}` });
    if (!kind) return err("unbekannte Art");
    try {
      const num = (k, label) => ev(c[k] ?? "0", `${name} ${label}`);
      const it = { index, kind, through: !!c.through, end: c.end === "B" ? "B" : "A" };
      for (const k of TUBE_CUT_KINDS[kind].fields) it[k] = num(k, TUBE_CUT_FIELDS[k]);
      if (kind === "bohrung") { it.l = it.b = it.d; it.r = it.d / 2; }
      if (kind === "langloch") it.r = it.b / 2;
      it.q = num("q", "Versatz");
      // Seite: Rechteckrohre nur die vier Flächen, Rundrohr beliebiger Winkel
      if (round) it.angle = ((num("angle", "Winkel") % 360) + 360) % 360;
      else {
        const s = SIDES.find(([n]) => n === c.side);
        if (!s) return err("Seite oben, vorne, unten oder hinten wählen");
        it.angle = s[1];
      }
      const side = !round && (it.angle === 90 || it.angle === 270); // vorne/hinten: Fläche über die Höhe
      it.halfN = round ? prof.W / 2 : (side ? prof.W : prof.H) / 2;
      // halbe Breite der Fläche quer (Rechteck: ebener Teil ohne Eckradien; Rundrohr: halber Umfang als Grenze)
      it.faceHalf = round ? prof.W / 2 : (side ? prof.H : prof.W) / 2 - (prof.r || 0);
      if (!(it.l > 0) || !(it.b > 0)) return err(kind === "bohrung" ? "Durchmesser muss > 0 sein" : "Länge und Breite müssen > 0 sein");
      if (kind === "langloch" && !(it.l > it.b)) return err("Länge muss größer als die Breite sein");
      if ((kind === "rechteck" || kind === "ausklinkung") && !(it.r >= 0 && it.r <= Math.min(it.l, it.b) / 2 + 1e-9))
        return err(`Eckradius 0 bis ${fmt(Math.min(it.l, it.b) / 2)} mm`);
      if (Math.abs(it.q) + it.b / 2 > it.faceHalf + 1e-6)
        return err(round ? `breiter als das Rohr (höchstens ${fmt(prof.W)} mm)` : `ragt über die ebene Fläche (|Versatz| + b/2 höchstens ${fmt(it.faceHalf)} mm)`);
      if (kind === "ausklinkung") {
        if (it.l >= prof.L - 1e-6) return err("länger als das Teil");
        it.xs = [it.end === "A" ? 0 : prof.L];
      } else {
        const { count, spacing } = parsePattern(c.pattern, (s) => ev(s, `${name} Abstand`));
        const x0 = num("x", "Lage");
        it.xs = Array.from({ length: count }, (_, i) => x0 + i * spacing);
        const lo = it.xs[0] - it.l / 2, hi = it.xs[it.xs.length - 1] + it.l / 2;
        if (lo < -1e-6 || hi > prof.L + 1e-6) return err(`liegt nicht ganz auf dem Teil (${fmt(lo)} bis ${fmt(hi)} mm, Teil 0 bis ${fmt(prof.L)} mm)`);
        if (count > 1 && spacing < it.l - 1e-6) return err("Konturen im Muster überlappen (Abstand kleiner als die Länge)");
      }
      items.push(it);
    } catch (e) {
      err(e.message.replace(`${name} `, ""));
    }
  });
  let len = 0, pierces = 0;
  for (const it of items) {
    const k = it.xs.length * (it.through ? 2 : 1);
    len += k * cutLength(it);
    pierces += k;
  }
  return { items, issues, cutLength: len, pierces };
}

/** Kurztext für Baum und Liste: "Bohrung Ø10 oben, 3× ab 100" */
export function tubeCutLabel(it) {
  const m = it.kind === "bohrung" ? `Ø${fmt(it.d)}` : `${fmt(it.l)}×${fmt(it.b)}`;
  const side = SIDES.find(([, a]) => a === it.angle)?.[0] || `${fmt(it.angle)}°`;
  const where = it.kind === "ausklinkung" ? `Ende ${it.end}` : it.xs.length > 1 ? `${it.xs.length}× ab ${fmt(it.xs[0])}` : `bei ${fmt(it.xs[0])}`;
  return `${TUBE_CUT_KINDS[it.kind].label} ${m} ${side}${it.through ? " durchgehend" : ""}, ${where}`;
}
