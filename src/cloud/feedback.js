// Player feedback (docs/CLOUD.md, "Feedback"): what a feedback doc may hold,
// and the tidying both the card in screens.js and cloud.sendFeedback() use.
// The ids and caps here are mirrored by literal lists in firestore.rules, so
// a change here needs the same change there (test/rules.test.js imports these
// lists to keep the two in step).

// "What is it about?": exactly one of these.
export const FEEDBACK_CATEGORIES = [
  { id: 'bug', icon: '🐛', label: 'Bug' },
  { id: 'idea', icon: '💡', label: 'Idea' },
  { id: 'wardrobe', icon: '🧣', label: 'Wardrobe/Cosmetics' },
  { id: 'gameplay', icon: '🎮', label: 'Gameplay' },
];

// Kid-safe quick notes, so children never need to type. Up to
// FEEDBACK_QUICK_MAX of them; the ids are stored, never the words.
export const FEEDBACK_QUICK = [
  { id: 'loved', icon: '😍', label: 'Loved it!' },
  { id: 'tooHard', icon: '😓', label: 'Too hard' },
  { id: 'tooEasy', icon: '😴', label: 'Too easy' },
  { id: 'broke', icon: '🔧', label: 'Something broke' },
  { id: 'moreClothes', icon: '🧥', label: 'More clothes please' },
  { id: 'moreJokes', icon: '😂', label: 'More jokes please' },
];

export const FEEDBACK_QUICK_MAX = 3;
export const FEEDBACK_COMMENT_MAX = 300; // the grown-ups' note, in UTF-16 units like <textarea maxlength>
export const FEEDBACK_SEED_MAX = 999999999; // map numbers are 1..999999 today (src/core/rng.js)
export const FEEDBACK_VERSION_MAX = 40;
export const FEEDBACK_GAP_MS = 10 * 60 * 1000; // firestore.rules: one per player every 10 minutes
export const FEEDBACK_DEVICE_TYPES = ['touch', 'desktop'];

// vite.config.js defines __APP_VERSION__ (package version, plus the commit on
// the GitHub Pages build). Outside Vite it doesn't exist, hence the typeof.
export const APP_VERSION = (typeof __APP_VERSION__ === 'string' && __APP_VERSION__.slice(0, FEEDBACK_VERSION_MAX)) || 'dev';

const CATEGORY_IDS = new Set(FEEDBACK_CATEGORIES.map((c) => c.id));
const QUICK_IDS = new Set(FEEDBACK_QUICK.map((q) => q.id));

// 'touch' for phones and tablets (a coarse main pointer, or touch with no
// hover), 'desktop' for a mouse or trackpad. Never throws.
export function detectDeviceType(win = typeof window !== 'undefined' ? window : null) {
  try {
    const mq = (q) => !!(win && typeof win.matchMedia === 'function' && win.matchMedia(q).matches);
    if (mq('(pointer: coarse)')) return 'touch';
    if (win && win.navigator && win.navigator.maxTouchPoints > 0 && mq('(hover: none)')) return 'touch';
  } catch {
    /* no matchMedia: fall through */
  }
  return 'desktop';
}

// The map number as stored: a whole number in range, else null (the title
// before any night, or anything odd).
export function cleanSeed(v) {
  const n = typeof v === 'string' && /^\d{1,9}$/.test(v.trim()) ? Number(v.trim()) : v;
  return Number.isInteger(n) && n >= 0 && n <= FEEDBACK_SEED_MAX ? n : null;
}

// The doc's own fields (everything but uid and createdAt, which the facade
// adds), or null if the payload can't be sent as it is. Strict where a child
// picked something (rating, topic, notes), forgiving where the game filled
// it in (map number, device type, version).
export function cleanFeedback(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const rating = p.rating;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  if (typeof p.category !== 'string' || !CATEGORY_IDS.has(p.category)) return null;
  const rawQuick = p.quick == null ? [] : p.quick;
  if (!Array.isArray(rawQuick) || !rawQuick.every((id) => typeof id === 'string' && QUICK_IDS.has(id))) return null;
  // in FEEDBACK_QUICK order, once each: the same choice always reads the same
  const quick = FEEDBACK_QUICK.map((q) => q.id).filter((id) => rawQuick.includes(id));
  if (quick.length > FEEDBACK_QUICK_MAX) return null;
  if (p.comment != null && typeof p.comment !== 'string') return null;
  const comment = (p.comment || '').replace(/\r\n?/g, '\n').trim();
  if (comment.length > FEEDBACK_COMMENT_MAX) return null;
  const deviceType = FEEDBACK_DEVICE_TYPES.includes(p.deviceType) ? p.deviceType : detectDeviceType();
  const version = typeof p.appVersion === 'string' && p.appVersion.trim() ? p.appVersion.trim() : APP_VERSION;
  return {
    rating,
    category: p.category,
    quick,
    comment,
    islandSeed: cleanSeed(p.islandSeed),
    deviceType,
    appVersion: version.slice(0, FEEDBACK_VERSION_MAX),
  };
}
