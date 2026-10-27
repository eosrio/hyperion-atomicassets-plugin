import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import test from 'node:test';
import {formatAsset} from '../dist/atomicassets/asset.js';
import {executeReferenceFixture} from '../harness/shared/reference.mjs';
import {assetFormatterCases} from './fixtures/asset-formatter-cases.mjs';

assert.ok(process.env.AA_REFERENCE_ROOT, 'AA_REFERENCE_ROOT must identify the exact installed reference');
const base = JSON.parse(await readFile(new URL('../fixtures/harness/atomicassets/single-asset.input.json', import.meta.url)));
const golden = JSON.parse(await readFile(new URL('./fixtures/asset-formatter.expected.json', import.meta.url)));
await mkdir('out', {recursive: true});
const evidence = await mkdtemp(`out/asset-formatter-${process.versions.node}-`);
const wire = value => JSON.parse(JSON.stringify(value));
for (const {name, fixture, invalid} of assetFormatterCases(base)) test(`portable asset formatter vs original HTTP: ${name}`, async () => {
  const result = await executeReferenceFixture({referenceRoot: process.env.AA_REFERENCE_ROOT, fixture});
  await writeFile(`${evidence}/${name}.raw.json`, JSON.stringify(result, null, 2) + '\n');
  const body = structuredClone(result.response.body); delete body.query_time;
  assert.deepEqual({status: result.response.status, body}, golden[name]);
  assert.equal(result.reference.commit, '0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');
  assert.equal(result.database.unused, 0); assert.equal(result.database.executed.length, 1);
  const row = fixture.queries[0].rows[0], original = structuredClone(row);
  if (invalid) {assert.equal(result.response.status, 500); assert.throws(() => formatAsset(row), TypeError);}
  else {
    assert.equal(result.response.status, 200);
    const formatted = formatAsset(row);
    assert.equal(Object.hasOwn(formatted, 'template'), Object.hasOwn(row, 'template'));
    assert.deepEqual(wire(formatted), body.data);
    assert.equal(JSON.stringify(formatted), JSON.stringify(body.data), 'field and array order follows original HTTP');
    assert.deepEqual(row, original, 'formatting must not mutate the structured input');
    // Returned nested objects cannot mutate the caller's metadata/relationships either.
    formatted.mutable_data.probe = 'isolated';
    if (formatted.template) formatted.template.mutable_data.probe = 'isolated';
    assert.deepEqual(row, original);
  }
});
