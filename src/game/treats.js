// The night's little extras: cracking candy canes, shaking trees, finding
// baubles and the Frost Kitten's coins. This is the game-rules side, like
// surprises.js: the world modules (canes.js, shakes.js, companions.js) only
// show things, and every reward is handed out here through the ctx APIs.

import { rollCaneCandy } from './pets.js';
import { rollShake, pickBauble, collectBauble, newShakeTally } from './baubles.js';

export const TREAT_TUNING = {
  caneReach: 2.4, // how close to crack a cane with E or a tap
  slideReach: 1.15, // how close a belly-slide has to pass
  shakeReach: 2.6, // how close to shake a tree with E or a tap, from its middle
  bonkReach: 0.95, // past the tree's own radius: counts as sliding into it
  touchReach: 1.15, // walking into a bauble picks it up
};

const T = TREAT_TUNING;

// The treat fields of a new ctx.run. Its stream is forked here, once, so a
// night's rolls never shift the map or the surprises.
export function newTreatRun(ctx) {
  return {
    candyEarned: 0,
    canes: 0,
    newBaubles: [],
    shakeTally: newShakeTally(),
    treatRng: ctx.rng.fork('treats'),
    nextGiftAt: ctx.stats.giftSeconds,
  };
}

// Cracks a cane and pays out its candy. Returns the candy given, 0 if it had
// already gone.
export function breakCane(ctx, cane) {
  const pos = ctx.canes.smash(cane);
  if (!pos) return 0;
  const candy = rollCaneCandy(ctx.run.treatRng, ctx.save);
  ctx.run.canes += 1;
  ctx.sfx.play('crack');
  ctx.effects.sparkles(pos, 0xffffff, 18);
  ctx.effects.sparkles(pos, 0xff8fa3, 12);
  ctx.addCandy(candy, pos);
  ctx.companions.cheerPet('penguin');
  ctx.persist();
  return candy;
}

// Shakes a tree (once a night each) and maybe sends a bauble down. Returns the
// bauble drop, or null.
export function shakeTree(ctx, tree) {
  if (!ctx.shakes.shake(tree, ctx.player.position)) return null;
  ctx.sfx.play('shake');
  // snow flies off the edges of the branches, where it can be seen
  const h = tree.top - tree.y;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const up = i % 2 ? 0.34 : 0.58;
    const edge = h * 0.38 * (1.1 - up);
    ctx.companions.snowPuff(tree.x + Math.cos(a) * edge, tree.y + h * up, tree.z + Math.sin(a) * edge, 4, 1, 1.3);
  }
  const run = ctx.run;
  if (!rollShake(run.shakeTally, run.treatRng)) return null;
  const known = [...ctx.save.foundBaubles, ...ctx.shakes.groundIds()];
  return ctx.shakes.dropBauble(tree, pickBauble(run.treatRng, known), ctx.player.position);
}

// A belly-slide into a tree shakes it too. main.js calls this from the bonk.
export function bonkTree(ctx) {
  if (!ctx.run || ctx.run.timeLeft <= 0) return;
  const pos = ctx.player.position;
  const tree = ctx.shakes.nearest(pos, T.shakeReach);
  if (!tree) return;
  const reach = tree.r + ctx.player.radius + T.bonkReach;
  if (Math.hypot(tree.x - pos.x, tree.z - pos.z) <= reach) shakeTree(ctx, tree);
}

// Pip touched a bauble: a new design for the collection, or coins for a repeat.
export function collectDrop(ctx, drop) {
  const pos = ctx.shakes.take(drop);
  if (!pos) return;
  const { bauble } = drop;
  const { isNew, coins } = collectBauble(ctx.save, bauble.id);
  ctx.sfx.play('bauble');
  ctx.effects.sparkles(pos, bauble.colours[1], 20);
  if (isNew) {
    ctx.run.newBaubles.push(bauble);
    ctx.popups.showSurprise({ id: 'newBauble', name: 'New bauble!', icon: '🎄', colours: bauble.colours, good: true }, `${bauble.name}. Hang it on your tree in the Wardrobe!`);
  } else if (coins) {
    ctx.addCoins(coins, pos);
    ctx.toast(`Another ${bauble.name}! +${coins} coins`, '🎄');
  }
  ctx.persist();
}

// The prompt once nothing more important is in reach (collectables and the
// sleigh come first, in main.js), and what E or a tap does here.
export function updateTreatPrompt(ctx, pressed) {
  const pos = ctx.player.position;
  const cane = ctx.canes.nearest(pos, T.caneReach);
  if (cane) {
    ctx.hud.setPrompt('Press E to crack the candy cane! 🍬');
    if (pressed) breakCane(ctx, cane);
    return;
  }
  const tree = ctx.shakes.nearest(pos, T.shakeReach);
  if (tree) {
    ctx.hud.setPrompt('Press E to shake the tree! 🌲');
    if (pressed) shakeTree(ctx, tree);
    return;
  }
  ctx.hud.setPrompt(null);
}

// Everything that happens without a key press: sliding through a cane, walking
// into a bauble and the Frost Kitten's coins. Call once per playing frame.
export function updateTreats(ctx) {
  const run = ctx.run;
  if (run.timeLeft <= 0) return;
  const pos = ctx.player.position;
  if (ctx.player.sliding) {
    const cane = ctx.canes.nearest(pos, T.slideReach);
    if (cane) breakCane(ctx, cane);
  }
  const drop = ctx.shakes.touching(pos, T.touchReach);
  if (drop) collectDrop(ctx, drop);
  if (ctx.stats.giftCoins > 0 && ctx.time >= run.nextGiftAt) {
    run.nextGiftAt += ctx.stats.giftSeconds;
    const at = ctx.companions.cheerPet('kitten');
    ctx.addCoins(ctx.stats.giftCoins, at || pos);
  }
}
