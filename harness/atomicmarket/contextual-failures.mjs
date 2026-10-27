import assert from 'node:assert/strict';
import {marketplaceSource} from './contextual-source.mjs';
import {executeOriginalMarketplaceControls} from '../shared/reference.mjs';

/** Fixed negative cases use the same real source/runtime and supplied adapter as the lifecycle scenario. */
export async function runMarketplaceFailures({host, referenceRoot, backendId, adapterFactory,
  armFault, disarmFault = async () => {}, observe = async () => {}}) {
  const {ContextualProjectionRuntime} = await host.load('build/indexer/projection/contextual-runtime.js');
  const {PortableProjectionSource} = await host.load('build/indexer/projection/source.js');
  const cases = [], genesis = {blockNum: 0, blockId: '0'.repeat(64)};
  for (const fault of ['absent', 'malformed-row', 'missing-time', 'wrong-abi', 'missing-metadata', 'failed-storage', 'uncertain-storage']) {
    const source = await marketplaceSource(host);
    try {
      const a = await source.append(3, ['alice'], {present: fault !== 'absent', malformedRow: fault === 'malformed-row'});
      await source.append(4, ['bob']);
      let definition = {...source.definition, id: `marketplace-${fault}`};
      if (fault === 'wrong-abi') definition = {...definition, source: {...definition.source, abiSha256: 'f'.repeat(64)}};
      const binding = {chainId: source.chainId, backendId, projectionId: definition.id,
        mappingRevision: definition.mappingRevision, abiDeployment: definition.source.abiDeployment,
        abiSha256: definition.source.abiSha256, generation: 'marketplace-negative-fixture'};
      const runtime = await ContextualProjectionRuntime.create({adapter: adapterFactory(binding), definition, binding, genesis});
      await runtime.processSource(source.source, 1);
      if (fault !== 'wrong-abi') await runtime.processSource(source.source, 2);
      let selected = source.source, target = fault === 'wrong-abi' ? 2 : 3;
      if (fault === 'missing-time') {
        const provider = {...source.provider, createShipSession(schema) {
          const session = source.provider.createShipSession(schema);
          return {...session, decodeBlock(bytes) {return {...session.decodeBlock(bytes), timestamp: undefined};}};
        }};
        selected = new PortableProjectionSource({client: source.client, chain: source.chain,
          chainId: source.chainId, profile: source.profile, provider});
      }
      if (fault === 'missing-metadata') {
        let removed = 0;
        for (const [key, entry] of source.memory.documents) if (entry.document.bundle_id === a.observationId) {
          source.memory.documents.delete(key); removed++;
        }
        assert.ok(removed > 0);
      }
      const storageFault = fault.endsWith('-storage');
      if (storageFault) {await runtime.processSource(source.source, 3); target = 4; await armFault(fault, binding);}
      let error;
      try {await runtime.processSource(selected, target); assert.fail('Fault must not complete');}
      catch (failure) {error = failure; assert.notEqual(error.code, 'ERR_ASSERTION');}
      finally {if (storageFault) await disarmFault(fault, binding);}
      const recovery = await runtime.recovery(), floor = target - 1;
      assert.equal(recovery.checkpoint.blockNum, floor);
      assert.equal(recovery.checkpoint.blockId, source.retained.get(floor).source.blockId);
      await assert.rejects(runtime.query({filter: [], limit: 2}), failure => failure.code !== undefined && failure.code !== 416);
      const expected = storageFault ? {marketplace_name: 'marketplace1', creator: 'alice',
        created_at_block: '3', created_at_time: '1792435812000'} : null;
      await observe(fault, {binding, view: {binding, checkpoint: recovery.checkpoint, revision: recovery.revision}, expected});
      if (storageFault) {
        await runtime.processSource(source.source, 4);
        const records = await runtime.query({filter: [], limit: 2});
        assert.equal(records.rows.length, 1); assert.equal(records.rows[0].value.creator, 'bob');
        assert.equal(records.rows[0].value.created_at_block, '3');
        assert.equal(records.rows[0].value.created_at_time, '1792435812000');
      }
      let originalAbsence;
      if (fault === 'absent') {
        originalAbsence = await executeOriginalMarketplaceControls({referenceRoot, input: {contract: 'atomicmarket',
          blocks: [{block: {block_num: 3, block_id: a.source.blockId, timestamp: a.originalTimestamp},
            rows: [{present: false, value: {}}]}]}});
        assert.equal(originalAbsence.error.message, 'AtomicMarket: Marketplace deleted. Should not be possible');
        assert.equal(originalAbsence.calls.length, 0);
      }
      cases.push({fault, target, unchangedCompletedBlock: floor, error: {name: error.name, code: error.code ?? null,
        message: error.message}, recovery, ...(originalAbsence ? {originalAbsence} : {})});
    } finally {await source.dispose();}
  }
  // A separate healthy source/projection still progresses after all affected lanes failed.
  const healthy = await marketplaceSource(host);
  try {
    await healthy.append(3, ['healthy']);
    const definition = {...healthy.definition, id: 'marketplace-unrelated-healthy'};
    const binding = {chainId: healthy.chainId, backendId, projectionId: definition.id, mappingRevision: definition.mappingRevision,
      abiDeployment: definition.source.abiDeployment, abiSha256: definition.source.abiSha256, generation: 'unrelated-healthy'};
    const adapter = adapterFactory(binding), before = cases.length;
    const missingCapability = new Proxy(adapter, {get(target, key) {
      if (key === 'capabilities') return {...target.capabilities, supported: []};
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    }});
    await assert.rejects(ContextualProjectionRuntime.create({adapter: missingCapability, definition, binding, genesis}),
      error => error.code === 'projection.capability-unavailable');
    const runtime = await ContextualProjectionRuntime.create({adapter, definition, binding, genesis});
    for (const height of [1, 2, 3]) await runtime.processSource(healthy.source, height);
    assert.equal((await runtime.query({filter: [], limit: 1})).rows[0].value.creator, 'healthy');
    assert.equal(cases.length, before);
    assert.equal(await healthy.coordinator.revokeSource('native-api-original-reader'), true);
    await assert.rejects(runtime.query({filter: [], limit: 1}), /Source lacks current complete coverage/);
  } finally {await healthy.dispose();}
  return {cases, unsupportedCapabilityRefused: true, unrelatedHealthySourceProgressed: true,
    sourceRevokedReadRefused: true, currentSnapshotUsedAsGenesis: false};
}
