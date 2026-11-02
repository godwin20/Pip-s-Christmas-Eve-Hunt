// Baubles shaken out of trees, and the Christmas tree they decorate. Pure:
// no Three.js and no UI. The Wardrobe and the village tree both draw from here.

export const BAUBLE_TUNING = {
  dropChance: 0.3, // per tree shake
  guaranteeAfter: 5, // this many empty shakes in a row, then the next one drops
  maxPerNight: 4,
  duplicateCoins: 3,
  rarityWeights: { common: 70, rare: 25, legendary: 5 },
  treeSlots: 12,
};

const T = BAUBLE_TUNING;

// Everything the Wardrobe and the village tree have to know how to draw.
export const BAUBLE_PATTERNS = ['plain', 'stripes', 'dots', 'stars', 'swirl', 'glitter'];

// Only the calendar's door 24 gives this one.
export const GOLDEN_STAR_ID = 'goldenStar';

// Ids are stable forever (they are stored in saves): only add to this list.
export const BAUBLES = [
  { id: 'cherryRed', name: 'Cherry Red', colours: ['#d7263d', '#ff8fa3'], pattern: 'plain', rarity: 'common' },
  { id: 'hollyGreen', name: 'Holly Green', colours: ['#1f8a4c', '#8ee3a5'], pattern: 'plain', rarity: 'common' },
  { id: 'frostyBlue', name: 'Frosty Blue', colours: ['#4aa8e8', '#d6f0ff'], pattern: 'plain', rarity: 'common' },
  { id: 'sugarPlum', name: 'Sugar Plum', colours: ['#7b4fc9', '#d9c4ff'], pattern: 'plain', rarity: 'common' },
  { id: 'snowyDots', name: 'Snowy Dots', colours: ['#f4f8ff', '#a9c8ee'], pattern: 'dots', rarity: 'common' },
  { id: 'bubblegum', name: 'Bubblegum', colours: ['#f06fae', '#ffd6ea'], pattern: 'dots', rarity: 'common' },
  { id: 'berryDots', name: 'Berry Dots', colours: ['#a61e4d', '#ffc2d6'], pattern: 'dots', rarity: 'common' },
  { id: 'hotCocoa', name: 'Hot Cocoa', colours: ['#7a4a2b', '#f3dcc0'], pattern: 'dots', rarity: 'common' },
  { id: 'tangerine', name: 'Tangerine', colours: ['#f28c28', '#ffe2b8'], pattern: 'stripes', rarity: 'common' },
  { id: 'mintStripe', name: 'Mint Stripe', colours: ['#7fd8be', '#ffffff'], pattern: 'stripes', rarity: 'common' },
  { id: 'pineStripe', name: 'Pine Stripe', colours: ['#14633a', '#e6c34a'], pattern: 'stripes', rarity: 'common' },
  { id: 'lemonDrop', name: 'Lemon Drop', colours: ['#f5d33f', '#fff6c2'], pattern: 'stripes', rarity: 'common' },
  { id: 'icicle', name: 'Icicle', colours: ['#bfe8ff', '#ffffff'], pattern: 'swirl', rarity: 'common' },
  { id: 'robinRed', name: 'Robin Red', colours: ['#c8452f', '#f7c9a9'], pattern: 'swirl', rarity: 'common' },

  { id: 'candyCane', name: 'Candy Cane', colours: ['#e8192c', '#ffffff'], pattern: 'stripes', rarity: 'rare' },
  { id: 'peppermint', name: 'Peppermint Swirl', colours: ['#ff4d5e', '#ffffff'], pattern: 'swirl', rarity: 'rare' },
  { id: 'snowflake', name: 'Snowflake', colours: ['#2b5fb8', '#e6f3ff'], pattern: 'stars', rarity: 'rare' },
  { id: 'starryNight', name: 'Starry Night', colours: ['#1c2a5e', '#ffd93d'], pattern: 'stars', rarity: 'rare' },
  { id: 'frostedPlum', name: 'Frosted Plum', colours: ['#5b2a86', '#e7d3ff'], pattern: 'glitter', rarity: 'rare' },
  { id: 'emerald', name: 'Emerald Glitter', colours: ['#0f7f5a', '#9ff0cf'], pattern: 'glitter', rarity: 'rare' },
  { id: 'ruby', name: 'Ruby Glitter', colours: ['#b3122d', '#ffb3bf'], pattern: 'glitter', rarity: 'rare' },

  { id: 'northernLights', name: 'Northern Lights', colours: ['#2fd6a6', '#8a5cf6'], pattern: 'swirl', rarity: 'legendary' },
  { id: 'rainbowJoy', name: 'Rainbow Joy', colours: ['#ff5f6d', '#ffc371'], pattern: 'stripes', rarity: 'legendary' },
  { id: GOLDEN_STAR_ID, name: 'Golden Star', colours: ['#ffd93d', '#fff4c2'], pattern: 'stars', rarity: 'legendary' },
];

// What a tree can drop: everything but the Golden Star.
export const TREE_DROP_BAUBLES = BAUBLES.filter((b) => b.id !== GOLDEN_STAR_ID);

// The 12 fixed spots on the tree: s0, s1, .. s11.
export const TREE_SLOTS = Array.from({ length: T.treeSlots }, (_, i) => `s${i}`);

// How the spots sit on the tree, bottom row first: s0..s4 along the bottom, left
// to right, then s5..s8, s9 and s10, and s11 at the top. Pip's Tree in the
// village and the Wardrobe's drawing both lay them out from this.
export const TREE_ROWS = [5, 4, 2, 1];

const RARITY_ROLLS = Object.entries(T.rarityWeights).map(([rarity, weight]) => ({ rarity, weight }));

export function getBauble(id) {
  return BAUBLES.find((b) => b.id === id);
}

// ---------------------------------------------------------------- shaking

// One night's shakes, kept in ctx.run. Each tree shaking only once is the
// world's job: this counts the drops.
export function newShakeTally() {
  return { emptyShakes: 0, dropped: 0 };
}

// Rolls one shake and updates the tally. True means a bauble falls.
export function rollShake(tally, rng) {
  if (tally.dropped >= T.maxPerNight) return false;
  const drops = tally.emptyShakes >= T.guaranteeAfter || rng.chance(T.dropChance);
  if (drops) {
    tally.dropped += 1;
    tally.emptyShakes = 0;
  } else {
    tally.emptyShakes += 1;
  }
  return drops;
}

// The design that falls. Rarity first, then one the player hasn't found yet if
// that rarity has any left, the same way pickJoke prefers unseen jokes.
export function pickBauble(rng, foundIds = []) {
  const found = new Set(foundIds);
  const { rarity } = rng.weighted(RARITY_ROLLS);
  const same = TREE_DROP_BAUBLES.filter((b) => b.rarity === rarity);
  const unseen = same.filter((b) => !found.has(b.id));
  return rng.pick(unseen.length ? unseen : same);
}

// ---------------------------------------------------------------- collecting

// Adds a design to the collection. A duplicate is worth coins instead, which
// the caller pays through ctx.addCoins so the coin ledger stays right.
export function collectBauble(save, id) {
  if (!getBauble(id)) return { isNew: false, coins: 0 };
  if (save.foundBaubles.includes(id)) return { isNew: false, coins: T.duplicateCoins };
  save.foundBaubles.push(id);
  return { isNew: true, coins: 0 };
}

// How many real designs have been found, for "7 / 24 found".
export function foundCount(save) {
  return new Set(save.foundBaubles.filter(getBauble)).size;
}

// ---------------------------------------------------------------- the tree

// Newest tree wins a merge, so every change must be strictly newer than the
// last one, even if this device's clock is behind (like setProfile).
function stampTree(save, now) {
  const last = Number.isFinite(save.treeSetAt) ? save.treeSetAt : 0;
  save.treeSetAt = Math.max(Number.isFinite(now) ? Math.round(now) : 0, last + 1);
}

// The slot holding a design, or null.
export function slotOf(save, id) {
  return TREE_SLOTS.find((slot) => save.tree[slot] === id) || null;
}

// Hangs a found design on a spot. A design hangs once, so if it is already on
// the tree it moves here. Returns true when the tree changed.
export function placeBauble(save, slot, id, now = Date.now()) {
  if (!TREE_SLOTS.includes(slot) || !getBauble(id) || !save.foundBaubles.includes(id)) return false;
  const from = slotOf(save, id);
  if (from === slot) return false;
  if (from) delete save.tree[from];
  save.tree[slot] = id;
  stampTree(save, now);
  return true;
}

// Takes a bauble off. Returns true when the tree changed.
export function removeBauble(save, slot, now = Date.now()) {
  if (!Object.hasOwn(save.tree, slot)) return false;
  delete save.tree[slot];
  stampTree(save, now);
  return true;
}

// Every spot in order with its design, or null when it is empty. An id this
// version of the game doesn't know shows as an empty spot.
export function treeSpots(save) {
  const seen = new Set();
  return TREE_SLOTS.map((slot) => {
    const bauble = (Object.hasOwn(save.tree, slot) && getBauble(save.tree[slot])) || null;
    if (!bauble || seen.has(bauble.id)) return { slot, bauble: null };
    seen.add(bauble.id);
    return { slot, bauble };
  });
}
