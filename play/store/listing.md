# Google Play store listing: Pip's Christmas Eve Hunt

Everything for the Play Console's **Grow users > Store presence > Store
listings** page, plus the graphics in this folder. Package
`io.github.godwin20.pipshunt`, target audience mixed (designed for everyone,
including children). Character counts were measured with Python's `len()`
(Unicode characters, line breaks included); the second number is Play's
limit.

## App details

### App name (24 / 30)

```text
Pip's Christmas Eve Hunt
```

### Short description (79 / 80)

```text
Help Pip the penguin find crackers, jokes and surprise presents before morning!
```

### Full description (3106 / 4000)

Plain text: Play shows the line breaks as written, and the bullets are the
`•` character. No emoji, no "best" / "#1" / "download now" / price wording.

**The 200 below belongs to version 2.** Play Console still says 102, and that
stays right until version 2 is live. Paste the new count in only then
(`testers.md`, section 5, Version 2, step 7).

```text
It's Christmas Eve, and Pip the penguin has one night to find the crackers and presents hidden all over a snowy island before morning comes. Waddle, belly-slide and explore a cosy village of twinkly trees, gingerbread houses and candy-cane lamps under the northern lights.

A gentle, cheerful 3D hunt for children and grown-ups alike. A night lasts about five minutes, just right for a quick game before bed.

CRACKERS AND JOKES
Pull a Christmas cracker to win a paper crown, a few coins and a joke. There are 200 to collect: silly cracker jokes, cosy sayings and legendary Santa's Secret Notes. Tap "Read aloud" to hear the joke in a funny voice.

PRESENTS AND SURPRISES
Every present hides one of 12 surprises: a snow puppy who sniffs out treats, a reindeer ride at double speed, a snowball storm, a jack-in-the-box, a disco tree, a sneaky gremlin to chase, and, if you are very lucky, Santa himself flying over.

THE RADAR
Your radar shows the treats nearby. Upgrade it to see further, spot crackers and tell the rare ones from the common ones. A little compass star can point the way to the nearest present.

SANTA'S WORKSHOP
Spend the coins you find on 9 upgrades with 3 levels each: Radar Range, Cracker Sense, Compass Star, Speedy Skates, Longer Night, Lucky Bow, Magnet Mittens, Present Sack and Joke Detector.

MILESTONES AND THE WARDROBE
Open presents to unlock rewards: a scarf and bobble hat, a Snow Puppy pal, the pink Candy Cane Forest, a rainbow sleigh trail, a golden present on every map, a northern lights party and the legendary Ugly Christmas Jumper. Dress Pip up and switch the extras on and off in the Wardrobe.

THE JOKE GALLERY
Every joke you find goes into a scrapbook. Tap a card to flip it over and enjoy the punchline again.

THE LEADERBOARD
See who opened the most presents in one night, the most presents of all, and found the most jokes. Players only appear as made-up snow names such as "Jolly Penguin 42", picked from kid-safe word lists, so nobody types a name and there is no chat. You can hide yourself from the board at any time.

A NEW ISLAND EVERY NIGHT, EVEN OFFLINE
Every night is a freshly made island. After the first launch the hunt works without the internet, and cloud saves and the leaderboard catch up when you are back online. On phones and tablets, drag on the left to waddle, drag on the right to look around and tap to open things.

FOR GROWN-UPS
• No ads and no in-app purchases. Coins are only earned in the game.
• Progress is backed up to the cloud under an anonymous player ID, so nobody has to sign in.
• Optional: you can link a Google account to keep progress safe and play on any device. The game asks for a birth month and year first, and the answer stays on the device.
• "Delete my saved data" on the in-game Privacy screen removes the player's saved progress, leaderboard entry and feedback from the cloud, and their Google sign-in if they are signed in on that device.
• The optional star rating sends feedback only to the game's maker. A written note is only offered after the same birth month and year question.

Merry Christmas from Pip!
```

### Release notes for the first release (138 / 500)

```text
First release on Google Play: the full game, with 200 jokes to collect, 12 present surprises, 9 workshop upgrades and 7 rewards to unlock.
```

## Category and tags

- **App or game:** Game.
- **Category:** **Casual** (Games > Casual). "Family" is not a Play category
  any more: the family-friendly placement comes from the target audience and
  content settings (ages including under 13, so the Families policy applies).
  Adventure would be the second choice if Casual ever feels wrong.
- **Tags** (Grow users > Store presence > Store settings > App category >
  Manage tags, up to 5, picked from Play's own list, whose names vary a
  little): Casual, Single player, Offline,
  Cute / Cartoon (or Stylized), Exploration. Choose the closest ones offered.

## Contact details (Grow users > Store presence > Store settings > Contact details)

- **Email (required, shown publicly on the listing):** the address in
  `PRIVACY_CONTACT` (`src/cloud/config.js`): PipsChristmasEveHunt@proton.me, so
  the listing, the game and the privacy pages all agree.
- **Website (optional):** `https://godwin20.github.io/Pip-s-Christmas-Eve-Hunt/`
- **Phone (optional):** leave empty. A trader on a personal account has to
  give one (`play/README.md`, Phase 5, step 4).
- **Privacy policy URL** (App content > Privacy policy):
  `https://godwin20.github.io/Pip-s-Christmas-Eve-Hunt/privacy.html`
  (`public/privacy.html`). The account deletion URL for the Data safety
  form is `https://godwin20.github.io/Pip-s-Christmas-Eve-Hunt/delete-data.html`,
  and the partial-deletion URL adds `#some` to it.

## Graphics in this folder

| File | Size (px) | Format | File size |
|---|---|---|---|
| `icon-512.png` | 512 x 512 | 32-bit PNG (RGBA, fully opaque) | 153 KB |
| `feature-graphic.png` | 1024 x 500 | 24-bit PNG (RGB, no alpha) | 341 KB |
| `screenshots/01-title.png` | 1920 x 1080 | 24-bit PNG (RGB, no alpha) | 1340 KB |
| `screenshots/02-night-hunt.png` | 1920 x 1080 | 24-bit PNG (RGB, no alpha) | 1106 KB |
| `screenshots/03-cracker-joke.png` | 1920 x 1080 | 24-bit PNG (RGB, no alpha) | 1240 KB |
| `screenshots/04-present-surprise-reindeer.png` | 1920 x 1080 | 24-bit PNG (RGB, no alpha) | 998 KB |
| `screenshots/05-santas-workshop.png` | 1920 x 1080 | 24-bit PNG (RGB, no alpha) | 795 KB |
| `screenshots/06-rewards-milestones.png` | 1920 x 1080 | 24-bit PNG (RGB, no alpha) | 821 KB |
| `screenshots/07-joke-gallery.png` | 1920 x 1080 | 24-bit PNG (RGB, no alpha) | 679 KB |
| `screenshots/08-leaderboard.png` | 1920 x 1080 | 24-bit PNG (RGB, no alpha) | 716 KB |
| `screenshots/portrait-01-title.png` | 1080 x 1920 | 24-bit PNG (RGB, no alpha) | 1107 KB |
| `screenshots/portrait-02-cracker-joke.png` | 1080 x 1920 | 24-bit PNG (RGB, no alpha) | 1060 KB |
| `feature-graphic.html` | source of `feature-graphic.png` | HTML | 14 KB |

Play's rules and how these meet them:

- **App icon** (512 x 512, 32-bit PNG, at most 1 MB): `icon-512.png` is the
  full-bleed art of `public/icons/icon-maskable-512.png`, saved as RGBA.
  `public/icons/icon-512.png` is the right size and format too, but it has
  transparent rounded corners baked in, and Play wants a full square (it
  rounds the corners itself), so it would end up with a see-through rim.
- **Feature graphic** (1024 x 500, JPEG or 24-bit PNG, no alpha):
  `feature-graphic.png`, rendered from `feature-graphic.html` on an opaque
  night background. The title and Pip are in the centre, as Google asks (title
  lettering about x=185 to x=839 of 1024, Pip about x=427 to x=618), with only
  background art at the outer edges. Google's page gives no measurements for
  the cutoff zones, so **still to do:** compare it with the red-zone example on
  Google's page and in the Play Console preview.
- **Screenshots** (JPEG or 24-bit PNG, each side 320 to 3840 px, at most 2:1;
  for recommendations, a game needs at least three 16:9 landscape shots
  (1920 x 1080 or more) or three 9:16 portrait shots (1080 x 1920 or more)
  that show the in-game experience): 8 landscape at 1920 x 1080 and 2
  portrait at 1080 x 1920. Shots 02, 03 and 04 are the only three that show
  gameplay, so all three stay in the set.

## Screenshots: what each shows, and a suggested order

**Retake 01, 05 and 07 before production.** They were taken before version 2,
and they are wrong once it is live:

- `01-title.png` says 57 / 102 jokes.
- `05-santas-workshop.png` shows the old upgrade text ("Radar pings twice as
  fast", "Radar shows cracker rarity colours", "Star points to the nearest
  anything").
- `07-joke-gallery.png` says 57 / 102 found, and its filter buttons say 57/102,
  44/70, 10/20 and 3/12.

Retake them from a version 2 build, the way "How they were made" describes,
with the same lived-in save, so the captions and alt text below stay true. Add
the retake to that section, and upload them before you send the production
release (`play/README.md`, Phase 8).

Phone screenshots allow up to 8. Suggested phone set, in this order, with
the gameplay shots first:

1. `02-night-hunt.png`: a night in progress in the village under the northern
   lights: HUD (coins, crackers and presents counts, clock), compass star,
   radar full of treats, a legendary rainbow cracker in reach ("Tap to pull
   the cracker!"), presents, the snow puppy, and the touch controls.
2. `04-present-surprise-reindeer.png`: a present surprise on the Candy Cane
   Forest island: Pip, in a paper crown, riding the red-nosed reindeer, with
   the "Reindeer Ride" banner and buff timer.
3. `03-cracker-joke.png`: a NEW rare cracker joke card ("Why did the penguin
   cross the frozen sea? To go with the floe!") with Read aloud and +10 coins.
4. `01-title.png`: the title screen with the CSS Pip (scarf, bobble hat, paper
   crown), the snow puppy, the 3D village behind, and a lived-in save
   (14 nights, 82 presents, 57 jokes found).
5. `05-santas-workshop.png`: Santa's Workshop upgrades (Radar Range, Cracker
   Sense, Compass Star) with levels and Buy buttons.
6. `06-rewards-milestones.png`: the present milestone track and unlocked
   rewards (Workshop > Rewards).
7. `07-joke-gallery.png`: the Joke Gallery with a legendary Secret Note
   flipped over.
8. `portrait-01-title.png`: the title screen held upright, to show that the
   game also plays that way.

`portrait-02-cracker-joke.png` can replace 6 or 7 if you want a second upright
shot, and the set still has three landscape gameplay shots. For **7-inch and
10-inch tablet** screenshots (and Chromebook), reuse the landscape shots above:
1920 x 1080 fits their rules as well.

**`08-leaderboard.png` is out of the recommended set.** It stays in this
folder, but every row except "You!" is an invented player, and Google asks for
the actual in-game experience. Retake it once testers have real entries on the
board if you'd like to use it.

## Alt text (140 characters or less)

Google asks for alt text on each graphic and each screenshot. It is highly
recommended, not required. I couldn't see where the box sits in Play Console,
so look for it beside each image when you upload.

| File | Alt text |
|---|---|
| `icon-512.png` | Pip the penguin in a gold paper crown, waving on a snowy hill under a starry sky. |
| `feature-graphic.png` | Pip the penguin, a snow puppy, a Christmas tree, a cracker and a present under the title Pip's Christmas Eve Hunt. |
| `02-night-hunt.png` | Pip in a bobble hat hunts through a snowy village at night, with a glowing cracker, pink presents, a snow puppy and a radar. |
| `04-present-surprise-reindeer.png` | Pip rides a red-nosed reindeer through a pink candy cane forest, after a present gives the Reindeer Ride surprise. |
| `03-cracker-joke.png` | A rare cracker joke card. Why did the penguin cross the frozen sea? To go with the floe! Read aloud button, +10 coins. |
| `01-title.png` | The title screen: Pip, a snow puppy, a tree, a cracker and a present over a snowy village, with Start Night and menu buttons. |
| `05-santas-workshop.png` | Santa's Workshop upgrades: Radar Range, Cracker Sense and Compass Star cards, each with its level and a Buy button priced in coins. |
| `06-rewards-milestones.png` | The rewards track in Santa's Workshop: 82 presents opened, with the scarf, snow puppy, candy forest and rainbow trail unlocked. |
| `07-joke-gallery.png` | The Joke Gallery with 57 found, and a grid of joke cards, quotes and a legendary Secret Note. |
| `portrait-01-title.png` | The title screen held upright: Pip, a snow puppy, a tree, a cracker and a present above the Start Night and menu buttons. |
| `portrait-02-cracker-joke.png` | A cracker joke card held upright. What's a penguin's favourite relative? Aunt Arctica! Read aloud button, +5 coins. |
| `08-leaderboard.png` (only if you retake it) | The Best Night leaderboard with snow names and scores, the player's row marked You!, and the card for choosing a snow name. |

## How they were made (and what is staged)

- Every picture is the game itself, unedited: commit `42e4b04` (HEAD when
  they were taken, apart from the two retakes below), run in headless Chrome as an emulator-mode development build
  against local Firebase emulators on spare ports, with touch emulation so
  the HUD shows the phone controls. Nothing touched the real Firebase project,
  and Google and Firebase hosts were blocked in that browser.
- Staged with the development-only `?debug=1` hooks: a lived-in save
  (upgrades, unlocked milestones, found jokes), Pip placed with a cracker and
  presents nearby on map #669296, and the joke and the surprise chosen rather
  than rolled. The Candy Cane Forest in shot 4 is an unlockable map theme.
- The other leaderboard rows are sample snow names written to the local
  emulator, not real players. They look exactly like real entries (names come
  from the same word lists), which is why `08-leaderboard.png` is out of the
  recommended set.
- `03-cracker-joke.png` and `portrait-02-cracker-joke.png` were retaken on 1
  November, after the keyboard key chip was hidden on touch screens, so they
  show no [E]. Keep shot 03 in the set: it is one of only three gameplay shots.
- Landscape shots are 1280 x 720 CSS pixels at device scale 1.5, portrait
  360 x 640 at scale 3.

### Rendering the feature graphic again

1. From the repo root, run `npx vite` (any port).
2. Open `http://localhost:<port>/play/store/feature-graphic.html` in Chrome.
3. DevTools > device toolbar: Responsive, 1024 x 500, device pixel ratio 1.
4. Wait a few seconds for the letters to drop in, then DevTools command menu
   (Ctrl+Shift+P) > "Capture screenshot". The page is opaque, so the PNG has
   no alpha; check with `file feature-graphic.png` (it should say RGB, not
   RGBA).

The idle animations (Pip's wave, the bobbing letters) keep running, so each
capture catches a slightly different moment.
