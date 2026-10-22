# The Firefox extension

The same extension as the [Chrome one](chrome-extension.md), built for Firefox. The toolbar button and **Alt+Shift+S** (on a Mac, Option+Shift+S) save the page you're reading with its full text, and right-clicking a link offers **Save link to Read Later**. The badge, the options and the permissions work as the Chrome guide describes.

It needs Firefox 140 or later. Firefox for Android isn't tested.

Firefox has two ways to run an add-on you build yourself:

- **Temporary**, from `about:debugging`: no account needed, but Firefox removes it when it quits. Good for trying it out and for development.
- **Signed**: everyday Firefox keeps only add-ons that Mozilla has signed. You upload the build to addons.mozilla.org as an unlisted add-on. It is checked automatically and signed, usually within minutes, and it is not listed or published anywhere. This needs a free Mozilla account.

## Build

In the repository folder:

```sh
pnpm install
pnpm extension:build
```

This creates `apps/extension/dist-firefox` and `apps/extension/dist-firefox.zip`. The same command also builds the Chrome version into `apps/extension/dist`.

## Try it: a temporary install

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…** and choose `apps/extension/dist-firefox/manifest.json`.
3. Connect it to your account, as in [the Chrome guide](chrome-extension.md#install) (step 3): the server URL, then an access token from the web app's **Settings → Access tokens**, then **Save and check**. The options page opens by itself after installing. To reach it later, open `about:addons`, click **⋯** on Read Later's card and choose **Options** (**Preferences** on a Mac).

After changing the code, run `pnpm extension:build` again and click **Reload** on the add-on's card. The add-on disappears when Firefox quits; load it again the same way.

## Install it for good: sign it

1. **Build it** as above.
2. **Make an archive of the source code.** The build compiles TypeScript, and Mozilla asks for the source of any add-on made with a build tool. In the repository folder:

   ```sh
   git archive -o read-later-extension-source.zip HEAD apps/extension packages/brand docs/firefox-extension.md package.json pnpm-workspace.yaml pnpm-lock.yaml
   ```

   It holds only the extension, the display name it uses and this guide, whose Build section tells a reviewer how to rebuild it. Mozilla's reviewers can see it; it isn't published.
3. **Upload it.**
   1. Sign in at the [Add-on Developer Hub](https://addons.mozilla.org/developers/), creating a Mozilla account if you don't have one. The first time, it asks you to accept Mozilla's distribution agreement.
   2. Click **Submit a New Add-on**, and choose **On your own** for how it's distributed.
   3. Upload `apps/extension/dist-firefox.zip`. The automatic check should report no errors and no warnings.
   4. When asked whether you need to submit source code, choose **Yes** and upload `read-later-extension-source.zip`.
   5. Submit. An email tells you when it has been signed.
4. **Install the signed file.** In the Developer Hub, open **My Add-ons → Read Later**, then the version you uploaded, and click its `.xpi` file in Firefox. Or download it and use **Install Add-on From File…** from the gear menu in `about:addons`.
5. **Accept the install prompt.** Besides the permissions, it lists the data the add-on sends: your browsing activity and website content. That is the address and the text of each page you save, sent only to the server you set in the options.
6. **Connect it to your account** as in step 3 of the temporary install.

Optional: Firefox puts the button in the **Extensions** menu (the puzzle-piece icon). To keep it on the toolbar, open that menu, click the gear next to Read Later, and choose **Pin to Toolbar**.

### Updating a signed install

1. Raise `version` in `apps/extension/package.json`, for example from `0.1.0` to `0.1.1`. Mozilla refuses a version number it has already signed.
2. Build it again and make a new source archive.
3. In the Developer Hub, open the add-on and choose **Upload New Version**, then upload both files as before.
4. Install the newly signed `.xpi` over the old one. Your settings are kept, because the add-on's ID stays the same.

## Troubleshooting

The [Chrome guide's table](chrome-extension.md#troubleshooting) applies too. In Firefox, also:

| Symptom | What to do |
| --- | --- |
| "This add-on could not be installed because it has not been verified" | You tried to install the unsigned zip. Use a temporary install, or install the signed `.xpi` from the Developer Hub. |
| The add-on is gone after restarting Firefox | It was a temporary install. Load it again, or sign it. |
| Nothing happens in a private window | Firefox runs add-ons in private windows only when you allow it: in `about:addons`, open Read Later and set **Run in Private Windows** to **Allow**. |
| The shortcut does nothing | Another add-on or Firefox itself may use it. In `about:addons`, choose **Manage Extension Shortcuts** from the gear menu and pick another. |
| **!** on `about:` and other built-in pages | Only `http` and `https` pages can be saved. |
| A page on addons.mozilla.org is saved from the server's own download | Nothing to do: Firefox doesn't let add-ons read Mozilla's own sites, so only the link is sent. |
| Mozilla refuses the upload because the version exists | Raise `version` in `apps/extension/package.json` and build again. |
