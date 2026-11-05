// Linux-only physical child. No fixture, external URL or executable override is accepted.
import assert from 'node:assert/strict';
import {readFileSync, lstatSync, realpathSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {admitController, root, hapiRoot} from './admission.mjs';
import {LIMITS, assertOwnedUri, sha} from '../jsonb-display-bson-v3/contract.mjs';
import {createPhysicalGuard} from '../jsonb-display-bson-v3/guard.mjs';
import {evidenceWriter, exclusiveFile, processIdentity} from '../jsonb-display-bson-v3/io.mjs';
import {PROFILE as RUN_PROFILE} from './contract.mjs';
const CI_PROFILE = 'schema-id-mongo-owned-v1';
export async function main() {
  assert.equal(process.platform, 'linux'); assert.equal(process.argv.length, 3);
  const path = resolve(process.argv[2]); assert(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink());
  const intent = JSON.parse(readFileSync(path)); assert.equal(intent.profile, CI_PROFILE);
  assert(['original-lifecycle', 'portable-safe-image'].includes(intent.inputProfile));
  const output = join(realpathSync(root), 'out/schema-id-mongo-v1-owned-' + intent.inputProfile);
  assert.equal(realpathSync(path), join(output, 'child-intent.json')); assert.equal(intent.output, output);
  assertOwnedUri(intent.uri, intent.fixture);
  const admission = await admitController(); assert.deepEqual(admission.reviewedHarness, intent.admission.reviewedHarness);
  assert.equal(admission.runtime.sha256, intent.admission.runtime.sha256); assert.equal(process.version, intent.admission.runtime.node);
  assert.deepEqual(processIdentity(intent.controller.pid), intent.controller);
  const writer = evidenceWriter(join(output, 'child-evidence'));
  const physical = createPhysicalGuard({root, deadlineMS: LIMITS.workloadMS, persist: row => writer.persist({kind: 'physical-guard', ...row})});
  let stop, client, result, primary, clientClosed = false;
  const retain = error => {primary ??= error;};
  const interrupted = () => {stop ??= new Error('Owned qualification child interrupted');};
  process.once('SIGINT', interrupted); process.once('SIGTERM', interrupted);
  const guard = () => {if (stop) throw stop; physical.guard(); assert.deepEqual(processIdentity(intent.controller.pid), intent.controller);};
  const terminal = {schemaVersion: 1, profile: CI_PROFILE, status: 'running', identity: processIdentity(),
    argv: process.argv.slice(), admission, fixture: intent.fixture, inputProfile: intent.inputProfile, clientClosed: false};
  exclusiveFile(join(output, 'child-startup.json'), Buffer.from(JSON.stringify(terminal) + '\n'));
  try {
    physical.checkpoint('before'); guard();
    const {verifyOriginalReports} = await import('../jsonb-display-mongo-http/assembly.mjs');
    assert.equal(verifyOriginalReports(join(output, 'reports')).length, 4);
    const {verifySchemaReports} = await import('./schema-oracle.mjs'); assert.equal((await verifySchemaReports(join(output, 'schema-reports'))).length,4);
    const {MongoClient} = createRequire(join(hapiRoot, 'package.json'))('mongodb');
    client = new MongoClient(intent.uri, {directConnection: true, retryReads: false, retryWrites: false, maxAdaptiveRetries: 0,
      promoteLongs: false, monitorCommands: true, maxPoolSize: 2, serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, timeoutMS: 5000});
    await client.connect(); guard(); const hello = await client.db('admin').command({hello: 1});
    assert.equal(hello.setName, intent.fixture.replicaSet); assert.equal(hello.isWritablePrimary, true); assert.deepEqual(hello.hosts, [intent.fixture.member]);
    const {runJsonbDisplayQualification} = await import('./workload.mjs');
    result = await runJsonbDisplayQualification({profile: RUN_PROFILE, hapiRoot, client,
      databaseName: intent.databaseName, inputProfile: intent.inputProfile, originalReportRoot: join(output, 'reports'), schemaReportRoot: join(output, 'schema-reports'),
      reviewedHarness: admission.reviewedHarness, guard, persist: row => writer.persist(row),
      persistBinary: (name, bytes) => {writer.write(name, bytes); return {path: name, length: bytes.length, sha256: sha(bytes)};}});
    assert.equal(result.status, 'passed-bounded-schema-id-display-only');
    for (const key of ['httpClosed', 'readsClosed', 'sessionsEnded', 'databaseDropped']) assert.equal(result.cleanup[key], true);
    assert.equal(result.observations.length, 27); assert.equal(result.refusals.length, 6);
  } catch (error) {retain(error);}
  finally {
    try {if (client) {await client.close(); clientClosed = true;}} catch (error) {retain(error);}
    try {physical.checkpoint('after');} catch (error) {retain(error);}
    process.removeListener('SIGINT', interrupted); process.removeListener('SIGTERM', interrupted);
    Object.assign(terminal, {status: primary ? 'failed' : 'passed', clientCreated: !!client, clientClosed,
      result: result ? {status: result.status, observations: result.observations.length, refusals: result.refusals.length, cleanup: result.cleanup} : null,
      failure: primary ? {name: primary.name, message: String(primary.message).slice(0, 4096)} : null, physical: physical.report(), evidence: writer.summary(), cpuUsage: process.cpuUsage()});
    try {exclusiveFile(join(output, 'child-result.json'), Buffer.from(JSON.stringify(terminal) + '\n'));} catch (error) {retain(error);}
  }
  if (primary) throw primary;
  console.log(JSON.stringify({profile: CI_PROFILE, status: 'passed', observations: result.observations.length, refusals: result.refusals.length}));
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch(error => {console.error(String(error?.stack ?? error).slice(0, 8192)); process.exitCode = 1;});
