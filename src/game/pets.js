// Snow pets. Candy from the breakable canes buys them and feeds them up to
// friendship level 5; petPerks() turns the levels into the numbers gameplay
// reads. Pure, like upgrades.js: no Three.js and no UI.
//
// The Snow Puppy keeps its own rules (met in a present, or the 25-present
// milestone with its Wardrobe switch), so it can be fed but never bought, and
// it never takes the one activePet place.

export const PET_TUNING = {
  maxLevel: 5,
  feedCosts: [10, 20, 35, 55], // candy to reach levels 2, 3, 4 and 5
  prices: { kitten: 40, reindeer: 80, penguin: 120 },
  caneCandyMin: 2, // candy in one cane, before the Penguin Chick's bonus
  caneCandyMax: 4,
  sniffPerLevel: 0.15, // Snow Puppy: further per level above 1
  giftSeconds: 40, // Frost Kitten: how often it brings coins
  giftCoinsPerLevel: 2,
  speedPerLevel: 0.02, // Baby Reindeer: faster per level
  caneBonus: [0, 1, 1, 2, 2, 3], // Penguin Chick: extra candy per cane, by level
};

const T = PET_TUNING;

export const MAX_PET_LEVEL = T.maxLevel;

export const PET_NOTE = 'Snow pets only eat magic candy. Real pets should never have sweets or chocolate.';

export const PETS = [
  {
    id: 'puppy',
    name: 'Snow Puppy',
    icon: '🐶',
    price: null, // meet it in a present, or at 25 presents
    blurb: 'Your fluffy friend from the presents. It sniffs out treats.',
  },
  {
    id: 'kitten',
    name: 'Frost Kitten',
    icon: '🐱',
    price: T.prices.kitten,
    blurb: 'Pads through the snow and brings you shiny coins.',
  },
  {
    id: 'reindeer',
    name: 'Baby Reindeer',
    icon: '🦌',
    price: T.prices.reindeer,
    blurb: 'Skips along beside Pip and helps them run faster.',
  },
  {
    id: 'penguin',
    name: 'Penguin Chick',
    icon: '🐧',
    price: T.prices.penguin,
    blurb: 'Pecks every candy cane for extra sweets.',
  },
];

export function getPet(id) {
  return PETS.find((p) => p.id === id);
}

function levelIn(pets, id) {
  if (!pets || typeof pets !== 'object' || !Object.hasOwn(pets, id)) return 0;
  return Math.max(0, Math.min(T.maxLevel, Math.floor(Number(pets[id]) || 0)));
}

// Friendship level 1..5, or 0 for a pet not bought or met yet.
export function petLevel(save, id) {
  return levelIn(save.pets, id);
}

// Candy to reach the next level, or null when not owned or already level 5.
export function feedCost(save, id) {
  const lvl = petLevel(save, id);
  if (lvl < 1 || lvl >= T.maxLevel) return null;
  return T.feedCosts[lvl - 1];
}

// Candy spent to reach the levels in `pets` (a petId -> level map). Cloud saves
// derive candy from this, so merging two devices' pets can never create candy
// (docs/CLOUD.md). The Snow Puppy has no price, only its feeding.
export function spentCandy(pets) {
  let total = 0;
  for (const p of PETS) {
    const lvl = levelIn(pets, p.id);
    if (lvl < 1) continue;
    total += p.price || 0;
    for (let i = 0; i < lvl - 1; i++) total += T.feedCosts[i];
  }
  return total;
}

// Adds to both sides of the ledger, like ctx.addCoins, so candy always equals
// candyEarned - spentCandy(pets). Returns the amount that really changed.
export function addCandy(save, n) {
  if (!Number.isFinite(n)) return 0;
  const amount = Math.max(-save.candy, Math.round(n));
  save.candy += amount;
  save.candyEarned += amount;
  return amount;
}

// Spends candy and adds the pet. Returns true on success.
export function buyPet(save, id) {
  const pet = getPet(id);
  if (!pet || pet.price === null || petLevel(save, id) > 0 || save.candy < pet.price) return false;
  save.candy -= pet.price;
  save.pets[id] = 1;
  return true;
}

// Spends candy and raises the friendship level. Returns true on success.
export function feedPet(save, id) {
  const cost = feedCost(save, id);
  if (cost === null || save.candy < cost) return false;
  save.candy -= cost;
  save.pets[id] = petLevel(save, id) + 1;
  return true;
}

// The first time the Snow Puppy joins it becomes a pet you can feed. Free, so
// the ledger doesn't move. Returns true when it was new.
export function meetPuppy(save) {
  if (petLevel(save, 'puppy') > 0) return false;
  save.pets.puppy = 1;
  return true;
}

// The pet of your own coming along tonight, or null. Reads through this rather
// than save.activePet: it is local to the device, so a merge can leave it
// naming a pet the merged save doesn't own.
export function activePetId(save) {
  const id = save.activePet;
  if (typeof id !== 'string' || id === 'puppy' || !getPet(id)) return null;
  return petLevel(save, id) > 0 ? id : null;
}

// Chooses who comes along. null means nobody. Returns true on success.
export function setActivePet(save, id) {
  if (id === null) {
    save.activePet = null;
    return true;
  }
  const previous = save.activePet;
  save.activePet = id;
  if (activePetId(save) === id) return true;
  save.activePet = previous;
  return false;
}

// What the pets add tonight. The three new pets only help while they come
// along; the sniffing only matters while the Snow Puppy follows.
export function petPerks(save) {
  const active = activePetId(save);
  const lvl = active ? petLevel(save, active) : 0;
  return {
    sniffMult: 1 + T.sniffPerLevel * Math.max(0, petLevel(save, 'puppy') - 1),
    giftSeconds: T.giftSeconds,
    giftCoins: active === 'kitten' ? T.giftCoinsPerLevel * lvl : 0,
    speedMult: active === 'reindeer' ? 1 + T.speedPerLevel * lvl : 1,
    caneBonus: active === 'penguin' ? T.caneBonus[lvl] : 0,
  };
}

// Candy from one broken cane, with the Penguin Chick's bonus.
export function rollCaneCandy(rng, save) {
  return rng.int(T.caneCandyMin, T.caneCandyMax) + petPerks(save).caneBonus;
}

// A pet's perk at a friendship level, in plain words for the Workshop card.
export function perkText(id, level) {
  const lvl = Math.max(1, Math.min(T.maxLevel, level));
  if (id === 'puppy') {
    return lvl === 1 ? 'Sniffs out treats nearby' : `Sniffs ${Math.round(T.sniffPerLevel * 100 * (lvl - 1))}% further`;
  }
  if (id === 'kitten') return `Brings ${T.giftCoinsPerLevel * lvl} coins every ${T.giftSeconds} seconds`;
  if (id === 'reindeer') return `Pip runs ${Math.round(T.speedPerLevel * 100 * lvl)}% faster`;
  if (id === 'penguin') return `+${T.caneBonus[lvl]} candy from every cane`;
  return '';
}
