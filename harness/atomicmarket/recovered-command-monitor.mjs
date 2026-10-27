import assert from 'node:assert/strict';

const reads = new Set(['find', 'getMore', 'killCursors', 'ping', 'hello', 'isMaster', 'ismaster', 'endSessions']);
const controls = new Set(['commitTransaction', 'abortTransaction']);
const dataWrites = new Set(['insert', 'update', 'delete', 'findAndModify', 'bulkWrite']);

/** Private qualifier evidence only: arm after initialization; unknown commands fail closed. */
export function recoveredCommandMonitor(client) {
  const writes = [], transactionControls = [], commandFailures = [], requests = new Map();
  let armed = false;
  const append = (rows, row) => {
    assert.ok(rows.length < 16, 'Recovered-host command evidence exceeds its budget'); rows.push(row); return row;
  };
  client.on('commandStarted', event => {
    if (!armed) return;
    assert.equal(typeof event.commandName, 'string'); assert.equal(typeof event.databaseName, 'string');
    assert.ok(Number.isInteger(event.requestId)); assert.ok(!requests.has(event.requestId));
    assert.ok(requests.size < 64, 'Recovered-host outstanding command evidence exceeds its budget');
    const row = {command: event.commandName, database: event.databaseName};
    let control;
    if (controls.has(event.commandName)) control = append(transactionControls, {...row, outcome: 'started'});
    else if (!reads.has(event.commandName) && !(event.commandName === 'aggregate' && Array.isArray(event.command?.pipeline)
      && event.command.pipeline.every(stage => stage && typeof stage === 'object'
        && !Object.hasOwn(stage, '$out') && !Object.hasOwn(stage, '$merge'))))
      append(writes, {...row, category: dataWrites.has(event.commandName) ? 'data-write' : 'unsafe-or-unknown'});
    requests.set(event.requestId, {row, control});
  });
  client.on('commandSucceeded', event => {
    if (!armed) return;
    const request = requests.get(event.requestId); requests.delete(event.requestId);
    if (!request) {append(commandFailures, {command: event.commandName, database: null, phase: 'unmatched-success'}); return;}
    if (request.control) request.control.outcome = 'succeeded';
    if (event.reply?.ok !== 1 || event.reply?.writeConcernError || event.reply?.writeErrors?.length)
      append(commandFailures, {...request.row, phase: 'reply-error', code: event.reply?.writeConcernError?.code ?? null,
        writeErrorCodes: event.reply?.writeErrors?.slice(0, 16).map(row => row.code) ?? []});
  });
  client.on('commandFailed', event => {
    if (!armed) return;
    const request = requests.get(event.requestId); requests.delete(event.requestId);
    if (request?.control) request.control.outcome = 'failed';
    append(commandFailures, {...(request?.row ?? {command: event.commandName, database: null}), phase: 'failed',
      code: event.failure?.code ?? null, message: String(event.failure?.message).slice(0, 512)});
  });
  return {writes, transactionControls, commandFailures,
    arm() {assert.equal(armed, false); armed = true;},
    assertReadOnly() {assert.deepEqual(writes, []); assert.deepEqual(commandFailures, []); assert.equal(requests.size, 0);},
    evidence() {return {writesAfterStartup: writes, transactionControlsAfterStartup: transactionControls, commandFailuresAfterStartup: commandFailures};}};
}
