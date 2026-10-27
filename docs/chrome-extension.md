# The Chrome extension

The extension saves the page you're reading to your ReadSooner library, including its full text as you see it. That matters for paywalled sites you're subscribed to: the server's own download would only see the paywall, while the extension sends the copy from your signed-in browser.

- **Toolbar button** or **Alt+Shift+S** (on a Mac, Option+Shift+S): saves the current page, with its URL and HTML minus scripts and styles.
- **Right-click a link → "Save link to ReadSooner"**: saves just the link; the server downloads the page.
- **The badge** on the toolbar button shows `…` while saving, then **✓** when saved or **!** when something went wrong. Hover over the button to see the reason.

It isn't published in the Chrome Web Store (that's planned for stage 3), so you install it from the repository with "Load unpacked". It works the same in Chrome and in other Chromium browsers such as Edge and Brave. For Firefox, see [the Firefox extension](firefox-extension.md).

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
   2. Click **Connect**. A window opens at ReadSooner: sign in if it asks, check that the account shown is yours, and click **Connect**. The window closes, and "Connected to ReadSooner" means it's working.

Connect creates an access token named for the browser, such as "Chrome extension on Windows", and fills it in. To do it by hand instead, create a token in the web app's **Settings → Access tokens**, paste it under **Access token** (it starts with `rl_`) and click **Save and check**.

The token is stored only in this browser's extension storage. To disconnect a browser, revoke its token in the web app's Settings. If a token stops working, the next save opens the options page, which says so; click **Connect** again.

## Use

- **Save a page:** click the toolbar button or press Alt+Shift+S. The ✓ appears within a second; the summary follows in the web app shortly after.
- **Save a link without opening it:** right-click the link and choose **Save link to ReadSooner**.
- **Change the shortcut:** open `chrome://extensions/shortcuts`. Chrome won't assign the suggested shortcut if another extension already uses it, so check there if it does nothing.

Saving the same article again moves it back to the top of your Inbox instead of creating a duplicate. If the earlier copy was "Preview only" (for example a link saved from your phone that hit a paywall), the new full copy replaces it.

## Update after changing the code

Run `pnpm extension:build` again, then click the reload arrow on the extension's card in `chrome://extensions`. Your settings are kept.

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
