// Operator-only helper. Secret values arrive through hidden stdin, never argv.
const ORIGIN='https://blast-radius-plans.alluringdoor.chatgpt.site';
let raw=false;
if(process.stdin.isTTY){raw=Boolean(process.stdin.isRaw);process.stdin.setRawMode(true);}
process.stdout.write('Ready for operator JSON on stdin (input is hidden).\n');
let input='';
try{
  for await(const chunk of process.stdin){input+=chunk.toString();if(input.length>4096)throw Error('Operator input exceeds its bound');if(/[\r\n]/.test(input))break;}
}finally{if(process.stdin.isTTY)process.stdin.setRawMode(raw);process.stdin.pause();}
try{
  const value=JSON.parse(input.trim());
  const action=value.action || 'reconcile';
  if(typeof value.admin_token!=='string'||value.admin_token.length<16||!['generate','reconcile','replan'].includes(action))throw Error('Invalid operator fields');
  if(action!=='generate'&&!/^[a-f0-9]{64}$/.test(value.cache_key || ''))throw Error('Invalid cache identifier');
  const body=action==='generate'?{account_domain:value.account_domain,seller:value.seller || 'OpenRouter',seller_domain:value.seller_domain || 'openrouter.ai'}:action==='replan'?{cache_key:value.cache_key}:{cache_key:value.cache_key,confirm_no_other_key_activity:value.confirm_no_other_key_activity===true};
  const response=await fetch(`${ORIGIN}/api/admin/${action}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${value.admin_token}`},body:JSON.stringify(body),signal:AbortSignal.timeout(action!=='reconcile'?210_000:30_000)});
  const result=await response.json();process.stdout.write(JSON.stringify({http_status:response.status,...result})+'\n');
}catch{process.stderr.write('Reconciliation could not be completed; no secret was printed.\n');process.exitCode=1;}
