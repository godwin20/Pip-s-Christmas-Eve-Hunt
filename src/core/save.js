// Persistent progress in localStorage. Every access is guarded so the game
// still runs (just without saving) in private windows or blocked storage.
// The cloud copy (docs/CLOUD.md) is merged into this same object.

import { spentOnUpgrades } from '../game/upgrades.js';

export const SAVE_KEY = 'pips-christmas-hunt-v1';

export function defaultSave() {
  return {
    version: 1,
    coins: 0,
    coinsEarned: 0, // lifetime net income; coins === coinsEarned - spentOnUpgrades(upgrades)
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
    settings: { sfx: true, music: true, voice: true },
  };
}

export function loadSave() {
  const base = defaultSave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return base;
    const data = JSON.parse(raw);
    return syncCoinLedger({
      ...base,
      ...data,
      upgrades: { ...base.upgrades, ...(data.upgrades || {}) },
      wardrobe: { ...base.wardrobe, ...(data.wardrobe || {}) },
      settings: { ...base.settings, ...(data.settings || {}) },
      foundJokes: Array.isArray(data.foundJokes) ? data.foundJokes : [],
      unlocked: Array.isArray(data.unlocked) ? data.unlocked : [],
      profile: data.profile && typeof data.profile === 'object' ? data.profile : null,
      epoch: Number.isInteger(data.epoch) && data.epoch >= 0 ? data.epoch : 0,
    });
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
