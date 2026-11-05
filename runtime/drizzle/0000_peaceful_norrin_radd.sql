CREATE TABLE `pg_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`cache_key` text NOT NULL,
	`stage` text NOT NULL,
	`status` text NOT NULL,
	`requested_models` text NOT NULL,
	`served_model` text,
	`generation_id` text,
	`actual_cost_microusd` integer,
	`actual_cost_usd` real,
	`web_search_requests` integer DEFAULT 0 NOT NULL,
	`fallback_observed` integer DEFAULT 0 NOT NULL,
	`metadata_json` text,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`cache_key`) REFERENCES `pg_jobs`(`cache_key`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "pg_calls_valid_status" CHECK("pg_calls"."status" IN ('pending','complete','unknown'))
);
--> statement-breakpoint
CREATE INDEX `pg_calls_job_idx` ON `pg_calls` (`cache_key`);--> statement-breakpoint
CREATE TABLE `pg_jobs` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`account_domain` text NOT NULL,
	`seller_domain` text NOT NULL,
	`seller_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`status` text NOT NULL,
	`reserved_microusd` integer NOT NULL,
	`actual_cost_microusd` integer DEFAULT 0 NOT NULL,
	`cost_known` integer DEFAULT 0 NOT NULL,
	`response_json` text,
	CONSTRAINT "pg_jobs_reserved_nonnegative" CHECK("pg_jobs"."reserved_microusd" >= 0 AND "pg_jobs"."reserved_microusd" <= 250000),
	CONSTRAINT "pg_jobs_actual_nonnegative" CHECK("pg_jobs"."actual_cost_microusd" >= 0),
	CONSTRAINT "pg_jobs_known_boolean" CHECK("pg_jobs"."cost_known" IN (0,1)),
	CONSTRAINT "pg_jobs_valid_status" CHECK("pg_jobs"."status" IN ('reserved','researching','planning','complete','failed','unknown'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pg_jobs_request_id_unique` ON `pg_jobs` (`request_id`);--> statement-breakpoint
CREATE INDEX `pg_jobs_status_idx` ON `pg_jobs` (`status`);