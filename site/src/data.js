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
