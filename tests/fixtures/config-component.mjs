// Finite SDK source/candidate/composition controls; no DB, process, socket or controller imports.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {join} from 'node:path';
import Fastify from 'fastify';
import * as v1 from '@eosrio/hyperion-sdk/projection-stateful';
import * as owner from '@eosrio/hyperion-sdk/projection-stateful-owner-v2';
import {captureStatefulSourceV2} from '@eosrio/hyperion-sdk/projection-stateful-source-v2';
import {CompleteKindReference,offer} from './complete-kind-adapter.mjs';
const dist=process.env.ATOMIC_CONFIG_DIST_ROOT??fileURLToPath(new URL('../../dist',import.meta.url));
export const {createAtomicStatefulPlugin}=await import(pathToFileURL(join(dist,'index.js')));
export const {readAssetConfig}=await import(pathToFileURL(join(dist,'atomicassets/internal/config.js')));
const hex=n=>n.toString(16).padStart(64,'0'),sha=value=>createHash('sha256').update(value).digest('hex');
export const key=contract=>JSON.stringify([contract]);
export const token=(symbol='AAA',precision=4,contract='eosio.token')=>({sym:precision+','+symbol,contract});
export const config=(tokens=[token()],format=[])=>({supported_tokens:tokens,collection_format:format});
export const metadata=(version='1.2.0')=>({standard:'atomicassets',version});
export const event=(table,value,contract='atomicassets',present=true)=>({table,value,contract,present});
export const limits=()=>({value:{depth:32,nodes:8192,fields:64,arrayElements:256,stringBytes:4096,recordBytes:131072,integerFields:16,pathSegments:16},
 envelope:{depth:48,nodes:65536,fields:64,arrayElements:1024,stringBytes:1048576,recordBytes:2097152,integerFields:16,pathSegments:16},
 selectors:128,recordKinds:21,inputOccurrences:128,inputBytes:1048576,keyBytes:256,readKeys:16,readAttempts:64,mutations:128,candidateBytes:2097152,responseRecords:16,responseBytes:65536});
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']'
 :'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
const clone=value=>structuredClone(value);

export async function prepared(changes={}){
 const bounds={...limits(),...changes},plugin=createAtomicStatefulPlugin({limits:bounds});
 const registration=plugin.getStatefulProjectionsV2({binding:{},sourceCapabilities:['original-action-authorization-v1']}).projections[0];
 const binding={chainId:hex(10),backendId:'finite-config-control',generation:'config-52',mappingRevision:hex(11),hookArtifact:hex(12),hookRevision:hex(13),codecRevision:hex(14),normalizerRevision:hex(15)};
 const definition={...registration.definition,binding,selectors:registration.definition.selectors.map(selector=>({...selector,abiDeployment:'controlled-original-config',abiSha256:hex(20)}))};
 const projection=await v1.captureStatefulDeclaration(definition,bounds);
 const caps=supported=>({family:owner.STATEFUL_OWNER_FAMILY_V2,interfaceVersion:2,sourceInputVersions:[2],supported,limits:bounds});
 const declaration=await owner.negotiateStatefulOwnerV2(projection,caps(owner.STATEFUL_OWNER_HOST_CAPABILITIES_V2),caps(owner.STATEFUL_OWNER_ADAPTER_CAPABILITIES_V2));
 const adapter=new CompleteKindReference(declaration);adapter.view.checkpoint={blockNum:0,blockId:hex(0)};
 const queryBounds={readAttempts:bounds.readAttempts,responseRecords:bounds.responseRecords,responseBytes:bounds.responseBytes};
 adapter.completeKindCapabilities=offer(queryBounds);
 const selection=owner.negotiateStatefulCompleteKindV1(declaration,queryBounds,offer(queryBounds),offer(queryBounds));
 const errors=[],candidates=[],snapshots=[],requestGuards=new Map(),flags={expired:false,cancelled:false,retired:false};let sequence=0,branch='main';
 const api=Fastify();
 api.setErrorHandler((error,request,reply)=>{requestGuards.delete(request.id);errors.push(error);reply.code(503).send({success:false,message:'State unavailable'});});
 api.addHook('preSerialization',async(request,_reply,payload)=>{if(state.beforeSerialize)await state.beforeSerialize(request);requestGuards.get(request.id)?.();return payload;});
 api.addHook('onSend',async(request,_reply,payload)=>{if(state.beforeSend)await state.beforeSend(request);requestGuards.get(request.id)?.();return payload;});
 api.addHook('onResponse',async request=>{requestGuards.delete(request.id);});
 const authority=(identity,view)=>()=>{adapter.guard();if(Object.values(flags).some(Boolean))throw new v1.StatefulContractError('stateful.unavailable','Original config request authority expired/cancelled/retired');
  assert.deepEqual(adapter.identity,identity);owner.assertStatefulOwnerViewV2(declaration,adapter.view,view);};
 plugin.addRoutes(api,{statefulQueryHost(){throw Error('Config must use the counted keyed scope');},async statefulCompleteKindQueryHost(request,id){
  assert.equal(id,'atomicassets');const identity=clone(adapter.identity),view=clone(adapter.view),guard=authority(identity,view);requestGuards.set(request.id,guard);
  return {completeKindCapabilities:offer(queryBounds),async compose(projectionId,callback){assert.equal(projectionId,id);return owner.composeStatefulOwnerCompleteKindReadV1(selection,adapter,identity,view,callback,guard);}};
 }});
 const state={api,adapter,errors,flags,plugin,projection,declaration,candidates,snapshots,registration,
  async execute(events){
   const before=clone(adapter.rows),view=clone(adapter.view),number=view.checkpoint.blockNum+1,blockId=sha(branch+':'+number+':'+(++sequence));
   const source={previous:clone(view.checkpoint),block:{blockNum:number,blockId,previousBlockId:view.checkpoint.blockId,timeMs:String(1700000000000+number*1000)},
    inputs:events.map((item,index)=>{
     const selector=definition.selectors.find(selector=>selector.contract===item.contract&&selector.kind==='table'&&selector.name===item.table);assert.ok(selector,'declared source selector');
     const data=item.present?clone(item.value):null,bytes=Buffer.from(JSON.stringify(data));
     return {kind:'table',selector:selector.id,order:index,contract:item.contract,name:item.table,abiDeployment:selector.abiDeployment,abiSha256:selector.abiSha256,
      mappingRevision:binding.mappingRevision,codecRevision:binding.codecRevision,normalizerRevision:binding.normalizerRevision,rawHex:bytes.toString('hex'),rawSha256:sha(bytes),sourceEvidence:sha('source:'+number+':'+index),
      transactionId:null,identity:{kind:'contract-row',scope:item.contract,primaryKey:'0'},payer:null,present:item.present,deltaOrdinal:index,rowOrdinal:0,data};
    })};
   const captured=await captureStatefulSourceV2(declaration,source),next=clone(before),observations=new Map(),mutations=[];
   const port={source:captured.source,view,
    async get(kind,k){const result=next.get(kind)?.has(k)?{status:'present',value:clone(next.get(kind).get(k))}:{status:'covered-absent'};
     const id=kind+':'+k;if(!observations.has(id))observations.set(id,{key:{kind,key:k},result:before.get(kind)?.has(k)?{status:'present',value:clone(before.get(kind).get(k))}:{status:'covered-absent'}});return result;},
    put(kind,k,value){const captured=v1.canonicalStatefulRecord(projection,kind,value).value;if(!next.has(kind))next.set(kind,new Map());next.get(kind).set(k,clone(captured));mutations.push({kind:'put',target:{kind,key:k},value:captured});},
    delete(kind,k){next.get(kind)?.delete(k);mutations.push({kind:'delete',target:{kind,key:k}});}};
   await registration.reduce(port);
   const body={declarationDigest:declaration.digest,source:captured,view,observations:[...observations.values()],mutations};
   const candidate=await owner.captureStatefulOwnerCandidateV2(declaration,{...body,digest:sha(canonical(body))});
   candidates.push(candidate);snapshots.push({rows:before,view});adapter.rows=next;adapter.view={...view,checkpoint:{blockNum:number,blockId}};return candidate;
  },
  rollback(){const prior=snapshots.pop();assert.ok(prior);adapter.rows=clone(prior.rows);adapter.view={...clone(prior.view),revision:sha('fork-revision:'+sequence)};branch='replacement-'+sequence;},
  async data(){return readAssetConfig({get:async(kind,k)=>adapter.rows.get(kind)?.has(k)?{status:'present',value:clone(adapter.rows.get(kind).get(k))}:{status:'covered-absent'}},'atomicassets');},
  snapshot(){return clone(adapter.rows);},
  async close(){await api.close();assert.equal(requestGuards.size,0);},
 };
 return state;
}
