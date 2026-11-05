// Version 3 keeps the original workload and host SDK with lossless bounded binary BSON capture.
// Frozen v1/v2 remain failed; never import/execute this entry point on Windows.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadHostSdkPorts} from './host-sdk.mjs';
import {createBsonRecorder} from '../jsonb-display-bson-v3/bson-recorder.mjs';
import {cleanupOwnedDatabase} from '../jsonb-display-bson-v3/cleanup.mjs';
import profiles from '../../../harness/atomicassets/lifecycle-input.cjs';
import {PROFILE, ACCEPTANCE, assertRunInput} from './run-schema-contract.mjs';
import {corpus, classifyCorpus, codec, sha} from '../jsonb-display-mongo-http/corpus.mjs';
import {expectedRefusal} from '../schema-id-mongo-v1/refusal.mjs';
import {verifySchemaReports, schemaExpectations} from '../schema-id-mongo-v1/schema-oracle.mjs';
import {verifyAssembly, verifyOriginalReports} from './assembly.mjs';
const hex = n => n.toString(16).padStart(64, '0'), copy = structuredClone;
const bounds = {value: {depth: 32, nodes: 8192, fields: 64, arrayElements: 256, stringBytes: 4096, recordBytes: 131072, integerFields: 16, pathSegments: 16},
  envelope: {depth: 48, nodes: 65536, fields: 64, arrayElements: 1024, stringBytes: 1048576, recordBytes: 2097152, integerFields: 16, pathSegments: 16},
  selectors: 128, recordKinds: 21, inputOccurrences: 128, inputBytes: 1048576, keyBytes: 256, readKeys: 16, readAttempts: 64,
  mutations: 128, candidateBytes: 2097152, responseRecords: 16, responseBytes: 65536};
const collectionKey = JSON.stringify(['atomicassets', 'fixturecoll']);
const select = (value, fields) => Object.fromEntries(fields.map(field => [field, value[field]]));
const without = (value, fields) => Object.fromEntries(Object.entries(value).filter(([key]) => !fields.includes(key)));
const failure = error => ({name: String(error?.name ?? 'Error'), message: String(error?.message ?? error).slice(0, 2048), code: error?.code ?? null});

function initialEvents(input) {
  const serialized = Buffer.from(codec.serialize(input.collectionData, codec.CachedObjectSchema(input.collectionFormat))).toString('hex');
  return [{kind: 'table', name: 'config', scope: 'atomicassets', data: {collection_format: input.collectionFormat}},
    collectionEvent(input, serialized), {kind: 'table', name: 'schemas', scope: input.collection, data: {schema_name: input.schema, format: input.format}},
    {kind: 'action', name: 'logmint', data: {asset_id: input.assetId, collection_name: input.collection, schema_name: input.schema, template_id: -1,
      new_asset_owner: 'alice', authorized_minter: 'author', immutable_data: input.immutableAttributes, mutable_data: input.mutableAttributes}},
    {kind: 'action', name: 'logsetdata', data: {asset_id: input.assetId, new_data: input.updatedAttributes}}];
}
function collectionEvent(input, serialized) {
  return {kind: 'table', name: 'collections', scope: input.collection, data: {collection_name: input.collection, author: 'author', allow_notify: true,
    authorized_accounts: ['author', 'editor'], notify_accounts: ['watcher'], market_fee: 0.05, serialized_data: serialized}};
}
function caseEvents(input, plan) {return [{kind: 'table', name: 'config', scope: 'atomicassets', data: {collection_format: plan.format}}, collectionEvent(input, plan.serializedHex)];}

/** Raw exact source-v2 fields, captured under the actual registry declaration. */
export function sourceInputs(declaration, events, serial) {
  const binding = declaration.projection.definition.binding;
  return events.map((event, index) => {
    const selector = declaration.projection.definition.selectors.find(row => row.contract === 'atomicassets' && row.kind === event.kind && row.name === event.name); assert(selector);
    const raw = Buffer.from(JSON.stringify(event.data));
    return {kind: event.kind, selector: selector.id, order: index, contract: selector.contract, name: selector.name,
      abiDeployment: selector.abiDeployment, abiSha256: selector.abiSha256, mappingRevision: binding.mappingRevision,
      codecRevision: binding.codecRevision, normalizerRevision: binding.normalizerRevision,
      rawHex: raw.toString('hex'), rawSha256: sha(raw), sourceEvidence: sha('controlled-jsonb:' + serial + ':' + index), data: copy(event.data),
      ...(event.kind === 'table' ? {transactionId: null, identity: {kind: 'contract-row', scope: event.scope, primaryKey: String(index)},
        payer: null, present: true, deltaOrdinal: index, rowOrdinal: 0} :
        {transactionId: hex(serial), actionOrdinal: index + 1, receiver: selector.contract, receiptOrdinal: index + 1, sequence: null})};
  });
}

export async function runJsonbDisplayQualification(options) {
  assert.equal(process.platform, 'linux'); assert.equal(process.arch, 'x64'); assert.equal(process.versions.bun, undefined);
  assert([24, 26].includes(Number(process.versions.node.split('.')[0])));
  const {profile, hapiRoot, client, databaseName, inputProfile = 'original-lifecycle', persist, persistBinary, guard: physicalGuard} = options;
  let recorder; const guard = () => {physicalGuard(); recorder?.assertHealthy();};
  assertRunInput({...options, inputProfile}); guard();
  const assembly = await verifyAssembly(hapiRoot, options.reviewedHarness), originalReports = verifyOriginalReports(options.originalReportRoot); guard();
  const schemaReports = await verifySchemaReports(options.schemaReportRoot);
  const {owner, captureStatefulSourceV2, receipt: hostSdk} = await loadHostSdkPorts(hapiRoot, assembly);
  await persist({event: 'host-sdk-ports', ...hostSdk}); guard();
  const plans = await classifyCorpus(), expectations = schemaExpectations(schemaReports, plans), selected = profiles.loadInputProfile(inputProfile), input = selected.input;
  assert.equal(input.contract, 'atomicassets'); assert.equal(input.collection, 'fixturecoll');
  const [{createHost}, atomic] = await Promise.all([import('../jsonb-display-mongo-http/host.mjs'), import('../../../dist/index.js')]);
  const {BSON} = createRequire(join(hapiRoot, 'package.json'))('mongodb');
  // Source/runtime admission above precedes touching the supplied native client.
  assert.equal(client.options.retryReads, false); assert.equal(client.options.retryWrites, false);
  assert.equal(client.options.maxAdaptiveRetries, 0); assert.equal(client.options.monitorCommands, true);
  assert.equal(client.options.promoteLongs, false);
  const hello = await client.db('admin').command({hello: 1}), build = await client.db('admin').command({buildInfo: 1}); guard();
  assert.equal(build.version, '8.0.34'); assert(hello.isWritablePrimary && typeof hello.setName === 'string');
  assert(!(await client.db('admin').admin().listDatabases()).databases.some(row => row.name === databaseName), 'Fresh exclusively owned DB required');
  const marker = randomBytes(24).toString('hex'), database = client.db(databaseName), hosts = [], sessions = [];
  const report = {schemaVersion: 1, profile, status: 'running', acceptance: copy(ACCEPTANCE), assembly, hostSdk, inputProfile: selected.descriptor,
    originalCapture: {reports: corpus.reports, postgresVersion: corpus.postgresVersion, workflowRun: corpus.workflowRun},
    schemaOriginalCapture: {workflowRun: 41992627221, head: 'fec2bc877be9869e1ddd8b18ab4d8628515e8790', reports: schemaReports.map(({id,sha256})=>({id,sha256}))},
    server: {version: build.version, replicaSet: hello.setName}, ledger: plans, observations: [], refusals: [], publication: [],
    rawNumericProbes: copy(corpus.nativeSqlNumericProbes), cleanup: {httpClosed: false, readsClosed: false, sessionsEnded: false, databaseDropped: false, client: 'caller-owned'}};
  let owned = false, primary, serial = 1000;
  recorder = createBsonRecorder({databaseName, serialize: value => BSON.serialize(value), persistBinary});
  const retain = error => {primary ??= error;};
  const startSession = client.startSession;
  client.startSession = function (...args) {const session = startSession.apply(this, args), row = {ended: false}, end = session.endSession;
    sessions.push(row); session.endSession = async function (...values) {try {return await end.apply(this, values);} finally {row.ended = this.hasEnded;}}; return session;};
  const command = recorder.commandStarted, succeeded = recorder.commandSucceeded, failed = recorder.commandFailed;
  client.on('commandStarted', command); client.on('commandSucceeded', succeeded); client.on('commandFailed', failed);
  const emit = async row => {guard(); await persist(row);};
  const make = async label => {
    const host = await createHost({hapiRoot, atomic, client, databaseName, generation: 'jsonb-display-' + label, bounds, persist: emit}); hosts.push(host);
    const entry = host.registry.entries.get('atomicassets'); assert(entry);
    const identity = {id: 'controlled-jsonb-display', generation: label}, lease = await entry.adapter.acquireOwner({expected: null, nextOwner: identity}, guard);
    const state = {host, entry, identity, lease, custody: new Map(), candidate: undefined};
    state.store = {async load(digest, source) {return state.custody.get(digest + ':' + source) ?? null;}, async retain(candidate) {
      await emit({event: 'candidate', label, candidate}); const key = candidate.declarationDigest + ':' + candidate.source.digest;
      const old = state.custody.get(key); if (old) assert.equal(old.digest, candidate.digest); else state.custody.set(key, copy(candidate)); state.candidate = candidate;
    }};
    return state;
  };
  const readCollection = async state => {
    const {adapter} = state.entry, view = (await adapter.recovery()).view, read = await adapter.completedRead(state.identity, view, guard);
    try {const answer = await adapter.readCompleted(read, view, [{kind: 'collection', key: collectionKey}]); assert.equal(answer.results[0].status, 'present'); return copy(answer.results[0].value);}
    finally {adapter.closeRead(read);}
  };
  const apply = async (state, events, refusal) => {
    guard(); const {entry} = state, {adapter, declaration} = entry, previous = (await adapter.recovery()).view, id = ++serial;
    const block = {blockNum: previous.checkpoint.blockNum + 1, blockId: hex(id), previousBlockId: previous.checkpoint.blockId};
    const target = await owner.captureStatefulRawTargetV2(declaration, {schemaVersion: 2, chainId: declaration.projection.definition.binding.chainId,
      declarationDigest: declaration.digest, owner: state.identity, previous, block,
      rawSource: {commitId: 'controlled-jsonb:' + id, selectionId: 'controlled-jsonb:' + id, observationId: 'controlled-jsonb:' + id, observationDigest: hex(id + 10000)}});
    await adapter.admitRaw(state.lease, target);
    const source = {previous: copy(previous.checkpoint), block: {...block, timeMs: String(Date.parse(input.block.timestamp + 'Z') + id * 1000)},
      inputs: sourceInputs(declaration, events, id)};
    const captured = await captureStatefulSourceV2(declaration, source); state.candidate = undefined;
    await emit({event: 'admitted-source', target, source, capturedDigest: captured.digest});
    if (refusal) {
      const baseline = copy(refusal.baseline);
      const {rejected,evidence} = await expectedRefusal({plan:refusal.plan, original:corpus.cases[refusal.plan.index], reduce:entry.reduce,
        execute:hook=>owner.executeStatefulOwnerBlockV2(declaration, adapter, state.lease, target.digest, source, state.store, hook, guard)});
      assert.equal(state.candidate, undefined, 'No rejected source candidate may be retained');
      const beforeGap = await adapter.recovery(); assert.deepEqual(beforeGap.view, previous);
      const read = await adapter.reductionRead(state.lease, target.digest, captured.digest);
      try {const after = await adapter.readReduction(read, previous, [{kind: 'collection', key: collectionKey}]); assert.equal(after.results[0].status, 'present'); assert.deepEqual(copy(after.results[0].value), baseline);}
      finally {adapter.closeRead(read);}
      await adapter.markSourceFailure(state.lease, target.digest, captured.digest, 'controlled original JSONB storage refusal');
      const recovery = await adapter.recovery(); assert(recovery.gap); assert.deepEqual(recovery.view, previous);
      const http = await state.host.observe('/atomicassets/v1/schemas/' + input.collection + '/' + input.schema, previous, 503);
      const receipt = {id: refusal.plan.id, originalSQL: corpus.cases[refusal.plan.index].storageError, error: failure(rejected),
        candidateRetained: false, baselineUnchanged: true, refusalEvidence: evidence, recovery, http}; report.refusals.push(receipt); await emit({event: 'source-refusal', ...receipt}); return;
    }
    const result = await owner.executeStatefulOwnerBlockV2(declaration, adapter, state.lease, target.digest, source, state.store, entry.reduce, guard);
    assert.equal(result.status, 'applied'); assert(state.candidate);
    await adapter.retireRaw(state.lease, target.digest, state.candidate.source.digest, state.candidate.digest);
    const recovery = await adapter.recovery(); assert.equal(recovery.gap, null); assert.equal(recovery.pending, null);
    await state.host.publish(declaration, recovery.view); await emit({event: 'committed-and-retired', result, recovery}); return {previous, view: recovery.view};
  };
  const urls = ['/atomicassets/v1/schemas/' + input.collection + '/' + input.schema];
  try {
    for (const original of originalReports) await emit({event: 'original-pg-report-by-value', ...original});
    for (const original of schemaReports) await emit({event: 'original-schema-pg-report-by-value', ...original});
    await database.collection('_qualification_owner').insertOne({_id: marker, profile: PROFILE}, {writeConcern: {w: 'majority', j: true}}); owned = true;
    await emit({event: 'complete-original-corpus-ledger', ledger: plans, rawNumericProbes: report.rawNumericProbes, inputProfile: selected.descriptor});
    const state = await make('accepted'); await state.host.observe(urls[0], null, 503); await apply(state, initialEvents(input));
    const baseView = (await state.entry.adapter.recovery()).view;
    await state.host.observe(urls[0], baseView);
    let last, preceding;
    for (const plan of plans.filter(row => row.sourceRepresentable && row.originalSqlAccepted)) {
      const original = corpus.cases[plan.index], applied = await apply(state, caseEvents(input, plan)); preceding = last; last = {plan, applied};
      const stored = await readCollection(state); assert.deepEqual(stored.data, JSON.parse(original.encoded));
      const schema = await state.host.observe(urls[0], applied.view);
      assert.deepEqual(select(schema.body.data.collection, ['name', 'img', 'images']), expectations[plan.index]);
      const repeat = await state.host.observe(urls[0], applied.view); assert.deepEqual(without(repeat.body, ['query_time']), without(schema.body, ['query_time']));
      const observation = {id: plan.id, view: applied.view, stored, schema, repeat}; report.observations.push(observation); plan.projectionCoverage = 'passed-bounded-schema-id-display'; await emit({event: 'paired-schema-id-display', ...observation});
    }
    assert.equal(report.observations.length, 27);
    const current = () => state.entry.adapter.recovery(); let view = (await current()).view;
    for (const flag of ['source', 'mapping']) {
      state.host.controls[flag] = false; try {await state.host.observe(urls[0], view, 503);} finally {state.host.controls[flag] = true;}
      await state.host.late(urls[0], async () => {state.host.controls[flag] = false;}, view).finally(() => {state.host.controls[flag] = true;});
      report.publication.push({control: flag + '-early-and-late', refused: true});
    }
    await state.host.cancelAtPublication(urls[0], view); report.publication.push({control: 'request-abort-after-domain-result', refused: true});
    const socket = state.host.controls.socket;
    await state.host.late(urls[0], async () => {state.host.controls.socket = {};}, view).finally(() => {state.host.controls.socket = socket;});
    report.publication.push({control: 'source-socket-replacement', refused: true});
    await state.host.late(urls[0], async () => {
      const recovery = await current(); state.identity = {...state.identity, generation: 'accepted-takeover'};
      state.lease = await state.entry.adapter.acquireOwner({expected: {version: recovery.version, view: recovery.view, owner: recovery.owner}, nextOwner: state.identity}, guard);
    }, view); report.publication.push({control: 'actual-native-owner-takeover', refused: true});
    await state.host.late(urls[0], async () => {
      const recovery = await current(); await state.entry.adapter.rollbackOwned(state.lease, {declarationDigest: state.entry.declaration.digest,
        revision: recovery.view.revision, operationId: hex(++serial), from: recovery.view.checkpoint, ancestor: last.applied.previous.checkpoint, maxBlocks: 1});
    }, view); report.publication.push({control: 'actual-native-fork-rollback', refused: true});
    const rolled = await current(); state.identity = {...state.identity, generation: 'replacement-branch'};
    state.lease = await state.entry.adapter.acquireOwner({expected: {version: rolled.version, view: rolled.view, owner: rolled.owner}, nextOwner: state.identity}, guard);
    await state.host.publish(state.entry.declaration, rolled.view);
    const afterRollback = await state.host.observe(urls[0], rolled.view);
    assert.deepEqual(select(afterRollback.body.data.collection, ['name', 'img', 'images']), expectations[preceding.plan.index]);
    const replacement = await apply(state, caseEvents(input, last.plan)); await state.host.observe(urls[0], replacement.view);
    for (const plan of plans.filter(row => row.sourceRepresentable && !row.originalSqlAccepted)) {
      const rejected = await make('refused-' + plan.index); await apply(rejected, initialEvents(input));
      const baseline = await readCollection(rejected); await apply(rejected, caseEvents(input, plan), {plan, baseline}); plan.projectionCoverage = 'passed-source-refusal-with-unchanged-state';
      await state.host.observe(urls[0], (await current()).view);
    }
    assert.equal(report.refusals.length, 6);
    recorder.assertComplete();
    report.acceptance.physicalMongoHTTP = 'passed-bounded-schema-id-display-only';
    report.status = 'passed-bounded-schema-id-display-only';
  } catch (error) {retain(error); report.failure = failure(error); report.status = 'failed';}
  finally {
    try {await cleanupOwnedDatabase({hosts, sessions, owned, database, marker, profile: PROFILE, physicalGuard, persist, report, retain,
      captureSummary: () => recorder.summary()});}
    catch (error) {retain(error);}
    finally {client.off('commandStarted', command); client.off('commandSucceeded', succeeded); client.off('commandFailed', failed); client.startSession = startSession;}
    try {recorder.assertComplete();} catch (error) {retain(error);}
    const capture = recorder.receipt(), summary = recorder.summary();
    report.traceEvents = summary.counts.started + summary.counts.succeeded + summary.counts.failed;
    report.nativeCommandBytes = summary.commandBytes; report.nativeReplyBytes = summary.replyBytes;
    report.nativeCommandsPending = summary.pending; report.nativeCapture = {format: 'binary-bson-references-v1', ...summary};
    const settle = () => {if (primary) {report.status = 'failed'; report.failure ??= failure(primary); report.acceptance.physicalMongoHTTP = 'failed';}};
    settle();
    try {await persist({event: 'native-command-trace', format: 'binary-bson-references-v1', capture});} catch (error) {retain(error);}
    settle();
    try {await persist({event: 'terminal-report', report});} catch (error) {retain(error);}
  }
  if (primary) throw primary; return report;
}
