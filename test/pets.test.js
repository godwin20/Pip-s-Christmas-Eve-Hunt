// Snow pets: prices, feeding, perks and the candy ledger.

import { describe, it, expect } from 'vitest';
import {
  PETS,
  PET_TUNING,
  MAX_PET_LEVEL,
  PET_NOTE,
  getPet,
  petLevel,
  feedCost,
  spentCandy,
  addCandy,
  buyPet,
  feedPet,
  meetPuppy,
  activePetId,
  setActivePet,
  petPerks,
  rollCaneCandy,
  perkText,
} from '../src/game/pets.js';
import { defaultSave } from '../src/core/save.js';
import { createRng } from '../src/core/rng.js';

function save(over = {}) {
  const candyEarned = over.candyEarned ?? 0;
  const pets = over.pets ?? {};
  return { ...defaultSave(), ...over, candyEarned, pets, candy: candyEarned - spentCandy(pets) };
}

function ledgerOk(s) {
  return s.candy === s.candyEarned - spentCandy(s.pets) && s.candy >= 0;
}

describe('the pet list', () => {
  it('has the four pets at the designed prices', () => {
    expect(PETS.map((p) => [p.id, p.price])).toEqual([
      ['puppy', null],
      ['kitten', 40],
      ['reindeer', 80],
      ['penguin', 120],
    ]);
    expect(PET_TUNING.feedCosts).toEqual([10, 20, 35, 55]);
    expect(MAX_PET_LEVEL).toBe(5);
  });

  it('finds pets by id and nothing else', () => {
    expect(getPet('kitten').name).toBe('Frost Kitten');
    expect(getPet('constructor')).toBeUndefined();
  });

  it('keeps the note for children about real pets', () => {
    expect(PET_NOTE).toBe('Snow pets only eat magic candy. Real pets should never have sweets or chocolate.');
  });
});

describe('spentCandy', () => {
  it('adds the price and every feed', () => {
    expect(spentCandy({})).toBe(0);
    expect(spentCandy({ kitten: 1 })).toBe(40);
    expect(spentCandy({ kitten: 3 })).toBe(40 + 10 + 20);
    expect(spentCandy({ penguin: 5 })).toBe(120 + 10 + 20 + 35 + 55);
  });

  it('charges the free Snow Puppy for its feeding only', () => {
    expect(spentCandy({ puppy: 1 })).toBe(0);
    expect(spentCandy({ puppy: 5 })).toBe(120);
  });

  it('adds up every pet', () => {
    expect(spentCandy({ puppy: 2, kitten: 1, reindeer: 2, penguin: 1 })).toBe(10 + 40 + 90 + 120);
  });

  it('copes with junk', () => {
    expect(spentCandy(null)).toBe(0);
    expect(spentCandy(undefined)).toBe(0);
    expect(spentCandy('kitten')).toBe(0);
    expect(spentCandy({ kitten: 'lots', reindeer: null, penguin: -2, bogus: 5 })).toBe(0);
    expect(spentCandy({ kitten: 99 })).toBe(spentCandy({ kitten: 5 }));
  });
});

describe('buying and feeding', () => {
  it('buys a pet with exactly enough candy', () => {
    const s = save({ candyEarned: 40 });
    expect(buyPet(s, 'kitten')).toBe(true);
    expect(s).toMatchObject({ candy: 0, candyEarned: 40, pets: { kitten: 1 } });
    expect(ledgerOk(s)).toBe(true);
  });

  it('refuses when short of candy, and changes nothing', () => {
    const s = save({ candyEarned: 39 });
    expect(buyPet(s, 'kitten')).toBe(false);
    expect(s).toMatchObject({ candy: 39, pets: {} });
  });

  it('never buys the same pet twice', () => {
    const s = save({ candyEarned: 200, pets: { kitten: 2 } });
    const before = s.candy;
    expect(buyPet(s, 'kitten')).toBe(false);
    expect(s.candy).toBe(before);
    expect(s.pets.kitten).toBe(2);
  });

  it('never sells the Snow Puppy or a pet that does not exist', () => {
    const s = save({ candyEarned: 1000 });
    expect(buyPet(s, 'puppy')).toBe(false);
    expect(buyPet(s, 'dragon')).toBe(false);
    expect(buyPet(s, 'constructor')).toBe(false);
    expect(s).toMatchObject({ candy: 1000, pets: {} });
  });

  it('feeds level by level at the designed costs, up to level 5', () => {
    const s = save({ candyEarned: 40 + 120, pets: {} });
    buyPet(s, 'kitten');
    const costs = [];
    while (feedCost(s, 'kitten') !== null) {
      costs.push(feedCost(s, 'kitten'));
      expect(feedPet(s, 'kitten')).toBe(true);
      expect(ledgerOk(s)).toBe(true);
    }
    expect(costs).toEqual([10, 20, 35, 55]);
    expect(petLevel(s, 'kitten')).toBe(5);
    expect(s.candy).toBe(0);
    expect(feedPet(s, 'kitten')).toBe(false);
  });

  it('refuses to feed a pet you do not have', () => {
    const s = save({ candyEarned: 500 });
    expect(feedCost(s, 'kitten')).toBeNull();
    expect(feedPet(s, 'kitten')).toBe(false);
    expect(feedPet(s, 'dragon')).toBe(false);
    expect(s.candy).toBe(500);
  });

  it('refuses to feed when short of candy', () => {
    const s = save({ candyEarned: 49, pets: { kitten: 1 } });
    expect(s.candy).toBe(9);
    expect(feedPet(s, 'kitten')).toBe(false);
    expect(s.pets.kitten).toBe(1);
  });

  it('feeds the Snow Puppy once it has joined', () => {
    const s = save({ candyEarned: 25 });
    expect(feedPet(s, 'puppy')).toBe(false);
    expect(meetPuppy(s)).toBe(true);
    expect(feedPet(s, 'puppy')).toBe(true);
    expect(s).toMatchObject({ candy: 15, pets: { puppy: 2 } });
    expect(ledgerOk(s)).toBe(true);
  });
});

describe('meetPuppy', () => {
  it('adds the puppy for free the first time only', () => {
    const s = save({ candyEarned: 7 });
    expect(meetPuppy(s)).toBe(true);
    expect(s).toMatchObject({ candy: 7, pets: { puppy: 1 } });
    s.pets.puppy = 3;
    s.candy = s.candyEarned - spentCandy(s.pets);
    expect(meetPuppy(s)).toBe(false);
    expect(s.pets.puppy).toBe(3);
  });
});

describe('addCandy', () => {
  it('adds to both sides of the ledger', () => {
    const s = save({ candyEarned: 5 });
    expect(addCandy(s, 4)).toBe(4);
    expect(s).toMatchObject({ candy: 9, candyEarned: 9 });
    expect(ledgerOk(s)).toBe(true);
  });

  it('rounds, and ignores anything that is not a number', () => {
    const s = save({ candyEarned: 5 });
    expect(addCandy(s, 2.6)).toBe(3);
    expect(addCandy(s, NaN)).toBe(0);
    expect(addCandy(s, Infinity)).toBe(0);
    expect(addCandy(s, undefined)).toBe(0);
    expect(s.candy).toBe(8);
  });

  it('never goes below zero', () => {
    const s = save({ candyEarned: 5 });
    expect(addCandy(s, -50)).toBe(-5);
    expect(s).toMatchObject({ candy: 0, candyEarned: 0 });
  });
});

describe('choosing who comes along', () => {
  it('takes a pet you own, and null for nobody', () => {
    const s = save({ candyEarned: 40, pets: { kitten: 1 } });
    expect(setActivePet(s, 'kitten')).toBe(true);
    expect(activePetId(s)).toBe('kitten');
    expect(setActivePet(s, null)).toBe(true);
    expect(s.activePet).toBeNull();
  });

  it('refuses a pet you do not own and keeps the last choice', () => {
    const s = save({ candyEarned: 40, pets: { kitten: 1 } });
    setActivePet(s, 'kitten');
    expect(setActivePet(s, 'penguin')).toBe(false);
    expect(setActivePet(s, 'dragon')).toBe(false);
    expect(s.activePet).toBe('kitten');
  });

  it('never picks the Snow Puppy, who has its own rules', () => {
    const s = save({ pets: { puppy: 3 } });
    expect(setActivePet(s, 'puppy')).toBe(false);
    expect(s.activePet).toBeNull();
    expect(activePetId({ ...s, activePet: 'puppy' })).toBeNull();
  });

  it('reads a stale or junk choice as nobody', () => {
    for (const activePet of ['kitten', 'dragon', 7, true, {}, undefined]) {
      expect(activePetId(save({ activePet }))).toBeNull();
    }
  });
});

describe('petPerks', () => {
  const brought = (id, level) => save({ candyEarned: 1000, pets: { [id]: level }, activePet: id });

  it('does nothing without pets', () => {
    expect(petPerks(defaultSave())).toEqual({ sniffMult: 1, giftSeconds: 40, giftCoins: 0, speedMult: 1, caneBonus: 0 });
  });

  it('sniffs 15% further per level above 1', () => {
    expect(petPerks(save({ pets: { puppy: 1 } })).sniffMult).toBe(1);
    expect(petPerks(save({ pets: { puppy: 2 } })).sniffMult).toBeCloseTo(1.15);
    expect(petPerks(save({ pets: { puppy: 5 } })).sniffMult).toBeCloseTo(1.6);
  });

  it('brings 2 x level coins every 40 seconds', () => {
    expect(petPerks(brought('kitten', 1))).toMatchObject({ giftSeconds: 40, giftCoins: 2 });
    expect(petPerks(brought('kitten', 5)).giftCoins).toBe(10);
  });

  it('runs 2% faster per level', () => {
    expect(petPerks(brought('reindeer', 1)).speedMult).toBeCloseTo(1.02);
    expect(petPerks(brought('reindeer', 5)).speedMult).toBeCloseTo(1.1);
  });

  it('gives +1, +1, +2, +2, +3 candy per cane', () => {
    expect([1, 2, 3, 4, 5].map((lvl) => petPerks(brought('penguin', lvl)).caneBonus)).toEqual([1, 1, 2, 2, 3]);
  });

  it('only counts the pet that comes along', () => {
    const s = save({ candyEarned: 1000, pets: { kitten: 3, reindeer: 3, penguin: 3 }, activePet: 'reindeer' });
    expect(petPerks(s)).toMatchObject({ giftCoins: 0, caneBonus: 0 });
    expect(petPerks(s).speedMult).toBeCloseTo(1.06);
  });
});

describe('rollCaneCandy', () => {
  it('gives 2 to 4, and all three happen', () => {
    const rng = createRng(11);
    const seen = new Set();
    for (let i = 0; i < 300; i++) seen.add(rollCaneCandy(rng, defaultSave()));
    expect([...seen].sort()).toEqual([2, 3, 4]);
  });

  it("adds the Penguin Chick's bonus", () => {
    const rng = createRng(12);
    const s = save({ candyEarned: 1000, pets: { penguin: 5 }, activePet: 'penguin' });
    const seen = new Set();
    for (let i = 0; i < 300; i++) seen.add(rollCaneCandy(rng, s));
    expect([...seen].sort()).toEqual([5, 6, 7]);
  });
});

describe('perkText', () => {
  it('says what each level does', () => {
    expect(perkText('puppy', 1)).toBe('Sniffs out treats nearby');
    expect(perkText('puppy', 3)).toBe('Sniffs 30% further');
    expect(perkText('kitten', 2)).toBe('Brings 4 coins every 40 seconds');
    expect(perkText('reindeer', 5)).toBe('Pip runs 10% faster');
    expect(perkText('penguin', 3)).toBe('+2 candy from every cane');
  });

  it('uses plain words everywhere, with no em dashes', () => {
    const words = PETS.flatMap((p) => [p.name, p.blurb, ...[1, 2, 3, 4, 5].map((lvl) => perkText(p.id, lvl))]);
    for (const text of [...words, PET_NOTE]) {
      expect(text).not.toBe('');
      expect(text).not.toContain('—');
    }
  });
});
