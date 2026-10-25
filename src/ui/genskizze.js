// SVG-Skizze zu den Generator-Einstellungen (Rechnung in core/genskizze.js): Ansicht mit Maßlinien, Bildkacheln für
// Varianten. Fokus auf einem Eingabefeld mit data-key hebt das zugehörige Maß hervor (Klasse »hi«).
import { svgEl } from "./dom.js";
import { sketchView, sketchDims } from "../core/genskizze.js";

/** Ansicht als SVG; dims = Maßlinien oder null (Kachel ohne Maße) */
export function sketchSvg(plan, view, { gen = null, p = null, dims = true, cls = "gsk" } = {}) {
  const sk = sketchView(plan, view);
  const ds = dims ? sketchDims(gen, p, plan, view, sk) : [];
  let [x0, y0, x1, y1] = sk.box;
  const size = Math.max(x1 - x0, y1 - y0, 1);
  const txt = size * 0.045;
  // Maßlinien liegen außerhalb: Rahmen um alle Maßpunkte samt Abstand und Text erweitern
  const geo = ds.map((d) => {
    const dx = d.b[0] - d.a[0], dy = d.b[1] - d.a[1], L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const A = [d.a[0] + nx * d.off, d.a[1] + ny * d.off], B = [d.b[0] + nx * d.off, d.b[1] + ny * d.off];
    const T = [(A[0] + B[0]) / 2 + nx * txt * 0.7, (A[1] + B[1]) / 2 + ny * txt * 0.7];
    for (const q of [A, B, T]) { x0 = Math.min(x0, q[0] - txt); y0 = Math.min(y0, q[1] - txt); x1 = Math.max(x1, q[0] + txt); y1 = Math.max(y1, q[1] + txt); }
    return { d, A, B, T, ang: (Math.atan2(dy, dx) * 180) / Math.PI };
  });
  const m = size * 0.04;
  x0 -= m; y0 -= m; x1 += m; y1 += m;
  const Y = (y) => -y; // Skizze mit y nach oben
  const svg = svgEl("svg", { class: cls, viewBox: `${x0} ${-y1} ${x1 - x0} ${y1 - y0}`, preserveAspectRatio: "xMidYMid meet" });
  const thin = size * 0.003;
  const path = (pts, close) => pts.map((q, i) => `${i ? "L" : "M"}${q[0]} ${Y(q[1])}`).join(" ") + (close ? " Z" : "");
  for (const f of sk.fills) svg.append(svgEl("path", { d: path(f.pts, true), class: "f " + f.kind, "stroke-width": thin }));
  for (const l of sk.lines) svg.append(svgEl("path", { d: path(l.pts, false), class: "l " + l.kind, "stroke-width": Math.max(l.w, thin * 1.5) }));
  for (const { d, A, B, T, ang } of geo) {
    const g = svgEl("g", { class: "dim", "data-key": d.key || undefined });
    const tick = txt * 0.35;
    const t = (q) => { const r = ((ang + 45) * Math.PI) / 180; return path([[q[0] - Math.cos(r) * tick, q[1] - Math.sin(r) * tick], [q[0] + Math.cos(r) * tick, q[1] + Math.sin(r) * tick]]); };
    g.append(svgEl("path", { d: path([d.a, A]) + " " + path([d.b, B]), class: "ext", "stroke-width": thin * 0.7 }));
    g.append(svgEl("path", { d: path([A, B]) + " " + t(A) + " " + t(B), "stroke-width": thin }));
    let rot = -ang;
    if (rot > 90) rot -= 180;
    if (rot <= -90) rot += 180;
    const tx = svgEl("text", { x: T[0], y: Y(T[1]), "font-size": txt, "text-anchor": "middle", "dominant-baseline": "middle", transform: `rotate(${rot} ${T[0]} ${Y(T[1])})` });
    tx.textContent = String(d.text);
    g.append(tx);
    svg.append(g);
  }
  return svg;
}

/** Maße zum Feld hervorheben: el = Eingabe-Container mit data-key, svg = Skizze; onMark(on) z. B. für das 3D-Fenster */
export function linkFieldToSketch(el, key, getSvg, onMark) {
  if (!key) return;
  el.dataset.key = key;
  const mark = (on) => { getSvg()?.querySelectorAll(`[data-key="${key}"]`).forEach((n) => n.classList.toggle("hi", on)); onMark?.(on); };
  el.addEventListener("focusin", () => mark(true));
  el.addEventListener("focusout", () => mark(false));
  el.addEventListener("mouseenter", () => mark(true));
  el.addEventListener("mouseleave", () => { if (!el.contains(document.activeElement)) mark(false); });
}
