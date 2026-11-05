// Pure actual-SDK module identity controls. No engine, worker, HTTP or timer workload.
import assert from 'node:assert/strict';
import test from 'node:test';
import {findPackageJSON} from 'node:module';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import * as logical from '@eosrio/hyperion-sdk/projection-stateful';
import * as owner from '@eosrio/hyperion-sdk/projection-stateful-owner-v2';
import {captureStatefulSourceV2} from '@eosrio/hyperion-sdk/projection-stateful-source-v2';
import {createAtomicStatefulPlugin} from '../../../dist/index.js';
import {loadHostSdkPorts} from './host-sdk.mjs';
import {PINS, PROFILE as FROZEN_PROFILE} from '../jsonb-display-mongo-http/contract.mjs';
import {PROFILE, assertRunInput} from './run-contract-v2.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const ownerPath = join(dirname(findPackageJSON('@eosrio/hyperion-sdk', new URL('../../../package.json', import.meta.url))), 'dist/projection-stateful-owner-v2.js');
const foreignOwner = await import(pathToFileURL(ownerPath).href + '?separate-sdk-instance');
const bounds = {value: {depth: 16, nodes: 256, fields: 32, arrayElements: 32, stringBytes: 1024, recordBytes: 4096, integerFields: 4, pathSegments: 8},
  envelope: {depth: 32, nodes: 8192, fields: 64, arrayElements: 128, stringBytes: 65536, recordBytes: 262144, integerFields: 4, pathSegments: 8},
  selectors: 128, recordKinds: 21, inputOccurrences: 64, inputBytes: 262144, keyBytes: 128, readKeys: 8, readAttempts: 32,
  mutations: 16, candidateBytes: 262144, responseRecords: 32, responseBytes: 262144};
async function capture() {
  const actual = createAtomicStatefulPlugin({limits: bounds}).getStatefulProjectionsV2({binding: {}, sourceCapabilities: ['original-action-authorization-v1']}).projections[0];
  const projection = await logical.captureStatefulDeclaration({...actual.definition,
    binding: {chainId: '1'.repeat(64), backendId: 'pure-sdk-cohort', generation: 'one', mappingRevision: '2'.repeat(64), hookArtifact: '3'.repeat(64),
      hookRevision: '4'.repeat(64), codecRevision: '5'.repeat(64), normalizerRevision: '6'.repeat(64)},
    selectors: actual.definition.selectors.map(row => ({...row, abiDeployment: 'pure-source-only', abiSha256: '7'.repeat(64)}))}, bounds);
  const declaration = await owner.captureStatefulOwnerDeclarationV2(projection, 2);
  const target = {schemaVersion: 2, chainId: '1'.repeat(64), declarationDigest: declaration.digest,
    owner: {id: 'pure-owner', generation: 'one'},
    previous: {declarationDigest: declaration.digest, backendId: 'pure-sdk-cohort', generation: 'one', revision: '9'.repeat(64), checkpoint: {blockNum: 0, blockId: '0'.repeat(64)}},
    block: {blockNum: 1, blockId: '8'.repeat(64), previousBlockId: '0'.repeat(64)},
    rawSource: {commitId: 'pure:one', selectionId: 'pure:one', observationId: 'pure:one', observationDigest: 'a'.repeat(64)}};
  return {declaration, target};
}
test('actual SDK local capture rejects the same declaration through a separate owner module instance', async () => {
  const {declaration, target} = await capture();
  await assert.rejects(foreignOwner.captureStatefulRawTargetV2(declaration, target), /Recapture the owner declaration before use/);
});
test('the selected SDK owner module accepts the real locally captured declaration', async () => {
  const {declaration, target} = await capture();
  const ports = await loadHostSdkPorts(root, {profile: FROZEN_PROFILE, pins: PINS});
  assert.equal(ports.owner, owner); assert.equal(ports.captureStatefulSourceV2, captureStatefulSourceV2);
  assert.equal(ports.receipt.sdkCommit, PINS.sdk); assert.equal(ports.receipt.ports.length, 2);
  const selected = process.env.ATOMIC81_REPRO_FOREIGN_SDK === '1' ? foreignOwner : ports.owner;
  const result = await selected.captureStatefulRawTargetV2(declaration, target);
  assert.equal(result.target.declarationDigest, declaration.digest);
});

test('SDK port selection rejects another cohort or missing installed root before returning execution functions', async () => {
  await assert.rejects(loadHostSdkPorts(root, {profile: FROZEN_PROFILE, pins: {...PINS, sdk: '0'.repeat(40)}}));
  await assert.rejects(loadHostSdkPorts(root, {profile: 'another-fixture', pins: PINS}));
  await assert.rejects(loadHostSdkPorts(join(root, 'missing-root'), {profile: FROZEN_PROFILE, pins: PINS}));
});

test('the new run identity retains every original input validation and rejects the old profile', () => {
  const input = {profile: PROFILE, databaseName: 'h45_indexed_abcdef012345', inputProfile: 'original-lifecycle',
    reviewedHarness: {commit: 'a'.repeat(40), tree: 'b'.repeat(40)}, guard() {}, persist() {}};
  assertRunInput(input); assert.throws(() => assertRunInput({...input, profile: FROZEN_PROFILE}));
  assert.throws(() => assertRunInput({...input, databaseName: 'borrowed'}));
  assert.throws(() => assertRunInput({...input, inputProfile: 'unreviewed-input'}));
});

test('the revised entry has only the enumerated SDK-binding and profile deltas from the frozen v1 workload', () => {
  let source = readFileSync(new URL('../jsonb-display-mongo-http/run.mjs', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const changes = [
    ["// Actual owned MongoDB/HAPI HTTP workload. Never import/execute this entry point on Windows.\n// Root supplies an admitted fresh client, physical guards and durable by-value evidence storage.", "// Version 2 executes the unchanged workload with the actual admitted HAPI SDK instance.\n// Frozen v1 remains failed; never import/execute this entry point on Windows."],
    ["import * as owner from '@eosrio/hyperion-sdk/projection-stateful-owner-v2';\nimport {captureStatefulSourceV2} from '@eosrio/hyperion-sdk/projection-stateful-source-v2';", "import {loadHostSdkPorts} from './host-sdk.mjs';"],
    ["from './contract.mjs';", "from './run-contract-v2.mjs';"],
    ["from './corpus.mjs';", "from '../jsonb-display-mongo-http/corpus.mjs';"],
    ["from './assembly.mjs';", "from '../jsonb-display-mongo-http/assembly.mjs';"],
    ["import('./host.mjs')", "import('../jsonb-display-mongo-http/host.mjs')"],
    ["const assembly = await verifyAssembly(hapiRoot, options.reviewedHarness), originalReports = verifyOriginalReports(options.originalReportRoot); guard();", "const assembly = await verifyAssembly(hapiRoot, options.reviewedHarness), originalReports = verifyOriginalReports(options.originalReportRoot); guard();\n  const {owner, captureStatefulSourceV2, receipt: hostSdk} = await loadHostSdkPorts(hapiRoot, assembly);\n  await persist({event: 'host-sdk-ports', ...hostSdk}); guard();"],
    ["acceptance: copy(ACCEPTANCE), assembly, inputProfile:", "acceptance: copy(ACCEPTANCE), assembly, hostSdk, inputProfile:"]
  ];
  for (const [before, after] of changes) {assert.equal(source.split(before).length, 2, before); source = source.replace(before, after);}
  assert.equal(readFileSync(new URL('./run-host-sdk-v2.mjs', import.meta.url), 'utf8').replaceAll('\r\n', '\n'), source);
  const child = readFileSync(new URL('./child.mjs', import.meta.url), 'utf8');
  assert(child.includes("import('./run-host-sdk-v2.mjs')")); assert(child.includes('profile: RUN_PROFILE'));
  const revised = source;
  assert(revised.indexOf('await verifyAssembly(') < revised.indexOf('await loadHostSdkPorts('));
  assert(revised.indexOf('await loadHostSdkPorts(') < revised.indexOf("client.db('admin')"));
});
