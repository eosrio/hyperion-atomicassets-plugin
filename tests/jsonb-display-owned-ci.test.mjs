// Actual controller/child functions in a VM with inert ports only. No native workload or timer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {posix} from 'node:path';
import {runInNewContext} from 'node:vm';
import {EventEmitter} from 'node:events';
import {expectedHead, assertOwnedUri, assertChildReceipt, LIMITS, IMAGE} from '../scripts/qualification/jsonb-display-mongo-http-ci/contract.mjs';
const read = name => readFileSync(new URL('../scripts/qualification/jsonb-display-mongo-http-ci/' + name, import.meta.url), 'utf8');
const head = 'a'.repeat(40), tree = 'b'.repeat(40), run = 'c'.repeat(32), root = '/owned/atomic';

test('PR identity uses its actual head and refuses a missing head instead of the GitHub merge SHA', () => {
  assert.equal(expectedHead('pull_request', {pull_request: {head: {sha: head}}}, 'd'.repeat(40)), head);
  assert.equal(expectedHead('workflow_dispatch', {}, head), head);
  assert.throws(() => expectedHead('pull_request', {}, head)); assert.throws(() => expectedHead('push', {}, head));
  const source = read('admission.mjs'); assert(source.includes("git('rev-parse', 'HEAD'), expected"));
  assert(source.includes("git('status', '--porcelain=v1', '--untracked-files=all'), ''"));
});
test('the child accepts only the owned loopback replica and actual terminal EOF/custody', () => {
  const fixture = {run, replicaSet: 'h45rs_' + run, member: 'hyp-projection-' + run + '-replica:27017', port: '30001'};
  const uri = 'mongodb://127.0.0.1:30001/?directConnection=true&replicaSet=' + fixture.replicaSet;
  assertOwnedUri(uri, fixture);
  for (const bad of [uri.replace('127.0.0.1', 'borrowed.invalid'), uri.replace('30001', '27017'), uri + '&password=x']) assert.throws(() => assertOwnedUri(bad, fixture));
  const receipt = {spawnObserved: true, closed: true, stdoutEOF: true, stderrEOF: true, streamFilesClosed: true, pid: 7, birth: '123', code: 0, signal: null, status: 'passed'};
  assertChildReceipt(receipt);
  for (const field of ['spawnObserved', 'closed', 'stdoutEOF', 'stderrEOF', 'streamFilesClosed']) for (const value of [false, 1, 'true', undefined])
    assert.throws(() => assertChildReceipt({...receipt, [field]: value}));
});
function controller({failure, custodyChange, cleanupFailure = false} = {}) {
  const source = read('ci.mjs'), start = source.indexOf('export async function runCI('), end = source.indexOf('\nif (process.argv[1]', start);
  const effects = [], records = [], admission = {reviewedHarness: {commit: head, tree}, runtime: {node: 'v26.4.0', sha256: 'f'.repeat(64)}};
  const receipt = {spawnObserved: true, closed: true, stdoutEOF: true, stderrEOF: true, streamFilesClosed: true, pid: 7, birth: '123', code: 0, signal: null, status: 'passed', ...custodyChange};
  const client = {async close() {effects.push('readiness-close');}}, physical = {guard() {effects.push('guard');}, checkpoint(phase) {effects.push('checkpoint:' + phase);}, report: () => ({status: 'passed'})};
  class Fixture {
    constructor() {effects.push('fixture-constructor'); this.run = run; this.replicaSet = 'h45rs_' + run; this.volume = {name: 'e'.repeat(64)}; this.cleanupResult = {verified: true};}
    command(args) {effects.push('docker-info'); return args[0] === 'context' ? args[1] === 'show' ? 'default' : JSON.stringify([{Endpoints: {docker: {Host: 'unix:///var/run/docker.sock'}}}]) : '5.15.0';} prepare() {effects.push('docker-prepare');} start() {effects.push('docker-start'); return 'mongodb://127.0.0.1:30001/?directConnection=true';}
    initializeReplica() {effects.push('replica-init');} inspect() {return {Id: 'image-id', Os: 'linux', Architecture: 'amd64'};}
    ownedContainer() {return {Id: 'f'.repeat(64), Name: '/hyp-projection-' + run + '-replica', Image: 'image-id', State: {Pid: 10, Running: true, StartedAt: 'now'}, Config: {Labels: {}},
      HostConfig: {NanoCpus: LIMITS.fixtureCPUs, Memory: LIMITS.fixtureMemory}, NetworkSettings: {Ports: {'27017/tcp': [{HostPort: '30001'}]}}};}
    diagnostics() {return {owned: true};} async cleanup() {effects.push('cleanup'); if (cleanupFailure) throw new Error('cleanup-secondary');}
  }
  const context = {assert, Buffer, JSON, LIMITS, IMAGE, CI_PROFILE: 'ci', root, hapiRoot: '/pinned/hapi', join: posix.join, resolve: posix.resolve, AbortController,
    process: {platform: 'linux', env: {}, execPath: '/node', once() {}, removeListener() {}},
    ownedOutput: (_root, path) => {effects.push('output'); return path;},
    evidenceWriter: () => ({write() {}, persist(row) {records.push(row);}, summary: () => ({files: 0})}),
    createPhysicalGuard: () => physical, processIdentity: () => ({pid: 1, birth: '1', bootId: 'boot'}),
    json: (path, value) => records.push({path, value}),
    admitController: async () => {effects.push('admit'); if (failure === 'admission') throw new Error('source-failure'); return admission;},
    stageOriginalReports: async () => {effects.push('stage-all-four'); if (failure === 'reports') throw new Error('report-failure'); return [1, 2, 3, 4];},
    injectedLoad: async path => path.includes('assembly') ? {verifyOriginalReports: () => [1, 2, 3, 4]} : path.includes('projection-fixture') ?
      {OwnedMongoFixture: Fixture, waitForMongo: async make => {make(); return client;}} : {runChild() {}},
    pathToFileURL: path => path, createRequire: () => () => ({MongoClient: class {}}), assertOwnedUri, assertChildReceipt,
    supervisedChild: async () => {effects.push('child'); return {receipt, primary: failure === 'child' ? new Error('child-primary') : undefined};},
    readFileSync: () => JSON.stringify({status: 'passed', clientClosed: true, admission, identity: {pid: 7, birth: '123'},
      result: {status: 'passed-bounded-source-representable-IDs-only', cleanup: {httpClosed: true, readsClosed: true, sessionsEnded: true, databaseDropped: true}}}), console: {log() {}}
  };
  runInNewContext(source.slice(start, end).replace('export ', '').replaceAll('import(', 'injectedLoad(') + '\nthis.run=runCI;', context);
  return {run: () => context.run('original-lifecycle'), effects, records};
}
test('actual controller stages all exact reports and admission before constructing or touching MongoDB', async () => {
  for (const failure of ['admission', 'reports']) {
    const c = controller({failure}); await assert.rejects(c.run()); assert(!c.effects.includes('fixture-constructor')); assert(!c.effects.includes('child'));
  }
  const c = controller(); const result = await c.run(); assert.equal(result.status, 'passed');
  assert(c.effects.indexOf('admit') < c.effects.indexOf('stage-all-four'));
  assert(c.effects.indexOf('stage-all-four') < c.effects.indexOf('fixture-constructor'));
  assert(c.effects.indexOf('checkpoint:before') < c.effects.indexOf('docker-prepare'));
  assert(c.effects.indexOf('child') < c.effects.indexOf('cleanup')); assert.equal(c.effects.at(-1), 'checkpoint:after');
});
test('unclosed child prevents fixture destruction; a closed failed child cleans up without losing its original failure', async () => {
  for (const flag of ['closed', 'stdoutEOF', 'stderrEOF', 'streamFilesClosed']) {
    const c = controller({custodyChange: {[flag]: false}}); await assert.rejects(c.run()); assert(!c.effects.includes('cleanup'));
    assert(c.records.some(row => row.path?.endsWith('controller-terminal.json') && row.value.cleanup.retained));
  }
  const c = controller({failure: 'child', cleanupFailure: true}); await assert.rejects(c.run(), /child-primary/); assert(c.effects.includes('cleanup'));
});
test('actual supervisor persists intent before spawn, captures birth/EOF and drains failures before terminal receipt', async () => {
  const source = read('ci.mjs'), start = source.indexOf('async function supervisedChild('), end = source.indexOf('\nexport async function runCI(', start);
  const events = [], c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.pid = 7;
  const context = {assert, Buffer, LIMITS, CI_PROFILE: 'ci', root, join: posix.join, AbortController,
    process: {execPath: '/node', env: {GITHUB_TOKEN: 'must-not-forward', GH_TOKEN: 'also-secret', SAFE: 'yes'}},
    processIdentity: pid => ({pid, birth: '123', bootId: 'boot'}),
    json: (path, row) => events.push({kind: 'receipt', path, row: structuredClone(row)}),
    openSync: path => {events.push({kind: 'open', path}); return events.length;}, writeSync: (_fd, bytes) => bytes.length, fsyncSync: () => events.push({kind: 'fsync'}), closeSync: () => events.push({kind: 'close'}),
    spawn: (_command, _args, options) => {assert.equal(options.env.GITHUB_TOKEN, undefined); assert.equal(options.env.GH_TOKEN, undefined); events.push({kind: 'spawn'}); return c;}
  };
  runInNewContext(source.slice(start, end) + '\nthis.run=supervisedChild;', context);
  const runChild = async (_command, _args, options) => {
    const child = options.spawnProcess('/node', [], {}); child.emit('spawn'); child.stdout.emit('data', Buffer.from('ok'));
    child.stdout.emit('end'); child.stderr.emit('end'); child.emit('close', 0, null);
  };
  const result = await context.run({}, '/owned/output', new AbortController().signal, runChild);
  assert.equal(result.primary, undefined); assertChildReceipt({...result.receipt});
  assert(events.findIndex(row => row.path?.endsWith('child-intent.json')) < events.findIndex(row => row.kind === 'spawn'));
  assert(events.findIndex(row => row.path?.endsWith('child-spawn.json')) > events.findIndex(row => row.kind === 'spawn'));
  assert.equal(events.at(-1).path, '/owned/output/child-terminal.json');
});
test('workflow checks exact PR head, pinned HAPI and all explicit input/runtime profiles without write permissions', () => {
  const source = readFileSync(new URL('../.github/workflows/jsonb-display-mongo-http.yml', import.meta.url), 'utf8');
  assert(source.includes('ref: ${{ github.event.pull_request.head.sha || github.sha }}'));
  assert(source.includes('HYPERION_EXPECTED_HEAD: ${{ github.event.pull_request.head.sha || github.sha }}'));
  assert(source.includes('ref: 7270b1eba0e4e118e61fd282dbf44a66f361df47'));
  assert(source.includes('git fetch --no-tags --depth=1 origin d192357a03e1a48a19528ff0086e8e81b62ac562 a410e16497bd2a6529b72691bad03507f90dcc7f'));
  assert(source.includes("node: ['24.22.1', '26.4.0']")); assert(source.includes('profile: [original-lifecycle, portable-safe-image]'));
  assert(source.includes('actions: read')); assert(!source.includes(': write')); assert(!source.includes('services:')); assert(!source.includes('continue-on-error'));
});
