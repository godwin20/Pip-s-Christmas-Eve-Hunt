# Google Play store listing: Pip's Christmas Eve Hunt

Everything for the Play Console's **Store presence > Main store listing**
page, plus the graphics in this folder. Package
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

### Full description (3010 / 4000)

Plain text: Play shows the line breaks as written, and the bullets are the
`•` character. No emoji, no "best" / "#1" / "download now" / price wording.

```text
It's Christmas Eve, and Pip the penguin has one night to find the crackers and presents hidden all over a snowy island before morning comes. Waddle, belly-slide and explore a cosy village of twinkly trees, gingerbread houses and candy-cane lamps under the northern lights.

A gentle, cheerful 3D hunt for children and grown-ups to play together. A night lasts about five minutes, just right for a quick game before bed.

CRACKERS AND JOKES
Pull a Christmas cracker to win a paper crown, a few coins and a joke. There are 102 to collect: silly cracker jokes, cosy sayings and legendary Santa's Secret Notes. Tap "Read aloud" to hear the joke in a funny voice.

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
• Optional: behind a quick grown-ups question, you can link a Google account to keep progress safe and play on any device.
• "Delete my saved data" on the in-game Privacy screen removes the player's saved progress, leaderboard entry, feedback and any Google sign-in from the cloud.
• The optional star rating sends feedback only to the game's maker. A written note is only offered behind the grown-ups question.

Merry Christmas from Pip!
```

### Release notes for the first release (208 / 500)

```text
The first Google Play release of Pip's Christmas Eve Hunt! Pull crackers for 102 jokes, open presents full of surprises, upgrade your radar in Santa's Workshop and unlock new outfits for Pip. Merry Christmas!
```

## Category and tags

- **App or game:** Game.
- **Category:** **Casual** (Games > Casual). "Family" is not a Play category
  any more: the family-friendly placement comes from the target audience and
  content settings (ages including under 13, so the Families policy applies).
  Adventure would be the second choice if Casual ever feels wrong.
- **Tags** (Store settings > Store listing tags, up to 5, picked from Play's
  own list, whose names vary a little): Casual, Single player, Offline,
  Cute / Cartoon (or Stylized), Exploration. Choose the closest ones offered.

## Contact details (Store settings > Store listing contact details)

- **Email (required, shown publicly on the listing):** `<developer contact email>`.
  A placeholder on purpose: decide which address to publish. The in-game
  privacy screen uses `PRIVACY_CONTACT` in `src/cloud/config.js` (currently the
  owner's personal address), and a personal Play developer account shows its
  developer email publicly too, so a dedicated address may be nicer. Use the
  same one in the privacy policy so they agree.
- **Website (optional):** `https://godwin20.github.io/Pip-s-Christmas-Eve-Hunt/`
- **Phone (optional):** leave empty.
- **Privacy policy URL** (App content > Privacy policy):
  `https://godwin20.github.io/Pip-s-Christmas-Eve-Hunt/privacy.html`
  (`public/privacy.html`; it answers 200 only once the next web deploy is
  live). The account deletion URL for the Data safety form is
  `https://godwin20.github.io/Pip-s-Christmas-Eve-Hunt/delete-data.html`.

## Graphics in this folder

| File | Size (px) | Format | File size |
|---|---|---|---|
| `icon-512.png` | 512 x 512 | 32-bit PNG (RGBA, fully opaque) | 153 KB |
| `feature-graphic.png` | 1024 x 500 | 24-bit PNG (RGB, no alpha) | 348 KB |
| `screenshots/01-title.png` | 1920 x 1080 | 24-bit PNG (RGB, no alpha) | 1340 KB |
| `screenshots/02-night-hunt.png` | 1920 x 1080 | 24-bit PNG (RGB, no alpha) | 1106 KB |
| `screenshots/03-cracker-joke.png` | 1920 x 1080 | 24-bit PNG (RGB, no alpha) | 1242 KB |
| `screenshots/04-present-surprise-reindeer.png` | 1920 x 1080 | 24-bit PNG (RGB, no alpha) | 998 KB |
| `screenshots/05-santas-workshop.png` | 1920 x 1080 | 24-bit PNG (RGB, no alpha) | 795 KB |
| `screenshots/06-rewards-milestones.png` | 1920 x 1080 | 24-bit PNG (RGB, no alpha) | 821 KB |
| `screenshots/07-joke-gallery.png` | 1920 x 1080 | 24-bit PNG (RGB, no alpha) | 679 KB |
| `screenshots/08-leaderboard.png` | 1920 x 1080 | 24-bit PNG (RGB, no alpha) | 716 KB |
| `screenshots/portrait-01-title.png` | 1080 x 1920 | 24-bit PNG (RGB, no alpha) | 1107 KB |
| `screenshots/portrait-02-cracker-joke.png` | 1080 x 1920 | 24-bit PNG (RGB, no alpha) | 1056 KB |
| `feature-graphic.html` | source of `feature-graphic.png` | HTML | 13 KB |

Play's rules and how these meet them:

- **App icon** (512 x 512, 32-bit PNG, at most 1 MB): `icon-512.png` is the
  full-bleed art of `public/icons/icon-maskable-512.png`, saved as RGBA.
  `public/icons/icon-512.png` is the right size and format too, but it has
  transparent rounded corners baked in, and Play wants a full square (it
  rounds the corners itself), so it would end up with a see-through rim.
- **Feature graphic** (1024 x 500, JPEG or 24-bit PNG, no alpha):
  `feature-graphic.png`, rendered from `feature-graphic.html` on an opaque
  night background. The title and Pip sit well inside the edges.
- **Screenshots** (JPEG or 24-bit PNG, each side 320 to 3840 px, at most 2:1;
  at least 4 at 1080 px or more in 16:9 / 9:16 to be eligible for
  recommendations): 8 landscape at 1920 x 1080 and 2 portrait at 1080 x 1920.

## Screenshots: what each shows, and a suggested order

Phone screenshots allow up to 8. Suggested phone set, in this order:

1. `01-title.png`: the title screen with the CSS Pip (scarf, bobble hat, paper
   crown), the snow puppy, the 3D village behind, and a lived-in save
   (14 nights, 82 presents, 57 / 102 jokes).
2. `02-night-hunt.png`: a night in progress in the village under the northern
   lights: HUD (coins, crackers and presents counts, clock), compass star,
   radar full of treats, a legendary rainbow cracker in reach ("Tap to pull
   the cracker!"), presents, the snow puppy, and the touch controls.
3. `03-cracker-joke.png`: a NEW rare cracker joke card ("Why did the penguin
   cross the frozen sea? To go with the floe!") with Read aloud and +10 coins.
4. `04-present-surprise-reindeer.png`: a present surprise on the Candy Cane
   Forest island: Pip, in a paper crown, riding the red-nosed reindeer, with
   the "Reindeer Ride" banner and buff timer.
5. `05-santas-workshop.png`: Santa's Workshop upgrades (Radar Range, Cracker
   Sense, Compass Star) with levels and Buy buttons.
6. `06-rewards-milestones.png`: the present milestone track and unlocked
   rewards (Workshop > Rewards).
7. `07-joke-gallery.png`: the Joke Gallery with a legendary Secret Note
   flipped over.
8. `08-leaderboard.png`: the leaderboard with snow names, "You!" on the
   player's row, and the snow name card.

The portrait shots, `portrait-01-title.png` and
`portrait-02-cracker-joke.png`, can replace 6 and 7 if you want the carousel
to show that the game also plays upright. For **7-inch and 10-inch tablet**
screenshots (and Chromebook), reuse the landscape set: 1920 x 1080 fits their
rules as well.

## How they were made (and what is staged)

- Every picture is the game itself, unedited: commit `42e4b04` (HEAD when
  they were taken), run in headless Chrome as an emulator-mode development build
  against local Firebase emulators on spare ports, with touch emulation so
  the HUD shows the phone controls. Nothing touched the real Firebase project,
  and Google and Firebase hosts were blocked in that browser.
- Staged with the development-only `?debug=1` hooks: a lived-in save
  (upgrades, unlocked milestones, found jokes), Pip placed with a cracker and
  presents nearby on map #669296, and the joke and the surprise chosen rather
  than rolled. The Candy Cane Forest in shot 4 is an unlockable map theme.
- The other leaderboard rows are sample snow names written to the local
  emulator, not real players. They look exactly like real entries (names come
  from the same word lists).
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
