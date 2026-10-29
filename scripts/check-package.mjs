import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, lstatSync} from 'node:fs';
import {copyFile, cp, mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {delimiter, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const name = '@eosrio/hyperion-atomicassets-plugin';
const sdkPin = 'git+https://github.com/eosrio/hyperion-sdk.git#ffb368bbcfbeb0821a85e5a38dfe3b18ca402473';
const npmCli = process.env.npm_execpath ?? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
assert.ok(existsSync(npmCli), 'Run through npm so its actual CLI path is available');
await mkdir(join(root, 'out'), {recursive: true});
const evidence = await mkdtemp(join(root, 'out', 'package-consumer-'));
const consumer = join(evidence, 'consumer');
await mkdir(consumer);
const env = {...process.env, PATH: dirname(process.execPath) + delimiter + process.env.PATH};
delete env.NODE_OPTIONS;
delete env.NODE_PATH;
const commands = [];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function run(args, cwd, label, commandEnv = env) {
  const result = spawnSync(process.execPath, args, {cwd, env: commandEnv, encoding: 'utf8', timeout: 90000,
    windowsHide: true, maxBuffer: 8 * 1024 * 1024});
  const stdout = result.stdout ?? '', stderr = result.stderr ?? '';
  const receipt = {command: [process.execPath, ...args], cwd, exitCode: result.status,
    signal: result.signal, stdoutSha256: sha(stdout), stderrSha256: sha(stderr)};
  commands.push(receipt);
  return Promise.all([writeFile(join(evidence, label + '.stdout'), stdout), writeFile(join(evidence, label + '.stderr'), stderr)])
    .then(() => {
      if (result.error || result.status !== 0) throw new Error(`${label} failed: ${result.error ?? stderr}\n${stdout}`);
      return stdout;
    });
}
function parsePackOutput(text) {
  const value = JSON.parse(text);
  const packages = Array.isArray(value) ? value : Object.values(value);
  assert.equal(packages.length, 1, 'npm pack must produce exactly one package');
  assert.equal(packages[0].name, name);
  assert.equal(typeof packages[0].filename, 'string');
  assert.ok(Array.isArray(packages[0].files));
  return packages[0];
}

try {
  const packed = parsePackOutput(await run([npmCli, 'pack', '--json', '--pack-destination', evidence], root, 'pack'));
  assert.equal(packed.name, name);
  const packedFiles = new Set(packed.files.map(file => file.path));
  const required = ['dist/index.js', 'dist/index.d.ts', 'dist/stateful/plugin.js', 'dist/stateful/plugin.d.ts',
    'dist/stateful/metadata-codec.js', 'dist/stateful/hook-inventory.js', 'legacy/build/index.js', 'legacy/package.json',
    'dist/atomicmarket/internal/relationships.js', 'dist/atomicmarket/internal/relationships.d.ts',
    'dist/atomicmarket/internal/auctions.js', 'dist/atomicmarket/internal/auctions.d.ts',
    'dist/atomicmarket/internal/auction-assets.js', 'dist/atomicmarket/internal/auction-assets.d.ts',
    'dist/atomicmarket/internal/marketplace-state.js', 'dist/atomicmarket/internal/marketplace-state.d.ts',
    'vendor/atomicassets-2.2.0/build/index.cjs', 'vendor/atomicassets-2.2.0/LICENSE',
    'vendor/atomicassets-2.2.0/NOTICE', 'vendor/atomicassets-2.2.0/licenses/Apache-2.0.txt',
    'dist/http/id-routes.js', 'dist/http/id-routes.d.ts', 'dist/atomicmarket/marketplace.js', 'dist/atomicmarket/marketplace.d.ts',
    'dist/atomicmarket/sale.js', 'dist/atomicmarket/sale.d.ts',
    'dist/atomicmarket/marketplace-indexing.js', 'dist/atomicmarket/marketplace-indexing.d.ts',
    'dist/atomicassets/asset.js', 'dist/atomicassets/asset.d.ts',
    'dist/atomicassets/internal/lifecycle.js', 'dist/atomicassets/internal/lifecycle.d.ts',
    'dist/atomicassets/internal/templates.js', 'dist/atomicassets/internal/templates.d.ts',
    'dist/atomicassets/internal/collections.js', 'dist/atomicassets/internal/collections.d.ts',
    'dist/atomicassets/internal/lifecycle-port.js', 'dist/atomicassets/internal/lifecycle-port.d.ts',
    'dist/atomicmarket/internal/fixed-sale.js', 'dist/atomicmarket/internal/fixed-sale.d.ts',
    'dist/atomicmarket/internal/fixed-sale-port.js', 'dist/atomicmarket/internal/fixed-sale-port.d.ts',
    'dist/atomicmarket/internal/sale-assets.js', 'dist/atomicmarket/internal/sale-assets.d.ts',
    'README.md', 'LICENSE', 'harness/shared/LICENSE.atomicassets-api.txt',
    'harness/shared/NOTICE.atomicassets-api.txt', 'docs/parity/atomicmarket/UPSTREAM-LICENSE'];
  for (const path of required) assert.ok(packedFiles.has(path), `Packed artifact is missing ${path}`);
  const tarball = join(evidence, packed.filename);
  const tarballBytes = await readFile(tarball);
  await writeFile(join(consumer, 'package.json'), JSON.stringify({name: 'atomic-parity-packed-consumer',
    private: true, type: 'module', dependencies: {[name]: 'file:' + tarball}, devDependencies: {typescript: '7.0.2', fastify: '5.12.7', '@types/node': '25.5.0'},
    allowScripts: {'github:eosrio/hyperion-sdk#ffb368bbcfbeb0821a85e5a38dfe3b18ca402473': true}}, null, 2) + '\n');
  for (const file of ['consume.mjs', 'consume.ts', 'tsconfig.json'])
    await copyFile(join(root, 'tests/fixtures/packed-consumer', file), join(consumer, file));
  for (const file of ['asset-formatter-cases.mjs', 'asset-formatter.expected.json',
    'sale-formatter-cases.mjs', 'sale-formatter.expected.json'])
    await copyFile(join(root, 'tests/fixtures', file), join(consumer, file));
  await copyFile(join(root, 'fixtures/harness/atomicassets/single-asset.input.json'), join(consumer, 'single-asset.input.json'));
  await copyFile(join(root, 'fixtures/harness/atomicmarket/single-sale.input.json'), join(consumer, 'single-sale.input.json'));
  await run([npmCli, 'install', '--package-lock-only', '--allow-git=all'], consumer, 'consumer-lock');
  await run([npmCli, 'ci', '--allow-git=all'], consumer, 'consumer-install');
  const installed = join(consumer, 'node_modules', name);
  assert.equal(lstatSync(installed).isSymbolicLink(), false, 'Consumer must install the tarball, not link source');
  const installedPackage = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  assert.deepEqual(installedPackage.exports, JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).exports,
    'Installed tarball must retain the declared public exports');
  assert.deepEqual(installedPackage.dependencies, JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).dependencies);
  // Reproduce the documented existing-loader layout from this same real tarball.
  const wrapper = join(evidence, 'plugins/atomicassets');
  await mkdir(join(wrapper, 'build'), {recursive: true});
  for (const path of ['package.json', 'build/index.js'])
    await copyFile(join(installed, 'legacy', path), join(wrapper, path));
  await run([npmCli, 'install', '--package-lock-only', '--save-exact', '--allow-git=all', tarball], wrapper, 'wrapper-lock');
  await run([npmCli, 'ci', '--allow-git=all'], wrapper, 'wrapper-install');
  await run([join(root, 'tests/fixtures/packed-consumer/wrapper.mjs'), wrapper, join(evidence, 'wrapper-result.json')],
    root, 'wrapper-runtime');
  // Qualification host stays outside the distributed package. Its exact source
  // can also run against actual tarball emissions without changing SDK pins.
  const stateful = join(evidence, 'stateful-packed');
  await mkdir(join(stateful, 'harness/stateful'), {recursive: true});
  await writeFile(join(stateful, 'package.json'), '{"type":"module"}\n');
  await cp(join(installed, 'dist'), join(stateful, 'dist'), {recursive: true});
  await copyFile(join(root, 'harness/stateful/bridge.mjs'), join(stateful, 'harness/stateful/bridge.mjs'));
  await run(['--test', 'tests/atomic-stateful-bridge.test.mjs'], root, 'stateful-packed-caller',
    {...env, ATOMIC_STATEFUL_BRIDGE_MODULE: join(stateful, 'harness/stateful/bridge.mjs')});
  assert.equal(installedPackage.exports['./atomicmarket/marketplace'].import, './dist/atomicmarket/marketplace.js');
  assert.equal(installedPackage.exports['./atomicmarket/marketplace'].types, './dist/atomicmarket/marketplace.d.ts');
  assert.equal(installedPackage.exports['./atomicmarket/marketplace-indexing'].import, './dist/atomicmarket/marketplace-indexing.js');
  assert.equal(installedPackage.exports['./atomicmarket/marketplace-indexing'].types, './dist/atomicmarket/marketplace-indexing.d.ts');
  assert.equal(installedPackage.exports['./atomicassets/asset'].import, './dist/atomicassets/asset.js');
  assert.equal(installedPackage.exports['./atomicassets/asset'].types, './dist/atomicassets/asset.d.ts');
  assert.equal(installedPackage.exports['./atomicmarket/sale'].import, './dist/atomicmarket/sale.js');
  assert.equal(installedPackage.exports['./atomicmarket/sale'].types, './dist/atomicmarket/sale.d.ts');
  for (const path of required) assert.equal(sha(await readFile(join(installed, path))), sha(await readFile(join(root, path))), path);
  const runtime = await run([join(consumer, 'consume.mjs')], consumer, 'consumer-runtime');
  // Explicit private-file control; this is not a newly supported package subpath.
  await run(['--test', join(root, 'tests/asset-lifecycle.test.mjs')], root, 'consumer-internal-domain',
    {...env, AA_DOMAIN_MODULE_ROOT: join(installed, 'dist')});
  await run(['--test', join(root, 'tests/fixed-sale-lifecycle.test.mjs')], root, 'consumer-fixed-sale',
    {...env, AM_DOMAIN_MODULE_ROOT: join(installed, 'dist')});
  await run(['--test', join(root, 'tests/sale-nested-assets.test.mjs')], root, 'consumer-sale-assets',
    {...env, AM_DOMAIN_MODULE_ROOT: join(installed, 'dist')});
  await run(['--test', join(root, 'tests/relationships.test.mjs')], root, 'consumer-source-relationships',
    {...env, ATOMIC_PLUGIN_DIST_ROOT: join(installed, 'dist')});
  await run(['--test', join(root, 'tests/templates.test.mjs')], root, 'consumer-template-lifecycle',
    {...env, AA_DOMAIN_MODULE_ROOT: join(installed, 'dist'), ATOMIC_PLUGIN_DIST_ROOT: join(installed, 'dist')});
  await run(['--test', join(root, 'tests/auctions.test.mjs')], root, 'consumer-auctions',
    {...env, ATOMIC_PLUGIN_DIST_ROOT: join(installed, 'dist')});
  await run(['--test', join(root, 'tests/collections.test.mjs')], root, 'consumer-collections',
    {...env, ATOMIC_PLUGIN_DIST_ROOT: join(installed, 'dist')});
  await run(['--test', join(root, 'tests/json-compatibility.test.mjs')], root, 'consumer-original-metadata-json',
    {...env, AA_DOMAIN_MODULE_ROOT: join(installed, 'dist'), ATOMIC_PLUGIN_DIST_ROOT: join(installed, 'dist')});
  await run(['--test', join(root, 'tests/marketplace-id.test.mjs')], root, 'consumer-marketplace-id',
    {...env, ATOMIC_PLUGIN_DIST_ROOT: join(installed, 'dist')});
  const declarations = await run([join(consumer, 'node_modules/typescript/bin/tsc'), '-p',
    join(consumer, 'tsconfig.json'), '--listFiles'], consumer, 'consumer-declarations');
  const slash = value => value.replaceAll('\\', '/').toLowerCase();
  assert.ok(slash(declarations).includes(slash(join(installed, 'dist/atomicmarket/marketplace.d.ts'))),
    'Consumer must resolve the installed packed declaration');
  assert.ok(slash(declarations).includes(slash(join(installed, 'dist/atomicmarket/marketplace-indexing.d.ts'))),
    'Consumer must resolve the installed contextual factory declaration');
  assert.ok(slash(declarations).includes(slash(join(installed, 'dist/atomicassets/asset.d.ts'))),
    'Consumer must resolve the installed packed asset declaration');
  assert.ok(slash(declarations).includes(slash(join(installed, 'dist/atomicassets/internal/collections.d.ts'))),
    'Private collection declaration control must use the installed file');
  assert.ok(slash(declarations).includes(slash(join(installed, 'dist/atomicmarket/internal/marketplace-state.d.ts'))),
    'Private marketplace declaration control must use the installed file');
  assert.ok(slash(declarations).includes(slash(join(installed, 'dist/atomicmarket/sale.d.ts'))),
    'Consumer must resolve the installed packed sale declaration');
  assert.ok(slash(declarations).includes(slash(join(installed, 'dist/atomicmarket/internal/fixed-sale-port.d.ts'))),
    'Private declaration control must use the installed file');
  assert.ok(slash(declarations).includes(slash(join(installed, 'dist/atomicmarket/internal/sale-assets.d.ts'))),
    'Private nested sale declaration must use the installed file');
  assert.ok(slash(declarations).includes(slash(join(consumer, 'node_modules/@eosrio/hyperion-sdk/dist/projection.d.ts'))),
    'Consumer must resolve its installed SDK declarations');
  const lockBytes = await readFile(join(consumer, 'package-lock.json'));
  const lock = JSON.parse(lockBytes);
  const sdkResolved = lock.packages['node_modules/@eosrio/hyperion-sdk'].resolved;
  // npm may canonicalize a GitHub dependency to SSH; repository and commit stay exact.
  assert.ok(new Set([sdkPin, sdkPin.replace('git+https://github.com/', 'git+ssh://git@github.com/')]).has(sdkResolved),
    'Consumer SDK repository and exact commit must match');
  const result = {nodeVersion: process.version, package: name, packedFiles: [...packedFiles].sort(),
    tarball: {path: tarball, bytes: tarballBytes.length, sha256: sha(tarballBytes), integrity: packed.integrity},
    installedFromTarball: true, runtimeImport: JSON.parse(runtime), declarationConsumerExit: 0,
    installedWrapper: JSON.parse(await readFile(join(evidence, 'wrapper-result.json'))),
    internalDomainRegression: true, internalDomainPublicExport: false,
    internalFixedSaleRegression: true, internalFixedSalePublicExport: false,
    internalSaleAssetsRegression: true, internalSaleAssetsPublicExport: false,
    inputDrivenRelationshipsPackedRegression: true, physicalRelationshipParity: false,
    inputDrivenTemplatePackedRegression: true, physicalTemplateParity: false,
    inputDrivenAuctionPackedRegression: true, physicalAuctionParity: false,
    inputDrivenCollectionPackedRegression: true, physicalCollectionParity: false,
    originalMetadataEncoderPackedRegression: true, physicalJsonCompatibility: false,
    inputDrivenMarketplaceIdPackedRegression: true, physicalMarketplaceParity: false,
    statefulPackedCaller: {optInComponentSelected: Boolean(env.ATOMIC_STATEFUL_COMPONENT_ROOT), actualMongo: false},
    consumerLockSha256: sha(lockBytes), sdkResolved, commands,
    scope: 'Packed query component and declarations; no Hyperion HTTP, source ingestion, database or full parity qualification'};
  await writeFile(join(evidence, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({evidence, nodeVersion: process.version, installedFromTarball: true,
    declarationConsumerExit: 0, packedFiles: packedFiles.size}));
} catch (error) {
  await writeFile(join(evidence, 'failed.json'), JSON.stringify({nodeVersion: process.version,
    error: String(error?.stack ?? error), commands}, null, 2) + '\n');
  console.error(`Package verification evidence retained at ${evidence}`);
  throw error;
}
