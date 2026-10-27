import assert from 'node:assert/strict';
import test from 'node:test';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {validateProcessRestartJob} from '../harness/atomicmarket/process-restart-job.mjs';
import {runMarketplaceProcess} from '../harness/atomicmarket/process-restart.mjs';

const run = 'a'.repeat(32);
const valid = () => ({mode: 'index', parentPid: process.pid, run, uri: 'mongodb://127.0.0.1:27017/?directConnection=true',
  databaseName: `hyp_marketplace_${run}`, collectionPrefix: 'h45_marketplaces_process',
  backendId: `fixture-marketplace-process-${run}`, replicaSet: `h45rs_${run}`,
  hapiRoot: resolve('owned-host'), sourceDigest: null});

test('private process job binds the exact fixture namespace and recovery source receipt', () => {
  assert.deepEqual(validateProcessRestartJob(valid(), process.pid), valid());
  const recovery = {...valid(), mode: 'recover', sourceDigest: 'b'.repeat(64)};
  assert.deepEqual(validateProcessRestartJob(recovery, process.pid), recovery);
  assert.equal(Object.isFrozen(validateProcessRestartJob(valid(), process.pid)), true);
});

test('foreign owners, namespaces, source digests, executable inputs and non-owned endpoints are refused before I/O', () => {
  const replacements = {parentPid: process.pid + 1, run: 'B'.repeat(32), mode: 'eval',
    databaseName: 'production', collectionPrefix: 'h45_marketplaces', backendId: 'foreign', replicaSet: 'foreign',
    hapiRoot: 'relative', sourceDigest: 'b'.repeat(64), command: 'anything'};
  for (const [key, value] of Object.entries(replacements))
    assert.throws(() => validateProcessRestartJob({...valid(), [key]: value}, process.pid), key);
  for (const uri of ['mongodb://localhost:27017/?directConnection=true', 'mongodb://127.0.0.2:27017/?directConnection=true',
    'mongodb://127.0.0.1:1024/?directConnection=true', 'mongodb://127.0.0.1:65536/?directConnection=true',
    'mongodb://user:password@127.0.0.1:27017/?directConnection=true', 'mongodb://127.0.0.1:27017/production?directConnection=true',
    'mongodb://127.0.0.1:27017/?directConnection=true&replicaSet=foreign'])
    assert.throws(() => validateProcessRestartJob({...valid(), uri}, process.pid), uri);
  for (const sourceDigest of [null, 'b'.repeat(63), 'B'.repeat(64)])
    assert.throws(() => validateProcessRestartJob({...valid(), mode: 'recover', sourceDigest}, process.pid));
  assert.throws(() => validateProcessRestartJob({...valid(), hapiRoot: resolve('x'.repeat(4097))}, process.pid));
  assert.throws(() => validateProcessRestartJob({...valid(), hapiRoot: resolve('bad\0path')}, process.pid));
});

test('actual private Node child refuses a foreign endpoint before touching the supplied host checkout', {timeout: 10_000}, async () => {
  const env = {...process.env}; delete env.NODE_OPTIONS; delete env.NODE_PATH;
  const child = spawn(process.execPath, [fileURLToPath(new URL('../harness/atomicmarket/process-restart-child.mjs', import.meta.url))],
    {env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe', 'ipc']});
  let message, logs = '';
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try {
    child.stdout.on('data', bytes => {logs += bytes;}); child.stderr.on('data', bytes => {logs += bytes;});
    child.on('message', value => {assert.equal(message, undefined); message = value;});
    const closed = new Promise((done, fail) => {child.on('error', fail); child.on('close', (code, signal) => done({code, signal}));});
    child.stdin.end(JSON.stringify({...valid(), uri: 'mongodb://foreign.example:27017/?directConnection=true'}));
    assert.deepEqual(await closed, {code: 1, signal: null});
    assert.equal(message.event, 'process-error'); assert.equal(message.identity.pid, child.pid);
    assert.equal(message.identity.parentPid, process.pid); assert.equal(message.identity.execPath, process.execPath);
    assert.match(message.result.message, /127/); assert.equal(logs, '');
    assert.throws(() => process.kill(child.pid, 0), error => error.code === 'ESRCH');
  } finally {clearTimeout(timer);}
});

test('the owning runner requires physical observations and retains a reaped fixed-child failure receipt', {timeout: 10_000}, async () => {
  await assert.rejects(runMarketplaceProcess({...valid(), mode: 'recover', sourceDigest: 'b'.repeat(64)}), /independent owner/);
  await assert.rejects(runMarketplaceProcess({...valid(), hapiRoot: resolve('out', 'absent-host-' + randomUUID())}), error => {
    assert.equal(error.processReceipt.exitCode, 1); assert.equal(error.processReceipt.signal, null);
    assert.equal(error.processReceipt.identity.parentPid, process.pid);
    assert.equal(error.processReceipt.reaped, true); assert.equal(error.processReceipt.absentAfterClose, true);
    assert.equal(error.processReceipt.processGroupAbsent, true);
    return true;
  });
});
