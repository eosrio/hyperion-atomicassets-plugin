// Finite real-SDK source/candidate/query composition. No DB, process, listener, timer or controller imports.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
import Fastify from 'fastify';
import * as v1 from '@eosrio/hyperion-sdk/projection-stateful';
import * as owner from '@eosrio/hyperion-sdk/projection-stateful-owner-v2';
import {captureStatefulSourceV2} from '@eosrio/hyperion-sdk/projection-stateful-source-v2';
import {CompleteKindReference,offer} from './complete-kind-adapter.mjs';
const dist=process.env.ATOMIC_ROYALTY_DIST_ROOT??fileURLToPath(new URL('../../dist',import.meta.url));
export const {default:AtomicPlugin,createAtomicStatefulPlugin}=await import(pathToFileURL(join(dist,'index.js')));
export const {readRoyaltyConfig,reduceRoyaltyConfig,ROYALTY_CONFIG_KIND}=await import(pathToFileURL(join(dist,'atomicmarket/internal/royalty-config.js')));
const sha=value=>createHash('sha256').update(value).digest('hex'),hex=n=>n.toString(16).padStart(64,'0'),clone=value=>structuredClone(value);
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']'
 :'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
export const key=(collection='collection',market='atomicmarket')=>JSON.stringify([market,collection]);
export const value=(changes={})=>({collection:'collection',founders:[{recipient:'founder',weight:10}],attribute_mode:1,
 split_founders:10,split_templates:20,split_attributes:30,...changes});
export const event=(data=value(),changes={})=>({data,present:true,contract:'atomicmarket',name:'royaltyconf',...changes});
export const limits=()=>({value:{depth:32,nodes:8192,fields:64,arrayElements:256,stringBytes:4096,recordBytes:131072,integerFields:16,pathSegments:16},
 envelope:{depth:48,nodes:65536,fields:64,arrayElements:1024,stringBytes:1048576,recordBytes:2097152,integerFields:16,pathSegments:16},
 selectors:128,recordKinds:21,inputOccurrences:128,inputBytes:1048576,keyBytes:256,readKeys:16,readAttempts:64,mutations:128,candidateBytes:2097152,responseRecords:16,responseBytes:65536});

export async function prepared(changes={},options={}){
 const bounds={...limits(),...changes},plugin=new AtomicPlugin({limits:bounds,...options});
 const registrations=plugin.getStatefulProjectionsV2({binding:{},sourceCapabilities:['original-action-authorization-v1']}).projections;
 const registration=registrations[1],id=registration.definition.id,market=options.marketContract??'atomicmarket';
 const binding={chainId:hex(10),backendId:'finite-royalty-control',generation:'royalty-62',mappingRevision:hex(11),hookArtifact:hex(12),hookRevision:hex(13),codecRevision:hex(14),normalizerRevision:hex(15)};
 const definition={...registration.definition,binding,selectors:registration.definition.selectors.map(selector=>({...selector,abiDeployment:'controlled-royaltyconf',abiSha256:hex(20)}))};
 const projection=await v1.captureStatefulDeclaration(definition,bounds);
 const caps=supported=>({family:owner.STATEFUL_OWNER_FAMILY_V2,interfaceVersion:2,sourceInputVersions:[2],supported,limits:bounds});
 const declaration=await owner.negotiateStatefulOwnerV2(projection,caps(owner.STATEFUL_OWNER_HOST_CAPABILITIES_V2),caps(owner.STATEFUL_OWNER_ADAPTER_CAPABILITIES_V2));
 const adapter=new CompleteKindReference(declaration);adapter.view.checkpoint={blockNum:0,blockId:hex(0)};
 const queryBounds={readAttempts:bounds.readAttempts,responseRecords:bounds.responseRecords,responseBytes:bounds.responseBytes};
 adapter.completeKindCapabilities=offer(queryBounds);
 const selection=owner.negotiateStatefulCompleteKindV1(declaration,queryBounds,offer(queryBounds),offer(queryBounds));
 const errors=[],candidates=[],snapshots=[],requestGuards=new Map(),retainedGuards=[],flags={expired:false,cancelled:false,retired:false,incomplete:false};let sequence=0,branch='main';
 const api=Fastify();
 api.setErrorHandler((error,request,reply)=>{requestGuards.delete(request.id);errors.push(error);reply.code(503).send({success:false,message:'State unavailable'});});
 api.addHook('preSerialization',async(request,_reply,payload)=>{if(state.beforeSerialize)await state.beforeSerialize(request);requestGuards.get(request.id)?.();return payload;});
 api.addHook('onSend',async(request,_reply,payload)=>{if(state.beforeSend)await state.beforeSend(request);requestGuards.get(request.id)?.();return payload;});
 api.addHook('onResponse',async request=>{requestGuards.delete(request.id);});
 const authority=(identity,view)=>()=>{adapter.guard();if(Object.values(flags).some(Boolean))throw new v1.StatefulContractError('stateful.unavailable','Request source/coverage expired or unavailable');
  assert.deepEqual(adapter.identity,identity);owner.assertStatefulOwnerViewV2(declaration,adapter.view,view);};
 plugin.addRoutes(api,{statefulQueryHost(){throw Error('Royalty config must use counted keyed scope');},async statefulCompleteKindQueryHost(request,projectionId){
  assert.equal(projectionId,id);const identity=clone(adapter.identity),view=clone(adapter.view),guard=authority(identity,view);requestGuards.set(request.id,guard);retainedGuards.push(guard);
  return {completeKindCapabilities:offer(queryBounds),async compose(selected,callback){assert.equal(selected,id);return owner.composeStatefulOwnerCompleteKindReadV1(selection,adapter,identity,view,callback,guard);}};
 }});
 const state={api,adapter,errors,flags,plugin,projection,declaration,candidates,snapshots,registration,registrations,id,retainedGuards,
  async execute(events,{number=adapter.view.checkpoint.blockNum+1,timeMs=String(1700000000000+number*1000)}={}){
   const before=clone(adapter.rows),view=clone(adapter.view),blockId=sha(branch+':'+number+':'+(++sequence));
   const source={previous:clone(view.checkpoint),block:{blockNum:number,blockId,previousBlockId:view.checkpoint.blockId,timeMs},
    inputs:events.map((item,index)=>{
     const selector=definition.selectors.find(selector=>selector.contract===item.contract&&selector.name===item.name);
     assert.ok(selector,'Actual source must belong to declared selector');const data=clone(item.data),bytes=Buffer.from(JSON.stringify(data));
     return {kind:'table',selector:selector.id,order:index,contract:item.contract,name:item.name,abiDeployment:selector.abiDeployment,abiSha256:selector.abiSha256,
      mappingRevision:binding.mappingRevision,codecRevision:binding.codecRevision,normalizerRevision:binding.normalizerRevision,rawHex:bytes.toString('hex'),rawSha256:sha(bytes),sourceEvidence:sha('source:'+number+':'+index),
      transactionId:null,identity:{kind:'contract-row',scope:market,primaryKey:String(index)},payer:null,present:item.present,deltaOrdinal:index,rowOrdinal:0,data};
    })};
   const captured=await captureStatefulSourceV2(declaration,source),next=clone(before),observations=new Map(),mutations=[];
   const port={source:captured.source,view,
    async get(kind,k){const result=next.get(kind)?.has(k)?{status:'present',value:clone(next.get(kind).get(k))}:{status:'covered-absent'};
     const target=kind+':'+k;if(!observations.has(target))observations.set(target,{key:{kind,key:k},result:before.get(kind)?.has(k)?{status:'present',value:clone(before.get(kind).get(k))}:{status:'covered-absent'}});return result;},
    put(kind,k,value){const selected=v1.canonicalStatefulRecord(projection,kind,value).value;if(!next.has(kind))next.set(kind,new Map());next.get(kind).set(k,clone(selected));mutations.push({kind:'put',target:{kind,key:k},value:selected});},
    delete(kind,k){next.get(kind)?.delete(k);mutations.push({kind:'delete',target:{kind,key:k}});}};
   await registration.reduce(port);
   const body={declarationDigest:declaration.digest,source:captured,view,observations:[...observations.values()],mutations};
   const candidate=await owner.captureStatefulOwnerCandidateV2(declaration,{...body,digest:sha(canonical(body))});
   candidates.push(candidate);snapshots.push({rows:before,view});adapter.rows=next;adapter.view={...view,checkpoint:{blockNum:number,blockId}};return candidate;
  },
  rollback(){const prior=snapshots.pop();assert.ok(prior);adapter.rows=clone(prior.rows);adapter.view={...clone(prior.view),revision:sha('fork-revision:'+sequence)};branch='replacement-'+sequence;},
  async data(collection='collection'){return readRoyaltyConfig({get:async(kind,k)=>adapter.rows.get(kind)?.has(k)?{status:'present',value:clone(adapter.rows.get(kind).get(k))}:{status:'covered-absent'}},market,collection);},
  async close(){await api.close();assert.equal(requestGuards.size,0);},
 };
 return state;
}
