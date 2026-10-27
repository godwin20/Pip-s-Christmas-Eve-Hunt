// Pooled visual effects: confetti, twinkly sparkles, coin bursts that zip
// into Pip, rising cartoon float-text, the rainbow sparkle trail and an
// always-on gentle snowfall around the camera.
//
// Everything is procedural (DataTextures + one lazily created canvas per
// float-text sprite) and pooled: after creation nothing is allocated per frame.
//
// This file also exports a few small shared helpers (a batched point-sprite
// renderer, geometry merge/outline/rounded-box helpers, easing) that
// collectables.js reuses.

import * as THREE from 'three';
import { toon, PALETTE } from './materials.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Small maths helpers (exported for collectables.js)
// ---------------------------------------------------------------------------

export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

export function easeInBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return c3 * t * t * t - c1 * t * t;
}

export function easeOutCubic(t) {
  const u = 1 - t;
  return 1 - u * u * u;
}

// Deterministic 0..1 hash of an integer (for flicker-free procedural twinkles).
export function hash01(n) {
  let h = n | 0;
  h = (h ^ 61) ^ (h >>> 16);
  h = (h + (h << 3)) | 0;
  h ^= h >>> 4;
  h = Math.imul(h, 0x27d4eb2d);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _white = new THREE.Color(0xffffff);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector2();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m4 = new THREE.Matrix4();

function setColorSafe(target, color, fallback = 0xffffff) {
  try {
    if (color === undefined || color === null) target.set(fallback);
    else target.set(color);
  } catch {
    target.set(fallback);
  }
  return target;
}

function validPos(pos) {
  return !!pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z);
}

// ---------------------------------------------------------------------------
// Geometry helpers (exported for collectables.js)
// ---------------------------------------------------------------------------

// Merge parts [{ geo, color?, colors?: Float32Array(rgb per vertex), matrix? }]
// into one indexed BufferGeometry with position/normal/color attributes.
// Part geometries are consumed (disposed) unless part.keep is true.
export function mergeParts(parts) {
  let vTotal = 0;
  let iTotal = 0;
  for (const part of parts) {
    const g = part.geo;
    vTotal += g.attributes.position.count;
    iTotal += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vTotal * 3);
  const nor = new Float32Array(vTotal * 3);
  const col = new Float32Array(vTotal * 3);
  const idx = vTotal > 65535 ? new Uint32Array(iTotal) : new Uint16Array(iTotal);
  let vo = 0;
  let io = 0;
  for (const part of parts) {
    const g = part.geo;
    if (part.matrix) g.applyMatrix4(part.matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    const gp = g.attributes.position;
    const gn = g.attributes.normal;
    // no colour given: keep the geometry's own vertex colours (re-merging parts)
    const gc = !part.colors && part.color === undefined && g.attributes.color ? g.attributes.color : null;
    const n = gp.count;
    setColorSafe(_c, part.color);
    for (let i = 0; i < n; i++) {
      const o = (vo + i) * 3;
      pos[o] = gp.getX(i);
      pos[o + 1] = gp.getY(i);
      pos[o + 2] = gp.getZ(i);
      nor[o] = gn.getX(i);
      nor[o + 1] = gn.getY(i);
      nor[o + 2] = gn.getZ(i);
      if (part.colors) {
        col[o] = part.colors[i * 3];
        col[o + 1] = part.colors[i * 3 + 1];
        col[o + 2] = part.colors[i * 3 + 2];
      } else if (gc) {
        col[o] = gc.getX(i);
        col[o + 1] = gc.getY(i);
        col[o + 2] = gc.getZ(i);
      } else {
        col[o] = _c.r;
        col[o + 1] = _c.g;
        col[o + 2] = _c.b;
      }
    }
    if (g.index) {
      const gi = g.index;
      for (let i = 0; i < gi.count; i++) idx[io++] = gi.getX(i) + vo;
    } else {
      for (let i = 0; i < n; i++) idx[io++] = vo + i;
    }
    vo += n;
    if (!part.keep) g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

// Inverted-hull outline shell made by pushing every vertex out along its
// normal: an even-thickness cartoon outline even on long/flat shapes.
// Use with materials.addOutline(mesh, 0) and swap the hull's geometry.
export function makeOutlineGeometry(geo, thickness = 0.025) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const out = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    out[i * 3] = p.getX(i) + n.getX(i) * thickness;
    out[i * 3 + 1] = p.getY(i) + n.getY(i) * thickness;
    out[i * 3 + 2] = p.getZ(i) + n.getZ(i) * thickness;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  if (geo.index) g.setIndex(new THREE.BufferAttribute(geo.index.array.slice(), 1));
  g.computeBoundingSphere();
  return g;
}

// Chunky rounded box centred on the origin with smooth normals.
export function roundedBoxGeometry(w, h, d, r = 0.05, seg = 3) {
  const n = seg * 2 + 1;
  const geo = new THREE.BoxGeometry(1, 1, 1, n, n, n);
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const hw = w / 2;
  const hh = h / 2;
  const hd = d / 2;
  r = Math.max(0.0001, Math.min(r, hw, hh, hd));
  const remap = (c, half) => {
    const i = Math.round((c + 0.5) * n);
    if (i <= seg) return -half + r * (i / seg);
    return half - r * ((n - i) / seg);
  };
  for (let i = 0; i < pos.count; i++) {
    const x = remap(pos.getX(i), hw);
    const y = remap(pos.getY(i), hh);
    const z = remap(pos.getZ(i), hd);
    const ix = Math.max(-(hw - r), Math.min(hw - r, x));
    const iy = Math.max(-(hh - r), Math.min(hh - r, y));
    const iz = Math.max(-(hd - r), Math.min(hd - r, z));
    let dx = x - ix;
    let dy = y - iy;
    let dz = z - iz;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;
    pos.setXYZ(i, ix + dx * r, iy + dy * r, iz + dz * r);
    nor.setXYZ(i, dx, dy, dz);
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  return geo;
}

// A flat five-point star THREE.Shape (pointing up +Y).
export function starShape(outer = 0.1, inner = 0.045, points = 5) {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / points;
    const r = i % 2 === 0 ? outer : inner;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------

function makeDataTexture(w, h, fill) {
  const data = new Uint8Array(w * h * 4);
  fill(data, w, h);
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export const SHAPE = Object.freeze({
  GLOW: 0,
  SPARKLE: 1,
  STAR: 2,
  DOT: 3,
  RING: 4,
  HEART: 5,
  PUFF: 6,
  FLAKE: 7,
});

const ATLAS_COLS = 4;
const ATLAS_ROWS = 2;
const CELL = 128;

function sdStar5(px, py, r, rf) {
  const k1x = 0.809016994375;
  const k1y = -0.587785252292;
  const k2x = -k1x;
  const k2y = k1y;
  px = Math.abs(px);
  let d = 2 * Math.max(k1x * px + k1y * py, 0);
  px -= d * k1x;
  py -= d * k1y;
  d = 2 * Math.max(k2x * px + k2y * py, 0);
  px -= d * k2x;
  py -= d * k2y;
  px = Math.abs(px);
  py -= r;
  const bax = rf * -k1y;
  const bay = rf * k1x - 1;
  const h = Math.max(0, Math.min(r, (px * bax + py * bay) / (bax * bax + bay * bay)));
  return Math.hypot(px - bax * h, py - bay * h) * Math.sign(py * bax - px * bay);
}

function sdHeart(px, py) {
  px = Math.abs(px);
  if (py + px > 1) return Math.hypot(px - 0.25, py - 0.75) - Math.SQRT2 / 4;
  const a = px * px + (py - 1) * (py - 1);
  const m = 0.5 * Math.max(px + py, 0);
  const b = (px - m) * (px - m) + (py - m) * (py - m);
  return Math.sqrt(Math.min(a, b)) * Math.sign(px - py);
}

function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = clamp01((pax * bax + pay * bay) / (bax * bax + bay * bay));
  return Math.hypot(pax - bax * h, pay - bay * h);
}

// out[0] = alpha, out[1] = "white-hot core" amount. x,y in [-0.5, 0.5], y up.
function shapeSample(s, x, y, out) {
  const r = Math.hypot(x, y);
  let a = 0;
  let core = 0;
  switch (s) {
    case SHAPE.GLOW: {
      const u = r / 0.48;
      a = u < 1 ? Math.pow(1 - u, 2.2) : 0;
      core = u < 0.35 ? Math.pow(1 - u / 0.35, 2) : 0;
      break;
    }
    case SHAPE.SPARKLE: {
      const st = 1 - (Math.sqrt(Math.abs(x) / 0.47) + Math.sqrt(Math.abs(y) / 0.47));
      const star = st > 0 ? smoothstep(0, 0.22, st) : 0;
      const g = r < 0.3 ? 0.4 * Math.pow(1 - r / 0.3, 2) : 0;
      a = Math.max(star, g);
      core = r < 0.15 ? Math.pow(1 - r / 0.15, 1.5) : 0;
      break;
    }
    case SHAPE.STAR: {
      const d = sdStar5(x, y + 0.03, 0.43, 0.48) - 0.03;
      a = smoothstep(0.016, -0.016, d);
      core = smoothstep(0.0, -0.2, d) * 0.45;
      break;
    }
    case SHAPE.DOT: {
      a = smoothstep(0.02, -0.02, r - 0.4);
      break;
    }
    case SHAPE.RING: {
      const d = Math.abs(r - 0.36) - 0.055;
      a = smoothstep(0.03, -0.02, d);
      break;
    }
    case SHAPE.HEART: {
      const d = sdHeart(x / 0.75, (y + 0.42) / 0.75) * 0.75;
      a = smoothstep(0.016, -0.016, d);
      core = smoothstep(0.0, -0.2, d) * 0.35;
      break;
    }
    case SHAPE.PUFF: {
      const d = Math.min(
        Math.hypot(x + 0.14, y + 0.06) - 0.2,
        Math.hypot(x - 0.15, y + 0.07) - 0.19,
        Math.hypot(x + 0.02, y - 0.08) - 0.25,
      );
      a = smoothstep(0.05, -0.08, d) * 0.95;
      core = smoothstep(0.0, -0.2, d) * 0.5;
      break;
    }
    case SHAPE.FLAKE: {
      const sector = Math.PI / 3;
      const ang = Math.atan2(y, x);
      const aa = ang - sector * Math.round(ang / sector);
      const qx = r * Math.cos(aa);
      const qy = Math.abs(r * Math.sin(aa));
      let d = Math.min(
        sdSegment(qx, qy, 0, 0, 0.4, 0),
        sdSegment(qx, qy, 0.22, 0, 0.31, 0.08),
        sdSegment(qx, qy, 0.12, 0, 0.18, 0.05),
      );
      d = Math.min(d - 0.028, r - 0.07);
      a = smoothstep(0.014, -0.014, d);
      core = r < 0.12 ? 0.5 : 0;
      break;
    }
    default:
      a = 0;
  }
  out[0] = a;
  out[1] = core;
}

let atlasTexture = null;
export function getParticleAtlas() {
  if (atlasTexture) return atlasTexture;
  const sample = [0, 0];
  atlasTexture = makeDataTexture(ATLAS_COLS * CELL, ATLAS_ROWS * CELL, (data, W) => {
    for (let s = 0; s < ATLAS_COLS * ATLAS_ROWS; s++) {
      const ox = (s % ATLAS_COLS) * CELL;
      const oy = Math.floor(s / ATLAS_COLS) * CELL;
      for (let j = 0; j < CELL; j++) {
        // Row 0 of each cell is the TOP of the shape (gl_PointCoord.y is 0 at the top).
        const y = 0.5 - (j + 0.5) / CELL;
        for (let i = 0; i < CELL; i++) {
          const x = (i + 0.5) / CELL - 0.5;
          shapeSample(s, x, y, sample);
          const o = ((oy + j) * W + ox + i) * 4;
          data[o] = Math.round(255 * clamp01(sample[1]));
          data[o + 1] = 255;
          data[o + 2] = 255;
          data[o + 3] = Math.round(255 * clamp01(sample[0]));
        }
      }
    }
  });
  atlasTexture.name = 'particleAtlas';
  return atlasTexture;
}

let softGlowTexture = null;
// Soft round white glow (for ground light pools / glow sprites).
export function getSoftGlowTexture() {
  if (softGlowTexture) return softGlowTexture;
  softGlowTexture = makeDataTexture(64, 64, (data, W, H) => {
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const x = (i + 0.5) / W - 0.5;
        const y = (j + 0.5) / H - 0.5;
        const u = Math.hypot(x, y) / 0.5;
        const a = u < 1 ? Math.pow(1 - u, 1.8) * (0.85 + 0.15 * (1 - u)) : 0;
        const o = (j * W + i) * 4;
        data[o] = 255;
        data[o + 1] = 255;
        data[o + 2] = 255;
        data[o + 3] = Math.round(255 * clamp01(a));
      }
    }
  });
  softGlowTexture.name = 'softGlow';
  return softGlowTexture;
}

let raysTexture = null;
// Radiant "treasure" light rays (for the golden present).
export function getRaysTexture() {
  if (raysTexture) return raysTexture;
  raysTexture = makeDataTexture(128, 128, (data, W, H) => {
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const x = (i + 0.5) / W - 0.5;
        const y = (j + 0.5) / H - 0.5;
        const r = Math.hypot(x, y) / 0.5;
        const ang = Math.atan2(y, x);
        const rays = Math.pow(0.5 + 0.5 * Math.cos(ang * 12), 3) * 0.8 + Math.pow(0.5 + 0.5 * Math.cos(ang * 7 + 1), 6) * 0.4;
        const fall = r < 1 ? Math.pow(1 - r, 1.4) : 0;
        const core = r < 0.3 ? Math.pow(1 - r / 0.3, 2) * 0.6 : 0;
        const a = clamp01(rays * fall + core);
        const o = (j * W + i) * 4;
        data[o] = 255;
        data[o + 1] = 255;
        data[o + 2] = 255;
        data[o + 3] = Math.round(255 * a);
      }
    }
  });
  raysTexture.name = 'rays';
  return raysTexture;
}

// ---------------------------------------------------------------------------
// Batched point sprites (one draw call for many glows / sparkles / stars)
// ---------------------------------------------------------------------------

const POINT_VS = /* glsl */ `
uniform float uHalfHeight;
attribute vec4 aColor;
attribute float aSize;
attribute float aAngle;
attribute vec2 aShape;
varying vec4 vColor;
varying vec2 vRot;
varying vec2 vShape;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float depth = max(-mvPosition.z, 0.05);
  gl_PointSize = aSize * projectionMatrix[1][1] * uHalfHeight / depth;
  vColor = aColor;
  vRot = vec2(cos(aAngle), sin(aAngle));
  vShape = aShape;
  #include <fog_vertex>
}
`;

const POINT_FS = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uCore;
uniform vec2 uGrid;
varying vec4 vColor;
varying vec2 vRot;
varying vec2 vShape;
#include <fog_pars_fragment>
void main() {
  vec2 p = gl_PointCoord - 0.5;
  p = vec2(vRot.x * p.x - vRot.y * p.y, vRot.y * p.x + vRot.x * p.y) + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) discard;
  float idx = floor(vShape.x + 0.5);
  float col = mod(idx, uGrid.x);
  float row = floor(idx / uGrid.x);
  vec4 tex = texture2D(uAtlas, vec2((col + p.x) / uGrid.x, (row + p.y) / uGrid.y));
  float a = tex.a * vColor.a;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogF = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    a *= 1.0 - fogF;
  #endif
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(vColor.rgb, vec3(1.0), tex.r * uCore), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // Premultiplied output: vShape.y = 0 is pure additive glow, 1 is normal
  // alpha blending (stays colourful on bright snow), in between is a mix.
  gl_FragColor = vec4(gl_FragColor.rgb * a, a * vShape.y);
}
`;

// createPointBatch(capacity) → { points, begin(), push(...), end(), count, dispose() }
// push(x, y, z, size(m), r, g, b (linear 0..1), alpha, angle, shape, blend 0=add..1=normal)
export function createPointBatch(capacity = 1024, opts = {}) {
  const { core = 0.75, fog = true, renderOrder = 20 } = opts;
  const cap = Math.max(1, capacity | 0);
  const pos = new Float32Array(cap * 3);
  const col = new Float32Array(cap * 4);
  const siz = new Float32Array(cap);
  const ang = new Float32Array(cap);
  const shp = new Float32Array(cap * 2);
  const geometry = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
  const aSiz = new THREE.BufferAttribute(siz, 1).setUsage(THREE.DynamicDrawUsage);
  const aAng = new THREE.BufferAttribute(ang, 1).setUsage(THREE.DynamicDrawUsage);
  const aShp = new THREE.BufferAttribute(shp, 2).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', aPos);
  geometry.setAttribute('aColor', aCol);
  geometry.setAttribute('aSize', aSiz);
  geometry.setAttribute('aAngle', aAng);
  geometry.setAttribute('aShape', aShp);
  geometry.setDrawRange(0, 0);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uAtlas: { value: null },
      uCore: { value: core },
      uGrid: { value: new THREE.Vector2(ATLAS_COLS, ATLAS_ROWS) },
      uHalfHeight: { value: 400 },
    },
  ]);
  uniforms.uAtlas.value = getParticleAtlas();
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: POINT_VS,
    fragmentShader: POINT_FS,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog,
  });
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.OneFactor;
  material.blendDst = THREE.OneMinusSrcAlphaFactor;

  const points = new THREE.Points(geometry, material);
  points.name = 'pointBatch';
  points.frustumCulled = false;
  points.renderOrder = renderOrder;
  points.visible = false;
  points.raycast = () => {};
  points.onBeforeRender = (renderer) => {
    renderer.getDrawingBufferSize(_v2);
    uniforms.uHalfHeight.value = _v2.y * 0.5;
  };

  let n = 0;
  const attrs = [aPos, aCol, aSiz, aAng, aShp];

  return {
    points,
    capacity: cap,
    get count() {
      return n;
    },
    begin() {
      n = 0;
    },
    push(x, y, z, size, r, g, b, a, angle = 0, shape = 0, blend = 0) {
      if (n >= cap) return false;
      const i = n++;
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      col[i * 4] = r;
      col[i * 4 + 1] = g;
      col[i * 4 + 2] = b;
      col[i * 4 + 3] = a;
      siz[i] = size;
      ang[i] = angle;
      shp[i * 2] = shape;
      shp[i * 2 + 1] = blend;
      return true;
    },
    end() {
      geometry.setDrawRange(0, n);
      points.visible = n > 0;
      if (n > 0) {
        for (const at of attrs) {
          at.clearUpdateRanges();
          at.addUpdateRange(0, n * at.itemSize);
          at.needsUpdate = true;
        }
      }
    },
    dispose() {
      points.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Soft light pools on the ground (for InstancedMesh of flat quads)
// instanceColor = colour * intensity (intensity = brightest channel, may be > 1).
// Half additive / half tinted so a pool reads as warm light on bright snow
// and as a glow in dark corners.
// ---------------------------------------------------------------------------

const POOL_VS = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vCol = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
    vCol = instanceColor;
  #endif
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
  #endif
  vec4 mvPosition = modelViewMatrix * p;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const POOL_FS = /* glsl */ `
uniform float uOpacity;
uniform float uBlend;
varying vec2 vUv;
varying vec3 vCol;
#include <fog_pars_fragment>
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float fall = pow(clamp(1.0 - r, 0.0, 1.0), 1.7);
  float k = max(vCol.r, max(vCol.g, vCol.b));
  if (k < 0.002 || fall <= 0.0) discard;
  float a = fall * min(k, 1.6) * uOpacity;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogF = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    a *= 1.0 - fogF;
  #endif
  gl_FragColor = vec4(vCol / k, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, clamp(a, 0.0, 1.0) * uBlend);
}
`;

export function createGlowPoolMaterial({ opacity = 0.75, blend = 0.55 } = {}) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    { uOpacity: { value: opacity }, uBlend: { value: blend } },
  ]);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: POOL_VS,
    fragmentShader: POOL_FS,
    transparent: true,
    depthWrite: false,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.OneFactor;
  material.blendDst = THREE.OneMinusSrcAlphaFactor;
  return material;
}

// ---------------------------------------------------------------------------
// Sparkle simulation (struct-of-arrays pool, swap-remove, zero allocations)
// ---------------------------------------------------------------------------

const F_TWINKLE = 1;
const F_GROW = 2; // expanding flash / ring: grows and fades
const F_FADE = 4; // fade out instead of shrinking

function createSparkleSim(cap) {
  const names = [
    'px', 'py', 'pz', 'vx', 'vy', 'vz', 'age', 'life', 'size', 'cr', 'cg', 'cb', 'ca',
    'ang', 'spin', 'shape', 'blend', 'grav', 'drag', 'flags', 'phase',
  ];
  const A = {};
  const list = [];
  for (const nm of names) {
    A[nm] = new Float32Array(cap);
    list.push(A[nm]);
  }
  const { px, py, pz, vx, vy, vz, age, life, size, cr, cg, cb, ca, ang, spin, shape, blend, grav, drag, flags, phase } = A;
  let n = 0;

  function kill(i) {
    const last = --n;
    if (i !== last) for (let k = 0; k < list.length; k++) list[k][i] = list[k][last];
  }

  return {
    get count() {
      return n;
    },
    spawn(x, y, z, vx0, vy0, vz0, size0, r, g, b, a, life0, shape0, blend0 = 0, grav0 = 0, drag0 = 1.5, flags0 = 0, spin0) {
      if (n >= cap) return -1;
      const i = n++;
      px[i] = x;
      py[i] = y;
      pz[i] = z;
      vx[i] = vx0;
      vy[i] = vy0;
      vz[i] = vz0;
      age[i] = 0;
      life[i] = Math.max(0.05, life0);
      size[i] = size0;
      cr[i] = r;
      cg[i] = g;
      cb[i] = b;
      ca[i] = a;
      ang[i] = Math.random() * TAU;
      spin[i] = spin0 === undefined ? (Math.random() - 0.5) * 4 : spin0;
      shape[i] = shape0;
      blend[i] = blend0;
      grav[i] = grav0;
      drag[i] = drag0;
      flags[i] = flags0;
      phase[i] = Math.random() * TAU;
      return i;
    },
    update(dt) {
      let i = 0;
      while (i < n) {
        age[i] += dt;
        if (age[i] >= life[i]) {
          kill(i);
          continue;
        }
        const k = Math.max(0, 1 - drag[i] * dt);
        vx[i] *= k;
        vy[i] = vy[i] * k + grav[i] * dt;
        vz[i] *= k;
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
        pz[i] += vz[i] * dt;
        ang[i] += spin[i] * dt;
        i++;
      }
    },
    write(batch) {
      for (let i = 0; i < n; i++) {
        const t = age[i] / life[i];
        const f = flags[i];
        let s = size[i];
        let a = ca[i];
        if (f & F_GROW) {
          s *= 0.35 + 0.9 * easeOutCubic(t);
          a *= 1 - t;
        } else {
          if (t < 0.14) s *= easeOutBack(t / 0.14);
          if (t > 0.55) {
            const u = (t - 0.55) / 0.45;
            if (f & F_FADE) a *= 1 - u;
            else {
              s *= 1 - u * u;
              a *= 1 - u * 0.5;
            }
          }
        }
        if (f & F_TWINKLE) s *= 0.62 + 0.38 * Math.sin(phase[i] + age[i] * 17);
        if (s <= 0.002 || a <= 0.003) continue;
        if (!batch.push(px[i], py[i], pz[i], s, cr[i], cg[i], cb[i], a, ang[i], shape[i], blend[i])) break;
      }
    },
    clear() {
      n = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Snowfall (GPU-animated points wrapped around the camera)
// ---------------------------------------------------------------------------

const SNOW_VS = /* glsl */ `
uniform float uTime;
uniform float uHalfHeight;
uniform float uDensity;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform vec3 uDrift;
attribute vec4 aSeed; // phase, fall speed, sway amount, size
varying float vAlpha;
void main() {
  vec3 p = position + uDrift;
  p.y -= aSeed.y * uTime;
  p.x += sin(uTime * 0.83 + aSeed.x) * aSeed.z;
  p.z += cos(uTime * 0.61 + aSeed.x * 1.7) * aSeed.z;
  vec3 rel = mod(p - uCenter + 0.5 * uBox, uBox) - 0.5 * uBox;
  vec4 mvPosition = modelViewMatrix * vec4(uCenter + rel, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float dist = max(-mvPosition.z, 0.05);
  float keep = step(fract(aSeed.x * 7.123), uDensity);
  gl_PointSize = keep * aSeed.w * projectionMatrix[1][1] * uHalfHeight / dist;
  vec3 e = abs(rel) / (0.5 * uBox);
  float edge = 1.0 - smoothstep(0.72, 1.0, max(e.x, max(e.y, e.z)));
  vAlpha = edge * smoothstep(0.8, 3.0, dist);
}
`;

const SNOW_FS = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float a = smoothstep(1.0, 0.25, r) * (0.75 + 0.25 * smoothstep(0.6, 0.0, r));
  a *= vAlpha * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function createSnowfall(count = 1800) {
  const box = new THREE.Vector3(46, 28, 46);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = Math.random() * box.x;
    pos[i * 3 + 1] = Math.random() * box.y;
    pos[i * 3 + 2] = Math.random() * box.z;
    const big = Math.random() < 0.08;
    seed[i * 4] = Math.random() * 100; // phase (also density key)
    seed[i * 4 + 1] = 0.55 + Math.random() * 0.75; // fall m/s
    seed[i * 4 + 2] = 0.12 + Math.random() * 0.5; // sway m
    seed[i * 4 + 3] = big ? 0.12 + Math.random() * 0.05 : 0.05 + Math.random() * 0.06; // size m
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const uniforms = {
    uTime: { value: 0 },
    uHalfHeight: { value: 400 },
    uDensity: { value: 1 },
    uCenter: { value: new THREE.Vector3() },
    uBox: { value: box },
    uDrift: { value: new THREE.Vector3() },
    uColor: { value: new THREE.Color(0xf4f8ff) },
    uOpacity: { value: 0.88 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SNOW_VS,
    fragmentShader: SNOW_FS,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'snowfall';
  points.frustumCulled = false;
  points.renderOrder = 30;
  points.raycast = () => {};
  points.onBeforeRender = (renderer) => {
    renderer.getDrawingBufferSize(_v2);
    uniforms.uHalfHeight.value = _v2.y * 0.5;
  };
  return { points, uniforms, geometry, material };
}

// ---------------------------------------------------------------------------
// Geometry for 3D coins
// ---------------------------------------------------------------------------

let coinGeoCache = null;
function coinGeometries() {
  if (coinGeoCache) return coinGeoCache;
  const prof = [
    [0, -0.016], [0.1, -0.016], [0.11, -0.021], [0.126, -0.027], [0.15, -0.027], [0.162, -0.017],
    [0.166, 0], [0.162, 0.017], [0.15, 0.027], [0.126, 0.027], [0.11, 0.021], [0.1, 0.016], [0, 0.016],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.LatheGeometry(prof, 18);
  body.deleteAttribute('uv');
  const parts = [{ geo: body, color: 0xffc94a }];
  for (const side of [1, -1]) {
    const star = new THREE.ExtrudeGeometry(starShape(0.07, 0.032), {
      depth: 0.008,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.004,
      bevelSegments: 1,
    });
    star.deleteAttribute('uv');
    // Extrude faces +Z; lay it on the coin face (coin faces are ±Y before the final rotation).
    star.rotateX(side > 0 ? -Math.PI / 2 : Math.PI / 2);
    star.translate(0, side * 0.015, 0);
    parts.push({ geo: star, color: 0xffe27a });
  }
  const geo = mergeParts(parts);
  geo.rotateX(Math.PI / 2); // coin now faces +Z (stands upright)
  const outline = makeOutlineGeometry(geo, 0.012);
  coinGeoCache = { geo, outline };
  return coinGeoCache;
}

// ---------------------------------------------------------------------------
// The effects system
// ---------------------------------------------------------------------------

const SPARK_CAP = 1400;
const CONF_CAP = 900;
const COIN_CAP = 96;
const TEXT_POOL = 10;
const TRAIL_MAX = 56;
const TRAIL_LIFE = 1.6;
const TRAIL_BANDS = 6;
const TRAIL_COLS = TRAIL_BANDS * 2;
const TEXT_FONT = '"Fredoka", "Comic Sans MS", "Arial Rounded MT Bold", system-ui, sans-serif';

const CONFETTI_COLORS = [0xe63946, 0xe63946, 0x2a9d6f, 0x2a9d6f, 0xffc94a, 0xffc94a, 0xffffff, 0xff8fc7, 0x4d96ff, 0xa66cff, 0x6bcb77];
const RAINBOW = [0xff5d5d, 0xffa54d, 0xffe14d, 0x6bdc6b, 0x4dabff, 0xb07cff];

export function createEffects(scene) {
  const root = new THREE.Group();
  root.name = 'effects';
  if (scene && typeof scene.add === 'function') scene.add(root);

  let clock = 0;
  let groundFn = null;
  const camPos = new THREE.Vector3(0, 10, 20);
  const camFwd = new THREE.Vector3(0, 0, -1);
  const target = new THREE.Vector3();
  let hasTarget = false;
  const lastPlayer = new THREE.Vector3();
  let hasLastPlayer = false;
  let playerSpeed = 0;

  function groundAt(x, z, fallback) {
    if (groundFn) {
      try {
        const h = groundFn(x, z);
        if (Number.isFinite(h)) return h;
      } catch {
        /* ignore */
      }
    }
    return fallback;
  }

  // Where a burst at `pos` should land. Without setGround(): bursts near Pip use
  // Pip's feet height (works whether pos is on the ground or at the item's
  // centre); far bursts assume pos is ~0.9 m above the snow.
  function burstFloor(pos) {
    let fallback = pos.y - 0.9;
    if (hasLastPlayer && Math.hypot(pos.x - lastPlayer.x, pos.z - lastPlayer.z) < 12) fallback = Math.min(pos.y, lastPlayer.y);
    return groundAt(pos.x, pos.z, fallback);
  }

  // ---- sparkles / glows -------------------------------------------------
  const batch = createPointBatch(SPARK_CAP + 64, { core: 0.8, renderOrder: 22 });
  root.add(batch.points);
  const sim = createSparkleSim(SPARK_CAP);

  function spark(x, y, z, vx, vy, vz, size, color, alpha, life, shape, blend, grav, drag, flags, spin) {
    return sim.spawn(x, y, z, vx, vy, vz, size, color.r, color.g, color.b, alpha, life, shape, blend, grav, drag, flags, spin);
  }

  // ---- confetti (instanced, real 3D flutter) -----------------------------
  const confGeo = new THREE.PlaneGeometry(1, 1);
  const confMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const confMesh = new THREE.InstancedMesh(confGeo, confMat, CONF_CAP);
  confMesh.name = 'confetti';
  confMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < CONF_CAP; i++) confMesh.setColorAt(i, _white);
  confMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  confMesh.count = 0;
  confMesh.frustumCulled = false;
  confMesh.visible = false;
  confMesh.raycast = () => {};
  root.add(confMesh);
  const C = {};
  const confNames = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'rx', 'ry', 'rz', 'wx', 'wy', 'wz', 'age', 'life', 'w', 'h', 'r', 'g', 'b', 'floor', 'land', 'ph'];
  const confList = [];
  for (const nm of confNames) {
    C[nm] = new Float32Array(CONF_CAP);
    confList.push(C[nm]);
  }
  let confN = 0;

  function confKill(i) {
    const last = --confN;
    if (i !== last) for (let k = 0; k < confList.length; k++) confList[k][i] = confList[k][last];
  }

  // ---- coins (instanced 3D toon coins + outline) -------------------------
  const coinGeos = coinGeometries();
  const coinMat = toon(0xffffff, { vertexColors: true, emissive: 0x6b4300, emissiveIntensity: 0.55 });
  const coinMesh = new THREE.InstancedMesh(coinGeos.geo, coinMat, COIN_CAP);
  coinMesh.name = 'coins';
  coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  coinMesh.count = 0;
  coinMesh.frustumCulled = false;
  coinMesh.visible = false;
  coinMesh.raycast = () => {};
  const coinOutlineMat = new THREE.MeshBasicMaterial({ color: PALETTE.outline, side: THREE.BackSide });
  const coinOutline = new THREE.InstancedMesh(coinGeos.outline, coinOutlineMat, COIN_CAP);
  coinOutline.instanceMatrix = coinMesh.instanceMatrix; // share the per-instance transforms
  coinOutline.count = 0;
  coinOutline.frustumCulled = false;
  coinOutline.raycast = () => {};
  coinMesh.add(coinOutline);
  root.add(coinMesh);
  const K = {};
  const coinNames = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'age', 'life', 'spin', 'ang', 'floor', 'home', 'tilt'];
  const coinList = [];
  for (const nm of coinNames) {
    K[nm] = new Float32Array(COIN_CAP);
    coinList.push(K[nm]);
  }
  let coinN = 0;

  function coinKill(i) {
    const last = --coinN;
    if (i !== last) for (let k = 0; k < coinList.length; k++) coinList[k][i] = coinList[k][last];
  }

  // ---- float text (sprite pool, canvases created lazily) ------------------
  let textPool = null;
  let lastText = { x: 0, y: 0, z: 0, t: -10, stack: 0 };

  function ensureTextPool() {
    if (textPool) return textPool;
    textPool = [];
    if (typeof document === 'undefined' || !document || typeof document.createElement !== 'function') return textPool;
    for (let k = 0; k < TEXT_POOL; k++) {
      let canvas = null;
      let g = null;
      try {
        canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        g = canvas.getContext('2d');
      } catch {
        g = null;
      }
      if (!g) break;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        fog: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.name = 'floatText';
      sprite.visible = false;
      sprite.renderOrder = 1000;
      sprite.frustumCulled = false;
      sprite.raycast = () => {};
      root.add(sprite);
      textPool.push({ sprite, canvas, g, tex, mat, active: false, age: 0, life: 1.45, x: 0, y: 0, z: 0, h: 0.68 });
    }
    return textPool;
  }

  function drawText(entry, text, color) {
    const { canvas, g } = entry;
    const W = canvas.width;
    const H = canvas.height;
    g.clearRect(0, 0, W, H);
    let size = 84;
    g.font = `700 ${size}px ${TEXT_FONT}`;
    let w = g.measureText(text).width;
    const maxW = W - 56;
    if (w > maxW) {
      size = Math.max(26, Math.floor((size * maxW) / w));
      g.font = `700 ${size}px ${TEXT_FONT}`;
      w = g.measureText(text).width;
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.miterLimit = 2;
    const cx = W / 2;
    const cy = H / 2 + 4;
    setColorSafe(_c, color, 0xffd93d);
    const base = '#' + _c.getHexString();
    const light = '#' + _c2.copy(_c).lerp(_white, 0.55).getHexString();
    const dark = '#' + _c2.copy(_c).multiplyScalar(0.62).getHexString();
    // chunky dark outline with a soft drop shadow
    g.shadowColor = 'rgba(20, 10, 40, 0.45)';
    g.shadowOffsetY = 6;
    g.shadowBlur = 6;
    g.strokeStyle = '#2a1b3d';
    g.lineWidth = Math.max(8, size * 0.3);
    g.strokeText(text, cx, cy);
    g.shadowColor = 'rgba(0,0,0,0)';
    g.shadowOffsetY = 0;
    g.shadowBlur = 0;
    // white sticker rim
    g.strokeStyle = '#ffffff';
    g.lineWidth = Math.max(4, size * 0.13);
    g.strokeText(text, cx, cy);
    // glossy gradient fill
    const grad = g.createLinearGradient(0, cy - size * 0.5, 0, cy + size * 0.5);
    grad.addColorStop(0, light);
    grad.addColorStop(0.5, base);
    grad.addColorStop(1, dark);
    g.fillStyle = grad;
    g.fillText(text, cx, cy);
    entry.tex.needsUpdate = true;
  }

  // ---- rainbow trail ribbon ------------------------------------------------
  let trailOn = false;
  const hx = new Float32Array(TRAIL_MAX);
  const hy = new Float32Array(TRAIL_MAX);
  const hz = new Float32Array(TRAIL_MAX);
  const ht = new Float32Array(TRAIL_MAX);
  let hStart = 0;
  let hCount = 0;
  const rowX = new Float32Array(TRAIL_MAX + 1);
  const rowY = new Float32Array(TRAIL_MAX + 1);
  const rowZ = new Float32Array(TRAIL_MAX + 1);
  const rowA = new Float32Array(TRAIL_MAX + 1);
  const ROWS = TRAIL_MAX + 1;
  const trailPos = new Float32Array(ROWS * TRAIL_COLS * 3);
  const trailCol = new Float32Array(ROWS * TRAIL_COLS * 4);
  const trailIdx = new Uint16Array((ROWS - 1) * TRAIL_BANDS * 6);
  {
    let o = 0;
    for (let r = 0; r < ROWS - 1; r++) {
      for (let b = 0; b < TRAIL_BANDS; b++) {
        const a = r * TRAIL_COLS + b * 2;
        const a1 = a + 1;
        const c = a + TRAIL_COLS;
        const c1 = c + 1;
        trailIdx[o++] = a;
        trailIdx[o++] = c;
        trailIdx[o++] = a1;
        trailIdx[o++] = a1;
        trailIdx[o++] = c;
        trailIdx[o++] = c1;
      }
    }
  }
  const trailGeo = new THREE.BufferGeometry();
  const trailPosAttr = new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage);
  const trailColAttr = new THREE.BufferAttribute(trailCol, 4).setUsage(THREE.DynamicDrawUsage);
  trailGeo.setAttribute('position', trailPosAttr);
  trailGeo.setAttribute('color', trailColAttr);
  trailGeo.setIndex(new THREE.BufferAttribute(trailIdx, 1));
  trailGeo.setDrawRange(0, 0);
  trailGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const trailMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  const trailMesh = new THREE.Mesh(trailGeo, trailMat);
  trailMesh.name = 'rainbowTrail';
  trailMesh.frustumCulled = false;
  trailMesh.renderOrder = 5;
  trailMesh.visible = false;
  trailMesh.raycast = () => {};
  root.add(trailMesh);
  const rainbowLin = RAINBOW.map((hex) => new THREE.Color(hex));
  let trailEmit = 0;

  function trailPush(x, y, z) {
    let idx;
    if (hCount < TRAIL_MAX) {
      idx = (hStart + hCount) % TRAIL_MAX;
      hCount++;
    } else {
      idx = hStart;
      hStart = (hStart + 1) % TRAIL_MAX;
    }
    hx[idx] = x;
    hy[idx] = groundAt(x, z, y) + 0.06;
    hz[idx] = z;
    ht[idx] = clock;
  }

  // ---- snowfall --------------------------------------------------------------
  const snow = createSnowfall(1800);
  root.add(snow.points);
  const drift = snow.uniforms.uDrift.value;

  // ---- public API ------------------------------------------------------------

  function confetti(pos, count = 120) {
    if (!validPos(pos)) return;
    const n = Math.max(0, Math.min(CONF_CAP, Math.floor(Number(count) || 0)));
    const floor = burstFloor(pos) + 0.02;
    for (let k = 0; k < n && confN < CONF_CAP; k++) {
      const i = confN++;
      const th = Math.random() * TAU;
      const phi = Math.random() * 1.15;
      const sp = 3.5 + Math.random() * 4.5;
      C.x[i] = pos.x + (Math.random() - 0.5) * 0.2;
      C.y[i] = pos.y + (Math.random() - 0.5) * 0.2;
      C.z[i] = pos.z + (Math.random() - 0.5) * 0.2;
      C.vx[i] = Math.cos(th) * Math.sin(phi) * sp;
      C.vy[i] = Math.cos(phi) * sp;
      C.vz[i] = Math.sin(th) * Math.sin(phi) * sp;
      C.rx[i] = Math.random() * TAU;
      C.ry[i] = Math.random() * TAU;
      C.rz[i] = Math.random() * TAU;
      C.wx[i] = (Math.random() - 0.5) * 22;
      C.wy[i] = (Math.random() - 0.5) * 14;
      C.wz[i] = (Math.random() - 0.5) * 22;
      C.age[i] = 0;
      C.life[i] = 3.2 + Math.random() * 1.2;
      if (Math.random() < 0.16) {
        C.w[i] = 0.03 + Math.random() * 0.015;
        C.h[i] = 0.14 + Math.random() * 0.06;
      } else {
        C.w[i] = 0.065 + Math.random() * 0.05;
        C.h[i] = 0.04 + Math.random() * 0.03;
      }
      _c.set(CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0]);
      C.r[i] = _c.r;
      C.g[i] = _c.g;
      C.b[i] = _c.b;
      C.floor[i] = floor;
      C.land[i] = 0;
      C.ph[i] = Math.random() * TAU;
    }
    // the pop itself: a quick white flash, a ring and a few golden twinkles
    _c.set(0xffffff);
    spark(pos.x, pos.y, pos.z, 0, 0, 0, 1.5, _c, 0.7, 0.2, SHAPE.GLOW, 0, 0, 0, F_GROW, 0);
    _c.set(0xfff1b8);
    spark(pos.x, pos.y, pos.z, 0, 0, 0, 1.7, _c, 0.55, 0.3, SHAPE.RING, 0.25, 0, 0, F_GROW, 0);
    sparkles(pos, 0xffe680, Math.min(18, Math.round(n / 7)));
  }

  function sparkles(pos, color = 0xffe680, count = 30) {
    if (!validPos(pos)) return;
    const n = Math.max(0, Math.min(400, Math.floor(Number(count) || 0)));
    if (n === 0) return;
    setColorSafe(_c2, color, 0xffe680);
    for (let k = 0; k < n; k++) {
      // random direction, biased upward
      let dx = Math.random() * 2 - 1;
      let dy = Math.random() * 1.4 - 0.4;
      let dz = Math.random() * 2 - 1;
      const l = Math.hypot(dx, dy, dz) || 1;
      const sp = 0.8 + Math.random() * 2.2;
      dx = (dx / l) * sp;
      dy = (dy / l) * sp;
      dz = (dz / l) * sp;
      const roll = Math.random();
      const shape = roll < 0.6 ? SHAPE.SPARKLE : roll < 0.85 ? SHAPE.STAR : SHAPE.GLOW;
      const size = shape === SHAPE.SPARKLE ? 0.16 + Math.random() * 0.2 : shape === SHAPE.STAR ? 0.11 + Math.random() * 0.09 : 0.22 + Math.random() * 0.15;
      _c.copy(_c2).lerp(_white, Math.random() * 0.45);
      spark(
        pos.x + (Math.random() - 0.5) * 0.25,
        pos.y + (Math.random() - 0.5) * 0.25,
        pos.z + (Math.random() - 0.5) * 0.25,
        dx, dy, dz, size, _c, 1, 0.55 + Math.random() * 0.6, shape,
        shape === SHAPE.GLOW ? 0 : 0.45, Math.random() < 0.5 ? -0.8 : 0.5, 2.6, F_TWINKLE,
      );
    }
    spark(pos.x, pos.y, pos.z, 0, 0, 0, 0.9, _c2, 0.5, 0.28, SHAPE.GLOW, 0, 0, 0, F_GROW, 0);
  }

  function coinBurst(pos, n = 8) {
    if (!validPos(pos)) return;
    const count = Math.max(0, Math.min(COIN_CAP, Math.floor(Number(n) || 0)));
    const floor = burstFloor(pos) + 0.05;
    for (let k = 0; k < count && coinN < COIN_CAP; k++) {
      const i = coinN++;
      const th = (k / Math.max(1, count)) * TAU + Math.random() * 0.8;
      const hs = 1.1 + Math.random() * 1.6;
      K.x[i] = pos.x;
      K.y[i] = pos.y + 0.1;
      K.z[i] = pos.z;
      K.vx[i] = Math.cos(th) * hs;
      K.vy[i] = 4.4 + Math.random() * 2.2;
      K.vz[i] = Math.sin(th) * hs;
      K.age[i] = -k * 0.025; // tiny stagger so they "pour" out
      K.life[i] = 2.4;
      K.spin[i] = (9 + Math.random() * 7) * (Math.random() < 0.5 ? -1 : 1);
      K.ang[i] = Math.random() * TAU;
      K.floor[i] = floor;
      K.home[i] = 0.42 + Math.random() * 0.2;
      K.tilt[i] = (Math.random() - 0.5) * 0.6;
    }
  }

  function floatText(pos, text, color = '#ffd93d') {
    if (!validPos(pos)) return;
    const pool = ensureTextPool();
    if (!pool.length) return;
    const str = String(text ?? '');
    if (!str) return;
    let entry = null;
    for (const e of pool) {
      if (!e.active) {
        entry = e;
        break;
      }
    }
    if (!entry) {
      entry = pool[0];
      for (const e of pool) if (e.age > entry.age) entry = e;
    }
    try {
      drawText(entry, str, color);
    } catch {
      return;
    }
    // stack quick successive texts at the same spot so they don't overlap
    const near = Math.hypot(pos.x - lastText.x, pos.z - lastText.z) < 1.5 && clock - lastText.t < 0.45;
    lastText.stack = near ? (lastText.stack + 1) % 4 : 0;
    lastText.x = pos.x;
    lastText.z = pos.z;
    lastText.t = clock;
    entry.active = true;
    entry.age = 0;
    entry.life = 1.45;
    entry.x = pos.x;
    entry.y = pos.y + 0.25 + lastText.stack * 0.42;
    entry.z = pos.z;
    entry.sprite.visible = true;
    entry.sprite.position.set(entry.x, entry.y, entry.z);
    entry.sprite.scale.set(0.001, 0.001, 1);
    entry.mat.opacity = 1;
  }

  function setTrail(on) {
    trailOn = !!on;
  }

  // ---- per-frame update ------------------------------------------------------

  function updateCoins(dt) {
    let i = 0;
    while (i < coinN) {
      K.age[i] += dt;
      const age = K.age[i];
      if (age < 0) {
        i++;
        continue;
      }
      if (age >= K.life[i]) {
        _c.set(0xffe680);
        spark(K.x[i], K.y[i], K.z[i], 0, 0.6, 0, 0.4, _c, 1, 0.45, SHAPE.SPARKLE, 0.4, 0, 2, F_TWINKLE);
        coinKill(i);
        continue;
      }
      let shrink = 1;
      if (hasTarget && age > K.home[i]) {
        const dx = target.x - K.x[i];
        const dy = target.y - K.y[i];
        const dz = target.z - K.z[i];
        const dist = Math.hypot(dx, dy, dz);
        if (dist < 0.38 || dist > 45) {
          _c.set(0xffe680);
          if (dist < 0.38) {
            spark(K.x[i], K.y[i], K.z[i], 0, 0.8, 0, 0.45, _c, 1, 0.4, SHAPE.SPARKLE, 0.4, 0, 2, F_TWINKLE);
            spark(K.x[i], K.y[i], K.z[i], 0, 0, 0, 0.7, _c, 0.6, 0.22, SHAPE.GLOW, 0, 0, 0, F_GROW, 0);
          }
          coinKill(i);
          continue;
        }
        const speed = 5 + (age - K.home[i]) * 28;
        const blend = Math.min(1, dt * 8);
        K.vx[i] += ((dx / dist) * speed - K.vx[i]) * blend;
        K.vy[i] += ((dy / dist) * speed - K.vy[i]) * blend;
        K.vz[i] += ((dz / dist) * speed - K.vz[i]) * blend;
        shrink = 0.5 + 0.5 * clamp01(dist / 1.4);
      } else {
        K.vy[i] -= 13 * dt;
        if (K.y[i] < K.floor[i] && K.vy[i] < 0) {
          K.y[i] = K.floor[i];
          K.vy[i] = -K.vy[i] * 0.42;
          K.vx[i] *= 0.6;
          K.vz[i] *= 0.6;
        }
      }
      K.x[i] += K.vx[i] * dt;
      K.y[i] += K.vy[i] * dt;
      K.z[i] += K.vz[i] * dt;
      K.ang[i] += K.spin[i] * dt;
      i++;
    }
    // write instances
    let w = 0;
    for (let j = 0; j < coinN; j++) {
      const age = K.age[j];
      if (age < 0) continue;
      let sc = age < 0.12 ? easeOutBack(age / 0.12) : 1;
      const rem = K.life[j] - age;
      if (rem < 0.25) sc *= rem / 0.25;
      if (hasTarget && age > K.home[j]) {
        const dist = Math.hypot(target.x - K.x[j], target.y - K.y[j], target.z - K.z[j]);
        sc *= 0.5 + 0.5 * clamp01(dist / 1.4);
      }
      sc = Math.max(0.0001, sc);
      _p.set(K.x[j], K.y[j], K.z[j]);
      _e.set(K.tilt[j], K.ang[j], 0);
      _q.setFromEuler(_e);
      _s.set(sc, sc, sc);
      _m4.compose(_p, _q, _s);
      coinMesh.setMatrixAt(w++, _m4);
    }
    coinMesh.count = w;
    coinOutline.count = w;
    coinMesh.visible = w > 0;
    if (w > 0) coinMesh.instanceMatrix.needsUpdate = true;
  }

  function updateConfetti(dt) {
    let i = 0;
    while (i < confN) {
      C.age[i] += dt;
      const age = C.age[i];
      if (age >= C.life[i]) {
        confKill(i);
        continue;
      }
      if (!C.land[i]) {
        const k = Math.max(0, 1 - 2.6 * dt);
        C.vx[i] *= k;
        C.vz[i] *= k;
        C.vy[i] = C.vy[i] * k - 6 * dt;
        const flutter = Math.min(1, age * 1.5);
        C.x[i] += (C.vx[i] + Math.sin(age * 7 + C.ph[i]) * 0.7 * flutter) * dt;
        C.z[i] += (C.vz[i] + Math.cos(age * 5.3 + C.ph[i]) * 0.7 * flutter) * dt;
        C.y[i] += C.vy[i] * dt;
        C.rx[i] += C.wx[i] * dt;
        C.ry[i] += C.wy[i] * dt;
        C.rz[i] += C.wz[i] * dt;
        if (C.y[i] <= C.floor[i] && C.vy[i] < 0) {
          C.y[i] = C.floor[i];
          C.land[i] = 1;
          C.rx[i] = -Math.PI / 2;
          C.ry[i] = 0;
          C.rz[i] = Math.random() * TAU;
          C.life[i] = Math.min(C.life[i], age + 1.4 + Math.random() * 0.8);
        }
      }
      i++;
    }
    for (let j = 0; j < confN; j++) {
      const age = C.age[j];
      let sc = age < 0.08 ? age / 0.08 : 1;
      const rem = C.life[j] - age;
      if (rem < 0.45) sc *= rem / 0.45;
      sc = Math.max(0.0001, sc);
      _p.set(C.x[j], C.y[j], C.z[j]);
      _e.set(C.rx[j], C.ry[j], C.rz[j]);
      _q.setFromEuler(_e);
      _s.set(C.w[j] * sc, C.h[j] * sc, 1);
      _m4.compose(_p, _q, _s);
      confMesh.setMatrixAt(j, _m4);
      // glint: brighter when the piece faces the camera
      let shade = 0.85;
      if (!C.land[j]) {
        const nx = 2 * (_q.x * _q.z + _q.w * _q.y);
        const ny = 2 * (_q.y * _q.z - _q.w * _q.x);
        const nz = 1 - 2 * (_q.x * _q.x + _q.y * _q.y);
        let tx = camPos.x - C.x[j];
        let ty = camPos.y - C.y[j];
        let tz = camPos.z - C.z[j];
        const tl = Math.hypot(tx, ty, tz) || 1;
        tx /= tl;
        ty /= tl;
        tz /= tl;
        shade = 0.5 + 0.55 * Math.abs(nx * tx + ny * ty + nz * tz);
      }
      _c.setRGB(C.r[j] * shade, C.g[j] * shade, C.b[j] * shade);
      confMesh.setColorAt(j, _c);
    }
    confMesh.count = confN;
    confMesh.visible = confN > 0;
    if (confN > 0) {
      confMesh.instanceMatrix.needsUpdate = true;
      confMesh.instanceColor.needsUpdate = true;
    }
  }

  function updateTexts(dt) {
    if (!textPool) return;
    for (const e of textPool) {
      if (!e.active) continue;
      e.age += dt;
      const t = e.age / e.life;
      if (t >= 1) {
        e.active = false;
        e.sprite.visible = false;
        continue;
      }
      let sc = t < 0.16 ? easeOutBack(t / 0.16) : 1;
      if (t > 0.7) sc *= 1 + (t - 0.7) * 0.35;
      const hgt = e.h * Math.max(0.0001, sc);
      e.sprite.scale.set(hgt * 4, hgt, 1);
      e.sprite.position.set(e.x, e.y + 1.5 * easeOutCubic(t), e.z);
      e.mat.opacity = t > 0.62 ? 1 - (t - 0.62) / 0.38 : 1;
      e.mat.rotation = Math.sin(e.age * 9) * 0.08 * (1 - t);
    }
  }

  function updateTrail(dt, playerPos) {
    const havePlayer = validPos(playerPos);
    // record
    if (trailOn && havePlayer) {
      if (hCount === 0) trailPush(playerPos.x, playerPos.y, playerPos.z);
      else {
        const ni = (hStart + hCount - 1) % TRAIL_MAX;
        if (Math.hypot(playerPos.x - hx[ni], playerPos.z - hz[ni]) > 0.22) trailPush(playerPos.x, playerPos.y, playerPos.z);
      }
      // sparkles streaming off the trail
      const moving = playerSpeed > 0.6;
      trailEmit += dt * (moving ? 28 : 3);
      while (trailEmit >= 1) {
        trailEmit -= 1;
        _c.setHSL((clock * 0.45 + Math.random() * 0.25) % 1, 1, 0.55);
        const roll = Math.random();
        const shape = roll < 0.35 ? SHAPE.SPARKLE : roll < 0.8 ? SHAPE.STAR : SHAPE.GLOW;
        spark(
          playerPos.x + (Math.random() - 0.5) * 0.7,
          playerPos.y + 0.12 + Math.random() * 0.6,
          playerPos.z + (Math.random() - 0.5) * 0.7,
          (Math.random() - 0.5) * 0.3, 0.35 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3,
          shape === SHAPE.GLOW ? 0.3 : 0.13 + Math.random() * 0.12, _c, 1, 0.6 + Math.random() * 0.5, shape,
          shape === SHAPE.GLOW ? 0 : 0.8, 0.15, 1.5, F_TWINKLE,
        );
      }
    } else {
      trailEmit = 0;
    }
    // expire old points
    while (hCount > 0 && clock - ht[hStart] > TRAIL_LIFE) {
      hStart = (hStart + 1) % TRAIL_MAX;
      hCount--;
    }
    // rows: newest first (plus the live head under Pip while the trail is on)
    let rows = 0;
    if (trailOn && havePlayer && hCount > 0) {
      rowX[0] = playerPos.x;
      rowY[0] = groundAt(playerPos.x, playerPos.z, playerPos.y) + 0.06;
      rowZ[0] = playerPos.z;
      rowA[0] = 0;
      rows = 1;
    }
    for (let k = hCount - 1; k >= 0; k--) {
      const idx = (hStart + k) % TRAIL_MAX;
      rowX[rows] = hx[idx];
      rowY[rows] = hy[idx];
      rowZ[rows] = hz[idx];
      rowA[rows] = clock - ht[idx];
      rows++;
    }
    if (rows < 2) {
      trailMesh.visible = false;
      trailGeo.setDrawRange(0, 0);
      return;
    }
    let px = 1;
    let pz = 0;
    for (let r = 0; r < rows; r++) {
      const a = Math.max(0, r - 1);
      const b = Math.min(rows - 1, r + 1);
      const dx = rowX[a] - rowX[b];
      const dz = rowZ[a] - rowZ[b];
      const len = Math.hypot(dx, dz);
      if (len > 1e-4) {
        px = -dz / len;
        pz = dx / len;
      }
      const life = clamp01(rowA[r] / TRAIL_LIFE);
      const halfW = 0.3 * (0.35 + 0.65 * Math.sqrt(1 - life));
      const alpha = 0.85 * (1 - life) * (r === rows - 1 ? 0 : 1);
      for (let bnd = 0; bnd < TRAIL_BANDS; bnd++) {
        const o0 = -halfW + (2 * halfW * bnd) / TRAIL_BANDS;
        const o1 = -halfW + (2 * halfW * (bnd + 1)) / TRAIL_BANDS;
        const col = rainbowLin[bnd];
        for (let s = 0; s < 2; s++) {
          const o = s === 0 ? o0 : o1;
          const vi = r * TRAIL_COLS + bnd * 2 + s;
          trailPos[vi * 3] = rowX[r] + px * o;
          trailPos[vi * 3 + 1] = rowY[r];
          trailPos[vi * 3 + 2] = rowZ[r] + pz * o;
          trailCol[vi * 4] = col.r;
          trailCol[vi * 4 + 1] = col.g;
          trailCol[vi * 4 + 2] = col.b;
          trailCol[vi * 4 + 3] = alpha;
        }
      }
    }
    trailPosAttr.clearUpdateRanges();
    trailPosAttr.addUpdateRange(0, rows * TRAIL_COLS * 3);
    trailPosAttr.needsUpdate = true;
    trailColAttr.clearUpdateRanges();
    trailColAttr.addUpdateRange(0, rows * TRAIL_COLS * 4);
    trailColAttr.needsUpdate = true;
    trailGeo.setDrawRange(0, (rows - 1) * TRAIL_BANDS * 6);
    trailMesh.visible = true;
  }

  function update(dt, time, opts = {}) {
    dt = Number(dt);
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.1);
    clock += dt;
    const camera = opts && opts.camera;
    const playerPos = opts && opts.playerPos;

    if (camera && camera.isObject3D) {
      camera.getWorldPosition(camPos);
      camera.getWorldDirection(camFwd);
    } else if (camera && camera.position) {
      camPos.copy(camera.position);
    }
    if (validPos(playerPos)) {
      target.set(playerPos.x, playerPos.y + 0.7, playerPos.z);
      hasTarget = true;
      if (hasLastPlayer) {
        const jump = Math.hypot(playerPos.x - lastPlayer.x, playerPos.z - lastPlayer.z);
        if (jump > Math.max(4, dt * 45)) {
          // Pip was teleported (new night / respawn): don't smear a rainbow
          // ribbon across the island from the old spot.
          hCount = 0;
          hStart = 0;
          trailEmit = 0;
          playerSpeed = 0;
        } else if (dt > 0) {
          playerSpeed += (jump / dt - playerSpeed) * Math.min(1, dt * 10);
        }
      }
      lastPlayer.set(playerPos.x, playerPos.y, playerPos.z);
      hasLastPlayer = true;
    } else {
      hasTarget = false;
      playerSpeed = 0;
    }

    updateTrail(dt, playerPos);
    updateCoins(dt);
    sim.update(dt);
    updateConfetti(dt);
    updateTexts(dt);

    batch.begin();
    sim.write(batch);
    batch.end();

    // snow: gentle gusty wind, centred a little in front of the camera
    const windX = 0.35 + Math.sin(clock * 0.13) * 0.25;
    const windZ = 0.12 + Math.cos(clock * 0.09) * 0.2;
    drift.x += windX * dt;
    drift.z += windZ * dt;
    if (Math.abs(drift.x) > 4600) drift.x %= 46;
    if (Math.abs(drift.z) > 4600) drift.z %= 46;
    const su = snow.uniforms;
    su.uTime.value = clock % 10000;
    _v.copy(camFwd);
    _v.y *= 0.3;
    su.uCenter.value.copy(camPos).addScaledVector(_v, 9);
  }

  function clear() {
    sim.clear();
    confN = 0;
    coinN = 0;
    hCount = 0;
    hStart = 0;
    trailEmit = 0;
    confMesh.count = 0;
    confMesh.visible = false;
    coinMesh.count = 0;
    coinOutline.count = 0;
    coinMesh.visible = false;
    trailMesh.visible = false;
    trailGeo.setDrawRange(0, 0);
    if (textPool) {
      for (const e of textPool) {
        e.active = false;
        e.sprite.visible = false;
      }
    }
    batch.begin();
    batch.end();
  }

  // Optional: let confetti/coins land on the real terrain and the trail hug it.
  function setGround(fn) {
    groundFn = typeof fn === 'function' ? fn : null;
  }

  // Optional: 0..1 snowfall density (1 = default gentle snow).
  function setSnow(density = 1) {
    const d = Number(density);
    snow.uniforms.uDensity.value = Number.isFinite(d) ? clamp01(d) : 1;
  }

  function dispose() {
    clear();
    root.removeFromParent();
    batch.dispose();
    confGeo.dispose();
    confMat.dispose();
    confMesh.dispose();
    coinOutlineMat.dispose();
    coinOutline.dispose();
    coinMesh.dispose();
    trailGeo.dispose();
    trailMat.dispose();
    snow.geometry.dispose();
    snow.material.dispose();
    if (textPool) {
      for (const e of textPool) {
        e.tex.dispose();
        e.mat.dispose();
      }
      textPool = [];
    }
  }

  return {
    confetti,
    sparkles,
    coinBurst,
    floatText,
    setTrail,
    update,
    clear,
    setGround,
    setSnow,
    dispose,
    group: root,
    get trailOn() {
      return trailOn;
    },
  };
}
