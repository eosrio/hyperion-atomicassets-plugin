import {formatAsset} from '../../atomicassets/asset.js';
import {assembleAssetLightView} from '../../atomicassets/internal/lifecycle.js';
import type {AtomicObject} from '../../atomicassets/asset.js';
import {assembleAuctionLight,formatAuction} from './auctions.js';
import {strings,unavailable,type SaleReader} from './fixed-sale-port.js';

/** Original fillAuctions enrichment in the existing caller-owned coherent view. */
export async function readAuctionWithAssets(reader: SaleReader, market: string, id: string, nowMs: number | (() => number)): Promise<AtomicObject | null> {
  const row = await assembleAuctionLight(reader,market,id);
  if (!row) return null;
  // Original formats after the light query and before awaiting nested asset enrichment.
  const formatted = formatAuction(row,typeof nowMs === 'function' ? nowMs() : nowMs);
  const values = [];
  for (const assetId of strings(row.assets)) {
    const asset = await assembleAssetLightView(reader,String(row.assets_contract),assetId);
    if (asset && asset.template_id !== null) return unavailable('Auction template pricing is outside this component');
    values.push(asset === null ? assetId : formatAsset({...asset,sales:[],auctions:[]}));
  }
  return {...formatted,assets:values};
}
