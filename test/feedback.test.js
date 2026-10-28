// The pure feedback helpers (src/cloud/feedback.js): what a feedback doc may
// hold. firestore.rules checks the same lists (test/rules.test.js).

import { describe, it, expect } from 'vitest';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_QUICK,
  FEEDBACK_QUICK_MAX,
  FEEDBACK_COMMENT_MAX,
  APP_VERSION,
  cleanFeedback,
  cleanSeed,
  detectDeviceType,
} from '../src/cloud/feedback.js';

const OK = { rating: 3, category: 'gameplay', quick: [], comment: '', islandSeed: 7, deviceType: 'desktop', appVersion: '1.2.3' };

describe('feedback lists', () => {
  it('has the four topics and six quick notes with stable ids', () => {
    expect(FEEDBACK_CATEGORIES.map((c) => c.id)).toEqual(['bug', 'idea', 'wardrobe', 'gameplay']);
    expect(FEEDBACK_QUICK.map((q) => q.id)).toEqual(['loved', 'tooHard', 'tooEasy', 'broke', 'moreClothes', 'moreJokes']);
    for (const item of [...FEEDBACK_CATEGORIES, ...FEEDBACK_QUICK]) {
      expect(item.label).toBeTruthy();
      expect(item.icon).toBeTruthy();
    }
    expect(FEEDBACK_QUICK_MAX).toBe(3);
    expect(FEEDBACK_COMMENT_MAX).toBe(300);
  });

  it('has a short app version', () => {
    expect(typeof APP_VERSION).toBe('string');
    expect(APP_VERSION.length).toBeGreaterThan(0);
    expect(APP_VERSION.length).toBeLessThanOrEqual(40);
  });
});

describe('cleanFeedback', () => {
  it('keeps a valid payload as it is', () => {
    expect(cleanFeedback(OK)).toEqual(OK);
  });

  it('needs a whole-number rating of 1 to 5 and a known topic', () => {
    for (const rating of [1, 5]) expect(cleanFeedback({ ...OK, rating })).not.toBeNull();
    for (const rating of [0, 6, 2.5, '3', null, undefined, NaN]) expect(cleanFeedback({ ...OK, rating })).toBeNull();
    for (const category of ['Bug', 'hack', '', null, 1]) expect(cleanFeedback({ ...OK, category })).toBeNull();
  });

  it('allows up to three known quick notes, once each, in list order', () => {
    expect(cleanFeedback({ ...OK, quick: ['moreJokes', 'loved', 'moreJokes'] }).quick).toEqual(['loved', 'moreJokes']);
    expect(cleanFeedback({ ...OK, quick: undefined }).quick).toEqual([]);
    expect(cleanFeedback({ ...OK, quick: ['loved', 'tooHard', 'tooEasy', 'broke'] })).toBeNull();
    expect(cleanFeedback({ ...OK, quick: ['loved', 'Loved'] })).toBeNull();
    expect(cleanFeedback({ ...OK, quick: [1] })).toBeNull();
    expect(cleanFeedback({ ...OK, quick: { loved: true } })).toBeNull();
  });

  it('trims the note and caps it at 300 characters', () => {
    expect(cleanFeedback({ ...OK, comment: '  hi\r\nthere  ' }).comment).toBe('hi\nthere');
    expect(cleanFeedback({ ...OK, comment: undefined }).comment).toBe('');
    expect(cleanFeedback({ ...OK, comment: 'é'.repeat(300) }).comment).toHaveLength(300);
    expect(cleanFeedback({ ...OK, comment: 'x'.repeat(301) })).toBeNull();
    expect(cleanFeedback({ ...OK, comment: ['x'] })).toBeNull();
  });

  it('turns an odd map number into null, and fills in device and version', () => {
    expect(cleanFeedback({ ...OK, islandSeed: '?' }).islandSeed).toBeNull();
    expect(cleanFeedback({ ...OK, islandSeed: -1 }).islandSeed).toBeNull();
    const filled = cleanFeedback({ rating: 2, category: 'bug' });
    expect(filled).toEqual({ rating: 2, category: 'bug', quick: [], comment: '', islandSeed: null, deviceType: 'desktop', appVersion: APP_VERSION });
    expect(cleanFeedback({ ...OK, deviceType: 'phone' }).deviceType).toBe('desktop');
    expect(cleanFeedback({ ...OK, appVersion: 'v'.repeat(60) }).appVersion).toHaveLength(40);
  });
});

describe('cleanSeed', () => {
  it('keeps whole map numbers in range and nothing else', () => {
    expect(cleanSeed(123456)).toBe(123456);
    expect(cleanSeed('654321')).toBe(654321);
    expect(cleanSeed(0)).toBe(0);
    expect(cleanSeed(999999999)).toBe(999999999);
    for (const v of [null, undefined, '?', 1.5, -3, 1000000000, '12a', {}, NaN]) expect(cleanSeed(v)).toBeNull();
  });
});

describe('detectDeviceType', () => {
  const win = (matches, maxTouchPoints = 0) => ({
    matchMedia: (q) => ({ matches: !!matches[q] }),
    navigator: { maxTouchPoints },
  });

  it('says touch for a coarse pointer, or touch without hover', () => {
    expect(detectDeviceType(win({ '(pointer: coarse)': true }, 5))).toBe('touch');
    expect(detectDeviceType(win({ '(hover: none)': true }, 5))).toBe('touch');
  });

  it('says desktop for a mouse, a touch laptop with a mouse, or no window', () => {
    expect(detectDeviceType(win({}, 0))).toBe('desktop');
    expect(detectDeviceType(win({}, 10))).toBe('desktop');
    expect(detectDeviceType(null)).toBe('desktop');
    expect(detectDeviceType({ matchMedia: () => { throw new Error('nope'); } })).toBe('desktop');
  });
});
