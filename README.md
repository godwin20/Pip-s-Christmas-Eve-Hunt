# Pip's Christmas Eve Hunt 🐧🎁

A cute 3D Christmas game in the browser. Pip the penguin waddles around a new
snowy island every night, pulling Christmas crackers for jokes and opening
presents full of surprises before morning comes.

## Play

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

## Testing shortcuts

Open http://localhost:5173/?debug=1 for these keys:

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
