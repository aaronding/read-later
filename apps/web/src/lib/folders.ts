import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { articles, folders } from "@/db/schema";

// Flat folders: an article is in at most one folder.

export function cleanFolderName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, 80);
}

export async function listFolders(db: Db, userId: string) {
  return db
    .select({
      id: folders.id,
      name: folders.name,
      count: sql<number>`(SELECT count(*)::int FROM articles a WHERE a.folder_id = "folders"."id")`,
    })
    .from(folders)
    .where(eq(folders.userId, userId))
    .orderBy(asc(sql`lower(${folders.name})`));
}

/** Creates a folder, or returns the existing one with the same name (any case). */
export async function findOrCreateFolder(db: Db, userId: string, rawName: string): Promise<string | null> {
  const name = cleanFolderName(rawName);
  if (!name) return null;
  await db.insert(folders).values({ userId, name }).onConflictDoNothing();
  const [folder] = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.userId, userId), sql`lower(${folders.name}) = lower(${name})`))
    .limit(1);
  return folder?.id ?? null;
}

export async function setArticleFolder(db: Db, userId: string, articleId: string, folderId: string | null): Promise<void> {
  if (folderId) {
    const [owned] = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
      .limit(1);
    if (!owned) return;
  }
  await db
    .update(articles)
    .set({ folderId })
    .where(and(eq(articles.id, articleId), eq(articles.userId, userId)));
}

/** Deletes the folder; its articles stay, without a folder. */
export async function deleteFolder(db: Db, userId: string, folderId: string): Promise<void> {
  await db.delete(folders).where(and(eq(folders.id, folderId), eq(folders.userId, userId)));
}
