// Pure save merging for cloud sync (docs/CLOUD.md). No Firebase in here, so
// the rules that decide what survives two devices are easy to unit test.

import { spentOnUpgrades, MAX_LEVEL } from '../game/upgrades.js';
import { spentCandy, activePetId } from '../game/pets.js';
import { TREE_SLOTS } from '../game/baubles.js';
import { cleanAdvent } from '../game/advent.js';
import { defaultSave } from '../core/save.js';
import { isValidNameParts, randomNameParts } from './names.js';

// Mirrors of the caps in firestore.rules: a save or entry over them would be
// rejected, so we clamp before writing instead.
export const CLOUD_LIMITS = {
  epoch: 1000000,
  counter: 1000000000,
  setAt: 10000000000000, // ms, far beyond any real clock
  upgrades: 20,
  foundJokes: 200,
  unlocked: 20,
  wardrobe: 20,
  idLength: 64,
  pets: 10,
  petLevel: 5,
  foundBaubles: 24,
  tree: 12,
  adventDoors: 24,
  adventYearMin: 2026,
  adventYearMax: 2100,
};

export const BOARD_LIMITS = {
  bestNight: 200,
  totalPresents: 1000000,
  jokesFound: 200,
  nights: 100000,
};

const COUNTERS = ['coinsEarned', 'candyEarned', 'totalPresents', 'totalCrackers', 'nights', 'bestPresentsInNight'];

// ---------------------------------------------------------------- cleaning

function wholeNum(v, max = CLOUD_LIMITS.counter) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Same pattern as idsOk in firestore.rules: one id the rules refuse would
// fail every push, so anything else is dropped here instead.
const ID_PATTERN = new RegExp(`^[A-Za-z0-9_-]{1,${CLOUD_LIMITS.idLength}}$`);

function cleanId(id) {
  if (typeof id !== 'string' && !(typeof id === 'number' && Number.isFinite(id))) return null;
  const s = String(id);
  return ID_PATTERN.test(s) ? s : null;
}

// Ids in their first-seen order, as strings, without duplicates.
function cleanIds(...lists) {
  const seen = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const id = cleanId(raw);
      if (id !== null) seen.add(id);
    }
  }
  return [...seen];
}

function cleanUpgrades(map) {
  const out = {};
  if (!isPlainObject(map)) return out;
  for (const [id, lvl] of Object.entries(map)) {
    if (cleanId(id) === null) continue;
    out[id] = wholeNum(lvl, MAX_LEVEL);
  }
  return out;
}

// Pets run from level 1, so unlike an upgrade a 0 can't be kept: the rules
// refuse it, and a pet at 0 isn't owned anyway.
function cleanPets(map) {
  const out = {};
  if (!isPlainObject(map)) return out;
  for (const [id, lvl] of Object.entries(map)) {
    const level = wholeNum(lvl, CLOUD_LIMITS.petLevel);
    if (cleanId(id) !== null && level >= 1) out[id] = level;
  }
  return out;
}

// Fixed spots only, each design once, in slot order so two devices that hold
// the same bad data keep the same half of it.
function cleanTree(map) {
  const out = {};
  if (!isPlainObject(map)) return out;
  const used = new Set();
  for (const slot of TREE_SLOTS) {
    const id = Object.hasOwn(map, slot) ? cleanId(map[slot]) : null;
    if (id === null || used.has(id)) continue;
    used.add(id);
    out[slot] = id;
  }
  return out;
}

// Wardrobe switches are true/false only; anything else is treated as unset.
function cleanWardrobe(map) {
  const out = {};
  if (!isPlainObject(map)) return out;
  for (const [id, on] of Object.entries(map)) {
    if (cleanId(id) !== null && typeof on === 'boolean') out[id] = on;
  }
  return out;
}

function cleanProfile(p) {
  if (!isValidNameParts(p)) return null;
  return {
    adj: p.adj,
    noun: p.noun,
    num: p.num,
    hidden: p.hidden === true,
    setAt: wholeNum(p.setAt, CLOUD_LIMITS.setAt),
  };
}

function capKeys(map, max) {
  return Object.fromEntries(Object.entries(map).slice(0, max));
}

// Just the fields that live in the cloud, normalised and within the caps.
function cloudPart(save) {
  const s = isPlainObject(save) ? save : {};
  const part = { epoch: wholeNum(s.epoch, CLOUD_LIMITS.epoch) };
  for (const key of COUNTERS) part[key] = wholeNum(s[key]);
  part.upgrades = capKeys(cleanUpgrades(s.upgrades), CLOUD_LIMITS.upgrades);
  part.foundJokes = cleanIds(s.foundJokes).slice(0, CLOUD_LIMITS.foundJokes);
  part.unlocked = cleanIds(s.unlocked).slice(0, CLOUD_LIMITS.unlocked);
  part.wardrobe = capKeys(cleanWardrobe(s.wardrobe), CLOUD_LIMITS.wardrobe);
  part.pets = capKeys(cleanPets(s.pets), CLOUD_LIMITS.pets);
  part.foundBaubles = cleanIds(s.foundBaubles).slice(0, CLOUD_LIMITS.foundBaubles);
  part.tree = cleanTree(s.tree);
  part.treeSetAt = wholeNum(s.treeSetAt, CLOUD_LIMITS.setAt);
  part.advent = cleanAdvent(s.advent);
  part.profile = cleanProfile(s.profile);
  return part;
}

function isBlank(remote) {
  return !isPlainObject(remote) || Object.keys(remote).length === 0;
}

function copySave(save) {
  return structuredClone(isPlainObject(save) ? save : defaultSave());
}

// coins is derived, so buying different upgrades on two devices can never
// create coins: coins === coinsEarned - spentOnUpgrades(upgrades).
function settleCoins(save) {
  const spent = spentOnUpgrades(save.upgrades);
  save.coinsEarned = Math.max(spent, save.coinsEarned);
  save.coins = Math.max(0, save.coinsEarned - spent);
  return save;
}

// The same for candy: candy === candyEarned - spentCandy(pets). activePet stays
// on this device, so it goes when the merged save no longer owns that pet (a
// reset on another device, say).
function settleCandy(save) {
  const spent = spentCandy(save.pets);
  save.candyEarned = Math.max(spent, save.candyEarned);
  save.candy = Math.max(0, save.candyEarned - spent);
  save.activePet = activePetId(save);
  return save;
}

// ---------------------------------------------------------------- merging

// Own keys only: an id like 'constructor' must not read Object.prototype.
function mergeLevels(l, r, cap) {
  const out = { ...l };
  for (const [id, lvl] of Object.entries(r)) out[id] = Math.max(Object.hasOwn(out, id) ? out[id] : 0, lvl);
  return capKeys(out, cap);
}

function mergeWardrobe(l, r) {
  const out = { ...l };
  for (const [id, on] of Object.entries(r)) if (!Object.hasOwn(out, id)) out[id] = on;
  return capKeys(out, CLOUD_LIMITS.wardrobe);
}

// The newer choice wins. On a tie the remote one wins, so two devices that
// both rolled a random name (setAt 0) settle on one instead of swapping.
function pickProfile(l, r) {
  if (!l) return r;
  if (!r) return l;
  return l.setAt > r.setAt ? l : r;
}

// One tree is one choice, so the newest comes across whole, empty spots
// included. On a tie the remote one wins, for the same reason as pickProfile.
function pickTree(l, r) {
  const { tree, treeSetAt } = l.treeSetAt > r.treeSetAt ? l : r;
  return { tree, treeSetAt };
}

// The same year adds up. A newer year starts over, so last year's doors go.
function mergeAdvent(l, r) {
  if (!l || !r) return l || r;
  if (l.year !== r.year) return l.year > r.year ? l : r;
  return cleanAdvent({ year: l.year, opened: [...l.opened, ...r.opened] });
}

function mergeFields(l, r) {
  const out = { epoch: l.epoch };
  for (const key of COUNTERS) out[key] = Math.max(l[key], r[key]);
  out.upgrades = mergeLevels(l.upgrades, r.upgrades, CLOUD_LIMITS.upgrades);
  out.foundJokes = cleanIds(l.foundJokes, r.foundJokes).slice(0, CLOUD_LIMITS.foundJokes);
  out.unlocked = cleanIds(l.unlocked, r.unlocked).slice(0, CLOUD_LIMITS.unlocked);
  out.wardrobe = mergeWardrobe(l.wardrobe, r.wardrobe);
  out.pets = mergeLevels(l.pets, r.pets, CLOUD_LIMITS.pets);
  out.foundBaubles = cleanIds(l.foundBaubles, r.foundBaubles).slice(0, CLOUD_LIMITS.foundBaubles);
  Object.assign(out, pickTree(l, r));
  out.advent = mergeAdvent(l.advent, r.advent);
  out.profile = pickProfile(l.profile, r.profile);
  return out;
}

// A reset (higher epoch) beats older progress outright. The loser's name only
// survives when the winner has none, so a player is never left nameless.
function newerEpoch(l, r) {
  const [win, lose] = l.epoch > r.epoch ? [l, r] : [r, l];
  return { ...win, profile: win.profile || lose.profile };
}

// `remote` is a CloudSave (a full local save works too: extra fields are ignored).
export function mergeSaves(local, remote) {
  if (isBlank(remote)) return copySave(local);
  const l = cloudPart(local);
  const r = cloudPart(remote);
  const fields = l.epoch === r.epoch ? mergeFields(l, r) : newerEpoch(l, r);
  return settleCandy(settleCoins({ ...copySave(local), ...fields }));
}

// The cloud copy: no coins or candy (derived), settings or activePet (per
// device) or version.
export function toCloudSave(save) {
  return cloudPart(save);
}

// A full local save from a cloud copy, keeping this device's own fields.
export function fromCloudSave(cloud, local) {
  return settleCandy(settleCoins({ ...copySave(local), ...cloudPart(cloud) }));
}

// Leaderboard numbers, clamped so a write always passes firestore.rules.
export function boardScores(save) {
  const s = isPlainObject(save) ? save : {};
  const totalPresents = wholeNum(s.totalPresents, BOARD_LIMITS.totalPresents);
  return {
    bestNight: Math.min(totalPresents, wholeNum(s.bestPresentsInNight, BOARD_LIMITS.bestNight)),
    totalPresents,
    jokesFound: Math.min(BOARD_LIMITS.jokesFound, cleanIds(s.foundJokes).length),
    nights: wholeNum(s.nights, BOARD_LIMITS.nights),
  };
}

// Gives a save without a valid snow name a random one. setAt 0 means "never
// chosen", so a name the player picked on another device beats it in a merge.
// Mutates and returns `save`, like syncCoinLedger.
export function ensureProfile(save, random = Math.random) {
  if (!isPlainObject(save)) return save;
  save.profile = cleanProfile(save.profile) || { ...randomNameParts(random), hidden: false, setAt: 0 };
  return save;
}

// Deep equality that ignores key order, for "did the merge change anything?".
function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (isPlainObject(v)) {
    const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

export function sameSave(a, b) {
  return stableJson(a) === stableJson(b);
}
