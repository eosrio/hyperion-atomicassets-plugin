import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {isAbsolute, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--destination') throw new Error('Use --destination PATH outside the plugin checkout');
const target = resolve(args[1]);
const pluginRoot = fileURLToPath(new URL('../', import.meta.url));
const pathFromPlugin = relative(pluginRoot, target);
if (pathFromPlugin === '' || (!isAbsolute(pathFromPlugin) && pathFromPlugin !== '..' && !pathFromPlugin.startsWith('..' + sep)))
  throw new Error('Reference checkout must be outside the plugin worktree');
const pin = '0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e';
const git = (...a) => execFileSync('git', a, {cwd: target, encoding: 'utf8', timeout: 120000}).trim();
const created = !existsSync(target);
if (created) execFileSync('git', ['clone', '--filter=blob:none', '--no-checkout',
  'https://github.com/atomicassets/atomicassets-api.git', target], {stdio: 'inherit', timeout: 120000});
if (!created && git('status', '--porcelain=v1', '--untracked-files=no')) throw new Error('Existing reference has tracked changes; preserve it');
if (git('rev-parse', 'refs/tags/2.7.0') !== pin) throw new Error('Upstream 2.7.0 tag does not match the approved commit');
git('checkout', '--detach', pin);
const pkg = JSON.parse(readFileSync(`${target}/package.json`, 'utf8'));
if (pkg.version !== '2.7.0' || pkg.packageManager !== 'pnpm@11.13.1') throw new Error('Unexpected pinned reference toolchain');
console.log(JSON.stringify({referenceRoot: target, pin, packageManager: pkg.packageManager,
  next: 'Run pnpm install --frozen-lockfile inside this reference, then set AA_REFERENCE_ROOT for the plugin tests.'}));
