// Boot + game state machine. Owns the shared `ctx` (see docs/CONTRACT.md) and
// wires every module together: title → night → results → shop → next night.

import * as THREE from 'three';
// Fredoka, self-hosted (latin only): no third-party font request, and the
// service worker precaches it, so the menus look right offline too.
import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import './styles.css';
import { createRng, randomSeed } from './core/rng.js';
import { loadSave, writeSave, resetSave } from './core/save.js';
import { sfx } from './core/audio.js';
import { createInput } from './core/input.js';
import { computeStats } from './game/upgrades.js';
import { checkMilestones, isActive, isUnlocked } from './game/milestones.js';
import { rollRarity, pickJoke, RARITY_COINS } from './game/crackers.js';
import { SURPRISES, rollSurprise, applySurprise } from './game/surprises.js';
import { generateMap } from './world/mapgen.js';
import { createSky } from './world/sky.js';
import { createPlayer } from './world/player.js';
import { createCameraRig } from './world/camera.js';
import { createCollectables } from './world/collectables.js';
import { createEffects } from './world/effects.js';
import { createCompanions } from './world/companions.js';
import { createHud } from './ui/hud.js';
import { createRadar } from './ui/radar.js';
import { createPopups } from './ui/popups.js';
import { createScreens } from './ui/screens.js';
import { createCloud } from './cloud/cloud.js';
import { ensureProfile } from './cloud/merge.js';
import { createPwa } from './core/pwa.js';

// Dev server only: Vite turns import.meta.env.DEV into `false` in production
// builds, so the debug keys and window.__game are stripped from the live game
// and ?debug=1 can't be used to pad the leaderboard.
const DEBUG = import.meta.env.DEV && new URLSearchParams(location.search).has('debug');
const INTERACT_RANGE = 2.4;
const CRACKER_COUNT = 15;
const BASE_PRESENTS = 10;
const RESPAWN_EVERY = 30;
const RESPAWN_BELOW = 5;
// Flying home early from the sleigh: Pip spawns facing it, and kids press E at
// every prompt, so it is only offered once the hunt is under way, and takes a
// second, deliberate press (like "Quit to title" in the pause menu).
const HOME_OFFER_AFTER = 60; // night seconds, unless something was found already
const HOME_CONFIRM_DELAY = 0.6; // a press this soon after the last one is a mash, not a yes
const HOME_CONFIRM_WINDOW = 3.5; // night seconds the "press again" stays armed after a press
const HAT_COLOURS = [0xff5d73, 0xffd93d, 0x6bcb77, 0x4d96ff, 0xc77dff, 0xff9f45, 0x5ce1e6];

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(0, 12, -20);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- shared ctx
const save = loadSave();
if (!save.profile) {
  ensureProfile(save); // a random leaderboard snow name for a new player
  writeSave(save);
}
const input = createInput(canvas);
const sky = createSky(scene);
const effects = createEffects(scene);
effects.setGround((x, z) => (ctx.world ? ctx.world.heightAt(x, z) : 0));
const player = createPlayer();
scene.add(player.group);
const rig = createCameraRig(camera);
player.onStep = () => {
  if (state === 'playing') sfx.play('footstep');
};
player.onSlideStart = () => sfx.play('slide');
player.onBonk = () => {
  sfx.play('snowball');
  rig.shake(0.15, 0.25);
};
const hud = createHud(document.getElementById('hud'));
const radar = createRadar(hud.radarCanvas);
radar.onPing = () => sfx.play('blip');
const popups = createPopups(document.getElementById('popups'), sfx);

const ctx = {
  scene,
  camera,
  renderer,
  save,
  persist: () => writeSave(save),
  stats: computeStats(save),
  rng: createRng(1),
  seed: 1,
  time: 0,
  world: null,
  player,
  collectables: null,
  effects,
  companions: null,
  sky,
  hud,
  popups,
  sfx,
  run: null,
  addCoins(n, worldPos) {
    // a NaN here would end up in the save file (and the purse) for good
    if (!Number.isFinite(n)) return;
    const amount = Math.max(-save.coins, Math.round(n));
    save.coins += amount;
    save.coinsEarned += amount; // keeps coins === coinsEarned - spent (docs/CLOUD.md)
    // results show income only, so a gremlin theft never makes it negative
    if (ctx.run && amount > 0) ctx.run.coinsEarned += amount;
    hud.setCoins(save.coins);
    const at = worldPos ? worldPos.clone() : player.position.clone();
    at.y += 1.8;
    if (amount >= 0) {
      effects.floatText(at, `+${amount} 🪙`, '#ffd93d');
      if (amount > 0) {
        effects.coinBurst(at, Math.min(16, 3 + Math.floor(amount / 5)));
        sfx.play('coin');
      }
    } else {
      effects.floatText(at, `${amount} 🪙`, '#ff6b6b');
    }
  },
  addTime(seconds) {
    // a NaN timeLeft never reaches 0, so the night would never end
    if (!ctx.run || !Number.isFinite(seconds)) return;
    ctx.run.timeLeft += seconds;
    hud.flashTime();
  },
  toast(text, icon) {
    hud.toast(text, icon);
  },
};

// ---------------------------------------------------------------- state
let state = 'title'; // title | playing | paused | results | menu
let busy = false; // an open animation or modal is running
let respawnTimer = 0;
let lastTickSecond = -1;
let orbitAngle = 0;
let homeArmedAt = -1; // ctx.time of the last E press at the sleigh, -1 = not armed

// Cloud saves + leaderboard (docs/CLOUD.md). Everything still works without it.
const cloud = createCloud({
  getSave: () => save,
  replaceSave: (next) => replaceSave(next),
  onStatus: () => screens.cloudChanged?.(),
});

// Offline play, "new version" and install hints (docs/CONTRACT.md). The
// menus show them; nothing appears during a night.
const pwa = createPwa({ onChange: () => screens.pwaChanged?.() });

const screens = createScreens(document.getElementById('screens'), {
  getSave: () => save,
  persist: () => {
    writeSave(save);
    cloud.markDirty(); // Workshop buys, Wardrobe, name changes (debounced)
  },
  sfx,
  cloud,
  pwa,
  onStartNight: () => startNight(),
  onResume: () => resume(),
  onGoHome: () => endNight(true),
  onQuitToTitle: () => quitToTitle(),
  onResetSave: () => {
    const fresh = resetSave();
    // a higher epoch makes this reset win over older copies on other devices;
    // the snow name is who you are, not progress, so it stays
    fresh.epoch = (save.epoch || 0) + 1;
    fresh.profile = save.profile;
    for (const k of Object.keys(save)) delete save[k];
    Object.assign(save, fresh);
    writeSave(save);
    cloud.resetEverywhere();
    applySettings();
    applyCosmetics();
    hud.setCoins(save.coins);
    // the title backdrop must match the fresh save (no candy island, no golden
    // present) instead of waiting for the next night to rebuild it
    if (state !== 'playing' && state !== 'paused') {
      buildWorld(randomSeed(), { populate: true });
    }
  },
  // also fired by the Wardrobe toggles, so the menu backdrop shows them at once
  onSettingsChanged: () => {
    applySettings();
    applyCosmetics();
  },
});

// The cloud merged another device's progress in: copy it into the live save
// (every module holds this same object) and bring everything on screen up to date.
function replaceSave(next) {
  const themeBefore = isActive(save, 'candyTheme');
  const goldenBefore = isUnlocked(save, 'goldenPresent');
  for (const k of Object.keys(save)) delete save[k];
  Object.assign(save, next);
  writeSave(save);
  applySettings();
  applyCosmetics();
  hud.setCoins(save.coins);
  const inNight = state === 'playing' || state === 'paused';
  if (inNight) return; // tonight keeps its map and upgrades; the next night uses the merged save
  ctx.stats = computeStats(save);
  // the menu backdrop shows the candy island / golden present when unlocked
  if (isActive(save, 'candyTheme') !== themeBefore || isUnlocked(save, 'goldenPresent') !== goldenBefore) {
    buildWorld(randomSeed(), { populate: true });
  }
  if (screens.current) screens.refresh();
}

function applySettings() {
  sfx.setEnabled(save.settings.sfx);
  sfx.setMusicEnabled(save.settings.music);
  if (sfx.setVoiceEnabled) sfx.setVoiceEnabled(save.settings.voice);
}

function applyCosmetics() {
  player.setCosmetics({
    scarf: isActive(save, 'scarf'),
    bobble: isActive(save, 'scarf'),
    jumper: isActive(save, 'jumper'),
  });
  effects.setTrail(isActive(save, 'trail'));
  sky.setParty(isActive(save, 'partySky'));
}

// ---------------------------------------------------------------- world lifecycle
function disposeWorld() {
  if (ctx.companions) ctx.companions.dispose();
  if (ctx.collectables) ctx.collectables.dispose();
  if (ctx.world) ctx.world.dispose();
  ctx.world = null;
  ctx.collectables = null;
  ctx.companions = null;
}

function buildWorld(seed, { populate }) {
  disposeWorld();
  ctx.seed = seed;
  ctx.rng = createRng(seed);
  ctx.stats = computeStats(save);
  const theme = isActive(save, 'candyTheme') ? 'candy' : 'classic';
  const world = generateMap(ctx.rng.fork('map'), {
    theme,
    crackerCount: CRACKER_COUNT,
    presentCount: BASE_PRESENTS + ctx.stats.extraPresents,
  });
  scene.add(world.group);
  sky.setTheme(theme);
  ctx.world = world;
  ctx.collectables = createCollectables(scene, world, ctx.rng.fork('items'));
  ctx.companions = createCompanions(scene, ctx);
  if (populate) {
    const rarityRng = ctx.rng.fork('rarity');
    ctx.collectables.populate({
      crackerRarities: world.crackerSpots.map(() => rollRarity(rarityRng, ctx.stats.jokeLuck)),
      presents: world.presentSpots.length,
      goldenCount: isUnlocked(save, 'goldenPresent') ? 1 : 0,
    });
  }
  // face the sleigh so the camera starts out in the open, not on top of it
  const facing = Number.isFinite(world.spawnYaw) ? world.spawnYaw : Math.PI;
  player.reset(world.spawn.x, world.spawn.z, facing, world);
  player.setHat(null);
  player.setRiding(false);
  applyCosmetics();
}

function startNight() {
  sfx.unlock();
  screens.hideAll();
  popups.closeAll(); // at once: an animated close would freeze the new night's first frames
  busy = false;
  buildWorld(randomSeed(), { populate: true });
  ctx.time = 0;
  ctx.run = {
    timeLeft: ctx.stats.nightSeconds,
    coinsEarned: 0,
    crackers: 0,
    presents: 0,
    newJokes: [],
    newUnlocks: [],
    surprises: {},
    speedBoostUntil: 0,
    revealUntil: 0,
  };
  respawnTimer = 0;
  lastTickSecond = -1;
  homeArmedAt = -1;
  rig.snapBehind(player.facing);
  if (isActive(save, 'puppy')) ctx.companions.spawnPuppy();
  hud.reset();
  hud.setSeed(ctx.seed);
  hud.setCoins(save.coins);
  hud.setCounts({ crackers: 0, presents: 0 });
  hud.setTime(ctx.run.timeLeft, ctx.stats.nightSeconds);
  hud.setPrompt(null);
  hud.setBuffs([]);
  hud.setCompass(null, null);
  hud.show();
  sfx.play('jingle');
  if (save.settings.music) sfx.startMusic();
  state = 'playing';
  cloud.hold(true); // no cloud writes mid-night; the night is synced when it ends
  canvas.focus();
  ctx.toast('Find crackers 🎉 and presents 🎁 before morning!', '🌙');
}

// Back to the village square for the menu backdrop, wherever the night left
// Pip: the orbit camera looks at the square and the moon's shadow box follows Pip.
function parkPip() {
  player.setRiding(false);
  const world = ctx.world;
  if (!world) return;
  const facing = Number.isFinite(world.spawnYaw) ? world.spawnYaw : Math.PI;
  player.reset(world.spawn.x, world.spawn.z, facing, world);
}

function endNight(early) {
  if (state !== 'playing' && state !== 'paused') return;
  state = 'results';
  busy = false;
  popups.closeAll();
  sfx.stopDisco();
  if (sfx.stopSpeaking) sfx.stopSpeaking();
  hud.hide();
  if (ctx.companions) ctx.companions.clear();
  parkPip();
  const run = ctx.run;
  save.nights += 1;
  save.bestPresentsInNight = Math.max(save.bestPresentsInNight, run.presents);
  writeSave(save);
  cloud.markDirty();
  cloud.hold(false); // syncs the night and posts the leaderboard scores
  sfx.play(early ? 'jingle' : 'hoho');
  screens.showResults({
    seed: ctx.seed,
    crackers: run.crackers,
    presents: run.presents,
    coinsEarned: run.coinsEarned,
    newJokes: run.newJokes,
    newUnlocks: run.newUnlocks,
    surprises: run.surprises,
    endedEarly: early,
  });
}

function pause() {
  if (state !== 'playing' || popups.isModalOpen()) return;
  state = 'paused';
  hud.setPrompt(null);
  screens.showPause();
}

function resume() {
  if (state !== 'paused') return;
  screens.hideAll();
  state = 'playing';
  canvas.focus();
}

function quitToTitle() {
  popups.closeAll();
  sfx.stopDisco();
  if (sfx.stopSpeaking) sfx.stopSpeaking();
  hud.hide();
  if (ctx.companions) ctx.companions.clear();
  parkPip();
  ctx.run = null;
  busy = false;
  state = 'title';
  // coins from late surprises (snowballs, gremlin, Santa) since the last item
  writeSave(save);
  cloud.markDirty();
  cloud.hold(false);
  screens.showTitle();
}

// ---------------------------------------------------------------- gameplay
function findMegaDef() {
  return SURPRISES.find((s) => s.id === 'mega');
}

function onPresentCounted() {
  save.totalPresents += 1;
  const fresh = checkMilestones(save);
  writeSave(save);
  if (!fresh.length) return Promise.resolve();
  ctx.run.newUnlocks.push(...fresh);
  applyCosmetics();
  if (isActive(save, 'puppy') && !ctx.companions.hasPuppy) ctx.companions.spawnPuppy();
  // one after another, and never once the night is over (results celebrate them)
  return fresh.reduce((p, m) => p.then(() => (state === 'playing' ? popups.showUnlock(m) : null)), Promise.resolve());
}

function openItem(item) {
  if (busy || !item.alive || item.opening) return;
  busy = true;
  hud.setPrompt(null);
  const run = ctx.run;
  // the night may end (or the player quit) while the ~1 s animation plays
  const stillThisNight = (ok) => ok !== false && state === 'playing' && ctx.run === run;
  if (item.type === 'cracker') {
    const rarity = item.rarity || 'common';
    ctx.collectables
      .open(item, {
        onBang: (info) => {
          // the menu backdrop finishes the animation after a quit / night end
          if (!stillThisNight()) return;
          const pos = (info && info.position) || item.position.clone();
          sfx.play('bang');
          rig.shake(0.25, 0.3);
          effects.confetti(pos);
          player.setHat((info && info.crownColor) || ctx.rng.pick(HAT_COLOURS));
          player.celebrate();
          ctx.addCoins(RARITY_COINS[rarity] || 5, pos);
        },
      })
      .then((ok) => {
        if (!stillThisNight(ok)) return null;
        const { joke, isNew } = pickJoke(ctx.rng.fork(`joke-${ctx.run.crackers}-${ctx.time}`), rarity, save.foundJokes);
        if (isNew) {
          save.foundJokes.push(joke.id);
          ctx.run.newJokes.push(joke);
        }
        ctx.run.crackers += 1;
        save.totalCrackers += 1;
        writeSave(save);
        hud.setCounts({ crackers: ctx.run.crackers, presents: ctx.run.presents });
        return popups.showJoke(joke, { isNew, coins: RARITY_COINS[rarity] || 5 });
      })
      .catch((err) => console.error(err))
      .finally(() => {
        busy = false;
      });
  } else {
    ctx.collectables
      .open(item, {
        onBang: (info) => {
          if (!stillThisNight()) return;
          const pos = (info && info.position) || item.position.clone();
          sfx.play('pop');
          effects.sparkles(pos, item.golden ? 0xffd93d : 0xffe680, 40);
          effects.confetti(pos, 60);
          player.celebrate();
        },
      })
      .then((ok) => {
        if (!stillThisNight(ok)) return null;
        ctx.run.presents += 1;
        hud.setCounts({ crackers: ctx.run.crackers, presents: ctx.run.presents });
        const def = item.golden ? findMegaDef() : rollSurprise(ctx.rng, ctx.stats);
        applySurprise(def, ctx, item);
        return onPresentCounted();
      })
      .catch((err) => console.error(err))
      .finally(() => {
        busy = false;
      });
  }
}

function nearSleigh() {
  const s = ctx.world.sleigh;
  const dx = player.position.x - s.x;
  const dz = player.position.z - s.z;
  return Math.hypot(dx, dz) < s.r;
}

function updateInteraction(interactPressed) {
  if (ctx.run.timeLeft <= 0) {
    // morning: only the item already opening may finish
    hud.setPrompt(null);
    return;
  }
  const near = ctx.collectables.nearest(player.position, { maxDist: INTERACT_RANGE });
  // Magnet Mittens: auto-open anything close enough
  if (!busy && ctx.stats.magnetRadius > 0) {
    const auto = ctx.collectables.nearest(player.position, { maxDist: ctx.stats.magnetRadius });
    if (auto) {
      openItem(auto.item);
      return;
    }
  }
  if (busy) {
    homeArmedAt = -1;
    hud.setPrompt(null);
    return;
  }
  if (near) {
    homeArmedAt = -1;
    hud.setPrompt(near.item.type === 'cracker' ? 'Press E to pull the cracker! 🎉' : 'Press E to open the present! 🎁');
    if (interactPressed) openItem(near.item);
  } else if (canFlyHome() && nearSleigh()) {
    updateSleighPrompt(interactPressed);
  } else {
    homeArmedAt = -1;
    hud.setPrompt(null);
  }
}

function canFlyHome() {
  const run = ctx.run;
  return ctx.time > HOME_OFFER_AFTER || run.crackers + run.presents > 0;
}

// Two steps: the first press only arms it ("Press E again…"), a second press
// (not part of the same mash) within a few seconds actually ends the night.
function updateSleighPrompt(interactPressed) {
  const armedFor = homeArmedAt < 0 ? -1 : ctx.time - homeArmedAt;
  if (armedFor > HOME_CONFIRM_WINDOW) homeArmedAt = -1;
  if (homeArmedAt < 0) {
    hud.setPrompt('Press E to fly home early 🛷');
    if (interactPressed) {
      homeArmedAt = ctx.time;
      sfx.play('click');
    }
    return;
  }
  hud.setPrompt("Press E again to fly home — tonight's hunt ends! 🛷");
  if (!interactPressed) return;
  if (armedFor < HOME_CONFIRM_DELAY) {
    homeArmedAt = ctx.time; // still mashing: wait for a deliberate press
    return;
  }
  homeArmedAt = -1;
  endNight(true);
}

function updateCompass() {
  const lvl = ctx.stats.compassLevel;
  if (!lvl) return;
  const target = ctx.collectables.nearest(player.position, lvl >= 2 ? {} : { type: 'present' });
  if (!target) {
    hud.setCompass(null, null);
    return;
  }
  const dx = target.item.position.x - player.position.x;
  const dz = target.item.position.z - player.position.z;
  const rel = Math.atan2(dx, dz) - rig.yaw;
  // screen right is -X when looking down +Z, so flip for a clockwise CSS angle
  hud.setCompass(-rel, lvl >= 3 ? target.dist : null);
}

function updateBuffs() {
  const buffs = [];
  const boost = ctx.run.speedBoostUntil - ctx.time;
  if (boost > 0) buffs.push({ icon: '🦌', label: 'Reindeer Ride', remaining: boost });
  const reveal = ctx.run.revealUntil - ctx.time;
  if (reveal > 0) buffs.push({ icon: '📡', label: 'Radar Ping', remaining: reveal });
  hud.setBuffs(buffs);
}

function updatePresentRespawn(dt) {
  respawnTimer += dt;
  if (respawnTimer < RESPAWN_EVERY) return;
  respawnTimer = 0;
  if (ctx.collectables.alive('present').length >= RESPAWN_BELOW) return;
  for (let tries = 0; tries < 10; tries++) {
    const spot = ctx.world.randomFreeSpot(ctx.rng, 12);
    if (Math.hypot(spot.x - player.position.x, spot.z - player.position.z) > 15) {
      ctx.collectables.spawnPresent(spot.x, spot.z);
      ctx.toast('An elf hid a new present somewhere! 🎁', '🧝');
      return;
    }
  }
}

function updatePlaying(dt) {
  const modal = popups.isModalOpen();
  if (input.pressed('Escape') && !modal) {
    pause();
    return;
  }
  if (input.pressed('Tab') && !modal) {
    pause();
    screens.showGallery('pause');
    return;
  }

  const drag = input.dragDelta();
  const wheel = input.wheelDelta();
  const clicked = input.clicked();

  if (modal) {
    rig.update(dt, { target: player.position, targetYaw: player.facing, moving: false, drag, wheel, world: ctx.world });
    return;
  }

  ctx.time += dt;
  const run = ctx.run;
  run.timeLeft -= dt;

  const boosted = ctx.time < run.speedBoostUntil;
  const move = input.moveVector();
  const slide = input.isDown('Space') || input.isDown('ShiftLeft');
  player.update(dt, {
    move,
    slide,
    cameraYaw: rig.yaw,
    world: ctx.world,
    speedMult: ctx.stats.speedMult * (boosted ? 2 : 1),
    iceGrip: ctx.stats.iceGrip,
    time: ctx.time,
  });

  const moving = player.speed > 0.5;
  rig.update(dt, {
    target: player.position,
    targetYaw: player.facing,
    moving,
    drag,
    wheel,
    world: ctx.world,
    speed: player.speed,
  });

  ctx.collectables.update(dt, ctx.time, player.position);
  ctx.companions.update(dt, ctx.time);
  ctx.world.update(dt, ctx.time);

  updateInteraction(input.pressed('KeyE') || input.pressed('Enter') || clicked);
  if (state !== 'playing') return; // flew home from the sleigh
  updateCompass();
  updateBuffs();
  updatePresentRespawn(dt);

  radar.update(dt, {
    playerPos: player.position,
    yaw: rig.yaw,
    items: ctx.collectables.alive(),
    stats: ctx.stats,
    revealAll: ctx.time < run.revealUntil,
    time: ctx.time,
  });

  const secs = Math.max(0, Math.ceil(run.timeLeft));
  hud.setTime(Math.max(0, run.timeLeft), ctx.stats.nightSeconds);
  if (secs <= 10 && secs !== lastTickSecond && secs > 0) sfx.play('tick');
  lastTickSecond = secs;
  // an item pulled just before morning still counts: let its ~1 s animation
  // (and its card, which freezes the clock) finish first, within a small cap
  if (run.timeLeft <= 0 && (!busy || run.timeLeft < -3)) endNight(false);
}

// Slow cinematic orbit around the village behind menus.
function updateBackdrop(dt, elapsed) {
  orbitAngle += dt * 0.06;
  const r = 26;
  const world = ctx.world;
  const cx = Math.sin(orbitAngle) * r;
  const cz = Math.cos(orbitAngle) * r;
  const ground = world ? world.heightAt(cx, cz) : 0;
  camera.position.set(cx, ground + 9 + Math.sin(elapsed * 0.2) * 0.6, cz);
  camera.lookAt(0, 2, 0);
  if (world) world.update(dt, elapsed);
  if (ctx.collectables) ctx.collectables.update(dt, elapsed, player.position);
  // keep Pip idling in the square
  player.update(dt, {
    move: { x: 0, y: 0 },
    slide: false,
    cameraYaw: 0,
    world,
    speedMult: 1,
    iceGrip: true,
    time: elapsed,
  });
}

// ---------------------------------------------------------------- debug keys
function refreshMenu() {
  if (screens.current === 'title' || screens.current === 'shop') screens.refresh();
}

// Own listener: input.js ignores keys aimed at a focused menu button, which is
// where F8/F9 are wanted most (title, workshop, pause).
const debugPressed = new Set();
if (DEBUG) {
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'F7' && e.code !== 'F8' && e.code !== 'F9') return;
    e.preventDefault(); // F7 would open Chrome's caret-browsing prompt (whose blur pauses)
    if (!e.repeat) debugPressed.add(e.code);
  });
}

function updateDebug() {
  if (!DEBUG || !debugPressed.size) return;
  const pressed = (code) => debugPressed.has(code);
  if (pressed('F9')) {
    save.totalPresents += 50;
    const fresh = checkMilestones(save);
    writeSave(save);
    applyCosmetics();
    ctx.toast(`Debug: +50 presents (total ${save.totalPresents})`, '🛠️');
    const inNight = state === 'playing' || state === 'paused';
    if (inNight) {
      ctx.run.newUnlocks.push(...fresh);
      if (isActive(save, 'puppy') && !ctx.companions.hasPuppy) ctx.companions.spawnPuppy();
    }
    // cards only over the running night (not over the pause menu or a screen)
    if (state === 'playing') {
      fresh.reduce((p, m) => p.then(() => (state === 'playing' ? popups.showUnlock(m) : null)), Promise.resolve());
    }
    refreshMenu();
  }
  if (pressed('F8')) {
    save.coins += 500;
    save.coinsEarned += 500;
    writeSave(save);
    hud.setCoins(save.coins);
    ctx.toast('Debug: +500 coins', '🛠️');
    refreshMenu();
  }
  if (pressed('F7')) endNight(false); // from playing or paused
  debugPressed.clear();
}

// ---------------------------------------------------------------- loop
let elapsed = 0;
let lastFrameMs = performance.now();
let frameErrors = 0;

function frame(nowMs) {
  // scheduled first so one bad frame can never stop the game for good
  requestAnimationFrame(frame);
  const dt = Math.min(Math.max(0, (nowMs - lastFrameMs) / 1000), 0.05);
  lastFrameMs = nowMs;
  elapsed += dt;

  try {
    updateDebug();
    if (state === 'playing') {
      updatePlaying(dt);
    } else if (state === 'paused') {
      if (input.pressed('Escape') && screens.current === 'pause') resume();
      input.dragDelta();
      input.wheelDelta();
      input.clicked();
    } else {
      updateBackdrop(dt, elapsed);
      input.dragDelta();
      input.wheelDelta();
      input.clicked();
    }
  } catch (err) {
    if (frameErrors++ < 5) console.error('[main] update failed', err);
  }
  try {
    sky.update(dt, elapsed, player.position);
    effects.update(dt, elapsed, { camera, playerPos: player.position });
    renderer.render(scene, camera);
  } catch (err) {
    if (frameErrors++ < 5) console.error('[main] render failed', err);
  }
  input.endFrame();
}

// ---------------------------------------------------------------- boot
function unlockAudioOnce() {
  sfx.unlock();
  applySettings();
  if (save.settings.music) sfx.startMusic();
  window.removeEventListener('pointerdown', unlockAudioOnce);
  window.removeEventListener('keydown', unlockAudioOnce);
}
window.addEventListener('pointerdown', unlockAudioOnce);
window.addEventListener('keydown', unlockAudioOnce);

window.addEventListener('blur', () => {
  if (state === 'playing') pause();
});

// A reload or closed tab mid-night keeps everything earned so far (coins from
// late surprises are otherwise only written with the next item or night end).
// The cloud copy is best-effort here (held during a night): the next visit's
// first sync merges anything that did not make it.
window.addEventListener('pagehide', () => {
  writeSave(save);
  cloud.flush();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  writeSave(save);
  cloud.flush();
});

applySettings();
buildWorld(randomSeed(), { populate: true });
hud.hide();
screens.showTitle();
requestAnimationFrame(frame);
cloud.start();
pwa.start();
// best-effort: makes browsers less eager to clear the local save (and the guest sign-in)
try {
  navigator.storage?.persist?.().catch(() => {});
} catch {
  /* not supported */
}

if (DEBUG) {
  window.__game = { ctx, save, cloud, pwa, startNight, endNight, get state() { return state; } };
}
