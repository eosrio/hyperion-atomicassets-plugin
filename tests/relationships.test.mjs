import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {captureStatefulDeclaration,canonicalStatefulRecord} from '@eosrio/hyperion-sdk/projection-stateful';
import Fastify from 'fastify';
import {executeOriginalRelationshipControls} from '../harness/shared/reference.mjs';
import {initial,stages,input as aa,key} from './fixtures/asset-domain-cases.mjs';
import {scenario,input as market} from './fixtures/fixed-sale-cases.mjs';
import {atomicLimits} from '../harness/stateful/scenario.mjs';
const dist=process.env.ATOMIC_PLUGIN_DIST_ROOT??fileURLToPath(new URL('../dist',import.meta.url));
const {createAtomicStatefulPlugin}=await import(pathToFileURL(join(dist,'index.js')).href);
const {readFixedSaleWithAssets}=await import(pathToFileURL(join(dist,'atomicmarket/internal/sale-assets.js')).href);
const assets=aa.contract,am=market.marketContract,system='eosio',hash=x=>createHash('sha256').update(x).digest('hex');
const action=(contract,name,value)=>({kind:'action',contract,name,value});
const config=(tokens=[{token_contract:'eosio.token',token_symbol:'8,WAX'}])=>({kind:'row',contract:am,table:'config',scope:am,present:true,
  value:{version:'1.2.2',atomicassets_account:assets,supported_tokens:tokens,supported_symbol_pairs:[],
    maker_market_fee:0.01,taker_market_fee:0.02,minimum_auction_duration:10,maximum_auction_duration:1000,minimum_bid_increase:0.05,auction_reset_duration:30}});
const offer=(id=market.offerId)=>action(assets,'lognewoffer',{offer_id:id,sender:'alice',recipient:am,memo:'source offer',
  sender_asset_ids:[aa.assetId],recipient_asset_ids:[]});
const saleActions=()=>scenario('same-block-start-before-create').blocks[0].events.map(e=>action(am,e.name,e.data));
const begin=()=>[...initial().map(e=>({...e,contract:assets})),config(),offer(),...saleActions()];
const move=(from,to)=>action(assets,'logtransfer',{from,to,asset_ids:[aa.assetId],memo:'chronological move'});
const limits={...atomicLimits,selectors:128,recordKinds:16,readAttempts:128,mutations:64};
let originalCounter=0;
function setup(validate=()=>{}){
  const plugin=createAtomicStatefulPlugin({limits,assetsContract:assets,marketContract:am,systemContract:system});
  const reduce=plugin.getStatefulProjectionsV2({binding:{}}).projections[0].reduce;
  let state=new Map();const blocks=[],snapshots=[],errors=[];
  const get=async(kind,k)=>state.has(kind+k)?{status:'present',value:structuredClone(state.get(kind+k))}:{status:'covered-absent'};
  return {plugin,blocks,snapshots,errors,get,rows:kind=>[...state].filter(([k])=>k.startsWith(kind+'[')).map(([,v])=>structuredClone(v)),
    async execute(events){
      const number=blocks.length+1,timeMs=1700000000000+(number-1)*1000;
      blocks.push({number,timeMs,events:structuredClone(events)});const next=structuredClone(state);
      const port={source:{previous:{blockNum:number-1,blockId:(number-1).toString(16).padStart(64,'0')},
        block:{blockNum:number,blockId:number.toString(16).padStart(64,'0'),previousBlockId:(number-1).toString(16).padStart(64,'0'),timeMs:String(timeMs)},
        inputs:events.map((e,i)=>({kind:e.kind==='row'?'table':'action',contract:e.contract,name:e.table??e.name,
          data:structuredClone(e.value),sourceEvidence:hash(number+':'+i),abiDeployment:e.contract+':actual-controlled-epoch',abiSha256:hash(e.contract),
          transactionId:'a'.repeat(64),...(e.kind==='row'?{present:e.present,identity:{kind:'contract-row',scope:e.scope,primaryKey:String(i)}}:{})}))},
        async get(kind,k){return next.has(kind+k)?{status:'present',value:structuredClone(next.get(kind+k))}:{status:'covered-absent'};},
        put(kind,k,v){validate(kind,v);next.set(kind+k,structuredClone(v));},delete(kind,k){next.delete(kind+k);}};
      let error=null;try{await reduce(port);state=next;}catch(e){error=e.message;}
      errors.push(error);snapshots.push({offers:this.rows('offer'),links:this.rows('offer-assets'),tokens:this.rows('market-token'),
        assets:this.rows('asset').map(v=>({asset_id:v.asset_id,owner:v.owner})),sales:this.rows('market-sale'),codes:this.rows('contract-code'),error});
      return error;
    },
    read(){return readFixedSaleWithAssets({get},am,market.saleId);},
    async original(){const result=await executeOriginalRelationshipControls({referenceRoot:process.env.AA_REFERENCE_ROOT,input:{assets,market:am,system,blocks},timeoutMs:30000});
      const path=new URL('../out/relationships/',import.meta.url);await mkdir(path,{recursive:true});
      await writeFile(new URL('original-'+process.version+'-'+process.pid+'-'+(++originalCounter)+'.json',path),JSON.stringify(result,null,2)+'\n');return result;},
  };
}
function compare(s,result){
  assert.equal(result.snapshots.length,s.snapshots.length);assert.equal(result.scope.postgres,false);assert.equal(result.scope.originalOfferAssetConfigSaleProcessors,true);
  for(let i=0;i<s.snapshots.length;i++)for(const kind of ['offers','links','tokens','assets','sales','codes'])
    assert.deepEqual(s.snapshots[i][kind],result.snapshots[i][kind],kind+' at chronological block '+(i+1));
}

test('real offer/token/asset inputs serve a coherent sale and match actual original processors through invalidation/restoration',async()=>{
  const s=setup();assert.equal(await s.execute(begin()),null);
  let sale=await s.read();assert.equal(sale.sale_id,market.saleId);assert.equal(sale.assets[0].asset_id,aa.assetId);
  assert.equal(sale.price.amount,'9007199254740993');assert.equal(sale.price.token_precision,8);assert.equal(sale.is_seller_contract,false);
  assert.equal(await s.execute([move('mallory','bad')]),null);assert.equal(s.rows('offer')[0].state,0);
  assert.equal(await s.execute([move('alice','bob')]),null);const invalid=s.rows('offer')[0];assert.equal(invalid.state,1);
  assert.equal((await s.read()).assets[0].owner,'bob');
  assert.equal(await s.execute([move('bob','alice')]),null);const restored=s.rows('offer')[0];assert.equal(restored.state,0);
  assert.equal(restored.updated_at_block,invalid.updated_at_block);assert.equal(restored.updated_at_time,invalid.updated_at_time);
  assert.equal(await s.execute([config([{token_contract:'other.token',token_symbol:'9,WAX'}]),action(system,'setcode',{account:'seller',code:''})]),null);
  sale=await s.read();assert.equal(sale.is_seller_contract,true);assert.equal(sale.price.token_precision,8,'Original same-length config change keeps old token row');
  assert.equal(await s.execute([action(assets,'canceloffer',{offer_id:market.offerId}),action(am,'cancelsale',{sale_id:market.saleId})]),null);
  assert.equal(s.rows('offer')[0].state,5);assert.equal((await s.read()).state,2);compare(s,await s.original());
});
test('accepted, declined, burn and covered-absent terminal updates retain original state behavior',async()=>{
  for(const name of ['acceptoffer','declineoffer']){
    const s=setup();await s.execute(begin());await s.execute([action(assets,name,{offer_id:market.offerId})]);
    await s.execute([move('alice','bob')]);assert.equal(s.rows('offer')[0].state,name==='acceptoffer'?3:4);compare(s,await s.original());
  }
  const s=setup();await s.execute(begin());await s.execute([action(assets,'logburnasset',{asset_id:aa.assetId,asset_owner:'alice'})]);
  assert.equal(s.rows('offer')[0].state,1);assert.equal((await s.read()).assets[0].owner,null);compare(s,await s.original());
});
test('repeated offer creation and a completed purchase preserve original exact IDs and timestamps',async()=>{
  const s=setup();await s.execute(begin());await s.execute([offer(),action(assets,'canceloffer',{offer_id:'9007199254740000'})]);
  assert.equal(s.rows('offer')[0].created_at_block,'2','Original repeated insert updates creation fields');
  const another=String(BigInt(market.offerId)+1n);
  await s.execute([action(assets,'canceloffer',{offer_id:another}),offer(another)]);
  assert.equal(s.rows('offer').find(o=>o.offer_id===another).state,5,'Priority80 create precedes90 update despite input order');
  await s.execute([action(assets,'acceptoffer',{offer_id:market.offerId}),action(am,'purchasesale',
    {sale_id:market.saleId,buyer:'buyer',intended_delphi_median:'0',taker_marketplace:''})]);
  const sale=await s.read();assert.equal(sale.state,3);assert.equal(sale.buyer,'buyer');assert.equal(sale.price.amount,'9007199254740993');
  compare(s,await s.original());
});
test('real token removal retains its row; re-add conflicts and config erasure discard all staged effects',async()=>{
  const s=setup();await s.execute(begin());await s.execute([config([])]);assert.equal(s.rows('market-token').length,1);
  const before=await s.read();assert.match(await s.execute([config()]),/conflicts/);assert.deepEqual(await s.read(),before);compare(s,await s.original());
  const erased=setup();await erased.execute(begin());const state=await erased.read(),row=config();row.present=false;
  assert.match(await erased.execute([move('alice','bob'),row]),/cannot be erased/);assert.deepEqual(await erased.read(),state);compare(erased,await erased.original());
});
test('actual sale HTTP route composes all current relationships through one request host',async()=>{
  const s=setup();await s.execute(begin());const api=Fastify(),requests=[];
  s.plugin.addRoutes(api,{statefulQueryHost(request){requests.push(request.url);return {async compose(id,fn){assert.equal(id,'atomicassets');return {value:await fn({get:s.get})};}};}});
  const url='/atomicmarket/v1/sales/'+market.saleId;let response=await api.inject(url);assert.equal(response.statusCode,200);
  assert.equal(response.json().data.assets[0].owner,'alice');await s.execute([move('alice','bob')]);
  response=await api.inject(url);assert.equal(response.statusCode,200);assert.equal(response.json().data.assets[0].owner,'bob');
  assert.deepEqual(requests,[url,url]);await api.close();
});
test('unsupported bundles and pricing fail explicitly, and offer links are never injected as normalized fixture rows',async()=>{
  const s=setup(),bad=begin();bad.find(e=>e.name==='lognewoffer').value.sender_asset_ids.push('9007199254740995');
  assert.match(await s.execute(bad),/bundles\/exchanges/);assert.deepEqual(s.rows('offer'),[]);assert.deepEqual(s.rows('market-token'),[]);
  const q=setup(),first=begin();first.find(e=>e.table==='config'&&e.contract===am).value.supported_symbol_pairs=[{listing_symbol:'8,WAX',settlement_symbol:'4,EOS'}];
  assert.match(await q.execute(first),/pricing/);assert.deepEqual(q.rows('asset'),[]);
});
test('the actual SDK record bound rejects a hot reverse index atomically without truncating old links',async()=>{
  const plugin=createAtomicStatefulPlugin({limits}),d=plugin.getStatefulProjectionsV2({binding:{}}).projections[0].definition;
  const declaration=await captureStatefulDeclaration({...d,binding:{chainId:'a'.repeat(64),backendId:'test',generation:'complete-genesis',mappingRevision:'b'.repeat(64),
    hookArtifact:'c'.repeat(64),hookRevision:'d'.repeat(64),codecRevision:'e'.repeat(64),normalizerRevision:'f'.repeat(64)},
    selectors:d.selectors.map(s=>({...s,abiDeployment:'source-epoch',abiSha256:'a'.repeat(64)}))},limits);
  const s=setup((kind,value)=>canonicalStatefulRecord(declaration,kind,value));await s.execute(begin());
  for(let i=1;i<limits.value.arrayElements;i++)assert.equal(await s.execute([offer(String(BigInt(market.offerId)+BigInt(i)))]),null);
  const before=s.rows('asset-offers')[0];assert.equal(before.offer_ids.length,32);
  assert.match(await s.execute([offer(String(BigInt(market.offerId)+32n))]),/array.*bound/i);
  assert.deepEqual(s.rows('asset-offers')[0],before);assert.equal(s.rows('offer').length,32);
});
