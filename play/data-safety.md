# Data safety form: the answers

Play Console > your app > **Monitor and improve > Policy and programs > App
content > Data safety**. These answers match what the game does today
(`docs/CLOUD.md`, `src/cloud/`, and the wording in `src/ui/privacy-text.js`
that the in-game Privacy screen and the public privacy and delete pages
share). If the game changes what it keeps, change this form the same day:
web deploys reach the Play app without any Play review, so nothing else will
catch it.

The form covers the web content too. Play counts data collected in a web view
the app controls, and the app is our own site in Chrome.

## Before you start

- [ ] https://godwin20.github.io/Pip-s-Christmas-Eve-Hunt/privacy.html is
      live. The form needs a privacy policy URL first (App content >
      Privacy policy).
- [ ] https://godwin20.github.io/Pip-s-Christmas-Eve-Hunt/delete-data.html is
      live.
- [ ] "Delete my saved data" really deletes a Google player's sign-in: the
      "Confirm with Google" step for `auth/requires-recent-login` (done in
      the working tree on 30 October, tested against the emulators) is
      committed, deployed and tried once on the real project. Until then the
      answer "Yes, users can delete their account" isn't fully true for
      Google players.

## Step 1: Overview

Read it and select **Next**.

## Step 2: Data collection and security

| Question in the form | Answer | Why |
|---|---|---|
| Does your app collect or share any of the required user data types? | **Yes** | Cloud saves, the leaderboard, Google sign-in and feedback send data to Firebase. |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | Everything goes over HTTPS (TLS): Firebase Authentication, Firestore and GitHub Pages. |
| Do you provide a way for users to request that their data is deleted? | **Yes** | "Delete my saved data" in the game (Privacy screen and account card), the delete page, and email to the privacy contact. |

### Account creation and deletion

The form then asks about accounts. I took these labels from third-party
guides, not from a Google page, so they may be worded a little differently
in your Console.

| Question | Answer | Why |
|---|---|---|
| Which methods of account creation does your app support? | **OAuth** only | "Sign in with Google" is OAuth through Firebase. The automatic guest player is a random ID the game makes for itself; nobody signs up for it. If the form offers no OAuth option, pick the one closest to signing in with another provider, and say so in the notes. |
| Delete account URL (Google calls it a link users can use to request that their account and associated data is deleted) | `https://godwin20.github.io/Pip-s-Christmas-Eve-Hunt/delete-data.html` | Google wants a page that names the app (as it appears on the store listing), shows the steps up front, lets people ask without reinstalling the app, and says what is deleted, what is kept and for how long. |
| Can users ask to delete some or all of their data without deleting their account? | **No** for now; **Yes** with the same URL once the delete page has a short "delete only some of it" part | The options exist: in the game, "Reset progress" replaces the cloud save with a fresh one, and hiding from the leaderboard deletes the leaderboard entry; by email, someone could ask for just their feedback to go. But the delete page (as written on 30 October) only describes deleting everything, and Google checks the answer against the page. |

What the delete page promises (from `DELETE_FACTS` in `src/ui/privacy-text.js`):
the cloud save, the leaderboard entry, any feedback and a Google sign-in
(with its email, name and photo) go; a guest's sign-in holds only the random
player ID, which Firebase may keep with nothing stored under it (Firebase
won't delete a sign-in that isn't fresh, and a guest can't confirm again);
the Google account itself stays; Google's security logs (with IP addresses)
are kept for a few weeks, and backups age out within about 180 days; in the
game it happens straight away, and email requests are done within 30 days.
Keep this form consistent with that page.

## Step 3: Data types

Tick exactly these. Everything else stays unticked.

| Category | Data type | Tick | What it is in Pip's hunt |
|---|---|---|---|
| Personal info | Name | **Yes** | Only for Google sign-in: Firebase Authentication keeps the Google account's name. The account card shows the first name. |
| Personal info | Email address | **Yes** | Only for Google sign-in: kept by Firebase Authentication. |
| Personal info | User IDs (older forms call it "Personal identifiers") | **Yes** | The random Firebase player ID (uid) every player gets, guest or not. It is the account ID that saves, the leaderboard entry and feedback are stored under. |
| Personal info | Address, Phone number, Race and ethnicity, Political or religious beliefs, Sexual orientation, Other info | No | |
| Financial info | all | No | Nothing can be bought. |
| Location | Approximate location, Precise location | No | The game never asks for location. Firebase Authentication sees IP addresses for security, but nothing works out where a player is from them (Play only counts IP as location when it is used for that). |
| Health and fitness | all | No | |
| Messages | Emails, SMS or MMS, Other in-app messages | No | There is no chat. Feedback is one-way to the developer and is declared below as user-generated content. |
| Photos and videos | Photos | **Yes** | Only for Google sign-in: Firebase Authentication keeps a link to the Google profile photo. The game never shows or uses it. (If you think a link isn't a photo, "Personal info > Other info" is the alternative; ticking Photos is the cautious choice.) |
| Photos and videos | Videos | No | |
| Audio files | all | No | Read-aloud is the phone's own speech synthesis; nothing is recorded. |
| Files and docs | Files and docs | No | |
| Calendar | Calendar events | No | |
| Contacts | Contacts | No | |
| App activity | App interactions (older forms: "Page views and taps in app") | No | Nothing records taps, screens or time played. |
| App activity | In-app search history | No | There is no search. |
| App activity | Installed apps | No | |
| App activity | Other user-generated content | **Yes** | Feedback someone chooses to send: the stars, topic, quick notes, the optional grown-up's note (up to 300 characters) and the map number it was about. |
| App activity | Other actions | **Yes** | Game progress the cloud save and leaderboard need: coins earned, presents, crackers, nights, best night, upgrades, jokes found, milestones, wardrobe, the snow name and whether it is hidden. |
| Web browsing | Web browsing history | No | |
| App info and performance | Crash logs, Diagnostics | No | No crash reporting or performance monitoring. |
| App info and performance | Other app performance data | **Yes** | Sent with feedback only: the device type (touch or keyboard) and the app version. |
| Device or other IDs | Device or other IDs | No | No advertising ID, Android ID, Firebase installation ID or other device ID. The TWA asks for no permissions at all (see `play/README.md`), and the Firebase pieces used (Authentication and Firestore Lite) don't use installation IDs. The player ID is declared as a User ID above. |

## Step 4: Data usage and handling

For each ticked type, select **Start** and answer:

| Data type | Collected or shared? | Processed ephemerally? | Required or optional? | Why is this user data collected? |
|---|---|---|---|---|
| Name | **Collected** (not shared) | No | **Users can choose** (only when a grown-up signs in with Google) | **App functionality** (the account card says who is signed in), **Account management** |
| Email address | **Collected** | No | **Users can choose** | **Account management** (signing in to the same progress on another device) |
| User IDs | **Collected** | No | **Required** (every player gets one; it is how saves work) | **App functionality** (cloud save, leaderboard), **Account management**, **Fraud prevention, security, and compliance** (the security rules and the feedback rate limit work per player ID) |
| Photos | **Collected** | No | **Users can choose** | **Account management** |
| Other user-generated content | **Collected** | No | **Users can choose** (only when someone sends feedback) | **App functionality** (the feedback feature), **Analytics** (the developer reads it to fix bugs and improve the game) |
| Other actions | **Collected** | No | **Required** (the cloud save runs for every player) | **App functionality** |
| Other app performance data | **Collected** | No | **Users can choose** (only with feedback) | **Analytics** (knowing which version and kind of device a bug report came from) |

Not ticked for any type: Developer communications, Advertising or marketing,
Personalization.

**Shared: No, for every type.** Play defines sharing as passing data to a
third party, and Google Firebase is a service provider (it processes the data
for us, on our instructions), which Play says is not sharing. The leaderboard
shows snow names (from the game's word lists) and scores to other players;
that's other players, not another company, so it isn't "sharing" in this form
either, but the privacy policy says it.

**About "Analytics":** in this form it is the name of a purpose (using data to
fix bugs and improve the app), and it is the honest purpose for feedback. It
doesn't mean an analytics tool: the game has none. So the in-game Privacy
screen and the policy say "no analytics tools" (and "no advertising,
analytics or crash-reporting tools"), never a bare "no analytics", which a
reviewer comparing the two could read as a contradiction.

## Step 5: Security practices

- **Committed to follow the Play Families Policy:** opt in, once you've gone
  through the Families checklist in `content-rating.md`. The form sends you to
  **Target audience and content** to do it.
- **Independent security review:** No (it's a paid lab assessment).

## Step 6: Store listing preview

Before **Submit**, the preview should say roughly:

- No data shared with third parties.
- Data collected: Personal info, Photos and videos, App activity, App info and
  performance.
- Data is encrypted in transit.
- You can request that data be deleted.

Then **Submit**. The form is reviewed with your next release.

## What the privacy policy must agree with

Play compares the form, the privacy policy and the app. Checked against the
facts in `src/ui/privacy-text.js`:

| Fact | Form | Privacy text |
|---|---|---|
| Guests: random player ID, progress, snow name | User IDs, Other actions (required) | Guests line |
| Google: email, name, profile photo, kept by Firebase | Email, Name, Photos (optional) | Google sign-in line |
| Feedback with device type and app version | Other UGC, Other app performance data (optional) | Feedback line |
| No ads, no analytics tools, no tracking, no location | nothing under Location, Device IDs, Advertising | Never line |
| Firebase stores it for us, never sold or shared | Shared: No | Where line |
| Encrypted in transit | Yes | Safety line |
| Birth month and year asked, checked on the device, never kept or sent | not declared (not collected) | Birth month and year line |
| Deletion in game and by email, within 30 days | Yes, delete URL | delete page |

Two things the privacy policy mentions that the form has no box for:
Firebase Authentication processes IP addresses and the browser's user agent
to keep sign-in secure, and GitHub Pages (the web host) sees IP addresses
when it sends the game's files. Neither is "collected" in Play's sense (the
game doesn't receive or use them), and neither is location.

**The birth month and year are not declared either.** The grown-ups gate in
front of Google sign-in and the feedback note (the neutral age screen the
Families policy asks for; `docs/CLOUD.md`, "Grown-ups gate for Google
sign-in") asks "When were you born?", checks the answer in the browser and
drops it. Only whether it passed, and until when, stays in that browser's
storage; nothing about it is sent to Firebase or anywhere else. Play counts
data as collected only when it is transmitted off the device, so this isn't
"Personal info > Other info" (or anything else) in the form. The privacy
policy and the in-game Privacy screen still say it in one line ("Birth month
and year"). If the game ever sends the answer, or even the outcome, to the
cloud, this changes.

## Sources

- Provide information for Google Play's Data safety section:
  https://support.google.com/googleplay/android-developer/answer/10787469
  (data types, purposes, "collected", "shared", service providers, web views,
  IP addresses, optional vs required, the three first questions: their
  wording matches Google's sample CSV for the form).
- Understanding Google Play's app account deletion requirements:
  https://support.google.com/googleplay/android-developer/answer/13327111
- Google Play Families Policies:
  https://support.google.com/googleplay/android-developer/answer/9893335

Not confirmed from a Google page: the exact labels of the account-creation
and partial-deletion questions (from third-party guides), and whether the
current form says "User IDs" or "Personal identifiers" (the help page says
the first, Google's older sample CSV the second; they are the same box).
