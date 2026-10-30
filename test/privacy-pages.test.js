// The public privacy pages (public/privacy.html, public/delete-data.html)
// can't import the game's wording, so these checks keep them saying what the
// in-game Privacy screen says (src/ui/privacy-text.js), word for word.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { PRIVACY_FACTS, DELETE_FACTS, POLICY_PAGE, DELETE_PAGE, POLICY_UPDATED } from '../src/ui/privacy-text.js';
import { PRIVACY_CONTACT } from '../src/cloud/config.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const policy = read(`public/${POLICY_PAGE}`);
const deletePage = read(`public/${DELETE_PAGE}`);
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
    const screens = read('src/ui/screens.js');
    const docs = read('docs/CLOUD.md');
    for (const [name, text] of Object.entries({ ...PAGES, 'screens.js': screens, 'CLOUD.md': docs })) {
      expect(text, name).not.toMatch(/unused\s+for\s+2\s+years\s+are\s+cleared/i);
    }
  });
});
