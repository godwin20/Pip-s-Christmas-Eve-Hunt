// Persistent progress in localStorage. Every access is guarded so the game
// still runs (just without saving) in private windows or blocked storage.

export const SAVE_KEY = 'pips-christmas-hunt-v1';

export function defaultSave() {
  return {
    version: 1,
    coins: 0,
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
    return {
      ...base,
      ...data,
      upgrades: { ...base.upgrades, ...(data.upgrades || {}) },
      wardrobe: { ...base.wardrobe, ...(data.wardrobe || {}) },
      settings: { ...base.settings, ...(data.settings || {}) },
      foundJokes: Array.isArray(data.foundJokes) ? data.foundJokes : [],
      unlocked: Array.isArray(data.unlocked) ? data.unlocked : [],
    };
  } catch {
    return base;
  }
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
