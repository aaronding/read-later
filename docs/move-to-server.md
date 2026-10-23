# Move to one server

When the free plans stop being enough (Neon's storage, Vercel's limits, or Vercel's non-commercial rule once the beta starts), the whole app moves to one small server with Docker Compose. It's the same code and the same `.env` variables, with one Postgres on the server instead of Neon.

**What runs:** Postgres 17, the web app, the background worker, and `cloudflared`, which connects the server to Cloudflare so HTTPS works with **no open ports**. Visitors reach the app through Cloudflare; nothing on the server listens on the internet.

**Cost:** a DigitalOcean Premium AMD droplet with 2 GB of memory is about $14 a month. That's a paid account, so it's your decision when to create it. The Claude API stays the only other cost.

## 1. Create the server

1. In DigitalOcean, create a droplet: **Ubuntu 24.04 LTS**, **Premium AMD, 2 GB**, in a region near you, with your SSH key.
2. SSH in and install Docker:

   ```sh
   curl -fsSL https://get.docker.com | sh
   ```

3. Allow only SSH through the firewall. The tunnel connects outward, so nothing else needs to be open:

   ```sh
   ufw allow OpenSSH && ufw enable
   ```

## 2. Get the code and the configuration

```sh
git clone https://github.com/<you>/read-later.git /opt/read-later
cd /opt/read-later
cp .env.example .env
```

The repository is private, so `git clone` asks you to sign in. Use a [fine-grained personal access token](https://github.com/settings/personal-access-tokens) with read-only access to this one repository as the password.

Edit `.env` (`nano .env`). Copy your current values from Vercel (Project Settings → Environment Variables), then:

- Delete the `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `NEON_BRANCH` lines. Compose sets the first two to the server's Postgres.
- Add `POSTGRES_PASSWORD=` with a long random value.
- Add `COMPOSE_PROFILES=tunnel` and `CLOUDFLARE_TUNNEL_TOKEN=` (step 3).
- Add the four `R2_…` values from [the R2 guide](setup/r2-backups.md) for the nightly backup (step 6).
- Keep `APP_URL`, `BETTER_AUTH_SECRET`, the Google values, `ALLOWED_EMAILS`, `BLOCKED_EMAILS`, `ADMIN_EMAILS`, `ANTHROPIC_API_KEY` and `JOBS_SECRET` exactly as they are, so sessions, tokens and Google sign-in keep working.

## 3. Create the Cloudflare Tunnel

1. In the Cloudflare dashboard, open **Networking → Tunnels** and choose **Create a tunnel**. Name it `read-later`.
2. When asked how to install the connector, pick **Docker** and copy the long token after `--token` in the command shown. Put it in `.env` as `CLOUDFLARE_TUNNEL_TOKEN`. You don't need to run the command; Compose runs `cloudflared` for you.
3. Open the tunnel's **Routes** tab, choose **Add route → Published application**, and enter:
   - **Subdomain**: `www` and **Domain**: `readsooner.com` (so the app's address stays the same as `APP_URL`)
   - **Service URL**: `http://web:3000`

   While `www` still has the Vercel CNAME record, Cloudflare asks you to replace it. Do that when you switch over (step 5).

## 4. Start everything and copy the data

```sh
docker compose up -d --build
docker compose ps
```

`migrate` runs once and exits; `postgres`, `web`, `worker` and `cloudflared` stay up. Then copy the data from Neon. Use Neon's **direct** connection string (without `-pooler`):

```sh
docker compose stop web worker
docker compose exec -T postgres pg_dump --version   # should be 17.x
docker run --rm postgres:17-alpine pg_dump --format=custom --no-owner --no-privileges \
  "postgresql://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require" > neon.dump
docker compose exec -T postgres pg_restore --clean --if-exists --no-owner --no-privileges \
  -U readlater -d readlater < neon.dump
docker compose start web worker
```

Check the app locally on the server, through an SSH tunnel from your PC: `ssh -L 3000:127.0.0.1:3000 root@<server>`, then open <http://localhost:3000>. (Google sign-in only works on the real address, but the page should load.)

## 5. Switch over

1. Save your last articles on Vercel, then copy the data once more (step 4) so nothing is lost.
2. Let the tunnel take over the address: approve the replacement of the old Vercel DNS record for `www`, or delete that CNAME in Cloudflare DNS and add the route again. Vercel also redirects `readsooner.com` to `www`, so hand that to Cloudflare: replace the bare domain's Vercel CNAME with a proxied (orange cloud) `A` record to `192.0.2.1`, an address reserved for examples that Cloudflare answers in front of, and add a redirect rule from the **Redirect from root to WWW** template in **Rules**.
3. Open your usual address, sign in, and save a page from the extension. Nothing changes on your devices: the extension and Shortcuts keep their server URL and tokens.
4. Clean up once everything works: remove the Vercel project, and delete the Cloudflare Worker cron with `pnpm exec wrangler delete` in `apps/cron-worker` (the worker container does its job now). Keep Neon for a few weeks as an extra backup, then delete it.

## 6. Backups, updates and logs

**Nightly backup to R2.** GitHub Actions can't reach a database with no open ports, so the server backs itself up. Add this line with `crontab -e`:

```
17 3 * * * /opt/read-later/scripts/server-backup.sh >> /opt/read-later/backups/backup.log 2>&1
```

It dumps the database, uploads it to the same R2 bucket as before (`daily/…`), and keeps a week of copies in `/opt/read-later/backups`. Afterwards, delete the `BACKUP_DATABASE_URL` secret in GitHub so the GitHub Action stops backing up the old database.

**Restore** a backup (from R2 or `backups/`):

```sh
docker compose exec -T postgres pg_restore --clean --if-exists --no-owner -U readlater -d readlater < backups/readlater-….dump
```

**Update** after pushing new code:

```sh
cd /opt/read-later && git pull && docker compose up -d --build
```

New database migrations run automatically (the `migrate` service runs before `web` and `worker` start).

**Logs:** `docker compose logs -f web worker`. **Restart:** `docker compose restart web worker`. After changing `.env`, run `docker compose up -d` instead: it recreates the containers with the new values, which `restart` doesn't.
