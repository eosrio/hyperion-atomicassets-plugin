import assert from 'node:assert/strict';
import test from 'node:test';
import childProcess from 'node:child_process';
import {EventEmitter} from 'node:events';
import {syncBuiltinESMExports} from 'node:module';
import {resolve} from 'node:path';
import {runMarketplaceProcess} from '../harness/atomicmarket/process-restart.mjs';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
};

// Exercise the real owner with a controlled ChildProcess/OS boundary. No synthetic PID reaches the OS.
function boundary(t, {linux = false, descendant = false} = {}) {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', {...platform, value: linux ? 'linux' : 'win32'});
  const child = new EventEmitter(); child.pid = 987654321; child.connected = true;
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
  child.stdin.end = () => {};
  const signals = [], sends = [], timers = [];
  child.kill = signal => {signals.push({target: child.pid, signal}); return true;};
  child.send = (message, callback) => {
    sends.push(message);
    callback(child.connected ? null : Object.assign(new Error('IPC channel closed'), {code: 'ERR_IPC_CHANNEL_CLOSED'}));
  };
  t.mock.method(childProcess, 'spawn', () => child); syncBuiltinESMExports();
  t.mock.method(process, 'kill', (pid, signal) => {
    if (signal === 0) {
      if (pid === -child.pid && descendant) return true;
      throw Object.assign(new Error('No such owned process'), {code: 'ESRCH'});
    }
    signals.push({target: pid, signal});
    if (pid === -child.pid && signal === 'SIGKILL') descendant = false;
    return true;
  });
  t.mock.method(globalThis, 'setTimeout', (callback, ms) => {
    const timer = {callback, ms, active: true}; timers.push(timer); return timer;
  });
  t.mock.method(globalThis, 'clearTimeout', timer => {if (timer) timer.active = false;});
  t.after(() => {t.mock.restoreAll(); syncBuiltinESMExports(); Object.defineProperty(process, 'platform', platform);});
  const run = 'a'.repeat(32);
  const job = {mode: 'recover', parentPid: process.pid, run, uri: 'mongodb://127.0.0.1:27017/?directConnection=true',
    databaseName: `hyp_marketplace_${run}`, collectionPrefix: 'h45_marketplaces_process',
    backendId: `fixture-marketplace-process-${run}`, replicaSet: `h45rs_${run}`,
    hapiRoot: resolve('controlled-host'), sourceDigest: 'b'.repeat(64)};
  const identity = {pid: child.pid, parentPid: process.pid, instance: 'b'.repeat(8) + '-bbbb-bbbb-bbbb-' + 'b'.repeat(12),
    startedAt: new Date(Date.now() + 1000).toISOString(), node: process.version, execPath: process.execPath};
  return {child, job, signals, sends, timers,
    message(event, result = {}) {child.emit('message', {event, identity, result});},
    close(code = 124, signal = null) {child.connected = false; child.emit('close', code, signal);},
    assertTerminal() {assert.equal(timers.filter(timer => timer.active).length, 0);},
    fireClearedCallbacks() {for (const timer of timers.slice()) timer.callback();}};
}

for (const rejects of [false, true]) test(`close fences a pending physical observation that ${rejects ? 'rejects' : 'fulfills'}`, async t => {
  const own = boundary(t), entered = deferred(), observation = deferred();
  const work = runMarketplaceProcess(own.job, async () => {entered.resolve(); await observation.promise;});
  const completed = assert.rejects(work, error => {
    assert.equal(error.processReceipt.exitCode, 124);
    assert.equal(error.processReceipt.reaped, true); assert.equal(error.processReceipt.absentAfterClose, true);
    if (rejects) assert.match(error.message, /physical observer failed/);
    return true;
  });
  own.message('source-admitted-before-read'); await entered.promise;
  own.close();
  if (rejects) observation.reject(new Error('physical observer failed')); else observation.resolve();
  await completed;
  assert.deepEqual(own.sends, []); assert.deepEqual(own.signals, []); own.assertTerminal();
});

test('cleared deadline/escalation callbacks and late child events have no authority after settlement', async t => {
  const own = boundary(t);
  const work = runMarketplaceProcess({...own.job, mode: 'index', sourceDigest: null});
  const completed = assert.rejects(work, error => error.processReceipt.exitCode === 1);
  own.message('process-error', {message: 'owned reported failure'}); await Promise.resolve(); await Promise.resolve();
  assert.ok(own.timers.some(timer => timer.ms === 2000));
  own.close(1); await completed; own.assertTerminal();
  own.fireClearedCallbacks(); own.child.emit('disconnect'); own.child.emit('error', new Error('late child error'));
  assert.deepEqual(own.signals, []); own.assertTerminal();
});

test('explicit finalization reaps a surviving owned Linux group once, then revokes timer authority', async t => {
  const own = boundary(t, {linux: true, descendant: true});
  const work = runMarketplaceProcess({...own.job, mode: 'index', sourceDigest: null});
  const completed = assert.rejects(work, error => {
    assert.equal(error.processReceipt.absentAfterClose, true); assert.equal(error.processReceipt.processGroupAbsent, true);
    return true;
  });
  own.close(1); await completed;
  assert.deepEqual(own.signals, [{target: -own.child.pid, signal: 'SIGKILL'}]); own.assertTerminal();
  own.fireClearedCallbacks();
  assert.equal(own.signals.length, 1); own.assertTerminal();
});

test('a live owned child still receives bounded TERM/KILL escalation on a causal error', async t => {
  const own = boundary(t);
  const work = runMarketplaceProcess({...own.job, mode: 'index', sourceDigest: null});
  const completed = assert.rejects(work, /live child failed/);
  own.child.emit('error', new Error('live child failed'));
  assert.deepEqual(own.signals, [{target: own.child.pid, signal: 'SIGTERM'}]);
  own.timers.find(timer => timer.ms === 2000).callback();
  assert.deepEqual(own.signals, [{target: own.child.pid, signal: 'SIGTERM'}, {target: own.child.pid, signal: 'SIGKILL'}]);
  own.close(null, 'SIGKILL'); await completed; own.assertTerminal();
});
