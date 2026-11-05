from __future__ import annotations
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def utcnow():
    return datetime.now(timezone.utc).isoformat()

def stable_id(*parts):
    return hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()[:20]

def connect(path=None):
    path = Path(path or ROOT / "data/blast.db")
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=60)
    db.row_factory = sqlite3.Row
    db.executescript("""
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, name TEXT NOT NULL, domain TEXT UNIQUE NOT NULL, status_url TEXT, payload TEXT NOT NULL DEFAULT '{}');
    CREATE TABLE IF NOT EXISTS incidents(id TEXT PRIMARY KEY, account_id TEXT, provider_id TEXT, kind TEXT NOT NULL, title TEXT NOT NULL, started_at TEXT, resolved_at TEXT, url TEXT NOT NULL, body TEXT NOT NULL, raw TEXT NOT NULL, collected_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS incident_kind ON incidents(kind,started_at);
    CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, provider_id TEXT NOT NULL, provider_incident_id TEXT, evidence_type TEXT NOT NULL, quote TEXT NOT NULL, lag_minutes REAL, confidence TEXT NOT NULL, classifier TEXT NOT NULL, UNIQUE(incident_id,provider_id));
    CREATE TABLE IF NOT EXISTS probes(domain TEXT PRIMARY KEY, name TEXT, status_url TEXT, state TEXT NOT NULL, detail TEXT, checked_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sources(url TEXT PRIMARY KEY, name TEXT NOT NULL, state TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, earliest_at TEXT, latest_at TEXT, detail TEXT, checked_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cache(url TEXT PRIMARY KEY, status INTEGER NOT NULL, body TEXT NOT NULL, content_type TEXT, fetched_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, created_at TEXT NOT NULL, task TEXT NOT NULL, primary_model TEXT, served_model TEXT, cost_usd REAL, reserved_usd REAL NOT NULL DEFAULT 0, status TEXT NOT NULL, generation_id TEXT, payload TEXT NOT NULL DEFAULT '{}');
    """)
    if any(col["name"]=="started_at" and col["notnull"] for col in db.execute("PRAGMA table_info(incidents)")):
        db.executescript("""BEGIN IMMEDIATE;
        ALTER TABLE incidents RENAME TO incidents_old;
        CREATE TABLE incidents(id TEXT PRIMARY KEY, account_id TEXT, provider_id TEXT, kind TEXT NOT NULL, title TEXT NOT NULL, started_at TEXT, resolved_at TEXT, url TEXT NOT NULL, body TEXT NOT NULL, raw TEXT NOT NULL, collected_at TEXT NOT NULL);
        INSERT INTO incidents SELECT * FROM incidents_old;
        DROP TABLE incidents_old;
        CREATE INDEX IF NOT EXISTS incident_kind ON incidents(kind,started_at);
        COMMIT;""")
    return db

def put_account(db, name, domain, status_url=None):
    domain = domain.lower().removeprefix("www.").strip("/")
    aid = stable_id(domain)
    db.execute("INSERT INTO accounts(id,name,domain,status_url) VALUES(?,?,?,?) ON CONFLICT(domain) DO UPDATE SET name=excluded.name,status_url=COALESCE(excluded.status_url,accounts.status_url)", (aid, name, domain, status_url))
    db.commit()
    return aid

def insert_incident(db, incident, kind="downstream", account_id=None, provider_id=None):
    existing=db.execute("SELECT id,raw FROM incidents WHERE kind=? AND url=?",(kind,incident["url"])).fetchone()
    iid = existing["id"] if existing else stable_id(kind, incident["url"])
    if existing and json.loads(existing["raw"]).get("source_verified") and not incident.get("source_verified"):
        return iid
    db.execute("INSERT INTO incidents(id,account_id,provider_id,kind,title,started_at,resolved_at,url,body,raw,collected_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,started_at=excluded.started_at,resolved_at=excluded.resolved_at,body=excluded.body,raw=excluded.raw,collected_at=excluded.collected_at", (iid, account_id, provider_id, kind, incident["title"], incident["started_at"], incident.get("resolved_at"), incident["url"], incident.get("body", incident.get("quote", "")), json.dumps(incident,ensure_ascii=False), utcnow()))
    db.commit()
    return iid

def source(db, url, name, state, count=0, earliest=None, latest=None, detail=""):
    db.execute("INSERT OR REPLACE INTO sources VALUES(?,?,?,?,?,?,?,?)",(url,name,state,count,earliest,latest,detail,utcnow()))
    db.commit()

def account_payload(db, aid, payload):
    db.execute("UPDATE accounts SET payload=? WHERE id=?", (json.dumps(payload,ensure_ascii=False),aid))
    db.commit()
