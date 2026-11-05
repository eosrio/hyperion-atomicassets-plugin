'use strict';
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {createHash}=require('node:crypto');
const {cases,numericLiterals}=require('./json-display-oracle.cjs');
const profiles=require('../lifecycle-input.cjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
function check(report) {
  assert.equal(report.status,'passed');assert.equal(report.qualified,false);assert.ok(report.completedAt);
  assert.equal(report.deadlineExceeded,undefined);assert.equal(report.cleanupIncomplete,undefined);
  assert.equal(report.reference.commit,'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');
  profiles.validateInputProfile(report.inputProfile);assert.deepEqual(report.result.inputProfile,report.inputProfile);
  assert.match(report.runtime.version,/^v(?:24|26)\./);assert.match(report.runtime.executableSha256,/^[a-f0-9]{64}$/);
  assert.match(report.fixture.containerId,/^[a-f0-9]{64}$/);
  assert.match(report.plugin.head,/^[a-f0-9]{40}$/);assert.match(report.plugin.tree,/^[a-f0-9]{40}$/);assert.equal(report.plugin.trackedStatus,'');
  if(process.env.GITHUB_SHA)assert.equal(report.plugin.head,process.env.GITHUB_SHA);
  const names=['json-display-ci.mjs','json-display-oracle.cjs','json-display-lifecycle.mjs','json-display-gate.cjs','scenario.cjs','query-observer.cjs','schema.cjs','source.mjs','schema-list-ci-admission.mjs','image-identity.mjs','fixture-pin.json','postgres-16.15-linux-amd64.manifest.json','postgres-16.15-linux-amd64.config.json','../json-vectors.cjs','../lifecycle-input.cjs'];
  assert.deepEqual(report.harness.map(x=>x.path),names);
  for(const row of report.harness){const b=readFileSync(require('node:path').join(__dirname,row.path));assert.equal(row.bytes,b.length);assert.equal(row.sha256,sha(b));}
  const inventory=JSON.parse(readFileSync(require('node:path').join(__dirname,'../../../docs/parity/atomicassets/postgres-oracle-sources.json'))).originalSources;
  assert.equal(report.reference.sources.length,inventory.length);
  for(let i=0;i<inventory.length;i++){const a=report.reference.sources[i],e=inventory[i];assert.equal(a.path,e.path);assert.equal(a.gitSha256,e.sha256);assert.equal(a.workingSha256,e.sha256);assert.equal(a.workingBytes,e.bytes);}
  assert.equal(report.admission.version,'16.15');assert.equal(report.admission.emptyObjects,true);
  assert.equal(report.cleanup.length,1);assert.deepEqual(report.cleanup[0],{name:'originalConnection',attempted:true,succeeded:true});
  assert.deepEqual(report.connectionAcquisition,{attempted:true,returned:true});assert.equal(report.persistenceError,undefined);
  const close=report.events.filter(e=>e.kind==='json39-original-cleanup');assert.equal(close.length,1);
  assert.equal(close[0].cleanup.length,7);assert.ok(close[0].cleanup.every(r=>r.attempted&&r.succeeded));
  assert.deepEqual(close[0].cleanup.map(r=>r.name),['listener-0','listener-1','listener-2','listener-3','http','server-database','scenario-client']);
  assert.deepEqual(close[0].listenerVerification,{attempted:true,succeeded:true});assert.equal(close[0].setupCleanup.releaseSucceeded,true);
  assert.deepEqual(close[0].setupCleanup.secondary,[]);assert.equal(close[0].recordError,undefined);
  assert.ok(close[0].acquisitions.length>0&&close[0].acquisitions.every(r=>r.returned&&!r.error));
  assert.deepEqual(close[0].cleanup.find(r=>r.name==='http').steps,[{name:'connections',attempted:true,succeeded:true},{name:'socket-server',attempted:true,succeeded:true}]);
  const result=report.result.display;assert.equal(result.kind,'original-json-display-capture');assert.equal(result.originalVectors,21);assert.equal(result.rotations,3);
  const plans=cases();assert.equal(result.cases.length,63);
  result.cases.forEach((row,i)=>{
    const plan=plans[i];for(const k of ['name','rotation','rawInput','negativeZeroPaths','sourceVectorSha256'])assert.deepEqual(row[k],plan[k]);
    assert.equal(row.encodedBytes,Buffer.byteLength(row.encoded));assert.equal(row.encodedSha256,sha(row.encoded));
    assert.deepEqual(row.restore,{attempted:true,succeeded:true});assert.equal(row.failure,undefined);assert.equal(row.completionRecordError,undefined);
    const outcome=r=>{assert.equal(typeof r.accepted,'boolean');assert.equal(typeof r.sql,'string');assert.ok(Array.isArray(r.bindings));
      if(r.accepted){assert.ok(Array.isArray(r.rows));assert.equal(r.error,undefined);}else{assert.equal(typeof r.error.message,'string');assert.match(r.error.code??'',/^22[A-Z0-9]{3}$/,'Only observed SQL data exceptions are input outcomes; transport/timeout/setup errors fail the gate');assert.equal(r.rows,undefined);}};
    for(const k of ['json','jsonb','unencodedJsonbArray'])outcome(row.boundaries[k]);
    for(const r of row.boundaries.scalar)outcome(r);
    outcome(row.storage);assert.equal(row.storage.accepted,row.boundaries.jsonb.accepted);
    if(row.storage.accepted){
      for(const k of ['collection','asset']){
        assert.equal(row.views[k].length,1);assert.equal(typeof row.views[k][0].raw_json,'string');
        const h=row.http[k];assert.ok(Number.isInteger(h.status)&&h.status>=100&&h.status<=599);
        assert.equal(h.bytes,Buffer.byteLength(h.rawText));assert.ok(h.bytes<=2097152);assert.equal(h.sha256,sha(h.rawText));
      }
    }else{assert.equal(row.rejectedWriteLeftBaseline,true);assert.equal(row.http,undefined);assert.equal(row.views,undefined);}
  });
  assert.equal(result.numericLiterals.length,3);
  result.numericLiterals.forEach((row,i)=>{assert.equal(row.kind,'native-SQL-literal-not-original-encoder');assert.equal(row.raw,numericLiterals[i]);
    for(const name of ['json','jsonb']){const r=row.boundaries[name];assert.equal(typeof r.accepted,'boolean');assert.deepEqual(r.bindings,[row.raw]);
      if(r.accepted)assert.ok(Array.isArray(r.rows));else assert.match(r.error.code??'',/^22[A-Z0-9]{3}$/);}});
  return {captureComplete:true,originalVectors:21,observedCases:63,physicalServiceRetirementNotImplied:true,parityQualified:false};
}
module.exports={check};
if(require.main===module)console.log(JSON.stringify(check(JSON.parse(readFileSync(process.argv[2])))));
