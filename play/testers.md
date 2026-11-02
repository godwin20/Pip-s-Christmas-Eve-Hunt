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
their phone model and Android version with anything they report.

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

Once the update is out (section 5), add these. The advent calendar isn't on
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
  email. Keep a short log: Google asks for a summary of the feedback and what
  you changed when you apply for production.
- Fix things as they come. Web fixes reach testers at once (the game offers
  "Refresh" on its menus); only Android-side changes need a new bundle on the
  closed track.
- Send one real update during the test (below). A new closed-track bundle may
  need review again, so never send one while another review is running.
- Don't remove anyone from the group or the email list, and don't pause the
  track, until production access is approved.

### The mid-test update

Google recommends updating your app in closed testing before releasing to
production, and asks what you changed when you apply. PrimeTestLab advises at
least one update too. Its claims that an update improves your chances and
doesn't reset the 14 days are its own: Google's page doesn't mention either,
and only says testers must stay opted in.

Make it a real update. The candy, pets, baubles and Wardrobe tree on branch
`feature/candy-baubles-advent` are one, so a new button colour or a bare
version bump isn't needed.

**When:** a few days after the 12th tester opts in, about Mon 16 Nov, so testers
have time to play it. Send the bundle at least 7 days before you apply (Fri 20
Nov at the latest for a Fri 27 Nov application), because a review can take that
long. If the test runs late, still get the web release out before 1 December,
so the calendar is there for its first door.

**Why a web deploy and a bundle:** the game is a website inside an Android
wrapper. The web deploy brings testers the new features, but Play Console
doesn't show it as a release. The version 2 bundle puts the update on record,
and only its version number changes.

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
   (150 / 500):

   ```text
   Version 2: break candy canes, buy and feed pets, shake trees for baubles and decorate your own Christmas tree. An advent calendar opens on 1 December.
   ```

   Then **Publishing overview > Send changes for review**. If you're changing
   the store listing too, do that first, so both go in one review.
8. **Give testers the extra checks** in section 4, and keep logging what they
   report.

The advent calendar stays hidden until 1 December, so testers can't reach it
before you apply. Check it yourself with `npm run dev:cloud` and
`http://localhost:5174/?debug=1&date=2026-12-07`, and again on your phone on 1
December.

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

Not confirmed: the exact names of the Google Groups privacy settings (they
are described here by what they do), what a non-member sees at a group link,
whether one closed track can use an email list and a Google Group together,
exactly where Play Console shows the running count of opted-in testers,
whether a closed track needs a tester list before it can be sent for review,
and whether a new closed-track bundle always goes through review.
