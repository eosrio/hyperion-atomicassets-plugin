import type {AtomicObject} from '../../atomicassets/asset.js';
import {PG_MAX, bool, fraction, hash, key, marketplace, object, read, source, strings, text, uint, unavailable,
  type FixedSaleContext, type SaleReader, type SaleStage, type SaleSourceEvidence} from './fixed-sale-port.js';

const priorities = {lognewbuyo:1020,cancelbuyo:1040,acceptbuyo:1040,declinebuyo:1040} as const;
export type BuyofferName = keyof typeof priorities;
export interface BuyofferOccurrence {
  readonly kind:'action'; readonly name:BuyofferName; readonly value:AtomicObject; readonly evidence:SaleSourceEvidence;
  /** Original action metadata, beside contract data; absence is never an empty list. */
  readonly authorization?: readonly {readonly actor:string; readonly permission:string}[];
}
const fields = ['market_contract','assets_contract','buyoffer_id','seller','buyer','price','token_symbol','maker_marketplace',
  'taker_marketplace','collection_name','collection_fee','state','memo','decline_memo','created_at_block','created_at_time',
  'updated_at_block','updated_at_time','asset_ids','asset_indices'] as const;
const maxAssets = 32;
const actionFields = {lognewbuyo:['buyoffer_id','buyer','recipient','price','asset_ids','memo','maker_marketplace','collection_name','collection_fee'],
  cancelbuyo:['buyoffer_id'],acceptbuyo:['buyoffer_id','expected_asset_ids','expected_price','taker_marketplace'],
  declinebuyo:['buyoffer_id','decline_memo']} as const;
const updated = (b:FixedSaleContext) => ({updated_at_block:b.blockNum,updated_at_time:b.blockTimeMs});
function price(v:unknown): {price:string;token_symbol:string} {
  const m = /^(0|[1-9][0-9]*)(?:\.([0-9]+))? ([A-Z]{1,7})$/.exec(text(v));
  if (!m) return unavailable('Unsupported buyoffer amount');
  const amount=BigInt(m[1]!+(m[2]??''));
  return {price:String(amount>PG_MAX?PG_MAX:amount),token_symbol:m[3]!};
}
function authorization(value:unknown): {actor:string;permission:string}[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value)!==Array.prototype || Object.getOwnPropertySymbols(value).length ||
    Object.keys(value).length!==value.length) return unavailable('Original buyoffer action authorization unavailable');
  return Array.from({length:value.length},(_,index)=>{
    const d=Object.getOwnPropertyDescriptor(value,String(index));
    if (!d || !('value' in d)) return unavailable('Authorization accessor unavailable');
    const v=object(d.value,['actor','permission']);
    return {actor:text(v.actor),permission:text(v.permission)};
  });
}
function indices(value:unknown):number[]{
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||Object.getOwnPropertySymbols(value).length||
    Object.keys(value).length!==value.length||Object.keys(value).some((name,index)=>name!==String(index))||value.length>maxAssets)
    return unavailable('Expected bounded dense buyoffer link indices');
  return Array.from({length:value.length},(_,index)=>{
    const d=Object.getOwnPropertyDescriptor(value,String(index));
    if(!d||!('value'in d)||typeof d.value!=='number'||!Number.isInteger(d.value)||d.value<1||d.value>maxAssets)
      return unavailable('Invalid buyoffer link index');
    return d.value;
  });
}
function assets(value:unknown):string[]{
  const ids=strings(value).map(v=>uint(v));
  if(ids.length===0)return unavailable('Empty buyoffer assets require qualified original storage-mode behavior');
  if(ids.length>maxAssets)return unavailable('Buyoffer asset-link bound exceeded');
  // The original direct INSERT and write-buffer paths differ for repeated PKs.
  if(new Set(ids).size!==ids.length)return unavailable('Duplicate buyoffer asset IDs require qualified original database behavior');
  return ids;
}
function links(old:AtomicObject|null,ids:readonly string[]):{asset_ids:string[];asset_indices:number[]}{
  const retained=new Map<string,number>();
  if(old){const positions=indices(old.asset_indices);strings(old.asset_ids).forEach((id,index)=>retained.set(id,positions[index]!));}
  ids.forEach((id,index)=>retained.set(id,index+1));
  if(retained.size>maxAssets)return unavailable('Buyoffer retained asset-link bound exceeded');
  const ordered=[...retained].sort((a,b)=>a[1]-b[1]);
  // The pinned SQL orders only by index. Never invent a tie-break for retained links.
  if(new Set(ordered.map(([,index])=>index)).size!==ordered.length)
    return unavailable('Ambiguous retained buyoffer asset-link order');
  return {asset_ids:ordered.map(([id])=>id),asset_indices:ordered.map(([,index])=>index)};
}
export function buyofferRecord(value:AtomicObject,market:string,id:string):AtomicObject {
  const row=object(value,fields);
  if (fields.some(f=>!Object.hasOwn(row,f)) || row.market_contract!==market || row.buyoffer_id!==id ||
    ![0,1,2,3].includes(row.state as number)) return unavailable('Incomplete or mismatched buyoffer row');
  for (const f of ['assets_contract','seller','buyer','token_symbol','collection_name']) text(row[f]);
  for (const f of ['buyoffer_id','price','created_at_block','created_at_time','updated_at_block','updated_at_time']) uint(row[f]);
  text(row.memo,true); if(row.decline_memo!==null)text(row.decline_memo,true);
  marketplace(row.maker_marketplace);marketplace(row.taker_marketplace);fraction(row.collection_fee);
  const assetIds=assets(row.asset_ids),assetIndices=indices(row.asset_indices);
  if(assetIds.length!==assetIndices.length||assetIndices.some((value,index)=>index>0&&value<=assetIndices[index-1]!))
    return unavailable('Invalid or ambiguous stored buyoffer asset-link order');
  return {...row,asset_ids:assetIds,asset_indices:assetIndices};
}

/** Action-derived original effects only. The caller discards its complete stage on any refusal. */
export async function reduceBuyoffers(b:FixedSaleContext,occurrences:readonly BuyofferOccurrence[],stage:SaleStage):Promise<void> {
  text(b.marketContract);text(b.assetsContract);uint(b.blockNum);uint(b.blockTimeMs);hash(b.blockId);
  if(b.contractVersion.version!=='1.2.2')return unavailable('Unsupported buyoffer contract version');
  const version=source({occurrence:b.contractVersion.occurrence,abiDeployment:b.contractVersion.abiDeployment,abiSha256:b.contractVersion.abiSha256});
  if(!Array.isArray(occurrences)||Object.getPrototypeOf(occurrences)!==Array.prototype||
    Object.keys(occurrences).length!==occurrences.length||Object.getOwnPropertySymbols(occurrences).length)
    return unavailable('Expected finite caller-bounded buyoffer occurrences');
  const context={...b,contractVersion:{...b.contractVersion}};
  // Capture every selected field before awaiting a relationship; invalid auth skips data exactly as original.
  const jobs=Array.from({length:occurrences.length},(_,index)=>{
    const d=Object.getOwnPropertyDescriptor(occurrences,String(index));
    if(!d||!('value'in d))return unavailable('Buyoffer occurrence accessor unavailable');
    const e=object(d.value,['kind','name','value','evidence','authorization']);
    if(e.kind!=='action'||typeof e.name!=='string'||!Object.hasOwn(priorities,e.name))return unavailable('Unsupported buyoffer occurrence');
    const name=e.name as BuyofferName,evidence=source(e.evidence);
    if(evidence.abiDeployment!==version.abiDeployment||evidence.abiSha256!==version.abiSha256)
      return unavailable('Buyoffer ABI differs from source-bound version');
    if(name==='lognewbuyo'&&authorization(e.authorization).some(a=>a.actor!==context.marketContract))return {name,index,skip:true,value:{}};
    const v=object(e.value,actionFields[name]),id=uint(v.buyoffer_id);
    let value:AtomicObject={buyoffer_id:id};
    if(name==='lognewbuyo'){
      const assetIds=assets(v.asset_ids);
      value={...value,buyer:text(v.buyer),seller:text(v.recipient),...price(v.price),asset_ids:assetIds,memo:text(v.memo,true),
        maker_marketplace:marketplace(v.maker_marketplace),collection_name:text(v.collection_name),collection_fee:fraction(v.collection_fee)};
    }else if(name==='declinebuyo')value={...value,decline_memo:text(v.decline_memo,true)};
    else if(name==='acceptbuyo')value={...value,taker_marketplace:v.taker_marketplace};
    return {name,index,skip:false,value};
  }).sort((a,z)=>priorities[a.name]-priorities[z.name]||a.index-z.index);
  for(const {name,value:v,skip}of jobs){
    if(skip)continue;
    const id=text(v.buyoffer_id),identity=key(context.marketContract,id),found=await read(stage,'market-buyoffer',identity);
    const old=found?buyofferRecord(found,context.marketContract,id):null;
    if(old&&old.assets_contract!==context.assetsContract)return unavailable('Buyoffer assets binding changed');
    if(name==='lognewbuyo'){
      stage.put('market-buyoffer',identity,{market_contract:context.marketContract,assets_contract:context.assetsContract,...v,
        ...links(old,strings(v.asset_ids)),taker_marketplace:null,state:0,decline_memo:null,...updated(context),created_at_block:context.blockNum,created_at_time:context.blockTimeMs});
    }else if(old){
      if(name==='acceptbuyo'&&old.state===3)continue;
      const change=name==='cancelbuyo'?{state:2}:name==='declinebuyo'?{state:1,decline_memo:v.decline_memo}:
        {state:3,taker_marketplace:marketplace(v.taker_marketplace)};
      stage.put('market-buyoffer',identity,{...old,...change,...updated(context)});
    }
  }
}
const selected=(v:unknown)=>v===null||v===undefined?null:text(v,true);
/** Original inner joins; the caller supplies one completed coherent view for all relationships. */
export async function assembleBuyofferLight(reader:SaleReader,market:string,id:string):Promise<AtomicObject|null>{
  text(market);uint(id);
  const found=await read(reader,'market-buyoffer',key(market,id));if(!found)return null;
  const row=buyofferRecord(found,market,id),assets=text(row.assets_contract),symbol=text(row.token_symbol);
  const collection=await read(reader,'collection',key(assets,text(row.collection_name)));if(!collection)return null;
  if(collection.contract!==assets||collection.collection_name!==row.collection_name)return unavailable('Mismatched buyoffer collection');
  const data=object(collection.data),currentFee=fraction(collection.market_fee);
  const joined:AtomicObject={collection_name:row.collection_name,name:selected(data.name),img:selected(data.img),images:selected(data.images),
    author:text(collection.author),allow_notify:bool(collection.allow_notify),authorized_accounts:strings(collection.authorized_accounts),
    notify_accounts:strings(collection.notify_accounts),market_fee:row.collection_fee,created_at_block:uint(collection.created_at_block),created_at_time:uint(collection.created_at_time)};
  const token=await read(reader,'market-token',key(market,symbol));if(!token)return null;
  if(token.market_contract!==market||token.token_symbol!==symbol||typeof token.token_precision!=='number'||
    !Number.isInteger(token.token_precision)||token.token_precision<0||token.token_precision>18)return unavailable('Mismatched buyoffer token');
  const tokenContract=text(token.token_contract),precision=token.token_precision;
  return {market_contract:market,assets_contract:assets,buyoffer_id:id,seller:row.seller,buyer:row.buyer,raw_price:row.price,
    raw_token_precision:precision,raw_token_symbol:symbol,price:{token_contract:tokenContract,token_symbol:symbol,token_precision:precision,amount:row.price},
    assets:row.asset_ids,maker_marketplace:row.maker_marketplace,taker_marketplace:row.taker_marketplace,collection_name:row.collection_name,
    collection:joined,buyoffer_state:row.state,memo:row.memo,decline_memo:row.decline_memo,updated_at_block:row.updated_at_block,
    updated_at_time:row.updated_at_time,created_at_block:row.created_at_block,created_at_time:row.created_at_time,current_collection_fee:currentFee};
}
export function formatBuyoffer(row:AtomicObject):AtomicObject{
  const {raw_price,raw_token_symbol:_symbol,raw_token_precision:_precision,collection_name:_collection,buyoffer_state,...v}=structuredClone(row);
  if(!Array.isArray(v.assets))return unavailable('Missing buyoffer asset fill');
  const state=buyoffer_state===0&&!v.assets.some(asset=>typeof asset!=='object'||asset===null||Array.isArray(asset)||asset.owner!==v.seller)?0:
    buyoffer_state===1?1:buyoffer_state===2?2:buyoffer_state===3?3:4;
  return {...v,price:{...object(v.price),amount:raw_price},state};
}
