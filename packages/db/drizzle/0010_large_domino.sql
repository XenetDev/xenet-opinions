ALTER TABLE "runs" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_share_token_unique" UNIQUE("share_token");