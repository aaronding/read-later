import { APP_NAME } from "@/config/app";
import { SHORTCUT_SCRIPT } from "@/lib/shortcut";
import { CopyButton } from "./copy-button";

export function ChromeGuide({ serverUrl }: { serverUrl: string }) {
  return (
    <ol>
      <li>
        On your computer, in the project folder, run <kbd>pnpm extension:build</kbd>. It creates{" "}
        <code>apps/extension/dist</code>.
      </li>
      <li>
        In Chrome, open <code>chrome://extensions</code>, turn on <strong>Developer mode</strong>, click{" "}
        <strong>Load unpacked</strong> and choose the <code>apps/extension/dist</code> folder.
      </li>
      <li>
        Open the extension’s <strong>Options</strong>. Enter the server URL <code>{serverUrl}</code> and an access token
        from above.
      </li>
      <li>
        Save a page with the toolbar button or <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> (on a Mac,{" "}
        <kbd>Option</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>). Right-click a link and choose{" "}
        <strong>Save link to {APP_NAME}</strong> to save just the link. The badge shows ✓ when it worked and ! when it
        didn’t.
      </li>
    </ol>
  );
}

export function ShortcutGuide({ saveUrl }: { saveUrl: string }) {
  return (
    <>
      <p>
        You build two Shortcuts by hand, once; they then sync to your iPhone, iPad and Mac through iCloud. The first
        sends the whole page from Safari, so paywalled articles you can read are saved in full. The second, for other
        apps such as Chrome on iPhone, sends only the link.
      </p>
      <h3>Before you start</h3>
      <ul>
        <li>
          <strong>iPhone and iPad:</strong> Settings → Apps → Shortcuts → Advanced → turn on{" "}
          <strong>Allow Running Scripts</strong> (on iOS 17 and earlier: Settings → Shortcuts → Advanced).
        </li>
        <li>
          <strong>Mac:</strong> in the Shortcuts app, Shortcuts → Settings → Advanced → turn on{" "}
          <strong>Allow Running Scripts</strong>. If Safari still refuses to run the script, open Safari → Settings →
          Advanced → turn on <strong>Show features for web developers</strong>, then in Safari’s new{" "}
          <strong>Developer</strong> settings tab turn on <strong>Allow JavaScript from Apple Events</strong>, and
          restart Safari.
        </li>
        <li>Create an access token above for this device and keep it at hand.</li>
      </ul>

      <h3>Shortcut 1: “Save to {APP_NAME}” (Safari)</h3>
      <ol>
        <li>
          In the Shortcuts app, tap <strong>+</strong> to make a new shortcut and name it “Save to {APP_NAME}”.
        </li>
        <li>
          Open the shortcut’s details (the ⓘ button, or the name menu → Details) and turn on{" "}
          <strong>Show in Share Sheet</strong>. In the “Receive … from Share Sheet” line at the top, tap the input types
          and leave only <strong>Safari web pages</strong> selected.
        </li>
        <li>
          Add the action <strong>Run JavaScript on Web Page</strong> (on a Mac: <strong>Run JavaScript on Active Safari
          Tab</strong>). On iPhone and iPad it uses the Shortcut Input as the page. Replace its script with this:
          <pre className="snippet">{SHORTCUT_SCRIPT}</pre>
          <CopyButton text={SHORTCUT_SCRIPT} label="Copy script" />
        </li>
        <li>
          Add <strong>Get Contents of URL</strong>. Set the URL to <code>{saveUrl}</code>, then tap{" "}
          <strong>Show More</strong>:
          <ul>
            <li>
              Method: <strong>POST</strong>
            </li>
            <li>
              Headers: add <code>Authorization</code> with the value <code>Bearer </code> followed by your token, and{" "}
              <code>Content-Type</code> with the value <code>application/json</code>
            </li>
            <li>
              Request Body: <strong>File</strong>, and choose the <strong>JavaScript Result</strong> variable
            </li>
          </ul>
        </li>
        <li>
          Add <strong>Get Dictionary Value</strong>: get the value for the key <code>message</code> in{" "}
          <strong>Contents of URL</strong>.
        </li>
        <li>
          Add <strong>Show Notification</strong> and put the <strong>Dictionary Value</strong> in it. It will say “Saved
          to {APP_NAME}”.
        </li>
        <li>
          Try it: in Safari, open an article, tap Share and choose the shortcut. The first time, allow it to run
          JavaScript on the site (choose <strong>Always Allow</strong>).
        </li>
      </ol>

      <h3>Shortcut 2: “Save link to {APP_NAME}” (other apps)</h3>
      <ol>
        <li>
          Make a new shortcut, turn on <strong>Show in Share Sheet</strong>, and leave only <strong>URLs</strong> and{" "}
          <strong>Text</strong> as input types.
        </li>
        <li>
          Add <strong>Get URLs from Input</strong> (from the Shortcut Input), then <strong>Get Item from List</strong>{" "}
          (First Item).
        </li>
        <li>
          Add <strong>Get Contents of URL</strong> with the URL <code>{saveUrl}</code>. Under Show More: Method{" "}
          <strong>POST</strong>; header <code>Authorization</code> = <code>Bearer </code> + your token; Request Body{" "}
          <strong>JSON</strong> with two Text fields: <code>url</code> set to the <strong>Item from List</strong>{" "}
          variable, and <code>source</code> set to <code>shortcut</code>.
        </li>
        <li>
          Add <strong>Get Dictionary Value</strong> for <code>message</code> and <strong>Show Notification</strong>, as
          in Shortcut 1.
        </li>
      </ol>
      <p className="muted small">
        Links saved this way are downloaded by the server. Pages behind a login or paywall then show as “Preview only”;
        open them in Safari and use Shortcut 1 to keep the full copy.
      </p>
    </>
  );
}

export function AndroidGuide() {
  return (
    <ol>
      <li>Open this site in Chrome on the phone and sign in.</li>
      <li>
        Open Chrome’s ⋮ menu and choose <strong>Add to Home screen</strong> → <strong>Install</strong> (or{" "}
        <strong>Install app</strong>).
      </li>
      <li>
        In any app, tap Share and choose <strong>{APP_NAME}</strong>. The link is saved and the Inbox opens.
      </li>
    </ol>
  );
}
