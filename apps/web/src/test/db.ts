import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { setDb, type Db } from "@/db";
import { migrationsFolder } from "@/db/migrations-folder";
import * as schema from "@/db/schema";

/** A fresh in-memory Postgres with all migrations applied. */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  const appDb = db as unknown as Db;
  setDb(appDb);
  return {
    db: appDb,
    close: async () => {
      setDb(undefined);
      await client.close();
    },
  };
}

export async function createTestUser(db: Db, email = "owner@example.com", id = "user-1") {
  const [user] = await db
    .insert(schema.users)
    .values({ id, email, name: "Owner", emailVerified: true })
    .returning();
  return user!;
}
