// Kleine Vektor-/Matrix-Helfer (3D) und Ebenen-Definitionen

export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
};

/** Standard-Ebenen. y-Richtung = normal × x */
export const BASE_PLANES = {
  XY: { origin: [0, 0, 0], xDir: [1, 0, 0], normal: [0, 0, 1], label: "XY-Ebene (oben)" },
  XZ: { origin: [0, 0, 0], xDir: [1, 0, 0], normal: [0, -1, 0], label: "XZ-Ebene (vorne)" },
  YZ: { origin: [0, 0, 0], xDir: [0, 1, 0], normal: [1, 0, 0], label: "YZ-Ebene (rechts)" },
};

/** Ebene einer Skizze in Weltkoordinaten: {origin, xDir, yDir, normal} */
export function planeFrame(plane, offset = 0) {
  let base;
  if (plane.ref === "face" || plane.ref === "custom") base = { origin: plane.origin, xDir: plane.xDir, normal: plane.normal };
  else base = BASE_PLANES[plane.ref] || BASE_PLANES.XY;
  const normal = v3.norm(base.normal);
  const xDir = v3.norm(base.xDir);
  const yDir = v3.cross(normal, xDir);
  const origin = v3.add(base.origin, v3.mul(normal, offset));
  return { origin, xDir, yDir, normal };
}

export function toWorld(frame, u, v) {
  return [
    frame.origin[0] + frame.xDir[0] * u + frame.yDir[0] * v,
    frame.origin[1] + frame.xDir[1] * u + frame.yDir[1] * v,
    frame.origin[2] + frame.xDir[2] * u + frame.yDir[2] * v,
  ];
}

export function toLocal(frame, p) {
  const d = v3.sub(p, frame.origin);
  return [v3.dot(d, frame.xDir), v3.dot(d, frame.yDir), v3.dot(d, frame.normal)];
}

/** Ebene auf einer Fläche: Ursprung = Projektion des Weltursprungs, x-Richtung möglichst Welt-Achse */
export function planeFromFace(point, normal) {
  const n = v3.norm(normal);
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  // x-Achse: Weltachse, die am wenigsten zur Normalen parallel ist (Vorrang X, dann Y)
  let best = axes[0], bestDot = 2;
  for (const a of axes) {
    const d = Math.abs(v3.dot(a, n));
    if (d < bestDot - 1e-9) { bestDot = d; best = a; }
  }
  const xDir = v3.norm(v3.sub(best, v3.mul(n, v3.dot(best, n))));
  const origin = v3.sub([0, 0, 0], v3.mul(n, v3.dot(v3.sub([0, 0, 0], point), n)));
  return { ref: "face", origin: origin.map(clean), xDir: xDir.map(clean), normal: n.map(clean) };
}

const clean = (x) => (Math.abs(x) < 1e-12 ? 0 : Math.round(x * 1e9) / 1e9);

// ---------- 4x4-Matrizen (Spalten-Hauptordnung wie three.js) ----------
export function matIdentity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
function matMul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
}
function rotAxisMat(axis, deg) {
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  if (axis === 0) return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
  if (axis === 1) return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
/**
 * Bauteil-Platzierung: erst um X, dann um Y, dann um Z (Weltachsen) drehen, dann verschieben.
 * M = T * Rz * Ry * Rx
 */
export function placementMatrix(pos = [0, 0, 0], rot = [0, 0, 0]) {
  let m = matMul(rotAxisMat(2, rot[2]), matMul(rotAxisMat(1, rot[1]), rotAxisMat(0, rot[0])));
  m[12] = pos[0]; m[13] = pos[1]; m[14] = pos[2];
  return m;
}
export function matApply(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}
export function matApplyDir(m, d) {
  return [m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]];
}
/** Rotationsmatrix (3x3 als Zeilen) -> Euler-Winkel passend zu placementMatrix */
export function decomposePlacement(m) {
  const R = (r, c) => m[c * 4 + r];
  let rx, ry, rz;
  const sy = -R(2, 0);
  if (Math.abs(sy) < 0.999999) {
    ry = Math.asin(sy);
    rx = Math.atan2(R(2, 1), R(2, 2));
    rz = Math.atan2(R(1, 0), R(0, 0));
  } else {
    ry = sy > 0 ? Math.PI / 2 : -Math.PI / 2;
    rx = Math.atan2(-R(1, 2), R(1, 1));
    rz = 0;
  }
  const d = (x) => clean((x * 180) / Math.PI);
  return { pos: [clean(m[12]), clean(m[13]), clean(m[14])], rot: [d(rx), d(ry), d(rz)] };
}
/** Rotation um beliebige Achse durch Punkt */
export function rotationAbout(point, axis, deg) {
  const [x, y, z] = v3.norm(axis);
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t), C = 1 - c;
  const r = [
    x * x * C + c, y * x * C + z * s, z * x * C - y * s, 0,
    x * y * C - z * s, y * y * C + c, z * y * C + x * s, 0,
    x * z * C + y * s, y * z * C - x * s, z * z * C + c, 0,
    0, 0, 0, 1,
  ];
  const T = matIdentity(); T[12] = point[0]; T[13] = point[1]; T[14] = point[2];
  const Ti = matIdentity(); Ti[12] = -point[0]; Ti[13] = -point[1]; Ti[14] = -point[2];
  return matMul(T, matMul(r, Ti));
}
export function translation(d) {
  const T = matIdentity(); T[12] = d[0]; T[13] = d[1]; T[14] = d[2];
  return T;
}
export { matMul };

/**
 * Fläche-an-Fläche-Ausrichtung: bewegt Bauteil B so, dass Fläche B (pB,nB) auf Fläche A (pA,nA) liegt.
 * mode: 'gegen' (Normalen entgegengesetzt, aufeinander) | 'buendig' (gleiche Richtung)
 * Liefert neue Platzierungsmatrix für B.
 */
export function alignFaces(mB, pB, nB, pA, nA, mode = "gegen", gap = 0) {
  const target = mode === "buendig" ? v3.norm(nA) : v3.mul(v3.norm(nA), -1);
  const n = v3.norm(nB);
  const axis = v3.cross(n, target);
  const s = v3.len(axis), c = v3.dot(n, target);
  let R = matIdentity();
  if (s > 1e-9) R = rotationAbout(pB, axis, (Math.atan2(s, c) * 180) / Math.PI);
  else if (c < 0) {
    // 180°: beliebige senkrechte Achse
    const perp = Math.abs(n[0]) < 0.9 ? v3.norm(v3.cross(n, [1, 0, 0])) : v3.norm(v3.cross(n, [0, 1, 0]));
    R = rotationAbout(pB, perp, 180);
  }
  const pB2 = matApply(R, pB);
  // nur entlang der Normalen verschieben
  const nAn = v3.norm(nA);
  const d = v3.dot(v3.sub(pA, pB2), nAn) + gap;
  const T = translation(v3.mul(nAn, d));
  return matMul(T, matMul(R, mB));
}

/** Inverse einer starren Transformation (Rotation + Verschiebung) */
export function matInvertRigid(m) {
  const o = matIdentity();
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[c * 4 + r] = m[r * 4 + c];
  const t = [m[12], m[13], m[14]];
  for (let r = 0; r < 3; r++) o[12 + r] = -(o[r] * t[0] + o[4 + r] * t[1] + o[8 + r] * t[2]);
  return o;
}
