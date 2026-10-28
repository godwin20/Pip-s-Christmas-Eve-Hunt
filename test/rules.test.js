// firestore.rules against the Firestore emulator (npm run test:rules).
// Every rule in docs/CLOUD.md gets an allow case and a deny case.

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  getCountFromServer,
  serverTimestamp,
  runTransaction,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import * as lite from 'firebase/firestore/lite';
import { toCloudSave, boardScores } from '../src/cloud/merge.js';
import { defaultSave, syncCoinLedger } from '../src/core/save.js';
import { JOKES } from '../src/data/jokes.js';
import { MILESTONES } from '../src/game/milestones.js';
import { UPGRADES } from '../src/game/upgrades.js';
import { FEEDBACK_CATEGORIES, FEEDBACK_QUICK, cleanFeedback } from '../src/cloud/feedback.js';

// Each case is a round trip to the emulator; seeding the board takes a moment.
vi.setConfig({ testTimeout: 20000, hookTimeout: 30000 });

let env;

const ALICE = 'alice';
const BOB = 'bob';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-pips-hunt',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});

afterAll(async () => {
  for (const app of liteApps.splice(0)) await deleteApp(app);
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

function as(uid) {
  return uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
}

// The game ships Firestore Lite (src/cloud/firebase-sdk.js), which builds its
// own requests, so the list cap and the count gap are checked with it too.
const liteApps = [];
function liteAs(uid) {
  const app = initializeApp({ projectId: 'demo-pips-hunt', apiKey: 'demo-api-key' }, `lite-${liteApps.length}`);
  liteApps.push(app);
  const db = lite.getFirestore(app);
  const [host, port] = emulatorHost().split(':');
  lite.connectFirestoreEmulator(db, host, Number(port), uid ? { mockUserToken: { sub: uid } } : {});
  return db;
}

function emulatorHost() {
  return process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
}

// An unsigned ID token for a signed-in uid; the emulator doesn't check
// signatures, which is how the SDKs' mockUserToken works too.
function mockIdToken(uid) {
  const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: 'https://securetoken.google.com/demo-pips-hunt',
    aud: 'demo-pips-hunt',
    iat: now,
    exp: now + 3600,
    auth_time: now,
    sub: uid,
    user_id: uid,
    firebase: { sign_in_provider: 'anonymous', identities: {} },
  };
  return `${part({ alg: 'none', typ: 'JWT' })}.${part(claims)}.`;
}

function without(obj, key) {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

// A real save run through the client's own toCloudSave, so the client and the
// rules can't drift apart unnoticed.
function cloudSave(over = {}) {
  const save = syncCoinLedger({
    ...defaultSave(),
    coinsEarned: 400,
    totalPresents: 30,
    totalCrackers: 6,
    nights: 4,
    bestPresentsInNight: 11,
    upgrades: { radar: 2, magnet: 1 },
    foundJokes: ['j001', 'q002', 's001'],
    unlocked: ['scarf', 'puppy'],
    wardrobe: { scarf: false, puppy: true },
    profile: { adj: 3, noun: 7, num: 42, hidden: false, setAt: 1766000000000 },
  });
  return { ...toCloudSave(save), ...over };
}

function playerDoc(saveOver = {}, over = {}) {
  return { v: 1, save: cloudSave(saveOver), updatedAt: serverTimestamp(), ...over };
}

function entry(over = {}) {
  const scores = boardScores({ totalPresents: 30, bestPresentsInNight: 11, nights: 4, foundJokes: ['j001', 'j002'] });
  return { adj: 3, noun: 7, num: 42, ...scores, updatedAt: serverTimestamp(), ...over };
}

async function seed(path, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

function agoMs(ms) {
  return Timestamp.fromMillis(Date.now() - ms);
}

const writePlayer = (uid, data, owner = ALICE) => setDoc(doc(as(uid), 'players', owner), data);
const writeEntry = (uid, data, owner = ALICE) => setDoc(doc(as(uid), 'leaderboard', owner), data);

// ---------------------------------------------------------------- players

describe('players/{uid}: who', () => {
  it('lets the owner create, read, update and delete', async () => {
    await assertSucceeds(writePlayer(ALICE, playerDoc()));
    await assertSucceeds(getDoc(doc(as(ALICE), 'players', ALICE)));
    await assertSucceeds(writePlayer(ALICE, playerDoc({ totalPresents: 31 })));
    await assertSucceeds(deleteDoc(doc(as(ALICE), 'players', ALICE)));
  });

  it('keeps other users out', async () => {
    await seed('players/alice', playerDoc());
    await assertFails(getDoc(doc(as(BOB), 'players', ALICE)));
    await assertFails(writePlayer(BOB, playerDoc()));
    await assertFails(deleteDoc(doc(as(BOB), 'players', ALICE)));
    await assertFails(writePlayer(BOB, playerDoc(), 'carol')); // creating someone else's
  });

  it('keeps signed-out visitors out', async () => {
    await seed('players/alice', playerDoc());
    await assertFails(getDoc(doc(as(null), 'players', ALICE)));
    await assertFails(writePlayer(null, playerDoc()));
    await assertFails(deleteDoc(doc(as(null), 'players', ALICE)));
  });

  it('refuses listing the collection, even signed in', async () => {
    await seed('players/alice', playerDoc());
    await assertFails(getDocs(query(collection(as(ALICE), 'players'), limit(5))));
  });
});

describe('players/{uid}: shape', () => {
  it('accepts a fresh default save and a save without a name yet', async () => {
    await assertSucceeds(writePlayer(ALICE, { v: 1, save: toCloudSave(defaultSave()), updatedAt: serverTimestamp() }));
    await assertSucceeds(writePlayer(ALICE, playerDoc({ profile: null })));
  });

  it('needs exactly v, save and updatedAt', async () => {
    await assertFails(writePlayer(ALICE, playerDoc({}, { extra: 1 })));
    await assertFails(writePlayer(ALICE, without(playerDoc(), 'v')));
    await assertFails(writePlayer(ALICE, without(playerDoc(), 'updatedAt')));
    await assertFails(writePlayer(ALICE, playerDoc({}, { v: 2 })));
  });

  it('needs updatedAt to be the server time', async () => {
    await assertFails(writePlayer(ALICE, playerDoc({}, { updatedAt: agoMs(60000) })));
    await assertFails(writePlayer(ALICE, playerDoc({}, { updatedAt: 1766000000000 })));
    await seed('players/alice', playerDoc({}, { updatedAt: agoMs(60000) }));
    await assertFails(updateDoc(doc(as(ALICE), 'players', ALICE), { 'save.nights': 5 })); // keeps the old time
  });

  it('allows only the CloudSave keys', async () => {
    await assertFails(writePlayer(ALICE, playerDoc({ coins: 10 })));
    await assertFails(writePlayer(ALICE, playerDoc({ settings: { sfx: true } })));
    await assertFails(writePlayer(ALICE, { ...playerDoc(), save: without(cloudSave(), 'nights') }));
    await assertFails(writePlayer(ALICE, { ...playerDoc(), save: 'not a map' }));
  });

  it('checks types', async () => {
    await assertFails(writePlayer(ALICE, playerDoc({ epoch: '0' })));
    await assertFails(writePlayer(ALICE, playerDoc({ totalPresents: 1.5 })));
    await assertFails(writePlayer(ALICE, playerDoc({ upgrades: ['radar'] })));
    await assertFails(writePlayer(ALICE, playerDoc({ upgrades: { radar: '1' } })));
    await assertFails(writePlayer(ALICE, playerDoc({ foundJokes: { j001: true } })));
    await assertFails(writePlayer(ALICE, playerDoc({ unlocked: 'scarf' })));
    await assertFails(writePlayer(ALICE, playerDoc({ wardrobe: { scarf: 'on' } })));
    await assertFails(writePlayer(ALICE, playerDoc({ profile: { adj: 1, noun: 1, num: 1, hidden: 'no', setAt: 0 } })));
    await assertFails(writePlayer(ALICE, playerDoc({ profile: 'Jolly Penguin 1' })));
  });

  it('checks ranges', async () => {
    await assertSucceeds(writePlayer(ALICE, playerDoc({ upgrades: { radar: 3, magnet: 0 } })));
    await assertFails(writePlayer(ALICE, playerDoc({ upgrades: { radar: 4 } })));
    await assertFails(writePlayer(ALICE, playerDoc({ upgrades: { radar: -1 } })));
    await assertFails(writePlayer(ALICE, playerDoc({ totalPresents: -1 })));
    await assertFails(writePlayer(ALICE, playerDoc({ coinsEarned: 1000000001 })));
    await assertFails(writePlayer(ALICE, playerDoc({ epoch: 1000001 })));
    const name = cloudSave().profile;
    await assertSucceeds(writePlayer(ALICE, playerDoc({ profile: { ...name, adj: 39, noun: 39, num: 99 } })));
    await assertFails(writePlayer(ALICE, playerDoc({ profile: { ...name, adj: 40 } })));
    await assertFails(writePlayer(ALICE, playerDoc({ profile: { ...name, noun: -1 } })));
    await assertFails(writePlayer(ALICE, playerDoc({ profile: { ...name, num: 0 } })));
    await assertFails(writePlayer(ALICE, playerDoc({ profile: { ...name, num: 100 } })));
    await assertFails(writePlayer(ALICE, playerDoc({ profile: { ...name, setAt: -1 } })));
    await assertFails(writePlayer(ALICE, playerDoc({ profile: { ...name, extra: true } })));
  });

  it('caps list and map sizes', async () => {
    const ids = (n, p) => Array.from({ length: n }, (_, i) => `${p}${i}`);
    const map = (n, v) => Object.fromEntries(ids(n, 'k').map((k) => [k, v]));
    await assertSucceeds(
      writePlayer(ALICE, playerDoc({ foundJokes: ids(200, 'j'), unlocked: ids(20, 'm'), upgrades: map(20, 1), wardrobe: map(20, true) })),
    );
    await assertFails(writePlayer(ALICE, playerDoc({ foundJokes: ids(201, 'j') })));
    await assertFails(writePlayer(ALICE, playerDoc({ unlocked: ids(21, 'm') })));
    await assertFails(writePlayer(ALICE, playerDoc({ upgrades: map(21, 1) })));
    await assertFails(writePlayer(ALICE, playerDoc({ wardrobe: map(21, true) })));
  });
});

describe('players/{uid}: junk a cheater might send', () => {
  it('accepts every real id at once', async () => {
    const all = cloudSave({
      foundJokes: JOKES.map((j) => j.id),
      unlocked: MILESTONES.map((m) => m.id),
      upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, 3])),
      wardrobe: Object.fromEntries(MILESTONES.map((m) => [m.id, true])),
    });
    await assertSucceeds(writePlayer(ALICE, { v: 1, save: all, updatedAt: serverTimestamp() }));
  });

  it('refuses anything but short, unique id strings in foundJokes and unlocked', async () => {
    const bad = [
      ['j001', { id: 'j002' }],
      ['j001', 7],
      [null],
      [true],
      ['j001', 'j001'],
      ['two words'],
      ['j001|j002'],
      [''],
      ['x'.repeat(65)],
      ['x'.repeat(10000)],
    ];
    for (const list of bad) {
      await assertFails(writePlayer(ALICE, playerDoc({ foundJokes: list })));
      await assertFails(writePlayer(ALICE, playerDoc({ unlocked: list })));
    }
  });

  it('refuses junk keys and values in upgrades and wardrobe', async () => {
    for (const key of ['two words', 'a|b', 'x'.repeat(65)]) {
      await assertFails(writePlayer(ALICE, playerDoc({ upgrades: { [key]: 1 } })));
      await assertFails(writePlayer(ALICE, playerDoc({ wardrobe: { [key]: true } })));
    }
    for (const lvl of [{ lvl: 3 }, [3], 1.5, true, null]) {
      await assertFails(writePlayer(ALICE, playerDoc({ upgrades: { radar: lvl } })));
    }
    for (const on of [{ on: true }, 1, 'yes', null]) {
      await assertFails(writePlayer(ALICE, playerDoc({ wardrobe: { scarf: on } })));
    }
  });

  it('refuses nested maps where numbers or a name belong', async () => {
    const name = cloudSave().profile;
    await assertFails(writePlayer(ALICE, playerDoc({ profile: { ...name, adj: { x: 1 } } })));
    await assertFails(writePlayer(ALICE, playerDoc({ totalPresents: { $gt: 0 } })));
    await assertFails(writePlayer(ALICE, playerDoc({ hacked: { deep: ['x'] } })));
    await assertFails(writePlayer(ALICE, { ...playerDoc(), save: { ...cloudSave(), profile: { ...name, note: 'hi' } } }));
  });

  it('refuses absurd counters', async () => {
    await assertFails(writePlayer(ALICE, playerDoc({ totalPresents: 1e12 })));
    await assertFails(writePlayer(ALICE, playerDoc({ nights: Number.MAX_SAFE_INTEGER })));
    await assertFails(writePlayer(ALICE, playerDoc({ bestPresentsInNight: -5 })));
  });
});

describe('players/{uid}: the writes cloud.js makes', () => {
  // cloud.js pushes in a transaction: read the doc, then set the merged save.
  function push(uid, save, owner = uid) {
    const db = as(uid);
    return runTransaction(db, async (tx) => {
      const ref = doc(db, 'players', owner);
      await tx.get(ref);
      tx.set(ref, { v: 1, save, updatedAt: serverTimestamp() });
    });
  }

  it('allows the owner to create and then update in a transaction', async () => {
    await assertSucceeds(push(ALICE, cloudSave()));
    await assertSucceeds(push(ALICE, cloudSave({ totalPresents: 31, epoch: 1 })));
  });

  it("refuses a transaction on someone else's save", async () => {
    await seed('players/alice', playerDoc());
    await assertFails(push(BOB, cloudSave(), ALICE));
  });

  it('lets the owner delete both docs before switching accounts', async () => {
    await seed('players/alice', playerDoc());
    await seed('leaderboard/alice', entry({ updatedAt: agoMs(1000) }));
    await assertSucceeds(deleteDoc(doc(as(ALICE), 'players', ALICE)));
    await assertSucceeds(deleteDoc(doc(as(ALICE), 'leaderboard', ALICE)));
  });
});

// ---------------------------------------------------------------- leaderboard

describe('leaderboard/{uid}: reading', () => {
  beforeEach(async () => {
    for (let i = 1; i <= 55; i++) await seed(`leaderboard/p${i}`, entry({ bestNight: i % 30, totalPresents: 100 + i, updatedAt: agoMs(60000) }));
  });

  it('lets any signed-in player read one entry, but not signed-out visitors', async () => {
    await assertSucceeds(getDoc(doc(as(BOB), 'leaderboard', 'p1')));
    await assertFails(getDoc(doc(as(null), 'leaderboard', 'p1')));
  });

  it('allows list queries of up to 50', async () => {
    const col = collection(as(BOB), 'leaderboard');
    await assertSucceeds(getDocs(query(col, where('bestNight', '>', 0), orderBy('bestNight', 'desc'), limit(25))));
    await assertSucceeds(getDocs(query(col, orderBy('totalPresents', 'desc'), limit(50))));
  });

  it('refuses list queries over 50, without a limit, or signed out', async () => {
    const col = collection(as(BOB), 'leaderboard');
    await assertFails(getDocs(query(col, orderBy('totalPresents', 'desc'), limit(51))));
    await assertFails(getDocs(query(col, where('bestNight', '>', 0), orderBy('bestNight', 'desc'), limit(1000))));
    await assertFails(getDocs(query(col, where('totalPresents', '>', 0))));
    await assertFails(getDocs(query(col, orderBy('totalPresents', 'desc'))));
    await assertFails(getDocs(col));
    await assertFails(getDocs(query(collection(as(null), 'leaderboard'), limit(10))));
  });

  it('counts how many players are ahead, for the "You: #N" rank', async () => {
    const ahead = query(collection(as(BOB), 'leaderboard'), where('totalPresents', '>', 150));
    const snap = await assertSucceeds(getCountFromServer(ahead));
    if (snap.data().count !== 5) throw new Error(`expected 5 ahead, got ${snap.data().count}`);
    const all = await assertSucceeds(getCountFromServer(collection(as(BOB), 'leaderboard')));
    if (all.data().count !== 55) throw new Error(`expected 55 in all, got ${all.data().count}`);
    await assertFails(getCountFromServer(query(collection(as(null), 'leaderboard'), where('totalPresents', '>', 150))));
  });

  it('caps Firestore Lite list queries at 50 the same way', async () => {
    const col = lite.collection(liteAs(BOB), 'leaderboard');
    const top = (n) => lite.query(col, lite.where('bestNight', '>', 0), lite.orderBy('bestNight', 'desc'), lite.limit(n));
    const snap = await assertSucceeds(lite.getDocs(top(50)));
    if (snap.size !== 50) throw new Error(`expected 50 rows, got ${snap.size}`);
    await assertSucceeds(lite.getDocs(top(25)));
    await assertFails(lite.getDocs(top(51)));
    await assertFails(lite.getDocs(lite.query(col, lite.orderBy('totalPresents', 'desc'))));
    await assertFails(lite.getDocs(col));
    await assertFails(lite.getDocs(lite.query(lite.collection(liteAs(null), 'leaderboard'), lite.limit(10))));
  });

  it('lets a Firestore Lite count through for signed-in players only', async () => {
    const ahead = lite.query(lite.collection(liteAs(BOB), 'leaderboard'), lite.where('totalPresents', '>', 150));
    const snap = await assertSucceeds(lite.getCount(ahead));
    if (snap.data().count !== 5) throw new Error(`expected 5 ahead, got ${snap.data().count}`);
    const all = await assertSucceeds(lite.getCount(lite.collection(liteAs(BOB), 'leaderboard')));
    if (all.data().count !== 55) throw new Error(`expected 55 in all, got ${all.data().count}`);
    await assertFails(lite.getCount(lite.query(lite.collection(liteAs(null), 'leaderboard'), lite.where('totalPresents', '>', 150))));
  });

  // The gap firestore.rules owns up to: rules can't tell a count from a list
  // that lacks the SDKs' implicit __name__ ordering, so a hand-made REST query
  // with neither a limit nor that ordering reads every entry. Pinned here so a
  // rules change that closes (or widens) it gets noticed.
  it('lets a hand-made REST list without __name__ ordering through (the count gap)', async () => {
    const run = async (structuredQuery, uid = BOB) => {
      const res = await fetch(`http://${emulatorHost()}/v1/projects/demo-pips-hunt/databases/(default)/documents:runQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer ${mockIdToken(uid)}` } : {}) },
        body: JSON.stringify({ structuredQuery }),
      });
      const body = await res.json();
      return { status: res.status, rows: Array.isArray(body) ? body.filter((r) => r.document).length : 0 };
    };
    const from = [{ collectionId: 'leaderboard' }];
    const gap = await run({ from });
    if (gap.status !== 200 || gap.rows !== 55) throw new Error(`expected the gap to read all 55, got ${JSON.stringify(gap)}`);
    // the same query as the SDKs send it (with __name__) is refused
    const named = await run({ from, orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }] });
    if (named.status !== 403) throw new Error(`expected 403 with __name__ ordering, got ${named.status}`);
    const signedOut = await run({ from }, null);
    if (signedOut.status !== 403) throw new Error(`expected 403 signed out, got ${signedOut.status}`);
  });
});

describe('leaderboard/{uid}: creating', () => {
  it('lets the owner create a valid entry', async () => {
    await assertSucceeds(writeEntry(ALICE, entry()));
  });

  it('refuses other users and signed-out visitors', async () => {
    await assertFails(writeEntry(BOB, entry()));
    await assertFails(writeEntry(null, entry()));
  });

  it('needs exactly the entry keys', async () => {
    await assertFails(writeEntry(ALICE, entry({ name: 'Rude Word 1' })));
    await assertFails(writeEntry(ALICE, without(entry(), 'nights')));
    await assertFails(writeEntry(ALICE, without(entry(), 'updatedAt')));
  });

  it('checks types', async () => {
    await assertFails(writeEntry(ALICE, entry({ adj: 1.5 })));
    await assertFails(writeEntry(ALICE, entry({ bestNight: '8' })));
    await assertFails(writeEntry(ALICE, entry({ jokesFound: null })));
  });

  it('checks ranges', async () => {
    await assertSucceeds(writeEntry(ALICE, entry({ adj: 39, noun: 0, num: 99, bestNight: 200, totalPresents: 1000000, jokesFound: 102, nights: 100000 })));
    await assertSucceeds(writeEntry(BOB, entry({ adj: 0, noun: 39, num: 1, bestNight: 0, totalPresents: 0, jokesFound: 0, nights: 0 }), BOB));
    const bad = [
      { adj: 40 },
      { adj: -1 },
      { noun: 40 },
      { num: 0 },
      { num: 100 },
      { bestNight: 201, totalPresents: 500 },
      { bestNight: -1 },
      { jokesFound: 103 },
      { totalPresents: 1000001 },
      { nights: 100001 },
      { nights: -1 },
    ];
    for (const over of bad) await assertFails(writeEntry('carol', entry(over), 'carol'));
  });

  it('needs bestNight <= totalPresents', async () => {
    await assertSucceeds(writeEntry(ALICE, entry({ bestNight: 9, totalPresents: 9 })));
    await assertFails(writeEntry(BOB, entry({ bestNight: 10, totalPresents: 9 }), BOB));
  });

  it('needs updatedAt to be the server time', async () => {
    await assertFails(writeEntry(ALICE, entry({ updatedAt: agoMs(60000) })));
    await assertFails(writeEntry(ALICE, entry({ updatedAt: Date.now() })));
  });
});

describe('leaderboard/{uid}: updating', () => {
  const old = () => entry({ updatedAt: agoMs(10000) });

  it('lets the owner raise scores 5 s after the last write', async () => {
    await seed('leaderboard/alice', old());
    await assertSucceeds(writeEntry(ALICE, entry({ bestNight: 12, totalPresents: 40, jokesFound: 3 })));
  });

  it('lets the owner rename and keep equal scores', async () => {
    await seed('leaderboard/alice', old());
    await assertSucceeds(writeEntry(ALICE, entry({ adj: 9, noun: 9, num: 9 })));
  });

  it('allows nights to change either way (it is not ranked by the rules)', async () => {
    await seed('leaderboard/alice', old());
    await assertSucceeds(writeEntry(ALICE, entry({ nights: 1 })));
  });

  it('refuses lowering bestNight, totalPresents or jokesFound', async () => {
    for (const over of [{ bestNight: 10 }, { totalPresents: 29 }, { jokesFound: 1 }]) {
      await seed('leaderboard/alice', old());
      await assertFails(writeEntry(ALICE, entry(over)));
    }
  });

  it('refuses a second write within 5 s', async () => {
    await assertSucceeds(writeEntry(ALICE, entry()));
    await assertFails(writeEntry(ALICE, entry({ totalPresents: 31 })));
    await seed('leaderboard/alice', entry({ updatedAt: agoMs(3000) }));
    await assertFails(writeEntry(ALICE, entry({ totalPresents: 31 })));
    await seed('leaderboard/alice', entry({ updatedAt: agoMs(6000) }));
    await assertSucceeds(writeEntry(ALICE, entry({ totalPresents: 31 })));
  });

  it('refuses raising scores past the caps', async () => {
    for (const over of [{ totalPresents: 1e9 }, { bestNight: 1000, totalPresents: 5000 }, { jokesFound: 500 }, { nights: 1e7 }]) {
      await seed('leaderboard/alice', old());
      await assertFails(writeEntry(ALICE, entry(over)));
    }
  });

  it('refuses nested junk and wrong types in an update', async () => {
    for (const over of [{ adj: { x: 1 } }, { bestNight: [12] }, { nights: 4.5 }, { num: '42' }, { totalPresents: null }]) {
      await seed('leaderboard/alice', old());
      await assertFails(writeEntry(ALICE, entry(over)));
    }
  });

  it('refuses dodging the 5 s wait with a partial update or an old updatedAt', async () => {
    await seed('leaderboard/alice', entry({ updatedAt: agoMs(2000) }));
    const ref = doc(as(ALICE), 'leaderboard', ALICE);
    await assertFails(updateDoc(ref, { totalPresents: 31, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { totalPresents: 31 })); // keeps the old time
    await assertFails(updateDoc(ref, { totalPresents: 31, updatedAt: agoMs(60000) }));
  });

  it('refuses other users and invalid entries', async () => {
    await seed('leaderboard/alice', old());
    await assertFails(writeEntry(BOB, entry({ totalPresents: 99 })));
    await assertFails(writeEntry(ALICE, entry({ bestNight: 50, totalPresents: 40 })));
    await assertFails(writeEntry(ALICE, entry({ updatedAt: agoMs(1) })));
    await assertFails(writeEntry(ALICE, entry({ hacked: true })));
  });
});

describe('leaderboard/{uid}: deleting', () => {
  it('lets only the owner delete', async () => {
    await seed('leaderboard/alice', entry({ updatedAt: agoMs(1000) }));
    await assertFails(deleteDoc(doc(as(BOB), 'leaderboard', ALICE)));
    await assertFails(deleteDoc(doc(as(null), 'leaderboard', ALICE)));
    await assertSucceeds(deleteDoc(doc(as(ALICE), 'leaderboard', ALICE)));
  });

  it('lets a reset recreate lower scores straight after the delete', async () => {
    await seed('leaderboard/alice', entry({ updatedAt: agoMs(1000) }));
    await assertSucceeds(deleteDoc(doc(as(ALICE), 'leaderboard', ALICE)));
    await assertSucceeds(writeEntry(ALICE, entry({ bestNight: 0, totalPresents: 0, jokesFound: 0, nights: 0 })));
  });
});

describe('everything else', () => {
  it('is denied', async () => {
    await assertFails(setDoc(doc(as(ALICE), 'secrets', 'x'), { a: 1 }));
    await assertFails(getDoc(doc(as(ALICE), 'secrets', 'x')));
    await assertFails(setDoc(doc(as(ALICE), 'players', ALICE, 'extra', 'x'), { a: 1 }));
  });
});

// ---------------------------------------------------------------- feedback

// A doc as cloud.sendFeedback() writes it: the client's own cleanFeedback,
// so the client and the rules can't drift apart unnoticed.
function feedbackDoc(uid, over = {}) {
  const fields = cleanFeedback({ rating: 4, category: 'idea', quick: ['loved', 'moreJokes'], comment: '', islandSeed: 123456, deviceType: 'touch', appVersion: '1.0.0+abc1234' });
  return { uid, ...fields, createdAt: serverTimestamp(), ...over };
}

// The batch cloud.js sends: the feedback doc and its feedbackLimits stamp.
// `stamp: false` leaves the stamp out; `extra` adds more writes.
function sendFeedback(uid, { data, stamp, limitsOwner = uid, id, extra } = {}) {
  const db = as(uid);
  const ref = id ? doc(db, 'feedback', id) : doc(collection(db, 'feedback'));
  const batch = writeBatch(db);
  batch.set(ref, data || feedbackDoc(uid));
  if (stamp !== false) batch.set(doc(db, 'feedbackLimits', limitsOwner), stamp || { lastAt: serverTimestamp(), lastId: ref.id });
  if (extra) extra(batch, db, ref);
  return batch.commit();
}

const MINUTE = 60 * 1000;

describe('feedback/{id}: sending', () => {
  it('lets a signed-in player send one with its stamp', async () => {
    await assertSucceeds(sendFeedback(ALICE));
  });

  it('accepts every topic, every quick note, both device types and the edges of each range', async () => {
    const cases = [
      ...FEEDBACK_CATEGORIES.map((c) => ({ category: c.id })),
      { quick: FEEDBACK_QUICK.slice(0, 3).map((q) => q.id) },
      { quick: FEEDBACK_QUICK.slice(3).map((q) => q.id) },
      { quick: [] },
      { rating: 1 },
      { rating: 5 },
      { comment: 'x'.repeat(300) },
      { comment: '🎄'.repeat(150) },
      { islandSeed: null },
      { islandSeed: 0 },
      { islandSeed: 999999999 },
      { deviceType: 'desktop' },
      { appVersion: 'v'.repeat(40) },
    ];
    // a new player each time: one per player every 10 minutes
    for (const [i, over] of cases.entries()) {
      await assertSucceeds(sendFeedback(`kid${i}`, { data: feedbackDoc(`kid${i}`, over) }));
    }
  });

  it('refuses signed-out visitors and sending as someone else', async () => {
    await assertFails(sendFeedback(null, { data: feedbackDoc('anonymous'), limitsOwner: 'anonymous' }));
    await assertFails(sendFeedback(ALICE, { data: feedbackDoc(BOB) }));
    await assertFails(sendFeedback(ALICE, { data: feedbackDoc('anonymous') }));
    await assertFails(sendFeedback(ALICE, { data: feedbackDoc(BOB), limitsOwner: BOB }));
  });

  it('needs exactly the feedback keys', async () => {
    await assertFails(sendFeedback(ALICE, { data: feedbackDoc(ALICE, { email: 'kid@example.com' }) }));
    for (const key of ['uid', 'rating', 'category', 'quick', 'comment', 'islandSeed', 'deviceType', 'appVersion', 'createdAt']) {
      await assertFails(sendFeedback(ALICE, { data: without(feedbackDoc(ALICE), key) }), key);
    }
  });

  it('checks every field', async () => {
    const bad = [
      { rating: 0 },
      { rating: 6 },
      { rating: 3.5 },
      { rating: '4' },
      { category: 'hack' },
      { category: 'Bug' },
      { category: ['bug'] },
      { quick: ['loved', 'pizza'] },
      { quick: ['loved', 'loved'] },
      { quick: ['loved', 'tooHard', 'tooEasy', 'broke'] },
      { quick: 'loved' },
      { quick: [1] },
      { comment: 'x'.repeat(301) },
      { comment: 42 },
      { comment: null },
      { islandSeed: -1 },
      { islandSeed: 1000000000 },
      { islandSeed: 1.5 },
      { islandSeed: '123456' },
      { deviceType: 'phone' },
      { deviceType: null },
      { appVersion: '' },
      { appVersion: 'v'.repeat(41) },
      { appVersion: 100 },
      { createdAt: Timestamp.fromMillis(Date.now()) },
    ];
    for (const over of bad) await assertFails(sendFeedback(ALICE, { data: feedbackDoc(ALICE, over) }), JSON.stringify(over));
  });
});

describe('feedback/{id}: the 10-minute limit', () => {
  it('refuses a send without its stamp, or with a wrong one', async () => {
    await assertFails(sendFeedback(ALICE, { stamp: false }));
    await assertFails(sendFeedback(ALICE, { stamp: { lastAt: serverTimestamp(), lastId: 'someOtherDoc' } }));
    await assertFails(sendFeedback(ALICE, { stamp: { lastAt: agoMs(20 * MINUTE), lastId: 'x' } }));
    await assertFails(sendFeedback(ALICE, { id: 'fixedId1', stamp: { lastAt: agoMs(1), lastId: 'fixedId1' } }));
    await assertFails(sendFeedback(ALICE, { id: 'fixedId2', stamp: { lastAt: serverTimestamp(), lastId: 'fixedId2', extra: 1 } }));
  });

  it('refuses a second send within 10 minutes, and allows one after', async () => {
    await assertSucceeds(sendFeedback(ALICE));
    await assertFails(sendFeedback(ALICE));
    await seed('feedbackLimits/alice', { lastAt: agoMs(9 * MINUTE), lastId: 'earlier' });
    await assertFails(sendFeedback(ALICE));
    await seed('feedbackLimits/alice', { lastAt: agoMs(11 * MINUTE), lastId: 'earlier' });
    await assertSucceeds(sendFeedback(ALICE));
  });

  it('refuses two at once under one stamp', async () => {
    await assertFails(
      sendFeedback(ALICE, {
        extra: (batch, db) => batch.set(doc(collection(db, 'feedback')), feedbackDoc(ALICE)),
      })
    );
  });

  it("refuses stamping someone else's limits", async () => {
    await assertFails(sendFeedback(ALICE, { limitsOwner: BOB }));
  });
});

describe('feedback/{id}: reading and deleting', () => {
  beforeEach(async () => {
    await seed('feedback/fromAlice', feedbackDoc(ALICE, { createdAt: agoMs(1000) }));
    await seed('feedback/fromBob', feedbackDoc(BOB, { createdAt: agoMs(1000) }));
  });

  it("never lets a player read anyone else's", async () => {
    await assertFails(getDoc(doc(as(ALICE), 'feedback', 'fromBob')));
    await assertFails(getDocs(query(collection(as(ALICE), 'feedback'), limit(10))));
    await assertFails(getDocs(query(collection(as(ALICE), 'feedback'), where('uid', '==', BOB))));
    await assertFails(getDocs(query(collection(as(null), 'feedback'), where('uid', '==', ALICE))));
  });

  it('lets a player list their own (to delete them), but not get or change one', async () => {
    const mine = await assertSucceeds(getDocs(query(collection(as(ALICE), 'feedback'), where('uid', '==', ALICE))));
    expect(mine.docs.map((d) => d.id)).toEqual(['fromAlice']);
    await assertFails(getDoc(doc(as(ALICE), 'feedback', 'fromAlice')));
    await assertFails(updateDoc(doc(as(ALICE), 'feedback', 'fromAlice'), { rating: 1 }));
    await assertFails(setDoc(doc(as(ALICE), 'feedback', 'fromAlice'), feedbackDoc(ALICE)));
  });

  it('lets only the sender delete one', async () => {
    await assertFails(deleteDoc(doc(as(BOB), 'feedback', 'fromAlice')));
    await assertFails(deleteDoc(doc(as(null), 'feedback', 'fromAlice')));
    await assertSucceeds(deleteDoc(doc(as(ALICE), 'feedback', 'fromAlice')));
  });
});

describe('feedbackLimits/{uid}', () => {
  beforeEach(async () => {
    await seed('feedbackLimits/alice', { lastAt: agoMs(MINUTE), lastId: 'fromAlice' });
  });

  it('lets only the owner read and delete it', async () => {
    await assertSucceeds(getDoc(doc(as(ALICE), 'feedbackLimits', ALICE)));
    await assertFails(getDoc(doc(as(BOB), 'feedbackLimits', ALICE)));
    await assertFails(getDocs(query(collection(as(ALICE), 'feedbackLimits'), limit(5))));
    await assertFails(deleteDoc(doc(as(BOB), 'feedbackLimits', ALICE)));
    await assertSucceeds(deleteDoc(doc(as(ALICE), 'feedbackLimits', ALICE)));
  });

  // A script could otherwise send, delete the stamp and send again at once,
  // as fast as it liked. Now each extra send costs the one before it, so
  // they can't pile up.
  it('can only be deleted once the feedback it names is gone', async () => {
    await env.clearFirestore();
    await assertSucceeds(sendFeedback(ALICE, { id: 'first1' }));
    await assertFails(deleteDoc(doc(as(ALICE), 'feedbackLimits', ALICE)));
    await assertFails(sendFeedback(ALICE));
    // "Delete my saved data": the feedback first, then the stamp
    await assertSucceeds(deleteDoc(doc(as(ALICE), 'feedback', 'first1')));
    await assertFails(deleteDoc(doc(as(BOB), 'feedbackLimits', ALICE)));
    await assertSucceeds(deleteDoc(doc(as(ALICE), 'feedbackLimits', ALICE)));
    // deleting a stamp that isn't there is fine (a player who never sent any)
    await assertSucceeds(deleteDoc(doc(as(BOB), 'feedbackLimits', BOB)));
  });

  it('is never written on its own, so the limit cannot be wound back', async () => {
    await assertFails(setDoc(doc(as(ALICE), 'feedbackLimits', ALICE), { lastAt: serverTimestamp(), lastId: 'fromAlice' }));
    await assertFails(setDoc(doc(as(BOB), 'feedbackLimits', BOB), { lastAt: serverTimestamp(), lastId: 'nothing' }));
    await assertFails(updateDoc(doc(as(ALICE), 'feedbackLimits', ALICE), { lastAt: agoMs(60 * MINUTE) }));
  });
});
