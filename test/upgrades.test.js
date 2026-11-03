// The Workshop's upgrades: the prices saves are built on, what each level turns
// on, and the Lucky Bow's weights.

import { describe, it, expect } from 'vitest';
import { defaultSave } from '../src/core/save.js';
import { UPGRADES, MAX_LEVEL, computeStats } from '../src/game/upgrades.js';
import { SURPRISE_TUNING, getSurprise, surpriseWeight } from '../src/game/surprises.js';

const statsFor = (upgrades) => computeStats({ ...defaultSave(), upgrades });

describe('the upgrade list', () => {
  it('keeps every id and cost: coins are derived from them, so a change re-prices every save', () => {
    expect(Object.fromEntries(UPGRADES.map((u) => [u.id, u.costs]))).toEqual({
      radar: [40, 120, 300],
      crackerSense: [50, 150, 350],
      compass: [80, 200, 450],
      speedy: [40, 110, 260],
      longerNight: [60, 160, 380],
      luckyBow: [70, 180, 400],
      magnet: [60, 170, 380],
      sack: [50, 140, 320],
      jokeDetector: [60, 160, 360],
    });
  });

  it('has a line of text for every level, with no em dashes', () => {
    for (const u of UPGRADES) {
      expect(u.levels).toHaveLength(MAX_LEVEL);
      for (const text of [u.blurb, ...u.levels]) {
        expect(text).toBeTruthy();
        expect(text).not.toMatch(/[—–]/);
      }
    }
  });
});

describe('what each level turns on', () => {
  it('moves the rarity colours to Cracker Sense 2, and the rainbow arrow to 3', () => {
    const at = (level) => statsFor({ crackerSense: level });
    expect([0, 1, 2, 3].map((l) => at(l).radarShowCrackers)).toEqual([false, true, true, true]);
    expect([0, 1, 2, 3].map((l) => at(l).radarRarity)).toEqual([false, false, true, true]);
    expect([0, 1, 2, 3].map((l) => at(l).radarRainbowArrow)).toEqual([false, false, false, true]);
    expect([0, 1, 2, 3].map((l) => at(l).radarPingSeconds)).toEqual([3, 3, 1.5, 1.5]);
  });

  it('shows canes at Radar Range 3, at the same 90 m', () => {
    const at = (level) => statsFor({ radar: level });
    expect([0, 1, 2, 3].map((l) => at(l).radarCanes)).toEqual([false, false, false, true]);
    expect([0, 1, 2, 3].map((l) => at(l).radarRange)).toEqual([25, 40, 60, 90]);
  });
});

describe('the Lucky Bow', () => {
  const mega = getSurprise('mega');
  const santa = getSurprise('santa');

  it('doubles the Mega Present at level 3, on top of its normal growth', () => {
    expect(SURPRISE_TUNING.megaLuckyMult).toBe(2);
    expect(surpriseWeight(mega, 0)).toBe(mega.weight);
    expect(surpriseWeight(mega, 2)).toBeCloseTo(mega.weight * 1.3);
    expect(surpriseWeight(mega, 3)).toBeCloseTo(mega.weight * 1.45 * 2);
  });

  it('leaves Santa at base + level, and the other nice surprises as they were', () => {
    expect(surpriseWeight(santa, 3)).toBe(santa.weight + 3);
    const timeElf = getSurprise('timeElf');
    expect(surpriseWeight(timeElf, 3)).toBeCloseTo(timeElf.weight * 1.45);
  });
});
