import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const [referenceRoot, sharedHarnessPath, outputPath, nodePath = process.execPath] = process.argv.slice(2);
if (!referenceRoot || !sharedHarnessPath || !outputPath) {
  throw new Error('Usage: node inventory-reference.mjs REFERENCE_ROOT SHARED_HARNESS OUTPUT_JSON [NODE_EXECUTABLE]');
}
const baselineCommit = '0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e';
const git = (...args) => execFileSync('git', args, {cwd: referenceRoot, timeout: 10000});
assert.equal(git('rev-parse', 'HEAD').toString().trim(), baselineCommit);
assert.equal(git('rev-parse', 'refs/tags/2.7.0').toString().trim(), baselineCommit);
assert.equal(git('status', '--porcelain=v1', '--untracked-files=no').toString(), '');
const fromReference = createRequire(resolve(referenceRoot, 'package.json'));
const ts = fromReference('typescript');
const {inspectReferenceNamespace} = await import(pathToFileURL(resolve(sharedHarnessPath)).href);
const fixture = JSON.parse(await readFile(new URL('./marketplace.input.json', import.meta.url)));
const inspections = [];
for (const disableV1Sales of [false, true]) {
  const result = await inspectReferenceNamespace({referenceRoot, namespace: 'atomicmarket',
    namespaceArgs: {...fixture.namespaceArgs, api_features: {disable_v1_sales: disableV1Sales}},
    queries: fixture.queries.slice(0, 1), nodePath});
  assert.equal(result.database.unused, 0);
  assert.equal(result.execution.exitCode, 0);
  inspections.push({disableV1Sales, result});
}

const files = git('ls-tree', '-r', '--name-only', 'HEAD', 'src/api/namespaces/atomicmarket',
  'src/api/namespaces/atomicassets', 'src/api/namespaces/utils.ts', 'src/api/namespaces/validation.ts')
  .toString().trim().split('\n').filter(p => p.endsWith('.ts') && !p.endsWith('.test.ts')
    && !p.endsWith('/test.ts'));
const sourcePins = [], anchors = [], validation = [], sockets = [];
function enclosingFunction(node, source) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isFunctionLike(p)) return p.name?.getText(source) ?? p.parent?.name?.getText(source) ?? '(anonymous)';
  }
  return '(module)';
}
function literalPaths(node) {
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(literalPaths);
  throw new Error('Unresolved original route path: ' + node.getText());
}
for (const path of files) {
  const bytes = git('show', 'HEAD:' + path), text = bytes.toString('utf8');
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const pin = {path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    gitBlob: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')};
  sourcePins.push(pin);
  const location = node => ({path, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    gitBlob: pin.gitBlob, sha256: pin.sha256});
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && node.expression.expression.getText(source) === 'router'
        && ['all', 'get', 'post', 'head'].includes(node.expression.name.text)) {
      const fn = enclosingFunction(node, source);
      const own = path.startsWith('src/api/namespaces/atomicmarket/routes/');
      const inherited = path.endsWith('/atomicassets/routes/assets.ts') ? fn === 'singleAssetEndpoints'
        : (path.endsWith('/atomicassets/routes/offers.ts') || path.endsWith('/atomicassets/routes/transfers.ts')) && fn === 'endpoints';
      const redirect = path.endsWith('/atomicmarket/index.ts') && fn === 'router';
      if (own || inherited || redirect) {
        const wrapper = node.arguments.find(a => ts.isCallExpression(a) && a.expression.getText(source) === 'returnAsJSON');
        for (const routePath of literalPaths(node.arguments[0])) {
          anchors.push({path: '/atomicmarket' + routePath, registeredMethod: node.expression.name.text.toUpperCase(),
            handler: wrapper?.arguments[0]?.getText(source) ?? '(redirect)', source: location(node)});
        }
      }
    }
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'filterQueryArgs') {
      validation.push({function: enclosingFunction(node, source), source: location(node),
        input: node.arguments[0]?.getText(source), definition: node.arguments[1]?.getText(source)});
    }
    if (path.startsWith('src/api/namespaces/atomicmarket/routes/') && ts.isCallExpression(node)
        && node.expression.getText(source) === 'createSocketApiNamespace') {
      const arg = node.arguments[1];
      assert(ts.isBinaryExpression(arg) && ts.isStringLiteralLike(arg.right));
      const owner = enclosingFunction(node, source);
      sockets.push({path: '/atomicmarket' + arg.right.text, function: owner, source: location(node),
        implementationStatus: 'not_implemented', referenceBehaviorStatus: 'source_inventory_only'});
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
const routes = new Map();
for (const {disableV1Sales, result} of inspections) {
  for (const route of result.inventory.routes) {
    const registeredMethod = route.methods._all ? 'ALL'
      : Object.keys(route.methods).filter(k => route.methods[k]).map(k => k.toUpperCase()).sort().join(',');
    const matching = anchors.filter(a => a.path === route.path && a.registeredMethod === registeredMethod);
    assert(matching.length, 'Actual original route has no source anchor: ' + route.path);
    const key = registeredMethod + ' ' + route.path;
    if (!routes.has(key)) routes.set(key, {path: route.path, registeredMethod,
      implementationStatus: 'not_implemented', referenceBehaviorStatus: 'registered_original_namespace',
      source: matching, configurations: []});
    routes.get(key).configurations.push({disableV1Sales, originalHandlers: [...new Set(route.handlers)]});
  }
}
for (const anchor of anchors) assert(routes.has(anchor.registeredMethod + ' ' + anchor.path),
  'Source-declared route was not registered: ' + anchor.path);
const sourceStats = {
  files: sourcePins.length, sourceRegistrations: anchors.length, distinctHttpRegistrations: routes.size,
  defaultModeRegistrations: inspections[0].result.inventory.routes.length,
  alternateSalesModeRegistrations: inspections[1].result.inventory.routes.length,
  socketNamespaces: sockets.length, validationDefinitions: validation.length,
};
const components = inspections[0].result.inventory.components;
assert(components && typeof components === 'object', 'Original response components must be captured');
assert.deepEqual(components, inspections[1].result.inventory.components);
assert.deepEqual(inspections[0].result.inventory.openapi, inspections[1].result.inventory.openapi,
  'This baseline shares documentation between the two runtime handler modes');
const unresolvedReferences = new Set();
function inspectRefs(value) {
  if (Array.isArray(value)) {value.forEach(inspectRefs); return;}
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (key === '$ref' && typeof item === 'string' && item.startsWith('#/components/')) {
      let target = {components};
      for (const part of item.slice(2).split('/')) target = target?.[part.replaceAll('~1', '/').replaceAll('~0', '~')];
      if (target === undefined) unresolvedReferences.add(item);
    }
    inspectRefs(item);
  }
}
inspections.forEach(({result}) => inspectRefs(result.inventory.openapi));
inspectRefs(components);
const inventory = {schemaVersion: 1,
  baseline: {repository: 'https://github.com/atomicassets/atomicassets-api', tag: '2.7.0', commit: baselineCommit},
  namespace: 'atomicmarket', sourceStats,
  scope: {originalHttpServerAndNamespace: true, actualRequestsInInventory: false,
    database: 'strict synthetic namespace-init query', postgresExecution: false, chainCapture: false,
    hyperionPluginExecution: false, methodNote: 'ALL is original Express router.all; documentation generally describes GET.'},
  inspection: {nodeVersion: inspections[0].result.nodeVersion, parserVersion: ts.version,
    modes: inspections.map(({disableV1Sales, result}) => ({disableV1Sales, exitCode: result.execution.exitCode,
      namespaceInitQueries: result.database.executed.length, unusedQueries: result.database.unused}))},
  http: [...routes.values()].sort((a, b) => a.path.localeCompare(b.path) || a.registeredMethod.localeCompare(b.registeredMethod)),
  sockets,
  openapi: {sharedAcrossSalesModes: true, paths: inspections[0].result.inventory.openapi},
  components, tags: inspections[0].result.inventory.tags,
  responseSchemaReferences: {unresolved: [...unresolvedReferences].sort(),
    note: 'References are recorded from the original documentation; handlers and captured HTTP behavior remain the parity oracle.'},
  validationDefinitions: validation, sourcePins,
  completeness: {allSelectedSourceRegistrationsReconciled: true, allOriginalRuntimeRegistrationsAnchored: true,
    httpBehaviorParity: 'not_qualified', socketBehaviorParity: 'not_qualified', projectionAndBackendParity: 'not_qualified'},
};
await mkdir(dirname(resolve(outputPath)), {recursive: true});
await writeFile(outputPath, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(JSON.stringify({baselineCommit, ...sourceStats, nodeVersion: inventory.inspection.nodeVersion}));
