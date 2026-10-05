CREATE TYPE "public"."payment_outcome_status" AS ENUM('SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."webhook_event_status" AS ENUM('pending', 'processed', 'skipped');--> statement-breakpoint
CREATE TABLE "payment_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_intent_id" varchar(255) NOT NULL,
	"status" "payment_outcome_status" NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(10) NOT NULL,
	"failure_code" varchar(255),
	"failure_message" varchar(1024),
	"source_event_id" varchar(255) NOT NULL,
	"last_event_created_at" timestamp with time zone NOT NULL,
	"last_event_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_outcomes_payment_intent_id_unique" UNIQUE("payment_intent_id")
);
--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" varchar(255) NOT NULL,
	"event_type" varchar(255) NOT NULL,
	"payload" jsonb NOT NULL,
	"event_created_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"status" "webhook_event_status" DEFAULT 'pending' NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_webhook_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
CREATE INDEX "idx_payment_outcomes_payment_intent_id" ON "payment_outcomes" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "idx_payment_outcomes_status" ON "payment_outcomes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_stripe_webhook_events_stripe_event_id" ON "stripe_webhook_events" USING btree ("stripe_event_id");--> statement-breakpoint
CREATE INDEX "idx_stripe_webhook_events_event_type" ON "stripe_webhook_events" USING btree ("event_type");