// What the radar draws for each upgrade level, read off a stand-in 2D canvas
// that notes the rim arrows, cane blips and "this way" hints it is asked for.

import { describe, it, expect } from 'vitest';
import { defaultSave } from '../src/core/save.js';
import { computeStats } from '../src/game/upgrades.js';
import { createRadar } from '../src/ui/radar.js';

const RIM_ARROW_TIP = -84; // R_FIELD + 5 above the middle, turned to its bearing
const HINT_GLOW_RADIUS = 82.5; // R_DISC - 4.5

function fakeRadar() {
  const seen = { arrows: [], canes: 0, hints: 0, pings: [] };
  const noop = () => {};
  const gradient = { addColorStop: noop };
  let arrowOpen = false;
  const parts = {
    createRadialGradient: () => gradient,
    createConicGradient: () => gradient,
    measureText: () => ({ width: 20 }),
    moveTo(x, y) {
      if (x === 0 && y === RIM_ARROW_TIP) arrowOpen = true;
    },
    fill() {
      if (arrowOpen) seen.arrows.push(ctx.fillStyle);
      arrowOpen = false;
    },
    arc(x, y, r, from, to, backwards) {
      if (backwards && to === Math.PI) seen.canes++;
      if (r === HINT_GLOW_RADIUS) seen.hints++;
    },
  };
  const ctx = new Proxy(parts, { get: (t, key) => (key in t ? t[key] : noop) });
  const canvas = { clientWidth: 200, width: 0, height: 0, style: {}, getContext: () => ctx };
  const radar = createRadar(canvas);
  radar.showHome = false;
  radar.pingAlways = true; // onPing then reports `visible` every sweep
  radar.onPing = (visible) => seen.pings.push(visible);
  return { radar, seen };
}

const statsFor = (upgrades) => computeStats({ ...defaultSave(), upgrades });
const cracker = (x, z, rarity) => ({ type: 'cracker', rarity, alive: true, position: { x, z } });
const present = (x, z) => ({ type: 'present', alive: true, position: { x, z } });
const cane = (x, z, alive = true) => ({ x, z, alive });

// One frame, with what it drew. Just before a sweep ends, then just after, so
// the ping reports what counted as visible.
function drawn(opts) {
  const { radar, seen } = fakeRadar();
  const base = { playerPos: { x: 0, z: 0 }, yaw: 0 };
  radar.update(0.016, { ...base, ...opts, time: opts.stats.radarPingSeconds - 0.02 });
  seen.arrows.length = 0;
  seen.canes = 0;
  radar.update(0.016, { ...base, ...opts, time: opts.stats.radarPingSeconds + 0.02 });
  return seen;
}

// A few seconds of an unchanged radar, long enough for the hint to fade in.
function hintAfterWaiting(opts) {
  const { radar, seen } = fakeRadar();
  for (let i = 0; i < 16; i++) {
    seen.hints = 0;
    radar.update(0.25, { playerPos: { x: 0, z: 0 }, yaw: 0, ...opts, time: i * 0.25 });
  }
  return seen.hints > 0;
}

describe('rainbow crackers on the radar', () => {
  const far = [cracker(0, 200, 'legendary'), cracker(200, 0, 'legendary'), cracker(-200, 0, 'rare'), present(0, -200)];

  it('points to every rainbow cracker beyond range at Cracker Sense 3', () => {
    const seen = drawn({ items: far, stats: statsFor({ crackerSense: 3 }) });
    expect(seen.arrows).toHaveLength(2);
    for (const fill of seen.arrows) expect(fill).toMatch(/^hsl\(/);
  });

  it('draws no arrow below level 3, or for one in range', () => {
    expect(drawn({ items: far, stats: statsFor({ crackerSense: 2 }) }).arrows).toEqual([]);
    expect(drawn({ items: [cracker(0, 10, 'legendary')], stats: statsFor({ crackerSense: 3 }) }).arrows).toEqual([]);
  });

  it('counts an arrow as no blip, so it neither pings nor stops the hint', () => {
    const stats = statsFor({ crackerSense: 3 });
    expect(drawn({ items: far, stats }).pings).toEqual([0]);
    expect(hintAfterWaiting({ items: far, stats })).toBe(true);
  });

  it('leaves Super Radar drawing and counting everything', () => {
    const seen = drawn({ items: far, stats: statsFor({ crackerSense: 3 }), revealAll: true });
    expect(seen.arrows).toHaveLength(4);
    expect(seen.pings).toEqual([4]);
  });
});

describe('candy canes on the radar', () => {
  const canes = [cane(0, 40), cane(30, 30), cane(0, 200), cane(10, 0, false)];
  const stats = statsFor({ radar: 3 });

  it('shows the live canes in range, and only those', () => {
    expect(drawn({ items: [], canes, stats }).canes).toBe(2);
  });

  it('shows none when main.js passes none', () => {
    expect(drawn({ items: [], canes: null, stats }).canes).toBe(0);
  });

  it('turns on at Radar Range 3', () => {
    expect(statsFor({ radar: 2 }).radarCanes).toBe(false);
    expect(stats.radarCanes).toBe(true);
  });

  it('never draws a cane as a rim arrow, even under Super Radar', () => {
    const seen = drawn({ items: [], canes, stats, revealAll: true });
    expect(seen.arrows).toEqual([]);
    expect(seen.canes).toBe(2);
  });

  it('never counts a cane as visible, so the "this way" hint keeps working', () => {
    const items = [present(0, 200)];
    expect(drawn({ items, canes, stats }).pings).toEqual([0]);
    expect(hintAfterWaiting({ items, canes, stats })).toBe(true);
    expect(hintAfterWaiting({ items: [present(0, 10)], canes, stats })).toBe(false);
  });
});
