// Qualification-only: caller supplies an independently admitted actual owner adapter,
// exact engineering assembly, initialized empty view, custody and publication guard.
// This module creates no MongoClient, process, host listener, or admission authority.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import Fastify from 'fastify';
import * as owner from '@eosrio/hyperion-sdk/projection-stateful-owner-v2';
import * as indexed from '@eosrio/hyperion-sdk/projection-stateful-indexed-query-v1';
import {registerRoyaltyTemplateRoute} from '../../../dist/http/royalty-template-route.js';
import {royaltyTemplateRows} from '../../../dist/atomicmarket/internal/royalty-rules.js';
import {ROYALTY_TEMPLATE_MODEL_ID} from '../../../dist/stateful/royalty-rules.js';
import {compareRoyaltyTemplates} from './oracle.mjs';
const hex=n=>n.toString(16).padStart(64,'0'),sha=value=>createHash('sha256').update(value).digest('hex');
export async function runRoyaltyTemplateNativeDifferential({registration,declaration,model,limits,adapter,engineering,identity,lease,guard,retain,load,onObservation}){
 assert.equal(model.model.id,ROYALTY_TEMPLATE_MODEL_ID);assert.equal(model.model.textComparison,'mongodb-simple-utf8-v1');
 assert.equal(typeof guard,'function');const api=Fastify(),publication=new Map();let lastCandidate,attempts=0,nativeRows,nativeComplete=false;
 const stored={load,async retain(candidate){await retain(candidate);lastCandidate=candidate;}};
 api.addHook('onSend',async(request,reply,payload)=>{const result=publication.get(request.id);if(!result)return payload;
  try{guard();indexed.assertIndexedQueryPublicationV1(result);return payload;}catch{reply.code(503).header('cache-control','no-store').type('application/json');return JSON.stringify({success:false});}});
 api.addHook('onResponse',async request=>{publication.delete(request.id);});
 registerRoyaltyTemplateRoute(api,{projectionId:declaration.projection.definition.id,contract:'atomicmarket',inputBounds:{queryBytes:limits.queryBytes,setValues:limits.setValues},
  async indexedQueryHost(request,_projection,id){assert.equal(id,ROYALTY_TEMPLATE_MODEL_ID);guard();
   const current=await adapter.recovery(),native=await engineering.indexedForModel(current.view,model.digest,guard);
   const offer={family:indexed.STATEFUL_INDEXED_QUERY_FAMILY_V1,interfaceVersion:1,queryDeclarationDigests:[model.digest],comparisonProfiles:['mongodb-simple-utf8-v1'],limits};
   const selection=indexed.negotiateIndexedQueryV1(model,limits,offer,native.indexedCapabilities);
   return {indexedCapabilities:native.indexedCapabilities,async compose(_id,fn){
    const result=await indexed.composeStatefulOwnerIndexedReadV1(selection,native,identity,current.view,async read=>fn({query:async query=>{
     attempts++;const answer=await read.query(query);assert.equal(answer.kind,'page');nativeComplete=answer.complete===true;nativeRows=royaltyTemplateRows(answer,'atomicmarket','oracle');return answer;
    }}),guard);publication.set(request.id,result);return result;
   }};
  }});
 async function initialize(ids){
  guard();const previous=(await adapter.recovery()).view;assert.equal(previous.checkpoint.blockNum,0,'fixture must start at empty genesis');
  const block={blockNum:1,blockId:hex(1),previousBlockId:previous.checkpoint.blockId};
  const target=await owner.captureStatefulRawTargetV2(declaration,{schemaVersion:2,chainId:declaration.projection.definition.binding.chainId,declarationDigest:declaration.digest,owner:identity,previous,block,
   rawSource:{commitId:'royalty:'+hex(1),selectionId:'royalty:'+hex(2),observationId:'royalty:'+hex(3),observationDigest:hex(4)}});
  await adapter.admitRaw(lease,target);const selector=declaration.projection.definition.selectors.find(s=>s.contract==='atomicmarket'&&s.kind==='table'&&s.name==='royaltytemp');assert.ok(selector);
  const source={previous:structuredClone(previous.checkpoint),block:{...block,timeMs:'1'},inputs:ids.map((template_id,index)=>{
   const data={template_id,recipients:[]},raw=Buffer.from(JSON.stringify(data));return {kind:'table',selector:selector.id,order:index,contract:'atomicmarket',name:'royaltytemp',abiDeployment:selector.abiDeployment,abiSha256:selector.abiSha256,
    mappingRevision:declaration.projection.definition.binding.mappingRevision,codecRevision:declaration.projection.definition.binding.codecRevision,normalizerRevision:declaration.projection.definition.binding.normalizerRevision,
    rawHex:raw.toString('hex'),rawSha256:sha(raw),sourceEvidence:sha('royalty:'+index),transactionId:null,identity:{kind:'contract-row',scope:'oracle',primaryKey:template_id},payer:null,present:true,deltaOrdinal:index,rowOrdinal:0,data};})};
  const result=await owner.executeStatefulOwnerBlockV2(declaration,adapter,lease,target.digest,source,stored,port=>registration.reduce(port),guard);
  assert.equal(result.status,'applied');assert.ok(lastCandidate);await adapter.retireRaw(lease,target.digest,lastCandidate.source.digest,lastCandidate.digest);
 }
 async function observe(query){
  guard();const before=(await adapter.recovery()).view;attempts=0;nativeRows=undefined;nativeComplete=false;
  const response=await api.inject({url:'/atomicmarket/v1/royalties/oracle/templates',query});const body=response.json();
  const observation={query:structuredClone(query),view:before,statusCode:response.statusCode,body,nativeRows,nativeComplete,nativeAttempts:attempts};
  onObservation(observation);
  assert.deepEqual((await adapter.recovery()).view,before,'owner view changed during HTTP request');
  return observation;
 }
 try{return await compareRoyaltyTemplates({initialize,observe});}finally{await api.close();}
}
