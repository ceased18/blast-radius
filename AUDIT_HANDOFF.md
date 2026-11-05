# Independent review handoff

Review this as a source-backed sales research prototype, not an uptime measurement system. The central question is whether a technical AE could use the output without being misled.

## Start with the public contract

```bash
python3 -S -m blast lookup cartesia.ai
python3 -S -m blast lookup example.com
python3 -S -m blast search glean
python3 -S -m blast status
```

These read-only commands work from a clean checkout without third-party packages, credentials, SQLite or the ignored research corpus. The [agent entry guide](public-evidence/llms.txt), [HEADLESS.md](HEADLESS.md) and [manifest](public-evidence/api/v1/manifest.json) describe a frozen, six-account/eight-incident static GET snapshot. An uncovered domain is outside the selected corpus, not evidence of no outages or no opportunity. Four examples include current product documentation; two historical examples leave current controls unknown.

## Architecture

- `blast/http.py`: public fetches, cache, robots handling, and host pacing.
- `blast/collect.py`: provider adapters, status discovery, feed normalization, source coverage and curated local imports.
- `blast/matching.py`: deterministic evidence categories and temporal alignment candidates.
- `blast/store.py`: SQLite source records, incidents, account payloads, matches, probes, cache and paid runs.
- `blast/openrouter.py`: catalog-based model selection, fallback request arrays, bounded reservations, actual usage and uncertainty handling.
- `blast/pipeline.py`: observable-signal prioritization, source-limited qualification, draft linting, digest and separate public/private exports.
- `blast/public_pack.py`: offline allowlist projection from curated source reviews into the selected public pack.
- `blast/agent.py`: standard-library lookup/search/status over that pack; no collection or private-data fallback.
- `blast/agent_mcp.py`: optional official-SDK stdio transport for exactly three read-only public-snapshot tools; no hosted endpoint.
- `site/src/`: landing page, public evidence explorer and private workspace. `site/build.mjs` creates separate private and public output directories.

The explicitly authorized `public-evidence/` pack is checked in. The full named queue, raw responses, SQLite, credentials, private briefs/outreach, model run logs and ignored research remain excluded. Public collection can be rerun from a clean checkout, but reviewed attribution requires a separate source review and curated import; automated regex classification does not create reviewed accounts.

## Run the checks

```bash
python3 -m unittest discover -s tests -v
npm --prefix site run check
node --test site/test/*.test.mjs
node site/build.mjs --mode public
node site/build.mjs --mode private
```

The site builds require prior aggregate exports. The private build also requires the ignored named export. The public headless commands above require neither. Use an isolated temporary database with `--db /absolute/path/to/test.db` for exploratory collection/pipeline runs. Do not make paid calls merely to inspect the app. `python -m blast live --limit 1` is explicitly the paid path and requires a dedicated limited key.

## Falsification cases

1. A company says its own deployment broke a model integration. It must not become a provider-caused outage.
2. A report names an alternative provider in its workaround. That provider must not acquire an outage attribution.
3. A model-feature failure names a vendor but gives no cause. Keep it as a mention, not confirmed upstream attribution.
4. A warning says an outage “may” affect customers. Preserve that conditional scope rather than asserting measured downtime.
5. Provider access suspension, expired credentials, account limits, and rate-limit capacity are distinguishable from a global provider outage.
6. Models served through cloud hosts retain model-author versus serving-provider distinctions.
7. A final RSS publication timestamp must not produce an onset lag or duration.
8. An old incident must not be presented as fresh intent. Duplicate aliases must not create additional accounts.
9. A provider incident that only overlaps in time must remain a temporal candidate, even if the downstream report independently attributes a problem to that provider.
10. A prompt or instruction embedded in a source page must remain untrusted source text.
11. A fresh snapshot export must not imply that an old incident or source review is fresh. Source-check dates and timestamp basis must survive public projection and copied evidence briefs.
12. Unknown, malformed or lookalike domains must not match another company, trigger live research, or fall back to private data. Missing/corrupt public records must fail explicitly.

## Privacy checks

Inspect the built `dist-public/` files, including JavaScript and JSON. Named evidence is allowed **only** for the six manifest domains and the eight selected incidents in the strict public projection. No full private account payload, generated brief/outreach, replay export, private digest, model-run payload, contact data, API key or private-data fallback belongs there. Direct requests for `data/private.json` must fail. Check that published source URLs and short excerpts are first-party public evidence, and that additional copied files expose no other private names or quotes.

Owner-private hosting must provide real access control. The public pulse inside a private application is a presentation view, not a promise that the surrounding private payload has disappeared from an authorized viewer's browser.

## Spend and model checks

Inspect request payloads and SQLite `runs`. Every LLM call should use OpenRouter, have at least two eligible models, and retain the actual served model and cost. Check unsupported JSON parameters, unavailable catalog models, missing usage, timeouts, concurrent reservations, weekly rollover, retries and unknown-cost states. Failed requests may be billable; an unreconciled request should block subsequent spend. Observing a different model alias does not prove a fallback.

External research sources must be citations returned by a real search or separately fetched pages. This run did not validate successful external account research through the optional legacy `--web` path; the default qualification review uses supplied evidence. A model's prose is not verification. A completed API call with no useful annotations is not successful account research.

## Current scope limits

The public evidence pack is a selected demonstration, not the full private queue or a live company-research endpoint. It does not improve measured territory coverage merely by adding CLI/API/MCP access. Snapshot creation, source retrieval/review, publication time and impact onset have different meanings. Source-reviewed records are deliberately protected from unreviewed feed replacement; a future monitoring product needs explicit rechecks and changed-source review invalidation.

The curated demonstration reviewed 22 companies and 26 historical incident records. Eighteen companies have provider-attributed records under the documented rubric; this includes explicitly marked capacity/rate-limit and title-only cases. The stricter count may be lower if requiring confirmed product impact, independently corroborated upstream outage, or recent 90-day evidence. Four additional companies are warning, mention or access-change review cases. The 20-company core target is not claimed as met by this review.

The original source breadth and phase counts must be judged from the final coverage export. A requested 180-day collection window does not establish complete coverage. The project does not establish enterprise fit, current purchasing intent, named stakeholders, build-versus-buy evidence, or existing-customer status without additional sources. Deterministic drafts and OpenRouter-assisted drafts are distinguished. Drafts are never sent.

Existing products cover status aggregation and dependency mapping. The intended contribution is the evidence-to-qualified-account workflow. No assertion is made about which tools OpenRouter already uses internally.

A review should report actionable failures with a source record, the unsupported output, and a minimal reproduction. Prefer a smaller defensible dataset over an inflated acceptance count.

## Replay interpretation

The first source-checked replay association uses an exact upstream incident URL cited in the downstream report. Its timeline compares publication timestamps. That establishes reporting order and a direct source association, not the onset of customer impact or failure propagation. The downstream warning is conditional; preserve that wording. One association is useful demonstration evidence, not completion of the three-replay target.

## Current independent evidence-interface review

The reviewer froze a public-only verdict before local inspection, then exercised the new standard-library CLI in a clean copy. All 22 checks passed: six known accounts, normalization, uncovered/lookalike inputs, invalid domain forms, search/status and fail-closed missing/tampered snapshots. Two incident/documentation pairs were independently refetched from their first-party sources. The frontend change passed 12 frontend tests, syntax checks and both local site builds. See [reviews/BLIND_REVIEW.md](reviews/BLIND_REVIEW.md) for the critique and scope of validation.

The final SDK-enabled suite passed **36/36 Python tests with zero skips**; without the optional MCP dependency, the three SDK tests skip. The implementation agent also completed an actual MCP 2.3.0 SDK stdio initialize/list-tools/call-tools smoke check: exactly three read-only tools, structured known and `not_covered` lookups, search and snapshot status. An installed wheel's bundled pack, CLI and stdio server worked from an unrelated temporary working directory. All six published account records validated against the full account JSON schema in that environment.

After publication, GET `/llms.txt`, follow its manifest/index links, retrieve an indexed account JSON and verify an unindexed account path returns HTTP404. Check record digests against the index and ensure `/data/private.json` is unavailable. An outside-index HTTP404 is a coverage boundary, not a company finding. Record actual hosted responses in the operational handoff; a local build alone proves no deployment result. A static JSON API is not a hosted MCP server.

One actual model critique used the current-catalog `google/gemini-3.8-flash` through the existing OpenRouter client. Its reported cost was $0.00743925, with a $0.06036 reservation below the authorized $0.08 increment. No retry was used. Shared accounting then totaled 14 requests and $0.025190728. The public review quotes its verdict and corrects unsupported assertions; its raw prompt, response and provenance are retained in ignored `private/review/`. No Grok, Dot, customer or sales-team review is claimed.

## Previous independent verification snapshot

At the earlier November 5, 2026 checkpoint, the separate audit passed 19 Python tests and six frontend tests, plus syntax checks. Additional isolated checks verified provider-scoped attribution, preservation of reviewed timestamps through feed updates, stale assisted-draft replacement after changed evidence, unknown-cost blocking across week boundaries, single-ask copy validation, and no named evidence in the then-aggregate-only artifact. No unresolved software blocker remained in those audited paths. The four-account qualification integration was present. One Sonnet 5.5 sequence passed validation for human review; an agent source edit removed an unsupported inference about the historical key mode. The six-account public projection is a later explicit publication exception.

The measured pilot remains below the original numerical acceptance targets. Do not confuse passing the software checks with complete source coverage, commercial qualification, 40 external account investigations, or three independently source-checked replays.
