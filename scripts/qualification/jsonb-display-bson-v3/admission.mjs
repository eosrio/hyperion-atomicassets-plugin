// New controller binding. The frozen d192 workload/profile is never recaptured here.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, lstatSync, realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CI_PROFILE, HARNESS_BASE, V2_BASE, HAPI, expectedHead, sha} from './contract.mjs';
import {verifyAssembly} from '../jsonb-display-mongo-http/assembly.mjs';
export const root = fileURLToPath(new URL('../../../', import.meta.url));
export const hapiRoot = join(root, 'out/jsonb-display-inputs/hapi');
const git = (...args) => execFileSync('git', ['-c', 'core.autocrlf=false', ...args], {cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024}).trim();
const namespace = 'scripts/qualification/jsonb-display-bson-v3';
function member(path) {const raw = readFileSync(join(root, path)); return {path, bytes: raw.length, sha256: sha(raw)};}
export function observeController() {
  const frozen = git('ls-tree', '-r', '--name-only', HARNESS_BASE, '--', 'scripts/qualification/jsonb-display-mongo-http', 'tests/jsonb-display-mongo-http.test.mjs').split('\n').filter(Boolean);
  assert.equal(frozen.length, 9);
  for (const path of frozen) assert.equal(sha(readFileSync(join(root, path))), sha(execFileSync('git', ['show', HARNESS_BASE + ':' + path], {cwd: root})), 'Frozen d192 input changed: ' + path);
  const prior = git('ls-tree', '-r', '--name-only', V2_BASE, '--', 'scripts/qualification/jsonb-display-mongo-http-ci', 'tests/jsonb-display-owned-ci.test.mjs').split('\n').filter(Boolean);
  assert.equal(prior.length, 17);
  for (const path of prior) assert.equal(sha(readFileSync(join(root, path))), sha(execFileSync('git', ['show', V2_BASE + ':' + path], {cwd: root})), 'Frozen v2 input changed: ' + path);
  const oldWorkflow = '.github/workflows/jsonb-display-mongo-http.yml';
  const before = execFileSync('git', ['show', V2_BASE + ':' + oldWorkflow], {cwd: root, encoding: 'utf8'});
  const start = before.indexOf('  pull_request:\n'), end = before.indexOf('permissions:\n', start);
  assert(start > 0 && end > start);
  const retired = before.slice(0, start) + before.slice(end), currentWorkflow = readFileSync(join(root, oldWorkflow), 'utf8');
  assert.equal(currentWorkflow, retired, 'Only the old automatic PR trigger may be retired');
  const jobs = before.slice(before.indexOf('jobs:\n'));
  assert.equal(currentWorkflow.slice(currentWorkflow.indexOf('jobs:\n')), jobs);
  const cycles = [namespace + '/admission.mjs', namespace + '/binding.json'];
  const current = readdirSync(join(root, namespace)).map(name => namespace + '/' + name).filter(path => !cycles.includes(path));
  for (const path of current) assert(lstatSync(join(root, path)).isFile() && !lstatSync(join(root, path)).isSymbolicLink());
  const files = [...frozen, ...prior, ...current, oldWorkflow, '.github/workflows/jsonb-display-bson-v3.yml', 'tests/owned-bson-display-v3.test.mjs'].sort();
  return {schemaVersion: 1, profile: CI_PROFILE, frozenBase: HARNESS_BASE, frozenV2Base: V2_BASE, hapi: HAPI,
    oldWorkflowException: {path: oldWorkflow, change: 'retire-only-automatic-pull-request-trigger', originalSha256: sha(before), currentSha256: sha(currentWorkflow), unchangedJobsSha256: sha(jobs)},
    cycleInputsBoundByReviewedGitTree: cycles, files: files.map(member)};
}
export async function admitController() {
  assert.equal(process.platform, 'linux'); assert.equal(process.arch, 'x64'); assert.equal(process.versions.bun, undefined);
  assert.equal(process.env.GITHUB_ACTIONS, 'true'); assert.equal(process.env.RUNNER_OS, 'Linux');
  assert.equal(realpathSync(process.env.GITHUB_WORKSPACE), realpathSync(root));
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const expected = expectedHead(process.env.GITHUB_EVENT_NAME, event, process.env.GITHUB_SHA);
  assert.equal(process.env.HYPERION_EXPECTED_HEAD, expected); assert.equal(git('rev-parse', 'HEAD'), expected, 'Checkout must be the actual PR head, not the GitHub merge ref');
  assert.equal(git('status', '--porcelain=v1', '--untracked-files=all'), '', 'Clean isolated controller checkout required');
  const reviewedHarness = {commit: expected, tree: git('rev-parse', 'HEAD^{tree}')};
  const binding = JSON.parse(readFileSync(new URL('./binding.json', import.meta.url)));
  assert.deepEqual(observeController(), binding.observation, 'Controller source binding differs');
  const assembly = await verifyAssembly(hapiRoot, reviewedHarness);
  return {profile: CI_PROFILE, reviewedHarness, assembly, workflowSha: process.env.GITHUB_WORKFLOW_SHA,
    runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT, job: process.env.GITHUB_JOB,
    runtime: {node: process.version, executable: process.execPath, sha256: sha(readFileSync(process.execPath))}};
}
