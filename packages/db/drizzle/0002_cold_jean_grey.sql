CREATE TABLE "interviews" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"run_id" text NOT NULL,
	"message_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"question" text NOT NULL,
	"answer" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interviews_chat_id_created_at_idx" ON "interviews" USING btree ("chat_id","created_at");