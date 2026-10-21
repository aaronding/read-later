# Read Later: build brief (stage 1)

A personal read-later app in the spirit of Pocket, which Mozilla shut down in 2025. You save an article while browsing, and the app keeps the original URL, a clean copy of the content, and an AI summary. "Read Later" is a working name; the final product name is still open (candidates: GistLater, Laternook). Keep the display name in one config constant so it's easy to change.

The owner (Aaron) develops on Windows and uses Chrome and Safari on a Mac, an iPhone and an iPad, plus an Android phone.

## Stages

Build **stage 1 only**. The later stages are listed so you don't design them out.

1. **Stage 1, owner only.** Google sign-in. Save from Chrome and Safari. Review saved articles, summaries and content in the web app.
2. **Stage 2, invite-only beta.** Testers with a free monthly summary limit, import (Pocket CSV and HTML, Instapaper, browser bookmark files), an admin page for usage and AI cost, and more advanced features to be decided.
3. **Stage 3, public.** Privacy page, terms with a copyright contact, account deletion, Chrome Web Store listing, Google sign-in opened to everyone.
4. **Stage 4.** Advanced features: Sign in with Apple, a Safari extension and native apps (all need the $99/year Apple developer membership, which the owner doesn't have yet), semantic search, highlights, offline reading.

## Decisions already made

- **Language:** TypeScript everywhere.
- **Web app:** Next.js (App Router) for both pages and API. Postgres through Drizzle ORM. Better Auth for login (Google only for now).
- **Saving:** a Chrome extension (Manifest V3, plain TypeScript, no framework needed), an Apple Shortcut for Safari, Android's Share menu through the installed web app, and pasting a URL into the web app.
- **Summaries:** Claude, written in the article's own language. The owner wants to compare models before choosing a default.
- **Hosting:** free tiers first, built so it can move to one server later (see "Hosting and portability").
- **Not in stage 1:** Sign in with Apple, Facebook, X.

## Architecture

**Web app** (anything someone waits for, about a second): pages, sign-in, accepting saves and replying "Saved", organizing, search, settings.

**Background jobs** (slow or failure-prone work):
1. Download the page when only a URL was sent.
2. Extract the article.
3. Summarize with Claude.
4. Save the results.
5. Retry with backoff on failure.

Store jobs in a Postgres table and claim them with `FOR UPDATE SKIP LOCKED`, all handled by one `processJobs()` function. Don't use a vendor queue.

- **On Vercel:** run jobs right after the save response with Next.js `after()`. A tiny Cloudflare Worker cron (free plan) calls a protected `/api/jobs/run` endpoint every few minutes as the safety net.
- **On a server:** a worker process runs `processJobs()` in a loop.

## Stage 1 features and acceptance criteria

### 1. Sign-in
- Google sign-in only, restricted by an `ALLOWED_EMAILS` environment variable.
- Every app table has a `user_id`, and every query is scoped to it.

### 2. Saving
- **API:** `POST /api/save` with a Bearer personal access token and CORS for the extension. Body: `{ url, html?, title? }`. Reply in under a second, create the article as `pending`, and queue a job.
- **Access tokens:** created and revoked in Settings. Store only a hash, and show the token once.
- **Chrome extension:**
  - Toolbar button and a keyboard shortcut save the current page.
  - A right-click menu item saves a link (URL only).
  - It sends the URL plus the page's HTML with `script`, `style` and `noscript` removed.
  - An options page holds the server URL and token. A badge shows success or failure.
  - Document "load unpacked" installation.
- **Apple Shortcut (Safari on iPhone, iPad and Mac):** the owner builds it by hand, so write step-by-step instructions on the Settings page and in the docs.
  - From Safari's Share menu, use "Run JavaScript on Web Page" to get `document.URL` and the HTML, then POST it with the token.
  - From other apps, such as Chrome on iPhone, POST only the URL.
  - Mention the "Allow Running Scripts" setting, and on the Mac, possibly Safari's Develop menu option "Allow JavaScript from Apple Events".
- **Android:** a web app manifest with `share_target` pointing to a `/share` route (URL only; handle URLs that arrive in the `text` field).
- **Web app:** a "paste a URL" box.

### 3. Processing
- **Downloading:**
  - http and https only.
  - Block private, loopback and link-local addresses, including after redirects (protection against server-side request forgery).
  - Time and size limits.
  - An honest User-Agent that names the app.
- **Extraction:** `@mozilla/readability` on a server-side DOM. Sanitize the HTML with DOMPurify before storing it. Store title, author, site name, publish date, cleaned HTML, plain text, word count and reading time.
- **URLs:** keep the exact URL as saved. Also store a normalized URL: remove `utm_*`, `fbclid`, `gclid` and fragments, and use `rel=canonical` only if it points to the same site and isn't the homepage. Use the normalized URL to catch duplicates per user. Re-saving moves the article back to the top of the Inbox. A full-page save replaces a "preview only" copy.
- **Paywalls and logins (hard rules):**
  - Never get around a paywall or login: no pretending to be a search crawler, no archive sites for paywalled pages, no removing overlays.
  - On server-side downloads, drop sections the page marks with `isAccessibleForFree: false`.
  - Flag articles that look truncated or show a login page as "Preview only", keep the link, and tell the user to save from the extension or Safari to get the full copy.
  - Never share stored content between users.
- **Summaries:**
  - Use the official Anthropic TypeScript SDK. **Load the claude-api skill first** and follow it for exact request shapes, effort, structured output and refusal fallbacks.
  - Models to compare: `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`.
  - Output (structured JSON): a one-sentence `tldr`, 3–5 `key_points` and 1–3 `suggested_tags` that prefer the user's existing tags. Write all of it in the article's language.
  - Store one row per article and model, with tokens, cost and time taken.
  - Don't silently cut off very long articles. Set a generous limit and record when a summary covers only part of the article.
- **Model comparison:**
  - A default model in Settings.
  - A comparison mode that runs all three models on each save.
  - A Compare button on each article showing the summaries side by side with cost and time.
  - A "Re-summarize with…" option.

### 4. Review interface
Responsive, works well on phones, supports dark mode.
- **Library:** Inbox, Favorites and Archive. Each list item shows title, site, reading time, saved date and the TL;DR. Search uses Postgres full-text search over title, text and summary.
- **Reader:** summary first, then the clean article, an "Open original" link, a "Preview only" badge when it applies, and Archive, Favorite and Delete. Opening an article marks it read.
- **Triage:** unread articles one at a time, showing the summary, with Read now, Later or Archive.
- **Processing states:** a new article shows "Summarizing…" until its summary is ready (polling is fine), and failures offer a Retry.

### 5. Do last, only if time allows
- **Folders:** flat, at most one per article.
- **Tags:** any number per article, with AI-suggested tags as one-tap suggestions.
- **Export:** everything as JSON or Markdown.

## Hosting and portability

**Free setup for stage 1 and the beta:**
- Vercel free plan, with a 300-second function limit, for non-commercial use.
- Neon free plan: 1 GB per project, sleeps when idle.
- Cloudflare DNS (the owner already uses it).
- A nightly `pg_dump` to Cloudflare R2 run by GitHub Actions.

Claude API usage is the only paid part.

**Later, one server:** DigitalOcean Premium AMD, 2 GB, about $14/month. Docker Compose runs the web app, the worker, Postgres and `cloudflared` (Cloudflare Tunnel for HTTPS, with no open ports).

**Portability rules:**
- Use only plain Postgres features.
- Put all configuration in environment variables, with a complete `.env.example`.
- Don't use platform-only services beyond `after()`, which gets a fallback.
- Ship a Dockerfile and a `docker-compose.yml` from day one, and check that they work.

## Development notes
- The owner's PC runs Windows with Node 24 and pnpm, and has no Docker. Local development must work there with `DATABASE_URL` pointing to a Neon branch or a local Postgres.
- Tests may use PGlite.
- Suggested layout: a pnpm workspace with `apps/web`, `apps/extension` and `docs/`.

## Done for stage 1 means
- The owner signs in with Google, saves from the Chrome extension and the Safari Shortcut, sees a summary within about 30 seconds, compares the three models, and reads the clean article on desktop and phone.
- **Tests:**
  - Unit tests for URL normalization, the address blocking, the paywall rules and extraction (with saved sample HTML).
  - An integration test of the save → job → summary flow with Claude mocked.
- **Docs:**
  - A README covering local setup.
  - Step-by-step guides for each account the owner must create: a Google Cloud OAuth client, an Anthropic API key, Neon, Vercel, the Cloudflare Worker cron, R2 and DNS.
  - The Shortcut guide and the extension install guide.
  - A one-page "move to one server" guide.

## Working agreements
- Commit in small, clear steps to the private GitHub repo.
- Never commit secrets.
- Ask the owner before creating accounts, spending money, or publishing anything.
- When a decision isn't covered here, choose the simpler option and note it in `docs/decisions.md`.
