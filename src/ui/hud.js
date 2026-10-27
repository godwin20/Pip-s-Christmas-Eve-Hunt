// In-game HUD: night timer, coins, cracker/present counts, interaction prompt,
// toasts, buff chips, compass star arrow, map seed, control hints and the
// radar canvas container. Display only: the whole layer is pointer-events:none,
// except for the touch buttons (pause + belly-slide) shown on touch screens.
//
// Touch screens (matchMedia('(pointer: coarse)'), or a touch laptop whose last
// input was a finger rather than the mouse / keyboard) get a pause button
// top-right, a hold-to-slide button beside the radar, "Tap to..." prompts and
// touch hints. Hooks for main.js (both optional):
//   hud.onPause = () => pause();          // pause button tapped
//   hud.onSlide = (down) => { ... };      // slide button pressed / released
//   hud.slideHeld                         // true while the slide button is held
// Without them the buttons fall back to a synthetic Escape press and a held
// left Shift key, which input.js / main.js already read as pause and slide.

import './hud.css';

const TAU = Math.PI * 2;

// Default control hints (bottom-left). main.js can replace them with setHints().
export const DEFAULT_HINTS = [
  { keys: ['W', 'A', 'S', 'D'], label: 'Waddle' },
  { keys: ['Space'], label: 'Belly-slide' },
  { keys: ['E'], label: 'Open' },
  { keys: ['Drag'], label: 'Look around' },
  { keys: ['Esc'], label: 'Pause' },
];

// The same hints for a touch screen (the left side of the screen is a virtual
// joystick in input.js, the right side orbits the camera, a tap opens things).
export const TOUCH_HINTS = [
  { keys: ['👈'], label: 'Drag on the left to waddle' },
  { keys: ['👉'], label: 'Drag on the right to look around' },
  { keys: ['👆'], label: 'Tap to open' },
  { keys: ['🐧'], label: 'Hold Slide to belly-slide' },
  { keys: ['⏸'], label: 'Pause' },
];

// "Press E to pull the cracker!" -> "Tap to pull the cracker!" for touch
// screens (a tap on the canvas counts as the interact key in main.js).
export function touchPrompt(text) {
  if (text == null) return text;
  return String(text)
    .replace(/\b(?:Press|Hit)\s+(?:E|Enter)\s+(?:or\s+(?:click|tap)\s+)?to\b/gi, 'Tap to')
    .replace(/\b(?:Press|Hit)\s+(?:E|Enter)\b/gi, 'Tap')
    .replace(/(?:\b(?:Press|Hit)\s+)?\[(?:E|Enter)\]/gi, 'Tap')
    .replace(/\b(?:Press|Hit)\s+(?:Esc|Escape)\b/gi, 'Tap ⏸')
    .replace(/\b(Hold|Press)\s+(?:Space|Shift)\b/g, '$1 Slide')
    .replace(/(?:\b(?:Press|Hold)\s+)?\[(?:Space|Shift)\]/gi, 'Hold Slide');
}

// Styles for the touch buttons. hud.css makes every HUD node pointer-events:
// none (!important), so these re-enable it, with a more specific selector, on
// the two real buttons only.
const TOUCH_CSS_ID = 'pip-hud-touch-css';
const TOUCH_CSS = `
.pip-hud .hud-touch-btn {
  position: absolute;
  display: none;
  place-items: center;
  margin: 0;
  padding: 0;
  font-family: var(--font);
  color: var(--ink);
  border: 3px solid var(--ink);
  border-radius: 50%;
  box-shadow: var(--shadow-sm), 0 8px 18px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  outline: none;
  transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
}
.pip-hud.is-touch .hud-touch-btn {
  display: grid;
  pointer-events: auto !important;
}
.pip-hud.is-hidden .hud-touch-btn {
  pointer-events: none !important;
}
.pip-hud .hud-touch-btn:active,
.pip-hud .hud-touch-btn.is-held {
  transform: translateY(3px) scale(0.94);
  box-shadow: 0 0 0 rgba(42, 27, 61, 0.35), 0 4px 10px rgba(0, 0, 0, 0.25);
}
.pip-hud .hud-pause-btn {
  top: 16px;
  right: 16px;
  width: 54px;
  height: 54px;
  background: radial-gradient(circle at 35% 30%, #fff 0 22%, var(--paper) 60%);
}
.pip-hud .hud-pause-bars {
  display: flex;
  gap: 7px;
}
.pip-hud .hud-pause-bars i {
  display: block;
  width: 8px;
  height: 22px;
  background: var(--red);
  border: 2px solid var(--ink);
  border-radius: 4px;
}
.pip-hud .hud-slide-btn {
  right: 74px;
  bottom: 252px;
  width: 84px;
  height: 84px;
  background: radial-gradient(circle at 35% 28%, #fff 0 16%, var(--ice) 58%, #6fb7dd 100%);
}
.pip-hud .hud-slide-btn.is-held {
  filter: brightness(1.08) saturate(1.2);
}
.pip-hud .hud-slide-icon {
  display: block;
  margin-top: -4px;
  font-size: 34px;
  line-height: 1;
  transform: rotate(-80deg);
}
.pip-hud .hud-slide-btn.is-held .hud-slide-icon {
  animation: hud-slide-wiggle 0.35s ease-in-out infinite alternate;
}
.pip-hud .hud-slide-label {
  position: absolute;
  left: 50%;
  bottom: -11px;
  transform: translateX(-50%);
  padding: 0 8px;
  font-size: 12px;
  font-weight: 700;
  line-height: 18px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #fff;
  background: var(--red);
  border: 2px solid var(--ink);
  border-radius: 999px;
  white-space: nowrap;
}
@keyframes hud-slide-wiggle {
  from { transform: rotate(-86deg) translateY(-2px); }
  to { transform: rotate(-74deg) translateY(2px); }
}
/* the pause button takes the top-right corner, so toasts start under it */
@media (min-width: 521px) {
  .pip-hud.is-touch .hud-toasts {
    top: 84px;
  }
}
/* small radar (see hud.css): the slide button sits just left of it, low
   enough for a thumb and clear of the centred prompt */
@media (max-width: 760px), (max-height: 540px) {
  .pip-hud .hud-slide-btn {
    right: 170px;
    bottom: 78px;
    width: 72px;
    height: 72px;
  }
  .pip-hud .hud-slide-icon {
    font-size: 29px;
  }
}
@media (max-width: 520px) {
  .pip-hud .hud-pause-btn {
    top: 12px;
    right: 10px;
    width: 48px;
    height: 48px;
  }
  .pip-hud .hud-pause-bars {
    gap: 6px;
  }
  .pip-hud .hud-pause-bars i {
    width: 7px;
    height: 19px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pip-hud .hud-slide-btn.is-held .hud-slide-icon {
    animation: none;
  }
}
`;

function injectTouchCss() {
  if (typeof document === 'undefined' || !document.head) return;
  let style = document.getElementById(TOUCH_CSS_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = TOUCH_CSS_ID;
    document.head.appendChild(style);
  }
  if (style.textContent !== TOUCH_CSS) style.textContent = TOUCH_CSS;
}

// A synthetic key event for the fallback wiring (input.js listens on window).
function fakeKey(type, code, key) {
  if (typeof window === 'undefined' || typeof KeyboardEvent !== 'function') return;
  try {
    window.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true }));
  } catch {
    /* very old browser: the hooks are the only way then */
  }
}

// Screen angle (radians, clockwise from screen-up, + = to the right) of `to`
// as seen from `from` by a camera whose forward is (sin yaw, 0, cos yaw).
// Feed the result straight into hud.setCompass(). Same maths as the radar.
export function screenAngle(from, to, yaw = 0) {
  if (!from || !to) return 0;
  const a = yaw - Math.atan2(to.x - from.x, to.z - from.z);
  return wrapAngle(a);
}

function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

const now =
  typeof performance !== 'undefined' && performance.now
    ? () => performance.now()
    : () => Date.now();

const raf =
  typeof requestAnimationFrame === 'function'
    ? (fn) => requestAnimationFrame(fn)
    : (fn) => setTimeout(() => fn(now()), 16);

function h(tag, cls, parent, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

function removeNode(node) {
  if (node && node.parentNode) node.parentNode.removeChild(node);
}

// Restarts a one-shot CSS animation class.
function bump(node, cls, ms) {
  if (!node) return;
  node.classList.remove(cls);
  void node.offsetWidth; // reflow so the animation restarts
  node.classList.add(cls);
  clearTimeout(node.__bumpTimer);
  node.__bumpTimer = setTimeout(() => node.classList.remove(cls), ms);
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}

function fmtNum(n) {
  const v = Math.round(Number(n) || 0);
  return Math.abs(v) >= 10000 ? v.toLocaleString('en-GB') : String(v);
}

// "Press E to pull the cracker!" -> text + <kbd>E</kbd> + text.
// Also understands [Space] style brackets.
const KEY_WORD = /\b(Press|Hold|Tap)\s+(Space|Shift|Enter|Escape|Esc|Tab|[A-Z0-9])\b|\[([^\]\n]{1,14})\]/g;
function fillWithKeys(node, text) {
  node.textContent = '';
  let last = 0;
  KEY_WORD.lastIndex = 0;
  let m;
  while ((m = KEY_WORD.exec(text))) {
    if (m.index > last) node.appendChild(document.createTextNode(text.slice(last, m.index)));
    if (m[3] != null) {
      h('kbd', null, node, m[3]);
    } else {
      node.appendChild(document.createTextNode(m[1] + ' '));
      h('kbd', null, node, m[2]);
    }
    last = KEY_WORD.lastIndex;
  }
  if (last < text.length) node.appendChild(document.createTextNode(text.slice(last)));
}

export function createHud(root) {
  if (!root && typeof document !== 'undefined') root = document.getElementById('hud') || document.body;

  const timers = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };

  // ---------- DOM ----------
  const layer = h('div', 'pip-hud is-hidden', root);
  layer.setAttribute('aria-hidden', 'false');

  // top-left: coins + counts
  const tl = h('div', 'hud-tl', layer);
  const coinsPill = h('div', 'hud-pill hud-coins', tl);
  const coinIcon = h('span', 'hud-coin', coinsPill);
  const coinsNum = h('span', 'hud-num', coinsPill, '0');
  coinsPill.setAttribute('title', 'Coins');

  const counts = h('div', 'hud-counts', tl);
  const crackerPill = h('div', 'hud-pill hud-count is-zero', counts);
  h('span', 'hud-ico-cracker', crackerPill);
  h('span', 'hud-x', crackerPill, '×');
  const crackerNum = h('span', 'hud-num', crackerPill, '0');
  const presentPill = h('div', 'hud-pill hud-count is-zero', counts);
  h('span', 'hud-ico-present', presentPill);
  h('span', 'hud-x', presentPill, '×');
  const presentNum = h('span', 'hud-num', presentPill, '0');

  // top-centre: timer, compass, buffs
  const tc = h('div', 'hud-tc', layer);
  const timer = h('div', 'hud-timer', tc);
  timer.setAttribute('role', 'timer');
  h('span', 'hud-moon', timer);
  const digits = h('span', 'hud-timer-digits', timer, '0:00');
  const timerBar = h('div', 'hud-timer-bar', timer);
  const timerFill = h('i', null, timerBar);

  const compass = h('div', 'hud-compass is-off', tc);
  const dial = h('div', 'hud-compass-dial', compass);
  const needle = h('div', 'hud-needle', dial);
  h('div', 'hud-compass-star', dial, '★');
  const compassDist = h('div', 'hud-compass-dist is-off', dial, '0 m');

  const buffsRow = h('div', 'hud-buffs', tc);

  // top-right: toasts
  const toastBox = h('div', 'hud-toasts', layer);
  toastBox.setAttribute('aria-live', 'polite');

  // bottom-centre: prompt
  const promptWrap = h('div', 'hud-prompt-wrap is-off', layer);
  const promptEl = h('div', 'hud-prompt', promptWrap);

  // bottom-left: hints
  const hintsBox = h('div', 'hud-hints', layer);

  // bottom-right: radar + seed
  const radarWrap = h('div', 'hud-radar', layer);
  const radarCanvas = h('canvas', 'hud-radar-canvas', radarWrap);
  const dpr = typeof window !== 'undefined' ? Math.min(3, window.devicePixelRatio || 1) : 1;
  radarCanvas.width = Math.round(200 * dpr);
  radarCanvas.height = Math.round(200 * dpr);
  radarCanvas.setAttribute('aria-label', 'Radar');
  const seedBox = h('div', 'hud-seed is-off', layer);
  const seedText = h('span', null, seedBox, '');

  // touch buttons (hidden unless the layer has .is-touch)
  injectTouchCss();
  const pauseBtn = h('button', 'hud-touch-btn hud-pause-btn', layer);
  pauseBtn.type = 'button';
  pauseBtn.tabIndex = -1;
  pauseBtn.setAttribute('aria-label', 'Pause');
  pauseBtn.title = 'Pause';
  const pauseBars = h('span', 'hud-pause-bars', pauseBtn);
  h('i', null, pauseBars);
  h('i', null, pauseBars);

  const slideBtn = h('button', 'hud-touch-btn hud-slide-btn', layer);
  slideBtn.type = 'button';
  slideBtn.tabIndex = -1;
  slideBtn.setAttribute('aria-label', 'Belly-slide (hold)');
  h('span', 'hud-slide-icon', slideBtn, '🐧');
  h('span', 'hud-slide-label', slideBtn, 'Slide');

  // ---------- show / hide ----------
  let visible = false;
  function show() {
    if (visible) return;
    visible = true;
    layer.classList.remove('is-hidden');
  }
  function hide() {
    if (!visible) return;
    visible = false;
    layer.classList.add('is-hidden');
    releaseSlide();
    // Toasts are only news for the night that's ending: drop them once the
    // layer has faded out so they don't pop up again at the next show().
    later(() => {
      if (!visible) clearToasts();
    }, 400);
  }

  // ---------- timer ----------
  let lastSec = -1;
  let lastT = 0;
  let timeTotal = 0;
  let low = false;
  let critical = false;
  let flashWait = 0; // flashTime() without an amount: show "+Ns" on the next setTime
  function setTime(seconds, total) {
    const t = Math.max(0, Number(seconds) || 0);
    if (flashWait) {
      const gained = t - lastT;
      if (gained > 0.5) {
        flashWait = 0;
        plusFloater(Math.round(gained));
      } else if (now() - flashWait > 1500) flashWait = 0;
    }
    if (total > 0) timeTotal = total;
    else if (t > timeTotal || t - lastT > 60) timeTotal = t; // a fresh night
    lastT = t;
    const s = Math.ceil(t - 1e-4);
    if (s === lastSec) return;
    const prev = lastSec;
    lastSec = s;
    digits.textContent = fmtTime(s);
    // aim one second ahead: the bar's 1 s linear transition keeps it gliding
    const f = timeTotal > 0 ? Math.max(0, Math.min(1, (t - 1) / timeTotal)) : 1;
    timerFill.style.transform = 'scaleX(' + f.toFixed(4) + ')';
    const isLow = s <= 30 && s > 0;
    const isCrit = s <= 10 && s > 0;
    if (isLow !== low) {
      low = isLow;
      timer.classList.toggle('is-low', low);
    }
    if (isCrit !== critical) {
      critical = isCrit;
      timer.classList.toggle('is-critical', critical);
    }
    if (critical && prev !== -1 && s < prev) bump(digits, 'is-tick', 450);
  }

  function plusFloater(add) {
    if (!add) return;
    const f = h('span', 'hud-time-plus', timer, (add > 0 ? '+' : '') + add + 's');
    later(() => removeNode(f), 1350);
  }

  function flashTime(seconds) {
    bump(timer, 'is-flash', 900);
    const add = Math.round(Number(seconds) || 0);
    if (add) {
      flashWait = 0;
      plusFloater(add);
    } else {
      // main.js calls flashTime() right after adding to run.timeLeft: the
      // next setTime() reveals how much was added.
      flashWait = now();
    }
  }

  // ---------- coins (with count-up tween) ----------
  let coinTarget = null;
  let coinFrom = 0;
  let coinShown = 0;
  let coinStart = 0;
  let coinTweening = false;
  const COIN_TWEEN_MS = 480;
  function coinStep() {
    if (coinTarget === null) {
      coinTweening = false;
      return;
    }
    const k = Math.min(1, (now() - coinStart) / COIN_TWEEN_MS);
    const e = 1 - Math.pow(1 - k, 3);
    const v = Math.round(coinFrom + (coinTarget - coinFrom) * e);
    if (v !== coinShown) {
      coinShown = v;
      coinsNum.textContent = fmtNum(v);
    }
    if (k < 1) raf(coinStep);
    else coinTweening = false;
  }
  function setCoins(n) {
    const v = Math.round(Number(n) || 0);
    // First value, or a change while the HUD is hidden (shop spending, a save
    // reset): snap without the +N/-N floater so the next night doesn't open
    // with a stale "-150" drifting off the coin pill.
    if (coinTarget === null || !visible) {
      coinTarget = coinShown = coinFrom = v; // coinFrom too, so a running tween lands here
      coinsNum.textContent = fmtNum(v);
      return;
    }
    if (v === coinTarget) return;
    const delta = v - coinTarget;
    coinFrom = coinShown;
    coinTarget = v;
    coinStart = now();
    bump(coinIcon, 'is-bump', 650);
    bump(coinsNum, 'is-bump', 500);
    const fl = h('span', 'hud-float ' + (delta > 0 ? 'is-plus' : 'is-minus'), coinsPill, (delta > 0 ? '+' : '') + delta);
    later(() => removeNode(fl), 1150);
    if (!coinTweening) {
      coinTweening = true;
      raf(coinStep);
    }
  }

  // ---------- counts ----------
  const countState = { crackers: null, presents: null };
  function setCount(key, value, numEl, pill) {
    if (value == null) return;
    const v = Math.max(0, Math.round(Number(value) || 0));
    const prev = countState[key];
    if (prev === v) return;
    countState[key] = v;
    numEl.textContent = fmtNum(v);
    pill.classList.toggle('is-zero', v === 0);
    if (prev !== null && v > prev) bump(numEl, 'is-bump', 500);
  }
  function setCounts(c) {
    if (!c) return;
    setCount('crackers', c.crackers, crackerNum, crackerPill);
    setCount('presents', c.presents, presentNum, presentPill);
  }

  // ---------- prompt ----------
  let promptText = null;
  function setPrompt(text) {
    const t = text == null || text === '' ? null : String(text);
    if (t === promptText) return;
    promptText = t;
    if (t === null) {
      promptWrap.classList.add('is-off');
      return;
    }
    fillWithKeys(promptEl, touchMode ? touchPrompt(t) : t);
    promptWrap.classList.remove('is-off');
    // restart the pop-in so a changed prompt bounces again
    promptEl.style.animation = 'none';
    void promptEl.offsetWidth;
    promptEl.style.animation = '';
  }

  // ---------- toasts ----------
  const MAX_TOASTS = 4;
  const toasts = []; // { node, text, icon, count, countEl, timer }
  function dismissToast(t) {
    const i = toasts.indexOf(t);
    if (i < 0) return;
    toasts.splice(i, 1);
    clearTimeout(t.timer);
    timers.delete(t.timer);
    t.node.classList.add('is-out');
    later(() => removeNode(t.node), 360);
  }
  function toast(text, icon) {
    if (text == null || text === '') return;
    const msg = String(text);
    const ico = icon == null || icon === '' ? '✨' : String(icon);
    const life = Math.min(5200, 2600 + msg.length * 30);
    for (let i = 0; i < toasts.length; i++) {
      const t = toasts[i];
      if (t.text === msg && t.icon === ico) {
        t.count++;
        t.countEl.textContent = '×' + t.count;
        bump(t.node, 'is-bump', 450);
        clearTimeout(t.timer);
        timers.delete(t.timer);
        t.timer = later(() => dismissToast(t), life);
        return;
      }
    }
    while (toasts.length >= MAX_TOASTS) dismissToast(toasts[0]);
    const node = h('div', 'hud-toast', toastBox);
    h('span', 'hud-toast-icon', node, ico);
    h('span', 'hud-toast-text', node, msg);
    const countEl = h('span', 'hud-toast-count', node, '');
    const t = { node, text: msg, icon: ico, count: 1, countEl, timer: 0 };
    t.timer = later(() => dismissToast(t), life);
    toasts.push(t);
  }

  // ---------- buffs ----------
  const buffMap = new Map(); // key -> { node, timeEl, fill, total, secs, stamp, ending }
  let buffStamp = 0;
  function makeBuff(b) {
    const node = h('div', 'hud-buff', buffsRow);
    h('span', 'hud-buff-icon', node, b.icon == null ? '✨' : String(b.icon));
    if (b.label) h('span', 'hud-buff-label', node, String(b.label));
    const timeEl = h('span', 'hud-buff-time', node, '');
    const bar = h('div', 'hud-buff-bar', node);
    const fill = h('i', null, bar);
    return { node, timeEl, fill, total: 0, secs: -1, stamp: 0, ending: false };
  }
  function dropBuff(e) {
    e.node.classList.add('is-out');
    later(() => removeNode(e.node), 320);
  }
  function sweepBuff(e, key) {
    if (e.stamp !== buffStamp) {
      buffMap.delete(key);
      dropBuff(e);
    }
  }
  function setBuffs(list) {
    buffStamp++;
    if (list && list.length) {
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (!b) continue;
        const rem = Number(b.remaining) || 0;
        if (rem <= 0) continue;
        const key = b.label || b.icon || 'buff' + i;
        let e = buffMap.get(key);
        if (!e) {
          e = makeBuff(b);
          buffMap.set(key, e);
        }
        e.stamp = buffStamp;
        if (rem > e.total) e.total = rem;
        const secs = Math.ceil(rem);
        if (secs !== e.secs) {
          e.secs = secs;
          e.timeEl.textContent = secs + 's';
          e.fill.style.transform = 'scaleX(' + Math.max(0, Math.min(1, (rem - 1) / e.total)).toFixed(3) + ')';
          const ending = rem <= 3;
          if (ending !== e.ending) {
            e.ending = ending;
            e.node.classList.toggle('is-ending', ending);
          }
        }
      }
    }
    buffMap.forEach(sweepBuff);
  }

  // ---------- compass (springy needle) ----------
  let compassOn = false;
  let needleAngle = 0;
  let needleVel = 0;
  let needleShown = NaN;
  let needleTime = 0;
  let distShown = -1;
  let distOn = false;
  function setCompass(angle, distance) {
    if (angle == null || !Number.isFinite(angle)) {
      if (compassOn) {
        compassOn = false;
        compass.classList.add('is-off');
      }
      return;
    }
    const tNow = now();
    if (!compassOn) {
      compassOn = true;
      compass.classList.remove('is-off');
      needleAngle = angle;
      needleVel = 0;
      needleShown = NaN;
    } else {
      const dt = Math.min(0.05, Math.max(0, (tNow - needleTime) / 1000));
      const diff = wrapAngle(angle - needleAngle);
      needleVel += (diff * 140 - needleVel * 13) * dt; // a little overshoot = cute swing
      needleAngle = wrapAngle(needleAngle + needleVel * dt);
    }
    needleTime = tNow;
    if (!(Math.abs(needleAngle - needleShown) < 0.002)) {
      needleShown = needleAngle;
      needle.style.transform = 'rotate(' + needleAngle.toFixed(3) + 'rad)';
    }
    if (distance == null || !Number.isFinite(distance)) {
      if (distOn) {
        distOn = false;
        compassDist.classList.add('is-off');
        compass.classList.remove('has-dist');
      }
    } else {
      const d = Math.max(0, Math.round(distance));
      if (d !== distShown) {
        distShown = d;
        compassDist.textContent = d + ' m';
      }
      if (!distOn) {
        distOn = true;
        compassDist.classList.remove('is-off');
        compass.classList.add('has-dist');
      }
    }
  }

  // ---------- seed ----------
  let seedShown = null;
  function setSeed(seed) {
    if (seed == null || seed === '') {
      seedBox.classList.add('is-off');
      return;
    }
    const s = String(seed);
    if (s !== seedShown) {
      // A new map means a new night: the timer bar measures against the next
      // setTime() instead of last night's (possibly time-elf-boosted) total.
      if (seedShown !== null) {
        timeTotal = 0;
        lastT = 0;
        lastSec = -1;
        flashWait = 0;
      }
      seedShown = s;
    }
    seedText.textContent = '🗺️ Map #' + s;
    seedBox.classList.remove('is-off');
  }

  // ---------- hints ----------
  // setHints(list, touchList?) replaces the keyboard hints; touchList (if
  // given) replaces the touch ones, otherwise touch screens keep TOUCH_HINTS.
  // An empty / null list with no touchList hides the hints everywhere, and
  // setHints() with no arguments restores both built-in lists.
  let hintsKeys = DEFAULT_HINTS;
  let hintsTouch = TOUCH_HINTS;
  function renderHints() {
    const list = touchMode ? hintsTouch : hintsKeys;
    hintsBox.textContent = '';
    if (!list || !list.length) {
      hintsBox.classList.add('is-off');
      return;
    }
    hintsBox.classList.remove('is-off');
    for (const hint of list) {
      if (!hint) continue;
      const chip = h('span', 'hud-hint', hintsBox);
      const keys = Array.isArray(hint.keys) ? hint.keys : hint.keys != null ? [hint.keys] : [];
      for (const k of keys) h('kbd', null, chip, String(k));
      if (hint.label) h('span', 'hud-hint-label', chip, String(hint.label));
    }
  }
  function setHints(list, touchList) {
    if (arguments.length === 0) {
      hintsKeys = DEFAULT_HINTS;
      hintsTouch = TOUCH_HINTS;
    } else {
      hintsKeys = list && list.length ? list : null;
      if (touchList !== undefined) hintsTouch = touchList && touchList.length ? touchList : null;
      else hintsTouch = hintsKeys ? TOUCH_HINTS : null;
    }
    renderHints();
  }

  // ---------- touch mode + touch buttons ----------
  // Touch mode is always on while matchMedia('(pointer: coarse)') matches (a
  // phone or tablet: the buttons and "Tap to..." stay put even if a mouse or
  // keyboard is plugged in, since tapping still works). On a fine-pointer
  // device (a touch laptop) it follows the last real input instead: a finger
  // or pen switches it on, a mouse press or a key press switches it off.
  const win = typeof window !== 'undefined' ? window : null;
  let coarseMq = null;
  try {
    coarseMq = win && win.matchMedia ? win.matchMedia('(pointer: coarse)') : null;
  } catch {
    coarseMq = null;
  }
  let coarse = !!(coarseMq && coarseMq.matches);
  let lastTouch = false; // fine-pointer device whose last input was a finger / pen
  let touchForced = null; // setTouchMode(true/false) override, null = auto
  let touchMode = false;
  const hooks = { onPause: null, onSlide: null };

  function applyTouchMode() {
    const next = touchForced !== null ? touchForced : coarse || lastTouch;
    if (next === touchMode) return;
    touchMode = next;
    layer.classList.toggle('is-touch', touchMode);
    if (!touchMode) releaseSlide();
    renderHints();
    if (promptText !== null) fillWithKeys(promptEl, touchMode ? touchPrompt(promptText) : promptText);
  }
  function setTouchMode(on) {
    touchForced = on == null ? null : !!on;
    applyTouchMode();
  }

  const listeners = [];
  function listen(target, type, fn, opts) {
    if (!target || !target.addEventListener) return;
    target.addEventListener(type, fn, opts);
    listeners.push([target, type, fn, opts]);
  }
  function onMqChange(e) {
    coarse = !!e.matches;
    applyTouchMode();
  }
  if (coarseMq) {
    if (coarseMq.addEventListener) listen(coarseMq, 'change', onMqChange);
    else if (coarseMq.addListener) coarseMq.addListener(onMqChange);
  }
  const MODIFIER_KEYS = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']);
  listen(
    win,
    'pointerdown',
    (e) => {
      if (!e.isTrusted) return;
      const type = e.pointerType;
      if (type === 'touch' || type === 'pen') lastTouch = true;
      else if (type === 'mouse') lastTouch = false;
      else return;
      applyTouchMode();
    },
    { capture: true, passive: true }
  );
  listen(
    win,
    'keydown',
    (e) => {
      // ignore our own synthetic fallback keys and lone modifiers
      if (!e.isTrusted || MODIFIER_KEYS.has(e.code)) return;
      if (lastTouch) {
        lastTouch = false;
        applyTouchMode();
      }
    },
    { capture: true, passive: true }
  );

  // Buttons never keep focus: a focused button would make input.js treat the
  // next Space / Enter as a menu key instead of a game key.
  function noFocus(btn) {
    btn.addEventListener('focus', () => btn.blur());
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  noFocus(pauseBtn);
  noFocus(slideBtn);

  function firePause() {
    if (!visible) return;
    releaseSlide();
    if (typeof hooks.onPause === 'function') {
      try {
        hooks.onPause();
      } catch (err) {
        console.error('[hud] onPause failed', err);
      }
      return;
    }
    // fallback: input.js sees a fresh Escape press, which main.js pauses on
    fakeKey('keydown', 'Escape', 'Escape');
    fakeKey('keyup', 'Escape', 'Escape');
  }
  pauseBtn.addEventListener('pointerdown', (e) => e.preventDefault());
  pauseBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    firePause();
  });

  // Hold-to-slide: held while any finger that started on the button is down.
  const slidePointers = new Set();
  let slideHeld = false;
  function setSlide(down) {
    if (down === slideHeld) return;
    slideHeld = down;
    slideBtn.classList.toggle('is-held', down);
    if (typeof hooks.onSlide === 'function') {
      try {
        hooks.onSlide(down);
      } catch (err) {
        console.error('[hud] onSlide failed', err);
      }
    } else {
      // fallback: main.js already slides while left Shift is held
      fakeKey(down ? 'keydown' : 'keyup', 'ShiftLeft', 'Shift');
    }
  }
  function releaseSlide() {
    slidePointers.clear();
    setSlide(false);
  }
  slideBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!visible || !touchMode) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    slidePointers.add(e.pointerId);
    try {
      slideBtn.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety only */
    }
    setSlide(true);
  });
  function slideUp(e) {
    if (!slidePointers.delete(e.pointerId)) return;
    if (!slidePointers.size) setSlide(false);
  }
  slideBtn.addEventListener('pointerup', slideUp);
  slideBtn.addEventListener('pointercancel', slideUp);
  slideBtn.addEventListener('lostpointercapture', slideUp);
  slideBtn.addEventListener('click', (e) => e.preventDefault());
  listen(win, 'blur', releaseSlide);
  listen(typeof document !== 'undefined' ? document : null, 'visibilitychange', () => {
    if (document.hidden) releaseSlide();
  });

  applyTouchMode();
  renderHints();

  // ---------- housekeeping ----------
  // Clears transient bits (toasts, buffs, prompt, compass) for a fresh night.
  function clearToasts() {
    while (toasts.length) {
      const t = toasts.pop();
      clearTimeout(t.timer);
      timers.delete(t.timer);
      removeNode(t.node);
    }
    // nodes already sliding out
    while (toastBox.firstChild) toastBox.removeChild(toastBox.firstChild);
  }

  function reset() {
    clearToasts();
    buffMap.forEach((e) => removeNode(e.node));
    buffMap.clear();
    setPrompt(null);
    setCompass(null);
    timeTotal = 0;
    lastSec = -1;
    lastT = 0;
    countState.crackers = countState.presents = null;
    coinTarget = null;
    releaseSlide();
  }

  function dispose() {
    releaseSlide();
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    for (const [target, type, fn, opts] of listeners) {
      try {
        target.removeEventListener(type, fn, opts);
      } catch {
        /* ignore */
      }
    }
    listeners.length = 0;
    if (coarseMq && !coarseMq.removeEventListener && coarseMq.removeListener) coarseMq.removeListener(onMqChange);
    removeNode(layer);
  }

  return {
    show,
    hide,
    setTime,
    setCoins,
    setCounts,
    setPrompt,
    toast,
    setBuffs,
    setCompass,
    setSeed,
    flashTime,
    radarCanvas,
    // extras
    setHints,
    reset,
    dispose,
    get visible() {
      return visible;
    },
    el: layer,
    // touch controls (see the top of this file)
    setTouchMode,
    get touchMode() {
      return touchMode;
    },
    get slideHeld() {
      return slideHeld;
    },
    get onPause() {
      return hooks.onPause;
    },
    set onPause(fn) {
      hooks.onPause = typeof fn === 'function' ? fn : null;
    },
    get onSlide() {
      return hooks.onSlide;
    },
    set onSlide(fn) {
      // switching from the synthetic Shift fallback mid-hold: let go of it
      if (slideHeld && !hooks.onSlide) fakeKey('keyup', 'ShiftLeft', 'Shift');
      hooks.onSlide = typeof fn === 'function' ? fn : null;
    },
  };
}
