// Pure source/routing and actual observer regression controls; no physical actors.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {createBsonRecorder} from '../jsonb-display-bson-v3/bson-recorder.mjs';
const root = new URL('../../../', import.meta.url), read = path => readFileSync(new URL(path, root), 'utf8').replaceAll('\r\n', '\n');
const v2 = 'scripts/qualification/jsonb-display-mongo-http-ci/', v3 = 'scripts/qualification/jsonb-display-bson-v3/';

test('the v3 workload is the enumerated v2 revision with domain cases, authorities and deadlines preserved', () => {
  let prior = read(v2 + 'run-host-sdk-v2.mjs'); const delta = JSON.parse(read(v3 + 'run-delta.json'));
  assert.equal(delta.base, '2294d97f0e248ab68c4e6792b63523e230622b2c'); assert.equal(delta.changes.length, 9);
  for (const {before, after} of delta.changes) {assert.equal(prior.split(before).length, 2); prior = prior.replace(before, after);}
  assert.equal(read(v3 + 'run-lossless-bson-v3.mjs'), prior);
  assert(!prior.includes('commandBsonHex')); assert(!prior.includes('replyBsonHex')); assert(!prior.includes('trace = []'));
  for (const requirement of ['report.observations.length, 27', 'report.refusals.length, 6', 'actual-native-owner-takeover', 'actual-native-fork-rollback', 'recorder.assertComplete()']) assert(prior.includes(requirement));
  const oldContract = read(v2 + 'contract.mjs'), contract = read(v3 + 'contract.mjs');
  assert.equal(contract.slice(contract.indexOf('export const LIMITS =')), oldContract.slice(oldContract.indexOf('export const LIMITS =')));
});

test('the old real listener throws into its driver at the budget boundary; the new listener only fails capture', () => {
  const prior = read(v2 + 'run-host-sdk-v2.mjs'), start = prior.indexOf('  const command = event => {'), end = prior.indexOf('  const terminal =', start);
  const bytes = Buffer.from([12, 0, 0, 0, 16, 97, 0, 1, 0, 0, 0, 0]);
  const context = {assert, BSON: {serialize: () => bytes}, databaseName: 'owned', commandsBytes: 32 * 1024 ** 2 - 1,
    replyBytes: 0, trace: [], activeCommands: new Map()};
  runInNewContext(prior.slice(start, end).replace('const command =', 'this.command ='), context);
  const oldDriver = new EventEmitter(); oldDriver.on('commandStarted', context.command);
  const event = {databaseName: 'owned', commandName: 'insert', requestId: 1, command: {a: 1}};
  assert.throws(() => {oldDriver.emit('commandStarted', event); return 'driver-result';});
  const recorder = createBsonRecorder({databaseName: 'owned', serialize: () => bytes, persistBinary() {throw new Error('injected capture failure');}});
  const driver = new EventEmitter(); driver.on('commandStarted', recorder.commandStarted);
  const execute = () => {driver.emit('commandStarted', event); return 'driver-result';};
  assert.equal(execute(), 'driver-result'); assert.throws(() => recorder.assertHealthy(), /injected capture failure/);
});

test('the actual child binary sink writes by value before returning its exact reference receipt', () => {
  const source = read(v3 + 'child.mjs'), match = source.match(/persistBinary: (\(name, bytes\) => \{writer\.write\(name, bytes\); return \{path: name, length: bytes\.length, sha256: sha\(bytes\)\};\})/);
  assert(match); const events = [], context = {writer: {write(name, bytes) {events.push({name, bytes: Buffer.from(bytes)});}}, sha: value => createHash('sha256').update(value).digest('hex')};
  runInNewContext('this.sink=' + match[1], context);
  const bytes = Buffer.from([0, 255, 31]), receipt = context.sink('started-00001-1.bson', bytes);
  assert.equal(events.length, 1); assert(events[0].bytes.equals(bytes)); assert.equal(receipt.path, events[0].name);
  assert.equal(receipt.length, bytes.length); assert.equal(receipt.sha256, context.sha(bytes));
});

test('only the old automatic trigger is retired; its manual jobs body remains byte exact', () => {
  const path = '.github/workflows/jsonb-display-mongo-http.yml';
  const prior = execFileSync('git', ['-c', 'core.autocrlf=false', 'show', '2294d97f0e248ab68c4e6792b63523e230622b2c:' + path], {cwd: root, encoding: 'utf8'});
  const start = prior.indexOf('  pull_request:\n'), end = prior.indexOf('permissions:\n', start);
  const current = read(path); assert.equal(current, prior.slice(0, start) + prior.slice(end));
  assert(current.includes('  workflow_dispatch:')); assert(!current.includes('  pull_request:'));
  assert.equal(current.slice(current.indexOf('jobs:\n')), prior.slice(prior.indexOf('jobs:\n')));
});

test('the historical626 BSON automatic route matches main and the full stacked PR diff while retaining all four physical jobs', () => {
  const source = execFileSync('git', ['-c', 'core.autocrlf=false', 'show', '6261491b37e85c735bad563152147c9c59822f6e:.github/workflows/jsonb-display-bson-v3.yml'], {cwd: root, encoding: 'utf8'});
  const route = source.match(/  pull_request:\n    branches: (\[[^\n]+\])\n    paths: (\[[^\n]+\])/); assert(route);
  const branches = JSON.parse(route[1]), paths = JSON.parse(route[2]);
  const glob = (pattern, path) => new RegExp('^' + pattern.split('**').map(part => part.split('*').map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*') + '$').test(path);
  const matches = (base, changed) => branches.includes(base) && changed.some(path => paths.some(pattern => glob(pattern, path)));
  const fullPrDiff = [v2 + 'child.mjs', v3 + 'run-lossless-bson-v3.mjs', '.github/workflows/jsonb-display-mongo-http.yml', '.github/workflows/jsonb-display-bson-v3.yml'];
  assert(matches('main', fullPrDiff)); assert(matches('main', [v3 + 'bson-recorder.mjs']));
  const binding = JSON.parse(read(v3 + 'binding.json')).observation;
  const assembly = JSON.parse(read('scripts/qualification/jsonb-display-mongo-http/profile.json')).observation;
  const dependencyPaths = [...binding.files.map(row => row.path), ...assembly.harness.map(row => row.path),
    ...assembly.atomicSources.map(row => 'src/' + row.path), ...assembly.vendor.map(row => 'vendor/' + row.path)];
  for (const path of dependencyPaths) assert(matches('main', [path]), 'Bound dependency bypasses qualification: ' + path);
  assert(!matches('unlisted-base', fullPrDiff)); assert(!matches('main', ['README.md']));
  assert(source.includes("node: ['24.22.1', '26.4.0']")); assert(source.includes('profile: [original-lifecycle, portable-safe-image]'));
  assert(source.includes('2294d97f0e248ab68c4e6792b63523e230622b2c')); assert(source.includes('node scripts/qualification/jsonb-display-bson-v3/ci.mjs'));
});
