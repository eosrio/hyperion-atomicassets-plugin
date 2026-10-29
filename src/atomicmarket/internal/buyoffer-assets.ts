import {formatAsset} from '../../atomicassets/asset.js';
import {assembleAssetLightView} from '../../atomicassets/internal/lifecycle.js';
import type {AtomicObject} from '../../atomicassets/asset.js';
import {assembleBuyofferLight,formatBuyoffer} from './buyoffers.js';
import {strings,unavailable,type SaleReader} from './fixed-sale-port.js';

/** Original fetchPrices enrichment; templated pricing remains unavailable until actual price sources exist. */
export async function readBuyofferWithAssets(reader:SaleReader,market:string,id:string):Promise<AtomicObject|null>{
  const row=await assembleBuyofferLight(reader,market,id);if(!row)return null;
  const values=[];
  for(const assetId of strings(row.assets)){
    const asset=await assembleAssetLightView(reader,String(row.assets_contract),assetId);
    if(asset&&asset.template_id!==null)return unavailable('Buyoffer template pricing is outside this component');
    values.push(asset===null?assetId:formatAsset({...asset,sales:[],auctions:[]}));
  }
  return formatBuyoffer({...row,assets:values});
}
