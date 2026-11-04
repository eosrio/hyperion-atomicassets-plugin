import test from 'node:test';
import assert from 'node:assert/strict';
import {templatePostgresOracle,vectors} from './royalty-template-oracle.mjs';
function model({badPhysical=false,badBoundary=0}={}){
 const calls=[],all=['-2','0','1','2','10','9223372036854775807'];
 return {calls,async query(sql,values){
  calls.push({sql,values});
  if(sql.includes('current_setting'))return {rows:[{server_version:'modeled'}]};
  if(sql.startsWith('INSERT'))return {rows:[]};
  if(sql.startsWith('SELECT t.template_id::text')){
   assert.match(sql,/ORDER BY t\.template_id ASC/);
   return {rows:(badPhysical?['-2','0','1','10','2','9223372036854775807']:all).map(template_id=>({template_id}))};
  }
  if(values?.includes('9223372036854775808')){const e=new Error('modeled cast failure');e.code='22003';throw e;}
  if(sql.startsWith('SELECT * FROM atomicmarket_royalties_templates')){
   const ids=Array.isArray(values[2])?(values[2].length>2&&values[2].length!==badBoundary?['1','2','10']:['1','2']):values[2]==='1'?['1']:values[2]===2?['1','2']:all;
   return {rows:ids.map(template_id=>({template_id}))};
  }
  return {rows:[]};
 }};
}
test('finite characterization retains query results and enforces both membership boundaries',async()=>{
 const db=model();const result=await templatePostgresOracle(db);assert.equal(result.results.length,vectors.length);
 const invalid=result.results.find(x=>x.name==='invalid-before-sql');assert.equal(invalid.sql,null);assert.equal(invalid.http.status,400);
 const overflow=result.results.find(x=>x.name==='overflow-one');assert.equal(overflow.dbError.code,'22003');assert.equal(overflow.http.status,500);
 for(const name of ['ten','eleven'])assert.deepEqual(result.results.find(x=>x.name===name).http.body.data.map(x=>x.template_id),['1','2','10']);
 assert.match(result.results.find(x=>x.name==='null-eleven').sql,/::TEXT\[\]/);assert.equal(db.calls.filter(x=>x.sql.startsWith('INSERT')).length,6);
});
test('physical assertion failure retains metadata and observed rows',async()=>{
 const snapshots=[];
 await assert.rejects(templatePostgresOracle(model({badPhysical:true}),v=>snapshots.push(structuredClone(v))));
 assert.equal(snapshots.at(-1).metadata.server_version,'modeled');
 assert.deepEqual(snapshots.at(-1).physicalRows.map(x=>x.template_id),['-2','0','1','10','2','9223372036854775807']);
});
test('boundary assertion failure retains prior vectors and failing SQL, bindings and wrapper response',async()=>{
 for(const badBoundary of [10,11]){
  const snapshots=[];
  await assert.rejects(templatePostgresOracle(model({badBoundary}),v=>snapshots.push(structuredClone(v))));
  const last=snapshots.at(-1);assert.deepEqual(last.results.map(x=>x.name),badBoundary===10?['none','scalar','two','ten']:['none','scalar','two','ten','eleven']);
  const failed=last.results.at(-1);assert.match(failed.sql,/SELECT/);assert.equal(failed.bindings[2].length,badBoundary);
  assert.equal(failed.http.status,200);assert.deepEqual(failed.http.body.data.map(x=>x.template_id),['1','2']);
 }
});
