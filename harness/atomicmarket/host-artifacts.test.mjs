import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import {createHash} from 'node:crypto';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {basename, dirname, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {gunzipSync} from 'node:zlib';
import {engineeringHost, HOST_PINS, verifyHostArtifacts} from './contextual-host.mjs';

const host = engineeringHost(process.env.HAPI_CONTEXTUAL_ROOT);
const fixture = JSON.parse(readFileSync(new URL('../../fixtures/harness/atomicmarket/host-artifact-variants.json', import.meta.url), 'utf8'));
const directories = [];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function variantBytes(vector, profile) {
  const windows = gunzipSync(Buffer.from(vector.windowsGzipBase64, 'base64'), {maxOutputLength: 128 * 1024});
  assert.equal(windows.length, vector.windows.bytes); assert.equal(sha(windows), vector.windows.sha256);
  // This constructs only the six independently measured fixture inputs; the verifier never normalizes bytes.
  const linux = Buffer.from(windows.toString('utf8').replaceAll('\r\n', '\n'));
  assert.equal(linux.length, vector.linux.bytes); assert.equal(sha(linux), vector.linux.sha256);
  return profile === 'windows' ? windows : linux;
}
function artifacts(profile) {
  const root = mkdtempSync(join(tmpdir(), 'market-host-artifacts-')); directories.push(root);
  for (const entry of HOST_PINS.emittedJavaScript) {
    const target = join(root, entry.path); mkdirSync(dirname(target), {recursive: true});
    copyFileSync(join(host.root, entry.path), target);
  }
  for (const vector of fixture.vectors) writeFileSync(join(root, vector.path), variantBytes(vector, profile));
  return root;
}
after(() => {
  for (const directory of directories) {
    assert.equal(resolve(dirname(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('market-host-artifacts-'));
    rmSync(directory, {recursive: true, force: true});
  }
});

test('the complete independently measured Linux artifact profile is accepted with all273 files', () => {
  assert.equal(fixture.vectors.length, 6);
  assert.equal(verifyHostArtifacts(artifacts('linux')), 'linux-observed');
});

test('the complete frozen Windows artifact profile is still accepted', () => {
  assert.equal(verifyHostArtifacts(artifacts('windows')), 'windows-observed');
});

test('missing, mutated and mixed artifacts cannot inherit either complete profile', () => {
  const variants = new Set(fixture.vectors.map(vector => vector.path));
  const common = HOST_PINS.emittedJavaScript.find(entry => !variants.has(entry.path)).path;
  for (const [profile, path] of [['windows', fixture.vectors[0].path], ['linux', common]]) {
    const root = artifacts(profile), file = join(root, path), bytes = readFileSync(file);
    bytes[Math.floor(bytes.length / 2)] ^= 1; writeFileSync(file, bytes);
    assert.throws(() => verifyHostArtifacts(root), /complete coherent observed artifact profile/);
  }
  const missing = artifacts('linux'); rmSync(join(missing, common));
  assert.throws(() => verifyHostArtifacts(missing), error => error.code === 'ENOENT');
  const mixed = artifacts('linux');
  writeFileSync(join(mixed, fixture.vectors[0].path), variantBytes(fixture.vectors[0], 'windows'));
  assert.throws(() => verifyHostArtifacts(mixed), /complete coherent observed artifact profile/);
});
