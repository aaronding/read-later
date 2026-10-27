# The Chrome extension

The extension saves the page you're reading to your ReadSooner library, including its full text as you see it. That matters for paywalled sites you're subscribed to: the server's own download would only see the paywall, while the extension sends the copy from your signed-in browser.

- **Toolbar button** or **Alt+Shift+S** (on a Mac, Option+Shift+S): saves the current page, with its URL and HTML minus scripts and styles.
- **Right-click a link → "Save link to ReadSooner"**: saves just the link; the server downloads the page.
- **The badge** on the toolbar button shows `…` while saving, then **✓** when saved or **!** when something went wrong. Hover over the button to see the reason.

It isn't published in the Chrome Web Store yet ([Publish on the Chrome Web Store](#publish-on-the-chrome-web-store) says how), so you install it from the repository with "Load unpacked", and the web app's Help describes only the [Firefox add-on](firefox-extension.md), which anyone can install. It works the same in Chrome and in other Chromium browsers such as Edge and Brave. For Firefox, see [the Firefox extension](firefox-extension.md).

Its text is in the browser's language when that is English, French, Simplified Chinese or Traditional Chinese, and in English otherwise. It doesn't follow the language chosen in the web app's Settings: an extension can only use the browser's. This guide quotes the English texts.

## Install

1. **Build it.** In the repository folder:

   ```sh
   pnpm install
   pnpm extension:build
   ```

   This creates `apps/extension/dist`.

2. **Load it.**
   1. Open `chrome://extensions` in Chrome.
   2. Turn on **Developer mode** (top right).
   3. Click **Load unpacked** and choose the `apps/extension/dist` folder.
   4. Optional: click the puzzle-piece icon in the toolbar and pin **ReadSooner** so its button is always visible.

3. **Connect it to your account.** The options page opens by itself after installing. You can also reach it by right-clicking the toolbar button and choosing **Options**.
   1. **Server URL**: `https://www.readsooner.com`, already filled in. Only an extension loaded unpacked, as here, shows this field, so that it can use the app running on your computer: set it to `http://localhost:3000` for that. Installed from the Chrome Web Store, the extension always uses `https://www.readsooner.com` and has no such field. Typed without `www`, or with `http://`, the app's own address is corrected.
   2. Click **Connect**. A window opens at ReadSooner: sign in if it asks, check that the account shown is yours, and click **Connect**. The window closes, and the options page says "Connected. This browser now saves to your ReadSooner account.", with nothing else to fill in.

Connect creates an access token named for the browser, such as "Chrome extension on Windows", and fills it in. To do it by hand instead, create a token in the web app's **Settings → Access tokens**, paste it under **Access token** (it starts with `rl_`) and click **Save and check**.

The token is stored only in this browser's extension storage. To disconnect a browser, revoke its token in the web app's Settings. Its options page then shows the setup again, to connect another account or, loaded unpacked, another server. If a token stops working, the next save opens the options page, which says so; click **Connect** again.

## Use

- **Save a page:** click the toolbar button or press Alt+Shift+S. The ✓ appears within a second; the summary follows in the web app shortly after.
- **Save a link without opening it:** right-click the link and choose **Save link to ReadSooner**.
- **Change the shortcut:** open `chrome://extensions/shortcuts`. Chrome won't assign the suggested shortcut if another extension already uses it, so check there if it does nothing.

Saving the same article again moves it back to the top of your Inbox instead of creating a duplicate. If the earlier copy was "Preview only" (for example a link saved from your phone that hit a paywall), the new full copy replaces it.

## Update after changing the code

Run `pnpm extension:build` again, then click the reload arrow on the extension's card in `chrome://extensions`. Your settings are kept.

## Publish on the Chrome Web Store

### Once: the developer account

1. Sign in to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) with the Google account that is to own the extension, for example one on a `readsooner.com` address. Its email can't be changed later.
2. Turn on 2-Step Verification for that account; the dashboard requires it.
3. Accept the developer agreement, pay the one-time registration fee (US$5 when this was written), and say whether you are a trader under EU law. For a personal project that earns nothing, that is usually "non-trader", but it is yours to decide.
4. In **Account**, set the publisher name shown on the listing, and verify the contact email.

### Each version

1. **Raise `version`** in `apps/extension/package.json` if this number has already been uploaded. Chrome and Firefox share it.
2. **Build it:** `pnpm extension:build` writes `apps/extension/dist.zip`, with `manifest.json` at its root, as the store wants.
3. In the dashboard, the first time choose **Add new item**; after that, open ReadSooner and upload the zip under **Package**. Then **Submit for review**. Reviews usually take a few days.

### The first submission: what to fill in

**Store listing**

- **Description:**

  > ReadSooner is a read-later app. Save an article while you browse, and ReadSooner keeps the link, a clean copy of the text and a short AI summary, written in the article's own language.
  >
  > - Click the toolbar button, or press Alt+Shift+S (Option+Shift+S on a Mac), to save the page you're reading with its full text as you see it, so articles you're signed in to are saved in full.
  > - Right-click a link and choose "Save link to ReadSooner" to save it without opening it.
  > - Read your articles, summary first, at https://www.readsooner.com on any device.
  >
  > It needs a free ReadSooner account: after installing, click Connect in the extension's options and sign in with Google.
  >
  > The extension reads a page only when you save it, and sends it only to ReadSooner.

- **Category:** Productivity, then the closest subcategory, such as Workflow & Planning. **Language:** English; the extension's name and description also come in French and Chinese from its own texts.
- **Store icon:** `apps/extension/store/icon-128.png`, the logo's 96 px with transparent padding, as the store's guidelines ask (`pnpm icons` draws it). **Screenshots:** `apps/extension/store/screenshot-1-inbox.png`, `screenshot-2-article.png` and `screenshot-3-triage.png`, at the store's 1280×800, showing what the extension saves to; `pnpm --filter web home-images` takes them again. A promo tile is optional.
- **Homepage:** `https://www.readsooner.com`. **Support:** `https://www.readsooner.com/help`.

**Privacy**

- **Single purpose:** Save the web page you're reading, or a link, to your ReadSooner account, which keeps a clean copy and writes a short summary for reading later.
- **Permission justifications:**
  - `activeTab`: To read the page the user is on, only when they click the toolbar button or press the keyboard shortcut to save it.
  - `scripting`: To run, at that moment, a small function in that page that copies its HTML without scripts and styles, so the saved copy is the one the user sees, including articles they're signed in to.
  - `contextMenus`: For "Save link to ReadSooner" on links, which saves a link without opening it.
  - `storage`: To keep the user's ReadSooner access token and the extension's settings.
  - `identity`: For the Connect button: `launchWebAuthFlow` opens ReadSooner's approval page, where the user signs in and approves, and receives the access token for this browser. It doesn't use `getAuthToken` or the user's Google account.
- **Remote code:** No, I am not using remote code.
- **Data usage:** tick **Website content** (the content of each page the user saves), **Web history** (the address and title of each page the user saves) and **Authentication information** (the ReadSooner access token, kept in the extension and sent only to ReadSooner). Nothing else. Then tick the three certifications: no sale to third parties, no use unrelated to the single purpose, no use for credit decisions.
- **Privacy policy:** `https://www.readsooner.com/privacy`. Its section on the browser extension says what the extension reads, sends and keeps, and carries the Limited Use statement the store asks for.

**Distribution:** Public, in all regions. To install it from the store yourself before anyone else, choose Private and add yourself as a trusted tester, then switch to Public.

**Test instructions:** no username or password, since anyone can sign in. Paste:

> No credentials needed: ReadSooner signs in with Google, open to anyone. After installing, the options page opens: click Connect, sign in with any Google account and approve. Then click the toolbar button on an article, or press Alt+Shift+S, and open https://www.readsooner.com to see it with its summary.

Sign-in has to be open to everyone (`ALLOWED_EMAILS=*`) for reviewers to get in.

### After it's approved

The web app's Help covers only the Firefox add-on until then (decision 145). Once the listing is public, Help, the homepage and this guide's **Install** can point to it, as they do for Firefox; the item's address is on its page in the dashboard.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| **!** and "Open the extension's options…" | The extension isn't connected yet. The options page opens by itself: click **Connect**. |
| **!** and "The access token doesn't work any more" | The token was revoked, or your account can no longer sign in. The options page opens by itself: click **Connect** again. |
| "Not connected" after clicking **Connect** | The window was closed, **Cancel** was chosen, or the page didn't load. Try again, or paste a token by hand. Loaded unpacked, also check the server URL. |
| **!** and "Couldn't reach …" | Check that the site is up. Loaded unpacked, also check the server URL (including `https://`, or `http://` for `localhost`). |
| **!** on `chrome://` pages, the Chrome Web Store or PDF viewers | Chrome doesn't let extensions read these pages. Only `http` and `https` pages can be saved. |
| "link only: the page was too large to send" | The page's HTML was over the server's 4 MB limit, so only the link was saved, and the server downloads the page itself. |
| Saved, but the article says "Preview only" | The page looked like a paywall or login. Sign in to the site in this browser, reload the article, and save it again. |

## Permissions, and why

| Permission | Why it's needed |
| --- | --- |
| `activeTab` | To read the current page, only at the moment you click the button or press the shortcut. The extension has no access to any site otherwise. |
| `scripting` | To run the small snippet that copies the page's HTML in that moment. |
| `contextMenus` | For "Save link to ReadSooner". |
| `storage` | To remember the server URL and token. |
| `identity` | For **Connect**: to open ReadSooner's approval page in a window and receive the access token it sends back. It gives no access to your Google account. |
