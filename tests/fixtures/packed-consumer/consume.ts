import {readMarketplace, type Marketplace, type MarketplaceReader}
  from '@eosrio/hyperion-atomicassets-plugin/atomicmarket/marketplace';
import type {ProjectionRollbackReadView} from '@eosrio/hyperion-sdk/projection';
import {formatAsset, type AtomicAssetInput, type AtomicValue}
  from '@eosrio/hyperion-atomicassets-plugin/atomicassets/asset';

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
