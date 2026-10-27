// Seeded randomiser. Every night gets its own seed so maps are reproducible.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function randomSeed() {
  return 1 + Math.floor(Math.random() * 999999);
}

export function createRng(seed) {
  const next = mulberry32(seed);
  const rng = {
    seed,
    next,
    range(min, max) {
      return min + next() * (max - min);
    },
    int(min, maxInclusive) {
      return min + Math.floor(next() * (maxInclusive - min + 1));
    },
    chance(p) {
      return next() < p;
    },
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    // entries: [{ weight, ... }] -> one entry (weights <= 0 are skipped)
    weighted(entries) {
      let total = 0;
      for (const e of entries) total += Math.max(0, e.weight);
      let r = next() * total;
      for (const e of entries) {
        const w = Math.max(0, e.weight);
        if (r < w) return e;
        r -= w;
      }
      return entries[entries.length - 1];
    },
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    // Independent child stream, so e.g. joke picks don't shift the map layout.
    fork(salt) {
      return createRng((hashString(String(salt)) ^ seed) >>> 0);
    },
  };
  return rng;
}
