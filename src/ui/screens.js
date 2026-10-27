// Full-screen menus for Pip's Christmas Eve Hunt: Title, Results, Santa's
// Workshop (Upgrades / Rewards / Wardrobe), Joke Gallery, Pause and Help.
// Everything is plain DOM + CSS (see screens.css): a cosy storybook-scrapbook
// look with washi tape, ribbon banners, candy stripes and CSS doodles of Pip.

import './screens.css';
import { JOKES, JOKE_COUNTS } from '../data/jokes.js';
import { SURPRISES } from '../game/surprises.js';
import { UPGRADES, MAX_LEVEL, upgradeLevel, nextCost, buyUpgrade, computeStats } from '../game/upgrades.js';
import { MILESTONES, getMilestone, isUnlocked, isActive, nextMilestone } from '../game/milestones.js';
import { RARITY_COINS } from '../game/crackers.js';
import { defaultSave } from '../core/save.js';

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

const KIND_INFO = {
  joke: { icon: '😂', label: 'Joke', plural: 'Jokes' },
  quote: { icon: '💬', label: 'Quote', plural: 'Quotes' },
  secret: { icon: '🤫', label: 'Secret', plural: 'Secrets' },
};
const RARITY_LABEL = { common: 'Common', rare: 'Rare', legendary: 'Legendary' };

const FILTERS = [
  { id: 'all', icon: '🎄', label: 'All' },
  { id: 'joke', icon: '😂', label: 'Jokes' },
  { id: 'quote', icon: '💬', label: 'Quotes' },
  { id: 'secret', icon: '🤫', label: 'Secrets' },
];

const SETTINGS = [
  { key: 'sfx', icon: '🔊', off: '🔈', label: 'Sounds' },
  { key: 'music', icon: '🎵', off: '🎵', label: 'Music' },
  { key: 'voice', icon: '🗣️', off: '🗣️', label: 'Voice' },
];

const SHOP_TABS = [
  { id: 'upgrades', icon: '🛠️', label: 'Upgrades' },
  { id: 'rewards', icon: '🏆', label: 'Rewards' },
  { id: 'wardrobe', icon: '🧣', label: 'Wardrobe' },
];

// Matches main.js / input.js: slide = Space or left Shift, interact = E /
// Enter / click, Tab = peek at the Gallery, touch = left-side joystick.
const DEFAULT_CONTROLS = [
  { keys: ['W', 'A', 'S', 'D'], text: 'or the arrow keys to waddle about' },
  { keys: ['Drag'], text: 'the mouse (or a finger) to look around' },
  { keys: ['Wheel'], text: 'or pinch to zoom in and out' },
  { keys: ['E', 'Click'], text: 'to pull a cracker or open a present' },
  { keys: ['Space', 'Shift'], text: 'hold while moving to belly-slide! Wheee!' },
  { keys: ['Tab'], text: 'to peek at your Joke Gallery' },
  { keys: ['Esc'], text: 'to pause the night' },
  { keys: ['Touch'], text: 'the left side of the screen to waddle on a tablet' },
];

const CARD_TINTS = ['mint', 'blush', 'butter', 'sky', 'lilac'];
const BURST_CHARS = ['✦', '★', '❄', '✧', '●'];
const BURST_COLORS = ['#ffc94a', '#e63946', '#2a9d6f', '#4d96ff', '#ff8fc7', '#c77dff'];
const CONFETTI_COLORS = ['#e63946', '#ffc94a', '#2a9d6f', '#4d96ff', '#ff8fc7', '#ffffff', '#c77dff'];

// Keys kept away from the game's input while a menu is open (see onMenuKeyGuard).
const MENU_KEYS = new Set([
  'Space',
  ' ',
  'Spacebar',
  'Enter',
  'NumpadEnter',
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyE',
  'PageUp',
  'PageDown',
  'Home',
  'End',
]);

const GALLERY_BACKS = new Set(['title', 'shop', 'pause', 'results']);
const HELP_BACKS = new Set(['title', 'pause']);
const SHOP_BACKS = new Set(['title', 'results']);

// ---------------------------------------------------------------------------
// Tiny DOM helpers
// ---------------------------------------------------------------------------

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v; // static, trusted markup only (doodles)
      else if (k === 'style') {
        for (const s in v) {
          if (s.includes('-')) el.style.setProperty(s, v[s]);
          else el.style[s] = v[s];
        }
      } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  addKids(el, kids);
  return el;
}

function addKids(el, kids) {
  for (const k of kids) {
    if (k == null || k === false || k === true) continue;
    if (Array.isArray(k)) addKids(el, k);
    else if (typeof k === 'object' && k.nodeType) el.appendChild(k);
    else el.appendChild(document.createTextNode(String(k)));
  }
}

function fmt(n) {
  const v = Math.round(Number(n) || 0);
  try {
    return v.toLocaleString('en-GB');
  } catch {
    return String(v);
  }
}

function plural(n, one, many = one + 's') {
  return `${fmt(n)} ${Math.round(n) === 1 ? one : many}`;
}

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function prefersReducedMotion() {
  try {
    return !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function restartAnim(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth; // reflow so the animation plays again
  el.classList.add(cls);
}

// Fills in any missing save fields so the shared helpers never throw.
function normaliseSave(s, fallback) {
  const save = s && typeof s === 'object' ? s : fallback;
  if (!save.upgrades || typeof save.upgrades !== 'object') save.upgrades = {};
  if (!save.wardrobe || typeof save.wardrobe !== 'object') save.wardrobe = {};
  if (!save.settings || typeof save.settings !== 'object') save.settings = { sfx: true, music: true, voice: true };
  if (!Array.isArray(save.foundJokes)) save.foundJokes = [];
  if (!Array.isArray(save.unlocked)) save.unlocked = [];
  for (const k of ['coins', 'totalPresents', 'totalCrackers', 'nights', 'bestPresentsInNight']) {
    if (!Number.isFinite(save[k])) save[k] = 0;
  }
  return save;
}

const JOKE_LIST = Array.isArray(JOKES) ? JOKES.filter((j) => j && j.id) : [];
const JOKE_INDEX = new Map(JOKE_LIST.map((j, i) => [j.id, i]));
const SURPRISE_LIST = Array.isArray(SURPRISES) ? SURPRISES.filter((s) => s && s.id) : [];

// A few extra rules that live with the code that needs them: the "NEW!"
// sticker and flash on gallery cards found tonight, the divider before the
// "???" cards, and a tighter Workshop on short windows (≈530–700 px tall) so
// the first row of upgrade cards shows its Buy buttons without scrolling.
const EXTRA_CSS = `
.scr-jcard__new {
  position: absolute;
  z-index: 3;
  top: -12px;
  left: -8px;
  padding: 3px 10px 4px;
  border: var(--line);
  border-radius: 999px;
  background: linear-gradient(#fff3b0, var(--gold));
  box-shadow: 0 3px 0 var(--ink);
  color: var(--ink);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.1;
  rotate: -8deg;
  pointer-events: none;
  animation: scr-newpop 0.5s cubic-bezier(0.3, 1.6, 0.5, 1) backwards;
  animation-delay: calc(var(--i, 0) * 22ms + 0.2s);
}
.scr-jcard.is-new .scr-jcard__face {
  animation: scr-newflash 0.9s ease-in-out 4;
  animation-delay: calc(var(--i, 0) * 22ms + 0.35s);
}
.scr-grid__divider {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 8px 0 -2px;
  color: var(--ink-soft);
  font-size: 0.95rem;
  font-weight: 600;
}
.scr-grid__divider::before,
.scr-grid__divider::after {
  content: '';
  flex: 1;
  border-top: 3px dashed rgba(42, 27, 61, 0.18);
}
@keyframes scr-newpop {
  from {
    opacity: 0;
    scale: 0.3;
  }
}
@keyframes scr-newflash {
  0%,
  100% {
    box-shadow:
      0 5px 0 rgba(42, 27, 61, 0.55),
      0 0 0 0 rgba(255, 201, 74, 0);
  }
  50% {
    box-shadow:
      0 5px 0 rgba(42, 27, 61, 0.55),
      0 0 0 5px rgba(255, 201, 74, 0.95),
      0 0 22px 8px rgba(255, 201, 74, 0.6);
  }
}
@media (max-height: 700px) {
  .scr-shop .scr-sub {
    display: none;
  }
  /* 24 + 26 (book top) + page + 8 fits the window, so the overlay itself
     never scrolls a few pixels under the page */
  .scr--shop .scr-stage {
    padding-top: 24px;
    padding-bottom: 8px;
  }
  .scr-shop .scr-page {
    max-height: calc(100vh - 60px);
    max-height: calc(100dvh - 60px);
  }
  .scr-shop .scr-head {
    gap: 4px;
    padding-bottom: 6px;
  }
  .scr-shop .scr-tabs {
    gap: 8px;
    margin-top: 2px;
  }
  .scr-shop .scr-tab {
    min-height: 38px;
    padding: 4px 14px;
    font-size: 0.98rem;
  }
  .scr-shop .scr-body {
    padding-top: 4px;
    padding-bottom: 12px;
  }
  .scr-shop .scr-foot {
    gap: 10px;
    padding-top: 8px;
    padding-bottom: 10px;
  }
  .scr-shop .scr-foot .scr-btn {
    min-height: 42px;
    padding: 0.4em 1.1em 0.45em;
    font-size: 1rem;
  }
  .scr-shop .scr-foot .scr-btn--big {
    min-height: 46px;
    font-size: 1.12rem;
  }
  .scr-shop .scr-hintline {
    margin-bottom: 2px;
    font-size: 0.9rem;
  }
  .scr-shop .scr-upgrades {
    gap: 18px 14px;
    padding-top: 12px;
  }
  .scr-shop .scr-upg {
    gap: 3px;
    padding: 18px 12px 12px;
  }
  .scr-shop .scr-upg__orn {
    width: 46px;
    height: 46px;
    margin-top: 4px;
    font-size: 1.45rem;
  }
  .scr-shop .scr-upg__name {
    margin-top: 2px;
    font-size: 1.05rem;
  }
  .scr-shop .scr-upg__blurb {
    font-size: 0.82rem;
    line-height: 1.25;
  }
  .scr-shop .scr-upg__next {
    margin-bottom: 4px;
    font-size: 0.84rem;
    line-height: 1.25;
  }
  .scr-shop .scr-buy {
    min-height: 38px;
    padding: 4px 14px 5px;
  }
}
`;

function injectExtraCss() {
  if (typeof document === 'undefined') return;
  const id = 'scr-extra-css';
  let tag = document.getElementById(id);
  if (!tag) {
    tag = document.createElement('style');
    tag.id = id;
    document.head.appendChild(tag);
  }
  if (tag.textContent !== EXTRA_CSS) tag.textContent = EXTRA_CSS;
}

// Scrolls the page body that holds `node` back to its top (tab / filter change).
function scrollBodyTop(node) {
  const body = node && typeof node.closest === 'function' ? node.closest('.scr-body') : null;
  if (body) body.scrollTop = 0;
}

function jokeTotal() {
  const t = JOKE_COUNTS && Number(JOKE_COUNTS.total);
  return Number.isFinite(t) && t > 0 ? t : JOKE_LIST.length;
}

function countFound(save) {
  const found = new Set(save.foundJokes);
  let n = 0;
  for (const j of JOKE_LIST) if (found.has(j.id)) n++;
  return n;
}

function surpriseDef(id) {
  return SURPRISE_LIST.find((s) => s.id === id) || { id, name: String(id), icon: '🎁' };
}

function cosmeticsOf(save) {
  return {
    scarf: isActive(save, 'scarf'),
    puppy: isActive(save, 'puppy'),
    candy: isActive(save, 'candyTheme'),
    trail: isActive(save, 'trail'),
    party: isActive(save, 'partySky'),
    jumper: isActive(save, 'jumper'),
  };
}

// Milestone progress as a 0..1 fraction where every stop is equally spaced.
function trackFraction(total) {
  const counts = [0, ...MILESTONES.map((m) => m.count)];
  const n = counts.length - 1;
  if (n <= 0) return 0;
  if (total >= counts[n]) return 1;
  for (let k = 0; k < n; k++) {
    if (total < counts[k + 1]) {
      const seg = (total - counts[k]) / Math.max(1, counts[k + 1] - counts[k]);
      return (k + clamp01(seg)) / n;
    }
  }
  return 1;
}

function speakText(joke) {
  if (!joke) return '';
  const q = joke.q || '';
  const a = joke.a || '';
  if (joke.kind === 'joke') return a ? `${q} ... ${a}` : q;
  return a ? `${q}. ${a}` : q;
}

function backText(joke) {
  if (joke.a) return joke.a;
  if (joke.kind === 'quote') return '— author unknown (probably an elf)';
  return '…';
}

// ---------------------------------------------------------------------------
// CSS doodles (static markup)
// ---------------------------------------------------------------------------

function pipHTML({ scarf = false, jumper = false, crown = false, wave = false, sleepy = false } = {}) {
  const mods = [
    scarf && 'has-scarf',
    jumper && 'has-jumper',
    crown && 'has-crown',
    wave && 'is-waving',
    sleepy && 'is-sleepy',
  ]
    .filter(Boolean)
    .join(' ');
  return `<div class="scr-pip ${mods}">
  <div class="scr-pip__shadow"></div>
  <div class="scr-pip__foot scr-pip__foot--l"></div>
  <div class="scr-pip__foot scr-pip__foot--r"></div>
  <div class="scr-pip__wrap">
    <div class="scr-pip__flip scr-pip__flip--l"></div>
    <div class="scr-pip__flip scr-pip__flip--r"></div>
    <div class="scr-pip__body">
      <div class="scr-pip__belly"></div>
      <div class="scr-pip__face"></div>
      <div class="scr-pip__jumper"><i>★</i></div>
      <div class="scr-pip__eye scr-pip__eye--l"></div>
      <div class="scr-pip__eye scr-pip__eye--r"></div>
      <div class="scr-pip__cheek scr-pip__cheek--l"></div>
      <div class="scr-pip__cheek scr-pip__cheek--r"></div>
      <div class="scr-pip__beak"></div>
    </div>
    <div class="scr-pip__scarf"><i></i></div>
    <div class="scr-pip__hat"></div>
    <div class="scr-pip__crown"></div>
  </div>
</div>`;
}

function giftHTML(cls = '') {
  return `<div class="scr-gift ${cls}">
  <div class="scr-gift__box"></div>
  <div class="scr-gift__lid"></div>
  <div class="scr-gift__bow"><i></i><i></i><b></b></div>
</div>`;
}

function treeHTML(cls = '') {
  return `<div class="scr-tree ${cls}">
  <span class="scr-tree__trunk"></span>
  <i class="scr-tree__t1"></i><i class="scr-tree__t2"></i><i class="scr-tree__t3"></i>
  <b class="scr-tree__star">★</b>
</div>`;
}

function crackerHTML(cls = '') {
  return `<div class="scr-cracker ${cls}"><i class="scr-cracker__l"></i><i class="scr-cracker__r"></i><b></b></div>`;
}

function pupHTML(cls = '') {
  return `<div class="scr-pup ${cls}">
  <div class="scr-pup__tail"></div>
  <div class="scr-pup__body"><i></i><i></i></div>
  <div class="scr-pup__collar"><b></b></div>
  <div class="scr-pup__head">
    <i class="scr-pup__ear scr-pup__ear--l"></i><i class="scr-pup__ear scr-pup__ear--r"></i>
    <div class="scr-pup__face">
      <i class="scr-pup__eye scr-pup__eye--l"></i><i class="scr-pup__eye scr-pup__eye--r"></i>
      <i class="scr-pup__nose"></i><i class="scr-pup__tongue"></i>
    </div>
  </div>
</div>`;
}

function coin() {
  return h('span', { class: 'scr-coin', 'aria-hidden': 'true' });
}

function sceneHTML(save, { crown = true, wave = true, extras = true } = {}) {
  const c = cosmeticsOf(save);
  const mods = [c.candy && 'is-candy', c.party && 'is-party', c.trail && 'has-trail', c.puppy && 'has-puppy']
    .filter(Boolean)
    .join(' ');
  return `<div class="scr-scene ${mods}" aria-hidden="true">
  <div class="scr-scene__glow"></div>
  <div class="scr-scene__aurora"></div>
  ${extras ? treeHTML('scr-scene__tree') : ''}
  <div class="scr-scene__mound"></div>
  <div class="scr-scene__trail"><i></i><i></i><i></i><i></i><i></i></div>
  <div class="scr-scene__pip">${pipHTML({ scarf: c.scarf, jumper: c.jumper, crown, wave })}</div>
  ${c.puppy ? `<div class="scr-scene__pup">${pupHTML()}</div>` : ''}
  ${extras ? `<div class="scr-scene__gift">${giftHTML()}</div>` : ''}
  ${extras ? `<div class="scr-scene__cracker">${crackerHTML()}</div>` : ''}
  ${extras ? '<div class="scr-scene__gift2">' + giftHTML('scr-gift--small') + '</div>' : ''}
</div>`;
}

function hollyHTML(cls = '') {
  return `<span class="scr-holly ${cls}" aria-hidden="true"><i></i><i></i><b></b><b></b><b></b></span>`;
}

// ---------------------------------------------------------------------------
// createScreens
// ---------------------------------------------------------------------------

export function createScreens(root, deps = {}) {
  deps = deps || {};
  const host =
    root ||
    (typeof document !== 'undefined' && (document.getElementById('screens') || document.body)) ||
    null;

  const state = {
    current: null,
    gen: 0,
    timers: new Set(),
    lastFire: 0,
    opens: 0, // bumped by every open(), so a new screen may fire again at once
    firedOpen: -1,
    audioUnlocked: false,
    keyGestureSeen: false,
    galleryBack: 'title',
    galleryPeek: false, // opened by main.js's Tab peek: Back returns to the night
    galleryFilter: 'all',
    nightFoundStart: null, // save.foundJokes.length when the current night began
    helpBack: 'title',
    shopBack: 'title',
    shopTab: 'upgrades',
    shop: null, // { panel, purseNum, purse, tabs }
    lastSummary: null,
    confirmReset: false,
    fallbackSave: defaultSave(),
  };

  // ---- dependency wrappers (never throw) ----
  const getSave = () => {
    let s = null;
    try {
      s = deps.getSave ? deps.getSave() : null;
    } catch (err) {
      console.error('[screens] getSave failed', err);
    }
    return normaliseSave(s, state.fallbackSave);
  };
  const persist = () => {
    try {
      deps.persist?.();
    } catch (err) {
      console.error('[screens] persist failed', err);
    }
  };
  const settingsChanged = () => {
    try {
      deps.onSettingsChanged?.();
    } catch (err) {
      console.error('[screens] onSettingsChanged failed', err);
    }
  };
  const play = (name) => {
    try {
      deps.sfx?.play?.(name);
    } catch {
      /* audio is optional */
    }
  };
  const speak = (text) => {
    if (!text) return;
    try {
      deps.sfx?.speak?.(text);
    } catch {
      /* speech is optional */
    }
  };
  // Game-state transitions (start, resume, quit…). Only one may fire within
  // 450 ms unless a new screen has been opened since, so a double-click can
  // never start two nights, while a fresh Pause opened right after a resume
  // still reacts to Escape at once.
  // `fallback` runs when the callback returned without changing the screen
  // (main.js did not call hideAll/showX itself), so a menu can never be left
  // covering a running night.
  const fire = (fn, fallback) => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (state.firedOpen === state.opens && now - state.lastFire < 450) return;
    state.firedOpen = state.opens;
    state.lastFire = now;
    if (typeof fn !== 'function') {
      console.warn('[screens] no callback wired for this button');
      return;
    }
    const gen = state.gen;
    try {
      fn();
    } catch (err) {
      console.error('[screens] callback failed', err);
      return;
    }
    if (fallback && gen === state.gen) fallback();
  };
  const goHomeFn = () => deps.onGoHome || deps.onEndNight || null;
  // Start / Next Night: remembers how many jokes were already found, so the
  // Gallery can tell which cards are new tonight.
  const startNight = () => {
    const before = getSave().foundJokes.length;
    const fn =
      typeof deps.onStartNight === 'function'
        ? () => {
            state.nightFoundStart = before;
            deps.onStartNight();
          }
        : deps.onStartNight;
    fire(fn, hideAll);
  };

  // ---- timers scoped to the current screen ----
  function later(fn, ms) {
    const gen = state.gen;
    const id = setTimeout(() => {
      state.timers.delete(id);
      if (gen === state.gen) fn();
    }, ms);
    state.timers.add(id);
    return id;
  }
  function clearTimers() {
    for (const id of state.timers) clearTimeout(id);
    state.timers.clear();
    state.gen++;
  }

  // ---- root overlay ----
  const el = h('div', {
    class: 'scr hidden',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': "Pip's Christmas Eve Hunt",
  });
  const snow = h('div', { class: 'scr-snow', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
  const stage = h('div', { class: 'scr-stage' });
  el.append(snow, stage);
  if (host) host.appendChild(el);
  injectExtraCss();

  el.addEventListener('pointerdown', unlockAudio);
  el.addEventListener('keydown', unlockAudio);

  // sfx.unlock() is safe to call on every gesture (it re-wakes a context the
  // browser refused to start, e.g. when the very first key was Escape).
  // `withMusic` mirrors main.js's first-gesture handler: start the music if
  // the setting is on (startMusic is idempotent).
  function unlockAudio(withMusic) {
    state.audioUnlocked = true;
    try {
      deps.sfx?.unlock?.();
      if (withMusic === true && getSave().settings.music !== false) deps.sfx?.startMusic?.();
    } catch {
      /* ignore */
    }
  }

  function open(name, build) {
    clearTimers();
    state.opens++;
    const wasHidden = state.current === null;
    state.current = name;
    state.shop = null;
    if (name !== 'title') state.confirmReset = false;
    el.className = `scr scr--${name}${wasHidden ? ' scr--in' : ''}`;
    let content;
    try {
      content = build();
    } catch (err) {
      console.error(`[screens] failed to build ${name}`, err);
      content = errorCard();
    }
    stage.replaceChildren(content);
    stage.scrollTop = 0;
    const first = stage.querySelector('[data-autofocus]');
    if (first) {
      try {
        first.focus({ preventScroll: true });
      } catch {
        first.focus();
      }
    }
    try {
      deps.onScreenChange?.(name);
    } catch {
      /* optional */
    }
  }

  function hideAll() {
    clearTimers();
    const was = state.current;
    state.current = null;
    state.shop = null;
    state.confirmReset = false;
    el.className = 'scr hidden';
    stage.replaceChildren();
    if (was !== null) {
      try {
        deps.onScreenChange?.(null);
      } catch {
        /* optional */
      }
    }
  }

  function errorCard() {
    return h(
      'div',
      { class: 'scr-card scr-pause' },
      h('h2', { class: 'scr-card__title' }, 'Oops! A snowdrift!'),
      h('p', { class: 'scr-card__sub' }, 'Something got stuck in the snow.'),
      h('div', { class: 'scr-stack' }, button('Back to title', { icon: '🏠', variant: 'red', autofocus: true, onClick: showTitle }))
    );
  }

  // ---- Escape = back ----
  function onKeyDown(e) {
    if (state.current === null) return;
    if (e.code !== 'Escape' && e.key !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    goBack();
  }
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKeyDown, true);

  // While a menu is open, menu keys stop at `document` (bubble phase: after the
  // menu's own buttons/cards have handled them, before window listeners).
  // Otherwise input.js would preventDefault Space/Tab/arrows on window (so
  // Space could not press a focused button, Tab could not move focus and
  // arrows could not scroll), and the Enter that presses "Resume" would also
  // count as an interact press in the first frame of the night.
  // keyup is never stopped, so held keys are always released.
  function onMenuKeyGuard(e) {
    if (state.current === null) return;
    const code = e.code || e.key;
    if (!MENU_KEYS.has(code)) return;
    e.stopPropagation();
    if (!state.keyGestureSeen) {
      // main.js unlocks audio and starts music from a window keydown listener,
      // which these keys no longer reach, so do the same here once.
      state.keyGestureSeen = true;
      unlockAudio(true);
    }
  }
  if (typeof document !== 'undefined') document.addEventListener('keydown', onMenuKeyGuard);

  function goBack() {
    switch (state.current) {
      case 'title':
        if (state.confirmReset) {
          state.confirmReset = false;
          renderResetArea();
        }
        break;
      case 'results':
        play('click');
        showTitle();
        break;
      case 'shop':
        play('click');
        leaveShop();
        break;
      case 'gallery':
        play('click');
        leaveGallery();
        break;
      case 'help':
        play('click');
        leaveHelp();
        break;
      case 'pause':
        fire(deps.onResume, hideAll);
        break;
      default:
        break;
    }
  }

  function leaveShop() {
    if (state.shopBack === 'results' && state.lastSummary) renderResults(state.lastSummary, true);
    else showTitle();
  }
  function leaveGallery() {
    const b = state.galleryBack;
    if (b === 'pause' && state.galleryPeek && typeof deps.onResume === 'function') fire(deps.onResume, hideAll);
    else if (b === 'shop') openShop(state.shopBack);
    else if (b === 'pause') showPause();
    else if (b === 'results' && state.lastSummary) renderResults(state.lastSummary, true);
    else showTitle();
  }
  function leaveHelp() {
    if (state.helpBack === 'pause') showPause();
    else showTitle();
  }

  // ---------------------------------------------------------------------------
  // Shared widgets
  // ---------------------------------------------------------------------------

  function button(label, { icon, variant = 'red', size = '', autofocus = false, onClick, cls = '', aria } = {}) {
    const b = h(
      'button',
      {
        type: 'button',
        class: `scr-btn scr-btn--${variant}${size ? ` scr-btn--${size}` : ''}${cls ? ` ${cls}` : ''}`,
        'data-autofocus': autofocus || null,
        'aria-label': aria || null,
      },
      icon ? h('span', { class: 'scr-btn__icon', 'aria-hidden': 'true' }, icon) : null,
      h('span', { class: 'scr-btn__label' }, label)
    );
    b.addEventListener('click', (e) => {
      if (typeof onClick === 'function') onClick(e, b);
    });
    return b;
  }

  function setLabel(btn, text) {
    const l = btn && btn.querySelector('.scr-btn__label');
    if (l) l.textContent = text;
  }

  function settingsToggles(compact = false) {
    const save = getSave();
    return h(
      'div',
      { class: `scr-toggles${compact ? ' scr-toggles--compact' : ''}`, role: 'group', 'aria-label': 'Sound settings' },
      SETTINGS.map((s) => {
        const on = save.settings[s.key] !== false;
        const icon = h('span', { class: 'scr-toggle__icon', 'aria-hidden': 'true' }, on ? s.icon : s.off);
        const t = h(
          'button',
          { type: 'button', class: 'scr-toggle', 'aria-pressed': on ? 'true' : 'false', title: s.label },
          icon,
          h('span', { class: 'scr-toggle__label' }, s.label),
          h('span', { class: 'scr-toggle__sw', 'aria-hidden': 'true' }, h('i'))
        );
        t.addEventListener('click', () => {
          const sv = getSave();
          const next = sv.settings[s.key] === false;
          sv.settings[s.key] = next;
          t.setAttribute('aria-pressed', next ? 'true' : 'false');
          icon.textContent = next ? s.icon : s.off;
          persist();
          settingsChanged();
          if (next && s.key === 'sfx') play('click');
          else if (s.key !== 'sfx') play('click');
          restartAnim(t, 'is-boing');
        });
        return t;
      })
    );
  }

  function page({ cls = '', title, icon, sub, headExtra, corner }, body, foot) {
    return h(
      'div',
      { class: `scr-book ${cls}` },
      h(
        'section',
        { class: 'scr-page' },
        h('span', { class: 'scr-tape scr-tape--l', 'aria-hidden': 'true' }),
        h('span', { class: 'scr-tape scr-tape--r', 'aria-hidden': 'true' }),
        h('span', { html: hollyHTML('scr-page__holly') }).firstChild,
        corner || null,
        h(
          'header',
          { class: 'scr-head' },
          h(
            'h2',
            { class: 'scr-banner' },
            icon ? h('span', { class: 'scr-banner__icon', 'aria-hidden': 'true' }, icon) : null,
            h('span', null, title)
          ),
          sub ? h('p', { class: 'scr-sub' }, sub) : null,
          headExtra || null
        ),
        h('div', { class: 'scr-body' }, body),
        foot ? h('footer', { class: 'scr-foot' }, foot, h('span', { class: 'scr-hint' }, 'Esc = back')) : null
      )
    );
  }

  function progressBar(fraction, cls = '') {
    return h(
      'div',
      { class: `scr-bar ${cls}`, role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(clamp01(fraction) * 100)) },
      h('i', { style: { width: `${(clamp01(fraction) * 100).toFixed(1)}%` } })
    );
  }

  function burst(target, n = 12) {
    if (!target || prefersReducedMotion()) return;
    const layer = h('div', { class: 'scr-burst', 'aria-hidden': 'true' });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      const d = 46 + Math.random() * 54;
      layer.appendChild(
        h(
          'i',
          {
            style: {
              '--dx': `${(Math.cos(a) * d).toFixed(1)}px`,
              '--dy': `${(Math.sin(a) * d).toFixed(1)}px`,
              '--rot': `${Math.round(Math.random() * 360)}deg`,
              '--c': BURST_COLORS[i % BURST_COLORS.length],
              '--delay': `${Math.round(Math.random() * 90)}ms`,
            },
          },
          BURST_CHARS[i % BURST_CHARS.length]
        )
      );
    }
    target.appendChild(layer);
    later(() => layer.remove(), 1100);
  }

  function confettiLayer(count = 46) {
    if (prefersReducedMotion()) return null;
    const layer = h('div', { class: 'scr-confetti', 'aria-hidden': 'true' });
    for (let i = 0; i < count; i++) {
      layer.appendChild(
        h('i', {
          style: {
            left: `${(Math.random() * 100).toFixed(1)}%`,
            '--c': CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            '--delay': `${(Math.random() * 1.2).toFixed(2)}s`,
            '--dur': `${(2.2 + Math.random() * 1.6).toFixed(2)}s`,
            '--drift': `${Math.round(Math.random() * 120 - 60)}px`,
            '--spin': `${Math.round(360 + Math.random() * 720)}deg`,
            '--w': `${Math.round(6 + Math.random() * 6)}px`,
          },
        })
      );
    }
    return layer;
  }

  // Animated number: eases from 0 to target. `format` builds the text.
  function countUp(node, target, { delay = 0, dur = 1100, format = fmt, onDone } = {}) {
    const goal = Math.round(Number(target) || 0);
    if (prefersReducedMotion() || goal === 0 || typeof requestAnimationFrame !== 'function') {
      node.textContent = format(goal);
      if (onDone) later(onDone, delay);
      return;
    }
    node.textContent = format(0);
    const gen = state.gen;
    let start = -1;
    const step = (now) => {
      if (gen !== state.gen) return;
      if (start < 0) start = now + delay;
      const t = clamp01((now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      node.textContent = format(Math.round(goal * eased));
      if (t < 1) requestAnimationFrame(step);
      else {
        restartAnim(node, 'is-landed');
        onDone?.();
      }
    };
    requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------------------
  // TITLE
  // ---------------------------------------------------------------------------

  let resetArea = null;

  function showTitle() {
    open('title', buildTitle);
  }

  function logo() {
    const letters = (text, offset) =>
      Array.from(text).map((ch, i) =>
        ch === ' '
          ? h('span', { class: 'scr-logo__sp' }, ' ')
          : h('span', { class: 'scr-logo__l', style: { '--i': String(i + offset) } }, ch)
      );
    return h(
      'h1',
      { class: 'scr-logo', 'aria-label': "Pip's Christmas Eve Hunt" },
      h('span', { class: 'scr-logo__ribbon', 'aria-hidden': 'true' }, h('span', null, "Pip's")),
      h(
        'span',
        { class: 'scr-logo__main', 'aria-hidden': 'true' },
        h('span', { class: 'scr-logo__word' }, letters('Christmas', 0)),
        h('span', { class: 'scr-logo__sp' }, ' '),
        h('span', { class: 'scr-logo__word' }, letters('Eve', 10)),
        h('span', { class: 'scr-logo__sp' }, ' '),
        h('span', { class: 'scr-logo__word scr-logo__hunt' }, letters('Hunt!', 14))
      )
    );
  }

  function buildTitle() {
    const save = getSave();
    const legend = isUnlocked(save, 'jumper');
    const found = countFound(save);
    const total = jokeTotal();
    const next = nextMilestone(save);

    const sparkles = h(
      'div',
      { class: 'scr-logo-sparkles', 'aria-hidden': 'true' },
      ['✦', '✧', '❄', '✦', '★', '❄'].map((c, i) => h('i', { style: { '--i': String(i) } }, c))
    );

    const menu = h(
      'nav',
      { class: 'scr-menu', 'aria-label': 'Main menu' },
      button('Start Night', {
        icon: '🌙',
        variant: 'red',
        size: 'big',
        autofocus: true,
        onClick: () => {
          play('click');
          startNight();
        },
      }),
      button("Santa's Workshop", {
        icon: '🛠️',
        variant: 'green',
        onClick: () => {
          play('click');
          openShop('title');
        },
      }),
      button('Joke Gallery', {
        icon: '📖',
        variant: 'gold',
        onClick: () => {
          play('click');
          openGallery('title');
        },
      }),
      button('How to Play', {
        icon: '❓',
        variant: 'snow',
        onClick: () => {
          play('click');
          openHelp('title');
        },
      })
    );

    const stat = (icon, value, label) =>
      h(
        'span',
        { class: 'scr-stat' },
        h('span', { class: 'scr-stat__icon', 'aria-hidden': 'true' }, icon),
        h('b', null, value),
        h('span', { class: 'scr-stat__label' }, label)
      );

    const ticket = h(
      'div',
      { class: 'scr-ticket' },
      h(
        'div',
        { class: 'scr-ticket__stats' },
        stat('🌙', fmt(save.nights), save.nights === 1 ? 'night' : 'nights'),
        stat('🎁', fmt(save.totalPresents), save.totalPresents === 1 ? 'present' : 'presents'),
        stat('🎉', `${fmt(found)} / ${fmt(total)}`, 'jokes'),
        h(
          'span',
          { class: 'scr-stat' },
          coin(),
          h('b', null, fmt(save.coins)),
          h('span', { class: 'scr-stat__label' }, 'coins')
        )
      ),
      next
        ? h(
            'div',
            { class: 'scr-ticket__next' },
            h(
              'span',
              { class: 'scr-ticket__nexttext' },
              'Next reward: ',
              h('b', null, `${next.icon} ${next.name}`),
              ` — ${plural(Math.max(0, next.count - save.totalPresents), 'more present')}`
            ),
            progressBar(save.totalPresents / Math.max(1, next.count), 'scr-bar--thin')
          )
        : h('div', { class: 'scr-ticket__next' }, h('b', null, '🏆 Every reward unlocked! You are a true Present Legend!'))
    );

    resetArea = h('div', { class: 'scr-reset' });
    renderResetArea();

    return h(
      'div',
      { class: 'scr-title' },
      h('div', { class: 'scr-title__logo' }, sparkles, logo(), legend ? legendBadge() : null),
      h(
        'div',
        { class: 'scr-title__row' },
        h('div', { class: 'scr-title__art', html: sceneHTML(save) }),
        menu
      ),
      settingsToggles(),
      ticket,
      resetArea
    );
  }

  function legendBadge() {
    return h(
      'div',
      { class: 'scr-legend', title: 'Unlocked by opening 200 presents!' },
      h('span', { class: 'scr-legend__rosette', 'aria-hidden': 'true' }, '🏆'),
      h('span', { class: 'scr-legend__text' }, 'Present Legend')
    );
  }

  function renderResetArea() {
    if (!resetArea) return;
    if (!state.confirmReset) {
      resetArea.replaceChildren(
        h(
          'button',
          {
            type: 'button',
            class: 'scr-link',
            onclick: () => {
              play('click');
              state.confirmReset = true;
              renderResetArea();
            },
          },
          '🧹 Reset progress'
        )
      );
      return;
    }
    const no = button('Oops, no!', {
      variant: 'green',
      size: 'small',
      onClick: () => {
        play('click');
        state.confirmReset = false;
        renderResetArea();
      },
    });
    const yes = button('Yes, start fresh', {
      icon: '🧹',
      variant: 'red',
      size: 'small',
      onClick: () => {
        state.confirmReset = false;
        state.nightFoundStart = null;
        play('whoosh');
        try {
          deps.onResetSave?.();
        } catch (err) {
          console.error('[screens] onResetSave failed', err);
        }
        if (state.current === 'title') showTitle();
      },
    });
    resetArea.replaceChildren(
      h(
        'div',
        { class: 'scr-confirm', role: 'alertdialog', 'aria-label': 'Reset progress?' },
        h('p', null, h('b', null, 'Forget everything?'), ' All coins, upgrades, rewards and jokes will melt away like a snowman in spring. Pip will miss you!'),
        h('div', { class: 'scr-confirm__btns' }, no, yes)
      )
    );
    try {
      no.focus({ preventScroll: true });
    } catch {
      no.focus();
    }
    // on short windows the confirm buttons land below the fold
    const confirmBox = resetArea.firstElementChild;
    if (confirmBox && confirmBox.scrollIntoView) confirmBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // ---------------------------------------------------------------------------
  // RESULTS
  // ---------------------------------------------------------------------------

  function showResults(summary) {
    state.lastSummary = normaliseSummary(summary);
    // the night is over: from now on the summary says what was new tonight
    state.nightFoundStart = null;
    renderResults(state.lastSummary, false);
  }

  function normaliseSummary(s) {
    const src = s && typeof s === 'object' ? s : {};
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    // Accept joke / milestone objects (the contract) or bare ids, and drop
    // duplicates so a joke or reward is never celebrated twice.
    const uniq = (list, resolve) => {
      const out = [];
      const seen = new Set();
      for (const item of Array.isArray(list) ? list : []) {
        const v = typeof item === 'string' ? resolve(item) : item;
        if (!v || typeof v !== 'object') continue;
        const key = v.id ?? v;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(v);
      }
      return out;
    };
    return {
      seed: src.seed ?? '?',
      crackers: num(src.crackers),
      presents: num(src.presents),
      coinsEarned: num(src.coinsEarned),
      newJokes: uniq(src.newJokes, (id) => JOKE_LIST.find((j) => j.id === id)).filter((j) => j.q || j.a),
      newUnlocks: uniq(src.newUnlocks, (id) => getMilestone(id)),
      surprises: src.surprises && typeof src.surprises === 'object' ? src.surprises : {},
      endedEarly: !!src.endedEarly,
    };
  }

  function resultsLine(s) {
    if (s.endedEarly) return 'Pip waddled home early for a mug of hot cocoa. ☕';
    if (s.presents + s.crackers === 0) return 'A peaceful moonlit stroll. The treats are still out there somewhere!';
    if (s.presents >= 12) return "What a haul! Santa's elves are doing a happy dance!";
    if (s.presents >= 6) return 'Brilliant hunting, little penguin!';
    return 'Every present counts. Great job, Pip!';
  }

  function renderResults(s, instant) {
    open('results', () => buildResults(s, instant));
  }

  function buildResults(s, instant) {
    const save = getSave();
    const tiles = [];
    const tile = (icon, label, value, cls, format = fmt, extra = null) => {
      const num = h('span', { class: 'scr-tile__num' }, format(instant ? value : 0));
      tiles.push({ num, value, format });
      return h(
        'div',
        { class: `scr-tile ${cls}`, style: { '--i': String(tiles.length - 1) } },
        h('span', { class: 'scr-tile__icon', 'aria-hidden': 'true' }, icon),
        num,
        h('span', { class: 'scr-tile__label' }, label),
        extra
      );
    };
    const signed = (v) => (v >= 0 ? `+${fmt(v)}` : `−${fmt(Math.abs(v))}`);

    const record = s.presents > 0 && s.presents >= save.bestPresentsInNight;

    const tileRow = h(
      'div',
      { class: 'scr-tiles' },
      tile('🎉', s.crackers === 1 ? 'cracker pulled' : 'crackers pulled', s.crackers, 'scr-tile--red'),
      tile('🎁', s.presents === 1 ? 'present opened' : 'presents opened', s.presents, 'scr-tile--green'),
      tile(
        h('span', { class: 'scr-coin scr-coin--big' }),
        s.coinsEarned < 0 ? 'coins (a gremlin got some!)' : 'coins earned',
        s.coinsEarned,
        'scr-tile--gold',
        signed,
        h('span', { class: 'scr-tile__extra' }, 'Purse: ', coin(), ` ${fmt(save.coins)}`)
      )
    );

    const sections = [];

    if (record) {
      sections.push(h('div', { class: 'scr-record' }, h('span', { 'aria-hidden': 'true' }, '⭐'), ' Your best night yet! ', h('span', { 'aria-hidden': 'true' }, '⭐')));
    }

    // New unlocks
    if (s.newUnlocks.length) {
      sections.push(
        h(
          'section',
          { class: 'scr-section scr-unlocks' },
          h('h3', { class: 'scr-section__title' }, '🎊 New rewards unlocked!'),
          h(
            'div',
            { class: 'scr-unlocks__list' },
            s.newUnlocks.map((m, i) =>
              h(
                'div',
                { class: 'scr-unlock', style: { '--i': String(i) } },
                h('span', { class: 'scr-unlock__icon', 'aria-hidden': 'true' }, m.icon || '🎁'),
                h(
                  'div',
                  { class: 'scr-unlock__text' },
                  h('b', null, m.name || 'A new reward'),
                  h('span', null, m.desc || ''),
                  m.cosmetic ? h('em', null, 'Switch it on or off in the Wardrobe!') : null
                )
              )
            )
          )
        )
      );
    }

    // New jokes
    const jokesSection = h(
      'section',
      { class: 'scr-section' },
      h(
        'h3',
        { class: 'scr-section__title' },
        '📖 New for your Gallery ',
        h('span', { class: 'scr-chipcount' }, String(s.newJokes.length))
      )
    );
    if (s.newJokes.length) {
      jokesSection.appendChild(
        h(
          'div',
          { class: 'scr-minis' },
          s.newJokes.map((j, i) =>
            h(
              'article',
              { class: `scr-mini scr-mini--${j.rarity || 'common'}`, style: { '--i': String(Math.min(i, 12)) } },
              h(
                'span',
                { class: 'scr-mini__tag' },
                `${(KIND_INFO[j.kind] || KIND_INFO.joke).icon} ${RARITY_LABEL[j.rarity] || 'Common'}`
              ),
              h('p', { class: 'scr-mini__q' }, j.q || ''),
              j.a ? h('p', { class: 'scr-mini__a' }, j.a) : null,
              h(
                'button',
                {
                  type: 'button',
                  class: 'scr-say',
                  'aria-label': 'Read aloud',
                  title: 'Read aloud',
                  onclick: () => speak(speakText(j)),
                },
                '🔊'
              )
            )
          )
        )
      );
      jokesSection.appendChild(
        h(
          'div',
          { class: 'scr-section__more' },
          button('Open the Gallery', {
            icon: '📖',
            variant: 'snow',
            size: 'small',
            onClick: () => {
              play('click');
              openGallery('results');
            },
          })
        )
      );
    } else {
      jokesSection.appendChild(
        h('p', { class: 'scr-empty' }, s.crackers > 0 ? 'No brand-new jokes tonight, but the old ones are still funny!' : 'No crackers pulled tonight. They were hiding very well!')
      );
    }
    sections.push(jokesSection);

    // Surprises tally
    const ids = Object.keys(s.surprises).filter((id) => Number(s.surprises[id]) > 0);
    const surprisesSection = h('section', { class: 'scr-section' }, h('h3', { class: 'scr-section__title' }, '🎁 Present surprises'));
    if (ids.length) {
      // keep the canonical SURPRISES order, then any unknown ids
      const order = SURPRISE_LIST.map((d) => d.id).filter((id) => ids.includes(id));
      for (const id of ids) if (!order.includes(id)) order.push(id);
      surprisesSection.appendChild(
        h(
          'div',
          { class: 'scr-tally' },
          order.map((id, i) => {
            const d = surpriseDef(id);
            return h(
              'span',
              { class: 'scr-tally__chip', style: { '--i': String(i) }, title: d.name },
              h('span', { class: 'scr-tally__icon', 'aria-hidden': 'true' }, d.icon || '🎁'),
              h('span', { class: 'scr-tally__name' }, d.name),
              h('b', null, `×${fmt(s.surprises[id])}`)
            );
          })
        )
      );
    } else {
      surprisesSection.appendChild(h('p', { class: 'scr-empty' }, 'No presents opened tonight. The elves are very confused!'));
    }
    sections.push(surprisesSection);

    // Next milestone
    const next = nextMilestone(save);
    if (next) {
      sections.push(
        h(
          'div',
          { class: 'scr-nextbox' },
          h('span', { class: 'scr-nextbox__icon', 'aria-hidden': 'true' }, next.icon),
          h(
            'div',
            { class: 'scr-nextbox__text' },
            h('span', null, 'Next reward: ', h('b', null, next.name)),
            progressBar(save.totalPresents / Math.max(1, next.count)),
            h('small', null, `${fmt(save.totalPresents)} / ${fmt(next.count)} presents`)
          )
        )
      );
    }

    const confetti = s.newUnlocks.length || record ? (instant ? null : confettiLayer()) : null;

    const foot = [
      button("Santa's Workshop", {
        icon: '🛠️',
        variant: 'green',
        onClick: () => {
          play('click');
          openShop('results');
        },
      }),
      button('Next Night', {
        icon: '🌙',
        variant: 'red',
        size: 'big',
        autofocus: true,
        onClick: () => {
          play('click');
          startNight();
        },
      }),
      button('Title', {
        icon: '🏠',
        variant: 'snow',
        onClick: () => {
          play('click');
          showTitle();
        },
      }),
    ];

    const stamp = h(
      'div',
      { class: 'scr-stamp-seed', title: 'Every night has its own island map' },
      h('div', { class: 'scr-stamp-seed__in' }, h('small', null, '🏝️ MAP'), h('b', null, `#${s.seed}`))
    );

    const result = page(
      {
        cls: 'scr-results',
        title: s.endedEarly ? 'Home early!' : 'Christmas Eve is over!',
        icon: s.endedEarly ? '🏠' : '🌙',
        sub: resultsLine(s),
        corner: stamp,
      },
      [tileRow, sections],
      foot
    );
    if (confetti) result.appendChild(confetti);

    if (!instant) {
      tiles.forEach((t, i) => {
        countUp(t.num, t.value, {
          delay: 250 + i * 260,
          dur: 900,
          format: t.format,
          onDone: () => play(i === 2 ? 'coin' : 'pop'),
        });
      });
      if (s.newUnlocks.length) later(() => play('jingle'), 1300);
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // SHOP — Santa's Workshop
  // ---------------------------------------------------------------------------

  function showShop(back) {
    openShop(back);
  }

  function openShop(back) {
    state.shopBack = SHOP_BACKS.has(back) ? back : 'title';
    if (state.shopBack === 'results' && !state.lastSummary) state.shopBack = 'title';
    open('shop', buildShop);
    renderShopPanel();
  }

  function buildShop() {
    const save = getSave();
    const purseNum = h('b', { class: 'scr-purse__num' }, fmt(save.coins));
    const purse = h('div', { class: 'scr-purse', title: 'Your coins' }, h('span', { class: 'scr-coin scr-coin--big' }), purseNum);

    const tabs = h('div', { class: 'scr-tabs', role: 'tablist', 'aria-label': 'Workshop sections' });
    for (const t of SHOP_TABS) {
      const b = h(
        'button',
        {
          type: 'button',
          class: 'scr-tab',
          role: 'tab',
          'data-tab': t.id,
          'aria-selected': t.id === state.shopTab ? 'true' : 'false',
          'data-autofocus': t.id === state.shopTab ? true : null,
        },
        h('span', { 'aria-hidden': 'true' }, t.icon),
        ` ${t.label}`
      );
      b.addEventListener('click', () => {
        if (state.shopTab === t.id) return;
        play('click');
        state.shopTab = t.id;
        renderShopPanel();
        scrollBodyTop(panel);
      });
      tabs.appendChild(b);
    }
    tabs.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const i = SHOP_TABS.findIndex((t) => t.id === state.shopTab);
      const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + SHOP_TABS.length) % SHOP_TABS.length;
      state.shopTab = SHOP_TABS[n].id;
      play('click');
      renderShopPanel();
      scrollBodyTop(panel);
      tabs.querySelector(`[data-tab="${state.shopTab}"]`)?.focus();
    });

    const panel = h('div', { class: 'scr-panel', role: 'tabpanel' });

    const foot = [
      button('Start Night', {
        icon: '🌙',
        variant: 'red',
        size: 'big',
        onClick: () => {
          play('click');
          startNight();
        },
      }),
      button('Gallery', {
        icon: '📖',
        variant: 'gold',
        onClick: () => {
          play('click');
          openGallery('shop');
        },
      }),
      state.shopBack === 'results'
        ? button('Back', {
            icon: '↩',
            variant: 'snow',
            onClick: () => {
              play('click');
              leaveShop();
            },
          })
        : button('Title', {
            icon: '🏠',
            variant: 'snow',
            onClick: () => {
              play('click');
              showTitle();
            },
          }),
    ];

    const book = page(
      {
        cls: 'scr-shop',
        title: "Santa's Workshop",
        icon: '🛠️',
        sub: 'Ho ho ho! What would you like today, Pip?',
        headExtra: tabs,
        corner: purse,
      },
      panel,
      foot
    );
    state.shop = { panel, purseNum, purse, tabs };
    return book;
  }

  function renderShopPanel() {
    const refs = state.shop;
    if (!refs) return;
    const save = getSave();
    refs.purseNum.textContent = fmt(save.coins);
    for (const b of refs.tabs.querySelectorAll('.scr-tab')) {
      b.setAttribute('aria-selected', b.dataset.tab === state.shopTab ? 'true' : 'false');
      b.tabIndex = b.dataset.tab === state.shopTab ? 0 : -1;
    }
    let content;
    if (state.shopTab === 'rewards') content = rewardsPanel(save);
    else if (state.shopTab === 'wardrobe') content = wardrobePanel(save);
    else content = upgradesPanel(save);
    refs.panel.replaceChildren(content);
  }

  function upgradesPanel(save) {
    const cheapest = UPGRADES.reduce((m, u) => {
      const c = nextCost(save, u.id);
      return c === null ? m : Math.min(m, c);
    }, Infinity);
    const allMax = cheapest === Infinity;
    const hint = allMax
      ? h('p', { class: 'scr-hintline' }, '✨ Wow! Every upgrade is maxed out. Pip is the best-equipped penguin in the North Pole!')
      : save.coins < cheapest
        ? h('p', { class: 'scr-hintline' }, '🪙 Pull crackers and open presents to earn more coins!')
        : null;
    return h(
      'div',
      null,
      hint,
      h(
        'div',
        { class: 'scr-upgrades' },
        UPGRADES.map((u, i) => upgradeCard(u, save, i))
      )
    );
  }

  function upgradeCard(u, save, i) {
    const lvl = upgradeLevel(save, u.id);
    const cost = nextCost(save, u.id);
    const maxed = cost === null;
    const poor = !maxed && save.coins < cost;
    const levels = Array.isArray(u.levels) ? u.levels : [];

    const pips = h(
      'div',
      { class: 'scr-lvl', 'aria-label': `Level ${lvl} of ${MAX_LEVEL}` },
      Array.from({ length: MAX_LEVEL }, (_, k) => h('i', { class: k < lvl ? 'is-on' : '' })),
      h('span', { class: 'scr-lvl__text' }, maxed ? 'MAX' : `Lv ${lvl}/${MAX_LEVEL}`)
    );

    const card = h(
      'article',
      {
        class: `scr-upg scr-tint--${CARD_TINTS[i % CARD_TINTS.length]}${maxed ? ' is-max' : ''}${poor ? ' is-poor' : ''}`,
        'data-id': u.id,
        tabindex: '-1',
        style: { '--tilt': `${i % 2 ? 0.8 : -0.8}deg`, '--i': String(i) },
      },
      h('span', { class: 'scr-upg__tape', 'aria-hidden': 'true' }),
      h('div', { class: 'scr-upg__orn', 'aria-hidden': 'true' }, h('span', null, u.icon || '🎁')),
      h('h3', { class: 'scr-upg__name' }, u.name),
      h('p', { class: 'scr-upg__blurb' }, u.blurb || ''),
      pips,
      lvl > 0 ? h('p', { class: 'scr-upg__now' }, '✔ ', levels[lvl - 1] || '') : null,
      maxed
        ? h('p', { class: 'scr-upg__next' }, 'Fully upgraded! ✨')
        : h('p', { class: 'scr-upg__next' }, h('b', null, `Next: `), levels[lvl] || `Level ${lvl + 1}`)
    );

    if (maxed) {
      card.appendChild(h('div', { class: 'scr-upg__stamp' }, 'MAXED!'));
    } else {
      const buy = h(
        'button',
        {
          type: 'button',
          class: `scr-buy${poor ? ' is-poor' : ''}`,
          'aria-disabled': poor ? 'true' : 'false',
          'aria-label': poor ? `${u.name}: costs ${cost} coins, you need ${cost - save.coins} more` : `Buy ${u.name} for ${cost} coins`,
        },
        h('span', { class: 'scr-buy__label' }, poor ? 'Need' : 'Buy'),
        coin(),
        h('b', null, fmt(cost)),
        poor ? h('small', { class: 'scr-buy__more' }, `${fmt(cost - save.coins)} more`) : null
      );
      buy.addEventListener('click', () => onBuy(u.id, card));
      card.appendChild(buy);
    }
    return card;
  }

  function onBuy(id, card) {
    const save = getSave();
    if (buyUpgrade(save, id)) {
      persist();
      play('buy');
      renderShopPanel();
      const refs = state.shop;
      if (!refs) return;
      const fresh = Array.from(refs.panel.querySelectorAll('.scr-upg')).find((c) => c.dataset.id === id);
      if (fresh) {
        restartAnim(fresh, 'is-bought');
        burst(fresh, 14);
        const target = fresh.querySelector('.scr-buy') || fresh;
        try {
          target.focus({ preventScroll: true });
        } catch {
          target.focus();
        }
      }
      restartAnim(refs.purse, 'is-bump');
    } else {
      play('error');
      restartAnim(card, 'is-shake');
      if (state.shop) restartAnim(state.shop.purse, 'is-shake');
    }
  }

  function rewardsPanel(save) {
    const total = Math.max(0, Math.floor(save.totalPresents));
    const next = nextMilestone(save);
    const frac = trackFraction(total);
    const n = MILESTONES.length;

    const stops = MILESTONES.map((m, k) => {
      const got = isUnlocked(save, m.id);
      const isNext = next && next.id === m.id;
      return h(
        'div',
        {
          class: `scr-stop${got ? ' is-got' : ''}${isNext ? ' is-next' : ''}`,
          style: { left: `${(((k + 1) / n) * 100).toFixed(2)}%` },
          title: `${m.name} — ${m.count} presents`,
        },
        h('span', { class: 'scr-stop__badge', 'aria-hidden': 'true' }, m.icon, got ? null : h('i', { class: 'scr-stop__lock' }, '🔒')),
        h('span', { class: 'scr-stop__count' }, `🎁 ${m.count}`)
      );
    });

    const track = h(
      'div',
      { class: 'scr-track', 'aria-label': `${total} presents opened` },
      h(
        'div',
        { class: 'scr-track__inner' },
        h('div', { class: 'scr-track__bar' }, h('i', { style: { width: `${(frac * 100).toFixed(2)}%` } })),
        h('div', { class: 'scr-track__start', 'aria-hidden': 'true' }, '🐧'),
        h(
          'div',
          { class: 'scr-track__marker', style: { left: `${(frac * 100).toFixed(2)}%` } },
          h('span', null, `🎁 ${fmt(total)}`)
        ),
        stops
      )
    );

    const headline = h(
      'div',
      { class: 'scr-rewards__head' },
      h('p', { class: 'scr-rewards__big' }, `You've opened ${plural(total, 'present')}!`),
      next
        ? h(
            'p',
            { class: 'scr-rewards__next' },
            `Only ${plural(Math.max(0, next.count - total), 'more present')} until `,
            h('b', null, `${next.icon} ${next.name}`),
            '!'
          )
        : h('p', { class: 'scr-rewards__next' }, h('b', null, '🏆 Every reward unlocked — you are a Present Legend!'))
    );

    const list = h(
      'div',
      { class: 'scr-rewards__list' },
      MILESTONES.map((m, i) => {
        const got = isUnlocked(save, m.id);
        const left = Math.max(0, m.count - total);
        return h(
          'article',
          { class: `scr-reward${got ? ' is-got' : ''}`, style: { '--i': String(i) } },
          h('span', { class: 'scr-reward__icon', 'aria-hidden': 'true' }, m.icon),
          h(
            'div',
            { class: 'scr-reward__text' },
            h('b', null, m.name),
            h('span', null, m.desc),
            got && m.cosmetic ? h('em', null, 'Toggle it in the Wardrobe') : null
          ),
          h(
            'span',
            { class: `scr-reward__status${got ? ' is-got' : ''}` },
            got ? '✔ Unlocked' : `🔒 ${fmt(left)} to go`
          )
        );
      })
    );

    return h('div', { class: 'scr-rewards' }, headline, track, list);
  }

  function wardrobePanel(save) {
    const cosmetics = MILESTONES.filter((m) => m.cosmetic);
    const preview = h('div', { class: 'scr-wardrobe__preview' });
    const renderPreview = () => {
      const sv = getSave();
      preview.replaceChildren(
        h('div', { class: 'scr-wardrobe__stage', html: sceneHTML(sv, { crown: false, wave: true, extras: false }) }),
        isUnlocked(sv, 'jumper') ? legendBadge() : h('p', { class: 'scr-wardrobe__caption' }, 'Looking festive, Pip!')
      );
    };
    renderPreview();

    const anyUnlocked = cosmetics.some((m) => isUnlocked(save, m.id));
    const rows = cosmetics.map((m) => {
      const got = isUnlocked(save, m.id);
      const on = isActive(save, m.id);
      const row = h(
        'button',
        {
          type: 'button',
          class: `scr-wtoggle${got ? '' : ' is-locked'}`,
          'aria-pressed': on ? 'true' : 'false',
          disabled: got ? null : true,
        },
        h('span', { class: 'scr-wtoggle__icon', 'aria-hidden': 'true' }, m.icon),
        h(
          'span',
          { class: 'scr-wtoggle__text' },
          h('b', null, m.name),
          h('span', null, got ? m.desc : `🔒 Open ${fmt(m.count)} presents to unlock (${fmt(Math.max(0, m.count - save.totalPresents))} to go)`)
        ),
        h('span', { class: 'scr-toggle__sw', 'aria-hidden': 'true' }, h('i'))
      );
      if (got) {
        row.addEventListener('click', () => {
          const sv = getSave();
          const next = !isActive(sv, m.id);
          sv.wardrobe[m.id] = next;
          row.setAttribute('aria-pressed', next ? 'true' : 'false');
          persist();
          settingsChanged();
          play(next ? 'pop' : 'click');
          restartAnim(row, 'is-boing');
          renderPreview();
        });
      }
      return row;
    });

    return h(
      'div',
      { class: 'scr-wardrobe' },
      preview,
      h(
        'div',
        { class: 'scr-wardrobe__list' },
        anyUnlocked
          ? h('p', { class: 'scr-hintline' }, 'Tap a reward to switch it on or off.')
          : h('p', { class: 'scr-hintline' }, `Open presents to unlock cosy outfits for Pip! The first one arrives at ${MILESTONES[0] ? MILESTONES[0].count : 10} presents.`),
        rows
      )
    );
  }

  // ---------------------------------------------------------------------------
  // GALLERY
  // ---------------------------------------------------------------------------

  // The public call with 'pause' is main.js's Tab peek during a night (the
  // Pause menu's own Gallery button calls openGallery directly), so its Back
  // button and Escape go straight back to the night instead of the Pause card.
  function showGallery(back) {
    openGallery(back, { peek: back === 'pause' });
  }

  function openGallery(back, { peek = false } = {}) {
    state.galleryBack = GALLERY_BACKS.has(back) ? back : 'title';
    if (state.galleryBack === 'results' && !state.lastSummary) state.galleryBack = 'title';
    state.galleryPeek = !!peek && state.galleryBack === 'pause';
    open('gallery', buildGallery);
  }

  // Ids of the jokes found during the latest night: counted from the save
  // while a night runs (or after quitting it), else from the last results.
  function tonightIds(save) {
    const list = save.foundJokes;
    const start = state.nightFoundStart;
    if (start !== null) return new Set(start <= list.length ? list.slice(start) : []);
    if (!state.lastSummary) return new Set();
    const found = new Set(list);
    return new Set(state.lastSummary.newJokes.map((j) => j.id).filter((id) => found.has(id)));
  }

  function buildGallery() {
    const save = getSave();
    // id -> position in foundJokes (later = found more recently)
    const foundAt = new Map();
    save.foundJokes.forEach((id, i) => foundAt.set(id, i));
    const fresh = tonightIds(save);
    const counts = { all: [0, 0], joke: [0, 0], quote: [0, 0], secret: [0, 0] };
    for (const j of JOKE_LIST) {
      const f = foundAt.has(j.id) ? 1 : 0;
      counts.all[0] += f;
      counts.all[1] += 1;
      if (counts[j.kind]) {
        counts[j.kind][0] += f;
        counts[j.kind][1] += 1;
      }
    }

    const counterNum = h('b', null, `${fmt(counts.all[0])} / ${fmt(counts.all[1])}`);
    const counter = h(
      'div',
      { class: 'scr-counter' },
      h('span', { class: 'scr-counter__text' }, counterNum, ' found'),
      progressBar(counts.all[1] ? counts.all[0] / counts.all[1] : 0)
    );

    const grid = h('div', { class: 'scr-grid' });
    const chips = h('div', { class: 'scr-chips', role: 'tablist', 'aria-label': 'Filter' });

    const renderGrid = () => {
      const f = state.galleryFilter;
      const list = f === 'all' ? JOKE_LIST : JOKE_LIST.filter((j) => j.kind === f);
      const c = counts[f] || counts.all;
      counterNum.textContent = `${fmt(c[0])} / ${fmt(c[1])}`;
      const bar = counter.querySelector('.scr-bar');
      if (bar) bar.replaceWith(progressBar(c[1] ? c[0] / c[1] : 0));
      for (const b of chips.children) b.setAttribute('aria-selected', b.dataset.filter === f ? 'true' : 'false');
      if (!list.length) {
        grid.replaceChildren(h('p', { class: 'scr-empty' }, 'No jokes here yet — the elves are still writing them!'));
        return;
      }
      // Found cards first, newest first; then the "???" cards in number order.
      const got = list.filter((j) => foundAt.has(j.id)).sort((a, b) => foundAt.get(b.id) - foundAt.get(a.id));
      const missing = list.filter((j) => !foundAt.has(j.id));
      const cards = got.map((j, k) => foundCard(j, JOKE_INDEX.get(j.id), k, fresh.has(j.id)));
      if (got.length && missing.length) {
        cards.push(h('p', { class: 'scr-grid__divider' }, `🔒 Still hiding in crackers: ${fmt(missing.length)}`));
      }
      missing.forEach((j, k) => cards.push(lockedCard(j, JOKE_INDEX.get(j.id), got.length + k)));
      grid.replaceChildren(...cards);
    };

    for (const f of FILTERS) {
      const c = counts[f.id];
      const chip = h(
        'button',
        { type: 'button', class: 'scr-chip', role: 'tab', 'data-filter': f.id, 'aria-selected': f.id === state.galleryFilter ? 'true' : 'false' },
        h('span', { 'aria-hidden': 'true' }, f.icon),
        ` ${f.label} `,
        h('small', null, `${c[0]}/${c[1]}`)
      );
      chip.addEventListener('click', () => {
        if (state.galleryFilter === f.id) return;
        play('click');
        state.galleryFilter = f.id;
        renderGrid();
        scrollBodyTop(grid);
      });
      chips.appendChild(chip);
    }
    renderGrid();

    const backLabel =
      { title: 'Title', shop: 'Workshop', pause: state.galleryPeek ? 'Back to the night' : 'Back', results: 'Results' }[state.galleryBack] || 'Back';
    const foot = [
      button(backLabel, {
        icon: '↩',
        variant: 'red',
        autofocus: true,
        onClick: () => {
          play('click');
          leaveGallery();
        },
      }),
    ];

    return page(
      {
        cls: 'scr-gallery',
        title: 'Joke Gallery',
        icon: '📖',
        sub:
          counts.all[0] === 0
            ? 'Your scrapbook is empty! Pull crackers to collect jokes.'
            : fresh.size
              ? `✨ ${plural(fresh.size, 'new find')} tonight, right at the top! Tap a card to flip it over.`
              : 'Your newest finds are at the top. Tap a card to flip it over!',
        headExtra: h('div', { class: 'scr-gallery__bar' }, counter, chips),
      },
      grid,
      foot
    );
  }

  // idx = position in JOKE_LIST (the card number), pos = position in the grid.
  function foundCard(j, idx, pos = idx, isNew = false) {
    const kind = KIND_INFO[j.kind] || KIND_INFO.joke;
    const rarity = RARITY_LABEL[j.rarity] ? j.rarity : 'common';
    const long = (j.q || '').length > 90 || (j.a || '').length > 110;
    const say = h(
      'button',
      { type: 'button', class: 'scr-say', 'aria-label': 'Read aloud', title: 'Read aloud', tabindex: '-1' },
      '🔊'
    );
    say.addEventListener('click', (e) => {
      e.stopPropagation();
      speak(speakText(j));
    });
    say.addEventListener('keydown', (e) => e.stopPropagation());

    const band = () =>
      h(
        'span',
        { class: 'scr-jcard__band' },
        h('span', { class: 'scr-jcard__tag' }, `${kind.icon} ${RARITY_LABEL[rarity]} ${kind.label.toLowerCase()}`)
      );

    const newText = isNew ? 'New tonight! ' : '';
    const card = h(
      'div',
      {
        class: `scr-jcard scr-jcard--${rarity} scr-jcard--${j.kind || 'joke'}${long ? ' is-long' : ''}${isNew ? ' is-new' : ''}`,
        role: 'button',
        tabindex: '0',
        'aria-pressed': 'false',
        'aria-label': `${newText}${kind.label}: ${j.q || ''}. Press to flip.`,
        style: { '--i': String(Math.min(pos, 24)) },
      },
      isNew ? h('span', { class: 'scr-jcard__new', 'aria-hidden': 'true' }, 'NEW!') : null,
      h(
        'div',
        { class: 'scr-jcard__inner' },
        h(
          'div',
          { class: 'scr-jcard__face scr-jcard__front' },
          band(),
          h('p', { class: 'scr-jcard__q' }, j.q || ''),
          h('span', { class: 'scr-jcard__flip', 'aria-hidden': 'true' }, j.kind === 'secret' ? 'Tap to read the note ↻' : j.kind === 'quote' ? 'Tap to flip ↻' : 'Tap for the answer ↻'),
          h('span', { class: 'scr-jcard__num' }, `#${String(idx + 1).padStart(3, '0')}`)
        ),
        h(
          'div',
          { class: 'scr-jcard__face scr-jcard__back' },
          band(),
          h('p', { class: 'scr-jcard__a' }, backText(j)),
          say,
          h('span', { class: 'scr-jcard__num' }, `#${String(idx + 1).padStart(3, '0')}`)
        )
      )
    );

    const flip = () => {
      const on = !card.classList.contains('is-flipped');
      card.classList.toggle('is-flipped', on);
      card.setAttribute('aria-pressed', on ? 'true' : 'false');
      say.tabIndex = on ? 0 : -1;
      card.setAttribute('aria-label', on ? `Answer: ${backText(j)}. Press to flip back.` : `${newText}${kind.label}: ${j.q || ''}. Press to flip.`);
      play('whoosh');
    };
    card.addEventListener('click', flip);
    card.addEventListener('keydown', (e) => {
      if (e.target !== card) return;
      if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        flip();
      }
    });
    return card;
  }

  function lockedCard(j, idx, pos = idx) {
    const rarity = RARITY_LABEL[j.rarity] ? j.rarity : 'common';
    const kind = KIND_INFO[j.kind] || KIND_INFO.joke;
    const card = h(
      'div',
      {
        class: `scr-jcard scr-jcard--locked scr-jcard--${rarity}`,
        'aria-label': `Not found yet: a ${RARITY_LABEL[rarity].toLowerCase()} ${kind.label.toLowerCase()}`,
        role: 'img',
        style: { '--i': String(Math.min(pos, 24)) },
      },
      h(
        'div',
        { class: 'scr-jcard__inner' },
        h(
          'div',
          { class: 'scr-jcard__face scr-jcard__ghost' },
          h('span', { html: crackerHTML('scr-cracker--ghost') }).firstChild,
          h('b', { class: 'scr-jcard__qq' }, '???'),
          h('span', { class: 'scr-jcard__ghosttag' }, `${kind.icon} ${RARITY_LABEL[rarity]}`),
          h('span', { class: 'scr-jcard__num' }, `#${String(idx + 1).padStart(3, '0')}`)
        )
      )
    );
    card.addEventListener('click', () => restartAnim(card, 'is-shake'));
    return card;
  }

  // ---------------------------------------------------------------------------
  // PAUSE
  // ---------------------------------------------------------------------------

  function showPause() {
    open('pause', buildPause);
  }

  function buildPause() {
    const goHome = goHomeFn();
    const quit = button('Quit to title', {
      icon: '🚪',
      variant: 'snow',
      onClick: () => {
        if (!quit.classList.contains('is-confirm')) {
          play('click');
          quit.classList.add('is-confirm');
          setLabel(quit, "Tap again — tonight's hunt ends!");
          later(() => {
            quit.classList.remove('is-confirm');
            setLabel(quit, 'Quit to title');
          }, 3200);
          return;
        }
        play('click');
        fire(deps.onQuitToTitle, showTitle);
      },
    });

    const sv = getSave();
    const card = h(
      'div',
      { class: 'scr-card scr-pause' },
      h('span', { class: 'scr-tape scr-tape--l', 'aria-hidden': 'true' }),
      h('span', { class: 'scr-tape scr-tape--r', 'aria-hidden': 'true' }),
      h(
        'div',
        { class: 'scr-pause__art', 'aria-hidden': 'true' },
        h('div', { class: 'scr-pause__pip', html: pipHTML({ sleepy: true, scarf: isActive(sv, 'scarf'), jumper: isActive(sv, 'jumper') }) }),
        h('div', { class: 'scr-zzz' }, h('i', null, 'z'), h('i', null, 'z'), h('i', null, 'Z')),
        h('div', { class: 'scr-mug' }, h('i'), h('i'), h('i'))
      ),
      h('h2', { class: 'scr-banner scr-banner--small' }, h('span', null, 'Paused')),
      h('p', { class: 'scr-card__sub' }, 'Pip is having a quick snooze and a hot cocoa.'),
      h(
        'div',
        { class: 'scr-stack' },
        button('Resume', {
          icon: '▶',
          variant: 'red',
          size: 'big',
          autofocus: true,
          onClick: () => {
            play('click');
            fire(deps.onResume, hideAll);
          },
        }),
        h(
          'div',
          { class: 'scr-stack__row' },
          button('Joke Gallery', {
            icon: '📖',
            variant: 'gold',
            onClick: () => {
              play('click');
              openGallery('pause');
            },
          }),
          button('How to Play', {
            icon: '❓',
            variant: 'snow',
            onClick: () => {
              play('click');
              openHelp('pause');
            },
          })
        ),
        settingsToggles(true),
        typeof goHome === 'function'
          ? button('Go home (end the night)', {
              icon: '🏠',
              variant: 'green',
              onClick: () => {
                play('click');
                fire(goHome, hideAll);
              },
            })
          : null,
        quit
      ),
      h('span', { class: 'scr-hint' }, 'Esc = resume')
    );
    return h('div', { class: 'scr-pausewrap' }, card);
  }

  // ---------------------------------------------------------------------------
  // HELP
  // ---------------------------------------------------------------------------

  function showHelp(back) {
    openHelp(back);
  }

  function openHelp(back) {
    state.helpBack = HELP_BACKS.has(back) ? back : 'title';
    open('help', buildHelp);
  }

  function buildHelp() {
    const save = getSave();
    let nightSecs = 300;
    try {
      nightSecs = computeStats(save).nightSeconds || 300;
    } catch {
      /* keep default */
    }
    const mins = Math.floor(nightSecs / 60);
    const secs = Math.round(nightSecs % 60);
    const nightText =
      secs === 0
        ? `${mins} minutes`
        : secs === 30
          ? `${mins} and a half minutes`
          : `${mins} minutes and ${secs} seconds`;

    const controls = Array.isArray(deps.controls) && deps.controls.length ? deps.controls : DEFAULT_CONTROLS;
    const coins = RARITY_COINS || { common: 5, rare: 10, legendary: 25 };

    const note = (cls, icon, title, ...body) =>
      h(
        'article',
        { class: `scr-note ${cls}` },
        h('span', { class: 'scr-note__pin', 'aria-hidden': 'true' }),
        h('h3', { class: 'scr-note__title' }, h('span', { 'aria-hidden': 'true' }, icon), ` ${title}`),
        body
      );

    const controlsNote = note(
      'scr-note--controls scr-tint--sky',
      '🎮',
      'Controls',
      h(
        'ul',
        { class: 'scr-keys' },
        controls.map((c) =>
          h(
            'li',
            null,
            h(
              'span',
              { class: 'scr-keys__caps' },
              (Array.isArray(c.keys) ? c.keys : [String(c.keys || '')]).map((k) => h('kbd', { class: 'scr-key' }, k))
            ),
            h('span', { class: 'scr-keys__text' }, c.text || '')
          )
        )
      )
    );

    const surprises = SURPRISE_LIST.length
      ? h(
          'div',
          { class: 'scr-tally scr-tally--small' },
          SURPRISE_LIST.map((d) =>
            h('span', { class: 'scr-tally__chip' }, h('span', { class: 'scr-tally__icon', 'aria-hidden': 'true' }, d.icon || '🎁'), h('span', { class: 'scr-tally__name' }, d.name || d.id))
          )
        )
      : null;

    const body = h(
      'div',
      { class: 'scr-help' },
      h(
        'div',
        { class: 'scr-help__intro' },
        h('div', { class: 'scr-help__pip', 'aria-hidden': 'true', html: pipHTML({ wave: true, crown: true }) }),
        h(
          'p',
          null,
          "It's Christmas Eve, and Santa's elves have hidden ",
          h('b', null, 'crackers'),
          ' and ',
          h('b', null, 'presents'),
          ' all over Snowy Island! Help Pip the penguin find as many as possible before the night is over. Every night is a brand-new island!'
        )
      ),
      h(
        'div',
        { class: 'scr-notes' },
        controlsNote,
        note(
          'scr-tint--blush',
          '🎉',
          'Crackers',
          h('div', { class: 'scr-note__art', 'aria-hidden': 'true', html: crackerHTML() }),
          h('p', null, 'Waddle up to a cracker and press ', h('kbd', { class: 'scr-key' }, 'E'), '. BANG! Out pops a joke for your Gallery, plus coins:'),
          h(
            'div',
            { class: 'scr-rarities' },
            h('span', { class: 'scr-rar scr-rar--common' }, 'Common ', coin(), ` ${coins.common}`),
            h('span', { class: 'scr-rar scr-rar--rare' }, 'Rare ', coin(), ` ${coins.rare}`),
            h('span', { class: 'scr-rar scr-rar--legendary' }, 'Legendary ', coin(), ` ${coins.legendary}`)
          )
        ),
        note(
          'scr-tint--mint',
          '🎁',
          'Presents',
          h('p', null, 'Every present hides a surprise! It might be coins, a puppy pal, a reindeer ride… or a lump of coal. (The coal is very sorry.)'),
          surprises
        ),
        note(
          'scr-tint--butter',
          '📡',
          'Radar',
          h('p', null, 'The radar in the corner shows treats near Pip. Presents appear as little boxes. Upgrade it to spot crackers and their rarity too!')
        ),
        note(
          'scr-tint--lilac',
          '🌙',
          'The night',
          h('p', null, `Each night lasts ${nightText}. The clock turns red near the end — grab what you can before the moon goes to bed!`)
        ),
        note(
          'scr-tint--mint',
          '🛠️',
          "Santa's Workshop",
          h('p', null, 'Spend your coins on upgrades: speedy skates, magnet mittens, longer nights, a lucky bow and more.')
        ),
        note(
          'scr-tint--blush',
          '🏆',
          'Rewards',
          h('p', null, 'Every present you ever open counts towards rewards: outfits, a snow puppy, a candy island and a disco sky!')
        )
      )
    );

    const foot = [
      // from the Pause menu this returns to the Pause card, so plain "Back"
      button(state.helpBack === 'pause' ? 'Back' : 'Got it!', {
        icon: state.helpBack === 'pause' ? '↩' : '👍',
        variant: 'red',
        autofocus: true,
        onClick: () => {
          play('click');
          leaveHelp();
        },
      }),
    ];

    return page({ cls: 'scr-helppage', title: 'How to Play', icon: '❓' }, body, foot);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  function refresh() {
    switch (state.current) {
      case 'title':
        showTitle();
        break;
      case 'results':
        if (state.lastSummary) renderResults(state.lastSummary, true);
        break;
      case 'shop':
        renderShopPanel();
        break;
      case 'gallery':
        openGallery(state.galleryBack, { peek: state.galleryPeek });
        break;
      case 'pause':
        showPause();
        break;
      case 'help':
        openHelp(state.helpBack);
        break;
      default:
        break;
    }
  }

  function destroy() {
    hideAll();
    if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeyDown, true);
    if (typeof document !== 'undefined') document.removeEventListener('keydown', onMenuKeyGuard);
    el.remove();
  }

  return {
    showTitle,
    showResults,
    showShop,
    showGallery,
    showPause,
    showHelp,
    hideAll,
    refresh,
    destroy,
    el,
    get current() {
      return state.current;
    },
    isOpen() {
      return state.current !== null;
    },
  };
}
