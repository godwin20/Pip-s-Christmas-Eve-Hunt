# Pip's Christmas Eve Hunt 🐧🎁

A cute 3D Christmas game in the browser. Pip the penguin waddles around a new
snowy island every night, pulling Christmas crackers for jokes and opening
presents full of surprises before morning comes.

**Play it online:** https://godwin20.github.io/Pip-s-Christmas-Eve-Hunt/

## Play locally

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

## Controls

| Key | Action |
|---|---|
| W A S D / arrows | Waddle |
| Space or Shift (hold) | Belly-slide |
| E / Enter / click | Pull a cracker, open a present, fly home at the sleigh |
| Mouse drag | Look around (wheel to zoom) |
| Tab | Peek at the Joke Gallery |
| Esc | Pause |

On touch screens: drag on the left side to move, drag on the right to look,
tap to open things, and use the on-screen Pause and Slide buttons.

## Install as an app

The game can be installed like an app: it opens full screen from the home
screen or desktop, and once it has loaded it plays offline too.

- **Android, or Chrome / Edge on a computer:** tap **📲 Install** at the bottom
  of the title screen (or use the browser's own install button).
- **iPhone and iPad:** in Safari, tap **📲 Add to Home Screen** at the bottom of
  the title screen for the steps (Share, then Add to Home Screen).

On iPhone and iPad the Home Screen app keeps its own save, apart from Safari,
so a guest starts fresh there. Sign in with Google (Leaderboard > Play on any
device) in Safari and in the app to bring progress across. Google sign-in
inside an iPhone Home Screen app is not yet tested on a real device (see
docs/CLOUD.md, "Home Screen app on iPhone and iPad"); if it doesn't finish
there, the app says to keep playing in Safari. Signing in, cloud
saves and the leaderboard need the internet; nights played offline are saved
on the device and sync later.

When a new version is published, the menus offer "A new version of Pip's hunt
is ready — Refresh" (never in the middle of a night).

How it works: `vite.config.js` sets up the web app manifest and a Workbox
service worker (vite-plugin-pwa) that precaches the built game, and
`src/core/pwa.js` handles updates and the install links. Firebase and Google
requests are never cached. The icons in `public/icons/` are drawn from the
menus' CSS Pip. The service worker only exists in production builds
(`npm run build`, `npm run preview`), not on `npm run dev`.

## What's in it

- **Crackers:** 102 jokes, cosy quotes and legendary *Santa's Secret Notes*, in common, rare and legendary crackers.
- **Presents:** 12 surprises, including a snow puppy, a reindeer ride, a snowball storm, a disco tree, a sneaky gremlin and a Santa flyover.
- **Randomiser and map generation:** every night is a new seeded island, with the map number shown on the results screen.
- **Radar:** shows nearby treats, and points the way when nothing is in range.
- **Santa's Workshop:** 9 upgrades with 3 levels each.
- **Present Milestones:** rewards at 10 / 25 / 50 / 75 / 100 / 150 / 200 presents, switched on and off in the Wardrobe.
- **Joke Gallery:** everything you've found, with read-aloud.

Progress is saved in the browser (localStorage). The menu font (Fredoka) is
bundled with the game, so it makes no requests to Google Fonts.

## Put it online

Every push to `main` rebuilds the game and publishes it to GitHub Pages (`.github/workflows/deploy.yml`). Players see the update within about 10 minutes: the game spots the new version when it starts or comes back into view (and hourly) and offers "Refresh" on its menus.

The build is a plain static site with relative paths, so it also runs from any other web host or sub-folder.

```bash
npm run zip
```

This builds the game and makes `pips-christmas-eve-hunt.zip`, with `index.html` at the top. Drop the zip (or the `dist` folder) onto a static host such as Cloudflare Pages (Workers & Pages > Create application > Pages > Drag and drop your files). Hosts that run the game as a normal page keep saves working. itch.io runs games in a cross-site frame, so iPhone and iPad players are likely to lose their saves there.

## Cloud saves and leaderboard

Players start as guests, and grown-ups can sign in with Google so progress
follows them to any device. A leaderboard ranks snow names such as
"Jolly Penguin 42". It runs on Firebase's free plan (Authentication and
Firestore Lite). "⭐ Feedback" on the title and results screens sends stars, a
topic and kid-safe quick notes (plus a note only grown-ups can add) to the
`feedback` collection, which you read in the Firebase console.
`docs/CLOUD.md` has the design, and `src/cloud/config.js` holds the project
config. Until a config is added, the game runs as before, saving on the
device only.

```bash
npm run dev:cloud
```

This runs the game on http://localhost:5174 against local Firebase emulators,
so no real project is needed (Java 21+ required).

```bash
npm test
```

```bash
npm run test:rules
```

```bash
npm run test:cloud
```

These are the unit tests, the security rules tests (emulator) and the sync
tests against the emulators.

## Testing shortcuts

While `npm run dev` or `npm run dev:cloud` is running, add `?debug=1` to the
address (e.g. http://localhost:5173/?debug=1) for these keys. They only exist
on the development server: production builds, including the live site, leave
them out.

| Key | Effect |
|---|---|
| F7 | End the night |
| F8 | +500 coins |
| F9 | +50 presents, which unlocks milestones |

`window.__game` exposes the game state.

## Code map

`docs/CONTRACT.md` describes every module. In short:

- `src/main.js`: game loop and state machine
- `src/world/`: island, Pip, camera, collectables, companions, effects
- `src/game/`: upgrades, milestones, surprises, crackers
- `src/ui/`: HUD, radar, popups, menus
- `src/core/`: rng, save, audio, input, pwa (install, offline, updates)
- `src/data/jokes.js`: all the jokes
