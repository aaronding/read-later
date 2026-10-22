# The Chrome extension

The extension saves the page you're reading to your Read Later library, including its full text as you see it. That matters for paywalled sites you're subscribed to: the server's own download would only see the paywall, while the extension sends the copy from your signed-in browser.

- **Toolbar button** or **Alt+Shift+S** (on a Mac, Option+Shift+S): saves the current page, with its URL and HTML minus scripts and styles.
- **Right-click a link → "Save link to Read Later"**: saves just the link; the server downloads the page.
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
   4. Optional: click the puzzle-piece icon in the toolbar and pin **Read Later** so its button is always visible.

3. **Connect it to your account.** The options page opens by itself after installing. You can also reach it by right-clicking the toolbar button and choosing **Options**.
   1. **Server URL**: the address of your web app, such as `https://read.example.com` (or `http://localhost:3000` when developing).
   2. **Access token**: in the web app, open **Settings → Access tokens**, create a token named for this browser (for example "Chrome on my laptop"), and paste it here. It starts with `rl_`.
   3. Click **Save and check**. "Connected to Read Later" means it's working.

The token is stored only in this browser's extension storage. To disconnect a browser, revoke its token in the web app's Settings.

## Use

- **Save a page:** click the toolbar button or press Alt+Shift+S. The ✓ appears within a second; the summary follows in the web app shortly after.
- **Save a link without opening it:** right-click the link and choose **Save link to Read Later**.
- **Change the shortcut:** open `chrome://extensions/shortcuts`. Chrome won't assign the suggested shortcut if another extension already uses it, so check there if it does nothing.

Saving the same article again moves it back to the top of your Inbox instead of creating a duplicate. If the earlier copy was "Preview only" (for example a link saved from your phone that hit a paywall), the new full copy replaces it.

## Update after changing the code

Run `pnpm extension:build` again, then click the reload arrow on the extension's card in `chrome://extensions`. Your settings are kept.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| **!** and "Open the extension's options…" | The server URL or token is missing. Open the options page. |
| **!** and "Missing or invalid access token" | The token was revoked or mistyped. Create a new one in Settings and paste it in the options. |
| **!** and "Couldn't reach …" | Check the server URL (including `https://`) and that the site is up. |
| **!** on `chrome://` pages, the Chrome Web Store or PDF viewers | Chrome doesn't let extensions read these pages. Only `http` and `https` pages can be saved. |
| "link only: the page was too large to send" | The page's HTML was over the server's 4 MB limit, so only the link was saved, and the server downloads the page itself. |
| Saved, but the article says "Preview only" | The page looked like a paywall or login. Sign in to the site in this browser, reload the article, and save it again. |

## Permissions, and why

| Permission | Why it's needed |
| --- | --- |
| `activeTab` | To read the current page, only at the moment you click the button or press the shortcut. The extension has no access to any site otherwise. |
| `scripting` | To run the small snippet that copies the page's HTML in that moment. |
| `contextMenus` | For "Save link to Read Later". |
| `storage` | To remember the server URL and token. |
