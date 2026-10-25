// Anschlussbleche am Profilende (MegaCAD-Abgleich M8): Stirn-, Fuß- und Kopfplatte mit Bohrbild, Rippen (Steifen).
// Reine Rechnung (Maße, Bohrbild, Prüfungen); die Körper baut src/kernel/build.js am Stabende des gewählten Profils.
//
// Platte: liegt außen am Stabende (das Profil wird nicht gekürzt), Mitte auf der Stabachse. Größe = Profil + 2 ×
// Überstand oder feste Breite/Höhe (Breite entlang der Profilbreite u, Höhe entlang der Profilhöhe v).
// Bohrbild: 0, 2 (entlang der längeren Seite) oder 4 Bohrungen (Ecken), Randabstand e zur Plattenkante.
// Rippe: Dreieck zwischen Platte und Profilseite, mittig auf der Seite, mit Freischnitt c in der Schweißecke.

export const PLATE_HOLES = [0, 2, 4];
export const RIB_SIDES = { oben: "Oben (+Höhe)", unten: "Unten (−Höhe)", rechts: "Rechts (+Breite)", links: "Links (−Breite)" };

export function defaultPlatte(target, member = 0) {
  return { type: "platte", target, member, end: "A", thickness: "10", overhang: "40", width: "0", height: "0", radius: "0", holes: "4", holeDia: "13", edge: "25" };
}
export function defaultRippe(plate) {
  return { type: "rippe", plate, sides: ["oben", "unten"], length: "80", height: "0", thickness: "8", chamfer: "10" };
}

/**
 * Plattenmaße und Bohrungen. prof = {width, height} des Profils (mm); o = Zahlen aus dem Feature.
 * Rückgabe { W, H, t, r, holes: [[x, y]], d, issues: [{level, message}] }; wirft bei unmöglichen Maßen.
 */
export function platePlan(prof, o) {
  const t = o.thickness, ov = o.overhang || 0;
  const W = o.width > 0 ? o.width : prof.width + 2 * ov;
  const H = o.height > 0 ? o.height : prof.height + 2 * ov;
  if (!(t > 0)) throw new Error("Plattendicke muss > 0 sein");
  if (!(W > 0 && H > 0)) throw new Error("Plattengröße muss > 0 sein");
  const r = Math.max(0, Math.min(o.radius || 0, W / 2 - 1e-3, H / 2 - 1e-3));
  const issues = [];
  if (W < prof.width - 1e-6 || H < prof.height - 1e-6) issues.push({ level: "Warnung", message: "Platte kleiner als das Profil" });
  const n = Math.round(o.holes || 0), d = o.holeDia || 0, e = o.edge || 0;
  if (!PLATE_HOLES.includes(n)) throw new Error("Bohrungen: 0, 2 oder 4");
  let holes = [];
  if (n) {
    if (!(d > 0)) throw new Error("Bohrungsdurchmesser muss > 0 sein");
    if (e < d / 2 + 1e-6) throw new Error(`Randabstand ${fmt(e)} mm zu klein für Ø ${fmt(d)} – mindestens ${fmt(d / 2)} mm`);
    const x = W / 2 - e, y = H / 2 - e;
    if (n === 2) holes = W >= H ? [[-x, 0], [x, 0]] : [[0, -y], [0, y]];
    else holes = [[-x, -y], [x, -y], [x, y], [-x, y]];
    if ((n === 4 || W >= H) && x < d / 2 + 1e-6) throw new Error("Bohrungen überschneiden sich – Platte breiter oder Randabstand kleiner");
    if ((n === 4 || W < H) && y < d / 2 + 1e-6) throw new Error("Bohrungen überschneiden sich – Platte höher oder Randabstand kleiner");
    // Bohrung im Profil? (Profil mittig, Hüllrechteck)
    if (holes.some(([hx, hy]) => Math.abs(hx) - d / 2 < prof.width / 2 && Math.abs(hy) - d / 2 < prof.height / 2))
      issues.push({ level: "Warnung", message: "Bohrung liegt im Profil – Überstand oder Randabstand anpassen" });
    if (e < 1.2 * d) issues.push({ level: "Hinweis", message: `Randabstand unter 1,2 · d (${fmt(1.2 * d)} mm, EN 1993-1-8)` });
  }
  return { W, H, t, r, holes, d, issues };
}

/**
 * Rippe an einer Seite: Dreieck in Profil-Koordinaten. side ∈ RIB_SIDES, prof {width, height}, plate {W, H}.
 * Rückgabe { s0, L, Hr, c, t, poly: [[s, a]] } mit s = Abstand von der Stabachse quer zur Seite, a = Abstand von der
 * Platte in den Stab hinein.
 */
export function ribPlan(side, prof, plate, o) {
  const vertical = side === "oben" || side === "unten";
  const s0 = (vertical ? prof.height : prof.width) / 2;
  const free = (vertical ? plate.H : plate.W) / 2 - s0; // Platte über die Profilseite hinaus
  const Hr = o.height > 0 ? o.height : free;
  const L = o.length, t = o.thickness, c = Math.max(0, o.chamfer || 0);
  if (!(L > 0 && t > 0)) throw new Error("Rippe: Länge und Dicke müssen > 0 sein");
  if (!(Hr > 0)) throw new Error(`Rippe ${side}: Platte steht nicht über das Profil hinaus – Höhe angeben oder Überstand vergrößern`);
  if (Hr > free + 1e-6) throw new Error(`Rippe ${side}: höher als der Plattenüberstand (${fmt(free)} mm)`);
  if (c >= Math.min(L, Hr)) throw new Error("Rippe: Freischnitt größer als die Rippe");
  const poly = c > 0 ? [[s0 + c, 0], [s0 + Hr, 0], [s0, L], [s0, c]] : [[s0, 0], [s0 + Hr, 0], [s0, L]];
  return { s0, L, Hr, c, t, poly };
}

const fmt = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
