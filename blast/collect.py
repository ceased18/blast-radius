from __future__ import annotations
import asyncio
import email.utils
import html
import json
import re
import xml.etree.ElementTree as ET
from datetime import datetime,timezone,timedelta
from urllib.parse import urlsplit,urljoin
from .http import PublicClient
from .store import ROOT,connect,put_account,insert_incident,source,utcnow

PROVIDERS=[
 {"id":"openai","name":"OpenAI","status_url":"https://status.openai.com","feeds":["https://status.openai.com/api/v2/incidents.json","https://status.openai.com/history.rss"]},
 {"id":"anthropic","name":"Anthropic","status_url":"https://status.claude.com","feeds":["https://status.anthropic.com/api/v2/incidents.json","https://status.anthropic.com/history.rss","https://status.claude.com/history.rss"]},
 {"id":"google","name":"Google Gemini / Vertex AI","status_url":"https://status.cloud.google.com","feeds":["https://status.cloud.google.com/incidents.json"]},
 {"id":"mistral","name":"Mistral","status_url":"https://status.mistral.ai","feeds":["https://status.mistral.ai/api/v2/incidents.json","https://status.mistral.ai/history.rss"]},
 {"id":"azure","name":"Azure OpenAI","status_url":"https://azure.status.microsoft","feeds":["https://status.azure.com/en-us/status/feed/"]},
 {"id":"bedrock","name":"AWS Bedrock","status_url":"https://health.aws.amazon.com","feeds":["https://status.aws.amazon.com/rss/bedrock-us-east-1.rss","https://health.aws.amazon.com/health/status/feed/bedrock-us-east-1.rss"]},
 {"id":"openrouter","name":"OpenRouter","status_url":"https://status.openrouter.ai","feeds":["https://status.openrouter.ai/api/v2/incidents.json","https://status.openrouter.ai/history.rss"]},
]

SEEDS=[("Pieces","pieces.app","https://status.pieces.app"),("Cursor","cursor.com","https://status.cursor.com"),("Replit","replit.com","https://status.replit.com"),("Notion","notion.so","https://status.notion.so"),("Intercom","intercom.com","https://www.intercomstatus.com"),("Linear","linear.app","https://linearstatus.com"),("Vercel","vercel.com","https://www.vercel-status.com"),("GitHub","github.com","https://www.githubstatus.com"),("Perplexity","perplexity.ai","https://status.perplexity.ai"),("Poe","poe.com","https://status.poe.com"),("Quora","quora.com","https://status.quora.com"),("Jasper","jasper.ai","https://status.jasper.ai"),("Copy.ai","copy.ai","https://status.copy.ai"),("Writer","writer.com","https://status.writer.com"),("Cohere","cohere.com","https://status.cohere.com"),("Glean","glean.com","https://status.glean.com"),("Hebbia","hebbia.ai","https://status.hebbia.ai"),("Harvey","harvey.ai","https://status.harvey.ai"),("Sourcegraph","sourcegraph.com","https://status.sourcegraph.com"),("Windsurf","windsurf.com","https://status.windsurf.com"),("Sentry","sentry.io","https://status.sentry.io"),("Figma","figma.com","https://status.figma.com"),("HubSpot","hubspot.com","https://status.hubspot.com"),("Zendesk","zendesk.com","https://status.zendesk.com"),("Zapier","zapier.com","https://status.zapier.com"),("Make","make.com","https://status.make.com"),("n8n","n8n.io","https://status.n8n.io"),("LangSmith","langchain.com","https://status.smith.langchain.com"),("Langfuse","langfuse.com","https://status.langfuse.com"),("Helicone","helicone.ai","https://status.helicone.ai"),("Portkey","portkey.ai","https://status.portkey.ai"),("LiteLLM","litellm.ai","https://status.litellm.ai"),("Dify","dify.ai","https://status.dify.ai"),("Flowise","flowiseai.com","https://status.flowiseai.com"),("Botpress","botpress.com","https://status.botpress.com"),("Voiceflow","voiceflow.com","https://status.voiceflow.com"),("Retool","retool.com","https://status.retool.com"),("Airtable","airtable.com","https://status.airtable.com"),("Typeform","typeform.com","https://status.typeform.com"),("Coda","coda.io","https://status.coda.io"),("ClickUp","clickup.com","https://status.clickup.com"),("Asana","asana.com","https://status.asana.com"),("Monday","monday.com","https://status.monday.com"),("Miro","miro.com","https://status.miro.com"),("Loom","loom.com","https://status.loom.com"),("Descript","descript.com","https://status.descript.com"),("Otter","otter.ai","https://status.otter.ai"),("Fireflies","fireflies.ai","https://status.fireflies.ai"),("Granola","granola.ai","https://status.granola.ai"),("Deepgram","deepgram.com","https://status.deepgram.com"),("AssemblyAI","assemblyai.com","https://status.assemblyai.com"),("ElevenLabs","elevenlabs.io","https://status.elevenlabs.io"),("Replicate","replicate.com","https://status.replicate.com"),("Together AI","together.ai","https://status.together.ai"),("Fireworks","fireworks.ai","https://status.fireworks.ai"),("Groq","groq.com","https://groqstatus.com"),("Modal","modal.com","https://status.modal.com"),("Hugging Face","huggingface.co","https://status.huggingface.co"),("Supabase","supabase.com","https://status.supabase.com"),("Pinecone","pinecone.io","https://status.pinecone.io"),("Weaviate","weaviate.io","https://status.weaviate.io"),("Qdrant","qdrant.tech","https://status.qdrant.io"),("Chroma","trychroma.com","https://status.trychroma.com"),("Render","render.com","https://status.render.com"),("Railway","railway.app","https://status.railway.app"),("Fly.io","fly.io","https://status.flyio.net"),("Streamlit","streamlit.io","https://www.streamlitstatus.com"),("Grammarly","grammarly.com","https://status.grammarly.com"),("Wordtune","wordtune.com","https://status.wordtune.com"),("Character.ai","character.ai","https://status.character.ai"),("You.com","you.com","https://status.you.com"),("Chatbase","chatbase.co","https://status.chatbase.co"),("Chatwoot","chatwoot.com","https://status.chatwoot.com"),("Tidio","tidio.com","https://status.tidio.com"),("Crisp","crisp.chat","https://status.crisp.chat"),("Fin","fin.ai","https://status.fin.ai"),("Dovetail","dovetail.com","https://status.dovetail.com"),("Productboard","productboard.com","https://status.productboard.com"),("Elicit","elicit.com","https://status.elicit.com"),("Consensus","consensus.app","https://status.consensus.app"),("Sana","sana.ai","https://status.sana.ai"),("Dust","dust.tt","https://status.dust.tt"),("Raycast","raycast.com","https://status.raycast.com"),("Superhuman","superhuman.com","https://status.superhuman.com"),("Front","front.com","https://status.front.com"),("Guru","getguru.com","https://status.getguru.com"),("ReadMe","readme.com","https://www.readmestatus.com"),("Mintlify","mintlify.com","https://status.mintlify.com"),("Postman","postman.com","https://status.postman.com"),("Runway","runwayml.com","https://status.runwayml.com"),("Synthesia","synthesia.io","https://status.synthesia.io"),("HeyGen","heygen.com","https://status.heygen.com"),("Gamma","gamma.app","https://status.gamma.app"),("Beautiful.ai","beautiful.ai","https://status.beautiful.ai"),("Canva","canva.com","https://www.canvastatus.com"),("Buffer","buffer.com","https://status.buffer.com"),("Hootsuite","hootsuite.com","https://status.hootsuite.com"),("Sprout Social","sproutsocial.com","https://status.sproutsocial.com"),("Lindy","lindy.ai","https://status.lindy.ai"),("Relevance AI","relevanceai.com","https://status.relevanceai.com"),("Tavily","tavily.com","https://status.tavily.com"),("Exa","exa.ai","https://status.exa.ai"),("Firecrawl","firecrawl.dev","https://status.firecrawl.dev"),("Browserbase","browserbase.com","https://status.browserbase.com")]

def clean(value):
    value=re.sub(r"<script\b[^>]*>.*?</script>","",str(value),flags=re.S|re.I)
    value=re.sub(r"<[^>]+>"," ",value)
    return re.sub(r"\s+"," ",html.unescape(value)).strip()

def timestamp(value):
    if not value: return None
    try: dt=datetime.fromisoformat(str(value).replace("Z","+00:00"))
    except ValueError:
        try: dt=email.utils.parsedate_to_datetime(value)
        except (ValueError,TypeError): return None
    if dt.tzinfo is None: dt=dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()

def parse_feed(text,url,provider_id=None):
    """Normalize public Statuspage, Google Cloud, RSS and Atom data. No invented resolutions."""
    try: raw=json.loads(text)
    except (ValueError,TypeError): raw=None
    results=[]
    if isinstance(raw,dict) and isinstance(raw.get("incidents"),list):
        base=raw.get("page",{}).get("url",url)
        for item in raw["incidents"]:
            updates=item.get("incident_updates",[])
            body="\n".join(clean(x.get("body","")) for x in updates)
            start=timestamp(item.get("started_at") or item.get("created_at"))
            if start:
                results.append({"id":item.get("id"),"title":clean(item.get("name","Incident")),"started_at":start,"resolved_at":timestamp(item.get("resolved_at")),"url":item.get("shortlink") or urljoin(base.rstrip("/")+"/",f"incidents/{item.get('id')}"),"body":body,"status":item.get("status"),"updates":updates})
        return results
    if isinstance(raw,list):
        for item in raw:
            if not isinstance(item,dict) or not item.get("begin"):continue
            products=" ".join(p.get("title","") for p in item.get("affected_products",[]))
            body="\n".join(clean(x.get("text","")) for x in item.get("updates",[]))
            hay=products+" "+item.get("external_desc","")+" "+body
            if provider_id=="google" and not re.search(r"vertex|gemini|generative ai|ai studio",hay,re.I):continue
            results.append({"id":item.get("id"),"title":clean(item.get("external_desc") or products),"started_at":timestamp(item["begin"]),"resolved_at":timestamp(item.get("end")),"url":urljoin("https://status.cloud.google.com/",item.get("uri",f"incidents/{item['id']}")),"body":body,"products":products})
        return results
    try: root=ET.fromstring(text)
    except ET.ParseError: return []
    entries=root.findall(".//item") or root.findall("{http://www.w3.org/2005/Atom}entry")
    def tx(el,names):
        for name in names:
            x=el.find(name)
            if x is not None:
                val="".join(x.itertext()).strip()
                if val:return val
        return ""
    for item in entries:
        title=clean(tx(item,["title","{http://www.w3.org/2005/Atom}title"]))
        body=clean(tx(item,["{http://purl.org/rss/1.0/modules/content/}encoded","description","{http://www.w3.org/2005/Atom}content","{http://www.w3.org/2005/Atom}summary"]))
        if provider_id=="azure" and not re.search(r"openai|azure ai|foundry",title+body,re.I):continue
        if provider_id=="bedrock" and "bedrock" not in (title+body).lower():continue
        link=tx(item,["link","guid"])
        if not link:
            atomlink=item.find("{http://www.w3.org/2005/Atom}link");link=atomlink.get("href","") if atomlink is not None else ""
        start=timestamp(tx(item,["pubDate","{http://www.w3.org/2005/Atom}published","{http://www.w3.org/2005/Atom}updated"]))
        if start and link:
            # RSS often gives last update, not onset; retain that uncertainty explicitly.
            results.append({"id":link,"title":title,"started_at":start,"resolved_at":None,"url":link,"body":body,"timestamp_basis":"feed publication; onset/resolution not independently established"})
    return results

async def ingest_feed(client,db,url,name,kind,aid=None,pid=None,days=180):
    response=await client.get(url)
    if response["status"]!=200:
        source(db,url,name,"unavailable",detail=response.get("error",f"HTTP {response['status']}"));return 0,False
    incidents=parse_feed(response["text"],url,pid)
    if not incidents:
        source(db,url,name,"empty_or_unsupported",detail="No parseable relevant public incidents; not a claim of no outages");return 0,False
    dates=[i["started_at"] for i in incidents]
    cutoff=datetime.now(timezone.utc)-timedelta(days=days)
    included=[i for i in incidents if datetime.fromisoformat(i["started_at"])>=cutoff]
    for inc in included: insert_incident(db,inc,kind,aid,pid)
    source(db,url,name,"collected",len(included),min(dates),max(dates),"Observed earliest feed item is not proof of complete historical coverage")
    return len(included),True

async def collect_providers(client,db,days):
    async def one(provider):
        total=0
        before=db.execute("SELECT count(*) FROM incidents WHERE kind='provider' AND provider_id=?",(provider["id"],)).fetchone()[0]
        for feed in provider["feeds"]:
            count,parsed=await ingest_feed(client,db,feed,provider["name"],"provider",pid=provider["id"],days=days)
            total+=count
            if parsed:
                # Statuspage supports public paginated APIs where robots permits them.
                if "/api/v2/" in feed:
                    for page in range(2,11):
                        prior=db.execute("SELECT count(*) FROM incidents WHERE kind='provider' AND provider_id=?",(provider["id"],)).fetchone()[0]
                        count,ok=await ingest_feed(client,db,feed+f"?page={page}",provider["name"],"provider",pid=provider["id"],days=days)
                        total+=count
                        after=db.execute("SELECT count(*) FROM incidents WHERE kind='provider' AND provider_id=?",(provider["id"],)).fetchone()[0]
                        if not ok or count==0 or after==prior:break
                break
        actual=db.execute("SELECT count(*) FROM incidents WHERE kind='provider' AND provider_id=?",(provider["id"],)).fetchone()[0]
        print(f"provider {provider['id']}: {actual} unique observed incidents",flush=True)
    await asyncio.gather(*(one(p) for p in PROVIDERS))

async def discover(client,db,limit=500,refresh=False):
    seeds=list(SEEDS)
    seed_source="https://yc-oss.github.io/api/companies/all.json"
    if limit>len(seeds):
        response=await client.get(seed_source)
        if response["status"]==200:
            try:
                companies=json.loads(response["text"])
                selected=[]
                for company in companies:
                    text=" ".join(str(company.get(k,"")) for k in ["tags","industries","one_liner","long_description"])
                    host=urlsplit(company.get("website","")).hostname
                    if host and re.search(r"artificial intelligence|\bAI\b|machine learning|LLM|generative",text,re.I) and company.get("status")!="Inactive":
                        selected.append((company["name"],host.removeprefix("www."),None))
                seeds.extend(selected)
                source(db,seed_source,"YC OSS discovery mirror","collected",len(selected),detail="Third-party mirror for domain discovery only; not company evidence")
            except (ValueError,TypeError):pass
    seen=set();unique=[]
    for item in seeds:
        if item[1] not in seen:seen.add(item[1]);unique.append(item)
    unique=unique[:limit]
    async def probe(item):
        name,domain,known=item
        prior=db.execute("SELECT * FROM probes WHERE domain=?",(domain,)).fetchone()
        if prior and not refresh:return
        bases=[known] if known else [f"https://status.{domain}",f"https://{domain.split('.')[0]}.statuspage.io"]
        found=None;detail=[]
        aid=put_account(db,name,domain,known)
        for base in bases:
            if not base:continue
            for suffix in ["/api/v2/incidents.json","/history.rss","/history.atom"]:
                count,parsed=await ingest_feed(client,db,base.rstrip("/")+suffix,name,"downstream",aid=aid)
                if parsed:
                    found=base;detail.append(f"{count} incidents");break
            if found:break
        if found:put_account(db,name,domain,found)
        db.execute("INSERT OR REPLACE INTO probes VALUES(?,?,?,?,?,?)",(domain,name,found,"found" if found else "unavailable","; ".join(detail) or "No allowed parseable feed found; could still have a status page",utcnow()))
        db.commit()
    # Bound each domain operation as well as individual requests.
    sem=asyncio.Semaphore(20)
    async def bounded(item):
        async with sem:
            try:await asyncio.wait_for(probe(item),timeout=100)
            except Exception as exc:
                db.execute("INSERT OR REPLACE INTO probes VALUES(?,?,?,?,?,?)",(item[1],item[0],None,"error",f"{type(exc).__name__}: {str(exc)[:100]}",utcnow()));db.commit()
    await asyncio.gather(*(bounded(item) for item in unique))
    print("discovery:",dict(db.execute("SELECT count(*) domains_probed,sum(state='found') status_pages_found FROM probes").fetchone()),flush=True)

def import_research(db,path=None):
    path=path or ROOT/"research/validated_evidence.json"
    if not path.exists():return 0
    data=json.loads(path.read_text());count=0
    for account in data.get("accounts",[]):
        aid=put_account(db,account["name"],account["domain"],account.get("status_url"))
        for inc in account.get("incidents",[]):
            normalized=dict(inc)
            normalized["provider"]={"azure-openai":"azure","aws-bedrock":"bedrock","gemini":"google"}.get(inc.get("provider"),inc.get("provider"))
            normalized["started_at"]=timestamp(inc.get("started_at") or inc.get("date"))
            normalized["resolved_at"]=timestamp(inc.get("resolved_at"))
            if not inc.get("url"):continue
            normalized["body"]=inc.get("body") or inc.get("quote","")
            insert_incident(db,normalized,"downstream",aid)
            count+=1
    provider_path=ROOT/"research/provider_evidence.json"
    if provider_path.exists():
        supplied=json.loads(provider_path.read_text())
        for inc in supplied.get("incidents",[]):
            normalized={**inc,"started_at":timestamp(inc.get("started_at")),"resolved_at":timestamp(inc.get("resolved_at"))}
            insert_incident(db,normalized,"provider",provider_id=inc["provider_id"])
            source(db,inc["url"],NAMES_FOR_IMPORT.get(inc["provider_id"],inc["provider_id"]),"collected",1,normalized["started_at"],normalized["started_at"],"One independently refetched incident, not a complete historical feed")
        for link in supplied.get("links",[]):
            row=db.execute("SELECT id,raw FROM incidents WHERE kind='downstream' AND url=?",(link["downstream_incident_url"],)).fetchone()
            if row:
                raw=json.loads(row["raw"]);raw["direct_link_evidence"]=link
                db.execute("UPDATE incidents SET raw=? WHERE id=?",(json.dumps(raw),row["id"]))
        db.commit()
    qualification_path=ROOT/"research/qualification_evidence.json"
    if qualification_path.exists():
        for item in json.loads(qualification_path.read_text()).get("accounts",[]):
            account=db.execute("SELECT id,payload FROM accounts WHERE domain=?",(item["domain"],)).fetchone()
            if account:
                payload=json.loads(account["payload"]);payload["qualification"]=item
                db.execute("UPDATE accounts SET payload=? WHERE id=?",(json.dumps(payload),account["id"]))
        db.commit()
    print(f"imported {count} first-party researched incidents",flush=True)
    return count

NAMES_FOR_IMPORT={p["id"]:p["name"] for p in PROVIDERS}

async def collect(db_path=None,days=180,domains=120,refresh=False):
    db=connect(db_path);client=PublicClient(db_path,cache_hours=0 if refresh else 6)
    try:
        await collect_providers(client,db,days)
        import_research(db)
        if domains:await discover(client,db,domains,refresh)
    finally:await client.close();db.close()
