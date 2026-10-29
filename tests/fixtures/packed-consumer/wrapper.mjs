import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat, readFile, realpath, writeFile} from 'node:fs/promises';
import {createRequire, findPackageJSON} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Invoked only against check-package's disposable, normally installed wrapper.
const [wrapper, output] = process.argv.slice(2);
assert.ok(wrapper && output);
const name = '@eosrio/hyperion-atomicassets-plugin';
const metadata = join(wrapper, 'package.json'), entry = join(wrapper, 'build/index.js');
const installed = join(wrapper, 'node_modules', name);
assert.equal((await lstat(installed)).isSymbolicLink(), false);
assert.equal(await realpath(findPackageJSON(name, pathToFileURL(metadata))),
  await realpath(join(installed, 'package.json')));
const pkg = JSON.parse(await readFile(join(installed, 'package.json')));
const distributed = JSON.parse(await readFile(join(installed, 'legacy/package.json')));
const manifestBytes = await readFile(metadata), manifest = JSON.parse(manifestBytes);
assert.equal(distributed.name, '@eosrio/hyperion-atomicassets-plugin-legacy');
assert.equal(distributed.version, pkg.version);
assert.deepEqual(distributed.dependencies, {[name]: pkg.version});
assert.deepEqual({...manifest, dependencies: distributed.dependencies}, distributed);
assert.match(manifest.dependencies[name], /^file:/, 'npm must record the same reviewed tarball');
assert.deepEqual(await readFile(entry), await readFile(join(installed, 'legacy/build/index.js')));

const {default: Plugin} = await import(pathToFileURL(entry));
const {default: Direct} = await import(pathToFileURL(join(installed, 'dist/index.js')));
assert.equal(Plugin, Direct, 'Existing loader must delegate to its actual installed package');
const value = {depth:16,nodes:256,fields:32,arrayElements:32,stringBytes:1024,recordBytes:4096,integerFields:4,pathSegments:8};
const limits = {value,envelope:{...value,depth:32,nodes:8192,fields:64,arrayElements:128,stringBytes:262144,recordBytes:262144},
  selectors:128,recordKinds:16,inputOccurrences:64,inputBytes:262144,keyBytes:128,readKeys:8,readAttempts:32,mutations:16,
  candidateBytes:262144,responseRecords:32,responseBytes:262144};
const plugin = new Plugin({limits}), descriptor = plugin.getStatefulProjectionsV2({binding:{}});
assert.equal(descriptor.interfaceVersion, 2);
assert.equal(descriptor.sourceInputVersion, 2);
assert.equal(descriptor.projections.length, 1);
assert.equal(typeof descriptor.projections[0].reduce, 'function');
const require = createRequire(pathToFileURL(metadata));
const {default: Fastify} = await import(pathToFileURL(require.resolve('fastify')));
const api = Fastify(), requests = [];
try {
  plugin.addRoutes(api, {statefulQueryHost(request) {
    requests.push(request.url);
    return {async compose(id, read) {
      assert.equal(id, descriptor.projections[0].definition.id);
      return {value:await read({async get() {return {status:'covered-absent'};}})};
    }};
  }});
  for (const url of ['/atomicassets/v1/assets/1','/atomicmarket/v1/sales/1'])
    assert.equal((await api.inject(url)).statusCode, 416);
  assert.equal(requests.length, 2);
} finally {await api.close();}

let inventory = {status:'not-run', reason:'ATOMIC_HOST_INVENTORY_ROOT not selected'};
if (process.env.ATOMIC_HOST_INVENTORY_ROOT) {
  const host = process.env.ATOMIC_HOST_INVENTORY_ROOT;
  const pins = JSON.parse(await readFile(new URL('./host-inventory-c871.json', import.meta.url)));
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  for (const file of pins.files) {
    const actual = await readFile(join(host, file.path));
    assert.equal(actual.length, file.bytes, file.path);
    assert.equal(hash(actual), file.sha256, 'Host emission drift: ' + file.path);
  }
  const {statefulHookInventory} = await import(pathToFileURL(join(host, 'indexer/projection/stateful-inventory.js')));
  const baseline = await statefulHookInventory(entry);
  const code = join(installed, 'dist/atomicmarket/internal/relationships.js'), original = await readFile(code);
  let changed, omitted, omittedChanged;
  try {
    await writeFile(code, Buffer.concat([original, Buffer.from('\n// Owned inventory mutation control.\n')]));
    changed = await statefulHookInventory(entry);
    assert.notEqual(changed, baseline, 'Actual imported domain code must affect wrapper inventory');
    await writeFile(code, original);
    await writeFile(metadata, JSON.stringify({...manifest, dependencies:{}}));
    omitted = await statefulHookInventory(entry);
    await writeFile(code, Buffer.concat([original, Buffer.from('\n// Owned inventory mutation control.\n')]));
    omittedChanged = await statefulHookInventory(entry);
    assert.equal(omitted, omittedChanged, 'Undeclared imported code reproduces the old omission');
    await writeFile(metadata, JSON.stringify({type:'module'}));
    await assert.rejects(statefulHookInventory(entry), /identity is incomplete/);
  } finally {
    await writeFile(code, original);
    await writeFile(metadata, manifestBytes);
  }
  assert.equal(await statefulHookInventory(entry), baseline);
  inventory = {status:'passed', ...pins, baseline, changed, omitted, omittedChanged,
    actualCodeMutationDetected:true, undeclaredDependencyNegative:true, missingIdentityRefused:true, restoredExactly:true};
}
const result = {nodeVersion:process.version, wrapper, installed, metadata:manifest,
  actualInstalledImport:true, compoundDescriptorRegistered:true, idRoutesRegistered:requests,
  inventory, scope:'Installed wrapper/code identity only; no worker, serving authority, physical engine or parity acceptance'};
await writeFile(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
