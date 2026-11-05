import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const CI_PROFILE = 'atomic80-owned-jsonb-id-mongo-http-linux-ci-v2';
export const HARNESS_BASE = 'd192357a03e1a48a19528ff0086e8e81b62ac562';
export const HAPI = '7270b1eba0e4e118e61fd282dbf44a66f361df47';
export const IMAGE = 'docker.io/library/mongo@sha256:4c7d0fb8fde0681e2ae443b0b09371ec9c31a81caab05af9579458bfcb30d656';
export const LIMITS = Object.freeze({parentMS: 600000, workloadMS: 360000, childMS: 420000, graceMS: 10000,
  stdoutBytes: 1048576, fileBytes: 96 * 1024 ** 2, evidenceBytes: 256 * 1024 ** 2, evidenceFiles: 32768,
  fixtureCPUs: 2000000000, fixtureMemory: 1073741824});
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function expectedHead(eventName, event, githubSHA) {
  assert(['pull_request', 'workflow_dispatch'].includes(eventName));
  const selected = eventName === 'pull_request' ? event.pull_request?.head?.sha : githubSHA;
  assert.match(selected, /^[a-f0-9]{40}$/); return selected;
}
export function assertOwnedUri(uri, fixture) {
  const value = new URL(uri); assert.equal(value.protocol, 'mongodb:'); assert.equal(value.hostname, '127.0.0.1');
  assert.equal(value.username + value.password + value.hash, ''); assert.equal(value.pathname, '/');
  assert(Number(value.port) > 1024 && Number(value.port) < 65536 && value.port !== '27017');
  assert.deepEqual([...value.searchParams.keys()].sort(), ['directConnection', 'replicaSet']);
  assert.equal(value.searchParams.get('directConnection'), 'true'); assert.equal(value.searchParams.get('replicaSet'), fixture.replicaSet);
  assert.equal(value.port, fixture.port); assert.match(fixture.run, /^[a-f0-9]{32}$/);
  assert.equal(fixture.replicaSet, 'h45rs_' + fixture.run); assert.equal(fixture.member, 'hyp-projection-' + fixture.run + '-replica:27017');
}
export function assertChildReceipt(receipt) {
  for (const key of ['spawnObserved', 'closed', 'stdoutEOF', 'stderrEOF', 'streamFilesClosed']) assert.equal(receipt[key], true, key);
  assert(Number.isSafeInteger(receipt.pid) && receipt.pid > 0); assert.match(receipt.birth, /^\d+$/);
  assert.equal(receipt.code, 0); assert.equal(receipt.signal, null); assert.equal(receipt.status, 'passed');
}
