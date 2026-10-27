import type {AtomicObject} from '../../atomicassets/asset.js';
import {formatSale, type AtomicSale, type AtomicSaleInput} from '../sale.js';
import {PG_MAX, bool, fraction, hash, key, marketplace, object, read, source, strings, text, uint, unavailable,
  type FixedSaleAction, type FixedSaleContext, type FixedSaleOccurrence, type SaleReader, type SaleStage} from './fixed-sale-port.js';

const priorities = {lognewsale: 1020, logsalestart: 1040, cancelsale: 1040, purchasesale: 1040} as const;
const fields = {
  lognewsale: ['sale_id','seller','asset_ids','listing_price','settlement_symbol','maker_marketplace','collection_name','collection_fee'],
  logsalestart: ['sale_id','offer_id'], cancelsale: ['sale_id'],
  purchasesale: ['sale_id','buyer','intended_delphi_median','taker_marketplace'],
} as const;
const saleFields = ['market_contract','assets_contract','sale_id','seller','buyer','listing_price','final_price','listing_symbol',
  'settlement_symbol','offer_id','maker_marketplace','taker_marketplace','collection_name','collection_fee','state',
  'updated_at_block','updated_at_time','created_at_block','created_at_time'] as const;
const updated = (b: FixedSaleContext) => ({updated_at_block: b.blockNum, updated_at_time: b.blockTimeMs});

/** Logical dependencies only. No native joins, lookup syntax or SDK capability activation. */
export const FIXED_SALE_RELATIONSHIPS = [
  {kind: 'market-sale', keys: ['marketContract','saleId'], role: 'durable domain state'},
  {kind: 'offer', keys: ['assetsContract','offerId'], role: 'current inner join'},
  {kind: 'collection', keys: ['assetsContract','collectionName'], role: 'current inner join'},
  {kind: 'market-token', keys: ['marketContract','settlementSymbol'], role: 'current inner join'},
  {kind: 'symbol-pair', keys: ['marketContract','listingSymbol','settlementSymbol'], role: 'covered absence required in this subset'},
  {kind: 'offer-assets', keys: ['assetsContract','offerId'], role: 'current asset identifiers; enrichment remains separate'},
  {kind: 'contract-code', keys: ['seller'], role: 'current existence predicate'},
] as const;

function context(value: FixedSaleContext): FixedSaleContext {
  const b = object(value, ['marketContract','assetsContract','blockNum','blockTimeMs','blockId','contractVersion']);
  const v = object(b.contractVersion, ['version','occurrence','abiDeployment','abiSha256']);
  if (v.version !== '1.2.2') return unavailable('Unsupported or unknown contract version');
  const blockTimeMs = uint(b.blockTimeMs);
  if (BigInt(blockTimeMs) > 8640000000000000n) return unavailable('Invalid normalized block time');
  return {marketContract: text(b.marketContract), assetsContract: text(b.assetsContract), blockNum: uint(b.blockNum), blockTimeMs,
    blockId: hash(b.blockId), contractVersion: {version: '1.2.2', occurrence: text(v.occurrence),
      abiDeployment: text(v.abiDeployment), abiSha256: hash(v.abiSha256)}};
}
function price(value: unknown): {amount: string; symbol: string} {
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]+))? ([A-Z]{1,7})$/.exec(text(value));
  if (!match) return unavailable('Unsupported listing amount');
  const exact = BigInt(match[1]! + (match[2] ?? ''));
  return {amount: String(exact > PG_MAX ? PG_MAX : exact), symbol: match[3]!};
}
function settlement(value: unknown): string {
  const match = /^([0-9]{1,2}),([A-Z]{1,7})$/.exec(text(value));
  if (!match || Number(match[1]) > 18) return unavailable('Unsupported settlement symbol');
  return match[2]!;
}
function buyer(value: unknown): string | null {return value === null ? null : text(value);}

function capture(event: unknown, b: FixedSaleContext): {name: FixedSaleAction; value: AtomicObject} {
  const e = object(event, ['kind','contract','name','transactionId','evidence','value']);
  if (e.kind !== 'action' || typeof e.name !== 'string' || !Object.hasOwn(priorities, e.name))
    return unavailable('Unsupported primitive sale action discriminant');
  const name = e.name as FixedSaleAction;
  if (text(e.contract) !== b.marketContract) return unavailable('Wrong market contract');
  hash(e.transactionId);
  const s = source(e.evidence);
  if (s.abiDeployment !== b.contractVersion.abiDeployment || s.abiSha256 !== b.contractVersion.abiSha256)
    return unavailable('Action ABI does not match supplied version evidence');
  const v = object(e.value, fields[name]), id = uint(v.sale_id);
  if (name === 'lognewsale') {
    const assetIds = strings(v.asset_ids);
    if (assetIds.length !== 1) return unavailable('Bundles are outside the fixed single-asset subset');
    uint(assetIds[0]);
    const listing = price(v.listing_price), symbol = settlement(v.settlement_symbol);
    if (listing.symbol !== symbol) return unavailable('Currency conversion is outside the fixed-sale subset');
    return {name, value: {sale_id: id, seller: text(v.seller), listing_price: listing.amount, listing_symbol: listing.symbol,
      settlement_symbol: symbol, maker_marketplace: marketplace(v.maker_marketplace),
      collection_name: text(v.collection_name), collection_fee: fraction(v.collection_fee)}};
  }
  if (name === 'logsalestart') return {name, value: {sale_id: id, offer_id: uint(v.offer_id)}};
  if (name === 'cancelsale') return {name, value: {sale_id: id}};
  return {name, value: {sale_id: id, buyer: buyer(v.buyer), intended_delphi_median: uint(v.intended_delphi_median, 18446744073709551615n),
    taker_marketplace: marketplace(v.taker_marketplace)}};
}
function saleRecord(value: AtomicObject, market: string, id: string): AtomicObject {
  const row = object(value, saleFields);
  if (saleFields.some(field => !Object.hasOwn(row,field))) return unavailable('Incomplete sale record');
  if (row.market_contract !== market || row.sale_id !== id || typeof row.state !== 'number' || ![0,1,2,3].includes(row.state))
    return unavailable('Malformed or mismatched sale row');
  for (const field of ['assets_contract','seller','listing_symbol','settlement_symbol','collection_name']) text(row[field]);
  for (const field of ['sale_id','listing_price','created_at_block','created_at_time','updated_at_block','updated_at_time']) uint(row[field]);
  buyer(row.buyer); marketplace(row.maker_marketplace); marketplace(row.taker_marketplace); fraction(row.collection_fee);
  if (row.final_price !== null) uint(row.final_price);
  if (row.offer_id !== null) uint(row.offer_id);
  if (row.listing_symbol !== row.settlement_symbol) return unavailable('Unsupported converted sale record');
  return {...row};
}

/** INTERNAL domain effects only. On any throw the caller must discard its entire staging view. */
export async function reduceFixedSales(value: FixedSaleContext, occurrences: readonly FixedSaleOccurrence[], stage: SaleStage): Promise<void> {
  const b = context(value);
  if (!Array.isArray(occurrences) || Object.getPrototypeOf(occurrences) !== Array.prototype ||
    Object.getOwnPropertySymbols(occurrences).length || Object.keys(occurrences).length !== occurrences.length)
    return unavailable('Expected finite caller-bounded occurrence array');
  // Read descriptors, never caller getters; detach every consumed leaf before the first await.
  const jobs = Array.from({length: occurrences.length}, (_, index) => {
    const d = Object.getOwnPropertyDescriptor(occurrences, String(index));
    if (!d || !('value' in d)) return unavailable('Unexpected occurrence accessor or sparse array');
    return {...capture(d.value, b), index};
  }).sort((a,z) => priorities[a.name] - priorities[z.name] || a.index - z.index);
  for (const {name,value: v} of jobs) {
    const identity = key(b.marketContract, text(v.sale_id));
    if (name === 'lognewsale') {
      stage.put('market-sale', identity, {market_contract: b.marketContract, assets_contract: b.assetsContract,
        sale_id: v.sale_id, seller: v.seller, buyer: null, listing_price: v.listing_price, final_price: null,
        listing_symbol: v.listing_symbol, settlement_symbol: v.settlement_symbol, offer_id: null,
        maker_marketplace: v.maker_marketplace, taker_marketplace: null, collection_name: v.collection_name,
        collection_fee: v.collection_fee, state: 0, ...updated(b), created_at_block: b.blockNum, created_at_time: b.blockTimeMs});
      continue;
    }
    const existing = await read(stage, 'market-sale', identity);
    if (!existing) continue; // Actual original UPDATE / purchase behavior for covered absence.
    const old = saleRecord(existing, b.marketContract, text(v.sale_id));
    if (old.assets_contract !== b.assetsContract) return unavailable('Unsupported assets-contract binding change');
    if (name === 'logsalestart') stage.put('market-sale', identity, {...old, state: 1, offer_id: v.offer_id, ...updated(b)});
    else if (name === 'cancelsale') stage.put('market-sale', identity, {...old, state: 2, ...updated(b)});
    else if (name === 'purchasesale') {
      if (old.state === 3) continue; // Preserve the first settlement, before evaluating any conversion branch.
      if (v.intended_delphi_median !== '0') return unavailable('Delphi conversion is outside the fixed-sale subset');
      stage.put('market-sale', identity, {...old, state: 3, buyer: v.buyer, final_price: old.listing_price,
        taker_marketplace: v.taker_marketplace, ...updated(b)});
    } else return unavailable('Unsupported sale action');
  }
}

function selectedText(value: unknown): string | null {return value === undefined || value === null ? null : text(value, true);}
function precision(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 18 ? value : unavailable('Unsupported token precision');
}
function currentCollection(row: AtomicObject): AtomicObject {
  const data = object(row.data);
  return {contract: text(row.contract), collection_name: text(row.collection_name), name: selectedText(data.name), img: selectedText(data.img),
    images: selectedText(data.images), author: text(row.author), allow_notify: bool(row.allow_notify),
    authorized_accounts: strings(row.authorized_accounts), notify_accounts: strings(row.notify_accounts), market_fee: fraction(row.market_fee),
    created_at_block: uint(row.created_at_block), created_at_time: uint(row.created_at_time)};
}

/** Restricted SQL light boundary, before fillSales enrichment. null means proven SQL-row absence, not an HTTP status. */
export async function assembleFixedSaleLight(reader: SaleReader, market: string, saleId: string): Promise<AtomicSaleInput | null> {
  text(market); uint(saleId);
  const existing = await read(reader, 'market-sale', key(market,saleId));
  if (!existing) return null;
  const sale = saleRecord(existing,market,saleId), assets = text(sale.assets_contract);
  if (sale.offer_id === null) return null; // SQL equality on NULL cannot satisfy the inner offer join.
  const offerId = uint(sale.offer_id), collectionName = text(sale.collection_name), symbol = text(sale.settlement_symbol);
  const offer = await read(reader,'offer',key(assets,offerId));
  if (!offer) return null;
  const collectionRow = await read(reader,'collection',key(assets,collectionName));
  if (!collectionRow) return null;
  const collection = currentCollection(collectionRow); // Detach nested values before subsequent awaited lookups.
  const token = await read(reader,'market-token',key(market,symbol));
  if (!token) return null;
  if (offer.contract !== assets || offer.offer_id !== offerId || collection.contract !== assets || collection.collection_name !== collectionName ||
    token.market_contract !== market || token.token_symbol !== symbol) return unavailable('Mismatched current relationship');
  if (offer.state !== null && (typeof offer.state !== 'number' || !Number.isInteger(offer.state))) return unavailable('Malformed offer state');
  if (await read(reader,'symbol-pair',key(market,text(sale.listing_symbol),symbol)) !== null)
    return unavailable('Current Delphi relationships are outside this light-view subset');
  const links = await read(reader,'offer-assets',key(assets,offerId));
  if (links && (links.contract !== assets || links.offer_id !== offerId)) return unavailable('Mismatched offer asset links');
  const assetIds = links ? strings(links.asset_ids).map(id => uint(id)) : [];
  if (assetIds.length > 1) return unavailable('Bundle light views are outside this subset');
  const sellerCode = await read(reader,'contract-code',key(text(sale.seller)));
  if (sellerCode && sellerCode.account !== sale.seller) return unavailable('Mismatched seller code record');
  return {market_contract: market, assets_contract: assets, sale_id: saleId, seller: text(sale.seller), buyer: buyer(sale.buyer), offer_id: offerId,
    raw_price: sale.final_price === null ? text(sale.listing_price) : text(sale.final_price), raw_token_precision: precision(token.token_precision),
    raw_token_symbol: symbol, price: {token_contract: text(token.token_contract), token_symbol: symbol, token_precision: precision(token.token_precision), median: null},
    listing_price: sale.listing_price, listing_symbol: sale.listing_symbol, assets: assetIds,
    maker_marketplace: sale.maker_marketplace, taker_marketplace: sale.taker_marketplace, collection_name: collectionName,
    collection: {collection_name: collectionName, name: collection.name, img: collection.img, images: collection.images,
      author: text(collection.author), allow_notify: bool(collection.allow_notify), authorized_accounts: strings(collection.authorized_accounts),
      notify_accounts: strings(collection.notify_accounts), market_fee: fraction(sale.collection_fee), created_at_block: uint(collection.created_at_block),
      created_at_time: uint(collection.created_at_time)}, sale_state: sale.state as number, offer_state: offer.state as number | null,
    is_seller_contract: sellerCode !== null, updated_at_block: sale.updated_at_block, updated_at_time: sale.updated_at_time,
    created_at_block: sale.created_at_block, created_at_time: sale.created_at_time, current_collection_fee: fraction(collection.market_fee)};
}

/** Internal formatted light result only: asset enrichment, the full API route and authority remain open. */
export async function readFixedSaleLight(reader: SaleReader, market: string, saleId: string): Promise<AtomicSale | null> {
  const row = await assembleFixedSaleLight(reader,market,saleId);
  return row === null ? null : formatSale(row);
}
