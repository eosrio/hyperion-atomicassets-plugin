// Actual writer functions with inert file/clock ports; no Windows filesystem or timing workload.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {posix} from 'node:path';
import {runInNewContext} from 'node:vm';
import {LIMITS, sha} from './contract.mjs';

function writer(failure) {
  const source = readFileSync(new URL('./io.mjs', import.meta.url), 'utf8'), start = source.indexOf('export function syncDirectory('), end = source.indexOf('export function ownedOutput(', start);
  let tick = 25n;
  const context = {assert, Buffer, LIMITS, sha, structuredClone, join: posix.join, dirname: posix.dirname,
    process: {hrtime: {bigint: () => {tick += 75n; return tick;}}},
    mkdirSync() {}, realpathSync: path => path, lstatSync: () => ({isSymbolicLink: () => false}),
    openSync: (path, flags) => ({path, flags}), closeSync() {}, writeSync: (_fd, bytes) => bytes.length,
    fsyncSync: fd => {if (failure === 'file' && fd.path.endsWith('.bson') || failure === 'directory' && fd.path === '/owned/evidence') throw new Error('injected fsync failure');}};
  runInNewContext(source.slice(start, end).replaceAll('export ', '') + '\nthis.make=evidenceWriter;', context);
  return context.make('/owned/evidence');
}

test('binary IO counters observe actual file/directory fsyncs and exclude ordinary JSON evidence', () => {
  const w = writer(); w.persist({kind: 'guard'}); w.write('started-00001-1.bson', Buffer.from([1, 2, 3]));
  const summary = w.summary(); assert.equal(summary.files, 2); assert.equal(summary.ledger.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(summary.binaryIO)), {attempts: 1, files: 1, bytes: 3, failures: 0,
    fileFsyncAttempts: 1, fileFsyncCompleted: 1, directoryFsyncAttempts: 1, directoryFsyncCompleted: 1, elapsedNS: '75'});
});

test('binary IO failures retain actual attempted/completed counts without a successful ledger entry', () => {
  for (const failure of ['file', 'directory']) {
    const w = writer(failure); assert.throws(() => w.write('started-00001-1.bson', Buffer.from([1, 2, 3])), /fsync failure/);
    const summary = w.summary(); assert.equal(summary.files, 0); assert.equal(summary.ledger.length, 0);
    assert.equal(summary.binaryIO.attempts, 1); assert.equal(summary.binaryIO.failures, 1); assert.equal(summary.binaryIO.files, 0);
    assert.equal(summary.binaryIO.fileFsyncAttempts, 1); assert.equal(summary.binaryIO.fileFsyncCompleted, failure === 'file' ? 0 : 1);
    assert.equal(summary.binaryIO.directoryFsyncAttempts, failure === 'directory' ? 1 : 0); assert.equal(summary.binaryIO.directoryFsyncCompleted, 0);
    assert.equal(summary.binaryIO.elapsedNS, '75');
  }
});
