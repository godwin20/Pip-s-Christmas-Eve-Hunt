// Pip the penguin: model, animation and movement.
//
// Built facing +Z with feet at y = 0. `group.position` is Pip's ground point
// (position.y = world.heightAt). The riding offset, hops and the belly-slide
// pose all live on inner nodes, so other modules can treat `position` as the
// spot on the snow under Pip's feet.
//
// Node tree:  group (world pos, rotation.y = facing)
//               lift   (riding offset + hops + waddle bob)
//               roll   (waddle rock / lean, pivot at the feet)
//               tilt   (belly-slide pitch + slide bank, pivot at body centre)
//               spin   (celebration twirl)
//               squash (squash & stretch, pivot at the feet) -> all the meshes

import * as THREE from 'three';
import { toon, addOutline } from './materials.js';

const TAU = Math.PI * 2;

export const PIP_RADIUS = 0.6;
export const WALK_SPEED = 6;
const SLIDE_MULT = 1.7;
const RIDE_OFFSET = 0.9;

// Model layout (metres).
const BODY_Y = 0.47;
const BODY_R = 0.42;
const HEAD_Y = 0.92;
const HEAD_R = 0.34;
const NECK_Y = 0.7; // head pivot
const TILT_Y = 0.45; // belly-slide pivot (body centre)
const FLIPPER_X = 0.385; // shoulder pivots
const FLIPPER_X_JUMPER = 0.43; // pushed out a little so they poke out of the jumper
const FACE = { y: 0.89, z: 0.19, ax: 0.285, ay: 0.27, az: 0.165 };

const COLORS = {
  ink: 0x2b3152, // penguin "black": soft navy so the toon bands still read at night
  belly: 0xfdfbff,
  beak: 0xffa431,
  feet: 0xff8a2b,
  cheek: 0xff8fab,
  eye: 0x1d1530,
  iris: 0x5d58da,
  mouth: 0x9a2846,
  red: 0xe63946,
  white: 0xfdf6ee,
  green: 0x2a9d6f,
  greenDark: 0x1f7a55,
  gold: 0xffc94a,
};

// ---------------------------------------------------------------- helpers
function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function damp(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
function num(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

const FIDGETS = ['look', 'flap', 'shake', 'hop'];

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// Toon material with a soft moonlight rim, so the dark penguin pops against the
// night. Falls back to plain toon shading if the shader chunk ever changes.
function rimToon(color, rimColor, strength, extra = {}) {
  const base = toon(color);
  const mat = new THREE.MeshToonMaterial({ color, gradientMap: base.gradientMap, ...extra });
  const rim = { value: new THREE.Color(rimColor).multiplyScalar(strength) };
  mat.userData.rimColor = rim;
  mat.onBeforeCompile = (shader) => {
    if (!shader.fragmentShader.includes('#include <emissivemap_fragment>')) return;
    shader.uniforms.pipRimColor = rim;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 pipRimColor;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float pipRim = 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) );
          totalEmissiveRadiance += pipRimColor * smoothstep( 0.58, 0.92, pipRim );
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'pip-rim-toon-v1';
  return mat;
}

// Paints every triangle one flat colour, picked by its centroid (knit pixels,
// scarf stripes). Works on a non-indexed copy; disposes the original.
function paintFaces(geometry, pick) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    _c.set(pick(cx, cy, cz));
    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3] = _c.r;
      colors[(i + k) * 3 + 1] = _c.g;
      colors[(i + k) * 3 + 2] = _c.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

// Merges simple parts into one vertex-coloured geometry (one draw call).
function mergeColored(parts) {
  const prepared = [];
  let total = 0;
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    g.applyMatrix4(p.matrix);
    prepared.push(g);
    total += g.attributes.position.count;
  }
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (let i = 0; i < prepared.length; i++) {
    const g = prepared[i];
    const count = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    _c.set(parts[i].color);
    for (let k = 0; k < count; k++) {
      col[(o + k) * 3] = _c.r;
      col[(o + k) * 3 + 1] = _c.g;
      col[(o + k) * 3 + 2] = _c.b;
    }
    o += count;
    g.dispose();
  }
  for (const p of parts) p.geo.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

// Flat-shaded look without the flatShading flag (MeshToonMaterial has none):
// a non-indexed copy gets one normal per triangle.
function faceted(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  g.computeVertexNormals();
  return g;
}

function partMatrix(x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
}

// Matrix for a unit cylinder (height 1 along Y) stretched from a to b.
function stickMatrix(ax, ay, az, bx, by, bz, r) {
  const a = new THREE.Vector3(ax, ay, az);
  const b = new THREE.Vector3(bx, by, bz);
  const d = b.clone().sub(a);
  const len = d.length() || 1e-3;
  const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, d.normalize());
  return new THREE.Matrix4().compose(a.add(b).multiplyScalar(0.5), q, new THREE.Vector3(r, len, r));
}

// Paper cracker crown: a slightly flared band with zig-zag points, crinkled.
function makeCrownGeometry() {
  const P = 7;
  const SEG = 4;
  const N = P * SEG;
  const rB = 0.297;
  const rT = 0.316;
  const rTip = 0.336;
  const hB = 0.072;
  const hTip = 0.165;
  const rAt = (i, y) => (rB + (rT - rB) * (y / hB)) * (i % 2 ? 1.012 : 0.99);
  const pt = (i, y, r, out) => {
    const a = ((i - SEG / 2) / N) * TAU; // a point sits right at the front
    out.push(Math.sin(a) * r, y, Math.cos(a) * r);
  };
  const pos = [];
  for (let i = 0; i < N; i++) {
    // band quad (CCW seen from outside)
    pt(i, 0, rAt(i, 0), pos);
    pt(i + 1, 0, rAt(i + 1, 0), pos);
    pt(i + 1, hB, rAt(i + 1, hB), pos);
    pt(i, 0, rAt(i, 0), pos);
    pt(i + 1, hB, rAt(i + 1, hB), pos);
    pt(i, hB, rAt(i, hB), pos);
  }
  for (let k = 0; k < P; k++) {
    for (let j = 0; j < SEG; j++) {
      const i = k * SEG + j;
      pt(i, hB, rAt(i, hB), pos);
      pt(i + 1, hB, rAt(i + 1, hB), pos);
      pt(k * SEG + SEG / 2, hTip, rTip, pos);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// Soft round contact shadow (vertex alpha fades to the rim).
function makeBlobGeometry() {
  const seg = 24;
  const radii = [0, 0.34, 0.6];
  const alphas = [0.34, 0.24, 0];
  const positions = [0, 0, 0];
  const colors = [1, 1, 1, alphas[0]];
  for (let r = 1; r < radii.length; r++) {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * TAU;
      positions.push(Math.sin(a) * radii[r], 0, Math.cos(a) * radii[r]);
      colors.push(1, 1, 1, alphas[r]);
    }
  }
  const idx = [];
  for (let i = 0; i < seg; i++) idx.push(0, 1 + ((i + 1) % seg), 1 + i);
  for (let i = 0; i < seg; i++) {
    const a = 1 + i;
    const b = 1 + ((i + 1) % seg);
    const c = 1 + seg + i;
    const d = 1 + seg + ((i + 1) % seg);
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Ugly-jumper knit pattern: rows top->bottom, 40 columns, column 0 at the front.
const KNIT_ROWS = 14;
const KNIT_COLS = 40;
const KNIT_THETA0 = 0.95;
const KNIT_THETA_LEN = 1.4;
function knitColor(row, col) {
  const G = COLORS.green;
  const R = COLORS.red;
  const W = COLORS.white;
  const m8 = col % 8;
  const m4 = col % 4;
  switch (row) {
    case 0:
      return G;
    case 1:
      return col % 2 === 0 ? W : G;
    case 2:
      return G;
    case 3:
      return R;
    case 4:
      return m8 === 4 ? W : R;
    case 5:
      return m8 >= 3 && m8 <= 5 ? W : m8 === 0 ? COLORS.gold : R;
    case 6:
      return m8 === 4 ? W : R;
    case 7:
      return R;
    case 8:
      return G;
    case 9:
      return m4 === 0 ? W : G;
    case 10:
      return m4 === 1 || m4 === 3 ? W : G;
    case 11:
      return m4 === 2 ? W : G;
    case 12:
      return col % 6 === 3 ? W : G;
    default:
      return R;
  }
}

// ---------------------------------------------------------------- shared bits
let shared = null;
function sharedMats() {
  if (shared) return shared;
  shared = {
    eye: new THREE.MeshBasicMaterial({ color: COLORS.eye }),
    iris: new THREE.MeshBasicMaterial({ color: COLORS.iris }),
    shine: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    blob: new THREE.MeshBasicMaterial({
      color: 0x160d38,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  };
  return shared;
}

// ---------------------------------------------------------------- the penguin
export function createPlayer() {
  const S = sharedMats();
  const owned = []; // geometries / materials this player made (disposed in dispose())
  const own = (x) => {
    owned.push(x);
    return x;
  };

  const inkMat = own(rimToon(COLORS.ink, 0x9fb2ff, 0.5, { emissive: 0x0b0e22 }));
  const bellyMat = toon(COLORS.belly, { emissive: 0x1d2240 });
  const beakMat = toon(COLORS.beak, { emissive: 0x301200 });
  const feetMat = toon(COLORS.feet, { emissive: 0x301200 });
  const cheekMat = toon(COLORS.cheek, { emissive: 0x401028 });
  const mouthMat = toon(COLORS.mouth);

  const gSphere = own(new THREE.SphereGeometry(1, 28, 20));
  const gSphereLo = own(new THREE.SphereGeometry(1, 14, 10));
  const gBeak = own(new THREE.ConeGeometry(0.07, 0.13, 12));
  const gBeakLow = own(new THREE.ConeGeometry(0.05, 0.085, 10));
  const gTail = own(new THREE.ConeGeometry(0.1, 0.17, 8));
  const gHappy = own(new THREE.TorusGeometry(0.058, 0.017, 6, 14, Math.PI));

  function part(geometry, material, parent, o = {}) {
    const m = new THREE.Mesh(geometry, material);
    if (o.p) m.position.set(o.p[0], o.p[1], o.p[2]);
    if (o.s) m.scale.set(o.s[0], o.s[1], o.s[2]);
    if (o.r) m.rotation.set(o.r[0], o.r[1], o.r[2]);
    m.castShadow = !!o.cast;
    m.receiveShadow = false;
    if (o.outline) addOutline(m, o.outline);
    parent.add(m);
    return m;
  }

  // ---- node tree
  const group = new THREE.Group();
  group.name = 'Pip';
  const lift = new THREE.Group();
  const roll = new THREE.Group();
  const tilt = new THREE.Group();
  const spin = new THREE.Group();
  const squash = new THREE.Group();
  tilt.position.y = TILT_Y;
  squash.position.y = -TILT_Y;
  group.add(lift);
  lift.add(roll);
  roll.add(tilt);
  tilt.add(spin);
  spin.add(squash);

  // ---- body
  part(gSphere, inkMat, squash, {
    p: [0, BODY_Y, 0],
    s: [BODY_R, BODY_R * 1.02, BODY_R * 0.96],
    cast: true,
    outline: 0.045,
  });
  const tummy = part(gSphere, bellyMat, squash, { p: [0, 0.44, 0.2], s: [0.34, 0.357, 0.255] });

  // tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.2, -0.33);
  squash.add(tailPivot);
  part(gTail, inkMat, tailPivot, { p: [0, -0.02, -0.05], r: [-Math.PI / 2 - 0.45, 0, 0], outline: 0.08 });

  // flippers
  function makeFlipper(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * FLIPPER_X, 0.63, 0);
    squash.add(pivot);
    part(gSphere, inkMat, pivot, {
      p: [0, -0.17, 0],
      s: [0.062, 0.2, 0.11],
      r: [0, 0, side * 0.08],
      cast: true,
      outline: 0.08,
    });
    return pivot;
  }
  const flipperL = makeFlipper(1); // +X is Pip's left
  const flipperR = makeFlipper(-1);

  // feet
  function makeFoot(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.15, 0, 0.06);
    pivot.rotation.y = side * 0.22;
    squash.add(pivot);
    part(gSphere, feetMat, pivot, { p: [0, 0.04, 0.07], s: [0.115, 0.045, 0.165], cast: true, outline: 0.1 });
    return pivot;
  }
  const footL = makeFoot(1);
  const footR = makeFoot(-1);

  // ---- head
  const headPivot = new THREE.Group();
  headPivot.position.y = NECK_Y;
  squash.add(headPivot);
  part(gSphere, inkMat, headPivot, {
    p: [0, HEAD_Y - NECK_Y, 0],
    s: [HEAD_R, HEAD_R, HEAD_R],
    cast: true,
    outline: 0.05,
  });
  part(gSphere, bellyMat, headPivot, {
    p: [0, FACE.y - NECK_Y, FACE.z],
    s: [FACE.ax, FACE.ay, FACE.az],
  });

  // Front surface of the face (head sphere or white face mask, whichever is in front).
  function faceSurface(x, y, outN) {
    const dy = y - HEAD_Y;
    const hh = HEAD_R * HEAD_R - x * x - dy * dy;
    const hz = hh > 0 ? Math.sqrt(hh) : 0;
    const t = 1 - (x / FACE.ax) ** 2 - ((y - FACE.y) / FACE.ay) ** 2;
    const fz = t > 0 ? FACE.z + FACE.az * Math.sqrt(t) : -1;
    if (fz >= hz) {
      outN
        .set(x / (FACE.ax * FACE.ax), (y - FACE.y) / (FACE.ay * FACE.ay), (fz - FACE.z) / (FACE.az * FACE.az))
        .normalize();
      return fz;
    }
    outN.set(x, dy, hz).normalize();
    return hz;
  }
  function onFace(obj, x, y, inset) {
    const z = faceSurface(x, y, _n);
    obj.position.set(x - _n.x * inset, y - NECK_Y - _n.y * inset, z - _n.z * inset);
    obj.quaternion.setFromUnitVectors(Z_AXIS, _n);
    headPivot.add(obj);
    return obj;
  }

  // eyes: big glossy ovals, purple-blue glow at the bottom, two sparkles
  const gShine = own(
    mergeColored([
      { geo: new THREE.SphereGeometry(1, 12, 8), color: 0xffffff, matrix: partMatrix(-0.028, 0.034, 0.03, 0.03, 0.032, 0.014) },
      { geo: new THREE.SphereGeometry(1, 8, 6), color: 0xffffff, matrix: partMatrix(0.03, -0.036, 0.034, 0.014, 0.014, 0.008) },
    ]),
  );
  const blinkNodes = [];
  const happyNodes = [];
  const shineNodes = [];
  function makeEye(side) {
    const pivot = onFace(new THREE.Group(), side * 0.12, 0.94, 0.012);
    const blink = new THREE.Group();
    pivot.add(blink);
    part(gSphere, S.eye, blink, { s: [0.082, 0.098, 0.036] });
    part(gSphereLo, S.iris, blink, { p: [0, -0.032, 0.006], s: [0.056, 0.048, 0.031] });
    // both sparkles in one mesh (one draw call)
    shineNodes.push(part(gShine, S.shine, blink, {}));
    blinkNodes.push(blink);
    const happy = new THREE.Group();
    happy.visible = false;
    pivot.add(happy);
    part(gHappy, S.eye, happy, { p: [0, -0.012, 0.012] });
    happyNodes.push(happy);
  }
  makeEye(1);
  makeEye(-1);

  // rosy cheeks (both in one mesh)
  const cheekParts = [];
  for (const side of [1, -1]) {
    const tmp = onFace(new THREE.Group(), side * 0.215, 0.845, 0.006);
    headPivot.remove(tmp);
    tmp.scale.set(0.062, 0.04, 0.016);
    tmp.updateMatrix();
    cheekParts.push({ geo: new THREE.SphereGeometry(1, 14, 10), color: 0xffffff, matrix: tmp.matrix.clone() });
  }
  part(own(mergeColored(cheekParts)), cheekMat, headPivot, {});

  // beak (upper + hinged lower half) with a little mouth behind it
  const beak = onFace(new THREE.Group(), 0, 0.835, 0.02);
  beak.scale.set(1.25, 0.8, 1);
  part(gBeak, beakMat, beak, { p: [0, 0.004, 0.055], r: [Math.PI / 2, 0, 0], cast: true, outline: 0.12 });
  const mouth = part(gSphereLo, mouthMat, beak, { p: [0, -0.022, 0.006], s: [0.045, 0.03, 0.03] });
  mouth.visible = false; // only shown while the beak is open
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.024, 0.006);
  beak.add(jaw);
  part(gBeakLow, beakMat, jaw, { p: [0, 0, 0.04], r: [Math.PI / 2, 0, 0], outline: 0.12 });

  // hair tuft
  const tuft = new THREE.Group();
  tuft.position.set(0, HEAD_Y + HEAD_R - 0.03 - NECK_Y, 0.03);
  headPivot.add(tuft);
  const tuftGeo = own(
    mergeColored([
      { geo: new THREE.ConeGeometry(0.034, 0.13, 6), color: 0xffffff, matrix: partMatrix(-0.02, 0.05, 0, 1, 1, 1, 0.25, 0, 0.35) },
      { geo: new THREE.ConeGeometry(0.034, 0.13, 6), color: 0xffffff, matrix: partMatrix(0.03, 0.045, -0.01, 0.85, 0.8, 0.85, 0.1, 0, -0.55) },
    ]),
  );
  part(tuftGeo, inkMat, tuft, {});

  // hats hang off this anchor at the head centre
  const hatAnchor = new THREE.Group();
  hatAnchor.position.y = HEAD_Y - NECK_Y;
  headPivot.add(hatAnchor);

  // ---- blob shadow (stays on the snow)
  const blobGeo = own(makeBlobGeometry());
  const blob = new THREE.Mesh(blobGeo, S.blob);
  blob.position.y = 0.03;
  blob.renderOrder = 1;
  group.add(blob);

  // ---- snow puffs (pooled InstancedMesh, lives in Pip's parent space)
  const PUFFS = 40;
  const puffGeo = own(new THREE.IcosahedronGeometry(1, 1));
  const puffs = new THREE.InstancedMesh(puffGeo, toon(0xf4f8ff, { emissive: 0x2a3552 }), PUFFS);
  puffs.name = 'PipSnowPuffs';
  puffs.frustumCulled = false;
  puffs.castShadow = false;
  puffs.receiveShadow = false;
  const pf = {
    x: new Float32Array(PUFFS),
    y: new Float32Array(PUFFS),
    z: new Float32Array(PUFFS),
    vx: new Float32Array(PUFFS),
    vy: new Float32Array(PUFFS),
    vz: new Float32Array(PUFFS),
    life: new Float32Array(PUFFS),
    max: new Float32Array(PUFFS),
    size: new Float32Array(PUFFS),
    rot: new Float32Array(PUFFS),
    alive: new Uint8Array(PUFFS),
    next: 0,
    any: false,
  };
  _m.makeScale(0, 0, 0);
  for (let i = 0; i < PUFFS; i++) {
    puffs.setMatrixAt(i, _m);
    puffs.setColorAt(i, _c.set(0xffffff));
  }
  puffs.instanceMatrix.needsUpdate = true;
  if (puffs.instanceColor) puffs.instanceColor.needsUpdate = true;

  function spawnPuff(x, y, z, vx, vy, vz, size, life, ice) {
    const i = pf.next;
    pf.next = (pf.next + 1) % PUFFS;
    pf.x[i] = x;
    pf.y[i] = y;
    pf.z[i] = z;
    pf.vx[i] = vx;
    pf.vy[i] = vy;
    pf.vz[i] = vz;
    pf.life[i] = 0;
    pf.max[i] = life;
    pf.size[i] = size;
    pf.rot[i] = Math.random() * TAU;
    pf.alive[i] = 1;
    pf.any = true;
    puffs.setColorAt(i, _c.set(ice ? 0xc4ecff : 0xffffff));
    if (puffs.instanceColor) puffs.instanceColor.needsUpdate = true;
  }

  function updatePuffs(dt) {
    if (!pf.any) return;
    let any = false;
    const drag = Math.exp(-2.6 * dt);
    for (let i = 0; i < PUFFS; i++) {
      if (!pf.alive[i]) continue;
      pf.life[i] += dt;
      const f = pf.life[i] / pf.max[i];
      if (f >= 1) {
        pf.alive[i] = 0;
        _m.makeScale(0, 0, 0);
        puffs.setMatrixAt(i, _m);
        continue;
      }
      any = true;
      pf.vx[i] *= drag;
      pf.vz[i] *= drag;
      pf.vy[i] = pf.vy[i] * drag - 1.2 * dt;
      pf.x[i] += pf.vx[i] * dt;
      pf.y[i] += pf.vy[i] * dt;
      pf.z[i] += pf.vz[i] * dt;
      const s = pf.size[i] * Math.min(1, f * 7) * (1 - f * f);
      _m.makeRotationY(pf.rot[i] + f * 2);
      _m.scale(_s.set(s, s * 0.85, s));
      _m.setPosition(pf.x[i], pf.y[i], pf.z[i]);
      puffs.setMatrixAt(i, _m);
    }
    puffs.instanceMatrix.needsUpdate = true;
    pf.any = any;
  }

  function clearPuffs() {
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < PUFFS; i++) {
      pf.alive[i] = 0;
      puffs.setMatrixAt(i, _m);
    }
    puffs.instanceMatrix.needsUpdate = true;
    pf.any = false;
  }

  // ---------------------------------------------------------------- cosmetics
  let crown = null; // { pivot, outer, inner, color }
  let bobble = null; // { group, pomPivot }
  let scarf = null; // { group, tails: [] }
  let jumper = null; // { group }
  const cos = { scarf: false, bobble: false, jumper: false };

  function buildCrown() {
    const geo = own(makeCrownGeometry());
    const pivot = new THREE.Group();
    const wobble = new THREE.Group();
    pivot.add(wobble);
    const outer = new THREE.Mesh(geo, toon(0xffffff));
    const inner = new THREE.Mesh(geo, toon(0xffffff));
    outer.castShadow = true;
    wobble.add(outer, inner);
    return { pivot, wobble, outer, inner, color: null };
  }

  function buildBobble() {
    const g = new THREE.Group();
    g.rotation.set(-0.28, 0, 0.06);
    const domeGeo = own(
      paintFaces(new THREE.SphereGeometry(0.36, 24, 12, 0, TAU, 0, 1.2), (x, y, z) => {
        const th = Math.acos(clamp(y / Math.max(1e-6, Math.hypot(x, y, z)), -1, 1));
        return th > 0.6 && th < 0.8 ? COLORS.white : COLORS.red;
      }),
    );
    part(domeGeo, toon(0xffffff, { vertexColors: true }), g, { s: [1, 1.1, 1], cast: true, outline: 0.04 });
    const brimGeo = own(faceted(new THREE.TorusGeometry(0.336, 0.058, 8, 28)));
    part(brimGeo, toon(COLORS.white), g, {
      p: [0, 0.36 * Math.cos(1.2) * 1.1, 0],
      r: [Math.PI / 2, 0, 0],
      cast: true,
    });
    const pomPivot = new THREE.Group();
    pomPivot.position.set(0, 0.36 * 1.1 - 0.01, 0);
    g.add(pomPivot);
    const pomGeo = own(faceted(new THREE.IcosahedronGeometry(0.105, 1)));
    part(pomGeo, toon(COLORS.white), pomPivot, { p: [0, 0.07, -0.02], cast: true, outline: 0.06 });
    return { group: g, pomPivot };
  }

  function buildScarf() {
    const g = new THREE.Group();
    const ringGeo = own(
      paintFaces(new THREE.TorusGeometry(0.345, 0.07, 8, 48), (x, y) => {
        const a = Math.atan2(y, x) / TAU + 1;
        return Math.floor(a * 24) % 3 === 2 ? COLORS.white : COLORS.red;
      }),
    );
    part(ringGeo, toon(0xffffff, { vertexColors: true }), g, {
      p: [0, 0.71, 0],
      r: [Math.PI / 2 + 0.08, 0, 0],
      s: [1, 0.96, 1],
      cast: true,
      outline: 0.05,
    });
    const knotGeo = own(new THREE.SphereGeometry(0.075, 12, 8));
    part(knotGeo, toon(COLORS.red), g, { p: [-0.17, 0.69, -0.31], s: [1, 0.9, 0.8], cast: true, outline: 0.08 });
    const tails = [];
    const tailDefs = [
      { p: [-0.15, 0.68, -0.35], len: 0.3, rx: 0.22, rz: -0.12 },
      { p: [-0.21, 0.67, -0.31], len: 0.24, rx: 0.12, rz: 0.22 },
    ];
    for (const d of tailDefs) {
      const box = new THREE.BoxGeometry(0.105, d.len, 0.03, 1, 8, 1);
      box.translate(0, -d.len / 2, 0);
      const geo = own(
        paintFaces(box, (x, y) => {
          const f = -y / d.len; // 0 at the knot, 1 at the end
          if (f > 0.86) return COLORS.white; // fringe
          return Math.floor(f * 7) % 3 === 2 ? COLORS.white : COLORS.red;
        }),
      );
      const pivot = new THREE.Group();
      pivot.position.set(d.p[0], d.p[1], d.p[2]);
      pivot.rotation.set(d.rx, 0, d.rz);
      g.add(pivot);
      part(geo, toon(0xffffff, { vertexColors: true }), pivot, { cast: true, outline: 0.06 });
      tails.push({ pivot, rx: d.rx, rz: d.rz });
    }
    return { group: g, tails };
  }

  function buildJumper() {
    const g = new THREE.Group();
    const knitGeo = own(
      paintFaces(new THREE.SphereGeometry(0.447, KNIT_COLS, KNIT_ROWS, 0, TAU, KNIT_THETA0, KNIT_THETA_LEN), (x, y, z) => {
        const len = Math.max(1e-6, Math.hypot(x, y, z));
        const th = Math.acos(clamp(y / len, -1, 1));
        const row = clamp(Math.floor(((th - KNIT_THETA0) / KNIT_THETA_LEN) * KNIT_ROWS), 0, KNIT_ROWS - 1);
        const u = (Math.atan2(x, z) / TAU + 1) % 1;
        const col = Math.floor(u * KNIT_COLS) % KNIT_COLS;
        return knitColor(row, col);
      }),
    );
    part(knitGeo, toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide }), g, {
      p: [0, BODY_Y, 0],
      s: [1, 1.02, 0.97],
      cast: true,
      outline: 0.035,
    });
    // ribbed collar and hem
    const collarGeo = own(new THREE.TorusGeometry(0.36, 0.03, 6, 32));
    const hemGeo = own(new THREE.TorusGeometry(0.318, 0.032, 6, 32));
    const ribMat = toon(COLORS.red);
    part(collarGeo, ribMat, g, {
      p: [0, BODY_Y + 0.447 * Math.cos(KNIT_THETA0) * 1.02, 0],
      r: [Math.PI / 2, 0, 0],
      s: [1, 0.97, 1],
    });
    part(hemGeo, ribMat, g, {
      p: [0, BODY_Y + 0.447 * Math.cos(KNIT_THETA0 + KNIT_THETA_LEN) * 1.02, 0],
      r: [Math.PI / 2, 0, 0],
      s: [1, 0.97, 1],
    });
    // a little reindeer face badge with a glowing red nose
    const brown = 0x9a5b33;
    const antler = 0x6b3e1f;
    const parts = [
      { geo: new THREE.SphereGeometry(1, 14, 10), color: brown, matrix: partMatrix(0, 0.45, 0.432, 0.085, 0.08, 0.035) },
      { geo: new THREE.SphereGeometry(1, 10, 8), color: 0xe0b07a, matrix: partMatrix(0, 0.418, 0.458, 0.05, 0.035, 0.02) },
      { geo: new THREE.SphereGeometry(1, 10, 8), color: 0xff2f45, matrix: partMatrix(0, 0.432, 0.474, 0.027, 0.025, 0.02) },
      { geo: new THREE.SphereGeometry(1, 8, 6), color: COLORS.eye, matrix: partMatrix(0.032, 0.468, 0.459, 0.013, 0.015, 0.008) },
      { geo: new THREE.SphereGeometry(1, 8, 6), color: COLORS.eye, matrix: partMatrix(-0.032, 0.468, 0.459, 0.013, 0.015, 0.008) },
      { geo: new THREE.SphereGeometry(1, 8, 6), color: brown, matrix: partMatrix(0.083, 0.49, 0.425, 0.032, 0.017, 0.012, 0, 0, -0.5) },
      { geo: new THREE.SphereGeometry(1, 8, 6), color: brown, matrix: partMatrix(-0.083, 0.49, 0.425, 0.032, 0.017, 0.012, 0, 0, 0.5) },
    ];
    for (const s of [1, -1]) {
      parts.push({
        geo: new THREE.CylinderGeometry(1, 1, 1, 6),
        color: antler,
        matrix: stickMatrix(s * 0.035, 0.505, 0.43, s * 0.07, 0.585, 0.425, 0.011),
      });
      parts.push({
        geo: new THREE.CylinderGeometry(1, 1, 1, 6),
        color: antler,
        matrix: stickMatrix(s * 0.052, 0.545, 0.428, s * 0.095, 0.56, 0.42, 0.009),
      });
    }
    const badgeGeo = own(mergeColored(parts));
    part(badgeGeo, toon(0xffffff, { vertexColors: true }), g, {});
    return { group: g };
  }

  function layoutHats() {
    if (bobble) bobble.group.visible = cos.bobble;
    tuft.visible = !cos.bobble;
    if (!crown) return;
    const host = cos.bobble && bobble ? bobble.group : hatAnchor;
    if (crown.pivot.parent !== host) host.add(crown.pivot);
    if (host === hatAnchor) {
      crown.pivot.position.set(0, 0.168, 0);
      crown.pivot.rotation.set(-0.06, 0, 0.12);
      crown.pivot.scale.setScalar(1);
    } else {
      crown.pivot.position.set(0, 0.226, -0.004);
      crown.pivot.rotation.set(0, 0, 0.1);
      crown.pivot.scale.setScalar(1.01);
    }
  }

  // ---------------------------------------------------------------- state
  const st = {
    t: 0,
    phase: 0,
    stepIndex: 0,
    walkAmt: 0,
    slideAmt: 0,
    rideAmt: 0,
    iceAmt: 0,
    sq: 0, // squash spring position (+ = stretch)
    sqv: 0,
    lean: 0,
    bank: 0,
    angVel: 0,
    accel: 0,
    prevSpeed: 0,
    gx: 0,
    gz: 0,
    celebrateT: -1,
    celebrateKind: 1,
    celebLaunched: false,
    celebLanded: false,
    blinkTimer: 1.5,
    blinkT: -1,
    winceT: 0,
    idleTime: 0,
    fidget: null,
    fidgetT: 0,
    nextFidget: 7,
    lookTimer: 2,
    headYaw: 0,
    headYawGoal: 0,
    headTilt: 0,
    headTiltGoal: 0,
    beakOpen: 0,
    slideCooldown: 0,
    bonkCooldown: 0,
    slideEmit: 0,
    riding: false,
    lastGoodX: 0,
    lastGoodZ: 0,
  };

  function emit(name, arg) {
    const fn = player[name];
    if (typeof fn !== 'function') return;
    try {
      fn(arg);
    } catch (err) {
      console.error(`player.${name} callback failed`, err);
    }
  }

  function kick(v) {
    st.sqv += v;
  }

  // local (x, z) offset -> parent space, using current facing
  function toWorldXZ(lx, lz, out) {
    const f = player.facing;
    const c = Math.cos(f);
    const s = Math.sin(f);
    out.x = group.position.x + lx * c + lz * s;
    out.z = group.position.z - lx * s + lz * c;
    return out;
  }
  const _w = { x: 0, z: 0 };

  function puffBurst(count, spread, up, size, ice) {
    const p = group.position;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + Math.random() * 0.5;
      spawnPuff(
        p.x + Math.sin(a) * 0.3,
        p.y + 0.08,
        p.z + Math.cos(a) * 0.3,
        Math.sin(a) * spread,
        up * (0.6 + Math.random() * 0.6),
        Math.cos(a) * spread,
        size * (0.7 + Math.random() * 0.6),
        0.5 + Math.random() * 0.3,
        ice,
      );
    }
  }

  function startSlide(dirX, dirZ, speed, walkSpeed) {
    player.sliding = true;
    const launch = Math.max(speed, walkSpeed * 1.25);
    player.velocity.x = dirX * launch;
    player.velocity.z = dirZ * launch;
    kick(-3.2);
    puffBurst(7, 1.6, 1.4, 0.12, player.onIce);
    emit('onSlideStart');
  }

  function stopSlide() {
    if (!player.sliding) return;
    player.sliding = false;
    st.slideCooldown = 0.3;
    kick(3.4);
    emit('onSlideEnd');
  }

  function sampleSlope(world, x, z) {
    st.gx = 0;
    st.gz = 0;
    if (!world || typeof world.heightAt !== 'function') return;
    const e = 0.5;
    const hx1 = world.heightAt(x + e, z);
    const hx0 = world.heightAt(x - e, z);
    const hz1 = world.heightAt(x, z + e);
    const hz0 = world.heightAt(x, z - e);
    const gx = (hx1 - hx0) / (2 * e);
    const gz = (hz1 - hz0) / (2 * e);
    if (Number.isFinite(gx)) st.gx = clamp(gx, -2, 2);
    if (Number.isFinite(gz)) st.gz = clamp(gz, -2, 2);
  }

  // ---------------------------------------------------------------- public object
  const player = {
    group,
    position: group.position,
    facing: 0,
    velocity: new THREE.Vector3(),
    radius: PIP_RADIUS,
    sliding: false,
    // extras
    riding: false,
    onIce: false,
    speed: 0,
    fx: puffs, // snow-puff InstancedMesh (auto-added to Pip's parent)
    onStep: null, // (side) => {}  e.g. sfx.play('footstep')
    onSlideStart: null, // e.g. sfx.play('slide')
    onSlideEnd: null,
    onBonk: null, // (impactSpeed) => {}  bumped into something while sliding
    onLand: null, // end of a celebrate hop

    update(dt, opts = {}) {
      dt = num(dt, 0);
      if (dt <= 0) return;
      dt = Math.min(dt, 0.1);
      st.t += dt;
      const o = opts || {};
      const world = o.world && typeof o.world === 'object' ? o.world : null;
      const pos = group.position;
      const vel = player.velocity;

      // keep the puff mesh living next to Pip
      if (group.parent && puffs.parent !== group.parent) group.parent.add(puffs);
      else if (!group.parent && puffs.parent) puffs.parent.remove(puffs);

      // ---- inputs
      let mx = o.move ? num(o.move.x, 0) : 0;
      let my = o.move ? num(o.move.y, 0) : 0;
      let mag = Math.hypot(mx, my);
      if (mag > 1) {
        mx /= mag;
        my /= mag;
        mag = 1;
      }
      const hasInput = mag > 0.08;
      const yaw = num(o.cameraYaw, 0);
      const speedMult = num(o.speedMult, 1) > 0 ? num(o.speedMult, 1) : 1;
      const iceGrip = !!o.iceGrip;
      const fy = Math.sin(yaw);
      const fz = Math.cos(yaw);
      // forward = (sin yaw, cos yaw), right = (-cos yaw, sin yaw)
      let dirX = fy * my - fz * mx;
      let dirZ = fz * my + fy * mx;
      const dl = Math.hypot(dirX, dirZ);
      if (dl > 1e-6) {
        dirX /= dl;
        dirZ /= dl;
      } else {
        dirX = 0;
        dirZ = 0;
      }

      // ---- ground
      const onIce = !!(world && typeof world.isIce === 'function' && world.isIce(pos.x, pos.z));
      player.onIce = onIce;
      const slippery = onIce && !iceGrip;
      st.iceAmt += ((slippery ? 1 : 0) - st.iceAmt) * damp(6, dt);
      sampleSlope(world, pos.x, pos.z);

      const walkSpeed = WALK_SPEED * speedMult;
      let speed = Math.hypot(vel.x, vel.z);

      // ---- slide state
      st.slideCooldown -= dt;
      st.bonkCooldown -= dt;
      const wantsSlide = !!o.slide && !st.riding;
      if (!player.sliding) {
        if (wantsSlide && st.slideCooldown <= 0 && (hasInput || speed > 2.5)) {
          const hx = hasInput ? dirX : vel.x / Math.max(speed, 1e-6);
          const hz = hasInput ? dirZ : vel.z / Math.max(speed, 1e-6);
          startSlide(hx, hz, speed, walkSpeed);
          speed = Math.hypot(vel.x, vel.z);
        }
      } else if (!wantsSlide || (speed < 1.2 && !hasInput)) {
        stopSlide();
      }

      // ---- velocity
      if (player.sliding) {
        let ang = speed > 0.05 ? Math.atan2(vel.x, vel.z) : hasInput ? Math.atan2(dirX, dirZ) : player.facing;
        let s = speed;
        const top = walkSpeed * SLIDE_MULT * (onIce ? 1.15 : 1);
        if (hasInput) {
          const diff = wrapAngle(Math.atan2(dirX, dirZ) - ang);
          const maxTurn = (slippery ? 1.3 : 2.4) * dt; // reduced steering
          ang += clamp(diff, -maxTurn, maxTurn);
          const against = Math.cos(diff);
          if (against < -0.2) s -= 5 * -against * dt; // pulling back brakes
        }
        if (hasInput && s < top * mag) s += (top * mag - s) * damp(2.4, dt);
        else s -= (slippery ? 0.35 : 2.2) * dt; // coast on momentum
        // a little help (or hindrance) from hills
        s -= (st.gx * Math.sin(ang) + st.gz * Math.cos(ang)) * 6.5 * dt;
        s = clamp(s, 0, walkSpeed * 2.4);
        vel.x = Math.sin(ang) * s;
        vel.z = Math.cos(ang) * s;
      } else {
        const tx = dirX * walkSpeed * mag;
        const tz = dirZ * walkSpeed * mag;
        const rate = slippery ? (hasInput ? 1.5 : 0.45) : hasInput ? 11 : 14;
        const k = damp(rate, dt);
        vel.x += (tx - vel.x) * k;
        vel.z += (tz - vel.z) * k;
      }
      vel.y = 0;

      // ---- integrate + collide (substeps so fast slides can't tunnel)
      const canResolve = world && typeof world.resolveCollision === 'function';
      const travel = Math.hypot(vel.x, vel.z) * dt;
      const steps = Math.min(8, Math.max(1, Math.ceil(travel / 0.3)));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        pos.x += vel.x * h;
        pos.z += vel.z * h;
        if (!canResolve) continue;
        const ex = pos.x;
        const ez = pos.z;
        world.resolveCollision(pos, PIP_RADIUS);
        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.z)) {
          pos.x = ex;
          pos.z = ez;
          continue;
        }
        const px = pos.x - ex;
        const pz = pos.z - ez;
        const pl = Math.hypot(px, pz);
        if (pl > 1e-6) {
          const nx = px / pl;
          const nz = pz / pl;
          const vn = vel.x * nx + vel.z * nz;
          if (vn < 0) {
            let bounce = 0;
            if (player.sliding && vn < -4 && st.bonkCooldown <= 0) {
              bounce = 0.45;
              st.bonkCooldown = 0.6;
              st.winceT = 0.5;
              kick(-4.5);
              puffBurst(6, 1.2, 1.6, 0.1, onIce);
              emit('onBonk', -vn);
            }
            vel.x -= nx * vn * (1 + bounce);
            vel.z -= nz * vn * (1 + bounce);
          }
        }
      }
      if (!Number.isFinite(pos.x) || !Number.isFinite(pos.z)) {
        pos.x = st.lastGoodX;
        pos.z = st.lastGoodZ;
        vel.set(0, 0, 0);
      }
      st.lastGoodX = pos.x;
      st.lastGoodZ = pos.z;
      if (world && typeof world.heightAt === 'function') {
        const gy = world.heightAt(pos.x, pos.z);
        if (Number.isFinite(gy)) pos.y = gy;
      }

      const hs = Math.hypot(vel.x, vel.z);
      player.speed = hs;
      st.accel += ((hs - st.prevSpeed) / dt - st.accel) * damp(8, dt);
      st.prevSpeed = hs;

      // ---- facing
      let goal = player.facing;
      if (player.sliding) {
        if (hs > 0.3) goal = Math.atan2(vel.x, vel.z);
      } else if (hasInput) {
        goal = Math.atan2(dirX, dirZ);
      }
      const prevFacing = player.facing;
      player.facing = wrapAngle(prevFacing + wrapAngle(goal - prevFacing) * damp(player.sliding ? 8 : 15, dt));
      st.angVel += (wrapAngle(player.facing - prevFacing) / dt - st.angVel) * damp(10, dt);
      group.rotation.y = player.facing;

      animArgs.hs = hs;
      animArgs.hasInput = hasInput;
      animArgs.mag = mag;
      animArgs.slippery = slippery;
      animArgs.walkSpeed = walkSpeed;
      animate(dt, animArgs);
      updatePuffs(dt);
    },

    setHat(color) {
      if (color === null || color === undefined || color === false) {
        if (crown) crown.pivot.visible = false;
        return;
      }
      if (!crown) crown = buildCrown();
      let hex;
      try {
        hex = _c.set(color).getHex();
      } catch {
        hex = COLORS.gold;
      }
      if (crown.color !== hex) {
        crown.color = hex;
        crown.outer.material = toon(hex, { emissive: _c.setHex(hex).multiplyScalar(0.12).getHex() });
        const inner = _c.setHex(hex).multiplyScalar(0.62).getHex();
        crown.inner.material = toon(inner, { side: THREE.BackSide });
      }
      crown.pivot.visible = true;
      layoutHats();
      kick(1.5);
    },

    setCosmetics(c = {}) {
      const want = c || {};
      cos.scarf = !!want.scarf;
      cos.bobble = !!want.bobble;
      cos.jumper = !!want.jumper;
      if (cos.scarf && !scarf) {
        scarf = buildScarf();
        squash.add(scarf.group);
      }
      if (scarf) scarf.group.visible = cos.scarf;
      if (cos.bobble && !bobble) {
        bobble = buildBobble();
        hatAnchor.add(bobble.group);
      }
      if (cos.jumper && !jumper) {
        jumper = buildJumper();
        squash.add(jumper.group);
      }
      if (jumper) jumper.group.visible = cos.jumper;
      tummy.visible = !cos.jumper;
      // The jumper is chunkier than the body: nudge the flippers out so they
      // still poke out of the sides (and flap on celebrations) like little sleeves.
      const shoulderX = cos.jumper ? FLIPPER_X_JUMPER : FLIPPER_X;
      flipperL.position.x = shoulderX;
      flipperR.position.x = -shoulderX;
      layoutHats();
    },

    celebrate() {
      if (st.celebrateT >= 0 && st.celebrateT < 0.3) return; // already mid-hop
      st.celebrateT = 0;
      st.celebrateKind = (st.celebrateKind + 1) % 2; // alternate flap-hop / twirl-hop
      st.celebLaunched = false;
      st.celebLanded = false;
      kick(-2.6); // crouch before the hop
    },

    setRiding(on) {
      const r = !!on;
      if (r === st.riding) return;
      st.riding = r;
      player.riding = r;
      if (r) stopSlide();
      kick(r ? 4 : -3.5);
      if (!r) puffBurst(6, 1.4, 1.2, 0.11, player.onIce);
    },

    headPosition(target = new THREE.Vector3()) {
      headPivot.getWorldPosition(target);
      let extra = 0.78;
      if (crown && crown.pivot.visible) extra += 0.1;
      if (cos.bobble) extra += 0.12;
      target.y += extra;
      return target;
    },

    // Extra: put Pip somewhere fresh (new night / respawn) with no leftover momentum.
    reset(x = 0, z = 0, facing = 0, world = null) {
      group.position.set(num(x, 0), 0, num(z, 0));
      if (world && typeof world.heightAt === 'function') {
        const y = world.heightAt(group.position.x, group.position.z);
        if (Number.isFinite(y)) group.position.y = y;
      }
      player.facing = wrapAngle(num(facing, 0));
      group.rotation.y = player.facing;
      player.velocity.set(0, 0, 0);
      player.sliding = false;
      player.speed = 0;
      st.lastGoodX = group.position.x;
      st.lastGoodZ = group.position.z;
      st.walkAmt = 0;
      st.slideAmt = 0;
      st.sq = 0;
      st.sqv = 0;
      st.lean = 0;
      st.bank = 0;
      st.angVel = 0;
      st.accel = 0;
      st.prevSpeed = 0;
      st.celebrateT = -1;
      st.fidget = null;
      st.idleTime = 0;
      clearPuffs();
      animArgs.hs = 0;
      animArgs.hasInput = false;
      animArgs.mag = 0;
      animArgs.slippery = false;
      animArgs.walkSpeed = WALK_SPEED;
      animate(0, animArgs);
    },

    // Extra: remove from the scene and free GPU resources owned by Pip.
    dispose() {
      if (group.parent) group.parent.remove(group);
      if (puffs.parent) puffs.parent.remove(puffs);
      for (const x of owned) {
        if (x && typeof x.dispose === 'function') x.dispose();
      }
      owned.length = 0;
      if (typeof puffs.dispose === 'function') puffs.dispose();
    },
  };

  // ---------------------------------------------------------------- animation
  const animArgs = { hs: 0, hasInput: false, mag: 0, slippery: false, walkSpeed: WALK_SPEED };
  function animate(dt, k) {
    const { hs, hasInput, mag, slippery, walkSpeed } = k;
    const sliding = player.sliding;
    const riding = st.riding;
    const t = st.t;

    st.slideAmt += ((sliding ? 1 : 0) - st.slideAmt) * damp(sliding ? 10 : 7, dt);
    st.rideAmt += ((riding ? 1 : 0) - st.rideAmt) * damp(6, dt);
    const ground = (1 - st.slideAmt) * (1 - st.rideAmt);

    // On slippery ice Pip's feet scramble as if running at full tilt.
    const animSpeed = slippery && hasInput && !sliding ? Math.max(hs, walkSpeed * mag * 1.1) : hs;
    const walkTarget = sliding || riding ? 0 : clamp(animSpeed / WALK_SPEED, 0, 1.3);
    st.walkAmt += (walkTarget - st.walkAmt) * damp(10, dt);
    const w = Math.min(1.2, st.walkAmt) * ground;
    if (st.walkAmt > 0.01) st.phase += dt * (2.5 + animSpeed * 2.1);
    if (st.phase > TAU * 64) {
      st.phase -= TAU * 64;
      st.stepIndex -= 128;
    }
    const stepIdx = Math.floor(st.phase / Math.PI);
    if (stepIdx !== st.stepIndex) {
      st.stepIndex = stepIdx;
      if (w > 0.25 && dt > 0) {
        const side = stepIdx & 1 ? 1 : -1; // odd: left foot just landed
        toWorldXZ(side * 0.15, 0.12, _w);
        if (!slippery || Math.random() < 0.4) {
          spawnPuff(
            _w.x,
            group.position.y + 0.05,
            _w.z,
            (Math.random() - 0.5) * 0.6,
            0.5 + Math.random() * 0.4,
            (Math.random() - 0.5) * 0.6,
            0.06 + 0.03 * Math.min(1, w),
            0.4,
            player.onIce,
          );
        }
        emit('onStep', side);
      }
    }
    const s1 = Math.sin(st.phase);
    const c1 = Math.cos(st.phase);

    // ---- idle bookkeeping + fidgets
    const isIdle = w < 0.05 && ground > 0.9 && st.celebrateT < 0 && !hasInput;
    if (isIdle) st.idleTime += dt;
    else {
      st.idleTime = 0;
      st.fidget = null;
    }
    if (isIdle && !st.fidget && st.idleTime > st.nextFidget) {
      st.fidget = FIDGETS[Math.floor(Math.random() * FIDGETS.length)];
      st.fidgetT = 0;
      st.nextFidget = st.idleTime + 6 + Math.random() * 5;
      if (st.fidget === 'hop') kick(-2);
    }
    let fidgetRoll = 0;
    let fidgetFlap = 0;
    let fidgetLookUp = 0;
    let fidgetHop = 0;
    if (st.fidget) {
      st.fidgetT += dt;
      const ft = st.fidgetT;
      if (st.fidget === 'look') {
        const e = Math.sin(clamp(ft / 2.2, 0, 1) * Math.PI);
        fidgetLookUp = e * 0.5; // gaze up at the stars
        if (ft > 2.2) st.fidget = null;
      } else if (st.fidget === 'flap') {
        fidgetFlap = Math.abs(Math.sin(ft * 18)) * 0.7 * Math.sin(clamp(ft / 1.1, 0, 1) * Math.PI);
        if (ft > 1.1) st.fidget = null;
      } else if (st.fidget === 'shake') {
        // shake the snow off like a wet puppy
        const e = Math.sin(clamp(ft / 0.8, 0, 1) * Math.PI);
        fidgetRoll = Math.sin(ft * 34) * 0.12 * e;
        if (ft > 0.35 && ft - dt <= 0.35) puffBurst(5, 1.0, 1.2, 0.08, player.onIce);
        if (ft > 0.8) st.fidget = null;
      } else if (st.fidget === 'hop') {
        if (ft > 0.12 && ft < 0.5) fidgetHop = Math.sin(((ft - 0.12) / 0.38) * Math.PI) * 0.16;
        if (ft >= 0.5 && ft - dt < 0.5) kick(-2.4);
        if (ft > 0.7) st.fidget = null;
      }
    }

    // ---- celebrate
    let hopY = 0;
    let twirl = 0;
    let celebrating = false;
    if (st.celebrateT >= 0) {
      st.celebrateT += dt;
      const D = 0.62;
      const p = st.celebrateT / D;
      celebrating = p < 1;
      if (p >= 0.14 && !st.celebLaunched) {
        st.celebLaunched = true;
        kick(5.5);
      }
      if (p >= 0.14 && p < 0.86) {
        const q = (p - 0.14) / 0.72;
        hopY = Math.sin(Math.PI * q) * (riding ? 0.16 : 0.42);
        if (st.celebrateKind === 1) twirl = easeInOut(q) * TAU;
      }
      if (p >= 0.86 && !st.celebLanded) {
        st.celebLanded = true;
        kick(-5);
        if (!riding) puffBurst(6, 1.3, 0.9, 0.1, player.onIce);
        emit('onLand');
      }
      if (st.celebrateT > D + 0.35) st.celebrateT = -1; // short happy afterglow
    }

    // ---- squash & stretch spring (bouncy jelly)
    let rem = dt;
    while (rem > 1e-6) {
      const h = Math.min(rem, 1 / 60);
      const a = -190 * st.sq - 9 * st.sqv;
      st.sqv += a * h;
      st.sq += st.sqv * h;
      rem -= h;
    }
    st.sq = clamp(st.sq, -0.35, 0.45);
    const breathe = Math.sin(t * 2.3) * 0.016 * (1 - Math.min(1, w)) * ground;
    const stepBounce = Math.cos(2 * st.phase) * 0.03 * w;
    const sy = clamp(1 + st.sq + breathe + stepBounce, 0.6, 1.45);
    const sxz = 1 / Math.sqrt(sy);
    squash.scale.set(sxz, sy, sxz);
    spin.rotation.y = twirl;

    // ---- lean / bank / rock
    const accelLean = clamp(st.accel * 0.012, -0.16, 0.16);
    st.lean += (0.1 * w + accelLean * ground - st.lean) * damp(8, dt);
    const bankGoal = clamp(-st.angVel * 0.07, -0.35, 0.35) * Math.min(1, hs / 3);
    st.bank += (bankGoal - st.bank) * damp(8, dt);
    const iceWobble = st.iceAmt * ground * (hasInput || hs > 1 ? 1 : 0.35) * Math.sin(t * 7.3) * 0.09;
    roll.rotation.z = s1 * 0.14 * w + st.bank * (1 - st.slideAmt) + iceWobble + fidgetRoll;
    roll.rotation.x = st.lean * (1 - st.slideAmt);

    // belly slide: tip forward onto the tummy, follow the slope, roll into turns
    const slopeAlong = st.gx * Math.sin(player.facing) + st.gz * Math.cos(player.facing);
    tilt.rotation.x = st.slideAmt * (1.38 - Math.atan(slopeAlong) * 0.8);
    tilt.rotation.y = st.slideAmt * clamp(-st.angVel * 0.15, -0.6, 0.6);

    const slideJitter = st.slideAmt * Math.sin(t * 23) * 0.012 * Math.min(1, hs / 6);
    const rideBob = st.rideAmt * Math.abs(Math.sin(t * 6.5)) * 0.06 * Math.min(1, hs / 3);
    lift.position.y = st.rideAmt * RIDE_OFFSET + Math.abs(s1) * 0.055 * w + hopY + fidgetHop + slideJitter + rideBob;

    // ---- flippers
    let flapL = 0.18 + w * (0.22 + 0.22 * s1);
    let flapR = 0.18 + w * (0.22 - 0.22 * s1);
    let swingL = c1 * 0.35 * w;
    let swingR = -c1 * 0.35 * w;
    const idleK = 1 - Math.min(1, w);
    flapL += idleK * Math.sin(t * 1.6) * 0.05 + fidgetFlap;
    flapR += idleK * Math.sin(t * 1.6 + 1) * 0.05 + fidgetFlap;
    const balance = st.iceAmt * ground;
    flapL += balance * (0.7 + Math.sin(t * 9) * 0.25);
    flapR += balance * (0.7 + Math.sin(t * 9 + 2) * 0.25);
    // slide: wings out like a little aeroplane
    flapL = lerp(flapL, 1.3 + Math.sin(t * 16) * 0.08, st.slideAmt);
    flapR = lerp(flapR, 1.3 + Math.sin(t * 16 + 1.5) * 0.08, st.slideAmt);
    swingL = lerp(swingL, 0.35, st.slideAmt);
    swingR = lerp(swingR, 0.35, st.slideAmt);
    // riding: waving with joy
    flapL = lerp(flapL, 0.95 + Math.sin(t * 9) * 0.3, st.rideAmt);
    flapR = lerp(flapR, 0.95 + Math.sin(t * 9 + Math.PI) * 0.3, st.rideAmt);
    if (celebrating) {
      const f = 0.55 + 0.75 * Math.abs(Math.sin(st.celebrateT * 26));
      flapL = f;
      flapR = f;
      swingL *= 0.3;
      swingR *= 0.3;
    }
    flipperL.rotation.set(swingL, 0, flapL);
    flipperR.rotation.set(swingR, 0, -flapR);

    // ---- feet
    setFoot(footL, 1, st.phase, w, t);
    setFoot(footR, -1, st.phase + Math.PI, w, t);

    // ---- tail
    tailPivot.rotation.y = s1 * 0.5 * w + Math.sin(t * 3) * 0.06 * idleK;
    tailPivot.rotation.x = st.slideAmt * -0.5 + (celebrating ? Math.sin(st.celebrateT * 30) * 0.2 : 0);

    // ---- head
    if (isIdle) {
      st.lookTimer -= dt;
      if (st.lookTimer <= 0) {
        st.lookTimer = 2.2 + Math.random() * 3;
        st.headYawGoal = Math.random() < 0.35 ? 0 : (Math.random() - 0.5) * 1.1;
        st.headTiltGoal = Math.random() < 0.5 ? 0 : (Math.random() - 0.5) * 0.35;
      }
    } else {
      st.headYawGoal = clamp(st.angVel * 0.12, -0.5, 0.5) * ground;
      st.headTiltGoal = 0;
    }
    st.headYaw += (st.headYawGoal - st.headYaw) * damp(5, dt);
    st.headTilt += (st.headTiltGoal - st.headTilt) * damp(4, dt);
    headPivot.rotation.y = st.headYaw;
    headPivot.rotation.z = -roll.rotation.z * 0.55 + st.headTilt;
    headPivot.rotation.x =
      Math.sin(2 * st.phase) * 0.05 * w - st.slideAmt * 0.95 - fidgetLookUp + (celebrating ? -0.15 : 0);

    // ---- face
    const happy = celebrating || st.celebrateT >= 0 || (st.slideAmt > 0.6 && hs > 4) || st.rideAmt > 0.6 || fidgetFlap > 0.05;
    st.blinkTimer -= dt;
    if (st.blinkTimer <= 0) {
      st.blinkT = 0;
      st.blinkTimer = Math.random() < 0.18 ? 0.3 : 1.8 + Math.random() * 3.2;
    }
    let eyeY = 1;
    if (st.blinkT >= 0) {
      st.blinkT += dt;
      const b = st.blinkT / 0.15;
      if (b >= 1) st.blinkT = -1;
      else eyeY = 1 - Math.sin(b * Math.PI) * 0.92;
    }
    if (st.winceT > 0) {
      st.winceT -= dt;
      eyeY = Math.min(eyeY, 0.3);
    }
    const sparkle = 1 + Math.sin(t * 3.1) * 0.1;
    for (let i = 0; i < blinkNodes.length; i++) {
      blinkNodes[i].visible = !happy;
      blinkNodes[i].scale.y = eyeY;
      happyNodes[i].visible = happy;
    }
    for (let i = 0; i < shineNodes.length; i++) {
      shineNodes[i].scale.setScalar(i % 2 === 0 ? sparkle : 2 - sparkle);
    }
    const beakGoal = celebrating ? 0.5 : st.slideAmt > 0.6 && hs > 5 ? 0.32 : st.winceT > 0 ? 0.25 : 0;
    st.beakOpen += (beakGoal - st.beakOpen) * damp(14, dt);
    jaw.rotation.x = st.beakOpen;
    mouth.visible = st.beakOpen > 0.03;

    // ---- cosmetics secondary motion
    const flow = clamp(hs / 8, 0, 1) * (1 - st.slideAmt);
    if (scarf && scarf.group.visible) {
      for (let i = 0; i < scarf.tails.length; i++) {
        const tl = scarf.tails[i];
        tl.pivot.rotation.x =
          tl.rx + flow * 1.05 + Math.sin(t * 13 + i * 1.7) * 0.18 * flow + st.sqv * 0.03 +
          st.slideAmt * Math.sin(t * 18 + i) * 0.15;
        tl.pivot.rotation.z = tl.rz + Math.sin(t * 9 + i * 2.3) * 0.12 * flow - roll.rotation.z * 0.6;
      }
    }
    if (crown && crown.pivot.visible) {
      crown.wobble.rotation.z = clamp(st.sqv * 0.012, -0.2, 0.2);
      crown.wobble.rotation.x = clamp(-st.lean * 0.4 + st.sqv * 0.006, -0.2, 0.2);
    }
    if (bobble && bobble.group.visible) {
      bobble.pomPivot.rotation.x = clamp(-st.sqv * 0.05 - st.lean * 0.9 - flow * 0.3, -0.7, 0.7);
      bobble.pomPivot.rotation.z = clamp(-roll.rotation.z * 0.9 + st.angVel * 0.03, -0.6, 0.6);
    }

    // ---- blob shadow: shrink while airborne, stretch while lying down, hug slopes
    const away = 1 - st.rideAmt;
    const air = clamp(1 - (hopY + fidgetHop) * 1.1, 0.4, 1);
    blob.visible = away > 0.03;
    blob.scale.set(away * air * (1 + 0.12 * st.slideAmt), 1, away * air * (1 + 0.75 * st.slideAmt));
    const f = player.facing;
    const nx = -st.gx;
    const nz = -st.gz;
    // world normal -> Pip-local (undo the facing rotation)
    const lx = nx * Math.cos(f) - nz * Math.sin(f);
    const lz = nx * Math.sin(f) + nz * Math.cos(f);
    _v.set(lx, 1, lz).normalize();
    blob.quaternion.setFromUnitVectors(Y_AXIS, _v);

    // ---- slide spray
    if (sliding && hs > 1.5 && dt > 0) {
      st.slideEmit += dt * 26 * clamp(hs / 7, 0.3, 1.4) * (player.onIce ? 0.5 : 1);
      while (st.slideEmit >= 1) {
        st.slideEmit -= 1;
        const side = (Math.random() - 0.5) * 0.5;
        toWorldXZ(side, -0.35, _w);
        const back = 0.6 + Math.random() * 0.8;
        spawnPuff(
          _w.x,
          group.position.y + 0.06,
          _w.z,
          (-player.velocity.x / hs) * back + side * 1.5,
          0.9 + Math.random() * 0.8,
          (-player.velocity.z / hs) * back,
          0.06 + Math.random() * 0.05,
          0.4 + Math.random() * 0.15,
          player.onIce,
        );
      }
    } else {
      st.slideEmit = 0;
    }
  }

  function setFoot(foot, side, ph, w, t) {
    const up = Math.max(0, Math.sin(ph));
    let y = up * 0.075 * w;
    let z = 0.06 - Math.cos(ph) * 0.13 * w;
    let rx = -up * 0.5 * w;
    let rz = 0;
    // slide: toes point back, little flutter kicks
    rx = lerp(rx, 1.5 + Math.sin(t * 20 + side * 1.3) * 0.35, st.slideAmt);
    // riding: dangle and swing
    y = lerp(y, 0.06, st.rideAmt);
    z = lerp(z, 0.14, st.rideAmt);
    rx = lerp(rx, -0.55 + Math.sin(t * 7 + side) * 0.2, st.rideAmt);
    rz = lerp(rz, side * 0.35, st.rideAmt);
    foot.position.set(side * 0.15, y, z);
    foot.rotation.set(rx, side * 0.22, rz);
  }

  player.reset(0, 0, 0);
  return player;
}
