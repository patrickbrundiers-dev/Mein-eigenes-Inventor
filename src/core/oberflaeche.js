// Oberfläche je Bauteil (Erweiterung E7): roh, verzinkt, pulverbeschichtet mit RAL-Farbe, Duplex (verzinkt + pulver),
// lackiert. Reine Daten und Texte; Anzeige (Farbe, Fotodarstellung), Stückliste und Kalkulation nutzen sie.
//
// Im Bauteil: part.finish = { kind, ral }. Fehlt finish, gilt »roh« (Werkstofffarbe wie bisher).

export const FINISHES = {
  roh: { label: "roh", short: "" },
  verzinkt: { label: "feuerverzinkt", short: "tZn" },
  pulver: { label: "pulverbeschichtet", short: "pulver", ral: true },
  duplex: { label: "verzinkt + pulverbeschichtet", short: "tZn + pulver", ral: true },
  lack: { label: "lackiert", short: "lack", ral: true },
};

/** Gängige RAL-Farben im Metallbau (Farbwerte gerundet, für Bildschirm und Bild, nicht für die Farbabnahme) */
export const RAL = {
  "1013": { name: "Perlweiß", hex: "#e3d9c6" },
  "1015": { name: "Hellelfenbein", hex: "#e6d2b5" },
  "1021": { name: "Kadmiumgelb", hex: "#eec900" },
  "2004": { name: "Reinorange", hex: "#e75b12" },
  "3000": { name: "Feuerrot", hex: "#a72920" },
  "3004": { name: "Purpurrot", hex: "#6b1c23" },
  "3020": { name: "Verkehrsrot", hex: "#bb1e10" },
  "5002": { name: "Ultramarinblau", hex: "#20214f" },
  "5010": { name: "Enzianblau", hex: "#13447c" },
  "5014": { name: "Taubenblau", hex: "#637d96" },
  "6005": { name: "Moosgrün", hex: "#0f4336" },
  "6009": { name: "Tannengrün", hex: "#27352a" },
  "6018": { name: "Gelbgrün", hex: "#48a43f" },
  "7001": { name: "Silbergrau", hex: "#8a9597" },
  "7012": { name: "Basaltgrau", hex: "#575d5e" },
  "7015": { name: "Schiefergrau", hex: "#4f5358" },
  "7016": { name: "Anthrazitgrau", hex: "#383e42" },
  "7021": { name: "Schwarzgrau", hex: "#2f3234" },
  "7024": { name: "Graphitgrau", hex: "#474a50" },
  "7030": { name: "Steingrau", hex: "#939388" },
  "7035": { name: "Lichtgrau", hex: "#cbd0cc" },
  "7037": { name: "Staubgrau", hex: "#7a7b7a" },
  "7039": { name: "Quarzgrau", hex: "#6c6960" },
  "7040": { name: "Fenstergrau", hex: "#9da3a6" },
  "8017": { name: "Schokoladenbraun", hex: "#44322d" },
  "8019": { name: "Graubraun", hex: "#3d3635" },
  "9001": { name: "Cremeweiß", hex: "#e9e0d2" },
  "9005": { name: "Tiefschwarz", hex: "#0e0e10" },
  "9006": { name: "Weißaluminium", hex: "#a1a1a0" },
  "9007": { name: "Graualuminium", hex: "#878581" },
  "9010": { name: "Reinweiß", hex: "#f1ece1" },
  "9016": { name: "Verkehrsweiß", hex: "#f1f0ea" },
  "DB703": { name: "Eisenglimmer", hex: "#4a4b4d" },
};

const ZINC = "#a9b1b6";

/** Oberfläche eines Bauteils, immer gültig ({ kind, ral, def }) */
export function finishOf(part) {
  const f = part?.finish || {};
  const kind = FINISHES[f.kind] ? f.kind : "roh";
  const def = FINISHES[kind];
  const ral = def.ral ? String(f.ral || "").replace(/^RAL\s*/i, "").trim() : "";
  return { kind, ral, def };
}

export const ralName = (ral) => (RAL[ral] ? `RAL ${ral} ${RAL[ral].name}` : ral ? `RAL ${ral}` : "");

/** Text für Stückliste und Schriftfeld; short = knapp (»tZn + pulver RAL 7016«), leer bei roh */
export function finishLabel(part, { short = false } = {}) {
  const { kind, ral, def } = finishOf(part);
  if (kind === "roh") return "";
  const base = short ? def.short : def.label;
  return ral ? `${base} ${short ? "RAL " + ral : ralName(ral)}` : base;
}

/** Anzeigefarbe aus der Oberfläche oder null (dann Werkstofffarbe) */
export function finishColor(part) {
  const { kind, ral } = finishOf(part);
  if (ral && RAL[ral]) return RAL[ral].hex;
  if (kind === "verzinkt") return ZINC;
  return null;
}

/** PBR-Werte der Oberfläche für die Fotodarstellung oder null (dann Werkstoff) */
export function finishSurface(finish) {
  const { kind, ral } = finishOf({ finish });
  if (kind === "roh") return null;
  if (kind === "verzinkt") return { metalness: 0.85, roughness: 0.5, color: ZINC, label: "feuerverzinkt" };
  const color = RAL[ral]?.hex || null;
  const metallic = ral === "9006" || ral === "9007" || ral === "DB703";
  return { metalness: metallic ? 0.55 : 0.1, roughness: kind === "lack" ? 0.35 : 0.55, ...(color ? { color } : {}), label: finishLabel({ finish }) };
}
