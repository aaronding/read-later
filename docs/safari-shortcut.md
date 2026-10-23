# The Apple Shortcuts (Safari on iPhone, iPad and Mac)

Safari has no extension for this app yet (that needs the paid Apple developer membership, planned for stage 4), so saving from Apple devices uses two Shortcuts you build once by hand. They sync to your other Apple devices through iCloud.

| Shortcut | Use it from | What it sends |
| --- | --- | --- |
| **Save to ReadSooner** | Safari's Share menu | The page's URL and its full HTML as you see it, so paywalled articles you're subscribed to are saved in full |
| **Save link to ReadSooner** | Any other app's Share menu (Chrome on iPhone, Mail, Messages…) | Only the link; the server downloads the page itself |

The same steps are in the web app under **Settings → Save from Safari**, with your own server address filled in and a button to copy the script.

## Before you start

1. **Create an access token** in the web app: **Settings → Access tokens**, named for the device (for example "iPhone"). Copy it. It starts with `rl_` and is shown only once.
2. **Allow scripts in Shortcuts.** The first Shortcut runs a small script on the page, which Shortcuts blocks by default.
   - **iPhone and iPad:** open the **Settings** app → **Apps** → **Shortcuts** → **Advanced**, and turn on **Allow Running Scripts**. (On iOS 17 and earlier: Settings → Shortcuts → Advanced.)
   - **Mac:** open the **Shortcuts** app → **Shortcuts** menu → **Settings…** → **Advanced**, and turn on **Allow Running Scripts**.
   - **Mac, if Safari still refuses to run the script:** in Safari, open **Settings → Advanced** and turn on **Show features for web developers**. A **Developer** tab appears in Safari's settings; open it and turn on **Allow JavaScript from Apple Events** (under Automation). Quit and reopen Safari afterwards.

The steps below use the app's address, `https://www.readsooner.com`. Keep the `www`: `readsooner.com` only redirects there, and a redirected request can lose the token the Shortcut sends.

## Shortcut 1: "Save to ReadSooner" (Safari)

1. Open the **Shortcuts** app and tap **+** to make a new shortcut. Name it **Save to ReadSooner**.
2. Make it appear in the Share menu: open the shortcut's details (the **ⓘ** button at the bottom on iPhone, or the info panel on a Mac) and turn on **Show in Share Sheet**.
3. At the top of the shortcut there is now a line like "Receive **Images and 18 more** from **Share Sheet**". Tap the input types and leave only **Safari web pages** selected.
4. Add the action **Run JavaScript on Web Page** (on a Mac it's called **Run JavaScript on Active Safari Tab**, and reads the page in Safari's front tab). On iPhone and iPad it uses **Shortcut Input** as the web page. Replace its script with this one:

   ```js
   var page = document.documentElement.cloneNode(true);
   page.querySelectorAll("script, style, noscript").forEach(function (el) {
     el.remove();
   });
   completion(JSON.stringify({
     url: document.URL,
     title: document.title,
     html: "<!DOCTYPE html>" + page.outerHTML,
     source: "shortcut"
   }));
   ```

5. Add the action **Get Contents of URL**:
   - **URL**: `https://www.readsooner.com/api/save`
   - Tap **Show More** (on a Mac, the details are shown in the action):
     - **Method**: `POST`
     - **Headers**: add `Authorization` with the value `Bearer rl_…` (the word Bearer, a space, then your token). Add `Content-Type` with the value `application/json`.
     - **Request Body**: choose **File**, then choose the **JavaScript Result** variable.
6. Add the action **Get Dictionary Value**: get the **Value** for the key `message` in **Contents of URL**.
7. Add the action **Show Notification** and put the **Dictionary Value** variable in it.
8. Try it: open an article in Safari, tap **Share** (on a Mac, the Share button in the toolbar), and choose **Save to ReadSooner**. The first time, Shortcuts asks whether the shortcut may run JavaScript on that site. Choose **Always Allow**. The notification says **Saved to ReadSooner**, in the language chosen in the app's Settings (or, until one is chosen, the device's language).

## Shortcut 2: "Save link to ReadSooner" (other apps)

1. Make a new shortcut named **Save link to ReadSooner**, turn on **Show in Share Sheet**, and leave only **URLs** and **Text** as the input types.
2. Add **Get URLs from Input** (from **Shortcut Input**).
3. Add **Get Item from List** and choose **First Item**.
4. Add **Get Contents of URL**:
   - **URL**: `https://www.readsooner.com/api/save`
   - **Method**: `POST`
   - **Headers**: `Authorization` = `Bearer rl_…` (your token)
   - **Request Body**: **JSON**, with two **Text** fields: `url` set to the **Item from List** variable, and `source` set to `shortcut`
5. Add **Get Dictionary Value** for the key `message` in **Contents of URL**, then **Show Notification** with the **Dictionary Value**, as in Shortcut 1.

Links saved this way are downloaded by the server, which has no login to any site. Paywalled or login-only pages then show as **Preview only** in the app. Open them in Safari and use Shortcut 1 to save the full copy; it replaces the preview. Saving a **Preview only** link again with Shortcut 2 downloads it again, which helps when the site has changed or only failed for a moment.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| "Missing or invalid access token" | Check the `Authorization` header: `Bearer`, one space, then the whole token. Or the token was revoked; create a new one. |
| The shortcut doesn't appear in Safari's Share menu | Check **Show in Share Sheet**, and that **Safari web pages** is one of the input types. Scroll to the end of the Share menu's action list; you may need to tap **Edit Actions** to show it. |
| "Run JavaScript on Web Page" fails or isn't allowed | Turn on **Allow Running Scripts** (see "Before you start"). On a Mac, also turn on **Allow JavaScript from Apple Events** in Safari's **Developer** settings. |
| **Request Body: File** won't take the JavaScript Result | Instead, add **Get Dictionary from Input** after the script, and use **Request Body: JSON** with three Text fields, `url`, `title` and `html`, each set with **Get Dictionary Value** from that dictionary, plus `source` = `shortcut`. |
| "The page is too large to save" | Very long pages are over the 4 MB limit. Use Shortcut 2 for that page. |
| The notification is empty | The server answered with an error. Run the shortcut from the Shortcuts app to see the full response of **Get Contents of URL**. |
| Nothing happens on the Mac | Open the shortcut in the Shortcuts app and run it from there with a Safari window open, to see which action stops. |
