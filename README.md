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

## What's in it

- **Crackers:** 102 jokes, cosy quotes and legendary *Santa's Secret Notes*, in common, rare and legendary crackers.
- **Presents:** 12 surprises, including a snow puppy, a reindeer ride, a snowball storm, a disco tree, a sneaky gremlin and a Santa flyover.
- **Randomiser and map generation:** every night is a new seeded island, with the map number shown on the results screen.
- **Radar:** shows nearby treats, and points the way when nothing is in range.
- **Santa's Workshop:** 9 upgrades with 3 levels each.
- **Present Milestones:** rewards at 10 / 25 / 50 / 75 / 100 / 150 / 200 presents, switched on and off in the Wardrobe.
- **Joke Gallery:** everything you've found, with read-aloud.

Progress is saved in the browser (localStorage).

## Put it online

Every push to `main` rebuilds the game and publishes it to GitHub Pages (`.github/workflows/deploy.yml`). Players see the update within about 10 minutes.

The build is a plain static site with relative paths, so it also runs from any other web host or sub-folder.

```bash
npm run zip
```

This builds the game and makes `pips-christmas-eve-hunt.zip`, with `index.html` at the top. Drop the zip (or the `dist` folder) onto a static host such as Cloudflare Pages (Workers & Pages > Create application > Pages > Drag and drop your files). Hosts that run the game as a normal page keep saves working. itch.io runs games in a cross-site frame, so iPhone and iPad players are likely to lose their saves there.

## Cloud saves and leaderboard

Players start as guests, and grown-ups can sign in with Google so progress
follows them to any device. A leaderboard ranks snow names such as
"Jolly Penguin 42". It runs on Firebase's free plan (Authentication and
Firestore Lite). `docs/CLOUD.md` has the design, and `src/cloud/config.js`
holds the project config. Until a config is added, the game runs as before,
saving on the device only.

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
- `src/core/`: rng, save, audio, input
- `src/data/jokes.js`: all the jokes
