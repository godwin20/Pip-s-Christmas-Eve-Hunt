// The new things on the map, on real generated islands: Pip's Tree, the candy
// canes, the shakable trees and the pets.

import { describe, it, expect, afterAll } from 'vitest';
import * as THREE from 'three';
import { createRng } from '../src/core/rng.js';
import { generateMap } from '../src/world/mapgen.js';
import { createCanes, pickCaneSpots, CANE_TUNING } from '../src/world/canes.js';
import { collectTrees, createShakes } from '../src/world/shakes.js';
import { createCompanions } from '../src/world/companions.js';
import { BAUBLES, TREE_ROWS, TREE_SLOTS } from '../src/game/baubles.js';

const MAPS = [
  { seed: 11, theme: 'classic' },
  { seed: 2024, theme: 'classic' },
  { seed: 77, theme: 'candy' },
];
const built = MAPS.map(({ seed, theme }) => generateMap(createRng(seed).fork('map'), { theme, crackerCount: 15, presentCount: 10 }));
const classic = built[0];

afterAll(() => {
  for (const world of built) world.dispose();
});

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

describe("Pip's Tree", () => {
  const signOf = (world) => world.group.getObjectByName('pipTreeSign');

  it('stands in the square, clear of the sleigh and the view from spawn', () => {
    for (const world of built) {
      const { x, z } = world.pipTree.position;
      expect(Math.hypot(x, z)).toBeGreaterThan(world.sleigh.r + world.pipTree.userData.radius);
      expect(Math.hypot(x, z)).toBeLessThan(9);
      expect(z).toBeLessThan(world.spawn.z - 2); // never between Pip and the camera
      expect(Math.abs(x)).toBeGreaterThan(3); // nor in the line to the sleigh
    }
  });

  it('keeps off the paths, the items and everything solid', () => {
    for (const world of built) {
      const tree = world.pipTree.position;
      const self = world.pipTree.userData.radius;
      for (const path of world.paths) for (const p of path.pts) expect(dist(p, tree)).toBeGreaterThan(2.5);
      for (const s of [...world.crackerSpots, ...world.presentSpots]) expect(dist(s, tree)).toBeGreaterThan(self + 1.5);
      const sign = signOf(world).position;
      const others = world.colliders.filter((c) => dist(c, tree) > 0.01 && dist(c, sign) > 0.01);
      for (const c of others) {
        expect(dist(c, tree) - c.r - self).toBeGreaterThan(0.6);
        expect(dist(c, sign) - c.r).toBeGreaterThan(0.2);
      }
    }
  });

  it('is an obstacle, and the camera knows it as a pine', () => {
    const tree = classic.pipTree;
    expect(tree.name).toBe('pineTree');
    expect(classic.colliders.some((c) => dist(c, tree.position) < 0.01)).toBe(true);
    const p = new THREE.Vector3(tree.position.x + 0.2, 0, tree.position.z);
    classic.resolveCollision(p, 0.6);
    expect(dist(p, tree.position)).toBeGreaterThanOrEqual(tree.userData.radius + 0.6 - 1e-6);
  });

  it('is on the map from its own stream: same seed, same spot', () => {
    const again = generateMap(createRng(MAPS[0].seed).fork('map'), { theme: 'classic', crackerCount: 15, presentCount: 10 });
    expect(again.pipTree.position.x).toBe(classic.pipTree.position.x);
    expect(again.pipTree.position.z).toBe(classic.pipTree.position.z);
    again.dispose();
  });

  it('hangs a sphere per bauble, and nothing at all with none', () => {
    const tree = classic.pipTree;
    const hanging = tree.getObjectByName('pipBaubles');
    expect(tree.userData.spots).toHaveLength(TREE_SLOTS.length);
    expect(TREE_ROWS.reduce((a, b) => a + b)).toBe(TREE_SLOTS.length);
    expect(hanging.count).toBe(0);
    expect(hanging.visible).toBe(false);

    const colours = TREE_SLOTS.map(() => null);
    colours[0] = '#d7263d';
    colours[11] = '#ffd93d';
    tree.userData.setBaubles(colours);
    expect(hanging.count).toBe(2);
    expect(hanging.visible).toBe(true);
    const m = new THREE.Matrix4();
    const at = new THREE.Vector3();
    hanging.getMatrixAt(1, m);
    expect(at.setFromMatrixPosition(m).distanceTo(tree.userData.spots[11])).toBeLessThan(1e-6);

    tree.userData.setBaubles(TREE_SLOTS.map(() => null));
    expect(hanging.count).toBe(0);
    expect(hanging.visible).toBe(false);
  });
});

describe('candy canes on the map', () => {
  it('are about a dozen, on dry reachable land away from spawn and the items', () => {
    MAPS.forEach(({ seed }, i) => {
      const world = built[i];
      const spots = pickCaneSpots(world, createRng(seed).fork('canes'));
      expect(spots).toHaveLength(CANE_TUNING.count);
      const items = [...world.crackerSpots, ...world.presentSpots];
      spots.forEach((s, k) => {
        expect(dist(s, world.spawn)).toBeGreaterThanOrEqual(CANE_TUNING.minFromSpawn);
        expect(world.isReachable(s.x, s.z)).toBe(true);
        expect(world.isIce(s.x, s.z)).toBe(false);
        for (const it of items) expect(dist(s, it)).toBeGreaterThanOrEqual(CANE_TUNING.clearOfItems);
        for (const other of spots.slice(k + 1)) expect(dist(s, other)).toBeGreaterThanOrEqual(3);
      });
    });
  });

  it('come from their own stream, so a seed always gives the same ones', () => {
    const a = pickCaneSpots(classic, createRng(5).fork('canes'));
    const b = pickCaneSpots(classic, createRng(5).fork('canes'));
    expect(b).toEqual(a);
  });

  it('are no obstacle, shatter once and leave the scene with the map', () => {
    const scene = new THREE.Scene();
    const count = classic.colliders.length;
    const canes = createCanes(scene, classic, createRng(9).fork('canes'));
    expect(classic.colliders.length).toBe(count);
    const cane = canes.list[0];
    expect(canes.nearest(new THREE.Vector3(cane.x + 1, 0, cane.z), 2.4)).toBe(cane);
    expect(canes.smash(cane).x).toBe(cane.x);
    expect(canes.smash(cane)).toBe(null);
    expect(canes.aliveCount).toBe(canes.list.length - 1);
    expect(canes.nearest(new THREE.Vector3(cane.x, 0, cane.z), 0.5)).toBe(null);
    for (let i = 0; i < 90; i++) canes.update(1 / 60, i / 60, new THREE.Vector3(cane.x, 0, cane.z));
    expect(scene.getObjectByName('sugarShards').visible).toBe(false);
    canes.dispose();
    expect(scene.getObjectByName('candyCanes')).toBeUndefined();
  });
});

describe('shakable trees', () => {
  it('are the pines and lollipop trees, with the forest counted one by one', () => {
    const trees = collectTrees(classic);
    expect(trees.filter((t) => t.group).length).toBe(classic.pines.length);
    const forestCount = classic.forest.children.reduce((n, im) => n + im.count, 0);
    expect(trees.filter((t) => t.mesh).length).toBe(forestCount);
    for (const t of trees) {
      expect(classic.colliders.some((c) => dist(c, t) < 0.01 && Math.abs(c.r - t.r) < 0.01)).toBe(true);
      expect(t.top).toBeGreaterThan(t.y + 2);
    }
    const candy = built[2];
    expect(collectTrees(candy).filter((t) => t.group).length).toBe(candy.pines.length + candy.lollipops.length);
  });

  it('leave out the decorated trees and Pip\'s Tree', () => {
    const near = collectTrees(classic).filter((t) => Math.hypot(t.x, t.z) < 12);
    expect(near).toEqual([]);
  });

  it('put a forest pine back exactly after the wobble', () => {
    const shakes = createShakes(new THREE.Scene(), classic, null);
    const tree = shakes.trees.find((t) => t.mesh);
    const before = new THREE.Matrix4();
    const during = new THREE.Matrix4();
    tree.mesh.getMatrixAt(tree.index, before);
    expect(shakes.shake(tree, new THREE.Vector3(tree.x + 2, 0, tree.z))).toBe(true);
    expect(shakes.shake(tree, new THREE.Vector3())).toBe(false);
    shakes.update(0.05, 0);
    tree.mesh.getMatrixAt(tree.index, during);
    expect(during.equals(before)).toBe(false);
    for (let i = 0; i < 40; i++) shakes.update(0.05, i);
    tree.mesh.getMatrixAt(tree.index, during);
    expect(during.equals(before)).toBe(true);
    shakes.dispose();
  });

  it('stand a group tree back up after the wobble', () => {
    const shakes = createShakes(new THREE.Scene(), classic, null);
    const tree = shakes.trees.find((t) => t.group);
    const yaw = tree.group.rotation.y;
    shakes.shake(tree, new THREE.Vector3(tree.x, 0, tree.z + 2));
    shakes.update(0.05, 0);
    expect(tree.group.rotation.x).not.toBe(0);
    for (let i = 0; i < 40; i++) shakes.update(0.05, i);
    expect(tree.group.rotation.x).toBe(0);
    expect(tree.group.rotation.z).toBe(0);
    expect(tree.group.rotation.y).toBe(yaw);
    shakes.dispose();
  });

  it('drop a bauble that lands near Pip, on open snow, a step away', () => {
    const scene = new THREE.Scene();
    const shakes = createShakes(scene, classic, { sparkles: () => {} });
    for (const tree of shakes.trees.slice(0, 40)) {
      const pip = new THREE.Vector3(tree.x + tree.r + 0.8, 0, tree.z);
      classic.resolveCollision(pip, 0.6);
      const drop = shakes.dropBauble(tree, BAUBLES[0], pip);
      expect(shakes.touching(drop.group.position, 5)).toBe(null);
      for (let i = 0; i < 300 && !drop.resting; i++) shakes.update(1 / 60, i / 60);
      expect(drop.resting).toBe(true);
      const p = drop.group.position;
      expect(classic.clearanceAt(p.x, p.z, 1)).toBeGreaterThanOrEqual(0.4);
      expect(dist(p, pip)).toBeLessThan(4.5);
      expect(p.y).toBeGreaterThan(classic.heightAt(p.x, p.z));
      expect(shakes.touching(p, 1)).toBe(drop);
      expect(shakes.take(drop)).not.toBe(null);
      expect(shakes.take(drop)).toBe(null);
    }
    expect(shakes.drops).toHaveLength(0);
    shakes.dispose();
    expect(scene.getObjectByName('treeDrops')).toBeUndefined();
  });
});

describe('pets', () => {
  function cast({ stats = {}, collectables } = {}) {
    const sounds = [];
    const scene = new THREE.Scene();
    const ctx = {
      save: { pets: { puppy: 5 } },
      stats,
      world: classic,
      player: { position: new THREE.Vector3(0, 0, 8.5), facing: Math.PI },
      sfx: { play: (n) => sounds.push(n) },
      collectables,
      toast: () => {},
    };
    return { ctx, sounds, scene, companions: createCompanions(scene, ctx) };
  }

  const vertices = (o) => {
    let n = 0;
    o.traverse((c) => {
      if (c.isMesh && c.geometry.attributes.position) n += c.geometry.attributes.position.count;
    });
    return n;
  };

  it('come along with their own model, sound and bubble', () => {
    const { companions, sounds, scene } = cast();
    for (const [id, name, sound] of [
      ['kitten', 'frostKitten', 'meow'],
      ['reindeer', 'babyReindeer', 'bleat'],
      ['penguin', 'penguinChick', 'cheep'],
    ]) {
      companions.spawnPet(id, 1);
      expect(companions.petId).toBe(id);
      expect(scene.getObjectByName(name)).toBeDefined();
      expect(sounds.at(-1)).toBe(sound);
    }
    companions.dispose();
  });

  it('are alone in their place: a new pet replaces the old', () => {
    const { companions, scene } = cast();
    companions.spawnPet('kitten', 1);
    companions.spawnPet('penguin', 1);
    expect(scene.getObjectByName('frostKitten')).toBeUndefined();
    expect(companions.activeCount).toBe(1);
    companions.spawnPet('puppy', 1); // the puppy has its own path
    expect(companions.petId).toBe('penguin');
    companions.dispose();
  });

  it('wear a gold bow at level 5', () => {
    const { companions, scene } = cast();
    for (const [id, name] of [
      ['kitten', 'frostKitten'],
      ['reindeer', 'babyReindeer'],
      ['penguin', 'penguinChick'],
    ]) {
      companions.spawnPet(id, 4);
      const plain = vertices(scene.getObjectByName(name));
      companions.spawnPet(id, 5);
      expect(vertices(scene.getObjectByName(name))).toBeGreaterThan(plain);
    }
    companions.dispose();

    const plainPuppy = cast();
    plainPuppy.ctx.save.pets.puppy = 4;
    plainPuppy.companions.spawnPuppy();
    const shownPlain = vertices(plainPuppy.scene.getObjectByName('snowPuppy'));
    plainPuppy.companions.dispose();
    const bowPuppy = cast();
    bowPuppy.companions.spawnPuppy();
    expect(vertices(bowPuppy.scene.getObjectByName('snowPuppy'))).toBeGreaterThan(shownPlain);
    bowPuppy.companions.dispose();
  });

  // Followers trail behind Pip, so the camera mostly sees their backs. Parallel
  // rays from up there: how many reach something gold first?
  function goldFromBehind(companions, group) {
    companions.update(1 / 60, 1);
    group.updateMatrixWorld(true);
    const meshes = [];
    group.traverse((c) => {
      if (c.isMesh) meshes.push(c);
    });
    const turn = group.getWorldQuaternion(new THREE.Quaternion());
    const dir = new THREE.Vector3(0, -0.55, 0.83).normalize().applyQuaternion(turn);
    const ray = new THREE.Raycaster();
    let gold = 0;
    for (let x = -0.4; x <= 0.4; x += 0.02) {
      for (let y = 0; y <= 1.5; y += 0.02) {
        const aim = group.localToWorld(new THREE.Vector3(x, y, 0));
        ray.set(aim.clone().addScaledVector(dir, -5), dir);
        const [first] = ray.intersectObjects(meshes, false);
        if (first && first.object.material.color.getHex() === 0xffc94a) gold++;
      }
    }
    return gold;
  }

  it('show their bow to the camera behind them', () => {
    const { companions, scene } = cast();
    for (const [id, name] of [
      ['kitten', 'frostKitten'],
      ['reindeer', 'babyReindeer'],
      ['penguin', 'penguinChick'],
    ]) {
      const grown = (level) => {
        companions.spawnPet(id, level);
        const group = scene.getObjectByName(name);
        for (let i = 0; i < 40; i++) companions.update(1 / 60, i / 60); // past the pop-in
        return goldFromBehind(companions, group);
      };
      const before = grown(4);
      expect(grown(5)).toBeGreaterThan(before + 20);
    }
    companions.dispose();
  });

  it('stay cheap to draw: every shape bakes down', () => {
    const { companions, scene } = cast();
    for (const [id, name] of [
      ['kitten', 'frostKitten'],
      ['reindeer', 'babyReindeer'],
      ['penguin', 'penguinChick'],
    ]) {
      companions.spawnPet(id, 5);
      let meshes = 0;
      scene.getObjectByName(name).traverse((c) => {
        if (c.isMesh) meshes++;
      });
      expect(meshes).toBeLessThanOrEqual(23);
    }
    companions.dispose();
  });

  it('follow Pip on the other side from the puppy', () => {
    const { companions, ctx, scene } = cast();
    companions.spawnPuppy();
    companions.spawnPet('reindeer', 2);
    const run = (frames) => {
      for (let i = 0; i < frames; i++) {
        ctx.player.position.z -= 0.05;
        companions.update(1 / 60, i / 60);
      }
    };
    ctx.player.position.set(-40, 0, 60);
    run(240);
    const puppy = scene.getObjectByName('snowPuppy').position;
    const fawn = scene.getObjectByName('babyReindeer').position;
    expect(dist(fawn, ctx.player.position)).toBeLessThan(5);
    expect(dist(puppy, ctx.player.position)).toBeLessThan(5);
    expect(dist(fawn, puppy)).toBeGreaterThan(0.8);
    companions.dispose();
  });

  it('cheer only for the pet that was asked for, and say where they are', () => {
    const { companions, sounds } = cast();
    companions.spawnPet('kitten', 1);
    sounds.length = 0;
    expect(companions.cheerPet('penguin')).toBe(null);
    expect(sounds).toEqual([]);
    expect(companions.cheerPet('kitten').isVector3).toBe(true);
    expect(sounds).toEqual(['meow']);
    companions.removePet();
    expect(companions.cheerPet('kitten')).toBe(null);
    companions.dispose();
  });

  it('go home at the end of the night', () => {
    const { companions, scene } = cast();
    companions.spawnPuppy();
    companions.spawnPet('penguin', 5);
    companions.update(1 / 60, 0);
    companions.clear();
    expect(companions.petId).toBe(null);
    expect(companions.hasPuppy).toBe(false);
    expect(scene.getObjectByName('penguinChick')).toBeUndefined();
    companions.dispose();
  });

  it('let a friendlier puppy sniff further', () => {
    let range = 0;
    const collectables = {
      nearest(pos, opts) {
        range = opts.maxDist;
        return null;
      },
    };
    const { companions } = cast({ stats: { sniffMult: 1.6 }, collectables });
    companions.spawnPuppy();
    for (let i = 0; i < 180; i++) companions.update(1 / 60, i / 60);
    expect(range).toBeCloseTo(12 * 1.6);
    companions.dispose();
  });
});
