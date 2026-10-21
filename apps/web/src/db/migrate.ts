// Applies the SQL migrations in ./drizzle to DATABASE_URL_UNPOOLED, or to
// DATABASE_URL when that isn't set.
// Run with `pnpm db:migrate` (locally, against Neon, or in Docker).
import path from "node:path";
import { fileURLToPath } from "node:url";
import "../config/load-env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { migrationDatabaseUrl, poolConfig } from "./connection";
import { migrationsFolder } from "./migrations-folder";

async function main() {
  const url = migrationDatabaseUrl();
  if (!url) throw new Error("Set DATABASE_URL before running migrations.");
  const pool = new Pool(poolConfig(url, 1));
  // DATABASE_URL_UNPOOLED wins over DATABASE_URL, so say which database this is.
  console.log(`Applying migrations to ${URL.canParse(url) ? new URL(url).host : "the configured database"}.`);
  try {
    await migrate(drizzle(pool), { migrationsFolder });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
