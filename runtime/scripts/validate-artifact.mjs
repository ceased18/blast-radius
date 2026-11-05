import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workerPath = resolve(projectRoot, "dist/server/index.js");
const manifestPath = resolve(projectRoot, "dist/.openai/hosting.json");

const [source, manifest] = await Promise.all([
  readFile(workerPath, "utf8"),
  readFile(manifestPath, "utf8"),
]);
const hosting = JSON.parse(manifest);
assert.equal(hosting.d1, 'DB', 'Durable budget requires the DB binding');
assert.equal(hosting.static, undefined, 'This is a Worker, not a static deployment');
assert.ok(!/sk-or-[A-Za-z0-9_-]{12,}/.test(source), 'Credential-shaped bytes must never enter the Worker artifact');
const journal=JSON.parse(await readFile(resolve(projectRoot,'drizzle/meta/_journal.json'),'utf8'));
assert.ok(journal.entries.length>0,'Budget migrations must be packaged with the Site');
for(const migration of journal.entries)await readFile(resolve(projectRoot,`drizzle/${migration.tag}.sql`),'utf8');

// A data URL forces ESM parsing even though the generated output has no package.json.
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const workerModule = await import(moduleUrl);
assert.equal(
  typeof workerModule.default?.fetch,
  "function",
  `${pathToFileURL(workerPath)} must export default.fetch`,
);

console.log("Artifact is valid ESM and exports default.fetch");
