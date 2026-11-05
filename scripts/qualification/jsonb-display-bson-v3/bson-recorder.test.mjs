import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createBsonRecorder } from './bson-recorder.mjs';

let BSON;
for (const root of [process.cwd() + '/out/jsonb-display-inputs/hapi/package.json', 'P:/eosrio/hyperion-tools/out/reader-confirmed-startup-208-20261105/package.json', import.meta.url]) {
  try { BSON = createRequire(root)('bson'); break; } catch {}
}
if (!BSON) throw new Error('Actual BSON module required for recorder tests');
const start = (id, command = { insert: 'x' }) => ({ databaseName: 'owned', commandName: 'insert', requestId: id, command });
const success = (id, reply = { ok: 1 }) => ({ commandName: 'insert', requestId: id, reply });
function setup(options = {}) {
  const files = new Map();
  const recorder = createBsonRecorder({ databaseName: 'owned', serialize: BSON.serialize, persistBinary: (name, bytes) => { files.set(name, bytes); return {path: name, length: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')}; }, ...options });
  return { recorder, files };
}
test('actual BSON survives by value with exact hashes and bounded references', () => {
  const { recorder: r, files } = setup();
  const id = new BSON.ObjectId(), binary = new BSON.Binary(Buffer.from([0, 255, 7]));
  const command = { insert: 'x', id, binary, long: BSON.Long.fromString('9007199254740993'), date: new Date('2020-01-01T00:00:00Z') };
  r.commandStarted(start(1, command)); command.binary.buffer[0] = 42;
  r.commandSucceeded(success(1, { ok: 1, id })); r.assertComplete();
  const receipt = r.receipt(); assert.equal(receipt.refs.length, 2);
  for (const ref of receipt.refs) { const data = files.get(ref.path); assert.equal(ref.length, data.length); assert.equal(ref.sha256, createHash('sha256').update(data).digest('hex')); }
  const decoded = BSON.deserialize(files.get(receipt.refs[0].path));
  assert.equal(decoded.id.toHexString(), id.toHexString()); assert.equal(decoded.binary.buffer[0], 0); assert.equal(decoded.long.toString(), '9007199254740993'); assert.equal(decoded.date.toISOString(), '2020-01-01T00:00:00.000Z');
});
test('sink failure never escapes callback and remains latched after recovery', () => {
  let fail = true; const { recorder: r } = setup({ persistBinary: () => { if (fail) throw new Error('disk'); return {path: 'unused', length: 0, sha256: ''}; } });
  assert.doesNotThrow(() => r.commandStarted(start(1))); fail = false;
  assert.doesNotThrow(() => r.commandSucceeded(success(1))); assert.throws(() => r.assertHealthy(), /disk/); assert.throws(() => r.assertComplete(), /disk/); assert.equal(r.summary().counts.unrecorded, 2);
});
test('limits, async or undefined sinks, and serialization errors do not escape', () => {
  for (const options of [{rawByteLimit: 1}, {eventLimit: 1}, {persistBinary: () => undefined}, {persistBinary: async () => true},
    {persistBinary: async () => {throw Error('asynchronous sink refusal');}}, {serialize: async () => {throw Error('asynchronous serializer refusal');}},
    {serialize: () => {throw Error('serialize');}}]) {
    const {recorder: r} = setup(options); assert.doesNotThrow(() => { r.commandStarted(start(1)); r.commandSucceeded(success(1)); }); assert.throws(() => r.assertComplete());
  }
  assert.throws(() => setup({rawByteLimit: 128 * 1024 ** 2 + 1})); assert.throws(() => setup({eventLimit: 16385}));
});
test('pending, mismatched and duplicate terminal are incomplete; unrelated events ignored', () => {
  let {recorder: r} = setup(); r.commandStarted(start(1)); assert.throws(() => r.assertComplete(), /pending/);
  r.commandSucceeded({ ...success(1), commandName: 'update' }); assert.throws(() => r.assertComplete(), /pending/);
  ({recorder: r} = setup()); r.commandSucceeded(success(99)); r.commandStarted(start(1)); r.commandSucceeded(success(1)); r.commandSucceeded(success(1)); assert.throws(() => r.assertComplete(), /Orphan/);
});

test('empty errors latch and subsequent callbacks remain bounded', () => {
  let writes = 0; const {recorder: r} = setup({persistBinary: () => { writes++; throw new Error(''); }});
  r.commandStarted(start(1));
  for (let i = 2; i < 20000; i++) { r.commandStarted(start(i)); r.commandSucceeded(success(i)); }
  assert.throws(() => r.assertHealthy(), /BSON capture incomplete/);
  assert.equal(writes, 1); assert.equal(r.receipt().refs.length, 0); assert.equal(r.summary().pending, 1); assert.ok(r.summary().counts.unrecorded > 30000);
});
test('serializer failure cannot change a synthetic driver result', () => {
  const {recorder: r} = setup({serialize: () => {throw new Error('encode');}}), driver = new EventEmitter();
  driver.on('commandStarted', r.commandStarted); driver.on('commandSucceeded', r.commandSucceeded);
  const execute = () => {driver.emit('commandStarted', start(1)); driver.emit('commandSucceeded', success(1)); return 'driver result';};
  assert.equal(execute(), 'driver result'); assert.throws(() => r.assertComplete(), /encode/);
});
test('wrong sink hash is rejected', () => {
  const {recorder: r} = setup({persistBinary: (path, bytes) => ({path, length: bytes.length, sha256: 'wrong'})});
  assert.doesNotThrow(() => r.commandStarted(start(1))); assert.throws(() => r.assertHealthy(), /receipt/); assert.equal(r.receipt().refs.length, 0);
});


test('completeness failure latches even if a terminal arrives later', () => {
  const {recorder: r} = setup(); r.commandStarted(start(1));
  assert.throws(() => r.assertComplete(), /pending/); r.commandSucceeded(success(1));
  assert.throws(() => r.assertComplete(), /pending/); assert.equal(r.summary().pending, 1);
});
test('failure codes retain JSON scalar type and reject unsupported values', () => {
  for (const code of [42, 'E_FAIL', null]) {
    const {recorder: r} = setup(); r.commandStarted(start(1));
    r.commandFailed({commandName: 'insert', requestId: 1, failure: {message: 'bad', code}});
    assert.equal(r.receipt().refs[1].failure.code, code);
  }
  for (const code of [{}, NaN, 1n]) {
    const {recorder: r} = setup(); r.commandStarted(start(1));
    assert.doesNotThrow(() => r.commandFailed({commandName: 'insert', requestId: 1, failure: {code}}));
    assert.throws(() => r.assertHealthy(), /Unsupported failure code/);
  }
});
