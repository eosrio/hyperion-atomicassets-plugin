'use strict';
const {createRequire} = require('node:module');
const {readFileSync} = require('node:fs');
const {join, relative, resolve} = require('node:path');
const {createHash} = require('node:crypto');
const {once} = require('node:events');
const assert = require('node:assert/strict');

const referenceRoot = resolve(process.argv[2]);
const fromReference = createRequire(join(referenceRoot, 'package.json'));
fromReference('@swc-node/register');

function finish(event, value, code) {
  const packet = event === 'reference_result' ? {event, result: value} : {event, message: String(value?.stack ?? value)};
  process.send(packet, error => process.exit(error ? 1 : code));
}

async function main(command) {
  if (command.mode === 'asset-controls')
    return await require('../atomicassets/original-controls.cjs')(fromReference, referenceRoot);
  if (command.mode === 'marketplace-controls')
    return await require('../atomicmarket/original-marketplace-controls.cjs')(fromReference, referenceRoot, command.input);
  if (command.mode === 'sale-controls')
    return await require('../atomicmarket/original-sale-controls.cjs')(fromReference, referenceRoot);
  const fixture = command.fixture;
  const namespace = fixture?.namespace ?? command.namespace;
  if (!['atomicassets', 'atomicmarket'].includes(namespace)) throw new Error('Unsupported bounded reference namespace');
  const args = fixture?.namespaceArgs ?? command.namespaceArgs;
  const queries = fixture?.queries ?? command.queries ?? [];
  if (!Array.isArray(queries) || queries.length > 32) throw new Error('Invalid bounded query script');
  let queryIndex = 0, healthCalls = 0;
  const executed = [];
  const database = {
    async query(sql, parameters = []) {
      const expected = queries[queryIndex];
      if (!expected) throw new Error('Unexpected reference database query');
      assert.equal(sql, expected.sql, 'Original SQL must match the fixture exactly');
      assert.deepEqual(parameters, expected.parameters, 'Original SQL parameters must match exactly');
      executed.push({sql, parameters: structuredClone(parameters)});
      queryIndex++;
      return {rows: structuredClone(expected.rows), rowCount: expected.rows.length};
    },
  };
  const unavailableRedis = new Proxy({}, {get() {throw new Error('Redis access is outside this fixture');}});
  const connection = {
    database: {createPool: () => database, query: database.query},
    redis: {ioRedis: unavailableRedis},
    chain: {name: 'reference-fixture', rpc: {async get_info() {healthCalls++; return {};}}},
  };
  const {HTTPServer} = fromReference('./src/api/server.ts');
  const Class = fromReference(`./src/api/namespaces/${namespace}/index.ts`)[namespace === 'atomicassets' ? 'AtomicAssetsNamespace' : 'AtomicMarketNamespace'];
  const server = new HTTPServer({server_name: 'reference.invalid', cache_life: 0}, connection);
  const originalFactory = server.web.returnAsJSON;
  const handlers = new WeakMap();
  // The returned middleware is the original function; metadata collection does not replace it.
  server.web.returnAsJSON = (handler, core) => {
    const middleware = originalFactory(handler, core);
    handlers.set(middleware, handler.name);
    return middleware;
  };
  let result;
  try {
    const core = new Class('/' + namespace, connection, structuredClone(args));
    await core.init();
    const router = await core.router(server);
    server.web.express.use('/' + namespace, router);
    const routes = router.stack.filter(layer => layer.route).flatMap(layer => {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      return paths.map(path => ({path: '/' + namespace + path, methods: layer.route.methods,
        handlers: layer.route.stack.map(s => handlers.get(s.handle)).filter(Boolean)}));
    });
    result = {nodeVersion: process.version, scope: {database: 'synthetic-database-boundary', postgresExecution: false,
      chainCapture: false, hyperionPluginExecution: false, originalHttpServer: true, cacheEnabled: false,
      chainHealthRpc: 'controlled stub; no network'}, namespace,
      inventory: {routes, openapi: server.docs.documentation.paths,
        components: server.docs.documentation.components, tags: server.docs.documentation.tags}};
    if (command.mode === 'request') {
      const request = fixture.request;
      if (typeof request?.path !== 'string' || !request.path.startsWith('/' + namespace + '/') || request.path.length > 4096
          || !['GET', 'POST', 'HEAD'].includes(request.method)) throw new Error('Invalid bounded loopback request');
      server.httpServer.listen(0, '127.0.0.1');
      await once(server.httpServer, 'listening');
      const address = server.httpServer.address();
      const response = await fetch(`http://127.0.0.1:${address.port}${request.path}`, {method: request.method, redirect: 'manual'});
      const bodyChunks = [];
      let bodyBytes = 0;
      for await (const chunk of response.body) {
        bodyBytes += chunk.length;
        if (bodyBytes > 2 * 1024 * 1024) throw new Error('Reference HTTP response exceeded 2 MiB');
        bodyChunks.push(chunk);
      }
      const text = Buffer.concat(bodyChunks, bodyBytes).toString('utf8');
      result.response = {status: response.status, headers: Object.fromEntries(response.headers),
        body: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text, bodyBytes};
    }
    if (queryIndex !== queries.length) throw new Error('Reference operation left scripted database queries unused');
    result.database = {executed, unused: queries.length - queryIndex};
    result.backgroundHealthCalls = healthCalls;
    result.loadedSource = Object.keys(require.cache).filter(p => p.startsWith(join(referenceRoot, 'src') + require('node:path').sep))
      .map(p => ({path: relative(referenceRoot, p).split(require('node:path').sep).join('/'),
        sha256: createHash('sha256').update(readFileSync(p)).digest('hex')}));
    return result;
  } finally {
    server.httpServer.closeAllConnections();
    await new Promise(resolve => server.socket.io.close(resolve));
  }
}

(async () => {
  let chunks = [], bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 1024 * 1024) throw new Error('Reference command exceeded 1 MiB');
    chunks.push(chunk);
  }
  const command = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!['request', 'inventory', 'asset-controls', 'marketplace-controls', 'sale-controls'].includes(command.mode)) throw new Error('Invalid reference mode');
  const result = await main(command);
  finish('reference_result', result, 0);
})().catch(error => finish('reference_error', error, 1));
