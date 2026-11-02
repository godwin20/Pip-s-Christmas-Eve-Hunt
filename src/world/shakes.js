// Trees that can be shaken, and the baubles that fall out of them. Presentation
// only: this file wobbles a tree and bounces a bauble, while game/treats.js
// decides what falls and hands out the rewards.
//
// Pines and lollipop trees all count. The forest is one big InstancedMesh per
// shape, so a forest pine wobbles by rewriting its own instance matrix, and only
// while it wobbles. Nothing here runs per tree per frame except nearest(),
// which is a plain distance loop.

import * as THREE from 'three';
import { getSoftGlowTexture } from './effects.js';
import { prefersCalm } from '../core/motion.js';

const WOBBLE_SECONDS = 0.95;
const WOBBLE_ANGLE = 0.085;
const WOBBLE_RATE = 21;
const GRAVITY = 15;
const REST_HEIGHT = 0.3; // a bauble sits this far above the snow
const BOUNCE = 0.52;
const BOUNCE_STOP = 1.5; // m/s; slower than this and it settles
const SPARKLE_EVERY = 0.85;
const DROP_RADIUS = 0.22;
const LAND_REACH = 1.25; // metres from the tree's edge
const LAND_TURN = 0.95; // radians around the tree from the line to Pip

const _m = new THREE.Matrix4();
const _tilt = new THREE.Matrix4();
const _axis = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

// One shared ball and cap for every dropped bauble, and one glossy material per
// colour: all of it lasts the whole session, like the cached toon materials.
let ballGeo = null;
let capGeo = null;
let capMat = null;
const glossy = new Map();

function dropParts() {
  if (!ballGeo) {
    ballGeo = new THREE.SphereGeometry(DROP_RADIUS, 16, 12);
    ballGeo.userData.keep = true;
    capGeo = new THREE.CylinderGeometry(0.05, 0.065, 0.07, 8);
    capGeo.userData.keep = true;
    capMat = new THREE.MeshPhongMaterial({ color: 0xffc94a, shininess: 90, specular: 0xfff0c0 });
  }
}

function glossyMaterial(colour) {
  let m = glossy.get(colour);
  if (!m) {
    m = new THREE.MeshPhongMaterial({ color: colour, shininess: 130, specular: 0xffffff, emissive: colour, emissiveIntensity: 0.12 });
    glossy.set(colour, m);
  }
  return m;
}

// Every tree on the map that can shake, as plain records.
export function collectTrees(world) {
  const trees = [];
  const addGroup = (g) => {
    trees.push({
      x: g.position.x,
      z: g.position.z,
      y: g.position.y,
      r: g.userData.radius,
      top: (g.userData.height || 5) + g.position.y,
      group: g,
      mesh: null,
      index: -1,
      shaken: false,
    });
  };
  for (const g of world.pines || []) addGroup(g);
  for (const g of world.lollipops || []) addGroup(g);
  const forest = world.forest;
  if (forest) {
    for (const im of forest.children) {
      if (!im.isInstancedMesh) continue;
      if (!im.geometry.boundingBox) im.geometry.computeBoundingBox();
      const h = im.geometry.boundingBox.max.y;
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, _m);
        _m.decompose(_p, _q, _s);
        trees.push({ x: _p.x, z: _p.z, y: _p.y, r: 0.78 * _s.x, top: _p.y + h * _s.y, group: null, mesh: im, index: i, shaken: false });
      }
    }
  }
  return trees;
}

export function createShakes(scene, world, effects) {
  const calm = prefersCalm();
  const trees = collectTrees(world);
  const wobbling = []; // { tree, t, dx, dz, base: forest instance's resting matrix }
  const drops = []; // baubles falling or lying in the snow
  const root = new THREE.Group();
  root.name = 'treeDrops';
  scene.add(root);
  const glowMat = new THREE.SpriteMaterial({
    map: getSoftGlowTexture(),
    color: 0xffffff,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });

  // The nearest tree not shaken tonight, within maxDist of pos, or null.
  function nearest(pos, maxDist = Infinity) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      if (t.shaken) continue;
      const d = (t.x - pos.x) ** 2 + (t.z - pos.z) ** 2;
      if (d <= bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  // Starts the wobble, leaning away from `from` first. False if the tree has
  // already been shaken tonight.
  function shake(tree, from) {
    if (!tree || tree.shaken) return false;
    tree.shaken = true;
    const dx = tree.x - (from ? from.x : tree.x);
    const dz = tree.z - (from ? from.z : tree.z + 1);
    const d = Math.hypot(dx, dz) || 1;
    const base = tree.mesh ? new THREE.Matrix4() : null;
    if (base) tree.mesh.getMatrixAt(tree.index, base);
    wobbling.push({ tree, t: 0, dx: dx / d, dz: dz / d, base });
    return true;
  }

  function endWobble(w) {
    if (w.tree.group) {
      w.tree.group.rotation.x = 0;
      w.tree.group.rotation.z = 0;
    } else {
      w.tree.mesh.setMatrixAt(w.tree.index, w.base);
      w.tree.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  function updateWobbles(dt) {
    for (let i = wobbling.length - 1; i >= 0; i--) {
      const w = wobbling[i];
      w.t += dt;
      if (w.t >= WOBBLE_SECONDS) {
        endWobble(w);
        wobbling.splice(i, 1);
        continue;
      }
      const fade = 1 - w.t / WOBBLE_SECONDS;
      const a = Math.sin(w.t * WOBBLE_RATE) * WOBBLE_ANGLE * (calm ? 0.35 : 1) * fade * fade;
      if (w.tree.group) {
        w.tree.group.rotation.x = a * w.dz;
        w.tree.group.rotation.z = -a * w.dx;
      } else {
        // leans around its own foot: the instance's origin is at the base, and
        // the tilt goes on top of its turn and scale, in world directions
        _axis.set(w.dz, 0, -w.dx);
        _tilt.makeRotationAxis(_axis, a);
        _m.copy(w.base);
        const px = _m.elements[12];
        const py = _m.elements[13];
        const pz = _m.elements[14];
        _m.setPosition(0, 0, 0).premultiply(_tilt).setPosition(px, py, pz);
        w.tree.mesh.setMatrixAt(w.tree.index, _m);
        w.tree.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  // A bauble falls out of the tree on Pip's side, a step to his left or right,
  // so it can be seen landing and he has to go and get it. `bauble` is an entry
  // of BAUBLES; game code picked it.
  function dropBauble(tree, bauble, towards) {
    dropParts();
    const turn = (Math.random() < 0.5 ? -1 : 1) * LAND_TURN;
    const away = Math.atan2(towards.x - tree.x, towards.z - tree.z) + turn;
    const dx = Math.sin(away);
    const dz = Math.cos(away);
    const reach = tree.r + LAND_REACH;
    const land = new THREE.Vector3(tree.x + dx * reach, 0, tree.z + dz * reach);
    if (world.resolveCollision) world.resolveCollision(land, DROP_RADIUS + 0.25);
    const floor = world.heightAt(land.x, land.z) + REST_HEIGHT;

    const group = new THREE.Group();
    group.name = 'droppedBauble';
    const ball = new THREE.Mesh(ballGeo, glossyMaterial(bauble.colours[0]));
    ball.castShadow = true;
    group.add(ball);
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = DROP_RADIUS + 0.02;
    group.add(cap);
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(1.3);
    group.add(glow);
    const startY = Math.max(floor + 1.2, tree.y + Math.min(3.4, (tree.top - tree.y) * 0.55));
    const startX = tree.x + dx * (tree.r + 0.3);
    const startZ = tree.z + dz * (tree.r + 0.3);
    group.position.set(startX, startY, startZ);
    root.add(group);
    const fall = Math.sqrt((2 * Math.max(0.1, startY - floor)) / GRAVITY);
    const drop = {
      bauble,
      group,
      glow,
      position: group.position,
      startX,
      startZ,
      landX: land.x,
      landZ: land.z,
      floor,
      fall,
      vy: 0,
      t: 0,
      resting: false,
      restT: 0,
      sparkleT: 0.3,
    };
    drops.push(drop);
    return drop;
  }

  function updateDrops(dt, time) {
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      const p = d.group.position;
      if (!d.resting) {
        d.t += dt;
        const k = Math.min(1, d.t / d.fall);
        p.x = d.startX + (d.landX - d.startX) * k;
        p.z = d.startZ + (d.landZ - d.startZ) * k;
        d.vy -= GRAVITY * dt;
        p.y += d.vy * dt;
        if (p.y <= d.floor) {
          p.y = d.floor;
          d.vy = calm ? 0 : -d.vy * BOUNCE;
          if (d.vy < BOUNCE_STOP) {
            d.resting = true;
            p.x = d.landX;
            p.z = d.landZ;
          }
        }
        continue;
      }
      d.restT += dt;
      if (!calm) {
        d.group.rotation.y = time * 1.4;
        p.y = d.floor + Math.sin(d.restT * 2.6) * 0.04;
      }
      d.glow.scale.setScalar(1.15 + 0.3 * Math.sin(time * 4.2 + i));
      d.sparkleT -= dt;
      if (d.sparkleT <= 0) {
        d.sparkleT = SPARKLE_EVERY;
        if (effects) effects.sparkles(p, d.bauble.colours[1], 3);
      }
    }
  }

  // A settled bauble within reach of pos, or null. Still falling ones can't be
  // picked up: they should be seen to land first.
  function touching(pos, reach) {
    const r2 = reach * reach;
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      if (!d.resting) continue;
      const p = d.group.position;
      if ((p.x - pos.x) ** 2 + (p.z - pos.z) ** 2 <= r2) return d;
    }
    return null;
  }

  // Removes a bauble from the snow; returns where it was.
  function take(drop) {
    const i = drops.indexOf(drop);
    if (i < 0) return null;
    drops.splice(i, 1);
    root.remove(drop.group);
    return drop.group.position.clone();
  }

  function update(dt, time) {
    if (wobbling.length) updateWobbles(dt);
    if (drops.length) updateDrops(dt, time);
  }

  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    drops.length = 0;
    wobbling.length = 0;
    scene.remove(root);
    glowMat.dispose();
  }

  return {
    trees,
    drops,
    nearest,
    shake,
    dropBauble,
    touching,
    take,
    groundIds: () => drops.map((d) => d.bauble.id),
    update,
    dispose,
  };
}
