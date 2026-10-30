// The grown-ups gate in front of Google sign-in and the feedback card's note
// (docs/CLOUD.md, "Grown-ups gate"): a neutral age screen. It asks "When were
// you born?" with a month and a year that both start blank, never says which
// answers pass, and a "not now" sticks for a day, so going back to pick
// another year doesn't help. These are the pure parts; screens.js shows it.
// The answer itself is never kept or sent: only the outcome and its time, in
// this browser.

// Sign-in keeps a grown-up's email, name and photo, and the note is free
// text, so both are for parents and carers.
export const GATE_MIN_AGE = 18;
export const GATE_OPEN_MS = 10 * 60 * 1000; // a pass holds this long, in this tab
export const GATE_LOCK_MS = 24 * 60 * 60 * 1000; // a "not now" holds this long, on this device
export const GATE_PASS_KEY = 'pips-hunt-gate-until'; // sessionStorage: this tab only
export const GATE_LOCK_KEY = 'pips-hunt-gate-not-now'; // localStorage: every tab, through a reload
// Every year back to this one, so nobody's year is missing from the list.
export const GATE_OLDEST_YEAR = 1900;

export const BIRTH_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// The year choices, newest first: this year down to GATE_OLDEST_YEAR.
export function birthYears(now = new Date()) {
  const years = [];
  for (let y = now.getFullYear(); y >= GATE_OLDEST_YEAR; y--) years.push(y);
  return years;
}

// A picked value ('9', '1984' or a number) as a whole number, or null.
function whole(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null;
  if (typeof v !== 'string' || !/^\d{1,4}$/.test(v.trim())) return null;
  return Number(v);
}

// 'missing' until both a month (1-12) and a year are picked, then 'pass' or
// 'fail'. The day isn't asked, so a birthday counts only from the 1st of the
// month after the birth month: an answer on the edge fails rather than passes.
export function ageCheck(month, year, now = new Date(), minAge = GATE_MIN_AGE) {
  const m = whole(month);
  const y = whole(year);
  // a year older than the list isn't one it offers (and '0' mustn't pass);
  // a year after this one still fails, the safe way round
  if (m === null || m < 1 || m > 12 || y === null || y < GATE_OLDEST_YEAR) return 'missing';
  const today = now.getFullYear() * 12 + now.getMonth(); // months since year 0
  // `m` is 1-based, so as a 0-based month it is already the month after
  const grownUp = (y + minAge) * 12 + m;
  return today >= grownUp ? 'pass' : 'fail';
}

// A pass read back from sessionStorage. One further ahead than one window
// can't be ours, so it counts for nothing.
export function passUntil(raw, now = Date.now()) {
  const v = Number(raw);
  return Number.isFinite(v) && v > now && v <= now + GATE_OPEN_MS ? v : 0;
}

// A "not now" read back from localStorage. One further ahead than a day (the
// clock was put back, or the value was edited) still locks, for a day from
// now: the safe way round. Nothing readable locks nothing.
export function lockUntil(raw, now = Date.now()) {
  const v = Number(raw); // a missing key reads as null, which is 0: no lock
  if (!Number.isFinite(v) || v <= now) return 0;
  return Math.min(v, now + GATE_LOCK_MS);
}

// What a tap on "Sign in with Google" or "add a note" does: 'notNow' (the
// gentle message, not the question) while a "not now" holds, even over a
// pass from before it; 'go' straight through while a pass holds; else 'ask'.
export function gateStep(passedUntil, lockedUntil, now = Date.now()) {
  if (now < lockedUntil) return 'notNow';
  if (now < passedUntil) return 'go';
  return 'ask';
}

// What an answer leaves behind: the time a pass or a "not now" ends. Never
// the month or year.
export function gateOutcome(result, now = Date.now()) {
  if (result === 'pass') return { passUntil: now + GATE_OPEN_MS, lockUntil: 0 };
  if (result === 'fail') return { passUntil: 0, lockUntil: now + GATE_LOCK_MS };
  return null;
}
