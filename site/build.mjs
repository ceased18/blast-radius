import { cp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectPublicPack, copyVerifiedPublicPack } from './lib/public-pack.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const modeIndex = process.argv.indexOf('--mode');
const mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : 'public';
if (!['private', 'public'].includes(mode)) throw new Error('Use --mode public or --mode private');
const output = resolve(root, mode === 'private' ? 'dist' : 'dist-public');
const dataRoot = join(here, 'public', 'data');
const evidenceRoot = join(root, 'public-evidence');
const publicPack = await inspectPublicPack(evidenceRoot);
await access(join(dataRoot, 'public.json'));
if (mode === 'private') await access(join(dataRoot, 'private.json'));
const aggregate = JSON.parse(await readFile(join(dataRoot, 'public.json'), 'utf8'));
if (aggregate.mode !== 'public') throw new Error('public.json must be an aggregate-only public export');
for (const key of ['accounts', 'incidents', 'replays', 'digest', 'runs']) {
  if (key in aggregate) throw new Error(`Public export contains forbidden field: ${key}`);
}
await rm(output, { recursive: true, force: true });
await mkdir(join(output, 'data'), { recursive: true });
await cp(join(here, 'index.html'), join(output, 'index.html'));
await cp(join(here, 'favicon.svg'), join(output, 'favicon.svg'));
await cp(join(here, 'src'), join(output, 'src'), { recursive: true });
await cp(join(dataRoot, 'public.json'), join(output, 'data', 'public.json'));
if (mode === 'private') await cp(join(dataRoot, 'private.json'), join(output, 'data', 'private.json'));
await copyVerifiedPublicPack(publicPack, output);
await writeFile(join(output, 'build-config.json'), JSON.stringify({ mode, public_agent_base: 'https://ceased18.github.io/blast-radius/', repository_url: 'https://github.com/ceased18/blast-radius' }) + '\n');
await writeFile(join(output, '.nojekyll'), '');
console.log(JSON.stringify({ mode, output, full_private_payload: mode === 'private', public_named_examples: publicPack.accountCount }));
