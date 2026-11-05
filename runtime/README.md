# Blast Radius public PG plan runtime

A small public API and UI that research one account and seller through OpenRouter, then produce an evidence-backed account plan. The model must return three distinct pain or evidence-gap slots, three personas, up to three verified tools or none found, one initial value hypothesis, and an empty weekly goal. It does not generate outreach, enrich contacts, access CRM, rank accounts, or invent named people.

Production origin: [blast-radius-plans.alluringdoor.chatgpt.site](https://blast-radius-plans.alluringdoor.chatgpt.site). The original private dashboard is a separate Site and is not served by this Worker. Live generation can be disabled while cached results and public evidence remain readable.

## Public interface

- `GET /api/status` or `/api/v1/status`: generation availability, durable lifetime budget, cache count and reservation bound.
- `POST /api/v1/pg-plan` or `/api/pg-plan`: generate or retrieve one canonical account/seller plan.
- `GET /api/v1/pg-plan/{cache_key}` or `/api/pg-plan/{cache_key}`: read a cached result or processing state without another paid request.

Both path versions use the same cache key and ledger. No visitor credentials are required.

```json
{
  "account_domain": "glean.com",
  "seller": "OpenRouter",
  "seller_domain": "openrouter.ai"
}
```

A custom seller requires its official domain. Inputs are bounded company identifiers, never arbitrary prompts, model selections, tool arguments or fetch URLs. The Worker only sends outbound requests to fixed OpenRouter API endpoints; research domains become filters for OpenRouter's web-search tool, not direct network destinations.

Responses include `status`, `plan`, dated source metadata, actual served model and usage records, `request_id`, `cache_key`, and budget state. An unsuccessful research or validation result has `plan: null`; it is not replaced with a plan from memory. `research_incomplete` inside a valid plan means one or more of its three pain slots explicitly lacks sufficient evidence.

## Research and source boundaries

Two separate research calls restrict their source filters to exactly one company each: account, then seller. Each allows one search, so source coverage never depends on a model choosing both domains in one request. The research stage uses the `openrouter:web_search` server tool with Exa, bounded tool uses, results and excerpt length. Planning begins only after observed search usage and usable first-party citations for both account and seller. Both modern `server_tool_use_details` and older `server_tool_use` usage formats are recognized without double counting.

The six-company public evidence snapshot adds historical incidents and documented existing controls. It cannot substitute for live research. Current documentation does not prove the configuration used during an old incident or a present commercial opportunity.

Full bounded search highlights are intermediate server-side evidence. Public responses expose source URLs, titles, dates, paraphrased claims and at most 25 quoted words per page. Raw highlights are not returned in the public research envelope. This demo leaves persona names `Unknown`; functional titles are hypotheses rather than claims about identified employees. The shared `src/pg_contract.mjs` validates structure and provenance, not the semantic truth of every model inference.

Planning uses JSON-object wire mode with the full PG schema once in its prompt, followed by strict local structure/provenance validation. Documentation summaries are labelled notes and cannot be presented as verbatim primary-source quotes. Sanitized provider error details stay in private D1 call metadata, outside public responses.

This bounded public mode permits supported inferences or evidence gaps, not verified-pressure labels. Product capabilities alone do not establish adverse impact or missing controls. Backed slots cannot repeat the same normalized evidence claim set as three different pains, and the value hypothesis must state an explicit, uncertain condition rather than promise an outcome. These checks are necessary limits; a person must still review whether each inference follows from its cited facts.

## Lifetime demo budget

The approved public demo cap is **250,000 micro-USD ($0.25) for its lifetime**, including validation. It does not reset weekly. D1 is the authority; memory, cookies and browser storage are not budget controls.

A new job atomically reserves **170,000 micro-USD** using one conditional SQL insert. Only one paid job may be active. Canonical duplicate requests read the same processing or cached result, including across Worker instances. Completed jobs consume reported charges rounded up to integer micro-USD. Unknown outcomes retain their stored reservation and block new paid jobs. Earlier jobs retain the reservation recorded by their own version. A lower remaining balance can therefore prevent another run even when it is above zero; cached reads stay available.

The conservative request bound is 161,020 micro-USD:

| Component | Maximum reserved behavior |
| --- | --- |
| Research model work | Eight attempts: two company calls times two model passes times two fallback models; each has at most 40,960 context tokens and 1,500 output tokens, including reasoning |
| Research price ceilings | $0.25 per million input tokens and $0.50 per million output tokens |
| Search | Four Exa searches reserved across model fallbacks at $0.007 each |
| Planning model work | Two attempts; 24,100 input tokens including overhead allowance and 3,500 output tokens |
| Planning price ceilings | $0.50 per million input tokens and $3 per million output tokens |
| Repair | No automatic paid regeneration |

Research models are selected from the current catalog only when their context and supported parameters fit the bound. Planning's complete serialized UTF-8 request is capped at 20,000 bytes, with a conservative protocol overhead allowance. Provider fallback is disabled within each selected model; the request still carries two explicit model fallbacks. Prices are bounded using request `provider.max_price`, not merely catalog floors.

OpenRouter's [usage accounting documentation](https://openrouter.ai/docs/cookbook/administration/usage-accounting) defines `usage.cost` as the total amount charged to the account. Raw usage and generation IDs are retained for billing checks. First-use validation should also compare the settled dedicated-key usage delta against recorded call costs, including search charges.

## Build and migrations

```sh
npm ci
npm test
npm run build
npm run validate
```

The build embeds only the checked-in approved `public/` assets into one Worker ESM bundle. To synchronize a newer frontend, use `node scripts/build.mjs --static-source /absolute/path/to/dist-public`; a private build directory, private payload, symlink, unexpected public path, invalid six-company evidence digest, or credential-shaped content stops the build. The synchronized `public/` directory makes subsequent builds portable without the original frontend checkout.

Real deployment uses the native Sites source/publishing workflow and `.openai/hosting.json` with the Site's own ID, `d1: "DB"`, and no static binding. A sanitized source mirror intentionally omits Site identity; for local artifact review, create `.openai/hosting.json` containing `{"d1":"DB","r2":null}`. That is not enough to publish to an existing Site.

`db/schema.js` and `drizzle.config.js` generate the schema-only SQL and metadata under `drizzle/`. Sites packages and applies these migrations. Tables are never created or altered during request handling. Do not edit applied migration history.

## Runtime configuration

Set production values through Sites environment tools, never client files or source:

- `OPENROUTER_API_KEY`: server-side secret.
- `ADMIN_TOKEN`: separate random operator-only secret.
- `LIVE_GENERATION_ENABLED`: `0` for staging/operator validation; `1` permits the same bounded public pipeline.
- `APP_URL`: optional attribution URL; defaults to the production origin.

Public generation cannot bypass the durable cap. Operator generation bypasses only the public availability switch, not reservations, cache identity, source requirements, validation, pricing limits or accounting.

## Operator validation and reconciliation

`POST /api/admin/generate` uses the same generation pipeline while public generation is disabled. `POST /api/admin/reconcile` is separately authenticated and does not accept a caller-supplied charge or delete job history. `POST /api/admin/replan` can reuse completed live research from a reconciled failed job for at most 24 hours. Both company research calls and first-party source extracts must be present. It creates a normally reserved job under the current canonical revision, performs planning only, preserves original retrieval dates, and discloses `research.reused_from_cache_key`; it does not repeat paid searches. Historical snapshot context is reconstructed from the approved public pack.

Run `node scripts/operator-request.mjs` in a retained terminal, then supply one JSON line through hidden stdin. For generation, fields are `action: "generate"`, `admin_token`, `account_domain`, `seller`, and `seller_domain`. For reconciliation, use `action: "reconcile"`, `admin_token`, `cache_key`, and, where appropriate, `confirm_no_other_key_activity: true`. For a planning-only retry, use `action: "replan"`, `admin_token`, and the failed `cache_key`. Never place the token in shell arguments, source, screenshots or logs.

Reconciliation requires either an authoritative generation cost for a stored generation ID, or a known HTTP validation rejection plus an exact settled key-usage match to its pre-request baseline and known calls. The latter also requires the operator to confirm no other key activity. Timeouts without generation evidence cannot be zeroed through this path. Audit records and failed cache entries remain; no automatic paid retry follows reconciliation. A corrected pipeline revision can explicitly retry a failed account without erasing previous lifetime charges.

## Verification

The local suite covers shared PG schema/provenance rules, lifetime arithmetic and atomic reservations, duplicate requests and route aliases, actual-versus-reserved accounting, unavailable research, invalid plans, unknown billing, operator authentication and reconciliation, disabled public generation, primary-domain filtering, and both search-usage formats. These tests use simulated upstream responses; a real source-backed plan and live billing reconciliation must be checked separately before claiming successful live generation.
