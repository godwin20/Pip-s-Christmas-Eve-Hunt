// Every cracker joke, wise saying and secret note in the game.
//
// Shape: { id, kind, rarity, q, a }
//   jokes   (j###): q = setup question, a = punchline.            common | rare
//   quotes  (q###): q = the saying, a = a cute attribution.       common | rare
//   secrets (s###): q = "Santa's Secret Note #N: ...", a = note.  legendary
//
// Ids are stable forever (they are stored in the save's foundJokes), so only
// ever ADD new entries with new ids; never renumber or reuse old ones.
// All original or traditional folk cracker jokes. No song lyrics, no
// copyrighted quotes.

export const JOKES = [
  // ---------------------------------------------------------------- jokes: common
  { id: 'j001', kind: 'joke', rarity: 'common', q: 'What do you call a snowman with a six-pack?', a: 'An abdominal snowman!' },
  { id: 'j002', kind: 'joke', rarity: 'common', q: 'What do you get if you cross a snowman with a vampire?', a: 'Frostbite!' },
  { id: 'j003', kind: 'joke', rarity: 'common', q: 'Why did the turkey join the band?', a: 'Because it had the drumsticks!' },
  { id: 'j004', kind: 'joke', rarity: 'common', q: "What's Santa's favourite kind of music?", a: 'Wrap music!' },
  { id: 'j005', kind: 'joke', rarity: 'common', q: 'Why is it always so cold at Christmas?', a: "Because it's in Decem-brrrrr!" },
  { id: 'j006', kind: 'joke', rarity: 'common', q: 'What do elves learn at school?', a: 'The elf-abet!' },
  { id: 'j007', kind: 'joke', rarity: 'common', q: 'How does a sheep say Merry Christmas?', a: 'Fleece Navidad!' },
  { id: 'j008', kind: 'joke', rarity: 'common', q: 'What do you call a cat on the beach at Christmas?', a: 'Sandy Claws!' },
  { id: 'j009', kind: 'joke', rarity: 'common', q: 'What do reindeer hang on their Christmas trees?', a: 'Horn-aments!' },
  { id: 'j010', kind: 'joke', rarity: 'common', q: "Why did Santa's helper go to see the doctor?", a: 'He had low elf-esteem!' },
  { id: 'j011', kind: 'joke', rarity: 'common', q: "What's a penguin's favourite relative?", a: 'Aunt Arctica!' },
  { id: 'j012', kind: 'joke', rarity: 'common', q: 'Where do snowmen keep their pocket money?', a: 'In a snow bank!' },
  { id: 'j013', kind: 'joke', rarity: 'common', q: 'What did the gingerbread man put on his bed?', a: 'A cookie sheet!' },
  { id: 'j014', kind: 'joke', rarity: 'common', q: 'Why was the snowman rummaging through the bag of carrots?', a: 'He was picking his nose!' },
  { id: 'j015', kind: 'joke', rarity: 'common', q: "What do you call a snowman's pet dog?", a: 'A slush puppy!' },
  { id: 'j016', kind: 'joke', rarity: 'common', q: 'Why does Santa love going down chimneys?', a: 'Because it soots him!' },
  { id: 'j017', kind: 'joke', rarity: 'common', q: 'What do you call a reindeer with no eyes?', a: 'No eye-deer!' },
  { id: 'j018', kind: 'joke', rarity: 'common', q: 'What did one Christmas tree say to the other?', a: '"Lighten up!"' },
  { id: 'j019', kind: 'joke', rarity: 'common', q: 'Who hides in the bakery at Christmas?', a: 'A mince spy!' },
  { id: 'j020', kind: 'joke', rarity: 'common', q: 'What do you call a reindeer with terrible manners?', a: 'Rude-olph!' },
  { id: 'j021', kind: 'joke', rarity: 'common', q: 'What do monkeys sing at Christmas?', a: 'Jungle bells!' },
  { id: 'j022', kind: 'joke', rarity: 'common', q: 'What do you call a snowman in July?', a: 'A puddle!' },
  { id: 'j023', kind: 'joke', rarity: 'common', q: 'What did the stamp say to the Christmas card?', a: '"Stick with me and we\'ll go places!"' },
  { id: 'j024', kind: 'joke', rarity: 'common', q: 'Why are Christmas trees so bad at knitting?', a: 'They keep dropping their needles!' },
  { id: 'j025', kind: 'joke', rarity: 'common', q: 'What happens if you eat the Christmas decorations?', a: 'You get tinsel-itis!' },
  { id: 'j026', kind: 'joke', rarity: 'common', q: 'What goes "Oh! Oh! Oh!"?', a: 'Santa walking backwards!' },
  { id: 'j027', kind: 'joke', rarity: 'common', q: 'What do you call a frozen elf dangling from the roof?', a: 'An elf-icicle!' },
  { id: 'j028', kind: 'joke', rarity: 'common', q: "Why don't you ever see penguins in Britain?", a: "Because they're afraid of Wales!" },
  { id: 'j029', kind: 'joke', rarity: 'common', q: 'Why did the gingerbread man go to the doctor?', a: 'He was feeling a bit crummy!' },
  { id: 'j030', kind: 'joke', rarity: 'common', q: 'What does Santa get if he gets stuck in a chimney?', a: 'Claus-trophobia!' },
  { id: 'j031', kind: 'joke', rarity: 'common', q: 'What kind of bug hates Christmas?', a: 'A humbug!' },
  { id: 'j032', kind: 'joke', rarity: 'common', q: 'Why did the elf put his bed in the fireplace?', a: 'He wanted to sleep like a log!' },
  { id: 'j033', kind: 'joke', rarity: 'common', q: "What do you call a kid who doesn't believe in Santa?", a: 'A rebel without a Claus!' },
  { id: 'j034', kind: 'joke', rarity: 'common', q: 'What do you call a penguin who tells brilliant jokes?', a: 'A pun-guin!' },
  { id: 'j035', kind: 'joke', rarity: 'common', q: 'Why is the turkey never hungry on Christmas Day?', a: "Because it's always stuffed!" },
  { id: 'j036', kind: 'joke', rarity: 'common', q: 'What do sheep say to each other at Christmas?', a: '"Merry Christmas to ewe!"' },
  { id: 'j037', kind: 'joke', rarity: 'common', q: 'How do you scare a snowman?', a: 'Wave a hairdryer at him!' },
  { id: 'j038', kind: 'joke', rarity: 'common', q: 'What do you get if you cross Santa with a duck?', a: 'A Christmas quacker!' },
  { id: 'j039', kind: 'joke', rarity: 'common', q: 'What did the wrapping paper say to the present?', a: '"Don\'t worry, I\'ve got you covered!"' },
  { id: 'j040', kind: 'joke', rarity: 'common', q: 'How do snowmen say hello?', a: '"Ice to meet you!"' },
  { id: 'j041', kind: 'joke', rarity: 'common', q: "Knock knock! Who's there? Lettuce. Lettuce who?", a: "Lettuce in, it's freezing out here!" },
  { id: 'j042', kind: 'joke', rarity: 'common', q: "Knock knock! Who's there? Doughnut. Doughnut who?", a: 'Doughnut open until Christmas!' },
  { id: 'j043', kind: 'joke', rarity: 'common', q: 'What do you get if you cross a bell with a skunk?', a: 'Jingle smells!' },
  { id: 'j044', kind: 'joke', rarity: 'common', q: 'Why do mummies love Christmas so much?', a: 'All the wrapping!' },
  { id: 'j045', kind: 'joke', rarity: 'common', q: 'What do you call a dinosaur decorating for Christmas?', a: 'A Tree-Rex!' },
  { id: 'j046', kind: 'joke', rarity: 'common', q: "Why don't penguins like chatting to strangers at parties?", a: 'They find it really hard to break the ice!' },
  { id: 'j047', kind: 'joke', rarity: 'common', q: 'What do penguins wear on their heads in the snow?', a: 'Ice caps!' },
  { id: 'j048', kind: 'joke', rarity: 'common', q: 'What do snowmen call their kids?', a: 'Chill-dren!' },
  { id: 'j049', kind: 'joke', rarity: 'common', q: 'What do you call a spooky reindeer?', a: 'A cari-BOO!' },
  { id: 'j050', kind: 'joke', rarity: 'common', q: 'Why is a foot a brilliant Christmas present?', a: 'It makes a perfect stocking filler!' },
  { id: 'j051', kind: 'joke', rarity: 'common', q: "What's black, white and red all over?", a: 'A penguin in a Santa hat!' },
  { id: 'j052', kind: 'joke', rarity: 'common', q: 'What do penguins send each other in December?', a: 'Fish-mas cards!' },
  { id: 'j053', kind: 'joke', rarity: 'common', q: 'Why do reindeer wear fur coats?', a: "Because they'd look silly in puffer jackets!" },
  { id: 'j054', kind: 'joke', rarity: 'common', q: 'What did the sea say to the frozen pond?', a: 'Nothing. It just waved!' },
  { id: 'j055', kind: 'joke', rarity: 'common', q: "Knock knock! Who's there? Interrupting penguin. Interrupting pen-", a: 'SQUAWK! Merry Christmas!' },

  // ------------------------------------------------------------------ jokes: rare
  { id: 'j056', kind: 'joke', rarity: 'rare', q: "What do you call Santa's little helpers?", a: 'Subordinate Clauses!' },
  { id: 'j057', kind: 'joke', rarity: 'rare', q: 'How much did Santa pay for his sleigh?', a: 'Nothing. It was on the house!' },
  { id: 'j058', kind: 'joke', rarity: 'rare', q: 'Why did Rudolph get a bad school report?', a: 'Because he went down in history!' },
  { id: 'j059', kind: 'joke', rarity: 'rare', q: 'What do you call a reindeer wearing earmuffs?', a: "Anything you like. He can't hear you!" },
  { id: 'j060', kind: 'joke', rarity: 'rare', q: 'Why was the advent calendar so nervous?', a: 'Its days were numbered!' },
  { id: 'j061', kind: 'joke', rarity: 'rare', q: 'What do you get if you cross a snowman with a baker?', a: 'Frosting!' },
  { id: 'j062', kind: 'joke', rarity: 'rare', q: 'Why does Santa have three gardens?', a: 'So he can ho-ho-hoe!' },
  { id: 'j063', kind: 'joke', rarity: 'rare', q: "If athletes get athlete's foot, what do elves get?", a: 'Mistle-toe!' },
  { id: 'j064', kind: 'joke', rarity: 'rare', q: "How can you tell when Santa's in the room?", a: 'You can sense his presents!' },
  { id: 'j065', kind: 'joke', rarity: 'rare', q: 'Why did the penguin cross the frozen sea?', a: 'To go with the floe!' },
  { id: 'j066', kind: 'joke', rarity: 'rare', q: 'Why did the turkey cross the road?', a: "It was the chicken's day off!" },
  { id: 'j067', kind: 'joke', rarity: 'rare', q: "What's the difference between the Christmas alphabet and the ordinary alphabet?", a: 'The Christmas alphabet has Noel! (No "L"!)' },
  { id: 'j068', kind: 'joke', rarity: 'rare', q: 'Why did nobody bid for Dasher and Blitzen at the auction?', a: 'They were two deer!' },
  { id: 'j069', kind: 'joke', rarity: 'rare', q: 'Where do penguins go to vote?', a: 'The South Poll!' },
  { id: 'j070', kind: 'joke', rarity: 'rare', q: 'What did the big candle say to the little candle?', a: '"I\'m going out tonight!"' },

  // --------------------------------------------------------------- quotes: common
  { id: 'q001', kind: 'quote', rarity: 'common', q: 'A smile is the warmest scarf you can wear.', a: '— a very wise snowman' },
  { id: 'q002', kind: 'quote', rarity: 'common', q: 'Even the tiniest snowflake helps the whole hill sparkle.', a: '— Granny Penguin' },
  { id: 'q003', kind: 'quote', rarity: 'common', q: "If at first you don't succeed, slide, slide again.", a: "— Pip's belly-sliding coach" },
  { id: 'q004', kind: 'quote', rarity: 'common', q: "The best presents can't be wrapped. Believe me, I've tried.", a: '— a very tired elf' },
  { id: 'q005', kind: 'quote', rarity: 'common', q: "Be the sprinkles on somebody's gingerbread.", a: '— the Head Baker of the North Pole' },
  { id: 'q006', kind: 'quote', rarity: 'common', q: 'When life gives you snow, make snow angels.', a: '— a cheerful robin' },
  { id: 'q007', kind: 'quote', rarity: 'common', q: 'Kindness is like glitter: it gets everywhere, and nobody minds.', a: '— Mrs Claus' },
  { id: 'q008', kind: 'quote', rarity: 'common', q: 'A hug is the only present you can give away and still keep.', a: '— a cuddly polar bear' },
  { id: 'q009', kind: 'quote', rarity: 'common', q: "Sing loudly! The reindeer don't know the words either.", a: '— the North Pole Choir' },
  { id: 'q010', kind: 'quote', rarity: 'common', q: 'Every snowcloud has a snowball fight hiding inside it.', a: '— a weather-watching owl' },
  { id: 'q011', kind: 'quote', rarity: 'common', q: 'Waddle bravely, little one. Big adventures start with tiny steps.', a: '— Grandpa Penguin' },
  { id: 'q012', kind: 'quote', rarity: 'common', q: "Share your last mince pie and you'll never run out of friends.", a: '— a very full reindeer' },
  { id: 'q013', kind: 'quote', rarity: 'common', q: 'Cold paws, warm heart.', a: '— the Snow Puppy (probably)' },
  { id: 'q014', kind: 'quote', rarity: 'common', q: 'There is no such thing as too many fairy lights.', a: '— every elf, ever' },
  { id: 'q015', kind: 'quote', rarity: 'common', q: 'Dream big. Then wrap it up with a bow.', a: '— the Wrapping Department' },

  // ----------------------------------------------------------------- quotes: rare
  { id: 'q016', kind: 'quote', rarity: 'rare', q: "The secret to happiness is a warm fire, cocoa with extra marshmallows, and pretending you can't hear the washing-up.", a: '— Santa, after Christmas dinner' },
  { id: 'q017', kind: 'quote', rarity: 'rare', q: 'Shine as if the whole sky is watching. On Christmas Eve, it is.', a: '— the North Star' },
  { id: 'q018', kind: 'quote', rarity: 'rare', q: "Always laugh at your own jokes. Somebody has to, and you've heard them the most.", a: "— the Cracker Joke Writers' Club" },
  { id: 'q019', kind: 'quote', rarity: 'rare', q: "A true friend helps you hunt for your mittens and never mentions they're on your flippers.", a: "— Pip's best friend" },
  { id: 'q020', kind: 'quote', rarity: 'rare', q: 'Magic is just kindness that has been practising for a very, very long time.', a: '— the oldest elf in the Workshop' },

  // ------------------------------------------------------------ secrets: legendary
  {
    id: 's001',
    kind: 'secret',
    rarity: 'legendary',
    q: "Santa's Secret Note #1: The Great Jingle Ban",
    a: 'Reindeer Gerald was banned from the sleigh team for Excessive Jingling. He now jingles professionally at elf birthday parties and has never been happier. The other reindeer still sleep in earmuffs, just in case.',
  },
  {
    id: 's002',
    kind: 'secret',
    rarity: 'legendary',
    q: "Santa's Secret Note #2: Who's Really in Charge",
    a: "Mrs Claus runs the entire North Pole. Santa thinks he's in charge, and everybody lets him, because it makes him do a happy little dance. She also invented the sleigh's cup holder. Total genius.",
  },
  {
    id: 's003',
    kind: 'secret',
    rarity: 'legendary',
    q: "Santa's Secret Note #3: The Wi-Fi Password",
    a: "The North Pole Wi-Fi password is HOHOHO123. Please don't tell anyone. Somehow the penguins at the South Pole still get better signal than we do, and we are Looking Into It.",
  },
  {
    id: 's004',
    kind: 'secret',
    rarity: 'legendary',
    q: "Santa's Secret Note #4: The Case of the Missing Socks",
    a: "Every year exactly one sock vanishes from the North Pole laundry. After a long investigation, the elves found every single one of them under Kevin, a small and very smug walrus. He says they're \"cosy\". We have allowed it.",
  },
  {
    id: 's005',
    kind: 'secret',
    rarity: 'legendary',
    q: "Santa's Secret Note #5: The Wrapping Incident",
    a: 'One year the elves wrapped Santa by mistake. He spent six hours under the tree in a very surprised family\'s living room. He called it "the best nap of the century" and left them an extra mince pie to say sorry.',
  },
  {
    id: 's006',
    kind: 'secret',
    rarity: 'legendary',
    q: "Santa's Secret Note #6: What Really Powers the Sleigh",
    a: "The sleigh doesn't run on magic. It runs on hot cocoa, giggles and a hamster called Turbo, who refuses to explain his methods. Turbo is paid in sunflower seeds. Turbo is a legend.",
  },
  {
    id: 's007',
    kind: 'secret',
    rarity: 'legendary',
    q: "Santa's Secret Note #7: The Secret Middle List",
    a: 'Between the Naughty List and the Nice List there is a third list called "Mostly Nice, Occasionally Sticky". Nearly everybody is on it. Santa is on it. Santa is on it twice.',
  },
  {
    id: 's008',
    kind: 'secret',
    rarity: 'legendary',
    q: "Santa's Secret Note #8: Why I Say \"Ho Ho Ho\"",
    a: 'The truth is, I forgot the rest of the sentence in 1847 and have been too embarrassed to ask ever since. The elves think it was "Ho ho ho, has anyone seen my reading glasses?" They were on my head.',
  },
  {
    id: 's009',
    kind: 'secret',
    rarity: 'legendary',
    q: "Santa's Secret Note #9: The Midnight Snowman Meeting",
    a: 'Every Christmas Eve at midnight, the snowmen hold a top-secret meeting. Item one on the agenda is always "Carrots: but WHY?" They have never once made it to item two.',
  },
  {
    id: 's010',
    kind: 'secret',
    rarity: 'legendary',
    q: "Santa's Secret Note #10: The Eleven-Day Dance-Off",
    a: 'Dancer and Prancer once had a dance-off that lasted eleven whole days. It was declared a draw. There is still a hoof-shaped groove worn into the stable floor, and nobody is allowed to mention the Spinning Antler Move.',
  },
  {
    id: 's011',
    kind: 'secret',
    rarity: 'legendary',
    q: "Santa's Secret Note #11: The Only Traffic Light",
    a: 'The North Pole has exactly one traffic light. It has been stuck on green since 1952, because nobody is brave enough to tell Blitzen to slow down.',
  },
  {
    id: 's012',
    kind: 'secret',
    rarity: 'legendary',
    q: "Santa's Secret Note #12: The South Pole Party",
    a: "Santa once took a wrong turn and landed at the South Pole. The penguins threw him a surprise party so big he was three hours late for everywhere else. That's why there is ALWAYS a penguin on the Nice List. Hello, Pip!",
  },
];

function countBy(key, value) {
  let n = 0;
  for (const j of JOKES) if (j[key] === value) n++;
  return n;
}

// { total, joke, quote, secret } as the contract asks, plus per-rarity totals.
export const JOKE_COUNTS = {
  total: JOKES.length,
  joke: countBy('kind', 'joke'),
  quote: countBy('kind', 'quote'),
  secret: countBy('kind', 'secret'),
  common: countBy('rarity', 'common'),
  rare: countBy('rarity', 'rare'),
  legendary: countBy('rarity', 'legendary'),
};

// Fast id lookup (crackers.getJoke uses a linear find, which is also fine).
export const JOKE_BY_ID = new Map(JOKES.map((j) => [j.id, j]));
