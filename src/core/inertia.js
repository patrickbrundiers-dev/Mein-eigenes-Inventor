// Trägheitsmomente aus dem geschlossenen Dreiecksnetz (Zerlegung in Tetraeder zum Ursprung).
// Ersatz für GProp_GProps.MatrixOfInertia, das im eingebauten OpenCascade-Build fehlt.
// Genauigkeit hängt von der Netzfeinheit ab; die Volumenabweichung zum exakten Wert dient als Maß.

/**
 * Volumen, Schwerpunkt und zweite Momente eines oder mehrerer Netze (Einheitsdichte).
 * meshes: [{positions: Float32Array (xyz…), indices: Uint32Array}]
 * -> {volume, center:[x,y,z], C: 3×3 ∫x_i x_j dV} oder null
 */
export function meshMoments(meshes) {
  let V = 0;
  const S = [0, 0, 0];
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const m of meshes) {
    let v = 0;
    const s = [0, 0, 0], c = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const P = m.positions, I = m.indices;
    for (let t = 0; t + 2 < I.length; t += 3) {
      const a = [P[I[t] * 3], P[I[t] * 3 + 1], P[I[t] * 3 + 2]];
      const b = [P[I[t + 1] * 3], P[I[t + 1] * 3 + 1], P[I[t + 1] * 3 + 2]];
      const d = [P[I[t + 2] * 3], P[I[t + 2] * 3 + 1], P[I[t + 2] * 3 + 2]];
      const vt = (a[0] * (b[1] * d[2] - b[2] * d[1]) - a[1] * (b[0] * d[2] - b[2] * d[0]) + a[2] * (b[0] * d[1] - b[1] * d[0])) / 6;
      if (!vt) continue;
      const sum = [a[0] + b[0] + d[0], a[1] + b[1] + d[1], a[2] + b[2] + d[2]];
      v += vt;
      for (let i = 0; i < 3; i++) s[i] += (vt * sum[i]) / 4;
      for (let i = 0; i < 3; i++) for (let j = i; j < 3; j++) c[i][j] += (vt / 20) * (a[i] * a[j] + b[i] * b[j] + d[i] * d[j] + sum[i] * sum[j]);
    }
    // Netz mit nach innen zeigenden Dreiecken: Vorzeichen umdrehen
    const k = v < 0 ? -1 : 1;
    V += k * v;
    for (let i = 0; i < 3; i++) { S[i] += k * s[i]; for (let j = i; j < 3; j++) C[i][j] += k * c[i][j]; }
  }
  if (!(V > 0)) return null;
  for (let i = 0; i < 3; i++) for (let j = 0; j < i; j++) C[i][j] = C[j][i];
  return { volume: V, center: S.map((x) => x / V), C };
}

/** Eigenwerte/-vektoren einer symmetrischen 3×3-Matrix (Jacobi). -> {values:[…], vectors:[[…]…]} aufsteigend */
export function symEigen3(A) {
  const a = A.map((r) => [...r]);
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    if (off < 1e-14 * (Math.abs(a[0][0]) + Math.abs(a[1][1]) + Math.abs(a[2][2]) + 1e-300)) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[i][i] - a[j][j]);
  return { values: order.map((i) => a[i][i]), vectors: order.map((i) => [V[0][i], V[1][i], V[2][i]]) };
}

/**
 * Trägheitstensor (kg·mm²) um Schwerpunkt und Ursprung. density in g/cm³.
 * exactVolume (mm³, aus dem Kernel) optional: Netzabweichung wird gemeldet.
 */
export function inertiaFromMeshes(meshes, density, exactVolume) {
  const m = meshMoments(meshes);
  if (!m) return null;
  const rho = density * 1e-6; // kg/mm³
  const tensor = (C) => {
    const tr = C[0][0] + C[1][1] + C[2][2];
    return [0, 1, 2].map((i) => [0, 1, 2].map((j) => rho * ((i === j ? tr : 0) - C[i][j])));
  };
  const c = m.center;
  const Cc = m.C.map((r, i) => r.map((v, j) => v - m.volume * c[i] * c[j]));
  const atCenter = tensor(Cc);
  const eig = symEigen3(atCenter);
  return {
    mass: rho * m.volume,
    center: c,
    atCenter,
    atOrigin: tensor(m.C),
    principal: eig.values,
    axes: eig.vectors,
    meshDeviation: exactVolume > 0 ? m.volume / exactVolume - 1 : null,
  };
}
