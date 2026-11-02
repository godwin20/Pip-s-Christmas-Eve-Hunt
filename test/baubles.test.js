// Baubles: the designs, tree shakes, the collection and the tree.

import { describe, it, expect } from 'vitest';
import {
  BAUBLES,
  BAUBLE_PATTERNS,
  BAUBLE_TUNING,
  GOLDEN_STAR_ID,
  TREE_DROP_BAUBLES,
  TREE_SLOTS,
  getBauble,
  newShakeTally,
  rollShake,
  pickBauble,
  collectBauble,
  foundCount,
  slotOf,
  placeBauble,
  removeBauble,
  treeSpots,
} from '../src/game/baubles.js';
import { defaultSave } from '../src/core/save.js';
import { createRng } from '../src/core/rng.js';

const ALL_IDS = BAUBLES.map((b) => b.id);

// Dice that always land the same way.
const LUCKY = { chance: () => true };
const UNLUCKY = { chance: () => false };

function save(over = {}) {
  return { ...defaultSave(), foundBaubles: [...ALL_IDS], ...over };
}

describe('the designs', () => {
  it('has 14 common, 7 rare and 3 legendary', () => {
    const count = (rarity) => BAUBLES.filter((b) => b.rarity === rarity).length;
    expect(BAUBLES).toHaveLength(24);
    expect([count('common'), count('rare'), count('legendary')]).toEqual([14, 7, 3]);
  });

  it('gives each one a unique id and name, its colours and a known pattern', () => {
    expect(new Set(ALL_IDS).size).toBe(24);
    expect(new Set(BAUBLES.map((b) => b.name)).size).toBe(24);
    for (const b of BAUBLES) {
      expect(b.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/); // what firestore.rules accepts
      expect(b.colours).toHaveLength(2);
      for (const colour of b.colours) expect(colour).toMatch(/^#[0-9a-f]{6}$/);
      expect(BAUBLE_PATTERNS).toContain(b.pattern);
      expect(b.name).not.toContain('—');
    }
  });

  it('keeps the legendary Golden Star off the tree-drop table', () => {
    expect(getBauble(GOLDEN_STAR_ID)).toMatchObject({ name: 'Golden Star', rarity: 'legendary' });
    expect(TREE_DROP_BAUBLES).toHaveLength(23);
    expect(TREE_DROP_BAUBLES.map((b) => b.id)).not.toContain(GOLDEN_STAR_ID);
  });

  it('has 12 spots, s0 to s11', () => {
    expect(TREE_SLOTS).toEqual(['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11']);
  });
});

describe('rollShake', () => {
  it('drops at about the designed chance', () => {
    const rng = createRng(21);
    let drops = 0;
    const total = 20000;
    for (let i = 0; i < total; i++) if (rollShake(newShakeTally(), rng)) drops++;
    expect(drops / total).toBeGreaterThan(BAUBLE_TUNING.dropChance - 0.02);
    expect(drops / total).toBeLessThan(BAUBLE_TUNING.dropChance + 0.02);
  });

  it('guarantees a bauble after 5 empty shakes in a row', () => {
    const tally = newShakeTally();
    expect([1, 2, 3, 4, 5].map(() => rollShake(tally, UNLUCKY))).toEqual([false, false, false, false, false]);
    expect(tally.emptyShakes).toBe(5);
    expect(rollShake(tally, UNLUCKY)).toBe(true);
    expect(tally).toEqual({ emptyShakes: 0, dropped: 1 });
  });

  it('starts counting again after any drop', () => {
    const tally = newShakeTally();
    rollShake(tally, UNLUCKY);
    rollShake(tally, UNLUCKY);
    rollShake(tally, LUCKY);
    expect(tally.emptyShakes).toBe(0);
    for (let i = 0; i < 5; i++) expect(rollShake(tally, UNLUCKY)).toBe(false);
    expect(rollShake(tally, UNLUCKY)).toBe(true);
  });

  it('never goes over 4 baubles a night, even with the guarantee due', () => {
    const tally = newShakeTally();
    expect([1, 2, 3, 4, 5, 6].map(() => rollShake(tally, LUCKY))).toEqual([true, true, true, true, false, false]);
    tally.emptyShakes = 9;
    expect(rollShake(tally, UNLUCKY)).toBe(false);
    expect(tally.dropped).toBe(4);
  });

  it('a new night starts clean', () => {
    expect(newShakeTally()).toEqual({ emptyShakes: 0, dropped: 0 });
  });
});

describe('pickBauble', () => {
  it('never gives the Golden Star, whatever has been found', () => {
    const rng = createRng(22);
    const everythingElse = TREE_DROP_BAUBLES.map((b) => b.id);
    for (const found of [[], everythingElse, ALL_IDS]) {
      for (let i = 0; i < 3000; i++) expect(pickBauble(rng, found).id).not.toBe(GOLDEN_STAR_ID);
    }
  });

  it('rolls rarity at 70/25/5', () => {
    const rng = createRng(23);
    const counts = { common: 0, rare: 0, legendary: 0 };
    const total = 20000;
    for (let i = 0; i < total; i++) counts[pickBauble(rng).rarity]++;
    expect(counts.common / total).toBeCloseTo(0.7, 1);
    expect(counts.rare / total).toBeCloseTo(0.25, 1);
    expect(counts.legendary / total).toBeCloseTo(0.05, 1);
  });

  it('can give every design on the table', () => {
    const rng = createRng(24);
    const seen = new Set();
    for (let i = 0; i < 20000; i++) seen.add(pickBauble(rng).id);
    expect(seen.size).toBe(TREE_DROP_BAUBLES.length);
  });

  it('prefers a design not found yet, within the rarity it rolled', () => {
    const rng = createRng(25);
    const commons = TREE_DROP_BAUBLES.filter((b) => b.rarity === 'common');
    const found = commons.slice(1).map((b) => b.id);
    for (let i = 0; i < 2000; i++) {
      const b = pickBauble(rng, found);
      if (b.rarity === 'common') expect(b.id).toBe(commons[0].id);
    }
  });

  it('gives a duplicate once the rarity is complete', () => {
    const rng = createRng(26);
    const seen = new Set();
    for (let i = 0; i < 2000; i++) seen.add(pickBauble(rng, ALL_IDS).id);
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('collectBauble', () => {
  it('adds a new design in the order found', () => {
    const s = save({ foundBaubles: [] });
    expect(collectBauble(s, 'ruby')).toEqual({ isNew: true, coins: 0 });
    expect(collectBauble(s, 'icicle')).toEqual({ isNew: true, coins: 0 });
    expect(s.foundBaubles).toEqual(['ruby', 'icicle']);
  });

  it('pays 3 coins for a duplicate and keeps one copy', () => {
    const s = save({ foundBaubles: ['ruby'] });
    expect(collectBauble(s, 'ruby')).toEqual({ isNew: false, coins: 3 });
    expect(s.foundBaubles).toEqual(['ruby']);
  });

  it('ignores a design that does not exist', () => {
    const s = save({ foundBaubles: [] });
    expect(collectBauble(s, 'nope')).toEqual({ isNew: false, coins: 0 });
    expect(s.foundBaubles).toEqual([]);
  });

  it('counts real designs for the "7 / 24 found" line', () => {
    expect(foundCount(save({ foundBaubles: ['ruby', 'icicle', 'ruby', 'fromTheFuture'] }))).toBe(2);
  });
});

describe('the tree', () => {
  it('hangs a found design and stamps the time', () => {
    const s = save();
    expect(placeBauble(s, 's3', 'ruby', 5000)).toBe(true);
    expect(s.tree).toEqual({ s3: 'ruby' });
    expect(s.treeSetAt).toBe(5000);
    expect(slotOf(s, 'ruby')).toBe('s3');
  });

  it('refuses a design not found yet, an unknown design and an unknown spot', () => {
    const s = save({ foundBaubles: ['ruby'] });
    expect(placeBauble(s, 's0', 'icicle', 5000)).toBe(false);
    expect(placeBauble(s, 's0', 'nope', 5000)).toBe(false);
    expect(placeBauble(s, 's12', 'ruby', 5000)).toBe(false);
    expect(placeBauble(s, 'constructor', 'ruby', 5000)).toBe(false);
    expect(s).toMatchObject({ tree: {}, treeSetAt: 0 });
  });

  it('moves a design that is already on the tree, so it only hangs once', () => {
    const s = save();
    placeBauble(s, 's0', 'ruby', 5000);
    expect(placeBauble(s, 's7', 'ruby', 6000)).toBe(true);
    expect(s.tree).toEqual({ s7: 'ruby' });
  });

  it('swaps out whatever was on a spot', () => {
    const s = save();
    placeBauble(s, 's0', 'ruby', 5000);
    placeBauble(s, 's0', 'icicle', 6000);
    expect(s.tree).toEqual({ s0: 'icicle' });
    expect(slotOf(s, 'ruby')).toBeNull();
  });

  it('changes nothing when a design is already on that spot', () => {
    const s = save();
    placeBauble(s, 's0', 'ruby', 5000);
    expect(placeBauble(s, 's0', 'ruby', 9000)).toBe(false);
    expect(s.treeSetAt).toBe(5000);
  });

  it('takes a bauble off, and an empty spot is no change', () => {
    const s = save();
    placeBauble(s, 's0', 'ruby', 5000);
    expect(removeBauble(s, 's1', 6000)).toBe(false);
    expect(s.treeSetAt).toBe(5000);
    expect(removeBauble(s, 's0', 6000)).toBe(true);
    expect(s).toMatchObject({ tree: {}, treeSetAt: 6000 });
  });

  it('stamps strictly newer times even if the clock is behind, so the change wins a merge', () => {
    const s = save({ tree: { s0: 'ruby' }, treeSetAt: 9000 });
    placeBauble(s, 's1', 'icicle', 1000);
    expect(s.treeSetAt).toBe(9001);
    removeBauble(s, 's1', 1000);
    expect(s.treeSetAt).toBe(9002);
    placeBauble(s, 's2', 'icicle', NaN);
    expect(s.treeSetAt).toBe(9003);
  });

  it('always stamps above 0, which is what a save without a tree holds', () => {
    const s = save();
    placeBauble(s, 's0', 'ruby', 0);
    expect(s.treeSetAt).toBe(1);
  });

  it('can hold all 12 spots with different designs', () => {
    const s = save();
    TREE_SLOTS.forEach((slot, i) => expect(placeBauble(s, slot, ALL_IDS[i], 5000 + i)).toBe(true));
    expect(Object.keys(s.tree)).toHaveLength(12);
    expect(new Set(Object.values(s.tree)).size).toBe(12);
  });

  it('lists every spot in order for the Wardrobe and the village', () => {
    const s = save({ tree: { s2: 'ruby' } });
    const spots = treeSpots(s);
    expect(spots.map((x) => x.slot)).toEqual(TREE_SLOTS);
    expect(spots[2].bauble.id).toBe('ruby');
    expect(spots.filter((x) => x.bauble)).toHaveLength(1);
  });

  it('shows an empty tree, an unknown design and a repeat as empty spots', () => {
    expect(treeSpots(defaultSave()).every((x) => x.bauble === null)).toBe(true);
    const spots = treeSpots(save({ tree: { s0: 'fromTheFuture', s1: 'ruby', s2: 'ruby' } }));
    expect(spots.slice(0, 3).map((x) => x.bauble && x.bauble.id)).toEqual([null, 'ruby', null]);
  });
});
