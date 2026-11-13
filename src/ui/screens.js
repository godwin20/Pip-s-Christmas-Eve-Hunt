// Full-screen menus for Pip's Christmas Eve Hunt: Title, Results, Santa's
// Workshop (Upgrades / Rewards / Pets / Wardrobe), Advent Calendar (December
// only), Joke Gallery, Leaderboard, Privacy, Pause and Help, plus the Feedback
// card over the title and results.
// Everything is plain DOM + CSS (see screens.css): a
// cosy storybook-scrapbook look with washi tape, ribbon banners, candy stripes
// and CSS doodles of Pip.

import './screens.css';
import { JOKES, JOKE_COUNTS } from '../data/jokes.js';
import { SURPRISES } from '../game/surprises.js';
import { UPGRADES, MAX_LEVEL, upgradeLevel, nextCost, buyUpgrade, computeStats } from '../game/upgrades.js';
import { MILESTONES, getMilestone, isUnlocked, isActive, nextMilestone } from '../game/milestones.js';
import { RARITY_COINS, notesLeft } from '../game/crackers.js';
import { PETS, MAX_PET_LEVEL, PET_NOTE, petLevel, feedCost, buyPet, feedPet, activePetId, setActivePet, perkText } from '../game/pets.js';
import { BAUBLES, TREE_SLOTS, TREE_ROWS, GOLDEN_STAR_ID, getBauble, foundCount, slotOf, placeBauble, removeBauble, treeSpots } from '../game/baubles.js';
import { ADVENT_TUNING, DOOR_LAYOUT, getChocolate, isAdventTime, doorState, readyDoors, openedDoors, lockedDoorText } from '../game/advent.js';
import { defaultSave } from '../core/save.js';
import { ADJECTIVES, NOUNS, isValidNameParts, nameFromParts, randomNameParts } from '../cloud/names.js';
import { PRIVACY_CONTACT } from '../cloud/config.js';
import { PRIVACY_FACTS, DELETE_FACTS, POLICY_PAGE, deleteWords } from './privacy-text.js';
import { FEEDBACK_CATEGORIES, FEEDBACK_QUICK, FEEDBACK_QUICK_MAX, FEEDBACK_COMMENT_MAX, cleanSeed } from '../cloud/feedback.js';
import { isInAppBrowser, isIOS, isIPad } from '../core/pwa.js';
import { BIRTH_MONTHS, birthYears, ageCheck, notYetBorn, passUntil, lockUntil, gateStep, gateOutcome, GATE_PASS_KEY, GATE_LOCK_KEY } from './age-gate.js';

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

const KIND_INFO = {
  joke: { icon: '😂', label: 'Joke', plural: 'Jokes' },
  quote: { icon: '💬', label: 'Quote', plural: 'Quotes' },
  secret: { icon: '🤫', label: 'Secret', plural: 'Secrets' },
};
const RARITY_LABEL = { common: 'Common', rare: 'Rare', legendary: 'Legendary' };
const LOCKED_CARDS_SHOWN = 24;

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
  { id: 'pets', icon: '🐾', label: 'Pets' },
  { id: 'wardrobe', icon: '🧣', label: 'Wardrobe' },
];

// The sound each pet makes when it is bought or fed (see src/core/audio.js).
const PET_CRIES = { puppy: 'bark', kitten: 'meow', reindeer: 'bleat', penguin: 'cheep' };

// Matches main.js / input.js: slide = Space or left Shift, interact = E /
// Enter / click, Tab = peek at the Gallery.
const DEFAULT_CONTROLS = [
  { keys: ['W', 'A', 'S', 'D'], text: 'or the arrow keys to waddle about' },
  { keys: ['Drag'], text: 'the mouse (or a finger) to look around' },
  { keys: ['Wheel'], text: 'or pinch to zoom in and out' },
  { keys: ['E', 'Click'], text: 'to pull a cracker, open a present, crack a candy cane or shake a tree' },
  { keys: ['Space', 'Shift'], text: 'hold while moving to belly-slide! Wheee!' },
  { keys: ['Tab'], text: 'to peek at your Joke Gallery' },
  { keys: ['Esc'], text: 'to pause the night' },
];

// The same on a touch screen (input.js and hud.js): a finger that starts on
// the left part of the screen is a joystick, one anywhere else looks around,
// two pinch, and a quick tap anywhere is the E key. The HUD's Slide and pause
// buttons do the rest, and the Gallery is on the pause menu.
const TOUCH_CONTROLS = [
  { keys: ['Drag'], text: 'a finger on the left side of the screen to waddle about' },
  { keys: ['Drag'], text: 'on the right side to look around' },
  { keys: ['Pinch'], text: 'with two fingers to zoom in and out' },
  { keys: ['Tap'], text: 'when Pip is next to a cracker, present, candy cane or tree to pull, open, crack or shake it' },
  // (quiet: the words name the same button, so a screen reader says it once)
  { keys: ['Slide'], text: 'hold the Slide button while moving to belly-slide! Wheee!', quiet: true },
  { keys: ['⏸'], text: 'tap the pause button at the top right to pause the night or visit your Joke Gallery', quiet: true },
];

// How to Play's Controls card: touch, or keys and the mouse.
export function controlsList(touch) {
  return touch ? TOUCH_CONTROLS : DEFAULT_CONTROLS;
}

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
const LEADERBOARD_BACKS = new Set(['title', 'results']);
const PRIVACY_BACKS = new Set(['title', 'leaderboard']);

// Used only if the cloud facade has no BOARDS of its own (docs/CLOUD.md).
const DEFAULT_BOARDS = [
  { id: 'bestNight', label: 'Best Night', icon: '🌙', unit: 'presents' },
  { id: 'totalPresents', label: 'All Presents', icon: '🎁', unit: 'presents' },
  { id: 'jokesFound', label: 'Jokes Found', icon: '🎉', unit: 'jokes' },
];
const BOARD_BLURBS = {
  bestNight: 'Most presents opened in one night',
  totalPresents: 'Every present opened, all nights added up',
  jokesFound: 'Different jokes found in crackers',
};
const BOARD_TONES = ['red', 'gold', 'green'];
const MEDALS = ['🥇', '🥈', '🥉'];
const BOARD_LIMIT = 25;
const CLOUD_TIMEOUT_MS = 10000; // a spinner turns into "try again" after this
const BOARD_CACHE_MS = 30000; // tab hopping re-reads nothing for a while (Firestore reads cost)
const PROFILE_RELOAD_MS = 1500; // the leaderboard write follows the name change's push
const BOARD_RECHECK_MS = 7000; // the cloud spaces leaderboard writes 6 s apart
const DELETE_TIMEOUT_MS = 20000; // deleting is several round trips (docs, account, a new guest)
// The grown-ups gate's "not now" (src/ui/age-gate.js): gentle, and it never
// says what age would have passed.
const GATE_NOT_NOW_TEXT = 'Ask a grown-up to help you with this one.';
const LINKED_TEXT = 'All set! Your progress now follows your Google account. ✨';
const SWITCHED_TEXT = "Welcome back! We found your saved progress and added this device's progress to it. ✨";
const DELETED_TEXT = 'All deleted. This device starts fresh with a new snow name.';
// deleteEverything() answers accountDeleted: false (guest: false) when Firebase
// had already signed a Google account out by itself, so nobody could confirm it
const DELETED_KEPT_TEXT = 'Your saved data is deleted and this device starts fresh. To remove the Google sign-in too, sign in again and delete straight away.';
// ...and needsReauth when Google wants a grown-up to confirm once more before
// the Google sign-in can go. The rest is deleted already, and the cloud's
// status.needsReauth keeps "Confirm with Google" on screen until it is done.
const REAUTH_TEXT =
  'Your saved data is deleted and this device starts fresh. One more step: Google wants a grown-up to confirm, and then the Google sign-in (email address, name, profile photo and Google account ID) goes too.';
const REAUTH_PICK = 'Pick the Google account you signed in with.';
const REAUTH_LABEL = 'Confirm with Google to finish deleting';
const REAUTH_CLOSED = "The Google window closed, so the Google sign-in is still here. Press the button again when you're ready.";
const REAUTH_WRONG = "That's a different Google account. Please pick the one you signed in to the game with.";
const IN_APP_TEXT = 'To sign in with Google, open this game in Safari or Chrome.';
const IOS_GUEST_TEXT = "On iPhone and iPad, the browser may clear a guest's progress after about a week of not playing. Sign in with Google to keep it.";
// iPhone / iPad keep a Home Screen app's storage apart from Safari's tabs.
// Only a Google account carries progress across, and Google sign-in inside a
// Home Screen app is unproven on recent iOS, so the way back to Safari is
// spelled out too.
const HOME_APP_TEXT =
  "This Home Screen app keeps its own save, apart from Safari, so a guest starts fresh here. Signed in with Google in Safari? Sign in here too to bring that progress across. If signing in doesn't finish here, keep playing in Safari instead.";
const HOME_APP_LINE = 'Signed in with Google in Safari? Sign in here too';

// Feedback (docs/CLOUD.md, "Feedback"): one send per night. After one, the
// Feedback links say thanks until the next night ends; localStorage keeps
// that through a reload (the rules' 10-minute limit is the real guard).
const FEEDBACK_LOCK_KEY = 'pips-hunt-feedback-sent';
const FEEDBACK_THANKS = 'Thanks! You can send more after your next night';
const FEEDBACK_TOAST = "Thank you! Pip's elves are reading it 🧝";
const FEEDBACK_TIMEOUT_MS = 20000; // the facade waits its turn behind a sync, then one batch
const TOAST_MS = 4500;

// PWA notices (update ready, offline ready) appear only on these menus: never
// over a night, its pause menu or the gallery peeked at from it.
const NOTICE_SCREENS = new Set(['title', 'results', 'shop', 'advent', 'gallery', 'leaderboard']);
const OFFLINE_NOTE_MS = 6000;

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
  if (!save.pets || typeof save.pets !== 'object') save.pets = {};
  if (!save.tree || typeof save.tree !== 'object') save.tree = {};
  if (!save.settings || typeof save.settings !== 'object') save.settings = { sfx: true, music: true, voice: true };
  if (!Array.isArray(save.foundJokes)) save.foundJokes = [];
  if (!Array.isArray(save.unlocked)) save.unlocked = [];
  if (!Array.isArray(save.foundBaubles)) save.foundBaubles = [];
  for (const k of ['coins', 'candy', 'candyEarned', 'treeSetAt', 'totalPresents', 'totalCrackers', 'nights', 'bestPresentsInNight']) {
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
  text-align: center;
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
@media (min-height: 541px) and (max-height: 700px) {
  /* 24 + 26 (book top) + page + 8 fits the window, so the overlay itself
     never scrolls a few pixels under the page (under 541px the whole screen
     scrolls instead: screens.css) */
  .scr--shop .scr-stage {
    padding-top: 24px;
    padding-bottom: 8px;
  }
  .scr-shop .scr-page {
    max-height: calc(100vh - 60px);
    max-height: calc(100dvh - 60px - var(--safe-top) - var(--safe-bottom));
  }
}
@media (max-height: 700px) {
  .scr-shop .scr-sub {
    display: none;
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

// What tonight's finds did for the Gallery: the Results screen's banner, for
// the last joke of all or the highest multiple of 25 the count passed tonight.
export function galleryNews(found, newCount, total) {
  if (newCount <= 0) return null;
  if (found >= total) return { full: true, text: `You found every joke, saying and Secret Note. All ${fmt(total)}!` };
  const mark = Math.floor(found / 25) * 25;
  if (mark <= 0 || mark <= found - newCount) return null;
  return { full: false, text: `${fmt(mark)} jokes in your Gallery! ${fmt(total - found)} still hiding.` };
}

// How far along Santa's Secret Notes are, or null once they're all found.
export function notesGoal(foundIds) {
  const left = notesLeft(foundIds);
  if (!left) return null;
  return { have: JOKE_COUNTS.legendary - left, total: JOKE_COUNTS.legendary };
}

// The divider above the "???" cards.
export function hidingText(filter, n) {
  return filter === 'secret' ? `🌈 Secret Notes hide in rainbow crackers. Still hiding: ${fmt(n)}` : `🔒 Still hiding in crackers: ${fmt(n)}`;
}

// Every filter tap builds all its cards, so a long "???" list stops early and
// says how many more there are. Found cards are never cut.
export function lockedPreview(missing) {
  const more = missing.length - LOCKED_CARDS_SHOWN;
  return { shown: missing.slice(0, LOCKED_CARDS_SHOWN), more: more > 0 ? `...and ${fmt(more)} more hiding in crackers.` : null };
}

// Nothing left to find or to buy.
export function huntComplete(save) {
  return countFound(save) >= jokeTotal() && UPGRADES.every((u) => nextCost(save, u.id) === null);
}

export function maxedHint(coinsEarned) {
  return `✨ Wow! Every upgrade is maxed out. Pip is the best-equipped penguin in the North Pole! You've earned ${fmt(coinsEarned)} coins in all.`;
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
// Cloud helpers (docs/CLOUD.md). Pure, so odd facade answers can't break a menu.
// ---------------------------------------------------------------------------

// Kid-friendly words for the cloud status, shared by the title chip and the
// leaderboard's account card. (Guests get their "Sign in" nudge from the
// sign-in strip next to the chip.)
function cloudInfo(status) {
  const s = status && typeof status === 'object' ? status : {};
  // "Delete my saved data" waits for Google: nothing syncs until it is done
  if (s.needsReauth === true) return { tone: 'warn', text: 'Almost deleted: confirm with Google' };
  switch (s.state) {
    case 'connecting':
      return { tone: 'busy', text: 'Finding the cloud…' };
    case 'syncing':
      return { tone: 'busy', text: 'Saving…' };
    case 'synced':
      return { tone: 'ok', text: 'Saved to the cloud ☁️' };
    case 'offline':
      return { tone: 'warn', text: 'Offline: saved on this device' };
    case 'error':
      return { tone: 'warn', text: 'Cloud hiccup: saved on this device' };
    default:
      return { tone: 'off', text: 'Saved on this device' };
  }
}

// Which account view to show: 'checking', 'guest', 'google:<name>' or
// 'pending:<name>' (a delete waiting for Google, status.needsReauth). The views
// only rebuild when this changes, so "Saving…" ↔ "Saved" flips never touch
// their buttons (or the focus). Before the first sync the facade still reports
// its default isAnonymous: true, so a returning Google player would see a
// "Sign in" button flash up at boot without the 'checking' step.
export function accountSig(status) {
  const s = status && typeof status === 'object' ? status : {};
  if (s.isAnonymous === false) return `${s.needsReauth === true ? 'pending' : 'google'}:${typeof s.accountName === 'string' ? s.accountName : ''}`;
  if (!s.lastSyncedAt && (s.state === 'off' || s.state === 'connecting')) return 'checking';
  return 'guest';
}

function accountName(status) {
  const n = status && typeof status.accountName === 'string' ? status.accountName.trim() : '';
  return n || null;
}

// Firebase errors reach us as codes ('auth/popup-blocked'), Error objects or
// plain strings, depending on where the facade caught them.
function errorText(err) {
  if (!err) return '';
  if (typeof err === 'string') return err;
  try {
    return String(err.code || err.message || err.name || '');
  } catch {
    return '';
  }
}

// Closing the Google popup is a change of mind, not a failure.
function isCancelled(res) {
  if (res && (res.cancelled || res.canceled || res.reason === 'cancelled')) return true;
  return /cancel|closed-by-user|popup-closed/i.test(errorText(res && res.error));
}

function looksOffline(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return /offline|network|unavailable|deadline/i.test(errorText(err));
}

// The facade answers 'not-ready' when a tap beat the SDK (docs/CLOUD.md).
function isNotReady(err, reason) {
  return reason === 'not-ready' || /not-ready/i.test(errorText(err));
}

// A failed sign-in comes sorted by `reason` ('blocked', 'setup', 'offline',
// 'not-ready', 'failed') with the Firebase code kept in `error`; either one
// picks the words.
function linkErrorText(err, reason) {
  const code = errorText(err);
  if (reason === 'blocked' || /popup-blocked/i.test(code)) return 'Your browser blocked the Google window. Tap the button again.';
  // a setup slip on the owner's side (Firebase's authorised domains), not the player's
  if (/unauthorized-domain/i.test(code)) return "Google sign-in isn't set up for this web address yet. The game's owner can add it in Firebase.";
  // a web view the user-agent check missed
  if (/operation-not-supported-in-this-environment|web-storage-unsupported/i.test(code)) return IN_APP_TEXT;
  if (reason === 'offline' || looksOffline(err)) return "You're offline right now. Please try again when the internet is back.";
  if (reason === 'setup' || /operation-not-allowed|no-cloud|cloud-off/i.test(code)) return "Google sign-in isn't switched on for this copy of the game yet.";
  if (isNotReady(err, reason)) return 'One moment… then tap the button again.';
  return "Sign-in didn't work this time. Please try again.";
}

function deleteErrorText(err, timedOut) {
  if (timedOut) return 'Deleting is taking too long. Please check the internet and try again.';
  if (looksOffline(err)) return "You're offline right now. Please try again when the internet is back.";
  if (isNotReady(err)) return 'One moment… then try again.';
  return "Couldn't delete just now. Please try again.";
}

// What "Confirm with Google to finish deleting" says when reauthAndDelete()
// answers { ok: false }. The button stays, so the player can try again.
function reauthErrorText(res) {
  const code = errorText(res && res.error);
  const reason = res && res.reason;
  if (reason === 'wrong-account' || /user-mismatch/i.test(code)) return REAUTH_WRONG;
  if (reason === 'blocked' || /popup-blocked/i.test(code)) return linkErrorText(code, 'blocked');
  if (reason === 'offline' || looksOffline(code)) return linkErrorText(code, 'offline');
  if (isNotReady(code, reason)) return 'One moment… then tap the button again.';
  return "Couldn't finish deleting just now. Please try again.";
}

// What the feedback card says when sendFeedback() answers { ok: false, error }.
// Whatever was picked or typed stays in the card.
function feedbackErrorText(err, timedOut) {
  const code = errorText(err);
  if (timedOut) return 'Sending is taking too long. Please check the internet and try again.';
  if (/too-soon/i.test(code)) return "Pip's elves got a note from you a moment ago. Please try again in a few minutes. Thank you!";
  if (looksOffline(err)) return "You're offline right now. Please try again when the internet is back.";
  if (/invalid/i.test(code)) return "Something in the card isn't quite right. Please check it and try again.";
  if (/cloud-off|no-cloud/i.test(code)) return "Feedback isn't switched on for this copy of the game.";
  return "Couldn't send just now. Please try again.";
}

// PRIVACY_CONTACT (src/cloud/config.js): a web page opens in a new tab and an
// email address becomes a mailto: link. Anything else shows as plain text.
function contactLink(raw) {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return null;
  if (/^https?:\/\/\S+$/i.test(s)) return { href: s, text: s.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''), external: true };
  const mail = s.replace(/^mailto:/i, '');
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(mail)) return { href: `mailto:${mail}`, text: mail, external: false };
  return { href: null, text: s, external: false };
}

// getLeaderboard() answers { entries: [{ rank, name, score, isMe }], me, error? }.
// Rows are tidied rather than trusted, and an answer without entries is an error.
function normaliseBoard(res) {
  const src = res && typeof res === 'object' ? res : {};
  const whole = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);
  const entries = [];
  for (const e of Array.isArray(src.entries) ? src.entries : []) {
    if (!e || typeof e !== 'object') continue;
    entries.push({
      rank: whole(e.rank) || entries.length + 1,
      name: typeof e.name === 'string' && e.name.trim() ? e.name.trim() : 'Mystery Penguin',
      score: whole(e.score),
      isMe: e.isMe === true,
    });
  }
  const me = src.me && typeof src.me === 'object' && whole(src.me.rank) > 0 ? { rank: whole(src.me.rank), score: whole(src.me.score) } : null;
  return { entries, me, error: src.error || (Array.isArray(src.entries) ? null : 'no-entries') };
}

// What the board shows right now. The player's own row follows their local
// snow name at once (the cloud copy catches up after the next sync), and it
// leaves the list as soon as they hide.
function boardView(data, profile) {
  const entries = data && Array.isArray(data.entries) ? data.entries : [];
  if (profile && profile.hidden) {
    const mine = entries.find((e) => e.isMe);
    const others = entries.filter((e) => !e.isMe);
    return { hidden: true, me: null, entries: mine ? others.map((e) => (e.rank > mine.rank ? { ...e, rank: e.rank - 1 } : e)) : others };
  }
  const name = isValidNameParts(profile) ? nameFromParts(profile) : null;
  return {
    hidden: false,
    me: data && data.me ? data.me : null,
    entries: name ? entries.map((e) => (e.isMe ? { ...e, name } : e)) : entries,
  };
}

function unitWords(unit) {
  const many = typeof unit === 'string' && unit ? unit : 'points';
  return { many, one: many.endsWith('s') ? many.slice(0, -1) : many };
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

function sweet() {
  return h('span', { class: 'scr-sweet', 'aria-hidden': 'true' });
}

// A bauble, drawn in CSS from its colours and pattern (.scr-bauble). Decoration:
// whatever holds one says its name.
function baubleEl(b) {
  return h(
    'span',
    { class: 'scr-bauble', 'data-pattern': b.pattern, 'aria-hidden': 'true', style: { '--a': b.colours[0], '--b': b.colours[1] } },
    h('i', null, b.pattern === 'stars' ? '★' : null)
  );
}

// Each chocolate shape on a 48 x 48 grid. a = its main colour, b = the accent.
const CHOC_DRAW = {
  star: (a, b) =>
    `<path d="M24 5l5.6 12.3 13.4 1.5-10 9.1 2.8 13.3L24 34.5l-11.8 6.7L15 27.9 5 18.8l13.4-1.5z" fill="${a}"/><circle cx="24" cy="25" r="5" fill="${b}" stroke="none"/>`,
  heart: (a, b) =>
    `<path d="M24 41C10 31 5 24 5 16.5 5 10 10 6 15.5 6c3.5 0 7 2 8.5 5 1.5-3 5-5 8.5-5C38 6 43 10 43 16.5 43 24 38 31 24 41z" fill="${a}"/><path d="M13 17l5 5 6-5 6 5 5-5" fill="none" stroke="${b}" stroke-width="3"/>`,
  bell: (a, b) =>
    `<circle cx="24" cy="40" r="4" fill="${b}"/><path d="M24 6c-7 0-11 6-11 13 0 9-3 13-6 17h34c-3-4-6-8-6-17 0-7-4-13-11-13z" fill="${a}"/><path d="M12.5 29h23" fill="none" stroke="${b}" stroke-width="3"/>`,
  tree: (a, b) =>
    `<path d="M24 4l11 14h-5l9 12h-7l10 12H6l10-12H9l9-12h-5z" fill="${a}"/><g fill="${b}" stroke="none"><circle cx="21" cy="19" r="2.2"/><circle cx="28" cy="27" r="2.2"/><circle cx="18" cy="33" r="2.2"/><circle cx="30" cy="37" r="2.2"/></g>`,
  truffle: (a, b) =>
    `<circle cx="24" cy="25" r="18" fill="${a}"/><path d="M11 19c4-6 9 4 13-2s9 5 13 1" fill="none" stroke="${b}" stroke-width="3.5"/><path d="M12 31c3 2 6 3 9 3" fill="none" stroke="${b}" stroke-width="2.5"/>`,
  bar: (a, b) =>
    `<rect x="6" y="9" width="36" height="30" rx="4" fill="${a}"/><path d="M18 9v30M30 9v30M6 24h36" fill="none" stroke="${b}" stroke-width="2.5"/>`,
  coin: (a, b) =>
    `<circle cx="24" cy="24" r="19" fill="${a}"/><circle cx="24" cy="24" r="13.5" fill="none" stroke="${b}" stroke-width="2.5"/><path d="M24 14.5l2.8 6.2 6.7.7-5 4.5 1.4 6.6-5.9-3.3-5.9 3.3 1.4-6.6-5-4.5 6.7-.7z" fill="${b}" stroke="none"/>`,
  present: (a, b) =>
    `<path d="M24 12c-3-7-13-8-13-3 0 4 7 4 13 3zm0 0c3-7 13-8 13-3 0 4-7 4-13 3z" fill="${b}"/><rect x="7" y="19" width="34" height="23" rx="3" fill="${a}"/><rect x="4" y="12" width="40" height="9" rx="3" fill="${a}"/><path d="M24 12v30" fill="none" stroke="${b}" stroke-width="6"/>`,
};

// A chocolate as inline SVG, from the fixed list in game/advent.js.
export function chocolateHTML(choc) {
  const draw = CHOC_DRAW[choc.shape] || CHOC_DRAW.truffle;
  return `<svg class="scr-choc" viewBox="0 0 48 48" aria-hidden="true" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">${draw(...choc.colours)}</svg>`;
}

// The Wardrobe's tree, on the same 300 x 340 grid as TREE_SPOT_ROWS below.
const TREE_SVG = `<svg class="scr-xtree__art" viewBox="0 0 300 340" aria-hidden="true" stroke="#2a1b3d" stroke-width="4" stroke-linejoin="round">
  <path d="M112 318h76l-8 18h-60z" fill="#d7263d"/>
  <rect x="132" y="284" width="36" height="36" fill="#7a4a2b"/>
  <path d="M150 150l140 138q-140 18-280 0z" fill="#1f8a4c"/>
  <path d="M150 80l112 126q-112 16-224 0z" fill="#27a05a"/>
  <path d="M150 26l76 104q-76 12-152 0z" fill="#31b56a"/>
  <path d="M150 4l6.5 13.5 15 1.7-11 10 3 14.8-13.5-7.5-13.5 7.5 3-14.8-11-10 15-1.7z" fill="#ffc94a"/>
</svg>`;

// Bottom row first, as TREE_ROWS counts them: [height, half the row's width].
const TREE_SPOT_ROWS = [
  [262, 98],
  [186, 72],
  [114, 36],
  [66, 0],
];

// Where each slot sits on the drawing, as percentages, so the buttons on top of
// it line up at any size. Same order as TREE_SLOTS: left to right, bottom up.
export function treeSpotPlaces() {
  const places = [];
  TREE_ROWS.forEach((n, row) => {
    const [y, half] = TREE_SPOT_ROWS[row];
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 150 : 150 - half + (2 * half * i) / (n - 1);
      places.push({ left: `${((x / 300) * 100).toFixed(2)}%`, top: `${((y / 340) * 100).toFixed(2)}%` });
    }
  });
  return places;
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

// Safari's Share icon (a box with an arrow), for the "Add to Home Screen" steps.
const SHARE_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="1.2em" height="1.2em" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 9.5H6.5A1.5 1.5 0 0 0 5 11v8.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V11a1.5 1.5 0 0 0-1.5-1.5H16"/><path d="M12 14.5V3"/><path d="M8.5 6.5 12 3l3.5 3.5"/></svg>';

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
    shop: null, // { panel, purseNum, purseIcon, purseWord, purse, tabs }
    // the Wardrobe tree's half-made choice: a spot or a bauble tapped first
    treePick: { slot: null, bauble: null },
    petTap: { id: null, at: 0 }, // the last Buy or Feed, so a double-tap only spends once
    advent: null, // refs of the open calendar: { say, count, doors: Map(day -> button) }
    doorOpenedAt: 0, // when a door last opened, so a double-tap keeps its reward message
    adventSig: '', // what the title's button showed, to spot the day changing
    leaderboardBack: 'title',
    board: null, // id of the leaderboard tab last shown
    boardCache: new Map(), // board id -> { data, at }
    lb: null, // refs + async bookkeeping of the open leaderboard screen
    // Google sign-in / sign-out outlive a screen (the popup can finish after
    // the title was rebuilt, or on the leaderboard), so they live here.
    // op: { kind: 'link' | 'signout' | 'delete', token, slow } | null
    // note: { tone: 'ok' | 'info' | 'error', text, visit } | null
    auth: { op: null, seq: 0, note: null },
    visit: 0, // bumped when the player opens a screen, not when refresh() rebuilds it
    spareName: null, // shown if the save has no snow name yet (main.js gives one at boot)
    lastSummary: null,
    confirmReset: false,
    homeHelp: false, // the title's "Add to Home Screen" steps are open (iPhone / iPad Safari)
    // PWA notices: "Later" hides the update prompt until the next visit, and
    // the offline note shows once
    noticeLater: false,
    offlineNoted: false,
    offlineNoteUntil: 0,
    refreshing: false, // "Refresh" was tapped; the page reloads soon
    privacyBack: 'title',
    privacy: null, // refs of the open privacy screen
    confirmDelete: false, // "Delete my saved data?" is up (privacy screen or account card)
    // The grown-ups gate in front of Google sign-in, on the screen (and visit)
    // that asked: { at, visit, step, month, year, msg } | null, where step is
    // 'ask', 'passed' or 'notNow' (src/ui/age-gate.js)
    gate: null,
    gateUntil: 0, // Date.now() until which a pass lets taps go straight to Google
    gateLockUntil: 0, // ...and until which a "not now" shows instead of the question
    nightOn: false, // a night started from these menus and hasn't ended yet
    feedbackLocked: false, // feedback was sent; more after the next night ends
    fb: null, // the open feedback card: what was picked, its refs and send state
    toastTimer: null,
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
  // Today, for the calendar. main.js decides: the dev server can pretend.
  const today = () => {
    try {
      return deps.getNow?.() ?? new Date();
    } catch {
      return new Date();
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
  // Touch or keys? main.js passes the HUD's touch mode (src/ui/hud.js): a
  // phone or tablet, or a touch laptop last used with a finger. Key names and
  // "Esc =" hints mean nothing there, so touch gets touch words instead.
  const touch = () => {
    try {
      return deps.isTouch?.() === true;
    } catch {
      return false;
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
  // ---- cloud facade (docs/CLOUD.md): optional, and every call is guarded ----
  const cloud = () => {
    try {
      const c = deps.cloud;
      return c && typeof c === 'object' && c.enabled ? c : null;
    } catch {
      return null;
    }
  };
  const cloudStatus = () => {
    try {
      const s = cloud()?.status;
      return s && typeof s === 'object' ? s : {};
    } catch {
      return {};
    }
  };
  const hasCloudMethod = (name) => {
    try {
      return typeof cloud()?.[name] === 'function';
    } catch {
      return false;
    }
  };
  // Resolves with the method's result object, or { ok: false, error } when it
  // is missing, throws or rejects. Never rejects.
  const cloudCall = (name, ...args) => {
    const c = cloud();
    if (!hasCloudMethod(name)) return Promise.resolve({ ok: false, error: 'no-cloud' });
    try {
      return Promise.resolve(c[name](...args)).then(
        (res) => (res && typeof res === 'object' ? res : { ok: res !== false }),
        (err) => {
          console.warn(`[screens] cloud.${name} failed`, err);
          return { ok: false, error: err };
        }
      );
    } catch (err) {
      console.warn(`[screens] cloud.${name} failed`, err);
      return Promise.resolve({ ok: false, error: err });
    }
  };
  // Runs `fn` with a cloudCall result; a bug in `fn` is logged, never thrown.
  const whenDone = (promise, fn) =>
    promise.then((res) => {
      try {
        fn(res);
      } catch (err) {
        console.error('[screens] cloud result handling failed', err);
      }
    });
  // accountSig(), except that 'checking' gives up after CLOUD_TIMEOUT_MS, so a
  // cloud that never gets going can't hide the sign-in button for good.
  const createdAt = Date.now();
  const sigNow = (st = cloudStatus()) => {
    const sig = accountSig(st);
    return sig === 'checking' && Date.now() - createdAt >= CLOUD_TIMEOUT_MS ? 'guest' : sig;
  };
  // `ready` (docs/CLOUD.md Round 2): the SDK is loaded and the guest exists,
  // so linkGoogle() can open its popup inside the tap. A facade from before
  // it existed counts as ready.
  const cloudReady = () => {
    try {
      const r = cloud()?.ready;
      return typeof r === 'boolean' ? r : true;
    } catch {
      return false;
    }
  };
  // "Delete my saved data" is waiting for one more Google sign-in before the
  // Google account's sign-in can go (docs/CLOUD.md, status.needsReauth).
  const reauthPending = () => cloudStatus().needsReauth === true && hasCloudMethod('reauthAndDelete');
  // Fixed for the page's life, so it is read once. Google refuses sign-in
  // inside apps' own browsers (src/core/pwa.js), so those get a "use Safari
  // or Chrome" note instead of a button that can't work.
  const IN_APP = isInAppBrowser();
  // IOS_GUEST_TEXT is about the week-long storage limit of Safari's engine,
  // which every browser on iPhone / iPad runs on (Chrome, Firefox and Edge
  // there too), so only those show it. Apps' own browsers have their own note.
  const IOS_BROWSER = isIOS() && !IN_APP;
  // ---- PWA facade (src/core/pwa.js): optional, and every read is guarded ----
  const pwa = () => {
    try {
      const p = deps.pwa;
      return p && typeof p === 'object' ? p : null;
    } catch {
      return null;
    }
  };
  // One of its flags (updateReady, canInstall…): false if missing or broken.
  const pwaFlag = (name) => {
    try {
      return pwa()?.[name] === true;
    } catch {
      return false;
    }
  };
  state.gateUntil = readGateUntil(); // a pass before a reload of this tab still counts
  state.feedbackLocked = readFeedbackLock(); // sent before a reload, and no night has ended since
  const canFeedback = () => hasCloudMethod('sendFeedback');
  const cloudBoards = () => {
    let list = null;
    try {
      list = cloud()?.BOARDS;
    } catch {
      list = null;
    }
    const boards = (Array.isArray(list) ? list : [])
      .filter((b) => b && typeof b.id === 'string' && b.id)
      .map((b) => ({ id: b.id, label: String(b.label || b.id), icon: String(b.icon || '🏆'), unit: b.unit }));
    return boards.length ? boards : DEFAULT_BOARDS;
  };

  const goHomeFn = () => deps.onGoHome || deps.onEndNight || null;
  // Start / Next Night: remembers how many jokes were already found, so the
  // Gallery can tell which cards are new tonight, and that a night is on (its
  // end lets the player send feedback again).
  const startNight = () => {
    const before = getSave().foundJokes.length;
    const fn =
      typeof deps.onStartNight === 'function'
        ? () => {
            state.nightFoundStart = before;
            state.nightOn = true;
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
  // Timers of a sign-in / sign-out, which keep running across screen changes.
  const authTimers = new Set();
  function authLater(fn, ms) {
    const id = setTimeout(() => {
      authTimers.delete(id);
      try {
        fn();
      } catch (err) {
        console.error('[screens] sign-in timer failed', err);
      }
    }, ms);
    authTimers.add(id);
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
  // PWA notices ("new version", "works offline"): beside the stage, so screen
  // changes and rebuilds leave them (and a focused "Refresh") alone.
  const notice = h('div', { class: 'scr-notice hidden', role: 'status' });
  // "Thank you!" after feedback is sent. Always in the page (empty while
  // hidden), so screen readers hear the words when they appear.
  const toast = h('div', { class: 'scr-toast', role: 'status' });
  el.append(snow, stage, notice, toast);
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

  // `rebuild` is refresh() redrawing the same screen: notes that belong to
  // this visit (see state.auth) stay on screen.
  function open(name, build, { rebuild = false } = {}) {
    // the feedback card stays over a redraw of its own screen (a cloud merge
    // calls refresh()), and goes with any other
    if (state.fb && state.current !== name) closeFeedback({ focus: false });
    clearTimers();
    state.opens++;
    if (!rebuild || state.current !== name) state.visit++;
    const wasHidden = state.current === null;
    state.current = name;
    state.shop = null;
    state.advent = null;
    state.lb = null;
    state.privacy = null;
    state.confirmDelete = false;
    if (name !== 'title') {
      state.confirmReset = false;
      state.homeHelp = false;
    }
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
    renderNotice();
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
    // nothing of the menus stays over a night
    closeFeedback({ focus: false });
    hideToast();
    clearTimers();
    const was = state.current;
    state.current = null;
    state.shop = null;
    state.advent = null;
    state.lb = null;
    state.privacy = null;
    state.confirmReset = false;
    state.homeHelp = false;
    state.confirmDelete = false;
    state.gate = null;
    el.className = 'scr hidden';
    stage.replaceChildren();
    renderNotice();
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
    if (state.fb && e.key === 'Tab') {
      trapFeedbackTab(e);
      return;
    }
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
    // the feedback card sits over the screen, so Esc is its first
    if (state.fb) {
      feedbackBack();
      return;
    }
    switch (state.current) {
      case 'title':
        // Esc closes an open question; the title itself has nowhere to go back to
        if (closeGate()) break;
        if (state.homeHelp) {
          closeHomeHelp();
          break;
        }
        if (state.confirmReset) {
          state.confirmReset = false;
          renderResetArea();
          focusEl(resetArea && resetArea.querySelector('[data-key="reset"]'));
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
      case 'advent':
        play('click');
        leaveAdvent();
        break;
      case 'gallery':
        play('click');
        leaveGallery();
        break;
      case 'help':
        play('click');
        leaveHelp();
        break;
      case 'leaderboard':
        // like the title's reset confirm, Esc first closes an open question
        // (grown-ups gate, sign out, delete), then leaves
        if (closeGate()) break;
        if (state.lb && state.lb.confirmSignOut && !authBusy()) {
          cancelSignOut();
          break;
        }
        if (state.confirmDelete && !authBusy()) {
          cancelDelete();
          break;
        }
        play('click');
        leaveLeaderboard();
        break;
      case 'privacy':
        if (state.confirmDelete && !authBusy()) {
          cancelDelete();
          break;
        }
        play('click');
        leavePrivacy();
        break;
      case 'pause':
        fire(deps.onResume, hideAll);
        break;
      default:
        break;
    }
  }

  // Android's Back button and a browser's (src/core/back.js) do what Esc
  // does, wherever goBack() has something to do: anywhere but the plain
  // title, where only an open question (the grown-ups gate, the feedback
  // card, the reset or Home Screen steps) has.
  function hasBack() {
    if (state.current === null) return false;
    if (state.current !== 'title') return true;
    return !!(state.fb || gateHere('title') || state.homeHelp || state.confirmReset);
  }

  function leaveShop() {
    if (state.shopBack === 'results' && state.lastSummary) renderResults(state.lastSummary, true);
    else showTitle();
  }
  function leaveAdvent() {
    showTitle();
    focusEl(stage.querySelector('[data-key="advent"]'));
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
  function leaveLeaderboard() {
    if (state.leaderboardBack === 'results' && state.lastSummary) renderResults(state.lastSummary, true);
    else showTitle();
  }
  // Back on the screen that opened it, with focus on the link that did.
  function leavePrivacy() {
    if (state.privacyBack === 'leaderboard' && cloud()) {
      openLeaderboard(state.leaderboardBack, { focus: 'privacy' });
      return;
    }
    showTitle();
    focusEl(stage.querySelector('[data-key="privacy"]'));
  }

  // ---------------------------------------------------------------------------
  // Shared widgets
  // ---------------------------------------------------------------------------

  // `key` names the button for keepFocus(), so a re-rendered card can put
  // focus back on "the same" button.
  function button(label, { icon, variant = 'red', size = '', autofocus = false, onClick, cls = '', aria, key } = {}) {
    const b = h(
      'button',
      {
        type: 'button',
        class: `scr-btn scr-btn--${variant}${size ? ` scr-btn--${size}` : ''}${cls ? ` ${cls}` : ''}`,
        'data-autofocus': autofocus || null,
        'aria-label': aria || null,
        'data-key': key || null,
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

  function focusEl(node) {
    if (!node || typeof node.focus !== 'function') return;
    try {
      node.focus({ preventScroll: true });
    } catch {
      node.focus();
    }
  }

  // Runs `render` (which replaces what is inside `box`). If focus was inside,
  // it goes back to the control with the same data-key, else to `fallback()`,
  // so keyboard players never get dropped onto <body>.
  function keepFocus(box, render, fallback) {
    const doc = typeof document !== 'undefined' ? document : null;
    const active = doc ? doc.activeElement : null;
    const inside = !!(box && active && active !== box && box.contains(active));
    const key = inside && active.getAttribute ? active.getAttribute('data-key') : null;
    render();
    if (!inside || box.contains(doc.activeElement)) return;
    const same = key ? box.querySelector(`[data-key="${key}"]`) : null;
    focusEl(same || (typeof fallback === 'function' ? fallback() : null));
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
          { type: 'button', class: 'scr-toggle', 'aria-pressed': on ? 'true' : 'false', title: s.label, 'data-key': `toggle-${s.key}` },
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

  // "Esc = back" and the like: for keyboards only.
  function keyHint(text) {
    return touch() ? null : h('span', { class: 'scr-hint' }, text);
  }

  function page({ cls = '', title, icon, sub, headExtra, corner }, body, foot) {
    // without the hint, the foot needs no room kept free for it
    const hint = foot ? keyHint('Esc = back') : null;
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
        foot ? h('footer', { class: `scr-foot${hint ? '' : ' scr-foot--nohint'}` }, foot, hint) : null
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
  let cloudChip = null;
  let titleAuth = null; // { box, live, key } of the title's sign-in strip

  function showTitle() {
    nightEnded(); // "Quit to title" from the pause menu ends a night too
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

  // December only. The dot means a door is waiting to be opened.
  function adventButton() {
    const ready = readyDoors(getSave(), today()).length > 0;
    const b = button('Advent Calendar', {
      icon: '🍫',
      variant: 'choc',
      key: 'advent',
      aria: ready ? 'Advent Calendar, a door is ready to open' : null,
      onClick: () => {
        play('click');
        showAdvent();
      },
    });
    if (ready) b.appendChild(h('span', { class: 'scr-btn__dot', 'aria-hidden': 'true' }));
    return b;
  }

  // What the title's calendar button depends on, in a word.
  function adventSig() {
    const now = today();
    return isAdventTime(now) ? `open:${readyDoors(getSave(), now).length}` : 'closed';
  }

  function buildTitle() {
    const save = getSave();
    const legend = isUnlocked(save, 'jumper');
    const found = countFound(save);
    const total = jokeTotal();
    const next = nextMilestone(save);
    const hasCloud = !!cloud();
    const adventOn = isAdventTime(today());
    state.adventSig = adventSig();

    const sparkles = h(
      'div',
      { class: 'scr-logo-sparkles', 'aria-hidden': 'true' },
      ['✦', '✧', '❄', '✦', '★', '❄'].map((c, i) => h('i', { style: { '--i': String(i) } }, c))
    );

    const menu = h(
      'nav',
      { class: `scr-menu${hasCloud ? ' scr-menu--cloud' : ''}${adventOn ? ' scr-menu--advent' : ''}`, 'aria-label': 'Main menu' },
      // keys let refresh() put focus back after a cloud merge rebuilds the title
      button('Start Night', {
        icon: '🌙',
        variant: 'red',
        size: 'big',
        autofocus: true,
        key: 'start',
        onClick: () => {
          play('click');
          startNight();
        },
      }),
      button("Santa's Workshop", {
        icon: '🛠️',
        variant: 'green',
        key: 'shop',
        onClick: () => {
          play('click');
          openShop('title');
        },
      }),
      adventOn ? adventButton() : null,
      button('Joke Gallery', {
        icon: '📖',
        variant: 'gold',
        key: 'gallery',
        onClick: () => {
          play('click');
          openGallery('title');
        },
      }),
      hasCloud
        ? button('Leaderboard', {
            icon: '🏆',
            variant: 'blue',
            key: 'leaderboard',
            onClick: () => {
              play('click');
              openLeaderboard('title');
            },
          })
        : null,
      button('How to Play', {
        icon: '❓',
        variant: 'snow',
        key: 'help',
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
        : h('div', { class: 'scr-ticket__next' }, h('b', null, '🏆 Every reward unlocked! You are a true Present Legend!')),
      huntComplete(save) ? h('p', { class: 'scr-ticket__done' }, "Pip's hunt is complete! Every joke found and every upgrade bought.") : null
    );

    resetArea = h('div', { class: 'scr-reset' });
    renderResetArea();

    // Tapping the chip opens the leaderboard at its "Play on any device" card.
    cloudChip = hasCloud
      ? h('button', {
          type: 'button',
          class: 'scr-cloudchip',
          'data-key': 'cloudchip',
          onclick: () => {
            play('click');
            openLeaderboard('title', { focus: 'account' });
          },
        })
      : null;
    renderCloudChip();

    // Google sign-in is the main login, so guests see it right here.
    titleAuth = hasCloud ? { box: h('div', { class: 'scr-titleauth', tabindex: '-1' }), live: h('p', { class: 'scr-sr', role: 'status' }), key: '' } : null;
    renderTitleAuth();

    return h(
      'div',
      { class: `scr-title${hasCloud ? ' scr-title--cloud' : ''}` },
      h('div', { class: 'scr-title__logo' }, sparkles, logo(), legend ? legendBadge() : null),
      h(
        'div',
        { class: 'scr-title__row' },
        h('div', { class: 'scr-title__art', html: sceneHTML(save) }),
        menu
      ),
      settingsToggles(),
      ticket,
      hasCloud ? h('div', { class: 'scr-cloudbar' }, cloudChip, titleAuth.box, titleAuth.live) : null,
      resetArea
    );
  }

  // Updates the chip's words in place: the button itself stays, so it keeps focus.
  // Status updates that change nothing visible leave it alone (the dot's pulse
  // would restart on every one).
  function renderCloudChip() {
    if (!cloudChip) return;
    const info = cloudInfo(cloudStatus());
    const shown = cloudChip.querySelector('.scr-cloudchip__text');
    if (shown && shown.textContent === info.text && cloudChip.getAttribute('data-tone') === info.tone) return;
    cloudChip.setAttribute('data-tone', info.tone);
    cloudChip.replaceChildren(
      h('span', { class: 'scr-sr' }, 'Cloud save: '),
      h('span', { class: 'scr-clouddot', 'aria-hidden': 'true' }),
      h('span', { class: 'scr-cloudchip__text' }, info.text)
    );
  }

  // The title's sign-in strip: a big "Sign in with Google" for guests, or who
  // is signed in. Status updates patch it in place, and only when what it
  // shows changes, so a focused button stays put.
  function renderTitleAuth() {
    if (!titleAuth) return;
    const sig = sigNow();
    const op = state.auth.op;
    const note = authNote();
    const ready = cloudReady();
    const offline = cloudStatus().state === 'offline';
    const busyOp = op && (op.kind === 'signout' || op.kind === 'delete' || (op.kind === 'reauth' && !op.slow)) ? op : null;
    const view = busyOp
      ? 'busy'
      : sig === 'checking'
        ? 'checking'
        : sig.startsWith('pending:')
          ? 'pending'
          : sig !== 'guest'
            ? 'google'
            : IN_APP
              ? 'inapp'
              : 'guest';
    if (view !== 'guest' && gateHere('title')) state.gate = null; // signed in elsewhere meanwhile
    const gate = gateHere('title');
    const key = `${sig}|${op ? `${op.kind}:${op.token}:${op.slow}` : ''}|${note ? note.text : ''}|${ready}|${offline}|${gate ? gateSig(gate) : ''}`;
    if (key === titleAuth.key) return;
    titleAuth.key = key;
    const box = titleAuth.box;
    box.setAttribute('data-view', view === 'guest' && gate ? 'gate' : view);
    let kids = [];
    if (view === 'guest' && gate) {
      kids = [gateForm(gate)];
    } else if (view === 'guest') {
      const linking = op && op.kind === 'link' ? op : null;
      const line = linking
        ? { tone: 'info', text: linking.slow ? 'Still waiting for Google. If the window closed, press Try again.' : 'A Google window should pop up. Finish signing in there.' }
        : note || { tone: '', text: !ready && offline ? 'Sign-in needs the internet. Progress is saved on this device.' : pwaFlag('separateAppStorage') ? HOME_APP_LINE : 'Keep your progress safe and play on any device' };
      kids = [
        googleButton(linking, { key: 'title-link', where: 'title' }),
        h('p', { class: 'scr-titleauth__line', 'data-tone': line.tone || null }, line.text),
      ];
    } else if (view === 'inapp') {
      // Google refuses sign-in in here, so say where it works instead
      kids = [
        h('p', { class: 'scr-titleauth__line' }, h('span', { 'aria-hidden': 'true' }, '🧭 '), IN_APP_TEXT),
        note ? h('p', { class: 'scr-titleauth__line', 'data-tone': note.tone }, note.text) : null,
      ];
    } else if (view === 'google') {
      const who = accountName(cloudStatus());
      kids = [
        h(
          'p',
          { class: 'scr-titleauth__who' },
          h('span', { class: 'scr-titleauth__name' }, who ? ['Signed in as ', h('b', null, who)] : 'Signed in with Google'),
          h('span', { class: 'scr-titleauth__tick', 'aria-hidden': 'true' }, '✓')
        ),
        note ? h('p', { class: 'scr-titleauth__line', 'data-tone': note.tone }, note.text) : null,
      ];
    } else if (view === 'pending') {
      // a delete waiting for Google: the Privacy screen has the button
      kids = [
        h('p', { class: 'scr-titleauth__line' }, 'Almost deleted: Google wants a grown-up to confirm.'),
        button('Finish deleting', {
          icon: '🗑️',
          variant: 'snow',
          size: 'small',
          key: 'finish-delete',
          onClick: () => {
            play('click');
            openPrivacy('title');
          },
        }),
      ];
    } else if (view === 'busy') {
      kids = [h('p', { class: 'scr-titleauth__line', 'data-tone': 'info' }, busyOp.kind === 'signout' ? 'Signing out…' : 'Deleting your saved data…')];
    }
    keepFocus(box, () => box.replaceChildren(...kids.filter(Boolean)), () => box.querySelector('button') || (view === 'checking' ? cloudChip : box));
    if (view === 'checking') whenCheckingEnds(renderTitleAuth);
  }

  // Redraws an account view once 'checking' has timed out (see sigNow).
  function whenCheckingEnds(fn) {
    later(fn, Math.max(0, createdAt + CLOUD_TIMEOUT_MS - Date.now()) + 20);
  }

  // "Sign in with Google", shared by the title strip and the leaderboard's
  // account card. `linking` is the running sign-in, if any: while the popup
  // is open the button waits, and after CLOUD_TIMEOUT_MS it offers a retry.
  // Until the cloud is ready it waits too ("One moment…"): a tap before then
  // couldn't open Google's window in Safari. `where` is the screen it is on.
  function googleButton(linking, { key, where } = {}) {
    const busy = !!linking && !linking.slow;
    const waiting = !busy && !cloudReady();
    const label = busy ? 'Waiting for Google…' : waiting ? 'One moment…' : linking || hasAuthError() ? 'Try again' : 'Sign in with Google';
    const btn = button(label, {
      icon: busy ? '❄' : 'G',
      variant: 'snow',
      key,
      cls: `scr-gbtn${busy ? ' is-busy' : ''}${waiting ? ' is-waiting' : ''}`,
      onClick: () => signInTapped(where),
    });
    if (busy || waiting) btn.setAttribute('aria-disabled', 'true');
    return btn;
  }

  function hasAuthError() {
    const n = authNote();
    return !!n && n.tone === 'error';
  }

  function legendBadge() {
    return h(
      'div',
      { class: 'scr-legend', title: 'Unlocked by opening 200 presents!' },
      h('span', { class: 'scr-legend__rosette', 'aria-hidden': 'true' }, '🏆'),
      h('span', { class: 'scr-legend__text' }, 'Present Legend')
    );
  }

  // "Reset progress", "Privacy", "Feedback" and the install link share one
  // line, so the title is no taller than before. Privacy is always there: its
  // note covers this device's save too.
  function renderResetArea() {
    if (!resetArea) return;
    resetArea.setAttribute('data-install', installKind());
    if (state.homeHelp) {
      renderHomeHelp();
      return;
    }
    if (!state.confirmReset) {
      resetArea.replaceChildren(
        h(
          'div',
          { class: 'scr-reset__links' },
          h(
            'button',
            {
              type: 'button',
              class: 'scr-link',
              'data-key': 'reset',
              onclick: () => {
                play('click');
                state.confirmReset = true;
                // one question at a time on the title
                if (gateHere('title')) {
                  state.gate = null;
                  renderTitleAuth();
                }
                renderResetArea();
              },
            },
            '🧹 Reset progress'
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'scr-link',
              'data-key': 'privacy',
              onclick: () => {
                play('click');
                openPrivacy('title');
              },
            },
            h('span', { 'aria-hidden': 'true' }, '🔒'),
            ' Privacy'
          ),
          feedbackLink('title', 'scr-link'),
          installLink()
        )
      );
      return;
    }
    const no = button('Oops, no!', {
      variant: 'green',
      size: 'small',
      key: 'reset-no',
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
      key: 'reset-yes',
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

  // ---- install as an app (src/core/pwa.js) ----

  // 'install' when Chrome / Edge offered to install, 'home' on iPhone / iPad
  // Safari (no install prompt there, so the steps instead), '' otherwise,
  // including when the game already runs as an installed app.
  function installKind() {
    if (pwaFlag('canInstall')) return 'install';
    if (pwaFlag('canAddToHomeScreen')) return 'home';
    return '';
  }

  // A quiet link on the title's bottom line, never a pop-up.
  function installLink() {
    const kind = installKind();
    if (!kind) return null;
    return h(
      'button',
      {
        type: 'button',
        class: 'scr-link',
        'data-key': 'install',
        onclick: () => {
          play('click');
          if (kind === 'install') {
            startInstall();
            return;
          }
          state.confirmReset = false;
          // one question at a time on the title
          if (gateHere('title')) {
            state.gate = null;
            renderTitleAuth();
          }
          state.homeHelp = true;
          renderResetArea();
        },
      },
      h('span', { 'aria-hidden': 'true' }, '📲'),
      kind === 'install' ? ' Install' : ' Add to Home Screen'
    );
  }

  // Opens the browser's own install dialog. The offer is used up either way,
  // so pwaChanged() takes the link away meanwhile.
  function startInstall() {
    const p = pwa();
    if (!p || typeof p.promptInstall !== 'function') return;
    let result;
    try {
      result = p.promptInstall();
    } catch (err) {
      console.warn('[screens] install prompt failed', err);
      return;
    }
    Promise.resolve(result)
      .then((outcome) => {
        if (outcome === 'accepted') play('unlock');
      })
      .catch(() => {});
  }

  // The steps for iPhone / iPad Safari, in place of the links (like the reset
  // question). Safari tabs and the Home Screen app keep separate saves, so it
  // says how to bring progress across.
  function renderHomeHelp() {
    const titleId = 'scr-homehelp-title';
    const ok = button('Got it!', {
      icon: '👍',
      variant: 'green',
      size: 'small',
      key: 'home-ok',
      onClick: () => {
        play('click');
        closeHomeHelp();
      },
    });
    const share = h('span', { class: 'scr-homehelp__share', 'aria-hidden': 'true', html: SHARE_ICON_SVG });
    const saveNote = cloud()
      ? 'Good to know: the Home Screen app keeps its own save, apart from Safari, so a guest starts fresh there. To bring this progress across, a grown-up can sign in with Google here and again in the app.'
      : 'The Home Screen app keeps its own save, apart from Safari, so Pip starts a fresh adventure there.';
    resetArea.replaceChildren(
      h(
        'div',
        { class: 'scr-confirm scr-homehelp', role: 'group', 'aria-labelledby': titleId },
        h('p', null, h('b', { id: titleId }, 'Put Pip on your Home Screen')),
        h(
          'ol',
          { class: 'scr-homehelp__steps' },
          // Apple's wording (iOS 26 / 27): on iPhone, Share sits behind ••• in
          // the default compact tab bar; on iPad it is at the top right
          isIPad()
            ? h('li', null, 'Tap ', h('b', null, 'Share'), ' ', share, ' at the top right.')
            : h('li', null, 'Tap ', h('b', null, 'Share'), ' ', share, ". Don't see it? Tap ", h('b', null, '•••'), ' next to the address bar, then ', h('b', null, 'Share'), '.'),
          h('li', null, 'Scroll down and tap ', h('b', null, 'Add to Home Screen'), '. Not there? Tap ', h('b', null, 'Edit Actions'), ' at the bottom to add it.'),
          h('li', null, 'Leave ', h('b', null, 'Open as Web App'), ' on and tap ', h('b', null, 'Add'), '. Pip opens full screen and plays offline too!')
        ),
        h('p', { class: 'scr-homehelp__note' }, saveNote),
        h('div', { class: 'scr-confirm__btns' }, ok)
      )
    );
    focusEl(ok);
    // on short windows the card lands below the fold
    const card = resetArea.firstElementChild;
    if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function closeHomeHelp() {
    state.homeHelp = false;
    renderResetArea();
    focusEl(resetArea && (resetArea.querySelector('[data-key="install"]') || resetArea.querySelector('[data-key="privacy"]')));
  }

  // ---- notices over the menus: "new version" and "works offline" ----

  function noticeAllowed() {
    if (!NOTICE_SCREENS.has(state.current)) return false;
    // the gallery peeked at from the pause menu still belongs to the night
    return !(state.current === 'gallery' && state.galleryBack === 'pause');
  }

  // The update prompt (until "Not now") or the one-time offline note, on the
  // menus in NOTICE_SCREENS only. Patched in place, so focus stays put.
  function renderNotice() {
    const allowed = state.current !== null && noticeAllowed();
    let kind = '';
    if (allowed && pwaFlag('updateReady') && !state.noticeLater) {
      kind = 'update';
      state.offlineNoted = true; // old news next to a new version
    } else if (allowed && pwaFlag('offlineReady') && !state.offlineNoted) {
      state.offlineNoted = true;
      state.offlineNoteUntil = Date.now() + OFFLINE_NOTE_MS;
      setTimeout(renderNotice, OFFLINE_NOTE_MS + 50);
      kind = 'offline';
    } else if (allowed && Date.now() < state.offlineNoteUntil) {
      kind = 'offline';
    }
    const key = `${kind}|${state.refreshing ? 1 : 0}`;
    if (notice.getAttribute('data-key') === key) return;
    notice.setAttribute('data-key', key);
    notice.setAttribute('data-kind', kind);
    notice.classList.toggle('hidden', !kind);
    if (kind === 'update') {
      const refresh = button(state.refreshing ? 'Refreshing…' : 'Refresh', {
        icon: state.refreshing ? '❄' : '🔄',
        variant: 'gold',
        size: 'small',
        key: 'pwa-refresh',
        cls: state.refreshing ? 'is-busy' : '',
        onClick: () => applyUpdate(),
      });
      if (state.refreshing) refresh.setAttribute('aria-disabled', 'true');
      const later = h(
        'button',
        {
          type: 'button',
          class: 'scr-notice__close',
          'aria-label': 'Not now',
          title: 'Not now',
          'data-key': 'pwa-later',
          onclick: () => {
            play('click');
            state.noticeLater = true;
            renderNotice();
            focusEl(stage.querySelector('[data-autofocus]'));
          },
        },
        '✕'
      );
      if (state.refreshing) later.setAttribute('aria-disabled', 'true');
      keepFocus(notice, () =>
        notice.replaceChildren(
          h('span', { class: 'scr-notice__icon', 'aria-hidden': 'true' }, '✨'),
          h('span', { class: 'scr-notice__text' }, "A new version of Pip's hunt is ready", h('span', { class: 'scr-notice__dash' }, ' —')),
          refresh,
          later
        )
      );
    } else if (kind === 'offline') {
      notice.replaceChildren(
        h('span', { class: 'scr-notice__icon', 'aria-hidden': 'true' }, '🌟'),
        h('span', { class: 'scr-notice__text' }, "Pip's hunt is ready to play offline too!")
      );
    } else {
      notice.replaceChildren();
    }
  }

  // "Refresh": the new version takes over and the page reloads. Menus only,
  // so the save is already written.
  function applyUpdate() {
    if (state.refreshing) return;
    play('click');
    state.refreshing = true;
    renderNotice();
    try {
      pwa()?.applyUpdate?.();
    } catch (err) {
      console.error('[screens] applyUpdate failed', err);
    }
  }

  // ---------------------------------------------------------------------------
  // RESULTS
  // ---------------------------------------------------------------------------

  function showResults(summary) {
    state.lastSummary = normaliseSummary(summary);
    // Counted now, before the night's sync merges in another device's finds,
    // so a redraw can't move tonight's Gallery banner.
    state.lastSummary.foundAtEnd = countFound(getSave());
    // the night is over: from now on the summary says what was new tonight
    state.nightFoundStart = null;
    state.nightOn = true; // results always follow a night, however it began
    nightEnded();
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
      candyEarned: num(src.candyEarned),
      newBaubles: Array.isArray(src.newBaubles) ? src.newBaubles.filter((b) => b && b.name) : [],
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

  function nextBox(icon, label, name, fraction, count) {
    return h(
      'div',
      { class: 'scr-nextbox' },
      h('span', { class: 'scr-nextbox__icon', 'aria-hidden': 'true' }, icon),
      h(
        'div',
        { class: 'scr-nextbox__text' },
        h('span', null, label, h('b', null, name)),
        progressBar(fraction),
        h('small', null, count)
      )
    );
  }

  function buildResults(s, instant) {
    const save = getSave();
    const hasCloud = !!cloud();
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
      ),
      // candy too, so the tiles match the HUD's four counters
      tile(
        h('span', { class: 'scr-sweet scr-sweet--big' }),
        'candy collected',
        s.candyEarned,
        'scr-tile--lilac',
        signed,
        h('span', { class: 'scr-tile__extra' }, 'You have ', sweet(), ` ${fmt(save.candy)}`)
      )
    );

    const sections = [];

    const news = galleryNews(s.foundAtEnd ?? countFound(save), s.newJokes.length, jokeTotal());
    if (news) {
      sections.push(
        h(
          'div',
          { class: `scr-jokenews${news.full ? ' scr-jokenews--full' : ''}` },
          h('span', { 'aria-hidden': 'true' }, news.full ? '🌈 ' : '📖 '),
          news.text
        )
      );
    }

    if (record) {
      sections.push(h('div', { class: 'scr-record' }, h('span', { 'aria-hidden': 'true' }, '⭐'), ' Your best night yet! ', h('span', { 'aria-hidden': 'true' }, '⭐')));
    }

    // Baubles from tonight (candy has its tile)
    if (s.newBaubles.length) {
      const baubles = s.newBaubles.length;
      sections.push(
        h(
          'div',
          { class: 'scr-treats' },
          h('span', null, h('span', { 'aria-hidden': 'true' }, '🎄 '), baubles === 1 ? `New bauble: ${s.newBaubles[0].name}` : `${baubles} new baubles for your tree`)
        )
      );
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

    // What to chase next. Rewards can run out first, so the Notes box stands alone.
    const next = nextMilestone(save);
    const notes = notesGoal(save.foundJokes);
    if (next || notes) {
      sections.push(
        h(
          'div',
          { class: 'scr-nextboxes' },
          next ? nextBox(next.icon, 'Next reward: ', next.name, save.totalPresents / Math.max(1, next.count), `${fmt(save.totalPresents)} / ${fmt(next.count)} presents`) : null,
          notes ? nextBox('🌈', 'Next goal: ', "Santa's Secret Notes", notes.have / notes.total, `${fmt(notes.have)} / ${fmt(notes.total)} found`) : null
        )
      );
    }

    // a quiet link at the end of the page, so the footer keeps its buttons
    const feedback = feedbackLink('results', 'scr-textlink');
    if (feedback) sections.push(h('p', { class: 'scr-fbline' }, feedback));

    const confetti = s.newUnlocks.length || record || news?.full ? (instant ? null : confettiLayer()) : null;

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
      hasCloud
        ? button('Leaderboard', {
            icon: '🏆',
            variant: 'blue',
            onClick: () => {
              play('click');
              openLeaderboard('results');
            },
          })
        : null,
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
        // a fourth footer button: see .scr-results--cloud in screens.css
        cls: `scr-results${hasCloud ? ' scr-results--cloud' : ''}`,
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
    state.treePick = { slot: null, bauble: null };
    open('shop', buildShop);
    renderShopPanel();
  }

  function buildShop() {
    const save = getSave();
    const purseNum = h('b', { class: 'scr-purse__num' }, fmt(save.coins));
    const purseIcon = h('span', { class: 'scr-coin scr-coin--big', 'aria-hidden': 'true' });
    const purseWord = h('span', { class: 'scr-sr' }, ' coins');
    const purse = h('div', { class: 'scr-purse', title: 'Your coins' }, purseIcon, purseNum, purseWord);

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
        state.treePick = { slot: null, bauble: null };
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
      state.treePick = { slot: null, bauble: null };
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
    state.shop = { panel, purseNum, purseIcon, purseWord, purse, tabs };
    return book;
  }

  function renderShopPanel() {
    const refs = state.shop;
    if (!refs) return;
    const save = getSave();
    // the Pets tab spends candy, so the purse shows candy there
    const candy = state.shopTab === 'pets';
    refs.purseNum.textContent = fmt(candy ? save.candy : save.coins);
    refs.purseIcon.className = candy ? 'scr-sweet scr-sweet--big' : 'scr-coin scr-coin--big';
    refs.purseWord.textContent = candy ? ' candy' : ' coins';
    refs.purse.title = candy ? 'Your candy' : 'Your coins';
    for (const b of refs.tabs.querySelectorAll('.scr-tab')) {
      b.setAttribute('aria-selected', b.dataset.tab === state.shopTab ? 'true' : 'false');
      b.tabIndex = b.dataset.tab === state.shopTab ? 0 : -1;
    }
    let content;
    if (state.shopTab === 'rewards') content = rewardsPanel(save);
    else if (state.shopTab === 'pets') content = petsPanel(save);
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
      ? h('p', { class: 'scr-hintline' }, maxedHint(save.coinsEarned))
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

  function petsPanel(save) {
    const cheapest = PETS.reduce((m, p) => {
      const c = petCost(save, p);
      return c === null ? m : Math.min(m, c);
    }, Infinity);
    return h(
      'div',
      null,
      h(
        'p',
        { class: 'scr-hintline' },
        Number.isFinite(cheapest) && save.candy < cheapest ? 'Crack candy canes at night to earn candy for your pets. ' : null,
        'One pet can come along each night, as well as your Snow Puppy.'
      ),
      h(
        'div',
        { class: 'scr-upgrades scr-pets' },
        PETS.map((p, i) => petCard(p, save, i))
      ),
      h('p', { class: 'scr-petnote' }, h('span', { 'aria-hidden': 'true' }, '🐾 '), PET_NOTE)
    );
  }

  // Candy for this pet's next step: its price, then its feeds. Null when there's
  // nothing to pay for (level 5, or a Snow Puppy nobody has met yet).
  function petCost(save, p) {
    return petLevel(save, p.id) > 0 ? feedCost(save, p.id) : p.price;
  }

  // What feeding leads to, for the card. The Penguin Chick's bonus only goes up
  // every other level, so this looks ahead to the next level that changes it.
  function petNextLine(p, lvl) {
    const now = perkText(p.id, lvl);
    let at = lvl + 1;
    while (at < MAX_PET_LEVEL && perkText(p.id, at) === now) at++;
    const text = perkText(p.id, at);
    return [h('b', null, at === lvl + 1 ? 'Next: ' : `Level ${at}: `), at === MAX_PET_LEVEL ? `${text}, plus a little gold bow` : text];
  }

  function petCard(p, save, i) {
    const lvl = petLevel(save, p.id);
    const owned = lvl > 0;
    const cost = petCost(save, p);
    const maxed = owned && cost === null;
    const poor = cost !== null && save.candy < cost;
    const action = owned ? 'Feed' : 'Buy';

    const pips = h(
      'div',
      { class: 'scr-lvl', role: 'img', 'aria-label': owned ? `Friendship level ${lvl} of ${MAX_PET_LEVEL}` : 'Not one of your pets yet' },
      Array.from({ length: MAX_PET_LEVEL }, (_, k) => h('i', { class: k < lvl ? 'is-on' : '' })),
      h('span', { class: 'scr-lvl__text', 'aria-hidden': 'true' }, !owned ? 'New' : maxed ? 'MAX' : `Lv ${lvl}/${MAX_PET_LEVEL}`)
    );

    const card = h(
      'article',
      {
        class: `scr-upg scr-pet scr-tint--${CARD_TINTS[i % CARD_TINTS.length]}${maxed ? ' is-max' : ''}${poor ? ' is-poor' : ''}`,
        'data-id': p.id,
        tabindex: '-1',
        style: { '--tilt': `${i % 2 ? 0.8 : -0.8}deg`, '--i': String(i) },
      },
      h('span', { class: 'scr-upg__tape', 'aria-hidden': 'true' }),
      h('div', { class: 'scr-upg__orn', 'aria-hidden': 'true' }, h('span', null, p.icon)),
      h('h3', { class: 'scr-upg__name' }, p.name),
      h('p', { class: 'scr-upg__blurb' }, p.blurb),
      pips,
      owned ? h('p', { class: 'scr-upg__now' }, '✔ ', perkText(p.id, lvl)) : null,
      maxed
        ? h('p', { class: 'scr-upg__next' }, 'It wears a little gold bow.')
        : h('p', { class: 'scr-upg__next' }, owned ? petNextLine(p, lvl) : [h('b', null, 'Its trick: '), perkText(p.id, 1)])
    );

    if (maxed) {
      card.appendChild(h('div', { class: 'scr-upg__stamp' }, 'BEST FRIENDS!'));
    } else if (cost !== null) {
      const buy = h(
        'button',
        {
          type: 'button',
          class: `scr-buy${poor ? ' is-poor' : ''}`,
          'data-key': `pet-${p.id}`,
          'aria-disabled': poor ? 'true' : 'false',
          'aria-label': poor ? `${p.name}: costs ${cost} candy, you need ${cost - save.candy} more` : `${action} ${p.name} for ${cost} candy`,
        },
        h('span', { class: 'scr-buy__label' }, poor ? 'Need' : action),
        sweet(),
        h('b', null, fmt(cost)),
        poor ? h('small', { class: 'scr-buy__more' }, `${fmt(cost - save.candy)} more`) : null
      );
      buy.addEventListener('click', () => onPetTreat(p, card));
      card.appendChild(buy);
    } else {
      // the Snow Puppy can't be bought: it finds you
      card.appendChild(h('p', { class: 'scr-pet__how' }, puppyFindText(save)));
    }

    if (owned && p.id === 'puppy') card.appendChild(h('p', { class: 'scr-pet__how' }, puppyComesText(save)));
    if (owned && p.price !== null) card.appendChild(petGoButton(p, save));
    return card;
  }

  // For a puppy that hasn't joined yet. The 25-present reward may already be
  // won: it joins on the next night, unless its Wardrobe switch is off.
  function puppyFindText(save) {
    if (isActive(save, 'puppy')) return 'It joins you on your next night.';
    if (isUnlocked(save, 'puppy')) return puppyComesText(save);
    return `Find it in a present, or open ${fmt(getMilestone('puppy')?.count ?? 25)} presents.`;
  }

  function puppyComesText(save) {
    if (isActive(save, 'puppy')) return 'It comes along every night.';
    if (isUnlocked(save, 'puppy')) return 'Switch it on in the Wardrobe to bring it along.';
    return `It comes along when it pops out of a present. Open ${fmt(getMilestone('puppy')?.count ?? 25)} presents and it comes every night.`;
  }

  // On or off, one pet at a time: choosing another swaps them.
  function petGoButton(p, save) {
    const going = activePetId(save) === p.id;
    const go = h(
      'button',
      { type: 'button', class: 'scr-wtoggle scr-pet__go', 'aria-pressed': going ? 'true' : 'false', 'data-key': `go-${p.id}`, 'aria-label': `Bring ${p.name} along` },
      h('b', null, 'Bring along'),
      h('span', { class: 'scr-toggle__sw', 'aria-hidden': 'true' }, h('i'))
    );
    go.addEventListener('click', () => {
      const sv = getSave();
      const on = activePetId(sv) !== p.id;
      setActivePet(sv, on ? p.id : null);
      persist();
      play(on ? PET_CRIES[p.id] : 'click');
      rerenderPets(p.id);
    });
    return go;
  }

  // Redraws the Pets tab with focus still on the same control. Hands back the
  // fresh card, for its little celebration.
  function rerenderPets(id) {
    const refs = state.shop;
    if (!refs) return null;
    keepFocus(refs.panel, renderShopPanel, () => refs.panel.querySelector(`[data-id="${id}"]`));
    return Array.from(refs.panel.querySelectorAll('.scr-pet')).find((c) => c.dataset.id === id) || null;
  }

  // The card's one big button: buy a new pet, or feed one you have.
  function onPetTreat(p, card) {
    const now = performance.now();
    if (state.petTap.id === p.id && now - state.petTap.at < 350) return;
    state.petTap = { id: p.id, at: now };
    const save = getSave();
    const owned = petLevel(save, p.id) > 0;
    if (owned ? feedPet(save, p.id) : buyPet(save, p.id)) {
      // a first pet of your own comes along without being asked
      if (!owned && !activePetId(save)) setActivePet(save, p.id);
      persist();
      play('buy');
      later(() => play(PET_CRIES[p.id]), 320);
      const fresh = rerenderPets(p.id);
      if (fresh) {
        restartAnim(fresh, 'is-bought');
        burst(fresh, 14);
      }
      if (state.shop) restartAnim(state.shop.purse, 'is-bump');
    } else {
      play('error');
      restartAnim(card, 'is-shake');
      if (state.shop) restartAnim(state.shop.purse, 'is-shake');
    }
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

    const tree = treeSection(save);
    const jump = button(`Your Christmas Tree: ${foundCount(save)} / ${BAUBLES.length} found`, {
      icon: '🎄',
      variant: 'snow',
      size: 'small',
      cls: 'scr-xtree__jump',
      onClick: () => {
        play('click');
        tree.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
        focusEl(tree);
      },
    });

    return h(
      'div',
      null,
      jump,
      h(
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
      ),
      tree
    );
  }

  // ---- Your Christmas Tree: 12 spots and every bauble design ----

  // Tap a spot then a bauble, or a bauble then a spot, and a bauble on the tree
  // comes off with a tap. Everything is a real button, so a mouse, a finger and
  // the keyboard all do the same thing; `say` tells screen readers each step.
  function treeSection(save) {
    const titleId = 'scr-xtree-title';
    const counter = h('span', { class: 'scr-chipcount' });
    const art = h('div', { html: TREE_SVG }).firstElementChild;
    const say = h('p', { class: 'scr-xtree__say', role: 'status' });
    const spots = h('div', { class: 'scr-xtree__tree', role: 'group', 'aria-label': 'Spots on your tree' });
    const shelf = h('div', { class: 'scr-xtree__shelf', role: 'group', 'aria-label': 'Your baubles' });
    const side = h('div', { class: 'scr-xtree__side' }, say, shelf);
    const box = h('div', { class: 'scr-xtree__play' }, spots, side);
    const section = h(
      'section',
      { class: 'scr-section scr-xtree', 'aria-labelledby': titleId, tabindex: '-1' },
      h('h3', { class: 'scr-section__title', id: titleId }, h('span', { 'aria-hidden': 'true' }, '🎄 '), 'Your Christmas Tree ', counter),
      h('p', { class: 'scr-xtree__blurb' }, 'Shake trees at night to find baubles. Your tree stands in the village square, wearing everything you hang here.'),
      box
    );

    const render = () => {
      const sv = getSave();
      const pick = state.treePick;
      // a cloud merge or a reset can take the picked bauble away
      if (pick.bauble && !sv.foundBaubles.includes(pick.bauble)) pick.bauble = null;
      counter.textContent = `${foundCount(sv)} / ${BAUBLES.length} found`;
      spots.replaceChildren(art, ...treeSpotButtons(sv));
      shelf.replaceChildren(...BAUBLES.map((b) => shelfTile(b, sv)));
    };
    const redraw = () => keepFocus(box, render, () => spots.querySelector('.scr-xtree__spot'));
    const tell = (text) => {
      say.textContent = text;
    };
    // On a phone the tree and the shelf don't fit on one screen, so each tap
    // brings up the half that comes next.
    const reveal = (node) => node.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });

    function treeSpotButtons(sv) {
      const places = treeSpotPlaces();
      const pick = state.treePick;
      const picked = pick.bauble && getBauble(pick.bauble);
      return treeSpots(sv).map(({ slot, bauble }, i) => {
        const n = i + 1;
        const chosen = pick.slot === slot;
        let label = bauble ? `Spot ${n}, ${bauble.name}. Take it off` : `Spot ${n}, empty. Choose this spot`;
        if (picked) label = `Hang ${picked.name} on spot ${n}${bauble ? `, in place of ${bauble.name}` : ''}`;
        const b = h(
          'button',
          {
            type: 'button',
            class: `scr-xtree__spot${bauble ? ' has-bauble' : ''}`,
            style: places[i],
            'data-key': `spot-${slot}`,
            'aria-label': label,
            'aria-pressed': chosen ? 'true' : 'false',
            title: bauble ? bauble.name : null,
          },
          bauble ? baubleEl(bauble) : null
        );
        b.addEventListener('click', () => tapSpot(slot));
        return b;
      });
    }

    function shelfTile(b, sv) {
      if (!sv.foundBaubles.includes(b.id)) {
        // the counter says how many are left; a "?" has nothing to press or read
        return h('span', { class: `scr-xtree__tile is-unknown scr-xtree__tile--${b.rarity}`, 'aria-hidden': 'true' }, '?');
      }
      const pick = state.treePick;
      const hung = slotOf(sv, b.id);
      const tile = h(
        'button',
        {
          type: 'button',
          class: `scr-xtree__tile scr-xtree__tile--${b.rarity}${hung ? ' is-hung' : ''}`,
          'data-key': `bauble-${b.id}`,
          'aria-pressed': pick.bauble === b.id ? 'true' : 'false',
          'aria-label': `${b.name}, ${RARITY_LABEL[b.rarity].toLowerCase()}${hung ? ', on your tree' : ''}`,
          title: b.name,
        },
        baubleEl(b),
        hung ? h('span', { class: 'scr-xtree__tick', 'aria-hidden': 'true' }, '✓') : null
      );
      tile.addEventListener('click', () => tapBauble(b.id));
      return tile;
    }

    function hang(slot, id) {
      const sv = getSave();
      const b = getBauble(id);
      state.treePick = { slot: null, bauble: null };
      if (placeBauble(sv, slot, id)) {
        persist();
        settingsChanged(); // the village tree behind the menu wears it at once
        play('pop');
        tell(`${b.name} is on your tree!`);
      } else {
        play('click');
        tell(`${b.name} is already there.`);
      }
      redraw();
      reveal(spots);
    }

    function tapSpot(slot) {
      const sv = getSave();
      const pick = state.treePick;
      const on = treeSpots(sv).find((s) => s.slot === slot)?.bauble || null;
      const n = TREE_SLOTS.indexOf(slot) + 1;
      if (pick.bauble) {
        hang(slot, pick.bauble);
        return;
      }
      if (on) {
        removeBauble(sv, slot);
        persist();
        settingsChanged();
        play('click');
        tell(`${on.name} is back on the shelf.`);
      } else if (pick.slot === slot) {
        pick.slot = null;
        play('click');
        tell('Pick a spot on the tree, then a bauble.');
      } else {
        pick.slot = slot;
        play('click');
        tell(sv.foundBaubles.length ? `Spot ${n}. Now pick a bauble for it.` : `Spot ${n}. Find a bauble first!`);
      }
      redraw();
      if (state.treePick.slot) reveal(side);
    }

    function tapBauble(id) {
      const pick = state.treePick;
      const b = getBauble(id);
      if (pick.slot) {
        hang(pick.slot, id);
        return;
      }
      pick.bauble = pick.bauble === id ? null : id;
      play('click');
      tell(pick.bauble ? `${b.name}. Now pick a spot on the tree.` : 'Pick a spot on the tree, then a bauble.');
      redraw();
      if (pick.bauble) reveal(spots);
    }

    render();
    tell(treeHelloText(save));
    return section;
  }

  function treeHelloText(save) {
    const found = foundCount(save);
    if (!found) return 'No baubles yet. Shake pine trees and lollipop trees to find some!';
    // only door 24 gives the last one, so say where it hides (in December: the
    // rest of the year there's no sign of the calendar)
    if (found === BAUBLES.length - 1 && !save.foundBaubles.includes(GOLDEN_STAR_ID)) {
      return isAdventTime(today()) ? 'One left! The Golden Star hides behind door 24 of the Advent Calendar.' : 'One left! The Golden Star is waiting for Christmas.';
    }
    return 'Pick a spot on the tree, then a bauble.';
  }

  // ---------------------------------------------------------------------------
  // ADVENT CALENDAR (December only)
  // ---------------------------------------------------------------------------

  function showAdvent() {
    if (!isAdventTime(today())) {
      showTitle();
      return;
    }
    open('advent', buildAdvent);
    // today's door may start below the fold on a small phone
    stage.querySelector('.scr-door[data-autofocus]')?.scrollIntoView({ block: 'nearest' });
  }

  function buildAdvent() {
    const save = getSave();
    const now = today();
    const say = h('div', { class: 'scr-advent__say', role: 'status' });
    const count = h('b', { class: 'scr-purse__num' });
    const doors = new Map();
    const first = readyDoors(save, now)[0] ?? null;

    const grid = h(
      'div',
      { class: 'scr-advent__doors', role: 'group', 'aria-label': 'Calendar doors' },
      DOOR_LAYOUT.map((day) => {
        const door = h('button', { type: 'button', 'data-key': `door-${day}`, 'data-autofocus': day === first ? true : null, 'data-tone': String(day % 4) });
        door.addEventListener('click', () => tapDoor(day, door));
        doors.set(day, door);
        return door;
      })
    );

    state.advent = { say, count, doors };
    syncAdvent();
    sayAdventHello();

    const foot = [
      button('Back', {
        icon: '↩',
        variant: 'snow',
        autofocus: first === null,
        onClick: () => {
          play('click');
          leaveAdvent();
        },
      }),
    ];

    return page(
      {
        cls: 'scr-advent',
        title: 'Advent Calendar',
        icon: '🍫',
        headExtra: say,
        corner: h('div', { class: 'scr-purse', title: 'Doors opened' }, h('span', { 'aria-hidden': 'true' }, '🚪'), count, h('span', { class: 'scr-sr' }, ' doors opened')),
      },
      grid,
      foot
    );
  }

  // Brings every door and the counter up to date, leaving what the speech bubble
  // says alone. A door that just opened passes `fresh`, and swings open.
  function syncAdvent(fresh = null) {
    const refs = state.advent;
    if (!refs) return;
    const now = today();
    const save = getSave();
    refs.count.textContent = `${openedDoors(save, now).length} / ${ADVENT_TUNING.doors}`;
    for (const [day, door] of refs.doors) fillDoor(door, day, doorState(save, day, now), day === fresh);
  }

  function fillDoor(door, day, st, fresh) {
    const choc = getChocolate(day);
    const opened = st === 'opened';
    door.className = `scr-door is-${st}${day === ADVENT_TUNING.doors ? ' is-last' : ''}`;
    let label = `Door ${day}, ready to open`;
    if (opened) label = `Door ${day}, ${choc.name}`;
    else if (st === 'locked') label = `Door ${day}, opens on ${day} December`;
    door.setAttribute('aria-label', label);
    door.replaceChildren();
    addKids(door, [
      opened ? h('span', { class: 'scr-door__choc', html: chocolateHTML(choc) }) : null,
      h('span', { class: 'scr-door__num' }, String(day)),
      fresh ? h('span', { class: 'scr-door__flap', 'aria-hidden': 'true', 'data-tone': door.dataset.tone }, String(day)) : null,
    ]);
  }

  // The speech bubble over the doors: `art` is a chocolate's drawing or an icon.
  function sayAdvent(art, title, lines = []) {
    state.advent?.say.replaceChildren(
      typeof art === 'string' ? h('span', { class: 'scr-advent__art', 'aria-hidden': 'true' }, art) : art,
      h('p', { class: 'scr-advent__words' }, title ? h('b', null, title) : null, lines.map((l) => h('span', null, l)))
    );
  }

  function chocolateArt(choc) {
    return h('span', { class: 'scr-advent__art', html: chocolateHTML(choc) });
  }

  function sayAdventHello() {
    const now = today();
    const save = getSave();
    const ready = readyDoors(save, now).length;
    if (openedDoors(save, now).length === ADVENT_TUNING.doors) sayAdvent('🎄', 'Every door is open!', ['Happy Christmas, Pip!']);
    else if (ready) sayAdvent('🐧', ready === 1 ? 'A door is ready!' : `${ready} doors are ready!`, ['Tap a shiny door to see what is inside.']);
    else sayAdvent('🐧', 'All done for today!', ['Come back tomorrow for the next door.']);
  }

  // Every door is a button: a locked one wiggles and says when, a ready one
  // opens, and an opened one shows its chocolate again.
  function tapDoor(day, door) {
    const st = doorState(getSave(), day, today());
    if (st === 'locked') {
      play('click');
      restartAnim(door, 'is-wiggle');
      sayAdvent('🔒', lockedDoorText(day));
      return;
    }
    const choc = getChocolate(day);
    if (st === 'opened') {
      if (performance.now() - state.doorOpenedAt < 800) return;
      play('click');
      restartAnim(door, 'is-boing');
      sayAdvent(chocolateArt(choc), choc.name, choc.note ? [choc.note] : []);
      return;
    }
    // main.js pays, through the same paths as a night's coins and candy
    let got = null;
    try {
      got = deps.onOpenDoor?.(day) ?? null;
    } catch (err) {
      console.error('[screens] onOpenDoor failed', err);
    }
    if (!got) {
      play('error');
      syncAdvent();
      return;
    }
    state.doorOpenedAt = performance.now();
    play('pop');
    syncAdvent(day);
    burst(door, 14);
    sayAdvent(chocolateArt(choc), choc.name, adventRewardLines(got));
    if (got.bauble) {
      play('unlock');
      const party = confettiLayer();
      if (party) stage.querySelector('.scr-advent')?.appendChild(party);
    }
  }

  function adventRewardLines({ chocolate, coins, candy, bauble, baubleIsNew }) {
    const paid = [`+${fmt(coins)} coins`, candy ? `+${fmt(candy)} candy` : null].filter(Boolean).join(' and ');
    const lines = [chocolate.note, paid];
    if (bauble) {
      const name = getBauble(bauble)?.name || 'A new bauble';
      lines.push(baubleIsNew ? `And the ${name} bauble! Hang it on your tree in the Wardrobe.` : `And another ${name} bauble!`);
    }
    return lines.filter(Boolean);
  }

  // The date moves on behind a phone's back: a game left open overnight comes
  // back to a new day. Nothing else redraws these two screens.
  function onDayCheck() {
    if (document.hidden) return;
    if (state.current === 'advent') {
      if (isAdventTime(today())) syncAdvent();
      else showTitle();
    } else if (state.current === 'title' && state.adventSig !== adventSig()) {
      rebuildTitle();
    }
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onDayCheck);

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
      // the Secrets divider teaches where Notes hide, so it comes before the first find too
      if (missing.length && (got.length || f === 'secret')) {
        cards.push(h('p', { class: 'scr-grid__divider' }, hidingText(f, missing.length)));
      }
      const locked = lockedPreview(missing);
      locked.shown.forEach((j, k) => cards.push(lockedCard(j, JOKE_INDEX.get(j.id), got.length + k)));
      if (locked.more) cards.push(h('p', { class: 'scr-grid__more' }, locked.more));
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
  // LEADERBOARD: snow names, cloud saves and Google sign-in (docs/CLOUD.md)
  // ---------------------------------------------------------------------------
  // Everything here waits on the network, so every answer is checked against
  // the screen that asked for it (open() replaces state.lb), no spinner
  // outlives CLOUD_TIMEOUT_MS, and cloud updates patch the open screen in
  // place instead of rebuilding it.

  let lbUid = 0; // unique ids for aria-controls / aria-labelledby

  function showLeaderboard(back) {
    openLeaderboard(back);
  }

  function openLeaderboard(back, { focus = null } = {}) {
    state.leaderboardBack = LEADERBOARD_BACKS.has(back) ? back : 'title';
    if (state.leaderboardBack === 'results' && !state.lastSummary) state.leaderboardBack = 'title';
    if (!cloud()) {
      // no cloud, no leaderboard: land where Back would have gone
      leaveLeaderboard();
      return;
    }
    open('leaderboard', buildLeaderboard);
    loadBoard();
    if (focus === 'account') focusAccountCard();
    else if (focus === 'privacy') focusAccountLink('privacy');
  }

  function currentBoard(lb) {
    return lb.boards.find((b) => b.id === lb.board) || lb.boards[0];
  }

  function selectedTab(lb) {
    const i = lb.boards.findIndex((b) => b.id === lb.board);
    return lb.tabEls[i < 0 ? 0 : i] || null;
  }

  function buildLeaderboard() {
    const boards = cloudBoards();
    if (!boards.some((b) => b.id === state.board)) state.board = boards[0].id;
    const lb = {
      uid: ++lbUid,
      boards,
      board: state.board,
      seq: 0, // bumped by every board load, so older answers are dropped
      pending: 0, // seq of the load still waiting for its answer
      view: 'loading', // 'loading' | 'error' | 'data'
      data: null,
      error: null,
      reload: null, // timer of the debounced quiet reload
      recheck: 1, // extra reloads allowed while the board is behind this device (see recheckBoard)
      picked: null, // the snow name just chosen, until setProfile answers
      confirmSignOut: false,
      sig: '', // sigNow() the account card was drawn for
      ready: null, // cloudReady() the account card was drawn for
      tabEls: [],
    };
    state.lb = lb;

    const panelId = `scr-lb-panel-${lb.uid}`;
    const tabs = h('div', { class: 'scr-tabs', role: 'tablist', 'aria-label': 'Leaderboards' });
    lb.tabEls = boards.map((b, i) => {
      const on = b.id === lb.board;
      const t = h(
        'button',
        {
          type: 'button',
          class: 'scr-tab',
          role: 'tab',
          id: `scr-lb-tab-${lb.uid}-${i}`,
          'data-tone': BOARD_TONES[i % BOARD_TONES.length],
          'aria-controls': panelId,
          'aria-selected': on ? 'true' : 'false',
          tabindex: on ? '0' : '-1',
          'data-autofocus': on || null,
        },
        h('span', { 'aria-hidden': 'true' }, b.icon),
        ` ${b.label}`
      );
      t.addEventListener('click', () => selectBoard(i));
      tabs.appendChild(t);
      return t;
    });
    tabs.addEventListener('keydown', (e) => {
      const n = boards.length;
      const i = Math.max(0, boards.findIndex((b) => b.id === lb.board));
      const to = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      selectBoard(to);
      focusEl(lb.tabEls[to]);
    });

    lb.heading = h('h3', { class: 'scr-lb__heading' });
    lb.panel = h('div', { class: 'scr-lb__board', role: 'tabpanel', id: panelId, 'aria-labelledby': selectedTab(lb).id });
    lb.live = h('p', { class: 'scr-sr', role: 'status' });
    renderBoardHeading();
    renderBoardPanel();

    const body = h(
      'div',
      { class: 'scr-lb' },
      h('div', { class: 'scr-lb__main' }, lb.heading, lb.panel, lb.live),
      h('div', { class: 'scr-lb__side' }, buildNameCard(lb), buildAccountCard(lb))
    );

    const foot = [
      button(state.leaderboardBack === 'results' ? 'Results' : 'Title', {
        icon: '↩',
        variant: 'red',
        onClick: () => {
          play('click');
          leaveLeaderboard();
        },
      }),
    ];

    return page(
      { cls: 'scr-lbbook', title: 'Leaderboard', icon: '🏆', sub: 'Who has found the most Christmas cheer?', headExtra: tabs },
      body,
      foot
    );
  }

  function selectBoard(i) {
    const lb = state.lb;
    const b = lb && lb.boards[i];
    if (!b || b.id === lb.board) return;
    play('click');
    lb.board = b.id;
    state.board = b.id;
    lb.tabEls.forEach((t, k) => {
      t.setAttribute('aria-selected', k === i ? 'true' : 'false');
      t.tabIndex = k === i ? 0 : -1;
    });
    lb.panel.setAttribute('aria-labelledby', lb.tabEls[i].id);
    renderBoardHeading();
    loadBoard();
    scrollBodyTop(lb.panel);
  }

  function renderBoardHeading() {
    const lb = state.lb;
    if (!lb || !lb.heading) return;
    const b = currentBoard(lb);
    lb.heading.replaceChildren(
      ...[
        h('span', { class: 'scr-lb__icon', 'aria-hidden': 'true' }, b.icon),
        h('span', null, b.label),
        BOARD_BLURBS[b.id] ? h('small', null, BOARD_BLURBS[b.id]) : null,
      ].filter(Boolean)
    );
  }

  // Fetches the selected board. `quiet` keeps what is showing (a list, or the
  // error with its focused "Try again") until the answer, and keeps a list if
  // the refresh fails; `force` skips the cache. A late answer still lands if
  // nothing newer was asked, even after the timeout has offered "Try again".
  function loadBoard({ force = false, quiet = false } = {}) {
    const lb = state.lb;
    if (!lb) return;
    const board = lb.board;
    const token = ++lb.seq;
    const key = boardCacheKey();
    const cached = state.boardCache.get(board);
    if (!force && cached && cached.key === key && Date.now() - cached.at < BOARD_CACHE_MS) {
      lb.pending = 0;
      showBoardData(lb, cached.data, true);
      return;
    }
    lb.pending = token;
    if (!quiet || lb.view === 'loading') {
      lb.view = 'loading';
      lb.data = null;
      renderBoardPanel();
    }
    const apply = (res, timedOut) => {
      if (state.lb !== lb || lb.seq !== token) return; // left the screen, or a newer load
      if (timedOut && lb.pending !== token) return; // answered in time
      if (!timedOut) lb.pending = 0;
      const data = normaliseBoard(res);
      if (data.error && !data.entries.length) {
        if (quiet && lb.view === 'data') return;
        lb.view = 'error';
        lb.error = data.error;
        lb.data = null;
        renderBoardPanel();
        return;
      }
      state.boardCache.set(board, { data, at: Date.now(), key });
      showBoardData(lb, data, !quiet);
      recheckBoard(lb, board, data);
    };
    later(() => apply({ error: 'timeout' }, true), CLOUD_TIMEOUT_MS);
    whenDone(cloudCall('getLeaderboard', board, { limit: BOARD_LIMIT }), (res) => apply(res, false));
  }

  function showBoardData(lb, data, animate) {
    lb.view = 'data';
    lb.data = data;
    lb.error = null;
    renderBoardPanel(animate);
  }

  // A cached board is only reused while this device's scores, snow name and
  // account are what they were when it was read (a night just ended, say).
  function boardCacheKey() {
    const save = getSave();
    const p = save.profile || {};
    return [sigNow(), save.bestPresentsInNight, save.totalPresents, countFound(save), p.adj, p.noun, p.num, !!p.hidden].join('|');
  }

  // The board can lag this device for a few seconds: the night's push (or a
  // name change, or "Show me" switched back on) is followed by a board write
  // the cloud may space out. If the player's place shows less than they have,
  // look once more a little later.
  function recheckBoard(lb, board, data) {
    if (lb.recheck <= 0) return;
    const save = getSave();
    const local = localScore(board, save);
    const mine = data.entries.find((e) => e.isMe);
    const shown = mine ? mine.score : data.me ? data.me.score : 0;
    if ((save.profile && save.profile.hidden) || local <= 0 || shown >= local) return;
    lb.recheck--;
    scheduleBoardReload(lb, BOARD_RECHECK_MS);
  }

  function localScore(board, save) {
    const n = { bestNight: save.bestPresentsInNight, totalPresents: save.totalPresents, jokesFound: countFound(save) }[board];
    return Number.isFinite(n) ? n : 0;
  }

  // Coalesces bursts (name taps, sync updates) into one quiet re-read.
  function scheduleBoardReload(lb, ms) {
    if (lb.reload !== null) {
      clearTimeout(lb.reload);
      state.timers.delete(lb.reload);
    }
    lb.reload = later(() => {
      lb.reload = null;
      if (state.lb === lb) loadBoard({ force: true, quiet: true });
    }, ms);
  }

  // `animate` replays the rows' rise-in; a quiet refresh or a name change
  // just swaps the rows.
  function renderBoardPanel(animate = true) {
    const lb = state.lb;
    if (!lb || !lb.panel) return;
    const board = currentBoard(lb);
    const { node, said } = lb.view === 'loading' ? boardLoading(board) : lb.view === 'error' ? boardError(lb) : boardList(lb, board, animate);
    lb.panel.setAttribute('aria-busy', lb.view === 'loading' ? 'true' : 'false');
    keepFocus(lb.panel, () => lb.panel.replaceChildren(node), () => selectedTab(lb));
    if (lb.live.textContent !== said) lb.live.textContent = said;
  }

  function boardLoading(board) {
    return {
      said: 'Loading the leaderboard…',
      node: h(
        'div',
        { class: 'scr-lb__state' },
        h('span', { class: 'scr-lb__flake', 'aria-hidden': 'true' }, '❄'),
        h('p', { class: 'scr-lb__small' }, `Counting everyone's ${board.unit === 'jokes' ? 'jokes' : 'presents'}…`),
        h(
          'ol',
          { class: 'scr-lb__list', 'aria-hidden': 'true' },
          [0, 1, 2].map((k) => h('li', { class: 'scr-lbrow is-ghost', style: { '--i': String(k) } }))
        )
      ),
    };
  }

  function boardError(lb) {
    const offline = cloudStatus().state === 'offline' || looksOffline(lb.error);
    const title = offline
      ? "You're offline right now."
      : lb.error === 'timeout'
        ? 'The cloud is taking a long nap.'
        : 'The leaderboard got stuck in a snowdrift.';
    return {
      said: `${title} Your progress is safe on this device.`,
      node: h(
        'div',
        { class: 'scr-lb__state' },
        h('div', { class: 'scr-lb__pip', 'aria-hidden': 'true', html: pipHTML({ sleepy: true }) }),
        h('p', { class: 'scr-lb__big' }, title),
        h('p', { class: 'scr-lb__small' }, 'Your progress is safe on this device.'),
        button('Try again', {
          icon: '🔄',
          variant: 'green',
          size: 'small',
          key: 'retry',
          onClick: () => {
            play('click');
            loadBoard({ force: true });
          },
        })
      ),
    };
  }

  function boardList(lb, board, animate) {
    const save = getSave();
    const view = boardView(lb.data, lb.picked || save.profile);
    const unit = unitWords(board.unit);
    const mine = view.entries.some((e) => e.isMe);
    const hint = mine || view.me ? null : boardHint(board, view, save);
    if (!view.entries.length) {
      return {
        said: `Nobody is on the ${board.label} board yet. Be the first on the board!`,
        node: h(
          'div',
          { class: 'scr-lb__state' },
          h('div', { class: 'scr-lb__pip', 'aria-hidden': 'true', html: pipHTML({ wave: true, crown: true }) }),
          h('p', { class: 'scr-lb__big' }, 'Be the first on the board!'),
          hint ? h('p', { class: 'scr-lb__small' }, hint) : null
        ),
      };
    }
    const list = h(
      'ol',
      { class: `scr-lb__list${animate ? '' : ' is-still'}` },
      view.entries.map((e, i) => boardRow(e, i, unit))
    );
    let after = hint ? h('p', { class: 'scr-lb__hint' }, hint) : null;
    if (view.me && !mine) {
      after = h(
        'p',
        { class: 'scr-lb__you' },
        h('b', null, `You: #${fmt(view.me.rank)}`),
        ` with ${plural(view.me.score, unit.one, unit.many)}. Keep hunting! 🐧`
      );
    }
    const where = mine ? ' You are on it!' : view.me ? ` You are number ${view.me.rank}.` : '';
    return { said: `${plural(view.entries.length, 'snow name')} on the ${board.label} board.${where}`, node: h('div', null, list, after) };
  }

  // Why the player isn't on this board, in words a kid can act on.
  function boardHint(board, view, save) {
    if (view.hidden) return 'You are hidden. Switch on "Show me on the leaderboard" to join in.';
    if (localScore(board.id, save) > 0) return 'Your score is on its way to the board! ☁️';
    return board.unit === 'jokes' ? 'Pull a cracker and find a joke to join in!' : 'Open a present to join in!';
  }

  function boardRow(e, i, unit) {
    const medal = e.rank <= MEDALS.length ? MEDALS[e.rank - 1] : null;
    return h(
      'li',
      {
        class: `scr-lbrow${medal ? ` is-top${e.rank}` : ''}${e.isMe ? ' is-me' : ''}`,
        style: { '--i': String(Math.min(i, 20)) },
        'aria-current': e.isMe ? 'true' : null,
      },
      h(
        'span',
        { class: 'scr-lbrow__rank' },
        h('span', { class: 'scr-sr' }, `Number ${e.rank}: `),
        medal
          ? h('span', { class: 'scr-lbrow__medal', 'aria-hidden': 'true' }, medal)
          : h('span', { class: 'scr-lbrow__num', 'aria-hidden': 'true' }, `#${fmt(e.rank)}`)
      ),
      h(
        'span',
        { class: 'scr-lbrow__who' },
        h('span', { class: 'scr-lbrow__name' }, e.name),
        e.isMe ? h('span', { class: 'scr-lbrow__you' }, 'You!') : null
      ),
      h('span', { class: 'scr-lbrow__score' }, h('b', null, fmt(e.score)), h('small', null, Math.round(e.score) === 1 ? unit.one : unit.many))
    );
  }

  // ---- "Your snow name" card ----

  // The saved snow name, or a stand-in if the save has none yet.
  function profileParts() {
    const p = getSave().profile;
    if (isValidNameParts(p)) return { adj: p.adj, noun: p.noun, num: p.num, hidden: !!p.hidden };
    if (!state.spareName) state.spareName = randomNameParts();
    return { ...state.spareName, hidden: !!(p && p.hidden) };
  }

  // What the card shows: a name just picked wins until setProfile answers.
  function shownParts() {
    return (state.lb && state.lb.picked) || profileParts();
  }

  function buildNameCard(lb) {
    const id = (part) => `scr-lb-${part}-${lb.uid}`;
    const name = h('b', { class: 'scr-lbname__name', 'aria-live': 'polite' });
    const badge = h('div', { class: 'scr-lbname__badge' }, h('span', { class: 'scr-lbname__hello' }, 'Hello! My snow name is'), name);
    const picker = (part, label, words) => {
      const sel = h('select', { id: id(part) }, words.map((w, i) => h('option', { value: String(i) }, w)));
      sel.addEventListener('change', () => {
        const v = Number(sel.value);
        if (!Number.isInteger(v)) return;
        play('pop');
        setNameParts({ [part]: v });
      });
      const field = h(
        'label',
        { class: 'scr-field', for: id(part) },
        h('span', { class: 'scr-field__label' }, label),
        h('span', { class: 'scr-select' }, sel)
      );
      return { sel, field };
    };
    const adj = picker('adj', 'First word', ADJECTIVES);
    const noun = picker('noun', 'Second word', NOUNS);
    const dice = button('New random name', { icon: '🎲', variant: 'gold', size: 'small', onClick: () => rollName() });
    const show = h(
      'button',
      { type: 'button', class: 'scr-toggle scr-lbname__show', 'aria-pressed': 'true' },
      h('span', { class: 'scr-toggle__icon', 'aria-hidden': 'true' }, '🏆'),
      h('span', { class: 'scr-toggle__label' }, 'Show me on the leaderboard'),
      h('span', { class: 'scr-toggle__sw', 'aria-hidden': 'true' }, h('i'))
    );
    show.addEventListener('click', () => {
      const hidden = !shownParts().hidden;
      play(hidden ? 'click' : 'pop');
      setNameParts({ hidden });
      restartAnim(show, 'is-boing');
    });
    const note = h('p', { class: 'scr-lbname__note' });
    const card = h(
      'section',
      { class: 'scr-lbcard scr-tint--butter', 'aria-labelledby': id('name') },
      h('span', { class: 'scr-note__pin', 'aria-hidden': 'true' }),
      h('h3', { class: 'scr-lbcard__title', id: id('name') }, h('span', { 'aria-hidden': 'true' }, '🏷️'), ' Your snow name'),
      badge,
      h('div', { class: 'scr-lbname__pick' }, adj.field, noun.field),
      h('div', { class: 'scr-lbname__actions' }, dice, show),
      note
    );
    lb.name = { card, badge, name, adj: adj.sel, noun: noun.sel, show, note };
    syncNameCard();
    return card;
  }

  // Puts the snow name into the card without rebuilding it, so a select
  // keeps focus while the player arrows through the words.
  function syncNameCard(parts) {
    const refs = state.lb && state.lb.name;
    if (!refs) return;
    const p = parts || shownParts();
    const text = nameFromParts(p);
    if (refs.name.textContent !== text) refs.name.textContent = text;
    if (refs.adj.value !== String(p.adj)) refs.adj.value = String(p.adj);
    if (refs.noun.value !== String(p.noun)) refs.noun.value = String(p.noun);
    refs.show.setAttribute('aria-pressed', p.hidden ? 'false' : 'true');
    refs.note.textContent = p.hidden ? "You're hidden, so only you can see your snow name." : 'Pick two words. Your number stays the same.';
  }

  // Every change sends the whole name, so a half-made profile is never saved.
  function setNameParts(partial) {
    const lb = state.lb;
    if (!lb) return;
    const p = { ...shownParts(), ...partial };
    const profile = { adj: p.adj, noun: p.noun, num: p.num, hidden: !!p.hidden };
    lb.picked = profile; // the board and the card follow at once, whether setProfile is sync or not
    syncNameCard(profile);
    if (hasCloudMethod('setProfile')) {
      whenDone(cloudCall('setProfile', profile), () => nameSaved(lb));
    } else {
      // a facade without setProfile: keep the name on this device at least
      const sv = getSave();
      sv.profile = { ...(sv.profile && typeof sv.profile === 'object' ? sv.profile : {}), ...profile, setAt: Date.now() };
      persist();
      nameSaved(lb);
    }
    if (lb.view === 'data') renderBoardPanel(false);
  }

  // setProfile resolves once its push (and board write) is done.
  function nameSaved(lb) {
    if (state.lb !== lb) return;
    lb.picked = null;
    syncNameCard();
    if (lb.view === 'data') renderBoardPanel(false);
    state.boardCache.clear(); // the name shows on every board
    lb.recheck = 1;
    scheduleBoardReload(lb, PROFILE_RELOAD_MS);
  }

  // New words, same number: the number is the part of the name that tells two
  // "Jolly Penguin"s apart, so it stays put like the note on the card says.
  function rollName() {
    const cur = shownParts();
    let next = randomNameParts();
    // a roll that lands on the same two words would look like a broken button
    for (let k = 0; k < 5 && next.adj === cur.adj && next.noun === cur.noun; k++) next = randomNameParts();
    play('pop');
    setNameParts({ adj: next.adj, noun: next.noun });
    const refs = state.lb && state.lb.name;
    if (refs) {
      restartAnim(refs.badge, 'is-boing');
      burst(refs.card, 10);
    }
  }

  // ---- "Play on any device" card (speaks to grown-ups) ----

  function buildAccountCard(lb) {
    const titleId = `scr-lb-acct-${lb.uid}`;
    const status = h('p', { class: 'scr-lbacct__status' });
    const body = h('div', { class: 'scr-lbacct__body' });
    const live = h('p', { class: 'scr-sr', role: 'status' });
    const card = h(
      'section',
      { class: 'scr-lbcard scr-lbcard--acct scr-tint--sky', 'aria-labelledby': titleId, tabindex: '-1' },
      h('span', { class: 'scr-note__pin', 'aria-hidden': 'true' }),
      h('h3', { class: 'scr-lbcard__title', id: titleId }, h('span', { 'aria-hidden': 'true' }, '📱'), ' Play on any device'),
      status,
      body,
      live
    );
    lb.account = { card, status, body, live };
    syncAccountStatus();
    renderAccountBody();
    return card;
  }

  function syncAccountStatus() {
    const refs = state.lb && state.lb.account;
    if (!refs) return;
    const info = cloudInfo(cloudStatus());
    if (refs.status.textContent === info.text && refs.status.getAttribute('data-tone') === info.tone) return;
    refs.status.setAttribute('data-tone', info.tone);
    refs.status.replaceChildren(h('span', { class: 'scr-clouddot', 'aria-hidden': 'true' }), h('span', null, info.text));
  }

  function renderAccountBody() {
    const lb = state.lb;
    const refs = lb && lb.account;
    if (!refs) return;
    const st = cloudStatus();
    lb.sig = sigNow(st);
    lb.ready = cloudReady();
    // a sign-out in flight keeps its card until it answers, whatever the status says meanwhile
    const op = state.auth.op;
    const view =
      op && op.kind === 'signout' ? 'google' : lb.sig === 'checking' || lb.sig === 'guest' ? lb.sig : lb.sig.startsWith('pending:') ? 'pending' : 'google';
    // signed out elsewhere while the question was up: don't bring it back later
    // (and don't make Esc close an invisible question first)
    if (view !== 'google') lb.confirmSignOut = false;
    if (view !== 'guest' && gateHere('leaderboard')) state.gate = null;
    if (view === 'checking' && !(op && op.kind === 'delete')) state.confirmDelete = false;
    if (view === 'pending') state.confirmDelete = false;
    const kids =
      view === 'checking'
        ? [h('p', null, 'Looking for your cloud save…'), op && op.kind === 'delete' ? accountLinks(lb) : null]
        : view === 'guest'
          ? guestView(lb)
          : view === 'pending'
            ? [h('div', { class: 'scr-reauth' }, reauthPanel()), accountLinks(lb)]
            : googleView(lb, st);
    keepFocus(refs.body, () => refs.body.replaceChildren(...kids.filter(Boolean)), () => refs.body.querySelector('button') || refs.card);
    if (view === 'checking') whenCheckingEnds(syncAccountCard);
  }

  // Redraws the account card only when what it shows changed.
  function syncAccountCard() {
    const lb = state.lb;
    if (!lb || !lb.account) return;
    syncAccountStatus();
    if (sigNow() !== lb.sig || cloudReady() !== lb.ready) renderAccountBody();
  }

  function accountNote(note) {
    return h('p', { class: 'scr-lbacct__note', 'data-tone': note.tone }, note.text);
  }

  function guestView(lb) {
    const op = state.auth.op;
    const linking = op && op.kind === 'link' ? op : null;
    const gate = gateHere('leaderboard');
    const note = linking
      ? { tone: 'info', text: linking.slow ? 'Still waiting for the Google window. If it closed, press Try again.' : 'A Google window should pop up. Finish signing in there.' }
      : authNote();
    let signIn;
    if (IN_APP) {
      signIn = h(
        'div',
        { class: 'scr-lbacct__inapp' },
        h('p', null, h('span', { 'aria-hidden': 'true' }, '🧭 '), h('b', null, IN_APP_TEXT)),
        h('p', { class: 'scr-lbacct__small' }, 'Look for "Open in browser" in this app\'s menu. You can keep playing here as a guest.')
      );
    } else if (gate) {
      signIn = gateForm(gate);
    } else {
      signIn = h('div', { class: 'scr-lbacct__btns' }, googleButton(linking, { key: 'link', where: 'leaderboard' }));
    }
    // a Home Screen app on iPhone / iPad: a guest here started fresh, apart
    // from Safari, and Google sign-in is how progress comes across
    const homeApp = pwaFlag('separateAppStorage');
    return [
      h('p', { class: 'scr-lbacct__for' }, 'For grown-ups'),
      h('p', null, 'Sign in with Google to keep this progress safe. Sign in with the same account on another phone, tablet or computer to carry on there.'),
      homeApp ? h('p', { class: 'scr-lbacct__note scr-lbacct__homeapp' }, h('span', { 'aria-hidden': 'true' }, '📲 '), HOME_APP_TEXT) : null,
      h('p', { class: 'scr-lbacct__small' }, 'The leaderboard only ever shows the snow name, never a real name or email.'),
      signIn,
      note ? accountNote(note) : null,
      // the week-long limit: browsers on iPhone and iPad only, not their Home
      // Screen apps (and never Android or a computer)
      IOS_BROWSER && !homeApp ? h('p', { class: 'scr-lbacct__small scr-lbacct__safari' }, IOS_GUEST_TEXT) : null,
      accountLinks(lb),
    ];
  }

  function googleView(lb, st) {
    const who = accountName(st);
    const op = state.auth.op;
    const busy = !!(op && op.kind === 'signout');
    // the popup is done but the cloud is still moving progress across (after
    // CLOUD_TIMEOUT_MS this stops holding up "Sign out", like every spinner)
    const finishing = !!(op && op.kind === 'link' && !op.slow);
    const kids = [
      h(
        'p',
        { class: 'scr-lbacct__who' },
        h('span', { class: 'scr-lbacct__tick', 'aria-hidden': 'true' }, '✓'),
        h('span', null, who ? ['Signed in as ', h('b', null, who), '.'] : 'Signed in with Google.', ' Progress is saved to your account.')
      ),
    ];
    if (lb.confirmSignOut || busy) {
      const q = `scr-lb-out-${lb.uid}`;
      const stay = button('Stay signed in', { variant: 'green', size: 'small', key: 'cancel', onClick: () => cancelSignOut() });
      const out = button(busy ? 'Signing out…' : 'Yes, sign out', {
        icon: busy ? '❄' : '👋',
        variant: 'red',
        size: 'small',
        key: 'confirm',
        cls: busy ? 'is-busy' : '',
        onClick: () => signOut(),
      });
      if (busy) {
        stay.setAttribute('aria-disabled', 'true');
        out.setAttribute('aria-disabled', 'true');
      }
      kids.push(
        h(
          'div',
          { class: 'scr-confirm', role: 'alertdialog', 'aria-labelledby': q, 'aria-describedby': `${q}-d` },
          h(
            'p',
            null,
            h('b', { id: q }, 'Sign out on this device?'),
            ' ',
            h('span', { id: `${q}-d` }, 'This device will start fresh, like a brand-new game. Your progress stays safe in your Google account: sign in again any time to bring it back.')
          ),
          h('div', { class: 'scr-confirm__btns' }, stay, out)
        )
      );
    } else {
      const deleting = !!(op && op.kind === 'delete');
      const outBtn = button('Sign out on this device', { icon: '👋', variant: 'snow', size: 'small', key: 'signout', onClick: () => askSignOut() });
      if (finishing || deleting) outBtn.setAttribute('aria-disabled', 'true');
      kids.push(h('div', { class: 'scr-lbacct__btns' }, outBtn));
      const note = finishing ? { tone: 'info', text: 'Finishing signing in…' } : authNote();
      if (note) kids.push(accountNote(note));
      kids.push(accountLinks(lb));
    }
    return kids;
  }

  // The card's small print: the privacy note, and "Delete my saved data" (for
  // a facade that can) with its in-page question.
  function accountLinks(lb) {
    const deleting = !!(state.auth.op && state.auth.op.kind === 'delete');
    if (deleting || (state.confirmDelete && hasCloudMethod('deleteEverything'))) return deleteConfirm(`scr-lb-del-${lb.uid}`);
    const canDelete = hasCloudMethod('deleteEverything') && !reauthPending();
    return h(
      'div',
      { class: 'scr-lbacct__links' },
      h(
        'button',
        {
          type: 'button',
          class: 'scr-textlink',
          'data-key': 'privacy',
          onclick: () => {
            play('click');
            openPrivacy('leaderboard');
          },
        },
        h('span', { 'aria-hidden': 'true' }, '🔒'),
        ' Privacy'
      ),
      canDelete
        ? h('button', { type: 'button', class: 'scr-textlink', 'data-key': 'delete', onclick: () => askDelete() }, h('span', { 'aria-hidden': 'true' }, '🗑️'), ' Delete my saved data')
        : null,
      canDelete ? signedOutNote() : null
    );
  }

  // Back from the privacy screen: focus the link that opened it.
  function focusAccountLink(key) {
    const refs = state.lb && state.lb.account;
    const link = refs && refs.body.querySelector(`[data-key="${key}"]`);
    if (!link) return;
    focusEl(link);
    try {
      link.scrollIntoView({ block: 'nearest' });
    } catch {
      /* old browsers */
    }
  }

  // ---- Google sign-in / sign-out (shared by the title and the leaderboard) ----

  // The note of the last sign-in or sign-out, if it belongs to this visit.
  function authNote() {
    const n = state.auth.note;
    return n && n.visit === state.visit ? n : null;
  }

  function setAuthNote(tone, text) {
    state.auth.note = text ? { tone, text, visit: state.visit } : null;
  }

  // A sign-in still waiting after CLOUD_TIMEOUT_MS holds nothing up: its
  // button offers "Try again", and signing out may go ahead (the cloud runs
  // account changes one at a time, and the older answer is then ignored).
  function authBusy() {
    const op = state.auth.op;
    return !!op && !((op.kind === 'link' || op.kind === 'reauth') && op.slow);
  }

  // Whichever screen shows the account right now picks up the change.
  function renderAuthViews() {
    if (state.current === 'title') renderTitleAuth();
    else if (state.current === 'leaderboard') renderAccountBody();
    else if (state.current === 'privacy') renderPrivacyDelete();
  }

  function announce(text) {
    let live = null;
    if (state.current === 'title') live = titleAuth && titleAuth.live;
    else if (state.current === 'leaderboard') live = state.lb && state.lb.account && state.lb.account.live;
    else if (state.current === 'privacy') live = state.privacy && state.privacy.live;
    if (live) live.textContent = text;
  }

  // Sounds only while the player is still looking at a menu that shows it.
  function authSound(name) {
    if (state.current === 'title' || state.current === 'leaderboard' || state.current === 'privacy') play(name);
  }

  // ---- the grown-ups gate in front of Google sign-in ----
  // Linking stores a grown-up's email, name and photo, so every "Sign in with
  // Google" first asks a neutral "When were you born?" (src/ui/age-gate.js).
  // A pass holds for GATE_OPEN_MS in this tab. A "not now" holds for a day on
  // this device (every tab, through a reload) and shows a gentle message
  // instead of the question, so going back to pick another year doesn't help.
  // Only when each ends is kept, never the month or year.

  function readGateUntil() {
    try {
      return passUntil(window.sessionStorage.getItem(GATE_PASS_KEY));
    } catch {
      return 0; // no storage (private mode, tests): this page only
    }
  }

  // Read afresh each time, so a "not now" from another tab counts here too.
  // Without storage the one in memory still holds until the page reloads.
  function gateLockedUntil() {
    let raw = null;
    try {
      raw = window.localStorage.getItem(GATE_LOCK_KEY);
    } catch {
      /* this page only, then */
    }
    const stored = lockUntil(raw);
    // a time too far ahead counts as a day from now: keep that instead
    if (stored && String(stored) !== raw) keepGateTime('localStorage', GATE_LOCK_KEY, stored);
    state.gateLockUntil = Math.max(lockUntil(state.gateLockUntil), stored);
    return state.gateLockUntil;
  }

  function keepGateTime(where, key, until) {
    try {
      window[where].setItem(key, String(until));
    } catch {
      /* this page only, then */
    }
  }

  // 'go' (a pass holds), 'notNow' or 'ask': see gateStep.
  function gateNow() {
    return gateStep(state.gateUntil, gateLockedUntil());
  }

  // A gate just opened: the question with nothing picked, or the gentle
  // message while a "not now" holds.
  function newGate(step) {
    return { step: step === 'notNow' ? 'notNow' : 'ask', month: '', year: '', msg: null };
  }

  // The control that gets focus when a gate opens or changes step.
  function gateFocusKey(g) {
    return g.step === 'passed' ? 'gate-go' : g.step === 'notNow' ? 'gate-close' : 'gate-month';
  }

  // The gate, if it is open on `where` (the screen and visit that asked).
  function gateHere(where) {
    const g = state.gate;
    return g && g.at === where && g.visit === state.visit && state.current === where ? g : null;
  }

  // What the title strip's redraw key needs from the gate (not the picking).
  function gateSig(g) {
    return `${g.step}:${g.msg ? g.msg.text : ''}`;
  }

  // The box that holds the gate on the current screen.
  function gateBox() {
    if (state.current === 'title') return titleAuth && titleAuth.box;
    if (state.current === 'leaderboard') return state.lb && state.lb.account && state.lb.account.body;
    return null;
  }

  function focusGate(key) {
    const box = gateBox();
    focusEl(box && box.querySelector(`[data-key="${key}"]`));
  }

  // A tap on "Sign in with Google" (or its "Try again"). Inside the 10 minutes
  // of a pass it goes straight to Google, still inside the click (reading the
  // "not now" first is synchronous too).
  function signInTapped(where) {
    if (IN_APP || authBusy() || !cloudReady()) return;
    const step = gateNow();
    if (step === 'go') {
      startLinkGoogle();
      return;
    }
    play('click');
    state.gate = { at: where, visit: state.visit, ...newGate(step) };
    // one question at a time
    if (where === 'title' && (state.confirmReset || state.homeHelp)) {
      state.confirmReset = false;
      state.homeHelp = false;
      renderResetArea();
    }
    state.confirmDelete = false;
    state.auth.note = null;
    renderAuthViews();
    focusGate(gateFocusKey(state.gate));
    if (state.gate.step === 'notNow') announce(GATE_NOT_NOW_TEXT);
  }

  // Closes an open gate (Esc, or its ✕), putting focus back on the Google
  // button. Answers whether there was one to close. A "not now" stays: the
  // button shows the same message again until the day is over.
  function closeGate() {
    if (!gateHere(state.current)) return false;
    play('click');
    state.gate = null;
    renderAuthViews();
    const box = gateBox();
    focusEl(box && box.querySelector('.scr-gbtn'));
    return true;
  }

  // How a gate talks to the place it is shown. This one is for Google sign-in
  // (title strip, account card); the feedback card has its own
  // (feedbackGate), and both share the pass's 10 minutes and the "not now".
  const signInGate = {
    get: () => gateHere(state.current),
    render: () => renderAuthViews(),
    focus: (key) => focusGate(key),
    say: (text) => announce(text),
    close: () => closeGate(),
    passed: () => {
      renderAuthViews();
      focusGate('gate-go');
      announce('Thank you! Now press Continue to Google.');
    },
  };

  function checkGate(ui = signInGate) {
    const g = ui.get();
    if (!g || g.step !== 'ask') return;
    // a "not now" from another tab meanwhile: no answering here either
    if (gateNow() === 'notNow') {
      gateNotNow(g, ui);
      return;
    }
    const now = new Date();
    const result = ageCheck(g.month, g.year, now);
    if (result === 'missing') {
      g.msg = { tone: 'info', text: 'Please pick a month and a year.' };
      ui.render();
      ui.focus(g.month ? 'gate-year' : 'gate-month');
      ui.say(g.msg.text);
      return;
    }
    // a date still to come is a slip, not an age: the picks stay to change
    if (notYetBorn(g.month, g.year, now)) {
      g.msg = { tone: 'info', text: "That date hasn't happened yet. Please pick again.", both: true };
      ui.render();
      ui.focus('gate-month');
      ui.say(g.msg.text);
      return;
    }
    // the answer goes now: only when the outcome ends is kept
    const kept = gateOutcome(result, Date.now());
    g.month = '';
    g.year = '';
    if (result === 'pass') {
      g.step = 'passed';
      g.msg = { tone: 'ok', text: 'Thank you!' };
      state.gateUntil = kept.passUntil;
      keepGateTime('sessionStorage', GATE_PASS_KEY, kept.passUntil);
      play('pop');
      ui.passed();
      return;
    }
    state.gateLockUntil = kept.lockUntil;
    keepGateTime('localStorage', GATE_LOCK_KEY, kept.lockUntil);
    play('click'); // gentle: no buzzer
    gateNotNow(g, ui);
  }

  // The question goes, and the gentle message takes its place.
  function gateNotNow(g, ui) {
    g.step = 'notNow';
    g.msg = null;
    ui.render();
    ui.focus('gate-close');
    ui.say(GATE_NOT_NOW_TEXT);
  }

  let gateUid = 0;

  // The gate as a little form: "When were you born?", a month and a year
  // (both start blank, and nothing says which answers pass), Continue and ✕.
  // A pass swaps them for "Continue to Google", whose click calls
  // linkGoogle() at once: Safari opens popups only there. (The feedback card
  // never shows that: its `ui.passed` opens the note field instead.) A "not
  // now" shows only the gentle message and ✕.
  function gateForm(g, ui = signInGate) {
    const id = `scr-gate-${++gateUid}`;
    const msgId = `${id}-msg`;
    const close = h(
      'button',
      {
        type: 'button',
        class: 'scr-gate__x',
        'data-key': 'gate-close',
        'aria-label': g.step === 'notNow' ? 'Close' : 'Not now',
        title: g.step === 'notNow' ? 'Close' : 'Not now',
        onclick: () => ui.close(),
      },
      h('span', { 'aria-hidden': 'true' }, '✕')
    );
    if (g.step === 'notNow') {
      return h(
        'div',
        { class: 'scr-gate is-later', role: 'group', 'aria-labelledby': msgId },
        h('p', { class: 'scr-gate__done', id: msgId }, h('span', { 'aria-hidden': 'true' }, '🐧 '), GATE_NOT_NOW_TEXT),
        close
      );
    }
    if (g.step === 'passed') {
      const ready = cloudReady();
      const go = button(ready ? 'Continue to Google' : 'One moment…', {
        icon: 'G',
        variant: 'snow',
        size: 'small',
        key: 'gate-go',
        cls: `scr-gbtn${ready ? '' : ' is-waiting'}`,
        // no await, no promise, nothing in between: straight to the facade.
        // A "not now" from another tab since the pass still wins; reading it
        // is synchronous, so the popup still opens inside the click.
        onClick: () => {
          if (gateNow() === 'notNow') {
            const cur = ui.get();
            if (cur) gateNotNow(cur, ui);
            return;
          }
          startLinkGoogle();
        },
      });
      if (!ready) go.setAttribute('aria-disabled', 'true');
      return h(
        'div',
        { class: 'scr-gate is-passed', role: 'group', 'aria-labelledby': msgId },
        h('p', { class: 'scr-gate__done', id: msgId }, h('span', { 'aria-hidden': 'true' }, '✓ '), g.msg ? g.msg.text : 'Thank you!'),
        h('span', { class: 'scr-gate__row' }, go, close)
      );
    }
    // each starts on its blank first choice, so nothing is picked for anyone
    // (autocomplete off: the browser's autofill would pick it for them)
    const sels = {};
    const pick = (part, label, choices) => {
      const sel = h(
        'select',
        {
          id: `${id}-${part}`,
          class: 'scr-gate__pick',
          'data-key': `gate-${part}`,
          autocomplete: 'off',
          'aria-invalid': g.msg && g.msg.tone === 'info' && (!g[part] || g.msg.both) ? 'true' : null,
          'aria-describedby': g.msg ? msgId : null,
        },
        h('option', { value: '' }, label),
        choices.map(([value, text]) => h('option', { value: String(value) }, text))
      );
      sel.value = g[part];
      const keep = () => {
        g[part] = sel.value;
      };
      sel.addEventListener('input', keep);
      sel.addEventListener('change', keep);
      sels[part] = sel;
      return [h('label', { class: 'scr-sr', for: sel.id }, `Birth ${label.toLowerCase()}`), h('span', { class: 'scr-select scr-gate__select' }, sel)];
    };
    const month = pick('month', 'Month', BIRTH_MONTHS.map((name, i) => [i + 1, name]));
    const year = pick('year', 'Year', birthYears(new Date()).map((y) => [y, y]));
    const next = button('Continue', { variant: 'green', size: 'small', key: 'gate-check' });
    next.setAttribute('type', 'submit');
    const form = h(
      'form',
      { class: 'scr-gate', novalidate: true, 'aria-labelledby': `${id}-q`, autocomplete: 'off' },
      h('p', { class: 'scr-gate__q', id: `${id}-q` }, 'When were you born?'),
      h('span', { class: 'scr-gate__row' }, h('span', { class: 'scr-gate__picks' }, month, year), next, close),
      g.msg ? h('p', { class: 'scr-gate__msg', id: msgId, 'data-tone': g.msg.tone }, g.msg.text) : null
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      // judge what the selects show, even if a phone's picker hasn't sent
      // its change yet
      g.month = sels.month.value;
      g.year = sels.year.value;
      checkGate(ui);
    });
    return form;
  }

  function startLinkGoogle() {
    const a = state.auth;
    // one at a time, except that a sign-in stuck on its popup may be retried
    if (IN_APP || authBusy() || !cloudReady()) return;
    // Safari opens Google's window only inside the tap, so the facade comes
    // first: before any sound, redraw or promise.
    const result = cloudCall('linkGoogle');
    play('click');
    const token = ++a.seq;
    a.op = { kind: 'link', token, slow: false };
    a.note = null;
    state.gate = null; // the question has done its job
    renderAuthViews();
    announce('Opening the Google sign-in window.');
    // The popup waits on a grown-up, so instead of spinning forever the button
    // wakes up again after a while; a late answer still lands.
    authLater(() => {
      if (!a.op || a.op.token !== token) return;
      a.op.slow = true;
      renderAuthViews();
    }, CLOUD_TIMEOUT_MS);
    whenDone(result, (res) => {
      if (a.seq !== token) return; // a newer try owns the buttons
      a.op = null;
      if (res.ok || /already-linked/i.test(errorText(res.error))) {
        setAuthNote('ok', res.switched ? SWITCHED_TEXT : LINKED_TEXT);
        authSound('jingle');
        state.boardCache.clear(); // after a switch, "me" is a different player
        if (state.lb) scheduleBoardReload(state.lb, 600);
      } else if (isCancelled(res)) {
        a.note = null; // closing the popup is fine: nothing to report
      } else if (isNotReady(res.error, res.reason)) {
        setAuthNote('info', linkErrorText(res.error, res.reason)); // not a failure: the cloud is still waking up
      } else {
        setAuthNote('error', linkErrorText(res.error, res.reason));
        authSound('error');
      }
      renderAuthViews();
      announce(a.note ? a.note.text : 'Sign-in closed. Nothing changed.');
    });
  }

  function askSignOut() {
    const lb = state.lb;
    if (!lb || authBusy()) return;
    play('click');
    lb.confirmSignOut = true;
    state.confirmDelete = false;
    state.auth.note = null;
    renderAccountBody();
    const box = lb.account.body;
    focusEl(box.querySelector('[data-key="cancel"]'));
    const confirmBox = box.querySelector('.scr-confirm');
    if (confirmBox && confirmBox.scrollIntoView) confirmBox.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  function cancelSignOut() {
    const lb = state.lb;
    if (!lb || authBusy()) return;
    play('click');
    lb.confirmSignOut = false;
    renderAccountBody();
    focusEl(lb.account.body.querySelector('[data-key="signout"]'));
  }

  function signOut() {
    const lb = state.lb;
    const a = state.auth;
    if (!lb || authBusy()) return;
    play('whoosh');
    const token = ++a.seq;
    a.op = { kind: 'signout', token, slow: false };
    a.note = null;
    renderAuthViews();
    announce('Signing out…');
    // like the board, a late answer still lands if nothing newer was started
    const finish = (res, timedOut) => {
      if (a.seq !== token) return;
      if (timedOut && !a.op) return; // answered in time
      a.op = null;
      if (state.lb) state.lb.confirmSignOut = false;
      // 'not-signed-in': an earlier, timed-out sign-out got there first
      if (res.ok || /not-signed-in/i.test(errorText(res.error))) {
        setAuthNote('ok', 'Signed out. This device starts fresh, and your progress is safe in your Google account.');
        state.boardCache.clear();
        if (state.lb) scheduleBoardReload(state.lb, 600);
      } else {
        setAuthNote(
          'error',
          timedOut
            ? 'Signing out is taking too long. Please try again.'
            : looksOffline(res.error)
              ? "You're offline. Please try again when the internet is back."
              : "Couldn't sign out just now. Please try again."
        );
        authSound('error');
      }
      renderAuthViews();
      announce(a.note.text);
    };
    authLater(() => finish({ ok: false, error: 'timeout' }, true), CLOUD_TIMEOUT_MS);
    whenDone(cloudCall('signOutToFresh'), (res) => finish(res, false));
  }

  // ---- "Delete my saved data" (privacy screen and account card) ----

  // The box that holds the delete question on the current screen.
  function deleteBox() {
    if (state.current === 'privacy') return state.privacy && state.privacy.box;
    if (state.current === 'leaderboard') return state.lb && state.lb.account && state.lb.account.body;
    return null;
  }

  // In-page question (never window.confirm), also shown while deleting.
  function deleteConfirm(id) {
    const busy = !!(state.auth.op && state.auth.op.kind === 'delete');
    const keep = button('Keep my data', { variant: 'green', size: 'small', key: 'delete-no', onClick: () => cancelDelete() });
    const yes = button(busy ? 'Deleting…' : 'Yes, delete it', {
      icon: busy ? '❄' : '🗑️',
      variant: 'red',
      size: 'small',
      key: 'delete-yes',
      cls: busy ? 'is-busy' : '',
      onClick: () => startDelete(),
    });
    if (busy) {
      keep.setAttribute('aria-disabled', 'true');
      yes.setAttribute('aria-disabled', 'true');
    }
    const warning = busy ? null : signedOutNote(`${id}-w`);
    return h(
      'div',
      { class: 'scr-confirm scr-delconfirm', role: 'alertdialog', 'aria-labelledby': id, 'aria-describedby': warning ? `${id}-d ${id}-w` : `${id}-d` },
      h('p', null, h('b', { id }, 'Delete your saved data?'), ' ', h('span', { id: `${id}-d` }, deleteWords(sigNow()).ask)),
      warning,
      h('div', { class: 'scr-confirm__btns' }, keep, yes)
    );
  }

  // "Used Google sign-in before?", for anyone not signed in with Google: a
  // delete reaches only the player on this device (docs/CLOUD.md). Null when
  // it doesn't apply, and just after a delete, when the note says what happened.
  function signedOutNote(id) {
    const { warning } = deleteWords(sigNow());
    const note = authNote();
    if (!warning || (note && (note.text === DELETED_TEXT || note.text === DELETED_KEPT_TEXT))) return null;
    const [before, after] = warning.split('email us');
    const us = contactEl('email us');
    return h('p', { class: 'scr-delnote', id }, us ? [before, us, after] : `${before.replace(/, or $/, '')}.`);
  }

  function askDelete() {
    if (authBusy() || !hasCloudMethod('deleteEverything')) return;
    play('click');
    state.confirmDelete = true;
    state.auth.note = null;
    if (state.gate) state.gate = null;
    if (state.lb) state.lb.confirmSignOut = false;
    renderAuthViews();
    const box = deleteBox();
    focusEl(box && box.querySelector('[data-key="delete-no"]'));
    const confirmBox = box && box.querySelector('.scr-delconfirm');
    if (confirmBox && confirmBox.scrollIntoView) confirmBox.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  function cancelDelete() {
    if (authBusy() || !state.confirmDelete) return;
    play('click');
    state.confirmDelete = false;
    renderAuthViews();
    const box = deleteBox();
    focusEl(box && box.querySelector('[data-key="delete"]'));
  }

  // Like signing out: one account change at a time, no spinner forever, and a
  // late answer still lands if nothing newer was started.
  function startDelete() {
    const a = state.auth;
    if (authBusy() || !hasCloudMethod('deleteEverything')) return;
    play('whoosh');
    const token = ++a.seq;
    a.op = { kind: 'delete', token, slow: false };
    a.note = null;
    state.gate = null;
    renderAuthViews();
    announce('Deleting your saved data…');
    const finish = (res, timedOut) => {
      if (a.seq !== token) return;
      if (timedOut && !a.op) return; // answered in time
      a.op = null;
      state.confirmDelete = false;
      if (res.ok || res.needsReauth) {
        // a guest's leftover sign-in holds only the random player ID
        if (res.ok) setAuthNote('ok', res.accountDeleted === false && res.guest !== true ? DELETED_KEPT_TEXT : DELETED_TEXT);
        else a.note = null; // the "Confirm with Google" panel says what is left
        state.boardCache.clear(); // "me" is a brand-new guest now (or nobody, for now)
        state.spareName = null;
        if (state.lb) scheduleBoardReload(state.lb, 600);
      } else {
        setAuthNote('error', deleteErrorText(res.error, timedOut));
        authSound('error');
      }
      renderAuthViews();
      if (res.needsReauth && reauthPending()) {
        const box = deleteBox();
        focusEl(box && box.querySelector('[data-key="reauth"]'));
        announce(REAUTH_TEXT);
        return;
      }
      announce(a.note ? a.note.text : '');
    };
    authLater(() => finish({ ok: false, error: 'timeout' }, true), DELETE_TIMEOUT_MS);
    whenDone(cloudCall('deleteEverything'), (res) => finish(res, false));
  }

  // "Confirm with Google to finish deleting", on the Privacy screen and the
  // account card while a delete waits for Google (reauthPending). The note
  // under it says how the last try went.
  function reauthPanel() {
    const op = state.auth.op;
    const running = op && op.kind === 'reauth' ? op : null;
    const busy = !!running && !running.slow;
    const ready = cloudReady();
    const btn = button(busy ? 'Waiting for Google…' : ready ? REAUTH_LABEL : 'One moment…', {
      icon: busy ? '❄' : 'G',
      variant: 'snow',
      size: 'small',
      key: 'reauth',
      cls: `scr-gbtn${busy ? ' is-busy' : ''}${ready ? '' : ' is-waiting'}`,
      // no await, no promise, nothing in between: straight to the facade
      onClick: () => startReauthDelete(),
    });
    if (busy || !ready) btn.setAttribute('aria-disabled', 'true');
    const note = running
      ? { tone: 'info', text: running.slow ? 'Still waiting for Google. If the window closed, press the button again.' : `A Google window should pop up. ${REAUTH_PICK}` }
      : authNote();
    const contact = contactEl();
    return [
      h('p', { class: 'scr-reauth__text' }, REAUTH_TEXT),
      h('div', { class: 'scr-reauth__btns' }, btn),
      h('p', { class: 'scr-reauth__small' }, REAUTH_PICK, contact ? [" Can't do it here? Contact ", contact, " and we'll finish it within 30 days."] : null),
      note ? h('p', { class: 'scr-reauth__note', 'data-tone': note.tone }, note.text) : null,
    ];
  }

  // Like linkGoogle: Safari opens Google's window only inside the tap, so the
  // facade comes first, before any sound, redraw or promise. The popup waits
  // on a grown-up, so after CLOUD_TIMEOUT_MS the button wakes up again (a
  // late answer still lands).
  function startReauthDelete() {
    const a = state.auth;
    if (authBusy() || !cloudReady() || !reauthPending()) return;
    const result = cloudCall('reauthAndDelete');
    play('click');
    const token = ++a.seq;
    a.op = { kind: 'reauth', token, slow: false };
    a.note = null;
    renderAuthViews();
    announce('Opening the Google window to confirm.');
    authLater(() => {
      if (!a.op || a.op.token !== token) return;
      a.op.slow = true;
      renderAuthViews();
    }, CLOUD_TIMEOUT_MS);
    whenDone(result, (res) => {
      if (a.seq !== token) return; // a newer try owns the buttons
      a.op = null;
      if (res.ok) {
        setAuthNote('ok', DELETED_TEXT);
        authSound('jingle');
        state.boardCache.clear(); // "me" is a brand-new guest now
        state.spareName = null;
        if (state.lb) scheduleBoardReload(state.lb, 600);
      } else if (/not-pending/i.test(errorText(res.error))) {
        a.note = null; // finished in another tab, or nothing to finish: the status shows which
      } else if (isCancelled(res)) {
        setAuthNote('info', REAUTH_CLOSED); // a change of mind: no buzzer
      } else {
        setAuthNote(isNotReady(res.error, res.reason) ? 'info' : 'error', reauthErrorText(res));
        if (a.note.tone === 'error') authSound('error');
      }
      renderAuthViews();
      announce(a.note ? a.note.text : '');
    });
  }

  // The title chip opens the leaderboard here, at the sign-in card.
  function focusAccountCard() {
    const refs = state.lb && state.lb.account;
    if (!refs) return;
    focusEl(refs.body.querySelector('button') || refs.card);
    try {
      refs.card.scrollIntoView({ block: 'nearest' });
    } catch {
      /* old browsers */
    }
    restartAnim(refs.card, 'is-flash');
  }

  // cloud.onStatus → main.js → cloudChanged(): patch, never rebuild.
  function leaderboardStatusChanged() {
    const lb = state.lb;
    if (!lb || !lb.account) return;
    const st = cloudStatus();
    syncAccountStatus();
    const was = lb.sig;
    if (sigNow(st) !== was) {
      renderAccountBody();
      // Signed in or out elsewhere: "me" on the board may be someone else now.
      // (Leaving 'checking' is just the first sync; the board already waited for it.)
      if (was !== 'checking') {
        state.boardCache.clear();
        scheduleBoardReload(lb, 300);
      }
      return;
    }
    // the cloud got ready (or lost it): "One moment…" ↔ "Sign in with Google"
    if (cloudReady() !== lb.ready) renderAccountBody();
    // back online: a board that failed tries again by itself, quietly, so a
    // focused "Try again" stays put until there is a list to show
    if (st.state === 'synced' && lb.view === 'error' && !lb.pending) loadBoard({ force: true, quiet: true });
  }

  // main.js calls refresh() when the cloud merged progress in (or a name
  // change was saved). Patching keeps focus, a half-answered sign-out
  // question and the list on screen.
  function refreshLeaderboard() {
    const lb = state.lb;
    if (!lb) return;
    syncNameCard();
    syncAccountCard();
    if (lb.view === 'data') renderBoardPanel(false);
    state.boardCache.clear();
    scheduleBoardReload(lb, 800);
  }

  // ---------------------------------------------------------------------------
  // PRIVACY: what is kept, in plain words for grown-ups (docs/CLOUD.md)
  // ---------------------------------------------------------------------------

  function showPrivacy(back) {
    openPrivacy(back);
  }

  function openPrivacy(back) {
    state.privacyBack = PRIVACY_BACKS.has(back) ? back : 'title';
    if (state.privacyBack === 'leaderboard' && !cloud()) state.privacyBack = 'title';
    open('privacy', buildPrivacy);
  }

  // PRIVACY_CONTACT (src/cloud/config.js) as a link: mailto, or a web page
  // in a new tab. Plain text if it is neither, null if there is none. `label`
  // replaces the address as the link's words.
  function contactEl(label) {
    const contact = contactLink(PRIVACY_CONTACT);
    if (!contact) return null;
    if (!contact.href) return h('b', { class: 'scr-privacy__contact' }, contact.text);
    return h(
      'a',
      {
        class: 'scr-privacy__contact',
        href: contact.href,
        target: contact.external ? '_blank' : null,
        rel: contact.external ? 'noopener noreferrer' : null,
      },
      label || contact.text,
      contact.external ? h('span', { class: 'scr-sr' }, ' (opens in a new tab)') : null
    );
  }

  function buildPrivacy() {
    const hasCloud = !!cloud();
    const canDelete = hasCloud && hasCloudMethod('deleteEverything');
    const contact = contactEl();
    const item = (icon, lead, ...text) =>
      h(
        'li',
        { class: 'scr-privacy__item' },
        h('span', { class: 'scr-privacy__icon', 'aria-hidden': 'true' }, icon),
        h('p', null, h('b', null, lead), ' ', text)
      );
    // "To delete": the button where there is one, and the contact when set
    let toDelete;
    if (!hasCloud) toDelete = contact ? ['use "Reset progress" on the title screen. Questions? Contact ', contact, '.'] : 'use "Reset progress" on the title screen.';
    else if (canDelete) toDelete = contact ? ['use the "Delete my saved data" button below, or, for a Google account, contact ', contact, '.'] : 'use the "Delete my saved data" button below.';
    else toDelete = contact ? ['contact ', contact, '.'] : '"Reset progress" on the title screen clears this device.';
    // The cloud's list says what public/privacy.html says, word for word
    // (src/ui/privacy-text.js).
    const items = hasCloud
      ? [...PRIVACY_FACTS.map((f) => item(f.icon, f.lead, f.text)), item('🗑️', 'To delete:', toDelete)]
      : [
          // no cloud in this copy of the game: everything stays in this browser
          item('💾', 'Saved on this device only:', 'the game progress, sound settings and snow name. No account, name, email or location.'),
          item('🚫', 'Never:', 'no ads, no analytics, no tracking, no chat.'),
          item('📱', 'iPhone and iPad:', 'Safari may clear saved progress after about a week of not playing.'),
          item('🧹', 'To delete:', toDelete),
        ];
    // The full policy describes the game with its cloud, so a copy without
    // one doesn't link it. A new tab keeps the game where it was.
    const policy = hasCloud
      ? h(
          'p',
          { class: 'scr-privacy__more' },
          h(
            'a',
            { class: 'scr-privacy__contact', href: POLICY_PAGE, target: '_blank', rel: 'noopener', 'data-key': 'policy' },
            h('span', { 'aria-hidden': 'true' }, '📄 '),
            'Read the full privacy policy',
            h('span', { class: 'scr-sr' }, ' (opens in a new tab)')
          )
        )
      : null;

    const live = h('p', { class: 'scr-sr', role: 'status' });
    const box = canDelete ? h('div', { class: 'scr-privacy__delbody' }) : null;
    const delTitle = 'scr-privacy-del';
    state.privacy = { box, live, key: '' };
    const body = h(
      'div',
      { class: 'scr-privacy' },
      h('ul', { class: 'scr-privacy__list' }, items),
      policy,
      box
        ? h(
            'section',
            { class: 'scr-privacy__delete scr-tint--blush', 'aria-labelledby': delTitle },
            h('h3', { class: 'scr-privacy__deltitle', id: delTitle }, h('span', { 'aria-hidden': 'true' }, '🗑️'), ' Delete my saved data'),
            box
          )
        : null,
      live
    );
    renderPrivacyDelete();

    const foot = [
      button(state.privacyBack === 'leaderboard' ? 'Leaderboard' : 'Title', {
        icon: '↩',
        variant: 'red',
        autofocus: true,
        onClick: () => {
          play('click');
          leavePrivacy();
        },
      }),
    ];
    return page({ cls: 'scr-privacybook', title: 'Privacy', icon: '🔒', sub: 'What this game keeps, in plain words for grown-ups.' }, body, foot);
  }

  // The delete part: the button, its question (also while deleting), and the
  // answer's note. Redrawn in place, keeping focus.
  function renderPrivacyDelete() {
    const refs = state.privacy;
    if (!refs || !refs.box) return;
    const deleting = !!(state.auth.op && state.auth.op.kind === 'delete');
    const pending = !deleting && reauthPending();
    if (pending) state.confirmDelete = false;
    refs.key = privacyKey();
    const note = authNote();
    const kids = [];
    if (pending) {
      // everything but the Google sign-in is gone: one more tap for that
      kids.push(h('div', { class: 'scr-reauth' }, reauthPanel()));
    } else if (deleting || state.confirmDelete) {
      kids.push(deleteConfirm('scr-privacy-delq'));
    } else {
      kids.push(
        h('p', null, `${DELETE_FACTS.what} This device then starts fresh.`),
        signedOutNote(),
        h(
          'div',
          { class: 'scr-privacy__btns' },
          button('Delete my saved data', { icon: '🗑️', variant: 'red', size: 'small', key: 'delete', onClick: () => askDelete() })
        )
      );
    }
    // (the waiting panel shows its own note)
    if (note && !deleting && !pending) kids.push(h('p', { class: 'scr-privacy__note', 'data-tone': note.tone }, note.text));
    keepFocus(refs.box, () => refs.box.replaceChildren(...kids.filter(Boolean)), () => refs.box.querySelector('button'));
    if (sigNow() === 'checking') whenCheckingEnds(syncPrivacyDelete);
  }

  // What the delete box shows that the cloud's status can change.
  function privacyKey() {
    return `${reauthPending()}|${cloudReady()}|${sigNow()}`;
  }

  // Redraws the delete box only when what it shows changed.
  function syncPrivacyDelete() {
    if (state.current === 'privacy' && state.privacy && state.privacy.key !== privacyKey()) renderPrivacyDelete();
  }

  // ---------------------------------------------------------------------------
  // FEEDBACK: a card over the title or results, never during a night
  // (docs/CLOUD.md, "Feedback"). Kids tap stars and chips; only a grown-up,
  // past the same gate as Google sign-in, can type a note.
  // ---------------------------------------------------------------------------

  function readFeedbackLock() {
    try {
      return window.localStorage.getItem(FEEDBACK_LOCK_KEY) === '1';
    } catch {
      return false; // no storage (private mode, tests): this page only
    }
  }

  function setFeedbackLocked(on) {
    state.feedbackLocked = !!on;
    try {
      if (on) window.localStorage.setItem(FEEDBACK_LOCK_KEY, '1');
      else window.localStorage.removeItem(FEEDBACK_LOCK_KEY);
    } catch {
      /* this page only, then */
    }
    refreshFeedbackLinks();
  }

  // A night has ended (results, or quit to title): feedback may be sent again.
  function nightEnded() {
    if (!state.nightOn) return;
    state.nightOn = false;
    if (state.feedbackLocked) setFeedbackLocked(false);
  }

  // "⭐ Feedback" on the title's bottom line and at the end of the results.
  // After a send it says thanks instead, until the next night ends. Only
  // with a cloud that takes feedback.
  function feedbackLink(where, cls) {
    if (!canFeedback()) return null;
    const locked = state.feedbackLocked;
    return h(
      'button',
      {
        type: 'button',
        class: `${cls} scr-fblink`,
        'data-key': 'feedback',
        'data-where': where,
        'data-cls': cls,
        'aria-disabled': locked ? 'true' : null,
        'aria-haspopup': locked ? null : 'dialog',
        onclick: () => {
          if (state.feedbackLocked) return;
          play('click');
          openFeedback(where);
        },
      },
      h('span', { 'aria-hidden': 'true' }, '⭐'),
      locked ? ` ${FEEDBACK_THANKS}` : ' Feedback'
    );
  }

  // Swaps the Feedback links on screen for up-to-date ones, keeping focus.
  function refreshFeedbackLinks() {
    for (const old of stage.querySelectorAll('[data-key="feedback"]')) {
      const fresh = feedbackLink(old.getAttribute('data-where'), old.getAttribute('data-cls'));
      const focused = typeof document !== 'undefined' && document.activeElement === old;
      if (fresh) old.replaceWith(fresh);
      else old.remove();
      if (focused) focusEl(fresh);
    }
  }

  // The map number of the last night, or null on the title before any.
  function islandSeed() {
    try {
      if (typeof deps.getIslandSeed === 'function') return cleanSeed(deps.getIslandSeed());
    } catch {
      return null;
    }
    return cleanSeed(state.lastSummary ? state.lastSummary.seed : null);
  }

  // How the grown-ups gate talks to the feedback card (see signInGate). A
  // pass opens the note field at once: there's no popup to open.
  const feedbackGate = {
    get: () => (state.fb && state.fb.note === 'gate' ? state.fb.gate : null),
    render: () => renderFeedbackNote(),
    focus: (key) => focusFeedback(key),
    say: (text) => sayFeedback(text),
    close: () => closeFeedbackGate(),
    passed: () => {
      const fb = state.fb;
      if (!fb) return;
      fb.gate = null;
      fb.note = 'open';
      renderFeedbackNote(fb);
      focusFeedback('fb-comment');
      sayFeedback('Thank you! Now type your note.');
    },
  };

  function openFeedback(where) {
    if (state.fb || state.feedbackLocked || !canFeedback()) return;
    if (state.current !== 'title' && state.current !== 'results') return;
    // one question at a time on the title
    if (gateHere('title')) {
      state.gate = null;
      renderTitleAuth();
    }
    const fb = {
      where,
      rating: 0,
      category: null,
      quick: new Set(),
      comment: '',
      note: 'closed', // the grown-ups' note: 'closed', 'gate' (the grown-ups gate) or 'open'
      gate: null,
      sending: null, // { token } while sendFeedback() is out
      seq: 0,
      msg: null, // { tone, text } above the buttons
      closed: false,
      refs: null,
    };
    state.fb = fb;
    fb.refs = buildFeedback(fb);
    el.insertBefore(fb.refs.modal, toast);
    // the screen underneath can't be reached (or focused) while the card is up
    stage.setAttribute('inert', '');
    notice.setAttribute('inert', '');
    renderFeedbackNote(fb);
    renderFeedbackFoot(fb);
    focusFeedback('fb-star-1');
  }

  let fbUid = 0;

  function buildFeedback(fb) {
    const id = `scr-fb-${++fbUid}`;
    const titleId = `${id}-title`;
    const close = h(
      'button',
      { type: 'button', class: 'scr-gate__x scr-fb__x', 'data-key': 'fb-close', 'aria-label': 'Close', title: 'Close', onclick: () => feedbackBack({ whole: true }) },
      h('span', { 'aria-hidden': 'true' }, '✕')
    );
    // a native radio group or checkbox under each chip: arrow keys, Space and
    // screen readers work as usual, and the label is the big tap target
    const option = (type, name, value, key, face, onChange, cls = 'scr-fb__chip') => {
      const input = h('input', { type, name, value, class: 'scr-fb__input', 'data-key': key, required: type === 'radio' || null });
      input.addEventListener('change', () => onChange(input));
      return { input, label: h('label', { class: cls }, input, face) };
    };
    const group = (cls, legend, hint, kids) =>
      h(
        'fieldset',
        { class: `scr-fb__group ${cls}` },
        h('legend', { class: 'scr-fb__legend' }, legend, hint ? h('small', null, ` ${hint}`) : null),
        h('div', { class: 'scr-fb__opts' }, kids)
      );

    const starOpts = [1, 2, 3, 4, 5].map((n) =>
      option(
        'radio',
        `${id}-stars`,
        String(n),
        `fb-star-${n}`,
        [h('span', { class: 'scr-fb__glyph', 'aria-hidden': 'true' }, '★'), h('span', { class: 'scr-sr' }, n === 1 ? '1 star' : `${n} stars`)],
        (input) => {
          if (!input.checked) return;
          fb.rating = n;
          syncStars(fb);
          feedbackChanged(fb);
          play('click');
        },
        'scr-fb__star'
      )
    );
    const catOpts = FEEDBACK_CATEGORIES.map((c) =>
      option('radio', `${id}-cat`, c.id, `fb-cat-${c.id}`, h('span', { class: 'scr-fb__face' }, h('span', { 'aria-hidden': 'true' }, c.icon), ` ${c.label}`), (input) => {
        if (!input.checked) return;
        fb.category = c.id;
        feedbackChanged(fb);
        play('click');
      })
    );
    const quickOpts = FEEDBACK_QUICK.map((q) =>
      option('checkbox', `${id}-quick`, q.id, `fb-quick-${q.id}`, h('span', { class: 'scr-fb__face' }, h('span', { 'aria-hidden': 'true' }, q.icon), ` ${q.label}`), (input) => {
        if (input.checked && fb.quick.size < FEEDBACK_QUICK_MAX) fb.quick.add(q.id);
        else if (!input.checked) fb.quick.delete(q.id);
        input.checked = fb.quick.has(q.id);
        syncQuick(fb);
        feedbackChanged(fb);
        play('click');
      })
    );

    const stars = group('scr-fb__stars', 'How many stars?', null, starOpts.map((o) => o.label));
    const cats = group('scr-fb__cats', 'What is it about?', null, catOpts.map((o) => o.label));
    const quick = group('scr-fb__quick', 'Quick notes', `(up to ${FEEDBACK_QUICK_MAX}, if you like)`, quickOpts.map((o) => o.label));
    const note = h('div', { class: 'scr-fb__note' });
    // disabled as a whole while sending; the quick notes' own limit is separate
    const fields = h('fieldset', { class: 'scr-fb__fields' }, stars, cats, quick, note);
    const msg = h('p', { class: 'scr-fb__msg', hidden: true });
    const foot = h('div', { class: 'scr-fb__btns' });
    const live = h('p', { class: 'scr-sr', role: 'status' });
    const card = h(
      'div',
      { class: 'scr-card scr-fb' },
      close,
      h('h2', { class: 'scr-banner scr-banner--small scr-fb__banner', id: titleId }, h('span', { class: 'scr-banner__icon', 'aria-hidden': 'true' }, '⭐'), h('span', null, 'Feedback')),
      h('p', { class: 'scr-card__sub scr-fb__sub' }, "Tell Pip's elves what you think!"),
      fields,
      msg,
      foot,
      live
    );
    const modal = h('div', { class: 'scr-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId }, card);
    return {
      id,
      modal,
      card,
      close,
      fields,
      stars,
      cats,
      note,
      msg,
      foot,
      live,
      starLabels: starOpts.map((o) => o.label),
      quickInputs: quickOpts.map((o) => o.input),
    };
  }

  // Stars up to the chosen one light up.
  function syncStars(fb) {
    fb.refs.starLabels.forEach((label, i) => label.classList.toggle('is-on', i < fb.rating));
  }

  // At the limit, the other quick notes rest until one is taken off.
  function syncQuick(fb) {
    const full = fb.quick.size >= FEEDBACK_QUICK_MAX;
    for (const input of fb.refs.quickInputs) input.disabled = full && !fb.quick.has(input.value);
  }

  // A pick clears the "please pick…" hint it answers.
  function feedbackChanged(fb) {
    if (fb.rating) fb.refs.stars.removeAttribute('data-missing');
    if (fb.category) fb.refs.cats.removeAttribute('data-missing');
    if (fb.msg && fb.msg.tone === 'info') {
      fb.msg = null;
      renderFeedbackFoot(fb);
    }
  }

  function focusFeedback(key) {
    const fb = state.fb;
    focusEl(fb && fb.refs && fb.refs.card.querySelector(`[data-key="${key}"]`));
  }

  function sayFeedback(text) {
    if (state.fb && state.fb.refs) state.fb.refs.live.textContent = text;
  }

  // The grown-ups' note: a link, their question, or the field with a counter.
  function renderFeedbackNote(fb = state.fb) {
    if (!fb || !fb.refs) return;
    const box = fb.refs.note;
    let kids;
    if (fb.note === 'gate' && fb.gate) {
      kids = [gateForm(fb.gate, feedbackGate)];
    } else if (fb.note === 'open') {
      const id = `${fb.refs.id}-comment`;
      const count = h('span', { class: 'scr-fb__count', id: `${id}-count` });
      const area = h('textarea', {
        id,
        class: 'scr-fb__text',
        rows: '3',
        maxlength: String(FEEDBACK_COMMENT_MAX),
        autocomplete: 'off',
        'data-key': 'fb-comment',
        'aria-describedby': `${id}-hint ${id}-count`,
      });
      area.value = fb.comment;
      const syncCount = () => {
        count.textContent = `${fb.comment.length} / ${FEEDBACK_COMMENT_MAX}`;
        count.toggleAttribute('data-full', fb.comment.length >= FEEDBACK_COMMENT_MAX);
      };
      area.addEventListener('input', () => {
        fb.comment = area.value.slice(0, FEEDBACK_COMMENT_MAX);
        syncCount();
      });
      syncCount();
      kids = [
        h('label', { class: 'scr-fb__notelabel', for: id }, h('span', { class: 'scr-gate__for' }, 'For grown-ups:'), " a note for the game's maker (optional)"),
        h('p', { class: 'scr-fb__notehint', id: `${id}-hint` }, "Please don't include names, addresses or contact details."),
        area,
        h('p', { class: 'scr-fb__countrow' }, count, h('span', { class: 'scr-sr' }, ' characters')),
      ];
    } else {
      kids = [
        h(
          'button',
          { type: 'button', class: 'scr-textlink', 'data-key': 'fb-note', onclick: () => noteTapped() },
          h('span', { 'aria-hidden': 'true' }, '✏️'),
          ' For grown-ups: add a note'
        ),
      ];
    }
    keepFocus(box, () => box.replaceChildren(...kids), () => box.querySelector('select, textarea, button'));
  }

  // Inside the 10 minutes of a pass (here or before Google sign-in) the
  // field opens at once; otherwise the gate comes first, or, while a "not
  // now" holds, only its gentle message (closing the card doesn't reset it).
  function noteTapped() {
    const fb = state.fb;
    if (!fb || fb.sending) return;
    play('click');
    const step = gateNow();
    if (step === 'go') {
      fb.note = 'open';
      renderFeedbackNote(fb);
      focusFeedback('fb-comment');
      return;
    }
    fb.note = 'gate';
    fb.gate = newGate(step);
    renderFeedbackNote(fb);
    focusFeedback(gateFocusKey(fb.gate));
    if (fb.gate.step === 'notNow') sayFeedback(GATE_NOT_NOW_TEXT);
  }

  // Its ✕ (or Esc) puts the "add a note" link back. Answers whether it was open.
  function closeFeedbackGate() {
    const fb = state.fb;
    if (!fb || fb.note !== 'gate') return false;
    play('click');
    fb.note = 'closed';
    fb.gate = null;
    renderFeedbackNote(fb);
    focusFeedback('fb-note');
    return true;
  }

  // The message (if any) and Not now / Send, also while sending.
  function renderFeedbackFoot(fb = state.fb) {
    if (!fb || !fb.refs) return;
    const { foot, msg, fields, close } = fb.refs;
    const busy = !!fb.sending;
    fields.disabled = busy;
    close.setAttribute('aria-disabled', busy ? 'true' : 'false');
    msg.hidden = !fb.msg;
    msg.textContent = fb.msg ? fb.msg.text : '';
    msg.setAttribute('data-tone', fb.msg ? fb.msg.tone : '');
    const cancel = button('Not now', { variant: 'snow', key: 'fb-cancel', onClick: () => feedbackBack({ whole: true }) });
    const send = button(busy ? 'Sending…' : 'Send', {
      icon: busy ? '❄' : '📮',
      variant: 'red',
      key: 'fb-send',
      cls: busy ? 'is-busy' : '',
      onClick: () => sendFeedbackNow(),
    });
    if (busy) {
      cancel.setAttribute('aria-disabled', 'true');
      send.setAttribute('aria-disabled', 'true');
    }
    keepFocus(foot, () => foot.replaceChildren(cancel, send), () => send);
  }

  // Esc, ✕ and "Not now". Esc and ✕ close an open grown-ups gate first;
  // nothing closes the card while it is sending.
  function feedbackBack({ whole = false } = {}) {
    const fb = state.fb;
    if (!fb || fb.sending) return;
    if (!whole && closeFeedbackGate()) return;
    play('click');
    closeFeedback();
  }

  function closeFeedback({ focus = true } = {}) {
    const fb = state.fb;
    if (!fb) return;
    state.fb = null;
    fb.closed = true;
    if (fb.refs) fb.refs.modal.remove();
    stage.removeAttribute('inert');
    notice.removeAttribute('inert');
    if (focus) focusEl(stage.querySelector('[data-key="feedback"]') || stage.querySelector('[data-autofocus]'));
  }

  // Tab and Shift+Tab go round the card, never out to the screen beneath.
  function trapFeedbackTab(e) {
    const fb = state.fb;
    if (!fb || !fb.refs || typeof document === 'undefined') return;
    // :disabled also covers controls inside the fieldset disabled while sending
    const tabbable = [...fb.refs.card.querySelectorAll('button, input, textarea, select, a[href]')].filter(
      (n) => !n.matches(':disabled') && n.tabIndex >= 0 && n.getClientRects().length > 0
    );
    if (!tabbable.length) return;
    const first = tabbable[0];
    const last = tabbable[tabbable.length - 1];
    const active = document.activeElement;
    const inside = fb.refs.card.contains(active);
    if (e.shiftKey && (!inside || active === first)) {
      e.preventDefault();
      focusEl(last);
    } else if (!e.shiftKey && (!inside || active === last)) {
      e.preventDefault();
      focusEl(first);
    }
  }

  // Checks the picks, then hands them to the facade. A late answer still
  // lands (a success after the time-out still thanks the player), unless the
  // player has tried again since.
  function sendFeedbackNow() {
    const fb = state.fb;
    if (!fb || fb.sending) return;
    if (!fb.rating) return feedbackProblem(fb, 'stars', 'Please pick how many stars first.', 'fb-star-1');
    if (!fb.category) return feedbackProblem(fb, 'cats', 'Please pick what it is about.', `fb-cat-${FEEDBACK_CATEGORIES[0].id}`);
    const payload = {
      rating: fb.rating,
      category: fb.category,
      quick: FEEDBACK_QUICK.map((q) => q.id).filter((qid) => fb.quick.has(qid)),
      comment: fb.note === 'open' ? fb.comment : '',
      islandSeed: islandSeed(),
    };
    play('whoosh');
    const token = ++fb.seq;
    fb.sending = { token };
    fb.msg = null;
    renderFeedbackFoot(fb);
    sayFeedback('Sending your feedback…');
    const finish = (res, timedOut) => {
      if (fb.seq !== token) return;
      if (timedOut && !fb.sending) return; // answered in time
      fb.sending = null;
      if (res.ok) {
        setFeedbackLocked(true);
        if (!fb.closed) closeFeedback();
        if (state.current === 'title' || state.current === 'results') {
          showToast(FEEDBACK_TOAST);
          play('jingle');
        }
        return;
      }
      if (fb.closed) return; // the card is gone, and the player can try again later
      fb.msg = { tone: 'error', text: feedbackErrorText(res.error, timedOut) };
      play('error');
      renderFeedbackFoot(fb);
      sayFeedback(fb.msg.text);
    };
    authLater(() => finish({ ok: false, error: 'timeout' }, true), FEEDBACK_TIMEOUT_MS);
    whenDone(cloudCall('sendFeedback', payload), (res) => finish(res, false));
  }

  // Something required isn't picked yet: say so, mark the group, focus it.
  function feedbackProblem(fb, group, text, key) {
    fb.msg = { tone: 'info', text };
    fb.refs[group].setAttribute('data-missing', '');
    restartAnim(fb.refs[group], 'is-nudge');
    play('error');
    renderFeedbackFoot(fb);
    focusFeedback(key);
    sayFeedback(text);
  }

  function showToast(text) {
    if (state.toastTimer) clearTimeout(state.toastTimer);
    toast.replaceChildren(h('span', { class: 'scr-toast__bubble' }, text));
    state.toastTimer = setTimeout(hideToast, TOAST_MS);
  }

  function hideToast() {
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = null;
    toast.replaceChildren();
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
      keyHint('Esc = resume')
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

    const tap = touch();
    const controls = Array.isArray(deps.controls) && deps.controls.length ? deps.controls : controlsList(tap);
    const coins = RARITY_COINS || { common: 5, rare: 10, legendary: 25 };
    const key = (k) => h('kbd', { class: 'scr-key' }, k);

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
              { class: 'scr-keys__caps', 'aria-hidden': c.quiet ? 'true' : null },
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
          h('p', null, 'Waddle up to a cracker and ', tap ? 'tap' : ['press ', key('E'), ' or tap'], '. BANG! Out pops a joke for your Gallery, plus coins:'),
          h(
            'div',
            { class: 'scr-rarities' },
            h('span', { class: 'scr-rar scr-rar--common' }, 'Common ', coin(), ` ${coins.common}`),
            h('span', { class: 'scr-rar scr-rar--rare' }, 'Rare ', coin(), ` ${coins.rare}`),
            h('span', { class: 'scr-rar scr-rar--legendary' }, 'Legendary ', coin(), ` ${coins.legendary}`)
          ),
          h('p', null, "Rainbow crackers are the legendary ones, and they hold Santa's Secret Notes!")
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
        ),
        note(
          'scr-tint--sky',
          '🍬',
          'Candy and pets',
          h(
            'p',
            null,
            tap ? 'Waddle up to a little candy cane in the snow and tap' : ['Press ', key('E'), ' or tap at a little candy cane in the snow'],
            ', or belly-slide through it. Spend your candy in the Workshop on new pets, and feed them to make them better friends.'
          )
        ),
        note(
          'scr-tint--butter',
          '🎄',
          'Baubles',
          h(
            'p',
            null,
            tap ? 'Waddle up to a pine tree or a lollipop tree and tap to shake it' : ['Press ', key('E'), ' or tap by a pine tree or a lollipop tree to shake it'],
            ', or slide into it. Sometimes a bauble falls out! Hang your baubles on your tree in the Wardrobe.'
          )
        ),
        isAdventTime(today())
          ? note('scr-tint--lilac', '🍫', 'Advent Calendar', h('p', null, 'Open a new door on the title screen every day in December. Missed one? It stays ready until the 31st.'))
          : null
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

  // Redraws the title for refresh(): a note from a sign-in that just
  // finished stays, and so do keyboard focus (every title control is keyed)
  // and the scroll position on short screens, since the cloud can merge
  // progress in at any moment, e.g. on the first sync after boot.
  function rebuildTitle() {
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const key = active && stage.contains(active) && active.getAttribute ? active.getAttribute('data-key') : null;
    const top = stage.scrollTop;
    open('title', buildTitle, { rebuild: true });
    stage.scrollTop = top;
    if (key) focusEl(stage.querySelector(`[data-key="${key}"]`));
  }

  function refresh() {
    switch (state.current) {
      case 'title':
        rebuildTitle();
        break;
      case 'results':
        if (state.lastSummary) renderResults(state.lastSummary, true);
        break;
      case 'shop':
        if (state.shop) keepFocus(state.shop.panel, renderShopPanel, () => state.shop.tabs.querySelector('[aria-selected="true"]'));
        break;
      case 'advent':
        syncAdvent();
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
      case 'leaderboard':
        refreshLeaderboard();
        break;
      case 'privacy':
        renderPrivacyDelete();
        break;
      default:
        break;
    }
  }

  // main.js calls this from pwa.onChange (src/core/pwa.js): the notice and
  // the title's install link are patched in place, keeping focus.
  function pwaChanged() {
    try {
      renderNotice();
      if (state.current === 'title' && resetArea && !state.confirmReset && !state.homeHelp && resetArea.getAttribute('data-install') !== installKind()) {
        keepFocus(resetArea, renderResetArea, () => resetArea.querySelector('[data-key="privacy"]'));
      }
    } catch (err) {
      console.error('[screens] pwaChanged failed', err);
    }
  }

  // main.js calls this from the cloud's onStatus. It only patches words and
  // the account card in place: no rebuild, no focus change.
  function cloudChanged() {
    try {
      if (state.current === 'title') {
        renderCloudChip();
        renderTitleAuth();
      } else if (state.current === 'leaderboard') leaderboardStatusChanged();
      // a delete waiting for Google (or done in another tab), or the cloud got ready
      else syncPrivacyDelete();
    } catch (err) {
      console.error('[screens] cloudChanged failed', err);
    }
  }

  function destroy() {
    hideAll();
    for (const id of authTimers) clearTimeout(id);
    authTimers.clear();
    if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeyDown, true);
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', onMenuKeyGuard);
      document.removeEventListener('visibilitychange', onDayCheck);
    }
    el.remove();
  }

  return {
    showTitle,
    showResults,
    showShop,
    showAdvent,
    showGallery,
    showPause,
    showHelp,
    showLeaderboard,
    showPrivacy,
    hideAll,
    refresh,
    cloudChanged,
    pwaChanged,
    // Android's Back (src/core/back.js): what Esc does, and whether it does anything
    back: goBack,
    hasBack,
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
