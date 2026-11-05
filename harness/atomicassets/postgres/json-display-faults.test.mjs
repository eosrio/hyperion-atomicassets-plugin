// Actual source functions with inert ports only: no upstream imports, DB, HTTP,
// timers, processes or engine outcomes. AA_JSON39_SUT_ROOT selects frozen RED code.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root=process.env.AA_JSON39_SUT_ROOT;
const require=createRequire(root?pathToFileURL(root+'/package.json'):new URL('../../../package.json',import.meta.url));
const {capture,SQL}=require('./harness/atomicassets/postgres/json-display-oracle.cjs');
const scenario=require('./harness/atomicassets/postgres/scenario.cjs');
const {lifecycle}=await import(root?pathToFileURL(root+'/harness/atomicassets/postgres/json-display-lifecycle.mjs'):new URL('./json-display-lifecycle.mjs',import.meta.url));
async function rejection(fn){try{await fn();return {rejected:false};}catch(value){return {rejected:true,value};}}
const values=[new Error('primary'),undefined,null,0,false,''];
function captureModel(primary,{restore=false,completion=false,workFailure=true}={}){
  let stored='BASELINE MODEL';const rows=[];
  const client={async query(sql,b){if(sql===SQL.before)return {rows:[{data_text:stored}],rowCount:1};
    if(sql===SQL.write){if(b[2]==='BASELINE MODEL'&&restore)throw Error('restore secondary');stored=b[2];return {rows:[{data_text:stored}],rowCount:1};}
    return {rows:[{raw_json:'MODEL'}],rowCount:1};}};
  return {rows,stored:()=>stored,args:{client,encode:JSON.stringify,contract:'atomicassets',collection:'model',assetId:'1',
    http:async()=>{if(workFailure)throw primary;return {model:true};},record:e=>{rows.push(e);if(e.kind==='json39-case-complete'&&completion)throw Error('completion secondary');}}};
}
for(const [i,primary]of values.entries())test('capture preserves primary identity '+i+' across restore and completion faults',async()=>{
  const m=captureModel(primary,{restore:true,completion:true}),r=await rejection(()=>capture(m.args));assert.equal(r.rejected,true);assert.equal(r.value,primary);
  const row=m.rows.at(-1).row;assert.equal(row.restore.attempted,true);assert.equal(row.restore.succeeded,false);assert.equal(row.completionRecordError.message,'completion secondary');
});
test('completion-only failure refuses work after successful restoration',async()=>{
  const m=captureModel(undefined,{workFailure:false,completion:true}),r=await rejection(()=>capture(m.args));assert.equal(r.rejected,true);assert.equal(r.value.message,'completion secondary');assert.equal(m.stored(),'BASELINE MODEL');
});
for(const [i,primary]of values.entries())test('outer lifecycle preserves primary identity '+i+' after all closes and final persist fail',async()=>{
  const report={},seen=[],r=await rejection(()=>lifecycle(report,{work:async()=>{throw primary;},closers:[['one',async()=>{seen.push('one');throw Error('close secondary');}],['two',async()=>{seen.push('two');}]],persist:async()=>{seen.push('persist');throw Error('persist secondary');}}));
  assert.equal(r.rejected,true);assert.equal(r.value,primary);assert.deepEqual(seen,['one','two','persist']);assert.equal(report.persistenceError.message,'persist secondary');assert.equal(report.cleanup[0].error.message,'close secondary');
});
test('persist-only and falsy close-first failures refuse success with their actual identity',async()=>{
  const persist=new Error('persist only'),a=await rejection(()=>lifecycle({}, {work:async()=>1,closers:[],persist:async()=>{throw persist;}}));assert.equal(a.value,persist);
  const b=await rejection(()=>lifecycle({}, {work:async()=>1,closers:[['close',async()=>{throw 0;}]],persist:async()=>{throw persist;}}));assert.equal(b.rejected,true);assert.equal(b.value,0);
});
function scenarioModel(options={}){
  const sentinel=Object.hasOwn(options,'value')?options.value:new Error('inert setup stop');
  const counts={client:0,clientClose:0,bootstrap:0,bootstrapRelease:0,listeners:0,listenerCloses:0,server:0,httpConnections:0,httpSocket:0,serverDatabase:0},events=[];
  let active=0;
  const hit=name=>{if(options.fault===name)throw sentinel;if(Object.hasOwn(options.secondaryFaults??{},name))throw options.secondaryFaults[name];};
  const close=name=>{if(Object.hasOwn(options.closeValues??{},name))throw options.closeValues[name];if(options.closeFaults?.includes(name))throw Error(name+' close secondary');};
  class Client{constructor(){hit('scenario-client');counts.client++;}async query(){return {rows:[],rowCount:0};}async connect(){hit('client-connect');}async end(){counts.clientClose++;close('client');}}
  class Core{constructor(){hit('core');}async init(){hit('bootstrap-init');}}
  class Processor{constructor(){hit('processor');}onContractRow(){}onActionTrace(){}onPriorityComplete(){}getActiveListeners(){return {trace_listeners:Array(active).fill(1),table_listeners:[]};}}
  class Server{constructor(){hit('server');counts.server++;this.connection={};this.web={express:{use(){hit('http-mount');}}};
    this.httpServer={closeAllConnections(){counts.httpConnections++;close('http-connections');},listen(){hit('http-listen');throw sentinel;}};
    this.socket={io:{close(fn){counts.httpSocket++;close('http-socket');fn();}}};this.database={async end(){counts.serverDatabase++;close('server-database');}};}}
  class Namespace{constructor(){hit('namespace');}async init(){hit('namespace-init');}async router(){hit('namespace-router');return {};}}
  let index=0;const processor=()=>{const i=index++;hit('listener-'+i);counts.listeners++;active++;return()=>{counts.listenerCloses++;close('listener-'+i);active--;};};
  const from=path=>{
    if(path==='@atomichub/atomicassets')return {};
    if(path.endsWith('/filler/utils.ts'))return {encodeDatabaseJson:JSON.stringify};
    if(path.endsWith('/filler/processor.ts'))return {default:Processor,ProcessingState:{HEAD:'head'}};
    if(path.endsWith('/handlers/atomicassets/index.ts'))return {default:Core};
    if(path.endsWith('/test-helper.ts'))return {createMockModuleLoader:()=>({})};
    if(path.endsWith('/api/server.ts'))return {HTTPServer:Server};
    if(path.endsWith('/namespaces/atomicassets/index.ts'))return {AtomicAssetsNamespace:Namespace};
    if(path.endsWith('/atomicassets/format.ts'))return {formatAsset:v=>v};
    if(path==='pg')return {Client};
    for(const [file,name]of [['config','configProcessor'],['collections','collectionProcessor'],['schemas','schemaProcessor'],['assets','assetProcessor']])if(path.endsWith('/processors/'+file+'.ts'))return {[name]:processor};
    throw Error('Unexpected original dependency '+path);
  };
  const db={async begin(){hit('bootstrap');counts.bootstrap++;return {async query(sql){hit(sql==='COMMIT'?'bootstrap-commit':'bootstrap-rollback');},release(){counts.bootstrapRelease++;close('bootstrap');}};}};
  const record=e=>{events.push(e);if(e.kind==='json39-original-cleanup'&&options.recordFault)throw Error('record secondary');};
  return {sentinel,counts,events,run:()=>scenario(from,db,{},record,undefined,undefined,options.defaultLane?undefined:{mode:'json39'})};
}
const acquisitions=['scenario-client','core','bootstrap','bootstrap-init','bootstrap-commit','processor','listener-0','listener-1','listener-2','listener-3','server','namespace','client-connect','namespace-init','namespace-router','http-mount','http-listen'];
for(const fault of acquisitions)test('actual scenario cleans every returned handle after '+fault+' fails',async()=>{
  const m=scenarioModel({fault}),r=await rejection(m.run);assert.equal(r.rejected,true);assert.equal(r.value,m.sentinel);
  assert.equal(m.counts.clientClose,m.counts.client);assert.equal(m.counts.listenerCloses,m.counts.listeners);
  assert.equal(m.counts.httpConnections,m.counts.server);assert.equal(m.counts.httpSocket,m.counts.server);assert.equal(m.counts.serverDatabase,m.counts.server);
  assert.equal(m.counts.bootstrapRelease,m.counts.bootstrap);
  const event=m.events.find(e=>e.kind==='json39-original-cleanup');assert.ok(event);assert.ok(event.cleanup.every(c=>c.attempted));
  if(['scenario-client','core','processor','listener-0','listener-1','listener-2','listener-3','server','namespace','bootstrap'].includes(fault)){
    const a=event.acquisitions.find(r=>r.name===fault);assert.equal(a.returned,false);assert.equal(a.unreturnedEffectsUnknown,true);
  }
});
for(const [i,value]of values.entries())test('actual namespace failure '+i+' survives every close and cleanup-record failure',async()=>{
  const m=scenarioModel({fault:'namespace',value,closeFaults:['listener-0','listener-1','listener-2','listener-3','http-connections','http-socket','server-database','client'],recordFault:true}),r=await rejection(m.run);
  assert.equal(r.rejected,true);assert.equal(r.value,value);assert.equal(m.counts.listenerCloses,4);assert.equal(m.counts.httpConnections,1);assert.equal(m.counts.httpSocket,1);assert.equal(m.counts.serverDatabase,1);assert.equal(m.counts.clientClose,1);
  const e=m.events.at(-1);assert.equal(e.cleanup.length,7);assert.ok(e.cleanup.every(c=>c.succeeded===false));assert.equal(e.cleanup.find(c=>c.name==='http').steps.length,2);assert.equal(e.recordError.message,'record secondary');
});
test('actual bootstrap init keeps falsy first error through rollback/release/client-close failures',async()=>{
  const m=scenarioModel({fault:'bootstrap-init',value:0,secondaryFaults:{'bootstrap-rollback':false},closeValues:{bootstrap:undefined,client:null}}),r=await rejection(m.run);
  assert.equal(r.rejected,true);assert.equal(r.value,0);assert.equal(m.counts.bootstrapRelease,1);assert.equal(m.counts.clientClose,1);
  const e=m.events.at(-1);assert.equal(e.setupCleanup.releaseSucceeded,false);assert.deepEqual(e.setupCleanup.secondary.map(x=>x.message),['false','undefined']);assert.equal(e.cleanup[0].succeeded,false);
});
test('actual bootstrap release-only falsy failure refuses setup success',async()=>{
  const m=scenarioModel({closeValues:{bootstrap:false}}),r=await rejection(m.run);assert.equal(r.rejected,true);assert.equal(r.value,false);assert.equal(m.counts.clientClose,1);
});
test('default non-json39 lane retains its acquisition and legacy cleanup behavior',async()=>{
  const m=scenarioModel({defaultLane:true}),r=await rejection(m.run);assert.equal(r.value,m.sentinel);
  assert.equal(m.counts.listenerCloses,4);assert.equal(m.counts.httpConnections,1);assert.equal(m.counts.httpSocket,1);assert.equal(m.counts.serverDatabase,1);assert.equal(m.counts.clientClose,1);
  assert.equal(m.events.some(e=>e.kind==='json39-original-cleanup'),false);
});
function actualOwnershipWrapper(work){
  const text=readFileSync(require.resolve('./harness/atomicassets/postgres/scenario.cjs'),'utf8'),start=text.indexOf('module.exports = async function(...args)');
  assert.ok(start>=0,'Expected the corrected actual ownership wrapper');const end=text.indexOf('\nmodule.exports.codecProbeCases',start);
  const context=vm.createContext({module:{exports:null},scenario:work,assert});vm.runInContext(text.slice(start,end),context);
  const captureMode=vm.runInContext('({mode:"json39"})',context);
  return (...args)=>{args[6]=captureMode;return context.module.exports(...args);};
}
test('actual ownership finalizer refuses close-only and cleanup-record-only faults after successful work',async()=>{
  const seen=[],closeOnly=actualOwnershipWrapper(async(...args)=>{const owned=args[7];owned.own('one',async()=>{seen.push('one');throw false;},0);owned.own('two',async()=>{seen.push('two');throw null;},1);return 'MODEL SUCCESS';});
  const r=await rejection(()=>closeOnly(null,null,null,()=>{seen.push('record');throw undefined;},undefined,undefined,{mode:'json39'}));
  assert.equal(r.rejected,true);assert.equal(r.value,false);assert.deepEqual(seen,['one','two','record']);
  const primary=new Error('record only'),recordOnly=actualOwnershipWrapper(async()=>1);
  const s=await rejection(()=>recordOnly(null,null,null,()=>{throw primary;},undefined,undefined,{mode:'json39'}));assert.equal(s.rejected,true);assert.equal(s.value,primary);
});
