// Pure controller models. These inputs/rows are NOT PostgreSQL/HTTP evidence.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {lifecycle} from './json-display-lifecycle.mjs';
const require=createRequire(import.meta.url),{cases,SQL,capture}=require('./json-display-oracle.cjs');
test('exact21 source inputs remain independent;63 named field rotations retain negative-zero markers',()=>{
  const a=cases(),b=cases();assert.equal(a.length,63);assert.equal(new Set(a.map(r=>r.name)).size,21);
  for(let i=0;i<a.length;i+=3)assert.equal(a[i].rotation,0);
  assert.equal(a.find(r=>r.name==='zero'&&r.rotation===0).negativeZeroPaths[0][0],'img');
  assert.equal(a.find(r=>r.name==='zero'&&r.rotation===1).negativeZeroPaths[0][0],'images');
  a[0].input.name='changed';assert.equal(b[0].input.name,'plain');
});
function model({httpFailure=false,restoreFailure=false,writeReject=false}={}) {
  const calls=[],events=[],baseline='MODEL BASELINE NOT SQL';let stored=baseline;
  const client={async query(sql,bindings){calls.push({sql,bindings});
    if(sql===SQL.before)return {rows:[{data_text:stored}],rowCount:1};
    if(sql===SQL.write){if(bindings[2]===baseline&&restoreFailure)throw Error('model restore failure');
      if(bindings[2]!==baseline&&writeReject)throw Object.assign(Error('model rejected write'),{code:'MODEL'});
      stored=bindings[2];return {rows:[{data_text:stored}],rowCount:1};}
    if(sql===SQL.jsonb&&writeReject)throw Object.assign(Error('model rejected JSONB'),{code:'MODEL'});
    if([SQL.collection,SQL.asset].includes(sql))return {rows:[{raw_json:'{"model":"not an oracle"}'}],rowCount:1};
    assert.ok([SQL.json,SQL.jsonb,SQL.scalar,SQL.array].includes(sql));return {rows:[{model:'not SQL'}],rowCount:1};
  }};
  const http=async path=>{if(httpFailure)throw Error('model HTTP first error');const rawText='MODEL NOT HTTP',sha256=require('node:crypto').createHash('sha256').update(rawText).digest('hex');return {status:200,bytes:Buffer.byteLength(rawText),sha256,rawText,path};};
  return {calls,events,baseline,stored:()=>stored,args:{client,encode:v=>JSON.stringify(v),contract:'atomicassets',collection:'model',assetId:'9007199254740993',http,record:e=>events.push(structuredClone(e))}};
}
test('actual capture controller commits before view/HTTP calls and restores each of63 inputs',async()=>{
  const m=model(),r=await capture(m.args);assert.equal(r.cases.length,63);assert.equal(m.stored(),m.baseline);
  assert.ok(r.cases.every(c=>c.restore.succeeded&&c.http.asset));assert.equal(m.events.length,129);assert.equal(r.numericLiterals.length,3);
  const write=m.calls.findIndex(c=>c.sql===SQL.write);assert.ok(m.calls.findIndex(c=>c.sql===SQL.asset)>write);
});
test('actual controller preserves first HTTP failure while attempting failed restore and retaining partial case',async()=>{
  const m=model({httpFailure:true,restoreFailure:true});await assert.rejects(capture(m.args),/model HTTP first error/);
  const row=m.events.at(-1).row;assert.equal(row.failure.message,'model HTTP first error');assert.equal(row.restore.error.message,'model restore failure');assert.equal(row.restore.succeeded,false);
});
test('actual rejected-write branch retains baseline and does not manufacture HTTP/view results',async()=>{
  const m=model({writeReject:true}),r=await capture(m.args);assert.equal(r.cases.length,63);
  assert.ok(r.cases.every(c=>!c.storage.accepted&&c.rejectedWriteLeftBaseline&&c.http===undefined));
  assert.equal(m.calls.some(c=>c.sql===SQL.asset||c.sql===SQL.collection),false);assert.equal(m.stored(),m.baseline);
});
test('outer lifecycle attempts every closer and preserves the original failure',async()=>{
  const seen=[],r={};await lifecycle(r,{work:async()=>{throw Object.assign(Error('primary'),{code:'SOURCE'});},
    closers:[['one',async()=>{seen.push('one');throw Error('cleanup');}],['two',async()=>{seen.push('two');}]],persist:async()=>{seen.push('persist');}});
  assert.deepEqual(seen,['one','two','persist']);assert.equal(r.error.message,'primary');assert.equal(r.status,'failed');assert.equal(r.cleanup[0].error.message,'cleanup');assert.equal(r.cleanup[1].succeeded,true);
});
test('cleanup-only failure refuses successful work',async()=>{
  const r={};await lifecycle(r,{work:async()=>({model:true}),closers:[['one',async()=>{throw Error('cleanup');}]],persist:async()=>{}});
  assert.equal(r.status,'failed');assert.equal(r.error.message,'cleanup');
});
test('persisted gate refuses missing, failed and timed-out reports without source/database imports',()=>{
  const {check}=require('./json-display-gate.cjs');for(const r of [{},{status:'failed'},{status:'passed',qualified:false,deadlineExceeded:true}])assert.throws(()=>check(r));
});
test('complete structural gate model accepts only all cases, source pins, hashes and successful cleanup',async()=>{
  const {check}=require('./json-display-gate.cjs'),profile=require('../lifecycle-input.cjs').loadInputProfile().descriptor;
  const hash=b=>require('node:crypto').createHash('sha256').update(b).digest('hex');
  const names=['json-display-ci.mjs','json-display-oracle.cjs','json-display-lifecycle.mjs','json-display-gate.cjs','scenario.cjs','query-observer.cjs','schema.cjs','source.mjs','schema-list-ci-admission.mjs','image-identity.mjs','fixture-pin.json','postgres-16.15-linux-amd64.manifest.json','postgres-16.15-linux-amd64.config.json','../json-vectors.cjs','../lifecycle-input.cjs'];
  const inventory=JSON.parse(readFileSync(new URL('../../../docs/parity/atomicassets/postgres-oracle-sources.json',import.meta.url))).originalSources;
  const m=model(),display=await capture(m.args);
  const report={status:'passed',qualified:false,completedAt:'MODEL NOT EXECUTION',inputProfile:profile,
    runtime:{version:'v24.0.0',executableSha256:'0'.repeat(64)},plugin:{head:process.env.GITHUB_SHA??'a'.repeat(40),tree:'b'.repeat(40),trackedStatus:''},fixture:{containerId:'0'.repeat(64)},
    reference:{commit:'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e',sources:inventory.map(r=>({path:r.path,gitSha256:r.sha256,workingSha256:r.sha256,workingBytes:r.bytes}))},
    admission:{version:'16.15',emptyObjects:true},cleanup:[{name:'originalConnection',attempted:true,succeeded:true}],
    harness:names.map(path=>{const b=readFileSync(new URL('./'+path,import.meta.url));return {path,bytes:b.length,sha256:hash(b)};}),
    events:[{kind:'json39-original-cleanup',cleanup:Array.from({length:7},()=>({attempted:true,succeeded:true}))}],result:{inputProfile:profile,display}};
  assert.equal(check(report).captureComplete,true);
  for(const mutate of [r=>r.result.display.cases.pop(),r=>r.result.display.cases[0].http.asset.sha256='0'.repeat(64),
    r=>r.events[0].cleanup[0].succeeded=false,r=>r.reference.sources[0].workingSha256='0'.repeat(64),r=>r.harness.pop(),r=>r.plugin.trackedStatus='M source',
    r=>{r.result.display.cases[0].boundaries.json={accepted:false,sql:SQL.json,bindings:['MODEL'],error:{code:'57014',message:'model timeout'}};},
    r=>{const row=r.result.display.numericLiterals[0];row.boundaries.json={accepted:false,bindings:[row.raw],error:{code:'ECONNRESET'}};}]){
    const bad=structuredClone(report);mutate(bad);assert.throws(()=>check(bad));
  }
});
test('CI candidate is manual-only, immutable PG16.15 and two bounded profiles; no production code imports',()=>{
  const w=readFileSync(new URL('../../../.github/workflows/json-display-oracle.yml',import.meta.url),'utf8');
  assert.match(w,/workflow_dispatch:/);assert.doesNotMatch(w,/pull_request:|push:/);assert.match(w,/--cpus 2 --memory 1g --memory-swap 1g/);
  assert.match(w,/cbf42f0edc946c0bc1b8eeed62403734e1f25dc67a3491455d07a92fdb558b28/);
  assert.match(w,/profile: \[original-lifecycle, portable-safe-image\]/);
});
