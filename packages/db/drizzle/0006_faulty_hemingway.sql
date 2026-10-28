DELETE FROM "rate_limit" a USING "rate_limit" b WHERE a."key" = b."key" AND a."id" > b."id";--> statement-breakpoint
DROP INDEX "rate_limit_key_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limit_key_idx" ON "rate_limit" USING btree ("key");
