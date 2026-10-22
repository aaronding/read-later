import type { Metadata } from "next";
import { deleteFolderAction, revokeTokenAction, updateSettingsAction } from "@/app/actions";
import { AppearancePicker } from "@/components/appearance-picker";
import { ConfirmButton } from "@/components/confirm-button";
import { AndroidGuide, ChromeGuide, ShortcutGuide } from "@/components/connect-guides";
import { LocalDate } from "@/components/local-date";
import { SignOutButton } from "@/components/sign-in-button";
import { SubmitButton } from "@/components/submit-button";
import { TokenForm } from "@/components/token-form";
import { appUrl } from "@/config/env";
import { MODEL_INFO, SUMMARY_MODELS } from "@/config/models";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { listFolders } from "@/lib/folders";
import { getSavedAppearance } from "@/lib/saved-appearance";
import { getSettings } from "@/lib/settings";
import { listApiTokens } from "@/lib/tokens";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const db = getDb();
  const [settings, tokens, folders, appearance] = await Promise.all([
    getSettings(db, user.id),
    listApiTokens(db, user.id),
    listFolders(db, user.id),
    getSavedAppearance(),
  ]);
  const serverUrl = appUrl();

  return (
    <div className="settings">
      <div className="page-title">
        <h1>Settings</h1>
      </div>

      <section className="card" aria-labelledby="appearance-heading">
        <h2 id="appearance-heading">Appearance</h2>
        <p className="muted">
          Colors and a font for reading. System follows your device’s light or dark mode. The choice is kept in this
          browser, and the <strong>Aa</strong> button at the top of every page changes it while you read.
        </p>
        <AppearancePicker saved={appearance} />
      </section>

      <section className="card" aria-labelledby="summaries-heading">
        <h2 id="summaries-heading">Summaries</h2>
        <form action={updateSettingsAction}>
          <div className="field">
            <label htmlFor="defaultModel">Default model</label>
            <select id="defaultModel" name="defaultModel" defaultValue={settings.defaultModel}>
              {SUMMARY_MODELS.map((model) => (
                <option key={model} value={model}>
                  {MODEL_INFO[model].label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="checkbox" style={{ fontWeight: 400 }}>
              <input type="checkbox" name="comparisonMode" defaultChecked={settings.comparisonMode} />
              <span>
                <strong>Comparison mode:</strong> summarize every new save with all three models, to compare them on
                each article’s Compare page. Costs about three times as much.
              </span>
            </label>
          </div>
          <SubmitButton className="button primary" pendingText="Saving…">
            Save
          </SubmitButton>
        </form>
      </section>

      <section className="card" aria-labelledby="tokens-heading">
        <h2 id="tokens-heading">Access tokens</h2>
        <p className="muted">
          The Chrome extension and the Apple Shortcuts use a token to save to your account. Make one per device, so you
          can revoke one without touching the others.
        </p>
        <TokenForm />
        {tokens.map((token) => (
          <div key={token.id} className="token-row">
            <div>
              <strong>{token.name}</strong>
              <div className="muted small">
                <code>{token.tokenPrefix}…</code> · created <LocalDate value={token.createdAt} />
                {token.lastUsedAt ? (
                  <>
                    {" "}
                    · last used <LocalDate value={token.lastUsedAt} />
                  </>
                ) : (
                  " · never used"
                )}
              </div>
            </div>
            <form action={revokeTokenAction}>
              <input type="hidden" name="tokenId" value={token.id} />
              <ConfirmButton className="button small danger" message={`Revoke “${token.name}”? Anything using it stops working.`}>
                Revoke
              </ConfirmButton>
            </form>
          </div>
        ))}
      </section>

      <section className="card" aria-labelledby="chrome-heading">
        <h2 id="chrome-heading">Save from Chrome</h2>
        <ChromeGuide serverUrl={serverUrl} />
      </section>

      <section className="card" aria-labelledby="shortcut-heading">
        <h2 id="shortcut-heading">Save from Safari (iPhone, iPad and Mac)</h2>
        <details>
          <summary>Step-by-step instructions for the Apple Shortcuts</summary>
          <ShortcutGuide saveUrl={`${serverUrl}/api/save`} />
        </details>
      </section>

      <section className="card" aria-labelledby="android-heading">
        <h2 id="android-heading">Save from Android</h2>
        <AndroidGuide />
      </section>

      <section className="card" aria-labelledby="folders-heading">
        <h2 id="folders-heading">Folders</h2>
        {folders.length === 0 ? (
          <p className="muted">No folders yet. Choose or create one at the bottom of an article.</p>
        ) : (
          folders.map((folder) => (
            <div key={folder.id} className="token-row">
              <span>
                <strong>{folder.name}</strong> <span className="muted small">· {folder.count} article{folder.count === 1 ? "" : "s"}</span>
              </span>
              <form action={deleteFolderAction}>
                <input type="hidden" name="folderId" value={folder.id} />
                <ConfirmButton className="button small" message={`Delete the folder “${folder.name}”? Its articles stay in your library.`}>
                  Delete
                </ConfirmButton>
              </form>
            </div>
          ))
        )}
      </section>

      <section className="card" aria-labelledby="export-heading">
        <h2 id="export-heading">Export</h2>
        <p className="muted">Everything you saved, with the article text and every summary.</p>
        <div className="card-actions">
          <a className="button" href="/api/export?format=json" download>
            Download JSON
          </a>
          <a className="button" href="/api/export?format=markdown" download>
            Download Markdown
          </a>
        </div>
      </section>

      <section className="card" aria-labelledby="account-heading">
        <h2 id="account-heading">Account</h2>
        <p>
          Signed in as <strong>{user.email}</strong>.
        </p>
        <SignOutButton />
      </section>
    </div>
  );
}
