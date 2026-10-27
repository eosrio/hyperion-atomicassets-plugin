import {readMarketplace, type Marketplace, type MarketplaceReader}
  from '@eosrio/hyperion-atomicassets-plugin/atomicmarket/marketplace';
import type {ProjectionRollbackReadView} from '@eosrio/hyperion-sdk/projection';

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
