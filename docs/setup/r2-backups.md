# Nightly backups to Cloudflare R2

A GitHub Action (`.github/workflows/backup.yml`) dumps the database every night at 03:17 UTC and stores the file in a Cloudflare R2 bucket. Until it's set up, the Action only prints a notice and does nothing.

## 1. Create the bucket

1. In the Cloudflare dashboard, open **R2 Object Storage**. The first time, Cloudflare asks you to subscribe to R2, and the checkout asks for a payment method (card or PayPal) even if you stay within the free allowance: 10 GB of storage a month, and far more operations than a nightly backup uses. That's your decision.
2. Click **Create bucket**, name it `read-later-backups`, and keep the default location.
3. **Delete old backups automatically:** open the bucket's **Settings → Object Lifecycle Rules → Add rule**, and add a rule for the prefix `daily/` that deletes objects 30 days after they're uploaded. Then **Save changes**. (The same from a terminal: `pnpm exec wrangler r2 bucket lifecycle add read-later-backups expire-daily daily/ --expire-days 30`, in `apps/cron-worker`.)

## 2. Create an API token for the bucket

1. On the R2 **Overview** page, under **Account Details**, find **API Tokens** and click **Manage**, then **Create Account API token**.
2. Name it `read-later-backups`, choose the **Object Read & Write** permission, and limit it to the `read-later-backups` bucket.
3. Create it and copy the **Access Key ID** and the **Secret Access Key** (shown once). Also note your **Account ID**, shown under Account Details on the same Overview page.

## 3. Add the secrets to GitHub

In the GitHub repository, open **Settings → Secrets and variables → Actions** and add these **repository secrets**:

| Secret | Value |
| --- | --- |
| `BACKUP_DATABASE_URL` | Neon's **direct** connection string (without `-pooler`) |
| `R2_ACCOUNT_ID` | your Cloudflare account ID |
| `R2_BUCKET` | `read-later-backups` |
| `R2_ACCESS_KEY_ID` | from step 2 |
| `R2_SECRET_ACCESS_KEY` | from step 2 |

If your Neon project uses a Postgres version other than 17, also add a repository **variable** `PG_DUMP_IMAGE` set to, for example, `postgres:18-alpine`. `pg_dump` must be at least as new as the server.

## 4. Test it

GitHub only runs scheduled workflows from the default branch, so this works once the code is merged into `main`. Then open the **Actions** tab, choose **Nightly database backup**, and click **Run workflow**. A green run ends with "Uploaded daily/readlater-….dump", and the file appears in the bucket.

## Restoring a backup

1. Download the file from the bucket in the Cloudflare dashboard.
2. Restore it into an **empty** database, for example a new Neon branch or project (never straight over a database you still need):

   ```sh
   docker run --rm -i postgres:17-alpine pg_restore --no-owner --no-privileges \
     -d "postgresql://…direct connection string…" < readlater-2026-10-21T0317Z.dump
   ```

   Without Docker, the same `pg_restore` command comes with the PostgreSQL 17 command-line tools (on Windows, from the PostgreSQL installer).
3. Point `DATABASE_URL` at the restored database.

Neon also keeps a short history of changes on its own (6 hours on the free plan), so for "I deleted something an hour ago" its restore feature is quicker.
