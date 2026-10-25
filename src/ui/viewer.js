// 3D-Ansicht: Darstellung, Kamera, ViewCube, Auswahl von Flächen/Kanten
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { placementMatrix, toWorld } from "../core/geom.js";
import { segmentsInBox, trianglesInBox } from "../core/boxselect.js";
import { ellipseGeom, ellipseSamples } from "../core/ellipse.js";
import { splineSamples } from "../core/spline.js";
import { photoSurface, photoStage } from "../core/rendering.js";
import { explodeOffsets } from "../core/kinematik.js";

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
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, stencil: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;
    container.append(this.renderer.domElement);
    this.renderer.domElement.tabIndex = 0;

    this.scene = new THREE.Scene();
    this.ortho = new THREE.OrthographicCamera(-100, 100, 100, -100, -100000, 100000);
    this.persp = new THREE.PerspectiveCamera(35, 1, 1, 100000);
    this.camera = this.ortho;
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(400, -400, 400);
    this.lights = { heads: [] };
    for (const cam of [this.ortho, this.persp]) {
      this.scene.add(cam);
      const head = new THREE.DirectionalLight(0xffffff, 1.9);
      head.position.set(0.4, 0.6, 1);
      cam.add(head);
      this.lights.heads.push(head);
    }
    this.perspective = false;
    this.hidden = new Set(); // nur Anzeige: "key#body" bzw. "key#*"
    this.displayMode = "kanten";
    this.clip = null; // {plane: THREE.Plane}
    this.renderer.localClippingEnabled = true;
    this.fillSection = true; // Schnittflächen geschlossen zeigen (Stencil-Verfahren)
    this.capGroup = new THREE.Group(); // Deckflächen in Weltkoordinaten, nicht in root (sonst Teil der Inhaltsbox)
    this.scene.add(this.capGroup);
    this.lights.ambient = new THREE.AmbientLight(0xffffff, 0.95);
    this.lights.hemi = new THREE.HemisphereLight(0xf4f7fb, 0x5b6773, 0.55);
    this.scene.add(this.lights.ambient, this.lights.hemi);
    this.stage = new THREE.Group(); // Fotodarstellung: Sonne mit Schatten und Bodenfläche (nicht Teil der Inhaltsbox)
    this.scene.add(this.stage);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: null }; // Drehen: bindPivotOrbit bzw. applyPrefs
    this.controls.zoomToCursor = true;
    this.controls.enableDamping = false;
    this.controls.screenSpacePanning = true;
    this.controls.rotateSpeed = 0.9;
    this.controls.zoomSpeed = 1.2;
    this.controls.addEventListener("change", () => this.cameraChanged());
    this.pivotOrbit = true;
    this.rotateButton = 2;
    this.bindPivotOrbit();

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

    this.colors = { ...COL };
    this.animate = true;
    this.showGrid = true;
    this.showCube = true;
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
    const g = new THREE.GridHelper(n * step, n, this.dark ? 0x6b7987 : 0x9fb0c2, this.dark ? 0x46525e : 0xc6d1db);
    g.rotation.x = Math.PI / 2;
    g.material.transparent = true;
    g.material.opacity = 0.55;
    g.material.depthWrite = false;
    g.visible = this.grid ? this.grid.visible : true;
    this.grid = g;
    this.helpers.add(g);
    this.gridStep = step;
    this.gridSize = size;
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
    this.ortho.left = -half * aspect;
    this.ortho.right = half * aspect;
    this.ortho.top = half;
    this.ortho.bottom = -half;
    this.ortho.updateProjectionMatrix();
    this.persp.aspect = aspect;
    this.persp.updateProjectionMatrix();
    this.cameraChanged();
  }
  cameraChanged() {
    if (this.camera.isPerspectiveCamera) {
      // Nah-/Fernebene an den Abstand anpassen (Tiefenauflösung)
      const d = this.camera.position.distanceTo(this.controls?.target || new THREE.Vector3());
      this.camera.near = Math.max(0.01, d / 2000);
      this.camera.far = d * 200 + 1e5;
      this.camera.updateProjectionMatrix();
    }
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
      const s = 60 / this.pixelsPerUnit();
      this.triad.scale.setScalar(s);
      r.render(this.scene, this.camera);
      // ViewCube
      if (!this.hideCube && this.showCube) {
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

  // ---------- Drehen um den Punkt unter dem Mauszeiger ----------
  bindPivotOrbit() {
    const el = this.renderer.domElement;
    let st = null;
    el.addEventListener("pointerdown", (e) => {
      if (!this.pivotOrbit || e.button !== this.rotateButton || !this.controls.enabled || !this.controls.enableRotate || this.sketchFrame) return;
      st = { x: e.clientX, y: e.clientY, id: e.pointerId, pivot: this.pivotAt(e.clientX, e.clientY) };
      el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!st) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      st.x = e.clientX; st.y = e.clientY;
      if (dx || dy) this.orbitAround(st.pivot, dx, dy);
    });
    const end = () => { if (st) { el.releasePointerCapture?.(st.id); st = null; } };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }
  /** Drehpunkt: sichtbarer Modellpunkt unter dem Mauszeiger, sonst die Bildmitte */
  pivotAt(cx, cy) {
    const meshes = this.pickables.filter((p) => p.mesh.visible).map((p) => p.mesh);
    const hit = this.raycaster(cx, cy).intersectObjects(meshes, false).find((x) => !this.clipped(x.point));
    return hit ? hit.point.clone() : this.controls.target.clone();
  }
  /** Kamera um pivot drehen (dx/dy in px, wie OrbitControls: waagrecht um die Hochachse, senkrecht um die Bildquerachse) */
  orbitAround(pivot, dx, dy) {
    const h = this.renderer.domElement.clientHeight || 1, sp = this.controls.rotateSpeed;
    const cam = this.camera, tgt = this.controls.target, up = cam.up.clone().normalize();
    let q = new THREE.Quaternion().setFromAxisAngle(up, (-2 * Math.PI * dx * sp) / h);
    const dir = tgt.clone().sub(cam.position).normalize();
    const right = dir.clone().cross(up);
    if (right.lengthSq() > 1e-12) {
      const qp = new THREE.Quaternion().setFromAxisAngle(right.normalize(), (-2 * Math.PI * dy * sp) / h);
      // nicht über die Pole kippen
      if (Math.abs(dir.clone().applyQuaternion(qp).dot(up)) < 0.999) q = q.multiply(qp);
    }
    for (const v of [cam.position, tgt]) v.sub(pivot).applyQuaternion(q).add(pivot);
    cam.lookAt(tgt);
    this.controls.update();
    this.cameraChanged();
  }

  /** Benutzereinstellungen (src/core/settings.js) übernehmen */
  applyPrefs(v) {
    const c = this.controls;
    // Drehen um den Punkt unter dem Mauszeiger übernimmt bindPivotOrbit; OrbitControls dreht dann nicht selbst
    this.pivotOrbit = v["ansicht.drehpunktCursor"] !== false;
    const rot = this.pivotOrbit ? null : THREE.MOUSE.ROTATE;
    this.rotateButton = v["ansicht.maus"] === "mitte-drehen" ? 1 : 2;
    c.mouseButtons = v["ansicht.maus"] === "mitte-drehen"
      ? { LEFT: null, MIDDLE: rot, RIGHT: THREE.MOUSE.PAN }
      : { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: rot };
    c.zoomToCursor = v["ansicht.zoomZumCursor"];
    c.zoomSpeed = v["ansicht.zoomGeschwindigkeit"];
    c.rotateSpeed = v["ansicht.drehGeschwindigkeit"];
    this.animate = v["darstellung.animation"];
    this.showGrid = v["ansicht.raster"];
    if (!this.sketchFrame) this.grid.visible = this.showGrid && !this.photo;
    this.showCube = v["ansicht.viewcube"];
    const dark = document.documentElement.dataset.theme === "dark";
    if (dark !== !!this.dark) { this.dark = dark; if (this.grid) { const old = this.grid; this.makeGrid(this.gridSize || 400); this.grid.position.copy(old.position); this.grid.quaternion.copy(old.quaternion); this.grid.visible = old.visible; } }
    if (v["ansicht.schnittFuellen"] !== undefined && v["ansicht.schnittFuellen"] !== this.fillSection) {
      this.fillSection = v["ansicht.schnittFuellen"];
      this.updateCaps();
    }
    const edge = new THREE.Color(v["ansicht.kantenfarbe"]).getHex();
    if (edge !== this.colors.edge) {
      this.colors.edge = edge;
      this.root.traverse((o) => { if (o.isLineSegments && o.userData.edgeRanges) o.material.color.setHex(edge); });
    }
    this.colors.sel = new THREE.Color(v["ansicht.auswahlfarbe"]).getHex();
    this.colors.hover = new THREE.Color(v["ansicht.hoverfarbe"]).getHex();
    if (v["ansicht.projektion"] !== undefined) this.setPerspective(v["ansicht.projektion"] === "perspektive");
    if (v["ansicht.darstellung"] !== undefined && v["ansicht.darstellung"] !== this.displayMode) this.setDisplayMode(v["ansicht.darstellung"]);
    this.render();
  }

  // ---------- Kamera ----------
  /** Bildpunkte je mm; bei Perspektive in der Tiefe des Drehpunkts */
  pixelsPerUnit() {
    const h = this.container.clientHeight || 1;
    const c = this.camera;
    if (c.isPerspectiveCamera) {
      const d = c.position.distanceTo(this.controls.target) || 1;
      return h / (2 * d * Math.tan((c.fov * Math.PI) / 360));
    }
    return (c.zoom * h) / (c.top - c.bottom);
  }
  /** Sichtbare halbe Höhe in mm am Drehpunkt */
  visibleHalf() { return (this.container.clientHeight || 1) / 2 / this.pixelsPerUnit(); }
  /** Orthogonal ↔ perspektivisch umschalten, Ausschnitt bleibt erhalten */
  setPerspective(on) {
    on = !!on;
    if (this.sketchFrame) { this.wantPerspective = on; return; }
    if (on === this.camera.isPerspectiveCamera) { this.perspective = on; return; }
    this.anim = null;
    const t = this.controls.target.clone();
    const dir = new THREE.Vector3().subVectors(this.camera.position, t).normalize();
    const half = this.visibleHalf();
    const from = this.camera;
    const to = on ? this.persp : this.ortho;
    to.up.copy(from.up);
    if (on) {
      const d = half / Math.tan((this.persp.fov * Math.PI) / 360);
      to.position.copy(t.clone().add(dir.multiplyScalar(d)));
    } else {
      this.viewHalf = half;
      this.ortho.zoom = 1;
      to.position.copy(t.clone().add(dir.multiplyScalar(5000)));
    }
    to.lookAt(t);
    this.camera = to;
    this.controls.object = to;
    this.perspective = on;
    this.resize();
    this.controls.update();
    this.cameraChanged();
  }
  setViewDir(dir, up, { animate = this.animate, target } = {}) {
    const d = new THREE.Vector3(...dir).normalize();
    const t = target ? new THREE.Vector3(...target) : this.controls.target.clone();
    const dist = this.camera.isPerspectiveCamera ? this.camera.position.distanceTo(this.controls.target) : 5000;
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
  /** Kamerastand für benannte Ansichten (Blickrichtung, Ausschnitt; Projektion bleibt Einstellung) */
  viewState() {
    const t = this.controls.target, d = new THREE.Vector3().subVectors(t, this.camera.position).normalize();
    const r = (v) => Math.round(v * 1e6) / 1e6;
    return { target: t.toArray().map(r), dir: d.toArray().map(r), up: this.camera.up.toArray().map(r), half: r(this.visibleHalf()) };
  }
  applyViewState(s, opts) {
    if (!s || this.sketchFrame) return;
    this.anim = null;
    this.viewHalf = s.half;
    this.ortho.zoom = 1;
    if (this.camera.isPerspectiveCamera) {
      const back = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).normalize();
      this.camera.position.copy(this.controls.target.clone().add(back.multiplyScalar(s.half / Math.tan((this.persp.fov * Math.PI) / 360))));
    }
    this.resize();
    this.setViewDir(s.dir, s.up, { ...opts, target: s.target });
  }
  setView(name, opts) {
    const v = VIEWS[name];
    if (v) this.setViewDir(v.dir, v.up, opts);
  }
  /** Ausschnitt an Box anpassen */
  fit(box, { keepGrid = false } = {}) {
    box = box || this.contentBox();
    if (!box || box.isEmpty()) box = new THREE.Box3(new THREE.Vector3(-100, -100, -100), new THREE.Vector3(100, 100, 100));
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length() || 100;
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).normalize();
    this.controls.target.copy(c);
    this.viewHalf = size * 0.62;
    const dist = this.camera.isPerspectiveCamera ? this.viewHalf / Math.tan((this.persp.fov * Math.PI) / 360) : 5000;
    this.camera.position.copy(c.clone().add(dir.multiplyScalar(dist)));
    this.ortho.zoom = 1;
    this.resize();
    this.controls.update();
    if (!keepGrid) this.makeGrid(Math.max(200, size * 1.6));
    this.cameraChanged();
  }
  contentBox() {
    const box = new THREE.Box3();
    this.root.traverse((o) => { if (o.isMesh && !o.userData.stencil && !(o.userData.key !== undefined && this.isHidden(o.userData.key, o.userData.body))) box.expandByObject(o); });
    this.sketchGroup.traverse((o) => { if (o.isLine || o.isPoints) box.expandByObject(o); });
    return box;
  }

  // ---------- Inhalt ----------
  clear() {
    disposeTree(this.root);
    this.root.clear();
    this.pickables = [];
    this.updateCaps();
    this.edgeCache = null;
    this.clearHover();
    this.render();
  }

  /** Bauteil-Ergebnis anzeigen. bodies: Ergebnis des Workers */
  showPart(bodies, { color = "#8d99a6", opacity = 1, key = "part", material, finish } = {}) {
    this.clear();
    const g = this.makePartGroup(bodies, color, key, opacity, null, material, finish);
    this.root.add(g);
    this.updateCaps();
    this.render();
    return g;
  }

  makePartGroup(bodies, color, key, opacity = 1, shared, material, finish) {
    const g = new THREE.Group();
    g.userData.key = key;
    bodies.forEach((b, bi) => {
      if (!b.mesh) return;
      const geo = shared?.[bi]?.geo || meshGeometry(b.mesh);
      const c = new THREE.Color(color);
      if (b.kind === "member") c.offsetHSL(0, 0, ((bi % 3) - 1) * 0.035);
      const mat = new THREE.MeshStandardMaterial({
        color: c, metalness: 0.08, roughness: 0.5, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
        transparent: opacity < 1, opacity, depthWrite: opacity >= 1,
        clippingPlanes: this.clipPlanes(),
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData = { key, body: bi, faces: b.mesh.faces, baseColor: c.clone(), baseOpacity: opacity, material, finish, meta: b.meta };
      g.add(mesh);
      const edgeObjs = [];
      const eg = shared?.[bi]?.edgeGeo || edgeGeometry(b.mesh.edges);
      const lines = new THREE.LineSegments(eg.geo, new THREE.LineBasicMaterial({ color: this.colors.edge, transparent: opacity < 1, opacity: Math.max(0.35, opacity), clippingPlanes: this.clipPlanes() }));
      lines.userData = { key, body: bi, edgeRanges: eg.ranges, edges: b.mesh.edges };
      g.add(lines);
      edgeObjs.push(lines);
      this.pickables.push({ mesh, lines, key, body: bi, group: g });
      this.applyDisplay(mesh, lines);
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
      const g = this.makePartGroup(c.bodies, c.color, "comp:" + c.id, c.opacity ?? 1, shared, c.material, c.finish);
      g.matrixAutoUpdate = false;
      g.matrix.fromArray(c.matrix || placementMatrix(c.pos, c.rot));
      g.userData.comp = c.id;
      g.userData.baseMatrix = g.matrix.clone();
      if (c.leaf) { g.userData.leaf = c.leaf; g.userData.inner = c.inner; }
      this.root.add(g);
    }
    this.root.updateMatrixWorld(true);
    this.compDeltas = new Map();
    this.explodeCenters = null;
    if (this.explode > 0) this.applyCompMatrices();
    this.updateCaps();
    this.render();
  }
  /** Hüllquader einer Komponente in Baugruppen-Koordinaten (zusammengebaut) als [min, max] oder null */
  componentBox(compId) {
    const b = new THREE.Box3(), M = new THREE.Matrix4();
    for (const g of this.root.children) {
      if (g.userData.comp !== compId) continue;
      M.copy(g.userData.baseMatrix || g.matrix);
      g.traverse((o) => {
        if (!o.isMesh || o.userData.stencil) return;
        o.geometry.computeBoundingBox();
        const local = o === g ? new THREE.Matrix4() : new THREE.Matrix4().copy(o.matrix);
        b.union(o.geometry.boundingBox.clone().applyMatrix4(M.clone().multiply(local)));
      });
    }
    return b.isEmpty() ? null : [b.min.toArray(), b.max.toArray()];
  }
  /** Nur Anzeige (M23): zusätzliche Drehung je Komponente beim Bewegen von Gelenken; deltas = Map compId → 4×4-Array */
  setComponentDeltas(deltas) {
    this.compDeltas = deltas || new Map();
    this.applyCompMatrices();
  }
  /** Explosionsdarstellung (nur Anzeige): 0 = zusammengebaut, 1 = Abstände zur Mitte verdoppelt */
  setExplode(factor) {
    this.explode = Math.max(0, Number(factor) || 0);
    this.applyCompMatrices();
  }
  applyCompMatrices() {
    const groups = this.root.children.filter((g) => g.userData.comp && g.userData.baseMatrix);
    if (!groups.length) return;
    let offs = null;
    if (this.explode > 0) {
      if (!this.explodeCenters) {
        // Mitten je Komponente aus der zusammengebauten Lage (einmal je Anzeige)
        const boxes = new Map();
        for (const g of groups) {
          g.matrix.copy(g.userData.baseMatrix);
          g.updateMatrixWorld(true);
          const b = boxes.get(g.userData.comp) || new THREE.Box3();
          g.traverse((o) => { if (o.isMesh && !o.userData.stencil) b.expandByObject(o); });
          boxes.set(g.userData.comp, b);
        }
        this.explodeCenters = [...boxes].filter(([, b]) => !b.isEmpty()).map(([id, b]) => ({ id, center: b.getCenter(new THREE.Vector3()).toArray() }));
      }
      offs = explodeOffsets(this.explodeCenters, this.explode);
    }
    const D = new THREE.Matrix4(), T = new THREE.Matrix4();
    for (const g of groups) {
      const m = g.matrix.copy(g.userData.baseMatrix);
      const d = this.compDeltas?.get(g.userData.comp);
      if (d) m.premultiply(D.fromArray(d));
      const o = offs?.get(g.userData.comp);
      if (o) m.premultiply(T.makeTranslation(o[0], o[1], o[2]));
    }
    this.root.updateMatrixWorld(true);
    this.edgeCache = null;
    this.updateCaps();
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
        } else if (e.type === "spline") {
          const ctrl = (e.pts || []).map((id) => pts.get(id)).filter(Boolean).map((p) => [p.x, p.y]);
          const q = ctrl.length >= 2 ? splineSamples(ctrl, 16) : [];
          for (let i = 0; i + 1 < q.length; i++) target.push(W(q[i][0], q[i][1]), W(q[i + 1][0], q[i + 1][1]));
        } else if (e.type === "ellipse") {
          const c = pts.get(e.c), a = pts.get(e.a);
          if (!c || !a) continue;
          const q = ellipseSamples(ellipseGeom(c, a, e.r), 64);
          for (let i = 0; i < q.length; i++) { const u = q[i], v = q[(i + 1) % q.length]; target.push(W(u[0], u[1]), W(v[0], v[1])); }
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
    // Skizzieren immer orthogonal (Bildschirm ↔ Skizzenebene linear)
    this.wantPerspective = this.camera.isPerspectiveCamera;
    if (this.wantPerspective) this.setPerspective(false);
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
    if (this.wantPerspective) this.setPerspective(true);
    this.wantPerspective = false;
    this.setModelOpacity(1);
    this.grid.visible = this.showGrid && !this.photo;
  }
  setModelOpacity(op) {
    for (const pk of this.pickables) {
      pk.mesh.userData.baseOpacity = op;
      this.applyDisplay(pk.mesh, pk.lines);
    }
    this.render();
  }
  /**
   * Darstellungsmodus: kanten (schattiert mit Kanten), schattiert, draht (nur Kanten), transparent,
   * foto (PBR-Oberflächen, Umgebungslicht, Bodenschatten; ohne Kanten).
   * Wirkt nur auf die Anzeige; Auswahl richtet sich nach dem Sichtbaren.
   */
  setDisplayMode(mode) {
    this.displayMode = mode;
    this.setPhoto(mode === "foto");
    for (const pk of this.pickables) this.applyDisplay(pk.mesh, pk.lines);
    this.edgeCache = null;
    this.updateCaps();
    this.render();
  }
  applyDisplay(mesh, lines) {
    const mode = this.displayMode;
    const base = mesh.userData.baseOpacity ?? 1;
    const photo = mode === "foto";
    const surf = photo ? photoSurface(mesh.userData.material, mesh.userData.meta, mesh.userData.finish) : null;
    const op = mode === "transparent" ? Math.min(base, 0.3) : surf?.opacity != null ? Math.min(base, surf.opacity) : base;
    const m = mesh.material;
    m.metalness = surf ? surf.metalness : 0.08;
    m.roughness = surf ? surf.roughness : 0.5;
    if (mesh.userData.baseColor) m.color.copy(surf?.color ? new THREE.Color(surf.color) : mesh.userData.baseColor);
    mesh.castShadow = photo && op >= 1;
    mesh.receiveShadow = photo;
    m.transparent = op < 1;
    m.opacity = op;
    m.depthWrite = op >= 1;
    m.needsUpdate = true;
    const hid = this.isHidden(mesh.userData.key, mesh.userData.body);
    mesh.visible = mode !== "draht" && base > 0 && !hid;
    const l = lines.material;
    l.transparent = op < 1;
    l.opacity = Math.max(0.35, op);
    l.needsUpdate = true;
    lines.visible = mode !== "schattiert" && !photo && base > 0 && !hid;
  }
  /** Fotodarstellung ein/aus: Umgebungsbild (Raum) für Spiegelungen, Filmkurve, Schatten; Raster aus */
  setPhoto(on) {
    if (!!this.photo === on) return;
    this.photo = on;
    const r = this.renderer;
    if (on && !this.envMap) {
      const pm = new THREE.PMREMGenerator(r);
      this.envMap = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
    }
    this.scene.environment = on ? this.envMap : null;
    r.toneMapping = on ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = on;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    for (const h of this.lights.heads) h.intensity = on ? 0.6 : 1.9;
    this.lights.ambient.intensity = on ? 0.15 : 0.95;
    this.lights.hemi.intensity = on ? 0.25 : 0.55;
    if (this.grid) this.grid.visible = on ? false : this.showGrid;
    this.updateStage();
  }
  /** Sonne und Bodenfläche an die Inhaltsbox anpassen (nur in der Fotodarstellung) */
  updateStage() {
    this.stage.traverse((o) => o.isLight && o.dispose?.());
    disposeTree(this.stage);
    this.stage.clear();
    if (!this.photo) return;
    const box = new THREE.Box3();
    for (const pk of this.pickables) if (pk.mesh.visible) box.expandByObject(pk.mesh);
    if (box.isEmpty()) return;
    const st = photoStage(box.min.toArray(), box.max.toArray());
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(...st.sun);
    sun.target.position.set(...st.center);
    sun.castShadow = true;
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -st.shadowHalf;
    sc.right = sc.top = st.shadowHalf;
    sc.near = st.radius * 0.5;
    sc.far = st.shadowFar;
    sc.updateProjectionMatrix();
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = st.radius * 0.002;
    sun.shadow.radius = 3;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(st.groundSize, st.groundSize), new THREE.ShadowMaterial({ opacity: 0.28 }));
    ground.position.set(st.center[0], st.center[1], st.groundZ);
    ground.receiveShadow = true;
    ground.raycast = () => {};
    ground.userData = { ground: true };
    this.stage.add(sun, sun.target, ground);
  }
  isHidden(key, body) { return this.hidden.has(key + "#*") || this.hidden.has(key + "#" + body); }
  /** Körper/Komponenten nur in der Anzeige aus- oder einblenden (keine Modelländerung) */
  setHidden(set) {
    this.hidden = new Set(set);
    for (const pk of this.pickables) this.applyDisplay(pk.mesh, pk.lines);
    this.edgeCache = null;
    this.updateCaps();
    this.render();
  }

  // ---------- Schnittebene ----------
  clipPlanes() { return this.clip ? [this.clip.plane] : []; }
  /**
   * Schnitt durch das Modell: axis X/Y/Z, offset in mm, flip = andere Seite zeigen.
   * null schaltet ab. Nur Anzeige – Geometrie und Masse bleiben unverändert.
   */
  setClip(c) {
    if (!c) this.clip = null;
    else {
      const n = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[c.axis] || [0, 0, 1];
      const v = new THREE.Vector3(...n).multiplyScalar(c.flip ? 1 : -1);
      // sichtbar bleibt, was auf der positiven Seite liegt: n·p + d ≥ 0
      this.clip = { ...c, plane: new THREE.Plane(v, c.flip ? -c.offset : c.offset) };
    }
    const planes = this.clipPlanes();
    for (const pk of this.pickables) {
      pk.mesh.material.clippingPlanes = planes;
      pk.lines.material.clippingPlanes = planes;
      pk.mesh.material.needsUpdate = true;
      pk.lines.material.needsUpdate = true;
    }
    this.edgeCache = null;
    this.updateCaps();
    this.render();
  }
  /**
   * Geschlossene Schnittflächen: je Körper zählen Rück- minus Vorderseiten im Stencil-Puffer,
   * wo ein Rest bleibt, liegt die Ebene im Material; dort wird eine Deckfläche gezeichnet
   * (Körperfarbe abgedunkelt) und der Stencil wieder genullt. Nur bei undurchsichtigen, sichtbaren Körpern.
   */
  updateCaps() {
    this.updateStage();
    for (const pk of this.pickables) {
      if (pk.stencil) { for (const m of pk.stencil) { m.parent?.remove(m); m.material.dispose(); } pk.stencil = null; }
    }
    disposeTree(this.capGroup);
    this.capGroup.clear();
    if (!this.clip || !this.fillSection) return;
    const plane = this.clip.plane;
    const box = new THREE.Box3();
    for (const pk of this.pickables) if (pk.mesh.visible) box.expandByObject(pk.mesh);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3()).length() * 2 + 10;
    const center = plane.projectPoint(box.getCenter(new THREE.Vector3()), new THREE.Vector3());
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), plane.normal);
    const capGeo = new THREE.PlaneGeometry(size, size);
    let order = 1;
    for (const pk of this.pickables) {
      const m = pk.mesh;
      if (!m.visible || m.material.transparent) continue;
      const base = { depthWrite: false, depthTest: false, colorWrite: false, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, clippingPlanes: [plane] };
      const back = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ ...base, side: THREE.BackSide, stencilZPass: THREE.IncrementWrapStencilOp, stencilFail: THREE.IncrementWrapStencilOp, stencilZFail: THREE.IncrementWrapStencilOp }));
      const front = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ ...base, side: THREE.FrontSide, stencilZPass: THREE.DecrementWrapStencilOp, stencilFail: THREE.DecrementWrapStencilOp, stencilZFail: THREE.DecrementWrapStencilOp }));
      pk.stencil = [back, front];
      for (const s of pk.stencil) {
        s.userData = { stencil: true, sharedGeo: true };
        s.raycast = () => {};
        s.renderOrder = order;
        m.add(s);
      }
      const color = (m.userData.baseColor || new THREE.Color(0x8d99a6)).clone().multiplyScalar(0.6);
      const cap = new THREE.Mesh(capGeo, new THREE.MeshStandardMaterial({
        color, metalness: 0.05, roughness: 0.7, side: THREE.DoubleSide,
        stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.ZeroStencilOp, stencilZFail: THREE.ZeroStencilOp, stencilZPass: THREE.ZeroStencilOp,
      }));
      cap.position.copy(center);
      cap.quaternion.copy(quat);
      cap.renderOrder = order + 0.5;
      cap.userData = { cap: true, key: pk.key, body: pk.body, sharedGeo: true };
      cap.raycast = () => {};
      this.capGroup.add(cap);
      order++;
    }
    if (this.capGroup.children.length) this.capGroup.children[0].userData.sharedGeo = false;
  }
  clipped(worldPoint) { return !!this.clip && this.clip.plane.distanceToPoint(worldPoint) < -1e-6; }

  // ---------- Ausschnitt ----------
  /** Box der Auswahl in Weltkoordinaten (Flächen, Kanten, Komponenten) */
  boxOfHits(hits) {
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (const hit of hits || []) {
      const list = hit.kind === "group" ? this.pickables.filter((p) => p.key === hit.key) : this.pickables.filter((p) => p.key === hit.key && p.body === hit.body);
      for (const pk of list) {
        pk.group.updateMatrixWorld();
        if (hit.kind === "group") { box.expandByObject(pk.mesh); continue; }
        if (hit.kind === "edge") {
          const [s, c] = pk.lines.userData.edgeRanges[hit.edge] || [0, 0];
          const pos = pk.lines.geometry.attributes.position.array;
          for (let i = s; i < s + c; i++) box.expandByPoint(v.fromArray(pos, i * 3).applyMatrix4(pk.lines.matrixWorld));
        } else if (hit.kind === "face") {
          const f = pk.mesh.userData.faces?.[hit.face];
          if (!f) continue;
          const pos = pk.mesh.geometry.attributes.position.array, idx = pk.mesh.geometry.index.array;
          for (let i = f.start; i < f.start + f.count; i++) box.expandByPoint(v.fromArray(pos, idx[i] * 3).applyMatrix4(pk.mesh.matrixWorld));
        }
      }
    }
    return box;
  }
  /** Auf Auswahl zoomen; leere Auswahl → alles */
  /** Auf Weltpunkte [[x,y,z]…] zoomen, Blickrichtung bleibt */
  fitPoints(pts) {
    const box = new THREE.Box3();
    for (const p of pts) box.expandByPoint(new THREE.Vector3(...p));
    if (box.isEmpty()) return;
    if (box.getSize(new THREE.Vector3()).length() < 1) box.expandByScalar(5);
    this.fit(box, { keepGrid: true });
  }
  fitHits(hits) {
    const box = this.boxOfHits(hits);
    if (box.isEmpty()) return this.fit();
    const size = box.getSize(new THREE.Vector3());
    if (size.length() < 1) box.expandByScalar(5);
    this.fit(box, { keepGrid: true });
  }
  /** Blick senkrecht auf eine Fläche (Weltnormale), Fläche bleibt in der Mitte */
  lookAlongNormal(normal, point) {
    const n = new THREE.Vector3(...normal).normalize();
    const up = Math.abs(n.z) > 0.99 ? [0, n.z > 0 ? 1 : -1, 0] : [0, 0, 1];
    this.setViewDir([-n.x, -n.y, -n.z], up, { target: point });
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
    if (this.hideCube || !this.showCube) return false;
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
  pick(cx, cy, { edges = true, faces = true, vertices = false } = {}) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = cx - rect.left, y = cy - rect.top;
    let faceHit = null;
    if (faces || edges) {
      const rc = this.raycaster(cx, cy);
      const meshes = this.pickables.filter((p) => p.mesh.visible).map((p) => p.mesh);
      const hits = rc.intersectObjects(meshes, false).filter((x) => !this.clipped(x.point));
      if (hits.length) faceHit = hits[0];
    }
    if (edges) {
      let best = null, bd = 7, bestV = null, bdV = 9;
      for (const { pk, scr, ranges } of this.ensureEdgeCache()) {
        if (!pk.lines.visible) continue;
        for (let ei = 0; ei < ranges.length; ei++) {
          const mid = this.clip && pk.lines.userData.edges[ei]?.mid;
          if (mid && this.clipped(new THREE.Vector3(...mid).applyMatrix4(pk.lines.matrixWorld))) continue;
          const [s, c] = ranges[ei];
          if (vertices && c >= 2) {
            // Ecken = Enden offener Kanten (geschlossene Kreise haben keine)
            const pos = pk.lines.geometry.attributes.position.array;
            const closed = Math.hypot(pos[s * 3] - pos[(s + c - 1) * 3], pos[s * 3 + 1] - pos[(s + c - 1) * 3 + 1], pos[s * 3 + 2] - pos[(s + c - 1) * 3 + 2]) < 1e-6;
            if (!closed) for (const [end, k] of [[0, s], [1, s + c - 1]]) {
              const d = Math.hypot(x - scr[k * 2], y - scr[k * 2 + 1]);
              if (d < bdV) { bdV = d; bestV = { pk, ei, end, k }; }
            }
          }
          for (let k = s; k < s + c - 1; k += 2) {
            const d = segDist(x, y, scr[k * 2], scr[k * 2 + 1], scr[(k + 1) * 2], scr[(k + 1) * 2 + 1]);
            if (d < bd) { bd = d; best = { pk, ei }; }
          }
        }
      }
      if (bestV) {
        const { pk, ei, end, k } = bestV;
        const pos = pk.lines.geometry.attributes.position.array;
        const pt = new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]).applyMatrix4(pk.lines.matrixWorld);
        let visible = true;
        if (faceHit) {
          const camDir = new THREE.Vector3();
          this.camera.getWorldDirection(camDir);
          const tol = 2 / this.pixelsPerUnit() + 0.5;
          if (pt.clone().sub(this.camera.position).dot(camDir) > faceHit.point.clone().sub(this.camera.position).dot(camDir) + tol && pk.mesh.material.opacity >= 1) visible = false;
        }
        if (visible) return { kind: "vertex", key: pk.key, body: pk.body, edge: ei, end, info: pk.lines.userData.edges[ei], point: pt.toArray(), group: pk.group };
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
          if (dMid > dHit + tol && best.pk.mesh.material.opacity >= 1 && best.pk.mesh.visible) visible = false;
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

  /**
   * Alle wählbaren Flächen/Kanten sichtbarer Körper (für Fensterauswahl, Alles auswählen, Umkehren).
   * Mit rect: nur die im Fenster (Bildschirm-px relativ zum Container). Verdeckte Elemente zählen mit.
   */
  boxHits({ edges = true, faces = true } = {}, rect = null, crossing = false) {
    const out = [];
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const v = new THREE.Vector3();
    if (edges) {
      for (const { pk, scr, ranges } of this.ensureEdgeCache()) {
        if (!pk.lines.visible) continue;
        for (let ei = 0; ei < ranges.length; ei++) {
          const info = pk.lines.userData.edges[ei];
          if (this.clip && info?.mid && this.clipped(new THREE.Vector3(...info.mid).applyMatrix4(pk.lines.matrixWorld))) continue;
          const [s0, c] = ranges[ei];
          if (rect && !segmentsInBox(scr.subarray(s0 * 2, (s0 + c) * 2), rect, crossing)) continue;
          out.push({ kind: "edge", key: pk.key, body: pk.body, edge: ei, info, group: pk.group });
        }
      }
    }
    if (faces) {
      for (const pk of this.pickables) {
        const mesh = pk.mesh;
        if (!mesh.visible) continue;
        mesh.updateMatrixWorld();
        const pos = mesh.geometry.attributes.position.array, idx = mesh.geometry.index?.array;
        const flist = mesh.userData.faces || [];
        const scrOf = (i) => { v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(mesh.matrixWorld); const world = v.toArray(); v.project(this.camera); return { p: [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h], world }; };
        flist.forEach((f, fi) => {
          const tris = [];
          let point = null;
          for (let k = f.start; k + 2 < f.start + f.count; k += 3) {
            const t = [0, 1, 2].map((d) => scrOf(idx ? idx[k + d] : k + d));
            if (!point) point = t[0].world;
            tris.push(t.map((x) => x.p));
          }
          if (!tris.length) return;
          if (this.clip && f.point && this.clipped(new THREE.Vector3(...f.point))) return;
          if (rect && !trianglesInBox(tris, rect, crossing)) return;
          out.push({ kind: "face", key: pk.key, body: pk.body, face: fi, info: f, point: f.point || point, normal: f.normal || null, group: pk.group, mesh });
        });
      }
    }
    return out;
  }

  clearHover() {
    disposeTree(this.hoverGroup);
    this.hoverGroup.clear();
    this.render();
  }
  /** Hervorhebung (Hover oder Auswahl) eines Pick-Ergebnisses */
  highlight(hits, { color = this.colors.hover, group = this.hoverGroup, opacity = 0.55 } = {}) {
    disposeTree(group);
    group.clear();
    for (const hit of hits) {
      if (!hit) continue;
      const pk = this.pickables.find((p) => p.key === hit.key && p.body === hit.body);
      if (!pk) continue;
      pk.group.updateMatrixWorld();
      if (hit.kind === "vertex") {
        const r = 4 / this.pixelsPerUnit();
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({ color, depthTest: false }));
        m.position.set(...hit.point);
        m.renderOrder = 21;
        group.add(m);
      } else if (hit.kind === "edge") {
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
    this.selectedHits = hits || [];
    if (!this.selGroup) { this.selGroup = new THREE.Group(); this.scene.add(this.selGroup); }
    this.highlight(hits, { group: this.selGroup, color: this.colors.sel, opacity: 0.45 });
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
  /** Bild der Ansicht als PNG-Bytes: scale = Vielfaches der Fenstergröße, background = Farbe oder null (transparent); ohne Raster und Achsen */
  snapshotPng({ scale = 2, background = 0xffffff } = {}) {
    const r = this.renderer;
    const ratio = r.getPixelRatio();
    const helpers = this.helpers.visible;
    const size = r.getSize(new THREE.Vector2());
    scale = Math.min(scale, Math.min(8192, r.capabilities.maxTextureSize || 8192) / Math.max(1, size.x, size.y)); // Zeichenfläche begrenzen
    r.setPixelRatio(scale);
    r.setSize(size.x, size.y, false);
    if (background != null) r.setClearColor(background, 1);
    this.helpers.visible = false;
    try {
      r.render(this.scene, this.camera);
      const url = r.domElement.toDataURL("image/png");
      const bin = atob(url.slice(url.indexOf(",") + 1));
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return { data: out, width: Math.round(size.x * scale), height: Math.round(size.y * scale) };
    } finally {
      this.helpers.visible = helpers;
      r.setClearColor(0x000000, 0);
      r.setPixelRatio(ratio);
      r.setSize(size.x, size.y, false);
      this.needsRender = true;
      r.render(this.scene, this.camera);
    }
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
