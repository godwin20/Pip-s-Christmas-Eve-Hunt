// The menus' drawings, which are plain data that can drift from the game
// modules they draw. The screens themselves are checked in a browser.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { chocolateHTML, treeSpotPlaces } from '../src/ui/screens.js';
import { CHOCOLATES, CHOCOLATE_SHAPES } from '../src/game/advent.js';
import { BAUBLES, BAUBLE_PATTERNS, TREE_SLOTS } from '../src/game/baubles.js';

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
