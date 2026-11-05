// Owned Linux child workload. All source/SDK/report admission precedes client effects.
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PROFILE,ACCEPTANCE,assertRunInput,sha} from './contract.mjs';
import {verifyAssembly} from './assembly.mjs';
import {loadOriginalReports} from './original-files.mjs';
import {loadHostSdk} from './host-sdk.mjs';
import {createAttributeHost} from './host.mjs';
import {runAttributeNativePair} from './driver.mjs';
import {createRoyaltyCustody,attachRoyaltyCustody} from './custody.mjs';
import {createBsonRecorder} from '../jsonb-display-bson-v3/bson-recorder.mjs';
import {cleanupOwnedDatabase} from '../jsonb-display-bson-v3/cleanup.mjs';
const bounds={value:{depth:32,nodes:8192,fields:64,arrayElements:256,stringBytes:4096,recordBytes:131072,integerFields:16,pathSegments:16},
 envelope:{depth:48,nodes:65536,fields:64,arrayElements:1024,stringBytes:1048576,recordBytes:2097152,integerFields:16,pathSegments:16},
 selectors:128,recordKinds:21,inputOccurrences:128,inputBytes:1048576,keyBytes:256,readKeys:16,readAttempts:64,mutations:128,candidateBytes:2097152,responseRecords:16,responseBytes:65536};
export async function runAttributeQualification(options){
 assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.equal(process.versions.bun,undefined);assert([24,26].includes(Number(process.versions.node.split('.')[0])));
 assertRunInput(options);const {hapiRoot,client,databaseName,persist,persistBinary,guard:physicalGuard}=options;
 let recorder,custody;const guard=()=>{physicalGuard();recorder?.assertHealthy();custody?.healthy();};guard();
 const assembly=await verifyAssembly(hapiRoot,options.reviewedHarness),original=loadOriginalReports(options.originalReportRoot);guard();
 const {owner,captureSource,receipt:hostSdk}=await loadHostSdk(hapiRoot,assembly);
 const [{default:AtomicPlugin},engineering,{monitorIndexed,verifyIndexedTrace,verifyCursorClosure}]=await Promise.all([import('../../../dist/index.js'),import(pathToFileURL(join(hapiRoot,'packages/backend-mongodb/dist/stateful-indexed-linear-history-engineering-v1.js'))),import(pathToFileURL(join(hapiRoot,'scripts/qualification/indexed-schema-mongodb/cbfb-native-trace.mjs')))]);
 const {BSON}=createRequire(join(hapiRoot,'package.json'))('mongodb');
 for(const field of ['retryReads','retryWrites'])assert.equal(client.options[field],false);
 assert.equal(client.options.maxAdaptiveRetries,0);assert.equal(client.options.monitorCommands,true);assert.equal(client.options.promoteLongs,false);
 const hello=await client.db('admin').command({hello:1}),build=await client.db('admin').command({buildInfo:1});guard();assert.equal(build.version,'8.0.34');assert(hello.isWritablePrimary&&typeof hello.setName==='string');
 assert(!(await client.db('admin').admin().listDatabases()).databases.some(row=>row.name===databaseName),'Fresh exclusively owned DB required');
 const marker=randomBytes(24).toString('hex'),database=client.db(databaseName),hosts=[],sessions=[],answers=[],modelByPhase={},collectionByModel={},binary=new Map(),trace=[],namespaces=new Map();let phase={name:'startup',phase:'startup'};
 const report={schemaVersion:1,profile:PROFILE,status:'running',acceptance:structuredClone(ACCEPTANCE),assembly,hostSdk,
  originalCapture:{reports:original.reports.map(({file,sha256})=>({file,sha256})),workflowRun:'42014752481',reference:'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e'},
  server:{version:build.version,replicaSet:hello.setName},cleanup:{httpClosed:false,readsClosed:false,sessionsEnded:false,databaseDropped:false,client:'caller-owned'}};
 let primary,owned=false,detach,detachTrace;const retain=error=>{primary??=error;},startSession=client.startSession;
 client.startSession=function(...args){const session=startSession.apply(this,args),row={ended:false},end=session.endSession;sessions.push(row);session.endSession=async function(...values){try{return await end.apply(this,values);}finally{row.ended=this.hasEnded;}};return session;};
 recorder=createBsonRecorder({databaseName,serialize:value=>BSON.serialize(value),persistBinary});
 const command=recorder.commandStarted,succeeded=recorder.commandSucceeded,failed=recorder.commandFailed;
 client.on('commandStarted',command);client.on('commandSucceeded',succeeded);client.on('commandFailed',failed);
 custody=createRoyaltyCustody({database:databaseName,modelByPhase,current:()=>phase,serialize:value=>BSON.serialize(value),deserialize:b=>BSON.deserialize(b,{promoteLongs:false}),
  persist:(name,bytes)=>{assert(!binary.has(name));const ref=persistBinary('query-'+name,bytes);assert.deepEqual(ref,{path:'query-'+name,length:bytes.length,sha256:sha(bytes)});binary.set(name,Buffer.from(bytes));return {path:name,length:bytes.length,sha256:sha(bytes)};},load:name=>binary.get(name)});
 detach=attachRoyaltyCustody(client,custody);
 detachTrace=monitorIndexed(client,databaseName,'attribute-managed-native',()=>phase,trace,namespaces);
 try{
  await persist({event:'attribute-source-admission',assembly,hostSdk});for(const row of original.reports)await persist({event:'attribute-original-pg-report-by-value',...row});
  await database.collection('_qualification_owner').insertOne({_id:marker,profile:PROFILE},{writeConcern:{w:'majority',j:true}});owned=true;
  const generation='royalty-attribute-b55-native-v1',host=await createAttributeHost({hapiRoot,atomic:{default:AtomicPlugin},client,databaseName,generation,bounds,persist,guard,
   selectEngineering:adapter=>engineering.selectMongoDbLinearHistoryEngineeringAssemblyV1(adapter,engineering.MONGODB_LINEAR_HISTORY_ENGINEERING_PROFILE_V1),
   onQueryResult:row=>{assert(answers.length<128);answers.push(row);}});hosts.push(host);
  const prefix='h45s_'+createHash('sha256').update(JSON.stringify(['1'.repeat(64),generation])).digest('hex').slice(0,24);
  for(const entry of host.registry.entries.values())for(const {declaration}of entry.indexed?.models.values()??[]){collectionByModel[declaration.digest]=prefix+'_ix1_'+declaration.digest+'_r';namespaces.set(collectionByModel[declaration.digest],declaration.digest);}
  report.result=await runAttributeNativePair({host,owner,captureSource,original,answers,custody,modelByPhase,collectionByModel,onPhase:value=>{phase=value;},readNativeBoundary:()=>{const s=recorder.summary();return {events:s.counts.started+s.counts.succeeded+s.counts.failed,pending:s.pending};},persist,guard});
  assert.equal(report.result.pairs.length,6);assert.equal(report.result.sources.length,4);assert.equal(report.result.publication.length,6);
  for(const name of Object.keys(modelByPhase))verifyIndexedTrace(trace,name,{maximum:64,success:true});assert.equal(Object.keys(modelByPhase).length,6);
  recorder.assertComplete();custody.healthy();assert.equal(custody.summary().pending,0);report.acceptance.physicalMongoHTTP='passed-bounded-six-attribute-driver-event-only';report.status=report.result.status;
 }catch(error){retain(error);report.status='failed';report.failure={name:error.name,message:String(error.message).slice(0,4096)};}
 finally{
  try{await cleanupOwnedDatabase({hosts,sessions,owned,database,marker,profile:PROFILE,physicalGuard,persist,report,retain,captureSummary:()=>{report.nativeCursors=verifyCursorClosure(trace);report.cleanup.cursorsClosed=true;return recorder.summary();}});}catch(error){retain(error);}
  try{recorder.assertComplete();custody.healthy();assert.equal(custody.summary().pending,0);}catch(error){retain(error);}
  const capture=recorder.receipt();report.nativeCapture=recorder.summary();report.queryCapture=custody.summary();report.answers=answers;
  try{await persist({event:'native-command-trace',format:'binary-bson-references-v1',capture});await persist({event:'attribute-indexed-trace',trace});}catch(error){retain(error);}
  try{detach();detachTrace();client.off('commandStarted',command);client.off('commandSucceeded',succeeded);client.off('commandFailed',failed);client.startSession=startSession;}catch(error){retain(error);}
  if(primary){report.status='failed';report.acceptance.physicalMongoHTTP='failed';report.failure??={name:primary.name,message:String(primary.message).slice(0,4096)};}
  try{await persist({event:'terminal-report',report});}catch(error){retain(error);}
 }
 if(primary)throw primary;return report;
}
