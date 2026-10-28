// Tastenhinweise im Menüband (KeyTips wie in Office/Inventor): Alt drücken und loslassen zeigt Buchstaben an den
// Reitern, danach an den Knöpfen des Reiters. Hier nur die Vergabe der Kürzel, ohne DOM.

const norm = (ch) => ({ Ä: "A", Ö: "O", Ü: "U", ß: "S" })[ch] || ch;

/**
 * Kürzel je Beschriftung: bevorzugt der erste noch freie Buchstabe der Beschriftung (Wortanfänge zuerst),
 * sonst Anfangsbuchstabe + Ziffer (»E2«). Kein Kürzel ist Anfang eines anderen, damit Tippen eindeutig bleibt.
 */
export function assignKeyTips(labels, reserved = []) {
  const used = new Set(reserved);
  const letters = (s) => {
    const up = String(s || "").toUpperCase().replace(/­/g, "");
    const words = up.split(/[^A-ZÄÖÜß0-9]+/).filter(Boolean);
    const order = [...words.map((w) => w[0]), ...up];
    return [...new Set(order.map(norm).filter((c) => /[A-Z0-9]/.test(c)))];
  };
  const singles = labels.map((l) => letters(l));
  const out = new Array(labels.length).fill(null);
  // erst Einzelbuchstaben, wo möglich
  const twoNeeded = [];
  labels.forEach((l, i) => {
    const c = singles[i].find((x) => !used.has(x));
    if (c) { out[i] = c; used.add(c); } else twoNeeded.push(i);
  });
  // dann Buchstabe + Ziffer (»Q1« … »Q9«, dann »X1« …) mit einem Buchstaben, der nicht allein vergeben ist
  const bases = [..."QXYZJVWKP0123456789ABCDEFGHILMNORSTU"].filter((c) => !used.has(c));
  let bi = 0, n = 0;
  for (const i of twoNeeded) {
    if (++n > 9) { bi++; n = 1; }
    if (bi >= bases.length) break;
    out[i] = bases[bi] + n;
  }
  return out;
}

/** Eingabe gegen die Kürzel prüfen: "hit" (genau), "prefix" (weiter tippen) oder "none" */
export function matchKeyTip(codes, typed) {
  const t = typed.toUpperCase();
  const i = codes.indexOf(t);
  if (i >= 0) return { kind: "hit", index: i };
  return codes.some((c) => c && c.startsWith(t)) ? { kind: "prefix" } : { kind: "none" };
}
