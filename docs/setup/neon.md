# Neon (the database)

Neon hosts the Postgres database on its free plan. Creating the account is free and needs no card.

## 1. Create the project

1. Sign up at <https://neon.com> (signing in with GitHub or Google is fine).
2. Create a project:
   - **Name:** `read-later`
   - **Postgres version:** **17**. New projects default to 18, so expand **Postgres database** in the create dialog and pick 17. The one-server setup and the backups use 17 too, so moving later is a plain dump and restore.
   - **Region:** the same region as your Vercel functions, so every page view isn't a trip across the country. Vercel's default is Washington, D.C. (`iad1`), which matches Neon's **AWS US East (N. Virginia)**. If you pick another region, set Vercel's function region to match (see [the Vercel guide](vercel.md)).

## 2. Copy the connection strings

Open the project dashboard and click **Connect**. Choose the `production` (or `main`) branch, the `neondb` database and its owner role. You need two versions of the string:

- **Pooled** (the "Connection pooling" switch on; the host contains `-pooler`). Use this as `DATABASE_URL` on Vercel. Serverless functions open many short connections, and the pooler handles that.
- **Direct** (the switch off). Use it for migrations from your PC and for the backups, because tools like `pg_dump` need a direct connection.

Both end with `?sslmode=require`; keep that.

## 3. Create the tables

From your PC, in the repository folder, run the migrations with the **direct** string:

```powershell
# Windows PowerShell
$env:DATABASE_URL="postgresql://…direct string…"; pnpm db:migrate
```

```sh
# macOS or Linux
DATABASE_URL="postgresql://…direct string…" pnpm db:migrate
```

"Migrations applied." means the database is ready. Run this again whenever a new version of the app adds a migration (it's safe to run when there's nothing new).

## 4. A branch for development

Neon branches are instant copies of the database. Make one for working on your PC, so experiments never touch your real library:

1. In the project, open **Branches** and click **New branch**.
2. Name it `dev`, with the main branch as its parent and **Current data**.
3. **Uncheck "Automatically delete branch after"**, which the Console turns on with a 1-day limit by default, or your dev branch disappears tomorrow.
4. Click **Create**, then copy the branch's connection string (direct is fine on a PC) into your local `.env` as `DATABASE_URL`, and run `pnpm db:migrate`.

You can reset the branch to the current state of the main branch at any time.

## Good to know

- **The free plan's database sleeps after 5 minutes without queries** and wakes on the next request. The first page after a quiet spell can take a moment longer.
- **Limits on the free plan** (October 2026): 1 GB of storage per project, 100 compute-hours a month, and a 6-hour window for restoring to an earlier point in time. Saved articles are mostly text, so 1 GB lasts a long while. When it gets tight, that's the time to [move to one server](../move-to-server.md).
- The connection strings contain the password. Keep them in `.env` and in Vercel's environment variables, never in the repository.
