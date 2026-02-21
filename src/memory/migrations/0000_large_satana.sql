CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" varchar(100) NOT NULL,
	"resource" varchar(100),
	"details" jsonb DEFAULT '{}'::jsonb,
	"ip" varchar(50),
	"platform" varchar(20),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" varchar(20) NOT NULL,
	"title" varchar(200),
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cron_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"expression" text NOT NULL,
	"action" text NOT NULL,
	"action_data" text DEFAULT '{}',
	"platform" text DEFAULT 'telegram',
	"enabled" boolean DEFAULT true,
	"last_run" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"text" text NOT NULL,
	"source" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"embedding" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exchange_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exchange" varchar(50) NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"encrypted_api_secret" text NOT NULL,
	"encrypted_passphrase" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"label" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experience_records" (
	"id" text PRIMARY KEY NOT NULL,
	"task_type" varchar(100) NOT NULL,
	"input" text NOT NULL,
	"output" text NOT NULL,
	"success" boolean DEFAULT false NOT NULL,
	"agent_used" varchar(50) NOT NULL,
	"tools_used" jsonb DEFAULT '[]'::jsonb,
	"duration" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "failure_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"error_type" varchar(200) NOT NULL,
	"context" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"resolution" text,
	"resolved" boolean DEFAULT false NOT NULL,
	"last_seen" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key" varchar(200) NOT NULL,
	"value" text NOT NULL,
	"category" varchar(50) DEFAULT 'general',
	"confidence" integer DEFAULT 80,
	"source" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"layer" varchar(30) NOT NULL,
	"key" varchar(500) NOT NULL,
	"value" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"impact" double precision DEFAULT 0.5,
	"access_count" integer DEFAULT 0,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_accessed" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"agent_id" varchar(50),
	"intent" varchar(50),
	"tokens_used" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exchange" varchar(50) NOT NULL,
	"asset" varchar(20) NOT NULL,
	"amount" double precision DEFAULT 0 NOT NULL,
	"avg_entry_price" double precision,
	"current_price" double precision,
	"unrealized_pnl" double precision,
	"is_paper" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"host" varchar(200) NOT NULL,
	"port" integer DEFAULT 22 NOT NULL,
	"username" varchar(100) NOT NULL,
	"auth_method" varchar(20) DEFAULT 'key' NOT NULL,
	"encrypted_credential" text,
	"status" varchar(20) DEFAULT 'unknown',
	"last_checked" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"priority" varchar(5) DEFAULT 'p2' NOT NULL,
	"due_date" timestamp,
	"completed_at" timestamp,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exchange" varchar(50) NOT NULL,
	"symbol" varchar(30) NOT NULL,
	"side" varchar(10) NOT NULL,
	"type" varchar(20) DEFAULT 'market',
	"price" double precision NOT NULL,
	"amount" double precision NOT NULL,
	"cost" double precision NOT NULL,
	"fee" double precision DEFAULT 0,
	"stop_loss" double precision,
	"take_profit" double precision,
	"pnl" double precision,
	"pnl_percent" double precision,
	"strategy" varchar(50),
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"is_paper" boolean DEFAULT true NOT NULL,
	"closed_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trading_risk_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"paper_mode" boolean DEFAULT true NOT NULL,
	"max_position_percent" double precision DEFAULT 5,
	"max_open_positions" integer DEFAULT 3,
	"max_daily_loss_percent" double precision DEFAULT 3,
	"max_daily_loss_usd" double precision DEFAULT 100,
	"default_sl_percent" double precision DEFAULT 2,
	"default_tp_percent" double precision DEFAULT 4,
	"cooldown_minutes" integer DEFAULT 5,
	"max_leverage" double precision DEFAULT 2,
	"allowed_pairs" jsonb DEFAULT '[]'::jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trading_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"symbol" varchar(30) NOT NULL,
	"timeframe" varchar(10) NOT NULL,
	"direction" varchar(10) NOT NULL,
	"confidence" double precision NOT NULL,
	"strategy" varchar(50) NOT NULL,
	"entry_price" double precision,
	"stop_loss" double precision,
	"take_profit" double precision,
	"indicators" jsonb DEFAULT '{}'::jsonb,
	"outcome" varchar(20),
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0,
	"output_tokens" integer DEFAULT 0,
	"cost" real DEFAULT 0,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_id" varchar(100) NOT NULL,
	"platform" varchar(20) NOT NULL,
	"name" varchar(200),
	"role" varchar(20) DEFAULT 'user' NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_configs" ADD CONSTRAINT "exchange_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge" ADD CONSTRAINT "knowledge_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_risk_config" ADD CONSTRAINT "trading_risk_config_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_signals" ADD CONSTRAINT "trading_signals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_user" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_action" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_conversations_user" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_exchange_configs_user" ON "exchange_configs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_experience_task_type" ON "experience_records" USING btree ("task_type");--> statement-breakpoint
CREATE INDEX "idx_experience_success" ON "experience_records" USING btree ("success");--> statement-breakpoint
CREATE INDEX "idx_failure_error_type" ON "failure_patterns" USING btree ("error_type");--> statement-breakpoint
CREATE INDEX "idx_failure_resolved" ON "failure_patterns" USING btree ("resolved");--> statement-breakpoint
CREATE INDEX "idx_knowledge_user" ON "knowledge" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_memory_layer" ON "memory_entries" USING btree ("layer");--> statement-breakpoint
CREATE INDEX "idx_memory_impact" ON "memory_entries" USING btree ("impact");--> statement-breakpoint
CREATE INDEX "idx_messages_conversation" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_messages_user" ON "messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_portfolios_user" ON "portfolios" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_servers_user" ON "servers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_user" ON "tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_status" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_trades_user" ON "trades" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_trades_symbol" ON "trades" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "idx_trades_status" ON "trades" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_risk_config_user" ON "trading_risk_config" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_signals_symbol" ON "trading_signals" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "idx_signals_active" ON "trading_signals" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_users_platform" ON "users" USING btree ("platform","platform_id");