import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join, resolve} from 'node:path';
import {inspectReferenceNamespace, REFERENCE} from '../shared/reference.mjs';
import {inventorySocketContracts} from '../shared/socket-inventory.mjs';

const referenceRoot = resolve(process.env.AA_REFERENCE_ROOT ?? '');
if (!process.env.AA_REFERENCE_ROOT) throw new Error('AA_REFERENCE_ROOT is required');
const output = resolve(process.argv[2] ?? 'docs/parity/atomicassets');
const fromReference = createRequire(join(referenceRoot, 'package.json'));
const ts = fromReference('typescript');
const git = (...args) => execFileSync('git', args, {cwd: referenceRoot, encoding: 'utf8', timeout: 10000});
const sourceFiles = git('ls-tree', '-r', '--name-only', REFERENCE.commit, '--', 'src/api/namespaces/atomicassets').trim().split('\n')
  .filter(p => p.endsWith('.ts') && !p.endsWith('.test.ts'));
const symbols = [];
const sources = [];
for (const path of sourceFiles) {
  const content = git('show', `${REFERENCE.commit}:${path}`);
  const ast = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
  const source = {path, gitBlob: git('rev-parse', `${REFERENCE.commit}:${path}`).trim(),
    sha256: createHash('sha256').update(content).digest('hex'),
    url: `${REFERENCE.repository}/blob/${REFERENCE.commit}/${path}`};
  sources.push(source);
  function visit(node) {
    let body;
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) body = node.body;
    if (ts.isPropertyDeclaration(node) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)))
      body = node.initializer.body;
    if (body && node.name) {
      const calls = [], validation = [], errors = [];
      function inspect(n) {
        if (ts.isCallExpression(n)) {
          calls.push(n.expression.getText(ast).split('.').at(-1));
          if (n.expression.getText(ast) === 'filterQueryArgs') validation.push({
            line: ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1,
            values: n.arguments[0]?.getText(ast), rules: n.arguments[1]?.getText(ast)});
        }
        if (ts.isNewExpression(n) && n.expression.getText(ast) === 'ApiError') errors.push({
          line: ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1,
          message: n.arguments?.[0]?.getText(ast), status: n.arguments?.[1]?.getText(ast) ?? '500'});
        ts.forEachChild(n, inspect);
      }
      inspect(body);
      symbols.push({name: node.name.getText(ast), path, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
        endLine: ast.getLineAndCharacterOfPosition(node.getEnd()).line + 1, calls: [...new Set(calls)], validation, errors});
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
function closure(names) {
  const found = new Set(), pending = [...names];
  while (pending.length) {
    const name = pending.pop();
    for (const symbol of symbols.filter(s => s.name === name)) {
      const key = `${symbol.path}:${symbol.line}`;
      if (found.has(key)) continue;
      found.add(key); pending.push(...symbol.calls);
    }
  }
  return symbols.filter(s => found.has(`${s.path}:${s.line}`));
}
const runtime = await inspectReferenceNamespace({referenceRoot, namespace: 'atomicassets',
  namespaceArgs: {connected_reader: 'reference-fixture', atomicassets_account: 'atomicassets'}});
const socketCoverage = inventorySocketContracts({referenceRoot, namespace: 'atomicassets', ts});
const endpoints = runtime.inventory.routes.map(route => {
  const openapiPath = route.path.replace(/:([a-zA-Z_]+)/g, '{$1}');
  const documented = runtime.inventory.openapi[openapiPath];
  const dependencies = closure(route.handlers);
  return {...route, classification: route.path.endsWith('/docs') || route.path.endsWith('/swagger') ? 'documentation-redirect' : 'json-api',
    openapi: documented ?? null, sourceHandlers: dependencies.map(({calls, ...rest}) => rest),
    pluginStatus: 'not implemented', referenceConformance: 'pending except the separately captured single-asset controls'};
});
const idRoute = endpoints.find(e => e.path === '/atomicassets/v1/assets/:asset_id');
if (!idRoute) throw new Error('Original asset-ID handler registration is absent');
idRoute.httpComponent = {
  "module": "http/id-routes",
  "registration": "registerAtomicIdRoutes on existing Fastify host",
  "scope": "controlled original-handler and Fastify inject subset; not production admission",
  "supported": "untemplated fixed lifecycle records, compatible 200/400/416 bodies and leading-zero distinction",
  "unavailable": "null, negative nonzero, overflow, templates, pricing or unknown coverage",
  "productionHost": "pending HAPI request authority, final onSend gate and shared headers",
  "physicalSameInputComparison": "pending",
  "fullEndpointParity": false
};
const result = {schemaVersion: 1, baseline: REFERENCE,
  inventoryScope: 'Every path registered by the original AtomicAssetsNamespace.router with default namespace limits; registrations, original OpenAPI declarations and source validation/error dependencies, not executed conformance for every route.',
  runtime: {node: runtime.nodeVersion, originalHttpServer: true, databaseQueries: runtime.database.executed.length,
    referenceLockSha256: runtime.reference.lockSha256},
  summary: {registrations: endpoints.length, jsonApiPaths: endpoints.filter(e => e.classification === 'json-api').length,
    documentationRedirects: endpoints.filter(e => e.classification === 'documentation-redirect').length,
    documentedPaths: endpoints.filter(e => e.openapi).length, implementedPluginPaths: 0,
    socketRegistrations: socketCoverage.registrationCount, socketNamespaces: socketCoverage.distinctNamespaceCount},
  components: runtime.inventory.components,
  sharedSemantics: [
    {path: 'src/api/server.ts', note: 'Original returnAsJSON merges request data and returns success/data/query_time. API errors, query timeouts and unknown errors use the original responder.'},
    {path: 'src/api/namespaces/validation.ts', note: 'Original filterQueryArgs validates typed/defaulted values and reports invalid parameters with HTTP400; ID validation preserves original text.'},
    {path: 'src/api/namespaces/utils.ts', note: 'Original query and body merge behavior; page/filter composition is preserved rather than inferred from OpenAPI alone.'},
    {path: 'src/api/namespaces/atomicassets/format.ts', note: 'Asset/template/schema/collection/offer/transfer response formatting is domain behavior; dynamic field precedence and exact IDs must remain compatible.'}
  ], endpoints, sources,
  socketCoverage};
await mkdir(output, {recursive: true});
await writeFile(join(output, 'inventory.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result.summary));
