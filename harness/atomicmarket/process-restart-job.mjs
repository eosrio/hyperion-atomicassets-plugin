import assert from 'node:assert/strict';
import {isAbsolute} from 'node:path';

export const PROCESS_RESTART_LIMITS = Object.freeze({jobBytes: 16 * 1024, messageBytes: 128 * 1024,
  logBytes: 256 * 1024, deadlineMS: 120_000, acknowledgementMS: 15_000});

/** Private fixed fixture job, never a database-URL or executable-command interface. */
export function validateProcessRestartJob(input, parentPid) {
  assert.ok(input && typeof input === 'object' && !Array.isArray(input));
  assert.deepEqual(Object.keys(input).sort(), ['backendId', 'collectionPrefix', 'databaseName', 'hapiRoot',
    'mode', 'parentPid', 'replicaSet', 'run', 'sourceDigest', 'uri'].sort());
  assert.ok(Number.isSafeInteger(parentPid) && parentPid > 0);
  assert.equal(input.parentPid, parentPid);
  assert.match(input.run, /^[0-9a-f]{32}$/);
  assert.ok(input.mode === 'index' || input.mode === 'recover');
  assert.equal(input.replicaSet, `h45rs_${input.run}`);
  assert.equal(input.databaseName, `hyp_marketplace_${input.run}`);
  assert.equal(input.collectionPrefix, 'h45_marketplaces_process');
  assert.equal(input.backendId, `fixture-marketplace-process-${input.run}`);
  assert.match(input.uri, /^mongodb:\/\/127\.0\.0\.1:([1-9][0-9]{3,4})\/\?directConnection=true$/);
  const port = Number(new URL(input.uri).port);
  assert.ok(port > 1024 && port < 65536);
  for (const key of ['hapiRoot']) {
    assert.equal(typeof input[key], 'string'); assert.ok(isAbsolute(input[key]));
    assert.ok(input[key].length <= 4096 && !input[key].includes('\0'));
  }
  if (input.mode === 'index') assert.equal(input.sourceDigest, null);
  else assert.match(input.sourceDigest, /^[0-9a-f]{64}$/);
  assert.ok(Buffer.byteLength(JSON.stringify(input)) <= PROCESS_RESTART_LIMITS.jobBytes);
  return Object.freeze({...input});
}
