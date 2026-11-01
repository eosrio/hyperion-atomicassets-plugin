import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {input,initial,stages,block,codec,key} from './fixtures/asset-domain-cases.mjs';
import {atomicLimits} from '../harness/stateful/scenario.mjs';
import {captureStatefulDeclaration} from '@eosrio/hyperion-sdk/projection-stateful';
const root=process.env.ATOMIC_DIST??join(process.cwd(),'dist');
const {stageAssetTransition}=await import(pathToFileURL(join(root,'atomicassets/internal/schema-counts.js')).href);
const {reduceAssetLifecycle}=await import(pathToFileURL(join(root,'atomicassets/internal/lifecycle.js')).href);
const {createAtomicStatefulPlugin}=await import(pathToFileURL(join(root,'index.js')).href);
const contract=input.contract,id=input.assetId,a=key(contract,input.collection,input.schema),b=key(contract,'other','other'),assetKey=key(contract,id);
const asset=(collection=input.collection,schema=input.schema)=>({contract,asset_id:id,collection_name:collection,schema_name:schema,owner:'alice'});
const count=(collection,schema,n)=>({contract,collection_name:collection,schema_name:schema,assets:String(n)});
function fixture(){let state=new Map(),complete=new Set(),failure=null;
 const mark=(kind,k)=>complete.add(kind+':'+k),seed=(kind,k,v)=>{mark(kind,k);state.set(kind+':'+k,structuredClone(v));};
 const port=target=>({async get(kind,k){const x=kind+':'+k;if(!complete.has(x))return {status:'unavailable',reason:'unknown coverage'};return target.has(x)?{status:'present',value:structuredClone(target.get(x))}:{status:'covered-absent'};},
  put(kind,k,v){target.set(kind+':'+k,structuredClone(v));if(failure===kind)throw Error('injected staging failure');},delete(kind,k){target.delete(kind+':'+k);}});
 return {mark,seed,snapshot:()=>structuredClone(state),restore(v){state=structuredClone(v);},fail(v){failure=v;},async run(fn){const next=structuredClone(state);await fn(port(next));state=next;}};
}
const countAt=(f,k)=>f.snapshot().get('schema-asset-count:'+k)?.assets;
test('covered genesis, duplicate upsert, owner change, cross-key replacement and actual deletion',async()=>{
 const f=fixture();for(const [kind,k] of [['asset',assetKey],['schema-asset-count',a],['schema-asset-count',b]])f.mark(kind,k);
 await f.run(s=>stageAssetTransition(s,contract,id,asset()));assert.equal(countAt(f,a),'1');
 await f.run(s=>stageAssetTransition(s,contract,id,asset()));assert.equal(countAt(f,a),'1');
 await f.run(s=>stageAssetTransition(s,contract,id,{...asset(),owner:null}));assert.equal(countAt(f,a),'1');
 await f.run(s=>stageAssetTransition(s,contract,id,asset('other','other')));assert.equal(countAt(f,a),'0');assert.equal(countAt(f,b),'1');
 await f.run(s=>stageAssetTransition(s,contract,id,null));assert.equal(countAt(f,b),'0');
 await f.run(s=>stageAssetTransition(s,contract,id,null));assert.equal(countAt(f,b),'0');
});
test('trusted nonzero seeds, unknown coverage, inconsistent count, overflow and failed candidate fail closed',async()=>{
 const f=fixture();f.seed('asset',assetKey,asset());f.seed('schema-asset-count',a,count(input.collection,input.schema,7));f.seed('schema-asset-count',b,count('other','other',2));
 const base=f.snapshot();f.fail('schema-asset-count');await assert.rejects(f.run(s=>stageAssetTransition(s,contract,id,asset('other','other'))));assert.deepEqual(f.snapshot(),base);f.fail(null);
 await f.run(s=>stageAssetTransition(s,contract,id,asset('other','other')));assert.equal(countAt(f,a),'6');assert.equal(countAt(f,b),'3');
 const unknown=fixture();unknown.mark('schema-asset-count',a);await assert.rejects(unknown.run(s=>stageAssetTransition(s,contract,id,asset())));
 const noCount=fixture();noCount.mark('asset',assetKey);await assert.rejects(noCount.run(s=>stageAssetTransition(s,contract,id,asset())));
 const inconsistent=fixture();inconsistent.seed('asset',assetKey,asset());inconsistent.mark('schema-asset-count',a);await assert.rejects(inconsistent.run(s=>stageAssetTransition(s,contract,id,asset())));
 const overflow=fixture();overflow.mark('asset',assetKey);overflow.seed('schema-asset-count',a,count(input.collection,input.schema,'9223372036854775807'));await assert.rejects(overflow.run(s=>stageAssetTransition(s,contract,id,asset())));
});
test('actual mint reducer is idempotent and stages count alongside asset',async()=>{
 const f=fixture();for(const [kind,k] of [['asset',assetKey],['mint',assetKey],['schema-asset-count',a],['config',key(contract)],['collection',key(contract,input.collection)],['schema',a]])f.mark(kind,k);
 const events=initial(),blk=block(0);await f.run(s=>reduceAssetLifecycle(blk,events,s,codec));assert.equal(countAt(f,a),'1');
 await f.run(s=>reduceAssetLifecycle(blk,events,s,codec));assert.equal(countAt(f,a),'1');
});
test('new declaration requires explicit twenty-one record kinds',async()=>{
 const binding={chainId:'a'.repeat(64),backendId:'controlled',generation:'count-rebuild',mappingRevision:'b'.repeat(64),hookArtifact:'c'.repeat(64),hookRevision:'d'.repeat(64),codecRevision:'e'.repeat(64),normalizerRevision:'f'.repeat(64)};
 for(const n of [20,21]){const limits={...atomicLimits,selectors:128,recordKinds:n},p=createAtomicStatefulPlugin({limits}),d=p.getStatefulProjectionsV2({binding:{},sourceCapabilities:['original-action-authorization-v1']}).projections[0];
  const capture=()=>captureStatefulDeclaration({...d.definition,binding,selectors:d.definition.selectors.map(s=>({...s,abiDeployment:'fixture',abiSha256:'a'.repeat(64)}))},d.limits);
  if(n===20)await assert.rejects(capture);else {await capture();assert.ok(d.definition.records.some(r=>r.kind==='schema-asset-count'));}}
});


test('same candidate multiple mints and caller rollback with replacement replay preserve totals',async()=>{
 const f=fixture(),second='1234567890124',secondKey=key(contract,second);
 for(const [kind,k] of [['asset',assetKey],['asset',secondKey],['schema-asset-count',a],['schema-asset-count',b]])f.mark(kind,k);
 const base=f.snapshot();await f.run(async s=>{await stageAssetTransition(s,contract,id,asset());await stageAssetTransition(s,contract,second,{...asset(),asset_id:second});});
 assert.equal(countAt(f,a),'2');const forkPoint=f.snapshot();
 await f.run(s=>stageAssetTransition(s,contract,id,asset('other','other')));assert.equal(countAt(f,b),'1');
 f.restore(forkPoint);await f.run(s=>stageAssetTransition(s,contract,id,asset()));assert.equal(countAt(f,a),'2');assert.equal(countAt(f,b),undefined);
 f.restore(base);await f.run(async s=>{await stageAssetTransition(s,contract,id,asset());await stageAssetTransition(s,contract,second,{...asset(),asset_id:second});});assert.equal(countAt(f,a),'2');
});

test('actual original and current lifecycle receive the same mint, transfer and burn occurrences',async()=>{
 const ref=createRequire(join(process.env.AA_REFERENCE_ROOT,'package.json'));ref('@swc-node/register');
 const {scriptedTransaction}=createRequire(import.meta.url)('../harness/atomicassets/original-controls.cjs');
 const {default:Processor,ProcessingState}=ref('./src/filler/processor.ts');
 const {configProcessor}=ref('./src/filler/handlers/atomicassets/processors/config.ts');
 const {collectionProcessor}=ref('./src/filler/handlers/atomicassets/processors/collections.ts');
 const {schemaProcessor}=ref('./src/filler/handlers/atomicassets/processors/schemas.ts');
 const {assetProcessor}=ref('./src/filler/handlers/atomicassets/processors/assets.ts');
 const boundary=scriptedTransaction(contract),core={args:{atomicassets_account:contract,store_transfers:false},config:{supported_tokens:[],collection_format:[]},tokenconfigs:{version:'1.0.0'}};
 const processor=new Processor(ProcessingState.HEAD,{checkTrace:()=>true,checkDelta:()=>true});
 for(const setup of [configProcessor,collectionProcessor,schemaProcessor])setup(core,processor);assetProcessor(core,processor,{sendActionTrace(){}});
 const f=fixture();for(const [kind,k] of [['asset',assetKey],['mint',assetKey],['schema-asset-count',a],['config',key(contract)],['collection',key(contract,input.collection)],['schema',a]])f.mark(kind,k);
 const batches=stages();batches[0].find(e=>e.table==='config').value.supported_tokens=[];
 for(let n=0;n<=4;n++) {const blk=block(n),batch=batches[n],originalBlock={block_num:Number(blk.blockNum),block_id:blk.blockId,timestamp:new Date(Number(blk.blockTimeMs)).toISOString().slice(0,-1)};
  for(const e of batch){if(e.kind==='row')processor.processContractRow(originalBlock,{code:contract,scope:e.scope,table:e.table,present:e.present,value:structuredClone(e.value)});else processor.processActionTrace(originalBlock,{id:e.transactionId},{act:{account:contract,name:e.name,data:structuredClone(e.value)},global_sequence:'9007199254740993'});}
  await processor.executeHeadQueue(boundary.db);await f.run(s=>reduceAssetLifecycle(blk,batch,s,codec));
  const rows=boundary.tables.get('atomicassets_assets')??[];assert.equal(countAt(f,a),String(rows.filter(x=>x.collection_name===input.collection&&x.schema_name===input.schema).length));
 }
});

test('actual plugin factory dispatch stages the new count kind with the asset',async()=>{
 const f=fixture();for(const [kind,k] of [['asset',assetKey],['mint',assetKey],['schema-asset-count',a],['config',key(contract)],['collection',key(contract,input.collection)],['schema',a]])f.mark(kind,k);
 const p=createAtomicStatefulPlugin({limits:{...atomicLimits,selectors:128,recordKinds:21,readAttempts:128,mutations:64}});
 const {reduce}=p.getStatefulProjectionsV2({binding:{},sourceCapabilities:['original-action-authorization-v1']}).projections[0],blk=block(0),events=initial();
 const source={previous:{blockNum:Number(blk.blockNum)-1,blockId:'0'.repeat(64)},block:{blockNum:Number(blk.blockNum),blockId:blk.blockId,previousBlockId:'0'.repeat(64),timeMs:blk.blockTimeMs},
  inputs:events.map((e,i)=>({kind:e.kind==='row'?'table':'action',contract,name:e.table??e.name,data:structuredClone(e.value),sourceEvidence:e.evidence.occurrence,abiDeployment:e.evidence.abiDeployment,abiSha256:e.evidence.abiSha256,transactionId:e.transactionId??null,...(e.kind==='row'?{present:e.present,identity:{kind:'contract-row',scope:e.scope,primaryKey:String(i)}}:{})}))};
 await f.run(s=>reduce({...s,source}));assert.equal(countAt(f,a),'1');
});
