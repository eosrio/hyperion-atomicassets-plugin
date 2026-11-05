import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyCorpus} from '../jsonb-display-mongo-http/corpus.mjs';
import {schemaExpectations} from './schema-oracle.mjs';
const plans=await classifyCorpus();
function model() {
  const cases=plans.map(p=>{const row={name:p.name,rotation:p.rotation,rawInput:p.rawInput,encoded:p.codecAttempt?.originalEncoded,storage:{accepted:p.originalSqlAccepted},sourceFrontier:{sourceRepresentable:p.sourceRepresentable}};
    if(p.originalSqlAccepted){const collection={name:'MODEL',img:null,images:'MODEL'};row.views={schema:[{raw_json:JSON.stringify({collection})}]};row.http={schema:{status:200,rawText:JSON.stringify({success:true,data:{collection}})}};}
    else row.storage.error={code:'22P02'};return row;});
  return Array.from({length:4},()=>({report:{result:{display:{cases:structuredClone(cases)}}}}));
}
test('schema comparison consumes four original same-input rows and refuses divergence',()=>{
  const a=model(),result=schemaExpectations(a,plans);assert.equal(result.length,63);assert.deepEqual(result[0],{name:'MODEL',img:null,images:'MODEL'});
  const mutations=[r=>r.pop(),r=>r[0].report.result.display.cases[0].name='other',r=>r[0].report.result.display.cases[0].rawInput='wrong',
    r=>r[0].report.result.display.cases[0].sourceFrontier.sourceRepresentable=false,r=>r[0].report.result.display.cases[0].encoded='wrong',
    r=>r[0].report.result.display.cases[0].http.schema.status=503,r=>r[0].report.result.display.cases[0].views.schema[0].raw_json='{}',
    r=>r[0].report.result.display.cases[0].http.schema.rawText=JSON.stringify({success:true,data:{collection:{name:'bad'}}})];
  for(const mutate of mutations){const bad=structuredClone(a);mutate(bad);assert.throws(()=>schemaExpectations(bad,plans));}
});
test('four current original report pins and schema-only workload are explicit',()=>{
 const pins=JSON.parse(readFileSync(new URL('./schema-report-pins.json',import.meta.url)));assert.equal(pins.run,41992627221);assert.equal(pins.head,'fec2bc877be9869e1ddd8b18ab4d8628515e8790');assert.equal(pins.artifacts.length,4);assert.equal(new Set(pins.artifacts.map(x=>x.id)).size,4);
 const source=readFileSync(new URL('./workload.mjs',import.meta.url),'utf8');assert(source.includes('/atomicassets/v1/schemas/'));assert(!source.includes('/atomicassets/v1/collections/'));assert(!source.includes('/atomicassets/v1/assets/'));assert(source.includes('expectations[plan.index]'));assert(source.includes('recorder.assertComplete()'));assert(source.includes('cleanupOwnedDatabase'));
 const workflow=readFileSync(new URL('../../../.github/workflows/schema-id-mongo-v1.yml',import.meta.url),'utf8');assert(workflow.includes('branches: ["main"]'));assert(!workflow.includes('paths:'));assert(workflow.includes("node: ['24.22.1', '26.4.0']"));assert(workflow.includes('schema-id-mongo-v1/ci.mjs'));
});
import {extractReport} from './reports.mjs';
import {posix} from 'node:path';
function zip(name='schema-id-json39-oracle-v1.json',mode=0x8000){const n=Buffer.from(name),data=Buffer.from('{"ok":true}'),local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(n.length,26);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);central.writeUInt32LE(0x02014b50);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(n.length,28);central.writeUInt32LE((mode<<16)>>>0,38);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+n.length,12);end.writeUInt32LE(local.length+n.length+data.length,16);return Buffer.concat([local,n,data,central,n,end]);}
test('schema archive reader admits one exact bounded regular member',()=>{assert.equal(extractReport(zip(),11).toString(),'{"ok":true}');assert.throws(()=>extractReport(zip('../schema-id-json39-oracle-v1.json'),11));assert.throws(()=>extractReport(zip('schema-id-json39-oracle-v1.json',0xa000),11));assert.throws(()=>extractReport(zip(),12));});
test('actual schema staging verifies all four hashes before writing any report',async()=>{
 const source=readFileSync(new URL('./reports.mjs',import.meta.url),'utf8'),start=source.indexOf('export async function stageOriginalReports('),end=source.indexOf('\nexport async function verifySchemaReports',start),pins=JSON.parse(readFileSync(new URL('./schema-report-pins.json',import.meta.url)));
 for(const bad of [false,true]){let count=0;const effects=[],hashes=new Map(),raws=new Map();
  const download=async()=>{const pin=pins.artifacts[count++],bytes=Buffer.alloc(pin.size,1),raw=Buffer.from(JSON.stringify({plugin:{head:pins.head,tree:pins.tree}}));hashes.set(bytes,bad&&count===3?'bad':pin.sha256);hashes.set(raw,pin.reportSha256);raws.set(bytes,raw);effects.push('download');return {bytes,chain:[]};};
  const body=source.slice(start,end).replace('export ','').replaceAll('import.meta.url',"'file:///inert/reports.mjs'");
  const run=new Function('assert','process','readFile','download','extractReport','hash','mkdir','writeFile','join',body+'\nreturn stageOriginalReports;')(assert,{platform:'linux'},async()=>JSON.stringify(pins),download,b=>raws.get(b),b=>hashes.get(b),async()=>effects.push('mkdir'),async()=>effects.push('write'),posix.join);
  const call=run({output:'/owned',guard(){},persist:async()=>effects.push('persist')});if(bad){await assert.rejects(call);assert(!effects.includes('mkdir'));}else{assert.equal((await call).length,4);assert.equal(effects.filter(x=>x==='write').length,4);assert.equal(effects.filter(x=>x==='persist').length,4);assert(effects.indexOf('mkdir')>effects.lastIndexOf('download'));}
 }
});
test('new controller keeps prior physical supervisor, recorder and limits intact',()=>{
 const current=readFileSync(new URL('./ci.mjs',import.meta.url),'utf8'),prior=readFileSync(new URL('../jsonb-display-bson-v3/ci.mjs',import.meta.url),'utf8');
 const part=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
 assert.equal(part(current,'async function waitForOwnedReadiness(', '\nasync function supervisedChild('),part(prior,'async function waitForOwnedReadiness(', '\nasync function supervisedChild('));
 assert.equal(part(current,'async function supervisedChild(', '\nexport async function runCI(').replace('schema-id-mongo-v1/child.mjs','jsonb-display-bson-v3/child.mjs'),part(prior,'async function supervisedChild(', '\nexport async function runCI('));
 assert(current.indexOf('schemaExpectations(originalSchema,await classifyCorpus())')<current.indexOf('new OwnedMongoFixture()'));
 assert(current.includes("'../jsonb-display-bson-v3/guard.mjs'"));assert(current.includes("'../jsonb-display-bson-v3/contract.mjs'"));
});
