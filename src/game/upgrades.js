// Santa's Workshop upgrades. Each has 3 levels; computeStats() turns the
// owned levels into the numbers gameplay reads.

export const MAX_LEVEL = 3;

export const UPGRADES = [
  {
    id: 'radar',
    name: 'Radar Range',
    icon: '📡',
    costs: [40, 120, 300],
    levels: ['Radar sees 40 m', 'Radar sees 60 m', 'Radar sees 90 m'],
    blurb: 'A bigger dish on your radar so you spot treats from further away.',
  },
  {
    id: 'crackerSense',
    name: 'Cracker Sense',
    icon: '🎉',
    costs: [50, 150, 350],
    levels: ['Crackers show on the radar', 'Radar pings twice as fast', 'Radar shows cracker rarity colours'],
    blurb: 'Teach your radar to sniff out crackers too.',
  },
  {
    id: 'compass',
    name: 'Compass Star',
    icon: '⭐',
    costs: [80, 200, 450],
    levels: ['Star points to the nearest present', 'Star points to the nearest anything', 'Star shows the distance too'],
    blurb: 'A little guiding star that floats over Pip.',
  },
  {
    id: 'speedy',
    name: 'Speedy Skates',
    icon: '⛸️',
    costs: [40, 110, 260],
    levels: ['+15% speed, no slipping on ice', '+30% speed', '+45% speed'],
    blurb: 'Zippy little skates. Pip waddles at turbo speed.',
  },
  {
    id: 'longerNight',
    name: 'Longer Night',
    icon: '🌙',
    costs: [60, 160, 380],
    levels: ['+30 s each night', '+60 s each night', '+90 s each night'],
    blurb: 'Ask the moon to stay up a little later.',
  },
  {
    id: 'luckyBow',
    name: 'Lucky Bow',
    icon: '🎀',
    costs: [70, 180, 400],
    levels: ['Better surprises, less coal', 'Even better surprises', 'Santa visits more often!'],
    blurb: 'A lucky ribbon that makes presents nicer.',
  },
  {
    id: 'magnet',
    name: 'Magnet Mittens',
    icon: '🧤',
    costs: [60, 170, 380],
    levels: ['Auto-open treats within 2 m', 'Auto-open within 3.5 m', 'Auto-open within 5 m'],
    blurb: 'Fuzzy mittens that pull treats right to you.',
  },
  {
    id: 'sack',
    name: 'Present Sack',
    icon: '🛍️',
    costs: [50, 140, 320],
    levels: ['+2 presents each night', '+4 presents each night', '+6 presents each night'],
    blurb: "A bigger sack means Santa's elves hide more presents.",
  },
  {
    id: 'jokeDetector',
    name: 'Joke Detector',
    icon: '🔍',
    costs: [60, 160, 360],
    levels: ['More rare jokes', 'Even more rare jokes', 'Lots of legendary secrets'],
    blurb: 'Finds the funniest crackers on the island.',
  },
];

export function getUpgrade(id) {
  return UPGRADES.find((u) => u.id === id);
}

export function upgradeLevel(save, id) {
  return Math.max(0, Math.min(MAX_LEVEL, save.upgrades[id] || 0));
}

// Cost of the next level, or null when maxed.
export function nextCost(save, id) {
  const lvl = upgradeLevel(save, id);
  if (lvl >= MAX_LEVEL) return null;
  return getUpgrade(id).costs[lvl];
}

// Spends coins and raises the level. Returns true on success.
export function buyUpgrade(save, id) {
  const cost = nextCost(save, id);
  if (cost === null || save.coins < cost) return false;
  save.coins -= cost;
  save.upgrades[id] = upgradeLevel(save, id) + 1;
  return true;
}

export const BASE_NIGHT_SECONDS = 300;

export function computeStats(save) {
  const L = (id) => upgradeLevel(save, id);
  return {
    radarRange: [25, 40, 60, 90][L('radar')],
    radarShowCrackers: L('crackerSense') >= 1,
    radarPingSeconds: L('crackerSense') >= 2 ? 1.5 : 3,
    radarRarity: L('crackerSense') >= 3,
    compassLevel: L('compass'), // 0 none, 1 nearest present, 2 nearest anything, 3 + distance
    speedMult: 1 + 0.15 * L('speedy'),
    iceGrip: L('speedy') >= 1,
    nightSeconds: BASE_NIGHT_SECONDS + 30 * L('longerNight'),
    luck: L('luckyBow'), // 0..3
    magnetRadius: [0, 2, 3.5, 5][L('magnet')],
    extraPresents: 2 * L('sack'),
    jokeLuck: L('jokeDetector'), // 0..3
  };
}
