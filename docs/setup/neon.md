# Neon (the database)

Neon hosts the Postgres database on its free plan. Creating the account is free and needs no card.

## 1. Create the project

1. Sign up at <https://neon.com> (signing in with GitHub or Google is fine).
2. Create a project:
   - **Name:** `read-later`
   - **Postgres version:** **17**. New projects default to 18, so expand **Postgres database** in the create dialog and pick 17. The one-server setup and the backups use 17 too, so moving later is a plain dump and restore.
   - **Region:** where your Vercel functions run, so every page view isn't a trip across the country. This app's project is in **AWS US East 2 (Ohio)**, and `apps/web/vercel.json` runs the functions next to it, in Cleveland (`cle1`). If you pick another region, change `regions` in that file to match (see [the Vercel guide](vercel.md)).

## 2. Link the repository and get the connection strings

The Neon CLI links the repository to the project and writes the connection strings into `.env`. Copy `.env.example` to `.env` first: without a `.env`, the CLI writes `.env.local` instead, which the app reads ahead of `.env`. Then, in the repository folder:

```sh
npm i -g neon
neon login
neon init -y --org-id <org id> --project-id <project id> --branch production --services postgres
neon deploy
```

`neon login` opens the browser to sign in. `neon init` writes `.neon` (the project and branch it is linked to; git ignores it), keeps the repository's `neon.ts` and installs the Neon plugin for Claude Code. `neon deploy` applies `neon.ts` to the branch and writes three variables into `.env`:

- `DATABASE_URL`: the **pooled** string (the host contains `-pooler`). The app uses it, locally and on Vercel. Serverless functions open many short connections, and the pooler handles that.
- `DATABASE_URL_UNPOOLED`: the **direct** string. The migrations use it, and so do the backups, because tools like `pg_dump` need a direct connection.
- `NEON_BRANCH`: the branch's name, for reference.

Both strings carry `sslmode=require` and `channel_binding=require`; keep them. The app checks the server's certificate in full and uses channel binding.

Without the CLI, open the project dashboard and click **Connect** instead. Choose the branch, the `neondb` database and its owner role, and copy the string with **Connection pooling** on as `DATABASE_URL` and with it off as `DATABASE_URL_UNPOOLED`.

## 3. Create the tables

From your PC, in the repository folder:

```sh
pnpm db:migrate
```

It connects with `DATABASE_URL_UNPOOLED`, or with `DATABASE_URL` when that isn't set. "Migrations applied." means the database is ready. Run this again whenever a new version of the app adds a migration (it's safe to run when there's nothing new).

## 4. A branch for development

Neon branches are instant copies of the database. Make one for working on your PC, so experiments never touch your real library:

1. In the project, open **Branches** and click **New branch**.
2. Name it `dev`, with the main branch as its parent and **Current data**.
3. **Uncheck "Automatically delete branch after"**, which the Console turns on with a 1-day limit by default, or your dev branch disappears tomorrow.
4. Click **Create**, then run `neon checkout dev`. It points `.neon` at the branch and writes its connection strings into `.env`. `neon checkout production` switches back.

From then on, `.env` holds the dev branch's strings. Where a guide needs the production ones (Vercel, the backups), it gets them with `neon connection-string production`, never from `.env`.

`neon checkout <name> --create` makes a branch from the terminal instead, but `neon.ts` gives every branch made that way a 7-day lifetime, which suits a short experiment. You can reset a branch to the current state of the main branch at any time.

## Good to know

- **The free plan's database sleeps after 5 minutes without queries** and wakes on the next request. The first page after a quiet spell can take a moment longer.
- **Limits on the free plan** (October 2026): 1 GB of storage per project, 100 compute-hours a month, and a 6-hour window for restoring to an earlier point in time. Saved articles are mostly text, so 1 GB lasts a long while. When it gets tight, that's the time to [move to one server](../move-to-server.md).
- The connection strings contain the password. Keep them in `.env` and in Vercel's environment variables, never in the repository.
