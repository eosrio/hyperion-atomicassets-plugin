import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {executeOriginalSaleAssetControls} from '../harness/shared/reference.mjs';
import * as asset from './fixtures/asset-domain-cases.mjs';
import * as market from './fixtures/fixed-sale-cases.mjs';
const modules=process.env.AM_DOMAIN_MODULE_ROOT?pathToFileURL(process.env.AM_DOMAIN_MODULE_ROOT.replaceAll('\\','/')+'/'):new URL('../dist/',import.meta.url);
const {readFixedSaleWithAssets:compose}=await import(new URL('atomicmarket/internal/sale-assets.js',modules));
const {readFixedSaleLight}=await import(new URL('atomicmarket/internal/fixed-sale.js',modules));
const {AssetDomainUnavailable}=await import(new URL('atomicassets/internal/lifecycle-port.js',modules));
const {FixedSaleUnavailable}=await import(new URL('atomicmarket/internal/fixed-sale-port.js',modules));
const copy=structuredClone,json=value=>JSON.parse(JSON.stringify(value)),key=(...parts)=>JSON.stringify(parts);
const id=asset.input.assetId,contract=asset.input.contract,saleId=market.input.saleId;
const current=market.expected.lightCases.find(c=>c.name==='current');
const template=JSON.parse(readFileSync(new URL('../fixtures/harness/atomicassets/single-asset.input.json',import.meta.url))).queries[0].rows[0];
const price={market_contract:'atomicmarket',collection_name:template.collection_name,template_id:template.template.template_id,
  token_contract:'eosio.token',token_symbol:'WAX',token_precision:4,median:'9007199254740993',average:'9007199254740994',
  suggested_median:null,suggested_average:null,min:'1',max:'9223372036854775807',sales:'2'};

/** One closed coherent fixture view, with explicit key coverage; not a physical DB or SDK claim. */
function view(stageIndex=0){
  const stage=copy(asset.fixture.stages[stageIndex]),rows=new Map(),covered=new Set(),reads=[];
  const set=(kind,k,value)=>{const identity=kind+':'+k;covered.add(identity);if(value===null)rows.delete(identity);else rows.set(identity,copy(value));};
  set('asset',key(contract,id),stage.asset);
  set('collection',key(contract,asset.input.collection),stage.collections[0]);
  set('schema',key(contract,asset.input.collection,asset.input.schema),{...stage.schemas[0],schema_digest:asset.digest(stage.schemas[0].format)});
  for(const kind of ['template-link','backed-tokens','original-mint'])set(kind,key(contract,id),null);
  set('market-sale',key(market.input.marketContract,saleId),current.sale);
  set('offer',key(contract,market.input.offerId),current.relations.offer);
  set('offer-assets',key(contract,market.input.offerId),{...current.relations.offerAssets,asset_ids:[id]});
  set('market-token',key(market.input.marketContract,'WAX'),current.relations.token);
  set('symbol-pair',key(market.input.marketContract,'WAX','WAX'),null);set('contract-code',key('seller'),null);
  let revision=1;const checkpoint=Object.freeze({blockNum:123456+stageIndex,blockId:(stageIndex+1).toString(16).padStart(64,'0')}),fence=new Error('coherent view changed');
  const reader={checkpoint,revision:1,async get(kind,k){
    assert.equal(this,reader);if(revision!==reader.revision)throw fence;
    reads.push({kind,key:k,checkpoint:reader.checkpoint,revision:reader.revision});
    const identity=kind+':'+k;if(!covered.has(identity))return{status:'unavailable',reason:'explicit fixture coverage missing'};
    return rows.has(identity)?{status:'present',value:copy(rows.get(identity))}:{status:'covered-absent'};
  }};
  const rawSale=copy(current.view);rawSale.assets=[id];rawSale.collection={...copy(stage.view.collection),market_fee:current.sale.collection_fee};rawSale.current_collection_fee=stage.collections[0].market_fee;
  return {reader,reads,set,rows,stage,rawSale,fence,invalidate(){revision++;},unknown(kind,k){covered.delete(kind+':'+k);}};
}

function originalInput(){
  const a=view(),later=view(3),fee=view(),templatedSale=copy(a.rawSale);templatedSale.assets=[template.asset_id];
  fee.rawSale.current_collection_fee=.2;fee.stage.view.collection.market_fee=.2;
  return {market:market.input.marketContract,assets:contract,cases:[
    {name:'current',saleId,saleRow:a.rawSale,assetRows:[a.stage.view],priceRows:[]},
    {name:'changed-current',saleId,saleRow:later.rawSale,assetRows:[later.stage.view],priceRows:[]},
    {name:'changed-current-fee',saleId,saleRow:fee.rawSale,assetRows:[fee.stage.view],priceRows:[]},
    {name:'covered-absent-asset',saleId,saleRow:a.rawSale,assetRows:[],priceRows:[]},
    {name:'templated-original-only',saleId,saleRow:templatedSale,assetRows:[template],priceRows:[price]},
    {name:'absent-sale',saleId,saleRow:null,assetRows:[],priceRows:[]},
    {name:'invalid-sale-id',saleId:'bad',saleRow:null,assetRows:[],priceRows:[]},
  ]};
}
let reference;
const original=()=>reference??=executeOriginalSaleAssetControls({referenceRoot:process.env.AA_REFERENCE_ROOT,input:originalInput()});
const find=(result,name)=>result.cases.find(c=>c.name===name);

test('pinned original getSaleAction/fillSales/AssetFiller executes directly with no HTTP listener',async()=>{
  assert.ok(process.env.AA_REFERENCE_ROOT,'Pinned installed reference is required');const result=await original();
  assert.equal(result.reference.commit,'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');assert.equal(result.listenerAttempts,0);
  assert.equal(result.sourceBindings.length,5);for(const b of result.sourceBindings)assert.match(b.gitSha256,/^[a-f0-9]{64}$/);
  for(const name of ['originalGetSaleAction','originalFillSales','originalAssetFiller','originalFormatters'])assert.equal(result.scope[name],true);
  for(const name of ['httpServer','postgres','mongo','sourceAuthority','fullParity'])assert.equal(result.scope[name],false);
  assert.equal(find(result,'current').calls.length,3);assert.equal(find(result,'absent-sale').error.code,416);
  assert.equal(find(result,'invalid-sale-id').error.code,400);assert.equal(find(result,'invalid-sale-id').calls.length,0);
});

test('composed untemplated sale matches original nested data exactly; light result remains IDs',async()=>{
  const v=view(),before=copy(v.rows),result=await compose(v.reader,market.input.marketContract,saleId),expected=find(await original(),'current');
  assert.equal(expected.error,null);assert.deepEqual(json(result),expected.value);assert.deepEqual(v.rows,before);
  assert.equal(result.assets[0].asset_id,id);assert.deepEqual(result.assets[0].sales,[]);assert.deepEqual(result.assets[0].auctions,[]);
  for(const name of ['prices','template_buyoffers'])assert.equal(Object.hasOwn(result.assets[0],name),false);
  assert.deepEqual((await readFixedSaleLight(v.reader,market.input.marketContract,saleId)).assets,[id]);
  assert.equal(result.price.amount,'9007199254740993');assert.equal(result.assets[0].immutable_data.serial,'18446744073709551615');
});

test('relationship-only changes reach both top sale and nested asset without changing sale creation',async()=>{
  const a=view(),b=view(3),prior=await compose(a.reader,market.input.marketContract,saleId),result=await compose(b.reader,market.input.marketContract,saleId);
  assert.deepEqual(json(result),find(await original(),'changed-current').value);
  assert.equal(result.assets[0].collection.name,'current joined collection');assert.notDeepEqual(result.assets[0],prior.assets[0]);
  for(const name of ['created_at_block','created_at_time'])assert.equal(result[name],prior[name]);
  assert.deepEqual(a.rows.get('market-sale:'+key(market.input.marketContract,saleId)),b.rows.get('market-sale:'+key(market.input.marketContract,saleId)));
  result.assets[0].schema.format.push({name:'mutated',type:'string'});assert.deepEqual(json(await compose(b.reader,market.input.marketContract,saleId)),find(await original(),'changed-current').value);
});

test('covered-absent asset keeps original ID fallback; unknown coverage does not',async()=>{
  const missing=view();missing.set('asset',key(contract,id),null);
  assert.deepEqual(json(await compose(missing.reader,market.input.marketContract,saleId)),find(await original(),'covered-absent-asset').value);
  const unknown=view();unknown.unknown('asset',key(contract,id));await assert.rejects(compose(unknown.reader,market.input.marketContract,saleId),AssetDomainUnavailable);
});

test('current nested fee does not replace the sale collection fee',async()=>{
  const v=view();v.rows.get('collection:'+key(contract,asset.input.collection)).market_fee=.2;
  const result=await compose(v.reader,market.input.marketContract,saleId);
  assert.deepEqual(json(result),find(await original(),'changed-current-fee').value);
  assert.equal(result.collection.market_fee,.05);assert.equal(result.current_collection_fee,.2);
  assert.equal(result.assets[0].collection.market_fee,.2);
});

test('missing required nested relationships remain unavailable instead of ID fallback or empty data',async()=>{
  const absentCollection=view();absentCollection.set('collection',key(contract,asset.input.collection),null);
  assert.equal(await compose(absentCollection.reader,market.input.marketContract,saleId),null);
  const unknownCollection=view();unknownCollection.unknown('collection',key(contract,asset.input.collection));
  await assert.rejects(compose(unknownCollection.reader,market.input.marketContract,saleId),FixedSaleUnavailable);
  const missingSchema=view();missingSchema.set('schema',key(contract,asset.input.collection,asset.input.schema),null);
  await assert.rejects(compose(missingSchema.reader,market.input.marketContract,saleId),AssetDomainUnavailable);
  const v=view();v.unknown('template-link',key(contract,id));await assert.rejects(compose(v.reader,market.input.marketContract,saleId),AssetDomainUnavailable);
});

test('original templated enrichment has price fields; this coherent tracer refuses it explicitly',async()=>{
  const result=find(await original(),'templated-original-only');assert.equal(result.error,null);
  assert.equal(result.value.assets[0].template.template_id,template.template.template_id);
  assert.equal(result.value.assets[0].prices[0].median,'9007199254740993');assert.deepEqual(result.value.assets[0].template_buyoffers,[]);
  const v=view();v.set('asset',key(contract,id),{...v.stage.asset,template_id:'7'});
  await assert.rejects(compose(v.reader,market.input.marketContract,saleId),AssetDomainUnavailable);
});

test('one caller view/checkpoint covers sale and all asset relationships; fence errors propagate',async()=>{
  const v=view();await compose(v.reader,market.input.marketContract,saleId);
  assert.ok(v.reads.some(r=>r.kind==='market-sale')&&v.reads.some(r=>r.kind==='asset')&&v.reads.some(r=>r.kind==='schema'));
  assert.ok(v.reads.every(r=>r.checkpoint===v.reader.checkpoint&&r.revision===1));
  for(const boundary of ['asset','schema','original-mint']){
    const stale=view(),get=stale.reader.get;
    stale.reader.get=async function(kind,k){if(kind===boundary)stale.invalidate();return get.call(this,kind,k);};
    await assert.rejects(compose(stale.reader,market.input.marketContract,saleId),error=>error===stale.fence);
  }
});

test('empty links and absent sale preserve exact light boundary without reopening an asset view',async()=>{
  const empty=view();empty.set('offer-assets',key(contract,market.input.offerId),null);
  assert.deepEqual((await compose(empty.reader,market.input.marketContract,saleId)).assets,[]);assert.ok(!empty.reads.some(r=>r.kind==='asset'));
  const absent=view();absent.set('market-sale',key(market.input.marketContract,saleId),null);
  assert.equal(await compose(absent.reader,market.input.marketContract,saleId),null);assert.deepEqual(absent.reads.map(r=>r.kind),['market-sale']);
});
