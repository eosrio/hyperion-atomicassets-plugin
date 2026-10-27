import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync, realpathSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const HOST_PINS = JSON.parse(readFileSync(new URL('./host-pins.json', import.meta.url), 'utf8'));
export function engineeringHost(directory) {
  assert.ok(directory, 'Supply the explicitly pinned HAPI engineering checkout');
  assert.equal(process.release.name, 'node'); assert.ok([24, 26].includes(Number(process.versions.node.split('.')[0])));
  assert.equal(process.versions.bun, undefined);
  const root = realpathSync(directory);
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', timeout: 10_000}).trim();
  assert.equal(git('rev-parse', 'HEAD'), HOST_PINS.head);
  assert.equal(git('rev-parse', 'HEAD^{tree}'), HOST_PINS.tree);
  assert.equal(git('status', '--porcelain=v1', '--untracked-files=no'), '');
  for (const entry of HOST_PINS.emittedJavaScript) {
    const bytes = readFileSync(join(root, entry.path)); assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.path);
  }
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies['@eosrio/hyperion-sdk'].split('#')[1], HOST_PINS.sdk);
  assert.equal(pkg.dependencies['@eosrio/hyperion-wire-plugin'].split('#')[1], HOST_PINS.wire);
  const installedProof = execFileSync(process.execPath, [join(root, 'tests/unit/protocol-native-installed.mjs')],
    {cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024}).trim();
  assert.equal(installedProof, 'installed-wire-native-passed');
  return {root, pins: HOST_PINS, installedProof, load: relative => import(pathToFileURL(join(root, relative)).href)};
}
