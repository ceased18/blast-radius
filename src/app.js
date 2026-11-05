import { escapeHTML as esc, sourceURL, date, minutes, freshness, normalize, reportingOffset, outreachProvenance } from './data.js';

const icons = {
  feed: '<path d="M3 5h14M3 10h9M3 15h12"/><circle cx="17" cy="10" r="1"/>',
  accounts: '<rect x="3" y="3" width="6" height="6"/><rect x="12" y="3" width="6" height="6"/><rect x="3" y="12" width="6" height="6"/><rect x="12" y="12" width="6" height="6"/>',
  replay: '<path d="M7 4l11 6-11 6z"/>',
  costs: '<path d="M3 17V9m6 8V3m6 14v-6m4 6H1"/>',
  public: '<circle cx="10" cy="10" r="8"/><path d="M2 10h16M10 2c5 4 5 12 0 16-5-4-5-12 0-16"/>',
  digest: '<path d="M4 2h9l4 4v12H4zM13 2v5h4M7 11h7M7 14h5"/>',
  methodology: '<circle cx="10" cy="10" r="8"/><path d="M10 9v6m0-10v1"/>',
  search: '<circle cx="8" cy="8" r="5"/><path d="M12 12l5 5"/>',
  arrow: '<path d="M4 10h12m-5-5l5 5-5 5"/>',
  external: '<path d="M11 3h6v6M17 3l-9 9M8 4H3v13h13v-5"/>',
  copy: '<rect x="7" y="7" width="10" height="11" rx="1"/><path d="M13 7V3H3v10h4"/>',
  close: '<path d="M4 4l12 12M16 4L4 16"/>',
  pause: '<path d="M7 4v12M13 4v12"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.arrow}</svg>`;
const nav = [ ['feed', 'Incident feed', '01'], ['accounts', 'Account board', '02'], ['replay', 'Outage replay', '03'], ['costs', 'Run ledger', '04'], ['public', 'Public pulse', '05'], ['digest', 'Daily digest', '06'], ['methodology', 'Methodology', '07'] ];
const titles = { feed: ['INCIDENT INTELLIGENCE', 'Follow the dependency.'], accounts: ['ACCOUNT INTELLIGENCE', 'Evidence before outreach.'], replay: ['OUTAGE REPLAY', 'Reconstruct the reporting trail.'], costs: ['OPENROUTER OPERATIONS', 'Every call, accounted for.'], public: ['PUBLIC PULSE', 'The market, in aggregate.'], digest: ['CHIEF OF STAFF', 'Your next account brief.'], methodology: ['EVIDENCE STANDARD', 'Show the work.'] };
const state = { data: null, mode: 'public', view: 'feed', query: '', provider: 'all', evidence: 'all', tier: 'all', review: 'reviewed', page: 0, selectedAccount: null, drawerTab: 'evidence', replayIndex: 0, progress: 0, playing: false, timer: null };
const app = document.querySelector('#app');
let lastFocus;

function external(url, label, cls = '') {
  const safe = sourceURL(url);
  return safe ? `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer" class="source-link ${cls}">${esc(label)} ${icon('external')}</a>` : `<span class="muted">${esc(label)} unavailable</span>`;
}
function providerName(id) { return state.data.providers.find(p => p.id === id)?.name || String(id || 'Unattributed').replaceAll('_', ' '); }
function providerBadge(id) {
  const name = providerName(id);
  const hue = [...String(id)].reduce((a, b) => a + b.charCodeAt(0), 0) % 5;
  return `<span class="provider-token hue-${hue}">${esc(name.slice(0, 1))}</span><span>${esc(name)}</span>`;
}
function tag(label, kind = '') { return `<span class="tag ${kind}">${esc(label)}</span>`; }
function confidence(item) {
  if (item.evidence_type === 'correlated') return tag('Time overlap', 'correlated');
  if (item.review_status === 'reviewed' && item.cause_status === 'provider_attributed') return tag('Reviewed attribution', 'named');
  if (item.review_status === 'reviewed') return tag('Reviewed mention', 'recent');
  return item.evidence_type === 'named' ? tag('Candidate · unreviewed', 'archival') : tag('Unattributed', 'archival');
}
function isReviewedAttribution(item) { return item.review_status === 'reviewed' && item.cause_status === 'provider_attributed'; }
function reviewSwitch() { return `<div class="review-switch" aria-label="Evidence review filter"><button data-action="review" data-id="reviewed" class="${state.review === 'reviewed' ? 'active' : ''}" aria-pressed="${state.review === 'reviewed'}">Reviewed attribution <span>${count(state.data.summary.named_accounts)}</span></button><button data-action="review" data-id="all" class="${state.review === 'all' ? 'active' : ''}" aria-pressed="${state.review === 'all'}">All candidates <span>${count(state.data.accounts.length)}</span></button><span class="review-switch-note">${state.review === 'reviewed' ? 'First-party attribution, checked against source' : 'Includes automated mentions and non-outage events. Review before use.'}</span></div>`; }
function empty(title, body) { return `<div class="empty"><span class="empty-cross">✳</span><h3>${esc(title)}</h3><p>${esc(body)}</p></div>`; }
function count(value) { return Number(value || 0).toLocaleString('en-US'); }
function money(value) { return value === null || value === undefined || !Number.isFinite(Number(value)) ? 'Unreconciled' : `$${Number(value).toFixed(Number(value) > 0 && Number(value) < .01 ? 6 : 4)}`; }
function metric(label, value, note, className = '') { return `<div class="metric ${className}"><span class="eyebrow">${label}</span><strong class="mono">${value}</strong><span class="metric-note">${note}</span></div>`; }
function freshTag(value) { const f = freshness(value, state.data.as_of); return tag(f.label, f.className); }
function renderShell() {
  const privateMode = state.mode === 'private';
  const summary = state.data.summary;
  const visibleNav = privateMode ? nav : nav.filter(n => ['public', 'methodology'].includes(n[0]));
  const title = titles[state.view] || titles.feed;
  app.innerHTML = `<div class="workspace">
    <aside class="sidebar" aria-label="Workspace navigation">
      <a class="brand" href="#${privateMode ? 'feed' : 'public'}" aria-label="Blast Radius home"><span class="brand-mark">✳</span><span>blast radius<span class="brand-sub">INCIDENT INTELLIGENCE</span></span></a>
      <div class="workspace-label"><span class="status-dot lime"></span>${privateMode ? 'PRIVATE WORKSPACE' : 'PUBLIC SNAPSHOT'}</div>
      <nav>${visibleNav.map(([id, label, number]) => `<a class="nav-item ${state.view === id ? 'active' : ''}" href="#${id}" ${state.view === id ? 'aria-current="page"' : ''}>${icon(id)}<span>${label}</span><span class="nav-number">${number}</span>${id === 'accounts' && summary.named_accounts ? `<span class="nav-count">${count(summary.named_accounts)}</span>` : ''}</a>`).join('')}</nav>
      <div class="sidebar-bottom"><div class="engine-label"><span class="engine-glyph">↳</span><span>OpenRouter ready</span></div><p>${state.data.runs.length ? 'Actual model calls appear in the ledger.' : 'Evidence pipeline active. No paid model calls recorded.'}</p><a href="#methodology">Review the evidence standard ${icon('arrow')}</a><div class="maker">BUILT BY ISHRAK HOSSAIN</div></div>
    </aside>
    <div class="main-shell">
      <header class="topbar"><div class="breadcrumb"><span>WORKSPACE</span><span>/</span><strong>${esc(nav.find(n => n[0] === state.view)?.[1] || 'Incident feed')}</strong></div><div class="snapshot"><span class="status-dot lime"></span>SNAPSHOT<span class="topbar-date">${date(state.data.generated_at, true)}</span></div><span class="privacy-pill">${privateMode ? 'Owner-private' : 'Aggregates only'}</span></header>
      <main id="main" tabindex="-1"><div class="page-heading"><div><div class="eyebrow">${title[0]} <span class="heading-slash">/</span> BLAST RADIUS</div><h1>${title[1]}</h1></div>${privateMode && ['feed', 'accounts'].includes(state.view) ? `<label class="searchbox">${icon('search')}<input id="search" type="search" placeholder="Find an account or incident" value="${esc(state.query)}" aria-label="Find an account or incident"><kbd>/</kbd></label>` : `<span class="edition">${privateMode ? 'SALES INTELLIGENCE / V1' : 'PUBLIC EDITION / V1'}</span>`}</div>
      <div id="view-content">${renderView()}</div></main>
      <footer class="page-footer"><span><span class="status-dot muted-dot"></span> PUBLIC SOURCES. PRIVATE ACCOUNT WORK.</span><span>OBSERVATION ≠ CAUSATION <a href="#methodology">READ THE STANDARD ↗</a></span></footer>
    </div>
  </div>`;
}
function renderView() {
  return ({ feed: renderFeed, accounts: renderAccounts, replay: renderReplay, costs: renderCosts, public: renderPublic, digest: renderDigest, methodology: renderMethodology }[state.view] || renderFeed)();
}
function refreshView() {
  const content = document.querySelector('#view-content');
  if (!content) return;
  const active = document.activeElement;
  const selector = content.contains(active) ? active.id ? `#${CSS.escape(active.id)}` : active.dataset.action ? `[data-action="${CSS.escape(active.dataset.action)}"]${active.dataset.id ? `[data-id="${CSS.escape(active.dataset.id)}"]` : ''}` : null : null;
  content.innerHTML = renderView();
  if (selector) content.querySelector(selector)?.focus({ preventScroll: true });
}
function strip() {
  const s = state.data.summary;
  return `<div class="metrics">${metric('PROVIDER INCIDENTS', count(s.provider_incidents), 'Collected from first-party feeds')}${metric('REVIEWED ACCOUNTS', count(s.named_accounts), 'Source-checked upstream attribution', 'accent')}${metric('DOWNSTREAM RECORDS', count(s.downstream_incidents), 'Includes candidates awaiting review')}${metric('MEDIAN REPORTING LAG', minutes(s.median_lag_minutes), `${count(s.lag_sample_size)} matched onsets · not propagation`)}</div>`;
}
function providerFilter() { return `<select id="provider-filter" aria-label="Filter by provider"><option value="all">All providers</option>${state.data.providers.map(p => `<option value="${esc(p.id)}" ${state.provider === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`; }
function renderFeed() {
  const data = state.data;
  let rows = data.incidents.filter(i => (state.review === 'all' || isReviewedAttribution(i)) && (state.provider === 'all' || i.provider_id === state.provider) && (state.evidence === 'all' || i.evidence_type === state.evidence) && `${i.company_name} ${i.title} ${i.quote}`.toLowerCase().includes(state.query.toLowerCase()));
  rows = rows.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  const pageSize = 20;
  const pageRows = rows.slice(state.page * pageSize, (state.page + 1) * pageSize);
  return `${strip()}<div class="signal-note"><span class="signal-note-icon">↳</span><p><strong>A reason to research. A better question to ask.</strong> Status-page evidence shows where customers felt an upstream issue. It does not establish architecture, revenue impact, or the absence of failover.</p><a href="#methodology">Evidence standard ${icon('arrow')}</a></div>
    <section class="panel"><div class="panel-heading"><div><span class="eyebrow">DEPENDENCY MAP</span><h2>Where the signal is coming from</h2></div><span class="subtle-label">COLLECTED INCIDENTS / BY PROVIDER</span></div><div class="provider-grid">${data.providers.map(p => {
      const downstream = data.incidents.filter(i => i.provider_id === p.id);
      const named = downstream.filter(i => i.evidence_type === 'named');
      const dates = Array.from({ length: 24 }, (_, index) => { const start = new Date(data.as_of).valueOf() - (24 - index) * 7 * 86400000; return downstream.filter(i => new Date(i.started_at).valueOf() >= start && new Date(i.started_at).valueOf() < start + 7 * 86400000).length; });
      const max = Math.max(1, ...dates);
      return `<button class="provider-card ${state.provider === p.id ? 'selected' : ''}" data-action="provider" data-id="${esc(p.id)}"><span class="provider-card-head">${providerBadge(p.id)}${icon('arrow')}</span><span class="provider-card-count mono">${count(named.filter(isReviewedAttribution).length)}<small> reviewed attributions</small></span><span class="histogram" aria-label="Weekly observed incident distribution">${dates.map(n => `<i style="--bar:${Math.max(4, n / max * 100)}%" class="${n ? 'has-value' : ''}"></i>`).join('')}</span><span class="provider-card-foot">${count(p.incidents?.length ?? p.incidents_count)} provider incidents <span>OBSERVED / 24 WEEKS</span></span></button>`;
    }).join('') || `<div class="inline-empty">No provider feeds collected yet.</div>`}</div></section>
    ${reviewSwitch()}<section class="panel feed-panel"><div class="panel-heading compact"><div class="panel-title-inline"><h2>Downstream evidence</h2><span class="record-count mono">${count(rows.length)}</span></div><div class="filters">${providerFilter()}<select id="evidence-filter" aria-label="Filter by evidence"><option value="all" ${state.evidence === 'all' ? 'selected' : ''}>All evidence</option><option value="named" ${state.evidence === 'named' ? 'selected' : ''}>Named provider</option><option value="correlated" ${state.evidence === 'correlated' ? 'selected' : ''}>Time overlap only</option></select></div></div>${rows.length ? `<div class="table-scroll"><table class="incident-table"><thead><tr><th>ACCOUNT / INCIDENT</th><th>PROVIDER</th><th>EVIDENCE</th><th>REPORTED / UTC</th><th class="numeric">LAG</th><th class="numeric">REPORTED DURATION</th><th><span class="sr-only">Open account</span></th></tr></thead><tbody>${pageRows.map(i => `<tr><td><button class="row-link" data-action="account" data-id="${esc(i.company_id)}"><strong>${esc(i.company_name)}</strong><span>${esc(i.title)}</span></button></td><td><span class="provider-inline">${providerBadge(i.provider_id)}</span></td><td>${confidence(i)}${i.mitigation_notes ? '<span class="mitigation-label">MITIGATION NOTED</span>' : ''}</td><td class="date-cell"><span>${date(i.started_at)}</span>${freshTag(i.started_at)}</td><td class="numeric mono">${i.lag_minutes != null && Number(i.lag_minutes) >= 0 ? '+' : ''}${minutes(i.lag_minutes)}</td><td class="numeric mono">${minutes(i.duration_minutes)}</td><td><button class="icon-button" data-action="account" data-id="${esc(i.company_id)}" aria-label="Open ${esc(i.company_name)} evidence">${icon('arrow')}</button></td></tr>`).join('')}</tbody></table></div><div class="table-footer"><span>${state.page * pageSize + 1}–${Math.min((state.page + 1) * pageSize, rows.length)} OF ${count(rows.length)} RECORDS <span class="muted">· Exact text inside each account</span></span><div><button class="text-button" data-action="page-prev" ${!state.page ? 'disabled' : ''}>← Previous</button><button class="text-button" data-action="page-next" ${((state.page + 1) * pageSize >= rows.length) ? 'disabled' : ''}>Next →</button></div></div>` : empty('No matching evidence', 'Try another provider or clear your search. Uncollected data is never filled in with example accounts.')}</section>`;
}
function renderAccounts() {
  const accounts = state.data.accounts.filter(a => (state.review === 'all' || a.evidence?.some(isReviewedAttribution)) && (state.tier === 'all' || a.tier === state.tier) && (state.provider === 'all' || a.providers?.includes(state.provider)) && `${a.name} ${a.domain} ${a.why_now}`.toLowerCase().includes(state.query.toLowerCase())).sort((a, b) => b.score - a.score);
  const tiers = ['A', 'B', 'C'].map(t => ({ tier: t, count: state.data.accounts.filter(a => a.tier === t).length }));
  return `<div class="account-summary"><div><span class="eyebrow">RESEARCH QUEUE</span><strong class="mono">${count(state.data.summary.named_accounts)} <small>reviewed accounts</small></strong><p>${count(state.data.accounts.length)} total candidates. Enterprise fit still unverified.</p></div>${tiers.map(t => `<button class="tier-stat ${state.tier === t.tier ? 'selected' : ''}" data-action="tier" data-id="${t.tier}"><span class="tier tier-${t.tier}">${t.tier}</span><span><strong class="mono">${t.count}</strong><small>RESEARCH PRIORITY</small></span></button>`).join('')}</div><div class="signal-note"><span class="signal-note-icon">!</span><p><strong>Scores are a research ordering, not qualification.</strong> A past incident is an opening to understand resilience requirements. Company size, current tooling, buying intent, and OpenRouter usage remain unverified unless cited.</p></div>${reviewSwitch()}<section class="panel"><div class="panel-heading compact"><div class="panel-title-inline"><h2>Account board</h2><span class="record-count mono">${accounts.length}</span></div><div class="filters">${providerFilter()}<select id="tier-filter" aria-label="Filter by tier"><option value="all">All tiers</option>${['A', 'B', 'C'].map(t => `<option value="${t}" ${state.tier === t ? 'selected' : ''}>Tier ${t}</option>`).join('')}</select></div></div>${accounts.length ? `<div class="table-scroll"><table class="account-table"><thead><tr><th>ACCOUNT</th><th>TIER / SCORE</th><th>REASON TO RESEARCH</th><th class="numeric">ATTRIBUTED INCIDENTS</th><th>LATEST EVIDENCE</th><th></th></tr></thead><tbody>${accounts.map(a => `<tr><td><button class="row-link" data-action="account" data-id="${esc(a.id)}"><strong>${esc(a.name)}</strong><span class="mono">${esc(a.domain)}</span></button></td><td><div class="score-cell"><span class="tier tier-${esc(a.tier)}">${esc(a.tier || '?')}</span><span class="mono">${esc(a.score ?? '—')}<span class="muted">/100</span></span></div></td><td class="reason-cell">${qualificationData(a) ? `<div class="account-qualification-badge">${tag(qualificationLabel(qualificationData(a)), 'recent')}</div>` : ''}${esc(a.why_now || 'Review the first-party evidence and qualify fit.')}<div class="tiny-tags">${(a.providers || []).map(p => `<span>${esc(providerName(p))}</span>`).join('')}</div></td><td class="numeric mono">${count(a.attributed_incident_count ?? a.named_incident_count)}</td><td class="date-cell">${date(a.last_seen)}${freshTag(a.last_seen)}</td><td><button class="icon-button" data-action="account" data-id="${esc(a.id)}" aria-label="Open ${esc(a.name)} account">${icon('arrow')}</button></td></tr>`).join('')}</tbody></table></div>` : empty('No accounts in this view', 'Clear a filter to see the rest of the research queue.')}</section>`;
}
function replayData() {
  const replay = state.data.replays[state.replayIndex];
  if (!replay) return null;
  const events = [...(replay.events || [])].map(e => ({ ...e, offset: reportingOffset(e, replay.reported_at || replay.started_at) })).filter(e => e.offset !== null).sort((a, b) => a.offset - b.offset);
  const min = Math.min(0, ...events.map(e => e.offset));
  const max = Math.max(30, ...events.map(e => e.offset));
  const current = min + (max - min) * state.progress / 100;
  return { replay, events, min, max, current };
}
function replayContext(replay, events) {
  return `<section class="replay-context"><div><span class="eyebrow">SOURCE SCOPE</span><p>${esc(replay.scope || 'Inspect the original provider record for the affected services and regions.')}</p><span class="mono replay-origin-date">PROVIDER RECORD · ${date(replay.started_at, true)}</span></div><div><span class="eyebrow">ASSOCIATION & LIMITS</span><p>${esc(replay.alignment_basis || 'Timeline alignment is an observation, not proof of failure propagation.')}</p>${events.map(e => `<p class="replay-event-context"><strong>${esc(e.company_name)} · ${date(e.reported_at || e.started_at, true)}</strong>${esc(e.mitigation_notes || e.lag_basis || 'Customer impact onset and current architecture are unverified.')}</p>`).join('')}</div></section>`;
}
function renderReplay() {
  const rd = replayData();
  if (!rd) return empty('No matched outage replays yet', 'A replay requires a real provider incident and timestamped downstream evidence. No synthetic event sequence is shown.');
  const { replay, events, min, max, current } = rd;
  const revealed = events.filter(e => e.offset <= current);
  return `<div class="replay-intro"><p>A reconstruction of public reporting times.<br><span class="muted">Reporting order is not failure propagation or root-cause proof.</span></p><label class="replay-selector"><span class="eyebrow">SELECT A REAL INCIDENT</span><select id="replay-select" aria-label="Choose outage replay">${state.data.replays.map((r, index) => `<option value="${index}" ${index === state.replayIndex ? 'selected' : ''}>${date(r.started_at)} · ${providerName(r.provider_id)} · ${r.title}</option>`).join('')}</select></label></div>
    <section class="replay-stage"><div class="replay-stage-head"><div class="replay-label"><span class="status-dot ${state.playing ? 'pulse' : ''}"></span>HISTORICAL REPLAY <span class="muted">/ ${date(replay.started_at)}</span></div><span class="replay-time mono">${current >= 0 ? '+' : ''}${minutes(current)}</span></div><div class="replay-main"><div class="provider-origin"><span class="origin-ring">${providerBadge(replay.provider_id).split('</span>')[0]}</span></span><span class="eyebrow">UPSTREAM INCIDENT</span><h2>${esc(providerName(replay.provider_id))}</h2><p>${esc(replay.title)}</p>${external(replay.url, 'Provider source')}<span class="origin-time mono">T + 00:00</span></div><div class="replay-connector"><span></span><i></i></div><div class="echo-stack">${events.length ? events.map((e, i) => `<button class="echo-node ${e.offset <= current ? 'revealed' : ''}" data-action="account" data-id="${esc(e.company_id)}" style="--index:${i}"><span class="echo-dot"></span><span class="echo-node-company"><strong>${esc(e.company_name)}</strong><span>${esc(e.title)}</span></span><span class="echo-node-lag mono" title="${e.offset.toFixed(2)} minutes between public source timestamps">${e.offset >= 0 ? '+' : ''}${e.offset.toFixed(2)}<small>min report lag</small></span><span class="echo-node-label">${e.evidence_type === 'named' ? 'NAMED' : 'OVERLAP'}</span></button>`).join('') : '<p class="muted">No downstream events attached to this incident.</p>'}</div></div><div class="replay-controls"><button class="play-button" data-action="play" aria-label="${state.playing ? 'Pause replay' : 'Play replay'}">${icon(state.playing ? 'pause' : 'replay')} ${state.playing ? 'Pause' : state.progress >= 100 ? 'Replay' : 'Play replay'}</button><div class="scrubber"><input id="replay-progress" type="range" min="0" max="100" step="0.1" value="${state.progress}" aria-label="Replay timeline"><div class="scrubber-labels"><span>${minutes(min)}</span><span>PUBLIC SOURCE TIMESTAMPS</span><span>+${minutes(max)}</span></div></div><span class="revealed-count mono">${revealed.length}<small> / ${events.length} echoes</small></span></div></section><div class="replay-meta"><span>${state.data.replays.length} real incident${state.data.replays.length === 1 ? '' : 's'} available</span><span>Animation runs in ~12 seconds. Scrub to inspect any point.</span></div>${replayContext(replay, events)}<section class="panel"><div class="panel-heading compact"><h2>Event trail</h2><span class="subtle-label">${revealed.length} VISIBLE / ${events.length} TOTAL</span></div><div class="event-trail">${revealed.length ? revealed.map(e => `<div><span class="mono event-lag" title="Minutes between public source timestamps">${e.offset >= 0 ? '+' : ''}${e.offset.toFixed(2)}m</span><span><strong>${esc(e.company_name)}</strong><q>${esc(e.quote)}</q></span>${confidence(e)}${external(e.url, 'Source')}</div>`).join('') : '<div class="event-trail-empty">Press play to reveal the downstream reporting trail.</div>'}</div></section>`;
}
function renderCosts() {
  const runs = state.data.runs;
  const completed = runs.filter(r => r.status === 'complete' || r.served_model).length;
  const rejected = runs.filter(r => r.status === 'rejected').length;
  const webRuns = runs.filter(r => r.web_enabled === true || r.web_plugin_used === true || r.metadata?.web_enabled === true || r.metadata?.web === true);
  const webCitationCount = webRuns.flatMap(r => r.annotations || []).filter(a => a.type === 'url_citation' || a.url_citation).length;
  const researchExecution = webRuns.length ? webCitationCount ? `External web enabled; ${webCitationCount} citation annotations retained.` : 'External web enabled; no citation annotations returned.' : 'Source-limited qualification from incident evidence. No external web research recorded.';
  const total = Number(state.data.summary.actual_spend_usd || 0);
  const budget = state.data.summary.weekly_budget_usd ?? state.data.summary.configured_weekly_budget_usd;
  const unreconciled = Number(state.data.summary.unreconciled_runs || 0);
  const fallback = runs.filter(r => r.fallback_observed === true || r.fallback === true || r.fallback_used === true || r.is_fallback === true).length;
  const models = {};
  for (const run of runs) { const name = run.served_model || run.model; if (!name) continue; models[name] ||= { calls: 0, cost: 0, unknown: 0 }; models[name].calls++; const cost = run.cost_usd ?? run.cost; if (cost === null || cost === undefined) models[name].unknown++; else models[name].cost += Number(cost); }
  return `<div class="metrics">${metric('RECONCILED SPEND', money(total), `${unreconciled} unreconciled request${unreconciled === 1 ? '' : 's'} excluded`, 'accent')}${metric('LEDGER REQUESTS', count(runs.length), `${completed} completed · ${rejected} rejected`)}${metric('FALLBACKS RECORDED', count(fallback), 'Only observed fallback events counted')}${metric('CONFIGURED WEEKLY CAP', budget == null ? 'See config' : `$${Number(budget).toFixed(2)}`, `${money(state.data.summary.pending_reservation_usd ?? 0)} pending reservations`)}</div><div class="cost-layout"><section class="panel"><div class="panel-heading"><div><span class="eyebrow">USAGE ACCOUNTING</span><h2>Spend by served model</h2></div><span class="tag named">ACTUALS ONLY</span></div>${runs.length ? `<div class="model-spend">${Object.entries(models).map(([name, m]) => `<div><span class="mono">${esc(name)}<small>${m.calls} calls${m.unknown ? ` · ${m.unknown} cost unreconciled` : ''}</small></span><strong class="mono">${money(m.cost)}</strong></div>`).join('')}</div>` : empty('No paid model calls yet', 'Collection, exact-text matching, and deterministic research ordering can run without a key. Drafts from that path are marked for review. No OpenRouter usage is claimed.')}</section><section class="panel cost-contract"><span class="eyebrow">ROUTING CONTRACT</span><h2>The right model.<br>A measured fallback.</h2><ol><li><span>01</span><div><strong>Classify</strong><p>Cheap structured classification, price-sorted provider routing.</p></div></li><li><span>02</span><div><strong>Qualify & score</strong><p>${esc(researchExecution)} Unknowns stay unknown.</p></div></li><li><span>03</span><div><strong>Write & lint</strong><p>Evidence-constrained drafts. One retry on lint failure, then flag.</p></div></li></ol><div class="contract-foot">Every enabled LLM request uses OpenRouter model fallback arrays. A configured fallback is not proof it was exercised. API completion does not mean an output passed validation.</div></section></div><section class="panel"><div class="panel-heading compact"><h2>Request ledger</h2><span class="subtle-label">SERVED MODEL · REAL COST · AUDITABLE RUN</span></div>${runs.length ? `<div class="table-scroll"><table><thead><tr><th>TIME</th><th>TASK</th><th>SERVED MODEL</th><th>STATUS</th><th>FALLBACK</th><th class="numeric">COST</th></tr></thead><tbody>${runs.map(r => `<tr><td class="mono">${date(r.created_at || r.started_at || r.timestamp, true)}</td><td>${esc(r.task || r.stage || '—')}</td><td class="mono">${esc(r.served_model || r.model || 'Not served')}</td><td>${tag(r.status === 'complete' ? 'API complete' : r.status || 'unknown', r.status === 'complete' ? 'named' : 'recent')}</td><td>${r.fallback_observed || r.fallback || r.fallback_used ? 'Observed' : r.fallback_observed === false ? 'Not observed' : 'Unknown'}</td><td class="numeric mono">${money(r.cost_usd ?? r.cost)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="ledger-empty mono">0 rows · Connect a dedicated, credit-limited OpenRouter key to record live calls.</div>'}</section>`;
}
function renderPublic() {
  const p = state.data.public;
  const s = p.summary || {};
  const stats = Array.isArray(p.provider_stats) ? p.provider_stats : Object.entries(p.provider_stats || {}).map(([name, value]) => ({ name, ...(typeof value === 'object' ? value : { incidents: value }) }));
  return `${state.mode === 'private' ? '<div class="public-preview-notice">PUBLIC PROJECTION PREVIEW <span>This workspace is owner-private. A public build ships aggregate data only; this toggle is not an access boundary.</span></div>' : ''}<section class="public-hero"><div class="eyebrow"><span class="status-dot lime"></span> THE AI DEPENDENCY OBSERVATORY</div><h2>One upstream issue.<br><span>Many downstream stories.</span></h2><p>Public status pages make AI infrastructure dependencies observable. Blast Radius connects those reports and keeps the uncertainty visible.</p><span class="public-asof mono">AS OF ${date(p.generated_at, true).toUpperCase()}</span><div class="public-orbit" aria-hidden="true"><i></i><i></i><i></i><span>✳</span><b></b><b></b><b></b></div></section><div class="public-metrics">${metric('PROVIDER INCIDENTS COLLECTED', count(s.provider_incidents), 'First-party provider feeds')}${metric('DOWNSTREAM RECORDS', count(s.downstream_incidents), 'Includes unreviewed candidates')}${metric('REVIEWED ATTRIBUTION ACCOUNTS', count(s.named_accounts), 'No company identities published')}${metric('MEDIAN MATCHED REPORTING LAG', minutes(s.median_lag_minutes), 'Timing overlap is not causality')}</div><section class="panel"><div class="panel-heading"><div><span class="eyebrow">AGGREGATE OBSERVATIONS</span><h2>Collected provider incident distribution</h2></div><span class="subtle-label">NO DOWNSTREAM IDENTITIES</span></div>${stats.length ? `<div class="public-bars">${stats.map(stat => { const value = Number(stat.named_echoes ?? stat.downstream_incidents ?? stat.observed_incidents ?? stat.incidents ?? stat.count ?? 0); const max = Math.max(1, ...stats.map(x => Number(x.named_echoes ?? x.downstream_incidents ?? x.observed_incidents ?? x.incidents ?? x.count ?? 0))); return `<div><span>${esc(stat.name || stat.provider_name || stat.provider || stat.id || 'Provider')}</span><span class="public-bar-track"><i style="width:${value / max * 100}%"></i></span><strong class="mono">${count(value)}</strong></div>`; }).join('')}</div>` : '<p class="panel-prose">Provider-level aggregate counts will appear after collection.</p>'}</section><div class="public-bottom"><section><span class="eyebrow">HOW TO READ THIS</span><h3>An observation, not a verdict.</h3><p>Named evidence means a downstream status report explicitly mentions a model provider. Correlation means reporting times overlap. Neither demonstrates that the company lacks fallbacks or that a gateway would have prevented the incident.</p></section><section><span class="eyebrow">COVERAGE LIMITS</span><h3>A bounded public corpus.</h3><p>${esc((p.limitations || state.data.coverage.limitations || ['Status feeds have different retention windows. These are collected observations, not a complete market count.'])[0])}</p><a href="#methodology">See sources & methodology ${icon('arrow')}</a></section></div><button class="button secondary" data-action="copy-public">${icon('copy')} Copy aggregate brief</button>`;
}
function renderDigest() {
  const markdown = state.data.digest.markdown || '';
  return `<div class="digest-layout"><section class="panel digest-paper"><div class="panel-heading"><div><span class="eyebrow">DAILY INTELLIGENCE BRIEF</span><h2>For your chief of staff.</h2></div>${tag('DRAFT · HUMAN REVIEW', 'recent')}</div><div class="digest-actions"><button class="button primary" data-action="copy-digest">${icon('copy')} Copy brief</button><button class="button secondary" data-action="download-digest">Download .md ↓</button></div>${markdown ? `<pre class="digest-content">${esc(markdown)}</pre>` : empty('No digest generated', 'Run the daily digest stage after collecting evidence. There is no fabricated "new today" activity.')}</section><aside class="digest-guide"><span class="eyebrow">THE HANDOFF STANDARD</span><h3>Useful to an AE.<br>Readable by an agent.</h3><p>The brief is plain Markdown. Paste it into your chief-of-staff workflow or CRM without losing the evidence trail.</p><ul><li>Source-linked incident evidence</li><li>Timing and confidence labels</li><li>Priority accounts and open questions</li><li>Drafts with review status</li><li>Coverage and cost limitations</li></ul><div class="guide-callout"><strong>No automatic outreach.</strong><p>These drafts are a starting point for a rep. Public incidents are a reason to investigate fit, not evidence of buying intent.</p></div></aside></div>`;
}
function renderMethodology() {
  const d = state.data;
  const publicMode = state.mode === 'public';
  const limits = publicMode ? d.public.limitations || [] : d.coverage.limitations || d.public.limitations || [];
  const sources = publicMode ? [] : d.coverage.sources || [];
  return `<div class="method-intro"><span class="eyebrow">WHAT THIS PRODUCT CAN ESTABLISH</span><h2>Evidence you can inspect.<br>Unknowns you can see.</h2><p>This is a research workbench for a specific question: which companies have publicly reported AI feature issues while naming an upstream provider?</p></div><div class="method-grid"><section class="method-card"><span class="method-number">01 / OBSERVATION</span><h3>Named provider</h3>${tag('STRONGER EVIDENCE', 'named')}<p>A first-party incident record explicitly names a provider or model. The original wording, timestamp, and URL are retained. A mention is not by itself proof of root cause.</p></section><section class="method-card"><span class="method-number">02 / HYPOTHESIS</span><h3>Time overlap</h3>${tag('LOWER CONFIDENCE', 'correlated')}<p>An AI-related downstream incident overlaps a provider incident. Timing suggests something to investigate. It does not confirm the provider caused the incident.</p></section><section class="method-card"><span class="method-number">03 / QUALIFICATION</span><h3>Architecture unknown</h3>${tag('ASK, DON’T ASSUME', 'archival')}<p>Existing failover, gateway vendors, model substitutability, contract fit, and budget need discovery. OpenRouter cannot prevent every failure, and model switching can change behavior.</p></section></div><section class="panel"><div class="panel-heading"><div><span class="eyebrow">COLLECTION SNAPSHOT</span><h2>Coverage & limitations</h2></div><span class="mono subtle-label">${date(d.generated_at, true)}</span></div><div class="coverage-metrics">${metric('DOMAINS PROBED', count(d.summary.domains_probed), 'Actual unique domain checks')}${metric('STATUS PAGES FOUND', count(d.summary.status_pages_found), 'Successfully discovered sources')}${metric('PROVIDER FEEDS', count(publicMode ? d.public.provider_stats?.length : d.providers.length), 'Retention differs by feed')}</div><ul class="limitations">${(limits.length ? limits : ['The corpus is bounded by discoverable public pages and feed retention. There is no assertion of complete market coverage.']).map(l => `<li>${esc(typeof l === 'object' ? JSON.stringify(l) : l)}</li>`).join('')}</ul>${sources.length ? `<div class="coverage-sources"><h3>Source health</h3><div class="table-scroll"><table><thead><tr><th>SOURCE</th><th>STATUS / COVERAGE</th><th>LINK</th></tr></thead><tbody>${sources.map(s => typeof s === 'string' ? `<tr><td>${esc(s)}</td><td>Collected source</td><td>—</td></tr>` : `<tr><td>${esc(s.name || s.provider || s.source || s.host || s.url || 'Source')}</td><td>${esc([s.state || s.status, s.detail || s.note || s.coverage || s.error].filter(Boolean).join(' · ') || 'See source')}</td><td>${external(s.url || s.status_url, 'Inspect')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}</section><div class="method-bottom"><section><span class="eyebrow">PRIVACY BY OUTPUT</span><h3>Separate payloads. Clear boundary.</h3><p>The public build contains aggregate counts only. The private workspace contains named accounts, evidence, drafts, and handoff briefs. No browser-side API key is required or shipped.</p></section><section><span class="eyebrow">HUMAN REVIEW</span><h3>Research first. Outreach second.</h3><p>No personal contacts are invented. Personas are role titles. Drafts should be checked against the original incident and the company’s current context before use.</p></section></div>`;
}

function accountById(id) { return state.data.accounts.find(a => String(a.id) === String(id)); }
function qualificationData(account) { return account.qualification || account.research?.qualification; }
function qualificationLabel(qualification) {
  return ({ weak_generic_fallback_pitch: 'Existing fallback documented', exclude_generic_fallback_campaign: 'Exclude generic fallback', deployment_specific_qualification_required: 'Qualify deployment first', qualify_existing_controls_first: 'Qualify existing controls' }[qualification?.disposition] || 'Product documentation checked');
}
function qualificationPanel(account) {
  const q = qualificationData(account);
  if (!q) return '';
  return `<section class="drawer-section qualification-panel"><div class="section-title"><h3>Current product evidence</h3>${tag(qualificationLabel(q), 'recent')}</div><p>${esc(q.finding || q.current_documented_capabilities || '')}</p>${q.outreach_guidance ? `<div class="qualification-guidance"><strong>Outreach decision</strong><p>${esc(q.outreach_guidance)}</p></div>` : ''}${q.next_validation_question ? `<div class="qualification-question"><span class="eyebrow">NEXT VALIDATION QUESTION</span><p>${esc(q.next_validation_question)}</p></div>` : ''}<div class="qualification-sources">${(q.sources || []).map(s => `<div>${external(s.url, s.title || 'Product documentation')}<span>${esc(s.claim || '')}</span></div>`).join('')}</div><span class="qualification-date mono">SOURCE-CHECKED BY AGENT · ${date(q.checked_at)}</span></section>`;
}
function handoffText(account) {
  const lines = [`# ${account.name} — AE research handoff`, '', `Research priority: ${account.tier || 'Unrated'} / ${account.score ?? 'unscored'}`, account.why_now || '', '', '## Evidence'];
  for (const e of account.evidence || []) {
    lines.push(`- ${date(e.started_at)} | ${e.evidence_type || 'named'} | ${e.cause_status || 'Unreviewed attribution'} | ${e.title || ''}`, `  "${e.quote || ''}"`, `  ${e.url || e.source_url || ''}`);
    if (e.mitigation_notes) lines.push(`  Source context / mitigation: ${e.mitigation_notes}`);
    if (e.lag_basis) lines.push(`  Timing basis: ${e.lag_basis}`);
  }
  const qualification = qualificationData(account);
  if (qualification) {
    lines.push('', '## Current product evidence', qualificationLabel(qualification), qualification.finding || qualification.current_documented_capabilities || '', `Outreach guidance: ${qualification.outreach_guidance || 'Qualify the unmet requirement first.'}`, `Next validation: ${qualification.next_validation_question || 'Current commercial fit is unknown.'}`);
    for (const source of qualification.sources || []) lines.push(`- ${source.title || 'Documentation'}: ${source.url}`, source.claim || '');
  }
  lines.push('', '## Brief', ...(account.brief || []).map(b => `- ${typeof b === 'string' ? b : JSON.stringify(b)}`), '', '## Personas');
  for (const p of account.personas || []) lines.push(`- ${typeof p === 'string' ? p : `${p.title || p.role || ''}: ${p.angle || ''}`}`);
  lines.push('', '## Discovery questions', ...(account.outreach?.discovery_questions || []).map(q => `- ${q}`), '', 'Unverified: architecture, failover, current vendor, buying intent, budget, and stakeholder identity.');
  return lines.join('\n');
}
function renderDrawer() {
  const a = state.selectedAccount;
  const root = document.querySelector('#drawer-root');
  app.inert = Boolean(a);
  if (!a) { root.innerHTML = ''; document.body.classList.remove('drawer-open'); return; }
  let content = '';
  if (state.drawerTab === 'evidence') content = `<div class="drawer-section"><span class="eyebrow">REASON TO RESEARCH</span><p class="why-now">${esc(a.why_now || 'Review the underlying evidence before qualifying this account.')}</p><div class="drawer-facts"><span><small>REVIEWED ATTRIBUTIONS</small><strong class="mono">${count(a.attributed_incident_count ?? a.evidence?.filter(isReviewedAttribution).length)}</strong></span><span><small>LATEST OBSERVATION</small><strong>${date(a.last_seen)}</strong></span></div></div>${qualificationPanel(a)}<div class="drawer-section"><div class="section-title"><h3>First-party evidence</h3><span class="mono muted">${a.evidence?.length || 0} records</span></div>${(a.evidence || []).map(e => `<article class="evidence-card"><div class="evidence-card-meta">${confidence(e)}${freshTag(e.started_at)}</div><h4>${esc(e.title || 'Status incident')}</h4><blockquote>${esc(e.quote || 'No exact quote retained. Inspect source before using.')}</blockquote><div class="evidence-times"><span>REPORTED <strong class="mono">${date(e.started_at, true)}</strong></span><span>REPORTED DURATION <strong class="mono">${minutes(e.duration_minutes)}</strong></span>${e.lag_minutes != null ? `<span>OBSERVED LAG <strong class="mono">${minutes(e.lag_minutes)}</strong></span>` : ''}</div>${e.mitigation_notes ? `<div class="mitigation-note"><span class="eyebrow">REPORTED MITIGATION / CONTEXT</span><p>${esc(e.mitigation_notes)}</p></div>` : ''}<div class="evidence-basis"><span>${esc(String(e.cause_status || 'unreviewed mention').replaceAll('_', ' '))}</span><span>${esc(String(e.timestamp_basis || 'timestamp basis unrecorded').replaceAll('_', ' '))}</span></div>${external(e.url || e.source_url, 'Read original incident')}</article>`).join('') || '<p class="muted">No evidence records attached. Do not use this account for outreach yet.</p>'}</div><div class="drawer-section"><span class="eyebrow">QUALIFICATION STILL OPEN</span><p class="drawer-caution">These reports do not establish that ${esc(a.name)} lacks failover. Current gateway usage, enterprise fit, and buying intent ${a.research?.status === 'not_researched' ? 'have not been researched' : 'need source-backed confirmation'}.</p></div>`;
  if (state.drawerTab === 'handoff') content = `${qualificationPanel(a)}<div class="drawer-section"><div class="section-title"><h3>AE brief</h3><button class="button small secondary" data-action="copy-handoff">${icon('copy')} Copy handoff</button></div>${a.brief?.length ? `<ul class="brief-list">${a.brief.map(b => `<li>${esc(typeof b === 'string' ? b : b.text || JSON.stringify(b))}</li>`).join('')}</ul>` : '<p class="muted">No AE brief generated yet.</p>'}</div><div class="drawer-section"><h3>People to involve</h3><p class="muted small-copy">Role hypotheses, not identified contacts.</p>${(a.personas || []).map(p => `<div class="persona"><span class="persona-icon">↗</span><div><strong>${esc(typeof p === 'string' ? p : p.title || p.role)}</strong><p>${esc(typeof p === 'string' ? 'Validate relevance during account research.' : p.angle)}</p></div></div>`).join('')}</div><div class="drawer-section"><h3>Discovery questions</h3><ol class="questions">${(a.outreach?.discovery_questions || []).map(q => `<li>${esc(q)}</li>`).join('') || '<li>How do you handle an upstream model outage today?</li>'}</ol></div><div class="drawer-section"><h3>Likely objections</h3>${(a.outreach?.objections || []).map(o => `<div class="objection"><strong>${esc(typeof o === 'string' ? o : o.objection || o.question)}</strong>${typeof o === 'object' ? `<p>${esc(o.response || o.answer)}</p>` : ''}</div>`).join('') || '<p class="muted">Not generated.</p>'}</div><div class="drawer-section"><h3>Research status</h3>${tag(String(a.research?.status || 'not_researched').replaceAll('_', ' '), 'recent')}<div class="research-sources">${(a.research?.sources || []).map(s => external(typeof s === 'string' ? s : s.url, typeof s === 'string' ? 'Research source' : s.title || 'Research source')).join('')}</div></div>`;
  if (state.drawerTab === 'outreach') { const o = a.outreach || {}; content = `${qualificationPanel(a)}<div class="draft-notice"><strong>${esc(outreachProvenance(o).label)}</strong><span>${esc(outreachProvenance(o).detail)} Verify source context and relevance before use.</span></div>${o.lint_errors?.length ? `<div class="lint-notice">Lint flagged: ${esc(o.lint_errors.join(', '))}</div>` : ''}<div class="drawer-section"><div class="section-title"><h3>Threaded email sequence</h3><span class="tag archival">3 TOUCHES</span></div>${o.emails?.length ? o.emails.map((e, index) => `<article class="email-draft"><div class="draft-heading"><span class="eyebrow">EMAIL ${index + 1} ${index ? '· THREADED REPLY' : ''}</span><button class="icon-button" data-action="copy-email" data-index="${index}" aria-label="Copy email ${index + 1}">${icon('copy')}</button></div>${e.subject ? `<div class="email-subject"><span>subject</span> ${esc(e.subject)}</div>` : '<div class="email-subject muted">Re: previous thread</div>'}<pre>${esc(e.body)}</pre><div class="email-wordcount mono">${String(e.body || '').trim().split(/\s+/).filter(Boolean).length} WORDS ${e.lint_status ? `· ${esc(e.lint_status)}` : ''}</div></article>`).join('') : '<p class="muted">Outreach has not been generated for this account.</p>'}</div>${[['Call opener', o.call_opener, 'call'], ['LinkedIn note', o.linkedin_note, 'linkedin']].map(([label, body, id]) => body ? `<div class="drawer-section"><div class="section-title"><h3>${label}</h3><button class="icon-button" data-action="copy-channel" data-id="${id}" aria-label="Copy ${label.toLowerCase()}">${icon('copy')}</button></div><pre class="channel-copy">${esc(body)}</pre></div>` : '').join('')}`; }
  root.innerHTML = `<div class="drawer-overlay" data-action="close-drawer"></div><aside class="account-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" tabindex="-1"><div class="drawer-top"><span class="eyebrow">ACCOUNT INTELLIGENCE <span class="mono">/ SOURCE-BACKED BRIEF</span></span><button class="icon-button" data-action="close-drawer" aria-label="Close account drawer">${icon('close')}</button></div><div class="drawer-account"><div class="account-monogram">${esc(a.name.slice(0, 1))}</div><div><h2 id="drawer-title">${esc(a.name)}</h2>${external(`https://${a.domain}`, a.domain)}</div><span class="tier tier-${esc(a.tier)}">${esc(a.tier || '?')}</span></div><div class="drawer-tabs" role="tablist" aria-label="Account details">${[['evidence', 'Evidence'], ['handoff', 'AE handoff'], ['outreach', 'Outreach']].map(([id, label]) => `<button role="tab" aria-selected="${state.drawerTab === id}" aria-controls="drawer-panel" class="${state.drawerTab === id ? 'active' : ''}" data-action="drawer-tab" data-id="${id}">${label}</button>`).join('')}</div><div class="drawer-body" id="drawer-panel" role="tabpanel" tabindex="0">${content}</div><div class="drawer-bottom"><span>REVIEW BEFORE OUTREACH</span><button class="button primary" data-action="copy-handoff">${icon('copy')} Copy AE handoff</button></div></aside>`;
  document.body.classList.add('drawer-open');
}
function openAccount(id) {
  const a = accountById(id);
  if (!a) { toast('No account brief attached to this evidence yet.'); return; }
  lastFocus = document.activeElement;
  state.selectedAccount = a; state.drawerTab = 'evidence'; renderDrawer();
  document.querySelector('.account-drawer')?.focus();
}
function closeDrawer() { state.selectedAccount = null; renderDrawer(); lastFocus?.focus?.(); }
function toast(message) { const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('visible'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('visible'), 3500); }
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard.'); }
  catch {
    const area = document.createElement('textarea'); area.value = text; area.setAttribute('aria-label', 'Copy content'); document.body.append(area); area.select();
    let success = false;
    try { success = document.execCommand('copy'); } catch { /* Fall through to visible manual copy. */ }
    area.remove();
    if (success) { toast('Copied to clipboard.'); return; }
    document.querySelector('.copy-fallback')?.remove();
    const panel = document.createElement('section');
    panel.className = 'copy-fallback'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', 'Copy text manually');
    panel.innerHTML = `<div><strong>Copy text manually</strong><button class="icon-button" data-action="close-copy" aria-label="Close manual copy">${icon('close')}</button></div><p>Your browser did not allow automatic clipboard access. Select this text and copy it.</p><textarea aria-label="Text to copy" readonly>${esc(text)}</textarea>`;
    document.body.append(panel); panel.querySelector('textarea').focus(); panel.querySelector('textarea').select();
  }
}
function aggregateBrief() { const s = state.data.public.summary || {}; return `Blast Radius · ${date(state.data.public.generated_at)}\n${count(s.provider_incidents)} provider incidents collected\n${count(s.downstream_incidents)} downstream reports\n${count(s.named_accounts)} accounts with reviewed upstream attribution\nMedian observed matched reporting lag: ${minutes(s.median_lag_minutes)}\n\nBounded public corpus, not complete market coverage. Timing does not establish causation. Status evidence does not prove the absence of failover.`; }
function stopReplay() { clearInterval(state.timer); state.timer = null; state.playing = false; }
function playReplay() {
  if (state.playing) { stopReplay(); refreshView(); return; }
  if (state.progress >= 100) state.progress = 0;
  state.playing = true;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const step = reduced ? 8.34 : 1;
  state.timer = setInterval(() => { state.progress = Math.min(100, state.progress + step); if (state.progress >= 100) stopReplay(); refreshView(); }, reduced ? 1000 : 120);
  refreshView();
}
function download(filename, content) { const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

document.addEventListener('click', event => {
  const el = event.target.closest('[data-action]'); if (!el) return;
  switch (el.dataset.action) {
    case 'account': openAccount(el.dataset.id); break;
    case 'close-drawer': closeDrawer(); break;
    case 'drawer-tab': state.drawerTab = el.dataset.id; renderDrawer(); document.querySelector(`[data-action="drawer-tab"][data-id="${state.drawerTab}"]`)?.focus(); break;
    case 'provider': state.provider = state.provider === el.dataset.id ? 'all' : el.dataset.id; state.page = 0; refreshView(); break;
    case 'review': state.review = el.dataset.id; state.page = 0; refreshView(); break;
    case 'tier': state.tier = state.tier === el.dataset.id ? 'all' : el.dataset.id; refreshView(); break;
    case 'page-prev': state.page = Math.max(0, state.page - 1); refreshView(); break;
    case 'page-next': state.page++; refreshView(); break;
    case 'play': playReplay(); break;
    case 'copy-handoff': copy(handoffText(state.selectedAccount)); break;
    case 'copy-email': { const e = state.selectedAccount.outreach.emails[Number(el.dataset.index)]; copy(`${e.subject ? `Subject: ${e.subject}\n\n` : ''}${e.body}`); break; }
    case 'copy-channel': copy(state.selectedAccount.outreach[el.dataset.id === 'call' ? 'call_opener' : 'linkedin_note']); break;
    case 'copy-digest': copy(state.data.digest.markdown || 'No digest generated.'); break;
    case 'download-digest': download('blast-radius-digest.md', state.data.digest.markdown || 'No digest generated.'); break;
    case 'copy-public': copy(aggregateBrief()); break;
    case 'close-copy': document.querySelector('.copy-fallback')?.remove(); document.querySelector('.account-drawer')?.focus(); break;
  }
});
document.addEventListener('input', event => {
  if (event.target.id === 'search') { state.query = event.target.value; state.page = 0; refreshView(); }
  if (event.target.id === 'replay-progress') { stopReplay(); state.progress = Number(event.target.value); refreshView(); document.querySelector('#replay-progress')?.focus(); }
});
document.addEventListener('change', event => {
  const id = event.target.id;
  if (id === 'provider-filter') state.provider = event.target.value;
  if (id === 'evidence-filter') state.evidence = event.target.value;
  if (id === 'tier-filter') state.tier = event.target.value;
  if (id === 'replay-select') { stopReplay(); state.replayIndex = Number(event.target.value); state.progress = 0; }
  if (['provider-filter', 'evidence-filter', 'tier-filter', 'replay-select'].includes(id)) { state.page = 0; refreshView(); document.querySelector(`#${id}`)?.focus(); }
});
document.addEventListener('keydown', event => {
  const manualCopy = document.querySelector('.copy-fallback');
  if (manualCopy && event.key === 'Escape') { manualCopy.remove(); document.querySelector('.account-drawer')?.focus(); return; }
  if (manualCopy && event.key === 'Tab') { const focusable = [...manualCopy.querySelectorAll('button,textarea')]; const index = focusable.indexOf(document.activeElement); if (event.shiftKey && index <= 0) { event.preventDefault(); focusable.at(-1).focus(); } else if (!event.shiftKey && (index < 0 || index === focusable.length - 1)) { event.preventDefault(); focusable[0].focus(); } return; }
  if (event.key === 'Escape' && state.selectedAccount) closeDrawer();
  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) { const search = document.querySelector('#search'); if (search) { event.preventDefault(); search.focus(); } }
  if (event.key === 'Tab' && state.selectedAccount) {
    const els = [...document.querySelector('.account-drawer').querySelectorAll('button:not([disabled]),a[href],input,select,textarea,[tabindex="0"]')];
    if (!els.length) return;
    const index = els.indexOf(document.activeElement);
    if (event.shiftKey && index <= 0) { event.preventDefault(); els.at(-1).focus(); }
    else if (!event.shiftKey && (index === -1 || index === els.length - 1)) { event.preventDefault(); els[0].focus(); }
  }
});
function route() {
  stopReplay(); closeDrawer();
  const target = location.hash.replace('#', '');
  state.view = nav.some(n => n[0] === target) ? target : state.mode === 'private' ? 'feed' : 'public';
  if (state.mode !== 'private' && !['public', 'methodology'].includes(state.view)) state.view = 'public';
  state.page = 0; renderShell();
}
window.addEventListener('hashchange', route);
async function init() {
  try {
    const configResponse = await fetch('./build-config.json', { cache: 'no-store' });
    if (!configResponse.ok) throw new Error('Build configuration is missing. Build the site before serving.');
    const config = await configResponse.json();
    state.mode = config.mode === 'private' ? 'private' : 'public';
    const publicResponse = await fetch('./data/public.json', { cache: 'no-store' });
    if (!publicResponse.ok) throw new Error('Aggregate data export is missing. Run the export stage.');
    const aggregate = await publicResponse.json();
    let privateData = null;
    if (state.mode === 'private') { const response = await fetch('./data/private.json', { cache: 'no-store' }); if (!response.ok) throw new Error('Private evidence export is missing. No example records will be substituted.'); privateData = await response.json(); }
    state.data = normalize(privateData, aggregate);
    route();
  } catch (error) { app.innerHTML = `<div class="load-error"><span class="brand-mark">✳</span><h1>Evidence workspace unavailable.</h1><p>${esc(error.message)}</p><p>Collection data must be exported before this workspace can open.</p></div>`; }
}
init();
