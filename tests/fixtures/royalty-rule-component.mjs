// Finite real SDK source/candidate/indexed composition. No native adapter/controller/process/timer imports.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import Fastify from 'fastify';
import * as v1 from '@eosrio/hyperion-sdk/projection-stateful';
import * as owner from '@eosrio/hyperion-sdk/projection-stateful-owner-v2';
import * as indexed from '@eosrio/hyperion-sdk/projection-stateful-indexed-query-v1';
import {captureStatefulSourceV2} from '@eosrio/hyperion-sdk/projection-stateful-source-v2';
import {CompleteKindReference} from './complete-kind-adapter.mjs';
const dist=process.env.ATOMIC_RULE_DIST_ROOT??fileURLToPath(new URL('../../dist',import.meta.url));
export const{default:AtomicPlugin}=await import(pathToFileURL(join(dist,'index.js')));
export const{reduceRoyaltyRule,readStoredRoyaltyRule,royaltyAttributeRows,ROYALTY_TEMPLATE_KIND,ROYALTY_ATTRIBUTE_KIND}=await import(pathToFileURL(join(dist,'atomicmarket/internal/royalty-rules.js')));
export const{parseRoyaltyAttributeParameters}=await import(pathToFileURL(join(dist,'atomicmarket/internal/royalty-attribute-query.js')));
export const{ROYALTY_ATTRIBUTE_MODEL_ID,ROYALTY_ATTRIBUTE_COMPARISON}=await import(pathToFileURL(join(dist,'stateful/royalty-rules.js')));
const clone=v=>structuredClone(v),hex=n=>n.toString(16).padStart(64,'0'),sha=v=>createHash('sha256').update(v).digest('hex');
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
export const limits=()=>({value:{depth:32,nodes:8192,fields:64,arrayElements:256,stringBytes:65536,recordBytes:262144,integerFields:16,pathSegments:16},
 envelope:{depth:48,nodes:65536,fields:64,arrayElements:1024,stringBytes:1048576,recordBytes:2097152,integerFields:16,pathSegments:16},
 selectors:128,recordKinds:21,inputOccurrences:128,inputBytes:1048576,keyBytes:256,readKeys:32,readAttempts:64,mutations:128,candidateBytes:2097152,responseRecords:32,responseBytes:131072});
export const key=(id='1',collection='collection',market='atomicmarket')=>JSON.stringify([market,collection,id]);
export const template=(changes={})=>({template_id:1,recipients:[{recipient:'alice',weight:5}],...changes});
export const attribute=(changes={})=>({index:'1',source:0,field:'name',value:['string','Gold'],weight:5,recipients:[{recipient:'alice',weight:5}],lookup_hash:'AB'.repeat(32),...changes});
export const event=(data,changes={})=>({data,present:true,scope:'collection',...changes});
export const pageRow=row=>({key:key(row.rule_id,row.collection_name,row.market_contract),fields:Object.fromEntries(['market_contract','collection_name','rule_id','source','field'].map(name=>[name,row[name]])),records:{rule:row}});
export const pageAnswer=(rows=[])=>({kind:'page',complete:true,rows:rows.map(pageRow)});

export async function prepared(table='royaltyattr',{bounds={},options={},withIndexed=true,comparison=ROYALTY_ATTRIBUTE_COMPARISON,beforeRoutes}={}){
 const selectedLimits={...limits(),...bounds},plugin=new AtomicPlugin({limits:selectedLimits,...options}),market=options.marketContract??'atomicmarket';
 const registrations=plugin.getStatefulProjectionsV2({binding:{},sourceCapabilities:['original-action-authorization-v1']}).projections;
 const registration=registrations.find(x=>x.definition.selectors.length===1&&x.definition.selectors[0].name===table),id=registration.definition.id;
 const binding={chainId:hex(1),backendId:'finite-rule-source',generation:'rule-65',mappingRevision:hex(2),hookArtifact:hex(3),hookRevision:hex(4),codecRevision:hex(5),normalizerRevision:hex(6)};
 const definition={...registration.definition,binding,selectors:registration.definition.selectors.map(x=>({...x,abiDeployment:'controlled-'+table,abiSha256:hex(7)}))};
 const projection=await v1.captureStatefulDeclaration(definition,selectedLimits),caps=supported=>({family:owner.STATEFUL_OWNER_FAMILY_V2,interfaceVersion:2,sourceInputVersions:[2],supported,limits:selectedLimits});
 const declaration=await owner.negotiateStatefulOwnerV2(projection,caps(owner.STATEFUL_OWNER_HOST_CAPABILITIES_V2),caps(owner.STATEFUL_OWNER_ADAPTER_CAPABILITIES_V2));
 const adapter=new CompleteKindReference(declaration);adapter.view.checkpoint={blockNum:0,blockId:hex(0)};adapter.queryCalls=0;adapter.nativeQueryAttempts=0;
 const requirement=registration.requiredIndexedQueries?.[0],model=requirement?await indexed.captureIndexedDeclarationV1(declaration,requirement.modelRevision,requirement.model):undefined;
 const offer=()=>({family:indexed.STATEFUL_INDEXED_QUERY_FAMILY_V1,interfaceVersion:1,queryDeclarationDigests:model?[model.digest]:[],comparisonProfiles:comparison?[comparison]:[],limits:requirement?.limits});
 adapter.indexedCapabilities=offer();const plans=[],snapshots=[],candidates=[],hostCalls=[],retained=[],publications=new Map(),flags={cancelled:false,expired:false,retired:false,incomplete:false};
 let sequence=0,branch='main';const api=Fastify();if(beforeRoutes)beforeRoutes(api);
 const guard=(identity,view)=>()=>{adapter.guard();if(Object.values(flags).some(Boolean))throw new v1.StatefulContractError('stateful.unavailable','Rule source/request context unavailable');
  assert.deepEqual(adapter.identity,identity);owner.assertStatefulOwnerViewV2(declaration,adapter.view,view);};
 adapter.queryCompleted=async(read,view,request,remaining,chosen)=>{adapter.use(read,view);adapter.queryCalls++;const p=plans.shift();assert.ok(p,'Unexpected query');assert.equal(chosen.digest,model.digest);
  if(p.request)assert.deepEqual(clone(request),p.request);if(p.before)await p.before({request,remaining});
  const result={view:clone(view),queryDeclarationDigest:model.digest,result:clone(p.answer),attempts:p.attempts??1};adapter.nativeQueryAttempts+=result.attempts;if(p.alter)p.alter(result);adapter.use(read,view);return result;};
 const state={api,plugin,registrations,registration,projection,declaration,adapter,id,market,model,requirement,flags,hostCalls,snapshots,candidates,retained,
  plan(answer=pageAnswer(),request,before){const p={answer,request,before};plans.push(p);return p;},
  async execute(events,{number=adapter.view.checkpoint.blockNum+1,timeMs=String(1700000000000+number*1000)}={}){
   const before=clone(adapter.rows),view=clone(adapter.view),blockId=sha(branch+':'+number+':'+(++sequence));
   const source={previous:clone(view.checkpoint),block:{blockNum:number,blockId,previousBlockId:view.checkpoint.blockId,timeMs},inputs:events.map((item,index)=>{
    const data=clone(item.data),raw=Buffer.from(JSON.stringify(data)),selector=definition.selectors[0];return{kind:'table',selector:selector.id,order:index,contract:item.contract??market,name:item.name??table,
     abiDeployment:selector.abiDeployment,abiSha256:selector.abiSha256,mappingRevision:binding.mappingRevision,codecRevision:binding.codecRevision,normalizerRevision:binding.normalizerRevision,
     rawHex:raw.toString('hex'),rawSha256:sha(raw),sourceEvidence:sha('rule:'+number+':'+index),transactionId:null,
     identity:item.identity??{kind:'contract-row',scope:item.scope,primaryKey:String(item.data?.index??item.data?.template_id??index)},payer:null,present:item.present,deltaOrdinal:index,rowOrdinal:0,data};})};
   const captured=await captureStatefulSourceV2(declaration,source),next=clone(before),observations=new Map(),mutations=[];
   const port={source:captured.source,view,async get(kind,k){const label=kind+':'+k;if(!observations.has(label))observations.set(label,{key:{kind,key:k},result:before.get(kind)?.has(k)?{status:'present',value:clone(before.get(kind).get(k))}:{status:'covered-absent'}});
    return next.get(kind)?.has(k)?{status:'present',value:clone(next.get(kind).get(k))}:{status:'covered-absent'};},
    put(kind,k,value){const row=v1.canonicalStatefulRecord(projection,kind,value).value;if(!next.has(kind))next.set(kind,new Map());next.get(kind).set(k,clone(row));mutations.push({kind:'put',target:{kind,key:k},value:row});},
    delete(kind,k){next.get(kind)?.delete(k);mutations.push({kind:'delete',target:{kind,key:k}});}};
   await registration.reduce(port);const body={declarationDigest:declaration.digest,source:captured,view,observations:[...observations.values()],mutations};
   const candidate=await owner.captureStatefulOwnerCandidateV2(declaration,{...body,digest:sha(canonical(body))});candidates.push(candidate);snapshots.push({rows:before,view});
   adapter.rows=next;adapter.view={...view,checkpoint:{blockNum:number,blockId}};return candidate;
  },async data(id='1',collection='collection'){return readStoredRoyaltyRule({get:async(kind,k)=>adapter.rows.get(kind)?.has(k)?{status:'present',value:clone(adapter.rows.get(kind).get(k))}:{status:'covered-absent'}},table,market,collection,id);},
  rollback(){const prior=snapshots.pop();assert.ok(prior);adapter.rows=clone(prior.rows);adapter.view={...clone(prior.view),revision:sha('replacement:'+sequence)};branch='fork-'+sequence;},
  async close(){await api.close();assert.equal(adapter.acquired,adapter.closed);assert.equal(publications.size,0);}};
 api.addHook('preSerialization',async(request,_reply,payload)=>{if(state.beforeSerialize)await state.beforeSerialize(request);return payload;});
 api.addHook('onSend',async(request,reply,payload)=>{if(state.beforeSend)await state.beforeSend(request);const entry=publications.get(request.id);if(!entry)return payload;
  try{entry.guard();indexed.assertIndexedQueryPublicationV1(entry.result);return payload;}catch{reply.code(503).header('retry-after','1').header('cache-control','no-store').type('application/json');return JSON.stringify({success:false,message:'Rule publication unavailable'});}});
 api.addHook('onResponse',async request=>{publications.delete(request.id);});
 plugin.addRoutes(api,{statefulQueryHost(){throw Error('Rule route must use indexed port');},operatorLists(){throw Error('Attributes must not resolve lists');},
  ...(withIndexed?{statefulIndexedQueryHost:async(request,projectionId,modelId)=>{hostCalls.push({projectionId,modelId});assert.equal(projectionId,id);assert.equal(modelId,ROYALTY_ATTRIBUTE_MODEL_ID);
   return{indexedCapabilities:offer(),async compose(chosen,callback){assert.equal(chosen,id);const identity=clone(adapter.identity),view=clone(adapter.view),authority=guard(identity,view);
    const selection=indexed.negotiateIndexedQueryV1(model,requirement.limits,offer(),adapter.indexedCapabilities),result=await indexed.composeStatefulOwnerIndexedReadV1(selection,adapter,identity,view,callback,authority);
    const retainedGuard=()=>{authority();indexed.assertIndexedQueryPublicationV1(result);};retained.push(retainedGuard);publications.set(request.id,{result,guard:retainedGuard});return result;}};}}:{})});
 return state;
}
