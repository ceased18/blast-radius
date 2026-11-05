export const escapeHTML = (value = '') => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export function sourceURL(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function date(value, withTime = false) {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? 'Not recorded' : parsed.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) }) + (withTime ? ' UTC' : '');
}
export function minutes(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  if (Math.abs(number) < 60) return `${Math.round(number)}m`;
  return `${(number / 60).toFixed(1).replace(/\.0$/, '')}h`;
}
export function ageDays(value, asOf) {
  if (value === null || value === undefined || value === '' || !asOf) return null;
  const delta = new Date(asOf) - new Date(value);
  return Number.isFinite(delta) ? Math.max(0, Math.floor(delta / 86400000)) : null;
}
export function freshness(value, asOf) {
  const age = ageDays(value, asOf);
  return age === null ? { label: 'Date unknown', className: 'muted' } : age <= 7 ? { label: 'Last 7 days', className: 'fresh' } : age <= 90 ? { label: `${age}d ago`, className: 'recent' } : { label: `Archival · ${age}d ago`, className: 'archival' };
}
export function reportingOffset(event, origin) {
  const timestamp = event.reported_at || event.started_at;
  if (timestamp && origin) {
    const difference = new Date(timestamp).valueOf() - new Date(origin).valueOf();
    if (Number.isFinite(difference)) return difference / 60000;
  }
  const lag = event.report_lag_minutes ?? event.lag_minutes;
  return lag === null || lag === undefined || !Number.isFinite(Number(lag)) ? null : Number(lag);
}
export function outreachProvenance(outreach = {}) {
  const mode = String(outreach.mode || '').toLowerCase();
  const assisted = mode.startsWith('openrouter') || String(outreach.generated_by || '').toLowerCase() === 'openrouter';
  const sourceEdits = Array.isArray(outreach.source_edits) ? outreach.source_edits.length : 0;
  if (!assisted) return { label: 'Deterministic drafts', detail: 'Created from templates and source evidence. Human review required before outreach.' };
  return {
    label: 'OpenRouter-assisted drafts',
    detail: [outreach.model ? `Served model: ${outreach.model}.` : 'Generated through OpenRouter.', sourceEdits ? `${sourceEdits} source edit${sourceEdits === 1 ? '' : 's'} by an agent.` : '', 'Human review required before outreach.'].filter(Boolean).join(' '),
  };
}
export function publicLookup(domain, publishedDomains) {
  const normalized = String(domain || '').trim().toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  if (String(domain || '').length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(normalized)) return { status: 'invalid_domain', domain: normalized, message: 'Enter a bare company domain, for example cartesia.ai. URLs, paths, ports, and email addresses are not accepted.' };
  return publishedDomains.includes(normalized) ? { status: 'in_snapshot', domain: normalized } : { status: 'not_in_snapshot', domain: normalized, message: 'Not in this public snapshot. This is not a finding of no incidents or no opportunity. No live lookup was performed.' };
}
export function publicEvidenceBrief(record) {
  if (!record) return 'No published record selected.';
  const lines = [`# ${record.name || record.domain} — public evidence brief`, '', `Domain: ${record.domain}`, `Source check: ${record.coverage?.source_checked_at || 'Not recorded'}`, 'Scope: bounded public snapshot; incomplete history. No current buying intent inferred.', '', '## Incident evidence'];
  for (const evidence of record.evidence || []) {
    lines.push(`- ${evidence.title || ''}`, `  "${evidence.quote || ''}"`, `  Reported: ${evidence.timestamps?.reported_at || evidence.timestamps?.started_at || 'Not recorded'}`, `  Timestamp basis: ${evidence.timestamps?.timestamp_basis || 'Not recorded'}`, `  ${evidence.url || ''}`);
    if (evidence.impact?.conditional) lines.push('  Conditional impact wording; actual customer impact is not independently established.');
    if (evidence.impact?.scope) lines.push(`  Scope: ${evidence.impact.scope}`);
    for (const limitation of evidence.impact?.limitations || []) lines.push(`  Impact limitation: ${limitation}`);
    for (const limitation of evidence.what_it_does_not_prove || []) lines.push(`  Does not establish: ${limitation}`);
    const association = evidence.provider_association;
    if (association) lines.push(`  Linked upstream source: ${association.url || ''}`, `  Provider scope: ${association.provider_scope || 'Not established'}`, `  Public reporting lag: ${association.downstream_report_lag_minutes ?? 'Not recorded'} minutes. ${association.lag_basis || ''}`, `  Association limits: ${association.limitations || 'No impact propagation inferred.'}`);
  }
  lines.push('', '## Current documented capabilities', record.qualification?.finding || record.qualification?.current_documented_capabilities || 'Not researched in this public record. Current architecture is unknown.');
  for (const source of record.qualification?.sources || []) lines.push(`- ${source.title || 'Product documentation'}: ${source.url}`);
  if (record.qualification?.disposition) lines.push(`Disposition: ${record.qualification.disposition}`);
  if (record.qualification?.outreach_guidance) lines.push('', '## Outreach implication', record.qualification.outreach_guidance);
  lines.push('', '## Claim limits', ...(record.what_it_does_not_prove || []).map(value => `- ${value}`), '', '## Open questions', ...[...(record.open_questions || []), ...(record.qualification?.open_questions || [])].filter((value, index, all) => all.indexOf(value) === index).map(question => `- ${question}`), '', 'An absent public record is unknown, not evidence of no incidents.');
  return lines.join('\n');
}
export function normalize(privateData, publicData) {
  const data = privateData || {};
  return {
    ...data,
    summary: data.summary || publicData.summary || {},
    generated_at: data.generated_at || publicData.generated_at,
    as_of: data.as_of || data.generated_at || publicData.generated_at,
    providers: Array.isArray(data.providers) ? data.providers : [],
    incidents: Array.isArray(data.incidents) ? data.incidents : [],
    accounts: Array.isArray(data.accounts) ? data.accounts : [],
    replays: Array.isArray(data.replays) ? data.replays : [],
    runs: Array.isArray(data.runs) ? data.runs : [],
    coverage: data.coverage || {},
    digest: data.digest || {},
    public: publicData,
  };
}
