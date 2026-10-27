import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {engineeringHost} from './contextual-host.mjs';
import {runMarketplaceLifecycle} from './contextual-lifecycle.mjs';
import {runMarketplaceFailures} from './contextual-failures.mjs';

const host = engineeringHost(process.env.HAPI_CONTEXTUAL_ROOT);
const {createMongoDbContextualRecoveryAdapter} = await host.load('packages/backend-mongodb/dist/index.js');
const {databaseFixture} = await host.load('packages/backend-mongodb/tests/fixture.mjs');
function retain(name, result) {
  const directory = process.env.MARKETPLACE_EVIDENCE_DIRECTORY;
  if (!directory) return;
  mkdirSync(directory, {recursive: true});
  writeFileSync(join(directory, name + '.json'), JSON.stringify({node: process.version,
    host: {head: host.pins.head, tree: host.pins.tree, installedProof: host.installedProof},
    scope: {inMemoryDatabaseBoundary: true, mongoEngineExecuted: false}, result}, null, 2) + '\n', {flag: 'wx'});
}

test('original processor and HTTP agree with actual source/runtime marketplace creation, replay, restart and rollback', async () => {
  const database = databaseFixture();
  const result = await runMarketplaceLifecycle({host, referenceRoot: process.env.AA_REFERENCE_ROOT,
    backendId: 'marketplace-component', adapterFactory: binding => createMongoDbContextualRecoveryAdapter({
      client: database.client, databaseName: 'marketplace_component', backendId: binding.backendId})});
  assert.equal(result.original.scope.originalDataProcessor, true);
  assert.equal(result.original.scope.originalReplaceSqlGenerator, true);
  assert.equal(result.original.scope.postgresExecution, false);
  assert.equal(result.http.b.scope.originalHttpServer, true);
  assert.equal(result.sourceRevokedReadRefused, true);
  retain('lifecycle', result);
});

test('source, ABI, metadata, time, capability and storage failures cannot complete the affected marketplace', async () => {
  const database = databaseFixture();
  const result = await runMarketplaceFailures({host, referenceRoot: process.env.AA_REFERENCE_ROOT,
    backendId: 'marketplace-failure-component', adapterFactory: binding => createMongoDbContextualRecoveryAdapter({
      client: database.client, databaseName: 'marketplace_failure_component', backendId: binding.backendId}),
    armFault: async kind => {
      if (kind === 'failed-storage') database.failPut = true;
      else database.failFindAndModify = 'after';
    }});
  assert.equal(result.cases.length, 7);
  assert.equal(result.unrelatedHealthySourceProgressed, true);
  assert.equal(result.sourceRevokedReadRefused, true);
  retain('failures', result);
});
