// The actual HAPI registry owns execution; use its admitted SDK instance without transferring brands.
import assert from 'node:assert/strict';
import {readFileSync, realpathSync, lstatSync} from 'node:fs';
import {findPackageJSON} from 'node:module';
import {dirname, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PINS, PROFILE as FROZEN_PROFILE} from './contract.mjs';
import {sha} from './contract.mjs';
import {expectedAssembly} from './assembly.mjs';

export async function loadHostSdkPorts(hapiRoot, assembly) {
  assert.equal(assembly.profile, FROZEN_PROFILE); assert.deepEqual(assembly.pins, PINS);
  const registry = join(realpathSync(hapiRoot), 'build/indexer/projection/stateful-registry.js');
  const packagePath = findPackageJSON('@eosrio/hyperion-sdk', pathToFileURL(registry));
  assert.equal(realpathSync(packagePath), realpathSync(join(hapiRoot, 'node_modules/@eosrio/hyperion-sdk/package.json')),
    'The registry must resolve the admitted HAPI SDK root');
  assert(lstatSync(packagePath).isFile() && !lstatSync(packagePath).isSymbolicLink());
  const packageBytes = readFileSync(packagePath), pkg = JSON.parse(packageBytes), sdkRoot = dirname(packagePath);
  assert.equal(pkg.name, '@eosrio/hyperion-sdk');
  const expected = {profile: FROZEN_PROFILE, observation: expectedAssembly()};
  assert.equal(expected.profile, FROZEN_PROFILE); assert.deepEqual(expected.observation.pins, PINS);
  const rows = [];
  for (const name of ['projection-stateful-owner-v2', 'projection-stateful-source-v2']) {
    const exported = './dist/' + name + '.js'; assert.equal(pkg.exports['./' + name].import, exported);
    const path = join(sdkRoot, exported), wanted = expected.observation.dependencies.hapiSDK.find(row => row.path === name + '.js');
    assert(wanted, 'Selected HAPI SDK port must belong to the frozen admitted inventory');
    assert(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink());
    assert.equal(realpathSync(path), path); const bytes = readFileSync(path);
    assert.equal(bytes.length, wanted.bytes); assert.equal(sha(bytes), wanted.sha256);
    rows.push({name, path, bytes: bytes.length, sha256: sha(bytes)});
  }
  const [owner, source] = await Promise.all(rows.map(row => import(pathToFileURL(row.path))));
  for (const name of ['captureStatefulRawTargetV2', 'executeStatefulOwnerBlockV2']) assert.equal(typeof owner[name], 'function');
  assert.equal(typeof source.captureStatefulSourceV2, 'function');
  return {owner, captureStatefulSourceV2: source.captureStatefulSourceV2,
    receipt: {sdkCommit: PINS.sdk, registry, packagePath, packageSha256: sha(packageBytes), ports: rows}};
}
