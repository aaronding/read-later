-- Articles saved before article_urls existed: each one's own key first, then
-- the link as it was saved, without its fragment, the nearest SQL gets to
-- normalizeUrl(). As when saving, the oldest article keeps an address two of
-- them share, and an address too long for the index (rememberUrls' limit)
-- is left out.
INSERT INTO "article_urls" ("user_id", "normalized_url", "article_id", "created_at")
SELECT "user_id", "normalized_url", "id", "created_at" FROM "articles"
WHERE octet_length("normalized_url") <= 2000
ORDER BY "created_at"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "article_urls" ("user_id", "normalized_url", "article_id", "created_at")
SELECT "user_id", split_part("url", '#', 1), "id", "created_at" FROM "articles"
WHERE split_part("url", '#', 1) <> "normalized_url" AND octet_length(split_part("url", '#', 1)) <= 2000
ORDER BY "created_at"
ON CONFLICT DO NOTHING;
