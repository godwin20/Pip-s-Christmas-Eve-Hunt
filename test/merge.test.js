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

describe('toCloudSave / fromCloudSave', () => {
  it('strips coins, settings and version', () => {
    const cloud = toCloudSave(save({ coinsEarned: 50 }));
    expect(cloud).not.toHaveProperty('coins');
    expect(cloud).not.toHaveProperty('settings');
    expect(cloud).not.toHaveProperty('version');
    expect(Object.keys(cloud).sort()).toEqual(
      ['bestPresentsInNight', 'coinsEarned', 'epoch', 'foundJokes', 'nights', 'profile', 'totalCrackers',
        'totalPresents', 'unlocked', 'upgrades', 'wardrobe'].sort(),
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
      foundJokes: Array.from({ length: 150 }, (_, i) => `j${i}`),
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
