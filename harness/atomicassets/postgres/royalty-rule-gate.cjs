'use strict';
const assert=require('node:assert/strict');const {createHash}=require('node:crypto');const {steps,cases}=require('./royalty-rule-plan.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
function check(report){assert.equal(report.status,'passed');assert.equal(report.qualified,false);assert.equal(report.reference.commit,'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');
 const fs=require('node:fs'),path=require('node:path');const names=['royalty-rule-ci.mjs','royalty-rule-README.md','royalty-rule-extra-pins.json','royalty-rule-plan.cjs','royalty-rule-scenario.cjs','royalty-rule-gate.cjs','royalty-rule-source.test.mjs','source.mjs','schema.cjs','schema-list-ci-admission.mjs','image-identity.mjs','json-display-lifecycle.mjs','../../../.github/workflows/royalty-rule-pg-oracle-v1.yml','../../../tests/fixtures/royalty-rule-original-2.7/manifest.json'];
 assert.deepEqual(report.harness.map(x=>x.path),names);for(const row of report.harness){const b=fs.readFileSync(path.join(__dirname,row.path));assert.equal(row.bytes,b.length);assert.equal(row.sha256,hash(b));}
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../../../tests/fixtures/royalty-rule-original-2.7/manifest.json')));assert.deepEqual(report.royaltySources,Object.values(manifest.sources).map(x=>({path:x.path,bytes:x.bytes,sha256:x.sha256})));assert.deepEqual(report.namespaceSources,JSON.parse(fs.readFileSync(path.join(__dirname,'royalty-rule-extra-pins.json'))).sources);
 assert.match(report.plugin.head,/^[a-f0-9]{40}$/);assert.match(report.plugin.tree,/^[a-f0-9]{40}$/);assert.equal(report.plugin.trackedStatus,'');if(process.env.AA_EXPECTED_HEAD)assert.equal(report.plugin.head,process.env.AA_EXPECTED_HEAD);assert.match(report.runtime.node,/^v(?:24|26)\./);assert.match(report.runtime.sha256,/^[a-f0-9]{64}$/);assert.match(report.fixture.containerId,/^[a-f0-9]{64}$/);assert.equal(report.admission.version,'16.15');
 assert.equal(report.cleanup.length,1);assert.deepEqual(report.cleanup[0],{name:'originalConnection',attempted:true,succeeded:true});assert.equal(report.deadlineExceeded,undefined);
 const r=report.result;assert.equal(r.kind,'original-royalty-rule-pg-capture');assert.deepEqual(r.stages.map(x=>x.name),steps.map(x=>x.name));assert.equal(r.responses.length,cases.length);
 assert.deepEqual(r.cleanup.map(x=>x.name),['listeners','http','server-database','scenario-client']);assert(r.cleanup.every(x=>x.attempted&&x.succeeded));
 const unpack=(stage,key)=>stage[key].rows.map(x=>JSON.parse(x.raw_json)), stages=r.stages;
 for(const key of ['templates','attributes']){const expected=key==='templates'?[12,12,11,12]:[2,2,1,2];assert.deepEqual(stages.map(x=>x[key].rows.length),expected);for(const stage of stages){assert.deepEqual(stage[key].bindings,['atomicmarket','oracle']);assert(stage[key].sql.includes(key==='templates'?'atomicmarket_royalties_templates':'atomicmarket_royalties_attributes'));}const ins=unpack(stages[0],key).find(x=>x.key_text==='1'),upd=unpack(stages[1],key).find(x=>x.key_text==='1'),del=unpack(stages[2],key),again=unpack(stages[3],key).find(x=>x.key_text==='1');assert(ins&&upd&&again);assert.equal(ins.created_text,'1');assert.equal(upd.created_text,'1');assert.equal(upd.updated_text,'2');assert(!del.some(x=>x.key_text==='1'));assert.equal(again.created_text,'4');}
 const attrs=unpack(stages[0],'attributes');assert.equal(attrs.find(x=>x.key_text==='1').weight_text,'9223372036854775807');assert.equal(attrs.find(x=>x.key_text==='2').weight_text,'-9223372036854775808');assert(attrs.every(x=>x.source===0&&x.lookup_hex==='ab'.repeat(32)));
 for(let i=0;i<cases.length;i++){const a=r.responses[i],p=cases[i];assert.equal(a.name,p.name);assert.equal(a.route,p.route);assert.deepEqual(a.query,p.query);assert.deepEqual(a.body,p.body);assert.equal(a.method??'GET',p.method??'GET');assert.equal(a.bytes,Buffer.byteLength(a.rawText));assert.equal(a.sha256,hash(a.rawText));assert(a.bytes<=2097152);if(a.method==='HEAD')assert.equal(a.rawText,'');else{const body=JSON.parse(a.rawText);assert.equal(typeof body.success,'boolean');}if(p.name.endsWith('invalid'))assert.equal(a.status,400);else assert.equal(a.status,200);}
 for(const stage of steps)for(const table of ['templates','attributes'])assert(r.callbackQueries.some(q=>q.stage===stage.name&&q.sql.includes('atomicmarket_royalties_'+table)),'Missing original callback SQL');
 for(const row of r.callbackQueries){assert.equal(typeof row.sql,'string');assert(Array.isArray(row.bindings));assert.equal(row.error,undefined);}
 for(const row of r.handlerQueries){assert.equal(typeof row.sql,'string');assert(Array.isArray(row.bindings));if(row.error)assert.match(row.error.code??'',/^22[A-Z0-9]{3}$/);}
 for(const p of cases.filter(x=>!x.name.endsWith('invalid')))assert(r.handlerQueries.some(q=>q.case===p.name&&q.sql.includes('atomicmarket_royalties_')),'Missing original handler query '+p.name);
 return {captureComplete:true,qualified:false};}
module.exports={check};if(require.main===module)console.log(JSON.stringify(check(JSON.parse(require('node:fs').readFileSync(process.argv[2])))));






\n