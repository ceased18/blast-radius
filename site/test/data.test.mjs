import test from 'node:test';
import assert from 'node:assert/strict';
import { date, ageDays, freshness, sourceURL, escapeHTML, minutes, reportingOffset, outreachProvenance } from '../src/data.js';

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
