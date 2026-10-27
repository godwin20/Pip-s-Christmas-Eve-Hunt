// Prop factories for Pip's island: chunky, cosy, storybook Christmas things.
//
// Every factory returns a THREE.Group built facing +Z with its base at y = 0 and
// `userData.radius` (collision circle). To keep draw calls low, each prop merges
// all of its plain parts into ONE vertex-coloured mesh that shares a single
// cached toon material; only glowing bits (bulbs, windows, stars) get their own
// meshes, plus additive glow sprites. No textures from disk, no canvases needed:
// everything here also runs in node (useful for smoke tests).

import * as THREE from 'three';
import { toon, PALETTE } from './materials.js';
import { createRng } from '../core/rng.js';

const TAU = Math.PI * 2;
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const X_AXIS = new THREE.Vector3(1, 0, 0);

// scratch objects (generation time only, never per frame)
const _col = new THREE.Color();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _nm = new THREE.Matrix3();

// Cheerful colours used all over the island.
export const CANDY = {
  red: 0xe63946,
  pink: 0xff8fc7,
  hotPink: 0xff5fa8,
  mint: 0x6fdcb8,
  lemon: 0xffe066,
  lavender: 0xc9a7ff,
  sky: 0x6ec8ff,
  orange: 0xff9f43,
  white: 0xfffafc,
};
const BAUBLE_COLOURS = [0xe63946, 0xffc94a, 0x4d96ff, 0xf0f4ff, 0xc77dff, 0xff6fae, 0x2fbf71];
const LIGHT_COLOURS = [0xff4d5e, 0xffd23f, 0x3ddc84, 0x4da3ff, 0xff7ad9, 0xff9f43];

function ensureRng(rng) {
  if (rng && typeof rng.next === 'function' && typeof rng.range === 'function') return rng;
  return createRng(1234567);
}

// ---------------------------------------------------------------------------
// Geometry plumbing
// ---------------------------------------------------------------------------

export function mat4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _p.set(x, y, z);
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

function mergeParts(parts) {
  let vc = 0;
  let ic = 0;
  for (const p of parts) {
    const pos = p.geo.attributes.position;
    vc += pos.count;
    ic += p.geo.index ? p.geo.index.count : pos.count;
  }
  const pos = new Float32Array(vc * 3);
  const nor = new Float32Array(vc * 3);
  const col = new Float32Array(vc * 3);
  const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
  let vo = 0;
  let io = 0;
  for (const p of parts) {
    const g = p.geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    const P = g.attributes.position;
    const N = g.attributes.normal;
    const C = g.attributes.color;
    _nm.getNormalMatrix(p.m);
    const useAttr = (p.color === null || p.color === undefined) && C;
    if (!useAttr) _col.set(p.color === null || p.color === undefined ? 0xffffff : p.color);
    for (let i = 0; i < P.count; i++) {
      const k = (vo + i) * 3;
      _v.fromBufferAttribute(P, i).applyMatrix4(p.m);
      pos[k] = _v.x;
      pos[k + 1] = _v.y;
      pos[k + 2] = _v.z;
      _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize();
      nor[k] = _n.x;
      nor[k + 1] = _n.y;
      nor[k + 2] = _n.z;
      if (useAttr) {
        col[k] = C.getX(i);
        col[k + 1] = C.getY(i);
        col[k + 2] = C.getZ(i);
      } else {
        col[k] = _col.r;
        col[k + 1] = _col.g;
        col[k + 2] = _col.b;
      }
    }
    const flip = p.m.determinant() < 0;
    if (g.index) {
      const I = g.index;
      for (let t = 0; t + 2 < I.count; t += 3) {
        const a = I.getX(t) + vo;
        const b = I.getX(t + 1) + vo;
        const c = I.getX(t + 2) + vo;
        idx[io++] = a;
        idx[io++] = flip ? c : b;
        idx[io++] = flip ? b : c;
      }
    } else {
      for (let t = 0; t + 2 < P.count; t += 3) {
        idx[io++] = vo + t;
        idx[io++] = vo + (flip ? t + 2 : t + 1);
        idx[io++] = vo + (flip ? t + 1 : t + 2);
      }
    }
    vo += P.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx.subarray(0, io), 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

// Collects coloured parts with a transform stack and merges them into one geometry.
export class MeshBuilder {
  constructor() {
    this.parts = [];
    this.stack = [new THREE.Matrix4()];
  }
  get top() {
    return this.stack[this.stack.length - 1];
  }
  push(x, y, z, rx, ry, rz, sx, sy, sz) {
    this.stack.push(this.top.clone().multiply(mat4(x, y, z, rx, ry, rz, sx, sy, sz)));
    return this;
  }
  pop() {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }
  // color: hex number, THREE.Color, or null to use the geometry's own colour attribute
  add(geo, color, x, y, z, rx, ry, rz, sx, sy, sz) {
    const m = this.top.clone().multiply(mat4(x, y, z, rx, ry, rz, sx, sy, sz));
    this.parts.push({ geo, color, m });
    return this;
  }
  get empty() {
    return this.parts.length === 0;
  }
  build() {
    const g = this.parts.length ? mergeParts(this.parts) : new THREE.BufferGeometry();
    const seen = new Set();
    for (const p of this.parts) {
      if (seen.has(p.geo) || p.geo.userData.keep) continue;
      seen.add(p.geo);
      p.geo.dispose();
    }
    this.parts = [];
    return g;
  }
}

function vcMat() {
  return toon(0xffffff, { vertexColors: true });
}

function setColorAttr(geo, fn) {
  const P = geo.attributes.position;
  const arr = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    fn(i, P.getX(i), P.getY(i), P.getZ(i));
    arr[i * 3] = _col.r;
    arr[i * 3 + 1] = _col.g;
    arr[i * 3 + 2] = _col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Vertical colour gradient.
function paintY(geo, hexBottom, hexTop) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const h = Math.max(1e-6, max.y - min.y);
  const a = new THREE.Color(hexBottom);
  const b = new THREE.Color(hexTop);
  return setColorAttr(geo, (i, x, y) => {
    _col.copy(a).lerp(b, (y - min.y) / h);
  });
}

export function shade(hex, f) {
  return _col.set(hex).multiplyScalar(f).getHex();
}

export function mixHex(a, b, t) {
  const c = new THREE.Color(a);
  return c.lerp(_col.set(b), t).getHex();
}

// A tube along pathFn(t, out) for t in [0,1] with radiusFn(t). Columns are
// skewed along a helix so candy stripes come out crisp (flat colours per band).
export function stripedTube(pathFn, radiusFn, opts = {}) {
  const {
    segs = 24,
    radial = 12,
    stripes = 2,
    twist = 1,
    colA = 0xffffff,
    colB = PALETTE.red,
    ref = Z_AXIS,
  } = opts;
  const rf = typeof radiusFn === 'function' ? radiusFn : () => radiusFn;
  const per = stripes > 0 ? Math.max(1, Math.round(radial / (stripes * 2))) : radial;
  const R = stripes > 0 ? per * stripes * 2 : Math.max(3, radial);
  const ringP = [];
  const ringN = [];
  const ringB = [];
  const ringT = [];
  const radii = [];
  const arc = [0];
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = pathFn(t, new THREE.Vector3());
    pathFn(Math.max(0, t - 1e-3), p0);
    pathFn(Math.min(1, t + 1e-3), p1);
    const T = p1.sub(p0).normalize().clone();
    const N = new THREE.Vector3().crossVectors(ref, T);
    if (N.lengthSq() < 1e-8) N.crossVectors(Math.abs(T.x) < 0.9 ? X_AXIS : Z_AXIS, T);
    N.normalize();
    const B = new THREE.Vector3().crossVectors(T, N).normalize();
    ringP.push(p);
    ringN.push(N);
    ringB.push(B);
    ringT.push(T);
    radii.push(Math.max(0, rf(t)));
    if (i > 0) arc.push(arc[i - 1] + p.distanceTo(ringP[i - 1]));
  }
  const cA = new THREE.Color(colA);
  const cB = new THREE.Color(colB);
  const verts = [];
  const norms = [];
  const vertexAt = (i, j, outP, outN) => {
    const t = i / segs;
    const th = (TAU * j) / R + TAU * twist * t;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const dir = _v.copy(ringN[i]).multiplyScalar(c).addScaledVector(ringB[i], s);
    outP.copy(ringP[i]).addScaledVector(dir, radii[i]);
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(segs, i + 1);
    const ds = Math.max(1e-6, arc[i1] - arc[i0]);
    const drds = (radii[i1] - radii[i0]) / ds;
    outN.copy(dir).addScaledVector(ringT[i], -drds).normalize();
  };
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const pc = new THREE.Vector3();
  const pd = new THREE.Vector3();
  const na = new THREE.Vector3();
  const nb = new THREE.Vector3();
  const nc = new THREE.Vector3();
  const nd = new THREE.Vector3();
  const colors = [];
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < R; j++) {
      vertexAt(i, j, pa, na);
      vertexAt(i + 1, j, pb, nb);
      vertexAt(i, j + 1, pc, nc);
      vertexAt(i + 1, j + 1, pd, nd);
      const cc = stripes > 0 && Math.floor(j / per) % 2 === 1 ? cB : cA;
      // (a, c, b) and (b, c, d) face outward for our right-handed frame
      for (const [P, Nn] of [
        [pa, na],
        [pc, nc],
        [pb, nb],
        [pb, nb],
        [pc, nc],
        [pd, nd],
      ]) {
        verts.push(P.x, P.y, P.z);
        norms.push(Nn.x, Nn.y, Nn.z);
        colors.push(cc.r, cc.g, cc.b);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

// Straight vertical striped stick from y=0 to y=h.
function stripedStick(r, h, colA, colB, opts = {}) {
  return stripedTube((t, o) => o.set(0, t * h, 0), r, {
    segs: Math.max(4, Math.round(h * 6)),
    radial: opts.radial || 12,
    stripes: opts.stripes ?? 2,
    twist: opts.twist ?? h / 0.6,
    colA,
    colB,
  });
}

// Candy cane: vertical shaft of height h, hook of radius hr curling toward +Z.
function caneGeometry(r, h, hr, colA = 0xffffff, colB = PALETTE.red, hookArc = 1.1) {
  const L1 = h;
  const L2 = hr * Math.PI * hookArc;
  const L = L1 + L2;
  return stripedTube(
    (t, o) => {
      const s = t * L;
      if (s <= L1) return o.set(0, s, 0);
      const phi = (s - L1) / hr;
      return o.set(0, h + hr * Math.sin(phi), hr - hr * Math.cos(phi));
    },
    r,
    {
      segs: Math.max(12, Math.round(L * 10)),
      radial: 12,
      stripes: 3,
      twist: L / 0.55,
      colA,
      colB,
      ref: X_AXIS,
    }
  );
}

// Portion of a cone (base radius R at y=0, tip at y=H) from the tip down to a
// wavy drippy edge. Used for snow caps, frosting and icing.
function dripCap(R, H, f, drip, nDrips, phase = 0, radial = 32, rows = 4, puff = 1.06) {
  const pos = [];
  const nor = [];
  const idx = [];
  const cols = radial + 1;
  const lenN = Math.hypot(H, R) || 1;
  for (let i = 0; i <= rows + 1; i++) {
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * TAU;
      const bump = Math.pow(0.5 + 0.5 * Math.cos(nDrips * th + phase), 2.5);
      const sEdge = Math.min(0.97, f + drip * bump);
      const sn = Math.sin(th);
      const cs = Math.cos(th);
      if (i <= rows) {
        const s = sEdge * (i / rows);
        const r = s * R * puff + (i > 0 ? 0.02 : 0);
        const y = H * (1 - s) + 0.04;
        pos.push(sn * r, y, cs * r);
        nor.push((sn * H) / lenN, R / lenN, (cs * H) / lenN);
      } else {
        // tucked lip so the edge has visible thickness
        const r = sEdge * R * puff - 0.07;
        const y = H * (1 - sEdge) - 0.02;
        pos.push(sn * r, y, cs * r);
        _n.set(sn * 0.4, -1, cs * 0.4).normalize();
        nor.push(_n.x, _n.y, _n.z);
      }
    }
  }
  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * cols + j;
      const b = (i + 1) * cols + j;
      const c = i * cols + j + 1;
      const d = (i + 1) * cols + j + 1;
      idx.push(a, b, c, c, b, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}

function roundBox(w, h, d, r = 0.06) {
  r = Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002);
  if (!(r > 0.01)) return new THREE.BoxGeometry(w, h, d);
  const iw = w - 2 * r;
  const ih = h - 2 * r;
  const cr = Math.min(r * 0.9, iw / 2, ih / 2);
  const s = new THREE.Shape();
  const x0 = -iw / 2;
  const y0 = -ih / 2;
  if (cr > 0.005) {
    s.moveTo(x0 + cr, y0);
    s.lineTo(x0 + iw - cr, y0);
    s.quadraticCurveTo(x0 + iw, y0, x0 + iw, y0 + cr);
    s.lineTo(x0 + iw, y0 + ih - cr);
    s.quadraticCurveTo(x0 + iw, y0 + ih, x0 + iw - cr, y0 + ih);
    s.lineTo(x0 + cr, y0 + ih);
    s.quadraticCurveTo(x0, y0 + ih, x0, y0 + ih - cr);
    s.lineTo(x0, y0 + cr);
    s.quadraticCurveTo(x0, y0, x0 + cr, y0);
  } else {
    s.moveTo(x0, y0);
    s.lineTo(x0 + iw, y0);
    s.lineTo(x0 + iw, y0 + ih);
    s.lineTo(x0, y0 + ih);
    s.closePath();
  }
  const depth = Math.max(0.001, d - 2 * r);
  const g = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r,
    bevelSegments: 2,
    curveSegments: 3,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

function starShape(outer, inner, points = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i / (points * 2)) * TAU + Math.PI / 2;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

function starGeometry(outer = 0.6, inner = 0.27, depth = 0.16) {
  const g = new THREE.ExtrudeGeometry(starShape(outer, inner), {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 2,
    curveSegments: 1,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

// Flat peppermint swirl disc facing +Z (alternating sectors).
function peppermint(r, sectors = 8, colA = 0xffffff, colB = PALETTE.red) {
  const g = new THREE.CircleGeometry(r, sectors * 2).toNonIndexed();
  const a = new THREE.Color(colA);
  const b = new THREE.Color(colB);
  return setColorAttr(g, (i) => {
    _col.copy(Math.floor(i / 3) % 2 ? b : a);
  });
}

const sphere = (r = 1, w = 12, h = 9) => new THREE.SphereGeometry(r, w, h);
const cyl = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);

// ---------------------------------------------------------------------------
// Glow sprites (procedural DataTexture so it works without a DOM)
// ---------------------------------------------------------------------------

let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const S = 64;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = ((x + 0.5) / S) * 2 - 1;
      const dy = ((y + 0.5) / S) * 2 - 1;
      const d = Math.min(1, Math.sqrt(dx * dx + dy * dy));
      const f = 1 - d;
      const a = Math.min(1, f * f * 0.75 + Math.pow(f, 7) * 0.6);
      const k = (y * S + x) * 4;
      data[k] = 255;
      data[k + 1] = 255;
      data[k + 2] = 255;
      data[k + 3] = Math.round(a * 255);
    }
  }
  glowTex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  glowTex.magFilter = THREE.LinearFilter;
  glowTex.minFilter = THREE.LinearFilter;
  glowTex.generateMipmaps = false;
  glowTex.needsUpdate = true;
  return glowTex;
}

// Additive soft glow. Each sprite gets its own material so it can flicker alone.
export function makeGlowSprite(color = 0xffd27a, size = 2, opacity = 0.8) {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(),
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  mat.userData.ownedByProp = true;
  const s = new THREE.Sprite(mat);
  s.scale.set(size, size, 1);
  s.renderOrder = 3;
  s.userData.baseOpacity = opacity;
  s.userData.baseSize = size;
  return s;
}

// Shared glowing materials (cached by materials.js)
const lampBulbMat = () => toon(0xfff3c4, { emissive: 0xffc45a, emissiveIntensity: 1.6 });
const windowMat = () => toon(0xffe2a0, { emissive: 0xffb347, emissiveIntensity: 1.35 });
const starMat = () => toon(0xffe066, { emissive: 0xffb300, emissiveIntensity: 1.0 });

// Frees geometries and the per-prop materials (shared cached toon materials stay).
export function disposeObject(obj) {
  if (!obj) return;
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose();
    if (o.isInstancedMesh && typeof o.dispose === 'function') o.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) if (m.userData && m.userData.ownedByProp) m.dispose();
  });
  if (obj.parent) obj.parent.remove(obj);
}

// ---------------------------------------------------------------------------
// Pine trees
// ---------------------------------------------------------------------------

const PINE_GREENS = [
  [0x1f6e47, 0x3aa56c],
  [0x1b6544, 0x2f9a62],
  [0x23784d, 0x48b277],
];
const CANDY_PINES = [
  [0xff8fc7, 0xfff4fa],
  [0x6fdcb8, 0xf4fff9],
  [0xff6b8b, 0xfff4fa],
  [0xc9a7ff, 0xfdf8ff],
];

function buildPine(b, rng, { theme, h = 6, tiers, lowDetail = false } = {}) {
  const candy = theme === 'candy';
  const trunkH = h * 0.2;
  const trunkR = Math.max(0.16, h * 0.045);
  b.add(cyl(trunkR * 0.75, trunkR, trunkH + 0.4, 7), candy ? 0xf6e3c6 : PALETTE.trunk, 0, (trunkH + 0.4) / 2 - 0.3, 0);
  const n = tiers || rng.int(3, 4);
  const fol = h - trunkH;
  const step = fol / (n + 0.8);
  const baseR = h * rng.range(0.33, 0.38);
  const greens = rng.pick(PINE_GREENS);
  const candyPal = rng.pick(CANDY_PINES);
  const snow = candy ? 0xfff0f7 : PALETTE.snow;
  for (let i = 0; i < n; i++) {
    const frac = n > 1 ? i / (n - 1) : 0;
    const R = baseR * (1 - 0.58 * frac) * rng.range(0.94, 1.06);
    const th = step * 1.8;
    const y0 = trunkH + i * step;
    b.push(0, y0, 0, rng.range(-0.04, 0.04), rng.range(0, TAU), rng.range(-0.04, 0.04));
    if (!candy) {
      const cone = paintY(new THREE.ConeGeometry(R, th, 14, 1), greens[0], greens[1]);
      b.add(cone, null, 0, th / 2, 0);
    } else {
      const cone = stripedTube((t, o) => o.set(0, t * th, 0), (t) => R * (1 - t), {
        segs: lowDetail ? 5 : 8,
        radial: lowDetail ? 12 : 18,
        stripes: 3,
        twist: 0.55,
        colA: candyPal[1],
        colB: candyPal[0],
      });
      b.add(cone, null);
      b.add(new THREE.CircleGeometry(R, lowDetail ? 12 : 18), candyPal[1], 0, 0.01, 0, Math.PI / 2);
    }
    const capRadial = lowDetail ? 20 : 30;
    const capRows = lowDetail ? 3 : 4;
    b.add(dripCap(R, th, rng.range(0.34, 0.46), 0.13, rng.int(5, 7), rng.range(0, TAU), capRadial, capRows), snow);
    b.pop();
  }
  if (candy) b.add(sphere(0.22, 10, 8), candyPal[0], 0, h + 0.1, 0);
}

export function makePineTree(rng, opts = {}) {
  rng = ensureRng(rng);
  const h = opts.height || rng.range(4.5, 8.5);
  const b = new MeshBuilder();
  buildPine(b, rng, { theme: opts.theme, h });
  const mesh = new THREE.Mesh(b.build(), vcMat());
  mesh.castShadow = true;
  const g = new THREE.Group();
  g.name = 'pineTree';
  g.add(mesh);
  g.userData.radius = 0.12 + (0.7 * h) / 6;
  g.userData.height = h;
  return g;
}

// Many simple pines as a few InstancedMeshes (3 shape variants).
// points: [{ x, z, y, scale, rot }]
export function makeForestInstances(points, rng, opts = {}) {
  rng = ensureRng(rng);
  const group = new THREE.Group();
  group.name = 'forest';
  const list = Array.isArray(points) ? points.filter(Boolean) : [];
  group.userData.count = list.length;
  if (!list.length) return group;
  const VARIANTS = 3;
  const heights = [5.6, 6.0, 6.6];
  const buckets = [[], [], []];
  for (const p of list) buckets[rng.int(0, VARIANTS - 1)].push(p);
  const m = new THREE.Matrix4();
  const candy = opts.theme === 'candy';
  for (let v = 0; v < VARIANTS; v++) {
    const pts = buckets[v];
    if (!pts.length) continue;
    const b = new MeshBuilder();
    buildPine(b, rng, { theme: opts.theme, h: heights[v], tiers: v === 1 ? 4 : 3, lowDetail: true });
    const geo = b.build();
    const im = new THREE.InstancedMesh(geo, vcMat(), pts.length);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const s = Number.isFinite(p.scale) ? p.scale : 1;
      _p.set(p.x || 0, Number.isFinite(p.y) ? p.y : 0, p.z || 0);
      _e.set(0, Number.isFinite(p.rot) ? p.rot : 0, 0, 'YXZ');
      _q.setFromEuler(_e);
      _s.set(s, s * rng.range(0.92, 1.1), s);
      m.compose(_p, _q, _s);
      im.setMatrixAt(i, m);
      const br = rng.range(0.9, 1.04);
      if (candy) _col.setRGB(br, br * rng.range(0.96, 1.0), br);
      else _col.setRGB(br * rng.range(0.94, 1.0), br, br * rng.range(0.95, 1.02));
      im.setColorAt(i, _col);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = true;
    im.receiveShadow = false;
    im.computeBoundingSphere();
    im.name = 'forestVariant' + v;
    group.add(im);
  }
  return group;
}

// ---------------------------------------------------------------------------
// Big decorated Christmas tree
// ---------------------------------------------------------------------------

export function makeDecoratedTree(rng, opts = {}) {
  rng = ensureRng(rng);
  const candy = opts.theme === 'candy';
  const h = rng.range(6.8, 8.0);
  const group = new THREE.Group();
  group.name = 'decoratedTree';
  const b = new MeshBuilder();
  const tierCol = candy ? [0x2fbf8f, 0x86f0cb] : [0x1a6342, 0x35a468];
  const snowCol = candy ? 0xffd6ea : PALETTE.snow;

  // felt tree skirt with fluffy trim
  b.add(cyl(2.05, 2.2, 0.1, 28), candy ? CANDY.hotPink : PALETTE.red, 0, 0.05, 0);
  b.add(new THREE.TorusGeometry(2.15, 0.13, 6, 36), 0xffffff, 0, 0.1, 0, Math.PI / 2);
  b.add(cyl(0.3, 0.4, 1.3, 9), PALETTE.trunk, 0, 0.65, 0);

  const trunkH = 0.85;
  const n = 4;
  const fol = h - trunkH;
  const step = fol / (n + 0.8);
  const baseR = 2.5;
  const strands = LIGHT_COLOURS.map(() => new MeshBuilder());
  const bulbGeo = sphere(0.085, 8, 6);
  bulbGeo.userData.keep = true;
  const baubleGeo = sphere(1, 14, 10);
  baubleGeo.userData.keep = true;
  let bulbIndex = rng.int(0, LIGHT_COLOURS.length - 1);
  const addBulb = (phi, y, r) => {
    strands[bulbIndex % strands.length].add(bulbGeo, 0xffffff, Math.sin(phi) * r, y, Math.cos(phi) * r, 0, phi, 0, 1, 1.35, 1);
    bulbIndex++;
  };

  for (let i = 0; i < n; i++) {
    const frac = i / (n - 1);
    const R = baseR * (1 - 0.6 * frac);
    const th = step * 1.85;
    const y0 = trunkH + i * step;
    const rAt = (y) => Math.max(0.05, R * (1 - (y - y0) / th));
    const cone = paintY(new THREE.ConeGeometry(R, th, 18, 1), tierCol[0], tierCol[1]);
    b.add(cone, null, 0, y0 + th / 2, 0);
    b.add(dripCap(R, th, 0.3, 0.1, 7 + i, rng.range(0, TAU)), snowCol, 0, y0, 0);

    if (i === n - 1) {
      // a few lights on the top tier
      for (let k = 0; k < 4; k++) {
        const phi = (k / 4) * TAU + rng.range(0, 1);
        const y = y0 + th * 0.35;
        addBulb(phi, y, rAt(y) + 0.06);
      }
      continue;
    }

    // scalloped garland swags
    const nSc = Math.max(4, Math.round(R * 2.4));
    const droop = 0.26 + R * 0.04;
    const yG = y0 + th * 0.3;
    const phase = rng.range(0, TAU);
    const garlandStriped = candy || i % 2 === 1;
    const garland = stripedTube(
      (t, o) => {
        const phi = t * TAU + phase;
        const y = yG - droop * Math.abs(Math.sin((phi - phase) * nSc * 0.5));
        const r = rAt(y) + 0.07;
        return o.set(Math.sin(phi) * r, y, Math.cos(phi) * r);
      },
      0.065,
      {
        segs: nSc * 14,
        radial: 6,
        stripes: garlandStriped ? 3 : 0,
        twist: nSc * 2,
        colA: candy ? 0xffffff : garlandStriped ? 0xffffff : 0xffc94a,
        colB: candy ? CANDY.hotPink : PALETTE.red,
        ref: new THREE.Vector3(0, 1, 0),
      }
    );
    b.add(garland, null);

    for (let k = 0; k < nSc; k++) {
      // lights at the swag peaks
      const peak = phase + (k / nSc) * TAU;
      addBulb(peak, yG + 0.06, rAt(yG) + 0.1);
      // baubles (or mini candy canes) hanging at the swag bottoms
      const phi = phase + ((k + 0.5) / nSc) * TAU;
      const yb = yG - droop - 0.2;
      const rr = rAt(yb) + 0.16;
      const bx = Math.sin(phi) * rr;
      const bz = Math.cos(phi) * rr;
      if (rng.chance(candy ? 0.4 : 0.2)) {
        b.push(bx, yb - 0.18, bz, 0, phi + Math.PI / 2, 0);
        b.add(caneGeometry(0.035, 0.28, 0.08, 0xffffff, candy ? CANDY.hotPink : PALETTE.red), null);
        b.pop();
      } else {
        const br = rng.range(0.16, 0.21);
        const bc = candy ? rng.pick([CANDY.pink, CANDY.mint, CANDY.lemon, CANDY.lavender, CANDY.sky]) : rng.pick(BAUBLE_COLOURS);
        b.add(baubleGeo, bc, bx, yb, bz, 0, 0, 0, br);
        b.add(cyl(0.045, 0.05, 0.07, 6), PALETTE.gold, bx, yb + br + 0.02, bz);
        // little shiny highlight
        const ox = Math.sin(phi) * br * 0.55;
        const oz = Math.cos(phi) * br * 0.55;
        b.add(baubleGeo, 0xffffff, bx + ox - Math.cos(phi) * br * 0.25, yb + br * 0.45, bz + oz + Math.sin(phi) * br * 0.25, 0, 0, 0, br * 0.22);
      }
    }
    // a second ring of twinkle lights lower on the tier
    const nLow = Math.max(4, Math.round(R * 2.2));
    const off = rng.range(0, TAU);
    for (let k = 0; k < nLow; k++) {
      const phi = off + (k / nLow) * TAU;
      const y = y0 + th * 0.62;
      addBulb(phi, y, rAt(y) + 0.06);
    }
  }

  // the star and its little stalk
  const starY = h + 0.42;
  b.add(cyl(0.06, 0.09, 0.5, 6), PALETTE.gold, 0, h + 0.05, 0);

  const body = new THREE.Mesh(b.build(), vcMat());
  body.castShadow = true;
  body.name = 'treeBody';
  group.add(body);

  const lights = [];
  strands.forEach((sb, i) => {
    if (sb.empty) return;
    const c = LIGHT_COLOURS[i];
    const mat = toon(c, { emissive: c, emissiveIntensity: 1.5, unique: true });
    mat.userData.ownedByProp = true;
    const mesh = new THREE.Mesh(sb.build(), mat);
    mesh.name = 'treeLights' + i;
    mesh.userData.baseColor = c;
    mesh.userData.baseIntensity = 1.5;
    group.add(mesh);
    lights.push(mesh);
  });
  bulbGeo.dispose();
  baubleGeo.dispose();

  const star = new THREE.Mesh(starGeometry(0.62, 0.27, 0.16), starMat());
  star.position.set(0, starY, 0);
  star.castShadow = true;
  star.name = 'treeStar';
  group.add(star);
  const starGlow = makeGlowSprite(0xffe08a, 3.6, 0.8);
  starGlow.position.set(0, starY, 0);
  group.add(starGlow);
  const treeGlow = makeGlowSprite(candy ? 0xff9fd6 : 0xffc870, 8.5, 0.16);
  treeGlow.position.set(0, h * 0.42, 0);
  group.add(treeGlow);

  group.userData.radius = 2.3;
  group.userData.height = h;
  group.userData.lights = lights;
  group.userData.star = star;
  group.userData.starGlow = starGlow;
  group.userData.glow = treeGlow;
  group.userData.phase = rng.range(0, TAU);
  // restore the original bulb colours (handy after a disco)
  group.userData.restoreLights = () => {
    for (const l of lights) {
      l.material.color.setHex(l.userData.baseColor);
      l.material.emissive.setHex(l.userData.baseColor);
      l.material.emissiveIntensity = l.userData.baseIntensity;
    }
  };
  return group;
}

// ---------------------------------------------------------------------------
// Snowman
// ---------------------------------------------------------------------------

export function makeSnowman(rng) {
  rng = ensureRng(rng);
  const b = new MeshBuilder();
  const snow = PALETTE.snow;
  const coal = 0x2a2433;
  const s = rng.range(0.9, 1.1);
  b.push(0, 0, 0, 0, 0, 0, s);
  const ball = sphere(1, 18, 14);
  ball.userData.keep = true;
  const small = sphere(1, 10, 8);
  small.userData.keep = true;

  // three snowballs (slightly squashed for chunk)
  b.add(ball, snow, 0, 0.62, 0, 0, 0, 0, 0.78, 0.7, 0.78);
  b.add(ball, 0xf8fbff, 0, 1.5, 0, 0, 0, 0, 0.56, 0.52, 0.56);
  const tilt = rng.range(-0.18, 0.18);
  b.push(0, 2.22, 0, rng.range(-0.08, 0.08), rng.range(-0.3, 0.3), tilt);
  b.add(ball, snow, 0, 0, 0, 0, 0, 0, 0.44);
  // big cute eyes with sparkles
  for (const sx of [-1, 1]) {
    b.add(small, coal, sx * 0.15, 0.08, 0.38, 0, 0, 0, 0.085, 0.1, 0.06);
    b.add(small, 0xffffff, sx * 0.15 + 0.03, 0.12, 0.43, 0, 0, 0, 0.028);
    b.add(small, 0xff9fb8, sx * 0.25, -0.06, 0.33, 0, sx * 0.5, 0, 0.07, 0.045, 0.03);
  }
  // carrot nose pointing +Z
  b.add(new THREE.ConeGeometry(0.065, 0.36, 8), 0xff8a2a, 0, -0.01, 0.56, Math.PI / 2);
  // coal smile
  for (let k = 0; k < 5; k++) {
    const a = -0.6 + (k / 4) * 1.2;
    b.add(small, coal, Math.sin(a) * 0.17, -0.16 - Math.cos(a) * 0.04 + 0.04, 0.38 + Math.cos(a) * 0.02, 0, 0, 0, 0.03);
  }
  // hat
  const hatType = rng.int(0, 2);
  if (hatType === 0) {
    b.add(cyl(0.38, 0.38, 0.05, 18), 0x2a2433, 0, 0.36, 0);
    b.add(cyl(0.24, 0.26, 0.42, 16), 0x2a2433, 0, 0.58, 0);
    b.add(cyl(0.265, 0.265, 0.09, 16), rng.pick([PALETTE.red, PALETTE.green, 0x4d96ff]), 0, 0.42, 0);
    b.add(small, 0x2fbf71, 0.18, 0.45, 0.16, 0, 0, 0, 0.06, 0.03, 0.06);
    b.add(small, PALETTE.red, 0.2, 0.47, 0.2, 0, 0, 0, 0.035);
  } else if (hatType === 1) {
    const hc = rng.pick([PALETTE.red, 0x4d96ff, 0x2fbf71, 0xc77dff]);
    b.add(new THREE.SphereGeometry(0.42, 16, 10, 0, TAU, 0, Math.PI / 2), hc, 0, 0.18, 0, -0.1, 0, 0, 1, 1.15, 1);
    b.add(new THREE.TorusGeometry(0.4, 0.075, 8, 22), 0xffffff, 0, 0.2, 0.02, Math.PI / 2 - 0.1);
    b.add(small, 0xffffff, 0, 0.68, -0.04, 0, 0, 0, 0.12);
  } else {
    // earmuffs
    b.add(new THREE.TorusGeometry(0.44, 0.03, 6, 20, Math.PI), 0xc77dff, 0, 0.02, 0);
    for (const sx of [-1, 1]) b.add(small, 0xff8fc7, sx * 0.43, 0.0, 0, 0, 0, 0, 0.1, 0.13, 0.13);
  }
  b.pop();
  // scarf
  const sc = rng.pick([PALETTE.red, 0x2fbf71, 0x4d96ff, 0xffc94a, 0xff6fae]);
  b.add(new THREE.TorusGeometry(0.4, 0.1, 8, 24), sc, 0, 1.92, 0, Math.PI / 2);
  b.add(roundBox(0.18, 0.5, 0.08, 0.035), sc, 0.2, 1.68, 0.36, 0.25, 0, 0.2);
  b.add(roundBox(0.19, 0.06, 0.09, 0.02), 0xffffff, 0.24, 1.52, 0.4, 0.25, 0, 0.2);
  // coal buttons
  for (let k = 0; k < 3; k++) b.add(small, coal, 0, 1.68 - k * 0.2, 0.52 - k * 0.015, 0, 0, 0, 0.055);
  // stick arms with twiggy fingers
  for (const sx of [-1, 1]) {
    const up = rng.range(-0.2, 0.9);
    b.push(sx * 0.48, 1.58, 0, 0, 0, sx * (-Math.PI / 2 + up));
    b.add(cyl(0.025, 0.035, 0.75, 5), 0x6b4226, 0, 0.37, 0);
    b.add(cyl(0.018, 0.02, 0.2, 4), 0x6b4226, 0.06, 0.68, 0, 0, 0, -0.6);
    b.add(cyl(0.018, 0.02, 0.18, 4), 0x6b4226, -0.05, 0.7, 0, 0, 0, 0.5);
    b.pop();
  }
  // a little snow drift around the base
  b.add(new THREE.SphereGeometry(1, 14, 6, 0, TAU, 0, Math.PI / 2), snow, 0, -0.02, 0, 0, 0, 0, 0.95, 0.18, 0.95);
  b.pop();
  ball.dispose();
  small.dispose();
  const mesh = new THREE.Mesh(b.build(), vcMat());
  mesh.castShadow = true;
  const g = new THREE.Group();
  g.name = 'snowman';
  g.add(mesh);
  g.userData.radius = 0.85 * s;
  return g;
}

// ---------------------------------------------------------------------------
// Candy cane lamp post
// ---------------------------------------------------------------------------

export function makeCandyLamp(rng) {
  rng = ensureRng(rng);
  const b = new MeshBuilder();
  const H = rng.range(2.85, 3.15);
  const hr = 0.42;
  b.add(caneGeometry(0.11, H, hr, 0xffffff, PALETTE.red, 1.12), null);
  // rounded tip of the hook
  const tipPhi = Math.PI * 1.12;
  const tipY = H + hr * Math.sin(tipPhi);
  const tipZ = hr - hr * Math.cos(tipPhi);
  b.add(sphere(0.11, 10, 8), 0xffffff, 0, tipY, tipZ);
  // snowy base mound and a sugar-dusted foot
  b.add(new THREE.SphereGeometry(1, 14, 6, 0, TAU, 0, Math.PI / 2), PALETTE.snow, 0, 0, 0, 0, 0, 0, 0.42, 0.22, 0.42);
  // holly sprig on the bend
  b.push(0, H + hr * 0.95, hr * 0.35, -0.5);
  b.add(sphere(1, 8, 6), 0x2a9d6f, -0.1, 0.02, 0.06, 0, 0, 0.6, 0.15, 0.05, 0.08);
  b.add(sphere(1, 8, 6), 0x23875f, 0.1, 0.02, 0.06, 0, 0, -0.6, 0.15, 0.05, 0.08);
  for (let k = 0; k < 3; k++) b.add(sphere(0.045, 8, 6), 0xff2f45, -0.04 + k * 0.04, 0.06 + (k % 2) * 0.03, 0.12);
  b.pop();
  // lantern hanging from the hook end
  const lx = 0;
  const ly = tipY - 0.32;
  const lz = 2 * hr + 0.02;
  b.add(cyl(0.012, 0.012, 0.22, 4), 0x3a2f45, lx, tipY - 0.12, lz);
  b.add(new THREE.ConeGeometry(0.2, 0.16, 8), 0x1f6e47, lx, ly + 0.27, lz);
  b.add(new THREE.TorusGeometry(0.17, 0.03, 6, 14), PALETTE.gold, lx, ly + 0.18, lz, Math.PI / 2);
  b.add(cyl(0.13, 0.16, 0.06, 10), 0x1f6e47, lx, ly - 0.2, lz);
  b.add(sphere(0.05, 8, 6), PALETTE.gold, lx, ly - 0.26, lz);
  b.add(sphere(0.05, 8, 6), PALETTE.gold, lx, ly + 0.37, lz);

  const mesh = new THREE.Mesh(b.build(), vcMat());
  mesh.castShadow = true;
  const g = new THREE.Group();
  g.name = 'candyLamp';
  g.add(mesh);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), lampBulbMat());
  bulb.position.set(lx, ly, lz);
  bulb.scale.set(1, 1.15, 1);
  g.add(bulb);
  const glow = makeGlowSprite(0xffc46b, rng.range(2.6, 3.0), 0.85);
  glow.position.set(lx, ly, lz);
  g.add(glow);
  g.userData.radius = 0.4;
  g.userData.bulb = bulb;
  g.userData.glow = glow;
  g.userData.lampPos = new THREE.Vector3(lx, ly, lz);
  g.userData.phase = rng.range(0, TAU);
  return g;
}

// ---------------------------------------------------------------------------
// Gingerbread house
// ---------------------------------------------------------------------------

const PASTEL_WALLS = [0xffb3d9, 0xb8f2d8, 0xd9c2ff, 0xfff0a8, 0xa8e4ff];
const GUMDROPS = [0xe63946, 0x2fbf71, 0xffd23f, 0xc77dff, 0xff9f43, 0xff6fae, 0x4d96ff];

export function makeGingerHouse(rng, opts = {}) {
  rng = ensureRng(rng);
  const candy = opts.theme === 'candy';
  const W = 5.0;
  const D = 5.6;
  const Hw = 2.7;
  const roofH = 1.9;
  const bev = 0.08;
  const wallCol = candy ? rng.pick(PASTEL_WALLS) : rng.pick([PALETTE.ginger, 0xc27838, 0xcf8a47]);
  const roofCol = candy ? rng.pick([0xff6fae, 0x7fd8ff, 0xb48cff, 0x5fd3a5]) : rng.pick([0x8a4b25, 0x7a3f1f, 0x93542b]);
  const icing = 0xffffff;
  const b = new MeshBuilder();
  const win = new MeshBuilder();

  // walls + front/back gables in one chunky extruded pentagon (ridge runs along Z)
  const prof = new THREE.Shape();
  prof.moveTo(-W / 2, 0);
  prof.lineTo(W / 2, 0);
  prof.lineTo(W / 2, Hw);
  prof.lineTo(0, Hw + roofH);
  prof.lineTo(-W / 2, Hw);
  prof.closePath();
  const walls = new THREE.ExtrudeGeometry(prof, {
    depth: D - 2 * bev,
    bevelEnabled: true,
    bevelThickness: bev,
    bevelSize: bev,
    bevelSegments: 2,
    curveSegments: 1,
  });
  walls.translate(0, 0, -(D - 2 * bev) / 2);
  b.add(walls, wallCol);
  const xw = W / 2 + bev; // outer wall planes
  const zw = D / 2;

  // roof slabs
  const over = 0.45;
  const run = W / 2 + over;
  const drop = roofH + 0.28;
  const L = Math.hypot(run, drop);
  const ang = Math.atan2(drop, run);
  const ridgeY = Hw + roofH + 0.12;
  const roofD = D + 0.8;
  for (const sx of [-1, 1]) {
    const nx = Math.sin(ang) * sx;
    const ny = Math.cos(ang);
    const cx = (sx * run) / 2 + nx * 0.15;
    const cy = ridgeY - drop / 2 + ny * 0.15;
    b.push(cx, cy, 0, 0, 0, -sx * ang);
    b.add(roundBox(L + 0.1, 0.3, roofD, 0.08), roofCol);
    // icing blanket covering most of the slope
    b.add(roundBox(L * 0.8, 0.12, roofD - 0.15, 0.05), icing, sx * -L * 0.08, 0.2, 0);
    b.pop();
    // drippy icing along the eave
    const ex = sx * (run - 0.05) + nx * 0.02;
    const ey = ridgeY - drop + 0.08;
    const nDr = 11;
    for (let k = 0; k < nDr; k++) {
      const z = -roofD / 2 + 0.25 + (k / (nDr - 1)) * (roofD - 0.5);
      const len = 0.16 + ((k * 7) % 3) * 0.07;
      b.add(sphere(1, 8, 6), icing, ex, ey - len * 0.5, z, 0, 0, 0, 0.13, len, 0.13);
    }
    // icing beads along the front and back roof edges
    for (const sz of [-1, 1]) {
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        const x = sx * run * t;
        const y = ridgeY - drop * t + 0.18;
        b.add(sphere(0.1, 8, 6), icing, x + nx * 0.12, y, sz * (roofD / 2 + 0.02));
      }
    }
  }
  // ridge icing + gumdrops
  b.add(cyl(0.2, 0.2, roofD + 0.1, 10), icing, 0, ridgeY + 0.12, 0, Math.PI / 2);
  const gum = new THREE.SphereGeometry(1, 12, 8, 0, TAU, 0, Math.PI / 2);
  gum.userData.keep = true;
  const nGum = 6;
  for (let k = 0; k < nGum; k++) {
    const z = -roofD / 2 + 0.45 + (k / (nGum - 1)) * (roofD - 0.9);
    b.add(gum, GUMDROPS[(k + rng.int(0, 6)) % GUMDROPS.length], 0, ridgeY + 0.26, z, 0, 0, 0, 0.22, 0.26, 0.22);
  }
  // corner icing pillars and a beaded base
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(cyl(0.11, 0.11, Hw, 8), icing, sx * xw, Hw / 2, sz * zw);
  const bead = sphere(0.12, 8, 6);
  bead.userData.keep = true;
  for (let k = 0; k <= 9; k++) {
    const t = -0.5 + k / 9;
    for (const sz of [-1, 1]) b.add(bead, icing, t * W, 0.08, sz * (zw + 0.03));
  }
  for (let k = 1; k < 11; k++) {
    const t = -0.5 + k / 11;
    for (const sx of [-1, 1]) b.add(bead, icing, sx * (xw + 0.03), 0.08, t * D);
  }
  // wall icing band under the eaves
  for (const sx of [-1, 1]) b.add(cyl(0.07, 0.07, D, 8), icing, sx * (xw + 0.02), Hw - 0.05, 0, Math.PI / 2);

  // windows: glowing panes with icing frames and crosses
  const addWindow = (cx, cy, cz, ry, w = 0.9, h = 1.0) => {
    win.push(cx, cy, cz, 0, ry, 0);
    win.add(new THREE.BoxGeometry(w, h, 0.06), 0xffffff, 0, 0, 0.02);
    win.pop();
    b.push(cx, cy, cz, 0, ry, 0);
    b.add(new THREE.BoxGeometry(w + 0.2, 0.1, 0.12), icing, 0, h / 2 + 0.03, 0.04);
    b.add(roundBox(w + 0.34, 0.14, 0.22, 0.05), icing, 0, -h / 2 - 0.05, 0.08);
    b.add(new THREE.BoxGeometry(0.1, h, 0.12), icing, -w / 2 - 0.04, 0, 0.04);
    b.add(new THREE.BoxGeometry(0.1, h, 0.12), icing, w / 2 + 0.04, 0, 0.04);
    b.add(new THREE.BoxGeometry(0.06, h, 0.05), icing, 0, 0, 0.07);
    b.add(new THREE.BoxGeometry(w, 0.06, 0.05), icing, 0, 0.05, 0.07);
    // a little snow on the sill
    b.add(sphere(1, 10, 6), PALETTE.snow, 0, -h / 2 + 0.04, 0.13, 0, 0, 0, w * 0.55, 0.08, 0.12);
    b.pop();
  };
  for (const sx of [-1, 1]) {
    for (const z of [-1.35, 1.35]) addWindow(sx * xw, 1.45, z, sx * (Math.PI / 2));
    // peppermint between the windows
    b.add(peppermint(0.32, 8, 0xffffff, candy ? CANDY.hotPink : PALETTE.red), null, sx * (xw + 0.02), 1.55, 0, 0, sx * (Math.PI / 2), 0);
  }
  addWindow(0, 1.45, -zw, Math.PI, 1.0, 1.0);
  // round attic window over the door
  win.add(new THREE.CircleGeometry(0.4, 20), 0xffffff, 0, Hw + 0.62, zw + 0.03);
  b.add(new THREE.TorusGeometry(0.42, 0.08, 8, 24), icing, 0, Hw + 0.62, zw + 0.04);
  b.add(new THREE.BoxGeometry(0.06, 0.8, 0.05), icing, 0, Hw + 0.62, zw + 0.07);
  b.add(new THREE.BoxGeometry(0.8, 0.06, 0.05), icing, 0, Hw + 0.62, zw + 0.07);

  // front door (+Z) with an arched top, icing outline, knob and wreath
  const doorCol = candy ? rng.pick([0xff5fa8, 0x4d96ff, 0x2fbf8f]) : 0x5a2e14;
  b.add(roundBox(1.1, 1.55, 0.14, 0.04), doorCol, 0, 0.78, zw + 0.02);
  b.add(cyl(0.55, 0.55, 0.14, 18), doorCol, 0, 1.55, zw + 0.02, Math.PI / 2);
  b.add(new THREE.TorusGeometry(0.6, 0.06, 6, 18, Math.PI), icing, 0, 1.55, zw + 0.1);
  b.add(cyl(0.06, 0.06, 1.55, 6), icing, -0.6, 0.78, zw + 0.1);
  b.add(cyl(0.06, 0.06, 1.55, 6), icing, 0.6, 0.78, zw + 0.1);
  b.add(sphere(0.07, 8, 6), PALETTE.gold, 0.35, 0.85, zw + 0.14);
  b.add(new THREE.TorusGeometry(0.26, 0.09, 8, 18), 0x1f8a52, 0, 1.45, zw + 0.16);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    b.add(sphere(0.04, 6, 5), 0xff2f45, Math.cos(a) * 0.27, 1.45 + Math.sin(a) * 0.27, zw + 0.24);
  }
  b.add(sphere(1, 8, 6), PALETTE.red, -0.1, 1.2, zw + 0.22, 0, 0, 0.5, 0.11, 0.07, 0.05);
  b.add(sphere(1, 8, 6), PALETTE.red, 0.1, 1.2, zw + 0.22, 0, 0, -0.5, 0.11, 0.07, 0.05);
  // doorstep
  b.add(roundBox(1.6, 0.16, 0.7, 0.06), 0xf6f1ff, 0, 0.08, zw + 0.4);

  // candy cane pillars either side of the door, hooks curling toward the door
  for (const sx of [-1, 1]) {
    b.push(sx * 0.98, 0, zw + 0.42, 0, -sx * (Math.PI / 2), 0);
    b.add(caneGeometry(0.08, 1.75, 0.22, 0xffffff, candy ? CANDY.hotPink : PALETTE.red), null);
    b.pop();
    // peppermints either side of the door
    b.add(peppermint(0.26, 6, 0xffffff, candy ? CANDY.mint : PALETTE.green), null, sx * 1.75, 2.0, zw + 0.03);
  }

  // chimney with snow cap
  const chx = 1.25;
  const chz = -1.5;
  const chTop = ridgeY + 0.75;
  b.add(roundBox(0.7, chTop - Hw, 0.7, 0.05), candy ? 0xffffff : 0xb5523b, chx, (chTop + Hw) / 2, chz);
  if (!candy) {
    for (let k = 0; k < 3; k++) b.add(new THREE.BoxGeometry(0.72, 0.05, 0.72), 0x8f3d2c, chx, chTop - 0.35 - k * 0.35, chz);
  } else {
    for (let k = 0; k < 3; k++) b.add(new THREE.BoxGeometry(0.72, 0.1, 0.72), CANDY.hotPink, chx, chTop - 0.3 - k * 0.35, chz);
  }
  b.add(roundBox(0.88, 0.2, 0.88, 0.08), PALETTE.snow, chx, chTop + 0.05, chz);

  // snow drifts hugging the corners
  const drift = new THREE.SphereGeometry(1, 12, 6, 0, TAU, 0, Math.PI / 2);
  drift.userData.keep = true;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.add(drift, PALETTE.snow, sx * (xw + 0.15), 0, sz * (zw + 0.1), 0, rng.range(0, TAU), 0, rng.range(0.6, 0.85), 0.3, rng.range(0.55, 0.8));
    }
  }
  gum.dispose();
  bead.dispose();
  drift.dispose();

  const g = new THREE.Group();
  g.name = 'gingerHouse';
  const body = new THREE.Mesh(b.build(), vcMat());
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const windows = new THREE.Mesh(win.build(), windowMat());
  windows.name = 'houseWindows';
  g.add(windows);
  const glow = makeGlowSprite(0xffb85c, 4.2, 0.42);
  glow.position.set(0, 1.4, zw + 0.9);
  g.add(glow);
  const atticGlow = makeGlowSprite(0xffc870, 1.8, 0.5);
  atticGlow.position.set(0, Hw + 0.62, zw + 0.3);
  g.add(atticGlow);

  g.userData.radius = 3.6;
  // three overlapping circles hug the rectangular footprint (local coords),
  // plus four small ones so Pip can't poke through the corners
  g.userData.colliders = [
    { x: 0, z: -1.55, r: 2.6 },
    { x: 0, z: 0, r: 2.6 },
    { x: 0, z: 1.55, r: 2.6 },
    { x: -2.35, z: -2.55, r: 0.46 },
    { x: 2.35, z: -2.55, r: 0.46 },
    { x: -2.35, z: 2.55, r: 0.46 },
    { x: 2.35, z: 2.55, r: 0.46 },
  ];
  g.userData.chimney = { x: chx, y: chTop + 0.15, z: chz };
  g.userData.door = { x: 0, z: zw + 1.2 };
  g.userData.glows = [glow, atticGlow];
  g.userData.phase = rng.range(0, TAU);
  return g;
}

// ---------------------------------------------------------------------------
// Fence (runs along X, centred on the origin, front facing +Z)
// ---------------------------------------------------------------------------

export function makeFence(length = 4, opts = {}) {
  length = Math.max(0.6, Number.isFinite(+length) && +length > 0 ? +length : 4);
  const candy = opts && opts.theme === 'candy';
  const nPosts = Math.max(2, Math.round(length / 1.2) + 1);
  const wood = 0x9b6a43;
  const woodDark = 0x80542f;
  const b = new MeshBuilder();
  const cap = sphere(1, 8, 6);
  cap.userData.keep = true;
  for (let i = 0; i < nPosts; i++) {
    const x = -length / 2 + (i * length) / (nPosts - 1);
    if (candy) {
      b.add(stripedStick(0.08, 1.05, 0xffffff, i % 2 ? CANDY.mint : CANDY.hotPink, { stripes: 2, twist: 2 }), null, x, 0, 0);
      b.add(cap, i % 2 ? CANDY.mint : CANDY.hotPink, x, 1.08, 0, 0, 0, 0, 0.13, 0.11, 0.13);
    } else {
      b.add(roundBox(0.17, 1.05, 0.17, 0.04), wood, x, 0.5, 0);
      b.add(cap, PALETTE.snow, x, 1.05, 0, 0, 0, 0, 0.13, 0.09, 0.13);
    }
  }
  const railCol = candy ? 0xfff4fa : woodDark;
  b.add(roundBox(length, 0.12, 0.07, 0.03), railCol, 0, 0.38, 0.06);
  b.add(roundBox(length, 0.12, 0.07, 0.03), railCol, 0, 0.8, 0.06);
  b.add(roundBox(length - 0.1, 0.07, 0.11, 0.03), candy ? 0xffd6ea : PALETTE.snow, 0, 0.89, 0.06);
  cap.dispose();
  const mesh = new THREE.Mesh(b.build(), vcMat());
  mesh.castShadow = true;
  const g = new THREE.Group();
  g.name = 'fence';
  g.add(mesh);
  const colliders = [];
  const nC = Math.max(2, Math.ceil(length / 0.9) + 1);
  for (let i = 0; i < nC; i++) colliders.push({ x: -length / 2 + (i * length) / (nC - 1), z: 0, r: 0.32 });
  g.userData.radius = length / 2;
  g.userData.length = length;
  g.userData.colliders = colliders;
  return g;
}

// ---------------------------------------------------------------------------
// Santa's sleigh (front curl toward +Z)
// ---------------------------------------------------------------------------

function addPresent(b, x, y, z, size, col, ribbon, ry = 0, rz = 0) {
  b.push(x, y, z, 0, ry, rz);
  b.add(roundBox(size, size * 0.9, size, size * 0.12), col, 0, size * 0.45, 0);
  b.add(new THREE.BoxGeometry(size * 1.02, size * 0.92, size * 0.18), ribbon, 0, size * 0.45, 0);
  b.add(new THREE.BoxGeometry(size * 0.18, size * 0.92, size * 1.02), ribbon, 0, size * 0.45, 0);
  for (const s of [-1, 1]) {
    b.add(new THREE.TorusGeometry(size * 0.16, size * 0.06, 6, 12), ribbon, s * size * 0.15, size * 0.98, 0, 0, Math.PI / 2, s * 0.6);
  }
  b.add(sphere(size * 0.08, 8, 6), ribbon, 0, size * 0.95, 0);
  b.pop();
}

export function makeSleigh() {
  const red = PALETTE.red;
  const redDark = 0xb8202e;
  const gold = PALETTE.gold;
  const b = new MeshBuilder();
  const prof = [
    [-1.45, 0.55],
    [0.9, 0.55],
    [1.35, 0.68],
    [1.62, 0.98],
    [1.68, 1.32],
    [1.55, 1.55],
    [1.33, 1.58],
    [1.2, 1.42],
    [1.22, 1.22],
    [1.0, 1.05],
    [0.3, 0.98],
    [-0.6, 0.98],
    [-1.05, 1.2],
    [-1.2, 1.7],
    [-1.42, 1.9],
    [-1.65, 1.78],
    [-1.68, 1.2],
    [-1.6, 0.75],
    [-1.45, 0.55],
  ];
  const shape = new THREE.Shape();
  shape.moveTo(prof[0][0], prof[0][1]);
  shape.splineThru(prof.slice(1).map(([u, v]) => new THREE.Vector2(u, v)));
  const depth = 1.3;
  const body = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.08,
    bevelSegments: 3,
    curveSegments: 4,
  });
  body.rotateY(-Math.PI / 2);
  body.translate(depth / 2, 0, 0);
  b.add(body, red);
  const halfW = depth / 2 + 0.12;

  // plush seat and back cushion
  b.add(roundBox(1.35, 0.24, 1.15, 0.1), redDark, 0, 1.06, -0.2);
  b.add(roundBox(1.3, 0.55, 0.22, 0.1), redDark, 0, 1.35, -0.95, -0.25);

  // gold trims along both sides
  const topTrim = [
    [1.55, 1.55],
    [1.33, 1.58],
    [1.2, 1.42],
    [1.22, 1.22],
    [1.0, 1.05],
    [0.3, 0.98],
    [-0.6, 0.98],
    [-1.05, 1.2],
    [-1.2, 1.7],
    [-1.42, 1.9],
    [-1.65, 1.78],
  ];
  const botTrim = [
    [-1.6, 0.75],
    [-1.45, 0.55],
    [0.9, 0.55],
    [1.35, 0.68],
    [1.62, 0.98],
    [1.68, 1.32],
    [1.55, 1.55],
  ];
  for (const sx of [-1, 1]) {
    for (const pts of [topTrim, botTrim]) {
      const curve = new THREE.CatmullRomCurve3(pts.map(([u, v]) => new THREE.Vector3(sx * halfW, v, u)));
      b.add(new THREE.TubeGeometry(curve, 48, 0.055, 6, false), gold);
    }
    // swirly scroll ornament on the side
    const sp = [];
    for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      const r = 0.32 * (1 - t * 0.85);
      const a = t * Math.PI * 3.2;
      sp.push(new THREE.Vector3(sx * (halfW + 0.01), 0.8 + Math.sin(a) * r * 0.7, 0.15 + Math.cos(a) * r));
    }
    b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sp), 40, 0.04, 5, false), gold);
    // jingle bells
    for (const u of [-1.0, -0.3, 0.45]) {
      b.add(sphere(0.085, 10, 8), gold, sx * (halfW + 0.07), 0.5, u);
      b.add(new THREE.BoxGeometry(0.02, 0.02, 0.1), 0x8a5a00, sx * (halfW + 0.15), 0.48, u);
    }
    // runners with a big front curl
    const rp = [
      [-1.5, 0.28],
      [-1.38, 0.1],
      [0.9, 0.1],
      [1.5, 0.18],
      [1.85, 0.5],
      [1.82, 0.85],
      [1.6, 0.92],
      [1.5, 0.75],
    ];
    const rc = new THREE.CatmullRomCurve3(rp.map(([u, v]) => new THREE.Vector3(sx * 0.58, v, u)));
    b.add(new THREE.TubeGeometry(rc, 56, 0.075, 7, false), gold);
    for (const u of [-1.0, 0.0, 0.85]) b.add(cyl(0.05, 0.05, 0.48, 6), gold, sx * 0.58, 0.33, u);
  }
  // holly on the front
  b.push(0, 1.24, 1.84, 0.2);
  b.add(sphere(1, 8, 6), 0x2a9d6f, -0.13, 0, 0, 0, 0, 0.5, 0.18, 0.07, 0.05);
  b.add(sphere(1, 8, 6), 0x23875f, 0.13, 0, 0, 0, 0, -0.5, 0.18, 0.07, 0.05);
  for (let k = 0; k < 3; k++) b.add(sphere(0.055, 8, 6), 0xff2f45, -0.05 + k * 0.05, 0.06 + (k % 2) * 0.04, 0.05);
  b.pop();

  // Santa's sack bulging with presents
  const sackCol = 0xb07a4a;
  b.add(sphere(1, 16, 12), sackCol, 0, 1.6, -0.7, 0.15, 0, 0, 0.62, 0.68, 0.55);
  b.add(sphere(1, 12, 8), shade(sackCol, 0.9), 0, 2.2, -0.75, 0, 0, 0, 0.3, 0.16, 0.28);
  b.add(new THREE.TorusGeometry(0.22, 0.06, 6, 16), gold, 0, 2.12, -0.74, Math.PI / 2);
  addPresent(b, 0.12, 2.18, -0.72, 0.36, 0x2fbf71, PALETTE.red, 0.4, 0.25);
  addPresent(b, -0.18, 2.12, -0.86, 0.3, 0x4d96ff, 0xffd23f, -0.3, -0.3);
  addPresent(b, 0.0, 2.28, -0.55, 0.26, 0xc77dff, 0xffffff, 0.9, 0.1);
  addPresent(b, 0.32, 1.12, 0.45, 0.38, 0xffd23f, PALETTE.red, 0.3);
  addPresent(b, -0.3, 1.12, 0.55, 0.32, PALETTE.red, 0xffffff, -0.5);
  addPresent(b, -0.05, 1.5, 0.5, 0.24, 0x2fbf71, 0xffd23f, 0.2);

  // little lantern on the front curl
  b.add(cyl(0.05, 0.06, 0.18, 6), gold, 0, 1.75, 1.42);
  b.add(new THREE.ConeGeometry(0.16, 0.14, 8), 0x1f6e47, 0, 2.17, 1.42);
  b.add(sphere(0.04, 6, 5), gold, 0, 2.27, 1.42);

  const mesh = new THREE.Mesh(b.build(), vcMat());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.name = 'sleigh';
  g.add(mesh);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 9), lampBulbMat());
  bulb.position.set(0, 1.99, 1.42);
  g.add(bulb);
  const glow = makeGlowSprite(0xffc46b, 2.4, 0.9);
  glow.position.copy(bulb.position);
  g.add(glow);
  const aura = makeGlowSprite(0xffd98a, 7, 0.13);
  aura.position.set(0, 1.2, 0);
  g.add(aura);
  g.userData.radius = 2.0;
  // a row of circles along the body so Pip can walk right up to its sides
  g.userData.colliders = [
    { x: 0, z: -1.0, r: 1.05 },
    { x: 0, z: 0, r: 1.05 },
    { x: 0, z: 1.0, r: 1.05 },
  ];
  g.userData.glow = glow;
  g.userData.aura = aura;
  g.userData.bulb = bulb;
  return g;
}

// ---------------------------------------------------------------------------
// Rocks, gumdrops, snow lumps, ice floes
// ---------------------------------------------------------------------------

// Lumpy faceted rock with snow on its upward faces, base at y=0, ~1 m across.
export function makeRockGeometry(rng, opts = {}) {
  rng = ensureRng(rng);
  const g = new THREE.IcosahedronGeometry(1, 1);
  const P = g.attributes.position;
  const waves = [];
  for (let k = 0; k < 5; k++) {
    const d = new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1));
    if (d.lengthSq() < 1e-4) d.set(1, 0, 0);
    d.normalize();
    waves.push({ d, f: rng.range(1.5, 3.4), a: rng.range(0.05, 0.13), ph: rng.range(0, TAU) });
  }
  const sy = rng.range(0.55, 0.8);
  const sx = rng.range(0.9, 1.15);
  for (let i = 0; i < P.count; i++) {
    _v.fromBufferAttribute(P, i).normalize();
    let disp = 1;
    for (const w of waves) disp += w.a * Math.sin(w.f * _v.dot(w.d) * 3 + w.ph);
    _v.multiplyScalar(disp);
    _v.x *= sx;
    _v.y = Math.max(-0.22, _v.y * sy);
    P.setXYZ(i, _v.x * 0.5, _v.y * 0.5 + 0.1, _v.z * 0.5);
  }
  g.computeVertexNormals();
  const N = g.attributes.normal;
  const rockCols = opts.theme === 'candy' ? [0xb9a6d8, 0xc7b6e6, 0xa995c9] : [0x8d93a8, 0x7a8098, 0x9aa0b5];
  const snow = new THREE.Color(opts.theme === 'candy' ? 0xfff0f7 : PALETTE.snow);
  const faceCols = rockCols.map((c) => new THREE.Color(c));
  let faceCol = faceCols[0];
  setColorAttr(g, (i) => {
    if (i % 3 === 0) {
      const ny = (N.getY(i) + N.getY(i + 1) + N.getY(i + 2)) / 3;
      faceCol = ny > 0.5 ? snow : faceCols[rng.int(0, faceCols.length - 1)];
    }
    _col.copy(faceCol);
  });
  return g;
}

export function makeRock(rng, opts = {}) {
  rng = ensureRng(rng);
  const size = opts.size || rng.range(0.7, 1.6);
  const geo = makeRockGeometry(rng, opts);
  geo.scale(size, size, size);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, vcMat());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.name = 'rock';
  g.add(mesh);
  g.userData.radius = size * 0.48;
  return g;
}

// Plump gumdrop (white; tint with instance colours), base at y=0, ~1 m wide.
export function makeGumdropGeometry() {
  const pts = [
    [0, 0],
    [0.5, 0],
    [0.55, 0.07],
    [0.53, 0.28],
    [0.43, 0.52],
    [0.26, 0.68],
    [0.001, 0.73],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 16);
  return setColorAttr(g, (i, x, y) => {
    _col.setRGB(1, 1, 1).multiplyScalar(0.88 + 0.12 * Math.min(1, y / 0.7));
  });
}

export function makeSnowLumpGeometry(theme) {
  const g = new THREE.SphereGeometry(1, 12, 6, 0, TAU, 0, Math.PI / 2);
  const c = new THREE.Color(theme === 'candy' ? 0xffeaf4 : PALETTE.snow);
  return setColorAttr(g, () => _col.copy(c));
}

export function makeIceFloeGeometry(rng) {
  rng = ensureRng(rng);
  const g = new THREE.IcosahedronGeometry(1, 0);
  const P = g.attributes.position;
  // one random wobble per shared corner so the faces stay welded
  const wobble = new Map();
  for (let i = 0; i < P.count; i++) {
    _v.fromBufferAttribute(P, i);
    const key = Math.round(_v.x * 1000) + ',' + Math.round(_v.y * 1000) + ',' + Math.round(_v.z * 1000);
    if (!wobble.has(key)) wobble.set(key, [rng.range(0.85, 1.15), rng.range(0.85, 1.15)]);
    const [wx, wz] = wobble.get(key);
    P.setXYZ(i, _v.x * wx, Math.max(-0.1, _v.y * 0.35), _v.z * wz);
  }
  g.computeVertexNormals();
  const N = g.attributes.normal;
  const top = new THREE.Color(0xf4fbff);
  const side = new THREE.Color(0x9fd6ef);
  let fc = top;
  return setColorAttr(g, (i) => {
    if (i % 3 === 0) fc = N.getY(i) > 0.6 ? top : side;
    _col.copy(fc);
  });
}

// ---------------------------------------------------------------------------
// Lollipop tree (candy theme)
// ---------------------------------------------------------------------------

const LOLLI_PALETTES = [
  [0xff5fa8, 0xffffff],
  [0x3fd4a0, 0xffffff],
  [0xff5fa8, 0xffd23f, 0x4dc9ff, 0x7be08f, 0xc77dff],
  [0xffa64d, 0xfff3c4],
  [0xb07dff, 0xffffff],
];

function swirlDisc(R, thick, pal, turns = 1.4, rings = 12, sectors = 48) {
  const verts = [];
  const cols = [];
  const cs = pal.map((c) => new THREE.Color(c));
  const nP = cs.length;
  const colourAt = (r, th) => {
    const s = (th / TAU + (r / R) * turns) * nP * 2;
    return cs[((Math.floor(s) % nP) + nP) % nP];
  };
  const zAt = (r, side) => side * (thick / 2 + 0.12 * (1 - (r / R) * (r / R)));
  const pt = (r, th, side) => [r * Math.cos(th), r * Math.sin(th), zAt(r, side)];
  for (const side of [1, -1]) {
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < sectors; j++) {
        const r0 = (R * i) / rings;
        const r1 = (R * (i + 1)) / rings;
        const t0 = (TAU * j) / sectors;
        const t1 = (TAU * (j + 1)) / sectors;
        const c = colourAt((r0 + r1) / 2, (t0 + t1) / 2);
        const p00 = pt(r0, t0, side);
        const p10 = pt(r1, t0, side);
        const p11 = pt(r1, t1, side);
        const p01 = pt(r0, t1, side);
        const tris = side > 0 ? [p00, p10, p11, p00, p11, p01] : [p00, p11, p10, p00, p01, p11];
        for (const p of tris) {
          verts.push(p[0], p[1], p[2]);
          cols.push(c.r, c.g, c.b);
        }
      }
    }
  }
  // rim
  const rimC = cs[0];
  for (let j = 0; j < sectors; j++) {
    const t0 = (TAU * j) / sectors;
    const t1 = (TAU * (j + 1)) / sectors;
    const a = pt(R, t0, 1);
    const b = pt(R, t0, -1);
    const c = pt(R, t1, 1);
    const d = pt(R, t1, -1);
    for (const p of [a, b, d, a, d, c]) {
      verts.push(p[0], p[1], p[2]);
      cols.push(rimC.r, rimC.g, rimC.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

export function makeLollipopTree(rng) {
  rng = ensureRng(rng);
  const b = new MeshBuilder();
  const H = rng.range(2.4, 3.4);
  const R = rng.range(0.8, 1.15);
  const pal = rng.pick(LOLLI_PALETTES);
  const ribbon = rng.pick([CANDY.red, CANDY.mint, CANDY.lavender, CANDY.sky, CANDY.lemon]);
  b.add(stripedStick(0.11, H + R * 0.4, 0xffffff, rng.pick([CANDY.pink, CANDY.mint, CANDY.lavender]), { stripes: 1, twist: H / 0.5 }), null);
  const cy = H + R * 0.82;
  if (rng.chance(0.7)) {
    b.add(swirlDisc(R, 0.26, pal, rng.range(1.1, 1.8)), null, 0, cy, 0, 0, 0, rng.range(-0.3, 0.3));
  } else {
    // round gobstopper with helical stripes
    const ball = stripedTube((t, o) => o.set(0, -R + 2 * R * t, 0), (t) => R * Math.sqrt(Math.max(0, 1 - (2 * t - 1) * (2 * t - 1))), {
      segs: 16,
      radial: 24,
      stripes: 4,
      twist: 0.8,
      colA: pal[1] ?? 0xffffff,
      colB: pal[0],
    });
    b.add(ball, null, 0, cy, 0);
  }
  // ribbon bow on the neck
  const by = H - 0.05;
  b.add(sphere(1, 10, 8), ribbon, -0.2, by, 0.12, 0, 0, 0.45, 0.22, 0.13, 0.08);
  b.add(sphere(1, 10, 8), ribbon, 0.2, by, 0.12, 0, 0, -0.45, 0.22, 0.13, 0.08);
  b.add(sphere(0.08, 8, 6), shade(ribbon, 0.85), 0, by, 0.14);
  b.add(roundBox(0.08, 0.32, 0.03, 0.012), ribbon, -0.08, by - 0.2, 0.13, 0, 0, -0.25);
  b.add(roundBox(0.08, 0.32, 0.03, 0.012), ribbon, 0.08, by - 0.2, 0.13, 0, 0, 0.25);
  b.add(new THREE.SphereGeometry(1, 12, 6, 0, TAU, 0, Math.PI / 2), 0xffeaf4, 0, 0, 0, 0, 0, 0, 0.4, 0.18, 0.4);
  const mesh = new THREE.Mesh(b.build(), vcMat());
  mesh.castShadow = true;
  const g = new THREE.Group();
  g.name = 'lollipopTree';
  g.add(mesh);
  g.userData.radius = 0.45;
  g.userData.height = cy + R;
  return g;
}

// ---------------------------------------------------------------------------
// Fairy-light string between two points (unlit bright bulbs + dark cable).
// Returns a MeshBuilder-ready list of parts so many strings merge into one mesh.
// ---------------------------------------------------------------------------

export function addLightString(builder, a, b, opts = {}) {
  const sag = opts.sag ?? 0.6;
  const spacing = opts.spacing ?? 0.55;
  const colours = opts.colours || LIGHT_COLOURS;
  const offset = opts.offset || 0;
  const len = a.distanceTo(b);
  const n = Math.max(2, Math.round(len / spacing));
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  builder.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.018, 4, false), 0x2b3a2f);
  const bulb = sphere(0.075, 7, 5);
  bulb.userData.keep = true;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    _p.lerpVectors(a, b, t);
    _p.y -= sag * 4 * t * (1 - t) + 0.07;
    builder.add(bulb, colours[(i + offset) % colours.length], _p.x, _p.y, _p.z, 0, 0, 0, 1, 1.3, 1);
  }
  bulb.dispose();
  return builder;
}
