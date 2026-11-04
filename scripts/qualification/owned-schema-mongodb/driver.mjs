// Qualification-only driver. The caller supplies the admitted real Mongo adapter,
// owner lease and publication guard; this module creates no clients or databases.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import Fastify from 'fastify';
import * as owner from '@eosrio/hyperion-sdk/projection-stateful-owner-v2';
import * as indexed from '@eosrio/hyperion-sdk/projection-stateful-indexed-query-v1';
import {registerOwnedSchemaRoute} from '../../../dist/http/owned-schema-route.js';
import {stageAssetTransition} from '../../../dist/atomicassets/internal/schema-counts.js';
import {OWNED_SCHEMA_MODEL_ID} from '../../../dist/stateful/owned-schema-indexed.js';
import {input,initial,mint,transfer,action,row} from '../../../tests/fixtures/asset-domain-cases.mjs';
import {compareSnapshots} from './oracle.mjs';
const hex=n=>n.toString(16).padStart(64,'0');
const sha=value=>createHash('sha256').update(value).digest('hex');
const copy=structuredClone;

// registration and model must come from createAtomicStatefulPlugin with both
// ownedSchemaCounts and engineeringOwnedSchemaMongoComparison explicitly enabled.
export async function runOwnedSchemaNativeDifferential({registration,declaration,model,limits,adapter,engineering,identity,lease,guard,rollback,retain,load,onObservation}) {
 assert.equal(model.model.id,OWNED_SCHEMA_MODEL_ID);
 assert.equal(model.model.textComparison,'mongodb-simple-utf8-v1');
 assert.equal(declaration.projection.definition.records.some(x=>x.kind==='owned-schema-count'),true);
 assert.equal(typeof guard,'function');
 const publication=new Map(),api=Fastify();
 let serial=100,ancestor,lastCandidate;
 const stored={load,async retain(candidate){await retain(candidate);lastCandidate=candidate;}};
 api.addHook('onSend',async(request,reply,payload)=>{
  const result=publication.get(request.id);if(!result)return payload;
  try{guard();indexed.assertIndexedQueryPublicationV1(result);return payload;}
  catch{reply.code(503).header('cache-control','no-store').type('application/json');return JSON.stringify({success:false});}
 });
 api.addHook('onResponse',async request=>{publication.delete(request.id);});
 registerOwnedSchemaRoute(api,{projectionId:'atomicassets',contract:input.contract,responseRecords:limits.responseRecords,
  async indexedQueryHost(request,_projection,id){
   assert.equal(id,OWNED_SCHEMA_MODEL_ID);guard();
   const current=await adapter.recovery(),native=await engineering.indexedForModel(current.view,model.digest,guard);
   const offer={family:indexed.STATEFUL_INDEXED_QUERY_FAMILY_V1,interfaceVersion:1,queryDeclarationDigests:[model.digest],comparisonProfiles:['mongodb-simple-utf8-v1'],limits};
   const selection=indexed.negotiateIndexedQueryV1(model,limits,offer,native.indexedCapabilities);
   return {indexedCapabilities:native.indexedCapabilities,async compose(_id,fn){
    const result=await indexed.composeStatefulOwnerIndexedReadV1(selection,native,identity,current.view,fn,guard);publication.set(request.id,result);return result;
   }};
  }});
 async function apply(events=[],deleteId){
  const previous=(await adapter.recovery()).view,id=++serial,block={blockNum:previous.checkpoint.blockNum+1,blockId:hex(id),previousBlockId:previous.checkpoint.blockId};
  const target=await owner.captureStatefulRawTargetV2(declaration,{schemaVersion:2,chainId:declaration.projection.definition.binding.chainId,declarationDigest:declaration.digest,owner:identity,previous,block,rawSource:{commitId:'synthetic:'+hex(id),selectionId:'synthetic:'+hex(id),observationId:'synthetic:'+hex(id),observationDigest:hex(id+1000)}});
  await adapter.admitRaw(lease,target);
  const source={previous:copy(previous.checkpoint),block:{...block,timeMs:String(1700000000000+id*1000)},inputs:events.map((e,index)=>{
   const kind=e.kind==='row'?'table':'action',name=e.kind==='row'?e.table:e.name,selector=registration.definition.selectors.find(s=>s.contract===input.contract&&s.kind===kind&&s.name===name);assert.ok(selector);
   const raw=Buffer.from(JSON.stringify(e.value));return {kind,selector:selector.id,order:index,contract:input.contract,name,abiDeployment:'fixture',abiSha256:hex(7),mappingRevision:declaration.projection.definition.binding.mappingRevision,codecRevision:declaration.projection.definition.binding.codecRevision,normalizerRevision:declaration.projection.definition.binding.normalizerRevision,rawHex:raw.toString('hex'),rawSha256:sha(raw),sourceEvidence:sha('synthetic:'+id+':'+index),data:copy(e.value),
    ...(kind==='table'?{transactionId:null,identity:{kind:'contract-row',scope:e.scope,primaryKey:'0'},payer:null,present:e.present,deltaOrdinal:index,rowOrdinal:0}:{transactionId:e.transactionId,actionOrdinal:index+1,receiver:input.contract,receiptOrdinal:index+1,sequence:null})};})};
  lastCandidate=undefined;const result=await owner.executeStatefulOwnerBlockV2(declaration,adapter,lease,target.digest,source,stored,async port=>{if(deleteId)await stageAssetTransition(port,input.contract,deleteId,null,true);else await registration.reduce(port);},guard);
  assert.equal(result.status,'applied');const candidate=lastCandidate;
  // The real controller must identify and retire the exact committed raw source.
  assert.ok(candidate,'caller custody must expose the committed candidate');
  await adapter.retireRaw(lease,target.digest,candidate.source.digest,candidate.digest);
 }
 const a=input.assetId,b='9007199254740994',c='9007199254740995',g='9007199254740996';
 const steps={empty:async()=>{},insert:async()=>{await apply(initial());const x=mint(b);x.value.new_asset_owner='bob';await apply([x]);const y=mint(c);y.value.schema_name='beta';y.value.new_asset_owner='carol';await apply([row('schemas',{schema_name:'beta',format:input.format}),y]);const z=mint(g);z.value.schema_name='gamma';await apply([row('schemas',{schema_name:'gamma',format:input.format}),z]);await apply([action('logburnasset',{asset_id:g,asset_owner:'alice'})]);},transfer:()=>apply([transfer('alice','dave')]),'burn-one':()=>apply([action('logburnasset',{asset_id:a,asset_owner:'dave'})]),'burn-last':async()=>{ancestor=(await adapter.recovery()).view.checkpoint;await apply([action('logburnasset',{asset_id:b,asset_owner:'bob'})]);},'after-rollback':async()=>{const next=await rollback(ancestor);identity=next.identity;lease=next.lease;},'delete-alpha':()=>apply([],b),'delete-beta':()=>apply([],c)};
 async function observe(name){
  guard();const current=await adapter.recovery(),read=await adapter.completedRead(identity,current.view,guard);
  let counts;try{const names=[input.schema,'beta','gamma'],keys=names.map(schema=>({kind:'owned-schema-count',key:JSON.stringify([input.contract,input.collection,schema])}));
   const result=await adapter.readCompleted(read,current.view,keys);counts=result.results.flatMap((entry,i)=>entry.status==='present'?[{schema_name:names[i]===input.schema?'alpha':names[i],owned:entry.value.owned}]:entry.status==='covered-absent'?[]:(()=>{throw Error('count coverage unavailable');})());
  }finally{adapter.closeRead(read);}
  const response=await api.inject('/atomicassets/v1/collections/'+input.collection+'/schemas'),body=response.json();
  onObservation({name,view:current.view,statusCode:response.statusCode,body:copy(body),counts:copy(counts)});
  assert.deepEqual((await adapter.recovery()).view,current.view,'owner view changed across count and HTTP observation');
  if(Array.isArray(body.data))for(const item of body.data)if(item.schema_name===input.schema)item.schema_name='alpha';
  return {name,statusCode:response.statusCode,body,counts};
 }
 try{return await compareSnapshots({advance:name=>steps[name](),observe});}finally{await api.close();}
}
