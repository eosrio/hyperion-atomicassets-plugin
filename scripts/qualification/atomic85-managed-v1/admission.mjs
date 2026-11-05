// A separate current-product admission; frozen profiles and physical acceptance stay untouched.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, lstatSync, realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {CI_PROFILE, SCHEMA_CI_PROFILE, PRODUCT, PINS, expectedHead, sha} from './contract.mjs';
import {root, verifyAssembly} from './assembly.mjs';
export {root};
export const hapiRoot = join(root, 'out/jsonb-display-inputs/hapi');
const git = (...args) => execFileSync('git', ['-c', 'core.autocrlf=false', ...args], {cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024}).trim();
const namespace = 'scripts/qualification/atomic85-managed-v1';
const retired = ['.github/workflows/jsonb-display-bson-v3.yml', '.github/workflows/schema-id-mongo-v1.yml'];
export function retireAutomaticRoute(source) {
  const start = source.indexOf('  pull_request:\n'), end = source.indexOf('permissions:\n', start);
  assert(start > 0 && end > start); return source.slice(0, start) + source.slice(end);
}
function member(path) {const raw = readFileSync(join(root, path)); return {path, bytes: raw.length, sha256: sha(raw)};}
export function observeController() {
  const frozen = git('ls-tree', '-r', '--name-only', PRODUCT, '--',
    'scripts/qualification/jsonb-display-mongo-http', 'scripts/qualification/jsonb-display-mongo-http-ci',
    'scripts/qualification/jsonb-display-bson-v3', 'scripts/qualification/schema-id-mongo-v1',
    'tests/jsonb-display-mongo-http.test.mjs', 'tests/jsonb-display-owned-ci.test.mjs', 'tests/owned-bson-display-v3.test.mjs',
    '.github/workflows/jsonb-display-mongo-http.yml').split('\n').filter(Boolean);
  assert(frozen.length > 50);
  for (const path of frozen) assert.equal(sha(readFileSync(join(root, path))), sha(execFileSync('git', ['show', PRODUCT + ':' + path], {cwd: root})), 'Frozen qualification input changed: ' + path);
  const exceptions = retired.map(path => {
    const before = execFileSync('git', ['show', PRODUCT + ':' + path], {cwd: root, encoding: 'utf8'}), current = readFileSync(join(root, path), 'utf8');
    assert.equal(current, retireAutomaticRoute(before), 'Only the historical automatic trigger may be retired: ' + path);
    const jobs = before.slice(before.indexOf('jobs:\n')); assert.equal(current.slice(current.indexOf('jobs:\n')), jobs);
    return {path, change: 'retire-only-automatic-pull-request-trigger', originalSha256: sha(before), currentSha256: sha(current), unchangedJobsSha256: sha(jobs)};
  });
  const cycles = [namespace + '/admission.mjs', namespace + '/binding.json'];
  const current = readdirSync(join(root, namespace)).map(name => namespace + '/' + name).filter(path => !cycles.includes(path));
  for (const path of current) assert(lstatSync(join(root, path)).isFile() && !lstatSync(join(root, path)).isSymbolicLink());
  const files = [...frozen, ...retired, ...current, '.github/workflows/ci.yml',
    '.github/workflows/atomic85-owned-bson-v1.yml', '.github/workflows/atomic85-schema-id-v1.yml',
    'tests/atomic85-managed-successor.test.mjs'].sort();
  return {schemaVersion: 1, profile: 'atomic85-626-managed-controller-inputs-v1', product: PRODUCT, hapi: PINS.hapi,
    physicalAcceptance: 'pending', oldWorkflowExceptions: exceptions, cycleInputsBoundByReviewedGitTree: cycles, files: files.map(member)};
}
async function admit(profile) {
  assert.equal(process.platform, 'linux'); assert.equal(process.arch, 'x64'); assert.equal(process.versions.bun, undefined);
  assert.equal(process.env.GITHUB_ACTIONS, 'true'); assert.equal(process.env.RUNNER_OS, 'Linux');
  assert.equal(realpathSync(process.env.GITHUB_WORKSPACE), realpathSync(root));
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const expected = expectedHead(process.env.GITHUB_EVENT_NAME, event, process.env.GITHUB_SHA);
  assert.equal(process.env.HYPERION_EXPECTED_HEAD, expected); assert.equal(git('rev-parse', 'HEAD'), expected, 'Actual PR head required');
  assert.equal(git('status', '--porcelain=v1', '--untracked-files=all'), '', 'Clean isolated current qualification checkout required');
  const reviewedHarness = {commit: expected, tree: git('rev-parse', 'HEAD^{tree}')};
  const binding = JSON.parse(readFileSync(new URL('./binding.json', import.meta.url))); assert.equal(binding.physicalAcceptance, 'pending');
  assert.deepEqual(observeController(), binding.observation, 'Current controller binding differs');
  const assembly = await verifyAssembly(hapiRoot, reviewedHarness);
  return {profile, reviewedHarness, assembly, workflowSha: process.env.GITHUB_WORKFLOW_SHA,
    runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT, job: process.env.GITHUB_JOB,
    runtime: {node: process.version, executable: process.execPath, sha256: sha(readFileSync(process.execPath))}};
}
export const admitOwnedController = () => admit(CI_PROFILE);
export const admitSchemaController = () => admit(SCHEMA_CI_PROFILE);
