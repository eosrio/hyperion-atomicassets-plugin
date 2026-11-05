// Pure original-codec/source and publication-contract controls. No HTTP, timer or database workload.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as logical from '@eosrio/hyperion-sdk/projection-stateful';
import * as owner from '@eosrio/hyperion-sdk/projection-stateful-owner-v2';
import {captureStatefulSourceV2} from '@eosrio/hyperion-sdk/projection-stateful-source-v2';
import {createAtomicStatefulPlugin} from '../dist/index.js';
import {corpus, classifyCorpus, originalCollectionWrite, inputFor} from '../scripts/qualification/jsonb-display-mongo-http/corpus.mjs';

test('all measured SQL cases stay in the source representability ledger', async () => {
  const plans = await classifyCorpus();
  assert.equal(plans.length, 63); assert.equal(corpus.cases.filter(row => row.storageAccepted).length, 51);
  assert.equal(corpus.cases.filter(row => !row.storageAccepted).length, 12);
  assert.equal(new Set(plans.map(row => row.id)).size, 63);
  assert.equal(plans.filter(row => row.sourceRepresentable && row.originalSqlAccepted).length, 27);
  assert.equal(plans.filter(row => row.sourceRepresentable && !row.originalSqlAccepted).length, 6);
  assert.equal(plans.filter(row => !row.sourceRepresentable).length, 30);
  for (const row of plans) {
    assert.equal(row.originalSqlAccepted, corpus.cases[row.index].storageAccepted);
    assert.equal(typeof row.rawInput, 'string');
    if (row.sourceRepresentable) {
      const write = await originalCollectionWrite(row);
      assert.equal(write.data, corpus.cases[row.index].encoded);
      assert.equal(write.collection_name, 'fixturecoll');
    } else { assert(row.reason.length > 10); assert.equal(row.projectionCoverage, 'pending-source-or-import-path'); }
  }
  assert(plans.some(row => row.sourceRepresentable && row.originalSqlAccepted));
  assert(plans.some(row => row.sourceRepresentable && !row.originalSqlAccepted));
  assert(plans.some(row => !row.sourceRepresentable && row.originalSqlAccepted));
});

test('actual source builder matches the SDK source-v2 fields without transferable native grants', async () => {
  const source = readFileSync(new URL('../scripts/qualification/jsonb-display-mongo-http/run.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('export function sourceInputs('), end = source.indexOf('\nexport async function runJsonbDisplayQualification(', start);
  assert(start > 0 && end > start);
  const sha = value => createHash('sha256').update(value).digest('hex');
  const build = new Function('assert', 'sha', 'copy', 'hex', source.slice(start, end).replace('export ', '') + '\nreturn sourceInputs;')(assert, sha, structuredClone, n => n.toString(16).padStart(64, '0'));
  const bounds = {value: {depth: 16, nodes: 256, fields: 32, arrayElements: 32, stringBytes: 1024, recordBytes: 4096, integerFields: 4, pathSegments: 8},
    envelope: {depth: 32, nodes: 8192, fields: 64, arrayElements: 128, stringBytes: 65536, recordBytes: 262144, integerFields: 4, pathSegments: 8},
    selectors: 128, recordKinds: 21, inputOccurrences: 64, inputBytes: 262144, keyBytes: 128, readKeys: 8, readAttempts: 32,
    mutations: 16, candidateBytes: 262144, responseRecords: 32, responseBytes: 262144};
  const actual = createAtomicStatefulPlugin({limits: bounds}).getStatefulProjectionsV2({binding: {}, sourceCapabilities: ['original-action-authorization-v1']}).projections[0];
  const projection = await logical.captureStatefulDeclaration({...actual.definition,
    binding: {chainId: '1'.repeat(64), backendId: 'pure-jsonb-source', generation: 'one', mappingRevision: '2'.repeat(64), hookArtifact: '3'.repeat(64),
      hookRevision: '4'.repeat(64), codecRevision: '5'.repeat(64), normalizerRevision: '6'.repeat(64)},
    selectors: actual.definition.selectors.map(row => ({...row, abiDeployment: 'pure-source-only', abiSha256: '7'.repeat(64)}))}, bounds);
  const declaration = await owner.captureStatefulOwnerDeclarationV2(projection, 2), block = {blockNum: 1, blockId: '8'.repeat(64), previousBlockId: '0'.repeat(64), timeMs: '1700000000000'};
  const events = [{kind: 'table', name: 'config', scope: 'atomicassets', data: {collection_format: []}},
    {kind: 'action', name: 'logsetdata', data: {asset_id: '9007199254740993', new_data: []}}];
  const inputs = build(declaration, events, 1);
  const captured = await captureStatefulSourceV2(declaration, {previous: {blockNum: 0, blockId: '0'.repeat(64)}, block, inputs});
  assert.equal(captured.source.inputs.length, 2);
  assert.deepEqual({...captured.source.inputs[0].identity}, {kind: 'contract-row', scope: 'atomicassets', primaryKey: '0'});
  assert.equal(captured.source.inputs[1].data.asset_id, '9007199254740993');
  for (const row of captured.source.inputs) assert.equal(sha(Buffer.from(row.rawHex, 'hex')), row.rawSha256);
});

test('classification cannot relabel objects, booleans or nul format names as chain data', async () => {
  const plans = await classifyCorpus();
  for (const name of ['nested-values', 'ordered-unicode', 'booleans', 'nul-key', 'prototype-key']) {
    const selected = plans.filter(row => row.name === name); assert.equal(selected.length, 3);
    assert(selected.every(row => !row.sourceRepresentable), name);
  }
  for (const name of ['text', 'zero', 'fraction', 'exponent', 'controls', 'literal-escape'])
    assert(plans.filter(row => row.name === name).every(row => row.sourceRepresentable), name);
  assert(Object.is(inputFor(corpus.cases.find(row => row.name === 'zero' && row.rotation === 0)).img, -0));
  assert.equal(corpus.nativeSqlNumericProbes.length, 3);
});

test('physical entry points remain Linux-only with source admission before client or HTTP use', () => {
  const root = new URL('../scripts/qualification/jsonb-display-mongo-http/', import.meta.url);
  const source = readFileSync(new URL('run.mjs', root), 'utf8');
  assert(source.indexOf("assert.equal(process.platform, 'linux')") < source.indexOf('await verifyAssembly('));
  assert(source.indexOf('await verifyAssembly(') < source.indexOf("client.db('admin')"));
  assert(source.includes('entry.reduce, guard')); assert(source.includes('markSourceFailure('));
  assert(source.includes('captureStatefulSourceV2(')); assert(source.includes('retireRaw('));
  assert(!source.includes("put('collection'"), 'Only the actual plugin reducer may materialize collection rows');
  const host = readFileSync(new URL('host.mjs', root), 'utf8');
  assert(host.includes('installStatefulApiHostV2')); assert(host.includes('StatefulProjectionRegistryV2.create'));
  assert(!host.includes('selectEngineering')); assert(!host.includes('queryDeclarationDigests:'));
  assert(host.includes("request.raw.emit('aborted')"));
});
