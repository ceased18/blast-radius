import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, writeFile, mkdir, rm, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectPublicPack, copyVerifiedPublicPack } from '../lib/public-pack.mjs';

const source = fileURLToPath(new URL('../../public-evidence/', import.meta.url));
async function fixture(callback) {
  const directory = await mkdtemp(join(tmpdir(), 'blast-public-boundary-'));
  try { const pack = join(directory, 'pack'); await cp(source, pack, { recursive: true }); await callback(pack, directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test('public publication copies only the approved six records and documented assets', async () => {
  const pack = await inspectPublicPack(source);
  assert.equal(pack.accountCount, 6);
  assert.equal(pack.assets.has('data/private.json'), false);
  assert.equal(pack.assets.has('api/v1/private.json'), false);
  await fixture(async (unused, directory) => {
    await copyVerifiedPublicPack(pack, join(directory, 'output'));
    const copied = JSON.parse(await readFile(join(directory, 'output/api/v1/accounts/cartesia.ai.json'), 'utf8'));
    assert.equal(copied.domain, 'cartesia.ai');
    assert.equal('outreach' in copied, false);
  });
});

test('the downloadable PG skill is an exact copy of the canonical repository skill', async () => {
  const canonical = await readFile(new URL('../../skills/blast-pg-plan/SKILL.md', import.meta.url));
  const pack = await inspectPublicPack(source);
  assert.deepEqual(pack.assets.get('skills/blast-pg-plan/SKILL.md'), canonical);
  await fixture(async (unused, directory) => {
    const output = join(directory, 'output');
    await copyVerifiedPublicPack(pack, output);
    assert.deepEqual(await readFile(join(output, 'skills/blast-pg-plan/SKILL.md')), canonical);
  });
});

test('an unindexed private payload inside api prevents publication', async () => fixture(async pack => {
  await writeFile(join(pack, 'api/v1/private.json'), JSON.stringify({ outreach: { emails: ['private draft'] } }));
  await assert.rejects(inspectPublicPack(pack), /explicit published allowlist/);
}));

test('symlinked evidence cannot escape the approved public source directory', async () => fixture(async (pack, directory) => {
  const accountPath = join(pack, 'api/v1/accounts/cartesia.ai.json');
  const outside = join(directory, 'outside.json');
  await cp(accountPath, outside); await rm(accountPath); await symlink(outside, accountPath);
  await assert.rejects(inspectPublicPack(pack), /Symlinks/);
}));

test('edited account bytes are rejected when they no longer match the indexed digest', async () => fixture(async pack => {
  const path = join(pack, 'api/v1/accounts/cartesia.ai.json');
  await writeFile(path, `${await readFile(path, 'utf8')}\n`);
  await assert.rejects(inspectPublicPack(pack), /digest mismatch/);
}));
