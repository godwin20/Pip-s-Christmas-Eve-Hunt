// Cracker rarity rolls and joke picking. A cracker's rarity is decided when it
// spawns (so the radar and its looks can show it); the joke is picked on open.

import { JOKES } from '../data/jokes.js';

export const RARITY_COINS = { common: 5, rare: 10, legendary: 25 };

export function rollRarity(rng, jokeLuck = 0) {
  return rng.weighted([
    { weight: 70, rarity: 'common' },
    { weight: 25 + 5 * jokeLuck, rarity: 'rare' },
    { weight: 5 + 4 * jokeLuck, rarity: 'legendary' },
  ]).rarity;
}

// Prefers jokes the player has not found yet: first in the cracker's rarity,
// then in any rarity, and only repeats once the whole gallery is complete.
export function pickJoke(rng, rarity, foundIds) {
  const found = new Set(foundIds);
  const unseenSame = JOKES.filter((j) => j.rarity === rarity && !found.has(j.id));
  if (unseenSame.length) return { joke: rng.pick(unseenSame), isNew: true };
  const unseenAny = JOKES.filter((j) => !found.has(j.id));
  if (unseenAny.length) return { joke: rng.pick(unseenAny), isNew: true };
  const same = JOKES.filter((j) => j.rarity === rarity);
  return { joke: rng.pick(same.length ? same : JOKES), isNew: false };
}

export function getJoke(id) {
  return JOKES.find((j) => j.id === id);
}
