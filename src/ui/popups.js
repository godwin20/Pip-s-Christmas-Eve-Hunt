// Popups: the cracker joke slip (modal), surprise banners (non-modal) and
// the reward unlock celebration (modal). Modals queue up, so a joke followed
// by an unlock shows one after the other; every show*() Promise resolves when
// its own card has closed.

import './popups.css';

const KINDS = {
  joke: { label: 'Cracker Joke', next: 'Ha! Next' },
  quote: { label: 'Wise Words', next: 'Aww! Next' },
  secret: { label: 'Top Secret Note', next: 'Shh! Next' },
};

const RIBBONS = {
  common: '🎄 Common',
  rare: '✨ Rare ✨',
  legendary: '🌈 Legendary 🌈',
};

const GOOD_KICKERS = ['Surprise!', 'Ooh, a surprise!', 'Yippee!', 'Wow!'];
const BAD_KICKERS = ['Oh no!', 'Uh oh!', 'Oh dear…'];

const CONFETTI_COLOURS = ['#e63946', '#ffc94a', '#2a9d6f', '#4d96ff', '#ff8fc7', '#c77dff', '#ffffff', '#6bcb77'];

const STAR_CLIP =
  'polygon(50% 0%, 57.6% 11.7%, 69.1% 3.8%, 71.7% 17.6%, 85.4% 14.6%, 82.4% 28.3%, 96.2% 30.9%, 88.3% 42.4%, ' +
  '100% 50%, 88.3% 57.6%, 96.2% 69.1%, 82.4% 71.7%, 85.4% 85.4%, 71.7% 82.4%, 69.1% 96.2%, 57.6% 88.3%, ' +
  '50% 100%, 42.4% 88.3%, 30.9% 96.2%, 28.3% 82.4%, 14.6% 85.4%, 17.6% 71.7%, 3.8% 69.1%, 11.7% 57.6%, ' +
  '0% 50%, 11.7% 42.4%, 3.8% 30.9%, 17.6% 28.3%, 14.6% 14.6%, 28.3% 17.6%, 30.9% 3.8%, 42.4% 11.7%)';

// Key -> action while a modal is open. These keys never reach the game.
const ACTIONS = new Map([
  ['KeyE', 'primary'],
  ['Space', 'primary'],
  ['Enter', 'primary'],
  ['NumpadEnter', 'primary'],
  ['Escape', 'close'],
  ['KeyR', 'read'],
]);
const KEY_FALLBACK = { ' ': 'Space', e: 'KeyE', E: 'KeyE', Enter: 'Enter', Escape: 'Escape', r: 'KeyR', R: 'KeyR' };

const GRACE_MS = 350; // ignore keys right after a modal opens (no accidental skips)
const CLOSE_MS = 260;
const BANNER_MS = 3200;
const MAX_BANNERS = 3;

const now =
  typeof performance !== 'undefined' && performance.now
    ? () => performance.now()
    : () => Date.now();

function h(tag, cls, parent, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

function button(cls, parent, label) {
  const b = h('button', cls, parent, label);
  b.type = 'button';
  return b;
}

function removeNode(node) {
  if (node && node.parentNode) node.parentNode.removeChild(node);
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// A paper slip with ragged top and bottom edges. Tear depths are in px so a
// slightly smaller copy (the inner slip) keeps an even border inside a frame.
function tornClip() {
  const n = 24;
  const top = [];
  const bottom = [];
  for (let i = 0; i <= n; i++) {
    const x = ((i / n) * 100).toFixed(2) + '%';
    const yt = (i % 2 ? 6 : 1) + Math.random() * 4;
    const yb = (i % 2 ? 1 : 6) + Math.random() * 4;
    top.push(x + ' ' + yt.toFixed(1) + 'px');
    bottom.unshift(x + ' calc(100% - ' + yb.toFixed(1) + 'px)');
  }
  return 'polygon(' + top.concat(bottom).join(', ') + ')';
}

function addSparks(parent, count, spots) {
  for (let i = 0; i < count; i++) {
    const s = h('span', 'pp-spark', parent, i % 3 === 2 ? '★' : '✦');
    const spot = spots[i % spots.length];
    s.style.left = spot[0] + Math.random() * 6 - 3 + '%';
    s.style.top = spot[1] + Math.random() * 6 - 3 + '%';
    s.style.fontSize = 14 + Math.random() * 14 + 'px';
    s.style.animationDelay = (-Math.random() * 1.6).toFixed(2) + 's';
  }
}

const CARD_SPARK_SPOTS = [
  [-3, 18],
  [101, 28],
  [-2, 72],
  [100, 80],
  [20, 98],
  [78, 100],
  [8, -2],
  [62, -4],
];
const BANNER_SPARK_SPOTS = [
  [4, 12],
  [16, 78],
  [92, 18],
  [96, 70],
];

export function createPopups(root, sfx) {
  if (!root && typeof document !== 'undefined') root = document.getElementById('popups') || document.body;

  const banners = []; // { node, timer }
  const queue = []; // { build, resolve }
  let current = null; // the open modal
  const layer = h('div', 'pp-banners', root);

  // ---------- sfx helpers (never throw) ----------
  function sound(name) {
    try {
      if (sfx && typeof sfx.play === 'function') sfx.play(name);
    } catch {
      /* audio is optional */
    }
  }
  // Returns sfx.speak()'s answer (audio.js returns false when the voice
  // setting is off or speech is unsupported), or undefined if it threw.
  function speak(text) {
    try {
      if (sfx && typeof sfx.speak === 'function') return sfx.speak(text);
    } catch {
      /* voice is optional */
    }
    return undefined;
  }
  function canSpeak() {
    return (
      !!sfx &&
      typeof sfx.speak === 'function' &&
      (typeof window === 'undefined' || 'speechSynthesis' in window)
    );
  }

  // ---------- modal queue ----------
  function enqueue(build) {
    return new Promise((resolve) => {
      queue.push({ build, resolve });
      runNext();
    });
  }

  function settle(modal) {
    if (modal.resolved) return;
    modal.resolved = true;
    if (modal.makeResult) {
      try {
        modal.result = modal.makeResult();
      } catch {
        /* keep whatever result is there */
      }
    }
    try {
      modal.resolve(modal.result);
    } catch {
      /* ignore */
    }
  }

  function runNext() {
    while (!current && queue.length) {
      const job = queue.shift();
      let modal = null;
      try {
        modal = job.build();
      } catch (err) {
        console.error('popup failed to build', err);
      }
      if (!modal) {
        job.resolve(null);
        continue;
      }
      modal.resolve = job.resolve;
      modal.openedAt = now();
      current = modal;
      root.appendChild(modal.el);
      if (modal.onOpen) {
        try {
          modal.onOpen();
        } catch {
          /* ignore */
        }
      }
    }
  }

  function finish(modal) {
    if (!modal || modal.closing) return;
    modal.closing = true;
    modal.el.classList.add('is-closing');
    try {
      if (sfx && typeof sfx.stopSpeaking === 'function') sfx.stopSpeaking();
    } catch {
      /* voice is optional */
    }
    modal.timer = setTimeout(() => {
      modal.timer = 0;
      removeNode(modal.el);
      if (current === modal) current = null;
      settle(modal);
      runNext();
    }, CLOSE_MS);
  }

  function isModalOpen() {
    return !!current || queue.length > 0;
  }

  // Resolves (with null) every card still waiting in the queue.
  function dropQueue() {
    const pending = queue.splice(0, queue.length);
    for (const job of pending) {
      try {
        job.resolve(null);
      } catch {
        /* ignore */
      }
    }
  }

  // Closes the open card (with its little exit animation) and drops anything
  // queued behind it, so isModalOpen() goes false once the animation ends.
  // main.js calls this when a night starts/ends or the player quits, where a
  // queued card popping up over the results/title screen would be wrong.
  function closeModal() {
    dropQueue();
    if (current) finish(current);
  }

  // Closes everything right now (no animation) and drops queued cards.
  function closeAll() {
    dropQueue();
    if (current) {
      const m = current;
      current = null;
      m.closing = true;
      if (m.timer) clearTimeout(m.timer);
      removeNode(m.el);
      settle(m);
    }
  }

  // ---------- keyboard (capture phase so keys never leak into the game) ----------
  function actionFor(e) {
    let code = e.code;
    if (!code || !ACTIONS.has(code)) code = KEY_FALLBACK[e.key] || code;
    return ACTIONS.get(code) || null;
  }
  function onKeyDown(e) {
    if (!current) return;
    const action = actionFor(e);
    if (!action) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat || current.closing) return;
    if (now() - current.openedAt < GRACE_MS) return;
    current.onKey(action);
  }
  function onKeyUp(e) {
    // keyups still reach the game (so held keys get released) but must not
    // click a focused button.
    if (current && actionFor(e)) e.preventDefault();
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
  }

  // ---------- joke card ----------
  function buildJoke(joke, opts) {
    const kindKey = KINDS[joke.kind] ? joke.kind : 'joke';
    const kind = KINDS[kindKey];
    const rarity = RIBBONS[joke.rarity] ? joke.rarity : 'common';
    const q = joke.q == null ? '' : String(joke.q);
    const a = joke.a == null ? '' : String(joke.a);
    const twoStep = kindKey === 'joke' && a !== '';

    const overlay = h('div', 'pp-modal pp-modal--joke pp-modal--' + rarity);
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', kind.label);
    h('div', 'pp-rays', overlay);

    const card = h('div', 'pp-joke pp-joke--' + rarity + ' pp-kind-' + kindKey, overlay);
    if (!twoStep) card.classList.add('is-revealed');

    const wrap = h('div', 'pp-slip-wrap', card);
    const frame = h('div', 'pp-slip-frame', wrap);
    const slip = h('div', 'pp-slip', frame);
    const clip = tornClip();
    frame.style.clipPath = clip;
    slip.style.clipPath = clip;

    h('div', 'pp-kind', slip, kind.label);
    h('p', 'pp-q', slip, q);
    if (twoStep) {
      const rb = button('pp-reveal', slip);
      h('span', null, rb, '👆 Tap to see the answer!');
      h('small', null, rb, 'or press E');
    }
    h('p', 'pp-a', slip, a);
    if (kindKey === 'secret') h('div', 'pp-stamp', slip, 'TOP SECRET');

    h('div', 'pp-ribbon', card, RIBBONS[rarity]);

    if (opts.isNew === true) {
      const st = h('div', 'pp-sticker pp-sticker--new', card);
      st.style.clipPath = STAR_CLIP;
      const inner = h('span', null, st, 'NEW!');
      inner.style.clipPath = STAR_CLIP;
    } else if (opts.isNew === false) {
      h('div', 'pp-sticker pp-sticker--dupe', card, '📒 Already in your gallery!');
    }

    const actions = h('div', 'pp-actions', card);
    let readBtn = null;
    if (canSpeak()) readBtn = button('pp-btn pp-btn--read', actions, '🔊 Read aloud');
    const nextBtn = button('pp-btn pp-btn--next', actions, kind.next + ' ▶');
    h('span', 'pp-key', nextBtn, 'E');

    const coins = Math.round(Number(opts.coins) || 0);
    if (coins > 0) {
      const reward = h('div', 'pp-reward', card);
      const pill = h('span', null, reward);
      h('span', 'pp-coin', pill);
      h('span', null, pill, '+' + coins + (coins === 1 ? ' coin' : ' coins'));
    }

    if (rarity === 'legendary') addSparks(card, 8, CARD_SPARK_SPOTS);
    else if (rarity === 'rare') addSparks(card, 4, CARD_SPARK_SPOTS);

    const modal = { el: overlay, kind: 'joke', revealed: !twoStep, closing: false, result: null };
    // however the card closes (button, key, closeModal, closeAll) it resolves with this
    modal.makeResult = () => ({ revealed: modal.revealed });

    function reveal() {
      if (modal.revealed) return;
      modal.revealed = true;
      card.classList.add('is-revealed');
      sound('pop');
    }
    let muteTimer = 0;
    function read() {
      let text = q;
      if (modal.revealed && a) text = kindKey === 'secret' ? q + '. ' + a : q + ' … ' + a;
      const ok = speak(text);
      if (!readBtn) return;
      if (ok === false) {
        // sfx.speak() says no (voice switched off in the settings): tell the
        // player instead of silently doing nothing.
        readBtn.textContent = '🔇 Voice is off';
        readBtn.classList.add('is-muted');
        clearTimeout(muteTimer);
        muteTimer = setTimeout(() => {
          readBtn.textContent = '🔊 Read aloud';
          readBtn.classList.remove('is-muted');
        }, 1600);
      }
      readBtn.classList.remove('is-speaking');
      void readBtn.offsetWidth;
      readBtn.classList.add('is-speaking');
    }
    function close() {
      clearTimeout(muteTimer);
      finish(modal);
    }

    slip.addEventListener('click', () => {
      if (modal.closing || modal.revealed) return;
      const focused = document.activeElement;
      if (focused && focused !== document.body && card.contains(focused) && focused.blur) focused.blur();
      reveal();
    });
    nextBtn.addEventListener('click', (e) => {
      e.currentTarget.blur();
      if (modal.closing) return;
      sound('click');
      close();
    });
    if (readBtn) {
      readBtn.addEventListener('click', (e) => {
        e.currentTarget.blur();
        if (!modal.closing) read();
      });
    }

    modal.onKey = (action) => {
      if (action === 'primary') {
        if (!modal.revealed) reveal();
        else {
          sound('click');
          close();
        }
      } else if (action === 'close') close();
      else if (action === 'read') read();
    };
    return modal;
  }

  function showJoke(joke, opts) {
    if (!joke) return Promise.resolve(null);
    return enqueue(() => buildJoke(joke, opts || {}));
  }

  // ---------- unlock celebration ----------
  function buildUnlock(m) {
    const overlay = h('div', 'pp-modal pp-modal--unlock');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'New reward unlocked');

    const confetti = h('div', 'pp-confetti', overlay);
    for (let i = 0; i < 48; i++) {
      const c = h('i', i % 5 === 0 ? 'is-round' : i % 7 === 0 ? 'is-ribbon' : null, confetti);
      c.style.left = (Math.random() * 100).toFixed(1) + '%';
      c.style.background = CONFETTI_COLOURS[i % CONFETTI_COLOURS.length];
      c.style.setProperty('--dur', (2.4 + Math.random() * 2.2).toFixed(2) + 's');
      c.style.setProperty('--delay', (i < 30 ? -Math.random() * 3 : Math.random() * 0.8).toFixed(2) + 's');
      c.style.setProperty('--drift', (Math.random() * 140 - 70).toFixed(0) + 'px');
      c.style.setProperty('--spin', (360 + Math.random() * 900).toFixed(0) + 'deg');
    }

    const card = h('div', 'pp-unlock', overlay);
    h('div', 'pp-unlock-kicker', card, '🎉 New Reward Unlocked! 🎉');
    const badge = h('div', 'pp-unlock-badge', card);
    h('div', 'pp-unlock-rays', badge);
    const disc = h('div', 'pp-unlock-disc', badge);
    h('span', 'pp-unlock-icon', disc, m.icon || '🎁');
    h('h2', 'pp-unlock-name', card, m.name || 'Something special!');
    if (m.desc) h('p', 'pp-unlock-desc', card, m.desc);
    if (m.count) h('div', 'pp-unlock-count', card, '🎁 ' + m.count + ' presents opened!');
    if (m.cosmetic) h('p', 'pp-unlock-tip', card, "Switch it on or off in Santa's Workshop → Wardrobe.");
    const go = button('pp-btn pp-btn--go', card, 'Yay! 🎉');
    h('span', 'pp-key', go, 'E');
    addSparks(card, 6, CARD_SPARK_SPOTS);

    const modal = { el: overlay, kind: 'unlock', closing: false, result: null };
    go.addEventListener('click', (e) => {
      e.currentTarget.blur();
      if (modal.closing) return;
      sound('click');
      finish(modal);
    });
    modal.onKey = (action) => {
      if (action === 'primary' || action === 'close') {
        sound('click');
        finish(modal);
      } else if (action === 'read') {
        speak((m.name || '') + '! ' + (m.desc || ''));
      }
    };
    modal.onOpen = () => sound('unlock');
    return modal;
  }

  function showUnlock(milestone) {
    if (!milestone) return Promise.resolve(null);
    return enqueue(() => buildUnlock(milestone));
  }

  // ---------- surprise banner (non-modal) ----------
  function dismissBanner(b) {
    const i = banners.indexOf(b);
    if (i < 0) return;
    banners.splice(i, 1);
    clearTimeout(b.timer);
    b.node.classList.add('is-out');
    b.timer = setTimeout(() => removeNode(b.node), 420);
  }

  function showSurprise(def, detail) {
    if (!def) return;
    const good = def.good !== false;
    const node = h('div', 'pp-banner ' + (good ? 'pp-banner--good' : 'pp-banner--bad'), layer);
    node.setAttribute('role', 'status');
    if (def.id) node.dataset.surprise = String(def.id);
    h('div', 'pp-banner-icon', node, def.icon || '🎁');
    const text = h('div', 'pp-banner-text', node);
    h('div', 'pp-banner-kicker', text, good ? pick(GOOD_KICKERS) : pick(BAD_KICKERS));
    h('div', 'pp-banner-name', text, def.name || 'Surprise!');
    const extra = detail != null && detail !== '' ? String(detail) : def.desc || '';
    h('div', 'pp-banner-detail', text, extra);
    if (good) addSparks(node, 4, BANNER_SPARK_SPOTS);

    const b = { node, timer: 0 };
    banners.push(b);
    while (banners.length > MAX_BANNERS) dismissBanner(banners[0]);
    b.timer = setTimeout(() => dismissBanner(b), BANNER_MS);
  }

  function dispose() {
    if (typeof window !== 'undefined' && window.removeEventListener) {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    }
    closeAll();
    while (banners.length) {
      const b = banners.pop();
      clearTimeout(b.timer);
      removeNode(b.node);
    }
    removeNode(layer);
  }

  return {
    showJoke,
    showSurprise,
    showUnlock,
    isModalOpen,
    closeModal,
    // extras
    closeAll,
    dispose,
  };
}
