// Concrete disposable GHA owner. Never execute this entry point on Windows.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {openSync, closeSync, writeSync, fsyncSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {admitController, root, hapiRoot} from './admission.mjs';
import {CI_PROFILE, LIMITS, IMAGE, assertOwnedUri, assertChildReceipt, sha} from './contract.mjs';
import {createPhysicalGuard} from './guard.mjs';
import {ownedOutput, evidenceWriter, exclusiveFile, processIdentity} from './io.mjs';
import {stageOriginalReports} from './reports.mjs';
const json = (path, value) => exclusiveFile(path, Buffer.from(JSON.stringify(value) + '\n'));

async function waitForOwnedReadiness({MongoClient, uri, primary, replicaSet, waitForMongo, guard, persist}) {
  const attempts = []; let firstCloseFailure, failure, returned;
  try {
    returned = await waitForMongo(() => {
      guard(); if (firstCloseFailure) throw firstCloseFailure;
      const client = new MongoClient(uri, {directConnection: true, retryReads: false, retryWrites: false,
        maxAdaptiveRetries: 0, promoteLongs: false, monitorCommands: true, maxPoolSize: 1,
        serverSelectionTimeoutMS: 1000, connectTimeoutMS: 1000, timeoutMS: 1000});
      const close = client.close.bind(client), state = {client, closed: false, closeCalls: 0}; attempts.push(state);
      client.close = async (...args) => {
        state.closeCalls++;
        try {await close(...args); state.closed = true;}
        catch (error) {state.closeFailure ??= error; firstCloseFailure ??= error; throw error;}
      };
      return client;
    }, {primary, replicaSet, timeoutMS: 60000});
    assert(attempts.some(state => state.client === returned), 'Readiness returned an unowned client');
  } catch (error) {failure = error;}
  finally {
    // The pinned polling helper suppresses close rejections; retain every one independently.
    // A cleanup retry may close the client but cannot erase the original failed attempt.
    for (const state of attempts) if (!state.closed) try {await state.client.close();} catch (error) {failure ??= error;}
    failure = firstCloseFailure ?? failure;
    if (attempts.some(state => !state.closed)) failure ??= new Error('Readiness client closure is incomplete');
    try {guard();} catch (error) {failure ??= error;}
    try {persist({kind: 'mongo-readiness', primary, status: failure ? 'failed' : 'passed', attempts: attempts.map(state => ({
      closed: state.closed, closeCalls: state.closeCalls, closeFailure: state.closeFailure ? String(state.closeFailure.message).slice(0, 2048) : null}))});}
    catch (error) {failure ??= error;}
  }
  if (failure) throw failure;
}

async function supervisedChild(intent, output, signal, runChild) {
  const argv = [join(root, 'scripts/qualification/jsonb-display-bson-v3/child.mjs'), join(output, 'child-intent.json')];
  const receipt = {profile: CI_PROFILE, executable: process.execPath, argv, cwd: root, spawnObserved: false, closed: false,
    stdoutEOF: false, stderrEOF: false, streamFilesClosed: false, status: 'before-spawn', limits: LIMITS, streams: {stdout: 0, stderr: 0}};
  json(join(output, 'child-intent.json'), {...intent, invocation: receipt});
  const streams = {}, abort = new AbortController(); let primary, recordFailure;
  const stop = () => abort.abort(); signal.addEventListener('abort', stop, {once: true});
  if (signal.aborted) abort.abort();
  try {
    for (const name of ['stdout', 'stderr']) streams[name] = openSync(join(output, 'child.' + name), 'wx');
    await runChild(process.execPath, argv, {signal: abort.signal, deadline: LIMITS.childMS, grace: LIMITS.graceMS, cap: LIMITS.stdoutBytes,
      spawnProcess(command, args, options) {
        const env = {...process.env}; delete env.GITHUB_TOKEN; delete env.GH_TOKEN;
        const child = spawn(command, args, {...options, cwd: root, env}); receipt.pid = child.pid ?? null;
        child.once('spawn', () => {try {Object.assign(receipt, processIdentity(child.pid), {spawnObserved: true}); json(join(output, 'child-spawn.json'), receipt);} catch (error) {recordFailure ??= error; abort.abort();}});
        child.once('close', (code, childSignal) => {Object.assign(receipt, {closed: true, code, signal: childSignal});});
        for (const name of ['stdout', 'stderr']) {
          child[name]?.once('end', () => {receipt[name + 'EOF'] = true;});
          child[name]?.on('data', chunk => {try {const bytes = Buffer.from(chunk), total = receipt.streams[name] + bytes.length;
            assert(total <= LIMITS.stdoutBytes, 'Child stream bound exceeded'); assert.equal(writeSync(streams[name], bytes), bytes.length); receipt.streams[name] = total;
          } catch (error) {recordFailure ??= error; abort.abort();}});
        }
        return child;
      }});
    if (recordFailure) throw recordFailure; receipt.status = 'passed';
  } catch (error) {primary = recordFailure ?? error; receipt.status = 'failed'; receipt.failure = String(primary.message).slice(0, 8192);}
  finally {
    signal.removeEventListener('abort', stop); let closed = 0;
    for (const fd of Object.values(streams)) {try {fsyncSync(fd);} catch (error) {primary ??= error;}
      try {closeSync(fd); closed++;} catch (error) {primary ??= error;}}
    receipt.streamFilesClosed = closed === 2;
    if (primary) receipt.status = 'failed';
    try {json(join(output, 'child-terminal.json'), receipt);} catch (error) {primary ??= error;}
  }
  return {receipt, primary};
}

export async function runCI(inputProfile) {
  assert.equal(process.platform, 'linux'); assert(['original-lifecycle', 'portable-safe-image'].includes(inputProfile));
  const output = ownedOutput(root, join(resolve(root), 'out/jsonb-display-bson-v3-owned-' + inputProfile));
  const writer = evidenceWriter(join(output, 'controller-evidence'));
  const physical = createPhysicalGuard({root, deadlineMS: LIMITS.parentMS, persist: row => writer.persist({kind: 'physical-guard', ...row})});
  const stop = new AbortController(); let primary, fixture, custody, admission, cleaningEvidence = true;
  const retain = error => {primary ??= error;};
  const interrupted = () => {retain(new Error('Owned CI controller interrupted')); stop.abort();};
  process.once('SIGINT', interrupted); process.once('SIGTERM', interrupted);
  const guard = () => {if (stop.signal.aborted) throw primary ?? new Error('Owned controller stopped'); physical.guard();};
  const report = {schemaVersion: 1, profile: CI_PROFILE, status: 'running', controller: processIdentity(), inputProfile,
    createdAt: new Date().toISOString(), cleanup: {fixture: false}, physicalAcceptance: 'pending', fullAtomicParity: 'pending'};
  try {
    json(join(output, 'controller-startup.json'), report); physical.checkpoint('before'); guard();
    admission = await admitController(); report.admission = admission; writer.persist({kind: 'source-admission', admission});
    const reportCustody = evidenceWriter(join(output, 'original-report-custody'));
    report.originalReports = await stageOriginalReports({output: join(output, 'reports'), token: process.env.GITHUB_TOKEN,
      guard, persist: (name, bytes) => reportCustody.write(name, bytes)});
    assert.equal(report.originalReports.length, 4); writer.persist({kind: 'original-report-custody', reports: report.originalReports, evidence: reportCustody.summary()});
    const {verifyOriginalReports} = await import('../jsonb-display-mongo-http/assembly.mjs'); assert.equal(verifyOriginalReports(join(output, 'reports')).length, 4); guard();
    // Only after all four report hashes, source binding and fresh guards may Docker be touched.
    const [{OwnedMongoFixture, waitForMongo}, {runChild}] = await Promise.all([
      import(pathToFileURL(join(hapiRoot, 'scripts/qualification/projection-fixture.mjs'))),
      import(pathToFileURL(join(hapiRoot, 'scripts/qualification/wire34-cbfb/ci-child.mjs')))]);
    const {MongoClient} = createRequire(join(hapiRoot, 'package.json'))('mongodb');
    assert.equal(process.env.DOCKER_HOST ?? '', ''); assert.equal(process.env.DOCKER_CONTEXT ?? '', '');
    fixture = new OwnedMongoFixture(); report.run = fixture.run;
    assert.equal(fixture.command(['context', 'show']), 'default');
    const context = JSON.parse(fixture.command(['context', 'inspect', 'default']));
    assert.equal(context.length, 1); assert.equal(context[0].Endpoints.docker.Host, 'unix:///var/run/docker.sock');
    writer.persist({kind: 'local-docker-admission', context: 'default', socket: context[0].Endpoints.docker.Host});
    const kernel = fixture.command(['info', '--format', '{{.KernelVersion}}']), version = /^(\d+)\.(\d+)\.(\d+)/.exec(kernel); report.dockerKernel = kernel;
    assert(!version || !(Number(version[1]) === 6 && Number(version[2]) >= 19 || Number(version[1]) === 7 && Number(version[2]) === 0 && Number(version[3]) < 14), 'Pinned MongoDB kernel constraint');
    guard(); fixture.prepare(); guard(); const uri = fixture.start('replica'); guard();
    const ready = primary => waitForOwnedReadiness({MongoClient, uri, primary, replicaSet: fixture.replicaSet,
      waitForMongo, guard, persist: row => writer.persist(row)});
    await ready(false); guard(); fixture.initializeReplica(); await ready(true); guard();
    const container = fixture.ownedContainer('replica'), image = fixture.inspect('image', IMAGE);
    assert.equal(container.Image, image.Id); assert.equal(image.Os, 'linux'); assert.equal(image.Architecture, 'amd64');
    assert.equal(container.HostConfig.NanoCpus, LIMITS.fixtureCPUs); assert.equal(container.HostConfig.Memory, LIMITS.fixtureMemory);
    assert.equal(container.State.Running, true);
    writer.persist({kind: 'owned-fixture-before-child', container, image});
    const fixtureIdentity = {run: fixture.run, replicaSet: fixture.replicaSet, member: container.Name.slice(1) + ':27017',
      containerId: container.Id, image: IMAGE, imageId: image.Id, volume: fixture.volume.name,
      port: String(container.NetworkSettings.Ports['27017/tcp'][0].HostPort), process: processIdentity(container.State.Pid),
      startedAt: container.State.StartedAt, cpus: container.HostConfig.NanoCpus, memoryBytes: container.HostConfig.Memory,
      memorySwapBytes: container.HostConfig.MemorySwap, labels: container.Config.Labels};
    const selectedUri = uri + '&replicaSet=' + fixture.replicaSet; assertOwnedUri(selectedUri, fixtureIdentity); report.fixture = fixtureIdentity;
    const intent = {schemaVersion: 1, profile: CI_PROFILE, admission, controller: report.controller, fixture: fixtureIdentity,
      databaseName: 'h45_indexed_' + fixture.run.slice(0, 12), uri: selectedUri, inputProfile, output};
    guard(); custody = await supervisedChild(intent, output, stop.signal, runChild); report.child = custody.receipt;
    if (custody.primary) throw custody.primary; assertChildReceipt(custody.receipt);
    const child = JSON.parse(readFileSync(join(output, 'child-result.json'), 'utf8'));
    assert.equal(child.status, 'passed'); assert.equal(child.clientClosed, true); assert.equal(child.result.status, 'passed-bounded-source-representable-IDs-only');
    assert.deepEqual(child.admission.reviewedHarness, admission.reviewedHarness); assert.equal(child.identity.pid, custody.receipt.pid); assert.equal(child.identity.birth, custody.receipt.birth);
    for (const key of ['httpClosed', 'readsClosed', 'sessionsEnded', 'databaseDropped']) assert.equal(child.result.cleanup[key], true);
    report.childResult = child; report.physicalAcceptance = 'passed-bounded-source-representable-IDs-only';
  } catch (error) {retain(error); report.failure = {name: error.name, message: String(error.message).slice(0, 8192)};}
  finally {
    if (fixture) {
      try {writer.persist({kind: 'before-fixture-cleanup', report, diagnostics: fixture.diagnostics()});} catch (error) {cleaningEvidence = false; retain(error);}
      const closed = !custody || custody.receipt.closed === true && custody.receipt.stdoutEOF === true && custody.receipt.stderrEOF === true && custody.receipt.streamFilesClosed === true;
      if (cleaningEvidence && closed) try {await fixture.cleanup(); assert.equal(fixture.cleanupResult.verified, true); report.cleanup.fixture = true; report.cleanup.receipt = fixture.cleanupResult;} catch (error) {retain(error); report.cleanup.failure = String(error.message);}
      else {report.cleanup.retained = 'Owned child/streams or durable evidence not closed; fixture retained for guarded cleanup'; retain(new Error(report.cleanup.retained));}
    }
    try {physical.checkpoint('after');} catch (error) {retain(error);}
    process.removeListener('SIGINT', interrupted); process.removeListener('SIGTERM', interrupted);
    Object.assign(report, {status: primary ? 'failed' : 'passed', physical: physical.report(), evidence: writer.summary()});
    if (primary) {report.failure ??= {name: primary.name, message: String(primary.message).slice(0, 8192)}; report.physicalAcceptance = 'failed';}
    try {json(join(output, 'controller-terminal.json'), report);} catch (error) {retain(error);}
  }
  if (primary) throw primary;
  console.log(JSON.stringify({profile: CI_PROFILE, status: report.status, inputProfile, run: report.run}));
  return report;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 3) throw new Error('Use ci.mjs original-lifecycle|portable-safe-image');
  runCI(process.argv[2]).catch(error => {console.error(String(error?.stack ?? error).slice(0, 8192)); process.exitCode = 1;});
}
