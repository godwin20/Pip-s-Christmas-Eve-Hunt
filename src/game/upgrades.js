// Santa's Workshop upgrades. Each has 3 levels; computeStats() turns the
// owned levels into the numbers gameplay reads.

import { petPerks } from './pets.js';

export const MAX_LEVEL = 3;

export const UPGRADES = [
  {
    id: 'radar',
    name: 'Radar Range',
    icon: '📡',
    costs: [40, 120, 300],
    levels: ['Radar sees 40 m', 'Radar sees 60 m', 'Radar sees 90 m, and candy canes too'],
    blurb: 'A bigger dish on your radar so you spot treats from further away.',
  },
  {
    id: 'crackerSense',
    name: 'Cracker Sense',
    icon: '🎉',
    costs: [50, 150, 350],
    levels: ['Crackers show on the radar', 'Radar shows which crackers are rare', 'Radar points to rainbow crackers anywhere'],
    blurb: 'Teach your radar to sniff out crackers too.',
  },
  {
    id: 'compass',
    name: 'Compass Star',
    icon: '⭐',
    costs: [80, 200, 450],
    levels: ['Star points to the nearest present', 'Star points to the nearest present or cracker', 'Star finds rainbow crackers first'],
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
    levels: ['Better surprises, less coal', 'Even better surprises', 'Mega Presents twice as often'],
    blurb: 'A lucky ribbon that makes presents nicer.',
  },
  {
    id: 'magnet',
    name: 'Magnet Mittens',
    icon: '🧤',
    costs: [60, 170, 380],
    levels: ['Auto-open treats within 2.5 m', 'Auto-open within 3.5 m', 'Auto-open within 5 m, plus canes and baubles'],
    blurb: 'Fuzzy mittens that open treats as Pip waddles past.',
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
    levels: ['More rainbow crackers', 'Even more rainbow crackers', 'The most rainbow crackers'],
    blurb: "Rainbow crackers hold Santa's Secret Notes. This finds more of them.",
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

// Coins spent to reach the levels in `upgrades` (an upgradeId -> level map).
// Cloud saves derive coins from this, so merging two devices' upgrades can
// never create coins (docs/CLOUD.md).
export function spentOnUpgrades(upgrades) {
  let total = 0;
  for (const u of UPGRADES) {
    const lvl = Math.max(0, Math.min(MAX_LEVEL, Math.floor(Number(upgrades && upgrades[u.id]) || 0)));
    for (let i = 0; i < lvl; i++) total += u.costs[i];
  }
  return total;
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
  const perks = petPerks(save); // the pets add to the same numbers as the upgrades
  return {
    radarRange: [25, 40, 60, 90][L('radar')],
    radarShowCrackers: L('crackerSense') >= 1,
    radarPingSeconds: L('crackerSense') >= 2 ? 1.5 : 3,
    radarRarity: L('crackerSense') >= 2,
    radarRainbowArrow: L('crackerSense') >= 3,
    radarCanes: L('radar') >= 3,
    compassLevel: L('compass'), // 0 none, 1 nearest present, 2 nearest anything, 3 rainbow crackers first + distance
    speedMult: (1 + 0.15 * L('speedy')) * perks.speedMult,
    iceGrip: L('speedy') >= 1,
    nightSeconds: BASE_NIGHT_SECONDS + 30 * L('longerNight'),
    luck: L('luckyBow'), // 0..3
    magnetRadius: [0, 2.5, 3.5, 5][L('magnet')],
    magnetTreats: L('magnet') >= 3, // the radius reaches canes and baubles too
    extraPresents: 2 * L('sack'),
    jokeLuck: L('jokeDetector'), // 0..3
    sniffMult: perks.sniffMult, // how far the Snow Puppy sniffs, as a multiple
    giftSeconds: perks.giftSeconds, // how often the Frost Kitten brings coins
    giftCoins: perks.giftCoins, // 0 unless the Frost Kitten came along
  };
}
