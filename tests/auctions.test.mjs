import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import Fastify from 'fastify';
import {captureStatefulDeclaration,canonicalStatefulRecord} from '@eosrio/hyperion-sdk/projection-stateful';
import {executeOriginalAuctionControls} from '../harness/shared/reference.mjs';
import {initial,input as aa,fixture,key} from './fixtures/asset-domain-cases.mjs';
import {atomicLimits} from '../harness/stateful/scenario.mjs';
const dist=process.env.ATOMIC_PLUGIN_DIST_ROOT??fileURLToPath(new URL('../dist',import.meta.url));
const {createAtomicStatefulPlugin}=await import(pathToFileURL(join(dist,'index.js')).href);
const {readAuctionWithAssets}=await import(pathToFileURL(join(dist,'atomicmarket/internal/auction-assets.js')).href);
const {reduceAuctions}=await import(pathToFileURL(join(dist,'atomicmarket/internal/auctions.js')).href);
const market='atomicmarket',assets=aa.contract,auctionId='9007199254740993',time=1700000000000,end=time/1000+60;
const hash=x=>createHash('sha256').update(x).digest('hex'),limits={...atomicLimits,selectors:128,recordKinds:19,readAttempts:128,mutations:64};
const json=v=>JSON.parse(JSON.stringify(v));
const act=(name,value={auction_id:auctionId})=>({kind:'action',contract:market,name,value});
const create=(overrides={})=>act('lognewauct',{auction_id:auctionId,seller:'seller',asset_ids:[aa.assetId],starting_bid:'90071992547.40993 WAX',
  duration:60,end_time:end,maker_marketplace:'',collection_name:aa.collection,collection_fee:.05,...overrides});
const bid=(bidder='buyer',amount='90071992547.40994 WAX')=>act('auctionbid',{auction_id:auctionId,bidder,bid:amount,taker_marketplace:''});
const row=(value={},present=true)=>({kind:'row',contract:market,table:'auctions',scope:market,present,value:{auction_id:auctionId,
  seller:'ignored',asset_ids:[aa.assetId],end_time:end+20,assets_transferred:false,current_bid:'1 WAX',current_bidder:'ignored',
  claimed_by_seller:true,claimed_by_buyer:true,maker_marketplace:'ignored',taker_marketplace:'ignored',collection_fee:.9,collection_name:'ignored',...value}});
const config=(version='1.2.2')=>({kind:'row',contract:market,table:'config',scope:market,present:true,value:{version,atomicassets_account:assets,
  supported_tokens:[{token_contract:'eosio.token',token_symbol:'8,WAX'}],supported_symbol_pairs:[]}});
const begin=(events=[create()])=>[...initial().map(e=>({...e,contract:assets})),config(),...events];
const rebase=v=>{for(const [k,x]of Object.entries(v)){if(x&&typeof x==='object')rebase(x);else if(x!==null&&/_at_block$/.test(k))v[k]='1';else if(x!==null&&/_at_time$/.test(k))v[k]=String(time);}return v;};
const assetView=rebase(structuredClone(fixture.stages[0].view)),collection=rebase(structuredClone(fixture.stages[0].collections[0]));
const relations={collection,token:{market_contract:market,token_contract:'eosio.token',token_symbol:'WAX',token_precision:8},code:null};
let referenceNumber=0;
async function setup({selectedLimits=limits}={}){
  const plugin=createAtomicStatefulPlugin({limits:selectedLimits}),registered=plugin.getStatefulProjectionsV2({binding:{}}).projections[0];
  const binding={chainId:'a'.repeat(64),backendId:'controlled',generation:'genesis',mappingRevision:'b'.repeat(64),hookArtifact:'c'.repeat(64),
    hookRevision:'d'.repeat(64),codecRevision:'e'.repeat(64),normalizerRevision:'f'.repeat(64)};
  const declaration=await captureStatefulDeclaration({...registered.definition,binding,
    selectors:registered.definition.selectors.map(s=>({...s,abiDeployment:s.contract,abiSha256:hash(s.contract)}))},selectedLimits);
  let state=new Map();const blocks=[],snapshots=[];
  const reader={async get(kind,k){return state.has(kind+k)?{status:'present',value:structuredClone(state.get(kind+k))}:{status:'covered-absent'};}};
  const s={plugin,blocks,snapshots,reader,rows:()=>[...state].filter(([k])=>k.startsWith('market-auction[')).map(([,v])=>structuredClone(v)),
    snapshot:()=>structuredClone(state),seed(kind,k,v){state.set(kind+k,structuredClone(v));},
    async run(events){const number=blocks.length+1,timeMs=time+(number-1)*1000;blocks.push({number,timeMs,events:structuredClone(events)});
      const next=structuredClone(state),p={source:{previous:{blockNum:number-1,blockId:hash(String(number-1))},
        block:{blockNum:number,blockId:hash(String(number)),previousBlockId:hash(String(number-1)),timeMs:String(timeMs)},
        inputs:events.map((e,i)=>({kind:e.kind==='row'?'table':'action',contract:e.contract,name:e.table??e.name,data:structuredClone(e.value),
          sourceEvidence:hash(number+':'+i),abiDeployment:e.contract,abiSha256:hash(e.contract),transactionId:e.transactionId??'a'.repeat(64),
          ...(e.kind==='row'?{identity:{kind:'contract-row',scope:e.scope??e.contract,primaryKey:String(i)},present:e.present}:{})}))},
        async get(kind,k){return next.has(kind+k)?{status:'present',value:structuredClone(next.get(kind+k))}:{status:'covered-absent'};},
        put(kind,k,v){canonicalStatefulRecord(declaration,kind,v);next.set(kind+k,structuredClone(v));},delete(kind,k){next.delete(kind+k);}};
      let error;try{await registered.reduce(p);state=next;}catch(e){error=e;}snapshots.push(s.rows());if(error)throw error;
    },
    read(nowMs=time){return readAuctionWithAssets(reader,market,auctionId,nowMs);},
    async original(requests=[],overrides={}){const result=await executeOriginalAuctionControls({referenceRoot:process.env.AA_REFERENCE_ROOT,
      input:{market,assets,blocks:blocks.map(b=>({...b,events:b.events.filter(e=>e.contract===market&&e.table!=='config')})),relations,requests,...overrides}});
      const dir=new URL('../out/auctions/',import.meta.url);await mkdir(dir,{recursive:true});
      await writeFile(new URL('original-'+process.version+'-'+process.pid+'-'+(++referenceNumber)+'.json',dir),JSON.stringify(result,null,2)+'\n');return result;},
  };return s;
}
function compare(s,r){assert.equal(r.snapshots.length,s.snapshots.length);assert.equal(r.listenerAttempts,0);assert.equal(r.scope.postgres,false);
  for(let i=0;i<s.snapshots.length;i++){
    const rows=s.snapshots[i].map(({asset_ids,bids,...v})=>v);assert.deepEqual(rows,r.snapshots[i].auctions,'auction block '+(i+1));
    const bids=s.snapshots[i].flatMap(v=>v.bids.map(({number,account,amount,...b})=>({market_contract:market,auction_id:v.auction_id,
      bid_number:number,account,amount,...b})));assert.deepEqual(bids,r.snapshots[i].bids,'bids block '+(i+1));
    assert.deepEqual(s.snapshots[i].flatMap(v=>v.asset_ids),r.snapshots[i].links.map(v=>v.asset_id));
  }
}
const request=(nowMs=time,id=auctionId,assetRows=[assetView])=>({nowMs,id,assetRows});

test('chronological factory inputs preserve actual original create/start/table/bid/claim/cancel effects and full bid sequence',async()=>{
  const s=await setup();await s.run(begin());assert.equal((await s.read()).state,0);
  await s.run([act('logauctstart')]);await s.run([row({},false)]);
  await s.run([bid('buyer'),{...bid('buyer2','100000000000.00000 WAX'),transactionId:'b'.repeat(64)}]);
  await s.run([act('auctclaimbuy'),act('auctclaimsel')]);
  const sold=await s.read((end+20)*1000);assert.equal(sold.state,3);assert.equal(sold.claimed_by_buyer,true);assert.equal(sold.claimed_by_seller,true);
  assert.equal(sold.bids.length,2);assert.equal(sold.bids[1].txid,'b'.repeat(64));assert.equal(sold.price.amount,'10000000000000000');
  await s.run([act('cancelauct')]);assert.equal((await s.read()).state,2);compare(s,await s.original());
});

test('original scheduler orders create1020/table1030/action1040 and preserves equal-priority insertion order',async()=>{
  for(const actions of [[act('logauctstart'),create(),row()],[act('cancelauct'),act('logauctstart')],[act('logauctstart'),act('cancelauct')]]){
    const s=await setup();await s.run(begin(actions.some(e=>e.name==='lognewauct')?actions:[create(),...actions]));
    const r=await s.original();compare(s,r);assert.deepEqual(r.executed.map(e=>e.priority),r.executed.map(e=>e.priority).sort((a,b)=>a-b));
    if(actions[0].name==='logauctstart'&&actions[1].name==='lognewauct')assert.deepEqual(r.executed.map(e=>e.name),['lognewauct','auctions','logauctstart']);
  }
});

test('auction public state follows the original clock boundary, current relationships and nested asset enrichment',async()=>{
  const s=await setup();await s.run(begin([create(),act('logauctstart'),bid()]));
  const requests=[request(end*1000-1),request(end*1000),request(end*1000+1),request(time,'0'+auctionId),request(time,'bad'),request(time,'42'),request(time,auctionId,[])];
  const r=await s.original(requests);compare(s,r);
  for(const expected of r.requests.filter(v=>v.status===200)){
    const view=expected===r.requests.at(-1)?{async get(kind,k){return kind==='asset'?{status:'covered-absent'}:s.reader.get(kind,k);}}:s.reader;
    assert.deepEqual(json(await readAuctionWithAssets(view,market,auctionId,expected.nowMs)),expected.body.data);
  }
  assert.deepEqual(r.requests.slice(0,3).map(r=>r.body.data.state),[1,3,3]);
  assert.equal(r.requests.find(v=>v.id==='bad').status,400);assert.equal(r.requests.find(v=>v.id==='42').status,416);
  const before=s.rows(),prior=await s.read();
  s.seed('collection',key(assets,aa.collection),{...collection,data:{...collection.data,name:'later'},market_fee:.2});
  s.seed('contract-code',key('seller'),{account:'seller'});const current=await s.read();
  assert.equal(current.collection.name,'later');assert.equal(current.collection.market_fee,.05);assert.equal(current.current_collection_fee,.2);
  assert.equal(current.is_seller_contract,true);assert.notEqual(prior.collection.name,'later');assert.deepEqual(s.rows(),before);
});

test('an ended auction without bids is invalid; waiting and canceled rows keep their original state',async()=>{
  for(const actions of [[create()],[create(),act('logauctstart')],[create(),act('cancelauct')]]){
    const s=await setup();await s.run(begin(actions));const r=await s.original([request(end*1000)]);
    assert.deepEqual(json(await s.read(end*1000)),r.requests[0].body.data);compare(s,r);
  }
});

test('repeated creation resets auction fields/time while retaining original bids and same asset link',async()=>{
  const s=await setup();await s.run(begin([create(),act('logauctstart'),bid()]));await s.run([create({starting_bid:'1.0 WAX'})]);
  const row=s.rows()[0];assert.equal(row.state,0);assert.equal(row.price,'10');assert.equal(row.buyer,null);assert.equal(row.created_at_block,'2');assert.equal(row.bids.length,1);
  compare(s,await s.original([request()]));
});

test('updates to absent auctions have no effects; an absent bid refuses the original deferred FK failure',async()=>{
  const s=await setup();await s.run(begin([]));await s.run([act('logauctstart'),act('cancelauct'),act('auctclaimbuy'),act('auctclaimsel'),row({},false)]);
  assert.deepEqual(s.rows(),[]);compare(s,await s.original([request()]));
  const before=s.snapshot();await assert.rejects(s.run([bid()]),/no parent/);assert.deepEqual(s.snapshot(),before);
  const r=await s.original();compare(s,r);assert.match(r.snapshots.at(-1).error,/deferred parent FK/);
});

test('positive int64 clamping, exact IDs, repeated bids, and marketplace normalization match actual original callbacks',async()=>{
  const s=await setup();await s.run(begin([create({starting_bid:'999999999999999999999.0 WAX',maker_marketplace:' Market.Name '})]));
  await s.run([bid(),bid()]);assert.equal(s.rows()[0].auction_id,auctionId);assert.equal(s.rows()[0].maker_marketplace,' Market.Name ');
  assert.equal(s.snapshots[0][0].price,'9223372036854775807');assert.equal(s.rows()[0].bids.length,2);compare(s,await s.original());
});

test('unsupported bundle/v2/malformed input and unavailable relationships never publish staged effects',async()=>{
  for(const e of [create({asset_ids:[aa.assetId,'2']}),create({starting_bid:'1e3 WAX'}),row({end_time:'1'}),{...bid(),value:{...bid().value,auction_id:2}}]){
    const s=await setup();await s.run(begin());const before=s.snapshot();await assert.rejects(s.run([act('cancelauct'),e]));assert.deepEqual(s.snapshot(),before);
  }
  const s=await setup();await s.run(begin());const before=s.snapshot();await assert.rejects(s.run([create({asset_ids:['2']})]),/retained bundle/);assert.deepEqual(s.snapshot(),before);
  const original=await s.original();assert.equal(original.snapshots.at(-1).links.length,2,'Original creates a bundle; this component explicitly refuses it');
  const unknown={async get(kind,k){if(kind==='market-token')return {status:'unavailable',reason:'missing source'};return s.reader.get(kind,k);}};
  await assert.rejects(readAuctionWithAssets(unknown,market,auctionId,time),/coverage/);
  const v2=await setup();await assert.rejects(v2.run([...begin().filter(e=>e.contract!==market||e.table!=='config'),config('2.0.0')]),/version/);assert.deepEqual(v2.rows(),[]);
});

test('host record bounds reject complete oversized bid history without truncating or committing an earlier cancel',async()=>{
  const s=await setup({selectedLimits:{...limits,value:{...limits.value,arrayElements:4}}});await s.run([config(),create()]);
  for(let i=0;i<4;i++)await s.run([bid()]);const before=s.snapshot();
  await assert.rejects(s.run([act('cancelauct'),bid()]));assert.deepEqual(s.snapshot(),before);assert.equal(s.rows()[0].bids.length,4);
});

test('an old explicit16 record-kind budget remains unchanged and fails actual SDK admission',async()=>{
  const selected={...limits,recordKinds:16},before=structuredClone(selected),plugin=createAtomicStatefulPlugin({limits:selected});
  const registered=plugin.getStatefulProjectionsV2({binding:{}}).projections[0],binding={chainId:'a'.repeat(64),backendId:'controlled',generation:'new-reviewed-declaration',
    mappingRevision:'b'.repeat(64),hookArtifact:'c'.repeat(64),hookRevision:'d'.repeat(64),codecRevision:'e'.repeat(64),normalizerRevision:'f'.repeat(64)};
  assert.ok(registered.definition.records.length>16);assert.equal(registered.limits.recordKinds,16);
  await assert.rejects(captureStatefulDeclaration({...registered.definition,binding,
    selectors:registered.definition.selectors.map(s=>({...s,abiDeployment:s.contract,abiSha256:hash(s.contract)}))},registered.limits),/Record kind bound/);
  assert.deepEqual(selected,before);assert.equal(plugin.getStatefulProjectionsV2({binding:{}}).projections[0].limits.recordKinds,16);
});

test('captured auction inputs/context and nested relationship outputs detach across awaits',async()=>{
  const s=await setup();await s.run(begin());const stored=s.rows()[0],b={marketContract:market,assetsContract:assets,blockNum:'2',blockTimeMs:String(time+1000),blockId:'a'.repeat(64),
    contractVersion:{version:'1.2.2',occurrence:'version',abiDeployment:market,abiSha256:hash(market)}};
  const e={kind:'action',name:'auctionbid',value:bid().value,transactionId:'a'.repeat(64),evidence:{occurrence:'bid',abiDeployment:market,abiSha256:hash(market)}};
  let result;await reduceAuctions(b,[e],{async get(){e.value.bidder='mutated';b.blockNum='999';return {status:'present',value:stored};},put(_k,_id,v){result=v;},delete(){}});
  assert.equal(result.buyer,'buyer');assert.equal(result.updated_at_block,'2');
  let touched=0;const bad={...e};Object.defineProperty(bad,'name',{enumerable:true,get(){touched++;return 'cancelauct';}});
  await assert.rejects(reduceAuctions(b,[bad],s.reader));assert.equal(touched,0);
  const view=await s.read();view.bids.push({bad:true});view.collection.authorized_accounts.push('bad');assert.deepEqual(s.rows()[0],stored);
});

test('missing ABI/version, malformed records and unknown joins are refused; the clock samples after the light read',async()=>{
  const s=await setup();await s.run(begin([create(),act('logauctstart'),bid()]));const row=s.rows()[0];
  for(const kind of ['market-auction','collection','market-token','contract-code','asset']){
    await assert.rejects(readAuctionWithAssets({async get(k,key){return k===kind?{status:'unavailable',reason:'missing source'}:s.reader.get(k,key);}},market,auctionId,time));
  }
  for(const mutate of [v=>{delete v.bids},v=>{v.bids[0].number=2},v=>{v.market_contract='other'},v=>{v.claimed_by_buyer='false'}]){
    const bad=structuredClone(row);mutate(bad);
    await assert.rejects(readAuctionWithAssets({async get(k,key){return k==='market-auction'?{status:'present',value:bad}:s.reader.get(k,key);}},market,auctionId,time));
  }
  const b={marketContract:market,assetsContract:assets,blockNum:'2',blockTimeMs:String(time),blockId:'a'.repeat(64),
    contractVersion:{version:'1.2.2',occurrence:'version',abiDeployment:market,abiSha256:hash(market)}};
  for(const mutate of [e=>{delete e.evidence.occurrence},e=>{e.evidence.abiSha256='b'.repeat(64)},e=>{delete e.transactionId}]){
    const e={kind:'action',name:'auctionbid',value:bid().value,transactionId:'a'.repeat(64),evidence:{occurrence:'bid',abiDeployment:market,abiSha256:hash(market)}};mutate(e);
    let touched=0;await assert.rejects(reduceAuctions(b,[e],{async get(){touched++;return {status:'covered-absent'};}}));assert.equal(touched,0);
  }
  const calls=[];await readAuctionWithAssets({async get(k,key){calls.push(k);return s.reader.get(k,key);}},market,auctionId,()=>{calls.push('clock');return time;});
  assert.ok(calls.indexOf('clock')>calls.indexOf('contract-code'));assert.ok(calls.indexOf('clock')<calls.indexOf('asset'));
});

test('request-scoped auction HTTP matches original status/body and propagates final caller failure',async()=>{
  const s=await setup();await s.run(begin([create(),act('logauctstart'),bid()]));
  const requests=['bad','42',auctionId,'0'+auctionId,'-0'].map(id=>request(Date.now(),id)),r=await s.original(requests),api=Fastify(),calls=[];
  let fail=false;api.setErrorHandler((_e,_r,reply)=>reply.code(503).send({success:false,message:'State unavailable'}));
  s.plugin.addRoutes(api,{statefulQueryHost(request){calls.push(request.url);return {async compose(_id,fn){const value=await fn(s.reader);if(fail)throw Error('final fence');return {value};}};}});
  try{for(const c of r.requests){const response=await api.inject('/atomicmarket/v1/auctions/'+encodeURIComponent(c.id));const body=response.json();delete body.query_time;
    assert.deepEqual({status:response.statusCode,body},{status:c.status,body:c.body});}
    fail=true;assert.equal((await api.inject('/atomicmarket/v1/auctions/'+auctionId)).statusCode,503);
    for(const id of ['null','-1','9223372036854775808'])assert.equal((await api.inject('/atomicmarket/v1/auctions/'+id)).statusCode,503);
    assert.equal(calls.length,requests.length+4);
  }finally{await api.close();}
});
