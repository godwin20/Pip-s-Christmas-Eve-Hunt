// The cracker rule: what each cracker gives, the rainbow cracker every island is
// promised, and the limits the joke list has to stay inside.

import { describe, it, expect } from 'vitest';
import { createRng } from '../src/core/rng.js';
import { JOKES } from '../src/data/jokes.js';
import { CLOUD_LIMITS } from '../src/cloud/merge.js';
import { RARITY_COINS, rollRarity, rollNightRarities, pickJoke, jokesLeft, notesLeft } from '../src/game/crackers.js';

const SEEDS = Array.from({ length: 80 }, (_, i) => i + 1);
const idsWhere = (test) => JOKES.filter(test).map((j) => j.id);
const ALL = idsWhere(() => true);
const NOTES = idsWhere((j) => j.rarity === 'legendary');
const NOT_NOTES = idsWhere((j) => j.rarity !== 'legendary');
const ofRarity = (rarity) => idsWhere((j) => j.rarity === rarity);

// Every seed, so one lucky roll can't hide a wrong branch.
function picks(rarity, foundIds) {
  return SEEDS.map((seed) => pickJoke(createRng(seed), rarity, foundIds));
}

function plainRolls(seed, count, jokeLuck) {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rollRarity(rng, jokeLuck));
}

describe('pickJoke', () => {
  it("starts with an unseen joke of the cracker's own rarity", () => {
    for (const rarity of ['common', 'rare', 'legendary']) {
      for (const { joke, isNew } of picks(rarity, [])) {
        expect(isNew).toBe(true);
        expect(joke.rarity).toBe(rarity);
      }
    }
  });

  it('moves on to another rarity once its own is found, but never to a Note', () => {
    for (const { joke, isNew } of picks('common', ofRarity('common'))) {
      expect(isNew).toBe(true);
      expect(joke.rarity).toBe('rare');
    }
    for (const { joke, isNew } of picks('rare', ofRarity('rare'))) {
      expect(isNew).toBe(true);
      expect(joke.rarity).toBe('common');
    }
  });

  it('never gives a common or gold cracker an unseen Note', () => {
    for (const rarity of ['common', 'rare']) {
      for (const { joke, isNew } of picks(rarity, NOT_NOTES)) {
        expect(isNew).toBe(false);
        expect(joke.rarity).toBe(rarity);
      }
    }
  });

  it('still finds the last joke that is not a Note before any repeat', () => {
    const last = NOT_NOTES.at(-1);
    const found = NOT_NOTES.slice(0, -1);
    for (const rarity of ['common', 'rare']) {
      for (const { joke, isNew } of picks(rarity, found)) {
        expect(isNew).toBe(true);
        expect(joke.id).toBe(last);
      }
    }
  });

  it('gives a rainbow cracker a Note while any are left', () => {
    const last = NOTES.at(-1);
    for (const { joke, isNew } of picks('legendary', NOTES.slice(0, -1))) {
      expect(isNew).toBe(true);
      expect(joke.id).toBe(last);
    }
  });

  it('gives a rainbow cracker any other unseen joke once the Notes are gone', () => {
    for (const { joke, isNew } of picks('legendary', NOTES)) {
      expect(isNew).toBe(true);
      expect(joke.rarity).not.toBe('legendary');
    }
  });

  it("repeats the cracker's own rarity once the gallery is full", () => {
    for (const rarity of ['common', 'rare', 'legendary']) {
      for (const { joke, isNew } of picks(rarity, ALL)) {
        expect(isNew).toBe(false);
        expect(joke.rarity).toBe(rarity);
      }
    }
  });

  it('leaves the list of finds alone', () => {
    const found = NOTES.slice(0, 2);
    pickJoke(createRng(1), 'common', found);
    expect(found).toEqual(NOTES.slice(0, 2));
  });
});

describe('counting what is left', () => {
  it('counts the Notes not found yet, ignoring everything else', () => {
    expect(notesLeft([])).toBe(NOTES.length);
    expect(notesLeft(NOT_NOTES)).toBe(NOTES.length);
    expect(notesLeft([NOTES[0], NOTES[0], 'not-a-joke'])).toBe(NOTES.length - 1);
    expect(notesLeft(NOTES)).toBe(0);
  });

  it('counts the whole gallery the same way', () => {
    expect(jokesLeft([])).toBe(JOKES.length);
    expect(jokesLeft([ALL[0], ALL[0], 'not-a-joke'])).toBe(JOKES.length - 1);
    expect(jokesLeft(ALL)).toBe(0);
  });
});

describe('rollNightRarities', () => {
  it('gives every island a rainbow cracker while Notes remain', () => {
    const oneLeft = NOTES.slice(0, -1);
    for (const jokeLuck of [0, 1, 2, 3]) {
      for (const seed of SEEDS) {
        expect(rollNightRarities(createRng(seed), 15, jokeLuck, oneLeft)).toContain('legendary');
      }
    }
  });

  it('keeps the promise on a tiny island too', () => {
    for (const seed of SEEDS) expect(rollNightRarities(createRng(seed), 1, 0, [])).toEqual(['legendary']);
  });

  it('turns only one roll, and only when the rolls gave no rainbow cracker', () => {
    let promised = 0;
    for (const seed of SEEDS) {
      const plain = plainRolls(seed, 15, 0);
      const night = rollNightRarities(createRng(seed), 15, 0, []);
      const changed = plain.filter((r, i) => r !== night[i]).length;
      if (plain.includes('legendary')) {
        expect(night).toEqual(plain);
      } else {
        expect(changed).toBe(1);
        promised++;
      }
    }
    expect(promised).toBeGreaterThan(0); // or this test proved nothing
  });

  it('makes no promise once the Notes are gone', () => {
    for (const seed of SEEDS) {
      expect(rollNightRarities(createRng(seed), 15, 0, NOTES)).toEqual(plainRolls(seed, 15, 0));
    }
    const noRainbow = SEEDS.filter((seed) => !rollNightRarities(createRng(seed), 15, 0, ALL).includes('legendary'));
    expect(noRainbow.length).toBeGreaterThan(0);
  });

  it('copes with an island with no crackers', () => {
    expect(rollNightRarities(createRng(1), 0, 0, [])).toEqual([]);
  });

  it('gives more rainbow crackers with a better Joke Detector', () => {
    const count = (jokeLuck) =>
      SEEDS.reduce((n, seed) => n + rollNightRarities(createRng(seed), 15, jokeLuck, ALL).filter((r) => r === 'legendary').length, 0);
    expect(count(3)).toBeGreaterThan(count(0));
  });
});

describe('the joke list', () => {
  it('gives every entry a valid rarity and kind, with Notes only ever legendary', () => {
    for (const j of JOKES) {
      expect(['joke', 'quote', 'secret']).toContain(j.kind);
      expect(Object.keys(RARITY_COINS)).toContain(j.rarity);
      expect(j.kind === 'secret').toBe(j.rarity === 'legendary');
      expect(typeof j.q).toBe('string');
      expect(typeof j.a).toBe('string');
      expect(j.q && j.a).toBeTruthy();
    }
  });

  it('never uses an id twice', () => {
    expect(new Set(ALL).size).toBe(JOKES.length);
  });

  it('fits the cloud cap, which would otherwise cut finds on sync without a word', () => {
    expect(JOKES.length).toBeLessThanOrEqual(CLOUD_LIMITS.foundJokes);
  });
});
