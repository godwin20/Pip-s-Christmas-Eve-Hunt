// Persistent progress in localStorage. Every access is guarded so the game
// still runs (just without saving) in private windows or blocked storage.
// The cloud copy (docs/CLOUD.md) is merged into this same object.

import { spentOnUpgrades } from '../game/upgrades.js';
import { spentCandy, activePetId } from '../game/pets.js';
import { cleanAdvent } from '../game/advent.js';

export const SAVE_KEY = 'pips-christmas-hunt-v1';

export function defaultSave() {
  return {
    version: 1,
    coins: 0,
    coinsEarned: 0, // lifetime net income; coins === coinsEarned - spentOnUpgrades(upgrades)
    candy: 0,
    candyEarned: 0, // lifetime income; candy === candyEarned - spentCandy(pets)
    epoch: 0, // bumped by "Reset progress" so a reset wins over older cloud copies
    profile: null, // leaderboard snow name { adj, noun, num, hidden, setAt }, set at boot
    totalPresents: 0,
    totalCrackers: 0,
    nights: 0,
    bestPresentsInNight: 0,
    upgrades: {}, // upgradeId -> level (0..3)
    foundJokes: [], // joke ids in the order they were found
    unlocked: [], // milestone ids
    wardrobe: {}, // milestoneId -> boolean (cosmetic switched on)
    pets: {}, // petId -> friendship level (1..5); bought or met means present here
    activePet: null, // the pet of your own that comes along; this device only, never synced
    foundBaubles: [], // bauble ids in the order they were found
    tree: {}, // slot id (s0..s11) -> bauble id
    treeSetAt: 0, // ms of the last tree change; the newest tree wins a merge
    advent: null, // { year, opened: [door numbers] } once a door has been opened
    settings: { sfx: true, music: true, voice: true },
  };
}

function isMap(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function loadSave() {
  const base = defaultSave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return base;
    const data = JSON.parse(raw);
    const save = {
      ...base,
      ...data,
      // left undefined when missing, not the default 0, so the ledgers below
      // can tell an older save from one that has really earned nothing
      coinsEarned: data.coinsEarned,
      candyEarned: data.candyEarned,
      upgrades: { ...base.upgrades, ...(data.upgrades || {}) },
      wardrobe: { ...base.wardrobe, ...(data.wardrobe || {}) },
      pets: isMap(data.pets) ? data.pets : {},
      tree: isMap(data.tree) ? data.tree : {},
      settings: { ...base.settings, ...(data.settings || {}) },
      foundJokes: Array.isArray(data.foundJokes) ? data.foundJokes : [],
      unlocked: Array.isArray(data.unlocked) ? data.unlocked : [],
      foundBaubles: Array.isArray(data.foundBaubles) ? data.foundBaubles : [],
      treeSetAt: Number.isFinite(data.treeSetAt) && data.treeSetAt >= 0 ? data.treeSetAt : 0,
      advent: cleanAdvent(data.advent),
      profile: data.profile && typeof data.profile === 'object' ? data.profile : null,
      epoch: Number.isInteger(data.epoch) && data.epoch >= 0 ? data.epoch : 0,
    };
    save.activePet = activePetId(save);
    return syncCandyLedger(syncCoinLedger(save));
  } catch {
    return base;
  }
}

// Saves from before cloud sync have no coinsEarned: rebuild it from the purse
// plus what the upgrades cost, then keep coins === coinsEarned - spent.
export function syncCoinLedger(save) {
  const spent = spentOnUpgrades(save.upgrades);
  const coins = Number.isFinite(save.coins) ? Math.max(0, Math.round(save.coins)) : 0;
  if (!Number.isFinite(save.coinsEarned)) save.coinsEarned = coins + spent;
  save.coinsEarned = Math.max(spent, Math.round(save.coinsEarned));
  save.coins = save.coinsEarned - spent;
  return save;
}

// The same for candy: candy === candyEarned - spentCandy(pets). Saves from
// before pets have neither, so they start on 0.
export function syncCandyLedger(save) {
  const spent = spentCandy(save.pets);
  const candy = Number.isFinite(save.candy) ? Math.max(0, Math.round(save.candy)) : 0;
  if (!Number.isFinite(save.candyEarned)) save.candyEarned = candy + spent;
  save.candyEarned = Math.max(spent, Math.round(save.candyEarned));
  save.candy = save.candyEarned - spent;
  return save;
}

export function writeSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function resetSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* storage unavailable */
  }
  return defaultSave();
}
