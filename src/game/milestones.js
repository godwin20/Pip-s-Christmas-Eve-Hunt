// Present Milestone rewards, unlocked by all-time presents opened.

export const MILESTONES = [
  {
    id: 'scarf',
    count: 10,
    icon: '🧣',
    name: 'Scarf & Bobble Hat',
    desc: 'A cosy red scarf and a bobble hat for Pip.',
    cosmetic: true,
  },
  {
    id: 'puppy',
    count: 25,
    icon: '🐶',
    name: 'Snow Puppy Pal',
    desc: 'Your Snow Puppy joins you at the start of every night.',
    cosmetic: true,
  },
  {
    id: 'candyTheme',
    count: 50,
    icon: '🍭',
    name: 'Candy Cane Forest',
    desc: 'A sweet new map theme with candy trees and pink snow.',
    cosmetic: true,
  },
  {
    id: 'trail',
    count: 75,
    icon: '🌈',
    name: 'Rainbow Sleigh Trail',
    desc: 'Pip leaves a sparkly rainbow trail wherever they go.',
    cosmetic: true,
  },
  {
    id: 'goldenPresent',
    count: 100,
    icon: '🌟',
    name: 'Golden Present Event',
    desc: 'One guaranteed Golden Mega Present hides on every map.',
    cosmetic: false,
  },
  {
    id: 'partySky',
    count: 150,
    icon: '🎆',
    name: 'Northern Lights Party',
    desc: 'The aurora turns into a disco light show.',
    cosmetic: true,
  },
  {
    id: 'jumper',
    count: 200,
    icon: '🧶',
    name: 'Ugly Christmas Jumper',
    desc: 'The legendary jumper, plus the "Present Legend" title.',
    cosmetic: true,
  },
];

export function getMilestone(id) {
  return MILESTONES.find((m) => m.id === id);
}

export function isUnlocked(save, id) {
  return save.unlocked.includes(id);
}

// Cosmetic is active when it is unlocked and not switched off in the Wardrobe.
export function isActive(save, id) {
  return isUnlocked(save, id) && save.wardrobe[id] !== false;
}

// Unlocks any milestones the present count has reached. Returns the new ones.
export function checkMilestones(save) {
  const fresh = [];
  for (const m of MILESTONES) {
    if (save.totalPresents >= m.count && !save.unlocked.includes(m.id)) {
      save.unlocked.push(m.id);
      if (m.cosmetic) save.wardrobe[m.id] = true;
      fresh.push(m);
    }
  }
  return fresh;
}

export function nextMilestone(save) {
  return MILESTONES.find((m) => !save.unlocked.includes(m.id)) || null;
}
