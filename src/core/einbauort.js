// Einbauorte fürs Handy (Z5): eine eigenständige HTML-Datei (ohne Internet, ohne App) mit einem Bild je Position,
// in dem das Teil in der Baugruppe hervorgehoben ist. Suche nach Positionsnummer oder Name; die Adresse
// »…/Einbauorte.html#pos-3« springt direkt zur Position. Reine Texterzeugung.

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Text, der zu einer Position passt (für die Suche: »3«, »Pos 3«, Name, Teilenummer, Abschnitt) */
export const einbauKey = (it) => [`pos ${it.pos}`, it.name, it.number, it.abschnitt].filter(Boolean).join(" ").toLowerCase();

/**
 * Passt die Suche zur Position? Zahl allein oder »Pos 3« = genau diese Position; QR-Text eines Etiketts
 * (mehrzeilig, enthält »Pos 3 · …«) findet die Position ebenfalls; sonst Teiltext in Name/Nummer/Abschnitt.
 */
export function einbauMatch(it, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const pos = q.match(/(?:^|\bpos\s*)(\d+)\b/);
  if (pos && (/^\d+$/.test(q) || /\bpos\s*\d+/.test(q))) return String(it.pos) === pos[1];
  return einbauKey(it).includes(q);
}

/** Die HTML-Seite. items: [{ pos, name, number, qty, abschnitt, image (data-URL PNG oder null) }] */
export function einbauHtml(items, { title = "", order = "" } = {}) {
  const cards = items.map((it) => `<section class="card" id="pos-${esc(it.pos)}" data-key="${esc(einbauKey(it))}" data-pos="${esc(it.pos)}">
<h2>Pos ${esc(it.pos)} · ${esc(it.name)}</h2><div class="sub">${esc([it.number && "Nr. " + it.number, `${it.qty} Stk`, it.abschnitt && "Abschnitt: " + it.abschnitt].filter(Boolean).join(" · "))}</div>
${it.image ? `<img alt="Einbauort Pos ${esc(it.pos)}" src="${esc(it.image)}">` : `<p class="none">Kein Bild (Teil nicht sichtbar)</p>`}</section>`).join("\n");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Einbauorte ${esc(title)}</title><style>
:root{--bg:#f4f6f8;--fg:#111a24;--card:#fff;--line:#c9d1d9;--hi:#1f6feb}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--card:#161b22;--line:#30363d;--hi:#58a6ff}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px system-ui,Arial,sans-serif}
header{position:sticky;top:0;background:var(--bg);padding:12px 16px;border-bottom:1px solid var(--line)}
h1{font-size:18px;margin:0 0 8px}input{width:100%;box-sizing:border-box;font-size:18px;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg)}
main{padding:12px 16px;display:grid;gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}
.card:target{outline:3px solid var(--hi)}
h2{font-size:17px;margin:0}.sub{opacity:.75;font-size:14px;margin:2px 0 8px}
img{width:100%;height:auto;border-radius:6px;background:#fff}.none{opacity:.6}
</style></head><body><header><h1>Einbauorte · ${esc([title, order && "Auftrag " + order].filter(Boolean).join(" · "))}</h1>
<input id="q" type="search" placeholder="Pos-Nummer oder Name, z. B. 3" autocomplete="off"></header>
<main>${cards}</main>
<script>
const q=document.getElementById("q"),cards=[...document.querySelectorAll(".card")];
function match(c,v){v=v.trim().toLowerCase();if(!v)return true;const m=v.match(/(?:^|\\bpos\\s*)(\\d+)\\b/);if(m&&(/^\\d+$/.test(v)||/\\bpos\\s*\\d+/.test(v)))return c.dataset.pos===m[1];return c.dataset.key.includes(v);}
q.addEventListener("input",()=>{for(const c of cards)c.hidden=!match(c,q.value);});
if(location.hash.startsWith("#pos-")){q.value=location.hash.slice(5);q.dispatchEvent(new Event("input"));}
</script></body></html>`;
}
