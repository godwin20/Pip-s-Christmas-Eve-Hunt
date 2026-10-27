// Procedural island generator: a snowy (or candy!) island village at night.
//
// generateMap(rng, { theme, crackerCount, presentCount }) -> world (see CONTRACT.md)
// Everything is derived from `rng` (via rng.fork) so the same seed always makes
// the same island. Pure geometry: no DOM access at generation time, so it can be
// smoke-tested in node.

import * as THREE from 'three';
import { toon } from './materials.js';
import { createRng } from '../core/rng.js';
import {
  makePineTree,
  makeDecoratedTree,
  makeSnowman,
  makeCandyLamp,
  makeGingerHouse,
  makeFence,
  makeSleigh,
  makeLollipopTree,
  makeForestInstances,
  makeRockGeometry,
  makeGumdropGeometry,
  makeSnowLumpGeometry,
  makeIceFloeGeometry,
  MeshBuilder,
  addLightString,
  disposeObject,
} from './props.js';

export const ISLAND_RADIUS = 75;
export const PLAYER_BOUNDS = 72;
export const SEA_Y = -0.45;
const VILLAGE_R = 14;
const VILLAGE_H = 0.3;
const RING_R = 11;
const GRID_SIZE = 172; // terrain covers [-86, 86]^2
const GRID_SEGS = 144;
const SPOT_MAX_R = 64; // collectables stay on dry land
const TAU = Math.PI * 2;

const THEMES = {
  classic: {
    snowTop: 0xf3f6ff,
    snowShade: 0xc6d3f1,
    snowDeep: 0xadbde8,
    beach: 0xbde2f5,
    path: 0xd5d2f0,
    warm: 0xffdcae,
    seaNear: 0x9fd0f0,
    seaFar: 0x6b9dd4,
    iceCentre: 0x84c6ea,
    iceRim: 0xdaf3fd,
    plaza: { field: 0xf0edff, cobA: 0xc6c0ea, cobB: 0xdad5f6, star: 0xffecbf, starDark: 0xf6d59a, diag: 0xfff5dc, hub: 0xf6c9d2, dots: 0xd0c9f2 },
    sparkle: 0xeaf4ff,
    smoke: 0xe6e3fb,
    stringColours: [0xff4d5e, 0xffd23f, 0x3ddc84, 0x4da3ff, 0xff7ad9],
  },
  candy: {
    snowTop: 0xfff4fa,
    snowShade: 0xf4cfe4,
    snowDeep: 0xe6b6d8,
    beach: 0xe6d6f8,
    path: 0xffd3e8,
    warm: 0xffd9b0,
    seaNear: 0xd9cdfa,
    seaFar: 0xa98fe0,
    iceCentre: 0xa9dcf7,
    iceRim: 0xf3fbff,
    plaza: { field: 0xfff5fa, cobA: 0xffbfe0, cobB: 0xffdff0, star: 0xffd29a, starDark: 0xffb36b, diag: 0xc9f3e3, hub: 0xb8ecff, dots: 0xffc6e3 },
    sparkle: 0xfff0fa,
    smoke: 0xffe8f6,
    stringColours: [0xff5fa8, 0xffe066, 0x6fdcb8, 0x6ec8ff, 0xc9a7ff],
  },
};

// ---------------------------------------------------------------------------
// small maths helpers
// ---------------------------------------------------------------------------

function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
const lerp = (a, b, t) => a + (b - a) * t;

function clampCount(v, def) {
  const n = Number(v);
  if (v === undefined || v === null || !Number.isFinite(n)) return def;
  return Math.max(0, Math.min(200, Math.floor(n)));
}

function makeNoise(rng) {
  const p = new Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  const perm = new Uint16Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) vals[i] = rng.next();
  const n2 = (x, z) => {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    const xf = x - xi;
    const zf = z - zi;
    const u = xf * xf * (3 - 2 * xf);
    const v = zf * zf * (3 - 2 * zf);
    const X = xi & 255;
    const Z = zi & 255;
    const a = vals[perm[X + perm[Z]]];
    const b = vals[perm[X + 1 + perm[Z]]];
    const c = vals[perm[X + perm[Z + 1]]];
    const d = vals[perm[X + 1 + perm[Z + 1]]];
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
  const fbm = (x, z, oct = 4) => {
    let s = 0;
    let amp = 0.5;
    let f = 1;
    let norm = 0;
    for (let i = 0; i < oct; i++) {
      s += amp * n2(x * f + i * 17.31, z * f - i * 9.17);
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return s / norm;
  };
  return { n2, fbm };
}

// Bridson Poisson-disc sampling inside a disc of radius R.
function poissonDisc(rng, R, minDist, k = 18) {
  const cell = minDist / Math.SQRT2;
  const n = Math.ceil((2 * R) / cell);
  const grid = new Int32Array(n * n).fill(-1);
  const pts = [];
  const active = [];
  const gi = (x) => Math.floor((x + R) / cell);
  const insert = (x, z) => {
    const idx = pts.length;
    pts.push({ x, z });
    active.push(idx);
    const ix = gi(x);
    const iz = gi(z);
    if (ix >= 0 && iz >= 0 && ix < n && iz < n) grid[iz * n + ix] = idx;
  };
  const ok = (x, z) => {
    if (x * x + z * z > R * R) return false;
    const ix = gi(x);
    const iz = gi(z);
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const cx = ix + dx;
        const cz = iz + dz;
        if (cx < 0 || cz < 0 || cx >= n || cz >= n) continue;
        const j = grid[cz * n + cx];
        if (j < 0) continue;
        const q = pts[j];
        const ddx = q.x - x;
        const ddz = q.z - z;
        if (ddx * ddx + ddz * ddz < minDist * minDist) return false;
      }
    }
    return true;
  };
  insert(0, R * 0.5);
  while (active.length) {
    const ai = Math.floor(rng.next() * active.length);
    const p = pts[active[ai]];
    let found = false;
    for (let t = 0; t < k; t++) {
      const a = rng.next() * TAU;
      const d = minDist * (1 + rng.next());
      const x = p.x + Math.sin(a) * d;
      const z = p.z + Math.cos(a) * d;
      if (ok(x, z)) {
        insert(x, z);
        found = true;
        break;
      }
    }
    if (!found) {
      active[ai] = active[active.length - 1];
      active.pop();
    }
  }
  return pts;
}

// local (lx, lz) of an object at (x, z) with yaw -> world
function toWorld(x, z, yaw, lx, lz) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: x + lx * c + lz * s, z: z - lx * s + lz * c };
}

const yawToward = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz);

// ---------------------------------------------------------------------------
// shaders: chimney smoke puffs and snow sparkles (1 draw call each)
// ---------------------------------------------------------------------------

const SMOKE_VS = /* glsl */ `
uniform float uTime;
uniform float uHalfH;
attribute vec3 aBase;
attribute float aPhase;
varying float vAlpha;
#include <fog_pars_vertex>
void main() {
  float life = fract(uTime * 0.11 + aPhase);
  vec3 p = aBase;
  p.y += life * 5.5;
  p.x += sin(life * 3.0 + aPhase * 21.0) * 0.45 * life + life * 1.4;
  p.z += cos(life * 2.3 + aPhase * 13.0) * 0.35 * life + life * 0.5;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float size = mix(0.55, 2.4, life);
  gl_PointSize = size * projectionMatrix[1][1] * uHalfH / max(0.5, -mvPosition.z);
  vAlpha = smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.5, 1.0, life)) * 0.7;
  #include <fog_vertex>
}`;

const SMOKE_FS = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
#include <fog_pars_fragment>
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.18, d) * vAlpha;
  if (a < 0.01) discard;
  float shadeF = 0.85 + 0.15 * (0.5 - c.y);
  gl_FragColor = vec4(uColor * shadeF, a);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const SPARKLE_VS = /* glsl */ `
uniform float uTime;
uniform float uHalfH;
attribute float aPhase;
attribute float aSize;
varying float vTw;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float tw = pow(max(0.0, sin(uTime * (1.2 + aPhase) + aPhase * 37.0)), 10.0);
  vTw = tw;
  gl_PointSize = aSize * (0.25 + tw) * projectionMatrix[1][1] * uHalfH / max(0.5, -mvPosition.z);
  #include <fog_vertex>
}`;

const SPARKLE_FS = /* glsl */ `
uniform vec3 uColor;
varying float vTw;
#include <fog_pars_fragment>
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float core = exp(-d * d * 60.0);
  float arms = exp(-abs(c.x) * 28.0) * exp(-abs(c.y) * 5.0) + exp(-abs(c.y) * 28.0) * exp(-abs(c.x) * 5.0);
  float a = (core + arms * 0.7) * (0.35 + vTw);
  #ifdef USE_FOG
    a *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, min(1.0, a));
  #include <colorspace_fragment>
}`;

// Village plaza paving, evaluated per fragment in plaza-local xz (metres):
// a two-tone compass star, a smaller diagonal star, a ring of round candy
// dots and a cobbled rim with soft grout lines. Every edge is anti-aliased.
const PLAZA_UNIFORM_KEYS = {
  field: 'uPlField',
  cobA: 'uPlCobA',
  cobB: 'uPlCobB',
  star: 'uPlStar',
  starDark: 'uPlStarDark',
  diag: 'uPlDiag',
  hub: 'uPlHub',
  dots: 'uPlDots',
};
const PLAZA_GLSL = /* glsl */ `
uniform vec3 uPlField;
uniform vec3 uPlCobA;
uniform vec3 uPlCobB;
uniform vec3 uPlStar;
uniform vec3 uPlStarDark;
uniform vec3 uPlDiag;
uniform vec3 uPlHub;
uniform vec3 uPlDots;
varying vec2 vPlaza;
float plFill(float d) {
  // 1 inside (d < 0), 0 outside, one pixel of anti-aliasing
  float w = fwidth(d) + 1e-4;
  return 1.0 - smoothstep(-w, w, d);
}
vec3 plazaColour(vec2 p) {
  const float PL_TAU = 6.28318530718;
  float r = length(p);
  float th = atan(p.x, p.y);
  float px = max(fwidth(p.x), fwidth(p.y)) + 1e-4;
  vec3 col = uPlField;
  // little diagonal star
  float fd = fract((th + PL_TAU / 8.0) / (PL_TAU / 4.0));
  float dd = r - (1.7 + 2.6 * pow(abs(fd * 2.0 - 1.0), 1.4));
  col = mix(col, uPlDiag, plFill(dd));
  // big compass star, folded-paper two-tone
  float fm = fract(th / (PL_TAU / 4.0));
  float dm = r - (1.7 + 4.8 * pow(abs(fm * 2.0 - 1.0), 1.4));
  vec3 star = mix(uPlStarDark, uPlStar, 1.0 - plFill(sin(th * 8.0) * r / 8.0));
  col = mix(col, star, plFill(dm));
  float dmMetric = abs(dm) * px / (fwidth(dm) + 1e-4);
  col = mix(col, uPlStarDark * 0.92, (1.0 - smoothstep(0.03, 0.03 + px, dmMetric)) * step(1.75, r) * 0.8);
  // hub under the sleigh
  col = mix(col, uPlHub, plFill(r - 1.7));
  // ring of 24 round candy dots
  float du = (fract(th * 24.0 / PL_TAU - 0.25) - 0.5) * (PL_TAU / 24.0) * r;
  col = mix(col, uPlDots, plFill(length(vec2(du, r - 8.625)) - 0.24));
  // cobbled rim: checker in rings of 0.5 m and 48 sectors, with grout
  float a = sin((r - 11.6) * PL_TAU) / PL_TAU;
  float b = sin(th * 24.0) * r / 24.0;
  float ta = smoothstep(-px, px, a);
  float tb = smoothstep(-px, px, b);
  vec3 cob = mix(uPlCobB, uPlCobA, ta * (1.0 - tb) + (1.0 - ta) * tb);
  float grout = 1.0 - smoothstep(0.028, 0.028 + px * 1.5, min(abs(a), abs(b)));
  cob *= 1.0 - 0.13 * grout;
  col = mix(col, cob, 1.0 - plFill(r - 11.6));
  return col;
}
`;

function pointsMaterial(vs, fs, color, additive) {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uTime: { value: 0 }, uHalfH: { value: 450 }, uColor: { value: new THREE.Color(color) } },
    ]),
    vertexShader: vs,
    fragmentShader: fs,
    transparent: true,
    depthWrite: false,
    fog: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  mat.userData.ownedByProp = true;
  return mat;
}

// ---------------------------------------------------------------------------
// generateMap
// ---------------------------------------------------------------------------

export function generateMap(rng, opts = {}) {
  opts = opts || {};
  const baseRng = rng && typeof rng.next === 'function' ? rng : createRng(1);
  const fork = (salt) => (typeof baseRng.fork === 'function' ? baseRng.fork(salt) : baseRng);
  const theme = opts.theme === 'candy' ? 'candy' : 'classic';
  const T = THEMES[theme];
  const crackerCount = clampCount(opts.crackerCount, 15);
  const presentCount = clampCount(opts.presentCount, 10);

  const rT = fork('terrain');
  const rL = fork('layout');
  const rS = fork('scatter');
  const rP = fork('props');
  const rX = fork('spots');
  const noise = makeNoise(rT);
  const forestNoise = makeNoise(rT);

  const group = new THREE.Group();
  group.name = 'world';

  // ---------------- layout (positions only) ----------------
  // Far enough from the sleigh that a camera parked behind Pip never hovers
  // over it, whichever way Pip starts facing (toward the sleigh = spawnYaw, or
  // out through the +Z gap in the ring).
  const spawn = { x: 0, z: 8.5 };
  const sleighInfo = { x: 0, z: 0, r: 3.5 };

  const nHouses = rL.int(2, 4);
  const hBase = rL.range(0, TAU);
  const houseSpots = [];
  for (let k = 0; k < nHouses; k++) {
    const a = hBase + ((k + rL.range(-0.22, 0.22)) * TAU) / nHouses;
    const d = rL.range(20.5, 23);
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    houseSpots.push({ x, z, a, yaw: yawToward(x, z, 0, 0) + rL.range(-0.15, 0.15), y: 0 });
  }

  const ponds = [];
  const nPonds = rL.int(1, 2);
  for (let tries = 0; tries < 80 && ponds.length < nPonds; tries++) {
    const r = rL.range(6, 10);
    const a = rL.range(0, TAU);
    const d = rL.range(28 + r, 60 - r);
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    let ok = true;
    for (const h of houseSpots) if (Math.hypot(h.x - x, h.z - z) < r + 9) ok = false;
    for (const p of ponds) if (Math.hypot(p.x - x, p.z - z) < r + p.r + 12) ok = false;
    if (ok) ponds.push({ x, z, r, a, y: 0 });
  }

  // sledging hills: big soft bumps away from everything
  const hills = [];
  for (let tries = 0; tries < 60 && hills.length < 2; tries++) {
    const a = rL.range(0, TAU);
    const d = rL.range(34, 56);
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    let ok = true;
    for (const p of ponds) if (Math.hypot(p.x - x, p.z - z) < p.r + 16) ok = false;
    for (const h of houseSpots) if (Math.hypot(h.x - x, h.z - z) < 18) ok = false;
    for (const h of hills) if (Math.hypot(h.x - x, h.z - z) < 30) ok = false;
    if (ok) hills.push({ x, z, h: rL.range(1.6, 2.4), s: rL.range(8, 11) });
  }

  // paths: from the village edge to ponds and out along a few trails
  const paths = [];
  const addPath = (sx, sz, ex, ez, bend, kind) => {
    const mx = (sx + ex) / 2;
    const mz = (sz + ez) / 2;
    const len = Math.hypot(ex - sx, ez - sz) || 1;
    const px = -(ez - sz) / len;
    const pz = (ex - sx) / len;
    const cx = mx + px * bend * len;
    const cz = mz + pz * bend * len;
    const pts = [];
    const n = Math.max(4, Math.round(len / 4));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      pts.push({ x: u * u * sx + 2 * u * t * cx + t * t * ex, z: u * u * sz + 2 * u * t * cz + t * t * ez });
    }
    paths.push({ pts, kind, len });
  };
  const usedAngles = [];
  for (const p of ponds) {
    const a = Math.atan2(p.x, p.z);
    const d = Math.hypot(p.x, p.z);
    usedAngles.push(a);
    addPath(Math.sin(a) * VILLAGE_R, Math.cos(a) * VILLAGE_R, Math.sin(a) * (d - p.r - 1.5), Math.cos(a) * (d - p.r - 1.5), rL.range(-0.18, 0.18), 'pond');
  }
  const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const nTrails = rL.int(2, 3);
  for (let tries = 0; tries < 40 && paths.length < ponds.length + nTrails; tries++) {
    const a = rL.range(0, TAU);
    let ok = true;
    for (const u of usedAngles) if (angDiff(a, u) < 0.9) ok = false;
    for (const h of houseSpots) if (angDiff(a, h.a) < 0.3) ok = false;
    if (!ok) continue;
    usedAngles.push(a);
    const d = rL.range(46, 58);
    addPath(Math.sin(a) * VILLAGE_R, Math.cos(a) * VILLAGE_R, Math.sin(a) * d, Math.cos(a) * d, rL.range(-0.2, 0.2), 'trail');
  }
  for (const h of houseSpots) {
    const door = toWorld(h.x, h.z, h.yaw, 0, 3.9);
    const a = Math.atan2(door.x, door.z);
    addPath(Math.sin(a) * (VILLAGE_R - 1.5), Math.cos(a) * (VILLAGE_R - 1.5), door.x, door.z, 0, 'door');
  }
  // ring of decorated trees + lamps around the square. A wide gap is left at +Z
  // (behind the spawn camera), trees are nudged away from path exits, and lamps
  // that would block an exit are left out.
  const pathAngles = paths.map((p) => Math.atan2(p.pts[0].x, p.pts[0].z));
  const nTrees = rL.int(6, 8);
  const gapHalf = 0.62;
  const ringAngles = [];
  const ringStep = (TAU - 2 * gapHalf) / nTrees;
  for (let k = 0; k < nTrees; k++) {
    let a = gapHalf + (k + 0.5) * ringStep + rL.range(-0.03, 0.03);
    for (const pa of pathAngles) {
      const d = Math.atan2(Math.sin(a - pa), Math.cos(a - pa));
      if (Math.abs(d) < 0.3) a += Math.sign(d || 1) * Math.min(0.24, 0.3 - Math.abs(d));
    }
    ringAngles.push(a);
  }
  const ringTrees = [];
  const ringLamps = [];
  const exits = pathAngles.concat([0]);
  ringAngles.forEach((a, k) => {
    ringTrees.push({ x: Math.sin(a) * RING_R, z: Math.cos(a) * RING_R, a });
    if (k === nTrees - 1) return;
    const b = (a + ringAngles[k + 1]) / 2;
    if (exits.some((pa) => angDiff(b, pa) < 0.3)) return;
    ringLamps.push({ x: Math.sin(b) * (RING_R - 0.2), z: Math.cos(b) * (RING_R - 0.2), a: b, slot: k });
  });
  // two lamps flanking the spawn gap
  for (const sx of [-1, 1]) {
    const b = sx * (gapHalf - 0.12);
    ringLamps.push({ x: Math.sin(b) * (RING_R + 0.4), z: Math.cos(b) * (RING_R + 0.4), a: b, slot: sx < 0 ? nTrees - 1 : 0, flank: true });
  }

  const segs = [];
  for (const p of paths) for (let i = 0; i < p.pts.length - 1; i++) segs.push(p.pts[i].x, p.pts[i].z, p.pts[i + 1].x, p.pts[i + 1].z);
  const distToPaths = (x, z) => {
    let best = Infinity;
    for (let i = 0; i < segs.length; i += 4) {
      const ax = segs[i];
      const az = segs[i + 1];
      const bx = segs[i + 2] - ax;
      const bz = segs[i + 3] - az;
      const l2 = bx * bx + bz * bz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / l2));
      const dx = x - (ax + bx * t);
      const dz = z - (az + bz * t);
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };

  // ---------------- terrain heights ----------------
  const h0 = (x, z) => {
    const r = Math.hypot(x, z);
    let h = (noise.fbm(x * 0.021 + 13.1, z * 0.021 - 7.7, 4) - 0.4) * 5.0;
    if (h < 0) h *= 0.3;
    h += (noise.n2(x * 0.09 + 50.5, z * 0.09 + 50.5) - 0.5) * 0.35;
    for (const hl of hills) {
      const dx = x - hl.x;
      const dz = z - hl.z;
      h += hl.h * Math.exp(-(dx * dx + dz * dz) / (2 * hl.s * hl.s));
    }
    if (h > 2.6) h = 2.6 + (h - 2.6) * 0.35;
    return lerp(VILLAGE_H, h, smoothstep(VILLAGE_R + 1, VILLAGE_R + 13, r));
  };
  for (const hs of houseSpots) hs.y = h0(hs.x, hs.z);
  for (const p of ponds) {
    let m = Infinity;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      m = Math.min(m, h0(p.x + Math.sin(a) * (p.r + 1), p.z + Math.cos(a) * (p.r + 1)));
    }
    p.y = Math.max(SEA_Y + 0.5, m - 0.12);
  }
  const finalHeight = (x, z) => {
    let h = h0(x, z);
    for (const hs of houseSpots) {
      const d = Math.hypot(x - hs.x, z - hs.z);
      if (d < 10) h = lerp(hs.y, h, smoothstep(5.2, 9.8, d));
    }
    // The house pads above reach into the village; keep everything under the
    // plaza decal (r <= 12.6, plus one terrain cell) exactly at VILLAGE_H so
    // the paving never sinks under the snow or floats above Pip's feet.
    const rv = Math.hypot(x, z);
    if (rv < VILLAGE_R + 1.5) h = lerp(VILLAGE_H, h, smoothstep(VILLAGE_R + 0.4, VILLAGE_R + 1.5, rv));
    for (const p of ponds) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r) {
        h = lerp(p.y - 0.35, p.y + 0.08, smoothstep(p.r * 0.82, p.r, d));
      } else if (d < p.r + 5) {
        h = lerp(p.y + 0.08, h, smoothstep(p.r, p.r + 4.5, d));
      }
    }
    const r = Math.hypot(x, z);
    if (r > 62) h = lerp(h, SEA_Y - 0.75, smoothstep(64, 78, r));
    return h;
  };

  const N = GRID_SEGS;
  const S = GRID_SIZE;
  const cell = S / N;
  const half = S / 2;
  const stride = N + 1;
  const H = new Float32Array(stride * stride);
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) H[j * stride + i] = finalHeight(-half + i * cell, -half + j * cell);
  }
  // exact height of the rendered terrain triangles
  const terrainAt = (x, z) => {
    const fx = (x + half) / cell;
    const fz = (z + half) / cell;
    if (!(fx >= 0 && fz >= 0 && fx <= N && fz <= N)) return SEA_Y - 0.75;
    const i = Math.min(N - 1, Math.floor(fx));
    const j = Math.min(N - 1, Math.floor(fz));
    const u = fx - i;
    const v = fz - j;
    const k = j * stride + i;
    const a = H[k];
    const b = H[k + 1];
    const c = H[k + stride];
    const d = H[k + stride + 1];
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  };
  const heightAt = (x, z) => {
    x = +x || 0;
    z = +z || 0;
    let h = terrainAt(x, z);
    for (let i = 0; i < ponds.length; i++) {
      const p = ponds[i];
      const dx = x - p.x;
      const dz = z - p.z;
      if (dx * dx + dz * dz < p.r * p.r && h < p.y) h = p.y;
    }
    if (h < SEA_Y && x * x + z * z > 3600) h = SEA_Y;
    return h;
  };
  const isIce = (x, z) => {
    x = +x || 0;
    z = +z || 0;
    for (let i = 0; i < ponds.length; i++) {
      const p = ponds[i];
      const dx = x - p.x;
      const dz = z - p.z;
      const rr = p.r * 0.96;
      if (dx * dx + dz * dz < rr * rr && terrainAt(x, z) < p.y + 0.01) return true;
    }
    return x * x + z * z > 3600 && terrainAt(x, z) < SEA_Y + 0.01;
  };

  // ---------------- colliders + spatial grid ----------------
  const colliders = [];
  const addCollider = (x, z, r) => {
    if (!(r > 0)) return;
    colliders.push({ x, z, r });
  };
  const addLocalColliders = (obj, list) => {
    for (const c of list || []) {
      const w = toWorld(obj.position.x, obj.position.z, obj.rotation.y, c.x, c.z);
      addCollider(w.x, w.z, c.r);
    }
  };

  const props = new THREE.Group();
  props.name = 'props';
  group.add(props);
  const place = (obj, x, z, yaw = 0, sink = 0.04) => {
    obj.position.set(x, heightAt(x, z) - sink, z);
    obj.rotation.y = yaw;
    props.add(obj);
    return obj;
  };

  // sleigh
  const sleighObj = place(makeSleigh(), sleighInfo.x, sleighInfo.z, rL.range(-0.2, 0.2), 0.02);
  if (Array.isArray(sleighObj.userData.colliders)) addLocalColliders(sleighObj, sleighObj.userData.colliders);
  else addCollider(0, 0, sleighObj.userData.radius);

  // decorated trees and lamps ring
  const decoratedTrees = [];
  for (const t of ringTrees) {
    const tree = place(makeDecoratedTree(rP, { theme }), t.x, t.z, rP.range(0, TAU), 0.02);
    decoratedTrees.push(tree);
    addCollider(t.x, t.z, tree.userData.radius);
  }
  const lamps = [];
  const addLamp = (x, z, yaw) => {
    const lamp = place(makeCandyLamp(rP), x, z, yaw, 0.05);
    lamps.push(lamp);
    addCollider(x, z, lamp.userData.radius);
    return lamp;
  };
  const ringLampObjs = ringLamps.map((l) => ({ lamp: addLamp(l.x, l.z, yawToward(l.x, l.z, 0, 0)), slot: l.slot }));

  // gingerbread houses + front yard fences + a couple of guardian pines
  const houses = [];
  const fences = [];
  for (const hs of houseSpots) {
    const house = makeGingerHouse(rP, { theme });
    house.position.set(hs.x, hs.y - 0.06, hs.z);
    house.rotation.y = hs.yaw;
    props.add(house);
    houses.push(house);
    addLocalColliders(house, house.userData.colliders);
    for (const sx of [-1, 1]) {
      const f = makeFence(2.1, { theme });
      const w = toWorld(hs.x, hs.z, hs.yaw, sx * 2.35, 4.45);
      place(f, w.x, w.z, hs.yaw, 0.05);
      fences.push(f);
      addLocalColliders(f, f.userData.colliders);
      const f2 = makeFence(1.7, { theme });
      const w2 = toWorld(hs.x, hs.z, hs.yaw, sx * 3.4, 3.55);
      place(f2, w2.x, w2.z, hs.yaw + Math.PI / 2, 0.05);
      fences.push(f2);
      addLocalColliders(f2, f2.userData.colliders);
    }
  }

  // ---------------- scatter ----------------
  const nearHouse = (x, z, d) => houseSpots.some((h) => Math.hypot(h.x - x, h.z - z) < d);
  const nearPond = (x, z, extra) => ponds.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + extra);
  const nearColl = (x, z, extra) => colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + extra);

  // standalone pines framing each house
  for (const hs of houseSpots) {
    for (const sx of [-1, 1]) {
      if (!rS.chance(0.75)) continue;
      const w = toWorld(hs.x, hs.z, hs.yaw, sx * rS.range(5.2, 6.4), rS.range(-3.5, -0.5));
      if (distToPaths(w.x, w.z) < 2.6 || nearPond(w.x, w.z, 3) || nearColl(w.x, w.z, 1.2)) continue;
      const pine = place(makePineTree(rP, { theme }), w.x, w.z, rS.range(0, TAU), 0.05);
      addCollider(w.x, w.z, pine.userData.radius);
    }
  }

  const scatter = poissonDisc(rS, 67, 3.6);
  const forestPts = [];
  const rockPts = [];
  const lumpPts = [];
  const open = [];
  for (const p of scatter) {
    const r = Math.hypot(p.x, p.z);
    if (r < VILLAGE_R + 3.5) continue;
    const pathD = distToPaths(p.x, p.z);
    const blocked = nearHouse(p.x, p.z, 7.5) || nearPond(p.x, p.z, 2.6) || pathD < 2.8;
    if (r > 64) {
      if (!blocked && rS.chance(0.25)) lumpPts.push(p);
      continue;
    }
    if (blocked) {
      if (pathD > 1.6 && !nearPond(p.x, p.z, 0.5) && !nearHouse(p.x, p.z, 5) && rS.chance(0.12)) lumpPts.push(p);
      continue;
    }
    const dens = forestNoise.fbm(p.x * 0.03 + 31.7, p.z * 0.03 - 12.2, 3) + 0.1 * smoothstep(28, 60, r);
    if (dens > 0.535 || rS.chance(0.045)) forestPts.push(p);
    else if (rS.chance(0.07)) rockPts.push(p);
    else if (rS.chance(0.1)) lumpPts.push(p);
    else open.push(p);
  }

  // forest
  const forestInst = [];
  for (const p of forestPts) {
    const scale = rS.range(0.72, 1.28);
    forestInst.push({ x: p.x, z: p.z, y: heightAt(p.x, p.z) - 0.06, scale, rot: rS.range(0, TAU) });
    addCollider(p.x, p.z, 0.78 * scale);
  }
  const forest = makeForestInstances(forestInst, rP, { theme });
  group.add(forest);

  // snowmen: one greeter next to the sleigh plus a few out in the meadows
  const snowmen = [];
  {
    // just ahead-left of the spawn, waving at Pip and the camera
    const gx = -3.4;
    const gz = spawn.z + 1.4;
    const sm = place(makeSnowman(rP), gx, gz, yawToward(gx, gz, spawn.x, spawn.z - 2.5), 0.04);
    snowmen.push(sm);
    addCollider(gx, gz, sm.userData.radius);
  }
  const openShuffled = rS.shuffle(open);
  const usedOpen = new Set();
  const wantSnowmen = rS.int(4, 8) - 1;
  for (const p of openShuffled) {
    if (snowmen.length - 1 >= wantSnowmen) break;
    const r = Math.hypot(p.x, p.z);
    if (r < 20 || r > 60 || distToPaths(p.x, p.z) < 3.2) continue;
    if (snowmen.some((s) => Math.hypot(s.position.x - p.x, s.position.z - p.z) < 14)) continue;
    if (nearColl(p.x, p.z, 1.5)) continue;
    const sm = place(makeSnowman(rP), p.x, p.z, yawToward(p.x, p.z, 0, 0) + rS.range(-0.7, 0.7), 0.04);
    snowmen.push(sm);
    usedOpen.add(p);
    addCollider(p.x, p.z, sm.userData.radius);
  }

  // candy theme: lollipop trees in the meadows
  const lollipops = [];
  if (theme === 'candy') {
    const want = rS.int(14, 20);
    for (const p of openShuffled) {
      if (lollipops.length >= want) break;
      if (usedOpen.has(p)) continue;
      const r = Math.hypot(p.x, p.z);
      if (r < 18 || r > 63 || distToPaths(p.x, p.z) < 2.6) continue;
      if (lollipops.some((l) => Math.hypot(l.position.x - p.x, l.position.z - p.z) < 7)) continue;
      if (nearColl(p.x, p.z, 1.0)) continue;
      const lp = place(makeLollipopTree(rP), p.x, p.z, rS.range(0, TAU), 0.05);
      lollipops.push(lp);
      usedOpen.add(p);
      addCollider(p.x, p.z, lp.userData.radius);
    }
  }

  // lamps along the long paths (hook leaning over the path)
  for (const p of paths) {
    if (p.kind === 'door') continue;
    let acc = 0;
    let next = 6;
    let side = rL.chance(0.5) ? 1 : -1;
    for (let i = 0; i < p.pts.length - 1; i++) {
      const a = p.pts[i];
      const b = p.pts[i + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      while (acc + L >= next) {
        const t = (next - acc) / L;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        const nx = -(b.z - a.z) / L;
        const nz = (b.x - a.x) / L;
        const lx = x + nx * side * 2.0;
        const lz = z + nz * side * 2.0;
        if (Math.hypot(lx, lz) < 63 && !nearPond(lx, lz, 1.5) && !nearColl(lx, lz, 0.8)) addLamp(lx, lz, yawToward(lx, lz, x, z));
        side = -side;
        next += 11.5;
      }
      acc += L;
    }
  }

  // rocks (instanced), plus a few around each pond
  for (const p of ponds) {
    const n = rS.int(3, 5);
    for (let k = 0; k < n; k++) {
      const a = rS.range(0, TAU);
      const x = p.x + Math.sin(a) * (p.r + rS.range(1.2, 2.2));
      const z = p.z + Math.cos(a) * (p.r + rS.range(1.2, 2.2));
      if (distToPaths(x, z) > 2.2 && !nearColl(x, z, 0.6)) rockPts.push({ x, z, pond: true });
    }
  }
  const rockGroup = new THREE.Group();
  rockGroup.name = 'rocks';
  group.add(rockGroup);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const sv = new THREE.Vector3();
  const pv = new THREE.Vector3();
  const col = new THREE.Color();
  const rockGeos = theme === 'candy' ? [makeGumdropGeometry()] : [makeRockGeometry(rP), makeRockGeometry(rP), makeRockGeometry(rP)];
  const rockBuckets = rockGeos.map(() => []);
  for (const p of rockPts) {
    const s = rS.range(0.7, 1.75) * (p.pond ? 0.8 : 1);
    rockBuckets[rS.int(0, rockGeos.length - 1)].push({ p, s, rot: rS.range(0, TAU), tilt: rS.range(-0.12, 0.12) });
    // every rock / gumdrop is solid (even the small ones are ~0.7 m across)
    addCollider(p.x, p.z, s * (theme === 'candy' ? 0.46 : 0.42));
  }
  const candyRockCols = [0xff5fa8, 0xffd23f, 0x6fdcb8, 0x6ec8ff, 0xc9a7ff, 0xff9f43];
  rockGeos.forEach((geo, gi) => {
    const list = rockBuckets[gi];
    if (!list.length) {
      geo.dispose();
      return;
    }
    const im = new THREE.InstancedMesh(geo, toon(0xffffff, { vertexColors: true }), list.length);
    list.forEach((it, i) => {
      pv.set(it.p.x, heightAt(it.p.x, it.p.z) - 0.06, it.p.z);
      e.set(it.tilt, it.rot, 0, 'YXZ');
      q.setFromEuler(e);
      sv.set(it.s, it.s * (theme === 'candy' ? 0.9 : 1), it.s);
      m4.compose(pv, q, sv);
      im.setMatrixAt(i, m4);
      if (theme === 'candy') col.set(candyRockCols[rS.int(0, candyRockCols.length - 1)]);
      else col.setRGB(1, 1, 1).multiplyScalar(rS.range(0.92, 1.05));
      im.setColorAt(i, col);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = true;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    rockGroup.add(im);
  });

  // soft snow lumps (no collision, purely cosy)
  if (lumpPts.length) {
    const im = new THREE.InstancedMesh(makeSnowLumpGeometry(theme), toon(0xffffff, { vertexColors: true }), lumpPts.length);
    lumpPts.forEach((p, i) => {
      const s = rS.range(0.5, 1.35);
      pv.set(p.x, heightAt(p.x, p.z) - 0.08, p.z);
      e.set(0, rS.range(0, TAU), 0, 'YXZ');
      q.setFromEuler(e);
      sv.set(s * rS.range(0.9, 1.5), s * rS.range(0.28, 0.45), s);
      m4.compose(pv, q, sv);
      im.setMatrixAt(i, m4);
    });
    im.instanceMatrix.needsUpdate = true;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    im.name = 'snowLumps';
    group.add(im);
  }

  // ---------------- fairy-light strings around the plaza ----------------
  {
    const sb = new MeshBuilder();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    ringLampObjs.forEach(({ lamp, slot }, i) => {
      const lp = lamp.userData.lampPos;
      const hook = toWorld(lamp.position.x, lamp.position.z, lamp.rotation.y, lp.x, lp.z * 0.5);
      a.set(hook.x, lamp.position.y + lp.y + 0.95, hook.z);
      const flank = ringLamps[i] && ringLamps[i].flank;
      const nbs = flank ? [decoratedTrees[slot]] : [decoratedTrees[slot], decoratedTrees[(slot + 1) % decoratedTrees.length]];
      for (const nb of nbs) {
        if (!nb) continue;
        const dx = a.x - nb.position.x;
        const dz = a.z - nb.position.z;
        const d = Math.hypot(dx, dz) || 1;
        b.set(nb.position.x + (dx / d) * 1.45, nb.position.y + 3.5, nb.position.z + (dz / d) * 1.45);
        addLightString(sb, a, b, { sag: 0.55, colours: T.stringColours, offset: i });
      }
    });
    if (!sb.empty) {
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
      mat.userData.ownedByProp = true;
      const strings = new THREE.Mesh(sb.build(), mat);
      strings.name = 'fairyLights';
      group.add(strings);
    }
  }

  // ---------------- terrain mesh ----------------
  const lampPools = lamps.map((l) => ({ x: l.position.x, z: l.position.z, r: 5.5, k: 0.42 }));
  for (const h of houses) {
    const d = toWorld(h.position.x, h.position.z, h.rotation.y, 0, 4.0);
    lampPools.push({ x: d.x, z: d.z, r: 6.5, k: 0.38 });
  }
  const terrainGeo = new THREE.BufferGeometry();
  {
    const pos = new Float32Array(stride * stride * 3);
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const k = j * stride + i;
        pos[k * 3] = -half + i * cell;
        pos[k * 3 + 1] = H[k];
        pos[k * 3 + 2] = -half + j * cell;
      }
    }
    const idx = new Uint32Array(N * N * 6);
    let o = 0;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = j * stride + i;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        idx[o++] = a;
        idx[o++] = c;
        idx[o++] = b;
        idx[o++] = b;
        idx[o++] = c;
        idx[o++] = d;
      }
    }
    terrainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    terrainGeo.setIndex(new THREE.BufferAttribute(idx, 1));
    terrainGeo.computeVertexNormals();
    const nor = terrainGeo.attributes.normal;
    const colors = new Float32Array(stride * stride * 3);
    const cTop = new THREE.Color(T.snowTop);
    const cShade = new THREE.Color(T.snowShade);
    const cDeep = new THREE.Color(T.snowDeep);
    const cBeach = new THREE.Color(T.beach);
    const cPath = new THREE.Color(T.path);
    const cWarm = new THREE.Color(T.warm);
    const c = new THREE.Color();
    for (let k = 0; k < stride * stride; k++) {
      const x = pos[k * 3];
      const y = pos[k * 3 + 1];
      const z = pos[k * 3 + 2];
      const r = Math.hypot(x, z);
      const ny = nor.getY(k);
      const steep = Math.max(0, 1 - ny) * 6;
      const light = smoothstep(-0.4, 2.4, y);
      const patch = noise.n2(x * 0.16 + 3.3, z * 0.16 - 8.1) - 0.5;
      const t = Math.min(1, Math.max(0, 0.55 + light * 0.45 + patch * 0.35 - steep));
      c.copy(cShade).lerp(cTop, t);
      if (t < 0.3) c.lerp(cDeep, (0.3 - t) * 1.5);
      if (r > 64) c.lerp(cBeach, smoothstep(65, 72, r));
      if (r < 80) {
        const pd = distToPaths(x, z);
        if (pd < 3) c.lerp(cPath, (1 - smoothstep(1.0, 2.6, pd)) * 0.75);
        for (const lp of lampPools) {
          const dx = x - lp.x;
          const dz = z - lp.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < lp.r * lp.r) {
            const f = 1 - Math.sqrt(d2) / lp.r;
            c.lerp(cWarm, lp.k * f * f);
          }
        }
      }
      colors[k * 3] = c.r;
      colors[k * 3 + 1] = c.g;
      colors[k * 3 + 2] = c.b;
    }
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    terrainGeo.computeBoundingSphere();
  }
  const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  terrainMat.userData.ownedByProp = true;
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.name = 'terrain';
  terrain.receiveShadow = true;
  group.add(terrain);

  // ---------------- village plaza decal: compass-star paving ----------------
  // The pattern is drawn per pixel (anti-aliased) inside a normal Lambert
  // material, so it stays crisp up close and still gets moonlight, shadows
  // and fog. (A per-cell vertex-coloured disc looked like jaggy pixel art
  // right under the spawn camera.)
  {
    const R = 12.6;
    const g = new THREE.CircleGeometry(R, 96);
    g.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const plazaUniforms = {};
    for (const key of Object.keys(PLAZA_UNIFORM_KEYS)) plazaUniforms[PLAZA_UNIFORM_KEYS[key]] = { value: new THREE.Color(T.plaza[key]) };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, plazaUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vPlaza;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPlaza = position.xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + PLAZA_GLSL)
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= plazaColour(vPlaza);');
    };
    mat.customProgramCacheKey = () => 'pipPlazaV1';
    mat.userData.ownedByProp = true;
    const plaza = new THREE.Mesh(g, mat);
    plaza.position.y = VILLAGE_H + 0.02;
    plaza.receiveShadow = true;
    plaza.name = 'plaza';
    group.add(plaza);
  }

  // ---------------- frozen sea ring + floes ----------------
  {
    const g = new THREE.RingGeometry(58, 165, 120, 10);
    g.rotateX(-Math.PI / 2);
    const P = g.attributes.position;
    const near = new THREE.Color(T.seaNear);
    const far = new THREE.Color(T.seaFar);
    const white = new THREE.Color(0xffffff);
    const c = new THREE.Color();
    const cols = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i);
      const z = P.getZ(i);
      const r = Math.hypot(x, z);
      c.copy(near).lerp(far, smoothstep(72, 150, r));
      const streak = Math.sin(x * 0.07 + z * 0.045) * Math.sin(x * 0.031 - z * 0.083);
      c.lerp(white, Math.max(0, streak) * 0.3);
      c.lerp(white, (1 - smoothstep(70, 80, r)) * 0.18);
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const mat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: 0x7f8fb8 });
    mat.userData.ownedByProp = true;
    const sea = new THREE.Mesh(g, mat);
    sea.position.y = SEA_Y;
    sea.receiveShadow = true;
    sea.name = 'frozenSea';
    group.add(sea);

    const floes = [];
    for (let k = 0; k < 26; k++) {
      const a = rS.range(0, TAU);
      const d = rS.range(84, 135);
      floes.push({ x: Math.sin(a) * d, z: Math.cos(a) * d, s: rS.range(1.5, 4.5) });
    }
    for (let k = 0; k < 22; k++) {
      const a = rS.range(0, TAU);
      const d = rS.range(73.5, 78);
      floes.push({ x: Math.sin(a) * d, z: Math.cos(a) * d, s: rS.range(0.5, 1.2) });
    }
    const im = new THREE.InstancedMesh(makeIceFloeGeometry(rP), toon(0xffffff, { vertexColors: true }), floes.length);
    floes.forEach((f, i) => {
      pv.set(f.x, SEA_Y - 0.02, f.z);
      e.set(0, rS.range(0, TAU), 0, 'YXZ');
      q.setFromEuler(e);
      sv.set(f.s, f.s * rS.range(0.6, 1.1), f.s * rS.range(0.7, 1.2));
      m4.compose(pv, q, sv);
      im.setMatrixAt(i, m4);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.name = 'iceFloes';
    group.add(im);
  }

  // ---------------- frozen ponds ----------------
  for (const p of ponds) {
    const g = new THREE.RingGeometry(0.02, p.r, 48, 6);
    g.rotateX(-Math.PI / 2);
    const P = g.attributes.position;
    const centre = new THREE.Color(T.iceCentre);
    const rim = new THREE.Color(T.iceRim);
    const white = new THREE.Color(0xffffff);
    const c = new THREE.Color();
    const cols = new Float32Array(P.count * 3);
    const sa = rS.range(0, TAU);
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i);
      const z = P.getZ(i);
      const t = Math.hypot(x, z) / p.r;
      c.copy(centre).lerp(rim, smoothstep(0.45, 1.0, t));
      const band = Math.sin((x * Math.cos(sa) + z * Math.sin(sa)) * 0.9);
      c.lerp(white, smoothstep(0.7, 1.0, band) * 0.45);
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const mat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 90, specular: 0xa9b8e0 });
    mat.userData.ownedByProp = true;
    const ice = new THREE.Mesh(g, mat);
    ice.position.set(p.x, p.y, p.z);
    ice.receiveShadow = true;
    ice.name = 'pond';
    group.add(ice);
  }

  // ---------------- snow sparkles + chimney smoke ----------------
  const sparkleMat = pointsMaterial(SPARKLE_VS, SPARKLE_FS, T.sparkle, true);
  {
    const n = 1600;
    const pos = new Float32Array(n * 3);
    const ph = new Float32Array(n);
    const sz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = rS.range(0, TAU);
      const r = Math.sqrt(rS.next()) * 70;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      pos[i * 3] = x;
      pos[i * 3 + 1] = heightAt(x, z) + 0.06;
      pos[i * 3 + 2] = z;
      ph[i] = rS.range(0, 3);
      sz[i] = rS.range(0.12, 0.28);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    const pts = new THREE.Points(g, sparkleMat);
    pts.name = 'snowSparkles';
    pts.frustumCulled = false;
    pts.renderOrder = 4;
    group.add(pts);
  }
  const smokeMat = pointsMaterial(SMOKE_VS, SMOKE_FS, T.smoke, false);
  if (houses.length) {
    const per = 9;
    const n = houses.length * per;
    const base = new Float32Array(n * 3);
    const ph = new Float32Array(n);
    const pos = new Float32Array(n * 3);
    const v = new THREE.Vector3();
    houses.forEach((h, hi) => {
      h.updateMatrixWorld(true);
      const c = h.userData.chimney;
      v.set(c.x, c.y, c.z).applyMatrix4(h.matrixWorld);
      for (let k = 0; k < per; k++) {
        const i = hi * per + k;
        base[i * 3] = v.x;
        base[i * 3 + 1] = v.y;
        base[i * 3 + 2] = v.z;
        pos[i * 3] = v.x;
        pos[i * 3 + 1] = v.y;
        pos[i * 3 + 2] = v.z;
        ph[i] = k / per + rS.range(0, 0.05);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    const smoke = new THREE.Points(g, smokeMat);
    smoke.name = 'chimneySmoke';
    smoke.frustumCulled = false;
    smoke.renderOrder = 5;
    group.add(smoke);
  }

  // warm glow over the village square (one light, not per collectable)
  const villageLight = new THREE.PointLight(theme === 'candy' ? 0xffb8d8 : 0xffc070, 26, 34, 1.5);
  villageLight.position.set(0, 5.5, 0);
  villageLight.castShadow = false;
  group.add(villageLight);

  // ---------------- collision grid + reachability ----------------
  const CG = 6;
  const CG_HALF = 84;
  const CG_N = Math.ceil((2 * CG_HALF) / CG);
  const cgCells = [];
  for (let i = 0; i < CG_N * CG_N; i++) cgCells.push([]);
  const cgIndex = (v) => Math.max(0, Math.min(CG_N - 1, Math.floor((v + CG_HALF) / CG)));
  for (let ci = 0; ci < colliders.length; ci++) {
    const c = colliders[ci];
    const i0 = cgIndex(c.x - c.r);
    const i1 = cgIndex(c.x + c.r);
    const j0 = cgIndex(c.z - c.r);
    const j1 = cgIndex(c.z + c.r);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cgCells[j * CG_N + i].push(ci);
  }
  const gridCount = colliders.length;

  const pushOut = (pos, c, rad) => {
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const min = c.r + rad;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min) return false;
    const d = Math.sqrt(d2);
    if (d < 1e-6) {
      pos.x = c.x + min;
      return true;
    }
    const k = (min - d) / d;
    pos.x += dx * k;
    pos.z += dz * k;
    return true;
  };

  const resolveCollision = (pos, radius) => {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return pos;
    const rad = Number.isFinite(radius) ? Math.max(0, radius) : 0.6;
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      const i0 = cgIndex(pos.x - rad);
      const i1 = cgIndex(pos.x + rad);
      const j0 = cgIndex(pos.z - rad);
      const j1 = cgIndex(pos.z + rad);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const list = cgCells[j * CG_N + i];
          for (let n = 0; n < list.length; n++) if (pushOut(pos, colliders[list[n]], rad)) moved = true;
        }
      }
      // colliders appended after generation (by other modules) are checked directly
      for (let n = gridCount; n < colliders.length; n++) {
        const c = colliders[n];
        if (c && pushOut(pos, c, rad)) moved = true;
      }
      if (!moved) break;
    }
    const r2 = pos.x * pos.x + pos.z * pos.z;
    if (r2 > PLAYER_BOUNDS * PLAYER_BOUNDS) {
      const s = PLAYER_BOUNDS / Math.sqrt(r2);
      pos.x *= s;
      pos.z *= s;
    }
    return pos;
  };

  // distance from (x,z) to the nearest collider edge (capped at `cap`)
  const clearanceAt = (x, z, cap = 4) => {
    let best = cap;
    const i0 = cgIndex(x - cap);
    const i1 = cgIndex(x + cap);
    const j0 = cgIndex(z - cap);
    const j1 = cgIndex(z + cap);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const list = cgCells[j * CG_N + i];
        for (let n = 0; n < list.length; n++) {
          const c = colliders[list[n]];
          const d = Math.hypot(x - c.x, z - c.z) - c.r;
          if (d < best) best = d;
        }
      }
    }
    for (let n = gridCount; n < colliders.length; n++) {
      const c = colliders[n];
      if (!c) continue;
      const d = Math.hypot(x - c.x, z - c.z) - c.r;
      if (d < best) best = d;
    }
    return best;
  };

  // flood fill from spawn on a 0.5 m grid so every spot is actually walkable-to
  const RG = 0.5;
  const RG_HALF = 73;
  const RG_N = Math.round((2 * RG_HALF) / RG) + 1;
  const reach = new Uint8Array(RG_N * RG_N);
  {
    const walk = new Uint8Array(RG_N * RG_N);
    const lim = (PLAYER_BOUNDS - 0.5) * (PLAYER_BOUNDS - 0.5);
    for (let j = 0; j < RG_N; j++) {
      const z = -RG_HALF + j * RG;
      for (let i = 0; i < RG_N; i++) {
        const x = -RG_HALF + i * RG;
        if (x * x + z * z > lim) continue;
        if (clearanceAt(x, z, 1) < 0.58) continue;
        walk[j * RG_N + i] = 1;
      }
    }
    const si = Math.round((spawn.x + RG_HALF) / RG);
    const sj = Math.round((spawn.z + RG_HALF) / RG);
    const queue = new Int32Array(RG_N * RG_N);
    let qh = 0;
    let qt = 0;
    const s0 = sj * RG_N + si;
    walk[s0] = 1;
    reach[s0] = 1;
    queue[qt++] = s0;
    while (qh < qt) {
      const cur = queue[qh++];
      const ci = cur % RG_N;
      const cj = (cur - ci) / RG_N;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di;
          const nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= RG_N || nj >= RG_N) continue;
          const nx = nj * RG_N + ni;
          if (!walk[nx] || reach[nx]) continue;
          reach[nx] = 1;
          queue[qt++] = nx;
        }
      }
    }
  }
  const isReachable = (x, z) => {
    const i = Math.round((x + RG_HALF) / RG);
    const j = Math.round((z + RG_HALF) / RG);
    if (i < 0 || j < 0 || i >= RG_N || j >= RG_N) return false;
    return reach[j * RG_N + i] === 1;
  };

  // ---------------- cracker & present spots ----------------
  const total = crackerCount + presentCount;
  const chosen = [];
  const spotValid = (x, z, spacing, minSpawn = 12, clear = 0.9) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    if (x * x + z * z > SPOT_MAX_R * SPOT_MAX_R) return false;
    if (Math.hypot(x - spawn.x, z - spawn.z) < minSpawn) return false;
    if (!isReachable(x, z)) return false;
    if (clearanceAt(x, z, 2) < clear) return false;
    for (const c of chosen) if ((c.x - x) * (c.x - x) + (c.z - z) * (c.z - z) < spacing * spacing) return false;
    return true;
  };
  if (total > 0) {
    // tucked-away candidates: behind houses, beside trees, snowmen and rocks
    const tucked = [];
    for (const h of houses) {
      for (const [lx, lz] of [
        [0, -5.4],
        [4.0, -2.6],
        [-4.0, -2.6],
        [4.1, 1.2],
        [-4.1, 1.2],
      ]) {
        tucked.push(toWorld(h.position.x, h.position.z, h.rotation.y, lx, lz));
      }
    }
    for (const t of decoratedTrees) {
      const d = Math.hypot(t.position.x, t.position.z) || 1;
      const k = (t.userData.radius + 1.3) / d;
      tucked.push({ x: t.position.x * (1 + k), z: t.position.z * (1 + k) });
    }
    for (const s of snowmen) {
      const back = toWorld(s.position.x, s.position.z, s.rotation.y, 0, -(s.userData.radius + 1.1));
      tucked.push(back);
    }
    const forestColl = forestInst.map((f) => ({ x: f.x, z: f.z, r: 0.78 * f.scale }));
    const sample = rX.shuffle(forestColl).slice(0, 160);
    for (const c of sample) {
      const a = rX.range(0, TAU);
      tucked.push({ x: c.x + Math.sin(a) * (c.r + 1.05), z: c.z + Math.cos(a) * (c.r + 1.05) });
    }
    for (const l of lollipops) {
      const a = rX.range(0, TAU);
      tucked.push({ x: l.position.x + Math.sin(a) * 1.5, z: l.position.z + Math.cos(a) * 1.5 });
    }
    const tuckedList = rX.shuffle(tucked);
    const tuckTarget = Math.round(total * 0.3);
    let tuckedCount = 0;
    for (const spacing of [10, 6]) {
      for (const c of tuckedList) {
        if (tuckedCount >= tuckTarget) break;
        if (spotValid(c.x, c.z, spacing)) {
          chosen.push({ x: c.x, z: c.z, tucked: true });
          tuckedCount++;
        }
      }
    }
    // the rest: Mitchell's best-candidate so spots spread across the island
    for (const spacing of [6, 4.5, 3, 1.5, 0]) {
      let guard = 0;
      while (chosen.length < total && guard++ < total * 4 + 20) {
        let best = null;
        let bestD = -1;
        for (let k = 0; k < 10; k++) {
          for (let t = 0; t < 30; t++) {
            const a = rX.range(0, TAU);
            const r = Math.sqrt(rX.range(0.03, 1)) * SPOT_MAX_R;
            const x = Math.sin(a) * r;
            const z = Math.cos(a) * r;
            if (!spotValid(x, z, spacing)) continue;
            let md = Infinity;
            for (const c of chosen) md = Math.min(md, (c.x - x) * (c.x - x) + (c.z - z) * (c.z - z));
            if (md > bestD) {
              bestD = md;
              best = { x, z, tucked: false };
            }
            break;
          }
        }
        if (!best) break;
        chosen.push(best);
      }
      if (chosen.length >= total) break;
    }
    // absolute fallback: walkable cells near the village, ignoring spacing
    for (let k = 0; chosen.length < total && k < 4000; k++) {
      const a = rX.range(0, TAU);
      const r = rX.range(12, 60);
      const x = spawn.x + Math.sin(a) * r;
      const z = spawn.z + Math.cos(a) * r;
      if (spotValid(x, z, 0, 12, 0.6)) chosen.push({ x, z, tucked: false });
    }
    for (let k = 0; chosen.length < total && k < 200; k++) {
      const p = { x: spawn.x + Math.sin(k) * 12.5, z: spawn.z + Math.cos(k) * 12.5 };
      resolveCollision(p, 0.6);
      chosen.push({ x: p.x, z: p.z, tucked: false });
    }
  }
  const spots = rX.shuffle(chosen);
  const crackerSpots = spots.slice(0, crackerCount).map((s) => ({ x: s.x, z: s.z, tucked: s.tucked }));
  const presentSpots = spots.slice(crackerCount, crackerCount + presentCount).map((s) => ({ x: s.x, z: s.z, tucked: s.tucked }));

  const freeRng = fork('free');
  const randomFreeSpot = (r2, minDistFromSpawn = 12) => {
    const R = r2 && typeof r2.next === 'function' ? r2 : freeRng;
    const md = Number.isFinite(minDistFromSpawn) ? Math.max(0, minDistFromSpawn) : 12;
    for (const need of [md, md * 0.5, 0]) {
      for (let i = 0; i < 300; i++) {
        const a = R.next() * TAU;
        const r = Math.sqrt(R.next()) * SPOT_MAX_R;
        const x = Math.sin(a) * r;
        const z = Math.cos(a) * r;
        if (Math.hypot(x - spawn.x, z - spawn.z) < need) continue;
        if (!isReachable(x, z)) continue;
        if (clearanceAt(x, z, 2) < 0.9) continue;
        return { x, z };
      }
    }
    const p = { x: spawn.x + 2, z: spawn.z + 2 };
    resolveCollision(p, 0.9);
    return { x: p.x, z: p.z };
  };

  // ---------------- animation ----------------
  const treeAnims = decoratedTrees.map((t) => ({
    tree: t,
    lights: t.userData.lights || [],
    star: t.userData.star,
    starGlow: t.userData.starGlow,
    glow: t.userData.glow,
    phase: t.userData.phase || 0,
    starY: t.userData.star ? t.userData.star.position.y : 0,
  }));
  const lampAnims = lamps.map((l) => ({ glow: l.userData.glow, phase: l.userData.phase || 0 }));
  const houseGlows = [];
  for (const h of houses) for (const g of h.userData.glows || []) houseGlows.push({ s: g, phase: h.userData.phase || 0 });
  const sleighAura = sleighObj.userData.aura;
  const sleighGlow = sleighObj.userData.glow;
  let clock = 0;

  const update = (dt, time) => {
    clock += Number.isFinite(dt) ? dt : 0;
    const t = Number.isFinite(time) ? time : clock;
    sparkleMat.uniforms.uTime.value = t;
    smokeMat.uniforms.uTime.value = t;
    if (typeof window !== 'undefined' && window.innerHeight) {
      const hh = window.innerHeight * 0.5 * Math.min(2, window.devicePixelRatio || 1);
      sparkleMat.uniforms.uHalfH.value = hh;
      smokeMat.uniforms.uHalfH.value = hh;
    }
    for (let i = 0; i < lampAnims.length; i++) {
      const la = lampAnims[i];
      const g = la.glow;
      if (!g) continue;
      const f = 0.9 + 0.06 * Math.sin(t * 7.3 + la.phase) + 0.04 * Math.sin(t * 13.7 + la.phase * 2.3);
      g.material.opacity = g.userData.baseOpacity * f;
      const s = g.userData.baseSize * (0.97 + 0.05 * f);
      g.scale.set(s, s, 1);
    }
    for (let i = 0; i < treeAnims.length; i++) {
      const ta = treeAnims[i];
      // companions.discoTree() flags the tree and drives its bulbs itself
      if (!ta.tree.userData.disco) {
        for (let k = 0; k < ta.lights.length; k++) {
          const l = ta.lights[k];
          const base = l.userData.baseIntensity || 1.5;
          l.material.emissiveIntensity = base * (0.55 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2.6 + k * 1.9 + ta.phase)));
        }
      }
      if (ta.star) {
        // a slow showy spin (with a little hop) so the star never sits edge-on
        ta.star.rotation.y = t * 0.8 + ta.phase;
        ta.star.position.y = ta.starY + Math.abs(Math.sin(t * 1.6 + ta.phase)) * 0.08;
      }
      if (ta.starGlow) {
        const s = ta.starGlow.userData.baseSize * (0.92 + 0.12 * Math.sin(t * 2.1 + ta.phase));
        ta.starGlow.scale.set(s, s, 1);
      }
    }
    for (let i = 0; i < houseGlows.length; i++) {
      const hg = houseGlows[i];
      hg.s.material.opacity = hg.s.userData.baseOpacity * (0.88 + 0.08 * Math.sin(t * 3.1 + hg.phase + i) + 0.04 * Math.sin(t * 9.7 + i));
    }
    if (sleighAura) {
      const s = sleighAura.userData.baseSize * (0.95 + 0.06 * Math.sin(t * 1.4));
      sleighAura.scale.set(s, s, 1);
    }
    if (sleighGlow) sleighGlow.material.opacity = sleighGlow.userData.baseOpacity * (0.9 + 0.1 * Math.sin(t * 6.1));
  };

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    disposeObject(group);
  };

  group.updateMatrixWorld(true);

  return {
    group,
    radius: ISLAND_RADIUS,
    theme,
    heightAt,
    isIce,
    colliders,
    resolveCollision,
    spawn,
    spawnYaw: Math.PI, // face the sleigh; the camera then sits in the open +Z gap
    sleigh: sleighInfo,
    decoratedTrees,
    houses,
    crackerSpots,
    presentSpots,
    randomFreeSpot,
    update,
    // extras
    sleighObject: sleighObj,
    lamps,
    snowmen,
    lollipops,
    fences,
    ponds: ponds.map((p) => ({ x: p.x, z: p.z, r: p.r, y: p.y })),
    hills: hills.map((h) => ({ x: h.x, z: h.z })),
    paths: paths.map((p) => ({ kind: p.kind, pts: p.pts.map((v) => ({ x: v.x, z: v.z })) })),
    seaY: SEA_Y,
    playerBounds: PLAYER_BOUNDS,
    isReachable,
    clearanceAt,
    dispose,
  };
}
