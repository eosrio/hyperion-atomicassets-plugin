import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{steps,cases}=require('./royalty-rule-plan.cjs'),{check}=require('./royalty-rule-gate.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
const fs=require('node:fs'),path=require('node:path');const names=['royalty-rule-ci.mjs','royalty-rule-README.md','royalty-rule-extra-pins.json','royalty-rule-plan.cjs','royalty-rule-scenario.cjs','royalty-rule-gate.cjs','royalty-rule-source.test.mjs','source.mjs','schema.cjs','schema-list-ci-admission.mjs','image-identity.mjs','json-display-lifecycle.mjs','../../../.github/workflows/royalty-rule-pg-oracle-v1.yml','../../../tests/fixtures/royalty-rule-original-2.7/manifest.json'];
function model(){const stage=(name,i)=>({name,...Object.fromEntries(['templates','attributes'].map(k=>{const ids=k==='templates'?Array.from({length:12},(_,n)=>String(n)):['1','2'];return [k,{sql:'SELECT atomicmarket_royalties_'+k,bindings:['atomicmarket','oracle'],rows:ids.filter(id=>!(i===2&&id==='1')).map(id=>({raw_json:JSON.stringify({key_text:id,created_text:i===3&&id==='1'?'4':'1',updated_text:i===1&&id==='1'?'2':'1',...(k==='attributes'?{weight_text:id==='1'?'9223372036854775807':'-9223372036854775808',source:0,lookup_hex:'ab'.repeat(32)}:{})})}))}];}))});
 const responses=cases.map(p=>{const rawText=p.method==='HEAD'?'':JSON.stringify({success:!p.name.endsWith('invalid')});return {...p,status:p.name.endsWith('invalid')?400:200,rawText,bytes:Buffer.byteLength(rawText),sha256:hash(rawText)};});
 const dir=path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1')),manifest=JSON.parse(fs.readFileSync(path.join(dir,'../../../tests/fixtures/royalty-rule-original-2.7/manifest.json')));return {harness:names.map(p=>{const b=fs.readFileSync(path.join(dir,p));return {path:p,bytes:b.length,sha256:hash(b)};}),royaltySources:Object.values(manifest.sources).map(x=>({path:x.path,bytes:x.bytes,sha256:x.sha256})),namespaceSources:JSON.parse(fs.readFileSync(path.join(dir,'royalty-rule-extra-pins.json'))).sources,status:'passed',qualified:false,plugin:{head:process.env.AA_EXPECTED_HEAD??'a'.repeat(40),tree:'b'.repeat(40),trackedStatus:''},runtime:{node:'v24.22.1',sha256:'0'.repeat(64)},fixture:{containerId:'0'.repeat(64)},admission:{version:'16.15'},reference:{commit:'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e'},cleanup:[{name:'originalConnection',attempted:true,succeeded:true}],result:{kind:'original-royalty-rule-pg-capture',stages:steps.map((x,i)=>stage(x.name,i)),responses,callbackQueries:steps.flatMap(s=>['templates','attributes'].map(k=>({stage:s.name,sql:'atomicmarket_royalties_'+k,bindings:[]}))),handlerQueries:cases.filter(x=>!x.name.endsWith('invalid')).map(x=>({case:x.name,sql:'SELECT * FROM atomicmarket_royalties_dummy',bindings:[]})),cleanup:['listeners','http','server-database','scenario-client'].map(name=>({name,attempted:true,succeeded:true}))}};}
test('bounded controller plans both original royalty routes and lifecycle steps',()=>{assert.deepEqual(steps.map(x=>x.name),['insert','update','delete','recreate']);assert.deepEqual(new Set(cases.map(x=>x.route)),new Set(['attributes','templates']));assert(cases.some(x=>x.query?.source==='0'));assert(cases.some(x=>x.name==='template-eleven'));});
test('structural gate refuses missing lifecycle, broken original SQL, HTTP corruption and cleanup failure',()=>{assert.equal(check(model()).captureComplete,true);for(const mutate of [r=>r.result.stages.pop(),r=>r.result.responses[0].rawText='tampered',r=>r.result.cleanup[0].succeeded=false,r=>r.result.handlerQueries[0].error={code:'57014'},r=>r.result.handlerQueries=[],r=>r.deadlineExceeded=true]){const r=model();mutate(r);assert.throws(()=>check(r));}});

test('actual scenario attempts client cleanup on connection failure and preserves original error',async()=>{
 const scenario=require('./royalty-rule-scenario.cjs'),first=new Error('injected connect failure'),calls=[],events=[];
 class Client{query(){}async connect(){throw first;}async end(){calls.push('client-close');}}
 const mapping={'./src/filler/processor.ts':{default:class{},ProcessingState:{HEAD:1}},'./src/filler/handlers/test-helper.ts':{},'./src/filler/handlers/atomicmarket/processors/royalties.ts':{},'./src/api/server.ts':{},'./src/api/namespaces/atomicmarket/index.ts':{},'pg':{Client}};
 await assert.rejects(scenario(path=>mapping[path],{}, {},event=>events.push(event)),error=>error===first);
 assert.deepEqual(calls,['client-close']);assert.deepEqual(events.at(-1).cleanup,[{name:'scenario-client',attempted:true,succeeded:true}]);
});
test('actual scenario preserves server acquisition failure while closing returned resources',async()=>{
 const scenario=require('./royalty-rule-scenario.cjs'),first=new Error('injected HTTP acquisition failure'),calls=[],events=[];
 class Client{query(){}async connect(){}async end(){calls.push('client-close');}}class Processor{getActiveListeners(){return {table_listeners:[],trace_listeners:[]};}}class Server{constructor(){throw first;}}
 const mapping={'./src/filler/processor.ts':{default:Processor,ProcessingState:{HEAD:1}},'./src/filler/handlers/test-helper.ts':{createMockModuleLoader:()=>({})},'./src/filler/handlers/atomicmarket/processors/royalties.ts':{royaltyProcessor:()=>()=>calls.push('release')},'./src/api/server.ts':{HTTPServer:Server},'./src/api/namespaces/atomicmarket/index.ts':{},'pg':{Client}};
 await assert.rejects(scenario(path=>mapping[path],{}, {},event=>events.push(event)),error=>error===first);assert.deepEqual(calls,['release','client-close']);assert(events.at(-1).cleanup.every(x=>x.succeeded));
});







\n