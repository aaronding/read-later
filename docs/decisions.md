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

17. **Download limits:** 15 seconds in total, 10 MB after decompression (a CNN article is 5.6 MB, mostly scripts and styles), at most 5 redirects, HTML content types only (PDFs and images are not saved in stage 1). 404 and 410 fail at once; 408, 429 and 5xx are retried; 401, 402 and 403 are kept and flagged "Preview only", with the status in the reason: a 403 can be a site turning away downloads that don't come from a browser, not only a login.
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

33. **Plain CSS** in one stylesheet (`apps/web/src/app/globals.css`), rather than a CSS framework. Its colors and reading font are CSS variables that follow the reader's appearance choices (79 to 82).
34. **Articles are marked read when the reader page has loaded in the browser**, not during server rendering, so Next.js link prefetching can't mark an article read that was never opened.
35. **Triage shows unread Inbox articles, newest first.** "Later" keeps the article in the Inbox and moves it to the back of the triage queue (`articles.triaged_at`). "Read now" opens the reader.
36. **Polling:** pages with work in progress refresh themselves every 3 seconds while visible, and stop after 5 minutes so a job that is waiting out its retry delay doesn't poll forever.
37. **Search** uses Postgres full-text search with the language-neutral `simple` configuration, because saved articles come in many languages. Each word matches as a prefix ("orchard" finds "orchards"); there is no stemming. Postgres doesn't split Chinese or Japanese text into words, so queries in those scripts also match as substrings of the title, text and summary.
38. **The header search searches the list you are looking at** (Inbox, Favorites or Archive); from other pages it searches the Inbox.
39. **The paste box accepts bare addresses** such as `example.com/story` and reads them as `https://`.
40. **Tags are case-insensitive per user and reused as written.** Removing a tag from its last article deletes the tag, so it stops steering Claude's suggestions. Folders are flat, and deleting one keeps its articles.
41. **Export** produces one JSON file (all fields, text, sanitized HTML, every summary with its tokens and cost) or one Markdown file (metadata, the shown summary and the plain text of each article).
42. **The reader drops a heading at the top of the article that repeats the title**, since the title is already shown above. Readability only does this when the heading matches its own guess at the title, which may still include the site name.
43. **Security headers:** a nonce-based Content Security Policy, set per request in `apps/web/src/proxy.ts`. Only scripts carrying that request's nonce run (Next.js adds it to its own scripts), so even a script that got past the sanitizer into a saved article would be blocked. Frames and plugins are blocked; images from any host are allowed, because articles use them. Styles stay `'unsafe-inline'`, because style attributes can't carry a nonce, and saved articles have their styles removed anyway. Also `nosniff`, `Referrer-Policy: no-referrer` and `X-Frame-Options: DENY`.

## Saving from devices

44. **Android's share target uses GET** (`/share?url&text&title`), handled by a route handler that saves and then redirects to the Inbox. Sign-in cookies are reliably sent on a top-level GET; with POST they may not be, depending on the browser's SameSite handling of share-target navigations. A link to `/share` on another website could otherwise make the owner save pages (and spend Claude credits) without knowing. So when the browser reports that another site sent it (`Sec-Fetch-Site: cross-site` or `same-site`), the app asks for confirmation first. Shares from the Share menu are browser-initiated and save directly.
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


## After the security review

57. **A re-save while a job is running gets its own run.** Only *queued* jobs count as "already pending"; a running job has already read the old state. Submitted HTML is cleared after processing only if it is still the HTML that was processed (compared by MD5 in SQL), so a newer copy that arrives meanwhile is kept for its own run.
58. **An article and its summary requests are stored in one transaction**, and a summary is never marked pending without a job. Retry also picks up summaries stuck as pending or running with no job, and the reader offers Retry when a summary has said "Summarizing…" for over 10 minutes.
59. **A job's result is recorded only while its worker still holds the job.** If a worker took so long that another worker took the job back, the slow worker's late result is dropped.
60. **Each Claude call has an overall limit of 150 seconds** (`SUMMARY_TIMEOUT_MS`). The SDK's own timeout stops counting once a streamed answer starts, so a stalled stream could otherwise outlive a 300-second serverless function. A call that hits the limit is retried later.
61. **A summary that ran out of tokens (`max_tokens`) is not retried automatically**, because the same request would most likely stop the same way; Retry in the app tries again on purpose.
62. **After a refusal fallback, only the text after the last `fallback` marker is read.** The declined model's partial answer comes before it.
63. **Redirect targets** (`?next=` on sign-in, and the reader's delete) are resolved against a placeholder origin and must stay on it. Values with backslashes or control characters are refused, because browsers read `/\evil.com` as another site.
64. **Saved articles' `id` and `name` attributes get a `user-content-` prefix** (DOMPurify's `SANITIZE_NAMED_PROPS`), and links to anchors inside the article are rewritten to match. Without the prefix, an element such as `<a id="__next_f">` could shadow a page global and break the reader.

## Neon

65. **`neon.ts` at the repository root declares Postgres only**, as `neon init` wrote it, with `auth: false`: the app keeps its own Better Auth with Google, and Neon's guidance is not to replace a working sign-in. Its branch policy gives branches made with `neon checkout --create` a 7-day lifetime. `@neon/config` is a root dev dependency, since only the Neon CLI reads `neon.ts`. The app doesn't use `@neon/env` (Neon's helper for reading those variables), but `neon init` installs it with `@neon/config` and tries to add it again when it is missing, which fails at a pnpm workspace root, so it stays. `.neon`, which names the linked organization, project and branch, is git-ignored, as `neon init` set it up.
66. **The Neon CLI is installed globally (`npm i -g neon`), not as a dependency**, so pnpm's 7-day rule doesn't reach it. The setup used 8.10.3, published the same day, as Neon's instructions asked for the latest release; the newest week-old one, 8.4.4, wasn't tried with these commands. It is a tool the owner runs by hand, never part of the app, but it holds the Neon login and writes `.env`, so it is worth installing with care. The packages the repository depends on do follow the rule: `@neon/config` 1.9.1, `@neon/env` 1.6.2 and `@vercel/functions` 3.10.1 were the newest week-old releases.
67. **The driver stays node-postgres, with `attachDatabasePool` from `@vercel/functions`**, which Neon and Vercel both recommend for Vercel's Fluid compute: it keeps a function alive just long enough to close its idle connections before Vercel suspends it, and does nothing off Vercel. On Vercel, idle connections close after 5 seconds, Vercel's recommendation; elsewhere after 30. Neon's serverless driver (HTTP or WebSocket) is meant for platforms that can't keep a pool, and the worker and the Docker setup use the same pool.
68. **The app uses Neon's pooled string (`DATABASE_URL`), the migrations and drizzle-kit the direct one (`DATABASE_URL_UNPOOLED`)**, under the names `neon env pull` writes. The pooler runs PgBouncer in transaction mode, which migrations shouldn't go through; the app's queries keep no session state (no `SET`, `LISTEN` or advisory locks), so they work through it. Without `DATABASE_URL_UNPOOLED`, as with a local Postgres, everything uses `DATABASE_URL`. Docker Compose sets both to its own Postgres, so a Neon value left in a server's `.env` can't send the migrations to Neon.
69. **`sslmode=require` reaches node-postgres as `verify-full`.** node-postgres treats `require` as `verify-full` today but warns that its next major version will check less, and Neon recommends `verify-full`. **`channel_binding=require` turns on node-postgres's channel binding** (SCRAM-SHA-256-PLUS when the server offers it), which it otherwise ignores.
70. **Vercel runs the functions in Cleveland (`cle1`, `apps/web/vercel.json`)**, next to the Neon project in AWS US East 2 (Ohio), rather than in Vercel's default of Washington, D.C.

## From the first local run

71. **Downloads name HTTP/1.1 in the TLS handshake (ALPN), as browsers and curl do.** Node offers no protocol there unless asked. CNN answered Node's HTTP/1.1 requests with a 403 whatever their User-Agent or header names, while serving the same request from curl, and from Node over HTTP/2. Offering `http/1.1`, the protocol the downloader speaks, is a standard part of the handshake, not a disguise: the User-Agent still names the app.
72. **Script and style-sheet contents are left out before jsdom builds the DOM**, except JSON-LD, which the paywall rules read. They are most of a big page's bytes and never part of the article: on a CNN article, extraction went from 3.8 to about 1.2 seconds. parse5, the parser jsdom itself uses, finds where each one starts and ends, so a `<script` inside a comment, a title or an attribute is left alone, and hostile markup can't slow it down. The elements and their attributes stay. A page with more than 4 MB of HTML left, the limit for a page sent from the browser, is refused as too large: building a DOM from that much markup already takes about 30 seconds and 1.5 GB.
73. **On a server download, the free part of a subscriber-only article is what is left of the article itself**: the `article` element around the largest removed section, or `main`, or else the nearest wrapper that still holds text, but never the whole `<body>`. Readability runs on the same page narrowed to that part, so the head's title, author and date still count. It no longer searches the rest of the page, where on CNN it took a sidebar of stock prices for the article. When fewer than 100 words are left, no text is kept and nothing is summarized: the reader shows the title and description with the "Preview only" notice.
74. **JSON-LD is recognized however its type is written** (`application/ld+json` in any case, with or without parameters such as `; charset=utf-8`), so a page can't escape the paywall rules by the way it labels its markup.

## Firefox

75. **The extension also builds for Firefox**, which the brief doesn't ask for; the owner did. One build writes both, and only `manifest.json` differs, made by `apps/extension/manifest.mjs`. Firefox runs a Manifest V3 background script as an event page (`background.scripts`) rather than a service worker. The code keeps calling `chrome.*`, which Firefox also provides with promises, so it needs no polyfill. Firefox for Android has no right-click menus, so the code uses `chrome.contextMenus` only where it exists.
76. **The add-on ID is fixed, `read-later@aaronding`**, rather than made from `APP_NAME`, so renaming the app can't turn it into a different add-on and lose its settings. Mozilla needs an ID to sign a Manifest V3 add-on.
77. **It declares the data it sends, browsing activity and website content, as required.** Mozilla asks every new add-on to declare this, and saving does send a page's address and content, if only to the owner's own server. Firefox shows the declaration from version 140, and from 142 on Android, so those are the minimum versions.
78. **The Firefox version is signed as an unlisted add-on ("On your own")**: everyday Firefox installs only add-ons Mozilla has signed, and unlisted signing is automatic and publishes nothing, as the Chrome version is loaded unpacked until its store listing in stage 3. Updates are installed by hand; an update server isn't worth it for one person. The build writes the zip itself (`apps/extension/zip.mjs`, with no dependency), since zipping the folder in Windows Explorer puts the folder inside the archive, which Mozilla rejects. Mozilla asks for the source of compiled code, and the guide's source archive holds only the extension, `packages/brand` and the workspace files; it rebuilds the same zip byte for byte.

## Reading design

79. **Themes: System, Light or Dark, with five palettes for each.** Light has Paper (the default, the app's first colors), White, Sepia, Sage and Mist; dark has Graphite (the default), Black, Slate, Midnight and Dusk. The light and the dark palette are chosen separately, so System switches between two palettes the reader likes. Each palette sets four colors (page, cards, text and accent) in `apps/web/src/lib/appearance.ts`, and the other shades are mixed from them. A test holds every palette to WCAG contrast: 7:1 (AAA) for article and summary text, which people read for minutes at a time, 4.5:1 for all other text, links and buttons, and 3:1 for the focus ring. The root layout puts the resulting CSS variables in the page, so a new palette is one line.
80. **A font for articles and summaries; the rest of the app keeps the device's font.** Classic, the serif the app used before (Iowan Old Style on Apple devices, Palatino on Windows, the default serif on Android), stays the default, and Sans is the device's own UI font. Literata, Source Serif, Merriweather and Atkinson Hyperlegible (made for readers with low vision) come from Google Fonts through `next/font`, which downloads them when the app is built and serves them from the app itself: browsers never contact Google, and the Content Security Policy needs no change. They aren't preloaded, so a browser downloads a font only once it is chosen. A production build has to reach Google Fonts, which Vercel's build and the Docker build can; `next dev` uses a local font when it can't. These fonts cover Latin letters only, so Chinese, Japanese and Korean text uses the device's serif or sans fonts.
81. **The appearance is kept in the account, in its own table (`user_appearance`),** so every device signed in to it reads the same way; the owner asked for this over a choice per browser. It isn't in `user_settings`, because creating that row would also fix the default summary model, which otherwise follows `DEFAULT_SUMMARY_MODEL` until one is chosen. Signed out, as on the sign-in page, pages use the default. The root layout looks the choice up for every page: it colors the browser's bars (`theme-color`), and a one-line inline script in `<head>`, which carries the CSP nonce, puts it on `<html>` as `data-*` attributes before the first paint. React doesn't render those attributes itself: if it did, a refresh already on its way when the reader changed a color (the Inbox refreshes while articles are summarized) would put the old color back. A change shows at once, and a Server Action saves it; the pickers send their saves one after another, so clicking quickly through the choices leaves the last one saved.
82. **The "Aa" button in the header** opens the same choices as Settings over the page, so they can be tried on the article being read; on a phone it is a sheet at the bottom of the screen. It uses the browser's popover, which needs no script to open or close; browsers without popovers (Safari before 17) don't show the button, and Settings still works there. The reader's column holds about 70 characters a line, article text is 18 px on phones and 19 px on larger screens, and while reading, the header scrolls away with the page instead of staying at the top.
