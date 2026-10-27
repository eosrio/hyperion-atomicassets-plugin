import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {marketplaceSource} from './contextual-source.mjs';
import {readMarketplace} from '../../dist/atomicmarket/marketplace.js';
import {executeOriginalMarketplaceControls, executeReferenceFixture} from '../shared/reference.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const httpRow = ({marketplace_name, creator, created_at_block, created_at_time}) => ({marketplace_name, creator,
  created_at_block: String(created_at_block), created_at_time: String(created_at_time)});

async function originalHttp(referenceRoot, row) {
  const fixture = JSON.parse(readFileSync(new URL('../../fixtures/harness/atomicmarket/marketplace.input.json', import.meta.url), 'utf8'));
  fixture.queries[1].rows = row ? [row] : [];
  const result = await executeReferenceFixture({referenceRoot, fixture});
  assert.equal(result.database.unused, 0); assert.equal(result.execution.exitCode, 0);
  assert.equal(result.response.status, row ? 200 : 416);
  if (row) assert.deepEqual(result.response.body.data, row);
  else assert.equal(result.response.body.message, 'Marketplace not found');
  return result;
}

/** One fixed source/creation/recovery scenario shared by component and owned-engine programs.
 * No effects are seeded: every marketplace record comes from processSource with original proof checks.
 */
export async function runMarketplaceLifecycle({host, referenceRoot, adapterFactory, restart,
  backendId, observe = async () => {}}) {
  assert.ok(referenceRoot, 'Supply the exact installed upstream reference');
  const {ContextualProjectionRuntime} = await host.load('build/indexer/projection/contextual-runtime.js');
  const genesis = {blockNum: 0, blockId: '0'.repeat(64)};
  const source = await marketplaceSource(host);
  try {
    const a = await source.append(3, ['alice']), b = await source.append(4, ['bob', 'carol']);
    const input = {contract: 'atomicmarket', blocks: [a, b].map(row => ({block: {
      block_num: row.source.blockNum, block_id: row.source.blockId, timestamp: row.originalTimestamp},
    rows: row.changes.map(value => ({present: true, value}))}))};
    const original = await executeOriginalMarketplaceControls({referenceRoot, input});
    assert.equal(original.error, null); assert.equal(original.scope.originalReplaceSqlGenerator, true);
    assert.equal(original.listenersReleased, true); assert.equal(original.calls.length, 3);
    const expectedA = httpRow(original.snapshots[0].rows[0]), expectedB = httpRow(original.snapshots[1].rows[0]);
    assert.deepEqual(expectedA, {marketplace_name: 'marketplace1', creator: 'alice', created_at_block: '3', created_at_time: '1792435812000'});
    assert.deepEqual(expectedB, {...expectedA, creator: 'carol'});
    const binding = {chainId: source.chainId, backendId, projectionId: source.definition.id,
      mappingRevision: source.definition.mappingRevision, abiDeployment: source.definition.source.abiDeployment,
      abiSha256: source.definition.source.abiSha256, generation: 'genesis-marketplace-fixture'};
    const create = () => ContextualProjectionRuntime.create({adapter: adapterFactory(binding), definition: source.definition, binding, genesis});
    let runtime = await create();
    const read = async () => readMarketplace({query: (view, query) => runtime.query(query, view)},
      await runtime.open(), 'atomicmarket', 'marketplace1');
    const physical = async (stage, expected) => observe(stage, {binding, view: await runtime.open(), expected});
    for (const number of [1, 2]) await runtime.processSource(source.source, number);
    await assert.rejects(read(), error => error.statusCode === 416);
    await physical('before-registration', null);
    const missingHttp = await originalHttp(referenceRoot, null);
    const sourceA = await source.source.contextualFrame(3, source.definition);
    const sourceB = await source.source.contextualFrame(4, source.definition);
    assert.equal(sourceA.frame.changes.length, 1); assert.equal(sourceB.frame.changes.length, 2);
    const normalizedKey = sourceA.frame.changes[0].primaryKey;
    assert.ok(normalizedKey.startsWith(`wire-kv-v1:row:${source.chainId}:`));
    assert.ok(normalizedKey.endsWith(`:7:${a.keyHex}`));
    assert.ok(sourceB.frame.changes.every(change => change.primaryKey === normalizedKey
      && change.abiDeployment === source.definition.source.abiDeployment && change.abiSha256 === source.abiSha256));
    await runtime.processSource(source.source, 3);
    assert.deepEqual((await read()).data, expectedA); await physical('registration-a', expectedA);
    const aHttp = await originalHttp(referenceRoot, expectedA);
    const appliedB = await runtime.processSource(source.source, 4);
    assert.deepEqual((await read()).data, expectedB); await physical('update-b-repeated-key', expectedB);
    const bHttp = await originalHttp(referenceRoot, expectedB);
    assert.equal((await runtime.processSource(source.source, 4)).status, 'duplicate');
    await physical('exact-replay-b', expectedB);
    if (restart) await restart();
    runtime = await create();
    assert.equal((await runtime.processSource(source.source, 4)).status, 'duplicate');
    assert.deepEqual((await read()).data, expectedB); await physical('restart-replay-b', expectedB);
    await runtime.rollback({binding, revision: appliedB.view.revision, operationId: 'undo-marketplace-b',
      from: appliedB.view.checkpoint, ancestor: {blockNum: 3, blockId: a.source.blockId}, maxBlocks: 1});
    assert.deepEqual((await read()).data, expectedA); await physical('rollback-b', expectedA);
    const afterB = await runtime.open();
    await runtime.rollback({binding, revision: afterB.revision, operationId: 'undo-marketplace-a', from: afterB.checkpoint,
      ancestor: {blockNum: 2, blockId: source.retained.get(2).source.blockId}, maxBlocks: 1});
    await assert.rejects(read(), error => error.statusCode === 416); await physical('rollback-a', null);
    const c = await source.append(3, ['dora'], {replacement: true});
    assert.notEqual(c.source.blockId, a.source.blockId);
    const originalC = await executeOriginalMarketplaceControls({referenceRoot,
      input: {contract: 'atomicmarket', blocks: [{block: {block_num: 3, block_id: c.source.blockId, timestamp: c.originalTimestamp},
        rows: [{present: true, value: c.changes[0]}]}]}});
    assert.equal(originalC.error, null);
    const expectedC = httpRow(originalC.finalRows[0]);
    assert.deepEqual(expectedC, {marketplace_name: 'marketplace1', creator: 'dora', created_at_block: '3', created_at_time: '1792435817000'});
    await runtime.processSource(source.source, 3);
    assert.deepEqual((await read()).data, expectedC); await physical('canonical-replacement-c', expectedC);
    const cHttp = await originalHttp(referenceRoot, expectedC);
    await assert.rejects(runtime.query({filter: [], limit: 1}, appliedB.view), error => error.code === 'projection.stale-revision');
    assert.equal(await source.coordinator.revokeSource('native-api-original-reader'), true);
    await assert.rejects(read(), /Source lacks current complete coverage/);
    return {scope: {actualJournalSourceRuntimeAdapterRead: true, constructedMarketplaceSource: true,
      originalWireGenesis: true, esTransportInMemory: true, productionForkServingActivation: false, fullParity: false},
    source: {profile: source.profile, abiSha256: source.abiSha256, abiDeployment: source.definition.source.abiDeployment,
      normalizedKey, rows: plain(source.rows)}, original, originalC, http: {missing: missingHttp, a: aHttp, b: bHttp, c: cHttp},
    data: {a: expectedA, b: expectedB, c: expectedC}, sourceRevokedReadRefused: true};
  } finally {await source.dispose();}
}
