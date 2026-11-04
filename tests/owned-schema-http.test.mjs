import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import * as v1 from '@eosrio/hyperion-sdk/projection-stateful';
import * as owner from '@eosrio/hyperion-sdk/projection-stateful-owner-v2';
import * as indexed from '@eosrio/hyperion-sdk/projection-stateful-indexed-query-v1';
import {createAtomicStatefulPlugin} from '../dist/stateful/plugin.js';
import {registerOwnedSchemaRoute} from '../dist/http/owned-schema-route.js';
import {SCHEMA_LIST_COMPARISON} from '../dist/stateful/schema-indexed.js';
import {OWNED_SCHEMA_MODEL_ID} from '../dist/stateful/owned-schema-indexed.js';
import {CompleteKindReference} from './fixtures/complete-kind-adapter.mjs';
import {limits} from './fixtures/config-component.mjs';
const hex=n=>n.toString(16).padStart(64,'0'),clone=structuredClone;
async function setup(){
 const bounds={...limits(),recordKinds:22,responseRecords:5},plugin=createAtomicStatefulPlugin({limits:bounds,ownedSchemaCounts:true});
 const r=plugin.getStatefulProjectionsV2({binding:{},sourceCapabilities:['original-action-authorization-v1']}).projections[0];
 const requirement=r.requiredIndexedQueries.find(x=>x.model.id===OWNED_SCHEMA_MODEL_ID);assert.ok(requirement);
 const binding={chainId:hex(1),backendId:'owned-http',generation:'fresh',mappingRevision:hex(2),hookArtifact:hex(3),hookRevision:hex(4),codecRevision:hex(5),normalizerRevision:hex(6)};
 const projection=await v1.captureStatefulDeclaration({...r.definition,binding,selectors:r.definition.selectors.map(s=>({...s,abiDeployment:'fixture',abiSha256:hex(7)}))},bounds);
 const own=supported=>({family:owner.STATEFUL_OWNER_FAMILY_V2,interfaceVersion:2,sourceInputVersions:[2],supported,limits:bounds});
 const d=await owner.negotiateStatefulOwnerV2(projection,own(owner.STATEFUL_OWNER_HOST_CAPABILITIES_V2),own(owner.STATEFUL_OWNER_ADAPTER_CAPABILITIES_V2));
 const model=await indexed.captureIndexedDeclarationV1(d,requirement.modelRevision,requirement.model);
 const offer={family:indexed.STATEFUL_INDEXED_QUERY_FAMILY_V1,interfaceVersion:1,queryDeclarationDigests:[model.digest],comparisonProfiles:[SCHEMA_LIST_COMPARISON],limits:requirement.limits};
 const selection=indexed.negotiateIndexedQueryV1(model,requirement.limits,offer,offer),adapter=new CompleteKindReference(d),plans=[],calls=[],flags={retired:false,cancelled:false,coverage:false},publications=new Map();
 adapter.indexedCapabilities=offer;adapter.queryCompleted=async(read,view,request,_remaining)=>{adapter.use(read,view);calls.push(clone(request));const plan=plans.shift();assert.ok(plan);return {view:clone(view),queryDeclarationDigest:model.digest,result:clone(plan),attempts:1};};
 const api=Fastify(),state={api,plans,calls,adapter,flags,beforeSerialize:undefined,beforeSend:undefined,projection,binding,bounds,d};
 api.addHook('preSerialization',async(req,_reply,payload)=>{if(state.beforeSerialize)await state.beforeSerialize(req);return payload;});
 api.addHook('onSend',async(req,reply,payload)=>{if(state.beforeSend)await state.beforeSend(req);const selected=publications.get(req.id);if(!selected)return payload;
  try{selected.guard();indexed.assertIndexedQueryPublicationV1(selected.result);if(payload!==null)assert(Buffer.byteLength(payload)<=requirement.limits.responseBytes);return payload;}
  catch{reply.code(503).header('retry-after','1').header('cache-control','no-store').type('application/json');return JSON.stringify({success:false,message:'Request publication unavailable'});}});
 api.addHook('onResponse',async req=>{publications.delete(req.id);});
 registerOwnedSchemaRoute(api,{projectionId:'atomicassets',contract:'atomicassets',responseRecords:bounds.responseRecords,
  async indexedQueryHost(request,projectionId,modelId){assert.equal(projectionId,'atomicassets');assert.equal(modelId,OWNED_SCHEMA_MODEL_ID);
   const identity=clone(adapter.identity),view=clone(adapter.view),guard=()=>{adapter.guard();if(Object.values(flags).some(Boolean))throw new v1.StatefulContractError('stateful.unavailable','Request or coverage authority expired');assert.deepEqual(adapter.identity,identity);owner.assertStatefulOwnerViewV2(d,adapter.view,view);};
   return {indexedCapabilities:offer,async compose(_id,fn){const result=await indexed.composeStatefulOwnerIndexedReadV1(selection,adapter,identity,view,fn,guard);publications.set(request.id,{result,guard});return result;}};}});
 return state;
}
const count=value=>({kind:'count',exact:true,value:String(value)});
const page=names=>({kind:'page',complete:true,rows:names.map(name=>({key:JSON.stringify(['atomicassets','cats',name]),fields:{schema_name:name},records:{}}))});
test('actual SDK indexed scope and HTTP injection return complete bounded results and ignore parameters',async()=>{
 const s=await setup();try{s.plans.push(count(2),page(['a','b']));const r=await s.api.inject({method:'POST',url:'/atomicassets/v1/collections/cats/schemas?limit=bogus',payload:{ignored:true}});
  assert.equal(r.statusCode,200);assert.deepEqual(r.json().data,[{schema_name:'a'},{schema_name:'b'}]);assert.equal(s.calls.length,2);assert.equal(s.calls[0].kind,'count');assert.equal(s.calls[1].limit,2);assert.equal(s.calls[1].offset,'0');
  s.plans.push(count(0));const empty=await s.api.inject('/atomicassets/v1/collections/cats/schemas');assert.deepEqual(empty.json().data,[]);assert.equal(s.adapter.acquired,s.adapter.closed);
 }finally{await s.api.close();}
});
test('host publication fence rejects late retirement, cancellation and coverage loss for pages and zero counts',async()=>{
 for(const [flag,hook,empty] of [['retired','beforeSerialize',false],['cancelled','beforeSend',false],['coverage','beforeSend',true]]){
  const s=await setup();try{s.plans.push(count(empty?0:1));if(!empty)s.plans.push(page(['a']));s[hook]=()=>{s.flags[flag]=true;};
   const response=await s.api.inject('/atomicassets/v1/collections/cats/schemas');assert.equal(response.statusCode,503);assert.equal(response.headers['cache-control'],'no-store');assert.equal(response.json().success,false);
   assert.equal(s.calls.length,empty?1:2);assert.equal(s.adapter.acquired,s.adapter.closed);
  }finally{await s.api.close();}
 }
});
test('existing generation declaration cannot authorize the opt-in owned-schema model',async()=>{
 const s=await setup();try{const legacy=createAtomicStatefulPlugin({limits:s.bounds}).getStatefulProjectionsV2({binding:{},sourceCapabilities:['original-action-authorization-v1']}).projections[0];
  const old=await v1.captureStatefulDeclaration({...legacy.definition,binding:s.binding,selectors:legacy.definition.selectors.map(x=>({...x,abiDeployment:'fixture',abiSha256:hex(7)}))},s.bounds);
  const own=supported=>({family:owner.STATEFUL_OWNER_FAMILY_V2,interfaceVersion:2,sourceInputVersions:[2],supported,limits:s.bounds});
  const prior=await owner.negotiateStatefulOwnerV2(old,own(owner.STATEFUL_OWNER_HOST_CAPABILITIES_V2),own(owner.STATEFUL_OWNER_ADAPTER_CAPABILITIES_V2));
  assert.notEqual(prior.digest,s.d.digest);assert.equal(legacy.definition.records.some(x=>x.kind==='owned-schema-count'),false);
  s.adapter.view.declarationDigest=prior.digest;s.plans.push(count(0));const r=await s.api.inject('/atomicassets/v1/collections/cats/schemas');
  assert.equal(r.statusCode,503);assert.equal(r.json().success,false);assert.equal(s.calls.length,0);
 }finally{await s.api.close();}
});
test('oversize, incomplete and unavailable responses fail closed',async()=>{
 const s=await setup();try{s.plans.push(count(5));assert.equal((await s.api.inject('/atomicassets/v1/collections/cats/schemas')).statusCode,503);assert.equal(s.calls.length,1);
  s.plans.push(count(2),page(['a']));assert.equal((await s.api.inject('/atomicassets/v1/collections/cats/schemas')).statusCode,503);
  s.plans.push(count(1),page(['a']));s.adapter.live=false;const r=await s.api.inject('/atomicassets/v1/collections/cats/schemas');assert.equal(r.statusCode,503);assert.equal(r.headers['cache-control'],'no-store');
 }finally{await s.api.close();}
});
