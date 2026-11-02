# Google Play release: Pip's Christmas Eve Hunt

The Android app is a **Trusted Web Activity (TWA)**: a small Android wrapper,
made with Bubblewrap 1.27.0, that opens
https://godwin20.github.io/Pip-s-Christmas-Eve-Hunt/ full screen in Chrome,
with no address bar. The game stays the web game. This folder is everything
else Google Play needs, as a checklist through to production. Phases 1 to 4
are done.

| File | What it is |
|---|---|
| `README.md` | This checklist, the Bubblewrap answer sheet, and how later releases work |
| `data-safety.md` | Every answer for the Data safety form |
| `content-rating.md` | The IARC questionnaire, target audience, and the other App content declarations |
| `testers.md` | The closed test: paid testers through PrimeTestLab, the Google Group route for friends and family, the invitation, what testers check |
| `user-site/` | The files for the new `godwin20/godwin20.github.io` repo (the `assetlinks.json` that removes the address bar) |
| `store/` | Store listing texts and graphics |

**Who does what.** **OWNER** is you: accounts, payment, ID, the keystore and
its passwords, every Play Console click, and pushing to GitHub. **ASSISTANT**
is Claude: code and docs in this repo. Claude never creates accounts,
handles keystores or passwords, runs Bubblewrap's `init`/`build`, or touches
the real Firebase project.

## The fixed choices

| | |
|---|---|
| Package name (application ID) | `io.github.godwin20.pipshunt`. Permanent from **Create app**. |
| App name / name under the icon | Pip's Christmas Eve Hunt / Pip's Hunt |
| Origin the app trusts | `https://godwin20.github.io` (the whole origin) |
| Start URL | `/Pip-s-Christmas-Eve-Hunt/` |
| Display mode | `standalone` (why: step 2.2) |
| Orientation | `any`, like the web manifest |
| Colours | status bar `#1B2450`, splash and navigation bar `#0F1533` |
| Android versions | minSdkVersion 24 (Android 7.0); target API 36 (Bubblewrap 1.27.0's template), which Play requires for new apps since 31 August 2026 |
| Notifications, Play Billing, location | off, none, none |
| When the phone's browser can't run a TWA | `customtabs` (a normal browser tab) |
| Audience | Mixed, "designed for everyone, including children", so the **Families policy** applies |
| Developer account | Personal |

## Read first: the one real risk

When you run `bubblewrap init`, it prints a yellow WARNING that Trusted Web
Activities are currently incompatible with apps targeting children under 13,
with a link to the Play for Families policies. It has been in Bubblewrap
since 2021 and is still in 1.27.0.

The maintainers' reason is a Families policy rule. Today's text says an app
for children "must not merely provide a webview of a website", and the same
sentence goes on to mention affiliate traffic and the website owner's or
administrator's permission. It isn't clear whether the permission wording
covers webviews or only the affiliate traffic. Pip's hunt is a full game: it
installs, plays offline after the first launch, has no browser bar, and the
site is ours. That's a good case that it isn't "merely" a website, but a
reviewer may still reject it.

**When we find out:** at the review of the first closed-testing release
(by about 11–13 November), because that review covers the target audience.
That is early enough to change plan.

**Making a rejection less likely:**

- The store listing and screenshots show gameplay, and the description calls
  it a game. Never "website" or "web app".
- The app opens straight into the game, works offline after its first launch,
  and never sends players out to the open web (the privacy pages are on our
  own site; the privacy contact opens the email app).
- In "Apply for production", describe what the game does (Phase 7).

**If it is rejected anyway:**

1. Appeal from the rejection email or Play Console's policy status page:
   it's a complete offline-capable game, verified with Digital Asset Links.
   We own and administer the site, and the policy's wording is about use
   without the owner's permission.
2. Plan B (ASSISTANT, several days): ship the built game inside the app
   (for example with Capacitor), so it runs from files in the APK instead of
   from a website. Google blocks its sign-in inside embedded WebViews, so
   that build would need a native Google sign-in plugin, or no Google
   sign-in at all.
3. Don't "fix" it by taking children out of the target audience. The game is
   plainly for kids, and Google judges the audience by the app's imagery too.

## Timeline

Christmas is Friday 25 December. The web game is already live, so the Play
app is a bonus, not a blocker.

| When | Step | Who |
|---|---|---|
| Done | Phases 1 to 4: Play Console account, Bubblewrap build, keystore backup, the user-site repo, the app, the internal test, Play's fingerprints | OWNER |
| Done, Sun 1 Nov | Phase 5: store listing and App content. Closed release sent for review | OWNER |
| By about Sun 8 Nov | Closed release approved (new accounts: up to 7 days, sometimes more). Buy the testers that day, add them, send the opt-in link (`testers.md`) | OWNER, testers |
| By Fri 13 Nov | 12th tester opted in. Note the date | OWNER, testers |
| About Mon 16 Nov, at least 7 days before you apply | Version 2: Firestore rules, web release, then a version 2 bundle on the closed track (`testers.md`, section 5) | OWNER |
| About Fri 20 Nov | The check a week in: opted-in testers, active devices, feedback | OWNER |
| About Mon 23 Nov, once version 2's review has finished | Version 3: fixes for what testers reported, on the website, then a version 3 bundle on the closed track | OWNER |
| Opt-in date + 14 days, Fri 27 Nov at the latest | Phase 7: apply for production (review usually 7 days or less) | OWNER |
| By Fri 4 Dec | Production access granted. Phase 8: production release, sent for review | OWNER |
| By Fri 11 Dec | Live on Google Play, which leaves 14 days for one rejection | |

**Latest safe dates:** send the closed release for review by **Fri 6 Nov**
(aim for Wed 4 Nov, so testers have two days to opt in), 12th tester opted in
by **Fri 13 Nov**, send the version 2 bundle by **Fri 20 Nov** and version 3 by
**Wed 25 Nov**, apply for production by **Fri 27 Nov**, send the production
release for review by **Fri 4 Dec**, live by **Fri 11 Dec**. That leaves 14 days
for one rejection. If version 3 is still in review on Fri 27 Nov, wait for it,
which takes those days off the 14 (`testers.md`, section 5).

**Absolute last dates, with no room to slip:** send the closed release Thu 19
Nov, 12th tester Thu 26 Nov, version 2 bundle Thu 3 Dec, version 3 only if that
review ends in time, apply Thu 10 Dec, send the production release Thu 17 Dec,
live Thu 24 Dec.

## Costs

- **US$25**, once, for the Google Play developer account (credit or debit
  card in your legal name; Google doesn't take prepaid cards).
- **About US$28**, once, for 25 testers from PrimeTestLab: the plan is listed
  at US$27.99, plus a service fee the page describes unclearly, so check the
  total at checkout (`testers.md`).
- Everything else here is free: Bubblewrap, the JDK and Android SDK it
  downloads, GitHub Pages, Firebase Spark, Google Groups. A free app needs no
  merchant account.
- You need an **Android phone, Android 10 or later, not rooted**, for Google's
  device verification and for testing, and a few GB of disk in your home
  folder for the JDK, SDK and Gradle.

## What Google Play shows about you

For a personal account, Google verifies and then **shows on the store
listing**:

- your **legal name** (as on your ID);
- your **country** (from your legal address; the address itself is shown
  only if you declare as a trader);
- your **developer email address**, public, for anyone to write to;
- optionally a website.

Your contact email and phone for Google stay private if you declare as a
**non-trader**. If you declare as a **trader**, a personal account must show a
phone number, and your address is shown publicly too (Phase 5, step 4).

**The public email address** is the game's `PRIVACY_CONTACT`
(`src/cloud/config.js`): PipsChristmasEveHunt@proton.me. Use the same address for the
app's support email (Store settings), the IARC rating email and the testers'
feedback address, so everything agrees. The only way to avoid showing your
legal name is an organisation account, which needs a registered organisation
and a D-U-N-S number: not worth it here.

## Phase 0: the game side, before testers see it

- [x] **Delete for Google players (tested).** When Firebase says
      `auth/requires-recent-login`, the game asks a grown-up to "Confirm with
      Google", so the Firebase Authentication record (email, name, photo, Google
      account ID) really goes, instead of only signing out. Tested in the Play
      app on 1 November 2026 with a throwaway test Google account: it ended
      with "All deleted". Play's account deletion rule and the Data safety
      answers depend on it.
- [ ] **Privacy and delete pages (live).** `public/privacy.html` and
      `public/delete-data.html` are at
      https://godwin20.github.io/Pip-s-Christmas-Eve-Hunt/privacy.html and
      `.../delete-data.html`, with the in-game Privacy screen linking to the
      policy (Play wants it linked in the app too). The working tree has newer
      wording, including the "Delete only some of it" part at
      `delete-data.html#some`, which the Data safety answers need. Check it
      shows on the live page before you fill in the form.
- [ ] **Retention (OWNER).** The privacy text now says the game's maker *may*
      clear saves, leaderboard entries and sign-ins unused for 2 years by
      hand (Firestore's automatic TTL needs the paid plan). It's a "may", so
      nothing is promised; if you'd like to do it, ASSISTANT can write a
      script you run once a year.
- [x] **PRIVACY_CONTACT (OWNER decision).** PipsChristmasEveHunt@proton.me, live
      on the game and both policy pages since 1 November 2026.
- [x] **Neutral age screen (live).** For
      mixed-audience apps the Families policy allows services that aren't
      approved for children (here: Google sign-in) only behind a *neutral age
      screen*, or used in a way that collects no data from children. The
      times-table question is gone: every "Sign in with Google" and the
      grown-ups' feedback note now ask "When were you born?", with a month
      and a year that both start blank, the full range of years, no hint of
      which answers pass, and no going back to try another year (a "not now"
      shows only "Ask a grown-up to help you with this one." for 24 hours on
      that device, through reloads and reopening). 18 or over passes. The
      month and year are checked on the device and never stored or sent, so
      they are not declared in the Data safety form (see
      `data-safety.md`); the privacy facts say so in one line. Details in
      `docs/CLOUD.md`, "Grown-ups gate for Google sign-in". I couldn't confirm
      from a Google page whether Google treats its own sign-in through
      Firebase as "not approved for child-directed services"; either way the
      gate now matches the policy's own words. If a grown-up on a shared
      device gets the "not now" by mistake, clearing the browser's data for
      the game and reloading brings the question back (there is
      deliberately no in-game way round it).

## Phase 1: the Play Console account (OWNER)

1. Choose the public email address (see "What Google Play shows about you").
2. Sign up at https://play.google.com/console/signup with the Google account
   that will own the app (you must be 18 or over). Accept the Developer
   Distribution Agreement.
3. Choose **Personal**. Pay the US$25.
4. Verify your identity: a government ID, and a Google payments profile in
   your legal name. Verify the developer email (public) and your contact
   email and phone (private) with the codes Google sends.
5. Device verification: install the **Play Console** app on your Android
   phone. In Play Console on the web, Home > **Verify that you have access to
   an Android mobile device** > View details, scan the QR code, sign in as the
   account owner and tap Verify.
6. Wait for Google to finish the identity check. Carry on with Phases 2 and 3
   meanwhile.
7. **Trader status:** new accounts should declare it straight away. If you
   haven't yet, do it now: Phase 5, step 4 has the path and what it means.

## Phase 2: build the Android app with Bubblewrap (OWNER, in your own terminal)

The Android project lives **outside this repo**, in `~/pips-hunt-android`:
the repo's path has a space ("Christmas Game"), which Android builds handle
badly, and the project and its keystore must never be committed with the
game.

Everything below comes from Bubblewrap 1.27.0's own help and source (checked
30 October), and the defaults are what it reads from the live web manifest.

### 2.1 Make the folder and check the tools

```bash
mkdir -p ~/pips-hunt-android
cd ~/pips-hunt-android
npx --yes @bubblewrap/cli@1.27.0 doctor
```

On a fresh machine **any** Bubblewrap command (even `help`) first sets up its
tools and asks:

| Prompt | Answer |
|---|---|
| Do you want Bubblewrap to install the JDK (recommended)? (Enter "No" to use your own JDK 17 installation) | **Y**. It downloads Temurin JDK 17.0.11 to `~/.bubblewrap/jdk`. Bubblewrap needs exactly JDK 17; your system Java is 25. |
| Do you want Bubblewrap to install the Android SDK (recommended)? | **Y**. It goes to `~/.bubblewrap/android_sdk`. |
| Do you agree to the Android SDK terms and conditions at https://developer.android.com/studio/terms.html? | Read them; **y** to go on. |

`doctor` should end with **"Your jdkpath and androidSdkPath are valid."** The
paths are saved in `~/.bubblewrap/config.json`.

**If it just stops after the JDK download, with no error:** on Node 24
Bubblewrap quits silently while unzipping the JDK. Set the tools up by hand
instead: unpack the Temurin 17.0.11+9 Linux x64 JDK into `~/.bubblewrap/jdk`
and `commandlinetools-linux-6609375_latest.zip` into
`~/.bubblewrap/android_sdk`, then write both paths to
`~/.bubblewrap/config.json` as `jdkPath` and `androidSdkPath`. The questions
above are then skipped, and the first `build` shows the SDK licence instead,
ending in `Accept? (y/N):`.

### 2.2 Create the project: `init`

```bash
cd ~/pips-hunt-android
npx --yes @bubblewrap/cli@1.27.0 init --manifest=https://godwin20.github.io/Pip-s-Christmas-Eve-Hunt/manifest.webmanifest
```

It prints the Families warning from "Read first", then asks:

| Section | Prompt | Default it offers | Your answer |
|---|---|---|---|
| Web app details (1/5) | Domain: | `godwin20.github.io` | Enter (keep) |
| | URL path: | `/Pip-s-Christmas-Eve-Hunt/` | Enter (keep, with both slashes) |
| Android app details (2/5) | Application name: | `Pip's Christmas Eve Hunt` | Enter (50 characters at most) |
| | Short name: | `Pip's Hunt` | Enter (12 at most; shown under the icon) |
| | Application ID: | `io.github.godwin20.twa` | **Type `io.github.godwin20.pipshunt`**. It is permanent from **Create app** in Phase 4. |
| | Starting version code for the new app version: | `1` | Enter |
| | Display mode: | `standalone` | **standalone** (see below) |
| | Orientation: | `any` | **any** |
| | Status bar color: | `#1B2450` | Enter |
| Launcher icons and splash screen (3/5) | Splash screen color: | `#0F1533` | Enter |
| | Icon URL: | `https://godwin20.github.io/Pip-s-Christmas-Eve-Hunt/icons/icon-512.png` | Enter |
| | Maskable icon URL: | `https://godwin20.github.io/Pip-s-Christmas-Eve-Hunt/icons/icon-maskable-512.png` | Enter |
| Optional Features (4/5) | (Include app shortcuts? is skipped: the manifest has no shortcuts) | | |
| | Monochrome icon URL: | empty | Enter (it's only for notifications, which stay off) |
| | Include support for Play Billing? | No | **N** |
| | Request geolocation permission? | No | **N** |
| Signing key information (5/5) | Key store location: | `/home/keith/pips-hunt-android/android.keystore` | Enter |
| | Key name: | `android` | Enter (the key's alias) |

It generates the Android project, then makes your **upload key**:

| Prompt | Your answer |
|---|---|
| Do you want to create one now? | **Y** |
| First and Last names (eg: John Doe): | your name. It goes into the upload certificate, which only Google sees: Play re-signs the app players get with Google's own key. |
| Organizational Unit (eg: Engineering Dept): | anything, for example `Games` |
| Organization (eg: Company Name): | for example `godwin20` |
| Country (2 letter code): | your country, for example `GB` |
| Password for the Key Store: | **you type it**: at least 6 characters, nothing shows while you type |
| Password for the Key: | **type the same password again** |

Use the same password twice: JDK 17's keytool makes a PKCS12 keystore, which
has one password for both; it ignores a different second one with a warning,
and builds then fail when you type that second one back.

It ends with "Project generated successfully. Build it by running bubblewrap
build".

**Why `standalone`, not `fullscreen`.** `fullscreen` hides Android's status
and navigation bars, which can suit games. For Pip's hunt `standalone` is the
better first release:

- the menus and HUD are laid out and tested for `standalone` (the web
  manifest and the installed web app use it, and `viewport-fit=cover` already
  lets the night sky run under the bars);
- with the bars hidden, a swipe from the screen edge is taken by Android to
  bring them back; the touch controls start with a drag on the left side, so
  small fingers near the edge would keep popping bars up instead of
  waddling;
- children keep a visible, predictable way back and home;
- the dark blue status bar (`#1B2450`) matches the night sky, so little is
  lost.

Changing it later only needs a new Android build, so `fullscreen-sticky` can
be tried in an internal test after launch.

### 2.3 Edit `twa-manifest.json`

Open `~/pips-hunt-android/twa-manifest.json` and change these fields:

| Field | `init` wrote | Set it to | Why |
|---|---|---|---|
| `enableNotifications` | `true` | `false` | The game sends no notifications. With `false` the app asks players for no permissions (Bubblewrap only adds `POST_NOTIFICATIONS` when it's `true`). |
| `fallbackType` | `"customtabs"` | keep `"customtabs"` | If the phone's browser can't run a TWA, the game opens in a normal browser tab, where Google sign-in works. `"webview"` would add the `INTERNET` permission and run the game in a WebView, where Google blocks sign-in (and the game hides the button there). |
| `minSdkVersion` | `21` | `24` | The game is built for Chrome 111 and newer (Vite 8's default target), and Chrome 107 and later don't run on Android 6 or older, so the game could never start there. 24 is Android 7.0. |
| `themeColorDark` | `"#000000"` | `"#1B2450"` | The status bar colour when the phone is in dark mode; otherwise it turns black. |
| `navigationColor`, `navigationColorDark` | `"#000000"` | `"#0F1533"` | Optional: the bottom bar matches the night sky. |

Leave the rest as `init` wrote it, and check: `packageId` is
`io.github.godwin20.pipshunt`, `host` is `godwin20.github.io`, `startUrl` is
`/Pip-s-Christmas-Eve-Hunt/`, `display` is `standalone`, `orientation` is
`any`, `features` is `{}` (no `playBilling`, no `locationDelegation`),
`shortcuts` is `[]`, `appVersionCode` is `1`, and `signingKey` is
`{ "path": "/home/keith/pips-hunt-android/android.keystore", "alias": "android" }`.
It's JSON: double quotes, no trailing commas.

Then rebuild the Android project from it, keeping version 1:

```bash
cd ~/pips-hunt-android
npx --yes @bubblewrap/cli@1.27.0 update --skipVersionUpgrade
```

### 2.4 Build

```bash
cd ~/pips-hunt-android
npx --yes @bubblewrap/cli@1.27.0 build
```

- The first build installs Android build-tools 36.1.0; accept the licence if
  it asks. Gradle then downloads its own parts, which takes a few minutes.
- It asks for the keystore password and the key password: the same one.
  (Bubblewrap can read them from `BUBBLEWRAP_KEYSTORE_PASSWORD` and
  `BUBBLEWRAP_KEY_PASSWORD`, but don't put them in your shell profile.)
- It makes **`app-release-bundle.aab`** (this is what you upload to Play) and
  `app-release-signed.apk` (to install by USB yourself:
  `npx --yes @bubblewrap/cli@1.27.0 install`, with USB debugging on; optional).
- If a build asks "There are changes in twa-manifest.json. Would you like to
  apply them to the project before building?": **Yes** rebuilds the project
  and raises the version code by one, which is what any new upload needs;
  **No** builds the old project.

### 2.5 Back up the keystore and its password

Every future update must be signed with this same upload key.

- Put the password in your password manager now.
- Copy `~/pips-hunt-android/android.keystore` (and `twa-manifest.json`) to two
  places off this laptop: for example as an attachment on the password
  manager entry, and an encrypted USB stick. Check the copies match:

  ```bash
  sha256sum ~/pips-hunt-android/android.keystore /path/to/backup/android.keystore
  ```

- Never commit it: not to the game repo, not to `godwin20.github.io`, not
  anywhere public.
- If it's ever lost, you aren't locked out: Google holds the app signing key,
  so Play Console's app signing page lets you request an **upload key
  reset**. It takes some days.

### 2.6 Your upload key's fingerprint

```bash
keytool -printcert -jarfile ~/pips-hunt-android/app-release-bundle.aab
```

(Your system `keytool` from JDK 25 reads it fine, or use
`~/.bubblewrap/jdk/jdk-17.0.11+9/bin/keytool`.) It reads the signed bundle, so
it needs no password. Copy the value on the line starting **`SHA256:`**: 32
pairs like `AB:CD:...`. Then:

```bash
cd ~/pips-hunt-android
npx --yes @bubblewrap/cli@1.27.0 fingerprint add <SHA256 value> --name=upload
```

That stores it in `twa-manifest.json` and writes `./assetlinks.json`. Every
`fingerprint add` rewrites that file with all fingerprints so far;
`fingerprint list` shows them, and `fingerprint generateAssetLinks` writes the
file again.

## Phase 3: the user site, for the address bar (OWNER)

Follow `user-site/README.md`: make the public repo `godwin20.github.io`
(as godwin20), copy in `user-site/`, put the fingerprints in
`.well-known/assetlinks.json` (or copy Bubblewrap's `assetlinks.json` over
it), turn on Pages from `main` / root, and check it with curl. **Never give
that site a custom domain.** You can publish it now with only the upload key,
and add Play's keys in Phase 4.

## Phase 4: create the app and test it yourself (OWNER)

1. **Play Console > Create app.** App name: Pip's Christmas Eve Hunt; default
   language: yours (for example English (United Kingdom)); App or game:
   **Game**; Free or paid: **Free** (Play doesn't let a free app become paid
   later, which is fine here); package name: `io.github.godwin20.pipshunt`
   (permanent from this step: package names can't be changed, deleted or
   reused); contact email: the address players should use; accept the
   declarations, including the Play App Signing terms of service. Then check
   that Play Console Home shows no package or developer verification warning.
2. **Internal test.** Test and release > Testing > **Internal testing**:
   on the Testers tab make an email list with just your own Google account;
   then **Create new release**, upload `app-release-bundle.aab`, release name
   for example "1 (first test)", Save, review and roll out. New apps are
   signed by Google automatically (Play App Signing, with Google-made keys).
3. **Play's fingerprints.** **Protected with Play > Play Store protection >
   Manage Play app signing** (older menus: Test and release > App integrity >
   App signing). Under **App signing key certificate**, copy every SHA-256
   fingerprint: new apps get "quantum-ready hybrid signing", which uses three
   keys, so there may be three. Add each one:

   ```bash
   cd ~/pips-hunt-android
   npx --yes @bubblewrap/cli@1.27.0 fingerprint add <SHA256> --name=play-1
   npx --yes @bubblewrap/cli@1.27.0 fingerprint add <SHA256> --name=play-2
   npx --yes @bubblewrap/cli@1.27.0 fingerprint add <SHA256> --name=play-3
   ```

   Copy the new `assetlinks.json` into the user-site repo as
   `.well-known/assetlinks.json`, push, and check with curl. I couldn't
   confirm which of the three keys Chrome checks on which Android version;
   listing all of them, plus your upload key, covers every case.
4. **Try it.** On your phone, open the internal test's opt-in link (Testers
   tab), accept, and install from Play. You should see the dark blue splash,
   then the game with **no address bar**. If there is one, the fingerprints
   or the file are wrong: fix, push, check with curl, then uninstall and
   reinstall the app.
5. **Run the tester checks on your phone first** (`testers.md`, section 4).
   **Google sign-in inside the app** worked on the first phone tried (1
   November 2026). If it doesn't finish on another phone, tell ASSISTANT:
   the game can spot that it's running in the Play app
   (`document.referrer` starts with `android-app://io.github.godwin20.pipshunt`)
   and use a redirect sign-in there, or show "sign in on the website"
   instead.
6. Check the bundle's permissions in Play Console (**App bundle explorer**;
   newer menus call the page **Latest releases and bundles**). The only entry
   should be `io.github.godwin20.pipshunt.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`,
   an internal permission that players never see a prompt for. Anything else,
   such as `INTERNET` or `POST_NOTIFICATIONS`, is a problem: fix it before you
   send anything for review. And never send further changes while a review is
   running: a change sent during a review can push the app to the back of the
   queue, and Google counts the review time from the last change.
7. **Before you join the closed test yourself, leave the internal test**
   (opted-in internal testers can't get the closed test).

## Phase 5: store listing, App content, closed release (OWNER)

Finish Phase 0 first: the Data safety answers depend on it.

1. **Main store listing:** Grow users > Store presence > **Store listings**:
   texts and graphics from `store/`.
2. **Store settings:** Grow users > Store presence > **Store settings**:
   category Game, with the genre `store/` suggests (or the closest one, for
   example Casual); contact email: the public address; website (optional):
   https://godwin20.github.io/Pip-s-Christmas-Eve-Hunt/ (as in
   `store/listing.md`; the user site's https://godwin20.github.io/ works too).
3. **App content** (Monitor and improve > Policy and programs > App content),
   in this order: Privacy policy, Ads, Sign-in details, Target audience and
   content, Content rating (all in `content-rating.md`), Data safety
   (`data-safety.md`), then Advertising ID, Government apps, Financial
   features, Health apps, News apps (end of `content-rating.md`).
4. **Trader status:** Play Console > **Manage account > Account details >
   About you**, and follow the prompts. Every developer account has to declare
   this for European Economic Area and UK law, free apps included. New
   accounts should do it straight away, and existing ones have until 1
   February 2027, so make sure it's done before you send for review. It is
   your own legal declaration, so only you can make it.
   - Google says a personal hobby is "unlikely" to make you a trader. A free
     game with no ads and no purchases, made as a personal hobby, points to
     **non-trader**.
   - Rethink it if the game is connected to a business, or if it ever earns
     money. You can change the status later. Stating it falsely can lead to
     removal of the app or suspension of the account.
   - **Non-trader** means users in the European Economic Area and the UK are
     told that consumer-protection rights don't apply to contracts with you.
   - **Trader** on a personal account means your phone number and address are
     shown publicly on Google Play, and you confirm the status for each app
     in App content.
5. **Countries / regions:** Test and release > Testing > Closed testing >
   Manage track > **Countries / regions**. Click **Unsync** if the list can't
   be edited. Choose **all countries except Brazil and Vietnam** for now, and
   do it before you send for review. Keep the UK and every EU country.
   - Why not those two: Google lists duties there that may touch this game.
     Brazil's law expects apps likely to be used by children to take in
     age-range data from app stores, and this build doesn't. Vietnam asks for
     licence documents for online games, and this game has a leaderboard and
     cloud saves. Whether they apply isn't settled, so add those countries
     later only if you decide those laws are met.
   - Each tester's Play account country decides whether they can get the
     test, so a tester in Brazil or Vietnam can't install it (`testers.md`).
6. **Closed test:** Test and release > Testing > **Closed testing > Manage
   track**. On the **Testers** tab, create an email list with just your own
   address for now (`testers.md`), enter your public email under **Feedback
   URL or email address**, then **Create new release** with the same
   bundle from the library (or a newer one). Don't buy testers yet.
7. **Publishing overview > Send changes for review.** New accounts can wait
   up to 7 days, sometimes more. Google counts that time from the last change
   you submitted, and a change sent during a review can push the app to the
   back of the queue. So after you send, don't send any more changes for
   review until this one finishes.

## Phase 6: the closed test, 14 days (OWNER)

As soon as the closed release is approved, buy the testers from PrimeTestLab,
paste their emails into the closed test's email list and give PrimeTestLab
the opt-in link. Friends and family can join too. All in `testers.md`.

The 14 days are counted from the day the 12th tester opts in. Apply no earlier
than that date + 14: for example, opted in Fri 13 Nov, apply Fri 27 Nov. Keep
12 or more opted in the whole time, and keep everyone in until production
access is approved.

Along the way, send version 2 and version 3 to the closed track and check how
the test is going a week in (`testers.md`, section 5).

## Phase 7: apply for production (OWNER)

Dashboard > **Apply for production**, three parts. Your answers are not shown
publicly. Google asks how easy recruiting was and how testers used the app, so
answer truthfully. PrimeTestLab offers ready-made answers for this form: use
them as ideas at most, and write what really happened. Ideas to start from
(use your real experience):

- **About your closed test:** how easy it was to recruit testers (you used a
  paid service, so say so; the Google pages checked here don't mention paid
  testers either way);
  whether they used every feature (nights, crackers, presents, upgrades, the
  joke gallery, Google sign-in, offline play, feedback, candy, pets, baubles
  and the Wardrobe tree) and played as real players would, going by what they
  actually reported; the advent calendar stays hidden until 1 December, so say
  testers couldn't reach it; a summary of the
  feedback and how you collected it (the in-game Feedback button into
  Firebase, Play's testing feedback, email, any report from PrimeTestLab),
  saying what a tester reported, when, and what changed because of it, not
  just the topics.
- **About your app/game:** the audience (families: children from about 6
  playing with their parents, and grown-ups); what makes it unique (a new
  seeded snowy island every night, 102 jokes and Santa's notes with
  read-aloud, 12 surprise presents, Santa's Workshop upgrades, pets to feed,
  baubles for your own tree, an advent calendar, offline play, and kid-safe by
  design: no ads, no chat, nothing to buy); an honest
  first-year install estimate.
- **About your production readiness:** what you changed because of the test,
  and how you decided it was ready (the checks in `testers.md` pass on
  several phones, no open crashes). Mention both updates, but count only what
  testers' reports led to, in version 3 and any web fixes, as changes from the
  test: version 2's new features were planned before it started.

Review usually takes 7 days or less; the answer comes by email. If Google
asks for more testing, keep the testers in, encourage more play, ask
PrimeTestLab about the retest its site offers, and apply again.

## Phase 8: the production release (OWNER)

First check the countries: Test and release > Production > **Countries /
regions**, and confirm the same list is set (all except Brazil and Vietnam).
A first production release reaches only the selected countries. Google says
this page opens only after production access is approved, so you can't check
it sooner.

Then Test and release > **Production > Create new release**, add the bundle the
testers used (or a newer one), write release notes, Save, and send for review
from Publishing overview. If you want to choose the moment it goes live, turn
on managed publishing first (Publishing overview) and press Publish yourself
after approval. Once it's live: install from Play on a phone that never had
the test, and check the listing shows the Data safety section and the rating.

## Later releases

**Game changes (code, jokes, fixes) are web deploys.** Push to `main`; GitHub
Pages publishes; the Play app picks up the new version exactly like the
website does (the menus offer "Refresh"). No new bundle, no Play review.
Play's policies still cover what the app does, though: **before** a web
change that changes what data is kept, adds anything users can share with
each other, ads, purchases, or new kinds of content, update the Data safety
form, the content rating, the target audience and the privacy policy.

The only game changes that also get a bundle are the two mid-test releases
(`testers.md`, section 5), so that Play Console shows them.

**When you add jokes or features later:**

- **New jokes: raise the cap first.** `firestore.rules` caps `jokesFound` at
  102, so raise it and deploy the rules with the new jokes. `src/cloud/merge.js`
  has the same number (`BOARD_LIMITS.jokesFound`), so raise that too. The
  GitHub deploy doesn't publish the rules, so deploy them yourself, before the
  web deploy.
- **Update the counts in the listing.** `store/listing.md` gives the number of
  jokes in the full description and the release notes, and the surprises,
  upgrades and rewards too. Update the Play Console texts and the character
  counts to match, and "102 jokes" in Phase 7 above.
- **Add new features to the listing, after Google's review.** Once the app is
  through Google's review, add features that came later (candy and pets, baubles
  and your tree, the advent calendar) to the feature list in `store/listing.md`
  and the Play Console, and keep to the character limits. Leave the listing alone
  while a review is running, so Google checks the text it was given.
- **A web deploy reaches the app with no Play review,** so nothing else will
  catch this. Whenever you add new content, read it against `content-rating.md`
  and retake the content rating if an answer changes. Whenever you add new
  data, update Data safety (`data-safety.md`) and the privacy pages, and do it
  before the web deploy goes out. Set "Last updated" to the release day in
  `public/privacy.html`, `public/delete-data.html` and `POLICY_UPDATED` in
  `src/ui/privacy-text.js`.

**Android-side changes need a new bundle:** the name, icon, colours, display
mode, orientation, minSdkVersion, a newer Bubblewrap template, or a higher
target API:

```bash
cd ~/pips-hunt-android
# edit twa-manifest.json if needed
npx --yes @bubblewrap/cli@<version> update    # also raises the version code by one
npx --yes @bubblewrap/cli@<version> build
```

Opt your own account back in to the internal test first (Phase 4, step 7 had
you leave it). Upload the new `app-release-bundle.aab` to the internal test,
check the build on your phone, then put the same bundle on production (on the
closed test instead, before production access). Same keystore, every time.

**The yearly target API rise.** Google raises the required target API every
year: since 31 August 2026 new apps and updates must target API 36
(extensions to 1 November 2026 were possible), and apps that fall behind stop
being offered to new users on newer Android versions. Bubblewrap 1.27.0
targets 36. Each summer, when Play Console warns you, pick the Bubblewrap
version whose template targets the new level, run its `update` and `build`,
and upload before the deadline.

**Store listing changes** (texts, screenshots) are edited in Play Console at
any time; they're reviewed too.

## If someone emails to delete their data (OWNER)

The policy promises this within 30 days, and a reply when it's done. A guest's
save can't be found by email, so point guests to the button in the game.

- [ ] Firebase console > Authentication: find the user by their email address
      and copy the uid.
- [ ] Firestore: delete `players/{uid}`, `leaderboard/{uid}`, every `feedback`
      document with that uid, and `feedbackLimits/{uid}`.
- [ ] Authentication: delete the user.
- [ ] Look again after an hour. Another device still signed in to that account
      can write `players/{uid}` and `leaderboard/{uid}` back for up to an hour,
      so delete anything that has come back.
- [ ] Reply to say it's done.

If they ask for just their feedback or a note to go, delete only that document
and reply.

## Troubleshooting

| Problem | Fix |
|---|---|
| An address bar shows at the top of the app | Digital Asset Links didn't verify: a fingerprint is missing or wrong, the file isn't at `https://godwin20.github.io/.well-known/assetlinks.json`, it isn't valid JSON, or the URL redirects. Check with the curl commands in `user-site/README.md`, then reinstall the app. |
| `doctor` says the JDK isn't supported | It's pointing at a JDK other than 17. `npx --yes @bubblewrap/cli@1.27.0 updateConfig --jdkPath ~/.bubblewrap/jdk/jdk-17.0.11+9` (if Bubblewrap installed it), or delete `~/.bubblewrap/config.json` and run `doctor` again to get the install questions. |
| Signing fails ("Cannot recover key", wrong password) | The key password typed at build differs from the keystore password. Type the keystore password both times. |
| Play: "Version code 1 has already been used" | Run `update` (it raises the version code), then `build`. |
| Play: the bundle is signed with the wrong key | You built with a different keystore. Use the backed-up `android.keystore`, or request an upload key reset. |
| Google sign-in doesn't finish inside the app | Phase 4, step 5. |

## Sources (checked on 30 October 2026, the last group on 1 November 2026)

- Bubblewrap 1.27.0: `npx --yes @bubblewrap/cli@1.27.0 help` and `help init`,
  and its source (the prompts, `twa-manifest.json` fields and defaults,
  permissions, the Families warning added in GoogleChromeLabs/bubblewrap
  issue #545 and PR #562).
- Get started with Play Console (US$25, 18+):
  https://support.google.com/googleplay/android-developer/answer/6112435
- Verify your developer identity information (what is shown publicly):
  https://support.google.com/googleplay/android-developer/answer/10841920
  and https://support.google.com/googleplay/android-developer/answer/14177239
- Device verification requirements:
  https://support.google.com/googleplay/android-developer/answer/14316361
- App testing requirements for new personal developer accounts (12 testers,
  14 days, Apply for production, review in 7 days or less):
  https://support.google.com/googleplay/android-developer/answer/14151465
- Set up an open, closed, or internal test:
  https://support.google.com/googleplay/android-developer/answer/9845334
- Target API level requirements:
  https://support.google.com/googleplay/android-developer/answer/11926878
- Use Play App Signing (upload key, hybrid signing with three keys, upload
  key reset):
  https://support.google.com/googleplay/android-developer/answer/9842756
- Google Play Families Policies:
  https://support.google.com/googleplay/android-developer/answer/9893335
- Manage target audience and app content settings:
  https://support.google.com/googleplay/android-developer/answer/9867159
- Prepare your app for review:
  https://support.google.com/googleplay/android-developer/answer/9859455
- Chrome's Android support: Chrome 106 was the last for Android 6 (Chromium
  developers' announcement), Chrome 119 the last for Android 7 (Chrome
  release notes).
- Trader status:
  https://support.google.com/googleplay/android-developer/answer/17594752
- Countries with their own legal duties (Brazil, Vietnam):
  https://support.google.com/googleplay/android-developer/answer/6223646
- Track sync and country targeting:
  https://support.google.com/googleplay/android-developer/answer/7550024
- Review times and changes during a review:
  https://support.google.com/googleplay/android-developer/answer/9859654
- Create app, and package names:
  https://support.google.com/googleplay/android-developer/answer/9859152

**Not confirmed:** how long Google's identity check takes; whether Firebase's
popup sign-in works inside a TWA on every phone (it worked on the first one
tried); which of Play's three signing keys Chrome checks; whether a TWA game
for children passes the Families "webview" rule today (Bubblewrap's warning
dates from 2021, and I found no newer Google statement either way); whether a
missing trader declaration stops Send for review by itself; what the Countries
/ regions tab shows before production access, and whether Unsync is needed
there; whether Brazil's and Vietnam's rules apply to this game; which Console
page shows the permission list; and whether reviews slow down in December (the
dates above use Google's normal 7 days).
