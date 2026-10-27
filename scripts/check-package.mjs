import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, lstatSync} from 'node:fs';
import {copyFile, mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {delimiter, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const name = '@eosrio/hyperion-atomicassets-plugin';
const sdkPin = 'git+https://github.com/eosrio/hyperion-sdk.git#8d37e932df5e0e7d671c9682505de3dd55f0edb4';
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
function run(args, cwd, label) {
  const result = spawnSync(process.execPath, args, {cwd, env, encoding: 'utf8', timeout: 90000,
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
  const required = ['dist/atomicmarket/marketplace.js', 'dist/atomicmarket/marketplace.d.ts',
    'dist/atomicmarket/marketplace-indexing.js', 'dist/atomicmarket/marketplace-indexing.d.ts',
    'dist/atomicassets/asset.js', 'dist/atomicassets/asset.d.ts',
    'README.md', 'LICENSE', 'harness/shared/LICENSE.atomicassets-api.txt',
    'harness/shared/NOTICE.atomicassets-api.txt', 'docs/parity/atomicmarket/UPSTREAM-LICENSE'];
  for (const path of required) assert.ok(packedFiles.has(path), `Packed artifact is missing ${path}`);
  const tarball = join(evidence, packed.filename);
  const tarballBytes = await readFile(tarball);
  await writeFile(join(consumer, 'package.json'), JSON.stringify({name: 'atomic-parity-packed-consumer',
    private: true, type: 'module', dependencies: {[name]: 'file:' + tarball}, devDependencies: {typescript: '7.0.2'},
    allowScripts: {'github:eosrio/hyperion-sdk#8d37e932df5e0e7d671c9682505de3dd55f0edb4': true}}, null, 2) + '\n');
  for (const file of ['consume.mjs', 'consume.ts', 'tsconfig.json'])
    await copyFile(join(root, 'tests/fixtures/packed-consumer', file), join(consumer, file));
  for (const file of ['asset-formatter-cases.mjs', 'asset-formatter.expected.json'])
    await copyFile(join(root, 'tests/fixtures', file), join(consumer, file));
  await copyFile(join(root, 'fixtures/harness/atomicassets/single-asset.input.json'), join(consumer, 'single-asset.input.json'));
  await run([npmCli, 'install', '--package-lock-only', '--allow-git=all'], consumer, 'consumer-lock');
  await run([npmCli, 'ci', '--allow-git=all'], consumer, 'consumer-install');
  const installed = join(consumer, 'node_modules', name);
  assert.equal(lstatSync(installed).isSymbolicLink(), false, 'Consumer must install the tarball, not link source');
  const installedPackage = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  assert.equal(installedPackage.exports['./atomicmarket/marketplace'].import, './dist/atomicmarket/marketplace.js');
  assert.equal(installedPackage.exports['./atomicmarket/marketplace'].types, './dist/atomicmarket/marketplace.d.ts');
  assert.equal(installedPackage.exports['./atomicmarket/marketplace-indexing'].import, './dist/atomicmarket/marketplace-indexing.js');
  assert.equal(installedPackage.exports['./atomicmarket/marketplace-indexing'].types, './dist/atomicmarket/marketplace-indexing.d.ts');
  assert.equal(installedPackage.exports['./atomicassets/asset'].import, './dist/atomicassets/asset.js');
  assert.equal(installedPackage.exports['./atomicassets/asset'].types, './dist/atomicassets/asset.d.ts');
  for (const path of required) assert.equal(sha(await readFile(join(installed, path))), sha(await readFile(join(root, path))), path);
  const runtime = await run([join(consumer, 'consume.mjs')], consumer, 'consumer-runtime');
  const declarations = await run([join(consumer, 'node_modules/typescript/bin/tsc'), '-p',
    join(consumer, 'tsconfig.json'), '--listFiles'], consumer, 'consumer-declarations');
  const slash = value => value.replaceAll('\\', '/').toLowerCase();
  assert.ok(slash(declarations).includes(slash(join(installed, 'dist/atomicmarket/marketplace.d.ts'))),
    'Consumer must resolve the installed packed declaration');
  assert.ok(slash(declarations).includes(slash(join(installed, 'dist/atomicmarket/marketplace-indexing.d.ts'))),
    'Consumer must resolve the installed contextual factory declaration');
  assert.ok(slash(declarations).includes(slash(join(installed, 'dist/atomicassets/asset.d.ts'))),
    'Consumer must resolve the installed packed asset declaration');
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
