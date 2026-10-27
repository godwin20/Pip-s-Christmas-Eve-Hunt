// Companions and surprise actors: the snow puppy, jack-in-the-box, reindeer
// ride, snowball storm, coal buddy, disco tree, runaway gremlin and Santa's
// flyover. Pure presentation: coins and timers live in surprises.js, which
// hears about outcomes through the callbacks passed in here.
//
// Everything is built from shared primitive geometries and cached toon
// materials, then bake() merges the static parts of each model per animated
// pivot (about a third fewer draw calls). Puffs and sparkles run through two
// pooled Points layers (hidden while empty), snowballs are InstancedMeshes,
// and the per-frame update does not allocate.

import * as THREE from 'three';
import { toon, addOutline, PALETTE } from './materials.js';

const TAU = Math.PI * 2;
const HAS_DOM = typeof document !== 'undefined' && typeof document.createElement === 'function';
const FONT = "'Fredoka', 'Comic Sans MS', system-ui, sans-serif";
const INK = '#2a1b3d';
const FESTIVE = [0xffd93d, 0xff6b6b, 0x6bcb77, 0x4d96ff, 0xffffff, 0xc77dff, 0xff8fc7];

const COL = {
  ink: 0x1a1426,
  puppy: 0xfbfdff,
  puppyShade: 0xd2e2f6,
  muzzle: 0xfff4e6,
  cheek: 0xffa6c9,
  tongue: 0xff6f91,
  red: PALETTE.red,
  green: PALETTE.green,
  fur: 0x9c6542,
  furDark: 0x6e4428,
  furLight: 0xf2dcc0,
  antler: 0xead6ad,
  hoof: 0x3b2a22,
  coal: 0x3a3546,
  twig: 0x6b4a2e,
  gremlin: 0x7bd84f,
  gremlinBelly: 0xc6f59c,
  gremlinDark: 0x4f9e36,
  sack: 0xa0703f,
  santaRed: 0xd62839,
  skin: 0xffd6b8,
  cloud: 0xeef2ff,
};

// ------------------------------------------------------------------ maths

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
function angleDelta(a, b) {
  const d = b - a;
  return Math.atan2(Math.sin(d), Math.cos(d));
}
const dampAngle = (a, b, lambda, dt) => a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt));
function easeOutBack(t) {
  t = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
function easeInBack(t) {
  t = clamp01(t);
  const c1 = 1.70158;
  return (c1 + 1) * t * t * t - c1 * t * t;
}
function elasticOut(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;
}
const easeOutCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const hexR = (h) => ((h >> 16) & 255) / 255;
const hexG = (h) => ((h >> 8) & 255) / 255;
const hexB = (h) => (h & 255) / 255;
const pickFestive = () => FESTIVE[Math.floor(Math.random() * FESTIVE.length)];

const _m4 = new THREE.Matrix4();
const _mZero = new THREE.Matrix4().makeScale(0, 0, 0);

// ------------------------------------------------------- shared geometry

const GEO = new Map();
function geo(key, make) {
  let g = GEO.get(key);
  if (!g) {
    g = make();
    GEO.set(key, g);
  }
  return g;
}
const gSphere = () => geo('sphere', () => new THREE.SphereGeometry(1, 20, 14));
const gSphereLo = () => geo('sphereLo', () => new THREE.SphereGeometry(1, 10, 8));
const gBox = () => geo('box', () => new THREE.BoxGeometry(1, 1, 1));
const gCyl = () => geo('cyl', () => new THREE.CylinderGeometry(1, 1, 1, 12));
const gCone = () => geo('cone', () => new THREE.ConeGeometry(1, 1, 16));
const gTorus = () => geo('torus', () => new THREE.TorusGeometry(1, 0.2, 8, 24));
const gSmile = () => geo('smile', () => new THREE.TorusGeometry(1, 0.2, 6, 16, Math.PI));
const gDisc = () => geo('disc', () => new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2));
const gCoal = () => geo('coal', () => lumpy(new THREE.IcosahedronGeometry(1, 1), 0.16));
const gMirror = () => geo('mirror', makeMirrorBallGeometry);
const gBeam = () => geo('beam', () => new THREE.ConeGeometry(1.5, 7.5, 20, 1, true).translate(0, -3.75, 0));

// Jitters a polyhedron into a cartoon rock. Offsets are hashed from the
// (rounded) vertex position, so duplicated face corners move together. The
// geometry is non-indexed, so computeVertexNormals() gives crisp flat facets.
function lumpy(g, amount) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const h = Math.sin(Math.round(x * 1000) * 12.9898 + Math.round(y * 1000) * 78.233 + Math.round(z * 1000) * 37.719) * 43758.5453;
    const k = 1 + (h - Math.floor(h) - 0.5) * 2 * amount;
    p.setXYZ(i, x * k, y * k * 0.85, z * k);
  }
  g.computeVertexNormals();
  return g;
}

// Faceted mirror ball: per-face greys with a few pink / cyan / white tiles.
function makeMirrorBallGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  let seed = 1234567;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let f = 0; f < n; f += 3) {
    const r = rand();
    let cr;
    let cg;
    let cb;
    if (r < 0.1) [cr, cg, cb] = [1, 0.7, 0.95];
    else if (r < 0.2) [cr, cg, cb] = [0.65, 0.95, 1];
    else if (r < 0.32) [cr, cg, cb] = [1, 1, 1];
    else {
      const v = 0.45 + rand() * 0.4;
      [cr, cg, cb] = [v, v, v + 0.06];
    }
    for (let k = 0; k < 3; k++) {
      colors[(f + k) * 3] = cr;
      colors[(f + k) * 3 + 1] = cg;
      colors[(f + k) * 3 + 2] = cb;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

// ------------------------------------------------------ shared materials

const MATS = new Map();
function shared(key, make) {
  let m = MATS.get(key);
  if (!m) {
    m = make();
    MATS.set(key, m);
  }
  return m;
}
const mHighlight = () => toon(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.9 });
const mNose = () => toon(0xff3048, { emissive: 0xff1030, emissiveIntensity: 0.9 });
const mGold = () => toon(PALETTE.gold, { emissive: 0x6b4800, emissiveIntensity: 0.35 });
const mInk = () => toon(COL.ink);
const mGlow = (hex) =>
  shared('glow' + hex, () => {
    return new THREE.SpriteMaterial({
      map: softTexture(),
      color: hex,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
  });
const mStar = (hex) =>
  shared('star' + hex, () => {
    return new THREE.SpriteMaterial({
      map: starTexture(),
      color: hex,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
  });
const mMirror = () =>
  shared('mirror', () => {
    return new THREE.MeshPhongMaterial({
      vertexColors: true,
      flatShading: true,
      shininess: 110,
      specular: 0xffffff,
      emissive: 0x2a2a3a,
    });
  });

// --------------------------------------------------------------- textures

let _white = null;
function whiteTexture() {
  if (!_white) {
    _white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    _white.needsUpdate = true;
  }
  return _white;
}

function makeCanvas(w, h) {
  if (!HAS_DOM) return null;
  try {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c.getContext('2d') ? c : null;
  } catch {
    return null;
  }
}

function canvasTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let _soft = null;
function softTexture() {
  if (_soft) return _soft;
  const c = makeCanvas(64, 64);
  if (!c) return (_soft = whiteTexture());
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  grd.addColorStop(0.7, 'rgba(255,255,255,0.25)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return (_soft = canvasTexture(c));
}

let _star = null;
function starTexture() {
  if (_star) return _star;
  const c = makeCanvas(64, 64);
  if (!c) return (_star = whiteTexture());
  const g = c.getContext('2d');
  g.translate(32, 32);
  const glow = g.createRadialGradient(0, 0, 0, 0, 0, 30);
  glow.addColorStop(0, 'rgba(255,255,255,0.9)');
  glow.addColorStop(0.3, 'rgba(255,255,255,0.25)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(-32, -32, 64, 64);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(0, -30);
  g.quadraticCurveTo(4, -4, 30, 0);
  g.quadraticCurveTo(4, 4, 0, 30);
  g.quadraticCurveTo(-4, 4, -30, 0);
  g.quadraticCurveTo(-4, -4, 0, -30);
  g.fill();
  return (_star = canvasTexture(c));
}

let _beam = null;
function beamTexture() {
  if (_beam) return _beam;
  const c = makeCanvas(8, 128);
  if (!c) return (_beam = whiteTexture());
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 8, 128);
  return (_beam = canvasTexture(c));
}

// Comic speech bubble with a tail at the bottom-left. Returns
// { texture, tipU, tipV } so a sprite's centre can sit on the tail tip.
function drawBubble(lines, w, h, fontPx) {
  const c = makeCanvas(w, h);
  if (!c) return { texture: whiteTexture(), tipU: 0.5, tipV: 0, shared: true };
  const g = c.getContext('2d');
  const pad = 12;
  const tailH = Math.round(h * 0.2);
  const bx = pad;
  const by = pad;
  const bw = w - pad * 2;
  const bh = h - pad * 2 - tailH;
  const r = Math.min(bh * 0.45, 60);
  const tx = Math.round(w * 0.32);
  g.lineJoin = 'round';
  g.shadowColor = 'rgba(20,10,40,0.28)';
  g.shadowOffsetY = 5;
  g.shadowBlur = 6;
  g.beginPath();
  g.moveTo(bx + r, by);
  g.lineTo(bx + bw - r, by);
  g.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
  g.lineTo(bx + bw, by + bh - r);
  g.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
  g.lineTo(tx + 30, by + bh);
  g.lineTo(tx - 14, by + bh + tailH);
  g.lineTo(tx - 6, by + bh);
  g.lineTo(bx + r, by + bh);
  g.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
  g.lineTo(bx, by + r);
  g.quadraticCurveTo(bx, by, bx + r, by);
  g.closePath();
  g.fillStyle = '#ffffff';
  g.fill();
  g.shadowColor = 'transparent';
  g.lineWidth = 8;
  g.strokeStyle = INK;
  g.stroke();

  g.fillStyle = INK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = fontPx;
  g.font = `700 ${size}px ${FONT}`;
  const widest = () => Math.max(...lines.map((l) => g.measureText(l).width));
  while (size > 16 && widest() > bw - 36) {
    size -= 4;
    g.font = `700 ${size}px ${FONT}`;
  }
  const lh = size * 1.08;
  const y0 = by + bh / 2 - ((lines.length - 1) * lh) / 2 + 2;
  lines.forEach((l, i) => g.fillText(l, w / 2, y0 + i * lh));
  return { texture: canvasTexture(c), tipU: (tx - 14) / w, tipV: pad / h };
}

const bubbleMats = new Map();
function bubbleMaterial(key, lines, w, h, fontPx) {
  let entry = bubbleMats.get(key);
  if (!entry) {
    const b = drawBubble(lines, w, h, fontPx);
    const mat = new THREE.SpriteMaterial({
      map: b.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    entry = { mat, tipU: b.tipU, tipV: b.tipV };
    bubbleMats.set(key, entry);
  }
  return entry;
}

function drawCountdown(c, n) {
  const g = c.getContext('2d');
  const w = c.width;
  const h = c.height;
  g.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h - 118;
  const R = 92;
  // label
  g.lineJoin = 'round';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 44px ${FONT}`;
  g.lineWidth = 10;
  g.strokeStyle = INK;
  g.strokeText('CATCH ME!', cx, 30);
  g.fillStyle = '#ffd93d';
  g.fillText('CATCH ME!', cx, 30);
  // stopwatch knob
  g.fillStyle = '#ffc94a';
  g.lineWidth = 9;
  g.beginPath();
  g.rect(cx - 20, cy - R - 26, 40, 30);
  g.fill();
  g.stroke();
  // face
  g.beginPath();
  g.arc(cx, cy, R, 0, TAU);
  g.fillStyle = n <= 3 ? '#e63946' : n <= 6 ? '#ff9f1c' : '#2a9d6f';
  g.fill();
  g.lineWidth = 10;
  g.stroke();
  g.beginPath();
  g.arc(cx, cy, R - 17, 0, TAU);
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineWidth = 6;
  g.stroke();
  // number
  g.font = `700 112px ${FONT}`;
  g.lineWidth = 14;
  g.strokeStyle = INK;
  g.strokeText(String(n), cx, cy + 6);
  g.fillStyle = '#ffffff';
  g.fillText(String(n), cx, cy + 6);
}

// --------------------------------------------------------- mesh helpers

function part(parent, geometry, material, x, y, z, sx, sy = sx, sz = sx, shadow = false) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  if (shadow) m.castShadow = true;
  parent.add(m);
  return m;
}

function pivot(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// Big glossy cartoon eyes with two highlights each. Returns [left, right].
function cuteEyes(parent, x, y, z, r, highlights = true) {
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = part(parent, gSphere(), mInk(), s * x, y, z, r, r * 1.2, r * 0.8);
    e.rotation.y = s * 0.35;
    if (highlights) {
      part(e, gSphereLo(), mHighlight(), 0.35, 0.38, 0.78, 0.34);
      part(e, gSphereLo(), mHighlight(), -0.28, -0.36, 0.86, 0.16);
    }
    eyes.push(e);
  }
  return eyes;
}

// A smile (lower half of a torus) tilted to hug a round face.
function smileArc(parent, material, x, y, z, s, tilt = 0.45) {
  const m = part(parent, gSmile(), material, x, y, z, s, s, s);
  m.rotation.set(tilt, 0, Math.PI);
  return m;
}

function removeObj(o) {
  if (o && o.parent) o.parent.remove(o);
}

// Removes a model and frees the per-instance geometry bake() made for it.
function removeModel(o) {
  if (!o) return;
  removeObj(o);
  o.traverse((c) => {
    if (c.userData && c.userData.baked && c.geometry) c.geometry.dispose();
  });
}

// ------------------------------------------------------- static baking
// Models are built from dozens of primitives, but only a handful of pivots
// (the ones a build function returns) ever move. bake() merges every other
// mesh into one mesh per animated pivot and material bucket: plain toon parts
// share one vertex-coloured toon material, anything else (emissive, outline
// hulls, phong) merges with parts of the identical material. Shadow casting
// is kept per bucket. Typically cuts a model's draw calls by half or more.

const _relM = new THREE.Matrix4();
const _invM = new THREE.Matrix4();
const _nrmM = new THREE.Matrix3();
const _bv = new THREE.Vector3();

function vcBakeable(m) {
  return (
    !!m &&
    m.isMeshToonMaterial === true &&
    !m.vertexColors &&
    !m.map &&
    !m.transparent &&
    m.opacity === 1 &&
    m.side === THREE.FrontSide &&
    (!m.emissive || m.emissive.getHex() === 0 || m.emissiveIntensity === 0)
  );
}

function collectRefs(value, out, depth = 0) {
  if (!value || depth > 4) return;
  if (value.isObject3D) {
    out.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectRefs(v, out, depth + 1);
    return;
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const k of Object.keys(value)) collectRefs(value[k], out, depth + 1);
  }
}

function mergeEntries(entries, withColor) {
  let vCount = 0;
  let iCount = 0;
  for (const e of entries) {
    const g = e.mesh.geometry;
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const col = withColor ? new Float32Array(vCount * 3) : null;
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let vo = 0;
  let io = 0;
  for (const e of entries) {
    const g = e.mesh.geometry;
    const P = g.attributes.position;
    const N = g.attributes.normal;
    _nrmM.getNormalMatrix(e.matrix);
    const c = withColor ? e.mesh.material.color : null;
    for (let i = 0; i < P.count; i++) {
      const o = (vo + i) * 3;
      _bv.fromBufferAttribute(P, i).applyMatrix4(e.matrix);
      pos[o] = _bv.x;
      pos[o + 1] = _bv.y;
      pos[o + 2] = _bv.z;
      if (N) _bv.fromBufferAttribute(N, i).applyMatrix3(_nrmM).normalize();
      else _bv.set(0, 1, 0);
      nor[o] = _bv.x;
      nor[o + 1] = _bv.y;
      nor[o + 2] = _bv.z;
      if (col) {
        col[o] = c.r; // linear working-space colour, as the material used
        col[o + 1] = c.g;
        col[o + 2] = c.b;
      }
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo;
    else for (let i = 0; i < P.count; i++) idx[io++] = vo + i;
    vo += P.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

function bake(parts) {
  const model = parts && parts.group;
  if (!model || !model.isObject3D) return parts;
  const keep = new Set();
  collectRefs(parts, keep);
  model.updateMatrixWorld(true);

  const anchorOf = (o) => {
    let p = o.parent;
    while (p && !keep.has(p) && p !== model) p = p.parent;
    return p || model;
  };
  // a hidden static group between a mesh and its anchor must stay in charge
  const hiddenBetween = (o, anchor) => {
    for (let p = o.parent; p && p !== anchor; p = p.parent) if (!p.visible) return true;
    return false;
  };
  // an animated node must keep its parent, so its mesh ancestors stay put
  const holdsKept = (o) => {
    let found = false;
    o.traverse((c) => {
      if (c !== o && keep.has(c)) found = true;
    });
    return found;
  };
  const buckets = new Map(); // anchor -> [{ vc, material, castShadow, receiveShadow, entries }]
  model.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || keep.has(o) || !o.visible || holdsKept(o)) return;
    const g = o.geometry;
    if (!g || !g.attributes.position || g.morphAttributes.position || Array.isArray(o.material)) return;
    if (g.groups && g.groups.length > 1) return;
    // only pivots the build function returned ever move, so everything in
    // between is static relative to the anchor
    const anchor = anchorOf(o);
    if (hiddenBetween(o, anchor)) return;
    _invM.copy(anchor.matrixWorld).invert();
    _relM.multiplyMatrices(_invM, o.matrixWorld);
    if (!(_relM.determinant() > 0)) return; // mirrored / degenerate: leave it alone
    const vc = vcBakeable(o.material);
    const material = vc ? null : o.material;
    let lists = buckets.get(anchor);
    if (!lists) buckets.set(anchor, (lists = []));
    let list = lists.find((l) => l.vc === vc && l.material === material && l.castShadow === o.castShadow && l.receiveShadow === o.receiveShadow);
    if (!list) lists.push((list = { vc, material, castShadow: o.castShadow, receiveShadow: o.receiveShadow, entries: [] }));
    list.entries.push({ mesh: o, matrix: _relM.clone() });
  });

  const merged = new Set();
  for (const [anchor, lists] of buckets) {
    for (const list of lists) {
      if (list.entries.length < 2) continue;
      const geom = mergeEntries(list.entries, list.vc);
      const mat = list.vc ? toon(0xffffff, { vertexColors: true }) : list.material;
      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = list.castShadow;
      mesh.receiveShadow = list.receiveShadow;
      mesh.userData.baked = true;
      anchor.add(mesh);
      for (const e of list.entries) merged.add(e.mesh);
    }
  }
  if (!merged.size) return parts;
  // Detach the originals; a merged mesh's own unmerged children (an outline
  // hull left alone in its bucket) are re-homed onto the anchor, keeping
  // their world transform.
  for (const m of merged) {
    const parent = m.parent;
    if (!parent) continue;
    for (const child of [...m.children]) {
      if (merged.has(child)) continue;
      const anchor = anchorOf(child);
      anchor.attach(child);
    }
    parent.remove(m);
  }
  // prune static groups that are now empty (deepest first, collected before
  // removing so traverse never sees its child list change)
  const nodes = [];
  model.traverse((o) => nodes.push(o));
  for (let i = nodes.length - 1; i >= 0; i--) {
    const o = nodes[i];
    if (o === model || keep.has(o) || o.children.length || o.isMesh || o.isSprite || o.isPoints) continue;
    if (o.parent) o.parent.remove(o);
  }
  return parts;
}

// World-space top of a tree: its star if it has one, else the highest mesh
// (glow sprites are skipped, they are much bigger than the tree itself).
function treeTop(tree, baseY) {
  const star = tree.userData && tree.userData.star;
  if (star && star.isObject3D) {
    const p = new THREE.Vector3();
    star.getWorldPosition(p);
    if (Number.isFinite(p.y)) return p.y + 0.5;
  }
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  tree.traverse((o) => {
    if (!o.isMesh || o.isSprite || o.userData.isOutline || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(tmp);
  });
  if (!box.isEmpty() && Number.isFinite(box.max.y) && box.max.y > baseY) return box.max.y;
  const h = tree.userData && Number(tree.userData.height);
  return baseY + (Number.isFinite(h) && h > 0 ? h * tree.scale.y : 5);
}

// ----------------------------------------------------- particle layers
// One Points draw call per layer, per-particle size and alpha. Swap-remove
// keeps the live particles packed at the front so drawRange stays tight.

const PARTICLE_VS = /* glsl */ `
attribute vec4 pcolor;
attribute float psize;
uniform float uScale;
varying vec4 vColor;
void main() {
  vColor = pcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = psize * uScale / max(0.05, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const PARTICLE_FS = /* glsl */ `
uniform sampler2D map;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  float a = vColor.a * t.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor.rgb * t.rgb, a);
}`;

function createParticleLayer(capacity, texture, additive) {
  const pos = new Float32Array(capacity * 3);
  const col = new Float32Array(capacity * 4);
  const siz = new Float32Array(capacity);
  const vel = new Float32Array(capacity * 3);
  const rgb = new Float32Array(capacity * 3);
  const age = new Float32Array(capacity);
  const life = new Float32Array(capacity);
  const s0 = new Float32Array(capacity);
  const s1 = new Float32Array(capacity);
  const a0 = new Float32Array(capacity);
  const grav = new Float32Array(capacity);
  const drag = new Float32Array(capacity);

  const geom = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
  const aSiz = new THREE.BufferAttribute(siz, 1).setUsage(THREE.DynamicDrawUsage);
  geom.setAttribute('position', aPos);
  geom.setAttribute('pcolor', aCol);
  geom.setAttribute('psize', aSiz);
  geom.setDrawRange(0, 0);
  geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const material = new THREE.ShaderMaterial({
    uniforms: { map: { value: texture }, uScale: { value: 600 } },
    vertexShader: PARTICLE_VS,
    fragmentShader: PARTICLE_FS,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geom, material);
  points.frustumCulled = false;
  points.visible = false;
  points.renderOrder = additive ? 7 : 6;
  points.name = additive ? 'companionSparks' : 'companionPuffs';

  let count = 0;
  let dirty = false;

  function emit(x, y, z, vx, vy, vz, lifeS, size0, size1, hex, alpha = 1, gravity = 0, dragK = 0) {
    let i = count;
    if (i >= capacity) i = Math.floor(Math.random() * capacity);
    else count++;
    const i3 = i * 3;
    pos[i3] = x;
    pos[i3 + 1] = y;
    pos[i3 + 2] = z;
    vel[i3] = vx;
    vel[i3 + 1] = vy;
    vel[i3 + 2] = vz;
    rgb[i3] = hexR(hex);
    rgb[i3 + 1] = hexG(hex);
    rgb[i3 + 2] = hexB(hex);
    age[i] = 0;
    life[i] = Math.max(0.05, lifeS);
    s0[i] = size0;
    s1[i] = size1;
    a0[i] = alpha;
    grav[i] = gravity;
    drag[i] = dragK;
    siz[i] = size0;
    col[i * 4 + 3] = 0;
  }

  function move(d, s) {
    const d3 = d * 3;
    const s3 = s * 3;
    for (let k = 0; k < 3; k++) {
      pos[d3 + k] = pos[s3 + k];
      vel[d3 + k] = vel[s3 + k];
      rgb[d3 + k] = rgb[s3 + k];
    }
    age[d] = age[s];
    life[d] = life[s];
    s0[d] = s0[s];
    s1[d] = s1[s];
    a0[d] = a0[s];
    grav[d] = grav[s];
    drag[d] = drag[s];
  }

  function update(dt) {
    let i = 0;
    while (i < count) {
      age[i] += dt;
      if (age[i] >= life[i]) {
        count--;
        if (i !== count) move(i, count);
        continue;
      }
      const i3 = i * 3;
      const dk = drag[i] > 0 ? Math.exp(-drag[i] * dt) : 1;
      vel[i3] *= dk;
      vel[i3 + 1] = vel[i3 + 1] * dk + grav[i] * dt;
      vel[i3 + 2] *= dk;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      const k = age[i] / life[i];
      const e = 1 - (1 - k) * (1 - k);
      siz[i] = s0[i] + (s1[i] - s0[i]) * e;
      const fade = k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88;
      const i4 = i * 4;
      col[i4] = rgb[i3];
      col[i4 + 1] = rgb[i3 + 1];
      col[i4 + 2] = rgb[i3 + 2];
      col[i4 + 3] = a0[i] * fade;
      i++;
    }
    geom.setDrawRange(0, count);
    // three still issues a (zero-length) draw call for an empty drawRange,
    // so hide the layer while nothing is alive.
    points.visible = count > 0;
    if (count > 0 || dirty) {
      aPos.needsUpdate = true;
      aCol.needsUpdate = true;
      aSiz.needsUpdate = true;
      dirty = count > 0;
    }
  }

  function reset() {
    count = 0;
    dirty = true;
    geom.setDrawRange(0, 0);
    points.visible = false;
  }

  return {
    points,
    material,
    emit,
    update,
    reset,
    get count() {
      return count;
    },
    dispose() {
      geom.dispose();
      material.dispose();
    },
  };
}

// =================================================================== models
// Every model is built facing +Z with its base at y = 0.

function buildPuppy() {
  const group = new THREE.Group();
  group.name = 'snowPuppy';
  const body = pivot(group);
  const fur = toon(COL.puppy);
  const shade = toon(COL.puppyShade);

  const torso = part(body, gSphere(), fur, 0, 0.33, -0.03, 0.26, 0.24, 0.32, true);
  addOutline(torso, 0.07);
  part(body, gSphere(), fur, 0, 0.36, 0.17, 0.17, 0.17, 0.12); // fluffy chest
  part(body, gSphere(), shade, 0.06, 0.52, -0.1, 0.13, 0.06, 0.15); // cute back patch

  const legs = [];
  for (const [x, z] of [
    [-0.13, 0.15],
    [0.13, 0.15],
    [-0.14, -0.2],
    [0.14, -0.2],
  ]) {
    const leg = pivot(body, x, 0.2, z);
    part(leg, gSphere(), fur, 0, -0.1, 0.01, 0.075, 0.11, 0.085);
    legs.push(leg);
  }

  const collar = part(body, gTorus(), toon(COL.red), 0, 0.5, 0.13, 0.15, 0.15, 0.15);
  collar.rotation.x = Math.PI / 2 - 0.45;
  const bell = part(body, gSphere(), mGold(), 0, 0.41, 0.28, 0.055);
  part(bell, gSphereLo(), mInk(), 0, -0.55, 0.55, 0.28);

  const head = pivot(body, 0, 0.56, 0.2);
  const skull = part(head, gSphere(), fur, 0, 0.13, 0.03, 0.25, 0.225, 0.23, true);
  addOutline(skull, 0.07);
  part(head, gSphere(), toon(COL.muzzle), 0, 0.05, 0.22, 0.13, 0.095, 0.11);
  part(head, gSphere(), mInk(), 0, 0.11, 0.325, 0.05, 0.038, 0.035);
  part(head, gSphereLo(), mHighlight(), 0.016, 0.127, 0.354, 0.014);
  const eyes = cuteEyes(head, 0.095, 0.18, 0.205, 0.052);
  for (const s of [-1, 1]) {
    const ch = part(head, gSphere(), toon(COL.cheek), s * 0.16, 0.08, 0.17, 0.05, 0.03, 0.02);
    ch.rotation.y = s * 0.7;
  }
  const tongue = part(head, gSphere(), toon(COL.tongue), 0, -0.02, 0.27, 0.045, 0.02, 0.055);
  tongue.visible = false;

  const ears = [];
  for (const s of [-1, 1]) {
    const ear = pivot(head, s * 0.16, 0.3, 0);
    ear.rotation.z = s * 0.6;
    part(ear, gSphere(), shade, 0, -0.11, 0, 0.07, 0.14, 0.1);
    ears.push(ear);
  }

  const tail = pivot(body, 0, 0.42, -0.33);
  tail.rotation.x = -0.5;
  part(tail, gSphere(), fur, 0, 0.08, -0.03, 0.065, 0.11, 0.065);
  part(tail, gSphere(), fur, 0, 0.18, -0.04, 0.07);

  const woof = bubbleMaterial('woof', ['Woof!'], 256, 150, 70);
  const bubble = new THREE.Sprite(woof.mat);
  bubble.center.set(woof.tipU, woof.tipV);
  bubble.position.set(0.12, 0.95, 0);
  bubble.renderOrder = 25;
  bubble.visible = false;
  group.add(bubble);

  return bake({ group, body, head, ears, tail, legs, eyes, tongue, bubble });
}

function buildReindeer({ detail = true, saddle = false, baked = true } = {}) {
  const group = new THREE.Group();
  group.name = 'reindeer';
  const body = pivot(group);
  const fur = toon(COL.fur);
  const light = toon(COL.furLight);
  const antler = toon(COL.antler);

  const torso = part(body, gSphere(), fur, 0, 0.64, 0, 0.34, 0.3, 0.6, true);
  if (detail) {
    addOutline(torso, 0.05);
    part(body, gSphere(), light, 0, 0.56, 0.06, 0.27, 0.2, 0.48);
  }
  const neck = part(body, gSphere(), fur, 0, 0.9, 0.5, 0.15, 0.3, 0.15, detail);
  neck.rotation.x = 0.55;
  if (detail) {
    const fluff = part(body, gSphere(), light, 0, 0.86, 0.6, 0.1, 0.22, 0.08);
    fluff.rotation.x = 0.55;
  }

  const head = pivot(body, 0, 1.2, 0.8);
  const skull = part(head, gSphere(), fur, 0, 0, 0, 0.2, 0.19, 0.24, detail);
  if (detail) addOutline(skull, 0.05);
  part(head, gSphere(), light, 0, -0.06, 0.2, 0.13, 0.11, 0.13);
  part(head, gSphere(), mNose(), 0, -0.03, 0.34, 0.075);
  const glow = new THREE.Sprite(mGlow(0xff4058));
  glow.position.set(0, -0.03, 0.37);
  glow.scale.setScalar(0.55);
  head.add(glow);
  cuteEyes(head, 0.09, 0.06, 0.17, 0.045, detail);

  const ears = [];
  for (const s of [-1, 1]) {
    const ear = pivot(head, s * 0.17, 0.08, -0.06);
    ear.rotation.z = -s * 1.1;
    part(ear, gSphere(), fur, 0, 0.1, 0, 0.045, 0.11, 0.03);
    ears.push(ear);
  }
  for (const s of [-1, 1]) {
    const a = pivot(head, s * 0.09, 0.15, -0.06);
    a.rotation.set(-0.25, 0, -s * 0.4);
    part(a, gCyl(), antler, 0, 0.17, 0, 0.026, 0.34, 0.026);
    const b = pivot(a, 0, 0.17, 0);
    b.rotation.z = -s * 0.9;
    part(b, gCyl(), antler, 0, 0.09, 0, 0.022, 0.18, 0.022);
    if (detail) {
      const c = pivot(a, 0, 0.26, 0);
      c.rotation.x = 0.8;
      part(c, gCyl(), antler, 0, 0.07, 0, 0.02, 0.14, 0.02);
      part(a, gSphereLo(), antler, 0, 0.34, 0, 0.032);
    }
  }

  const legs = [];
  for (const [x, z] of [
    [-0.18, 0.36],
    [0.18, 0.36],
    [-0.18, -0.36],
    [0.18, -0.36],
  ]) {
    const leg = pivot(body, x, 0.5, z);
    part(leg, gCyl(), fur, 0, -0.22, 0, 0.06, 0.46, 0.06, detail);
    if (detail) part(leg, gSphere(), toon(COL.hoof), 0, -0.46, 0.015, 0.072, 0.05, 0.085);
    legs.push(leg);
  }

  const tail = pivot(body, 0, 0.78, -0.56);
  part(tail, gSphere(), toon(0xffffff), 0, 0.03, -0.04, 0.07, 0.09, 0.06);

  if (detail) {
    const collar = part(body, gTorus(), toon(COL.red), 0, 0.86, 0.47, 0.16, 0.16, 0.16);
    collar.rotation.x = Math.PI / 2 - 0.55;
    part(body, gSphere(), mGold(), 0, 0.75, 0.6, 0.055);
  }
  if (saddle) {
    part(body, gBox(), toon(COL.red), 0, 0.93, -0.02, 0.6, 0.05, 0.58);
    part(body, gBox(), mGold(), 0, 0.915, -0.02, 0.64, 0.035, 0.62);
    for (const s of [-1, 1]) part(body, gSphere(), mGold(), s * 0.33, 0.86, -0.02, 0.045);
  }

  // eyes never animate, so they are left out and bake into the head
  const parts = { group, body, head, legs, tail, ears, glow };
  return baked ? bake(parts) : parts;
}

function buildJack() {
  const group = new THREE.Group();
  group.name = 'jackInTheBox';
  const box = pivot(group);
  const red = toon(0xe63946);
  const white = toon(0xffffff);
  const gold = mGold();

  const cube = part(box, gBox(), red, 0, 0.4, 0, 0.8, 0.8, 0.8, true);
  addOutline(cube, 0.05);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(box, gCyl(), gold, sx * 0.4, 0.4, sz * 0.4, 0.045, 0.82, 0.045);
  // a gold star-button and white dots on each side
  for (const k of [0, 1, 3]) {
    const side = pivot(box, 0, 0, 0);
    side.rotation.y = (k * Math.PI) / 2;
    part(side, gSphere(), gold, 0, 0.42, 0.405, 0.15, 0.15, 0.03);
    part(side, gSphereLo(), toon(0x4d96ff), 0, 0.42, 0.43, 0.06, 0.06, 0.02);
    for (const [dx, dy] of [
      [-0.25, 0.66],
      [0.25, 0.66],
      [-0.25, 0.16],
      [0.25, 0.16],
    ]) {
      part(side, gSphereLo(), white, dx, dy, 0.402, 0.05, 0.05, 0.015);
    }
  }
  const lidPivot = pivot(box, 0, 0.8, -0.4);
  part(lidPivot, gBox(), toon(0x2a9d6f), 0, 0.04, 0.4, 0.86, 0.08, 0.86, true);
  part(lidPivot, gSphere(), gold, 0, 0.1, 0.4, 0.08);

  const crank = pivot(box, 0.42, 0.45, 0);
  const axle = part(crank, gCyl(), gold, 0.06, 0, 0, 0.03, 0.12, 0.03);
  axle.rotation.z = Math.PI / 2;
  part(crank, gBox(), gold, 0.12, 0.08, 0, 0.03, 0.18, 0.03);
  part(crank, gSphere(), toon(0xe63946), 0.12, 0.17, 0, 0.045);

  const rings = [];
  const silver = toon(0xdfe6f2, { emissive: 0x30343c, emissiveIntensity: 0.4 });
  for (let i = 0; i < 7; i++) {
    const r = part(group, gTorus(), silver, 0, 0.8, 0, 0.15);
    r.rotation.x = Math.PI / 2;
    r.visible = false;
    rings.push(r);
  }

  const head = pivot(group, 0, 1.1, 0);
  head.visible = false;
  const face = part(head, gSphere(), toon(0xfff1e3), 0, 0, 0, 0.3, 0.3, 0.29, true);
  addOutline(face, 0.05);
  part(head, gSphere(), toon(0xff2a3a, { emissive: 0x550008, emissiveIntensity: 0.6 }), 0, -0.01, 0.3, 0.08);
  const eyes = [];
  for (const s of [-1, 1]) {
    const eye = pivot(head, s * 0.11, 0.08, 0.24);
    part(eye, gSphere(), white, 0, 0, 0, 0.075, 0.085, 0.05);
    part(eye, gSphere(), mInk(), 0, 0, 0.04, 0.04, 0.045, 0.025);
    part(eye, gSphereLo(), mHighlight(), 0.013, 0.018, 0.062, 0.012);
    eyes.push(eye);
  }
  smileArc(head, toon(0xe63946), 0, -0.09, 0.26, 0.13, 0.5);
  for (const s of [-1, 1]) {
    const ch = part(head, gSphere(), toon(0xff9ec0), s * 0.19, -0.05, 0.22, 0.06, 0.045, 0.03);
    ch.rotation.y = s * 0.7;
  }
  const hair = toon(0xff8a2a);
  for (const s of [-1, 1]) {
    part(head, gSphere(), hair, s * 0.28, 0.1, -0.03, 0.11, 0.14, 0.11);
    part(head, gSphere(), hair, s * 0.25, -0.07, -0.05, 0.09);
  }
  const hat = pivot(head, 0, 0.24, 0);
  hat.rotation.z = 0.25;
  part(hat, gCone(), toon(0x8e5bd6), 0, 0.17, 0, 0.16, 0.38, 0.16);
  part(hat, gSphere(), toon(0xffd93d), 0, 0.38, 0, 0.07);
  // frilly ruff: a fat red ring with a white one stacked on top
  const ruff = part(head, gTorus(), red, 0, -0.3, 0, 0.22, 0.22, 0.4);
  ruff.rotation.x = Math.PI / 2;
  const ruff2 = part(head, gTorus(), white, 0, -0.25, 0, 0.17, 0.17, 0.35);
  ruff2.rotation.x = Math.PI / 2;

  return bake({ group, box, lidPivot, crank, rings, head, eyes });
}

function buildCoal() {
  const group = new THREE.Group();
  group.name = 'coalBuddy';
  const body = pivot(group);
  const lump = part(body, gCoal(), toon(COL.coal), 0, 0.36, 0, 0.42, 0.4, 0.4, true);
  addOutline(lump, 0.05);
  const glint = toon(0x9fb4ff, { emissive: 0x5060a0, emissiveIntensity: 0.6 });
  part(body, gSphereLo(), glint, -0.27, 0.55, 0.12, 0.025);
  part(body, gSphereLo(), glint, 0.3, 0.25, 0.15, 0.02);

  const eyes = [];
  for (const s of [-1, 1]) {
    const ex = s * 0.14;
    const ey = 0.5;
    const ez = 0.3;
    part(body, gSphere(), toon(0xffffff), ex, ey, ez, 0.13, 0.13, 0.1);
    const pupil = part(body, gSphere(), mInk(), ex, ey - 0.03, ez + 0.086, 0.062, 0.062, 0.03);
    eyes.push({ pupil, x: ex, y: ey, z: ez + 0.086, ox: 0, oy: -0.03, vx: 0, vy: 0 });
  }
  smileArc(body, toon(0xff7aa2), 0, 0.3, 0.37, 0.09, 0.4);
  for (const s of [-1, 1]) {
    const ch = part(body, gSphere(), toon(0xff9ec0), s * 0.25, 0.36, 0.29, 0.05, 0.03, 0.02);
    ch.rotation.y = s * 0.7;
  }

  const twig = toon(COL.twig);
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = pivot(body, s * 0.36, 0.36, 0.04);
    const stick = part(arm, gCyl(), twig, s * 0.15, 0, 0, 0.022, 0.3, 0.022);
    stick.rotation.z = Math.PI / 2;
    const f1 = part(arm, gCyl(), twig, s * 0.3, 0.05, 0, 0.016, 0.12, 0.016);
    f1.rotation.z = -s * 0.5;
    const f2 = part(arm, gCyl(), twig, s * 0.31, -0.03, 0, 0.016, 0.1, 0.016);
    f2.rotation.z = -s * 2.2;
    arms.push(arm);
  }

  const hat = pivot(body, 0.05, 0.66, -0.02);
  hat.rotation.z = -0.3;
  part(hat, gCone(), toon(COL.red), 0, 0.17, 0, 0.19, 0.36, 0.19);
  const brim = part(hat, gTorus(), toon(0xffffff), 0, 0, 0, 0.19);
  brim.rotation.x = Math.PI / 2;
  part(hat, gSphere(), toon(0xffffff), 0, 0.36, 0, 0.065);

  const b = bubbleMaterial('coal', ['Merry Christmas', 'anyway!'], 512, 256, 62);
  const bubble = new THREE.Sprite(b.mat);
  bubble.center.set(b.tipU, b.tipV);
  bubble.position.set(0.15, 0.9, 0);
  bubble.renderOrder = 25;
  bubble.scale.set(0.001, 0.001, 1);
  group.add(bubble);

  return bake({ group, body, eyes, arms, bubble });
}

function buildGremlin() {
  const group = new THREE.Group();
  group.name = 'gremlin';
  const body = pivot(group);
  const green = toon(COL.gremlin);
  const dark = toon(COL.gremlinDark);

  const torso = part(body, gSphere(), green, 0, 0.42, 0, 0.26, 0.28, 0.24, true);
  addOutline(torso, 0.06);
  part(body, gSphere(), toon(COL.gremlinBelly), 0, 0.38, 0.12, 0.18, 0.2, 0.14);

  const head = pivot(body, 0, 0.78, 0.03);
  const skull = part(head, gSphere(), green, 0, 0.08, 0, 0.3, 0.26, 0.27, true);
  addOutline(skull, 0.06);
  const ears = [];
  for (const s of [-1, 1]) {
    const ear = pivot(head, s * 0.26, 0.1, -0.02);
    ear.rotation.z = -s * (Math.PI / 2 - 0.3);
    part(ear, gCone(), green, 0, 0.2, 0, 0.1, 0.4, 0.05);
    part(ear, gCone(), toon(0xff8fb1), 0, 0.18, 0.025, 0.06, 0.28, 0.02);
    ears.push(ear);
  }
  for (const s of [-1, 1]) {
    const sclera = part(head, gSphere(), toon(0xfff07a, { emissive: 0x403a00, emissiveIntensity: 0.4 }), s * 0.11, 0.13, 0.21, 0.1, 0.11, 0.07);
    sclera.rotation.y = s * 0.3;
    part(head, gSphere(), mInk(), s * 0.115, 0.12, 0.275, 0.05, 0.06, 0.02);
    part(head, gSphereLo(), mHighlight(), s * 0.115 + 0.016, 0.145, 0.29, 0.015);
    const brow = part(head, gBox(), dark, s * 0.11, 0.27, 0.22, 0.13, 0.035, 0.04);
    brow.rotation.z = s * 0.45;
  }
  part(head, gSphere(), dark, 0, 0.05, 0.27, 0.05, 0.045, 0.04); // nose
  part(head, gSphere(), toon(0x3a1030), 0, -0.05, 0.235, 0.13, 0.055, 0.04); // grin
  for (const s of [-1, 1]) part(head, gBox(), toon(0xffffff), s * 0.04, -0.03, 0.262, 0.035, 0.035, 0.02);
  const tongue = part(head, gSphere(), toon(0xff6f91), 0, -0.09, 0.26, 0.05, 0.022, 0.06);
  tongue.visible = false;
  const hat = pivot(head, 0, 0.27, -0.03);
  hat.rotation.x = -0.35;
  part(hat, gCone(), toon(0x8e5bd6), 0, 0.2, 0, 0.2, 0.42, 0.2);
  const band = part(hat, gTorus(), toon(0xffc94a), 0, 0.02, 0, 0.2);
  band.rotation.x = Math.PI / 2;
  part(hat, gSphere(), toon(0x6bcb77), 0, 0.42, 0, 0.065);

  const arms = [];
  for (const s of [-1, 1]) {
    const arm = pivot(body, s * 0.25, 0.54, 0);
    arm.rotation.z = s * 0.35;
    part(arm, gSphere(), green, 0, -0.11, 0, 0.055, 0.14, 0.055);
    part(arm, gSphere(), green, 0, -0.25, 0, 0.065);
    arms.push(arm);
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = pivot(body, s * 0.12, 0.22, 0);
    part(leg, gCyl(), green, 0, -0.1, 0, 0.05, 0.2, 0.05);
    part(leg, gSphere(), dark, 0, -0.2, 0.05, 0.08, 0.05, 0.13, true);
    legs.push(leg);
  }

  const sack = pivot(body, 0, 0.55, -0.25);
  part(sack, gSphere(), toon(COL.sack), 0, 0, -0.08, 0.22, 0.26, 0.2, true);
  const tie = part(sack, gTorus(), toon(0xffc94a), 0, 0.22, -0.08, 0.07);
  tie.rotation.x = Math.PI / 2;
  const coin = part(sack, gCyl(), mGold(), 0.05, 0.3, -0.05, 0.075, 0.02, 0.075);
  coin.rotation.x = Math.PI / 2 - 0.3;
  const coin2 = part(sack, gCyl(), mGold(), -0.07, 0.27, -0.1, 0.06, 0.02, 0.06);
  coin2.rotation.set(Math.PI / 2 + 0.4, 0, 0.3);

  return bake({ group, body, head, ears, arms, legs, sack, tongue });
}

function buildCloud() {
  const group = new THREE.Group();
  group.name = 'stormCloud';
  const inner = pivot(group);
  const mat = toon(COL.cloud);
  for (const [x, y, z, r] of [
    [0, 0, 0, 2.2],
    [-2.2, -0.3, -0.2, 1.7],
    [2.3, -0.2, -0.1, 1.8],
    [-1.1, 0.9, -0.4, 1.6],
    [1.2, 1.0, -0.3, 1.5],
    [-3.7, -0.6, -0.3, 1.1],
    [3.8, -0.5, -0.2, 1.2],
    [0.2, 0.4, -1.2, 1.9],
  ]) {
    part(inner, gSphere(), mat, x, y, z, r, r * 0.85, r);
  }
  // happy closed eyes (^ ^), smile and cheeks
  for (const s of [-1, 1]) {
    const e = part(inner, gSmile(), mInk(), s * 0.65, 0.12, 2.1, 0.24, 0.24, 0.24);
    e.rotation.x = -0.35;
    const ch = part(inner, gSphere(), toon(0xffb3cf), s * 1.15, -0.32, 1.86, 0.3, 0.17, 0.08);
    ch.rotation.y = s * 0.55;
  }
  smileArc(inner, mInk(), 0, -0.4, 2.15, 0.32, 0.5);
  group.scale.setScalar(0.85);
  group.visible = false;
  return bake({ group, inner });
}

function buildSantaSleigh() {
  const group = new THREE.Group();
  group.name = 'santaSleigh';
  group.rotation.order = 'YXZ';
  const rig = pivot(group);
  const red = toon(COL.santaRed);
  const gold = mGold();
  const white = toon(0xffffff);

  // sleigh body
  part(rig, gBox(), red, 0, 0.55, 0, 1.3, 0.55, 1.7);
  part(rig, gBox(), red, 0, 1.0, -0.72, 1.3, 0.8, 0.3);
  part(rig, gBox(), gold, 0, 0.84, 0, 1.36, 0.08, 1.76);
  part(rig, gBox(), gold, 0, 1.42, -0.72, 1.36, 0.08, 0.36);
  const scroll = part(rig, gSmile(), red, 0, 0.62, 0.85, 0.38, 0.38, 3.2);
  scroll.rotation.set(0, -Math.PI / 2, -Math.PI / 2);
  for (const s of [-1, 1]) {
    const edge = part(rig, gSmile(), gold, s * 0.66, 0.62, 0.85, 0.38, 0.38, 0.3);
    edge.rotation.set(0, -Math.PI / 2, -Math.PI / 2);
  }
  for (const s of [-1, 1]) {
    part(rig, gBox(), gold, s * 0.55, 0.05, 0.05, 0.08, 0.06, 2.0);
    const curl = part(rig, gSmile(), gold, s * 0.55, 0.33, 1.05, 0.28, 0.28, 0.4);
    curl.rotation.set(0, -Math.PI / 2, -Math.PI / 2);
    for (const z of [-0.5, 0.5]) part(rig, gCyl(), gold, s * 0.55, 0.18, z, 0.03, 0.26, 0.03);
  }

  // Santa
  const santa = pivot(rig, 0, 0, -0.2);
  part(santa, gSphere(), red, 0, 1.15, 0, 0.48, 0.5, 0.45);
  const belt = part(santa, gTorus(), mInk(), 0, 1.04, 0, 0.47, 0.47, 0.4);
  belt.rotation.x = Math.PI / 2;
  part(santa, gBox(), gold, 0, 1.04, 0.44, 0.18, 0.14, 0.05);
  part(santa, gSphere(), toon(COL.skin), 0, 1.72, 0.04, 0.27);
  part(santa, gSphere(), white, 0, 1.56, 0.17, 0.27, 0.26, 0.18);
  for (const s of [-1, 1]) part(santa, gSphere(), white, s * 0.09, 1.66, 0.29, 0.11, 0.05, 0.05);
  part(santa, gSphere(), toon(0xff9a8a), 0, 1.71, 0.31, 0.06);
  for (const s of [-1, 1]) part(santa, gSphere(), mInk(), s * 0.09, 1.79, 0.27, 0.035);
  const hat = pivot(santa, 0, 1.9, 0.02);
  hat.rotation.x = -0.5;
  part(hat, gCone(), red, 0, 0.22, 0, 0.25, 0.45, 0.25);
  const brim = part(hat, gTorus(), white, 0, 0, 0, 0.25);
  brim.rotation.x = Math.PI / 2;
  const pom = part(hat, gSphere(), white, 0, 0.46, 0, 0.09);
  const arm = pivot(santa, 0.44, 1.35, 0.02);
  part(arm, gCyl(), red, 0, 0.2, 0, 0.09, 0.4, 0.09);
  part(arm, gSphere(), white, 0, 0.44, 0, 0.11);
  const reinArm = pivot(santa, -0.44, 1.3, 0.05);
  reinArm.rotation.x = -1.2;
  part(reinArm, gCyl(), red, 0, 0.2, 0, 0.09, 0.4, 0.09);
  part(reinArm, gSphere(), white, 0, 0.42, 0, 0.1);

  // sack of presents
  const sack = pivot(rig, 0, 0, -1.0);
  part(sack, gSphere(), toon(0x8a5a2b), 0, 1.15, 0, 0.45, 0.5, 0.42);
  const p1 = part(sack, gBox(), toon(0x2a9d6f), 0.15, 1.62, 0, 0.3, 0.3, 0.3);
  p1.rotation.set(0.3, 0.5, 0.2);
  const p2 = part(sack, gBox(), toon(0x4d96ff), -0.18, 1.58, 0.05, 0.24, 0.24, 0.24);
  p2.rotation.set(-0.2, 0.3, -0.3);

  // reindeer team: one pair and a glowing leader
  const team = [];
  for (const [x, z] of [
    [-0.55, 2.5],
    [0.55, 2.5],
    [0, 4.0],
  ]) {
    const r = buildReindeer({ detail: false, baked: false }); // baked with the sleigh below
    r.group.position.set(x, 0.25, z);
    r.group.scale.setScalar(0.85);
    rig.add(r.group);
    // the flyover only animates legs, body, head and nose glow; everything
    // else (ears, tail) bakes into the sleigh's static meshes
    team.push({ group: r.group, body: r.body, head: r.head, legs: r.legs, glow: r.glow, phase: Math.random() * TAU });
  }
  const lead = team[2];
  lead.glow.scale.setScalar(1.3);
  for (const s of [-1, 1]) {
    const rein = part(rig, gCyl(), gold, s * 0.5, 0.95, 1.55, 0.022, 1.5, 0.022);
    rein.rotation.x = Math.PI / 2 - 0.12;
  }

  return bake({ group, rig, team, arm, pom, sack });
}

function buildGift(hex) {
  const g = new THREE.Group();
  const box = part(g, gBox(), toon(hex), 0, 0, 0, 0.36, 0.32, 0.36, true);
  addOutline(box, 0.06);
  part(g, gBox(), mGold(), 0, 0, 0, 0.38, 0.34, 0.08);
  part(g, gSphere(), mGold(), 0, 0.2, 0, 0.09, 0.07, 0.09);
  return bake({ group: g }).group;
}

// ================================================================ factory

// main.js builds a fresh companions instance every night and only calls
// clear() on the old one, so each new instance disposes the previous one on
// the same scene: otherwise every night would leave another root (and its
// particle buffers) behind in the scene.
const LIVE = new WeakMap(); // scene -> api

export function createCompanions(scene, ctx) {
  ctx = ctx || {};
  if (scene && typeof scene === 'object') {
    const prev = LIVE.get(scene);
    if (prev) {
      try {
        prev.dispose();
      } catch (err) {
        console.error('[companions] disposing the previous instance failed', err);
      }
    }
  }
  const root = new THREE.Group();
  root.name = 'companions';
  if (scene && typeof scene.add === 'function') scene.add(root);

  const actors = []; // { update(dt, time) -> alive, dispose(forced) }
  const barked = new Set();
  const discos = new Map(); // tree -> disco state
  let puppy = null;
  let ride = null;
  let clock = 0;

  const puffs = createParticleLayer(260, softTexture(), false);
  const sparks = createParticleLayer(480, starTexture(), true);
  root.add(puffs.points, sparks.points);

  // ------------------------------------------------------- ctx helpers

  function playerPos() {
    const p = ctx.player && ctx.player.position;
    return p && Number.isFinite(p.x) && Number.isFinite(p.z) ? p : null;
  }
  function groundY(x, z) {
    const w = ctx.world;
    if (w && typeof w.heightAt === 'function') {
      try {
        const h = w.heightAt(x, z);
        if (Number.isFinite(h)) return h;
      } catch {
        /* fall through */
      }
    }
    return 0;
  }
  function resolve(pos, r) {
    const w = ctx.world;
    if (w && typeof w.resolveCollision === 'function') {
      try {
        w.resolveCollision(pos, r);
        return;
      } catch {
        /* fall through to the plain island bound */
      }
    }
    const d = Math.hypot(pos.x, pos.z);
    if (d > 72) {
      pos.x *= 72 / d;
      pos.z *= 72 / d;
    }
  }
  function play(name) {
    try {
      if (ctx.sfx && typeof ctx.sfx.play === 'function') ctx.sfx.play(name);
    } catch {
      /* sound is optional */
    }
  }
  function toast(text, icon) {
    try {
      if (typeof ctx.toast === 'function') ctx.toast(text, icon);
      else if (ctx.hud && typeof ctx.hud.toast === 'function') ctx.hud.toast(text, icon);
    } catch {
      /* optional */
    }
  }
  function call(fn, ...args) {
    if (typeof fn !== 'function') return;
    try {
      fn(...args);
    } catch (err) {
      console.error('[companions] callback failed', err);
    }
  }
  function setRiding(on) {
    const pl = ctx.player;
    if (pl && typeof pl.setRiding === 'function') {
      try {
        pl.setRiding(on);
      } catch {
        /* optional */
      }
    }
  }
  function yawToCamera(x, z, fallback = 0) {
    const cam = ctx.camera;
    if (cam && cam.position) {
      const dx = cam.position.x - x;
      const dz = cam.position.z - z;
      if (dx * dx + dz * dz > 1e-6) return Math.atan2(dx, dz);
    }
    return fallback;
  }
  // Ground-plane spot from a position-ish argument, else Pip, else origin.
  function spotFrom(pos) {
    const out = new THREE.Vector3();
    const p = pos && Number.isFinite(pos.x) && Number.isFinite(pos.z) ? pos : playerPos();
    if (p) out.set(p.x, 0, p.z);
    out.y = groundY(out.x, out.z);
    return out;
  }
  function addActor(a) {
    actors.push(a);
    return a;
  }

  // -------------------------------------------------------- particles

  function puff(x, y, z, n = 10, size = 0.7, spread = 1.4, hex = 0xffffff) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = spread * (0.45 + Math.random() * 0.75);
      puffs.emit(
        x + Math.cos(a) * 0.15,
        y + Math.random() * 0.2,
        z + Math.sin(a) * 0.15,
        Math.cos(a) * sp,
        0.3 + Math.random() * 0.9,
        Math.sin(a) * sp,
        0.55 + Math.random() * 0.4,
        size * 0.6,
        size * (1.4 + Math.random() * 0.6),
        hex,
        0.9,
        0.4,
        3.5,
      );
    }
  }
  function sparkle(x, y, z, n = 12, hex = null, speed = 2.5, size = 0.35) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const up = Math.random() * 2 - 0.4;
      const sp = speed * (0.4 + Math.random() * 0.8);
      sparks.emit(
        x,
        y,
        z,
        Math.cos(a) * sp,
        up * sp * 0.8 + 1,
        Math.sin(a) * sp,
        0.5 + Math.random() * 0.5,
        size * (0.8 + Math.random() * 0.6),
        size * 0.15,
        hex == null ? pickFestive() : hex,
        1,
        -4,
        1.6,
      );
    }
  }
  function trailSpark(x, y, z, hex, size = 0.4, lifeS = 1.0) {
    sparks.emit(
      x + (Math.random() - 0.5) * 0.3,
      y + (Math.random() - 0.5) * 0.3,
      z + (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 0.4,
      -0.4 - Math.random() * 0.6,
      (Math.random() - 0.5) * 0.4,
      lifeS * (0.7 + Math.random() * 0.6),
      size,
      size * 0.1,
      hex,
      1,
      -0.5,
      0.5,
    );
  }

  // ======================================================= SNOW PUPPY

  const sniffOpts = {
    maxDist: 12,
    filter: (it) => !!it && it.alive !== false && !it.opening && !barked.has(it.id != null ? it.id : it),
  };

  function spawnPuppy() {
    if (puppy) return;
    const parts = buildPuppy();
    const g = parts.group;
    const pp = playerPos();
    const f = (ctx.player && ctx.player.facing) || 0;
    const x = pp ? pp.x - Math.sin(f) * 1.6 + Math.cos(f) * 0.9 : 0;
    const z = pp ? pp.z - Math.cos(f) * 1.6 - Math.sin(f) * 0.9 : 0;
    g.position.set(x, 0, z);
    resolve(g.position, 0.35);
    g.position.y = groundY(g.position.x, g.position.z);
    g.rotation.y = f;
    g.scale.setScalar(0.8);
    root.add(g);
    puppy = {
      ...parts,
      t: 0,
      hop: 0,
      moveAmt: 0,
      yaw: f,
      sniffT: 1,
      barkCooldown: 2,
      pointT: 0,
      pointX: 0,
      pointZ: 0,
      barkT: -0.25, // a happy hello yip + "Woof!" bubble just after popping in
      blinkT: 2 + Math.random() * 2,
      excite: 0,
    };
    puff(g.position.x, g.position.y + 0.2, g.position.z, 16, 0.8, 1.6);
    sparkle(g.position.x, g.position.y + 0.5, g.position.z, 12, 0xffffff, 2);
  }

  function removePuppy() {
    if (!puppy) return;
    removeModel(puppy.group);
    puppy = null;
  }

  function sniff() {
    const col = ctx.collectables;
    if (!col || !puppy) return;
    const here = puppy.group.position;
    let item = null;
    try {
      if (typeof col.nearest === 'function') {
        const r = col.nearest(here, sniffOpts);
        item = r && r.item;
      } else if (Array.isArray(col.items)) {
        let best = 144;
        for (const it of col.items) {
          if (!sniffOpts.filter(it) || !it.position) continue;
          const d = (it.position.x - here.x) ** 2 + (it.position.z - here.z) ** 2;
          if (d < best) {
            best = d;
            item = it;
          }
        }
      }
    } catch {
      item = null;
    }
    if (!item || !item.position) return;
    barked.add(item.id != null ? item.id : item);
    puppy.barkCooldown = 4.5;
    puppy.pointT = 1.9;
    puppy.pointX = item.position.x;
    puppy.pointZ = item.position.z;
    puppy.barkT = 0;
    puppy.excite = 1;
    play('bark');
    toast('Woof! Something nearby!', '🐶');
    // a little line of sparkles towards the treat
    const dx = item.position.x - here.x;
    const dz = item.position.z - here.z;
    const d = Math.hypot(dx, dz) || 1;
    for (let i = 1; i <= 6; i++) {
      const k = (i / 6) * Math.min(3, d);
      sparks.emit(here.x + (dx / d) * k, here.y + 0.6, here.z + (dz / d) * k, 0, 0.6, 0, 0.6 + i * 0.08, 0.35, 0.05, 0xffe680, 1, 0, 0);
    }
  }

  function updatePuppy(dt, time) {
    const p = puppy;
    const g = p.group;
    const pos = g.position;
    p.t += dt;
    const pp = playerPos();
    let speed = 0;
    let moving = 0;

    if (p.pointT > 0) p.pointT -= dt;
    if (pp) {
      const f = (ctx.player && ctx.player.facing) || 0;
      const fx = Math.sin(f);
      const fz = Math.cos(f);
      const tx = pp.x - fx * 1.7 + fz * 0.85;
      const tz = pp.z - fz * 1.7 - fx * 0.85;
      const dx = tx - pos.x;
      const dz = tz - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 28) {
        puff(pos.x, pos.y + 0.2, pos.z, 8, 0.7);
        pos.x = tx;
        pos.z = tz;
        puff(tx, groundY(tx, tz) + 0.2, tz, 12, 0.8);
      } else if (p.pointT > 0) {
        p.yaw = dampAngle(p.yaw, Math.atan2(p.pointX - pos.x, p.pointZ - pos.z), 14, dt);
      } else if (dist > 0.45) {
        speed = Math.min(12, 1.6 + dist * 2.4);
        const step = Math.min(dist, speed * dt);
        pos.x += (dx / dist) * step;
        pos.z += (dz / dist) * step;
        moving = 1;
        p.yaw = dampAngle(p.yaw, Math.atan2(dx, dz), 10, dt);
      } else {
        p.yaw = dampAngle(p.yaw, Math.atan2(pp.x - pos.x, pp.z - pos.z), 4, dt);
      }
    }
    resolve(pos, 0.35);
    pos.y = groundY(pos.x, pos.z);
    g.rotation.y = p.yaw;

    p.moveAmt = damp(p.moveAmt, moving, 8, dt);
    if (moving) p.hop += dt * (7 + speed * 0.9);
    else p.hop = damp(p.hop, Math.round(p.hop / Math.PI) * Math.PI, 10, dt);
    const m = p.moveAmt;
    const s = Math.abs(Math.sin(p.hop));
    const appear = elasticOut(Math.min(1, p.t / 0.5));
    const sq = 1 + m * (s * 0.1 - (1 - Math.min(1, s * 4)) * 0.16);
    const xz = appear / Math.sqrt(sq);
    p.body.position.y = s * 0.3 * m;
    p.body.scale.set(xz, appear * sq, xz);
    p.body.rotation.x = m * Math.cos(p.hop) * 0.18 - (1 - m) * 0.08;

    // legs: bunny-hop pairs while moving, one paw raised while pointing
    const legSwing = Math.cos(p.hop * 2) * 0.6 * m;
    p.legs[0].rotation.x = -legSwing;
    p.legs[1].rotation.x = p.pointT > 0 ? damp(p.legs[1].rotation.x, -1.3, 12, dt) : -legSwing;
    p.legs[2].rotation.x = legSwing;
    p.legs[3].rotation.x = legSwing;

    // ears flop with the hop, perk up while pointing
    const perk = p.pointT > 0 ? 1 : 0;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const ear = p.ears[i];
      ear.rotation.x = -Math.cos(p.hop * 2) * 0.5 * m + Math.sin(time * 2.1 + i) * 0.05;
      ear.rotation.z = damp(ear.rotation.z, side * (perk ? 0.15 : 0.55 + s * 0.3 * m), 10, dt);
    }

    // tail: waggy, faster when excited, straight out while pointing
    p.excite = Math.max(0, p.excite - dt * 0.3);
    if (perk) {
      p.tail.rotation.y = damp(p.tail.rotation.y, 0, 14, dt);
      p.tail.rotation.x = damp(p.tail.rotation.x, -1.1, 10, dt);
    } else {
      p.tail.rotation.y = Math.sin(time * (14 + p.excite * 10)) * (0.5 + 0.3 * (1 - m));
      p.tail.rotation.x = damp(p.tail.rotation.x, -0.5, 6, dt);
    }

    // head: curious tilts when idle, double yip when barking
    p.barkT += dt;
    const bt = p.barkT;
    const yip = bt < 0 ? 0 : bt < 0.16 ? 1 - bt / 0.16 : bt > 0.3 && bt < 0.46 ? 1 - (bt - 0.3) / 0.16 : 0;
    p.head.scale.setScalar(1 + yip * 0.2);
    p.head.rotation.x = -yip * 0.35 + (perk ? -0.1 : 0);
    p.head.rotation.z = (1 - m) * (1 - perk) * Math.sin(time * 0.9) * 0.2;
    p.tongue.visible = yip > 0.05 || (m < 0.3 && Math.sin(time * 0.5) > 0.6);

    // blink
    p.blinkT -= dt;
    const blink = p.blinkT < 0 ? 0.15 : 1;
    if (p.blinkT < -0.12) p.blinkT = 2 + Math.random() * 3;
    for (const e of p.eyes) e.scale.y = 0.052 * 1.2 * blink;

    // "Woof!" bubble
    if (bt >= 0 && bt < 1.6) {
      const k = elasticOut(Math.min(1, bt / 0.35));
      const fade = bt > 1.3 ? 1 - (bt - 1.3) / 0.3 : 1;
      const sc = Math.max(0.001, k * fade);
      p.bubble.visible = true;
      p.bubble.scale.set(1.15 * sc, 0.67 * sc, 1);
    } else p.bubble.visible = false;

    // sniff for treats
    p.barkCooldown -= dt;
    p.sniffT -= dt;
    if (p.sniffT <= 0) {
      p.sniffT = 0.4;
      if (p.barkCooldown <= 0 && p.t > 1.5) sniff();
    }
  }

  // ===================================================== JACK-IN-THE-BOX

  function jackInBox(pos) {
    const at = spotFrom(pos);
    const J = buildJack();
    const g = J.group;
    g.position.copy(at);
    g.rotation.y = yawToCamera(at.x, at.z, 0);
    g.scale.setScalar(0.001);
    root.add(g);
    let t = 0;
    let popped = false;
    let winked = false;
    addActor({
      update(dt) {
        t += dt;
        const sIn = elasticOut(clamp01(t / 0.4));
        const out = t > 2.6 ? easeInBack(clamp01((t - 2.6) / 0.45)) : 0;
        g.scale.setScalar(Math.max(0.001, sIn * (1 - out)));
        J.box.rotation.z = t < 0.22 ? Math.sin(t * 70) * 0.07 : Math.sin(t * 9) * 0.03 * Math.exp(-(t - 0.22) * 2);
        J.crank.rotation.x = -t * (t < 0.3 ? 16 : 3);
        J.lidPivot.rotation.x = -2.1 * easeOutBack(clamp01((t - 0.16) / 0.22));
        const tt = Math.max(0, t - 0.18);
        const ext = t < 0.18 ? 0 : 1.05 * (1 - Math.exp(-3.2 * tt) * Math.cos(12 * tt));
        const sway = Math.sin(tt * 8.5) * 0.16 * Math.exp(-1.1 * tt) + Math.sin(t * 3) * 0.03;
        const show = t >= 0.18;
        for (let i = 0; i < J.rings.length; i++) {
          const f = (i + 0.5) / J.rings.length;
          const r = J.rings[i];
          r.visible = show;
          r.position.set(sway * f * f, 0.8 + ext * f, 0);
        }
        J.head.visible = show;
        J.head.position.set(sway, 0.8 + ext + 0.32, 0);
        J.head.rotation.z = -sway * 1.6;
        J.head.rotation.x = Math.sin(tt * 6) * 0.1 * Math.exp(-tt) - 0.1;
        const stretch = Math.exp(-3.2 * tt) * Math.sin(12 * tt) * 0.22;
        J.head.scale.set(1 - stretch * 0.5, 1 + stretch, 1 - stretch * 0.5);
        // cheeky wink
        if (t > 1.3 && t < 1.55) {
          J.eyes[0].scale.y = 0.15;
          winked = true;
        } else if (winked) J.eyes[0].scale.y = 1;
        if (!popped && show) {
          popped = true;
          sparkle(at.x, at.y + 1.6, at.z, 22, null, 3.5, 0.4);
        }
        if (t > 3.05) {
          puff(at.x, at.y + 0.4, at.z, 16, 0.9, 1.8);
          sparkle(at.x, at.y + 0.6, at.z, 10, null, 2.5);
          return false;
        }
        return true;
      },
      dispose() {
        removeModel(g);
      },
    });
  }

  // ======================================================= REINDEER RIDE

  function animateReindeer(R, dt, time, speed, st) {
    const amp = Math.min(1, speed / 6);
    st.gallop += dt * (3 + speed * 1.3);
    const ph = st.gallop;
    const sw = 0.85 * amp + 0.05;
    R.legs[0].rotation.x = Math.sin(ph) * sw;
    R.legs[1].rotation.x = Math.sin(ph + 0.5) * sw;
    R.legs[2].rotation.x = Math.sin(ph + Math.PI) * sw;
    R.legs[3].rotation.x = Math.sin(ph + Math.PI + 0.5) * sw;
    R.body.position.y = Math.abs(Math.sin(ph)) * 0.06 * amp;
    R.body.rotation.x = Math.sin(ph) * 0.06 * amp;
    R.head.rotation.x = -Math.sin(ph + 0.6) * 0.12 * amp + (1 - amp) * Math.sin(time * 1.3) * 0.06;
    R.head.rotation.y = (1 - amp) * Math.sin(time * 0.7) * 0.3;
    R.tail.rotation.x = Math.sin(time * 9) * 0.35;
    const flick = Math.max(0, Math.sin(time * 1.7)) ** 8;
    R.ears[0].rotation.x = flick * 0.6;
    R.ears[1].rotation.x = -flick * 0.6;
    R.glow.scale.setScalar(0.5 + 0.1 * Math.sin(time * 6));
  }

  function reindeerRide(seconds = 20) {
    const pl = ctx.player;
    if (!pl || !pl.position) return;
    const secs = Number.isFinite(seconds) && seconds > 0 ? seconds : 20;
    if (ride && ride.state === 'ride') {
      ride.remaining += secs;
      sparkle(pl.position.x, pl.position.y + 1, pl.position.z, 14, null, 2.5);
      return;
    }
    const R = buildReindeer({ detail: true, saddle: true });
    const g = R.group;
    g.position.copy(pl.position);
    g.rotation.y = pl.facing || 0;
    g.scale.setScalar(0.001);
    root.add(g);
    setRiding(true);
    puff(pl.position.x, pl.position.y + 0.2, pl.position.z, 18, 0.9, 2);
    sparkle(pl.position.x, pl.position.y + 1, pl.position.z, 16, null, 3);
    const st = {
      state: 'ride',
      remaining: secs,
      t: 0,
      gallop: 0,
      speed: 0,
      lastX: pl.position.x,
      lastZ: pl.position.z,
      dustT: 0,
      leaveT: 0,
      lx: 0,
      ly: 0,
      lz: 0,
      yaw: 0,
    };
    ride = st;
    addActor({
      update(dt, time) {
        st.t += dt;
        const player = ctx.player;
        if (st.state === 'ride') {
          if (!player || !player.position) st.remaining = 0;
          else {
            st.remaining -= dt;
            const px = player.position.x;
            const pz = player.position.z;
            const inst = dt > 0 ? Math.hypot(px - st.lastX, pz - st.lastZ) / dt : 0;
            st.lastX = px;
            st.lastZ = pz;
            st.speed = damp(st.speed, Math.min(inst, 20), 10, dt);
            g.position.copy(player.position);
            g.rotation.y = dampAngle(g.rotation.y, player.facing || 0, 25, dt);
            g.scale.setScalar(Math.max(0.001, elasticOut(clamp01(st.t / 0.45))));
            animateReindeer(R, dt, time, st.speed, st);
            if (st.speed > 3) {
              st.dustT -= dt;
              if (st.dustT <= 0) {
                st.dustT = 0.09;
                const y = g.rotation.y;
                puff(px - Math.sin(y) * 0.45, player.position.y + 0.05, pz - Math.cos(y) * 0.45, 2, 0.45, 0.7);
              }
            }
          }
          if (st.remaining <= 0) {
            st.state = 'leave';
            st.leaveT = 0;
            setRiding(false);
            st.lx = g.position.x;
            st.ly = g.position.y;
            st.lz = g.position.z;
            st.yaw = g.rotation.y;
            puff(st.lx, st.ly + 0.3, st.lz, 22, 1, 2.2);
            sparkle(st.lx, st.ly + 1, st.lz, 18, null, 3);
            play('whoosh');
          }
          return true;
        }
        // leaving: a happy leap into the sky, shrinking away
        st.leaveT += dt;
        const k = clamp01(st.leaveT / 0.9);
        g.position.set(st.lx + Math.sin(st.yaw) * 7 * k, st.ly + 1.2 * k + 5 * k * k, st.lz + Math.cos(st.yaw) * 7 * k);
        g.rotation.x = -0.4 * Math.sin(k * Math.PI);
        g.scale.setScalar(Math.max(0.001, 1 - easeInBack(k)));
        animateReindeer(R, dt, time, 12, st);
        trailSpark(g.position.x, g.position.y + 0.6, g.position.z, pickFestive(), 0.45, 0.8);
        return k < 1;
      },
      dispose() {
        if (st.state === 'ride') setRiding(false);
        st.state = 'gone';
        if (ride === st) ride = null;
        removeModel(g);
      },
    });
  }

  // ======================================================= SNOWBALL STORM

  const storm = { active: false, remaining: 0, t: 0, onNear: null, spawnAcc: 0, sfxCool: 0, leaveT: 0, jiggle: 0 };
  let SF = null;
  const SB_CAP = 40;

  function ensureStormFx() {
    if (SF) return SF;
    const balls = new THREE.InstancedMesh(gSphere(), toon(0xffffff, { emissive: 0x8796c0, emissiveIntensity: 0.45 }), SB_CAP);
    balls.castShadow = true;
    balls.frustumCulled = false;
    balls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const markMat = new THREE.MeshBasicMaterial({
      color: 0x2b3a7a,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const marks = new THREE.InstancedMesh(gDisc(), markMat, SB_CAP);
    marks.frustumCulled = false;
    marks.renderOrder = 2;
    marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < SB_CAP; i++) {
      balls.setMatrixAt(i, _mZero);
      marks.setMatrixAt(i, _mZero);
    }
    balls.visible = false;
    marks.visible = false;
    const cloud = buildCloud();
    root.add(balls, marks, cloud.group);
    SF = {
      balls,
      marks,
      markMat,
      cloud,
      active: new Uint8Array(SB_CAP),
      x: new Float32Array(SB_CAP),
      z: new Float32Array(SB_CAP),
      y: new Float32Array(SB_CAP),
      y0: new Float32Array(SB_CAP),
      gy: new Float32Array(SB_CAP),
      vy: new Float32Array(SB_CAP),
      live: 0,
    };
    return SF;
  }

  function snowballStorm(seconds = 8, onNear) {
    const F = ensureStormFx();
    const secs = Number.isFinite(seconds) && seconds > 0 ? seconds : 8;
    storm.onNear = typeof onNear === 'function' ? onNear : null;
    if (storm.active) {
      storm.remaining += secs;
      return;
    }
    storm.active = true;
    storm.remaining = secs;
    storm.t = 0;
    storm.leaveT = 0;
    storm.spawnAcc = 0;
    const pp = playerPos();
    const c = F.cloud.group;
    if (pp) c.position.set(pp.x, pp.y + 7, pp.z);
    c.visible = true;
    F.cloud.inner.scale.setScalar(0.001);
  }

  function spawnBall(pp) {
    const F = SF;
    let idx = -1;
    for (let i = 0; i < SB_CAP; i++) {
      if (!F.active[i]) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;
    const near = Math.random() < 0.38;
    const r = near ? Math.sqrt(Math.random()) * 2.6 : 3.2 + Math.random() * 6.8;
    const a = Math.random() * TAU;
    const v = ctx.player && ctx.player.velocity;
    const lead = 0.55;
    let x = pp.x + Math.cos(a) * r + (v && Number.isFinite(v.x) ? v.x * lead : 0);
    let z = pp.z + Math.sin(a) * r + (v && Number.isFinite(v.z) ? v.z * lead : 0);
    const d = Math.hypot(x, z);
    if (d > 71) {
      x *= 71 / d;
      z *= 71 / d;
    }
    const gy = groundY(x, z);
    F.active[idx] = 1;
    F.x[idx] = x;
    F.z[idx] = z;
    F.gy[idx] = gy;
    F.y0[idx] = gy + 6.5 + Math.random() * 1.5;
    F.y[idx] = F.y0[idx];
    F.vy[idx] = -2 - Math.random() * 2;
    F.live++;
    storm.jiggle = 1;
  }

  function landBall(i) {
    const F = SF;
    F.active[i] = 0;
    F.live = Math.max(0, F.live - 1);
    F.balls.setMatrixAt(i, _mZero);
    F.marks.setMatrixAt(i, _mZero);
    const x = F.x[i];
    const z = F.z[i];
    const y = F.gy[i] + 0.2;
    puff(x, y, z, 7, 0.55, 1.6);
    const pp = playerPos();
    if (!pp) return;
    const d = Math.hypot(x - pp.x, z - pp.z);
    if (d <= 3) {
      sparkle(x, y + 0.3, z, 8, 0xffd93d, 2, 0.3);
      if (storm.onNear) call(storm.onNear, new THREE.Vector3(x, y + 0.4, z));
    }
    if (d < 9 && storm.sfxCool <= 0) {
      play('snowball');
      storm.sfxCool = 0.1;
    }
  }

  function updateStorm(dt, time) {
    if (!SF) return;
    const F = SF;
    storm.sfxCool -= dt;
    const pp = playerPos();
    const cloud = F.cloud;
    const cg = cloud.group;

    if (storm.active) {
      storm.t += dt;
      storm.remaining -= dt;
      if (pp) {
        storm.spawnAcc += dt * 5.5;
        while (storm.spawnAcc >= 1) {
          storm.spawnAcc -= 1;
          spawnBall(pp);
        }
      }
      if (storm.remaining <= 0) {
        storm.active = false;
        storm.leaveT = 0;
      }
    }

    // the cloud follows Pip, a little ahead of the camera so it is on screen
    if (cg.visible) {
      if (pp) {
        let fx = 0;
        let fz = 0;
        const cam = ctx.camera;
        if (cam && cam.position) {
          fx = pp.x - cam.position.x;
          fz = pp.z - cam.position.z;
          const l = Math.hypot(fx, fz) || 1;
          fx /= l;
          fz /= l;
        }
        const rise = storm.active ? 0 : storm.leaveT * 8;
        cg.position.x = damp(cg.position.x, pp.x + fx * 8, 3, dt);
        cg.position.z = damp(cg.position.z, pp.z + fz * 8, 3, dt);
        cg.position.y = damp(cg.position.y, pp.y + 5.8 + rise + Math.sin(time * 1.3) * 0.3, 3, dt);
        cg.rotation.y = yawToCamera(cg.position.x, cg.position.z, cg.rotation.y);
      }
      storm.jiggle = Math.max(0, storm.jiggle - dt * 6);
      let s;
      if (storm.active) s = elasticOut(clamp01(storm.t / 0.7));
      else {
        storm.leaveT += dt;
        s = 1 - easeInBack(clamp01(storm.leaveT / 0.7));
        if (storm.leaveT >= 0.7) cg.visible = false;
      }
      s = Math.max(0.001, s);
      const breathe = 1 + Math.sin(time * 2.2) * 0.03;
      cloud.inner.scale.set(s * breathe * (1 + storm.jiggle * 0.03), s * 0.8 * (1 - storm.jiggle * 0.06), s * breathe);
    }

    // snowballs
    if (F.live > 0) {
      for (let i = 0; i < SB_CAP; i++) {
        if (!F.active[i]) continue;
        F.vy[i] -= 13 * dt;
        F.y[i] += F.vy[i] * dt;
        if (F.y[i] <= F.gy[i] + 0.22) {
          landBall(i);
          continue;
        }
        const stretch = 1 + Math.min(0.35, -F.vy[i] * 0.02);
        const r = 0.26;
        _m4.makeScale(r / Math.sqrt(stretch), r * stretch, r / Math.sqrt(stretch));
        _m4.setPosition(F.x[i], F.y[i], F.z[i]);
        F.balls.setMatrixAt(i, _m4);
        const k = clamp01(1 - (F.y[i] - F.gy[i]) / Math.max(0.1, F.y0[i] - F.gy[i]));
        const ms = 0.18 + 0.42 * k;
        _m4.makeScale(ms, 1, ms);
        _m4.setPosition(F.x[i], F.gy[i] + 0.06, F.z[i]);
        F.marks.setMatrixAt(i, _m4);
      }
      F.balls.instanceMatrix.needsUpdate = true;
      F.marks.instanceMatrix.needsUpdate = true;
    }
    const any = F.live > 0;
    if (F.balls.visible !== any) {
      F.balls.visible = any;
      F.marks.visible = any;
      F.balls.instanceMatrix.needsUpdate = true;
      F.marks.instanceMatrix.needsUpdate = true;
    }
    if (!storm.active && !any) storm.onNear = null;
  }

  function stopStorm() {
    storm.active = false;
    storm.remaining = 0;
    storm.onNear = null;
    storm.leaveT = 0;
    if (!SF) return;
    SF.active.fill(0);
    SF.live = 0;
    for (let i = 0; i < SB_CAP; i++) {
      SF.balls.setMatrixAt(i, _mZero);
      SF.marks.setMatrixAt(i, _mZero);
    }
    SF.balls.instanceMatrix.needsUpdate = true;
    SF.marks.instanceMatrix.needsUpdate = true;
    SF.balls.visible = false;
    SF.marks.visible = false;
    SF.cloud.group.visible = false;
  }

  // ========================================================= COAL BUDDY

  function coalBuddy(pos) {
    const at = spotFrom(pos);
    const B = buildCoal();
    const g = B.group;
    g.position.copy(at);
    g.rotation.y = yawToCamera(at.x, at.z, 0);
    g.scale.setScalar(0.001);
    root.add(g);
    for (const e of B.eyes) {
      e.vx = (Math.random() - 0.5) * 2;
      e.vy = 1.5;
    }
    puff(at.x, at.y + 0.2, at.z, 10, 0.6, 1.4, 0xb8b4c8);
    let t = 0;
    let lastHop = -1;
    const R = 0.055;
    addActor({
      update(dt, time) {
        t += dt;
        const intro = clamp01(t / 0.45);
        const outro = t > 3.9 ? clamp01((t - 3.9) / 0.4) : 0;
        g.scale.setScalar(Math.max(0.001, elasticOut(intro) * (1 - easeInBack(outro))));
        g.rotation.y = dampAngle(g.rotation.y, yawToCamera(g.position.x, g.position.z, g.rotation.y), 3, dt);

        // happy little hops
        const ht = t - 0.45;
        const hp = ht > 0 ? (ht % 0.75) / 0.75 : 0;
        B.body.position.y = Math.sin(hp * Math.PI) * 0.26;
        const land = ht > 0 && hp < 0.15 ? 1 - hp / 0.15 : 0;
        B.body.scale.set(1 + 0.14 * land, 1 - 0.18 * land, 1 + 0.14 * land);
        const hopIdx = ht > 0 ? Math.floor(ht / 0.75) : -1;
        if (hopIdx !== lastHop) {
          lastHop = hopIdx;
          if (hopIdx >= 0) {
            for (const e of B.eyes) {
              e.vy += 1.3 + Math.random() * 0.5;
              e.vx += (Math.random() - 0.5) * 2.2;
            }
            puff(g.position.x, g.position.y + 0.05, g.position.z, 4, 0.4, 1, 0xd9dcef);
          }
        }
        B.arms[0].rotation.z = -(0.5 + Math.sin(t * 9) * 0.5);
        B.arms[1].rotation.z = 0.5 + Math.sin(t * 9 + 1.3) * 0.5;

        // googly pupils: little balls rattling around inside each eye
        for (const e of B.eyes) {
          const dk = Math.exp(-2.2 * dt);
          e.vx *= dk;
          e.vy = e.vy * dk - 2.6 * dt;
          e.ox += e.vx * dt;
          e.oy += e.vy * dt;
          const d = Math.hypot(e.ox, e.oy);
          if (d > R) {
            const nx = e.ox / d;
            const ny = e.oy / d;
            e.ox = nx * R;
            e.oy = ny * R;
            const vn = e.vx * nx + e.vy * ny;
            if (vn > 0) {
              e.vx -= 1.6 * vn * nx;
              e.vy -= 1.6 * vn * ny;
            }
          }
          e.pupil.position.set(e.x + e.ox, e.y + e.oy, e.z);
        }

        // speech bubble pops up and wobbles
        const bt = t - 0.3;
        const bk = bt > 0 ? elasticOut(clamp01(bt / 0.5)) : 0;
        const wob = 1 + Math.sin(time * 5) * 0.03;
        B.bubble.scale.set(Math.max(0.001, 2.3 * bk * wob), Math.max(0.001, 1.15 * bk / wob), 1);

        if (t >= 4.3) {
          puff(g.position.x, g.position.y + 0.3, g.position.z, 14, 0.7, 1.6, 0xb8b4c8);
          sparkle(g.position.x, g.position.y + 0.6, g.position.z, 8, 0xffffff, 2);
          return false;
        }
        return true;
      },
      dispose() {
        removeModel(g);
      },
    });
  }

  // ========================================================= DISCO TREE

  function discoTree(tree, seconds = 10) {
    const secs = Number.isFinite(seconds) && seconds > 0 ? seconds : 10;
    const isTree = !!(tree && tree.isObject3D);
    if (isTree && discos.has(tree)) {
      const d = discos.get(tree);
      d.remaining = Math.max(0, d.remaining) + secs;
      d.outT = 0;
      d.musicT = 10;
      play('disco');
      return;
    }

    const own = [];
    const anchor = new THREE.Vector3();
    let top;
    if (isTree) {
      tree.updateWorldMatrix(true, true);
      tree.getWorldPosition(anchor);
      top = treeTop(tree, anchor.y);
    } else {
      const pp = playerPos();
      if (pp) anchor.set(pp.x, 0, pp.z);
      anchor.y = groundY(anchor.x, anchor.z);
      top = anchor.y + 2.6;
    }

    // remember the tree so the party can be undone exactly
    const saved = [];
    if (isTree) {
      const lights = tree.userData && Array.isArray(tree.userData.lights) ? tree.userData.lights : [];
      const seen = new Set();
      for (const m of lights) {
        const mat = m && m.material;
        if (!mat || Array.isArray(mat) || seen.has(mat) || !mat.color) continue;
        seen.add(mat);
        saved.push({
          mat,
          color: mat.color.clone(),
          emissive: mat.emissive ? mat.emissive.clone() : null,
          ei: mat.emissiveIntensity,
        });
      }
    }
    const scale0 = isTree ? tree.scale.clone() : null;
    const rotZ0 = isTree ? tree.rotation.z : 0;

    // mirror ball rig
    const rig = new THREE.Group();
    rig.name = 'discoBall';
    const ballY = top + 1.5;
    rig.position.set(anchor.x, ballY, anchor.z);
    root.add(rig);
    const ball = part(rig, gMirror(), mMirror(), 0, 0, 0, 0.8);
    part(rig, gCyl(), mGold(), 0, 0.82, 0, 0.14, 0.14, 0.14);
    part(rig, gTorus(), mGold(), 0, 0.95, 0, 0.08);
    const haloMat = new THREE.SpriteMaterial({
      map: softTexture(),
      color: 0xffffff,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    own.push(haloMat);
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(3.8);
    rig.add(halo);

    const beamPivot = pivot(rig);
    const beams = [];
    for (let i = 0; i < 6; i++) {
      const holder = pivot(beamPivot);
      holder.rotation.y = (i * TAU) / 6;
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: beamTexture(),
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      });
      own.push(mat);
      const beam = new THREE.Mesh(gBeam(), mat);
      beam.rotation.x = 0.62;
      holder.add(beam);
      beams.push(mat);
    }

    // coloured spots dancing on the snow
    const floor = new THREE.Group();
    floor.name = 'discoSpots';
    root.add(floor);
    const spots = [];
    for (let i = 0; i < 7; i++) {
      // normal blending: additive light just saturates to white on snow
      const mat = new THREE.MeshBasicMaterial({
        map: softTexture(),
        color: 0xffffff,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        fog: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      });
      own.push(mat);
      const m = new THREE.Mesh(gDisc(), mat);
      m.renderOrder = 3;
      floor.add(m);
      spots.push({
        m,
        mat,
        r: 2.6 + Math.random() * 3.6,
        a: (i / 7) * TAU,
        w: (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 0.9),
        size: 1.9 + Math.random() * 1.0,
      });
    }

    const st = { remaining: secs, t: 0, outT: 0, musicT: 10, glintT: 0 };
    if (isTree) {
      discos.set(tree, st);
      // lets the world's own light twinkle skip this tree while it parties
      tree.userData.disco = true;
    }
    play('disco');

    function restore() {
      for (const s of saved) {
        s.mat.color.copy(s.color);
        if (s.emissive && s.mat.emissive) s.mat.emissive.copy(s.emissive);
        if (s.ei !== undefined) s.mat.emissiveIntensity = s.ei;
      }
      if (isTree) {
        tree.scale.copy(scale0);
        tree.rotation.z = rotZ0;
        if (discos.get(tree) === st || !discos.has(tree)) delete tree.userData.disco;
      }
    }

    addActor({
      update(dt, time) {
        st.t += dt;
        if (st.outT === 0) {
          st.remaining -= dt;
          st.musicT -= dt;
          if (st.musicT <= 0 && st.remaining > 1.5) {
            st.musicT = 10;
            play('disco');
          }
          if (st.remaining <= 0) st.outT = 1e-6;
        } else st.outT += dt;
        const outK = clamp01(st.outT / 0.7);
        const live = 1 - outK;
        const t = st.t;

        // ball drops in with a bounce, spins, floats away at the end
        const drop = 1 - easeOutBack(clamp01(t / 0.7));
        rig.position.y = ballY + drop * 6 + Math.sin(t * 2.2) * 0.12 + easeInBack(outK) * 6;
        const rs = Math.max(0.001, live);
        rig.scale.setScalar(rs);
        ball.rotation.y += dt * 1.8;
        beamPivot.rotation.y -= dt * 1.1;
        const beat = Math.pow(Math.abs(Math.sin(t * Math.PI * 2.1)), 2);
        const hue = (time * 0.35) % 1;

        for (let i = 0; i < beams.length; i++) {
          beams[i].color.setHSL((hue + i / beams.length) % 1, 1, 0.6);
          beams[i].opacity = (0.22 + beat * 0.12) * live;
        }
        haloMat.color.setHSL((hue + 0.5) % 1, 0.8, 0.7);
        haloMat.opacity = (0.55 + beat * 0.35) * live;

        for (let i = 0; i < spots.length; i++) {
          const s = spots[i];
          s.a += s.w * dt;
          const x = anchor.x + Math.cos(s.a) * s.r;
          const z = anchor.z + Math.sin(s.a) * s.r;
          s.m.position.set(x, groundY(x, z) + 0.08, z);
          const sz = s.size * (0.85 + beat * 0.25) * live + 0.001;
          s.m.scale.set(sz, 1, sz);
          s.mat.color.setHSL((hue + i * 0.17) % 1, 1, 0.5);
          s.mat.opacity = (0.55 + beat * 0.2) * live;
        }

        for (let i = 0; i < saved.length; i++) {
          const s = saved[i];
          const h = (time * 0.9 + i * 0.17) % 1;
          if (outK > 0) {
            s.mat.color.copy(s.color);
            if (s.emissive && s.mat.emissive) s.mat.emissive.copy(s.emissive);
          } else {
            s.mat.color.setHSL(h, 1, 0.55 + beat * 0.15);
            if (s.mat.emissive) s.mat.emissive.setHSL(h, 1, 0.5);
            s.mat.emissiveIntensity = 1.2 + beat * 0.8;
          }
        }
        if (isTree) {
          const a = live;
          tree.scale.set(scale0.x * (1 - 0.035 * beat * a), scale0.y * (1 + 0.065 * beat * a), scale0.z * (1 - 0.035 * beat * a));
          tree.rotation.z = rotZ0 + Math.sin(t * Math.PI * 1.05) * 0.05 * a;
        }

        // glints off the mirror tiles
        st.glintT -= dt;
        if (st.glintT <= 0 && live > 0.2) {
          st.glintT = 0.05;
          const a = Math.random() * TAU;
          const b = Math.random() * Math.PI - Math.PI / 2;
          const r = 0.82 * rs;
          sparks.emit(
            rig.position.x + Math.cos(a) * Math.cos(b) * r,
            rig.position.y + Math.sin(b) * r,
            rig.position.z + Math.sin(a) * Math.cos(b) * r,
            0,
            0,
            0,
            0.3,
            0.55,
            0.05,
            Math.random() < 0.5 ? 0xffffff : pickFestive(),
            1,
            0,
            0,
          );
        }

        if (outK >= 1) {
          restore();
          return false;
        }
        return true;
      },
      dispose() {
        restore();
        if (isTree && discos.get(tree) === st) discos.delete(tree);
        removeObj(rig);
        removeObj(floor);
        for (const o of own) o.dispose();
      },
    });
  }

  // ============================================================ GREMLIN

  const CD_H = 0.11; // fraction of the screen height
  const CD_W = CD_H * (256 / 300);
  function makeCountdown() {
    const c = makeCanvas(256, 300);
    const tex = c ? canvasTexture(c) : whiteTexture();
    // constant on-screen size so the chase target stays readable far away
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      fog: false,
      sizeAttenuation: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.renderOrder = 30;
    sprite.center.set(0.5, 0.05);
    sprite.scale.set(CD_W, CD_H, 1);
    return {
      sprite,
      draw(n) {
        if (!c) return;
        drawCountdown(c, n);
        tex.needsUpdate = true;
      },
      dispose() {
        mat.dispose();
        if (c) tex.dispose();
      },
    };
  }

  function gremlin(pos, onCaught, onEscaped) {
    const at = spotFrom(pos);
    const G = buildGremlin();
    const g = G.group;
    g.position.copy(at);
    root.add(g);
    const cd = makeCountdown();
    cd.sprite.position.set(0, 1.75, 0);
    g.add(cd.sprite);

    const pp = playerPos();
    let ax = pp ? at.x - pp.x : Math.random() - 0.5;
    let az = pp ? at.z - pp.z : Math.random() - 0.5;
    const al = Math.hypot(ax, az);
    if (al < 1e-3) {
      const a = Math.random() * TAU;
      ax = Math.cos(a);
      az = Math.sin(a);
    } else {
      ax /= al;
      az /= al;
    }
    const end = new THREE.Vector3(at.x + ax * 3.5, 0, at.z + az * 3.5);
    resolve(end, 0.4);
    const st = {
      state: 'leap',
      t: 0,
      timeLeft: 10,
      shown: -1,
      pulse: 0,
      sx: at.x,
      sz: at.z,
      ex: end.x,
      ez: end.z,
      yaw: Math.atan2(ax, az),
      dodge: Math.random() < 0.5 ? -1 : 1,
      dodgeT: 0.8,
      stuckT: 0,
      tauntT: 0,
      tauntCd: 2.5,
      phase: 0,
      endT: 0,
      lookT: 0,
      spin: 0,
      stars: null,
    };
    g.rotation.y = st.yaw;
    puff(at.x, at.y + 0.3, at.z, 12, 0.7, 1.6, 0xc8f0b0);
    // coins whizz from Pip into the sack
    if (pp) {
      for (let i = 0; i < 8; i++) {
        sparks.emit(pp.x, pp.y + 1.2, pp.z, (end.x - pp.x) * 1.5 + (Math.random() - 0.5), 3 + Math.random() * 2, (end.z - pp.z) * 1.5 + (Math.random() - 0.5), 0.6, 0.45, 0.1, 0xffd93d, 1, -8, 0.5);
      }
    }

    function finish(kind) {
      st.state = kind;
      st.endT = 0;
      cd.sprite.visible = false;
      G.tongue.visible = true;
      const p = g.position.clone();
      if (kind === 'caught') {
        st.spin = 14;
        sparkle(p.x, p.y + 0.9, p.z, 26, 0xffd93d, 3.5, 0.45);
        st.stars = [];
        const starMat = mStar(0xffe066);
        for (let i = 0; i < 3; i++) {
          const s = new THREE.Sprite(starMat);
          s.scale.setScalar(0.28);
          G.head.add(s);
          st.stars.push(s);
        }
        call(onCaught, p);
      } else {
        call(onEscaped, p);
      }
    }

    addActor({
      update(dt, time) {
        st.t += dt;
        const pos3 = g.position;
        const player = playerPos();
        const chasing = st.state === 'leap' || st.state === 'run' || st.state === 'taunt';

        if (chasing) {
          st.timeLeft -= dt;
          const n = Math.max(0, Math.ceil(st.timeLeft));
          if (n !== st.shown) {
            st.shown = n;
            cd.draw(n);
            st.pulse = 1;
            if (n <= 3 && n > 0 && st.t > 0.1) play('tick');
          }
          st.pulse = Math.max(0, st.pulse - dt * 3);
          const cs = 1 + st.pulse * 0.3;
          cd.sprite.scale.set(CD_W * cs, CD_H * cs, 1);
          if (player && st.t > 0.45) {
            const d = Math.hypot(player.x - pos3.x, player.z - pos3.z);
            if (d < 1.5) {
              finish('caught');
              return true;
            }
          }
          if (st.timeLeft <= 0) {
            finish('escape');
            return true;
          }
        }

        if (st.state === 'leap') {
          const k = clamp01(st.t / 0.5);
          const e = easeOutCubic(k);
          pos3.x = lerp(st.sx, st.ex, e);
          pos3.z = lerp(st.sz, st.ez, e);
          pos3.y = groundY(pos3.x, pos3.z) + Math.sin(k * Math.PI) * 1.3;
          const flip = k * TAU;
          G.body.rotation.x = flip;
          G.body.position.set(0, 0.5 - 0.5 * Math.cos(flip), -0.5 * Math.sin(flip));
          G.legs[0].rotation.x = -0.8;
          G.legs[1].rotation.x = 0.8;
          if (k >= 1) {
            G.body.rotation.x = 0;
            G.body.position.set(0, 0, 0);
            st.state = 'run';
            puff(pos3.x, pos3.y + 0.1, pos3.z, 6, 0.5, 1.2);
          }
          return true;
        }

        if (st.state === 'run' || st.state === 'taunt') {
          if (!player) {
            st.timeLeft = Math.min(st.timeLeft, 0.01);
            return true;
          }
          const awayX = pos3.x - player.x;
          const awayZ = pos3.z - player.z;
          const d = Math.hypot(awayX, awayZ) || 1;

          if (st.state === 'taunt') {
            st.tauntT += dt;
            st.yaw = dampAngle(st.yaw, Math.atan2(-awayX, -awayZ), 14, dt);
            g.rotation.y = st.yaw;
            G.body.position.y = Math.abs(Math.sin(st.tauntT * 14)) * 0.15;
            G.body.rotation.x = 0;
            G.head.rotation.set(0, 0, Math.sin(st.tauntT * 20) * 0.22);
            G.arms[0].rotation.set(0, 0, -2.4 + Math.sin(st.tauntT * 22) * 0.3);
            G.arms[1].rotation.set(0, 0, 2.4 - Math.sin(st.tauntT * 22) * 0.3);
            G.tongue.visible = true;
            pos3.y = groundY(pos3.x, pos3.z);
            if (st.tauntT > 0.55 || d < 4) {
              st.state = 'run';
              G.arms[0].rotation.set(0, 0, -0.35);
              G.arms[1].rotation.set(0, 0, 0.35);
            }
            return true;
          }

          let dx = awayX / d;
          let dz = awayZ / d;
          const perpX = dz;
          const perpZ = -dx;
          const weave = Math.sin(st.t * 3.1) * 0.45 + (d < 5 ? st.dodge * 0.6 : 0);
          dx += perpX * weave;
          dz += perpZ * weave;
          const r = Math.hypot(pos3.x, pos3.z);
          if (r > 56) {
            const k = Math.min(2, (r - 56) / 8);
            const inX = -pos3.x / r;
            const inZ = -pos3.z / r;
            const tX = -inZ;
            const tZ = inX;
            const sgn = tX * dx + tZ * dz >= 0 ? 1 : -1;
            dx += (tX * sgn * 1.2 + inX * 0.8) * k;
            dz += (tZ * sgn * 1.2 + inZ * 0.8) * k;
          }
          const dl = Math.hypot(dx, dz) || 1;
          dx /= dl;
          dz /= dl;
          const speed = d < 3 ? 5.3 : d > 10 ? 4.4 : 5.0;
          const prevX = pos3.x;
          const prevZ = pos3.z;
          pos3.x += dx * speed * dt;
          pos3.z += dz * speed * dt;
          resolve(pos3, 0.4);
          const moved = Math.hypot(pos3.x - prevX, pos3.z - prevZ);
          if (moved < speed * dt * 0.35) {
            st.stuckT += dt;
            if (st.stuckT > 0.25) {
              st.dodge *= -1;
              st.stuckT = 0;
            }
          } else st.stuckT = 0;
          st.dodgeT -= dt;
          if (st.dodgeT <= 0) {
            st.dodgeT = 0.6 + Math.random() * 0.8;
            if (Math.random() < 0.5) st.dodge *= -1;
          }
          pos3.y = groundY(pos3.x, pos3.z);
          st.yaw = dampAngle(st.yaw, Math.atan2(dx, dz), 12, dt);
          g.rotation.y = st.yaw;

          // scurry animation
          st.phase += dt * 17;
          const s = Math.sin(st.phase);
          G.legs[0].rotation.x = s * 0.9;
          G.legs[1].rotation.x = -s * 0.9;
          G.arms[0].rotation.x = -s * 0.8;
          G.arms[1].rotation.x = s * 0.8;
          G.body.position.y = Math.abs(Math.cos(st.phase)) * 0.09;
          G.body.rotation.x = 0.25;
          G.sack.rotation.x = Math.sin(st.phase) * 0.15;
          G.sack.position.y = 0.55 + Math.abs(Math.cos(st.phase)) * 0.04;
          G.ears[0].rotation.x = Math.sin(st.phase) * 0.15;
          G.ears[1].rotation.x = -Math.sin(st.phase) * 0.15;
          st.lookT += dt;
          const look = Math.pow(Math.max(0, Math.sin(st.lookT * 1.7)), 3);
          G.head.rotation.set(-0.15, look * 1.3 * st.dodge, 0);
          G.tongue.visible = look > 0.5;

          st.tauntCd -= dt;
          if (d > 8 && st.tauntCd <= 0) {
            st.state = 'taunt';
            st.tauntT = 0;
            st.tauntCd = 2.6 + Math.random() * 1.5;
          }
          return true;
        }

        if (st.state === 'caught') {
          st.endT += dt;
          const k = st.endT;
          st.spin = damp(st.spin, 0, 2.5, dt);
          g.rotation.y += st.spin * dt;
          G.body.rotation.set(0, 0, Math.sin(k * 9) * 0.25 * Math.max(0, 1 - k));
          G.body.position.y = 0;
          G.sack.position.y = Math.max(-0.4, 0.55 - k * 3);
          G.sack.rotation.x = -k * 2;
          for (let i = 0; i < st.stars.length; i++) {
            const a = time * 6 + (i * TAU) / st.stars.length;
            st.stars[i].position.set(Math.cos(a) * 0.38, 0.5 + Math.sin(a * 2) * 0.04, Math.sin(a) * 0.38);
          }
          const shrink = k > 0.85 ? easeInBack(clamp01((k - 0.85) / 0.3)) : 0;
          g.scale.setScalar(Math.max(0.001, 1 - shrink));
          if (k >= 1.15) {
            puff(pos3.x, pos3.y + 0.4, pos3.z, 16, 0.8, 1.8, 0xc8f0b0);
            sparkle(pos3.x, pos3.y + 0.6, pos3.z, 14, null, 3);
            return false;
          }
          return true;
        }

        // escape: a cheeky spinning jump and a poof
        st.endT += dt;
        const k = clamp01(st.endT / 0.7);
        pos3.y = groundY(pos3.x, pos3.z) + Math.sin(k * Math.PI) * 1.2;
        g.rotation.y += dt * 18;
        G.arms[0].rotation.set(0, 0, -2.4);
        G.arms[1].rotation.set(0, 0, 2.4);
        g.scale.setScalar(Math.max(0.001, 1 - easeInBack(clamp01((k - 0.5) / 0.5))));
        if (k >= 1) {
          puff(pos3.x, pos3.y + 0.3, pos3.z, 18, 0.9, 2, 0xd9c8ff);
          sparkle(pos3.x, pos3.y + 0.5, pos3.z, 12, 0xc77dff, 3);
          return false;
        }
        return true;
      },
      dispose() {
        removeModel(g);
        cd.dispose();
      },
    });
  }

  // ======================================================= SANTA FLYOVER

  function santaFlyover(onDrop) {
    const pp = playerPos();
    const cx = pp ? pp.x : 0;
    const cz = pp ? pp.z : 0;
    const cy = pp ? pp.y || 0 : groundY(0, 0);
    let fx;
    let fz;
    let mid = null;
    const SCALE = 1.3;
    const TOP = 2.5 * SCALE; // height of Santa's hat above the runners
    const cam = ctx.camera;
    if (cam && cam.isPerspectiveCamera && typeof cam.getWorldDirection === 'function') {
      // Pick the swoop's lowest point 15 m in front of the camera, at the
      // height where Santa's hat sits ~78 % up the screen for the camera's
      // current pitch and FOV, so he crosses the view however it is tilted.
      cam.updateMatrixWorld();
      const look = cam.getWorldDirection(new THREE.Vector3());
      const hl = Math.hypot(look.x, look.z);
      if (hl > 1e-4) {
        fx = look.x / hl;
        fz = look.z / hl;
        const fovV = ((Number(cam.fov) || 55) * Math.PI) / 180;
        const pitchDown = Math.asin(Math.max(-1, Math.min(1, -look.y)));
        const beta = Math.atan(0.78 * Math.tan(fovV / 2));
        const d = 15;
        const yTop = cam.position.y + d * Math.tan(Math.max(-1.2, Math.min(1.2, beta - pitchDown)));
        mid = new THREE.Vector3(cam.position.x + fx * d, yTop - TOP, cam.position.z + fz * d);
      }
    }
    if (!mid) {
      if (cam && cam.position && pp) {
        fx = cx - cam.position.x;
        fz = cz - cam.position.z;
      } else {
        const f = (ctx.player && ctx.player.facing) || 0;
        fx = Math.sin(f);
        fz = Math.cos(f);
      }
    }
    let fl = Math.hypot(fx, fz);
    if (!(fl > 1e-4)) {
      fx = 0;
      fz = 1;
      fl = 1;
    }
    fx /= fl;
    fz /= fl;
    if (!mid || !Number.isFinite(mid.x + mid.y + mid.z)) mid = new THREE.Vector3(cx + fx * 14, cy + 6, cz + fz * 14);
    const floorY = groundY(mid.x, mid.z);
    mid.y = Math.min(Math.max(mid.y, floorY + 1.6), floorY + 14);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const lx = fz * dir;
    const lz = -fx * dir;
    const half = 40;
    const S = new THREE.Vector3(mid.x - lx * half, mid.y, mid.z - lz * half);
    const E = new THREE.Vector3(mid.x + lx * half, mid.y, mid.z + lz * half);
    const yaw = Math.atan2(E.x - S.x, E.z - S.z);

    const F = buildSantaSleigh();
    const g = F.group;
    g.scale.setScalar(SCALE);
    g.position.copy(S);
    g.rotation.y = yaw;
    root.add(g);

    const SWOOP = 6; // how much higher the ends of the path are than the middle
    const gifts = [];
    const st = { t: 0, dur: 6, hoho: false, dropped: false, trailT: 0 };

    function dropGifts(from) {
      const target = playerPos();
      const tx = target ? target.x : from.x;
      const tz = target ? target.z : from.z;
      for (let i = 0; i < 5; i++) {
        const gift = buildGift(FESTIVE[i % FESTIVE.length] === 0xffffff ? 0xff8fc7 : FESTIVE[i % FESTIVE.length]);
        const a = Math.random() * TAU;
        const r = 0.6 + Math.random() * 1.4;
        const ex = tx + Math.cos(a) * r;
        const ez = tz + Math.sin(a) * r;
        gift.position.copy(from);
        gift.scale.setScalar(0.001);
        root.add(gift);
        gifts.push({
          g: gift,
          t: -i * 0.12,
          sx: from.x,
          sy: from.y,
          sz: from.z,
          ex,
          ez,
          ey: groundY(ex, ez) + 0.2,
          spin: (Math.random() - 0.5) * 10,
          done: false,
        });
      }
    }

    addActor({
      update(dt, time) {
        st.t += dt;
        const u = st.t / st.dur;
        if (u <= 1) {
          const x = lerp(S.x, E.x, u);
          const z = lerp(S.z, E.z, u);
          const arc = 2 * u - 1;
          const y = mid.y + arc * arc * SWOOP;
          g.position.set(x, y, z);
          const slope = (4 * SWOOP * arc) / (2 * half);
          g.rotation.x = -Math.atan(slope) * 0.7;
          g.rotation.z = Math.sin(u * TAU) * 0.14;
          g.visible = true;

          for (const R of F.team) {
            R.phase += dt * 13;
            const ph = R.phase;
            R.legs[0].rotation.x = Math.sin(ph) * 0.9;
            R.legs[1].rotation.x = Math.sin(ph + 0.4) * 0.9;
            R.legs[2].rotation.x = Math.sin(ph + Math.PI) * 0.9;
            R.legs[3].rotation.x = Math.sin(ph + Math.PI + 0.4) * 0.9;
            R.body.position.y = Math.abs(Math.sin(ph)) * 0.1;
            R.head.rotation.x = -Math.sin(ph + 0.6) * 0.15;
            R.glow.scale.setScalar((R === F.team[2] ? 1.3 : 0.6) + 0.12 * Math.sin(time * 7));
          }
          F.arm.rotation.z = -0.5 + Math.sin(time * 9) * 0.45;
          F.pom.position.y = 0.46 + Math.sin(time * 12) * 0.03;
          F.sack.rotation.z = Math.sin(time * 5) * 0.06;

          // sparkly trail from the runners
          st.trailT -= dt;
          while (st.trailT <= 0) {
            st.trailT += 0.018;
            const back = 1.6 * SCALE;
            trailSpark(x - Math.sin(yaw) * back, y + 0.2, z - Math.cos(yaw) * back, pickFestive(), 0.7, 1.4);
          }

          if (!st.hoho && u > 0.15) {
            st.hoho = true;
            play('hoho');
          }
        } else g.visible = false;
        if (!st.dropped && u >= 0.5) {
          st.dropped = true;
          play('jingle');
          dropGifts(g.position);
          const pp2 = playerPos();
          call(onDrop, pp2 ? pp2.clone() : g.position.clone());
        }

        let pending = false;
        for (const gf of gifts) {
          if (gf.done) continue;
          pending = true;
          gf.t += dt;
          if (gf.t < 0) continue;
          const k = clamp01(gf.t / 1.3);
          const e = k;
          gf.g.position.set(lerp(gf.sx, gf.ex, e), lerp(gf.sy, gf.ey, k * k) + Math.sin(k * Math.PI) * 1.5, lerp(gf.sz, gf.ez, e));
          gf.g.rotation.x += gf.spin * dt;
          gf.g.rotation.z += gf.spin * 0.7 * dt;
          gf.g.scale.setScalar(Math.max(0.001, elasticOut(clamp01(gf.t / 0.35)) * 1.2));
          trailSpark(gf.g.position.x, gf.g.position.y, gf.g.position.z, 0xffe680, 0.35, 0.6);
          if (k >= 1) {
            gf.done = true;
            removeModel(gf.g);
            puff(gf.ex, gf.ey, gf.ez, 8, 0.6, 1.4);
            sparkle(gf.ex, gf.ey + 0.3, gf.ez, 14, null, 3, 0.4);
          }
        }
        return u <= 1 || pending;
      },
      dispose() {
        removeModel(g);
        for (const gf of gifts) removeModel(gf.g);
      },
    });
  }

  // ============================================================== driver

  function updateParticleScale() {
    const cam = ctx.camera;
    const el = ctx.renderer && ctx.renderer.domElement;
    const h = (el && el.height) || 800;
    const fov = (cam && cam.fov) || 60;
    const s = h / (2 * Math.tan((fov * Math.PI) / 360));
    puffs.material.uniforms.uScale.value = s;
    sparks.material.uniforms.uScale.value = s;
  }

  function update(dt, time) {
    if (disposed) return;
    dt = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.1) : 0;
    clock += dt;
    const t = Number.isFinite(time) ? time : clock;
    updateParticleScale();
    if (puppy) {
      try {
        updatePuppy(dt, t);
      } catch (err) {
        console.error('[companions] puppy update failed', err);
      }
    }
    for (let i = actors.length - 1; i >= 0; i--) {
      const a = actors[i];
      let alive = false;
      try {
        alive = a.update(dt, t);
      } catch (err) {
        console.error('[companions] actor update failed', err);
      }
      if (!alive) {
        actors.splice(i, 1);
        try {
          a.dispose(false);
        } catch (err) {
          console.error('[companions] actor dispose failed', err);
        }
      }
    }
    updateStorm(dt, t);
    puffs.update(dt);
    sparks.update(dt);
  }

  function clear() {
    const list = actors.splice(0, actors.length);
    for (const a of list) {
      try {
        a.dispose(true);
      } catch (err) {
        console.error('[companions] clear failed', err);
      }
    }
    discos.clear();
    if (ride) {
      if (ride.state === 'ride') setRiding(false);
      ride = null;
    }
    removePuppy();
    barked.clear();
    stopStorm();
    puffs.reset();
    sparks.reset();
  }

  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    clear();
    removeObj(root);
    puffs.dispose();
    sparks.dispose();
    if (SF) {
      SF.balls.dispose();
      SF.marks.dispose();
      SF.markMat.dispose();
      removeModel(SF.cloud.group);
      SF = null;
    }
    if (scene && typeof scene === 'object' && LIVE.get(scene) === api) LIVE.delete(scene);
  }

  const api = {
    get hasPuppy() {
      return !!puppy;
    },
    get riding() {
      return !!ride && ride.state === 'ride';
    },
    get activeCount() {
      return actors.length + (puppy ? 1 : 0) + (storm.active ? 1 : 0);
    },
    root,
    spawnPuppy,
    removePuppy,
    jackInBox,
    reindeerRide,
    snowballStorm,
    coalBuddy,
    discoTree,
    gremlin,
    santaFlyover,
    update,
    clear,
    dispose,
  };
  if (scene && typeof scene === 'object') LIVE.set(scene, api);
  return api;
}
