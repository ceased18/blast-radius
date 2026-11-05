import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {createApp,cacheKey,normalizeInput,publicPlanErrors} from '../src/api.mjs';
import {BUDGET_PROOF,REQUEST_RESERVE_MICROUSD,CAP_MICROUSD,reserveJob,budgetStatus} from '../src/budget.mjs';
import {basePayload,selectModels,liveSources,webSearchCount,callOpenRouter} from '../src/openrouter.mjs';
import {conservativePlan} from '../src/quality.mjs';

class D1 {
  constructor(sqlite){this.sqlite=sqlite;}
  withSession(){return this;}
  prepare(sql){
    const sqlite=this.sqlite;
    const statement={args:[],bind(...args){return {...statement,args};},
      async first(){return sqlite.prepare(sql).get(...this.args) || null;},
      async all(){return {results:sqlite.prepare(sql).all(...this.args)};},
      async run(){const x=sqlite.prepare(sql).run(...this.args);return {success:true,meta:{changes:Number(x.changes)}};}};
    return statement;
  }
  async batch(statements){this.sqlite.exec('BEGIN IMMEDIATE');try{const results=[];for(const statement of statements)results.push(await statement.run());this.sqlite.exec('COMMIT');return results;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}
}
async function database(){const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');for(const file of (await readdir(new URL('../drizzle/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())sqlite.exec(await readFile(new URL(`../drizzle/${file}`,import.meta.url),'utf8'));return new D1(sqlite);}
const parameters=['response_format','structured_outputs','tools','reasoning'];
const model=(id,context,prompt,completion,created)=>({id,context_length:context,pricing:{prompt:String(prompt/1e6),completion:String(completion/1e6)},architecture:{output_modalities:['text']},supported_parameters:parameters,created});
const catalog=[model('qwen/research-primary',40960,.12,.5,5),model('qwen/research-fallback',40960,.12,.24,4),model('google/plan-flash',1000000,.3,2.5,3),model('openai/plan-fallback',1000000,.1,.5,2)];
const input={account_domain:'account.example',seller:'OpenRouter',seller_domain:'openrouter.ai'};
const now=()=>new Date().toISOString();
const source=(id,company,url,title)=>({id,url,title,publisher:new URL(url).hostname,published_at:null,retrieved_at:now(),quote:'',excerpt:'Managed routing controls and policy choices are documented for this product. '.repeat(7)+'DO_NOT_PUBLISH_RAW_SUFFIX',origin:'live_web',currentness:'live_retrieved',company_domain:company});
const sources=()=>[source('live-1','account.example','https://account.example/docs','Account documentation'),source('live-2','openrouter.ai','https://openrouter.ai/docs','OpenRouter documentation')];
function plan(){const s=sources();return {schema_version:'1.0',status:'research_incomplete',seller:{name:'OpenRouter',domain:'openrouter.ai',positioning_note:'Documented model routing capabilities.',source_ids:['live-2']},account:{name:'account.example',domain:'account.example'},research_date:now().slice(0,10),sources:s.map(({excerpt,company_domain,...rest})=>rest),pains:Array.from({length:3},(_,i)=>({title:`Evidence gap ${i+1}`,statement:'No specific unresolved pressure is established by this bounded source bundle.',evidence_status:'insufficient_evidence',evidence:[],cost_of_inaction:{statement:'Unknown.',basis:'unknown',source_ids:[]},why_seller:{statement:'A remaining requirement needs validation.',source_ids:[]},confidence:null,missing_evidence:'A current account-specific pressure and business consequence.'})),personas:['AI Platform lead','Engineering lead','IT lead'].map(title=>({name:'Unknown',title,role_in_problem:'Possible functional owner; role hypothesis only.',messaging_angle:'Validate the relevant workflow and existing controls.',verification:{status:'name_unknown',source_ids:[],checked_at:null,evidence_date:null}})),tools:{status:'none_found',items:[],search_note:'No sufficiently specific presence evidence was established.'},initial_value_hypothesis:{statement:'If a current unmet routing requirement is established, a comparison could test that requirement against existing controls. Current opportunity remains unknown.',initiative_or_situation:'Public platform documentation review.',source_ids:['live-1'],basis:'hypothesis'},key_goal_for_week:'',limitations:['Bounded evidence; current unmet requirements and people are unverified.']};}
function makeFetch({badHttp=false,missingSearch=false,missingSeller=false,invalidPlan=false,networkError=false}={}){
  const state={paid:0,urls:[],headers:[],payloads:[],baseline:0};let bundle=sources();
  const mocked=async(url,options={})=>{
    state.urls.push(url);state.headers.push(options.headers);
    if(url.endsWith('/models'))return Response.json({data:catalog});
    if(url.endsWith('/key'))return Response.json({data:{usage:state.baseline}});
    if(url.includes('/generation?'))return Response.json({error:'Not ready'},{status:404});
    assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');state.paid++;
    const payload=JSON.parse(options.body);state.payloads.push(payload);
    if(networkError)throw Error('Network timeout');
    if(badHttp)return Response.json({error:{code:400,message:'Validation rejection',metadata:{raw:'Private provider detail; test-server-value-never-public Bearer test-operator-only-value'}}},{status:400});
    const research=Boolean(payload.tools);let content;
    if(research){bundle=sources();content={company_summary:'Source-backed review.',research_gaps:[]};}
    else {content=plan();const supplied=JSON.parse(payload.messages[1].content);content.sources=supplied.sources.filter(s=>s.id==='live-1'||s.id==='live-2').map(({excerpt,company_domain,quote_allowed,...rest})=>rest);content.research_date=supplied.research_date;if(invalidPlan)content.key_goal_for_week='Book meetings';}
    const domain=payload.tools?.[0]?.parameters.allowed_domains[0];
    const annotations=research?bundle.filter(s=>s.company_domain===domain&&(!missingSeller||s.company_domain!=='openrouter.ai')).map(s=>({type:'url_citation',url_citation:{url:s.url,title:s.title,content:s.excerpt}})):[];
    return Response.json({id:`generation-${state.paid}`,model:payload.models[0],choices:[{message:{content:JSON.stringify(content),annotations},finish_reason:'stop'}],usage:{cost:research?.0070011:.001,server_tool_use_details:{web_search_requests:research&&!missingSearch?1:0}}});
  };
  return {fetch:mocked,state};
}
const env=db=>({DB:db,OPENROUTER_API_KEY:'test-server-value-never-public',ADMIN_TOKEN:'test-operator-only-value',LIVE_GENERATION_ENABLED:'1'});
const request=(body=input,path='/api/pg-plan')=>new Request(`https://blast-radius-plans.alluringdoor.chatgpt.site${path}`,{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://ceased18.github.io'},body:JSON.stringify(body)});

test('worst-case model passes, four fallback searches and planning fit the immutable lifetime reservation',()=>{
  const r=BUDGET_PROOF.research,p=BUDGET_PROOF.planning;
  const bound=Math.ceil((r.passes*(r.input_tokens*r.prompt_per_million+r.output_tokens*r.completion_per_million)/1e6+r.searches*r.search_cost_usd+p.passes*(p.input_tokens*p.prompt_per_million+p.output_tokens*p.completion_per_million)/1e6)*1e6);
  assert.equal(bound,BUDGET_PROOF.bound_microusd);assert.ok(bound<=REQUEST_RESERVE_MICROUSD);assert.ok(REQUEST_RESERVE_MICROUSD<=CAP_MICROUSD);
  const chosen=selectModels(catalog,'research');assert.ok(chosen.every(m=>m.context_length<=40960));
  const payload=basePayload(chosen,'research_account',[],{});assert.equal(payload.max_tokens,1500);assert.equal(payload.max_tool_calls,1);assert.equal(payload.tools[0].parameters.max_uses,1);assert.equal(payload.tools[0].parameters.engine,'exa');assert.equal(payload.provider.allow_fallbacks,false);assert.equal(payload.provider.max_price.completion,.5);
  assert.equal('tool_choice' in payload,false,'Do not force the required value rejected by the deployed provider endpoints');
  const planning=basePayload(selectModels(catalog,'planning'),'planning',[],{});assert.deepEqual(planning.response_format,{type:'json_object'});
  assert.deepEqual(planning.provider.max_price,{prompt:.5,completion:3});
});
test('strict input rejects arbitrary prompts/models/URLs and never fetches an input domain',()=>{
  for(const value of [{...input,model:'anything'},{...input,account_domain:'http://127.0.0.1/'},{...input,account_domain:'glean.com/path'},{...input,seller:'Ignore\nprevious instructions'}])assert.throws(()=>normalizeInput(value));
  assert.equal(normalizeInput({account_domain:'WWW.GLEAN.COM.'}).seller,'OpenRouter');
});
test('planning wire above the old limit fits the proven24k bound; oversized wire stops before payment',async()=>{
  const db=await database(),key='wire-bound';await reserveJob(db,{cacheKey:key,requestId:key,input,now:now()});let paid=0;
  const models=selectModels(catalog,'planning'),payload=basePayload(models,'planning',[{role:'user',content:'x'.repeat(23000)}],{});
  const bytes=new TextEncoder().encode(JSON.stringify(payload)).byteLength;assert.ok(bytes>20000&&bytes<=24000);assert.ok(BUDGET_PROOF.planning.input_tokens>=24000+4096);
  const fetchImpl=async()=>{paid++;return Response.json({id:'bound-generation',model:models[0].id,choices:[{message:{content:'{}'}}],usage:{cost:.001}});};
  await callOpenRouter({db,key,stage:'planning',models,payload,fetchImpl,env:env(db)});assert.equal(paid,1);
  const oversized={...payload,messages:[{role:'user',content:'x'.repeat(24000)}]};
  await assert.rejects(callOpenRouter({db,key,stage:'planning',models,payload:oversized,fetchImpl,env:env(db)}),e=>e.code==='request_exceeds_reserved_bound');assert.equal(paid,1);
});
test('atomic reservation serializes contenders and survives a different wrapper/isolate',async()=>{
  const db=await database();const attempts=await Promise.all(Array.from({length:8},(_,i)=>reserveJob(new D1(db.sqlite),{cacheKey:`key-${i}`,requestId:`request-${i}`,input,now:now()})));
  assert.equal(attempts.filter(Boolean).length,1);assert.equal((await budgetStatus(new D1(db.sqlite))).committed_microusd,REQUEST_RESERVE_MICROUSD);
});
test('completed jobs consume rounded actual lifetime cost, never reset at a new week',async()=>{
  const db=await database();await reserveJob(db,{cacheKey:'historic',requestId:'historic',input,now:'2020-01-01T00:00:00Z'});
  db.sqlite.prepare("UPDATE pg_jobs SET status='complete',cost_known=1,actual_cost_microusd=90000 WHERE cache_key='historic'").run();
  assert.equal(await reserveJob(db,{cacheKey:'new',requestId:'new',input,now:now()}),false);assert.equal((await budgetStatus(db)).committed_microusd,90000);
});
test('live research + validated plan execute once; identical versioned/unversioned requests are cached',async()=>{
  const db=await database(),mock=makeFetch(),app=createApp({fetchImpl:mock.fetch});
  const first=await (await app.fetch(request(input,'/api/v1/pg-plan'),env(db),{})).json();
  assert.equal(first.status,'complete',JSON.stringify(first));assert.equal(first.plan.pains.length,3);assert.equal(first.plan.key_goal_for_week,'');assert.equal(mock.state.paid,3);
  assert.equal(first.usage.actual_cost_microusd,15004);assert.ok(!JSON.stringify(first).includes('DO_NOT_PUBLISH_RAW_SUFFIX'));assert.ok(!JSON.stringify(first).includes('test-server-value'));
  const privateProof=JSON.parse(db.sqlite.prepare("SELECT metadata_json FROM pg_calls WHERE stage='planning'").get().metadata_json);assert.equal(privateProof.raw_candidate.key_goal_for_week,'');assert.ok(privateProof.source_bundle.some(s=>s.excerpt.includes('DO_NOT_PUBLISH_RAW_SUFFIX')));
  assert.deepEqual(mock.state.payloads[0].tools[0].parameters.allowed_domains,['account.example']);assert.deepEqual(mock.state.payloads[1].tools[0].parameters.allowed_domains,['openrouter.ai']);
  assert.deepEqual(first.usage.runs.map(r=>r.stage),['research_account','research_seller','planning']);
  assert.equal(mock.state.payloads[2].response_format.type,'json_object');assert.equal(JSON.parse(mock.state.payloads[2].messages[1].content).output_schema.type,'object');
  const second=await (await app.fetch(request(),env(db),{})).json();assert.equal(second.status,'cached');assert.equal(second.cache_key,first.cache_key);assert.equal(mock.state.paid,3);
  const fetched=await (await app.fetch(new Request(`https://demo.example/api/v1/pg-plan/${first.cache_key}`),env(db),{})).json();assert.equal(fetched.status,'cached');
  assert.ok(mock.state.urls.every(u=>u.startsWith('https://openrouter.ai/api/v1/')));
});
test('web search usage and both primary-domain source bundles are mandatory',async()=>{
  for(const options of [{missingSearch:true},{missingSeller:true}]){
    const db=await database(),mock=makeFetch(options),app=createApp({fetchImpl:mock.fetch});const out=await (await app.fetch(request(),env(db),{})).json();
    assert.equal(out.status,'research_unavailable');assert.equal(out.plan,null);assert.equal(mock.state.paid,options.missingSeller?2:1);assert.equal(out.budget.blocked_by_unresolved,false);
    for(const source of out.research.sources)assert.ok(source.quote.split(/\s+/).length<=25);
  }
});
test('invalid weekly goal fails validation without automatic paid repair',async()=>{
  const db=await database(),mock=makeFetch({invalidPlan:true}),app=createApp({fetchImpl:mock.fetch});const out=await (await app.fetch(request(),env(db),{})).json();
  assert.equal(out.status,'plan_unavailable');assert.equal(out.plan,null);assert.equal(mock.state.paid,3);assert.ok(out.validation_errors.some(e=>e.includes('key_goal_for_week')));
});
test('unknown HTTP outcome holds its full reservation and blocks new paid work',async()=>{
  const db=await database(),mock=makeFetch({badHttp:true}),app=createApp({fetchImpl:mock.fetch});const out=await (await app.fetch(request(),env(db),{})).json();
  assert.equal(out.status,'research_unavailable');assert.equal(out.budget.blocked_by_unresolved,true);assert.equal(out.budget.committed_microusd,REQUEST_RESERVE_MICROUSD);
  await app.fetch(request({...input,account_domain:'other.example'}),env(db),{});assert.equal(mock.state.paid,1);
  assert.equal(JSON.parse(db.sqlite.prepare('SELECT metadata_json FROM pg_calls').get().metadata_json).http_status,400);
  const diagnostic=db.sqlite.prepare('SELECT metadata_json FROM pg_calls').get().metadata_json;assert.ok(diagnostic.includes('Private provider detail'));assert.ok(!diagnostic.includes('test-server-value-never-public'));assert.ok(!diagnostic.includes('test-operator-only-value'));assert.ok(!JSON.stringify(out).includes('Private provider detail'));
});
test('protected operator can reconcile only evidenced zero-charge validation rejection, retaining audit/history',async()=>{
  const db=await database(),mock=makeFetch({badHttp:true}),app=createApp({fetchImpl:mock.fetch}),settings=env(db);
  const failed=await (await app.fetch(request(),settings,{})).json();
  db.sqlite.prepare('UPDATE pg_jobs SET updated_at=?').run(new Date(Date.now()-20_000).toISOString());
  const endpoint='https://demo.example/api/admin/reconcile';
  const bad=new Request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cache_key:failed.cache_key})});assert.equal((await app.fetch(bad,settings,{})).status,403);
  const good=new Request(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${settings.ADMIN_TOKEN}`},body:JSON.stringify({cache_key:failed.cache_key,confirm_no_other_key_activity:true})});
  const repaired=await (await app.fetch(good,settings,{})).json();assert.equal(repaired.status,'reconciled');assert.equal(repaired.budget.committed_microusd,0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM pg_jobs').get().n,1);assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM pg_budget_audits').get().n,1);assert.equal(mock.state.paid,1);
});
test('timeouts cannot be released through zero-charge validation reconciliation',async()=>{
  const db=await database(),mock=makeFetch({networkError:true}),app=createApp({fetchImpl:mock.fetch}),settings=env(db);
  const failed=await (await app.fetch(request(),settings,{})).json();
  const req=new Request('https://demo.example/api/admin/reconcile',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${settings.ADMIN_TOKEN}`},body:JSON.stringify({cache_key:failed.cache_key,confirm_no_other_key_activity:true})});
  const out=await (await app.fetch(req,settings,{})).json();assert.equal(out.status,'not_reconcilable');assert.equal((await budgetStatus(db)).committed_microusd,REQUEST_RESERVE_MICROUSD);
});
test('generation disabled and disallowed origins never call models',async()=>{
  const db=await database(),mock=makeFetch(),app=createApp({fetchImpl:mock.fetch});
  await app.fetch(request(),{...env(db),LIVE_GENERATION_ENABLED:'0'},{});assert.equal(mock.state.paid,0);assert.equal(mock.state.urls.length,0);
  const hostile=new Request('https://demo.example/api/pg-plan',{method:'POST',headers:{Origin:'https://other.example','Content-Type':'application/json'},body:JSON.stringify(input)});assert.equal((await app.fetch(hostile,env(db),{})).status,403);assert.equal(mock.state.urls.length,0);
});
test('citation filtering rejects misleading domains and unbounded source URLs',()=>{
  const annotations=[{type:'url_citation',url_citation:{url:'https://account.example.evil.invalid/docs',title:'Fake',content:'Fake external content repeated enough to pass size.'}},{type:'url_citation',url_citation:{url:'http://127.0.0.1/private',title:'Local',content:'No direct fetch should ever be attempted by this tool.'}}];
  assert.deepEqual(liveSources(annotations,{accountDomain:'account.example',sellerDomain:'openrouter.ai',now:now()}),[]);
});
test('modern and legacy search counters are supported without double counting',()=>{
  assert.equal(webSearchCount({server_tool_use_details:{web_search_requests:2},server_tool_use:{web_search_requests:2}}),2);
  assert.equal(webSearchCount({server_tool_use:{web_search_requests:1}}),1);
});
test('operator-only generation uses the same capped pipeline while public generation is disabled',async()=>{
  const db=await database(),mock=makeFetch(),app=createApp({fetchImpl:mock.fetch}),settings={...env(db),LIVE_GENERATION_ENABLED:'0'};
  const unauthorized=await app.fetch(request(input,'/api/admin/generate'),settings,{});assert.equal(unauthorized.status,403);assert.equal(mock.state.paid,0);
  const authorized=new Request('https://demo.example/api/admin/generate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${settings.ADMIN_TOKEN}`},body:JSON.stringify(input)});
  const out=await (await app.fetch(authorized,settings,{})).json();assert.equal(out.status,'complete');assert.equal(mock.state.paid,3);
  const cached=await (await app.fetch(request(),settings,{})).json();assert.equal(cached.status,'cached');assert.equal(mock.state.paid,3);
  const status=await (await app.fetch(new Request('https://demo.example/api/status'),settings,{})).json();assert.equal(status.can_generate,false);
});

async function priorFailedResearch(db,{age=60_000,known=true,missingSeller=false}={}){
  const key='a'.repeat(64),date=new Date(Date.now()-age).toISOString();
  await reserveJob(db,{cacheKey:key,requestId:'prior-failed',input,now:date});
  const saved=sources().filter(s=>!missingSeller||s.company_domain!=='openrouter.ai').map(({excerpt,company_domain,...s})=>({...s,retrieved_at:date,quote:excerpt.split(/\s+/).slice(0,25).join(' ')}));
  db.sqlite.prepare('UPDATE pg_jobs SET status=?,cost_known=?,actual_cost_microusd=14004,response_json=? WHERE cache_key=?').run(known?'failed':'unknown',known?1:0,JSON.stringify({plan:null,research:{checked_at:date,sources:saved}}),key);
  for(const stage of ['research_account','research_seller'])db.sqlite.prepare("INSERT INTO pg_calls(id,cache_key,stage,status,requested_models,actual_cost_microusd,actual_cost_usd,web_search_requests,created_at) VALUES(?,?,?,'complete','[]',7002,.0070011,1,?)").run(stage,key,stage,date);
  return {key,date};
}
test('operator replan reuses verified recent live sources once, preserves dates and old billed history',async()=>{
  const db=await database(),prior=await priorFailedResearch(db),mock=makeFetch(),app=createApp({fetchImpl:mock.fetch}),settings={...env(db),LIVE_GENERATION_ENABLED:'0'};
  const admin=()=>new Request('https://demo.example/api/admin/replan',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${settings.ADMIN_TOKEN}`},body:JSON.stringify({cache_key:prior.key})});
  assert.equal((await app.fetch(request({cache_key:prior.key},'/api/admin/replan'),settings,{})).status,403);
  const out=await (await app.fetch(admin(),settings,{})).json();assert.equal(out.status,'complete',JSON.stringify(out));assert.equal(mock.state.paid,1);assert.equal(mock.state.payloads[0].tools,undefined);
  assert.equal(out.research.reused_from_cache_key,prior.key);assert.equal(out.research.checked_at,prior.date);assert.equal(out.research.web_search_requests,0);assert.equal(out.usage.runs.length,1);assert.equal(out.usage.runs[0].stage,'planning');
  assert.ok(out.plan.sources.every(s=>s.retrieved_at===prior.date));assert.equal(out.budget.committed_microusd,15004);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM pg_jobs').get().n,2);assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM pg_calls').get().n,3);
  const cached=await (await app.fetch(request(),settings,{})).json();assert.equal(cached.status,'cached');assert.equal(cached.cache_key,out.cache_key);assert.equal(mock.state.paid,1);
});
test('replan refuses unresolved, expired or incomplete research without making a paid call',async()=>{
  for(const options of [{known:false},{age:25*60*60*1000},{missingSeller:true}]){
    const db=await database(),prior=await priorFailedResearch(db,options),mock=makeFetch(),app=createApp({fetchImpl:mock.fetch}),settings=env(db);
    const admin=new Request('https://demo.example/api/admin/replan',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${settings.ADMIN_TOKEN}`},body:JSON.stringify({cache_key:prior.key})});
    assert.equal((await app.fetch(admin,settings,{})).status,400);assert.equal(mock.state.paid,0);assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM pg_jobs').get().n,1);
  }
});
test('snapshot documentation paraphrases are labelled notes and never exposed as primary quotes',async()=>{
  const record={domain:'account.example',coverage:{source_checked_at:now()},evidence:[{url:'https://account.example/incident',title:'Incident',quote:'Authentic incident words.',timestamps:{source_checked_at:now()}}],qualification:{checked_at:now(),sources:[{url:'https://account.example/current-docs',title:'Current documentation',claim:'Authored summary is not a primary quote.'}]}};
  const db=await database(),mock=makeFetch({invalidPlan:true}),app=createApp({fetchImpl:mock.fetch,assets:{'/api/v1/accounts/account.example.json':{text:JSON.stringify(record)}}});
  const out=await (await app.fetch(request(),env(db),{})).json(),doc=out.research.sources.find(s=>s.url.endsWith('/current-docs'));
  assert.equal(doc.quote,'');assert.equal(doc.note,'Authored summary is not a primary quote.');assert.ok(doc.note_basis.includes('not a verbatim quote'));
  assert.equal(out.research.sources.find(s=>s.url.endsWith('/incident')).quote,'Authentic incident words.');
  const supplied=JSON.parse(mock.state.payloads[2].messages[1].content).sources;assert.equal(supplied.find(s=>s.url.endsWith('/current-docs')).quote_allowed,false);
});
test('public quality gate rejects feature-as-verified pressure, duplicate claims and promised hypotheses',()=>{
  const draft=plan();assert.deepEqual(publicPlanErrors(draft),[]);
  draft.pains[0].evidence_status='verified_pressure';draft.pains[0].evidence=[{claim:'Auto routing selects models by performance and cost.',source_ids:['live-1']}];
  assert.ok(publicPlanErrors(draft).some(e=>e.includes('verified adverse impact')));
  draft.pains[0].evidence_status='supported_inference';draft.pains[1].evidence_status='supported_inference';draft.pains[1].evidence=[{claim:'AUTO ROUTING selects models by performance & cost!',source_ids:['live-1']}];
  draft.pains[1].evidence[0].claim='AUTO routing selects models by performance and cost!';
  assert.ok(publicPlanErrors(draft).some(e=>e.includes('repeated evidence claim set')));
  draft.pains[1].evidence[0].claim='Separate deployment telemetry is documented.';
  assert.deepEqual(publicPlanErrors(draft),[],'The same source URL can support distinct actual claims');
  draft.initial_value_hypothesis.statement='Integrating the seller will improve visibility.';assert.ok(publicPlanErrors(draft).some(e=>e.includes('explicitly conditional')));
  draft.initial_value_hypothesis.statement='If a gap exists, integration will ensure improvement.';assert.ok(publicPlanErrors(draft).some(e=>e.includes('promised outcome')));
});
function unsupportedCandidate(){
  const draft=plan();draft.status='research_complete';
  const claims=['Auto routing chooses models based on performance and cost for each supported workload.','Connect models, enterprise connectors, context, memory and skills via a governed enterprise layer'];
  const sourceBundle=sources().map(s=>({...s,quote_allowed:true}));
  sourceBundle[0].excerpt=claims[0];sourceBundle[0].quote=claims[0];
  sourceBundle.push({...sourceBundle[0],id:'live-3',url:'https://account.example/controls',title:'Governed layer',excerpt:`${claims[1]} through the infrastructure request volume`,quote:claims[1]});
  for(let i=0;i<3;i++)draft.pains[i]={title:`Potential tradeoff ${i+1}`,statement:i===0?'A documented routing policy may warrant a conditional fit check.':'The platform connects its models through a governed enterprise layer.',evidence_status:'supported_inference',evidence:[{claim:i===0?claims[0]:i===1?claims[1]:`${claims[1]} through the infrastructure request volume`,source_ids:[i===0?'live-1':'live-3']}],cost_of_inaction:{statement:i===0?'Administrative overhead might arise if policy changes need manual adjustment.':i===1?'Complex architectures might limit telemetry visibility.':'Tracking challenges might arise without explicit workspace budget alerts.',basis:'supported_inference',source_ids:[i===0?'live-1':'live-3']},why_seller:{statement:'Seller controls are documented; incremental fit is unverified.',source_ids:['live-2']},confidence:'Medium',missing_evidence:null};
  draft.sources=sourceBundle.map(({excerpt,company_domain,quote_allowed,...s})=>s);
  return {draft,sourceBundle};
}
test('conservative filter clears entire unsupported/prefix-repeated slots and unverified work costs without mutating raw draft',()=>{
  const {draft,sourceBundle}=unsupportedCandidate(),raw=JSON.stringify(draft),out=conservativePlan(draft,{sources:sourceBundle});
  assert.equal(JSON.stringify(draft),raw);assert.equal(out.plan.status,'research_incomplete');assert.deepEqual(out.plan.pains.map(p=>p.evidence_status),['supported_inference','insufficient_evidence','insufficient_evidence']);
  assert.equal(out.plan.pains[0].cost_of_inaction.basis,'unknown');assert.equal(out.plan.key_goal_for_week,'');assert.equal(out.plan.pains.length,3);
  for(const slot of out.plan.pains.slice(1)){assert.deepEqual(slot.evidence,[]);assert.equal(slot.confidence,null);assert.equal(slot.cost_of_inaction.basis,'unknown');assert.deepEqual(slot.cost_of_inaction.source_ids,[]);assert.ok(!JSON.stringify(slot).includes('limit telemetry'));}
  assert.ok(out.quality_filter.redacted_slots[1].reasons.some(r=>r.includes('prefix')));assert.ok(out.plan.initial_value_hypothesis.statement.startsWith('Unverified test hypothesis: '));
});
test('existing cached plans are conservatively filtered and revalidated without writes, new dates or paid requests',async()=>{
  const db=await database(),{draft}=unsupportedCandidate(),key=await cacheKey(input),created=now();await reserveJob(db,{cacheKey:key,requestId:'legacy',input,now:created});
  const raw=JSON.stringify({status:'complete',plan:draft,generated_at:created,research:{checked_at:created},usage:{cost_known:true,actual_cost_microusd:6846,runs:[]}});
  db.sqlite.prepare("UPDATE pg_jobs SET status='complete',cost_known=1,actual_cost_microusd=6846,response_json=? WHERE cache_key=?").run(raw,key);
  const app=createApp({fetchImpl:async()=>{throw Error('Cached reads must not call upstream');}}),settings=env(db);
  const out=await (await app.fetch(new Request(`https://demo.example/api/pg-plan/${key}`),settings,{})).json();
  assert.equal(out.status,'cached',JSON.stringify(out));assert.equal(out.plan.status,'research_incomplete');assert.deepEqual(out.quality_filter.redacted_slots.map(s=>s.slot),[2,3]);assert.equal(out.plan.key_goal_for_week,'');
  assert.equal(out.generated_at,created);assert.equal(out.research.checked_at,created);assert.equal(out.usage.actual_cost_microusd,6846);assert.equal(db.sqlite.prepare('SELECT response_json FROM pg_jobs').get().response_json,raw);assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM pg_calls').get().n,0);
  assert.ok(out.plan.sources.every(s=>s.retrieved_at===draft.sources.find(original=>original.id===s.id).retrieved_at));
});
