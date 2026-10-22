import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { articleTags, articles, tags } from "@/db/schema";

export function cleanTagName(name: string): string {
  return name.replace(/^#/, "").replace(/\s+/g, " ").trim().slice(0, 60);
}

export async function tagsForArticle(db: Db, userId: string, articleId: string) {
  return db
    .select({ id: tags.id, name: tags.name })
    .from(articleTags)
    .innerJoin(tags, eq(tags.id, articleTags.tagId))
    .where(and(eq(articleTags.articleId, articleId), eq(articleTags.userId, userId)))
    .orderBy(asc(tags.name));
}

export async function allTags(db: Db, userId: string) {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      count: sql<number>`(SELECT count(*)::int FROM article_tags t WHERE t.tag_id = "tags"."id")`,
    })
    .from(tags)
    .where(eq(tags.userId, userId))
    .orderBy(asc(tags.name));
}

/** Adds a tag to an article, reusing an existing tag whatever its case. */
export async function addTag(db: Db, userId: string, articleId: string, rawName: string): Promise<void> {
  const name = cleanTagName(rawName);
  if (!name) return;
  const [article] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.userId, userId)))
    .limit(1);
  if (!article) return;
  await db.insert(tags).values({ userId, name }).onConflictDoNothing();
  const [tag] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, userId), sql`lower(${tags.name}) = lower(${name})`))
    .limit(1);
  if (!tag) return;
  await db.insert(articleTags).values({ userId, articleId, tagId: tag.id }).onConflictDoNothing();
}

export async function removeTag(db: Db, userId: string, articleId: string, tagId: string): Promise<void> {
  await db
    .delete(articleTags)
    .where(and(eq(articleTags.userId, userId), eq(articleTags.articleId, articleId), eq(articleTags.tagId, tagId)));
  // Drop the tag itself once nothing uses it, so it stops steering suggestions.
  await db.execute(sql`
    DELETE FROM tags WHERE id = ${tagId} AND user_id = ${userId}
    AND NOT EXISTS (SELECT 1 FROM article_tags WHERE tag_id = ${tagId})`);
}
