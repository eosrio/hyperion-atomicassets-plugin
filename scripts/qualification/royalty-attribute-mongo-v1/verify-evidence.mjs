// Parent independently reopens the child's durable files and reconstructs native trace facts.
import assert from 'node:assert/strict';
import {readFileSync,lstatSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {EventEmitter} from 'node:events';
import {sha,LIMITS,PROFILE} from './contract.mjs';
import {loadOriginalReports} from './original-files.mjs';
import {pairAttributeCase,attributeCases} from './attribute-oracle.mjs';
import {decodeRoyaltyRecords} from './pair.mjs';
// This fixture deliberately admits only the finite unjoined attribute query shape.
// Its predicates/order/bounds are independently checked against the captured logical request.
export function verifyAttributePipeline(command,query,BSON,alias){
 assert.equal(alias,'rule');assert.equal(query.kind,'page');assert.equal(query.offset,'0');assert.equal(query.limit,100);
 const filters=[{alias},...query.where.map(p=>{assert.equal(p.op,'eq');assert(['market_contract','collection_name','source','field'].includes(p.field));return {['v.'+p.field]:{$eq:p.field==='source'?BSON.Long.fromString(p.value):p.value}};})];
 assert.deepEqual(query.order,[{field:'rule_id',direction:'asc',nulls:'last'}]);
 const expected=[{$match:{$and:filters}},{$sort:{'n.rule_id':1,'v.rule_id':1}},{$skip:BSON.Long.ZERO},{$limit:BSON.Long.fromNumber(100)},
  {$project:{_id:0,base:Object.fromEntries(['_id','model','representation','alias','kind','key','json','v','n','joins'].map(key=>[key,'$'+key])),joined:{$literal:{}}}}];
 assert.equal(sha(BSON.serialize({pipeline:command.pipeline})),sha(BSON.serialize({pipeline:expected})),'Actual native pipeline differs from scoped logical request');
 assert.equal(command.hint,'h45_ix_b_'+sha(JSON.stringify(['market_contract',query.order])).slice(0,20));assert.deepEqual(command.collation,{locale:'simple'});assert.equal(command.allowDiskUse,false);assert.deepEqual(command.cursor,{batchSize:1});assert.equal(command.maxTimeMS,5000);
}
export function verifySealedQuery({native,database,load,BSON,query}){
 assert.equal(native.format,'driver-event-reencoded-bson-v1');assert(native.references.length>0&&native.references.length%2===0);
 const rows=[],pending=new Map();let cursor,trace,total=0;const seen=new Set();
 for(const ref of native.references){assert(!seen.has(ref.path));seen.add(ref.path);assert.equal(ref.phase,native.phase);assert.equal(ref.trace,native.trace);
  const b=load('query-'+ref.path);assert.equal(b.length,ref.length);assert.equal(sha(b),ref.sha256);total+=b.length;const doc=BSON.deserialize(b,{promoteLongs:false});
  if(ref.kind==='started'){assert(!pending.has(ref.requestId));assert(['aggregate','getMore'].includes(ref.command));assert.equal(doc.comment.hyperion,'stateful-indexed-v1');assert.equal(doc.comment.model,native.model);assert.equal(doc.comment.trace,native.trace);trace??=doc.comment.trace;assert.equal(trace,doc.comment.trace);
   assert.equal(ref.command==='aggregate'?doc.aggregate:doc.collection,native.collection);if(ref.command==='aggregate'){assert.equal(cursor,undefined);if(query)verifyAttributePipeline(doc,query,BSON,native.baseAlias);}else assert(cursor!=='0'&&String(doc.getMore)===cursor);pending.set(ref.requestId,{ref,doc});
  }else{assert.equal(ref.kind,'succeeded');const begin=pending.get(ref.requestId);assert(begin&&begin.ref.command===ref.command);pending.delete(ref.requestId);assert.equal(doc.cursor.ns,database+'.'+native.collection);
   const batch=ref.command==='aggregate'?doc.cursor.firstBatch:doc.cursor.nextBatch;assert(Array.isArray(batch));
   for(const row of batch){assert.equal(row.base.alias,native.baseAlias);assert.deepEqual(Object.keys(row.joined??{}),[]);rows.push(JSON.parse(row.base.json));}
   const next=String(doc.cursor.id);if(ref.command==='getMore')assert(next==='0'||next===cursor);cursor=next;
  }
 }
 assert.equal(pending.size,0);assert.equal(cursor,'0');assert.equal(total,native.bytes);assert.deepEqual(rows,native.records);return rows;
}
export function verifyHttpBoundary({start,end,status,total}){
 for(const b of [start,end]){assert.deepEqual(Object.keys(b).sort(),['events','pending']);assert(Number.isSafeInteger(b.events)&&b.events>=0&&b.events<=total);assert.equal(b.pending,0);}assert(end.events>=start.events);
 if(status===400)assert.equal(end.events,start.events,'400 performed physical native activity');else{assert.equal(status,200);assert(end.events>start.events,'Successful case lacks physical native activity');}
}
export async function verifyChildEvidence({output,hapiRoot,admission}){
 const child=JSON.parse(readFileSync(join(output,'child-result.json'))),directory=join(output,'child-evidence');assert.equal(child.status,'passed');assert.deepEqual(child.admission,admission);
 const ledger=child.evidence.ledger;assert(Array.isArray(ledger)&&ledger.length===child.evidence.files&&ledger.length<=LIMITS.evidenceFiles);
 const files=new Map();let total=0;const events=[];
 for(const row of ledger){assert(/^[A-Za-z0-9_.-]+$/.test(row.path)&&!files.has(row.path));const p=join(directory,row.path),s=lstatSync(p);assert(s.isFile()&&!s.isSymbolicLink()&&s.size===row.bytes&&s.size<=LIMITS.fileBytes);
  const b=readFileSync(p);assert.equal(sha(b),row.sha256);files.set(row.path,b);total+=b.length;if(row.path.endsWith('.json'))events.push(JSON.parse(b));}
 assert.equal(total,child.evidence.bytes);assert(total<=LIMITS.evidenceBytes);assert.deepEqual(readdirSync(directory).sort(),[...files.keys()].sort());
 const one=name=>{const rows=events.filter(row=>row.event===name);assert.equal(rows.length,1,name);return rows[0];};
 const report=one('terminal-report').report;assert.equal(report.profile,PROFILE);assert.equal(report.status,'passed-bounded-six-attribute-driver-event-only');assert.deepEqual(report.assembly,admission.assembly);
 for(const name of ['httpClosed','readsClosed','sessionsEnded','databaseDropped','cursorsClosed','evidenceComplete'])assert.equal(report.cleanup[name],true,name);
 const original=loadOriginalReports(join(output,'reports')),cases=attributeCases(original),result=report.result;assert.equal(result.pairs.length,6);assert.equal(result.sources.length,4);assert.equal(result.publication.length,6);
 assert.deepEqual(result.publication.map(row=>row.control),['source-early-and-late','mapping-early-and-late','request-abort-after-domain-result','source-socket-replacement','actual-native-owner-takeover','actual-native-fork-rollback']);assert(result.publication.every(row=>row.refused===true));
 const {BSON}=createRequire(join(hapiRoot,'package.json'))('mongodb'),load=name=>{assert(files.has(name));return files.get(name);};
 const full=one('native-command-trace').capture;assert.equal(full.pending,0);assert.equal(full.counts.failed,0);assert.equal(full.counts.unrecorded,0);assert.equal(full.firstError,null);assert(full.nativeWrites>0);assert.equal(full.counts.started,full.counts.succeeded);
 const commands=new Map(),completed=new Set(),decoded=[];let rawBytes=0;
 for(const ref of full.refs){assert(['started','succeeded'].includes(ref.event));const b=load(ref.path);assert.equal(b.length,ref.length);assert.equal(sha(b),ref.sha256);rawBytes+=b.length;
  const doc=BSON.deserialize(b,{promoteLongs:false});decoded.push({ref,doc});if(ref.event==='started'){assert(!commands.has(ref.requestId));commands.set(ref.requestId,{ref,doc});}else{assert(commands.has(ref.requestId)&&!completed.has(ref.requestId));assert.equal(commands.get(ref.requestId).ref.name,ref.name);completed.add(ref.requestId);}}
 assert.equal(rawBytes,full.rawBytes);assert.equal(full.refs.length,full.counts.started*2);
 assert.equal(completed.size,commands.size);
 for(let i=0;i<original.events.length;i++){const event=original.events[i],actual=result.sources[i];assert.equal(actual.stage,event.stage);assert.deepEqual(actual.originalBlock,event.block);assert.equal(actual.source.block.blockNum,event.block.block_num);assert.equal(actual.source.block.timeMs,String(Date.parse(event.block.timestamp+'Z')));
  const rows=event.rows.filter(row=>row.table==='royaltyattr');assert.equal(actual.source.inputs.length,rows.length);
  for(let j=0;j<rows.length;j++){const input=actual.source.inputs[j],row=rows[j],b=Buffer.from(input.rawHex,'hex');assert.equal(input.name,row.table);assert.equal(input.contract,'atomicmarket');assert.equal(input.order,j);assert.deepEqual(input.data,row.value);assert.equal(input.present,row.present!==false);assert.deepEqual(input.identity,{kind:'contract-row',scope:'oracle',primaryKey:String(row.value.index)});assert.equal(sha(b),input.rawSha256);assert.deepEqual(JSON.parse(b),row.value);}
 }
 const prefix='h45s_'+sha(JSON.stringify(['1'.repeat(64),'royalty-attribute-b55-native-v1'])).slice(0,24),expectedCollection=prefix+'_ix1_'+result.modelDigest+'_r';
 const nativePairs=[];
 for(let i=0;i<cases.length;i++){const pair=result.pairs[i],pg=cases[i];assert.equal(pair.case,pg.name);
  const boundaries=events.filter(row=>row.event==='attribute-http-boundary'&&row.case===pg.name);assert.equal(boundaries.length,2);assert.equal(boundaries[0].kind,'before');assert.equal(boundaries[1].kind,'after');assert.deepEqual(pair.boundary,{start:boundaries[0].boundary,end:boundaries[1].boundary});
  const {start,end}=pair.boundary;verifyHttpBoundary({start,end,status:pg.status,total:full.refs.length});
  if(pg.status===200){assert.equal(pair.native.collection,expectedCollection);assert.equal(pair.native.model,result.modelDigest);verifySealedQuery({native:pair.native,database:'h45_indexed_'+child.fixture.run.slice(0,12),load,BSON,query:pair.query});nativePairs.push({native:pair.native,view:pair.view});for(const ref of pair.native.references){const physical=full.refs.find(row=>row.requestId===ref.requestId&&row.event===ref.kind);assert(physical&&physical.sequence>start.events&&physical.sequence<=end.events);assert.equal(physical.name,ref.command);assert.equal(physical.sha256,ref.sha256);}}
  pairAttributeCase({original,pg,native:pair.native,managed:pair.managed,query:pair.query});
 }
 const rollback=result.rollback;assert.equal(rollback.native.collection,expectedCollection);assert.equal(rollback.native.model,result.modelDigest);
 verifySealedQuery({native:rollback.native,database:'h45_indexed_'+child.fixture.run.slice(0,12),load,BSON,query:result.pairs[0].query});nativePairs.push({native:rollback.native,view:rollback.view});
 for(const ref of rollback.native.references){const physical=full.refs.find(row=>row.requestId===ref.requestId&&row.event===ref.kind);assert(physical);assert.equal(physical.name,ref.command);assert.equal(physical.sha256,ref.sha256);}
 const expected=original.reports[0].report.result.stages.find(row=>row.name==='delete').attributes.rows.map(row=>JSON.parse(row.raw_json));assert.deepEqual(decodeRoyaltyRecords('attributes',rollback.native.records),expected);assert.deepEqual(rollback.managed.body.data,expected);
 // Rebuild the existing audited trace observer from physical captured BSON, rather than trust JSON trace claims.
 const {monitorIndexed,verifyIndexedTrace,verifyCursorClosure}=await import(pathToFileURL(join(hapiRoot,'scripts/qualification/indexed-schema-mongodb/cbfb-native-trace.mjs')));
 const tx=doc=>doc.lsid&&doc.txnNumber!==undefined?BSON.serialize({lsid:doc.lsid,txn:doc.txnNumber}).toString('hex'):null,contexts=new Map(),namespaces=new Map();
 for(const {native,view}of nativePairs){const ref=native.references.find(row=>row.kind==='started'&&row.command==='aggregate'),actual=commands.get(ref.requestId);assert(actual);assert.equal(sha(load(actual.ref.path)),sha(load('query-'+ref.path)));
  const key=tx(actual.doc);assert(key&&!contexts.has(key));const meta=decoded.find(row=>row.ref.event==='started'&&tx(row.doc)===key&&typeof row.doc.find==='string'&&row.doc.find.endsWith('_stateful_v2_metadata'));assert(meta);
  const reply=decoded.find(row=>row.ref.event==='succeeded'&&row.ref.requestId===meta.ref.requestId);assert(reply?.doc.cursor.firstBatch.length===1);const owner=reply.doc.cursor.firstBatch[0].owner;
  assert.deepEqual(owner.identity,{id:'controlled-royalty-attribute-native',generation:native.phase==='attribute:rollback-delete'?'post-rollback':'royaltyattr'});
  contexts.set(key,{name:native.phase,expected:view,owner:owner.identity,ownerClaim:owner.claimDigest,ownerDeclaration:view.declarationDigest});namespaces.set(native.collection,native.model);
 }
 const client=new EventEmitter(),trace=[];let phase={name:'outside-positive-case'};const detach=monitorIndexed(client,'h45_indexed_'+child.fixture.run.slice(0,12),'independent-parent',()=>phase,trace,namespaces);
 for(const {ref,doc}of decoded){if(ref.event==='started'){phase=contexts.get(tx(doc))??{name:'outside-positive-case'};client.emit('commandStarted',{databaseName:doc.$db,requestId:ref.requestId,commandName:ref.name,command:doc});}else client.emit('commandSucceeded',{requestId:ref.requestId,commandName:ref.name,reply:doc});}
 detach();for(const {native}of nativePairs)verifyIndexedTrace(trace,native.phase,{maximum:64,success:true});const cursors=verifyCursorClosure(trace);
 return {status:'passed-parent-reopened-bson-original-pairing',files:files.size,bytes:total,nativeBSONReferences:full.refs.length,nativeBSONBytes:rawBytes,cases:6,constructedSourceStages:4,publicationControls:6,cursors,fullParity:false};
}
