import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {executeReferenceFixture} from '../harness/shared/reference.mjs';

const referenceRoot = process.env.AA_REFERENCE_ROOT;
assert.ok(referenceRoot, 'AA_REFERENCE_ROOT must identify the installed exact reference checkout');
const fixture = async name => JSON.parse(await readFile(new URL(`../fixtures/harness/atomicassets/${name}.input.json`, import.meta.url), 'utf8'));
async function assertCapturedResponse(name, response) {
  const expected = JSON.parse(await readFile(new URL(`../fixtures/harness/atomicassets/${name}.expected.json`, import.meta.url), 'utf8'));
  const body = structuredClone(response.body);
  if (Object.hasOwn(body, 'query_time')) delete body.query_time;
  assert.deepEqual({status: response.status, body}, expected);
}

test('the actual reference HTTP single-asset route preserves exact IDs and layered metadata', async () => {
  const result = await executeReferenceFixture({referenceRoot, fixture: await fixture('single-asset')});
  assert.equal(result.response.status, 200);
  assert.equal(result.response.body.success, true);
  const asset = result.response.body.data;
  assert.equal(asset.asset_id, '9007199254740993');
  assert.equal(asset.name, 'template-immutable');
  assert.equal(asset.data.description, 'fallback');
  assert.equal(asset.data.rank, 1);
  assert.equal(asset.original_mint, null);
  assert.equal(asset.schema.format[1].mediatype, 'image/png');
  assert.equal(Object.hasOwn(asset.schema, 'types'), false);
  assert.equal(Object.hasOwn(asset, 'template_id'), false);
  assert.equal(Number.isSafeInteger(result.response.body.query_time), true);
  assert.equal(result.database.executed.length, 1);
  assert.equal(result.database.unused, 0);
  assert.equal(result.reference.commit, '0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');
  assert.equal(result.scope.database, 'synthetic-database-boundary');
  assert.equal(result.scope.postgresExecution, false);
  await assertCapturedResponse('single-asset', result.response);
});

test('the actual reference missing-asset error is HTTP 416', async () => {
  const result = await executeReferenceFixture({referenceRoot, fixture: await fixture('asset-not-found')});
  assert.equal(result.response.status, 416);
  assert.deepEqual(result.response.body, {success: false, message: 'Asset not found'});
  assert.equal(result.database.executed.length, 1);
  await assertCapturedResponse('asset-not-found', result.response);
});

test('the actual reference rejects an invalid path ID before any database query', async () => {
  const result = await executeReferenceFixture({referenceRoot, fixture: await fixture('asset-invalid-id')});
  assert.equal(result.response.status, 400);
  assert.deepEqual(result.response.body, {success: false, message: 'Invalid value for parameter asset_id'});
  assert.equal(result.database.executed.length, 0);
  await assertCapturedResponse('asset-invalid-id', result.response);
});

test('the harness rejects a fixture that cannot account for the original database request', async () => {
  const input = await fixture('single-asset');
  input.queries[0].parameters = ['another-contract', ['9007199254740993']];
  await assert.rejects(executeReferenceFixture({referenceRoot, fixture: input}), /left scripted database queries unused/);
});
