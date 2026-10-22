CREATE TABLE "summary_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"article_id" uuid NOT NULL,
	"summary_id" uuid NOT NULL,
	"language" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"model" text NOT NULL,
	"served_model" text,
	"effort" text,
	"tldr" text,
	"key_points" jsonb,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" numeric(12, 6),
	"duration_ms" integer,
	"stop_reason" text,
	"error" text,
	"error_message" jsonb,
	"job_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "summary_translations" ADD CONSTRAINT "summary_translations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary_translations" ADD CONSTRAINT "summary_translations_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary_translations" ADD CONSTRAINT "summary_translations_summary_id_summaries_id_fk" FOREIGN KEY ("summary_id") REFERENCES "public"."summaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "summary_translations_summary_language_idx" ON "summary_translations" USING btree ("summary_id","language");--> statement-breakpoint
CREATE INDEX "summary_translations_article_id_idx" ON "summary_translations" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "summary_translations_user_id_idx" ON "summary_translations" USING btree ("user_id");