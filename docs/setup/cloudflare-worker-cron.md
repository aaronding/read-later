# Cloudflare Worker cron (the safety net for background jobs)

Normally each save's background jobs (download, extract, summarize) run right after the save, inside Vercel's `after()`. If one is cut short or needs a retry later, nothing would pick it up until the next save. This small Cloudflare Worker calls the app's protected `/api/jobs/run` endpoint every 5 minutes, so leftovers always finish. It runs on Cloudflare's free Workers plan.

You need the app deployed with `JOBS_SECRET` set (see [Vercel](vercel.md)).

## 1. Set the app's address

In `apps/cron-worker/wrangler.toml`, set `APP_URL` to your app's public address, without a trailing slash:

```toml
[vars]
APP_URL = "https://read.example.com"
```

## 2. Deploy it

From the repository folder on your PC:

```sh
cd apps/cron-worker
pnpm exec wrangler login        # opens the browser to connect Wrangler to your Cloudflare account
pnpm run deploy                 # uploads the Worker and its 5-minute schedule
pnpm exec wrangler secret put JOBS_SECRET
```

When asked, paste the **same** `JOBS_SECRET` value you set on Vercel. (Note: it's `pnpm run deploy`; plain `pnpm deploy` is a different, built-in pnpm command.)

The Worker has no public web address: it only runs on its schedule.

## 3. Check that it runs

- In the Cloudflare dashboard, open **Workers & Pages → read-later-cron**. The settings show the cron trigger `*/5 * * * *`, and **Logs** shows each run, with a line like `jobs/run: {"ok":true,"claimed":0,...}`.
- `claimed: 0` is normal: it means after() had already finished everything.
- A `401` in the logs means the secret doesn't match the one on Vercel. Run `wrangler secret put JOBS_SECRET` again.

You can also call the endpoint yourself to test it:

```sh
curl -X POST https://read.example.com/api/jobs/run -H "Authorization: Bearer YOUR_JOBS_SECRET"
```

## Later

When you [move to one server](../move-to-server.md), the server's worker process does this job, and you can remove the Worker with `pnpm exec wrangler delete`.
