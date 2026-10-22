import { sql } from "drizzle-orm";
import type { Db } from "@/db";

// Full-text search uses the language-neutral 'simple' configuration, because
// saved articles come in many languages. Title ranks above the summary and
// its translations, which rank above the article text. Text is capped to stay well under
// Postgres's 1 MB tsvector limit.
const MAX_INDEXED_CHARS = 200_000;

export async function refreshSearchVector(db: Db, articleId: string): Promise<void> {
  await db.execute(sql`
    UPDATE articles AS a
    SET search_vector =
      setweight(to_tsvector('simple', coalesce(a.title, '') || ' ' || coalesce(a.site_name, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce((
        SELECT s.tldr || ' ' || coalesce(s.key_points::text, '')
        FROM summaries AS s
        WHERE s.article_id = a.id AND s.status = 'ready'
        ORDER BY (s.model = a.summary_model) DESC, s.completed_at DESC
        LIMIT 1
      ), '') || ' ' || coalesce((
        SELECT string_agg(t.tldr || ' ' || coalesce(t.key_points::text, ''), ' ')
        FROM summary_translations AS t
        WHERE t.article_id = a.id AND t.status = 'ready'
      ), '')), 'B') ||
      setweight(to_tsvector('simple', left(coalesce(a.text_content, ''), ${MAX_INDEXED_CHARS})), 'C')
    WHERE a.id = ${articleId}
  `);
}
