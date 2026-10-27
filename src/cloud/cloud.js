// Cloud saves and the leaderboard (docs/CLOUD.md). createCloud() returns the
// facade main.js and screens.js use. Every method resolves and none throws: with
// no network, no Firebase project or a Firebase outage the game just keeps
// saving on this device, and the next trigger tries again.

import {
  cloudConfig,
  USE_EMULATOR,
  EMULATOR_AUTH_URL,
  EMULATOR_FIRESTORE_HOST,
  EMULATOR_FIRESTORE_PORT,
} from './config.js';
import { mergeSaves, toCloudSave, boardScores, ensureProfile, sameSave } from './merge.js';
import { isValidNameParts, nameFromParts } from './names.js';
import { defaultSave } from '../core/save.js';

export const BOARDS = [
  { id: 'bestNight', label: 'Best Night', icon: '🌙', unit: 'presents' },
  { id: 'totalPresents', label: 'All Presents', icon: '🎁', unit: 'presents' },
  { id: 'jokesFound', label: 'Jokes Found', icon: '🎉', unit: 'jokes' },
];

const PLAYERS = 'players';
const LEADERBOARD = 'leaderboard';
const DOC_VERSION = 1; // players/{uid}.v
const APP_NAME = 'pips-hunt';
const PUSH_DEBOUNCE_MS = 2000;
const BOARD_GAP_MS = 6000; // firestore.rules wants 5 s between leaderboard updates
const CALL_TIMEOUT_MS = 20000; // a hung request must not block every later push
const MAX_BOARD_LIMIT = 50; // firestore.rules refuses bigger list queries
const MONOTONIC = ['bestNight', 'totalPresents', 'jokesFound']; // may not drop in an update
const OFFLINE_CODES = new Set(['unavailable', 'deadline-exceeded', 'auth/network-request-failed', 'auth/timeout']);
const CANCEL_CODES = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);
// Google sign-in that can't work until the owner sets up the Firebase project.
const SETUP_CODES = new Set([
  'auth/unauthorized-domain',
  'auth/operation-not-allowed',
  'auth/auth-domain-config-required',
  'auth/operation-not-supported-in-this-environment',
]);
const NOTHING_NEW = 'nothing-new'; // ends a push's transaction before it writes
// localStorage: the last player whose data "Delete my saved data" removed in
// this browser, so the game's other open tabs drop their copy (see checkDeleted).
const DELETED_KEY = 'pips-christmas-hunt-deleted-uid';

const noop = () => {};

function browserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // some privacy settings throw on access
  }
}

// The same progress, even when another device lists jokes and unlocks in its
// own order (each device keeps its own order first; see mergeSaves), so two
// devices taking turns don't rewrite an unchanged save.
function sameProgress(a, b) {
  const sorted = (s) => {
    const out = { ...s };
    for (const key of ['foundJokes', 'unlocked']) if (Array.isArray(out[key])) out[key] = [...out[key]].sort();
    return out;
  };
  return sameSave(sorted(a), sorted(b));
}

// `options` exist for tests and tools; the game passes none.
//   config        Firebase web config (default cloudConfig(); null turns cloud off)
//   useEmulator   talk to the local emulators (default USE_EMULATOR)
//   emulator      { authUrl, firestoreHost, firestorePort } overrides
//   loadFirebase  () => Promise of the firebase-sdk.js exports
//   persistence   'local' (IndexedDB, the default) or 'memory'
//   linkWith      (sdk, user, provider) => Promise, in place of the Google popup
//                 (called the same way: synchronously, inside linkGoogle())
//   appName       Firebase app name, so one process can run several "devices"
//   storage       localStorage stand-in shared by one browser's tabs (null: none)
//   now, setTimer, clearTimer, random   clock, timers and dice
export function createCloud({ getSave, replaceSave, onStatus } = {}, options = {}) {
  const config = 'config' in options ? options.config : cloudConfig();
  const storage = 'storage' in options ? options.storage : browserStorage();
  const enabled = !!config;
  const useEmulator = options.useEmulator ?? USE_EMULATOR;
  const emulator = {
    authUrl: EMULATOR_AUTH_URL,
    firestoreHost: EMULATOR_FIRESTORE_HOST,
    firestorePort: EMULATOR_FIRESTORE_PORT,
    ...options.emulator,
  };
  const loadFirebase = options.loadFirebase || (() => import('./firebase-sdk.js'));
  const linkWith = options.linkWith || ((sdk, user, provider) => sdk.linkWithPopup(user, provider));
  const now = options.now || (() => Date.now());
  const setTimer = options.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer || ((id) => clearTimeout(id));
  const random = options.random || Math.random;

  // `ready` also lives in the status, so onStatus fires when it changes.
  let status = { state: 'off', ready: false, isAnonymous: true, accountName: null, lastSyncedAt: null, error: null };
  let sdk = null;
  let app = null;
  let auth = null;
  let db = null;
  let bootPromise = null;
  let startPromise = null;
  let started = false;
  let disposed = false;
  let held = false;
  let dirty = false;
  let debounceTimer = null;
  let queuedPush = null;
  let lock = Promise.resolve();
  let lastSynced = null; // the save as of the last successful push
  let boardKey = null; // what the leaderboard doc holds, to skip unchanged writes
  let boardAt = -Infinity; // when we last wrote it
  let boardTimer = null;
  let pageListeners = null;
  let stopAuthWatch = null;
  let owner = null; // { uid, account }: who the local save last synced as
  let freshAfterDelete = null; // the deleted uid this tab has already started fresh for
  let afterDelete = false; // a push is waiting for this tab to see the player after a delete

  // ---------------------------------------------------------------- status

  function setStatus(patch) {
    const next = { ...status, ...patch };
    if (Object.keys(next).every((k) => next[k] === status[k])) return;
    status = next;
    try {
      if (onStatus) onStatus({ ...status });
    } catch (err) {
      console.warn('[cloud] onStatus failed', err);
    }
  }

  function errorText(err) {
    return String((err && (err.code || err.message)) || err || 'unknown').slice(0, 120);
  }

  function isOffline(err) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    if (OFFLINE_CODES.has(String(err && err.code))) return true;
    // A failed import() of the Firebase chunk means the network went away.
    return err instanceof TypeError && /fetch|import|load/i.test(String(err.message));
  }

  function fail(err) {
    const offline = isOffline(err);
    setStatus({ state: offline ? 'offline' : 'error', error: errorText(err) });
    if (!offline) console.warn('[cloud]', err);
  }

  function accountName(user) {
    const google = (user.providerData || []).find((p) => p && p.providerId === 'google.com');
    const full = user.displayName || (google && google.displayName) || '';
    return full.trim().split(/\s+/)[0] || null;
  }

  // Firebase is loaded and someone is signed in (anonymously at least), so a
  // tap on "Sign in with Google" can open the popup straight away.
  function isReady() {
    return !disposed && !!(sdk && auth && auth.currentUser);
  }

  function refreshAccount() {
    const user = auth && auth.currentUser;
    const anonymous = !user || user.isAnonymous;
    setStatus({ ready: isReady(), isAnonymous: anonymous, accountName: anonymous ? null : accountName(user) });
  }

  // ---------------------------------------------------------------- helpers

  function readSave() {
    try {
      return getSave ? getSave() : null;
    } catch (err) {
      console.warn('[cloud] getSave failed', err);
      return null;
    }
  }

  function applySave(next) {
    try {
      if (replaceSave) replaceSave(next);
    } catch (err) {
      console.warn('[cloud] replaceSave failed', err);
    }
  }

  function withTimeout(promise, ms = CALL_TIMEOUT_MS) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimer(() => reject(Object.assign(new Error('The cloud took too long to answer'), { code: 'deadline-exceeded' })), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimer(timer));
  }

  // Pushes, account switches and resets take turns, so a uid change can never
  // land in the middle of a transaction or a leaderboard write.
  function exclusive(task) {
    const run = lock.then(task);
    lock = run.then(noop, noop);
    return run;
  }

  function clearDebounce() {
    if (debounceTimer !== null) clearTimer(debounceTimer);
    debounceTimer = null;
  }

  function clearBoardTimer() {
    if (boardTimer !== null) clearTimer(boardTimer);
    boardTimer = null;
  }

  // What the entry holds is forgotten, but not when we last wrote one: after a
  // quick sign-out and sign-in we may be back on an entry written moments ago,
  // and firestore.rules refuses an update within 5 s of the last.
  function forgetBoard() {
    clearBoardTimer();
    boardKey = null;
  }

  function uid() {
    return auth && auth.currentUser ? auth.currentUser.uid : null;
  }

  // A brand-new device-only save, keeping this device's sound settings.
  function freshSave() {
    const fresh = defaultSave();
    const current = readSave();
    if (current && current.settings) fresh.settings = { ...fresh.settings, ...current.settings };
    return ensureProfile(fresh, random);
  }

  // The device left the account its save belongs to, so it starts fresh. The
  // progress stays safe in the account.
  function startFresh() {
    owner = null;
    forgetBoard();
    applySave(freshSave());
    dirty = true;
  }

  function deletedUid() {
    try {
      return (storage && storage.getItem(DELETED_KEY)) || null;
    } catch {
      return null;
    }
  }

  function markDeleted(id) {
    try {
      if (!storage) return;
      if (id) storage.setItem(DELETED_KEY, id);
      else storage.removeItem(DELETED_KEY);
    } catch {
      /* no storage: only this tab knows */
    }
  }

  // "Delete my saved data" in another tab of this browser deleted the player
  // this tab's save belongs to. This tab still holds that progress, and would
  // otherwise push it to the new guest (and main.js write it back to this
  // browser's save), undoing the delete. So it starts fresh, once.
  function checkDeleted(gone = deletedUid()) {
    if (!gone || freshAfterDelete === gone) return;
    if (owner ? owner.uid !== gone : uid() !== gone) return;
    freshAfterDelete = gone;
    startFresh();
    afterDelete = true; // and syncs it as the new player once that reaches this tab
  }

  // This tab is still signed in as a player deleted in another tab (the new
  // sign-in reaches it a moment later, and the old token keeps working until
  // then), so nothing may be written as it. onAuthChange pushes once it can.
  function waitForNewPlayer() {
    dirty = true;
    afterDelete = true;
    setStatus({ state: 'connecting' });
    return false;
  }

  // Tabs share one sign-in, so another tab can sign this browser out of the
  // Google account (or into another one) at any moment. Pushing this tab's
  // copy of the account's progress under the new uid would undo that sign-out
  // and put the same scores on the board twice.
  function checkOwner() {
    checkDeleted();
    if (!owner) return;
    const user = auth && auth.currentUser;
    if (user && user.uid === owner.uid) {
      if (!user.isAnonymous) owner.account = true; // linked in place: same uid, now an account
    } else if (owner.account) {
      startFresh();
    }
  }

  function onAuthChange() {
    try {
      checkOwner();
      refreshAccount();
      // The player that replaced one deleted in another tab has reached this
      // tab: the push that waited for it (see waitForNewPlayer) goes now.
      const id = uid();
      if (afterDelete && id && id !== deletedUid() && started && !held) {
        afterDelete = false;
        schedulePush();
      }
    } catch (err) {
      console.warn('[cloud] auth change failed', err);
    }
  }

  // ---------------------------------------------------------------- boot

  function connect() {
    const name = options.appName || APP_NAME;
    let nextApp;
    try {
      nextApp = sdk.initializeApp(config, name);
    } catch {
      nextApp = sdk.getApp(name); // already made, e.g. after a hot reload
    }
    let nextAuth;
    try {
      const deps =
        options.persistence === 'memory'
          ? { persistence: sdk.inMemoryPersistence }
          : {
              persistence: [sdk.indexedDBLocalPersistence, sdk.browserLocalPersistence],
              popupRedirectResolver: sdk.browserPopupRedirectResolver,
            };
      nextAuth = sdk.initializeAuth(nextApp, deps);
    } catch {
      nextAuth = sdk.getAuth(nextApp);
    }
    let nextDb;
    try {
      // toCloudSave never yields undefined; this is a backstop so a stray one
      // is dropped instead of failing the whole write.
      nextDb = sdk.initializeFirestore(nextApp, { ignoreUndefinedProperties: true });
    } catch {
      nextDb = sdk.getFirestore(nextApp);
    }
    if (useEmulator) {
      // Each throws if already connected (a hot reload), which is fine.
      try {
        sdk.connectAuthEmulator(nextAuth, emulator.authUrl, { disableWarnings: true });
      } catch {
        /* already connected */
      }
      try {
        sdk.connectFirestoreEmulator(nextDb, emulator.firestoreHost, emulator.firestorePort);
      } catch {
        /* already connected */
      }
    }
    app = nextApp;
    auth = nextAuth;
    db = nextDb;
    try {
      stopAuthWatch = sdk.onAuthStateChanged(auth, onAuthChange);
    } catch {
      /* the next push checks the account instead */
    }
  }

  async function boot() {
    setStatus({ state: 'connecting' });
    try {
      if (!sdk) sdk = await withTimeout(loadFirebase());
      if (!auth) connect();
      await withTimeout(auth.authStateReady());
      if (!auth.currentUser) await withTimeout(sdk.signInAnonymously(auth));
      refreshAccount();
      return true;
    } catch (err) {
      fail(err);
      return false;
    }
  }

  // Resolves true once someone is signed in (anonymously at least).
  function ensureReady() {
    if (!enabled || disposed) return Promise.resolve(false);
    if (uid()) return Promise.resolve(true);
    if (!bootPromise) bootPromise = boot().finally(() => (bootPromise = null));
    return bootPromise;
  }

  // ---------------------------------------------------------------- saves

  function playerRef(id = uid()) {
    return sdk.doc(db, PLAYERS, id);
  }

  function writePlayer(tx, ref, save) {
    tx.set(ref, { v: DOC_VERSION, save, updatedAt: sdk.serverTimestamp() });
  }

  // Applies what the cloud now holds, keeping anything the game changed while
  // we were waiting on the server.
  function settle(cloudSave) {
    const current = readSave();
    if (!current) return;
    const next = mergeSaves(current, cloudSave);
    lastSynced = next;
    if (!sameSave(toCloudSave(next), cloudSave)) dirty = true;
    if (held) {
      dirty = true; // never swap the save mid-night; releasing the hold pushes again
      return;
    }
    if (!sameSave(next, current)) applySave(next);
  }

  // Read the cloud copy, merge it into this device's save, write the result.
  async function pushNow() {
    if (held || !started) {
      dirty = true;
      return false;
    }
    if (!(await ensureReady())) {
      dirty = true;
      return false;
    }
    checkOwner();
    refreshAccount();
    const user = auth.currentUser;
    const local = readSave();
    if (!user || !local) return false;
    // One uid for the whole push, even if another tab changes it meanwhile.
    const me = user.uid;
    if (me === deletedUid()) return waitForNewPlayer();
    const ref = playerRef(me);
    dirty = false;
    setStatus({ state: 'syncing' });
    try {
      let written = null;
      await withTimeout(
        sdk.runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          const data = snap.exists() ? snap.data() : null;
          if (data && Number(data.v) > DOC_VERSION) {
            throw Object.assign(new Error('Saved by a newer version of the game'), { code: 'newer-save' });
          }
          // The update can re-run on contention, so read the live save each time.
          written = toCloudSave(mergeSaves(readSave() || local, data && data.save));
          // The cloud has all of it already: end the transaction here, which
          // skips the write and the commit round trip.
          if (data && Number(data.v) === DOC_VERSION && sameProgress(written, data.save)) {
            throw Object.assign(new Error('Nothing new for the cloud'), { code: NOTHING_NEW });
          }
          writePlayer(tx, ref, written);
        }).catch((err) => {
          if (!err || err.code !== NOTHING_NEW) throw err;
        }),
      );
      if (me === deletedUid()) {
        // Deleted in another tab while this push was on its way: take back
        // what it may have written (this tab can still act as that player)
        // and keep none of it here.
        try {
          await withTimeout(sdk.deleteDoc(ref));
        } catch (err) {
          console.warn('[cloud] could not undo a push after a delete', errorText(err));
        }
        freshAfterDelete = me;
        startFresh();
        return waitForNewPlayer();
      }
      owner = { uid: me, account: !user.isAnonymous };
      // Even when skipped: `written` is the cloud's progress in this device's order.
      settle(written);
      setStatus({ state: 'synced', lastSyncedAt: now(), error: null });
      // A night may have started while we waited; its end pushes and posts.
      if (!held) await submitBoard(lastSynced, me);
      return true;
    } catch (err) {
      dirty = true;
      fail(err);
      return false;
    }
  }

  // At most one push runs and one waits; later requests share the waiting one.
  function schedulePush() {
    clearDebounce();
    if (!queuedPush) {
      queuedPush = exclusive(() => {
        queuedPush = null;
        return pushNow().catch((err) => {
          fail(err);
          return false;
        });
      });
    }
    return queuedPush;
  }

  // ---------------------------------------------------------------- leaderboard

  function boardRef(id = uid()) {
    return sdk.doc(db, LEADERBOARD, id);
  }

  // The public entry for a save, or null while the player is hidden.
  function boardEntry(save) {
    const p = save && save.profile;
    if (!isValidNameParts(p) || p.hidden) return null;
    return { adj: p.adj, noun: p.noun, num: p.num, ...boardScores(save) };
  }

  function entryKey(me, entry) {
    return `${me}:${entry ? MONOTONIC.concat('nights', 'adj', 'noun', 'num').map((k) => entry[k]).join(',') : 'hidden'}`;
  }

  function writeEntry(me, entry) {
    const ref = boardRef(me);
    if (!entry) return withTimeout(sdk.deleteDoc(ref));
    return withTimeout(sdk.setDoc(ref, { ...entry, updatedAt: sdk.serverTimestamp() }));
  }

  // An update can't lower scores, so a reset board is deleted and made again.
  async function recreateEntry(me, entry) {
    await withTimeout(sdk.deleteDoc(boardRef(me)));
    boardKey = null; // gone now: if the create fails, the next push posts it
    if (entry) await writeEntry(me, entry);
    boardKey = entryKey(me, entry);
    boardAt = now();
  }

  // The update was refused. Stored scores above ours mean either a reset (here
  // or on another device) or another device on this account posting progress
  // we haven't merged yet. Only a reset may delete the entry: when the cloud
  // save still gives the entry we sent, that's a reset; otherwise we pull
  // first, and the push posts what the merge gives. Resolves true if handled.
  async function repairEntry(me, entry) {
    const stored = await withTimeout(sdk.getDoc(boardRef(me)));
    if (!stored.exists() || !MONOTONIC.some((k) => Number(stored.data()[k]) > entry[k])) return false;
    const snap = await withTimeout(sdk.getDoc(playerRef(me)));
    const cloudSave = snap.exists() ? snap.data().save : null;
    const latest = boardEntry(mergeSaves(readSave() || lastSynced, cloudSave));
    if (sameSave(latest, entry)) {
      await recreateEntry(me, entry);
    } else {
      dirty = true;
      schedulePush();
    }
    return true;
  }

  async function submitBoard(save, me) {
    clearBoardTimer();
    // Never post one uid's scores under another (see checkOwner).
    if (!save || !me || uid() !== me) return;
    const entry = boardEntry(save);
    const key = entryKey(me, entry);
    if (key === boardKey) return;
    // A device clock set backwards must not hold the board back for hours.
    boardAt = Math.min(boardAt, now());
    const wait = boardAt + BOARD_GAP_MS - now();
    if (wait > 0) {
      boardTimer = setTimer(() => {
        boardTimer = null;
        // Through a push, so what gets posted is the cloud's latest merge (a
        // reset on another device may have landed in the meantime). Mid-night
        // this only flags; the push when the hold ends posts it.
        dirty = true;
        if (!held) schedulePush();
      }, wait);
      return;
    }
    boardAt = now();
    try {
      await writeEntry(me, entry);
      boardKey = key;
    } catch (err) {
      try {
        const repaired = entry && err && err.code === 'permission-denied' && (await repairEntry(me, entry));
        if (!repaired) console.warn('[cloud] leaderboard write failed; retrying on the next sync', errorText(err));
      } catch (again) {
        console.warn('[cloud] leaderboard repair failed', errorText(again));
      }
    }
  }

  // The player's own place, from the top list or by counting who is ahead.
  // A failed count only costs the "You: #N" line, never the whole board.
  async function myRank(board, entries) {
    const listed = entries.find((e) => e.isMe);
    if (listed) return { rank: listed.rank, score: listed.score };
    const entry = boardEntry(readSave());
    const score = entry ? entry[board] : 0;
    if (!score) return null;
    try {
      const ahead = sdk.query(sdk.collection(db, LEADERBOARD), sdk.where(board, '>', score));
      const snap = await withTimeout(sdk.getCount(ahead));
      return { rank: snap.data().count + 1, score };
    } catch (err) {
      console.warn('[cloud] rank count failed', errorText(err));
      return null;
    }
  }

  // ---------------------------------------------------------------- public

  function start() {
    if (!enabled || disposed) return Promise.resolve(false);
    started = true;
    listenForPage();
    // Firebase loads and signs in now, even while a night holds the first
    // push: the Google popup must open inside the tap, with nothing to load.
    ensureReady();
    if (!startPromise) {
      startPromise = schedulePush().then((ok) => {
        if (!ok) startPromise = null; // let a later start() try again
        return ok;
      });
    }
    return startPromise;
  }

  function hold(on) {
    held = !!on;
    if (held) {
      clearDebounce();
      return Promise.resolve(false);
    }
    return dirty && enabled ? schedulePush() : Promise.resolve(false);
  }

  function markDirty(opts) {
    if (!enabled) return Promise.resolve(false);
    dirty = true;
    if (held) return Promise.resolve(false);
    if (opts && opts.now) return schedulePush();
    clearDebounce();
    debounceTimer = setTimer(() => {
      debounceTimer = null;
      if (dirty && !held) schedulePush();
    }, PUSH_DEBOUNCE_MS);
    return Promise.resolve(false);
  }

  function flush() {
    if (!enabled || !dirty || held) return Promise.resolve(false);
    return schedulePush();
  }

  function listenForPage() {
    if (pageListeners || typeof document === 'undefined' || typeof window === 'undefined') return;
    pageListeners = {
      visibilitychange: () => {
        if (document.visibilityState === 'hidden') flush();
      },
      // Back online after a failed boot: get ready for the Google button
      // without waiting for the next push, and send whatever waited.
      online: () => {
        if (dirty && !held) schedulePush();
        else ensureReady();
      },
      // Another tab deleted the saved data: drop this tab's copy at once, not
      // just before the next push, so main.js can't write it back meanwhile.
      // The value comes with the event, as that tab may clear it again soon.
      storage: (e) => {
        if (e.key !== DELETED_KEY || !e.newValue) return;
        try {
          checkDeleted(e.newValue);
          refreshAccount();
        } catch (err) {
          console.warn('[cloud] delete from another tab failed', err);
        }
      },
    };
    document.addEventListener('visibilitychange', pageListeners.visibilitychange);
    window.addEventListener('online', pageListeners.online);
    window.addEventListener('storage', pageListeners.storage);
  }

  // Sorts a failed sign-in for the UI (docs/CLOUD.md, Round 2) by `reason`:
  // 'blocked' asks for another tap, 'cancelled' is silent, 'setup' is for the
  // owner, 'offline' reads as offline, anything else is 'failed'. `error`
  // keeps the Firebase code.
  function linkFailure(err) {
    const code = String((err && err.code) || '');
    if (CANCEL_CODES.has(code)) return { ok: false, cancelled: true, reason: 'cancelled', error: code };
    let reason = 'failed';
    if (code === 'auth/popup-blocked') reason = 'blocked';
    else if (SETUP_CODES.has(code)) reason = 'setup';
    else if (isOffline(err)) reason = 'offline';
    return { ok: false, reason, error: errorText(err) };
  }

  function linkedInPlace() {
    onAuthChange(); // same uid, now a Google account
    return { ok: true, switched: false };
  }

  // This device's progress goes into the existing Google account's save. The
  // anonymous uid's docs go first, while we can still delete them as it.
  async function switchAccount(linkError, fromUid) {
    try {
      const credential = sdk.GoogleAuthProvider.credentialFromError(linkError);
      if (!credential) return linkFailure(linkError);
      setStatus({ state: 'syncing' });
      // Forgotten first: if only the board delete lands, whichever uid we end
      // up on must still post again.
      forgetBoard();
      // Only as the player who tapped: while the popup was open, another tab
      // may have moved this browser onto the account, whose docs must stay.
      if (uid() === fromUid) {
        await withTimeout(Promise.all([sdk.deleteDoc(playerRef(fromUid)), sdk.deleteDoc(boardRef(fromUid))]));
      }
      await withTimeout(sdk.signInWithCredential(auth, credential));
      // Back into an account whose data was deleted here earlier (its Google
      // sign-in was kept): on purpose this time, so it may sync again.
      if (uid() === deletedUid()) markDeleted(null);
      refreshAccount();
      await pushNow();
      return { ok: true, switched: true };
    } catch (err) {
      dirty = true; // still anonymous: the next push puts its docs back
      fail(err);
      return linkFailure(err);
    }
  }

  // Call it straight from the tap. Safari only opens a popup in the task of
  // the tap that asked for it, so linkWithPopup runs before any await: nothing
  // is loaded or waited on first, not even the push lock. Until `ready` it
  // answers 'not-ready' at once (the UI keeps the button disabled anyway).
  // Resolves { ok, switched?, cancelled?, reason?, error? } (see linkFailure).
  function linkGoogle() {
    if (!enabled) return Promise.resolve({ ok: false, reason: 'setup', error: 'cloud-off' });
    let user = null;
    let popup;
    try {
      user = isReady() ? auth.currentUser : null;
      if (!user) return Promise.resolve({ ok: false, reason: 'not-ready', error: 'not-ready' });
      if (!user.isAnonymous) {
        refreshAccount();
        return Promise.resolve({ ok: true, switched: false });
      }
      const provider = new sdk.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      popup = linkWith(sdk, user, provider);
    } catch (err) {
      popup = Promise.reject(err);
    }
    const fromUid = user && user.uid;
    return Promise.resolve(popup)
      .then(linkedInPlace, (err) => {
        const code = String(err && err.code);
        // The switch waits its turn: it changes the uid, which a push must never see.
        if (code === 'auth/credential-already-in-use') return exclusive(() => switchAccount(err, fromUid));
        if (code === 'auth/provider-already-linked') return linkedInPlace();
        return linkFailure(err);
      })
      .catch(linkFailure);
  }

  function signOutToFresh() {
    if (!enabled) return Promise.resolve({ ok: false, error: 'cloud-off' });
    return exclusive(async () => {
      try {
        if (!(await ensureReady())) return { ok: false, error: status.error || 'offline' };
        // Leaving an anonymous account would strand its progress for good.
        if (auth.currentUser.isAnonymous) return { ok: false, error: 'not-signed-in' };
        // The account gets this device's latest progress before we leave it.
        if (!(await pushNow())) return { ok: false, error: status.error || 'offline' };
        setStatus({ state: 'connecting' });
        await withTimeout(sdk.signOut(auth));
        // Swap the save before signing in again, so a failure here can't push
        // the account's progress into a second uid. The auth listener may
        // have done it already.
        checkOwner();
        refreshAccount();
        // Signs in as a new anonymous player. If that fails we are still signed
        // out with a fresh save, and the next trigger tries again.
        dirty = true;
        await pushNow();
        return { ok: true };
      } catch (err) {
        dirty = true;
        fail(err);
        return { ok: false, error: errorText(err) };
      }
    });
  }

  function resetEverywhere() {
    if (!enabled) return Promise.resolve({ ok: false, error: 'cloud-off' });
    clearDebounce();
    return exclusive(async () => {
      dirty = true;
      let me = null;
      try {
        if (!(await ensureReady()) || !readSave()) return { ok: false, error: status.error || 'offline' };
        checkOwner();
        refreshAccount();
        const user = auth.currentUser;
        me = user.uid;
        // deleted in another tab (see pushNow): the next push, as the new player, sends the reset
        if (me === deletedUid()) return { ok: false, error: 'offline' };
        const ref = playerRef(me);
        setStatus({ state: 'syncing' });
        let written = null;
        await withTimeout(
          sdk.runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            const remoteEpoch = snap.exists() ? Number(snap.data().save && snap.data().save.epoch) || 0 : -1;
            written = toCloudSave(readSave());
            // Outrank every copy, even one that was reset again elsewhere.
            written.epoch = Math.max(written.epoch, remoteEpoch + 1);
            writePlayer(tx, ref, written);
          }),
        );
        owner = { uid: me, account: !user.isAnonymous };
        dirty = false;
        settle(written);
        setStatus({ state: 'synced', lastSyncedAt: now(), error: null });
      } catch (err) {
        fail(err);
        return { ok: false, error: errorText(err) };
      }
      try {
        clearBoardTimer();
        if (uid() === me) await recreateEntry(me, boardEntry(lastSynced));
      } catch (err) {
        // The save is reset; the next sync repairs the board (see submitBoard).
        console.warn('[cloud] leaderboard reset failed', errorText(err));
      }
      return { ok: true };
    });
  }

  // "Delete my saved data" (docs/CLOUD.md, Round 2). The board entry and the
  // cloud save go first, and only once both are gone does this device forget
  // its progress, so a failure changes nothing and the player can try again.
  // Resolves { ok, accountDeleted?, error? }. accountDeleted is false when
  // Firebase kept the sign-in itself (deleting a Google sign-in needs a fresh
  // one, auth/requires-recent-login), and then we just sign out of it.
  function deleteEverything() {
    if (!enabled) return Promise.resolve({ ok: false, error: 'cloud-off' });
    clearDebounce();
    return exclusive(async () => {
      let me = null;
      try {
        if (!(await ensureReady())) return { ok: false, error: status.error || 'offline' };
        me = uid();
        setStatus({ state: 'syncing' });
        forgetBoard(); // if only one delete lands, the next push posts the entry again
        await withTimeout(Promise.all([sdk.deleteDoc(boardRef(me)), sdk.deleteDoc(playerRef(me))]));
      } catch (err) {
        dirty = true;
        fail(err);
        return { ok: false, error: errorText(err) };
      }
      // The cloud copy is gone. From here nothing may push the old progress
      // again, under any uid, and the auth listener must not swap the save.
      // The game's other tabs hear it through localStorage (see checkDeleted).
      owner = null;
      lastSynced = null;
      freshAfterDelete = me; // this tab starts fresh just below
      markDeleted(me);
      let accountDeleted = false;
      try {
        await withTimeout(sdk.deleteUser(auth.currentUser));
        accountDeleted = true;
      } catch (err) {
        console.warn('[cloud] could not delete the sign-in, signing out instead', errorText(err));
        try {
          await withTimeout(sdk.signOut(auth));
        } catch (again) {
          // Still signed in: the fresh save below simply syncs to this uid.
          console.warn('[cloud] sign-out failed', errorText(again));
        }
      }
      // Still this player after all: other tabs have started fresh by now, and
      // from here on pushes as it carry fresh saves only.
      if (uid() === me) markDeleted(null);
      try {
        applySave(freshSave());
        dirty = true;
        refreshAccount();
        // A new anonymous player, whose fresh save then syncs. If that fails we
        // are signed out with a fresh save, and the next trigger tries again.
        if (await ensureReady()) await pushNow();
      } catch (err) {
        // The cloud copy is already gone; the next trigger syncs the rest.
        dirty = true;
        console.warn('[cloud] starting fresh after the delete failed', errorText(err));
      }
      return { ok: true, accountDeleted };
    });
  }

  // Options are read inside, so a bad argument can't reject the promise.
  async function getLeaderboard(board, opts) {
    const empty = { entries: [], me: null };
    if (!BOARDS.some((b) => b.id === board)) return { ...empty, error: 'unknown-board' };
    if (!enabled) return { ...empty, error: 'cloud-off' };
    try {
      if (!(await ensureReady())) return { ...empty, error: status.error || 'offline' };
      if (dirty && started && !held) schedulePush(); // e.g. the first push failed earlier
      const n = Math.max(1, Math.min(MAX_BOARD_LIMIT, Math.floor(Number(opts && opts.limit)) || 25));
      const top = sdk.query(
        sdk.collection(db, LEADERBOARD),
        sdk.where(board, '>', 0),
        sdk.orderBy(board, 'desc'),
        sdk.limit(n),
      );
      const snap = await withTimeout(sdk.getDocs(top));
      const me = uid();
      const entries = [];
      for (const d of snap.docs) {
        const data = d.data();
        const score = Number.isFinite(data[board]) ? data[board] : 0;
        const prev = entries[entries.length - 1];
        // Ties share a rank, matching the count-based rank below.
        const rank = prev && prev.score === score ? prev.rank : entries.length + 1;
        entries.push({ rank, name: nameFromParts(data), score, isMe: d.id === me });
      }
      return { entries, me: await myRank(board, entries) };
    } catch (err) {
      if (isOffline(err)) fail(err);
      else console.warn('[cloud] leaderboard read failed', err);
      return { ...empty, error: errorText(err) };
    }
  }

  function setProfile(changes) {
    try {
      const partial = changes && typeof changes === 'object' ? changes : {};
      const save = readSave();
      if (!save) return Promise.resolve(false);
      const base = ensureProfile({ profile: save.profile }, random).profile;
      const next = { ...base };
      for (const key of ['adj', 'noun', 'num']) if (key in partial) next[key] = partial[key];
      if (!isValidNameParts(next)) Object.assign(next, { adj: base.adj, noun: base.noun, num: base.num });
      if ('hidden' in partial) next.hidden = partial.hidden === true;
      // Strictly newer than the last choice, even if this device's clock is behind.
      next.setAt = Math.max(Math.round(now()), base.setAt + 1);
      applySave({ ...structuredClone(save), profile: next });
      return markDirty({ now: true });
    } catch (err) {
      console.warn('[cloud] setProfile failed', err);
      return Promise.resolve(false);
    }
  }

  // Shuts the Firebase app down (tests, hot reload). The facade goes quiet.
  async function dispose() {
    disposed = true;
    clearDebounce();
    clearBoardTimer();
    if (pageListeners) {
      document.removeEventListener('visibilitychange', pageListeners.visibilitychange);
      window.removeEventListener('online', pageListeners.online);
      window.removeEventListener('storage', pageListeners.storage);
    }
    pageListeners = null;
    setStatus({ ready: false });
    try {
      if (stopAuthWatch) stopAuthWatch();
      stopAuthWatch = null;
      if (db) await sdk.terminate(db);
      if (app) await sdk.deleteApp(app);
    } catch {
      /* already gone */
    }
  }

  return {
    enabled,
    BOARDS,
    get status() {
      return { ...status };
    },
    get uid() {
      return uid();
    },
    // True once Firebase is loaded and someone is signed in; the UI keeps the
    // Google buttons disabled until then. Also status.ready, for onStatus.
    get ready() {
      return isReady();
    },
    start,
    hold,
    markDirty,
    flush,
    linkGoogle,
    signOutToFresh,
    resetEverywhere,
    deleteEverything,
    getLeaderboard,
    setProfile,
    dispose,
  };
}
