import {readFile,writeFile,readdir,mkdir,rm,copyFile,lstat} from 'node:fs/promises';
import {resolve,join,dirname,extname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),args=process.argv.slice(2);
const at=args.indexOf('--static-source'),incoming=at>=0?resolve(args[at+1]):null,publicDir=join(root,'public');
if(incoming&&basename(incoming)!=='dist-public')throw Error('Only verified dist-public assets may be synchronized');
const source=incoming || publicDir,files=[];
async function walk(dir,relative=''){
  for(const name of await readdir(dir)){
    const rel=relative?`${relative}/${name}`:name,path=join(dir,name),info=await lstat(path);
    if(rel==='.nojekyll')continue;
    if(info.isSymbolicLink())throw Error(`Symlink rejected: ${rel}`);
    if(info.isDirectory()){await walk(path,rel);continue;}
    if(!info.isFile()||info.size>2_000_000)throw Error(`Unsupported public asset: ${rel}`);
    if(/(?:^|\/)(?:private|\.env|\.openai|node_modules)(?:[./]|$)/i.test(rel)||/private\.json|blast\.db|digest|glenn_report|\.sqlite/i.test(rel))throw Error(`Private artifact rejected: ${rel}`);
    if(!(['index.html','config.json','build-config.json','llms.txt','agents.txt','favicon.svg','workflows/pg-plan.md','skills/blast-pg-plan/SKILL.md','data/public.json'].includes(rel)||/^(src|lib|api\/v1)\//.test(rel)))throw Error(`Asset outside explicit public paths: ${rel}`);
    const data=await readFile(path);if(/sk-or-[A-Za-z0-9_-]{12,}/.test(data.toString('utf8')))throw Error(`Credential-shaped public content rejected: ${rel}`);
    files.push({rel,data});
  }
}
await walk(source);
const file=name=>files.find(f=>f.rel===name);
if(JSON.parse(file('data/public.json')?.data.toString() || '{}').mode!=='public')throw Error('Missing public aggregate projection');
const manifest=JSON.parse(file('api/v1/manifest.json')?.data.toString() || '{}'),domains=['cartesia.ai','github.com','glean.com','gorgias.com','hubspot.com','omni.co'];
if(JSON.stringify([...(manifest.account_domains || [])].sort())!==JSON.stringify(domains))throw Error('Only authorized six-company evidence may be embedded');
const index=JSON.parse(file('api/v1/accounts/index.json')?.data.toString() || '{}');
for(const entry of index.accounts || []){
  if(!domains.includes(entry.domain)||entry.path!==`accounts/${entry.domain}.json`)throw Error('Invalid public account entry');
  const raw=file(`api/v1/${entry.path}`)?.data;
  if(!raw||createHash('sha256').update(raw).digest('hex')!==entry.content_sha256)throw Error('Public evidence digest mismatch');
  const record=JSON.parse(raw.toString());if(record.scope!=='bounded_public_evidence_snapshot'||record.outreach||record.brief||record.runs)throw Error('Private-shaped evidence rejected');
}
if(incoming){await rm(publicDir,{recursive:true,force:true});for(const f of files){const dest=join(publicDir,f.rel);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,f.data);}}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.md':'text/markdown; charset=utf-8','.svg':'image/svg+xml'};
const assets=Object.fromEntries(files.map(f=>[`/${f.rel}`,{mime:mime[extname(f.rel)] || 'application/octet-stream',text:f.data.toString('utf8')} ]));
await mkdir(join(root,'src'),{recursive:true});await writeFile(join(root,'src/generated_assets.mjs'),`// Generated from approved public assets only.\nexport const ASSETS=${JSON.stringify(assets)};\n`);
await rm(join(root,'dist'),{recursive:true,force:true});await mkdir(join(root,'dist/server'),{recursive:true});await mkdir(join(root,'dist/.openai'),{recursive:true});
await build({entryPoints:[join(root,'worker/index.js')],outfile:join(root,'dist/server/index.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',legalComments:'none'});
await copyFile(join(root,'.openai/hosting.json'),join(root,'dist/.openai/hosting.json'));
console.log(`Built public runtime with ${files.length} approved assets and six named examples.`);
