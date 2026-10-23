CREATE TABLE "article_urls" (
	"user_id" text NOT NULL,
	"normalized_url" text NOT NULL,
	"article_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_urls_user_id_normalized_url_pk" PRIMARY KEY("user_id","normalized_url")
);
--> statement-breakpoint
ALTER TABLE "article_urls" ADD CONSTRAINT "article_urls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_urls" ADD CONSTRAINT "article_urls_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "article_urls_article_id_idx" ON "article_urls" USING btree ("article_id");