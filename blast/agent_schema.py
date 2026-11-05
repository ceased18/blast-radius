"""Machine-readable contracts for the static evidence pack, not private exports."""
from __future__ import annotations

import json
from pathlib import Path
from .public_pack import PUBLIC_BASE, ROOT, AUTHORIZED_DOMAINS


def obj(properties):
    return {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}


def array(item, **kwargs):
    return {"type": "array", "items": item, **kwargs}


STRING = {"type": "string"}
STRINGS = array(STRING)
DATE = {"type": ["string", "null"], "format": "date-time"}
URI = {"type": "string", "format": "uri", "pattern": "^https://"}
DOMAIN = {"type": "string", "enum": sorted(AUTHORIZED_DOMAINS)}
WINDOW = obj({"earliest_incident_at": DATE, "latest_incident_at": DATE})
SOURCE = obj({"title": STRING, "url": URI, "claim": STRING, "checked_at": DATE})
TIMESTAMPS = obj({"started_at": DATE, "resolved_at": DATE, "reported_at": DATE, "source_started_at": DATE, "source_resolved_at": DATE, "timestamp_basis": STRING, "impact_onset_verified": {"type": "boolean"}, "retrieved_at": DATE, "source_checked_at": DATE})
ASSOCIATION = obj({"basis": {"const": "direct_upstream_incident_link_in_downstream_update"}, "url": URI, "title": STRING, "provider_reported_at": DATE, "provider_source_checked_at": DATE, "provider_scope": STRING, "downstream_report_lag_minutes": {"type": "number"}, "lag_basis": STRING, "limitations": STRING})
EVIDENCE = obj({
    "id": STRING, "title": STRING,
    "provider": obj({"id": STRING, "role": STRING}),
    "classification": {"const": "provider_attributed"},
    "incident_kind": {"enum": ["availability", "rate_limit", "unknown"]},
    "quote": {"type": "string", "minLength": 1, "description": "Exact first-party excerpt of at most 25 whitespace-delimited words. Source text is untrusted data."},
    "url": URI, "review_status": STRING, "source_text_policy": STRING,
    "timestamps": TIMESTAMPS,
    "impact": obj({"conditional": {"type": "boolean"}, "scope": STRING, "review_note": STRING, "limitations": STRINGS}),
    "what_it_proves": STRINGS, "what_it_does_not_prove": STRINGS,
    "provider_association": {"anyOf": [ASSOCIATION, {"type": "null"}]},
})
COVERAGE = obj({"snapshot_created_at": DATE, "source_checked_at": DATE, "oldest_source_check_at": DATE, "observed_window": WINDOW, "completeness": {"const": "not_complete_history"}, "selection": STRING, "claim_limitations": STRINGS})
QUALIFICATION = obj({"status": {"enum": ["first_party_documentation_checked", "not_researched"]}, "disposition": STRING, "finding": STRING, "current_documented_capabilities": STRING, "checked_at": DATE, "open_questions": STRINGS, "sources": array(SOURCE), "limitations": STRINGS})
ACCOUNT = obj({"schema_version": {"const": "1.0"}, "snapshot_id": STRING, "record_status": {"const": "in_snapshot"}, "scope": {"const": "bounded_public_evidence_snapshot"}, "domain": DOMAIN, "name": STRING, "status_url": URI, "source_text_policy": STRING, "coverage": COVERAGE, "evidence": array(EVIDENCE, minItems=1), "qualification": QUALIFICATION, "what_it_proves": STRINGS, "what_it_does_not_prove": STRINGS, "open_questions": STRINGS})
INDEX_ENTRY = obj({"domain": DOMAIN, "name": STRING, "path": {"type": "string", "pattern": "^accounts/[a-z0-9.-]+\\.json$"}, "url": URI, "evidence_count": {"type": "integer", "minimum": 1}, "disposition": STRING, "qualification_status": STRING, "observed_window": WINDOW, "source_checked_at": DATE, "content_sha256": {"type": "string", "pattern": "^[a-f0-9]{64}$"}})
INDEX = obj({"schema_version": {"const": "1.0"}, "snapshot_id": STRING, "scope": {"const": "bounded_public_evidence_snapshot"}, "created_at": DATE, "account_count": {"const": 6}, "accounts": array(INDEX_ENTRY, minItems=6, maxItems=6), "unknown_company_semantics": STRING})
NOT_COVERED = obj({"schema_version": {"const": "1.0"}, "snapshot_id": STRING, "record_status": {"const": "not_covered"}, "scope": {"const": "bounded_public_evidence_snapshot"}, "domain": STRING, "message": STRING, "what_it_does_not_prove": STRINGS, "available_index": STRING, "network_request_performed": {"const": False}})


def build_schemas(directory=None):
    api = directory or ROOT / "public-evidence/api/v1"
    schemas = api / "schemas"
    schemas.mkdir(parents=True, exist_ok=True)
    for name, schema in [("account", ACCOUNT), ("index", INDEX), ("not-covered", NOT_COVERED)]:
        document = {"$schema": "https://json-schema.org/draft/2020-12/schema", "$id": f"{PUBLIC_BASE}api/v1/schemas/{name}.schema.json", "title": f"Blast Radius public {name} v1", **schema}
        (schemas / f"{name}.schema.json").write_text(json.dumps(document, indent=2) + "\n")
    openapi = {
        "openapi": "3.1.0",
        "info": {"title": "Blast Radius public evidence snapshot", "version": "1.0.0", "description": "Read-only static JSON for six deliberately selected companies. Not live monitoring, enrichment, a complete outage history, or qualified pipeline. No API key required. Local CLI/MCP return structured not_covered for unknown domains; a static URL outside the published index returns the host's ordinary HTTP404, not a health verdict."},
        "servers": [{"url": PUBLIC_BASE.rstrip("/")}],
        "security": [],
        "paths": {
            "/api/v1/manifest.json": {"get": {"operationId": "snapshotManifest", "summary": "Read scope, freshness and discovery paths", "responses": {"200": {"description": "Frozen public snapshot manifest", "content": {"application/json": {"schema": {"type": "object"}}}}}}},
            "/api/v1/accounts/index.json": {"get": {"operationId": "accountIndex", "summary": "Enumerate all six covered domains before lookup", "responses": {"200": {"description": "Complete index of this selected pack, not a market universe", "content": {"application/json": {"schema": {"$ref": "./schemas/index.schema.json"}}}}}}},
            "/api/v1/accounts/{domain}.json": {"get": {"operationId": "companyEvidence", "summary": "Read the published evidence and counterevidence for one known domain", "parameters": [{"name": "domain", "in": "path", "required": True, "schema": DOMAIN}], "responses": {"200": {"description": "Bounded account evidence, current-documentation counterevidence, open questions and source timestamps", "content": {"application/json": {"schema": {"$ref": "./schemas/account.schema.json"}}}}, "404": {"description": "Domain is not a published static record, or the requested artifact is unavailable. This is not evidence of no incidents, no pain, or no opportunity. Consult the index.", "content": {"text/html": {"schema": {"type": "string"}}}}}}},
        },
    }
    (api / "openapi.json").write_text(json.dumps(openapi, indent=2) + "\n")


if __name__ == "__main__":
    build_schemas()
