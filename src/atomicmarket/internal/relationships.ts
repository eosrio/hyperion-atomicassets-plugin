import type {AtomicObject} from '../../atomicassets/asset.js';
import type {DomainStage} from '../../atomicassets/internal/lifecycle-port.js';
import {record} from '../../atomicassets/internal/lifecycle-port.js';
import {key, read, strings, text, uint, unavailable} from './fixed-sale-port.js';

export interface RelationBlock {readonly assets: string; readonly market: string; readonly blockNum: string; readonly timeMs: string}
export interface OfferOccurrence {readonly name: string; readonly value: AtomicObject}
const offerNames = ['lognewoffer','acceptoffer','declineoffer','canceloffer'];
export const isOfferAction = (name: string): boolean => offerNames.includes(name);
const terminal = {acceptoffer: 3, declineoffer: 4, canceloffer: 5} as const;
const timestamp = (b: RelationBlock) => ({updated_at_block: b.blockNum, updated_at_time: b.timeMs});
function offerIdentity(row: AtomicObject, b: RelationBlock, id: string): void {
  if (row.contract !== b.assets || row.offer_id !== id || typeof row.state !== 'number'
    || !Number.isInteger(row.state) || row.state < 0 || row.state > 5) unavailable('Mismatched offer identity/state');
}

/** Priority 80 creates / 90 terminal updates. The existing SDK owns discard and bounds. */
export async function reduceOffers(b: RelationBlock, input: readonly OfferOccurrence[], stage: DomainStage): Promise<void> {
  const jobs = input.map((e, index) => ({name: e.name, value: record(e.value), index}));
  jobs.sort((a,z) => Number(a.name !== 'lognewoffer') - Number(z.name !== 'lognewoffer') || a.index - z.index);
  for (const {name,value} of jobs) {
    const id = uint(value.offer_id), identity = key(b.assets,id);
    if (name === 'lognewoffer') {
      const sender = text(value.sender), recipient = text(value.recipient);
      const left = strings(value.sender_asset_ids).map(id => uint(id)), right = strings(value.recipient_asset_ids).map(id => uint(id));
      if (left.length + right.length !== 1) unavailable('Offer bundles/exchanges are outside the single-asset sale subset');
      const assetIds = [...left,...right], owners = [...left.map(() => sender),...right.map(() => recipient)];
      const previous = await read(stage,'offer-assets',identity);
      if (previous && (previous.contract !== b.assets || previous.offer_id !== id)) unavailable('Mismatched offer link identity');
      const previousIds = previous ? strings(previous.asset_ids) : null;
      if (previousIds && (previousIds.length !== 1 || previousIds[0] !== assetIds[0]))
        unavailable('Repeated offer would retain additional original asset links outside this subset');
      stage.put('offer',identity,{contract:b.assets,offer_id:id,sender,recipient,memo:text(value.memo,true).slice(0,256),
        state:0,...timestamp(b),created_at_block:b.blockNum,created_at_time:b.timeMs});
      stage.put('offer-assets',identity,{contract:b.assets,offer_id:id,asset_ids:assetIds,owners});
      const assetId = assetIds[0]!, reverseKey = key(b.assets,assetId), old = await read(stage,'asset-offers',reverseKey);
      const ids = old ? strings(old.offer_ids) : [];
      if (old && (old.contract !== b.assets || old.asset_id !== assetId || new Set(ids).size !== ids.length))
        unavailable('Mismatched reverse offer index');
      if (!ids.includes(id)) ids.push(id);
      // SDK value/array/read/candidate bounds make a hot asset fail explicitly, never truncate.
      stage.put('asset-offers',reverseKey,{contract:b.assets,asset_id:assetId,offer_ids:ids});
    } else {
      if (!Object.hasOwn(terminal,name)) unavailable('Unsupported offer action');
      const old = await read(stage,'offer',identity);
      if (old) {offerIdentity(old,b,id);stage.put('offer',identity,{...old,state:terminal[name as keyof typeof terminal],...timestamp(b)});}
    }
  }
}

/** Original onCommit validity pass after all domain jobs. Missing assets do not match its inner join. */
export async function finishOfferMoves(b: RelationBlock, moved: readonly string[], stage: DomainStage): Promise<void> {
  const affected = new Set<string>();
  for (const assetId of new Set(moved.map(id => uint(id)))) {
    const index = await read(stage,'asset-offers',key(b.assets,assetId));
    if (index && (index.contract !== b.assets || index.asset_id !== assetId)) unavailable('Mismatched reverse offer index');
    if (index) for (const offerId of strings(index.offer_ids)) affected.add(uint(offerId));
  }
  for (const id of affected) {
    const identity = key(b.assets,id), offer = await read(stage,'offer',identity);
    if (offer) offerIdentity(offer,b,id);
    if (!offer || offer.state !== 0 && offer.state !== 1) continue;
    const links = await read(stage,'offer-assets',identity);
    if (!links || links.contract !== b.assets || links.offer_id !== id) unavailable('Missing offer relationship index');
    const ids = strings(links.asset_ids), owners = strings(links.owners);
    if (ids.length !== 1 || owners.length !== ids.length) unavailable('Unsupported offer relationship cardinality');
    let invalid = false;
    for (let i=0;i<ids.length;i++) {
      const asset = await read(stage,'asset',key(b.assets,uint(ids[i])));
      if (asset && (asset.contract !== b.assets || asset.asset_id !== ids[i])) unavailable('Mismatched linked asset identity');
      if (asset && (asset.owner === null || text(asset.owner) !== owners[i])) invalid = true;
    }
    if (invalid && offer.state === 0) stage.put('offer',identity,{...offer,state:1,...timestamp(b)});
    // Restoring ownership changes state only, retaining the original invalidation timestamp.
    if (!invalid && offer.state === 1) stage.put('offer',identity,{...offer,state:0});
  }
}

/** Original config's length trigger, insert-error and retain-on-removal semantics, no price model. */
export async function reduceMarketConfig(b: RelationBlock, value: AtomicObject, evidence: AtomicObject, stage: DomainStage): Promise<void> {
  if (value.version !== '1.2.2' || value.atomicassets_account !== b.assets) unavailable('Unsupported market config/version/assets contract');
  if (!Array.isArray(value.supported_tokens) || !Array.isArray(value.supported_symbol_pairs)) unavailable('Missing actual market token/pair config');
  if (value.supported_symbol_pairs.length) unavailable('Symbol-pair pricing is outside the same-currency sale subset');
  const incoming = value.supported_tokens.map(record), previous = await read(stage,'market-config',key(b.market));
  if (previous && previous.market_contract !== b.market) unavailable('Mismatched market config identity/new source projection required');
  const old = previous ? previous.supported_tokens : [];
  if (!Array.isArray(old)) unavailable('Market config requires a new complete source projection');
  if (old.length !== incoming.length) {
    const symbols = old.map(row => text(record(row).token_symbol).split(',')[1]);
    for (const token of incoming) {
      const match = /^(0|[1-9][0-9]*),([A-Z]{1,7})$/.exec(text(token.token_symbol));
      if (!match || Number(match[1]) > 18) unavailable('Unsupported token symbol');
      const symbol = match![2]!, precision = Number(match![1]);
      const retained = symbols.indexOf(symbol);
      if (retained === -1) {
        const identity = key(b.market,symbol);
        if (await read(stage,'market-token',identity)) unavailable('Original market token insert conflicts with retained token');
        stage.put('market-token',identity,{market_contract:b.market,token_contract:text(token.token_contract),
          token_symbol:symbol,token_precision:precision});
      } else symbols.splice(retained,1);
    }
  }
  stage.put('market-config',key(b.market),{market_contract:b.market,version:value.version,...evidence,supported_tokens:incoming,supported_symbol_pairs:[]});
}

/** The original receiver records setcode presence even for empty code; it never erases that row. */
export async function reduceContractCode(value: AtomicObject, stage: DomainStage): Promise<void> {
  const account = text(value.account), identity = key(account);
  const old = await read(stage,'contract-code',identity);
  if (old && old.account !== account) unavailable('Mismatched code-observation identity');
  if (old === null) stage.put('contract-code',identity,{account});
}
