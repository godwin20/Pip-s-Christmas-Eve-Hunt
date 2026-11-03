# The closed test

A new personal developer account can't publish to production until it has
run a closed test with **at least 12 testers who have been opted in
continuously for the 14 days before you apply**. A tester who opts out and
back in starts their 14 days again. Google can also ask for more testing if
the testers didn't really use the app, so ask people to play, not just
install.

Aim for **25 testers**, so a few dropping out doesn't sink it. Count yourself
out: you need 12 or more other people.

The testers come from **PrimeTestLab**, a paid service (next section). The
Google Group route in sections 1 to 3 stays as the option for friends and
family.

## Getting the testers from PrimeTestLab (OWNER)

https://primetestlab.com/ supplies the testers. What its site said on 1
November 2026:

| Plan | Price |
|---|---|
| 12 testers | US$19.99 |
| 25 testers | US$27.99 |
| 25 testers plus written test reports (it calls them QA reports) | US$59.99 |

There is also a service fee, which the page describes unclearly, so check the
total at checkout. It delivers `testers-list.csv` in 4 to 6 hours, and testers
start accepting the same day. Its success figures are its own claims, and the
Google pages checked here don't mention paid testers either way.

**Prefer the 25-tester plan.** A tester who leaves before 14 days doesn't
count, and the opted-in count must stay at 12 or more.

1. **Buy only once the closed release is approved.** Before that the opt-in
   link doesn't work, so the testers would have nothing to accept. The email
   list you made in Phase 5 is waiting for them.
2. **Paste the emails into the closed test's email list.** Play Console >
   **Test and release > Testing > Closed testing > Manage track > Testers**.
   Open the list, paste the addresses from `testers-list.csv` separated by
   commas, and **Save changes**. Paste rather than upload: uploading a file
   replaces the addresses already on the list. Keep the file out of this repo,
   because it is other people's email addresses.
3. **Give PrimeTestLab the opt-in link** (the **shareable link** on the same
   tab), the way your order asks.
4. **Give PrimeTestLab and its testers only the opt-in link and the checks in
   section 4.** Never Play Console access, the keystore, passwords or the
   Google test account.
5. **Tell them: no public Play reviews or ratings.** Google bans incentivised
   reviews, and you are paying for these testers. Testers can't review a test
   version anyway, so this matters once the app is live.
6. **Check the country.** The closed test isn't offered in Brazil or Vietnam
   (`play/README.md`, Phase 5), so a tester whose Play account is in either
   can't install it. If that happens, ask PrimeTestLab for a replacement.
7. **Keep testers in until production access is approved.** Its plans are sold
   as 14 days, and approval can take a week or more after that, so ask its
   support before you pay whether testers stay in until then.

When you apply for production, answer truthfully (`play/README.md`, Phase 7).
Google asks how easy recruiting was and how testers used the app.

## The rules that trip people up

- **Testers need an Android phone and a Google account**, the same account as
  the Play Store on that phone. Children don't need their own: they play on a
  grown-up's phone.
- **The opt-in link only works once the closed test is "Published"**, i.e.
  after Google has reviewed that first closed release (up to about a week for
  new accounts). It can then take a few hours before the link works.
- **Anyone in your internal test can't get the closed test.** Google: a user
  who opts into the internal test is no longer eligible for an open or closed
  test until they opt out of the internal one. Keep the internal test to
  yourself, and leave it before you join the closed test.
- **With a Google Group, people must join the group before they opt in.** On
  an email list they only need the opt-in link.
- **Testers can't leave public reviews** of a test version. They give
  feedback in the game, by email, or privately through Google Play.

## 1. Make the Google Group (OWNER, for friends and family)

Google's help says to select your tester access method, which suggests one
per track, and doesn't say whether a track can use both. If Play Console only
lets you pick one, keep the email list, add friends' and family's addresses to
it, skip this section and section 2, and drop step 1 of the invitation.

1. Go to https://groups.google.com and **Create group**.
2. Name: `Pip's Hunt testers`. Group email: something like
   `pips-hunt-testers@googlegroups.com` (pick a free one).
3. Privacy settings (names vary a little):
   - who can search for the group: only members (or group managers);
   - who can join: **anyone can ask** (you approve each request), or
     **invited only** if you'll add everyone yourself;
   - who can view members: **group managers only**, so testers don't see each
     other's email addresses;
   - who can post and view conversations: **group managers only**. The group
     is just the guest list; feedback comes through the game and email.
4. Create it, and keep its address for Play Console.
5. Open the group link from a Google account that isn't a member. If no **Ask
   to join** appears, set **Who can search for group** to **Anyone on the
   web** and keep **Who can view members** on managers only. Or invite each
   address yourself, and change step 1 of the invitation to "accept the group
   invitation email".

## 2. Point the closed test at the group (OWNER)

Play Console > your app > **Test and release > Testing > Closed testing >
Manage track > Testers**:

1. Choose **Google Groups** and enter the group's address.
2. **Feedback URL or email address:** your public email. It shows on the
   opt-in page.
3. **Save changes**, then copy the **shareable link** (the opt-in link). It
   shows once the release is published.

The release itself: **Create new release** on the same track, add the bundle
you already tested internally (from the app bundle library) or a newer one,
then send it for review (Publishing overview). See `play/README.md`, Phase 5.

## 3. The invitation for friends and family (copy, adjust, send)

PrimeTestLab's testers don't need this. Send it when the group exists. People can join the group straight away; send
the opt-in link as soon as Play shows it.

> **Subject: Help me test Pip's Christmas Eve Hunt (about 3 weeks, Android)**
>
> Hello!
>
> I've made a little 3D Christmas game for kids and families: Pip the penguin
> waddles around a snowy island every night, pulling crackers for jokes and
> opening presents full of surprises. It's on the web already, and I'm getting
> it onto Google Play for Christmas.
>
> Google only lets a new developer publish after **12 people have tested the
> app for 14 days in a row**, so I'd love your help. It's free, there are no
> ads and nothing to buy.
>
> **You need:** an Android phone and the Google account you use for the Play
> Store.
>
> **What to do:**
>
> 1. Join the testers group (with that same Google account): [GROUP LINK]
> 2. When I send the test link, open it on your phone, tap to become a tester,
>    then install the app from the Play Store link on that page.
> 3. Play it a few times over the next two weeks (with your kids, if you
>    have some!) and tell me what you think, using the Feedback button in
>    the game or by replying to this email.
> 4. **Please stay in the test until I say it's done** (around
>    [DATE: 14 days after the test opens, plus about 10 days]). Leaving the test
>    or the group resets Google's count. Uninstalling is fine but please keep
>    playing now and then.
>
> **Privacy:** the group list shows me your Google email address, and nobody
> else can see it. The game itself doesn't see your email unless a grown-up
> chooses "Sign in with Google" in the game. What the game keeps is here:
> https://godwin20.github.io/Pip-s-Christmas-Eve-Hunt/privacy.html
>
> Thank you, it really helps!

Send short reminders around day 3, day 8 and day 12 ("Still in the test?
Thank you! A few more days to go").

## 4. What to ask testers to check

Put this list in a follow-up email once they've installed. Ask them to say
their phone model and Android version with anything they report, and to send
it through the private feedback option on the app's Play Store page as well as
the game's Feedback button, so it shows in Play Console too.

1. **Install:** the app installs from the Play Store link, and the icon says
   "Pip's Hunt".
2. **Opening:** a dark blue splash screen, then the game. There should be
   **no address bar or website link at the top**. (If there is, tell me
   straight away: it means the app isn't verified yet.)
3. **Play a night:** move, look around, belly-slide, pull a cracker, open a
   present, fly home at the sleigh. Does it feel smooth? Any sound problems?
4. **Offline:** after playing once online, turn on aeroplane mode, close the
   app fully (swipe it away), open it again. It should start and play a
   night. Turn aeroplane mode off afterwards; the night's progress should
   sync.
5. **Google sign-in (grown-ups, optional):** tap Sign in with Google (on the
   title screen, or Leaderboard > Play on any device), answer "When were you
   born?", choose a Google account. Does it come back to the game signed in,
   with progress kept? (This is the part I most need
   tested: so far it's only been tried on one phone.) Signing in keeps the
   account's email, name, photo and Google account ID with the game, as the
   privacy page says;
   skip this if you'd rather not.
6. **Feedback button:** Feedback on the title or results screen: pick stars
   and a topic, send. Does it say thank you?
7. **Privacy link:** title screen > Privacy > the privacy policy link opens
   the policy, and Back returns to the game.
8. **Optional, only if you don't mind losing your progress:** Privacy >
   "Delete my saved data". After it, the game should start fresh as a new
   guest. If you signed in with Google a while before, it asks a grown-up to
   "Confirm with Google to finish deleting": please do, and say whether the
   Google window opened and the game then said "All deleted".

Once version 2 is out (section 5), add these. The advent calendar isn't on
the list, because it stays hidden until 1 December.

9. **Candy:** at a little candy cane in the snow, tap, or belly-slide through
   it. Does it break and give candy?
10. **Pets:** Santa's Workshop > Pets. Buy a pet (the first one takes a night
    or two of candy), Feed it, tap Bring along, then start a night. Does it
    follow Pip?
11. **Baubles:** tap by a pine tree or a lollipop tree to shake it. Not every
    tree drops a bauble, so try a few. Then Santa's Workshop > Wardrobe > Your
    Christmas Tree: hang it. Does it show on Pip's Tree in the village on the
    next night?
12. **Smoothness:** does a night feel as smooth as it did before the update?
    Please give your phone model if it feels slower.

Good to know: the app and Chrome on the same phone share the game's save. If
someone played the web version in Chrome before, the app carries on from
there, and "Delete my saved data" in either clears both.

## 5. During the 14 days (OWNER)

- **The 14 days are counted from the day the 12th tester opts in.** Apply no
  earlier than that date + 14: for example, opted in Fri 13 Nov, apply Fri 27
  Nov. Check the count in Play Console (the closed testing track, and the
  Dashboard's production access steps), and note the date.
- Read feedback in three places: Firebase console > Firestore > `feedback`
  (the in-game button), Play Console > **Monitor and improve > Ratings and
  reviews > Testing feedback** (private feedback through Play), and your
  email. Keep a short log of what each tester reported, when, and what you
  changed because of it: Google asks for a summary of the feedback and what
  you changed when you apply for production.
- Fix things as they come. Web fixes reach testers at once (the game offers
  "Refresh" on its menus), but they don't show as a release in Play Console.
  Android-side changes need a new bundle on the closed track.
- Send two real updates during the test (below). A new closed-track bundle may
  need review again, so never send one while another review is running.
- Don't remove anyone from the group or the email list, and don't pause the
  track, until production access is approved.

### Two mid-test releases

Google recommends updating your app in closed testing before releasing to
production, and asks what you changed when you apply. PrimeTestLab advises at
least one update too. Its claims that an update improves your chances and
doesn't reset the 14 days are its own: Google's page doesn't mention either,
and only says testers must stay opted in.

Plan on two, because the game is a website inside an Android wrapper: web fixes
reach testers but never show as a release in Play Console. Google's refusal
email, as two developers quote it, gives "acting on user feedback through
updates to your app" as part of testing best practice. FlexBuddy, a wrapped web
app like this one, was refused on 24 October 2026. Its record blames one update
near the start with every later change only on its website, testers from an
exchange service who barely used the app, and feedback that listed topics
rather than what happened. Kala Nera Guide, also a wrapped web app, got
production access after a second test with 3 releases. These are a few
developers' own records, not proof, and Google doesn't say how many updates it
wants, but a second release costs little.

| Release | When | What it carries |
|---|---|---|
| Version 2 | 12th tester's opt-in date + 3 days, about Mon 16 Nov | The new features |
| Version 3 | Opt-in date + 10 days, about Mon 23 Nov, once version 2's review has finished | Fixes for what testers reported |

If the opt-in date moves, both move with it.

### Version 2: the new features

Make it a real update. The candy, pets, baubles, Wardrobe tree and new jokes
on branch `feature/candy-baubles-advent` are one, so a new button colour or a
bare version bump isn't needed.

**When:** a few days after the 12th tester opts in, about Mon 16 Nov, so testers
have time to play it. Send the bundle at least 7 days before you apply (Fri 20
Nov at the latest for a Fri 27 Nov application), because a review can take that
long. Sending it later than Mon 16 Nov squeezes version 3, whose turn comes
after this review. If the test runs late, still get the web release out before
1 December, so the calendar is there for its first door.

**Why a web deploy and a bundle:** the game is a website inside an Android
wrapper. The web deploy brings testers the new features, but Play Console
doesn't show it as a release. The version 2 bundle puts the update on record,
and only its version number changes.

**Before anything else, by Sun 8 Nov: read the 98 new jokes.** A web deploy gets
no Play review, so you are the only check before children see them. They are
`j071` to `j136`, `q021` to `q040` and `s013` to `s024` in `src/data/jokes.js`.
Read them against `content-rating.md`. Removing or changing an entry is safe only
before the release: once a player has found one, its id is in their save for
good. If you remove any, the counts must change everywhere they are given: the
release notes in step 7, the store listing (`store/listing.md`),
`play/README.md` (Phase 7 and "Later releases"), `docs/CONTRACT.md`,
`content-rating.md` and `README.md`.

1. **Deploy the Firestore rules first.** The live rules refuse every save with
   the new fields, and the GitHub deploy doesn't publish them:

   ```bash
   npx firebase deploy --only firestore:rules --project pip-s-christmas-eve-hunt
   ```

2. **Set "Last updated" to that day** in `public/privacy.html`,
   `public/delete-data.html` and `POLICY_UPDATED` in `src/ui/privacy-text.js`.
3. **Merge the branch into `main` and push.** GitHub Pages publishes it.
4. **Check the live game on your phone:** take the Refresh on the menus, play a
   night, break a cane, buy a pet and hang a bauble.
5. **Build version 2 in your own terminal.** `update` raises the version code
   to 2, and `build` asks for the keystore passwords. Same keystore as before.

   ```bash
   cd ~/pips-hunt-android
   npx --yes @bubblewrap/cli@1.27.0 update
   npx --yes @bubblewrap/cli@1.27.0 build
   ```

   Copy the updated `twa-manifest.json` to your backups.
6. **Check it on the internal test first** (`play/README.md`, "Later releases"):
   no address bar, and the game opens.
7. **Put the same bundle on the closed test.** **Create new release** on the
   same track, add it from the app bundle library, and use these release notes
   (185 / 500):

   ```text
   Version 2: break candy canes, buy and feed pets, shake trees for baubles, decorate your own Christmas tree and find 98 new jokes, for 200 in all. An advent calendar opens on 1 December.
   ```

   Before you send it, paste the new joke count into the store listing (the
   full description in `store/listing.md`), so both go in one review, but only
   if the jokes that are live match it: the Gallery on the live game must say
   200. Make any other store listing changes at the same time. Then
   **Publishing overview > Send changes for review**.
8. **Give testers the extra checks** in section 4, ask them to update from the
   Play Store, and keep logging what they report.

The advent calendar stays hidden until 1 December, so testers can't reach it
before you apply. Check it yourself with `npm run dev:cloud` and
`http://localhost:5174/?debug=1&date=2026-12-07`, and again on your phone on 1
December.

### The check a week in

At the opt-in date + 7, about Fri 20 Nov, look at three things in Play Console
and your log:

- **Opted-in testers:** still 12 or more?
- **Active devices** in the app's statistics: does the number look like the
  testers you have?
- **Feedback:** are reports coming in, and do they say what happened?

If any of these look low, chase the testers first: remind them, and ask
PrimeTestLab what's going on. Low numbers most likely mean people aren't
playing. Nothing forces you to apply on day 14, so a few more days of real play
is a better trade than applying on time with a thin test.

### Version 3: what testers told you

This is the release that shows you acted on feedback, so it has to be real.
Build it from your log: a bug a tester hit, something that confused them, a
phone it ran badly on. If testers have reported nothing, chase them rather than
make something up.

**When:** about Mon 23 Nov, once version 2's review has finished and testers
have had it for a few days. Never while version 2 is still in review. If that
review still hasn't finished by Wed 25 Nov, skip version 3: apply on time with
version 2 alone, and ship the fixes as web deploys.

1. **Pick the fixes from your log.** Only what testers really reported, and only
   what you can check.
2. **Ship them on the website:** fix, merge into `main` and push. If a fix
   changes what the game keeps or what `firestore.rules` allows, do those steps
   first (`play/README.md`, "Later releases").
3. **Check the live game on your phone.**
4. **Build version 3 and check it,** the same way as version 2's steps 5 and 6.
   The bundle again changes only the version number, so the fixes are in the
   web deploy and the release notes are what name them.
5. **Put the same bundle on the closed test,** as in version 2's step 7, with
   release notes that say what changed in plain words:

   ```text
   Version 3: fixes from tester feedback. [What changed, one short line each.]
   ```

6. **Tell testers it's there.** Ask them to update from the Play Store and try
   again whatever they reported.
7. **Finish the log entry:** who reported it, what, when, what changed and in
   which version. You'll need this for Phase 7.

If version 3 is still in review on Fri 27 Nov, let it finish before you apply.
A review sent on Wed 25 Nov should finish by Wed 2 Dec, and applying that day
still leaves 9 days before Christmas for one rejection.

## 6. After production access

Testers can stay in the group or on the list. When the production release
goes live, their app keeps updating like everyone else's (devices get the
highest version on any track they may receive). You can pause the closed track
later (**Manage track > Pause track**); the app stays installed on their
phones.

## Sources

- App testing requirements for new personal developer accounts (rechecked on
  2 November 2026 for updates during the test):
  https://support.google.com/googleplay/android-developer/answer/14151465
- Set up an open, closed, or internal test (Google Groups, opt-in links, the
  internal-test rule, feedback channel, email lists):
  https://support.google.com/googleplay/android-developer/answer/9845334
- Google Groups help (finding and joining a group, setting names):
  https://support.google.com/groups/answer/1067205 and
  https://support.google.com/groups/answer/2464926
- PrimeTestLab's own site, for its plans, prices and timings:
  https://primetestlab.com/
- Developers' own records of refused closed tests, quoting Google's email
  (checked on 2 November 2026). FlexBuddy:
  https://github.com/afa000/flexbuddy/blob/main/android/production-access.md
  and Graditone: https://github.com/graditone/graditone/issues/396
- Kala Nera Guide's records of its second test and production access. Don't
  copy its advice on leaving paid testers off the form:
  https://github.com/evertvanlaar/CursorKNBD/blob/main/docs/play-store-release/A5-production-access-round2.md
  and https://github.com/evertvanlaar/CursorKNBD/blob/main/docs/play-store-release/A6-deep-links-assetlinks.md

Not confirmed: the exact names of the Google Groups privacy settings (they
are described here by what they do), what a non-member sees at a group link,
whether one closed track can use an email list and a Google Group together,
exactly where Play Console shows the running count of opted-in testers,
whether a closed track needs a tester list before it can be sent for review,
whether a new closed-track bundle always goes through review, how many updates
Google wants to see, whether it treats Play's private feedback differently from
other feedback, what the private feedback option is called on the Play Store
page, whether Play Console shows active devices for the closed test alone, and
whether you can apply while a closed-track review is running.
