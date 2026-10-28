CREATE INDEX "chats_user_id_updated_at_idx" ON "chats" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "runs_chat_id_queued_at_idx" ON "runs" USING btree ("chat_id","queued_at");--> statement-breakpoint
CREATE INDEX "uploads_chat_id_created_at_filename_idx" ON "uploads" USING btree ("chat_id","created_at","filename");