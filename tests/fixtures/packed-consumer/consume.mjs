import assert from 'node:assert/strict';
import {realpathSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PROJECTION_CAPABILITIES} from '@eosrio/hyperion-sdk/projection';
import {MarketplaceNotFoundError, readMarketplace} from '@eosrio/hyperion-atomicassets-plugin/atomicmarket/marketplace';

const resolved = fileURLToPath(import.meta.resolve('@eosrio/hyperion-atomicassets-plugin/atomicmarket/marketplace'));
assert.equal(realpathSync(resolved), realpathSync(join(process.cwd(), 'node_modules/@eosrio/hyperion-atomicassets-plugin/dist/atomicmarket/marketplace.js')));
assert.ok(PROJECTION_CAPABILITIES.includes('eq-filter'));
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
console.log(JSON.stringify({packedExport: resolved, successes: 1, compatibleMissingError: true, sdkRuntimeImport: true}));
