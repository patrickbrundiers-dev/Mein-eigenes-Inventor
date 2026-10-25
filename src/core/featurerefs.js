// Bezüge eines Features auf andere Features (Skizzen, Arbeitselemente, Quell-Features): für Löschen mit Abhängigen,
// »verbrauchte« Skizzen im Baum und Prüfungen der Reihenfolge.

/** Skizzen, die das Feature als Profil, Pfad oder Querschnitt benutzt */
export function sketchRefs(f) {
  return [f.sketch, f.path, ...(Array.isArray(f.sketches) ? f.sketches : [])].filter((x) => typeof x === "string" && x);
}

const datumId = (x) => (typeof x === "string" && x.startsWith("datum:") ? x.slice(6) : null);

/** Alle Feature-IDs, auf die f verweist */
export function featureRefs(f) {
  const out = new Set(sketchRefs(f));
  if (["lasche", "umschlag", "durchzug"].includes(f.type) && typeof f.base === "string" && f.base) out.add(f.base);
  for (const k of ["feature", "target", "plate"]) if (typeof f[k] === "string" && f[k]) out.add(f[k]);
  for (const k of ["tools", "bodies"]) if (Array.isArray(f[k])) for (const x of f[k]) if (typeof x === "string" && x) out.add(x);
  if (f.type === "sketch" && f.plane?.ref === "datum" && f.plane.id) out.add(f.plane.id);
  for (const k of ["plane", "axis", "dir", "dir2"]) { const d = datumId(f[k]); if (d) out.add(d); }
  if (["arbeitsebene", "arbeitsachse", "arbeitspunkt"].includes(f.type)) {
    for (const k of ["base", "axis", "plane", "plane1", "plane2", "p1", "p2", "p3", "point"]) {
      const v = f[k];
      if (typeof v === "string" && v && !["XY", "XZ", "YZ", "X", "Y", "Z", "O", "u", "v"].includes(v)) out.add(v);
    }
  }
  return [...out];
}

/** IDs aller Features, die (auch über mehrere Stufen) von id abhängen, einschließlich id */
export function dependents(features, id) {
  const gone = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const g of features) if (!gone.has(g.id) && featureRefs(g).some((x) => gone.has(x))) { gone.add(g.id); grew = true; }
  }
  return gone;
}
