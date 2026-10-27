import assert from 'node:assert/strict';
import test from 'node:test';
import {EventEmitter} from 'node:events';
import {recoveredCommandMonitor} from '../harness/atomicmarket/recovered-command-monitor.mjs';

function boundary() {
  const client = new EventEmitter(), monitor = recoveredCommandMonitor(client); let requestId = 0;
  return {client, monitor, start(commandName, command = {}) {
    const event = {commandName, databaseName: commandName.endsWith('Transaction') ? 'admin' : 'owned-fixture', requestId: ++requestId, command};
    client.emit('commandStarted', event); return event;
  }, success(event, reply = {ok: 1}) {client.emit('commandSucceeded', {...event, reply});},
  failure(event) {client.emit('commandFailed', {...event, failure: {code: 2, message: 'measured command failure'}});}};
}

test('actual client monitor retains successful commit as transaction control with zero data writes', () => {
  const own = boundary(); own.success(own.start('insert')); own.monitor.arm();
  const commit = own.start('commitTransaction');
  assert.deepEqual(own.monitor.transactionControls, [{command: 'commitTransaction', database: 'admin', outcome: 'started'}]);
  assert.throws(() => own.monitor.assertReadOnly()); own.success(commit); own.monitor.assertReadOnly();
  assert.deepEqual(own.monitor.evidence(), {writesAfterStartup: [], transactionControlsAfterStartup: [
    {command: 'commitTransaction', database: 'admin', outcome: 'succeeded'}], commandFailuresAfterStartup: []});
});

test('abort controls and failed transactions remain explicit and cannot qualify as successful read-only work', () => {
  const own = boundary(); own.monitor.arm(); const abort = own.start('abortTransaction'); own.failure(abort);
  assert.equal(own.monitor.transactionControls[0].outcome, 'failed'); assert.equal(own.monitor.commandFailures[0].code, 2);
  assert.throws(() => own.monitor.assertReadOnly()); assert.deepEqual(own.monitor.writes, []);
  const unknown = boundary(); unknown.monitor.arm(); unknown.failure({requestId: 999, commandName: 'commitTransaction'});
  assert.equal(unknown.monitor.commandFailures[0].database, null); assert.throws(() => unknown.monitor.assertReadOnly());
});

test('all data writes, output aggregates and unknown unsafe commands are recorded and refused', () => {
  for (const [command, body] of [['insert'], ['update'], ['delete'], ['findAndModify'], ['bulkWrite'], ['create'],
    ['dropDatabase'], ['unknownFutureCommand'], ['aggregate', {pipeline: [{$out: 'target'}]}],
    ['aggregate', {pipeline: [{$merge: 'target'}]}], ['aggregate', {pipeline: null}]]) {
    const own = boundary(); own.monitor.arm(); own.success(own.start(command, body));
    assert.equal(own.monitor.writes.length, 1, command); assert.equal(own.monitor.writes[0].command, command);
    assert.deepEqual(own.monitor.transactionControls, []); assert.throws(() => own.monitor.assertReadOnly(), command);
  }
});

test('ordinary reads remain read-only but command failures and error replies are retained and refused', () => {
  const own = boundary(); own.monitor.arm();
  for (const command of ['find', 'getMore', 'killCursors', 'ping', 'hello', 'endSessions']) own.success(own.start(command));
  own.success(own.start('aggregate', {pipeline: [{$match: {key: 1}}]})); own.monitor.assertReadOnly();
  for (const reply of [{ok: 0}, {ok: 1, writeConcernError: {code: 64}}, {ok: 1, writeErrors: [{code: 2}]}]) {
    const bad = boundary(); bad.monitor.arm(); bad.success(bad.start('find'), reply);
    assert.equal(bad.monitor.commandFailures.length, 1); assert.throws(() => bad.monitor.assertReadOnly());
  }
  const unmatched = boundary(); unmatched.monitor.arm(); unmatched.success({requestId: 999, commandName: 'unknownCommand'});
  assert.equal(unmatched.monitor.commandFailures[0].phase, 'unmatched-success'); assert.throws(() => unmatched.monitor.assertReadOnly());
  const failed = boundary(); failed.monitor.arm(); failed.failure(failed.start('find'));
  assert.equal(failed.monitor.commandFailures[0].phase, 'failed'); assert.throws(() => failed.monitor.assertReadOnly());
});

test('command evidence remains bounded and malformed monitor events cannot silently pass', () => {
  for (const command of ['commitTransaction', 'insert']) {
    const own = boundary(); own.monitor.arm();
    for (let n = 0; n < 16; n++) own.success(own.start(command));
    assert.throws(() => own.start(command), /budget/);
  }
  const pending = boundary(); pending.monitor.arm();
  for (let n = 0; n < 64; n++) pending.start('find'); assert.throws(() => pending.start('find'), /budget/);
  const malformed = boundary(); malformed.monitor.arm();
  assert.throws(() => malformed.client.emit('commandStarted', {commandName: 'find', databaseName: 'owned-fixture'}));
});
