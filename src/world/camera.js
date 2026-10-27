// Smooth third-person orbit camera that floats behind Pip.
//
// Yaw convention: forward(yaw) = (sin yaw, 0, cos yaw). The camera sits at
// lookPoint - forward(yaw) * distance (raised by pitch) and looks at the
// target + (0, 1, 0). Mouse / touch drags orbit; when Pip walks and nobody has
// dragged for a moment the camera eases round behind them again.
//
// Occlusion: whenever something solid (pines, decorated trees, candy-cane
// lamps, houses, the sleigh, snowmen...) would sit between the camera and Pip,
// the camera eases in along its arm toward Pip — but never closer than ~4 m,
// so the framing stays readable — and those props are dithered away in a soft
// circle around Pip ("see-through"), so Pip is never hidden. Props right at the
// lens are dithered out too, so a canopy can't fill the screen. Shapes come
// from world.colliders (vertical cylinders), refined with the real prop
// heights / canopy widths read once per world from the scene graph.
//
// Portrait screens: the vertical FOV is widened so at least ~60 degrees fit
// across, and the camera backs off a little, so nearby items stay on screen.

import * as THREE from 'three';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

const DEFAULTS = {
  distance: 6.5,
  minDistance: 4,
  maxDistance: 12,
  pitch: 0.42,
  minPitch: 0.15,
  maxPitch: 1.1,
  lookHeight: 1.0,
  yawSpeed: 0.0055, // radians per dragged pixel
  pitchSpeed: 0.0045,
  zoomSpeed: 0.0011, // exponential zoom per wheel unit (100 = one notch ~ x1.12)
  followDelay: 1.5, // seconds without dragging before auto-follow kicks in
  followRate: 2.2, // how quickly the camera swings behind a walking Pip
  rotateDamping: 16,
  zoomDamping: 9,
  focusDamping: 9,
  clearance: 0.8, // metres the camera keeps above the terrain

  // ---- occlusion (camera eases in a little; see-through does the rest)
  occlusion: true,
  occlusionMinDistance: 4.2, // closest the camera comes when something is in the way
  occlusionMinRadius: 0.7, // unidentified colliders smaller than this are ignored (rocks)
  occlusionPadding: 0.3, // air kept between the sight line / lens and obstacles
  occlusionInRate: 5, // ease in gently...
  occlusionOutRate: 1.5, // ...and drift back out slowly
  occlusionPitchBoost: 0.1, // extra tilt (radians) when pulled right in
  occlusionBoostFrom: 5.5, // the tilt starts once the camera is closer than this
  occlusionCraneMax: 0.3, // extra tilt allowed to look over low props right behind Pip
  occlusionCraneInRate: 5,
  occlusionCraneOutRate: 1.5,
  occlusionMaxAutoPitch: 0.8, // automatic tilting never looks down steeper than this (rad)
  occlusionLowHeight: 1.3, // props shorter than this only hide Pip's feet: ignored
  lampGlowRadius: 1.0, // keep candy-lamp lanterns (and their glow sprites) out of the lens

  // ---- see-through: props hiding Pip are dithered away around them
  seeThrough: true,
  seeThroughRadius: 1.35, // radius (m, at Pip's depth) of the clear circle around Pip
  seeThroughAmount: 0.85, // share of prop pixels dithered away in the middle of it
  seeThroughMargin: 0.35, // cutting fades out this close in front of Pip's middle...
  seeThroughPipRadius: 0.62, // ...and nothing within this radius of Pip (feet to +2.5 m) is cut
  seeThroughInRate: 18,
  seeThroughOutRate: 4,
  nearFadeFrom: 0.7, // props closer to the lens than this vanish...
  nearFadeTo: 2.0, // ...and are dithered out up to this distance
  nearFadeInsideFrom: 1.6, // the same while the lens is inside a prop (house, canopy)...
  nearFadeInsideTo: 3.6, // ...so its windows / beams don't clutter the view

  // ---- portrait / narrow screens
  minHorizontalFov: 62, // degrees kept across the screen when it is narrow
  maxVerticalFov: 102, // the widened vertical FOV never exceeds this
  portraitPullBack: 0.15, // extra arm length (fraction) on a tall phone screen
};

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

function nowSeconds() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() / 1000 : Date.now() / 1000;
}

const SAMPLE_T = [0.3, 0.55, 0.8, 1];

// ---------------------------------------------------------------------------
// Occluders
//
// Each occluder is a plain object with a 2D centre (x, z), a bounding radius
// `bR` used for the cheap 2D segment-vs-circle pre-test, a `top` height and one
// of three shapes:
//   CYL    vertical cylinder: r, y0 .. top
//   TREE   trunk (trunkR, y0 .. yc) + canopy cone (r at yc shrinking to the top)
//   SPHERE ball at (x, cy, z) with radius r (lamp lanterns, lollipop heads)
// ---------------------------------------------------------------------------

const CYL = 0;
const TREE = 1;
const SPHERE = 2;

// Object3D names given by props.js. Tree kinds map to "canopy starts at this
// fraction of the height".
const TREE_KINDS = { pineTree: 0.19, decoratedTree: 0.11 };
// Props with several colliders: every collider inside the prop's footprint
// becomes a cylinder as tall as the prop.
const MULTI_KINDS = { gingerHouse: true, sleigh: true, fence: true, rock: true };
// Props with one collider at their origin and a custom shape.
const SINGLE_KINDS = { candyLamp: true, lollipopTree: true, snowman: true };

const _box = new THREE.Box3();
const _gbox = new THREE.Box3();
const _m4 = new THREE.Matrix4();
const _bv = new THREE.Vector3();
const _bq = new THREE.Quaternion();
const _bs = new THREE.Vector3();

function cylOcc(x, z, r, y0, top) {
  return { type: CYL, x, z, r, y0, top, bR: r, trunkR: 0, yc: 0, cy: 0 };
}

function treeOcc(x, z, y0, yc, top, canopyR, trunkR) {
  return { type: TREE, x, z, r: canopyR, y0, yc, top, trunkR, bR: Math.max(canopyR, trunkR), cy: 0 };
}

function sphereOcc(x, cy, z, r) {
  return { type: SPHERE, x, z, r, cy, y0: cy - r, top: cy + r, bR: r, trunkR: 0, yc: 0 };
}

// World-space AABB of the real meshes under `root` (sprites, points and
// outline hulls are skipped so glow sprites don't inflate it).
function meshBounds(root, out) {
  out.makeEmpty();
  root.traverse((c) => {
    if (!c.isMesh || c.isInstancedMesh || (c.userData && c.userData.isOutline)) return;
    const g = c.geometry;
    if (!g || !g.attributes || !g.attributes.position) return;
    if (!g.boundingBox) g.computeBoundingBox();
    _gbox.copy(g.boundingBox).applyMatrix4(c.matrixWorld);
    out.union(_gbox);
  });
  return out;
}

// Returns the occluder list; `list.sources` holds the props / instanced meshes
// that produced occluders (their materials get the see-through dither).
function buildOccluders(world, cfg) {
  const occ = [];
  const sources = [];
  occ.sources = sources;
  const colliders = Array.isArray(world.colliders) ? world.colliders : [];
  const nC = colliders.length;
  const used = new Uint8Array(nC);
  const low = cfg.occlusionLowHeight;
  const groundAt = (x, z) => {
    const h = typeof world.heightAt === 'function' ? world.heightAt(x, z) : 0;
    return Number.isFinite(h) ? h : 0;
  };
  const valid = (c) => c && Number.isFinite(c.x) && Number.isFinite(c.z) && c.r > 0;

  // 2 m spatial hash of collider indices, for matching props to their colliders
  const CELL = 2;
  const grid = new Map();
  const key = (i, j) => (i + 1000) * 4096 + (j + 1000);
  for (let n = 0; n < nC; n++) {
    const c = colliders[n];
    if (!valid(c)) continue;
    const k = key(Math.floor(c.x / CELL), Math.floor(c.z / CELL));
    let list = grid.get(k);
    if (!list) grid.set(k, (list = []));
    list.push(n);
  }
  // Marks colliders centred within `tol` of (x, z) as handled; returns the count.
  const claimNear = (x, z, tol) => {
    let found = 0;
    const i0 = Math.floor((x - tol) / CELL);
    const i1 = Math.floor((x + tol) / CELL);
    const j0 = Math.floor((z - tol) / CELL);
    const j1 = Math.floor((z + tol) / CELL);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const list = grid.get(key(i, j));
        if (!list) continue;
        for (const n of list) {
          const c = colliders[n];
          if ((c.x - x) ** 2 + (c.z - z) ** 2 <= tol * tol) {
            used[n] = 1;
            found++;
          }
        }
      }
    }
    return found;
  };

  // gather known props and instanced meshes
  const props = [];
  const instanced = [];
  const walk = (o) => {
    if (TREE_KINDS[o.name] !== undefined || MULTI_KINDS[o.name] || SINGLE_KINDS[o.name]) {
      props.push(o);
      return;
    }
    if (o.isInstancedMesh) instanced.push(o);
    for (let i = 0; i < o.children.length; i++) walk(o.children[i]);
  };
  if (world.group && world.group.isObject3D) {
    world.group.updateWorldMatrix(true, true);
    walk(world.group);
  }

  for (const o of props) {
    meshBounds(o, _box);
    if (_box.isEmpty()) continue;
    const before = occ.length;
    o.getWorldPosition(_bv);
    const px = _bv.x;
    const pz = _bv.z;
    const base = _bv.y;
    const top = _box.max.y;
    const H = top - base;
    const hx = (_box.max.x - _box.min.x) / 2;
    const hz = (_box.max.z - _box.min.z) / 2;
    const name = o.name;

    if (MULTI_KINDS[name]) {
      const tall = H >= low;
      const pad = 0.15;
      for (let n = 0; n < nC; n++) {
        const c = colliders[n];
        if (used[n] || !valid(c)) continue;
        if (c.x < _box.min.x - pad || c.x > _box.max.x + pad || c.z < _box.min.z - pad || c.z > _box.max.z + pad) continue;
        used[n] = 1;
        if (tall) occ.push(cylOcc(c.x, c.z, c.r, base - 0.5, top));
      }
      if (occ.length > before) sources.push(o);
      continue;
    }

    claimNear(px, pz, 0.12);
    if (TREE_KINDS[name] !== undefined) {
      if (H < low) continue;
      const canopyR = Math.max(0.3, ((hx + hz) / 2) * 0.95);
      occ.push(treeOcc(px, pz, base - 0.5, base + H * TREE_KINDS[name], top, canopyR, Math.max(0.2, H * 0.05)));
    } else if (name === 'candyLamp') {
      // the striped pole + hook, and a ball around the hanging lantern / glow
      occ.push(cylOcc(px, pz, 0.14, base - 0.5, top));
      const lp = o.userData && o.userData.lampPos;
      if (lp && lp.isVector3) {
        _bv.copy(lp);
        o.localToWorld(_bv);
        occ.push(sphereOcc(_bv.x, _bv.y, _bv.z, cfg.lampGlowRadius));
      }
    } else if (name === 'lollipopTree') {
      const R = clamp(Math.hypot(hx, hz) * 0.9, 0.5, 1.6);
      const cy = top - R;
      occ.push(cylOcc(px, pz, 0.14, base - 0.5, cy));
      occ.push(sphereOcc(px, cy, pz, R));
    } else {
      // snowmen (and anything else listed): a cylinder as tall as the prop
      if (H < low) continue;
      const ur = o.userData && o.userData.radius;
      const r = Number.isFinite(ur) && ur > 0 ? ur : Math.max(0.2, Math.min(hx, hz));
      occ.push(cylOcc(px, pz, r, base - 0.5, top));
    }
    if (occ.length > before) sources.push(o);
  }

  // instanced scatter (forest pines, rocks): one occluder per instance that has a collider
  for (const im of instanced) {
    const geo = im.geometry;
    if (!geo || !geo.attributes || !geo.attributes.position) continue;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const isTree = /forest/i.test(im.name || '') || !!(im.parent && /forest/i.test(im.parent.name || ''));
    const ext = Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z, 0.05);
    const count = Number.isFinite(im.count) ? im.count : 0;
    const before = occ.length;
    for (let i = 0; i < count; i++) {
      im.getMatrixAt(i, _m4);
      _m4.premultiply(im.matrixWorld);
      _m4.decompose(_bv, _bq, _bs);
      if (!claimNear(_bv.x, _bv.z, 0.08)) continue; // purely decorative (snow lumps, floes)
      const base = _bv.y;
      const top = base + bb.max.y * Math.abs(_bs.y);
      const H = top - base;
      if (H < low) continue;
      const sxz = Math.max(Math.abs(_bs.x), Math.abs(_bs.z));
      if (isTree) {
        occ.push(treeOcc(_bv.x, _bv.z, base - 0.5, base + H * 0.19, top, ext * sxz * 0.92, Math.max(0.2, H * 0.05)));
      } else {
        occ.push(cylOcc(_bv.x, _bv.z, ext * sxz * 0.8, base - 0.5, top));
      }
    }
    if (occ.length > before) sources.push(im);
  }

  // anything else (unknown / added later): tall cylinders, small stuff ignored
  for (let n = 0; n < nC; n++) {
    const c = colliders[n];
    if (used[n] || !valid(c) || c.r < cfg.occlusionMinRadius) continue;
    occ.push(cylOcc(c.x, c.z, c.r, groundAt(c.x, c.z) - 1, Infinity));
  }
  return occ;
}

// Is the point inside the occluder (inflated by `pad`, vertical slack `vm`)?
function insideOcc(o, x, y, z, pad, vm) {
  const ex = x - o.x;
  const ez = z - o.z;
  const d2 = ex * ex + ez * ez;
  if (o.type === SPHERE) {
    const ey = y - o.cy;
    const rr = o.r + pad;
    return d2 + ey * ey < rr * rr;
  }
  if (y > o.top + vm || y < o.y0) return false;
  let rad = o.r;
  if (o.type === TREE) {
    rad = y <= o.yc ? o.trunkR : Math.max(o.trunkR * 0.6, (o.r * (o.top - y)) / (o.top - o.yc));
  }
  rad += pad;
  return d2 < rad * rad;
}

// First parameter t in [0, best) where the segment A->B enters an occluder.
// Occluders that already contain A (Pip standing in a canopy's shadow) are
// skipped: moving the camera can't help with those.
function firstHit(list, ax, ay, az, bx, by, bz, best, pad) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const a2 = dx * dx + dz * dz;
  const len = Math.sqrt(a2 + dy * dy);
  if (!(len > 1e-4)) return best;
  const vm = 0.15;
  const lowY = Math.min(ay, by);
  const STEP = 0.25; // metres between samples along the sight line
  for (let n = 0; n < list.length; n++) {
    const o = list[n];
    if (o.top + vm < lowY) continue; // the sight line passes over it
    const R = o.bR + pad;
    const fx = ax - o.x;
    const fz = az - o.z;
    let t1;
    let t2;
    if (a2 < 1e-8) {
      if (fx * fx + fz * fz > R * R) continue;
      t1 = 0;
      t2 = 1;
    } else {
      const b = fx * dx + fz * dz;
      const c = fx * fx + fz * fz - R * R;
      const disc = b * b - a2 * c;
      if (disc <= 0) continue;
      const s = Math.sqrt(disc);
      t1 = (-b - s) / a2;
      t2 = (-b + s) / a2;
    }
    if (t2 <= 0 || t1 >= best) continue;
    const lo = t1 > 0 ? t1 : 0;
    const hi = Math.min(best, t2, 1);
    if (!(hi > lo)) continue;
    if (lo === 0 && insideOcc(o, ax, ay, az, pad, vm)) continue;
    const steps = Math.min(48, Math.max(1, Math.ceil(((hi - lo) * len) / STEP)));
    let prev = lo;
    for (let k = 1; k <= steps; k++) {
      const t = lo + ((hi - lo) * k) / steps;
      if (insideOcc(o, ax + dx * t, ay + dy * t, az + dz * t, pad, vm)) {
        let tOut = prev;
        let tIn = t;
        for (let it = 0; it < 6; it++) {
          const m = (tOut + tIn) * 0.5;
          if (insideOcc(o, ax + dx * m, ay + dy * m, az + dz * m, pad, vm)) tIn = m;
          else tOut = m;
        }
        if (tOut < best) best = tOut;
        break;
      }
      prev = t;
    }
  }
  return best;
}

// First point (0..1) where the camera arm — from `look`, length d, behind
// forward(yaw) = (fx, fz), tilted up by `pitch` — runs into an occluder; 1 if clear.
function armHit(list, look, fx, fz, d, pitch, pad) {
  const c = Math.cos(pitch);
  return firstHit(list, look.x, look.y, look.z, look.x - fx * d * c, look.y + d * Math.sin(pitch), look.z - fz * d * c, 1, pad);
}

// ---------------------------------------------------------------------------
// See-through
//
// Props that can hide Pip get patched copies of their materials: a tiny shader
// patch (chained onto any existing onBeforeCompile) dithers away (screen-door,
// 4x4 Bayer) fragments that are
//   - inside a cone from the camera to Pip (a circle around Pip on screen),
//     more than `margin` in front of Pip and above Pip's feet, scaled by the
//     rig's see-through strength (only on while something is in the way), or
//   - close to the lens (near fade; wider while the lens is inside a prop).
// A vertical capsule around Pip is never cut. The effect is also gated on the
// camera that renders being the one the rig placed, so other views of the
// same props (title backdrop, other cameras) are untouched. Shadows too.
// ---------------------------------------------------------------------------

const SEE_KEY = 'pipSeeThroughV1';

const SEE_UNIFORMS = {
  pipSeeCam: { value: new THREE.Vector3(1e6, 1e6, 1e6) },
  pipSeeTarget: { value: new THREE.Vector3() },
  // x: circle radius at Pip's depth, y: strength, z: margin before Pip, w: floor height
  pipSeeShape: { value: new THREE.Vector4(1, 0, 0.75, -1e6) },
  // x, z: Pip's position, y: feet height, w: radius of the protected capsule
  pipSeePip: { value: new THREE.Vector4(1e6, 0, 1e6, 0.62) },
  pipSeeNear: { value: new THREE.Vector2(0.7, 2.0) },
};

const SEE_VERT_HEAD = 'varying vec3 vPipSeeWorld;';
const SEE_VERT_BODY = `
{
  vec4 pipSeeW = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    pipSeeW = batchingMatrix * pipSeeW;
  #endif
  #ifdef USE_INSTANCING
    pipSeeW = instanceMatrix * pipSeeW;
  #endif
  vPipSeeWorld = ( modelMatrix * pipSeeW ).xyz;
}`;

const SEE_FRAG_HEAD = `
uniform vec3 pipSeeCam;
uniform vec3 pipSeeTarget;
uniform vec4 pipSeeShape;
uniform vec4 pipSeePip;
uniform vec2 pipSeeNear;
varying vec3 vPipSeeWorld;
float pipSeeBayer2( vec2 a ) {
  a = floor( a );
  return fract( a.x * 0.5 + a.y * a.y * 0.75 );
}
float pipSeeBayer4( vec2 a ) {
  return pipSeeBayer2( a * 0.5 ) * 0.25 + pipSeeBayer2( a );
}`;

const SEE_FRAG_BODY = `
{
  float pipSeeCut = 0.0;
  // only for the camera the rig placed this frame, and never on Pip
  vec2 pipSeeXZ = vPipSeeWorld.xz - pipSeePip.xz;
  bool pipSeeOnPip = dot( pipSeeXZ, pipSeeXZ ) < pipSeePip.w * pipSeePip.w && vPipSeeWorld.y < pipSeePip.y + 2.5;
  if ( !pipSeeOnPip && distance( cameraPosition, pipSeeCam ) < 0.25 ) {
    vec3 pipSeeAP = vPipSeeWorld - pipSeeCam;
    float pipSeeD = length( pipSeeAP );
    pipSeeCut = 1.0 - smoothstep( pipSeeNear.x, pipSeeNear.y, pipSeeD );
    if ( pipSeeShape.y > 0.0 && vPipSeeWorld.y > pipSeeShape.w ) {
      vec3 pipSeeAB = pipSeeTarget - pipSeeCam;
      float pipSeeL = max( length( pipSeeAB ), 0.001 );
      float pipSeeT = dot( pipSeeAP, pipSeeAB ) / pipSeeL;
      if ( pipSeeT > 0.0 ) {
        float pipSeeOff = sqrt( max( pipSeeD * pipSeeD - pipSeeT * pipSeeT, 0.0 ) );
        float pipSeeRad = pipSeeShape.x * pipSeeT / pipSeeL;
        float pipSeeIn = 1.0 - smoothstep( pipSeeRad * 0.55, pipSeeRad, pipSeeOff );
        float pipSeeEnd = pipSeeL - pipSeeShape.z;
        float pipSeeFront = 1.0 - smoothstep( pipSeeEnd - 0.35, pipSeeEnd, pipSeeT );
        pipSeeCut = max( pipSeeCut, pipSeeIn * pipSeeFront * pipSeeShape.y );
      }
    }
  }
  if ( pipSeeCut > 0.0 && pipSeeCut > pipSeeBayer4( gl_FragCoord.xy ) + 0.03 ) discard;
}`;

function injectSeeThrough(shader) {
  const vs = shader.vertexShader;
  const fs = shader.fragmentShader;
  if (typeof vs !== 'string' || typeof fs !== 'string') return;
  if (vs.includes('vPipSeeWorld')) return;
  if (!vs.includes('#include <common>') || !vs.includes('#include <project_vertex>')) return;
  if (!fs.includes('#include <common>') || !fs.includes('#include <clipping_planes_fragment>')) return;
  Object.assign(shader.uniforms, SEE_UNIFORMS);
  shader.vertexShader = vs
    .replace('#include <common>', '#include <common>\n' + SEE_VERT_HEAD)
    .replace('#include <project_vertex>', '#include <project_vertex>\n' + SEE_VERT_BODY);
  shader.fragmentShader = fs
    .replace('#include <common>', '#include <common>\n' + SEE_FRAG_HEAD)
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + SEE_FRAG_BODY);
}

const baseOnBeforeCompile = THREE.Material.prototype.onBeforeCompile;
const baseCacheKey = THREE.Material.prototype.customProgramCacheKey;
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function patchSeeThrough(mat) {
  const prev = mat.onBeforeCompile;
  const hasPrev = typeof prev === 'function' && prev !== baseOnBeforeCompile;
  const prevKey = mat.customProgramCacheKey;
  // The default cache key is the onBeforeCompile source, which is about to become ours.
  const keyBase = typeof prevKey === 'function' && prevKey !== baseCacheKey ? null : hasPrev ? prev.toString() : '';
  mat.onBeforeCompile = function (shader, renderer) {
    if (hasPrev) prev.call(this, shader, renderer);
    injectSeeThrough(shader);
  };
  mat.customProgramCacheKey = function () {
    return (keyBase !== null ? keyBase : prevKey.call(this)) + '|' + SEE_KEY;
  };
  mat.userData[SEE_KEY] = true;
  mat.needsUpdate = true;
}

// Props get their own patched copy of each material (one copy per original,
// shared by every prop that used it), so Pip, collectables and companions that
// use the same cached toon materials are never dithered. Other modules reach
// these materials through mesh.material, so they keep working on the copies.
const seeCopies = new WeakMap();

function seeThroughMaterial(mat) {
  if (!mat || !mat.isMaterial || (mat.userData && mat.userData[SEE_KEY])) return mat;
  const ok =
    mat.isMeshToonMaterial || mat.isMeshLambertMaterial || mat.isMeshPhongMaterial || mat.isMeshStandardMaterial || mat.isMeshBasicMaterial;
  if (!ok) return mat;
  let copy = seeCopies.get(mat);
  if (copy) return copy;
  try {
    copy = mat.clone();
  } catch (err) {
    return mat; // odd userData etc.: leave this one solid
  }
  if (hasOwn(mat, 'onBeforeCompile')) copy.onBeforeCompile = mat.onBeforeCompile;
  if (hasOwn(mat, 'customProgramCacheKey')) copy.customProgramCacheKey = mat.customProgramCacheKey;
  if (!copy.userData || typeof copy.userData !== 'object') copy.userData = {};
  patchSeeThrough(copy);
  seeCopies.set(mat, copy);
  return copy;
}

function patchSources(sources) {
  if (!Array.isArray(sources)) return;
  for (const src of sources) {
    if (!src || typeof src.traverse !== 'function') continue;
    src.traverse((c) => {
      if (!c.isMesh || c.isSprite || (c.userData && c.userData.isOutline)) return;
      if (Array.isArray(c.material)) c.material = c.material.map(seeThroughMaterial);
      else c.material = seeThroughMaterial(c.material);
    });
  }
}

// Points on Pip (heights above the feet) whose view decides "Pip is hidden".
const SEE_HEIGHTS = [0.4, 0.9, 1.4];

export function createCameraRig(camera, options = {}) {
  const cfg = { ...DEFAULTS, ...options };

  const focus = new THREE.Vector3(); // smoothed follow point (ground level)
  const lead = new THREE.Vector3(); // smoothed look-ahead offset
  const look = new THREE.Vector3(); // point the camera looks at
  const desired = new THREE.Vector3();

  let initialized = false;
  let snapNext = false;
  let yawGoal = 0;
  let pitchGoal = cfg.pitch;
  let distGoal = cfg.distance;
  let sinceDrag = 99;
  let followRamp = 0;
  let lift = 0;
  let clock = 0;

  let shakeTime = 0;
  let shakeDuration = 0;
  let shakeAmount = 0;

  // occlusion state
  let occWorld = null;
  let occList = null;
  let occCount = -1;
  let occBuiltAt = -99;
  let viewDist = cfg.distance; // actual camera arm length after pulling in
  let occFree = true; // true while nothing is pulling the camera in
  let crane = 0; // extra tilt used to peek over something right behind Pip

  const occludersFor = (world) => {
    if (!world || typeof world !== 'object') return null;
    const n = Array.isArray(world.colliders) ? world.colliders.length : 0;
    const now = nowSeconds();
    // Rebuild for a new world, or (rate-limited) when colliders were added later.
    if (world !== occWorld || (n !== occCount && now - occBuiltAt > 2)) {
      let list = world === occWorld && occList ? occList : [];
      try {
        list = buildOccluders(world, cfg);
        if (cfg.seeThrough) patchSources(list.sources);
      } catch (err) {
        // never let a bad prop break the camera
      }
      occWorld = world;
      occList = list;
      occCount = n;
      occBuiltAt = now;
    }
    return occList;
  };

  const baseFov = camera && typeof camera.fov === 'number' ? camera.fov : 55;
  let fov = baseFov;
  let see = 0; // see-through strength 0..1
  let inside = 0; // 0..1, eased: is the lens inside a prop?

  // Vertical FOV and arm-length scale for the current screen shape: narrow
  // (portrait) screens widen the vertical FOV so at least minHorizontalFov fits
  // across (up to maxVerticalFov) and back the camera off a little.
  const framing = { fov: baseFov, pull: 1 };
  const updateFraming = () => {
    framing.fov = baseFov;
    framing.pull = 1;
    const aspect = camera ? camera.aspect : NaN;
    if (!(aspect > 0) || !Number.isFinite(aspect)) return framing;
    const hMin = cfg.minHorizontalFov * DEG;
    const hNow = 2 * Math.atan(Math.tan((baseFov * DEG) / 2) * aspect);
    if (hNow < hMin) {
      const need = (2 * Math.atan(Math.tan(hMin / 2) / aspect)) / DEG;
      framing.fov = clamp(need, baseFov, Math.max(baseFov, cfg.maxVerticalFov));
    }
    if (aspect < 1) framing.pull = 1 + cfg.portraitPullBack * clamp((1 - aspect) / 0.55, 0, 1);
    return framing;
  };

  // Last values we wrote, so outside code can set rig.yaw / pitch / distance directly.
  let lastYaw = 0;
  let lastPitch = cfg.pitch;
  let lastDistance = cfg.distance;

  const rig = {
    yaw: 0,
    pitch: cfg.pitch,
    distance: cfg.distance,

    update(dt, opts = {}) {
      if (!camera) return;
      dt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
      clock += dt;
      const target = opts.target;
      if (!target) return;

      // Respect direct writes from outside (e.g. main.js setting rig.yaw).
      if (rig.yaw !== lastYaw && Number.isFinite(rig.yaw)) yawGoal = rig.yaw;
      if (rig.pitch !== lastPitch && Number.isFinite(rig.pitch)) pitchGoal = rig.pitch;
      if (rig.distance !== lastDistance && Number.isFinite(rig.distance)) distGoal = rig.distance;
      if (!Number.isFinite(rig.yaw)) rig.yaw = yawGoal = 0;
      if (!Number.isFinite(rig.pitch)) rig.pitch = pitchGoal = cfg.pitch;
      if (!Number.isFinite(rig.distance)) rig.distance = distGoal = cfg.distance;

      // ---- input: orbit + zoom
      const drag = opts.drag;
      const ddx = drag && Number.isFinite(drag.dx) ? drag.dx : 0;
      const ddy = drag && Number.isFinite(drag.dy) ? drag.dy : 0;
      if (ddx !== 0 || ddy !== 0) {
        yawGoal -= ddx * cfg.yawSpeed; // drag right = look right
        pitchGoal += ddy * cfg.pitchSpeed; // drag down = look down from higher up
        sinceDrag = 0;
        followRamp = 0;
      } else {
        sinceDrag += dt;
      }
      pitchGoal = clamp(pitchGoal, cfg.minPitch, cfg.maxPitch);

      const wheel = Number.isFinite(opts.wheel) ? opts.wheel : 0;
      if (wheel !== 0) distGoal *= Math.exp(clamp(wheel, -600, 600) * cfg.zoomSpeed);
      distGoal = clamp(distGoal, cfg.minDistance, cfg.maxDistance);

      // ---- auto-follow: swing gently behind a walking Pip
      const moving = !!opts.moving;
      const hasYaw = Number.isFinite(opts.targetYaw);
      if (moving && hasYaw && sinceDrag > cfg.followDelay) {
        followRamp = Math.min(1, followRamp + dt / 0.8);
        const diff = wrapAngle(opts.targetYaw - yawGoal);
        // Don't whip round when Pip walks towards the camera; strafing turns slowly.
        const strength = clamp((Math.cos(diff) + 0.35) / 1.35, 0, 1);
        yawGoal += diff * damp(cfg.followRate * strength * followRamp, dt);
      } else if (!moving) {
        followRamp = Math.max(0, followRamp - dt * 2);
      }

      // ---- smoothing
      const snapping = !initialized || snapNext;
      let teleported = snapping;
      if (snapping) {
        rig.yaw = yawGoal;
        rig.pitch = pitchGoal;
        rig.distance = distGoal;
        focus.set(target.x, target.y, target.z);
        lead.set(0, 0, 0);
        lift = 0;
        initialized = true;
        snapNext = false;
      } else {
        const kr = damp(cfg.rotateDamping, dt);
        rig.yaw += wrapAngle(yawGoal - rig.yaw) * kr;
        rig.pitch += (pitchGoal - rig.pitch) * kr;
        rig.distance += (distGoal - rig.distance) * damp(cfg.zoomDamping, dt);
        const kf = damp(cfg.focusDamping, dt);
        focus.x += (target.x - focus.x) * kf;
        focus.z += (target.z - focus.z) * kf;
        // Vertical follow is a bit softer so little bumps don't jiggle the view.
        focus.y += (target.y - focus.y) * damp(cfg.focusDamping * 0.6, dt);
        // Teleports (respawn, new night) snap instead of gliding across the island.
        const jump = (target.x - focus.x) ** 2 + (target.z - focus.z) ** 2;
        if (jump > 400) {
          focus.set(target.x, target.y, target.z);
          teleported = true;
        }
      }

      // Keep angles bounded so they never drift into huge numbers.
      if (rig.yaw > Math.PI || rig.yaw < -Math.PI) {
        const w = wrapAngle(rig.yaw);
        yawGoal += w - rig.yaw;
        rig.yaw = w;
      }

      // Look a little ahead of Pip while walking so you can see where you're going.
      const leadAmount = moving && hasYaw ? 0.9 : 0;
      const lx = hasYaw ? Math.sin(opts.targetYaw) * leadAmount : 0;
      const lz = hasYaw ? Math.cos(opts.targetYaw) * leadAmount : 0;
      const kl = damp(2.5, dt);
      lead.x += (lx - lead.x) * kl;
      lead.z += (lz - lead.z) * kl;

      look.set(focus.x + lead.x, focus.y + cfg.lookHeight, focus.z + lead.z);

      // ---- place the camera, eased in toward Pip if something is in the way
      const world = opts.world;
      updateFraming();
      const d = rig.distance * framing.pull;
      const fx = Math.sin(rig.yaw);
      const fz = Math.cos(rig.yaw);
      // The arm starts at the look-ahead point, so while walking Pip stands that
      // much nearer the lens: lengthen the minimum by the lead to keep Pip ~4 m off.
      const leadAlong = Math.max(0, lead.x * fx + lead.z * fz);
      const minOcc = Math.min(d, cfg.occlusionMinDistance + leadAlong);
      const occ = cfg.occlusion ? occludersFor(world) : null;
      let cp = Math.cos(rig.pitch);
      let sp = Math.sin(rig.pitch);
      if (!occ || !occ.length) {
        viewDist = d;
        occFree = true;
        crane = 0;
      } else {
        const pad = cfg.occlusionPadding;
        // Automatic tilt never turns the view top-down (dragging still can).
        const pitchCap = Math.max(rig.pitch, cfg.occlusionMaxAutoPitch);
        const passes = teleported ? 2 : 1; // a second pass lets a snap settle the tilt too
        for (let pass = 0; pass < passes; pass++) {
          // Tilt up a little as the camera is pulled in close so Pip stays in view.
          const ref = Math.min(d, cfg.occlusionBoostFrom);
          const close = ref - minOcc > 0.05 ? clamp((ref - viewDist) / (ref - minOcc), 0, 1) : 0;
          const boost = cfg.occlusionPitchBoost * close * close * (3 - 2 * close);
          const pitchBase = Math.min(rig.pitch + boost, pitchCap);

          // Something closer than the minimum distance (sleigh, snowman, lamp right
          // behind Pip)? Crane up just enough to look over it, if that's possible.
          const t0 = armHit(occ, look, fx, fz, d, pitchBase, pad);
          let craneGoal = 0;
          if (t0 * d < minOcc) {
            for (let c = 0.15; c <= cfg.occlusionCraneMax + 1e-6; c += 0.15) {
              const p = Math.min(pitchBase + c, pitchCap);
              const tc = armHit(occ, look, fx, fz, d, p, pad);
              if (tc >= 1 || tc * d >= minOcc + 0.3) {
                craneGoal = p - pitchBase;
                break;
              }
              if (p >= pitchCap) break;
            }
          }
          if (teleported) crane = craneGoal;
          else crane += (craneGoal - crane) * damp(craneGoal > crane ? cfg.occlusionCraneInRate : cfg.occlusionCraneOutRate, dt);
          if (crane < 1e-4) crane = 0;

          const pitchEff = Math.min(pitchBase + crane, pitchCap);
          cp = Math.cos(pitchEff);
          sp = Math.sin(pitchEff);
          const best = crane > 0 ? armHit(occ, look, fx, fz, d, pitchEff, pad) : t0;
          const hit = best < 1;
          const allowed = hit ? clamp(best * d, minOcc, d) : d;
          if (teleported) viewDist = allowed;
          else if (hit) viewDist += (allowed - viewDist) * damp(allowed < viewDist ? cfg.occlusionInRate : cfg.occlusionOutRate, dt);
          else if (occFree) viewDist = d; // nothing in the way: follow the zoom exactly
          else viewDist += (d - viewDist) * damp(cfg.occlusionOutRate, dt);
          viewDist = clamp(viewDist, minOcc, d);
          occFree = !hit && viewDist >= d - 0.02;
          if (occFree) viewDist = d;
        }
      }
      const vd = viewDist;
      desired.set(look.x - fx * vd * cp, look.y + vd * sp, look.z - fz * vd * cp);

      // ---- terrain clearance: keep the line of sight and the camera above the snow
      if (world && typeof world.heightAt === 'function') {
        let need = -Infinity;
        for (let i = 0; i < SAMPLE_T.length; i++) {
          const t = SAMPLE_T[i];
          const sx = look.x + (desired.x - look.x) * t;
          const sz = look.z + (desired.z - look.z) * t;
          const h = world.heightAt(sx, sz);
          if (!Number.isFinite(h)) continue;
          const margin = t === 1 ? cfg.clearance : cfg.clearance * 0.6;
          // Line height at t is look.y + (camY - look.y) * t; it must clear h + margin.
          const camY = look.y + (h + margin - look.y) / t;
          if (camY > need) need = camY;
        }
        const liftGoal = Number.isFinite(need) ? Math.max(0, need - desired.y) : 0;
        // Rise quickly, settle back slowly.
        if (snapping) lift = liftGoal;
        else lift += (liftGoal - lift) * damp(liftGoal > lift ? 14 : 2.5, dt);
        desired.y += lift;
        const floor = world.heightAt(desired.x, desired.z);
        if (Number.isFinite(floor) && desired.y < floor + cfg.clearance) desired.y = floor + cfg.clearance;
      }

      // ---- little screen shake (cracker bangs, bonks)
      if (shakeTime > 0) {
        shakeTime = Math.max(0, shakeTime - dt);
        const env = shakeDuration > 0 ? shakeTime / shakeDuration : 0;
        const a = shakeAmount * env * env;
        desired.x += Math.sin(clock * 47.3) * a;
        desired.y += Math.sin(clock * 53.1 + 1.3) * a * 0.7;
        desired.z += Math.sin(clock * 41.7 + 2.1) * a;
      }

      camera.position.copy(desired);
      camera.lookAt(look);

      // ---- see-through: is anything between the lens and Pip right now?
      if (cfg.seeThrough) {
        let blocked = false;
        let inProp = false;
        if (occ && occ.length) {
          for (let i = 0; i < SEE_HEIGHTS.length && !blocked; i++) {
            const ay = target.y + SEE_HEIGHTS[i];
            blocked = firstHit(occ, target.x, ay, target.z, desired.x, desired.y, desired.z, 1, 0.25) < 1;
          }
          for (let i = 0; i < occ.length && !inProp; i++) {
            const o = occ[i];
            const R = o.bR + 0.2;
            if ((desired.x - o.x) ** 2 + (desired.z - o.z) ** 2 > R * R) continue;
            inProp = insideOcc(o, desired.x, desired.y, desired.z, 0.2, 0);
          }
        }
        const goal = blocked ? 1 : 0;
        if (teleported) see = goal;
        else see += (goal - see) * damp(blocked ? cfg.seeThroughInRate : cfg.seeThroughOutRate, dt);
        if (see < 0.01) see = 0;
        if (teleported) inside = inProp ? 1 : 0;
        else inside += ((inProp ? 1 : 0) - inside) * damp(inProp ? 8 : 3, dt);
        const nearFrom = cfg.nearFadeFrom + (cfg.nearFadeInsideFrom - cfg.nearFadeFrom) * inside;
        const nearTo = cfg.nearFadeTo + (cfg.nearFadeInsideTo - cfg.nearFadeTo) * inside;
        SEE_UNIFORMS.pipSeeCam.value.copy(desired);
        SEE_UNIFORMS.pipSeeTarget.value.set(target.x, target.y + 0.8, target.z);
        SEE_UNIFORMS.pipSeeShape.value.set(cfg.seeThroughRadius, see * cfg.seeThroughAmount, cfg.seeThroughMargin, target.y + 0.15);
        SEE_UNIFORMS.pipSeePip.value.set(target.x, target.y, target.z, cfg.seeThroughPipRadius);
        SEE_UNIFORMS.pipSeeNear.value.set(nearFrom, Math.max(nearFrom + 0.05, nearTo));
      }

      // ---- FOV: widened for narrow screens, plus an optional speed kick (opts.speed in m/s)
      if (typeof camera.fov === 'number') {
        const speed = Number.isFinite(opts.speed) ? opts.speed : 0;
        const fovGoal = framing.fov + clamp((speed - 7) / 8, 0, 1) * 7;
        if (snapping) fov = fovGoal;
        fov += (fovGoal - fov) * damp(4, dt);
        if (Math.abs(camera.fov - fov) > 0.01) {
          camera.fov = fov;
          if (typeof camera.updateProjectionMatrix === 'function') camera.updateProjectionMatrix();
        }
      }

      lastYaw = rig.yaw;
      lastPitch = rig.pitch;
      lastDistance = rig.distance;
    },

    // Put the camera straight behind `yaw` on the next update (no glide).
    snapBehind(yaw) {
      if (Number.isFinite(yaw)) {
        yawGoal = wrapAngle(yaw);
        rig.yaw = yawGoal;
      }
      pitchGoal = cfg.pitch;
      rig.pitch = pitchGoal;
      rig.distance = distGoal;
      lastYaw = rig.yaw;
      lastPitch = rig.pitch;
      lastDistance = rig.distance;
      sinceDrag = 99;
      followRamp = 1;
      snapNext = true;
      // A fresh start never begins mid-shake or with a leftover speed FOV kick.
      shakeTime = 0;
      shakeDuration = 0;
      shakeAmount = 0;
      fov = updateFraming().fov;
      if (camera && typeof camera.fov === 'number' && camera.fov !== fov) {
        camera.fov = fov;
        if (typeof camera.updateProjectionMatrix === 'function') camera.updateProjectionMatrix();
      }
    },

    // Extra: short camera shake, e.g. rig.shake(0.25, 0.35) on a cracker bang.
    shake(amount = 0.2, duration = 0.35) {
      if (!(amount > 0) || !(duration > 0)) return;
      const current = shakeDuration > 0 ? shakeAmount * (shakeTime / shakeDuration) : 0;
      if (amount < current) return; // a bigger shake is already running
      shakeAmount = Math.min(amount, 1.5);
      shakeDuration = duration;
      shakeTime = duration;
    },

    // Extra: zoom to a distance (clamped), smoothly.
    setDistance(dist) {
      if (Number.isFinite(dist)) distGoal = clamp(dist, cfg.minDistance, cfg.maxDistance);
    },

    // Extra: the point the camera is currently looking at (do not mutate).
    get lookPoint() {
      return look;
    },

    // Extra: the camera's actual arm length after pulling in for obstacles.
    get viewDistance() {
      return viewDist;
    },

    // Extra: how strongly props hiding Pip are dithered away right now (0..1).
    get seeThrough() {
      return see;
    },
  };

  return rig;
}
