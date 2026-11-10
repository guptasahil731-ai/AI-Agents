CREATE TABLE "digests" (
	"id" serial PRIMARY KEY,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"trigger" text NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"function_name" text NOT NULL,
	"owner" text NOT NULL,
	"status" text NOT NULL,
	"start_date" date NOT NULL,
	"due_date" date NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updates" jsonb DEFAULT '[]' NOT NULL
);
