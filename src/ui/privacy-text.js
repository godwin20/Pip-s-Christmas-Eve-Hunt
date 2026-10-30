// What the game keeps, in the words used everywhere: the in-game Privacy
// screen (screens.js) and the public pages public/privacy.html and
// public/delete-data.html. Those are plain HTML (Google Play links to them,
// and they must open without the game), so they can't import this file:
// test/privacy-pages.test.js checks that they still say every sentence here
// word for word. Change them together, and the date with them.

// Next to index.html, so relative links work on any host and in the app.
export const POLICY_PAGE = 'privacy.html';
export const DELETE_PAGE = 'delete-data.html';
export const POLICY_UPDATED = '30 October 2026';

// The Privacy screen's list. The pages say each as "lead text".
export const PRIVACY_FACTS = [
  { icon: '🐧', lead: 'Guests:', text: 'we keep a random player ID, the game progress and the snow name. No name, email or location.' },
  {
    icon: '🔑',
    lead: 'Google sign-in:',
    text: "Google Firebase also keeps the account's email address, name and profile photo, so progress can follow you. Only grown-ups should do this.",
  },
  { icon: '🏆', lead: 'Leaderboard:', text: 'shows only snow names made from our word lists, and scores.' },
  // one-way to the game's maker, so the "no chat" below stays true
  {
    icon: '⭐',
    lead: 'Feedback:',
    text: "if you send some, we keep the stars, topic, quick notes, any grown-up's note, the map number, device type (touch or keyboard), app version and the player ID, to improve the game. Only the game's maker reads it; other players never see it.",
  },
  // the grown-ups gate (src/ui/age-gate.js): checked in the browser, and only
  // whether it passed, and until when, is kept there
  {
    icon: '🎂',
    lead: 'Birth month and year:',
    text: "before Google sign-in or writing a grown-up's note, the game asks for them; the answer stays on the device and isn't sent anywhere.",
  },
  // "tools": feedback is read to fix bugs, which Play's Data safety form
  // counts as the purpose "Analytics" (play/data-safety.md)
  { icon: '🚫', lead: 'Never:', text: 'no ads, no analytics tools, no tracking, no chat, no location.' },
  { icon: '☁️', lead: 'Where:', text: 'Google Cloud (Firebase), which stores it for us. We never sell it or share it with anyone else.' },
  { icon: '🔒', lead: 'Safety:', text: 'it travels encrypted, Google stores it encrypted, and each player can only reach their own save.' },
  // Nothing clears old saves by itself (Firestore's TTL needs a paid plan),
  // so this promises only what the owner does by hand. "Sign-ins" covers the
  // guest IDs Firebase may keep after a delete (DELETE_FACTS.guest).
  {
    icon: '⏳',
    lead: 'How long:',
    text: "until you delete it. The game's maker may also clear away, by hand, saves, leaderboard entries and sign-ins that haven't been used for 2 years.",
  },
  {
    icon: '📱',
    lead: 'iPhone and iPad:',
    text: "Safari may clear a guest's progress after about a week of not playing. Sign in with Google to keep it.",
  },
];

// What "Delete my saved data" (or an email asking for it) removes, what
// Google keeps for a while, and how soon. Both pages say all of it.
export const DELETE_FACTS = {
  what: 'Deleting removes the cloud save (progress, snow name and scores), the leaderboard entry, any feedback you sent and a Google sign-in, with its email address, name and profile photo.',
  // Firebase refuses to delete a sign-in that isn't fresh, and a guest's
  // can't be confirmed again (cloud.deleteEverything signs it out instead),
  // so the pages don't promise that it goes.
  guest: "A guest's sign-in holds only the random player ID. Firebase may keep that ID, but nothing is stored under it any more.",
  googleAccount: 'Your Google account itself stays as it is: only its link to this game goes.',
  kept: "Google keeps its own security logs, which include IP addresses, for a few weeks, and deleted data leaves Google's backups within about 180 days.",
  inGame: 'In the game it happens straight away.',
  byEmail: "If you email us, we delete it within 30 days and tell you when it's done.",
};
