import {readMarketplace, type Marketplace, type MarketplaceReader}
  from '@eosrio/hyperion-atomicassets-plugin/atomicmarket/marketplace';
import type {ProjectionRollbackReadView} from '@eosrio/hyperion-sdk/projection';
import {formatAsset, type AtomicAssetInput, type AtomicValue}
  from '@eosrio/hyperion-atomicassets-plugin/atomicassets/asset';
import {createMarketplaceDefinition}
  from '@eosrio/hyperion-atomicassets-plugin/atomicmarket/marketplace-indexing';
import {formatSale, type AtomicSaleInput, type AtomicSaleState}
  from '@eosrio/hyperion-atomicassets-plugin/atomicmarket/sale';

declare const view: ProjectionRollbackReadView;
declare const reader: MarketplaceReader<ProjectionRollbackReadView>;

async function consumePublishedDeclarations() {
  const result = await readMarketplace(reader, view, 'atomicmarket', 'marketplace1');
  const revision: string = result.view.revision;
  const data: Marketplace = result.data;
  const creationBlock: string = data.created_at_block;
  // @ts-expect-error The published declaration must retain string creation metadata.
  const roundedCreationBlock: number = data.created_at_block;
  // @ts-expect-error The published query contract requires a textual contract name.
  await readMarketplace(reader, view, 123, 'marketplace1');
  return {revision, creationBlock, roundedCreationBlock};
}

void consumePublishedDeclarations;

const input: AtomicAssetInput = {contract: 'atomicassets', asset_id: '18446744073709551615', owner: null,
  schema: {format: [{name: 'name', type: 'string'}]}, mutable_data: {rank: 1, values: [false, null, '2']}};
const formatted = formatAsset(input);
const exactId: string = formatted.asset_id;
const metadata: AtomicValue | undefined = formatted.data.rank;
// @ts-expect-error IDs must remain exact strings in the public declaration.
const rounded: number = formatted.asset_id;
// @ts-expect-error A database-native or rounded numeric ID is not a structured asset input.
formatAsset({...input, asset_id: 9007199254740993});
// @ts-expect-error Metadata is structured JSON, not bigint values that cannot be serialized.
formatAsset({...input, immutable_data: {rank: 1n}});
void [exactId, metadata, rounded];

const definition = createMarketplaceDefinition({id: 'marketplaces', mappingRevision: 'a'.repeat(64),
  marketContract: 'atomicmarket', abiDeployment: 'original-deployment', abiSha256: 'b'.repeat(64)});
const contextualVersion: 2 = definition.schemaVersion;
const policy: 'delete' | 'incomplete' = definition.onAbsent;
// @ts-expect-error Original source cannot be implicitly replaced by a current snapshot.
createMarketplaceDefinition({id: 'marketplaces', initialization: {kind: 'snapshot'}});
void [contextualVersion, policy];

const saleInput: AtomicSaleInput = {market_contract: 'atomicmarket', assets_contract: 'atomicassets',
  sale_id: '9007199254740993', offer_id: '9007199254740994', seller: 'alice', buyer: null,
  sale_state: 1, offer_state: 0, raw_price: '9223372036854775807',
  price: {token_symbol: 'WAX', token_precision: 8}, assets: ['9007199254740997', formatted]};
const sale = formatSale(saleInput);
const exactSaleId: string = sale.sale_id;
const exactSalePrice: string | null | undefined = sale.price.amount;
const saleState: AtomicSaleState = sale.state;
// @ts-expect-error Sale identifiers must remain exact decimal strings.
formatSale({...saleInput, sale_id: 9007199254740993});
// @ts-expect-error Supplied price amounts must not be rounded numeric inputs.
formatSale({...saleInput, raw_price: 9007199254740993});
// @ts-expect-error The five-state API does not expose an additional sixth state.
const extraState: AtomicSaleState = 5;
void [exactSaleId, exactSalePrice, saleState, extraState];
