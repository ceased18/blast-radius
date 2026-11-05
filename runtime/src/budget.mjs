// Lifetime demo budget. Integer micro-USD; no clock/reset or in-memory authority.
export const CAP_MICROUSD = 250_000;
export const REQUEST_RESERVE_MICROUSD = 170_000;
export const ACTIVE_STATUSES = ['reserved', 'researching', 'planning', 'unknown'];
// Eight research attempts (two domain calls x two passes x two models),
// four conservatively reserved Exa searches across fallbacks, then at
// most two planning attempts. No repair call.
// Research models MUST have <=40960 context; planning request UTF-8 bytes MUST
// be <=24000, plus a conservative 4096-token wire/schema overhead allowance.
export const BUDGET_PROOF = Object.freeze({
  research: { passes:8,input_tokens:40960,output_tokens:1500,prompt_per_million:0.25,completion_per_million:0.5,searches:4,search_cost_usd:0.007 },
  planning: { passes:2,input_tokens:28100,output_tokens:3500,prompt_per_million:0.5,completion_per_million:3 },
  bound_microusd:165020,reserve_microusd:REQUEST_RESERVE_MICROUSD,
});
const COMMITTED = `CASE WHEN status IN ('complete','failed') AND cost_known = 1 THEN actual_cost_microusd ELSE MAX(reserved_microusd,actual_cost_microusd) END`;

export function primarySession(db) {
  return typeof db.withSession === 'function' ? db.withSession('first-primary') : db;
}

export async function budgetStatus(db) {
  const result = await db.prepare(`SELECT COALESCE(SUM(${COMMITTED}),0) AS committed,
    COALESCE(SUM(CASE WHEN status IN ('reserved','researching','planning','unknown') THEN 1 ELSE 0 END),0) AS unresolved,
    COALESCE(SUM(CASE WHEN status='complete' THEN 1 ELSE 0 END),0) AS cached FROM pg_jobs`).first();
  const committed = Number(result?.committed || 0);
  return { cap_microusd: CAP_MICROUSD, committed_microusd: committed,
    remaining_microusd: Math.max(0, CAP_MICROUSD - committed),
    blocked_by_unresolved: Number(result?.unresolved || 0) > 0,
    cached_entries: Number(result?.cached || 0), request_reserve_microusd: REQUEST_RESERVE_MICROUSD };
}

export async function findJob(db, key) {
  return db.prepare('SELECT * FROM pg_jobs WHERE cache_key=?').bind(key).first();
}

export async function reserveJob(db, { cacheKey, requestId, input, now }) {
  // The balance predicate and write are ONE SQL statement at D1's primary.
  // Concurrent callers cannot both observe and spend the same remaining budget.
  const result = await db.prepare(`INSERT INTO pg_jobs
    (cache_key,request_id,account_domain,seller_domain,seller_name,created_at,updated_at,status,reserved_microusd,actual_cost_microusd,cost_known)
    SELECT ?,?,?,?,?,?,?,'reserved',?,0,0
    WHERE COALESCE((SELECT SUM(${COMMITTED}) FROM pg_jobs),0) + ? <= ?
      AND NOT EXISTS(SELECT 1 FROM pg_jobs WHERE status IN ('reserved','researching','planning','unknown'))
    ON CONFLICT(cache_key) DO NOTHING`).bind(cacheKey,requestId,input.account_domain,input.seller_domain,input.seller,now,now,
      REQUEST_RESERVE_MICROUSD,REQUEST_RESERVE_MICROUSD,CAP_MICROUSD).run();
  return Number(result.meta?.changes || 0) === 1;
}

export async function setJobStage(db, cacheKey, stage) {
  await db.prepare('UPDATE pg_jobs SET status=?,updated_at=? WHERE cache_key=? AND status NOT IN (\'complete\',\'failed\',\'unknown\')')
    .bind(stage,new Date().toISOString(),cacheKey).run();
}

export async function beginCall(db, { id, key, stage, models }) {
  await db.prepare(`INSERT INTO pg_calls(id,cache_key,stage,status,requested_models,created_at)
    VALUES(?,?,?,'pending',?,?)`).bind(id,key,stage,JSON.stringify(models),new Date().toISOString()).run();
}

export async function finishCall(db, id, outcome) {
  await db.prepare(`UPDATE pg_calls SET status='complete',actual_cost_microusd=?,actual_cost_usd=?,served_model=?,generation_id=?,web_search_requests=?,fallback_observed=?,metadata_json=?,completed_at=? WHERE id=? AND status='pending'`)
    .bind(outcome.cost_microusd,outcome.cost_usd,outcome.model,outcome.generation_id,outcome.web_search_requests,
      outcome.fallback_observed ? 1 : 0,JSON.stringify(outcome.metadata || {}),new Date().toISOString(),id).run();
}

export async function markCallUnknown(db, id, code) {
  await db.prepare(`UPDATE pg_calls SET status='unknown',metadata_json=json_set(COALESCE(metadata_json,'{}'),'$.outcome_error',?),completed_at=? WHERE id=? AND status='pending'`)
    .bind(code,new Date().toISOString(),id).run();
}

export async function jobUsage(db, key) {
  const { results = [] } = await db.prepare("SELECT * FROM pg_calls WHERE cache_key=? ORDER BY created_at,CASE stage WHEN 'research_account' THEN 1 WHEN 'research_seller' THEN 2 WHEN 'planning' THEN 3 ELSE 4 END,id").bind(key).all();
  const known = results.every(r => r.status === 'complete' && r.actual_cost_microusd !== null);
  return { cost_known: known, actual_cost_microusd: results.reduce((sum,r) => sum + Number(r.actual_cost_microusd || 0),0),
    actual_cost_usd: results.reduce((sum,r) => sum + Number(r.actual_cost_usd || 0),0),
    runs: results.map(r => ({ stage:r.stage, model:r.served_model || null, requested_models:JSON.parse(r.requested_models),
      cost_microusd:r.actual_cost_microusd === null ? null : Number(r.actual_cost_microusd), cost_usd:r.actual_cost_usd === null ? null : Number(r.actual_cost_usd),
      generation_id:r.generation_id || null,web_search_requests:Number(r.web_search_requests || 0),fallback_observed:Boolean(r.fallback_observed),status:r.status })) };
}

export async function finishJob(db, key, envelope, { unknown = false } = {}) {
  const usage = await jobUsage(db,key);
  const unresolved = unknown || !usage.cost_known || usage.actual_cost_microusd > REQUEST_RESERVE_MICROUSD;
  const status = unresolved ? 'unknown' : envelope.plan ? 'complete' : 'failed';
  await db.prepare('UPDATE pg_jobs SET status=?,actual_cost_microusd=?,cost_known=?,response_json=?,updated_at=? WHERE cache_key=?')
    .bind(status,usage.actual_cost_microusd,unresolved ? 0 : 1,JSON.stringify({ ...envelope,usage }),new Date().toISOString(),key).run();
  return usage;
}
