"""Public-only HTTP with robots policy, host pacing, bounded bodies, and persistent cache."""
from __future__ import annotations
import asyncio
import json
import time
import urllib.robotparser
from datetime import datetime, timezone
from urllib.parse import urlsplit
import httpx
from .store import connect, utcnow

AGENT = "BlastRadiusResearch/0.1 (+https://github.com/ceased18/blast-radius; public status evidence research)"

class PublicClient:
    def __init__(self, db_path=None, concurrency=20, cache_hours=6):
        self.db_path=db_path
        self.cache_hours=cache_hours
        self.client=httpx.AsyncClient(timeout=httpx.Timeout(18,connect=5), follow_redirects=True, headers={"User-Agent":AGENT},limits=httpx.Limits(max_connections=concurrency,max_keepalive_connections=concurrency))
        self.sem=asyncio.Semaphore(concurrency)
        self.locks={}
        self.last={}
        self.robots={}

    async def close(self):
        await self.client.aclose()

    async def _request(self,url):
        parts=urlsplit(url)
        if parts.scheme not in {"https","http"} or not parts.hostname or parts.username:
            raise ValueError("Only public HTTP(S) URLs are allowed")
        # Known private destinations are rejected; discovery inputs are company domains.
        if parts.hostname in {"localhost","127.0.0.1","::1"} or parts.hostname.endswith(".local"):
            raise ValueError("Local destinations are not allowed")
        host=parts.netloc
        lock=self.locks.setdefault(host,asyncio.Lock())
        async with lock:
            delay=1-(time.monotonic()-self.last.get(host,0))
            if delay>0: await asyncio.sleep(delay)
            self.last[host]=time.monotonic()
            async with self.sem:
                r=await self.client.get(url)
                if len(r.content)>16_000_000: raise ValueError("Response exceeds 16 MB limit")
                return r

    async def allowed(self,url):
        parts=urlsplit(url); origin=f"{parts.scheme}://{parts.netloc}"
        if origin not in self.robots:
            # Lock the whole policy creation so parallel URL probes do not race.
            marker=self.robots.setdefault(origin,asyncio.Future())
            try:
                response=await self._request(origin+"/robots.txt")
                if response.status_code in {401,403,429} or response.status_code>=500:
                    policy=False
                elif response.status_code==200 and "<html" not in response.text[:300].lower():
                    policy=urllib.robotparser.RobotFileParser();policy.parse(response.text.splitlines())
                else: policy=True
                marker.set_result(policy)
            except Exception:
                marker.set_result(False)
        policy=self.robots[origin]
        if isinstance(policy,asyncio.Future): policy=await policy
        return policy if isinstance(policy,bool) else policy.can_fetch(AGENT,url)

    async def get(self,url,refresh=False):
        db=connect(self.db_path)
        cached=db.execute("SELECT * FROM cache WHERE url=?",(url,)).fetchone()
        if cached and not refresh:
            age=(datetime.now(timezone.utc)-datetime.fromisoformat(cached["fetched_at"])).total_seconds()/3600
            if age<self.cache_hours:
                db.close(); return {"status":cached["status"],"text":cached["body"],"content_type":cached["content_type"],"cached":True}
        db.close()
        if not await self.allowed(url): return {"status":0,"text":"","content_type":"","error":"robots policy denied or unavailable"}
        error=None
        for attempt in range(2):
            try:
                r=await self._request(url)
                if r.status_code==429 or r.status_code>=500:
                    error=f"HTTP {r.status_code}"
                    if attempt==0: await asyncio.sleep(2); continue
                result={"status":r.status_code,"text":r.text,"content_type":r.headers.get("content-type",""),"cached":False}
                db=connect(self.db_path)
                db.execute("INSERT OR REPLACE INTO cache VALUES(?,?,?,?,?)",(url,r.status_code,r.text,result["content_type"],utcnow()));db.commit();db.close()
                return result
            except (httpx.HTTPError,ValueError) as exc:
                error=f"{type(exc).__name__}: {str(exc)[:120]}"
                if attempt==0: await asyncio.sleep(1)
        return {"status":0,"text":"","content_type":"","error":error}
