import type {AtomicObject} from '../../atomicassets/asset.js';
import {PG_MAX, bool, fraction, hash, key, marketplace, object, read, source, strings, text, uint, unavailable,
  type FixedSaleContext, type SaleReader, type SaleStage, type SaleSourceEvidence} from './fixed-sale-port.js';

const priorities = {lognewauct:1020, auctions:1030, logauctstart:1040, cancelauct:1040,
  auctionbid:1040, auctclaimbuy:1040, auctclaimsel:1040} as const;
export type AuctionName = keyof typeof priorities;
export interface AuctionOccurrence {
  readonly kind: 'action' | 'table'; readonly name: AuctionName; readonly transactionId?: string;
  readonly present?: boolean; readonly value: AtomicObject; readonly evidence: SaleSourceEvidence;
}
const fields = ['market_contract','assets_contract','auction_id','seller','buyer','price','token_symbol','maker_marketplace',
  'taker_marketplace','collection_name','collection_fee','claimed_by_buyer','claimed_by_seller','state','end_time',
  'created_at_block','created_at_time','updated_at_block','updated_at_time','asset_ids','bids'] as const;
const actionFields = {lognewauct:['auction_id','seller','asset_ids','starting_bid','duration','end_time','maker_marketplace','collection_name','collection_fee'],
  logauctstart:['auction_id'],cancelauct:['auction_id'],auctionbid:['auction_id','bidder','bid','taker_marketplace'],
  auctclaimbuy:['auction_id'],auctclaimsel:['auction_id'],auctions:['auction_id','seller','asset_ids','end_time','assets_transferred',
    'current_bid','current_bidder','claimed_by_seller','claimed_by_buyer','maker_marketplace','taker_marketplace','collection_fee','collection_name']} as const;
const updated = (b: FixedSaleContext) => ({updated_at_block:b.blockNum,updated_at_time:b.blockTimeMs});
function seconds(v: unknown): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 4294967295 ? v : unavailable('Expected uint32 auction time');
}
function price(v: unknown): {price:string; token_symbol:string} {
  const m = /^(0|[1-9][0-9]*)(?:\.([0-9]+))? ([A-Z]{1,7})$/.exec(text(v));
  if (!m) return unavailable('Unsupported auction amount');
  const amount = BigInt(m[1]! + (m[2] ?? ''));
  return {price:String(amount > PG_MAX ? PG_MAX : amount),token_symbol:m[3]!};
}
function nullable(v: unknown): string | null {return v === null ? null : text(v);}
function bids(v: unknown): AtomicObject[] {
  if (!Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype || Object.getOwnPropertySymbols(v).length ||
    Object.keys(v).length !== v.length) return unavailable('Expected complete ordered auction bids');
  return Array.from({length:v.length},(_,i) => {
    const d = Object.getOwnPropertyDescriptor(v,String(i));
    if (!d || !('value' in d)) return unavailable('Unexpected bid accessor');
    const row = object(d.value,['number','account','amount','created_at_block','created_at_time','txid']);
    if (row.number !== i+1 || i >= 2147483647) return unavailable('Incomplete auction bid sequence');
    return {number:i+1,account:text(row.account),amount:uint(row.amount),created_at_block:uint(row.created_at_block),
      created_at_time:uint(row.created_at_time),txid:hash(row.txid)};
  });
}
export function auctionRecord(v: AtomicObject, market: string, id: string): AtomicObject {
  const row = object(v,fields);
  if (fields.some(f=>!Object.hasOwn(row,f)) || row.market_contract !== market || row.auction_id !== id ||
    ![0,1,2].includes(row.state as number)) return unavailable('Incomplete or mismatched auction row');
  for (const f of ['assets_contract','seller','token_symbol','collection_name']) text(row[f]);
  for (const f of ['auction_id','price','created_at_block','created_at_time','updated_at_block','updated_at_time']) uint(row[f]);
  nullable(row.buyer); marketplace(row.maker_marketplace); marketplace(row.taker_marketplace); fraction(row.collection_fee);
  bool(row.claimed_by_buyer); bool(row.claimed_by_seller); seconds(row.end_time);
  const assetIds = strings(row.asset_ids).map(v=>uint(v));
  if (assetIds.length !== 1) return unavailable('Auction bundles are outside this component');
  return {...row,asset_ids:assetIds,bids:bids(row.bids)};
}

/** Original priorities and domain effects. The caller discards the entire stage on any failure. */
export async function reduceAuctions(b: FixedSaleContext, occurrences: readonly AuctionOccurrence[], stage: SaleStage): Promise<void> {
  text(b.marketContract); text(b.assetsContract); uint(b.blockNum); uint(b.blockTimeMs); hash(b.blockId);
  if (b.contractVersion.version !== '1.2.2') return unavailable('Unsupported auction contract version');
  const version = source({occurrence:b.contractVersion.occurrence,abiDeployment:b.contractVersion.abiDeployment,abiSha256:b.contractVersion.abiSha256});
  if (!Array.isArray(occurrences) || Object.getPrototypeOf(occurrences) !== Array.prototype ||
    Object.keys(occurrences).length !== occurrences.length || Object.getOwnPropertySymbols(occurrences).length)
    return unavailable('Expected finite caller-bounded auction occurrences');
  // Capture all data before the first await, just as the existing domain reducers do.
  const context = {...b,contractVersion:{...b.contractVersion}};
  const jobs = Array.from({length:occurrences.length},(_,i) => {
    const d = Object.getOwnPropertyDescriptor(occurrences,String(i));
    if (!d || !('value' in d)) return unavailable('Unexpected auction occurrence accessor');
    const e = object(d.value,['kind','name','transactionId','present','value','evidence']);
    if (typeof e.name !== 'string' || !Object.hasOwn(priorities,e.name)) return unavailable('Unsupported auction occurrence');
    const name = e.name as AuctionName;
    if (e.kind !== (name === 'auctions' ? 'table' : 'action')) return unavailable('Invalid auction occurrence kind');
    if (name === 'auctions') bool(e.present); else hash(e.transactionId);
    const evidence = source(e.evidence);
    if (evidence.abiDeployment !== version.abiDeployment || evidence.abiSha256 !== version.abiSha256)
      return unavailable('Auction ABI differs from source-bound version');
    const v = object(e.value,actionFields[name]), id = uint(v.auction_id);
    let value: AtomicObject = {auction_id:id};
    if (name === 'lognewauct') {
      const assetIds = strings(v.asset_ids).map(v=>uint(v));
      if (assetIds.length !== 1) return unavailable('Auction bundles are outside this component');
      value = {...value,seller:text(v.seller),asset_ids:assetIds,...price(v.starting_bid),end_time:seconds(v.end_time),
        maker_marketplace:marketplace(v.maker_marketplace),collection_name:text(v.collection_name),collection_fee:fraction(v.collection_fee)};
    } else if (name === 'auctions') value = {...value,end_time:seconds(v.end_time)};
    else if (name === 'auctionbid') value = {...value,buyer:text(v.bidder),...price(v.bid),taker_marketplace:marketplace(v.taker_marketplace)};
    return {name,value,transactionId:e.transactionId as string,index:i};
  }).sort((a,z)=>priorities[a.name]-priorities[z.name] || a.index-z.index);
  for (const {name,value:v,transactionId} of jobs) {
    const identity = key(context.marketContract,text(v.auction_id));
    const found = await read(stage,'market-auction',identity);
    const old = found ? auctionRecord(found,context.marketContract,text(v.auction_id)) : null;
    if (old && old.assets_contract !== context.assetsContract) return unavailable('Auction assets binding changed');
    if (name === 'lognewauct') {
      // Original upsert retains previous bid rows and link rows. A changed link would become a bundle.
      if (old && strings(old.asset_ids)[0] !== strings(v.asset_ids)[0]) return unavailable('Repeated auction creates a retained bundle');
      stage.put('market-auction',identity,{market_contract:context.marketContract,assets_contract:context.assetsContract,
        ...v,buyer:null,taker_marketplace:null,claimed_by_buyer:false,claimed_by_seller:false,state:0,bids:old?.bids ?? [],
        ...updated(context),created_at_block:context.blockNum,created_at_time:context.blockTimeMs});
    } else if (!old) {
      // Original bid INSERT still runs after an absent UPDATE, then its deferred FK rejects the commit.
      if (name === 'auctionbid') return unavailable('Auction bid has no parent auction');
    } else if (name === 'auctionbid') {
      const history = bids(old.bids);
      if (history.length >= 2147483647) return unavailable('Auction bid sequence overflow');
      stage.put('market-auction',identity,{...old,...v,bids:[...history,{number:history.length+1,account:v.buyer,amount:v.price,
        created_at_block:context.blockNum,created_at_time:context.blockTimeMs,txid:transactionId}],...updated(context)});
    } else {
      const change = name === 'auctions' ? {end_time:v.end_time} : name === 'logauctstart' ? {state:1} :
        name === 'cancelauct' ? {state:2} : name === 'auctclaimbuy' ? {claimed_by_buyer:true} : {claimed_by_seller:true};
      stage.put('market-auction',identity,{...old,...change,...updated(context)});
    }
  }
}

const selected = (v:unknown) => v === null || v === undefined ? null : text(v,true);
/** Source-derived view assembly; every lookup must use the caller's same fenced read view. */
export async function assembleAuctionLight(reader: SaleReader, market: string, id: string): Promise<AtomicObject | null> {
  text(market); uint(id);
  const found = await read(reader,'market-auction',key(market,id));
  if (!found) return null;
  const a = auctionRecord(found,market,id), assets = text(a.assets_contract), symbol = text(a.token_symbol);
  const collection = await read(reader,'collection',key(assets,text(a.collection_name)));
  if (!collection) return null;
  if (collection.contract !== assets || collection.collection_name !== a.collection_name) return unavailable('Mismatched auction collection');
  const data = object(collection.data), currentFee = fraction(collection.market_fee);
  const joined: AtomicObject = {collection_name:a.collection_name,name:selected(data.name),img:selected(data.img),images:selected(data.images),
    author:text(collection.author),allow_notify:bool(collection.allow_notify),authorized_accounts:strings(collection.authorized_accounts),
    notify_accounts:strings(collection.notify_accounts),market_fee:a.collection_fee,created_at_block:uint(collection.created_at_block),created_at_time:uint(collection.created_at_time)};
  const token = await read(reader,'market-token',key(market,symbol));
  if (!token) return null;
  if (token.market_contract !== market || token.token_symbol !== symbol || typeof token.token_precision !== 'number' ||
    !Number.isInteger(token.token_precision) || token.token_precision < 0 || token.token_precision > 18) return unavailable('Mismatched auction token');
  const tokenContract = text(token.token_contract), precision = token.token_precision;
  const code = await read(reader,'contract-code',key(text(a.seller)));
  if (code && code.account !== a.seller) return unavailable('Mismatched auction seller code');
  return {market_contract:market,assets_contract:assets,auction_id:id,seller:a.seller,buyer:a.buyer,raw_price:a.price,
    raw_token_precision:precision,raw_token_symbol:symbol,price:{token_contract:tokenContract,token_symbol:symbol,token_precision:precision,amount:a.price},
    assets:a.asset_ids,bids:a.bids,maker_marketplace:a.maker_marketplace,taker_marketplace:a.taker_marketplace,
    claimed_by_buyer:a.claimed_by_buyer,claimed_by_seller:a.claimed_by_seller,collection_name:a.collection_name,collection:joined,
    auction_state:a.state,end_time:a.end_time,is_seller_contract:code !== null,updated_at_block:a.updated_at_block,updated_at_time:a.updated_at_time,
    created_at_block:a.created_at_block,created_at_time:a.created_at_time,current_collection_fee:currentFee};
}

/** Original single-asset formatter with explicit read time; no clock in deterministic reduction. */
export function formatAuction(row: AtomicObject, nowMs: number): AtomicObject {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) return unavailable('Invalid auction read time');
  const {raw_price,raw_token_symbol: _symbol,raw_token_precision: _precision,collection_name: _collection,auction_state,...v} = structuredClone(row);
  const end = seconds(v.end_time), price = object(v.price);
  const state = auction_state === 0 ? 0 : auction_state === 1 && end > nowMs/1000 ? 1 : auction_state === 2 ? 2 :
    auction_state === 1 && end <= nowMs/1000 && v.buyer !== null ? 3 : 4;
  return {...v,price:{...price,amount:raw_price},state,end_time:String(end*1000)};
}
