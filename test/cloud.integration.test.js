// The cloud facade against the auth + Firestore emulators (npm run test:cloud).
// Each "device" is its own Firebase app with in-memory auth, like two browsers.
// Google sign-in uses the auth emulator's fake ID tokens instead of a popup.

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { linkWithCredential, reauthenticateWithCredential } from 'firebase/auth';
import { createCloud } from '../src/cloud/cloud.js';
import * as firebaseSdk from '../src/cloud/firebase-sdk.js';
import { toCloudSave, boardScores, ensureProfile } from '../src/cloud/merge.js';
import { defaultSave, syncCoinLedger } from '../src/core/save.js';
import { spentOnUpgrades } from '../src/game/upgrades.js';
import { EMULATOR_PROJECT_ID } from '../src/cloud/config.js';

vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 });

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const [FS_HOST, FS_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const CONFIG = {
  apiKey: 'demo-api-key',
  authDomain: `${EMULATOR_PROJECT_ID}.firebaseapp.com`,
  projectId: EMULATOR_PROJECT_ID,
  appId: 'demo-app',
};

// The auth emulator accepts an unsigned JSON ID token for any IdP.
function googleToken(sub, name) {
  return JSON.stringify({ sub, email: `${sub}@example.com`, email_verified: true, name });
}

// Stands in for linkWithPopup. Production answers credential-already-in-use
// with the Google tokens attached (what credentialFromError reads); the auth
// emulator sends a bare 400, so we attach the token the way production would.
async function linkGoogleToken(sdk, user, token) {
  try {
    return await linkWithCredential(user, sdk.GoogleAuthProvider.credential(token));
  } catch (err) {
    if (err && err.code === 'auth/credential-already-in-use') {
      err.customData = { ...err.customData, _tokenResponse: { providerId: 'google.com', oauthIdToken: token } };
    }
    throw err;
  }
}

let env;
const devices = [];

function makeSave(over = {}) {
  const save = syncCoinLedger({ ...defaultSave(), ...over });
  return ensureProfile(save, Math.random);
}

// `extra` adds createCloud options (a wrapped SDK, a stand-in re-auth popup).
function device(name, save, googleSub = 'pip-google', googleName = 'Pip Penguin', extra = {}) {
  const d = { save: structuredClone(save), replaced: 0, statuses: [] };
  d.cloud = createCloud(
    {
      getSave: () => d.save,
      replaceSave: (next) => {
        d.save = structuredClone(next);
        d.replaced++;
      },
      onStatus: (s) => d.statuses.push(s),
    },
    {
      config: CONFIG,
      useEmulator: true,
      emulator: { authUrl: `http://${AUTH_HOST}`, firestoreHost: FS_HOST, firestorePort: Number(FS_PORT) },
      persistence: 'memory',
      appName: name,
      linkWith: (sdk, user) => linkGoogleToken(sdk, user, googleToken(googleSub, googleName)),
      ...extra,
    },
  );
  devices.push(d);
  return d;
}

async function readDoc(path) {
  let data = null;
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDoc(doc(ctx.firestore(), path));
    data = snap.exists() ? snap.data() : null;
  });
  return data;
}

async function writeDoc(path, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

// Whether the auth emulator still has an account for this uid.
async function accountExists(uid) {
  const res = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${EMULATOR_PROJECT_ID}/accounts:lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: [uid] }),
  });
  const body = await res.json();
  return Array.isArray(body.users) && body.users.length > 0;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function eventually(check, ms = 15000) {
  const until = Date.now() + ms;
  for (;;) {
    try {
      return await check();
    } catch (err) {
      if (Date.now() > until) throw err;
      await wait(250);
    }
  }
}

function coinsOk(s) {
  return s.coins === s.coinsEarned - spentOnUpgrades(s.upgrades);
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: EMULATOR_PROJECT_ID,
    firestore: {
      host: FS_HOST,
      port: Number(FS_PORT),
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  await env.clearFirestore();
  await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${EMULATOR_PROJECT_ID}/accounts`, { method: 'DELETE' });
});

afterAll(async () => {
  for (const d of devices) await d.cloud.dispose();
  await env?.cleanup();
});

describe('cloud facade on the emulators', () => {
  const progressA = {
    coinsEarned: 600,
    totalPresents: 40,
    totalCrackers: 6,
    nights: 4,
    bestPresentsInNight: 14,
    upgrades: { radar: 2 },
    foundJokes: ['j001', 'j002'],
    unlocked: ['scarf', 'puppy'],
    wardrobe: { scarf: true, puppy: false },
    profile: { adj: 1, noun: 2, num: 3, hidden: false, setAt: 1000 },
  };
  const progressB = {
    coinsEarned: 450,
    totalPresents: 55,
    totalCrackers: 2,
    nights: 6,
    bestPresentsInNight: 11,
    upgrades: { magnet: 1, compass: 1 },
    foundJokes: ['q001', 'j002', 's001'],
    unlocked: ['scarf', 'puppy', 'candyTheme'],
    wardrobe: { candyTheme: true },
    profile: null, // gets a random never-chosen name, which loses to A's
  };
  let A;
  let B;
  let googleUid;

  it('first push: signs in anonymously and writes the save and the board entry', async () => {
    A = device('deviceA', makeSave(progressA));
    expect(A.cloud.enabled).toBe(true);
    expect(await A.cloud.start()).toBe(true);
    expect(await A.cloud.start()).toBe(true); // safe to call twice
    expect(A.cloud.status).toMatchObject({ state: 'synced', isAnonymous: true, accountName: null, error: null });
    expect(A.statuses.map((s) => [s.state, s.ready])).toEqual([
      ['connecting', false],
      ['connecting', true],
      ['syncing', true],
      ['synced', true],
    ]);
    expect(A.cloud.ready).toBe(true);
    const uid = A.cloud.uid;
    const player = await readDoc(`players/${uid}`);
    expect(player.v).toBe(1);
    expect(player.updatedAt).toBeInstanceOf(Timestamp);
    expect(player.save).toEqual(toCloudSave(A.save));
    const entry = await readDoc(`leaderboard/${uid}`);
    expect(entry).toMatchObject({ adj: 1, noun: 2, num: 3, ...boardScores(A.save) });
    expect(A.replaced).toBe(0); // nothing came back from the cloud
  });

  it('linking Google keeps the same uid', async () => {
    const uid = A.cloud.uid;
    expect(await A.cloud.linkGoogle()).toEqual({ ok: true, switched: false });
    expect(A.cloud.uid).toBe(uid);
    expect(A.cloud.status).toMatchObject({ isAnonymous: false, accountName: 'Pip' });
    expect(await A.cloud.linkGoogle()).toEqual({ ok: true, switched: false }); // already linked
    googleUid = uid;
  });

  it('a second device signing into that account merges into it and drops its anonymous docs', async () => {
    B = device('deviceB', makeSave(progressB));
    B.save.settings = { sfx: false, music: false, voice: true };
    expect(await B.cloud.start()).toBe(true);
    const anonUid = B.cloud.uid;
    expect(anonUid).not.toBe(googleUid);
    expect(await readDoc(`leaderboard/${anonUid}`)).not.toBeNull();

    expect(await B.cloud.linkGoogle()).toEqual({ ok: true, switched: true });
    expect(B.cloud.uid).toBe(googleUid);
    expect(B.cloud.status).toMatchObject({ state: 'synced', isAnonymous: false, accountName: 'Pip' });
    expect(await readDoc(`players/${anonUid}`)).toBeNull();
    expect(await readDoc(`leaderboard/${anonUid}`)).toBeNull();

    const s = B.save;
    expect(s).toMatchObject({ coinsEarned: 600, totalPresents: 55, totalCrackers: 6, nights: 6, bestPresentsInNight: 14 });
    expect(s.upgrades).toEqual({ magnet: 1, compass: 1, radar: 2 });
    expect(s.foundJokes).toEqual(['q001', 'j002', 's001', 'j001']);
    expect(s.unlocked).toEqual(['scarf', 'puppy', 'candyTheme']);
    expect(s.wardrobe).toEqual({ candyTheme: true, scarf: true, puppy: false });
    expect(s.profile).toEqual(progressA.profile); // the chosen name beats a random one
    expect(s.settings).toEqual({ sfx: false, music: false, voice: true }); // settings stay on the device
    expect(coinsOk(s)).toBe(true);
    expect((await readDoc(`players/${googleUid}`)).save).toEqual(toCloudSave(s));
  });

  it('the first device pulls the merged progress on its next push', async () => {
    expect(await A.cloud.markDirty({ now: true })).toBe(true);
    // Same progress; each device keeps its own jokes first (merge rule).
    expect(A.save.foundJokes).toEqual(['j001', 'j002', 'q001', 's001']);
    expect({ ...toCloudSave(A.save), foundJokes: null }).toEqual({ ...toCloudSave(B.save), foundJokes: null });
    expect([...A.save.foundJokes].sort()).toEqual([...B.save.foundJokes].sort());
    expect(A.save.coins).toBe(B.save.coins);
    expect(A.replaced).toBe(1);
  });

  it('a reset on one device wins on the other and resets the board entry', async () => {
    A.save = makeSave({ epoch: A.save.epoch + 1, profile: A.save.profile, settings: A.save.settings });
    expect(await A.cloud.resetEverywhere()).toEqual({ ok: true });
    const player = await readDoc(`players/${googleUid}`);
    expect(player.save).toMatchObject({ epoch: 1, totalPresents: 0, coinsEarned: 0, foundJokes: [] });
    expect(await readDoc(`leaderboard/${googleUid}`)).toMatchObject({ bestNight: 0, totalPresents: 0, jokesFound: 0, nights: 0 });

    expect(await B.cloud.markDirty({ now: true })).toBe(true);
    expect(B.save).toMatchObject({ epoch: 1, totalPresents: 0, coins: 0, coinsEarned: 0, upgrades: {}, foundJokes: [] });
    expect(B.save.profile).toEqual(progressA.profile);
    expect(B.save.settings).toEqual({ sfx: false, music: false, voice: true });
  });

  it('a stale device cannot bring old progress back after a reset', async () => {
    // B plays a night with pre-reset numbers in memory? No: B already took the
    // reset. A third device that never synced since keeps its own counters, but
    // its lower epoch loses outright.
    const C = device('deviceC', makeSave({ ...progressB, epoch: 0 }), 'pip-google');
    expect(await C.cloud.start()).toBe(true);
    expect(await C.cloud.linkGoogle()).toEqual({ ok: true, switched: true });
    expect(C.save).toMatchObject({ epoch: 1, totalPresents: 0 });
    await C.cloud.dispose();
  });

  it('signing out starts this device fresh while the account keeps its progress', async () => {
    B.save.totalPresents = 9;
    B.save.bestPresentsInNight = 9;
    const before = B.cloud.uid;
    expect(await B.cloud.signOutToFresh()).toEqual({ ok: true });
    expect(B.cloud.uid).not.toBe(before);
    expect(B.cloud.status).toMatchObject({ state: 'synced', isAnonymous: true, accountName: null });
    expect(B.save).toMatchObject({ totalPresents: 0, coins: 0, epoch: 0 });
    expect(B.save.settings).toEqual({ sfx: false, music: false, voice: true });
    expect((await readDoc(`players/${googleUid}`)).save.totalPresents).toBe(9); // pushed before leaving
    expect(await readDoc(`players/${B.cloud.uid}`)).not.toBeNull();
    expect((await B.cloud.signOutToFresh()).ok).toBe(false); // anonymous: nothing to sign out of
  });
});

describe('leaderboard on the emulators', () => {
  const players = [];

  beforeAll(async () => {
    // The account tests above leave entries whose scores depend on timing.
    await env.clearFirestore();
    const totals = [120, 80, 80, 30, 5];
    for (const [i, total] of totals.entries()) {
      const save = makeSave({ totalPresents: total, bestPresentsInNight: Math.min(total, 10 + i), nights: i + 1 });
      save.profile = { adj: i, noun: i, num: i + 1, hidden: false, setAt: 1 };
      const d = device(`board${i}`, save);
      await d.cloud.start();
      players.push(d);
    }
    const hidden = device('boardHidden', makeSave({ totalPresents: 999, bestPresentsInNight: 50 }));
    hidden.save.profile.hidden = true;
    await hidden.cloud.start();
    players.push(hidden);
  });

  it('lists the top scores with shared ranks for ties, and no hidden or zero entries', async () => {
    const viewer = players[3];
    const board = await viewer.cloud.getLeaderboard('totalPresents', { limit: 10 });
    expect(board.error).toBeUndefined();
    const top = board.entries.filter((e) => [120, 80, 30, 5].includes(e.score));
    expect(top.map((e) => [e.rank, e.score, e.isMe])).toEqual([
      [1, 120, false],
      [2, 80, false],
      [2, 80, false],
      [4, 30, true],
      [5, 5, false],
    ]);
    expect(board.entries.some((e) => e.score === 999)).toBe(false); // hidden
    expect(board.entries.every((e) => e.score > 0)).toBe(true); // the reset account has 0
    expect(board.entries[0].name).toBe('Jolly Penguin 1');
    expect(board.me).toEqual({ rank: 4, score: 30 });
  });

  it('counts the rank of a player outside the top list', async () => {
    const board = await players[4].cloud.getLeaderboard('totalPresents', { limit: 2 });
    expect(board.entries.map((e) => e.score)).toEqual([120, 80]);
    expect(board.me).toEqual({ rank: 5, score: 5 });
    const hiddenView = await players[5].cloud.getLeaderboard('totalPresents', { limit: 2 });
    expect(hiddenView.me).toBeNull();
    expect((await players[0].cloud.getLeaderboard('nope')).error).toBe('unknown-board');
  });

  it('spaces updates 6 s apart, skips unchanged ones and never lowers a score by update', async () => {
    const d = players[0];
    const ref = `leaderboard/${d.cloud.uid}`;
    const first = await readDoc(ref);

    expect(await d.cloud.markDirty({ now: true })).toBe(true); // nothing new: no board write
    expect((await readDoc(ref)).updatedAt.toMillis()).toBe(first.updatedAt.toMillis());

    d.save.totalPresents = 130;
    expect(await d.cloud.markDirty({ now: true })).toBe(true); // within 6 s: deferred, not refused
    expect((await readDoc(ref)).totalPresents).toBe(120);
    await eventually(async () => expect((await readDoc(ref)).totalPresents).toBe(130), 12000);

    // A stale entry above the save (say a reset whose board step failed) is
    // refused as an update, so the facade deletes and recreates it.
    await writeDoc(ref, { ...first, totalPresents: 500, updatedAt: Timestamp.fromMillis(Date.now() - 60000) });
    d.save.nights += 1;
    await wait(6100);
    expect(await d.cloud.markDirty({ now: true })).toBe(true);
    expect(await readDoc(ref)).toMatchObject({ totalPresents: 130, nights: d.save.nights });
  });

  it('hiding removes the entry and showing brings it back', async () => {
    const d = players[1];
    const ref = `leaderboard/${d.cloud.uid}`;
    await wait(6100);
    await d.cloud.setProfile({ hidden: true });
    expect(d.save.profile.hidden).toBe(true);
    expect(await readDoc(ref)).toBeNull();
    await wait(6100);
    await d.cloud.setProfile({ hidden: false, adj: 5 });
    expect(await readDoc(ref)).toMatchObject({ adj: 5, totalPresents: 80 });
  });
});

describe('Firestore Lite, unchanged pushes and deleting data on the emulators', () => {
  it('the game\'s SDK slice is Firestore Lite, with no cache or listeners', () => {
    for (const name of ['getDoc', 'getDocs', 'getCount', 'setDoc', 'deleteDoc', 'runTransaction', 'writeBatch', 'deleteUser', 'linkWithPopup', 'reauthenticateWithPopup']) {
      expect(firebaseSdk[name], name).toBeTypeOf('function');
    }
    for (const name of ['getDocFromServer', 'getDocsFromServer', 'getCountFromServer', 'onSnapshot']) {
      expect(firebaseSdk[name], name).toBeUndefined();
    }
  });

  it('a push with nothing new reads the save but does not write it', async () => {
    const d = device('skipper', makeSave({ totalPresents: 7, bestPresentsInNight: 7, foundJokes: ['j001', 'j002'] }));
    expect(await d.cloud.start()).toBe(true);
    const ref = `players/${d.cloud.uid}`;
    const first = await readDoc(ref);
    await wait(50);
    expect(await d.cloud.markDirty({ now: true })).toBe(true);
    expect(d.cloud.status).toMatchObject({ state: 'synced', error: null });
    expect((await readDoc(ref)).updatedAt.toMillis()).toBe(first.updatedAt.toMillis());

    // Same progress listed in another order (another device's) is not new either.
    await writeDoc(ref, { ...first, save: { ...first.save, foundJokes: ['j002', 'j001'] } });
    const reordered = await readDoc(ref);
    expect(await d.cloud.markDirty({ now: true })).toBe(true);
    expect((await readDoc(ref)).updatedAt.toMillis()).toBe(reordered.updatedAt.toMillis());

    d.save.totalCrackers += 1;
    expect(await d.cloud.markDirty({ now: true })).toBe(true);
    const after = await readDoc(ref);
    expect(after.updatedAt.toMillis()).toBeGreaterThan(reordered.updatedAt.toMillis());
    expect(after.save.totalCrackers).toBe(d.save.totalCrackers);
  });

  it('deleteEverything removes both docs and the guest account, then plays on as a new uid', async () => {
    const d = device('deleter', makeSave({ totalPresents: 33, bestPresentsInNight: 9, foundJokes: ['j003'] }));
    d.save.settings = { sfx: false, music: true, voice: false };
    expect(await d.cloud.start()).toBe(true);
    const oldUid = d.cloud.uid;
    expect(await readDoc(`leaderboard/${oldUid}`)).not.toBeNull();
    expect(await accountExists(oldUid)).toBe(true);

    expect(await d.cloud.deleteEverything()).toEqual({ ok: true, accountDeleted: true });
    expect(await readDoc(`players/${oldUid}`)).toBeNull();
    expect(await readDoc(`leaderboard/${oldUid}`)).toBeNull();
    expect(await accountExists(oldUid)).toBe(false);

    const newUid = d.cloud.uid;
    expect(newUid).toBeTruthy();
    expect(newUid).not.toBe(oldUid);
    expect(d.cloud.status).toMatchObject({ state: 'synced', ready: true, isAnonymous: true });
    expect(d.save).toMatchObject({ totalPresents: 0, foundJokes: [], coins: 0, epoch: 0, settings: { sfx: false, music: true, voice: false } });
    expect((await readDoc(`players/${newUid}`)).save).toEqual(toCloudSave(d.save));
    // The new guest's (empty) entry follows once the 6 s board spacing allows.
    await eventually(async () => expect(await readDoc(`leaderboard/${newUid}`)).toMatchObject({ totalPresents: 0 }), 12000);
    expect(await readDoc(`players/${oldUid}`)).toBeNull(); // and nothing brought the old one back
  });

  it('deleteEverything also deletes a Google sign-in that is still fresh', async () => {
    const d = device('deleterGoogle', makeSave({ totalPresents: 21, bestPresentsInNight: 8 }), 'delete-me-google', 'Holly Grownup');
    expect(await d.cloud.start()).toBe(true);
    expect(await d.cloud.linkGoogle()).toEqual({ ok: true, switched: false });
    const googleUid = d.cloud.uid;
    expect(d.cloud.status).toMatchObject({ isAnonymous: false, accountName: 'Holly' });

    expect(await d.cloud.deleteEverything()).toEqual({ ok: true, accountDeleted: true });
    expect(await readDoc(`players/${googleUid}`)).toBeNull();
    expect(await readDoc(`leaderboard/${googleUid}`)).toBeNull();
    expect(await accountExists(googleUid)).toBe(false);
    expect(d.cloud.uid).not.toBe(googleUid);
    expect(d.cloud.status).toMatchObject({ isAnonymous: true, accountName: null, ready: true });
    expect(d.save.totalPresents).toBe(0);
  });
});

describe('finishing a delete with a fresh Google sign-in on the emulators', () => {
  // The auth emulator deletes any account at once, so this SDK refuses to
  // delete a Google one until it has been confirmed again, as production
  // does once the sign-in is more than a few minutes old.
  function staleSdk() {
    const confirmed = new Set();
    const sdk = {
      ...firebaseSdk,
      deleteUser: (user) =>
        user.isAnonymous || confirmed.has(user.uid)
          ? firebaseSdk.deleteUser(user)
          : Promise.reject(Object.assign(new Error('Firebase: Error (auth/requires-recent-login).'), { code: 'auth/requires-recent-login' })),
    };
    return { sdk, confirmed };
  }

  it('keeps the Google sign-in until it is confirmed with the same account, then deletes it', async () => {
    // someone else's Google account, which the wrong pick below lands on
    const other = device('otherGoogle', makeSave({ totalPresents: 2 }), 'someone-else-google', 'Ivy Otherone');
    expect(await other.cloud.start()).toBe(true);
    expect((await other.cloud.linkGoogle()).ok).toBe(true);

    const { sdk, confirmed } = staleSdk();
    let pick = 'stale-google'; // which Google account the stand-in popup signs in with
    const d = device('staleGoogle', makeSave({ totalPresents: 44, bestPresentsInNight: 9, foundJokes: ['j005'] }), 'stale-google', 'Holly Grownup', {
      loadFirebase: async () => sdk,
      reauthWith: async (s, user) => {
        await reauthenticateWithCredential(user, s.GoogleAuthProvider.credential(googleToken(pick, 'Holly Grownup')));
        confirmed.add(user.uid);
      },
    });
    expect(await d.cloud.start()).toBe(true);
    expect(await d.cloud.linkGoogle()).toEqual({ ok: true, switched: false });
    const googleUid = d.cloud.uid;
    expect(await d.cloud.sendFeedback({ rating: 4, category: 'bug', quick: ['broke'] })).toEqual({ ok: true });

    expect(await d.cloud.deleteEverything()).toEqual({ ok: false, needsReauth: true, error: 'auth/requires-recent-login' });
    expect(await readDoc(`players/${googleUid}`)).toBeNull();
    expect(await readDoc(`leaderboard/${googleUid}`)).toBeNull();
    expect(await readDoc(`feedbackLimits/${googleUid}`)).toBeNull();
    expect(await accountExists(googleUid)).toBe(true);
    expect(d.cloud.uid).toBe(googleUid);
    expect(d.cloud.status).toMatchObject({ needsReauth: true, isAnonymous: false, accountName: 'Holly' });
    expect(d.save).toMatchObject({ totalPresents: 0, foundJokes: [] });
    // Nothing is written as the deleted player while it waits.
    d.save.nights = 1;
    expect(await d.cloud.markDirty({ now: true })).toBe(false);
    expect(await readDoc(`players/${googleUid}`)).toBeNull();

    // Another Google account in the popup: Firebase refuses, nothing changes.
    pick = 'someone-else-google';
    expect(await d.cloud.reauthAndDelete()).toMatchObject({ ok: false, reason: 'wrong-account', needsReauth: true, error: 'auth/user-mismatch' });
    expect(await accountExists(googleUid)).toBe(true);
    expect(await accountExists(other.cloud.uid)).toBe(true);
    expect(d.cloud.uid).toBe(googleUid);

    pick = 'stale-google';
    expect(await d.cloud.reauthAndDelete()).toEqual({ ok: true, accountDeleted: true });
    expect(await accountExists(googleUid)).toBe(false);
    expect(d.cloud.uid).not.toBe(googleUid);
    expect(d.cloud.status).toMatchObject({ needsReauth: false, isAnonymous: true, accountName: null, state: 'synced' });
    expect((await readDoc(`players/${d.cloud.uid}`)).save).toEqual(toCloudSave(d.save));
    expect(d.save).toMatchObject({ totalPresents: 0, nights: 1 }); // played since the delete: kept
    expect(await readDoc(`players/${googleUid}`)).toBeNull();
    expect(await readDoc(`players/${other.cloud.uid}`)).not.toBeNull();
  });
});

describe('feedback on the emulators', () => {
  const FEEDBACK = { rating: 5, category: 'wardrobe', quick: ['loved', 'moreClothes'], comment: 'More hats please!', islandSeed: 424242 };

  // Every feedback doc a uid has sent, read past the rules like the owner's console.
  async function feedbackOf(uid) {
    let docs = [];
    await env.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDocs(query(collection(ctx.firestore(), 'feedback'), where('uid', '==', uid)));
      docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    });
    return docs;
  }

  it('sends one doc the rules accept, with its stamp, and answers too-soon after', async () => {
    const d = device('feedbacker', makeSave({ totalPresents: 4, bestPresentsInNight: 4 }));
    expect(await d.cloud.start()).toBe(true);
    const uid = d.cloud.uid;
    expect(await d.cloud.sendFeedback(FEEDBACK)).toEqual({ ok: true });
    const sent = await feedbackOf(uid);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ uid, ...FEEDBACK, deviceType: 'desktop' });
    expect(typeof sent[0].appVersion).toBe('string');
    expect(sent[0].createdAt).toBeInstanceOf(Timestamp);
    const stamp = await readDoc(`feedbackLimits/${uid}`);
    expect(stamp.lastId).toBe(sent[0].id);
    expect(stamp.lastAt.toMillis()).toBe(sent[0].createdAt.toMillis());

    expect(await d.cloud.sendFeedback({ ...FEEDBACK, rating: 4 })).toEqual({ ok: false, error: 'too-soon' });
    expect(await feedbackOf(uid)).toHaveLength(1);
  });

  it('a refused send reads as too-soon when the stamp is recent, and goes through once it is 10 minutes old', async () => {
    const d = device('feedbackerTwo', makeSave());
    expect(await d.cloud.start()).toBe(true);
    const uid = d.cloud.uid;
    // sent from another device a minute ago: the rules refuse, the stamp explains
    await writeDoc(`feedbackLimits/${uid}`, { lastAt: Timestamp.fromMillis(Date.now() - 60 * 1000), lastId: 'elsewhere' });
    expect(await d.cloud.sendFeedback(FEEDBACK)).toEqual({ ok: false, error: 'too-soon' });
    expect(await feedbackOf(uid)).toEqual([]);
    await writeDoc(`feedbackLimits/${uid}`, { lastAt: Timestamp.fromMillis(Date.now() - 11 * 60 * 1000), lastId: 'elsewhere' });
    expect(await d.cloud.sendFeedback(FEEDBACK)).toEqual({ ok: true });
    expect(await feedbackOf(uid)).toHaveLength(1);
  });

  it("deleteEverything removes the player's feedback and stamp, and nobody else's", async () => {
    const other = device('feedbackOther', makeSave());
    expect(await other.cloud.start()).toBe(true);
    expect(await other.cloud.sendFeedback({ ...FEEDBACK, comment: '' })).toEqual({ ok: true });

    const d = device('feedbackDeleter', makeSave({ totalPresents: 9, bestPresentsInNight: 9 }));
    expect(await d.cloud.start()).toBe(true);
    const uid = d.cloud.uid;
    expect(await d.cloud.sendFeedback(FEEDBACK)).toEqual({ ok: true });
    expect(await feedbackOf(uid)).toHaveLength(1);

    expect(await d.cloud.deleteEverything()).toEqual({ ok: true, accountDeleted: true });
    expect(await feedbackOf(uid)).toEqual([]);
    expect(await readDoc(`feedbackLimits/${uid}`)).toBeNull();
    expect(await readDoc(`players/${uid}`)).toBeNull();
    expect(await feedbackOf(other.cloud.uid)).toHaveLength(1);
    expect(await readDoc(`feedbackLimits/${other.cloud.uid}`)).not.toBeNull();
    // the new guest is a new player, free to send straight away
    expect(d.cloud.uid).not.toBe(uid);
    expect(await d.cloud.sendFeedback(FEEDBACK)).toEqual({ ok: true });
  });

  it("switching into an existing Google account drops the guest's feedback with its other docs", async () => {
    const first = device('feedbackGoogleFirst', makeSave(), 'fb-google', 'Holly Elf');
    expect(await first.cloud.start()).toBe(true);
    expect(await first.cloud.linkGoogle()).toEqual({ ok: true, switched: false });

    const d = device('feedbackGuestThenGoogle', makeSave(), 'fb-google', 'Holly Elf');
    expect(await d.cloud.start()).toBe(true);
    const guest = d.cloud.uid;
    expect(await d.cloud.sendFeedback(FEEDBACK)).toEqual({ ok: true });
    expect(await feedbackOf(guest)).toHaveLength(1);

    expect(await d.cloud.linkGoogle()).toEqual({ ok: true, switched: true });
    expect(d.cloud.uid).toBe(first.cloud.uid);
    expect(await feedbackOf(guest)).toEqual([]);
    expect(await readDoc(`feedbackLimits/${guest}`)).toBeNull();
    expect(await readDoc(`players/${guest}`)).toBeNull();
  });
});
