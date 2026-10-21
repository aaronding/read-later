import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { envInt, requireEnv } from "@/config/env";
import * as schema from "./schema";

// Shared by node-postgres (the app) and PGlite (tests).
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const globalForDb = globalThis as typeof globalThis & { __readLaterDb?: Db };

/** The app's database. Created on first use from DATABASE_URL. */
export function getDb(): Db {
  if (!globalForDb.__readLaterDb) {
    const pool = new Pool({
      connectionString: requireEnv("DATABASE_URL"),
      max: envInt("DATABASE_POOL_MAX", 5),
      idleTimeoutMillis: 30_000,
    });
    globalForDb.__readLaterDb = drizzle(pool, { schema }) as unknown as Db;
  }
  return globalForDb.__readLaterDb;
}

/** Tests swap in a PGlite database. */
export function setDb(db: Db | undefined): void {
  globalForDb.__readLaterDb = db;
}

export { schema };
