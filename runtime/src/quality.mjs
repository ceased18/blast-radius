// Conservative deterministic editing, never evidence creation or a model repair.
const norm=value=>String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const textOf=s=>String(s?.verbatim_excerpt || s?.quote || s?.excerpt || '');
const unsupportedControl=/\b(?:without|lack(?:s|ing)?|missing|absence of|limit(?:s|ed|ing)?\s+(?:\w+\s+){0,2}(?:telemetry|visibility)|(?:telemetry|visibility)\s+(?:gap|limitation)s?)\b/i;
const unverifiedWork=/\b(?:manual(?:ly)?|administrative overhead|admin overhead)\b/i;
function refs(value,out=new Set()){
  if(Array.isArray(value))for(const item of value)refs(item,out);
  else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){if(key==='sources')continue;if(key==='source_ids'&&Array.isArray(item))for(const id of item)out.add(id);else refs(item,out);}
  return out;
}
function repeatedClaims(a,b){
  const related=(x,y)=>x===y||(Math.min(x.length,y.length)>=60&&(x.startsWith(y)||y.startsWith(x)));
  return a.length&&b.length&&a.every(x=>b.some(y=>related(x,y)))&&b.every(y=>a.some(x=>related(x,y)));
}
function gap(index,reasons){
  return {title:`Evidence gap ${index+1}`,statement:'The available sources do not establish a distinct current pressure for this slot.',evidence_status:'insufficient_evidence',evidence:[],
    cost_of_inaction:{statement:'Unknown from the current public evidence.',basis:'unknown',source_ids:[]},why_seller:{statement:'Seller relevance remains unverified until this evidence gap is resolved.',source_ids:[]},confidence:null,
    missing_evidence:`Independent current account evidence is needed before making this claim. Filter reason: ${reasons.join('; ')}.`};
}
export function conservativePlan(candidate,{sources=[]}={}){
  const plan=structuredClone(candidate),redacted=[],costs=[],seen=[];
  const byId=new Map(sources.map(s=>[s.id,s]));
  if(!Array.isArray(plan?.pains))return {plan,quality_filter:{version:'conservative-v1',applied:false,redacted_slots:[],limitations:['Structure still requires validation.']}};
  for(const [index,pain] of plan.pains.entries()){
    if(pain.evidence_status==='insufficient_evidence')continue;
    const claims=[...new Set((pain.evidence || []).map(e=>norm(e.claim)).filter(Boolean))].sort();
    const reasons=[];
    if(seen.some(previous=>repeatedClaims(claims,previous)))reasons.push('Repeated or prefix-equivalent evidence does not establish a distinct pressure');
    seen.push(claims);
    const cited=[...refs(pain)].map(id=>byId.get(id)).filter(Boolean);
    const authentic=cited.filter(s=>s.quote_allowed===true&&norm(s.company_domain)===norm(plan.account?.domain)).map(textOf);
    for(const sentence of [pain.statement,pain.cost_of_inaction?.statement].flatMap(s=>String(s || '').split(/(?<=[.!?])\s+/))){
      if(unsupportedControl.test(sentence)&&!authentic.some(text=>norm(text).includes(norm(sentence))))reasons.push('A missing-control or reduced-visibility premise is not established by the cited source text');
    }
    if(/\bskills\b/i.test([pain.statement,...(pain.evidence || []).map(e=>e.claim)].join(' '))&&!authentic.some(text=>/\bskills\b.{0,100}\b(?:available|launched|in production)\b|\b(?:available|launched|in production)\b.{0,100}\bskills\b/i.test(text)))reasons.push('Current feature availability is not established by the retained excerpt');
    if(pain.evidence_status==='verified_pressure')reasons.push('Bounded public research does not establish verified adverse impact');
    if(reasons.length){const unique=[...new Set(reasons)];plan.pains[index]=gap(index,unique);redacted.push({slot:index+1,reasons:unique});continue;}
    if(unverifiedWork.test(pain.cost_of_inaction?.statement || '')&&!authentic.some(text=>norm(text).includes(norm(pain.cost_of_inaction.statement)))){
      pain.cost_of_inaction={statement:'Unknown from current public evidence; manual work or administrative overhead has not been established.',basis:'unknown',source_ids:pain.cost_of_inaction.source_ids};costs.push(index+1);
    }
  }
  if(plan.pains.some(p=>p.evidence_status==='insufficient_evidence'))plan.status='research_incomplete';
  const hypothesis=plan.initial_value_hypothesis?.statement;
  if(typeof hypothesis==='string'&&!hypothesis.startsWith('Unverified test hypothesis: '))plan.initial_value_hypothesis.statement=`Unverified test hypothesis: ${hypothesis}`;
  const used=refs(plan);if(Array.isArray(plan.sources))plan.sources=plan.sources.filter(s=>used.has(s.id));
  return {plan,quality_filter:{version:'conservative-v1',applied:true,redacted_slots:redacted,costs_reset_to_unknown:costs,
    hypothesis_disposition:'Conditional, unverified test; not a recommendation',raw_candidate_preserved_privately:true,
    limitations:['Deterministic conservative filtering does not establish the semantic truth of retained inferences.','Evidence gaps replace unsupported claims; they are not newly invented pains.']}};
}
