import { beginCall,finishCall,markCallUnknown } from './budget.mjs';

const API = 'https://openrouter.ai/api/v1';
export class PublicError extends Error {
  constructor(code, { unknown=false,detail=null }={}) { super(code);this.code=code;this.unknown=unknown;this.detail=detail; }
}
export async function boundedJson(response, maxBytes=1_500_000) {
  if (Number(response.headers.get('content-length') || 0)>maxBytes) throw new PublicError('upstream_response_too_large',{unknown:true});
  const reader=response.body?.getReader();if(!reader)throw new PublicError('empty_upstream_response',{unknown:true});
  const chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new PublicError('upstream_response_too_large',{unknown:true});}chunks.push(value);}
  const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(all));}catch{throw new PublicError('invalid_upstream_json',{unknown:true});}
}
async function timedFetch(fetchImpl,url,options={},ms=45_000){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),ms);
  try{return await fetchImpl(url,{...options,signal:controller.signal});}finally{clearTimeout(timer);}
}
function headers(env){return {Authorization:`Bearer ${env.OPENROUTER_API_KEY}`,'Content-Type':'application/json','HTTP-Referer':env.APP_URL || 'https://blast-radius-plans.alluringdoor.chatgpt.site','X-Title':'Blast Radius PG Plans'};}
const price=m=>({prompt:Number(m.pricing?.prompt)*1e6,completion:Number(m.pricing?.completion)*1e6});
function eligible(model,stage){
  const p=price(model),params=model.supported_parameters || [];
  const ceilings=stage==='research'?{prompt:0.25,completion:0.5}:{prompt:0.5,completion:3};
  return typeof model.id==='string'&&!model.id.includes(':')&&!/preview|omni|audio|image|voxtral|embedding/i.test(model.id)
    &&model.architecture?.output_modalities?.length===1&&model.architecture.output_modalities[0]==='text'
    &&params.includes('response_format')&&params.includes('structured_outputs')
    &&(stage!=='research'||(params.includes('tools')&&Number(model.context_length)<=40960))
    &&Number.isFinite(p.prompt)&&Number.isFinite(p.completion)&&p.prompt>=0&&p.completion>=0&&p.prompt<=ceilings.prompt&&p.completion<=ceilings.completion;
}
export function selectModels(catalog,stage){
  const candidates=catalog.filter(m=>eligible(m,stage)).sort((a,b)=>Number(b.created||0)-Number(a.created||0));
  const preferences=stage==='research'?[m=>m.id.startsWith('qwen/'),m=>m.id.startsWith('qwen/')]:[m=>m.id.startsWith('google/')&&m.id.includes('flash'),m=>m.id.startsWith('openai/')];
  const chosen=[];
  for(const prefer of preferences){const next=candidates.find(m=>prefer(m)&&!chosen.some(c=>c.id===m.id));if(next)chosen.push(next);}
  for(const candidate of candidates)if(chosen.length<2&&!chosen.some(c=>c.id===candidate.id))chosen.push(candidate);
  if(chosen.length!==2)throw new PublicError('supported_models_unavailable');
  return chosen;
}
export async function getCatalog(fetchImpl){
  const response=await timedFetch(fetchImpl,`${API}/models`,{},15_000);
  if(!response.ok)throw new PublicError('model_catalog_unavailable');
  const payload=await boundedJson(response,8_000_000);
  if(!Array.isArray(payload.data))throw new PublicError('model_catalog_unavailable');
  return payload.data;
}
export async function getKeyUsageNanousd(fetchImpl,env){
  const response=await timedFetch(fetchImpl,`${API}/key`,{headers:headers(env)},15_000);
  if(!response.ok)throw new PublicError('billing_baseline_unavailable');
  const data=await boundedJson(response,64_000);const usage=Number(data.data?.usage);
  if(!Number.isFinite(usage)||usage<0||usage>1_000_000)throw new PublicError('billing_baseline_unavailable');
  return Math.round(usage*1e9);
}
export async function generationCost(fetchImpl,env,id){
  if(typeof id!=='string'||!id||id.length>256)throw new PublicError('generation_billing_unavailable');
  const response=await timedFetch(fetchImpl,`${API}/generation?id=${encodeURIComponent(id)}`,{headers:headers(env)},15_000);
  if(!response.ok)throw new PublicError('generation_billing_unavailable');
  const data=(await boundedJson(response,64_000)).data;
  if(typeof data?.total_cost!=='number'||!Number.isFinite(data.total_cost)||data.total_cost<0)throw new PublicError('generation_billing_unavailable');
  return data.total_cost;
}
export function basePayload(models,stage,messages,schema){
  const research=stage.startsWith('research');
  const payload={models:models.map(m=>m.id),messages,max_tokens:research?1500:3500,usage:{include:true},
    // Keep the complex PG schema in the prompt and enforce it locally. The
    // deployed planning provider rejected the otherwise valid strict schema.
    response_format:research?{type:'json_schema',json_schema:{name:'public_research',strict:true,schema}}:{type:'json_object'},
    provider:{require_parameters:true,allow_fallbacks:false,max_price:{prompt:research?0.25:0.5,completion:research?0.5:3}}};
  if(models.every(m=>m.supported_parameters?.includes('reasoning')))payload.reasoning={effort:'minimal'};
  if(research){
    payload.tools=[{type:'openrouter:web_search',parameters:{engine:'exa',mode:'fast',max_results:2,max_total_results:2,max_uses:1,max_characters:750}}];
    payload.max_tool_calls=1;
    // Use the provider's default auto selection. The deployed endpoints rejected
    // tool_choice:required; observed search usage and first-party citations are
    // still mandatory before planning, so skipping search cannot fake a result.
  }
  return payload;
}
function parseContent(content){
  if(typeof content!=='string'||!content.trim())throw new PublicError('missing_final_content');
  const cleaned=content.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{return JSON.parse(cleaned);}catch{throw new PublicError('invalid_structured_output');}
}
export function webSearchCount(usage){return Number(usage?.server_tool_use_details?.web_search_requests ?? usage?.server_tool_use_details?.web_search?.executed ?? usage?.server_tool_use?.web_search_requests ?? 0);}
export async function callOpenRouter({db,key,stage,models,payload,fetchImpl,env}){
  const bytes=new TextEncoder().encode(JSON.stringify(payload)).byteLength;
  if(bytes>(stage.startsWith('research')?10_000:20_000))throw new PublicError('request_exceeds_reserved_bound');
  const id=crypto.randomUUID();await beginCall(db,{id,key,stage,models:models.map(m=>m.id)});
  let billed=false;
  try{
    const response=await timedFetch(fetchImpl,`${API}/chat/completions`,{method:'POST',headers:headers(env),body:JSON.stringify(payload)});
    if(!response.ok){
      let error={};try{error=(await boundedJson(response,64_000)).error || {};}catch{}
      let diagnostic=JSON.stringify(error);
      for(const secret of [env.OPENROUTER_API_KEY,env.ADMIN_TOKEN])if(secret)diagnostic=diagnostic.split(secret).join('[redacted]');
      diagnostic=diagnostic.replace(/sk-or-[^\s"\\]+/g,'[redacted]').replace(/Bearer\s+[^\s"\\]+/gi,'Bearer [redacted]').slice(0,4000);
      // Provider diagnostics are retained only in private D1 metadata. The
      // public usage projection never includes metadata_json.
      await db.prepare('UPDATE pg_calls SET metadata_json=? WHERE id=?').bind(JSON.stringify({http_status:response.status,error_code:error.code || null,error_message:String(error.message || '').replace(/sk-or-\S+/g,'[redacted]').slice(0,240),provider_diagnostic:diagnostic}),id).run();
      throw new PublicError('upstream_rejected_request',{unknown:true});
    }
    const result=await boundedJson(response);const message=result.choices?.[0]?.message;
    if(typeof result.id==='string')await db.prepare('UPDATE pg_calls SET generation_id=?,served_model=? WHERE id=?').bind(result.id,result.model || null,id).run();
    let cost=result.usage?.cost;
    if(cost===null||cost===undefined){
      const generation=await timedFetch(fetchImpl,`${API}/generation?id=${encodeURIComponent(result.id || '')}`,{headers:headers(env)},15_000);
      if(generation.ok)cost=(await boundedJson(generation,64_000)).data?.total_cost;
    }
    if(typeof cost!=='number'||!Number.isFinite(cost)||cost<0)throw new PublicError('usage_cost_unresolved',{unknown:true});
    const searches=webSearchCount(result.usage);
    const outcome={model:result.model || null,generation_id:result.id || null,cost_usd:cost,cost_microusd:Math.ceil(cost*1e6),web_search_requests:searches,
      fallback_observed:models.slice(1).some(m=>m.id===result.model),metadata:{usage:result.usage,finish_reason:result.choices?.[0]?.finish_reason || null}};
    await finishCall(db,id,outcome);billed=true;
    return {...outcome,content:parseContent(message?.content),annotations:Array.isArray(message?.annotations)?message.annotations:[]};
  }catch(error){
    if(!billed)await markCallUnknown(db,id,error.code || 'request_outcome_unknown');
    if(error instanceof PublicError){error.unknown=error.unknown||!billed;throw error;}
    throw new PublicError('request_outcome_unknown',{unknown:!billed});
  }
}
export function belongsToDomain(url,domain){try{const p=new URL(url);return p.protocol==='https:'&&!p.username&&!p.password&&!p.port&&(p.hostname===domain||p.hostname.endsWith(`.${domain}`));}catch{return false;}}
export function liveSources(annotations,{accountDomain,sellerDomain,now}){
  const sources=[];const seen=new Set();
  for(const item of annotations){
    const c=item.url_citation || (item.type==='url_citation'?item:null);
    if(!c||typeof c.url!=='string'||seen.has(c.url)||c.url.length>2048)continue;
    const companyDomain=belongsToDomain(c.url,accountDomain)?accountDomain:belongsToDomain(c.url,sellerDomain)?sellerDomain:null;
    const content=typeof c.content==='string'?c.content.trim():'';
    if(!companyDomain||content.length<40)continue;
    seen.add(c.url);sources.push({id:`live-${sources.length+1}`,url:c.url,title:String(c.title || new URL(c.url).hostname).slice(0,200),publisher:new URL(c.url).hostname,published_at:null,
      retrieved_at:now,quote:'',excerpt:content.slice(0,750),quote_allowed:true,origin:'live_web',currentness:'live_retrieved',company_domain:companyDomain});
    if(sources.length>=4)break;
  }
  return sources;
}
