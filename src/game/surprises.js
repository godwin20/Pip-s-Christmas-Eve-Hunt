// Present surprises: what pops out when Pip opens a present.
//
// rollSurprise() picks one (Lucky Bow luck makes coal rarer and the nice ones
// commoner, and Santa visits more often). applySurprise() makes it happen
// through the ctx APIs: coins, timers, companions, popups and sound.
// Companions are pure presentation; every coin is handed out here.

import * as THREE from 'three';

export const SURPRISES = [
  {
    id: 'coins',
    name: 'Coin Shower',
    icon: '🪙',
    desc: 'A jingly heap of 10 to 30 shiny coins.',
    weight: 20,
    good: true,
  },
  {
    id: 'jack',
    name: 'Jack-in-the-Box',
    icon: '🤡',
    desc: 'A giggly clown boings out and tosses you 15 coins.',
    weight: 10,
    good: true,
  },
  {
    id: 'puppy',
    name: 'Snow Puppy',
    icon: '🐶',
    desc: 'A fluffy snow puppy follows you all night and sniffs out treats.',
    weight: 6,
    good: true,
  },
  {
    id: 'reindeer',
    name: 'Reindeer Ride',
    icon: '🦌',
    desc: 'Hop on a reindeer and gallop at double speed for 20 seconds.',
    weight: 8,
    good: true,
  },
  {
    id: 'snowballs',
    name: 'Snowball Storm',
    icon: '❄️',
    desc: 'Snowballs rain down for 8 seconds: +1 coin for each one that lands near you.',
    weight: 8,
    good: true,
  },
  {
    id: 'timeElf',
    name: 'Time Elf',
    icon: '🧝',
    desc: 'A helpful elf winds the clock back: +30 seconds.',
    weight: 10,
    good: true,
  },
  {
    id: 'radarPing',
    name: 'Super Radar',
    icon: '📡',
    desc: 'Your radar shows every treat on the island for 10 seconds.',
    weight: 8,
    good: true,
  },
  {
    id: 'coal',
    name: 'Lump of Coal',
    icon: '🪨',
    desc: 'Oh dear. A googly-eyed lump of coal (and 1 coin for trying).',
    weight: 12,
    good: false,
  },
  {
    id: 'mega',
    name: 'Mega Present',
    icon: '🎁',
    desc: 'Three mini presents tumble out of the box!',
    weight: 4,
    good: true,
  },
  {
    id: 'disco',
    name: 'Disco Tree',
    icon: '🕺',
    desc: 'The nearest Christmas tree throws a disco party: +20 coins.',
    weight: 7,
    good: true,
  },
  {
    id: 'gremlin',
    name: 'Sneaky Gremlin',
    icon: '😈',
    desc: 'A cheeky gremlin pinches 10 coins. Catch it within 10 seconds for +25!',
    weight: 7,
    good: false,
  },
  {
    id: 'santa',
    name: 'Santa Flyover',
    icon: '🎅',
    desc: 'Santa swoops past and drops 100 coins. Ho ho ho!',
    weight: 1,
    good: true,
  },
];

// Tuning numbers, exported so the shop/help text can quote them.
export const SURPRISE_TUNING = {
  coinsMin: 10,
  coinsMax: 30,
  jackCoins: 15,
  puppyFriendCoins: 20,
  reindeerSeconds: 20,
  snowballSeconds: 8,
  timeElfSeconds: 30,
  radarSeconds: 10,
  coalCoins: 1,
  megaMinis: 3,
  discoSeconds: 10,
  discoCoins: 20,
  // Decorated trees live in the village square; further away than this the
  // party comes to Pip instead (a mirror ball overhead) so it is on screen.
  discoMaxTreeDist: 24,
  gremlinSteal: 10,
  gremlinSeconds: 10,
  gremlinReward: 25,
  santaCoins: 100,
};

export function getSurprise(id) {
  return SURPRISES.find((s) => s.id === id) || null;
}

function luckOf(stats) {
  const l = Number(stats && stats.luck);
  if (!Number.isFinite(l)) return 0;
  return Math.max(0, Math.min(3, l));
}

// Effective weight of a surprise at a given Lucky Bow level (0..3):
// coal shrinks fast, the gremlin a little, nice surprises grow +15 % per
// level and Santa's weight is 1 + luck.
export function surpriseWeight(def, luck = 0) {
  if (!def) return 0;
  const L = luckOf({ luck });
  const base = Math.max(0, Number(def.weight) || 0);
  if (def.id === 'santa') return base + L;
  if (def.id === 'coal') return base * (1 - 0.25 * L);
  if (def.id === 'gremlin') return base * (1 - 0.1 * L);
  return def.good ? base * (1 + 0.15 * L) : base;
}

export function rollSurprise(rng, stats) {
  const luck = luckOf(stats);
  const r01 = rng && typeof rng.next === 'function' ? rng.next() : Math.random();
  let total = 0;
  for (const s of SURPRISES) total += surpriseWeight(s, luck);
  let r = r01 * total;
  for (const s of SURPRISES) {
    const w = surpriseWeight(s, luck);
    if (w <= 0) continue;
    if (r < w) return s;
    r -= w;
  }
  return SURPRISES[0];
}

// ---------------------------------------------------------------- helpers

// Calls obj[name](...args) only if it exists; never lets another module's
// error escape and break the surprise.
function invoke(obj, name, ...args) {
  const fn = obj && obj[name];
  if (typeof fn !== 'function') return undefined;
  try {
    return fn.apply(obj, args);
  } catch (err) {
    console.error(`[surprises] ${name}() failed`, err);
    return undefined;
  }
}

function randInt(ctx, min, max) {
  const rng = ctx && ctx.rng;
  if (rng && typeof rng.int === 'function') return rng.int(min, max);
  return min + Math.floor(Math.random() * (max - min + 1));
}

function rand01(ctx) {
  const rng = ctx && ctx.rng;
  return rng && typeof rng.next === 'function' ? rng.next() : Math.random();
}

function now(ctx) {
  const t = Number(ctx && ctx.time);
  return Number.isFinite(t) ? t : 0;
}

function playerPos(ctx) {
  const p = ctx && ctx.player && ctx.player.position;
  return p && Number.isFinite(p.x) ? p : null;
}

// World position of the surprise: the present, else Pip, else the origin.
function spotOf(ctx, present) {
  const out = new THREE.Vector3();
  const p = (present && (present.position || (present.group && present.group.position))) || playerPos(ctx);
  if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) out.set(p.x, Number.isFinite(p.y) ? p.y : 0, p.z);
  return out;
}

function coins(ctx, n, pos) {
  if (!n) return;
  invoke(ctx, 'addCoins', n, pos);
}

function play(ctx, name) {
  invoke(ctx && ctx.sfx, 'play', name);
}

function toast(ctx, text, icon) {
  if (ctx && typeof ctx.toast === 'function') invoke(ctx, 'toast', text, icon);
  else invoke(ctx && ctx.hud, 'toast', text, icon);
}

function hasPuppy(companions) {
  if (!companions) return false;
  const h = companions.hasPuppy;
  if (typeof h === 'function') {
    try {
      return !!h.call(companions);
    } catch {
      return false;
    }
  }
  return !!h;
}

function nearestTree(ctx, pos, maxDist = Infinity) {
  const trees = ctx && ctx.world && Array.isArray(ctx.world.decoratedTrees) ? ctx.world.decoratedTrees : [];
  const tmp = new THREE.Vector3();
  let best = null;
  let bestD = Number.isFinite(maxDist) ? maxDist * maxDist : Infinity;
  for (const tree of trees) {
    if (!tree) continue;
    if (typeof tree.getWorldPosition === 'function') tree.getWorldPosition(tmp);
    else if (tree.position) tmp.copy(tree.position);
    else continue;
    const d = (tmp.x - pos.x) ** 2 + (tmp.z - pos.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = tree;
    }
  }
  return best;
}

const T = SURPRISE_TUNING;

// Each handler does the surprise and returns the banner's detail text.
const HANDLERS = {
  coins(ctx, pos) {
    const n = randInt(ctx, T.coinsMin, T.coinsMax);
    coins(ctx, n, pos);
    invoke(ctx.effects, 'coinBurst', pos, Math.min(16, 6 + Math.round(n / 3)));
    play(ctx, 'jingle');
    const lines = [
      `A jingly heap of ${n} coins!`,
      `${n} shiny coins! Pip is rich-ish!`,
      `Ooh, ${n} coins! Don't spend them all on fish.`,
    ];
    return lines[Math.floor(rand01(ctx) * lines.length) % lines.length];
  },

  jack(ctx, pos) {
    invoke(ctx.companions, 'jackInBox', pos);
    play(ctx, 'boing');
    coins(ctx, T.jackCoins, pos);
    return `BOING! A giggly clown tossed you ${T.jackCoins} coins!`;
  },

  puppy(ctx, pos) {
    const c = ctx.companions;
    play(ctx, 'bark');
    if (hasPuppy(c)) {
      coins(ctx, T.puppyFriendCoins, pos);
      invoke(ctx.effects, 'sparkles', pos, 0xffffff, 24);
      return `Your puppy found a friend! +${T.puppyFriendCoins} coins`;
    }
    invoke(c, 'spawnPuppy');
    return 'A snow puppy will follow you all night and sniff out treats!';
  },

  reindeer(ctx) {
    const t = now(ctx);
    const run = ctx.run;
    if (run) run.speedBoostUntil = Math.max(Number(run.speedBoostUntil) || 0, t) + T.reindeerSeconds;
    invoke(ctx.companions, 'reindeerRide', T.reindeerSeconds);
    play(ctx, 'jingle');
    play(ctx, 'whoosh');
    return `Giddy-up! Double speed for ${T.reindeerSeconds} seconds!`;
  },

  snowballs(ctx, pos) {
    const c = ctx.companions;
    play(ctx, 'whoosh');
    if (c && typeof c.snowballStorm === 'function') {
      invoke(c, 'snowballStorm', T.snowballSeconds, (landPos) => {
        coins(ctx, 1, landPos || playerPos(ctx) || pos);
      });
      return 'Stand near the falling snowballs: +1 coin for each one!';
    }
    // No storm available: just give a handful of coins instead.
    coins(ctx, 5, pos);
    return 'A flurry of snowballs! +5 coins';
  },

  timeElf(ctx, pos) {
    invoke(ctx, 'addTime', T.timeElfSeconds);
    invoke(ctx.effects, 'sparkles', pos, 0x9bf6ff, 40);
    play(ctx, 'jingle');
    return `A tiny elf wound the clock back! +${T.timeElfSeconds} seconds`;
  },

  radarPing(ctx) {
    const t = now(ctx);
    const run = ctx.run;
    if (run) run.revealUntil = Math.max(Number(run.revealUntil) || 0, t) + T.radarSeconds;
    play(ctx, 'blip');
    return `Your radar can see EVERYTHING for ${T.radarSeconds} seconds!`;
  },

  coal(ctx, pos) {
    coins(ctx, T.coalCoins, pos);
    play(ctx, 'sadTrombone');
    invoke(ctx.companions, 'coalBuddy', pos);
    return `"Merry Christmas anyway!" (+${T.coalCoins} coin for trying)`;
  },

  mega(ctx, pos) {
    const col = ctx.collectables;
    const world = ctx.world;
    const p = new THREE.Vector3();
    const start = rand01(ctx) * Math.PI * 2;
    let spawned = 0;
    for (let i = 0; i < T.megaMinis; i++) {
      const a = start + (i * Math.PI * 2) / T.megaMinis;
      const r = 2.2 + rand01(ctx) * 0.6;
      p.set(pos.x + Math.cos(a) * r, pos.y, pos.z + Math.sin(a) * r);
      invoke(world, 'resolveCollision', p, 0.6);
      if (col && typeof col.spawnPresent === 'function') {
        invoke(col, 'spawnPresent', p.x, p.z, { mini: true });
        spawned++;
      }
    }
    invoke(ctx.effects, 'confetti', pos, 140);
    play(ctx, 'pop');
    if (!spawned) {
      // Nowhere to put them: give their worth in coins so it still feels mega.
      coins(ctx, 30, pos);
      return 'A MEGA pile of 30 coins!';
    }
    return `${spawned === 3 ? 'Three' : spawned} mini presents tumbled out! Grab them!`;
  },

  disco(ctx, pos) {
    const tree = nearestTree(ctx, pos, T.discoMaxTreeDist);
    const c = ctx.companions;
    if (c && typeof c.discoTree === 'function') {
      invoke(c, 'discoTree', tree, T.discoSeconds); // companions plays the 'disco' loop
    } else {
      play(ctx, 'disco');
    }
    coins(ctx, T.discoCoins, pos);
    return tree
      ? `The Christmas tree is busting out its best moves! +${T.discoCoins} coins`
      : `A disco ball! Pip busts out some moves! +${T.discoCoins} coins`;
  },

  gremlin(ctx, pos) {
    const save = ctx.save;
    const have = save && Number.isFinite(save.coins) ? Math.max(0, Math.floor(save.coins)) : T.gremlinSteal;
    const stolen = Math.min(T.gremlinSteal, have);
    if (stolen > 0) coins(ctx, -stolen, pos);
    play(ctx, 'whoosh');
    const c = ctx.companions;
    if (c && typeof c.gremlin === 'function') {
      let done = false;
      invoke(
        c,
        'gremlin',
        pos,
        (caughtPos) => {
          if (done) return;
          done = true;
          coins(ctx, T.gremlinReward, caughtPos || playerPos(ctx) || pos);
          invoke(ctx.effects, 'confetti', caughtPos || playerPos(ctx) || pos, 80);
          play(ctx, 'jingle');
          toast(ctx, `Gotcha! The gremlin coughed up ${T.gremlinReward} coins!`, '🎉');
        },
        () => {
          if (done) return;
          done = true;
          play(ctx, 'sadTrombone');
          toast(ctx, 'The gremlin got away... cheeky thing!', '😈');
        },
      );
    }
    return stolen > 0
      ? `It pinched ${stolen} coins! Catch it within ${T.gremlinSeconds} s for +${T.gremlinReward}!`
      : `Your pockets were empty! Catch it within ${T.gremlinSeconds} s for +${T.gremlinReward} anyway!`;
  },

  santa(ctx) {
    const c = ctx.companions;
    let paid = false;
    const drop = () => {
      if (paid) return;
      paid = true;
      const at = playerPos(ctx) || new THREE.Vector3();
      coins(ctx, T.santaCoins, at);
      invoke(ctx.effects, 'confetti', at, 160);
      invoke(ctx.effects, 'coinBurst', at, 16);
      toast(ctx, `Ho ho ho! Santa dropped ${T.santaCoins} coins!`, '🎅');
    };
    play(ctx, 'jingle');
    if (c && typeof c.santaFlyover === 'function') {
      invoke(c, 'santaFlyover', drop);
      return 'Look up! Santa is zooming past with a present for you!';
    }
    play(ctx, 'hoho');
    drop();
    return `Ho ho ho! Santa dropped ${T.santaCoins} coins!`;
  },
};

export function applySurprise(surprise, ctx, present) {
  const def = typeof surprise === 'string' ? getSurprise(surprise) : surprise;
  if (!def || !ctx) return;
  const id = def.id;

  const run = ctx.run;
  if (run) {
    if (!run.surprises || typeof run.surprises !== 'object') run.surprises = {};
    run.surprises[id] = (run.surprises[id] || 0) + 1;
  }

  const pos = spotOf(ctx, present);
  const handler = HANDLERS[id] || HANDLERS.coins;
  let detail = '';
  try {
    detail = handler(ctx, pos, present, def) || '';
  } catch (err) {
    console.error(`[surprises] ${id} failed`, err);
  }
  invoke(ctx.popups, 'showSurprise', def, detail);
}
