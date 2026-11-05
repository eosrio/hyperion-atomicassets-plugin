// Read-only assembly observation. Its own bytes and profile are bound by the reviewed harness commit.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, lstatSync, realpathSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {PROFILE, PINS, DISPLAY_EMISSIONS} from './contract.mjs';
import {corpus} from './corpus.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (base, ...args) => execFileSync('git', ['-c', 'core.autocrlf=false', ...args], {cwd: base, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024}).trim();
export function inventory(base) {
  base = realpathSync(base); const rows = []; let bytes = 0;
  const visit = directory => {for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name), stat = lstatSync(path); assert(!stat.isSymbolicLink());
    if (stat.isDirectory()) visit(path); else {assert(stat.isFile() && rows.length < 4096 && (bytes += stat.size) <= 128 * 1024 * 1024);
      const raw = readFileSync(path); rows.push({path: relative(base, path).replaceAll('\\', '/'), bytes: raw.length, sha256: sha(raw)});}
  }}; visit(base); return rows;
}
const members = (base, paths) => paths.map(path => {const raw = readFileSync(join(base, path)); return {path, bytes: raw.length, sha256: sha(raw)};});
export function observeAssembly(hapiRoot) {
  hapiRoot = realpathSync(hapiRoot);
  assert.equal(git(hapiRoot, 'rev-parse', 'HEAD'), PINS.hapi); assert.equal(git(hapiRoot, 'rev-parse', 'HEAD^{tree}'), PINS.hapiTree);
  assert.equal(git(hapiRoot, 'status', '--porcelain=v1', '--untracked-files=all'), '', 'Clean exact HAPI source input required');
  assert.equal(git(root, 'rev-parse', PINS.atomic + '^{tree}'), PINS.atomicTree);
  assert.equal(git(root, 'diff', PINS.atomic, '--', 'src', 'vendor', 'package.json', 'package-lock.json', 'tsconfig.json', '.bun-version'), '', 'Product source/pins cannot change in this qualifier');
  const manifest = JSON.parse(readFileSync(join(root, 'package-lock.json'))), native = JSON.parse(readFileSync(join(hapiRoot, 'packages/backend-mongodb/package-lock.json')));
  for (const lock of [manifest, native, JSON.parse(readFileSync(join(hapiRoot, 'package-lock.json')))])
    assert.equal(lock.packages['node_modules/@eosrio/hyperion-sdk'].resolved, 'git+https://github.com/eosrio/hyperion-sdk.git#' + PINS.sdk);
  const namespace = 'scripts/qualification/jsonb-display-mongo-http', excluded = [namespace + '/profile.json', namespace + '/assembly.mjs'];
  const harness = readdirSync(join(root, namespace)).filter(name => !['profile.json', 'assembly.mjs'].includes(name)).map(name => namespace + '/' + name);
  const sourceInputs = ['AGENTS.md', 'CONTRIBUTING.md', 'package.json', 'package-lock.json', '.bun-version', 'tsconfig.json',
    'tests/jsonb-display-mongo-http.test.mjs', 'tests/fixtures/jsonb-display-pg16.json', 'harness/atomicassets/lifecycle-input.cjs',
    'fixtures/harness/atomicassets/lifecycle/input.json', 'fixtures/harness/atomicassets/lifecycle/input-safe-image.json',
    'fixtures/harness/atomicassets/lifecycle/provenance.json', 'fixtures/harness/atomicassets/lifecycle/original/src/filler/utils.ts',
    'fixtures/harness/atomicassets/lifecycle/original/src/utils/eosio.ts',
    'fixtures/harness/atomicassets/lifecycle/original/src/filler/handlers/atomicassets/processors/collections.ts', ...harness].sort();
  const pluginDist = inventory(join(root, 'dist'));
  assert(DISPLAY_EMISSIONS.every(path => pluginDist.some(row => row.path === path)));
  return {schemaVersion: 1, profile: PROFILE, pins: PINS, excludedHarnessCycles: excluded,
    atomicSources: inventory(join(root, 'src')), vendor: inventory(join(root, 'vendor')), harness: members(root, sourceInputs),
    pluginDist, sevenDisplayEmissions: pluginDist.filter(row => DISPLAY_EMISSIONS.includes(row.path)), sdkDist: inventory(join(root, 'node_modules/@eosrio/hyperion-sdk/dist')),
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
  assert.deepEqual(harness, reviewedHarness, 'Root must bind the reviewed immutable harness commit and tree');
  assert.equal(git(root, 'status', '--porcelain=v1', '--untracked-files=all'), '', 'Clean isolated Atomic harness checkout required');
  const expected = JSON.parse(readFileSync(new URL('./profile.json', import.meta.url)));
  assert.equal(expected.profile, PROFILE); assert.equal(expected.physicalAcceptance, 'pending');
  const actual = observeAssembly(hapiRoot); assert.deepEqual(actual, expected.observation, 'New Atomic79/HAPI7270 consumer closure differs');
  return {profile: PROFILE, pins: PINS, harness, observationSha256: sha(JSON.stringify(actual)),
    runtime: {node: process.version, executableSha256: sha(readFileSync(process.execPath)), platform: process.platform, arch: process.arch}};
}
export function verifyOriginalReports(directory) {
  assert.equal(typeof directory, 'string', 'Root must stage the four exact original PG reports');
  return corpus.reports.map(row => {
    assert(!row.file.includes('/') && !row.file.includes('\\')); const path = join(realpathSync(directory), row.file), stat = lstatSync(path);
    assert(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 4 * 1024 * 1024);
    const bytes = readFileSync(path); assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256);
    return {file: row.file, bytes: bytes.length, sha256: row.sha256, report: JSON.parse(bytes)};
  });
}
