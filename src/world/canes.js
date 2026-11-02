// Breakable candy canes stuck in the snow around the island (not the big
// candy-cane lamps). Presentation only, like companions.js: this file places
// them, wiggles them near Pip and shatters them into sugar shards. The candy
// itself is handed out by game/treats.js.
//
// Draw-call budget: one InstancedMesh of canes, one Points glint on top of them
// and one InstancedMesh of shards while any are flying. The per-frame update
// does not allocate and writes nothing while Pip is nowhere near a cane.

import * as THREE from 'three';
import { toon } from './materials.js';
import { makeSmallCaneGeometry } from './props.js';
import { getSoftGlowTexture } from './effects.js';
import { prefersCalm } from '../core/motion.js';

export const CANE_TUNING = {
  count: 12,
  minFromSpawn: 16, // metres; the square stays tidy and the first ones need finding
  spacing: 9, // metres between canes (relaxed if the island is crowded)
  clearOfItems: 3.2, // metres from crackers and presents, so prompts never fight
  wiggleRange: 4.5,
  tries: 40, // spot picks per cane
};

const T = CANE_TUNING;
const TAU = Math.PI * 2;
const SHARD_CAP = 24; // up to four canes shattering at once
const SHARDS_PER_CANE = 6;
const SHARD_LIFE = 0.75;
const GRAVITY = 11;
const GLINT_HEIGHT = 0.86;
const OUT_OF_SIGHT = -50;

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3(1, 1, 1);
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);

// Where tonight's canes go: all reachable dry land, spread out and away from
// spawn and from the items. Takes its own rng stream, so nothing else shifts.
export function pickCaneSpots(world, rng, count = T.count) {
  const spots = [];
  const items = [...(world.crackerSpots || []), ...(world.presentSpots || [])];
  const near = (list, x, z, d) => list.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < d * d);
  for (const spacing of [T.spacing, T.spacing * 0.6, 3]) {
    for (let i = 0; i < count * T.tries && spots.length < count; i++) {
      const { x, z } = world.randomFreeSpot(rng, T.minFromSpawn);
      if (world.isIce && world.isIce(x, z)) continue;
      if (near(items, x, z, T.clearOfItems) || near(spots, x, z, spacing)) continue;
      spots.push({ x, z });
    }
    if (spots.length >= count) break;
  }
  return spots;
}

function caneMaterial() {
  return toon(0xffffff, { vertexColors: true });
}

// An angular little sugar crumb. Shared by every map, like the toon materials.
let shardGeo = null;
function shardGeometry() {
  if (!shardGeo) {
    shardGeo = new THREE.TetrahedronGeometry(0.1);
    shardGeo.userData.keep = true;
  }
  return shardGeo;
}

export function createCanes(scene, world, rng, { count = T.count } = {}) {
  const calm = prefersCalm();
  const root = new THREE.Group();
  root.name = 'candyCanes';
  scene.add(root);

  const spots = pickCaneSpots(world, rng, count);
  const list = spots.map((s, i) => ({
    id: i,
    x: s.x,
    y: world.heightAt(s.x, s.z) - 0.06,
    z: s.z,
    yaw: rng.range(0, TAU),
    leanX: rng.range(-0.14, 0.14),
    leanZ: rng.range(-0.14, 0.14),
    phase: rng.range(0, TAU),
    alive: true,
    wiggling: false,
    position: new THREE.Vector3(s.x, 0, s.z),
  }));
  for (const c of list) c.position.y = c.y;

  const geometry = makeSmallCaneGeometry();
  const mesh = new THREE.InstancedMesh(geometry, caneMaterial(), Math.max(1, list.length));
  mesh.name = 'caneInstances';
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.count = list.length;

  function pose(c, wiggle) {
    _e.set(c.leanX + wiggle, c.yaw, c.leanZ + wiggle * 0.6, 'YXZ');
    _q.setFromEuler(_e);
    _p.set(c.x, c.y, c.z);
    _s.set(1, 1, 1);
    mesh.setMatrixAt(c.id, _m.compose(_p, _q, _s));
  }
  for (const c of list) pose(c, 0);
  mesh.instanceMatrix.needsUpdate = true;
  root.add(mesh);

  // a soft twinkle over each cane, so they can be spotted across the snow
  const glintPos = new Float32Array(list.length * 3);
  list.forEach((c, i) => {
    glintPos[i * 3] = c.x;
    glintPos[i * 3 + 1] = c.y + GLINT_HEIGHT;
    glintPos[i * 3 + 2] = c.z;
  });
  const glintGeo = new THREE.BufferGeometry();
  glintGeo.setAttribute('position', new THREE.BufferAttribute(glintPos, 3));
  const glintMat = new THREE.PointsMaterial({
    map: getSoftGlowTexture(),
    color: 0xffd6e4,
    size: 1.15,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glints = new THREE.Points(glintGeo, glintMat);
  glints.name = 'caneGlints';
  glints.frustumCulled = false;
  root.add(glints);

  // sugar shards: created with the map, hidden until something shatters
  const shardMesh = new THREE.InstancedMesh(shardGeometry(), toon(0xffffff), SHARD_CAP);
  shardMesh.name = 'sugarShards';
  shardMesh.frustumCulled = false;
  shardMesh.visible = false;
  const shardColour = new THREE.Color();
  for (let i = 0; i < SHARD_CAP; i++) {
    shardMesh.setMatrixAt(i, _zero);
    shardMesh.setColorAt(i, shardColour.set(i % 2 ? 0xffffff : 0xe8192c));
  }
  root.add(shardMesh);
  const shards = [];
  for (let i = 0; i < SHARD_CAP; i++) {
    shards.push({ live: false, age: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ax: 0, ay: 0, spin: 0, floor: 0 });
  }
  let liveShards = 0;
  let nextShard = 0;

  function burst(c) {
    const n = calm ? Math.floor(SHARDS_PER_CANE / 2) : SHARDS_PER_CANE;
    for (let k = 0; k < n; k++) {
      const s = shards[nextShard];
      if (!s.live) liveShards++;
      nextShard = (nextShard + 1) % SHARD_CAP;
      const a = (k / n) * TAU + Math.random() * 0.7;
      const sp = 1.4 + Math.random() * 1.8;
      s.live = true;
      s.age = 0;
      s.x = c.x;
      s.y = c.y + 0.25 + Math.random() * 0.5;
      s.z = c.z;
      s.vx = Math.cos(a) * sp;
      s.vz = Math.sin(a) * sp;
      s.vy = 2.4 + Math.random() * 2.4;
      s.ax = Math.random() * TAU;
      s.ay = Math.random() * TAU;
      s.spin = 6 + Math.random() * 9;
      s.floor = c.y + 0.08;
    }
    shardMesh.visible = true;
  }

  function updateShards(dt) {
    if (!liveShards) return;
    for (let i = 0; i < SHARD_CAP; i++) {
      const s = shards[i];
      if (!s.live) continue;
      s.age += dt;
      if (s.age >= SHARD_LIFE) {
        s.live = false;
        liveShards--;
        shardMesh.setMatrixAt(i, _zero);
        continue;
      }
      s.vy -= GRAVITY * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (s.y < s.floor) {
        s.y = s.floor;
        s.vy = Math.abs(s.vy) * 0.3;
        s.vx *= 0.5;
        s.vz *= 0.5;
      }
      s.ax += s.spin * dt;
      s.ay += s.spin * 0.7 * dt;
      _e.set(s.ax, s.ay, 0, 'YXZ');
      _q.setFromEuler(_e);
      const k = s.age / SHARD_LIFE;
      const size = 1 - k * k;
      _p.set(s.x, s.y, s.z);
      _s.set(size, size, size);
      shardMesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    shardMesh.instanceMatrix.needsUpdate = true;
    if (!liveShards) shardMesh.visible = false;
  }

  // The nearest whole cane within maxDist of pos, or null.
  function nearest(pos, maxDist = Infinity) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c.alive) continue;
      const d = (c.x - pos.x) ** 2 + (c.z - pos.z) ** 2;
      if (d <= bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  // Shatters a cane. Returns the spot for the caller's rewards and sparkles
  // (a fresh Vector3, safe to keep), or null if it was already gone.
  function smash(c) {
    if (!c || !c.alive) return null;
    c.alive = false;
    mesh.setMatrixAt(c.id, _zero);
    mesh.instanceMatrix.needsUpdate = true;
    glintPos[c.id * 3 + 1] = OUT_OF_SIGHT;
    glintGeo.attributes.position.needsUpdate = true;
    burst(c);
    return new THREE.Vector3(c.x, c.y + 0.45, c.z);
  }

  function update(dt, time, playerPos) {
    if (!calm) glintMat.opacity = 0.5 + 0.28 * Math.sin(time * 2.3);
    let dirty = false;
    if (!calm && playerPos) {
      const range = T.wiggleRange * T.wiggleRange;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (!c.alive) continue;
        const near = (c.x - playerPos.x) ** 2 + (c.z - playerPos.z) ** 2 < range;
        if (near) {
          pose(c, Math.sin(time * 9 + c.phase) * 0.07);
          c.wiggling = true;
          dirty = true;
        } else if (c.wiggling) {
          pose(c, 0);
          c.wiggling = false;
          dirty = true;
        }
      }
    }
    if (dirty) mesh.instanceMatrix.needsUpdate = true;
    updateShards(dt);
  }

  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.remove(root);
    geometry.dispose();
    mesh.dispose();
    shardMesh.dispose();
    glintGeo.dispose();
    glintMat.dispose();
  }

  return {
    list,
    root,
    get aliveCount() {
      return list.filter((c) => c.alive).length;
    },
    nearest,
    smash,
    update,
    dispose,
  };
}
