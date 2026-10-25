// Spindeltreppe (MegaCAD-Abgleich M14): Stufen als Kreisring-Ausschnitte um ein Mittelrohr, je Stufe ein
// Stufenträger (Flachstahl) und ein Geländerstab außen, Handlauf als gegehrter Zug über die Stabköpfe.
// Reine Rechnung; den Körper baut src/kernel/build.js (Platten mit Umriss »poly«).
//
// Lage: Spindelachse = Z-Achse, Antritt (erste Steigung) bei Winkel 0 (+X), Boden z = 0.
// n Steigungen, n − 1 Stufen; die letzte Steigung führt auf die obere Decke.
// Prüfung: Schrittmaß 2s + a auf der Gehlinie (Mitte der Laufbreite), Durchgangshöhe ≥ 2000 mm (Hinweise, keine Statik).

const DEG = Math.PI / 180;

import { orientRot, rotExtent } from "./orient.js";
import { fieldError } from "./generror.js";
import { normSchema, normRules, railingIssues } from "./gelaendernorm.js";
export const SPINDEL = {
  label: "Spindeltreppe",
  schema: [
    { key: "height", label: "Geschosshöhe", type: "num", default: "2800", group: "Lauf" },
    { key: "steps", label: "Steigungen (0 = automatisch)", type: "num", unit: "Stk", default: "0", group: "Lauf" },
    { key: "D", label: "Außendurchmesser", type: "num", default: "1800", group: "Lauf" },
    { key: "angle", label: "Winkel je Stufe (0 = aus 2s + a = 630)", type: "num", unit: "°", default: "0", group: "Lauf" },
    { key: "dir", label: "Drehrichtung aufwärts", type: "select", options: [["links", "gegen den Uhrzeigersinn"], ["rechts", "im Uhrzeigersinn"]], default: "links", group: "Lauf" },
    { key: "overlap", label: "Überdeckung auf der Gehlinie", type: "num", default: "30", group: "Lauf" },
    { key: "spindle", label: "Spindel (Mittelrohr)", type: "section", default: { kind: "rohr", size: "114.3x3.6" }, group: "Tragwerk" },
    { key: "arm", label: "Stufenträger", type: "section", default: { kind: "flach", size: "60x10" }, group: "Tragwerk" },
    { key: "tread", label: "Stufen", type: "select", options: [["blech", "Blech (Riffelblech)"], ["gitterrost", "Gitterrost"], ["holz", "Holz"]], default: "blech", group: "Stufen" },
    { key: "treadT", label: "Stufendicke", type: "num", default: "6", group: "Stufen" },
    { key: "railing", label: "Geländer außen", type: "check", default: true, group: "Geländer" },
    ...normSchema(undefined, "Geländer", (p) => p.railing, { fall: false }),
    { key: "railH", label: "Geländerhöhe über Stufenvorderkante", type: "num", default: "900", group: "Geländer", when: (p) => p.railing },
    { key: "bars", label: "Stäbe je Stufe (0 = nach Geländernorm)", type: "num", unit: "Stk", default: "0", missing: "1", group: "Geländer", when: (p) => p.railing },
    { key: "post", label: "Geländerstab", type: "section", default: { kind: "rohr", size: "26.9x2.3" }, group: "Geländer", when: (p) => p.railing },
    { key: "rail", label: "Handlauf", type: "section", default: { kind: "rohr", size: "42.4x2.6" }, group: "Geländer", when: (p) => p.railing },
  ],

  plan(p) {
    const issues = [];
    const H = p.height, R = p.D / 2;
    if (!(H > 300)) throw fieldError("Geschosshöhe zu klein", "height");
    const r0 = p.spindle.geom.width / 2;
    if (!(R > r0 + 300)) throw fieldError("Außendurchmesser zu klein für eine Laufbreite ≥ 300 mm", "D");
    const n = p.steps > 0 ? Math.round(p.steps) : Math.max(3, Math.round(H / 190));
    const s = H / n, tt = p.treadT;
    if (!(tt > 0)) throw fieldError("Stufendicke muss > 0 sein", "treadT");
    const rg = (r0 + R) / 2; // Gehlinie
    const theta = p.angle > 0 ? p.angle : ((630 - 2 * s) / rg) / DEG;
    if (!(theta > 5 && theta < 90)) throw fieldError(`Winkel je Stufe ${fmt(theta)}° unbrauchbar (5 … 90°)`, "angle");
    const ag = theta * DEG * rg, step = 2 * s + ag;
    if (step < 590 - 1e-6 || step > 650 + 1e-6) issues.push({ key: "angle", level: "Warnung", message: `Schrittmaß auf der Gehlinie 2s + a = ${Math.round(step)} mm außerhalb 590 … 650 mm` });
    if (s > 210 + 1e-6) issues.push({ key: "steps", level: "Warnung", message: `Steigung ${fmt(s)} mm über 210 mm` });
    const perRev = 360 / theta, head = perRev * s - tt;
    if (head < 2000 - 1e-6) issues.push({ key: "angle", level: "Warnung", message: `Durchgangshöhe ${Math.round(head)} mm unter 2000 mm – größeren Durchmesser oder kleineren Winkel wählen` });
    if (R - r0 < 600 - 1e-6) issues.push({ key: "D", level: "Hinweis", message: `Nutzbare Laufbreite ${Math.round(R - r0)} mm unter 600 mm` });
    const sg = p.dir === "rechts" ? -1 : 1;
    const ov = (p.overlap || 0) / rg / DEG; // Überdeckung als Winkel
    const members = [], plates = [], chains = [];
    const at = (r, deg, z) => [r * Math.cos(deg * DEG), r * Math.sin(deg * DEG), z];
    const topZ = H + (p.railing ? p.railH : 0);
    members.push({ section: p.spindle, a: [0, 0, 0], b: [0, 0, topZ], name: "Spindel", up: [1, 0, 0] });
    const arm = p.arm, armH = Math.max(arm.geom.width, arm.geom.height);
    // Stufenträger hochkant, U/UPN offen nach unten, T mit dem Flansch oben
    const armRot = orientRot(arm, [1, 0, 0], [0, 0, 1], { tall: [0, 0, 1], open: [0, 0, -1], legs: [0, 1, -1], stem: [0, 0, -1] });
    const postOff = p.railing ? Math.max(p.post.geom.width, p.post.geom.height) / 2 + 15 : 0;
    const railPts = [];
    // Stäbe je Stufe: so viele, dass der lichte Abstand (waagrecht) die Geländernorm einhält
    const barW = p.railing ? Math.max(p.post.geom.width, p.post.geom.height) : 0;
    const clearOf = (k) => 2 * (R - postOff) * Math.sin((theta * DEG) / 2 / k) - barW;
    let perStep = !p.railing ? 0 : p.bars > 0 ? Math.round(p.bars) : 1;
    if (p.railing && !(p.bars > 0)) while (perStep < 50 && clearOf(perStep) > normRules(p.use, H).gapV + 1e-6) perStep++;
    for (let i = 1; i < n; i++) {
      // Stufe i: Vorderkante bei (i − 1)·θ, hinten um θ + Überdeckung weiter
      const a0 = sg * (i - 1) * theta, a1 = a0 + sg * (theta + ov);
      const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
      const N = Math.max(4, Math.ceil((hi - lo) / 4));
      const poly = [];
      for (let k = 0; k <= N; k++) { const q = at(R, lo + ((hi - lo) * k) / N, 0); poly.push([q[0], q[1]]); }
      for (let k = 2; k >= 0; k--) { const q = at(r0, lo + ((hi - lo) * k) / 2, 0); poly.push([q[0], q[1]]); } // innen an der Spindel
      const z = i * s;
      plates.push({ center: [0, 0, z - tt], xDir: [1, 0, 0], normal: [0, 0, 1], poly, W: 2 * R, H: 2 * R, t: tt, name: `Stufe ${i}`, tread: p.tread });
      const mid = (a0 + a1) / 2;
      members.push({ section: arm, a: at(r0, mid, z - tt - armH / 2), b: at(R - 20, mid, z - tt - armH / 2), name: `Stufenträger ${i}`, up: [0, 0, 1], rot: armRot });
      if (p.railing) {
        const pa = a0 + sg * theta / 2;
        const top = z + p.railH;
        for (let j = 0; j < perStep; j++) {
          // Handlauf steigt linear zwischen den Stufenmitten: Stab endet auf seiner Höhe
          const f = (j + 0.5) / perStep - 0.5, aj = pa + sg * theta * f;
          members.push({ section: p.post, a: at(R - postOff, aj, z), b: at(R - postOff, aj, top + f * s), name: `Geländerstab ${i}${perStep > 1 ? "." + (j + 1) : ""}`, up: [1, 0, 0] });
        }
        railPts.push(at(R - postOff, pa, top + p.rail.geom.width / 2));
      }
    }
    if (p.railing && railPts.length >= 2) chains.push({ section: p.rail, points: railPts, name: "Handlauf", up: [0, 0, 1] });
    if (p.railing) {
      // Geländernorm: ein Stab je Stufe – lichter Abstand der Stäbe waagrecht gemessen
      issues.push(...railingIssues({ use: p.use, fall: H, height: p.railH, fill: "staketen", gap: clearOf(perStep), bottom: 0, rail: p.rail }, { height: "railH", gap: "post", rail: "rail", use: "use" }));
    }
    const total = (n - 1) * theta;
    const info = `${n} Steigungen à ${fmt(s)} mm, ${fmt(theta)}° je Stufe (Gehlinie ${fmt(ag)} mm, 2s + a = ${Math.round(step)} mm), Gesamtdrehung ${fmt(total)}°, Durchgangshöhe ${Math.round(head)} mm, Laufbreite ${Math.round(R - r0)} mm` + (p.railing ? `, ${perStep} Geländerstäbe je Stufe` : "");
    return { chains, members, plates, info, issues };
  },
};

const fmt = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
