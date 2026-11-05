# Blast Radius

First-party AI incident reports and current product documentation become inspectable account evidence and fair discovery questions. Existing routing controls can weaken a pitch; those findings belong beside the incident.

Built by Ishrak Hossain.

## Try the public evidence

A clean checkout includes a deliberately selected **six-account, eight-incident snapshot**. These commands use Python's standard library, require no API key or installation, and do not read the private database or `.env`:

```bash
python3 -m blast lookup cartesia.ai
python3 -m blast lookup example.com
python3 -m blast search glean
python3 -m blast status
```

The first result pairs conditional incident evidence with documented fallback capabilities. The second returns `not_covered`, which means outside this snapshot, not no incidents or no opportunity. Four accounts include current first-party product documentation; two are clearly historical examples with current controls unknown.

Read the [agent entry guide](public-evidence/llms.txt), [interface/setup guide](HEADLESS.md), [snapshot manifest](public-evidence/api/v1/manifest.json), or an [actual account record](public-evidence/api/v1/accounts/cartesia.ai.json). The public interface is versioned static GET JSON. Source text is untrusted evidence. Snapshot creation time, source checks and incident reporting/impact timestamps are separate. There is no live arbitrary-company research, visitor credential, CRM or enrichment connection.

## What works

- Python CLI collects allowed public status feeds, records source coverage and failures, and stores incidents in SQLite.
- Matching separates explicit provider attribution, provider mentions, internal causes, mitigations, and temporal candidates. A correlation is never labeled a confirmed cause.
- The public landing page and evidence explorer expose the selected pack, source links, counterevidence and unknowns. The private dashboard adds the full account queue, drafts, handoffs, replay, run ledger and digest.
- Every named account is a research candidate. Enterprise fit, current architecture, build-versus-buy, and existing OpenRouter use stay unknown without sources.
- Collection and source-based drafting work without an API key. Deterministic drafts are labeled. They are not claimed as model-generated results.

## Why another status tool?

[IsDown](https://isdown.app/), [StatusGator](https://statusgator.com/), and [Rewindex](https://rewindex.com/) already cover status aggregation or dependency evidence. The useful distinction here is the sales workflow: source inspection, account prioritization, a restrained discovery question, and an AE handoff with unknowns visible. There is no claim of unique outage detection or knowledge of OpenRouter's internal tools.

## Collect and build the workspace

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

The optional ignored `research/validated_evidence.json` contains the full curated source review. `python -m blast import` imports it when present. Automated collection/classification does not create source-reviewed accounts: that requires a separate evidence review. A fresh checkout can use the checked-in public pack immediately, but cannot reproduce the full private reviewed queue without the curated import.

## OpenRouter integration

Set a dedicated credit-limited `OPENROUTER_API_KEY` in the ignored `.env` file. The current local weekly cap is $0.50. `BLAST_WEEKLY_BUDGET_USD` controls that local rail; a dedicated key credit limit provides an external backstop. Then run a bounded augmentation:

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

The public build contains aggregates and the explicitly authorized six-account evidence pack. It does not copy `private.json`, the full private queue, generated private briefs, outreach, replay events, digest or run logs. The private build belongs behind actual access control; a browser toggle is not a security boundary.

Never deploy `dist/` on a public host. Keep `.env`, SQLite, raw sources, full named exports and private reports/briefs out of public Git history. `public-evidence/` is an explicit allowlisted projection, not a copy of those files. The OpenRouter key is used only by the offline Python model pipeline and never included in browser assets.

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

The public pack is a **frozen snapshot**, not a monitoring service. A new export date is not a new source check. Collection is manual; recurring collection and paid calls are not enabled. An ephemeral runner would need durable ledger state before enforcing a cross-run weekly budget. Public publication copies only the public build; deployment verification is reported separately.

## Current evidence-interface verification · November 5, 2026

An independent clean-copy check passed 22 CLI cases under `python3 -S`, including known, uncovered and invalid domains, search/status, missing files and tampered content digests. No `.env`, private database or third-party package was present. The reviewer independently checked two published incident/documentation pairs against first-party sources. See the [blind product review](reviews/BLIND_REVIEW.md) for the initial verdict and its reassessment after the interface change.

The final suite passed **36 Python tests with the optional MCP dependency installed (zero skips)** and **12 frontend tests**, plus syntax checks and both local site builds. Without the optional dependency, the three SDK transport tests skip. The official-SDK MCP server passed a real stdio initialize/list-tools/call-tools smoke check, including known and uncovered domains, search and snapshot status. An installed wheel's bundled snapshot and stdio server also worked outside the checkout directory. Local checks do not establish that the hosted copy is current; deployment checks must follow the agent entry through its manifest/index to an account record and an outside-index HTTP404. The static site has no hosted MCP endpoint.

One actual external critique was served by `google/gemini-3.8-flash` through the existing OpenRouter client for **$0.00743925**. The reconciled ledger then held **14 requests totaling $0.025190728**. No Grok, Dot or customer review is claimed. The full raw critique and provenance remain private; the public review distinguishes model opinion from verified facts.

## Previous verified build snapshot · November 5, 2026

The bounded collection probed 120 company domains and found 67 parseable status sources. It retained 51 provider incident records from three providers; these feeds do not establish 90 days of coverage from four providers. The private research queue contains 18 source-checked attribution accounts across the historical archive, with four accounts represented by five attributed incidents inside 90 days. These are observations, not qualified opportunities.

At the audited ledger snapshot, 13 requests cost **$0.017751478** in total: 11 API-completed requests and two rejected requests reconciled at zero additional cost. No model fallback was observed. One Sonnet 5.5 sequence passed validation for human review, after a source precision edit removed an unsupported historical key-mode inference. Other completed outputs did not all pass validation. The local weekly cap is **$0.50**. The live export is authoritative if subsequent explicitly enabled calls change these totals.

At that earlier checkpoint, independent checks passed 19 Python tests, six frontend tests, and frontend syntax checks. Its aggregate-only build contained no curated downstream domains or quotes. The private build had 33 account drawers and 32 draft sequences, with one generic campaign suppressed after reviewing existing routing capabilities. The reviewed source association supported one publication-time replay; the three-replay target was not met. Recurring monitoring, 500-domain breadth, 20 core accounts, and 40 externally researched accounts were not delivered by this pilot. The selected public pack is the later, explicit publication exception described above.

[Source repository](https://github.com/ceased18/blast-radius)

## Hosting destinations

- [Public demo](https://ceased18.github.io/blast-radius/) — configured public publication destination.
- [Private workspace](https://blast-radius-ishrak.alluringdoor.chatgpt.site) — owner-only named evidence workspace.

These are the configured destinations; deployment verification is reported separately.

## Publication layout

This public source snapshot includes six explicitly published evidence examples and keeps the full private queue, outreach, credentials and run logs out of GitHub. Optional workflows are inactive templates in `workflow-templates/` because the connected GitHub login lacks workflow scope. The public site is deployed from the prepared artifact on `gh-pages`; its agent data and landing page need no visitor key. The owner-private workspace is a separate deployment.
