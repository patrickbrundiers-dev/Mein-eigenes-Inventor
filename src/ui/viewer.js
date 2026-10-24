// 3D-Ansicht: Darstellung, Kamera, ViewCube, Auswahl von Flächen/Kanten
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { placementMatrix, toWorld } from "../core/geom.js";

const COL = {
  edge: 0x1c2733,
  hover: 0xef7d1a,
  sel: 0xef7d1a,
  sketch: 0x2457b8,
  sketchConstr: 0x7f97c6,
};

export const VIEWS = {
  iso: { dir: [-1, 1, -1], up: [0, 0, 1], label: "Iso" },
  front: { dir: [0, 1, 0], up: [0, 0, 1], label: "Vorne" },
  back: { dir: [0, -1, 0], up: [0, 0, 1], label: "Hinten" },
  top: { dir: [0, 0, -1], up: [0, 1, 0], label: "Oben" },
  bottom: { dir: [0, 0, 1], up: [0, -1, 0], label: "Unten" },
  right: { dir: [-1, 0, 0], up: [0, 0, 1], label: "Rechts" },
  left: { dir: [1, 0, 0], up: [0, 0, 1], label: "Links" },
};

export class Viewer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;
    container.append(this.renderer.domElement);
    this.renderer.domElement.tabIndex = 0;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-100, 100, 100, -100, -100000, 100000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(400, -400, 400);
    this.scene.add(this.camera);
    const head = new THREE.DirectionalLight(0xffffff, 1.6);
    head.position.set(0.4, 0.6, 1);
    this.camera.add(head);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    this.scene.add(new THREE.HemisphereLight(0xf4f7fb, 0x5b6773, 0.55));

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.zoomToCursor = true;
    this.controls.enableDamping = false;
    this.controls.screenSpacePanning = true;
    this.controls.rotateSpeed = 0.9;
    this.controls.zoomSpeed = 1.2;
    this.controls.addEventListener("change", () => this.cameraChanged());

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.helpers = new THREE.Group();
    this.scene.add(this.helpers);
    this.sketchGroup = new THREE.Group();
    this.scene.add(this.sketchGroup);
    this.hoverGroup = new THREE.Group();
    this.scene.add(this.hoverGroup);
    this.makeGrid(1000);
    this.makeTriad();
    this.makeViewCube();

    this.cameraListeners = [];
    this.pickables = []; // {mesh, edges[], key}
    this.edgeCache = null;
    this.sketchFrame = null;
    this.selection = { edges: [], faces: [], bodies: [], components: [] };

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);
    this.resize();
    this.renderLoop();
  }

  // ---------- Grundgerüst ----------
  makeGrid(size) {
    if (this.grid) this.helpers.remove(this.grid);
    const step = niceStep(size / 20);
    const n = Math.max(4, Math.round(size / step));
    const g = new THREE.GridHelper(n * step, n, 0x9fb0c2, 0xc6d1db);
    g.rotation.x = Math.PI / 2;
    g.material.transparent = true;
    g.material.opacity = 0.55;
    g.material.depthWrite = false;
    this.grid = g;
    this.helpers.add(g);
    this.gridStep = step;
  }
  makeTriad() {
    const mk = (dir, color) => {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(...dir)]);
      return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, depthTest: false }));
    };
    this.triad = new THREE.Group();
    this.triad.add(mk([1, 0, 0], 0xd23b2a), mk([0, 1, 0], 0x2e9d4a), mk([0, 0, 1], 0x2457b8));
    this.triad.renderOrder = 10;
    this.helpers.add(this.triad);
  }
  makeViewCube() {
    this.cubeScene = new THREE.Scene();
    this.cubeCam = new THREE.OrthographicCamera(-1.6, 1.6, 1.6, -1.6, 0.1, 20);
    const labels = ["Rechts", "Links", "Oben", "Unten", "Vorne", "Hinten"];
    const mats = labels.map((t) => new THREE.MeshBasicMaterial({ map: labelTexture(t) }));
    const geo = new THREE.BoxGeometry(1.8, 1.8, 1.8);
    geo.rotateX(Math.PI / 2);
    this.cube = new THREE.Mesh(geo, mats);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x4a5866 }));
    this.cube.add(edges);
    this.cubeScene.add(this.cube);
    this.cubeScene.add(new THREE.AmbientLight(0xffffff, 1));
    this.cubeSize = 96;
  }
  resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + "px";
    this.renderer.domElement.style.height = h + "px";
    const aspect = w / h;
    const half = this.viewHalf || 300;
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
    this.cameraChanged();
  }
  cameraChanged() {
    this.camera.updateMatrixWorld();
    this.edgeCache = null;
    this.needsRender = true;
    // Kopf-Licht und Raster an Zoom anpassen
    for (const fn of this.cameraListeners) fn();
  }
  onCamera(fn) { this.cameraListeners.push(fn); }
  renderLoop() {
    const loop = () => {
      requestAnimationFrame(loop);
      if (this.anim) this.stepAnim();
      if (!this.needsRender) return;
      this.needsRender = false;
      const r = this.renderer;
      const w = this.container.clientWidth, h = this.container.clientHeight;
      r.setScissorTest(false);
      r.clear();
      r.setViewport(0, 0, w, h);
      // Triad-Größe konstant halten
      const ppu = (this.camera.zoom * h) / (this.camera.top - this.camera.bottom);
      const s = 60 / ppu;
      this.triad.scale.setScalar(s);
      r.render(this.scene, this.camera);
      // ViewCube
      if (!this.hideCube) {
        const cs = this.cubeSize;
        r.clearDepth();
        r.setScissorTest(true);
        r.setScissor(w - cs - 8, h - cs - 8, cs, cs);
        r.setViewport(w - cs - 8, h - cs - 8, cs, cs);
        const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).normalize();
        this.cubeCam.position.copy(dir.multiplyScalar(6));
        this.cubeCam.up.copy(this.camera.up);
        this.cubeCam.lookAt(0, 0, 0);
        r.render(this.cubeScene, this.cubeCam);
        r.setScissorTest(false);
      }
    };
    loop();
  }
  render() { this.needsRender = true; }

  // ---------- Kamera ----------
  pixelsPerUnit() {
    const h = this.container.clientHeight || 1;
    return (this.camera.zoom * h) / (this.camera.top - this.camera.bottom);
  }
  setViewDir(dir, up, { animate = true, target } = {}) {
    const d = new THREE.Vector3(...dir).normalize();
    const t = target ? new THREE.Vector3(...target) : this.controls.target.clone();
    const dist = 5000;
    const pos = t.clone().sub(d.clone().multiplyScalar(dist));
    const upV = new THREE.Vector3(...up);
    if (!animate) {
      this.camera.position.copy(pos);
      this.camera.up.copy(upV);
      this.controls.target.copy(t);
      this.camera.lookAt(t);
      this.controls.update();
      this.cameraChanged();
      return;
    }
    const q0 = this.camera.quaternion.clone();
    const m = new THREE.Matrix4().lookAt(pos, t, upV);
    const q1 = new THREE.Quaternion().setFromRotationMatrix(m);
    this.anim = { t0: performance.now(), dur: 280, q0, q1, from: this.controls.target.clone(), to: t, upV, dist };
  }
  stepAnim() {
    const a = this.anim;
    let k = Math.min(1, (performance.now() - a.t0) / a.dur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const q = a.q0.clone().slerp(a.q1, e);
    const tgt = a.from.clone().lerp(a.to, e);
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(q).multiplyScalar(a.dist);
    this.camera.position.copy(tgt.clone().add(back));
    this.camera.quaternion.copy(q);
    this.camera.up.copy(new THREE.Vector3(0, 1, 0).applyQuaternion(q));
    this.controls.target.copy(tgt);
    if (k >= 1) {
      this.camera.up.copy(a.upV);
      this.anim = null;
      this.controls.update();
    }
    this.cameraChanged();
  }
  setView(name, opts) {
    const v = VIEWS[name];
    if (v) this.setViewDir(v.dir, v.up, opts);
  }
  /** Ausschnitt an Box anpassen */
  fit(box, { keepDir = true } = {}) {
    box = box || this.contentBox();
    if (!box || box.isEmpty()) box = new THREE.Box3(new THREE.Vector3(-100, -100, -100), new THREE.Vector3(100, 100, 100));
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length() || 100;
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).normalize();
    this.controls.target.copy(c);
    this.camera.position.copy(c.clone().add(dir.multiplyScalar(5000)));
    this.viewHalf = size * 0.62;
    this.camera.zoom = 1;
    this.resize();
    this.controls.update();
    this.makeGrid(Math.max(200, size * 1.6));
    this.cameraChanged();
  }
  contentBox() {
    const box = new THREE.Box3();
    this.root.traverse((o) => { if (o.isMesh) box.expandByObject(o); });
    this.sketchGroup.traverse((o) => { if (o.isLine || o.isPoints) box.expandByObject(o); });
    return box;
  }

  // ---------- Inhalt ----------
  clear() {
    disposeTree(this.root);
    this.root.clear();
    this.pickables = [];
    this.edgeCache = null;
    this.clearHover();
    this.render();
  }

  /** Bauteil-Ergebnis anzeigen. bodies: Ergebnis des Workers */
  showPart(bodies, { color = "#8d99a6", opacity = 1, key = "part" } = {}) {
    this.clear();
    const g = this.makePartGroup(bodies, color, key, opacity);
    this.root.add(g);
    this.render();
    return g;
  }

  makePartGroup(bodies, color, key, opacity = 1, shared) {
    const g = new THREE.Group();
    g.userData.key = key;
    bodies.forEach((b, bi) => {
      if (!b.mesh) return;
      const geo = shared?.[bi]?.geo || meshGeometry(b.mesh);
      const c = new THREE.Color(color);
      if (b.kind === "member") c.offsetHSL(0, 0, ((bi % 3) - 1) * 0.035);
      const mat = new THREE.MeshStandardMaterial({
        color: c, metalness: 0.25, roughness: 0.55, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
        transparent: opacity < 1, opacity, depthWrite: opacity >= 1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData = { key, body: bi, faces: b.mesh.faces, baseColor: c.clone() };
      g.add(mesh);
      const edgeObjs = [];
      const eg = shared?.[bi]?.edgeGeo || edgeGeometry(b.mesh.edges);
      const lines = new THREE.LineSegments(eg.geo, new THREE.LineBasicMaterial({ color: COL.edge, transparent: opacity < 1, opacity: Math.max(0.35, opacity) }));
      lines.userData = { key, body: bi, edgeRanges: eg.ranges, edges: b.mesh.edges };
      g.add(lines);
      edgeObjs.push(lines);
      this.pickables.push({ mesh, lines, key, body: bi, group: g });
    });
    return g;
  }

  /** Baugruppe: comps = [{id, bodies, color, pos, rot}] */
  showAssembly(comps) {
    this.clear();
    const geoCache = new Map();
    for (const c of comps) {
      if (!c.bodies) continue;
      let shared = geoCache.get(c.partKey);
      if (!shared) {
        shared = c.bodies.map((b) => (b.mesh ? { geo: meshGeometry(b.mesh), edgeGeo: edgeGeometry(b.mesh.edges) } : null));
        geoCache.set(c.partKey, shared);
      }
      const g = this.makePartGroup(c.bodies, c.color, "comp:" + c.id, c.opacity ?? 1, shared);
      g.matrixAutoUpdate = false;
      g.matrix.fromArray(placementMatrix(c.pos, c.rot));
      g.userData.comp = c.id;
      this.root.add(g);
    }
    this.root.updateMatrixWorld(true);
    this.render();
  }

  /** Skizzen in 3D anzeigen: list = [{sketch, frame, active}] */
  showSketches(list) {
    disposeTree(this.sketchGroup);
    this.sketchGroup.clear();
    for (const { sketch, frame, active } of list) {
      const pts = new Map(sketch.points.map((p) => [p.id, p]));
      const W = (x, y) => new THREE.Vector3(...toWorld(frame, x, y));
      const segs = [], csegs = [];
      for (const e of sketch.entities) {
        const target = e.construction ? csegs : segs;
        if (e.type === "line") { const a = pts.get(e.p1), b = pts.get(e.p2); if (a && b) target.push(W(a.x, a.y), W(b.x, b.y)); }
        else if (e.type === "circle" || e.type === "arc") {
          const c = pts.get(e.c);
          if (!c) continue;
          let a0 = 0, a1 = Math.PI * 2, r = e.r;
          if (e.type === "arc") {
            const p1 = pts.get(e.p1), p2 = pts.get(e.p2);
            r = Math.hypot(p1.x - c.x, p1.y - c.y);
            a0 = Math.atan2(p1.y - c.y, p1.x - c.x);
            a1 = Math.atan2(p2.y - c.y, p2.x - c.x);
            while (a1 <= a0) a1 += Math.PI * 2;
          }
          const n = 48;
          for (let i = 0; i < n; i++) {
            const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n;
            target.push(W(c.x + r * Math.cos(t0), c.y + r * Math.sin(t0)), W(c.x + r * Math.cos(t1), c.y + r * Math.sin(t1)));
          }
        } else if (e.type === "point" && !e.construction) {
          const p = pts.get(e.p);
          const s = 3 / Math.max(0.01, this.pixelsPerUnit());
          target.push(W(p.x - s, p.y), W(p.x + s, p.y), W(p.x, p.y - s), W(p.x, p.y + s));
        }
      }
      const mk = (arr, color, dashed) => {
        if (!arr.length) return;
        const geo = new THREE.BufferGeometry().setFromPoints(arr);
        const mat = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 4, gapSize: 3, depthTest: !active }) : new THREE.LineBasicMaterial({ color, depthTest: !active });
        const l = new THREE.LineSegments(geo, mat);
        if (dashed) l.computeLineDistances();
        l.renderOrder = 5;
        this.sketchGroup.add(l);
      };
      mk(segs, active ? 0xef7d1a : COL.sketch, false);
      mk(csegs, COL.sketchConstr, true);
    }
    this.render();
  }

  /** Ebene als halbtransparentes Rechteck anzeigen (Hilfe bei Ebenenwahl) */
  showPlanes(list) {
    if (this.planeGroup) { disposeTree(this.planeGroup); this.scene.remove(this.planeGroup); }
    this.planeGroup = new THREE.Group();
    for (const { frame, size, color, label } of list) {
      const s = size / 2;
      const pts = [[-s, -s], [s, -s], [s, s], [-s, s]].map(([u, v]) => new THREE.Vector3(...toWorld(frame, u, v)));
      const geo = new THREE.BufferGeometry().setFromPoints([pts[0], pts[1], pts[2], pts[0], pts[2], pts[3]]);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
      m.userData.planeLabel = label;
      this.planeGroup.add(m);
      const lg = new THREE.BufferGeometry().setFromPoints([...pts, pts[0]]);
      this.planeGroup.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 })));
    }
    this.scene.add(this.planeGroup);
    this.render();
  }
  clearPlanes() { if (this.planeGroup) { disposeTree(this.planeGroup); this.scene.remove(this.planeGroup); this.planeGroup = null; this.render(); } }
  pickPlane(cx, cy) {
    if (!this.planeGroup) return null;
    const ray = this.raycaster(cx, cy);
    const hits = ray.intersectObjects(this.planeGroup.children.filter((o) => o.isMesh), false);
    return hits.length ? hits[0].object.userData.planeLabel : null;
  }

  // ---------- Skizzenmodus ----------
  enterSketch(frame) {
    this.sketchFrame = frame;
    this.controls.enableRotate = false;
    const n = frame.normal;
    this.setViewDir([-n[0], -n[1], -n[2]], frame.yDir, { animate: true, target: frame.origin });
    this.setModelOpacity(0.35);
    this.grid.visible = false;
  }
  exitSketch() {
    this.sketchFrame = null;
    this.controls.enableRotate = true;
    this.setModelOpacity(1);
    this.grid.visible = true;
  }
  setModelOpacity(op) {
    this.root.traverse((o) => {
      if (o.material && !Array.isArray(o.material)) {
        o.material.transparent = op < 1;
        o.material.opacity = o.isMesh ? op : Math.max(0.3, op);
        o.material.depthWrite = op >= 1;
        o.material.needsUpdate = true;
      }
    });
    this.render();
  }
  /** Weltpunkt -> Bildschirm (px, relativ zum Container) */
  worldToScreen(p) {
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.camera);
    const w = this.container.clientWidth, h = this.container.clientHeight;
    return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h];
  }
  raycaster(cx, cy) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.params.Line.threshold = 0;
    rc.setFromCamera(ndc, this.camera);
    return rc;
  }
  /** Bildschirmpunkt -> lokale Skizzenkoordinaten */
  screenToPlane(cx, cy, frame = this.sketchFrame) {
    const rc = this.raycaster(cx, cy);
    const n = new THREE.Vector3(...frame.normal);
    const o = new THREE.Vector3(...frame.origin);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, o);
    const hit = new THREE.Vector3();
    if (!rc.ray.intersectPlane(plane, hit)) {
      // Strahl parallel: Ursprung des Strahls projizieren
      plane.projectPoint(rc.ray.origin, hit);
    }
    const d = hit.sub(o);
    return [d.dot(new THREE.Vector3(...frame.xDir)), d.dot(new THREE.Vector3(...frame.yDir))];
  }
  /** Klick auf ViewCube? -> setzt Ansicht */
  handleCubeClick(cx, cy) {
    if (this.hideCube) return false;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = cx - rect.left, y = cy - rect.top;
    const w = rect.width, cs = this.cubeSize;
    if (x < w - cs - 8 || x > w - 8 || y < 8 || y > cs + 8) return false;
    const ndc = new THREE.Vector2(((x - (w - cs - 8)) / cs) * 2 - 1, -((y - 8) / cs) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.cubeCam);
    const hit = rc.intersectObject(this.cube, false)[0];
    if (!hit) return true;
    // Treffer nahe Ecke -> Iso-Richtung; sonst Flächennormale
    const p = hit.point.clone().divideScalar(0.9);
    const snap = (v) => (Math.abs(v) > 0.6 ? Math.sign(v) : 0);
    const dir = new THREE.Vector3(snap(p.x), snap(p.y), snap(p.z));
    if (dir.lengthSq() === 0) return true;
    const n = dir.normalize();
    const up = Math.abs(n.z) > 0.99 ? [0, n.z > 0 ? 1 : -1, 0] : [0, 0, 1];
    if (Math.abs(n.z) > 0.99 && n.z < 0) up[1] = -1;
    if (this.sketchFrame) return true;
    this.setViewDir([-n.x, -n.y, -n.z], up);
    return true;
  }

  // ---------- Auswahl ----------
  ensureEdgeCache() {
    if (this.edgeCache) return this.edgeCache;
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const list = [];
    const v = new THREE.Vector3();
    for (const pk of this.pickables) {
      const lines = pk.lines;
      lines.updateMatrixWorld();
      const pos = lines.geometry.attributes.position.array;
      const mw = lines.matrixWorld;
      const scr = new Float32Array((pos.length / 3) * 2);
      for (let i = 0, j = 0; i < pos.length; i += 3, j += 2) {
        v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(mw).project(this.camera);
        scr[j] = ((v.x + 1) / 2) * w;
        scr[j + 1] = ((1 - v.y) / 2) * h;
      }
      list.push({ pk, scr, ranges: lines.userData.edgeRanges });
    }
    this.edgeCache = list;
    return list;
  }
  /**
   * Was liegt unter dem Mauszeiger?
   * opts: {edges, faces}
   * -> {kind:'edge', key, body, edge, info} | {kind:'face', key, body, face, info, point, normal}
   */
  pick(cx, cy, { edges = true, faces = true } = {}) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = cx - rect.left, y = cy - rect.top;
    let faceHit = null;
    if (faces || edges) {
      const rc = this.raycaster(cx, cy);
      const meshes = this.pickables.map((p) => p.mesh);
      const hits = rc.intersectObjects(meshes, false);
      if (hits.length) faceHit = hits[0];
    }
    if (edges) {
      let best = null, bd = 7;
      for (const { pk, scr, ranges } of this.ensureEdgeCache()) {
        for (let ei = 0; ei < ranges.length; ei++) {
          const [s, c] = ranges[ei];
          for (let k = s; k < s + c - 1; k += 2) {
            const d = segDist(x, y, scr[k * 2], scr[k * 2 + 1], scr[(k + 1) * 2], scr[(k + 1) * 2 + 1]);
            if (d < bd) { bd = d; best = { pk, ei }; }
          }
        }
      }
      if (best) {
        // verdeckte Kanten nicht wählen: Tiefe gegen Flächentreffer prüfen
        const info = best.pk.lines.userData.edges[best.ei];
        let visible = true;
        if (faceHit && info.mid) {
          const mid = new THREE.Vector3(...info.mid).applyMatrix4(best.pk.lines.matrixWorld);
          const camDir = new THREE.Vector3();
          this.camera.getWorldDirection(camDir);
          const dMid = mid.clone().sub(this.camera.position).dot(camDir);
          const dHit = faceHit.point.clone().sub(this.camera.position).dot(camDir);
          const tol = 2 / this.pixelsPerUnit() + 0.5;
          if (dMid > dHit + tol && best.pk.mesh.material.opacity >= 1) visible = false;
        }
        if (visible) return { kind: "edge", key: best.pk.key, body: best.pk.body, edge: best.ei, info, group: best.pk.group };
      }
    }
    if (faces && faceHit) {
      const mesh = faceHit.object;
      const tri = faceHit.faceIndex;
      const flist = mesh.userData.faces || [];
      const fi = flist.findIndex((f) => tri * 3 >= f.start && tri * 3 < f.start + f.count);
      const info = flist[fi] || {};
      const nrm = faceHit.face ? faceHit.face.normal.clone().transformDirection(mesh.matrixWorld) : null;
      const pk = this.pickables.find((p) => p.mesh === mesh);
      return { kind: "face", key: pk.key, body: pk.body, face: fi, info, point: faceHit.point.toArray(), normal: nrm ? nrm.toArray() : null, group: pk.group, mesh };
    }
    return null;
  }

  clearHover() {
    disposeTree(this.hoverGroup);
    this.hoverGroup.clear();
    this.render();
  }
  /** Hervorhebung (Hover oder Auswahl) eines Pick-Ergebnisses */
  highlight(hits, { color = COL.hover, group = this.hoverGroup, opacity = 0.55 } = {}) {
    disposeTree(group);
    group.clear();
    for (const hit of hits) {
      if (!hit) continue;
      const pk = this.pickables.find((p) => p.key === hit.key && p.body === hit.body);
      if (!pk) continue;
      pk.group.updateMatrixWorld();
      if (hit.kind === "edge") {
        const [s, c] = pk.lines.userData.edgeRanges[hit.edge];
        const src = pk.lines.geometry.attributes.position.array.slice(s * 3, (s + c) * 3);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(src, 3));
        const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, depthTest: false }));
        l.matrixAutoUpdate = false;
        l.matrix.copy(pk.lines.matrixWorld);
        l.renderOrder = 20;
        group.add(l);
      } else if (hit.kind === "face") {
        const f = pk.mesh.userData.faces[hit.face];
        if (!f) continue;
        // kompakte Kopie nur der Dreiecke dieser Fläche
        const pos = pk.mesh.geometry.attributes.position.array;
        const idx = pk.mesh.geometry.index.array;
        const arr = new Float32Array(f.count * 3);
        for (let i = 0; i < f.count; i++) {
          const v = idx[f.start + i] * 3;
          arr[i * 3] = pos[v]; arr[i * 3 + 1] = pos[v + 1]; arr[i * 3 + 2] = pos[v + 2];
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        m.matrixAutoUpdate = false;
        m.matrix.copy(pk.mesh.matrixWorld);
        m.renderOrder = 15;
        group.add(m);
      } else if (hit.kind === "group") {
        // ganzes Bauteil/Komponente einfärben
        for (const p of this.pickables.filter((q) => q.key === hit.key)) {
          const m = new THREE.Mesh(p.mesh.geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }));
          m.userData.sharedGeo = true;
          m.matrixAutoUpdate = false;
          m.matrix.copy(p.mesh.matrixWorld);
          group.add(m);
        }
      }
    }
    this.render();
  }
  /** Dauerhafte Auswahl-Hervorhebung */
  setSelectionHits(hits) {
    if (!this.selGroup) { this.selGroup = new THREE.Group(); this.scene.add(this.selGroup); }
    this.highlight(hits, { group: this.selGroup, color: 0xd9600c, opacity: 0.45 });
  }
  /** Kanten anhand gespeicherter Mittelpunkte finden (für Rundung/Fase) */
  findEdgesByMid(points, key = "part") {
    const out = [];
    for (const pk of this.pickables.filter((p) => p.key === key)) {
      const edges = pk.lines.userData.edges;
      edges.forEach((e, i) => {
        if (e.mid && points.some((p) => Math.hypot(p[0] - e.mid[0], p[1] - e.mid[1], p[2] - e.mid[2]) < 1e-3)) out.push({ kind: "edge", key: pk.key, body: pk.body, edge: i });
      });
    }
    return out;
  }
  findFacesByPoint(points, key = "part") {
    const out = [];
    for (const pk of this.pickables.filter((p) => p.key === key)) {
      (pk.mesh.userData.faces || []).forEach((f, i) => {
        if (f.type === "PLANE" && f.normal && points.some((p) => Math.abs((p[0] - f.point[0]) * f.normal[0] + (p[1] - f.point[1]) * f.normal[1] + (p[2] - f.point[2]) * f.normal[2]) < 1e-3)) {
          // Punkt liegt in der Ebene – zusätzlich prüfen, ob er im Flächen-Dreiecksnetz liegt
          if (pointOnFaceMesh(pk.mesh, f, points)) out.push({ kind: "face", key: pk.key, body: pk.body, face: i });
        }
      });
    }
    return out;
  }
  snapshot() {
    this.needsRender = true;
    const r = this.renderer;
    r.render(this.scene, this.camera);
    return r.domElement.toDataURL("image/png");
  }
}

// ---------- Hilfen ----------
function meshGeometry(m) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(m.normals, 3));
  geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}
function edgeGeometry(edges) {
  // Linienzüge -> Segmentpaare, Bereich je Kante merken
  let total = 0;
  for (const e of edges) total += Math.max(0, e.positions.length / 3 - 1) * 2;
  const arr = new Float32Array(total * 3);
  const ranges = [];
  let k = 0;
  for (const e of edges) {
    const p = e.positions;
    const start = k / 3;
    for (let i = 0; i + 3 < p.length; i += 3) {
      arr[k++] = p[i]; arr[k++] = p[i + 1]; arr[k++] = p[i + 2];
      arr[k++] = p[i + 3]; arr[k++] = p[i + 4]; arr[k++] = p[i + 5];
    }
    ranges.push([start, k / 3 - start]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
  geo.computeBoundingSphere();
  return { geo, ranges };
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function pointOnFaceMesh(mesh, f, points) {
  const pos = mesh.geometry.attributes.position.array;
  const idx = mesh.geometry.index.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), tri = new THREE.Triangle(), cp = new THREE.Vector3();
  for (const p of points) {
    const P = new THREE.Vector3(...p);
    for (let i = f.start; i < f.start + f.count; i += 3) {
      a.fromArray(pos, idx[i] * 3); b.fromArray(pos, idx[i + 1] * 3); c.fromArray(pos, idx[i + 2] * 3);
      tri.set(a, b, c);
      tri.closestPointToPoint(P, cp);
      if (cp.distanceTo(P) < 1e-3) return true;
    }
  }
  return false;
}
function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry && !o.userData?.sharedGeo) o.geometry.dispose?.();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
  });
}
function labelTexture(text) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#eef2f6";
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "#b9c4ce";
  g.lineWidth = 4;
  g.strokeRect(2, 2, 124, 124);
  g.fillStyle = "#1c2733";
  g.font = "600 25px Bahnschrift, 'Segoe UI', Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 64, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function niceStep(x) {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
