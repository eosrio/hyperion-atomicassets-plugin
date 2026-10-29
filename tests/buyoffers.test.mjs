import assert from 'node:assert/strict';import test from 'node:test';
import {createHash} from 'node:crypto';import {mkdir,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import Fastify from 'fastify';import {captureStatefulDeclaration,canonicalStatefulRecord} from '@eosrio/hyperion-sdk/projection-stateful';
import {executeOriginalBuyofferControls} from '../harness/shared/reference.mjs';
import {initial,input as aa,fixture,key} from './fixtures/asset-domain-cases.mjs';import {atomicLimits} from '../harness/stateful/scenario.mjs';
const dist=process.env.ATOMIC_PLUGIN_DIST_ROOT??fileURLToPath(new URL('../dist',import.meta.url));
const {createAtomicStatefulPlugin}=await import(pathToFileURL(join(dist,'index.js')).href);
const {readBuyofferWithAssets}=await import(pathToFileURL(join(dist,'atomicmarket/internal/buyoffer-assets.js')).href);
const {reduceBuyoffers}=await import(pathToFileURL(join(dist,'atomicmarket/internal/buyoffers.js')).href);
const market='atomicmarket',assets=aa.contract,buyofferId='9007199254740993',time=1700000000000,capability='original-action-authorization-v1';
const hash=x=>createHash('sha256').update(x).digest('hex'),limits={...atomicLimits,selectors:128,recordKinds:20,readAttempts:128,mutations:64},json=v=>JSON.parse(JSON.stringify(v));
const act=(name,value={buyoffer_id:buyofferId},authorization=[{actor:market,permission:'active'}])=>({kind:'action',contract:market,name,value,authorization});
const create=(overrides={},authorization)=>act('lognewbuyo',{buyoffer_id:buyofferId,buyer:'buyer',recipient:'alice',price:'90071992547.40993 WAX',asset_ids:[aa.assetId],
  memo:'original memo',maker_marketplace:'',collection_name:aa.collection,collection_fee:.05,...overrides},authorization);
const accept=(taker='')=>act('acceptbuyo',{buyoffer_id:buyofferId,expected_asset_ids:[],expected_price:'ignored',taker_marketplace:taker});
const config=(version='1.2.2')=>({kind:'row',contract:market,table:'config',scope:market,present:true,value:{version,atomicassets_account:assets,
  supported_tokens:[{token_contract:'eosio.token',token_symbol:'8,WAX'}],supported_symbol_pairs:[]}});
const begin=(events=[create()])=>[...initial().map(e=>({...e,contract:assets})),config(),...events];
const rebase=v=>{for(const[k,x]of Object.entries(v)){if(x&&typeof x==='object')rebase(x);else if(x!==null&&/_at_block$/.test(k))v[k]='1';else if(x!==null&&/_at_time$/.test(k))v[k]=String(time);}return v;};
const assetView=rebase(structuredClone(fixture.stages[0].view)),collection=rebase(structuredClone(fixture.stages[0].collections[0]));
const relations={collection,token:{market_contract:market,token_contract:'eosio.token',token_symbol:'WAX',token_precision:8}};let referenceNumber=0;
async function setup({selectedLimits=limits}={}){
  const plugin=createAtomicStatefulPlugin({limits:selectedLimits}),registered=plugin.getStatefulProjectionsV2({binding:{},sourceCapabilities:[capability]}).projections[0];
  const binding={chainId:'a'.repeat(64),backendId:'controlled',generation:'buyoffer20-new-declaration',mappingRevision:'b'.repeat(64),hookArtifact:'c'.repeat(64),
    hookRevision:'d'.repeat(64),codecRevision:'e'.repeat(64),normalizerRevision:'f'.repeat(64)};
  const declaration=await captureStatefulDeclaration({...registered.definition,binding,selectors:registered.definition.selectors.map(s=>({...s,abiDeployment:s.contract,abiSha256:hash(s.contract)}))},selectedLimits);
  let state=new Map();const blocks=[],snapshots=[],reads=[];
  const reader={async get(kind,k){reads.push({kind,key:k,reader});return state.has(kind+k)?{status:'present',value:structuredClone(state.get(kind+k))}:{status:'covered-absent'};}};
  const s={plugin,registered,declaration,blocks,snapshots,reader,reads,rows:()=>[...state].filter(([k])=>k.startsWith('market-buyoffer[')).map(([,v])=>structuredClone(v)),
    snapshot:()=>structuredClone(state),seed(kind,k,v){state.set(kind+k,structuredClone(v));},
    async run(events,{marker=1}={}){const number=blocks.length+1,timeMs=time+(number-1)*1000;blocks.push({number,timeMs,events:structuredClone(events)});
      const next=structuredClone(state),p={source:{previous:{blockNum:number-1,blockId:hash(String(number-1))},block:{blockNum:number,blockId:hash(String(number)),previousBlockId:hash(String(number-1)),timeMs:String(timeMs)},
        ...(marker===undefined?{}:{actionMetadataVersion:marker}),inputs:events.map((e,i)=>({kind:e.kind==='row'?'table':'action',contract:e.contract,name:e.table??e.name,data:structuredClone(e.value),
          sourceEvidence:hash(number+':'+i),abiDeployment:e.contract,abiSha256:hash(e.contract),transactionId:e.transactionId??'a'.repeat(64),
          ...(e.kind==='row'?{identity:{kind:'contract-row',scope:e.scope??e.contract,primaryKey:String(i)},present:e.present}:{authorization:structuredClone(e.authorization??[{actor:e.contract,permission:'active'}])})}))},
        async get(kind,k){return next.has(kind+k)?{status:'present',value:structuredClone(next.get(kind+k))}:{status:'covered-absent'};},
        put(kind,k,v){canonicalStatefulRecord(declaration,kind,v);next.set(kind+k,structuredClone(v));},delete(kind,k){next.delete(kind+k);}};
      let error;try{await registered.reduce(p);state=next;}catch(e){error=e;}snapshots.push(s.rows());if(error)throw error;
    },read(view=reader){return readBuyofferWithAssets(view,market,buyofferId);},
    async original(requests=[],overrides={}){const result=await executeOriginalBuyofferControls({referenceRoot:process.env.AA_REFERENCE_ROOT,input:{market,assets,
      blocks:blocks.map(b=>({...b,events:b.events.filter(e=>e.contract===market&&e.kind==='action')})),relations,requests,...overrides}});
      const dir=new URL('../out/buyoffers/',import.meta.url);await mkdir(dir,{recursive:true});await writeFile(new URL('original-'+process.version+'-'+process.pid+'-'+(++referenceNumber)+'.json',dir),JSON.stringify(result,null,2)+'\n');return result;}};return s;
}
function compare(s,r){assert.equal(r.scope.postgres,false);assert.equal(r.listenerAttempts,0);assert.equal(r.snapshots.length,s.snapshots.length);
  for(let i=0;i<s.snapshots.length;i++){assert.deepEqual(s.snapshots[i].map(({asset_ids,...v})=>v),r.snapshots[i].buyoffers,'buyoffer block '+(i+1));
    assert.deepEqual(s.snapshots[i].flatMap(v=>v.asset_ids),r.snapshots[i].links.map(v=>v.asset_id));}}
const request=(id=buyofferId,assetRows=[assetView],method='GET')=>({id,assetRows,method,nowMs:time});

test('actual original actions match chronological create/decline/accept replay guard/cancel and recreated timestamps',async()=>{
  const s=await setup();await s.run(begin());assert.equal((await s.read()).state,0);
  await s.run([act('declinebuyo',{buyoffer_id:buyofferId,decline_memo:'declined'})]);assert.equal((await s.read()).state,1);
  await s.run([accept('first')]);const accepted=s.rows();await s.run([accept('ignored')]);assert.deepEqual(s.rows(),accepted);
  await s.run([act('cancelbuyo')]);assert.equal((await s.read()).state,2);
  await s.run([create({buyer:'newbuyer',memo:'reset',maker_marketplace:' Market.Name '})]);assert.equal(s.rows()[0].created_at_block,'6');
  assert.equal(s.rows()[0].taker_marketplace,null);assert.equal(s.rows()[0].decline_memo,null);compare(s,await s.original());
});
test('original1020 creation precedes1040 updates with stable equal-priority order and absent updates have no rows',async()=>{
  for(const events of [[accept(),create()],[create(),accept(),act('cancelbuyo')],[create(),act('cancelbuyo'),accept()],
    [act('cancelbuyo'),act('declinebuyo',{buyoffer_id:buyofferId,decline_memo:'absent'}),accept()]]){
    const s=await setup();await s.run(begin(events));const r=await s.original();compare(s,r);assert.deepEqual(r.executed.map(e=>e.priority),r.executed.map(e=>e.priority).sort((a,b)=>a-b));
  }
});
test('original authorization is ordered metadata, empty lists pass, foreign actors skip before data and missing metadata refuses',async()=>{
  for(const permissions of [[],[{actor:market,permission:'active'},{actor:market,permission:'owner'}],
    [{actor:'foreign',permission:'active'}],[{actor:market,permission:'active'},{actor:'foreign',permission:'owner'}]]){
    const s=await setup();await s.run(begin([create({},permissions)]));compare(s,await s.original());assert.equal(s.rows().length,permissions.some(a=>a.actor!==market)?0:1);
  }
  const skipped=await setup();await skipped.run(begin([act('lognewbuyo',{memo:'NUL\0unsupported'},[{actor:'foreign',permission:'active'}])]));compare(skipped,await skipped.original());
  const s=await setup();await s.run(begin());const before=s.snapshot();await assert.rejects(s.run([create()],{marker:0}),/negotiated original/);assert.deepEqual(s.snapshot(),before);
  const context={marketContract:market,assetsContract:assets,blockNum:'1',blockTimeMs:String(time),blockId:'1'.repeat(64),contractVersion:{version:'1.2.2',occurrence:'config',abiDeployment:market,abiSha256:hash(market)}};
  for(const auth of [undefined,null,{},[{actor:market}],{actor:market,permission:'active'}]){
    const e={kind:'action',name:'lognewbuyo',value:create().value,evidence:{occurrence:'action',abiDeployment:market,abiSha256:hash(market)},...(auth===undefined?{}:{authorization:auth})};
    await assert.rejects(reduceBuyoffers(context,[e],{async get(){assert.fail('must refuse before read');},put(){assert.fail('no write');}}));
  }
});
test('coherent ID HTTP matches actual original handler/filler/formatter including416, leading zeros, methods and missing assets',async()=>{
  const s=await setup();await s.run(begin());const requests=[request(),request('0'+buyofferId),request('bad'),request('42'),request(buyofferId,[]),request(buyofferId,[assetView],'POST'),request(buyofferId,[assetView],'HEAD')];
  const r=await s.original(requests);compare(s,r);assert.equal(r.requests[0].body.data.state,0);assert.equal(r.requests[4].body.data.state,4);
  const api=Fastify();s.plugin.addRoutes(api,{statefulQueryHost:()=>({async compose(id,operation){assert.equal(id,'atomicassets');return {value:await operation(s.reader)};}})});
  let address;
  try{for(const item of r.requests){const url='/atomicmarket/v1/buyoffers/'+item.id;
    // inject retains an explicit HEAD payload; Node's real HTTP transport suppresses it.
    if(item.method==='HEAD'){address??=await api.listen({port:0,host:'127.0.0.1'});const response=await fetch(address+url,{method:'HEAD'});
      assert.equal(response.status,item.status);assert.equal(response.body,null);assert.equal(await response.text(),'');continue;}
    const response=await api.inject({method:item.method,url});assert.equal(response.statusCode,item.status);
    if(item===r.requests[4]){const missing={async get(kind,k){return kind==='asset'?{status:'covered-absent'}:s.reader.get(kind,k);}};
      assert.deepEqual(json(await s.read(missing)),item.body.data);continue;}
    const body=response.json();delete body.query_time;assert.deepEqual(body,item.body);}
  }finally{await api.close();}
  assert.ok(s.reads.every(r=>r.reader===s.reader));assert.equal(s.reads.some(r=>r.kind==='contract-code'),false);
});
test('pending follows current asset owner, current collection fee differs from retained fee and missing inner joins are absence',async()=>{
  const s=await setup();await s.run(begin());const initialView=await s.read();assert.equal(initialView.state,0);const original=s.snapshot();
  const asset=original.get('asset'+key(assets,aa.assetId));s.seed('asset',key(assets,aa.assetId),{...asset,owner:'different'});assert.equal((await s.read()).state,4);
  s.seed('asset',key(assets,aa.assetId),asset);s.seed('collection',key(assets,aa.collection),{...original.get('collection'+key(assets,aa.collection)),market_fee:.2});
  const current=await s.read();assert.equal(current.collection.market_fee,.05);assert.equal(current.current_collection_fee,.2);
  for(const missing of ['collection','market-token'])assert.equal(await s.read({async get(kind,k){return kind===missing?{status:'covered-absent'}:s.reader.get(kind,k);}}),null);
  await assert.rejects(s.read({async get(){return {status:'unavailable',reason:'unknown'};}}),/coverage/);
});
test('clamping and same-link recreate match original; retained bundles/unsupported versions fail atomically',async()=>{
  const s=await setup();await s.run(begin([create({price:'999999999999999999999.0 WAX'})]));assert.equal(s.rows()[0].price,'9223372036854775807');compare(s,await s.original());
  const before=s.snapshot();await assert.rejects(s.run([act('cancelbuyo'),create({asset_ids:['42']})]),/retained bundle/);assert.deepEqual(s.snapshot(),before);
  await assert.rejects(s.run([create({asset_ids:[aa.assetId,'42']})]),/bundles/);assert.deepEqual(s.snapshot(),before);
  const unsupported=await setup();await assert.rejects(unsupported.run([...begin().filter(e=>!(e.contract===market&&e.table==='config')),config('2.0.0')]),/Unsupported market config\/version\/assets contract/);assert.equal(unsupported.rows().length,0);
});
test('the20-kind declaration refuses old hosts and explicit19 without changing caller budget',async()=>{
  const plugin=createAtomicStatefulPlugin({limits:{...limits,recordKinds:19}});
  for(const context of [undefined,{}, {binding:{}},{binding:{},sourceCapabilities:[]}])assert.throws(()=>plugin.getStatefulProjectionsV2(context));
  const supplied={...limits,recordKinds:19},before=structuredClone(supplied),p=createAtomicStatefulPlugin({limits:supplied});
  const d=p.getStatefulProjectionsV2({binding:{},sourceCapabilities:[capability]}).projections[0];assert.equal(d.definition.records.length,20);assert.equal(d.limits.recordKinds,19);
  await assert.rejects(setup({selectedLimits:supplied}),/Record kind bound/);assert.deepEqual(supplied,before);assert.deepEqual(d.requiredSourceCapabilities,[capability]);
});
