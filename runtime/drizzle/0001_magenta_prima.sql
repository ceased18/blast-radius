CREATE TABLE `pg_budget_audits` (
	`id` text PRIMARY KEY NOT NULL,
	`cache_key` text NOT NULL,
	`event` text NOT NULL,
	`details_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `pg_jobs` ADD `baseline_usage_nanousd` integer;