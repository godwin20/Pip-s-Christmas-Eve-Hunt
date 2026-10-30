# The godwin20.github.io user site

Android only lets the Play app open the game full screen, with no address bar,
when the website says the app is its own. That proof is a Digital Asset Links
file, and Chrome only looks for it at the root of the origin:

```
https://godwin20.github.io/.well-known/assetlinks.json
```

The game lives at `/Pip-s-Christmas-Eve-Hunt/`, a project site, so it can't
publish anything at the root. Only a GitHub **user site** can: a repo named
exactly `godwin20.github.io`. This folder holds its files.

| File | What it is |
|---|---|
| `.nojekyll` | Empty on purpose. It turns Jekyll off, and without it GitHub Pages leaves out folders that start with a dot, so `.well-known/` would never be published. |
| `.well-known/assetlinks.json` | The Digital Asset Links file for `io.github.godwin20.pipshunt`, with placeholder fingerprints to replace. |
| `index.html` | A small page for `https://godwin20.github.io/` with a link to the game (today that address shows a 404). |
| `README.md` | This file. It's fine to leave it in the repo too. |

## 1. Create the repo (OWNER)

1. Sign in to GitHub as **godwin20** (not KLS-Digital-Solutions).
2. Create a new repository named exactly **`godwin20.github.io`**. It must be
   **Public** (Pages on a free account needs that). Don't add a README,
   licence or `.gitignore`, so the first push is just these files.
3. Copy this folder's files into it, keeping the dot files:

   ```bash
   git clone https://github.com/godwin20/godwin20.github.io.git ~/godwin20.github.io
   cp -a "$HOME/Documents/Christmas Game/play/user-site/." ~/godwin20.github.io/
   cd ~/godwin20.github.io
   ls -la            # .nojekyll and .well-known/ must be there
   ```

4. Put the real fingerprints in `.well-known/assetlinks.json` (next section),
   then commit and push to `main`.
5. On GitHub: **Settings > Pages > Build and deployment > Source: Deploy from
   a branch**, branch **`main`**, folder **`/ (root)`**, Save. The first
   publish takes a minute or two (the Actions tab shows it).

**Never set a custom domain on this repo.** A user site's custom domain
becomes the address of every project site under it too, so
`godwin20.github.io/Pip-s-Christmas-Eve-Hunt/` would start redirecting to the
new domain. The app's origin would move, the assetlinks file would no longer
be on the origin the app opens, the address bar would come back, and Firebase
sign-in would need the new domain authorised. Leave the **Custom domain** box
empty, and don't add a `CNAME` file.

Don't create a folder called `Pip-s-Christmas-Eve-Hunt` in this repo either:
that path belongs to the game's own repo.

## 2. Fill in the fingerprints (OWNER)

The file needs the SHA-256 certificate fingerprint of every key that may sign
the app a phone runs:

| Placeholder | Where the value comes from |
|---|---|
| `REPLACE_ME_1_UPLOAD_KEY_SHA256_FROM_KEYTOOL` | Your upload key: the `SHA256:` line of `keytool -list -v -keystore ~/pips-hunt-android/android.keystore -alias android` (see `play/README.md`, step 2.6). It makes the APK you build yourself verify too. |
| `REPLACE_ME_2_...`, `REPLACE_ME_3_...`, `REPLACE_ME_4_...` | Google Play's app signing key(s), after your first upload: Play Console > your app > **Protected with Play > Play Store protection > Manage Play app signing** (older menus: **Test and release > App integrity > App signing**), **App signing key certificate**, every **SHA-256 certificate fingerprint** shown. New apps get Play's "quantum-ready hybrid signing", which uses three keys, so expect up to three. If Play shows fewer, delete the spare placeholder lines. |

A fingerprint looks like 32 pairs of capital hex digits joined by colons:
`AB:CD:EF:01:...:89` (95 characters). Paste it as it is, inside the quotes.

The easy way is to let Bubblewrap write the whole file: add each fingerprint
in `~/pips-hunt-android` with
`npx --yes @bubblewrap/cli@1.27.0 fingerprint add <SHA256> --name=<label>`,
and copy the `assetlinks.json` it writes there over
`.well-known/assetlinks.json` here (the package name is already right in it).

**The JSON must be exact.** Chrome's check is strict, and one stray character
makes it ignore the whole file, with no error anywhere except the address bar
coming back:

- no trailing comma after the last fingerprint (when you delete a spare line,
  remove the comma at the end of the line before it too);
- no comments of any kind (`//` or `/* */`): JSON has none;
- straight double quotes `"`, not curly ones from a word processor;
- the package name stays `io.github.godwin20.pipshunt`.

Check it before you push:

```bash
cd ~/godwin20.github.io
python3 -m json.tool .well-known/assetlinks.json > /dev/null && echo "valid JSON"
grep -c REPLACE_ME .well-known/assetlinks.json        # must print 0
grep -oE '"([0-9A-F]{2}:){31}[0-9A-F]{2}"' .well-known/assetlinks.json   # one line per fingerprint
```

## 3. Verify it is live (OWNER, after each push)

```bash
curl -sS -o /dev/null -w '%{http_code} %{content_type} redirect=%{redirect_url}\n' \
  https://godwin20.github.io/.well-known/assetlinks.json
```

It must print `200 application/json; charset=utf-8 redirect=` (status 200,
JSON, and nothing after `redirect=`). A 404 means Pages isn't publishing yet,
the repo name is wrong, or `.nojekyll` is missing; `text/html` means you are
getting GitHub's 404 page.

Also check the content, and that the root page answers:

```bash
curl -sS https://godwin20.github.io/.well-known/assetlinks.json | python3 -m json.tool
curl -sS -o /dev/null -w '%{http_code}\n' https://godwin20.github.io/
```

Google's own Digital Asset Links service shows what it reads from the site
(it can lag a few minutes behind a push):

```bash
curl -sS 'https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://godwin20.github.io&relation=delegate_permission/common.handle_all_urls'
```

The answer should list `io.github.godwin20.pipshunt` with your fingerprints.

The real test is the phone: install the app from your internal test and open
it. No address bar at the top means it worked. If the bar is there, fix the
file, push, check with curl again, then uninstall and reinstall the app before
trying again.

When Play ever adds or changes a signing key (a key upgrade, for example),
add the new fingerprint here the same day, or the address bar comes back for
players.
