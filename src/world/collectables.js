// Christmas crackers and presents hidden around the island.
//
// Crackers: classic bon-bons (striped tube, twisted necks, frilly zig-zag
// ends) that float, bob and spin. Common = red/green/white, rare = shiny gold
// with twinkles, legendary = animated rainbow with orbiting stars.
// Presents: chunky rounded gift boxes with a ribbon cross and a big four-loop
// bow, random cheerful colours and patterns; mini = half size; golden = gold
// box with sparkles, treasure rays and a bigger glow. They breathe and hop.
// Everything gets excited (wiggles, hops, spins faster) when Pip is near.
//
// open(item) plays the reveal: cartoon white-glove hands tug a cracker until
// it BANGs in two (paper crown + joke slip pop out), or a present wobbles,
// pops its bow and lid and shrinks away.
//
// Draw-call budget: one mesh + one outline per idle item; all halos, sparkles
// and stars go through a single point batch, all ground light pools through a
// single InstancedMesh. Geometry is cached per style and shared.

import * as THREE from 'three';
import { toon, addOutline, PALETTE } from './materials.js';
import { createRng, randomSeed } from '../core/rng.js';
import {
  createPointBatch,
  SHAPE,
  mergeParts,
  makeOutlineGeometry,
  roundedBoxGeometry,
  starShape,
  createGlowPoolMaterial,
  getRaysTexture,
  clamp01,
  smoothstep,
  easeOutBack,
  easeInBack,
  hash01,
} from './effects.js';

const TAU = Math.PI * 2;
const OUTLINE = 0.024;
const CRACKER_HOVER = 0.95;
const EXCITE_RANGE = 4;
const HAND_X = 0.44;
const GLOW_CAP = 192;
const BATCH_CAP = 1536;

const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _white = new THREE.Color(0xffffff);
const _m4 = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

function frac(x) {
  return x - Math.floor(x);
}

function tri(x) {
  return Math.abs(frac(x) * 2 - 1);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function finite(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

function validXZ(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
}

// ---------------------------------------------------------------------------
// Materials (shared, cached in materials.js)
// ---------------------------------------------------------------------------

const MAT = {
  get plain() {
    return toon(0xffffff, { vertexColors: true });
  },
  get rare() {
    return toon(0xffffff, { vertexColors: true, emissive: 0x5a3a00, emissiveIntensity: 0.6 });
  },
  get legendary() {
    return toon(0xffffff, { vertexColors: true, emissive: 0x1c1830, emissiveIntensity: 1 });
  },
  get golden() {
    return toon(0xffffff, { vertexColors: true, emissive: 0x6a4800, emissiveIntensity: 0.7 });
  },
};

// Mesh with a normal-extruded cartoon outline (reuses materials.addOutline's material).
function outlinedMesh(geo, outlineGeo, material, castShadow = true) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = false;
  const hull = addOutline(mesh, 0);
  hull.geometry = outlineGeo;
  hull.scale.setScalar(1);
  hull.raycast = () => {};
  return mesh;
}

// ---------------------------------------------------------------------------
// Cracker geometry
// ---------------------------------------------------------------------------

const CR = 0.165; // body radius

// [radius, y, colourKey, zone]   zone: 0 plain, 1 twisted neck, 2 frill, 3 torn rim
function crackerTopProfile() {
  return [
    [CR, 0.0, 'body', 0],
    [CR * 1.02, 0.05, 'body', 0],
    [CR * 1.02, 0.072, 'body', 0],
    [CR * 1.02 + 0.014, 0.076, 'stripe', 0],
    [CR * 1.02 + 0.014, 0.114, 'stripe', 0],
    [CR * 1.02, 0.118, 'body', 0],
    [CR * 1.01, 0.176, 'body', 0],
    [CR * 1.01 + 0.014, 0.18, 'stripe', 0],
    [CR * 1.01 + 0.014, 0.218, 'stripe', 0],
    [CR * 1.0, 0.222, 'body', 0],
    [CR * 0.97, 0.27, 'body', 0],
    [CR * 0.88, 0.302, 'body', 0],
    [CR * 0.86, 0.305, 'band', 1],
    [0.1, 0.325, 'band', 1],
    [0.075, 0.35, 'band', 1],
    [0.07, 0.37, 'band', 1],
    [0.08, 0.39, 'band', 1],
    [0.094, 0.4, 'end', 0],
    [0.118, 0.43, 'end', 0],
    [0.123, 0.47, 'end', 0],
    [0.125, 0.508, 'end', 0],
    [0.127, 0.514, 'frill', 2],
    [0.15, 0.545, 'frill', 2],
    [0.19, 0.585, 'frill', 2],
    [0.216, 0.62, 'frill', 2],
    [0.213, 0.633, 'frill', 2],
    [0.2, 0.633, 'frillIn', 2],
    [0.18, 0.612, 'frillIn', 2],
    [0.125, 0.56, 'frillIn', 2],
    [0.09, 0.538, 'frillIn', 2],
    [0.0, 0.532, 'frillIn', 2],
  ];
}

function crackerFullProfile() {
  const top = crackerTopProfile();
  const bottom = top
    .slice(1)
    .reverse()
    .map(([r, y, k, z]) => [r, -y, k, z]);
  return bottom.concat(top);
}

function crackerHalfProfile() {
  const top = crackerTopProfile();
  return [
    [0.0, 0.03, 'paper', 3],
    [0.11, 0.03, 'paper', 3],
    [0.145, 0.022, 'paper', 3],
    [CR * 0.97, 0.008, 'body', 3],
    [CR * 1.0, 0.002, 'body', 3],
    ...top.slice(1),
  ];
}

const CRACKER_SEGMENTS = 24;

// Lathe the profile, deform (twisted neck, zig-zag frills, torn rim), colour
// by key, fix normals, and lay it along +X.
function latheCracker(profile, style, rainbow) {
  const P = profile.length;
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, CRACKER_SEGMENTS);
  geo.deleteAttribute('uv');
  const pos = geo.attributes.position;
  const count = pos.count;
  for (let v = 0; v < count; v++) {
    const j = v % P;
    const [, py, , zone] = profile[j];
    if (zone === 0) continue;
    let x = pos.getX(v);
    let y = pos.getY(v);
    let z = pos.getZ(v);
    const r = Math.hypot(x, z);
    if (r < 1e-5) continue;
    const phi = Math.atan2(x, z);
    const ay = Math.abs(py);
    const sy = py < 0 ? -1 : 1;
    let nr = r;
    if (zone === 1) {
      const w = Math.sin(Math.PI * clamp01((ay - 0.305) / (0.39 - 0.305)));
      nr = r * (1 + 0.14 * Math.sin(phi * 6 + ay * 55) * w);
    } else if (zone === 2) {
      const w = smoothstep(0.545, 0.633, ay);
      const t = tri((phi * 12) / TAU) - 0.5;
      y += sy * 0.05 * t * w;
      nr = r * (1 + 0.07 * t * w);
    } else if (zone === 3) {
      const w = smoothstep(0.1, 0.16, r);
      y += (0.006 + 0.024 * tri((phi * 11) / TAU) + 0.006 * Math.sin(phi * 3 + 1)) * w;
    }
    x = (x / r) * nr;
    z = (z / r) * nr;
    pos.setXYZ(v, x, y, z);
  }
  geo.computeVertexNormals();
  const nor = geo.attributes.normal;
  // seam: average the duplicated first/last meridians
  for (let j = 0; j < P; j++) {
    const a = j;
    const b = CRACKER_SEGMENTS * P + j;
    _p.set(nor.getX(a) + nor.getX(b), nor.getY(a) + nor.getY(b), nor.getZ(a) + nor.getZ(b)).normalize();
    nor.setXYZ(a, _p.x, _p.y, _p.z);
    nor.setXYZ(b, _p.x, _p.y, _p.z);
  }
  // cap centres on the axis: point straight along the axis
  for (let i = 0; i <= CRACKER_SEGMENTS; i++) {
    if (profile[0][0] === 0) nor.setXYZ(i * P, 0, -1, 0);
    if (profile[P - 1][0] === 0) nor.setXYZ(i * P + P - 1, 0, 1, 0);
  }
  // colours
  const colors = new Float32Array(count * 3);
  const rainbowMask = rainbow ? new Uint8Array(count) : null;
  const baseHue = rainbow ? new Float32Array(count) : null;
  for (let v = 0; v < count; v++) {
    const j = v % P;
    const key = profile[j][2];
    const yv = pos.getY(v);
    if (rainbow && (key === 'body' || key === 'end' || key === 'frill' || key === 'frillIn')) {
      rainbowMask[v] = key === 'frillIn' ? 2 : 1;
      baseHue[v] = frac(yv * 0.85 + 2);
      _c.setHSL(baseHue[v], 1, key === 'frillIn' ? 0.7 : 0.55);
    } else {
      _c.set(style[key] ?? 0xffffff);
    }
    colors[v * 3] = _c.r;
    colors[v * 3 + 1] = _c.g;
    colors[v * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.rotateZ(-Math.PI / 2); // lathe axis +Y -> cracker axis +X
  geo.computeBoundingSphere();
  if (rainbow) geo.userData.rainbow = { mask: rainbowMask, hue: baseHue };
  return geo;
}

const CRACKER_STYLES = {
  common: [
    { body: 0xe63946, stripe: 0xffffff, band: 0xffc94a, end: 0x2a9d6f, frill: 0xffffff, frillIn: 0xffe3e6, paper: 0xfff3dc },
    { body: 0x2a9d6f, stripe: 0xffffff, band: 0xffc94a, end: 0xe63946, frill: 0xffffff, frillIn: 0xe3fff1, paper: 0xfff3dc },
    { body: 0xf7f5ff, stripe: 0xe63946, band: 0x2a9d6f, end: 0xe63946, frill: 0x2a9d6f, frillIn: 0xd9f5e6, paper: 0xfff3dc },
  ],
  rare: [{ body: 0xffc94a, stripe: 0xfff6d5, band: 0xe63946, end: 0xffb020, frill: 0xfff1bf, frillIn: 0xffe49a, paper: 0xfff3dc }],
  legendary: [{ body: 0xffffff, stripe: 0xffffff, band: 0xffd34d, end: 0xffffff, frill: 0xffffff, frillIn: 0xffffff, paper: 0xfff3dc }],
};

const crackerCache = new Map();
function crackerGeometries(rarity, styleIndex) {
  const key = `${rarity}:${styleIndex}`;
  if (crackerCache.has(key)) return crackerCache.get(key);
  const list = CRACKER_STYLES[rarity] || CRACKER_STYLES.common;
  const style = list[styleIndex % list.length];
  const rainbow = rarity === 'legendary';
  const full = latheCracker(crackerFullProfile(), style, rainbow);
  const half = latheCracker(crackerHalfProfile(), style, rainbow);
  const entry = {
    full,
    fullOutline: makeOutlineGeometry(full, OUTLINE),
    half,
    halfOutline: makeOutlineGeometry(half, OUTLINE),
  };
  crackerCache.set(key, entry);
  return entry;
}

// ---------------------------------------------------------------------------
// Cartoon glove hands, paper crown and joke slip
// ---------------------------------------------------------------------------

let gloveCache = null;
function gloveGeometries() {
  if (gloveCache) return gloveCache;
  const W = 0xffffff;
  const parts = [];
  const add = (geo, color) => {
    geo.deleteAttribute('uv');
    parts.push({ geo, color });
  };
  // fist (the cracker end runs through it along X)
  add(new THREE.SphereGeometry(0.145, 18, 14).scale(1.05, 1.08, 1.0), W);
  // curled finger rolls wrapping round the front (+Z, towards the camera)
  for (let k = 0; k < 4; k++) add(new THREE.CapsuleGeometry(0.043, 0.085, 4, 10).translate(-0.08 + k * 0.053, -0.02, 0.112), W);
  // inked creases between the fingers
  for (let k = 0; k < 3; k++) add(new THREE.CapsuleGeometry(0.009, 0.08, 2, 6).translate(-0.0535 + k * 0.053, -0.02, 0.15), PALETTE.outline);
  // thumb on top, pointing towards the middle of the cracker (-X)
  add(new THREE.CapsuleGeometry(0.046, 0.09, 4, 10).rotateZ(Math.PI / 2 + 0.25).translate(-0.06, 0.115, 0.05), W);
  // wrist and a puffy cuff with a candy-red rolled lip, reaching out/up/back
  const dir = new THREE.Vector3(1, 0.75, -0.45).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(_up, dir);
  const place = (geo, dist) => geo.applyQuaternion(q).translate(dir.x * dist, dir.y * dist, dir.z * dist);
  add(place(new THREE.CylinderGeometry(0.068, 0.075, 0.18, 14), 0.17), W);
  add(place(new THREE.CylinderGeometry(0.118, 0.086, 0.1, 18), 0.28), 0xf3efff);
  add(place(new THREE.TorusGeometry(0.112, 0.03, 8, 20).rotateX(Math.PI / 2), 0.33), PALETTE.red);
  const geo = mergeParts(parts);
  gloveCache = { geo, outline: makeOutlineGeometry(geo, OUTLINE * 0.9) };
  return gloveCache;
}

let crownGeo = null;
function crownGeometry() {
  if (crownGeo) return crownGeo;
  const geo = new THREE.CylinderGeometry(0.11, 0.1, 0.07, 16, 1, true);
  const pos = geo.attributes.position;
  // top row: alternate tall points for a zig-zag paper crown
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const a = Math.atan2(x, z);
      const k = Math.round((a / TAU) * 16);
      if (((k % 2) + 2) % 2 === 0) pos.setY(i, pos.getY(i) + 0.04);
    }
  }
  geo.computeVertexNormals();
  crownGeo = geo;
  return crownGeo;
}

let slipGeo = null;
function slipGeometry() {
  if (!slipGeo) slipGeo = roundedBoxGeometry(0.2, 0.006, 0.075, 0.003, 1);
  return slipGeo;
}

// ---------------------------------------------------------------------------
// Present geometry
// ---------------------------------------------------------------------------

const PW = 0.84; // box width
const PH = 0.6; // box height
const LW = 0.92; // lid width
const LH = 0.17; // lid height
const LID_CY = 0.55 + LH / 2; // lid centre (0.635)
const LID_TOP = 0.55 + LH; // 0.72
const BOW_CY = LID_TOP + 0.035;

const PRESENT_STYLES = [
  { box: 0xe63946, ribbon: 0xffd166, deco: 0xffffff },
  { box: 0x2a9d6f, ribbon: 0xe63946, deco: 0xffffff },
  { box: 0x4d96ff, ribbon: 0xffffff, deco: 0xffd166 },
  { box: 0xa66cff, ribbon: 0xffd166, deco: 0xffffff },
  { box: 0xff8fc7, ribbon: 0xffffff, deco: 0xe63946 },
  { box: 0x2ec4b6, ribbon: 0xff5d8f, deco: 0xffffff },
  { box: 0xff9f43, ribbon: 0x2a9d6f, deco: 0xffffff },
  { box: 0xf4f8ff, ribbon: 0xe63946, deco: 0x2a9d6f },
];
const GOLDEN_STYLE = { box: 0xffc94a, lid: 0xffd970, ribbon: 0xe63946, deco: 0xfff6d8, knot: 0xffe08a };
const PATTERNS = ['plain', 'dots', 'stars', 'dots', 'stars'];

// Body / box colours that vanish into a theme's snow (white on white snow;
// pink or white on candy-pink snow) are never picked for that theme.
const SNOW_LOOKALIKES = {
  classic: [0xf7f5ff, 0xf4f8ff],
  candy: [0xf7f5ff, 0xf4f8ff, 0xff8fc7],
};

const themePickCache = new Map();
// Indices into `list` whose `key` colour stands out on `theme`'s snow.
function themePicks(list, key, theme) {
  const cacheKey = `${theme}:${key}:${list.length}`;
  if (themePickCache.has(cacheKey)) return themePickCache.get(cacheKey);
  const avoid = SNOW_LOOKALIKES[theme] || SNOW_LOOKALIKES.classic;
  let picks = [];
  list.forEach((style, i) => {
    if (!avoid.includes(style[key])) picks.push(i);
  });
  if (!picks.length) picks = list.map((_, i) => i);
  themePickCache.set(cacheKey, picks);
  return picks;
}

function themeOf(world) {
  return world && world.theme === 'candy' ? 'candy' : 'classic';
}

function decoGeometry(pattern, facing) {
  // facing: 'side' (faces +Z) or 'top' (faces +Y)
  let g;
  if (pattern === 'stars') {
    g = new THREE.ExtrudeGeometry(starShape(0.09, 0.04), {
      depth: 0.01,
      bevelEnabled: true,
      bevelThickness: 0.005,
      bevelSize: 0.005,
      bevelSegments: 1,
    });
    if (facing === 'top') g.rotateX(-Math.PI / 2);
  } else {
    g = new THREE.SphereGeometry(0.075, 9, 6);
    if (facing === 'top') g.scale(1, 0.3, 1);
    else g.scale(1, 1, 0.3);
  }
  g.deleteAttribute('uv');
  return g;
}

function buildPresentGeometries(style, pattern) {
  const boxCol = style.box;
  const lidCol = style.lid ?? new THREE.Color(style.box).lerp(_white, 0.14).getHex();
  const ribbon = style.ribbon;
  const knot = style.knot ?? new THREE.Color(style.ribbon).multiplyScalar(0.86).getHex();
  // --- base
  const base = [];
  base.push({ geo: roundedBoxGeometry(PW, PH, PW, 0.075, 2).translate(0, PH / 2, 0), color: boxCol });
  base.push({ geo: roundedBoxGeometry(0.15, PH - 0.004, PW + 0.026, 0.02, 1).translate(0, PH / 2, 0), color: ribbon });
  base.push({ geo: roundedBoxGeometry(PW + 0.026, PH - 0.004, 0.15, 0.02, 1).translate(0, PH / 2, 0), color: ribbon });
  // dark inside, only seen once the lid pops off
  const inside = new THREE.Color(boxCol).multiplyScalar(0.22).getHex();
  base.push({ geo: roundedBoxGeometry(PW - 0.1, 0.02, PW - 0.1, 0.008, 1).translate(0, PH + 0.001, 0), color: inside });
  if (pattern !== 'plain') {
    const spots = [
      [-0.235, 0.27],
      [0.235, 0.27],
    ];
    for (let f = 0; f < 4; f++) {
      const ang = (f * Math.PI) / 2;
      for (const [u, v] of spots) {
        const g = decoGeometry(pattern, 'side');
        g.translate(u, v, PW / 2 + (pattern === 'stars' ? -0.004 : 0.002));
        g.rotateY(ang);
        base.push({ geo: g, color: style.deco });
      }
    }
  }
  const baseGeo = mergeParts(base);
  // --- lid (local origin = lid centre)
  const lid = [];
  lid.push({ geo: roundedBoxGeometry(LW, LH, LW, 0.055, 2), color: lidCol });
  lid.push({ geo: roundedBoxGeometry(0.16, LH + 0.012, LW + 0.022, 0.02, 1).translate(0, 0.004, 0), color: ribbon });
  lid.push({ geo: roundedBoxGeometry(LW + 0.022, LH + 0.012, 0.16, 0.02, 1).translate(0, 0.004, 0), color: ribbon });
  if (pattern !== 'plain') {
    for (const [u, w] of [
      [-0.25, -0.25],
      [0.25, -0.25],
      [-0.25, 0.25],
      [0.25, 0.25],
    ]) {
      const g = decoGeometry(pattern, 'top');
      g.translate(u, LH / 2 + (pattern === 'stars' ? -0.004 : 0.002), w);
      lid.push({ geo: g, color: style.deco });
    }
  }
  const lidGeo = mergeParts(lid);
  // --- bow (local origin = knot)
  const bow = [];
  for (let k = 0; k < 4; k++) {
    const g = new THREE.TorusGeometry(0.12, 0.04, 7, 16);
    g.deleteAttribute('uv');
    g.scale(1.25, 0.85, 1.55);
    g.translate(0.15, 0, 0);
    g.rotateZ(0.55);
    g.rotateY((k * Math.PI) / 2 + Math.PI / 4);
    bow.push({ geo: g, color: ribbon });
  }
  for (const side of [-1, 1]) {
    const g = roundedBoxGeometry(0.075, 0.022, 0.25, 0.01, 1);
    g.translate(0, 0, 0.11);
    g.rotateX(0.38);
    g.rotateY(side * 0.5);
    g.translate(0, -0.035, 0);
    bow.push({ geo: g, color: ribbon });
  }
  const knotGeo = new THREE.SphereGeometry(0.078, 12, 8).scale(1.1, 0.9, 1.1).translate(0, 0.012, 0);
  knotGeo.deleteAttribute('uv');
  bow.push({ geo: knotGeo, color: knot });
  const bowGeo = mergeParts(bow);
  // --- idle: everything in one mesh
  const fullGeo = mergeParts([
    { geo: baseGeo.clone() },
    { geo: lidGeo.clone().translate(0, LID_CY, 0) },
    { geo: bowGeo.clone().translate(0, BOW_CY, 0) },
  ]);
  return {
    full: fullGeo,
    fullOutline: makeOutlineGeometry(fullGeo, OUTLINE),
    base: baseGeo,
    baseOutline: makeOutlineGeometry(baseGeo, OUTLINE),
    lid: lidGeo,
    lidOutline: makeOutlineGeometry(lidGeo, OUTLINE),
    bow: bowGeo,
    bowOutline: makeOutlineGeometry(bowGeo, OUTLINE),
    boxColor: boxCol,
    ribbonColor: ribbon,
  };
}

const presentCache = new Map();
function presentGeometries(styleIndex, pattern, golden) {
  const key = golden ? 'golden' : `${styleIndex}:${pattern}`;
  if (presentCache.has(key)) return presentCache.get(key);
  const style = golden ? GOLDEN_STYLE : PRESENT_STYLES[styleIndex % PRESENT_STYLES.length];
  const entry = buildPresentGeometries(style, golden ? 'stars' : pattern);
  presentCache.set(key, entry);
  return entry;
}

const CROWN_COLORS = [0xe63946, 0x2a9d6f, 0xffc94a, 0xff8fc7, 0x4d96ff, 0xa66cff];

// One live system per scene: creating a new one (e.g. for the next night's map)
// disposes the previous one so its batch/glow meshes never pile up.
const liveByScene = new WeakMap();

// ---------------------------------------------------------------------------
// The collectables system
// ---------------------------------------------------------------------------

export function createCollectables(scene, world, rng) {
  const sceneKey = scene && typeof scene === 'object' ? scene : null;
  if (sceneKey && liveByScene.has(sceneKey)) {
    try {
      liveByScene.get(sceneKey).dispose();
    } catch {
      /* already gone */
    }
  }
  const root = new THREE.Group();
  root.name = 'collectables';
  if (scene && typeof scene.add === 'function') scene.add(root);
  let W = world || {};
  let theme = themeOf(W);

  // Our own random stream so we never shift the caller's sequence.
  let vrng = null;
  if (rng && typeof rng.fork === 'function') {
    try {
      vrng = rng.fork('collectables');
    } catch {
      vrng = null;
    }
  }
  if (!vrng) vrng = rng && typeof rng.next === 'function' ? rng : createRng(randomSeed());
  const rand = () => vrng.next();
  const randInt = (n) => Math.floor(rand() * n) % Math.max(1, n);

  const items = [];
  const state = new WeakMap();
  let nextId = 1;
  let clock = 0;
  let legendaryAlive = 0;
  const lastPlayer = new THREE.Vector3();
  let hasPlayer = false;

  function heightAt(x, z) {
    if (typeof W.heightAt === 'function') {
      try {
        return finite(W.heightAt(x, z), 0);
      } catch {
        return 0;
      }
    }
    return 0;
  }

  // ---- shared batched visuals ----------------------------------------------
  const batch = createPointBatch(BATCH_CAP, { core: 0.8, renderOrder: 21 });
  root.add(batch.points);

  const glowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const glowMat = createGlowPoolMaterial({ opacity: 0.9, blend: 0.55 });
  const glowMesh = new THREE.InstancedMesh(glowGeo, glowMat, GLOW_CAP);
  glowMesh.name = 'collectableGlows';
  glowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < GLOW_CAP; i++) glowMesh.setColorAt(i, _white);
  glowMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  glowMesh.count = 0;
  glowMesh.frustumCulled = false;
  glowMesh.visible = false;
  glowMesh.renderOrder = 4;
  glowMesh.raycast = () => {};
  root.add(glowMesh);
  let glowN = 0;

  function pushGroundGlow(st, size, r, g, b) {
    if (glowN >= GLOW_CAP) return;
    _s.set(size, 1, size);
    _m4.compose(st.groundPos, st.groundQuat, _s);
    glowMesh.setMatrixAt(glowN, _m4);
    _c.setRGB(r, g, b);
    glowMesh.setColorAt(glowN, _c);
    glowN++;
  }

  // ---- spawning ----------------------------------------------------------------
  function makeItem(type, x, z) {
    const y = heightAt(x, z);
    const group = new THREE.Group();
    group.name = type;
    group.position.set(x, y, z);
    const pivot = new THREE.Group();
    group.add(pivot);
    const item = {
      id: nextId++,
      type,
      group,
      position: group.position,
      alive: true,
      opening: false,
      rarity: undefined,
      golden: false,
      mini: false,
      center: new THREE.Vector3(x, y + 0.5, z),
    };
    // light pool hugs the slope
    const e = 0.5;
    const nx = heightAt(x - e, z) - heightAt(x + e, z);
    const nz = heightAt(x, z - e) - heightAt(x, z + e);
    const n = new THREE.Vector3(nx, 2 * e, nz).normalize();
    const st = {
      pivot,
      mesh: null,
      phase: rand() * TAU,
      excite: 0,
      spawnT: 0,
      delay: 0,
      spin: rand() * TAU,
      hop: rand(),
      yaw: rand() * TAU,
      tiltDir: rand() < 0.5 ? -1 : 1,
      sizeMult: 1,
      groundPos: new THREE.Vector3(x, y + 0.04, z),
      groundQuat: new THREE.Quaternion().setFromUnitVectors(_up, n),
      haloColor: new THREE.Color(),
      glowColor: new THREE.Color(),
      anim: null,
      done: false,
      rays: null,
      geos: null,
    };
    state.set(item, st);
    return { item, st };
  }

  function spawnCracker(x, z, opts = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    let rarity = (opts && opts.rarity) || 'common';
    if (rarity !== 'common' && rarity !== 'rare' && rarity !== 'legendary') rarity = 'common';
    const { item, st } = makeItem('cracker', x, z);
    item.rarity = rarity;
    item.crownColor = CROWN_COLORS[randInt(CROWN_COLORS.length)];
    let styleIndex = 0;
    if (rarity === 'common') {
      const picks = themePicks(CRACKER_STYLES.common, 'body', theme);
      styleIndex = picks[randInt(picks.length)];
    }
    const geos = crackerGeometries(rarity, styleIndex);
    st.geos = geos;
    st.material = rarity === 'rare' ? MAT.rare : rarity === 'legendary' ? MAT.legendary : MAT.plain;
    st.mesh = outlinedMesh(geos.full, geos.fullOutline, st.material);
    st.pivot.add(st.mesh);
    st.pivot.position.y = CRACKER_HOVER;
    if (rarity === 'rare') {
      st.haloColor.setRGB(1, 0.72, 0.25);
      st.glowColor.setRGB(1, 0.55, 0.08);
    } else if (rarity === 'legendary') {
      st.haloColor.setRGB(1, 1, 1);
      st.glowColor.setRGB(1, 1, 1);
      legendaryAlive++;
    } else {
      st.haloColor.setRGB(1, 0.8, 0.55);
      st.glowColor.setRGB(1, 0.6, 0.25);
    }
    st.pivot.scale.setScalar(0.0001);
    root.add(item.group);
    items.push(item);
    return item;
  }

  function spawnPresent(x, z, opts = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const golden = !!(opts && opts.golden);
    const mini = !!(opts && opts.mini) && !golden;
    const { item, st } = makeItem('present', x, z);
    item.golden = golden;
    item.mini = mini;
    const picks = themePicks(PRESENT_STYLES, 'box', theme);
    const styleIndex = picks[randInt(picks.length)];
    const pattern = PATTERNS[randInt(PATTERNS.length)];
    const geos = presentGeometries(styleIndex, pattern, golden);
    st.geos = geos;
    st.material = golden ? MAT.golden : MAT.plain;
    st.mesh = outlinedMesh(geos.full, geos.fullOutline, st.material);
    st.pivot.add(st.mesh);
    st.sizeMult = golden ? 1.15 : mini ? 0.55 : 1;
    if (golden) {
      st.haloColor.setRGB(1, 0.75, 0.2);
      st.glowColor.setRGB(1, 0.6, 0.1);
      const mat = new THREE.SpriteMaterial({
        map: getRaysTexture(),
        color: 0xffd34d,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      });
      const rays = new THREE.Sprite(mat);
      rays.name = 'goldenRays';
      rays.raycast = () => {};
      rays.scale.setScalar(0.0001);
      item.group.add(rays);
      st.rays = rays;
    } else {
      // A warm lantern-gold pool under every present, only lightly tinted by
      // the box, so it reads against white and candy-pink snow alike.
      _c.set(geos.boxColor);
      _c2.setRGB(1, 0.62, 0.22);
      st.glowColor.copy(_c2).lerp(_c, 0.25);
      st.haloColor.copy(_c).lerp(_white, 0.3).lerp(_c2, 0.35);
    }
    st.pivot.scale.setScalar(0.0001);
    root.add(item.group);
    items.push(item);
    return item;
  }

  // ---- populate --------------------------------------------------------------
  function farFromItems(p, minD) {
    for (const it of items) {
      if (Math.hypot(it.position.x - p.x, it.position.z - p.z) < minD) return false;
    }
    return true;
  }

  function freeSpot(minDist = 12) {
    let spot = null;
    for (let tries = 0; tries < 12; tries++) {
      let p = null;
      if (typeof W.randomFreeSpot === 'function') {
        try {
          p = W.randomFreeSpot(vrng, minDist);
        } catch {
          p = null;
        }
      }
      if (!validXZ(p)) {
        const a = rand() * TAU;
        const r = minDist + rand() * Math.max(1, 60 - minDist);
        p = { x: Math.cos(a) * r, z: Math.sin(a) * r };
      }
      spot = p;
      if (farFromItems(p, 3.5)) break;
    }
    return spot;
  }

  function populate(opts = {}) {
    clear();
    const o = opts || {};
    const rarities = Array.isArray(o.crackerRarities) ? o.crackerRarities : [];
    const presentCount = Math.max(0, Math.floor(finite(Number(o.presents), 0)));
    const goldenCount = Math.max(0, Math.floor(finite(Number(o.goldenCount), 0)));
    const cSpots = Array.isArray(W.crackerSpots) ? W.crackerSpots.filter(validXZ) : [];
    const pSpots = Array.isArray(W.presentSpots) ? W.presentSpots.filter(validXZ) : [];
    let order = 0;
    const stagger = (it) => {
      if (it) state.get(it).delay = 0.1 + order++ * 0.035;
    };
    for (let i = 0; i < rarities.length; i++) {
      const spot = i < cSpots.length ? cSpots[i] : freeSpot(12);
      if (spot) stagger(spawnCracker(spot.x, spot.z, { rarity: rarities[i] }));
    }
    for (let i = 0; i < presentCount; i++) {
      const spot = i < pSpots.length ? pSpots[i] : freeSpot(12);
      if (spot) stagger(spawnPresent(spot.x, spot.z));
    }
    // golden presents: the unused present spots furthest from spawn, else a far free spot
    const sp = W.spawn && validXZ(W.spawn) ? W.spawn : { x: 0, z: 0 };
    const leftovers = pSpots
      .slice(presentCount)
      .sort((a, b) => Math.hypot(b.x - sp.x, b.z - sp.z) - Math.hypot(a.x - sp.x, a.z - sp.z));
    for (let g = 0; g < goldenCount; g++) {
      const spot = leftovers[g] || freeSpot(25);
      if (spot) stagger(spawnPresent(spot.x, spot.z, { golden: true }));
    }
    return items;
  }

  // ---- queries -----------------------------------------------------------------
  function nearest(pos, opts = {}) {
    if (!validXZ(pos)) return null;
    const o = opts || {};
    const type = o.type;
    const maxDist = Number.isFinite(o.maxDist) ? o.maxDist : Infinity;
    const filter = typeof o.filter === 'function' ? o.filter : null;
    let best = null;
    let bestD = Infinity;
    for (const it of items) {
      if (!it.alive || it.opening) continue;
      if (type && it.type !== type) continue;
      const d = Math.hypot(it.position.x - pos.x, it.position.z - pos.z);
      if (d > maxDist || d >= bestD) continue;
      if (filter) {
        let ok = false;
        try {
          ok = !!filter(it);
        } catch {
          ok = false;
        }
        if (!ok) continue;
      }
      best = it;
      bestD = d;
    }
    return best ? { item: best, dist: bestD } : null;
  }

  // Returns a fresh array each call (a couple of dozen refs — cheap), so callers
  // can keep or iterate it safely while calling alive() again.
  function alive(type) {
    const key = type === undefined || type === null || type === 'all' ? 'all' : type === 'cracker' || type === 'present' ? type : 'none';
    const out = [];
    if (key === 'none') return out;
    for (const it of items) {
      if (it.alive && !it.opening && (key === 'all' || it.type === key)) out.push(it);
    }
    return out;
  }

  // ---- open ----------------------------------------------------------------------
  function open(item, opts = {}) {
    const st = item ? state.get(item) : null;
    if (!st || !item.alive || item.opening || st.done) return Promise.resolve(false);
    const onBang = opts && typeof opts.onBang === 'function' ? opts.onBang : null;
    item.opening = true;
    return new Promise((resolve) => {
      st.anim = { t: 0, banged: false, onBang, resolve, init: false };
    });
  }

  function fireBang(item, st) {
    const a = st.anim;
    a.banged = true;
    if (!a.onBang) return;
    try {
      a.onBang({ item, position: item.center.clone(), crownColor: item.crownColor });
    } catch (err) {
      if (typeof console !== 'undefined') console.warn('collectables: onBang failed', err);
    }
  }

  function finish(item, st) {
    st.done = true;
    const a = st.anim;
    if (a && a.resolve) {
      const r = a.resolve;
      a.resolve = null;
      r(true);
    }
  }

  function addPart(parent, geo, outline, material) {
    const m = outlinedMesh(geo, outline, material);
    parent.add(m);
    return m;
  }

  // ---- cracker reveal: glove hands tug, BANG, halves fly ---------------------
  function crackerOpenStep(item, st, dt) {
    const a = st.anim;
    const pv = st.pivot;
    if (!a.init) {
      a.init = true;
      const yaw0 = pv.rotation.y;
      let target = yaw0;
      if (hasPlayer) target = Math.atan2(lastPlayer.x - item.position.x, lastPlayer.z - item.position.z);
      a.yaw0 = yaw0;
      a.dYaw = wrapAngle(target - yaw0);
      a.z0 = pv.rotation.z;
      a.x0 = pv.rotation.x;
      a.h0 = pv.position.y;
      a.s0 = pv.scale.x;
      const gl = gloveGeometries();
      a.handR = addPart(pv, gl.geo, gl.outline, MAT.plain);
      a.handL = addPart(pv, gl.geo, gl.outline, MAT.plain);
      a.handR.scale.setScalar(0.0001);
      a.handL.scale.set(-0.0001, 0.0001, 0.0001);
    }
    a.t += dt;
    const t = a.t;
    const k = smoothstep(0, 0.18, t);
    pv.rotation.y = a.yaw0 + a.dYaw * k;
    pv.position.y = lerp(a.h0, CRACKER_HOVER + 0.12, k);
    const ps = lerp(a.s0, 1, k);
    pv.scale.setScalar(ps);

    if (t < 0.5) {
      const strain = smoothstep(0.12, 0.5, t);
      const tug = 0.045 * Math.sin((t - 0.12) * 32) * strain;
      const stretch = 1 + 0.16 * strain + tug;
      st.mesh.scale.set(stretch, 1 - 0.07 * strain, 1 - 0.07 * strain);
      pv.rotation.z = a.z0 * (1 - k) + Math.sin(t * 62) * 0.05 * strain;
      pv.rotation.x = a.x0 * (1 - k) + Math.sin(t * 47 + 1) * 0.04 * strain;
      const hs = t < 0.17 ? Math.max(0.0001, easeOutBack(t / 0.17)) : 1;
      const hx = HAND_X * stretch + (1 - smoothstep(0, 0.17, t)) * 0.4;
      a.handR.position.set(hx, 0, 0);
      a.handL.position.set(-hx, 0, 0);
      a.handR.scale.setScalar(hs);
      a.handL.scale.set(-hs, hs, hs);
      a.handR.rotation.z = -0.22 * strain + tug * 2;
      a.handL.rotation.z = 0.22 * strain - tug * 2;
      return;
    }

    if (!a.banged) {
      // BANG! swap the whole cracker for two torn halves, the hands go with them
      st.mesh.visible = false;
      pv.rotation.z = 0;
      pv.rotation.x = 0;
      const g = st.geos;
      a.halfR = addPart(pv, g.half, g.halfOutline, st.material);
      a.halfL = addPart(pv, g.half, g.halfOutline, st.material);
      a.halfR.position.set(0.02, 0, 0);
      a.halfL.position.set(-0.02, 0, 0);
      a.halfL.scale.set(-1, 1, 1);
      a.halfR.add(a.handR);
      a.halfL.add(a.handL);
      a.handR.position.set(HAND_X, 0, 0);
      a.handL.position.set(HAND_X, 0, 0);
      a.handR.scale.setScalar(1);
      a.handL.scale.setScalar(1);
      a.handR.rotation.z = -0.3;
      a.handL.rotation.z = -0.3;
      a.vR = new THREE.Vector2(3.8, 2.3);
      a.vL = new THREE.Vector2(-3.8, 2.3);
      a.wR = 7.5;
      // paper crown + joke slip pop out of the middle
      a.crown = new THREE.Mesh(crownGeometry(), toon(item.crownColor || PALETTE.gold, { side: THREE.DoubleSide }));
      a.crown.position.set(0, 0.05, 0);
      a.crownV = new THREE.Vector3((rand() - 0.5) * 0.6, 3.3, 0.5);
      a.slip = new THREE.Mesh(slipGeometry(), toon(0xfffdf5));
      a.slip.position.set(0, 0.02, 0.02);
      a.slipV = new THREE.Vector3((rand() - 0.5) * 0.8, 2.7, 0.7);
      a.crown.castShadow = false;
      a.slip.castShadow = false;
      pv.add(a.crown);
      pv.add(a.slip);
      updateCenter(item, st);
      fireBang(item, st);
    }

    // after the bang
    const u = t - 0.5;
    const drag = Math.max(0, 1 - 1.6 * dt);
    a.vR.x *= drag;
    a.vL.x *= drag;
    a.vR.y -= 7.5 * dt;
    a.vL.y -= 7.5 * dt;
    a.halfR.position.x += a.vR.x * dt;
    a.halfR.position.y += a.vR.y * dt;
    a.halfL.position.x += a.vL.x * dt;
    a.halfL.position.y += a.vL.y * dt;
    a.wR *= Math.max(0, 1 - 2.2 * dt);
    a.halfR.rotation.z += a.wR * dt;
    a.halfL.rotation.z -= a.wR * dt;
    // hands: little victory wave while flying
    const wave = Math.sin(u * 30) * 0.25 * (1 - clamp01(u / 0.5));
    a.handR.rotation.z = -0.3 + wave;
    a.handL.rotation.z = -0.3 + wave;
    const shrink = t > 0.74 ? Math.max(0.0001, 1 - easeInBack(clamp01((t - 0.74) / 0.26)) * 1) : 1;
    const sh = Math.max(0.0001, Math.min(1.1, shrink));
    a.halfR.scale.set(sh, sh, sh);
    a.halfL.scale.set(-sh, sh, sh);
    // crown & slip
    a.crownV.y -= 6 * dt;
    a.crown.position.addScaledVector(a.crownV, dt);
    a.crown.rotation.y += dt * 9;
    a.crown.rotation.z = Math.sin(u * 10) * 0.35;
    const cs = (u < 0.1 ? easeOutBack(u / 0.1) : 1) * (t > 0.8 ? Math.max(0.0001, 1 - (t - 0.8) / 0.2) : 1);
    a.crown.scale.setScalar(Math.max(0.0001, cs * 1.3));
    a.slipV.y -= 5 * dt;
    a.slip.position.addScaledVector(a.slipV, dt);
    a.slip.rotation.x += dt * 11;
    a.slip.rotation.y += dt * 4;
    a.slip.scale.setScalar(Math.max(0.0001, cs * 1.2));
    if (t >= 1.0) finish(item, st);
  }

  // ---- present reveal: wobble, bow pops, lid flies, box shrinks -----------------
  function presentOpenStep(item, st, dt) {
    const a = st.anim;
    const pv = st.pivot;
    const S = st.sizeMult;
    if (!a.init) {
      a.init = true;
      st.mesh.visible = false;
      const g = st.geos;
      a.base = addPart(pv, g.base, g.baseOutline, st.material);
      a.lid = addPart(pv, g.lid, g.lidOutline, st.material);
      a.bow = addPart(pv, g.bow, g.bowOutline, st.material);
      a.lid.position.y = LID_CY;
      a.bow.position.y = BOW_CY;
      a.yaw0 = pv.rotation.y;
      a.h0 = pv.position.y;
    }
    a.t += dt;
    const t = a.t;
    if (t < 0.6) {
      const sq = t < 0.14 ? Math.sin((Math.PI * t) / 0.14) : 0;
      const ramp = smoothstep(0.1, 0.55, t);
      let sy = 1 - 0.2 * sq + 0.07 * Math.sin(t * 38) * ramp;
      sy = Math.max(0.6, sy);
      const sxz = 1 / Math.sqrt(sy);
      pv.scale.set(S * sxz, S * sy, S * sxz);
      pv.rotation.z = Math.sin(t * 32) * 0.14 * ramp;
      pv.rotation.x = Math.sin(t * 26 + 1) * 0.08 * ramp;
      pv.rotation.y = a.yaw0 + Math.sin(t * 20) * 0.1 * ramp;
      pv.position.y = a.h0 * (1 - smoothstep(0, 0.1, t)) + Math.abs(Math.sin(t * 16)) * 0.08 * ramp * S;
      a.lid.position.y = LID_CY + Math.abs(Math.sin(t * 42)) * 0.05 * ramp;
      a.lid.rotation.z = Math.sin(t * 36) * 0.06 * ramp;
      a.bow.rotation.y += dt * (3 + 12 * ramp);
      a.bow.scale.setScalar(1 + 0.12 * Math.abs(Math.sin(t * 30)) * ramp);
      return;
    }
    if (!a.banged) {
      pv.rotation.set(0, a.yaw0, 0);
      pv.position.y = 0;
      pv.scale.setScalar(S);
      a.bowV = new THREE.Vector3((rand() - 0.5) * 1.6, 5.4, (rand() - 0.5) * 1.6);
      a.bowW = new THREE.Vector3((rand() - 0.5) * 8, 12, (rand() - 0.5) * 8);
      a.lidV = new THREE.Vector3((rand() - 0.5) * 1.4, 3.7, (rand() - 0.5) * 1.4);
      a.lidW = new THREE.Vector3(6 + rand() * 4, (rand() - 0.5) * 4, 4 + rand() * 4);
      updateCenter(item, st);
      fireBang(item, st);
    }
    const u = t - 0.6; // 0 .. 0.5
    a.bowV.y -= 4.5 * dt;
    a.bow.position.addScaledVector(a.bowV, dt);
    a.bow.rotation.x += a.bowW.x * dt;
    a.bow.rotation.y += a.bowW.y * dt;
    a.bow.rotation.z += a.bowW.z * dt;
    const bs = (u < 0.08 ? 1 + 0.4 * Math.sin((Math.PI * u) / 0.08) : 1) * (t > 0.85 ? 1 - (t - 0.85) / 0.25 : 1);
    a.bow.scale.setScalar(Math.max(0.0001, bs));
    a.lidV.y -= 9 * dt;
    a.lid.position.addScaledVector(a.lidV, dt);
    a.lid.rotation.x += a.lidW.x * dt;
    a.lid.rotation.y += a.lidW.y * dt;
    a.lid.rotation.z += a.lidW.z * dt;
    a.lid.scale.setScalar(Math.max(0.0001, t > 0.8 ? 1 - (t - 0.8) / 0.3 : 1));
    // box: stretch up with the pop, settle, then shrink away with a little squash
    let by = 1;
    let bxz = 1;
    if (u < 0.12) {
      by = 1 + 0.32 * Math.sin((Math.PI * u) / 0.24);
      bxz = 1 / Math.sqrt(by);
    } else if (u < 0.22) {
      const w = (u - 0.12) / 0.1;
      by = lerp(1 + 0.32, 0.88, w);
      bxz = 1 / Math.sqrt(Math.max(0.5, by));
    } else {
      const w = clamp01((u - 0.22) / 0.28);
      const s = Math.max(0.0001, 1 - easeInBack(w));
      by = 0.88 * s;
      bxz = 1.06 * s;
    }
    a.base.scale.set(Math.max(0.0001, bxz), Math.max(0.0001, by), Math.max(0.0001, bxz));
    if (t >= 1.1) finish(item, st);
  }

  // ---- idle animation -----------------------------------------------------------
  function crackerIdle(item, st, dt, s) {
    const pv = st.pivot;
    const e = st.excite;
    st.spin += dt * (0.8 + e * 3.6);
    if (st.spin > TAU) st.spin -= TAU;
    pv.position.y = CRACKER_HOVER + Math.sin(clock * 1.9 + st.phase) * 0.09 + e * Math.abs(Math.sin(clock * 9 + st.phase)) * 0.12;
    pv.rotation.set(
      Math.sin(clock * 0.9 + st.phase) * 0.1,
      st.spin,
      Math.sin(clock * 1.3 + st.phase) * 0.22 + e * Math.sin(clock * 24 + st.phase) * 0.14,
    );
    const pulse = 1 + e * 0.07 * Math.sin(clock * 14 + st.phase);
    pv.scale.setScalar(Math.max(0.0001, s * pulse));
  }

  function presentIdle(item, st, dt, s) {
    const pv = st.pivot;
    const e = st.excite;
    st.hop += dt / lerp(3.0, 0.62, e);
    const ph = frac(st.hop);
    let h = 0;
    let sy = 1;
    if (ph < 0.32) {
      const u = ph / 0.32;
      h = Math.sin(Math.PI * u) * lerp(0.1, 0.38, e);
      sy = 1 + 0.12 * Math.sin(Math.PI * u);
    } else if (ph < 0.46) {
      sy = 1 - 0.16 * Math.sin((Math.PI * (ph - 0.32)) / 0.14);
    } else if (ph > 0.88) {
      sy = 1 - 0.1 * Math.sin((Math.PI * (ph - 0.88)) / 0.12);
    }
    sy += 0.025 * Math.sin(clock * 2.4 + st.phase);
    const sxz = 1 / Math.sqrt(sy);
    const S = st.sizeMult * s;
    pv.position.y = h * st.sizeMult;
    pv.scale.set(Math.max(0.0001, S * sxz), Math.max(0.0001, S * sy), Math.max(0.0001, S * sxz));
    const hopTilt = ph < 0.32 ? Math.sin((Math.PI * ph) / 0.32) * 0.08 * st.tiltDir : 0;
    pv.rotation.set(
      e * Math.sin(clock * 13 + st.phase + 1) * 0.06,
      st.yaw + Math.sin(clock * 0.6 + st.phase) * 0.25 + e * Math.sin(clock * 7) * 0.2,
      e * Math.sin(clock * 16 + st.phase) * 0.13 + hopTilt,
    );
  }

  function updateCenter(item, st) {
    const pv = st.pivot;
    const g = item.group.position;
    if (item.type === 'cracker') item.center.set(g.x, g.y + pv.position.y, g.z);
    else item.center.set(g.x, g.y + pv.position.y + 0.42 * Math.max(0.3, pv.scale.y), g.z);
  }

  // ---- glows, halos, twinkles ------------------------------------------------------
  function pushVisuals(item, st, s) {
    const cx = item.center.x;
    const cy = item.center.y;
    const cz = item.center.z;
    const e = st.excite;
    const id = item.id;
    let fade = 1;
    let flash = -1;
    if (st.anim) {
      const t = st.anim.t;
      const bangT = item.type === 'cracker' ? 0.5 : 0.6;
      const endT = item.type === 'cracker' ? 1.0 : 1.1;
      fade = t < bangT ? 1 + 0.4 * (t / bangT) : Math.max(0, 1 - (t - bangT) / (endT - bangT));
      if (t >= bangT) flash = (t - bangT) / (endT - bangT);
    }
    const pulse = 0.85 + 0.15 * Math.sin(clock * 2.2 + st.phase);
    const hc = st.haloColor;

    if (item.type === 'cracker') {
      const rarity = item.rarity;
      let hr = hc.r;
      let hg = hc.g;
      let hb = hc.b;
      let pr = st.glowColor.r;
      let pg = st.glowColor.g;
      let pb = st.glowColor.b;
      if (rarity === 'legendary') {
        _c.setHSL(frac(clock * 0.25 + st.phase), 0.9, 0.58);
        hr = pr = _c.r;
        hg = pg = _c.g;
        hb = pb = _c.b;
      }
      const baseA = rarity === 'legendary' ? 0.5 : rarity === 'rare' ? 0.42 : 0.32;
      const hs = (rarity === 'legendary' ? 1.75 : rarity === 'rare' ? 1.6 : 1.45) * s * (1 + 0.25 * e);
      batch.push(cx, cy, cz, hs, hr, hg, hb, (baseA * pulse + 0.18 * e) * fade, 0, SHAPE.GLOW, 0);
      const gs = (rarity === 'legendary' ? 2.3 : rarity === 'rare' ? 2.0 : 1.7) * s * (1 + 0.2 * e);
      const gi = (rarity === 'legendary' ? 1.0 : rarity === 'rare' ? 0.95 : 0.8) * (pulse + 0.35 * e) * fade;
      pushGroundGlow(st, gs, pr * gi, pg * gi, pb * gi);
      if (rarity === 'rare' && fade > 0) {
        for (let k = 0; k < 3; k++) {
          const tt = clock / 1.25 + k * 0.33 + st.phase;
          const cyc = Math.floor(tt);
          const f = tt - cyc;
          const hsh = id * 131 + k * 17 + cyc * 7;
          const ox = (hash01(hsh) - 0.5) * 1.1;
          const oy = (hash01(hsh + 1) - 0.5) * 0.6;
          const oz = (hash01(hsh + 2) - 0.5) * 1.1;
          batch.push(cx + ox, cy + oy, cz + oz, 0.34 * Math.sin(Math.PI * f) * s, 1, 0.9, 0.6, fade, f * 1.2, SHAPE.SPARKLE, 0.35);
        }
      } else if (rarity === 'legendary' && fade > 0) {
        for (let k = 0; k < 5; k++) {
          const ang = clock * 1.6 + (k * TAU) / 5 + st.phase;
          const rad = 0.62 * s;
          _c.setHSL(frac(clock * 0.3 + k / 5), 0.95, 0.6);
          batch.push(
            cx + Math.cos(ang) * rad,
            cy + Math.sin(clock * 2 + k) * 0.16,
            cz + Math.sin(ang) * rad,
            (0.2 + 0.05 * Math.sin(clock * 5 + k)) * s,
            _c.r, _c.g, _c.b, fade, ang + clock, SHAPE.STAR, 0.65,
          );
        }
        for (let k = 0; k < 2; k++) {
          const tt = clock / 0.9 + k * 0.5 + st.phase;
          const cyc = Math.floor(tt);
          const f = tt - cyc;
          const hsh = id * 977 + k * 31 + cyc * 13;
          batch.push(
            cx + (hash01(hsh) - 0.5) * 1.0,
            cy + (hash01(hsh + 1) - 0.5) * 0.6,
            cz + (hash01(hsh + 2) - 0.5) * 1.0,
            0.3 * Math.sin(Math.PI * f) * s, 1, 1, 1, fade, 0, SHAPE.SPARKLE, 0.3,
          );
        }
      }
      if (st.anim && st.anim.t < 0.5 && st.anim.t > 0.15) {
        // strain sparks at the middle
        const str = smoothstep(0.15, 0.5, st.anim.t);
        const f = frac(clock * 6);
        batch.push(cx, cy + 0.05, cz, 0.35 * str * Math.sin(Math.PI * f), 1, 0.95, 0.7, 1, clock * 3, SHAPE.SPARKLE, 0.4);
      }
      if (flash >= 0 && flash < 0.6) {
        const u = flash / 0.6;
        batch.push(cx, cy, cz, 1.7 * (0.5 + 0.7 * u), 1, 0.97, 0.85, 0.65 * (1 - u), 0, SHAPE.GLOW, 0);
        batch.push(cx, cy, cz, 1.9 * (0.3 + u), 1, 0.9, 0.6, 0.45 * (1 - u), 0, SHAPE.RING, 0.3);
      }
    } else {
      const S = st.sizeMult * s;
      const golden = item.golden;
      const hs = (golden ? 3.0 : 1.8) * S * (1 + 0.25 * e);
      const ha = ((golden ? 0.55 : 0.3) * pulse + 0.16 * e) * fade;
      batch.push(cx, cy, cz, hs, hc.r, hc.g, hc.b, ha, 0, SHAPE.GLOW, 0);
      const gi = (golden ? 1.3 : 0.95) * (pulse + 0.35 * e) * fade;
      pushGroundGlow(st, (golden ? 3.3 : 2.3) * S * (1 + 0.2 * e), st.glowColor.r * gi, st.glowColor.g * gi, st.glowColor.b * gi);
      if (!golden && fade > 0) {
        // soft twinkles drifting up round the base, like the crackers' glow
        const gy = item.group.position.y;
        for (let k = 0; k < 2; k++) {
          const tt = clock / 1.4 + k * 0.5 + st.phase;
          const cyc = Math.floor(tt);
          const f = tt - cyc;
          const hsh = id * 457 + k * 29 + cyc * 5;
          const ang = hash01(hsh) * TAU;
          const rad = (0.5 + 0.22 * hash01(hsh + 1)) * S;
          batch.push(
            cx + Math.cos(ang) * rad,
            gy + (0.08 + 0.4 * f) * S,
            cz + Math.sin(ang) * rad,
            0.3 * Math.sin(Math.PI * f) * S, 1, 0.9, 0.6, fade, f * 1.5, SHAPE.SPARKLE, 0.35,
          );
        }
      }
      if (golden && fade > 0) {
        for (let k = 0; k < 6; k++) {
          const tt = clock / 1.1 + k / 6 + st.phase;
          const cyc = Math.floor(tt);
          const f = tt - cyc;
          const hsh = id * 613 + k * 23 + cyc * 11;
          batch.push(
            cx + (hash01(hsh) - 0.5) * 1.5 * S,
            cy + (hash01(hsh + 1) - 0.3) * 1.1 * S,
            cz + (hash01(hsh + 2) - 0.5) * 1.5 * S,
            0.42 * Math.sin(Math.PI * f) * S, 1, 0.92, 0.55, fade, f, SHAPE.SPARKLE, 0.4,
          );
        }
      }
      if (st.rays) {
        const rs = Math.max(0.0001, 3.8 * S * (0.92 + 0.08 * Math.sin(clock * 1.7)) * fade * s);
        st.rays.scale.set(rs, rs, 1);
        st.rays.position.set(0, cy - item.group.position.y, 0);
        st.rays.material.rotation = clock * 0.35;
        st.rays.material.opacity = 0.45 + 0.1 * Math.sin(clock * 2.3);
      }
      if (flash >= 0) {
        const u = flash;
        const topY = item.group.position.y + (LID_TOP + 0.05) * S;
        batch.push(cx, topY, cz, 1.8 * S * (0.5 + u), 1, 0.95, 0.8, 0.7 * (1 - u), 0, SHAPE.GLOW, 0);
        if (u < 0.5) batch.push(cx, topY, cz, 2.0 * S * (0.3 + 2 * u), 1, 0.92, 0.65, 0.45 * (1 - 2 * u), 0, SHAPE.RING, 0.3);
        for (let k = 0; k < 8; k++) {
          const f = frac(u * 1.5 + k / 8);
          const hsh = id * 389 + k * 41;
          const shape = k % 2 === 0 ? SHAPE.SPARKLE : SHAPE.GLOW;
          _c.copy(hc).lerp(_white, 0.3);
          batch.push(
            cx + (hash01(hsh) - 0.5) * 0.6 * S,
            topY + f * 2.0 * S,
            cz + (hash01(hsh + 1) - 0.5) * 0.6 * S,
            (shape === SHAPE.SPARKLE ? 0.4 : 0.32) * (1 - f) * S,
            _c.r, _c.g, _c.b, 1 - u, f * 3, shape, shape === SHAPE.SPARKLE ? 0.35 : 0,
          );
        }
      }
    }
  }

  // ---- rainbow animation for legendary crackers (shared geometry) -----------------
  function animateRainbow() {
    const key = 'legendary:0';
    const entry = crackerCache.get(key);
    if (!entry) return;
    const geo = entry.full;
    const info = geo.userData.rainbow;
    if (!info) return;
    const col = geo.attributes.color;
    const arr = col.array;
    const shift = clock * 0.35;
    for (let v = 0; v < info.mask.length; v++) {
      const m = info.mask[v];
      if (!m) continue;
      _c2.setHSL(frac(info.hue[v] - shift), 1, m === 2 ? 0.7 : 0.55);
      arr[v * 3] = _c2.r;
      arr[v * 3 + 1] = _c2.g;
      arr[v * 3 + 2] = _c2.b;
    }
    col.needsUpdate = true;
  }

  // ---- per-frame update ------------------------------------------------------------
  function removeAt(index) {
    const it = items[index];
    if (!it) return;
    const st = state.get(it);
    it.group.removeFromParent();
    if (st && st.rays) {
      st.rays.material.dispose();
      st.rays = null;
    }
    it.alive = false;
    it.opening = false;
    items.splice(index, 1);
  }

  function update(dt, time, playerPos) {
    dt = Number(dt);
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.1);
    clock += dt;
    hasPlayer = validXZ(playerPos);
    if (hasPlayer) lastPlayer.set(playerPos.x, finite(playerPos.y, 0), playerPos.z);

    if (legendaryAlive > 0) animateRainbow();

    batch.begin();
    glowN = 0;
    let legend = 0;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const st = state.get(it);
      if (!st) continue;
      if (st.done) {
        removeAt(i);
        continue;
      }
      if (it.type === 'cracker' && it.rarity === 'legendary') legend++;
      // excitement when Pip is close
      let target = 0;
      if (hasPlayer && !it.opening) {
        const d = Math.hypot(it.position.x - lastPlayer.x, it.position.z - lastPlayer.z);
        target = d < EXCITE_RANGE ? clamp01((EXCITE_RANGE - d) / 2.2) : 0;
      }
      st.excite += (target - st.excite) * Math.min(1, dt * 5);
      // pop-in
      let s = 1;
      if (st.delay > 0) {
        st.delay -= dt;
        s = 0.0001;
      } else if (st.spawnT < 0.45) {
        st.spawnT += dt;
        s = Math.max(0.0001, easeOutBack(clamp01(st.spawnT / 0.45)));
      }
      if (st.anim) {
        // onBang may spawn/clear/populate re-entrantly, so re-find our index
        if (it.type === 'cracker') crackerOpenStep(it, st, dt);
        else presentOpenStep(it, st, dt);
        if (st.done) {
          const idx = items.indexOf(it);
          if (idx >= 0) removeAt(idx);
          continue;
        }
      } else if (it.type === 'cracker') crackerIdle(it, st, dt, s);
      else presentIdle(it, st, dt, s);
      updateCenter(it, st);
      // batched halos/pools don't inherit group.visible, so honour it here
      if (s > 0.001 && it.group.visible) pushVisuals(it, st, s);
      else if (st.rays) st.rays.scale.set(0.0001, 0.0001, 1);
    }
    legendaryAlive = legend;
    batch.end();
    glowMesh.count = glowN;
    glowMesh.visible = glowN > 0;
    if (glowN > 0) {
      glowMesh.instanceMatrix.needsUpdate = true;
      glowMesh.instanceColor.needsUpdate = true;
    }
  }

  // ---- clear / dispose ---------------------------------------------------------------
  function clear() {
    for (const it of items) {
      const st = state.get(it);
      it.group.removeFromParent();
      it.alive = false;
      it.opening = false;
      if (st) {
        st.done = true;
        if (st.rays) {
          st.rays.material.dispose();
          st.rays = null;
        }
        if (st.anim && st.anim.resolve) {
          const r = st.anim.resolve;
          st.anim.resolve = null;
          r(false);
        }
      }
    }
    items.length = 0;
    legendaryAlive = 0;
    batch.begin();
    batch.end();
    glowN = 0;
    glowMesh.count = 0;
    glowMesh.visible = false;
  }

  // Extra: reuse this system for a new night's map (then call populate()).
  function setWorld(newWorld, newRng) {
    clear();
    W = newWorld || {};
    theme = themeOf(W);
    if (newRng && typeof newRng.fork === 'function') {
      try {
        vrng = newRng.fork('collectables');
      } catch {
        /* keep the old stream */
      }
    } else if (newRng && typeof newRng.next === 'function') vrng = newRng;
  }

  let disposed = false;
  function dispose() {
    clear();
    if (disposed) return;
    disposed = true;
    root.removeFromParent();
    batch.dispose();
    glowGeo.dispose();
    glowMat.dispose();
    glowMesh.dispose();
    if (sceneKey && liveByScene.get(sceneKey) === api) liveByScene.delete(sceneKey);
  }

  const api = {
    items,
    spawnCracker,
    spawnPresent,
    populate,
    update,
    nearest,
    alive,
    open,
    clear,
    setWorld,
    dispose,
    group: root,
  };
  if (sceneKey) liveByScene.set(sceneKey, api);
  return api;
}
