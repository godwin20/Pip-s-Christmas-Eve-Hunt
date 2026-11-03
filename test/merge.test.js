// Merge rules for cloud saves (docs/CLOUD.md, "mergeSaves").

import { describe, it, expect } from 'vitest';
import {
  mergeSaves,
  toCloudSave,
  fromCloudSave,
  boardScores,
  ensureProfile,
  sameSave,
  CLOUD_LIMITS,
  BOARD_LIMITS,
} from '../src/cloud/merge.js';
import { defaultSave, syncCoinLedger } from '../src/core/save.js';
import { spentOnUpgrades, buyUpgrade, UPGRADES } from '../src/game/upgrades.js';
import { PETS, MAX_PET_LEVEL, spentCandy, buyPet, feedPet, addCandy, setActivePet } from '../src/game/pets.js';
import { BAUBLES, TREE_SLOTS, placeBauble, removeBauble, collectBauble, GOLDEN_STAR_ID } from '../src/game/baubles.js';
import { ADVENT_TUNING, openDoor } from '../src/game/advent.js';
import { isValidNameParts, ADJECTIVES, NOUNS, NAME_NUM_MAX } from '../src/cloud/names.js';
import { JOKES } from '../src/data/jokes.js';

const NAME_A = { adj: 1, noun: 2, num: 3, hidden: false, setAt: 1000 };
const NAME_B = { adj: 4, noun: 5, num: 6, hidden: true, setAt: 2000 };

// A save that already keeps coins === coinsEarned - spent, like loadSave() gives.
function save(over = {}) {
  return syncCoinLedger({ ...defaultSave(), profile: { ...NAME_A }, ...over });
}

function coinsOk(s) {
  return s.coins === s.coinsEarned - spentOnUpgrades(s.upgrades) && s.coins >= 0;
}

function candyOk(s) {
  return s.candy === s.candyEarned - spentCandy(s.pets) && s.candy >= 0;
}

// A save with candy, keeping candy === candyEarned - spent.
function candySave(over = {}) {
  const pets = over.pets ?? {};
  const candyEarned = over.candyEarned ?? 0;
  return save({ ...over, pets, candyEarned, candy: candyEarned - spentCandy(pets) });
}

// The two saves after each has pushed once, in the order cloud.js would:
// A's copy reaches the cloud, B merges it, then A merges B's result.
function syncBoth(a, b) {
  const cloudAfterA = toCloudSave(a);
  const onB = mergeSaves(b, cloudAfterA);
  const onA = mergeSaves(a, toCloudSave(onB));
  return [onA, onB];
}

// A cloud copy from a version of the game before pets, baubles and the calendar.
function oldCloud(s) {
  const copy = toCloudSave(s);
  for (const key of ['candyEarned', 'pets', 'foundBaubles', 'tree', 'treeSetAt', 'advent']) delete copy[key];
  return copy;
}

describe('mergeSaves: missing or empty remote', () => {
  it('returns local unchanged for null, undefined and {}', () => {
    const local = save({ coinsEarned: 90, totalPresents: 12, foundJokes: ['j002', 'j001'] });
    for (const remote of [null, undefined, {}]) {
      const merged = mergeSaves(local, remote);
      expect(merged).toEqual(local);
      expect(merged).not.toBe(local);
    }
  });

  it('does not mutate its inputs', () => {
    const local = save({ coinsEarned: 50, upgrades: { radar: 1 } });
    const remote = toCloudSave(save({ coinsEarned: 500, upgrades: { magnet: 2 }, foundJokes: ['j003'] }));
    const before = [structuredClone(local), structuredClone(remote)];
    mergeSaves(local, remote);
    expect([local, remote]).toEqual(before);
  });
});

describe('mergeSaves: same epoch', () => {
  it('takes the max of every counter', () => {
    const local = save({ coinsEarned: 100, totalPresents: 30, totalCrackers: 2, nights: 9, bestPresentsInNight: 14 });
    const remote = toCloudSave(save({ coinsEarned: 40, totalPresents: 45, totalCrackers: 7, nights: 3, bestPresentsInNight: 20 }));
    const m = mergeSaves(local, remote);
    expect(m).toMatchObject({ coinsEarned: 100, totalPresents: 45, totalCrackers: 7, nights: 9, bestPresentsInNight: 20 });
  });

  it('keeps the highest level per upgrade, clamped to 0..3', () => {
    const local = { ...save(), upgrades: { radar: 2, magnet: 1, sack: 9 } };
    const remote = { ...toCloudSave(save()), upgrades: { radar: 1, magnet: 3, compass: -2, speedy: 2 } };
    const m = mergeSaves(local, remote);
    expect(m.upgrades).toEqual({ radar: 2, magnet: 3, sack: 3, compass: 0, speedy: 2 });
  });

  it('lists local jokes first, then missing remote ones, as unique strings', () => {
    const local = save({ foundJokes: ['j005', 'j001', 'j005', 7] });
    const remote = toCloudSave(save({ foundJokes: ['j001', 'q002', 's001', 'q002'] }));
    remote.foundJokes.push(null, { id: 'x' }); // junk from a bad write is dropped
    expect(mergeSaves(local, remote).foundJokes).toEqual(['j005', 'j001', '7', 'q002', 's001']);
  });

  it('drops ids firestore.rules would refuse, so one bad id cannot fail every push', () => {
    const long = 'k'.repeat(64);
    const local = save({ foundJokes: ['j001', 'a b', 'x|y', '', `${long}k`, long, 'ok_id-2', 1.5, -3, 'j001'] });
    expect(toCloudSave(local).foundJokes).toEqual(['j001', long, 'ok_id-2', '-3']);
    const maps = toCloudSave(save({ upgrades: { 'a b': 1, radar: 2 }, wardrobe: { 'x|y': true, scarf: false } }));
    expect(maps.upgrades).toEqual({ radar: 2 });
    expect(maps.wardrobe).toEqual({ scarf: false });
  });

  it('treats ids like constructor as plain keys, not Object.prototype', () => {
    const local = save({ upgrades: { radar: 1 }, wardrobe: { scarf: true } });
    const remote = {
      ...toCloudSave(save()),
      upgrades: { constructor: 2, toString: 1 },
      wardrobe: { constructor: false, hasOwnProperty: true },
    };
    const m = mergeSaves(local, remote);
    expect(m.upgrades).toEqual({ radar: 1, constructor: 2, toString: 1 });
    expect(m.wardrobe).toEqual({ scarf: true, constructor: false, hasOwnProperty: true });
    expect(coinsOk(m)).toBe(true);
  });

  it('unions unlocked milestones', () => {
    const local = save({ unlocked: ['scarf', 'puppy'] });
    const remote = toCloudSave(save({ unlocked: ['puppy', 'candyTheme'] }));
    expect(mergeSaves(local, remote).unlocked).toEqual(['scarf', 'puppy', 'candyTheme']);
  });

  it('uses the local wardrobe value where local has the key', () => {
    const local = save({ wardrobe: { scarf: false, puppy: true } });
    const remote = toCloudSave(save({ wardrobe: { scarf: true, puppy: false, trail: false } }));
    expect(mergeSaves(local, remote).wardrobe).toEqual({ scarf: false, puppy: true, trail: false });
  });

  it('keeps the profile with the newer setAt, both ways', () => {
    const older = save({ profile: { ...NAME_A } });
    const newer = save({ profile: { ...NAME_B } });
    expect(mergeSaves(older, toCloudSave(newer)).profile).toEqual(NAME_B);
    expect(mergeSaves(newer, toCloudSave(older)).profile).toEqual(NAME_B);
  });

  it('lets a missing or invalid profile lose', () => {
    const named = save({ profile: { ...NAME_A } });
    const nameless = save({ profile: null });
    const broken = save({ profile: { adj: 99, noun: 0, num: 0, setAt: 9e12 } });
    expect(mergeSaves(nameless, toCloudSave(named)).profile).toEqual(NAME_A);
    expect(mergeSaves(named, toCloudSave(nameless)).profile).toEqual(NAME_A);
    expect(mergeSaves(broken, toCloudSave(named)).profile).toEqual(NAME_A);
    expect(mergeSaves(nameless, toCloudSave(nameless)).profile).toBeNull();
  });

  it('settles a setAt tie on the remote name, so devices agree', () => {
    const a = save({ profile: { adj: 1, noun: 1, num: 1, hidden: false, setAt: 0 } });
    const b = save({ profile: { adj: 2, noun: 2, num: 2, hidden: false, setAt: 0 } });
    expect(mergeSaves(a, toCloudSave(b)).profile).toEqual(b.profile);
    expect(mergeSaves(b, toCloudSave(a)).profile).toEqual(a.profile);
  });
});

describe('mergeSaves: epochs', () => {
  const progress = {
    epoch: 0,
    coinsEarned: 900,
    totalPresents: 120,
    nights: 15,
    bestPresentsInNight: 22,
    upgrades: { radar: 3, magnet: 2 },
    foundJokes: ['j001', 'j002', 's001'],
    unlocked: ['scarf', 'puppy'],
    wardrobe: { scarf: false, puppy: true },
    profile: { ...NAME_A },
  };
  const reset = {
    epoch: 1,
    coinsEarned: 10,
    totalPresents: 3,
    nights: 1,
    bestPresentsInNight: 3,
    profile: { ...NAME_B, setAt: 5 },
  };

  it('a remote reset beats older local progress outright', () => {
    const local = save(progress);
    const m = mergeSaves(local, toCloudSave(save(reset)));
    expect(m).toMatchObject({ epoch: 1, coinsEarned: 10, coins: 10, totalPresents: 3, nights: 1, bestPresentsInNight: 3 });
    expect(m.upgrades).toEqual({});
    expect(m.foundJokes).toEqual([]);
    expect(m.unlocked).toEqual([]);
    expect(m.wardrobe).toEqual({});
    expect(m.profile).toEqual(reset.profile); // its profile too, though older by setAt
  });

  it('a local reset beats older remote progress outright', () => {
    const local = save(reset);
    const m = mergeSaves(local, toCloudSave(save(progress)));
    expect(m).toEqual(local);
  });

  it('keeps the loser name only when the winner has none', () => {
    const m = mergeSaves(save(progress), toCloudSave(save({ ...reset, profile: null })));
    expect(m.profile).toEqual(NAME_A);
    expect(m.totalPresents).toBe(3);
  });
});

describe('mergeSaves: coins', () => {
  it('keeps coins === coinsEarned - spent after every merge', () => {
    const local = save({ coinsEarned: 2000, upgrades: { radar: 2 } });
    const remote = toCloudSave(save({ coinsEarned: 1500, upgrades: { magnet: 3, sack: 1 } }));
    const m = mergeSaves(local, remote);
    expect(coinsOk(m)).toBe(true);
    expect(m.coinsEarned).toBe(2000);
    expect(m.coins).toBe(2000 - 160 - 610 - 50);
  });

  it('cannot duplicate coins when two devices buy different upgrades', () => {
    // Both devices start synced with 400 coins and nothing bought.
    const start = save({ coinsEarned: 400 });
    const a = structuredClone(start);
    const b = structuredClone(start);
    expect(buyUpgrade(a, 'radar')).toBe(true); // 40
    expect(buyUpgrade(a, 'radar')).toBe(true); // 120
    expect(buyUpgrade(b, 'magnet')).toBe(true); // 60
    expect(buyUpgrade(b, 'compass')).toBe(true); // 80
    expect(a.coins + b.coins).toBeGreaterThan(400 - 300); // each device kept spending its own copy

    const cloudAfterA = toCloudSave(mergeSaves(a, toCloudSave(start)));
    const onB = mergeSaves(b, cloudAfterA);
    const onA = mergeSaves(a, toCloudSave(onB));
    for (const s of [onA, onB]) {
      expect(s.upgrades).toEqual({ radar: 2, magnet: 1, compass: 1 });
      expect(s.coinsEarned).toBe(400);
      expect(s.coins).toBe(400 - 40 - 120 - 60 - 80);
      expect(coinsOk(s)).toBe(true);
    }
  });

  it('never goes negative: coinsEarned rises to the amount spent', () => {
    const local = save({ coinsEarned: 40, upgrades: { radar: 1 } });
    const remote = { ...toCloudSave(save()), coinsEarned: 0, upgrades: { magnet: 3 } };
    const m = mergeSaves(local, remote);
    expect(m.coinsEarned).toBe(spentOnUpgrades({ radar: 1, magnet: 3 }));
    expect(m.coins).toBe(0);
  });

  it('ignores a coins field in the remote', () => {
    const local = save({ coinsEarned: 100 });
    const m = mergeSaves(local, { ...toCloudSave(local), coins: 99999 });
    expect(m.coins).toBe(100);
  });
});

describe('mergeSaves: local-only fields and idempotence', () => {
  it('takes settings and version from local', () => {
    const local = save({ settings: { sfx: false, music: true, voice: false }, version: 1 });
    const remote = { ...save({ settings: { sfx: true, music: false, voice: true }, totalPresents: 5 }), version: 7 };
    const m = mergeSaves(local, remote);
    expect(m.settings).toEqual(local.settings);
    expect(m.version).toBe(1);
    expect(m.settings).not.toBe(local.settings);
  });

  it('is idempotent', () => {
    const local = save({
      coinsEarned: 300,
      totalPresents: 40,
      upgrades: { radar: 1, sack: 2 },
      foundJokes: ['j001', 'j009'],
      unlocked: ['scarf'],
      wardrobe: { scarf: false },
      profile: { ...NAME_A },
    });
    const remotes = [
      toCloudSave(save({ coinsEarned: 500, upgrades: { magnet: 1 }, foundJokes: ['q001'], profile: { ...NAME_B } })),
      toCloudSave(save({ epoch: 2, totalPresents: 1 })),
      toCloudSave(save({ epoch: 2, profile: null })),
      { ...toCloudSave(local), epoch: 0 },
    ];
    for (const remote of remotes) {
      const once = mergeSaves(local, remote);
      expect(mergeSaves(once, remote)).toEqual(once);
      expect(mergeSaves(once, toCloudSave(once))).toEqual(once);
      expect(sameSave(mergeSaves(once, remote), once)).toBe(true);
    }
  });

  it('merging a save with its own cloud copy changes nothing', () => {
    const local = save({ coinsEarned: 120, upgrades: { radar: 1 }, foundJokes: ['j001'], wardrobe: { scarf: true } });
    expect(mergeSaves(local, toCloudSave(local))).toEqual(local);
  });
});

describe('mergeSaves: candy', () => {
  it('takes the higher candyEarned and derives candy from it', () => {
    const local = candySave({ candyEarned: 100, pets: { kitten: 1 } });
    const remote = toCloudSave(candySave({ candyEarned: 70 }));
    const m = mergeSaves(local, remote);
    expect(m).toMatchObject({ candyEarned: 100, candy: 60 });
    expect(candyOk(m)).toBe(true);
  });

  it('cannot duplicate candy when two devices buy different pets', () => {
    const start = candySave({ candyEarned: 200 });
    const a = structuredClone(start);
    const b = structuredClone(start);
    expect(buyPet(a, 'kitten')).toBe(true); // 40
    expect(buyPet(b, 'reindeer')).toBe(true); // 80
    for (const s of syncBoth(a, b)) {
      expect(s.pets).toEqual({ kitten: 1, reindeer: 1 });
      expect(s).toMatchObject({ candyEarned: 200, candy: 200 - 40 - 80 });
      expect(candyOk(s)).toBe(true);
    }
  });

  it('keeps the highest level when two devices feed the same pet', () => {
    const start = candySave({ candyEarned: 200, pets: { kitten: 1 } });
    const a = structuredClone(start);
    const b = structuredClone(start);
    feedPet(a, 'kitten');
    feedPet(a, 'kitten');
    feedPet(b, 'kitten');
    for (const s of syncBoth(a, b)) {
      expect(s.pets).toEqual({ kitten: 3 });
      expect(s.candy).toBe(200 - 40 - 10 - 20);
      expect(candyOk(s)).toBe(true);
    }
  });

  it('never goes negative: candyEarned rises to the amount spent', () => {
    // Each device could afford its own pet, but not both.
    const start = candySave({ candyEarned: 100 });
    const a = structuredClone(start);
    const b = structuredClone(start);
    buyPet(a, 'kitten');
    buyPet(b, 'reindeer');
    for (const s of syncBoth(a, b)) {
      expect(s.candy).toBe(0);
      expect(s.candyEarned).toBe(spentCandy({ kitten: 1, reindeer: 1 }));
      expect(candyOk(s)).toBe(true);
    }
  });

  it('ignores a candy field in the remote, and in local too', () => {
    const local = candySave({ candyEarned: 100 });
    local.candy = 5000;
    const m = mergeSaves(local, { ...toCloudSave(local), candy: 99999 });
    expect(m.candy).toBe(100);
  });

  it('counts candy earned on this device since the last sync', () => {
    const local = candySave({ candyEarned: 10 });
    addCandy(local, 6);
    const m = mergeSaves(local, toCloudSave(candySave({ candyEarned: 10 })));
    expect(m).toMatchObject({ candy: 16, candyEarned: 16 });
  });
});

describe('mergeSaves: pets', () => {
  it('keeps the highest level per pet', () => {
    const local = candySave({ candyEarned: 500, pets: { puppy: 3, kitten: 1 } });
    const remote = toCloudSave(candySave({ candyEarned: 500, pets: { puppy: 1, kitten: 4, penguin: 2 } }));
    expect(mergeSaves(local, remote).pets).toEqual({ puppy: 3, kitten: 4, penguin: 2 });
  });

  it('cleans levels the rules would refuse, rather than failing every push', () => {
    const cloud = toCloudSave({ pets: { kitten: 9, puppy: 0, reindeer: -1, penguin: 'x', 'a b': 2, ok: 2.4 } });
    expect(cloud.pets).toEqual({ kitten: MAX_PET_LEVEL, ok: 2 });
  });

  it('treats ids like constructor as plain keys', () => {
    const local = candySave({ pets: { kitten: 1 }, candyEarned: 40 });
    const remote = { ...toCloudSave(save()), pets: { constructor: 2 } };
    const m = mergeSaves(local, remote);
    expect(m.pets).toEqual({ kitten: 1, constructor: 2 });
    expect(candyOk(m)).toBe(true);
  });

  it('keeps activePet local: never sent, never taken from the remote', () => {
    const local = candySave({ candyEarned: 200, pets: { kitten: 1, penguin: 1 }, activePet: 'kitten' });
    expect(toCloudSave(local)).not.toHaveProperty('activePet');
    const m = mergeSaves(local, { ...toCloudSave(local), activePet: 'penguin' });
    expect(m.activePet).toBe('kitten');
  });

  it('keeps a pet choice on another device through a merge', () => {
    const remote = candySave({ candyEarned: 40, pets: { kitten: 1 }, activePet: 'kitten' });
    const local = candySave({ candyEarned: 40, pets: { kitten: 1 } });
    expect(setActivePet(local, 'kitten')).toBe(true);
    expect(mergeSaves(local, toCloudSave(remote)).activePet).toBe('kitten');
  });
});

describe('mergeSaves: baubles', () => {
  it('unions foundBaubles, local order first', () => {
    const local = save({ foundBaubles: ['ruby', 'icicle'] });
    const remote = toCloudSave(save({ foundBaubles: ['emerald', 'ruby'] }));
    expect(mergeSaves(local, remote).foundBaubles).toEqual(['ruby', 'icicle', 'emerald']);
  });

  it('keeps a design found on either device', () => {
    const start = save();
    const a = structuredClone(start);
    const b = structuredClone(start);
    collectBauble(a, 'ruby');
    collectBauble(b, 'icicle');
    for (const s of syncBoth(a, b)) expect([...s.foundBaubles].sort()).toEqual(['icicle', 'ruby']);
  });

  it('never loses a design the winning tree hangs', () => {
    const a = save({ foundBaubles: ['ruby'] });
    const b = save({ foundBaubles: ['icicle'] });
    placeBauble(a, 's0', 'ruby', 1000);
    placeBauble(b, 's0', 'icicle', 2000);
    for (const s of syncBoth(a, b)) {
      expect(s.tree).toEqual({ s0: 'icicle' });
      expect(s.foundBaubles).toContain('icicle');
    }
  });
});

describe('mergeSaves: the tree', () => {
  const tree = (over) => save({ foundBaubles: ['ruby', 'icicle'], ...over });

  it('takes the newest tree whole, both ways', () => {
    const older = tree({ tree: { s0: 'ruby', s1: 'icicle' }, treeSetAt: 1000 });
    const newer = tree({ tree: { s5: 'ruby' }, treeSetAt: 2000 });
    for (const m of [mergeSaves(older, toCloudSave(newer)), mergeSaves(newer, toCloudSave(older))]) {
      expect(m.tree).toEqual({ s5: 'ruby' });
      expect(m.treeSetAt).toBe(2000);
    }
  });

  it('lets a newer empty tree win, so taking baubles off sticks', () => {
    const start = tree({ tree: { s0: 'ruby' }, treeSetAt: 1000 });
    const a = structuredClone(start);
    const b = structuredClone(start);
    removeBauble(a, 's0', 2000);
    for (const s of syncBoth(a, b)) expect(s).toMatchObject({ tree: {}, treeSetAt: 2000 });
  });

  it('settles a tie on the remote tree, so devices agree', () => {
    const a = tree({ tree: { s0: 'ruby' }, treeSetAt: 1000 });
    const b = tree({ tree: { s0: 'icicle' }, treeSetAt: 1000 });
    expect(mergeSaves(a, toCloudSave(b)).tree).toEqual(b.tree);
    expect(mergeSaves(b, toCloudSave(a)).tree).toEqual(a.tree);
    const [onA, onB] = syncBoth(a, b);
    expect(onA.tree).toEqual(onB.tree);
  });

  it('a change on a device with a slow clock still wins', () => {
    const start = tree({ tree: { s0: 'ruby' }, treeSetAt: 9000 });
    const slow = structuredClone(start);
    placeBauble(slow, 's1', 'icicle', 10);
    expect(mergeSaves(start, toCloudSave(slow)).tree).toEqual({ s0: 'ruby', s1: 'icicle' });
  });

  it('cleans what the rules would refuse, rather than failing every push', () => {
    const cloud = toCloudSave({
      tree: { s0: 'ruby', s1: 'ruby', s2: 'a b', s3: 7, s12: 'icicle', x: 'icicle', constructor: 'ruby' },
      treeSetAt: -5,
    });
    expect(cloud.tree).toEqual({ s0: 'ruby', s3: '7' });
    expect(cloud.treeSetAt).toBe(0);
    expect(toCloudSave({ tree: ['ruby'], treeSetAt: 'x' })).toMatchObject({ tree: {}, treeSetAt: 0 });
    expect(toCloudSave({ treeSetAt: 9e15 }).treeSetAt).toBe(CLOUD_LIMITS.setAt);
  });
});

describe('mergeSaves: the advent calendar', () => {
  const advent = (year, opened) => save({ advent: { year, opened } });

  it('unions opened doors within the same year, in door order', () => {
    const m = mergeSaves(advent(2026, [5, 9]), toCloudSave(advent(2026, [1, 5, 24])));
    expect(m.advent).toEqual({ year: 2026, opened: [1, 5, 9, 24] });
  });

  it('lets the newer year win outright, both ways: year rollover', () => {
    const last = advent(2026, [1, 2, 3, 24]);
    const next = advent(2027, [1]);
    expect(mergeSaves(last, toCloudSave(next)).advent).toEqual({ year: 2027, opened: [1] });
    expect(mergeSaves(next, toCloudSave(last)).advent).toEqual({ year: 2027, opened: [1] });
  });

  it('takes whichever side has one', () => {
    expect(mergeSaves(save(), toCloudSave(advent(2026, [1]))).advent).toEqual({ year: 2026, opened: [1] });
    expect(mergeSaves(advent(2026, [1]), toCloudSave(save())).advent).toEqual({ year: 2026, opened: [1] });
    expect(mergeSaves(save(), toCloudSave(save())).advent).toBeNull();
  });

  it('keeps doors opened on two devices, in any order', () => {
    const when = new Date(2026, 11, 9, 12);
    const a = save();
    const b = save();
    openDoor(a, 3, when);
    openDoor(a, 1, when);
    openDoor(b, 2, when);
    for (const s of syncBoth(a, b)) expect(s.advent).toEqual({ year: 2026, opened: [1, 2, 3] });
  });

  it('cannot pay a door twice through a merge: the coin ledger only takes the max', () => {
    const when = new Date(2026, 11, 9, 12);
    const start = save({ coinsEarned: 50 });
    const a = structuredClone(start);
    const b = structuredClone(start);
    for (const s of [a, b]) {
      const { coins } = openDoor(s, 1, when);
      s.coins += coins;
      s.coinsEarned += coins;
    }
    for (const s of syncBoth(a, b)) {
      expect(s.coinsEarned).toBe(60);
      expect(coinsOk(s)).toBe(true);
    }
  });

  it('cleans what the rules would refuse, rather than failing every push', () => {
    expect(toCloudSave({ advent: { year: 2026, opened: [2, 2, 0, 25, 'x', 1], extra: true } }).advent).toEqual({ year: 2026, opened: [1, 2] });
    expect(toCloudSave({ advent: { year: 1999, opened: [1] } }).advent).toBeNull();
    expect(toCloudSave({ advent: 'none' }).advent).toBeNull();
  });
});

describe('mergeSaves: resets and the new fields', () => {
  const played = () =>
    candySave({
      candyEarned: 300,
      pets: { kitten: 3, puppy: 2 },
      activePet: 'kitten',
      foundBaubles: ['ruby', 'icicle'],
      tree: { s0: 'ruby' },
      treeSetAt: 999999,
      advent: { year: 2026, opened: [1, 2, 3] },
    });
  const reset = () => save({ epoch: 1, profile: { ...NAME_B, setAt: 5 } });

  it('a remote reset clears them all, however new the tree', () => {
    const m = mergeSaves(played(), toCloudSave(reset()));
    expect(m).toMatchObject({ epoch: 1, candy: 0, candyEarned: 0, pets: {}, foundBaubles: [], tree: {}, treeSetAt: 0, advent: null });
  });

  it('a remote reset forgets the local pet choice, since that pet has gone', () => {
    const m = mergeSaves(played(), toCloudSave(reset()));
    expect(m.activePet).toBeNull();
  });

  it('a local reset beats older remote progress outright', () => {
    const local = reset();
    expect(mergeSaves(local, toCloudSave(played()))).toEqual(local);
  });

  it('a stale device cannot bring pets or the tree back after a reset', () => {
    const resetCloud = toCloudSave(mergeSaves(reset(), toCloudSave(played())));
    const stale = played();
    const m = mergeSaves(stale, resetCloud);
    expect(toCloudSave(m)).toMatchObject({ epoch: 1, candyEarned: 0, pets: {}, foundBaubles: [], tree: {}, advent: null });
  });

  it('new progress after a reset on both sides still merges', () => {
    const a = candySave({ epoch: 1, candyEarned: 50, pets: { kitten: 1 } });
    const b = candySave({ epoch: 1, candyEarned: 30, foundBaubles: ['ruby'] });
    const m = mergeSaves(a, toCloudSave(b));
    expect(m).toMatchObject({ pets: { kitten: 1 }, foundBaubles: ['ruby'], candyEarned: 50, candy: 10 });
  });
});

describe('mergeSaves: older versions of the game', () => {
  const full = () =>
    candySave({
      coinsEarned: 200,
      candyEarned: 90,
      pets: { kitten: 2 },
      activePet: 'kitten',
      foundBaubles: ['ruby'],
      tree: { s0: 'ruby' },
      treeSetAt: 5000,
      advent: { year: 2026, opened: [1] },
    });

  it('keeps every new field when a cached version wrote the cloud copy', () => {
    const local = full();
    const m = mergeSaves(local, oldCloud(local));
    expect(m).toEqual(local);
  });

  it('merges an old copy that has new old-style progress', () => {
    const local = full();
    const m = mergeSaves(local, oldCloud(candySave({ coinsEarned: 700, totalPresents: 90 })));
    expect(m).toMatchObject({ coinsEarned: 700, totalPresents: 90, candyEarned: 90, candy: 40, pets: { kitten: 2 } });
    expect(toCloudSave(m)).toMatchObject({ tree: { s0: 'ruby' }, treeSetAt: 5000, advent: { year: 2026, opened: [1] } });
  });

  it('gives an old local save the new fields from the cloud', () => {
    const local = save({ coinsEarned: 200 });
    for (const key of ['candy', 'candyEarned', 'pets', 'activePet', 'foundBaubles', 'tree', 'treeSetAt', 'advent']) delete local[key];
    const m = mergeSaves(local, toCloudSave(full()));
    expect(m).toMatchObject({ candyEarned: 90, candy: 40, pets: { kitten: 2 }, foundBaubles: ['ruby'], tree: { s0: 'ruby' } });
    expect(m.activePet).toBeNull();
    expect(candyOk(m)).toBe(true);
  });
});

describe('mergeSaves: the new fields stay stable', () => {
  const local = () =>
    candySave({
      candyEarned: 120,
      pets: { kitten: 1, puppy: 2 },
      activePet: 'kitten',
      foundBaubles: ['ruby', 'icicle'],
      tree: { s0: 'ruby' },
      treeSetAt: 4000,
      advent: { year: 2026, opened: [1, 2] },
    });

  it('merging a save with its own cloud copy changes nothing', () => {
    expect(mergeSaves(local(), toCloudSave(local()))).toEqual(local());
  });

  it('is idempotent', () => {
    const remotes = [
      toCloudSave(candySave({ candyEarned: 400, pets: { penguin: 2 }, foundBaubles: ['emerald'], tree: { s9: 'emerald' }, treeSetAt: 8000, advent: { year: 2026, opened: [5] } })),
      toCloudSave(candySave({ advent: { year: 2027, opened: [1] } })),
      toCloudSave(save({ epoch: 2 })),
      oldCloud(save({ coinsEarned: 5 })),
    ];
    for (const remote of remotes) {
      const once = mergeSaves(local(), remote);
      expect(mergeSaves(once, remote)).toEqual(once);
      expect(mergeSaves(once, toCloudSave(once))).toEqual(once);
    }
  });

  it('does not mutate its inputs', () => {
    const l = local();
    const remote = toCloudSave(candySave({ candyEarned: 400, pets: { penguin: 2 }, tree: { s9: 'emerald' }, treeSetAt: 8000 }));
    const before = [structuredClone(l), structuredClone(remote)];
    mergeSaves(l, remote);
    expect([l, remote]).toEqual(before);
  });

  it('sees two saves that differ only in a new field as different', () => {
    expect(sameSave(local(), local())).toBe(true);
    expect(sameSave(local(), { ...local(), pets: { kitten: 2, puppy: 2 } })).toBe(false);
    expect(sameSave(local(), { ...local(), tree: {} })).toBe(false);
    expect(sameSave(local(), { ...local(), advent: { year: 2026, opened: [1] } })).toBe(false);
  });

  it('fromCloudSave brings the new fields, derives candy and keeps a pet choice it still owns', () => {
    const device = candySave({ candyEarned: 40, pets: { kitten: 1 }, activePet: 'kitten' });
    const full = fromCloudSave(toCloudSave(local()), device);
    expect(full).toMatchObject({ candyEarned: 120, candy: 120 - 40 - 10, pets: { kitten: 1, puppy: 2 }, activePet: 'kitten' });
    expect(full.tree).toEqual({ s0: 'ruby' });
    expect(fromCloudSave(toCloudSave(candySave()), device).activePet).toBeNull();
  });
});

describe('CLOUD_LIMITS: the new caps', () => {
  it('fit everything in the game', () => {
    expect(PETS.length).toBeLessThanOrEqual(CLOUD_LIMITS.pets);
    expect(MAX_PET_LEVEL).toBe(CLOUD_LIMITS.petLevel);
    expect(BAUBLES.length).toBe(CLOUD_LIMITS.foundBaubles);
    expect(TREE_SLOTS.length).toBe(CLOUD_LIMITS.tree);
    expect(ADVENT_TUNING.doors).toBe(CLOUD_LIMITS.adventDoors);
    expect(ADVENT_TUNING.firstYear).toBe(CLOUD_LIMITS.adventYearMin);
    expect(ADVENT_TUNING.lastYear).toBe(CLOUD_LIMITS.adventYearMax);
  });

  it('cap the new lists and maps', () => {
    const many = (n, p) => Array.from({ length: n }, (_, i) => `${p}${i}`);
    const cloud = toCloudSave({
      pets: Object.fromEntries(many(30, 'p').map((id) => [id, 1])),
      foundBaubles: many(40, 'b'),
    });
    expect(Object.keys(cloud.pets)).toHaveLength(CLOUD_LIMITS.pets);
    expect(cloud.foundBaubles).toHaveLength(CLOUD_LIMITS.foundBaubles);
    expect(cloud.foundBaubles[0]).toBe('b0');
  });

  it('keep the whole collection, Golden Star included, through a merge', () => {
    const all = BAUBLES.map((b) => b.id);
    const m = mergeSaves(save({ foundBaubles: all.slice(0, 12) }), toCloudSave(save({ foundBaubles: all.slice(12) })));
    expect(m.foundBaubles).toHaveLength(24);
    expect(m.foundBaubles).toContain(GOLDEN_STAR_ID);
  });
});

describe('toCloudSave / fromCloudSave', () => {
  it('strips coins, candy, settings, activePet and version', () => {
    const cloud = toCloudSave(save({ coinsEarned: 50 }));
    expect(cloud).not.toHaveProperty('coins');
    expect(cloud).not.toHaveProperty('candy');
    expect(cloud).not.toHaveProperty('settings');
    expect(cloud).not.toHaveProperty('activePet');
    expect(cloud).not.toHaveProperty('version');
    expect(Object.keys(cloud).sort()).toEqual(
      ['bestPresentsInNight', 'coinsEarned', 'epoch', 'foundJokes', 'nights', 'profile', 'totalCrackers',
        'totalPresents', 'unlocked', 'upgrades', 'wardrobe',
        'candyEarned', 'pets', 'foundBaubles', 'tree', 'treeSetAt', 'advent'].sort(),
    );
  });

  it('never contains undefined, and keeps whole numbers within the caps', () => {
    const messy = {
      epoch: 2.6,
      coinsEarned: 'lots',
      totalPresents: -5,
      nights: Infinity,
      upgrades: { radar: '2', magnet: undefined },
      foundJokes: 'j001',
      wardrobe: { scarf: 'yes', puppy: false },
      profile: { adj: 1, noun: 1, num: 1 },
    };
    const cloud = toCloudSave(messy);
    expect(JSON.stringify(cloud)).toBe(JSON.stringify(cloud, (k, v) => (v === undefined ? 'UNDEFINED' : v)));
    expect(cloud).toMatchObject({ epoch: 3, coinsEarned: 0, totalPresents: 0, nights: 0, totalCrackers: 0 });
    expect(cloud.upgrades).toEqual({ radar: 2, magnet: 0 });
    expect(cloud.foundJokes).toEqual([]);
    expect(cloud.wardrobe).toEqual({ puppy: false });
    expect(cloud.profile).toEqual({ adj: 1, noun: 1, num: 1, hidden: false, setAt: 0 });
  });

  it('caps lists and maps at the rules limits', () => {
    const many = (n, p) => Array.from({ length: n }, (_, i) => `${p}${i}`);
    const cloud = toCloudSave({
      foundJokes: many(250, 'j'),
      unlocked: many(30, 'm'),
      upgrades: Object.fromEntries(many(30, 'u').map((id) => [id, 1])),
      wardrobe: Object.fromEntries(many(30, 'w').map((id) => [id, true])),
    });
    expect(cloud.foundJokes).toHaveLength(CLOUD_LIMITS.foundJokes);
    expect(cloud.foundJokes[0]).toBe('j0');
    expect(cloud.unlocked).toHaveLength(CLOUD_LIMITS.unlocked);
    expect(Object.keys(cloud.upgrades)).toHaveLength(CLOUD_LIMITS.upgrades);
    expect(Object.keys(cloud.wardrobe)).toHaveLength(CLOUD_LIMITS.wardrobe);
  });

  it('fromCloudSave fills local-only fields and derives coins', () => {
    const local = save({ settings: { sfx: false, music: false, voice: true }, coinsEarned: 5 });
    const cloud = toCloudSave(save({ coinsEarned: 500, upgrades: { radar: 2 }, totalPresents: 70 }));
    const full = fromCloudSave(cloud, local);
    expect(full.settings).toEqual(local.settings);
    expect(full.version).toBe(1);
    expect(full.totalPresents).toBe(70);
    expect(full.coinsEarned).toBe(500);
    expect(full.coins).toBe(500 - 160);
    expect(fromCloudSave(cloud, undefined).settings).toEqual(defaultSave().settings);
  });
});

describe('boardScores', () => {
  it('gives the four leaderboard numbers', () => {
    const s = save({ totalPresents: 140, bestPresentsInNight: 25, nights: 12, foundJokes: ['j001', 'j002', 'j002'] });
    expect(boardScores(s)).toEqual({ bestNight: 25, totalPresents: 140, jokesFound: 2, nights: 12 });
  });

  it('clamps to what firestore.rules accepts', () => {
    const s = {
      totalPresents: 5e6,
      bestPresentsInNight: 900,
      nights: 2e5,
      foundJokes: Array.from({ length: 250 }, (_, i) => `j${i}`),
    };
    expect(boardScores(s)).toEqual({
      bestNight: BOARD_LIMITS.bestNight,
      totalPresents: BOARD_LIMITS.totalPresents,
      jokesFound: BOARD_LIMITS.jokesFound,
      nights: BOARD_LIMITS.nights,
    });
    expect(boardScores({ totalPresents: 3, bestPresentsInNight: 8 }).bestNight).toBe(3);
    expect(boardScores(null)).toEqual({ bestNight: 0, totalPresents: 0, jokesFound: 0, nights: 0 });
  });

  it('takes no notice of candy, pets, baubles or the calendar', () => {
    const base = { totalPresents: 140, bestPresentsInNight: 25, nights: 12, foundJokes: ['j001'] };
    const extras = {
      candy: 900,
      candyEarned: 900,
      pets: { kitten: 5 },
      activePet: 'kitten',
      foundBaubles: ['ruby', 'icicle'],
      tree: { s0: 'ruby' },
      treeSetAt: 5000,
      advent: { year: 2026, opened: [1] },
    };
    expect(boardScores({ ...base, ...extras })).toEqual(boardScores(base));
    expect(Object.keys(boardScores(save(extras))).sort()).toEqual(['bestNight', 'jokesFound', 'nights', 'totalPresents']);
  });

  it('allows every joke in the game on the board', () => {
    expect(BOARD_LIMITS.jokesFound).toBeGreaterThanOrEqual(JOKES.length);
  });
});

describe('ensureProfile', () => {
  it('gives a nameless save a random, visible, never-chosen name', () => {
    const s = ensureProfile(save({ profile: null }), () => 0.5);
    expect(isValidNameParts(s.profile)).toBe(true);
    expect(s.profile).toEqual({ adj: 20, noun: 20, num: 50, hidden: false, setAt: 0 });
  });

  it('keeps a valid name and tidies its flags', () => {
    const s = ensureProfile(save({ profile: { adj: 3, noun: 4, num: 5, hidden: 'no', setAt: 12.4 } }));
    expect(s.profile).toEqual({ adj: 3, noun: 4, num: 5, hidden: false, setAt: 12 });
  });

  it('replaces a name outside the word lists', () => {
    const s = ensureProfile(save({ profile: { adj: ADJECTIVES.length, noun: NOUNS.length, num: NAME_NUM_MAX + 1 } }), () => 0);
    expect(s.profile).toEqual({ adj: 0, noun: 0, num: 1, hidden: false, setAt: 0 });
  });

  it('mirrors the upgrade count the rules allow', () => {
    expect(UPGRADES.length).toBeLessThanOrEqual(CLOUD_LIMITS.upgrades);
  });
});
