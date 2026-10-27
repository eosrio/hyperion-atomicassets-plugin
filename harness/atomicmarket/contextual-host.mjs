import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync, realpathSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const HOST_PINS = JSON.parse(readFileSync(new URL('./host-pins.json', import.meta.url), 'utf8'));
export function verifyHostArtifacts(root) {
  const base = new Map(HOST_PINS.emittedJavaScript.map(entry => [entry.path, entry]));
  assert.equal(HOST_PINS.artifactCount, 273); assert.equal(base.size, 273);
  assert.equal(HOST_PINS.emittedJavaScript.length, 273);
  const actual = new Map();
  for (const entry of HOST_PINS.emittedJavaScript) {
    const bytes = readFileSync(join(root, entry.path));
    actual.set(entry.path, {bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')});
  }
  assert.equal(HOST_PINS.observedProfiles.length, 2);
  assert.equal(new Set(HOST_PINS.observedProfiles.map(profile => profile.id)).size, 2);
  const matches = HOST_PINS.observedProfiles.filter(profile => {
    const expected = new Map(base);
    assert.equal(new Set(profile.overrides.map(entry => entry.path)).size, profile.overrides.length);
    for (const entry of profile.overrides) {assert.ok(base.has(entry.path)); expected.set(entry.path, entry);}
    assert.equal(expected.size, 273);
    return [...expected].every(([path, entry]) => actual.get(path).bytes === entry.bytes && actual.get(path).sha256 === entry.sha256);
  });
  assert.equal(matches.length, 1, 'HAPI emissions must match one complete coherent observed artifact profile');
  return matches[0].id;
}
export function engineeringHost(directory) {
  assert.ok(directory, 'Supply the explicitly pinned HAPI engineering checkout');
  assert.equal(process.release.name, 'node'); assert.ok([24, 26].includes(Number(process.versions.node.split('.')[0])));
  assert.equal(process.versions.bun, undefined);
  const root = realpathSync(directory);
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', timeout: 10_000}).trim();
  assert.equal(git('rev-parse', 'HEAD'), HOST_PINS.head);
  assert.equal(git('rev-parse', 'HEAD^{tree}'), HOST_PINS.tree);
  assert.equal(git('status', '--porcelain=v1', '--untracked-files=no'), '');
  const artifactProfile = verifyHostArtifacts(root);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies['@eosrio/hyperion-sdk'].split('#')[1], HOST_PINS.sdk);
  assert.equal(pkg.dependencies['@eosrio/hyperion-wire-plugin'].split('#')[1], HOST_PINS.wire);
  const installedProof = execFileSync(process.execPath, [join(root, 'tests/unit/protocol-native-installed.mjs')],
    {cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024}).trim();
  assert.equal(installedProof, 'installed-wire-native-passed');
  return {root, pins: HOST_PINS, artifactProfile, installedProof, load: relative => import(pathToFileURL(join(root, relative)).href)};
}
