import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync, realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export const REFERENCE = Object.freeze({
  repository: 'https://github.com/atomicassets/atomicassets-api',
  tag: '2.7.0', commit: '0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e',
});

export async function executeOriginalJsonControls({referenceRoot, nodePath, timeoutMs}) {
  return await execute({referenceRoot, nodePath, timeoutMs, command: {mode:'json-controls'}});
}

export async function executeOriginalCollectionControls({referenceRoot, input, nodePath, timeoutMs}) {
  return await execute({referenceRoot, nodePath, timeoutMs, command: {mode:'collection-controls',input}});
}

export async function executeOriginalTemplateControls({referenceRoot, input, nodePath, timeoutMs}) {
  return await execute({referenceRoot, nodePath, timeoutMs, command: {mode:'templates-controls',input}});
}

export async function executeOriginalBuyofferControls({referenceRoot, input, nodePath, timeoutMs}) {
  return await execute({referenceRoot, nodePath, timeoutMs, command: {mode:'buyoffer-controls',input}});
}

export async function executeOriginalAuctionControls({referenceRoot, input, nodePath, timeoutMs}) {
  return await execute({referenceRoot, nodePath, timeoutMs, command: {mode:'auction-controls',input}});
}

export async function executeOriginalRelationshipControls({referenceRoot, input, nodePath, timeoutMs}) {
  return await execute({referenceRoot, nodePath, timeoutMs, command: {mode:'relationships-controls',input}});
}

function verifyReference(root) {
  const directory = realpathSync(root);
  const git = (...args) => execFileSync('git', args, {cwd: directory, encoding: 'utf8', timeout: 10000}).trim();
  if (git('rev-parse', 'HEAD') !== REFERENCE.commit || git('rev-parse', 'refs/tags/2.7.0') !== REFERENCE.commit)
    throw new Error('Reference HEAD and tag must match the exact approved 2.7.0 commit');
  if (git('status', '--porcelain=v1', '--untracked-files=no')) throw new Error('Reference tracked source has changed');
  const pkg = JSON.parse(readFileSync(`${directory}/package.json`, 'utf8'));
  if (pkg.version !== '2.7.0') throw new Error('Reference package version does not match');
  return {directory, commit: REFERENCE.commit,
    lockSha256: createHash('sha256').update(readFileSync(`${directory}/pnpm-lock.yaml`)).digest('hex')};
}

async function execute({referenceRoot, nodePath = process.execPath, timeoutMs = 30000, command}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) throw new Error('Invalid bounded reference deadline');
  const reference = verifyReference(referenceRoot);
  const input = Buffer.from(JSON.stringify(command));
  if (input.length > 1024 * 1024) throw new Error('Reference input exceeds 1 MiB');
  const env = {...process.env, LOG_LEVEL: 'error', NODE_ENV: 'production'};
  delete env.NODE_OPTIONS;
  return await new Promise((resolve, reject) => {
    const child = spawn(nodePath, [fileURLToPath(new URL('./reference-child.cjs', import.meta.url)), reference.directory],
      {cwd: reference.directory, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe', 'ipc']});
    let result, failure, logBytes = 0, output = '';
    const timer = setTimeout(() => {failure = new Error('Owned reference child exceeded its deadline'); child.kill();}, timeoutMs);
    const capture = data => {
      logBytes += data.length;
      if (logBytes > 256 * 1024) {failure = new Error('Owned reference child exceeded its log budget'); child.kill();}
      else output += data.toString('utf8');
    };
    child.stdout.on('data', capture); child.stderr.on('data', capture);
    child.on('message', message => {
      if (message?.event === 'reference_result' && !result) result = message.result;
      else if (message?.event === 'reference_error') failure = new Error(message.message);
      else {failure = new Error('Invalid or duplicate reference result'); child.kill();}
    });
    child.on('error', error => {clearTimeout(timer); reject(error);});
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (failure || code !== 0 || !result) reject(new Error(`${failure?.message ?? 'Reference child did not complete'}; exit=${code}; signal=${signal}; ${output}`));
      else resolve({...result, reference, execution: {nodePath, nodeVersion: result.nodeVersion, exitCode: code, logBytes,
        ...(command.mode === 'asset-controls' || command.mode === 'marketplace-controls' ? {mergedLog: output} : {})}});
    });
    child.stdin.end(input);
  });
}

export async function executeReferenceFixture({referenceRoot, fixture, nodePath, timeoutMs}) {
  if (fixture?.schemaVersion !== 1 || fixture?.baseline?.commit !== REFERENCE.commit || fixture.fixtureKind !== 'synthetic-database-boundary')
    throw new Error('Fixture must declare the approved pin and synthetic database boundary');
  return await execute({referenceRoot, nodePath, timeoutMs, command: {mode: 'request', fixture}});
}

export async function inspectReferenceNamespace({referenceRoot, namespace, namespaceArgs, queries = [], nodePath, timeoutMs}) {
  return await execute({referenceRoot, nodePath, timeoutMs, command: {mode: 'inventory', namespace, namespaceArgs, queries}});
}

export async function executeOriginalAssetControls({referenceRoot, nodePath, timeoutMs}) {
  return await execute({referenceRoot, nodePath, timeoutMs, command: {mode: 'asset-controls'}});
}

export async function executeOriginalMarketplaceControls({referenceRoot, input, nodePath, timeoutMs}) {
  return await execute({referenceRoot, nodePath, timeoutMs, command: {mode: 'marketplace-controls', input}});
}

export async function executeOriginalSaleControls({referenceRoot, nodePath, timeoutMs}) {
  return await execute({referenceRoot, nodePath, timeoutMs, command: {mode: 'sale-controls'}});
}

export async function executeOriginalSaleAssetControls({referenceRoot, input, nodePath, timeoutMs}) {
  return await execute({referenceRoot, nodePath, timeoutMs, command: {mode: 'sale-asset-controls', input}});
}

export async function executeOriginalIdHttpControls({referenceRoot, input, nodePath, timeoutMs}) {
  return await execute({referenceRoot, nodePath, timeoutMs, command: {mode: 'id-http-controls', input}});
}
