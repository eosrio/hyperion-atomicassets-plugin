import { createHash } from 'node:crypto';

const MAX_BYTES = 128 * 1024 ** 2, MAX_EVENTS = 16384;
const scopedCommands = new Set(['commitTransaction', 'abortTransaction', 'endSessions']);
const writes = new Set(['insert', 'update', 'commitTransaction']);

export function createBsonRecorder({ databaseName, serialize, persistBinary, rawByteLimit = MAX_BYTES, eventLimit = MAX_EVENTS }) {
  if (typeof databaseName !== 'string' || !databaseName || typeof serialize !== 'function' || typeof persistBinary !== 'function') throw new TypeError('Invalid recorder ports or databaseName');
  for (const [name, value, max] of [['rawByteLimit', rawByteLimit, MAX_BYTES], ['eventLimit', eventLimit, MAX_EVENTS]]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new RangeError(`Invalid ${name}`);
  }
  const refs = [], pending = new Map(), completed = new Set(), counts = { started: 0, succeeded: 0, failed: 0, unrecorded: 0 };
  let rawBytes = 0, commandBytes = 0, replyBytes = 0, firstError = null, sequence = 0, nativeWrites = 0;
  const latch = error => { if (firstError === null) { try { firstError = String(error?.message ?? error).slice(0, 4096); } catch { firstError = 'Unknown capture error'; } } };
  const synchronous = (value, name) => {
    if (value !== null && (typeof value === 'object' || typeof value === 'function') && typeof value.then === 'function') {
      // Refuse unsupported asynchronous ports without leaking a later process-level rejection.
      Promise.resolve(value).catch(() => {}); throw new Error(name + ' must return synchronously');
    }
    return value;
  };
  const safeFailure = failure => {
    const code = failure?.code;
    if (code !== undefined && code !== null && typeof code !== 'string' && !(typeof code === 'number' && Number.isFinite(code))) throw new Error('Unsupported failure code');
    if (typeof code === 'string' && code.length > 256) throw new Error('Failure code exceeds metadata bound');
    return { name: String(failure?.name ?? 'Error').slice(0, 256), message: String(failure?.message ?? failure ?? '').slice(0, 4096), ...(code === undefined ? {} : { code }) };
  };
  function capture(kind, event, name, payload) {
    if (sequence >= eventLimit) throw new Error('BSON event limit exceeded');
    const seq = ++sequence;
    const requestId = event.requestId;
    if (!Number.isSafeInteger(requestId)) throw new Error('Invalid requestId');
    if (typeof name !== 'string' || !name || name.length > 256) throw new Error('Invalid commandName');
    const row = { event: kind, sequence: seq, name, requestId };
    if (kind === 'failed') row.failure = safeFailure(event.failure);
    else {
      const encoded = synchronous(serialize(payload), 'serialize');
      if (!(encoded instanceof Uint8Array)) throw new Error('serialize must return bytes synchronously');
      const bytes = Buffer.from(encoded);
      if (rawBytes + bytes.length > rawByteLimit) throw new Error('BSON raw byte limit exceeded');
      const path = `${kind}-${String(seq).padStart(5, '0')}-${requestId}.bson`;
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const result = synchronous(persistBinary(path, Buffer.from(bytes)), 'persistBinary');
      if (!result || typeof result !== 'object' || typeof result.then === 'function' || result.path !== path || result.length !== bytes.length || result.sha256 !== sha256) throw new Error('persistBinary receipt does not match bytes');
      row.path = path; row.length = bytes.length; row.sha256 = sha256;
      rawBytes += bytes.length;
      if (kind === 'started') commandBytes += bytes.length; else replyBytes += bytes.length;
    }
    refs.push(row);
  }
  function commandStarted(event) {
    try {
      if (event.databaseName !== databaseName && !scopedCommands.has(event.commandName)) return;
      counts.started++;
      if (firstError !== null) { counts.unrecorded++; return; }
      if (pending.has(event.requestId)) throw new Error('Duplicate pending requestId');
      pending.set(event.requestId, event.commandName);
      if (writes.has(event.commandName)) nativeWrites++;
      capture('started', event, event.commandName, event.command);
    } catch (error) { counts.unrecorded++; latch(error); }
  }
  function terminal(event, kind) {
    try {
      if (firstError !== null) { counts.unrecorded++; return; }
      if (!pending.has(event.requestId)) { if (completed.has(event.requestId)) throw new Error('Orphan terminal event'); return; }
      counts[kind]++;
      const name = pending.get(event.requestId);
      if (event.commandName !== name) throw new Error('Mismatched terminal commandName');
      pending.delete(event.requestId); completed.add(event.requestId);
      capture(kind, event, name, event.reply);
    } catch (error) { counts.unrecorded++; latch(error); }
  }
  const summary = () => ({ counts: { ...counts }, rawBytes, commandBytes, replyBytes, pending: pending.size, nativeWrites, firstError });
  function assertHealthy() { if (firstError !== null) throw new Error(`BSON capture incomplete: ${firstError}`); }
  function assertComplete() {
    assertHealthy();
    if (pending.size || counts.unrecorded || counts.started !== counts.succeeded + counts.failed || refs.length !== counts.started + counts.succeeded + counts.failed) latch(new Error('pending or missing events'));
    else if (!nativeWrites || !counts.succeeded) latch(new Error('native writes and succeeded replies required'));
    assertHealthy();
  }
  return { commandStarted, commandSucceeded: event => terminal(event, 'succeeded'), commandFailed: event => terminal(event, 'failed'), assertHealthy, assertComplete, summary, receipt: () => ({ ...summary(), refs: refs.map(row => ({ ...row, ...(row.failure ? { failure: { ...row.failure } } : {}) })) }) };
}



