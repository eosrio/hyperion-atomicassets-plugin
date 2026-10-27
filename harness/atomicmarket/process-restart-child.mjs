// Fixed private owned-fixture child. Validate the entire job before loading either external checkout.
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {engineeringHost} from './contextual-host.mjs';
import {marketplaceSource} from './contextual-source.mjs';
import {readMarketplace} from '../../dist/atomicmarket/marketplace.js';
import {PROCESS_RESTART_LIMITS as limits, validateProcessRestartJob} from './process-restart-job.mjs';

assert.equal(typeof process.send, 'function', 'Private child requires its owning IPC parent');
const identity = {pid: process.pid, parentPid: process.ppid, instance: randomUUID(),
  startedAt: new Date().toISOString(), node: process.version, execPath: process.execPath};
const deadline = setTimeout(() => {process.exit(124);}, limits.deadlineMS);
let closing = false;
process.on('disconnect', () => {if (!closing) process.exit(125);});
async function send(event, result) {
  const message = {event, identity, result};
  assert.ok(Buffer.byteLength(JSON.stringify(message)) <= limits.messageBytes);
  await new Promise((resolve, reject) => process.send(message, error => error ? reject(error) : resolve()));
}
let source, client;
try {
  let bytes = 0, text = '';
  for await (const chunk of process.stdin) {
    bytes += chunk.length; assert.ok(bytes <= limits.jobBytes, 'Private child job exceeds byte budget'); text += chunk;
  }
  const job = validateProcessRestartJob(JSON.parse(text), process.ppid);
  assert.equal(process.platform, 'linux');
  const host = engineeringHost(job.hapiRoot);
  const {ContextualProjectionRuntime} = await host.load('build/indexer/projection/contextual-runtime.js');
  const {createMongoDbContextualRecoveryAdapter} = await host.load('packages/backend-mongodb/dist/index.js');
  const {waitForMongo} = await host.load('scripts/qualification/projection-fixture.mjs');
  const fromHost = createRequire(join(host.root, 'package.json')), {MongoClient} = fromHost('mongodb');
  assert.equal(fromHost('mongodb/package.json').version, '7.2.0');
  source = await marketplaceSource(host);
  await source.append(3, ['alice']); await source.append(4, ['bob', 'carol']);
  const evidence = {profile: source.profile, abiSha256: source.abiSha256,
    definition: source.definition, rows: source.rows};
  const sourceDigest = createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
  if (job.mode === 'recover') assert.equal(sourceDigest, job.sourceDigest);
  const binding = {chainId: source.chainId, backendId: job.backendId, projectionId: source.definition.id,
    mappingRevision: source.definition.mappingRevision, abiDeployment: source.definition.source.abiDeployment,
    abiSha256: source.definition.source.abiSha256, generation: 'genesis-marketplace-process-fixture'};
  const connections = new Set();
  try {
    const writes = [];
    let watchWrites = false;
    client = await waitForMongo(() => {
      const value = new MongoClient(job.uri, {appName: `h45-market-process-${job.run}`, directConnection: true,
        monitorCommands: true, retryWrites: false, maxPoolSize: 4, serverSelectionTimeoutMS: 1500, connectTimeoutMS: 1500, timeoutMS: 5000});
      value.on('commandStarted', event => {
        if (watchWrites && ['update', 'insert', 'delete', 'findAndModify', 'commitTransaction', 'abortTransaction'].includes(event.commandName)) {
          assert.ok(writes.length < 16, 'Unexpected recovered-host write trace exceeds its budget');
          writes.push({command: event.commandName, database: event.databaseName});
        }
      });
      connections.add(value); return value;
    }, {primary: true, replicaSet: job.replicaSet});
    const adapter = createMongoDbContextualRecoveryAdapter({client, databaseName: job.databaseName,
      collectionPrefix: job.collectionPrefix, backendId: job.backendId, operationTimeoutMS: 5000, transactionTimeoutMS: 15_000});
    const runtime = await ContextualProjectionRuntime.create({adapter, definition: source.definition, binding,
      genesis: {blockNum: 0, blockId: '0'.repeat(64)}});
    const expected = {marketplace_name: 'marketplace1', creator: 'carol', created_at_block: '3', created_at_time: '1792435812000'};
    const read = async () => readMarketplace({query: (view, query) => runtime.query(query, view)},
      await runtime.open(), 'atomicmarket', 'marketplace1');
    const ownerGate = async (event, result, acknowledgement) => {
      // Install the listener before publishing the stage: an immediate owner response cannot be lost.
      let listener, timer;
      const acknowledged = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Owner did not verify recovered physical state')), limits.acknowledgementMS);
        listener = message => {
          try {assert.deepEqual(message, {event: acknowledgement}); resolve();} catch (error) {reject(error);}
        };
        process.once('message', listener);
      });
      try {await Promise.all([send(event, result), acknowledged]);}
      finally {clearTimeout(timer); process.removeListener('message', listener);}
    };
    let replay = null, admission = null, beforeRead;
    if (job.mode === 'index') {
      for (const number of [1, 2, 3]) assert.equal((await runtime.processSource(source.source, number)).status, 'applied');
      assert.deepEqual((await read()).data, {...expected, creator: 'alice'});
      assert.equal((await runtime.processSource(source.source, 4)).status, 'applied');
    } else {
      beforeRead = await runtime.recovery(); assert.equal(beforeRead.checkpoint.blockNum, 4);
      assert.equal(beforeRead.checkpoint.blockId, source.retained.get(4).source.blockId);
      // Re-admit B through the public source lifecycle before serving. This must only validate its exact retained receipt.
      watchWrites = true;
      admission = await runtime.processSource(source.source, 4); assert.equal(admission.status, 'duplicate');
      assert.deepEqual(writes, []);
      assert.deepEqual(await runtime.recovery(), beforeRead);
      const stage = {binding, view: admission.view, expected, sourceDigest, admissionStatus: admission.status, writes};
      await ownerGate('source-admitted-before-read', stage, 'continue-recovered-read');
      assert.deepEqual((await read()).data, expected);
      assert.deepEqual(await runtime.recovery(), beforeRead); assert.deepEqual(writes, []);
      await ownerGate('recovered-before-replay', stage, 'continue-exact-b-replay');
      replay = await runtime.processSource(source.source, 4); assert.equal(replay.status, 'duplicate');
      assert.deepEqual(await runtime.recovery(), beforeRead); assert.deepEqual(writes, []);
    }
    assert.deepEqual((await read()).data, expected);
    const result = {binding, view: await runtime.open(), expected, sourceDigest, evidence,
      replayStatus: replay?.status ?? null, admissionStatus: admission?.status ?? null, writesAfterStartup: writes,
      recoveredReadAfterDuplicateAdmission: job.mode === 'recover',
      host: {head: host.pins.head, tree: host.pins.tree, artifactProfile: host.artifactProfile}};
    await source.dispose(); source = undefined;
    for (const value of connections) await value.close(); client = undefined;
    await send('process-complete', result);
  } finally {for (const value of connections) await value.close();}
} catch (error) {
  await send('process-error', {name: error.name, message: String(error.message).slice(0, 2048)}).catch(() => {});
  process.exitCode = 1;
} finally {
  await source?.dispose(); await client?.close(); clearTimeout(deadline);
  closing = true; if (process.connected) process.disconnect();
}
