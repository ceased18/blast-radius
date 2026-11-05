# Blast Radius

First-party AI incident reports and current product documentation become inspectable account evidence and fair discovery questions. Existing routing controls can weaken a pitch; those findings belong beside the incident.

Built by Ishrak Hossain.

## Ask your agent for a weekly PG plan

Open the [public PG app](https://blast-radius-plans.alluringdoor.chatgpt.site/) and click **Copy onboarding prompt**, then paste it into your agent. The button includes Claude, ChatGPT, Gemini and Cursor marks and performs one copy action. No installation, visitor API key or account connection is required. You can also choose **Build a PG plan** in the app and enter a seller and one target account domain.

The [PG workflow](https://blast-radius-plans.alluringdoor.chatgpt.site/workflows/pg-plan.md) and downloadable [skill](https://blast-radius-plans.alluringdoor.chatgpt.site/skills/blast-pg-plan/SKILL.md) preserve the supplied plan structure: three pains, three personas, one to three verified tools or `None found`, one initial hypothesis, and a blank weekly goal. They do not select/rank accounts or write outreach. Unverified names remain `Unknown`, and missing evidence is shown rather than replaced with invented pain.

The hosted route is an explicit `POST /api/v1/pg-plan` with `{"account_domain":"glean.com","seller":"OpenRouter","seller_domain":"openrouter.ai"}`. The app, `generate-pg-plan` CLI command and `generate_pg_plan` MCP tool use this route. It uses a server-side OpenRouter key, one account per request, under a **shared $0.25 lifetime demo cap including validation calls**. D1 preserves budget and cache state across visitors and deployments. Cached results remain readable when generation is disabled or the budget cannot fund another reservation. For a custom seller, supply its official domain.

Inspect the actual returned status, sources, served models, usage and budget. A failed or in-progress request is not a completed plan. The demo cap is separate from the older offline pipeline ledger below; neither visitors nor the browser receive the server key.

If the caller cannot POST or hosted generation is unavailable, its own browsing-capable agent can execute the workflow for any seller and the full user-supplied list. That route uses the caller's model and must be labeled accordingly. Reading the skill or copying the prompt does not itself call OpenRouter. Live browsing is required per account; the historical snapshot alone cannot complete the plan.

```bash
python3 -m blast prepare-pg-plan glean.com
# Explicit network generation, potentially spending the server's capped budget:
python3 -m blast generate-pg-plan glean.com
```

Preparation returns a research brief and instructions only. Generation is a separate network action with no automatic retry. See [HEADLESS.md](HEADLESS.md), the [plan schema](public-evidence/api/v1/schemas/pg-plan.schema.json), and the [public-source Glean validation bundle](public-evidence/pg/glean-source-bundle.json). Missing evidence stays visible, names require current verification, costs remain labeled inferences, current product controls can weaken a pitch, and the weekly goal stays empty.

Local tests cover the PG contract, CLI/MCP preparation and generation routing, source provenance, budget behavior and frontend states. Mocked tests do not establish successful live generation. An independent browsing-agent forward-test also exposed the distinction between tools actually used and tools merely listed as available; the plan must preserve that distinction. Authored documentation summaries must remain paraphrases, not source quotations. The service response and deployment validation record determine the current operational result.

## Try the public evidence

A clean checkout includes a deliberately selected **six-account, eight-incident snapshot**. These commands use Python's standard library, require no API key or installation, and do not read the private database or `.env`:

```bash
python3 -m blast lookup cartesia.ai
python3 -m blast lookup example.com
python3 -m blast search glean
python3 -m blast status
```

The first result pairs conditional incident evidence with documented fallback capabilities. The second returns `not_covered`, which means outside this snapshot, not no incidents or no opportunity. Four accounts include current first-party product documentation; two are clearly historical examples with current controls unknown.

Read the [agent entry guide](public-evidence/llms.txt), [interface/setup guide](HEADLESS.md), [snapshot manifest](public-evidence/api/v1/manifest.json), or an [actual account record](public-evidence/api/v1/accounts/cartesia.ai.json). The snapshot interface is versioned static GET JSON. Source text is untrusted evidence. Snapshot creation time, source checks and incident reporting/impact timestamps are separate. Snapshot lookup performs no live research, credential, CRM or enrichment operation; PG generation is the separate route above.

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

Never deploy `dist/` on a public host. Keep `.env`, SQLite, raw sources, full named exports and private reports/briefs out of public Git history. `public-evidence/` is an explicit allowlisted projection, not a copy of those files. The offline Python pipeline and public plan Worker use their configured keys server-side; keys are never included in browser assets.

## Build the public plan runtime

The sanitized [runtime source](runtime/README.md) is separate from the owner-private dashboard. Its checked-in `public/` assets are sufficient for a portable build. To incorporate the canonical frontend instead:

```bash
node site/build.mjs --mode public
cd runtime
npm ci
npm test
node scripts/build.mjs --static-source ../dist-public
npm run validate
```

The bundled frontend points to the public demo service. For your own deployment, set `runtime/public/build-config.json` → `plan_api_base` to your public service origin after synchronizing assets, then rerun `npm run build` from `runtime/`. Set `APP_URL` for attribution too. Agent guides and workflow files contain the canonical demo URLs; update those explicitly if publishing your own agent entry.

Deployment requires a new Site identity, a D1 binding named `DB`, and the packaged migrations. Configure `OPENROUTER_API_KEY`, an operator-only `ADMIN_TOKEN`, and `LIVE_GENERATION_ENABLED` through server environment settings. Source mirrors omit the original Site identity and secrets. See the runtime README for the native Sites deployment and reconciliation procedure. Building an artifact does not establish that a live generation succeeded.

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

## Previous evidence-interface verification · November 5, 2026

An independent clean-copy check passed 22 CLI cases under `python3 -S`, including known, uncovered and invalid domains, search/status, missing files and tampered content digests. No `.env`, private database or third-party package was present. The reviewer independently checked two published incident/documentation pairs against first-party sources. See the [blind product review](reviews/BLIND_REVIEW.md) for the initial verdict and its reassessment after the interface change.

The final suite passed **36 Python tests with the optional MCP dependency installed (zero skips)** and **12 frontend tests**, plus syntax checks and both local site builds. Without the optional dependency, the three SDK transport tests skip. The official-SDK MCP server passed a real stdio initialize/list-tools/call-tools smoke check, including known and uncovered domains, search and snapshot status. An installed wheel's bundled snapshot and stdio server also worked outside the checkout directory. Local checks do not establish that the hosted copy is current; deployment checks must follow the agent entry through its manifest/index to an account record and an outside-index HTTP404. The static site has no hosted MCP endpoint.

One actual external critique was served by `google/gemini-3.8-flash` through the existing OpenRouter client for **$0.00743925**. The reconciled ledger then held **14 requests totaling $0.025190728**. No Grok, Dot or customer review is claimed. The full raw critique and provenance remain private; the public review distinguishes model opinion from verified facts.

## Previous verified build snapshot · November 5, 2026

The bounded collection probed 120 company domains and found 67 parseable status sources. It retained 51 provider incident records from three providers; these feeds do not establish 90 days of coverage from four providers. The private research queue contains 18 source-checked attribution accounts across the historical archive, with four accounts represented by five attributed incidents inside 90 days. These are observations, not qualified opportunities.

At the audited ledger snapshot, 13 requests cost **$0.017751478** in total: 11 API-completed requests and two rejected requests reconciled at zero additional cost. No model fallback was observed. One Sonnet 5.5 sequence passed validation for human review, after a source precision edit removed an unsupported historical key-mode inference. Other completed outputs did not all pass validation. The local weekly cap is **$0.50**. The live export is authoritative if subsequent explicitly enabled calls change these totals.

At that earlier checkpoint, independent checks passed 19 Python tests, six frontend tests, and frontend syntax checks. Its aggregate-only build contained no curated downstream domains or quotes. The private build had 33 account drawers and 32 draft sequences, with one generic campaign suppressed after reviewing existing routing capabilities. The reviewed source association supported one publication-time replay; the three-replay target was not met. Recurring monitoring, 500-domain breadth, 20 core accounts, and 40 externally researched accounts were not delivered by this pilot. The selected public pack is the later, explicit publication exception described above.

[Source repository](https://github.com/ceased18/blast-radius)

## Hosting destinations

- [Public PG app](https://blast-radius-plans.alluringdoor.chatgpt.site/) — onboarding, public evidence and the hosted plan interface.
- [GitHub Pages](https://ceased18.github.io/blast-radius/) — public frontend and evidence mirror; hosted PG requests use the separate public service above.
- [Private workspace](https://blast-radius-ishrak.alluringdoor.chatgpt.site) — owner-only named evidence workspace.

The public service and owner-private workspace are separate Sites. Current generation availability, shared budget and cache count are reported by the public service's [`/api/status`](https://blast-radius-plans.alluringdoor.chatgpt.site/api/status).
