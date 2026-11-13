// The menus' drawings, which are plain data that can drift from the game
// modules they draw, and the small rules behind what the menus say. The screens
// themselves are checked in a browser.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { chocolateHTML, treeSpotPlaces, galleryNews, notesGoal, hidingText, lockedPreview, huntComplete, maxedHint, controlsList } from '../src/ui/screens.js';
import { CHOCOLATES, CHOCOLATE_SHAPES } from '../src/game/advent.js';
import { BAUBLES, BAUBLE_PATTERNS, TREE_SLOTS } from '../src/game/baubles.js';
import { JOKES } from '../src/data/jokes.js';
import { UPGRADES, MAX_LEVEL } from '../src/game/upgrades.js';

const css = readFileSync(new URL('../src/ui/screens.css', import.meta.url), 'utf8');

describe('advent chocolates', () => {
  it('draws every shape on its own, not the fallback', () => {
    const drawings = CHOCOLATE_SHAPES.map((shape) => chocolateHTML({ shape, colours: ['#111111', '#222222'] }));
    expect(new Set(drawings).size).toBe(CHOCOLATE_SHAPES.length);
  });

  it('draws each chocolate in its own colours', () => {
    for (const choc of CHOCOLATES) {
      const svg = chocolateHTML(choc);
      expect(svg, choc.name).toContain('<svg');
      expect(svg, choc.name).toContain(choc.colours[0]);
      expect(svg, choc.name).toContain(choc.colours[1]);
    }
  });
});

describe('baubles', () => {
  it('has a CSS pattern for every design', () => {
    const patterns = new Set(BAUBLES.map((b) => b.pattern));
    for (const pattern of BAUBLE_PATTERNS) {
      if (pattern === 'plain') continue; // .scr-bauble's own background
      expect(css, pattern).toContain(`.scr-bauble[data-pattern='${pattern}']`);
      expect(patterns.has(pattern), pattern).toBe(true);
    }
  });
});

describe("the Wardrobe's tree", () => {
  const places = treeSpotPlaces().map((p) => ({ x: parseFloat(p.left), y: parseFloat(p.top) }));

  it('has a place for every slot, inside the drawing', () => {
    expect(places).toHaveLength(TREE_SLOTS.length);
    for (const { x, y } of places) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(100);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(100);
    }
  });

  it('never lets two spots overlap, so each stays easy to tap', () => {
    const SPOT = 15; // .scr-xtree__spot's width, as % of the drawing's width
    const tall = 340 / 300; // heights are % of the height, so scale them back
    for (let i = 0; i < places.length; i++) {
      for (let j = i + 1; j < places.length; j++) {
        const dist = Math.hypot(places[i].x - places[j].x, (places[i].y - places[j].y) * tall);
        expect(dist, `${TREE_SLOTS[i]} and ${TREE_SLOTS[j]}`).toBeGreaterThanOrEqual(SPOT);
      }
    }
  });
});

describe('Gallery news on the Results screen', () => {
  const TOTAL = 200;

  it('celebrates on the night the last joke lands', () => {
    expect(galleryNews(TOTAL, 1, TOTAL)).toEqual({ full: true, text: 'You found every joke, saying and Secret Note. All 200!' });
  });

  it('stays quiet on a later night, with a full Gallery and nothing new', () => {
    expect(galleryNews(TOTAL, 0, TOTAL)).toBeNull();
  });

  it('says nothing about 25s on the night the Gallery fills, as 200 is one', () => {
    expect(galleryNews(TOTAL, 3, TOTAL).full).toBe(true);
  });

  it('marks the night the count reaches or passes a multiple of 25', () => {
    expect(galleryNews(50, 1, TOTAL)).toEqual({ full: false, text: '50 jokes in your Gallery! 150 still hiding.' });
    expect(galleryNews(53, 6, TOTAL).text).toBe('50 jokes in your Gallery! 147 still hiding.');
  });

  it('names the highest one when a night passes two', () => {
    expect(galleryNews(77, 30, TOTAL).text).toBe('75 jokes in your Gallery! 123 still hiding.');
  });

  it('stays quiet when no multiple of 25 was crossed tonight', () => {
    expect(galleryNews(24, 5, TOTAL)).toBeNull();
    expect(galleryNews(51, 1, TOTAL)).toBeNull(); // started on 50, so that was last night
    expect(galleryNews(50, 0, TOTAL)).toBeNull();
  });

  it('never counts 0 as a multiple, if the save was wiped behind the Results screen', () => {
    expect(galleryNews(0, 3, TOTAL)).toBeNull();
  });

  it('goes by the Gallery it is given, whatever its size', () => {
    expect(galleryNews(102, 2, 102).full).toBe(true);
    expect(galleryNews(101, 2, 102).text).toBe('100 jokes in your Gallery! 1 still hiding.');
  });
});

describe('the Secret Notes goal', () => {
  const noteIds = JOKES.filter((j) => j.rarity === 'legendary').map((j) => j.id);
  const otherIds = JOKES.filter((j) => j.rarity !== 'legendary').map((j) => j.id);

  it('shows the whole way to go before the first Note', () => {
    expect(notesGoal([])).toEqual({ have: 0, total: noteIds.length });
  });

  it('counts Notes only, whatever else has been found', () => {
    expect(notesGoal([...otherIds, noteIds[0], noteIds[1]])).toEqual({ have: 2, total: noteIds.length });
  });

  it('goes away with the last Note, even if other jokes remain', () => {
    expect(notesGoal(noteIds)).toBeNull();
  });

  it('agrees with the Secrets filter, which goes by kind', () => {
    for (const j of JOKES) expect(j.kind === 'secret', j.id).toBe(j.rarity === 'legendary');
  });
});

describe("the Gallery's locked cards", () => {
  const cards = (n) => Array.from({ length: n }, (_, i) => ({ id: `x${i}` }));

  it('shows a short list in full, with no extra line', () => {
    expect(lockedPreview([])).toEqual({ shown: [], more: null });
    const { shown, more } = lockedPreview(cards(24));
    expect(shown).toHaveLength(24);
    expect(more).toBeNull();
  });

  it('stops after the first 24, in order, and says how many more', () => {
    const list = cards(25);
    const { shown, more } = lockedPreview(list);
    expect(shown).toEqual(list.slice(0, 24));
    expect(more).toBe('...and 1 more hiding in crackers.');
    expect(lockedPreview(cards(198)).more).toBe('...and 174 more hiding in crackers.');
  });

  it('teaches where Notes hide on the Secrets filter only', () => {
    expect(hidingText('secret', 12)).toBe('🌈 Secret Notes hide in rainbow crackers. Still hiding: 12');
    for (const filter of ['all', 'joke', 'quote']) expect(hidingText(filter, 12)).toBe('🔒 Still hiding in crackers: 12');
  });
});

describe('the end of the hunt', () => {
  const allIds = JOKES.map((j) => j.id);
  const maxed = Object.fromEntries(UPGRADES.map((u) => [u.id, MAX_LEVEL]));

  it('needs every joke and every upgrade', () => {
    expect(huntComplete({ foundJokes: allIds, upgrades: maxed })).toBe(true);
  });

  it('says nothing to a player with only one of the two', () => {
    expect(huntComplete({ foundJokes: allIds, upgrades: {} })).toBe(false);
    expect(huntComplete({ foundJokes: allIds.slice(1), upgrades: maxed })).toBe(false);
  });

  it('says nothing while one upgrade has a level to go', () => {
    expect(huntComplete({ foundJokes: allIds, upgrades: { ...maxed, [UPGRADES[0].id]: MAX_LEVEL - 1 } })).toBe(false);
  });

  it('does not count an id the game no longer has', () => {
    expect(huntComplete({ foundJokes: [...allIds.slice(1), 'j999'], upgrades: maxed })).toBe(false);
  });

  it('adds the all-time coins to the all-maxed line', () => {
    expect(maxedHint(12345)).toBe(
      "✨ Wow! Every upgrade is maxed out. Pip is the best-equipped penguin in the North Pole! You've earned 12,345 coins in all."
    );
  });
});

describe("How to Play's controls", () => {
  const KEYS = ['W', 'A', 'S', 'D', 'E', 'Enter', 'Click', 'Space', 'Shift', 'Tab', 'Esc', 'Wheel', 'Touch'];

  it('tells touch players about touch, with no key or mouse in sight', () => {
    const list = controlsList(true);
    for (const c of list) {
      for (const k of c.keys) expect(KEYS, k).not.toContain(k);
      expect(c.text, c.text).not.toMatch(/\bkeys?\b|mouse|click|tablet|\bEsc\b|\bTab\b/i);
    }
    const all = list.map((c) => `${c.keys.join(' ')} ${c.text}`).join('\n');
    // moving, looking, tapping things open, the Slide and pause buttons
    for (const bit of [/left side.*waddle/, /right side.*look around/, /Tap.*cracker, present, candy cane or tree/, /Slide button/, /pause button/]) {
      expect(all).toMatch(bit);
    }
  });

  it('keeps the keys for keyboards, without the "on a tablet" line', () => {
    const list = controlsList(false);
    expect(list[0].keys).toEqual(['W', 'A', 'S', 'D']);
    for (const c of list) {
      expect(c.keys).not.toContain('Touch');
      expect(c.text).not.toMatch(/tablet/);
    }
    for (const k of ['E', 'Tab', 'Esc']) expect(list.some((c) => c.keys.includes(k)), k).toBe(true);
  });

  // a screen reader skips a chip whose words already name the button
  it('keeps quiet only the touch chips that the words repeat', () => {
    const quiet = controlsList(true).filter((c) => c.quiet);
    expect(quiet.map((c) => c.keys[0])).toEqual(['Slide', '⏸']);
    for (const c of quiet) expect(c.text).toMatch(/Slide button|pause button/);
    expect(controlsList(false).some((c) => c.quiet)).toBe(false);
  });
});

describe('the new lines', () => {
  it('have their styles', () => {
    for (const cls of ['.scr-jokenews', '.scr-jokenews--full', '.scr-nextboxes', '.scr-grid__more', '.scr-ticket__done', '.scr-foot--nohint', '.scr-tile--lilac']) {
      expect(css, cls).toContain(`${cls} {`);
    }
  });
});

// The block a media query wraps, found by its exact header ('' if none).
function mediaBlock(text, header) {
  const start = text.indexOf(`${header} {`);
  if (start < 0) return '';
  let depth = 0;
  for (let i = text.indexOf('{', start); i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return '';
}

describe('phones held sideways (short screens)', () => {
  const SHORT = '@media (max-height: 540px)';
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

  it('scroll a page as one, its buttons pinned to the bottom', () => {
    const short = mediaBlock(css, SHORT);
    expect(short).toMatch(/\.scr-page \{\s*max-height: none;/);
    expect(short).toMatch(/\.scr-body \{[^}]*overflow: visible;/);
    expect(short).toMatch(/\.scr-foot \{[^}]*position: sticky;[^}]*bottom: (0|-1px);/);
  });

  it("switch at the HUD's compact breakpoint", () => {
    expect(read('../src/ui/hud.css')).toContain('(max-height: 540px)');
  });

  it("stop the Workshop's own height cap where the whole screen scrolls instead", () => {
    expect(read('../src/ui/screens.js')).toContain('@media (min-height: 541px) and (max-height: 700px)');
  });

  it('keep the joke card inside the screen, its words scrolling if they must', () => {
    const short = mediaBlock(read('../src/ui/popups.css'), SHORT);
    expect(short).toMatch(/\.pp-joke \{[^}]*max-height: 100%;/);
    expect(short).toMatch(/\.pp-slip \{[^}]*overflow-y: auto;/);
  });

  // A short upright window (a phone with its toolbars showing, split screen)
  // is too narrow for things side by side: the pause menu's buttons ran off
  // the edge and the advent doors shrank to slivers there.
  it('put things side by side only when the screen is wide too', () => {
    const WIDE = '@media (max-height: 540px) and (min-width: 560px)';
    const sideBySide = [
      [css, /\.scr--pause \.scr-card \{/],
      [css, /\.scr-advent \.scr-page \{/],
      [css, /\.scr-title__row \{/],
      [css, /\.scr-help__intro \{[^}]*flex-direction: row;/],
      [css, /\.scr-fb__fields \{/],
      [read('../src/ui/popups.css'), /\.pp-unlock \{/],
    ];
    for (const [text, rule] of sideBySide) {
      expect(mediaBlock(text, SHORT)).not.toMatch(rule);
      expect(mediaBlock(text, WIDE)).toMatch(rule);
    }
    expect(css).toContain(`${WIDE} and (max-width: 640px) {`);
  });

  // Stamps that sat in a corner covered words once the corner moved in.
  it("keep Results' line clear of the map stamp in the corner", () => {
    const narrow = mediaBlock(css, '@media (max-height: 540px) and (min-width: 560px) and (max-width: 760px)');
    expect(narrow).toMatch(/\.scr-results \.scr-head \.scr-sub \{\s*padding-inline: 120px;/);
  });

  it("let a Secret Note's TOP SECRET stamp follow the words when the slip scrolls", () => {
    const short = mediaBlock(read('../src/ui/popups.css'), SHORT);
    expect(short).toMatch(/\.pp-stamp \{[^}]*position: static;/);
  });
});
