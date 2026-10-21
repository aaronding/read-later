# Vercel (hosting the web app)

Vercel builds and runs the Next.js app straight from the GitHub repository, on its free **Hobby** plan. Hobby is for personal, non-commercial use, which fits stage 1. When the app becomes a business, move to a paid plan or to [one server](../move-to-server.md).

Before this, set up [Neon](neon.md) (and run the migrations), the [Google OAuth client](google-oauth.md) and the [Anthropic key](anthropic.md).

## 1. Import the repository

1. Sign up at <https://vercel.com> with your GitHub account and choose the **Hobby** plan.
2. Click **Add New… → Project** and import `read-later`. If it isn't listed, choose **Adjust GitHub App Permissions** and give Vercel access to that one repository.
3. In the import settings:
   - **Root Directory:** `apps/web` (click **Edit** and choose it).
   - **Framework Preset:** Next.js (detected).
   - Leave the build and install commands at their defaults. Vercel sees the pnpm workspace and installs from the repository root.
4. Open **Environment Variables** and add (the values are in your notes from the other guides):

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | Neon's **pooled** connection string |
   | `APP_URL` | `https://read.example.com`, or for now the Vercel address shown after the first deploy |
   | `BETTER_AUTH_SECRET` | a random secret (see `.env.example`) |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from Google |
   | `ALLOWED_EMAILS` | your Gmail address |
   | `ANTHROPIC_API_KEY` | from the Claude Console |
   | `JOBS_SECRET` | a random secret; the cron Worker uses the same one |

5. Click **Deploy**.

## 2. After the first deploy

1. **Node.js version:** the app's `package.json` asks for Node 24, which Vercel uses (it's also Vercel's default). You can check it in **Settings → Build and Deployment → Node.js Version**.
2. **Function region:** in **Settings → Functions**, set the region next to your Neon database (Washington, D.C. `iad1` for Neon's AWS US East).
3. **Address:** if you used the Vercel address for `APP_URL`, add it to the Google client's origins and redirect URIs. Then set up [your own domain](dns.md) and change `APP_URL` to it.
4. Changing an environment variable takes effect on the next deployment: in **Deployments**, open the menu on the latest one and choose **Redeploy**.

Every push to the `main` branch now deploys automatically. Pushes to other branches create preview deployments; sign-in doesn't work on those (Google only knows your real address), which is expected.

## Good to know

- **Background work:** each save starts its jobs right after replying, using Next.js `after()`, and can keep working for up to 300 seconds (Hobby's limit with Fluid compute, which new projects use). The [Cloudflare Worker cron](cloudflare-worker-cron.md) picks up anything left over every 5 minutes.
- **Size limit:** Vercel accepts request bodies up to 4.5 MB, so the app limits saved pages to 4 MB. Larger pages are saved as a link.
- **Logs:** a deployment's **Logs** tab shows errors from saves and background jobs.
