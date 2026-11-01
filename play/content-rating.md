# Content rating, target audience and the other App content answers

All of these are on Play Console > your app > **Monitor and improve > Policy
and programs > App content**. Do them in this order: Privacy policy, Ads and
Sign-in details first (the Target audience section asks for them), then
Target audience and content, Content rating, Data safety
(`data-safety.md`) and the short declarations at the end.

What I checked in the game for these answers: the 12 surprises
(`src/game/surprises.js`, `docs/CONTRACT.md`), all 102 jokes and notes
(`src/data/jokes.js`, read for anything rude, scary, about alcohol,
gambling or violence; what turned up is in the table below), the leaderboard
and feedback (`docs/CLOUD.md`).

## Content rating (IARC questionnaire)

1. **Content rating > Start.** Enter the email address for the rating
   certificates (use the public address from `play/README.md`; the
   International Age Rating Coalition writes to it).
2. **Category:** the game category ("Game"; the other categories are for
   social, reference, entertainment and utility apps).
3. Answer the questions. The questionnaire's exact wording isn't on any public
   Google page, so here are the topics it covers and the answer for each.
   Answer "No" unless the question really describes something in the game.

| Topic | Answer | What is actually in the game |
|---|---|---|
| Violence (fighting, weapons, harm to characters, blood) | **No** | Nobody attacks anyone. The **Snowball Storm** surprise: snowballs fall from the sky around Pip for 8 seconds and land in a puff; each one that lands near Pip is +1 coin. No one throws them at anyone. The **Sneaky Gremlin** pinches 10 coins and runs away; Pip catches it by reaching it within 10 seconds (it "coughs up" 25 coins) or it vanishes in a puff. When caught, the gremlin spins with cartoon stars round its head and drops its sack. If Pip slides into something he bounces off with a wince and a thud. No attacks, no health, no damage. Belly-sliding is just faster movement. |
| Fear, horror, scary content | **No** | A cosy snowy night with fairy lights. Four jokes use spooky words (vampire, scare, mummies, cari-BOO). The gremlin is a cheeky goblin shown with a devil-face emoji, and a giggly clown boings out of a box. All comic, nothing frightening. |
| Sexuality, nudity, suggestive themes | **No** | |
| Bad language, crude or toilet humour | Bad language: **No**. Crude or toilet humour: **read the Console's exact wording first** | There is no swearing, so bad language is No. The jokes stay, and they are puns and cosy Christmas quotes, plus one nose-picking joke (j014, "He was picking his nose!") and one smell pun (j043, "Jingle smells!"). If the Console's question covers crude or toilet humour, answer **Yes** at the mildest level, then check the resulting rating. If it asks only about something stronger, answer No. |
| Drugs, alcohol, tobacco | **No** | None in the jokes or the world. |
| Gambling (real or simulated) | **No** | The presents hold random surprises (coins, a snow puppy, a lump of coal that says "Merry Christmas anyway!"...), but nothing is staked or bet, there are no casino-style games, and no real money is involved anywhere. Coins are earned only by playing and spent only on Santa's Workshop upgrades. |
| Random items that can be bought (loot boxes) | **No** | Nothing can be bought with real money. Coins earned in play buy fixed upgrades; no upgrade or present is sold as a random item. |
| Users can interact or exchange content (chat, voice, sharing photos or text) | **No** | No chat or messages. The leaderboard shows only snow names built from the game's word lists (such as "Jolly Penguin 42") and scores; players can't type anything others see. Feedback goes one way, to the developer only, and nobody else ever sees it. |
| Shares the user's location with other users | **No** | The game never asks for location. |
| Digital purchases | **No** | No in-app purchases, no Play Billing (switched off in the Android app). |
| Unrestricted internet access (a web browser or search engine) | **No** | The app only opens the game's own site. The privacy contact opens the phone's email app. |
| Hate symbols, discrimination | **No** | |

The rating authorities work out the result, so nobody can promise it. If
every answer is No, the likely result is ESRB **Everyone**, PEGI **3**, USK
**all ages**, ClassInd **L**, Australia **G**, and a generic **3+** elsewhere.
A Yes on crude humour may move some of these up. Read the summary page. If
anything is higher than you expect, check each answer against the table, but
never change a true answer to get a lower rating: a wrong answer can get the
app removed. If the result looks too high for a game aimed at ages 6 and up,
stop before you submit and look at it again. Then **Submit**.

If the game ever gets new content (for example a surprise where things are
thrown at characters, or any free text other players can see), retake the
questionnaire before that version ships. Web deploys go live without Play
review, so this has to be remembered by hand.

## Target audience and content

**Target age groups** (Play's labels): tick

- [ ] Ages 5 and under: **leave unticked**
- [x] Ages 6–8
- [x] Ages 9–12
- [x] Ages 13–15
- [x] Ages 16–17
- [x] Ages 18 and over

Why: the game is made for kids to play with their families, and grown-ups
have their own parts (Google sign-in, the feedback note). That is the
"designed for everyone, including children" case, so the Families policy
applies. Google's own tips say under-6 apps should avoid quick reactions,
fine motor skills and game penalties; Pip's hunt has the two-thumb touch
controls, a 10-second gremlin chase, coins that can be pinched and coal, so
5 and under would overstate it. For 6–8 Google mentions early readers,
slapstick humour and collecting, which fits (jokes can be read aloud, and
there's lots to collect). Google also warns to tick groups that include
adults only if the app is really designed for all ages, which this is (family
play, grown-ups' gate). If the Console asks whether the app or its store
listing appeals to children: **Yes**.

**Ads:** the section repeats your Ads answer: **No ads**. With no ads, the
neutral age screen and Families ads SDK questions don't apply. (Those are
about ads only. The game does have a neutral age screen, in front of Google
sign-in and the feedback note: see the Families checklist below.)

**Store presence:** Teacher Approved is optional. Google may rate the app for
it but doesn't promise to. Leave it until after launch.

**Families badge:** after the checklist below, opt in to "Committed to follow
the Play Families Policy" (it then shows in the Data safety section).

### Families policy checklist

| Requirement (paraphrased) | Pip's hunt |
|---|---|
| Content accessible to children is appropriate for children | Yes (see the rating answers above). |
| The app must not merely provide a webview of a website, or mainly drive affiliate traffic to one, without permission from the website owner or administrator | **The risk.** It's a full game that installs, plays offline after the first launch and shows no browser bar, but it is our site in Chrome. We own and administer the site, which helps. It isn't clear whether the permission wording covers webviews or only the affiliate traffic, so a reviewer could still read it strictly. Bubblewrap itself warns that TWAs may not suit apps for under-13s. See "Read first" in `play/README.md`. |
| Accurate answers in Target audience, Data safety and the IARC questionnaire | This folder. |
| Disclose personal and sensitive data collected from children | `data-safety.md` and the privacy policy. |
| Mixed audiences must not send the advertising ID or hardware IDs from children or users of unknown age | None are sent. The Android app asks players for no permissions (with `enableNotifications: false` and `fallbackType: customtabs`). After the first upload, check the bundle's permissions in Play Console (**App bundle explorer**, or **Latest releases and bundles** in newer menus): the only permission listed should be the internal `io.github.godwin20.pipshunt.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, which Android adds itself and players never see a prompt for. There must be no `com.google.android.gms.permission.AD_ID`, `INTERNET` or `POST_NOTIFICATIONS` entry. |
| No location for apps aimed only at children | No location at all. |
| Mixed audiences: services not approved for children only behind a neutral age screen, or used so that no data is collected from children; children must never need them to play | Google sign-in (through Firebase) is optional and behind a **neutral age screen**, and the whole game works without it. On phones, tablets and Safari the sign-in code does load a small helper from Google at start-up, for every player, which sees the IP address like any web request, so the Sign-in details note below tells the reviewers. Every "Sign in with Google" (and the grown-ups' feedback note) first asks "When were you born?": month and year, both blank to start, every year listed, no hint of which answers pass, and a younger answer can't be changed for 24 hours on that device. The answer stays on the device. See `play/README.md`, Phase 0, and `docs/CLOUD.md`, "Grown-ups gate for Google sign-in". |
| Social features: reminders, adult controls | None: no chat, no user-to-user content. Feedback is one-way to the developer, the grown-up note sits behind the same age screen, and the leaderboard has no free text. |
| COPPA, GDPR and other laws | Your responsibility as the developer; the game keeps the minimum (a random ID and progress for children). Get advice if you're unsure. |
| No real or simulated gambling | None (see above). |

## Other App content declarations

| Declaration | Answer |
|---|---|
| **Privacy policy** | `https://godwin20.github.io/Pip-s-Christmas-Eve-Hunt/privacy.html`. It must be a normal public web page (not a PDF), open worldwide without a login, and be linked inside the app too: the in-game Privacy screen links to it. |
| **Ads** | **No, my app does not contain ads.** |
| **Sign-in details** (formerly "App access") | Use **Sign-in details > + Add new instructions**. Don't choose an "all functionality is available" answer: the game plays fully as a guest, but cross-device progress sits behind Google sign-in, and Google says it must be able to reach every feature. First make a throwaway Google test account: 2-step verification off, a password that won't expire, and never a personal account. Enter its username and password, then under **Any other instructions** paste: "No login is needed to play: the whole game works as a guest. To test the optional Sign in with Google on the title screen: at 'When were you born?' pick any month and a year 19 or more years back (1990, say), Continue, Continue to Google, then use this test account. A younger answer hides the question on that browser for 24 hours (clear the site's data to see it again). On phones and tablets the sign-in code loads a small helper from Google when the game starts; the sign-in itself only happens after that age question." |
| **Advertising ID** | **No** (if the Console asks whether the app uses an advertising ID). |
| **Government apps** | **No**, not a government app. |
| **Financial features** | **My app doesn't provide any financial features.** |
| **Health apps** | **My app doesn't provide any health features.** Google requires this form even from apps with no health features, and on closed testing too, so do it before the first closed release. |
| **News apps** | **No**, not a news app. |
| **Data safety** | See `data-safety.md`. |
| **Trader status** | This one is on your account, not on this page: Play Console > **Manage account > Account details > About you**. It is your own legal declaration, so only you can make it. Google says a personal hobby is "unlikely" to make you a trader, so **non-trader** is the likely honest answer for a free personal game with no ads and no purchases. Rethink it if the game is connected to a business. Details, and what each answer means, are in `play/README.md`, Phase 5, step 4. Only traders go on to confirm the status per app in App content. |
| Anything else (COVID-19 apps, photo and video permissions, foreground services, full-screen intents, exact alarms) | Not applicable: the app asks players for no permissions, and its one internal entry (see the Families checklist above) isn't any of these. Answer that it doesn't use them, if asked. |

## Sources

- Content Ratings policy:
  https://support.google.com/googleplay/android-developer/answer/9898843
- Content rating requirements (steps and rating authorities):
  https://support.google.com/googleplay/android-developer/answer/9859655
- Manage target audience and app content settings (age groups and the tips
  per age group, neutral age screen):
  https://support.google.com/googleplay/android-developer/answer/9867159
- Google Play Families Policies:
  https://support.google.com/googleplay/android-developer/answer/9893335
- Prepare your app for review (privacy policy rules, Ads, Sign-in details):
  https://support.google.com/googleplay/android-developer/answer/9859455
- Financial features declaration:
  https://support.google.com/googleplay/android-developer/answer/13849271
- Health apps declaration:
  https://support.google.com/googleplay/android-developer/answer/14738291
- Sign-in details for reviewers:
  https://support.google.com/googleplay/android-developer/answer/15748846
- Trader status:
  https://support.google.com/googleplay/android-developer/answer/17594752
- What each rating means:
  https://support.google.com/googleplay/answer/6209544

Not confirmed from a Google page: the questionnaire's exact question wording
(IARC shows it only inside the Console), the Advertising ID, Government apps
and News apps prompts (seen in third-party guides), and whether a missing
trader declaration stops Send for review by itself.
