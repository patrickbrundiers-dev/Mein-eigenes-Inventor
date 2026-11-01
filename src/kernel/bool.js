// Boolesche Operationen ohne Doppelrechnung.
// replicad baut `new BRepAlgoAPI_Cut(a, b)` – dieser Konstruktor rechnet schon – und ruft danach `Build()` noch einmal
// auf: jede Boolesche Operation lief zweimal. Außerdem wird der Builder (mit allen Zwischendaten) erst bei einer
// späteren Speicherbereinigung freigegeben. Hier: leerer Builder, Argumente/Werkzeuge als Listen, einmal Build(),
// Builder sofort löschen. Mehrere Werkzeuge in einem Durchgang (cutMany) sind deutlich schneller als nacheinander;
// das Ergebnis ist geometrisch gleich (Differenzkörper 0), das gemessene Volumen kann in der letzten Stelle abweichen.

let patched = false;

/** Ergebnis einer Booleschen Operation (kind: "cut" | "fuse" | "common") als rohe Form */
function runBoolean(R, kind, shape, tools, { optimisation = "none", simplify = true } = {}) {
  const oc = R.getOC();
  const b = kind === "cut" ? new oc.BRepAlgoAPI_Cut() : kind === "fuse" ? new oc.BRepAlgoAPI_Fuse() : new oc.BRepAlgoAPI_Common();
  const args = new oc.NCollection_List_TopoDS_Shape(), tl = new oc.NCollection_List_TopoDS_Shape();
  const pr = new oc.Message_ProgressRange();
  try {
    args.Append(shape.wrapped);
    for (const t of tools) tl.Append(t.wrapped);
    b.SetArguments(args);
    b.SetTools(tl);
    if (optimisation === "commonFace") b.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueShift);
    if (optimisation === "sameFace") b.SetGlue(oc.BOPAlgo_GlueEnum.BOPAlgo_GlueFull);
    b.Build(pr);
    if (simplify) b.SimplifyResult(true, true, 1e-3);
    return b.Shape();
  } finally {
    pr.delete(); args.delete(); tl.delete(); b.delete();
  }
}

function shape3d(R, raw, what) {
  const s = R.cast(raw);
  if (!R.isShape3D(s)) throw new Error(`Could not ${what} as a 3d shape`);
  return s;
}

/** replicad-Methoden cut/fuse/intersect der 3D-Formen auf die einfache Rechnung umstellen (einmal je Prozess) */
export function installFastBooleans(R) {
  if (patched || !R.getOC || !R.makeBox) return;
  const oc = R.getOC();
  if (!oc.NCollection_List_TopoDS_Shape || !oc.BRepAlgoAPI_Cut) return;
  let proto = Object.getPrototypeOf(R.makeBox([0, 0, 0], [1, 1, 1]));
  while (proto && !Object.prototype.hasOwnProperty.call(proto, "cut")) proto = Object.getPrototypeOf(proto);
  if (!proto) return;
  proto.cut = function (tool, options = {}) { return shape3d(R, runBoolean(R, "cut", this, [tool], options), "cut"); };
  proto.fuse = function (other, options = {}) { return shape3d(R, runBoolean(R, "fuse", this, [other], options), "fuse"); };
  proto.intersect = function (tool, options = {}) { return shape3d(R, runBoolean(R, "common", this, [tool], options), "intersect"); };
  patched = true;
}

/** Alle Werkzeuge in einem Durchgang abziehen (z. B. Bohrungen eines Stabs) */
export function cutMany(R, shape, tools, options) {
  if (!tools.length) return shape;
  if (tools.length === 1) return shape.cut(tools[0], options);
  return shape3d(R, runBoolean(R, "cut", shape, tools, options), "cut");
}

