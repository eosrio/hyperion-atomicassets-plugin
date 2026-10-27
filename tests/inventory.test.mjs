import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('the pinned AtomicAssets inventory accounts for APIs, aliases, redirects and schemas', async () => {
  const inventory = JSON.parse(await readFile(new URL('../docs/parity/atomicassets/inventory.json', import.meta.url), 'utf8'));
  assert.equal(inventory.baseline.commit, '0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');
  assert.equal(inventory.summary.registrations, 37);
  assert.equal(inventory.summary.jsonApiPaths, 35);
  assert.equal(inventory.summary.documentationRedirects, 2);
  assert.equal(inventory.summary.implementedPluginPaths, 0);
  const paths = new Set(inventory.endpoints.map(e => e.path));
  assert.equal(paths.size, 37);
  assert.ok(paths.has('/atomicassets/v1/templates/:template_id/stats'));
  assert.ok(paths.has('/atomicassets/v1/templates/:collection_name/:template_id/stats'));
  assert.ok(paths.has('/atomicassets/v1/burns/:account'));
  assert.ok(paths.has('/atomicassets/docs/swagger'));
  assert.ok(inventory.components.schemas.Asset);
  assert.ok(inventory.endpoints.filter(e => e.classification === 'json-api').every(e => e.sourceHandlers.length > 0));
});
