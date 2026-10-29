// Unregelmäßige Muster (W3): einzelne Exemplare auslassen und Abstände als Liste statt gleichmäßig.
// Reine Rechnung; die Exemplare setzt der Kern (Feature `pattern`).
//
// Nummern: Exemplar 1 ist das Original. Rechteckmuster zählen zuerst in Richtung 2, dann in Richtung 1:
// Nr = (i − 1) · Anzahl 2 + j mit i = Nr. in Richtung 1, j = Nr. in Richtung 2. Eingabe auch als »i/j«.

/** Liste der ausgelassenen Exemplare aus »3, 5-7, 2/4« → Set von Nummern (≥ 2); wirft bei ungültigen Angaben */
export function parseSkip(text, { n1 = Infinity, n2 = 1 } = {}) {
  const out = new Set();
  for (const raw of String(text || "").split(/[,;\s]+/)) {
    const t = raw.trim();
    if (!t) continue;
    let m;
    if ((m = /^(\d+)\/(\d+)$/.exec(t))) {
      const i = +m[1], j = +m[2];
      if (i < 1 || j < 1 || i > n1 || j > n2) throw new Error(`Auslassen: ${t} liegt außerhalb des Musters`);
      out.add((i - 1) * n2 + j);
    } else if ((m = /^(\d+)\s*-\s*(\d+)$/.exec(t))) {
      const a = +m[1], b = +m[2];
      if (b < a) throw new Error(`Auslassen: Bereich ${t} rückwärts`);
      for (let k = a; k <= b; k++) out.add(k);
    } else if (/^\d+$/.test(t)) out.add(+t);
    else throw new Error(`Auslassen: »${t}« ist keine Nummer (z. B. 3, 5-7 oder 2/4)`);
  }
  if (out.has(1)) throw new Error("Auslassen: Exemplar 1 ist das Original");
  return out;
}

/** Abstände »100; 150; 2*80« (je ein Ausdruck, getrennt mit ;) → Lagen ab dem Original [0, 100, 250, 410] */
export function spacingPositions(text, evaluate) {
  const parts = String(text || "").split(";").map((s) => s.trim()).filter(Boolean);
  const pos = [0];
  parts.forEach((p, k) => {
    const v = evaluate(p, `Abstand ${k + 1}`);
    if (!Number.isFinite(v)) throw new Error(`Abstand ${k + 1} ungültig`);
    pos.push(pos[pos.length - 1] + v);
  });
  return pos;
}
