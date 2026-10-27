// Pure save merging for cloud sync (docs/CLOUD.md). No Firebase in here, so
// the rules that decide what survives two devices are easy to unit test.

import { spentOnUpgrades, MAX_LEVEL } from '../game/upgrades.js';
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
};

export const BOARD_LIMITS = {
  bestNight: 200,
  totalPresents: 1000000,
  jokesFound: 102,
  nights: 100000,
};

const COUNTERS = ['coinsEarned', 'totalPresents', 'totalCrackers', 'nights', 'bestPresentsInNight'];

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

// ---------------------------------------------------------------- merging

// Own keys only: an id like 'constructor' must not read Object.prototype.
function mergeUpgrades(l, r) {
  const out = { ...l };
  for (const [id, lvl] of Object.entries(r)) out[id] = Math.max(Object.hasOwn(out, id) ? out[id] : 0, lvl);
  return capKeys(out, CLOUD_LIMITS.upgrades);
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

function mergeFields(l, r) {
  const out = { epoch: l.epoch };
  for (const key of COUNTERS) out[key] = Math.max(l[key], r[key]);
  out.upgrades = mergeUpgrades(l.upgrades, r.upgrades);
  out.foundJokes = cleanIds(l.foundJokes, r.foundJokes).slice(0, CLOUD_LIMITS.foundJokes);
  out.unlocked = cleanIds(l.unlocked, r.unlocked).slice(0, CLOUD_LIMITS.unlocked);
  out.wardrobe = mergeWardrobe(l.wardrobe, r.wardrobe);
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
  return settleCoins({ ...copySave(local), ...fields });
}

// The cloud copy: no coins (derived), settings (per device) or version.
export function toCloudSave(save) {
  return cloudPart(save);
}

// A full local save from a cloud copy, keeping this device's own fields.
export function fromCloudSave(cloud, local) {
  return settleCoins({ ...copySave(local), ...cloudPart(cloud) });
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
