import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {executeReferenceFixture} from '../../../harness/shared/reference.mjs';

const referenceRoot = process.env.AA_REFERENCE_ROOT;
assert.ok(referenceRoot, 'AA_REFERENCE_ROOT must identify the installed exact reference checkout');

for (const name of ['marketplace', 'marketplace-not-found', 'single-sale', 'sale-not-found', 'sale-invalid-id']) {
  test(`the original Market HTTP route matches the captured ${name} response`, async () => {
    const bytes = await readFile(new URL(`./${name}.input.json`, import.meta.url));
    const input = JSON.parse(bytes);
    const expected = JSON.parse(await readFile(new URL(`./${name}.expected.json`, import.meta.url)));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.fixtureSha256);
    const result = await executeReferenceFixture({referenceRoot, fixture: input});
    const {query_time: queryTime, ...body} = result.response.body;
    assert.deepEqual({status: result.response.status, body}, {status: expected.status, body: expected.body});
    if (result.response.status === 200) assert.equal(Number.isSafeInteger(queryTime), true);
    assert.equal(result.database.executed.length, expected.referenceExecution.databaseQueries);
    assert.equal(result.database.unused, 0);
    assert.equal(result.scope.originalHttpServer, true);
    assert.equal(result.scope.postgresExecution, false);
    assert.equal(result.scope.hyperionPluginExecution, false);
    assert.equal(result.execution.exitCode, 0);
  });
}
