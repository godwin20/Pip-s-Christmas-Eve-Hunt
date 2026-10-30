// A cosy full-screen note for when the 3D can't run (main.js): the browser
// has no WebGL at all (too old, locked down, hardware acceleration switched
// off), or it took the graphics away mid-game (webglcontextlost). Plain DOM
// on top of everything else; styles in glnote.css.

import './glnote.css';

const NOTES = {
  nogl: {
    icon: '🐧',
    title: "Pip's island needs 3D graphics",
    text: 'Try Chrome, Safari or Edge, or turn on hardware acceleration in your browser settings.',
    button: 'Try again',
  },
  lost: {
    icon: '❄️',
    title: 'The 3D picture took a snow day',
    text: "Your device needed a rest from the 3D. Everything you've found is saved.",
    button: 'Tap to reload',
  },
};

// Shows the note `kind` ('nogl' | 'lost') inside `root` and answers
// { hide() }. Everything else in `root` goes inert meanwhile, so keys and
// taps can't reach a game that has no picture. The button reloads the page,
// unless `onButton` says otherwise. Never throws.
export function showGlNote(kind, { root = document.body, onButton } = {}) {
  const note = NOTES[kind] || NOTES.nogl;
  let el = null;
  const muted = [];
  try {
    el = document.createElement('div');
    el.className = 'glnote';
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'glnote-title');
    el.setAttribute('aria-describedby', 'glnote-text');
    const card = document.createElement('div');
    card.className = 'glnote__card';
    const icon = document.createElement('div');
    icon.className = 'glnote__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = note.icon;
    const title = document.createElement('h1');
    title.className = 'glnote__title';
    title.id = 'glnote-title';
    title.textContent = note.title;
    const text = document.createElement('p');
    text.className = 'glnote__text';
    text.id = 'glnote-text';
    text.textContent = note.text;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'glnote__btn';
    btn.textContent = note.button;
    btn.addEventListener('click', () => {
      if (typeof onButton === 'function') onButton();
      else location.reload();
    });
    card.append(icon, title, text, btn);
    el.append(card);
    for (const kid of root.children) {
      if (kid.inert) continue;
      kid.inert = true;
      muted.push(kid);
    }
    root.append(el);
    btn.focus({ preventScroll: true });
  } catch (err) {
    console.error('[glnote] could not show the note', err);
  }
  return {
    hide() {
      for (const kid of muted) kid.inert = false;
      muted.length = 0;
      if (el) el.remove();
      el = null;
    },
  };
}
