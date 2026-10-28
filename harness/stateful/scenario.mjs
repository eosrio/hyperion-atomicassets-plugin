/** Root-operated engine scenario inputs, also shared by socket-free caller controls.
 * JSON engineering occurrences/rebased blocks are not chain/ABI authority.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {RECORD_KINDS,selectors,RELATIONS_CONTRACT} from './bridge.mjs';
import {initial,stages,codec,input as aa,key} from '../../tests/fixtures/asset-domain-cases.mjs';
import {input as am,scenario} from '../../tests/fixtures/fixed-sale-cases.mjs';
export {codec};
const hash=b=>createHash('sha256').update(b).digest('hex'),hex=n=>n.toString(16).padStart(64,'0');
export const atomicQuery=Object.freeze({assetId:aa.assetId,saleId:am.saleId});
export const atomicLimits=Object.freeze({value:{depth:16,nodes:256,fields:32,arrayElements:32,stringBytes:1024,recordBytes:4096,integerFields:4,pathSegments:8},
  envelope:{depth:32,nodes:8192,fields:64,arrayElements:128,stringBytes:262144,recordBytes:262144,integerFields:4,pathSegments:8},
  selectors:18,recordKinds:15,inputOccurrences:64,inputBytes:262144,keyBytes:128,readKeys:8,readAttempts:32,mutations:16,
  candidateBytes:262144,responseRecords:32,responseBytes:262144});
export function atomicDefinition() {return {family:'stateful-projection-recovery',interfaceVersion:1,id:'atomic-qualified-bridge',
  binding:{chainId:hex(10),backendId:'atomic-component-fixture',generation:'constructed-empty-genesis',mappingRevision:hex(11),
    hookArtifact:hash(readFileSync(new URL('./bridge.mjs',import.meta.url))),hookRevision:hex(12),
    codecRevision:codec.sha256,normalizerRevision:hash('engineering-json-envelope-v1')},
  selectors:selectors(aa.contract,am.marketContract),records:RECORD_KINDS.map(kind=>({kind,integers:kind==='asset'?[{path:['asset_id'],type:'uint64',vector:false}]:[]}))};}
export function atomicSource(def,n,events,id=n,previous={blockNum:n-1,blockId:hex(n-1)}) {
  return {previous,block:{blockNum:n,blockId:hex(id),previousBlockId:previous.blockId,timeMs:String(Date.parse(aa.block.timestamp+'Z')+(n-1)*1000)},
    inputs:events.map((event,i)=>{
      const contract=event.contract??aa.contract,kind=event.kind==='action'?'action':'table',name=event.name??event.table,
        selected=def.selectors.find(s=>s.contract===contract&&s.name===name&&s.kind===kind),data={value:event.value,schemaDigest:event.evidence?.schemaDigest??null},
        raw=Buffer.from(JSON.stringify(data));assert.ok(selected);
      const common={selector:selected.id,order:i,kind,contract,name,abiDeployment:selected.abiDeployment,abiSha256:selected.abiSha256,
        mappingRevision:def.binding.mappingRevision,codecRevision:def.binding.codecRevision,normalizerRevision:def.binding.normalizerRevision,
        rawHex:raw.toString('hex'),rawSha256:hash(raw),sourceEvidence:hash('constructed:'+n+':'+i),transactionId:kind==='action'?event.transactionId??hex(50):null,data};
      return kind==='action'?{...common,actionOrdinal:i+1,receiver:contract,receiptOrdinal:0,sequence:String(i+1)}:
        {...common,scope:event.scope??contract,primaryKey:event.primaryKey??String(i),present:event.present??true,deltaOrdinal:i,rowOrdinal:0};
    })};
}
export const marketOccurrence=e=>({kind:'action',contract:am.marketContract,name:e.name,value:e.data,transactionId:hex(51)});
export const relationOccurrence=(kind,k,value,present=true)=>({kind:'row',contract:RELATIONS_CONTRACT,table:kind,primaryKey:k,value,present});
export function firstAtomicEvents() {return [...initial(),{kind:'row',contract:am.marketContract,table:'config',value:{version:'1.2.2'}},
  relationOccurrence('offer',key(aa.contract,am.offerId),am.relationships.offer),relationOccurrence('offer-assets',key(aa.contract,am.offerId),am.relationships.offerAssets),
  relationOccurrence('market-token',key(am.marketContract,'WAX'),am.relationships.token),...scenario('same-block-start-before-create').blocks[0].events.map(marketOccurrence)];}
export const secondAtomicEvents=()=>[...stages()[2],marketOccurrence({name:'purchasesale',data:{sale_id:am.saleId,buyer:'buyer',intended_delphi_median:'0',taker_marketplace:''}})];
