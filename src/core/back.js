// Android's Back button, and a browser's own Back (or Safari's swipe back).
// In the Play app (a Trusted Web Activity: Chrome running the live site) Back
// walks back through the page's history and closes the app when there is
// none, so one press mid-night used to close the game and lose the night.
//
// So while Back has something to do in the game, a few extra history entries
// sit on top of the page's own: the same URL (pushState with a state object
// only, never a path, hash or query, so the address bar never changes). Each
// Back takes one away, and the game does what the screen's own Back, close or
// pause button does instead. On the plain title they are all taken away (one
// history.go(), whose popstate is ours and does nothing), so the next Back
// leaves the game at once, as before.
//
// Chrome (and so the Play app) guards against pages that trap people with
// Back, its "history manipulation intervention": if a page adds an entry when
// the player hasn't touched it since the browser's last Back or Forward,
// every entry of the page is skipped by Back until the next touch, and with
// nothing left to go back to the Play app closes. So entries only go on after
// a touch that Chrome counts too (see activates()), never straight after a
// Back, and five at once, enough for several Backs in a row; the next touch
// tops them up.
//
// Firefox has a rule of its own: Back skips any entry the player never
// touched while it was the one showing, so of five entries added at once it
// would skip four. It doesn't mind entries added without a touch, though, so
// there one entry is used and put back straight after every Back.
//
// main.js calls sync() every frame, which covers every way the game moves
// between screens (buttons, Esc, the night ending, a cloud merge redrawing a
// screen) without each of them having to say so.

// The mark on our entries' history.state: how far up the stack each one is
// (1 for the lowest), so a popstate says whether it was Back or Forward.
export const GUARD_KEY = 'pipsHuntBack';
// Backs in a row that stay in the game with no touch in between. Five lets
// Back pause, resume, pause, resume and pause again mid-night.
export const GUARD_DEPTH = 5;
// Our own history.go() is normally answered at once; if no popstate ever
// comes, the guard looks again after this long.
const LEAVE_TIMEOUT_MS = 2000;
// The input the guard listens to, to tell when the player touched the game.
const INPUT_EVENTS = ['pointerdown', 'pointercancel', 'pointerup', 'mousedown', 'click', 'keydown'];
// Keys that never count as a touch, as in Chrome.
const MODIFIER_KEYS = new Set([
  'Alt', 'AltGraph', 'CapsLock', 'Control', 'Fn', 'FnLock', 'Hyper', 'Meta', 'NumLock',
  'OS', 'ScrollLock', 'Shift', 'Super', 'Symbol', 'SymbolLock',
]);

// What a Back press does right now, from what is on screen:
//   card    a joke card or a new reward is up: what its Next / close does
//   menu    a menu, or a question over the title (the grown-ups gate, the
//           feedback card, a confirm step): the menu's own Back, as Esc
//   playing a night is running with nothing over it: the pause menu opens
// 'card', 'menu', 'pause', or null for the plain title, where Back leaves.
export function backAction({ card = false, menu = false, playing = false } = {}) {
  if (card) return 'card';
  if (menu) return 'menu';
  if (playing) return 'pause';
  return null;
}

// How far up our stack a history.state is: 0 for anything not ours.
export function guardDepth(state) {
  if (!state || typeof state !== 'object') return 0;
  const n = state[GUARD_KEY];
  return Number.isInteger(n) && n > 0 ? n : 0;
}

// Whether a history.state is one of our entries.
export function isGuard(state) {
  return guardDepth(state) > 0;
}

// Whether an input event is one Chrome counts as the player touching the page
// (user activation). It is careful: missing one only means the entries wait
// for the next touch, but counting one Chrome doesn't makes Back leave.
//   - a finger or pen lifted (pointerup). A finger that scrolled or swiped
//     gets pointercancel and no pointerup, and doesn't count; createBackGuard
//     also drops a lift while another finger of the same touch was cancelled.
//   - a mouse button pressed (mousedown), or a click (a screen reader's tap)
//   - a key pressed, but not Esc, not a modifier on its own (Shift, Ctrl, Alt
//     and the like), and not with Ctrl, Alt or Cmd held (a browser shortcut)
// Never a touchend: it comes after a swipe too.
export function activates(e) {
  if (!e || e.isTrusted === false) return false;
  switch (e.type) {
    case 'pointerup':
      return e.pointerType !== 'mouse'; // a mouse counted on mousedown
    case 'mousedown':
    case 'click':
      return true;
    case 'keydown':
      return e.key !== 'Escape' && e.key !== 'Esc' && !MODIFIER_KEYS.has(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey;
    default:
      return false;
  }
}

// Whether this browser skips history entries the player never touched while
// they were showing (Firefox, and other browsers built on its Gecko engine).
export function skipsUntouchedEntries(win) {
  try {
    const ua = String((win && win.navigator && win.navigator.userAgent) || '');
    return /\bGecko\/\d/.test(ua) && /\bFirefox\/\d/.test(ua);
  } catch {
    return false;
  }
}

// createBackGuard({ read, act, win }): read() describes the game for
// backAction(), act(action) carries out a Back press. Never throws; without
// a History API it does nothing, and Back works as it always did.
// (firefox overrides the check for Firefox's rule, for tests.)
export function createBackGuard({ read, act, win = typeof window !== 'undefined' ? window : null, firefox } = {}) {
  const history = win ? win.history : null;
  if (!history || typeof history.pushState !== 'function' || typeof win.addEventListener !== 'function') {
    return { sync() {}, dispose() {}, get armed() { return false; }, get depth() { return 0; } };
  }

  // Firefox: one entry, put back at once after every Back (see the top)
  const oneEntry = firefox === undefined ? skipsUntouchedEntries(win) : !!firefox;
  const most = oneEntry ? 1 : GUARD_DEPTH;

  let leaving = false; // our own history.go() is on its way
  let leaveTimer = null;
  // The player has touched the game since the last Back or Forward (ours
  // included), so Chrome will keep an entry added now.
  let touched = false;
  // Fingers on the screen now, and whether one of them was cancelled (a
  // swipe or a scroll), as Chrome tracks it: no lift of that touch counts.
  const fingers = new Set();
  let cancelled = false;
  // The depth of the entry the page is on, as far as the last popstate or
  // push said. A popstate lower than this was a Back press.
  let at = here();

  function here() {
    try {
      return guardDepth(history.state);
    } catch {
      return 0;
    }
  }

  function want() {
    try {
      return backAction(read ? read() : null) !== null;
    } catch (err) {
      console.error('[back] read failed', err);
      return false;
    }
  }

  // Whether an entry added now would be kept. Where the browser can say if
  // the page has user activation right now, it must agree too.
  function mayAdd() {
    if (oneEntry) return true;
    if (!touched) return false;
    try {
      const ua = win.navigator && win.navigator.userActivation;
      if (ua && typeof ua.isActive === 'boolean') return ua.isActive;
    } catch {
      // no way to ask: the touch is enough
    }
    return true;
  }

  // Tops the entries up, or takes them all away, to match what is on screen.
  function sync() {
    if (leaving) return; // wait for our own go() to land first
    const wanted = want();
    const depth = here();
    try {
      if (wanted) {
        if (depth < most && mayAdd()) {
          // each push drops whatever Back had left ahead of this one
          for (let n = depth + 1; n <= most; n++) history.pushState({ [GUARD_KEY]: n }, '');
          at = most;
        }
      } else if (depth > 0) {
        leaving = true;
        touched = false; // to be safe, as after any step back
        leaveTimer = setTimeout(() => {
          leaveTimer = null;
          leaving = false;
          sync();
        }, LEAVE_TIMEOUT_MS);
        history.go(-depth);
      }
    } catch (err) {
      console.warn('[back] history change failed', err);
    }
  }

  function onPopState(e) {
    touched = false; // a Back or Forward: Chrome wants a new touch before adding
    const depth = guardDepth(e && e.state);
    const from = at;
    at = depth;
    if (leaving) {
      // the pop we asked for: no Back press, just the entries gone
      leaving = false;
      clearTimeout(leaveTimer);
      leaveTimer = null;
      sync();
      return;
    }
    // Back took one of our entries away (or more, from a browser's history
    // list): one press, one step. Forward onto an old one of ours asks for
    // nothing, and sync() takes it away again if it isn't wanted.
    if (depth < from) {
      let action = null;
      try {
        action = backAction(read ? read() : null);
      } catch (err) {
        console.error('[back] read failed', err);
      }
      if (action) {
        try {
          act?.(action);
        } catch (err) {
          console.error('[back] Back failed', err);
        }
      }
    }
    sync();
  }

  function onInput(e) {
    if (!e || e.isTrusted === false) return;
    if (e.pointerType && e.pointerType !== 'mouse' && e.type !== 'click') {
      if (e.type === 'pointerdown') {
        if (!fingers.size) cancelled = false; // a new touch
        fingers.add(e.pointerId);
        return;
      }
      if (e.type === 'pointercancel') {
        cancelled = true;
        fingers.delete(e.pointerId);
        return;
      }
      if (e.type === 'pointerup') {
        fingers.delete(e.pointerId);
        if (cancelled) return;
      }
    }
    if (activates(e)) touched = true;
  }

  // Entries of ours can still be on top from before a reload (or from a phone
  // that put the app away and reloaded it on the way back). They stay marked:
  // the game starts on the title, so the first sync() takes them away like
  // any others, and the next Back leaves at once. (Unmarked, they swallowed
  // Backs silently.) Chrome treats that step back as the same page, so nothing
  // loads; a browser that loaded the page again would find a plain entry
  // there, so that happens once, never in a loop.
  win.addEventListener('popstate', onPopState);
  // capture, so a screen that stops the event can't hide the touch
  for (const type of INPUT_EVENTS) win.addEventListener(type, onInput, true);

  return {
    sync,
    dispose() {
      clearTimeout(leaveTimer);
      win.removeEventListener('popstate', onPopState);
      for (const type of INPUT_EVENTS) win.removeEventListener(type, onInput, true);
    },
    // one of our entries is the current one (for tests and debugging)
    get armed() {
      return here() > 0;
    },
    // how many Backs in a row stay in the game from here
    get depth() {
      return here();
    },
  };
}
