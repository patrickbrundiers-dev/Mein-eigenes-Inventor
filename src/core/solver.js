// Geometrischer Skizzen-Löser (Gauss-Newton / Levenberg-Marquardt mit Minimum-Norm-Schritt).
// Die Skizze bewegt sich dadurch so wenig wie möglich, wenn ein Maß geändert wird.

import { evaluate } from "./expr.js";
import { splineNearest } from "./spline.js";

const DEG = Math.PI / 180;

/** Baut Variablenvektor aus Skizze: Punkte (x,y) und Kreisradien */
function buildVars(sketch) {
  const idx = new Map(); // "p:<id>" -> index x (y = +1), "r:<id>" -> index
  const x = [];
  for (const p of sketch.points) {
    idx.set("p:" + p.id, x.length);
    x.push(p.x, p.y);
  }
  for (const e of sketch.entities) {
    if (e.type === "circle" || e.type === "ellipse") {
      idx.set("r:" + e.id, x.length);
      x.push(e.r);
    }
  }
  return { idx, x };
}

function writeBack(sketch, vars, x) {
  for (const p of sketch.points) {
    const i = vars.idx.get("p:" + p.id);
    p.x = x[i];
    p.y = x[i + 1];
  }
  for (const e of sketch.entities) if (e.type === "circle" || e.type === "ellipse") e.r = x[vars.idx.get("r:" + e.id)];
}

/**
 * Erzeugt eine Liste von Residuen-Funktionen f(x) -> Zahl.
 * Getriebene Maße (driven) und unbekannte Referenzen werden übersprungen.
 */
export function buildResiduals(sketch, scope = {}, extra = []) {
  const vars = buildVars(sketch);
  const ents = new Map(sketch.entities.map((e) => [e.id, e]));
  const P = (id) => {
    const i = vars.idx.get("p:" + id);
    if (i === undefined) throw new Error("Punkt fehlt: " + id);
    return i;
  };
  const res = []; // {f, cid}
  const add = (cid, f) => res.push({ cid, f });

  const lineIdx = (e) => [P(e.p1), P(e.p2)];
  const radiusFn = (e) => {
    if (e.type === "circle") { const ri = vars.idx.get("r:" + e.id); return (x) => x[ri]; }
    if (e.type === "arc") { const c = P(e.c), a = P(e.p1); return (x) => Math.hypot(x[a] - x[c], x[a + 1] - x[c + 1]); }
    throw new Error("Kein Kreis/Bogen");
  };
  const centerIdx = (e) => P(e.c);
  // Ellipse: Mittelpunkt c, Achsenpunkt a, Nebenhalbachse r → Halbachsen und Richtung
  const ellFn = (e) => {
    const c = P(e.c), a = P(e.a), ri = vars.idx.get("r:" + e.id);
    return (x) => {
      const dx = x[a] - x[c], dy = x[a + 1] - x[c + 1], A = Math.hypot(dx, dy) || 1e-12;
      return { cx: x[c], cy: x[c + 1], A, B: Math.abs(x[ri]), ux: dx / A, uy: dy / A };
    };
  };
  const lenFn = (e) => {
    if (e.type === "line") { const [a, b] = lineIdx(e); return (x) => Math.hypot(x[b] - x[a], x[b + 1] - x[a + 1]); }
    return radiusFn(e);
  };

  // implizit: Bogen hat gleichen Radius an Anfang und Ende
  for (const e of sketch.entities) {
    if (e.type === "arc") {
      const c = P(e.c), a = P(e.p1), b = P(e.p2);
      add("arc:" + e.id, (x) => Math.hypot(x[a] - x[c], x[a + 1] - x[c + 1]) - Math.hypot(x[b] - x[c], x[b + 1] - x[c + 1]));
    }
  }

  const byId = new Map(sketch.constraints.map((c) => [c.id, c]));
  // tie: Wert folgt einer anderen Bedingung (z. B. versetzte Elemente folgen dem ersten Versatzmaß)
  const val = (c) => evaluate((c.tie && byId.get(c.tie)?.value) ?? c.value, scope);

  for (const c of [...sketch.constraints, ...extra]) {
    if (c.driven || c.disabled || (c.tie && byId.get(c.tie)?.disabled) || (c.pat && byId.get(c.pat)?.disabled)) continue;
    const E = (id) => {
      const e = ents.get(id);
      if (!e) throw new Error("Element fehlt: " + id);
      return e;
    };
    switch (c.type) {
      case "horizontal": {
        if (c.e) { const [a, b] = lineIdx(E(c.e)); add(c.id, (x) => x[b + 1] - x[a + 1]); }
        else { const a = P(c.p), b = P(c.q); add(c.id, (x) => x[b + 1] - x[a + 1]); }
        break;
      }
      case "vertical": {
        if (c.e) { const [a, b] = lineIdx(E(c.e)); add(c.id, (x) => x[b] - x[a]); }
        else { const a = P(c.p), b = P(c.q); add(c.id, (x) => x[b] - x[a]); }
        break;
      }
      case "coincident": {
        const a = P(c.p), b = P(c.q);
        add(c.id, (x) => x[a] - x[b]);
        add(c.id, (x) => x[a + 1] - x[b + 1]);
        break;
      }
      case "fix": {
        const a = P(c.p);
        add(c.id, (x) => x[a] - c.x);
        add(c.id, (x) => x[a + 1] - c.y);
        break;
      }
      case "target": { // Zieh-Hilfe (nur temporär)
        const a = P(c.p);
        add(c.id, (x) => (x[a] - c.x) * (c.w || 1));
        add(c.id, (x) => (x[a + 1] - c.y) * (c.w || 1));
        break;
      }
      case "pointOnLine": {
        const p = P(c.p), [a, b] = lineIdx(E(c.e));
        add(c.id, (x) => {
          const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1];
          const L = Math.hypot(dx, dy) || 1e-12;
          return (dx * (x[p + 1] - x[a + 1]) - dy * (x[p] - x[a])) / L;
        });
        break;
      }
      case "pointOnCircle": {
        if (E(c.e).type === "spline") { // Abstand mit Vorzeichen zur abgetasteten Kurve
          const ids = E(c.e).pts.map(P), p = P(c.p);
          add(c.id, (x) => splineNearest(ids.map((i) => [x[i], x[i + 1]]), x[p], x[p + 1]).sd);
          break;
        }
        if (E(c.e).type === "ellipse") { // implizit, auf Abstand skaliert
          const g = ellFn(E(c.e)), p = P(c.p);
          add(c.id, (x) => {
            const q = g(x), px = x[p] - q.cx, py = x[p + 1] - q.cy;
            const u = px * q.ux + py * q.uy, v = -px * q.uy + py * q.ux;
            return (Math.hypot(u / q.A, v / (q.B || 1e-12)) - 1) * Math.min(q.A, q.B || 1e-12);
          });
          break;
        }
        const e = E(c.e), p = P(c.p), ce = centerIdx(e), rf = radiusFn(e);
        add(c.id, (x) => Math.hypot(x[p] - x[ce], x[p + 1] - x[ce + 1]) - rf(x));
        break;
      }
      case "midpoint": {
        const p = P(c.p), [a, b] = lineIdx(E(c.e));
        add(c.id, (x) => x[p] - (x[a] + x[b]) / 2);
        add(c.id, (x) => x[p + 1] - (x[a + 1] + x[b + 1]) / 2);
        break;
      }
      case "parallel":
      case "perpendicular": {
        const [a, b] = lineIdx(E(c.e1)), [d, f] = lineIdx(E(c.e2));
        const par = c.type === "parallel";
        add(c.id, (x) => {
          const ux = x[b] - x[a], uy = x[b + 1] - x[a + 1], vx = x[f] - x[d], vy = x[f + 1] - x[d + 1];
          const n = (Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1e-12;
          return (par ? ux * vy - uy * vx : ux * vx + uy * vy) / n;
        });
        break;
      }
      case "collinear": {
        const [a, b] = lineIdx(E(c.e1)), [d, f] = lineIdx(E(c.e2));
        for (const q of [d, f]) {
          add(c.id, (x) => {
            const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1];
            const L = Math.hypot(dx, dy) || 1e-12;
            return (dx * (x[q + 1] - x[a + 1]) - dy * (x[q] - x[a])) / L;
          });
        }
        break;
      }
      case "equal": {
        const f1 = lenFn(E(c.e1)), f2 = lenFn(E(c.e2));
        add(c.id, (x) => f1(x) - f2(x));
        break;
      }
      case "concentric": {
        const a = centerIdx(E(c.e1)), b = centerIdx(E(c.e2));
        add(c.id, (x) => x[a] - x[b]);
        add(c.id, (x) => x[a + 1] - x[b + 1]);
        break;
      }
      case "tangent": {
        const e1 = E(c.e1), e2 = E(c.e2);
        if (e1.type === "spline" || e2.type === "spline") { // Spline-Ende: Richtung zum Nachbar-Kontrollpunkt
          const sp = e1.type === "spline" ? e1 : e2, o = sp === e1 ? e2 : e1, ids = sp.pts;
          const [q0, q1] = c.end === "end" ? [P(ids[ids.length - 1]), P(ids[ids.length - 2])] : [P(ids[0]), P(ids[1])];
          if (o.type === "line") {
            const [a, b] = lineIdx(o);
            add(c.id, (x) => {
              const ux = x[q1] - x[q0], uy = x[q1 + 1] - x[q0 + 1], vx = x[b] - x[a], vy = x[b + 1] - x[a + 1];
              return (ux * vy - uy * vx) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1e-12);
            });
          } else {
            const ce = centerIdx(o);
            add(c.id, (x) => {
              const ux = x[q1] - x[q0], uy = x[q1 + 1] - x[q0 + 1], rx = x[q0] - x[ce], ry = x[q0 + 1] - x[ce + 1];
              return (ux * rx + uy * ry) / ((Math.hypot(ux, uy) * Math.hypot(rx, ry)) || 1e-12);
            });
          }
          break;
        }
        const line = e1.type === "line" ? e1 : e2.type === "line" ? e2 : null;
        if (line && (e1.type === "ellipse" || e2.type === "ellipse")) { // Abstand Mitte–Linie = Stützfunktion der Ellipse
          const g = ellFn(line === e1 ? e2 : e1), [a, b] = lineIdx(line);
          add(c.id, (x) => {
            const q = g(x), dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], L = Math.hypot(dx, dy) || 1e-12;
            const nx = -dy / L, ny = dx / L;
            const d = Math.abs(nx * (q.cx - x[a]) + ny * (q.cy - x[a + 1]));
            const nu = nx * q.ux + ny * q.uy, nv = -nx * q.uy + ny * q.ux;
            return d - Math.hypot(q.A * nu, q.B * nv);
          });
        } else if (line) {
          const circ = line === e1 ? e2 : e1;
          const [a, b] = lineIdx(line), ce = centerIdx(circ), rf = radiusFn(circ);
          add(c.id, (x) => {
            const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1];
            const L = Math.hypot(dx, dy) || 1e-12;
            const d = Math.abs(dx * (x[ce + 1] - x[a + 1]) - dy * (x[ce] - x[a])) / L;
            return d - rf(x);
          });
        } else {
          const c1 = centerIdx(e1), c2 = centerIdx(e2), r1 = radiusFn(e1), r2 = radiusFn(e2);
          add(c.id, (x) => {
            const d = Math.hypot(x[c1] - x[c2], x[c1 + 1] - x[c2 + 1]);
            return c.internal ? d - Math.abs(r1(x) - r2(x)) : d - (r1(x) + r2(x));
          });
        }
        break;
      }
      case "tangentAt": { // Bogen e1 berührt Linie e2 im Punkt p (Punkt liegt auf beiden)
        const arc = E(c.e1), [a, b] = lineIdx(E(c.e2)), ce = centerIdx(arc), p = P(c.p);
        add(c.id, (x) => {
          const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1];
          const L = Math.hypot(dx, dy) || 1e-12;
          return ((x[p] - x[ce]) * dx + (x[p + 1] - x[ce + 1]) * dy) / L;
        });
        break;
      }
      case "symmetric": { // p und q symmetrisch zur Linie e
        const p = P(c.p), q = P(c.q), [a, b] = lineIdx(E(c.e));
        add(c.id, (x) => { // Mittelpunkt auf Linie
          const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1];
          const L = Math.hypot(dx, dy) || 1e-12;
          const mx = (x[p] + x[q]) / 2, my = (x[p + 1] + x[q + 1]) / 2;
          return (dx * (my - x[a + 1]) - dy * (mx - x[a])) / L;
        });
        add(c.id, (x) => { // Verbindung senkrecht zur Linie
          const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1];
          const L = Math.hypot(dx, dy) || 1e-12;
          return (dx * (x[q] - x[p]) + dy * (x[q + 1] - x[p + 1])) / L;
        });
        break;
      }
      case "pattern": { // Musterkopie: q = p verschoben um (i·a, j·b) bzw. um c gedreht um i·Winkel
        const p = P(c.p), q = P(c.q);
        if (c.mode === "rot") {
          const ce = P(c.c), th = (evaluate(c.value, scope) * (c.i || 0) * Math.PI) / 180, co = Math.cos(th), si = Math.sin(th);
          add(c.id, (x) => x[q] - (x[ce] + co * (x[p] - x[ce]) - si * (x[p + 1] - x[ce + 1])));
          add(c.id, (x) => x[q + 1] - (x[ce + 1] + si * (x[p] - x[ce]) + co * (x[p + 1] - x[ce + 1])));
        } else {
          const a = evaluate(c.value, scope) * (c.i || 0), b = evaluate(c.value2 ?? "0", scope) * (c.j || 0);
          add(c.id, (x) => x[q] - x[p] - a);
          add(c.id, (x) => x[q + 1] - x[p + 1] - b);
        }
        break;
      }
      // ---- Bemaßungen ----
      case "distance": {
        const v = val(c);
        if (c.e && !c.q) { // Punkt-Linie
          const p = P(c.p), [a, b] = lineIdx(E(c.e));
          add(c.id, (x) => {
            const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1];
            const L = Math.hypot(dx, dy) || 1e-12;
            return Math.abs(dx * (x[p + 1] - x[a + 1]) - dy * (x[p] - x[a])) / L - v;
          });
          break;
        }
        const a = P(c.p), b = P(c.q);
        if (c.dir === "h") add(c.id, (x) => Math.abs(x[b] - x[a]) - v);
        else if (c.dir === "v") add(c.id, (x) => Math.abs(x[b + 1] - x[a + 1]) - v);
        else add(c.id, (x) => Math.hypot(x[b] - x[a], x[b + 1] - x[a + 1]) - v);
        break;
      }
      case "offset": { // e2 ist um k·v zu e1 versetzt: Linien (Abstand links von p1→p2), Bögen/Kreise (Radiusdifferenz)
        const v = val(c), k = c.k || 1, e1 = E(c.e1), e2 = E(c.e2);
        if (e1.type === "line") {
          const [a, b] = lineIdx(e1);
          for (const q of lineIdx(e2)) add(c.id, (x) => {
            const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1];
            const L = Math.hypot(dx, dy) || 1e-12;
            return (dx * (x[q + 1] - x[a + 1]) - dy * (x[q] - x[a])) / L - k * v;
          });
        } else {
          const r1 = radiusFn(e1), r2 = radiusFn(e2);
          add(c.id, (x) => r2(x) - r1(x) - k * v);
        }
        break;
      }
      case "length": {
        const v = val(c), [a, b] = lineIdx(E(c.e));
        add(c.id, (x) => Math.hypot(x[b] - x[a], x[b + 1] - x[a + 1]) - v);
        break;
      }
      case "radius":
      case "diameter": {
        const v = val(c), rf = radiusFn(E(c.e));
        const k = c.type === "diameter" ? 2 : 1;
        add(c.id, (x) => k * rf(x) - v);
        break;
      }
      case "angle": {
        const v = val(c) * DEG;
        const [a, b] = lineIdx(E(c.e1)), [d, f] = lineIdx(E(c.e2));
        add(c.id, (x) => {
          const ux = x[b] - x[a], uy = x[b + 1] - x[a + 1], vx = x[f] - x[d], vy = x[f + 1] - x[d + 1];
          const ang = Math.atan2(Math.abs(ux * vy - uy * vx), ux * vx + uy * vy);
          return ang - v;
        });
        break;
      }
      case "semiAxis": { // Halbachse einer Ellipse: axis "a" (c→a) oder "b" (Nebenhalbachse)
        const v = val(c), g = ellFn(E(c.e));
        add(c.id, (x) => (c.axis === "b" ? g(x).B : g(x).A) - v);
        break;
      }
      case "axisAngle": { // Richtung der Hauptachse zur Skizzen-x-Achse in Grad
        const v = val(c) * DEG, e = E(c.e), ce = P(e.c), a = P(e.a);
        add(c.id, (x) => {
          const d = Math.atan2(x[a + 1] - x[ce + 1], x[a] - x[ce]) - v;
          return Math.atan2(Math.sin(d), Math.cos(d)) * Math.hypot(x[a] - x[ce], x[a + 1] - x[ce + 1]);
        });
        break;
      }
      default:
        break;
    }
  }
  return { vars, res };
}

// ---------- Lineare Algebra ----------
function jacobian(res, x) {
  const m = res.length, n = x.length;
  const J = Array.from({ length: m }, () => new Float64Array(n));
  const f0 = res.map((r) => r.f(x));
  for (let j = 0; j < n; j++) {
    const h = 1e-7 * Math.max(1, Math.abs(x[j]));
    const old = x[j];
    x[j] = old + h;
    const fp = res.map((r) => r.f(x));
    x[j] = old - h;
    const fm = res.map((r) => r.f(x));
    x[j] = old;
    for (let i = 0; i < m; i++) J[i][j] = (fp[i] - fm[i]) / (2 * h);
  }
  return { J, f0 };
}

/** löst A y = b (A symmetrisch positiv definit) per Cholesky; fällt auf Gauss zurück */
function solveSym(A, b) {
  const n = b.length;
  const M = A.map((r) => Float64Array.from(r));
  const y = Float64Array.from(b);
  // Gauss mit Pivotsuche
  for (let k = 0; k < n; k++) {
    let piv = k, best = Math.abs(M[k][k]);
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > best) { best = Math.abs(M[i][k]); piv = i; }
    if (best < 1e-300) continue;
    if (piv !== k) { [M[k], M[piv]] = [M[piv], M[k]]; [y[k], y[piv]] = [y[piv], y[k]]; }
    for (let i = k + 1; i < n; i++) {
      const f = M[i][k] / M[k][k];
      if (f === 0) continue;
      for (let j = k; j < n; j++) M[i][j] -= f * M[k][j];
      y[i] -= f * y[k];
    }
  }
  const out = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * out[j];
    out[i] = Math.abs(M[i][i]) < 1e-300 ? 0 : s / M[i][i];
  }
  return out;
}

/** numerischer Rang einer Matrix (Zeilen-Stufenform) */
export function matrixRank(J, tol = 1e-7) {
  const m = J.length;
  if (!m) return 0;
  const n = J[0].length;
  const M = J.map((r) => Float64Array.from(r));
  // Zeilen normieren, damit die Toleranz skalenunabhängig ist
  for (const r of M) {
    let s = 0;
    for (const v of r) s = Math.max(s, Math.abs(v));
    if (s > 0) for (let j = 0; j < n; j++) r[j] /= s;
  }
  let rank = 0;
  const rowUsed = new Uint8Array(m);
  for (let col = 0; col < n && rank < m; col++) {
    let piv = -1, best = tol;
    for (let i = 0; i < m; i++) if (!rowUsed[i] && Math.abs(M[i][col]) > best) { best = Math.abs(M[i][col]); piv = i; }
    if (piv < 0) continue;
    rowUsed[piv] = 1;
    rank++;
    for (let i = 0; i < m; i++) {
      if (i === piv || rowUsed[i]) continue;
      const f = M[i][col] / M[piv][col];
      if (f === 0) continue;
      for (let j = col; j < n; j++) M[i][j] -= f * M[piv][j];
    }
  }
  return rank;
}

const norm = (f) => Math.sqrt(f.reduce((s, v) => s + v * v, 0));

/**
 * Welche Variablen lassen sich bewegen, ohne eine Bedingung zu verletzen? Variable i ist bestimmt,
 * wenn der Einheitsvektor e_i im Zeilenraum von J liegt (orthonormale Basis per Gram-Schmidt).
 */
export function freeVariables(J, n, tol = 1e-5) {
  const basis = [];
  for (const row of J) {
    let rn = 0;
    for (let j = 0; j < n; j++) rn = Math.max(rn, Math.abs(row[j]));
    if (!(rn > 0)) continue;
    const v = Float64Array.from(row, (a) => a / rn);
    for (let pass = 0; pass < 2; pass++) {
      for (const q of basis) {
        let d = 0;
        for (let j = 0; j < n; j++) d += q[j] * v[j];
        if (d) for (let j = 0; j < n; j++) v[j] -= d * q[j];
      }
    }
    let nv = 0;
    for (let j = 0; j < n; j++) nv += v[j] * v[j];
    nv = Math.sqrt(nv);
    if (nv > 1e-7) { for (let j = 0; j < n; j++) v[j] /= nv; basis.push(v); }
  }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const q of basis) s += q[i] * q[i];
    out[i] = 1 - s > tol ? 1 : 0;
  }
  return out;
}

/** freie Variablen → {points: Set(Punkt-IDs), radii: Set(Kreis-IDs)} */
function freeOf(vars, fv) {
  const points = new Set(), radii = new Set();
  for (const [k, i] of vars.idx) {
    if (k.startsWith("p:") && (fv[i] || fv[i + 1])) points.add(k.slice(2));
    else if (k.startsWith("r:") && fv[i]) radii.add(k.slice(2));
  }
  return { points, radii };
}

/** Ist ein Element noch frei beweglich? (ein Punkt oder der Radius frei) */
export function entityFree(e, free) {
  if (!free) return false;
  if (e.type === "circle") return free.points.has(e.c) || free.radii.has(e.id);
  if (e.type === "spline") return (e.pts || []).some((p) => free.points.has(p));
  if (e.type === "ellipse") return free.points.has(e.c) || free.points.has(e.a) || free.radii.has(e.id);
  return [e.p1, e.p2, e.c, e.p].some((p) => p && free.points.has(p));
}

/**
 * Löst die Skizze. Ändert Punktkoordinaten/Radien in-place.
 * @returns {ok, residual, iterations, dof, failed:[cid]}
 */
export function solveSketch(sketch, scope = {}, opts = {}) {
  let built;
  try {
    built = buildResiduals(sketch, scope, opts.extra || []);
  } catch (e) {
    return { ok: false, error: e.message, residual: Infinity, dof: NaN, failed: [] };
  }
  const { vars, res } = built;
  const x = Float64Array.from(vars.x);
  const m = res.length;
  if (!m) {
    return { ok: true, residual: 0, iterations: 0, dof: x.length, failed: [] };
  }
  let lambda = 1e-9;
  let f = res.map((r) => r.f(x));
  let fn = norm(f);
  let it = 0;
  const maxIt = opts.maxIterations || 80;
  for (; it < maxIt && fn > 1e-10; it++) {
    const { J } = jacobian(res, x);
    // A = J J^T
    const A = Array.from({ length: m }, () => new Float64Array(m));
    for (let i = 0; i < m; i++) {
      for (let k = i; k < m; k++) {
        let s = 0;
        const Ji = J[i], Jk = J[k];
        for (let j = 0; j < x.length; j++) s += Ji[j] * Jk[j];
        A[i][k] = s;
        A[k][i] = s;
      }
    }
    let improved = false;
    for (let tries = 0; tries < 12; tries++) {
      const Al = A.map((r, i) => { const c = Float64Array.from(r); c[i] += lambda * (1 + r[i]); return c; });
      const y = solveSym(Al, f);
      const xn = Float64Array.from(x);
      for (let j = 0; j < x.length; j++) {
        let s = 0;
        for (let i = 0; i < m; i++) s += J[i][j] * y[i];
        xn[j] -= s;
      }
      const fnew = res.map((r) => r.f(xn));
      const nn = norm(fnew);
      if (Number.isFinite(nn) && nn < fn) {
        x.set(xn);
        f = fnew;
        fn = nn;
        lambda = Math.max(lambda / 10, 1e-12);
        improved = true;
        break;
      }
      lambda *= 10;
    }
    if (!improved) break;
  }
  const failed = [];
  const tol = opts.tolerance || 1e-6;
  res.forEach((r, i) => { if (Math.abs(f[i]) > tol && !failed.includes(r.cid)) failed.push(r.cid); });
  const ok = failed.length === 0;
  if (ok || opts.writeOnFail) writeBack(sketch, vars, x);
  let dof = NaN, free;
  if (opts.computeDof !== false) {
    const real = res.filter((r) => !String(r.cid).startsWith("drag"));
    const { J } = jacobian(real, x);
    dof = x.length - matrixRank(J);
    if (opts.free) free = freeOf(vars, freeVariables(J, x.length));
  }
  return { ok, residual: fn, iterations: it, dof, failed, free };
}

/**
 * Prüft, ob eine neue Bedingung redundant oder widersprüchlich wäre.
 * @returns 'ok' | 'redundant' | 'conflict'
 */
export function checkNewConstraint(sketch, constraint, scope = {}) {
  const before = buildResiduals(sketch, scope);
  const after = buildResiduals(sketch, scope, [constraint]);
  const x = Float64Array.from(after.vars.x);
  const r0 = matrixRank(jacobian(before.res, x).J);
  const r1 = matrixRank(jacobian(after.res, x).J);
  if (r1 > r0) return "ok";
  // Rang steigt nicht: ist sie bereits erfüllt?
  const extra = after.res.filter((r) => r.cid === constraint.id);
  const err = Math.max(...extra.map((r) => Math.abs(r.f(x))));
  return err < 1e-6 ? "redundant" : "conflict";
}

/** Misst den aktuellen Wert eines Maßes (für getriebene Maße und Vorschlagswerte) */
export function measureConstraint(sketch, c) {
  const pts = new Map(sketch.points.map((p) => [p.id, p]));
  const ents = new Map(sketch.entities.map((e) => [e.id, e]));
  const P = (id) => pts.get(id);
  const rad = (e) => (e.type === "circle" ? e.r : Math.hypot(P(e.p1).x - P(e.c).x, P(e.p1).y - P(e.c).y));
  switch (c.type) {
    case "distance": {
      if (c.e && !c.q) {
        const e = ents.get(c.e), a = P(e.p1), b = P(e.p2), p = P(c.p);
        const dx = b.x - a.x, dy = b.y - a.y;
        return Math.abs(dx * (p.y - a.y) - dy * (p.x - a.x)) / (Math.hypot(dx, dy) || 1);
      }
      const a = P(c.p), b = P(c.q);
      if (c.dir === "h") return Math.abs(b.x - a.x);
      if (c.dir === "v") return Math.abs(b.y - a.y);
      return Math.hypot(b.x - a.x, b.y - a.y);
    }
    case "length": { const e = ents.get(c.e); const a = P(e.p1), b = P(e.p2); return Math.hypot(b.x - a.x, b.y - a.y); }
    case "offset": {
      const e1 = ents.get(c.e1), e2 = ents.get(c.e2), k = c.k || 1;
      if (e1.type === "line") {
        const a = P(e1.p1), b = P(e1.p2), q = P(e2.p1);
        const dx = b.x - a.x, dy = b.y - a.y;
        return (k * (dx * (q.y - a.y) - dy * (q.x - a.x))) / (Math.hypot(dx, dy) || 1);
      }
      return k * (rad(e2) - rad(e1));
    }
    case "semiAxis": { const e = ents.get(c.e); return c.axis === "b" ? Math.abs(e.r) : Math.hypot(P(e.a).x - P(e.c).x, P(e.a).y - P(e.c).y); }
    case "axisAngle": { const e = ents.get(c.e); return (Math.atan2(P(e.a).y - P(e.c).y, P(e.a).x - P(e.c).x) * 180) / Math.PI; }
    case "radius": return rad(ents.get(c.e));
    case "diameter": return 2 * rad(ents.get(c.e));
    case "angle": {
      const e1 = ents.get(c.e1), e2 = ents.get(c.e2);
      const ux = P(e1.p2).x - P(e1.p1).x, uy = P(e1.p2).y - P(e1.p1).y;
      const vx = P(e2.p2).x - P(e2.p1).x, vy = P(e2.p2).y - P(e2.p1).y;
      return (Math.atan2(Math.abs(ux * vy - uy * vx), ux * vx + uy * vy) * 180) / Math.PI;
    }
  }
  return NaN;
}

export const DIMENSION_TYPES = new Set(["distance", "length", "radius", "diameter", "angle", "offset", "semiAxis", "axisAngle"]);
