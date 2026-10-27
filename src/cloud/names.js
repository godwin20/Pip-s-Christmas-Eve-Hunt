// Leaderboard "snow names" built from fixed, kid-safe word lists, e.g.
// "Jolly Penguin 42". Only the three indexes are stored in the cloud, so no
// typed text ever reaches the leaderboard and nothing needs moderating.
//
// The lists are append-only: firestore.rules checks each index against the
// list lengths, and a stored index must keep naming the same word.

export const ADJECTIVES = [
  'Jolly', 'Merry', 'Twinkly', 'Snowy', 'Frosty', 'Cosy', 'Sparkly', 'Glittery',
  'Cheerful', 'Toasty', 'Fluffy', 'Giggly', 'Bouncy', 'Sleepy', 'Speedy', 'Sneaky',
  'Brave', 'Clever', 'Happy', 'Lucky', 'Sunny', 'Shiny', 'Wiggly', 'Zippy',
  'Dizzy', 'Plucky', 'Snug', 'Chilly', 'Festive', 'Gentle', 'Mighty', 'Nimble',
  'Rosy', 'Sugary', 'Tinsel', 'Wintry', 'Witty', 'Zesty', 'Dazzling', 'Starry',
];

export const NOUNS = [
  'Penguin', 'Snowman', 'Reindeer', 'Elf', 'Snowflake', 'Gingerbread', 'Gumdrop', 'Present',
  'Pudding', 'Mitten', 'Sleigh', 'Robin', 'Polar Bear', 'Pinecone', 'Icicle', 'Bauble',
  'Star', 'Candle', 'Cocoa', 'Cookie', 'Snowball', 'Owl', 'Fox', 'Hare',
  'Puffin', 'Walrus', 'Yeti', 'Narwhal', 'Husky', 'Moose', 'Bell', 'Lantern',
  'Holly', 'Ivy', 'Sprout', 'Marshmallow', 'Muffin', 'Nutcracker', 'Snow Globe', 'Cupcake',
];

export const NAME_NUM_MIN = 1;
export const NAME_NUM_MAX = 99;

function wholeIn(v, lo, hi) {
  return Number.isInteger(v) && v >= lo && v <= hi;
}

export function isValidNameParts(p) {
  return (
    !!p &&
    wholeIn(p.adj, 0, ADJECTIVES.length - 1) &&
    wholeIn(p.noun, 0, NOUNS.length - 1) &&
    wholeIn(p.num, NAME_NUM_MIN, NAME_NUM_MAX)
  );
}

export function nameFromParts(p) {
  if (!isValidNameParts(p)) return 'Mystery Penguin';
  return `${ADJECTIVES[p.adj]} ${NOUNS[p.noun]} ${p.num}`;
}

// `random` is a () => [0, 1) function, Math.random by default.
export function randomNameParts(random = Math.random) {
  const pick = (n) => Math.min(n - 1, Math.floor(random() * n));
  return {
    adj: pick(ADJECTIVES.length),
    noun: pick(NOUNS.length),
    num: NAME_NUM_MIN + pick(NAME_NUM_MAX - NAME_NUM_MIN + 1),
  };
}
