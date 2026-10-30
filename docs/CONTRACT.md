# Pip's Christmas Eve Hunt — Module Contract

This is the single source of truth for how the modules fit together. Every module
must export **exactly** the names and shapes below so `src/main.js` can wire them.
Plain JavaScript ES modules, no TypeScript, no extra npm packages. `three` is
installed (v0.186) — import as `import * as THREE from 'three'`. Addons are at
`three/addons/...` if truly needed (avoid if possible). The only other packages
are Firebase (docs/CLOUD.md) and, for the installable app (`src/core/pwa.js`
below), `vite-plugin-pwa` + `workbox-window` (build-time) and
`@fontsource/fredoka` (the self-hosted menu font, imported by main.js).

## Game feel
Fun, cute and cosy. Pip is a round little penguin in a snowy night-time island
village. Chunky low-poly shapes, soft toon shading, bright Christmas colours,
gentle bouncy animations (squash & stretch, bobbing, wobbling). Moonlit night
but **bright enough to see clearly** — blue-lavender ambience, warm lamp glows.
Kid-friendly humour everywhere.

## World conventions
- Y is up. Ground is around y = 0 (terrain varies gently, roughly -0.5 .. 3).
- Island is a circle of radius **75** centred on the origin. Player bounds radius **72**.
- Units are metres. Pip is ~1.2 tall. Pine trees 4–9 tall. Houses ~6 wide.
- **Yaw convention:** a yaw angle `a` means forward = `(Math.sin(a), 0, Math.cos(a))`.
  `object.rotation.y = a` faces an object built facing +Z along that direction.
  Build every model facing **+Z**.
- Village square with Santa's sleigh at the origin; player spawns at `world.spawn`.
- Performance: many scattered objects (forest trees, rocks, snow lumps) must use
  `THREE.InstancedMesh` or shared geometry+materials. No per-collectable PointLights —
  use emissive materials plus additive glow sprites. Target < 300 draw calls.
- Shared materials: `src/world/materials.js` exports `toon(color, opts)` (cached
  MeshToonMaterial), `addOutline(mesh, thickness)` (inverted hull, hero objects
  only) and `PALETTE`. Use them.
- Shadows: the renderer has shadow maps on. Set `castShadow` on important meshes
  (Pip, houses, feature trees, collectables) and `receiveShadow` on terrain.

## Already written (read, reuse, do not rewrite)
- `src/core/rng.js` — `createRng(seed)` → `{ seed, next, range, int, chance, pick, weighted(entries), shuffle, fork(salt) }`, `randomSeed()`, `hashString()`.
- `src/core/save.js` — `loadSave()`, `writeSave(save)`, `resetSave()`, `defaultSave()`.
  Save shape: `{ version, coins, totalPresents, totalCrackers, nights, bestPresentsInNight, upgrades:{id:lvl}, foundJokes:[ids], unlocked:[milestoneIds], wardrobe:{milestoneId:bool}, settings:{sfx, music, voice} }`.
- `src/game/upgrades.js` — `UPGRADES`, `MAX_LEVEL`, `getUpgrade`, `upgradeLevel(save,id)`, `nextCost(save,id)`, `buyUpgrade(save,id)`, `computeStats(save)`.
  Stats: `{ radarRange, radarShowCrackers, radarPingSeconds, radarRarity, compassLevel, speedMult, iceGrip, nightSeconds, luck, magnetRadius, extraPresents, jokeLuck }`.
- `src/game/milestones.js` — `MILESTONES` (`{id, count, icon, name, desc, cosmetic}`), `getMilestone`, `isUnlocked`, `isActive(save,id)`, `checkMilestones(save)`, `nextMilestone(save)`.
  Ids: `scarf`(10) `puppy`(25) `candyTheme`(50) `trail`(75) `goldenPresent`(100) `partySky`(150) `jumper`(200).
- `src/game/crackers.js` — `RARITY_COINS`, `rollRarity(rng, jokeLuck)`, `pickJoke(rng, rarity, foundIds)` → `{joke, isNew}`, `getJoke(id)`.
- `src/world/materials.js`, `src/styles.css` (CSS variables — use them), `index.html`.

DOM roots in `index.html`: `#game` (canvas), `#hud`, `#popups`, `#screens`
(all inside `#app`). The
three overlay roots are `pointer-events:none` but their **direct children** get
`pointer-events:auto` — so HUD/overlay containers that cover the screen must set
`pointer-events:none` themselves and re-enable it only on real buttons, or they will
block camera dragging on the canvas.

## The game context `ctx` (owned by main.js)
Created by main.js and passed to modules that need game access:
```
ctx = {
  scene, camera, renderer,
  save, persist(),           // persist() writes the save
  stats,                     // computeStats(save) at night start
  rng,                       // night rng (seeded)
  seed,
  time,                      // game seconds since night start (stops while paused/modal)
  world, player, collectables, effects, companions, sky, hud, popups, sfx,
  run: {
    timeLeft, coinsEarned, crackers, presents,
    newJokes: [],            // joke objects found for the first time tonight
    surprises: {},           // surpriseId -> count
    speedBoostUntil: 0,      // ctx.time until which speed x2 (reindeer)
    revealUntil: 0,          // ctx.time until which radar shows everything
  },
  addCoins(n, worldPos?),    // adds to save.coins + run.coinsEarned, float text, coin sfx; n may be negative
  addTime(seconds),          // adds to run.timeLeft
  toast(text, icon?),        // small HUD message
}
```

---

## Module APIs

### `src/data/jokes.js`
`export const JOKES = [ { id, kind, rarity, q, a } ]`
- `id`: `'j001'…` for jokes, `'q001'…` quotes, `'s001'…` secrets. Unique, stable.
- `kind`: `'joke' | 'quote' | 'secret'`. `rarity`: `'common' | 'rare' | 'legendary'`.
- Jokes: `q` = setup question, `a` = punchline. Quotes: `q` = the saying, `a` = `''` or a cute attribution ("— a very wise snowman"). Secrets: `q` = a title ("Santa's Secret Note #3"), `a` = the funny note.
- About **70 jokes** (≈55 common, ≈15 rare), **20 quotes** (≈15 common, ≈5 rare), **12 secrets** (all legendary). Total ≥ 100. All original or traditional folk cracker jokes, kid-friendly, no copyrighted quotes or song lyrics.
- Also `export const JOKE_COUNTS = { total, joke, quote, secret }`.

### `src/core/audio.js`
`export const sfx = { unlock(), play(name), setEnabled(bool), setMusicEnabled(bool), startMusic(), stopMusic(), speak(text) }`
- Pure WebAudio synthesis (no files). AudioContext created lazily in `unlock()` (called on first user gesture); `play` before unlock is a silent no-op. Never throw.
- Names: `bang` (cracker), `pop` (bow pop), `boing` (jack-in-box), `blip` (radar ping), `coin`, `jingle` (sleigh bells sparkle), `sadTrombone` (wah-wah-waaah), `hoho` (deep 3-note), `bark` (tiny yip), `whoosh`, `click` (UI), `buy` (cash register-ish chime), `error` (soft buzz), `unlock` (fanfare), `disco` (a ~10 s funky synth loop, auto-stops), `footstep` (soft snow crunch, quiet), `slide` (swoosh), `snowball` (thud), `tick` (clock tick for last 10 s).
- Music: gentle original looping lullaby-style Christmas melody (or public-domain "Jingle Bells"/"Deck the Halls" tune) with soft bells, low volume.
- `speak(text)`: speechSynthesis with a silly voice (pitch ~1.6, rate ~0.95); no-op if unsupported or voice setting off (main calls `setVoiceEnabled` too — also export `setVoiceEnabled(bool)` on `sfx`).

### `src/core/input.js`
`export function createInput(canvas)` →
```
{ isDown(code), pressed(code) /* true once per key press, edge-triggered; cleared by endFrame() */,
  moveVector() /* {x, y} from WASD/arrows, x right, y forward, length <= 1 */,
  dragDelta() /* {dx, dy} mouse/touch drag pixels since last call */,
  wheelDelta() /* accumulated wheel since last call */,
  clicked() /* true once if canvas was clicked (not dragged >5px) since last call */,
  endFrame(), setEnabled(bool) }
```
Use `KeyboardEvent.code` (`'KeyW'`, `'Space'`, `'KeyE'`, `'Tab'`, `'Escape'`, `'ArrowUp'`…). preventDefault for Space/Tab/arrows. Clear held keys on window blur.

### `src/world/camera.js`
`export function createCameraRig(camera)` → `{ yaw, pitch, update(dt, { target /*Vector3*/, targetYaw, moving, drag:{dx,dy}, wheel, world }), snapBehind(yaw) }`
- Third-person orbit: distance ~7 (wheel zoom 4–12), pitch clamp ~0.15–1.1 rad, looks at target + (0,1,0).
- Mouse drag orbits. When the player moves and no drag happened for ~1.5 s, yaw eases behind the player.
- Keep camera above `world.heightAt(x,z) + 0.8`. Smooth with damping.
- `yaw` uses the yaw convention; camera sits at `target - forward(yaw) * dist`.

### `src/world/player.js`
`export function createPlayer()` →
```
{ group, position /* = group.position */, facing, velocity /* Vector3 */, radius: 0.6, sliding,
  update(dt, { move /* {x,y} */, slide /* bool */, cameraYaw, world, speedMult, iceGrip, time }),
  setHat(colorHex|null), setCosmetics({ scarf, bobble, jumper }), celebrate(), setRiding(bool),
  headPosition() /* world Vector3 above head */ }
```
- Cute penguin "Pip": round black body, white tummy, orange beak and feet, big sparkly eyes with highlights, rosy cheeks, little flippers. Outlines via `addOutline`.
- Movement camera-relative: forward = camera yaw. Walk speed ~6 m/s × speedMult. Turn smoothly to face movement.
- Waddle animation (side rock + feet step + flipper flap) scaled with speed; idle breathing/blink.
- **Slide**: holding slide while moving → belly-slide pose (tilted forward flat), speed ×1.7, reduced steering, momentum.
- **Ice**: `world.isIce(x,z)` and `!iceGrip` → low friction, slippery momentum.
- Collision: `world.resolveCollision(position, radius)`; `position.y = world.heightAt(x,z)`.
- `setRiding(true)`: sits higher (+0.9 y offset) for reindeer ride.
- Hat: paper cracker crown (zig-zag ring) on head in given colour. Cosmetics: scarf (red with white stripes, tails flapping), bobble hat (red/white with pom-pom; if both crown and bobble, crown sits on top of bobble), jumper (green knit body wrap with a red/white pattern band and a little reindeer/star).
- `celebrate()`: little hop + flipper flap over ~0.6 s.

### `src/world/props.js`
Factory functions returning `THREE.Group`s built facing +Z, base at y=0, each with `userData.radius` (collision circle):
`makePineTree(rng, {theme})`, `makeDecoratedTree(rng, {theme})` (big Christmas tree with baubles, garland, star; exposes `userData.lights: Mesh[]` of bulb meshes with their own unique emissive materials so disco mode can recolour them), `makeSnowman(rng)`, `makeCandyLamp(rng)` (candy-cane striped lamp post with warm glowing lamp + additive glow sprite), `makeGingerHouse(rng, {theme})` (gingerbread house with icing roof, gumdrops, glowing windows, door facing +Z), `makeFence(length)`, `makeSleigh()` (Santa's red sleigh with gold trim and a sack of presents), `makeRock(rng)`, `makeLollipopTree(rng)` (candy theme).
Also `export function makeForestInstances(points, rng, {theme})` → `THREE.Group` containing InstancedMeshes for many simple pine trees at `points [{x, z, y, scale, rot}]`.

### `src/world/mapgen.js`
`export function generateMap(rng, { theme = 'classic' | 'candy', crackerCount = 15, presentCount = 10 })` → `world`:
```
{ group /* caller adds to scene */, radius: 75,
  heightAt(x, z), isIce(x, z),
  colliders: [{ x, z, r }],
  resolveCollision(pos /*Vector3*/, radius) /* pushes pos.x/z out of colliders + keeps inside radius 72 */,
  spawn: { x, z }, sleigh: { x, z, r /* interact radius ~3.5 */ },
  decoratedTrees: [Group], houses: [Group],
  crackerSpots: [{ x, z }], presentSpots: [{ x, z }],
  randomFreeSpot(rng, minDistFromSpawn = 12) /* {x,z} not inside colliders */,
  update(dt, time) /* chimney smoke, lamp flicker, etc. */ }
```
- Terrain: value-noise heightmap from rng (gentle hills, flatter village area near origin, beach falling to a frozen sea ring beyond r≈75 out to ~140 so the edge looks nice). Snow vertex colours with subtle blue shading. `receiveShadow`.
- Village square (radius ~14 around origin): sleigh at origin, 6–8 decorated trees and candy lamps in a ring, 2–4 gingerbread houses just outside, fences.
- Frozen pond(s) (1–2, radius 6–10) somewhere outside the village: flat glossy ice disc; `isIce` true inside.
- Scatter with Poisson-disc (min spacing) — forest clumps (instanced), snowmen (4–8), rocks, candy lamps along paths.
- `crackerSpots` / `presentSpots`: exactly the requested counts, distance ≥ 12 from spawn, spaced ≥ 6 apart, not inside colliders; ~30 % deliberately tucked behind houses / beside trees.
- Candy theme: pink-tinted snow, candy-stripe pines + lollipop trees, pastel houses.
- Everything depends **only** on the rng → same seed = same map.

### `src/world/sky.js`
`export function createSky(scene)` → `{ update(dt, time, focus /*Vector3*/), setParty(bool), setTheme('classic'|'candy'), dispose() }`
- Sets `scene.background` (gradient sky dome), `scene.fog` (soft blue fog, far ~140), adds HemisphereLight + ambient + a moon DirectionalLight with shadows (`castShadow`, 2048 map, shadow camera ~±40 that follows `focus` each update), moon disc, twinkling stars (Points), waving aurora ribbons (green/teal; party mode = cycling rainbow disco colours + faster).
- Bright enough: the scene must read clearly — think "storybook moonlight".

### `src/world/collectables.js`
`export function createCollectables(scene, world, rng)` →
```
{ items /* [{ id, type:'cracker'|'present', group, position /*Vector3*/, alive, opening, rarity /*crackers*/, golden, mini }] */,
  spawnCracker(x, z, { rarity = 'common' }), spawnPresent(x, z, { golden = false, mini = false }),
  populate({ crackerRarities /* array of rarity strings, one per world.crackerSpots */, presents /* count, uses world.presentSpots then randomFreeSpot */, goldenCount = 0 }),
  update(dt, time, playerPos), nearest(pos, { type, maxDist, filter } = {}) /* {item, dist} | null */,
  alive(type?) /* array of alive, not-opening items */,
  open(item, { onBang } = {}) /* Promise, plays the animation, sets alive=false; removes mesh at the end */,
  clear() }
```
- Cracker: classic bon-bon (tube with twisted ends + frilly ends, stripes). Common = red/green/white; rare = gold shiny with sparkle; legendary = rainbow animated hue with stars. Floats/bobs and slowly spins, with an additive glow sprite beneath.
- Present: box with ribbon cross + big bow, random cheerful colours; mini = half size; golden = gold box with sparkles and a bigger glow. Gentle bobbing + squash.
- Near player (< 4 m) items wiggle excitedly.
- `open` (cracker): two cartoon white-glove hands appear and pull it apart, halves fly, call `onBang()` at the bang moment (~0.5 s), total ~1 s.
- `open` (present): wobble, bow pops up and away, lid flies up spinning, box shrinks; `onBang()` when the lid pops (~0.6 s), total ~1.1 s.

### `src/world/effects.js`
`export function createEffects(scene)` →
```
{ confetti(pos, count = 120), sparkles(pos, color = 0xffe680, count = 30), coinBurst(pos, n = 8),
  floatText(pos, text, color = '#ffd93d') /* canvas-texture sprite rising and fading */,
  setTrail(bool) /* rainbow sparkle trail behind player */,
  update(dt, time, { camera, playerPos }) /* runs all particles + snowfall around the camera */ }
```
Snowfall is always on (Points around the camera, gentle drifting). Pooled particles, no per-frame allocations.

### `src/game/surprises.js`
`export const SURPRISES = [{ id, name, icon, desc, weight, good }]` and
`export function rollSurprise(rng, stats)` → surprise def, and
`export function applySurprise(surprise, ctx, present)` → void.
Ids and behaviour (luck = `stats.luck` 0–3 lowers `coal`, raises good ones; `santa` weight 1 + luck):
`coins` (+10–30), `jack` (jack-in-the-box clown boings out, +15), `puppy` (snow puppy follows for the night; if one already follows, +20 coins "Your puppy found a friend!"), `reindeer` (speed ×2 for 20 s: set `ctx.run.speedBoostUntil`, `companions.reindeerRide(20)`), `snowballs` (snowball storm 8 s, each snowball landing within 3 m of Pip +1 coin), `timeElf` (+30 s), `radarPing` (reveal all on radar 10 s: `ctx.run.revealUntil`), `coal` (+1 coin, sadTrombone, googly-eyed coal says "Merry Christmas anyway!"), `mega` (spawns 3 mini presents around the spot), `disco` (nearest decorated tree disco for 10 s, +20), `gremlin` (steals 10 coins, runs off; catch within 10 s for +25), `santa` (Santa flies over and drops +100, "Ho ho ho!").
Golden presents always resolve to `mega` (main.js handles that; `applySurprise` just does what it is told).
Every surprise: `ctx.popups.showSurprise(def, detailText)` banner, sfx, and increments `ctx.run.surprises[id]`.

### `src/world/companions.js`
`export function createCompanions(scene, ctx)` →
```
{ hasPuppy, spawnPuppy(), jackInBox(pos), reindeerRide(seconds), snowballStorm(seconds, onNear /* called per snowball within 3 m of player */),
  coalBuddy(pos), discoTree(tree, seconds), gremlin(pos, onCaught, onEscaped), santaFlyover(onDrop),
  update(dt, time), clear() }
```
- Snow puppy: tiny white snow-dog (round body, floppy ears, red collar with bell, wagging tail) that follows behind Pip and hops. When an alive collectable is within 12 m it hasn't barked about yet: `ctx.sfx.play('bark')`, `ctx.toast('Woof! Something nearby!', '🐶')` and it points toward it for a moment.
- Jack-in-the-box: box + spring + clown head that boings up with springy oscillation, then shrinks away after ~2.5 s.
- Reindeer: cute reindeer with red nose that appears under Pip (`ctx.player.setRiding(true)`) and follows Pip's position/facing for the duration, legs galloping; `setRiding(false)` at the end with a puff.
- Snowball storm: snowballs fall from the sky in a ~10 m area around Pip; on landing they puff. Call `onNear()` when one lands within 3 m.
- Coal buddy: lump of coal sprouts googly eyes (wobbling pupils) and a speech-bubble sprite "Merry Christmas anyway!", stays ~4 s.
- Disco tree: cycles the tree's `userData.lights` colours fast, spins a mirror ball above it, coloured spot sprites, `sfx.play('disco')`.
- Gremlin: small green cheeky goblin with a sack, runs away from Pip (speed slightly below Pip's walk speed, dodging, stays on island via `world.resolveCollision`). If Pip gets within 1.5 m before 10 s → `onCaught()`, else `onEscaped()` and it vanishes in a puff. Show a 3D countdown text above it.
- Santa flyover: Santa in sleigh with reindeer flies across the sky over Pip in ~5 s, `sfx.play('hoho')`; at midpoint calls `onDrop()` and drops a sparkling gift trail.
- No game logic beyond the callbacks; coins are handled by surprises.js.

### `src/ui/hud.js` (+ `src/ui/hud.css`, imported by hud.js)
`export function createHud(root)` →
```
{ show(), hide(), setTime(seconds), setCoins(n), setCounts({ crackers, presents }),
  setPrompt(text | null), toast(text, icon), setBuffs([{ icon, label, remaining }]),
  setCompass(angle | null, distance | null) /* angle radians relative to screen-up; null hides */,
  setSeed(seed), flashTime() /* pulse when time added */,
  radarCanvas /* <canvas> 200x200 css px (hi-dpi aware) bottom-right */ }
```
Timer top-centre (big friendly clock, turns red & wobbles in last 30 s), coins top-left (bouncing coin icon on change), counts top-left under coins, buffs row under the timer, prompt bottom-centre ("Press E to pull the cracker!"), toasts stacked top-right, compass star arrow just under the timer, small control hints bottom-left.

### `src/ui/radar.js`
`export function createRadar(canvas)` → `{ update(dt, { playerPos, yaw, items, stats, revealAll, time }) }`
- Round radar, rotated so camera-forward (`yaw`) is up. Green-on-dark-blue with a candy-stripe rim, sweep line rotating once per `stats.radarPingSeconds`, `blip` handled by main (radar exposes `onPing` callback property, set by main: `radar.onPing = () => sfx.play('blip')`).
- Within `stats.radarRange` (or everything if `revealAll`): presents as gift-box dots (gold for golden); crackers only if `stats.radarShowCrackers || revealAll`, coloured by rarity if `stats.radarRarity` (common white, rare gold, legendary rainbow) else pink. Blips fade after the sweep passes; items beyond range clamp to the rim as small arrows only when `revealAll`. Centre = Pip arrow. Range label "25 m".

### `src/ui/popups.js` (styles in `src/ui/hud.css` or its own `popups.css`)
`export function createPopups(root, sfx)` →
```
{ showJoke(joke, { isNew, coins }) /* Promise, modal */, showSurprise(def, detail) /* non-modal banner ~3 s */,
  showUnlock(milestone) /* Promise, modal */, isModalOpen(), closeModal() }
```
- Joke card: cracker-paper strip slip (torn edges), rarity ribbon ("NEW!" sticker if new, "Already in your gallery!" if not), shows `q`, then "Tap to see the answer!" reveals `a` with a bounce (quotes/secrets show both at once). Buttons: 🔊 Read aloud (`sfx.speak`), "Ha! Next" closes. Keyboard: E / Space / Enter reveals then closes. Legendary gets a rainbow animated border.
- Surprise banner: big icon + name + detail sliding in from top, auto-hides.
- Unlock: celebratory card with icon, name, desc, confetti CSS.

### `src/ui/glnote.js` (+ `src/ui/glnote.css`): when the 3D can't run
`export function showGlNote(kind /* 'nogl' | 'lost' */, { root, onButton })` → `{ hide() }`
- A cosy full-screen paper card over everything in `root` (main.js passes
  `#app`), whose other children go `inert` until `hide()`. Its one button
  reloads the page unless `onButton` is given. Never throws.
- `'nogl'`: "Pip's island needs 3D graphics" / "Try Chrome, Safari or Edge, or
  turn on hardware acceleration in your browser settings." (Try again).
- `'lost'`: "The 3D picture took a snow day" (Tap to reload).
- main.js creates the renderer in a try/catch. With no WebGL it shows
  `'nogl'` and stops there with a top-level `await` on a promise that never
  settles: no error, and nothing else starts (no world, menus, cloud sign-in
  or service worker).
- On `webglcontextlost` main.js calls `preventDefault()` (so the browser may
  give the context back), pauses a running night and shows `'lost'`; the
  frame loop neither updates nor draws meanwhile. On
  `webglcontextrestored` the note goes and the game carries on from the
  pause menu (three.js rebuilds its GPU state itself).

### `src/core/pwa.js` (installable app, offline play, updates)
The web app manifest, icons (`public/icons/`) and the Workbox service worker are
set up in `vite.config.js` (vite-plugin-pwa, `registerType: 'prompt'`). The
service worker precaches every built file (the game, the lazy Firebase chunk,
the Fredoka woff2 files, the icons, and the public privacy pages
`privacy.html` / `delete-data.html`) and has **no** runtime caching, so Firebase
and Google requests always go to the network. Its navigation fallback (the
game's `index.html` for any other address) never answers `/__/` or the
privacy pages: those come from the precache, or from the network when a query
string keeps the precache from matching. Paths stay relative (`base: './'`):
`sw.js`, its scope and the manifest's `start_url` / `scope` all resolve to the
folder the game is served from (the GitHub Pages sub-path). The Fredoka files
are built into `fonts/` under fixed names (no hash), so the stand-alone
privacy pages can use them too.

Pure helpers (no side effects on import, so screens.js imports them too):
`isInAppBrowser(ua?)`, `isIOS(ua?, maxTouchPoints?)` (iPadOS's desktop user agent
counts), `isIPad(ua?, maxTouchPoints?)` (the steps card's Share button sits at
the top right there), `isIOSSafari(ua?, maxTouchPoints?)` (not Chrome/Firefox/Edge/Google app
for iOS, not an in-app browser), `isStandalone(win?)` (display-mode standalone,
fullscreen, minimal-ui or window-controls-overlay, or iOS `navigator.standalone`).

`export function createPwa({ onChange })` →
```
{ start()                      /* registers the service worker (production builds only) */,
  updateReady,                 /* a new version is waiting */
  applyUpdate()                /* activate it and reload; menus only */,
  offlineReady,                /* the game is cached (first install) */
  canInstall,                  /* Chrome/Edge sent beforeinstallprompt (default prevented); never in an in-app browser */
  promptInstall()              /* → Promise<'accepted'|'dismissed'|'unavailable'> */,
  canAddToHomeScreen,          /* iPhone/iPad Safari in a tab: show the steps */
  separateAppStorage,          /* iPhone/iPad Home Screen app (navigator.standalone or display-mode standalone): storage apart from Safari */
  isStandalone(), isIOS(), isInAppBrowser(),
  onChange                     /* called (async) whenever any of the above changes */ }
```
- main.js creates it before the screens (the `beforeinstallprompt` listener must
  be in place early), passes it as `deps.pwa` and wires `onChange` to
  `screens.pwaChanged()`; `start()` runs at boot after `cloud.start()`.
- Updates are checked when the page becomes visible again and hourly (at most
  once a minute). A version activated from another tab never reloads this page
  by itself: the menus offer "Refresh" again, so a night is never interrupted.
- screens.js shows everything, and only on menus: the update prompt and the
  one-time "ready to play offline" note on title / results / shop / gallery /
  leaderboard (never during a night, its pause menu or the gallery peeked at
  from it); "📲 Install" or "📲 Add to Home Screen" (an in-page steps card) on the
  title's bottom line next to "Reset progress" and "Privacy"; nothing install-
  related when already running as an app. In the iPhone/iPad Home Screen app
  the account card (and the title's sign-in line) explain that signing in with
  Google there too brings a Google account's progress across, and to keep
  playing in Safari if signing in doesn't finish (docs/CLOUD.md, "Home Screen
  app on iPhone and iPad").
- iOS meta: `apple-mobile-web-app-status-bar-style` is `black`, not
  `black-translucent` (deprecated; iOS 26.1+ draws a scrim over it). iOS reads
  it only when the app is added, so changing it needs a reinstall.
- Safe areas: `index.html` uses `viewport-fit=cover`; `styles.css` defines
  `--safe-top/right/bottom/left` (`env(safe-area-inset-*)`). `#hud`, the menus'
  stage, popup cards and banners stay inside them; the canvas and backdrops
  fill the screen.

### `src/ui/screens.js` (+ `src/ui/screens.css`, imported by screens.js)
`export function createScreens(root, deps)` with
`deps = { getSave(), persist(), sfx, cloud, pwa, onStartNight(), getIslandSeed() /* map number of the last night, or null */, onResume(), onQuitToTitle(), onResetSave(), onSettingsChanged() }` →
```
{ showTitle(), showResults(summary), showShop(), showGallery(back /* 'title'|'shop'|'pause' */), showPause(), showHelp(), hideAll(), current /* string|null */,
  refresh(), cloudChanged() /* docs/CLOUD.md */, pwaChanged() /* src/core/pwa.js */ }
```
`summary = { seed, crackers, presents, coinsEarned, newJokes: [joke], newUnlocks: [milestone], surprises: {id:count}, endedEarly }`.
- **Title**: big cute logo "Pip's Christmas Eve Hunt" with a CSS penguin/present doodle, falling CSS snow, buttons Start Night / Santa's Workshop / Joke Gallery / How to Play, sound+music toggles, "Present Legend" title badge if `jumper` unlocked, stats line (nights, presents, jokes found x/y), small "Reset progress" with a confirm step, and (with a cloud) "⭐ Feedback" on the same bottom line.
- **Results**: "Christmas Eve is over!" (or "Home early!"), counts with count-up animation, coins earned, seed ("Map #123456"), list of new jokes (mini cards), surprises tally with icons, new unlocks celebrated, buttons Santa's Workshop / Next Night / Title, and (with a cloud) a small "⭐ Feedback" link at the end of the page.
- **Privacy** (docs/CLOUD.md, "Privacy note screen"): the plain-words list
  from `PRIVACY_FACTS` in `src/ui/privacy-text.js` (which `public/privacy.html`
  repeats word for word), "📄 Read the full privacy policy" (`privacy.html`,
  new tab, only with a cloud) and "Delete my saved data". While the cloud's
  `status.needsReauth` is true, the delete box and the leaderboard's account
  card show "Confirm with Google to finish deleting" (`cloud.reauthAndDelete()`,
  called inside the click), and the title's sign-in strip offers "Finish
  deleting".
- **Grown-ups gate** (docs/CLOUD.md, "Grown-ups gate for Google sign-in"; pure parts in `src/ui/age-gate.js`): every "Sign in with Google" (title strip, account card) and the feedback card's note first ask a neutral "When were you born?": a month and a year select, both starting blank, one Continue and a ✕, with nothing saying what age is needed. 18 or over (`GATE_MIN_AGE`, the birthday counted from the 1st of the month after) passes: sign-in shows "Continue to Google", whose click calls `cloud.linkGoogle()` synchronously, and the note field opens; a pass holds for 10 minutes in the tab (sessionStorage). Younger shows only "Ask a grown-up to help you with this one." and holds for 24 hours on the device (localStorage `pips-hunt-gate-not-now`), so Esc, closing, reopening and a reload show the message instead of the question. The month and year are never stored or sent.
- **Feedback card** (docs/CLOUD.md, "Feedback"): an in-page card over the title or results, never during a night: 1–5 stars, one topic, up to 3 quick-note chips, and a note only behind the grown-ups gate. It calls `cloud.sendFeedback(payload)` with `{ rating, category, quick, comment, islandSeed }`; a success shows a thank-you toast, and the Feedback links say "Thanks! You can send more after your next night" until a night ends. The lists are `FEEDBACK_CATEGORIES` and `FEEDBACK_QUICK` in `src/cloud/feedback.js`.
- **Shop (Santa's Workshop)**: tabs **Upgrades**, **Rewards**, **Wardrobe**. Coins shown. Upgrade cards: icon, name, blurb, level pips (●●○), next level text, Buy button with cost (disabled if poor/maxed; `buyUpgrade` from upgrades.js, then `persist()`, `sfx.play('buy')` or `'error'`). Rewards tab: present milestone track — progress bar of `save.totalPresents` with milestone stops (icon, count, name, locked/unlocked). Wardrobe: toggles for unlocked cosmetic milestones (`save.wardrobe[id]`). Buttons: Start Night, Gallery, Title.
- **Gallery**: scrapbook page; filter chips All / Jokes / Quotes / Secrets(Legendary); counter "42 / 102 found"; grid of cards — found cards show the `q` and flip on click to show `a` (with 🔊 read aloud); unfound show "???" silhouette with a cracker outline and rarity tint. Back button.
- **Pause**: Resume, Gallery, Sound toggles, Go home (end night early), Quit to title.
- **Help**: controls and a short cute explanation of crackers, presents, radar, shop.
- All screens are full-screen overlays with a semi-transparent night backdrop, cosy rounded cards, candy-stripe accents, Fredoka font, buttons with chunky shadows and hover bounce. Keyboard: Escape = back.
