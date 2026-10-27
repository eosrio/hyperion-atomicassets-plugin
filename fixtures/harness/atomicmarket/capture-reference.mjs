import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const [referenceRoot, sharedHarnessPath, outputDirectory, nodePath = process.execPath] = process.argv.slice(2);
if (!referenceRoot || !sharedHarnessPath || !outputDirectory) {
  throw new Error('Usage: node capture-reference.mjs REFERENCE_ROOT SHARED_HARNESS OUTPUT_DIRECTORY [NODE_EXECUTABLE]');
}
const {executeReferenceFixture} = await import(pathToFileURL(resolve(sharedHarnessPath)).href);
const cases = [
  ['marketplace', 200], ['marketplace-not-found', 416],
  ['single-sale', 200], ['sale-not-found', 416], ['sale-invalid-id', 400],
];
await mkdir(outputDirectory, {recursive: true});
assert.equal((await readdir(outputDirectory)).length, 0, 'Use a fresh evidence directory; do not overwrite prior results');
const harnessFiles = await Promise.all(['reference.mjs', 'reference-child.cjs'].map(async name => ({
  name, sha256: createHash('sha256').update(await readFile(resolve(dirname(sharedHarnessPath), name))).digest('hex'),
})));
const receipts = [];
for (const [name, expectedStatus] of cases) {
  const bytes = await readFile(new URL(`./${name}.input.json`, import.meta.url));
  const fixture = JSON.parse(bytes);
  let result;
  try {
    result = await executeReferenceFixture({referenceRoot, fixture, nodePath});
    await writeFile(resolve(outputDirectory, `${name}.raw.json`), `${JSON.stringify(result, null, 2)}\n`);
    assert.equal(result.response.status, expectedStatus);
    assert.equal(result.database.unused, 0);
    assert.equal(result.execution.exitCode, 0);
  } catch (error) {
    await writeFile(resolve(outputDirectory, `${name}.failed.json`), `${JSON.stringify({name, error: String(error?.stack ?? error)}, null, 2)}\n`);
    throw error;
  }
  const {query_time: queryTime, ...deterministicBody} = result.response.body;
  const capture = {
    schemaVersion: 1, baseline: fixture.baseline,
    fixtureKind: fixture.fixtureKind, fixtureSha256: createHash('sha256').update(bytes).digest('hex'),
    request: fixture.request, status: result.response.status, body: deterministicBody,
    excludedEnvironmentFields: fixture.environmentDependentFields,
    scope: result.scope,
    referenceExecution: {nodeVersion: result.execution.nodeVersion, exitCode: result.execution.exitCode, harnessFiles,
      databaseQueries: result.database.executed.length, unusedQueries: result.database.unused},
  };
  await writeFile(resolve(outputDirectory, `${name}.captured.json`), `${JSON.stringify(capture, null, 2)}\n`);
  receipts.push({name, status: capture.status, nodeVersion: capture.referenceExecution.nodeVersion,
    queries: capture.referenceExecution.databaseQueries, scope: capture.scope});
}
await writeFile(resolve(outputDirectory, 'summary.json'), `${JSON.stringify(receipts, null, 2)}\n`);
console.log(JSON.stringify(receipts.map(({name, status, nodeVersion, queries}) => ({name, status, nodeVersion, queries}))));
