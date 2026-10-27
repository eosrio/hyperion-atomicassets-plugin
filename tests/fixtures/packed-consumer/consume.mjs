import assert from 'node:assert/strict';
import {realpathSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PROJECTION_CAPABILITIES} from '@eosrio/hyperion-sdk/projection';
import {MarketplaceNotFoundError, readMarketplace} from '@eosrio/hyperion-atomicassets-plugin/atomicmarket/marketplace';
import {formatAsset} from '@eosrio/hyperion-atomicassets-plugin/atomicassets/asset';
import {createMarketplaceDefinition} from '@eosrio/hyperion-atomicassets-plugin/atomicmarket/marketplace-indexing';
import {assetFormatterCases} from './asset-formatter-cases.mjs';
import {formatSale} from '@eosrio/hyperion-atomicassets-plugin/atomicmarket/sale';
import {saleFormatterCases, saleFormatterInput} from './sale-formatter-cases.mjs';

const resolved = fileURLToPath(import.meta.resolve('@eosrio/hyperion-atomicassets-plugin/atomicmarket/marketplace'));
assert.equal(realpathSync(resolved), realpathSync(join(process.cwd(), 'node_modules/@eosrio/hyperion-atomicassets-plugin/dist/atomicmarket/marketplace.js')));
assert.ok(PROJECTION_CAPABILITIES.includes('eq-filter'));
const contextual = createMarketplaceDefinition({id: 'marketplaces', mappingRevision: 'a'.repeat(64),
  marketContract: 'atomicmarket', abiDeployment: 'original-deployment', abiSha256: 'b'.repeat(64)});
assert.equal(contextual.schemaVersion, 2); assert.equal(contextual.onAbsent, 'incomplete');
assert.deepEqual(contextual.preserveOnReplace, ['created_at_block', 'created_at_time']);
const view = {
  binding: {chainId: 'a'.repeat(64), backendId: 'mongodb', projectionId: 'marketplaces',
    mappingRevision: 'b'.repeat(64), abiDeployment: 'market-abi', abiSha256: 'c'.repeat(64), generation: 'test-instance'},
  checkpoint: {blockNum: 999, blockId: 'd'.repeat(64)}, revision: 'e'.repeat(64),
};
const record = {market_contract: 'atomicmarket', marketplace_name: 'marketplace1', creator: 'alice',
  created_at_block: '123', created_at_time: '1700000000000'};
const result = await readMarketplace({async query() {return {view, rows: [{key: 'marketplace1', value: record}]};}},
  view, 'atomicmarket', 'marketplace1');
assert.deepEqual(result.data, {marketplace_name: 'marketplace1', creator: 'alice',
  created_at_block: '123', created_at_time: '1700000000000'});
assert.equal(result.view, view);
await assert.rejects(readMarketplace({async query() {return {view, rows: []};}}, view, 'atomicmarket', 'missing'),
  error => error instanceof MarketplaceNotFoundError && error.statusCode === 416);
const assetExport = fileURLToPath(import.meta.resolve('@eosrio/hyperion-atomicassets-plugin/atomicassets/asset'));
assert.equal(realpathSync(assetExport), realpathSync(join(process.cwd(), 'node_modules/@eosrio/hyperion-atomicassets-plugin/dist/atomicassets/asset.js')));
const base = JSON.parse(await readFile(new URL('./single-asset.input.json', import.meta.url)));
const golden = JSON.parse(await readFile(new URL('./asset-formatter.expected.json', import.meta.url)));
const assetCases = assetFormatterCases(base);
for (const {name, fixture, invalid} of assetCases) {
  const input = fixture.queries[0].rows[0], original = structuredClone(input);
  if (invalid) {assert.equal(golden[name].status, 500); assert.throws(() => formatAsset(input), TypeError);}
  else {
    assert.equal(golden[name].status, 200);
    const formatted = formatAsset(input);
    assert.equal(Object.hasOwn(formatted, 'template'), Object.hasOwn(input, 'template'));
    assert.deepEqual(JSON.parse(JSON.stringify(formatted)), golden[name].body.data);
    assert.equal(JSON.stringify(formatted), JSON.stringify(golden[name].body.data));
  }
  assert.deepEqual(input, original);
}
const saleExport = fileURLToPath(import.meta.resolve('@eosrio/hyperion-atomicassets-plugin/atomicmarket/sale'));
assert.equal(realpathSync(saleExport), realpathSync(join(process.cwd(), 'node_modules/@eosrio/hyperion-atomicassets-plugin/dist/atomicmarket/sale.js')));
const saleBase = JSON.parse(await readFile(new URL('./single-sale.input.json', import.meta.url)));
const saleGolden = JSON.parse(await readFile(new URL('./sale-formatter.expected.json', import.meta.url)));
const saleCases = saleFormatterCases(saleBase);
for (const {name, fixture, invalid} of saleCases) {
  const input = saleFormatterInput(fixture, saleGolden[name]), original = structuredClone(input);
  if (invalid) {assert.equal(saleGolden[name].status, 500); assert.throws(() => formatSale(input), TypeError);}
  else {
    assert.equal(saleGolden[name].status, 200);
    const formatted = formatSale(input);
    assert.deepEqual(JSON.parse(JSON.stringify(formatted)), saleGolden[name].body.data);
    assert.equal(JSON.stringify(formatted), JSON.stringify(saleGolden[name].body.data));
  }
  assert.deepEqual(input, original);
}
console.log(JSON.stringify({packedExport: resolved, successes: 1, compatibleMissingError: true,
  sdkRuntimeImport: true, packedAssetExport: assetExport, assetFormatterReferenceCases: assetCases.length,
  packedSaleExport: saleExport, saleFormatterReferenceCases: saleCases.length}));

await assert.rejects(import('@eosrio/hyperion-atomicassets-plugin/atomicassets/internal/lifecycle'),
  error => error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED');
await assert.rejects(import('@eosrio/hyperion-atomicassets-plugin/atomicmarket/internal/fixed-sale'),
  error => error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED');
