# Cloud saves and leaderboard: design contract

Progress follows the player to any device, and a public leaderboard ranks snow
names. The backend is Firebase: Authentication (anonymous, plus optional Google)
and Cloud Firestore, called straight from the static site on GitHub Pages. Nothing
else runs on a server.

The game must keep working with no network, no Firebase project configured, or
a Firebase outage. Every cloud call is best-effort and never throws into game
code.

## Who plays as whom

- **First visit:** the game signs in anonymously and silently. The uid lives in
  the browser (IndexedDB), and the save syncs to the cloud under that uid. The
  player gets a random snow name.
- **Sign in with Google** (optional, aimed at grown-ups) links the anonymous
  account to Google, which keeps the same uid. Signing in with that Google
  account on any other device brings the same progress there.
- **That Google account already belongs to another uid** (they signed in on
  another device first; Firebase raises `auth/credential-already-in-use`): we
  merge this device's local progress into that account's save, delete the
  anonymous uid's `players` and `leaderboard` docs (and any feedback it sent,
  with its `feedbackLimits` stamp, which "Delete my saved data" could never
  reach once the uid is left behind) while still signed in as it, then sign in
  with the Google credential from the error.
- **Sign out on this device:** sign out, sign in anonymously as a brand-new
  uid, and replace the local save with a fresh one. The progress stays safe in
  the Google account. Keeping the local save would create a second leaderboard
  entry with the same scores.

## Data model (Firestore)

`players/{uid}`: private, owner only.

```
{ v: 1, save: CloudSave, updatedAt: <server timestamp> }

CloudSave = {
  epoch: int >= 0,              // bumped by "Reset progress"
  coinsEarned: int,             // lifetime net coin income (can dip for a gremlin theft)
  totalPresents: int, totalCrackers: int, nights: int, bestPresentsInNight: int,
  upgrades: { [upgradeId]: int 0..3 },     // at most 20 keys
  foundJokes: [jokeId string],              // at most 200
  unlocked: [milestoneId string],           // at most 20
  wardrobe: { [milestoneId]: bool },        // at most 20 keys
  profile: { adj: int, noun: int, num: int, hidden: bool, setAt: int (ms) }
}
```

The cloud copy has no `coins`, `settings` or `version`. Coins are derived (see
below), and sound settings stay on each device.

`leaderboard/{uid}`: public to signed-in players, written only by its owner.

```
{ adj, noun, num,                 // name word indexes (src/cloud/names.js)
  bestNight: int,                 // most presents opened in one night
  totalPresents: int, jokesFound: int, nights: int,
  updatedAt: <server timestamp> }
```

There's no doc while `profile.hidden` is true, and there's no free text anywhere.

## Coins without duplication

The local save keeps `coins`, which the game reads and spends as before, and adds
`coinsEarned`. The invariant everywhere is:

```
coins === coinsEarned - spentOnUpgrades(upgrades)
```

- **`ctx.addCoins(n)`** changes both. The amount is already clamped so coins never go below 0.
- **Debug F8** adds to both.
- **`buyUpgrade`** only lowers `coins`. Spending is derived from the levels owned.
- **Old saves:** `loadSave` migrates them with `coinsEarned = coins + spentOnUpgrades(upgrades)`.

After a merge, `coins` is recomputed from the merged `coinsEarned` and the merged
upgrades, so buying different upgrades on two devices can't create coins. Income
earned on two devices at the same time between syncs keeps only the larger
amount. That loses a little; it never invents any.

## mergeSaves(local, remote) → merged

This is a pure function, and its unit tests live in `test/merge.test.js`.

1. **Epochs differ:** the save with the higher `epoch` wins outright: its
   progress, its profile and its wardrobe. A reset on one device beats older
   progress everywhere.
2. **Same epoch:** merge field by field.
   - **Counters:** `max` for `coinsEarned`, `totalPresents`, `totalCrackers`,
     `nights` and `bestPresentsInNight`.
   - **`upgrades`:** the highest level for each id, clamped to 0..3.
   - **`foundJokes`:** local order first, then any remote ids that are missing, as
     strings with no duplicates.
   - **`unlocked`:** the union of both lists.
   - **`wardrobe`:** the local value where local has the key, otherwise the remote value.
   - **`profile`:** whichever has the newer `setAt`; a missing profile loses.
3. **Always:**
   - `settings` comes from local.
   - `coins` is set to `max(0, coinsEarned - spentOnUpgrades(upgrades))`, and
     `coinsEarned` is raised to the amount spent if it fell below it.
   - `version` comes from local.
4. Merging must be idempotent, and a merge with an empty or missing remote
   returns local unchanged.

## Sync rules (src/cloud/cloud.js)

- **On boot:** `cloud.start()`. It lazy-imports Firebase, restores or creates the
  anonymous user, then runs a push.
- **A push** is a transaction: read `players/{uid}`, merge the remote into local,
  write the merged result, then hand it to `replaceSave` if anything changed.
  Leaderboard submission comes after a successful push.
- **During a night we never push.** `markDirty()` only flags the save. Pushes run
  at night end, on quit to title, after menu changes (debounced 2 s), on name
  changes, on reset, and best-effort when the page is hidden.
- **Leaderboard writes** are skipped when the payload hasn't changed since the
  last write. They are spaced at least 6 s apart; the rules require 5 s.
- **Errors:** the status goes to `offline` or `error`, and the push retries on the
  next trigger. Nothing ever throws.

## Security rules (firestore.rules)

**`players/{uid}`**
- Only the owner can read, create, update or delete it.
- Writes must have exactly the keys `v`, `save` and `updatedAt`, with
  `updatedAt == request.time`.
- `save` is checked against the CloudSave shape above: allowed keys only, ints in
  sane ranges, and the list and map size caps.

**`leaderboard/{uid}`**
- **Read:** any signed-in user. A list query's `limit` must be 50 or fewer if
  that can be enforced without breaking count queries (`getCountFromServer`);
  test both.
- **Delete:** the owner only.
- **Create:** the owner, with an entry that passes validation.
- **Update:** the owner, with a valid entry where `bestNight`, `totalPresents`
  and `jokesFound` are each greater than or equal to the stored value, and at
  least 5 s have passed since the stored `updatedAt`.
- **A valid entry has:**
  - exactly the keys listed in the data model;
  - `adj` 0..39, `noun` 0..39 and `num` 1..99, matching the list lengths in names.js;
  - `bestNight` 0..200, `jokesFound` 0..102, `totalPresents` 0..1,000,000 and `nights` 0..100,000;
  - `bestNight <= totalPresents`;
  - `updatedAt == request.time`.

**`feedback/{id}` and `feedbackLimits/{uid}`:** see "Feedback" at the end.

- **Everything else** is denied.

These rules stop obvious tampering only. A determined cheater can still post
plausible fake scores; real validation would need server code (Cloud Functions,
paid Blaze plan).

## Module APIs

### src/cloud/names.js (done)
`ADJECTIVES`, `NOUNS` (40 each, append-only), `NAME_NUM_MIN/MAX` (1..99),
`isValidNameParts(p)`, `nameFromParts(p)`, `randomNameParts(random?)`.

### src/game/upgrades.js (main thread adds)
`spentOnUpgrades(upgrades) → int`: the sum of every owned level's cost.

### src/core/save.js (main thread adds)
`defaultSave()` gains `coinsEarned: 0`, `epoch: 0` and `profile: null`.
`loadSave()` migrates `coinsEarned` and keeps the invariant. main.js gives a new
player a random profile at boot.

### src/cloud/config.js
- `FIREBASE_CONFIG` is the web app config object, or `null` until a project exists.
- `USE_EMULATOR` is `import.meta.env.VITE_FIREBASE_EMULATOR === '1'`.
- `cloudConfig()` returns the demo config with project id `demo-pips-hunt` when
  using the emulator, otherwise `FIREBASE_CONFIG`, or `null`.
- Emulator hosts are auth `http://127.0.0.1:9099` and firestore `127.0.0.1:8080`.

### src/cloud/merge.js
`mergeSaves(local, remote)`, `toCloudSave(save)`, `fromCloudSave(cloud, local)`
(fills in local-only fields), `boardScores(save)` (gives
`{bestNight, totalPresents, jokesFound, nights}`) and `ensureProfile(save, random?)`.

### src/cloud/feedback.js
`FEEDBACK_CATEGORIES`, `FEEDBACK_QUICK` (`{ id, icon, label }` lists; the
rules mirror the ids), `FEEDBACK_QUICK_MAX` (3), `FEEDBACK_COMMENT_MAX` (300),
`FEEDBACK_GAP_MS` (10 minutes), `APP_VERSION`, `detectDeviceType(win?)`,
`cleanSeed(v)` and `cleanFeedback(payload)` (the doc's fields without `uid`
and `createdAt`, or null if it can't be sent). See "Feedback" below.

### src/cloud/cloud.js: the facade main.js and screens.js use
`createCloud({ getSave, replaceSave, onStatus })` returns:

| Member | Meaning |
|---|---|
| `enabled` | `cloudConfig() !== null` |
| `status` | `{ state: 'off'\|'connecting'\|'syncing'\|'synced'\|'offline'\|'error', isAnonymous, accountName, lastSyncedAt, error }`. `accountName` is the Google display name's first word or `null`. |
| `start()` | Promise. Signs in, then the first push. Safe to call twice. |
| `hold(on)` | main.js calls `hold(true)` when a night starts and `hold(false)` when it ends or is quit. While held, `markDirty` and `flush` only flag; releasing the hold pushes if dirty. |
| `markDirty({ now })` | Flags the save. Pushes after 2 s, or at once with `now: true`. |
| `flush()` | Promise. Pushes now if dirty. |
| `linkGoogle()` | Promise `{ ok, switched?, error? }`. `switched` means it moved to an existing Google account and merged. |
| `signOutToFresh()` | Promise `{ ok, error? }`. |
| `resetEverywhere()` | Promise. Call after a local reset that raised `epoch`. Overwrites the cloud save and deletes, then recreates, the leaderboard entry. |
| `getLeaderboard(board, { limit = 25 })` | Promise `{ entries: [{ rank, name, score, isMe }], me: { rank, score } \| null, error? }`. Hidden or zero scores aren't listed. |
| `setProfile(partial)` | Merges into `save.profile`, sets `setAt`, persists locally, then `markDirty({ now: true })`. |
| `sendFeedback(payload)` | Promise `{ ok, error? }`, never rejects. Writes one `feedback` doc (see "Feedback" below). `error` is `'cloud-off'`, `'invalid'`, `'offline'`, `'too-soon'` or a Firebase code. |
| `BOARDS` | `[{ id: 'bestNight', label: 'Best Night', icon: '🌙', unit: 'presents' }, { id: 'totalPresents', label: 'All Presents', icon: '🎁', unit: 'presents' }, { id: 'jokesFound', label: 'Jokes Found', icon: '🎉', unit: 'jokes' }]` |

`onStatus(status)` fires on every status change. `replaceSave(next)` is
main.js's job: it copies `next` into the live save object in place, writes it
locally and refreshes the HUD, cosmetics and any open menu.

## Screens (src/ui/screens.js, screens.css)

`deps.cloud` is the facade, and may be missing. With no cloud, or
`!cloud.enabled`, nothing below appears.

- **Title:** a "Leaderboard" button (🏆) in the main menu, plus a small cloud
  chip under the stats ticket that shows the status in kid-friendly words
  ("Saved to the cloud ☁️", "Saving…", "Offline: saved on this device",
  "Sign in to play on any device").
- **New screen `leaderboard`:** uses `page()`. Esc and Back return to wherever
  it was opened from (title, or results via a footer button).
  - **Board tabs** from `cloud.BOARDS`.
  - **Top list:** rank (🥇🥈🥉 for the top three), snow name and score. The
    player's own row is highlighted, with "You: #N" under the list when they're
    outside the top. It has a loading state, an empty state ("Be the first on
    the board!") and an offline/error state with a Retry button.
  - **"Your snow name" card:** the name, a 🎲 new random name button, two
    selects for the adjective and noun, and a "Show me on the leaderboard"
    switch. Changes go through `cloud.setProfile`.
  - **"Play on any device" card:**
    - Anonymous: a short explanation for grown-ups and a "Sign in with Google"
      button that calls `linkGoogle()`, showing busy, success and failure
      states. A cancelled popup isn't an error.
    - Google: "Signed in as {accountName}. Progress is saved to your account."
      plus "Sign out on this device", with an in-page confirm (no
      `window.confirm`) that explains this device will start fresh.
- **`refresh()`** re-renders the leaderboard screen.
- **`screens.cloudChanged()`** is a new public method that main.js calls from
  `onStatus`. It updates the title chip and the leaderboard's account card in
  place, without rebuilding the screen or moving focus.
- **main.js passes the facade** as `createScreens(root, { ..., cloud })`.
- **Results:** a "Leaderboard" button in the footer when cloud is enabled.

## Testing

- **Unit tests:** `npm test` runs Vitest on the pure modules.
- **Rules tests:** `npm run test:rules` runs `firebase emulators:exec --only
  firestore` with Vitest and `@firebase/rules-unit-testing`. They cover every
  allow and deny case above.
- **Browser testing:** `npm run dev:cloud` starts the auth and firestore
  emulators plus Vite in emulator mode on port 5174. The auth emulator's fake
  Google popup makes the whole sign-in flow testable without a real project.

## Round 2: research-driven changes

These come from the hosting and privacy research of 2026-10-27, and they
override anything above that disagrees.

### Google popup must open inside the tap
Safari only allows a popup that opens synchronously in the click that asked for
it. So:
- **Firebase is loaded by `start()` at boot.** The facade exposes `ready`, a
  boolean that turns true once the SDK is loaded and the anonymous user exists.
  `onStatus` fires when it changes.
- **`linkGoogle()` calls `linkWithPopup` before any `await`.** If the facade
  isn't ready, it resolves `{ ok: false, error: 'not-ready' }` at once and never
  imports anything inside the tap.
- **The UI disables Google buttons until `ready`,** showing "One moment…".
- **Error codes:**
  - `auth/popup-blocked` asks the player to tap again.
  - `auth/popup-closed-by-user` and `auth/cancelled-popup-request` are silent.
  - `auth/unauthorized-domain` is a setup error, worded for the owner.
  - `auth/network-request-failed` reads as offline.

### Firestore Lite
Use `firebase/firestore/lite` (`getDoc`, `getDocs`, `setDoc`, `deleteDoc`,
`runTransaction`, `getCount`, `serverTimestamp`, `connectFirestoreEmulator`).
Nothing needs live listeners, and it saves about 110 KB gzipped. Auth stays
`firebase/auth`.

### Fewer writes
A push skips the `players/{uid}` write when the merged save equals the stored
one. Board spacing (the last write time) also survives an account switch, so a
quick sign-out and sign-in never trips the 5 s rule.

### Grown-ups gate for Google sign-in
Linking Google stores the parent's email, name and photo in Firebase
Authentication, so sign-in is for grown-ups:
- **Every "Sign in with Google" button** (title strip and account card) first
  opens an in-page gate: "For grown-ups: what is 7 × 8?". The numbers are random,
  a 2-digit times a 1-digit number, with a number input.
- **A right answer** turns the gate's button into "Continue to Google". Its click
  calls `cloud.linkGoogle()` synchronously, with no `await` before it.
- **A wrong answer** shows a gentle "Ask a grown-up to help" and a new question.
- **Once passed,** the gate stays open for 10 minutes in this tab.

### In-app browsers
Google blocks sign-in inside apps like Instagram, Facebook, TikTok, Snapchat
and Line. When the user agent shows one of those (or an Android WebView `wv`),
the Google buttons are replaced by: "To sign in with Google, open this game in
Safari or Chrome." Guest play and the leaderboard still work.

### Home Screen app on iPhone and iPad
(From the PWA research of 2026-10-27.) A game added to the iPhone / iPad Home
Screen keeps its own storage, apart from Safari: nothing but cookies is copied
when it is added, so the localStorage save and the Firebase session (IndexedDB)
start fresh, as a new anonymous player. Only a Google account carries progress
across. Inside such an app Firebase does not call `window.open`: it clicks a
link to the auth handler instead and gets no window back, so it can't tell when
the sheet is closed, and whether the result comes back on iOS 26 / 27 is
unproven (it reportedly worked with the default `*.firebaseapp.com`
`authDomain` on iOS 16.5; keep that `authDomain`).
- The Google button stays, and never stays busy: after `CLOUD_TIMEOUT_MS` it
  offers "Try again" (a second popup cancels the first silently).
- The account card says the app keeps its own save, that signing in here too
  brings a Google account's progress across, and to keep playing in Safari if
  signing in doesn't finish here. Safari's week-long note is left out there
  (Home Screen apps are exempt).
- **Before release, try it on a real iPhone and iPad** (Home Screen app, guest
  link and the "account already exists" switch). If the result never comes
  back, treat `pwa.separateAppStorage` like an in-app browser in screens.js:
  no Google button, and "On iPhone, Google sign-in doesn't work inside the Home
  Screen app yet. Your progress here is saved on this iPhone. To use your
  Google account, play Pip's hunt in Safari."

### Delete my data
The facade gains `deleteEverything()`, which resolves `{ ok, error? }`:
1. Delete the player's own `feedback` docs (a `where('uid', '==', uid)`
   query, 100 at a time) and `feedbackLimits/{uid}` (see "Feedback" below).
   If the deployed rules predate feedback, the query is refused; then no
   feedback can exist, so that refusal is not a failure.
2. Delete `leaderboard/{uid}` and `players/{uid}`.
3. Try `deleteUser` on the auth user. If that fails, for example
   `auth/requires-recent-login` on a Google user, sign out instead.
4. Replace the local save with a fresh one, keeping only sound settings and a
   new random name.
5. Sign in anonymously as a new uid.

A failure in steps 1–2 changes nothing on the device, so the player can try again.

The UI offers "Delete my saved data" with an in-page confirm, on both the
privacy screen and the account card.

### Privacy note screen
A new `privacy` screen opens from a "🔒 Privacy" link next to "Reset progress"
on the title, and from the account card. It uses short, plain sentences for
grown-ups:
- **Guests:** stored is a random player ID, the game progress and the snow
  name. No name, email or location.
- **Google sign-in:** Google Firebase also keeps the account's email, name and
  photo, so progress can follow you. Only grown-ups should do this.
- **Leaderboard:** shows only snow names made from our word lists, and scores.
- **Feedback:** if you send some, we keep the stars, topic, quick notes, any
  grown-up's note, the map number, device type (touch or keyboard), app
  version and the player ID, to improve the game. Only the game's maker reads
  it; other players never see it. (Feedback is one-way, so "no chat" stays true.)
- **Never:** no ads, no analytics, no tracking, no chat.
- **Where:** Google Cloud (Firebase).
- **How long:** until you delete it, or until saves unused for 2 years are
  cleared.
- **iPhone and iPad:** Safari may clear a guest's progress after about a week
  of not playing; sign in with Google to keep it.
- **To delete:** the "Delete my saved data" button (it deletes any feedback
  you sent too), or contact `PRIVACY_CONTACT`.

`PRIVACY_CONTACT` is a constant in `src/cloud/config.js`: an email address
(shown as a mailto: link) or a web page. It is currently the owner's email,
which they plan to change later.

### Storage
main.js calls `navigator.storage.persist()` once (best-effort) so browsers are
less likely to clear the save.

## Feedback

Players can tell the game's maker what they think. It is one-way: nobody else
ever sees it, so the privacy note's "no chat" stays true. The owner reads it
in the Firebase console (Firestore > `feedback`).

### Where it is offered
- **Title:** "⭐ Feedback" on the bottom line next to Reset progress, Privacy
  and Install (one line, so the title still fits a 700 px tall window).
- **Results:** a small "⭐ Feedback" link at the end of the page, so the
  footer keeps its buttons.
- Never during a night (or its pause menu), and not at all without a cloud
  (`!cloud.enabled` or no `sendFeedback`).
- **One per night:** after a send, both links read "Thanks! You can send more
  after your next night" until a night ends (results, or quit to title). The
  lock is in memory and in localStorage (`pips-hunt-feedback-sent`, guarded),
  so a reload keeps it. The rules' 10-minute limit below is the real guard.

### The card (src/ui/screens.js)
An in-page card over the title or results, in the game's style. The screen
underneath is `inert`, Tab and Shift+Tab go round the card, and Esc closes
an open grown-ups question first, then the card. It works with touch and at
375 px wide (the card scrolls inside its overlay when it is taller than the
window).
1. **Stars:** 1–5, a labelled native radio group (arrow keys work), required.
2. **What is it about?** Exactly one of Bug, Idea, Wardrobe/Cosmetics,
   Gameplay (`bug`, `idea`, `wardrobe`, `gameplay`), required.
3. **Quick notes:** up to 3 kid-safe chips, so children never need to type:
   Loved it!, Too hard, Too easy, Something broke, More clothes please, More
   jokes please (`loved`, `tooHard`, `tooEasy`, `broke`, `moreClothes`,
   `moreJokes`). The rest rest while 3 are picked.
4. **A note, for grown-ups only:** "For grown-ups: add a note" opens the
   same question as Google sign-in ("For grown-ups: what is A × B?", the
   shared `gateForm` / `checkGate`), and a right answer holds for the same 10
   minutes in this tab. Then a field (max 300 characters, live counter) says
   not to include names, addresses or contact details.

Send checks stars and topic first (a friendly "Please pick…" and focus on the
group). Success closes the card and shows a toast, "Thank you! Pip's elves are
reading it 🧝". A failure shows a friendly message in the card and keeps
everything picked or typed. The lists live in `src/cloud/feedback.js`
(`FEEDBACK_CATEGORIES`, `FEEDBACK_QUICK`), next to `cleanFeedback()`, which
the facade runs and the rules mirror.

### Data model

`feedback/{autoId}`: create only. The owner (game maker) reads it in the console.

```
{ uid: string,              // the signed-in Firebase uid (== request.auth.uid)
  rating: int 1..5,
  category: 'bug' | 'idea' | 'wardrobe' | 'gameplay',
  quick: [id],              // 0..3 of the quick-note ids, no duplicates
  comment: string,          // 0..300 characters, '' when no grown-up wrote one
  islandSeed: int | null,   // map number of the last night; null on the title before any
  deviceType: 'touch' | 'desktop',   // (pointer: coarse), or touch without hover
  appVersion: string,       // 1..40 chars: package version, plus "+<commit>" on the GitHub Pages build
  createdAt: <server timestamp> }
```

`feedbackLimits/{uid}`: `{ lastAt: <server timestamp>, lastId: <feedback doc id> }`.

`sendFeedback()` writes both in one batch. `appVersion` comes from Vite's
`define` (`__APP_VERSION__` in vite.config.js); main.js passes the map number
through `deps.getIslandSeed()`.

### Rules (firestore.rules)
- **Create:** signed in; exactly the keys above; `uid == request.auth.uid`;
  `rating` an int 1..5; `category` and every `quick` id from literal
  allow-lists, at most 3 quick ids with no duplicates; `comment` a string of
  at most 300 characters; `islandSeed` null or an int 0..999,999,999;
  `deviceType` 'touch' or 'desktop'; `appVersion` a string of 1..40
  characters; `createdAt == request.time`.
- **Rate limit:** the same batch must write `feedbackLimits/{uid}` with
  `lastAt == request.time` and `lastId` naming the feedback doc being created
  (checked with `existsAfter` / `getAfter`), and the stamp it replaces, if any
  (`get`), must be at least 10 minutes old. So a uid keeps at most one
  feedback doc per 10 minutes (sending sooner means deleting the last one
  and its stamp first; see below).
- **feedbackLimits/{uid}:** the owner may get it, and delete it only once
  the feedback doc its `lastId` names is gone (or when there is no stamp).
  Otherwise a script could delete the stamp and send again at once, as often
  as it liked; this way every early send costs the one before it, so they
  can't pile up. "Delete my saved data" deletes the feedback docs first, then
  the stamp. It can only be created or updated in that batch: exactly
  `lastAt` and `lastId`, `lastAt == request.time`, and `lastId` must be a
  feedback doc this batch creates for this uid. Nobody can wind it back by
  writing it alone.
- **Reading:** no get, ever. A player may list (a `where('uid', '==', uid)`
  query) and delete only their own docs, which "Delete my saved data" needs.
  Nobody else's can be read or listed. No updates.

A new anonymous uid can send again at once, so the limit slows a determined
spammer down rather than stopping one; only server code (Cloud Functions on
the paid plan, or App Check) could do more.

### Facade errors
`sendFeedback()` runs in turn with account changes (so a send can't land
under a uid "Delete my saved data" is leaving), then:
- `'invalid'`: `cleanFeedback()` refused the payload; nothing is sent.
- `'too-soon'`: this tab sent one under this uid less than 10 minutes ago
  (answered without a write), or the rules refused the batch and
  `feedbackLimits/{uid}` shows a send in the last 10 minutes (another tab,
  device or a reload).
- `'offline'`: Firebase isn't ready or the network failed.
- Anything else (such as `permission-denied` with no recent stamp: the
  deployed rules predate feedback) is passed on as its code.

**Deploy order:** deploy firestore.rules before the client that sends
feedback, or every send is refused.

### Tests
`test/feedback.test.js` (the pure helpers), `test/cloud.test.js` (the facade
with a fake SDK: the batch, every error, delete), `test/rules.test.js` (every
allow and deny case above) and `test/cloud.integration.test.js` (send,
too-soon, delete and the account switch on the emulators).
