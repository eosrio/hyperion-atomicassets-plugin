// Read-only current-product observation. The old full native closure remains an
// immutable expected inventory, never an inherited physical acceptance result.
import assert from 'node:assert/strict';
import {readFileSync, realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inventory, verifyOriginalReports} from '../jsonb-display-mongo-http/assembly.mjs';
import {PROFILE, PINS, PRODUCT, PRODUCT_TREE, FROZEN_ASSEMBLY, FROZEN_ASSEMBLY_SHA256, DISPLAY_EMISSIONS, sha} from './contract.mjs';
export {verifyOriginalReports};
export const root = fileURLToPath(new URL('../../../', import.meta.url));
const git = (base, ...args) => execFileSync('git', ['-c', 'core.autocrlf=false', ...args], {cwd: base, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024}).trim();
const members = (base, paths) => paths.map(path => {const raw = readFileSync(join(base, path)); return {path, bytes: raw.length, sha256: sha(raw)};});
export function frozenAssembly() {
  const raw = readFileSync(join(root, FROZEN_ASSEMBLY)); assert.equal(sha(raw), FROZEN_ASSEMBLY_SHA256);
  const prior = JSON.parse(raw); assert.equal(prior.physicalAcceptance, 'pending');
  assert.equal(prior.observation.pins.hapi, PINS.hapi); assert.equal(prior.observation.pins.sdk, PINS.sdk);
  return prior.observation;
}
export function observeProduct() {
  assert.equal(git(root, 'rev-parse', PRODUCT + '^{tree}'), PRODUCT_TREE);
  assert.equal(git(root, 'diff', PRODUCT, '--', 'src', 'vendor', 'package.json', 'package-lock.json', 'tsconfig.json', '.bun-version'), '', 'Current product source/pins changed');
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json')));
  assert.equal(lock.packages['node_modules/@eosrio/hyperion-sdk'].resolved, 'git+https://github.com/eosrio/hyperion-sdk.git#' + PINS.sdk);
  const pluginDist = inventory(join(root, 'dist')); assert(DISPLAY_EMISSIONS.every(path => pluginDist.some(row => row.path === path)));
  return {atomicSources: inventory(join(root, 'src')), pluginDist};
}
export function expectedAssembly() {
  const profile = JSON.parse(readFileSync(new URL('./profile.json', import.meta.url)));
  assert.equal(profile.profile, PROFILE); assert.equal(profile.physicalAcceptance, 'pending');
  assert.deepEqual(profile.pins, PINS); assert.equal(profile.frozenAssemblySha256, FROZEN_ASSEMBLY_SHA256);
  assert.deepEqual(Object.keys(profile.currentProduct).sort(), ['atomicSources', 'pluginDist']);
  return {...frozenAssembly(), profile: PROFILE, pins: PINS, excludedHarnessCycles: [], ...profile.currentProduct};
}
export function observeAssembly(hapiRoot) {
  hapiRoot = realpathSync(hapiRoot); const prior = frozenAssembly(), product = observeProduct();
  assert.equal(git(hapiRoot, 'rev-parse', 'HEAD'), PINS.hapi); assert.equal(git(hapiRoot, 'rev-parse', 'HEAD^{tree}'), PINS.hapiTree);
  assert.equal(git(hapiRoot, 'status', '--porcelain=v1', '--untracked-files=all'), '', 'Clean exact HAPI source input required');
  for (const path of ['package-lock.json', 'packages/backend-mongodb/package-lock.json']) {
    const lock = JSON.parse(readFileSync(join(hapiRoot, path)));
    assert.equal(lock.packages['node_modules/@eosrio/hyperion-sdk'].resolved, 'git+https://github.com/eosrio/hyperion-sdk.git#' + PINS.sdk);
  }
  return {...prior, profile: PROFILE, pins: PINS, excludedHarnessCycles: [], ...product,
    vendor: inventory(join(root, 'vendor')), harness: members(root, prior.harness.map(row => row.path)),
    sevenDisplayEmissions: product.pluginDist.filter(row => DISPLAY_EMISSIONS.includes(row.path)), sdkDist: inventory(join(root, 'node_modules/@eosrio/hyperion-sdk/dist')),
    hapiSources: members(hapiRoot, git(hapiRoot, 'ls-files', '-z').split('\0').filter(Boolean).sort()),
    hapiBuild: inventory(join(hapiRoot, 'build')), nativeDist: inventory(join(hapiRoot, 'packages/backend-mongodb/dist')),
    dependencies: Object.fromEntries([
      ['hapiSDK', 'node_modules/@eosrio/hyperion-sdk/dist'], ['nativeSDK', 'packages/backend-mongodb/node_modules/@eosrio/hyperion-sdk/dist'],
      ['rootMongo', 'node_modules/mongodb'], ['rootBSON', 'node_modules/bson'], ['nativeMongo', 'packages/backend-mongodb/node_modules/mongodb'],
      ['nativeBSON', 'packages/backend-mongodb/node_modules/bson'], ['Fastify', 'node_modules/fastify']
    ].map(([name, path]) => [name, inventory(join(hapiRoot, path))]))};
}
export async function verifyAssembly(hapiRoot, reviewedHarness) {
  const harness = {commit: git(root, 'rev-parse', 'HEAD'), tree: git(root, 'rev-parse', 'HEAD^{tree}')};
  assert.deepEqual(harness, reviewedHarness, 'Reviewed immutable current harness commit/tree required');
  assert.equal(git(root, 'status', '--porcelain=v1', '--untracked-files=all'), '', 'Clean isolated current harness checkout required');
  const actual = observeAssembly(hapiRoot); assert.deepEqual(actual, expectedAssembly(), 'Current626 full consumer closure differs');
  return {profile: PROFILE, pins: PINS, harness, observationSha256: sha(JSON.stringify(actual)),
    runtime: {node: process.version, executableSha256: sha(readFileSync(process.execPath)), platform: process.platform, arch: process.arch}};
}
