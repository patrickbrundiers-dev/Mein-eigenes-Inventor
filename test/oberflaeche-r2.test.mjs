// SolidCraft-Abgleich Runde 2: Farbthemen und neue Darstellungs-Einstellungen
import test from "node:test";
import assert from "node:assert/strict";
import { THEMES, themeById, themeVars } from "../src/core/themes.js";
import { settingDef, validateValue } from "../src/core/settings.js";

const NEED = ["steel-0", "steel-1", "steel-2", "steel-3", "steel-4", "ink", "ink-soft", "text-faint", "dye", "dye-soft", "surface", "stage-a", "stage-b", "appbar", "appbar-ink", "sk-line", "sk-dim", "err", "warn", "on-dye"];
const hex = /^#[0-9a-f]{6}$/i;
const lum = (c) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("Farbthemen: vollständig, lesbar, im Farbschema wählbar", () => {
  assert.ok(THEMES.length >= 12);
  const def = settingDef("darstellung.schema");
  for (const t of THEMES) {
    for (const k of NEED) assert.match(t.vars[k] || "", hex, `${t.id}: ${k}`);
    assert.ok(["dark", "light"].includes(t.base));
    assert.ok(contrast(t.vars.ink, t.vars["steel-0"]) >= 4.5, `${t.id}: Text auf Panel`);
    assert.ok(contrast(t.vars["on-dye"], t.vars.dye) >= 3, `${t.id}: Text auf Akzent`);
    assert.ok(def.options.some((o) => o.value === t.id));
    assert.ok(validateValue(def, t.id).ok);
    const v = themeVars(t);
    assert.ok(v.rail && v["icon-fill"]);
    if (t.vars["steel-2"] === t.vars["steel-0"]) assert.match(v["steel-2"], /color-mix/);
  }
  assert.equal(themeById("nord").name, "Nord");
  assert.equal(themeById("hell"), null);
});

test("Fensteraufbau, nur Symbole, eigene Hintergrundfarbe", () => {
  assert.equal(settingDef("oberflaeche.anordnung").default, "schwebend");
  assert.ok(validateValue(settingDef("oberflaeche.anordnung"), "kompakt").ok);
  assert.ok(!validateValue(settingDef("oberflaeche.anordnung"), "angedockt").ok);
  assert.equal(settingDef("oberflaeche.nurSymbole").default, false);
  assert.ok(validateValue(settingDef("darstellung.hintergrund"), "#102030").ok);
});
