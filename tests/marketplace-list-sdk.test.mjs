import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import * as v1 from '@eosrio/hyperion-sdk/projection-stateful';
import * as owner from '@eosrio/hyperion-sdk/projection-stateful-owner-v2';
import {createAtomicStatefulPlugin} from '../dist/index.js';
import {atomicLimits} from '../harness/stateful/scenario.mjs';
import {CompleteKindReference, offer} from './fixtures/complete-kind-adapter.mjs';
const hex=n=>n.toString(16).padStart(64,'0'), key=n=>JSON.stringify(['atomicmarket',n]);
const row=n=>({market_contract:'atomicmarket',marketplace_name:n,creator:'alice',created_at_block:'9007199254740993',created_at_time:'1700000000000'});
async function setup(bounds={readAttempts:12,responseRecords:8,responseBytes:65536}){
 const limits={...atomicLimits,selectors:128,recordKinds:20,...bounds};
 const plugin=createAtomicStatefulPlugin({limits});const d=plugin.getStatefulProjectionsV2({binding:{},sourceCapabilities:['original-action-authorization-v1']}).projections[0];
 assert.deepEqual(d.requiredCompleteKindRead,offer(bounds));
 const binding={chainId:hex(10),backendId:'controlled',generation:'sdk-list',mappingRevision:hex(11),hookArtifact:hex(12),hookRevision:hex(13),codecRevision:hex(14),normalizerRevision:hex(15)};
 const definition={...d.definition,binding,selectors:d.definition.selectors.map(s=>({...s,abiDeployment:'fixture',abiSha256:hex(20)}))};
 const projection=await v1.captureStatefulDeclaration(definition,limits);
 const cap=(supported)=>({family:owner.STATEFUL_OWNER_FAMILY_V2,interfaceVersion:2,sourceInputVersions:[2],supported,limits});
 const declaration=await owner.negotiateStatefulOwnerV2(projection,cap(owner.STATEFUL_OWNER_HOST_CAPABILITIES_V2),cap(owner.STATEFUL_OWNER_ADAPTER_CAPABILITIES_V2));
 const adapter=new CompleteKindReference(declaration);adapter.completeKindCapabilities=offer(bounds);
 const selection=owner.negotiateStatefulCompleteKindV1(declaration,bounds,offer(bounds),offer(bounds));
 const errors=[];const api=Fastify();api.setErrorHandler((e,_q,r)=>{errors.push(e.message);r.code(503).send({success:false});});
 plugin.addRoutes(api,{statefulQueryHost(){throw Error('unexpected');},async statefulCompleteKindQueryHost(_request,id){assert.equal(id,'atomicassets');return {completeKindCapabilities:offer(bounds),async compose(_id,fn){return owner.composeStatefulOwnerCompleteKindReadV1(selection,adapter,adapter.identity,adapter.view,fn,adapter.guard);}};}});
 return {api,adapter,errors};
}
test('real SDK composes marketplace list only after explicit empty terminal page',async()=>{
 const s=await setup();try{s.adapter.pageSize=1;s.adapter.rows.set('marketplace',new Map([[key('a'),row('a')],[key('b'),row('b')]]));
 const r=await s.api.inject('/atomicmarket/v1/marketplaces');assert.equal(r.statusCode,200);assert.deepEqual(r.json().data.map(x=>x.marketplace_name),['a','b']);assert.equal(s.adapter.nativeDataAttempts,3);assert.equal(s.adapter.closed,1);
 }finally{await s.api.close();}
});
test('real SDK and bounded adapter refuse overflow, incomplete completion and exhausted attempt budgets',async()=>{
 for(const mode of ['rows','attempts','incomplete','bytes']){
  const bounds=mode==='rows'?{readAttempts:12,responseRecords:1,responseBytes:65536}:mode==='attempts'?{readAttempts:1,responseRecords:8,responseBytes:65536}:mode==='bytes'?{readAttempts:12,responseRecords:8,responseBytes:512}:{readAttempts:12,responseRecords:8,responseBytes:65536};
  const s=await setup(bounds);try{s.adapter.pageSize=1;s.adapter.rows.set('marketplace',new Map([[key('a'),row('a')],[key('b'),row('b')]]));
   if(mode==='incomplete')s.adapter.beforeReturn=async(_kind,answer)=>{answer.complete=false;};
   const r=await s.api.inject('/atomicmarket/v1/marketplaces');assert.equal(r.statusCode,503,mode);assert.equal(s.adapter.closed,1);assert.equal(s.adapter.kindCalls,1);
   assert.match(s.errors[0],mode==='rows'?/row overflow/:mode==='attempts'?/before exhaustion/:mode==='bytes'?/byte bound/:/complete/i);
  }finally{await s.api.close();}
 }
});
