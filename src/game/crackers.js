// Cracker rarity rolls and joke picking. A cracker's rarity is decided when it
// spawns (so the radar and its looks can show it); the joke is picked on open.
// Santa's Secret Notes (rarity legendary) only ever come from rainbow crackers.

import { JOKES } from '../data/jokes.js';

export const RARITY_COINS = { common: 5, rare: 10, legendary: 25 };

export function rollRarity(rng, jokeLuck = 0) {
  return rng.weighted([
    { weight: 70, rarity: 'common' },
    { weight: 25 + 5 * jokeLuck, rarity: 'rare' },
    { weight: 5 + 4 * jokeLuck, rarity: 'legendary' },
  ]).rarity;
}

// How many entries of the gallery are still to find.
export function jokesLeft(foundIds) {
  const found = new Set(foundIds);
  return JOKES.filter((j) => !found.has(j.id)).length;
}

// How many of Santa's Secret Notes are still to find.
export function notesLeft(foundIds) {
  const found = new Set(foundIds);
  return JOKES.filter((j) => j.rarity === 'legendary' && !found.has(j.id)).length;
}

// One island's cracker rarities. While Notes remain, every island is promised a
// rainbow cracker: if the rolls gave none, one of them becomes one.
export function rollNightRarities(rng, count, jokeLuck = 0, foundIds = []) {
  const rarities = [];
  for (let i = 0; i < count; i++) rarities.push(rollRarity(rng, jokeLuck));
  if (count > 0 && !rarities.includes('legendary') && notesLeft(foundIds) > 0) {
    rarities[rng.int(0, count - 1)] = 'legendary';
  }
  return rarities;
}

// Prefers jokes the player has not found yet: first in the cracker's rarity,
// then in any rarity except legendary, so only a rainbow cracker gives a Note.
// Repeats start once there is nothing unseen left for this cracker to give.
export function pickJoke(rng, rarity, foundIds) {
  const found = new Set(foundIds);
  const unseenSame = JOKES.filter((j) => j.rarity === rarity && !found.has(j.id));
  if (unseenSame.length) return { joke: rng.pick(unseenSame), isNew: true };
  const unseenAny = JOKES.filter((j) => j.rarity !== 'legendary' && !found.has(j.id));
  if (unseenAny.length) return { joke: rng.pick(unseenAny), isNew: true };
  const same = JOKES.filter((j) => j.rarity === rarity);
  return { joke: rng.pick(same.length ? same : JOKES), isNew: false };
}

export function getJoke(id) {
  return JOKES.find((j) => j.id === id);
}
