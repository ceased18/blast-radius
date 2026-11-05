"""A provider name is evidence of a mention, not proof of provider causality."""
from __future__ import annotations
import json
import re
from datetime import datetime
from .store import stable_id,connect

PATTERNS={"azure":r"\bazure\s+(?:openai|ai|foundry)\b","bedrock":r"\b(?:aws\s+|amazon\s+)?bedrock\b","openai":r"\bopen\s?ai\b|\bgpt(?:[-\s]?\d[\w.-]*)?\b|\bchatgpt\b","anthropic":r"\banthropic\b|\bclaude(?:[-\s][\w.-]+)?\b","google":r"\bgemini\b|\bvertex\s+ai\b|\bgoogle\s+ai\b","mistral":r"\bmistral\b"}
AI_COMPONENT=re.compile(r"\bAI\b|\bLLM\b|copilot|assistant|chatbot|generative|inference|language model",re.I)
UPSTREAM=re.compile(r"\bupstream\b|third.party|(?:caused|due to|because of|stemming from|result of|related to).{0,100}(?:outage|degrad|disrupt|incident|error|issue)|(?:openai|anthropic|claude|gemini|mistral|bedrock).{0,80}(?:experiencing|outage|degrad|disrupt|unavailable|incident)|(?:outage|degrad|disrupt).{0,70}(?:openai|anthropic|claude|gemini|mistral|bedrock)",re.I|re.S)
INTERNAL=re.compile(r"(?:caused by|due to|root cause|introduced by).{0,45}(?:our deploy|our code|our configuration|internal|routing issue)|routing issue.{0,40}introduced.{0,40}deploy|(?:our deploy|our release|our code change).{0,40}(?:introduced|caused)",re.I|re.S)
NEGATED=re.compile(r"(?:not affected|unaffected|no impact|not impacted|not experiencing|no issues|not (?:caused by|related to))",re.I)
HEALTHY=re.compile(r"(?:remain(?:s)?|are|is|were|was).{0,15}(?:healthy|available|operational|unaffected)",re.I)
MITIGATION=re.compile(r"(?:switch(?:ing)?|alternative|workaround|instead|other (?:model|provider)|continue (?:using|to use)|use .{0,20}(?:instead|until))",re.I)

def evidence(text,title=""):
    body=title+"\n"+text
    results=[]
    for pid,pattern in PATTERNS.items():
        hits=list(re.finditer(pattern,body,re.I))
        if not hits:continue
        # Azure OpenAI must not also be silently counted as direct OpenAI attribution.
        if pid=="openai" and re.search(PATTERNS["azure"],body,re.I) and not re.search(r"(?<!azure )\bopenai\b",body,re.I):continue
        clauses=re.split(r"(?<=[.!?])\s+|\n+|\bwhile\b|\bwhereas\b|\bbut\b|;",body,flags=re.I)
        relevant=[s.strip() for s in clauses if re.search(pattern,s,re.I)]
        quote=next((s for s in relevant if UPSTREAM.search(s) and not NEGATED.search(s)),relevant[0] if relevant else title)
        blamed=[s for s in relevant if UPSTREAM.search(s) and not NEGATED.search(s) and not HEALTHY.search(s) and not MITIGATION.search(s)]
        if INTERNAL.search(body):cause="internal"
        elif pid=="openai" and any(re.search(PATTERNS["bedrock"]+"|"+PATTERNS["azure"],s,re.I) for s in blamed) and not any(re.search(r"openai (?:is|are|was|were).{0,30}(?:experiencing|down|unavailable)",s,re.I) for s in blamed):cause="provider_mentioned"
        elif blamed:cause="provider_attributed"
        elif any(MITIGATION.search(s) for s in relevant):cause="mitigation_mentioned"
        else:cause="provider_mentioned"
        if all(NEGATED.search(s) or HEALTHY.search(s) for s in relevant):cause="unaffected"
        results.append({"provider_id":pid,"evidence_type":"named","cause_status":cause,"quote":quote[:1400],"confidence":"explicit attribution" if cause=="provider_attributed" else "mention only; causality not established"})
    return results

def closest_provider(incident,providers,pid):
    # Only exact incident onset can support an onset lag; RSS publication is not onset.
    raw=json.loads(incident["raw"])
    if not incident["started_at"]:return None,None
    if raw.get("timestamp_basis") not in {None,"incident onset","explicit_impact_window"}:return None,None
    start=datetime.fromisoformat(incident["started_at"])
    options=[]
    for p in providers:
        if p["provider_id"]!=pid:continue
        praw=json.loads(p["raw"])
        if praw.get("timestamp_basis") not in {None,"incident onset","explicit_impact_window"}:continue
        lag=(start-datetime.fromisoformat(p["started_at"])).total_seconds()/60
        if -30<=lag<=180:options.append((abs(lag),p["id"],round(lag,2)))
    if not options:return None,None
    _,iid,lag=min(options)
    return iid,lag

def classify(db_path=None):
    db=connect(db_path)
    providers=db.execute("SELECT * FROM incidents WHERE kind='provider'").fetchall()
    downstream=db.execute("SELECT * FROM incidents WHERE kind='downstream'").fetchall()
    db.execute("DELETE FROM matches")
    for inc in downstream:
        raw=json.loads(inc["raw"])
        if raw.get("source_verified") is True and raw.get("classification") and raw.get("provider") in PATTERNS:
            matches=[{"provider_id":raw["provider"],"evidence_type":raw.get("evidence_type","named"),"cause_status":raw["classification"],"quote":raw.get("quote",inc["body"]),"confidence":"source-checked attribution; agent reviewed" if raw["classification"]=="provider_attributed" else "source-checked caution; not provider-caused evidence"}]
        else:matches=evidence(inc["body"],inc["title"])
        # Preserve cause status in raw evidence, not an unsupported binary causal edge.
        raw["provider_evidence"]=matches
        db.execute("UPDATE incidents SET raw=? WHERE id=?",(json.dumps(raw,ensure_ascii=False),inc["id"]))
        for match in matches:
            if match["cause_status"] in {"internal","unaffected"}:continue
            upstream,lag=closest_provider(inc,providers,match["provider_id"])
            direct=raw.get("direct_link_evidence")
            if direct:
                linked=next((p for p in providers if p["url"]==direct["provider_incident_url"] and p["provider_id"]==match["provider_id"]),None)
                if linked:upstream,lag=linked["id"],None
            db.execute("INSERT OR REPLACE INTO matches VALUES(?,?,?,?,?,?,?,?,?)",(stable_id(inc["id"],match["provider_id"]),inc["id"],match["provider_id"],upstream,match["evidence_type"],match["quote"],lag,match["confidence"],"deterministic-rules-v1"))
        if not matches and AI_COMPONENT.search(inc["title"]+inc["body"]):
            for pid in PATTERNS:
                upstream,lag=closest_provider(inc,providers,pid)
                if upstream:
                    db.execute("INSERT OR IGNORE INTO matches VALUES(?,?,?,?,?,?,?,?,?)",(stable_id(inc["id"],pid),inc["id"],pid,upstream,"correlated",inc["title"],lag,"temporal overlap only; no causal attribution","deterministic-rules-v1"))
    db.commit()
    counts=[dict(row) for row in db.execute("SELECT evidence_type,count(*) count FROM matches GROUP BY evidence_type")]
    print(json.dumps({"matching":counts}));db.close();return counts
