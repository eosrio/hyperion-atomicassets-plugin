import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync, realpathSync, lstatSync, mkdirSync, writeFileSync, existsSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {createRequire} from 'node:module';
export const COMMIT = '0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e';
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function originalSource(root) {
  root = realpathSync(root);
  assert.equal(existsSync(join(root, 'config/connections.config.json')), false, 'Reference must contain no operator connection fallback');
  const git = (...args) => execFileSync('git', args, {cwd: root, env: {...process.env, GIT_OPTIONAL_LOCKS: '0'}, timeout: 10000, maxBuffer: 2 * 1024**2});
  assert.equal(git('rev-parse', 'HEAD').toString().trim(), COMMIT);
  assert.equal(git('rev-parse', 'refs/tags/2.7.0').toString().trim(), COMMIT);
  assert.equal(git('status', '--porcelain=v1', '--untracked-files=no').toString(), '');
  const fromReference = createRequire(join(root, 'package.json'));
  assert.equal(fromReference('./package.json').version, '2.7.0');
  assert.equal(fromReference('./package.json').packageManager, 'pnpm@11.13.1');
  assert.equal(fromReference('@atomichub/atomicassets/package.json').version, '2.2.0');
  assert.equal(JSON.parse(readFileSync(join(root, 'node_modules/@swc-node/register/package.json'))).version, '1.12.1');
  const provenance = JSON.parse(readFileSync(new URL('../../../fixtures/harness/atomicassets/lifecycle/provenance.json', import.meta.url)));
  const codecPath = fromReference.resolve('@atomichub/atomicassets');
  for (const row of provenance.codec.files) {
    const actual = row.path === 'build/index.cjs' ? codecPath : join(codecPath, '../../', row.path);
    assert.equal(sha(readFileSync(actual)), row.sha256, 'Locked codec bytes: ' + row.path);
  }
  const inventory = JSON.parse(readFileSync(new URL('../../../docs/parity/atomicassets/postgres-oracle-sources.json', import.meta.url))).originalSources;
  const tracked = new Map(git('ls-tree', '-r', COMMIT).toString().trim().split('\n').map(line => {
    const [meta, path] = line.split('\t'); return [path, meta.split(' ')[2]];
  }));
  const observed = inventory.map(row => {
    assert.equal(tracked.get(row.path), row.blob); const data = git('cat-file', 'blob', row.blob);
    assert.equal(data.length, row.bytes); assert.equal(sha(data), row.sha256);
    const path = join(root, row.path); assert.equal(lstatSync(path).isSymbolicLink(), false);
    const working = readFileSync(path), digest = sha(working);
    assert.ok([row.sha256, row.observedWindowsWorkingSha256].includes(digest), row.path);
    return {path: row.path, gitSha256: row.sha256, workingBytes: working.length, workingSha256: digest};
  });
  const definitions = observed.filter(row => row.path.startsWith('definitions/'));
  assert.equal(definitions.length, 176);
  return {root, fromReference, observed, definitions, commit: COMMIT,
    lockSha256: sha(git('show', COMMIT + ':pnpm-lock.yaml')),
    actualWorkingLockSha256: sha(readFileSync(join(root, 'pnpm-lock.yaml')))};
}
export function copyDefinitions(reference, destination) {
  const directory = join(destination, 'definitions'); mkdirSync(directory);
  for (const row of reference.definitions) {
    const data = readFileSync(join(reference.root, row.path)); assert.equal(sha(data), row.workingSha256);
    const path = join(destination, row.path); mkdirSync(dirname(path), {recursive: true}); writeFileSync(path, data, {flag: 'wx'});
  }
}
