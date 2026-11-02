// The night's treats: canes, tree shakes, baubles and the Frost Kitten's coins,
// played on the real world modules over a tiny stand-in map.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createRng } from '../src/core/rng.js';
import { defaultSave } from '../src/core/save.js';
import { computeStats } from '../src/game/upgrades.js';
import { addCandy, spentCandy } from '../src/game/pets.js';
import { BAUBLE_TUNING, getBauble } from '../src/game/baubles.js';
import { applySurprise } from '../src/game/surprises.js';
import { createCanes } from '../src/world/canes.js';
import { createShakes } from '../src/world/shakes.js';
import { TREAT_TUNING, newTreatRun, breakCane, shakeTree, bonkTree, collectDrop, updateTreatPrompt, updateTreats } from '../src/game/treats.js';

function pine(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.userData.radius = 0.8;
  g.userData.height = 6;
  return g;
}

function tinyWorld() {
  const spots = [[20, 0], [40, 0], [0, 30], [0, 50], [-30, 0], [-50, 0], [0, -30], [0, -50], [30, 30], [-30, -30], [30, -30], [-30, 30]];
  let next = 0;
  return {
    pines: Array.from({ length: 16 }, (_, i) => pine(i * 10 + 100, 100)),
    lollipops: [],
    forest: null,
    heightAt: () => 0,
    resolveCollision: (p) => p,
    randomFreeSpot: () => {
      const [x, z] = spots[next++ % spots.length];
      return { x, z };
    },
  };
}

function night(save = defaultSave(), { seed = 7 } = {}) {
  const log = { sounds: [], coins: [], toasts: [], banners: [], prompts: [], cheers: [] };
  const world = tinyWorld();
  const scene = new THREE.Scene();
  const effects = { sparkles: () => {} };
  const ctx = {
    save,
    persist: () => {},
    stats: computeStats(save),
    rng: createRng(seed),
    time: 0,
    world,
    player: { position: new THREE.Vector3(), radius: 0.6, sliding: false },
    canes: createCanes(scene, world, createRng(seed + 1)),
    shakes: createShakes(scene, world, effects),
    effects,
    sfx: { play: (n) => log.sounds.push(n) },
    hud: { setPrompt: (t) => log.prompts.push(t) },
    popups: { showSurprise: (def, detail) => log.banners.push({ def, detail }) },
    companions: {
      cheerPet: (id) => {
        log.cheers.push(id);
        return null;
      },
      snowPuff: () => {},
      spawnPuppy: () => {},
      hasPuppy: false,
    },
    toast: (text) => log.toasts.push(text),
    addCoins(n) {
      log.coins.push(n);
      save.coins += n;
      save.coinsEarned += n;
    },
    addCandy(n) {
      ctx.run.candyEarned += addCandy(save, n);
    },
  };
  ctx.run = { timeLeft: 300, ...newTreatRun(ctx) };
  return { ctx, log };
}

function standBy(ctx, thing, gap = 0) {
  ctx.player.position.set(thing.x + gap, 0, thing.z);
}

// Runs the world until a dropped bauble has settled in the snow.
function settle(ctx, drop) {
  for (let i = 0; i < 600 && !drop.resting; i++) ctx.shakes.update(1 / 60, i / 60);
  expect(drop.resting).toBe(true);
}

describe('candy canes', () => {
  it('pays 2 to 4 candy once, and keeps the ledger true', () => {
    const { ctx, log } = night();
    const cane = ctx.canes.list[0];
    const candy = breakCane(ctx, cane);
    expect(candy).toBeGreaterThanOrEqual(2);
    expect(candy).toBeLessThanOrEqual(4);
    expect(ctx.save.candy).toBe(candy);
    expect(ctx.save.candy).toBe(ctx.save.candyEarned - spentCandy(ctx.save.pets));
    expect(ctx.run.candyEarned).toBe(candy);
    expect(ctx.run.canes).toBe(1);
    expect(log.sounds).toContain('crack');
    expect(breakCane(ctx, cane)).toBe(0);
    expect(ctx.run.canes).toBe(1);
  });

  it('gets the Penguin Chick bonus only while the chick comes along', () => {
    const save = defaultSave();
    save.pets = { penguin: 5 };
    const without = night(save);
    expect(breakCane(without.ctx, without.ctx.canes.list[0])).toBeLessThanOrEqual(4);
    save.activePet = 'penguin';
    const { ctx, log } = night(save);
    expect(breakCane(ctx, ctx.canes.list[0])).toBeGreaterThanOrEqual(5);
    expect(log.cheers).toContain('penguin');
  });

  it('cracks with interact only when asked, within reach', () => {
    const { ctx, log } = night();
    const cane = ctx.canes.list[0];
    standBy(ctx, cane, TREAT_TUNING.caneReach - 0.1);
    updateTreatPrompt(ctx, false);
    expect(log.prompts.at(-1)).toBe('Press E to crack the candy cane! 🍬');
    expect(cane.alive).toBe(true);
    updateTreatPrompt(ctx, true);
    expect(cane.alive).toBe(false);
    updateTreatPrompt(ctx, false);
    expect(log.prompts.at(-1)).toBe(null);
  });

  it('breaks under a belly-slide, but not a walk past', () => {
    const { ctx } = night();
    const cane = ctx.canes.list[0];
    standBy(ctx, cane, TREAT_TUNING.slideReach - 0.1);
    updateTreats(ctx);
    expect(cane.alive).toBe(true);
    ctx.player.sliding = true;
    updateTreats(ctx);
    expect(cane.alive).toBe(false);
  });

  it('stops giving candy once morning comes', () => {
    const { ctx } = night();
    const cane = ctx.canes.list[0];
    standBy(ctx, cane);
    ctx.player.sliding = true;
    ctx.run.timeLeft = 0;
    updateTreats(ctx);
    expect(cane.alive).toBe(true);
  });
});

describe('shaking trees', () => {
  it('prefers a cane over a tree, and prompts for a tree that has not been shaken', () => {
    const { ctx, log } = night();
    const tree = ctx.shakes.trees[0];
    standBy(ctx, tree, TREAT_TUNING.shakeReach - 0.1);
    updateTreatPrompt(ctx, false);
    expect(log.prompts.at(-1)).toBe('Press E to shake the tree! 🌲');
    updateTreatPrompt(ctx, true);
    expect(tree.shaken).toBe(true);
    updateTreatPrompt(ctx, false);
    expect(log.prompts.at(-1)).toBe(null);

    const cane = ctx.canes.list[0];
    cane.x = ctx.shakes.trees[1].x;
    cane.z = ctx.shakes.trees[1].z;
    standBy(ctx, cane, 1);
    updateTreatPrompt(ctx, true);
    expect(cane.alive).toBe(false);
    expect(ctx.shakes.trees[1].shaken).toBe(false);
  });

  it('shakes each tree once a night', () => {
    const { ctx } = night();
    const tree = ctx.shakes.trees[0];
    shakeTree(ctx, tree);
    const tally = { ...ctx.run.shakeTally };
    expect(tree.shaken).toBe(true);
    expect(shakeTree(ctx, tree)).toBe(null);
    expect(ctx.run.shakeTally).toEqual(tally);
  });

  it('never drops more than the nightly limit, and repeats no design in one night', () => {
    const { ctx } = night();
    const drops = ctx.shakes.trees.map((t) => shakeTree(ctx, t)).filter(Boolean);
    expect(drops).toHaveLength(BAUBLE_TUNING.maxPerNight);
    expect(new Set(drops.map((d) => d.bauble.id)).size).toBe(drops.length);
    for (const d of drops) expect(d.bauble.id).not.toBe('goldenStar');
  });

  it('counts a slide into a tree as a shake, but not a bonk on something further off', () => {
    const { ctx } = night();
    const tree = ctx.shakes.trees[0];
    standBy(ctx, tree, tree.r + 0.6 + 0.1);
    bonkTree(ctx);
    expect(tree.shaken).toBe(true);

    const other = ctx.shakes.trees[1];
    standBy(ctx, other, 2.55);
    ctx.player.radius = 0;
    bonkTree(ctx);
    expect(other.shaken).toBe(false);
  });

  it('bonks do nothing once morning comes', () => {
    const { ctx } = night();
    const tree = ctx.shakes.trees[0];
    standBy(ctx, tree, 1.5);
    ctx.run.timeLeft = -1;
    bonkTree(ctx);
    expect(tree.shaken).toBe(false);
  });
});

describe('baubles', () => {
  function firstDrop(ctx) {
    for (const tree of ctx.shakes.trees) {
      standBy(ctx, tree, 1.6);
      const drop = shakeTree(ctx, tree);
      if (drop) return drop;
    }
    throw new Error('nothing fell');
  }

  it('can only be picked up once it has landed', () => {
    const { ctx } = night();
    const drop = firstDrop(ctx);
    ctx.player.position.copy(drop.group.position);
    updateTreats(ctx);
    expect(ctx.save.foundBaubles).toEqual([]);
    settle(ctx, drop);
    ctx.player.position.copy(drop.group.position);
    updateTreats(ctx);
    expect(ctx.save.foundBaubles).toEqual([drop.bauble.id]);
    expect(ctx.shakes.drops).toHaveLength(0);
  });

  it('adds a new design with a banner', () => {
    const { ctx, log } = night();
    const drop = firstDrop(ctx);
    settle(ctx, drop);
    collectDrop(ctx, drop);
    expect(ctx.run.newBaubles).toEqual([drop.bauble]);
    expect(log.banners).toHaveLength(1);
    expect(log.banners[0].def.name).toBe('New bauble!');
    expect(log.banners[0].detail).toContain(drop.bauble.name);
    expect(log.banners[0].detail).not.toMatch(/[—–]/);
    expect(log.coins).toEqual([]);
    expect(log.sounds).toContain('bauble');
  });

  it('pays 3 coins for a repeat, through addCoins', () => {
    const { ctx, log } = night();
    const drop = firstDrop(ctx);
    settle(ctx, drop);
    ctx.save.foundBaubles.push(drop.bauble.id);
    collectDrop(ctx, drop);
    expect(ctx.save.foundBaubles).toEqual([drop.bauble.id]);
    expect(log.coins).toEqual([BAUBLE_TUNING.duplicateCoins]);
    expect(log.banners).toEqual([]);
    expect(ctx.run.newBaubles).toEqual([]);
    expect(log.toasts[0]).toContain(getBauble(drop.bauble.id).name);
  });
});

describe('the Frost Kitten', () => {
  function withKitten(level) {
    const save = defaultSave();
    save.pets = { kitten: level };
    save.activePet = 'kitten';
    return night(save);
  }

  it('brings 2 coins per level every 40 seconds', () => {
    const { ctx, log } = withKitten(3);
    ctx.time = 39.9;
    updateTreats(ctx);
    expect(log.coins).toEqual([]);
    ctx.time = 40;
    updateTreats(ctx);
    updateTreats(ctx);
    expect(log.coins).toEqual([6]);
    expect(log.cheers).toEqual(['kitten']);
    ctx.time = 80;
    updateTreats(ctx);
    expect(log.coins).toEqual([6, 6]);
  });

  it('brings nothing if it stayed at home', () => {
    const save = defaultSave();
    save.pets = { kitten: 5 };
    const { ctx, log } = night(save);
    ctx.time = 500;
    updateTreats(ctx);
    expect(log.coins).toEqual([]);
  });

  it('stops at morning', () => {
    const { ctx, log } = withKitten(1);
    ctx.time = 41;
    ctx.run.timeLeft = 0;
    updateTreats(ctx);
    expect(log.coins).toEqual([]);
  });
});

describe('perks reach the stats', () => {
  const save = (pets, activePet = null, upgrades = {}) => ({ ...defaultSave(), pets, activePet, upgrades });

  it('leaves the numbers alone with no pets, and on a save from before pets', () => {
    const stats = computeStats(defaultSave());
    expect(stats.speedMult).toBe(1);
    expect(stats.sniffMult).toBe(1);
    expect(stats.giftCoins).toBe(0);
    const old = defaultSave();
    delete old.pets;
    delete old.activePet;
    expect(computeStats(old).speedMult).toBe(1);
  });

  it('multiplies the Baby Reindeer into speed alongside the skates', () => {
    expect(computeStats(save({ reindeer: 5 }, 'reindeer')).speedMult).toBeCloseTo(1.1);
    expect(computeStats(save({ reindeer: 5 }, 'reindeer', { speedy: 2 })).speedMult).toBeCloseTo(1.3 * 1.1);
    expect(computeStats(save({ reindeer: 5 })).speedMult).toBe(1);
  });

  it('carries the puppy and the kitten', () => {
    expect(computeStats(save({ puppy: 3 })).sniffMult).toBeCloseTo(1.3);
    const stats = computeStats(save({ kitten: 4 }, 'kitten'));
    expect(stats.giftCoins).toBe(8);
    expect(stats.giftSeconds).toBe(40);
  });
});

describe('the Snow Puppy', () => {
  it('becomes a pet the first time a present brings it', () => {
    const { ctx } = night();
    applySurprise('puppy', ctx, { position: new THREE.Vector3() });
    expect(ctx.save.pets.puppy).toBe(1);
  });

  it('keeps its level when it joins again', () => {
    const save = defaultSave();
    save.pets = { puppy: 4 };
    const { ctx } = night(save);
    applySurprise('puppy', ctx, { position: new THREE.Vector3() });
    expect(ctx.save.pets.puppy).toBe(4);
  });
});
