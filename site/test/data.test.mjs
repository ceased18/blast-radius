import test from 'node:test';
import assert from 'node:assert/strict';
import { date, ageDays, freshness, sourceURL, escapeHTML, minutes, reportingOffset, outreachProvenance, publicLookup, publicEvidenceBrief } from '../src/data.js';

test('missing incident timestamps remain unknown instead of becoming 1970 evidence', () => {
  for (const value of [null, undefined, '', 'invalid-date']) {
    assert.equal(date(value), 'Not recorded');
    assert.equal(ageDays(value, '2026-11-05T00:00:00Z'), null);
    assert.equal(freshness(value, '2026-11-05T00:00:00Z').label, 'Date unknown');
  }
});

test('status dates use UTC across the local calendar boundary', () => {
  assert.equal(date('2026-10-22T03:13:52Z'), 'Oct 22, 2026');
  assert.match(date('2026-10-22T03:13:52Z', true), /Oct 22, 2026.*03:13 AM UTC/);
});

test('unknown duration or lag is not rendered as a measured zero', () => {
  assert.equal(minutes(null), '—');
  assert.equal(minutes(undefined), '—');
  assert.equal(minutes(0), '0m');
  assert.equal(minutes(-15), '-15m');
});

test('untrusted status text and links cannot inject markup or script URLs', () => {
  assert.equal(sourceURL('javascript:alert(1)'), null);
  assert.equal(sourceURL('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(sourceURL('https://status.example.com/incidents/1'), 'https://status.example.com/incidents/1');
  assert.equal(escapeHTML('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});

test('replay uses reporting timestamps and never places an unknown event at zero', () => {
  const origin = '2026-10-22T02:18:32.195Z';
  assert.equal(reportingOffset({ started_at: null }, origin), null);
  assert.equal(reportingOffset({ reported_at: '2026-10-22T03:13:52Z' }, origin), 55.330083333333334);
  assert.equal(reportingOffset({ report_lag_minutes: 55.33 }, null), 55.33);
});

test('draft provenance distinguishes accepted OpenRouter-assisted source edits from templates', () => {
  const assisted = outreachProvenance({ mode: 'OpenRouter assisted; human review required', model: 'anthropic/claude-sonnet-5.5', source_edits: [{ field: 'emails[0].body' }] });
  assert.equal(assisted.label, 'OpenRouter-assisted drafts');
  assert.match(assisted.detail, /anthropic\/claude-sonnet-5\.5/);
  assert.match(assisted.detail, /1 source edit by an agent/);
  assert.match(assisted.detail, /Human review required/);
  const deterministic = outreachProvenance({ mode: 'deterministic draft; human review required' });
  assert.equal(deterministic.label, 'Deterministic drafts');
  assert.doesNotMatch(deterministic.detail, /Generated through OpenRouter/);
});

test('public lookup treats uncovered domains as unknown and accepts only bare domain syntax', () => {
  assert.equal(publicLookup(' www.Cartesia.ai. ', ['cartesia.ai']).status, 'in_snapshot');
  const absent = publicLookup('example.com', ['cartesia.ai']);
  assert.equal(absent.status, 'not_in_snapshot');
  assert.match(absent.message, /not a finding of no incidents/);
  for (const value of ['', 'https://cartesia.ai', 'cartesia.ai/path', 'a..com', 'user@cartesia.ai', 'cartesia.ai:443']) assert.equal(publicLookup(value, ['cartesia.ai']).status, 'invalid_domain');
});

test('copying a neutral evidence brief preserves conditional impact, time basis, and claim limits', () => {
  const brief = publicEvidenceBrief({ domain: 'example.com', name: 'Example', coverage: { source_checked_at: '2026-11-05T00:00:00Z' }, evidence: [{ title: 'May be degraded', quote: 'may see degraded performance', url: 'https://status.example.com/incidents/1', timestamps: { reported_at: '2026-10-22T03:13:52Z', timestamp_basis: 'source_created_at' }, impact: { conditional: true, limitations: ['Customer onset unknown'] }, what_it_does_not_prove: ['No proof of absent fallback'] }], qualification: { finding: 'Existing fallback documented', sources: [{ title: 'Models', url: 'https://docs.example.com/models' }], open_questions: ['Which setup?'] }, what_it_does_not_prove: ['No buying intent'], open_questions: [] });
  for (const retained of ['source_created_at', 'Conditional impact wording', 'Customer onset unknown', 'No proof of absent fallback', 'No buying intent', 'https://docs.example.com/models', '2026-11-05']) assert.ok(brief.includes(retained), retained);
});
