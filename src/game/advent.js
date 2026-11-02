// The advent calendar. Pure, and always told what day it is: `now` is a Date
// or milliseconds, read in the device's local time so a door opens at the
// player's own midnight. Rewards are handed back, not paid, so coins can go
// through ctx.addCoins and candy through addCandy.

import { GOLDEN_STAR_ID } from './baubles.js';

export const ADVENT_TUNING = {
  month: 11, // December, as Date.getMonth() counts
  doors: 24,
  firstYear: 2026, // the years firestore.rules accepts
  lastYear: 2100,
  doorCoins: 10,
  candyEvery: 7, // every 7th door also gives candy
  doorCandy: 10,
  lastDoorCoins: 100, // door 24
  lastDoorCandy: 50,
};

const T = ADVENT_TUNING;

// Where each door sits: read across, row by row. Fixed, so the calendar looks
// the same every day and on every device.
export const DOOR_LAYOUT = [14, 3, 21, 8, 1, 17, 11, 24, 6, 19, 2, 13, 9, 22, 5, 16, 12, 4, 20, 7, 23, 10, 18, 15];

// Everything the calendar has to know how to draw.
export const CHOCOLATE_SHAPES = ['star', 'heart', 'bell', 'tree', 'truffle', 'bar', 'coin', 'present'];

const MILK = ['#8a5a33', '#c79a6b'];
const DARK = ['#4a2a14', '#8a5a33'];
const WHITE = ['#f5e9d6', '#d9bf94'];
const GOLD = ['#e8b93a', '#fff4c2'];

// One per door, in door order.
export const CHOCOLATES = [
  {
    day: 1,
    name: 'Milky Star',
    shape: 'star',
    colours: MILK,
    note: "Yum! Chocolate is just for Pip. It's bad for dogs, so the Snow Puppy gets a snow biscuit instead!",
  },
  { day: 2, name: 'Caramel Truffle', shape: 'truffle', colours: MILK },
  { day: 3, name: 'Hazelnut Heart', shape: 'heart', colours: DARK },
  { day: 4, name: 'Little Gold Coin', shape: 'coin', colours: GOLD },
  { day: 5, name: 'Minty Tree', shape: 'tree', colours: ['#2f6b4f', '#c9f0dc'] },
  { day: 6, name: 'Orange Cream Bar', shape: 'bar', colours: ['#6b3a1c', '#f7b267'] },
  { day: 7, name: 'Jingle Bell Praline', shape: 'bell', colours: GOLD },
  { day: 8, name: 'White Snowball', shape: 'truffle', colours: WHITE },
  { day: 9, name: 'Toffee Crunch Bar', shape: 'bar', colours: MILK },
  { day: 10, name: 'Cherry Heart', shape: 'heart', colours: ['#5e1a24', '#e8516a'] },
  { day: 11, name: 'Cocoa Dusted Truffle', shape: 'truffle', colours: DARK },
  { day: 12, name: 'Fudge Present', shape: 'present', colours: ['#6b3a1c', '#e8192c'] },
  { day: 13, name: 'Honeycomb Star', shape: 'star', colours: ['#a3682a', '#f5d33f'] },
  { day: 14, name: 'Peppermint Bark', shape: 'bar', colours: ['#4a2a14', '#ffd6dc'] },
  { day: 15, name: 'Golden Bell', shape: 'bell', colours: GOLD },
  { day: 16, name: 'Raspberry Ripple Bar', shape: 'bar', colours: ['#f5e9d6', '#e8516a'] },
  { day: 17, name: 'Hot Chocolate Truffle', shape: 'truffle', colours: MILK },
  { day: 18, name: 'Praline Tree', shape: 'tree', colours: DARK },
  { day: 19, name: 'Sugar Plum Heart', shape: 'heart', colours: ['#4b2a6b', '#d9c4ff'] },
  { day: 20, name: 'Butterscotch Coin', shape: 'coin', colours: ['#c98a2e', '#ffe2b8'] },
  { day: 21, name: 'Gingerbread Present', shape: 'present', colours: ['#a3682a', '#1f8a4c'] },
  { day: 22, name: 'Snowy Coconut Truffle', shape: 'truffle', colours: WHITE },
  { day: 23, name: 'Marshmallow Star', shape: 'star', colours: ['#f5e9d6', '#ffd6ea'] },
  { day: 24, name: 'Christmas Eve Gold Star', shape: 'star', colours: GOLD },
];

export function getChocolate(day) {
  return CHOCOLATES.find((c) => c.day === day);
}

function isDoor(day) {
  return Number.isInteger(day) && day >= 1 && day <= T.doors;
}

// ---------------------------------------------------------------- the date

// { year, month, date } in local time, or null for a bad `now`.
function localDay(now) {
  const d = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(d.getTime())) return null;
  return { year: d.getFullYear(), month: d.getMonth(), date: d.getDate() };
}

// The calendar only exists in December. A clock set outside the years the
// cloud accepts gets no calendar, rather than doors the next sync would lose.
export function isAdventTime(now) {
  const day = localDay(now);
  return !!day && day.month === T.month && day.year >= T.firstYear && day.year <= T.lastYear;
}

// "2026-12-07" as noon local time, for the dev-only ?date= override. new
// Date('2026-12-07') would mean UTC, which is still the 6th west of Greenwich.
// Null for anything that isn't a real date.
export function parseDebugDate(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text));
  if (!m) return null;
  const [year, month, date] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const d = new Date(year, month, date, 12);
  return d.getMonth() === month && d.getDate() === date ? d : null;
}

// ---------------------------------------------------------------- the doors

// Doors opened this year. Last year's list counts for nothing. A later year's
// list (a clock that was once ahead) still counts: the merge keeps the later
// year, so ignoring it here would let its doors pay out again after each sync.
export function openedDoors(save, now) {
  const day = localDay(now);
  const advent = save.advent;
  return day && advent && advent.year >= day.year && Array.isArray(advent.opened) ? advent.opened : [];
}

// 'opened' (shows its chocolate), 'ready' (can be opened) or 'locked'.
export function doorState(save, day, now) {
  if (!isDoor(day) || !isAdventTime(now)) return 'locked';
  if (openedDoors(save, now).includes(day)) return 'opened';
  return localDay(now).date >= day ? 'ready' : 'locked';
}

// Doors that can be opened right now, for the title button's dot.
export function readyDoors(save, now) {
  const days = [];
  for (let day = 1; day <= T.doors; day++) if (doorState(save, day, now) === 'ready') days.push(day);
  return days;
}

export function lockedDoorText(day) {
  return `Come back on ${day} December`;
}

// What's behind a door: { coins, candy, bauble } (bauble is an id or null).
export function doorReward(day) {
  if (day === T.doors) return { coins: T.lastDoorCoins, candy: T.lastDoorCandy, bauble: GOLDEN_STAR_ID };
  return { coins: T.doorCoins, candy: day % T.candyEvery === 0 ? T.doorCandy : 0, bauble: null };
}

// Opens a ready door, starting this year's list if it's the first. Hands back
// { day, chocolate, coins, candy, bauble } for the caller to pay, or null.
export function openDoor(save, day, now) {
  if (doorState(save, day, now) !== 'ready') return null;
  const year = Math.max(localDay(now).year, save.advent ? save.advent.year : 0);
  save.advent = { year, opened: [...openedDoors(save, now), day].sort((a, b) => a - b) };
  return { day, chocolate: getChocolate(day), ...doorReward(day) };
}

// { year, opened } with door numbers in order and no repeats, or null. Sorted
// so two devices that opened the same doors hold the same list.
export function cleanAdvent(advent) {
  if (!advent || typeof advent !== 'object' || Array.isArray(advent)) return null;
  const { year, opened } = advent;
  if (!Number.isInteger(year) || year < T.firstYear || year > T.lastYear) return null;
  const doors = new Set(Array.isArray(opened) ? opened.filter(isDoor) : []);
  return { year, opened: [...doors].sort((a, b) => a - b) };
}
