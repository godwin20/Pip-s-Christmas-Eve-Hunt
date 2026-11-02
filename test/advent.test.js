// The advent calendar. Dates are built in local time, the way a player's
// device sees them, so these pass in any time zone.

import { describe, it, expect } from 'vitest';
import {
  ADVENT_TUNING,
  CHOCOLATES,
  CHOCOLATE_SHAPES,
  DOOR_LAYOUT,
  getChocolate,
  isAdventTime,
  parseDebugDate,
  openedDoors,
  doorState,
  readyDoors,
  lockedDoorText,
  doorReward,
  openDoor,
  cleanAdvent,
} from '../src/game/advent.js';
import { GOLDEN_STAR_ID, getBauble } from '../src/game/baubles.js';
import { defaultSave } from '../src/core/save.js';

const ALL_DOORS = Array.from({ length: 24 }, (_, i) => i + 1);

const dec = (date, hours = 12, minutes = 0, seconds = 0) => new Date(2026, 11, date, hours, minutes, seconds);

function save(over = {}) {
  return { ...defaultSave(), ...over };
}

describe('what is behind the doors', () => {
  it('has a named chocolate for each of the 24 doors', () => {
    expect(CHOCOLATES.map((c) => c.day)).toEqual(ALL_DOORS);
    expect(new Set(CHOCOLATES.map((c) => c.name)).size).toBe(24);
    for (const c of CHOCOLATES) {
      expect(CHOCOLATE_SHAPES).toContain(c.shape);
      expect(c.colours).toHaveLength(2);
      for (const colour of c.colours) expect(colour).toMatch(/^#[0-9a-f]{6}$/);
      expect(c.name).not.toContain('—');
    }
    expect(getChocolate(24).name).toBe('Christmas Eve Gold Star');
    expect(getChocolate(25)).toBeUndefined();
  });

  it('says on door 1 that chocolate is bad for dogs', () => {
    expect(getChocolate(1).note).toMatch(/bad for dogs/);
    expect(getChocolate(1).note).not.toContain('—');
  });

  it('lays all 24 doors out, in no particular order', () => {
    expect([...DOOR_LAYOUT].sort((a, b) => a - b)).toEqual(ALL_DOORS);
    expect(DOOR_LAYOUT).not.toEqual(ALL_DOORS);
  });
});

describe('isAdventTime', () => {
  it('turns on at the first moment of 1 December', () => {
    expect(isAdventTime(new Date(2026, 10, 30, 23, 59, 59, 999))).toBe(false);
    expect(isAdventTime(new Date(2026, 11, 1, 0, 0, 0, 0))).toBe(true);
  });

  it('turns off at the first moment of 1 January', () => {
    expect(isAdventTime(new Date(2026, 11, 31, 23, 59, 59, 999))).toBe(true);
    expect(isAdventTime(new Date(2027, 0, 1, 0, 0, 0, 0))).toBe(false);
  });

  it('is off for the rest of the year', () => {
    for (let month = 0; month < 11; month++) expect(isAdventTime(new Date(2027, month, 15))).toBe(false);
  });

  it('takes milliseconds as well as a Date', () => {
    expect(isAdventTime(dec(7).getTime())).toBe(true);
    expect(isAdventTime(new Date(2026, 5, 7).getTime())).toBe(false);
  });

  it('is off for a date that makes no sense', () => {
    for (const bad of [NaN, undefined, 'soon', new Date(NaN)]) expect(isAdventTime(bad)).toBe(false);
  });

  it('is off for a clock outside the years the cloud accepts', () => {
    expect(isAdventTime(new Date(2025, 11, 7))).toBe(false);
    expect(isAdventTime(new Date(2100, 11, 7))).toBe(true);
    expect(isAdventTime(new Date(2101, 11, 7))).toBe(false);
  });
});

describe('doorState', () => {
  it('opens door 1 the moment December starts, and not the next door', () => {
    const start = dec(1, 0, 0, 0);
    expect(doorState(save(), 1, start)).toBe('ready');
    expect(doorState(save(), 2, start)).toBe('locked');
  });

  it('opens each door at the local midnight of its date', () => {
    expect(doorState(save(), 7, dec(6, 23, 59, 59))).toBe('locked');
    expect(doorState(save(), 7, dec(7, 0, 0, 0))).toBe('ready');
  });

  it('keeps every door shut in November', () => {
    const lastMinute = new Date(2026, 10, 30, 23, 59);
    for (const day of ALL_DOORS) expect(doorState(save(), day, lastMinute)).toBe('locked');
  });

  it('keeps missed doors openable up to the last moment of 31 December', () => {
    const lastMoment = dec(31, 23, 59, 59);
    for (const day of ALL_DOORS) expect(doorState(save(), day, lastMoment)).toBe('ready');
  });

  it('locks everything on 1 January, even unopened doors', () => {
    const newYear = new Date(2027, 0, 1, 0, 0, 0);
    for (const day of ALL_DOORS) expect(doorState(save(), day, newYear)).toBe('locked');
  });

  it('keeps a door showing its chocolate through December', () => {
    const s = save({ advent: { year: 2026, opened: [3] } });
    for (const date of [3, 4, 25, 31]) expect(doorState(s, 3, dec(date))).toBe('opened');
  });

  it('refuses doors that do not exist', () => {
    for (const day of [0, 25, -1, 1.5, '3', NaN, null]) expect(doorState(save(), day, dec(31))).toBe('locked');
  });
});

describe('readyDoors', () => {
  it('has every missed door for someone who first plays on 11 December', () => {
    expect(readyDoors(save(), dec(11))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('leaves out opened doors', () => {
    expect(readyDoors(save({ advent: { year: 2026, opened: [1, 3] } }), dec(4))).toEqual([2, 4]);
  });

  it('is empty once today is done, and outside December', () => {
    expect(readyDoors(save({ advent: { year: 2026, opened: [1, 2] } }), dec(2))).toEqual([]);
    expect(readyDoors(save(), new Date(2026, 10, 15))).toEqual([]);
  });
});

describe('lockedDoorText', () => {
  it('says when to come back', () => {
    expect(lockedDoorText(7)).toBe('Come back on 7 December');
  });
});

describe('doorReward', () => {
  it('gives 10 coins on an ordinary door', () => {
    for (const day of [1, 2, 6, 8, 13, 23]) expect(doorReward(day)).toEqual({ coins: 10, candy: 0, bauble: null });
  });

  it('adds 10 candy on every 7th door', () => {
    for (const day of [7, 14, 21]) expect(doorReward(day)).toEqual({ coins: 10, candy: 10, bauble: null });
  });

  it('gives 100 coins, 50 candy and the Golden Star on door 24', () => {
    expect(doorReward(24)).toEqual({ coins: 100, candy: 50, bauble: GOLDEN_STAR_ID });
    expect(getBauble(doorReward(24).bauble).name).toBe('Golden Star');
  });

  it('adds up to what the design says over the whole calendar', () => {
    const totals = ALL_DOORS.map(doorReward).reduce((sum, r) => ({ coins: sum.coins + r.coins, candy: sum.candy + r.candy }));
    expect(totals).toEqual({ coins: 23 * 10 + 100, candy: 3 * 10 + 50 });
  });
});

describe('openDoor', () => {
  it('starts this year on the first door and hands back the reward', () => {
    const s = save();
    expect(openDoor(s, 1, dec(1))).toEqual({ day: 1, chocolate: getChocolate(1), coins: 10, candy: 0, bauble: null });
    expect(s.advent).toEqual({ year: 2026, opened: [1] });
  });

  it('pays nothing itself, so coins can go through ctx.addCoins', () => {
    const s = save();
    openDoor(s, 7, dec(7));
    expect(s).toMatchObject({ coins: 0, coinsEarned: 0, candy: 0, candyEarned: 0 });
  });

  it('keeps doors in number order, whatever order they open in', () => {
    const s = save();
    openDoor(s, 5, dec(9));
    openDoor(s, 2, dec(9));
    openDoor(s, 9, dec(9));
    expect(s.advent.opened).toEqual([2, 5, 9]);
  });

  it('opens a door once', () => {
    const s = save();
    expect(openDoor(s, 1, dec(1))).not.toBeNull();
    expect(openDoor(s, 1, dec(1))).toBeNull();
    expect(s.advent.opened).toEqual([1]);
  });

  it('refuses a locked door and changes nothing', () => {
    const s = save();
    expect(openDoor(s, 8, dec(7))).toBeNull();
    expect(openDoor(s, 1, new Date(2026, 10, 30))).toBeNull();
    expect(openDoor(s, 1, new Date(2027, 0, 1))).toBeNull();
    expect(s.advent).toBeNull();
  });

  it("keeps a later year's list, so a sync can't make a door pay again", () => {
    const s = save({ advent: { year: 2027, opened: [3] } });
    expect(doorState(s, 3, dec(7))).toBe('opened');
    openDoor(s, 7, dec(7));
    expect(s.advent).toEqual({ year: 2027, opened: [3, 7] });
    expect(openDoor(s, 7, dec(7))).toBeNull();
  });

  it('starts a new year empty', () => {
    const s = save({ advent: { year: 2026, opened: [1, 2, 3, 24] } });
    const next = new Date(2027, 11, 2, 12);
    expect(openedDoors(s, next)).toEqual([]);
    expect(doorState(s, 1, next)).toBe('ready');
    expect(openDoor(s, 2, next)).not.toBeNull();
    expect(s.advent).toEqual({ year: 2027, opened: [2] });
  });

  it('can open all 24 doors', () => {
    const s = save();
    for (const day of ALL_DOORS) expect(openDoor(s, day, dec(24))).not.toBeNull();
    expect(s.advent.opened).toEqual(ALL_DOORS);
    expect(readyDoors(s, dec(24))).toEqual([]);
  });
});

describe('parseDebugDate', () => {
  it('reads a date as local time, so it never lands on the day before', () => {
    const d = parseDebugDate('2026-12-07');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 11, 7]);
    expect(doorState(save(), 7, d)).toBe('ready');
    expect(doorState(save(), 8, d)).toBe('locked');
  });

  it('refuses anything that is not a real date', () => {
    for (const bad of ['', 'soon', '2026-12', '2026-13-01', '2026-02-31', '07-12-2026', null, undefined]) {
      expect(parseDebugDate(bad)).toBeNull();
    }
  });
});

describe('cleanAdvent', () => {
  it('gives back a good calendar in door order', () => {
    expect(cleanAdvent({ year: 2026, opened: [3, 1, 2] })).toEqual({ year: 2026, opened: [1, 2, 3] });
  });

  it('drops repeats, bad doors and extra fields', () => {
    expect(cleanAdvent({ year: 2026, opened: [1, 1, 0, 25, 2.5, '3', null, 24], note: 'hi' })).toEqual({ year: 2026, opened: [1, 24] });
    expect(cleanAdvent({ year: 2026 })).toEqual({ year: 2026, opened: [] });
  });

  it('is null for anything without a year the cloud accepts', () => {
    for (const bad of [null, undefined, 'x', 7, [], {}, { opened: [1] }, { year: 2025, opened: [1] }, { year: 2101 }, { year: 2026.5 }, { year: '2026' }]) {
      expect(cleanAdvent(bad)).toBeNull();
    }
  });

  it('keeps every number at the top of the module', () => {
    expect(ADVENT_TUNING).toMatchObject({ doors: 24, doorCoins: 10, doorCandy: 10, candyEvery: 7, lastDoorCoins: 100, lastDoorCandy: 50 });
  });
});
