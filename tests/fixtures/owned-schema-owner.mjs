// Real SDK owner execution and bounded reduction port over a finite in-memory adapter.
// The adapter's commit and rollback model is a test double, not native recovery evidence.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as v1 from '@eosrio/hyperion-sdk/projection-stateful';
import * as owner from '@eosrio/hyperion-sdk/projection-stateful-owner-v2';
import {createAtomicStatefulPlugin} from '../../dist/stateful/plugin.js';
import {stageAssetTransition} from '../../dist/atomicassets/internal/schema-counts.js';
import {limits} from './config-component.mjs';
const hex=n=>n.toString(16).padStart(64,'0'),clone=structuredClone;
const sha=v=>createHash('sha256').update(v).digest('hex');
export async function ownerFixture(){
 const bounds={...limits(),recordKinds:22,readKeys:64,readAttempts:128,mutations:256};
 const plugin=createAtomicStatefulPlugin({limits:bounds,ownedSchemaCounts:true});
 const reg=plugin.getStatefulProjectionsV2({binding:{},sourceCapabilities:['original-action-authorization-v1']}).projections[0];
 assert.ok(reg.definition.records.some(r=>r.kind==='owned-schema-count'));
 const binding={chainId:hex(1),backendId:'owned-fixture',generation:'fresh-complete',mappingRevision:hex(2),hookArtifact:hex(3),hookRevision:hex(4),codecRevision:hex(5),normalizerRevision:hex(6)};
 const projection=await v1.captureStatefulDeclaration({...reg.definition,binding,selectors:reg.definition.selectors.map(s=>({...s,abiDeployment:'fixture',abiSha256:hex(7)}))},bounds);
 const offer=supported=>({family:owner.STATEFUL_OWNER_FAMILY_V2,interfaceVersion:2,sourceInputVersions:[2],supported,limits:bounds});
 const d=await owner.negotiateStatefulOwnerV2(projection,offer(owner.STATEFUL_OWNER_HOST_CAPABILITIES_V2),offer(owner.STATEFUL_OWNER_ADAPTER_CAPABILITIES_V2));
 let rows=new Map(), view={declarationDigest:d.digest,backendId:binding.backendId,generation:binding.generation,revision:hex(9),checkpoint:{blockNum:0,blockId:hex(0)}},saved=null,receipt=null,undo=[];
 const adapter={capabilities:offer(owner.STATEFUL_OWNER_ADAPTER_CAPABILITIES_V2),async bindSource(){},
  async inspectOwned(_l,target,source){return receipt?.source===source.digest?{phase:'bound',status:'committed',targetDigest:target,sourceDigest:receipt.source,candidateDigest:receipt.candidate,progress:view}:{phase:'bound',status:'new',targetDigest:target,sourceDigest:null,candidateDigest:null,progress:view};},
  async reductionRead(){return {};},async reductionView(){return view;},async readReduction(_r,expected,keys){assert.deepEqual(clone(expected),view);return {view,results:keys.map(k=>rows.has(k.kind+':'+k.key)?{status:'present',value:clone(rows.get(k.kind+':'+k.key))}:{status:'covered-absent'})};},closeRead(){},
  async applyOwned(_lease,_target,candidate){undo.push({rows:clone(rows),view:clone(view)});for(const m of candidate.mutations){const k=m.target.kind+':'+m.target.key;if(m.kind==='put')rows.set(k,clone(m.value));else rows.delete(k);}view={...view,checkpoint:{blockNum:candidate.source.source.block.blockNum,blockId:candidate.source.source.block.blockId}};receipt={source:candidate.source.digest,candidate:candidate.digest};return {status:'applied',progress:view};}};
 const custody={async load(){return saved;},async retain(c){saved=c;}};
 async function execute(events,deleteId){const number=view.checkpoint.blockNum+1,source={previous:clone(view.checkpoint),block:{blockNum:number,blockId:hex(number+100),previousBlockId:view.checkpoint.blockId,timeMs:String(1700000000000+number*1000)},inputs:events.map((e,index)=>{
   const kind=e.kind==='row'?'table':'action',name=e.kind==='row'?e.table:e.name,selector=reg.definition.selectors.find(s=>s.contract==='atomicassets'&&s.kind===kind&&s.name===name);assert.ok(selector);
   const raw=Buffer.from(JSON.stringify(e.value));return {kind,selector:selector.id,order:index,contract:'atomicassets',name,abiDeployment:'fixture',abiSha256:hex(7),mappingRevision:binding.mappingRevision,codecRevision:binding.codecRevision,normalizerRevision:binding.normalizerRevision,rawHex:raw.toString('hex'),rawSha256:sha(raw),sourceEvidence:sha('event:'+number+':'+index),data:clone(e.value),
    ...(kind==='table'?{transactionId:null,identity:{kind:'contract-row',scope:e.scope,primaryKey:'0'},payer:null,present:e.present,deltaOrdinal:index,rowOrdinal:0}:{transactionId:e.transactionId,actionOrdinal:index+1,receiver:'atomicassets',receiptOrdinal:index+1,sequence:null})};})};saved=null;receipt=null;
  const result=await owner.executeStatefulOwnerBlockV2(d,adapter,{},hex(number+500),source,custody,async port=>{
   if(deleteId)await stageAssetTransition(port,'atomicassets',deleteId,null,true);
   else await reg.reduce(port);
  },()=>{});
  return {result,source,target:hex(number+500),candidate:saved};}
 return {execute,async redeliver(source,target){return owner.executeStatefulOwnerBlockV2(d,adapter,{},target,source,custody,()=>{throw Error('duplicate reduced');},()=>{});},
  rollback(){const previous=undo.pop();assert.ok(previous);rows=previous.rows;view=previous.view;receipt=null;saved=null;},
  dropCountForTest:key=>rows.delete('owned-schema-count:'+key),
  row:(kind,key)=>clone(rows.get(kind+':'+key)),all:kind=>[...rows.entries()].filter(([k])=>k.startsWith(kind+':')).map(([,v])=>clone(v))};
}
