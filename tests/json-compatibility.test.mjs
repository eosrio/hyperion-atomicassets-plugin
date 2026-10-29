import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import Fastify from 'fastify';
import {executeOriginalJsonControls} from '../harness/shared/reference.mjs';
import profiles from '../harness/atomicassets/lifecycle-input.cjs';
import {jsonVectors} from '../harness/atomicassets/json-vectors.cjs';
import {initial as baseInitial,input,storage,block,action,row,collectionRow,key,mint} from './fixtures/asset-domain-cases.mjs';
import {atomicLimits} from '../harness/stateful/scenario.mjs';
const initial=()=>structuredClone(baseInitial());
const dist=process.env.ATOMIC_PLUGIN_DIST_ROOT ? pathToFileURL(process.env.ATOMIC_PLUGIN_DIST_ROOT.replaceAll('\\','/')+'/') : new URL('../dist/',import.meta.url);
const domain=process.env.AA_DOMAIN_MODULE_ROOT ? pathToFileURL(process.env.AA_DOMAIN_MODULE_ROOT.replaceAll('\\','/')+'/') : dist;
const {reduceAssetLifecycle:reduce,readLifecycleAsset}=await import(new URL('atomicassets/internal/lifecycle.js',domain));
const {readCollectionId}=await import(new URL('atomicassets/internal/collections.js',domain));
const {AssetDomainUnavailable,record}=await import(new URL('atomicassets/internal/lifecycle-port.js',domain));
const {databaseMetadata}=await import(new URL('atomicassets/internal/database-json.js',dist));
const {createAtomicStatefulPlugin}=await import(new URL('index.js',dist));
const codec=createRequire(import.meta.url)('../vendor/atomicassets-2.2.0/build/index.cjs');
const serialize=data=>Buffer.from(codec.serialize(data,codec.CachedObjectSchema(input.format))).toString('hex');
const assetKey=key(input.contract,input.assetId),asset=s=>s.snapshot().get('asset:'+assetKey);
let execution;
const original=()=>execution??=(async()=>{const result=await executeOriginalJsonControls({referenceRoot:process.env.AA_REFERENCE_ROOT});
 const dir=new URL('../out/json39/',import.meta.url);await mkdir(dir,{recursive:true});
 await writeFile(new URL('original-'+process.version+'-'+process.pid+'.json',dir),JSON.stringify(result,null,2)+'\n');return result;})();

test('original encoder differential vectors preserve NUL, literal-backslash failure, keys and JSON types',async()=>{
 const report=await original();assert.equal(report.reference.commit,'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');assert.equal(report.sources.length,8);
 assert.equal(report.scope.originalEncoder,true);assert.equal(report.scope.postgres,false);assert.equal(report.scope.sqlView,false);
 assert.equal(report.vectors.length,21);
 for(const [name,value]of jsonVectors()){
  const expected=report.vectors.find(v=>v.name===name);assert.equal(expected.postgres.status,'not-run');
  if(!expected.nativeJsonParse.accepted||name.startsWith('unpaired-surrogate'))assert.throws(()=>databaseMetadata(value),AssetDomainUnavailable,name);
  else assert.deepEqual(databaseMetadata(value),expected.nativeJsonParse.value,name);
 }
 assert.deepEqual(databaseMetadata({'a\0b':'first','a b':'last'}),{'a b':'last'});
 assert.deepEqual(databaseMetadata({'a b':'first','a\0b':'last'}),{'a b':'last'});
 assert.equal(Object.getPrototypeOf(databaseMetadata(JSON.parse('{"__proto__":{"value":1}}'))),Object.prototype);
 assert.equal(Object.hasOwn({},'value'),false);
});

test('raw NUL action metadata reaches the original encoder after the actual pinned attribute codec',async()=>{
 const s=storage(),events=initial();events[0].value.new_data=[{key:'na\0me',value:['string','v\0alue']},{key:'null',value:['string',null]}];
 events[1].value.immutable_data=[{key:'title',value:['string','raw\0mint']}];
 await s.run(reduce,block(0),events);
 assert.deepEqual(asset(s).mutable_data,{'na me':'v alue',null:null});assert.equal(asset(s).immutable_data.title,'raw mint');
 assert.deepEqual((await readLifecycleAsset(s.reader(),input.contract,input.assetId)).mutable_data,{'na me':'v alue',null:null});
});

test('original default collection input is preserved and encoded without selecting the safe profile',async()=>{
 const report=await original(),selected=profiles.loadInputProfile();assert.equal(selected.descriptor.profile,'original-lifecycle');
 assert.equal(selected.input.collectionData.img,'image\0hash');assert.equal(selected.descriptor.substitutionApplied,false);
 const before=structuredClone(selected),s=storage();await s.run(reduce,block(0),[collectionRow(selected.input.collectionData),row('config',{collection_format:input.collectionFormat})]);
 assert.equal((await readCollectionId(s.reader(),input.contract,input.collection)).img,'image hash');assert.deepEqual(selected,before);
 const actual=report.profiles.find(p=>p.descriptor.profile==='original-lifecycle'),safe=report.profiles.find(p=>p.descriptor.profile==='portable-safe-image');
 assert.equal(actual.rawCollectionData.img,'image\0hash');assert.equal(actual.codecDecoded.img,'image\0hash');
 assert.equal(actual.nativeJsonParse.value.img,'image hash');assert.equal(safe.rawCollectionData.img,'image hash');
 assert.equal(safe.descriptor.substitutionApplied,true);assert.equal(actual.descriptor.inputsNormalized,false);assert.equal(safe.descriptor.inputsNormalized,false);
 assert.notEqual(actual.descriptor.selectedInput.sha256,safe.descriptor.selectedInput.sha256);
});

test('template immutable and mutable metadata apply the same field-specific original encoder',async()=>{
 const s=storage();s.add('template',input.contract,'42');const m=mint();m.value.template_id=42;
 const t=row('templates',{template_id:42,schema_name:input.schema,transferable:true,burnable:true,max_supply:'100',issued_supply:'1',
  immutable_serialized_data:serialize({name:'template\0name',image:'image\0hash'})});
 const tm=row('templates2',{template_id:42,schema_name:input.schema,mutable_serialized_data:serialize({name:'current\0name'})});
 await s.run(reduce,block(0),[m,t,tm,...initial().filter(e=>e.kind==='row')]);
 const result=await readLifecycleAsset(s.reader(),input.contract,input.assetId);
 assert.equal(result.template.immutable_data.name,'template name');assert.equal(result.template.mutable_data.name,'current name');
});

test('literal-backslash metadata invalid JSON discards all earlier staged effects',async()=>{
 for(const events of [(()=>{const e=initial();e[0].value.new_data=[{key:'name',value:['string','raw\\u0000literal']}];return e;})(),
  [collectionRow({...input.collectionData,img:'raw\\u0000literal'}),row('config',{collection_format:input.collectionFormat})]]){
  const s=storage();await assert.rejects(s.run(reduce,block(0),events),AssetDomainUnavailable);assert.equal(s.snapshot().size,0);
 }
 const s=storage();s.add('template',input.contract,'42');const events=[row('templates',{template_id:42,schema_name:input.schema,transferable:true,burnable:true,
  max_supply:'100',issued_supply:'1',immutable_serialized_data:serialize({name:'raw\\u0000literal'})}),...initial().filter(e=>e.kind==='row')];
 await assert.rejects(s.run(reduce,block(0),events),AssetDomainUnavailable);assert.equal(s.snapshot().size,0);
});

test('scalar fields, schema format and stored records retain strict NUL and literal refusal',async()=>{
 for(const value of ['raw\0value','raw\\u0000literal']){
  const s=storage(),events=initial();events[1].value.new_asset_owner=value;
  await assert.rejects(s.run(reduce,block(0),events),AssetDomainUnavailable);assert.equal(s.snapshot().size,0);
  assert.throws(()=>record({name:value}),AssetDomainUnavailable);
  const schema=initial();schema.find(e=>e.table==='schemas').value.format[0].name=value;
  await assert.rejects(storage().run(reduce,block(0),schema),AssetDomainUnavailable);
 }
});

test('metadata snapshot rejects getters/cycles and remains detached before any dependency await',async()=>{
 let touched=0;const bad=initial();Object.defineProperty(bad[0].value.new_data[0],'key',{enumerable:true,get(){touched++;return 'bad'}});
 await assert.rejects(storage().run(reduce,block(0),bad),AssetDomainUnavailable);assert.equal(touched,0);
 const cyclic={};cyclic.self=cyclic;assert.throws(()=>databaseMetadata(cyclic),AssetDomainUnavailable);
 const s=storage(),events=initial();events[0].value.new_data=[{key:'name',value:['string','original\0value']}];
 const reader=s.reader(),writes=new Map();const port={async get(kind,k){events[0].value.new_data[0].value[1]='changed';return writes.has(kind+':'+k)?{status:'present',value:writes.get(kind+':'+k)}:reader.get(kind,k);},
  put(kind,k,v){writes.set(kind+':'+k,structuredClone(v));},delete(kind,k){writes.delete(kind+':'+k);}};
 await reduce(block(0),events,port,{sha256:'2dfe332031728c475622ae510d7ea78246a9592a9da6cf70ba8a1abd7fa2e573',
  attributes:codec.convertAttributeMapToObject,collection:(hex,format)=>codec.deserialize(hex,codec.CachedObjectSchema(format))});
 assert.equal(writes.get('asset:'+assetKey).mutable_data.name,'original value');
});

function source(events){return{previous:{blockNum:0,blockId:'0'.repeat(64)},block:{blockNum:1,blockId:'1'.repeat(64),previousBlockId:'0'.repeat(64),timeMs:'1700000000000'},
 inputs:events.map((e,i)=>({kind:e.kind==='row'?'table':'action',contract:input.contract,name:e.table??e.name,data:structuredClone(e.value),sourceEvidence:createHash('sha256').update('json39 '+i).digest('hex'),
  abiDeployment:'actual-input-epoch',abiSha256:'a'.repeat(64),transactionId:e.transactionId??null,...(e.kind==='row'?{identity:{kind:'contract-row',scope:e.scope,primaryKey:String(i)},present:e.present}:{})}))};}

test('combined19 packaged factory preserves metadata encoding and coherent asset/collection/marketplace routes',async()=>{
 const p=createAtomicStatefulPlugin({limits:{...atomicLimits,selectors:128,recordKinds:19}}),reduce=p.getStatefulProjectionsV2({binding:{}}).projections[0].reduce;
 const events=initial();events[0].value.new_data=[{key:'name',value:['string','current\0name']}];events[1].value.immutable_data=[{key:'image',value:['string','raw\0image']}];
 events[3]=collectionRow(profiles.loadInputProfile().input.collectionData);let state=new Map();
 const port=map=>({async get(kind,k){return map.has(kind+k)?{status:'present',value:structuredClone(map.get(kind+k))}:{status:'covered-absent'};},
  put(kind,k,v){map.set(kind+k,structuredClone(v));},delete(kind,k){map.delete(kind+k);}});
 const combined=source(events);
 combined.inputs.push({kind:'table',contract:'atomicmarket',name:'marketplaces',present:true,
  identity:{kind:'contract-row',scope:'atomicmarket',primaryKey:'0'},data:{marketplace_name:'metadata-combined',creator:'alice'},
  sourceEvidence:'b'.repeat(64),abiDeployment:'actual-marketplace-epoch',abiSha256:'c'.repeat(64),transactionId:null});
 const next=structuredClone(state);await reduce({...port(next),source:combined});state=next;
 const api=Fastify();api.setErrorHandler((_e,_r,reply)=>reply.code(503).send({success:false}));let fenced=false;
 p.addRoutes(api,{statefulQueryHost(){return{async compose(id,query){assert.equal(id,'atomicassets');const value=await query(port(state));if(fenced)throw Error('actual caller final fence');return{value};}};}});
 try{
  const a=await api.inject('/atomicassets/v1/assets/'+input.assetId);assert.equal(a.statusCode,200);assert.equal(a.json().data.mutable_data.name,'current name');
  const c=await api.inject('/atomicassets/v1/collections/'+input.collection);assert.equal(c.statusCode,200);assert.equal(c.json().data.img,'image hash');
  const m=await api.inject('/atomicmarket/v1/marketplaces/metadata-combined');assert.equal(m.statusCode,200);
  assert.deepEqual(m.json().data,{marketplace_name:'metadata-combined',creator:'alice',created_at_block:'1',created_at_time:'1700000000000'});
  fenced=true;assert.equal((await api.inject('/atomicassets/v1/assets/'+input.assetId)).statusCode,503);
  assert.equal((await api.inject('/atomicmarket/v1/marketplaces/metadata-combined')).statusCode,503);
 }finally{await api.close();}
 for(const field of ['new_asset_owner','collection_name']){const bad=initial();bad[1].value[field]='bad\0scalar';
  await assert.rejects(reduce({...port(new Map()),source:source(bad)}),AssetDomainUnavailable);}
});

test('unproven nontext JSONB display selections still refuse instead of guessing PostgreSQL text',async()=>{
 const s=storage();await s.run(reduce,block(0),initial());const k=key(input.contract,input.collection),v=s.snapshot().get('collection:'+k);
 for(const value of [true,0,0.1,[1,null],{z:1,a:2}]){s.seed('collection',k,{...v,data:{...v.data,name:value}});
  await assert.rejects(readCollectionId(s.reader(),input.contract,input.collection),AssetDomainUnavailable);
  await assert.rejects(readLifecycleAsset(s.reader(),input.contract,input.assetId),AssetDomainUnavailable);}
});

test('physical display vectors bind actual SQL probes without any prefilled engine result',()=>{
 const {jsonDisplaySql,codecProbeCases}=createRequire(import.meta.url)('../harness/atomicassets/postgres/scenario.cjs');
 assert.equal(jsonDisplaySql,"SELECT $1::jsonb AS native_value, $1::jsonb::text AS postgres_text, $1::jsonb->>'name' AS name_text, $1::jsonb->>'img' AS img_text");
 assert.deepEqual(codecProbeCases({}).map(([name])=>name),['locked-codec','nul','literal-escape']);
 const a=jsonVectors(),b=jsonVectors();a[0][1].name='changed';assert.equal(b[0][1].name,'plain');
 assert.equal(b.length,21);assert.ok(b.every(row=>row.length===2));
});
