import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const dist=process.env.ATOMIC_PLUGIN_DIST_ROOT?pathToFileURL(process.env.ATOMIC_PLUGIN_DIST_ROOT.replaceAll('\\','/')+'/'):new URL('../dist/',import.meta.url);
const {jsonbText}=await import(new URL('atomicassets/internal/jsonb-text.js',dist));
const {databaseMetadata}=await import(new URL('atomicassets/internal/database-json.js',dist));
const {record}=await import(new URL('atomicassets/internal/lifecycle-port.js',dist));
const {reduceAssetLifecycle,readLifecycleAsset}=await import(new URL('atomicassets/internal/lifecycle.js',dist));
const {readCollectionId}=await import(new URL('atomicassets/internal/collections.js',dist));
const {readTemplateId}=await import(new URL('atomicassets/internal/templates.js',dist));
const {readSchemaId}=await import(new URL('atomicassets/internal/schema-query.js',dist));
const {assembleFixedSaleLight}=await import(new URL('atomicmarket/internal/fixed-sale.js',dist));
const {assembleAuctionLight}=await import(new URL('atomicmarket/internal/auctions.js',dist));
const {assembleBuyofferLight}=await import(new URL('atomicmarket/internal/buyoffers.js',dist));
const {createAtomicStatefulPlugin}=await import(new URL('index.js',dist));
import {initial,input,storage,block,key,collectionRow} from './fixtures/asset-domain-cases.mjs';
import {atomicLimits} from '../harness/stateful/scenario.mjs';
import profiles from '../harness/atomicassets/lifecycle-input.cjs';

// Extracted from actual original PostgreSQL/view/HTTP reports, never from this renderer.
const fixtureBytes=readFileSync(new URL('./fixtures/jsonb-display-pg16.json',import.meta.url));
const oracle=JSON.parse(fixtureBytes), fields=['name','img','images'];
const {cases:displayCases}=createRequire(import.meta.url)('../harness/atomicassets/postgres/json-display-oracle.cjs');
const select=value=>Object.fromEntries(fields.map(field=>[field,value[field]]));

test('measured fixture retains all original vectors, capture pins and raw SQL numeric boundaries',()=>{
 assert.equal(createHash('sha256').update(fixtureBytes).digest('hex'),'c2eb66d9ab596f8142a1c35cb6770854169d281baf1611b09f392b368018786b');
 assert.equal(oracle.referenceCommit,'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');
 assert.equal(oracle.pluginCaptureTree,'38432c47533471c062c8414f08a611bad110572c');
 assert.equal(oracle.workflowRun,41958628616);assert.equal(oracle.postgresVersion,'16.15');assert.equal(oracle.qualified,false);
 assert.equal(oracle.reports.length,4);assert.equal(oracle.cases.length,63);
 assert.equal(oracle.cases.filter(c=>c.storageAccepted).length,51);
 const plans=displayCases();
 for(let i=0;i<plans.length;i++)for(const field of ['name','rotation','rawInput','negativeZeroPaths','sourceVectorSha256'])
  assert.deepEqual(oracle.cases[i][field],plans[i][field]);
 assert.equal(oracle.nativeSqlNumericProbes.length,3);
 assert.equal(oracle.nativeSqlNumericProbes[0].kind,'native-SQL-literal-not-original-encoder');
 assert.match(oracle.nativeSqlNumericProbes[0].raw,/9007199254740993/);
 assert.match(oracle.nativeSqlNumericProbes[0].raw,/1\.2300/);
});

function inputFor(c){
 const value=JSON.parse(c.rawInput);
 for(const path of c.negativeZeroPaths){let owner=value;for(const part of path.slice(0,-1))owner=owner[part];owner[path.at(-1)]=-0;}
 return value;
}

// One callback-owned finite view. No database, HTTP server, timers, managed admission or caches.
async function baseRows(){
 const s=storage();s.add('schema-asset-count',input.contract,input.collection,input.schema);
 await s.run(reduceAssetLifecycle,block(0),initial());
 const map=s.snapshot(),contract=input.contract,collection=input.collection;
 const put=(kind,parts,value)=>map.set(kind+':'+key(...parts),value);
 put('template',[contract,'42'],{contract,template_id:'42',collection_name:collection,schema_name:input.schema,
  max_supply:'100',issued_supply:'1',transferable:true,burnable:true,immutable_data:{},mutable_data:null,
  created_at_block:'1',created_at_time:'1000',deleted_at_block:null,deleted_at_time:null});
 const common={market_contract:'atomicmarket',assets_contract:contract,seller:'alice',buyer:null,collection_name:collection,
  collection_fee:.05,maker_marketplace:null,taker_marketplace:null,state:0,
  created_at_block:'1',created_at_time:'1000',updated_at_block:'1',updated_at_time:'1000'};
 put('market-sale',['atomicmarket','1'],{...common,sale_id:'1',listing_price:'100',final_price:null,
  listing_symbol:'WAX',settlement_symbol:'WAX',offer_id:'1'});
 put('offer',[contract,'1'],{contract,offer_id:'1',state:0});
 put('market-token',['atomicmarket','WAX'],{market_contract:'atomicmarket',token_symbol:'WAX',token_precision:8,token_contract:'eosio.token'});
 put('market-auction',['atomicmarket','1'],{...common,auction_id:'1',price:'100',token_symbol:'WAX',
  claimed_by_buyer:false,claimed_by_seller:false,end_time:1000,asset_ids:[input.assetId],bids:[]});
 put('market-buyoffer',['atomicmarket','1'],{...common,buyer:'bob',buyoffer_id:'1',price:'100',token_symbol:'WAX',
  memo:'',decline_memo:null,asset_ids:[input.assetId],asset_indices:[1]});
 return map;
}
function reader(map){return {
 async get(kind,k){const value=map.get(kind+':'+k);return value===undefined?{status:'covered-absent'}:{status:'present',value:structuredClone(value)};},
 async all(kind){return [...map].filter(([k])=>k.startsWith(kind+':')).map(([k,value])=>({key:k.slice(kind.length+1),value:structuredClone(value)}));}
};}

for(const c of oracle.cases)test('original SQL/display '+c.name+' rotation '+c.rotation,async()=>{
 const raw=inputFor(c),before=structuredClone(raw);
 assert.equal(createHash('sha256').update(c.encoded).digest('hex'),c.encodedSha256);
 assert.equal(Buffer.byteLength(c.encoded),c.encodedBytes);
 if(!c.storageAccepted){
  assert.equal(c.storageError.code,'22P02');assert.equal(c.rejectedWriteLeftBaseline,true);
  assert.throws(()=>databaseMetadata(raw));assert.deepEqual(raw,before);return;
 }
 const data=databaseMetadata(raw);assert.deepEqual(raw,before);
 const expected=Object.fromEntries(fields.map(field=>[field,c.sqlText[field+'_text']]));
 assert.deepEqual(Object.fromEntries(fields.map(field=>[field,jsonbText(data[field])])),expected);
 assert.equal(jsonbText(data),c.sqlText.postgres_text);assert.equal(jsonbText(data),c.storageText);
 assert.deepEqual(c.assetView,expected);assert.deepEqual(c.assetHttp,expected);
 assert.deepEqual(c.collectionView,{name:expected.name,img:expected.img});assert.deepEqual(c.collectionHttp,c.collectionView);
 const map=await baseRows(),collectionKey='collection:'+key(input.contract,input.collection);
 map.set(collectionKey,{...map.get(collectionKey),data});const view=reader(map);
 const collection=await readCollectionId(view,input.contract,input.collection);
 assert.deepEqual({name:collection.name,img:collection.img},c.collectionHttp);
 assert.deepEqual(select((await readLifecycleAsset(view,input.contract,input.assetId)).collection),expected);
 assert.deepEqual(select((await readTemplateId(view,input.contract,input.collection,'42')).collection),expected);
 assert.deepEqual(select((await readSchemaId(view,input.contract,{collections:[input.collection],schemas:[input.schema]})).collection),expected);
 for(const assemble of [assembleFixedSaleLight,assembleAuctionLight,assembleBuyofferLight])
  assert.deepEqual(select((await assemble(view,'atomicmarket','1')).collection),expected);
});

test('display does not apply metadata encoding or weaken inert JSON and scalar boundaries',()=>{
 assert.equal(jsonbText(undefined),null);assert.equal(jsonbText(null),null);
 assert.equal(jsonbText('literal\\u0000'),'literal\\u0000');
 for(const value of ['a\0b','\ud800',{'\udc00':1},Infinity,NaN,1n,[undefined],new Date()])assert.throws(()=>jsonbText(value));
 let touched=0;const getter={get a(){touched++;return 1;}};assert.throws(()=>jsonbText(getter));assert.equal(touched,0);
 const cycle={};cycle.self=cycle;assert.throws(()=>jsonbText(cycle));
 assert.throws(()=>record({scalar:'a\0b'}));assert.throws(()=>record({scalar:'literal\\u0000'}));
 // Native SQL precision and scale are deliberately not recovered from a parsed Number.
 assert.notEqual(jsonbText(JSON.parse('9007199254740993')),'9007199254740993');
 assert.notEqual(jsonbText(JSON.parse('1.2300')),'1.2300');
});

test('actual combined factory keeps default ORIGINAL codec input and joins on the same callback view',async()=>{
 const selected=profiles.loadInputProfile(),before=structuredClone(selected);
 assert.equal(selected.descriptor.profile,'original-lifecycle');assert.equal(selected.input.collectionData.img,'image\0hash');
 const plugin=createAtomicStatefulPlugin({limits:{...atomicLimits,selectors:128,recordKinds:21}});
 const reduce=plugin.getStatefulProjectionsV2({binding:{},sourceCapabilities:['original-action-authorization-v1']}).projections[0].reduce;
 const events=initial();events[3]=collectionRow(selected.input.collectionData);
 const source={previous:{blockNum:0,blockId:'0'.repeat(64)},block:{blockNum:1,blockId:'1'.repeat(64),previousBlockId:'0'.repeat(64),timeMs:'1700000000000'},
  inputs:events.map((e,i)=>({kind:e.kind==='row'?'table':'action',contract:input.contract,name:e.table??e.name,data:structuredClone(e.value),
   sourceEvidence:createHash('sha256').update('jsonb39 '+i).digest('hex'),abiDeployment:'constructed-input-epoch',abiSha256:'a'.repeat(64),
   transactionId:e.transactionId??null,...(e.kind==='row'?{identity:{kind:'contract-row',scope:e.scope,primaryKey:String(i)},present:e.present}:{})}))};
 const map=new Map(),port={...reader(map),put(kind,k,value){map.set(kind+':'+k,structuredClone(value));},delete(kind,k){map.delete(kind+':'+k);}};
 await reduce({...port,source});assert.deepEqual(selected,before);
 assert.equal((await readCollectionId(port,input.contract,input.collection)).img,'image hash');
 assert.equal((await readLifecycleAsset(port,input.contract,input.assetId)).collection.img,'image hash');
 const finalState=structuredClone(map);source.inputs.find(e=>e.name==='logmint').data.new_asset_owner='bad\0scalar';
 // The factory rejects the malformed source before any candidate effect. In real use the host owns atomic staging.
 await assert.rejects(reduce({...port,source}));assert.deepEqual(map,finalState);
});
