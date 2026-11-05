"""Bounded non-streaming OpenRouter client. Unknown spend blocks future paid calls."""
from __future__ import annotations
import json
import os
import uuid
import math
import re
from datetime import datetime,timezone,timedelta
import httpx
from dotenv import load_dotenv
from .store import ROOT,connect,utcnow

DOCS={"models":"https://openrouter.ai/docs/api/api-reference/models/get-models","fallbacks":"https://openrouter.ai/docs/guides/routing/model-fallbacks","routing":"https://openrouter.ai/docs/guides/routing/provider-selection","plugins":"https://openrouter.ai/docs/guides/features/plugins/overview","usage":"https://openrouter.ai/docs/guides/guides/usage-accounting"}

class BudgetStop(RuntimeError):pass

def week_start():
    now=datetime.now(timezone.utc)
    return (now-timedelta(days=now.weekday())).replace(hour=0,minute=0,second=0,microsecond=0).isoformat()

def reserve(db_path,task,amount,primary):
    db=connect(db_path)
    db.execute("BEGIN IMMEDIATE")
    unresolved=db.execute("SELECT count(*) FROM runs WHERE status IN ('pending','unknown_cost')").fetchone()[0]
    rows=db.execute("SELECT cost_usd,reserved_usd,status FROM runs WHERE created_at>=?",(week_start(),)).fetchall()
    if unresolved:
        db.rollback();db.close();raise BudgetStop("Unreconciled paid request exists; reconcile actual cost before continuing")
    committed=sum(row["cost_usd"] if row["cost_usd"] is not None else row["reserved_usd"] for row in rows)
    cap=float(os.getenv("BLAST_WEEKLY_BUDGET_USD","0.50"))
    if not math.isfinite(cap) or not math.isfinite(amount) or cap<=0:raise BudgetStop("Invalid budget configuration")
    if amount<=0 or committed+amount>cap:
        db.rollback();db.close();raise BudgetStop(f"Weekly budget would be exceeded (${committed:.4f} committed; ${cap:.2f} cap)")
    rid=str(uuid.uuid4())
    db.execute("INSERT INTO runs(id,created_at,task,primary_model,reserved_usd,status) VALUES(?,?,?,?,?,'pending')",(rid,utcnow(),task,primary,amount));db.commit();db.close();return rid

class Router:
    def __init__(self,db_path=None):
        load_dotenv(ROOT/".env",override=False)
        self.key=os.getenv("OPENROUTER_API_KEY","")
        if not self.key:raise RuntimeError("OPENROUTER_API_KEY is not configured; deterministic mode remains available")
        self.db_path=db_path
        self.client=httpx.Client(timeout=90,headers={"Authorization":f"Bearer {self.key}","HTTP-Referer":os.getenv("BLAST_REFERER","https://localhost/blast-radius"),"X-Title":"Blast Radius","Content-Type":"application/json"})
        response=self.client.get("https://openrouter.ai/api/v1/models");response.raise_for_status()
        self.models=response.json()["data"]

    def choices(self,task):
        supported=[m for m in self.models if m.get("architecture",{}).get("output_modalities",["text"])==["text"] and "response_format" in m.get("supported_parameters",[]) and ":" not in m["id"] and not any(x in m["id"] for x in ["thinking","preview","banana","omni"]) ]
        def cost(m):return float(m.get("pricing",{}).get("prompt","999"))*6000+float(m.get("pricing",{}).get("completion","999"))*1200
        # Bounded family choice: newest low-cost text model per family, not a stale hardcoded ID.
        pools=[]
        families={"classify":["qwen/","google/","anthropic/"],"research":["google/","openai/","anthropic/"],"write":["anthropic/","openai/","google/"]}
        for family in families.get(task,families["classify"]):
            ceilings={"classify":(0.5,2),"research":(2,8),"write":(2,10)}.get(task,(1,5))
            options=[m for m in supported if m["id"].startswith(family) and cost(m)<=0.045 and float(m["pricing"]["prompt"])*1_000_000<=ceilings[0] and float(m["pricing"]["completion"])*1_000_000<=ceilings[1] and not any(x in m["id"] for x in ["audio","image","vision","embedding"])]
            if options:
                if task=="write" and family=="anthropic/" and any("sonnet" in m["id"] for m in options):options=[m for m in options if "sonnet" in m["id"]]
                options.sort(key=lambda m:(-int(m.get("created",0)),cost(m)))
                pools.append(options[0])
        override=os.getenv(f"BLAST_{task.upper()}_MODEL","")
        if override:
            requested=next((m for m in supported if m["id"]==override),None)
            if not requested or cost(requested)>0.045:raise BudgetStop("Configured model absent, unsupported, or above per-call cost rail")
            pools=[requested]+[m for m in pools if m["id"]!=override]
        if len(pools)<2:raise BudgetStop("Could not discover two supported models within price rail")
        return pools[:2]

    def complete(self,task,messages,max_tokens=900,web=False):
        models=self.choices(task)
        # A byte bound is conservative for these UTF-8 prompts. Add schema/header overhead.
        prompt_bound=len(json.dumps(messages,ensure_ascii=False).encode())+1500
        if prompt_bound>20000:raise BudgetStop("Prompt exceeds configured bounded input size")
        max_prompt=max(float(m["pricing"]["prompt"]) for m in models)*1_000_000
        max_completion=max(float(m["pricing"]["completion"]) for m in models)*1_000_000
        if not all(math.isfinite(x) and x>=0 for x in [max_prompt,max_completion]):raise BudgetStop("Invalid model pricing")
        estimate=max_prompt/1_000_000*prompt_bound+max_completion/1_000_000*max_tokens
        # Web plugin max_results=1 reserves $0.005/search + ample provider/model overhead.
        reserve_amount=max(0.015,estimate*2)+(0.025 if web else 0)
        if reserve_amount>0.08:raise BudgetStop("Request reserve exceeds $0.08 single-call guard")
        rid=reserve(self.db_path,task,reserve_amount,models[0]["id"])
        payload={"models":[m["id"] for m in models],"messages":messages,"max_tokens":max_tokens,"usage":{"include":True},"response_format":{"type":"json_object"},"provider":{"require_parameters":True,"max_price":{"prompt":max_prompt,"completion":max_completion}}}
        if task=="write" and all("structured_outputs" in m.get("supported_parameters",[]) for m in models):
            payload["response_format"]={"type":"json_schema","json_schema":{"name":"outreach","strict":True,"schema":{"type":"object","properties":{"emails":{"type":"array","minItems":3,"maxItems":3,"items":{"type":"object","properties":{"step":{"type":"integer"},"subject":{"type":"string"},"body":{"type":"string"}},"required":["step","subject","body"],"additionalProperties":False}},"call_opener":{"type":"string"},"linkedin_note":{"type":"string"}},"required":["emails","call_opener","linkedin_note"],"additionalProperties":False}}}
        if all("reasoning" in m.get("supported_parameters",[]) for m in models):
            payload["reasoning"]={"enabled":False} if task=="classify" else {"effort":"minimal"}
        if task=="classify":payload["provider"]["sort"]="price"
        if web:payload["plugins"]=[{"id":"web","max_results":1}]
        db=connect(self.db_path)
        try:
            response=self.client.post("https://openrouter.ai/api/v1/chat/completions",json=payload)
            if response.status_code>=400:
                # Capture only server error code/message, never request headers or input text.
                try:
                    err=response.json().get("error",{})
                    detail={"http_status":response.status_code,"error_code":err.get("code"),"error_message":str(err.get("message",""))[:300]}
                except ValueError:detail={"http_status":response.status_code}
                db.execute("UPDATE runs SET payload=? WHERE id=?",(json.dumps(detail),rid));db.commit()
            response.raise_for_status()
            result=response.json();usage=result.get("usage",{});cost=usage.get("cost")
            if cost is None:
                # Generation cost is authoritative, not a local token-price guess.
                generation=self.client.get("https://openrouter.ai/api/v1/generation",params={"id":result.get("id")})
                if generation.status_code==200:cost=generation.json().get("data",{}).get("total_cost")
            message=result["choices"][0]["message"]
            if cost is not None and (not math.isfinite(float(cost)) or float(cost)<0):cost=None
            # Count only an exact served match to a requested fallback; aliases are not evidence.
            metadata={"usage":usage,"annotations":message.get("annotations",[]),"fallback_observed":result.get("model") in [m["id"] for m in models[1:]],"served_differs_primary":result.get("model")!=models[0]["id"],"requested_models":payload["models"],"web_enabled":web,"output_content":message.get("content"),"finish_reason":result["choices"][0].get("finish_reason")}
            db.execute("UPDATE runs SET served_model=?,cost_usd=?,status=?,generation_id=?,payload=? WHERE id=?",(result.get("model"),cost,"complete" if cost is not None else "unknown_cost",result.get("id"),json.dumps(metadata),rid));db.commit()
            if cost is None:raise BudgetStop("Actual cost missing from response and generation lookup; further paid work blocked")
            if not message.get("content"):
                metadata["output_status"]="missing_final_content"
                db.execute("UPDATE runs SET payload=? WHERE id=?",(json.dumps(metadata),rid));db.commit()
                raise ValueError("Model returned no final content within the output bound; actual cost was recorded")
            content=message["content"].strip()
            content=re.sub(r"^```(?:json)?\s*","",content,flags=re.I)
            content=re.sub(r"\s*```$","",content)
            try:parsed=json.loads(content)
            except json.JSONDecodeError:
                metadata["output_status"]="invalid_json"
                db.execute("UPDATE runs SET payload=? WHERE id=?",(json.dumps(metadata),rid));db.commit();raise
            if not isinstance(parsed,dict):raise ValueError("Expected a JSON object")
            metadata["output_status"]="valid_json; domain validation pending"
            db.execute("UPDATE runs SET payload=? WHERE id=?",(json.dumps(metadata),rid));db.commit()
            return {"content":parsed,"model":result.get("model"),"cost_usd":cost,"annotations":message.get("annotations",[]),"run_id":rid}
        except Exception:
            # Any sent request can have incurred cost, including timeouts; retain the reserve.
            db.execute("UPDATE runs SET status='unknown_cost' WHERE id=? AND status='pending'",(rid,));db.commit();raise
        finally:db.close()

    def close(self):self.client.close()
