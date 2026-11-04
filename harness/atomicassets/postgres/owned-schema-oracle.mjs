// Original migrated PostgreSQL trigger and original 2.7 handler; no plugin or native adapter is exercised.
import assert from 'node:assert/strict';
const CONTRACT='atomicassets',COLLECTION='ownedoracle';
export async function ownedSchemaPostgresOracle(db,getCollectionSchemasAction,observe=()=>{}){
 const report={baseline:'0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e',status:'running',events:[],snapshots:[],
  scope:'original migrated PostgreSQL trigger and original handler; no plugin, Mongo, HTTP or recovery qualification'};
 const emit=()=>observe(report);emit();let client,rolledBack=false;
 async function run(label,sql,values=[]){const event={label,sql,bindings:values,status:'pending'};report.events.push(event);emit();
  try{const result=await client.query(sql,values);event.status='ok';event.rowCount=result.rowCount??null;event.rows=result.rows;emit();return result;}
  catch(error){event.status='error';event.error={code:String(error?.code??''),message:String(error?.message??error).slice(0,1024)};emit();throw error;}}
 async function snapshot(name,expectedNames,expectedCounts){
  const before=report.events.length,ctx={coreArgs:{atomicassets_account:CONTRACT},pathParams:{collection_name:COLLECTION},db:{query:(sql,values)=>run(name+':handler',sql,values)}};
  const names=await getCollectionSchemasAction({},ctx);
  const counts=(await run(name+':counts',`SELECT schema_name, COALESCE(SUM(owned),0)::text AS owned FROM atomicassets_asset_counts WHERE contract=$1 AND collection_name=$2 GROUP BY schema_name ORDER BY schema_name`,[CONTRACT,COLLECTION])).rows;
  const row={name,handlerRows:names,counts,eventStart:before,eventEnd:report.events.length};report.snapshots.push(row);emit();
  assert.deepEqual(names.map(x=>x.schema_name).sort(),expectedNames.slice().sort());assert.deepEqual(counts,expectedCounts.map(([schema_name,owned])=>({schema_name,owned})));
 }
 try{
  report.phase='begin';emit();client=await db.begin();report.phase='open';emit();
  const trigger=(await run('trigger-identity',`SELECT t.tgenabled, pg_get_triggerdef(t.oid) AS trigger_definition, pg_get_functiondef(t.tgfoid) AS function_definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='atomicassets_assets' AND t.tgname='update_atomicassets_asset_counts_tr' AND NOT t.tgisinternal`)).rows;
  assert.equal(trigger.length,1);assert.equal(trigger[0].tgenabled,'O');assert.match(trigger[0].trigger_definition,/\bAFTER\b/);
  for(const operation of ['INSERT','UPDATE','DELETE'])assert.match(trigger[0].trigger_definition,new RegExp('\\b'+operation+'\\b'));
  assert.match(trigger[0].function_definition,/update_atomicassets_asset_counts/);
  await run('collection',`INSERT INTO atomicassets_collections (contract,collection_name,author,allow_notify,authorized_accounts,notify_accounts,market_fee,data,created_at_block,created_at_time) VALUES ($1,$2,'author',true,ARRAY['author']::varchar[],ARRAY[]::varchar[],0,'{}',1,1)`,[CONTRACT,COLLECTION]);
  for(const name of ['alpha','beta','gamma','empty'])await run('schema:'+name,`INSERT INTO atomicassets_schemas (contract,collection_name,schema_name,format,types,created_at_block,created_at_time) VALUES ($1,$2,$3,ARRAY[]::jsonb[],ARRAY[]::jsonb[],1,1)`,[CONTRACT,COLLECTION,name]);
  await snapshot('empty',[],[]);
  for(const [id,schema,owner] of [['1','alpha','alice'],['2','alpha','bob'],['3','beta','carol'],['4','gamma',null]])
   await run('insert:'+id,`INSERT INTO atomicassets_assets (contract,asset_id,collection_name,schema_name,owner,transferred_at_block,transferred_at_time,updated_at_block,updated_at_time,minted_at_block,minted_at_time) VALUES ($1,$2,$3,$4,$5,1,1,1,1,1,1)`,[CONTRACT,id,COLLECTION,schema,owner]);
  await snapshot('insert',['alpha','beta'],[['alpha','2'],['beta','1'],['gamma','0']]);
  await run('transfer',`UPDATE atomicassets_assets SET owner=$1 WHERE contract=$2 AND asset_id=$3`,['dave',CONTRACT,'1']);
  await snapshot('transfer',['alpha','beta'],[['alpha','2'],['beta','1'],['gamma','0']]);
  await run('burn-one',`UPDATE atomicassets_assets SET owner=NULL WHERE contract=$1 AND asset_id=$2`,[CONTRACT,'1']);
  await snapshot('burn-one',['alpha','beta'],[['alpha','1'],['beta','1'],['gamma','0']]);
  await run('savepoint','SAVEPOINT before_last');
  await run('burn-last',`UPDATE atomicassets_assets SET owner=NULL WHERE contract=$1 AND asset_id=$2`,[CONTRACT,'2']);
  await snapshot('burn-last',['beta'],[['alpha','0'],['beta','1'],['gamma','0']]);
  await run('rollback-savepoint','ROLLBACK TO SAVEPOINT before_last');
  await snapshot('after-rollback',['alpha','beta'],[['alpha','1'],['beta','1'],['gamma','0']]);
  await run('delete-alpha',`DELETE FROM atomicassets_assets WHERE contract=$1 AND asset_id=$2`,[CONTRACT,'2']);
  await snapshot('delete-alpha',['beta'],[['alpha','0'],['beta','1'],['gamma','0']]);
  await run('delete-beta',`DELETE FROM atomicassets_assets WHERE contract=$1 AND asset_id=$2`,[CONTRACT,'3']);
  await snapshot('delete-beta',[],[['alpha','0'],['beta','0'],['gamma','0']]);
  await run('rollback-transaction','ROLLBACK');rolledBack=true;
 }catch(error){report.status='failed';report.error={code:String(error?.code??''),message:String(error?.message??error).slice(0,1024)};emit();throw error;}
 finally{if(client){if(!rolledBack){try{await run('cleanup-rollback','ROLLBACK');rolledBack=true;}catch(error){report.cleanupError=String(error?.message??error).slice(0,1024);emit();}}client.release();report.rollbackSucceeded=rolledBack;emit();}}
 report.status='passed';emit();
 return report;
}
