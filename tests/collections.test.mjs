import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import Fastify from 'fastify';
import {captureStatefulDeclaration,canonicalStatefulRecord} from '@eosrio/hyperion-sdk/projection-stateful';
import {atomicLimits} from '../harness/stateful/scenario.mjs';
import {executeOriginalCollectionControls} from '../harness/shared/reference.mjs';
import {input,collectionRow,row,block,key} from './fixtures/asset-domain-cases.mjs';
import profiles from '../harness/atomicassets/lifecycle-input.cjs';
const dist=process.env.ATOMIC_PLUGIN_DIST_ROOT??fileURLToPath(new URL('../dist',import.meta.url));
const {createAtomicStatefulPlugin,ATOMIC_HOOK_INVENTORY}=await import(pathToFileURL(join(dist,'index.js')).href);
const limits={...atomicLimits,selectors:128,recordKinds:18,readAttempts:128,mutations:64};
const swap=(author='nextauthor',date=1700000000,present=true,name=input.collection)=>row('authorswaps',{
  collection_name:name,new_author:author,acceptance_date:date},input.contract,present);
const initial=()=>[collectionRow(),row('config',{supported_tokens:[],collection_format:input.collectionFormat},input.contract)];
const caseInput={contract:input.contract,collection:input.collection,inputProfile:profiles.loadInputProfile('portable-safe-image').descriptor,cases:[
  {name:'chronological',blocks:[initial(),[swap()],[swap('replacement',4294967295)],
    [collectionRow({...input.collectionData,name:'current collection name'})],[swap('unused',0,false)]].map((events,n)=>({...block(n),events}))},
  {name:'swap-before-create',blocks:[{...block(0),events:[swap(),...initial()]}]},
  {name:'swap-after-create',blocks:[{...block(0),events:[...initial(),swap()]}]},
  {name:'unknown-swap',blocks:[{...block(0),events:[swap('unknown',0,true,'unknowncol'),...initial(),swap('unused',0,false,'unknowncol')]}]},
  {name:'collection-delete',blocks:[{...block(0),events:initial()},{...block(1),events:[swap(),{...collectionRow(),present:false}]}]},
  {name:'literal-names',requests:[input.collection,input.collection.toUpperCase(),'missing',"' OR 1=1 --",'a%_b','a/b'],blocks:[{...block(0),events:initial()}]},
]};
let reference;
const original=()=>reference??=(async()=>{
  const result=await executeOriginalCollectionControls({referenceRoot:process.env.AA_REFERENCE_ROOT,input:caseInput});
  const dir=new URL('../out/collections/',import.meta.url);await mkdir(dir,{recursive:true});
  await writeFile(new URL('original-'+process.version+'-'+process.pid+'.json',dir),JSON.stringify(result,null,2)+'\n');return result;
})();
const binding={chainId:'a'.repeat(64),backendId:'controlled',generation:'collection-source-reviewed',mappingRevision:'b'.repeat(64),
  hookArtifact:'c'.repeat(64),hookRevision:'d'.repeat(64),codecRevision:'e'.repeat(64),normalizerRevision:'f'.repeat(64)};
async function setup(){
  const plugin=createAtomicStatefulPlugin({limits}),descriptor=plugin.getStatefulProjectionsV2({binding:{}}).projections[0];
  const declaration=await captureStatefulDeclaration({...descriptor.definition,binding,
    selectors:descriptor.definition.selectors.map(s=>({...s,abiDeployment:'actual-abi-occurrence',abiSha256:'a'.repeat(64)}))},descriptor.limits);
  let state=new Map();const calls=[];let unknown=false,fail=false;
  const read={async get(kind,k){calls.push({kind,key:k});return unknown?{status:'unavailable',reason:'No authority'}:
    state.has(kind+k)?{status:'present',value:structuredClone(state.get(kind+k))}:{status:'covered-absent'};}};
  const api=Fastify();api.setErrorHandler((_error,_request,reply)=>reply.code(503).send({success:false,message:'State unavailable'}));
  plugin.addRoutes(api,{statefulQueryHost(){return {async compose(id,query){assert.equal(id,'atomicassets');
    const value=await query(read);if(fail)throw Error('Final caller fence');return {value};}};}});
  return {plugin,descriptor,declaration,api,calls,snapshot:()=>structuredClone(state),seed(kind,k,v){state.set(kind+k,structuredClone(v));},
    unknown(v){unknown=v;},fail(v){fail=v;},
    async run(b){const next=structuredClone(state);await descriptor.reduce({source:{previous:{blockNum:Number(b.blockNum)-1,blockId:'0'.repeat(64)},
      block:{blockNum:Number(b.blockNum),blockId:b.blockId,previousBlockId:'0'.repeat(64),timeMs:b.blockTimeMs},inputs:b.events.map((e,i)=>({kind:'table',
        contract:input.contract,name:e.table,data:structuredClone(e.value),sourceEvidence:e.evidence.occurrence,abiDeployment:e.evidence.abiDeployment,
        abiSha256:e.evidence.abiSha256,transactionId:null,present:e.present,identity:{kind:'contract-row',scope:e.scope,primaryKey:String(i)}}))},
      async get(kind,k){return next.has(kind+k)?{status:'present',value:structuredClone(next.get(kind+k))}:{status:'covered-absent'};},
      put(kind,k,v){canonicalStatefulRecord(declaration,kind,v);next.set(kind+k,structuredClone(v));},delete(kind,k){next.delete(kind+k);}});state=next;},
    async request(name=input.collection){const response=await api.inject('/atomicassets/v1/collections/'+encodeURIComponent(name));const body=response.json();
      if(body.success)assert.equal(typeof body.query_time,'number');delete body.query_time;return {status:response.statusCode,body};},
  };
}

test('collection-ID complete fields and original416 absence match actual original handler and callback state',async()=>{
  const reference=await original();assert.equal(reference.listenerAttempts,0);assert.equal(reference.sources.length,10);assert.equal(reference.scope.postgres,false);
  for(const item of caseInput.cases){const expected=reference.cases.find(c=>c.name===item.name),s=await setup();
    try{for(const [n,b]of item.blocks.entries()){
      if(expected.snapshots[n].error)await assert.rejects(s.run(b));else await s.run(b);
      const rows=[...s.snapshot()].filter(([k])=>k.startsWith('collection[')).map(([,v])=>v);
      assert.deepEqual(rows,expected.snapshots[n].rows,item.name+' block'+n);
      for(const request of expected.requests.filter(r=>r.block===n))assert.deepEqual(await s.request(request.name),{status:request.status,body:request.body});
    }}finally{await s.api.close();}
  }
});

test('author swaps use source priority20 and stable order, update/erase existing rows and never create unknown collections',async()=>{
  const result=await original();
  assert.ok(ATOMIC_HOOK_INVENTORY.hooks.some(h=>h.name==='authorswaps'&&h.processor==='collections'&&h.coverage==='partial'));
  assert.ok(ATOMIC_HOOK_INVENTORY.hooks.some(h=>h.name==='authorswaps'&&h.processor==='logs'&&h.coverage==='unimplemented'));
  for(const name of ['swap-before-create','swap-after-create','unknown-swap']){
    const item=caseInput.cases.find(c=>c.name===name),s=await setup();try{
      await s.run(item.blocks[0]);const value=(await s.request()).body.data;
      assert.equal(value.new_author_name,name==='swap-after-create'?'nextauthor':null);
      assert.equal([...s.snapshot()].filter(([k])=>k.startsWith('collection[')).length,1);
      assert.deepEqual(result.cases.find(c=>c.name===name).executed.map(e=>e.priority).sort((a,b)=>a-b),
        result.cases.find(c=>c.name===name).executed.map(e=>e.priority));
    }finally{await s.api.close();}
  }
});

test('collection requests propagate unknown coverage and final host failure for success and416 bodies',async()=>{
  const s=await setup();try{await s.run({...block(0),events:initial()});s.unknown(true);
    assert.equal((await s.request()).status,503);assert.equal((await s.request('missing')).status,503);
    s.unknown(false);s.fail(true);assert.equal((await s.request()).status,503);assert.equal((await s.request('missing')).status,503);
    s.fail(false);assert.deepEqual(await s.request('missing'),{status:416,body:{success:false,message:'Collection not found'}});
    assert.ok(s.calls.every(c=>c.kind==='collection'));
  }finally{await s.api.close();}
});

test('collection reads detach caller state and refuse malformed or unsupported metadata instead of inventing values',async()=>{
  const s=await setup();try{await s.run({...block(0),events:initial()});const before=s.snapshot(),k=key(input.contract,input.collection),stored=before.get('collection'+k);
    const a=await s.request();a.body.data.data.name='changed';a.body.data.authorized_accounts.push('bad');assert.deepEqual(s.snapshot(),before);
    for(const change of [v=>{v.contract='other'},v=>{delete v.new_author_date},v=>{v.data.name=1},v=>{v.allow_notify='true'},v=>{v.new_author_date=1}]){
      const bad=structuredClone(stored);change(bad);s.seed('collection',k,bad);assert.equal((await s.request()).status,503);
    }
    s.seed('collection',k,stored);assert.equal((await s.request()).status,200);
  }finally{await s.api.close();}
});

test('author swap failures discard earlier staged updates and preserve existing explicit18 budgets',async()=>{
  const s=await setup();try{await s.run({...block(0),events:initial()});const before=s.snapshot();
    for(const date of [-1,4294967296,1.5,'1']){
      await assert.rejects(s.run({...block(1),events:[swap('first'),swap('bad',date)]}));assert.deepEqual(s.snapshot(),before);
    }
    const scopeLess={...swap(),scope:null};await assert.rejects(s.run({...block(1),events:[scopeLess]}));assert.deepEqual(s.snapshot(),before);
    assert.equal(s.descriptor.definition.records.length,18);assert.equal(s.descriptor.limits.recordKinds,18);
  }finally{await s.api.close();}
});
