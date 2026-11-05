# Blast Radius

A first-party incident becomes an inspectable account brief, a qualification question, and a reviewable AE handoff.
Public provider-dependency evidence supplies the research anchor. It does not establish absent failover, buying intent, or a current project.

Built by Ishrak Hossain.

## What works

- Python CLI collects allowed public status feeds, records source coverage and failures, and stores incidents in SQLite.
- Matching separates explicit provider attribution, provider mentions, internal causes, mitigations, and temporal candidates. A correlation is never labeled a confirmed cause.
- The static dashboard includes incident feed, account board, source drawer and handoff, historical replay, run ledger, aggregate public pulse, daily digest, and methodology.
- Every named account is a research candidate. Enterprise fit, current architecture, build-versus-buy, and existing OpenRouter use stay unknown without sources.
- Collection and source-based drafting work without an API key. Deterministic drafts are labeled. They are not claimed as model-generated results.

## Why another status tool?

[IsDown](https://isdown.app/), [StatusGator](https://statusgator.com/), and [Rewindex](https://rewindex.com/) already cover status aggregation or dependency evidence. The useful distinction here is the sales workflow: source inspection, account prioritization, a restrained discovery question, and an AE handoff with unknowns visible. There is no claim of unique outage detection or knowledge of OpenRouter's internal tools.

## Run locally

Python 3.11+ and Node 18+ are required. No frontend packages are needed.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m blast collect --days 180 --domains 120
python -m blast classify
python -m blast score
python -m blast write --limit 40
python -m blast digest
python -m blast export
node site/build.mjs --mode private
python -m http.server 8080 --directory dist
```

Open `http://localhost:8080`. The number requested by `--domains` is a collection bound, not a claim of successful status-page coverage. Cached probes are reused; `--refresh` intentionally rechecks them. A requested historical window is not proof that a feed retains that much history.

The optional local `research/validated_evidence.json` contains a curated source review. `python -m blast import` imports it when present. It is deliberately absent from the public source repository. A fresh checkout starts from public collection, not a secretly bundled named dataset.

## OpenRouter integration

Set a dedicated credit-limited `OPENROUTER_API_KEY` in the ignored `.env` file. The current local weekly cap is $0.50, below the user’s $5 funded balance. `BLAST_WEEKLY_BUDGET_USD` controls that local rail; a dedicated key credit limit provides an external backstop. Then run a bounded augmentation:

```bash
python -m blast live --limit 1
python -m blast export
node site/build.mjs --mode private
```

The client discovers available model IDs and supported JSON parameters from the live catalog. It selects different supported model families for classification, qualification review, and writing, within price limits. Every LLM request goes through OpenRouter with an ordered `models` fallback array. Bulk classification requests price-sorted provider routing. Qualification review is limited to the supplied evidence. The optional `--web` path implements a one-result legacy web plugin request and retains returned annotations, but external account research through that path was not validated in this run; the attempted legacy request was rejected. It is not enabled by the command above. App-attribution headers identify Blast Radius.

The run ledger stores served model, generation ID, actual reported cost, requested fallback models, and returned annotations. An exact served fallback match counts as an observed model fallback; automatic provider-level failover is not guessed. Missing cost or an uncertain sent request blocks further paid work until reconciled. Budget reservations protect against concurrent requests; they are not reported as actual spend.

See [model fallback](https://openrouter.ai/docs/guides/routing/model-fallbacks), [provider routing](https://openrouter.ai/docs/guides/routing/provider-selection), and [app attribution](https://openrouter.ai/docs/guides/features/app-attribution) documentation. Fallback requires workload, output-quality, tool-use, latency, data-policy, and regional compatibility. It is not a guarantee that a named incident would have been prevented.

## Public and private are different artifacts

```bash
node site/build.mjs --mode public
python -m http.server 8081 --directory dist-public
```

The public build contains aggregate data only and does not copy `private.json`. It cannot open named accounts, incident evidence, outreach, replay events, or the private digest. The private build belongs behind actual access control; a browser toggle is not a security boundary.

Never deploy `dist/` on a public host. Keep `.env`, SQLite, raw sources, named exports, named reports and private briefs out of public Git history. The OpenRouter key is used only by the Python process and is never included in browser assets.

## Evidence and coverage limits

Public status pages are selective, incomplete reports, not customer telemetry. Publication lag is not propagation delay. Final-update feed times are not incident onset. Durations are omitted when source timestamps do not establish them. No absent incident is interpreted as proof of healthy service.

The supplied spec's original targets included four providers with 90 days of history, 500 probed domains, 20 named provider-caused accounts, 40 researched accounts, and three real replay candidates. Inspect the exported coverage and current audit report for measured results; the interface does not make those numbers true. The curated local review found 22 candidate companies and 18 with provider-attributed records across a historical archive, with additional warnings, mentions and access changes excluded from that count. This is not a complete 90-day sample.

No outreach is sent. Drafts need a human review, and persona suggestions are job titles rather than invented people. Copy checks reject length violations, hype, links, em dashes, malformed threaded subjects and unsupported architecture claims.

## Validation and refresh

```bash
python3 -m unittest discover -s tests -v
npm --prefix site run check
node --test site/test/*.test.mjs
```

The collection workflow is manual and uploads an aggregate-only artifact. Recurring collection and paid calls are not enabled: an ephemeral runner needs durable ledger state before it can enforce a cross-run weekly budget. Workflow examples are inactive in this public snapshot. The current aggregate site is published directly from the `gh-pages` branch.

## Verified build snapshot · November 5, 2026

The bounded collection probed 120 company domains and found 67 parseable status sources. It retained 51 provider incident records from three providers; these feeds do not establish 90 days of coverage from four providers. The private research queue contains 18 source-checked attribution accounts across the historical archive, with four accounts represented by five attributed incidents inside 90 days. These are observations, not qualified opportunities.

At the audited ledger snapshot, 13 requests cost **$0.017751478** in total: 11 API-completed requests and two rejected requests reconciled at zero additional cost. No model fallback was observed. One Sonnet 5.5 sequence passed validation for human review, after a source precision edit removed an unsupported historical key-mode inference. Other completed outputs did not all pass validation. The local weekly cap is **$0.50**. The live export is authoritative if subsequent explicitly enabled calls change these totals.

Independent checks passed 19 Python tests, six frontend tests, and frontend syntax checks. The aggregate build contained no private payload and no curated downstream domains or quotes. The private build has 33 account drawers and 32 draft sequences, with one generic campaign suppressed after reviewing existing routing capabilities. The reviewed source association supports one publication-time replay; the three-replay target is not claimed as met. Recurring monitoring, 500-domain breadth, 20 core accounts, and 40 externally researched accounts are not claimed as delivered by this pilot.

[Source repository](https://github.com/ceased18/blast-radius)

## Hosting destinations

- [Aggregate demo](https://ceased18.github.io/blast-radius/) — aggregate-only public build.
- [Private workspace](https://blast-radius-ishrak.alluringdoor.chatgpt.site) — owner-only named evidence workspace.

These are the configured destinations; deployment verification is reported separately.

## Public publication

This repository is a sanitized source snapshot. Optional workflow examples are in `workflow-templates/`; they are inactive because the connected GitHub login cannot create workflow files. The deployed public site uses the prepared aggregate-only artifact on `gh-pages`. No OpenRouter key or named account export is uploaded.
