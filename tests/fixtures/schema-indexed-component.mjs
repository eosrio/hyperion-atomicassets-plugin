// Finite actual SDK owner/indexed scope and Fastify inject. Scripted results are not engine comparison proof.
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {join} from 'node:path';
import Fastify from 'fastify';
import * as v1 from '@eosrio/hyperion-sdk/projection-stateful';
import * as owner from '@eosrio/hyperion-sdk/projection-stateful-owner-v2';
import * as indexed from '@eosrio/hyperion-sdk/projection-stateful-indexed-query-v1';
import {CompleteKindReference} from './complete-kind-adapter.mjs';
const dist=process.env.ATOMIC_SCHEMA_DIST_ROOT??fileURLToPath(new URL('../../dist',import.meta.url));
export const {default:AtomicPlugin}=await import(pathToFileURL(join(dist,'index.js')));
export const {parseSchemaListParameters,SchemaListParameterError}=await import(pathToFileURL(join(dist,'atomicassets/internal/schema-list-parameters.js')));
export const {schemaListRows}=await import(pathToFileURL(join(dist,'atomicassets/internal/schema-list.js')));
export const {jsonbText}=await import(pathToFileURL(join(dist,'atomicassets/internal/jsonb-text.js')));
export const {schemaListModel,SCHEMA_LIST_MODEL_ID,SCHEMA_LIST_COMPARISON}=await import(pathToFileURL(join(dist,'stateful/schema-indexed.js')));
const clone=v=>structuredClone(v),hex=n=>n.toString(16).padStart(64,'0');
export const key=(...v)=>JSON.stringify(v);
export const limits=()=>({value:{depth:32,nodes:8192,fields:64,arrayElements:256,stringBytes:65536,recordBytes:262144,integerFields:16,pathSegments:16},
 envelope:{depth:48,nodes:65536,fields:64,arrayElements:1024,stringBytes:1048576,recordBytes:2097152,integerFields:16,pathSegments:16},
 selectors:128,recordKinds:21,inputOccurrences:128,inputBytes:1048576,keyBytes:256,readKeys:32,readAttempts:64,mutations:128,candidateBytes:2097152,responseRecords:32,responseBytes:131072});
export const schema=(changes={})=>({contract:'atomicassets',collection_name:'cats',schema_name:'one',created_at_block:'1',created_at_time:'10',
 format:[{name:'name',type:'string'},{name:'img',type:'string'}],types:[{name:'img',mediatype:'video',info:'video/mp4'}],...changes});
export const collection=(changes={})=>({contract:'atomicassets',collection_name:'cats',data:{name:'Cats',img:null,images:['x',1]},author:'alice',allow_notify:true,
 authorized_accounts:['alice'],notify_accounts:[],market_fee:0.1,created_at_block:'1',created_at_time:'2',new_author_name:null,new_author_date:null,...changes});
export const pageRow=(s=schema(),c=collection(),a=null)=>({key:key(s.contract,s.collection_name,s.schema_name),
 fields:{contract:s.contract,collection_name:s.collection_name,schema_name:s.schema_name,created_at_time:s.created_at_time,
 authorized_accounts:c.authorized_accounts,assets:a?.assets??null},records:{schema:s,collection:c,assets:a}});
export const pageAnswer=(rows=[pageRow()])=>({kind:'page',complete:true,rows});

export async function prepared({bounds={},options={},lists,withIndexed=true}={}) {
 const selectedLimits={...limits(),...bounds},plugin=new AtomicPlugin({limits:selectedLimits,...options});
 const registration=plugin.getStatefulProjectionsV2({binding:{},sourceCapabilities:['original-action-authorization-v1']}).projections[0];
 const id=registration.definition.id,binding={chainId:hex(1),backendId:'scripted-schema-source',generation:'explicit-schema-test',mappingRevision:hex(2),hookArtifact:hex(3),hookRevision:hex(4),codecRevision:hex(5),normalizerRevision:hex(6)};
 const projection=await v1.captureStatefulDeclaration({...registration.definition,binding,selectors:registration.definition.selectors.map(s=>({...s,abiDeployment:'controlled',abiSha256:hex(7)}))},selectedLimits);
 const offerOwner=supported=>({family:owner.STATEFUL_OWNER_FAMILY_V2,interfaceVersion:2,sourceInputVersions:[2],supported,limits:selectedLimits});
 const declaration=await owner.negotiateStatefulOwnerV2(projection,offerOwner(owner.STATEFUL_OWNER_HOST_CAPABILITIES_V2),offerOwner(owner.STATEFUL_OWNER_ADAPTER_CAPABILITIES_V2));
 const requirement=registration.requiredIndexedQueries[0],model=await indexed.captureIndexedDeclarationV1(declaration,requirement.modelRevision,requirement.model);
 const offer=()=>({family:indexed.STATEFUL_INDEXED_QUERY_FAMILY_V1,interfaceVersion:1,queryDeclarationDigests:[model.digest],comparisonProfiles:[SCHEMA_LIST_COMPARISON],limits:requirement.limits});
 const adapter=new CompleteKindReference(declaration);adapter.indexedCapabilities=offer();adapter.queryCalls=0;adapter.plans=[];adapter.nativeQueryAttempts=0;
 adapter.queryCompleted=async(read,view,request,remaining,chosen)=>{
  adapter.use(read,view);adapter.queryCalls++;assert.equal(chosen.digest,model.digest);const plan=adapter.plans.shift();assert.ok(plan,'Unexpected native query');
  if(plan.request)assert.deepEqual(clone(request),plan.request);if(plan.before)await plan.before({request,remaining});
  const answer={view:clone(view),queryDeclarationDigest:model.digest,result:clone(plan.answer),attempts:plan.attempts??1};adapter.nativeQueryAttempts+=answer.attempts;
  if(plan.alter)plan.alter(answer);adapter.use(read,view);return answer;
 };
 const flags={expired:false,cancelled:false,retired:false},publications=new Map(),retained=[],hostCalls=[],listFactories=[];
 const api=Fastify(),state={api,plugin,registration,projection,declaration,model,requirement,adapter,flags,hostCalls,listFactories,retained,
  beforeSerialize:undefined,beforeSend:undefined,plan(answer=pageAnswer(),request,before){adapter.plans.push({answer,request,before});return adapter.plans.at(-1);},
  async close(){await api.close();assert.equal(adapter.acquired,adapter.closed);}};
 function guard(identity,view){return()=>{adapter.guard();if(Object.values(flags).some(Boolean))throw new v1.StatefulContractError('stateful.unavailable','Request/list/view guard expired');
  assert.deepEqual(adapter.identity,identity);owner.assertStatefulOwnerViewV2(declaration,adapter.view,view);};}
 api.addHook('preSerialization',async(req,_reply,payload)=>{if(state.beforeSerialize)await state.beforeSerialize(req);return payload;});
 api.addHook('onSend',async(req,reply,payload)=>{
  if(state.beforeSend)await state.beforeSend(req);const selected=publications.get(req.id);if(!selected)return payload;
  try{selected.guard();indexed.assertIndexedQueryPublicationV1(selected.result);if(payload!==null)assert(Buffer.byteLength(payload)<=requirement.limits.responseBytes);return payload;}
  catch{reply.code(503).header('retry-after','1').header('cache-control','no-store').type('application/json');return JSON.stringify({success:false,message:'Request publication unavailable'});}
 });
 api.addHook('onResponse',async req=>{publications.delete(req.id);});
 plugin.addRoutes(api,{statefulQueryHost(){return {compose:async()=>{throw new Error('Scripted schema read must use indexed port');}};},
  ...(lists?{operatorLists:async req=>{listFactories.push(req.id);return {resolve:names=>lists(names,state)};}}:{}),
  ...(withIndexed?{statefulIndexedQueryHost:async(req,projectionId,modelId)=>{
   hostCalls.push({projectionId,modelId});assert.equal(projectionId,id);assert.equal(modelId,SCHEMA_LIST_MODEL_ID);
   return {indexedCapabilities:offer(),async compose(chosen,read){assert.equal(chosen,id);const identity=clone(adapter.identity),view=clone(adapter.view),authority=guard(identity,view);
    const selection=indexed.negotiateIndexedQueryV1(model,requirement.limits,offer(),adapter.indexedCapabilities);
    const result=await indexed.composeStatefulOwnerIndexedReadV1(selection,adapter,identity,view,read,authority);
    const retainedGuard=()=>{authority();indexed.assertIndexedQueryPublicationV1(result);};retained.push(retainedGuard);publications.set(req.id,{result,guard:retainedGuard});return result;
   }};
  }}:{}),
 });
 return state;
}
