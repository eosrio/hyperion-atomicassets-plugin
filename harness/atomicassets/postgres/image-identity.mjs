import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

export const PIN = Object.freeze(JSON.parse(readFileSync(new URL('./fixture-pin.json', import.meta.url))));
const manifestType = 'application/vnd.oci.image.manifest.v1+json';
const configType = 'application/vnd.oci.image.config.v1+json';
const digest = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const object = value => assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'Image identity object required');

export function verifyPinnedImageMetadata(
  manifestBytes = readFileSync(new URL('./postgres-16.15-linux-amd64.manifest.json', import.meta.url)),
  configBytes = readFileSync(new URL('./postgres-16.15-linux-amd64.config.json', import.meta.url))) {
  const inspection = PIN.registryInspection;
  assert.ok(Buffer.isBuffer(manifestBytes) && Buffer.isBuffer(configBytes));
  assert.equal(manifestBytes.length, inspection.manifestBytes); assert.equal(configBytes.length, inspection.configBytes);
  assert.equal(digest(manifestBytes), inspection.linuxAmd64ManifestDigest);
  assert.equal(digest(configBytes), inspection.configDigest);
  assert.equal(PIN.image, 'docker.io/library/postgres@' + inspection.linuxAmd64ManifestDigest);
  const manifest = JSON.parse(manifestBytes), config = JSON.parse(configBytes);
  assert.equal(manifest.schemaVersion, 2); assert.equal(manifest.mediaType, manifestType);
  assert.equal(manifest.config.mediaType, configType); assert.equal(manifest.config.digest, digest(configBytes));
  assert.equal(manifest.config.size, configBytes.length);
  assert.equal(config.os, 'linux'); assert.equal(config.architecture, 'amd64'); assert.equal(config.variant, undefined);
  assert.equal(PIN.platform, config.os + '/' + config.architecture);
  assert.ok(config.config.Env.includes('PG_VERSION=' + PIN.postgresVersion));
  return {manifestDigest: digest(manifestBytes), configDigest: digest(configBytes), manifestBytes: manifestBytes.length,
    configBytes: configBytes.length, platform: PIN.platform};
}

function descriptor(value, metadata) {
  object(value);
  assert.equal(value.mediaType, manifestType); assert.equal(value.digest, metadata.manifestDigest);
  assert.equal(value.size, metadata.manifestBytes);
  if (value.platform !== undefined) {
    object(value.platform); assert.equal(value.platform.os, 'linux'); assert.equal(value.platform.architecture, 'amd64');
    assert.ok(value.platform.variant === undefined || value.platform.variant === '');
  }
}

export function verifyImageDescriptor(value) {
  descriptor(value, verifyPinnedImageMetadata());
}

export function verifyImageIdentity(image) {
  object(image); const metadata = verifyPinnedImageMetadata();
  assert.equal(image.Os, 'linux'); assert.equal(image.Architecture, 'amd64');
  assert.ok(image.Variant === undefined || image.Variant === null || image.Variant === '');
  assert.ok(Array.isArray(image.RepoDigests) && image.RepoDigests.every(value => typeof value === 'string'));
  assert.ok(image.RepoDigests.some(value => [PIN.image, 'library/postgres@' + metadata.manifestDigest,
    'postgres@' + metadata.manifestDigest].includes(value)), 'Exact official repository digest required');
  const kind = image.Id === metadata.configDigest ? 'config' : image.Id === metadata.manifestDigest ? 'manifest' : null;
  assert.ok(kind, 'Exact linked config or platform-manifest image ID required');
  if (kind === 'manifest' || image.Descriptor !== undefined && image.Descriptor !== null) descriptor(image.Descriptor, metadata);
  return {id: image.Id, kind, ...metadata};
}
