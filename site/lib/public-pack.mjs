import { lstat, readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

export const approvedDomains = Object.freeze(['cartesia.ai', 'github.com', 'glean.com', 'gorgias.com', 'hubspot.com', 'omni.co']);
const scope = 'bounded_public_evidence_snapshot';
const privateFields = new Set(['outreach', 'emails', 'email', 'brief', 'ae_brief', 'personas', 'runs', 'raw', 'payload', 'phone', 'phones', 'phone_number', 'api_key', 'authorization', 'linkedin_note', 'call_opener']);
const accountFields = ['schema_version', 'snapshot_id', 'record_status', 'scope', 'domain', 'name', 'status_url', 'source_text_policy', 'coverage', 'evidence', 'qualification', 'what_it_proves', 'what_it_does_not_prove', 'open_questions'].sort();
const expectedAPIPaths = ['api/v1/manifest.json', 'api/v1/accounts/index.json', 'api/v1/openapi.json', 'api/v1/schemas/account.schema.json', 'api/v1/schemas/index.schema.json', 'api/v1/schemas/not-covered.schema.json', ...approvedDomains.map(domain => `api/v1/accounts/${domain}.json`)];

function assertPublic(value) {
  if (typeof value === 'string' && /sk-or-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{12,}/i.test(value)) throw new Error('Credential-like content in public pack');
  if (Array.isArray(value)) return value.forEach(assertPublic);
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    if (privateFields.has(key)) throw new Error(`Private field in public pack: ${key}`);
    assertPublic(child);
  }
}

async function walk(root, relative) {
  const path = join(root, relative);
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw new Error(`Symlinks are not allowed in public pack: ${relative}`);
  if (stat.isFile()) return [relative];
  if (!stat.isDirectory()) throw new Error(`Unsupported public pack entry: ${relative}`);
  const result = [];
  for (const child of await readdir(path)) result.push(...await walk(root, `${relative}/${child}`));
  return result;
}

export async function inspectPublicPack(directory) {
  const root = resolve(directory);
  if ((await lstat(root)).isSymbolicLink()) throw new Error('Public pack root must not be a symlink');
  const actual = (await walk(root, 'api')).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expectedAPIPaths].sort())) throw new Error('Public API files differ from the explicit published allowlist');
  const assets = new Map();
  for (const relative of [...expectedAPIPaths, 'llms.txt', 'agents.txt']) {
    const path = join(root, relative);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256_000) throw new Error(`Invalid public pack asset: ${relative}`);
    const bytes = await readFile(path);
    assertPublic(relative.endsWith('.json') ? JSON.parse(bytes.toString('utf8')) : bytes.toString('utf8'));
    assets.set(relative, bytes);
  }
  const manifest = JSON.parse(assets.get('api/v1/manifest.json'));
  const index = JSON.parse(assets.get('api/v1/accounts/index.json'));
  if (manifest.scope !== scope || index.scope !== scope || manifest.schema_version !== '1.0' || index.schema_version !== '1.0' || index.snapshot_id !== manifest.snapshot_id) throw new Error('Invalid or mismatched public snapshot identity');
  const domains = (index.accounts || []).map(account => account.domain).sort();
  if (JSON.stringify(domains) !== JSON.stringify(approvedDomains) || JSON.stringify([...(manifest.account_domains || [])].sort()) !== JSON.stringify(approvedDomains) || manifest.account_count !== approvedDomains.length || index.account_count !== approvedDomains.length) throw new Error('Public account roster differs from the six approved domains');
  for (const entry of index.accounts) {
    if (entry.path !== `accounts/${entry.domain}.json`) throw new Error('Public account path must be an exact indexed domain path');
    const bytes = assets.get(`api/v1/${entry.path}`);
    if (createHash('sha256').update(bytes).digest('hex') !== entry.content_sha256) throw new Error(`Public record digest mismatch: ${entry.domain}`);
    const account = JSON.parse(bytes);
    if (account.domain !== entry.domain || account.scope !== scope || account.record_status !== 'in_snapshot' || account.snapshot_id !== manifest.snapshot_id || JSON.stringify(Object.keys(account).sort()) !== JSON.stringify(accountFields)) throw new Error(`Invalid public account contract: ${entry.domain}`);
  }
  return { manifest, accountCount: approvedDomains.length, assets };
}

export async function copyVerifiedPublicPack(pack, output) {
  for (const [relative, bytes] of pack.assets) {
    const path = join(output, relative);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }
}
