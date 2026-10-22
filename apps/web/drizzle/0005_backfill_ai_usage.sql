-- Summaries and translations written before ai_usage existed: each one's
-- latest usable answer, the only one whose usage was kept. A row's stop
-- reason belongs to that answer only while the row is still ready; a later
-- failure writes its own.
INSERT INTO "ai_usage" ("user_id", "article_id", "summary_id", "kind", "model", "served_model", "effort", "input_tokens", "output_tokens", "cost_usd", "duration_ms", "stop_reason", "created_at")
SELECT "user_id", "article_id", "id", 'summary', "model", "served_model", "effort", "input_tokens", "output_tokens", "cost_usd", COALESCE("duration_ms", 0), CASE WHEN "status" = 'ready' THEN "stop_reason" END, COALESCE("completed_at", "updated_at")
FROM "summaries"
WHERE "input_tokens" IS NOT NULL AND "output_tokens" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "ai_usage" ("user_id", "article_id", "summary_id", "kind", "language", "model", "served_model", "effort", "input_tokens", "output_tokens", "cost_usd", "duration_ms", "stop_reason", "created_at")
SELECT "user_id", "article_id", "summary_id", 'translation', "language", "model", "served_model", "effort", "input_tokens", "output_tokens", "cost_usd", COALESCE("duration_ms", 0), CASE WHEN "status" = 'ready' THEN "stop_reason" END, COALESCE("completed_at", "updated_at")
FROM "summary_translations"
WHERE "input_tokens" IS NOT NULL AND "output_tokens" IS NOT NULL;
