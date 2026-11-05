import test from 'node:test';
import assert from 'node:assert/strict';
import { requestPGPlan, renderPGResult, pgPlanMarkdown } from '../src/pg.js';

test('an in-progress plan polls with GET and never retries a paid POST', async () => {
  const requests = [];
  const replies = [{ status: 'in_progress', cache_key: 'same-inputs' }, { status: 'cached', plan: null }];
  const result = await requestPGPlan('https://plans.example.com', { account_domain: 'example.com', seller: 'Seller' }, { fetcher: async (url, options) => { requests.push({ url, method: options.method }); return { ok: true, json: async () => replies.shift() }; }, sleep: async () => {}, pollIntervalMs: 0 });
  assert.equal(result.status, 'cached');
  assert.deepEqual(requests.map(request => request.method), ['POST', 'GET']);
  assert.equal(requests[1].url, 'https://plans.example.com/api/pg-plan/same-inputs');
});

test('research failure is shown without a fabricated plan or automatic retry', async () => {
  let calls = 0;
  const result = await requestPGPlan('https://plans.example.com', { account_domain: 'example.com', seller: 'Seller' }, { fetcher: async () => { calls++; return { ok: true, json: async () => ({ status: 'research_unavailable', plan: null }) }; } });
  assert.equal(calls, 1);
  assert.match(renderPGResult(result), /cannot be produced without current web evidence/);
  assert.equal(pgPlanMarkdown(result), 'No accepted PG plan is available.');
});

function examplePlan() {
  return { schema_version: '1.0', status: 'research_incomplete', seller: { name: 'Seller', domain: 'seller.example', positioning_note: 'Public positioning only', source_ids: ['S1'] }, account: { name: 'Example', domain: 'example.com' }, research_date: '2026-11-05', sources: [{ id: 'S1', title: 'Official source', publisher: 'Example', url: 'https://example.com/source', retrieved_at: '2026-11-05T00:00:00Z' }], pains: Array.from({ length: 3 }, (_, index) => ({ title: `Pain slot ${index + 1}`, statement: 'Pressure is not established', evidence_status: 'insufficient_evidence', evidence: [{ claim: 'An official documented capability', source_ids: ['S1'] }], cost_of_inaction: { statement: 'Unknown consequence', basis: 'unknown', source_ids: [] }, why_seller: { statement: 'Potential relevance only', source_ids: ['S1'] }, confidence: null, missing_evidence: 'No current unmet requirement established' })), personas: Array.from({ length: 3 }, () => ({ name: 'Unverified Person', title: 'Target title', role_in_problem: 'Potential owner', messaging_angle: 'Internal planning angle', verification: { status: 'name_unknown', source_ids: [], checked_at: null, evidence_date: null } })), tools: { status: 'none_found', items: [], search_note: 'Insufficient public evidence, not proof of no tools' }, initial_value_hypothesis: { statement: 'A cautious hypothesis', initiative_or_situation: 'Documented situation', source_ids: ['S1'], basis: 'hypothesis' }, key_goal_for_week: '', limitations: ['Current buying intent is unknown'] };
}

test('PG rendering preserves evidence citations, unknown names, gaps, and a blank weekly goal', () => {
  const result = { status: 'cached', plan: examplePlan(), research: { checked_at: '2026-11-05T00:00:00Z', coverage_gaps: ['Current need unknown'] }, usage: { actual_cost_microusd: 1000, fallback_events: 0 } };
  const html = renderPGResult(result);
  assert.equal((html.match(/class="pg-pain"/g) || []).length, 3);
  assert.equal((html.match(/class="pg-persona"/g) || []).length, 3);
  assert.ok(html.includes('https://example.com/source'));
  assert.ok(html.includes('An official documented capability'));
  assert.ok(html.includes('No current unmet requirement established'));
  assert.ok(!html.includes('Unverified Person'));
  assert.match(html, /SAVED RESULT \/ CACHE HIT/);
  assert.match(html, /intentionally blank">&nbsp;<\/div>/);
  const markdown = pgPlanMarkdown(result);
  assert.ok(markdown.includes('An official documented capability [S1]'));
  assert.ok(markdown.includes('Current buying intent is unknown'));
  assert.match(markdown, /### Key Goal for the Week\n\n&nbsp;\n/);
  assert.ok(!markdown.includes('Unverified Person'));
});
