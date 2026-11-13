// Android's Back button (src/core/back.js): what a Back press does on each
// screen, and the history entries that keep Back inside the game. The fake
// history below works like Chrome's: back() and go() land a moment later with
// a popstate, a push drops whatever was ahead, Back from the first entry
// leaves the page, and (Chrome's history manipulation intervention) once the
// page adds an entry with no user activation since the browser's last Back or
// Forward, Back skips every entry of the page until the next activation. Only
// what Chrome counts activates: a lifted finger that didn't swipe, a mouse
// press, a click, a key that isn't Esc or a modifier. With { rule: 'firefox' }
// it works like Firefox instead: Back skips any entry (but the first) that
// was never touched while it was showing. The real thing is checked in a
// browser too.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { GUARD_KEY, GUARD_DEPTH, backAction, guardDepth, isGuard, activates, skipsUntouchedEntries, createBackGuard } from '../src/core/back.js';

const URL = 'https://example.test/game/?debug=1&date=2026-12-07';
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
const INPUT = ['pointerdown', 'pointercancel', 'pointerup', 'touchend', 'mousedown', 'click', 'keydown', 'keyup'];
const MODIFIERS = ['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock'];

function fakeWindow({ entries = [{ state: null }], index = entries.length - 1, userActivation, rule = 'chrome' } = {}) {
  const popListeners = new Set();
  const inputListeners = new Map(INPUT.map((t) => [t, new Set()]));
  const calls = { push: [], replace: [], go: [] };
  // Chrome's view: the page has had user activation since the last Back or
  // Forward; and its own record of a touch whose finger was cancelled
  let active = false;
  let fingers = 0;
  let cancelled = false;
  const history = {
    entries: entries.map((e) => ({ url: URL, skippable: false, touched: false, ...e })),
    index,
    left: false, // Back went past the first entry it may stop on: the game was left
    swallowGo: false, // our history.go() never lands (a broken browser)
    get state() {
      return this.entries[this.index].state;
    },
    get length() {
      return this.entries.length;
    },
    pushState(state, title, url) {
      calls.push.push([state, title, url]);
      // Chrome's intervention: a push with no activation marks every entry
      if (rule === 'chrome' && !active) for (const e of this.entries) e.skippable = true;
      this.entries.splice(this.index + 1);
      this.entries.push({ state: structuredClone(state), url: url === undefined ? this.entries[this.index].url : url, skippable: false, touched: false });
      this.index++;
    },
    replaceState(state, title, url) {
      calls.replace.push([state, title, url]);
      this.entries[this.index] = { ...this.entries[this.index], state: structuredClone(state) };
    },
    back() {
      this.go(-1);
    },
    go(delta) {
      calls.go.push(delta);
      if (!this.swallowGo) land(() => this.index + delta);
    },
  };
  // where a traversal goes is worked out when it lands, as in a browser; only
  // the browser's own Back or Forward makes Chrome forget the last activation
  function land(where, byBrowser) {
    setTimeout(() => {
      if (byBrowser) active = false;
      const to = where();
      if (to < 0) {
        history.left = true;
        return;
      }
      if (to >= history.entries.length) return;
      history.index = to;
      for (const fn of popListeners) fn({ state: history.state });
    }, 0);
  }
  // The Back button: skips the entries the browser's rule marks
  function backTarget() {
    let to = history.index - 1;
    if (rule === 'firefox') while (to > 0 && !history.entries[to].touched) to--;
    else while (to >= 0 && history.entries[to].skippable) to--;
    return to;
  }
  // Chrome's own reading of an input event (as in its source)
  function activatesInChrome(e) {
    const touch = e.pointerType && e.pointerType !== 'mouse';
    if (e.type === 'pointerdown' && touch) {
      if (!fingers++) cancelled = false;
      return false;
    }
    if (e.type === 'pointercancel') {
      fingers = Math.max(0, fingers - 1);
      cancelled = true;
      return false;
    }
    if (e.type === 'pointerup' && touch) {
      fingers = Math.max(0, fingers - 1);
      return !cancelled;
    }
    if (e.type === 'mousedown' || e.type === 'click') return true;
    if (e.type === 'keydown') return e.key !== 'Escape' && !MODIFIERS.includes(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey;
    return false;
  }
  function fire(type, extra = {}) {
    const e = { type, isTrusted: true, ...extra };
    if (activatesInChrome(e)) {
      active = true;
      for (const entry of history.entries) entry.skippable = false; // an activation clears the marks
      history.entries[history.index].touched = true; // Firefox's mark
    }
    for (const fn of inputListeners.get(type)) fn(e);
  }
  return {
    history,
    calls,
    navigator: userActivation ? { userActivation } : undefined,
    addEventListener: (type, fn) => (type === 'popstate' ? popListeners.add(fn) : inputListeners.get(type)?.add(fn)),
    removeEventListener: (type, fn) => (type === 'popstate' ? popListeners.delete(fn) : inputListeners.get(type)?.delete(fn)),
    // the phone's Back button, or the browser's Back and Forward
    userBack: () => land(backTarget, true),
    userForward: () => land(() => history.index + 1, true),
    // a finger down and lifted (then the click it makes)
    tap: () => {
      fire('pointerdown', { pointerType: 'touch', pointerId: 1 });
      fire('pointerup', { pointerType: 'touch', pointerId: 1 });
      fire('click', { pointerType: 'touch', pointerId: 1 });
    },
    // a finger dragged across a menu: the browser scrolls, so no pointerup
    swipe: () => {
      fire('pointerdown', { pointerType: 'touch', pointerId: 2 });
      fire('pointercancel', { pointerType: 'touch', pointerId: 2 });
      fire('touchend');
    },
    key: (key, mods = {}) => fire('keydown', { key, ...mods }),
    fire,
    guards: () => history.entries.filter((e) => isGuard(e.state)).length,
    skipped: () => history.entries.filter((e) => e.skippable).length,
  };
}

// A small stand-in for the game: which screen is up, and what each Back does.
function fakeGame(win, opts = {}) {
  const game = { screen: 'title', playing: false, card: false, question: false };
  const acts = [];
  const read = () => ({
    card: game.card,
    menu: game.screen !== null && (game.screen !== 'title' || game.question),
    playing: game.playing,
  });
  const act = (action) => {
    acts.push(action);
    if (action === 'card') game.card = false;
    else if (action === 'pause') {
      game.playing = false;
      game.screen = 'pause';
    } else if (action === 'menu') {
      if (game.screen === 'pause') {
        game.screen = null;
        game.playing = true;
      } else if (game.screen === 'help') game.screen = 'pause';
      else if (game.screen === 'title') game.question = false;
      else game.screen = 'title';
    }
  };
  const guard = createBackGuard({ read, act, win, ...opts });
  // the Start Night button: a tap, then the night
  const startNight = () => {
    win.tap();
    game.screen = null;
    game.playing = true;
  };
  return { game, acts, guard, startNight };
}

describe('backAction', () => {
  it('leaves the game from the plain title', () => {
    expect(backAction({})).toBeNull();
    expect(backAction()).toBeNull();
    expect(backAction({ card: false, menu: false, playing: false })).toBeNull();
  });

  it('pauses a running night', () => {
    expect(backAction({ playing: true })).toBe('pause');
  });

  it("gives a menu, or a question over the title, the menu's own Back", () => {
    expect(backAction({ menu: true })).toBe('menu');
  });

  it('closes a card first, over everything', () => {
    expect(backAction({ card: true, playing: true })).toBe('card');
    expect(backAction({ card: true, menu: true, playing: true })).toBe('card');
    expect(backAction({ menu: true, playing: true })).toBe('menu');
  });
});

describe('guardDepth and isGuard', () => {
  it('know our entries and how far up each one is', () => {
    expect(guardDepth({ [GUARD_KEY]: 1 })).toBe(1);
    expect(guardDepth({ [GUARD_KEY]: GUARD_DEPTH })).toBe(GUARD_DEPTH);
    expect(isGuard({ [GUARD_KEY]: 3 })).toBe(true);
  });

  it('know nothing else', () => {
    for (const s of [null, undefined, {}, 'x', 1, { [GUARD_KEY]: 'yes' }, { [GUARD_KEY]: true }, { [GUARD_KEY]: 0 }, { [GUARD_KEY]: -2 }, { [GUARD_KEY]: 1.5 }, { other: 1 }]) {
      expect(guardDepth(s), JSON.stringify(s)).toBe(0);
      expect(isGuard(s), JSON.stringify(s)).toBe(false);
    }
  });
});

describe('activates', () => {
  it('counts what Chrome counts as the player touching the page', () => {
    expect(activates({ type: 'pointerup', pointerType: 'touch', isTrusted: true })).toBe(true);
    expect(activates({ type: 'pointerup', pointerType: 'pen' })).toBe(true);
    expect(activates({ type: 'mousedown', isTrusted: true })).toBe(true);
    expect(activates({ type: 'click', isTrusted: true })).toBe(true);
    expect(activates({ type: 'keydown', key: 'Enter', isTrusted: true })).toBe(true);
    expect(activates({ type: 'keydown', key: 'w' })).toBe(true);
    expect(activates({ type: 'keydown', key: ' ', shiftKey: true })).toBe(true);
  });

  it("doesn't count a touchend (a swipe ends with one too), Esc, modifier keys or shortcuts", () => {
    expect(activates({ type: 'touchend', isTrusted: true })).toBe(false);
    expect(activates({ type: 'pointercancel', pointerType: 'touch' })).toBe(false);
    expect(activates({ type: 'pointerdown', pointerType: 'touch', isTrusted: true })).toBe(false);
    expect(activates({ type: 'pointerup', pointerType: 'mouse' })).toBe(false); // counted on mousedown
    expect(activates({ type: 'keydown', key: 'Escape', isTrusted: true })).toBe(false);
    for (const key of MODIFIERS) expect(activates({ type: 'keydown', key }), key).toBe(false);
    expect(activates({ type: 'keydown', key: 'f', ctrlKey: true })).toBe(false);
    expect(activates({ type: 'keydown', key: 'ArrowLeft', altKey: true })).toBe(false);
    expect(activates({ type: 'keydown', key: 'r', metaKey: true })).toBe(false);
  });

  it("doesn't count made-up events, or nothing", () => {
    expect(activates({ type: 'keyup', key: 'Enter', isTrusted: true })).toBe(false);
    expect(activates({ type: 'click', isTrusted: false })).toBe(false);
    expect(activates(null)).toBe(false);
    expect(activates(undefined)).toBe(false);
  });
});

describe('skipsUntouchedEntries', () => {
  const win = (userAgent) => ({ navigator: { userAgent } });
  it('knows Firefox, on a computer and on Android', () => {
    expect(skipsUntouchedEntries(win('Mozilla/5.0 (X11; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0'))).toBe(true);
    expect(skipsUntouchedEntries(win('Mozilla/5.0 (Android 14; Mobile; rv:135.0) Gecko/135.0 Firefox/135.0'))).toBe(true);
  });

  it('leaves Chrome, the Play app, Safari and Firefox on iPhone (Safari underneath) alone', () => {
    expect(skipsUntouchedEntries(win('Mozilla/5.0 (Linux; Android 14; 22101316UG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36'))).toBe(false);
    expect(skipsUntouchedEntries(win('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'))).toBe(false);
    expect(skipsUntouchedEntries(win('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/135.0 Mobile/15E148 Safari/605.1.15'))).toBe(false);
    expect(skipsUntouchedEntries(null)).toBe(false);
    expect(skipsUntouchedEntries({})).toBe(false);
  });
});

describe('the Back guard', () => {
  afterEach(() => vi.useRealTimers());

  it('adds nothing on the plain title, so Back leaves the game', async () => {
    const win = fakeWindow();
    const { acts, guard } = fakeGame(win);
    win.tap();
    guard.sync();
    expect(win.history.length).toBe(1);
    win.userBack();
    await tick();
    expect(win.history.left).toBe(true);
    expect(acts).toEqual([]);
  });

  it('adds its entries after a tap, numbered, with the same URL', () => {
    const win = fakeWindow();
    const { guard, startNight } = fakeGame(win);
    startNight();
    guard.sync();
    guard.sync();
    guard.sync();
    expect(win.history.length).toBe(1 + GUARD_DEPTH);
    expect(win.calls.push).toHaveLength(GUARD_DEPTH);
    expect(win.calls.push.map(([s]) => guardDepth(s))).toEqual(Array.from({ length: GUARD_DEPTH }, (_, i) => i + 1));
    // a state object only: never a new path, hash or query
    for (const [, , url] of win.calls.push) expect(url).toBeUndefined();
    for (const e of win.history.entries) expect(e.url).toBe(URL);
    expect(guard.armed).toBe(true);
    expect(guard.depth).toBe(GUARD_DEPTH);
  });

  it('adds nothing until the player has touched the game', () => {
    const win = fakeWindow();
    const { game, guard } = fakeGame(win);
    game.screen = 'results'; // say, reached with no tap at all
    guard.sync();
    expect(win.calls.push).toHaveLength(0);
    win.key('Escape'); // Esc gives no activation
    win.fire('pointerdown'); // nor does a finger going down
    guard.sync();
    expect(win.calls.push).toHaveLength(0);
    win.key('Enter');
    guard.sync();
    expect(win.calls.push).toHaveLength(GUARD_DEPTH);
  });

  // The tester's report, M-03, and the re-test: Back, Back, Back without
  // touching the screen. Putting an entry back straight after each Back got
  // every entry skipped in Chrome, and the second Back closed the app.
  it('pauses, resumes and pauses again on Back after Back with no tap, and stays in the game', async () => {
    const win = fakeWindow();
    const { game, acts, guard, startNight } = fakeGame(win);
    startNight();
    guard.sync();
    for (let i = 0; i < GUARD_DEPTH; i++) {
      win.userBack();
      await tick();
      guard.sync();
    }
    expect(acts).toEqual(['pause', 'menu', 'pause', 'menu', 'pause']);
    expect(game.screen).toBe('pause');
    expect(win.history.left).toBe(false);
    expect(win.skipped()).toBe(0);
    expect(win.calls.push).toHaveLength(GUARD_DEPTH); // none added without a tap
  });

  // The second review: a finger dragged on the pause menu (the browser
  // scrolls, so pointercancel and touchend, no pointerup) gives Chrome no
  // activation. Counting it added entries Chrome then skipped, and the very
  // next Back closed the app.
  it('takes a swipe for no touch, so Back after it still resumes', async () => {
    const win = fakeWindow();
    const { game, acts, guard, startNight } = fakeGame(win);
    startNight();
    guard.sync();
    win.userBack();
    await tick();
    guard.sync();
    expect(game.screen).toBe('pause');
    win.swipe();
    guard.sync();
    expect(guard.depth).toBe(GUARD_DEPTH - 1);
    win.userBack();
    await tick();
    expect(acts).toEqual(['pause', 'menu']);
    expect(game.playing).toBe(true);
    expect(win.history.left).toBe(false);
    expect(win.skipped()).toBe(0);
  });

  it("takes no lift of a touch with a cancelled finger, as Chrome doesn't", async () => {
    const win = fakeWindow();
    const { guard, startNight } = fakeGame(win);
    startNight();
    guard.sync();
    win.userBack();
    await tick();
    win.fire('pointerdown', { pointerType: 'touch', pointerId: 5 });
    win.fire('pointerdown', { pointerType: 'touch', pointerId: 6 });
    win.fire('pointercancel', { pointerType: 'touch', pointerId: 5 });
    win.fire('pointerup', { pointerType: 'touch', pointerId: 6 });
    guard.sync();
    expect(guard.depth).toBe(GUARD_DEPTH - 1);
    expect(win.skipped()).toBe(0);
    win.tap(); // a new touch counts again
    guard.sync();
    expect(guard.depth).toBe(GUARD_DEPTH);
    expect(win.skipped()).toBe(0);
  });

  it('takes Shift, Ctrl or Alt alone, or a shortcut, for no touch', async () => {
    const win = fakeWindow();
    const { guard, startNight } = fakeGame(win);
    startNight();
    guard.sync();
    win.userBack();
    await tick();
    for (const key of MODIFIERS) win.key(key);
    win.key('r', { ctrlKey: true });
    guard.sync();
    expect(guard.depth).toBe(GUARD_DEPTH - 1);
    expect(win.skipped()).toBe(0);
    win.key(' '); // the slide key itself counts
    guard.sync();
    expect(guard.depth).toBe(GUARD_DEPTH);
    expect(win.skipped()).toBe(0);
  });

  it('tops its entries up again on the next tap', async () => {
    const win = fakeWindow();
    const { guard, startNight } = fakeGame(win);
    startNight();
    guard.sync();
    win.userBack();
    await tick();
    win.userBack();
    await tick();
    guard.sync();
    expect(guard.depth).toBe(GUARD_DEPTH - 2);
    win.tap(); // Resume, say
    guard.sync();
    expect(guard.depth).toBe(GUARD_DEPTH);
    expect(win.history.length).toBe(1 + GUARD_DEPTH);
    expect(win.skipped()).toBe(0);
  });

  it('leaves once every entry is used up with no tap at all (the limit)', async () => {
    const win = fakeWindow();
    const { acts, guard, startNight } = fakeGame(win);
    startNight();
    guard.sync();
    for (let i = 0; i <= GUARD_DEPTH; i++) {
      win.userBack();
      await tick();
      guard.sync();
    }
    expect(acts).toHaveLength(GUARD_DEPTH);
    expect(win.history.left).toBe(true);
  });

  it('asks the browser too, where it can say whether the page has activation', () => {
    const userActivation = { isActive: false };
    const win = fakeWindow({ userActivation });
    const { guard, startNight } = fakeGame(win);
    startNight();
    guard.sync();
    expect(win.calls.push).toHaveLength(0);
    userActivation.isActive = true;
    guard.sync();
    expect(win.calls.push).toHaveLength(GUARD_DEPTH);
  });

  it('goes from a screen opened on the pause menu back to the pause menu', async () => {
    const win = fakeWindow();
    const { game, acts, guard } = fakeGame(win);
    win.tap();
    game.screen = 'help';
    guard.sync();
    win.userBack();
    await tick();
    expect(acts).toEqual(['menu']);
    expect(game.screen).toBe('pause');
    expect(guard.armed).toBe(true);
  });

  it('closes a card with its own close, and the night goes on', async () => {
    const win = fakeWindow();
    const { game, acts, guard, startNight } = fakeGame(win);
    startNight();
    game.card = true;
    guard.sync();
    win.userBack();
    await tick();
    expect(acts).toEqual(['card']);
    expect(game.card).toBe(false);
    expect(game.playing).toBe(true);
    expect(guard.armed).toBe(true);
  });

  it('closes a question over the title, then lets the next Back leave', async () => {
    const win = fakeWindow();
    const { game, acts, guard } = fakeGame(win);
    win.tap();
    game.question = true; // the grown-ups gate, say
    guard.sync();
    expect(guard.armed).toBe(true);
    win.userBack();
    await tick();
    expect(acts).toEqual(['menu']);
    expect(win.calls.go).toEqual([-(GUARD_DEPTH - 1)]); // the rest taken away in one go
    await tick();
    expect(guard.armed).toBe(false);
    expect(win.history.index).toBe(0);
    win.userBack();
    await tick();
    expect(win.history.left).toBe(true);
    expect(acts).toEqual(['menu']);
  });

  it('takes the entries away when a button goes back to the title, and that pop is no Back', async () => {
    const win = fakeWindow();
    const { game, acts, guard } = fakeGame(win);
    win.tap();
    game.screen = 'results';
    guard.sync();
    win.tap();
    game.screen = 'title'; // the Title button
    guard.sync();
    expect(win.calls.go).toEqual([-GUARD_DEPTH]);
    await tick();
    guard.sync();
    expect(acts).toEqual([]);
    expect(win.history.index).toBe(0);
    expect(guard.armed).toBe(false);
    // so the very next Back leaves the game
    win.userBack();
    await tick();
    expect(win.history.left).toBe(true);
  });

  it('waits for its own pop to land, then for a new tap, before adding entries again', async () => {
    const win = fakeWindow();
    const { game, acts, guard } = fakeGame(win);
    win.tap();
    game.screen = 'results';
    guard.sync();
    game.screen = 'title';
    guard.sync(); // history.go() on its way
    win.tap();
    game.screen = 'leaderboard'; // tapped before it landed
    guard.sync();
    guard.sync();
    expect(win.calls.push).toHaveLength(GUARD_DEPTH);
    await tick();
    expect(acts).toEqual([]); // not taken for a Back press
    guard.sync();
    expect(win.calls.push).toHaveLength(GUARD_DEPTH); // Chrome forgot that tap on the way back
    win.tap();
    guard.sync();
    expect(guard.depth).toBe(GUARD_DEPTH);
    expect(win.skipped()).toBe(0);
    win.userBack();
    await tick();
    expect(acts).toEqual(['menu']);
    expect(game.screen).toBe('title');
  });

  it('does one thing per press on a fast double Back, and never leaves mid-night', async () => {
    const win = fakeWindow();
    const { game, acts, guard, startNight } = fakeGame(win);
    startNight();
    guard.sync();
    win.userBack();
    win.userBack();
    await tick();
    expect(acts).toEqual(['pause', 'menu']);
    expect(game.playing).toBe(true);
    expect(win.history.left).toBe(false);
    expect(guard.armed).toBe(true);
  });

  it('never adds an entry Chrome would skip, and keeps at most its own few, whatever happens', async () => {
    const win = fakeWindow();
    const { game, guard, startNight } = fakeGame(win);
    const steps = [
      () => startNight(),
      () => win.userBack(),
      () => win.userBack(),
      () => win.userBack(),
      () => win.tap(),
      () => {
        game.playing = false;
        game.screen = 'results'; // the night ended
      },
      () => win.userBack(), // to the title
      () => {
        win.tap();
        game.screen = 'shop';
      },
      () => win.userForward(),
      () => win.userBack(),
      () => {
        win.tap();
        game.screen = 'title';
      },
      () => {
        win.tap();
        game.question = true;
      },
      () => win.userBack(),
      () => startNight(),
      () => (game.card = true),
      () => win.userBack(),
      () => win.userBack(),
      () => win.key('Escape'),
      () => win.userBack(),
      () => win.tap(),
      () => win.userBack(),
      () => win.swipe(),
      () => win.userBack(),
      () => win.key('Shift'),
      () => win.userBack(),
      () => win.tap(),
      () => win.userBack(),
    ];
    for (const step of steps) {
      step();
      guard.sync();
      await tick();
      guard.sync();
      await tick();
      guard.sync();
      expect(win.skipped()).toBe(0);
      expect(win.guards()).toBeLessThanOrEqual(GUARD_DEPTH);
    }
    expect(win.history.left).toBe(false);
  });

  it('does nothing on Forward onto an old entry, and takes it away again', async () => {
    const win = fakeWindow();
    const { game, acts, guard } = fakeGame(win);
    win.tap();
    game.screen = 'results';
    guard.sync();
    win.userBack(); // Results' Back: to the title
    await tick();
    expect(game.screen).toBe('title');
    await tick();
    expect(win.history.index).toBe(0);
    win.userForward();
    await tick();
    await tick();
    expect(acts).toEqual(['menu']);
    expect(win.history.index).toBe(0);
    expect(guard.armed).toBe(false);
  });

  it('does nothing on Forward between its own entries', async () => {
    const win = fakeWindow();
    const { acts, guard, startNight } = fakeGame(win);
    startNight();
    guard.sync();
    win.userBack();
    await tick();
    expect(acts).toEqual(['pause']);
    win.userForward();
    await tick();
    expect(acts).toEqual(['pause']);
    expect(guard.depth).toBe(GUARD_DEPTH);
  });

  // A reload mid-night starts on the title with our entries still on top.
  // Unmarking them there used to swallow the next Back without a word.
  it('takes away entries left from before a reload, so one Back then leaves', async () => {
    const win = fakeWindow({ entries: [{ state: null }, { state: { [GUARD_KEY]: 1 } }, { state: { [GUARD_KEY]: 2 } }, { state: { [GUARD_KEY]: 3 } }] });
    const { acts, guard } = fakeGame(win);
    guard.sync();
    expect(win.calls.go).toEqual([-3]);
    await tick();
    expect(win.history.index).toBe(0);
    expect(acts).toEqual([]);
    win.tap();
    guard.sync();
    expect(win.calls.push).toHaveLength(0);
    expect(win.calls.replace).toHaveLength(0);
    win.userBack();
    await tick();
    expect(win.history.left).toBe(true);
    expect(acts).toEqual([]);
  });

  it('keeps entries left from before a reload when Back has something to do', async () => {
    const win = fakeWindow({ entries: [{ state: null }, { state: { [GUARD_KEY]: 1 } }, { state: { [GUARD_KEY]: 2 } }] });
    const { game, acts, guard } = fakeGame(win);
    game.question = true; // something open over the title as the game starts
    guard.sync();
    expect(win.calls.go).toHaveLength(0);
    expect(win.calls.push).toHaveLength(0);
    expect(guard.depth).toBe(2);
    win.userBack();
    await tick();
    expect(acts).toEqual(['menu']);
    expect(win.history.left).toBe(false);
  });

  it('looks again if its own pop never lands', () => {
    vi.useFakeTimers();
    const win = fakeWindow();
    const { game, guard } = fakeGame(win);
    win.tap();
    game.screen = 'results';
    guard.sync();
    win.history.swallowGo = true;
    game.screen = 'title';
    guard.sync();
    guard.sync();
    expect(win.calls.go).toHaveLength(1);
    vi.advanceTimersByTime(2500);
    expect(win.calls.go).toHaveLength(2);
  });

  it('never throws, whatever read and act do', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const win = fakeWindow();
    let broken = true;
    const guard = createBackGuard({
      read: () => {
        if (broken) throw new Error('read');
        return { playing: true };
      },
      act: () => {
        throw new Error('act');
      },
      win,
    });
    win.tap();
    expect(() => guard.sync()).not.toThrow();
    expect(win.history.length).toBe(1);
    broken = false;
    guard.sync();
    win.userBack();
    await tick();
    expect(guard.armed).toBe(true);
    quiet.mockRestore();
  });

  it('does nothing without a History API', () => {
    for (const win of [null, {}, { history: {} }]) {
      const guard = createBackGuard({ read: () => ({ playing: true }), act: () => {}, win });
      expect(() => guard.sync()).not.toThrow();
      expect(guard.armed).toBe(false);
      expect(guard.depth).toBe(0);
      expect(() => guard.dispose()).not.toThrow();
    }
  });

  it('stops listening once disposed', async () => {
    const win = fakeWindow();
    const { acts, guard, startNight } = fakeGame(win);
    startNight();
    guard.sync();
    guard.dispose();
    win.userBack();
    await tick();
    expect(acts).toEqual([]);
  });

  it('hears no taps once disposed', () => {
    const win = fakeWindow();
    const { game, guard } = fakeGame(win);
    guard.dispose();
    win.tap();
    game.screen = 'results';
    guard.sync();
    expect(win.calls.push).toHaveLength(0);
  });
});

// Firefox skips, on Back, every entry the player never touched while it was
// showing: of five added at once it would skip four. So there the guard keeps
// one, put back straight after every Back (Firefox doesn't mind that).
describe('the Back guard in Firefox', () => {
  it('shows what five entries at once would do there: the second Back leaves', async () => {
    const win = fakeWindow({ rule: 'firefox' });
    const { acts, guard, startNight } = fakeGame(win, { firefox: false });
    startNight();
    guard.sync();
    win.userBack();
    await tick();
    guard.sync();
    win.userBack();
    await tick();
    expect(acts).toEqual(['pause']);
    expect(win.history.left).toBe(true);
  });

  it('keeps one entry and puts it back after every Back, with no touch needed', async () => {
    const win = fakeWindow({ rule: 'firefox' });
    const { game, acts, guard, startNight } = fakeGame(win, { firefox: true });
    startNight();
    guard.sync();
    expect(guard.depth).toBe(1);
    for (let i = 0; i < 8; i++) {
      win.userBack();
      await tick();
      guard.sync();
      expect(guard.depth).toBe(1);
    }
    expect(acts).toEqual(['pause', 'menu', 'pause', 'menu', 'pause', 'menu', 'pause', 'menu']);
    expect(game.playing).toBe(true);
    expect(win.history.left).toBe(false);
    expect(win.history.length).toBe(2);
  });

  it('still leaves from the plain title at once', async () => {
    const win = fakeWindow({ rule: 'firefox' });
    const { game, acts, guard } = fakeGame(win, { firefox: true });
    win.tap();
    game.screen = 'results';
    guard.sync();
    win.userBack(); // to the title
    await tick();
    guard.sync();
    await tick();
    guard.sync();
    expect(acts).toEqual(['menu']);
    expect(guard.depth).toBe(0);
    expect(win.history.index).toBe(0);
    win.userBack();
    await tick();
    expect(win.history.left).toBe(true);
  });
});
