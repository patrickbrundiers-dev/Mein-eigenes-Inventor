// Statik-Schnellprüfung Geländer (Z6) – Vorbemessung, ersetzt keinen Standsicherheitsnachweis.
// Holmlast (horizontale Linienlast in Handlaufhöhe) nach DIN EN 1991-1-1 mit NA (Tabelle 6.12DE):
//   0,5 kN/m  Kategorie A, B, D (Wohnen, Büro, Verkauf) und T1 (Treppen in Wohngebäuden),
//   1,0 kN/m  Kategorie C1–C4, E1 (Versammlung, öffentlich, Fabriken, Lager mit Personenverkehr),
//   2,0 kN/m  Kategorie C5 (Tribünen, Menschenansammlungen).
// Nachweise (Bemessungslast = 1,5 × Holmlast, Werkstoff mit γM = 1,0, elastisch):
//   Pfosten als Kragarm: M = 1,5 · q · a · h; Ausnutzung = M / (W · fy); Kopfverschiebung f = q·a·h³ / (3·E·I) ≤ h/60 (Richtwert).
//   Handlauf als Einfeldträger zwischen den Pfosten (auf der sicheren Seite): M = 1,5 · q · a² / 8, f = 5·q·a⁴/(384·E·I) ≤ a/200.
//   Dübel/Schrauben an der Platte: Zug je Befestigungsmittel Z = M / (z · n), z = Abstand der Bohrreihen in Lastrichtung –
//   mit der Zulassung (ETA) des Dübels bzw. dem Schraubennachweis vergleichen.
// Reine Rechnung.

export const LOADS = [
  ["auto", "nach Nutzung (Wohnen 0,5 · sonst 1,0 kN/m)"],
  ["0.5", "0,5 kN/m – Wohnen, Büro, Verkauf (Kat. A, B, D)"],
  ["1", "1,0 kN/m – Versammlung, öffentlich, Fabrik (Kat. C, E)"],
  ["2", "2,0 kN/m – Tribünen, Menschenansammlung (Kat. C5)"],
];

export const STATIK_MATS = {
  S235: { label: "S235", fy: 235, E: 210000, plastic: true },
  S355: { label: "S355", fy: 355, E: 210000, plastic: true },
  "1.4301": { label: "Edelstahl 1.4301 (A2)", fy: 230, E: 200000 },
  "1.4571": { label: "Edelstahl 1.4571 (A4)", fy: 240, E: 200000 },
  "6060": { label: "Alu EN AW-6060 T66 (ungeschweißt)", fy: 150, E: 70000 },
};
export const STATIK_MAT_OPTIONS = Object.entries(STATIK_MATS).map(([k, m]) => [k, m.label]);

/** Holmlast in N/mm (= kN/m) aus Auswahl und Nutzung */
export const holmlast = (sel, use) => (sel && sel !== "auto" ? Number(sel) : use === "wohn" ? 0.5 : 1.0);

export const STATIK_RULES = [
  "Vorbemessung (Schnellprüfung) – ersetzt keinen Standsicherheitsnachweis; Verankerung im Untergrund, Schweißnähte und Glas sind nicht nachgewiesen.",
  "Holmlast in Handlaufhöhe nach DIN EN 1991-1-1/NA, Tabelle 6.12DE; Teilsicherheit 1,5, Werkstoff γM = 1,0.",
  "Baustahl: plastisches Widerstandsmoment für Rohr, Rundstahl, Flach- und Hohlprofile (Querschnittsklasse 1/2 angenommen), sonst elastisch; Edelstahl und Aluminium elastisch.",
  "Pfosten: Kragarm, eingespannt an der Befestigung, Einzugsbreite = größtes Feld; Kopfverschiebung ≤ H/60 (Richtwert ohne Normgrenze, darüber gelb).",
  "Handlauf: Einfeldträger über das größte Feld (sicher gegenüber Durchlaufträger); Durchbiegung ≤ Feld/200 (Richtwert, darüber gelb).",
  "Rundrohr und Rundstahl: gleiche Achsen. Quadratrohr: schwächere Achse. Rechteckrohr und Flachstahl: starke Achse quer zum Geländer (übliche Einbaulage).",
  "Dübel/Schrauben: Zug je Befestigungsmittel aus Moment ÷ (Abstand der Bohrreihen in Lastrichtung × Anzahl je Reihe) – Druckpunkt und Hebelarm vereinfacht, Wert mit der Dübelzulassung vergleichen.",
];

// ---------------------------------------------------------------------------------------------------------------
// Querschnittswerte aus der Kontur (sectionGeometry): Kreise geschlossen, Pfade als Polygon (Bögen fein unterteilt)

function circleCenter(a, b, c) {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) return null;
  const q = (p) => p[0] * p[0] + p[1] * p[1];
  return [(q(a) * (b[1] - c[1]) + q(b) * (c[1] - a[1]) + q(c) * (a[1] - b[1])) / d, (q(a) * (c[0] - b[0]) + q(b) * (a[0] - c[0]) + q(c) * (b[0] - a[0])) / d];
}
function loopPolygon(loop) {
  if (loop.kind === "circle") return null;
  const pts = [loop.start];
  let cur = loop.start;
  for (const sg of loop.segs) {
    if (sg.t === "arc" && sg.mid) {
      const c = circleCenter(cur, sg.mid, sg.to);
      if (c) {
        const ang = (p) => Math.atan2(p[1] - c[1], p[0] - c[0]), r = Math.hypot(cur[0] - c[0], cur[1] - c[1]);
        const norm = (x) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const a0 = ang(cur), am = norm(ang(sg.mid) - a0), a1 = norm(ang(sg.to) - a0);
        const sweep = am <= a1 ? a1 : a1 - 2 * Math.PI;
        for (let k = 1; k < 12; k++) { const t = a0 + (sweep * k) / 12; pts.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]); }
      }
    }
    pts.push(sg.to);
    cur = sg.to;
  }
  return pts;
}
/** Fläche, statische Momente und Flächenmomente (um den Ursprung) eines Polygons, Vorzeichen nach Umlaufsinn */
function polyMoments(pts) {
  let A = 0, Sx = 0, Sy = 0, Ixx = 0, Iyy = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], c = x0 * y1 - x1 * y0;
    A += c / 2;
    Sx += ((x0 + x1) * c) / 6; Sy += ((y0 + y1) * c) / 6;
    Iyy += ((x0 * x0 + x0 * x1 + x1 * x1) * c) / 12; // ∫x² dA
    Ixx += ((y0 * y0 + y0 * y1 + y1 * y1) * c) / 12; // ∫y² dA
  }
  return { A, Sx, Sy, Ixx, Iyy, ys: pts.map((p) => p[1]), xs: pts.map((p) => p[0]) };
}
function loopMoments(loop) {
  if (loop.kind === "circle") {
    const [cx, cy] = loop.c, r = loop.r, A = Math.PI * r * r, I0 = (Math.PI * r ** 4) / 4;
    return { A, Sx: A * cx, Sy: A * cy, Ixx: I0 + A * cy * cy, Iyy: I0 + A * cx * cx, ys: [cy - r, cy + r], xs: [cx - r, cx + r] };
  }
  const m = polyMoments(loopPolygon(loop));
  if (m.A < 0) for (const k of ["A", "Sx", "Sy", "Ixx", "Iyy"]) m[k] = -m[k];
  return m;
}

/**
 * Querschnittswerte: A (mm²), Iu (Biegung um die u-Achse = Last in v-Richtung), Iv, Wu, Wv (mm³).
 * geom = sectionGeometry(...) mit outer, holes.
 */
export function sectionProps(geom) {
  const o = loopMoments(geom.outer), hs = (geom.holes || []).map(loopMoments);
  const sum = (k) => o[k] - hs.reduce((s, h) => s + h[k], 0);
  const A = sum("A"), cx = sum("Sx") / A, cy = sum("Sy") / A;
  const Iu = sum("Ixx") - A * cy * cy, Iv = sum("Iyy") - A * cx * cx;
  const ev = Math.max(...o.ys.map((y) => Math.abs(y - cy))), eu = Math.max(...o.xs.map((x) => Math.abs(x - cx)));
  return { A, Iu, Iv, Wu: Iu / ev, Wv: Iv / eu };
}

/** Biegewerte für die Holmlast je nach Profilart (siehe STATIK_RULES) → { I, W, axis } */
export function bendingAxis(kind, geom, dims = null) {
  const s = sectionProps(geom);
  const r = bendingAxisEl(kind, s);
  const Wpl = plasticModulus(kind, dims || {}, r.axis);
  return Wpl ? { ...r, Wpl } : r;
}
/** Plastisches Widerstandsmoment (Querschnittsklasse 1/2) für einfache Profile; ohne Ausrundungen, sonst null */
export function plasticModulus(kind, d, axis) {
  if (kind === "rohr" && d.D > 0 && d.t > 0) return (d.D ** 3 - (d.D - 2 * d.t) ** 3) / 6;
  if (kind === "rund" && d.D > 0) return d.D ** 3 / 6;
  if (kind === "flach" && d.B > 0 && d.t > 0) return axis === "stark" ? (d.t * d.B * d.B) / 4 : (d.B * d.t * d.t) / 4;
  if ((kind === "vierkant" || kind === "rechteck") && d.B > 0 && d.t > 0) {
    const B = d.B, H = kind === "vierkant" ? B : d.H, t = d.t;
    const [b, h] = axis === "stark" ? [Math.min(B, H), Math.max(B, H)] : [Math.max(B, H), Math.min(B, H)];
    return (b * h * h - (b - 2 * t) * (h - 2 * t) ** 2) / 4;
  }
  return null;
}
function bendingAxisEl(kind, s) {
  // Breite u, Höhe v: Rechteck/Flach mit der großen Abmessung quer zum Geländer → Biegung um die schwache Abmessung als Hebel
  const strong = s.Iu >= s.Iv ? { I: s.Iu, W: s.Wu } : { I: s.Iv, W: s.Wv };
  const weak = s.Iu >= s.Iv ? { I: s.Iv, W: s.Wv } : { I: s.Iu, W: s.Wu };
  if (kind === "rechteck" || kind === "flach") return { ...strong, axis: "stark" };
  return { ...weak, axis: kind === "rohr" || kind === "rund" ? "rund" : "schwach" };
}

const ampel = (eta) => (eta > 1 + 1e-9 ? "rot" : eta > 0.8 ? "gelb" : "grün");
// Verformung: keine Normgrenze, nur Richtwert – über dem Richtwert gelb (Hinweis), nie rot
const soft = (eta) => (eta > 1 + 1e-9 ? "gelb" : "grün");

/**
 * Schnellprüfung eines Geländers. q: Holmlast N/mm, h: Hebelarm Pfosten (Befestigung bis OK Handlauf) mm,
 * a: größtes Feld mm, post / rail: { kind, geom }, mat: Schlüssel aus STATIK_MATS,
 * mount: { z (Abstand der Bohrreihen in Lastrichtung, mm), perRow (Befestigungsmittel je Reihe), label } oder null.
 * Rückgabe { q, mat, checks: [{ id, name, value, limit, unit, eta, light, text }], worst, light, summary, anchor }
 */
export function railingStatics({ q, h, a, post, rail, mat = "S235", mount = null }) {
  const M = STATIK_MATS[mat] || STATIK_MATS.S235;
  const checks = [];
  const pct = (x) => Math.round(x * 100);
  const n1 = (x) => String(Math.round(x * 10) / 10).replace(".", ",");
  if (post?.geom && h > 0 && a > 0) {
    const s = bendingAxis(post.kind, post.geom, post.dims);
    const W = M.plastic && s.Wpl ? s.Wpl : s.W, wl = M.plastic && s.Wpl ? "Wpl" : "Wel";
    const F = q * a, Med = 1.5 * F * h, eta = Med / (W * M.fy);
    checks.push({ id: "post", name: "Pfosten Biegung", value: Med / 1e6, unit: "kNm", limit: (W * M.fy) / 1e6, eta, light: ampel(eta), text: `M = 1,5 · ${n1(q)} kN/m · ${n1(a / 1000)} m · ${n1(h / 1000)} m = ${n1(Med / 1e6)} kNm, aufnehmbar ${n1((W * M.fy) / 1e6)} kNm (${wl} = ${n1(W / 1000)} cm³) → ${pct(eta)} %` });
    const f = (F * h ** 3) / (3 * M.E * s.I), fl = h / 60;
    checks.push({ id: "postDef", name: "Pfosten Kopfverschiebung", value: f, unit: "mm", limit: fl, eta: f / fl, light: soft(f / fl), text: `f = ${n1(f)} mm, Richtwert H/60 = ${n1(fl)} mm (I = ${n1(s.I / 1e4)} cm⁴) → ${pct(f / fl)} %` });
    if (mount?.z > 0 && mount.perRow > 0) {
      const Z = Med / (mount.z * mount.perRow);
      checks.push({ id: "anchor", name: "Zug je Dübel/Schraube", value: Z / 1000, unit: "kN", limit: null, eta: null, light: "info", text: `Z = ${n1(Med / 1e6)} kNm ÷ (${Math.round(mount.z)} mm × ${mount.perRow}) = ${n1(Z / 1000)} kN (Bemessungswert) – mit der Zulassung des Dübels vergleichen${mount.label ? " (" + mount.label + ")" : ""}` });
    }
  }
  if (rail?.geom && a > 0) {
    // Handlauf liegt flach (Rechteck/Flach mit der Breite waagrecht): Holmlast biegt um die schwächere Achse
    const s0 = sectionProps(rail.geom), weak = s0.Iu <= s0.Iv ? { I: s0.Iu, W: s0.Wu } : { I: s0.Iv, W: s0.Wv };
    const Wpl = plasticModulus(rail.kind, rail.dims || {}, "schwach"), s = { ...weak };
    const W = M.plastic && Wpl ? Wpl : s.W;
    const Med = (1.5 * q * a * a) / 8, eta = Med / (W * M.fy);
    checks.push({ id: "rail", name: "Handlauf Biegung", value: Med / 1e6, unit: "kNm", limit: (W * M.fy) / 1e6, eta, light: ampel(eta), text: `M = 1,5 · ${n1(q)} · ${n1(a / 1000)}² / 8 = ${n1(Med / 1e6)} kNm, aufnehmbar ${n1((W * M.fy) / 1e6)} kNm → ${pct(eta)} %` });
    const f = (5 * q * a ** 4) / (384 * M.E * s.I), fl = a / 200;
    checks.push({ id: "railDef", name: "Handlauf Durchbiegung", value: f, unit: "mm", limit: fl, eta: f / fl, light: soft(f / fl), text: `f = ${n1(f)} mm, Richtwert Feld/200 = ${n1(fl)} mm → ${pct(f / fl)} %` });
  }
  const rated = checks.filter((c) => c.eta != null);
  const worst = rated.reduce((m, c) => (c.eta > (m?.eta ?? -1) ? c : m), null);
  const order = ["grün", "gelb", "rot"];
  const light = rated.length ? order[Math.max(...rated.map((c) => order.indexOf(c.light)))] : "info";
  const summary = rated.length ? `Statik (Vorbemessung, ${n1(q)} kN/m, ${M.label}): ` + rated.filter((c) => c.id === "post" || c.id === "rail").map((c) => `${c.name.split(" ")[0]} ${pct(c.eta)} %${c.light === "gelb" ? " (knapp)" : ""}`).join(", ") + (worst ? `; maßgebend ${worst.name} ${pct(worst.eta)} %` : "") : "";
  return { q, mat, matLabel: M.label, checks, worst, light, summary };
}

/** Meldungen für den Generator: nur rot (über 100 %) als Warnung am Feld des Profils; gelb steht in der Zusammenfassung */
export function staticsIssues(r, keys = { post: "post", postDef: "post", rail: "rail", railDef: "rail" }) {
  const out = [];
  for (const c of r.checks) {
    if (c.light === "rot") out.push({ key: keys[c.id] || "post", level: "Warnung", message: `Statik-Schnellprüfung: ${c.name} ${Math.round(c.eta * 100)} % – größeres Profil oder kleineren Pfostenabstand wählen` });
  }
  return out;
}

/** Nachweisblatt (A4) als Seite für mappeHtml */
export function staticsPage(r, { title = "", number = "", input = [] } = {}) {
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const col = { grün: "#2e7d32", gelb: "#b8860b", rot: "#c62828", info: "#555" };
  const word = { grün: "erfüllt", gelb: "knapp", rot: "nicht erfüllt", info: "vergleichen" };
  const rows = r.checks.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.text)}</td><td style="color:${col[c.light]};font-weight:bold;white-space:nowrap">● ${word[c.light]}</td></tr>`).join("");
  const inp = input.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("");
  return { html: `<div class="lst"><h1>Statik-Schnellprüfung Geländer</h1><div class="sub">${esc([title, number, new Date().toLocaleDateString("de-DE")].filter(Boolean).join(" · "))}</div>
<p style="border:0.3mm solid #c62828;padding:2mm;color:#c62828"><b>Vorbemessung</b> – ersetzt keinen Standsicherheitsnachweis durch einen Tragwerksplaner.</p>
<h2>Eingangswerte</h2><table><tbody>${inp}<tr><td>Holmlast</td><td>${String(r.q).replace(".", ",")} kN/m (charakteristisch)</td></tr><tr><td>Werkstoff</td><td>${esc(r.matLabel)}</td></tr></tbody></table>
<h2>Nachweise</h2><table><thead><tr><th>Nachweis</th><th>Rechnung</th><th>Ergebnis</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Annahmen</h2><ul>${STATIK_RULES.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>`, width: 210, height: 297 };
}
