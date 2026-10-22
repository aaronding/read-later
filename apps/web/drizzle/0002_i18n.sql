ALTER TABLE "user_settings" ALTER COLUMN "default_model" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "error_message" jsonb;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "preview_reason_message" jsonb;--> statement-breakpoint
ALTER TABLE "summaries" ADD COLUMN "error_message" jsonb;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "locale" text;