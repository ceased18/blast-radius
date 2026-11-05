"""Read-only, standard-library interface to the published evidence snapshot.

No environment file, SQLite database, collector, model provider, HTTP client, or
caller credential is used here. A lookup is a local snapshot read, not enrichment.
"""
from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from .public_pack import AUTHORIZED_DOMAINS

ROOT = Path(__file__).resolve().parents[1]
_CHECKOUT_SNAPSHOT = ROOT / "public-evidence"
_INSTALLED_SNAPSHOT = Path(sys.prefix) / "share/blast-radius/public-evidence"
DEFAULT_SNAPSHOT = _CHECKOUT_SNAPSHOT if (_CHECKOUT_SNAPSHOT / "api/v1/manifest.json").is_file() else _INSTALLED_SNAPSHOT
SCOPE = "bounded_public_evidence_snapshot"
ACCOUNT_KEYS = frozenset({"schema_version", "snapshot_id", "record_status", "scope", "domain", "name", "status_url", "source_text_policy", "coverage", "evidence", "qualification", "what_it_proves", "what_it_does_not_prove", "open_questions"})
PRIVATE_KEYS = frozenset({"outreach", "emails", "email", "brief", "ae_brief", "personas", "runs", "raw", "payload", "phone", "phone_number", "linkedin_note", "call_opener", "api_key", "authorization"})


class SnapshotError(ValueError):
    """The configured public pack could not be read safely; never use private fallback."""


def normalize_domain(value):
    if not isinstance(value, str) or not value or len(value) > 253:
        raise ValueError("Use a bare company domain, such as glean.com")
    domain = value.strip().lower().removesuffix(".")
    if domain.startswith("www."):
        domain = domain[4:]
    if not re.fullmatch(r"(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}", domain):
        raise ValueError("Use a bare ASCII company domain; URLs, paths, ports and email addresses are not accepted")
    try:
        ipaddress.ip_address(domain)
    except ValueError:
        return domain
    raise ValueError("A company domain is required, not an IP address")


def _private_content(value):
    if isinstance(value, dict):
        keys = {str(key).casefold() for key in value}
        private_name = any(re.search(r"(?:^|_)(?:outreach|email|phone|brief|secret|api_key|authorization|private)(?:$|_)", key) for key in keys)
        return bool(PRIVATE_KEYS.intersection(keys)) or private_name or any(_private_content(v) for v in value.values())
    if isinstance(value, list):
        return any(_private_content(v) for v in value)
    return isinstance(value, str) and bool(re.search(r"sk-or-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{12,}", value))


def _iso(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def _contract_shape(value, schema):
    """Reject extra/missing nested fields without a runtime schema dependency.

    This enforces the published object/array shape. Full JSON Schema validation
    (including timestamp formats and enums) is run in the optional SDK test env.
    """
    if "anyOf" in schema:
        return any(_contract_shape(value, option) for option in schema["anyOf"])
    expected = schema.get("type")
    if expected == "null":
        return value is None
    if expected == "object":
        properties = schema["properties"]
        return isinstance(value, dict) and set(value) == set(properties) and all(_contract_shape(value[key], child) for key, child in properties.items())
    if expected == "array":
        return isinstance(value, list) and all(_contract_shape(item, schema["items"]) for item in value)
    return True


class Snapshot:
    """A fixed public directory. Domain inputs are keys, never network targets."""

    def __init__(self, root=None):
        selected = Path(root) if root is not None else DEFAULT_SNAPSHOT
        api = selected / "api/v1"
        self.root = (api if (api / "manifest.json").is_file() else selected).resolve()
        self.manifest = self._load("manifest.json")
        self.index = self._load("accounts/index.json")
        if self.manifest.get("scope") != SCOPE or self.index.get("scope") != SCOPE:
            raise SnapshotError("The configured data is not a public evidence snapshot")
        if self.manifest.get("schema_version") != "1.0" or self.index.get("snapshot_id") != self.manifest.get("snapshot_id"):
            raise SnapshotError("Unsupported or inconsistent snapshot version")
        entries = self.index.get("accounts")
        domains = self.manifest.get("account_domains")
        if not isinstance(entries, list) or not isinstance(domains, list) or not 1 <= len(entries) <= 20:
            raise SnapshotError("Invalid bounded account index")
        self.entries = {}
        for entry in entries:
            domain = normalize_domain(entry.get("domain", ""))
            if domain in self.entries or entry.get("path") != f"accounts/{domain}.json":
                raise SnapshotError("Invalid account path or duplicate domain")
            if not re.fullmatch(r"[a-f0-9]{64}", entry.get("content_sha256", "")):
                raise SnapshotError("Missing account content digest")
            self.entries[domain] = entry
        if set(domains) != set(self.entries) or set(domains) != AUTHORIZED_DOMAINS or self.manifest.get("account_count") != len(entries):
            raise SnapshotError("Manifest and account index disagree")

    def _bytes(self, relative):
        path = self.root / relative
        resolved = path.resolve()
        if self.root not in resolved.parents or not path.is_file() or path.stat().st_size > 256_000:
            raise SnapshotError("Snapshot file is missing or outside the bounded public pack")
        return path.read_bytes()

    def _load(self, relative):
        try:
            result = json.loads(self._bytes(relative))
        except (OSError, ValueError, UnicodeError) as exc:
            raise SnapshotError("Could not load the configured public snapshot") from exc
        if not isinstance(result, dict) or _private_content(result):
            raise SnapshotError("Snapshot contains an unexpected or private field")
        return result

    def lookup(self, domain):
        try:
            key = normalize_domain(domain)
        except ValueError as exc:
            return {"schema_version": "1.0", "record_status": "invalid_query", "message": str(exc), "network_request_performed": False}
        entry = self.entries.get(key)
        if entry is None:
            return {
                "schema_version": "1.0",
                "snapshot_id": self.manifest["snapshot_id"],
                "record_status": "not_covered",
                "scope": SCOPE,
                "domain": key,
                "message": "This company is not in the deliberately selected public snapshot.",
                "what_it_does_not_prove": ["No evidence of no outages, no pain, absent fallback, or no commercial opportunity.", "No live research or enrichment was performed."],
                "available_index": "accounts/index.json",
                "network_request_performed": False,
            }
        content = self._bytes(entry["path"])
        if hashlib.sha256(content).hexdigest() != entry["content_sha256"]:
            raise SnapshotError("Account file does not match the published snapshot digest")
        record = self._load(entry["path"])
        from .agent_schema import ACCOUNT
        if set(record) != ACCOUNT_KEYS or not _contract_shape(record, ACCOUNT) or record.get("scope") != SCOPE or record.get("record_status") != "in_snapshot" or record.get("domain") != key or record.get("snapshot_id") != self.manifest["snapshot_id"]:
            raise SnapshotError("Account does not match the public response contract")
        return record

    def search(self, query="", limit=10):
        if not isinstance(query, str) or len(query) > 120 or re.search(r"[\x00-\x1f]|sk-or-", query, re.I) or not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 20:
            return {"schema_version": "1.0", "record_status": "invalid_query", "message": "Use a text query of at most 120 characters and a limit from 1 to 20.", "network_request_performed": False}
        term = query.strip().casefold()
        # Exact substring search over six published names/domains, not entity resolution.
        found = [e for e in self.entries.values() if term in e["name"].casefold() or term in e["domain"]]
        return {
            "schema_version": "1.0",
            "snapshot_id": self.manifest["snapshot_id"],
            "scope": SCOPE,
            "record_status": "snapshot_search_results",
            "query": query,
            "match_count": len(found),
            "results": found[:limit],
            "coverage_note": "Searches only selected public snapshot names and domains; zero results does not mean no outages or no opportunity.",
            "network_request_performed": False,
        }

    def status(self, now=None):
        now = now or datetime.now(timezone.utc)
        created = _iso(self.manifest["snapshot_created_at"])
        oldest = _iso(self.manifest["freshness"].get("oldest_source_check_at"))
        return {
            "schema_version": "1.0",
            "snapshot_id": self.manifest["snapshot_id"],
            "scope": SCOPE,
            "status": "frozen_snapshot; not_live_monitoring",
            "snapshot_created_at": self.manifest["snapshot_created_at"],
            "read_at": now.isoformat(),
            "snapshot_age_hours": round(max(0, (now - created).total_seconds() / 3600), 2),
            "oldest_source_check_at": self.manifest["freshness"].get("oldest_source_check_at"),
            "oldest_source_check_age_hours": round(max(0, (now - oldest).total_seconds() / 3600), 2) if oldest else None,
            "automatic_refresh": False,
            "account_count": len(self.entries),
            "evidence_count": self.manifest["evidence_count"],
            "qualification_checked_accounts": sum(e["qualification_status"] == "first_party_documentation_checked" for e in self.entries.values()),
            "limitations": self.manifest["limitations"],
            "source_text_policy": self.manifest["source_text_policy"],
            "network_request_performed": False,
            "credentials_required": False,
        }


def execute(command, target=None, snapshot_root=None, limit=10):
    """Structured errors; never fall back to private records or a live URL."""
    try:
        snapshot = Snapshot(snapshot_root)
        return {"lookup": lambda: snapshot.lookup(target), "search": lambda: snapshot.search(target or "", limit), "status": snapshot.status}[command]()
    except (SnapshotError, OSError, ValueError, KeyError):
        return {"schema_version": "1.0", "record_status": "snapshot_unavailable", "message": "The configured public snapshot could not be loaded. No private data or live-source fallback was attempted.", "network_request_performed": False}


def main(argv=None):
    parser = argparse.ArgumentParser(description="Read a bounded public evidence snapshot. No API key, live research, or CRM access.")
    parser.add_argument("command", choices=["lookup", "search", "status"])
    parser.add_argument("target", nargs="?")
    parser.add_argument("--snapshot-root", type=Path)
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args(argv)
    result = execute(args.command, args.target, args.snapshot_root, args.limit)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 2 if result.get("record_status") in {"invalid_query", "snapshot_unavailable"} else 0


if __name__ == "__main__":
    raise SystemExit(main())
