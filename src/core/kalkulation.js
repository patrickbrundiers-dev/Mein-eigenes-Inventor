// Kalkulation (R4, früher E2): Vorkalkulation aus den Daten der Fertigungsmappe – Material (Stangen inkl. Verschnitt,
// Bleche mit Zuschlag), Fertigungszeiten (Zuschnitt, Bohren, Schweißen, Teile handhaben), Oberfläche, Normteile,
// Gemeinkosten und Gewinn. Sätze und Zeiten kommen aus den Einstellungen (Kategorie »Kalkulation«), die Mengen aus
// Stückliste, Zuschnittliste, Stangenplan und Nahtliste. Ergebnis ist eine Schätzung als Angebotsgrundlage.

export const CALC_RULES = [
  "Profile: gekaufte Stangen laut Stangenplan (mit Verschnitt) × Preis je kg des Werkstoffs.",
  "Bleche, Platten und übrige Teile: Masse laut Stückliste + Blechverschnitt (%) × Preis je kg.",
  "Zuschnitt: je Profilteil eine Schnittzeit, mit Gehrung oder Ausklinkung zusätzlich die Gehrungszeit.",
  "Bohren: je Bohrung (Stäbe aus Generatoren und Platten) die Lochzeit.",
  "Schweißen: Nahtlänge in Metern × Minuten je Meter (Nahtliste mit den Nähten der Generatoren).",
  "Teile: je Bauteil der Stückliste die Zeit für Heften, Richten und Handhaben.",
  "Oberfläche: Gesamtmasse × Preis je kg für Verzinken und/oder Pulvern.",
  "Normteile: Stückzahl × Pauschalpreis.",
  "Gemeinkosten auf Material, Lohn, Oberfläche und Normteile; Gewinn auf die Summe mit Gemeinkosten.",
];

/** Startwerte (Einstellungen kalkulation.*) – bitte an den eigenen Betrieb anpassen */
export const CALC_DEFAULTS = {
  stundensatz: 65, stahl: 1.4, edelstahl: 5.5, alu: 5, sonst: 3, blechVerschnitt: 15,
  schnitt: 3, gehrung: 2, loch: 1.5, plattenTeil: 4, nahtM: 15, teil: 3,
  verzinken: 0.6, pulvern: 1.4, normteil: 0.5, gemein: 15, gewinn: 10,
};

/** Werkstoffgruppe für den Preis je kg aus der Werkstoff-Bezeichnung */
export function materialFamily(label) {
  const s = String(label || "");
  if (/edelstahl|1\.4\d{3}/i.test(s)) return "edelstahl";
  if (/alu|AlMg|EN AW/i.test(s)) return "alu";
  if (/stahl|S235|S355/i.test(s)) return "stahl";
  return "sonst";
}

const FAMILY_LABEL = { stahl: "Stahl", edelstahl: "Edelstahl", alu: "Aluminium", sonst: "Sonstige Werkstoffe" };
const r2 = (x) => Math.round(x * 100) / 100;

/**
 * Kalkulation. Eingaben:
 *   bom: Stücklistenzeilen [{ qty, mass, material, part? }] (ohne part = Normteil)
 *   cut: Zuschnittzeilen [{ qty, mass, material, miters, coped }]
 *   bars: Stangenplan (planBars) oder null
 *   welds: Nahtzeilen [{ length (gesamt, mm) }]
 *   holes: Anzahl Bohrungen, plates: Anzahl Platten/Bleche
 *   surface: { verzinken: bool, pulvern: bool }
 *   rates: Sätze wie CALC_DEFAULTS (fehlende aus den Startwerten)
 * Rückgabe { lines: [{ group, text, qty, unit, rate, cost }], material, labour, minutes, surface, norms, base, overhead,
 *   profit, net, mass }
 */
export function calculate({ bom = [], cut = [], bars = null, welds = [], holes = 0, plates = 0, surface = {} } = {}, rates = {}) {
  const R = { ...CALC_DEFAULTS, ...Object.fromEntries(Object.entries(rates).filter(([, v]) => Number.isFinite(Number(v)) && v !== "" && v !== null).map(([k, v]) => [k, Number(v)])) };
  const lines = [];
  const line = (group, text, qty, unit, rate, cost) => { if (qty > 0 && Number.isFinite(cost)) lines.push({ group, text, qty: r2(qty), unit, rate: r2(rate), cost: r2(cost) }); };
  // Material: Profile über den Stangenplan, der Rest über die Stückliste
  const priceOf = (fam) => R[fam] ?? R.sonst;
  const byFam = new Map();
  const addKg = (fam, kg, what) => { const k = fam + "|" + what; byFam.set(k, (byFam.get(k) || 0) + kg); };
  const cutMass = new Map();
  for (const c of cut) { const f = materialFamily(c.material); cutMass.set(f, (cutMass.get(f) || 0) + (c.mass || 0) * (c.qty || 1)); }
  if (bars?.groups?.length) for (const g of bars.groups) addKg(materialFamily(g.material), g.buyKg || 0, "Profile (Stangen)");
  else for (const [f, kg] of cutMass) addKg(f, kg, "Profile");
  const partMass = new Map();
  for (const b of bom) if (b.part) { const f = materialFamily(b.material); partMass.set(f, (partMass.get(f) || 0) + (b.mass || 0) * (b.qty || 1)); }
  for (const [f, kg] of partMass) {
    const rest = kg - (cutMass.get(f) || 0);
    if (rest > 0.01) addKg(f, rest * (1 + R.blechVerschnitt / 100), `Bleche und Teile (+${R.blechVerschnitt} %)`);
  }
  let material = 0;
  for (const [k, kg] of byFam) {
    const [fam, what] = k.split("|");
    const cost = kg * priceOf(fam);
    material += cost;
    line("Material", `${FAMILY_LABEL[fam]} – ${what}`, kg, "kg", priceOf(fam), cost);
  }
  // Fertigungszeiten in Minuten
  const pieces = cut.reduce((a, c) => a + (c.qty || 1), 0);
  const mitred = cut.reduce((a, c) => a + ((c.miters?.[0] || c.miters?.[1] || c.coped) ? c.qty || 1 : 0), 0);
  const weldM = welds.reduce((a, w) => a + (w.length || 0), 0) / 1000;
  const parts = bom.filter((b) => b.part).reduce((a, b) => a + (b.qty || 1), 0);
  const work = [
    ["Zuschnitt Profile", pieces, "Stk", R.schnitt],
    ["Gehrung / Ausklinkung", mitred, "Stk", R.gehrung],
    ["Bohren", holes, "Stk", R.loch],
    ["Platten und Bleche", plates, "Stk", R.plattenTeil],
    ["Schweißen", weldM, "m", R.nahtM],
    ["Heften, Richten, Handhaben", parts, "Stk", R.teil],
  ];
  let minutes = 0;
  for (const [text, qty, unit, min] of work) {
    const m = qty * min;
    minutes += m;
    line("Fertigung", `${text} (${String(min).replace(".", ",")} min/${unit})`, qty, unit, (min / 60) * R.stundensatz, (m / 60) * R.stundensatz);
  }
  const labour = (minutes / 60) * R.stundensatz;
  // Oberfläche und Normteile
  const mass = bom.reduce((a, b) => a + (b.mass || 0) * (b.qty || 1), 0);
  let surf = 0;
  if (surface.verzinken) { surf += mass * R.verzinken; line("Oberfläche", "Feuerverzinken", mass, "kg", R.verzinken, mass * R.verzinken); }
  if (surface.pulvern) { surf += mass * R.pulvern; line("Oberfläche", "Pulverbeschichten", mass, "kg", R.pulvern, mass * R.pulvern); }
  const normQty = bom.filter((b) => !b.part).reduce((a, b) => a + (b.qty || 1), 0);
  const norms = normQty * R.normteil;
  line("Normteile", "Normteile pauschal", normQty, "Stk", R.normteil, norms);
  const base = material + labour + surf + norms;
  const overhead = (base * R.gemein) / 100, profit = ((base + overhead) * R.gewinn) / 100;
  return { lines, material: r2(material), labour: r2(labour), minutes: Math.round(minutes), surface: r2(surf), norms: r2(norms), base: r2(base), overhead: r2(overhead), profit: r2(profit), net: r2(base + overhead + profit), mass: r2(mass), rates: R };
}

/** Oberfläche aus den Bauteilen: verzinkt/pulverbeschichtet, wenn ein Teil es trägt (Text der Oberflächenangabe) */
export function surfaceOf(finishTexts) {
  const t = finishTexts.filter(Boolean).join(" ").toLowerCase();
  return { verzinken: /verzink/.test(t), pulvern: /pulver|beschicht|lackier|ral/.test(t) };
}
