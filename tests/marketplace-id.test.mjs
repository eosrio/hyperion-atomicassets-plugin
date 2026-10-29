import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import Fastify from 'fastify';
import * as sdk from '@eosrio/hyperion-sdk/projection-stateful';
import {executeOriginalMarketplaceControls,executeReferenceFixture} from '../harness/shared/reference.mjs';
import {atomicLimits,atomicSource} from '../harness/stateful/scenario.mjs';

const dist=process.env.ATOMIC_PLUGIN_DIST_ROOT??fileURLToPath(new URL('../dist',import.meta.url));
const {createAtomicStatefulPlugin,ATOMIC_HOOK_INVENTORY}=await import(pathToFileURL(join(dist,'index.js')).href);
const contract='atomicmarket',key=(...v)=>JSON.stringify(v),hex=n=>n.toString(16).padStart(64,'0');
const hash=value=>createHash('sha256').update(value).digest('hex');
const limits={...atomicLimits,selectors:128,recordKinds:20,readAttempts:128,mutations:64};
const binding={chainId:hex(10),backendId:'controlled',generation:'marketplace19-new-source-generation',mappingRevision:hex(11),
  hookArtifact:hex(12),hookRevision:hex(13),codecRevision:hex(14),normalizerRevision:hex(15)};
const row=(name='marketplace1',creator='alice',present=true)=>({present,value:{marketplace_name:name,creator}});
const block=(number,rows)=>({block:{block_num:number,block_id:hex(number),timestamp:new Date(1700000000000+(number-123)*1000).toISOString().slice(0,-1)},rows});
const blocks=[block(123,[row()]),block(124,[row('marketplace1','bob'),row('marketplace1','carol')]),
  block(125,[row('MARKETPLACE1','case-sensitive'),row('a/b','slash'),row('marketplace1','')])];
const source=b=>({previous:{blockNum:b.block.block_num-1,blockId:hex(b.block.block_num-1)},
  block:{blockNum:b.block.block_num,blockId:b.block.block_id,previousBlockId:hex(b.block.block_num-1),timeMs:String(Date.parse(b.block.timestamp+'Z'))},
  inputs:b.rows.map((r,i)=>({kind:'table',contract,name:'marketplaces',present:r.present,data:structuredClone(r.value),
    identity:{kind:'contract-row',scope:contract,primaryKey:String(i)},transactionId:null,
    sourceEvidence:hash('actual-controlled-marketplace:'+b.block.block_num+':'+i),abiDeployment:'marketplace-original-epoch',abiSha256:hex(20)}))});
const definition=(plugin)=>{const d=plugin.getStatefulProjectionsV2({binding:{},sourceCapabilities:['original-action-authorization-v1']}).projections[0];return {...d.definition,binding,
  selectors:d.definition.selectors.map(s=>({...s,abiDeployment:'marketplace-original-epoch',abiSha256:hex(20)}))};};
let evidenceCount=0;
async function retain(label,result){const root=new URL('../out/marketplace-id/',import.meta.url);await mkdir(root,{recursive:true});
  await writeFile(new URL('original-'+process.version+'-'+process.pid+'-'+ ++evidenceCount+'-'+label+'.json',root),JSON.stringify(result,null,2)+'\n');return result;}
let originalResult;
const original=()=>originalResult??=(async()=>retain('chronology',await executeOriginalMarketplaceControls({referenceRoot:process.env.AA_REFERENCE_ROOT,input:{contract,blocks}})))();
// Explicit original bigint storage/type-parser boundary, not a physical PostgreSQL comparison.
const sqlRow=r=>({...r,created_at_block:String(r.created_at_block),created_at_time:String(r.created_at_time)});
async function setup(){
  const plugin=createAtomicStatefulPlugin({limits}),descriptor=plugin.getStatefulProjectionsV2({binding:{},sourceCapabilities:['original-action-authorization-v1']}).projections[0];
  const declaration=await sdk.captureStatefulDeclaration(definition(plugin),descriptor.limits);
  let state=new Map(),failOpen=null,failRead=null,failAfter=null,unknown=false,address;
  const calls=[],compositions=[],errors=[],reader={async get(kind,k){calls.push({kind,key:k,reader});if(failRead)throw failRead;
    if(unknown)return {status:'unavailable',reason:'Controlled source coverage unavailable'};
    return state.has(kind+k)?{status:'present',value:structuredClone(state.get(kind+k))}:{status:'covered-absent'};}};
  const api=Fastify();api.setErrorHandler((error,_request,reply)=>{errors.push(error);reply.code(503).send({success:false,message:'State unavailable'});});
  plugin.addRoutes(api,{statefulQueryHost(request){assert.ok(request.id);if(failOpen)throw failOpen;return {async compose(id,compose){
    compositions.push(id);assert.equal(id,'atomicassets');const value=await compose(reader);if(failAfter)throw failAfter;return {value};}};}});
  return {plugin,descriptor,declaration,api,calls,compositions,errors,reader,snapshot:()=>structuredClone(state),
    seed(v){state.set('marketplace'+key(contract,'marketplace1'),structuredClone(v));},
    fail(where,error){if(where==='open')failOpen=error;else if(where==='read')failRead=error;else failAfter=error;},unknown(v){unknown=v;},
    async run(b){const next=structuredClone(state);await descriptor.reduce({source:source(b),
      async get(kind,k){return next.has(kind+k)?{status:'present',value:structuredClone(next.get(kind+k))}:{status:'covered-absent'};},
      put(kind,k,v){sdk.canonicalStatefulRecord(declaration,kind,v);next.set(kind+k,structuredClone(v));},delete(kind,k){next.delete(kind+k);}});state=next;},
    async request(name='marketplace1',method='GET'){
      const url='/atomicmarket/v1/marketplaces/'+encodeURIComponent(name);
      // Node's real HEAD transport suppresses the body; Fastify.inject intentionally retains it.
      if(method==='HEAD'){address??=await api.listen({port:0,host:'127.0.0.1'});const response=await fetch(address+url,{method});
        assert.equal(response.body,null);return {status:response.status,body:await response.text()};}
      const response=await api.inject({url,method}),body=response.json();
      if(body.success)assert.ok(Number.isSafeInteger(body.query_time));delete body.query_time;return {status:response.statusCode,body};}};
}

test('actual marketplace table inputs match original creation, ordered replacements and retained timestamps',async()=>{
  const expected=await original(),s=await setup();try{
    assert.equal(expected.scope.originalMarketplaceProcessor,true);assert.equal(expected.scope.originalReplaceSqlGenerator,true);
    assert.equal(expected.scope.postgresExecution,false);assert.equal(expected.sources.length,5);assert.equal(expected.listenersReleased,true);
    for(const [n,b]of blocks.entries()){await s.run(b);assert.deepEqual([...s.snapshot().values()],expected.snapshots[n].rows.map(sqlRow));}
    const value=(await s.request()).body.data;assert.equal(value.creator,'');assert.equal(value.created_at_block,'123');assert.equal(value.created_at_time,'1700000000000');
    assert.deepEqual(Object.keys(value).sort(),['created_at_block','created_at_time','creator','marketplace_name']);
    assert.ok(ATOMIC_HOOK_INVENTORY.hooks.some(h=>h.name==='marketplaces'&&h.processor==='marketplaces'&&h.coverage==='partial'));
  }finally{await s.api.close();}
});

test('the original marketplace deletion refusal is retained and earlier staged changes never escape failures',async()=>{
  const result=await retain('delete',await executeOriginalMarketplaceControls({referenceRoot:process.env.AA_REFERENCE_ROOT,
    input:{contract,blocks:[block(123,[{present:false,value:{}}])]}}));
  assert.equal(result.error.message,'AtomicMarket: Marketplace deleted. Should not be possible');assert.deepEqual(result.calls,[]);
  const s=await setup();try{await s.run(blocks[0]);const before=s.snapshot();
    await assert.rejects(s.run(block(124,[row('marketplace1','tentative'),{present:false,value:{}}])),/Marketplace deleted/);
    assert.deepEqual(s.snapshot(),before);
    await assert.rejects(s.run(block(124,[row('marketplace1','tentative'),row('second',42)])),/marketplace text/);
    assert.deepEqual(s.snapshot(),before);
  }finally{await s.api.close();}
});

test('marketplace HTTP success, literal names, original416 and all-method registration match the original routes',async()=>{
  const expected=await original(),s=await setup();for(const b of blocks)await s.run(b);
  const fixture=JSON.parse(readFileSync(new URL('../fixtures/harness/atomicmarket/marketplace.input.json',import.meta.url)));
  try{for(const [name,method]of [['marketplace1','GET'],['MARKETPLACE1','GET'],['missing','GET'],['a/b','GET'],["' OR 1=1 --",'GET'],['marketplace1','POST'],['marketplace1','HEAD']]){
    const f=structuredClone(fixture);f.request={method,path:'/atomicmarket/v1/marketplaces/'+encodeURIComponent(name)};
    f.queries[1].parameters=[contract,name];f.queries[1].rows=expected.finalRows.filter(r=>r.marketplace_name===name).map(r=>{
      const {market_contract,...selected}=sqlRow(r);return selected;});
    const result=await retain('http',await executeReferenceFixture({referenceRoot:process.env.AA_REFERENCE_ROOT,fixture:f}));
    assert.equal(result.database.unused,0);const body=structuredClone(result.response.body);if(body&&typeof body==='object')delete body.query_time;
    assert.deepEqual(await s.request(name,method),{status:result.response.status,body});
  }
  assert.ok(s.calls.every(c=>c.kind==='marketplace'&&c.reader===s.reader));assert.equal(s.compositions.length,7);
  }finally{await s.api.close();}
});

test('covered absence differs from unknown coverage and every final host failure retains caller error ownership',async()=>{
  const s=await setup();try{await s.run(blocks[0]);s.unknown(true);
    for(const name of ['marketplace1','missing'])assert.equal((await s.request(name)).status,503);
    s.unknown(false);assert.deepEqual(await s.request('missing'),{status:416,body:{success:false,message:'Marketplace not found'}});
    for(const where of ['open','read','after']){const error=Error(where);s.fail(where,error);
      for(const name of ['marketplace1','missing']){assert.equal((await s.request(name)).status,503);assert.equal(s.errors.at(-1),error);}
      s.fail(where,null);}
  }finally{await s.api.close();}
});

test('the marketplace route forwards original416 from a caller-covered empty view',async()=>{
  const s=await setup();try{assert.deepEqual(await s.request('missing'),{status:416,body:{success:false,message:'Marketplace not found'}});
    assert.equal(s.compositions.length,1);assert.equal(s.calls.length,1);
  }finally{await s.api.close();}
});

test('malformed marketplace records and unsupported NUL names cannot become successful or absent responses',async()=>{
  const s=await setup();try{await s.run(blocks[0]);const good=s.snapshot().get('marketplace'+key(contract,'marketplace1'));
    for(const change of [v=>{v.market_contract='other'},v=>{v.marketplace_name='other'},v=>{delete v.created_at_time},v=>{v.created_at_block=123},v=>{v.creator=null}]){
      const bad=structuredClone(good);change(bad);s.seed(bad);assert.equal((await s.request()).status,503);}
    s.seed(good);assert.equal((await s.request('NUL\0name')).status,503);assert.equal((await s.request()).status,200);
  }finally{await s.api.close();}
});

test('the compound declaration keeps explicit19 unchanged and requires explicit20 plus a new source generation',async()=>{
  for(const count of [16,17,18,19,20]){const supplied={...limits,recordKinds:count},before=structuredClone(supplied),plugin=createAtomicStatefulPlugin({limits:supplied});
    const registered=plugin.getStatefulProjectionsV2({binding:{},sourceCapabilities:['original-action-authorization-v1']}).projections[0];assert.equal(registered.definition.records.length,20);
    assert.ok(registered.definition.records.some(r=>r.kind==='marketplace'));assert.equal(registered.limits.recordKinds,count);
    if(count<20)await assert.rejects(sdk.captureStatefulDeclaration(definition(plugin),registered.limits),/Record kind bound/);
    else assert.equal((await sdk.captureStatefulDeclaration(definition(plugin),registered.limits)).definition.records.length,20);
    assert.deepEqual(supplied,before);assert.equal(plugin.getStatefulProjectionsV2({binding:{},sourceCapabilities:['original-action-authorization-v1']}).projections[0].limits.recordKinds,count);}
});

// Existing SDK v1 execution seam tests only private domain staging/bounds. This is not v2 owner/source authority.
async function sdkStage(selected,events,hook){
  const {reduceMarketplace}=await import(pathToFileURL(join(dist,'atomicmarket/internal/marketplace-state.js')).href);
  const plugin=createAtomicStatefulPlugin({limits:selected}),def=definition(plugin),cap=supported=>({family:sdk.STATEFUL_FAMILY,interfaceVersion:1,supported,limits:selected});
  const adapter={capabilities:cap(sdk.STATEFUL_ADAPTER_CAPABILITIES),async open(){return view;},async read(expected,keys){return {view:expected,results:keys.map(()=>({status:'covered-absent'}))};}};
  const declaration=await sdk.negotiateStatefulProjection(def,selected,cap(sdk.STATEFUL_HOST_CAPABILITIES),adapter.capabilities);
  const raw=atomicSource(def,1,events.map(value=>({kind:'row',contract,table:'marketplaces',scope:contract,value})));
  const captured=await sdk.captureStatefulSource(declaration,raw),view={declarationDigest:declaration.digest,backendId:binding.backendId,
    generation:binding.generation,revision:hex(30),checkpoint:raw.previous};
  let port;const run=()=>sdk.reduceStatefulBlock(declaration,captured,adapter,async p=>{port=p;
    if(hook)return hook(p,reduceMarketplace);
    for(const entry of p.source.inputs)await reduceMarketplace({contract,blockNum:String(p.source.block.blockNum),blockTimeMs:p.source.block.timeMs},entry.data.value,p);
  },()=>{});return {run,port:()=>port};
}

test('actual SDK staging shadows repeated keys, closes failed ports and discards the candidate on a later domain error',async()=>{
  const s=await sdkStage(limits,[row().value,row('marketplace1','bob').value]);const candidate=await s.run();
  assert.equal(candidate.mutations.length,2);assert.equal(candidate.mutations[1].value.creator,'bob');
  assert.equal(candidate.mutations[0].value.created_at_time,candidate.mutations[1].value.created_at_time);
  const bad=await sdkStage(limits,[row().value,row('second',42).value]);await assert.rejects(bad.run(),/marketplace text/);
  await assert.rejects(bad.port().get('marketplace',key(contract,'marketplace1')),/port is closed/);
});

test('actual SDK key, mutation and value limits refuse complete marketplace staging without truncation',async()=>{
  const cases=[{selected:{...limits,keyBytes:64},events:[row('n'.repeat(64)).value]},
    {selected:{...limits,mutations:1},events:[row().value,row('second').value]},
    {selected:{...limits,value:{...limits.value,stringBytes:16}},events:[row().value,row('second','x'.repeat(17)).value]}];
  for(const {selected,events}of cases)await assert.rejects(async()=>{const s=await sdkStage(selected,events);await s.run();},/bound|limit/i);
});

test('marketplace source scope is required and all earlier collection, asset, sale and auction routes remain registered',async()=>{
  const s=await setup();try{const invalid=source(blocks[0]);invalid.inputs[0].identity={kind:'table-delta'};
    await assert.rejects(s.descriptor.reduce({source:invalid}),/scoped table identity/);
    for(const url of ['/atomicassets/v1/assets/42','/atomicassets/v1/collections/missing','/atomicmarket/v1/sales/42','/atomicmarket/v1/auctions/42'])
      assert.equal((await s.api.inject(url)).statusCode,416);
  }finally{await s.api.close();}
});
