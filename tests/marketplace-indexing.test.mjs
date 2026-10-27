import assert from 'node:assert/strict';
import test from 'node:test';

const options = () => ({id: 'marketplaces', mappingRevision: 'a'.repeat(64), marketContract: 'atomicmarket',
  abiDeployment: 'source-deployment', abiSha256: 'b'.repeat(64)});

test('the marketplace definition maps only original context and requires preservation plus absent-row isolation', async () => {
  const {createMarketplaceDefinition} = await import('../dist/atomicmarket/marketplace-indexing.js');
  const {projectContextualTableChange, validateContextualProjectionRecoveryActivation,
    CONTEXTUAL_PROJECTION_RECOVERY_HOST_CAPABILITIES, CONTEXTUAL_PROJECTION_RECOVERY_ADAPTER_CAPABILITIES}
    = await import('@eosrio/hyperion-sdk/projection');
  const input = options(), definition = createMarketplaceDefinition(input);
  input.marketContract = 'untrusted';
  assert.equal(definition.source.contract, 'atomicmarket');
  assert.equal(definition.source.table, 'marketplaces');
  assert.deepEqual(JSON.parse(JSON.stringify(definition.initialization)), {kind: 'genesis'});
  assert.deepEqual(definition.preserveOnReplace, ['created_at_block', 'created_at_time']);
  assert.equal(definition.onAbsent, 'incomplete');
  const binding = {chainId: 'c'.repeat(64), backendId: 'fixture', projectionId: definition.id,
    mappingRevision: definition.mappingRevision, abiDeployment: definition.source.abiDeployment,
    abiSha256: definition.source.abiSha256, generation: 'fixture'};
  const context = {binding, block: {blockNum: 123, blockId: 'd'.repeat(64), previousBlockId: 'e'.repeat(64)},
    source: {contract: 'atomicmarket', table: 'marketplaces', blockTimeMs: 1700000000000}};
  const row = {key: 'original-normalized-key', present: true, value: {marketplace_name: 'marketplace1', creator: 'alice',
    market_contract: 'spoof', created_at_block: '999', created_at_time: '999'}};
  const mapped = projectContextualTableChange(definition, context, row);
  assert.equal(mapped.valid, true);
  assert.deepEqual(JSON.parse(JSON.stringify(mapped.value)), {kind: 'put-preserving', key: row.key,
    value: {market_contract: 'atomicmarket', marketplace_name: 'marketplace1', creator: 'alice',
      created_at_block: '123', created_at_time: '1700000000000'}, preserveFields: definition.preserveOnReplace});
  const absent = projectContextualTableChange(definition, context, {key: row.key, present: false});
  assert.equal(absent.valid, false); assert.equal(absent.errors[0].code, 'projection.incomplete');
  const host = {family: 'contextual-table-recovery', interfaceVersion: 1,
    supported: CONTEXTUAL_PROJECTION_RECOVERY_HOST_CAPABILITIES};
  const adapter = {family: 'contextual-table-recovery', interfaceVersion: 1,
    supported: CONTEXTUAL_PROJECTION_RECOVERY_ADAPTER_CAPABILITIES};
  assert.equal(validateContextualProjectionRecoveryActivation(definition, binding, host, adapter).valid, true);
  assert.equal(validateContextualProjectionRecoveryActivation(definition, binding, host,
    {...adapter, supported: adapter.supported.filter(name => name !== 'preserving-replacement')}).valid, false);
});

test('invalid, implicit-snapshot or executable options fail without invoking accessors', async () => {
  const {createMarketplaceDefinition} = await import('../dist/atomicmarket/marketplace-indexing.js');
  for (const change of [value => {value.id = '';}, value => {value.marketContract = 7;},
    value => {value.abiSha256 = 'not-an-abi-hash';}, value => {delete value.abiDeployment;},
    value => {value.initialization = {kind: 'snapshot'};}, value => {value.hook = 'code';}]) {
    const input = options(); change(input);
    assert.throws(() => createMarketplaceDefinition(input), error => error.code === 'projection.invalid-contract');
  }
  let calls = 0;
  const input = options(); Object.defineProperty(input, 'marketContract', {enumerable: true, get() {calls++; return 'atomicmarket';}});
  assert.throws(() => createMarketplaceDefinition(input)); assert.equal(calls, 0);
});
