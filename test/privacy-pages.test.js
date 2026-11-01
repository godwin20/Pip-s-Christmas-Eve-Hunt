// The public privacy pages (public/privacy.html, public/delete-data.html)
// can't import the game's wording, so these checks keep them saying what the
// in-game Privacy screen says (src/ui/privacy-text.js), word for word.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { PRIVACY_FACTS, DELETE_FACTS, DELETE_ASK, POLICY_PAGE, DELETE_PAGE, POLICY_UPDATED, deleteWords } from '../src/ui/privacy-text.js';
import { accountSig } from '../src/ui/screens.js';
import { PRIVACY_CONTACT } from '../src/cloud/config.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const policy = read(`public/${POLICY_PAGE}`);
const deletePage = read(`public/${DELETE_PAGE}`);
const screens = read('src/ui/screens.js');
const PAGES = { [POLICY_PAGE]: policy, [DELETE_PAGE]: deletePage };

// What a reader sees: no tags or comments, entities decoded, spaces collapsed.
function visibleText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, ' ');
}

function tagText(html, tag) {
  const m = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? visibleText(m[1]).trim() : null;
}

describe('the privacy pages', () => {
  it('say every line of the in-game Privacy screen, word for word', () => {
    const text = visibleText(policy);
    for (const fact of PRIVACY_FACTS) expect(text, fact.lead).toContain(`${fact.lead} ${fact.text}`);
  });

  it('both say what is deleted, what Google keeps for a while, and how soon', () => {
    for (const [name, html] of Object.entries(PAGES)) {
      const text = visibleText(html);
      for (const [key, sentence] of Object.entries(DELETE_FACTS)) expect(text, `${name}: ${key}`).toContain(sentence);
      // the retention line too, the same as the Privacy screen's
      const howLong = PRIVACY_FACTS.find((f) => f.lead === 'How long:');
      expect(text, name).toContain(`${howLong.lead} ${howLong.text}`);
    }
  });

  it('are clearly titled, name the game, and carry the same last-updated date', () => {
    expect(tagText(policy, 'h1')).toBe('Privacy policy');
    expect(tagText(policy, 'title')).toMatch(/^Privacy policy\b/);
    expect(tagText(deletePage, 'h1')).toBe('Delete your data');
    expect(tagText(deletePage, 'title')).toMatch(/^Delete your data\b/);
    for (const [name, html] of Object.entries(PAGES)) {
      const text = visibleText(html);
      expect(text, name).toContain("Pip's Christmas Eve Hunt");
      expect(text, name).toContain(`Last updated: ${POLICY_UPDATED}`);
    }
  });

  it('give the privacy contact from src/cloud/config.js as a link', () => {
    for (const [name, html] of Object.entries(PAGES)) {
      expect(visibleText(html), name).toContain(PRIVACY_CONTACT);
      const href = /^https?:/i.test(PRIVACY_CONTACT) ? PRIVACY_CONTACT : `mailto:${PRIVACY_CONTACT}`;
      expect(html, name).toContain(`href="${href}`);
    }
  });

  it('link to each other, and work without any script', () => {
    expect(policy).toContain(`href="${DELETE_PAGE}"`);
    expect(deletePage).toContain(`href="${POLICY_PAGE}"`);
    for (const [name, html] of Object.entries(PAGES)) {
      expect(html, name).not.toMatch(/<script\b/i);
      expect(html, name).toMatch(/<meta name="viewport" content="width=device-width/);
      expect(html, name).toMatch(/^<!doctype html>\s*<html lang="en">/i);
    }
  });

  it('never promise that unused saves clear themselves', () => {
    // nothing does that (Firestore's TTL needs a paid plan); the maker may, by hand
    const docs = read('docs/CLOUD.md');
    for (const [name, text] of Object.entries({ ...PAGES, 'screens.js': screens, 'CLOUD.md': docs })) {
      expect(text, name).not.toMatch(/unused\s+for\s+2\s+years\s+are\s+cleared/i);
    }
  });

  it('agree with the Data safety form about photos and what a guest has', () => {
    const text = visibleText(policy);
    expect(text).toContain('Apart from the Google profile photo described above');
    expect(text).not.toMatch(/doesn't collect [^.]*photos/i);
    for (const [name, words] of Object.entries({ 'privacy.html': text, 'privacy-text.js': read('src/ui/privacy-text.js') })) {
      expect(words, name).toContain('No real name, email or location');
      expect(words, name).not.toContain('No name, email or location');
    }
  });

  it('name everything else Google sign-in and the leaderboard involve', () => {
    const text = visibleText(policy);
    expect(text).toContain('the sign-in code also loads a small helper from Google when the game starts');
    expect(text).toContain('Each entry is filed under the random player ID, which the game never shows.');
    expect(text).toContain('Email address, name, profile photo and Google account ID');
    expect(PRIVACY_FACTS.find((f) => f.lead === 'Google sign-in:').text).toContain('Google account ID');
    expect(DELETE_FACTS.what).toContain('Google account ID');
  });

  it('keep email deletion for Google accounts and send guests to the button', () => {
    const text = visibleText(policy);
    expect(text).toContain('If you signed in with Google, you can also ask by email');
    expect(text).toContain('Guests use the button in the game on that device instead.');
    expect(text).toContain('or, for a Google account, email');
    expect(screens).toContain('or, for a Google account, contact');
  });
});

describe('Delete your data', () => {
  const between = (start, end) => visibleText(deletePage.slice(deletePage.indexOf(start), deletePage.indexOf(end)));
  const some = between('id="some"', 'id="otherwise"');

  it('has a "Delete only some of it" section', () => {
    expect(deletePage).toMatch(/<h2 id="some">Delete only some of it<\/h2>/);
    expect(deletePage).toContain('href="#some"');
  });

  it("names the game's own buttons, and says what each one does", () => {
    for (const label of ['🧹 Reset progress', 'Yes, start fresh', 'Show me on the leaderboard']) {
      expect(some, label).toContain(label);
      expect(screens, label).toContain(`'${label}'`);
    }
    expect(some).toContain('replaces your cloud progress and scores');
    expect(some).toContain('Your snow name stays.');
    expect(some).toContain('This deletes your entry.');
    expect(some).toContain('Just your feedback or a note:');
    expect(deletePage).toContain('mailto:PipsChristmasEveHunt@proton.me?subject=Delete%20my%20feedback');
  });

  it('says what to do first on other devices, and after signing out', () => {
    const steps = between('id="in-game"', 'id="by-email"');
    expect(steps).toContain('Signed in on another device? Sign out there first.');
    expect(steps).toContain(DELETE_FACTS.signedOut);
  });
});

describe('the in-game delete question', () => {
  const guest = { state: 'synced', isAnonymous: true, lastSyncedAt: 1 };
  const google = { state: 'synced', isAnonymous: false, accountName: 'Sam', lastSyncedAt: 1 };

  it('warns a guest, who only deletes the guest', () => {
    const words = deleteWords(accountSig(guest));
    expect(words.warning).toBe('Used Google sign-in before? Sign in on this device first so that account is deleted too, or email us.');
    expect(words.ask).toBe(DELETE_ASK.guest);
    expect(words.ask).not.toMatch(/google/i);
  });

  it('warns a guest who is offline or stuck too', () => {
    for (const state of ['offline', 'error', 'syncing']) expect(deleteWords(accountSig({ ...guest, state, lastSyncedAt: null })).warning, state).not.toBeNull();
    // 'checking' timed out (sigNow in screens.js)
    expect(deleteWords('guest').warning).not.toBeNull();
  });

  it('tells a Google player the sign-in goes, with no warning', () => {
    const words = deleteWords(accountSig(google));
    expect(words.warning).toBeNull();
    expect(words.ask).toBe(DELETE_ASK.google);
    expect(words.ask).toContain('your Google sign-in');
  });

  it('shows no warning while a delete waits for Google', () => {
    expect(deleteWords(accountSig({ ...google, needsReauth: true })).warning).toBeNull();
  });

  it('holds the warning back until the cloud has answered', () => {
    // a returning Google player looks like a guest until then
    for (const state of ['off', 'connecting']) {
      const words = deleteWords(accountSig({ state, isAnonymous: true, lastSyncedAt: null }));
      expect(words.warning, state).toBeNull();
      expect(words.ask, state).toBe(DELETE_ASK.checking);
    }
  });

  it('never promises "any Google sign-in" again', () => {
    expect(screens).not.toContain('any Google sign-in');
  });
});
