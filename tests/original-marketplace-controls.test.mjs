import assert from 'node:assert/strict';
import test from 'node:test';
import {executeOriginalMarketplaceControls} from '../harness/shared/reference.mjs';

const referenceRoot = process.env.AA_REFERENCE_ROOT;
assert.ok(referenceRoot, 'AA_REFERENCE_ROOT must identify the installed exact reference checkout');
const block = (number, timestamp) => ({block_num: number, block_id: number.toString(16).padStart(64, '0'), timestamp});

test('original Marketplace processor and SQL generator retain first creation through repeated-key updates', async () => {
  const result = await executeOriginalMarketplaceControls({referenceRoot, input: {contract: 'atomicmarket', blocks: [
    {block: block(123, '2023-11-14T22:13:20.000'), rows: [{present: true, value: {marketplace_name: 'marketplace1', creator: 'alice'}}]},
    {block: block(124, '2023-11-14T22:13:20.500'), rows: ['bob', 'carol'].map(creator =>
      ({present: true, value: {marketplace_name: 'marketplace1', creator}}))},
  ]}});
  assert.equal(result.error, null);
  assert.deepEqual(result.finalRows, [{market_contract: 'atomicmarket', marketplace_name: 'marketplace1', creator: 'carol',
    created_at_block: 123, created_at_time: 1700000000000}]);
  assert.equal(result.calls[1].candidate.created_at_block, 124);
  assert.equal(result.calls[1].candidate.created_at_time, 1700000000500);
  assert.equal(result.scope.originalDataProcessor, true); assert.equal(result.scope.originalReplaceSqlGenerator, true);
  assert.equal(result.scope.postgresExecution, false); assert.equal(result.listenersReleased, true);
  assert.equal(result.sources.length, 5); assert.equal(result.execution.exitCode, 0);
});

test('the original absent-row callback refuses before replacement and releases its listener', async () => {
  const result = await executeOriginalMarketplaceControls({referenceRoot, input: {contract: 'atomicmarket', blocks: [
    {block: block(125, '2023-11-14T22:13:21.000'), rows: [{present: false, value: {}}]},
  ]}});
  assert.equal(result.error.message, 'AtomicMarket: Marketplace deleted. Should not be possible');
  assert.deepEqual(result.calls, []); assert.deepEqual(result.finalRows, []);
  assert.equal(result.listenersReleased, true); assert.equal(result.execution.exitCode, 0);
});
