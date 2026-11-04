import test from 'node:test';
import assert from 'node:assert/strict';
import {templatePostgresOracle,vectors} from './royalty-template-oracle.mjs';
test('finite characterization sends original SQL to supplied port and retains actual error and wrapper response',async()=>{
 const calls=[];const db={async query(sql,values){calls.push({sql,values});if(sql.includes('current_setting'))return {rows:[{server_version:'modeled'}]};
  if(sql.startsWith('INSERT'))return {rows:[]};if(sql.startsWith('SELECT template_id::text'))return {rows:['-2','0','1','2','10','9223372036854775807'].map(template_id=>({template_id}))};if(values?.includes('9223372036854775808')){const e=new Error('modeled cast failure');e.code='22003';throw e;}if(sql.startsWith('SELECT * FROM atomicmarket_royalties_templates')){const ids=Array.isArray(values[2])?['1','2']:values[2]==='1'?['1']:values[2]===2?['1','2']:['-2','0','1','2','10','9223372036854775807'];return {rows:ids.map(template_id=>({template_id}))};}return {rows:[]};}};
 const result=await templatePostgresOracle(db);assert.equal(result.results.length,vectors.length);
 const invalid=result.results.find(x=>x.name==='invalid-before-sql');assert.equal(invalid.sql,null);assert.equal(invalid.http.status,400);
 const overflow=result.results.find(x=>x.name==='overflow-one');assert.equal(overflow.dbError.code,'22003');assert.equal(overflow.http.status,500);
 assert.match(result.results.find(x=>x.name==='null-eleven').sql,/::TEXT\[\]/);assert.equal(calls.filter(x=>x.sql.startsWith('INSERT')).length,6);
});
