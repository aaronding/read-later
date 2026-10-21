# Decisions not covered by the brief

The brief says: when a decision isn't covered, choose the simpler option and note it here. Each entry says what was chosen and why. Newest entries are at the bottom.

## Tooling

1. **pnpm 10.28 is pinned** in `package.json` (`packageManager`). It is the version the project was built and tested with. A newer pnpm on the owner's PC will still work; Corepack or pnpm itself switches to the pinned version.
2. **TypeScript 5.9, not 7.** TypeScript 7 (the native compiler) was the newest release, but Next.js 16 type-checks through the JavaScript compiler API, which TypeScript 7 does not provide. 5.9 is the newest release that works with it.
3. **Node 24 is required** (`engines` in the root `package.json`, and `node:24-slim` in the Dockerfile), matching the owner's PC. Some dependencies (jsdom 30, the Anthropic SDK) no longer support early Node 22 releases.
4. **The display name lives in `packages/brand/index.js`** (`APP_NAME`). The web app imports it. The Chrome extension's build script copies it into the extension manifest, and the extension reads it back at runtime with `chrome.runtime.getManifest()`. Changing that one constant renames everything.

## Data and storage

5. **Plain `pg` (node-postgres) everywhere**, including against Neon, rather than Neon's serverless driver. Neon accepts ordinary TCP connections, so the same code works on Vercel, on a server and against a local Postgres.
6. **Better Auth tables are plural** (`users`, `sessions`, ...) via the adapter's `usePlural` option, so raw SQL never has to quote the reserved word `user`.
7. **HTML sent by the extension or Shortcut is kept in `articles.submitted_html` only until it is extracted**, then cleared. Keeping raw pages would fill Neon's 1 GB quickly.
8. **One summary row per article and model** (unique on both). The summary shown in lists and the reader comes from the model in `articles.summary_model`: the default model at save time, or the last model chosen with "Re-summarize with…".

## Saving and duplicates

9. **Only the tracking parameters the brief names are removed** (`utm_*`, `fbclid`, `gclid`, case-insensitive). The other parameters are kept byte-for-byte and in order, because some sites use them to pick the page.
10. **"Same site" for `rel=canonical` means the same host, ignoring a leading `www.`**, without the public suffix list. It is simpler, and it errs on the side of not trusting a canonical.
11. **When duplicates are detected.** At save time we use the URL and, if the browser sent HTML, its trusted canonical. After a server-side download we also use the canonical, or the final URL after redirects (so a shortened link matches the real page). The stored key is changed only if no other saved article already uses it; the two are not merged.
12. **A re-save with full HTML replaces the stored copy when that copy is "Preview only", failed or still empty.** A re-save never replaces a complete copy, so nothing is summarized twice by accident.
13. **`POST /api/save` allows any origin (CORS `*`).** It authenticates with a bearer token, not cookies, so other sites can't use the owner's session.
14. **Access tokens are `rl_` followed by 256 random bits, stored as a SHA-256 hash.** That is enough for random tokens; password-style hashing is for low-entropy secrets.
15. **Removing an email from `ALLOWED_EMAILS` locks that person out everywhere**: pages, new sign-ins, and their access tokens.
16. **Submitted HTML is limited to 4 MB** (`SAVE_MAX_HTML_BYTES`), under Vercel's 4.5 MB request body limit.

## Downloads and the paywall rules

17. **Download limits:** 15 seconds in total, 5 MB after decompression, at most 5 redirects, HTML content types only (PDFs and images are not saved in stage 1). 404 and 410 fail at once; 408, 429 and 5xx are retried; 401, 402 and 403 are kept and flagged "Preview only".
18. **Redirects and DNS are checked on every hop** by doing the address check inside the socket's DNS lookup, so a hostname can't pass the check and then connect to a private address.
19. **Paywall markup is applied only to our own downloads.** Publishers keep `isAccessibleForFree: false` in pages they serve to subscribers too, so a copy from the owner's signed-in browser is kept in full. The truncation and login heuristics apply to both.
20. **Previews of a login page, an empty page or a very short text are not summarized.** Previews that hold the free beginning of an article (subscriber-only or a paywall teaser) are summarized and the summary is marked partial.

## Summaries (Claude)

21. **The initial default model is `claude-opus-5-5`**, the claude-api skill's default. It can be changed in Settings, or for new users with `DEFAULT_SUMMARY_MODEL`.
22. **Effort `low` by default** (`SUMMARY_EFFORT`). The skill recommends `low` for summarization and extraction. Thinking is adaptive (the only mode these three models allow), and `max_tokens` is 16,000 so thinking has room.
23. **Requests stream** (`client.beta.messages.stream(...).finalMessage()`), as the skill recommends for long inputs.
24. **Refusal fallbacks are on for Opus 5.5 and Sonnet 5.5** (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). Haiku 5.5 has no server-side fallback, so the parameter is left off there. A refusal is recorded and not retried.
25. **Structured output uses a plain JSON schema, and the result is validated in our code.** The SDK's auto-parsing throws before `stop_reason` can be checked, so a refusal or a cut-off reply would surface as a parse error. Structured outputs can't enforce "3 to 5" or "1 to 3" items, so the counts are enforced after parsing.
26. **The model also returns `language`** (a BCP 47 tag), which the UI uses to mark the summary's language.
27. **Existing tags are reused exactly as written, even in another language.** Preferring existing tags is meant to avoid near-duplicates, and that would fail if every Chinese article got a Chinese twin of an English tag. New tags are written in the article's language.
28. **Input limit: 200,000 characters** (`SUMMARY_MAX_INPUT_CHARS`), about 50K tokens of English. Longer articles are cut at a paragraph break, Claude is told it has only the beginning, and the summary is marked partial with the character counts.
29. **Cost is an estimate** from the token counts and a price table in `apps/web/src/config/models.ts`. When a refusal falls back to another model, every attempt is counted at its own model's price, which may overstate the cost.
30. **No prompt caching.** Each request is a different article, and the fixed system prompt is below the minimum cacheable length.
31. **Retries:** each job gets 5 attempts with backoff of 30 s, 2 min, 8 min and 32 min (±20%). The SDK retries once inside an attempt with a 90-second timeout, so one attempt fits in a 300-second serverless function. A running job whose worker disappears is taken back after 10 minutes.

## Dependencies

32. **Every dependency must have been published for at least 7 days** (`minimumReleaseAge` in `pnpm-workspace.yaml`, which also covers indirect dependencies). Compromised npm releases are usually caught within days. When the project was set up, this meant using the newest versions at least a week old, for example Anthropic SDK 0.133 instead of 1.0.0 (released that day) and Better Auth 1.7.7 instead of 1.7.12. The cost is getting fixes a week later; a security fix that can't wait can be pinned on purpose and noted here.

## Web app

33. **Plain CSS** in one stylesheet (`apps/web/src/app/globals.css`) with CSS variables for the light and dark themes, rather than a CSS framework. Dark mode follows the device setting.
34. **Articles are marked read when the reader page has loaded in the browser**, not during server rendering, so Next.js link prefetching can't mark an article read that was never opened.
35. **Triage shows unread Inbox articles, newest first.** "Later" keeps the article in the Inbox and moves it to the back of the triage queue (`articles.triaged_at`). "Read now" opens the reader.
36. **Polling:** pages with work in progress refresh themselves every 3 seconds while visible, and stop after 5 minutes so a job that is waiting out its retry delay doesn't poll forever.
37. **Search** uses Postgres full-text search with the language-neutral `simple` configuration, because saved articles come in many languages. Each word matches as a prefix ("orchard" finds "orchards"); there is no stemming. Postgres doesn't split Chinese or Japanese text into words, so queries in those scripts also match as substrings of the title, text and summary.
38. **The header search searches the list you are looking at** (Inbox, Favorites or Archive); from other pages it searches the Inbox.
39. **The paste box accepts bare addresses** such as `example.com/story` and reads them as `https://`.
40. **Tags are case-insensitive per user and reused as written.** Removing a tag from its last article deletes the tag, so it stops steering Claude's suggestions. Folders are flat, and deleting one keeps its articles.
41. **Export** produces one JSON file (all fields, text, sanitized HTML, every summary with its tokens and cost) or one Markdown file (metadata, the shown summary and the plain text of each article).
42. **The reader drops a heading at the top of the article that repeats the title**, since the title is already shown above. Readability only does this when the heading matches its own guess at the title, which may still include the site name.
43. **Security headers:** a Content Security Policy that blocks scripts from saved articles, frames and plugins (images from any host are allowed, because articles use them), plus `nosniff`, `Referrer-Policy: no-referrer` and `X-Frame-Options: DENY`.

## Saving from devices

44. **Android's share target uses GET** (`/share?url&text&title`), handled by a route handler that saves and then redirects to the Inbox. Sign-in cookies are reliably sent on a top-level GET; with POST they may not be, depending on the browser's SameSite handling of share-target navigations. The cost is that a link to `/share?url=…` could make a signed-in owner save a page. That is harmless, and the download is protected by the address rules.
45. **Two Apple Shortcuts instead of one.** One for Safari, which runs JavaScript to send the whole page; one for other apps, which sends the link. Shortcuts has no reliable way for one shortcut to tell a Safari page from a plain URL.
46. **The extension relies on CORS rather than host permissions** to call the server, so it asks for no access to any website. `GET /api/save` with a token answers "Connected" so the options page can check the setup.
47. **If a page's HTML is too large to send** (over the 4 MB limit), the extension saves the link alone and says so.

## Infrastructure

48. **One Docker image for the web app, the worker and the migrations**, chosen by the command (`web`, `worker`, `migrate`). It includes development dependencies (the worker runs TypeScript through `tsx`). The image is larger, about 1.3 GB, but it is simpler than a separate build for each role. The app runs as the unprivileged `node` user.
49. **Compose starts `cloudflared` only with the `tunnel` profile** (`COMPOSE_PROFILES=tunnel` in the server's `.env`), so the same file also works on a PC without a tunnel token. The web container listens on the server's `127.0.0.1:3000` only.
50. **Postgres 17** in Compose and for backups, matching the Neon project. Neon's default for new projects became 18 in June 2026, so the Neon guide says to pick 17. 17 is the version PGlite (used by the tests) is built on, and moving data between Neon and the server stays a plain dump and restore.
51. **Backups:** compressed `pg_dump` custom-format files in R2 under `daily/`. Deleting old copies is left to an R2 lifecycle rule (30 days is suggested). The GitHub Action skips with a notice until its secrets exist. On the one-server setup, `scripts/server-backup.sh` runs from the server's crontab instead, because GitHub can't reach a database with no open ports.
52. **The cron Worker has no public URL** (`workers_dev = false`); it only runs on its schedule, every 5 minutes.
53. **One `.env` at the repository root** configures the web app, the worker, the migrations and Compose. Variables already set in the environment take precedence.
54. **`scripts/mock-claude.ts`** is a local stand-in for the Claude API, so the whole flow can be tried without an API key and without cost. It isn't used in production.
55. **Line endings:** `.gitattributes` keeps LF endings for shell scripts and Docker files, so a Windows checkout still builds a working image.
56. **`apps/web/AGENTS.md` is committed.** `next dev` writes it to point coding agents at the Next.js docs bundled in `node_modules`, and it re-creates the file whenever it's missing.
