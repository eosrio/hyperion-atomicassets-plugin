// Actual HAPI registry and request/final-publication composition. Linux caller owns the client.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const sha = value => createHash('sha256').update(value).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export async function createHost({hapiRoot, atomic, client, databaseName, generation, bounds, persist}) {
  assert.equal(process.platform, 'linux');
  const load = path => import(pathToFileURL(join(hapiRoot, path)));
  const [{StatefulProjectionRegistryV2}, {installStatefulApiHostV2}] = await Promise.all([
    load('build/indexer/projection/stateful-registry.js'), load('build/api/helpers/stateful-owner.js')]);
  const Fastify = createRequire(join(hapiRoot, 'package.json'))('fastify');
  const plugin = new atomic.default({limits: bounds}), published = new Map(), proofs = new WeakSet(), active = new Map();
  const controls = {source: true, socket: {}, mapping: true};
  const source = {
    async statefulSelectors(selectors) {
      const proof = Object.freeze({}); proofs.add(proof);
      return {proof, selectors: selectors.map(row => ({...row, abiDeployment: 'controlled-jsonb-display-v1', abiSha256: sha('controlled-jsonb-display-v1')}))};
    },
    async open(checkpoint) {
      assert(controls.source && [...published.values()].some(row => same(row.checkpoint, checkpoint)), 'Controlled source checkpoint unavailable');
      const proof = Object.freeze({checkpoint: structuredClone(checkpoint)}); proofs.add(proof); return proof;
    },
    async assertStatefulView(proof, declaration) {
      assert(proofs.has(proof) && controls.mapping && active.get(declaration.projection.definition.id) === declaration.digest);
      assert(published.has(declaration.digest + ':' + proof.checkpoint.blockNum + ':' + proof.checkpoint.blockId));
    },
    async revalidate(proof) {assert(controls.source && proofs.has(proof));}
  };
  const configuration = {generation, backend: {kind: 'mongodb', id: databaseName, database: databaseName},
    recovery: {receipts: 64, blocks: 64, bytes: 16 * 1024 * 1024, maxBlockBytes: 1024 * 1024},
    maximumFramesPerDrain: 8, operationTimeoutMS: 5000, transactionTimeoutMS: 15000, api: {timeoutMs: 5000}};
  const errors = [], loader = {plugins: [plugin], statefulPluginsV2: () => [{plugin, configuration: plugin.baseConfig,
    hookArtifact: sha(readFileSync(new URL('../../../dist/index.js', import.meta.url)))}]};
  const registry = await StatefulProjectionRegistryV2.create({chainId: '1'.repeat(64), configuration, mongo: client, client: {}, source,
    profile: {id: 'controlled-jsonb-display', profileId: 'synthetic-only', components: []}, completeKindMongo: async () => client,
    onError: (projection, error) => errors.push({projection, error})}, loader);
  await registry.initializeMissing(); assert.deepEqual(errors, []);
  const reads = new Set(); let opened = 0, closed = 0;
  for (const [id, original] of registry.entries) {
    active.set(id, original.declaration.digest);
    const adapter = original.adapter, facade = Object.fromEntries(Object.entries(adapter).map(([key, value]) => [key, typeof value === 'function' ? value.bind(adapter) : value]));
    for (const key of ['reductionRead', 'completedRead']) facade[key] = async (...args) => {const read = await adapter[key](...args); assert(!reads.has(read)); reads.add(read); opened++; return read;};
    facade.closeRead = read => {const value = adapter.closeRead(read); assert(reads.delete(read)); closed++; return value;};
    const observed = Object.freeze(facade);
    registry.entries.set(id, Object.freeze({...original, adapter: observed,
      ...(original.completeKind ? {completeKind: Object.freeze({...original.completeKind, adapter: observed})} : {}),
      ...(original.indexed ? {indexed: Object.freeze({...original.indexed, adapter: observed})} : {})}));
  }
  const api = Fastify(); let beforeSend;
  api.addHook('onSend', async (request, reply, payload) => {if (beforeSend) await beforeSend(request, reply); return payload;});
  const context = installStatefulApiHostV2(api, {configuration, registry: async () => registry,
    probe: {currentSocket: () => controls.socket, probe: async (_target, signal) => !signal.aborted && controls.source && controls.mapping}});
  plugin.addRoutes(api, context);
  const observe = async (url, view, expectedStatus = 200) => {
    const response = await api.inject(url), body = response.json(); assert.equal(response.statusCode, expectedStatus);
    if (response.statusCode === 200) {
      assert.equal(response.headers['hyperion-state-block-num'], String(view.checkpoint.blockNum));
      assert.equal(response.headers['hyperion-state-block-id'], view.checkpoint.blockId);
      assert.equal(response.headers['hyperion-state-last-valid'], 'false');
    } else {
      assert.equal(response.headers['cache-control'], 'no-store');
      for (const key of ['hyperion-state-block-num', 'hyperion-state-block-id', 'hyperion-state-last-valid', 'etag']) assert.equal(response.headers[key], undefined);
    }
    const receipt = {url, status: response.statusCode, headers: response.headers, body};
    await persist({event: 'managed-http', ...receipt}); return receipt;
  };
  return {registry, controls, observe,
    async publish(declaration, view) {published.set(declaration.digest + ':' + view.checkpoint.blockNum + ':' + view.checkpoint.blockId, structuredClone(view));},
    async late(url, change, expectedView) {
      let called = false; assert.equal(beforeSend, undefined);
      beforeSend = async (request, reply) => {assert.equal(reply.statusCode, 200); called = true; await change(request);};
      try {const result = await observe(url, expectedView, 503); assert(called, 'Successful real route must reach the final publication fence'); return result;}
      finally {beforeSend = undefined;}
    },
    async cancelAtPublication(url, view) {return this.late(url, async request => {request.raw.emit('aborted');}, view);},
    async close() {await api.close(); assert.equal(reads.size, 0); assert.equal(opened, closed); return {httpClosed: true, readsOpened: opened, readsClosed: closed};}
  };
}
