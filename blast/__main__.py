import argparse
import asyncio
from .collect import collect,import_research
from .matching import classify
from .store import connect

def main():
    p=argparse.ArgumentParser(description="Public AI incident evidence and reviewable account research")
    p.add_argument("command",choices=["collect","classify","score","write","digest","export","import","live"])
    p.add_argument("--db",default=None)
    p.add_argument("--days",type=int,default=180)
    p.add_argument("--domains",type=int,default=120)
    p.add_argument("--limit",type=int,default=40)
    p.add_argument("--refresh",action="store_true")
    p.add_argument("--public-only",action="store_true")
    p.add_argument("--web",action="store_true",help="Enable one bounded paid web plugin request")
    args=p.parse_args()
    if not 0<=args.domains<=1500:p.error("--domains must be between0 and1500")
    if not 1<=args.days<=365:p.error("--days must be between1 and365")
    if not 1<=args.limit<=40:p.error("--limit must be between1 and40")
    if args.command=="collect":asyncio.run(collect(args.db,args.days,args.domains,args.refresh))
    elif args.command=="classify":classify(args.db)
    elif args.command=="import":
        db=connect(args.db);import_research(db);db.close()
    else:
        from .pipeline import score,write,digest,export,live
        {"score":lambda:score(args.db),"write":lambda:write(args.db,args.limit),"digest":lambda:digest(args.db),"export":lambda:export(args.db,args.public_only),"live":lambda:live(args.db,args.limit,args.web)}[args.command]()

if __name__=="__main__":main()
