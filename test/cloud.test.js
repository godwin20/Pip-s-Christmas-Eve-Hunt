// The cloud facade's timing and failure rules with a fake Firebase (no network).
// The real SDK and emulators are covered by test/cloud.integration.test.js.

import { describe, it, expect } from 'vitest';
import { createCloud, BOARDS } from '../src/cloud/cloud.js';
import { toCloudSave, ensureProfile } from '../src/cloud/merge.js';
import { defaultSave, syncCoinLedger } from '../src/core/save.js';
import { spentOnUpgrades, buyUpgrade } from '../src/game/upgrades.js';
import { APP_VERSION } from '../src/cloud/feedback.js';

const CONFIG = { apiKey: 'k', projectId: 'demo-pips-hunt', appId: 'a' };
const RANKED = ['bestNight', 'totalPresents', 'jokesFound'];

// Timers that only fire when the test moves the clock.
function fakeClock() {
  let t = 1000;
  let nextId = 0;
  const timers = new Map();
  return {
    now: () => t,
    setTimer: (fn, ms) => {
      timers.set(++nextId, { fn, at: t + ms });
      return nextId;
    },
    clearTimer: (id) => timers.delete(id),
    advance(ms) {
      t += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= t && timers.delete(id)) timer.fn();
      }
    },
  };
}

// The "server": documents plus when each was last written. Several fake SDKs
// can share one, like two devices talking to the same project.
function fakeBackend() {
  return { store: {}, writtenAt: {}, writes: [], refused: [] };
}

function denied(message) {
  return Object.assign(new Error(message), { code: 'permission-denied' });
}

// Just enough of firebase-sdk.js for the facade. Writes follow firestore.rules
// where the facade relies on them: owner only, and leaderboard updates neither
// lower a ranked score nor come within 5 s of the last write. Pass the same
// sdk to two facades for two tabs (one shared sign-in), or the same backend to
// two sdks for two devices.
function fakeSdk({ backend = fakeBackend(), now = () => 0 } = {}) {
  const { store, writtenAt, writes, refused } = backend;
  const listeners = new Set();
  const snap = (data) => ({ exists: () => data !== undefined, data: () => structuredClone(data) });
  const auth = { currentUser: null, authStateReady: async () => {} };
  const setUser = (user) => {
    auth.currentUser = user;
    for (const fn of [...listeners]) queueMicrotask(() => fn(user));
  };
  // A feedback doc belongs to the uid it holds; every other doc to its id.
  const own = (ref, data) => {
    const [col, id] = String(ref).split('/');
    const owner = col === 'feedback' ? (data || store[ref] || {}).uid : id;
    if (!auth.currentUser || owner !== auth.currentUser.uid) throw denied(`not the owner of ${ref}`);
  };
  const put = (ref, data) => {
    own(ref, data);
    if (JSON.stringify(data) !== JSON.stringify(data, (k, v) => (v === undefined ? null : v))) {
      throw new Error(`undefined written to ${ref}`);
    }
    const old = store[ref];
    if (ref.startsWith('leaderboard/') && old) {
      const tooSoon = now() - writtenAt[ref] < 5000;
      if (tooSoon || RANKED.some((k) => data[k] < old[k])) {
        refused.push(ref);
        throw denied(tooSoon ? 'leaderboard update within 5 s' : 'leaderboard update lowers a score');
      }
    }
    writes.push(ref);
    writtenAt[ref] = now();
    store[ref] = structuredClone(data);
  };
  let anonCount = 0;
  let autoIds = 0;
  const sdk = {
    backend,
    store,
    writes,
    auth,
    batchError: null, // error the next batch commit throws
    listError: null, // error the next feedback query throws
    batches: 0,
    linkResult: null, // error the next linkWithPopup throws
    linkCalls: 0,
    failDelete: null, // ref whose next delete fails
    deleteUserError: null, // error deleteUser throws (until a fresh sign-in, see reauthenticateWithPopup)
    deletedUsers: [],
    reauthResult: null, // error the next reauthenticateWithPopup throws
    reauthCalls: [], // the custom parameters of each reauthenticateWithPopup
    onCommit: null, // runs after each transaction commits, to stage races
    initializeApp: () => ({}),
    getApp: () => ({}),
    deleteApp: async () => {},
    initializeAuth: () => auth,
    getAuth: () => auth,
    connectAuthEmulator: () => {},
    initializeFirestore: () => ({}),
    getFirestore: () => ({}),
    connectFirestoreEmulator: () => {},
    terminate: async () => {},
    onAuthStateChanged: (a, fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    signInAnonymously: async () => setUser({ uid: `anon${++anonCount}`, isAnonymous: true, providerData: [] }),
    signOut: async () => setUser(null),
    deleteUser: async (user) => {
      if (sdk.deleteUserError) throw sdk.deleteUserError;
      sdk.deletedUsers.push(user.uid);
      setUser(null);
    },
    signInWithCredential: async (a, credential) =>
      setUser({ uid: credential.uid, isAnonymous: false, displayName: 'Pip Penguin', providerData: [] }),
    linkWithPopup: async (user) => {
      sdk.linkCalls++;
      if (sdk.linkResult) throw sdk.linkResult;
      Object.assign(user, { isAnonymous: false, displayName: 'Pip Penguin' }); // same user, same uid
    },
    // A fresh Google sign-in: deleteUser goes through after it.
    reauthenticateWithPopup: async (user, provider) => {
      sdk.reauthCalls.push(provider.params);
      if (sdk.reauthResult) {
        const err = sdk.reauthResult;
        sdk.reauthResult = null;
        throw err;
      }
      sdk.deleteUserError = null;
    },
    GoogleAuthProvider: class {
      setCustomParameters(params) {
        this.params = params;
      }
      static credentialFromError(err) {
        return (err && err.credential) || null;
      }
    },
    // doc(collection) is a new doc with a random id, which the facade reads as ref.id
    doc: (db, col, id) => {
      if (col !== undefined) return `${col}/${id}`;
      const newId = `fb${++autoIds}`;
      return { id: newId, toString: () => `${db}/${newId}` };
    },
    serverTimestamp: () => 'SERVER_TIME',
    // firestore.rules for feedback: the owner's uid, stamped in the same batch
    // in feedbackLimits/{uid}, and at most one every 10 minutes
    writeBatch: () => {
      const staged = [];
      return {
        set: (ref, data) => staged.push([String(ref), structuredClone(data)]),
        commit: async () => {
          sdk.batches++;
          if (sdk.batchError) {
            const err = sdk.batchError;
            sdk.batchError = null;
            throw err;
          }
          for (const [ref, data] of staged) {
            if (!ref.startsWith('feedback/')) continue;
            own(ref, data);
            const limits = `feedbackLimits/${data.uid}`;
            if (!staged.some(([r, d]) => r === limits && d.lastId === ref.split('/')[1])) throw denied('feedback without its stamp');
            if (store[limits] && now() - writtenAt[limits] < 10 * 60 * 1000) {
              refused.push(ref);
              throw denied('feedback within 10 minutes');
            }
          }
          for (const [ref, data] of staged) put(ref, data);
        },
      };
    },
    runTransaction: async (db, fn) => {
      const staged = [];
      await fn({
        get: async (ref) => {
          own(ref);
          return snap(store[ref]);
        },
        set: (ref, data) => staged.push([ref, data]),
      });
      for (const [ref, data] of staged) put(ref, data);
      if (sdk.onCommit) sdk.onCommit();
    },
    setDoc: async (ref, data) => put(ref, data),
    deleteDoc: async (ref) => {
      own(ref);
      // firestore.rules: a stamp goes only once the feedback it names is gone
      if (ref.startsWith('feedbackLimits/') && store[ref] && store[`feedback/${store[ref].lastId}`]) throw denied('stamp of live feedback');
      if (sdk.failDelete === ref) {
        sdk.failDelete = null;
        throw Object.assign(new Error('delete failed'), { code: 'unavailable' });
      }
      writes.push(`delete ${ref}`);
      delete store[ref];
      delete writtenAt[ref];
    },
    getDoc: async (ref) => snap(store[ref]),
    collection: (db, col) => col,
    where: (field, op, value) => ({ where: [field, op, value] }),
    orderBy: (field) => ({ orderBy: field }),
    limit: (n) => ({ limit: n }),
    query: (col, ...parts) => Object.assign({ col }, ...parts),
    lastQuery: null,
    getDocs: async (q) => {
      sdk.lastQuery = q;
      const [field, op, value] = q.where;
      if (q.col === 'feedback') {
        if (sdk.listError) {
          const err = sdk.listError;
          sdk.listError = null;
          throw err;
        }
        // only a query for the player's own
        if (field !== 'uid' || op !== '==' || !auth.currentUser || value !== auth.currentUser.uid) throw denied('feedback list');
      }
      const match = (d) => (op === '==' ? d[field] === value : d[field] > value);
      const docs = Object.keys(store)
        .filter((ref) => ref.startsWith(`${q.col}/`) && match(store[ref]))
        .map((ref) => ({ id: ref.split('/')[1], data: () => structuredClone(store[ref]) }))
        .sort((a, b) => (q.orderBy ? b.data()[q.orderBy] - a.data()[q.orderBy] : 0))
        .slice(0, q.limit);
      return { docs };
    },
    getCount: async (q) => {
      const count = Object.keys(store).filter((ref) => ref.startsWith(`${q.col}/`) && store[ref][q.where[0]] > q.where[2]).length;
      return { data: () => ({ count }) };
    },
  };
  return sdk;
}

function makeSave(over = {}) {
  const save = syncCoinLedger({ ...defaultSave(), totalPresents: 12, bestPresentsInNight: 5, ...over });
  return ensureProfile(save, () => 0.5);
}

function coinsOk(s) {
  return s.coins === s.coinsEarned - spentOnUpgrades(s.upgrades) && s.coins >= 0;
}

// One browser's localStorage, shared by its tabs.
function fakeStorage() {
  const items = new Map();
  return {
    getItem: (k) => (items.has(k) ? items.get(k) : null),
    setItem: (k, v) => items.set(k, String(v)),
    removeItem: (k) => items.delete(k),
  };
}

// One facade. `onReplace(t)` runs after each replaceSave, like main.js's.
// `storage` is the browser's localStorage (none unless a test passes one).
function setup({ save = makeSave(), clock = fakeClock(), backend, sdk, storage = null, loadFirebase, onReplace } = {}) {
  const fake = sdk || fakeSdk({ backend, now: clock.now });
  const t = { save, sdk: fake, clock, replaced: 0, badCoins: 0, states: [], statuses: [] };
  t.cloud = createCloud(
    {
      getSave: () => t.save,
      replaceSave: (next) => {
        if (!coinsOk(next)) t.badCoins++;
        t.save = structuredClone(next);
        t.replaced++;
        if (onReplace) onReplace(t);
      },
      onStatus: (s) => {
        t.states.push(s.state);
        t.statuses.push(s);
      },
    },
    {
      config: CONFIG,
      useEmulator: false,
      loadFirebase: loadFirebase || (async () => fake),
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      random: () => 0.25,
      storage,
    },
  );
  return t;
}

// Lets queued promise callbacks (the push chain) run.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createCloud without a Firebase project', () => {
  it('is off, and every method resolves without touching the network', async () => {
    let loads = 0;
    const cloud = createCloud(
      { getSave: () => makeSave(), replaceSave: () => {}, onStatus: () => {} },
      { config: null, loadFirebase: async () => loads++ },
    );
    expect(cloud.enabled).toBe(false);
    expect(cloud.status).toMatchObject({ state: 'off', isAnonymous: true, accountName: null });
    expect(cloud.BOARDS).toBe(BOARDS);
    expect(BOARDS.map((b) => b.id)).toEqual(['bestNight', 'totalPresents', 'jokesFound']);
    expect(await cloud.start()).toBe(false);
    expect(await cloud.markDirty({ now: true })).toBe(false);
    expect(await cloud.flush()).toBe(false);
    expect(await cloud.hold(false)).toBe(false);
    expect((await cloud.linkGoogle()).ok).toBe(false);
    expect((await cloud.signOutToFresh()).ok).toBe(false);
    expect((await cloud.resetEverywhere()).ok).toBe(false);
    expect(await cloud.deleteEverything()).toEqual({ ok: false, error: 'cloud-off' });
    expect(await cloud.reauthAndDelete()).toEqual({ ok: false, error: 'cloud-off' });
    expect(await cloud.sendFeedback({ rating: 5, category: 'idea' })).toEqual({ ok: false, error: 'cloud-off' });
    expect(await cloud.getLeaderboard('bestNight')).toMatchObject({ entries: [], me: null, error: 'cloud-off' });
    expect(cloud.ready).toBe(false);
    expect(loads).toBe(0);
  });
});

describe('createCloud when Firebase fails', () => {
  it('goes offline when the SDK chunk cannot load, and never rejects', async () => {
    const t = setup({ loadFirebase: () => Promise.reject(new TypeError('Failed to fetch dynamically imported module')) });
    expect(await t.cloud.start()).toBe(false);
    expect(t.cloud.status).toMatchObject({ state: 'offline', ready: false });
    expect(t.cloud.ready).toBe(false);
    expect(await t.cloud.markDirty({ now: true })).toBe(false);
    expect(await t.cloud.linkGoogle()).toEqual({ ok: false, reason: 'not-ready', error: 'not-ready' });
    expect((await t.cloud.resetEverywhere()).ok).toBe(false);
    expect((await t.cloud.deleteEverything()).ok).toBe(false);
    expect(await t.cloud.reauthAndDelete()).toEqual({ ok: false, reason: 'not-ready', error: 'not-ready' });
    expect((await t.cloud.getLeaderboard('totalPresents')).error).toBeTruthy();
    expect(await t.cloud.setProfile({ adj: 3 })).toBe(false);
    expect(t.save.profile.adj).toBe(3); // the name still changes on this device
  });

  it('shows an error when a write is refused, and retries on the next trigger', async () => {
    const t = setup();
    const refused = Object.assign(new Error('nope'), { code: 'permission-denied' });
    const runTransaction = t.sdk.runTransaction;
    t.sdk.runTransaction = async () => {
      throw refused;
    };
    expect(await t.cloud.start()).toBe(false);
    expect(t.cloud.status).toMatchObject({ state: 'error', error: 'permission-denied' });
    t.sdk.runTransaction = runTransaction;
    expect(await t.cloud.flush()).toBe(true); // still dirty from the failure
    expect(t.cloud.status.state).toBe('synced');
  });

  it('survives getSave and replaceSave throwing', async () => {
    const sdk = fakeSdk();
    const cloud = createCloud(
      {
        getSave: () => {
          throw new Error('boom');
        },
        replaceSave: () => {
          throw new Error('boom');
        },
        onStatus: () => {
          throw new Error('boom');
        },
      },
      { config: CONFIG, loadFirebase: async () => sdk },
    );
    expect(await cloud.start()).toBe(false);
    expect(await cloud.setProfile({ hidden: true })).toBe(false);
  });

  it('resolves, never throws or rejects, when called with odd arguments', async () => {
    const t = setup();
    await t.cloud.start();
    expect(() => t.cloud.markDirty(null)).not.toThrow();
    await expect(t.cloud.markDirty(null)).resolves.toBe(false);
    await expect(t.cloud.getLeaderboard('totalPresents', null)).resolves.toMatchObject({ entries: [expect.any(Object)] });
    await expect(t.cloud.setProfile(null)).resolves.toBeTypeOf('boolean');
    await expect(t.cloud.setProfile({ adj: 'Jolly', num: 1e9 })).resolves.toBeTypeOf('boolean');
    expect(t.save.profile).toMatchObject({ adj: 20, num: 50 }); // the invalid name was refused
    await expect(t.cloud.hold('yes')).resolves.toBe(false);
    await expect(t.cloud.hold(0)).resolves.toBeTypeOf('boolean');
  });
});

describe('createCloud ready', () => {
  it('turns ready once Firebase is loaded and a player is signed in', async () => {
    const t = setup();
    expect(t.cloud.ready).toBe(false);
    expect(t.cloud.status.ready).toBe(false);
    await t.cloud.start();
    expect(t.cloud.ready).toBe(true);
    expect(t.cloud.status.ready).toBe(true);
    expect(t.statuses.filter((s) => s.ready).length).toBeGreaterThan(0); // onStatus heard it
  });

  it('loads Firebase at start even while a night holds the first push', async () => {
    const t = setup();
    t.cloud.hold(true);
    expect(await t.cloud.start()).toBe(false);
    await settle();
    expect(t.cloud.ready).toBe(true);
    expect(t.sdk.writes).toEqual([]); // ready, but nothing pushed mid-night
    expect(await t.cloud.hold(false)).toBe(true);
    expect(t.sdk.store['players/anon1']).toBeDefined();
  });

  it('answers not-ready at once before then, and never loads Firebase inside the tap', async () => {
    const sdk = fakeSdk();
    let loads = 0;
    let finishLoad = null;
    const t = setup({
      sdk,
      loadFirebase: () => {
        loads++;
        return new Promise((resolve) => (finishLoad = () => resolve(sdk)));
      },
    });
    expect(await t.cloud.linkGoogle()).toEqual({ ok: false, reason: 'not-ready', error: 'not-ready' });
    expect(loads).toBe(0);
    const started = t.cloud.start();
    expect(loads).toBe(1); // start() loads it
    expect(await t.cloud.linkGoogle()).toEqual({ ok: false, reason: 'not-ready', error: 'not-ready' });
    expect(loads).toBe(1);
    expect(sdk.linkCalls).toBe(0);
    finishLoad();
    expect(await started).toBe(true);
    expect(t.cloud.ready).toBe(true);
    expect(await t.cloud.linkGoogle()).toEqual({ ok: true, switched: false });
    expect(sdk.linkCalls).toBe(1);
  });

  it('goes unready while it has no player, and ready again as the new one', async () => {
    const t = setup();
    await t.cloud.start();
    await t.cloud.linkGoogle();
    t.clock.advance(7000);
    t.statuses.length = 0;
    expect(await t.cloud.signOutToFresh()).toEqual({ ok: true });
    const flips = t.statuses.map((s) => s.ready).filter((r, i, all) => i === 0 || r !== all[i - 1]);
    expect(flips).toEqual([true, false, true]);
    expect(t.cloud.ready).toBe(true);
  });

  it('goes quiet when disposed', async () => {
    const t = setup();
    await t.cloud.start();
    await t.cloud.dispose();
    expect(t.cloud.ready).toBe(false);
    expect(t.cloud.status.ready).toBe(false);
    expect(await t.cloud.linkGoogle()).toEqual({ ok: false, reason: 'not-ready', error: 'not-ready' });
  });
});

describe('createCloud pushes', () => {
  it('first push writes the cloud copy and the board entry, without undefined', async () => {
    const t = setup();
    expect(await t.cloud.start()).toBe(true);
    expect(t.statuses.map((s) => [s.state, s.ready])).toEqual([
      ['connecting', false],
      ['connecting', true], // signed in: the Google button may open its popup now
      ['syncing', true],
      ['synced', true],
    ]);
    expect(t.sdk.store['players/anon1']).toEqual({ v: 1, save: toCloudSave(t.save), updatedAt: 'SERVER_TIME' });
    expect(t.sdk.store['leaderboard/anon1']).toMatchObject({ bestNight: 5, totalPresents: 12, updatedAt: 'SERVER_TIME' });
    expect(t.replaced).toBe(0);
  });

  it('hands a changed merge to replaceSave', async () => {
    const t = setup();
    t.sdk.auth.currentUser = { uid: 'anon1', isAnonymous: true, providerData: [] };
    t.sdk.store['players/anon1'] = { v: 1, save: toCloudSave(makeSave({ totalPresents: 90, foundJokes: ['j009'] })) };
    expect(await t.cloud.start()).toBe(true);
    expect(t.replaced).toBe(1);
    expect(t.save).toMatchObject({ totalPresents: 90, foundJokes: ['j009'] });
  });

  it('debounces markDirty by 2 s, or pushes at once with now', async () => {
    const t = setup();
    await t.cloud.start();
    const before = t.sdk.writes.length;
    t.save.nights = 3;
    t.cloud.markDirty();
    t.clock.advance(1999);
    await settle();
    expect(t.sdk.writes.length).toBe(before);
    t.clock.advance(1);
    await settle();
    expect(t.sdk.store['players/anon1'].save.nights).toBe(3);
    t.save.nights = 4;
    expect(await t.cloud.markDirty({ now: true })).toBe(true);
    expect(t.sdk.store['players/anon1'].save.nights).toBe(4);
  });

  it('never pushes while held, and pushes when the hold ends', async () => {
    const t = setup();
    await t.cloud.start();
    t.cloud.hold(true);
    const before = t.sdk.writes.length;
    t.save.totalPresents = 40;
    expect(await t.cloud.markDirty({ now: true })).toBe(false);
    t.cloud.markDirty();
    t.clock.advance(5000);
    expect(await t.cloud.flush()).toBe(false);
    await settle();
    expect(t.sdk.writes.length).toBe(before);
    expect(await t.cloud.hold(false)).toBe(true);
    expect(t.sdk.store['players/anon1'].save.totalPresents).toBe(40);
    expect(await t.cloud.hold(false)).toBe(false); // nothing dirty any more
  });

  it('settles instead of looping when replaceSave marks the save dirty again', async () => {
    let pushes = 0;
    const t = setup({ onReplace: (self) => self.cloud.markDirty() });
    const runTransaction = t.sdk.runTransaction;
    t.sdk.runTransaction = (...args) => {
      pushes++;
      return runTransaction(...args);
    };
    t.sdk.auth.currentUser = { uid: 'anon1', isAnonymous: true, providerData: [] };
    t.sdk.store['players/anon1'] = { v: 1, save: toCloudSave(makeSave({ totalPresents: 90, upgrades: { radar: 2 }, coinsEarned: 500 })) };
    await t.cloud.start();
    for (let i = 0; i < 10; i++) {
      t.clock.advance(2000);
      await settle();
    }
    expect(pushes).toBe(2); // the first, then the one replaceSave asked for, then quiet
    expect(t.replaced).toBe(1);
    expect(t.badCoins).toBe(0);
  });

  it('keeps coins === coinsEarned - spent on two devices buying different upgrades', async () => {
    const backend = fakeBackend();
    const clock = fakeClock();
    const a = setup({ backend, clock, save: makeSave({ coinsEarned: 400 }) });
    await a.cloud.start();
    clock.advance(7000); // so the second device's board write is not refused as too soon
    const b = setup({ backend, clock, sdk: fakeSdk({ backend, now: clock.now }), save: structuredClone(a.save) });
    b.sdk.auth.currentUser = { uid: 'anon1', isAnonymous: true, providerData: [] }; // same account
    await b.cloud.start();
    expect(buyUpgrade(a.save, 'radar')).toBe(true);
    expect(buyUpgrade(b.save, 'magnet')).toBe(true);
    expect(buyUpgrade(b.save, 'compass')).toBe(true);
    await a.cloud.markDirty({ now: true });
    await b.cloud.markDirty({ now: true });
    await a.cloud.markDirty({ now: true });
    for (const s of [a.save, b.save]) {
      expect(s.upgrades).toEqual({ radar: 1, magnet: 1, compass: 1 });
      expect(s).toMatchObject({ coinsEarned: 400, coins: 400 - 40 - 60 - 80 });
    }
    expect(a.badCoins + b.badCoins).toBe(0);
  });
});

describe('createCloud skips unchanged saves', () => {
  it('writes the save only when the cloud lacks something, whatever the list order', async () => {
    const t = setup({ save: makeSave({ foundJokes: ['j001', 'j002'], unlocked: ['scarf', 'puppy'] }) });
    await t.cloud.start();
    const saveWrites = () => t.sdk.writes.filter((w) => w === 'players/anon1').length;
    expect(saveWrites()).toBe(1);

    expect(await t.cloud.markDirty({ now: true })).toBe(true);
    expect(saveWrites()).toBe(1); // nothing new
    expect(t.cloud.status).toMatchObject({ state: 'synced', error: null });

    // Another device on the account wrote the same progress in its own order.
    t.sdk.store['players/anon1'].save.foundJokes = ['j002', 'j001'];
    t.sdk.store['players/anon1'].save.unlocked = ['puppy', 'scarf'];
    expect(await t.cloud.markDirty({ now: true })).toBe(true);
    expect(saveWrites()).toBe(1);
    expect(t.save.foundJokes).toEqual(['j001', 'j002']); // this device keeps its own order
    expect(t.replaced).toBe(0);

    t.save.nights = 7;
    expect(await t.cloud.markDirty({ now: true })).toBe(true);
    expect(saveWrites()).toBe(2);
    expect(t.sdk.store['players/anon1'].save.nights).toBe(7);
  });

  it('still pulls what another device added, without writing it back', async () => {
    const t = setup();
    await t.cloud.start();
    const pulled = makeSave({ totalPresents: 90, foundJokes: ['j009'] });
    t.sdk.store['players/anon1'] = { v: 1, save: toCloudSave(pulled), updatedAt: 'SERVER_TIME' };
    const before = t.sdk.writes.length;
    expect(await t.cloud.markDirty({ now: true })).toBe(true);
    expect(t.save).toMatchObject({ totalPresents: 90, foundJokes: ['j009'] });
    expect(t.sdk.writes.slice(before).filter((w) => w.startsWith('players/'))).toEqual([]);
  });
});

describe('createCloud leaderboard writes', () => {
  it('skips unchanged entries and spaces changed ones 6 s apart', async () => {
    const t = setup();
    await t.cloud.start();
    const boardWrites = () => t.sdk.writes.filter((w) => w.includes('leaderboard')).length;
    expect(boardWrites()).toBe(1);
    await t.cloud.markDirty({ now: true });
    expect(boardWrites()).toBe(1); // unchanged

    t.save.totalPresents = 20;
    await t.cloud.markDirty({ now: true });
    expect(boardWrites()).toBe(1); // too soon: deferred
    t.clock.advance(5999);
    await settle();
    expect(boardWrites()).toBe(1);
    t.clock.advance(1);
    await settle();
    expect(boardWrites()).toBe(2);
    expect(t.sdk.store['leaderboard/anon1'].totalPresents).toBe(20);
  });

  it('still posts within 6 s after the device clock is set back', async () => {
    const t = setup();
    await t.cloud.start();
    t.clock.advance(-3600000); // an hour back
    t.save.totalPresents = 25;
    await t.cloud.markDirty({ now: true });
    t.sdk.backend.writtenAt['leaderboard/anon1'] -= 3600000; // the server's clock did not move
    t.clock.advance(6000);
    await settle();
    expect(t.sdk.store['leaderboard/anon1'].totalPresents).toBe(25);
  });

  it('a write deferred into a night is posted when the hold ends', async () => {
    const t = setup();
    await t.cloud.start();
    t.save.totalPresents = 30;
    await t.cloud.markDirty({ now: true });
    t.cloud.hold(true);
    t.clock.advance(7000);
    await settle();
    expect(t.sdk.store['leaderboard/anon1'].totalPresents).toBe(12); // not mid-night
    await t.cloud.hold(false);
    expect(t.sdk.store['leaderboard/anon1'].totalPresents).toBe(30);
  });

  it('a deferred write posts the cloud as it is then, not the scores from before a reset', async () => {
    const t = setup();
    await t.cloud.start();
    t.save.totalPresents = 20;
    await t.cloud.markDirty({ now: true }); // board write deferred by the 6 s gap
    // Meanwhile another device on this account resets and recreates the entry.
    t.clock.advance(3000);
    const reset = makeSave({ epoch: 1, totalPresents: 2, bestPresentsInNight: 2 });
    t.sdk.store['players/anon1'] = { v: 1, save: toCloudSave(reset), updatedAt: 'SERVER_TIME' };
    t.sdk.store['leaderboard/anon1'] = { ...t.sdk.store['leaderboard/anon1'], bestNight: 2, totalPresents: 2 };
    t.sdk.backend.writtenAt['leaderboard/anon1'] = t.clock.now() - 6000; // so only lowering is refused
    t.clock.advance(3000);
    await settle();
    expect(t.save).toMatchObject({ epoch: 1, totalPresents: 2 });
    t.clock.advance(6000);
    await settle();
    expect(t.sdk.store['leaderboard/anon1']).toMatchObject({ totalPresents: 2, bestNight: 2 });
  });

  it('removes the entry while hidden', async () => {
    const t = setup();
    await t.cloud.start();
    t.clock.advance(7000);
    await t.cloud.setProfile({ hidden: true });
    expect(t.save.profile).toMatchObject({ hidden: true, setAt: t.clock.now() });
    expect(t.sdk.store['leaderboard/anon1']).toBeUndefined();
    expect(t.sdk.store['players/anon1'].save.profile.hidden).toBe(true);
  });

  it('recreates an entry whose stored scores are above a reset save', async () => {
    const t = setup({ save: makeSave({ totalPresents: 80, bestPresentsInNight: 20 }) });
    await t.cloud.start();
    t.clock.advance(7000);
    t.save = makeSave({ epoch: 1, totalPresents: 0, bestPresentsInNight: 0, profile: t.save.profile });
    expect(await t.cloud.resetEverywhere()).toEqual({ ok: true });
    expect(t.sdk.writes.slice(-2)).toEqual(['delete leaderboard/anon1', 'leaderboard/anon1']);
    expect(t.sdk.store['leaderboard/anon1']).toMatchObject({ totalPresents: 0, bestNight: 0 });
    expect(t.sdk.store['players/anon1'].save).toMatchObject({ epoch: 1, totalPresents: 0 });
  });

  it('repairs the board after a reset whose board step failed', async () => {
    const t = setup({ save: makeSave({ totalPresents: 80, bestPresentsInNight: 20 }) });
    await t.cloud.start();
    t.clock.advance(7000);
    // Another device reset this account but never got to the board.
    t.sdk.store['players/anon1'] = { v: 1, save: toCloudSave(makeSave({ epoch: 1, totalPresents: 3, bestPresentsInNight: 3 })) };
    await t.cloud.markDirty({ now: true });
    expect(t.save).toMatchObject({ epoch: 1, totalPresents: 3 });
    expect(t.sdk.store['leaderboard/anon1']).toMatchObject({ totalPresents: 3, bestNight: 3 });
  });

  it('never deletes higher scores another device on the account just posted', async () => {
    const t = setup({ save: makeSave({ totalPresents: 40, bestPresentsInNight: 10 }) });
    await t.cloud.start();
    t.clock.advance(7000);
    t.save.nights = 9;
    // The other device commits more progress and posts it between our
    // transaction and our board write.
    t.sdk.onCommit = () => {
      t.sdk.onCommit = null;
      const other = makeSave({ totalPresents: 70, bestPresentsInNight: 15, nights: 2 });
      t.sdk.store['players/anon1'] = { v: 1, save: toCloudSave(other), updatedAt: 'SERVER_TIME' };
      t.sdk.store['leaderboard/anon1'] = { ...t.sdk.store['leaderboard/anon1'], bestNight: 15, totalPresents: 70 };
      t.sdk.backend.writtenAt['leaderboard/anon1'] = t.clock.now() - 6000;
    };
    await t.cloud.markDirty({ now: true });
    await settle();
    expect(t.sdk.writes).not.toContain('delete leaderboard/anon1');
    expect(t.sdk.store['leaderboard/anon1']).toMatchObject({ totalPresents: 70, bestNight: 15 });
    expect(t.save).toMatchObject({ totalPresents: 70, bestPresentsInNight: 15, nights: 9 }); // pulled
    t.clock.advance(6000);
    await settle();
    expect(t.sdk.store['leaderboard/anon1']).toMatchObject({ totalPresents: 70, bestNight: 15, nights: 9 });
  });
});

describe('createCloud board spacing across accounts', () => {
  it('keeps board writes 6 s apart through a quick sign-out and back in, so none is refused', async () => {
    const t = setup();
    await t.cloud.start();
    expect(await t.cloud.linkGoogle()).toEqual({ ok: true, switched: false }); // anon1 is the Google account now
    t.clock.advance(7000);
    t.save.totalPresents = 30;
    expect(await t.cloud.signOutToFresh()).toEqual({ ok: true }); // posts 30 for the account on the way out
    expect(t.sdk.store['leaderboard/anon1'].totalPresents).toBe(30);
    expect(t.cloud.uid).toBe('anon2');

    // Straight back into the account: credential-already-in-use, then a switch.
    t.clock.advance(1000);
    t.sdk.linkResult = Object.assign(new Error('in use'), { code: 'auth/credential-already-in-use', credential: { uid: 'anon1' } });
    expect(await t.cloud.linkGoogle()).toEqual({ ok: true, switched: true });
    expect(t.save.totalPresents).toBe(30);
    t.clock.advance(6000);
    await settle();
    expect(t.sdk.backend.refused).toEqual([]);
    expect(t.sdk.store['leaderboard/anon1']).toMatchObject({ totalPresents: 30 });
    expect(t.sdk.store['leaderboard/anon2']).toBeUndefined();
  });
});

describe('createCloud getLeaderboard', () => {
  it('caps the list at 50, shares ranks on ties and counts a rank outside the list', async () => {
    const t = setup();
    await t.cloud.start();
    const others = [30, 20, 20, 15, 0];
    others.forEach((n, i) => {
      t.sdk.store[`leaderboard/p${i}`] = { adj: i, noun: i, num: 1, bestNight: 0, totalPresents: n, jokesFound: 0, nights: 1 };
    });
    const board = await t.cloud.getLeaderboard('totalPresents', { limit: 1000 });
    expect(t.sdk.lastQuery.limit).toBe(50);
    expect(board.entries.map((e) => [e.rank, e.score, e.isMe])).toEqual([
      [1, 30, false],
      [2, 20, false],
      [2, 20, false],
      [4, 15, false],
      [5, 12, true],
    ]);
    expect(board.me).toEqual({ rank: 5, score: 12 });
    const short = await t.cloud.getLeaderboard('totalPresents', { limit: 2 });
    expect(short.entries).toHaveLength(2);
    expect(short.me).toEqual({ rank: 5, score: 12 });
    expect((await t.cloud.getLeaderboard('coins')).error).toBe('unknown-board');
  });
});

describe('createCloud linkGoogle', () => {
  it('calls linkWithPopup before its promise yields, in the tap\'s own task', async () => {
    const t = setup();
    await t.cloud.start();
    let calls = 0;
    let user = null;
    t.sdk.linkWithPopup = (u) => {
      calls++;
      user = u;
      return new Promise(() => {}); // the popup stays open
    };
    const result = t.cloud.linkGoogle();
    expect(result).toBeInstanceOf(Promise);
    expect(calls).toBe(1); // already called: nothing was awaited first
    expect(user.uid).toBe('anon1');
  });

  it('opens the popup at once even while a push holds the queue', async () => {
    const t = setup();
    await t.cloud.start();
    t.sdk.runTransaction = () => new Promise(() => {}); // a push that hangs
    t.save.nights = 5;
    t.cloud.markDirty({ now: true });
    await settle();
    expect(t.cloud.status.state).toBe('syncing');
    const before = t.sdk.linkCalls;
    const result = t.cloud.linkGoogle();
    expect(t.sdk.linkCalls).toBe(before + 1);
    expect(await result).toEqual({ ok: true, switched: false });
  });

  it('leaves the account\'s docs alone when another tab moved onto it during the popup', async () => {
    const t = setup();
    await t.cloud.start();
    t.sdk.store['players/google1'] = { v: 1, save: toCloudSave(makeSave({ totalPresents: 50 })) };
    let rejectPopup = null;
    t.sdk.linkWithPopup = () => new Promise((resolve, reject) => (rejectPopup = reject));
    const result = t.cloud.linkGoogle();
    // Another tab signs this browser into the account meanwhile.
    t.sdk.auth.currentUser = { uid: 'google1', isAnonymous: false, displayName: 'Pip Penguin', providerData: [] };
    rejectPopup(Object.assign(new Error('in use'), { code: 'auth/credential-already-in-use', credential: { uid: 'google1' } }));
    expect(await result).toEqual({ ok: true, switched: true });
    expect(t.sdk.writes).not.toContain('delete players/google1');
    expect(t.sdk.store['players/google1'].save.totalPresents).toBe(50);
  });

  it('sorts popup errors for the UI: blocked, cancelled (silent), setup, offline', async () => {
    const t = setup();
    await t.cloud.start();
    const cases = [
      ['auth/popup-blocked', { ok: false, reason: 'blocked', error: 'auth/popup-blocked' }],
      ['auth/popup-closed-by-user', { ok: false, cancelled: true, reason: 'cancelled', error: 'auth/popup-closed-by-user' }],
      ['auth/cancelled-popup-request', { ok: false, cancelled: true, reason: 'cancelled', error: 'auth/cancelled-popup-request' }],
      ['auth/unauthorized-domain', { ok: false, reason: 'setup', error: 'auth/unauthorized-domain' }],
      ['auth/operation-not-allowed', { ok: false, reason: 'setup', error: 'auth/operation-not-allowed' }],
      ['auth/network-request-failed', { ok: false, reason: 'offline', error: 'auth/network-request-failed' }],
      ['auth/internal-error', { ok: false, reason: 'failed', error: 'auth/internal-error' }],
    ];
    for (const [code, expected] of cases) {
      t.sdk.linkResult = Object.assign(new Error(code), { code });
      expect(await t.cloud.linkGoogle()).toEqual(expected);
    }
    expect(t.cloud.uid).toBe('anon1');
    expect(t.cloud.status).toMatchObject({ state: 'synced', isAnonymous: true, accountName: null });
  });

  it('resolves, never throws, when the popup call itself throws', async () => {
    const t = setup();
    await t.cloud.start();
    t.sdk.linkWithPopup = () => {
      throw Object.assign(new Error('bad provider'), { code: 'auth/argument-error' });
    };
    let result;
    expect(() => (result = t.cloud.linkGoogle())).not.toThrow();
    expect(await result).toEqual({ ok: false, reason: 'failed', error: 'auth/argument-error' });
  });

  it('reports an already-used account it cannot switch to, keeping this one', async () => {
    const t = setup();
    await t.cloud.start();
    t.sdk.linkResult = Object.assign(new Error('in use'), { code: 'auth/credential-already-in-use' });
    expect(await t.cloud.linkGoogle()).toEqual({ ok: false, reason: 'failed', error: 'auth/credential-already-in-use' });
    expect(t.sdk.store['players/anon1']).toBeDefined();
  });

  it('treats an already linked provider as linked', async () => {
    const t = setup();
    await t.cloud.start();
    t.sdk.linkResult = Object.assign(new Error('linked'), { code: 'auth/provider-already-linked' });
    expect(await t.cloud.linkGoogle()).toEqual({ ok: true, switched: false });
  });

  it('switches into an existing account, merging and dropping the anonymous docs', async () => {
    const t = setup({ save: makeSave({ totalPresents: 12, foundJokes: ['j001'] }) });
    await t.cloud.start();
    t.sdk.store['players/google1'] = { v: 1, save: toCloudSave(makeSave({ totalPresents: 50, foundJokes: ['j002'] })) };
    t.sdk.linkResult = Object.assign(new Error('in use'), { code: 'auth/credential-already-in-use', credential: { uid: 'google1' } });
    expect(await t.cloud.linkGoogle()).toEqual({ ok: true, switched: true });
    expect(t.cloud.uid).toBe('google1');
    expect(t.cloud.status).toMatchObject({ state: 'synced', isAnonymous: false, accountName: 'Pip' });
    expect(t.sdk.store['players/anon1']).toBeUndefined();
    expect(t.sdk.store['leaderboard/anon1']).toBeUndefined();
    expect(t.save).toMatchObject({ totalPresents: 50, foundJokes: ['j001', 'j002'] });
    // Board writes stay 6 s apart across the switch (the last one was at start).
    expect(t.sdk.store['leaderboard/google1']).toBeUndefined();
    t.clock.advance(6000);
    await settle();
    expect(t.sdk.store['leaderboard/google1']).toMatchObject({ totalPresents: 50, jokesFound: 2 });
  });

  it('puts the board entry back when only part of a switch went through', async () => {
    const t = setup();
    await t.cloud.start();
    t.sdk.failDelete = 'players/anon1'; // the board delete lands, this one does not
    t.sdk.linkResult = Object.assign(new Error('in use'), { code: 'auth/credential-already-in-use', credential: { uid: 'google1' } });
    expect((await t.cloud.linkGoogle()).ok).toBe(false);
    expect(t.cloud.uid).toBe('anon1');
    expect(t.sdk.store['leaderboard/anon1']).toBeUndefined();
    expect(await t.cloud.markDirty({ now: true })).toBe(true);
    t.clock.advance(6000); // board writes stay 6 s apart
    await settle();
    expect(t.sdk.store['leaderboard/anon1']).toMatchObject({ totalPresents: 12 });
  });
});

describe('createCloud signOutToFresh', () => {
  async function signedInToGoogle(save) {
    const t = setup({ save });
    await t.cloud.start();
    expect(await t.cloud.linkGoogle()).toEqual({ ok: true, switched: false });
    return t;
  }

  it('starts this device fresh as a new player and leaves one board entry with the scores', async () => {
    const t = await signedInToGoogle(makeSave({ totalPresents: 60, bestPresentsInNight: 12, settings: { sfx: false, music: true, voice: true } }));
    t.clock.advance(7000);
    expect(await t.cloud.signOutToFresh()).toEqual({ ok: true });
    expect(t.cloud.uid).toBe('anon2');
    expect(t.cloud.status).toMatchObject({ state: 'synced', isAnonymous: true, accountName: null });
    expect(t.save).toMatchObject({ totalPresents: 0, coins: 0, epoch: 0, settings: { sfx: false, music: true, voice: true } });
    expect(t.sdk.store['players/anon1'].save.totalPresents).toBe(60); // the account keeps it
    expect(t.sdk.store['leaderboard/anon1'].totalPresents).toBe(60);
    expect(t.sdk.store['leaderboard/anon2']).toMatchObject({ totalPresents: 0, bestNight: 0 });
  });

  it('starts another tab fresh too, so it cannot copy the account into the new uid', async () => {
    const clock = fakeClock();
    const sdk = fakeSdk({ now: clock.now }); // one sign-in shared by both tabs
    const progress = makeSave({ totalPresents: 60, bestPresentsInNight: 12, foundJokes: ['j001', 'j002'] });
    const tabA = setup({ clock, sdk, save: structuredClone(progress) });
    const tabB = setup({ clock, sdk, save: structuredClone(progress) });
    await tabA.cloud.start();
    clock.advance(7000);
    await tabB.cloud.start();
    expect((await tabA.cloud.linkGoogle()).ok).toBe(true);
    await tabB.cloud.markDirty({ now: true }); // tab B knows it is the account now
    clock.advance(7000);

    expect(await tabA.cloud.signOutToFresh()).toEqual({ ok: true });
    await settle();
    expect(tabB.save).toMatchObject({ totalPresents: 0, foundJokes: [] });
    expect(tabB.cloud.status).toMatchObject({ isAnonymous: true, accountName: null });
    clock.advance(7000);
    expect(await tabB.cloud.markDirty({ now: true })).toBe(true);
    expect(sdk.store['players/anon2'].save).toMatchObject({ totalPresents: 0, foundJokes: [] });
    const copies = Object.keys(sdk.store).filter((ref) => ref.startsWith('leaderboard/') && sdk.store[ref].totalPresents === 60);
    expect(copies).toEqual(['leaderboard/anon1']);
  });

  it('refuses to sign out of an anonymous player, whose progress has nowhere else to live', async () => {
    const t = setup();
    await t.cloud.start();
    expect(await t.cloud.signOutToFresh()).toEqual({ ok: false, error: 'not-signed-in' });
    expect(t.save.totalPresents).toBe(12);
  });
});

describe('createCloud deleteEverything', () => {
  const SETTINGS = { sfx: false, music: true, voice: false };

  it('deletes both docs and the sign-in, then starts fresh as a new guest', async () => {
    const t = setup({ save: makeSave({ totalPresents: 60, foundJokes: ['j001'], settings: SETTINGS }) });
    await t.cloud.start();
    const oldName = t.save.profile;
    t.clock.advance(7000);
    t.statuses.length = 0;
    expect(await t.cloud.deleteEverything()).toEqual({ ok: true, accountDeleted: true });
    expect(t.sdk.writes).toEqual(expect.arrayContaining(['delete leaderboard/anon1', 'delete players/anon1']));
    expect(t.sdk.store['players/anon1']).toBeUndefined();
    expect(t.sdk.store['leaderboard/anon1']).toBeUndefined();
    expect(t.sdk.deletedUsers).toEqual(['anon1']);
    expect(t.cloud.uid).toBe('anon2');
    expect(t.cloud.status).toMatchObject({ state: 'synced', ready: true, isAnonymous: true, error: null });
    expect(t.statuses.some((s) => !s.ready)).toBe(true); // briefly nobody was signed in
    // Only the sound settings and a new random name survive.
    expect(t.save).toMatchObject({ totalPresents: 0, coins: 0, coinsEarned: 0, epoch: 0, foundJokes: [], settings: SETTINGS });
    expect(t.save.profile).toMatchObject({ hidden: false, setAt: 0 });
    expect(t.save.profile).not.toEqual(oldName);
    expect(t.sdk.store['players/anon2'].save).toEqual(toCloudSave(t.save));
    expect(t.badCoins).toBe(0);
  });

  it("signs out of a guest's sign-in that Firebase won't delete, which holds only the player ID", async () => {
    const t = setup({ save: makeSave({ totalPresents: 60, settings: SETTINGS }) });
    await t.cloud.start();
    t.clock.advance(7000);
    t.sdk.deleteUserError = Object.assign(new Error('stale sign-in'), { code: 'auth/requires-recent-login' });
    expect(await t.cloud.deleteEverything()).toEqual({ ok: true, accountDeleted: false, guest: true });
    expect(t.sdk.store['players/anon1']).toBeUndefined();
    expect(t.cloud.uid).toBe('anon2');
    expect(t.cloud.status).toMatchObject({ isAnonymous: true, needsReauth: false, ready: true });
    expect(t.save).toMatchObject({ totalPresents: 0, settings: SETTINGS });
  });

  it('changes nothing on this device when the cloud delete fails, and can try again', async () => {
    const t = setup();
    await t.cloud.start();
    const before = structuredClone(t.save);
    t.sdk.failDelete = 'players/anon1';
    expect(await t.cloud.deleteEverything()).toEqual({ ok: false, error: 'unavailable' });
    expect(t.cloud.status.state).toBe('offline');
    expect(t.cloud.uid).toBe('anon1');
    expect(t.save).toEqual(before);
    expect(t.replaced).toBe(0);
    expect(t.sdk.deletedUsers).toEqual([]);
    expect(await t.cloud.deleteEverything()).toEqual({ ok: true, accountDeleted: true });
    expect(t.sdk.store['players/anon1']).toBeUndefined();
    expect(t.cloud.uid).toBe('anon2');
  });

  it("starts the game's other tabs fresh too, and nothing is written as the deleted player", async () => {
    const clock = fakeClock();
    const backend = fakeBackend();
    const storage = fakeStorage();
    const progress = makeSave({ totalPresents: 60, bestPresentsInNight: 12, foundJokes: ['j001'] });
    // Two tabs, each with its own Firebase auth restored from the same sign-in.
    const tabA = setup({ clock, backend, storage, save: structuredClone(progress) });
    const tabB = setup({ clock, backend, storage, save: structuredClone(progress) });
    await tabA.cloud.start();
    clock.advance(7000);
    await tabB.cloud.start();
    expect([tabA.cloud.uid, tabB.cloud.uid]).toEqual(['anon1', 'anon1']);
    clock.advance(7000);

    expect(await tabB.cloud.deleteEverything()).toEqual({ ok: true, accountDeleted: true });
    expect(tabB.cloud.uid).toBe('anon2');
    const before = backend.writes.length;
    // Tab A's sign-in hasn't caught up yet (its token still works): its next
    // push neither writes as the deleted player nor keeps the old progress.
    expect(await tabA.cloud.markDirty({ now: true })).toBe(false);
    expect(backend.writes.slice(before)).toEqual([]);
    // nor does a reset there (main.js calls resetEverywhere after "Reset progress")
    expect(await tabA.cloud.resetEverywhere()).toEqual({ ok: false, error: 'offline' });
    expect(backend.writes.slice(before)).toEqual([]);
    expect(tabA.save).toMatchObject({ totalPresents: 0, bestPresentsInNight: 0, foundJokes: [] });
    expect(tabA.cloud.status.state).toBe('connecting');
    expect(backend.store['players/anon1']).toBeUndefined();
    expect(backend.store['leaderboard/anon1']).toBeUndefined();
    // Then it sees the new guest and syncs as it by itself, fresh.
    await tabA.sdk.signInAnonymously(); // anon2, the guest tab B made
    await settle();
    expect(tabA.cloud.uid).toBe('anon2');
    expect(tabA.cloud.status.state).toBe('synced');
    expect(tabA.save.totalPresents).toBe(0);
    expect(backend.store['players/anon2'].save).toMatchObject({ totalPresents: 0, foundJokes: [] });
    clock.advance(7000);
    expect(await tabA.cloud.markDirty({ now: true })).toBe(true);
    const kept = Object.values(backend.store).filter((d) => (d.save ? d.save.totalPresents : d.totalPresents) === 60);
    expect(kept).toEqual([]);
    expect(tabA.badCoins + tabB.badCoins).toBe(0);
  });

  it('syncs the other tab as the new guest as soon as it gets there, with nothing else to trigger it', async () => {
    const clock = fakeClock();
    const backend = fakeBackend();
    const storage = fakeStorage();
    const tabA = setup({ clock, backend, storage, save: makeSave({ totalPresents: 60 }) });
    const tabB = setup({ clock, backend, storage, save: makeSave({ totalPresents: 60 }) });
    await tabA.cloud.start();
    clock.advance(7000);
    await tabB.cloud.start();
    clock.advance(7000);
    expect((await tabB.cloud.deleteEverything()).ok).toBe(true);
    const lastSync = tabA.cloud.status.lastSyncedAt;
    clock.advance(1000);
    await tabA.sdk.signInAnonymously(); // tab A's sign-in catches up: anon2
    await settle();
    expect(tabA.save.totalPresents).toBe(0);
    expect(tabA.cloud.status).toMatchObject({ state: 'synced', isAnonymous: true });
    expect(tabA.cloud.status.lastSyncedAt).toBeGreaterThan(lastSync);
    expect(backend.store['players/anon1']).toBeUndefined();
    expect(backend.store['players/anon2'].save.totalPresents).toBe(0);
  });

  it('takes back a push another tab had on its way when the delete landed', async () => {
    const clock = fakeClock();
    const backend = fakeBackend();
    const storage = fakeStorage();
    const progress = makeSave({ totalPresents: 60, bestPresentsInNight: 12 });
    const tabA = setup({ clock, backend, storage, save: structuredClone(progress) });
    const tabB = setup({ clock, backend, storage, save: structuredClone(progress) });
    await tabA.cloud.start();
    clock.advance(7000);
    await tabB.cloud.start();
    clock.advance(7000);
    // Tab A's push is slow: it starts before the delete and commits after it.
    let release = null;
    const gate = new Promise((resolve) => (release = resolve));
    const commit = tabA.sdk.runTransaction;
    tabA.sdk.runTransaction = async (db, fn) => {
      await gate;
      return commit(db, fn);
    };
    tabA.save.nights = 9;
    const pushA = tabA.cloud.markDirty({ now: true });
    await settle();
    expect(await tabB.cloud.deleteEverything()).toEqual({ ok: true, accountDeleted: true });
    release();
    expect(await pushA).toBe(false);
    expect(tabA.save).toMatchObject({ totalPresents: 0, nights: 0 });
    expect(backend.store['players/anon1']).toBeUndefined(); // written, then taken back
    expect(backend.store['leaderboard/anon1']).toBeUndefined();
    tabA.sdk.runTransaction = commit;
    await tabA.sdk.signInAnonymously();
    await settle();
    clock.advance(7000);
    await settle();
    const kept = Object.values(backend.store).filter((d) => (d.save ? d.save.totalPresents : d.totalPresents) === 60);
    expect(kept).toEqual([]);
    expect(backend.store['players/anon2'].save).toMatchObject({ totalPresents: 0, nights: 0 });
  });

  it('syncs a kept Google sign-in again once the player switches back into it on purpose', async () => {
    const storage = fakeStorage();
    const t = setup({ storage, save: makeSave({ totalPresents: 60, settings: SETTINGS }) });
    await t.cloud.start();
    expect(await t.cloud.linkGoogle()).toEqual({ ok: true, switched: false });
    t.clock.advance(7000);
    // Firebase signed the Google account out by itself (its sign-in was
    // revoked), so there is nobody left to confirm the delete with.
    t.sdk.deleteUser = async () => {
      t.sdk.auth.currentUser = null;
      throw Object.assign(new Error('revoked'), { code: 'auth/user-token-expired' });
    };
    expect(await t.cloud.deleteEverything()).toEqual({ ok: true, accountDeleted: false, guest: false });
    expect(t.cloud.uid).toBe('anon2');
    expect(t.cloud.status.needsReauth).toBe(false);
    // "Sign in with Google" again finds the kept account (anon1) in use.
    t.sdk.linkResult = Object.assign(new Error('in use'), { code: 'auth/credential-already-in-use', credential: { uid: 'anon1' } });
    t.clock.advance(7000);
    expect(await t.cloud.linkGoogle()).toEqual({ ok: true, switched: true });
    expect(t.cloud.uid).toBe('anon1');
    expect(t.sdk.store['players/anon1'].save).toMatchObject({ totalPresents: 0 });
    expect(storage.getItem('pips-christmas-hunt-deleted-uid')).toBeNull();
  });

  it('answers offline when Firebase never loaded, leaving the save alone', async () => {
    const t = setup({ loadFirebase: () => Promise.reject(new TypeError('Failed to fetch dynamically imported module')) });
    await t.cloud.start();
    const before = structuredClone(t.save);
    const result = await t.cloud.deleteEverything();
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(t.save).toEqual(before);
  });
});

describe('createCloud reauthAndDelete', () => {
  const SETTINGS = { sfx: false, music: true, voice: false };
  const STALE = () => Object.assign(new Error('stale sign-in'), { code: 'auth/requires-recent-login' });

  // A Google player whose "Delete my saved data" got as far as the sign-in.
  async function waitingToConfirm({ storage = null, sdk, clock } = {}) {
    const t = setup({ storage, sdk, clock, save: makeSave({ totalPresents: 60, foundJokes: ['j001'], settings: SETTINGS }) });
    await t.cloud.start();
    expect(await t.cloud.linkGoogle()).toEqual({ ok: true, switched: false });
    t.sdk.auth.currentUser.email = 'holly@example.com';
    await t.cloud.sendFeedback({ rating: 5, category: 'idea' });
    t.clock.advance(7000);
    t.sdk.deleteUserError = STALE();
    expect(await t.cloud.deleteEverything()).toEqual({ ok: false, needsReauth: true, error: 'auth/requires-recent-login' });
    return t;
  }

  function cloudHolds60(store) {
    return Object.values(store).some((d) => (d.save ? d.save.totalPresents : d.totalPresents) === 60);
  }

  it('keeps a Google player signed in when Firebase wants a fresh sign-in, with the data gone and nothing written as it', async () => {
    const t = await waitingToConfirm();
    expect(t.sdk.deletedUsers).toEqual([]);
    expect(Object.keys(t.sdk.store)).toEqual([]); // save, board entry, feedback and its stamp
    expect(t.cloud.uid).toBe('anon1');
    expect(t.cloud.status).toMatchObject({ needsReauth: true, isAnonymous: false, accountName: 'Pip', ready: true });
    // This device started fresh already, keeping only the sound settings.
    expect(t.save).toMatchObject({ totalPresents: 0, foundJokes: [], settings: SETTINGS });
    const before = t.sdk.writes.length;
    t.save.nights = 2;
    expect(await t.cloud.markDirty({ now: true })).toBe(false);
    expect(await t.cloud.resetEverywhere()).toEqual({ ok: false, error: 'offline' });
    t.clock.advance(11 * 60 * 1000);
    expect(await t.cloud.sendFeedback({ rating: 4, category: 'bug' })).toEqual({ ok: false, error: 'offline' });
    expect((await t.cloud.signOutToFresh()).ok).toBe(false);
    expect(t.cloud.uid).toBe('anon1');
    expect(t.sdk.writes.slice(before)).toEqual([]);
    expect(t.cloud.status.needsReauth).toBe(true);
  });

  it('opens the Google popup inside the tap, then deletes the sign-in and carries on as a new guest', async () => {
    const t = await waitingToConfirm();
    t.save.totalPresents = 3; // played a little since: new progress, which the new guest keeps
    const result = t.cloud.reauthAndDelete();
    expect(t.sdk.reauthCalls).toEqual([{ login_hint: 'holly@example.com' }]); // before anything was awaited
    expect(await result).toEqual({ ok: true, accountDeleted: true });
    expect(t.sdk.deletedUsers).toEqual(['anon1']);
    expect(t.cloud.uid).toBe('anon2');
    expect(t.cloud.status).toMatchObject({ state: 'synced', needsReauth: false, isAnonymous: true, accountName: null, ready: true });
    expect(t.save).toMatchObject({ totalPresents: 3, settings: SETTINGS });
    expect(t.sdk.store['players/anon2'].save).toEqual(toCloudSave(t.save));
    expect(t.sdk.store['players/anon1']).toBeUndefined();
    expect(cloudHolds60(t.sdk.store)).toBe(false);
    expect(t.badCoins).toBe(0);
  });

  it('keeps the sign-in waiting, with a way to try again, after a closed popup, another account or no internet', async () => {
    const t = await waitingToConfirm();
    const cases = [
      ['auth/popup-closed-by-user', { ok: false, cancelled: true, reason: 'cancelled', needsReauth: true, error: 'auth/popup-closed-by-user' }],
      ['auth/user-mismatch', { ok: false, reason: 'wrong-account', needsReauth: true, error: 'auth/user-mismatch' }],
      ['auth/popup-blocked', { ok: false, reason: 'blocked', needsReauth: true, error: 'auth/popup-blocked' }],
      ['auth/network-request-failed', { ok: false, reason: 'offline', needsReauth: true, error: 'auth/network-request-failed' }],
    ];
    for (const [code, expected] of cases) {
      t.sdk.reauthResult = Object.assign(new Error(code), { code });
      expect(await t.cloud.reauthAndDelete()).toEqual(expected);
      expect(t.sdk.deletedUsers).toEqual([]);
      expect(t.cloud.uid).toBe('anon1');
      expect(t.cloud.status.needsReauth).toBe(true);
    }
    expect(await t.cloud.reauthAndDelete()).toEqual({ ok: true, accountDeleted: true });
    expect(t.cloud.uid).toBe('anon2');
  });

  it('keeps it waiting when deleting fails after the confirmation, and can try again', async () => {
    const t = await waitingToConfirm();
    t.sdk.failDelete = 'players/anon1';
    expect(await t.cloud.reauthAndDelete()).toEqual({ ok: false, needsReauth: true, reason: 'offline', error: 'unavailable' });
    expect(t.sdk.deletedUsers).toEqual([]);
    expect(t.cloud.status.needsReauth).toBe(true);
    t.sdk.deleteUserError = STALE(); // a new confirmation is needed again
    expect(await t.cloud.reauthAndDelete()).toEqual({ ok: true, accountDeleted: true });
    expect(t.sdk.deletedUsers).toEqual(['anon1']);
  });

  it('deletes what another device on the account synced in the meantime', async () => {
    const t = await waitingToConfirm();
    t.sdk.store['players/anon1'] = { v: 1, save: toCloudSave(makeSave({ totalPresents: 60 })) };
    t.sdk.store['leaderboard/anon1'] = { adj: 1, noun: 1, num: 1, bestNight: 5, totalPresents: 60, jokesFound: 0, nights: 1 };
    expect(await t.cloud.reauthAndDelete()).toEqual({ ok: true, accountDeleted: true });
    expect(t.sdk.store['players/anon1']).toBeUndefined();
    expect(t.sdk.store['leaderboard/anon1']).toBeUndefined();
  });

  it('never opens the popup, or deletes anything, for a player who did not ask', async () => {
    const t = setup();
    await t.cloud.start();
    expect(await t.cloud.reauthAndDelete()).toEqual({ ok: false, error: 'not-pending', needsReauth: false }); // a guest
    expect(await t.cloud.linkGoogle()).toEqual({ ok: true, switched: false });
    expect(await t.cloud.reauthAndDelete()).toEqual({ ok: false, error: 'not-pending', needsReauth: false });
    expect(t.sdk.reauthCalls).toEqual([]);
    expect(t.sdk.deletedUsers).toEqual([]);
    expect(t.sdk.store['players/anon1']).toBeDefined();
  });

  it('remembers the waiting sign-in through a reload, and finishes it there', async () => {
    const storage = fakeStorage();
    const t = await waitingToConfirm({ storage });
    // The page reloads: a new facade on the same browser storage and sign-in.
    const again = setup({ storage, sdk: t.sdk, clock: t.clock, save: structuredClone(t.save) });
    expect(await again.cloud.start()).toBe(false); // nothing may sync as the deleted player
    expect(again.cloud.status).toMatchObject({ needsReauth: true, isAnonymous: false, ready: true });
    expect(Object.keys(t.sdk.store)).toEqual([]);
    expect(await again.cloud.reauthAndDelete()).toEqual({ ok: true, accountDeleted: true });
    expect(again.cloud.status).toMatchObject({ needsReauth: false, isAnonymous: true, state: 'synced' });
    expect(t.sdk.deletedUsers).toEqual(['anon1']);
  });

  it("puts the game's other tab on the new guest once one tab finishes", async () => {
    const clock = fakeClock();
    const storage = fakeStorage();
    const sdk = fakeSdk({ now: clock.now }); // one sign-in shared by both tabs
    const tabA = await waitingToConfirm({ storage, sdk, clock });
    const tabB = setup({ clock, sdk, storage, save: makeSave({ totalPresents: 60 }) });
    expect(await tabB.cloud.start()).toBe(false);
    expect(tabB.save.totalPresents).toBe(0); // it drops its copy of the deleted progress
    expect(tabB.cloud.status.needsReauth).toBe(true);
    expect(Object.keys(sdk.store)).toEqual([]);
    expect(await tabA.cloud.reauthAndDelete()).toEqual({ ok: true, accountDeleted: true });
    await settle();
    expect(tabB.cloud.uid).toBe('anon2');
    expect(tabB.cloud.status).toMatchObject({ needsReauth: false, isAnonymous: true, state: 'synced' });
    expect(cloudHolds60(sdk.store)).toBe(false);
  });
});

describe('createCloud sendFeedback', () => {
  const FEEDBACK = { rating: 4, category: 'idea', quick: ['loved', 'moreJokes'], comment: '', islandSeed: 123456 };
  const feedbackDocs = (sdk) => Object.keys(sdk.store).filter((ref) => ref.startsWith('feedback/'));

  it('writes one feedback doc and its rate-limit stamp in one batch', async () => {
    const t = setup();
    await t.cloud.start();
    expect(await t.cloud.sendFeedback(FEEDBACK)).toEqual({ ok: true });
    expect(t.sdk.batches).toBe(1);
    const refs = feedbackDocs(t.sdk);
    expect(refs).toHaveLength(1);
    expect(t.sdk.store[refs[0]]).toEqual({
      uid: 'anon1',
      rating: 4,
      category: 'idea',
      quick: ['loved', 'moreJokes'],
      comment: '',
      islandSeed: 123456,
      deviceType: 'desktop', // no touch screen under Node
      appVersion: APP_VERSION,
      createdAt: 'SERVER_TIME',
    });
    expect(t.sdk.store['feedbackLimits/anon1']).toEqual({ lastAt: 'SERVER_TIME', lastId: refs[0].split('/')[1] });
  });

  it('tidies what the game filled in, and keeps a grown-up\'s note', async () => {
    const t = setup();
    await t.cloud.start();
    const res = await t.cloud.sendFeedback({
      rating: 1,
      category: 'bug',
      quick: ['broke', 'loved', 'broke'], // a double tap
      comment: '  The sleigh got stuck by the pond.\r\n',
      islandSeed: '?', // the results' stand-in for a missing map number
      deviceType: 'touch',
      appVersion: '2.0.0+abc1234',
    });
    expect(res).toEqual({ ok: true });
    const doc = t.sdk.store[feedbackDocs(t.sdk)[0]];
    expect(doc).toMatchObject({
      quick: ['loved', 'broke'],
      comment: 'The sleigh got stuck by the pond.',
      islandSeed: null,
      deviceType: 'touch',
      appVersion: '2.0.0+abc1234',
    });
  });

  it('answers invalid for anything the rules would refuse, without a write', async () => {
    const t = setup();
    await t.cloud.start();
    const before = t.sdk.batches;
    const bad = [
      undefined,
      null,
      'five stars',
      { ...FEEDBACK, rating: 0 },
      { ...FEEDBACK, rating: 6 },
      { ...FEEDBACK, rating: 4.5 },
      { ...FEEDBACK, rating: '4' },
      { ...FEEDBACK, category: undefined },
      { ...FEEDBACK, category: 'hack' },
      { ...FEEDBACK, quick: ['loved', 'pizza'] },
      { ...FEEDBACK, quick: 'loved' },
      { ...FEEDBACK, quick: ['loved', 'tooHard', 'broke', 'moreJokes'] },
      { ...FEEDBACK, comment: 'x'.repeat(301) },
      { ...FEEDBACK, comment: 42 },
    ];
    for (const payload of bad) expect(await t.cloud.sendFeedback(payload), JSON.stringify(payload)).toEqual({ ok: false, error: 'invalid' });
    expect(t.sdk.batches).toBe(before);
    expect(feedbackDocs(t.sdk)).toEqual([]);
    // exactly 300 is fine
    expect(await t.cloud.sendFeedback({ ...FEEDBACK, comment: 'x'.repeat(300) })).toEqual({ ok: true });
  });

  it('answers too-soon within 10 minutes of the last one, then sends again', async () => {
    const t = setup();
    await t.cloud.start();
    expect(await t.cloud.sendFeedback(FEEDBACK)).toEqual({ ok: true });
    const batches = t.sdk.batches;
    t.clock.advance(9 * 60 * 1000);
    expect(await t.cloud.sendFeedback(FEEDBACK)).toEqual({ ok: false, error: 'too-soon' });
    expect(t.sdk.batches).toBe(batches); // known here, so no write was tried
    t.clock.advance(60 * 1000);
    expect(await t.cloud.sendFeedback({ ...FEEDBACK, rating: 5 })).toEqual({ ok: true });
    expect(feedbackDocs(t.sdk)).toHaveLength(2);
  });

  it('reads the stamp to tell a refused send "too soon" when another tab sent the last one', async () => {
    const sdk = fakeSdk();
    const clock = fakeClock();
    const tabA = setup({ sdk, clock });
    const tabB = setup({ sdk, clock });
    await tabA.cloud.start();
    clock.advance(7000);
    await tabB.cloud.start();
    expect(await tabA.cloud.sendFeedback(FEEDBACK)).toEqual({ ok: true });
    expect(await tabB.cloud.sendFeedback(FEEDBACK)).toEqual({ ok: false, error: 'too-soon' });
    expect(sdk.backend.refused.filter((ref) => ref.startsWith('feedback/'))).toHaveLength(1);
    expect(feedbackDocs(sdk)).toHaveLength(1);
  });

  it('passes on a refusal that is not the rate limit (rules not deployed yet)', async () => {
    const t = setup();
    await t.cloud.start();
    t.sdk.batchError = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    expect(await t.cloud.sendFeedback(FEEDBACK)).toEqual({ ok: false, error: 'permission-denied' });
    expect(await t.cloud.sendFeedback(FEEDBACK)).toEqual({ ok: true }); // and can try again
  });

  it('answers offline when the network or Firebase is away, and never rejects', async () => {
    const t = setup();
    await t.cloud.start();
    t.sdk.batchError = Object.assign(new Error('offline'), { code: 'unavailable' });
    expect(await t.cloud.sendFeedback(FEEDBACK)).toEqual({ ok: false, error: 'offline' });
    expect(feedbackDocs(t.sdk)).toEqual([]);

    const away = setup({ loadFirebase: () => Promise.reject(new TypeError('Failed to fetch dynamically imported module')) });
    await away.cloud.start();
    expect(await away.cloud.sendFeedback(FEEDBACK)).toEqual({ ok: false, error: 'offline' });
  });

  it('takes its turn after a sync, and sends as the player signed in then', async () => {
    const t = setup();
    const started = t.cloud.start();
    const sent = t.cloud.sendFeedback(FEEDBACK);
    await started;
    expect(await sent).toEqual({ ok: true });
    expect(t.sdk.store[feedbackDocs(t.sdk)[0]].uid).toBe('anon1');
  });
});

describe('createCloud deleteEverything and feedback', () => {
  const FEEDBACK = { rating: 5, category: 'gameplay', quick: ['loved'], comment: '', islandSeed: 42 };
  const OTHERS = { uid: 'someoneElse', rating: 2, category: 'bug', quick: [], comment: '', islandSeed: null, deviceType: 'touch', appVersion: '1.0.0', createdAt: 'SERVER_TIME' };

  it("deletes the player's own feedback and stamp, and nobody else's", async () => {
    const t = setup();
    await t.cloud.start();
    expect(await t.cloud.sendFeedback(FEEDBACK)).toEqual({ ok: true });
    t.clock.advance(11 * 60 * 1000);
    expect(await t.cloud.sendFeedback({ ...FEEDBACK, rating: 3 })).toEqual({ ok: true });
    t.sdk.store['feedback/theirs'] = structuredClone(OTHERS);
    const mine = Object.keys(t.sdk.store).filter((ref) => ref.startsWith('feedback/fb'));
    expect(mine).toHaveLength(2);

    expect(await t.cloud.deleteEverything()).toEqual({ ok: true, accountDeleted: true });
    for (const ref of mine) expect(t.sdk.store[ref]).toBeUndefined();
    expect(t.sdk.store['feedbackLimits/anon1']).toBeUndefined();
    expect(t.sdk.store['feedback/theirs']).toEqual(OTHERS);
    expect(t.sdk.writes).toEqual(expect.arrayContaining([...mine.map((ref) => `delete ${ref}`), 'delete feedbackLimits/anon1']));
    // the new guest may send its own straight away
    expect(t.cloud.uid).toBe('anon2');
    expect(await t.cloud.sendFeedback(FEEDBACK)).toEqual({ ok: true });
  });

  // The guest's docs are dropped on a switch, and its uid is left behind, so
  // "Delete my saved data" could never reach feedback still filed under it.
  it("drops the guest's feedback too when switching into an existing Google account", async () => {
    const t = setup();
    await t.cloud.start();
    expect(await t.cloud.sendFeedback(FEEDBACK)).toEqual({ ok: true });
    t.sdk.store['feedback/theirs'] = structuredClone(OTHERS);
    const mine = Object.keys(t.sdk.store).filter((ref) => ref.startsWith('feedback/fb'));
    expect(mine).toHaveLength(1);
    t.sdk.linkResult = Object.assign(new Error('in use'), { code: 'auth/credential-already-in-use', credential: { uid: 'google1' } });
    expect(await t.cloud.linkGoogle()).toEqual({ ok: true, switched: true });
    expect(t.cloud.uid).toBe('google1');
    expect(t.sdk.store[mine[0]]).toBeUndefined();
    expect(t.sdk.store['feedbackLimits/anon1']).toBeUndefined();
    expect(t.sdk.store['feedback/theirs']).toEqual(OTHERS);
  });

  it('goes on when the deployed rules predate feedback (none can exist then)', async () => {
    const t = setup();
    await t.cloud.start();
    t.sdk.listError = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    expect(await t.cloud.deleteEverything()).toEqual({ ok: true, accountDeleted: true });
    expect(t.sdk.store['players/anon1']).toBeUndefined();
  });

  it('changes nothing when the feedback cannot be deleted, and can try again', async () => {
    const t = setup();
    await t.cloud.start();
    expect(await t.cloud.sendFeedback(FEEDBACK)).toEqual({ ok: true });
    const before = structuredClone(t.save);
    t.sdk.listError = Object.assign(new Error('offline'), { code: 'unavailable' });
    expect(await t.cloud.deleteEverything()).toEqual({ ok: false, error: 'unavailable' });
    expect(t.save).toEqual(before);
    expect(t.sdk.store['players/anon1']).toBeDefined();
    expect(t.cloud.uid).toBe('anon1');
    expect(await t.cloud.deleteEverything()).toEqual({ ok: true, accountDeleted: true });
    expect(Object.keys(t.sdk.store).filter((ref) => ref.startsWith('feedback'))).toEqual([]);
  });
});
