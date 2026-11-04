// Inert controlled progress and closure tests; no PostgreSQL execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {characterizeSdk50} from './sdk50-outcomes.mjs';
import {originalSchemaList} from '../../../tests/fixtures/schema-list-original.mjs';
function fixture({wrongTimeout=false,failSetup}={}){
 const released=[],events=[];let begin=0;
 const db={async query(sql,values){events.push({sql,values});if(values?.includes('positive'))throw Object.assign(new Error('integer out of range'),{code:'22003'});return {rows:sql.startsWith('SELECT COUNT')?[{counter:'4'}]:[{schema_name:'missing'}],rowCount:1};},
  async begin(){const role=begin++===0?'locker':'reader';return {async query(sql,values){events.push({role,sql,values});if(failSetup===role&&(sql.startsWith('LOCK TABLE')||sql.startsWith('SET LOCAL')))throw Object.assign(new Error('setup failed'),{code:'XX002'});if(sql.trimStart().startsWith('SELECT')||sql.trimStart().startsWith('WITH'))throw Object.assign(new Error('canceling statement due to statement timeout'),{code:wrongTimeout?'XX000':'57014'});return {rows:[],rowCount:null};},release(){released.push(role);}};}};
 const original=({rows})=>({async response(params,_body,count){try{const sql=count?'SELECT COUNT(*)':'SELECT original';const result=await rows(sql,params.schema_name?[params.schema_name]:[]);return {status:200,body:{success:true,data:count?result.rows[0].counter:result.rows}};}
  catch(e){return {status:e.message.includes('statement timeout')?408:500,body:{success:false}};}}});
 return {db,original,released,events};
}
test('outcomes and both rollback releases are retained before validation',async()=>{
 const f=fixture(),states=[];const result=await characterizeSdk50(f.db,f.original,x=>states.push(structuredClone(x)));
 assert.equal(result.status,'passed');assert.deepEqual(result.operations.map(x=>x.name),['selected-overflow','off-page-overflow','count-overflow','statement-timeout']);
 assert.equal(result.operations[0].dbError.code,'22003');assert.equal(result.operations[3].dbError.code,'57014');
 assert.deepEqual(f.released,['reader','locker']);const prior=states.find(x=>x.status==='observed');assert.equal(prior.operations.length,4);assert.equal(prior.cleanup.length,2);
 assert.ok(f.events.some(x=>x.sql==='LOCK TABLE atomicassets_asset_counts IN ACCESS EXCLUSIVE MODE'));
});
test('wrong database terminal remains observed and failed after closure',async()=>{
 const f=fixture({wrongTimeout:true}),states=[];await assert.rejects(characterizeSdk50(f.db,f.original,x=>states.push(structuredClone(x))));
 const last=states.at(-1);assert.equal(last.status,'failed');assert.equal(last.operations[3].dbError.code,'XX000');assert.deepEqual(f.released,['reader','locker']);
});
test('locker or reader setup failures retain failed evidence and close every acquired transaction',async()=>{
 for(const role of ['locker','reader']){const f=fixture({failSetup:role}),states=[];
  await assert.rejects(characterizeSdk50(f.db,f.original,x=>states.push(structuredClone(x))));const last=states.at(-1);
  assert.equal(last.status,'failed');assert.equal(last.setup.at(-1).role,role);assert.equal(last.setup.at(-1).terminal,'error');assert.equal(last.setup.at(-1).error.code,'XX002');
  const expected=role==='locker'?['locker']:['reader','locker'];assert.deepEqual(f.released,expected);
  assert.deepEqual(last.cleanup,expected.map(role=>({role,rollback:true,released:true})));
 }
});
test('pinned original schema handler and wrapper pass captured SQL and error outcomes to the port',async()=>{
 const f=fixture();f.db.query=async(sql,values)=>{
  if(sql.startsWith('SELECT COUNT'))return {rows:[{counter:'4'}],rowCount:1};
  throw Object.assign(new Error('integer out of range'),{code:'22003'});
 };
 const result=await characterizeSdk50(f.db,originalSchemaList);
 assert.equal(result.status,'passed');assert.match(result.operations[0].sql,/SUM\(assets\)::INT/);
 assert.equal(result.operations[0].http.status,500);assert.equal(result.operations[1].dbError.code,'22003');
 assert.match(result.operations[2].sql,/SELECT COUNT\(\*\)/);assert.equal(result.operations[3].http.status,408);
});
