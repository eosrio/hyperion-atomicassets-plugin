// Explicit owned-engine qualification only. Plugin runtime code contains no native database queries.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {engineeringHost} from '../harness/atomicmarket/contextual-host.mjs';
import {runMarketplaceLifecycle} from '../harness/atomicmarket/contextual-lifecycle.mjs';
import {runMarketplaceFailures} from '../harness/atomicmarket/contextual-failures.mjs';
import {runMarketplaceProcess} from '../harness/atomicmarket/process-restart.mjs';

const args = process.argv.slice(2);
assert.equal(args.length, 6, 'Usage: node scripts/check-marketplace-mongodb.mjs --hapi-root PATH --reference-root PATH --output REPORT.json');
assert.equal(args[0], '--hapi-root'); assert.equal(args[2], '--reference-root'); assert.equal(args[4], '--output');
assert.equal(process.platform, 'linux', 'Owned MongoDB qualification requires native Linux');
const host = engineeringHost(args[1]), referenceRoot = args[3], output = args[5];
const {OwnedMongoFixture, MONGODB_IMAGE, MONGODB_VERSION, waitForMongo} = await host.load('scripts/qualification/projection-fixture.mjs');
const {createMongoDbContextualRecoveryAdapter} = await host.load('packages/backend-mongodb/dist/index.js');
const {hash, slot} = await host.load('packages/backend-mongodb/dist/contract.js');
const fromHost = createRequire(join(host.root, 'package.json')), {MongoClient} = fromHost('mongodb');
assert.equal(fromHost('mongodb/package.json').version, '7.2.0');
const fixture = new OwnedMongoFixture(), appName = `h45-market-${fixture.run}`;
const databaseName = `hyp_marketplace_${fixture.run}`, prefix = 'h45_marketplaces', backendId = `fixture-marketplace-${fixture.run}`;
const report = {schemaVersion: 1, status: 'running', qualification: false, node: process.version,
  host: {head: host.pins.head, tree: host.pins.tree, artifactProfile: host.artifactProfile}, image: MONGODB_IMAGE, run: fixture.run,
  scope: 'Constructed Marketplace source through actual journal/runtime/Mongo/read and pinned original processor/HTTP; no production activation or full parity',
  commandTrace: [], commandTraceTruncated: false, physical: [], restarts: [], cleanup: fixture.cleanupResult};
let client;
const clients = new Set();
const record = row => {
  if (report.commandTrace.length < 1024) report.commandTrace.push(row);
  else report.commandTraceTruncated = true;
};
async function connect() {
  fixture.ownedContainer('replica');
  return await waitForMongo(() => {
    const value = new MongoClient(fixture.endpoint('replica'), {appName, directConnection: true, retryWrites: false,
      monitorCommands: true, maxPoolSize: 4, serverSelectionTimeoutMS: 1500, connectTimeoutMS: 1500, timeoutMS: 5000});
    clients.add(value);
    const requests = new Set();
    value.on('commandStarted', event => {
      if (!['findAndModify', 'update', 'insert', 'delete', 'commitTransaction', 'abortTransaction'].includes(event.commandName)) return;
      requests.add(event.requestId);
      record({phase: 'started', command: event.commandName, requestId: event.requestId,
        transaction: event.command.txnNumber?.toString() ?? null,
        pendingDigest: event.command.update?.$set?.pending?.digest ?? null});
    });
    value.on('commandSucceeded', event => {
      if (!requests.delete(event.requestId)) return;
      record({phase: 'succeeded', command: event.commandName, requestId: event.requestId, ok: event.reply?.ok ?? null,
        writeConcernErrorCode: event.reply?.writeConcernError?.code ?? null,
        writeErrorCodes: event.reply?.writeErrors?.map(row => row.code) ?? []});
    });
    value.on('commandFailed', event => {
      if (!requests.delete(event.requestId)) return;
      record({phase: 'failed', command: event.commandName, requestId: event.requestId,
        code: event.failure?.code ?? null, message: String(event.failure?.message).slice(0, 1024)});
    });
    return value;
  }, {primary: true, replicaSet: fixture.replicaSet});
}
const adapterFactory = binding => createMongoDbContextualRecoveryAdapter({client, databaseName, collectionPrefix: prefix,
  backendId: binding.backendId, operationTimeoutMS: 5000, transactionTimeoutMS: 15_000});
async function physical(stage, {binding, view, expected, collectionPrefix = prefix}) {
  fixture.ownedContainer('replica');
  const metadata = await client.db(databaseName).collection(`${collectionPrefix}_metadata`).findOne({_id: slot(binding)},
    {readConcern: {level: 'majority'}, readPreference: 'primary', timeoutMS: 5000});
  assert.equal(metadata.storageVersion, 'h45-contextual-mongodb-recovery-v1');
  assert.equal(metadata.revision, view.revision); assert.equal(metadata.checkpoint.blockNum, view.checkpoint.blockNum);
  assert.equal(metadata.checkpoint.blockId, view.checkpoint.blockId);
  const records = await client.db(databaseName).collection(`${collectionPrefix}_r_${hash(binding)}`).find({},
    {readConcern: {level: 'majority'}, readPreference: 'primary', timeoutMS: 5000}).limit(3).toArray();
  assert.equal(records.length, expected ? 1 : 0);
  if (expected) assert.deepEqual(records[0].value, {market_contract: 'atomicmarket', ...expected});
  report.physical.push({stage, projection: binding.projectionId, metadata, records});
  return {metadata, records};
}
try {
  const kernel = fixture.command(['info', '--format', '{{.KernelVersion}}']); report.dockerKernel = kernel;
  const version = /^(\d+)\.(\d+)\.(\d+)/.exec(kernel);
  assert.ok(version, 'Unknown fixture kernel cannot be qualified');
  if ((Number(version[1]) === 6 && Number(version[2]) >= 19)
    || (Number(version[1]) === 7 && Number(version[2]) === 0 && Number(version[3]) < 14))
    throw new Error('MongoDB 8.0.34 refuses kernels 6.19 through 7.0.13; select a supported owned fixture host');
  fixture.prepare(); fixture.start('replica');
  const initial = await waitForMongo(() => {
    const value = new MongoClient(fixture.endpoint('replica'), {directConnection: true,
      serverSelectionTimeoutMS: 1500, connectTimeoutMS: 1500, timeoutMS: 5000});
    clients.add(value); return value;
  });
  await initial.close(); fixture.initializeReplica(); client = await connect();
  const build = await client.db('admin').command({buildInfo: 1}); assert.equal(build.version, MONGODB_VERSION);
  const image = fixture.inspect('image', MONGODB_IMAGE); assert.equal(image.Os, 'linux'); assert.equal(image.Architecture, 'amd64');
  report.server = {version: build.version, gitVersion: build.gitVersion, imageId: image.Id,
    containerId: fixture.ownedContainer('replica').Id, replicaSet: fixture.replicaSet};
  report.lifecycle = await runMarketplaceLifecycle({host, referenceRoot, backendId, adapterFactory, observe: physical,
    restart: async () => {await client.close(); client = undefined; report.restarts.push(fixture.restart()); client = await connect();}});
  report.failures = await runMarketplaceFailures({host, referenceRoot, backendId, adapterFactory, observe: physical,
    armFault: async kind => {
      fixture.ownedContainer('replica');
      await client.db('admin').command({configureFailPoint: 'failCommand', mode: {times: 1}, data: kind === 'failed-storage'
        ? {failCommands: ['update'], errorCode: 2, appName}
        : {failCommands: ['findAndModify'], writeConcernError: {code: 64, errmsg: 'Owned marketplace admission acknowledgment uncertain'}, appName}});
    }, disarmFault: async () => {
      fixture.ownedContainer('replica'); await client.db('admin').command({configureFailPoint: 'failCommand', mode: 'off'});
    }});
  assert.ok(report.commandTrace.some(row => row.phase === 'failed' && row.code === 2));
  assert.ok(report.commandTrace.some(row => row.writeConcernErrorCode === 64));
  assert.equal(report.commandTraceTruncated, false);
  // Add a graceful host-process restart; retain the original lifecycle/server restart and all seven failure cells above.
  const collectionPrefix = 'h45_marketplaces_process';
  fixture.ownedContainer('replica');
  assert.equal(await client.db(databaseName).collection(`${collectionPrefix}_metadata`).countDocuments({}, {timeoutMS: 5000}), 0);
  const job = {mode: 'index', parentPid: process.pid, run: fixture.run, uri: fixture.endpoint('replica'), databaseName,
    collectionPrefix, backendId: `fixture-marketplace-process-${fixture.run}`, replicaSet: fixture.replicaSet,
    hapiRoot: host.root, sourceDigest: null};
  report.processRestart = {scope: {gracefulNodeHostRestart: true, crashOrLostAcknowledgement: false,
    reconstructedInMemorySourceTransport: true, persistentElasticsearchQualified: false}, children: []};
  const first = await runMarketplaceProcess(job); report.processRestart.children.push(first);
  assert.deepEqual(first.result.expected, report.lifecycle.data.b);
  assert.deepEqual(first.result.evidence.rows, report.lifecycle.source.rows.slice(0, 3));
  assert.equal(first.result.binding.backendId, job.backendId);
  const snapshot = await physical('process-index-b-closed', {...first.result, collectionPrefix});
  const observeRecovered = async (stage, result) => {
    fixture.ownedContainer('replica');
    assert.deepEqual(result.binding, first.result.binding); assert.deepEqual(result.view, first.result.view);
    assert.deepEqual(result.expected, first.result.expected); assert.equal(result.sourceDigest, first.result.sourceDigest);
    assert.equal(result.admissionStatus, 'duplicate'); assert.deepEqual(result.writes, []);
    assert.deepEqual(result.commandFailures, []); assert.ok(Array.isArray(result.transactionControls));
    assert.deepEqual(await physical(`process-${stage}`, {...result, collectionPrefix}), snapshot);
  };
  const second = await runMarketplaceProcess({...job, mode: 'recover', sourceDigest: first.result.sourceDigest}, observeRecovered);
  report.processRestart.children.push(second);
  assert.notEqual(first.identity.pid, second.identity.pid); assert.notEqual(first.identity.instance, second.identity.instance);
  assert.ok(first.execution.closedAt <= second.execution.startedAt);
  assert.deepEqual(second.result.evidence, first.result.evidence);
  assert.equal(second.result.admissionStatus, 'duplicate'); assert.equal(second.result.replayStatus, 'duplicate');
  assert.equal(second.result.recoveredReadAfterDuplicateAdmission, true); assert.deepEqual(second.result.writesAfterStartup, []);
  assert.deepEqual(second.result.commandFailuresAfterStartup, []); assert.ok(Array.isArray(second.result.transactionControlsAfterStartup));
  assert.deepEqual(await physical('process-exact-replay-b-closed', {...second.result, collectionPrefix}), snapshot);
  report.processRestart.verified = true;
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = {name: error.name, message: error.message, stack: error.stack};
  if (error.processReceipt) report.processRestart.failure = error.processReceipt;
  report.fixtureDiagnostics = fixture.diagnostics(); process.exitCode = 1;
} finally {
  for (const value of clients) {
    try {await value.close();} catch (error) {report.status = 'failed'; (report.clientCleanupErrors ??= []).push(error.message); process.exitCode = 1;}
  }
  try {await fixture.cleanup();} catch (error) {report.status = 'failed'; report.cleanupError = error.message; process.exitCode = 1;}
  report.completedAt = new Date().toISOString();
  const body = JSON.stringify(report, null, 2) + '\n'; writeFileSync(output, body); process.stdout.write(body);
}
