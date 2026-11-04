// Executed only by the existing admitted Linux CI service; no lifecycle or process management.
import assert from 'node:assert/strict';
import {originalRules,manifest} from '../../../tests/fixtures/royalty-rule-original.mjs';

export const vectors=[
 ['none',{}],['scalar',{template_id:'1'}],['two',{template_id:'1,2'}],
 ['ten',{template_id:'1,2,3,4,5,6,7,8,9,10'}],['eleven',{template_id:'1,2,3,4,5,6,7,8,9,10,11'}],
 ['weak',{template_id:'001,-2,-0'}],['duplicates',{template_id:'1,1,2'}],['null-one',{template_id:'NULL'}],
 ['null-two',{template_id:'null,1'}],['null-eleven',{template_id:'null,2,3,4,5,6,7,8,9,10,11'}],
 ['overflow-one',{template_id:'9223372036854775808'}],['overflow-two',{template_id:'1,9223372036854775808'}],
 ['overflow-eleven',{template_id:'1,2,3,4,5,6,7,8,9,10,9223372036854775808'}],
 ['safe-offset',{page:'2',limit:'2'}],['unsafe-offset',{page:'9007199254740991',limit:'100'}],
 ['invalid-before-sql',{template_id:'+1',page:'0'}],['ignored',{count:'true',sort:'bad',order:'bad',lower_bound:'bad',upper_bound:'bad'}]
];
export async function templatePostgresOracle(db,observe=()=>{}){
 assert.equal(manifest.baseline,'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e');
 const metadata=(await db.query(`SELECT current_setting('server_version') AS server_version, current_setting('server_encoding') AS server_encoding, d.datcollate, d.datctype, d.datlocprovider, d.datcollversion, pg_database_collation_actual_version(d.oid) AS actual_collation_version FROM pg_database d WHERE d.datname=current_database()`)).rows[0];
 const results=[],evidence={baseline:manifest.baseline,metadata,physicalRows:[],results,scope:'Original source VM and constructed PostgreSQL table; no Mongo, native listener, cache or full parity'};
 observe(evidence);
 for(const id of ['-2','0','1','2','10','9223372036854775807']) await db.query(`INSERT INTO atomicmarket_royalties_templates (market_contract,collection_name,template_id,recipients,updated_at_block,updated_at_time,created_at_block,created_at_time) VALUES ('atomicmarket','oracle',$1,'[]',1,1,1,1)`,[id]);
 const physical=await db.query("SELECT t.template_id::text AS template_id FROM atomicmarket_royalties_templates AS t WHERE t.market_contract='atomicmarket' AND t.collection_name='oracle' ORDER BY t.template_id ASC");
 evidence.physicalRows=physical.rows;observe(evidence);
 assert.deepEqual(physical.rows.map(row=>row.template_id),['-2','0','1','2','10','9223372036854775807']);
 for(const [name,query] of vectors){
  let dbError=null;const o=originalRules('atomicmarket',{queryPort:async(sql,values)=>{try{return await db.query(sql,values);}catch(e){dbError={code:String(e.code??''),message:String(e.message??'').slice(0,1024)};throw e;}}});
  try {const response=await o.response('oracle',{route:'templates',query});const body={...response.body};delete body.query_time;
   results.push({name,query,sql:o.calls[0]?.sql??null,bindings:o.calls[0]?.values??null,dbError,http:{status:response.status,body}});observe(evidence);
   assert.ok(o.calls.length<=1);if(name==='invalid-before-sql'){assert.equal(o.calls.length,0);assert.equal(response.status,400);}
   else assert.equal(o.calls.length,1);
   const expected={none:['-2','0','1','2','10','9223372036854775807'],scalar:['1'],two:['1','2'],ten:['1','2','10'],eleven:['1','2','10'],'safe-offset':['1','2']};
   if(expected[name]){assert.equal(response.status,200);assert.deepEqual(body.data.map(row=>String(row.template_id)),expected[name]);}
   if(name==='overflow-one'){assert.equal(dbError?.code,'22003');assert.equal(response.status,500);}
  } finally{o.close();}
 }
 return evidence;
}
