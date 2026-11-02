// Loading saves written by every version of the game (docs/CLOUD.md).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { SAVE_KEY, defaultSave, loadSave, resetSave, writeSave, syncCandyLedger } from '../src/core/save.js';
import { spentCandy } from '../src/game/pets.js';
import { spentOnUpgrades } from '../src/game/upgrades.js';

function stubStorage(data) {
  const store = new Map(data === undefined ? [] : [[SAVE_KEY, typeof data === 'string' ? data : JSON.stringify(data)]]);
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// What the game wrote before pets, baubles and the calendar existed.
const CLOUD_ERA_SAVE = {
  version: 1,
  coins: 260,
  coinsEarned: 300,
  epoch: 2,
  profile: { adj: 1, noun: 2, num: 3, hidden: false, setAt: 1000 },
  totalPresents: 30,
  totalCrackers: 6,
  nights: 4,
  bestPresentsInNight: 11,
  upgrades: { radar: 1 },
  foundJokes: ['j001'],
  unlocked: ['scarf', 'puppy'],
  wardrobe: { scarf: false },
  settings: { sfx: false, music: true, voice: true },
};

// And before cloud saves: no coinsEarned, epoch or profile.
const FIRST_SAVE = {
  version: 1,
  coins: 500,
  totalPresents: 12,
  totalCrackers: 3,
  nights: 2,
  bestPresentsInNight: 8,
  upgrades: { radar: 1 },
  foundJokes: ['j001'],
  unlocked: ['scarf'],
  wardrobe: {},
  settings: { sfx: true, music: true, voice: false },
};

describe('defaultSave', () => {
  it('starts every new field empty', () => {
    expect(defaultSave()).toMatchObject({
      candy: 0,
      candyEarned: 0,
      pets: {},
      activePet: null,
      foundBaubles: [],
      tree: {},
      treeSetAt: 0,
      advent: null,
    });
  });
});

describe('loadSave: older saves', () => {
  it('gives a new player the default save', () => {
    stubStorage();
    expect(loadSave()).toEqual(defaultSave());
  });

  it('keeps everything in a save from before pets, and adds the new fields', () => {
    stubStorage(CLOUD_ERA_SAVE);
    const s = loadSave();
    expect(s).toMatchObject({ ...CLOUD_ERA_SAVE, coins: 260, coinsEarned: 300 });
    expect(s).toMatchObject({
      candy: 0,
      candyEarned: 0,
      pets: {},
      activePet: null,
      foundBaubles: [],
      tree: {},
      treeSetAt: 0,
      advent: null,
    });
  });

  it('keeps the purse of a save from before cloud sync', () => {
    stubStorage(FIRST_SAVE);
    const s = loadSave();
    expect(s.coins).toBe(500);
    expect(s.coinsEarned).toBe(500 + spentOnUpgrades(FIRST_SAVE.upgrades));
    expect(s.candy).toBe(0);
  });

  it('survives junk in a new field', () => {
    stubStorage({
      ...CLOUD_ERA_SAVE,
      pets: ['kitten'],
      tree: 'nice',
      foundBaubles: 'ruby',
      treeSetAt: 'yesterday',
      advent: { year: 'this one' },
      activePet: 12,
      candy: 'loads',
      candyEarned: null,
    });
    expect(loadSave()).toMatchObject({
      pets: {},
      tree: {},
      foundBaubles: [],
      treeSetAt: 0,
      advent: null,
      activePet: null,
      candy: 0,
      candyEarned: 0,
    });
  });

  it('falls back to the default save on broken JSON', () => {
    stubStorage('{not json');
    expect(loadSave()).toEqual(defaultSave());
  });
});

describe('loadSave: the new fields', () => {
  const full = {
    ...CLOUD_ERA_SAVE,
    candy: 30,
    candyEarned: 80,
    pets: { kitten: 2, puppy: 1 },
    activePet: 'kitten',
    foundBaubles: ['ruby', 'icicle'],
    tree: { s0: 'ruby' },
    treeSetAt: 5000,
    advent: { year: 2026, opened: [1, 2] },
  };

  it('come back as they were saved', () => {
    const store = stubStorage();
    writeSave(full);
    expect(store.size).toBe(1);
    expect(loadSave()).toMatchObject(full);
  });

  it('rebuild candy from the ledger, whatever the file says', () => {
    stubStorage({ ...full, candy: 99999 });
    expect(loadSave().candy).toBe(30);
  });

  it('raise candyEarned to what was spent, so candy is never negative', () => {
    stubStorage({ ...full, candy: 0, candyEarned: 3 });
    const s = loadSave();
    expect(s.candy).toBe(0);
    expect(s.candyEarned).toBe(spentCandy(full.pets));
  });

  it('forget a chosen pet the save does not own', () => {
    stubStorage({ ...full, activePet: 'penguin' });
    expect(loadSave().activePet).toBeNull();
  });

  it('tidy the calendar', () => {
    stubStorage({ ...full, advent: { year: 2026, opened: [5, 1, 5, 99] } });
    expect(loadSave().advent).toEqual({ year: 2026, opened: [1, 5] });
  });
});

describe('syncCandyLedger', () => {
  it('rebuilds a missing candyEarned from the purse and what was spent', () => {
    const s = syncCandyLedger({ candy: 15, pets: { kitten: 1 } });
    expect(s).toMatchObject({ candy: 15, candyEarned: 55 });
  });

  it('rounds, and keeps candy === candyEarned - spent', () => {
    const s = syncCandyLedger({ candy: 1, candyEarned: 60.4, pets: { kitten: 2 } });
    expect(s).toMatchObject({ candyEarned: 60, candy: 10 });
  });

  it('copes with a save that has no pets field', () => {
    expect(syncCandyLedger({ candy: 4 })).toMatchObject({ candy: 4, candyEarned: 4 });
  });
});

describe('resetSave', () => {
  it('empties every new field', () => {
    const store = stubStorage({ ...CLOUD_ERA_SAVE, candyEarned: 80, pets: { kitten: 2 }, activePet: 'kitten' });
    expect(resetSave()).toEqual(defaultSave());
    expect(store.size).toBe(0);
  });
});
