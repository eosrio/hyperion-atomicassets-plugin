import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import test from 'node:test';
import {formatSale} from '../dist/atomicmarket/sale.js';
import {saleFormatterCases, saleFormatterInput} from './fixtures/sale-formatter-cases.mjs';
import {executeReferenceFixture} from '../harness/shared/reference.mjs';

const base = JSON.parse(await readFile(new URL('../fixtures/harness/atomicmarket/single-sale.input.json', import.meta.url)));
const golden = JSON.parse(await readFile(new URL('./fixtures/sale-formatter.expected.json', import.meta.url)));
assert.ok(process.env.AA_REFERENCE_ROOT, 'AA_REFERENCE_ROOT must identify the exact installed reference');
await mkdir('out', {recursive: true});
const evidence = await mkdtemp(`out/sale-formatter-${process.versions.node}-`);
for (const {name, fixture, invalid} of saleFormatterCases(base)) test(`portable sale formatter vs original HTTP: ${name}`, async () => {
  const result = await executeReferenceFixture({referenceRoot: process.env.AA_REFERENCE_ROOT, fixture});
  await writeFile(`${evidence}/${name}.raw.json`, JSON.stringify(result, null, 2) + '\n');
  const body = structuredClone(result.response.body); delete body.query_time;
  assert.deepEqual({status: result.response.status, body}, golden[name]);
  assert.equal(result.reference.commit, '0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');
  assert.equal(result.database.unused, 0);
  assert.equal(result.database.executed.length, fixture.queries.length);
  // This component consumes assembled assets. The independent original HTTP result supplies
  // those members; the new formatter never supplies its own enrichment or expected response.
  const row = saleFormatterInput(fixture, {body}), original = structuredClone(row);
  if (invalid) {
    assert.equal(result.response.status, 500);
    assert.throws(() => formatSale(row), TypeError);
  } else {
    assert.equal(result.response.status, 200);
    const formatted = formatSale(row);
    assert.deepEqual(JSON.parse(JSON.stringify(formatted)), body.data);
    assert.equal(JSON.stringify(formatted), JSON.stringify(body.data), 'field and array order follows original HTTP');
    assert.deepEqual(row, original);
    formatted.price.probe = 'isolated';
    formatted.assets.push({probe: 'isolated'});
    if (formatted.extension?.nested) formatted.extension.nested[2].exact = 'changed';
  }
  assert.deepEqual(row, original, 'caller-owned nested values remain unchanged');
});
