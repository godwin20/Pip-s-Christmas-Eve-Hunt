// The grown-ups gate's pure parts (src/ui/age-gate.js): the neutral age
// question's arithmetic, and how a pass and a "not now" are kept.

import { describe, it, expect } from 'vitest';
import {
  GATE_MIN_AGE,
  GATE_OPEN_MS,
  GATE_LOCK_MS,
  GATE_PASS_KEY,
  GATE_LOCK_KEY,
  GATE_OLDEST_YEAR,
  BIRTH_MONTHS,
  birthYears,
  ageCheck,
  passUntil,
  lockUntil,
  gateStep,
  gateOutcome,
} from '../src/ui/age-gate.js';

// Local time, like the game: 30 October 2026, mid-afternoon.
const TODAY = new Date(2026, 9, 30, 15, 0);

describe('the choices', () => {
  it('has twelve months, January first', () => {
    expect(BIRTH_MONTHS).toHaveLength(12);
    expect(BIRTH_MONTHS[0]).toBe('January');
    expect(BIRTH_MONTHS[11]).toBe('December');
  });

  it('lists every year from this one back to at least 1906, newest first', () => {
    const years = birthYears(TODAY);
    expect(years[0]).toBe(2026);
    expect(years.at(-1)).toBe(GATE_OLDEST_YEAR);
    expect(GATE_OLDEST_YEAR).toBeLessThanOrEqual(1906);
    expect(years).toHaveLength(2026 - GATE_OLDEST_YEAR + 1);
    for (let i = 1; i < years.length; i++) expect(years[i]).toBe(years[i - 1] - 1);
  });

  it('follows the clock into a new year', () => {
    expect(birthYears(new Date(2027, 0, 1))[0]).toBe(2027);
  });

  it('keeps the threshold and the windows in named constants', () => {
    expect(GATE_MIN_AGE).toBe(18);
    expect(GATE_OPEN_MS).toBe(10 * 60 * 1000);
    expect(GATE_LOCK_MS).toBe(24 * 60 * 60 * 1000);
    expect(GATE_PASS_KEY).toBe('pips-hunt-gate-until');
    expect(GATE_LOCK_KEY).toMatch(/^pips-hunt-/);
  });
});

describe('ageCheck', () => {
  it('waits until both a month and a year are picked', () => {
    expect(ageCheck('', '', TODAY)).toBe('missing');
    expect(ageCheck('3', '', TODAY)).toBe('missing');
    expect(ageCheck('', '1980', TODAY)).toBe('missing');
    expect(ageCheck(null, undefined, TODAY)).toBe('missing');
  });

  it('turns away values the selects never offer', () => {
    for (const month of ['0', '13', '1.5', 'May', ' ', -1]) expect(ageCheck(month, '1980', TODAY), String(month)).toBe('missing');
    for (const year of ['19800', 'abc', '1980.5', 1980.5]) expect(ageCheck('3', year, TODAY), String(year)).toBe('missing');
    // older than the list goes: not a pass (a year typed into the page, '0'
    // or '0012', must not count as "very old")
    for (const year of ['0', '12', '0012', String(GATE_OLDEST_YEAR - 1), 5]) expect(ageCheck('3', year, TODAY), String(year)).toBe('missing');
  });

  it('never throws, whatever it is handed', () => {
    for (const v of [{}, [], () => 1, Symbol('x'), NaN, Infinity, true]) {
      expect(() => ageCheck(v, v, TODAY)).not.toThrow();
      expect(ageCheck(v, '1980', TODAY)).toBe('missing');
    }
  });

  it('passes grown-ups and fails children', () => {
    expect(ageCheck('6', '1985', TODAY)).toBe('pass');
    expect(ageCheck('1', String(GATE_OLDEST_YEAR), TODAY)).toBe('pass');
    expect(ageCheck('6', '2016', TODAY)).toBe('fail');
    expect(ageCheck('1', '2026', TODAY)).toBe('fail');
  });

  it('takes numbers as well as the selects\' strings', () => {
    expect(ageCheck(6, 1985, TODAY)).toBe('pass');
    expect(ageCheck(6, 2016, TODAY)).toBe('fail');
  });

  it('counts the birthday only from the 1st of the month after', () => {
    // 18 in September 2026 or earlier: passed by October
    expect(ageCheck('9', '2008', TODAY)).toBe('pass');
    // born October 2008: maybe 18 already, but only counted from 1 November
    expect(ageCheck('10', '2008', TODAY)).toBe('fail');
    expect(ageCheck('10', '2008', new Date(2026, 9, 31, 23, 59))).toBe('fail');
    expect(ageCheck('10', '2008', new Date(2026, 10, 1, 0, 0))).toBe('pass');
    expect(ageCheck('11', '2008', TODAY)).toBe('fail');
  });

  it('carries a December birthday over into January', () => {
    expect(ageCheck('12', '2007', new Date(2025, 11, 31))).toBe('fail');
    expect(ageCheck('12', '2007', new Date(2026, 0, 1))).toBe('pass');
    // on New Year's Eve: born last month 18 years ago passes, this month not
    expect(ageCheck('11', '2008', new Date(2026, 11, 31, 23, 59))).toBe('pass');
    expect(ageCheck('12', '2008', new Date(2026, 11, 31, 23, 59))).toBe('fail');
    expect(ageCheck('12', '2008', new Date(2027, 0, 1, 0, 0))).toBe('pass');
  });

  it('counts a January birthday from 1 February', () => {
    expect(ageCheck('1', '2008', new Date(2026, 0, 1))).toBe('fail');
    expect(ageCheck('1', '2008', new Date(2026, 0, 31, 23, 59))).toBe('fail');
    expect(ageCheck('1', '2008', new Date(2026, 1, 1))).toBe('pass');
    // and a December one 18 years back is already in from January
    expect(ageCheck('12', '2007', new Date(2026, 0, 31))).toBe('pass');
  });

  it('has no day to get wrong in a leap year', () => {
    // born February 2008 (a leap year): in from 1 March 2026, as any year
    expect(ageCheck('2', '2008', new Date(2026, 1, 28))).toBe('fail');
    expect(ageCheck('2', '2008', new Date(2026, 2, 1))).toBe('pass');
    expect(ageCheck('2', '2010', new Date(2028, 1, 29))).toBe('fail');
    expect(ageCheck('2', '2010', new Date(2028, 2, 1))).toBe('pass');
  });

  it('fails a month that has not come yet', () => {
    expect(ageCheck('12', '2026', TODAY)).toBe('fail');
    expect(ageCheck('1', '2030', TODAY)).toBe('fail');
  });

  it('uses the threshold it is given', () => {
    expect(ageCheck('9', '2013', TODAY, 13)).toBe('pass');
    expect(ageCheck('10', '2013', TODAY, 13)).toBe('fail');
  });
});

describe('keeping the outcome', () => {
  const NOW = TODAY.getTime();

  it('keeps only when a pass or a "not now" ends, never the answer', () => {
    expect(gateOutcome('pass', NOW)).toEqual({ passUntil: NOW + GATE_OPEN_MS, lockUntil: 0 });
    expect(gateOutcome('fail', NOW)).toEqual({ passUntil: 0, lockUntil: NOW + GATE_LOCK_MS });
    expect(gateOutcome('missing', NOW)).toBeNull();
  });

  it('reads a pass back for its 10 minutes only', () => {
    const until = NOW + GATE_OPEN_MS;
    expect(passUntil(String(until), NOW)).toBe(until);
    expect(passUntil(String(until), until - 1)).toBe(until);
    expect(passUntil(String(until), until)).toBe(0);
  });

  it('ignores a pass that is missing, broken or too far ahead', () => {
    for (const raw of [null, undefined, '', 'yes', 'NaN', 'Infinity']) expect(passUntil(raw, NOW), String(raw)).toBe(0);
    expect(passUntil(String(NOW + GATE_OPEN_MS + 1), NOW)).toBe(0);
  });

  it('reads a "not now" back for its day', () => {
    const until = NOW + GATE_LOCK_MS;
    expect(lockUntil(String(until), NOW)).toBe(until);
    expect(lockUntil(String(until), until - 1)).toBe(until);
    expect(lockUntil(String(until), until)).toBe(0);
  });

  it('locks nothing when there is nothing readable', () => {
    for (const raw of [null, undefined, '', 'yes', 'NaN', '-Infinity']) expect(lockUntil(raw, NOW), String(raw)).toBe(0);
  });

  it('still locks, for a day from now, when the stored time is too far ahead', () => {
    // the clock was put back, or the value was edited: the safe way round
    expect(lockUntil(String(NOW + 5 * GATE_LOCK_MS), NOW)).toBe(NOW + GATE_LOCK_MS);
    expect(lockUntil('Infinity', NOW)).toBe(0); // not a time at all
    expect(lockUntil('9e15', NOW)).toBe(NOW + GATE_LOCK_MS);
  });
});

describe('gateStep', () => {
  const NOW = TODAY.getTime();

  it('asks when nothing holds', () => {
    expect(gateStep(0, 0, NOW)).toBe('ask');
    expect(gateStep(NOW - 1, NOW - 1, NOW)).toBe('ask');
  });

  it('goes straight through inside a pass', () => {
    expect(gateStep(NOW + 1, 0, NOW)).toBe('go');
  });

  it('shows the gentle message, not the question, inside a "not now"', () => {
    expect(gateStep(0, NOW + 1, NOW)).toBe('notNow');
  });

  it('lets a "not now" win over a pass from another tab', () => {
    expect(gateStep(NOW + GATE_OPEN_MS, NOW + GATE_LOCK_MS, NOW)).toBe('notNow');
  });

  it('asks again once the day is over', () => {
    const { lockUntil: until } = gateOutcome('fail', NOW);
    expect(gateStep(0, until, until - 1)).toBe('notNow');
    expect(gateStep(0, until, until)).toBe('ask');
  });
});
