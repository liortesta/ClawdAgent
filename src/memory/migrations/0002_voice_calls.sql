CREATE TABLE "voice_calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"call_sid" text NOT NULL,
	"from_number" text NOT NULL,
	"to_number" text NOT NULL,
	"direction" text DEFAULT 'inbound' NOT NULL,
	"status" text DEFAULT 'initiated' NOT NULL,
	"duration" integer DEFAULT 0 NOT NULL,
	"recording_url" text,
	"transcript" text,
	"ai_summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "voice_calls_call_sid_unique" UNIQUE("call_sid")
);
--> statement-breakpoint
CREATE INDEX "idx_voice_calls_sid" ON "voice_calls" USING btree ("call_sid");--> statement-breakpoint
CREATE INDEX "idx_voice_calls_status" ON "voice_calls" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_voice_calls_created" ON "voice_calls" USING btree ("created_at");
