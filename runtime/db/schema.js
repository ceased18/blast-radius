import { sqliteTable, text, integer, real, index, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const pgJobs = sqliteTable('pg_jobs', {
  cacheKey: text('cache_key').primaryKey(), requestId:text('request_id').notNull().unique(),
  accountDomain:text('account_domain').notNull(),sellerDomain:text('seller_domain').notNull(),sellerName:text('seller_name').notNull(),
  createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),status:text('status').notNull(),
  reservedMicrousd:integer('reserved_microusd').notNull(),actualCostMicrousd:integer('actual_cost_microusd').notNull().default(0),
  costKnown:integer('cost_known').notNull().default(0),responseJson:text('response_json'),baselineUsageNanousd:integer('baseline_usage_nanousd'),
}, table => [
  check('pg_jobs_reserved_nonnegative',sql`${table.reservedMicrousd} >= 0 AND ${table.reservedMicrousd} <= 250000`),
  check('pg_jobs_actual_nonnegative',sql`${table.actualCostMicrousd} >= 0`),
  check('pg_jobs_known_boolean',sql`${table.costKnown} IN (0,1)`),
  check('pg_jobs_valid_status',sql`${table.status} IN ('reserved','researching','planning','complete','failed','unknown')`),
  index('pg_jobs_status_idx').on(table.status),
]);
export const pgCalls = sqliteTable('pg_calls', {
  id:text('id').primaryKey(),cacheKey:text('cache_key').notNull().references(() => pgJobs.cacheKey),stage:text('stage').notNull(),
  status:text('status').notNull(),requestedModels:text('requested_models').notNull(),servedModel:text('served_model'),generationId:text('generation_id'),
  actualCostMicrousd:integer('actual_cost_microusd'),actualCostUsd:real('actual_cost_usd'),webSearchRequests:integer('web_search_requests').notNull().default(0),
  fallbackObserved:integer('fallback_observed').notNull().default(0),metadataJson:text('metadata_json'),createdAt:text('created_at').notNull(),completedAt:text('completed_at'),
}, table => [index('pg_calls_job_idx').on(table.cacheKey),check('pg_calls_valid_status',sql`${table.status} IN ('pending','complete','unknown')`)]);

export const pgBudgetAudits = sqliteTable('pg_budget_audits', {
  id:text('id').primaryKey(),cacheKey:text('cache_key').notNull(),event:text('event').notNull(),detailsJson:text('details_json').notNull(),createdAt:text('created_at').notNull(),
});
