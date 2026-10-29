import {formatAsset} from '../../atomicassets/asset.js';
import {assembleAssetLightView} from '../../atomicassets/internal/lifecycle.js';
import {unavailable} from '../../atomicassets/internal/lifecycle-port.js';
import type {AtomicSale} from '../sale.js';
import {formatSale} from '../sale.js';
import {assembleFixedSaleLight} from './fixed-sale.js';
import {strings, type SaleReader} from './fixed-sale-port.js';

/**
 * Private untemplated sale-ID composition, corresponding to original fillSales.
 * The caller supplies one fenced coherent view for the sale and every asset lookup.
 * This opens no views and grants no HTTP, template/pricing or source authority.
 */
export async function readFixedSaleWithAssets(reader: SaleReader, market: string, saleId: string): Promise<AtomicSale | null> {
  const sale = await assembleFixedSaleLight(reader, market, saleId);
  if (sale === null) return null;
  const assets = [];
  for (const assetId of strings(sale.assets)) {
    const asset = await assembleAssetLightView(reader, sale.assets_contract, assetId);
    if (asset?.template) unavailable('Templated sale price enrichment requires actual template-price state');
    // Original AssetFiller retains unresolved IDs only when the view row is absent.
    // Unknown coverage and unsupported templates propagate their existing errors.
    assets.push(asset === null ? assetId : formatAsset({...asset, sales: [], auctions: []}));
  }
  // fillSales enables fetchPrices only. Its untemplated hook supplies these two
  // arrays, while prices/template_buyoffers stay absent; this is not a default
  // for a templated asset or an unavailable relationship.
  return formatSale({...sale, assets});
}
