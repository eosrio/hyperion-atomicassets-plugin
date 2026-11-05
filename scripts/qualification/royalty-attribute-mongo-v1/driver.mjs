// Called only by the admitted Linux workload; supplied ports retain native/host authority.
import assert from 'node:assert/strict';
import {royaltyInputs} from './source.mjs';
import {attributeCases,pairAttributeCase} from './attribute-oracle.mjs';
import {decodeRoyaltyRecords} from './pair.mjs';
const hex=n=>n.toString(16).padStart(64,'0'),copy=structuredClone;
export async function runAttributeNativePair({host,owner,captureSource,original,answers,custody,modelByPhase,collectionByModel,onPhase,readNativeBoundary,persist,guard}){
 for(const f of [captureSource,onPhase,readNativeBoundary,persist,guard])assert.equal(typeof f,'function');assert(Array.isArray(answers));
 const entry=host.registry.entries.get('atomicassets:royalty-attribute-rules');assert(entry);
 const selected=entry.indexed.models.get('atomicmarket-royalty-attributes');assert(selected);
 assert.equal(selected.declaration.model.textComparison,'mongodb-simple-utf8-v1');assert.deepEqual(selected.declaration.model.joins,[]);
 let identity={id:'controlled-royalty-attribute-native',generation:'royaltyattr'},lease=await entry.adapter.acquireOwner({expected:null,nextOwner:identity},guard);const candidates=new Map();
 assert.equal((await entry.adapter.recovery()).view.checkpoint.blockNum,0,'Attribute fixture must start at empty genesis');
 const sources=[];let serial=200;
 assert.equal(original.events.length,4);
 for(const event of original.events){
  guard();const rows=event.rows.filter(row=>row.table==='royaltyattr');assert(rows.length>0&&rows.length<=2);
  const declaration=entry.declaration,previous=(await entry.adapter.recovery()).view,id=++serial;
  assert.equal(previous.checkpoint.blockNum+1,event.block.block_num);
  const block={blockNum:event.block.block_num,blockId:hex(id),previousBlockId:previous.checkpoint.blockId};
  const target=await owner.captureStatefulRawTargetV2(declaration,{schemaVersion:2,chainId:declaration.projection.definition.binding.chainId,declarationDigest:declaration.digest,owner:identity,previous,block,
   rawSource:{commitId:'attribute-fixture:'+id,selectionId:'attribute-fixture:'+id,observationId:'attribute-fixture:'+id,observationDigest:hex(id+1000)}});
  await entry.adapter.admitRaw(lease,target);
  const source={previous:copy(previous.checkpoint),block:{...block,timeMs:String(Date.parse(event.block.timestamp+'Z'))},inputs:royaltyInputs(declaration,rows,id)};
  const captured=await captureSource(declaration,source);let candidate;
  const store={async load(d,s){return candidates.get(d+':'+s)??null;},async retain(value){const key=value.declarationDigest+':'+value.source.digest;assert(!candidates.has(key)&&candidates.size<4);candidate=value;candidates.set(key,copy(value));await persist({event:'attribute-candidate',candidate:value});}};
  const result=await owner.executeStatefulOwnerBlockV2(declaration,entry.adapter,lease,target.digest,source,store,entry.reduce,guard);
  assert.equal(result.status,'applied');assert(candidate);assert.equal(candidate.source.digest,captured.digest);
  await entry.adapter.retireRaw(lease,target.digest,candidate.source.digest,candidate.digest);const view=(await entry.adapter.recovery()).view;
  await host.publish(declaration,view);const receipt={event:'attribute-source-committed',table:'royaltyattr',stage:event.stage,originalBlock:event.block,source,candidateDigest:candidate.digest,view};sources.push(receipt);await persist(receipt);
 }
 const pairs=[];
 for(const pg of attributeCases(original)){
  guard();const current=await entry.adapter.recovery(),view=current.view,phase='attribute:'+pg.name;
  if(pg.status===200)modelByPhase[phase]=selected.declaration.digest;
  onPhase({name:phase,phase,expected:view,owner:identity,ownerClaim:current.owner.claimDigest,ownerDeclaration:entry.declaration.digest});
  const before=answers.length,start=readNativeBoundary();assert.equal(start.pending,0);await persist({event:'attribute-http-boundary',case:pg.name,kind:'before',boundary:start});
  const response=await host.observe('/atomicmarket/v1/royalties/oracle/attributes',view,{method:pg.method??'GET',query:pg.query??{},...(pg.body?{payload:pg.body}:{})});
  const end=readNativeBoundary();assert.equal(end.pending,0);await persist({event:'attribute-http-boundary',case:pg.name,kind:'after',boundary:end});
  let native=null,query=null;
  if(pg.status===200){
   assert.equal(answers.length,before+1,'Exactly one actual managed indexed answer required');const observed=answers.at(-1),answer=observed.answer.result;
   assert.equal(observed.projection,'atomicassets:royalty-attribute-rules');assert.equal(observed.model,'atomicmarket-royalty-attributes');assert.equal(answer.kind,'page');assert.equal(answer.complete,true);
   const alias=selected.declaration.model.base.alias;query=observed.query;
   native=custody.seal(phase,{model:selected.declaration.digest,baseAlias:alias,collection:collectionByModel[selected.declaration.digest],expectedRecords:answer.rows.map(row=>row.records[alias])});
  }else{assert.equal(answers.length,before,'Original validation must not reach a native query');assert.equal(end.events,start.events,'Original validation must not issue any native command');}
  const managed={status:response.statusCode,rawText:response.body,body:response.body===''?null:response.json()};
  const pair=pairAttributeCase({original,pg,native,managed,query});
  assert.deepEqual((await entry.adapter.recovery()).view,view,'Attribute query changed owner view');
  const receipt={case:pg.name,view,query,native,boundary:{start,end},managed:{...managed,headers:response.headers},pair};pairs.push(receipt);await persist({event:'attribute-independent-pair',receipt});
 }
 const publication=[],url='/atomicmarket/v1/royalties/oracle/attributes',current=()=>entry.adapter.recovery(),view=(await current()).view;
 // Refusal phases deliberately cannot masquerade as one of the five successful case seals.
 onPhase({name:'publication-controls',phase:'publication-controls'});
 for(const flag of ['source','mapping']){
  host.controls[flag]=false;try{assert.equal((await host.observe(url,view)).statusCode,503);}finally{host.controls[flag]=true;}
  await host.late(url,async()=>{host.controls[flag]=false;},view).finally(()=>{host.controls[flag]=true;});
  publication.push({control:flag+'-early-and-late',refused:true});
 }
 await host.cancelAtPublication(url,view);publication.push({control:'request-abort-after-domain-result',refused:true});
 const socket=host.controls.socket;
 await host.late(url,async()=>{host.controls.socket={};},view).finally(()=>{host.controls.socket=socket;});publication.push({control:'source-socket-replacement',refused:true});
 await host.late(url,async()=>{const r=await current();identity={...identity,generation:'takeover'};lease=await entry.adapter.acquireOwner({expected:{version:r.version,view:r.view,owner:r.owner},nextOwner:identity},guard);},view);
 publication.push({control:'actual-native-owner-takeover',refused:true});
 await host.late(url,async()=>{const r=await current();await entry.adapter.rollbackOwned(lease,{declarationDigest:entry.declaration.digest,revision:r.view.revision,operationId:hex(++serial),from:r.view.checkpoint,ancestor:sources.at(-1).source.previous,maxBlocks:1});},view);
 publication.push({control:'actual-native-fork-rollback',refused:true});
 const rolled=await current();identity={...identity,generation:'post-rollback'};lease=await entry.adapter.acquireOwner({expected:{version:rolled.version,view:rolled.view,owner:rolled.owner},nextOwner:identity},guard);
 await host.publish(entry.declaration,rolled.view);
 const phase='attribute:rollback-delete',fresh=await current();modelByPhase[phase]=selected.declaration.digest;onPhase({name:phase,phase,expected:fresh.view,owner:identity,ownerClaim:fresh.owner.claimDigest,ownerDeclaration:entry.declaration.digest});
 const before=answers.length,response=await host.observe(url,rolled.view);assert.equal(response.statusCode,200);assert.equal(answers.length,before+1);
 const answer=answers.at(-1).answer.result,alias=selected.declaration.model.base.alias;
 const native=custody.seal(phase,{model:selected.declaration.digest,baseAlias:alias,collection:collectionByModel[selected.declaration.digest],expectedRecords:answer.rows.map(row=>row.records[alias])});
 const pgStage=original.reports[0].report.result.stages.find(row=>row.name==='delete');assert(pgStage);
 const expected=pgStage.attributes.rows.map(row=>JSON.parse(row.raw_json));assert.deepEqual(decodeRoyaltyRecords('attributes',native.records),expected);assert.deepEqual(response.json().data,expected);
 const rollback={view:rolled.view,native,expected,managed:{status:response.statusCode,body:response.json(),headers:response.headers}};
 await persist({event:'attribute-publication-controls',publication,rollback});custody.healthy();assert.equal(custody.summary().pending,0);
 return {status:'passed-bounded-six-attribute-driver-event-only',sources,pairs,publication,rollback,modelDigest:selected.declaration.digest,fullParity:false,sourceAuthority:'constructed-only'};
}
