// Werkzeugfamilien der Skizze (SolidCraft-Abgleich L7): L, R und C starten die zuletzt benutzte Variante,
// nochmal drücken vor dem ersten Klick schaltet zur nächsten.
export const TOOL_FAMILIES = {
  line: ["line", "linem"],
  rect: ["rect", "rectc", "rect3", "rectr"],
  circle: ["circle", "circle3", "circle2", "circlet3", "circlet2"],
};
export function familyOf(tool) {
  for (const [f, list] of Object.entries(TOOL_FAMILIES)) if (list.includes(tool)) return f;
  return null;
}
/**
 * Welches Werkzeug startet die Familientaste? memo = {line: "linem", …}; current = laufendes Werkzeug, idle = noch
 * kein Klick gesetzt; cycle = Einstellung »nochmal drücken wechselt«.
 */
export function familyTool(family, { memo = {}, current = null, idle = true, cycle = true } = {}) {
  const list = TOOL_FAMILIES[family];
  if (!list) return null;
  if (cycle && idle && current && list.includes(current)) return list[(list.indexOf(current) + 1) % list.length];
  return list.includes(memo[family]) ? memo[family] : list[0];
}
