# The Firefox extension

The same extension as the [Chrome one](chrome-extension.md), built for Firefox. The toolbar button and **Alt+Shift+S** (on a Mac, Option+Shift+S) save the page you're reading with its full text, and right-clicking a link offers **Save link to ReadSooner**. The badge, the options, the permissions and the extension's languages work as the Chrome guide describes.

It needs Firefox 140 or later, on a computer. Firefox for Android isn't tested.

## Install

1. Open [ReadSooner on Firefox Add-ons](https://addons.mozilla.org/firefox/addon/readsooner/) and click **Add to Firefox**.
2. **Accept the install prompt.** Besides the permissions, it lists the data the add-on sends: your browsing activity and website content. That is the address and the text of each page you save, sent only to `https://www.readsooner.com`.
3. **Connect it to your account.** The options page opens by itself: click **Connect**, sign in if asked, and approve in the window that opens. To reach the options later, right-click the toolbar button and choose **ReadSooner options**, or open `about:addons`, click **⋯** on ReadSooner's card and choose **Options** (**Preferences** on a Mac).

Optional: Firefox puts the button in the **Extensions** menu (the puzzle-piece icon). To keep it on the toolbar, open that menu, click the gear next to ReadSooner, and choose **Pin to Toolbar**.

New versions install themselves, from the listing.

## Build

The rest of this guide is for developing the extension and publishing it. You need Node.js 24 and pnpm 10.28.0 (`corepack enable` installs the version the repository asks for). In the repository folder:

```sh
pnpm install --frozen-lockfile
pnpm extension:build
```

This creates `apps/extension/dist-firefox` and `apps/extension/dist-firefox.zip`. The same command also builds the Chrome version into `apps/extension/dist`.

## Try a build: a temporary install

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…** and choose `apps/extension/dist-firefox/manifest.json`.
3. Connect it as in step 3 of [Install](#install). A temporary add-on also shows the server URL, already filled in: set it to `http://localhost:3000` for the app on your computer. An add-on from the listing always uses `https://www.readsooner.com`.

After changing the code, run `pnpm extension:build` again and click **Reload** on the add-on's card. The add-on disappears when Firefox quits; load it again the same way.

## Publish a new version on addons.mozilla.org

1. **Raise `version`** in `apps/extension/package.json`, for example from `1.0.0` to `1.0.1`. Mozilla refuses a version number it has already received.
2. **Build it** as above.
3. **Make an archive of the source code.** The build compiles TypeScript, and Mozilla asks for the source of any add-on made with a build tool. In the repository folder:

   ```sh
   git archive -o read-later-extension-source.zip HEAD apps/extension packages/brand docs/firefox-extension.md package.json pnpm-workspace.yaml pnpm-lock.yaml
   ```

   It holds only the extension, the display name it uses and this guide, whose Build section tells a reviewer how to rebuild it. Mozilla's reviewers can see it; it isn't published. Built from it, `dist-firefox.zip` comes out the same, byte for byte.
4. **Upload it.** Sign in at the [Add-on Developer Hub](https://addons.mozilla.org/developers/), open **My Add-ons → ReadSooner** and choose **Upload New Version**. The first time, choose **Submit a New Add-on** instead (see [The first listing](#the-first-listing)).
   1. For how it's distributed, choose **On this site**.
   2. Upload `apps/extension/dist-firefox.zip`. The automatic check should report no errors and no warnings.
   3. For the platforms, choose **Firefox** only, not Firefox for Android, where it isn't tested and Connect isn't available.
   4. When asked whether you need to submit source code, choose **Yes** and upload `read-later-extension-source.zip`.
   5. Add notes for the reviewers (below), and submit.

It is published once Mozilla's checks pass, which can take from minutes to a few days, since the source code may be read by a person; a reviewer may also look at it later. An email says how it went.

### The first listing

Before its first listing, the add-on wasn't on addons.mozilla.org at all: it had only been tried as a temporary add-on, never uploaded, so its ID, `read-later@aaronding`, was free. The first upload is **Submit a New Add-on**, with **On this site**, from the Mozilla account that is to own the add-on; later versions need that account, or another one it adds under **Manage Authors & License**. Mozilla then asks for the listing's details, which **Edit Product Page** changes later:

- **Name:** ReadSooner.
- **Add-on URL:** `readsooner`. The web app links to `https://addons.mozilla.org/firefox/addon/readsooner/` (`FIREFOX_ADDON_URL` in `apps/web/src/config/app.ts`); if Mozilla gives it another address, change it there.
- **Summary and description:** what it saves, and that it needs an account at `www.readsooner.com`, made by signing in with Google.
- **Categories**, and a **support site:** `https://www.readsooner.com/help`.
- **License:** your choice. "All Rights Reserved" keeps the code yours; an open-source license lets others reuse it.
- **Privacy policy:** `https://www.readsooner.com/privacy`, required because the add-on sends data.
- **Screenshots:** optional, but they help people decide.

### Notes for reviewers

Reviewers sign in with their own Google account, so sign-in has to be open to everyone (`ALLOWED_EMAILS=*`). Paste something like:

> ReadSooner saves the page you're reading to your account at https://www.readsooner.com, which keeps a clean copy and writes a short summary. To try it: in the options page, which opens after installing, click Connect and sign in with any Google account; then click the toolbar button on an article, and open https://www.readsooner.com to see it. The source code builds with Node.js 24 and pnpm 10.28.0: `pnpm install --frozen-lockfile`, then `pnpm extension:build`. The add-on is `apps/extension/dist-firefox.zip`, identical to the uploaded file.

## Troubleshooting

The [Chrome guide's table](chrome-extension.md#troubleshooting) applies too. In Firefox, also:

| Symptom | What to do |
| --- | --- |
| "This add-on could not be installed because it has not been verified" | You tried to install the zip you built. Install it from the listing, or use a temporary install. |
| The add-on is gone after restarting Firefox | It was a temporary install. Load it again, or install it from the listing. |
| Nothing happens in a private window | Firefox runs add-ons in private windows only when you allow it: in `about:addons`, open ReadSooner and set **Run in Private Windows** to **Allow**. |
| The shortcut does nothing | Another add-on or Firefox itself may use it. In `about:addons`, choose **Manage Extension Shortcuts** from the gear menu and pick another. |
| **!** on `about:` and other built-in pages | Only `http` and `https` pages can be saved. |
| A page on addons.mozilla.org is saved from the server's own download | Nothing to do: Firefox doesn't let add-ons read Mozilla's own sites, so only the link is sent. |
| Mozilla refuses the upload because the version exists | Raise `version` in `apps/extension/package.json` and build again. |
