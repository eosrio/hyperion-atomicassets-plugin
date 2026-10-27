import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {readMarketplace} from '../../../dist/atomicmarket/marketplace.js';

async function referenceCase(name) {
  const bytes = await readFile(new URL(`./${name}.input.json`, import.meta.url));
  const fixture = JSON.parse(bytes);
  const expected = JSON.parse(await readFile(new URL(`./${name}.expected.json`, import.meta.url)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.fixtureSha256);
  assert.equal(expected.baseline.commit, '0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');
  return {fixture, expected};
}

const servingView = () => ({
  binding: {chainId: 'a'.repeat(64), backendId: 'mongodb', projectionId: 'marketplaces',
    mappingRevision: 'b'.repeat(64), abiDeployment: 'market-abi', abiSha256: 'c'.repeat(64), generation: 'qualified-instance'},
  checkpoint: {blockNum: 999, blockId: 'd'.repeat(64)}, revision: 'e'.repeat(64),
});

// This is a deterministic fixture at the public SDK query boundary, not a database adapter.
function scriptedProjection(records, returnedView, fail) {
  return {async query(_view, query) {
    if (fail) throw fail;
    const selected = records.filter(({value}) => query.filter.every(({field, op, value: target}) => {
      assert.equal(op, 'eq');
      return value[field] === target;
    })).sort((a, b) => Buffer.compare(Buffer.from(a.key), Buffer.from(b.key)));
    return {view: returnedView, rows: selected.slice(0, query.limit),
      ...(selected.length > query.limit ? {nextAfterKey: selected[query.limit - 1].key} : {})};
  }};
}

test('marketplace lookup matches the captured reference row, scopes the contract/name and retains its serving view', async () => {
  const {fixture, expected} = await referenceCase('marketplace');
  const referenceRow = fixture.queries[1].rows[0];
  const records = [
    {key: 'wrong-contract', value: {...referenceRow, market_contract: 'othermarket', creator: 'mallory'}},
    {key: 'wrong-name', value: {...referenceRow, market_contract: 'atomicmarket', marketplace_name: 'different', creator: 'bob'}},
    {key: 'selected', value: {...referenceRow, market_contract: 'atomicmarket'}},
  ];
  const opened = servingView(), returned = structuredClone(opened);
  const fixtureReader = scriptedProjection(records, returned);
  const reader = {async query(view, query) {
    assert.equal(view, opened);
    return fixtureReader.query(view, query);
  }};
  const result = await readMarketplace(reader, opened, 'atomicmarket', 'marketplace1');
  assert.deepEqual(result.data, expected.body.data);
  assert.equal(result.view, returned);
  assert.equal(result.data.created_at_block, '123');
  assert.notEqual(result.data.created_at_block, String(opened.checkpoint.blockNum));
});

test('missing marketplace preserves the captured 416 and message instead of inventing an empty record', async () => {
  const {expected} = await referenceCase('marketplace-not-found');
  const view = servingView();
  await assert.rejects(readMarketplace(scriptedProjection([], view), view, 'atomicmarket', 'marketplace1'), error => {
    assert.equal(error.statusCode, expected.status);
    assert.equal(error.message, expected.body.message);
    return true;
  });
});

test('adapter unavailability and stale-view failures propagate unchanged instead of becoming marketplace absence', async () => {
  const view = servingView();
  for (const code of ['projection.incomplete', 'projection.stale-view', 'projection.stale-revision']) {
    const failure = Object.assign(new Error('Projection cannot currently serve'), {code, retryable: true});
    await assert.rejects(readMarketplace(scriptedProjection([], view, failure), view, 'atomicmarket', 'marketplace1'),
      error => error === failure);
  }
});

test('marketplace name remains an exact equality value without trimming or case folding', async () => {
  const {fixture} = await referenceCase('marketplace');
  const records = [{key: 'only', value: {...fixture.queries[1].rows[0], market_contract: 'atomicmarket'}}];
  const view = servingView();
  for (const name of ['Marketplace1', ' marketplace1 ']) {
    await assert.rejects(readMarketplace(scriptedProjection(records, view), view, 'atomicmarket', name),
      error => error.statusCode === 416);
  }
});

test('ambiguous projection rows and invalid creation metadata do not become a compatible success', async () => {
  const {fixture} = await referenceCase('marketplace');
  const value = {...fixture.queries[1].rows[0], market_contract: 'atomicmarket'};
  const view = servingView();
  await assert.rejects(readMarketplace(scriptedProjection([{key: 'a', value}, {key: 'b', value}], view),
    view, 'atomicmarket', 'marketplace1'), /not unique/);
  await assert.rejects(readMarketplace(scriptedProjection([{key: 'a', value: {...value, created_at_time: 1700000000000}}], view),
    view, 'atomicmarket', 'marketplace1'), /created_at_time must be a string/);
});

test('an empty page with a continuation token is not proof of marketplace absence', async () => {
  const view = servingView();
  const reader = {async query() {return {view, rows: [], nextAfterKey: 'unresolved-page'};}};
  await assert.rejects(readMarketplace(reader, view, 'atomicmarket', 'marketplace1'), error => {
    assert.notEqual(error.statusCode, 416);
    return true;
  });
});
