// Original source-pinned handler/wrapper against the already admitted isolated PostgreSQL service.
import assert from 'node:assert/strict';

export async function characterizeSdk50(db,originalSchemaList,observe=()=>{}) {
 const evidence={status:'running',scope:'original source VM and isolated PostgreSQL; no SDK/native/HTTP qualification',operations:[],setup:[],cleanup:[]};
 const emit=()=>observe(evidence);emit();
 async function setup(role,client,sql){const item={role,sql,bindings:[],terminal:'pending'};evidence.setup.push(item);emit();
  try{const result=await client.query(sql);item.terminal='returned';item.rowCount=result.rowCount??null;emit();}
  catch(e){item.terminal='error';item.error={code:String(e?.code??''),message:String(e?.message??e).slice(0,1024)};emit();throw e;}}
 async function query(name,params,port,countOnly=false){
  const row={name,params,sql:null,bindings:null,terminal:'pending',dbError:null,http:null};evidence.operations.push(row);emit();
  const original=originalSchemaList({rows:async(sql,values)=>{
   row.sql=sql;row.bindings=values;emit();
   try {const result=await port.query(sql,values);row.dbTerminal='returned';row.rowCount=result.rowCount??null;return result;}
   catch(e){row.dbTerminal='error';row.dbError={code:String(e?.code??''),message:String(e?.message??e).slice(0,1024)};throw e;}
  }});
  try {const response=await original.response(params,{},countOnly);row.http=response;row.terminal='returned';emit();return row;}
  catch(e){row.terminal='error';row.error={message:String(e?.message??e).slice(0,1024)};emit();throw e;}
 }
 let locker,reader;
 try {
  // Previous schema oracle creates a 2147483649 aggregate in colone/positive.
  const selected=await query('selected-overflow',{collection_name:'colone',schema_name:'positive'},db);
  const offpage=await query('off-page-overflow',{collection_name:'colone',sort:'schema_name',order:'asc',page:'1',limit:'1'},db);
  const count=await query('count-overflow',{collection_name:'colone'},db,true);
  // Capture a real server-side statement timeout while the unchanged handler query
  // waits on a lock held by a separate isolated transaction, then release both.
  locker=await db.begin();await setup('locker',locker,'LOCK TABLE atomicassets_asset_counts IN ACCESS EXCLUSIVE MODE');
  reader=await db.begin();await setup('reader',reader,"SET LOCAL statement_timeout = '100ms'");
  const timeout=await query('statement-timeout',{collection_name:'colone'},reader);
  await reader.query('ROLLBACK');reader.release();reader=null;evidence.cleanup.push({role:'reader',rollback:true,released:true});emit();
  await locker.query('ROLLBACK');locker.release();locker=null;evidence.cleanup.push({role:'locker',rollback:true,released:true});emit();
  // Persist every original outcome and both closure records before any assertion.
  evidence.status='observed';emit();
  assert.equal(selected.http.status,500);assert.equal(selected.dbError?.code,'22003');
  assert.ok([200,500].includes(offpage.http.status));
  if(offpage.http.status===500)assert.equal(offpage.dbError?.code,'22003');
  else {assert.equal(offpage.dbError,null);assert.equal(offpage.http.body.data.length,1);assert.notEqual(offpage.http.body.data[0].schema_name,'positive');}
  assert.equal(count.http.status,200);assert.equal(count.http.body.data,'4');
  assert.equal(timeout.dbError?.code,'57014');assert.equal(timeout.http.status,408);
  evidence.status='passed';emit();return evidence;
 } catch(e){evidence.status='failed';evidence.error={message:String(e?.message??e).slice(0,1024)};emit();throw e;}
 finally {for(const [role,client] of [['reader',reader],['locker',locker]])if(client){
  const row={role,rollback:false,released:false};try{await client.query('ROLLBACK');row.rollback=true;}catch(e){row.error=String(e?.message??e).slice(0,1024);}
  try{client.release();row.released=true;}catch(e){row.releaseError=String(e?.message??e).slice(0,1024);}evidence.cleanup.push(row);emit();
 }}
}
